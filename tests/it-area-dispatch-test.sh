#!/bin/bash
# ทดสอบ: หัวหน้าภาคตามพื้นที่นัดวัน/ปล่อยงานใบ IT ในพื้นที่ตัวเองได้ (เจ้าของงานตัดสิน 6 พ.ย. 69 — "หัวหน้าภาคก็จ่ายงานไอทีได้เหมือนกัน"
#   · "กรณีงาน IT ที่เป็นทีมที่อยู่ต่างจังหวัดจะจ่ายให้ทีมที่ดูแลได้ด้วย")
#   · ขั้นจ่ายงาน (IT_AREA_DISPATCH_STAGES): นัดวันเข้า PARTS_CHECKED · ปล่อยงาน ASSIGNED · ส่งช่างตรวจ INSPECT_DISPATCH
#   · หน้าใบงานบอก itDispatch (ยังดูอย่างเดียว ปุ่มขั้นจ่ายงานขึ้นในกล่องใบ IT) · ใบยังไม่เข้ากล่องงานของหัวหน้าภาคพื้นที่ (ยังรอคนดูแลงาน IT)
#   · ปฏิเสธ: ใบ IT นอกพื้นที่ · ขั้นอื่นของใบ IT ในพื้นที่ · เลื่อนวันนัด (ของแอดมิน/คนดูแลงาน IT)
#   · คนดูแลงาน IT จ่ายใบ IT ต่างจังหวัดให้ทีมที่ดูแลสาขานั้นได้ (ตัวเลือกทีมมีทีมนั้น · ฐานข้อมูลบันทึกทีมนั้น)
# ทุกข้อเช็คที่ฐานข้อมูลด้วย · ล้างใบ/ผู้ใช้ที่สร้าง และคืนภาค/ธงหัวหน้า IT
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
OUT=$(mktemp)
CODE() { curl -s -o $OUT -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GETC() { curl -s -o $OUT -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
BODY() { J "$1" < $OUT; }
HAS() { curl -s "localhost:4000/api/work-orders?status=$2" -H "$(H $1)" | node -pe "JSON.parse(require('fs').readFileSync(0)).rows.some(r=>r.id===$3)?'มี':'ไม่มี'"; }
ST() { DB "select status||'|'||coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$1"; }
LASTLOG() { DB "select action||'|'||coalesce(\"userId\"::text,'-') from \"WorkOrderLog\" where \"workOrderId\"=$1 order by id desc limit 1"; }
DAY() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }

A=$(login A001)
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
OLD_LEADS=$(DB "select coalesce(string_agg(id::text, ','),'') from \"User\" where \"itLead\"")
SUF=$RANDOM
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "update \"User\" set \"itLead\"=false where \"itLead\";
      delete from \"User\" where \"employeeCode\"='ZIDL$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  [ -n "$OLD_LEADS" ] && DB "update \"User\" set \"itLead\"=true where id in ($OLD_LEADS)" >/dev/null
  rm -f $OUT
}
trap cleanup EXIT

# BR_S = สาขาภาคใต้ (พื้นที่ของ S001) · BR_C = สาขาภาคอื่น (ภาคของหัวหน้า IT ทดสอบ)
BR_S=$(DB "select code from \"Branch\" where code='C0006'")
REG_S=$(DB "select region from \"Branch\" where code='C0006'")
TEAM_S=$(DB "select zone from \"Branch\" where code='C0006'")
BR_C=$(DB "select code from \"Branch\" where region is not null and region<>'$REG_S' and zone is not null and \"cancelledAt\" is null order by code limit 1")
REG_C=$(DB "select region from \"Branch\" where code='$BR_C'")
TEAM_C=$(DB "select zone from \"Branch\" where code='$BR_C'")
[ -n "$BR_C" ] && [ -n "$TEAM_S" ] || { echo "FAIL ไม่มีสาขาทดสอบสองภาค (ต้องรัน seed:test)"; exit 1; }
DB "update \"User\" set region='$REG_S' where id=$SID" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "update \"User\" set \"itLead\"=false where \"itLead\";
    insert into \"User\"(\"employeeCode\",name,role,region,\"passwordHash\",\"mustChangePassword\",\"itLead\") values
    ('ZIDL$SUF','หัวหน้าไอทีทดสอบจ่ายงาน','SUPERVISOR','$REG_C','$HASH',false,true)" >/dev/null
