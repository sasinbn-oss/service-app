#!/bin/bash
# ทดสอบ: ทีมรวม — ช่างที่สังกัดทีมรวมเห็นและทำงานของทุกทีมที่ทีมรวมครอบคลุม (ใบงานยังจ่ายให้ทีมช่างจริง)
#        ทีมรวม "ทุกทีม" · ช่างทีมรวมที่ไม่ครอบคลุมแตะงานไม่ได้ · /auth/me ส่งขอบเขตให้แอป ·
#        จัดแผนให้ทีมรวมได้ · นำเข้ารายชื่อจับคู่ชื่อทีมรวมได้ และไม่ล้างทีมอื่นของหัวหน้าภาค · รายงานไม่นับว่าไม่มีทีม
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
NS=$(printf "97%05d" $SUF); NT=$(printf "96%05d" $SUF)
G1="กลุ่มทดสอบกระบี่$SUF"; G2="กลุ่มทดสอบกรุงเทพ$SUF"; GA="กลุ่มทดสอบทุกทีม$SUF"
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"TeamDayPlan\" where team like 'กลุ่มทดสอบ%$SUF%'; delete from \"User\" where \"employeeCode\" like 'ZG%$SUF' or \"employeeCode\" in ('$NS','$NT'); delete from \"TeamGroup\" where name like 'กลุ่มทดสอบ%$SUF%'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZG1$SUF','ช่างทีมรวมกระบี่','EMPLOYEE','$HASH',false),('ZG2$SUF','ช่างทีมรวมกรุงเทพ','EMPLOYEE','$HASH',false),
  ('ZG3$SUF','ช่างทีมรวมทุกทีม','EMPLOYEE','$HASH',false)" >/dev/null
uid() { DB "select id from \"User\" where \"employeeCode\"='$1'"; }

echo "═══ สร้างทีมรวม"
R=$(POST $A teams/groups "{\"name\":\"$G1\",\"covers\":[\"กระบี่\"]}")
[ "$(DB "select array_to_string(covers,',')||'|'||\"allTeams\" from \"TeamGroup\" where name='$G1'")" = "กระบี่|false" ] && pass "DB: สร้างทีมรวมครอบคลุมกระบี่" || fail "สร้างไม่ได้: $R"
POST $A teams/groups "{\"name\":\"$G2\",\"covers\":[\"กรุงเทพ\"]}" >/dev/null
POST $A teams/groups "{\"name\":\"$GA\",\"allTeams\":true}" >/dev/null
R=$(POST $A teams/groups "{\"name\":\"กระบี่\",\"covers\":[\"กรุงเทพ\"]}")
echo "$R" | grep -q "ชื่อทีมช่างของสาขาอยู่แล้ว" && pass "ตั้งชื่อทีมรวมซ้ำทีมช่างของสาขาไม่ได้" || fail "รับชื่อซ้ำ: $R"
R=$(POST $A teams/groups "{\"name\":\"กลุ่มว่าง$SUF\",\"covers\":[]}")
echo "$R" | grep -q "อย่างน้อยหนึ่งทีม" && pass "ทีมรวมที่ไม่ครอบคลุมอะไรเลย ถูกปฏิเสธ" || fail "รับทีมรวมว่าง: $R"
R=$(POST $S teams/groups "{\"name\":\"กลุ่มหัวหน้า$SUF\",\"covers\":[\"กระบี่\"]}")
[ "$(DB "select count(*) from \"TeamGroup\" where name='กลุ่มหัวหน้า$SUF'")" = "0" ] && pass "หัวหน้าภาคสร้างทีมรวมไม่ได้" || fail "หัวหน้าภาคสร้างได้"

PATCH $A "auth/users/$(uid ZG1$SUF)" "{\"team\":\"$G1\"}" >/dev/null
PATCH $A "auth/users/$(uid ZG2$SUF)" "{\"team\":\"$G2\"}" >/dev/null
PATCH $A "auth/users/$(uid ZG3$SUF)" "{\"team\":\"$GA\"}" >/dev/null
[ "$(DB "select team from \"User\" where \"employeeCode\"='ZG1$SUF'")" = "$G1" ] && pass "DB: ตั้งช่างให้สังกัดทีมรวมได้" || fail "ตั้งทีมรวมไม่ได้"
T1=$(login ZG1$SUF); T2=$(login ZG2$SUF); T3=$(login ZG3$SUF)
curl -s localhost:4000/api/auth/me -H "$(H $T1)" | J 'd.teamCoverage&&!d.teamCoverage.all&&d.teamCoverage.teams.join()==="กระบี่"?"ok":"bad"' | grep -q ok \
  && pass "/auth/me ส่งขอบเขตทีมรวมให้แอป (กระบี่)" || fail "/auth/me: $(curl -s localhost:4000/api/auth/me -H "$(H $T1)")"

