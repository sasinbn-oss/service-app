#!/bin/bash
# ทดสอบ: ของหมด = ใบค้างที่แอดมินขั้นเช็คอะไหล่จนของเข้าครบ แล้วค่อยส่งหัวหน้าภาคนัด (นัดก่อนเบิก ต.ค. 69)
#        ของไม่พอตอนเบิก (นัดแล้ว ยังไม่คอนเฟิร์มลูกค้า — เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง) → กลับไปเช็คอะไหล่ วันนัดล้าง
#        · วันนัดตั้งแต่วันนี้ (ของคลังอื่นไม่ต้องล่วงหน้า 7 วันแล้ว)
set -e
SP="$(dirname "$0")"
. "$SP/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { psql "${DATABASE_URL%%\?*}" -tAc "$1"; }
st() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }
parts() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.waitingParts.map(p=>p.partCode+" "+(p.inStock===null?"ยังไม่เช็ค":p.inStock?"มีของ@"+p.warehouse:"หมด")+" ใบเบิก="+(p.requisitionNo||"-")).join(" · ")'; }
post() { curl -s -X POST "localhost:4000/api/work-orders/$1/$2" -H "$(H ${4:-$A})" -H 'Content-Type: application/json' -d "$3"; }
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }

SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
# เก็บกวาดตอนจบ (ผ่านหรือไม่ก็ตาม) — ลบใบที่สร้าง คืนภาคของหัวหน้าภาคทดสอบ (CLAUDE.md)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
ID=""; ID3=""; ID4=""
cleanup() {
  for i in $ID $ID3 $ID4; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
}
trap cleanup EXIT
R=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
L94="คลังลาดพร้าว 94"

echo "═══ เปิดใบงาน ขออะไหล่สองตัว"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W61","symptom":"ทดสอบของหมด"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
echo "  $(echo "$WO" | J 'd.orders[0].code') (id=$ID)"
# อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ จึงเลือกหลังเปิดใบ (fx_part) · ข้อความที่พิมพ์รหัสอะไหล่เทียบกับตัวที่ใช้จริง
BOARD=$(fx_part $ID BOARD); BELT=$(fx_part $ID BELT)
BOARD_CODE=$(fx_part_code $ID BOARD); BELT_CODE=$(fx_part_code $ID BELT)
post $ID parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" $S >/dev/null
TEAM=$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.suggestedTeam')
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ระบุอะไหล่แล้วไปแอดมินเช็คอะไหล่ (ยังไม่เบิก)" || fail "หลังระบุอะไหล่: $(st $ID)"

echo
echo "═══ เช็ครอบ 1 — บอร์ดมีของ สายพานหมด"
RR=$(post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true},{\"sparePartId\":$BELT,\"inStock\":false}]}")
echo "$RR" | grep -q "ต้องบอกด้วยว่าอยู่คลังไหน" && pass "มีของแต่ไม่บอกคลัง ถูกปฏิเสธ (หัวหน้าภาคต้องรู้ว่าต้องโอนไหม)" || fail "รับทั้งที่ไม่บอกคลัง: $RR"
RR=$(post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"}]}")
echo "$RR" | grep -q "ยังไม่ได้บอกว่ามีหรือหมด" && pass "ตอบไม่ครบทุกตัว ถูกปฏิเสธ" || fail "รับทั้งที่ตอบไม่ครบ: $RR"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":false}],\"expectedAt\":\"2026-11-20\"}" >/dev/null
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ของหมด ใบงานค้างอยู่ที่แอดมิน ไม่ส่งหัวหน้าภาคนัด" || fail "ส่งต่อไปแล้วทั้งที่ของยังไม่มา: $(st $ID)"
st $ID | grep -q "รออะไหล่" && pass "สถานะขึ้นว่ารออะไหล่" || fail "สถานะไม่ขึ้นรออะไหล่: $(st $ID)"
[ "$(DB "select \"partsExpectedAt\"::date from \"WorkOrder\" where id=$ID")" = "2026-11-20" ] && pass "จำวันคาดว่าของเข้า" || fail "วันคาดว่าของเข้าไม่ถูกบันทึก"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^OUT$" \
  && pass "การ์ดในรายการขึ้นป้าย อะไหล่หมด" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ OUT"

