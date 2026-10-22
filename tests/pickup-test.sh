#!/bin/bash
# ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของอยู่คลังอื่น หัวหน้าภาคเบิกแล้วโอนมาคลังส่งมอบ (เจ้าของงานกำหนด ต.ค. 69)
#   · แอดมินใส่เลขใบเบิกคลังอื่นไม่ได้ · หมายเหตุถึงหัวหน้าภาคไม่บังคับ (ต.ค. 69)
#   · ประวัติผลเช็คบอกรายตัว: คลังไหน · เลขใบเบิก · ใครเบิก
#   · ขั้น "เบิกและโอนอะไหล่": แอดมิน/ช่าง/หัวหน้าภาคนอกพื้นที่กดไม่ได้ · ต้องมีเลขใบเบิกต้นทาง + เลขที่ใบโอนทุกตัว
#   · โอนเสร็จแล้ว: ปลายทางคลัง 94 → แอดมินเบิกส่งมอบ · ปลายทางคลังอื่น → หัวหน้าภาคเบิกส่งมอบ
#   · เบิก/โอนไม่ได้ส่งกลับแอดมินพร้อมเหตุผล (ทั้งก่อนโอนและระหว่างรอของ) · ของคลัง 94 ทั้งหมดไม่ผ่านขั้นเหล่านี้
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001); S=$(login S001); T=$(login T001)
L94="คลังลาดพร้าว 94"
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null

mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบเบิกคลังอื่น"}]}' | J 'd.orders?d.orders[0].id:d.id')
  POST $S work-orders/$id/parts "{\"needsParts\":true,\"parts\":$1}" >/dev/null
  echo $id
}
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
XF() { DB "select coalesce(\"transferFrom\",'-')||'|'||coalesce(\"transferReqNo\",'-')||'|'||coalesce(\"transferNo\",'-')||'|'||(\"transferredAt\" is not null) from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }
LOG() { DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
LABEL() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+"|"+d.stageActor'; }
PART() { DB "select coalesce(\"inStock\"::text,'-')||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"requisitionNo\",'-') from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }

W=$(mk "[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]"); IDS="$W"
# ลูกค้าอาจต้องเสนอราคาก่อน — ข้ามไปขั้นเบิกตรง ๆ ให้ทดสอบเฉพาะเรื่องเบิก/โอน
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W" >/dev/null
[ "$(ST $W)" = "PARTS_REQUESTED" ] || fail "เตรียมข้อมูล: ใบไม่อยู่ขั้นเบิก"

echo "═══ แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94"
R=$(POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-A2\"}]}")
echo "$R" | J 'd.error' | grep -q "เฉพาะคลังลาดพร้าว 94" && [ "$(ST $W)" = "PARTS_REQUESTED" ] && [ "$(PART $W $BELT)" = "-|-|-" ] \
  && pass "แอดมินใส่เลขใบเบิกคลังภูเก็ต: ปฏิเสธ ฐานข้อมูลไม่เปลี่ยน" || fail "แอดมินเบิกคลังอื่นได้: $R · $(PART $W $BELT)"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}")" = "400" ] \
  && pass "คลัง 94 ยังต้องมีเลขใบเบิกเหมือนเดิม" || fail "คลัง 94 ไม่มีเลขใบเบิกก็ผ่าน"
# ไม่เขียนหมายเหตุ — ไม่บังคับแล้ว
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BOARD)|$(PART $W $BELT)" = "PARTS_TRANSFER|true|$L94|RQ-A1|true|คลังภูเก็ต|-" ] \
  && pass "คลัง 94 แอดมินเบิกเลย · คลังภูเก็ต → หัวหน้าภาค · เบิกและโอนอะไหล่ (ไม่มีหมายเหตุก็ส่งได้)" || fail "หลังเช็ค: $(ST $W) $(PART $W $BELT)"
