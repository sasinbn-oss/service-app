#!/bin/bash
# ทดสอบ: แอดมินลบทีมช่าง — ช่างในทีมไม่มีสังกัด · หัวหน้าภาคเลิกดูแล · สาขาและใบงานค้างต้องมีทีมรับต่อ
#        ใบงานที่ปิดแล้วคงชื่อเดิม · อัปไฟล์ทะเบียนชื่อเดิม → ไปทีมที่รับต่อ (ทีมที่ลบไม่กลับมา)
#        ทีมรวมที่ครอบคลุมทีมที่ลบ ครอบคลุมทีมที่รับต่อแทน · ทีมที่ไม่มีสาขา ลบได้โดยไม่ต้องเลือก
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
DEL="ทีมจะลบ$SUF"; KEEP="ทีมรับต่อ$SUF"; EMPTY="ทีมไม่มีสาขา$SUF"; GRP="กลุ่มลบทีม$SUF"
cleanup() {
  DB "delete from \"WorkOrder\" where \"branchId\" in (select id from \"Branch\" where code like 'ZX%$SUF');
      delete from \"Branch\" where code like 'ZX%$SUF'; delete from \"User\" where \"employeeCode\" like 'ZX%$SUF';
      delete from \"TeamRename\" where \"fromName\" in ('$DEL','$EMPTY'); delete from \"TeamGroup\" where name='$GRP';
      delete from \"TeamDayPlan\" where team in ('$DEL','$KEEP','$EMPTY')" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"Branch\"(code,name,zone,\"pmTeam\",region) values ('ZX1$SUF','สาขาทีมจะลบ','$DEL','$DEL','ใต้'),('ZX2$SUF','สาขาทีมรับต่อ','$KEEP','$KEEP','ใต้')" >/dev/null
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"supervisedTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('ZX1$SUF','ช่างทีมจะลบ','EMPLOYEE','$DEL','{}','$HASH',false),('ZX2$SUF','ช่างทีมรับต่อ','EMPLOYEE','$KEEP','{}','$HASH',false),
  ('ZX3$SUF','ช่างทีมไม่มีสาขา','EMPLOYEE','$EMPTY','{}','$HASH',false),
  ('ZX9$SUF','หัวหน้าลบทีม','SUPERVISOR',null,'{$DEL,$KEEP}','$HASH',false)" >/dev/null
BR1=$(DB "select id from \"Branch\" where code='ZX1$SUF'")
POST $A teams/groups "{\"name\":\"$GRP\",\"covers\":[\"$DEL\"]}" >/dev/null
# ใบงานค้าง 1 ใบ + ปิดแล้ว 1 ใบ ของทีมที่จะลบ
mk() { DB "insert into \"WorkOrder\"(code,title,\"branchId\",status,\"assignedTeam\",\"createdById\",\"updatedAt\") values ('ZX$1$SUF','ทดสอบลบทีม',$BR1,'$2','$DEL',(select id from \"User\" where \"employeeCode\"='A001'),now()) returning id" | head -1; }
OPEN=$(mk A ASSIGNED); DONE=$(mk B DONE)
DB "insert into \"TeamDayPlan\"(date,team,\"updatedAt\") values (current_date+30,'$DEL',now())" >/dev/null

echo "═══ ผลกระทบก่อนลบ"
R=$(curl -s -G localhost:4000/api/teams/usage --data-urlencode "name=$DEL" -H "$(H $A)")
[ "$(echo "$R" | J 'd.branches+"|"+d.technicians+"|"+d.supervisors+"|"+d.openOrders')" = "1|1|1|1" ] && pass "นับผลกระทบ: สาขา 1 · ช่าง 1 · หัวหน้าภาค 1 · ใบงานค้าง 1" || fail "usage: $R"

echo
echo "═══ สิทธิ์ / ต้องเลือกทีมรับต่อ"
R=$(POST $S teams/delete "{\"name\":\"$DEL\",\"moveTo\":\"$KEEP\"}")
[ "$(DB "select zone from \"Branch\" where id=$BR1")" = "$DEL" ] && pass "หัวหน้าภาคลบทีมไม่ได้" || fail "หัวหน้าภาคลบได้"
R=$(POST $A teams/delete "{\"name\":\"$DEL\"}")
echo "$R" | grep -q "เลือกทีมที่จะรับไปดูแลต่อ" && [ "$(DB "select team from \"User\" where \"employeeCode\"='ZX1$SUF'")" = "$DEL" ] \
  && pass "ทีมที่ยังมีสาขา/ใบงานค้าง ไม่เลือกทีมรับต่อ → ไม่ลบอะไรเลย" || fail "ลบได้โดยไม่มีทีมรับต่อ: $R"

echo
echo "═══ ลบทีม"
R=$(POST $A teams/delete "{\"name\":\"$DEL\",\"moveTo\":\"$KEEP\"}")
[ "$(DB "select coalesce(team,'-') from \"User\" where \"employeeCode\"='ZX1$SUF'")" = "-" ] && pass "DB: ช่างในทีมที่ลบ ไม่มีสังกัด" || fail "ช่างยังมีทีม: $R"
[ "$(echo "$R" | J 'd.branches+"|"+d.orders+"|"+d.technicians')" = "1|1|1" ] && pass "ตอบจำนวนถูก: สาขา 1 (CM+PM นับครั้งเดียว) · ใบงาน 1 · ช่าง 1" || fail "จำนวนที่ตอบ: $R"
[ "$(DB "select team from \"User\" where \"employeeCode\"='ZX2$SUF'")" = "$KEEP" ] && pass "DB: ช่างทีมที่รับต่อ ไม่ถูกแตะ" || fail "ช่างทีมอื่นถูกแตะ"
[ "$(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='ZX9$SUF'")" = "$KEEP" ] && pass "DB: หัวหน้าภาคเลิกดูแลทีมที่ลบ ทีมอื่นยังอยู่" || fail "หัวหน้าภาค: $(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='ZX9$SUF'")"
[ "$(DB "select zone||'|'||\"pmTeam\" from \"Branch\" where id=$BR1")" = "$KEEP|$KEEP" ] && pass "DB: สาขาย้ายไปทีมที่รับต่อ (CM และ PM)" || fail "สาขา: $(DB "select zone from \"Branch\" where id=$BR1")"
[ "$(DB "select \"assignedTeam\" from \"WorkOrder\" where id=$OPEN")|$(DB "select \"assignedTeam\" from \"WorkOrder\" where id=$DONE")" = "$KEEP|$DEL" ] \
  && pass "DB: ใบงานค้างไปทีมที่รับต่อ · ใบงานที่ปิดแล้วคงชื่อเดิม (ประวัติ)" || fail "ใบงาน: $(DB "select \"assignedTeam\" from \"WorkOrder\" where id in ($OPEN,$DONE)")"
[ "$(DB "select count(*) from \"TeamDayPlan\" where team='$DEL'")" = "0" ] && pass "DB: แผนล่วงหน้าของทีมที่ลบถูกลบ" || fail "แผนค้าง"
[ "$(DB "select array_to_string(covers,',') from \"TeamGroup\" where name='$GRP'")" = "$KEEP" ] && pass "DB: ทีมรวมที่ครอบคลุมทีมที่ลบ เปลี่ยนไปครอบคลุมทีมที่รับต่อ" || fail "ทีมรวม: $(DB "select array_to_string(covers,',') from \"TeamGroup\" where name='$GRP'")"
curl -s localhost:4000/api/teams -H "$(H $A)" | J 'd.teams.some(t=>t.name==="'$DEL'")?"bad":"ok"' | grep -q ok && pass "ทีมที่ลบหายจากหน้าทีมช่าง" || fail "ทีมยังอยู่ในรายการ"

echo
echo "═══ อัปไฟล์ทะเบียนที่ยังเขียนชื่อทีมที่ลบ"
X=$(mktemp --suffix=.xlsx)
NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("s");
  ws.addRow(["code","ชื่อสาขา","ผจกภาค","ทีมช่าง","ผู้ดูแล PM"]); ws.addRow([process.argv[1],"สาขาทีมจะลบ","ใต้",process.argv[2],process.argv[2]]);
  wb.xlsx.writeFile(process.argv[3]);' "ZX1$SUF" "$DEL" "$X"
curl -s -X POST localhost:4000/api/branches/import -H "$(H $A)" -F "file=@$X" -F mode=commit >/dev/null
rm -f "$X"
[ "$(DB "select zone from \"Branch\" where id=$BR1")" = "$KEEP" ] && pass "อัปไฟล์ชื่อเดิม → สาขายังอยู่ทีมที่รับต่อ ทีมที่ลบไม่กลับมา" || fail "ทีมที่ลบกลับมา: $(DB "select zone from \"Branch\" where id=$BR1")"

echo
echo "═══ ทีมที่ไม่มีสาขา"
R=$(POST $A teams/delete "{\"name\":\"$EMPTY\"}")
[ "$(DB "select coalesce(team,'-') from \"User\" where \"employeeCode\"='ZX3$SUF'")" = "-" ] && pass "ทีมที่ไม่มีสาขาและใบงานค้าง ลบได้โดยไม่ต้องเลือกทีมรับต่อ" || fail "ลบไม่ได้: $R"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
