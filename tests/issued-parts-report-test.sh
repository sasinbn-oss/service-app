#!/bin/bash
# ทดสอบ: รายงานอะไหล่เบิกแล้ว · งานยังไม่จบ (GET /work-orders/reports/issued-parts — เจ้าของงานขอ ต.ค. 69)
#   · ขึ้นเฉพาะใบที่ยังไม่ปิดและมีของออกจากคลังแล้ว (ใบเบิกส่งมอบ หรือเบิกเพื่อโอน) · ใบที่เช็คแล้วแต่ยังไม่เบิก / ปิดแล้ว / ใบทดสอบ ไม่ขึ้น
#   · กลุ่มขั้น (bucket — รวม "รอคอนเฟิร์มลูกค้า" ของเบิกก่อนคอนเฟิร์ม) · ลูกค้าคอนเฟิร์ม · กำลังโอน (ต้นทาง ใบเบิก ใบโอน) · เลยวันนัด
#   · ตัวที่ยังไม่เบิกในใบเดียวกัน (issued=false)
#   · หัวหน้าภาคนอกพื้นที่ไม่เห็น · ช่าง 403 · Excel มีแถวละอะไหล่ที่เบิกแล้ว + ชีตรวมตามอะไหล่
set -e
. "$(dirname "$0")/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s "localhost:4000/api/work-orders/reports/issued-parts$2" -H "$(H $1)"; }
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
A=$(login A001); T=$(login T001)
BR=C0006
L94="คลังลาดพร้าว 94"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
# อะไหล่ของแต่ละใบ = ตัวที่ตรงยี่ห้อเครื่องของใบนั้น (fx_part) — ทุกใบคนละเครื่อง ยี่ห้ออาจไม่เหมือนกัน
# จึงเลือกหลังเปิดใบทีละใบ (B = บอร์ด · L = สายพาน ของใบในบรรทัดนั้น) · แถวรายงานหาด้วยรหัสของตัวที่ใช้จริง (row)
newwo() {  # $1 เครื่อง $2 ONE (บอร์ด 1) / TWO (บอร์ด 1 + สายพาน 2) → ใบที่ระบุอะไหล่แล้ว
  local I=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"ทดสอบรายงานอะไหล่เบิกแล้ว\"}]}" | J 'd.orders[0].id') B L=""
  B=$(fx_part "$I" BOARD) || return 1
  if [ "$2" = TWO ]; then L=$(fx_part "$I" BELT) || return 1; fi
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":$(partsJson $B $L)}" >/dev/null
  echo $I
}
partsJson() {  # $1 บอร์ด [$2 สายพาน] → รายการอะไหล่ (บอร์ด 1 · สายพาน 2)
  if [ -n "$2" ]; then
    echo "[{\"sparePartId\":$1,\"quantity\":1},{\"sparePartId\":$2,\"quantity\":2}]"
  else
    echo "[{\"sparePartId\":$1,\"quantity\":1}]"
  fi
}
src() { POST $A "work-orders/$1/parts-sourcing" "{\"results\":[$2]}" >/dev/null; }
# นัดวัน → เบิก → คอนเฟิร์มลูกค้า (ต.ค. 69 รอบสอง)
sched() { POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$2\"}" >/dev/null; }
issue() { POST $A "work-orders/$1/parts-check" "{\"results\":[$2]}" >/dev/null; }
cf() { POST $A "work-orders/$1/confirm-appointment" '{}' >/dev/null; }
IN94() { echo "{\"sparePartId\":$1,\"inStock\":true,\"warehouse\":\"$L94\"$([ -n "$2" ] && echo ",\"requisitionNo\":\"$2\"")}"; }

