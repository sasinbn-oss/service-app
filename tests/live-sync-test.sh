#!/bin/bash
# ทดสอบ: ข้อมูลไม่ค้างเมื่อหลายคนเปิดใบงานเดียวกัน (ต.ค. 69)
#   · GET /work-orders/:id/version = เลขประวัติล่าสุด + ใครทำ · เปลี่ยนอะไรก็ขยับ
#   · PATCH พร้อม expectedVersion: คนอื่นแก้ไปก่อน → 409 บอกชื่อ ไม่บันทึกทับ · ของตัวเองไม่นับ · ไม่ส่งมา = ไม่เช็ค
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
VER() { curl -s "localhost:4000/api/work-orders/$1/version" -H "$(H $A)"; }
PATCH() { curl -s -X PATCH "localhost:4000/api/work-orders/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
SNAME=$(DB "select name from \"User\" where \"employeeCode\"='S001'")
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
OLDR=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
R=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
S=$(login S001)

ID=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactName":"คุณเดิม","machines":[{"code":"W95","symptom":"ทดสอบสองคน"}]}' | J 'd.orders[0].id')

echo "═══ รุ่นข้อมูลของใบงาน"
V0=$(VER $ID)
[ "$(echo "$V0" | J 'd.v')" = "$(DB "select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$ID")" ] && pass "v = เลขประวัติล่าสุด (ฐานข้อมูล)" || fail "version: $V0"
echo "$V0" | J 'd.byName+"|"+d.statusLabel' | grep -q "^$ANAME|หัวหน้าภาค · ระบุอะไหล่$" && pass "บอกว่าใครทำล่าสุด และขั้นตอนตอนนี้" || fail "version: $V0"
V=$(echo "$V0" | J 'd.v')
PATCH $S $ID '{"symptom":"หัวหน้าภาคแก้"}' >/dev/null
V1=$(VER $ID)
[ "$(echo "$V1" | J 'd.v')" -gt "$V" ] && echo "$V1" | J 'd.byName' | grep -q "^$SNAME$" && pass "อีกคนแก้ → รุ่นขยับ บอกชื่อคนแก้" || fail "หลังแก้: $V1"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/999999/version" -H "$(H $A)")" = 404 ] && pass "ใบที่ไม่มี → 404" || fail "ใบที่ไม่มีไม่ตอบ 404"

echo
echo "═══ บันทึกทับของคนอื่นไม่ได้"
R=$(PATCH $A $ID "{\"expectedVersion\":$V,\"contactName\":\"คุณทับ\"}")
echo "$R" | grep -q "$SNAME แก้ใบงานนี้ไปแล้ว" && echo "$R" | J 'd.stale' | grep -q true \
  && [ "$(DB "select \"contactName\" from \"WorkOrder\" where id=$ID")" = "คุณเดิม" ] \
  && pass "แก้ด้วยรุ่นเก่า → 409 บอกว่าใครแก้ไปก่อน ฐานข้อมูลไม่เปลี่ยน" || fail "บันทึกทับได้: $R"
V2=$(VER $ID | J 'd.v')
PATCH $A $ID "{\"expectedVersion\":$V2,\"contactName\":\"คุณใหม่\"}" >/dev/null
[ "$(DB "select \"contactName\" from \"WorkOrder\" where id=$ID")" = "คุณใหม่" ] && pass "โหลดรุ่นล่าสุดแล้วบันทึกได้ (ฐานข้อมูล)" || fail "บันทึกรุ่นล่าสุดไม่ได้"
PATCH $A $ID '{"symptom":"แอดมินแก้เองอีกรอบ"}' >/dev/null
R=$(PATCH $A $ID "{\"expectedVersion\":$V2,\"contactName\":\"คุณใหม่2\"}")
[ "$(DB "select \"contactName\" from \"WorkOrder\" where id=$ID")" = "คุณใหม่2" ] && pass "ประวัติที่ใหม่กว่าเป็นของตัวเอง → ไม่นับ บันทึกได้" || fail "ของตัวเองโดนกัน: $R"
PATCH $S $ID '{"contactName":"ไม่ส่งรุ่น"}' >/dev/null
[ "$(DB "select \"contactName\" from \"WorkOrder\" where id=$ID")" = "ไม่ส่งรุ่น" ] && pass "แอปรุ่นเก่าไม่ส่ง expectedVersion → ไม่เช็ค (ทำงานเหมือนเดิม)" || fail "แอปเก่าโดนกัน"

echo
echo "═══ กดขั้นตอนที่คนอื่นทำไปแล้ว → 409"
PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"needsParts":false}')" = 409 ] \
  && pass "ขั้นเดินไปแล้ว กดขั้นเดิมซ้ำ → 409 (แอปจับแล้วโหลดใหม่)" || fail "ไม่ได้ 409"

curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$OLDR\"}" >/dev/null
curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$ID" -H "$(H $A)"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
