#!/bin/bash
# ทดสอบ: แท็บ "รอลูกค้าจ่ายเงิน" ของหน้าใบงานซ่อม (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง paytab — ตอบ "ทำตามที่แนะนำ")
#   · payTab ในคำตอบรายการ (เฉพาะแอดมินทั่วไป/Super Admin) = ใบขั้นรอเงินทุกใบในขอบเขต — ไม่ตามแท็บที่เปิด คำค้น หรือ "มอบหมายให้ฉัน"
#     total ตรงฐานข้อมูล · over / never / followed ตรงกับ payWait ของแถวในแท็บ (นับทีละใบ) · never + followed = total
#   · ใบทดสอบสามใบ: ถอยเวลา 5 วัน (เกิน · การตามของรอบก่อนไม่นับ = ยังไม่เคยตาม) · 2 วัน (ไม่เกิน · ตามแล้ว) · วันนี้ (ยังไม่เคยตาม)
#   · ตามลูกค้าแล้ว (แถวในฐานข้อมูล) → never ลด followed เพิ่มทันที · ลายนิ้วมือของแท็บเปลี่ยน (ปุ่มมีอัปเดต)
#   · แถวมี payWait.quoted = ส่งใบเสนอราคาครั้งล่าสุด (เวลาตรงประวัติ QUOTED · ชื่อคนส่ง) — คอลัมน์ "ส่งใบเสนอราคา" ของแท็บ
#   · หัวหน้าภาค · ช่าง · Admin Spare Part · แอดมินที่ดูในฐานะหัวหน้าภาค = payTab null (ไม่มีแท็บ)
#   · /locate: ใบรอเงิน → แท็บ AWAITING_PAYMENT (แอดมิน · Super Admin) · หัวหน้าภาคตามเดิม (ที่ยังค้าง) · ขั้นแอดมินอื่นยังกล่องงาน
# ทุกข้อเช็คที่ฐานข้อมูลด้วย ไม่เชื่อคำตอบของ API อย่างเดียว
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
LIST() { curl -s "localhost:4000/api/work-orders?$2" -H "$(H $1)"; }
# สรุปของแท็บแบบเรียงคงที่ — เทียบระหว่างคำตอบได้ตรง ๆ
SUM() { LIST $1 "$2" | J 'd.payTab===null?"null":d.payTab===undefined?"undefined":[d.payTab.total,d.payTab.over,d.payTab.never,d.payTab.followed,d.payTab.alertDays].join("|")'; }
# นับจากแถวในแท็บเอง (ทีละใบ) — ตัวเลขแท็บต้องเท่ากับสิ่งที่เห็นเมื่อกดเข้าไป
ROWSUM() { LIST $1 "status=AWAITING_PAYMENT" | J 'const p=d.rows.map(r=>r.payWait); [p.length,p.filter(x=>x.over).length,p.filter(x=>x.follows===0).length,p.filter(x=>x.follows>0).length,p[0]?p[0].alertDays:3].join("|")'; }
ROW() { LIST $1 "status=AWAITING_PAYMENT" | node -pe "const d=JSON.parse(require('fs').readFileSync(0)); const r=d.rows.find(x=>x.id===$2); r===undefined?'ไม่อยู่':eval(process.argv[1])" "$3"; }
TAB() { curl -s "localhost:4000/api/work-orders/locate?status=ACTIVE&ids=$2" -H "$(H $1)" | node -pe "const d=JSON.parse(require('fs').readFileSync(0)); (d.rows.find(x=>x.id===$3)||{tab:'ไม่อยู่'}).tab"; }
A=$(login A001); T=$(login T001)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
VLOG0=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
SUF=$RANDOM
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  [ -z "$HAD_MACHINE" ] && DB "delete from \"Machine\" m using \"Branch\" b where b.id=m.\"branchId\" and b.code='$BR' and m.code='W82'
    and not exists (select 1 from \"WorkOrder\" w where w.\"machineId\"=m.id)" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  # ดูในฐานะที่เทสต์นี้เริ่ม (แอดมิน → หัวหน้าภาค) และผู้ใช้ชั่วคราว
  DB "delete from \"ViewAsLog\" where id>$VLOG0 and \"byUserId\"=$AID and \"targetUserId\"=$SID;
      delete from \"User\" where \"employeeCode\" in ('ZPTS$SUF','ZPTP$SUF')" >/dev/null
}
trap cleanup EXIT

HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZPTS$SUF','ซุปเปอร์ทดสอบแท็บรอเงิน','SUPER_ADMIN','$HASH',false),
  ('ZPTP$SUF','แอดมินอะไหล่ทดสอบแท็บรอเงิน','PARTS_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZPTS$SUF); PA=$(login ZPTP$SUF)

BR=$(DB "select code from \"Branch\" where code like 'C%' and \"cancelledAt\" is null order by code limit 1")
REGION=$(DB "select coalesce(region,'') from \"Branch\" where code='$BR'")
HAD_MACHINE=$(DB "select m.id from \"Machine\" m join \"Branch\" b on b.id=m.\"branchId\" where b.code='$BR' and m.code='W82'")
# หัวหน้าภาคต้องดูแลสาขานี้ — /locate ของหัวหน้าภาคต้องเห็นใบ (ไม่งั้นได้ "ไม่อยู่" เพราะนอกพื้นที่ ไม่ใช่เพราะไม่มีแท็บ)
DB "update \"User\" set region=nullif('$REGION','') where id=$SID" >/dev/null
S=$(login S001)
newwo() {
  local W; W=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W82\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบแท็บรอลูกค้าจ่ายเงิน\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='AWAITING_QUOTE', \"workStatus\"='QUOTING', \"needsParts\"=false where id=$W" >/dev/null
  echo "$W"
}
quote() {  # แนบใบเสนอราคา PDF แล้วกดส่ง — ทางเดียวกับปุ่ม "ส่งใบเสนอราคา" (ประวัติ QUOTED ของจริง)
  curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $A)" -F "file=@$SP/quote-sample.pdf;type=application/pdf" -F "role=QUOTE" >/dev/null
  POST $A "work-orders/$1/quote" '{}' >/dev/null
}
W1=$(newwo); IDS="$IDS $W1"; quote $W1
W2=$(newwo); IDS="$IDS $W2"; quote $W2
W3=$(newwo); IDS="$IDS $W3"; quote $W3
WQ=$(newwo); IDS="$IDS $WQ"   # ค้างที่ขั้นส่งใบเสนอราคา — ขั้นของแอดมินที่ไม่ใช่รอเงิน
# W1: ตามไว้ก่อน แล้วถอยทุกอย่าง 5 วัน แต่ถอยการตามไป 6 วัน = การตามเกิดก่อนเข้าขั้นรอบนี้ (ใบที่ย้อนไปเสนอราคาใหม่) — ไม่นับ
POST $A "work-orders/$W1/payment-followup" '{"note":"ตามรอบก่อน"}' >/dev/null
DB "update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '5 days' where \"workOrderId\"=$W1 and action<>'PAYMENT_FOLLOWUP';
    update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '6 days' where \"workOrderId\"=$W1 and action='PAYMENT_FOLLOWUP';
    update \"WorkOrder\" set \"createdAt\"=\"createdAt\"-interval '6 days' where id=$W1;
    update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '2 days' where \"workOrderId\"=$W2;
    update \"WorkOrder\" set \"createdAt\"=\"createdAt\"-interval '2 days' where id=$W2" >/dev/null
POST $A "work-orders/$W2/payment-followup" '{"note":"ลูกค้าบอกโอนพรุ่งนี้"}' >/dev/null
echo "  ใบทดสอบ: $(DB "select string_agg(code||'='||status, ' ' order by id) from \"WorkOrder\" where id in ($W1,$W2,$W3,$WQ)")"

echo "═══ แถวในแท็บ (status=AWAITING_PAYMENT)"
[ "$(ROW $A $W1 '[r.payWait.days,r.payWait.over,r.payWait.follows].join("|")')" = "5|true|0" ] \
  && pass "ใบถอย 5 วัน: รอ 5 วัน · เกิน · การตามก่อนเข้าขั้นไม่นับ (ยังไม่เคยตาม)" || fail "W1: $(ROW $A $W1 'JSON.stringify(r.payWait)')"
[ "$(ROW $A $W2 '[r.payWait.days,r.payWait.over,r.payWait.follows,r.payWait.last.note].join("|")')" = "2|false|1|ลูกค้าบอกโอนพรุ่งนี้" ] \
  && pass "ใบถอย 2 วัน: ไม่เกิน · ตามแล้ว 1 ครั้ง" || fail "W2: $(ROW $A $W2 'JSON.stringify(r.payWait)')"
[ "$(ROW $A $W3 '[r.payWait.days,r.payWait.over,r.payWait.follows].join("|")')" = "0|false|0" ] \
  && pass "ใบวันนี้: รอ 0 วัน · ยังไม่เคยตาม" || fail "W3: $(ROW $A $W3 'JSON.stringify(r.payWait)')"
