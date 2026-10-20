#!/bin/bash
# ทดสอบ: สิทธิ์ใบงาน (ตรวจระบบ ต.ค. 69 — เดิมช่างยกเลิก/แก้/เปิดดูใบทีมอื่นได้ทั้งหมด)
#   · ช่างทีมอื่น: เปิดดู ดูไฟล์ แก้ ยกเลิก ไม่ได้ (ฐานข้อมูลไม่เปลี่ยน) · ใบที่ตัวเองเปิด/ทีมตัวเองยังได้
#   · ผู้รับงาน/วันนัด/อะไหล่ แก้ผ่านหน้าแก้ไขไม่ได้ (แม้แอดมิน) — ต้องผ่านปุ่มขั้นตอน
#   · หัวหน้าภาคนอกพื้นที่ไม่ได้ ในพื้นที่ยกเลิกได้ต้องมีเหตุผล · รอตรวจเคลมยกเลิกไม่ได้
#   · กล่องเตือนใบซ้ำ: ช่างได้แบบย่อ หัวหน้าภาคนอกพื้นที่ไม่เห็น
#   · เปลี่ยน/รีเซ็ตรหัสผ่านแล้วโทเคนเก่าใช้ไม่ได้ เครื่องที่เปลี่ยนเองได้โทเคนใหม่
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
loginpw() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"$2\"}" | J 'd.token'; }
login() { loginpw "$1" test1234; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
BR=C0006
A=$(login A001); T=$(login T001)
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_HASH=$(DB "select \"passwordHash\" from \"User\" where id=$TID")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  # รหัสผ่าน T001 ต้องกลับเป็นเดิมเสมอ ไม่งั้นเทสต์อื่นทั้งชุดล็อกอินไม่ได้
  PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -At -v ON_ERROR_STOP=1 >/dev/null <<SQL
update "User" set "passwordHash"='$OLD_HASH', "mustChangePassword"=false where id=$TID;
SQL
}
trap cleanup EXIT
mk() { POST $1 work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"$2\",\"symptom\":\"ทดสอบสิทธิ์\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
W=$(mk $A W71); IDS="$W"
[ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$W")" = "-" ] || fail "เตรียมข้อมูล: ใบควรยังไม่มีทีม"
STATUS() { DB "select status||'|'||coalesce(\"assignedToId\"::text,'-')||'|'||coalesce(symptom,'-') from \"WorkOrder\" where id=$1"; }
BEFORE=$(STATUS $W)

echo "═══ ช่างทีมอื่น"
[ "$(CODE localhost:4000/api/work-orders/$W -H "$(H $T)")" = "403" ] && pass "เปิดดูใบที่ไม่ใช่ของทีม: 403" || fail "ช่างเปิดดูได้"
[ "$(curl -s localhost:4000/api/work-orders/$W -H "$(H $T)" | J 'd.notYourTeam===true && !d.contactPhone')" = "true" ] && pass "ตอบว่าไม่ใช่ของทีม ไม่มีเบอร์ลูกค้าหลุด" || fail "คำตอบ 403 ไม่ถูก"
[ "$(CODE localhost:4000/api/work-orders/$W/version -H "$(H $T)")" = "403" ] && [ "$(CODE localhost:4000/api/work-orders/$W/attachments -H "$(H $T)")" = "403" ] \
  && pass "เลขรุ่น/รายการไฟล์แนบ: 403" || fail "ช่างดูไฟล์แนบ/รุ่นได้"
[ "$(CODE -X PATCH localhost:4000/api/work-orders/$W -H "$(H $T)" -H 'Content-Type: application/json' -d '{"symptom":"ช่างแก้"}')" = "403" ] && [ "$(STATUS $W)" = "$BEFORE" ] \
  && pass "แก้อาการ: 403 ฐานข้อมูลไม่เปลี่ยน" || fail "ช่างแก้ได้: $(STATUS $W)"
[ "$(CODE -X PATCH localhost:4000/api/work-orders/$W -H "$(H $T)" -H 'Content-Type: application/json' -d "{\"assignedToId\":$TID}")" = "400" ] && [ "$(STATUS $W)" = "$BEFORE" ] \
  && pass "ตั้งตัวเองเป็นผู้รับงาน: ถูกปฏิเสธ ฐานข้อมูลไม่เปลี่ยน" || fail "ตั้งผู้รับงานได้: $(STATUS $W)"
[ "$(CODE -X POST localhost:4000/api/work-orders/$W/cancel -H "$(H $T)" -H 'Content-Type: application/json' -d '{"reasonCode":"DUPLICATE"}')" = "403" ] && [ "$(STATUS $W)" = "$BEFORE" ] \
  && pass "ยกเลิก: 403 ฐานข้อมูลไม่เปลี่ยน" || fail "ช่างยกเลิกได้: $(STATUS $W)"
R=$(curl -s localhost:4000/api/branches/$BR/open-work-orders -H "$(H $T)")
[ "$(echo "$R" | J "const o=d.find(x=>x.code===\"$(DB "select code from \"WorkOrder\" where id=$W")\"); !!o && o.limited===true && o.id===null && o.symptom===null && o.createdBy===null && !!o.statusLabel")" = "true" ] \
  && pass "กล่องเตือนใบซ้ำ: ช่างได้แบบย่อ (เลข ขั้น — ไม่มีอาการ/ชื่อคน/เลขเปิด)" || fail "แบบย่อไม่ถูก: $(echo "$R" | head -c 300)"

echo "═══ แอดมินก็แก้ผู้รับงาน/วันนัด/อะไหล่ทางนี้ไม่ได้"
for f in "{\"assignedToId\":$TID}" '{"scheduledAt":"2026-12-01"}' '{"waitingParts":[]}'; do
  [ "$(CODE -X PATCH localhost:4000/api/work-orders/$W -H "$(H $A)" -H 'Content-Type: application/json' -d "$f")" = "400" ] || fail "แอดมินส่ง $f ผ่าน"
done
[ "$(STATUS $W)" = "$BEFORE" ] && pass "ผู้รับงาน/วันนัด/อะไหล่ ผ่านหน้าแก้ไข: 400 ทั้งหมด ฐานข้อมูลไม่เปลี่ยน" || fail "เปลี่ยน: $(STATUS $W)"
[ "$(CODE -X PATCH localhost:4000/api/work-orders/$W -H "$(H $A)" -H 'Content-Type: application/json' -d '{"contactName":"คุณแอดมินแก้"}')" = "200" ] && [ "$(DB "select \"contactName\" from \"WorkOrder\" where id=$W")" = "คุณแอดมินแก้" ] \
  && pass "แอดมินแก้ผู้ติดต่อได้ตามปกติ" || fail "แอดมินแก้ปกติไม่ได้"

echo "═══ ช่าง: ใบที่ตัวเองเปิด และใบของทีมตัวเอง ยังได้"
W2=$(mk $T W72); IDS="$IDS $W2"
[ "$(CODE localhost:4000/api/work-orders/$W2 -H "$(H $T)")" = "200" ] && [ "$(CODE -X PATCH localhost:4000/api/work-orders/$W2 -H "$(H $T)" -H 'Content-Type: application/json' -d '{"symptom":"ช่างแก้ใบตัวเอง"}')" = "200" ] \
  && pass "ใบที่ช่างเปิดเอง (ยังไม่มีทีม): เปิดดูและแก้ได้" || fail "ช่างเปิดใบตัวเองไม่ได้"
DB "update \"WorkOrder\" set \"assignedTeam\"=(select team from \"User\" where id=$TID) where id=$W" >/dev/null
[ "$(CODE localhost:4000/api/work-orders/$W -H "$(H $T)")" = "200" ] && pass "ใบที่จ่ายให้ทีมตัวเอง: เปิดดูได้" || fail "ใบทีมตัวเองเปิดไม่ได้"
DB "update \"WorkOrder\" set \"assignedTeam\"=null where id=$W" >/dev/null

echo "═══ หัวหน้าภาค"
DB "update \"User\" set region='ภาคทดสอบไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
[ "$(CODE localhost:4000/api/work-orders/$W -H "$(H $S)")" = "403" ] && [ "$(CODE -X POST localhost:4000/api/work-orders/$W/cancel -H "$(H $S)" -H 'Content-Type: application/json' -d '{"reasonCode":"DUPLICATE"}')" = "403" ] && [ "$(STATUS $W)" = "$BEFORE" ] \
  && pass "นอกพื้นที่: เปิดดู/ยกเลิก 403 ฐานข้อมูลไม่เปลี่ยน" || fail "หัวหน้าภาคนอกพื้นที่ทำได้"
[ "$(curl -s localhost:4000/api/branches/$BR/open-work-orders -H "$(H $S)" | J 'd.length')" = "0" ] && pass "นอกพื้นที่: กล่องเตือนใบซ้ำไม่เห็นใบของสาขานี้" || fail "นอกพื้นที่เห็นใบค้าง"
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
R=$(POST $S "work-orders/$W/cancel" '{}'); echo "$R" | grep -q "เลือกเหตุผล" && pass "ในพื้นที่: ยกเลิกไม่มีเหตุผล = ปฏิเสธ" || fail "ยกเลิกไม่มีเหตุผลผ่าน: $R"
R=$(POST $S "work-orders/$W/cancel" '{"reasonCode":"OTHER"}'); echo "$R" | grep -q "พิมพ์เหตุผล" && pass "เลือก อื่น ๆ ไม่พิมพ์เหตุผล = ปฏิเสธ" || fail "อื่น ๆ ไม่มีข้อความผ่าน: $R"
[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "NEW" ] || fail "ยกเลิกไปแล้วทั้งที่ควรถูกปฏิเสธ"
POST $S "work-orders/$W/cancel" '{"reasonCode":"DUPLICATE","note":"ซ้ำกับ WO-00198"}' >/dev/null
[ "$(DB "select w.status||'|'||l.note from \"WorkOrder\" w join \"WorkOrderLog\" l on l.\"workOrderId\"=w.id and l.action='CANCELLED' where w.id=$W")" = "CANCELLED|เปิดซ้ำ — ซ้ำกับ WO-00198" ] \
  && pass "ในพื้นที่: ยกเลิกได้ ประวัติบันทึกเหตุผล (ฐานข้อมูล)" || fail "ยกเลิกไม่ได้/ไม่มีเหตุผลในประวัติ"
R=$(POST $A "work-orders/$W/cancel" '{"reasonCode":"DUPLICATE"}'); echo "$R" | grep -q "ถูกยกเลิกไปแล้ว" && pass "ยกเลิกซ้ำ = ปฏิเสธ" || fail "ยกเลิกซ้ำผ่าน: $R"
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$W2" >/dev/null
R=$(POST $A "work-orders/$W2/cancel" '{"reasonCode":"DUPLICATE"}'); echo "$R" | grep -q "รอตรวจเคลม" && [ "$(DB "select status from \"WorkOrder\" where id=$W2")" = "CLAIM_REVIEW" ] \
  && pass "รอตรวจเคลม: ยกเลิกไม่ได้" || fail "ยกเลิกระหว่างรอตรวจเคลมได้: $R"

echo "═══ รหัสผ่าน"
T1=$(login T001); sleep 1; T2=$(login T001); sleep 1
NEW=$(POST $T1 auth/change-password '{"currentPassword":"test1234","newPassword":"perm-test-9876"}' | J 'd.token')
[ "$(CODE localhost:4000/api/auth/me -H "$(H $NEW)")" = "200" ] && pass "เครื่องที่เปลี่ยนรหัสเอง: ได้โทเคนใหม่ ใช้ต่อได้" || fail "โทเคนใหม่ใช้ไม่ได้"
[ "$(curl -s localhost:4000/api/auth/me -H "$(H $T2)" | J 'd.passwordChanged===true')" = "true" ] && [ "$(CODE localhost:4000/api/auth/me -H "$(H $T1)")" = "401" ] \
  && pass "เครื่องอื่นที่ล็อกอินไว้ (และโทเคนเดิม): 401 ต้องเข้าระบบใหม่" || fail "โทเคนเก่ายังใช้ได้"
sleep 1
POST $A "auth/users/$TID/reset-password" '{"password":"reset-test-5555"}' >/dev/null
[ "$(CODE localhost:4000/api/auth/me -H "$(H $NEW)")" = "401" ] && pass "แอดมินรีเซ็ตรหัส: โทเคนของช่างหลุดทันที" || fail "รีเซ็ตแล้วโทเคนยังใช้ได้"
[ -n "$(loginpw T001 reset-test-5555)" ] && pass "เข้าระบบด้วยรหัสใหม่ได้" || fail "รหัสที่รีเซ็ตใช้ไม่ได้"

[ -z "$FAILED" ]
