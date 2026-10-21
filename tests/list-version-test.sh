#!/bin/bash
# ทดสอบ: ลายนิ้วมือรายการใบงาน (GET /work-orders/version) — ตัวเช็คของใหม่แบบเบา (ต.ค. 69 แก้หน้าโหลดช้า)
#   · ไม่มีอะไรเปลี่ยน = ค่าเดิม · เปิดใบ / เดินขั้น / แนบรูป (ไม่แตะตัวใบ) / ลบ = ค่าเปลี่ยน
#   · ตามตัวกรองเดียวกับรายการ · คำตอบเล็ก (ไม่กี่สิบไบต์) · ไม่ล็อกอิน = 401
# ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001)
IDS=""
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
# คืนภาคของ S001 ใน trap — สคริปต์จบกลางทาง (set -e) ก็ยังคืน
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
V() { curl -s "localhost:4000/api/work-orders/version?status=${1:-ACTIVE}" -H "$(H $A)" | J 'd.version'; }

[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/version)" = "401" ] && pass "ไม่ล็อกอิน: 401" || fail "ไม่ล็อกอินก็ได้"
V0=$(V); V0b=$(V)
[ -n "$V0" ] && [ "$V0" = "$V0b" ] && pass "ไม่มีอะไรเปลี่ยน ค่าเดิม" || fail "ค่าไม่คงที่: $V0 / $V0b"
SIZE=$(curl -s "localhost:4000/api/work-orders/version?status=ACTIVE" -H "$(H $A)" | wc -c)
[ "$SIZE" -lt 400 ] && pass "คำตอบเล็ก ($SIZE ไบต์ — รายการจริงหลายสิบ KB)" || fail "คำตอบใหญ่ $SIZE"

W=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W91","symptom":"ทดสอบลายนิ้วมือ"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$W"
[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "NEW" ] || fail "เตรียมใบไม่ได้"
V1=$(V); [ "$V1" != "$V0" ] && pass "เปิดใบใหม่: ค่าเปลี่ยน" || fail "เปิดใบแล้วค่าไม่เปลี่ยน"
S=$(login S001)
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
curl -s -X POST localhost:4000/api/work-orders/$W/parts -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "PARTS_CHECKED" ] && V2=$(V) && [ "$V2" != "$V1" ] \
  && pass "เดินขั้น (ฐานข้อมูล PARTS_CHECKED): ค่าเปลี่ยน" || fail "เดินขั้นแล้วค่าไม่เปลี่ยน"
curl -s -X POST "localhost:4000/api/work-orders/$W/attachments" -H "$(H $A)" -F "file=@$(dirname "$0")/site-photo.png;type=image/png" >/dev/null
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W")" = "1" ] && V3=$(V) && [ "$V3" != "$V2" ] \
  && pass "แนบรูป (ไม่แตะตัวใบ แต่มีประวัติ): ค่าเปลี่ยน" || fail "แนบรูปแล้วค่าไม่เปลี่ยน"
VD=$(V DONE); curl -s -X POST localhost:4000/api/work-orders/$W/attachments -H "$(H $A)" -F "file=@$(dirname "$0")/site-photo.png;type=image/png" >/dev/null
[ "$(V DONE)" = "$VD" ] && pass "ตามตัวกรอง: ใบที่ไม่อยู่ในรายการ \"ปิดแล้ว\" เปลี่ยน แต่ลายนิ้วมือของรายการนั้นไม่เปลี่ยน" || fail "ลายนิ้วมือไม่ตามตัวกรอง"
V4=$(V); curl -s -X DELETE "localhost:4000/api/work-orders/$W" -H "$(H $A)" >/dev/null; IDS=""
[ "$(DB "select count(*) from \"WorkOrder\" where id=$W")" = "0" ] && [ "$(V)" != "$V4" ] && pass "ลบใบ: ค่าเปลี่ยน" || fail "ลบแล้วค่าไม่เปลี่ยน"

[ -z "$FAILED" ]
