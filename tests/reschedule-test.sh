#!/bin/bash
# ทดสอบ: แอดมินเลื่อนวันนัด (POST /work-orders/:id/reschedule — เจ้าของงานเลือก "ได้ตลอดจนช่างเข้างาน" ต.ค. 69)
#   · แอดมินเท่านั้น: หัวหน้าภาค/ช่าง/Admin Spare Part 403 ฐานข้อมูลไม่เปลี่ยน · ต้องมีเหตุผล · วันย้อนหลังไม่ได้ · ต้องเปลี่ยนจริง
#   · ขั้นเบิก/โอน/รอคอนเฟิร์ม/รอปล่อยงาน/รอส่งช่างตรวจ: เปลี่ยนแค่วัน/เวลา ใบอยู่ขั้นเดิม ทีม อะไหล่ การโอน สถานะนัดไม่แตะ
#     ประวัติ APPOINTMENT_MOVED ("เลื่อนนัดจาก … เป็น …" + เหตุผล) · วันค้างขั้นไม่เริ่มนับใหม่ · บอร์ดแผนงานย้ายวัน
#   · ปล่อยให้ช่างแล้วแต่ช่างยังไม่ถึง → ดึงงานคืนให้หัวหน้าภาคปล่อยใหม่ (APPOINTMENT_RECALLED) · ถึงหน้างานแล้ว 409
#   · ก่อนหัวหน้าภาคนัด (ระบุอะไหล่ · นัดวันเข้า · แอดมินนัดตรวจ) 409
#   · เลื่อนระหว่างเบิกแล้วคอนเฟิร์มเฉย ๆ ทีหลัง หัวหน้าภาคยังเห็น "คอนเฟิร์มวันใหม่" (rescheduled) ทั้งรายการและหน้าใบงาน
#   · ใบผูกเคสเครื่องเสีย วันเข้าบนเคสตามไปด้วย · /options ส่ง rescheduleStages ให้แอป
#   · กดพร้อมกัน (จำลองด้วยทรานแซกชันที่ค้างล็อกแถวใบงานไว้): ดึงคืน vs ช่างกดถึงหน้างาน · ปล่อยงาน/คอนเฟิร์ม vs เลื่อนวัน
#     ฝั่งที่มาทีหลังได้ 409 ไม่เขียนทับ (ฐานข้อมูล)
#   · ช่างปิดงานรอบนี้แล้ว (เคลมถูกตีกลับ ใบกลับมาที่ช่าง ไม่มีถึงหน้างาน) → 409 ข้อความ "ช่างปิดงานรอบนี้แล้ว" ไม่ใช่ "ช่างถึงหน้างานแล้ว"
#   · ขั้นเบิก/โอน/เบิกส่งมอบคลังอื่น (ขั้นหัวหน้าภาค) ที่เลยนัด → เข้ากล่องงานแอดมินทั่วไป + ตัวเลขกล่องงาน (ยังไม่เลย = ไม่เข้า)
#   · ฟอร์มที่เปิดค้างก่อนแอดมินเลื่อน: คอนเฟิร์ม/ปล่อยงาน/ส่งกลับ ส่ง seenScheduledAt/seenScheduledTime ที่เห็น → ไม่ตรง 409
#     ไม่เขียนอะไร · ตรง 200 · ไม่ส่ง = แบบเดิม · ใบผูกเคสก็กันแบบเดียวกัน
#   · บันทึกส่งกลับ (ทีมไม่ว่าง) บอกเหตุตามจริง: แอดมินเลื่อน/ดึงคืน = "ไม่ว่างวันที่แอดมินเลื่อน" · ลูกค้าขอ = "ไม่ว่างวันที่ลูกค้าขอ"
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
PC() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
# ขั้น|สถานะนัด|ทีม|วัน|เวลา — ทุกอย่างที่การเลื่อนแตะหรือห้ามแตะ
WO() { DB "select status||'|'||coalesce(\"appointmentStatus\",'-')||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::date::text,'-')||'|'||coalesce(\"scheduledTime\",'-') from \"WorkOrder\" where id=$1"; }
LASTLOG() { DB "select action||'|'||status||'|'||coalesce(u.\"employeeCode\",'-') from \"WorkOrderLog\" l left join \"User\" u on u.id=l.\"userId\" where l.\"workOrderId\"=$1 order by l.\"createdAt\" desc, l.id desc limit 1"; }
LASTNOTE() { DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$1 order by \"createdAt\" desc, id desc limit 1"; }
ROW() { GET $1 "work-orders?status=$2&search=$(DB "select code from \"WorkOrder\" where id=$3")" | J "const r=(d.rows||d).find(x=>x.id===$3); r?$4:'missing'"; }
RS() { GET $A "work-orders/$1" | J 'String(d.rescheduled)'; }
BOARD() { GET $A "plans/day?date=$2" | J "const s=d.lanes.flatMap(l=>l.stops).find(s=>s.id===$1); s?s.status+'|'+(s.time||'-'):'ไม่มี'"; }
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
D1=$(day 14); D2=$(day 16); D3=$(day 18); D4=$(day 20); PAST=$(day -2)
MOVE() { echo "{\"scheduledAt\":\"$1\",\"reason\":\"${2:-ทดสอบเลื่อน}\"$3}"; }
# อีกคนกดค้างอยู่: ทรานแซกชันที่แก้แถวใบงาน (ล็อกแถว) แล้วรอ 2 วิค่อย COMMIT — คำขอที่ยิงตามไปอ่านค่าเดิมได้
# (ฐานข้อมูลไม่บล็อกการอ่าน) แต่ตอนเขียนต้องรอแถวนี้ = ช่องว่างระหว่าง "อ่าน" กับ "เขียน" ที่เกิดจริงเวลากดพร้อมกัน
HOLD() {
  PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -q -v ON_ERROR_STOP=1 \
    -c "BEGIN; $1; SELECT pg_sleep(2) /* hold-$SUF */; COMMIT;" >/dev/null &
  HOLD_PID=$!
  for _ in $(seq 50); do
    [ "$(DB "select count(*) from pg_stat_activity where query like '%hold-$SUF */%' and pid<>pg_backend_pid() and state='active'")" = "1" ] && return
    sleep 0.1
  done
  fail "HOLD: ทรานแซกชันจำลองไม่เริ่ม"
}

