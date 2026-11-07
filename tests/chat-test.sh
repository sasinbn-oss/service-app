#!/bin/bash
# ทดสอบ: แชทในใบงาน (เจ้าของงานเลือก พ.ย. 69 — GET /work-orders/chats · GET/POST /:id/chat · DELETE /:id/chat/:messageId)
#   · ห้องละหนึ่งใบงาน — ทุกคนที่เปิดใบได้คุยได้ · คนนอกขอบเขตอ่าน/ส่งไม่ได้ · ข้อความไม่ลงประวัติใบงาน
#   · ตัวเลขยังไม่อ่าน: ข้อความของคนอื่นที่ใหม่กว่าที่อ่านล่าสุด · เปิดแชท = อ่านแล้ว · ห้องเรียงตามข้อความล่าสุด
#   · ส่งรูปได้ (ถังไม่เปิดสาธารณะ — ลิงก์ชั่วคราว) · ลบข้อความของตัวเองภายใน 5 นาที (แถวอยู่ ขึ้นว่าลบแล้ว)
#   · ใบปิด/ยกเลิก = อ่านย้อนหลังได้ ส่ง/ลบไม่ได้ · ดูในฐานะคนอื่น = อ่านได้ ไม่นับว่าเขาอ่าน ส่งไม่ได้
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
DC() { curl -s -o /dev/null -w '%{http_code}' -X DELETE "localhost:4000/api/$2" -H "$(H $1)"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)" -H 'Cache-Control: no-cache'; }  # no-cache = ผลสดหลังแก้ข้อมูลตรงในฐานข้อมูล (กระดิ่ง/แชทจำคำตอบ 20 วิ — utils/shortCache.ts)
GC() { curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
A=$(login A001)
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
OTHER=$(DB "select region from \"Branch\" where region is not null and region <> '$REGION' limit 1")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
PNG=$(mktemp --suffix=.png); printf '\x89PNG\r\n\x1a\n' > "$PNG"
IDS=""
# ข้อดูในฐานะช่างเขียนบันทึกดูในฐานะ — ลบตอนจบ ไม่ให้ค้างทุกรอบ
VSTART=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
cleanup() {
  purge_orders "$A" $IDS
  DB "delete from \"ViewAsLog\" where id > $VSTART" >/dev/null
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  rm -f "$PNG"
}
trap cleanup EXIT
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
DB "update \"User\" set region='$OTHER' where \"employeeCode\"='S001'" >/dev/null
T=$(login T001); S=$(login S001)

# ใบที่ปล่อยงานให้ทีมของ T001 แล้ว — ช่างเปิดได้
mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบแชทใบงาน"}]}' | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='$TEAM', \"scheduledAt\"=date_trunc('day', now()) where id=$id" >/dev/null
  echo $id
}
MSGS() { DB "select count(*) from \"WorkOrderMessage\" where \"workOrderId\"=$1"; }
LOGS() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1"; }
UNREAD() { GET $1 work-orders/chats | J "(d.threads.find(t=>t.id==$2)||{unread:'none'}).unread"; }
W1=$(mk); W2=$(mk); IDS="$W1 $W2"
L0=$(LOGS $W1)

echo "═══ ช่างถาม แอดมินตอบ"
R=$(curl -s -X POST localhost:4000/api/work-orders/$W1/chat -H "$(H $T)" -F "body=ใบนี้ต้องเปลี่ยนคอมเพรสเซอร์ไหมครับ")
[ "$(echo "$R" | J 'd.messages.length')" = "1" ] && [ "$(MSGS $W1)" = "1" ] && [ "$(LOGS $W1)" = "$L0" ] \
  && pass "ช่างส่งข้อความได้ (ฐานข้อมูล 1 แถว) · ประวัติใบงานไม่เพิ่ม" || fail "ช่างส่ง: $R · logs $L0→$(LOGS $W1)"
R=$(curl -s -X POST localhost:4000/api/work-orders/$W1/chat -H "$(H $T)" -F "body=   ")
echo "$R" | J 'd.error' | grep -q "พิมพ์ข้อความหรือเลือกรูป" && [ "$(MSGS $W1)" = "1" ] && pass "ข้อความว่างไม่มีรูป: 400 ข้อความไทย" || fail "ข้อความว่าง: $R"
[ "$(UNREAD $A $W1)" = "1" ] && pass "แอดมินเห็นห้องในรายการแชท ยังไม่อ่าน 1" || fail "แอดมินยังไม่อ่าน: $(UNREAD $A $W1)"
[ "$(UNREAD $T $W1)" = "0" ] && pass "ข้อความของตัวเองไม่นับเป็นยังไม่อ่าน" || fail "ของตัวเองนับ: $(UNREAD $T $W1)"
GET $A work-orders/$W1/chat >/dev/null
LAST=$(DB "select max(id) from \"WorkOrderMessage\" where \"workOrderId\"=$W1")
[ "$(UNREAD $A $W1)" = "0" ] && [ "$(DB "select \"lastReadId\" from \"WorkOrderChatRead\" where \"workOrderId\"=$W1 and \"userId\"=(select id from \"User\" where \"employeeCode\"='A001')")" = "$LAST" ] \
  && pass "เปิดแชทแล้วนับว่าอ่าน (อ่านถึงข้อความล่าสุดในฐานข้อมูล)" || fail "เปิดแชทไม่นับว่าอ่าน"