# W1: เบิกแล้ว รอปล่อยงาน · W2: บอร์ดเบิก สายพานกำลังโอนจากภูเก็ต · W3: เช็คแล้ว ยังไม่เบิก (ไม่ขึ้น)
# W4: ช่างเข้างาน เลยวันนัด · W5: ปิดแล้ว (ไม่ขึ้น) · W6: ใบทดสอบ (ไม่ขึ้น) · W7: ช่างขอสายพานเพิ่ม (บอร์ดเบิก สายพานยังไม่เบิก)
# W8: เบิกครบแล้ว รอแอดมินโทรคอนเฟิร์มลูกค้า (ของอยู่ในมือ ลูกค้ายังไม่ตอบ)
W1=$(newwo W91 ONE); B=$(fx_part $W1 BOARD); src $W1 "$(IN94 $B)"; sched $W1 "$(day 5)"; issue $W1 "$(IN94 $B RQ-IR1)"; cf $W1
W2=$(newwo W92 TWO); B=$(fx_part $W2 BOARD); L=$(fx_part $W2 BELT); src $W2 "$(IN94 $B),{\"sparePartId\":$L,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}"; sched $W2 "$(day 9)"
issue $W2 "$(IN94 $B RQ-IR2),{\"sparePartId\":$L,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}"
POST $S "work-orders/$W2/parts-transfer" "{\"results\":[{\"sparePartId\":$L,\"fromWarehouse\":\"คลังภูเก็ต\",\"transferReqNo\":\"PK-IR\",\"toWarehouse\":\"$L94\",\"transferNo\":\"TR-IR\"}]}" >/dev/null
W3=$(newwo W93 ONE); B=$(fx_part $W3 BOARD); src $W3 "$(IN94 $B)"
W4=$(newwo W94 ONE); B=$(fx_part $W4 BOARD); src $W4 "$(IN94 $B)"; sched $W4 "$(day 3)"; issue $W4 "$(IN94 $B RQ-IR4)"; cf $W4
POST $S "work-orders/$W4/dispatch" '{}' >/dev/null
DB "update \"WorkOrder\" set \"scheduledAt\"='$(day -3)' where id=$W4" >/dev/null
W5=$(newwo W95 ONE); B=$(fx_part $W5 BOARD); src $W5 "$(IN94 $B)"; sched $W5 "$(day 4)"; issue $W5 "$(IN94 $B RQ-IR5)"
DB "update \"WorkOrder\" set status='DONE' where id=$W5" >/dev/null
W6=$(newwo W96 ONE); B=$(fx_part $W6 BOARD); src $W6 "$(IN94 $B)"; sched $W6 "$(day 4)"; issue $W6 "$(IN94 $B RQ-IR6)"
DB "update \"WorkOrder\" set \"isTest\"=true where id=$W6" >/dev/null
W7=$(newwo W97 ONE); B=$(fx_part $W7 BOARD); L=$(fx_part $W7 BELT); src $W7 "$(IN94 $B)"; sched $W7 "$(day 4)"; issue $W7 "$(IN94 $B RQ-IR7)"; cf $W7
POST $S "work-orders/$W7/dispatch" '{}' >/dev/null
POST $A "work-orders/$W7/reassess-parts" "{\"reasonCode\":\"PARTS\",\"reason\":\"ต้องเปลี่ยนสายพานด้วย\",\"parts\":[{\"sparePartId\":$L,\"quantity\":2}]}" >/dev/null
POST $S "work-orders/$W7/parts" "{\"needsParts\":true,\"parts\":$(partsJson $B $L)}" >/dev/null
W8=$(newwo W98 ONE); B=$(fx_part $W8 BOARD); src $W8 "$(IN94 $B)"; sched $W8 "$(day 6)"; issue $W8 "$(IN94 $B RQ-IR8)"
IDS="$W1 $W2 $W3 $W4 $W5 $W6 $W7 $W8"
ST=$(DB "select string_agg(status||':'||coalesce(\"appointmentStatus\",'-'),',' order by id) from \"WorkOrder\" where id in ($W1,$W2,$W4,$W7,$W8)")
[ "$ST" = "ASSIGNED:CONFIRMED,PARTS_IN_TRANSIT:PENDING,IN_PROGRESS:CONFIRMED,PARTS_SOURCING:-,AWAITING_CONFIRM:PENDING" ] \
  && pass "เตรียมใบ: รอปล่อยงาน · กำลังโอน · ช่างเข้างาน · ช่างขอของเพิ่ม · เบิกแล้วรอคอนเฟิร์มลูกค้า (ฐานข้อมูล)" || fail "เตรียมใบ: $ST"

R=$(REP $A)
mine() { echo "$R" | J "[...new Set(d.rows.filter(r=>[$W1,$W2,$W3,$W4,$W5,$W6,$W7,$W8].includes(r.workOrderId)).map(r=>r.workOrderId))].sort((a,b)=>a-b).join(',')"; }
[ "$(mine)" = "$(printf '%s\n' $W1 $W2 $W4 $W7 $W8 | sort -n | paste -sd,)" ] \
  && pass "ขึ้นเฉพาะใบที่ยังไม่ปิดและเบิกแล้ว — เช็คแล้วยังไม่เบิก / ปิดแล้ว / ใบทดสอบ ไม่ขึ้น" || fail "ใบในรายงาน: $(mine)"
row() { echo "$R" | J "JSON.stringify(d.rows.find(r=>r.workOrderId==$1 && r.partCode==='$(fx_part_code $1 $2)'))"; }  # $2 = BOARD/BELT
[ "$(row $W1 BOARD | J '[d.bucket,d.issued,d.confirmed,d.warehouse,d.requisitionNo,d.issuedDays,d.lateDays,d.statusLabel].join("|")')" = "dispatch|true|true|$L94|RQ-IR1|0||หัวหน้าภาค · รับทราบ ปล่อยงาน" ] \
  && pass "W1: รอปล่อยงาน · ลูกค้าคอนเฟิร์มแล้ว · คลัง + เลขใบเบิก · เบิกวันนี้ · ไม่เลยนัด" || fail "W1: $(row $W1 BOARD)"
