#!/bin/bash
# ทดสอบ: ตำแหน่งแอดมินอะไหล่ (PARTS_ADMIN) — ดูได้ทุกอย่าง แก้ได้เฉพาะเคลม/ข้อมูลอะไหล่/งานส่วนตัว · ตั้ง/ถอดได้เฉพาะ Super Admin ·
#        Super Admin ดูในฐานะแอดมินอะไหล่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
SUF=$RANDOM
WO=""
PART=""
cleanup() {
  [ -n "$WO" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$WO" -H "$(H $A)" >/dev/null
  [ -n "$PART" ] && curl -s -X DELETE "localhost:4000/api/spare-parts/$PART" -H "$(H $A)" >/dev/null
  DB "delete from \"ViewAsLog\" where \"byUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZPA%$SUF');
      delete from \"User\" where \"employeeCode\" like 'ZPA%$SUF'" >/dev/null
}
trap cleanup EXIT
A=$(login A001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZPAS$SUF','ซุปเปอร์ทดสอบแอดมินอะไหล่','SUPER_ADMIN','$HASH',false),
  ('ZPAP$SUF','แอดมินอะไหล่ทดสอบ','EMPLOYEE','$HASH',false)" >/dev/null
SA=$(login ZPAS$SUF)
PID=$(DB "select id from \"User\" where \"employeeCode\"='ZPAP$SUF'")
PATCH() { curl -s -X PATCH "localhost:4000/api/auth/users/$PID" -H "$(H $1)" -H 'Content-Type: application/json' -d "$2"; }

echo "═══ ตั้งตำแหน่ง"
PATCH $A '{"role":"PARTS_ADMIN"}' | grep -q "Super Admin" && pass "แอดมินทั่วไปตั้งแอดมินอะไหล่ไม่ได้" || fail "แอดมินทั่วไปตั้งได้"
[ "$(DB "select role from \"User\" where id=$PID")" = "EMPLOYEE" ] && pass "ฐานข้อมูลยังเป็นช่างเหมือนเดิม" || fail "ถูกเปลี่ยนทั้งที่ไม่มีสิทธิ์"
PATCH $SA '{"role":"PARTS_ADMIN"}' | J 'd.role' | grep -q "^PARTS_ADMIN$" && pass "Super Admin ตั้งแอดมินอะไหล่ได้" || fail "Super Admin ตั้งไม่ได้"
[ "$(DB "select role from \"User\" where id=$PID")" = "PARTS_ADMIN" ] && pass "ฐานข้อมูลบันทึกเป็น PARTS_ADMIN" || fail "ฐานข้อมูลไม่เปลี่ยน"

echo
echo "═══ ดูได้ทุกอย่าง แก้ได้เฉพาะเคลมกับข้อมูลอะไหล่"
P=$(login ZPAP$SUF)
curl -s localhost:4000/api/auth/me -H "$(H $P)" | J 'd.role' | grep -q "^PARTS_ADMIN$" && pass "/auth/me บอกตำแหน่งแอดมินอะไหล่" || fail "me"
R=$(curl -s -X POST localhost:4000/api/spare-parts -H "$(H $P)" -H 'Content-Type: application/json' -d "{\"partCode\":\"ZPA$SUF\",\"name\":\"อะไหล่ทดสอบแอดมินอะไหล่\"}")
PART=$(echo "$R" | J 'd.id||""')
[ -n "$PART" ] && [ "$(DB "select count(*) from \"SparePart\" where \"partCode\"='ZPA$SUF'")" = "1" ] \
  && pass "เพิ่มข้อมูลอะไหล่ได้ (ฐานข้อมูล)" || fail "เพิ่มอะไหล่: $R"
N0=$(DB "select count(*) from \"WorkOrder\"")
R=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $P)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบแอดมินอะไหล่"}]}')
echo "$R" | grep -q "ดูได้อย่างเดียว" && [ "$(DB "select count(*) from \"WorkOrder\"")" = "$N0" ] \
  && pass "เปิดใบงานไม่ได้ และฐานข้อมูลไม่มีใบงานเพิ่ม" || fail "เปิดใบงานได้: $R"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบแอดมินอะไหล่"}]}' | J 'd.orders?d.orders[0].id:d.id')
