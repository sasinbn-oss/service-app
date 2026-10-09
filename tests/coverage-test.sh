#!/bin/bash
# ทดสอบ: รายงาน "ใครยังไม่มีพื้นที่รับผิดชอบ" (หน้าสิทธิ์ผู้ใช้ → Excel)
#        ช่างไม่มีทีม / ทีมไม่มีในทะเบียนสาขา · หัวหน้าภาคไม่มีภาคและทีม / ตั้งไว้แต่ไม่มีในทะเบียน
#        คนที่มีพื้นที่ถูกต้องและแอดมินต้องไม่อยู่ในรายงาน — อ่านจากไฟล์ Excel จริงที่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
SUF=$RANDOM
cleanup() { DB "delete from \"User\" where \"employeeCode\" like 'ZC%$SUF'" >/dev/null; }
trap cleanup EXIT
A=$(login A001); T=$(login T001)
TEAM=$(DB "select zone from \"Branch\" where zone is not null and \"cancelledAt\" is null limit 1")
REGION=$(DB "select region from \"Branch\" where region is not null and \"cancelledAt\" is null limit 1")
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,team,region,\"supervisedTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('ZC1$SUF','ช่างไม่มีทีม','EMPLOYEE',null,null,'{}','$HASH',true),
  ('ZC2$SUF','ช่างทีมสะกดผิด','EMPLOYEE','ทีมไม่มีจริง$SUF',null,'{}','$HASH',false),
  ('ZC3$SUF','ช่างทีมถูก','EMPLOYEE','$TEAM',null,'{}','$HASH',false),
  ('ZC4$SUF','หัวหน้าไม่มีขอบเขต','SUPERVISOR',null,null,'{}','$HASH',false),
  ('ZC5$SUF','หัวหน้าทีมไม่มีจริง','SUPERVISOR',null,null,'{ทีมไม่มีจริง$SUF}','$HASH',false),
  ('ZC6$SUF','หัวหน้ามีภาค','SUPERVISOR',null,'$REGION','{}','$HASH',false),
  ('ZC7$SUF','หัวหน้ามีทีม','SUPERVISOR',null,null,'{$TEAM}','$HASH',false),
  ('ZC8$SUF','แอดมินไม่มีทีม','ADMIN',null,null,'{}','$HASH',false)" >/dev/null

R=$(curl -s localhost:4000/api/auth/users/unassigned-report -H "$(H $T)")
echo "$R" | grep -q '"path"' && fail "ช่างออกรายงานได้" || pass "ช่างออกรายงานไม่ได้ (แอดมินเท่านั้น)"

R=$(curl -s localhost:4000/api/auth/users/unassigned-report -H "$(H $A)")
P=$(echo "$R" | J 'd.path')
X=$(mktemp --suffix=.xlsx)
curl -s "localhost:4000$P" -o "$X"
OUT=$(NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const ws=wb.worksheets[0]; const m={};
    ws.eachRow((r,i)=>{ if(i>1&&r.getCell(2).value) m[String(r.getCell(2).value)]=[r.getCell(4).value,r.getCell(5).value,r.getCell(7).value].join("|"); });
    console.log(JSON.stringify(m)); });' "$X")
rm -f "$X"
got() { echo "$OUT" | J "d['$1']||'-'"; }
[ "$(got ZC1$SUF)" = "ช่าง|ยังไม่ได้จัดทีม|ยังไม่เคย" ] && pass "ช่างไม่มีทีม อยู่ในรายงาน (บอกว่ายังไม่เคยเข้าระบบ)" || fail "ZC1: $(got ZC1$SUF)"
got ZC2$SUF | grep -q "ไม่มีในทะเบียนสาขา" && pass "ช่างที่ทีมสะกดไม่ตรงทะเบียน อยู่ในรายงาน" || fail "ZC2: $(got ZC2$SUF)"
[ "$(got ZC3$SUF)" = "-" ] && pass "ช่างที่ทีมถูกต้อง ไม่อยู่ในรายงาน" || fail "ZC3 ไม่ควรอยู่: $(got ZC3$SUF)"
[ "$(got ZC4$SUF)" = "หัวหน้าภาค|ยังไม่ได้ตั้งภาคหรือทีมที่ดูแล|เข้าแล้ว" ] && pass "หัวหน้าภาคไม่มีภาคและทีม อยู่ในรายงาน" || fail "ZC4: $(got ZC4$SUF)"
got ZC5$SUF | grep -q "ไม่มีในทะเบียนสาขา" && pass "หัวหน้าภาคที่ทีมไม่มีในทะเบียน อยู่ในรายงาน" || fail "ZC5: $(got ZC5$SUF)"
[ "$(got ZC6$SUF)|$(got ZC7$SUF)|$(got ZC8$SUF)" = "-|-|-" ] && pass "หัวหน้าภาคที่มีภาคหรือทีม และแอดมิน ไม่อยู่ในรายงาน" || fail "ไม่ควรอยู่: $(got ZC6$SUF) $(got ZC7$SUF) $(got ZC8$SUF)"
N=$(echo "$OUT" | J 'Object.keys(d).length')
[ "$N" = "$(echo "$R" | J 'd.count')" ] && pass "จำนวนในไฟล์ตรงกับที่ตอบ ($N คน)" || fail "ไฟล์ $N ตอบ $(echo "$R" | J 'd.count')"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
