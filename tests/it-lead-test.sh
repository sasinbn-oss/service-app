#!/bin/bash
# ทดสอบ: หัวหน้าภาคที่ดูแลงาน IT (เจ้าของงานตัดสิน 6 พ.ย. 69 · แก้ข้อ 4 วันเดียวกัน: ใบ IT ยังอยู่ในกล่องแอดมิน)
#   · สวิตช์ได้คนเดียว: มีคนถือแล้วตอบ 409 พร้อมชื่อ · replaceItLead ย้ายในธุรกรรมเดียว (ฐานข้อมูลมีคนเดียวเสมอ)
#     ช่างตั้งไม่ได้ · เปลี่ยนบทบาท/ลบ = ถอด · /auth/me บอก itLead
#   · ขอบเขต: หัวหน้า IT เห็น/กดใบ IT ทุกภาค · หัวหน้าภาคของพื้นที่เห็นใบ IT ในพื้นที่ตัวเองและปิดใบงานได้ (เจ้าของงานขอ 6 พ.ย. 69)
#     แต่กดขั้นอื่นไม่ได้ ไม่เข้ากล่องงาน · หัวหน้าภาคนอกพื้นที่ไม่เห็น — ข้อความบอกชื่อหัวหน้า IT
#     งาน CM ของหัวหน้า IT ตามภาคเหมือนเดิม · ช่างยังเห็นใบ IT ที่ทีมตัวเองรับ · "ใครดูแล" ของใบ IT = หัวหน้า IT
#   · ขั้นของแอดมิน: หัวหน้า IT ส่งใบเสนอราคา/ตามลูกค้าในใบ IT ได้ · ใบ CM ได้ 403 · ตรวจเคลมยัง 403 · แอดมินยังทำได้
#   · กล่องงาน: หัวหน้า IT ได้ใบ IT ทั้งขั้นหัวหน้าภาคและขั้นแอดมิน · กล่องแอดมินยังมีใบ IT · ตัวเลขกล่องงานตรงกับแถว
#   · ไม่มีหัวหน้า IT: ใบ IT ที่รอหัวหน้าภาค = ไม่มีคนรับ (เหตุผลบอกให้เลือกหัวหน้า IT) · ไม่มีหัวหน้าภาคคนไหนเห็น
#   · แก้จากระยะไกลแล้ว · ปิดงาน: ไม่มีภาพหน้าจอ/บันทึกสั้น/ขั้นที่ช่างถือ/ขั้นรอเงิน/ใบ CM/หัวหน้าภาคอื่น/ช่าง = ปฏิเสธ
#     ผ่าน = DONE · REMOTE_FIXED · ปิดโดยหัวหน้า IT · ประวัติ REMOTE_CLOSED · ไฟล์บทบาท REMOTE_FIX
# ทุกข้อเช็คที่ฐานข้อมูลด้วย ไม่เชื่อคำตอบของ API อย่างเดียว · ล้างทุกอย่างที่สร้าง และคืนธง/ภาคของผู้ใช้ทดสอบ
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PATCHU() { curl -s -o /tmp/itlead-$$.json -w '%{http_code}' -X PATCH "localhost:4000/api/auth/users/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /tmp/itlead-$$.json -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
BODY() { J "$1" < /tmp/itlead-$$.json; }
GETC() { curl -s -o /tmp/itlead-$$.json -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
LIST() { curl -s "localhost:4000/api/work-orders?status=$2" -H "$(H $1)"; }
HAS() { LIST $1 $2 | node -pe "JSON.parse(require('fs').readFileSync(0)).rows.some(r=>r.id===$3)?'มี':'ไม่มี'"; }
ROW() { LIST $1 $2 | node -pe "const r=JSON.parse(require('fs').readFileSync(0)).rows.find(x=>x.id===$3); r?eval(process.argv[1]):'ไม่มี'" "$4"; }
INBOXN() { curl -s localhost:4000/api/work-orders/inbox-count -H "$(H $1)" | J 'd.inbox'; }
ROWSN() { LIST $1 INBOX | J 'd.rows.length'; }
LEADS() { DB "select coalesce(string_agg(\"employeeCode\", ',' order by id),'-') from \"User\" where \"itLead\""; }
UPLOAD() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@$3" -F "role=$4"; }

A=$(login A001); S=$(login S001); T=$(login T001)
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
OLD_LEADS=$(DB "select coalesce(string_agg(id::text, ','),'') from \"User\" where \"itLead\"")
SUF=$RANDOM
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  # เครื่อง W81 ที่ใบทดสอบสร้างขึ้นเอง (สาขาที่ไม่เคยมี) — ลบเมื่อไม่มีใบไหนอ้างถึงแล้ว
  for b in $NEW_MACHINE_AT; do
    DB "delete from \"Machine\" m using \"Branch\" b where b.id=m.\"branchId\" and b.code='$b' and m.code='W81'
      and not exists (select 1 from \"WorkOrder\" w where w.\"machineId\"=m.id)" >/dev/null
  done
  DB "update \"User\" set \"itLead\"=false where \"itLead\";
      delete from \"User\" where \"employeeCode\" in ('ZITL$SUF','ZITB$SUF','ZITC$SUF','ZITS$SUF');
      update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  [ -n "$OLD_LEADS" ] && DB "update \"User\" set \"itLead\"=true where id in ($OLD_LEADS)" >/dev/null
  rm -f /tmp/itlead-$$.json
}
trap cleanup EXIT

# ภาคของสาขาทดสอบ — ใต้ (C0006 ทีมกระบี่) กับภาคของ C0001 (ทีมกรุงเทพ ของ T001)
BR_S=$(DB "select code from \"Branch\" where region='ใต้' and \"cancelledAt\" is null order by code limit 1")
BR_C=$(DB "select code from \"Branch\" where region is not null and region<>'ใต้' and zone=(select team from \"User\" where \"employeeCode\"='T001') and \"cancelledAt\" is null order by code limit 1")
REG_C=$(DB "select region from \"Branch\" where code='$BR_C'")
TEAM_C=$(DB "select zone from \"Branch\" where code='$BR_C'")
[ -n "$BR_S" ] && [ -n "$BR_C" ] || { echo "FAIL ไม่มีสาขาทดสอบสองภาค (ต้องรัน seed:test)"; exit 1; }
NEW_MACHINE_AT=""
for b in $BR_S $BR_C; do
  [ -z "$(DB "select m.id from \"Machine\" m join \"Branch\" b on b.id=m.\"branchId\" where b.code='$b' and m.code='W81'")" ] && NEW_MACHINE_AT="$NEW_MACHINE_AT $b"
done
DB "update \"User\" set region='ใต้' where id=$SID" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
# L = จะเป็นหัวหน้า IT (ภาคเดียวกับ C0001) · B = หัวหน้าภาคอีกคนภาคเดียวกัน · C = ไว้ทดสอบถอดเมื่อเปลี่ยนบทบาท/ลบ · ZITS = Super Admin (ลบผู้ใช้)
DB "insert into \"User\"(\"employeeCode\",name,role,region,\"passwordHash\",\"mustChangePassword\") values
  ('ZITL$SUF','หัวหน้าไอทีทดสอบ','SUPERVISOR','$REG_C','$HASH',false),
  ('ZITB$SUF','หัวหน้าภาคบีทดสอบ','SUPERVISOR','$REG_C','$HASH',false),
  ('ZITC$SUF','หัวหน้าภาคซีทดสอบ','SUPERVISOR','$REG_C','$HASH',false),
  ('ZITS$SUF','ซุปเปอร์ทดสอบไอที','SUPER_ADMIN',null,'$HASH',false)" >/dev/null
LID=$(DB "select id from \"User\" where \"employeeCode\"='ZITL$SUF'")
BID=$(DB "select id from \"User\" where \"employeeCode\"='ZITB$SUF'")
CID=$(DB "select id from \"User\" where \"employeeCode\"='ZITC$SUF'")
L=$(login ZITL$SUF); B=$(login ZITB$SUF); SA=$(login ZITS$SUF)
DB "update \"User\" set \"itLead\"=false where \"itLead\"" >/dev/null

newwo() {  # $1 สาขา · $2 ประเภทงาน · $3 สถานะ (SQL) — เปิดผ่าน API ทางเดียวกับแอป แล้วย้ายขั้นทาง SQL
  local W; W=$(POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"$2\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบไอที\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W81\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบหัวหน้าภาคที่ดูแลงาน IT\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  [ "$3" != "NEW" ] && DB "update \"WorkOrder\" set status='$3', \"needsParts\"=false where id=$W" >/dev/null
  echo "$W"
}
IT1=$(newwo $BR_S IT NEW); IDS="$IDS $IT1"               # ใบ IT ภาคใต้ รอหัวหน้าภาค
IT2=$(newwo $BR_C IT AWAITING_QUOTE); IDS="$IDS $IT2"    # ใบ IT ภาคของ L รอแอดมินส่งใบเสนอราคา
IT3=$(newwo $BR_S IT NEW); IDS="$IDS $IT3"               # ใบ IT ไว้ปิดแบบแก้จากระยะไกล
IT4=$(newwo $BR_C IT IN_PROGRESS); IDS="$IDS $IT4"       # ใบ IT ที่ช่างถืออยู่
CM1=$(newwo $BR_C CM AWAITING_QUOTE); IDS="$IDS $CM1"    # ใบ CM ภาคของ L รอแอดมิน
CM2=$(newwo $BR_S CM NEW); IDS="$IDS $CM2"               # ใบ CM ภาคใต้ของ S001
IT5=$(newwo $BR_S IT NEW); IDS="$IDS $IT5"               # ใบ IT ภาคใต้ ไว้ให้หัวหน้าภาคของพื้นที่ (S001) ปิด
DB "update \"WorkOrder\" set \"assignedTeam\"='$TEAM_C' where id=$IT4" >/dev/null
echo "  ใบทดสอบ: $(DB "select string_agg(code||'='||\"jobType\"||'/'||status, ' ' order by id) from \"WorkOrder\" where id in ($IT1,$IT2,$IT3,$IT4,$CM1,$CM2)")"
[ "$(DB "select count(*) from \"WorkOrder\" where id in ($IT1,$IT2,$IT3,$IT4) and \"jobType\"='IT'")" = "4" ] && pass "เปิดใบ IT ทดสอบได้ 4 ใบ" || fail "เปิดใบ IT ไม่ครบ"

echo "═══ สวิตช์ได้คนเดียว"
[ "$(PATCHU $A $LID '{"itLead":true}')" = "200" ] && [ "$(LEADS)" = "ZITL$SUF" ] && pass "ตั้ง L เป็นหัวหน้า IT (ฐานข้อมูลมี L คนเดียว)" || fail "ตั้ง L: $(LEADS)"
C409=$(PATCHU $A $BID '{"itLead":true}')
[ "$C409|$(BODY 'd.itLeadHolder&&d.itLeadHolder.name')|$(LEADS)" = "409|หัวหน้าไอทีทดสอบ|ZITL$SUF" ] && pass "คนที่สองได้ 409 พร้อมชื่อคนที่ถืออยู่ · ฐานข้อมูลไม่เปลี่ยน" || fail "409: $C409 $(BODY 'JSON.stringify(d)') $(LEADS)"
BODY 'd.error' | grep -q "หัวหน้าไอทีทดสอบ" && pass "ข้อความ 409 เป็นไทยบอกชื่อ" || fail "ข้อความ 409: $(BODY 'd.error')"
[ "$(PATCHU $A $BID '{"itLead":true,"replaceItLead":true}')|$(BODY 'd.itLead')|$(LEADS)" = "200|true|ZITB$SUF" ] && pass "ยืนยันย้าย → B ถือคนเดียว (L ถูกถอดในธุรกรรมเดียว)" || fail "ย้าย: $(LEADS)"
[ "$(PATCHU $A $LID '{"itLead":true,"replaceItLead":true}')|$(LEADS)" = "200|ZITL$SUF" ] && pass "ย้ายกลับมาที่ L" || fail "ย้ายกลับ: $(LEADS)"
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
[ "$(PATCHU $A $TID '{"itLead":true}')|$(DB "select \"itLead\" from \"User\" where id=$TID")" = "400|f" ] && pass "ช่างตั้งเป็นหัวหน้า IT ไม่ได้ (400)" || fail "ช่างตั้งได้"
[ "$(PATCHU $S $CID '{"itLead":true}')|$(LEADS)" = "403|ZITL$SUF" ] && pass "หัวหน้าภาคตั้งเองไม่ได้ (403 · แอดมินเท่านั้น)" || fail "หัวหน้าภาคตั้งได้"
[ "$(curl -s localhost:4000/api/auth/me -H "$(H $L)" | J 'd.itLead')|$(curl -s localhost:4000/api/auth/me -H "$(H $S)" | J 'd.itLead')|$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J "d.find(u=>u.id===$LID).itLead")" = "true|false|true" ] \
  && pass "/auth/me และรายชื่อผู้ใช้บอก itLead" || fail "/auth/me itLead"
# แอดมินกดพร้อมกัน — ดัชนีได้คนเดียวที่ฐานข้อมูลกันไว้
DB "update \"User\" set \"itLead\"=true where id=$BID" >/dev/null 2>&1
[ "$(LEADS)" = "ZITL$SUF" ] && pass "ฐานข้อมูลไม่ยอมให้มีสองคน (ดัชนี unique แบบมีเงื่อนไข)" || fail "ฐานข้อมูลมีสองคน: $(LEADS)"

echo "═══ ขอบเขตใบ IT"
[ "$(HAS $L ACTIVE $IT1)|$(HAS $L ACTIVE $IT2)|$(HAS $L ACTIVE $CM1)|$(HAS $L ACTIVE $CM2)" = "มี|มี|มี|ไม่มี" ] \
  && pass "หัวหน้า IT เห็นใบ IT ทุกภาค · งาน CM ตามภาคตัวเองเหมือนเดิม" || fail "L เห็น: $(HAS $L ACTIVE $IT1)|$(HAS $L ACTIVE $IT2)|$(HAS $L ACTIVE $CM1)|$(HAS $L ACTIVE $CM2)"
[ "$(HAS $S ACTIVE $IT1)|$(HAS $S ACTIVE $CM2)|$(HAS $B ACTIVE $IT2)|$(HAS $B ACTIVE $CM1)|$(HAS $S ACTIVE $IT2)" = "มี|มี|มี|มี|ไม่มี" ] \
  && pass "หัวหน้าภาคของพื้นที่เห็นใบ IT ในพื้นที่ตัวเอง (เจ้าของงานขอ 6 พ.ย. 69) · ใบ IT ภาคอื่นไม่เห็น · ใบ CM เหมือนเดิม" \
  || fail "คนอื่นเห็น: $(HAS $S ACTIVE $IT1)|$(HAS $S ACTIVE $CM2)|$(HAS $B ACTIVE $IT2)|$(HAS $B ACTIVE $CM1)|$(HAS $S ACTIVE $IT2)"
GC=$(GETC $S "work-orders/$IT1")
[ "$GC|$(BODY '[d.viewOnly,d.crossClose].join(",")')" = "200|true,true" ] \
  && pass "หัวหน้าภาคของพื้นที่เปิดใบ IT ได้ · ดูอย่างเดียว + ปิดใบงานได้ (crossClose)" || fail "S เปิดใบ IT: $GC $(BODY 'JSON.stringify([d.error,d.viewOnly,d.crossClose])')"
GC=$(GETC $S "work-orders/$IT2")
[ "$GC" = "403" ] && BODY 'd.error' | grep -q "หัวหน้าไอทีทดสอบ" && pass "ใบ IT ภาคอื่นเปิดตรง ๆ ได้ 403 บอกว่าอยู่กับใคร" || fail "S เปิดใบ IT ภาคอื่น: $GC $(BODY 'd.error')"
GC=$(CODE $S "work-orders/$IT1/parts" '{"needsParts":false}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT1")" = "403|NEW" ] && BODY 'd.error' | grep -q "คุณเห็นและปิดใบงานได้" \
  && pass "หัวหน้าภาคของพื้นที่กดขั้นอื่นของใบ IT ไม่ได้ (403 บอกว่าปิดได้ · ฐานข้อมูลไม่เปลี่ยน)" || fail "S กดขั้นใบ IT: $GC $(BODY 'd.error')"
GC=$(CODE $S "work-orders/$IT5/supervisor-close" '{"reason":"PHONE","note":"ร้านโทรมาบอกว่าเครื่องออนไลน์ได้แล้ว"}')
[ "$GC|$(DB "select status||'|'||\"closeResult\"||'|'||\"closedById\" from \"WorkOrder\" where id=$IT5")" = "200|DONE|SUPERVISOR_CLOSED|$SID" ] \
  && pass "หัวหน้าภาคของพื้นที่ปิดใบ IT ได้ (ฐานข้อมูล: ปิดงาน · SUPERVISOR_CLOSED · คนปิดคือ S001)" || fail "S ปิดใบ IT: $GC $(BODY 'd.error')"
GC=$(CODE $S "work-orders/$IT2/supervisor-close" '{"reason":"PHONE","note":"ทดสอบปิดใบภาคอื่นทางโทรศัพท์"}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT2")" = "403|AWAITING_QUOTE" ] && pass "ใบ IT ภาคอื่นปิดไม่ได้ (403 · ฐานข้อมูลไม่เปลี่ยน)" || fail "S ปิดใบ IT ภาคอื่น: $GC"
[ "$(GETC $T "work-orders/$IT4")" = "200" ] && pass "ช่างทีมที่รับยังเปิดใบ IT ที่ถืออยู่ได้" || fail "ช่างเปิดใบ IT ไม่ได้: $(BODY 'd.error')"
[ "$(GETC $A "work-orders/$IT1")|$(BODY 'd.supervisors.map(s=>s.name).join(",")')|$(BODY 'd.itLead&&d.itLead.name')" = "200|หัวหน้าไอทีทดสอบ|หัวหน้าไอทีทดสอบ" ] \
  && pass "หน้าใบงาน: ใครดูแลใบ IT = หัวหน้า IT" || fail "detail supervisors: $(BODY 'JSON.stringify([d.supervisors,d.itLead])')"
[ "$(ROW $A ACTIVE $IT1 'r.waitingOnSupervisors.map(s=>s.name).join(",")+"|"+r.orphan+"|"+r.jobType')" = "หัวหน้าไอทีทดสอบ|false|IT" ] \
  && pass "รายการ: ใบ IT รอหัวหน้า IT (ไม่ใช่หัวหน้าภาคตามพื้นที่) · ไม่ใช่ไม่มีคนรับ" || fail "row: $(ROW $A ACTIVE $IT1 'JSON.stringify([r.waitingOnSupervisors,r.orphan])')"

echo "═══ กล่องงาน"
[ "$(HAS $L INBOX $IT1)|$(HAS $L INBOX $IT2)|$(HAS $L INBOX $CM1)" = "มี|มี|ไม่มี" ] \
  && pass "กล่องหัวหน้า IT: ใบ IT ขั้นหัวหน้าภาค + ขั้นแอดมิน · ใบ CM ขั้นแอดมินไม่เข้า" || fail "กล่อง L: $(HAS $L INBOX $IT1)|$(HAS $L INBOX $IT2)|$(HAS $L INBOX $CM1)"
[ "$(HAS $S INBOX $IT1)|$(HAS $A INBOX $IT2)|$(HAS $A INBOX $CM1)" = "ไม่มี|มี|มี" ] \
  && pass "กล่องหัวหน้าภาคอื่นไม่มีใบ IT · กล่องแอดมินยังมีใบ IT (แยกหัวข้อที่หน้าจอ)" || fail "กล่องอื่น: $(HAS $S INBOX $IT1)|$(HAS $A INBOX $IT2)|$(HAS $A INBOX $CM1)"
for who in L S A; do
  tok=${!who}
  [ "$(INBOXN $tok)" = "$(ROWSN $tok)" ] && pass "ตัวเลขกล่องงาน = แถวในกล่อง ($who: $(ROWSN $tok))" || fail "ตัวเลขกล่องงาน $who: $(INBOXN $tok) vs $(ROWSN $tok)"
done

echo "═══ ขั้นของแอดมินในใบ IT"
[ "$(UPLOAD $L $IT2 "$SP/quote-sample.pdf;type=application/pdf" QUOTE)" = "201" ] || [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$IT2 and role='QUOTE'")" = "1" ] \
  && pass "หัวหน้า IT แนบใบเสนอราคาในใบ IT" || fail "แนบใบเสนอราคา IT"
GC=$(CODE $L "work-orders/$IT2/quote" '{}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT2")|$(DB "select u.\"employeeCode\" from \"WorkOrderLog\" l join \"User\" u on u.id=l.\"userId\" where l.\"workOrderId\"=$IT2 and l.action='QUOTED' order by l.id desc limit 1")" = "200|AWAITING_PAYMENT|ZITL$SUF" ] \
  && pass "หัวหน้า IT ส่งใบเสนอราคาใบ IT ได้ (ฐานข้อมูล: รอลูกค้าจ่ายเงิน · ประวัติชื่อหัวหน้า IT)" || fail "quote IT: $GC $(BODY 'd.error')"
GC=$(CODE $L "work-orders/$IT2/payment-followup" '{"note":"โทรตามลูกค้าแล้ว"}')
[ "$GC|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$IT2 and action='PAYMENT_FOLLOWUP' and \"userId\"=$LID")" = "200|1" ] \
  && pass "หัวหน้า IT ตามลูกค้าเรื่องจ่ายเงินได้" || fail "followup IT: $GC $(BODY 'd.error')"
GC=$(CODE $A "work-orders/$IT2/payment-followup" '{"note":"แอดมินตามอีกรอบ"}')
[ "$GC" = "200" ] && pass "แอดมินยังทำขั้นของตัวเองในใบ IT ได้" || fail "admin followup IT: $GC"
UPLOAD $L $CM1 "$SP/quote-sample.pdf;type=application/pdf" QUOTE >/dev/null
GC=$(CODE $L "work-orders/$CM1/quote" '{}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$CM1")" = "403|AWAITING_QUOTE" ] && pass "ใบ CM: หัวหน้า IT ทำขั้นของแอดมินไม่ได้ (403)" || fail "quote CM by L: $GC"
GC=$(CODE $B "work-orders/$IT2/payment-followup" '{"note":"ไม่ใช่ของฉัน"}')
[ "$GC" = "403" ] && pass "หัวหน้าภาคคนอื่นทำขั้นของแอดมินในใบ IT ไม่ได้" || fail "B followup IT: $GC"
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$IT4" >/dev/null
GC=$(CODE $L "work-orders/$IT4/claim-review" '{"decisions":[]}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT4")" = "403|CLAIM_REVIEW" ] && pass "ตรวจเคลมยังเป็นของ Admin Spare Part (หัวหน้า IT 403)" || fail "claim-review by L: $GC"
DB "update \"WorkOrder\" set status='IN_PROGRESS' where id=$IT4" >/dev/null

echo "═══ ไม่มีหัวหน้า IT"
[ "$(PATCHU $A $LID '{"itLead":false}')|$(LEADS)" = "200|-" ] && pass "ปิดสวิตช์ → ไม่มีหัวหน้า IT" || fail "ปิดสวิตช์: $(LEADS)"
[ "$(ROW $A INBOX $IT1 'r.orphan+"|"+/ยังไม่ได้เลือกหัวหน้าภาคที่ดูแลงาน IT/.test(r.orphanReason)')" = "true|true" ] \
  && pass "ใบ IT รอหัวหน้าภาค = ไม่มีคนรับในกล่องแอดมิน (เหตุผลบอกให้เลือกหัวหน้า IT)" || fail "orphan: $(ROW $A INBOX $IT1 'JSON.stringify([r.orphan,r.orphanReason])')"
[ "$(HAS $L ACTIVE $IT1)|$(HAS $S ACTIVE $IT1)|$(HAS $S INBOX $IT1)" = "ไม่มี|มี|ไม่มี" ] \
  && pass "ไม่มีหัวหน้า IT: คนที่เคยถือ (ภาคอื่น) ไม่เห็นใบ IT ภาคใต้ · หัวหน้าภาคของพื้นที่ยังเห็น (ปิดได้) แต่ไม่เข้ากล่องงาน" \
  || fail "ไม่มีหัวหน้า IT: L=$(HAS $L ACTIVE $IT1) S=$(HAS $S ACTIVE $IT1) S-กล่อง=$(HAS $S INBOX $IT1)"
[ "$(INBOXN $A)" = "$(ROWSN $A)" ] && pass "ตัวเลขกล่องแอดมินรวมใบไม่มีคนรับทันที (ล้างที่จำไว้)" || fail "admin count: $(INBOXN $A) vs $(ROWSN $A)"
PATCHU $A $CID '{"itLead":true}' >/dev/null
[ "$(PATCHU $A $CID '{"role":"EMPLOYEE"}')|$(DB "select \"itLead\" from \"User\" where id=$CID")|$(LEADS)" = "200|f|-" ] \
  && pass "เปลี่ยนบทบาทเป็นช่าง = ถอดหัวหน้า IT" || fail "role change: $(LEADS)"
PATCHU $A $CID '{"role":"SUPERVISOR"}' >/dev/null; PATCHU $A $CID '{"itLead":true}' >/dev/null
GC=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "localhost:4000/api/auth/users/$CID" -H "$(H $SA)")
[ "$GC|$(LEADS)|$(ROW $A INBOX $IT1 'r.orphan')" = "200|-|true" ] && pass "ลบผู้ใช้ = ไม่มีหัวหน้า IT · ใบ IT กลับเป็นไม่มีคนรับทันที" || fail "delete: $GC $(LEADS)"
PATCHU $A $LID '{"itLead":true}' >/dev/null
[ "$(LEADS)|$(ROW $A ACTIVE $IT1 'r.orphan')|$(HAS $A INBOX $IT1)|$(HAS $L INBOX $IT1)" = "ZITL$SUF|false|ไม่มี|มี" ] && pass "ตั้งกลับ → ใบ IT ย้ายไปหัวหน้า IT ทันที" || fail "ตั้งกลับ: $(LEADS)"

echo "═══ แก้จากระยะไกลแล้ว · ปิดงาน"
NOTE='{"note":"รีสตาร์ทระบบจ่ายเงินจากหลังบ้าน ทดสอบแล้วผ่าน"}'
GC=$(CODE $L "work-orders/$IT3/remote-close" "$NOTE")
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT3")" = "400|NEW" ] && BODY 'd.error' | grep -q "ภาพหน้าจอ" && pass "ไม่มีภาพหน้าจอ = 400" || fail "no shot: $GC $(BODY 'd.error')"
[ "$(UPLOAD $S $IT3 "$SP/plate-huebsch.jpg;type=image/jpeg" REMOTE_FIX)" = "403" ] && pass "หัวหน้าภาคอื่นแนบหลักฐานไม่ได้" || fail "S แนบได้"
[ "$(UPLOAD $L $IT3 "$SP/quote-sample.pdf;type=application/pdf" REMOTE_FIX)" = "400" ] && pass "หลักฐานต้องเป็นรูป (PDF = 400)" || fail "PDF ผ่าน"
[ "$(UPLOAD $L $IT3 "$SP/plate-huebsch.jpg;type=image/jpeg" REMOTE_FIX)" = "201" ] && pass "หัวหน้า IT แนบภาพหน้าจอ (REMOTE_FIX)" || fail "แนบภาพหน้าจอไม่ได้"
GC=$(CODE $L "work-orders/$IT3/remote-close" '{"note":"สั้น"}')
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT3")" = "400|NEW" ] && pass "บันทึกสั้นเกิน = 400" || fail "short note: $GC"
GC=$(CODE $S "work-orders/$IT3/remote-close" "$NOTE"); GT=$(CODE $T "work-orders/$IT3/remote-close" "$NOTE"); GB=$(CODE $B "work-orders/$IT3/remote-close" "$NOTE")
[ "$GC|$GT|$GB|$(DB "select status from \"WorkOrder\" where id=$IT3")" = "403|403|403|NEW" ] && pass "หัวหน้าภาคอื่น · ช่าง = 403" || fail "others: $GC $GT $GB"
GC=$(CODE $L "work-orders/$IT2/remote-close" "$NOTE")
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT2")" = "409|AWAITING_PAYMENT" ] && pass "รอลูกค้าจ่ายเงิน = ปิดแบบนี้ไม่ได้ (409)" || fail "pay stage: $GC"
GC=$(CODE $A "work-orders/$IT4/remote-close" "$NOTE")
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$IT4")" = "409|IN_PROGRESS" ] && pass "ช่างถือใบอยู่ = ปิดแบบนี้ไม่ได้ (409)" || fail "in progress: $GC"
GC=$(CODE $A "work-orders/$CM2/remote-close" "$NOTE")
[ "$GC|$(DB "select status from \"WorkOrder\" where id=$CM2")" = "403|NEW" ] && pass "ใบ CM ปิดแบบนี้ไม่ได้ (เฉพาะใบ IT)" || fail "CM: $GC"
GC=$(CODE $L "work-orders/$IT3/remote-close" "$NOTE")
[ "$GC|$(DB "select status||'|'||\"closeResult\"||'|'||(\"closedById\"=$LID)::text||'|'||(\"closedAt\" is not null)::text||'|'||(\"closeNote\" like '%รีสตาร์ทระบบจ่ายเงิน%')::text from \"WorkOrder\" where id=$IT3")" = "200|DONE|REMOTE_FIXED|true|true|true" ] \
  && pass "ปิดได้: DONE · REMOTE_FIXED · ปิดโดยหัวหน้า IT · เวลาปิด · บันทึกสิ่งที่แก้" || fail "remote close: $GC $(BODY 'd.error')"
[ "$(DB "select action||'|'||(\"userId\"=$LID)::text from \"WorkOrderLog\" where \"workOrderId\"=$IT3 order by id desc limit 1")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$IT3 and role='REMOTE_FIX'")" = "REMOTE_CLOSED|true|1" ] \
  && pass "ประวัติ REMOTE_CLOSED · ไฟล์หลักฐาน REMOTE_FIX อยู่กับใบ" || fail "log/attachment: $(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$IT3 order by id desc limit 1")"
[ "$(GETC $A "work-orders/$IT3")|$(BODY 'd.logs[0].actionLabel+"|"+d.closeResultLabel')" = "200|ปิดงาน (แก้จากระยะไกล)|แก้จากระยะไกล · ไม่เข้าหน้างาน" ] \
  && pass "หน้าใบงานบอก \"ปิดงาน (แก้จากระยะไกล)\"" || fail "labels: $(BODY 'd.logs[0].actionLabel+"|"+d.closeResultLabel')"
GC=$(CODE $L "work-orders/$IT3/remote-close" "$NOTE")
[ "$GC" = "409" ] && pass "ปิดซ้ำไม่ได้ (409)" || fail "ปิดซ้ำ: $GC"

[ -z "$FAILED" ] || exit 1
