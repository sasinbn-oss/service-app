#!/bin/bash
# ทดสอบ: แท็บรอลูกค้าจ่ายเงิน รอบสอง (เจ้าของงานเลือก 6 พ.ย. 69) — คอลัมน์ตามลูกค้าล่าสุด · ลูกค้านัดจ่ายวันที่ · ลูกค้าไม่ซ่อมจากแถว
#   · ตามลูกค้าพร้อม "ลูกค้านัดจ่ายวันที่" → แถว PAYMENT_FOLLOWUP มี meta { payBy } (ฐานข้อมูล) · ไม่ใส่วัน = meta ว่าง
#   · นัดจ่ายของใบ = วันนัดของการตามครั้งล่าสุดที่ใส่วันมา (รอบรอเงินนี้): ตามครั้งหลังไม่ใส่วันไม่ล้างนัด · ใส่วันใหม่แทนนัดเดิม
#     · การตามของรอบก่อนเข้าขั้นไม่นับ (วันนัดเก่าไม่ทำให้ใบ "เลยวันนัด")
#   · เลยวันนัด = วันนัดก่อนวันนี้ (เวลาไทย · วันนัดคือวันนี้ยังไม่เลย) — payTab.late เท่ากับนับจากฐานข้อมูลด้วย SQL ของ README
#     และเท่ากับนับจากแถวในแท็บ
#   · แถวในรายการบอกการตามล่าสุด (ใคร · หมายเหตุ · วันนัด) และการตามทุกครั้งของรอบนี้ ใหม่ก่อนเก่า ตรงกับหน้าใบงานทุกช่อง
#   · ลูกค้าไม่ซ่อมจากแถว (เปิดฟอร์ม = GET ใบงานเพื่อดูของที่ออกจากคลัง → POST /quote-declined ตัวเดียวกับหน้าใบงาน)
#     ได้ผลในฐานข้อมูลเหมือนกดจากหน้าใบงานทุกช่อง · ใบหลุดจากแท็บ · payTab ลดตามจริง
#   · ไม่รับ: วันที่ผ่านมาแล้ว · วันที่ไม่มีจริง/รูปแบบผิด/ไม่ใช่ข้อความ · ไกลเกิน 1 ปี (ปี พ.ศ.) · หัวหน้าภาค/ช่าง/Admin Spare Part 403
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
LIST() { curl -s "localhost:4000/api/work-orders?$2" -H "$(H $1)"; }
# แถวของใบในแท็บรอเงิน — $1=token $2=id $3=นิพจน์ของแถว r
ROW() { LIST $1 "status=AWAITING_PAYMENT" | node -pe "const d=JSON.parse(require('fs').readFileSync(0)); const r=d.rows.find(x=>x.id===$2); r===undefined?'ไม่อยู่':eval(process.argv[1])" "$3"; }
FU() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='PAYMENT_FOLLOWUP'"; }
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
# วันตามเวลาไทย ±n วัน — แบบเดียวกับ todayBkk ของแอป (เซิร์ฟเวอร์ตัดสินวันเลยนัดด้วยวันไทย)
DAY() { node -e "console.log(new Date(Date.now()+7*3600e3+($1)*864e5).toISOString().slice(0,10))"; }
TODAY=$(DAY 0); D3=$(DAY 3); D5=$(DAY 5); YEST=$(DAY -1)
# เลยวันนัดจ่าย นับจากฐานข้อมูลตรง ๆ — SQL ชุดเดียวกับ README (deploy) · รอบรอเงิน = หลังประวัติเดินขั้นล่าสุด (NON_STAGE_ACTIONS)
LATE_SQL="WITH since AS (
  SELECT w.id, max(l.\"createdAt\") AS s FROM \"WorkOrder\" w JOIN \"WorkOrderLog\" l ON l.\"workOrderId\" = w.id
   WHERE w.status = 'AWAITING_PAYMENT' AND w.\"deletedAt\" IS NULL
     AND l.action NOT IN ('ATTACHED','ATTACHMENT_REMOVED','EDITED','PARTS_ETA_CHANGED','STATUS_CHANGED','ARRIVED','ADMIN_REVIEW_REQUESTED',
                          'ADMIN_REVIEW_CANCELLED','ADMIN_REVIEW_ANSWERED','APPOINTMENT_MOVED','CLAIM_SKIPPED','URGENT_RELEASE','URGENT_REQUESTED',
                          'URGENT_REQUEST_CANCELLED','URGENT_REQUEST_ANSWERED','MACHINE_BRAND_SET','CROSS_BRAND_PARTS','TRASHED','RESTORED','PAYMENT_FOLLOWUP')
   GROUP BY w.id
), promise AS (
  SELECT DISTINCT ON (s.id) s.id, l.meta->>'payBy' AS d FROM since s
    JOIN \"WorkOrderLog\" l ON l.\"workOrderId\" = s.id AND l.action = 'PAYMENT_FOLLOWUP' AND l.\"createdAt\" >= s.s AND l.meta ? 'payBy'
   ORDER BY s.id, l.\"createdAt\" DESC, l.id DESC
)
SELECT count(*) FROM promise WHERE d < to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')"
A=$(login A001); S=$(login S001); T=$(login T001)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
SUF=$RANDOM
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  [ -z "$HAD_MACHINE" ] && DB "delete from \"Machine\" m using \"Branch\" b where b.id=m.\"branchId\" and b.code='$BR' and m.code='W84'
    and not exists (select 1 from \"WorkOrder\" w where w.\"machineId\"=m.id)" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  DB "delete from \"UsageSlot\" where \"userId\" in (select id from \"User\" where \"employeeCode\" in ('ZPPS$SUF','ZPPP$SUF'));
      delete from \"User\" where \"employeeCode\" in ('ZPPS$SUF','ZPPP$SUF')" >/dev/null
}
trap cleanup EXIT

HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZPPS$SUF','ซุปเปอร์ทดสอบนัดจ่าย','SUPER_ADMIN','$HASH',false),
  ('ZPPP$SUF','แอดมินอะไหล่ทดสอบนัดจ่าย','PARTS_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZPPS$SUF); PA=$(login ZPPP$SUF)
SANAME=$(DB "select name from \"User\" where \"employeeCode\"='ZPPS$SUF'")

BR=$(DB "select code from \"Branch\" where code like 'C%' and \"cancelledAt\" is null order by code limit 1")
REGION=$(DB "select coalesce(region,'') from \"Branch\" where code='$BR'")
HAD_MACHINE=$(DB "select m.id from \"Machine\" m join \"Branch\" b on b.id=m.\"branchId\" where b.code='$BR' and m.code='W84'")
# หัวหน้าภาคต้องดูแลสาขานี้ — 403 ที่ทดสอบต้องมาจาก "ขั้นนี้เป็นของแอดมิน" ไม่ใช่ "นอกพื้นที่"
DB "update \"User\" set region=nullif('$REGION','') where id=$SID" >/dev/null
S=$(login S001)
newwo() {
  local W; W=$(POST $A "" "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W84\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบนัดจ่าย\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='AWAITING_QUOTE', \"workStatus\"='QUOTING', \"needsParts\"=false where id=$W" >/dev/null
  echo "$W"
}
quote() {  # แนบใบเสนอราคา PDF แล้วกดส่ง — ทางเดียวกับปุ่ม "ส่งใบเสนอราคา" (ประวัติ QUOTED ของจริง)
  curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $A)" -F "file=@$SP/quote-sample.pdf;type=application/pdf" -F "role=QUOTE" >/dev/null
  POST $A "$1/quote" '{}' >/dev/null
}
P1=$(newwo); IDS="$IDS $P1"; quote $P1   # นัดจ่าย · ตามต่อไม่ใส่วัน · เลื่อนนัด
P2=$(newwo); IDS="$IDS $P2"; quote $P2   # เลยวันนัด
P3=$(newwo); IDS="$IDS $P3"; quote $P3   # การตามของรอบก่อน (มีวันนัดเก่า) ไม่นับ
PD=$(newwo); IDS="$IDS $PD"; quote $PD   # ลูกค้าไม่ซ่อม — หน้าใบงาน
PL=$(newwo); IDS="$IDS $PL"; quote $PL   # ลูกค้าไม่ซ่อม — จากแถวในแท็บ (เลยวันนัด · มีของออกจากคลัง)
echo "  ใบทดสอบ: $(DB "select string_agg(code||'='||status, ' ' order by id) from \"WorkOrder\" where id in ($P1,$P2,$P3,$PD,$PL)") · วันนี้ $TODAY"

