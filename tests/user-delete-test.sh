#!/bin/bash
# ทดสอบ: ลบผู้ใช้ — Super Admin เท่านั้น (+ แก้ไขรายละเอียดผู้ใช้ ท้ายไฟล์) · ไม่มีประวัติ = ลบจริง · มีประวัติ = ปิดบัญชี (ประวัติอยู่ครบ)
#        ยังถือรถ/ใบงานค้าง = ลบไม่ได้ · โทเคนของคนที่ถูกลบใช้ไม่ได้ทันที · คืนรหัสพนักงานให้ใช้ใหม่ได้
#
# ในเครื่องทดสอบไม่มี Super Admin — สร้างชั่วคราว (ทำได้เพราะยังไม่มีใครเป็น) แล้วลบทิ้งตอนจบ
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
DEL() { curl -s -X DELETE "localhost:4000/api/auth/users/$2" -H "$(H $1)"; }
# บัญชีที่แอดมินสร้างต้องเปลี่ยนรหัสก่อนใช้ — ทำให้เลยแล้วคืนโทเคนที่ใช้งานได้
newUser() {
  POST $A auth/users "{\"employeeCode\":\"$1\",\"name\":\"$2\",\"role\":\"${3:-EMPLOYEE}\",\"password\":\"temp12345\"}" >/dev/null
  local t=$(login "$1" temp12345 | J 'd.token')
  POST $t auth/change-password '{"currentPassword":"temp12345","newPassword":"test12345"}' | J 'd.token'
}
SUF=$RANDOM
cleanup() { DB "delete from \"WorkLog\" where \"userId\" in (select id from \"User\" where \"employeeCode\" like 'ZD%$SUF%'); delete from \"TeamDayPlan\" where team='ทีมทดสอบลบ$SUF'; delete from \"VehicleLog\" where \"userId\" in (select id from \"User\" where \"employeeCode\" like 'ZD%$SUF%'); delete from \"User\" where \"employeeCode\" like 'ZD%$SUF%'" >/dev/null; }
trap cleanup EXIT

A=$(login A001 | J 'd.token')
SA=$(newUser "ZDSA$SUF" "ซุปเปอร์ทดสอบ" SUPER_ADMIN)
SA_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDSA$SUF'")

echo "═══ สิทธิ์"
U1=$(newUser "ZDU1$SUF" "ช่างไม่มีประวัติ")
U1_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDU1$SUF'")
R=$(DEL $A $U1_ID)
echo "$R" | grep -q "เฉพาะ Super Admin" && [ "$(DB "select count(*) from \"User\" where id=$U1_ID")" = "1" ] \
  && pass "แอดมินทั่วไปลบไม่ได้ (เฉพาะ Super Admin)" || fail "แอดมินลบได้: $(echo $R|head -c 120)"
R=$(DEL $SA $SA_ID)
echo "$R" | grep -q "ตัวเองไม่ได้" && pass "Super Admin ลบตัวเองไม่ได้" || fail "ลบตัวเองได้: $(echo $R|head -c 120)"

echo
echo "═══ ไม่มีประวัติ → ลบจริง"
R=$(DEL $SA $U1_ID)
[ "$(echo "$R" | J 'd.mode')" = "deleted" ] && [ "$(DB "select count(*) from \"User\" where id=$U1_ID")" = "0" ] \
  && pass "ลบจริง — แถวหายจากฐานข้อมูล" || fail "ลบไม่ได้: $(echo $R|head -c 120)"
R=$(curl -s localhost:4000/api/auth/me -H "$(H $U1)")
echo "$R" | grep -q "accountDeleted" && pass "โทเคนเดิมของคนที่ถูกลบใช้ไม่ได้ทันที" || fail "โทเคนยังใช้ได้: $(echo $R|head -c 120)"

echo
echo "═══ มีประวัติ → ปิดบัญชี"
U2=$(newUser "ZDU2$SUF" "ช่างมีประวัติ")
U2_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDU2$SUF'")
DB "insert into \"WorkLog\" (\"userId\",\"workDate\",\"taskDescription\") values ($U2_ID, now(), 'งานทดสอบลบผู้ใช้')" >/dev/null
TODAY=$(TZ=Asia/Bangkok date +%F)
PAST=$(DB "insert into \"TeamDayPlan\" (date,team,\"updatedAt\") values ('$TODAY'::date - 3,'ทีมทดสอบลบ$SUF',now()) returning id" | head -1)
FUT=$(DB "insert into \"TeamDayPlan\" (date,team,\"updatedAt\") values ('$TODAY'::date + 2,'ทีมทดสอบลบ$SUF',now()) returning id" | head -1)
DB "insert into \"TeamDayPlanMember\" (\"planId\",\"userId\") values ($PAST,$U2_ID),($FUT,$U2_ID)" >/dev/null
VID=$(DB "select id from \"Vehicle\" order by id limit 1")
if [ -n "$VID" ]; then
  LOGID=$(DB "insert into \"VehicleLog\" (\"vehicleId\",\"userId\",purpose,\"startMileage\") values ($VID,$U2_ID,'ทดสอบ',0) returning id" | head -1)
  R=$(DEL $SA $U2_ID)
  echo "$R" | grep -q "ยังไม่คืนรถ" && [ -z "$(DB "select \"deletedAt\" from \"User\" where id=$U2_ID")" ] \
    && pass "ยังไม่คืนรถ ลบไม่ได้" || fail "ลบได้ทั้งที่ยังถือรถ: $(echo $R|head -c 120)"
  DB "delete from \"VehicleLog\" where id=$LOGID" >/dev/null
