#!/bin/bash
# ทดสอบ: เปลี่ยนสิทธิ์แล้วใช้ได้ทันทีกับโทเคนเดิม ไม่ต้องออกแล้วเข้าระบบใหม่
#
# เคสจริง: ช่างที่เข้าระบบไว้แล้วถูกตั้งเป็นหัวหน้าภาค — แอปเห็นเป็นหัวหน้าภาค (อ่าน /auth/me สด)
# เปิดหน้าจ่ายงานได้ แต่กดแล้วโดน "ขั้นนี้เป็นของหัวหน้าภาค ไม่ใช่ของคุณ" เพราะเซิร์ฟเวอร์เชื่อสิทธิ์ในโทเคน
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"User\" where \"employeeCode\"='ZR$SUF'" >/dev/null
}
trap cleanup EXIT

A=$(login A001 | J 'd.token')
S=$(login S001 | J 'd.token')
# ใบงานที่รอหัวหน้าภาคจ่ายงาน (สาขา C0006 ทีมกระบี่)
newOrder() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบเปลี่ยนสิทธิ์"}]}' | J 'd.orders?d.orders[0].id:d.id')
  POST $S "work-orders/$id/parts" '{"needsParts":false}' >/dev/null
  echo $id
}

POST $A auth/users "{\"employeeCode\":\"ZR$SUF\",\"name\":\"ช่างทดสอบเลื่อนสิทธิ์\",\"role\":\"EMPLOYEE\",\"password\":\"temp12345\"}" >/dev/null
T=$(login "ZR$SUF" temp12345 | J 'd.token')
T=$(POST $T auth/change-password '{"currentPassword":"temp12345","newPassword":"test12345"}' | J 'd.token')
UID_=$(DB "select id from \"User\" where \"employeeCode\"='ZR$SUF'")

echo "═══ ช่าง → หัวหน้าภาค (โทเคนเดิม)"
W1=$(newOrder); IDS="$IDS $W1"
R=$(POST $T "work-orders/$W1/assign" '{"team":"กระบี่"}')
echo "$R" | grep -q "ไม่ใช่ของคุณ" && pass "ตอนเป็นช่าง จ่ายงานไม่ได้" || fail "ช่างจ่ายงานได้: $(echo $R | head -c 120)"

PATCH $A "auth/users/$UID_" '{"role":"SUPERVISOR","supervisedTeams":["กระบี่"]}' >/dev/null
[ "$(DB "select role from \"User\" where id=$UID_")" = "SUPERVISOR" ] && pass "DB: ตั้งเป็นหัวหน้าภาคแล้ว" || fail "DB: role ไม่เปลี่ยน"
R=$(POST $T "work-orders/$W1/assign" '{"team":"กระบี่"}')
[ "$(DB "select status||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$W1")" = "ASSIGNED|กระบี่" ] \
  && pass "โทเคนเดิมจ่ายงานได้ทันทีหลังเลื่อนเป็นหัวหน้าภาค (DB: ASSIGNED กระบี่)" || fail "ยังจ่ายไม่ได้: $(echo $R | head -c 160)"

echo
echo "═══ หัวหน้าภาค → ช่าง (โทเคนเดิม) ต้องเสียสิทธิ์ทันที"
# โทเคนที่ออกตอนเป็นหัวหน้าภาค — ข้างในเขียนว่า SUPERVISOR
TS=$(login "ZR$SUF" test12345 | J 'd.token')
W2=$(newOrder); IDS="$IDS $W2"
PATCH $A "auth/users/$UID_" '{"role":"EMPLOYEE"}' >/dev/null
R=$(POST $TS "work-orders/$W2/assign" '{"team":"กระบี่"}')
[ "$(DB "select status from \"WorkOrder\" where id=$W2")" = "PARTS_CHECKED" ] && echo "$R" | grep -q "ไม่ใช่ของคุณ" \
  && pass "ถอดสิทธิ์แล้วโทเคนเดิมจ่ายงานไม่ได้ (DB: ยังรอจ่ายงาน)" || fail "ถอดสิทธิ์แล้วยังจ่ายได้: $(echo $R | head -c 120)"
R=$(curl -s localhost:4000/api/auth/users -H "$(H $TS)")
echo "$R" | grep -q "employeeCode" && fail "ช่างดูรายชื่อผู้ใช้ได้" || pass "หน้าแอดมินก็ใช้สิทธิ์ปัจจุบัน (ช่างเปิดรายชื่อผู้ใช้ไม่ได้)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
