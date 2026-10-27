#!/bin/bash
# ทดสอบ: หัวหน้าภาคจ่ายงานข้ามไปทีมนอกความดูแล (เจ้าของงานขอ ต.ค. 69 —
#   "ใบงานอยู่ในพื้นที่รับผิดชอบเรา แต่อยากจ่ายงานให้ทีมอื่นเข้าไป")
#   · จ่ายได้ทุกทีม · ช่องทีมแยกทีมของตัวเองกับทีมของคนอื่น (บอกชื่อคนดูแล)
#   · ใบยังเป็นของคนจ่าย (กล่องงาน · ปล่อยงาน) · หัวหน้าภาคของทีมที่รับเห็นใบแต่ดูอย่างเดียว
#   · ช่างปิดงานได้ทั้งทีมที่รับและทีมประจำสาขา · ทีมประจำสาขาไม่ได้งานนี้เข้ากล่องงาน/งานวันนี้
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODEOF() { curl -s -o /dev/null -w '%{http_code}' -X "$2" "localhost:4000/api/$3" -H "$(H $1)" -H 'Content-Type: application/json' -d "${4:-{\}}"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
A=$(login A001); S=$(login S001)
[ "$(DB "select region from \"User\" where \"employeeCode\"='S001'")|$(DB "select region||'|'||zone from \"Branch\" where code='C0006'")|$(DB "select region||'|'||zone from \"Branch\" where code='C0001'")" = "ใต้|ใต้|กระบี่|กลาง-ตะวันตก|กรุงเทพ" ] \
  || { echo "FAIL ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้ · C0006 ใต้/กระบี่ · C0001 กลาง-ตะวันตก/กรุงเทพ)"; exit 1; }
SUF=$((RANDOM % 9000 + 1000))
T1ID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
T1TEAM=$(DB "select coalesce(team,'') from \"User\" where id=$T1ID")

# ผู้ใช้ชั่วคราว: หัวหน้าภาคกลาง-ตะวันตก (ดูแลทีมกรุงเทพตามภาค) · ช่างทีมกรุงเทพ · ช่างไม่มีทีม
mkuser() {
  POST $A auth/users "{\"employeeCode\":\"$1\",\"name\":\"$2\",\"role\":\"EMPLOYEE\",\"password\":\"temp12345\"}" >/dev/null
  local id; id=$(DB "select id from \"User\" where \"employeeCode\"='$1'")
  PATCH $A "auth/users/$id" "$3" >/dev/null
  DB "update \"User\" set \"mustChangePassword\"=false where id=$id" >/dev/null
  echo "$id"
}
ZID=$(mkuser "XR$SUF" "หัวหน้าภาคกลางทดสอบข้ามทีม" '{"role":"SUPERVISOR","region":"กลาง-ตะวันตก"}')
KID=$(mkuser "XK$SUF" "ช่างกรุงเทพทดสอบข้ามทีม" '{"team":"กรุงเทพ"}')
NID=$(mkuser "XN$SUF" "ช่างไม่มีทีมทดสอบข้ามทีม" '{"team":null}')
PATCH $A "auth/users/$T1ID" '{"team":"กระบี่"}' >/dev/null
Z=$(login "XR$SUF" temp12345); K=$(login "XK$SUF" temp12345); N=$(login "XN$SUF" temp12345); T=$(login T001)
cleanup() {
  for w in $W1 $W2; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$w" -H "$(H $A)"; done
  DB "delete from \"User\" where id in ($ZID,$KID,$NID)" >/dev/null
  PATCH $A "auth/users/$T1ID" "{\"team\":$( [ -n "$T1TEAM" ] && echo "\"$T1TEAM\"" || echo null )}" >/dev/null
}
trap cleanup EXIT

echo "═══ ช่องทีมของหัวหน้าภาค: ทุกทีม แยกของตัวเอง/ของคนอื่น"
OPT=$(GET $S work-orders/options)
echo "$OPT" | J 'const k=d.teams.find(t=>t.name==="กระบี่"), b=d.teams.find(t=>t.name==="กรุงเทพ"); [k&&k.mine, b&&b.mine, b&&b.supervisors.join()].join("|")' \
  | grep -q "^true|false|.*หัวหน้าภาคกลางทดสอบข้ามทีม" \
  && pass "S001 เห็นทีมกรุงเทพ (นอกความดูแล · บอกว่าใครดูแล) และกระบี่เป็นทีมของตัวเอง" \
  || fail "options: $(echo "$OPT" | J 'JSON.stringify(d.teams.filter(t=>!t.outsource))')"