[ "$(ROW $A $WQ '"อยู่"')" = "ไม่อยู่" ] && pass "ใบที่ยังไม่ส่งใบเสนอราคาไม่อยู่ในแท็บ" || fail "ใบขั้นเสนอราคาอยู่ในแท็บรอเงิน"
QAT=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS') from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='QUOTED' order by id desc limit 1")
[ "$(ROW $A $W1 'r.payWait.quoted.at.slice(0,23)+"|"+r.payWait.quoted.byName')" = "$QAT|$ANAME" ] \
  && pass "คอลัมน์ส่งใบเสนอราคา: เวลา · ใคร ตรงประวัติ QUOTED ในฐานข้อมูล ($QAT · $ANAME)" || fail "quoted: $(ROW $A $W1 'JSON.stringify(r.payWait.quoted)') vs $QAT"
[ "$(ROW $A $W1 'Object.keys(r.payWait).join(",")')" = "since,days,over,alertDays,follows,last,quoted" ] \
  && pass "ช่องของ payWait ในรายการ: since,days,over,alertDays,follows,last,quoted (แอปจดการตามแทนที่ช่องเดิม — ลำดับต้องตรงไม่งั้นขึ้นมีอัปเดตปลอม)" \
  || fail "ช่อง payWait: $(ROW $A $W1 'Object.keys(r.payWait).join(",")')"
[ "$(LIST $A "status=ACTIVE" | J "String(d.rows.find(x=>x.id===$WQ).payWait)")" = "null" ] && pass "ขั้นอื่นยังไม่มี payWait" || fail "ขั้นเสนอราคามี payWait"

echo
echo "═══ ตัวเลขแท็บ (payTab)"
TOT_DB=$(DB "select count(*) from \"WorkOrder\" where status='AWAITING_PAYMENT' and \"deletedAt\" is null")
S0=$(SUM $A "status=ACTIVE")
[ "$(echo "$S0" | cut -d'|' -f1)" = "$TOT_DB" ] && pass "จำนวนใบในแท็บ = ใบขั้นรอเงินทั้งหมดในฐานข้อมูล ($TOT_DB)" || fail "payTab $S0 · ฐานข้อมูล $TOT_DB"
[ "$S0" = "$(ROWSUM $A)" ] && pass "เกิน/ยังไม่เคยตาม/ตามแล้ว เท่ากับนับจากแถวในแท็บทีละใบ ($S0)" || fail "payTab $S0 · นับจากแถว $(ROWSUM $A)"
echo "$S0" | node -e 'const [t,o,n,f,a]=require("fs").readFileSync(0,"utf8").trim().split("|").map(Number); process.exit(n+f===t&&o>=1&&n>=2&&f>=1&&a===3?0:1)' \
  && pass "ยังไม่เคยตาม + ตามแล้ว = ทั้งหมด · ใบทดสอบนับเข้าครบ (เกิน ≥1 · ยังไม่เคยตาม ≥2 · ตามแล้ว ≥1) · เส้น 3 วันจากเซิร์ฟเวอร์" || fail "สรุป $S0"
OK=1
for q in "status=INBOX" "status=AWAITING_PAYMENT" "status=DONE" "status=ALL&search=zzไม่มีทางเจอzz" "status=ACTIVE&assignedTo=me" "status=AWAITING_CONFIRM"; do
  [ "$(SUM $A "$q")" = "$S0" ] || { OK=0; fail "payTab ตาม $q: $(SUM $A "$q") ≠ $S0"; }
done
[ $OK = 1 ] && pass "ตัวเลขแท็บเท่ากันทุกแท็บ/คำค้น/มอบหมายให้ฉัน — ป้ายบนแท็บขึ้นได้ตั้งแต่ยังเปิดแท็บอื่น"
[ "$(SUM $SA "status=ACTIVE")" = "$S0" ] && pass "Super Admin ได้ตัวเลขเดียวกับแอดมิน" || fail "Super Admin: $(SUM $SA "status=ACTIVE")"