echo "═══ ตามลูกค้าพร้อมวันนัดจ่าย"
R=$(POST $A "$P1/payment-followup" "{\"note\":\"ลูกค้าจะโอนวันศุกร์\",\"payBy\":\"$D3\"}")
[ "$(DB "select coalesce(note,'-')||'|'||coalesce(meta->>'payBy','-')||'|'||\"userId\" from \"WorkOrderLog\" where \"workOrderId\"=$P1 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")" = "ลูกค้าจะโอนวันศุกร์|$D3|$AID" ] \
  && pass "ฐานข้อมูล: แถว PAYMENT_FOLLOWUP มีหมายเหตุ + meta.payBy $D3 (A001)" || fail "แถวการตาม: $(DB "select note, meta from \"WorkOrderLog\" where \"workOrderId\"=$P1 and action='PAYMENT_FOLLOWUP'")"
[ "$(echo "$R" | J 'd.payWait.promise.date+"|"+d.payWait.promise.late+"|"+d.payWait.followUps[0].payBy')" = "$D3|false|$D3" ] \
  && pass "คำตอบ (หน้าใบงาน): นัดจ่าย $D3 ยังไม่เลย · การตามครั้งนั้นบอกวันนัด" || fail "คำตอบ: $(echo "$R" | J 'JSON.stringify(d.payWait)')"
[ "$(ROW $A $P1 '[r.payWait.promise.date,r.payWait.promise.late,r.payWait.last.payBy,r.payWait.last.note,r.payWait.last.byName,r.payWait.followUps.length].join("|")')" = "$D3|false|$D3|ลูกค้าจะโอนวันศุกร์|$ANAME|1" ] \
  && pass "แถวในแท็บ: นัดจ่าย $D3 · ตามล่าสุด (หมายเหตุ · $ANAME · วันนัด) · การตาม 1 ครั้ง" || fail "แถว P1: $(ROW $A $P1 'JSON.stringify(r.payWait)')"
POST $A "$P1/payment-followup" '{"note":"โทรไม่รับ"}' >/dev/null
[ "$(DB "select coalesce(note,'-')||'|'||coalesce(meta::text,'ว่าง') from \"WorkOrderLog\" where \"workOrderId\"=$P1 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")" = "โทรไม่รับ|ว่าง" ] \
  && pass "ไม่ใส่วันนัด = meta ว่าง (แบบแถวก่อนมีช่องนี้)" || fail "meta: $(DB "select meta from \"WorkOrderLog\" where \"workOrderId\"=$P1 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")"
[ "$(ROW $A $P1 '[r.payWait.promise.date,r.payWait.last.note,String(r.payWait.last.payBy),r.payWait.follows].join("|")')|$(GET $A $P1 | J 'd.payWait.promise.date')" = "$D3|โทรไม่รับ|null|2|$D3" ] \
  && pass "ตามครั้งหลังไม่ใส่วัน: นัดจ่ายยังเป็น $D3 (แถว · หน้าใบงาน) · ตามล่าสุดบอก \"โทรไม่รับ\"" || fail "นัดหลังตามไม่ใส่วัน: $(ROW $A $P1 'JSON.stringify(r.payWait.promise)')"
# ครั้งล่าสุดเป็นคนอื่น (Super Admin) — แถวต้องบอกชื่อคนตามล่าสุด ไม่ใช่คนแรก
POST $SA "$P1/payment-followup" "{\"note\":\"ลูกค้าขอเลื่อนจ่าย\",\"payBy\":\"$D5\"}" >/dev/null
[ "$(ROW $A $P1 '[r.payWait.promise.date,r.payWait.last.byName,r.payWait.last.note,r.payWait.follows].join("|")')" = "$D5|$SANAME|ลูกค้าขอเลื่อนจ่าย|3" ] \
  && pass "ใส่วันใหม่แทนนัดเดิม ($D3 → $D5) · ตามล่าสุดบอกชื่อคนล่าสุด ($SANAME)" || fail "เลื่อนนัด: $(ROW $A $P1 'JSON.stringify(r.payWait)')"