[ "$(GET $A work-orders/options | J 'd.teams.some(t=>"mine" in t)')" = "false" ] && pass "แอดมินไม่มีธงทีมของตัวเอง (ทุกทีมเหมือนกัน)" || fail "แอดมินได้ธง mine"

echo
echo "═══ ใบที่ 1: S001 จ่ายข้ามให้ทีมกรุงเทพ"
open_order() {
  local id; id=$(POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"ทดสอบจ่ายข้ามทีม\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  POST $S "work-orders/$id/parts" '{"needsParts":false}' >/dev/null
  echo "$id"
}
W1=$(open_order W2)
R=$(POST $S "work-orders/$W1/assign" '{"team":"กรุงเทพ","scheduledAt":"2026-12-01"}')
[ "$(DB "select status||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$W1")" = "AWAITING_CONFIRM|กรุงเทพ" ] \
  && GET $A "work-orders/$W1" | J 'd.logs.find(l=>l.action==="ASSIGNED").note' | grep -q "ข้ามทีม — งานCM ของสาขานี้เป็นของ กระบี่" \
  && pass "จ่ายทีมนอกความดูแลได้ (ฐานข้อมูลเปลี่ยน) · ประวัติบอกว่าข้ามทีม" || fail "จ่ายข้ามทีม: $(echo "$R" | head -c 200)"

D=$(GET $Z "work-orders/$W1")
echo "$D" | J '[d.viewOnly, d.crossTeam&&d.crossTeam.ownTeam, d.crossTeam&&d.crossTeam.assignedTeam, d.crossTeam&&d.crossTeam.watchers.join()].join("|")' \
  | grep -q "^true|กระบี่|กรุงเทพ|หัวหน้าภาคกลางทดสอบข้ามทีม$" \
  && pass "หัวหน้าภาคของทีมที่รับเปิดใบได้ · ดูอย่างเดียว · ใบบอกทีมประจำ/ทีมที่รับ/คนที่เห็น" || fail "detail ทีมที่รับ: $(echo "$D" | head -c 200)"
[ "$(GET $S "work-orders/$W1" | J '[d.viewOnly===undefined, d.supervisors.map(s=>s.name).join()].join("|")')" = "true|$(DB "select name from \"User\" where \"employeeCode\"='S001'")" ] \
  && pass "คนจ่ายยังเป็นเจ้าของใบ (หัวหน้าภาคที่รับผิดชอบ = S001)" || fail "detail คนจ่าย: $(GET $S "work-orders/$W1" | J 'JSON.stringify([d.viewOnly,d.supervisors])')"

POST $A "work-orders/$W1/confirm-appointment" '{}' >/dev/null
CODE1=$(DB "select code from \"WorkOrder\" where id=$W1")
inlist() { GET $1 "work-orders?status=$2&search=$CODE1" | J "d.rows.some(r=>r.id===$W1)"; }
[ "$(inlist $S INBOX)|$(inlist $Z INBOX)|$(inlist $Z ACTIVE)" = "true|false|true" ] \
  && pass "ขั้นปล่อยงาน: เข้ากล่องงานคนจ่าย · ไม่เข้ากล่องงานหัวหน้าภาคทีมที่รับ (แต่อยู่ในรายการ)" \
  || fail "กล่องงาน S=$(inlist $S INBOX) Z=$(inlist $Z INBOX) Z-รายการ=$(inlist $Z ACTIVE)"
ZCOUNT=$(GET $Z work-orders/inbox-count | J 'd.inbox'); ZLIST=$(GET $Z "work-orders?status=INBOX" | J 'd.rows.length+"|"+d.counts.INBOX')
[ "$ZLIST" = "$ZCOUNT|$ZCOUNT" ] && pass "ตัวเลขกล่องงานตรงกับรายการ ($ZCOUNT)" || fail "ตัวเลขกล่องงานไม่ตรง: นับ=$ZCOUNT รายการ|ชิป=$ZLIST"

R=$(POST $Z "work-orders/$W1/dispatch" '{}')
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "ASSIGNED" ] && echo "$R" | grep -q "ดูได้อย่างเดียว" \
  && pass "หัวหน้าภาคทีมที่รับกดปล่อยงานไม่ได้ (บอกว่าดูได้อย่างเดียว · ฐานข้อมูลไม่เปลี่ยน)" || fail "ทีมที่รับปล่อยงานได้: $R"
