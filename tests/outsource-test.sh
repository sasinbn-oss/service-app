#!/bin/bash
# ทดสอบ: ทีม outsource (เจ้าของงานเพิ่ม ต.ค. 69) — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ ช่างไม่มีบัญชีในแอป
#   · แอดมินเพิ่ม/ลบรายชื่อได้ (ชื่อซ้ำทีมที่ดูแลสาขา = 409 · มีใบค้าง = ลบไม่ได้) · หัวหน้าภาคเพิ่มไม่ได้
#   · ขึ้นในตัวเลือกจ่ายงานพร้อมป้าย outsource · จ่ายงานให้ได้แม้ไม่มีสาขา
#   · หัวหน้าภาคในพื้นที่ปิดงานแทนได้ · หัวหน้าภาคนอกพื้นที่/ช่างทีมอื่นไม่ได้ · ใบที่เข้างานอยู่เข้ากล่องหัวหน้าภาค
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
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
D1=$(day 34)
A=$(login A001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'"); BTEAM=$(DB "select zone from \"Branch\" where code='C0006'")
OS=ZZOS$RANDOM
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"OutsourceTeam\" where name like 'ZZOS%' or name='$BTEAM'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
ST() { DB "select status||'|'||coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$1"; }

echo "═══ รายชื่อทีม outsource"
[ "$(DB "select string_agg(name, ',' order by name) from \"OutsourceTeam\" where name in ('PWS','SPK','TBL','COB','STM')")" = "COB,PWS,SPK,STM,TBL" ] \
  && pass "ห้าทีมที่เจ้าของงานแจ้ง (PWS SPK TBL COB STM) อยู่ในฐานข้อมูลจาก migration" || fail "ทีมตั้งต้นไม่ครบ"
[ "$(PC $S teams/outsource "{\"name\":\"$OS\"}")" = "403" ] && [ "$(DB "select count(*) from \"OutsourceTeam\" where name='$OS'")" = "0" ] \
  && pass "หัวหน้าภาคเพิ่มไม่ได้ (403)" || fail "หัวหน้าภาคเพิ่มได้"
# ทีมที่ดูแลสาขาอยู่ก็เป็น outsource ได้ (เช่น PWS ดูแลสาขาประจำ) — ติดป้ายตอนจ่ายงาน และยังอยู่ในรายการทีมปกติ
[ "$(PC $A teams/outsource "{\"name\":\"$BTEAM\"}")" = "201" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/options -H "$(H $S)" | J "d.teams.filter(x=>x.name===\"$BTEAM\").map(x=>x.outsource===true&&x.branches>0).join()")" = "true" ] \
  && [ "$(curl -s localhost:4000/api/teams -H "$(H $A)" | J "d.teams.some(t=>t.name===\"$BTEAM\"&&t.cmBranches>0)")" = "true" ] \
  && pass "ทีมที่ดูแลสาขาเป็น outsource ได้: ติดป้าย (ชื่อเดียวไม่ซ้ำ) และยังอยู่ในรายการทีมปกติพร้อมจำนวนสาขา" || fail "ทีมสาขาที่เป็น outsource ไม่ถูก"
DB "delete from \"OutsourceTeam\" where name='$BTEAM'" >/dev/null
[ "$(PC $A teams/outsource "{\"name\":\"  $OS \"}")" = "201" ] && [ "$(DB "select count(*) from \"OutsourceTeam\" where name='$OS'")" = "1" ] \
  && pass "แอดมินเพิ่มได้ (ตัดช่องว่าง)" || fail "เพิ่มไม่ได้"
[ "$(PC $A teams/outsource "{\"name\":\"$OS\"}")" = "409" ] && pass "เพิ่มซ้ำ: 409" || fail "เพิ่มซ้ำได้"
[ "$(curl -s localhost:4000/api/work-orders/options -H "$(H $S)" | J "const t=d.teams.find(x=>x.name===\"$OS\"); !!t && t.outsource===true")" = "true" ] \
  && pass "ขึ้นในตัวเลือกจ่ายงานพร้อมป้าย outsource" || fail "ไม่ขึ้นในตัวเลือก"
[ "$(curl -s localhost:4000/api/teams -H "$(H $A)" | J "d.outsource.some(o=>o.name===\"$OS\") && !d.teams.some(t=>t.name===\"$OS\")")" = "true" ] \
  && pass "หน้าทีมช่างแสดงแยกในส่วน outsource ไม่ปนกับทีมสาขา" || fail "หน้าทีมช่างไม่ถูก"

echo "═══ จ่ายงานให้ทีม outsource"
W=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W64","symptom":"ทดสอบ outsource"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$W"
POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$OS\",\"scheduledAt\":\"$D1\"}}" >/dev/null
[ "$(ST $W)" = "AWAITING_CONFIRM|$OS" ] && pass "จ่ายงานให้ทีม outsource ได้ (ไม่มีสาขาประจำ)" || fail "จ่ายไม่ได้: $(ST $W)"
POST $A work-orders/$W/confirm-appointment '{}' >/dev/null
POST $S work-orders/$W/dispatch '{}' >/dev/null
[ "$(ST $W)" = "IN_PROGRESS|$OS" ] && pass "ปล่อยงานแล้ว — ทีม outsource เข้างาน" || fail "ปล่อยงาน: $(ST $W)"
[ "$(curl -s localhost:4000/api/work-orders/$W -H "$(H $S)" | J 'd.assignedOutsource')" = "true" ] && pass "ใบงานบอกว่าเป็นทีม outsource" || fail "ไม่มีธง outsource"
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J "d.rows.some(r=>r.id===$W)")" = "true" ] \
  && pass "ใบที่ทีม outsource เข้างานอยู่ เข้ากล่องงานหัวหน้าภาค (ต้องปิดแทน)" || fail "ไม่อยู่ในกล่องหัวหน้าภาค"
# แท็บ "ทีม outsource" ของกล่องงานหัวหน้าภาคแยกจากธงนี้ — ใบทีมปกติต้องไม่ติด
W2=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W65","symptom":"ทดสอบทีมปกติ"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$IDS $W2"
POST $S work-orders/$W2/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$BTEAM\",\"scheduledAt\":\"$D1\"}}" >/dev/null
LIST=$(curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $S)")
[ "$(echo "$LIST" | J "[d.rows.find(r=>r.id===$W).outsource, d.rows.find(r=>r.id===$W2).outsource].join()")" = "true,false" ] \
  && [ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$W2")" = "$BTEAM" ] \
  && pass "รายการใบงานติดธง outsource เฉพาะใบที่จ่ายให้ทีม outsource (ใบทีมปกติไม่ติด)" || fail "ธง outsource ในรายการ: $(echo "$LIST" | J "JSON.stringify(d.rows.filter(r=>[$W,$W2].includes(r.id)).map(r=>[r.id,r.outsource]))")"

echo "═══ ปิดงานแทน"
CLOSE="{\"result\":\"FIXED\",\"note\":\"outsource ซ่อมเสร็จ\",\"otherWorkers\":\"ทีม outsource\",\"subTeam\":\"$OS\"}"
[ "$(PC $T work-orders/$W/close "$CLOSE")" = "403" ] && [ "$(ST $W)" = "IN_PROGRESS|$OS" ] && pass "ช่างทีมอื่นปิดไม่ได้ (403)" || fail "ช่างทีมอื่นปิดได้"
DB "update \"User\" set region='ภาคที่ไม่ใช่ของสาขานี้' where \"employeeCode\"='S001'" >/dev/null
[ "$(PC $S work-orders/$W/close "$CLOSE")" = "403" ] && [ "$(ST $W)" = "IN_PROGRESS|$OS" ] && pass "หัวหน้าภาคนอกพื้นที่ปิดไม่ได้" || fail "หัวหน้าภาคนอกพื้นที่ปิดได้"
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
[ "$(CODE -X DELETE localhost:4000/api/teams/outsource/$(DB "select id from \"OutsourceTeam\" where name='$OS'") -H "$(H $A)")" = "409" ] \
  && pass "ยังมีใบค้าง ลบทีมไม่ได้ (409)" || fail "ลบทีมที่มีใบค้างได้"
# รูปก่อน/หลังซ่อมยังบังคับเหมือนเดิม — หัวหน้าภาคแนบรูปที่ทีม outsource ส่งมาเอง
for r in NAMEPLATE BEFORE AFTER; do
  curl -s -X POST "localhost:4000/api/work-orders/$W/attachments" -H "$(H $S)" -F "file=@$(dirname "$0")/site-photo.png;type=image/png" -F "role=$r" >/dev/null
done
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W and role in ('BEFORE','AFTER')")" = "2" ] \
  && pass "หัวหน้าภาคแนบรูปก่อน/หลังซ่อมแทนได้" || fail "แนบรูปไม่ได้"
R=$(POST $S work-orders/$W/close "$CLOSE")
DONE=$(DB "select status from \"WorkOrder\" where id=$W")
[ "$DONE" = "DONE" ] || [ "$DONE" = "CLAIM_REVIEW" ] && [ "$(DB "select \"closeOtherWorkers\"||'|'||(\"closedById\"=(select id from \"User\" where \"employeeCode\"='S001'))::text from \"WorkOrder\" where id=$W")" = "ทีม outsource|true" ] \
  && pass "หัวหน้าภาคในพื้นที่ปิดงานแทนทีม outsource ได้ (ฐานข้อมูลบันทึกคนปิด)" || fail "ปิดแทนไม่ได้: $DONE $(echo "$R" | head -c 200)"
[ "$(CODE -X DELETE localhost:4000/api/teams/outsource/$(DB "select id from \"OutsourceTeam\" where name='$OS'") -H "$(H $A)")" = "204" ] \
  && [ "$(DB "select count(*) from \"OutsourceTeam\" where name='$OS'")" = "0" ] && pass "ไม่มีใบค้างแล้ว ลบได้" || fail "ลบไม่ได้"

[ -z "$FAILED" ]
