#!/bin/bash
# ทดสอบ: คอนเฟิร์มวันใหม่ + หน้า "งานของฉันวันนี้" ของช่าง (เจ้าของงานเลือก ต.ค. 69)
#   · ลูกค้าขอเปลี่ยนวัน → รายการติด rescheduled · หัวหน้าภาค "ทีมไม่ว่าง ส่งกลับแอดมิน" (ต้องมีเหตุผล · ช่างกดไม่ได้)
#     → กลับไปขั้นคอนเฟิร์มลูกค้า ทีมเดิม นัดรอคอนเฟิร์ม · ลูกค้ายืนยันวันที่หัวหน้าภาคส่งกลับ = ยังติด rescheduled
#     (หัวหน้าภาคต้องรับทราบวันนั้นอีกรอบ)
#   · GET /my-day: งานที่ปล่อยให้ทีมแล้ว · POST /arrive: บันทึกเวลา+พิกัด (ลงรายงานตัวเข้าสาขาด้วย) ไม่เดินขั้น
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
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
IDS=""
CHECKIN0=$(DB "select coalesce(max(id),0) from \"BranchCheckIn\"")
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"BranchCheckIn\" where id>$CHECKIN0" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
S=$(login S001); T=$(login T001)
TODAY=$(node -pe 'new Date(Date.now()+7*3600e3).toISOString().slice(0,10)')
TOMORROW=$(node -pe 'new Date(Date.now()+31*3600e3).toISOString().slice(0,10)')
ST() { DB "select status||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::date::text,'-')||'|'||coalesce(\"appointmentStatus\",'-') from \"WorkOrder\" where id=$1"; }
RESCHED() { curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J "const r=d.rows.find(x=>x.id===$1); r ? String(r.rescheduled) : 'missing'"; }

echo "═══ ลูกค้าขอเปลี่ยนวัน → หัวหน้าภาคคอนเฟิร์มวันใหม่ / ส่งกลับแอดมิน"
W=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W95","symptom":"ทดสอบงานของฉัน"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$W"
POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$TODAY\",\"scheduledTime\":\"10:00\"}}" >/dev/null
POST $A work-orders/$W/confirm-appointment "{\"scheduledAt\":\"$TOMORROW\",\"note\":\"ร้านปิดวันนี้\"}" >/dev/null
[ "$(ST $W)" = "ASSIGNED|$TEAM|$TOMORROW|CONFIRMED" ] && [ "$(RESCHED $W)" = "true" ] \
  && pass "ลูกค้าเปลี่ยนวัน: ไปหาหัวหน้าภาค ติด rescheduled (ป้ายคอนเฟิร์มวันใหม่)" || fail "หลังเปลี่ยนวัน: $(ST $W) rescheduled=$(RESCHED $W)"
[ "$(PC $S work-orders/$W/decline-new-date '{"reason":""}')" = "400" ] && [ "$(ST $W)" = "ASSIGNED|$TEAM|$TOMORROW|CONFIRMED" ] \
  && pass "ส่งกลับโดยไม่บอกเหตุผล: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่มีเหตุผลก็ส่งกลับได้"
[ "$(PC $T work-orders/$W/decline-new-date '{"reason":"ไม่ว่าง"}')" = "403" ] && pass "ช่างกดส่งกลับไม่ได้ (403)" || fail "ช่างส่งกลับได้"
POST $S work-orders/$W/decline-new-date '{"reason":"ทีมเต็มวันนั้น ขอเป็นสัปดาห์หน้า"}' >/dev/null
[ "$(ST $W)" = "AWAITING_CONFIRM|$TEAM|$TOMORROW|PENDING" ] \
  && [ "$(DB "select action||'>'||status from \"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1")" = "NEW_DATE_DECLINED>AWAITING_CONFIRM" ] \
  && [ "$(DB "select (note like '%ทีมเต็มวันนั้น%')::text from \"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1")" = "true" ] \
  && pass "ทีมไม่ว่าง: กลับขั้นคอนเฟิร์มลูกค้า ทีมเดิม นัดรอคอนเฟิร์ม ประวัติมีเหตุผล" || fail "ส่งกลับ: $(ST $W)"
POST $A work-orders/$W/confirm-appointment '{}' >/dev/null
# กฎป้ายเปลี่ยน (เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง): ดูการนัด/ปล่อยของหัวหน้าภาค vs การเลื่อนครั้งล่าสุด — คอนเฟิร์มเฉย ๆ
# ไม่ล้างป้าย (แอดมินเลื่อนระหว่างเบิกแล้วคอนเฟิร์มทีหลัง ป้ายต้องอยู่) · วันนี้คือวันที่หัวหน้าภาคเพิ่งบอกว่าทีมไม่ว่าง
# จึงต้องขึ้น "คอนเฟิร์มวันใหม่" ให้หัวหน้าภาคตัดสินอีกรอบ ไม่ใช่ปล่อยผ่านเหมือนนัดปกติ
[ "$(ST $W)" = "ASSIGNED|$TEAM|$TOMORROW|CONFIRMED" ] && [ "$(RESCHED $W)" = "true" ] \
  && pass "ลูกค้ายืนยันวันที่หัวหน้าภาคส่งกลับ: ไปหัวหน้าภาค ยังติด rescheduled (ต้องรับทราบวันนั้นอีกรอบ)" || fail "ตกลงวันเดิม: $(ST $W) rescheduled=$(RESCHED $W)"

