#!/bin/bash
# ทดสอบ: หัวหน้าภาคส่งกลับให้แอดมินตรวจสอบ โดยขั้นตอนไม่เปลี่ยน (เจ้าของงานขอ ต.ค. 69)
#   · ส่ง: เฉพาะหัวหน้าภาคเจ้าของใบ · ต้องเลือกเรื่อง + รายละเอียด · ทีละคำขอ · ขั้นของใบไม่เปลี่ยน (ฐานข้อมูล)
#   · ระหว่างรอ หัวหน้าภาคเดินขั้นต่อได้ · คำขอเข้ากล่องงานแอดมิน (ตัวเลขตรงกับรายการ)
#   · ยกเลิกได้ก่อนแอดมินตอบ · แอดมินตอบต้องพิมพ์ · ตอบแล้วเข้ากล่องหัวหน้าภาคจนกดรับทราบ (แม้ใบอยู่ขั้นแอดมิน)
#   · ใบที่ถูกยกเลิกไม่ค้างในกล่องแอดมิน · ประวัติบันทึกทั้งส่ง/ยกเลิก/ตอบ ที่ขั้นเดิม
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
VISIT=$(day 33)
A=$(login A001); S=$(login S001); T=$(login T001)
[ "$(DB "select region from \"User\" where \"employeeCode\"='S001'")|$(DB "select region from \"Branch\" where code='C0006'")" = "ใต้|ใต้" ] \
  || { echo "FAIL ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้ · C0006 ภาคใต้)"; exit 1; }
SUF=$((RANDOM % 9000 + 1000))
POST $A auth/users "{\"employeeCode\":\"RV$SUF\",\"name\":\"หัวหน้าภาคอื่นทดสอบตรวจสอบ\",\"role\":\"EMPLOYEE\",\"password\":\"temp12345\"}" >/dev/null
ZID=$(DB "select id from \"User\" where \"employeeCode\"='RV$SUF'")
curl -s -X PATCH "localhost:4000/api/auth/users/$ZID" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"role":"SUPERVISOR","region":"กลาง-ตะวันตก"}' >/dev/null
DB "update \"User\" set \"mustChangePassword\"=false where id=$ZID" >/dev/null
Z=$(login "RV$SUF" temp12345)
W=""; W2=""
cleanup() {
  for w in $W $W2; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$w" -H "$(H $A)"; done
  DB "delete from \"User\" where id=$ZID" >/dev/null
}
trap cleanup EXIT
W=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W5","symptom":"ทดสอบส่งให้แอดมินตรวจสอบ"}]}' | J 'd.orders?d.orders[0].id:d.id')
REV() { DB "select coalesce(string_agg(reason||'|'||(\"repliedAt\" is not null)::text||'|'||(\"cancelledAt\" is not null)::text||'|'||(\"ackAt\" is not null)::text, ',' order by id),'-') from \"AdminReview\" where \"workOrderId\"=$W"; }
ST() { DB "select status from \"WorkOrder\" where id=$W"; }
inbox() { GET $1 "work-orders?status=INBOX" | J "d.rows.some(r=>r.id===$W)"; }

echo "═══ ส่ง: สิทธิ์และข้อมูลที่ต้องมี"
[ "$(CODE $S "work-orders/$W/admin-review" '{"note":"ไม่ได้เลือกเรื่อง"}')|$(CODE $S "work-orders/$W/admin-review" '{"reason":"MACHINE","note":"สั้น"}')" = "400|400" ] \
  && [ "$(REV)" = "-" ] && pass "ไม่เลือกเรื่อง / รายละเอียดสั้นเกิน = 400 ไม่มีคำขอเกิดขึ้น" || fail "ตรวจข้อมูลส่ง: $(REV)"
[ "$(CODE $T "work-orders/$W/admin-review" '{"reason":"MACHINE","note":"ช่างลองส่งเอง"}')|$(CODE $A "work-orders/$W/admin-review" '{"reason":"MACHINE","note":"แอดมินลองส่งเอง"}')|$(CODE $Z "work-orders/$W/admin-review" '{"reason":"MACHINE","note":"หัวหน้าภาคอื่นลองส่ง"}')" = "403|403|403" ] \
  && [ "$(REV)" = "-" ] && pass "ช่าง / แอดมิน / หัวหน้าภาคนอกพื้นที่ ส่งไม่ได้ (403)" || fail "สิทธิ์ส่ง: $(REV)"

R=$(POST $S "work-orders/$W/admin-review" '{"reason":"MACHINE","note":"ร้านแจ้งว่าเครื่องที่เสียคือ W12 ไม่ใช่ W5"}')
[ "$(REV)|$(ST)" = "MACHINE|false|false|false|NEW" ] && echo "$R" | J 'd.adminReview.reasonLabel+"|"+d.adminReview.answered' | grep -q "^เครื่อง/รุ่นไม่ถูก|false$" \
  && pass "หัวหน้าภาคส่งได้ · ขั้นตอนไม่เปลี่ยน (ยัง NEW) · ใบงานบอกคำขอที่รอ" || fail "ส่ง: $(REV) $(ST) $(echo "$R" | head -c 160)"
