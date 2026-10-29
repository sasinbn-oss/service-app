#!/bin/bash
# ทดสอบ: นัดวัน → เบิกอะไหล่ → คอนเฟิร์มลูกค้า → ปล่อยงาน (เจ้าของงานกำหนด ต.ค. 69 รอบสอง — เดิมคอนเฟิร์มก่อนเบิก)
#   · ใบใช้อะไหล่: นัดแล้วไปขั้นเบิก (ยังไม่โทรร้าน) · เบิกครบคลัง 94 / โอนถึง / หัวหน้าภาคเบิกคลังอื่น → คอนเฟิร์มลูกค้า
#     → ปล่อยงาน · ใบไม่ใช้อะไหล่เหมือนเดิม (นัด → คอนเฟิร์ม → ปล่อยงาน ไม่ผ่านขั้นเบิก)
#   · ใบที่เปิดก่อนสลับลำดับ: คอนเฟิร์มแล้วค้างเบิก → เบิกเสร็จไปปล่อยงานเลย (ไม่โทรซ้ำ) · เบิกก่อนนัด → ไปนัดวัน
#   · migration 20261204090000_confirm_after_issue ย้ายเฉพาะใบรอคอนเฟิร์มที่ยังไม่คอนเฟิร์มและยังไม่ได้เบิก
#     (รันไฟล์ SQL จริงในทรานแซกชันแล้ว ROLLBACK — ใบอื่นในฐานข้อมูลไม่โดน)
#   · ข้อความของไม่พอตอนเบิก: ยังไม่คอนเฟิร์ม = ยกเลิกนัด ไม่ต้องแจ้งร้าน · คอนเฟิร์มแล้ว = แจ้งร้านว่าเลื่อน
#   · detail.flow บอกลำดับที่ใบนี้เดินจริง (target · confirmFirst · issueFirst) ให้แถบขั้นตอนวาด · เลยวันนัดขั้นเบิกติดป้าย
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
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
FLOW() { GET $A "work-orders/$1" | J 'const f=d.flow; f?[f.variant,f.transfer,f.quote,f.inspect].join("|"):"none"'; }
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
cleanup() {
  for i in $(DB "select id from \"WorkOrder\" where symptom='$SYMPTOM'"); do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"SparePart\" where \"offCatalog\" and name='$OFFNAME'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
L94="คลังลาดพร้าว 94"
mk() {  # $1 เครื่อง → ใบใหม่ (ยังไม่ระบุอะไหล่)
  POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYMPTOM\"}]}" | J 'd.orders[0].id'
}
sourced() {  # $1 เครื่อง $2 คลังที่มีบอร์ด → ใบที่เช็คอะไหล่แล้ว มีครบ (ขั้นนัดวัน)
  local I=$(mk $1)
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1}]}" >/dev/null
  POST $A "work-orders/$I/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$2\"}]}" >/dev/null
  echo $I
}
assign() { POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"${2:-$D1}\"}" >/dev/null; }
issue94() { POST $A "work-orders/$1/parts-check" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"$2\"}]}" >/dev/null; }

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
[ "$(FLOW $W1)" = "target|false|false|false" ] && pass "detail.flow = target (นัด → เบิก → คอนเฟิร์ม) ไม่มีโอน/เสนอราคา/ตรวจ" || fail "flow: $(FLOW $W1)"
POST $S "work-orders/$W1/dispatch" '{}' >/dev/null
[ "$(ST $W1)" = "IN_PROGRESS|CONFIRMED" ] && pass "ปล่อยงานแล้วถึงช่าง" || fail "หลังปล่อยงาน: $(ST $W1)"
[ "$(LOGS $W1)" = "ASSIGNED:PARTS_REQUESTED,PARTS_CHECKED:AWAITING_CONFIRM,CONFIRMED:ASSIGNED,DISPATCHED:IN_PROGRESS" ] \
  && pass "ประวัติเรียง นัด → เบิก → คอนเฟิร์ม → ปล่อยงาน (ฐานข้อมูล)" || fail "ลำดับประวัติ: $(LOGS $W1)"