A=$(login A001)
BR=C0006
SUF=$RANDOM
SYMPTOM="ทดสอบแอดมินเลื่อนวันนัด $SUF"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
OUT=""
# ช่างกดถึงหน้างานลงตารางรายงานตัวเข้าสาขาด้วย — ลบแถวที่เทสต์นี้สร้าง
CHECKIN0=$(DB "select coalesce(max(id),0) from \"BranchCheckIn\"")
cleanup() {
  DB "delete from \"BranchCheckIn\" where id>$CHECKIN0 and \"userId\"=(select id from \"User\" where \"employeeCode\"='T001')" >/dev/null
  # ใบที่สร้างใน $(...) ตัวแปรไม่กลับมาที่เชลล์หลัก — หาจากอาการที่มีเลขสุ่มของรอบนี้
  for i in $(DB "select id from \"WorkOrder\" where symptom='$SYMPTOM'"); do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  [ -n "$OUT" ] && DB "delete from \"Outage\" where id=$OUT" >/dev/null
  DB "delete from \"User\" where \"employeeCode\"='ZRSP$SUF'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZRSP$SUF','แอดมินอะไหล่ทดสอบเลื่อนนัด','PARTS_ADMIN','$HASH',false)" >/dev/null
S=$(login S001); T=$(login T001); PA=$(login ZRSP$SUF)
# บอร์ดของแต่ละใบ (id ใบ → id อะไหล่): ใบในชุดนี้อยู่คนละเครื่อง (W61 W63 … ใบผูกเคสไม่มีเครื่อง)
# อะไหล่ต้องตรงยี่ห้อเครื่องของใบนั้น จึงหยิบตอนระบุอะไหล่ทีละใบ แล้วใช้ตัวเดิมกับใบนั้นจนจบ
declare -A BOARD_OF
L94="คลังลาดพร้าว 94"
mk() {  # $1 เครื่อง $2 ประเภทงาน → ใบใหม่
  POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"${2:-CM}\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYMPTOM\"}]}" | J 'd.orders[0].id'
}
spec() {  # $1 ใบ $2 คลังที่มีบอร์ด → เช็คอะไหล่แล้ว มีครบ (ขั้นนัดวัน)
  BOARD_OF[$1]=$(fx_part "$1" BOARD)
  POST $S "work-orders/$1/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":${BOARD_OF[$1]},\"quantity\":1}]}" >/dev/null
  POST $A "work-orders/$1/parts-sourcing" "{\"results\":[{\"sparePartId\":${BOARD_OF[$1]},\"inStock\":true,\"warehouse\":\"$2\"}]}" >/dev/null
}
assign() { POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$2\"$3}" >/dev/null; }

echo "═══ ขั้นที่เลื่อนได้ (ส่งให้แอป)"
[ "$(GET $A work-orders/options | J '[...(d.rescheduleStages||[])].sort().join(",")')" = "ASSIGNED,AWAITING_CONFIRM,INSPECTING,INSPECT_DISPATCH,IN_PROGRESS,PARTS_IN_TRANSIT,PARTS_PICKUP,PARTS_REQUESTED,PARTS_TRANSFER" ] \
  && pass "/options.rescheduleStages = ขั้นเบิก/โอน · รอคอนเฟิร์ม · รอปล่อยงาน · รอส่งช่างตรวจ · ช่างยังไม่ถึง" || fail "rescheduleStages: $(GET $A work-orders/options | J 'JSON.stringify(d.rescheduleStages)')"

echo
echo "═══ ขั้นเบิก (คลัง 94): ใครเลื่อนได้ · ข้อมูลต้องถูก"
R1=$(mk W61); spec $R1 "$L94"
assign $R1 "$D1" ',"scheduledTime":"10:00"'
[ "$(WO $R1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D1|10:00" ] || fail "เตรียมใบ R1: $(WO $R1)"
[ "$(PC $S work-orders/$R1/reschedule "$(MOVE $D2)")" = "403" ] && [ "$(PC $T work-orders/$R1/reschedule "$(MOVE $D2)")" = "403" ] \
  && [ "$(PC $PA work-orders/$R1/reschedule "$(MOVE $D2)")" = "403" ] && [ "$(WO $R1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D1|10:00" ] \
  && pass "หัวหน้าภาค / ช่าง / Admin Spare Part เลื่อนไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "สิทธิ์เลื่อนวันนัด: $(WO $R1)"
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $D1)")
echo "$R" | grep -q "วันและเวลาเดิม" && pass "วันเดิมเวลาเดิม (ไม่ส่งเวลา = เวลาเดิม): 400 ไม่ได้เลื่อน" || fail "วันเดิม: $(echo $R | head -c 150)"
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $PAST)")
echo "$R" | grep -q "วันนัดย้อนหลังไม่ได้" && pass "วันย้อนหลัง: 400" || fail "ย้อนหลัง: $(echo $R | head -c 150)"
R=$(POST $A work-orders/$R1/reschedule "{\"scheduledAt\":\"$D2\"}")
R2=$(POST $A work-orders/$R1/reschedule "{\"scheduledAt\":\"$D2\",\"reason\":\"  \"}")
echo "$R" | grep -q "ต้องบอกเหตุผลที่เลื่อน" && echo "$R2" | grep -q "ต้องบอกเหตุผลที่เลื่อน" && [ "$(WO $R1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D1|10:00" ] \
  && pass "ไม่บอกเหตุผล / เหตุผลว่าง: 400 ข้อความไทย ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่มีเหตุผล: $(echo $R | head -c 150)"
SINCE=$(ROW $A ACTIVE $R1 'r.stageSince')
LOGS0=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R1")
sleep 1
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $D2 อะไหล่มาไม่ทัน ',"scheduledTime":"13:30"')")
[ "$(echo "$R" | J 'd.status')" = "PARTS_REQUESTED" ] && [ "$(WO $R1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D2|13:30" ] \
  && pass "เลื่อนที่ขั้นเบิก: วัน/เวลาใหม่ ใบอยู่ขั้นเดิม ทีมเดิม ยังรอคอนเฟิร์มลูกค้า (ฐานข้อมูล)" || fail "เลื่อนขั้นเบิก: $(WO $R1) $(echo $R | head -c 150)"
[ "$(LASTLOG $R1)" = "APPOINTMENT_MOVED|PARTS_REQUESTED|A001" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R1")" = "$((LOGS0 + 1))" ] \
  && pass "ประวัติ APPOINTMENT_MOVED หนึ่งแถว · สถานะ = ขั้นปัจจุบัน · คนกด A001" || fail "ประวัติ: $(LASTLOG $R1)"
N=$(LASTNOTE $R1)
echo "$N" | grep -q "^เลื่อนนัดจาก .*10:00.* เป็น .*13:30" && echo "$N" | grep -q "อะไหล่มาไม่ทัน" && echo "$N" | grep -q "ยังไม่ได้คอนเฟิร์มลูกค้า" \
  && pass "บันทึก \"เลื่อนนัดจาก … เป็น …\" + เหตุผล + ยังไม่ได้คอนเฟิร์มลูกค้า" || fail "บันทึก: $N"