[ "$(CODE $S "work-orders/$W/admin-review" '{"reason":"CONTACT","note":"ส่งซ้ำอีกเรื่อง"}')" = "409" ] && [ "$(DB "select count(*) from \"AdminReview\" where \"workOrderId\"=$W")" = "1" ] \
  && pass "ส่งซ้ำระหว่างรอ = 409 (ทีละคำขอ)" || fail "ส่งซ้ำได้"
[ "$(DB "select action||'|'||status from \"WorkOrderLog\" where \"workOrderId\"=$W order by id desc limit 1")" = "ADMIN_REVIEW_REQUESTED|NEW" ] \
  && pass "ประวัติบันทึกการส่ง ที่ขั้นเดิม" || fail "ประวัติส่ง"

echo
echo "═══ กล่องงาน"
AL=$(GET $A "work-orders?status=INBOX"); AC=$(GET $A work-orders/inbox-count | J 'd.inbox')
[ "$(echo "$AL" | J "d.rows.some(r=>r.id===$W && r.adminReview && !r.adminReview.answered)")|$(echo "$AL" | J 'd.rows.length+"|"+d.counts.INBOX')" = "true|$AC|$AC" ] \
  && pass "คำขอเข้ากล่องงานแอดมิน · ตัวเลขกล่องงานตรงกับรายการ ($AC)" || fail "กล่องแอดมิน: $(echo "$AL" | J 'd.rows.length+"|"+d.counts.INBOX') นับ $AC"
POST $S "work-orders/$W/parts" '{"needsParts":false}' >/dev/null
[ "$(ST)|$(REV)|$(inbox $A)" = "PARTS_CHECKED|MACHINE|false|false|false|true" ] \
  && pass "ระหว่างรอ หัวหน้าภาคเดินขั้นต่อได้ (ไม่ล็อกใบ) · คำขอยังอยู่ในกล่องแอดมิน" || fail "เดินขั้นระหว่างรอ: $(ST) $(REV) $(inbox $A)"

echo
echo "═══ ยกเลิกคำขอ"
[ "$(CODE $Z "work-orders/$W/admin-review/cancel" '{}')" = "403" ] && pass "หัวหน้าภาคนอกพื้นที่ยกเลิกไม่ได้" || fail "คนนอกยกเลิกได้"
POST $S "work-orders/$W/admin-review/cancel" '{}' >/dev/null
[ "$(REV)|$(inbox $A)|$(CODE $S "work-orders/$W/admin-review/cancel" '{}')" = "MACHINE|false|true|false|false|409" ] \
  && pass "ยกเลิกได้ก่อนแอดมินตอบ · ออกจากกล่องแอดมิน · ยกเลิกซ้ำ = 409" || fail "ยกเลิก: $(REV) $(inbox $A)"
[ "$(CODE $A "work-orders/$W/admin-review/reply" '{"reply":"ตอบเรื่องที่ยกเลิกไปแล้ว"}')" = "409" ] && pass "ตอบคำขอที่ยกเลิกแล้วไม่ได้ (409)" || fail "ตอบคำขอที่ยกเลิกได้"

echo
echo "═══ แอดมินตอบ → หัวหน้าภาครับทราบ"
POST $S "work-orders/$W/admin-review" '{"reason":"CONTACT","note":"เบอร์ร้านโทรไม่ติด ขอเบอร์ใหม่"}' >/dev/null
# ใบเดินไปขั้นของแอดมิน (รอคอนเฟิร์มลูกค้า) — คำตอบต้องยังเข้ากล่องหัวหน้าภาค
POST $S "work-orders/$W/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
[ "$(CODE $S "work-orders/$W/admin-review/reply" '{"reply":"หัวหน้าภาคลองตอบเอง"}')|$(CODE $A "work-orders/$W/admin-review/reply" '{"reply":"สั้น"}')" = "403|400" ] \
  && pass "หัวหน้าภาคตอบเองไม่ได้ (403) · แอดมินตอบสั้นเกิน (400)" || fail "สิทธิ์ตอบ"
R=$(POST $A "work-orders/$W/admin-review/reply" '{"reply":"โทรเช็คแล้ว แก้เบอร์ร้านในใบแล้ว"}')
[ "$(ST)|$(DB "select reply from \"AdminReview\" where \"workOrderId\"=$W and reason='CONTACT'")" = "AWAITING_CONFIRM|โทรเช็คแล้ว แก้เบอร์ร้านในใบแล้ว" ] \
  && echo "$R" | J 'd.adminReview.answered+"|"+d.adminReview.replyByName' | grep -q "^true|" \
  && pass "แอดมินตอบได้ · ขั้นตอนไม่เปลี่ยน (ยังรอคอนเฟิร์มลูกค้า) · ใบบอกคำตอบ" || fail "ตอบ: $(ST) $(echo "$R" | head -c 160)"