[ "$(LABEL $W)" = "หัวหน้าภาค · เบิกและโอนอะไหล่|SUPERVISOR" ] && pass "ขั้นนี้รอหัวหน้าภาค" || fail "ป้าย: $(LABEL $W)"
CHK=$(LOG $W PARTS_CHECKED)
echo "$CHK" | grep -qx "SP-BOARD ×1 · $L94 · ใบเบิก RQ-A1 — แอดมินเบิกแล้ว" && echo "$CHK" | grep -qx "SP-BELT ×2 · คลังภูเก็ต — ส่งหัวหน้าภาคเบิกและโอน" \
  && pass "ประวัติผลเช็คบอกรายตัว: คลัง 94 + เลขใบเบิก (แอดมินเบิก) · คลังภูเก็ต (ส่งหัวหน้าภาคเบิกและโอน)" || fail "ประวัติผลเช็ค: $CHK"
[ "$(LOG $W PICKUP_REQUESTED)" = "SP-BELT x2 (คลังภูเก็ต)" ] && pass "ประวัติส่งเบิกไม่มีหมายเหตุ: รายการ + คลังอย่างเดียว" || fail "ประวัติส่งเบิก: $(LOG $W PICKUP_REQUESTED)"
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX&limit=200" -H "$(H $S)" | J "(d.rows||d).some(r=>r.id===$W)")" = "true" ] \
  && [ "$(curl -s "localhost:4000/api/work-orders?status=INBOX&limit=200" -H "$(H $A)" | J "(d.rows||d).some(r=>r.id===$W)")" = "false" ] \
  && pass "อยู่ในกล่องงานหัวหน้าภาค ไม่อยู่ในกล่องแอดมิน" || fail "กล่องงานไม่ถูก"

echo "═══ ใครกดเบิกและโอนได้ · ข้อมูลต้องครบ"
XOK="{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\"PK-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-X\"}]}"
[ "$(PC $A work-orders/$W/parts-transfer "$XOK")" = "403" ] && [ "$(PC $A work-orders/$W/parts-transfer/return '{"reason":"x"}')" = "403" ] \
  && [ "$(ST $W)|$(XF $W $BELT)" = "PARTS_TRANSFER|-|-|-|false" ] && pass "แอดมินกดแทนไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "แอดมินกดได้: $(ST $W) $(XF $W $BELT)"
[ "$(PC $T work-orders/$W/parts-transfer "$XOK")" = "403" ] && [ "$(ST $W)" = "PARTS_TRANSFER" ] && pass "ช่างกดไม่ได้" || fail "ช่างกดได้"
DB "update \"User\" set region='ภาคที่ไม่ใช่ของสาขานี้' where \"employeeCode\"='S001'" >/dev/null
[ "$(PC $S work-orders/$W/parts-transfer "$XOK")" = "403" ] && [ "$(ST $W)" = "PARTS_TRANSFER" ] && pass "หัวหน้าภาคนอกพื้นที่กดไม่ได้" || fail "หัวหน้าภาคนอกพื้นที่กดได้"
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
[ "$(PC $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\"PK-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\" \"}]}")" = "400" ] \
  && [ "$(PC $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\" \",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-1\"}]}")" = "400" ] \
  && [ "$(PC $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\"PK-1\",\"toWarehouse\":\"คลังภูเก็ต\",\"transferNo\":\"TR-1\"}]}")" = "400" ] \
  && [ "$(PC $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BOARD,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\"PK-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-1\"}]}")" = "400" ] \
  && [ "$(ST $W)|$(XF $W $BELT)" = "PARTS_TRANSFER|-|-|-|false" ] \
  && pass "ไม่มีเลขที่ใบโอน / ไม่มีเลขใบเบิก / โอนไปคลังเดิม / ไม่ครบรายการ: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "ผ่านทั้งที่ข้อมูลไม่ครบ"

