#!/bin/bash
# ทดสอบ: Super Admin ดูในฐานะผู้ใช้อื่น — เห็นเหมือนคนนั้นจริง · ดูได้อย่างเดียว
#        แอดมินดูได้เฉพาะหัวหน้าภาค/ช่าง/ทีม Area (ต.ค. 69) · มีบันทึก ·
#        Admin Spare Part ใช้ไม่ได้ · แอดมินทั่วไปดูประวัติไม่ได้ · ดู Super Admin/ตัวเองไม่ได้ · ซ้อนไม่ได้
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
  # บันทึกของแอดมิน A001 ที่เทสต์นี้สร้าง (ดู T001/S001/ทีม Area) ก็ลบด้วย — ไม่งั้นค้างเพิ่มทุกรอบ
  DB "delete from \"ViewAsLog\" where id > ${START:-2147483647}
        or \"byUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZVA%$SUF')
        or \"targetUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZVA%$SUF');
      delete from \"User\" where \"employeeCode\" like 'ZVA%$SUF';
      update \"User\" set role='EMPLOYEE' where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
START=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
A=$(login A001); T=$(login T001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZVAS$SUF','ซุปเปอร์ดูแทน','SUPER_ADMIN','$HASH',false),('ZVAX$SUF','ซุปเปอร์อีกคน','SUPER_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZVAS$SUF)
SAID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAS$SUF'")
SA2ID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAX$SUF'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")