[ "$(CODE $A "work-orders/$W/admin-review/reply" '{"reply":"ตอบซ้ำอีกรอบ"}')" = "409" ] && pass "ตอบซ้ำไม่ได้ (409)" || fail "ตอบซ้ำได้"
SL=$(GET $S "work-orders?status=INBOX"); SC=$(GET $S work-orders/inbox-count | J 'd.inbox')
# ใบอยู่ขั้นแอดมิน (รอคอนเฟิร์มลูกค้า) จึงยังอยู่ในกล่องแอดมินตามขั้น — แต่ไม่ใช่ในฐานะคำขอที่รอตอบแล้ว
WAITING_A=$(GET $A "work-orders?status=INBOX" | J "d.rows.some(r=>r.id===$W && r.adminReview && !r.adminReview.answered)")
[ "$WAITING_A|$(echo "$SL" | J "(d.rows.find(r=>r.id===$W)||{}).adminReview?.reply")|$(echo "$SL" | J 'd.rows.length+"|"+d.counts.INBOX')" = "false|โทรเช็คแล้ว แก้เบอร์ร้านในใบแล้ว|$SC|$SC" ] \
  && pass "ตอบแล้วไม่ค้างเป็นคำขอในกล่องแอดมิน · เข้ากล่องหัวหน้าภาคพร้อมคำตอบ (ทั้งที่ใบอยู่ขั้นแอดมิน) · ตัวเลขตรง ($SC)" || fail "กล่องหลังตอบ: แอดมินยังรอตอบ=$WAITING_A หัวหน้าภาค=$(echo "$SL" | J 'd.rows.length+"|"+d.counts.INBOX') นับ $SC"
[ "$(CODE $Z "work-orders/$W/admin-review/ack" '{}')" = "403" ] && pass "หัวหน้าภาคนอกพื้นที่รับทราบแทนไม่ได้" || fail "คนนอกรับทราบได้"
POST $S "work-orders/$W/admin-review/ack" '{}' >/dev/null
[ "$(DB "select (\"ackAt\" is not null)::text from \"AdminReview\" where \"workOrderId\"=$W and reason='CONTACT'")|$(inbox $S)|$(GET $S "work-orders/$W" | J 'd.adminReview')" = "true|false|null" ] \
  && pass "รับทราบแล้ว: ออกจากกล่องหัวหน้าภาค · ใบไม่โชว์กล่องคำตอบแล้ว" || fail "รับทราบ"
[ "$(GET $A "work-orders/$W" | J 'd.logs.filter(l=>l.action.startsWith("ADMIN_REVIEW")).map(l=>l.actionLabel+"@"+l.status).reverse().join(",")')" = "ส่งกลับให้แอดมินตรวจสอบ@NEW,ยกเลิกคำขอให้แอดมินตรวจสอบ@PARTS_CHECKED,ส่งกลับให้แอดมินตรวจสอบ@PARTS_CHECKED,แอดมินตรวจแล้ว@AWAITING_CONFIRM" ] \
  && pass "ประวัติครบ: ส่ง → ยกเลิก → ส่ง → แอดมินตรวจแล้ว (ที่ขั้นตอนนั้น ๆ)" || fail "ประวัติ: $(GET $A "work-orders/$W" | J 'd.logs.filter(l=>l.action.startsWith("ADMIN_REVIEW")).map(l=>l.action+"@"+l.status).join(",")')"

echo
echo "═══ ใบที่ถูกยกเลิกไม่ค้างในกล่องแอดมิน"
W2=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W3","symptom":"ทดสอบใบซ้ำ"}]}' | J 'd.orders?d.orders[0].id:d.id')
POST $S "work-orders/$W2/admin-review" '{"reason":"DUPLICATE","note":"น่าจะซ้ำกับใบก่อนหน้า"}' >/dev/null
B=$(GET $A "work-orders?status=INBOX" | J "d.rows.some(r=>r.id===$W2)")
POST $A "work-orders/$W2/cancel" '{"reasonCode":"DUPLICATE","note":"ซ้ำจริง"}' >/dev/null
[ "$B|$(GET $A "work-orders?status=INBOX" | J "d.rows.some(r=>r.id===$W2)")|$(DB "select status from \"WorkOrder\" where id=$W2")" = "true|false|CANCELLED" ] \
  && pass "แอดมินยกเลิกใบ (ซ้ำจริง) แล้วคำขอไม่ค้างในกล่องงาน" || fail "ใบยกเลิกยังค้าง: ก่อน $B"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