echo "═══ เบิกไม่ได้ ส่งกลับแอดมิน"
[ "$(PC $S work-orders/$W/parts-transfer/return '{"reason":"  "}')" = "400" ] && [ "$(ST $W)" = "PARTS_TRANSFER" ] && pass "ส่งกลับโดยไม่มีเหตุผล: 400" || fail "ส่งกลับได้โดยไม่มีเหตุผล"
POST $S work-orders/$W/parts-transfer/return '{"reason":"คลังภูเก็ตของหมดแล้ว"}' >/dev/null
[ "$(ST $W)|$(LOG $W TRANSFER_RETURNED)" = "PARTS_REQUESTED|คลังภูเก็ตของหมดแล้ว" ] && [ "$(PART $W $BOARD)" = "true|$L94|RQ-A1" ] \
  && pass "กลับไปรอแอดมินเบิก พร้อมเหตุผล · ตัวที่แอดมินเบิกแล้วยังอยู่" || fail "ส่งกลับ: $(ST $W)"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"}]}")" = "400" ] \
  && pass "แอดมินต้องตอบตัวที่ส่งกลับมาใหม่" || fail "ข้ามตัวที่ยังไม่ได้เบิกได้"
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)" = "PARTS_TRANSFER|true|คลังกระบี่|-" ] && pass "แอดมินหาคลังใหม่ (กระบี่) ส่งให้หัวหน้าภาคอีกรอบ" || fail "รอบสอง: $(ST $W) $(PART $W $BELT)"

echo "═══ หัวหน้าภาคเบิกจากกระบี่ โอนมาคลัง 94"
POST $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-1\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)|$(XF $W $BELT)" = "PARTS_IN_TRANSIT|true|$L94|-|คลังกระบี่|KB-1|TR-1|false" ] \
  && pass "รอโอนอะไหล่ · ปลายทางคลัง 94 · เก็บต้นทาง + เลขใบเบิกต้นทาง + เลขที่ใบโอน · ยังไม่มีใบเบิกส่งมอบ" || fail "หลังสั่งโอน: $(ST $W) $(PART $W $BELT) $(XF $W $BELT)"
[ "$(LABEL $W)" = "หัวหน้าภาค · รอโอนอะไหล่|SUPERVISOR" ] && pass "ป้าย: หัวหน้าภาค · รอโอนอะไหล่" || fail "ป้าย: $(LABEL $W)"
[ "$(LOG $W TRANSFER_REQUESTED)" = "SP-BELT x2 · คลังกระบี่ ใบเบิก KB-1 → $L94 · ใบโอน TR-1" ] \
  && pass "ประวัติบอก ต้นทาง · ใบเบิก · ปลายทาง · ใบโอน" || fail "ประวัติสั่งโอน: $(LOG $W TRANSFER_REQUESTED)"
[ "$(PC $A work-orders/$W/parts-transfer/arrived '{}')" = "403" ] && [ "$(PC $T work-orders/$W/parts-transfer/arrived '{}')" = "403" ] \
  && [ "$(PC $S work-orders/$W/parts-transfer "$XOK")" = "409" ] && [ "$(ST $W)" = "PARTS_IN_TRANSIT" ] \
  && pass "แอดมิน/ช่างกดโอนเสร็จแทนไม่ได้ · สั่งโอนซ้ำไม่ได้ (409)" || fail "สิทธิ์ขั้นรอโอน"
POST $S work-orders/$W/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W)|$(XF $W $BELT)" = "PARTS_REQUESTED|คลังกระบี่|KB-1|TR-1|true" ] \
  && pass "โอนเสร็จแล้ว (ปลายทางคลัง 94) → กลับไปแอดมินเบิกส่งมอบ · บันทึกเวลาถึง" || fail "โอนเสร็จ: $(ST $W) $(XF $W $BELT)"
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A2\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)|$(XF $W $BELT)" = "PARTS_CHECKED|true|$L94|RQ-A2|คลังกระบี่|KB-1|TR-1|true" ] \
  && pass "แอดมินเบิกส่งมอบจากคลัง 94 → จ่ายงาน · ข้อมูลการโอนยังอยู่" || fail "เบิกส่งมอบ: $(ST $W) $(PART $W $BELT) $(XF $W $BELT)"
