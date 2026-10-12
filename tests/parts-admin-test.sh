#!/bin/bash
# ทดสอบ: ตำแหน่งแอดมินอะไหล่ (PARTS_ADMIN) — สิทธิ์เท่าแอดมินทุกอย่าง · ตั้ง/ถอดได้เฉพาะ Super Admin ·
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
echo "═══ สิทธิ์เท่าแอดมิน"
P=$(login ZPAP$SUF)
curl -s localhost:4000/api/auth/me -H "$(H $P)" | J 'd.role' | grep -q "^PARTS_ADMIN$" && pass "/auth/me บอกตำแหน่งแอดมินอะไหล่" || fail "me"
curl -s localhost:4000/api/auth/users -H "$(H $P)" | J 'Array.isArray(d)?"ok":"bad"' | grep -q ok && pass "เปิดรายชื่อผู้ใช้ (เฉพาะแอดมิน) ได้" || fail "รายชื่อผู้ใช้"
R=$(curl -s -X POST localhost:4000/api/spare-parts -H "$(H $P)" -H 'Content-Type: application/json' -d "{\"partCode\":\"ZPA$SUF\",\"name\":\"อะไหล่ทดสอบแอดมินอะไหล่\"}")
PART=$(echo "$R" | J 'd.id||""')
[ -n "$PART" ] && pass "เพิ่มข้อมูลอะไหล่ (เฉพาะแอดมิน) ได้" || fail "เพิ่มอะไหล่: $R"
R=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $P)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบแอดมินอะไหล่"}]}')
WO=$(echo "$R" | J 'd.orders?d.orders[0].id:d.id')
[ -n "$WO" ] && [ "$(DB "select \"createdById\" from \"WorkOrder\" where id=$WO")" = "$PID" ] && pass "เปิดใบงานได้ และบันทึกว่าเป็นคนเปิด" || fail "เปิดใบงาน: $R"
curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $P)" | J 'd.rows.length' > /tmp/pa_n
[ "$(cat /tmp/pa_n)" = "$(curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $A)" | J 'd.rows.length')" ] \
  && pass "เห็นใบงานทุกใบเท่าแอดมิน ($(cat /tmp/pa_n) ใบ)" || fail "เห็นไม่เท่าแอดมิน"
rm -f /tmp/pa_n

echo
echo "═══ ดูในฐานะ"
R=$(curl -s -X POST localhost:4000/api/auth/view-as -H "$(H $SA)" -H 'Content-Type: application/json' -d "{\"userId\":$PID}")
echo "$R" | J 'd.user&&d.user.role' | grep -q "^PARTS_ADMIN$" && pass "Super Admin ดูในฐานะแอดมินอะไหล่ได้" || fail "ดูในฐานะ: $R"

echo
echo "═══ ถอดตำแหน่ง"
PATCH $A '{"role":"EMPLOYEE"}' | grep -q "Super Admin" && pass "แอดมินทั่วไปถอดแอดมินอะไหล่ไม่ได้" || fail "แอดมินทั่วไปถอดได้"
PATCH $SA '{"role":"EMPLOYEE"}' | J 'd.role' | grep -q "^EMPLOYEE$" && pass "Super Admin ถอดกลับเป็นช่างได้" || fail "ถอดไม่ได้"
curl -s localhost:4000/api/auth/users -H "$(H $P)" | grep -q "Admin access required" && pass "ถอดแล้วโทเคนเดิมเข้าหน้าแอดมินไม่ได้ทันที" || fail "ถอดแล้วยังเข้าได้"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
