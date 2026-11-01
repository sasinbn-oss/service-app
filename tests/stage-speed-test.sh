#!/bin/bash
# ทดสอบ: ลดรอบคุยฐานข้อมูลตอนเปลี่ยนขั้น (เจ้าของงานถามว่าทำไมบันทึกแล้วทามไลน์ขึ้นช้า ต.ค. 69)
#   · ปุ่มเปลี่ยนขั้นส่งใบงานทั้งก้อนกลับ (ประวัติเต็ม + ค่าก่อนย้อน) เหมือน GET /:id — แอปใช้เลยไม่ต้องโหลดซ้ำ
#   · คอนเฟิร์มลูกค้า/ปล่อยงานเขียนสถานะ+ประวัติในคำสั่งเดียว: ค่าในใบงานกับประวัติต้องเหมือนแบบเดิมทุกช่อง
#     เวลาเป็น UTC แบบที่ Prisma เขียน (ไม่เลื่อนตามเขตเวลา) · วันนัดเป็นเที่ยงคืน UTC
#   · กดปล่อยงานพร้อมกันสองครั้ง → ผ่านครั้งเดียว อีกครั้ง 409 ประวัติไม่ซ้ำ
#   · ไม่ใช้อะไหล่ + จ่ายงาน: ประวัติสองแถวเรียงถูก (ไม่ใช้อะไหล่ ก่อน จ่ายงาน)
#   · ช่างกดขั้นของหัวหน้าภาคยังโดนปฏิเสธ (สิทธิ์เช็คครบเหมือนเดิม)
# ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001); T=$(login T001)
TODAY=$(node -pe 'new Date(Date.now()+7*3600e3).toISOString().slice(0,10)')
# อายุของเวลาในฐานข้อมูลเทียบกับตอนนี้ (UTC) เป็นวินาที — ถ้าเวลาเลื่อนตามเขตเวลาจะห่างเป็นชั่วโมง
AGE() { DB "select abs(round(extract(epoch from (now() at time zone 'UTC' - $1))))::int from $2"; }

W=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W96","symptom":"ทดสอบความเร็ว"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$W"