echo "═══ สิทธิ์"
# แอดมินดูในฐานะได้เฉพาะหัวหน้าภาค/ช่าง/ทีม Area (เจ้าของงานเพิ่ม ต.ค. 69) — แอดมินด้วยกัน/Admin Spare Part/Super Admin ไม่ได้
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
POST $A auth/view-as "{\"userId\":$AAID}" | grep -q "เฉพาะหัวหน้าภาค ช่าง และทีม Area" && POST $A auth/view-as "{\"userId\":$APID}" | grep -q "เฉพาะหัวหน้าภาค ช่าง และทีม Area" \
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
echo "═══ ทีม Area (Area · Supervisor (COCO) · Maid (COCO))"
# เจ้าของงานขอ ต.ค. 69 ("ดูในฐานะขึ้นไม่ครบ") — ทีม Area ก็โทรมาถามว่าทำไมไม่เห็นใบงาน/ปุ่ม เหมือนหัวหน้าภาค/ช่าง
# สร้างบัญชีหลังเซิร์ฟเวอร์เพิ่งโหลดรายชื่อบัญชี (โทเคนของ id ที่ไม่มีจริง หลังเว้น 5 วินาที บังคับให้โหลด — utils/userGate.ts)
# = แอดมินเพิ่งเพิ่มบัญชีแล้วกดดูในฐานะภายใน 5 วินาทีหลังรอบโหลด ก่อนเจ้าตัวเคยเข้าระบบ
# เคยพัง: คำขอแรกของการดูถูกตีกลับว่า "สิทธิ์ถูกยกเลิก" ทุกครั้งในช่วงนั้น
sleep 5.5
GHOST=$(cd "$(dirname "$0")/../backend" && JWT_SECRET="${JWT_SECRET:-dev-secret}" node -e 'console.log(require("jsonwebtoken").sign({userId:2147483000,role:"EMPLOYEE"},process.env.JWT_SECRET))')
GET $GHOST auth/me | grep -q "ถูกลบแล้ว" || fail "โทเคนของบัญชีที่ไม่มีจริงไม่ถูกปฏิเสธ"
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZVAR$SUF','Area ดูแทน','AREA','$HASH',false);
    insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\",\"areaId\") values
    ('ZVAC$SUF','ซุปฯ COCO ดูแทน','COCO_SUPERVISOR','$HASH',false,(select id from \"User\" where \"employeeCode\"='ZVAR$SUF')),
    ('ZVAM$SUF','Maid ดูแทน','COCO_MAID','$HASH',false,(select id from \"User\" where \"employeeCode\"='ZVAR$SUF'));
    insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\",\"deletedAt\") values ('ZVAD$SUF','Area ลาออก','AREA','$HASH',false,now());
    insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\",\"areaId\") values
    ('ZVAE$SUF','ซุปฯ ใต้ Area ที่ลาออก','COCO_SUPERVISOR','$HASH',false,(select id from \"User\" where \"employeeCode\"='ZVAD$SUF'))" >/dev/null
ARID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAR$SUF'")
CSID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAC$SUF'"); MDID=$(DB "select id from \"User\" where \"employeeCode\"='ZVAM$SUF'")
# ลบผู้ใช้ตอนจบแล้วสาขากลับเป็นว่างเอง (onDelete SetNull) — แตะเฉพาะสาขาที่ยังไม่มี Supervisor จะได้ไม่ต้องจำค่าเดิม
# สาขาที่ไม่ใช่ COCO (ไม่ขึ้นต้น C) ผูกไปด้วยหนึ่งแห่ง — ต้องไม่ถูกนับ เพราะ Supervisor (COCO) ไม่เห็นสาขานั้นอยู่แล้ว
DB "update \"Branch\" set \"cocoSupervisorId\"=$CSID where code='C0006' and \"cocoSupervisorId\" is null;
    update \"Branch\" set \"cocoSupervisorId\"=$CSID where id=(select id from \"Branch\" where code not ilike 'C%' and \"cocoSupervisorId\" is null and \"cancelledAt\" is null order by id limit 1);
    insert into \"CocoMaidBranch\"(\"userId\",\"branchId\") select $MDID, id from \"Branch\" where code='C0006'" >/dev/null
NCS=$(DB "select count(*) from \"Branch\" where \"cocoSupervisorId\"=$CSID and \"cancelledAt\" is null and code ilike 'C%'")
# นับ/จัดกลุ่มกฎเดียวกับผังฝั่ง Area: Maid ที่ค้าง areaId ไม่นับเป็น Supervisor · Area ที่ลาออกแล้ว = ไม่มี Area
GET $A auth/users | J 'const f=(c)=>d.find(u=>u.employeeCode===c+"'$SUF'");
  [f("ZVAR")._count.areaMembers, f("ZVAC").area&&f("ZVAC").area.name, f("ZVAC")._count.cocoBranches, f("ZVAM").maidBranches.map(b=>b.code).join(), f("ZVAE").area].join("|")' \
  | grep -q "^1|Area ดูแทน|$NCS|C0006|$" && pass "รายชื่อผู้ใช้บอก Area ของ Supervisor (COCO) (Area ที่ลาออก = ไม่มี) จำนวน Supervisor/สาขา COCO และสาขาที่ Maid ประจำ" \
  || fail "รายชื่อ (คาด 1|Area ดูแทน|$NCS|C0006|): $(GET $A auth/users | J 'JSON.stringify(d.filter(u=>/^ZVA[RCME]/.test(u.employeeCode)).map(u=>[u.employeeCode,u.area,u._count,u.maidBranches]))')"
for X in "ZVAR:AREA" "ZVAC:COCO_SUPERVISOR" "ZVAM:COCO_MAID"; do
  C=${X%%:*}$SUF; R=${X##*:}
  ID=$(DB "select id from \"User\" where \"employeeCode\"='$C'")
  AV=$(POST $A auth/view-as "{\"userId\":$ID}" | J 'd.token||""')
  # ไม่ได้โทเคน = ต้องขึ้น FAIL ไม่ใช่ให้ set -e ตัดจบเงียบ ๆ แล้ว run-all นับว่าผ่าน
  [ -n "$AV" ] || { fail "ดู $R: ไม่ได้โทเคน"; continue; }
  MER=$(GET "$AV" auth/me); ME=$(echo "$MER" | J 'd.employeeCode+"|"+d.role')
  OWN=$(GET "$(login $C)" "work-orders?filter=ALL" | J '(d.rows||[]).map(r=>r.id).sort().join()')
  SEEN=$(GET "$AV" "work-orders?filter=ALL" | J '(d.rows||[]).map(r=>r.id).sort().join()')
  W=$(POST "$AV" work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","symptom":"x"}]}')
  POST "$AV" auth/view-as/stop '{}' >/dev/null
  [ -n "$AV" ] && [ "$ME" = "$C|$R" ] && [ "$OWN" = "$SEEN" ] && echo "$W" | grep -q "ดูได้อย่างเดียว" \
    && pass "แอดมินดูในฐานะ $R ได้ (บัญชีที่เซิร์ฟเวอร์ยังไม่รู้จัก) — เห็นใบงานตรงกับที่เจ้าตัวเห็น และแก้อะไรไม่ได้" || fail "ดู $R: me=$(echo "$MER" | head -c 160) เอง=[$OWN] ดูแทน=[$SEEN] เขียน=$(echo "$W" | head -c 80)"
done
LOG=$(DB "select count(*) from \"ViewAsLog\" where \"byUserId\"=(select id from \"User\" where \"employeeCode\"='A001') and \"targetUserId\" in ($ARID,$CSID,$MDID) and \"endedAt\" is not null")
[ "$LOG" = "3" ] && pass "บันทึกว่าแอดมินดูทีม Area ครบ 3 คน พร้อมเวลาเลิกดู" || fail "บันทึกทีม Area: $LOG"

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
