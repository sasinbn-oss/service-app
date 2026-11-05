#!/bin/bash
# ทดสอบ: ถังขยะใบงาน (เจ้าของงานตัดสิน 4 พ.ย. 69 — ลบใบงาน = ย้ายไปถังขยะ กู้คืนได้ 30 วัน แล้วระบบลบจริงพร้อมรูป/วิดีโอ)
#   · ต้องมีเหตุผล: แอปรุ่นเก่า (DELETE เปล่า) ได้ 400 ภาษาไทยลงท้าย "กดปุ่ม “อัปเดต”" · "อื่น ๆ" ต้องพิมพ์ · เหตุผลมั่วไม่ได้
#     · ช่าง/หัวหน้าภาค 403 · ทุกข้อฐานข้อมูลไม่เปลี่ยน
#   · ย้ายแล้ว: แถวยังอยู่ (deletedAt · เหตุผล · คนลบ · ขั้นเดิม) + ประวัติ TRASHED · หายจากรายการ ค้นหา /locate
#     เตือนใบซ้ำของสาขา รายงานอะไหล่หมด รายงานผู้เปิด บอร์ดแผนงาน · หน้าใบงาน 404 "ใบงานนี้อยู่ในถังขยะ"
#   · แก้ใบในถังไม่ได้ (แก้ไข · ยกเลิก · ระบุอะไหล่ · แนบไฟล์ · ดูไฟล์) 404 — ฐานข้อมูลไม่เปลี่ยน · ลบซ้ำ 404
#   · หน้าถังขยะ: ค้นเลข/คนลบ · ช่อง (ขั้นก่อนลบ เหตุผล ไฟล์ เหลือ 30 วัน) · ตัวเลขข้างเมนูใน inbox-count (แอดมินเท่านั้น)
#     · หัวหน้าภาค / Admin Spare Part 403 · ปุ่มลบถาวรเฉพาะ Super Admin (canPurgeNow)
#   · กู้คืน: ขั้นเดิม อะไหล่ ไฟล์แนบ ครบ · ประวัติ TRASHED แล้ว RESTORED · กลับเข้ารายการ/รายงาน · บอกใบค้างของเครื่องเดียวกัน
#     · กู้ใบที่ไม่อยู่ในถัง 404 · หัวหน้าภาค 403
#   · ลบถาวรตอนนี้: แอดมิน 403 (แถวยังอยู่) · ใบที่ยังไม่อยู่ในถัง 409 · Super Admin ลบได้ แถว ลูก และไฟล์ในที่เก็บไฟล์หายจริง
#   · ครบ 30 วัน: ย้อนเวลาเป็น 31 วัน → เปิดถังขยะแล้วหายจริง (พร้อมไฟล์) · 29 วันยังอยู่ (เหลือ 1 วัน)
#   · เลขใบงานไม่ถูกใช้ซ้ำ (ใบใหม่หลังลบจริงได้เลขใหม่)
#   · อีกโปรเซสเปลี่ยนถังขยะ (SQL ตรง = deploy ซ้อน/Fly สองเครื่อง/กู้ไฟล์สำรอง): กู้คืนจากที่อื่น → เปิด/แก้ได้ทันที ไม่รอรอบโหลด
#     60 วินาที · ย้ายไปถังจากที่อื่น → แก้ไม่ได้ทันที (ฐานข้อมูลไม่เปลี่ยน) · หน้าใบงาน /version ไฟล์แนบ 404 · ใช้รถผูกใบนั้นไม่ได้
# ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md) · ต้องมีที่เก็บไฟล์จำลอง (tests/mock-s3.js) แบบเทสต์ไฟล์แนบอื่น
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
# DEL tok id body → "รหัส|ข้อความ" · body ว่าง = แอปรุ่นเก่า (ไม่ส่งอะไรเลย)
DEL() {
  local out
  if [ -n "$3" ]; then
    out=$(curl -s -w '\n%{http_code}' -X DELETE "localhost:4000/api/work-orders/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3")
  else
    out=$(curl -s -w '\n%{http_code}' -X DELETE "localhost:4000/api/work-orders/$2" -H "$(H $1)")
  fi
  echo "$(echo "$out" | tail -1)|$(echo "$out" | sed '$d' | J 'd.error??""')"
}
CODEOF() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
MOCK="${STORAGE_ENDPOINT:-http://127.0.0.1:9100}/${STORAGE_BUCKET:-service-app}"
SUF=$RANDOM