[ "$(ROW $A ACTIVE $R1 'r.stageSince')" = "$SINCE" ] && pass "เลื่อนวันไม่ใช่การเดินขั้น — วันค้างขั้นไม่เริ่มนับใหม่" || fail "stageSince เปลี่ยน: $SINCE → $(ROW $A ACTIVE $R1 'r.stageSince')"
[ "$(BOARD $R1 $D1)|$(BOARD $R1 $D2)" = "ไม่มี|PARTS_REQUESTED|13:30" ] && pass "บอร์ดแผนงาน: หายจากวันเดิม ขึ้นวันใหม่พร้อมเวลาใหม่" || fail "บอร์ด: $(BOARD $R1 $D1) / $(BOARD $R1 $D2)"
POST $A work-orders/$R1/reschedule "$(MOVE $D3)" >/dev/null
[ "$(WO $R1)" = "PARTS_REQUESTED|PENDING|$TEAM|$D3|13:30" ] && pass "ไม่ส่งเวลา = เวลาเดิม (13:30)" || fail "เวลาหาย: $(WO $R1)"

echo
echo "═══ เลื่อนระหว่างเบิก → เบิก → คอนเฟิร์มเฉย ๆ → หัวหน้าภาคต้องรับทราบวันใหม่"
POST $A "work-orders/$R1/parts-check" "{\"results\":[{\"sparePartId\":${BOARD_OF[$R1]},\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-RS1\"}]}" >/dev/null
[ "$(WO $R1)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D3|13:30" ] || fail "หลังเบิก R1: $(WO $R1)"
POST $A "work-orders/$R1/confirm-appointment" '{}' >/dev/null
[ "$(WO $R1)" = "ASSIGNED|CONFIRMED|$TEAM|$D3|13:30" ] && [ "$(RS $R1)" = "true" ] && [ "$(ROW $S INBOX $R1 'String(r.rescheduled)')" = "true" ] \
  && pass "ปล่อยงาน: วันไม่ใช่วันที่หัวหน้าภาคนัด → rescheduled ทั้งหน้าใบงานและกล่องงานหัวหน้าภาค" || fail "rescheduled: $(WO $R1) detail=$(RS $R1) list=$(ROW $S INBOX $R1 'String(r.rescheduled)')"

echo
echo "═══ ปล่อยให้ช่างแล้ว ช่างยังไม่ถึง → ดึงงานคืน · ถึงแล้วเลื่อนไม่ได้"
POST $S "work-orders/$R1/dispatch" '{}' >/dev/null
[ "$(WO $R1 | cut -d'|' -f1)" = "IN_PROGRESS" ] || fail "ปล่อยงาน R1: $(WO $R1)"
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $D4 ร้านปิดวันนั้น)")
[ "$(WO $R1)" = "ASSIGNED|CONFIRMED|$TEAM|$D4|13:30" ] && [ "$(LASTLOG $R1)" = "APPOINTMENT_RECALLED|ASSIGNED|A001" ] \
  && pass "ช่างยังไม่ถึง: ดึงคืนไปหัวหน้าภาคปล่อยงาน วันใหม่ สถานะนัดคอนเฟิร์มคงเดิม (ฐานข้อมูล)" || fail "ดึงคืน: $(WO $R1) $(LASTLOG $R1) $(echo $R | head -c 150)"
N=$(LASTNOTE $R1)
# ชื่อประวัติ (APPOINTMENT_RECALLED) บอก "ดึงงานคืนจากช่าง" แล้ว — บันทึกไม่พูดซ้ำ กล่องส้มตอนปล่อยงานอ่านต่อกันครั้งเดียว
echo "$N" | grep -q "^เลื่อนนัดจาก .* — ช่างยังไม่ถึงหน้างาน — แอดมินตกลงวันใหม่กับร้านแล้ว — ร้านปิดวันนั้น$" && ! echo "$N" | grep -q "ดึงงานคืน" \
  && [ "$(GET $A work-orders/$R1 | J 'd.logs[0].actionLabel')" = "แอดมินเลื่อนวันนัด — ดึงงานคืนจากช่าง" ] \
  && pass "บันทึก: เลื่อนจาก…เป็น… — ช่างยังไม่ถึงหน้างาน — ตกลงกับร้านแล้ว — เหตุผล (ไม่ซ้ำกับชื่อประวัติ \"ดึงงานคืนจากช่าง\")" || fail "บันทึกดึงคืน: $N"
[ "$(RS $R1)" = "true" ] && [ "$(ROW $S INBOX $R1 'String(r.rescheduled)')" = "true" ] && pass "ดึงคืนแล้วหัวหน้าภาคเห็น \"คอนเฟิร์มวันใหม่\"" || fail "rescheduled หลังดึงคืน"
POST $S "work-orders/$R1/dispatch" '{}' >/dev/null
[ "$(WO $R1 | cut -d'|' -f1)" = "IN_PROGRESS" ] || fail "ปล่อยงาน R1 รอบสอง: $(WO $R1)"

# แอดมินดึงคืนค้างอยู่ (ยังไม่ COMMIT) ตอนช่างกดถึงหน้างาน — ช่างอ่านได้ว่ายังอยู่ในมือ แต่เขียนต้องรอแถว
ARR0=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R1 and action='ARRIVED'")
CI0=$(DB "select count(*) from \"BranchCheckIn\" where id>$CHECKIN0")
HOLD "update \"WorkOrder\" set status='ASSIGNED', \"updatedAt\"=now() where id=$R1; insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") select $R1,id,'APPOINTMENT_RECALLED','ASSIGNED','ทดสอบ — ดึงคืนพร้อมกัน',now() from \"User\" where \"employeeCode\"='A001'"
R=$(curl -s -w '|%{http_code}' -X POST "localhost:4000/api/work-orders/$R1/arrive" -H "$(H $T)" -H 'Content-Type: application/json' -d '{"latitude":13.75,"longitude":100.5}')
wait $HOLD_PID
[ "${R##*|}" = "409" ] && echo "$R" | grep -q "ไม่ได้อยู่ในมือช่างตอนนี้" && [ "$(WO $R1 | cut -d'|' -f1)" = "ASSIGNED" ] \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R1 and action='ARRIVED'")" = "$ARR0" ] \
  && [ "$(DB "select count(*) from \"BranchCheckIn\" where id>$CHECKIN0")" = "$CI0" ] \
  && pass "ดึงคืนก่อน → ช่างกดถึงหน้างานพร้อมกันได้ 409 ไม่ลงประวัติถึงหน้างาน/รายงานตัวบนใบที่กลับไปหัวหน้าภาค (ฐานข้อมูล)" \
  || fail "ถึงหน้างานชนดึงคืน: ${R:0:200} $(WO $R1) ARRIVED=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R1 and action='ARRIVED'")"
POST $S "work-orders/$R1/dispatch" '{}' >/dev/null
[ "$(WO $R1 | cut -d'|' -f1)" = "IN_PROGRESS" ] || fail "ปล่อยงาน R1 รอบสาม: $(WO $R1)"

