#!/bin/bash
# ทดสอบ: เปลี่ยนชื่อทีมในแอป (แอดมิน)
#   ทุกที่ที่ผูกกับชื่อเดิมย้ายตาม (สาขา CM/PM · ช่าง · ทีมที่หัวหน้าภาคดูแล · ใบงาน · แผนรายวัน)
#   อัปไฟล์ทะเบียนสาขาที่ยังเขียนชื่อเดิม → ระบบแปลงเป็นชื่อใหม่ · รวมทีมต้องยืนยัน · แผนวันเดียวกันรวมคน
#
# ใช้สาขา/ผู้ใช้/ทีมทดสอบของตัวเองทั้งหมด (ชื่อมี $SUF) — ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
RENAME() { curl -s -X POST localhost:4000/api/teams/rename -H "$(H $1)" -H 'Content-Type: application/json' -d "$2"; }
SUF=$RANDOM
OLD="ทีมเก่า$SUF"; NEW="ทีมใหม่$SUF"; OTHER="ทีมอื่น$SUF"; FINAL="ทีมสุดท้าย$SUF"
WO=$(DB "select id from \"WorkOrder\" order by id limit 1")
WO_TEAM=$(DB "select coalesce(\"assignedTeam\",'') from \"WorkOrder\" where id=$WO")
cleanup() {
  DB "update \"WorkOrder\" set \"assignedTeam\"=nullif('$WO_TEAM','') where id=$WO;
      delete from \"TeamDayPlan\" where team like '%$SUF';
      delete from \"TeamRename\" where \"fromName\" like '%$SUF' or \"toName\" like '%$SUF';
      delete from \"User\" where \"employeeCode\" like 'ZT%$SUF';
      delete from \"Branch\" where code like 'ZT%$SUF'" >/dev/null
}
trap cleanup EXIT

A=$(login A001); T=$(login T001)
DB "insert into \"Branch\" (code,name,zone,\"pmTeam\") values ('ZT1$SUF','สาขาทดสอบ1','$OLD','$OLD'),('ZT2$SUF','สาขาทดสอบ2','$OTHER',null)" >/dev/null
TECH=$(DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role,team) values ('ZTT$SUF','ช่างทีมเก่า','x','EMPLOYEE','$OLD') returning id" | head -1)
TECH2=$(DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role,team) values ('ZTU$SUF','ช่างทีมอื่น','x','EMPLOYEE','$OTHER') returning id" | head -1)
SUP=$(DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role,\"supervisedTeams\") values ('ZTS$SUF','หัวหน้าทดสอบ','x','SUPERVISOR',ARRAY['$OLD','กระบี่','$OTHER']) returning id" | head -1)
DB "update \"WorkOrder\" set \"assignedTeam\"='$OLD' where id=$WO" >/dev/null
P1=$(DB "insert into \"TeamDayPlan\" (date,team,\"updatedAt\",note) values (current_date+1,'$OLD',now(),'แผนทีมเก่า') returning id" | head -1)
P2=$(DB "insert into \"TeamDayPlan\" (date,team,\"updatedAt\",note) values (current_date+1,'$OTHER',now(),'แผนทีมอื่น') returning id" | head -1)
DB "insert into \"TeamDayPlanMember\" (\"planId\",\"userId\",position) values ($P1,$TECH,0),($P2,$TECH2,0)" >/dev/null

echo "═══ ดูรายการทีม"
R=$(curl -s localhost:4000/api/teams -H "$(H $T)")
echo "$R" | grep -q "Admin access required" && pass "ช่างเปิดหน้าทีมไม่ได้ (เฉพาะแอดมิน)" || fail "ช่างเปิดได้"
ROW=$(curl -s localhost:4000/api/teams -H "$(H $A)" | J "const t=d.teams.find(t=>t.name==='$OLD'); [t.cmBranches,t.pmBranches,t.technicians,t.supervisors,t.openOrders>=0,t.orphan].join('|')")
[ "$ROW" = "1|1|1|1|true|false" ] && pass "นับสาขา CM/PM ช่าง หัวหน้าภาคของทีมถูก" || fail "นับผิด: $ROW"

echo
echo "═══ เปลี่ยนชื่อ"
R=$(RENAME $A "{\"from\":\"$OLD\",\"to\":\"$OLD\"}"); echo "$R" | grep -q "เหมือนชื่อเดิม" && pass "ชื่อใหม่เหมือนเดิม ถูกปฏิเสธ" || fail "รับชื่อเดิม"
R=$(RENAME $A "{\"from\":\"ไม่มีทีมนี้$SUF\",\"to\":\"x$SUF\"}"); echo "$R" | grep -q "ไม่พบทีม" && pass "ทีมที่ไม่มีอยู่ ถูกปฏิเสธ" || fail "เปลี่ยนทีมที่ไม่มีได้"
R=$(RENAME $T "{\"from\":\"$OLD\",\"to\":\"$NEW\"}"); echo "$R" | grep -q "Admin access required" && pass "ช่างเปลี่ยนชื่อทีมไม่ได้" || fail "ช่างเปลี่ยนได้"
R=$(RENAME $A "{\"from\":\"$OLD\",\"to\":\"  $NEW  \"}")
[ "$(echo "$R" | J '[d.branches,d.technicians,d.supervisors,d.workOrders,d.plans,d.merged].join("|")')" = "2|1|1|1|1|false" ] \
  && pass "ตอบจำนวนที่ย้าย: สาขา 2 (CM+PM) ช่าง 1 หัวหน้าภาค 1 ใบงาน 1 แผน 1" || fail "ผลเปลี่ยนชื่อ: $(echo $R|head -c 200)"
