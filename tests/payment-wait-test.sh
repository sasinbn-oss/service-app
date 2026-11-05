#!/bin/bash
# ทดสอบ: ขั้นรอลูกค้าจ่ายเงิน (เจ้าของงานเลือก 5 พ.ย. 69 · ตอบ "ตามที่แนะนำ" ทั้ง 4 ข้อ)
#   · ป้ายขั้นเดิม (AWAITING_PAYMENT) เป็น "รอลูกค้าจ่ายเงิน" ทุกที่ · แถบขั้นตอน "ลูกค้า · แอดมินแนบบิล" · ขั้นก่อนหน้ายัง "ส่งใบเสนอราคาแล้ว"
#     · สถานะการดำเนินการ "รอลูกค้าจ่ายเงิน" · ส่งใบเสนอราคาแล้วเมื่อไร ใคร (จากประวัติ QUOTED)
#   · ตามลูกค้าแล้ว: ใคร เมื่อไร หมายเหตุ ลงประวัติ PAYMENT_FOLLOWUP · ไม่ใช่การเดินขั้น (วันค้างไม่เริ่มใหม่) · แอดมินเท่านั้น · ขั้นอื่นไม่ได้
#   · รอมาแล้ว N วัน นับจากเข้าขั้น (ตัวเดียวกับ stageSince) · เกิน 3 วัน = over · การตามของรอบก่อนไม่นับ
#   · ลูกค้าไม่ซ่อม: ต้องเลือกเหตุผล · อื่น ๆ ต้องพิมพ์ · ยกเลิกด้วยทางเดียวกับปุ่มยกเลิก (meta รหัสเหตุผล) · ของที่เบิกแล้วไม่หาย
#     (รายงานเบิกแล้วหยุดนับตามกติกาใบยกเลิก) · คนอื่น 403 · ขั้นอื่น 409 · /cancel เลือกรหัสนี้เองไม่ได้
#   · รายงานตามผู้เปิดนับ "เสนอราคาแล้วลูกค้าไม่ซ่อม" แยกเหตุผล · ช่องสถานะในไฟล์รายงานบอกเหตุผล
# ทุกข้อเช็คที่ฐานข้อมูลด้วย ไม่เชื่อคำตอบของ API อย่างเดียว
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
POST() { curl -s -X POST "localhost:4000/api/work-orders/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/work-orders/$2" -H "$(H $1)"; }
# แถวของใบในรายการ (กล่องงาน/ที่ยังค้าง) — $1=token $2=ตัวกรอง $3=id $4=นิพจน์ของแถว r
ROW() { curl -s "localhost:4000/api/work-orders?status=$2" -H "$(H $1)" | node -pe "const d=JSON.parse(require('fs').readFileSync(0)); const r=d.rows.find(x=>x.id===$3); r===undefined?'ไม่อยู่':eval(process.argv[1])" "$4"; }
A=$(login A001); S=$(login S001); T=$(login T001)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  # เปิดใบงานด้วยรหัสเครื่องใหม่ = ระบบลงทะเบียนเครื่องให้ (ไม่ลบตามใบ) — ลบเฉพาะเครื่องที่เทสต์นี้ทำให้เกิด ไม่ใช่เครื่องที่มีอยู่ก่อน
  [ -z "$HAD_MACHINE" ] && DB "delete from \"Machine\" m using \"Branch\" b where b.id=m.\"branchId\" and b.code='$BR' and m.code='W81'
    and not exists (select 1 from \"WorkOrder\" w where w.\"machineId\"=m.id)" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  rm -f /tmp/payment-wait-test.xlsx /tmp/payment-wait-sys.xlsx
}
trap cleanup EXIT