A=$(login A001); S=$(login S001); T=$(login T001)
# สาขาของชุดนี้เอง ไม่มีใบค้าง — เตือนใบซ้ำนับได้ตรง ๆ · เครื่อง W7x ที่เปิดใบสร้างอยู่ในสาขานี้ ลบไปพร้อมสาขาตอนจบ
# (รุ่นแรกหาสาขาที่ไม่มีใบค้างในฐาน — ฐานทดสอบที่ใช้กันอยู่ทุกสาขามีใบค้าง ชุดนี้จึงไม่เคยได้รันเลย และเครื่องที่สร้างค้างในสาขาจริง)
# ภาค/ทีมยืมของ C0001 — ทีมต้องมีจริง (บอร์ดแผนงานจัดตามทีม)
BR="ZTR$SUF"
ZONE=$(DB "select zone from \"Branch\" where code='C0001'")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "delete from \"UsageSlot\" where \"userId\" in (select id from \"User\" where \"employeeCode\" in ('ZTS$SUF','ZTP$SUF'));
      delete from \"User\" where \"employeeCode\" in ('ZTS$SUF','ZTP$SUF');
      delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$BR');
      delete from \"Branch\" where code='$BR'" >/dev/null
}
trap cleanup EXIT
DB "insert into \"Branch\"(code,name,region,zone,\"pmTeam\",ownership) select '$BR','สาขาทดสอบถังขยะ',region,zone,\"pmTeam\",ownership from \"Branch\" where code='C0001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZTS$SUF','ซุปเปอร์ทดสอบถังขยะ','SUPER_ADMIN','$HASH',false), ('ZTP$SUF','อะไหล่ทดสอบถังขยะ','PARTS_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZTS$SUF); PA=$(login ZTP$SUF)
newwo() {
  local id
  id=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"$1\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบถังขยะ $SUF $1\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  IDS="$IDS $id"
  echo "$id"
}
codeof() { DB "select code from \"WorkOrder\" where id=$1"; }
trashed() { DB "select (\"deletedAt\" is not null)::text from \"WorkOrder\" where id=$1"; }
logs() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1"; }

# ใบหลัก: อะไหล่ 1 รายการ (แอดมินระบุแทนหัวหน้าภาคได้) + รูป 1 ไฟล์
W1=$(newwo W71); C1=$(codeof $W1)
P1=$(fx_part "$W1" BOARD)
POST $A "work-orders/$W1/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$P1,\"quantity\":2}]}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$W1/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
# รายงานอะไหล่หมดอ่านแถวที่เช็คแล้วว่าหมด — ตั้งตรง ๆ (ไม่แตะขั้น) ให้ใบนี้อยู่ในรายงานไว้ดูว่าหายไหม
DB "update \"WorkOrderPart\" set \"inStock\"=false, \"checkedAt\"=timezone('utc', now()) where \"workOrderId\"=$W1 and kind='WAITING'" >/dev/null
ST1=$(DB "select status from \"WorkOrder\" where id=$W1")
SNAP1="$ST1|$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")"
L1=$(logs $W1)
TODAY=$(node -e 'console.log(new Date(Date.now()+7*3600e3).toISOString().slice(0,10))')
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
OPENER() { GET $A "work-orders/reports/by-opener?from=$TODAY&to=$TODAY&opener=$AID" | J 'd.count'; }
OPENED_BEFORE=$(OPENER)
echo "เตรียม $C1 ($SNAP1) ที่สาขา $BR"

echo "═══ ต้องมีเหตุผล"
R=$(DEL $A $W1)
[[ "$R" == 400\|*"กดปุ่ม “อัปเดต”" ]] && [ "$(trashed $W1)" = "false" ] \
  && pass "แอปรุ่นเก่า (DELETE ไม่มีเหตุผล) → 400 บอกให้กดอัปเดต · ใบไม่ถูกย้าย" || fail "ไม่มีเหตุผล: $R"