# ช่างกดถึงหน้างานค้างอยู่ (แตะแถวใบงาน + ลงประวัติ ยังไม่ COMMIT) ตอนแอดมินเลื่อน — แอดมินเช็คประวัติไม่เห็น ARRIVED
# แต่การดึงคืนต้องไม่ผ่าน (updatedAt ที่อ่านไว้ไม่ตรงแล้ว)
HOLD "update \"WorkOrder\" set \"updatedAt\"=now() where id=$R1; insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") select $R1,id,'ARRIVED','IN_PROGRESS','ทดสอบ — ถึงหน้างานพร้อมกัน',now() from \"User\" where \"employeeCode\"='T001'"
R=$(curl -s -w '|%{http_code}' -X POST "localhost:4000/api/work-orders/$R1/reschedule" -H "$(H $A)" -H 'Content-Type: application/json' -d "$(MOVE $(day 22) ชนกัน)")
wait $HOLD_PID
[ "${R##*|}" = "409" ] && [ "$(WO $R1)" = "IN_PROGRESS|CONFIRMED|$TEAM|$D4|13:30" ] && [ "$(LASTLOG $R1)" = "ARRIVED|IN_PROGRESS|T001" ] \
  && pass "ช่างถึงหน้างานก่อน → แอดมินเลื่อนพร้อมกันได้ 409 ใบยังอยู่กับช่าง วันเดิม (ฐานข้อมูล)" || fail "ดึงคืนชนถึงหน้างาน: ${R:0:200} $(WO $R1) $(LASTLOG $R1)"

POST $T "work-orders/$R1/arrive" '{}' >/dev/null
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $(day 22))")
echo "$R" | grep -q "ช่างถึงหน้างานแล้ว" && [ "$(WO $R1)" = "IN_PROGRESS|CONFIRMED|$TEAM|$D4|13:30" ] \
  && pass "ช่างกดถึงหน้างานแล้ว: 409 (ให้ช่างแจ้งปัญหาหน้างาน) ฐานข้อมูลไม่เปลี่ยน" || fail "หลังถึงหน้างาน: $(WO $R1) $(echo $R | head -c 150)"

# เคลมถูกตีกลับ → ใบกลับมาที่ช่าง (IN_PROGRESS) ทั้งที่ช่างปิดงานรอบนี้ไปแล้ว — ถึงหน้างานไม่บังคับกด จึงมักไม่มี ARRIVED
# (จำลองประวัติปิดงาน + ตีกลับที่ตรวจเคลมเขียน — ฟอร์มปิดงานพร้อมเคลมต้องมีไฟล์หลักฐาน ไม่ใช่เรื่องของเทสต์นี้)
R10=$(mk W68)
POST $S "work-orders/$R10/parts" '{"needsParts":false}' >/dev/null
assign $R10 "$D1"; POST $A "work-orders/$R10/confirm-appointment" '{}' >/dev/null; POST $S "work-orders/$R10/dispatch" '{}' >/dev/null
DB "insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") select $R10,id,'CLOSED','DONE','ทดสอบ — ปิดงานพร้อมเคลม',now()+interval '1 second' from \"User\" where \"employeeCode\"='T001';
    insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") select $R10,id,'CLAIM_REJECTED','IN_PROGRESS','ทดสอบ — ตีกลับ',now()+interval '2 second' from \"User\" where \"employeeCode\"='A001'" >/dev/null
[ "$(WO $R10)" = "IN_PROGRESS|CONFIRMED|$TEAM|$D1|-" ] || fail "เตรียม R10: $(WO $R10)"
R=$(curl -s -w '|%{http_code}' -X POST "localhost:4000/api/work-orders/$R10/reschedule" -H "$(H $A)" -H 'Content-Type: application/json' -d "$(MOVE $D2)")
[ "${R##*|}" = "409" ] && echo "$R" | grep -q "ช่างปิดงานรอบนี้แล้ว" && ! echo "$R" | grep -q "ช่างถึงหน้างานแล้ว" \
  && [ "$(WO $R10)" = "IN_PROGRESS|CONFIRMED|$TEAM|$D1|-" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R10 and action like 'APPOINTMENT_%'")" = "0" ] \
  && pass "ช่างปิดงานรอบนี้แล้ว (เคลมถูกตีกลับ): 409 บอกตามจริง ไม่อ้างว่าช่างถึงหน้างาน · ฐานข้อมูลไม่เปลี่ยน" || fail "ปิดแล้วดึงคืน: ${R:0:200} $(WO $R10)"

echo
echo "═══ ขั้นที่ยังเลื่อนไม่ได้ (หัวหน้าภาคยังไม่นัด) — 409"
R3=$(mk W62)
R=$(POST $A work-orders/$R3/reschedule "$(MOVE $D2)")
[ "$(PC $A work-orders/$R3/reschedule "$(MOVE $D2)")" = "409" ] && echo "$R" | grep -q "เลื่อนวันนัดได้ตั้งแต่หัวหน้าภาคนัดวันแล้ว" && [ "$(WO $R3)" = "NEW|-|-|-|-" ] \
  && pass "ขั้นระบุอะไหล่: 409 ข้อความไทย" || fail "NEW: $(echo $R | head -c 150)"
spec $R3 "$L94"
[ "$(PC $A work-orders/$R3/reschedule "$(MOVE $D2)")" = "409" ] && [ "$(WO $R3)" = "PARTS_CHECKED|-|-|-|-" ] \
  && pass "ขั้นนัดวันเข้า (ยังไม่มีวัน): 409" || fail "PARTS_CHECKED: $(WO $R3)"

echo
echo "═══ วันเดิมผ่านไปแล้ว — เปลี่ยนแค่เวลาไม่ได้ · เลื่อนไปวันข้างหน้าแล้วป้ายเลยนัดหาย"
assign $R3 "$D1"
DB "update \"WorkOrder\" set \"scheduledAt\"='$PAST' where id=$R3" >/dev/null
[ "$(ROW $A ALL $R3 'String(r.overdue)')" = "true" ] || fail "เตรียม: ขั้นเบิกที่เลยวันนัดไม่ขึ้นป้าย"
R=$(POST $A work-orders/$R3/reschedule "$(MOVE $PAST x ',"scheduledTime":"15:00"')")
echo "$R" | grep -q "วันนัดย้อนหลังไม่ได้" && [ "$(WO $R3)" = "PARTS_REQUESTED|PENDING|$TEAM|$PAST|-" ] \
  && pass "วันเดิมผ่านไปแล้ว เปลี่ยนแค่เวลา: 400 (นัดใหม่บนวันที่ผ่านไปแล้ว)" || fail "เวลาบนวันที่ผ่านไปแล้ว: $(echo $R | head -c 150)"
