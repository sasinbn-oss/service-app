#!/bin/bash
# ทดสอบ: ทีมมาก่อนภาค (เจ้าของงานกำหนด ต.ค. 69 — "ทำไมหัวหน้าภาคคนอื่นถึงเห็นทีม OPL")
#   · สาขาที่ทีมประจำมีหัวหน้าภาคดูแลแล้ว → ใบเข้าเฉพาะคนดูแลทีม ไม่เข้าคนที่ดูแลตามภาค
#   · ช่อง "ทีมที่จะรับงาน" ของหัวหน้าภาค = ทุกทีม ติดธงทีมของตัวเอง (จ่ายข้ามทีมได้ ต.ค. 69 — ดู cross-team-test.sh)
#     จ่ายข้ามไปแล้วใบยังเป็นของคนจ่าย ไม่ตามทีมที่รับ
#   · คนดูแลทีมหมดสิทธิ์ → ใบกลับเข้าคนดูแลภาค
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
A=$(login A001); S=$(login S001)
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
[ "$(DB "select region from \"User\" where id=$SID")|$(DB "select region||'|'||zone from \"Branch\" where code='C0006'")" = "ใต้|ใต้|กระบี่" ] || { echo "FAIL ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้ · C0006 ใต้/กระบี่)"; exit 1; }
SUF=$((RANDOM % 9000 + 1000))

# หัวหน้าภาคอีกคนดูแลทีมกระบี่ (สาขา C0006 อยู่ภาคใต้ ซึ่ง S001 ดูแลตามภาค)
POST $A auth/users "{\"employeeCode\":\"ZT$SUF\",\"name\":\"หัวหน้าทีมกระบี่ทดสอบ\",\"role\":\"EMPLOYEE\",\"password\":\"temp12345\"}" >/dev/null
ZID=$(DB "select id from \"User\" where \"employeeCode\"='ZT$SUF'")
PATCH $A "auth/users/$ZID" '{"role":"SUPERVISOR","supervisedTeams":["กระบี่"]}' >/dev/null
DB "update \"User\" set \"mustChangePassword\"=false where id=$ZID" >/dev/null
Z=$(login "ZT$SUF" temp12345)

WO=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W1","symptom":"ทดสอบทีมมาก่อนภาค"}]}' | J 'd.orders?d.orders[0].id:d.id')
POST $A "work-orders/$WO/parts" '{"needsParts":false}' >/dev/null
CODE=$(DB "select code from \"WorkOrder\" where id=$WO")
seen() { curl -s "localhost:4000/api/work-orders?status=ALL&search=$CODE" -H "$(H $1)" | J "d.rows.some(r=>r.id===$WO)"; }
[ "$(curl -s "localhost:4000/api/work-orders?status=ALL&search=$CODE" -H "$(H $A)" | J "d.rows.find(r=>r.id===$WO).waitingOnSupervisors.map(s=>s.id).join()")" = "$ZID" ] \
  && pass "รอใคร = เฉพาะคนดูแลทีมกระบี่ (ไม่ใช่ S001 ที่ดูแลภาคใต้)" || fail "waitingOn: $(curl -s "localhost:4000/api/work-orders?status=ALL&search=$CODE" -H "$(H $A)" | J "JSON.stringify(d.rows.find(r=>r.id===$WO).waitingOnSupervisors)")"
[ "$(seen $Z)|$(seen $S)" = "true|false" ] && pass "คนดูแลทีมเห็นใบ · คนดูแลภาคไม่เห็น" || fail "เห็นใบ: ทีม=$(seen $Z) ภาค=$(seen $S)"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/$WO -H "$(H $S)")" = "403" ] && pass "คนดูแลภาคเปิดใบด้วยเลขตรง ๆ ไม่ได้" || fail "S001 เปิดใบได้"

# ช่องทีมที่จะรับงาน — ทุกทีม แต่บอกว่าทีมไหนของตัวเอง
OPT() { curl -s localhost:4000/api/work-orders/options -H "$(H $1)" | J "$2"; }
MINE='d.teams.filter(t=>t.mine).map(t=>t.name).join()'
[ "$(OPT $S 'd.teams.find(t=>t.name==="กระบี่").mine')|$(OPT $Z "$MINE")|$(OPT $A 'd.teams.length>2')" = "false|กระบี่|true" ] \
  && pass "รายการทีม: กระบี่ไม่ใช่ทีมของ S001 · คนดูแลทีมมีกระบี่เป็นทีมตัวเอง · แอดมินเห็นทุกทีม" || fail "options: S=$(OPT $S "$MINE") Z=$(OPT $Z "$MINE")"
OTHER=$(DB "select zone from \"Branch\" where zone is not null and zone<>'กระบี่' and \"cancelledAt\" is null limit 1")
R=$(POST $Z "work-orders/$WO/assign" "{\"team\":\"$OTHER\",\"scheduledAt\":\"2026-12-01\"}")
[ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$WO")" = "$OTHER" ] && [ "$(seen $Z)|$(seen $S)" = "true|false" ] \
  && pass "จ่ายข้ามไปทีม $OTHER ได้ · ใบยังอยู่กับคนดูแลทีมกระบี่ ไม่ไปที่ S001" || fail "จ่ายข้ามทีม: $R · เห็น Z=$(seen $Z) S=$(seen $S)"

# คนดูแลทีมหมดสิทธิ์ → ใบกลับเข้าคนดูแลภาค
PATCH $A "auth/users/$ZID" '{"role":"EMPLOYEE"}' >/dev/null
[ "$(seen $S)" = "true" ] && pass "คนดูแลทีมเปลี่ยนเป็นช่าง → ใบกลับเข้าคนดูแลภาคใต้" || fail "S001 ยังไม่เห็นใบ"

# เก็บกวาด
curl -s -X DELETE "localhost:4000/api/work-orders/$WO" -H "$(H $A)" >/dev/null
DB "delete from \"User\" where id=$ZID" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