[ "$(CODEOF $Z PATCH "work-orders/$W1" '{"contactName":"แก้โดยทีมที่รับ"}')|$(CODEOF $Z POST "work-orders/$W1/cancel" '{"reasonCode":"OTHER","note":"ลองยกเลิก"}')" = "403|403" ] \
  && [ "$(DB "select status||'|'||coalesce(\"contactName\",'') from \"WorkOrder\" where id=$W1")" != "CANCELLED|แก้โดยทีมที่รับ" ] \
  && [ "$(DB "select coalesce(\"contactName\",'') from \"WorkOrder\" where id=$W1")" != "แก้โดยทีมที่รับ" ] \
  && pass "หัวหน้าภาคทีมที่รับแก้/ยกเลิกใบไม่ได้" || fail "ทีมที่รับแก้หรือยกเลิกได้"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$W1/attachments" -H "$(H $Z)" -F "file=@tests/site-photo.png;type=image/png")" = "403" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")" = "0" ] \
  && pass "หัวหน้าภาคทีมที่รับแนบไฟล์ไม่ได้" || fail "ทีมที่รับแนบไฟล์ได้"

POST $S "work-orders/$W1/dispatch" '{}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "IN_PROGRESS" ] && pass "คนจ่ายกดปล่อยงานได้" || fail "S001 ปล่อยงานไม่ได้"

echo
echo "═══ ช่าง: ทีมที่รับ vs ทีมประจำสาขา"
tin() { GET $1 "work-orders?status=$2&search=$CODE1" | J "d.rows.some(r=>r.id===$W1)"; }
day() { GET $1 work-orders/my-day | J "d.rows.some(r=>r.id===$W1)"; }
[ "$(tin $K INBOX)|$(day $K)" = "true|true" ] && pass "ทีมที่รับ (กรุงเทพ): ในกล่องงานและงานวันนี้" || fail "ทีมที่รับ: กล่อง=$(tin $K INBOX) วันนี้=$(day $K)"
[ "$(tin $T ACTIVE)|$(tin $T INBOX)|$(day $T)" = "true|false|false" ] \
  && pass "ทีมประจำสาขา (กระบี่): เห็นในรายการ แต่ไม่เข้ากล่องงาน/งานวันนี้" || fail "ทีมประจำ: รายการ=$(tin $T ACTIVE) กล่อง=$(tin $T INBOX) วันนี้=$(day $T)"
[ "$(tin $N ACTIVE)|$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/$W1 -H "$(H $N)")" = "false|403" ] \
  && pass "ช่างทีมอื่นไม่เห็นและเปิดไม่ได้" || fail "ช่างทีมอื่นเห็นใบ"

photos() {
  for role in BEFORE AFTER NAMEPLATE; do
    curl -s -o /dev/null -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@tests/site-photo.png;type=image/png" -F "role=$role"
  done
}
R=$(POST $N "work-orders/$W1/close" "{\"result\":\"FIXED\",\"note\":\"ลองปิด\",\"workerIds\":[$NID]}")
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "IN_PROGRESS" ] && echo "$R" | grep -q "ไม่ใช่ทีมของคุณ" \
  && pass "ช่างทีมอื่นปิดงานไม่ได้" || fail "ช่างทีมอื่นปิดได้: $R"
photos $K $W1
R=$(POST $K "work-orders/$W1/close" "{\"result\":\"FIXED\",\"note\":\"ทีมที่รับเข้าซ่อม\",\"workerIds\":[$KID]}")
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "DONE" ] && pass "ทีมที่รับปิดงานได้" || fail "ทีมที่รับปิดไม่ได้: $(echo "$R" | head -c 200)"

echo
echo "═══ ใบที่ 2: ทีมประจำสาขาเป็นคนปิด"
W2=$(open_order W3)
POST $S "work-orders/$W2/assign" '{"team":"กรุงเทพ","scheduledAt":"2026-12-01"}' >/dev/null
POST $A "work-orders/$W2/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$W2/dispatch" '{}' >/dev/null
photos $T $W2
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W2")" = "3" ] && pass "ทีมประจำสาขาแนบรูปได้" || fail "ทีมประจำสาขาแนบรูปไม่ได้"
R=$(POST $T "work-orders/$W2/close" "{\"result\":\"FIXED\",\"note\":\"ทีมประจำสาขาปิดแทน\",\"workerIds\":[$T1ID]}")
[ "$(DB "select status||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$W2")" = "DONE|กรุงเทพ" ] \
  && pass "ทีมประจำสาขาปิดงานที่จ่ายข้ามไปได้ (ทีมที่รับยังเป็นกรุงเทพ)" || fail "ทีมประจำสาขาปิดไม่ได้: $(echo "$R" | head -c 200)"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
