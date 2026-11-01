#!/bin/bash
# ทดสอบ: นัดวัน → เบิกอะไหล่ → คอนเฟิร์มลูกค้า → ปล่อยงาน (เจ้าของงานกำหนด ต.ค. 69 รอบสอง — เดิมคอนเฟิร์มก่อนเบิก)
#   · ใบใช้อะไหล่: นัดแล้วไปขั้นเบิก (ยังไม่โทรร้าน) · เบิกครบคลัง 94 / โอนถึง / หัวหน้าภาคเบิกคลังอื่น → คอนเฟิร์มลูกค้า
#     → ปล่อยงาน · ใบไม่ใช้อะไหล่เหมือนเดิม (นัด → คอนเฟิร์ม → ปล่อยงาน ไม่ผ่านขั้นเบิก)
#   · ใบที่เปิดก่อนสลับลำดับ: คอนเฟิร์มแล้วค้างเบิก → เบิกเสร็จไปปล่อยงานเลย (ไม่โทรซ้ำ) · เบิกก่อนนัด → ไปนัดวัน
#   · migration 20261204090000_confirm_after_issue ย้ายเฉพาะใบรอคอนเฟิร์มที่ยังไม่คอนเฟิร์มและยังไม่ได้เบิก
#     (รันไฟล์ SQL จริงในทรานแซกชันแล้ว ROLLBACK — ใบอื่นในฐานข้อมูลไม่โดน)
#   · ข้อความของไม่พอตอนเบิก: ยังไม่คอนเฟิร์ม = ยกเลิกนัด ไม่ต้องแจ้งร้าน · คอนเฟิร์มแล้ว = แจ้งร้านว่าเลื่อน
#   · detail.flow บอกลำดับที่ใบนี้เดินจริง (target · confirmFirst · issueFirst) ให้แถบขั้นตอนวาด · เลยวันนัดขั้นเบิกติดป้าย
#     confirmFirst เฉพาะเมื่อนัดที่คอนเฟิร์มก่อนเบิกยังใช้อยู่ — ร้านปิดส่งกลับ/ย้ายสายงานแล้ว = target
#     transfer = โอนจริงในรอบนี้ · pickup = หัวหน้าภาคเบิกคลังอื่น (โอนมาก่อนหรือไม่ก็ได้) · ส่งกลับแล้วเบิก 94 = ไม่นับทั้งคู่
#   · migration ซิงก์สถานะเคสเครื่องเสีย (Outage.workStatus) ของใบที่ย้ายด้วย
#   · detail.issueLeft = กฎเดียวกับที่ /assign · /confirm-appointment ใช้ส่งใบต่อ (ของในสโตร์ · ของนอกสโตร์อย่างเดียว ·
#     ของนอกสโตร์ที่เพิ่มหลังเบิกของในสโตร์แล้ว · ย้อนมานัดใหม่หลังเบิก) — เทียบกับขั้นที่ใบไปจริงในฐานข้อมูล
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
. "$(dirname "$0")/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
ST() { DB "select status||'|'||coalesce(\"appointmentStatus\",'-') from \"WorkOrder\" where id=$1"; }
APPT() { DB "select coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::date::text,'-') from \"WorkOrder\" where id=$1"; }
LOGS() { DB "select string_agg(action||':'||status, ',' order by \"createdAt\", id) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action not in ('CREATED','PARTS_REQUESTED','PARTS_SOURCED')"; }
FLOW() { GET $A "work-orders/$1" | J 'const f=d.flow; f?[f.variant,f.transfer,f.quote,f.inspect,f.pickup].join("|"):"none"'; }
# รายการ (กล่องงาน/ชิป) ของใบนี้ — หาด้วยเลขใบงาน ไม่ต้องดึงทั้งหมด
ROW() { GET $1 "work-orders?status=$2&search=$(DB "select code from \"WorkOrder\" where id=$3")" | J "const r=(d.rows||d).find(x=>x.id===$3); r?$4:'missing'"; }
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
D1=$(day 14)
MIG="$(cd "$(dirname "$0")/.." && pwd)/backend/prisma/migrations/20261204090000_confirm_after_issue/migration.sql"