else
  fail "ไม่มีรถในฐานข้อมูลให้ทดสอบกรณียังไม่คืนรถ"
fi
WO=$(DB "select id from \"WorkOrder\" where status not in ('CLOSED','CANCELLED') order by id limit 1")
if [ -n "$WO" ]; then
  OLD=$(DB "select coalesce(\"assignedToId\"::text,'null') from \"WorkOrder\" where id=$WO")
  DB "update \"WorkOrder\" set \"assignedToId\"=$U2_ID where id=$WO" >/dev/null
  R=$(DEL $SA $U2_ID)
  DB "update \"WorkOrder\" set \"assignedToId\"=$OLD where id=$WO" >/dev/null
  echo "$R" | grep -q "ใบงานที่ยังไม่ปิด" && pass "ถือใบงานค้าง ลบไม่ได้" || fail "ลบได้ทั้งที่ถือใบงานค้าง: $(echo $R|head -c 120)"
else
  echo "(ข้าม — ไม่มีใบงานที่ยังไม่ปิดให้ทดสอบ)"
fi

R=$(DEL $SA $U2_ID)
ROW=$(DB "select (\"deletedAt\" is not null)||'|'||\"employeeCode\"||'|'||coalesce(team,'-') from \"User\" where id=$U2_ID")
[ "$(echo "$R" | J 'd.mode')" = "deactivated" ] && [ "$ROW" = "true|ZDU2$SUF~ลบ$U2_ID|-" ] \
  && pass "ปิดบัญชีแทนการลบ — ตั้ง deletedAt และคืนรหัสพนักงาน" || fail "ปิดบัญชีไม่ถูก: $ROW $(echo $R|head -c 120)"
[ "$(DB "select count(*) from \"WorkLog\" where \"userId\"=$U2_ID")" = "1" ] && pass "ประวัติเดิม (บันทึกงาน) ยังอยู่" || fail "ประวัติหาย"
[ "$(DB "select count(*) from \"TeamDayPlanMember\" where \"userId\"=$U2_ID and \"planId\"=$PAST")|$(DB "select count(*) from \"TeamDayPlanMember\" where \"userId\"=$U2_ID and \"planId\"=$FUT")" = "1|0" ] \
  && pass "ถอดออกจากแผนทีมวันข้างหน้า แผนที่ผ่านมาแล้วยังอยู่" || fail "แผนทีมไม่ถูก"
curl -s localhost:4000/api/auth/users -H "$(H $SA)" | J "d.some(u=>u.id===$U2_ID)" | grep -q false \
  && pass "ไม่โผล่ในรายชื่อผู้ใช้" || fail "ยังโผล่ในรายชื่อ"
curl -s localhost:4000/api/work-orders/options -H "$(H $SA)" | J "d.technicians.some(u=>u.id===$U2_ID)" | grep -q false \
  && pass "ไม่โผล่ในรายชื่อช่างให้จ่ายงาน" || fail "ยังโผล่ในรายชื่อช่าง"
curl -s localhost:4000/api/auth/me -H "$(H $U2)" | grep -q "accountDeleted" && pass "โทเคนเดิมใช้ไม่ได้" || fail "โทเคนยังใช้ได้"
login "ZDU2$SUF" test12345 | grep -q token && fail "ยังเข้าระบบด้วยรหัสเดิมได้" || pass "เข้าระบบด้วยรหัสพนักงานเดิมไม่ได้"
login "ZDU2$SUF~ลบ$U2_ID" test12345 | grep -q token && fail "เข้าระบบด้วยรหัสที่ถูกเปลี่ยนได้" || pass "เข้าระบบด้วยรหัสที่ถูกเปลี่ยนก็ไม่ได้"
R=$(POST $A auth/users "{\"employeeCode\":\"ZDU2$SUF\",\"name\":\"กลับมาทำงานใหม่\",\"password\":\"temp12345\"}")
[ "$(DB "select count(*) from \"User\" where \"employeeCode\"='ZDU2$SUF' and \"deletedAt\" is null")" = "1" ] \
  && pass "สร้างบัญชีใหม่ด้วยรหัสพนักงานเดิมได้" || fail "ใช้รหัสเดิมไม่ได้: $(echo $R|head -c 120)"