R=$(DEL $A $W1 '{"reason":"OTHER"}')
[[ "$R" == 400\|*"อื่น ๆ"*"พิมพ์เหตุผล"* ]] && [ "$(trashed $W1)" = "false" ] && pass "\"อื่น ๆ\" ไม่พิมพ์เหตุผล → 400" || fail "อื่น ๆ: $R"
R=$(DEL $A $W1 '{"reason":"BOGUS"}')
[[ "$R" == 400\|*"เหตุผลที่ลบไม่ถูกต้อง"* ]] && pass "เหตุผลนอกรายการ → 400 ภาษาไทย" || fail "เหตุผลมั่ว: $R"
R=$(DEL $T $W1 '{"reason":"TEST"}'); R2=$(DEL $S $W1 '{"reason":"TEST"}')
[[ "$R" == 403\|* && "$R2" == 403\|* ]] && [ "$(trashed $W1)" = "false" ] && pass "ช่าง/หัวหน้าภาค ลบไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "ช่าง $R · หัวหน้าภาค $R2"

echo
echo "═══ ย้ายไปถังขยะ"
V0=$(GET $A "work-orders/version?status=ALL" | J 'd.version')
R=$(curl -s -X DELETE "localhost:4000/api/work-orders/$W1" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"reason":"TEST","note":"ลองระบบหน้าใหม่"}')
echo "$R" | J 'd.ok&&d.trashed&&d.code==="'$C1'"&&d.keepDays===30&&Math.round((Date.parse(d.purgeAt)-Date.parse(d.deletedAt))/864e5)===30&&d.removed.parts===1&&d.removed.attachments===1?"ok":"bad"' | grep -q ok \
  && pass "คำตอบ: รหัส · เก็บ 30 วัน (ลบจริงวันไหน) · นับอะไหล่/ไฟล์ที่ย้ายไปพร้อมกัน" || fail "คำตอบ: $(echo "$R" | head -c 300)"
[ "$(DB "select w.\"deleteReason\"||'|'||w.\"deleteNote\"||'|'||u.\"employeeCode\"||'|'||w.status from \"WorkOrder\" w join \"User\" u on u.id=w.\"deletedById\" where w.id=$W1")" = "TEST|ลองระบบหน้าใหม่|A001|$ST1" ] \
  && pass "ฐานข้อมูล: แถวยังอยู่ · เหตุผล · ข้อความ · คนลบ · ขั้นไม่ถูกแตะ" || fail "ฐานข้อมูล: $(DB "select \"deleteReason\",\"deleteNote\",status from \"WorkOrder\" where id=$W1")"
[ "$(DB "select action||'|'||status||'|'||note from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")" = "TRASHED|$ST1|ใบทดสอบ / ลองระบบ — ลองระบบหน้าใหม่" ] \
  && pass "ประวัติ: ย้ายไปถังขยะ + เหตุผล (ขั้นในแถวประวัติ = ขั้นเดิม)" || fail "ประวัติ: $(DB "select action, note from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")" = "1|1" ] \
  && pass "อะไหล่และไฟล์แนบยังอยู่ครบ (ยังไม่ลบจริง)" || fail "ลูกหายตั้งแต่ย้ายไปถัง"