echo
echo "═══ ใบงานของทีมกระบี่"
WO=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบทีมรวม"}]}')
ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id'); IDS="$IDS $ID"
POST $S "work-orders/$ID/parts" '{"needsParts":false}' >/dev/null
POST $S "work-orders/$ID/assign" '{"team":"กระบี่"}' >/dev/null
[ "$(DB "select \"assignedTeam\" from \"WorkOrder\" where id=$ID")" = "กระบี่" ] && pass "DB: ใบงานจ่ายให้ทีมกระบี่ (ทีมช่างจริง)" || fail "จ่ายงานไม่ได้"
has() { curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $1)" | J "const r=d.rows||d; r.some(w=>w.id===$ID)?'yes':'no'"; }
[ "$(has $T1)|$(has $T3)|$(has $T2)" = "yes|yes|no" ] && pass "ช่างทีมรวมกระบี่และทีมรวมทุกทีมเห็นใบงาน · ทีมรวมกรุงเทพไม่เห็น" || fail "เห็นใบงาน: $(has $T1) $(has $T3) $(has $T2)"
P2=$(DB "select id from \"SparePart\" order by id limit 1")
R=$(POST $T2 "work-orders/$ID/follow-up" "{\"parts\":[{\"sparePartId\":$P2,\"quantity\":1}]}")
echo "$R" | grep -q "ไม่ใช่ทีมของคุณ" && pass "ช่างทีมรวมที่ไม่ครอบคลุมกระบี่ ทำงานในใบนี้ไม่ได้" || fail "ทีมอื่นทำได้: $(echo $R|head -c 120)"
R=$(POST $T1 "work-orders/$ID/follow-up" "{\"parts\":[{\"sparePartId\":$P2,\"quantity\":1}]}")
CHILD=$(DB "select id from \"WorkOrder\" where \"parentId\"=$ID limit 1" 2>/dev/null || true)
[ -n "$CHILD" ] && IDS="$IDS $CHILD"
[ -n "$CHILD" ] && pass "DB: ช่างทีมรวมกระบี่ทำงานในใบของทีมกระบี่ได้ (เปิดใบรออะไหล่ต่อ)" || fail "ทีมรวมทำงานไม่ได้: $(echo $R|head -c 160)"

echo
echo "═══ จัดแผนทีมรวม"
TARGET=$(DB "select to_char(current_date + 40,'YYYY-MM-DD')")
R=$(curl -s -X PUT localhost:4000/api/plans -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"date\":\"$TARGET\",\"team\":\"$G1\",\"memberIds\":[$(uid ZG1$SUF)]}")
[ "$(DB "select count(*) from \"TeamDayPlan\" where team='$G1'")" = "1" ] && pass "DB: จัดแผนให้ทีมรวมได้" || fail "จัดแผนทีมรวมไม่ได้: $(echo $R|head -c 140)"
curl -s "localhost:4000/api/plans/day?date=$TARGET" -H "$(H $A)" | J 'd.groupTeams.includes("'$G1'")?"ok":"bad"' | grep -q ok \
  && pass "บอร์ดแผนงานส่งชื่อทีมรวมให้ฟอร์มจัดแผน" || fail "ไม่มีทีมรวมในฟอร์ม"

echo
echo "═══ รายงาน / หน้าทีมช่าง"
R=$(curl -s localhost:4000/api/auth/users/unassigned-report -H "$(H $A)")
X=$(mktemp --suffix=.xlsx); curl -s "localhost:4000$(echo "$R" | J 'd.path')" -o "$X" 2>/dev/null || true
N=$(NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e 'const E=require("exceljs");const wb=new E.Workbook();wb.xlsx.readFile(process.argv[1]).then(()=>{let n=0;wb.worksheets[0].eachRow(r=>{if(String(r.getCell(2).value).startsWith("ZG"))n++});console.log(n)}).catch(()=>console.log(0))' "$X" 2>/dev/null || echo 0)
rm -f "$X"
[ "$N" = "0" ] && pass "ช่างในทีมรวมไม่ขึ้นในรายงาน \"ยังไม่มีพื้นที่รับผิดชอบ\"" || fail "ขึ้นในรายงาน $N คน"
curl -s localhost:4000/api/teams -H "$(H $A)" | J 'const g=d.groups.find(g=>g.name==="'$G1'"); g&&g.technicians===1&&!d.teams.some(t=>t.name==="'$G1'")?"ok":"bad"' | grep -q ok \
  && pass "หน้าทีมช่าง: ทีมรวมแยกส่วน นับช่างได้ ไม่ขึ้นเป็นทีมที่ไม่มีในทะเบียน" || fail "หน้าทีมช่างไม่ตรง"

