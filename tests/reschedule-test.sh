#!/bin/bash
# ทดสอบ: แอดมินเลื่อนวันนัด (POST /work-orders/:id/reschedule — เจ้าของงานเลือก "ได้ตลอดจนช่างเข้างาน" ต.ค. 69)
#   · แอดมินเท่านั้น: หัวหน้าภาค/ช่าง/Admin Spare Part 403 ฐานข้อมูลไม่เปลี่ยน · ต้องมีเหตุผล · วันย้อนหลังไม่ได้ · ต้องเปลี่ยนจริง
#   · ขั้นเบิก/โอน/รอคอนเฟิร์ม/รอปล่อยงาน/รอส่งช่างตรวจ: เปลี่ยนแค่วัน/เวลา ใบอยู่ขั้นเดิม ทีม อะไหล่ การโอน สถานะนัดไม่แตะ
#     ประวัติ APPOINTMENT_MOVED ("เลื่อนนัดจาก … เป็น …" + เหตุผล) · วันค้างขั้นไม่เริ่มนับใหม่ · บอร์ดแผนงานย้ายวัน
#   · ปล่อยให้ช่างแล้วแต่ช่างยังไม่ถึง → ดึงงานคืนให้หัวหน้าภาคปล่อยใหม่ (APPOINTMENT_RECALLED) · ถึงหน้างานแล้ว 409
#   · ก่อนหัวหน้าภาคนัด (ระบุอะไหล่ · นัดวันเข้า · แอดมินนัดตรวจ) 409
#   · เลื่อนระหว่างเบิกแล้วคอนเฟิร์มเฉย ๆ ทีหลัง หัวหน้าภาคยังเห็น "คอนเฟิร์มวันใหม่" (rescheduled) ทั้งรายการและหน้าใบงาน
#   · ใบผูกเคสเครื่องเสีย วันเข้าบนเคสตามไปด้วย · /options ส่ง rescheduleStages ให้แอป
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
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
BOARD_ID=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
L94="คลังลาดพร้าว 94"
mk() {  # $1 เครื่อง $2 ประเภทงาน → ใบใหม่
  POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"${2:-CM}\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYMPTOM\"}]}" | J 'd.orders[0].id'
}
spec() {  # $1 ใบ $2 คลังที่มีบอร์ด → เช็คอะไหล่แล้ว มีครบ (ขั้นนัดวัน)
  POST $S "work-orders/$1/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD_ID,\"quantity\":1}]}" >/dev/null
  POST $A "work-orders/$1/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"$2\"}]}" >/dev/null
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
POST $A "work-orders/$R1/parts-check" "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-RS1\"}]}" >/dev/null
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
echo "$N" | grep -q "ดึงงานคืนจากช่าง" && echo "$N" | grep -q "แอดมินตกลงวันใหม่กับร้านแล้ว" && echo "$N" | grep -q "ร้านปิดวันนั้น" \
  && pass "บันทึกบอกว่าดึงงานคืน · แอดมินตกลงวันใหม่กับร้านแล้ว · เหตุผล" || fail "บันทึกดึงคืน: $N"
[ "$(RS $R1)" = "true" ] && [ "$(ROW $S INBOX $R1 'String(r.rescheduled)')" = "true" ] && pass "ดึงคืนแล้วหัวหน้าภาคเห็น \"คอนเฟิร์มวันใหม่\"" || fail "rescheduled หลังดึงคืน"
POST $S "work-orders/$R1/dispatch" '{}' >/dev/null
POST $T "work-orders/$R1/arrive" '{}' >/dev/null
R=$(POST $A work-orders/$R1/reschedule "$(MOVE $(day 22))")
echo "$R" | grep -q "ช่างถึงหน้างานแล้ว" && [ "$(WO $R1)" = "IN_PROGRESS|CONFIRMED|$TEAM|$D4|13:30" ] \
  && pass "ช่างกดถึงหน้างานแล้ว: 409 (ให้ช่างแจ้งปัญหาหน้างาน) ฐานข้อมูลไม่เปลี่ยน" || fail "หลังถึงหน้างาน: $(WO $R1) $(echo $R | head -c 150)"

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
POST $A "work-orders/$R4/parts-check" "{\"transfer\":true,\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังขอนแก่น\"}]}" >/dev/null
XF() { DB "select coalesce(\"inStock\"::text,'-')||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"transferFrom\",'-')||'|'||coalesce(\"transferReqNo\",'-')||'|'||coalesce(\"transferNo\",'-')||'|'||(\"transferredAt\" is not null) from \"WorkOrderPart\" where \"workOrderId\"=$R4 and kind='WAITING'"; }
[ "$(WO $R4 | cut -d'|' -f1)" = "PARTS_TRANSFER" ] || fail "เตรียมใบ R4: $(WO $R4)"
X0=$(XF)
POST $A work-orders/$R4/reschedule "$(MOVE $D2 ของโอนมาไม่ทัน)" >/dev/null
[ "$(WO $R4)" = "PARTS_TRANSFER|PENDING|$TEAM|$D2|-" ] && [ "$(XF)" = "$X0" ] && [ "$(LASTLOG $R4)" = "APPOINTMENT_MOVED|PARTS_TRANSFER|A001" ] \
  && pass "ขั้นหัวหน้าภาคเบิกและโอน: เลื่อนได้ ขั้น/ทีม/สถานะนัด/ผลเช็คอะไหล่ไม่เปลี่ยน (ฐานข้อมูล)" || fail "เลื่อนขั้นโอน: $(WO $R4) $(XF) $(LASTLOG $R4)"
POST $S "work-orders/$R4/parts-transfer" "{\"results\":[{\"sparePartId\":$BOARD_ID,\"fromWarehouse\":\"คลังขอนแก่น\",\"transferReqNo\":\"KK-RS\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-RS\"}]}" >/dev/null
X1=$(XF)
[ "$X1" = "true|$L94|คลังขอนแก่น|KK-RS|TR-RS|false" ] || fail "เตรียมของกำลังโอน: $X1"
POST $A work-orders/$R4/reschedule "$(MOVE $D3 ร้านขอเลื่อน)" >/dev/null
[ "$(WO $R4)" = "PARTS_IN_TRANSIT|PENDING|$TEAM|$D3|-" ] && [ "$(XF)" = "$X1" ] && [ "$(LASTLOG $R4)" = "APPOINTMENT_MOVED|PARTS_IN_TRANSIT|A001" ] \
  && pass "ของกำลังโอน: เลื่อนได้ เลขใบเบิกต้นทาง/เลขที่ใบโอนไม่หาย (ฐานข้อมูล)" || fail "เลื่อนระหว่างโอน: $(WO $R4) $(XF)"

echo
echo "═══ ใบผูกเคสเครื่องเสีย — วันเข้าบนเคสตามไปด้วย"
OUT=$(DB "insert into \"Outage\"(kind,\"branchId\",\"startedAt\",\"lastSeenAt\") select 'MACHINE_OFF',id,now(),now() from \"Branch\" where code='$BR' returning id" | head -1)
R5=$(POST $A "work-orders/from-outage/$OUT" "{\"jobType\":\"CM\",\"symptom\":\"$SYMPTOM\"}" | J 'd.id')
spec $R5 "$L94"; assign $R5 "$D1"
[ "$(DB "select coalesce(\"scheduledVisitAt\"::date::text,'-') from \"Outage\" where id=$OUT")" = "$D1" ] || fail "เตรียม: วันเข้าบนเคสไม่ตามนัดแรก"
POST $A work-orders/$R5/reschedule "$(MOVE $D2 ร้านขอ)" >/dev/null
[ "$(DB "select \"scheduledVisitAt\"::date from \"Outage\" where id=$OUT")" = "$D2" ] && [ "$(WO $R5)" = "PARTS_REQUESTED|PENDING|$TEAM|$D2|-" ] \
  && pass "Outage.scheduledVisitAt ตามวันใหม่ ใบอยู่ขั้นเดิม (ฐานข้อมูล)" || fail "เคส: $(DB "select \"scheduledVisitAt\" from \"Outage\" where id=$OUT") $(WO $R5)"

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
POST $A "work-orders/$R6/confirm-appointment" "{\"scheduledAt\":\"$D3\"}" >/dev/null
POST $S "work-orders/$R6/dispatch" '{}' >/dev/null
[ "$(WO $R6 | cut -d'|' -f1)" = "INSPECTING" ] || fail "เตรียมช่างตรวจ: $(WO $R6)"
POST $A work-orders/$R6/reschedule "$(MOVE $D4 ร้านปิด)" >/dev/null
[ "$(WO $R6)" = "INSPECT_DISPATCH|CONFIRMED|$TEAM|$D4|-" ] && [ "$(LASTLOG $R6)" = "APPOINTMENT_RECALLED|INSPECT_DISPATCH|A001" ] \
  && pass "ช่างตรวจยังไม่ถึง: ดึงคืนไปรอส่งช่างตรวจ (ฐานข้อมูล)" || fail "ดึงคืนตรวจ: $(WO $R6) $(LASTLOG $R6)"
[ "$(GET $A work-orders/$R6 | J '[d.flow.inspect,d.flow.inspectRounds].join("|")')" = "true|1" ] && pass "detail.flow: มีรอบตรวจหน้างาน 1 รอบ" || fail "flow ตรวจ: $(GET $A work-orders/$R6 | J 'JSON.stringify(d.flow)')"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