echo
echo "═══ คลังอื่น (ต้องโอน): นัด → หัวหน้าภาคเบิก+โอน → ของถึง 94 → แอดมินเบิกส่งมอบ → คอนเฟิร์มลูกค้า"
W2=$(sourced W72 "คลังขอนแก่น")
assign $W2
POST $A "work-orders/$W2/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
[ "$(ST $W2)" = "PARTS_TRANSFER|PENDING" ] && pass "ของคลังอื่น → หัวหน้าภาคเบิกและโอน (ยังไม่คอนเฟิร์ม)" || fail "หลังเช็คคลังอื่น: $(ST $W2)"
POST $S "work-orders/$W2/parts-transfer" "{\"results\":[{\"sparePartId\":$BOARD,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-CAI\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-CAI\"}]}" >/dev/null
[ "$(ST $W2)" = "PARTS_IN_TRANSIT|PENDING" ] && pass "สั่งโอนแล้ว → รอของถึง" || fail "หลังสั่งโอน: $(ST $W2)"
POST $S "work-orders/$W2/parts-transfer/arrived" '{}' >/dev/null
[ "$(ST $W2)" = "PARTS_REQUESTED|PENDING" ] && pass "ของถึงคลัง 94 → แอดมินเบิกส่งมอบ" || fail "หลังของถึง: $(ST $W2)"
issue94 $W2 RQ-CAI2
[ "$(ST $W2)|$(APPT $W2)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D1" ] && pass "เบิกส่งมอบแล้ว → คอนเฟิร์มลูกค้า วันนัดเดิมอยู่" || fail "หลังเบิกส่งมอบ: $(ST $W2) $(APPT $W2)"
[ "$(FLOW $W2)" = "target|true|false|false" ] && pass "detail.flow.transfer = true (ขั้นย่อยใต้เบิกอะไหล่)" || fail "flow โอน: $(FLOW $W2)"
POST $A "work-orders/$W2/confirm-appointment" '{}' >/dev/null
[ "$(ST $W2)" = "ASSIGNED|CONFIRMED" ] && pass "คอนเฟิร์มลูกค้า → ปล่อยงาน" || fail "หลังคอนเฟิร์ม (โอน): $(ST $W2)"
# PICKUP_REQUESTED ลงสถานะ PARTS_PICKUP เสมอ (เขียนไว้ก่อนเปลี่ยนสายงาน) — ดูเฉพาะลำดับ
[ "$(LOGS $W2)" = "ASSIGNED:PARTS_REQUESTED,PARTS_CHECKED:PARTS_TRANSFER,PICKUP_REQUESTED:PARTS_PICKUP,TRANSFER_REQUESTED:PARTS_IN_TRANSIT,TRANSFER_ARRIVED:PARTS_REQUESTED,PARTS_CHECKED:AWAITING_CONFIRM,CONFIRMED:ASSIGNED" ] \
  && pass "ประวัติ: นัด → ส่งเบิก/โอน → โอนถึง → เบิกส่งมอบ → คอนเฟิร์ม" || fail "ลำดับประวัติ (โอน): $(LOGS $W2)"

echo
echo "═══ คลังอื่นในพื้นที่ (ไม่ต้องโอน): หัวหน้าภาคเบิกส่งมอบ → คอนเฟิร์มลูกค้า"
W3=$(sourced W73 "คลังภูเก็ต")
assign $W3
POST $A "work-orders/$W3/parts-check" "{\"transfer\":false,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
[ "$(ST $W3)" = "PARTS_PICKUP|PENDING" ] && pass "ไม่ต้องโอน → หัวหน้าภาคเบิกคลังอื่น" || fail "หลังเช็ค (ไม่โอน): $(ST $W3)"
POST $S "work-orders/$W3/parts-pickup" "{\"results\":[{\"sparePartId\":$BOARD,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"PK-CAI3\"}]}" >/dev/null
[ "$(ST $W3)" = "AWAITING_CONFIRM|PENDING" ] && [ "$(DB "select \"requisitionNo\" from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='WAITING'")" = "PK-CAI3" ] \
  && pass "หัวหน้าภาคเบิกแล้ว → แอดมินคอนเฟิร์มลูกค้า (เลขใบเบิกบันทึก)" || fail "หลังเบิกคลังอื่น: $(ST $W3)"

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
[ "$(FLOW $X1)" = "confirmFirst|false|false|false" ] && pass "detail.flow = confirmFirst (คอนเฟิร์มก่อนเบิก)" || fail "flow X1: $(FLOW $X1)"
issue94 $X1 RQ-CAIX1
[ "$(ST $X1)" = "ASSIGNED|CONFIRMED" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$X1 and action='CONFIRMED'")" = "1" ] \
  && pass "เบิกครบ → ปล่อยงานเลย ไม่วนไปคอนเฟิร์มซ้ำ" || fail "X1 หลังเบิก: $(ST $X1)"
