#!/bin/bash
# ทดสอบ: แอดมินเบิกได้เฉพาะคลังลาดพร้าว 94 · ของอยู่คลังอื่น หัวหน้าภาคเบิกแล้วโอนมาคลังส่งมอบ (เจ้าของงานกำหนด ต.ค. 69)
#   · แอดมินใส่เลขใบเบิกคลังอื่นไม่ได้ · หมายเหตุถึงหัวหน้าภาคไม่บังคับ (ต.ค. 69)
#   · ประวัติผลเช็คบอกรายตัว: คลังไหน · เลขใบเบิก · ใครเบิก
#   · ขั้น "เบิกและโอนอะไหล่": แอดมิน/ช่าง/หัวหน้าภาคนอกพื้นที่กดไม่ได้ · ต้องมีเลขใบเบิกต้นทาง + เลขที่ใบโอนทุกตัว
#   · โอนเสร็จแล้ว: ปลายทางคลัง 94 → แอดมินเบิกส่งมอบ · ปลายทางคลังอื่น → หัวหน้าภาคเบิกส่งมอบ
#   · เบิก/โอนไม่ได้ส่งกลับแอดมินพร้อมเหตุผล (ทั้งก่อนโอนและระหว่างรอของ) · ของคลัง 94 ทั้งหมดไม่ผ่านขั้นเหล่านี้
#   · เบิกครบ (นัดวันแล้ว) → แอดมินคอนเฟิร์มลูกค้า (เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง) · ใบเก่าที่ยังไม่มีวันนัด → หัวหน้าภาคนัดวัน
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
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
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001); S=$(login S001); T=$(login T001)
L94="คลังลาดพร้าว 94"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null

# อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ จึงเลือกหลังเปิดใบ (fx_part) — รับเป็นชนิด:จำนวน ไม่ใช่ id
mk() {  # $1… = ชนิด:จำนวน เช่น BOARD:1 BELT:2 → ใบใหม่ (เครื่อง W81) ที่หัวหน้าภาคระบุอะไหล่แล้ว
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบเบิกคลังอื่น"}]}' | J 'd.orders?d.orders[0].id:d.id') k p parts=""
  for k in "$@"; do
    p=$(fx_part "$id" "${k%%:*}") || return 1
    parts="$parts${parts:+,}{\"sparePartId\":$p,\"quantity\":${k##*:}}"
  done
  POST $S work-orders/$id/parts "{\"needsParts\":true,\"parts\":[$parts]}" >/dev/null
  echo $id
}
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
# ใบถึงขั้นเบิกแบบที่เกิดจริง: หัวหน้าภาคนัดแล้ว (ทีม + วัน + รอลูกค้าคอนเฟิร์ม) — ข้ามเช็คอะไหล่/เสนอราคาไปตรง ๆ
# ให้ทดสอบเฉพาะเรื่องเบิก/โอน · ใบที่ไม่มีวันนัด (DB status อย่างเดียว) = ใบเก่าที่เบิกก่อนนัด
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
VISIT=$(node -e "console.log(new Date(Date.now()+7*3600e3+10*86400e3).toISOString().slice(0,10))")
toIssue() { DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"assignedTeam\"='$TEAM', \"scheduledAt\"='$VISIT', \"appointmentStatus\"='PENDING' where id=$1" >/dev/null; }
APPT() { DB "select coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::date::text,'-')||'|'||coalesce(\"appointmentStatus\",'-') from \"WorkOrder\" where id=$1"; }
XF() { DB "select coalesce(\"transferFrom\",'-')||'|'||coalesce(\"transferReqNo\",'-')||'|'||coalesce(\"transferNo\",'-')||'|'||(\"transferredAt\" is not null) from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }
LOG() { DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
LABEL() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+"|"+d.stageActor'; }
PART() { DB "select coalesce(\"inStock\"::text,'-')||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"requisitionNo\",'-') from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }

W=$(mk BOARD:1 BELT:2); IDS="$W"
# ทุกใบในไฟล์นี้เปิดบนเครื่อง W81 เครื่องเดียว (mk) จึงได้อะไหล่ตัวเดียวกันทุกใบ — ใช้ BOARD/BELT ชุดนี้ตอบทุกใบ
# ถ้าเปลี่ยนให้ใบไหนเปิดเครื่องอื่น ต้องเลือกอะไหล่ของใบนั้นเอง · ข้อความในประวัติเทียบกับรหัสของตัวที่ใช้จริง
BOARD=$(fx_part $W BOARD); BELT=$(fx_part $W BELT)
BOARD_CODE=$(fx_part_code $W BOARD); BELT_CODE=$(fx_part_code $W BELT)
toIssue $W
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
echo "$CHK" | grep -qx "$BOARD_CODE ×1 · $L94 · ใบเบิก RQ-A1 — แอดมินเบิกแล้ว" && echo "$CHK" | grep -qx "$BELT_CODE ×2 · คลังภูเก็ต — ส่งหัวหน้าภาคเบิกและโอน" \
  && pass "ประวัติผลเช็คบอกรายตัว: คลัง 94 + เลขใบเบิก (แอดมินเบิก) · คลังภูเก็ต (ส่งหัวหน้าภาคเบิกและโอน)" || fail "ประวัติผลเช็ค: $CHK"
[ "$(LOG $W PICKUP_REQUESTED)" = "$BELT_CODE x2 (คลังภูเก็ต)" ] && pass "ประวัติส่งเบิกไม่มีหมายเหตุ: รายการ + คลังอย่างเดียว" || fail "ประวัติส่งเบิก: $(LOG $W PICKUP_REQUESTED)"
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
  && [ "$(APPT $W)" = "$TEAM|$VISIT|PENDING" ] \
  && pass "กลับไปรอแอดมินเบิก พร้อมเหตุผล · ตัวที่แอดมินเบิกแล้วยังอยู่ · ทีม/วันนัดเดิมอยู่" || fail "ส่งกลับ: $(ST $W) $(APPT $W)"
[ "$(PC $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A1\"}]}")" = "400" ] \
  && pass "แอดมินต้องตอบตัวที่ส่งกลับมาใหม่" || fail "ข้ามตัวที่ยังไม่ได้เบิกได้"
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)" = "PARTS_TRANSFER|true|คลังกระบี่|-" ] && pass "แอดมินหาคลังใหม่ (กระบี่) ส่งให้หัวหน้าภาคอีกรอบ" || fail "รอบสอง: $(ST $W) $(PART $W $BELT)"

echo "═══ หัวหน้าภาคเบิกจากกระบี่ โอนมาคลัง 94"
POST $S work-orders/$W/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-1\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-1\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)|$(XF $W $BELT)" = "PARTS_IN_TRANSIT|true|$L94|-|คลังกระบี่|KB-1|TR-1|false" ] \
  && pass "รอโอนอะไหล่ · ปลายทางคลัง 94 · เก็บต้นทาง + เลขใบเบิกต้นทาง + เลขที่ใบโอน · ยังไม่มีใบเบิกส่งมอบ" || fail "หลังสั่งโอน: $(ST $W) $(PART $W $BELT) $(XF $W $BELT)"
[ "$(LABEL $W)" = "หัวหน้าภาค · รอโอนอะไหล่|SUPERVISOR" ] && pass "ป้าย: หัวหน้าภาค · รอโอนอะไหล่" || fail "ป้าย: $(LABEL $W)"
[ "$(LOG $W TRANSFER_REQUESTED)" = "$BELT_CODE x2 · คลังกระบี่ ใบเบิก KB-1 → $L94 · ใบโอน TR-1" ] \
  && pass "ประวัติบอก ต้นทาง · ใบเบิก · ปลายทาง · ใบโอน" || fail "ประวัติสั่งโอน: $(LOG $W TRANSFER_REQUESTED)"
[ "$(PC $A work-orders/$W/parts-transfer/arrived '{}')" = "403" ] && [ "$(PC $T work-orders/$W/parts-transfer/arrived '{}')" = "403" ] \
  && [ "$(PC $S work-orders/$W/parts-transfer "$XOK")" = "409" ] && [ "$(ST $W)" = "PARTS_IN_TRANSIT" ] \
  && pass "แอดมิน/ช่างกดโอนเสร็จแทนไม่ได้ · สั่งโอนซ้ำไม่ได้ (409)" || fail "สิทธิ์ขั้นรอโอน"
POST $S work-orders/$W/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W)|$(XF $W $BELT)" = "PARTS_REQUESTED|คลังกระบี่|KB-1|TR-1|true" ] \
  && pass "โอนเสร็จแล้ว (ปลายทางคลัง 94) → กลับไปแอดมินเบิกส่งมอบ · บันทึกเวลาถึง" || fail "โอนเสร็จ: $(ST $W) $(XF $W $BELT)"
