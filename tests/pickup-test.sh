#!/bin/bash
# ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของอยู่คลังอื่นส่งให้หัวหน้าภาคเบิก (เจ้าของงานกำหนด ต.ค. 69)
#   · แอดมินใส่เลขใบเบิกคลังอื่นไม่ได้ · ของคลังอื่นต้องมีหมายเหตุถึงหัวหน้าภาค
#   · ขั้น "รอหัวหน้าภาคเบิกอะไหล่": แอดมิน/ช่าง/หัวหน้าภาคนอกพื้นที่กดไม่ได้ · ต้องมีเลขใบเบิกทุกตัว
#   · เปลี่ยนคลังได้ (บันทึกคลังที่เบิกจริง) · เบิกไม่ได้ส่งกลับแอดมินพร้อมเหตุผล · ของคลัง 94 ทั้งหมดไม่ผ่านขั้นนี้
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
PART() { DB "select coalesce(\"inStock\"::text,'-')||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"requisitionNo\",'-') from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }

W=$(mk "[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]"); IDS="$W"
# ลูกค้าอาจต้องเสนอราคาก่อน — ข้ามไปขั้นเบิกตรง ๆ ให้ทดสอบเฉพาะเรื่องเบิก
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W" >/dev/null
[ "$(ST $W)" = "PARTS_REQUESTED" ] || fail "เตรียมข้อมูล: ใบไม่อยู่ขั้นเบิก"

echo "═══ แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94"
R=$(POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-A2\"}],\"pickupNote\":\"x\"}")
echo "$R" | J 'd.error' | grep -q "เฉพาะคลังลาดพร้าว 94" && [ "$(ST $W)" = "PARTS_REQUESTED" ] && [ "$(PART $W $BELT)" = "-|-|-" ] \
  && pass "แอดมินใส่เลขใบเบิกคลังภูเก็ต: ปฏิเสธ ฐานข้อมูลไม่เปลี่ยน" || fail "แอดมินเบิกคลังอื่นได้: $R · $(PART $W $BELT)"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}")" = "400" ] \
  && [ "$(ST $W)" = "PARTS_REQUESTED" ] && pass "ของคลังอื่นไม่มีหมายเหตุถึงหัวหน้าภาค: 400" || fail "ไม่มีหมายเหตุก็ผ่าน"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}],\"pickupNote\":\"x\"}")" = "400" ] \
  && pass "คลัง 94 ยังต้องมีเลขใบเบิกเหมือนเดิม" || fail "คลัง 94 ไม่มีเลขใบเบิกก็ผ่าน"
R=$(POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}],\"pickupNote\":\"มีที่ภูเก็ต 2 ตัว ติดต่อพี่เอ\"}")
[ "$(ST $W)|$(PART $W $BOARD)|$(PART $W $BELT)" = "PARTS_PICKUP|true|$L94|RQ-A1|true|คลังภูเก็ต|-" ] \
  && pass "คลัง 94 แอดมินเบิกเลย · คลังภูเก็ตไม่มีเลขใบเบิก → หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)" || fail "หลังเช็ค: $(ST $W) $(PART $W $BELT)"
[ "$(echo "$R" | J 'd.statusLabel+"|"+d.stageActor')" = "หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)|SUPERVISOR" ] && pass "ขั้นนี้รอหัวหน้าภาค" || fail "ป้าย: $(echo "$R" | J 'd.statusLabel')"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='PICKUP_REQUESTED' order by id desc limit 1" | grep -q "SP-BELT x2 (คลังภูเก็ต) — มีที่ภูเก็ต 2 ตัว ติดต่อพี่เอ" \
  && pass "ประวัติเก็บหมายเหตุถึงหัวหน้าภาค พร้อมรายการและคลัง" || fail "ประวัติ: $(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='PICKUP_REQUESTED'")"
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX&limit=200" -H "$(H $S)" | J "(d.rows||d).some(r=>r.id===$W)")" = "true" ] \
  && [ "$(curl -s "localhost:4000/api/work-orders?status=INBOX&limit=200" -H "$(H $A)" | J "(d.rows||d).some(r=>r.id===$W)")" = "false" ] \
  && pass "อยู่ในกล่องงานหัวหน้าภาค ไม่อยู่ในกล่องแอดมิน" || fail "กล่องงานไม่ถูก"

echo "═══ ใครกดขั้นนี้ได้"
OK="{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-X\"}]}"
[ "$(PC $A work-orders/$W/parts-pickup "$OK")" = "403" ] && [ "$(PC $A work-orders/$W/parts-pickup/return '{"reason":"x"}')" = "403" ] \
  && [ "$(ST $W)|$(PART $W $BELT)" = "PARTS_PICKUP|true|คลังภูเก็ต|-" ] && pass "แอดมินกดแทนไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "แอดมินกดได้: $(ST $W) $(PART $W $BELT)"