# สาขาบริษัท ไม่ต้องรู้ประกัน — ใบถูกพาไปขั้นเสนอราคาทาง SQL แล้วเดินขั้นเสนอราคาด้วย API จริง (ประวัติ QUOTED ของจริง)
BR=$(DB "select code from \"Branch\" where code like 'C%' and \"cancelledAt\" is null order by code limit 1")
REGION=$(DB "select coalesce(region,'') from \"Branch\" where code='$BR'")
HAD_MACHINE=$(DB "select m.id from \"Machine\" m join \"Branch\" b on b.id=m.\"branchId\" where b.code='$BR' and m.code='W81'")
# หัวหน้าภาคต้องดูแลสาขานี้ — ไม่งั้น 403 ที่ได้มาจาก "นอกพื้นที่" ไม่ใช่ "ขั้นนี้เป็นของแอดมิน" ที่ตั้งใจทดสอบ
DB "update \"User\" set region=nullif('$REGION','') where id=$SID" >/dev/null
S=$(login S001)
newwo() {
  local W; W=$(POST $A "" "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W81\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบรอลูกค้าจ่ายเงิน\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='AWAITING_QUOTE', \"workStatus\"='QUOTING', \"needsParts\"=false where id=$W" >/dev/null
  echo "$W"
}
quote() {  # แนบใบเสนอราคา PDF แล้วกดส่ง — ทางเดียวกับปุ่ม "ส่งใบเสนอราคา"
  curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $A)" -F "file=@$SP/quote-sample.pdf;type=application/pdf" -F "role=QUOTE" >/dev/null
  POST $A "$1/quote" '{}' >/dev/null
}
# newwo รันใน $( ) — จด id ลง IDS ที่เชลล์หลัก (จดใน newwo หายไปกับเชลล์ย่อย แล้ว cleanup ไม่ลบใบ)
W1=$(newwo); IDS="$IDS $W1"; quote $W1
W2=$(newwo); IDS="$IDS $W2"; quote $W2
WQ=$(newwo); IDS="$IDS $WQ"   # ค้างที่ขั้นส่งใบเสนอราคา — ใช้ทดสอบ "ขั้นอื่นไม่ได้"
echo "  ใบทดสอบ: $(DB "select string_agg(code||'='||status, ' ' order by id) from \"WorkOrder\" where id in ($W1,$W2,$WQ)")"

echo "═══ ป้ายขั้นรอลูกค้าจ่ายเงิน"
[ "$(DB "select status||'|'||coalesce(\"workStatus\",'-') from \"WorkOrder\" where id=$W1")" = "AWAITING_PAYMENT|WAITING_PAYMENT" ] \
  && pass "ส่งใบเสนอราคาแล้วใบอยู่ขั้นเดิม AWAITING_PAYMENT · สถานะการดำเนินการ WAITING_PAYMENT (ฐานข้อมูล)" || fail "ขั้น/สถานะ: $(DB "select status, \"workStatus\" from \"WorkOrder\" where id=$W1")"
D=$(GET $A $W1)
[ "$(echo "$D" | J 'd.statusLabel+"|"+d.workStatusLabel')" = "รอลูกค้าจ่ายเงิน|รอลูกค้าจ่ายเงิน" ] \
  && pass "หน้าใบงาน: ป้ายขั้น \"รอลูกค้าจ่ายเงิน\" (เดิม \"แอดมิน · แนบบิลรับเงิน\") · สถานะ \"รอลูกค้าจ่ายเงิน\"" || fail "ป้าย: $(echo "$D" | J 'd.statusLabel+"|"+d.workStatusLabel')"
[ "$(echo "$D" | J 'd.stageActor')" = "ADMIN" ] && pass "คนกดผ่านขั้นยังเป็นแอดมิน (ใบอยู่ในกล่องงานแอดมิน)" || fail "stageActor: $(echo "$D" | J 'd.stageActor')"
OPT=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)")
[ "$(echo "$OPT" | J 'const s=d.stages.find(x=>x.value==="AWAITING_PAYMENT"); [s.label,s.action,s.doneLabel,s.actorLabel].join("|")')" = "รอลูกค้าจ่ายเงิน|รอลูกค้าจ่ายเงิน|ลูกค้าจ่ายแล้ว|ลูกค้า · แอดมินแนบบิล" ] \
  && pass "แถบขั้นตอน: \"รอลูกค้าจ่ายเงิน\" ใต้ชื่อ \"ลูกค้า · แอดมินแนบบิล\" · ผ่านแล้ว \"ลูกค้าจ่ายแล้ว\"" || fail "ตัวเลือกขั้น: $(echo "$OPT" | J 'JSON.stringify(d.stages.find(x=>x.value==="AWAITING_PAYMENT"))')"
[ "$(echo "$OPT" | J 'const s=d.stages.find(x=>x.value==="AWAITING_QUOTE"); s.doneLabel+"|"+s.actorLabel')" = "ส่งใบเสนอราคาแล้ว|แอดมิน" ] \
  && pass "ขั้นก่อนหน้ายัง \"ส่งใบเสนอราคาแล้ว\" · คนทำแอดมิน (ไม่ถูกแตะ)" || fail "ขั้นเสนอราคา: $(echo "$OPT" | J 'JSON.stringify(d.stages.find(x=>x.value==="AWAITING_QUOTE"))')"