curl -s -X DELETE "localhost:4000/api/work-orders/$WO" -H "$(H $P)" | grep -q "ดูได้อย่างเดียว" && [ "$(DB "select count(*) from \"WorkOrder\" where id=$WO")" = "1" ] \
  && pass "ลบใบงานไม่ได้ (ใบยังอยู่ในฐานข้อมูล)" || fail "ลบใบงานได้"
curl -s -X POST "localhost:4000/api/work-orders/$WO/cancel" -H "$(H $P)" -H 'Content-Type: application/json' -d '{"reason":"ทดสอบ"}' | grep -q "ดูได้อย่างเดียว" \
  && [ "$(DB "select status from \"WorkOrder\" where id=$WO")" = "NEW" ] && pass "ยกเลิก/เดินขั้นใบงานไม่ได้ (สถานะเดิม)" || fail "แก้ใบงานได้"
curl -s -X PUT localhost:4000/api/plans -H "$(H $P)" -H 'Content-Type: application/json' -d '{}' | grep -q "ดูได้อย่างเดียว" && pass "จัดแผนงานไม่ได้" || fail "จัดแผนได้"
curl -s -X POST localhost:4000/api/auth/users -H "$(H $P)" -H 'Content-Type: application/json' -d '{}' | grep -q "ดูได้อย่างเดียว" && pass "เพิ่มผู้ใช้ไม่ได้" || fail "เพิ่มผู้ใช้ได้"
curl -s -X POST localhost:4000/api/work-orders/$WO/claim-review -H "$(H $P)" -H 'Content-Type: application/json' -d '{"approve":true}' | grep -vq "ดูได้อย่างเดียว" \
  && pass "ตรวจเคลมยังเรียกได้ (ไม่โดนกันว่าดูอย่างเดียว)" || fail "ตรวจเคลมโดนกัน"
curl -s -X POST localhost:4000/api/work-logs -H "$(H $P)" -H 'Content-Type: application/json' -d '{}' | grep -vq "ดูได้อย่างเดียว" \
  && pass "งานส่วนตัว (บันทึกการทำงาน) ยังเรียกได้" || fail "บันทึกการทำงานโดนกัน"
curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $P)" | J 'd.rows.length' > /tmp/pa_n
[ "$(cat /tmp/pa_n)" = "$(curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $A)" | J 'd.rows.length')" ] \
  && pass "เห็นใบงานทุกใบเท่าแอดมิน ($(cat /tmp/pa_n) ใบ)" || fail "เห็นไม่เท่าแอดมิน"
rm -f /tmp/pa_n
curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $P)" | J 'd.rows.every(r=>r.status==="CLAIM_REVIEW")?"ok":"bad"' | grep -q ok \
  && pass "กล่องงานมีแค่ใบที่รอตรวจเคลม" || fail "กล่องงานมีใบอื่น"
curl -s "localhost:4000/api/plans?date=2026-10-14" -H "$(H $P)" | grep -vq '"error"' && pass "ดูแผนงานได้" || fail "ดูแผนงานไม่ได้"

echo
echo "═══ ดูในฐานะ"
R=$(curl -s -X POST localhost:4000/api/auth/view-as -H "$(H $SA)" -H 'Content-Type: application/json' -d "{\"userId\":$PID}")
echo "$R" | J 'd.user&&d.user.role' | grep -q "^PARTS_ADMIN$" && pass "Super Admin ดูในฐานะแอดมินอะไหล่ได้" || fail "ดูในฐานะ: $R"

echo
echo "═══ ถอดตำแหน่ง"
PATCH $A '{"role":"EMPLOYEE"}' | grep -q "Super Admin" && pass "แอดมินทั่วไปถอดแอดมินอะไหล่ไม่ได้" || fail "แอดมินทั่วไปถอดได้"
PATCH $SA '{"role":"EMPLOYEE"}' | J 'd.role' | grep -q "^EMPLOYEE$" && pass "Super Admin ถอดกลับเป็นช่างได้" || fail "ถอดไม่ได้"
curl -s localhost:4000/api/auth/users -H "$(H $P)" | grep -q "หน้านี้สำหรับแอดมินเท่านั้น" && pass "ถอดแล้วโทเคนเดิมเข้าหน้าแอดมินไม่ได้ทันที" || fail "ถอดแล้วยังเข้าได้"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