POST $A work-orders/$W1/chat '{"body":"เปลี่ยนครับ อะไหล่ส่งพรุ่งนี้"}' >/dev/null
[ "$(UNREAD $T $W1)" = "1" ] && pass "แอดมินตอบ — ช่างเห็นยังไม่อ่าน 1" || fail "ช่างไม่เห็นคำตอบ: $(UNREAD $T $W1)"
R=$(GET $T work-orders/$W1/chat)
[ "$(echo "$R" | J 'd.messages.length===2 && d.messages[0].id<d.messages[1].id && d.messages.every(m=>m.byName&&m.byRole)')" = "true" ] \
  && pass "ห้องเรียงตามเวลา บอกชื่อ/ตำแหน่งคนส่ง ($(echo "$R" | J 'd.messages.map(m=>m.byName+" ("+m.byRole+")").join(" → ")'))" || fail "ลำดับข้อความ: $R"

echo "═══ ห้องเรียงตามข้อความล่าสุด"
POST $A work-orders/$W2/chat '{"body":"ใบนี้ร้านขอเลื่อน"}' >/dev/null
[ "$(GET $A work-orders/chats | J "d.threads.findIndex(t=>t.id==$W2) < d.threads.findIndex(t=>t.id==$W1)")" = "true" ] && pass "ห้องที่มีข้อความใหม่กว่าขึ้นก่อน" || fail "ลำดับห้อง"
POST $T work-orders/$W1/chat '{"body":"รับทราบครับ"}' >/dev/null
[ "$(GET $A work-orders/chats | J "d.threads[0].id")" = "$W1" ] && pass "ข้อความใหม่ในห้องเก่าดันห้องขึ้นบนสุด" || fail "ห้องไม่ขึ้นบนสุด"

echo "═══ คนนอกขอบเขต"
[ "$(GC $S work-orders/$W1/chat)" = "403" ] && [ "$(GET $S work-orders/chats | J "d.threads.some(t=>t.id==$W1)")" = "false" ] \
  && pass "หัวหน้าภาคนอกพื้นที่อ่านแชทไม่ได้ (403) และไม่เห็นห้องในรายการ" || fail "นอกพื้นที่: $(GC $S work-orders/$W1/chat)"
N=$(MSGS $W1)
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4000/api/work-orders/$W1/chat -H "$(H $S)" -F "body=แอบส่ง")" = "403" ] && [ "$(MSGS $W1)" = "$N" ] \
  && pass "หัวหน้าภาคนอกพื้นที่ส่งไม่ได้ (403) ฐานข้อมูลไม่เพิ่ม" || fail "นอกพื้นที่ส่งได้"

echo "═══ ดูในฐานะช่าง"
U0=$(UNREAD $T $W1)
AV=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token||""')
[ "$(GC $AV work-orders/$W1/chat)" = "200" ] && [ "$(UNREAD $T $W1)" = "$U0" ] && pass "ดูในฐานะช่างอ่านแชทได้ — ตัวเลขยังไม่อ่านของช่างไม่เปลี่ยน ($U0)" || fail "ดูในฐานะนับว่าช่างอ่าน: $U0→$(UNREAD $T $W1)"
[ "$(PC $AV work-orders/$W1/chat '{"body":"ส่งในนามช่าง"}')" = "403" ] && [ "$(MSGS $W1)" = "$N" ] && pass "ดูในฐานะส่งในนามช่างไม่ได้ (403)" || fail "ดูในฐานะส่งได้"
POST $AV auth/view-as/stop '{}' >/dev/null

echo "═══ ส่งรูป"
R=$(curl -s -X POST localhost:4000/api/work-orders/$W1/chat -H "$(H $T)" -F "body=รูปป้ายรุ่น" -F "file=@$PNG;type=image/png" -F "thumbnail=@$PNG;type=image/png")
KEY=$(DB "select coalesce(\"imageKey\",'') from \"WorkOrderMessage\" where \"workOrderId\"=$W1 order by id desc limit 1")
[ "$(echo "$R" | J 'd.messages.at(-1).hasImage')" = "true" ] && [ -n "$KEY" ] && echo "$KEY" | grep -q "^chat/" \
  && pass "ส่งรูปพร้อมข้อความได้ (เก็บในถังโฟลเดอร์ chat/)" || fail "ส่งรูป: $R · key=$KEY"
