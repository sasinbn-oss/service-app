#!/bin/bash
# ทดสอบ: อะไหล่ส่งให้ลูกค้าแล้ว (เจ้าของงานขอ พ.ย. 69 — "การเบิกอะไหล่ของ admin ที่เลือกคลัง 94 เพิ่มปุ่มว่าอะไหล่ส่งให้ลูกค้าแล้ว")
#   · parts-check { results[].sentToCustomer } เก็บทีละชิ้น (WorkOrderPart.sentToCustomerAt) · ใบผสม: ชิ้นหนึ่งส่งแล้ว อีกชิ้นรับที่คลัง
#   · ไม่ส่งค่า = รับที่คลัง (แอปรุ่นก่อน) · เลขใบเบิกยังบังคับเหมือนเดิม · ขั้นถัดไปเหมือนไม่เลือก ("ไปต่อตามขั้นตอนเลย")
#   · ปฏิเสธ 400 ฐานข้อมูลไม่เปลี่ยน: ชิ้นคลังอื่น · ชิ้นที่หมด · ขั้นอื่น (หัวหน้าภาคเบิกคลังอื่น · แอดมินเช็คอะไหล่)
#   · ของที่โอนมาถึงคลัง 94 แล้วแอดมินเบิกส่งมอบ เลือกได้เหมือนกัน
#   · ทางที่ล้างเลขใบเบิกล้างช่องนี้ด้วย: ย้อนไปขั้นเบิก · ย้อนไปเช็คอะไหล่ · ช่างขอชิ้นเดิมใหม่ — ย้อนไปขั้นนัด (เลขใบเบิกอยู่) ไม่ล้าง
#     ค่าก่อนย้อนอยู่ในประวัติ (rollbackPrefill) ให้ฟอร์มเบิกเติมให้แบบเลขใบเบิก
#   · ประวัติรายตัวต่อท้าย "· ส่งให้ลูกค้าแล้ว" · หน้าใบงานและสรุปคอนเฟิร์มลูกค้า (ข้อความจ่ายงานไลน์) ส่ง sentToCustomer
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
set -e
. "$(dirname "$0")/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001); S=$(login S001)
L94="คลังลาดพร้าว 94"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)

# ใบที่หัวหน้าภาคระบุอะไหล่แล้ว (เครื่อง W81 ทุกใบ — อะไหล่ตัวเดียวกันทุกใบ แบบ pickup-test) · $1… = ชนิด:จำนวน
mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบส่งให้ลูกค้าแล้ว"}]}' | J 'd.orders?d.orders[0].id:d.id') k p parts
  for k in "$@"; do
    p=$(fx_part "$id" "${k%%:*}") || return 1
    parts="$parts${parts:+,}{\"sparePartId\":$p,\"quantity\":${k##*:}}"
  done
  POST $S work-orders/$id/parts "{\"needsParts\":true,\"parts\":[$parts]}" >/dev/null
  echo $id
}
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
# ใบถึงขั้นเบิกแบบที่เกิดจริง: หัวหน้าภาคนัดแล้ว (ทีม + วัน + รอลูกค้าคอนเฟิร์ม) — ข้ามเช็คอะไหล่ ให้ทดสอบเฉพาะเรื่องเบิก
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
VISIT=$(node -e "console.log(new Date(Date.now()+7*3600e3+10*86400e3).toISOString().slice(0,10))")
toIssue() { DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"assignedTeam\"='$TEAM', \"scheduledAt\"='$VISIT', \"appointmentStatus\"='${2:-PENDING}' where id=$1" >/dev/null; }
# เลขใบเบิก|ส่งให้ลูกค้าแล้วไหม ของชิ้นนั้นในฐานข้อมูล
SENT() { DB "select coalesce(\"requisitionNo\",'-')||'|'||(\"sentToCustomerAt\" is not null) from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }
LOG() { DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
DETAIL() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)"; }
IN94() { echo "{\"sparePartId\":$1,\"inStock\":true,\"warehouse\":\"$L94\"$([ -n "$2" ] && echo ",\"requisitionNo\":\"$2\"")$([ -n "$3" ] && echo ",\"sentToCustomer\":$3")}"; }
# ข้อความปฏิเสธต้องบอกว่าเลือกได้เฉพาะของที่แอดมินเบิกจากคลัง 94
REFUSED() { echo "$1" | J 'd.error' | grep -q "ส่งให้ลูกค้าแล้ว" && echo "$1" | J 'd.error' | grep -q "$L94"; }

