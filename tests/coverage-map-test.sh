#!/bin/bash
# ทดสอบ: ผังผู้รับผิดชอบพื้นที่ (GET /api/teams/coverage-map) — ทุกบทบาทอ่านได้ · แก้ได้เฉพาะแอดมิน (canEdit) ·
#        ส่งเบอร์โทรของคนที่มีเบอร์ (เจ้าของงานขอ ต.ค. 69 — เดิมไม่ส่ง) · ภาคของทีม = ภาคที่สาขามากที่สุด · ช่างที่ทีมไม่มีในทะเบียน = ยังไม่มีสังกัด
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
MAP() { curl -s localhost:4000/api/teams/coverage-map -H "$(H $1)"; }
SUF=$RANDOM
cleanup() {
  DB "delete from \"Branch\" where code like 'ZCM_$SUF'; delete from \"User\" where \"employeeCode\" in ('ZCMP$SUF','ZCMX$SUF')" >/dev/null
}
trap cleanup EXIT
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\",phone) values
  ('ZCMP$SUF','แอดมินอะไหล่ผัง','PARTS_ADMIN','$HASH',false,null),
  ('ZCMX$SUF','ช่างทีมสะกดผิด','EMPLOYEE','$HASH',false,'089-999-9999');
  update \"User\" set team='ทีมไม่มีจริง$SUF' where \"employeeCode\"='ZCMX$SUF';
  insert into \"Branch\"(code,name,zone,region) values ('ZCM1$SUF','ผ1','ทีมผัง$SUF','ภาคผังA$SUF'),('ZCM2$SUF','ผ2','ทีมผัง$SUF','ภาคผังA$SUF'),('ZCM3$SUF','ผ3','ทีมผัง$SUF','ภาคผังB$SUF')" >/dev/null
A=$(login A001); S=$(login S001); T=$(login T001); PA=$(login ZCMP$SUF)

R=$(MAP $T)
echo "$R" | J 'd.canEdit===false&&Array.isArray(d.regions)&&d.technicians.length>0?"ok":"bad"' | grep -q ok && pass "ช่างเปิดผังได้ (ดูอย่างเดียว canEdit=false)" || fail "ช่าง: $(echo "$R" | head -c 200)"
[ "$(MAP $S | J 'd.canEdit')" = "false" ] && pass "หัวหน้าภาคดูได้ แก้ไม่ได้" || fail "หัวหน้าภาค canEdit"
[ "$(MAP $PA | J 'd.canEdit')" = "false" ] && pass "Admin Spare Part ดูได้ แก้ไม่ได้" || fail "Admin Spare Part canEdit"
[ "$(MAP $A | J 'd.canEdit')" = "true" ] && pass "แอดมินแก้ได้ (canEdit=true)" || fail "แอดมิน canEdit"
[ "$(MAP $T | J "d.technicians.find(x=>x.code==='ZCMX$SUF').phone")" = "089-999-9999" ] \
  && pass "ส่งเบอร์โทรของคนที่มีเบอร์ — ช่างเปิดดูก็เห็น (เจ้าของงานตกลงให้ทุกคนเห็น)" || fail "ไม่มีเบอร์โทรในผัง"
[ "$(MAP $A | J "d.regions.find(r=>r.teams.some(t=>t.name==='ทีมผัง$SUF')).name+'|'+d.regions.flatMap(r=>r.teams).find(t=>t.name==='ทีมผัง$SUF').branches")" = "ภาคผังA$SUF|3" ] \
  && pass "ทีมอยู่ภาคที่สาขาส่วนใหญ่อยู่ (2 ใน 3) นับสาขาครบ" || fail "ภาคของทีม: $(MAP $A | J "JSON.stringify(d.regions.filter(r=>r.name.includes('ผัง')))")"
[ "$(MAP $A | J "const t=d.technicians.find(x=>x.code==='ZCMX$SUF'); (t.team===null)+'|'+t.staleTeam")" = "true|ทีมไม่มีจริง$SUF" ] \
  && pass "ช่างที่ทีมไม่มีในทะเบียน = ยังไม่มีสังกัด (บอกชื่อทีมเดิม)" || fail "ช่างทีมสะกดผิด"
MAP $A | J 'd.technicians.every(t=>t.code)&&d.supervisors.every(s=>Array.isArray(s.teams))&&!d.technicians.some(t=>["A001"].includes(t.code))?"ok":"bad"' | grep -q ok \
  && pass "ผังมีเฉพาะช่างกับหัวหน้าภาค (ไม่มีแอดมิน)" || fail "มีบทบาทอื่นปน"

[ -z "$FAILED" ]