echo
echo "═══ หัวหน้าภาคยังนัดไม่ได้ เพราะยังไม่ถึงขั้นนั้น"
RR=$(post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 10)\"}" $S)
echo "$RR" | grep -q "ยังไม่ถึงขั้นนี้" && pass "นัดไม่ได้ระหว่างรออะไหล่" || fail "นัดได้ทั้งที่ของยังไม่มา: $RR"
RR=$(post $ID parts-short "{\"sparePartIds\":[$BELT]}")
echo "$RR" | grep -q "ยังไม่ถึงขั้นนี้" && pass "แจ้งของไม่พอได้เฉพาะขั้นเบิก" || fail "แจ้งของไม่พอได้ที่ขั้นเช็ค: $RR"

echo
echo "═══ เช็ครอบ 2 — ของเข้าครบ ส่งหัวหน้าภาคนัด"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
echo "  $(st $ID)"
st $ID | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ของครบแล้วไปหัวหน้าภาคนัดวันเข้า (สาขา C ไม่ต้องเสนอราคา)" || fail "ไม่เดินต่อ: $(st $ID)"
[ -z "$(DB "select \"partsExpectedAt\" from \"WorkOrder\" where id=$ID")" ] && pass "ของเข้าครบแล้ว ล้างวันคาดว่าของเข้า" || fail "วันคาดว่าของเข้ายังค้าง"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID and \"requisitionNo\" is not null")" = "0" ] && pass "ยังไม่มีใบเบิก (เบิกหลังนัดวัน)" || fail "มีใบเบิกก่อนนัด"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^READY$" \
  && pass "การ์ดขึ้นป้าย อะไหล่ครบ · ยังไม่เบิก" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ READY"

echo
echo "═══ นัด → ถึงขั้นเบิก (ยังไม่โทรร้าน) แต่ของถูกงานอื่นใช้ไปแล้ว"
post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 3)\",\"scheduledTime\":\"09:00\"}" $S >/dev/null
st $ID | grep -q "^แอดมิน · เบิกอะไหล่" && [ "$(DB "select status||'|'||\"appointmentStatus\" from \"WorkOrder\" where id=$ID")" = "PARTS_REQUESTED|PENDING" ] \
  && pass "ของคลัง 94 ทั้งหมด นัดอีก 3 วันได้ แล้วไปแอดมินเบิกอะไหล่ (ยังไม่คอนเฟิร์มลูกค้า)" || fail "หลังนัด: $(st $ID)"
RR=$(post $ID parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}")
echo "$RR" | grep -q "ของไม่พอ" && pass "เบิกไม่ครบโดยไม่แยกใบ ถูกปฏิเสธ — ให้ใช้ปุ่มของไม่พอ" || fail "เบิกไม่ครบแล้วผ่าน: $RR"
RR=$(post $ID parts-short "{\"sparePartIds\":[$BELT],\"expectedAt\":\"2026-11-25\",\"note\":\"งานด่วนอีกใบใช้ไป\"}")
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ของไม่พอ — ใบกลับไปแอดมินขั้นเช็คอะไหล่ รอของเข้า" || fail "หลังแจ้งของไม่พอ: $(st $ID)"
st $ID | grep -q "รออะไหล่" && pass "สถานะกลับเป็นรออะไหล่" || fail "สถานะ: $(st $ID)"
[ "$(DB "select coalesce(\"scheduledAt\"::text,'-')||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"appointmentStatus\"::text,'-') from \"WorkOrder\" where id=$ID")" = "-|-|-" ] \
  && pass "วันนัด/ทีมที่นัดไว้ (ยังไม่คอนเฟิร์มลูกค้า) ล้างทิ้ง (ไม่ค้างบนแผนงาน)" || fail "นัดเดิมยังค้าง: $(DB "select \"scheduledAt\",\"assignedTeam\",\"appointmentStatus\" from \"WorkOrder\" where id=$ID")"
[ "$(DB "select \"inStock\"::text||'|'||coalesce(warehouse,'-') from \"WorkOrderPart\" where \"workOrderId\"=$ID and \"sparePartId\"=$BOARD")" = "true|$L94" ] \
  && pass "ตัวที่ยังมีของ ผลเช็คเดิมไม่หาย" || fail "ผลเช็คบอร์ดหาย"
[ "$(DB "select \"partsExpectedAt\"::date from \"WorkOrder\" where id=$ID")" = "2026-11-25" ] && pass "จำวันคาดว่าของเข้ารอบใหม่" || fail "ไม่จำวันคาดว่าของเข้า"
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.logs[0].action+"|"+d.logs[0].note.replace(/\n/g," ")' | grep -q "^PARTS_SHORT|.*$BELT_CODE.*งานด่วนอีกใบใช้ไป" \
  && pass "ประวัติบันทึกว่าของไม่พอ ตัวไหน และเหตุผล" || fail "ประวัติ: $(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.logs[0].action+"|"+d.logs[0].note')"