W1=$(mk BOARD:1 BELT:2); IDS="$W1"
BOARD=$(fx_part $W1 BOARD); BELT=$(fx_part $W1 BELT)
BOARD_CODE=$(fx_part_code $W1 BOARD); BELT_CODE=$(fx_part_code $W1 BELT)
toIssue $W1
[ "$(ST $W1)" = "PARTS_REQUESTED" ] || fail "เตรียมข้อมูล: ใบไม่อยู่ขั้นเบิก"

echo "═══ ปฏิเสธ: ชิ้นที่แอดมินไม่ได้เบิกจากคลัง 94"
R=$(POST $A work-orders/$W1/parts-check "{\"results\":[$(IN94 $BOARD RQ-S1 true),{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\",\"sentToCustomer\":true}]}")
REFUSED "$R" && [ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "PARTS_REQUESTED|-|false|-|false" ] \
  && pass "ชิ้นคลังภูเก็ต (หัวหน้าภาคเบิก) เลือกส่งให้ลูกค้าแล้ว: 400 ข้อความไทย ฐานข้อมูลไม่เปลี่ยนทั้งใบ" || fail "ชิ้นคลังอื่นเลือกได้: $R · $(ST $W1) $(SENT $W1 $BOARD) $(SENT $W1 $BELT)"
R=$(POST $A work-orders/$W1/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false,\"sentToCustomer\":true},$(IN94 $BELT RQ-S1)]}")
REFUSED "$R" && [ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "PARTS_REQUESTED|-|false|-|false" ] \
  && pass "ชิ้นที่หมดเลือกส่งให้ลูกค้าแล้ว: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "ชิ้นที่หมดเลือกได้: $R"
R=$(POST $A work-orders/$W1/parts-check "{\"results\":[$(IN94 $BOARD "" true),$(IN94 $BELT RQ-S1)]}")
echo "$R" | J 'd.error' | grep -q "ต้องใส่เลขใบเบิก" && [ "$(ST $W1)|$(SENT $W1 $BOARD)" = "PARTS_REQUESTED|-|false" ] \
  && pass "ส่งให้ลูกค้าแล้วยังต้องมีเลขใบเบิก (400 ข้อความเดิม) ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่มีเลขใบเบิกก็ผ่าน: $R"

echo "═══ ใบผสม: ชิ้นหนึ่งส่งให้ลูกค้าแล้ว อีกชิ้นรับที่คลัง"
POST $A work-orders/$W1/parts-check "{\"results\":[$(IN94 $BOARD RQ-S1 true),$(IN94 $BELT RQ-S1)]}" >/dev/null
[ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "AWAITING_CONFIRM|RQ-S1|true|RQ-S1|false" ] \
  && pass "เก็บทีละชิ้น: บอร์ดส่งให้ลูกค้าแล้ว · สายพานรับที่คลัง · ไปคอนเฟิร์มลูกค้าตามเดิม" || fail "ใบผสม: $(ST $W1) $(SENT $W1 $BOARD) $(SENT $W1 $BELT)"