POST $A work-orders/$W/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-A2\"}]}" >/dev/null
[ "$(ST $W)|$(PART $W $BELT)|$(XF $W $BELT)" = "AWAITING_CONFIRM|true|$L94|RQ-A2|คลังกระบี่|KB-1|TR-1|true" ] && [ "$(APPT $W)" = "$TEAM|$VISIT|PENDING" ] \
  && pass "แอดมินเบิกส่งมอบจากคลัง 94 → คอนเฟิร์มลูกค้า · ข้อมูลการโอนยังอยู่ · นัดเดิมรอคอนเฟิร์ม" || fail "เบิกส่งมอบ: $(ST $W) $(PART $W $BELT) $(XF $W $BELT) $(APPT $W)"
for st in PARTS_TRANSFER PARTS_IN_TRANSIT PARTS_PICKUP; do
  [ "$(PC $A work-orders/$W/rollback "{\"toStage\":\"$st\",\"reason\":\"ทดสอบ\"}")" = "400" ] || fail "ย้อนมา $st ได้"
done
[ "$(ST $W)" = "AWAITING_CONFIRM" ] && pass "ย้อนมาขั้นหัวหน้าภาคเบิก/โอนตรง ๆ ไม่ได้" || fail "ย้อนแล้วสถานะเปลี่ยน"
# ย้อนไปขั้นแอดมินเบิกได้ — ล้างเลขใบเบิกและการโอนรอบนี้ เบิกใหม่ทั้งหมด · ทีม/วันนัดไม่หาย
POST $A work-orders/$W/rollback '{"toStage":"PARTS_REQUESTED","reason":"เบิกผิดตัว"}' >/dev/null
[ "$(ST $W)|$(PART $W $BOARD)|$(PART $W $BELT)|$(XF $W $BELT)" = "PARTS_REQUESTED|true|$L94|-|true|$L94|-|-|-|-|false" ] && [ "$(APPT $W)" = "$TEAM|$VISIT|PENDING" ] \
  && pass "ย้อนจากคอนเฟิร์มไปแอดมินเบิก: ล้างเลขใบเบิก/การโอน ทีม/วันนัดอยู่ (ฐานข้อมูล)" || fail "ย้อนไปเบิก: $(ST $W) $(PART $W $BELT) $(XF $W $BELT) $(APPT $W)"

echo "═══ โอนไปคลังที่ใกล้หน้างาน (ไม่ใช่ 94) — หัวหน้าภาคเบิกส่งมอบ"
W3=$(mk BELT:1); IDS="$IDS $W3"
toIssue $W3
POST $A work-orders/$W3/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
POST $S work-orders/$W3/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-3\",\"toWarehouse\":\"คลังภูเก็ต\",\"transferNo\":\"TR-3\"}]}" >/dev/null
POST $S work-orders/$W3/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W3)|$(PART $W3 $BELT)" = "PARTS_PICKUP|true|คลังภูเก็ต|-" ] && [ "$(LABEL $W3)" = "หัวหน้าภาค · เบิกอะไหล่ (คลังอื่น)|SUPERVISOR" ] \
  && pass "โอนเสร็จ (ปลายทางคลังภูเก็ต) → หัวหน้าภาคเบิกส่งมอบเอง ไม่ผ่านแอดมิน" || fail "ปลายทางคลังอื่น: $(ST $W3) $(PART $W3 $BELT)"
