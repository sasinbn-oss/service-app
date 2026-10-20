#!/bin/bash
# ทดสอบ: Super Admin ดูในฐานะผู้ใช้อื่น — เห็นเหมือนคนนั้นจริง · ดูได้อย่างเดียว
#        แอดมินดูได้เฉพาะหัวหน้าภาค/ช่าง (ต.ค. 69) · มีบันทึก ·
#        แอดมินทั่วไปใช้ไม่ได้ · ดู Super Admin/ตัวเองไม่ได้ · ซ้อนไม่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SUF=$RANDOM
cleanup() {
  DB "delete from \"ViewAsLog\" where \"byUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZVA%$SUF');
      delete from \"User\" where \"employeeCode\" like 'ZVA%$SUF';
      update \"User\" set role='EMPLOYEE' where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); T=$(login T001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZVAS$SUF','ซุปเปอร์ดูแทน','SUPER_ADMIN','$HASH',false),('ZVAX$SUF','ซุปเปอร์อีกคน','SUPER_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZVAS$SUF)
SAID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAS$SUF'")
SA2ID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAX$SUF'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")

echo "═══ สิทธิ์"
# แอดมินดูในฐานะได้เฉพาะหัวหน้าภาค/ช่าง (เจ้าของงานเพิ่ม ต.ค. 69) — แอดมินด้วยกัน/Admin Spare Part/Super Admin ไม่ได้
AV=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token||""')
[ -n "$AV" ] && [ "$(GET $AV auth/me | J 'd.employeeCode')" = "T001" ] && pass "แอดมินดูในฐานะช่างได้" || fail "แอดมินดูช่างไม่ได้"
R=$(POST $AV work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","symptom":"x"}]}')
echo "$R" | grep -q "ดูได้อย่างเดียว" && pass "แอดมินที่ดูแทน แก้อะไรไม่ได้ (ดูได้อย่างเดียว)" || fail "แอดมินดูแทนแล้วแก้ได้: $R"
POST $AV auth/view-as/stop '{}' >/dev/null
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
[ -n "$(POST $A auth/view-as "{\"userId\":$SID}" | J 'd.token||""')" ] && pass "แอดมินดูในฐานะหัวหน้าภาคได้" || fail "แอดมินดูหัวหน้าภาคไม่ได้"
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZVAA$SUF','แอดมินอีกคน','ADMIN','$HASH',false),('ZVAP$SUF','แอดมินอะไหล่','PARTS_ADMIN','$HASH',false)" >/dev/null
AAID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAA$SUF'"); APID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAP$SUF'")
POST $A auth/view-as "{\"userId\":$AAID}" | grep -q "เฉพาะหัวหน้าภาคและช่าง" && POST $A auth/view-as "{\"userId\":$APID}" | grep -q "เฉพาะหัวหน้าภาคและช่าง" \
  && pass "แอดมินดูในฐานะแอดมิน/Admin Spare Part ไม่ได้" || fail "แอดมินดูแอดมินได้"
POST $A auth/view-as "{\"userId\":$SAID}" | grep -q "Super Admin ไม่ได้" && pass "แอดมินดูในฐานะ Super Admin ไม่ได้" || fail "แอดมินดู Super Admin ได้"
PA=$(login ZVAP$SUF)
# Admin Spare Part ถูกกันตั้งแต่ชั้นดูได้อย่างเดียว (middleware) — ข้อความต่างกันได้ แต่ต้องไม่ได้โทเคน
[ -z "$(POST $PA auth/view-as "{\"userId\":$TID}" | J 'd.token||""')" ] && pass "Admin Spare Part ใช้ดูในฐานะไม่ได้" || fail "Admin Spare Part ดูแทนได้"
T2=$(login T001)
AV2=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token')
TEAM_T=$(DB "select team from \"User\" where id=$TID")
curl -s -X PATCH localhost:4000/api/auth/users/$TID -H "$(H $SA)" -H 'Content-Type: application/json' -d '{"role":"ADMIN"}' >/dev/null
R=$(GET $AV2 auth/me)
curl -s -X PATCH localhost:4000/api/auth/users/$TID -H "$(H $SA)" -H 'Content-Type: application/json' -d '{"role":"EMPLOYEE"}' >/dev/null
DB "update \"User\" set team='$TEAM_T' where id=$TID" >/dev/null
echo "$R" | J 'd.viewAsEnded===true?"ok":"bad"' | grep -q ok && pass "คนที่ถูกดูถูกเลื่อนเป็นแอดมินระหว่างดู → แอดมินหยุดดูทันที" || fail "ยังดูต่อได้: $(echo "$R" | head -c 150)"
POST $SA auth/view-as "{\"userId\":$SA2ID}" | grep -q "Super Admin ไม่ได้" && pass "ดูในฐานะ Super Admin ไม่ได้" || fail "ดู Super Admin ได้"
POST $SA auth/view-as "{\"userId\":$SAID}" | grep -q "ตัวเองไม่ได้" && pass "ดูในฐานะตัวเองไม่ได้" || fail "ดูตัวเองได้"

echo
echo "═══ เห็นเหมือนคนนั้นจริง"
R=$(POST $SA auth/view-as "{\"userId\":$TID}")
V=$(echo "$R" | J 'd.token')
echo "$R" | J '[d.user.employeeCode,d.user.viewAs&&d.user.viewAs.byName].join("|")' | grep -q "^T001|ซุปเปอร์ดูแทน$" \
  && pass "ได้หน้าจอของ T001 พร้อมบอกว่าใครดูอยู่" || fail "เริ่มดู: $(echo "$R" | head -c 200)"
GET $V auth/me | J 'const left=(new Date(d.viewAs.expiresAt)-Date.now())/60000; d.employeeCode==="T001"&&left>55&&left<=60?"ok":"bad"' | grep -q ok \
  && pass "/auth/me เป็น T001 และหมดเวลาใน 1 ชั่วโมง" || fail "me: $(GET $V auth/me | head -c 200)"
OWN=$(GET $T "work-orders?filter=ALL" | J 'd.rows.map(r=>r.id).sort().join()')
SEEN=$(GET $V "work-orders?filter=ALL" | J 'd.rows.map(r=>r.id).sort().join()')
[ "$OWN" = "$SEEN" ] && pass "รายการใบงานตรงกับที่ T001 เห็นเองทุกใบ" || fail "ใบงานไม่ตรง: เอง=[$OWN] ดูแทน=[$SEEN]"
GET $V auth/users | grep -q "หน้านี้สำหรับแอดมินเท่านั้น" && pass "ระหว่างดูเป็นช่าง เปิดหน้าแอดมินไม่ได้ (สิทธิ์เป็นของช่างจริง)" || fail "ช่างเห็นหน้าแอดมิน"

echo
echo "═══ ดูได้อย่างเดียว"
BEFORE=$(DB "select count(*) from \"WorkOrder\"")
R=$(POST $V work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ดูแทนห้ามเปิด"}]}')
AFTER=$(DB "select count(*) from \"WorkOrder\"")
echo "$R" | grep -q "ดูได้อย่างเดียว" && [ "$BEFORE" = "$AFTER" ] && pass "เปิดใบงานไม่ได้ และไม่มีใบงานเพิ่มในฐานข้อมูล" || fail "เขียนได้: $R ($BEFORE→$AFTER)"
R=$(curl -s -X PUT localhost:4000/api/spare-parts/1 -H "$(H $V)" -H 'Content-Type: application/json' -d '{"name":"x"}')
echo "$R" | grep -q "ดูได้อย่างเดียว" && pass "PUT ถูกกันด้วย" || fail "PUT: $R"
POST $V auth/view-as "{\"userId\":$TID}" | grep -q "ดูได้อย่างเดียว" && pass "ดูในฐานะซ้อนอีกชั้นไม่ได้" || fail "ซ้อนได้"

echo
echo "═══ บันทึก"
LOG=$(DB "select \"targetUserId\"||'|'||coalesce(\"endedAt\"::text,'open') from \"ViewAsLog\" where \"byUserId\"=$SAID order by id desc limit 1")
[ "$LOG" = "$TID|open" ] && pass "บันทึกว่าใครดูใคร (ยังเปิดอยู่)" || fail "บันทึก: $LOG"
POST $V auth/view-as/stop '{}' | grep -q '"ok":true' || fail "stop ไม่ตอบ ok"
DB "select count(*) from \"ViewAsLog\" where \"byUserId\"=$SAID and \"endedAt\" is not null" | grep -q '^1$' && pass "กลับเป็นตัวเองแล้วบันทึกเวลาเลิกดู" || fail "ไม่บันทึกเวลาเลิก"
GET $SA auth/view-as/logs | J 'd.some(l=>l.by&&l.by.employeeCode==="ZVAS'$SUF'"&&l.target.employeeCode==="T001")?"ok":"bad"' | grep -q ok \
  && pass "Super Admin เปิดดูประวัติดูในฐานะได้" || fail "logs"
GET $A auth/view-as/logs | grep -q "เฉพาะ Super Admin" && pass "แอดมินทั่วไปดูประวัติไม่ได้" || fail "แอดมินดูประวัติได้"

# โทเคนดูแทนที่หมดอายุ ต้องบอกแอปให้กลับเป็นตัวเอง ไม่ใช่เด้งออกจากระบบทั้งที่ Super Admin ยังล็อกอินอยู่
SP="$(cd "$(dirname "$0")" && pwd)"
OLD=$(cd "$SP/../backend" && JWT_SECRET="${JWT_SECRET:-dev-secret}" node -e 'const j=require("jsonwebtoken");console.log(j.sign({userId:'$TID',role:"EMPLOYEE",viewAs:{by:'$SAID',logId:0},exp:Math.floor(Date.now()/1000)-60},process.env.JWT_SECRET))')
GET $OLD auth/me | J 'd.viewAsEnded===true?"ok":"bad"' | grep -q ok && pass "โทเคนดูแทนหมดอายุ → บอกให้กลับเป็นตัวเอง" || fail "หมดอายุ: $(GET $OLD auth/me)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