echo
echo "═══ หายจากทุกที่"
GET $A "work-orders?status=ALL" | J "d.rows.some(r=>r.id==$W1)?'bad':'ok'" | grep -q ok && pass "รายการใบงาน (ทั้งหมด) ไม่มีใบนี้" || fail "ยังอยู่ในรายการ"
GET $A "work-orders?status=ALL&search=$C1" | J 'd.rows.length' | grep -qx 0 && pass "ค้นเลขใบงานไม่เจอ" || fail "ค้นแล้วยังเจอ"
GET $A "work-orders/locate?ids=$W1" | J 'd.rows.length' | grep -qx 0 && pass "/locate ไม่รู้จักใบนี้ (ปุ่มมีอัปเดตบอกว่าออกจากรายการแล้ว)" || fail "locate ยังเจอ"
[ "$(GET $A "work-orders/version?status=ALL" | J 'd.version')" != "$V0" ] && pass "ลายนิ้วมือรายการเปลี่ยน — หน้าที่เปิดค้างรู้ว่ามีใบหายไป" || fail "version ไม่เปลี่ยน"
GET $A "branches/$BR/open-work-orders" | J "d.some(o=>o.code==='$C1')?'bad':'ok'" | grep -q ok && pass "เตือนใบซ้ำของสาขาไม่นับใบในถังขยะ" || fail "เตือนใบซ้ำยังมีใบนี้"
GET $A "work-orders/reports/parts-out" | grep -q "$C1" && fail "รายงานอะไหล่หมดยังมีใบนี้" || pass "รายงานอะไหล่หมดไม่มีใบนี้"
[ "$(OPENER)" = "$((OPENED_BEFORE - 1))" ] && pass "รายงานใบงานแยกตามผู้เปิด ลดลงหนึ่งใบ" || fail "รายงานผู้เปิด: $(OPENER) (ก่อน $OPENED_BEFORE)"
R=$(curl -s -w '\n%{http_code}' "localhost:4000/api/work-orders/$W1" -H "$(H $A)")
[ "$(echo "$R" | tail -1)" = "404" ] && echo "$R" | sed '$d' | J 'd.trashed===true&&d.error.startsWith("ใบงานนี้อยู่ในถังขยะ")?"ok":"bad"' | grep -q ok \
  && pass "เปิดหน้าใบงาน → 404 \"ใบงานนี้อยู่ในถังขยะ\" (trashed: true)" || fail "หน้าใบงาน: $(echo "$R" | head -c 200)"
[ "$(CODEOF "localhost:4000/api/work-orders/$W1/version" -H "$(H $A)")" = "404" ] && pass "ตัวเช็ครุ่นของหน้าใบงาน → 404 (หน้าที่เปิดค้างปิดตัวเอง)" || fail "version ของใบยังตอบ"
[ "$(CODEOF "localhost:4000/api/work-orders/$W1")" = "401" ] && pass "ไม่ล็อกอินได้ 401 ไม่ใช่ \"อยู่ในถังขยะ\" (คนนอกไม่รู้ว่าเลขไหนอยู่ในถัง)" || fail "ไม่ล็อกอิน: $(CODEOF "localhost:4000/api/work-orders/$W1")"

echo
echo "═══ แก้ใบในถังขยะไม่ได้"
SYM=$(DB "select symptom from \"WorkOrder\" where id=$W1"); L2=$(logs $W1)
c1=$(CODEOF -X PATCH "localhost:4000/api/work-orders/$W1" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"symptom":"แก้ใบในถังขยะ"}')
c2=$(CODEOF -X POST "localhost:4000/api/work-orders/$W1/cancel" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"reasonCode":"OTHER","note":"ยกเลิกใบในถัง"}')
c3=$(CODEOF -X POST "localhost:4000/api/work-orders/$W1/parts" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"needsParts\":false}")
c4=$(CODEOF -X POST "localhost:4000/api/work-orders/$W1/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png")
c5=$(CODEOF "localhost:4000/api/work-orders/$W1/attachments" -H "$(H $A)")
[ "$c1$c2$c3$c4$c5" = "404404404404404" ] && pass "แก้ไข · ยกเลิก · ระบุอะไหล่ · แนบไฟล์ · ดูไฟล์ → 404 ทุกทาง" || fail "รหัส: $c1 $c2 $c3 $c4 $c5"
[ "$(DB "select symptom from \"WorkOrder\" where id=$W1")|$(logs $W1)|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")|$(DB "select status from \"WorkOrder\" where id=$W1")" = "$SYM|$L2|1|$ST1" ] \
  && pass "ฐานข้อมูลไม่เปลี่ยนเลย (อาการ ประวัติ ไฟล์ ขั้น)" || fail "ใบในถังถูกแก้"
R=$(DEL $A $W1 '{"reason":"TEST"}')
[[ "$R" == 404\|"ใบงานนี้อยู่ในถังขยะ"* ]] && pass "ลบซ้ำ → 404 อยู่ในถังขยะแล้ว (เหตุผลเดิมไม่ถูกทับ)" || fail "ลบซ้ำ: $R"