[ "$(DB "select (\"sentToCustomerAt\" = \"checkedAt\")::text||'|'||u.\"employeeCode\" from \"WorkOrderPart\" p join \"User\" u on u.id=p.\"checkedById\" where p.\"workOrderId\"=$W1 and p.\"sparePartId\"=$BOARD and p.kind='WAITING'")" = "true|A001" ] \
  && pass "เวลาที่ส่งให้ลูกค้า = เวลาที่บันทึกเบิก · คนบันทึกอยู่ที่ checkedBy (A001)" || fail "เวลา/คนบันทึกไม่ตรง"
CHK=$(LOG $W1 PARTS_CHECKED)
echo "$CHK" | grep -qx "$BOARD_CODE ×1 · $L94 · ใบเบิก RQ-S1 — แอดมินเบิกแล้ว · ส่งให้ลูกค้าแล้ว" \
  && echo "$CHK" | grep -qx "$BELT_CODE ×2 · $L94 · ใบเบิก RQ-S1 — แอดมินเบิกแล้ว" \
  && pass "ประวัติรายตัว: ชิ้นที่ส่งต่อท้าย \"· ส่งให้ลูกค้าแล้ว\" · ชิ้นที่รับที่คลังเหมือนเดิม" || fail "ประวัติ: $CHK"
[ "$(DETAIL $W1 | J "d.waitingParts.map(p=>p.sparePartId===$BOARD?'B'+p.sentToCustomer:'L'+p.sentToCustomer).sort().join(',')")" = "Btrue,Lfalse" ] \
  && pass "หน้าใบงาน (GET /:id) ส่ง sentToCustomer รายชิ้น" || fail "หน้าใบงาน: $(DETAIL $W1 | J 'JSON.stringify(d.waitingParts.map(p=>p.sentToCustomer))')"
STOP=$(curl -s "localhost:4000/api/plans/day?date=$VISIT" -H "$(H $A)" | J "const l=d.lanes.find(x=>x.team==='$TEAM'); const s=l&&l.stops.find(s=>s.id===$W1); s?s.parts.slice().sort().join(','):'none'")
[ "$STOP" = "$(printf '%s\n' "$BOARD_CODE (ส่งให้ลูกค้าแล้ว)" "$BELT_CODE x2" | node -e 'console.log(require("fs").readFileSync(0,"utf8").trim().split("\n").sort().join(","))')" ] \
  && pass "บอร์ดแผนงาน: รหัสชิ้นที่ส่งต่อท้าย (ส่งให้ลูกค้าแล้ว) · ชิ้นที่รับที่คลังเหมือนเดิม" || fail "บอร์ดแผนงาน: $STOP"

echo "═══ ค่าตั้งต้น = รับที่คลัง · ขั้นถัดไปเหมือนไม่เลือก"
W2=$(mk BOARD:1 BELT:2); IDS="$IDS $W2"; toIssue $W2
POST $A work-orders/$W2/parts-check "{\"results\":[$(IN94 $BOARD RQ-D1),$(IN94 $BELT RQ-D1 false)]}" >/dev/null
[ "$(ST $W2)|$(SENT $W2 $BOARD)|$(SENT $W2 $BELT)" = "AWAITING_CONFIRM|RQ-D1|false|RQ-D1|false" ] \
  && pass "ไม่ส่งค่า / ส่ง false = รับที่คลัง · ขั้นถัดไปเหมือนใบที่เลือกส่งให้ลูกค้า (คอนเฟิร์มลูกค้า)" || fail "ค่าตั้งต้น: $(ST $W2) $(SENT $W2 $BOARD) $(SENT $W2 $BELT)"
W3=$(mk BOARD:1); IDS="$IDS $W3"; toIssue $W3 CONFIRMED
POST $A work-orders/$W3/parts-check "{\"results\":[$(IN94 $BOARD RQ-C1 true)]}" >/dev/null
[ "$(ST $W3)|$(SENT $W3 $BOARD)" = "ASSIGNED|RQ-C1|true" ] \
  && pass "ใบที่ลูกค้าคอนเฟิร์มไปแล้ว เลือกส่งให้ลูกค้าก็ไปปล่อยงานตามเดิม (afterIssue)" || fail "ใบคอนเฟิร์มแล้ว: $(ST $W3) $(SENT $W3 $BOARD)"
R=$(curl -s "localhost:4000/api/work-orders/reports/confirmed?date=$VISIT&by=visit" -H "$(H $A)")
[ "$(echo "$R" | J "const r=d.rows.find(x=>x.id===$W3);r?r.parts.map(p=>p.requisitionNo+'|'+p.sentToCustomer).join(','):'none'")" = "RQ-C1|true" ] \
  && pass "สรุปคอนเฟิร์มลูกค้า (ข้อความจ่ายงานไลน์) ส่ง sentToCustomer ของชิ้นนั้น" || fail "reports/confirmed: $(echo "$R" | J "JSON.stringify(d.rows.find(x=>x.id===$W3))" | head -c 300)"

echo "═══ ทางที่ล้างเลขใบเบิกล้างช่องนี้ด้วย"
POST $A work-orders/$W1/rollback '{"toStage":"PARTS_REQUESTED","reason":"ทดสอบ — เบิกใหม่"}' >/dev/null
[ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "PARTS_REQUESTED|-|false|-|false" ] \
  && pass "ย้อนไปขั้นเบิก: ล้างเลขใบเบิกและส่งให้ลูกค้าแล้วพร้อมกัน" || fail "ย้อนไปขั้นเบิก: $(SENT $W1 $BOARD) $(SENT $W1 $BELT)"
[ "$(DETAIL $W1 | J "(d.rollbackPrefill?.parts||[]).map(p=>(p.sparePartId===$BOARD?'B':'L')+p.requisitionNo+p.sentToCustomer).sort().join(',')")" = "BRQ-S1true,LRQ-S1false" ] \
  && pass "ค่าก่อนย้อน (rollbackPrefill) เก็บส่งให้ลูกค้าแล้วรายชิ้น — ฟอร์มเบิกเติมให้แบบเลขใบเบิก" || fail "rollbackPrefill: $(DETAIL $W1 | J 'JSON.stringify(d.rollbackPrefill)')"
POST $A work-orders/$W1/parts-check "{\"results\":[$(IN94 $BOARD RQ-S2),$(IN94 $BELT RQ-S2 true)]}" >/dev/null
[ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "AWAITING_CONFIRM|RQ-S2|false|RQ-S2|true" ] \
  && pass "เบิกรอบใหม่: ตามที่เลือกรอบนี้ ไม่ใช่ค่ารอบก่อนติดมา" || fail "เบิกรอบใหม่: $(SENT $W1 $BOARD) $(SENT $W1 $BELT)"
POST $A work-orders/$W1/reassess-parts "{\"reasonCode\":\"PARTS\",\"reason\":\"ทดสอบ — สายพานที่ส่งไปผิดรุ่น\",\"parts\":[{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
[ "$(ST $W1)|$(SENT $W1 $BOARD)|$(SENT $W1 $BELT)" = "NEW|RQ-S2|false|-|false" ] \
  && pass "ช่างขอชิ้นเดิมใหม่ (reassess-parts): ชิ้นนั้นล้างทั้งเลขใบเบิกและส่งให้ลูกค้าแล้ว · ชิ้นอื่นไม่แตะ" || fail "ขอชิ้นเดิมใหม่: $(ST $W1) $(SENT $W1 $BOARD) $(SENT $W1 $BELT)"
POST $A work-orders/$W3/rollback '{"toStage":"PARTS_CHECKED","reason":"ทดสอบ — ลูกค้าเปลี่ยนวัน"}' >/dev/null
[ "$(ST $W3)|$(SENT $W3 $BOARD)" = "PARTS_CHECKED|RQ-C1|true" ] \
  && pass "ย้อนไปขั้นนัดวัน (เลขใบเบิกไม่ถูกล้าง — ของไม่ได้กลับคลัง): ส่งให้ลูกค้าแล้วอยู่ต่อเหมือนเลขใบเบิก" || fail "ย้อนไปนัดวัน: $(ST $W3) $(SENT $W3 $BOARD)"
POST $A work-orders/$W3/rollback '{"toStage":"PARTS_SOURCING","reason":"ทดสอบ — เช็คใหม่"}' >/dev/null
[ "$(ST $W3)|$(SENT $W3 $BOARD)" = "PARTS_SOURCING|-|false" ] \
  && pass "ย้อนไปเช็คอะไหล่: ล้างพร้อมผลเช็คและเลขใบเบิก" || fail "ย้อนไปเช็คอะไหล่: $(ST $W3) $(SENT $W3 $BOARD)"

echo "═══ ปฏิเสธ: ขั้นอื่น"
R=$(POST $A work-orders/$W3/parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"sentToCustomer\":true}]}")
REFUSED "$R" && [ "$(ST $W3)|$(DB "select coalesce(\"inStock\"::text,'-') from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='WAITING'")" = "PARTS_SOURCING|-" ] \
  && pass "ขั้นเช็คอะไหล่ (ยังไม่เบิก): 400 ข้อความไทย ฐานข้อมูลไม่เปลี่ยน" || fail "ขั้นเช็คอะไหล่รับค่า: $R · $(ST $W3)"
W5=$(mk BOARD:1 BELT:2); IDS="$IDS $W5"; toIssue $W5
POST $A work-orders/$W5/parts-check "{\"results\":[$(IN94 $BOARD RQ-P1),{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}],\"noTransfer\":[$BELT]}" >/dev/null
[ "$(ST $W5)" = "PARTS_PICKUP" ] || fail "เตรียมข้อมูล: ใบไม่อยู่ขั้นหัวหน้าภาคเบิกคลังอื่น ($(ST $W5))"
R=$(POST $S work-orders/$W5/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"PK-1\",\"sentToCustomer\":true}]}")
REFUSED "$R" && [ "$(ST $W5)|$(SENT $W5 $BELT)" = "PARTS_PICKUP|-|false" ] \
  && pass "หัวหน้าภาคเบิกคลังอื่น (PARTS_PICKUP): 400 ข้อความไทย ฐานข้อมูลไม่เปลี่ยน" || fail "ขั้นหัวหน้าภาคเบิกรับค่า: $R · $(ST $W5) $(SENT $W5 $BELT)"
POST $S work-orders/$W5/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"PK-1\"}]}" >/dev/null
[ "$(ST $W5)|$(SENT $W5 $BELT)|$(SENT $W5 $BOARD)" = "AWAITING_CONFIRM|PK-1|false|RQ-P1|false" ] \
  && pass "ไม่ส่งค่า หัวหน้าภาคเบิกได้ตามเดิม" || fail "หัวหน้าภาคเบิก: $(ST $W5) $(SENT $W5 $BELT)"
[ "$(CODE -X POST "localhost:4000/api/work-orders/$W5/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"results\":[$(IN94 $BOARD RQ-P2 true)]}")" = "409" ] \
  && [ "$(SENT $W5 $BOARD)" = "RQ-P1|false" ] && pass "ฟอร์มเบิกที่ค้างหลังใบเดินไปแล้ว: 409 (ด่านขั้นเดิม) ไม่เปลี่ยนชิ้นที่เบิกแล้ว" || fail "เบิกซ้ำนอกขั้นได้: $(SENT $W5 $BOARD)"

echo "═══ ของโอนมาถึงคลัง 94 แล้ว แอดมินเบิกส่งมอบ"
W4=$(mk BOARD:1 BELT:2); IDS="$IDS $W4"; toIssue $W4
POST $A work-orders/$W4/parts-check "{\"results\":[$(IN94 $BOARD RQ-T1),{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-1\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W4)" = "PARTS_REQUESTED" ] || fail "เตรียมข้อมูล: โอนถึงคลัง 94 แล้วไม่กลับมาให้แอดมินเบิก ($(ST $W4))"
POST $A work-orders/$W4/parts-check "{\"results\":[$(IN94 $BELT RQ-T2 true)]}" >/dev/null
[ "$(ST $W4)|$(SENT $W4 $BELT)|$(SENT $W4 $BOARD)" = "AWAITING_CONFIRM|RQ-T2|true|RQ-T1|false" ] \
  && [ "$(DB "select \"transferNo\" from \"WorkOrderPart\" where \"workOrderId\"=$W4 and \"sparePartId\"=$BELT and kind='WAITING'")" = "TR-1" ] \
  && pass "ชิ้นที่โอนมาถึง 94 เลือกส่งให้ลูกค้าแล้วได้ · ข้อมูลการโอนอยู่ครบ · ชิ้นที่เบิกรอบก่อนไม่แตะ" || fail "เบิกส่งมอบหลังโอน: $(ST $W4) $(SENT $W4 $BELT) $(SENT $W4 $BOARD)"
echo "$(LOG $W4 PARTS_CHECKED)" | grep -qx "$BELT_CODE ×2 · $L94 · ใบเบิก RQ-T2 — แอดมินเบิกแล้ว · ส่งให้ลูกค้าแล้ว" \
  && pass "ประวัติเบิกส่งมอบหลังโอนบอกส่งให้ลูกค้าแล้ว" || fail "ประวัติหลังโอน: $(LOG $W4 PARTS_CHECKED)"

[ -z "$FAILED" ]