DBLIST=$(DB "select string_agg(id||':'||coalesce(note,'-')||':'||coalesce(meta->>'payBy','-'), ',' order by \"createdAt\" desc, id desc) from \"WorkOrderLog\" where \"workOrderId\"=$P1 and action='PAYMENT_FOLLOWUP'")
[ "$(ROW $A $P1 'r.payWait.followUps.map(f=>f.id+":"+(f.note||"-")+":"+(f.payBy||"-")).join(",")')" = "$DBLIST" ] \
  && pass "แถวมีการตามทุกครั้ง ใหม่ก่อนเก่า ตรงฐานข้อมูล ($DBLIST)" || fail "followUps: $(ROW $A $P1 'JSON.stringify(r.payWait.followUps)') vs $DBLIST"
[ "$(ROW $A $P1 'JSON.stringify([r.payWait.followUps,r.payWait.promise])')" = "$(GET $A $P1 | J 'JSON.stringify([d.payWait.followUps,d.payWait.promise])')" ] \
  && pass "การตาม + นัดจ่ายในแถว = หน้าใบงานทุกช่อง (แอปเอาคำตอบหน้าใบงานมาแทนในแถวได้ตรง ๆ)" || fail "แถวกับหน้าใบงานไม่ตรงกัน"
[ "$(ROW $A $P1 'Object.keys(r.payWait.followUps[0]).join(",")+"|"+Object.keys(r.payWait.last).join(",")+"|"+Object.keys(r.payWait.promise).join(",")')" = "id,at,note,byName,payBy|at,note,byName,payBy|date,late" ] \
  && pass "ช่อง: followUps[] id,at,note,byName,payBy · last at,note,byName,payBy · promise date,late" || fail "ช่อง: $(ROW $A $P1 'JSON.stringify(r.payWait)')"
[ "$(GET $A $P1 | J 'd.logs[0].action+"|"+d.logs[0].actionLabel')" = "PAYMENT_FOLLOWUP|ตามลูกค้าเรื่องจ่ายเงิน" ] && [ "$(ST $P1)" = AWAITING_PAYMENT ] \
  && pass "ยังไม่ใช่การเดินขั้น · ประวัติใบงาน \"ตามลูกค้าเรื่องจ่ายเงิน\"" || fail "ขั้น/ประวัติ: $(ST $P1)"
R=$(POST $A "$P3/payment-followup" "{\"payBy\":\"$TODAY\"}")
[ "$(echo "$R" | J 'd.payWait.promise.date+"|"+d.payWait.promise.late')" = "$TODAY|false" ] \
  && pass "นัดจ่ายวันนี้รับได้ · วันนัดคือวันนี้ยังไม่ \"เลยวันนัด\"" || fail "วันนี้: $R"
