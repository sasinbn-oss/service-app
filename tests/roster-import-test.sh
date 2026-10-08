#!/bin/bash
# ทดสอบ: นำเข้ารายชื่อจากไฟล์ประกาศแบ่งทีม + หัวหน้าภาคดูแลหลายทีม
#   อ่านหัวข้อ/ชื่อเล่น/หัวหน้าภาคของช่าง · เดาคู่ทีม · รหัสตั้งต้นบังคับเปลี่ยน · แอดมินไม่ถูกลดสิทธิ์
#   ขอบเขตหัวหน้าภาคตามทีม (ไม่มีภาค) · ค้นหา/กรองสาขาแล้วขอบเขตไม่หลุด (บั๊กเดิม)
#
# ไฟล์ roster-fixture.ods เป็นชื่อสมมุติ รหัส 99xxxx — ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
cleanup() { DB "delete from \"User\" where \"employeeCode\" like '99____'" >/dev/null; }
trap cleanup EXIT
cleanup

A=$(login A001 | J 'd.token'); T=$(login T001 | J 'd.token')
PREVIEW() { curl -s -X POST localhost:4000/api/user-import/preview -H "$(H $1)" -F "file=@$SP/roster-fixture.ods"; }

echo "═══ อ่านไฟล์"
R=$(PREVIEW $T)
echo "$R" | grep -q "Admin access required" && pass "ช่างนำเข้าไม่ได้ (เฉพาะแอดมิน)" || fail "ช่างเรียกได้: $(echo $R|head -c 100)"
# บัญชีที่มีอยู่แล้วก่อนนำเข้า: ช่างคนหนึ่ง (ทีมเดิม) กับแอดมินที่อยู่ในบันทึกด้วย
DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role,team) values ('990013','ชื่อเก่า','x','EMPLOYEE','กรุงเทพ'),('990002','ชื่อเก่าแอดมิน','x','ADMIN',null)" >/dev/null
P=$(PREVIEW $A)
[ "$(echo "$P" | J 'd.people.length+"|"+d.people.filter(p=>p.role==="SUPERVISOR").length+"|"+d.problems.length')" = "8|2|0" ] \
  && pass "อ่านได้ 8 คน หัวหน้าภาค 2 ไม่มีปัญหา" || fail "อ่านไม่ครบ: $(echo "$P"|head -c 200)"
[ "$(echo "$P" | J 'd.people.filter(p=>p.supervisorCode==="990001").length+"|"+d.people.find(p=>p.code==="990021").supervisorCode+"|"+d.people.find(p=>p.code==="990031").supervisorCode')" = "3|990002|null" ] \
  && pass "ช่างผูกกับหัวหน้าภาคตามหัวข้อ ทีมส่วนกลางไม่มีหัวหน้าภาค" || fail "ผูกหัวหน้าภาคผิด"
[ "$(echo "$P" | J '[d.people.find(p=>p.code==="990001").name,d.people.find(p=>p.code==="990002").name,d.people.find(p=>p.code==="990012").name].join("|")')" = "ทดสอบ หัวหน้าหนึ่ง (เอ)|มานะ หัวหน้าสอง|ช่างสอง ทดสอบ" ] \
  && pass "ชื่อ: ตัดชื่อเล่นซ้ำในวงเล็บ · ชื่อเล่นเดียวกับชื่อจริงไม่ใส่ · ชื่อเล่น - ไม่ใส่" || fail "ชื่อไม่ถูก: $(echo "$P" | J 'd.people.map(p=>p.name).join(",")')"
[ "$(echo "$P" | J 'const s=Object.fromEntries(d.areas.map(a=>[a.area,a.suggestion])); [s["กระบี่"],s["กทม. กรุงเทพ"],s["Senior กระบี่ กรุงเทพ"],s["OPL โรงซัก"]].join("|")')" = "กระบี่|กรุงเทพ||" ] \
  && pass "เดาคู่ทีม: ตรงชื่อ · ตัด กทม. · กำกวมหลายทีมไม่เดา · ไม่มีทีมไม่เดา" || fail "เดาทีมผิด: $(echo "$P" | J 'JSON.stringify(d.areas)')"
[ "$(echo "$P" | J 'd.people.find(p=>p.code==="990013").existing.team+"|"+d.people.find(p=>p.code==="990002").keepsRole')" = "กรุงเทพ|true" ] \
  && pass "บอกว่าใครมีบัญชีแล้ว และแอดมินจะไม่ถูกลดสิทธิ์" || fail "ไม่บอกบัญชีเดิม"