A=$(login A001)
BR=C0006
SUF=$RANDOM
OFFNAME="ของนอกสโตร์ทดสอบย้ายสายงาน$SUF"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
# ใบที่เทสต์นี้สร้างหาจากอาการที่มีเลขสุ่มของรอบนี้ — สร้างใน $(...) ตัวแปรในเชลล์ลูกไม่กลับมา
SYMPTOM="ทดสอบเบิกก่อนคอนเฟิร์ม $SUF"
OUT=""
cleanup() {
  for i in $(DB "select id from \"WorkOrder\" where symptom='$SYMPTOM'"); do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  [ -n "$OUT" ] && DB "delete from \"Outage\" where id=$OUT" >/dev/null
  DB "delete from \"SparePart\" where \"offCatalog\" and name='$OFFNAME'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
# บอร์ดของแต่ละใบ = ตัวที่ตรงยี่ห้อเครื่องของใบนั้น (fx_part) — ทุกใบคนละเครื่อง ยี่ห้ออาจไม่เหมือนกัน
# จึงเลือกต่อใบหลังเปิดใบ (Bn ของใบ Wn) ไม่ใช้บอร์ดตัวเดียวทั้งไฟล์ ที่กฎล็อกยี่ห้อจะปฏิเสธ
L94="คลังลาดพร้าว 94"
mk() {  # $1 เครื่อง → ใบใหม่ (ยังไม่ระบุอะไหล่)
  POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYMPTOM\"}]}" | J 'd.orders[0].id'
}
sourced() {  # $1 เครื่อง $2 คลังที่มีบอร์ด → ใบที่เช็คอะไหล่แล้ว มีครบ (ขั้นนัดวัน)
  local I=$(mk $1) B
  B=$(fx_part "$I" BOARD) || return 1
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$B,\"quantity\":1}]}" >/dev/null
  POST $A "work-orders/$I/parts-sourcing" "{\"results\":[{\"sparePartId\":$B,\"inStock\":true,\"warehouse\":\"$2\"}]}" >/dev/null
  echo $I
}
assign() { POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"${2:-$D1}\"}" >/dev/null; }
issue94() { local B; B=$(fx_part "$1" BOARD) || return 1; POST $A "work-orders/$1/parts-check" "{\"results\":[{\"sparePartId\":$B,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"$2\"}]}" >/dev/null; }

echo "═══ คลัง 94: นัดวัน → แอดมินเบิก → แอดมินคอนเฟิร์มลูกค้า → หัวหน้าภาคปล่อยงาน"
W1=$(sourced W71 "$L94")
[ "$(ST $W1)" = "PARTS_CHECKED|-" ] || fail "เตรียมใบ: $(ST $W1)"
assign $W1
[ "$(ST $W1)|$(APPT $W1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D1" ] \
  && pass "นัดวันแล้วไปขั้นแอดมินเบิก — ทีม/วันนัดอยู่ ยังรอลูกค้าคอนเฟิร์ม (ฐานข้อมูล)" || fail "หลังนัด: $(ST $W1) $(APPT $W1)"
[ "$(DB "select status from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='ASSIGNED'")" = "PARTS_REQUESTED" ] \
  && pass "ประวัติการนัดลงขั้นที่ใบไปจริง (เบิกอะไหล่)" || fail "ประวัติ ASSIGNED: $(DB "select status from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='ASSIGNED'")"
[ "$(ROW $A INBOX $W1 'r.status')" = "PARTS_REQUESTED" ] && [ "$(ROW $S INBOX $W1 'r.status')" = "missing" ] \
  && pass "ขั้นเบิกอยู่ในกล่องงานแอดมิน ไม่อยู่ในกล่องงานหัวหน้าภาค" || fail "กล่องงานขั้นเบิก: A=$(ROW $A INBOX $W1 'r.status') S=$(ROW $S INBOX $W1 'r.status')"
R=$(POST $A "work-orders/$W1/confirm-appointment" '{}')
echo "$R" | grep -q "ยังไม่ถึงขั้นนี้" && [ "$(ST $W1)" = "PARTS_REQUESTED|PENDING" ] \
  && pass "ยังไม่เบิก แอดมินกดคอนเฟิร์มลูกค้าข้ามขั้นไม่ได้ (409 ใบไม่ขยับ)" || fail "คอนเฟิร์มก่อนเบิกได้: $(echo $R | head -c 150)"
issue94 $W1 RQ-CAI1
[ "$(ST $W1)|$(DB "select \"workStatus\" from \"WorkOrder\" where id=$W1")" = "AWAITING_CONFIRM|PENDING|WAITING_TECH" ] \
  && pass "เบิกครบ → แอดมินคอนเฟิร์มลูกค้า (ของอยู่ในมือแล้ว) · สถานะรอช่างเข้าแก้ไข" || fail "หลังเบิก: $(ST $W1)"
[ "$(ROW $A INBOX $W1 'r.status')" = "AWAITING_CONFIRM" ] && [ "$(ROW $S INBOX $W1 'r.status')" = "missing" ] \
  && [ "$(ROW $A AWAITING_CONFIRM $W1 'r.partsState')" = "ISSUED" ] \
  && pass "รอคอนเฟิร์มอยู่ในกล่องงานแอดมิน · ชิปรอคอนเฟิร์มลูกค้ามีใบนี้ · ป้ายอะไหล่ = เบิกแล้ว" || fail "รายการขั้นคอนเฟิร์ม: $(ROW $A AWAITING_CONFIRM $W1 'r.partsState')"
R=$(POST $S "work-orders/$W1/confirm-appointment" '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && [ "$(ST $W1)" = "AWAITING_CONFIRM|PENDING" ] \
  && pass "หัวหน้าภาคกดคอนเฟิร์มลูกค้าแทนแอดมินไม่ได้" || fail "หัวหน้าภาคคอนเฟิร์มได้: $(echo $R | head -c 150)"
POST $A "work-orders/$W1/confirm-appointment" '{}' >/dev/null
[ "$(ST $W1)" = "ASSIGNED|CONFIRMED" ] && pass "คอนเฟิร์มลูกค้าแล้ว → หัวหน้าภาคปล่อยงาน" || fail "หลังคอนเฟิร์ม: $(ST $W1)"
[ "$(FLOW $W1)" = "target|false|false|false|false" ] && pass "detail.flow = target (นัด → เบิก → คอนเฟิร์ม) ไม่มีโอน/เสนอราคา/ตรวจ/เบิกคลังอื่น" || fail "flow: $(FLOW $W1)"
POST $S "work-orders/$W1/dispatch" '{}' >/dev/null
[ "$(ST $W1)" = "IN_PROGRESS|CONFIRMED" ] && pass "ปล่อยงานแล้วถึงช่าง" || fail "หลังปล่อยงาน: $(ST $W1)"
[ "$(LOGS $W1)" = "ASSIGNED:PARTS_REQUESTED,PARTS_CHECKED:AWAITING_CONFIRM,CONFIRMED:ASSIGNED,DISPATCHED:IN_PROGRESS" ] \
  && pass "ประวัติเรียง นัด → เบิก → คอนเฟิร์ม → ปล่อยงาน (ฐานข้อมูล)" || fail "ลำดับประวัติ: $(LOGS $W1)"

echo
echo "═══ คลังอื่น (ต้องโอน): นัด → หัวหน้าภาคเบิก+โอน → ของถึง 94 → แอดมินเบิกส่งมอบ → คอนเฟิร์มลูกค้า"
W2=$(sourced W72 "คลังขอนแก่น")
B2=$(fx_part $W2 BOARD)
assign $W2
POST $A "work-orders/$W2/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$B2,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
[ "$(ST $W2)" = "PARTS_TRANSFER|PENDING" ] && pass "ของคลังอื่น → หัวหน้าภาคเบิกและโอน (ยังไม่คอนเฟิร์ม)" || fail "หลังเช็คคลังอื่น: $(ST $W2)"
POST $S "work-orders/$W2/parts-transfer" "{\"results\":[{\"sparePartId\":$B2,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-CAI\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-CAI\"}]}" >/dev/null
[ "$(ST $W2)" = "PARTS_IN_TRANSIT|PENDING" ] && pass "สั่งโอนแล้ว → รอของถึง" || fail "หลังสั่งโอน: $(ST $W2)"
POST $S "work-orders/$W2/parts-transfer/arrived" '{}' >/dev/null
[ "$(ST $W2)" = "PARTS_REQUESTED|PENDING" ] && pass "ของถึงคลัง 94 → แอดมินเบิกส่งมอบ" || fail "หลังของถึง: $(ST $W2)"
issue94 $W2 RQ-CAI2
[ "$(ST $W2)|$(APPT $W2)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D1" ] && pass "เบิกส่งมอบแล้ว → คอนเฟิร์มลูกค้า วันนัดเดิมอยู่" || fail "หลังเบิกส่งมอบ: $(ST $W2) $(APPT $W2)"
# โอนเข้าคลัง 94 แล้วแอดมินเบิกเอง — มีประวัติ PICKUP_REQUESTED (เขียนทุกครั้งที่มีของคลังอื่น) แต่ไม่มีใครเบิกคลังอื่น
[ "$(FLOW $W2)" = "target|true|false|false|false" ] && pass "detail.flow.transfer = true (ขั้นย่อยใต้เบิกอะไหล่) · pickup = false (ของถึง 94 แอดมินเบิก)" || fail "flow โอน: $(FLOW $W2)"
POST $A "work-orders/$W2/confirm-appointment" '{}' >/dev/null
[ "$(ST $W2)" = "ASSIGNED|CONFIRMED" ] && pass "คอนเฟิร์มลูกค้า → ปล่อยงาน" || fail "หลังคอนเฟิร์ม (โอน): $(ST $W2)"
# PICKUP_REQUESTED ลงสถานะ PARTS_PICKUP เสมอ (เขียนไว้ก่อนเปลี่ยนสายงาน) — ดูเฉพาะลำดับ
[ "$(LOGS $W2)" = "ASSIGNED:PARTS_REQUESTED,PARTS_CHECKED:PARTS_TRANSFER,PICKUP_REQUESTED:PARTS_PICKUP,TRANSFER_REQUESTED:PARTS_IN_TRANSIT,TRANSFER_ARRIVED:PARTS_REQUESTED,PARTS_CHECKED:AWAITING_CONFIRM,CONFIRMED:ASSIGNED" ] \
  && pass "ประวัติ: นัด → ส่งเบิก/โอน → โอนถึง → เบิกส่งมอบ → คอนเฟิร์ม" || fail "ลำดับประวัติ (โอน): $(LOGS $W2)"

echo
echo "═══ คลังอื่นในพื้นที่ (ไม่ต้องโอน): หัวหน้าภาคเบิกส่งมอบ → คอนเฟิร์มลูกค้า"
W3=$(sourced W73 "คลังภูเก็ต")
B3=$(fx_part $W3 BOARD)
assign $W3
POST $A "work-orders/$W3/parts-check" "{\"transfer\":false,\"results\":[{\"sparePartId\":$B3,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
[ "$(ST $W3)" = "PARTS_PICKUP|PENDING" ] && pass "ไม่ต้องโอน → หัวหน้าภาคเบิกคลังอื่น" || fail "หลังเช็ค (ไม่โอน): $(ST $W3)"
[ "$(FLOW $W3 | cut -d'|' -f2,5)" = "false|true" ] && pass "detail.flow: ไม่ได้โอน (transfer=false) · เบิกคลังอื่น (pickup=true) — แถบไม่ติ๊ก \"สั่งโอน\"" || fail "flow เบิกคลังอื่น: $(FLOW $W3)"
POST $S "work-orders/$W3/parts-pickup" "{\"results\":[{\"sparePartId\":$B3,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"PK-CAI3\"}]}" >/dev/null
[ "$(ST $W3)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(DB "select \"requisitionNo\" from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='WAITING'")" = "PK-CAI3" ] \
  && pass "หัวหน้าภาคเบิกแล้ว → แอดมินคอนเฟิร์มลูกค้า (เลขใบเบิกบันทึก)" || fail "หลังเบิกคลังอื่น: $(ST $W3)"
[ "$(FLOW $W3 | cut -d'|' -f2,5)" = "false|true" ] && pass "เบิกเสร็จแล้ว flow ยังบอกว่าเบิกคลังอื่น ไม่ได้โอน" || fail "flow หลังเบิกคลังอื่น: $(FLOW $W3)"

echo
echo "═══ โอนเข้าคลังอื่น (ไม่ใช่ 94) แล้วหัวหน้าภาคเบิกส่งมอบ — transfer + pickup"
W9=$(sourced W89 "คลังขอนแก่น")
B9=$(fx_part $W9 BOARD)
assign $W9
POST $A "work-orders/$W9/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$B9,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
[ "$(FLOW $W9 | cut -d'|' -f2,5)" = "true|false" ] && pass "รอหัวหน้าภาคเบิก+โอน: transfer=true · ยังไม่รู้ปลายทาง pickup=false" || fail "flow W9 ก่อนโอน: $(FLOW $W9)"
POST $S "work-orders/$W9/parts-transfer" "{\"results\":[{\"sparePartId\":$B9,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-CAI9\",\"toWarehouse\":\"คลังภูเก็ต\",\"transferNo\":\"TR-CAI9\"}]}" >/dev/null
POST $S "work-orders/$W9/parts-transfer/arrived" '{}' >/dev/null
[ "$(ST $W9)" = "PARTS_PICKUP|PENDING" ] && [ "$(FLOW $W9 | cut -d'|' -f2,5)" = "true|true" ] \
  && pass "ของถึงคลังภูเก็ต → หัวหน้าภาคเบิกส่งมอบ: transfer=true · pickup=true" || fail "flow W9 ของถึง: $(ST $W9) $(FLOW $W9)"
POST $S "work-orders/$W9/parts-pickup" "{\"results\":[{\"sparePartId\":$B9,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"PK-CAI9\"}]}" >/dev/null
[ "$(ST $W9)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $W9 | cut -d'|' -f2,5)" = "true|true" ] \
  && pass "เบิกส่งมอบแล้ว → คอนเฟิร์มลูกค้า · flow ยังบอกทั้งโอนและเบิกคลังอื่น" || fail "flow W9 หลังเบิก: $(ST $W9) $(FLOW $W9)"

echo
echo "═══ หัวหน้าภาคส่งกลับ (โอน/เบิกไม่ได้) แล้วแอดมินเบิกคลัง 94 — รอบที่ถูกส่งกลับไม่นับ"
W10=$(sourced W90 "คลังขอนแก่น")
B10=$(fx_part $W10 BOARD)
assign $W10
POST $A "work-orders/$W10/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$B10,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
POST $S "work-orders/$W10/parts-transfer" "{\"results\":[{\"sparePartId\":$B10,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-CAI10\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-CAI10\"}]}" >/dev/null
POST $S "work-orders/$W10/parts-transfer/return" '{"reason":"ทดสอบ — ขอนแก่นไม่มีของจริง"}' >/dev/null
[ "$(ST $W10)" = "PARTS_REQUESTED|PENDING" ] || fail "เตรียม W10 ส่งกลับ: $(ST $W10)"
issue94 $W10 RQ-CAI10
[ "$(ST $W10)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $W10 | cut -d'|' -f2,5)" = "false|false" ] \
  && pass "สั่งโอนแล้วถูกส่งกลับ → แอดมินเบิก 94: transfer=false pickup=false (ฐานข้อมูลมี TRANSFER_REQUESTED ก่อนส่งกลับ)" || fail "flow W10: $(ST $W10) $(FLOW $W10)"
[ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W10 and action in ('TRANSFER_REQUESTED','TRANSFER_RETURNED')")" = "2" ] || fail "W10 ประวัติโอน/ส่งกลับไม่ครบ"
W11=$(sourced W91 "คลังภูเก็ต")
B11=$(fx_part $W11 BOARD)
assign $W11
POST $A "work-orders/$W11/parts-check" "{\"transfer\":false,\"results\":[{\"sparePartId\":$B11,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
POST $S "work-orders/$W11/parts-pickup/return" '{"reason":"ทดสอบ — ภูเก็ตไม่มีของจริง"}' >/dev/null
issue94 $W11 RQ-CAI11
[ "$(ST $W11)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $W11 | cut -d'|' -f2,5)" = "false|false" ] \
  && pass "เบิกคลังอื่นถูกส่งกลับ → แอดมินเบิก 94: transfer=false pickup=false" || fail "flow W11: $(ST $W11) $(FLOW $W11)"

echo
echo "═══ ใบไม่ใช้อะไหล่ — เหมือนเดิม: นัด → คอนเฟิร์ม → ปล่อยงาน"
W4=$(mk W74)
POST $S "work-orders/$W4/parts" '{"needsParts":false}' >/dev/null
assign $W4
[ "$(ST $W4)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W4 and status='PARTS_REQUESTED'")" = "0" ] \
  && pass "ไม่ใช้อะไหล่ นัดแล้วไปคอนเฟิร์มลูกค้าเลย ไม่ผ่านขั้นเบิก" || fail "ไม่ใช้อะไหล่: $(ST $W4)"
POST $A "work-orders/$W4/confirm-appointment" '{}' >/dev/null
[ "$(ST $W4)" = "ASSIGNED|CONFIRMED" ] && pass "คอนเฟิร์มแล้วไปปล่อยงาน" || fail "ไม่ใช้อะไหล่หลังคอนเฟิร์ม: $(ST $W4)"

echo
echo "═══ ระบุอะไหล่ชุดเดิมที่เบิกครบแล้ว — นัดแล้วข้ามขั้นเบิก"
W5=$(sourced W75 "$L94")
DB "update \"WorkOrderPart\" set \"requisitionNo\"='RQ-OLD-5' where \"workOrderId\"=$W5" >/dev/null
assign $W5
[ "$(ST $W5)" = "AWAITING_CONFIRM|PENDING" ] && pass "ของเบิกไว้ครบแล้ว นัดแล้วไปคอนเฟิร์มลูกค้าเลย (ไม่เบิกซ้ำ)" || fail "เบิกครบแล้วนัด: $(ST $W5)"

echo
echo "═══ ใบที่เปิดก่อนสลับลำดับ"
# X1: รอคอนเฟิร์มทั้งที่ยังไม่เบิก (สายงานเดิม ยังไม่ได้ย้าย) → คอนเฟิร์ม → เบิก → ปล่อยงานเลย ไม่โทรซ้ำ
X1=$(sourced W76 "$L94")
assign $X1
DB "update \"WorkOrder\" set status='AWAITING_CONFIRM', \"workStatus\"='WAITING_TECH' where id=$X1; update \"WorkOrderLog\" set status='AWAITING_CONFIRM' where \"workOrderId\"=$X1 and action='ASSIGNED'" >/dev/null
POST $A "work-orders/$X1/confirm-appointment" '{}' >/dev/null
[ "$(ST $X1)" = "PARTS_REQUESTED|CONFIRMED" ] && pass "คอนเฟิร์มใบเดิมที่ยังไม่เบิก → ไปขั้นเบิก (ทางสำรองของใบที่ไม่ได้ย้าย)" || fail "X1 หลังคอนเฟิร์ม: $(ST $X1)"
[ "$(FLOW $X1)" = "confirmFirst|false|false|false|false" ] && pass "detail.flow = confirmFirst (คอนเฟิร์มก่อนเบิก)" || fail "flow X1: $(FLOW $X1)"
issue94 $X1 RQ-CAIX1
[ "$(ST $X1)" = "ASSIGNED|CONFIRMED" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$X1 and action='CONFIRMED'")" = "1" ] \
  && pass "เบิกครบ → ปล่อยงานเลย ไม่วนไปคอนเฟิร์มซ้ำ" || fail "X1 หลังเบิก: $(ST $X1)"
[ "$(FLOW $X1)" = "confirmFirst|false|false|false|false" ] && pass "ปล่อยงานแล้ว flow ยังเป็น confirmFirst (แถบวาดตามที่เกิดจริง)" || fail "flow X1 หลังเบิก: $(FLOW $X1)"
# ร้านปิด → นัดกลับเป็นรอคอนเฟิร์ม (ไม่มีประวัตินัดใหม่) — ของเบิกแล้ว คอนเฟิร์มรอบหน้าไปปล่อยงาน = สายงานปัจจุบัน
POST $S "work-orders/$X1/dispatch" '{}' >/dev/null
POST $A "work-orders/$X1/reassess-parts" '{"reasonCode":"SHOP","reason":"ทดสอบ — ไปถึงร้านปิด"}' >/dev/null
[ "$(ST $X1)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $X1 | cut -d'|' -f1)" = "target" ] \
  && pass "ร้านปิดส่งกลับ (เบิกแล้ว รอคอนเฟิร์มใหม่): flow = target ไม่วาดคอนเฟิร์มก่อนเบิก" || fail "flow X1 หลังร้านปิด: $(ST $X1) $(FLOW $X1)"
POST $A "work-orders/$X1/confirm-appointment" '{}' >/dev/null
[ "$(ST $X1)" = "ASSIGNED|CONFIRMED" ] && [ "$(FLOW $X1 | cut -d'|' -f1)" = "target" ] \
  && pass "คอนเฟิร์มใหม่ → ปล่อยงาน: flow ยังเป็น target (ไม่สลับกลับ)" || fail "flow X1 หลังคอนเฟิร์มใหม่: $(ST $X1) $(FLOW $X1)"
# ใบสายงานเดิมที่ถูกย้อนจากขั้นเบิกไปรอคอนเฟิร์ม แล้ว migration ย้ายกลับมาขั้นเบิก (นัดรอคอนเฟิร์ม) — เบิกแล้วไปคอนเฟิร์ม
X4=$(sourced W92 "$L94")
assign $X4
DB "update \"WorkOrder\" set status='AWAITING_CONFIRM', \"workStatus\"='WAITING_TECH' where id=$X4" >/dev/null
POST $A "work-orders/$X4/confirm-appointment" '{}' >/dev/null
[ "$(ST $X4)" = "PARTS_REQUESTED|CONFIRMED" ] || fail "เตรียม X4: $(ST $X4)"
DB "update \"WorkOrder\" set \"appointmentStatus\"='PENDING' where id=$X4; insert into \"WorkOrderLog\"(\"workOrderId\",action,status,note,\"createdAt\") values ($X4,'FLOW_MIGRATED','PARTS_REQUESTED','ทดสอบ — ย้อนแล้วย้ายสายงาน',now())" >/dev/null
[ "$(FLOW $X4 | cut -d'|' -f1)" = "target" ] && pass "ขั้นเบิก นัดกลับเป็นรอคอนเฟิร์ม (มีคอนเฟิร์มเก่าในประวัติ): flow = target" || fail "flow X4: $(FLOW $X4)"
issue94 $X4 RQ-CAIX4
[ "$(ST $X4)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $X4 | cut -d'|' -f1)" = "target" ] \
  && pass "เบิกแล้วไปคอนเฟิร์มลูกค้าตามที่แถบวาด" || fail "X4 หลังเบิก: $(ST $X4) $(FLOW $X4)"
# X2: คอนเฟิร์มแล้ว ของกำลังโอน (สายงานเดิม) → ของถึง → เบิกส่งมอบ → ปล่อยงาน
X2=$(sourced W77 "คลังขอนแก่น")
BX2=$(fx_part $X2 BOARD)
assign $X2
DB "update \"WorkOrder\" set \"appointmentStatus\"='CONFIRMED' where id=$X2" >/dev/null
POST $A "work-orders/$X2/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$BX2,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
POST $S "work-orders/$X2/parts-transfer" "{\"results\":[{\"sparePartId\":$BX2,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-X2\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-X2\"}]}" >/dev/null
[ "$(ST $X2)" = "PARTS_IN_TRANSIT|CONFIRMED" ] && [ "$(FLOW $X2 | cut -d'|' -f1-2)" = "confirmFirst|true" ] \
  && pass "ใบคอนเฟิร์มแล้วระหว่างโอน: flow = confirmFirst + โอน" || fail "X2 ระหว่างโอน: $(ST $X2) $(FLOW $X2)"
POST $S "work-orders/$X2/parts-transfer/arrived" '{}' >/dev/null
issue94 $X2 RQ-CAIX2
[ "$(ST $X2)" = "ASSIGNED|CONFIRMED" ] && pass "คอนเฟิร์มแล้ว ของโอนถึง → เบิกส่งมอบ → ปล่อยงานเลย" || fail "X2 หลังเบิก: $(ST $X2)"
# X3: เบิกก่อนนัด (ใบก่อนเปลี่ยนเป็นนัดก่อนเบิก — ยังไม่มีวันนัด) → หัวหน้าภาคนัดวัน → คอนเฟิร์ม
X3=$(sourced W78 "$L94")
DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"workStatus\"='CHECKING_PARTS' where id=$X3" >/dev/null
issue94 $X3 RQ-CAIX3
[ "$(ST $X3)" = "PARTS_CHECKED|-" ] && pass "เบิกครบแต่ยังไม่มีวันนัด → หัวหน้าภาคนัดวันเข้า" || fail "X3 หลังเบิก: $(ST $X3)"
[ "$(FLOW $X3 | cut -d'|' -f1)" = "issueFirst" ] && pass "detail.flow = issueFirst (เบิกก่อนนัด)" || fail "flow X3: $(FLOW $X3)"
assign $X3
[ "$(ST $X3)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(FLOW $X3 | cut -d'|' -f1)" = "issueFirst" ] \
  && pass "นัดแล้วข้ามขั้นเบิก ไปคอนเฟิร์มลูกค้า · flow ยังเป็น issueFirst" || fail "X3 หลังนัด: $(ST $X3) $(FLOW $X3)"

echo
echo "═══ เลยวันนัดระหว่างเบิก — ป้ายเลยนัดขึ้น (แอดมินต้องเลื่อนวันนัด/โทรนัดใหม่)"
W6=$(sourced W79 "$L94")
assign $W6
[ "$(ROW $A ALL $W6 'String(r.overdue)')" = "false" ] || fail "ยังไม่เลยนัดแต่ขึ้นป้าย"
DB "update \"WorkOrder\" set \"scheduledAt\"='$(day -2)' where id=$W6" >/dev/null
[ "$(ROW $A ALL $W6 'String(r.overdue)')" = "true" ] && pass "ขั้นเบิกที่วันนัดผ่านไปแล้ว ติดป้ายเลยนัด" || fail "overdue ขั้นเบิก: $(ROW $A ALL $W6 'String(r.overdue)')"

echo
echo "═══ ของไม่พอตอนเบิก — ข้อความตามสถานะนัด"
W7=$(sourced W80 "$L94")
B7=$(fx_part $W7 BOARD)
assign $W7
R=$(POST $A "work-orders/$W7/parts-check" "{\"results\":[{\"sparePartId\":$B7,\"inStock\":false}]}")
echo "$R" | grep -q "ของไม่พอ — ยกเลิกนัด รอของเข้า" && ! echo "$R" | grep -q "แจ้งเลื่อนนัด" && [ "$(ST $W7)" = "PARTS_REQUESTED|PENDING" ] \
  && pass "ยังไม่คอนเฟิร์มลูกค้า: บอกปุ่ม “ยกเลิกนัด รอของเข้า” (ใบไม่ขยับ)" || fail "ข้อความ PENDING: $(echo $R | head -c 200)"
POST $A "work-orders/$W7/parts-short" "{\"sparePartIds\":[$B7]}" >/dev/null
N=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W7 and action='PARTS_SHORT'")
[ "$(ST $W7)|$(APPT $W7)" = "PARTS_SOURCING|-|-|-" ] && echo "$N" | grep -q "ไม่ต้องแจ้งร้าน" && ! echo "$N" | grep -q "แจ้งร้านว่าเลื่อน" \
  && pass "ยังไม่คอนเฟิร์ม: ล้างนัด กลับเช็คอะไหล่ ประวัติบอกไม่ต้องแจ้งร้าน (ฐานข้อมูล)" || fail "PARTS_SHORT PENDING: $(ST $W7) $(APPT $W7) · $N"
W8=$(sourced W81 "$L94")
B8=$(fx_part $W8 BOARD)
assign $W8
DB "update \"WorkOrder\" set \"appointmentStatus\"='CONFIRMED' where id=$W8" >/dev/null
R=$(POST $A "work-orders/$W8/parts-check" "{\"results\":[{\"sparePartId\":$B8,\"inStock\":false}]}")
echo "$R" | grep -q "ของไม่พอ — แจ้งเลื่อนนัด" && [ "$(ST $W8)" = "PARTS_REQUESTED|CONFIRMED" ] \
  && pass "คอนเฟิร์มลูกค้าแล้ว (สายงานเดิม): บอกปุ่ม “แจ้งเลื่อนนัด”" || fail "ข้อความ CONFIRMED: $(echo $R | head -c 200)"
POST $A "work-orders/$W8/parts-short" "{\"sparePartIds\":[$B8]}" >/dev/null
N=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W8 and action='PARTS_SHORT'")
[ "$(ST $W8)|$(APPT $W8)" = "PARTS_SOURCING|-|-|-" ] && echo "$N" | grep -q "แจ้งร้านว่าเลื่อน" \
  && pass "คอนเฟิร์มแล้ว: ล้างนัด ประวัติบอกให้แอดมินแจ้งร้านว่าเลื่อน (ฐานข้อมูล)" || fail "PARTS_SHORT CONFIRMED: $(ST $W8) · $N"

echo
echo "═══ detail.issueLeft — ค่าเดียวกับที่ /assign ใช้ตัดสินว่าใบไปขั้นเบิก (แถบขั้นตอน/ฟอร์มอ่านค่านี้)"
IL() { GET $A "work-orders/$1" | J 'String(d.issueLeft)'; }
I1=$(sourced W93 "$L94")
[ "$(IL $I1)" = "true" ] || fail "ของในสโตร์ยังไม่เบิก (ขั้นนัดวัน): issueLeft=$(IL $I1)"
assign $I1
[ "$(IL $I1)|$(ST $I1)" = "true|PARTS_REQUESTED|PENDING" ] \
  && pass "ของในสโตร์ยังไม่มีเลขใบเบิก: issueLeft=true · /assign ส่งไปขั้นเบิกจริง (ฐานข้อมูล)" || fail "I1 ก่อนเบิก: $(IL $I1) $(ST $I1)"
issue94 $I1 RQ-IL1
[ "$(IL $I1)|$(ST $I1)" = "false|AWAITING_CONFIRM|PENDING" ] && pass "เบิกครบแล้ว: issueLeft=false" || fail "I1 หลังเบิก: $(IL $I1) $(ST $I1)"
[ "$(IL $W4)" = "false" ] && pass "ไม่ใช้อะไหล่: issueLeft=false" || fail "ไม่ใช้อะไหล่: $(IL $W4)"
# ของนอกสโตร์อย่างเดียว — ไม่มีเลขใบเบิก ตัดสินจากว่าแอดมินผ่านขั้นเบิกหลังรอบเช็คล่าสุดหรือยัง
I2=$(mk W94)
POST $S "work-orders/$I2/parts" "{\"needsParts\":true,\"offParts\":[{\"name\":\"$OFFNAME\",\"quantity\":1}]}" >/dev/null
OFF=$(DB "select id from \"SparePart\" where \"offCatalog\" and name='$OFFNAME'")
POST $A "work-orders/$I2/parts-sourcing" "{\"results\":[{\"sparePartId\":$OFF,\"inStock\":true}]}" >/dev/null
# ขั้นเสนอราคาไม่ใช่เรื่องของเทสต์นี้ — พาใบไปขั้นนัดวันเข้าในฐานข้อมูล
DB "update \"WorkOrder\" set status='PARTS_CHECKED' where id=$I2" >/dev/null
[ "$(IL $I2)" = "true" ] || fail "ของนอกสโตร์ยังไม่ผ่านขั้นเบิก: issueLeft=$(IL $I2)"
assign $I2
[ "$(ST $I2)" = "PARTS_REQUESTED|PENDING" ] && pass "ของนอกสโตร์อย่างเดียว ยังไม่ผ่านขั้นเบิก: issueLeft=true · /assign ไปขั้นเบิก (ฐานข้อมูล)" || fail "I2 หลังนัด: $(ST $I2)"
POST $A "work-orders/$I2/parts-check" "{\"results\":[{\"sparePartId\":$OFF,\"inStock\":true}]}" >/dev/null
[ "$(IL $I2)|$(ST $I2)" = "false|AWAITING_CONFIRM|PENDING" ] && pass "แอดมินผ่านขั้นเบิกของนอกสโตร์แล้ว: issueLeft=false" || fail "I2 หลังเบิก: $(IL $I2) $(ST $I2)"
# เบิกแล้ว คอนเฟิร์มแล้ว แล้วย้อนกลับมานัดวันเข้า — แถบเคยวาด "เบิกอะไหล่" เป็นขั้นที่ยังต้องทำ ทั้งที่ /assign ข้ามไปคอนเฟิร์ม
POST $A "work-orders/$I2/confirm-appointment" '{}' >/dev/null
R=$(POST $A "work-orders/$I2/rollback" '{"toStage":"PARTS_CHECKED","reason":"ทดสอบ — ย้อนมานัดใหม่"}')
[ "$(ST $I2 | cut -d'|' -f1)" = "PARTS_CHECKED" ] || fail "ย้อน I2: $(ST $I2) $(echo $R | head -c 150)"
[ "$(IL $I2)" = "false" ] || fail "ย้อนมานัดใหม่หลังเบิกของนอกสโตร์: issueLeft=$(IL $I2)"
assign $I2
[ "$(ST $I2)" = "AWAITING_CONFIRM|PENDING" ] && pass "ย้อนมานัดใหม่หลังเบิกของนอกสโตร์: issueLeft=false · /assign ข้ามขั้นเบิกไปคอนเฟิร์ม (ฐานข้อมูล)" || fail "I2 นัดใหม่: $(ST $I2)"
# ของในสโตร์เบิกแล้ว แล้วมีของนอกสโตร์เพิ่มเข้ามา (ระบุอะไหล่ใหม่เก็บแถวที่เบิกแล้วไว้ — mergeWaitingParts)
I3=$(sourced W95 "$L94")
DB "update \"WorkOrderPart\" set \"requisitionNo\"='RQ-IL3' where \"workOrderId\"=$I3" >/dev/null
[ "$(IL $I3)" = "false" ] || fail "ของในสโตร์เบิกครบ: issueLeft=$(IL $I3)"
DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",kind,quantity,\"inStock\") values ($I3,$OFF,'WAITING',1,true)" >/dev/null
[ "$(IL $I3)" = "true" ] || fail "เพิ่มของนอกสโตร์หลังเบิก: issueLeft=$(IL $I3)"
assign $I3
[ "$(ST $I3)" = "PARTS_REQUESTED|PENDING" ] && pass "ของในสโตร์เบิกแล้ว + ของนอกสโตร์ที่เพิ่มทีหลัง: issueLeft=true · /assign ไปขั้นเบิก (ฐานข้อมูล)" || fail "I3 หลังนัด: $(ST $I3)"

echo
echo "═══ migration ย้ายใบรอคอนเฟิร์มที่ยังไม่เบิก (รันไฟล์จริงแล้ว ROLLBACK)"
# M1: รอคอนเฟิร์ม ยังไม่เบิก (ของในสโตร์) → ย้าย · M2: รอคอนเฟิร์ม คอนเฟิร์มแล้ว (ใบเก่าที่ลูกค้าตกลงไปแล้ว) → ไม่แตะ
# M3: รอคอนเฟิร์ม เบิกครบแล้ว (ร้านปิด วนกลับมาคอนเฟิร์ม) → ไม่แตะ · M4: ไม่ใช้อะไหล่ → ไม่แตะ
# M5: ของนอกสโตร์ ยังไม่ผ่านขั้นเบิกรอบนี้ → ย้าย · M6: ของนอกสโตร์ผ่านขั้นเบิกแล้ว → ไม่แตะ · M7: อยู่ขั้นเบิกอยู่แล้ว → ไม่แตะ
toConfirm() { DB "update \"WorkOrder\" set status='AWAITING_CONFIRM', \"workStatus\"='WAITING_TECH', \"assignedTeam\"='$TEAM', \"scheduledAt\"='$D1', \"appointmentStatus\"='${2:-PENDING}' where id=$1" >/dev/null; }
M1=$(sourced W82 "$L94"); toConfirm $M1
M2=$(sourced W83 "$L94"); toConfirm $M2 CONFIRMED
M3=$(sourced W84 "$L94"); toConfirm $M3
DB "update \"WorkOrderPart\" set \"requisitionNo\"='RQ-MIG-3' where \"workOrderId\"=$M3" >/dev/null
M4=$(mk W85); POST $S "work-orders/$M4/parts" '{"needsParts":false}' >/dev/null; toConfirm $M4
offwo() {
  local I=$(mk $1)
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"offParts\":[{\"name\":\"$OFFNAME\",\"quantity\":1}]}" >/dev/null
  local OFF=$(DB "select id from \"SparePart\" where \"offCatalog\" and name='$OFFNAME'")
  POST $A "work-orders/$I/parts-sourcing" "{\"results\":[{\"sparePartId\":$OFF,\"inStock\":true}]}" >/dev/null
  toConfirm $I; echo $I
}
M5=$(offwo W86)
M6=$(offwo W87)
DB "insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($M6,(select id from \"User\" where \"employeeCode\"='A001'),'PARTS_CHECKED','AWAITING_CONFIRM','ทดสอบ — ของนอกสโตร์ผ่านขั้นเบิกแล้ว',now())" >/dev/null
M7=$(sourced W88 "$L94"); assign $M7
# M8: ผูกเคสเครื่องเสีย รอคอนเฟิร์ม ยังไม่เบิก → ย้าย และสถานะบนเคสต้องตาม (กระดาน/ตัวกรองอ่านจากเคส)
OUT=$(DB "insert into \"Outage\"(kind,\"branchId\",\"startedAt\",\"lastSeenAt\") select 'MACHINE_OFF',id,now(),now() from \"Branch\" where code='$BR' returning id" | head -1)
M8=$(POST $A "work-orders/from-outage/$OUT" "{\"jobType\":\"CM\",\"symptom\":\"$SYMPTOM\"}" | J 'd.id')
BM8=$(fx_part $M8 BOARD)
POST $S "work-orders/$M8/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BM8,\"quantity\":1}]}" >/dev/null
POST $A "work-orders/$M8/parts-sourcing" "{\"results\":[{\"sparePartId\":$BM8,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
toConfirm $M8
DB "update \"Outage\" set \"workStatus\"='WAITING_TECH' where id=$OUT" >/dev/null
GOT=$(PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\i $MIG
SELECT w.id||'|'||w.status||'|'||coalesce(w."workStatus",'-')||'|'||coalesce(w."appointmentStatus",'-')||'|'||coalesce(w."assignedTeam",'-')||'|'||coalesce(w."scheduledAt"::date::text,'-')||'|'||
  (SELECT count(*) FROM "WorkOrderLog" l WHERE l."workOrderId"=w.id AND l.action='FLOW_MIGRATED' AND l.status='PARTS_REQUESTED')
FROM "WorkOrder" w WHERE w.id IN ($M1,$M2,$M3,$M4,$M5,$M6,$M7,$M8) ORDER BY w.id;
SELECT 'outage|'||coalesce("workStatus",'-') FROM "Outage" WHERE id=$OUT;
ROLLBACK;
SQL
)
row() { echo "$GOT" | grep "^$1|" | cut -d'|' -f2-; }
[ "$(row $M1)" = "PARTS_REQUESTED|CHECKING_PARTS|PENDING|$TEAM|$D1|1" ] \
  && pass "ยังไม่คอนเฟิร์ม ยังไม่เบิก → ขั้นเบิก · ทีม/วัน/รอคอนเฟิร์มอยู่ · มีประวัติย้าย" || fail "M1: $(row $M1)"
[ "$(row $M5)" = "PARTS_REQUESTED|CHECKING_PARTS|PENDING|$TEAM|$D1|1" ] && pass "ของนอกสโตร์ที่ยังไม่ผ่านขั้นเบิกรอบนี้ → ย้ายด้วย" || fail "M5: $(row $M5)"
[ "$(row $M2)" = "AWAITING_CONFIRM|WAITING_TECH|CONFIRMED|$TEAM|$D1|0" ] && pass "คอนเฟิร์มแล้ว → ไม่แตะ (เบิกเสร็จไปปล่อยงาน)" || fail "M2: $(row $M2)"
[ "$(row $M3)" = "AWAITING_CONFIRM|WAITING_TECH|PENDING|$TEAM|$D1|0" ] && pass "เบิกครบแล้ว (วนกลับมาคอนเฟิร์ม) → ไม่แตะ" || fail "M3: $(row $M3)"
[ "$(row $M4)" = "AWAITING_CONFIRM|WAITING_TECH|PENDING|$TEAM|$D1|0" ] && pass "ไม่ใช้อะไหล่ → ไม่แตะ" || fail "M4: $(row $M4)"
[ "$(row $M6)" = "AWAITING_CONFIRM|WAITING_TECH|PENDING|$TEAM|$D1|0" ] && pass "ของนอกสโตร์ผ่านขั้นเบิกแล้ว → ไม่แตะ" || fail "M6: $(row $M6)"
[ "$(row $M7 | cut -d'|' -f1,6)" = "PARTS_REQUESTED|0" ] && pass "อยู่ขั้นเบิกอยู่แล้ว → ไม่แตะ ไม่มีประวัติย้ายซ้ำ" || fail "M7: $(row $M7)"
[ "$(row $M8 | cut -d'|' -f1,2)|$(row outage)" = "PARTS_REQUESTED|CHECKING_PARTS|CHECKING_PARTS" ] \
  && pass "ใบผูกเคสเครื่องเสีย: ย้ายไปขั้นเบิก และ Outage.workStatus ตามเป็นกำลังเช็คอะไหล่ (ไม่ค้างรอช่าง)" || fail "M8: $(row $M8) เคส=$(row outage)"
[ "$(DB "select coalesce(\"workStatus\",'-') from \"Outage\" where id=$OUT")" = "WAITING_TECH" ] || fail "ROLLBACK แล้วเคสไม่กลับ"
[ "$(DB "select string_agg(status,',' order by id) from \"WorkOrder\" where id in ($M1,$M5)")|$(DB "select count(*) from \"WorkOrderLog\" where action='FLOW_MIGRATED' and \"workOrderId\" in ($M1,$M5)")" = "AWAITING_CONFIRM,AWAITING_CONFIRM|0" ] \
  && pass "ROLLBACK แล้วฐานข้อมูลกลับเหมือนเดิม (ไม่กระทบใบอื่น)" || fail "ROLLBACK ไม่กลับ"
# ใบที่ย้ายแล้วเดินต่อได้: เบิก → คอนเฟิร์ม → ปล่อยงาน (จำลองผลย้ายในฐานข้อมูลจริง)
DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"workStatus\"='CHECKING_PARTS' where id=$M1" >/dev/null
issue94 $M1 RQ-MIG-1
POST $A "work-orders/$M1/confirm-appointment" '{}' >/dev/null
[ "$(ST $M1)" = "ASSIGNED|CONFIRMED" ] && pass "ใบที่ย้ายแล้ว เบิก → คอนเฟิร์ม → ปล่อยงานตามสายงานใหม่" || fail "M1 หลังย้าย: $(ST $M1)"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