POST $A work-orders/$R3/reschedule "$(MOVE $D2)" >/dev/null
[ "$(WO $R3)" = "PARTS_REQUESTED|PENDING|$TEAM|$D2|-" ] && [ "$(ROW $A ALL $R3 'String(r.overdue)')" = "false" ] \
  && pass "เลื่อนไปวันข้างหน้า → ป้ายเลยนัดหาย ใบอยู่ขั้นเบิกเหมือนเดิม" || fail "หลังเลื่อนใบเลยนัด: $(WO $R3)"

echo
echo "═══ ของอยู่คลังอื่น: เลื่อนระหว่างรอหัวหน้าภาคเบิก/โอน และระหว่างของกำลังมา"
R4=$(mk W63); spec $R4 "คลังขอนแก่น"; assign $R4 "$D1"
POST $A "work-orders/$R4/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":${BOARD_OF[$R4]},\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
XF() { DB "select coalesce(\"inStock\"::text,'-')||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"transferFrom\",'-')||'|'||coalesce(\"transferReqNo\",'-')||'|'||coalesce(\"transferNo\",'-')||'|'||(\"transferredAt\" is not null) from \"WorkOrderPart\" where \"workOrderId\"=$R4 and kind='WAITING'"; }
[ "$(WO $R4 | cut -d'|' -f1)" = "PARTS_TRANSFER" ] || fail "เตรียมใบ R4: $(WO $R4)"
X0=$(XF)
POST $A work-orders/$R4/reschedule "$(MOVE $D2 ของโอนมาไม่ทัน)" >/dev/null
[ "$(WO $R4)" = "PARTS_TRANSFER|PENDING|$TEAM|$D2|-" ] && [ "$(XF)" = "$X0" ] && [ "$(LASTLOG $R4)" = "APPOINTMENT_MOVED|PARTS_TRANSFER|A001" ] \
  && pass "ขั้นหัวหน้าภาคเบิกและโอน: เลื่อนได้ ขั้น/ทีม/สถานะนัด/ผลเช็คอะไหล่ไม่เปลี่ยน (ฐานข้อมูล)" || fail "เลื่อนขั้นโอน: $(WO $R4) $(XF) $(LASTLOG $R4)"
POST $S "work-orders/$R4/parts-transfer" "{\"results\":[{\"sparePartId\":${BOARD_OF[$R4]},\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-RS\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-RS\"}]}" >/dev/null
X1=$(XF)
[ "$X1" = "true|$L94|คลังขอนแก่น|KK-RS|TR-RS|false" ] || fail "เตรียมของกำลังโอน: $X1"
POST $A work-orders/$R4/reschedule "$(MOVE $D3 ร้านขอเลื่อน)" >/dev/null
[ "$(WO $R4)" = "PARTS_IN_TRANSIT|PENDING|$TEAM|$D3|-" ] && [ "$(XF)" = "$X1" ] && [ "$(LASTLOG $R4)" = "APPOINTMENT_MOVED|PARTS_IN_TRANSIT|A001" ] \
  && pass "ของกำลังโอน: เลื่อนได้ เลขใบเบิกต้นทาง/เลขที่ใบโอนไม่หาย (ฐานข้อมูล)" || fail "เลื่อนระหว่างโอน: $(WO $R4) $(XF)"

echo
echo "═══ ขั้นหัวหน้าภาคเบิก/โอน/เบิกส่งมอบคลังอื่นที่เลยนัด → กล่องงานแอดมิน (คนเดียวที่เลื่อนวันนัดได้)"
INBOXN() { GET $1 work-orders/inbox-count | J 'd.inbox'; }
# ยังไม่เลยนัด — ระหว่างโอนตามปกติเป็นงานหัวหน้าภาค ไม่ใช่ของแอดมิน
[ "$(ROW $A INBOX $R4 'r.status')" = "missing" ] && [ "$(ROW $S INBOX $R4 'r.status')" = "PARTS_IN_TRANSIT" ] \
  && pass "ของกำลังโอน วันนัดยังไม่ถึง: อยู่กล่องหัวหน้าภาค ไม่อยู่กล่องแอดมิน" || fail "ก่อนเลยนัด: A=$(ROW $A INBOX $R4 'r.status') S=$(ROW $S INBOX $R4 'r.status')"
# วันนัดผ่านไประหว่างของกำลังมา (จำลองในฐานข้อมูล) · ตัวเลขกล่องงานนับทั้งระบบ — มีใบอื่นขยับพร้อมกันได้ ลองซ้ำอีกรอบ
for _ in 1 2 3; do
  N0=$(INBOXN $A)
  DB "update \"WorkOrder\" set \"scheduledAt\"='$PAST' where id=$R4" >/dev/null
  N1=$(INBOXN $A)
  [ "$N1" = "$((N0 + 1))" ] && break
  DB "update \"WorkOrder\" set \"scheduledAt\"='$D3' where id=$R4" >/dev/null
done
[ "$(ROW $A INBOX $R4 'r.status+"|"+r.overdue+"|"+r.stageActor')" = "PARTS_IN_TRANSIT|true|SUPERVISOR" ] && [ "$N1" = "$((N0 + 1))" ] \
  && pass "รอของถึงที่เลยนัด: เข้ากล่องงานแอดมิน overdue=true (ขั้นยังเป็นของหัวหน้าภาค — บอกได้ว่าต้องตามใคร) · inbox-count +1" \
  || fail "เลยนัดระหว่างโอน: $(ROW $A INBOX $R4 'r.status+"|"+r.overdue+"|"+r.stageActor') count $N0→$N1"
[ "$(ROW $S INBOX $R4 'String(r.overdue)')" = "true" ] && [ "$(ROW $PA INBOX $R4 'r.status')" = "missing" ] \
  && pass "หัวหน้าภาคยังเห็นในกล่องตัวเอง · Admin Spare Part ไม่เห็น (ไม่ได้ดูแลวันนัด)" || fail "S=$(ROW $S INBOX $R4 'String(r.overdue)') PA=$(ROW $PA INBOX $R4 'r.status')"
POST $A work-orders/$R4/reschedule "$(MOVE $D3 ของโอนช้า)" >/dev/null
[ "$(WO $R4)" = "PARTS_IN_TRANSIT|PENDING|$TEAM|$D3|-" ] && [ "$(XF)" = "$X1" ] && [ "$(ROW $A INBOX $R4 'r.status')" = "missing" ] \
  && pass "แอดมินเลื่อนวันนัดจากกล่องงาน → ใบอยู่ขั้นเดิม ของโอนไม่แตะ แล้วหลุดจากกล่องแอดมิน (ฐานข้อมูล)" || fail "เลื่อนใบเลยนัดระหว่างโอน: $(WO $R4) A=$(ROW $A INBOX $R4 'r.status')"