echo "═══ งานของฉันวันนี้ + ถึงหน้างาน"
DB "update \"WorkOrder\" set \"scheduledAt\"='$TODAY' where id=$W" >/dev/null
# งานวันนี้ติดเวลาปิดรับเสมอ (เส้นตายคือเมื่อวาน) — แอดมินแก้เป็นงานด่วนก่อน หัวหน้าภาคจึงปล่อยได้ไม่ว่ารันเทสต์กี่โมง
[ "$(PC $A work-orders/$W/urgent-release '{"reason":"ทดสอบงานของฉันวันนี้"}')" = "200" ] \
  && [ "$(DB "select \"urgentReleaseFor\"::date from \"WorkOrder\" where id=$W")" = "$TODAY" ] \
  || fail "แก้เป็นงานด่วนก่อนปล่อยงานวันนี้ไม่ผ่าน: $(DB "select coalesce(\"urgentReleaseFor\"::text,'-') from \"WorkOrder\" where id=$W")"
[ "$(CODE -X POST localhost:4000/api/work-orders/$W/arrive -H "$(H $T)" -H 'Content-Type: application/json' -d '{}')" = "409" ] \
  && pass "ยังไม่ปล่อยงาน กดถึงหน้างานไม่ได้ (409)" || fail "ถึงหน้างานก่อนปล่อยงานได้"
[ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J "d.rows.some(r=>r.id===$W)")" = "false" ] \
  && pass "ยังไม่ปล่อยงาน ไม่ขึ้นในงานของฉัน" || fail "ใบที่ยังไม่ปล่อยขึ้นในงานของฉัน"
POST $S work-orders/$W/dispatch '{}' >/dev/null
DAY=$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)")
[ "$(echo "$DAY" | J "const r=d.rows.find(x=>x.id===$W); r ? [r.scheduledAt, r.scheduledTime, r.arrivedAt, r.done].join('|') : 'missing'")" = "$TODAY|10:00||false" ] \
  && [ "$(echo "$DAY" | J 'd.today')" = "$TODAY" ] && pass "ปล่อยงานแล้วขึ้นในงานของฉัน วันนี้ 10:00 ยังไม่ถึงหน้างาน" || fail "my-day: $(echo "$DAY" | head -c 300)"
LAT=$(DB "select latitude from \"Branch\" where code='C0006'"); LNG=$(DB "select longitude from \"Branch\" where code='C0006'")
R=$(POST $T work-orders/$W/arrive "{\"latitude\":$LAT,\"longitude\":$LNG}")
[ "$(echo "$R" | J 'd.withinRadius')" = "true" ] && [ "$(DB "select status from \"WorkOrder\" where id=$W")" = "IN_PROGRESS" ] \
  && [ "$(DB "select action||'|'||status from \"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1")" = "ARRIVED|IN_PROGRESS" ] \
  && [ "$(DB "select \"withinRadius\"::text||'|'||note from \"BranchCheckIn\" where id>$CHECKIN0 order by id desc limit 1")" = "true|ถึงหน้างาน $(DB "select code from \"WorkOrder\" where id=$W")" ] \
  && pass "ถึงหน้างาน: บันทึกประวัติ + รายงานตัวเข้าสาขา (ในรัศมี) ใบยังอยู่ขั้นเดิม" || fail "arrive: $R"
[ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J "!!d.rows.find(x=>x.id===$W).arrivedAt")" = "true" ] \
  && pass "งานของฉันบอกว่าถึงหน้างานแล้ว (ปุ่มเปลี่ยนเป็นปิดงาน)" || fail "arrivedAt ไม่ขึ้น"
R2=$(POST $T work-orders/$W/arrive '{"latitude":13.75,"longitude":100.5}')
[ "$(echo "$R2" | J 'd.withinRadius')" = "false" ] && [ "$(DB "select \"withinRadius\"::text from \"BranchCheckIn\" where id>$CHECKIN0 order by id desc limit 1")" = "false" ] \
  && pass "อยู่ไกลสาขา: ไม่บล็อก แต่บันทึกว่านอกรัศมี" || fail "นอกรัศมี: $R2"
R3=$(POST $T work-orders/$W/arrive '{}')
[ "$(echo "$R3" | J 'd.note')" = "ถึงหน้างาน (ไม่มีพิกัดจากเครื่อง)" ] && pass "ไม่มีพิกัด (ปิด GPS): บันทึกได้ บอกว่าไม่มีพิกัด" || fail "ไม่มีพิกัด: $R3"
[ "$(curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $A)" | J "d.rows.find(r=>r.id===$W).stageSince === d.rows.find(r=>r.id===$W).stageSince && new Date(d.rows.find(r=>r.id===$W).stageSince) < new Date($(DB "select extract(epoch from max(\"createdAt\"))*1000 from \"WorkOrderLog\" where \"workOrderId\"=$W and action='ARRIVED'"))")" = "true" ] \
  && pass "ถึงหน้างานไม่นับเป็นการเดินขั้น (วันค้างไม่รีเซ็ต)" || fail "ARRIVED รีเซ็ตวันค้าง"
DB "update \"User\" set team='ทีมที่ไม่ใช่' where \"employeeCode\"='T001'" >/dev/null
[ "$(PC $T work-orders/$W/arrive '{}')" = "403" ] && pass "ช่างทีมอื่นกดถึงหน้างานไม่ได้ (403)" || fail "ช่างทีมอื่นกดได้"
[ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J "d.rows.some(r=>r.id===$W)")" = "false" ] && pass "ช่างทีมอื่นไม่เห็นในงานของฉัน" || fail "ทีมอื่นเห็น"

[ -z "$FAILED" ]