echo "═══ ไม่ใช้อะไหล่ + จ่ายงาน"
POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$TODAY\",\"scheduledTime\":\"10:00\"}}" >/dev/null
[ "$(DB "select string_agg(action||'>'||status, ',' order by \"createdAt\", id) from \"WorkOrderLog\" where \"workOrderId\"=$W and action<>'CREATED'")" = "NO_PARTS>PARTS_CHECKED,ASSIGNED>AWAITING_CONFIRM" ] \
  && [ "$(DB "select count(distinct \"createdAt\") from \"WorkOrderLog\" where \"workOrderId\"=$W and action in ('NO_PARTS','ASSIGNED')")" = "2" ] \
  && pass "ประวัติสองแถว เรียง ไม่ใช้อะไหล่ → จ่ายงาน (เวลาไม่ชนกัน)" || fail "ประวัติจ่ายงาน: $(DB "select string_agg(action, ',' order by \"createdAt\", id) from \"WorkOrderLog\" where \"workOrderId\"=$W")"
[ "$(DB "select status||'|'||\"assignedTeam\"||'|'||to_char(\"scheduledAt\",'YYYY-MM-DD HH24:MI')||'|'||\"scheduledTime\"||'|'||\"appointmentStatus\"||'|'||\"needsParts\" from \"WorkOrder\" where id=$W")" = "AWAITING_CONFIRM|$TEAM|$TODAY 00:00|10:00|PENDING|false" ] \
  && pass "ใบงานหลังจ่ายงาน: ค่าสุดท้ายครบทุกช่อง" || fail "ใบงาน: $(DB "select status, \"needsParts\" from \"WorkOrder\" where id=$W")"

echo "═══ คอนเฟิร์มลูกค้า (คำสั่งเดียว)"
[ "$(PC $T work-orders/$W/confirm-appointment '{}')" = "403" ] && pass "ช่างกดคอนเฟิร์มลูกค้าไม่ได้ (403)" || fail "ช่างกดคอนเฟิร์มได้"
BODY=$(POST $A work-orders/$W/confirm-appointment '{"note":"โทรยืนยันแล้ว"}')
[ "$(echo "$BODY" | J "Array.isArray(d.logs) && 'rollbackPrefill' in d && d.logs[0].action==='CONFIRMED' && d.status==='ASSIGNED'")" = "true" ] \
  && pass "ส่งใบงานทั้งก้อนกลับ มีประวัติล่าสุดแล้ว (แอปไม่ต้องโหลดซ้ำ)" || fail "ก้อนที่ส่งกลับไม่ครบ"
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||to_char(\"scheduledAt\",'YYYY-MM-DD HH24:MI')||'|'||\"scheduledTime\"||'|'||coalesce(\"workStatus\",'-') from \"WorkOrder\" where id=$W")" = "ASSIGNED|CONFIRMED|$TODAY 00:00|10:00|WAITING_TECH" ] \
  && pass "ใบงาน: ขั้น สถานะนัด วันนัด (เที่ยงคืน UTC) เวลา ครบ" || fail "ใบงานหลังคอนเฟิร์ม: $(DB "select status, \"scheduledAt\" from \"WorkOrder\" where id=$W")"
L=$(DB "select l.action||'|'||l.status||'|'||u.\"employeeCode\"||'|'||l.note from \"WorkOrderLog\" l join \"User\" u on u.id=l.\"userId\" where \"workOrderId\"=$W order by l.id desc limit 1")
[[ "$L" == "CONFIRMED|ASSIGNED|A001|ลูกค้าคอนเฟิร์ม "*" — โทรยืนยันแล้ว" ]] && pass "ประวัติ: ผู้กด ข้อความ ครบ" || fail "ประวัติ: $L"
[ "$(AGE '"createdAt"' "\"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1")" -lt 60 ] \
  && [ "$(AGE '"updatedAt"' "\"WorkOrder\" where id=$W")" -lt 60 ] \
  && pass "เวลาในประวัติและใบงานเป็น UTC ตรงกับตอนนี้ (ไม่เลื่อนตามเขตเวลา)" || fail "เวลาเพี้ยน: ประวัติห่าง $(AGE '"createdAt"' "\"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1") วิ"

echo "═══ แอดมินแก้เป็นงานด่วน (งานวันนี้ติดเวลาปิดรับเสมอ — เส้นตายคือเมื่อวาน)"
# คอนเฟิร์มข้างบนไม่ติ๊กงานด่วน (ทดสอบทางคำสั่งเดียว) — ปลดล็อกด้วยปุ่มแยก ไม่งั้นปล่อยงานข้างล่างได้ 409 เฉพาะตอนเทสต์รันหลังวันเริ่มกฎ
[ "$(PC $A work-orders/$W/urgent-release '{}')" = "200" ] \
  && [ "$(DB "select to_char(\"urgentReleaseFor\",'YYYY-MM-DD HH24:MI')||'|'||status||'|'||(select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W and action='URGENT_RELEASE') from \"WorkOrder\" where id=$W")" = "$TODAY 00:00|ASSIGNED|1" ] \
  && pass "แก้เป็นงานด่วน: วันที่ปลดล็อก = วันนัด (เที่ยงคืน UTC) ใบอยู่ขั้นเดิม ประวัติหนึ่งแถว (ฐานข้อมูล)" \
  || fail "แก้เป็นงานด่วน: $(DB "select coalesce(\"urgentReleaseFor\"::text,'-')||'|'||status from \"WorkOrder\" where id=$W")"

echo "═══ ปล่อยงานพร้อมกันสองครั้ง"
[ "$(PC $T work-orders/$W/dispatch '{}')" = "403" ] && pass "ช่างกดปล่อยงานไม่ได้ (403)" || fail "ช่างกดปล่อยงานได้"
PC $S work-orders/$W/dispatch '{}' > /tmp/ss1 & PC $S work-orders/$W/dispatch '{"note":"ครั้งที่สอง"}' > /tmp/ss2 & wait
CODES=$(sort /tmp/ss1 /tmp/ss2 | tr '\n' ' '); rm -f /tmp/ss1 /tmp/ss2
[ "$CODES" = "200 409 " ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W and action='DISPATCHED'")" = "1" ] \
  && [ "$(DB "select status||'|'||\"assignedTeam\"||'|'||coalesce(\"assignedToId\"::text,'-') from \"WorkOrder\" where id=$W")" = "IN_PROGRESS|$TEAM|-" ] \
  && pass "กดพร้อมกัน: ผ่านครั้งเดียว อีกครั้ง 409 ประวัติไม่ซ้ำ" || fail "กดพร้อมกัน: $CODES ประวัติ $(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W and action='DISPATCHED'")"
[ "$(PC $S work-orders/$W/dispatch '{}')" = "409" ] && pass "กดซ้ำหลังปล่อยงานแล้ว: 409" || fail "กดซ้ำได้"

[ -z "$FAILED" ]