R8=$(mk W66); spec $R8 "คลังภูเก็ต"; assign $R8 "$D1"
POST $A "work-orders/$R8/parts-check" "{\"transfer\":false,\"results\":[{\"sparePartId\":${BOARD_OF[$R8]},\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
R9=$(mk W67); spec $R9 "คลังขอนแก่น"; assign $R9 "$D1"
POST $A "work-orders/$R9/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":${BOARD_OF[$R9]},\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
[ "$(WO $R8 | cut -d'|' -f1)|$(WO $R9 | cut -d'|' -f1)" = "PARTS_PICKUP|PARTS_TRANSFER" ] || fail "เตรียม R8/R9: $(WO $R8) $(WO $R9)"
[ "$(ROW $A INBOX $R8 'r.status')|$(ROW $A INBOX $R9 'r.status')" = "missing|missing" ] || fail "เบิกส่งมอบ/เบิกและโอนที่ยังไม่เลยนัดอยู่กล่องแอดมิน"
DB "update \"WorkOrder\" set \"scheduledAt\"='$PAST' where id in ($R8,$R9)" >/dev/null
[ "$(ROW $A INBOX $R8 'r.status+"|"+r.overdue')|$(ROW $A INBOX $R9 'r.status+"|"+r.overdue')" = "PARTS_PICKUP|true|PARTS_TRANSFER|true" ] \
  && pass "เบิกส่งมอบคลังอื่น / เบิกและโอน ที่เลยนัด: เข้ากล่องงานแอดมินเหมือนกัน" || fail "pickup/transfer เลยนัด: $(ROW $A INBOX $R8 'r.status+"|"+r.overdue') $(ROW $A INBOX $R9 'r.status+"|"+r.overdue')"

echo
echo "═══ คอนเฟิร์มลูกค้า / ปล่อยงาน ชนกับแอดมินอีกคนเลื่อนวัน (ขั้นไม่เปลี่ยน) — 409 ไม่เขียนทับวันใหม่"
R7=$(mk W65); spec $R7 "$L94"; assign $R7 "$D1"
POST $A "work-orders/$R7/parts-check" "{\"results\":[{\"sparePartId\":${BOARD_OF[$R7]},\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-RS7\"}]}" >/dev/null
[ "$(WO $R7)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D1|-" ] || fail "เตรียม R7: $(WO $R7)"
MOVED_SQL() { echo "update \"WorkOrder\" set \"scheduledAt\"='$2', \"updatedAt\"=now() where id=$1; insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") select $1,id,'APPOINTMENT_MOVED',(select status from \"WorkOrder\" where id=$1),'ทดสอบ — เลื่อนพร้อมกัน',now() from \"User\" where \"employeeCode\"='A001'"; }
HOLD "$(MOVED_SQL $R7 $D2)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$R7/confirm-appointment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
wait $HOLD_PID
[ "$C" = "409" ] && [ "$(WO $R7)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D2|-" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R7 and action in ('CONFIRMED','RESCHEDULED')")" = "0" ] \
  && pass "คอนเฟิร์มที่อ่านวันเดิมไว้: 409 วันใหม่ไม่ถูกเขียนทับ ไม่ลงคอนเฟิร์ม (ฐานข้อมูล)" || fail "คอนเฟิร์มชนเลื่อน: $C $(WO $R7)"
POST $A "work-orders/$R7/confirm-appointment" '{}' >/dev/null
[ "$(WO $R7)" = "ASSIGNED|CONFIRMED|$TEAM|$D2|-" ] || fail "คอนเฟิร์ม R7: $(WO $R7)"
HOLD "$(MOVED_SQL $R7 $D3)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$R7/dispatch" -H "$(H $S)" -H 'Content-Type: application/json' -d '{}')
wait $HOLD_PID
[ "$C" = "409" ] && [ "$(WO $R7)" = "ASSIGNED|CONFIRMED|$TEAM|$D3|-" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R7 and action='DISPATCHED'")" = "0" ] \
  && pass "ปล่อยงานที่อ่านวันเดิมไว้: 409 ใบยังรอหัวหน้าภาครับทราบวันใหม่ ไม่ถึงช่าง (ฐานข้อมูล)" || fail "ปล่อยงานชนเลื่อน: $C $(WO $R7)"
POST $S "work-orders/$R7/dispatch" '{}' >/dev/null
[ "$(WO $R7 | cut -d'|' -f1,4)" = "IN_PROGRESS|$D3" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R7 and action='DISPATCHED'")" = "1" ] \
  && pass "กดใหม่หลังโหลด → ปล่อยงานวันใหม่" || fail "ปล่อยงาน R7: $(WO $R7)"

