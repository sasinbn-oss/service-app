#!/bin/bash
# ทดสอบ: ลิงก์หน้าเว็บของใบงาน (/#/wo/WO-00045 · เจ้าของงานขอ 4 พ.ย. 69 "ก๊อบ url แล้วอิงหน้านั้น")
#   GET /work-orders/by-code/:code — แอปถามเลขใบจากรหัสในลิงก์ก่อนเปิดหน้าใบงาน
#   ลิงก์ถูกส่งต่อในกลุ่มไลน์ได้ทุกคน จึงต้องเป็นกฎเดียวกับเปิดใบ (GET /:id) ทุกตำแหน่ง — ไม่ใช่ทางลัดให้คนนอกทีม/พื้นที่
#   · แอดมิน: ได้ { id, code } ตรงฐานข้อมูล ไม่มีอย่างอื่น · ตัวพิมพ์เล็กได้ · ไม่มี 404 · ผิดรูป 400 · ไม่มีโทเคน 401
#   · ช่างทีมอื่น 403 (คำตอบเดียวกับ GET /:id) · จ่ายให้ทีมตัวเองแล้ว / ใบที่ตัวเองเปิด 200
#   · หัวหน้าภาคนอกพื้นที่ 403 · ในพื้นที่ 200
#   · ทีม Area: Area ทุกสาขา COCO 200 แฟรนไชส์ 403 · Supervisor (COCO) / Maid (COCO) เฉพาะสาขาตัวเอง
#     (เคยหลุด: เส้นทางนี้ไม่อยู่ในรายการอนุญาตของทีม Area → 403 ทุกใบ แม้ใบของสาขาตัวเอง)
#   · ดูในฐานะช่าง: เห็นเท่าช่าง (403 ใบทีมอื่น) — ลิงก์ไม่ทำให้ดูในฐานะเห็นเกินคนที่ถูกดู
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
# เครื่องที่ใช้มีอยู่แล้วที่สาขานั้น (เครื่องใหม่ถูกสร้างตามรหัสแล้วค้างฐานหลังลบใบ)
mk() { POST $1 work-orders "{\"branchCode\":\"$2\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"$3\",\"symptom\":\"ทดสอบลิงก์ใบงาน\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
codeOf() { DB "select code from \"WorkOrder\" where id=$1"; }
# สถานะของ by-code ต้องเท่ากับของ GET /:id เสมอ — ต่างกันเมื่อไรลิงก์กลายเป็นทางลัด (หรือเปิดไม่ได้ทั้งที่เปิดใบได้)
SAME() { local a b; a=$(CODE $1 "work-orders/by-code/$(codeOf $2)"); b=$(CODE $1 "work-orders/$2"); [ "$a" = "$b" ] && echo "$a" || echo "by-code=$a ต่างจาก /:id=$b"; }

LOGINS="'ZPL.AREA','ZPL.SUP','ZPL.MAID'"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
SUP_C0001=$(DB "select coalesce(\"cocoSupervisorId\"::text,'') from \"Branch\" where code='C0001'")
START=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
A=$(login A001); T=$(login T001)
IDS=""
cleanup() {
  for i in $IDS; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001';
      update \"Branch\" set \"cocoSupervisorId\"=nullif('$SUP_C0001','')::int where code='C0001';
      delete from \"ViewAsLog\" where id > $START;
      delete from \"CocoMaidBranch\" where \"userId\" in (select id from \"User\" where \"employeeCode\" in ($LOGINS));
      delete from \"User\" where \"employeeCode\" in ($LOGINS)" >/dev/null
}
trap cleanup EXIT
cleanup

W1=$(mk $A C0006 W81); IDS="$W1"
C1=$(codeOf $W1)
echo "  ใบทดสอบ $C1 (เลขใบ $W1)"

echo "═══ แอดมิน"
R=$(GET $A "work-orders/by-code/$C1")
[ "$(echo "$R" | J "d.id===$W1 && d.code===\"$C1\" && Object.keys(d).sort().join()==='code,id'")" = "true" ] \
  && pass "รหัส → เลขใบตรงฐานข้อมูล ($C1 → $W1) · ตอบแค่ id กับ code" || fail "แอดมิน: $R"
[ "$(GET $A "work-orders/by-code/$(echo "$C1" | tr 'A-Z' 'a-z')" | J 'd.id')" = "$W1" ] && pass "รหัสตัวพิมพ์เล็ก (คนพิมพ์ลิงก์เอง) ได้ใบเดียวกัน" || fail "ตัวเล็กหาไม่เจอ"
echo "$C1" | grep -qE '^WO-[0-9]{5,}$' && pass "รหัส $C1 ตรงรูปแบบ WO-ตัวเลข 5 หลักขึ้นไป (เลขใบเกิน 99999 ได้ 6 หลัก)" || fail "รหัสผิดรูป: $C1"
R=$(curl -s -w ' %{http_code}' "localhost:4000/api/work-orders/by-code/WO-99999999" -H "$(H $A)")
[ "${R##* }" = "404" ] && echo "$R" | grep -q "ไม่พบใบงานนี้" && pass "รหัสที่ไม่มี → 404 ข้อความไทย" || fail "ไม่มีใบ: $R"
[ "$(CODE $A 'work-orders/by-code/WO-1%20X')" = "400" ] && [ "$(CODE $A 'work-orders/by-code/WO%3B1')" = "400" ] \
  && pass "รหัสผิดรูป (เว้นวรรค · อักขระแปลก) → 400 ไม่ไปถามฐานข้อมูล" || fail "ผิดรูปไม่ได้ 400"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/by-code/$C1")" = "401" ] && pass "ไม่มีโทเคน → 401" || fail "ไม่มีโทเคนแล้วไม่ได้ 401"