# ร้านยังไม่รู้วัน (เบิกก่อนคอนเฟิร์ม) — ประวัติต้องไม่สั่งให้แจ้งร้านว่าเลื่อน
SHORT=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='PARTS_SHORT' order by id desc limit 1")
echo "$SHORT" | grep -q "ยกเลิกวันที่หัวหน้าภาคนัดไว้" && echo "$SHORT" | grep -q "ไม่ต้องแจ้งร้าน" && ! echo "$SHORT" | grep -q "แจ้งร้านว่าเลื่อน" \
  && pass "ประวัติของไม่พอ (ยังไม่คอนเฟิร์ม): ยกเลิกวันที่นัด ไม่ต้องแจ้งร้าน (ฐานข้อมูล)" || fail "ข้อความของไม่พอ: $SHORT"

echo
echo "═══ ของเข้าอีกรอบ → นัดใหม่ → เบิกครบ → คอนเฟิร์ม"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 5)\"}" $S >/dev/null
RES=$(post $ID parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-2\"}]}")
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "^แอดมิน · คอนเฟิร์มลูกค้า" && pass "เบิกครบ → แอดมินคอนเฟิร์มลูกค้า (ของอยู่ในมือแล้ว)" || fail "หลังเบิก: $(st $ID)"
post $ID confirm-appointment '{}' >/dev/null
st $ID | grep -q "ปล่อยงาน" && [ "$(DB "select status||'|'||\"appointmentStatus\" from \"WorkOrder\" where id=$ID")" = "ASSIGNED|CONFIRMED" ] \
  && pass "ลูกค้าคอนเฟิร์มแล้ว → หัวหน้าภาคปล่อยงาน (ฐานข้อมูล)" || fail "หลังคอนเฟิร์ม: $(st $ID)"
echo "$RES" | J 'd.waitingParts.map(p=>p.partCode+"="+p.requisitionNo).sort().join(",")' | grep -q "^$BELT_CODE=RQ-ROUND-2,$BOARD_CODE=RQ-ROUND-1$" \
  && pass "แต่ละตัวได้เลขใบเบิกของตัวเอง" || fail "เลขใบเบิก: $(echo "$RES" | J 'd.waitingParts.map(p=>p.partCode+"="+p.requisitionNo).join(",")')"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^ISSUED$" \
  && pass "การ์ดขึ้นป้าย เบิกแล้ว" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ ISSUED"

echo
echo "═══ วันนัด: ตั้งแต่วันนี้ · ของอยู่คลังอื่นไม่ต้องนัดล่วงหน้า 7 วันแล้ว (เจ้าของงานยกเลิก ต.ค. 69)"
WO3=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W63","symptom":"ของคลังอื่น"}]}')
ID3=$(echo "$WO3" | J 'd.orders[0].id')
# คนละเครื่องกับใบแรก ยี่ห้ออาจไม่เหมือนกัน — เลือกอะไหล่ของใบนี้เอง
BOARD3=$(fx_part $ID3 BOARD)
post $ID3 parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD3,\"quantity\":1}]}" $S >/dev/null
post $ID3 parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD3,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
st $ID3 | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ของครบรอบเดียว ส่งหัวหน้าภาคนัดทันที" || fail "ของครบแล้วไม่เดินต่อ: $(st $ID3)"
curl -s "localhost:4000/api/work-orders?search=W63" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID3'); r.partsState' | grep -q "^TRANSFER$" \
  && pass "การ์ดขึ้นป้าย อะไหล่ครบ · ต้องโอน" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ TRANSFER"
RR=$(post $ID3 assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day -1)\"}" $S)
echo "$RR" | grep -q "วันนัดย้อนหลังไม่ได้" && [ "$(DB "select status from \"WorkOrder\" where id=$ID3")" = "PARTS_CHECKED" ] \
  && pass "นัดเมื่อวานถูกปฏิเสธ (ใบยังรอนัด)" || fail "นัดย้อนหลังได้: $RR"
post $ID3 assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 0)\"}" $S >/dev/null
[ "$(DB "select status||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$ID3")" = "PARTS_REQUESTED|$(day 0)" ] \
  && pass "ของอยู่คลังอื่นก็นัดวันนี้ได้ (ไม่ต้องล่วงหน้า 7 วันแล้ว — ฐานข้อมูล)" || fail "นัดวันนี้ไม่ผ่าน: $(st $ID3)"