echo
echo "═══ นำเข้ารายชื่อ: พื้นที่ในบันทึก = ชื่อทีมรวม"
DB "insert into \"User\"(\"employeeCode\",name,role,\"supervisedTeams\",\"passwordHash\",\"mustChangePassword\") values ('$NS','หัวหน้าทีมรวม ทดสอบ','SUPERVISOR','{กรุงเทพ}','$HASH',false)" >/dev/null
X=$(mktemp --suffix=.xlsx)
NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
  const [sup,tech,area,out]=process.argv.slice(1); const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("s");
  ws.addRow(["1. หัวหน้าภาค"]); ws.addRow(["ลำดับ","รหัสพนักงาน","ชื่อ-สกุล","ชื่อเล่น","พื้นที่รับผิดชอบ"]); ws.addRow([1,sup,"หัวหน้าทีมรวม ทดสอบ","-","กทม."]);
  ws.addRow(["2.1 หัวหน้าภาค: หัวหน้าทีมรวม ทดสอบ"]); ws.addRow(["ลำดับ","รหัสพนักงาน","ชื่อ-สกุล","ชื่อเล่น","ทีม / พื้นที่"]); ws.addRow([1,tech,"ช่างนำเข้า ทีมรวม","-",area]);
  wb.xlsx.writeFile(out);' "$NS" "$NT" "$G1" "$X"
P=$(curl -s -X POST localhost:4000/api/user-import/preview -H "$(H $A)" -F "file=@$X")
rm -f "$X"
[ "$(echo "$P" | J 'd.areas.find(a=>a.area==="'$G1'").suggestion')" = "$G1" ] && pass "หน้าตัวอย่างจับคู่พื้นที่กับทีมรวมให้เอง" || fail "ไม่จับคู่: $(echo "$P" | J 'JSON.stringify(d.areas)')"
BODY=$(echo "$P" | node -e 'const d=JSON.parse(require("fs").readFileSync(0)); console.log(JSON.stringify({password:"12345678",teamMap:Object.fromEntries(d.areas.map(a=>[a.area,a.suggestion])),people:d.people.map(({code,fullName,nick,role,area,supervisorCode})=>({code,fullName,nick,role,area,supervisorCode}))}))')
curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$BODY" >/dev/null
[ "$(DB "select team from \"User\" where \"employeeCode\"='$NT'")" = "$G1" ] && pass "DB: ช่างที่นำเข้าสังกัดทีมรวม" || fail "ทีมช่างนำเข้า: $(DB "select team from \"User\" where \"employeeCode\"='$NT'")"
[ "$(DB "select array_to_string(array(select unnest(\"supervisedTeams\") order by 1),',') from \"User\" where \"employeeCode\"='$NS'")" = "$(printf '%s\n' กรุงเทพ "$G1" | sort | paste -sd,)" ] \
  && pass "DB: หัวหน้าภาคได้ทีมรวมเพิ่ม โดยทีมเดิม (กรุงเทพ) ไม่หาย" || fail "ทีมหัวหน้าภาค: $(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='$NS'")"

echo
echo "═══ เปลี่ยนชื่อ / ลบ"
GID=$(DB "select id from \"TeamGroup\" where name='$G2'")
curl -s -X PUT "localhost:4000/api/teams/groups/$GID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"name\":\"${G2}ใหม่\",\"covers\":[\"กรุงเทพ\",\"กระบี่\"]}" >/dev/null
G2="${G2}ใหม่"
[ "$(DB "select team from \"User\" where \"employeeCode\"='ZG2$SUF'")" = "$G2" ] && pass "DB: เปลี่ยนชื่อทีมรวม ช่างย้ายตามชื่อใหม่" || fail "ช่างไม่ย้ายตาม"
[ "$(has $T2)" = "yes" ] && pass "เพิ่มกระบี่ในทีมรวมแล้ว ช่างเห็นใบงานทันที (ไม่ต้องเข้าระบบใหม่)" || fail "ยังไม่เห็นหลังแก้ทีมรวม"
PATCH $A "auth/users/$(uid ZG3$SUF)" "{\"team\":\"$G2\"}" >/dev/null
DB "update \"User\" set \"supervisedTeams\"=array_append(\"supervisedTeams\",'$G2') where \"employeeCode\"='$NS'" >/dev/null
R=$(curl -s -X DELETE "localhost:4000/api/teams/groups/$GID" -H "$(H $A)")
[ "$(echo "$R" | J 'd.technicians+"|"+d.supervisors')" = "2|1" ] && [ "$(DB "select count(*) from \"TeamGroup\" where id=$GID")" = "0" ] \
  && [ "$(DB "select coalesce(team,'-') from \"User\" where \"employeeCode\"='ZG2$SUF'")" = "-" ] \
  && [ "$(DB "select count(*) from \"User\" where '$G2' = any(\"supervisedTeams\")")" = "0" ] \
  && pass "DB: ลบทีมรวม → ช่าง 2 คนไม่มีสังกัด หัวหน้าภาคเลิกดูแล" || fail "ลบทีมรวม: $R"
[ "$(has $T2)" = "no" ] && pass "ช่างที่ทีมรวมถูกลบ ไม่เห็นใบงานของทีมนั้นแล้ว" || fail "ยังเห็นใบงาน"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