[ "$(echo "$OPT" | J 'd.quoteDeclineReasons.map(r=>r.label).join(" · ")')" = "ราคาสูงไป · ซ่อมเอง / หาช่างอื่น · เลิกใช้เครื่องนี้ · ติดต่อลูกค้าไม่ได้ · อื่น ๆ" ] \
  && pass "ชิปเหตุผลลูกค้าไม่ซ่อม 5 ตัวตามตัวอย่าง" || fail "ชิป: $(echo "$OPT" | J 'JSON.stringify(d.quoteDeclineReasons)')"
QAT=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS') from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='QUOTED'")
[ "$(echo "$D" | J 'd.payWait.quoted.at.slice(0,23)+"|"+d.payWait.quoted.byName')" = "$QAT|$ANAME" ] \
  && pass "ส่งใบเสนอราคาแล้ว · เวลา · ใคร มาจากประวัติ QUOTED ($QAT · $ANAME)" || fail "quoted: $(echo "$D" | J 'JSON.stringify(d.payWait.quoted)') vs $QAT"
[ "$(echo "$D" | J '[d.payWait.days,d.payWait.over,d.payWait.alertDays,d.payWait.followUps.length,d.payWait.issued.length].join("|")')" = "0|false|3|0|0" ] \
  && pass "เพิ่งส่ง: รอ 0 วัน · ไม่เกิน · เส้น 3 วัน · ยังไม่เคยตาม · ไม่มีของออกจากคลัง" || fail "payWait: $(echo "$D" | J 'JSON.stringify(d.payWait)')"
[ "$(ROW $A INBOX $W1 'r.statusLabel+"|"+r.payWait.days+"|"+r.payWait.follows+"|"+r.payWait.last')" = "รอลูกค้าจ่ายเงิน|0|0|null" ] \
  && pass "กล่องงานแอดมิน: ป้ายเดียวกัน · รอ 0 วัน · ยังไม่เคยตาม" || fail "แถวกล่องงาน: $(ROW $A INBOX $W1 'JSON.stringify([r.statusLabel,r.payWait])')"
[ "$(ROW $S INBOX $W1 '"อยู่"')" = "ไม่อยู่" ] && pass "ไม่อยู่ในกล่องงานหัวหน้าภาค (ขั้นของแอดมิน)" || fail "อยู่ในกล่องหัวหน้าภาค"
[ "$(ROW $A ACTIVE $WQ 'String(r.payWait)')" = "null" ] && pass "ขั้นอื่นไม่มี payWait" || fail "ขั้นเสนอราคามี payWait"
[ "$(ROW $A ACTIVE $W1 'r.payWait.since')" = "$(ROW $A ACTIVE $W1 'new Date(r.stageSince).toISOString()')" ] \
  && pass "รอมาแล้วนับจากจุดเดียวกับ \"ค้างขั้นนี้มา\" (since = stageSince)" || fail "since $(ROW $A ACTIVE $W1 'r.payWait.since') stageSince $(ROW $A ACTIVE $W1 'r.stageSince')"

