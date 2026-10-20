#!/bin/bash
# ทดสอบ: ลดจุดที่ผู้ใช้งง (เจ้าของงานเลือก ต.ค. 69)
#   · ไม่ใช้อะไหล่ + จ่ายงานในฟอร์มเดียว → แอดมินคอนเฟิร์มลูกค้าเลย (มีค่าบริการ/ทีมไม่รู้จัก = ปฏิเสธ)
#   · กล่องงานแอดมิน: ใบที่รอหัวหน้าภาคแต่ไม่มีใครดูแลภาคนั้น ("ไม่มีคนรับ") · ใบเลยนัดยังไม่คอนเฟิร์ม ("เลยนัด")
#   · ชื่อขั้น "ใคร · ทำอะไร" + ชื่อเมื่อผ่านแล้ว ส่งให้แอป
# ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAMS=$(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'"); TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION',''), \"supervisedTeams\"=string_to_array(nullif('$OLD_TEAMS',''),',') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION', \"supervisedTeams\"='{}' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
mk() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"W$2\",\"symptom\":\"ทดสอบลดขั้น\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
ST() { DB "select status||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::date::text,'-')||'|'||coalesce(\"scheduledTime\",'-')||'|'||coalesce(\"appointmentStatus\",'-') from \"WorkOrder\" where id=$1"; }

echo "═══ ไม่ใช้อะไหล่ + จ่ายงานในฟอร์มเดียว"
W=$(mk C0006 61); IDS="$W"
[ "$(CODE -X POST localhost:4000/api/work-orders/$W/parts -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false,"assign":{"team":"ทีมที่ไม่มีจริง","scheduledAt":"2026-12-01"}}')" = "404" ] \
  && [ "$(ST $W)" = "NEW|-|-|-|-" ] && pass "ทีมที่ไม่มีในระบบ: 404 ฐานข้อมูลไม่เปลี่ยน" || fail "ทีมปลอมผ่าน: $(ST $W)"
[ "$(CODE -X POST localhost:4000/api/work-orders/$W/parts -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"needsParts\":false,\"services\":[{\"name\":\"ค่าแรง\"}],\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-12-01\"}}")" = "400" ] \
  && [ "$(ST $W)" = "NEW|-|-|-|-" ] && pass "มีค่าบริการ (ต้องเสนอราคาก่อน) จ่ายงานพร้อมกันไม่ได้: 400" || fail "มีค่าบริการก็จ่ายได้: $(ST $W)"
POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-12-01\",\"scheduledTime\":\"10:00\"}}" >/dev/null
[ "$(ST $W)" = "AWAITING_CONFIRM|$TEAM|2026-12-01|10:00|PENDING" ] && pass "ไปรอแอดมินคอนเฟิร์มลูกค้าทันที พร้อมทีม วัน เวลา" || fail "หลังจ่าย: $(ST $W)"
[ "$(DB "select string_agg(action||'>'||status, ',' order by id) from \"WorkOrderLog\" where \"workOrderId\"=$W and action in ('NO_PARTS','ASSIGNED')")" = "NO_PARTS>PARTS_CHECKED,ASSIGNED>AWAITING_CONFIRM" ] \
  && pass "ประวัติสองแถว (ไม่ใช้อะไหล่ · จ่ายงาน) แถบขั้นตอนจึงขึ้นว่าผ่านขั้นจ่ายงานแล้ว" || fail "ประวัติ: $(DB "select string_agg(action||'>'||status, ',') from \"WorkOrderLog\" where \"workOrderId\"=$W")"
W2=$(mk C0006 62); IDS="$IDS $W2"
POST $S work-orders/$W2/parts '{"needsParts":false}' >/dev/null
[ "$(ST $W2)" = "PARTS_CHECKED|-|-|-|-" ] && pass "ไม่ส่งทีมมา = ไปรอจ่ายงานตามเดิม" || fail "แบบเดิม: $(ST $W2)"

