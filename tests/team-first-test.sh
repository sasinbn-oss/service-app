#!/bin/bash
# ทดสอบ: ทีมมาก่อนภาค (เจ้าของงานกำหนด ต.ค. 69 — "ทำไมหัวหน้าภาคคนอื่นถึงเห็นทีม OPL")
#   · สาขาที่ทีมประจำมีหัวหน้าภาคดูแลแล้ว → ใบเข้าเฉพาะคนดูแลทีม ไม่เข้าคนที่ดูแลตามภาค
#   · ช่อง "ทีมที่จะรับงาน" ของหัวหน้าภาค = เฉพาะทีมที่ตัวเองดูแล · จ่ายทีมนอกขอบเขต = 403 (กันที่เซิร์ฟเวอร์)
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

# ช่องทีมที่จะรับงาน
OPT() { curl -s localhost:4000/api/work-orders/options -H "$(H $1)" | J "$2"; }
[ "$(OPT $S 'd.teamsLimited+"|"+d.teams.some(t=>t.name==="กระบี่")')|$(OPT $Z 'd.teams.filter(t=>!t.outsource).map(t=>t.name).join()')|$(OPT $A 'd.teamsLimited+"|"+(d.teams.length>2)')" = "true|false|กระบี่|false|true" ] \
  && pass "รายการทีม: S001 ไม่เห็นกระบี่ · คนดูแลทีมเห็นแค่กระบี่ (+outsource) · แอดมินเห็นทุกทีม" || fail "options: S=$(OPT $S 'd.teams.map(t=>t.name).join()') Z=$(OPT $Z 'd.teams.map(t=>t.name).join()')"
OTHER=$(DB "select zone from \"Branch\" where zone is not null and zone<>'กระบี่' and \"cancelledAt\" is null limit 1")
R=$(POST $Z "work-orders/$WO/assign" "{\"team\":\"$OTHER\",\"scheduledAt\":\"2026-12-01\"}")
[ "$(DB "select status||'|'||coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$WO")" = "PARTS_CHECKED|-" ] && echo "$R" | grep -q "ไม่ได้อยู่ในความดูแลของคุณ" \
  && pass "จ่ายให้ทีมนอกขอบเขต ($OTHER) = 403 ฐานข้อมูลไม่เปลี่ยน" || fail "จ่ายข้ามขอบเขตได้: $R"
R=$(POST $Z "work-orders/$WO/assign" '{"team":"กระบี่","scheduledAt":"2026-12-01"}')
[ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$WO")" = "กระบี่" ] && pass "จ่ายให้ทีมตัวเองได้" || fail "จ่ายทีมตัวเองไม่ได้: $R"

# คนดูแลทีมหมดสิทธิ์ → ใบกลับเข้าคนดูแลภาค
PATCH $A "auth/users/$ZID" '{"role":"EMPLOYEE"}' >/dev/null
[ "$(seen $S)" = "true" ] && pass "คนดูแลทีมเปลี่ยนเป็นช่าง → ใบกลับเข้าคนดูแลภาคใต้" || fail "S001 ยังไม่เห็นใบ"

# เก็บกวาด
curl -s -X DELETE "localhost:4000/api/work-orders/$WO" -H "$(H $A)" >/dev/null
DB "delete from \"User\" where id=$ZID" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