echo
echo "═══ หน้าถังขยะ"
NAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
R=$(GET $A "work-orders/trash?q=$C1")
echo "$R" | J "const r=d.rows.find(x=>x.id==$W1); r&&d.keepDays===30&&d.canPurgeNow===false&&r.reason==='TEST'&&r.reasonText==='ใบทดสอบ / ลองระบบ — ลองระบบหน้าใหม่'&&r.daysLeft===30&&r.files===1&&r.status==='$ST1'&&!!r.statusLabel&&r.deletedByName==='$NAME'&&r.branchCode==='$BR'?'ok':'bad'" | grep -q ok \
  && pass "แถว: ขั้นก่อนลบ · เหตุผล · ไฟล์ · คนลบ · เหลือ 30 วัน · แอดมินไม่มีลบถาวร (canPurgeNow=false)" || fail "แถว: $(echo "$R" | head -c 400)"
GET $A "work-orders/trash?q=$(node -pe 'encodeURIComponent(process.argv[1])' "$NAME")" | J "d.rows.some(x=>x.id==$W1)?'ok':'bad'" | grep -q ok && pass "ค้นด้วยชื่อคนลบเจอ" || fail "ค้นชื่อคนลบไม่เจอ"
GET $A "work-orders/trash?q=$BR" | J "d.rows.some(x=>x.id==$W1)?'ok':'bad'" | grep -q ok && pass "ค้นด้วยรหัสสาขาเจอ" || fail "ค้นรหัสสาขาไม่เจอ"
[ "$(GET $A work-orders/inbox-count | J 'd.trash')" = "$(DB "select count(*) from \"WorkOrder\" where \"deletedAt\" is not null")" ] \
  && pass "ตัวเลขข้างเมนู (inbox-count.trash) เท่าฐานข้อมูล" || fail "inbox-count: $(GET $A work-orders/inbox-count)"
GET $S work-orders/inbox-count | J '"trash" in d?"bad":"ok"' | grep -q ok && pass "หัวหน้าภาคไม่ได้ตัวเลขถังขยะ" || fail "หัวหน้าภาคได้ตัวเลขถังขยะ"
[ "$(CODEOF localhost:4000/api/work-orders/trash -H "$(H $S)")$(CODEOF localhost:4000/api/work-orders/trash -H "$(H $PA)")" = "403403" ] \
  && pass "หัวหน้าภาค / Admin Spare Part เปิดถังขยะไม่ได้ (403)" || fail "สิทธิ์เปิดถังขยะ"
GET $SA "work-orders/trash?q=$C1" | J 'd.canPurgeNow===true?"ok":"bad"' | grep -q ok && pass "Super Admin: canPurgeNow=true" || fail "Super Admin ไม่มีลบถาวร"

echo
echo "═══ กู้คืน"
# ระหว่างอยู่ในถัง มีคนเปิดใบใหม่ของเครื่องเดียวกัน — กู้ได้ แต่ต้องบอก
W2=$(newwo W71); C2=$(codeof $W2)
[ "$(CODEOF -X POST "localhost:4000/api/work-orders/$W1/restore" -H "$(H $S)")" = "403" ] && [ "$(trashed $W1)" = "true" ] && pass "หัวหน้าภาคกู้คืนไม่ได้ (403)" || fail "หัวหน้าภาคกู้คืนได้"
R=$(POST $A "work-orders/$W1/restore" '{}')
echo "$R" | J "d.ok&&d.code==='$C1'&&d.status==='$ST1'&&d.notes.some(n=>n.includes('$C2'))?'ok':'bad'" | grep -q ok \
  && pass "กู้คืนแล้วบอกขั้นเดิม + เครื่องเดียวกันมีใบค้าง ($C2)" || fail "คำตอบกู้คืน: $(echo "$R" | head -c 300)"