echo
echo "═══ ตามลูกค้าแล้ว"
SINCE0=$(ROW $A ACTIVE $W1 'r.stageSince')
N0=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP'")
[ "$(CODE $S "$W1/payment-followup" '{"note":"หัวหน้าภาคลองตาม"}')" = 403 ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP'")" = "$N0" ] \
  && pass "หัวหน้าภาค 403: $(POST $S "$W1/payment-followup" '{}' | J 'd.error') · ไม่มีแถวในฐานข้อมูล" || fail "หัวหน้าภาคตามได้"
[ "$(CODE $T "$W1/payment-followup" '{}')" = 403 ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP'")" = "$N0" ] \
  && pass "ช่าง 403 · ไม่มีแถว" || fail "ช่างตามได้"
[ "$(CODE $A "$WQ/payment-followup" '{}')" = 409 ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$WQ and action='PAYMENT_FOLLOWUP'")" = 0 ] \
  && pass "ใบที่ยังไม่ส่งใบเสนอราคา 409: $(POST $A "$WQ/payment-followup" '{}' | J 'd.error')" || fail "ขั้นอื่นตามได้"
LONG=$(node -e 'console.log("ก".repeat(301))')
[ "$(CODE $A "$W1/payment-followup" "{\"note\":\"$LONG\"}")" = 400 ] && pass "หมายเหตุเกิน 300 ตัว 400" || fail "หมายเหตุยาวผ่าน"
R=$(POST $A "$W1/payment-followup" '{"note":"โทรไม่รับ"}')
[ "$(echo "$R" | J 'd.status+"|"+d.payWait.followUps.length+"|"+d.payWait.followUps[0].note+"|"+d.payWait.followUps[0].byName')" = "AWAITING_PAYMENT|1|โทรไม่รับ|$ANAME" ] \
  && pass "แอดมินตามแล้ว: ใบอยู่ขั้นเดิม · การ์ดได้การตาม 1 ครั้ง (หมายเหตุ · ชื่อ)" || fail "ตาม: $R"
[ "$(DB "select \"userId\"||'|'||status||'|'||coalesce(note,'-') from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")" = "$AID|AWAITING_PAYMENT|โทรไม่รับ" ] \
  && pass "ฐานข้อมูล: ประวัติ PAYMENT_FOLLOWUP ใคร (A001) ขั้นเดิม หมายเหตุ" || fail "แถวประวัติ: $(DB "select * from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP'")"
POST $A "$W1/payment-followup" '{}' >/dev/null
[ "$(DB "select coalesce(note,'(ว่าง)') from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")" = "(ว่าง)" ] \
  && pass "ไม่ใส่หมายเหตุก็จดได้ (note ว่างจริง)" || fail "ไม่มีหมายเหตุจดไม่ได้"
POST $A "$W1/payment-followup" '{"note":"ลูกค้าบอกโอนวันศุกร์"}' >/dev/null
[ "$(ROW $A INBOX $W1 'r.payWait.follows+"|"+r.payWait.last.note+"|"+r.payWait.last.byName')" = "3|ลูกค้าบอกโอนวันศุกร์|$ANAME" ] \
  && pass "กล่องงาน: ตาม 3 ครั้ง · ตามล่าสุด \"ลูกค้าบอกโอนวันศุกร์\"" || fail "แถวกล่องงาน: $(ROW $A INBOX $W1 'JSON.stringify(r.payWait)')"
[ "$(GET $A $W1 | J 'd.payWait.followUps.map(f=>f.note||"-").join(",")')" = "ลูกค้าบอกโอนวันศุกร์,-,โทรไม่รับ" ] \
  && pass "การ์ดเรียงการตามใหม่ก่อนเก่า" || fail "ลำดับ: $(GET $A $W1 | J 'JSON.stringify(d.payWait.followUps)')"
[ "$(ROW $A ACTIVE $W1 'r.stageSince')" = "$SINCE0" ] && [ "$(GET $A $W1 | J 'd.payWait.since')" = "$SINCE0" ] \
  && pass "ตามลูกค้าไม่ใช่การเดินขั้น — ค้างขั้นนี้มา/รอมาแล้วไม่เริ่มนับใหม่ ($SINCE0)" || fail "since เปลี่ยน: $(ROW $A ACTIVE $W1 'r.stageSince') vs $SINCE0"
[ "$(DB "select to_char(max(\"createdAt\"),'YYYY-MM-DD\"T\"HH24:MI:SS.MS') from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action not in ('ATTACHED','PAYMENT_FOLLOWUP')")" = "$QAT" ] \
  && pass "ฐานข้อมูล: ประวัติล่าสุดที่เดินขั้นยังเป็น QUOTED" || fail "ประวัติเดินขั้นล่าสุดไม่ใช่ QUOTED"
[ "$(GET $A $W1 | J 'd.logs[0].action+"|"+d.logs[0].actionLabel')" = "PAYMENT_FOLLOWUP|ตามลูกค้าเรื่องจ่ายเงิน" ] \
  && pass "ประวัติใบงานขึ้น \"ตามลูกค้าเรื่องจ่ายเงิน\"" || fail "ป้ายประวัติ: $(GET $A $W1 | J 'd.logs[0].actionLabel')"

echo
echo "═══ รอมาแล้ว N วัน · เกิน 3 วัน"
# ถอยเวลาทุกประวัติของใบไป 3 วันเต็ม (= วันเต็มตามเวลาไทยพอดี) — ยังไม่เกิน · แล้วอีก 1 วัน — เกิน
DB "update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '3 days' where \"workOrderId\"=$W1; update \"WorkOrder\" set \"createdAt\"=\"createdAt\"-interval '3 days' where id=$W1" >/dev/null
[ "$(GET $A $W1 | J 'd.payWait.days+"|"+d.payWait.over')|$(ROW $A INBOX $W1 'r.payWait.days+"|"+r.payWait.over')" = "3|false|3|false" ] \
  && pass "รอ 3 วัน: ยังไม่แดง (เกิน 3 วันถึงแดง) — หน้าใบงานกับกล่องงานตรงกัน" || fail "3 วัน: $(GET $A $W1 | J 'JSON.stringify(d.payWait)')"
DB "update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '1 day' where \"workOrderId\"=$W1; update \"WorkOrder\" set \"createdAt\"=\"createdAt\"-interval '1 day' where id=$W1" >/dev/null
[ "$(GET $A $W1 | J 'd.payWait.days+"|"+d.payWait.over')|$(ROW $A INBOX $W1 'r.payWait.days+"|"+r.payWait.over')" = "4|true|4|true" ] \
  && pass "รอ 4 วัน: over = true ทั้งหน้าใบงานและกล่องงาน" || fail "4 วัน: $(GET $A $W1 | J 'JSON.stringify(d.payWait)')"
POST $A "$W1/payment-followup" '{"note":"ตามวันนี้"}' >/dev/null
[ "$(GET $A $W1 | J 'd.payWait.days+"|"+d.payWait.over+"|"+d.payWait.followUps.length')" = "4|true|4" ] \
  && pass "ตามลูกค้าวันนี้แล้วยังแดง 4 วัน — การตามไม่ทำให้ลูกค้าจ่าย" || fail "ตามแล้ววันรีเซ็ต: $(GET $A $W1 | J 'JSON.stringify(d.payWait)')"
# การตามก่อนเข้าขั้นรอบนี้ (รอบก่อนที่ย้อนไปเสนอราคาใหม่) ไม่นับ
DB "insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($W1,$AID,'PAYMENT_FOLLOWUP','AWAITING_PAYMENT','รอบก่อน',now()-interval '30 days')" >/dev/null
[ "$(GET $A $W1 | J 'd.payWait.followUps.length')|$(ROW $A INBOX $W1 'r.payWait.follows')" = "4|4" ] \
  && pass "การตามของรอบก่อนเข้าขั้นไม่นับ (หน้าใบงาน · กล่องงาน)" || fail "นับรอบก่อน: $(GET $A $W1 | J 'd.payWait.followUps.length')"

echo
echo "═══ ลูกค้าไม่ซ่อม — ตรวจก่อนยกเลิก"
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
R=$(POST $A "$W2/quote-declined" '{}'); [ "$(CODE $A "$W2/quote-declined" '{}')" = 400 ] && echo "$R" | grep -q "เลือกเหตุผล" && [ "$(ST $W2)" = AWAITING_PAYMENT ] \
  && pass "ไม่เลือกเหตุผล 400: $(echo "$R" | J 'd.error')" || fail "ไม่เลือกเหตุผลผ่าน: $R"
[ "$(CODE $A "$W2/quote-declined" '{"reason":"CHEAP"}')" = 400 ] && [ "$(ST $W2)" = AWAITING_PAYMENT ] && pass "เหตุผลนอกรายการ 400" || fail "เหตุผลแปลกผ่าน"
R=$(POST $A "$W2/quote-declined" '{"reason":"OTHER","note":"   "}')
echo "$R" | grep -q "อื่น ๆ" && [ "$(ST $W2)" = AWAITING_PAYMENT ] && pass "อื่น ๆ ไม่พิมพ์เหตุผล 400: $(echo "$R" | J 'd.error')" || fail "อื่น ๆ ว่างผ่าน: $R"
[ "$(CODE $S "$W2/quote-declined" '{"reason":"PRICE"}')" = 403 ] && [ "$(ST $W2)" = AWAITING_PAYMENT ] \
  && pass "หัวหน้าภาค 403: $(POST $S "$W2/quote-declined" '{"reason":"PRICE"}' | J 'd.error')" || fail "หัวหน้าภาคกดได้"
[ "$(CODE $T "$W2/quote-declined" '{"reason":"PRICE"}')" = 403 ] && [ "$(ST $W2)" = AWAITING_PAYMENT ] && pass "ช่าง 403" || fail "ช่างกดได้"
[ "$(CODE $A "$WQ/quote-declined" '{"reason":"PRICE"}')" = 409 ] && [ "$(ST $WQ)" = AWAITING_QUOTE ] \
  && pass "ขั้นส่งใบเสนอราคา 409 (ยังไม่ได้เสนอราคา — ใช้ยกเลิกใบงาน)" || fail "ขั้นอื่นกดได้"
[ "$(CODE $A "$W2/cancel" '{"reasonCode":"QUOTE_DECLINED"}')" = 400 ] && [ "$(ST $W2)" = AWAITING_PAYMENT ] \
  && pass "ปุ่มยกเลิกใบงานเลือก \"เสนอราคาแล้วลูกค้าไม่ซ่อม\" เองไม่ได้ (400)" || fail "/cancel รับ QUOTE_DECLINED"

echo
echo "═══ ลูกค้าไม่ซ่อม — ยกเลิกด้วยทางเดิม · ของที่เบิกแล้วไม่หาย"
# ใบนี้มีของที่ออกจากคลังแล้ว (ย้อนขั้นกลับมารอเงินได้) — ยกเลิกต้องไม่ลบแถวอะไหล่ (เลขใบเบิกยังอยู่ให้คลังรับคืน)
SPID=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",warehouse,\"requisitionNo\") values ($W2,$SPID,1,'WAITING',true,'คลังลาดพร้าว 94','RQ-PAYWAIT-$W2')" >/dev/null
[ "$(GET $A $W2 | J 'd.payWait.issued.map(x=>x.ref).join()')" = "ใบเบิก RQ-PAYWAIT-$W2" ] \
  && pass "การ์ดรู้ว่ามีของออกจากคลังแล้ว (ใบเบิก RQ-PAYWAIT-$W2) — ฟอร์มเตือนให้คืนคลัง" || fail "issued: $(GET $A $W2 | J 'JSON.stringify(d.payWait.issued)')"
ISS() { curl -s "localhost:4000/api/work-orders/reports/issued-parts" -H "$(H $A)" | J "d.rows.filter(r=>r.workOrderId===$1).length"; }
[ "$(ISS $W2)" -ge 1 ] && pass "ก่อนยกเลิก: รายงานอะไหล่เบิกแล้ว · งานยังไม่จบ มีใบนี้" || fail "รายงานเบิกแล้วไม่มีใบนี้ก่อนยกเลิก ($(ISS $W2))"
R=$(POST $A "$W2/quote-declined" '{"reason":"PRICE","note":"ได้ราคาร้านอื่นถูกกว่า"}')
[ "$(echo "$R" | J 'd.status+"|"+d.statusLabel+"|"+d.payWait')" = "CANCELLED|ยกเลิก|null" ] && pass "ลูกค้าไม่ซ่อม (ราคาสูงไป) → ใบยกเลิก" || fail "decline: $R"
[ "$(ST $W2)" = CANCELLED ] && pass "ฐานข้อมูล: CANCELLED" || fail "ฐานข้อมูล: $(ST $W2)"
[ "$(DB "select \"userId\"||'|'||status||'|'||note||'|'||(meta->>'reasonCode')||'|'||(meta->>'declineReason') from \"WorkOrderLog\" where \"workOrderId\"=$W2 order by id desc limit 1")" = "$AID|CANCELLED|เสนอราคาแล้วลูกค้าไม่ซ่อม · ราคาสูงไป — ได้ราคาร้านอื่นถูกกว่า|QUOTE_DECLINED|PRICE" ] \
  && pass "ฐานข้อมูล: ประวัติ CANCELLED ใคร · ข้อความ · meta {reasonCode: QUOTE_DECLINED, declineReason: PRICE}" || fail "ประวัติ: $(DB "select note, meta from \"WorkOrderLog\" where \"workOrderId\"=$W2 order by id desc limit 1")"
[ "$(DB "select count(*)||'|'||string_agg(\"requisitionNo\",',') from \"WorkOrderPart\" where \"workOrderId\"=$W2")" = "1|RQ-PAYWAIT-$W2" ] \
  && pass "ฐานข้อมูล: แถวอะไหล่กับเลขใบเบิกยังอยู่ (ยกเลิกไม่ลบอะไหล่ — กติกาเดิม)" || fail "อะไหล่หาย: $(DB "select * from \"WorkOrderPart\" where \"workOrderId\"=$W2")"
[ "$(ISS $W2)" = 0 ] && pass "หลังยกเลิก: รายงานเบิกแล้วไม่นับใบนี้ (ของต้องกลับคลัง — กติกาใบยกเลิกเดิม)" || fail "ยังอยู่ในรายงานเบิกแล้ว ($(ISS $W2))"
[ "$(GET $A $W2 | J 'd.logs[0].note')" = "เสนอราคาแล้วลูกค้าไม่ซ่อม · ราคาสูงไป — ได้ราคาร้านอื่นถูกกว่า" ] \
  && pass "หน้าใบงานที่ยกเลิกบอกเหตุผล (ประวัติ CANCELLED ล่าสุด)" || fail "ข้อความ: $(GET $A $W2 | J 'd.logs[0].note')"
[ "$(CODE $A "$W2/quote-declined" '{"reason":"PRICE"}')" = 409 ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W2 and action='CANCELLED'")" = 1 ] \
  && pass "กดซ้ำหลังยกเลิกแล้ว 409 · ประวัติยกเลิกแถวเดียว" || fail "กดซ้ำได้"
[ "$(ROW $A INBOX $W2 '"อยู่"')" = "ไม่อยู่" ] && pass "หลุดจากกล่องงานแอดมิน" || fail "ยังอยู่ในกล่องงาน"
[ "$(CODE $A "$W2/payment-followup" '{}')" = 409 ] && pass "ใบยกเลิกแล้วตามลูกค้าไม่ได้ (409)" || fail "ตามใบยกเลิกได้"

R=$(POST $A "$W1/quote-declined" '{"reason":"OTHER","note":"ร้านปิดกิจการ"}')
[ "$(DB "select status||'|'||(select note||'|'||(meta->>'declineReason') from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1) from \"WorkOrder\" where id=$W1")" = "CANCELLED|เสนอราคาแล้วลูกค้าไม่ซ่อม · อื่น ๆ — ร้านปิดกิจการ|OTHER" ] \
  && pass "อื่น ๆ พร้อมเหตุผล → ยกเลิก meta declineReason OTHER (ฐานข้อมูล)" || fail "อื่น ๆ: $R"
# ปุ่มยกเลิกใบงานเดิมยังทำงานเหมือนเดิม และได้รหัสเหตุผลใน meta ด้วย (ทางเดียวกัน)
R=$(POST $A "$WQ/cancel" '{"reasonCode":"CUSTOMER","note":"ร้านแจ้งยกเลิก"}')
[ "$(DB "select (select status from \"WorkOrder\" where id=$WQ)||'|'||note||'|'||(meta->>'reasonCode')||'|'||coalesce(meta->>'declineReason','-') from \"WorkOrderLog\" where \"workOrderId\"=$WQ order by id desc limit 1")" = "CANCELLED|ลูกค้ายกเลิก — ร้านแจ้งยกเลิก|CUSTOMER|-" ] \
  && pass "ยกเลิกใบงานปกติ: ข้อความเดิม + meta reasonCode CUSTOMER (ไม่มี declineReason)" || fail "ยกเลิกปกติ: $R"

echo
echo "═══ รายงาน"
TODAY=$(TZ=Asia/Bangkok date +%F)
REP=$(curl -s -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" -H "$(H $A)")
EXP=$(DB "select count(*) from \"WorkOrder\" w where w.status='CANCELLED' and not w.\"isTest\" and w.\"deletedAt\" is null and (w.\"createdAt\" + interval '7 hours')::date = '$TODAY'::date and (select meta->>'reasonCode' from \"WorkOrderLog\" l where l.\"workOrderId\"=w.id and l.action='CANCELLED' order by l.\"createdAt\" desc, l.id desc limit 1)='QUOTE_DECLINED'")
# W1 ถูกถอยวันเปิดไป 4 วัน (เทสต์วันรอ) — ช่วงวันนี้นับได้แค่ W2 ตามฐานข้อมูล
[ "$(echo "$REP" | J 'd.totals.quoteDeclined')" = "$EXP" ] && [ "$EXP" -ge 1 ] \
  && pass "รายงานตามผู้เปิด: ในนั้นเสนอราคาแล้วลูกค้าไม่ซ่อม $EXP ใบ ตรงกับฐานข้อมูล" || fail "quoteDeclined $(echo "$REP" | J 'd.totals.quoteDeclined') vs DB $EXP"
[ "$(echo "$REP" | J 'd.quoteDeclines.find(x=>x.reason==="PRICE").count>=1 && d.quoteDeclines.reduce((n,x)=>n+x.count,0)===d.totals.quoteDeclined && d.quoteDeclines.length===5')" = "true" ] \
  && pass "แยกตามเหตุผลครบ 5 เหตุผล รวมเท่ายอด · ราคาสูงไป ≥ 1" || fail "แยกเหตุผล: $(echo "$REP" | J 'JSON.stringify(d.quoteDeclines)')"
[ "$(echo "$REP" | J 'd.summary.every(s=>s.quoteDeclined<=s.cancelled)')" = "true" ] && pass "ลูกค้าไม่ซ่อมเป็นส่วนหนึ่งของยกเลิก ไม่เกินยอดยกเลิก" || fail "เกินยอดยกเลิก"
P=$(curl -s -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" --data-urlencode format=xlsx -H "$(H $A)" | J 'd.path')
curl -s -o /tmp/payment-wait-test.xlsx "localhost:4000$P"
C2=$(DB "select code from \"WorkOrder\" where id=$W2")
OUT=$(python3 - "$C2" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook("/tmp/payment-wait-test.xlsx")
s = wb[wb.sheetnames[0]]
rows = [r for r in s.iter_rows(values_only=True)]
head = next(r for r in rows if r and r[0] == "ผู้เปิด")
total = next(r for r in rows if r and r[0] == "รวม")
i = rows.index(next(r for r in rows if r and r[0] == "เสนอราคาแล้วลูกค้าไม่ซ่อม — แยกตามเหตุผล"))
price = next(r for r in rows[i:] if r and r[0] == "ราคาสูงไป")
d = wb[wb.sheetnames[1]]
h = [c.value for c in d[4]]
row = next(r for r in d.iter_rows(min_row=5, values_only=True) if r[h.index("เลขใบงาน")] == sys.argv[1])
print(f"{head[-1]}|{total[-1]}|{price[1]}|{row[h.index('สถานะ')]}|{row[h.index('สถานะปัจจุบัน')]}")
PY
)
[ "$(echo "$OUT" | cut -d'|' -f1)" = "ในนั้น: เสนอราคาแล้วลูกค้าไม่ซ่อม" ] && [ "$(echo "$OUT" | cut -d'|' -f2)" = "$EXP" ] \
  && pass "Excel ชีตสรุป: คอลัมน์ท้าย \"ในนั้น: เสนอราคาแล้วลูกค้าไม่ซ่อม\" แถวรวม $EXP" || fail "Excel สรุป: $OUT"
[ "$(echo "$OUT" | cut -d'|' -f3)" -ge 1 ] && pass "Excel: ตารางแยกตามเหตุผล ราคาสูงไป $(echo "$OUT" | cut -d'|' -f3)" || fail "ตารางเหตุผล: $OUT"
[ "$(echo "$OUT" | cut -d'|' -f4,5)" = "ยกเลิก · เสนอราคาแล้วลูกค้าไม่ซ่อม (ราคาสูงไป)|ยกเลิก · เสนอราคาแล้วลูกค้าไม่ซ่อม (ราคาสูงไป)" ] \
  && pass "Excel รายการ: สถานะ $C2 = \"ยกเลิก · เสนอราคาแล้วลูกค้าไม่ซ่อม (ราคาสูงไป)\" (ไม่ใช่ \"รอลูกค้าจ่ายเงิน\" ที่ค้างใน workStatus)" || fail "Excel สถานะ: $OUT"
P=$(curl -s -G localhost:4000/api/reports/system --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" -H "$(H $A)" | J 'd.path')
curl -s -o /tmp/payment-wait-sys.xlsx "localhost:4000$P" -H "$(H $A)"
OUT=$(python3 - "$C2" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook("/tmp/payment-wait-sys.xlsx", read_only=True)
s = wb["ใบงาน"]
rows = list(s.iter_rows(values_only=True))
hi = next(i for i, r in enumerate(rows) if r and "เลขใบงาน" in r)
h = list(rows[hi])
row = next(r for r in rows[hi + 1:] if r and r[h.index("เลขใบงาน")] == sys.argv[1])
print(f"{row[h.index('สถานะ')]}|{row[h.index('ขั้นปัจจุบัน')]}")
PY
)
[ "$OUT" = "ยกเลิก · เสนอราคาแล้วลูกค้าไม่ซ่อม (ราคาสูงไป)|ยกเลิก" ] \
  && pass "รายงานทั้งระบบ ชีตใบงาน: สถานะ \"ยกเลิก · เสนอราคาแล้วลูกค้าไม่ซ่อม (ราคาสูงไป)\" · ขั้น \"ยกเลิก\"" || fail "รายงานทั้งระบบ: $OUT"
# เปิดใหม่ (แอดมิน) = ไม่ได้ยกเลิกแล้ว — รายงานไม่นับเป็นลูกค้าไม่ซ่อมอีก (นับจากใบที่ยังยกเลิกอยู่เท่านั้น)
POST $A "$W2/reopen" '{}' >/dev/null
[ "$(ST $W2)" != CANCELLED ] && [ "$(curl -s -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" -H "$(H $A)" | J 'd.totals.quoteDeclined')" = "$((EXP - 1))" ] \
  && pass "เปิดใบที่ลูกค้าไม่ซ่อมใหม่แล้ว รายงานไม่นับใบนั้นอีก" || fail "เปิดใหม่ยังนับ"

[ -z "$FAILED" ] || exit 1
