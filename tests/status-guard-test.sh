#!/bin/bash
# ทดสอบ: กันแก้สถานะจนใบงานมั่ว (ต.ค. 69)
#   · คนตั้งเองได้แค่ "รอลูกค้าแจ้งซ่อม" (ต้องมีเหตุผล) กับ "อัตโนมัติ" · ค่าที่ระบบตั้งแก้มือไม่ได้
#   · ส่งค่าเดิมกลับมา (แอปเก่า) ไม่นับว่าแก้ · ประวัติบอกจาก → ถึง และเหตุผล
#   · เปลี่ยนขั้นแล้ว "รอลูกค้า" หมดอายุ · ขั้นเสนอราคา = รอแอดมินส่งใบเสนอราคา · ช่างส่งกลับ = ล้าง
set -e
. "$(dirname "$0")/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/work-orders/$1" -H "$(H $A)" -H 'Content-Type: application/json' -d "$2"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
ws() { DB "select coalesce(\"workStatus\",'-') from \"WorkOrder\" where id=$1"; }
nlog() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='STATUS_CHANGED'"; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
VISIT=$(day 12)

SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
OLDR=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
R=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
S=$(login S001)

echo "═══ เปิดใบงาน — ยกมาได้เฉพาะสถานะที่คนตั้งเอง"
ID0=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","workStatus":"WAITING_PARTS","machines":[{"code":"W91","symptom":"ทดสอบสถานะ"}]}' | J 'd.orders[0].id')
[ "$(ws $ID0)" = "-" ] && pass "เปิดใบงานพร้อม \"รออะไหล่\" → ไม่ยกมา (ขั้นแรกระบบไม่ตั้ง)" || fail "สถานะตอนเปิด: $(ws $ID0)"
ID=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","workStatus":"WAITING_CUSTOMER","machines":[{"code":"W92","symptom":"ทดสอบสถานะ"}]}' | J 'd.orders[0].id')
[ "$(ws $ID)" = "WAITING_CUSTOMER" ] && pass "เปิดใบงานพร้อม \"รอลูกค้าแจ้งซ่อม\" → ยกมาได้" || fail "สถานะตอนเปิด: $(ws $ID)"
# อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ — หยิบหลังเปิดใบ เพราะต้องรู้ก่อนว่าเครื่องเป็นยี่ห้ออะไร
PID=$(fx_part "$ID" BOARD)

echo
echo "═══ ถึงขั้นเช็คอะไหล่ — รอลูกค้าหมดอายุ ระบบตั้งตามขั้น"
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
[ "$(ws $ID)" = "CHECKING_PARTS" ] && pass "เปลี่ยนขั้นแล้ว \"รอลูกค้า\" หาย → รอแอดมินเช็คอะไหล่" || fail "หลังเปลี่ยนขั้น: $(ws $ID)"

echo
echo "═══ ค่าที่ระบบตั้งแก้มือไม่ได้"
for v in WAITING_PARTS WAITING_TECH WAITING_PAYMENT QUOTING; do
  R=$(PATCH $ID "{\"workStatus\":\"$v\"}")
  echo "$R" | grep -q "ระบบตั้งตามขั้นของใบงาน แก้เองไม่ได้" && [ "$(ws $ID)" = "CHECKING_PARTS" ] && pass "$v ถูกปฏิเสธ (ข้อความไทย) ฐานข้อมูลไม่เปลี่ยน" || fail "$v: $R"
done
R=$(PATCH $ID '{"workStatus":"CHECKING_PARTS","symptom":"บอร์ดไหม้"}')
echo "$R" | J 'd.symptom' | grep -q "บอร์ดไหม้" && [ "$(nlog $ID)" = "0" ] && pass "ส่งค่าเดิมกลับมา (แอปเก่า) บันทึกอาการได้ ไม่นับว่าเปลี่ยนสถานะ" || fail "ค่าเดิม: $R"