[ "$(row $W2 BELT | J '[d.bucket,d.issued,d.transferFrom,d.transferReqNo,d.warehouse,d.transferNo,d.transferArrived,d.requisitionNo,d.issuedDays].join("|")')" = "transfer|true|คลังภูเก็ต|PK-IR|$L94|TR-IR|false||0" ] \
  && pass "W2: สายพานเบิกเพื่อโอน — ต้นทาง ใบเบิกต้นทาง ปลายทาง ใบโอน กำลังโอน · เวลาเบิกจากประวัติโอน" || fail "W2 สายพาน: $(row $W2 BELT)"
[ "$(row $W2 BOARD | J '[d.bucket,d.issued,d.requisitionNo].join("|")')" = "transfer|true|RQ-IR2" ] && pass "W2: บอร์ดเบิกส่งมอบแล้วขึ้นคู่กัน" || fail "W2 บอร์ด: $(row $W2 BOARD)"
[ "$(row $W4 BOARD | J '[d.bucket,d.lateDays,d.statusLabel].join("|")')" = "field|3|ช่าง · เข้างาน/ปิดงาน" ] \
  && pass "W4: ช่างเข้างาน วันนัดผ่านมา 3 วัน → เลยนัด 3 วัน" || fail "W4: $(row $W4 BOARD)"
[ "$(row $W7 BOARD | J '[d.bucket,d.issued,d.requisitionNo].join("|")')|$(row $W7 BELT | J '[d.issued,d.requisitionNo,d.inStock].join("|")')" = "other|true|RQ-IR7|false||" ] \
  && pass "W7: ช่างขอของเพิ่ม — บอร์ดเบิกแล้ว สายพานขึ้นเป็นยังไม่เบิก (issued=false)" || fail "W7: $(row $W7 BOARD) / $(row $W7 BELT)"
[ "$(row $W8 BOARD | J '[d.bucket,d.issued,d.confirmed,d.requisitionNo,d.statusLabel].join("|")')" = "confirm|true|false|RQ-IR8|แอดมิน · คอนเฟิร์มลูกค้า" ] \
  && pass "W8: เบิกครบแล้ว ยังไม่โทรร้าน → กลุ่ม \"รอคอนเฟิร์มลูกค้า\" (confirm) · ลูกค้ายังไม่คอนเฟิร์ม" || fail "W8: $(row $W8 BOARD)"
IX() { echo "$R" | J "d.rows.findIndex(r=>r.workOrderId==$1)"; }
[ "$(IX $W2)" -lt "$(IX $W8)" ] && [ "$(IX $W8)" -lt "$(IX $W1)" ] && [ "$(IX $W1)" -lt "$(IX $W4)" ] \
  && pass "เรียงตามขั้น: กำลังโอน → รอคอนเฟิร์มลูกค้า → รอปล่อยงาน → ช่างเข้างาน" || fail "ลำดับแถวไม่ตามขั้น: $(IX $W2) $(IX $W8) $(IX $W1) $(IX $W4)"

DB "update \"User\" set region='ภาคทดสอบไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S2=$(login S001)
[ "$(REP $S2 | J "d.rows.filter(r=>[$W1,$W2,$W4,$W7,$W8].includes(r.workOrderId)).length")" = "0" ] && pass "หัวหน้าภาคนอกพื้นที่ไม่เห็น" || fail "นอกพื้นที่เห็น"
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
[ "$(REP $S | J "new Set(d.rows.filter(r=>[$W1,$W2,$W4,$W7,$W8].includes(r.workOrderId)).map(r=>r.workOrderId)).size")" = "5" ] && pass "หัวหน้าภาคในพื้นที่เห็นครบ" || fail "หัวหน้าภาคในพื้นที่เห็นไม่ครบ"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/reports/issued-parts -H "$(H $T)")" = "403" ] && pass "ช่าง 403" || fail "ช่างเข้าได้"

P=$(REP $A "?format=xlsx" | J 'd.path')
X=$(mktemp)
curl -s "localhost:4000$P" -H "$(H $A)" -o "$X"
SS=$(unzip -p "$X" xl/sharedStrings.xml 2>/dev/null)
C1=$(DB "select code from \"WorkOrder\" where id=$W1"); C3=$(DB "select code from \"WorkOrder\" where id=$W3")
echo "$SS" | grep -q "$C1" && echo "$SS" | grep -q "RQ-IR1" && echo "$SS" | grep -q "PK-IR" && ! echo "$SS" | grep -q "$C3" \
  && unzip -p "$X" xl/workbook.xml | grep -q "รวมตามอะไหล่" \
  && pass "Excel: มีเลขใบงาน เลขใบเบิก ใบเบิกโอน · ไม่มีใบที่ยังไม่เบิก · มีชีตรวมตามอะไหล่" || fail "Excel ไม่ตรง (path=$P)"
rm -f "$X"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