[ "$(DB "select zone||'|'||\"pmTeam\" from \"Branch\" where code='ZT1$SUF'")|$(DB "select team from \"User\" where id=$TECH")|$(DB "select \"assignedTeam\" from \"WorkOrder\" where id=$WO")|$(DB "select team from \"TeamDayPlan\" where id=$P1")" = "$NEW|$NEW|$NEW|$NEW|$NEW" ] \
  && pass "DB: สาขา ช่าง ใบงาน แผน ย้ายไปชื่อใหม่ (ตัดช่องว่างหัวท้ายให้)" || fail "DB ย้ายไม่ครบ"
[ "$(DB "select ('$NEW' = any(\"supervisedTeams\"))::text||'|'||array_length(\"supervisedTeams\",1) from \"User\" where id=$SUP")" = "true|3" ] \
  && pass "DB: ทีมที่หัวหน้าภาคดูแลเปลี่ยนเป็นชื่อใหม่ ทีมอื่นของเขาไม่ถูกแตะ" || fail "ทีมของหัวหน้าภาค: $(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where id=$SUP")"
[ "$(DB "select \"toName\" from \"TeamRename\" where \"fromName\"='$OLD'")" = "$NEW" ] && pass "DB: จำชื่อเดิม → ชื่อใหม่ไว้" || fail "ไม่จำชื่อเดิม"

echo
echo "═══ อัปทะเบียนสาขาที่ยังเขียนชื่อเดิม"
XLSX=$(mktemp --suffix=.xlsx)
NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("s");
  ws.addRow(["code","ชื่อสาขา","ผจกภาค","ทีมช่าง","ผู้ดูแล PM"]); ws.addRow([process.argv[1],"สาขาทดสอบ1","ใต้",process.argv[2],process.argv[2]]);
  wb.xlsx.writeFile(process.argv[3]);' "ZT1$SUF" "$OLD" "$XLSX"
R=$(curl -s -X POST localhost:4000/api/branches/import -H "$(H $A)" -F "file=@$XLSX" -F mode=commit)
rm -f "$XLSX"
[ "$(DB "select zone||'|'||coalesce(\"pmTeam\",'-') from \"Branch\" where code='ZT1$SUF'")" = "$NEW|$NEW" ] \
  && pass "อัปไฟล์ชื่อเดิม → สาขายังเป็นชื่อใหม่ (ระบบแปลงให้)" || fail "ชื่อเดิมถูกเขียนกลับ: $(DB "select zone from \"Branch\" where code='ZT1$SUF'") $(echo $R|head -c 150)"

echo
echo "═══ รวมทีม"
R=$(RENAME $A "{\"from\":\"$OTHER\",\"to\":\"$NEW\"}")
echo "$R" | grep -q "needsMerge" && [ "$(DB "select team from \"User\" where id=$TECH2")" = "$OTHER" ] \
  && pass "ชื่อใหม่ซ้ำกับทีมที่มี → ต้องยืนยันรวมทีม ยังไม่เปลี่ยนอะไร" || fail "รวมทีมโดยไม่ยืนยัน: $(echo $R|head -c 120)"
R=$(RENAME $A "{\"from\":\"$OTHER\",\"to\":\"$NEW\",\"merge\":true}")
[ "$(echo "$R" | J 'd.merged')" = "true" ] && [ "$(DB "select team from \"User\" where id=$TECH2")" = "$NEW" ] \
  && pass "ยืนยันแล้วรวมทีมได้" || fail "รวมทีมไม่ได้: $(echo $R|head -c 120)"
[ "$(DB "select array_length(\"supervisedTeams\",1) from \"User\" where id=$SUP")" = "2" ] \
  && pass "หัวหน้าภาคที่ดูแลทั้งสองทีม เหลือทีมรวมทีมเดียว (ไม่ซ้ำ)" || fail "ทีมซ้ำ: $(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where id=$SUP")"
[ "$(DB "select count(*) from \"TeamDayPlan\" where team='$NEW' and date=current_date+1")|$(DB "select count(*) from \"TeamDayPlanMember\" m join \"TeamDayPlan\" p on p.id=m.\"planId\" where p.team='$NEW' and p.date=current_date+1")" = "1|2" ] \
  && pass "แผนวันเดียวกันของสองทีมรวมเป็นแผนเดียว คนครบ 2 คน" || fail "รวมแผนผิด"

echo
echo "═══ เปลี่ยนต่อเป็นทอด"
RENAME $A "{\"from\":\"$NEW\",\"to\":\"$FINAL\"}" >/dev/null
[ "$(DB "select \"toName\" from \"TeamRename\" where \"fromName\"='$OLD'")|$(DB "select \"toName\" from \"TeamRename\" where \"fromName\"='$NEW'")" = "$FINAL|$FINAL" ] \
  && pass "ชื่อที่เคยชี้มาที่ชื่อเดิม ชี้ต่อไปที่ชื่อล่าสุด (เก่า→สุดท้าย, ใหม่→สุดท้าย)" || fail "ทอดชื่อไม่ถูก"
RENAME $A "{\"from\":\"$FINAL\",\"to\":\"$OLD\"}" >/dev/null
[ "$(DB "select count(*) from \"TeamRename\" where \"fromName\"='$OLD'")|$(DB "select zone from \"Branch\" where code='ZT1$SUF'")" = "0|$OLD" ] \
  && pass "เปลี่ยนกลับเป็นชื่อเดิมได้ ไม่เกิดการแปลงวนกัน" || fail "เปลี่ยนกลับแล้วแปลงวน"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