[ "$(PC $A work-orders/$W3/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-X\"}]}")" = "403" ] && pass "แอดมินเบิกส่งมอบคลังอื่นแทนไม่ได้" || fail "แอดมินเบิกคลังอื่นได้"
POST $S work-orders/$W3/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-SUP3\"}]}" >/dev/null
[ "$(ST $W3)|$(PART $W3 $BELT)|$(XF $W3 $BELT)" = "AWAITING_CONFIRM|true|คลังภูเก็ต|RQ-SUP3|คลังกระบี่|KB-3|TR-3|true" ] \
  && pass "หัวหน้าภาคเบิกส่งมอบจากคลังภูเก็ต → คอนเฟิร์มลูกค้า (ฐานข้อมูล)" || fail "เบิกส่งมอบ: $(ST $W3) $(PART $W3 $BELT)"

echo "═══ ระหว่างรอของ โอนไม่สำเร็จ — ส่งกลับแอดมิน"
W4=$(mk BELT:1); IDS="$IDS $W4"
toIssue $W4
POST $A work-orders/$W4/parts-check "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer "{\"results\":[{\"sparePartId\":$BELT,\"fromWarehouse\":\"คลังกระบี่\",\"transferReqNo\":\"KB-4\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-4\"}]}" >/dev/null
POST $S work-orders/$W4/parts-transfer/return '{"reason":"ขนส่งตีกลับ"}' >/dev/null
[ "$(ST $W4)|$(PART $W4 $BELT)|$(XF $W4 $BELT)" = "PARTS_REQUESTED|true|คลังกระบี่|-|-|-|-|false" ] && [ "$(APPT $W4)" = "$TEAM|$VISIT|PENDING" ] \
  && pass "ส่งกลับระหว่างรอของ: ล้างการโอน คลังกลับเป็นต้นทาง (กระบี่) ให้แอดมินตอบใหม่ · นัดเดิมอยู่" || fail "ส่งกลับระหว่างโอน: $(ST $W4) $(PART $W4 $BELT) $(XF $W4 $BELT) $(APPT $W4)"

echo "═══ คลังอื่นที่อยู่ในพื้นที่ — แอดมินเลือกไม่ต้องโอน (ต.ค. 69)"
W5=$(mk BELT:1); IDS="$IDS $W5"
toIssue $W5
POST $A work-orders/$W5/parts-check "{\"transfer\":false,\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
[ "$(ST $W5)|$(XF $W5 $BELT)" = "PARTS_PICKUP|-|-|-|true" ] \
  && pass "ไม่ต้องโอน → ข้ามขั้นโอน ไปหัวหน้าภาคเบิกอะไหล่ (คลังอื่น) เลย · ไม่มีเลขใบโอน" || fail "ไม่ต้องโอน: $(ST $W5) $(XF $W5 $BELT)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W5 and action='PARTS_CHECKED'" | grep -q "คลังกระบี่ (ไม่ต้องโอน) — ส่งหัวหน้าภาคเบิกส่งมอบ" \
  && pass "ประวัติบอกว่าไม่ต้องโอน" || fail "ประวัติไม่บอกว่าไม่ต้องโอน"
POST $S work-orders/$W5/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"KB-NT5\"}]}" >/dev/null
[ "$(ST $W5)|$(PART $W5 $BELT)" = "AWAITING_CONFIRM|true|คลังกระบี่|KB-NT5" ] \
  && pass "หัวหน้าภาคเบิกจากคลังนั้น (ใส่เลขใบเบิก) → คอนเฟิร์มลูกค้า" || fail "เบิกหลังไม่โอน: $(ST $W5) $(PART $W5 $BELT)"
W6=$(mk BELT:1); IDS="$IDS $W6"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W6" >/dev/null
POST $A work-orders/$W6/parts-check "{\"transfer\":true,\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
[ "$(ST $W6)" = "PARTS_TRANSFER" ] && pass "ต้องโอน → หัวหน้าภาคเบิกและโอน (เหมือนเดิม)" || fail "ต้องโอน: $(ST $W6)"

echo "═══ ใบเดียวมีทั้งชิ้นที่ต้องโอนและไม่ต้องโอน (เลือกทีละชิ้น · แบบ ก.)"
W7=$(mk BOARD:1 BELT:1); IDS="$IDS $W7"
toIssue $W7
MIX="{\"noTransfer\":[$BELT],\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}"
POST $A work-orders/$W7/parts-check "$MIX" >/dev/null
[ "$(ST $W7)|$(XF $W7 $BOARD)|$(XF $W7 $BELT)" = "PARTS_TRANSFER|-|-|-|false|-|-|-|true" ] \
  && pass "ผสมกัน → เบิกและโอน · ขอนแก่นรอโอน · กระบี่ไม่ต้องโอน (อยู่คลังนั้นแล้ว)" || fail "ผสม: $(ST $W7) $(XF $W7 $BOARD) $(XF $W7 $BELT)"
R=$(POST $S work-orders/$W7/parts-transfer "{\"results\":[{\"sparePartId\":$BOARD,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-7\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-7\"}]}")
[ "$(ST $W7)" = "PARTS_IN_TRANSIT" ] && pass "หัวหน้าภาคกรอกโอนเฉพาะชิ้นที่ต้องโอน" || fail "โอนเฉพาะชิ้น: $(ST $W7) $(echo $R | head -c 150)"
POST $S work-orders/$W7/parts-transfer/arrived '{}' >/dev/null
[ "$(ST $W7)" = "PARTS_REQUESTED" ] && pass "ของถึงคลัง 94 → แอดมินเบิกส่งมอบก่อน" || fail "หลังโอนถึง: $(ST $W7)"
POST $A work-orders/$W7/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-M7\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}" >/dev/null
[ "$(ST $W7)|$(PART $W7 $BOARD)" = "PARTS_PICKUP|true|$L94|RQ-M7" ] \
  && pass "แอดมินเบิกชิ้นคลัง 94 → หัวหน้าภาคเบิกชิ้นที่ไม่ต้องโอน (ไม่ถามโอนซ้ำ)" || fail "หลังแอดมินเบิก: $(ST $W7) $(PART $W7 $BOARD)"