[ "$(FLOW $X1)" = "confirmFirst|false|false|false" ] && pass "ปล่อยงานแล้ว flow ยังเป็น confirmFirst (แถบวาดตามที่เกิดจริง)" || fail "flow X1 หลังเบิก: $(FLOW $X1)"
# X2: คอนเฟิร์มแล้ว ของกำลังโอน (สายงานเดิม) → ของถึง → เบิกส่งมอบ → ปล่อยงาน
X2=$(sourced W77 "คลังขอนแก่น")
assign $X2
DB "update \"WorkOrder\" set \"appointmentStatus\"='CONFIRMED' where id=$X2" >/dev/null
POST $A "work-orders/$X2/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
POST $S "work-orders/$X2/parts-transfer" "{\"results\":[{\"sparePartId\":$BOARD,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-X2\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-X2\"}]}" >/dev/null
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
assign $W7
R=$(POST $A "work-orders/$W7/parts-check" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false}]}")
echo "$R" | grep -q "ของไม่พอ — ยกเลิกนัด รอของเข้า" && ! echo "$R" | grep -q "แจ้งเลื่อนนัด" && [ "$(ST $W7)" = "PARTS_REQUESTED|PENDING" ] \
  && pass "ยังไม่คอนเฟิร์มลูกค้า: บอกปุ่ม “ยกเลิกนัด รอของเข้า” (ใบไม่ขยับ)" || fail "ข้อความ PENDING: $(echo $R | head -c 200)"
POST $A "work-orders/$W7/parts-short" "{\"sparePartIds\":[$BOARD]}" >/dev/null
N=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W7 and action='PARTS_SHORT'")
[ "$(ST $W7)|$(APPT $W7)" = "PARTS_SOURCING|-|-|-" ] && echo "$N" | grep -q "ไม่ต้องแจ้งร้าน" && ! echo "$N" | grep -q "แจ้งร้านว่าเลื่อน" \
  && pass "ยังไม่คอนเฟิร์ม: ล้างนัด กลับเช็คอะไหล่ ประวัติบอกไม่ต้องแจ้งร้าน (ฐานข้อมูล)" || fail "PARTS_SHORT PENDING: $(ST $W7) $(APPT $W7) · $N"
W8=$(sourced W81 "$L94")
assign $W8
DB "update \"WorkOrder\" set \"appointmentStatus\"='CONFIRMED' where id=$W8" >/dev/null
R=$(POST $A "work-orders/$W8/parts-check" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false}]}")
echo "$R" | grep -q "ของไม่พอ — แจ้งเลื่อนนัด" && [ "$(ST $W8)" = "PARTS_REQUESTED|CONFIRMED" ] \
  && pass "คอนเฟิร์มลูกค้าแล้ว (สายงานเดิม): บอกปุ่ม “แจ้งเลื่อนนัด”" || fail "ข้อความ CONFIRMED: $(echo $R | head -c 200)"
POST $A "work-orders/$W8/parts-short" "{\"sparePartIds\":[$BOARD]}" >/dev/null
N=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W8 and action='PARTS_SHORT'")
[ "$(ST $W8)|$(APPT $W8)" = "PARTS_SOURCING|-|-|-" ] && echo "$N" | grep -q "แจ้งร้านว่าเลื่อน" \
  && pass "คอนเฟิร์มแล้ว: ล้างนัด ประวัติบอกให้แอดมินแจ้งร้านว่าเลื่อน (ฐานข้อมูล)" || fail "PARTS_SHORT CONFIRMED: $(ST $W8) · $N"

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
GOT=$(PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\i $MIG
SELECT w.id||'|'||w.status||'|'||coalesce(w."workStatus",'-')||'|'||coalesce(w."appointmentStatus",'-')||'|'||coalesce(w."assignedTeam",'-')||'|'||coalesce(w."scheduledAt"::date::text,'-')||'|'||
  (SELECT count(*) FROM "WorkOrderLog" l WHERE l."workOrderId"=w.id AND l.action='FLOW_MIGRATED' AND l.status='PARTS_REQUESTED')
FROM "WorkOrder" w WHERE w.id IN ($M1,$M2,$M3,$M4,$M5,$M6,$M7) ORDER BY w.id;
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
[ "$(DB "select string_agg(status,',' order by id) from \"WorkOrder\" where id in ($M1,$M5)")|$(DB "select count(*) from \"WorkOrderLog\" where action='FLOW_MIGRATED' and \"workOrderId\" in ($M1,$M5)")" = "AWAITING_CONFIRM,AWAITING_CONFIRM|0" ] \
  && pass "ROLLBACK แล้วฐานข้อมูลกลับเหมือนเดิม (ไม่กระทบใบอื่น)" || fail "ROLLBACK ไม่กลับ"
# ใบที่ย้ายแล้วเดินต่อได้: เบิก → คอนเฟิร์ม → ปล่อยงาน (จำลองผลย้ายในฐานข้อมูลจริง)
DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"workStatus\"='CHECKING_PARTS' where id=$M1" >/dev/null
issue94 $M1 RQ-MIG-1
POST $A "work-orders/$M1/confirm-appointment" '{}' >/dev/null
[ "$(ST $M1)" = "ASSIGNED|CONFIRMED" ] && pass "ใบที่ย้ายแล้ว เบิก → คอนเฟิร์ม → ปล่อยงานตามสายงานใหม่" || fail "M1 หลังย้าย: $(ST $M1)"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