V0=$(curl -s "localhost:4000/api/work-orders/version?status=AWAITING_PAYMENT" -H "$(H $A)" | J 'd.version')
N0=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W3 and action='PAYMENT_FOLLOWUP'")
POST $A "work-orders/$W3/payment-followup" '{"note":"ลูกค้าว่าจะโอนวันศุกร์"}' >/dev/null
[ "$(DB "select count(*)||'|'||max(note) from \"WorkOrderLog\" where \"workOrderId\"=$W3 and action='PAYMENT_FOLLOWUP'")" = "$((N0 + 1))|ลูกค้าว่าจะโอนวันศุกร์" ] \
  && pass "ฐานข้อมูล: ตามลูกค้าแล้วได้แถว PAYMENT_FOLLOWUP ของใบวันนี้" || fail "แถวการตาม: $(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W3 and action='PAYMENT_FOLLOWUP'")"
S1=$(SUM $A "status=INBOX")
WANT=$(echo "$S0" | node -pe 'const [t,o,n,f,a]=require("fs").readFileSync(0,"utf8").trim().split("|").map(Number); [t,o,n-1,f+1,a].join("|")')
[ "$S1" = "$WANT" ] && [ "$S1" = "$(ROWSUM $A)" ] && pass "หลังตาม: ยังไม่เคยตาม −1 · ตามแล้ว +1 ทันที ($S0 → $S1)" || fail "หลังตาม $S1 ต้องเป็น $WANT"
[ "$(ROW $A $W3 'r.payWait.follows+"|"+r.payWait.last.note+"|"+r.payWait.last.byName')" = "1|ลูกค้าว่าจะโอนวันศุกร์|$ANAME" ] \
  && pass "แถวขึ้นตามล่าสุด (หมายเหตุ · ชื่อ)" || fail "แถว W3: $(ROW $A $W3 'JSON.stringify(r.payWait)')"
[ "$(curl -s "localhost:4000/api/work-orders/version?status=AWAITING_PAYMENT" -H "$(H $A)" | J 'd.version')" != "$V0" ] \
  && pass "ลายนิ้วมือของแท็บเปลี่ยนหลังตาม (เครื่องอื่นได้ปุ่มมีอัปเดต)" || fail "version ไม่เปลี่ยน"

echo
echo "═══ คนที่ไม่มีแท็บ"
[ "$(SUM $S "status=ACTIVE")" = "null" ] && pass "หัวหน้าภาค: payTab null" || fail "หัวหน้าภาค: $(SUM $S "status=ACTIVE")"
[ "$(SUM $T "status=ACTIVE")" = "null" ] && pass "ช่าง: payTab null" || fail "ช่าง: $(SUM $T "status=ACTIVE")"
[ "$(SUM $PA "status=ACTIVE")" = "null" ] && pass "Admin Spare Part: payTab null" || fail "Admin Spare Part: $(SUM $PA "status=ACTIVE")"
AV=$(POST $A auth/view-as "{\"userId\":$SID}" | J 'd.token')
[ -n "$AV" ] && [ "$(SUM $AV "status=ACTIVE")" = "null" ] && pass "แอดมินดูในฐานะหัวหน้าภาค: payTab null (ตำแหน่งของคนที่ถูกดู)" || fail "ดูในฐานะ: $(SUM $AV "status=ACTIVE")"
POST $AV auth/view-as/stop '{}' >/dev/null

echo
echo "═══ /locate (ปุ่มมีอัปเดตพาไปแท็บที่ใบอยู่)"
[ "$(TAB $A "$W1,$WQ" $W1)" = "AWAITING_PAYMENT" ] && pass "แอดมิน: ใบรอเงิน → แท็บรอลูกค้าจ่ายเงิน (เจาะจงกว่ากล่องงาน)" || fail "แอดมิน W1: $(TAB $A "$W1,$WQ" $W1)"
[ "$(TAB $SA "$W1" $W1)" = "AWAITING_PAYMENT" ] && pass "Super Admin: แท็บรอลูกค้าจ่ายเงิน" || fail "Super Admin W1: $(TAB $SA "$W1" $W1)"
[ "$(TAB $A "$W1,$WQ" $WQ)" = "INBOX" ] && pass "แอดมิน: ใบรอส่งใบเสนอราคายังเป็นกล่องงาน" || fail "แอดมิน WQ: $(TAB $A "$W1,$WQ" $WQ)"
[ "$(TAB $S "$W1" $W1)" = "ACTIVE" ] && pass "หัวหน้าภาค: ใบรอเงินยังเป็น \"ที่ยังค้าง\" (ไม่มีแท็บรอเงิน)" || fail "หัวหน้าภาค W1: $(TAB $S "$W1" $W1)"
[ "$(TAB $PA "$W1" $W1)" != "AWAITING_PAYMENT" ] && pass "Admin Spare Part: ไม่ได้แท็บรอเงิน ($(TAB $PA "$W1" $W1))" || fail "Admin Spare Part ได้แท็บรอเงิน"

[ -z "$FAILED" ]