POST $A "$P3/payment-followup" '{"payBy":""}' >/dev/null
[ "$(DB "select coalesce(meta::text,'ว่าง') from \"WorkOrderLog\" where \"workOrderId\"=$P3 and action='PAYMENT_FOLLOWUP' order by id desc limit 1")" = "ว่าง" ] \
  && pass "ช่องวันนัดว่าง (\"\") = ไม่ได้นัด ไม่ใช่วันที่ผิด" || fail "payBy ว่าง"

echo
echo "═══ รอบรอเงิน · เลยวันนัด"
# P3: ย้อนเวลาทั้งใบไป 10 วัน (รวมการตามที่นัดวันนี้) แล้วให้ใบเข้าขั้นรอเงินรอบใหม่วันนี้ = การตามทั้งหมดเป็นของรอบก่อน
DB "update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '10 days' where \"workOrderId\"=$P3;
    update \"WorkOrderLog\" set meta=jsonb_build_object('payBy','$(DAY -9)') where \"workOrderId\"=$P3 and action='PAYMENT_FOLLOWUP' and meta is not null;
    insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($P3,$AID,'QUOTED','AWAITING_PAYMENT','ส่งใบเสนอราคาใหม่ (ทดสอบรอบใหม่)',now())" >/dev/null
[ "$(ROW $A $P3 'String(r.payWait.promise)+"|"+r.payWait.follows+"|"+r.payWait.followUps.length')|$(GET $A $P3 | J 'String(d.payWait.promise)')" = "null|0|0|null" ] \
  && pass "การตาม/วันนัดของรอบก่อนเข้าขั้นไม่นับ — ไม่มีนัดจ่าย ไม่เลยวันนัด (แถว · หน้าใบงาน)" || fail "รอบก่อน: $(ROW $A $P3 'JSON.stringify(r.payWait)')"
# P2: ลูกค้านัดวันนี้ (ผ่าน API) แล้วถอยทั้งใบไป 2 วัน = นัดเมื่อวานซืน · ลูกค้ายังไม่จ่าย → เลยวันนัด
POST $A "$P2/payment-followup" "{\"note\":\"ลูกค้าจะโอนวันนี้\",\"payBy\":\"$TODAY\"}" >/dev/null
DB "update \"WorkOrderLog\" set \"createdAt\"=\"createdAt\"-interval '2 days' where \"workOrderId\"=$P2;
    update \"WorkOrder\" set \"createdAt\"=\"createdAt\"-interval '2 days' where id=$P2;
    update \"WorkOrderLog\" set meta=jsonb_build_object('payBy','$(DAY -2)') where \"workOrderId\"=$P2 and action='PAYMENT_FOLLOWUP'" >/dev/null
[ "$(ROW $A $P2 'r.payWait.promise.date+"|"+r.payWait.promise.late')|$(GET $A $P2 | J 'd.payWait.promise.late')" = "$(DAY -2)|true|true" ] \
  && pass "นัด $(DAY -2) ผ่านไปแล้วยังรอเงิน → เลยวันนัด (แถว · หน้าใบงาน)" || fail "เลยนัด P2: $(ROW $A $P2 'JSON.stringify(r.payWait.promise)')"
POST $A "$P2/payment-followup" '{"note":"โทรไม่รับ"}' >/dev/null
[ "$(ROW $A $P2 'r.payWait.promise.date+"|"+r.payWait.promise.late+"|"+r.payWait.last.note')" = "$(DAY -2)|true|โทรไม่รับ" ] \
  && pass "ตามต่อไม่ใส่วัน ไม่ล้างนัดที่เลยแล้ว (ยังเลยวันนัด)" || fail "หลังตามไม่ใส่วัน: $(ROW $A $P2 'JSON.stringify(r.payWait.promise)')"
# PL: เลยวันนัดเหมือนกัน (เมื่อวาน) — จะถูกกดลูกค้าไม่ซ่อมจากแถว
DB "insert into \"WorkOrderLog\"(\"workOrderId\",\"userId\",action,status,note,meta,\"createdAt\") values ($PL,$AID,'PAYMENT_FOLLOWUP','AWAITING_PAYMENT','ลูกค้าบอกโอนเมื่อวาน','{\"payBy\":\"$YEST\"}',now())" >/dev/null
LATE_DB=$(DB "$LATE_SQL")
L=$(LIST $A "status=AWAITING_PAYMENT")
[ "$(echo "$L" | J 'd.payTab.late')" = "$LATE_DB" ] && [ "$LATE_DB" -ge 2 ] \
  && pass "payTab.late $LATE_DB = นับจากฐานข้อมูล (SQL ใน README) · ใบทดสอบที่เลยนัดนับครบ" || fail "payTab.late $(echo "$L" | J 'd.payTab.late') · ฐานข้อมูล $LATE_DB"
[ "$(echo "$L" | J 'd.rows.filter(r=>r.payWait.promise&&r.payWait.promise.late).length')" = "$LATE_DB" ] \
  && pass "นับจากแถวในแท็บทีละใบได้เท่ากัน (ชิปเลยวันนัดจ่าย = แถวที่เห็นเมื่อกด)" || fail "นับจากแถว $(echo "$L" | J 'd.rows.filter(r=>r.payWait.promise&&r.payWait.promise.late).map(r=>r.code).join()')"
[ "$(echo "$L" | J "const s=d.rows.filter(r=>r.payWait.promise&&r.payWait.promise.late).map(r=>r.id); s.includes($P2)&&s.includes($PL)&&!s.includes($P1)&&!s.includes($P3)")" = "true" ] \
  && pass "ใบทดสอบที่เลยนัด: นัดเมื่อวานซืน · นัดเมื่อวาน (นัดอนาคต · นัดของรอบก่อน ไม่นับ)" || fail "ใบที่เลยนัด: $(echo "$L" | J 'd.rows.filter(r=>r.payWait.promise&&r.payWait.promise.late).map(r=>r.code).join()')"
OK=1
for q in "status=ACTIVE" "status=INBOX" "status=DONE" "status=ALL&search=zzznomatch999"; do
  [ "$(LIST $A "$q" | J 'd.payTab.late')" = "$LATE_DB" ] || { OK=0; fail "payTab.late ตาม $q: $(LIST $A "$q" | J 'd.payTab.late')"; }
done
[ $OK = 1 ] && pass "payTab.late เท่ากันทุกแท็บ/คำค้น (นับทั้งขอบเขต ไม่ตามรายการที่เปิด)"
[ "$(LIST $SA "status=ACTIVE" | J 'd.payTab.late')" = "$LATE_DB" ] && pass "Super Admin ได้ late เท่ากัน" || fail "Super Admin late $(LIST $SA "status=ACTIVE" | J 'd.payTab.late')"
[ "$(LIST $S "status=ACTIVE" | J 'String(d.payTab)')" = "null" ] && pass "หัวหน้าภาคยังไม่มี payTab" || fail "หัวหน้าภาคได้ payTab"
# เลื่อนนัดใหม่ (วันอนาคต) = ไม่เลยแล้ว
POST $A "$P2/payment-followup" "{\"note\":\"ลูกค้าขอเลื่อนจ่าย\",\"payBy\":\"$D3\"}" >/dev/null
[ "$(ROW $A $P2 'r.payWait.promise.date+"|"+r.payWait.promise.late')|$(LIST $A "status=ACTIVE" | J 'd.payTab.late')|$(DB "$LATE_SQL")" = "$D3|false|$((LATE_DB - 1))|$((LATE_DB - 1))" ] \
  && pass "ลูกค้านัดวันใหม่ → ไม่เลยวันนัดแล้ว · late −1 (ตรงฐานข้อมูล)" || fail "เลื่อนนัด P2: $(ROW $A $P2 'JSON.stringify(r.payWait.promise)')"

echo
echo "═══ ไม่รับ"
N1=$(FU $P1)
for b in "{\"payBy\":\"$YEST\"}|วันที่ผ่านมาแล้ว" '{"payBy":"2026-02-30"}|ไม่มีวันนี้ในปฏิทิน' '{"payBy":"7/11/2026"}|รูปแบบ' '{"payBy":20261107}|ไม่ถูกต้อง' "{\"payBy\":\"$(DAY 400)\"}|ไกลเกิน" '{"payBy":"2569-11-07"}|ไกลเกิน'; do
  body=${b%|*}; want=${b##*|}
  R=$(POST $A "$P1/payment-followup" "$body")
  [ "$(CODE $A "$P1/payment-followup" "$body")" = 400 ] && echo "$R" | grep -q "$want" && [ "$(FU $P1)" = "$N1" ] \
    && pass "$body → 400 \"$(echo "$R" | J 'd.error')\" · ไม่มีแถวในฐานข้อมูล" || fail "$body: $R · แถว $(FU $P1)/$N1"
done
for who in S T PA; do
  [ "$(CODE ${!who} "$P1/payment-followup" "{\"note\":\"ลองตาม\",\"payBy\":\"$D3\"}")" = 403 ] && [ "$(FU $P1)" = "$N1" ] \
    && pass "$who 403: $(POST ${!who} "$P1/payment-followup" "{\"payBy\":\"$D3\"}" | J 'd.error') · ไม่มีแถว" || fail "$who ตามได้ ($(FU $P1)/$N1)"
done
[ "$(CODE $S "$PL/quote-declined" '{"reason":"PRICE"}')" = 403 ] && [ "$(CODE $PA "$PL/quote-declined" '{"reason":"PRICE"}')" = 403 ] && [ "$(ST $PL)" = AWAITING_PAYMENT ] \
  && pass "ลูกค้าไม่ซ่อม: หัวหน้าภาค · Admin Spare Part 403 (สิทธิ์เดียวกับหน้าใบงาน — แถวไม่ได้เปิดสิทธิ์เพิ่ม)" || fail "คนอื่นกดลูกค้าไม่ซ่อมได้"

echo
echo "═══ ลูกค้าไม่ซ่อมจากแถว = ผลเดียวกับหน้าใบงาน"
SPID=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",warehouse,\"requisitionNo\") values
  ($PL,$SPID,1,'WAITING',true,'คลังลาดพร้าว 94','RQ-PAYROW-$PL'),($PD,$SPID,1,'WAITING',true,'คลังลาดพร้าว 94','RQ-PAYROW-$PD')" >/dev/null
B=$(LIST $A "status=AWAITING_PAYMENT" | J '[d.payTab.total,d.payTab.late].join("|")')
# แถวไม่มีข้อมูลอะไหล่ — ฟอร์มในแถวถามใบงานตอนกาง (GET /:id) เพื่อเตือนของที่ต้องคืนคลัง
[ "$(ROW $A $PL 'String(r.payWait.issued)')" = "undefined" ] && [ "$(GET $A $PL | J 'd.status+"|"+d.payWait.issued.map(x=>x.ref).join()')" = "AWAITING_PAYMENT|ใบเบิก RQ-PAYROW-$PL" ] \
  && pass "เปิดฟอร์มในแถว: ใบงานบอกของที่ออกจากคลัง (ใบเบิก RQ-PAYROW-$PL) — แถวในรายการไม่ต้องแบกข้อมูลอะไหล่" || fail "issued: $(GET $A $PL | J 'JSON.stringify(d.payWait.issued)')"
RD=$(POST $A "$PD/quote-declined" '{"reason":"PRICE","note":"ได้ราคาร้านอื่นถูกกว่า"}')
RL=$(POST $A "$PL/quote-declined" '{"reason":"PRICE","note":"ได้ราคาร้านอื่นถูกกว่า"}')
[ "$(echo "$RL" | J 'd.status+"|"+String(d.payWait)')" = "CANCELLED|null" ] && [ "$(ST $PL)" = CANCELLED ] && pass "แถว: ลูกค้าไม่ซ่อม → CANCELLED (ฐานข้อมูล)" || fail "แถว: $RL"
SNAP() { DB "select w.status||'|'||coalesce(w.\"workStatus\",'-')||'|'||(select l.\"userId\"||'|'||l.status||'|'||l.note||'|'||l.meta::text from \"WorkOrderLog\" l where l.\"workOrderId\"=w.id order by l.id desc limit 1)||'|'||(select count(*)||':'||string_agg(p.kind||'/'||p.\"inStock\"||'/'||left(p.\"requisitionNo\",10),',') from \"WorkOrderPart\" p where p.\"workOrderId\"=w.id) from \"WorkOrder\" w where w.id=$1"; }
[ "$(SNAP $PL)" = "$(SNAP $PD)" ] && echo "$(SNAP $PL)" | grep -q "CANCELLED|.*|$AID|CANCELLED|เสนอราคาแล้วลูกค้าไม่ซ่อม · ราคาสูงไป — ได้ราคาร้านอื่นถูกกว่า|{\"reasonCode\": \"QUOTE_DECLINED\", \"declineReason\": \"PRICE\"}|1:WAITING/true/RQ-PAYROW-" \
  && pass "ฐานข้อมูลเหมือนกดจากหน้าใบงานทุกช่อง: ขั้น · ประวัติ CANCELLED (ใคร · ข้อความ · meta) · อะไหล่/เลขใบเบิกยังอยู่" || fail "แถว $(SNAP $PL) · หน้าใบงาน $(SNAP $PD)"
[ "$(ROW $A $PL '"อยู่"')" = "ไม่อยู่" ] && pass "ใบหลุดจากแท็บรอลูกค้าจ่ายเงิน" || fail "ยังอยู่ในแท็บ"
A2=$(LIST $A "status=AWAITING_PAYMENT" | J '[d.payTab.total,d.payTab.late].join("|")')
WANT=$(echo "$B" | node -pe 'const [t,l]=require("fs").readFileSync(0,"utf8").trim().split("|").map(Number); [t-2,l-1].join("|")')
[ "$A2" = "$WANT" ] && [ "$(echo "$A2" | cut -d'|' -f2)" = "$(DB "$LATE_SQL")" ] \
  && pass "payTab หลังยกเลิกสองใบ: ทั้งหมด −2 · เลยวันนัด −1 (ใบจากแถวเลยนัดอยู่) ตรงฐานข้อมูล ($B → $A2)" || fail "payTab $B → $A2 ต้องเป็น $WANT"
[ "$(CODE $A "$PL/quote-declined" '{"reason":"PRICE"}')" = 409 ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$PL and action='CANCELLED'")" = 1 ] \
  && pass "กดซ้ำจากแถวที่ยังค้างบนจออีกเครื่อง 409 · ประวัติยกเลิกแถวเดียว" || fail "กดซ้ำได้"

[ -z "$FAILED" ] || exit 1