echo
echo "═══ รอลูกค้าแจ้งซ่อม — ต้องมีเหตุผล · ลงประวัติ"
R=$(PATCH $ID '{"workStatus":"WAITING_CUSTOMER"}')
echo "$R" | grep -q "ต้องบอกเหตุผล" && [ "$(ws $ID)" = "CHECKING_PARTS" ] && pass "ไม่มีเหตุผล → ปฏิเสธ" || fail "ไม่มีเหตุผล: $R"
PATCH $ID '{"workStatus":"WAITING_CUSTOMER","workStatusNote":"ร้านปิดปรับปรุงถึง 20 ต.ค."}' >/dev/null
[ "$(ws $ID)" = "WAITING_CUSTOMER" ] && pass "มีเหตุผล → ตั้งได้ (ฐานข้อมูล)" || fail "ตั้งไม่ได้: $(ws $ID)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='STATUS_CHANGED' order by id desc limit 1" | grep -q "^รอแอดมินเช็คอะไหล่ → รอลูกค้าแจ้งซ่อม — ร้านปิดปรับปรุงถึง 20 ต.ค.$" \
  && pass "ประวัติ: จาก → ถึง — เหตุผล" || fail "ประวัติ: $(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='STATUS_CHANGED' order by id desc limit 1")"
PATCH $ID '{"workStatus":null}' >/dev/null
[ "$(ws $ID)" = "CHECKING_PARTS" ] && pass "กลับเป็นอัตโนมัติ → ระบบคำนวณตามขั้นให้ (รอแอดมินเช็คอะไหล่)" || fail "อัตโนมัติ: $(ws $ID)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='STATUS_CHANGED' order by id desc limit 1" | grep -q "อัตโนมัติตามขั้น (รอแอดมินเช็คอะไหล่)" \
  && pass "ประวัติบอกว่ากลับเป็นอัตโนมัติ" || fail "ประวัติอัตโนมัติไม่ตรง"

echo
echo "═══ อัตโนมัติคิดผลเช็คคลังด้วย"
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":false}]}" >/dev/null
PATCH $ID '{"workStatus":"WAITING_CUSTOMER","workStatusNote":"ทดสอบ"}' >/dev/null
PATCH $ID '{"workStatus":null}' >/dev/null
[ "$(ws $ID)" = "WAITING_PARTS" ] && pass "อะไหล่หมดอยู่ กลับเป็นอัตโนมัติ → รออะไหล่" || fail "อัตโนมัติ+หมด: $(ws $ID)"

echo
echo "═══ ช่างส่งกลับ — ล้างสถานะรอบก่อน"
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}" >/dev/null
TEAM=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].zone')
POST $S "work-orders/$ID/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
[ "$(ws $ID)" = "CHECKING_PARTS" ] && pass "นัดแล้วถึงขั้นเบิก → รอแอดมินเช็คอะไหล่ (ไม่ค้าง \"รอช่าง\")" || fail "ขั้นเบิก: $(ws $ID)"
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-SG1\"}]}" >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
# ดูขั้นที่ฐานข้อมูลด้วย — "รอช่างเข้าแก้ไข" ขึ้นตั้งแต่ขั้นคอนเฟิร์มลูกค้า ป้ายอย่างเดียวผ่านได้ทั้งที่ยังไม่ถึงช่าง
[ "$(ws $ID)" = "WAITING_TECH" ] && [ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] \
  && pass "เบิก → คอนเฟิร์มลูกค้า → ช่างเข้างาน → รอช่างเข้าแก้ไข" || fail "ช่างเข้างาน: $(ws $ID)"
POST $A "work-orders/$ID/reassess-parts" '{"reasonCode":"PARTS","reason":"อะไหล่ไม่ตรง"}' >/dev/null
[ "$(ws $ID)" = "-" ] && pass "ช่างส่งกลับ → ล้างสถานะ (ไม่ค้าง \"รอช่างเข้าแก้ไข\")" || fail "หลังส่งกลับ: $(ws $ID)"

curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$OLDR\"}" >/dev/null
for i in $ID0 $ID; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"; done
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