for st in PARTS_TRANSFER PARTS_IN_TRANSIT PARTS_PICKUP; do
  [ "$(PC $A work-orders/$W/rollback "{\"toStage\":\"$st\",\"reason\":\"ทดสอบ\"}")" = "400" ] || fail "ย้อนมา $st ได้"
done
[ "$(ST $W)" = "PARTS_CHECKED" ] && pass "ย้อนมาขั้นหัวหน้าภาคเบิก/โอนตรง ๆ ไม่ได้" || fail "ย้อนแล้วสถานะเปลี่ยน"

echo "═══ โอนไปคลังที่ใกล้หน้างาน (ไม่ใช่ 94) — หัวหน้าภาคเบิกส่งมอบ"
W3=$(mk "[{\"sparePartId\":$BELT,\"quantity\":1}]"); IDS="$IDS $W3"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W3" >/dev/null
POST $A work-orders/$W3/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
POST $S work-orders/$W3/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-3\",\"toWarehouse\":\"คลังภูเก็ต\",\"transferNo\":\"TR-3\"}]}" >/dev/null
POST $S work-orders/$W3/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W3)|$(PART $W3 $BELT)" = "PARTS_PICKUP|true|คลังภูเก็ต|-" ] && [ "$(LABEL $W3)" = "หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)|SUPERVISOR" ] \
  && pass "โอนเสร็จ (ปลายทางคลังภูเก็ต) → หัวหน้าภาคเบิกส่งมอบเอง ไม่ผ่านแอดมิน" || fail "ปลายทางคลังอื่น: $(ST $W3) $(PART $W3 $BELT)"
[ "$(PC $A work-orders/$W3/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-X\"}]}")" = "403" ] && pass "แอดมินเบิกส่งมอบคลังอื่นแทนไม่ได้" || fail "แอดมินเบิกคลังอื่นได้"
POST $S work-orders/$W3/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-SUP3\"}]}" >/dev/null
[ "$(ST $W3)|$(PART $W3 $BELT)|$(XF $W3 $BELT)" = "PARTS_CHECKED|true|คลังภูเก็ต|RQ-SUP3|คลังกระบี่|KB-3|TR-3|true" ] \
  && pass "หัวหน้าภาคเบิกส่งมอบจากคลังภูเก็ต → จ่ายงาน (ฐานข้อมูล)" || fail "เบิกส่งมอบ: $(ST $W3) $(PART $W3 $BELT)"

echo "═══ ระหว่างรอของ โอนไม่สำเร็จ — ส่งกลับแอดมิน"
W4=$(mk "[{\"sparePartId\":$BELT,\"quantity\":1}]"); IDS="$IDS $W4"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W4" >/dev/null
POST $A work-orders/$W4/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-4\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-4\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer/return '{"reason":"ขนส่งตีกลับ"}' >/dev/null
[ "$(ST $W4)|$(PART $W4 $BELT)|$(XF $W4 $BELT)" = "PARTS_REQUESTED|true|คลังกระบี่|-|-|-|-|false" ] \
  && pass "ส่งกลับระหว่างรอของ: ล้างการโอน คลังกลับเป็นต้นทาง (กระบี่) ให้แอดมินตอบใหม่" || fail "ส่งกลับระหว่างโอน: $(ST $W4) $(PART $W4 $BELT) $(XF $W4 $BELT)"

echo "═══ ของอยู่คลัง 94 ทั้งหมด — ไม่ผ่านขั้นเหล่านี้"
W2=$(mk "[{\"sparePartId\":$BOARD,\"quantity\":1}]"); IDS="$IDS $W2"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W2" >/dev/null
POST $A work-orders/$W2/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-B1\"}]}" >/dev/null
[ "$(ST $W2)|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W2 and (action like 'PICKUP%' or action like 'TRANSFER%')")" = "PARTS_CHECKED|0" ] \
  && pass "แอดมินเบิกเองครบ → หัวหน้าภาค · จ่ายงานให้ทีมทันที" || fail "ใบคลัง 94: $(ST $W2)"

[ -z "$FAILED" ]