echo "$R" | J 'd.messages.at(-1).imageUrl' | grep -q "X-Amz-Expires=7200" && pass "รูปเปิดผ่านลิงก์ชั่วคราว 2 ชม. (ไม่ใช่ลิงก์สาธารณะ)" || fail "ลิงก์รูป: $(echo "$R" | J 'd.messages.at(-1).imageUrl')"
TXT=$(mktemp --suffix=.txt); echo hi > "$TXT"
R=$(curl -s -X POST localhost:4000/api/work-orders/$W1/chat -H "$(H $T)" -F "file=@$TXT;type=text/plain"); rm -f "$TXT"
echo "$R" | J 'd.error' | grep -q "เฉพาะไฟล์รูปภาพ" && pass "ไฟล์ที่ไม่ใช่รูป: 400 ข้อความไทย" || fail "ไม่ใช่รูป: $R"

echo "═══ ลบข้อความภายใน 5 นาที"
MID=$(DB "select id from \"WorkOrderMessage\" where \"workOrderId\"=$W1 and \"imageKey\" is not null order by id desc limit 1")
OTHER_MID=$(DB "select id from \"WorkOrderMessage\" where \"workOrderId\"=$W1 and \"userId\"<>$TID order by id desc limit 1")
[ "$(DC $T work-orders/$W1/chat/$OTHER_MID)" = "403" ] && [ "$(DB "select \"deletedAt\" is null from \"WorkOrderMessage\" where id=$OTHER_MID")" = "t" ] \
  && pass "ลบข้อความของคนอื่นไม่ได้ (403)" || fail "ลบของคนอื่นได้"
[ "$(DC $T work-orders/$W1/chat/$MID)" = "200" ] && [ "$(DB "select (\"deletedAt\" is not null)||'|'||(\"imageThumb\" is null) from \"WorkOrderMessage\" where id=$MID")" = "true|true" ] \
  && pass "ลบข้อความของตัวเองได้ — แถวยังอยู่ (deletedAt) รูปย่อถูกล้าง" || fail "ลบของตัวเอง"
R=$(GET $A work-orders/$W1/chat)
[ "$(echo "$R" | J "const m=d.messages.find(m=>m.id==$MID); [m.deleted,m.body,m.hasImage,m.imageUrl].join('|')")" = "true||false|" ] \
  && pass "คนอื่นเห็นว่าลบแล้ว ไม่ได้เนื้อหาหรือรูปเดิม" || fail "ข้อความที่ลบยังส่งเนื้อหา: $(echo "$R" | J "JSON.stringify(d.messages.find(m=>m.id==$MID))")"
OLD_MID=$(DB "select id from \"WorkOrderMessage\" where \"workOrderId\"=$W1 and \"userId\"=$TID and \"deletedAt\" is null order by id limit 1")
DB "update \"WorkOrderMessage\" set \"createdAt\"=now()-interval '6 minutes' where id=$OLD_MID" >/dev/null
[ "$(DC $T work-orders/$W1/chat/$OLD_MID)" = "409" ] && [ "$(DB "select \"deletedAt\" is null from \"WorkOrderMessage\" where id=$OLD_MID")" = "t" ] \
  && pass "เลย 5 นาทีลบไม่ได้ (409)" || fail "เลย 5 นาทียังลบได้"

echo "═══ ใบปิดแล้ว"
FRESH=$(DB "select id from \"WorkOrderMessage\" where \"workOrderId\"=$W1 and \"userId\"=$TID and \"deletedAt\" is null order by id desc limit 1")
DB "update \"WorkOrder\" set status='DONE', \"closedAt\"=now() where id=$W1" >/dev/null
N=$(MSGS $W1)
R=$(POST $T work-orders/$W1/chat '{"body":"ถามต่อหลังปิด"}')
echo "$R" | J 'd.error' | grep -q "ปิดแล้ว" && [ "$(MSGS $W1)" = "$N" ] && pass "ใบปิดแล้วส่งไม่ได้ (409 ข้อความไทย)" || fail "ใบปิดส่งได้: $R"
[ "$(GET $T work-orders/$W1/chat | J '[d.readOnly,d.messages.length>0].join("|")')" = "true|true" ] && pass "ใบปิดแล้วอ่านย้อนหลังได้ (readOnly)" || fail "ใบปิดอ่านย้อนหลังไม่ได้"
[ "$(DC $T work-orders/$W1/chat/$FRESH)" = "409" ] && pass "ใบปิดแล้วลบข้อความไม่ได้ แม้ยังไม่ครบ 5 นาที" || fail "ใบปิดลบข้อความได้"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