[ "$(PC $T work-orders/$W/parts-pickup "$OK")" = "403" ] && [ "$(ST $W)" = "PARTS_PICKUP" ] && pass "ช่างกดไม่ได้" || fail "ช่างกดได้"
DB "update \"User\" set region='ภาคที่ไม่ใช่ของสาขานี้' where \"employeeCode\"='S001'" >/dev/null
[ "$(PC $S work-orders/$W/parts-pickup "$OK")" = "403" ] && [ "$(ST $W)" = "PARTS_PICKUP" ] && pass "หัวหน้าภาคนอกพื้นที่กดไม่ได้" || fail "หัวหน้าภาคนอกพื้นที่กดได้"
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
[ "$(PC $S work-orders/$W/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\" \"}]}")" = "400" ] \
  && [ "$(PC $S work-orders/$W/parts-pickup "{\"results\":[{\"sparePartId\":$BOARD,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-X\"}]}")" = "400" ] \
  && [ "$(ST $W)|$(PART $W $BELT)" = "PARTS_PICKUP|true|คลังภูเก็ต|-" ] && pass "ไม่มีเลขใบเบิก/ไม่ครบรายการ: 400" || fail "ผ่านทั้งที่ข้อมูลไม่ครบ"

echo "═══ เบิกไม่ได้ ส่งกลับแอดมิน"
[ "$(PC $S work-orders/$W/parts-pickup/return '{"reason":"  "}')" = "400" ] && [ "$(ST $W)" = "PARTS_PICKUP" ] && pass "ส่งกลับโดยไม่มีเหตุผล: 400" || fail "ส่งกลับได้โดยไม่มีเหตุผล"
POST $S work-orders/$W/parts-pickup/return '{"reason":"คลังภูเก็ตของหมดแล้ว"}' >/dev/null
[ "$(ST $W)|$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='PICKUP_RETURNED'")" = "PARTS_REQUESTED|คลังภูเก็ตของหมดแล้ว" ] \
  && [ "$(PART $W $BOARD)" = "true|$L94|RQ-A1" ] && pass "กลับไปรอแอดมินเบิก พร้อมเหตุผล · ตัวที่แอดมินเบิกแล้วยังอยู่" || fail "ส่งกลับ: $(ST $W)"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"}]}")" = "400" ] \
  && pass "แอดมินต้องตอบตัวที่ส่งกลับมาใหม่ (ยังไม่มีเลขใบเบิก)" || fail "ข้ามตัวที่ยังไม่ได้เบิกได้"
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}],\"pickupNote\":\"ลองคลังกระบี่\"}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)|$(PART $W $BOARD)" = "PARTS_PICKUP|true|คลังกระบี่|-|true|$L94|RQ-A1" ] && pass "แอดมินหาคลังใหม่ ส่งให้หัวหน้าภาคอีกรอบ" || fail "รอบสอง: $(ST $W) $(PART $W $BELT)"

echo "═══ หัวหน้าภาคเบิกแล้ว"
R=$(POST $S work-orders/$W/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังสงขลา\",\"requisitionNo\":\"RQ-SUP1\"}],\"note\":\"เบิกสงขลาใกล้กว่า\"}")
[ "$(ST $W)|$(PART $W $BELT)|$(PART $W $BOARD)" = "PARTS_CHECKED|true|คลังสงขลา|RQ-SUP1|true|$L94|RQ-A1" ] \
  && pass "ไปหัวหน้าภาค · จ่ายงานให้ทีม · บันทึกคลังที่เบิกจริง (สงขลา) + เลขใบเบิก · ของแอดมินไม่ถูกแตะ" || fail "เบิก: $(ST $W) $(PART $W $BELT) · $R"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='PICKED_UP'" | grep -q "SP-BELT x2 คลังสงขลา (แอดมินบอกคลังกระบี่) · RQ-SUP1 — เบิกสงขลาใกล้กว่า" \
  && pass "ประวัติบอกคลังที่เปลี่ยนจากที่แอดมินบอก" || fail "ประวัติ: $(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='PICKED_UP'")"
[ "$(PC $S work-orders/$W/parts-pickup "$OK")" = "409" ] && pass "กดซ้ำหลังเบิกแล้ว: 409" || fail "กดซ้ำได้"
[ "$(PC $A work-orders/$W/rollback '{"toStage":"PARTS_PICKUP","reason":"ทดสอบ"}')" = "400" ] && [ "$(ST $W)" = "PARTS_CHECKED" ] \
  && pass "ย้อนมาขั้นหัวหน้าภาคเบิกตรง ๆ ไม่ได้" || fail "ย้อนมาได้"

echo "═══ ของอยู่คลัง 94 ทั้งหมด — ไม่ผ่านขั้นนี้"
W2=$(mk "[{\"sparePartId\":$BOARD,\"quantity\":1}]"); IDS="$IDS $W2"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W2" >/dev/null
POST $A work-orders/$W2/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-B1\"}]}" >/dev/null
[ "$(ST $W2)|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W2 and action like 'PICKUP%'")" = "PARTS_CHECKED|0" ] \
  && pass "แอดมินเบิกเองครบ → หัวหน้าภาค · จ่ายงานให้ทีมทันที" || fail "ใบคลัง 94: $(ST $W2)"

[ -z "$FAILED" ]