R=$(DEL $SA $U2_ID)
echo "$R" | grep -q "ไม่พบผู้ใช้" && pass "ลบบัญชีที่ปิดไปแล้วซ้ำไม่ได้" || fail "ลบซ้ำได้: $(echo $R|head -c 120)"

echo
echo "═══ แก้ไขรายละเอียด"
PATCH() { curl -s -X PATCH "localhost:4000/api/auth/users/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
U3=$(newUser "ZDU3$SUF" "ช่างแก้ชื่อ")
U3_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDU3$SUF'")
R=$(PATCH $A $U3_ID "{\"employeeCode\":\"ZDN3$SUF\",\"name\":\"ช่างชื่อใหม่ (นิว)\",\"phone\":\"0812345678\"}")
[ "$(DB "select \"employeeCode\"||'|'||name||'|'||phone from \"User\" where id=$U3_ID")" = "ZDN3$SUF|ช่างชื่อใหม่ (นิว)|0812345678" ] \
  && pass "แอดมินแก้ชื่อผู้ใช้ ชื่อ และเบอร์โทรของช่างได้" || fail "แก้ไม่ได้: $(echo $R|head -c 120)"
login "ZDN3$SUF" test12345 | grep -q token && ! (login "ZDU3$SUF" test12345 | grep -q token) \
  && pass "เข้าระบบด้วยชื่อผู้ใช้ใหม่ได้ (รหัสเดิม) ชื่อเก่าใช้ไม่ได้" || fail "ชื่อผู้ใช้ใหม่ใช้ไม่ได้"
R=$(PATCH $A $U3_ID '{"employeeCode":"A001"}')
echo "$R" | grep -q "มีคนใช้อยู่แล้ว" && [ "$(DB "select \"employeeCode\" from \"User\" where id=$U3_ID")" = "ZDN3$SUF" ] \
  && pass "ชื่อผู้ใช้ซ้ำกับคนอื่นไม่ได้" || fail "ใช้ชื่อซ้ำได้: $(echo $R|head -c 120)"
R=$(PATCH $A $U3_ID '{"employeeCode":"X~1"}')
echo "$R" | grep -q "ใช้เครื่องหมาย ~ ไม่ได้" && pass "ชื่อผู้ใช้ที่มี ~ (สงวนให้บัญชีที่ถูกลบ) ไม่ได้ — ข้อความภาษาไทย" || fail "รับ ~ ได้: $(echo $R|head -c 120)"
R=$(PATCH $A $U3_ID '{"name":"  "}')
echo "$R" | grep -q "ต้องใส่ชื่อ" && pass "ชื่อว่างไม่ได้" || fail "ชื่อว่างผ่าน: $(echo $R|head -c 120)"
ADM_ID=$(DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role) values ('ZDAD$SUF','แอดมินทดสอบ','x','ADMIN') returning id" | head -1)
R=$(PATCH $A $ADM_ID '{"name":"แอดมินโดนแก้"}')
echo "$R" | grep -q "เฉพาะ Super Admin" && [ "$(DB "select name from \"User\" where id=$ADM_ID")" = "แอดมินทดสอบ" ] \
  && pass "แอดมินทั่วไปแก้รายละเอียดแอดมินคนอื่นไม่ได้ (มี Super Admin แล้ว)" || fail "แอดมินแก้แอดมินอื่นได้: $(echo $R|head -c 120)"
PATCH $SA $ADM_ID '{"name":"แอดมินแก้โดยซุปเปอร์"}' >/dev/null
[ "$(DB "select name from \"User\" where id=$ADM_ID")" = "แอดมินแก้โดยซุปเปอร์" ] && pass "Super Admin แก้ได้" || fail "Super Admin แก้ไม่ได้"
A_ID=$(DB "select id from \"User\" where \"employeeCode\"='A001'"); A_PHONE=$(DB "select coalesce(phone,'') from \"User\" where id=$A_ID")
PATCH $A $A_ID '{"phone":"0899999999"}' >/dev/null
[ "$(DB "select phone from \"User\" where id=$A_ID")" = "0899999999" ] && pass "แอดมินแก้บัญชีตัวเองได้" || fail "แก้บัญชีตัวเองไม่ได้"
DB "update \"User\" set phone=nullif('$A_PHONE','') where id=$A_ID" >/dev/null
DB "delete from \"User\" where id in ($U3_ID,$ADM_ID)" >/dev/null

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