SNAP2="$(DB "select status from \"WorkOrder\" where id=$W1")|$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")"
[ "$SNAP2" = "$SNAP1" ] && [ "$(trashed $W1)" = "false" ] && [ "$(DB "select coalesce(\"deleteReason\",'-')||coalesce(\"deletedById\"::text,'-') from \"WorkOrder\" where id=$W1")" = "--" ] \
  && pass "ขั้นเดิม · อะไหล่ · ไฟล์แนบ ครบ · ช่องถังขยะว่าง ($SNAP2)" || fail "หลังกู้คืน: $SNAP2 (ก่อน $SNAP1)"
[ "$(DB "select string_agg(action, ',' order by id) from (select action, id from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 2) x")" = "TRASHED,RESTORED" ] \
  && [ "$(logs $W1)" = "$((L1 + 2))" ] && pass "ประวัติเพิ่มสองแถว: ย้ายไปถังขยะ แล้ว กู้คืนจากถังขยะ" || fail "ประวัติ: $(logs $W1) แถว (ก่อน $L1)"
GET $A "work-orders/$W1" | J "d.id==$W1&&d.logs.some(l=>l.actionLabel==='กู้คืนจากถังขยะ')&&d.logs.some(l=>l.actionLabel==='ย้ายไปถังขยะ')?'ok':'bad'" | grep -q ok \
  && pass "หน้าใบงานเปิดได้อีก ประวัติขึ้นป้ายไทยทั้งสองแถว" || fail "หน้าใบงานหลังกู้คืน"
GET $A "work-orders?status=ALL&search=$C1" | J "d.rows.some(r=>r.id==$W1)?'ok':'bad'" | grep -q ok && pass "กลับเข้ารายการใบงาน" || fail "ไม่กลับเข้ารายการ"
GET $A "work-orders/reports/parts-out" | grep -q "$C1" && pass "กลับเข้ารายงานอะไหล่หมด" || fail "ไม่กลับเข้ารายงาน"
R=$(curl -s -w '\n%{http_code}' -X POST "localhost:4000/api/work-orders/$W1/restore" -H "$(H $A)")
[ "$(echo "$R" | tail -1)" = "404" ] && echo "$R" | sed '$d' | grep -q "ไม่พบใบงานนี้ในถังขยะ" && pass "กู้ใบที่ไม่อยู่ในถัง → 404 ภาษาไทย" || fail "กู้ซ้ำ: $R"

echo
echo "═══ บอร์ดแผนงาน"
DAY=$(node -e 'console.log(new Date(Date.now()+7*3600e3+45*864e5).toISOString().slice(0,10))')
DB "update \"WorkOrder\" set status='ASSIGNED', \"scheduledAt\"='${DAY}T00:00:00', \"assignedTeam\"='$ZONE' where id=$W2" >/dev/null
GET $A "plans/day?date=$DAY" | grep -q "$C2" && B1=1 || B1=0
DEL $A $W2 '{"reason":"DUPLICATE"}' >/dev/null
GET $A "plans/day?date=$DAY" | grep -q "$C2" && B2=1 || B2=0
[ "$B1$B2" = "10" ] && pass "ใบที่นัดไว้ขึ้นบอร์ดแผนงาน → ย้ายไปถังขยะแล้วหาย" || fail "บอร์ด: ก่อน $B1 หลัง $B2"

echo
echo "═══ ลบถาวรตอนนี้ (Super Admin)"
KEY=$(DB "select \"objectKey\" from \"WorkOrderAttachment\" where \"workOrderId\"=$W1 and \"objectKey\" is not null limit 1")
DEL $A $W1 '{"reason":"WRONG"}' >/dev/null
[ "$(CODEOF -X DELETE "localhost:4000/api/work-orders/$W1/permanent" -H "$(H $A)")" = "403" ] && [ "$(DB "select count(*) from \"WorkOrder\" where id=$W1")" = "1" ] \
  && pass "แอดมินทั่วไปลบถาวรไม่ได้ (403) แถวยังอยู่" || fail "แอดมินลบถาวรได้"
W3=$(newwo W72)
[ "$(CODEOF -X DELETE "localhost:4000/api/work-orders/$W3/permanent" -H "$(H $SA)")" = "409" ] && [ "$(trashed $W3)" = "false" ] \
  && pass "ใบที่ยังไม่อยู่ในถัง ลบถาวรไม่ได้ (409) — ต้องผ่านถังขยะก่อน" || fail "ลบถาวรใบที่ยังใช้งานได้"
[ -n "$KEY" ] && [ "$(CODEOF "$MOCK/$KEY")" = "200" ] && HAD=1 || HAD=0
R=$(curl -s -X DELETE "localhost:4000/api/work-orders/$W1/permanent" -H "$(H $SA)")
echo "$R" | J "d.ok&&d.code==='$C1'&&d.removed.attachments===1&&d.fileErrors===0?'ok':'bad'" | grep -q ok && pass "Super Admin ลบถาวรได้ (คำตอบรูปเดิม: removed · fileErrors)" || fail "ลบถาวร: $(echo "$R" | head -c 200)"
[ "$(DB "select (select count(*) from \"WorkOrder\" where id=$W1)+(select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1)+(select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W1)+(select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1)")" = "0" ] \
  && pass "ฐานข้อมูล: ใบ อะไหล่ ประวัติ ไฟล์แนบ หายหมด" || fail "ยังมีแถวค้าง"
[ "$HAD" = "1" ] && [ "$(CODEOF "$MOCK/$KEY")" = "404" ] && pass "ไฟล์ในที่เก็บไฟล์ถูกลบตาม" || fail "ไฟล์ในที่เก็บ: ก่อน $HAD หลัง $(CODEOF "$MOCK/$KEY")"

echo
echo "═══ ครบ 30 วัน"
W4=$(newwo W73); W5=$(newwo W74)
curl -s -X POST "localhost:4000/api/work-orders/$W4/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
KEY4=$(DB "select \"objectKey\" from \"WorkOrderAttachment\" where \"workOrderId\"=$W4 and \"objectKey\" is not null limit 1")
DEL $A $W4 '{"reason":"TEST"}' >/dev/null; DEL $A $W5 '{"reason":"TEST"}' >/dev/null
C4=$(codeof $W4); MAXID=$(DB "select max(id) from \"WorkOrder\"")
DB "update \"WorkOrder\" set \"deletedAt\" = timezone('utc', now()) - interval '31 days' where id=$W4;
    update \"WorkOrder\" set \"deletedAt\" = timezone('utc', now()) - interval '29 days' where id=$W5" >/dev/null
# หน้าถังขยะลบที่ครบกำหนดทีละ 5 ใบ เก่าสุดก่อน — ฐานทดสอบอาจมีใบครบกำหนดค้างจากรอบก่อน จึงเปิดซ้ำได้ไม่เกิน 10 รอบ
for n in 1 2 3 4 5 6 7 8 9 10; do
  R=$(GET $A "work-orders/trash")
  [ "$(DB "select count(*) from \"WorkOrder\" where id=$W4")" = "0" ] && break
done
[ "$(DB "select count(*) from \"WorkOrder\" where id=$W4")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W4")|$(DB "select count(*) from \"WorkOrder\" where id=$W5")" = "0|0|1" ] \
  && pass "เปิดถังขยะ: ใบที่ลบมา 31 วันหายจริง (พร้อมไฟล์แนบ) · 29 วันยังอยู่" || fail "ครบกำหนด: 31 วัน $(DB "select count(*) from \"WorkOrder\" where id=$W4") · 29 วัน $(DB "select count(*) from \"WorkOrder\" where id=$W5")"
echo "$R" | J "const r=d.rows.find(x=>x.id==$W5); r&&r.daysLeft===1&&!d.rows.some(x=>x.id==$W4)?'ok':'bad'" | grep -q ok && pass "หน้าถังขยะ: 29 วัน = เหลือ 1 วัน · ใบที่ลบจริงไม่อยู่" || fail "ถังขยะ: $(echo "$R" | head -c 300)"
[ -n "$KEY4" ] && [ "$(CODEOF "$MOCK/$KEY4")" = "404" ] && pass "ลบครบ 30 วัน: ไฟล์ในที่เก็บไฟล์หายด้วย" || fail "ไฟล์ของใบที่ครบกำหนดยังอยู่ ($KEY4)"

echo
echo "═══ เลขใบงานไม่ถูกใช้ซ้ำ"
W6=$(newwo W75); C6=$(codeof $W6)
[ "$W6" -gt "$MAXID" ] && [ "$C6" != "$C4" ] && [ "$C6" != "$C1" ] && [ "$(DB "select count(*) from \"WorkOrder\" where code='$C6'")" = "1" ] \
  && pass "ใบใหม่หลังลบจริงได้เลขใหม่ ($C6) ไม่ใช่เลขของใบที่ลบ ($C1 · $C4)" || fail "เลขซ้ำ: $C6 (ลบไป $C1 $C4 · max $MAXID)"

echo
echo "═══ อีกโปรเซสเปลี่ยนถังขยะ (SQL ตรง — เซิร์ฟเวอร์นี้ไม่รู้ จนกว่าจะถามแถวจริง)"
# เซิร์ฟเวอร์จำรายชื่อใบในถังไว้ (โหลดใหม่ทุก 60 วินาที) — อีกเครื่องที่ใช้ฐานเดียวกันย้าย/กู้ใบได้โดยที่เครื่องนี้ไม่รู้
W7=$(newwo W76); W8=$(newwo W77)
DEL $A $W7 '{"reason":"TEST"}' >/dev/null
[ "$(CODEOF "localhost:4000/api/work-orders/$W7" -H "$(H $A)")$(CODEOF "localhost:4000/api/work-orders/$W8" -H "$(H $A)")" = "404200" ] || fail "เตรียม: เครื่องนี้ต้องรู้ว่า W7 อยู่ในถัง W8 ไม่อยู่"
# กู้คืนจากที่อื่น (ล้างช่องถังขยะตรง ๆ) → ต้องเปิดและแก้ได้ทันที
DB "update \"WorkOrder\" set \"deletedAt\"=null, \"deletedById\"=null, \"deleteReason\"=null, \"deleteNote\"=null where id=$W7" >/dev/null
c1=$(CODEOF "localhost:4000/api/work-orders/$W7" -H "$(H $A)")
c2=$(CODEOF -X PATCH "localhost:4000/api/work-orders/$W7" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"symptom":"แก้หลังกู้จากเครื่องอื่น"}')
[ "$c1$c2" = "200200" ] && [ "$(DB "select symptom from \"WorkOrder\" where id=$W7")" = "แก้หลังกู้จากเครื่องอื่น" ] \
  && pass "กู้คืนจากเครื่องอื่น → เปิด (200) และแก้ (200 · ฐานข้อมูลเปลี่ยน) ได้ทันที ไม่ติด \"อยู่ในถังขยะ\" อีกนาที" || fail "กู้จากที่อื่น: เปิด $c1 · แก้ $c2"
# ย้ายไปถังจากที่อื่น → แก้ต้องไม่ได้ทันที
SYM8=$(DB "select symptom from \"WorkOrder\" where id=$W8"); L8=$(logs $W8)
DB "update \"WorkOrder\" set \"deletedAt\"=timezone('utc', now()), \"deletedById\"=$AID, \"deleteReason\"='WRONG' where id=$W8" >/dev/null
R=$(curl -s -w '\n%{http_code}' -X PATCH "localhost:4000/api/work-orders/$W8" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"symptom":"แก้ใบที่เครื่องอื่นเพิ่งลบ"}')
c3=$(CODEOF -X POST "localhost:4000/api/work-orders/$W8/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png")
[ "$(echo "$R" | tail -1)" = "404" ] && echo "$R" | sed '$d' | J 'd.trashed===true?"ok":"bad"' | grep -q ok && [ "$c3" = "404" ] \
  && [ "$(DB "select symptom from \"WorkOrder\" where id=$W8")|$(logs $W8)|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W8")" = "$SYM8|$L8|0" ] \
  && pass "ย้ายไปถังจากเครื่องอื่น → แก้ไข · แนบไฟล์ ได้ 404 trashed ทันที · ฐานข้อมูลไม่เปลี่ยน" || fail "ย้ายจากที่อื่นแล้วยังแก้ได้: $(echo "$R" | tail -1) · แนบ $c3"
c4=$(CODEOF "localhost:4000/api/work-orders/$W8" -H "$(H $A)"); c5=$(CODEOF "localhost:4000/api/work-orders/$W8/version" -H "$(H $A)")
c6=$(CODEOF "localhost:4000/api/work-orders/$W8/attachments" -H "$(H $A)"); c7=$(CODEOF "localhost:4000/api/work-orders/$W8/attachments/links" -H "$(H $A)")
[ "$c4$c5$c6$c7" = "404404404404" ] && pass "หน้าใบงาน · ตัวเช็ครุ่น (หน้าที่เปิดค้างปิดตัวเอง) · ไฟล์แนบ → 404 ทันที (อ่านแถวจริงมากับใบอยู่แล้ว)" \
  || fail "อ่านใบที่เครื่องอื่นเพิ่งลบ: หน้าใบ $c4 · version $c5 · ไฟล์ $c6 · ลิงก์ไฟล์ $c7"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