# คลังภูเก็ตอยู่ในพื้นที่ (ไม่ต้องโอน) → หัวหน้าภาคเบิกส่งมอบ → ของครบ ไปขั้นคอนเฟิร์มลูกค้า
post $ID3 parts-check "{\"transfer\":false,\"results\":[{\"sparePartId\":$BOARD3,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
post $ID3 parts-pickup "{\"results\":[{\"sparePartId\":$BOARD3,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-BO3\"}]}" $S >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID3")" = "AWAITING_CONFIRM" ] \
  && pass "หัวหน้าภาคเบิกจากคลังภูเก็ตแล้ว → แอดมินคอนเฟิร์มลูกค้า" || fail "เบิกคลังอื่น: $(st $ID3)"
RR=$(post $ID3 confirm-appointment "{\"scheduledAt\":\"$(day -1)\"}")
echo "$RR" | grep -q "วันนัดย้อนหลังไม่ได้" && [ "$(DB "select status||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$ID3")" = "AWAITING_CONFIRM|$(day 0)" ] \
  && pass "ลูกค้าขอเลื่อนเป็นเมื่อวาน ถูกปฏิเสธเหมือนกัน (ใบไม่ขยับ)" || fail "เลื่อนย้อนหลังได้: $RR"
# ร้านปิด/ช่างส่งกลับ ใบกลับมาพร้อมวันเดิมที่ผ่านไปแล้ว — แก้แค่เวลาก็คือนัดใหม่บนวันที่ผ่านไปแล้ว ต้องไม่ผ่าน
DB "update \"WorkOrder\" set \"scheduledAt\"='$(day -1)' where id=$ID3" >/dev/null
RR=$(post $ID3 confirm-appointment '{"scheduledTime":"13:00"}')
echo "$RR" | grep -q "วันนัดย้อนหลังไม่ได้" && [ "$(DB "select status from \"WorkOrder\" where id=$ID3")" = "AWAITING_CONFIRM" ] \
  && pass "วันเดิมผ่านไปแล้ว เปลี่ยนแค่เวลา ถูกปฏิเสธ (นัดใหม่บนวันที่ผ่านไปแล้ว)" || fail "เปลี่ยนเวลาบนวันที่ผ่านไปแล้วได้: $RR"
# โทรคอนเฟิร์มช้า — ตกลงนัดเดิมเฉย ๆ (ไม่เปลี่ยนอะไร) ไม่ใช่การนัดใหม่ ต้องผ่าน
post $ID3 confirm-appointment '{}' >/dev/null
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$ID3")" = "ASSIGNED|CONFIRMED|$(day -1)" ] \
  && pass "คอนเฟิร์มนัดเดิมที่เลยมาแล้ว (ไม่เปลี่ยนอะไร) ได้ แล้วไปขั้นปล่อยงาน (วันนัดผ่านแล้ว — ติดล็อก ต้องเลื่อนวันนัด) (ฐานข้อมูล)" || fail "คอนเฟิร์มวันเดิมไม่ผ่าน: $(st $ID3)"
# ไม่ใช้อะไหล่จ่ายพร้อมระบุ · ส่งตรวจหน้างาน — เลือกวันนัดเหมือนกัน กฎเดียวกัน
WO4=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W64","symptom":"วันนัดย้อนหลัง"}]}')
ID4=$(echo "$WO4" | J 'd.orders[0].id')
R1=$(post $ID4 parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day -1)\"}}" $S)
R2=$(post $ID4 inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day -2)\"}" $S)
echo "$R1" | grep -q "วันนัดย้อนหลังไม่ได้" && echo "$R2" | grep -q "วันนัดย้อนหลังไม่ได้" && [ "$(DB "select status from \"WorkOrder\" where id=$ID4")" = "NEW" ] \
  && pass "จ่ายงานพร้อมระบุว่าไม่ใช้อะไหล่ / ส่งตรวจหน้างาน ด้วยวันย้อนหลัง ถูกปฏิเสธ (ใบยังอยู่ขั้นเดิม)" || fail "ย้อนหลังผ่าน: $R1 | $R2"

echo
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J '"ประวัติ: "+d.logs.filter(l=>/PARTS_/.test(l.action)).map(l=>l.action).reverse().join(" → ")'
echo "IDS=$ID,$ID3,$ID4"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