echo
echo "═══ บันทึก"
BODY() { echo "$P" | node -e '
  const d=JSON.parse(require("fs").readFileSync(0));
  const teamMap=Object.fromEntries(d.areas.map(a=>[a.area,a.suggestion]));
  const out={teamMap,people:d.people.map(({code,fullName,nick,role,area,supervisorCode})=>({code,fullName,nick,role,area,supervisorCode}))};
  if(process.argv[1]) out.password=process.argv[1];
  console.log(JSON.stringify(out));' "$1"; }
R=$(curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$(BODY '')")
echo "$R" | grep -q "อย่างน้อย 8 ตัว" && [ "$(DB "select count(*) from \"User\" where \"employeeCode\" like '99____'")" = "2" ] \
  && pass "มีคนใหม่แต่ไม่ใส่รหัสตั้งต้น — ไม่บันทึกอะไรเลย" || fail "บันทึกได้โดยไม่มีรหัส: $(echo $R|head -c 120)"
R=$(curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$(BODY 12345678)")
[ "$(echo "$R" | J 'd.created+"|"+d.updated+"|"+d.withoutTeam')" = "6|2|2" ] \
  && pass "สร้าง 6 อัปเดต 2 ยังไม่มีทีม 2 (OPL โรงซัก, ทีมเสริม)" || fail "ผลนำเข้า: $(echo $R|head -c 160)"
[ "$(DB "select role||'|'||coalesce(team,'-')||'|'||\"mustChangePassword\" from \"User\" where \"employeeCode\"='990011'")" = "EMPLOYEE|กระบี่|true" ] \
  && pass "DB: ช่างใหม่ได้ทีมตามคู่ และต้องเปลี่ยนรหัสก่อนใช้" || fail "DB ช่างใหม่ไม่ถูก"
[ "$(DB "select role||'|'||array_to_string(array(select unnest(\"supervisedTeams\") order by 1),',') from \"User\" where \"employeeCode\"='990001'")" = "SUPERVISOR|กระบี่,กรุงเทพ" ] \
  && pass "DB: หัวหน้าภาคดูแลทีมของช่างตัวเอง (กระบี่ + กรุงเทพ)" || fail "ทีมหัวหน้าภาค: $(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='990001'")"
[ "$(DB "select name||'|'||coalesce(team,'-')||'|'||\"passwordHash\" from \"User\" where \"employeeCode\"='990013'")" = "ช่างสาม ทดสอบ (ซี)|กรุงเทพ|x" ] \
  && pass "DB: บัญชีเดิมได้ชื่อใหม่ ไม่มีคู่ทีมก็คงทีมเดิม และรหัสผ่านไม่ถูกแตะ" || fail "บัญชีเดิมถูกแก้ผิด"
[ "$(DB "select role||'|'||name from \"User\" where \"employeeCode\"='990002'")" = "ADMIN|มานะ หัวหน้าสอง" ] \
  && pass "DB: แอดมินที่อยู่ในบันทึกไม่ถูกลดเป็นหัวหน้าภาค" || fail "แอดมินถูกลดสิทธิ์"
NEWT=$(login 990011 12345678 | J 'd.token')
curl -s localhost:4000/api/work-orders -H "$(H $NEWT)" | grep -q "ต้องเปลี่ยนรหัสผ่าน" && pass "เข้าระบบด้วยรหัสตั้งต้นได้ แต่ต้องเปลี่ยนรหัสก่อนใช้งาน" || fail "รหัสตั้งต้นใช้ไม่ได้/ไม่บังคับเปลี่ยน"
R=$(curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$(BODY '' | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); d.teamMap["กระบี่"]="ทีมที่ไม่มีจริง"; JSON.stringify(d)')")
echo "$R" | grep -q "ไม่มีทีม" && pass "ส่งชื่อทีมที่ไม่มีในทะเบียนสาขามา ถูกปฏิเสธ" || fail "รับทีมที่ไม่มีจริง: $(echo $R|head -c 100)"
R=$(curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$(BODY '')")
[ "$(echo "$R" | J 'd.created+"|"+d.updated')" = "0|8" ] && pass "นำเข้าซ้ำ (ทุกคนมีบัญชีแล้ว) ไม่ต้องใส่รหัส — อัปเดตอย่างเดียว" || fail "นำเข้าซ้ำ: $(echo $R|head -c 120)"

echo
echo "═══ ขอบเขตหัวหน้าภาคตามทีม"
# หัวหน้าภาคที่ไม่มีภาค ดูแลทีมกระบี่อย่างเดียว (rollback ใช้ทดสอบเพราะเช็คขอบเขตก่อนสถานะ — ไม่มีอะไรถูกย้อนจริง)
DB "update \"User\" set \"supervisedTeams\"=ARRAY['กระบี่'], region=null, \"mustChangePassword\"=false, \"passwordHash\"=(select \"passwordHash\" from \"User\" where \"employeeCode\"='A001') where \"employeeCode\"='990001'" >/dev/null
SV=$(login 990001 | J 'd.token')
EXP=$(DB "select count(*) from \"WorkOrder\" w join \"Branch\" b on b.id=w.\"branchId\" where w.\"assignedTeam\"='กระบี่' or b.zone='กระบี่' or b.\"pmTeam\"='กระบี่'")
GOT=$(curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $SV)" | J 'd.rows.length')
OUT=$(curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $SV)" | J 'd.rows.filter(r=>r.branch&&r.branch.zone&&r.branch.zone!=="กระบี่"&&r.assignedTeam!=="กระบี่").length')
[ "$GOT" = "$EXP" ] && [ "$EXP" -gt 0 ] && pass "หัวหน้าภาคไม่มีภาคแต่ดูแลทีม เห็นใบงานของทีมครบ ($GOT ใบ)" || fail "เห็น $GOT ใบ ควรเป็น $EXP"
OTHER=$(DB "select w.id from \"WorkOrder\" w join \"Branch\" b on b.id=w.\"branchId\" where b.zone='กรุงเทพ' and coalesce(w.\"assignedTeam\",'')<>'กระบี่' and w.status not in ('DONE','CANCELLED') limit 1")
R=$(curl -s -X POST "localhost:4000/api/work-orders/$OTHER/rollback" -H "$(H $SV)" -H 'Content-Type: application/json' -d '{"toStage":"NEW","reason":"ทดสอบขอบเขต"}')
echo "$R" | grep -q "ไม่อยู่ในภาคหรือทีมที่คุณดูแล" && pass "แตะใบงานของทีมอื่นไม่ได้" || fail "แตะใบงานทีมอื่นได้: $(echo $R|head -c 120)"
CODE=$(DB "select b.code from \"WorkOrder\" w join \"Branch\" b on b.id=w.\"branchId\" where b.zone='กรุงเทพ' limit 1")
N=$(curl -s "localhost:4000/api/work-orders?status=ALL&branchCode=$CODE" -H "$(H $SV)" | J 'd.rows.filter(r=>r.assignedTeam!=="กระบี่").length')
[ "$N" = "0" ] && pass "กรองสาขาของทีมอื่น ไม่หลุดขอบเขต (บั๊กเดิม)" || fail "กรองสาขาแล้วเห็นใบงานทีมอื่น $N ใบ"
TN=$(curl -s "localhost:4000/api/work-orders?status=ALL&q=WO" -H "$(H $T)" | J 'd.rows.length')
TE=$(DB "select count(*) from \"WorkOrder\" w join \"User\" u on u.\"employeeCode\"='T001' where (w.\"assignedTeam\"=u.team or w.\"assignedToId\"=u.id) and w.code ilike '%WO%'")
[ "$TN" = "$TE" ] && pass "ช่างค้นหาแล้วยังเห็นเฉพาะงานทีมตัวเอง (บั๊กเดิม: ค้นแล้วเห็นทั้งระบบ)" || fail "ช่างค้นหาเห็น $TN ใบ ควรเป็น $TE"
DAY=$(DB "select to_char(\"scheduledAt\",'YYYY-MM-DD') from \"WorkOrder\" where \"scheduledAt\" is not null limit 1")
if [ -n "$DAY" ]; then
  BAD=$(curl -s "localhost:4000/api/plans/day?date=$DAY" -H "$(H $SV)" | J 'd.lanes.flatMap(l=>l.stops).filter(s=>s.team&&s.team!=="กระบี่").length' 2>/dev/null || echo err)
  [ "$BAD" = "0" ] && pass "บอร์ดแผนงานของหัวหน้าภาคแสดงเฉพาะทีมที่ดูแล" || fail "บอร์ดแผนงานหลุดขอบเขต: $BAD"
fi

echo
echo "═══ แก้ทีมที่ดูแลในหน้าสิทธิ์ผู้ใช้"
ID=$(DB "select id from \"User\" where \"employeeCode\"='990001'")
curl -s -X PATCH "localhost:4000/api/auth/users/$ID" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"supervisedTeams":["กรุงเทพ","กรุงเทพ","กระบี่"]}' >/dev/null
[ "$(DB "select array_length(\"supervisedTeams\",1) from \"User\" where id=$ID")" = "2" ] && pass "ตั้งทีมที่ดูแลได้หลายทีม (ตัดซ้ำ)" || fail "ตั้งทีมไม่ได้"
curl -s -X PATCH "localhost:4000/api/auth/users/$ID" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"role":"EMPLOYEE"}' >/dev/null
[ "$(DB "select coalesce(array_length(\"supervisedTeams\",1),0) from \"User\" where id=$ID")" = "0" ] && pass "เปลี่ยนเป็นช่าง ทีมที่ดูแลถูกล้าง" || fail "ทีมที่ดูแลค้าง"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
