#!/bin/bash
# ทดสอบ: ใบ PM เข้าทำทั้งร้าน ไม่ระบุเครื่อง · ปิดงานบังคับแค่รูปหลังทำ (เจ้าของงานขอ ต.ค. 69)
#   · เปิดใบ PM ใส่เลขเครื่องมา → 400 ไม่มีใบใหม่ · ไม่ใส่ → ใบเดียว ไม่ผูกเครื่อง
#   · ใบ PM ไม่มีรูปหลังซ่อม → 400 ฐานข้อมูลไม่เปลี่ยน · มีแค่หลังซ่อม (ไม่มีก่อนซ่อม ไม่มีป้ายรุ่น) → ปิดได้
#   · ใบ PM เก่าที่เคยผูกเครื่องไว้ (ก่อนกติกานี้) ปิดด้วยกติกาเดียวกัน
#   · ใบ CM ยังต้องมีรูปก่อนซ่อมกับป้ายรุ่นเหมือนเดิม
# ตอนเปิดใบงาน รูปบังคับที่ฟอร์มเท่านั้น (เซิร์ฟเวอร์ไม่ได้เช็ค) — ข้อยกเว้น PM ของฟอร์มอยู่ในเทสต์เบราว์เซอร์ pm-photo
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
ATT() { curl -s -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@$(dirname "$0")/site-photo.png;type=image/png" -F "role=$3" >/dev/null; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
S=$(login S001); T=$(login T001)
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
TODAY=$(node -pe 'new Date(Date.now()+7*3600e3).toISOString().slice(0,10)')
# เปิดใบงานแล้วพาไปถึงคิวช่างปิดงาน (ไม่ใช้อะไหล่)
mk() {
  local W M
  [ -n "$2" ] && M="\"code\":\"W8$2\"," || M=""
  W=$(POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"$1\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{$M\"symptom\":\"ทดสอบรูป PM\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$TODAY\"}}" >/dev/null
  POST $A work-orders/$W/confirm-appointment '{}' >/dev/null
  POST $S work-orders/$W/dispatch '{}' >/dev/null
  echo "$W"
}
CLOSE="{\"result\":\"FIXED\",\"note\":\"ทำ PM ตามรอบ ทดสอบปกติ\",\"workerIds\":[$TID]}"
ST() { DB "select status from \"WorkOrder\" where id=$1"; }

echo "═══ เปิดใบ PM"
BEFORE=$(DB "select count(*) from \"WorkOrder\"")
R=$(POST $A work-orders '{"branchCode":"C0006","jobType":"PM","priority":"NORMAL","machines":[{"code":"W81","symptom":"PM"},{"code":"W82","symptom":"PM"}]}')
echo "$R" | grep -q "ไม่ต้องระบุเครื่อง" && [ "$(DB "select count(*) from \"WorkOrder\"")" = "$BEFORE" ] \
  && pass "ใบ PM ใส่เลขเครื่องมา: 400 ไม่มีใบใหม่" || fail "ใบ PM รับเลขเครื่อง: $(echo $R | head -c 140)"

echo "═══ ปิดใบ PM"
W=$(mk PM); IDS="$W"
[ "$(DB "select \"jobType\"||'|'||coalesce(\"machineId\"::text,'ทั้งร้าน') from \"WorkOrder\" where id=$W")|$(ST $W)" = "PM|ทั้งร้าน|IN_PROGRESS" ] \
  && pass "ใบ PM ไม่ผูกเครื่อง ถึงคิวช่างปิดงาน" || fail "เตรียมใบ PM ไม่ได้: $(ST $W)"
R=$(POST $T work-orders/$W/close "$CLOSE")
echo "$R" | grep -q "หลังซ่อม" && [ "$(ST $W)" = "IN_PROGRESS" ] \
  && pass "ใบ PM ไม่มีรูปหลังทำ: ปิดไม่ได้ (บอกว่าขาดรูปหลังซ่อม ไม่ใช่ก่อนซ่อม/ป้ายรุ่น)" || fail "PM ไม่มีรูปหลังทำ: $(echo $R | head -c 140) · $(ST $W)"
ATT $T $W AFTER
R=$(POST $T work-orders/$W/close "$CLOSE")
[ "$(ST $W)" = "DONE" ] && [ "$(DB "select \"closeResult\" from \"WorkOrder\" where id=$W")" = "FIXED" ] \
  && [ "$(DB "select coalesce(string_agg(role,','),'') from \"WorkOrderAttachment\" where \"workOrderId\"=$W")" = "AFTER" ] \
  && pass "ใบ PM มีแค่รูปหลังทำ: ปิดได้ (DONE · FIXED · ไฟล์มีแค่ AFTER)" || fail "PM ปิดไม่ได้: $(echo $R | head -c 140)"
[ "$(curl -s localhost:4000/api/work-orders/$W -H "$(H $A)" | J 'd.beforeCount+"|"+d.afterCount')" = "0|1" ] \
  && pass "หน้าใบงานนับรูปก่อน 0 หลัง 1" || fail "นับรูปผิด"

echo "═══ ใบ PM เก่าที่เคยผูกเครื่อง"
W3=$(mk CM 3); IDS="$IDS $W3"
DB "update \"WorkOrder\" set \"jobType\"='PM' where id=$W3" >/dev/null
ATT $T $W3 AFTER
POST $T work-orders/$W3/close "$CLOSE" >/dev/null
[ "$(DB "select \"jobType\"||'|'||(\"machineId\" is not null)::text from \"WorkOrder\" where id=$W3")|$(ST $W3)" = "PM|true|DONE" ] \
  && pass "ใบ PM เก่าที่มีเครื่อง: มีแค่รูปหลังทำก็ปิดได้" || fail "ใบ PM เก่าปิดไม่ได้: $(ST $W3)"

echo "═══ ใบ CM ยังบังคับรูปก่อนซ่อมกับป้ายรุ่น"
W2=$(mk CM 2); IDS="$IDS $W2"
ATT $T $W2 AFTER
R=$(POST $T work-orders/$W2/close "$CLOSE")
echo "$R" | grep -q "ก่อนซ่อม" && [ "$(ST $W2)" = "IN_PROGRESS" ] \
  && pass "ใบ CM ไม่มีรูปก่อนซ่อม: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "CM ปิดได้โดยไม่มีรูปก่อน: $(echo $R | head -c 140) · $(ST $W2)"
ATT $T $W2 BEFORE
R=$(POST $T work-orders/$W2/close "$CLOSE")
echo "$R" | grep -q "ป้ายรุ่น" && [ "$(ST $W2)" = "IN_PROGRESS" ] \
  && pass "ใบ CM ไม่มีป้ายรุ่น: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "CM ปิดได้โดยไม่มีป้ายรุ่น: $(echo $R | head -c 140)"
ATT $T $W2 NAMEPLATE
POST $T work-orders/$W2/close "$CLOSE" >/dev/null
[ "$(ST $W2)" = "DONE" ] && pass "ใบ CM มีครบแล้วปิดได้" || fail "CM ครบแล้วยังปิดไม่ได้"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
