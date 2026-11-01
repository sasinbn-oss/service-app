#!/bin/bash
# ทดสอบ: รอบเจ้าของงานขอ ต.ค. 69 — ปิดงานใบงาน SUB · ขนาดเครื่อง · "ช่างเข้าดำเนินการแก้ไขเรียบร้อย"
#   · ใบงาน SUB ต้องเลือกทีม SUB (ไม่รู้จัก/ไม่เลือก = 400) · บันทึก closeSubTeam + ประวัติ · ใบทีมปกติยังต้องมีคนเหมือนเดิม
#   · รายการ/งานของฉัน ส่งขนาดเครื่อง (machineCapacityKg)
#   · หัวหน้าภาคปิดแบบช่างแก้ไขเรียบร้อย: ต้องมีใครเข้า วันที่ (ไม่เกินวันนี้) รูปหลังซ่อม → DONE + FIXED (ไม่ใช่ SUPERVISOR_CLOSED)
#     บันทึกคนเข้า อะไหล่ที่ใช้ · เหตุผลอื่นยังเป็น SUPERVISOR_CLOSED
# ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
. "$(dirname "$0")/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
ATT() { curl -s -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@$(dirname "$0")/site-photo.png;type=image/png" -F "role=$3" >/dev/null; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
OS=ZZOS$RANDOM
IDS=""; MACH=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"OutsourceTeam\" where name like 'ZZOS%'" >/dev/null
  [ -n "$MACH" ] && DB "update \"Machine\" set \"capacityKg\"=$OLD_CAP where id=$MACH" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
S=$(login S001); T=$(login T001)
POST $A teams/outsource "{\"name\":\"$OS\"}" >/dev/null
mk() { POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"W8$1\",\"symptom\":\"ทดสอบรอบสอง\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
TODAY=$(node -pe 'new Date(Date.now()+7*3600e3).toISOString().slice(0,10)')
CLOSE_OK='{"result":"FIXED","note":"เปลี่ยนบอร์ดแล้ว ทดสอบปกติ"'

echo "═══ ปิดงานใบงาน SUB"
W=$(mk 1); IDS="$W"
POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$OS\",\"scheduledAt\":\"$TODAY\"}}" >/dev/null
# งานวันนี้ติดเวลาปิดรับเสมอ (เส้นตายคือเมื่อวาน) — แอดมินติ๊ก "แก้เป็นงานด่วนไปพร้อมกัน" ตอนคอนเฟิร์ม หัวหน้าภาคจึงปล่อยได้ทุกเวลา
POST $A work-orders/$W/confirm-appointment '{"urgent":true}' >/dev/null
POST $S work-orders/$W/dispatch '{}' >/dev/null
for r in NAMEPLATE BEFORE AFTER; do ATT $S $W $r; done
[ "$(PC $S work-orders/$W/close "$CLOSE_OK,\"otherWorkers\":\"ทีม $OS\"}")" = "400" ] && [ "$(DB "select status from \"WorkOrder\" where id=$W")" = "IN_PROGRESS" ] \
  && pass "ใบงาน SUB ไม่เลือกทีม SUB: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่เลือกทีม SUB ก็ปิดได้"
[ "$(PC $S work-orders/$W/close "$CLOSE_OK,\"subTeam\":\"ทีมที่ไม่มีจริง\"}")" = "400" ] && pass "ทีม SUB ที่ไม่รู้จัก: 400" || fail "ทีม SUB ปลอมผ่าน"
POST $S work-orders/$W/close "$CLOSE_OK,\"subTeam\":\"$OS\",\"otherWorkers\":\"นายสมชาย\"}" >/dev/null
[ "$(DB "select status||'|'||coalesce(\"closeSubTeam\",'-')||'|'||coalesce(\"closeOtherWorkers\",'-') from \"WorkOrder\" where id=$W")" = "DONE|$OS|นายสมชาย" ] \
  && [ "$(DB "select (note like 'บันทึกผลงาน SUB · ทีม $OS%')::text from \"WorkOrderLog\" where \"workOrderId\"=$W and action='CLOSED'")" = "true" ] \
  && pass "เลือกทีม SUB: ปิดได้ ฐานข้อมูลเก็บทีม SUB แยกจากชื่อช่าง ประวัติบอกทีม" || fail "ปิด SUB: $(DB "select status, \"closeSubTeam\" from \"WorkOrder\" where id=$W")"
[ "$(curl -s localhost:4000/api/work-orders/$W -H "$(H $A)" | J 'd.subTeam')" = "$OS" ] && pass "หน้าใบงานได้ทีม SUB ที่เข้าทำ" || fail "shape ไม่มี subTeam"

W2=$(mk 2); IDS="$IDS $W2"
POST $S work-orders/$W2/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$TODAY\"}}" >/dev/null
POST $A work-orders/$W2/confirm-appointment '{"urgent":true}' >/dev/null
POST $S work-orders/$W2/dispatch '{}' >/dev/null
for r in NAMEPLATE BEFORE AFTER; do ATT $T $W2 $r; done
[ "$(PC $T work-orders/$W2/close "$CLOSE_OK}")" = "400" ] && [ "$(DB "select status from \"WorkOrder\" where id=$W2")" = "IN_PROGRESS" ] \
  && pass "ใบทีมปกติยังต้องระบุคนเข้า (ไม่ระบุ = 400)" || fail "ใบทีมปกติปิดได้โดยไม่มีคน"

echo "═══ ขนาดเครื่อง"
MACH=$(DB "select \"machineId\" from \"WorkOrder\" where id=$W2"); OLD_CAP=$(DB "select coalesce(\"capacityKg\"::text,'null') from \"Machine\" where id=$MACH")
DB "update \"Machine\" set \"capacityKg\"=25 where id=$MACH" >/dev/null
[ "$(curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $A)" | J "d.rows.find(r=>r.id===$W2).machineCapacityKg")" = "25" ] \
  && pass "รายการใบงานส่งขนาดเครื่อง 25 กก." || fail "รายการไม่มีขนาดเครื่อง"
[ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J "d.rows.find(r=>r.id===$W2).machineCapacityKg")" = "25" ] \
  && pass "งานของฉัน (ช่าง) ส่งขนาดเครื่อง" || fail "my-day ไม่มีขนาดเครื่อง"

echo "═══ ช่างเข้าดำเนินการแก้ไขเรียบร้อย (หัวหน้าภาคปิด)"
W3=$(mk 3); IDS="$IDS $W3"
# อะไหล่ที่ใช้ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ — เดิมหยิบแถวแรกของตาราง ซึ่งอาจเป็นยี่ห้ออื่นหรือไม่มียี่ห้อ
PART=$(fx_part $W3 BOARD)
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
SC() { PC $S work-orders/$W3/supervisor-close "$1"; }
NOTE='"note":"เปลี่ยนบอร์ดแล้ว ทดสอบปกติครบรอบ"'
[ "$(SC "{\"reason\":\"TECH_FIXED\",$NOTE,\"visitDate\":\"$TODAY\"}")" = "400" ] && pass "ไม่บอกใครเข้า: 400" || fail "ไม่มีคนก็ปิดได้"
[ "$(SC "{\"reason\":\"TECH_FIXED\",$NOTE,\"workerIds\":[$TID]}")" = "400" ] && pass "ไม่ใส่วันที่เข้า: 400" || fail "ไม่มีวันก็ปิดได้"
[ "$(SC "{\"reason\":\"TECH_FIXED\",$NOTE,\"workerIds\":[$TID],\"visitDate\":\"2099-01-01\"}")" = "400" ] && pass "วันที่ในอนาคต: 400" || fail "วันอนาคตผ่าน"
[ "$(SC "{\"reason\":\"TECH_FIXED\",$NOTE,\"workerIds\":[$TID],\"visitDate\":\"$TODAY\"}")" = "400" ] && [ "$(DB "select status from \"WorkOrder\" where id=$W3")" = "NEW" ] \
  && pass "ไม่มีรูปหลังซ่อม: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่มีรูปก็ปิดได้"
ATT $S $W3 AFTER
[ "$(SC "{\"reason\":\"TECH_FIXED\",$NOTE,\"workerIds\":[$TID],\"otherWorkers\":\"นายสมศักดิ์\",\"visitDate\":\"$TODAY\",\"parts\":[{\"sparePartId\":$PART,\"quantity\":8}]}")" = "200" ] \
  && [ "$(DB "select status||'|'||\"closeResult\"||'|'||coalesce(\"closeOtherWorkers\",'-') from \"WorkOrder\" where id=$W3")" = "DONE|FIXED|นายสมศักดิ์" ] \
  && [ "$(DB "select count(*) from \"WorkOrderWorker\" where \"workOrderId\"=$W3 and \"userId\"=$TID")" = "1" ] \
  && [ "$(DB "select quantity from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='USED' and \"sparePartId\"=$PART")" = "8" ] \
  && [ "$(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$W3 order by id desc limit 1")" = "CLOSED" ] \
  && pass "ครบ: ปิดเป็นซ่อมเสร็จ (FIXED ไม่ใช่ SUPERVISOR_CLOSED) บันทึกช่าง อะไหล่ 8 ชิ้น ประวัติ CLOSED" || fail "TECH_FIXED: $(DB "select status, \"closeResult\" from \"WorkOrder\" where id=$W3")"
W4=$(mk 4); IDS="$IDS $W4"
POST $S work-orders/$W4/supervisor-close '{"reason":"SELF","note":"โทรถามร้านแล้ว เครื่องกลับมาใช้ได้เอง"}' >/dev/null
[ "$(DB "select status||'|'||\"closeResult\" from \"WorkOrder\" where id=$W4")" = "DONE|SUPERVISOR_CLOSED" ] \
  && pass "เหตุผลอื่นยังเป็นปิดโดยไม่มีช่างเข้า (SUPERVISOR_CLOSED)" || fail "เหตุผลอื่นเพี้ยน"

[ -z "$FAILED" ]
