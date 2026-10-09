#!/bin/bash
# ทดสอบ: กดการ์ดทีมดูรายชื่อ — ช่างในทีม · หัวหน้าภาคที่ดูแล · ทีมรวมที่ครอบคลุม · คนที่ถูกลบไม่โผล่
#        ใช้กับทีมรวมได้ · หัวหน้าภาค/ช่างเรียกไม่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
GET() { curl -s -G "localhost:4000/api/teams/members" --data-urlencode "name=$2" -H "$(H $1)"; }
SUF=$RANDOM
TEAM="ทีมทดสอบรายชื่อ$SUF"; GRP="ทีมรวมทดสอบรายชื่อ$SUF"
GID=""
cleanup() {
  [ -n "$GID" ] && curl -s -X DELETE "localhost:4000/api/teams/groups/$GID" -H "$(H $A)" >/dev/null
  DB "delete from \"User\" where \"employeeCode\" like 'ZM%$SUF'; delete from \"TeamGroup\" where name='$GRP'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001); T=$(login T001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,team,phone,\"passwordHash\",\"supervisedTeams\",region,\"deletedAt\") values
  ('ZMA$SUF','ช่างเอ','EMPLOYEE','$TEAM','0811111111','$HASH','{}',null,null),
  ('ZMB$SUF','ช่างบี','EMPLOYEE','$TEAM',null,'$HASH','{}',null,null),
  ('ZMD$SUF','ช่างที่ลบแล้ว','EMPLOYEE','$TEAM',null,'$HASH','{}',null,now()),
  ('ZMS$SUF','หัวหน้าทดสอบ','SUPERVISOR',null,null,'$HASH','{\"$TEAM\",\"อื่น\"}','ใต้',null),
  ('ZMG$SUF','ช่างทีมรวม','EMPLOYEE','$GRP',null,'$HASH','{}',null,null)" >/dev/null
# สร้างผ่าน API ให้เซิร์ฟเวอร์ล้างแคชทีมรวมเอง (ใส่ตรงในฐานข้อมูล เซิร์ฟเวอร์จะยังเห็นค่าเก่าอีก 1 นาที)
GID=$(curl -s -X POST localhost:4000/api/teams/groups -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"name\":\"$GRP\",\"covers\":[\"กระบี่\"]}" | J 'd.id||d.group&&d.group.id||""')
[ -n "$GID" ] || { echo "FAIL สร้างทีมรวมไม่ได้"; exit 1; }

echo "═══ สิทธิ์"
GET $S "$TEAM" | grep -q "error" && pass "หัวหน้าภาคเรียกรายชื่อทีมไม่ได้" || fail "หัวหน้าภาคเรียกได้"
GET $T "$TEAM" | grep -q "error" && pass "ช่างเรียกรายชื่อทีมไม่ได้" || fail "ช่างเรียกได้"

echo
echo "═══ ทีมช่าง"
R=$(GET $A "$TEAM")
[ "$(echo "$R" | J 'd.technicians.map(m=>m.name).join()')" = "ช่างบี,ช่างเอ" ] \
  && pass "ช่างในทีมครบ เรียงตามชื่อ คนที่ถูกลบไม่โผล่" || fail "ช่าง: $(echo "$R" | J 'd.technicians.map(m=>m.name).join()')"
echo "$R" | J 'const a=d.technicians.find(m=>m.name==="ช่างเอ"); a.phone==="0811111111"&&a.employeeCode==="ZMA'$SUF'"&&!("passwordHash" in a)?"ok":"bad"' | grep -q ok \
  && pass "มีรหัส · เบอร์โทร · ไม่ส่งรหัสผ่านออกไป" || fail "ข้อมูลคน: $(echo "$R" | head -c 300)"
echo "$R" | J 'd.supervisors.length===1&&d.supervisors[0].name==="หัวหน้าทดสอบ"&&d.supervisors[0].region==="ใต้"?"ok":"bad"' | grep -q ok \
  && pass "หัวหน้าภาคที่ดูแลทีมนี้ พร้อมภาค" || fail "หัวหน้าภาค: $(echo "$R" | J 'JSON.stringify(d.supervisors)')"
R=$(GET $A "กระบี่")
echo "$R" | J 'd.coveredBy.includes("'$GRP'")&&!d.isGroup?"ok":"bad"' | grep -q ok \
  && pass "บอกทีมรวมที่เห็นงานของทีมนี้" || fail "ทีมรวม: $(echo "$R" | J 'JSON.stringify(d.coveredBy)')"

echo
echo "═══ ทีมรวม"
R=$(GET $A "$GRP")
echo "$R" | J 'd.isGroup&&d.covers.join()==="กระบี่"&&d.technicians.map(m=>m.name).join()==="ช่างทีมรวม"&&d.coveredBy.length===0?"ok":"bad"' | grep -q ok \
  && pass "ทีมรวม: ช่างที่สังกัด · ทีมที่ครอบคลุม" || fail "ทีมรวม: $(echo "$R" | head -c 300)"
R=$(curl -s "localhost:4000/api/teams/members" -H "$(H $A)")
echo "$R" | grep -q "ต้องระบุชื่อทีม" && pass "ไม่ระบุชื่อทีม → บอกเป็นภาษาไทย" || fail "ไม่ระบุชื่อ: $R"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