echo
echo "═══ ใบผูกเคสเครื่องเสีย — วันเข้าบนเคสตามไปด้วย"
OUT=$(DB "insert into \"Outage\"(kind,\"branchId\",\"startedAt\",\"lastSeenAt\") select 'MACHINE_OFF',id,now(),now() from \"Branch\" where code='$BR' returning id" | head -1)
R5=$(POST $A "work-orders/from-outage/$OUT" "{\"jobType\":\"CM\",\"symptom\":\"$SYMPTOM\"}" | J 'd.id')
spec $R5 "$L94"; assign $R5 "$D1"
[ "$(DB "select coalesce(\"scheduledVisitAt\"::date::text,'-') from \"Outage\" where id=$OUT")" = "$D1" ] || fail "เตรียม: วันเข้าบนเคสไม่ตามนัดแรก"
POST $A work-orders/$R5/reschedule "$(MOVE $D2 ร้านขอ)" >/dev/null
[ "$(DB "select \"scheduledVisitAt\"::date from \"Outage\" where id=$OUT")" = "$D2" ] && [ "$(WO $R5)" = "PARTS_REQUESTED|PENDING|$TEAM|$D2|-" ] \
  && pass "Outage.scheduledVisitAt ตามวันใหม่ ใบอยู่ขั้นเดิม (ฐานข้อมูล)" || fail "เคส: $(DB "select \"scheduledVisitAt\" from \"Outage\" where id=$OUT") $(WO $R5)"
# ใบผูกเคสคอนเฟิร์มผ่านทรานแซกชัน (ซิงก์เคส) ไม่ใช่ moveStage — ต้องกันเขียนทับวันใหม่แบบเดียวกัน
POST $A "work-orders/$R5/parts-check" "{\"results\":[{\"sparePartId\":${BOARD_OF[$R5]},\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-RS5\"}]}" >/dev/null
[ "$(WO $R5)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D2|-" ] || fail "เตรียม R5 คอนเฟิร์ม: $(WO $R5)"
HOLD "$(MOVED_SQL $R5 $D3)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$R5/confirm-appointment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
wait $HOLD_PID
[ "$C" = "409" ] && [ "$(WO $R5)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D3|-" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R5 and action in ('CONFIRMED','RESCHEDULED')")" = "0" ] \
  && pass "ใบผูกเคส: คอนเฟิร์มที่อ่านวันเดิมไว้ 409 วันใหม่ไม่ถูกเขียนทับ (ฐานข้อมูล)" || fail "คอนเฟิร์มใบผูกเคสชนเลื่อน: $C $(WO $R5)"
# ฟอร์มยังโชว์วันเดิม (D2) — ทางที่ผ่านทรานแซกชันซิงก์เคสต้องกันด้วยวันที่เห็นเหมือนกัน
C=$(PC $A work-orders/$R5/confirm-appointment "{\"seenScheduledAt\":\"$D2\",\"seenScheduledTime\":null}")
[ "$C" = "409" ] && [ "$(WO $R5)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D3|-" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$R5 and action in ('CONFIRMED','RESCHEDULED')")" = "0" ] \
  && pass "ใบผูกเคส: คอนเฟิร์มจากฟอร์มที่เห็นวันเดิม (seenScheduledAt) 409 ไม่ลงคอนเฟิร์ม (ฐานข้อมูล)" || fail "ใบผูกเคส seen เก่า: $C $(WO $R5)"
C=$(PC $A work-orders/$R5/confirm-appointment "{\"seenScheduledAt\":\"$D3\",\"seenScheduledTime\":null}")
[ "$C" = "200" ] && [ "$(WO $R5)" = "ASSIGNED|CONFIRMED|$TEAM|$D3|-" ] && [ "$(DB "select \"scheduledVisitAt\"::date from \"Outage\" where id=$OUT")" = "$D3" ] \
  && pass "ใบผูกเคส: วันที่เห็นตรงกับใบ → คอนเฟิร์มได้ เคสตามวันนัด (ฐานข้อมูล)" || fail "ใบผูกเคส seen ตรง: $C $(WO $R5) เคส=$(DB "select \"scheduledVisitAt\" from \"Outage\" where id=$OUT")"

echo
echo "═══ ตรวจหน้างาน: เลื่อนตอนรอส่งช่างตรวจ · ทีมไม่ว่างส่งกลับได้ · ดึงคืนจากช่างตรวจ"
R6=$(mk W64 INSPECT)
POST $S "work-orders/$R6/inspect-request" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D1\"}" >/dev/null
[ "$(PC $A work-orders/$R6/reschedule "$(MOVE $D2)")" = "409" ] && [ "$(WO $R6)" = "INSPECT_CONFIRM|PENDING|$TEAM|$D1|-" ] \
  && pass "รอแอดมินนัดตรวจ: 409 (ใช้ฟอร์มคอนเฟิร์มนัดตรวจ)" || fail "INSPECT_CONFIRM: $(WO $R6)"
POST $A "work-orders/$R6/confirm-appointment" '{}' >/dev/null
POST $A work-orders/$R6/reschedule "$(MOVE $D2 ร้านขอ)" >/dev/null
[ "$(WO $R6)" = "INSPECT_DISPATCH|CONFIRMED|$TEAM|$D2|-" ] && [ "$(LASTLOG $R6)" = "APPOINTMENT_MOVED|INSPECT_DISPATCH|A001" ] && [ "$(RS $R6)" = "true" ] \
  && pass "รอส่งช่างตรวจ: เลื่อนได้ อยู่ขั้นเดิม หัวหน้าภาคเห็นคอนเฟิร์มวันใหม่" || fail "เลื่อนตรวจ: $(WO $R6) $(LASTLOG $R6) rs=$(RS $R6)"
POST $S "work-orders/$R6/decline-new-date" '{"reason":"ทีมเต็มวันนั้น"}' >/dev/null
[ "$(WO $R6)" = "INSPECT_CONFIRM|PENDING|$TEAM|$D2|-" ] && pass "ทีมไม่ว่างวันใหม่ → กลับไปแอดมินนัดตรวจใหม่" || fail "ส่งกลับตรวจ: $(WO $R6)"
N=$(LASTNOTE $R6)
echo "$N" | grep -q "^ทีม$TEAM ไม่ว่างวันที่แอดมินเลื่อน (.*) — ทีมเต็มวันนั้น$" && ! echo "$N" | grep -q "ลูกค้าขอ" \
  && pass "บันทึกส่งกลับนัดตรวจที่แอดมินเลื่อน: \"ไม่ว่างวันที่แอดมินเลื่อน\" (ร้านไม่ได้ขอ)" || fail "บันทึกส่งกลับตรวจ: $N"
POST $A "work-orders/$R6/confirm-appointment" "{\"scheduledAt\":\"$D3\"}" >/dev/null
POST $S "work-orders/$R6/dispatch" '{}' >/dev/null
[ "$(WO $R6 | cut -d'|' -f1)" = "INSPECTING" ] || fail "เตรียมช่างตรวจ: $(WO $R6)"
POST $A work-orders/$R6/reschedule "$(MOVE $D4 ร้านปิด)" >/dev/null
[ "$(WO $R6)" = "INSPECT_DISPATCH|CONFIRMED|$TEAM|$D4|-" ] && [ "$(LASTLOG $R6)" = "APPOINTMENT_RECALLED|INSPECT_DISPATCH|A001" ] \
  && pass "ช่างตรวจยังไม่ถึง: ดึงคืนไปรอส่งช่างตรวจ (ฐานข้อมูล)" || fail "ดึงคืนตรวจ: $(WO $R6) $(LASTLOG $R6)"
[ "$(GET $A work-orders/$R6 | J '[d.flow.inspect,d.flow.inspectRounds].join("|")')" = "true|1" ] && pass "detail.flow: มีรอบตรวจหน้างาน 1 รอบ" || fail "flow ตรวจ: $(GET $A work-orders/$R6 | J 'JSON.stringify(d.flow)')"

echo
echo "═══ ฟอร์มที่เปิดไว้ก่อนแอดมินเลื่อน (seenScheduledAt/seenScheduledTime) · บันทึกส่งกลับตามเหตุ"
CNT() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action in ($2)"; }
SEEN() { echo "{\"seenScheduledAt\":\"$1\",\"seenScheduledTime\":${2:-null}$3}"; }
N1=$(mk W69)
POST $S "work-orders/$N1/parts" '{"needsParts":false}' >/dev/null
assign $N1 "$D1"
[ "$(WO $N1)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D1|-" ] || fail "เตรียม N1: $(WO $N1)"
# แอดมิน B เปิดฟอร์มคอนเฟิร์มเห็น D1 · แอดมิน A เลื่อนเป็น D2 (ใบไม่ขยับขั้น) · B กด "ลูกค้าคอนเฟิร์ม"
POST $A work-orders/$N1/reschedule "$(MOVE $D2 ของมาช้า)" >/dev/null
C=$(PC $A work-orders/$N1/confirm-appointment "$(SEEN $D1)")
[ "$C" = "409" ] && [ "$(WO $N1)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D2|-" ] && [ "$(CNT $N1 "'CONFIRMED','RESCHEDULED'")" = "0" ] \
  && pass "คอนเฟิร์มจากฟอร์มที่เห็นวันก่อนเลื่อน: 409 ไม่บันทึกว่าลูกค้าคอนเฟิร์มวันที่ไม่ได้คุยกัน (ฐานข้อมูล)" || fail "คอนเฟิร์ม seen เก่า: $C $(WO $N1)"
C=$(PC $A work-orders/$N1/confirm-appointment "$(SEEN $D2 '"10:00"')")
[ "$C" = "409" ] && [ "$(CNT $N1 "'CONFIRMED','RESCHEDULED'")" = "0" ] && pass "วันตรงแต่เวลาที่เห็นไม่ตรง: 409 เหมือนกัน" || fail "คอนเฟิร์ม seen เวลาเก่า: $C $(WO $N1)"
C=$(PC $A work-orders/$N1/confirm-appointment "$(SEEN $D2)")
[ "$C" = "200" ] && [ "$(WO $N1)" = "ASSIGNED|CONFIRMED|$TEAM|$D2|-" ] && [ "$(LASTLOG $N1)" = "CONFIRMED|ASSIGNED|A001" ] \
  && pass "วัน/เวลาที่เห็นตรงกับใบ: คอนเฟิร์มได้ (ฐานข้อมูล)" || fail "คอนเฟิร์ม seen ตรง: $C $(WO $N1)"
# หัวหน้าภาคเปิดฟอร์มปล่อยงานเห็น D2 · แอดมินเลื่อนเป็น D3 · หัวหน้าภาคกดส่งกลับ/ปล่อยงานจากฟอร์มเดิม
POST $A work-orders/$N1/reschedule "$(MOVE $D3 ร้านขอ)" >/dev/null
C1=$(PC $S work-orders/$N1/decline-new-date "$(SEEN $D2 null ',"reason":"ทีมเต็ม"')")
C2=$(PC $S work-orders/$N1/dispatch "$(SEEN $D2)")
[ "$C1|$C2" = "409|409" ] && [ "$(WO $N1)" = "ASSIGNED|CONFIRMED|$TEAM|$D3|-" ] && [ "$(CNT $N1 "'NEW_DATE_DECLINED','DISPATCHED'")" = "0" ] \
  && pass "ส่งกลับ/ปล่อยงานจากฟอร์มที่เห็นวันก่อนเลื่อน: 409 ทั้งคู่ ไม่ลงประวัติ ใบรอหัวหน้าภาคดูวันใหม่ (ฐานข้อมูล)" || fail "seen เก่า ส่งกลับ=$C1 ปล่อย=$C2 $(WO $N1)"
C=$(PC $S work-orders/$N1/decline-new-date "$(SEEN $D3 null ',"reason":"ทีมเต็ม"')")
N=$(LASTNOTE $N1)
[ "$C" = "200" ] && [ "$(WO $N1)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D3|-" ] && [ "$(LASTLOG $N1)" = "NEW_DATE_DECLINED|AWAITING_CONFIRM|S001" ] \
  && echo "$N" | grep -q "^ทีม$TEAM ไม่ว่างวันที่แอดมินเลื่อน (.*) — ทีมเต็ม$" && ! echo "$N" | grep -q "ลูกค้าขอ" \
  && pass "ส่งกลับด้วยวันที่เห็นตรง: 200 · บันทึก \"ไม่ว่างวันที่แอดมินเลื่อน\" (แอดมินเลื่อน ร้านไม่ได้ขอ)" || fail "ส่งกลับหลังแอดมินเลื่อน: $C $(WO $N1) · $N"
# ลูกค้าขอเลื่อนตอนแอดมินโทร (ไม่ส่ง seen = แอปรุ่นเก่า ทำงานแบบเดิม) → หัวหน้าภาคส่งกลับ (ไม่ส่ง seen เหมือนกัน)
C=$(PC $A work-orders/$N1/confirm-appointment "{\"scheduledAt\":\"$D4\"}")
[ "$C|$(WO $N1)|$(LASTLOG $N1)" = "200|ASSIGNED|CONFIRMED|$TEAM|$D4|-|RESCHEDULED|ASSIGNED|A001" ] || fail "ลูกค้าขอเลื่อน: $C $(WO $N1) $(LASTLOG $N1)"
C=$(PC $S work-orders/$N1/decline-new-date '{"reason":"ทีมลา"}')
N=$(LASTNOTE $N1)
[ "$C" = "200" ] && [ "$(WO $N1)" = "AWAITING_CONFIRM|PENDING|$TEAM|$D4|-" ] && echo "$N" | grep -q "^ทีม$TEAM ไม่ว่างวันที่ลูกค้าขอ (.*) — ทีมลา$" \
  && pass "ไม่ส่ง seen (แอปรุ่นเก่า) ทำงานแบบเดิม · ลูกค้าขอเลื่อน → บันทึก \"ไม่ว่างวันที่ลูกค้าขอ\"" || fail "ส่งกลับวันที่ลูกค้าขอ: $C $(WO $N1) · $N"
# ปล่อยงานด้วยวันที่เห็นตรง → แอดมินดึงคืน (ช่างยังไม่ถึง) → หัวหน้าภาคส่งกลับ
POST $A work-orders/$N1/confirm-appointment '{}' >/dev/null
C=$(PC $S work-orders/$N1/dispatch "$(SEEN $D4)")
[ "$C" = "200" ] && [ "$(WO $N1 | cut -d'|' -f1,4)" = "IN_PROGRESS|$D4" ] && pass "ปล่อยงานด้วยวันที่เห็นตรง: 200 ถึงช่าง (ฐานข้อมูล)" || fail "ปล่อยงาน seen ตรง: $C $(WO $N1)"
POST $A work-orders/$N1/reschedule "$(MOVE $(day 22) ร้านปิด)" >/dev/null
[ "$(LASTLOG $N1)" = "APPOINTMENT_RECALLED|ASSIGNED|A001" ] || fail "ดึงคืน N1: $(LASTLOG $N1)"
POST $S work-orders/$N1/decline-new-date '{"reason":"ทีมเต็ม"}' >/dev/null
N=$(LASTNOTE $N1)
[ "$(WO $N1 | cut -d'|' -f1,2)" = "AWAITING_CONFIRM|PENDING" ] && echo "$N" | grep -q "^ทีม$TEAM ไม่ว่างวันที่แอดมินเลื่อน (" \
  && pass "ดึงคืนจากช่างแล้วทีมไม่ว่าง → บันทึก \"ไม่ว่างวันที่แอดมินเลื่อน\"" || fail "ส่งกลับหลังดึงคืน: $(WO $N1) · $N"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