echo "═══ ช่าง"
[ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$W1")" = "-" ] || fail "เตรียมข้อมูล: ใบควรยังไม่มีทีม"
[ "$(SAME $T $W1)" = "403" ] && pass "ใบทีมอื่น (ยังไม่จ่าย สาขา C0006): 403 เท่ากับเปิดใบ" || fail "ช่างทีมอื่น: $(SAME $T $W1)"
R=$(GET $T "work-orders/by-code/$C1")
[ "$R" = "$(GET $T "work-orders/$W1")" ] && [ "$(echo "$R" | J 'd.notYourTeam===true && d.id===undefined')" = "true" ] \
  && pass "คำตอบ 403 เหมือน GET /:id ทุกตัวอักษร · ไม่มีเลขใบหลุด" || fail "คำตอบ 403 ต่างกัน: $R"
DB "update \"WorkOrder\" set \"assignedTeam\"=(select team from \"User\" where \"employeeCode\"='T001') where id=$W1" >/dev/null
[ "$(SAME $T $W1)" = "200" ] && pass "จ่ายให้ทีมตัวเองแล้ว: 200" || fail "ใบทีมตัวเอง: $(SAME $T $W1)"
DB "update \"WorkOrder\" set \"assignedTeam\"=null where id=$W1" >/dev/null
W2=$(mk $T C0006 W82); IDS="$IDS $W2"
[ "$(SAME $T $W2)" = "200" ] && pass "ใบที่ช่างเปิดเอง (ยังไม่มีทีม): 200" || fail "ใบที่ช่างเปิดเอง: $(SAME $T $W2)"

echo "═══ หัวหน้าภาค"
DB "update \"User\" set region='ภาคทดสอบไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
[ "$(SAME $S $W1)" = "403" ] && pass "นอกพื้นที่: 403" || fail "หัวหน้าภาคนอกพื้นที่: $(SAME $S $W1)"
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
[ "$(SAME $S $W1)" = "200" ] && pass "ในพื้นที่: 200" || fail "หัวหน้าภาคในพื้นที่: $(SAME $S $W1)"

echo "═══ ทีม Area"
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZPL.AREA','Area ทดสอบลิงก์','AREA','$HASH',false),
  ('ZPL.SUP','Supervisor ทดสอบลิงก์','COCO_SUPERVISOR','$HASH',false),
  ('ZPL.MAID','Maid ทดสอบลิงก์','COCO_MAID','$HASH',false)" >/dev/null
DB "update \"Branch\" set \"cocoSupervisorId\"=(select id from \"User\" where \"employeeCode\"='ZPL.SUP') where code='C0001';
    insert into \"CocoMaidBranch\"(\"userId\",\"branchId\") select u.id, b.id from \"User\" u, \"Branch\" b where u.\"employeeCode\"='ZPL.MAID' and b.code='C0001'" >/dev/null
AR=$(login ZPL.AREA); SU=$(login ZPL.SUP); MA=$(login ZPL.MAID)
[ -n "$AR" ] && [ "$AR" != "undefined" ] && [ -n "$MA" ] && [ "$MA" != "undefined" ] || fail "เตรียมข้อมูล: ล็อกอินทีม Area ไม่ได้"
W3=$(mk $A C0001 W85); W4=$(mk $A D0011 W82); IDS="$IDS $W3 $W4"
[ "$(SAME $AR $W3)/$(SAME $AR $W1)/$(SAME $AR $W4)" = "200/200/403" ] \
  && pass "Area: สาขา COCO ทุกสาขา 200 (C0001 · C0006) · แฟรนไชส์ D0011 403" || fail "Area: $(SAME $AR $W3)/$(SAME $AR $W1)/$(SAME $AR $W4)"
GET $AR "work-orders/by-code/$(codeOf $W4)" | grep -q "สาขานี้ไม่อยู่ในความดูแลของคุณ" && pass "Area นอกขอบเขต: ข้อความไทยแบบเดียวกับเปิดใบ" || fail "ข้อความ Area: $(GET $AR "work-orders/by-code/$(codeOf $W4)")"
[ "$(SAME $SU $W3)/$(SAME $SU $W1)" = "200/403" ] && pass "Supervisor (COCO): สาขาตัวเอง C0001 200 · สาขาอื่น 403" || fail "Supervisor (COCO): $(SAME $SU $W3)/$(SAME $SU $W1)"
[ "$(SAME $MA $W3)/$(SAME $MA $W1)" = "200/403" ] && pass "Maid (COCO): สาขาที่ประจำ C0001 200 · สาขาอื่น 403" || fail "Maid (COCO): $(SAME $MA $W3)/$(SAME $MA $W1)"

echo "═══ ดูในฐานะ"
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
AV=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token||""')
[ -n "$AV" ] && [ "$(SAME $AV $W1)" = "403" ] && [ "$(SAME $AV $W2)" = "200" ] \
  && pass "แอดมินดูในฐานะช่าง: ใบทีมอื่น 403 · ใบที่ช่างเปิดเอง 200 (เท่าช่างจริง)" || fail "ดูในฐานะ: $(SAME $AV $W1)/$(SAME $AV $W2)"
POST $AV auth/view-as/stop '{}' >/dev/null

[ -z "$FAILED" ]