echo "═══ กล่องงานแอดมิน: ไม่มีคนรับ · เลยนัด"
# C0001 อยู่ภาคที่ไม่มีหัวหน้าภาคดูแล (S001 ดูแลภาคใต้เท่านั้น)
[ "$(DB "select count(*) from \"User\" where role='SUPERVISOR' and \"deletedAt\" is null and (region=(select region from \"Branch\" where code='C0001') or 'กรุงเทพ'=any(\"supervisedTeams\"))")" = "0" ] \
  || fail "เตรียมข้อมูล: มีหัวหน้าภาคดูแลภาคของ C0001"
O=$(mk C0001 63); IDS="$IDS $O"
INB=$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $A)")
[ "$(echo "$INB" | J "const r=d.rows.find(x=>x.id===$O); !!r && r.orphan===true")" = "true" ] \
  && pass "ใบรอหัวหน้าภาคที่ไม่มีใครดูแล อยู่ในกล่องงานแอดมิน ติด orphan" || fail "ไม่อยู่ในกล่องแอดมิน"
[ "$(echo "$INB" | J "d.rows.some(x=>x.id===$W2)")" = "false" ] && pass "ใบรอหัวหน้าภาคที่มีคนดูแล ไม่อยู่ในกล่องแอดมิน" || fail "ใบมีเจ้าของหลุดมากล่องแอดมิน"
[ "$(curl -s localhost:4000/api/work-orders/inbox-count -H "$(H $A)" | J 'd.inbox')" = "$(echo "$INB" | J 'd.rows.length')" ] \
  && pass "ตัวเลขกล่องงานหน้าแรกนับใบไม่มีคนรับด้วย" || fail "ตัวเลขกล่องงานไม่ตรงรายการ"
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J "d.rows.some(x=>x.id===$O)")" = "false" ] \
  && pass "หัวหน้าภาคภาคอื่นไม่เห็นใบนี้ในกล่องตัวเอง" || fail "หลุดไปกล่องหัวหน้าภาค"
DB "update \"WorkOrder\" set \"scheduledAt\"=(now() - interval '3 days')::date where id=$W" >/dev/null
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $A)" | J "const r=d.rows.find(x=>x.id===$W); !!r && r.overdue===true")" = "true" ] \
  && pass "วันนัดผ่านไปแล้วยังไม่คอนเฟิร์ม: ติด overdue" || fail "ไม่ติดเลยนัด"
DB "update \"WorkOrder\" set \"scheduledAt\"=(now() + interval '3 days')::date where id=$W" >/dev/null
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $A)" | J "d.rows.find(x=>x.id===$W).overdue")" = "false" ] \
  && pass "นัดยังไม่ถึง: ไม่ติด overdue" || fail "ติดเลยนัดทั้งที่ยังไม่ถึง"

echo "═══ ชื่อขั้น"
OPT=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)")
[ "$(echo "$OPT" | J 'const s=d.stages.find(x=>x.value==="ASSIGNED"); [s.label,s.action,s.doneLabel].join("|")')" = "หัวหน้าภาค · รับทราบ ปล่อยงาน|รับทราบ ปล่อยงาน|ปล่อยงานแล้ว" ] \
  && pass "ขั้นมีชื่อ ใคร · ทำอะไร / การกระทำ / ชื่อเมื่อผ่านแล้ว" || fail "ชื่อขั้น: $(echo "$OPT" | J 'JSON.stringify(d.stages.find(x=>x.value==="ASSIGNED"))')"
[ "$(echo "$OPT" | J 'd.stages.every(s=>s.doneLabel && !s.doneLabel.startsWith("รอ") && !s.label.startsWith("รอ"))')" = "true" ] \
  && pass "ไม่มีขั้นไหนขึ้นต้นด้วย \"รอ…\" แล้ว" || fail "ยังมีชื่อขั้นแบบรอ…"

[ -z "$FAILED" ]