POST $S work-orders/$W7/parts-pickup "{\"results\":[{\"sparePartId\":$BELT,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"KB-M7\"}]}" >/dev/null
[ "$(ST $W7)" = "AWAITING_CONFIRM" ] && pass "เบิกครบทุกชิ้น → คอนเฟิร์มลูกค้า" || fail "เบิกครบ: $(ST $W7)"
W8=$(mk BOARD:1 BELT:1); IDS="$IDS $W8"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W8" >/dev/null
POST $A work-orders/$W8/parts-check "$MIX" >/dev/null
POST $S work-orders/$W8/parts-transfer/return '{"reason":"คลังขอนแก่นไม่มีของ"}' >/dev/null
[ "$(ST $W8)|$(XF $W8 $BELT)" = "PARTS_REQUESTED|-|-|-|false" ] \
  && pass "ส่งกลับแอดมิน → ล้าง \"ไม่ต้องโอน\" ให้แอดมินตอบใหม่ทุกชิ้น" || fail "ส่งกลับ: $(ST $W8) $(XF $W8 $BELT)"

echo "═══ ของอยู่คลัง 94 ทั้งหมด — ไม่ผ่านขั้นเหล่านี้ (ใบเก่าที่ถึงขั้นเบิกก่อนนัดวัน)"
W2=$(mk BOARD:1); IDS="$IDS $W2"
# ไม่มีวันนัด = ใบที่เบิกก่อนเปลี่ยนเป็นนัดก่อนเบิก — เบิกเสร็จต้องไปให้หัวหน้าภาคนัดวัน ไม่ใช่คอนเฟิร์มลูกค้า
DB "update \"WorkOrder\" set status='PARTS_REQUESTED' where id=$W2" >/dev/null
POST $A work-orders/$W2/parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-B1\"}]}" >/dev/null
[ "$(ST $W2)|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W2 and (action like 'PICKUP%' or action like 'TRANSFER%')")" = "PARTS_CHECKED|0" ] \
  && pass "แอดมินเบิกเองครบ (ใบเก่า ยังไม่มีวันนัด) → หัวหน้าภาค · นัดวันเข้า" || fail "ใบคลัง 94: $(ST $W2)"

[ -z "$FAILED" ]