S=$(login S001); L=$(login ZIDL$SUF)

newwo() {  # $1 สาขา · $2 ประเภทงาน · $3 สถานะ (SQL)
  local W; W=$(POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"$2\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W81\",\"symptom\":\"ทดสอบหัวหน้าภาคจ่ายงาน IT\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='$3', \"needsParts\"=false where id=$W" >/dev/null
  echo "$W"
}
IT1=$(newwo $BR_S IT PARTS_CHECKED); IT2=$(newwo $BR_S IT INSPECT_DISPATCH); IT3=$(newwo $BR_C IT PARTS_CHECKED)
IT4=$(newwo $BR_S IT AWAITING_QUOTE); IT5=$(newwo $BR_S IT PARTS_CHECKED); CM1=$(newwo $BR_S CM PARTS_CHECKED)
IDS="$IT1 $IT2 $IT3 $IT4 $IT5 $CM1"
DB "update \"WorkOrder\" set \"assignedTeam\"='$TEAM_S', \"scheduledAt\"=date_trunc('day', now())+interval '3 days', \"appointmentStatus\"='CONFIRMED' where id=$IT2" >/dev/null

echo "═══ หน้าใบงานบอกว่านัดวัน/ปล่อยงานได้"
GC=$(GETC $S work-orders/$IT1)
[ "$GC|$(BODY '[d.viewOnly,d.itDispatch].join(",")')" = "200|true,true" ] && pass "ใบ IT ในพื้นที่ขั้นรอนัดวัน: ดูอย่างเดียว + itDispatch" || fail "IT1 detail: $GC $(BODY 'JSON.stringify([d.viewOnly,d.itDispatch])')"
GETC $S work-orders/$IT4 >/dev/null
[ "$(BODY 'd.itDispatch===undefined')" = "true" ] && pass "ขั้นอื่น (ส่งใบเสนอราคา) ไม่มี itDispatch" || fail "IT4 มี itDispatch"
GETC $S work-orders/$CM1 >/dev/null
[ "$(BODY '[d.viewOnly===undefined,d.itDispatch===undefined].join(",")')" = "true,true" ] && pass "ใบ CM ของตัวเองเหมือนเดิม (ไม่มีธงดูอย่างเดียว/itDispatch)" || fail "CM1 ธงผิด"
[ "$(HAS $S INBOX $IT1)|$(HAS $L INBOX $IT1)" = "ไม่มี|มี" ] && pass "ใบ IT ขั้นรอนัดวันยังอยู่ในกล่องคนดูแลงาน IT ไม่เข้ากล่องหัวหน้าภาคพื้นที่" || fail "กล่องงาน: S=$(HAS $S INBOX $IT1) L=$(HAS $L INBOX $IT1)"

echo "═══ หัวหน้าภาคพื้นที่นัดวันเข้า → ปล่อยงาน"
C=$(CODE $S work-orders/$IT1/assign "{\"team\":\"$TEAM_S\",\"scheduledAt\":\"$(DAY 5)\"}")
[ "$C" = "200" ] && [ "$(DB "select (status in ('AWAITING_CONFIRM','PARTS_REQUESTED'))||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$IT1")" = "true|$TEAM_S" ] && [ "$(LASTLOG $IT1)" = "ASSIGNED|$SID" ] \
  && pass "นัดวันเข้าใบ IT ในพื้นที่ได้ (ฐานข้อมูล: $(ST $IT1) · ประวัติ ASSIGNED โดย S001)" || fail "assign: $C $(BODY 'd.error') · $(ST $IT1)"
DB "update \"WorkOrder\" set status='ASSIGNED', \"appointmentStatus\"='CONFIRMED' where id=$IT1" >/dev/null
GETC $S work-orders/$IT1 >/dev/null
[ "$(BODY 'd.itDispatch')" = "true" ] && pass "ขั้นรอปล่อยงานยังมี itDispatch" || fail "ASSIGNED ไม่มี itDispatch"
C=$(CODE $S work-orders/$IT1/dispatch "{\"team\":\"$TEAM_S\"}")
[ "$C|$(ST $IT1)|$(LASTLOG $IT1)" = "200|IN_PROGRESS|$TEAM_S|DISPATCHED|$SID" ] && pass "ปล่อยงานใบ IT ในพื้นที่ได้ (ฐานข้อมูล IN_PROGRESS · ประวัติ DISPATCHED โดย S001)" || fail "dispatch: $C $(BODY 'd.error') · $(ST $IT1) · $(LASTLOG $IT1)"
C=$(CODE $S work-orders/$IT2/dispatch "{\"team\":\"$TEAM_S\"}")
[ "$C|$(DB "select status from \"WorkOrder\" where id=$IT2")" = "200|INSPECTING" ] && pass "ส่งช่างตรวจใบ IT ในพื้นที่ได้ (ฐานข้อมูล INSPECTING)" || fail "inspect dispatch: $C $(BODY 'd.error')"

echo "═══ ปฏิเสธ"
C=$(CODE $S work-orders/$IT3/assign "{\"team\":\"$TEAM_C\",\"scheduledAt\":\"$(DAY 5)\"}")
[ "$C|$(ST $IT3)" = "403|PARTS_CHECKED|-" ] && pass "ใบ IT นอกพื้นที่นัดวันไม่ได้ (403 · ฐานข้อมูลไม่เปลี่ยน)" || fail "นอกพื้นที่: $C $(ST $IT3)"
C=$(CODE $S work-orders/$IT4/quote '{"skip":true,"note":"ทดสอบข้ามขั้น"}')
[ "$C|$(DB "select status from \"WorkOrder\" where id=$IT4")" = "403|AWAITING_QUOTE" ] && BODY 'd.error' | grep -q "นัดวันเข้า/ปล่อยงาน" \
  && pass "ขั้นอื่นของใบ IT ในพื้นที่ยังกดไม่ได้ (403 บอกว่าทำอะไรได้)" || fail "ขั้นอื่น: $C $(BODY 'd.error')"
DB "update \"WorkOrder\" set status='ASSIGNED', \"assignedTeam\"='$TEAM_S', \"scheduledAt\"=date_trunc('day', now())+interval '4 days', \"appointmentStatus\"='CONFIRMED' where id=$IT5" >/dev/null
C=$(CODE $S work-orders/$IT5/reschedule "{\"scheduledAt\":\"$(DAY 8)\"}")
[ "$C|$(DB "select (\"scheduledAt\"::date - current_date) from \"WorkOrder\" where id=$IT5")" = "403|4" ] && pass "เลื่อนวันนัดยังเป็นของแอดมิน/คนดูแลงาน IT (403)" || fail "reschedule: $C"

echo "═══ คนดูแลงาน IT จ่ายใบต่างจังหวัดให้ทีมที่ดูแล"
DB "update \"WorkOrder\" set status='PARTS_CHECKED', \"assignedTeam\"=null, \"scheduledAt\"=null, \"appointmentStatus\"=null where id=$IT5" >/dev/null
[ "$(curl -s localhost:4000/api/work-orders/options -H "$(H $L)" | J "(d.teams.find(t=>t.name==='$TEAM_S')||{}).mine")" = "false" ] \
  && pass "ตัวเลือกทีมของคนดูแลงาน IT มีทีม $TEAM_S (ทีมของพื้นที่อื่น)" || fail "ตัวเลือกทีมไม่มี $TEAM_S"
C=$(CODE $L work-orders/$IT5/assign "{\"team\":\"$TEAM_S\",\"scheduledAt\":\"$(DAY 5)\"}")
[ "$C" = "200" ] && [ "$(DB "select \"assignedTeam\" from \"WorkOrder\" where id=$IT5")" = "$TEAM_S" ] \
  && pass "คนดูแลงาน IT (ภาค$REG_C) จ่ายใบ IT ภาค$REG_S ให้ $TEAM_S ได้ (ฐานข้อมูล)" || fail "IT lead assign: $C $(BODY 'd.error')"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
