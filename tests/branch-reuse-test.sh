#!/bin/bash
# ทดสอบ: ใช้รหัสของสาขาที่ปิดแล้วกับสาขาใหม่ (เจ้าของงานตัดสิน 4 พ.ย. 69 — "ไม่รวมสาขา เปลี่ยนใหม่ คือข้อมูลใหม่ทั้งหมด เเต่ยังเก็บประวัติเก่าอยู่")
#   เรื่องจริง: ปิด C0546 (นครปฐม) แล้วบริษัทเอารหัสไปใช้กับร้านใหม่ที่ภูเก็ต — เพิ่มสาขาได้ "มีสาขารหัส C0546 อยู่แล้ว" ไม่มีทางไปต่อ
#   ก รหัสของสาขาที่เปิดอยู่: 409 เหมือนเดิม (ส่ง reuseClosedCode มาก็ไม่ได้) ฐานไม่เปลี่ยน
#   ข รหัสของสาขาที่ปิดแล้ว ไม่ยืนยัน: 409 + reuse (id ชื่อ วันปิด ใบงาน เครื่อง รหัสที่สาขาเดิมจะได้) ข้อความสำหรับแอปรุ่นเก่า · ฐานไม่เปลี่ยน
#       · ช่าง/หัวหน้าภาค 403 · รหัสลงท้าย "(เดิม)" เพิ่มเองไม่ได้ 400
#   ค ยืนยัน: สาขาเดิมเป็น "(เดิม)" + originalCode · สาขาใหม่ reusedFromId/reusedAt · ประวัติสองสาขาข้อความตรงตัว + คนทำ (ฐานข้อมูล)
#   ง สาขาเดิมเก็บใบงาน/เครื่องไว้ เปิดด้วยรหัส "(เดิม)" ผ่าน URL ที่เข้ารหัสได้ · สาขาใหม่เริ่มจากว่าง
#   จ ค้นรหัสเจอทั้งสองสาขา (/manage แท็บเปิดอยู่) · ค้นตอนเปิดใบงานเจอแค่สาขาใหม่ · รายการใบงานค้นเจอใบของสาขาเดิม
#   ฉ เคลมของสาขาเดิมไม่ไปติดสาขาใหม่ (ลิงก์เคลมสาขานี้ · เคลมซ้ำของเครื่อง W1) — ใบเคลมเก็บรหัสเป็นข้อความ
#   ช รายงานเครื่อง: แถวรหัสเดิมไปลงสาขาใหม่ · แถวรหัส "(เดิม)" ไม่สร้าง/ไม่แตะสาขา + หน้าสรุปบอก
#   ซ ไฟล์สาขายกเลิก: แถวรหัสที่ใช้กับสาขาใหม่ข้ามทั้งยกเลิก/คืน/รายเครื่อง ข้อความไทยบอกเหตุผล · บันทึกแล้วสาขาใหม่ยังเปิด
#   ฌ ใช้ซ้ำรอบสอง = "(เดิม 2)" · เปิด "(เดิม)" อีกครั้งไม่ได้ขณะรหัสมีเจ้าของ · เจ้าของถูกลบ = เปิดคืนพร้อมรหัสเดิม
#
# ใช้สาขา ZZU… ของตัวเองทั้งหมด · ใบงานล้างด้วย purge_orders · สาขา (รวม "(เดิม)") ลบใน trap — เครื่อง ประวัติ เคลมหายตาม (cascade)
# ถ้ายืนยันใช้รหัสซ้ำไม่สำเร็จ (โค้ดก่อนแก้) ข้อ ค ขึ้น FAIL แล้วตั้งสภาพเดียวกันด้วย SQL ให้ข้อ ง–ซ ยังตรวจตัวกันของตัวเองได้
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/import-history.sh"  # ih_mark/ih_clean: ล้างรอบในประวัติการนำเข้าที่ชุดนี้ทำให้เกิด
ih_mark
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$@"; }  # $2… = process.argv[2]… (ข้อความไทยยาว ๆ ไม่ต้องหนีอัญประกาศ)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SEND() { curl -s -X "$2" "localhost:4000/api/$3" -H "$(H $1)" -H 'Content-Type: application/json' -d "${4:-{\}}"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
enc() { node -p 'encodeURIComponent(process.argv[1])' "$1"; }
A=$(login A001); T=$(login T001); S=$(login S001)
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
IDS=""
cleanup() {
  ih_clean
  purge_orders "$A" $IDS
  DB "delete from \"Branch\" where code like 'ZZU%' or \"originalCode\" like 'ZZU%'" >/dev/null
  rm -rf "$TMP"
}
cleanup
trap cleanup EXIT
TMP=$(mktemp -d)   # หลัง cleanup ครั้งแรก — cleanup ลบโฟลเดอร์นี้

newwo() { SEND $A POST work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$2\",\"symptom\":\"$3\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
brow() { DB "select code||'|'||coalesce(\"originalCode\",'-')||'|'||coalesce(\"reusedFromId\"::text,'-')||'|'||(\"reusedAt\" is not null)||'|'||(\"cancelledAt\" is not null)||'|'||name from \"Branch\" where id=$1"; }
nzz() { DB "select count(*) from \"Branch\" where code like 'ZZU001%'"; }
logs() { DB "select count(*) from \"BranchLog\" where \"branchId\"=$1"; }
last() { DB "select action||'|'||note||'|'||coalesce(\"byName\",'-')||'|'||coalesce(\"byUserId\"::text,'-') from \"BranchLog\" where \"branchId\"=$1 order by id desc limit 1"; }
# วันไทยแบบเดียวกับข้อความในหน้าสรุปไฟล์ ("5 พ.ย. 2569") จากเวลาในฐาน (UTC ไม่มีโซน)
thday() { node -e 'const M=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; const t=new Date(new Date(process.argv[1].replace(" ","T")+"Z").getTime()+7*3600e3); console.log(t.getUTCDate()+" "+M[t.getUTCMonth()]+" "+(t.getUTCFullYear()+543))' "$1"; }

OLDNAME="ร้านเดิมทดสอบ นครปฐม"
NEWNAME="ร้านใหม่ทดสอบ ภูเก็ต"

echo "═══ ก รหัสของสาขาที่เปิดอยู่"
OLD=$(SEND $A POST branches "{\"code\":\"ZZU001\",\"name\":\"$OLDNAME\",\"region\":\"กลาง-ตะวันตก\"}" | J 'd.id')
R1=$(SEND $A POST branches "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\"}")
S1=$(CODE $A branches POST "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"reuseClosedCode\":true}")
[ "$(echo "$R1" | J 'd.error+"|"+(d.reuse===undefined)')" = "มีสาขารหัส ZZU001 อยู่แล้ว|true" ] && [ "$S1" = "409" ] \
  && [ "$(nzz)" = "1" ] && [ "$(brow $OLD)" = "ZZU001|-|-|false|false|$OLDNAME" ] && [ "$(logs $OLD)" = "0" ] \
  && pass "รหัสของสาขาที่เปิดอยู่: 409 “มีสาขารหัส … อยู่แล้ว” ไม่มีข้อเสนอใช้ซ้ำ · ส่ง reuseClosedCode ก็ 409 · ฐานไม่เปลี่ยน" \
  || fail "สาขาเปิดอยู่: $R1 · $S1 · $(nzz) · $(brow $OLD)"

echo "═══ ข รหัสของสาขาที่ปิดแล้ว (ยังไม่ยืนยัน)"
W1=$(newwo ZZU001 W1 "ใบงานของร้านเดิมทดสอบใช้รหัสซ้ำ"); IDS="$IDS $W1"
# เคลมเก่าของ W1 ร้านเดิม (ใบเคลมเก็บรหัสสาขาเป็นข้อความ ณ ตอนส่ง) — ข้อ ฉ ตรวจว่าไม่ไปติดสาขาใหม่
DB "insert into \"PartClaim\" (\"workOrderId\",\"partCode\",\"partName\",\"branchCode\",\"branchName\",\"machineCode\",symptom,\"checkNote\",status,\"createdById\",\"createdAt\")
    values ($W1,'SP-BOARD','บอร์ดทดสอบ','ZZU001','$OLDNAME','W1','อาการทดสอบ','เช็คทดสอบ','APPROVED',$AID,now() - interval '2 days')" >/dev/null
SEND $A POST branches/$OLD/close '{"note":"ปั๊มปิดทดสอบ"}' >/dev/null
CLOSEDAT=$(DB "select to_char(\"cancelledAt\",'YYYY-MM-DD\"T\"HH24:MI:SS') from \"Branch\" where id=$OLD")
R2=$(SEND $A POST branches "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\"}")
S2=$(CODE $A branches POST "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"reuseClosedCode\":false}")
EXPECT_ERR="รหัส ZZU001 เป็นของสาขาที่ปิดแล้ว ($OLDNAME) — ใช้กับสาขาใหม่ได้เมื่อกดยืนยัน ไม่เห็นหน้าต่างยืนยัน = แอปรุ่นเก่า กดปุ่ม “อัปเดต”"
[ "$(echo "$R2" | J 'const r=d.reuse||{}; [r.id,r.code,r.name,(r.closedAt||"").slice(0,19),r.workOrders,r.machines,r.retiredCode,r.closedNote].join("|")')" = \
  "$OLD|ZZU001|$OLDNAME|$CLOSEDAT|1|1|ZZU001 (เดิม)|ปิดในแอปโดย $ANAME — ปั๊มปิดทดสอบ" ] \
  && pass "ไม่ยืนยัน: 409 พร้อมข้อมูลสาขาเดิม (id ชื่อ วันปิด ใบงาน 1 เครื่อง 1 รหัสที่จะได้ “ZZU001 (เดิม)”)" || fail "ข้อเสนอใช้ซ้ำ: $R2"
[ "$(echo "$R2" | J 'd.error')" = "$EXPECT_ERR" ] && [ "$S2" = "409" ] \
  && pass "ข้อความ 409 บอกแอปรุ่นเก่าว่าทำไมและให้อัปเดต · reuseClosedCode:false ก็ 409" || fail "ข้อความ: $(echo "$R2" | J 'd.error') · $S2"
[ "$(nzz)" = "1" ] && [ "$(brow $OLD)" = "ZZU001|-|-|false|true|$OLDNAME" ] && [ "$(logs $OLD)" = "1" ] \
  && pass "ยังไม่ยืนยัน: ไม่มีสาขาใหม่ สาขาเดิมรหัสเดิม ไม่ลงประวัติเพิ่ม (ฐานข้อมูล)" || fail "ถามแล้วฐานเปลี่ยน: $(nzz) · $(brow $OLD) · $(logs $OLD)"
ST=$(CODE $T branches POST "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"reuseClosedCode\":true}")
SS=$(CODE $S branches POST "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"reuseClosedCode\":true}")
[ "$ST" = "403" ] && [ "$SS" = "403" ] && [ "$(nzz)" = "1" ] && [ "$(brow $OLD)" = "ZZU001|-|-|false|true|$OLDNAME" ] \
  && pass "ช่าง/หัวหน้าภาคยืนยันใช้รหัสซ้ำ: 403 · ฐานไม่เปลี่ยน" || fail "ไม่ใช่แอดมิน: $ST $SS · $(nzz) · $(brow $OLD)"
E1=$(SEND $A POST branches '{"code":"ZZU009 (เดิม)","name":"เพิ่มรหัสแบบเดิมเอง"}' | J 'd.error')
S3=$(CODE $A branches POST '{"code":"ZZU009 (เดิม 2)","name":"เพิ่มรหัสแบบเดิมเอง"}')
[ "$E1" = "รหัสลงท้าย “(เดิม)” ระบบตั้งให้สาขาที่ยกรหัสให้สาขาใหม่เท่านั้น — ใส่รหัสตามทะเบียน เช่น C0546" ] && [ "$S3" = "400" ] \
  && [ "$(DB "select count(*) from \"Branch\" where code like 'ZZU009%'")" = "0" ] \
  && pass "เพิ่มสาขารหัสลงท้าย “(เดิม)” / “(เดิม 2)” เอง: 400 ข้อความไทย ไม่มีสาขาเกิด" || fail "รหัส (เดิม): $E1 · $S3"

echo "═══ ค ยืนยันใช้รหัสซ้ำ"
R3=$(SEND $A POST branches "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"region\":\"ใต้\",\"ownership\":\"COCO\",\"zone\":\"กระบี่\",\"reuseClosedCode\":true}")
NEW=$(DB "select id from \"Branch\" where code='ZZU001' and id<>$OLD")
if [ -n "$NEW" ] && [ "$(echo "$R3" | J 'd.id+"|"+d.code+"|"+(d.retired&&d.retired.id)+"|"+(d.retired&&d.retired.code)')" = "$NEW|ZZU001|$OLD|ZZU001 (เดิม)" ]; then
  pass "ยืนยัน: 201 สาขาใหม่ได้รหัส ZZU001 · คำตอบบอกว่าสาขาเดิมเป็น “ZZU001 (เดิม)”"
else
  fail "ยืนยันไม่สำเร็จ: $R3 — ตั้งสภาพด้วย SQL ให้ข้อถัดไปตรวจตัวกันของตัวเองได้"
  DB "update \"Branch\" set code='ZZU001 (เดิม)', \"originalCode\"='ZZU001' where id=$OLD" >/dev/null 2>&1 || true
  NEW=$(DB "insert into \"Branch\"(code,name,region,ownership,zone,\"reusedFromId\",\"reusedAt\") values ('ZZU001','$NEWNAME','ใต้','COCO','กระบี่',$OLD,now()) returning id" 2>/dev/null | head -1)
fi
[ "$(brow $OLD)" = "ZZU001 (เดิม)|ZZU001|-|false|true|$OLDNAME" ] \
  && [ "$(brow $NEW)" = "ZZU001|-|$OLD|true|false|$NEWNAME" ] \
  && [ "$(DB "select concat_ws('|',region,ownership,zone) from \"Branch\" where id=$NEW")" = "ใต้|COCO|กระบี่" ] \
  && pass "ฐาน: สาขาเดิมรหัส “ZZU001 (เดิม)” + originalCode ZZU001 ยังปิดอยู่ ชื่อเดิม · สาขาใหม่ reusedFromId = สาขาเดิม + reusedAt · ภาค/ประเภท/ทีมตามที่กรอก" \
  || fail "ฐานหลังยืนยัน: เดิม [$(brow $OLD)] · ใหม่ [$(brow $NEW)]"
[ "$(last $OLD)" = "CODE_RETIRED|รหัส ZZU001 ไปใช้กับสาขาใหม่ “$NEWNAME” — สาขานี้เปลี่ยนเป็น “ZZU001 (เดิม)”|$ANAME|$AID" ] \
  && [ "$(DB "select (meta->>'newBranchId')||'|'||(meta->>'from')||'|'||(meta->>'to') from \"BranchLog\" where \"branchId\"=$OLD and action='CODE_RETIRED'")" = "$NEW|ZZU001|ZZU001 (เดิม)" ] \
  && pass "ประวัติสาขาเดิม: “รหัส ZZU001 ไปใช้กับสาขาใหม่ … — สาขานี้เปลี่ยนเป็น “ZZU001 (เดิม)”” + คนทำ + meta ชี้สาขาใหม่" \
  || fail "ประวัติสาขาเดิม: $(last $OLD)"
[ "$(last $NEW)" = "CODE_REUSED|รับรหัส ZZU001 ต่อจากสาขาที่ปิดแล้ว “$OLDNAME” (ตอนนี้ “ZZU001 (เดิม)”)|$ANAME|$AID" ] && [ "$(logs $NEW)" = "1" ] \
  && [ "$(DB "select meta->>'fromBranchId' from \"BranchLog\" where \"branchId\"=$NEW")" = "$OLD" ] \
  && pass "ประวัติสาขาใหม่: “รับรหัส ZZU001 ต่อจากสาขาที่ปิดแล้ว …” + คนทำ + meta ชี้สาขาเดิม" || fail "ประวัติสาขาใหม่: $(last $NEW)"
[ "$(GET $A "branches/$OLD/logs?limit=1" | J 'd[0].action+"|"+d[0].byName')" = "CODE_RETIRED|$ANAME" ] \
  && [ "$(GET $A "branches/$NEW/logs" | J 'd.map(l=>l.action).join(",")')" = "CODE_REUSED" ] \
  && pass "GET /:id/logs (ประวัติในแผงแก้ไข) ขึ้นรายการใหม่ของทั้งสองสาขา" || fail "logs API"
[ "$(CODE $A branches POST "{\"code\":\"ZZU001\",\"name\":\"$NEWNAME\",\"reuseClosedCode\":true}")" = "409" ] && [ "$(nzz)" = "2" ] \
  && pass "ยืนยันซ้ำ (กดสองที/อีกคน): 409 รหัสเป็นของสาขาใหม่ที่เปิดอยู่ ไม่เกิดสาขาที่สาม" || fail "ยืนยันซ้ำ: $(nzz)"

echo "═══ ง สาขาเดิมเก็บใบงานและเครื่อง"
[ "$(DB "select \"branchId\" from \"WorkOrder\" where id=$W1")" = "$OLD" ] \
  && [ "$(DB "select string_agg(code,',') from \"Machine\" where \"branchId\"=$OLD")" = "W1" ] \
  && [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$NEW")" = "0" ] && [ "$(DB "select count(*) from \"WorkOrder\" where \"branchId\"=$NEW")" = "0" ] \
  && pass "ใบงานและเครื่อง W1 อยู่กับสาขาเดิม (id เดิม) · สาขาใหม่ไม่มีอะไรติดมา (ฐานข้อมูล)" || fail "ข้อมูลย้าย: $(DB "select \"branchId\" from \"WorkOrder\" where id=$W1")"
[ "$(GET $A "work-orders/$W1" | J '(d.branch&&d.branch.code)||d.branchCode')" = "ZZU001 (เดิม)" ] \
  && pass "เปิดใบงานของสาขาเดิม: ขึ้นรหัส “ZZU001 (เดิม)”" || fail "ใบงาน: $(GET $A "work-orders/$W1" | head -c 300)"
EOLD=$(enc "ZZU001 (เดิม)")
[ "$(GET $A "branches/$EOLD/machines" | J 'd.map(m=>m.code).join(",")')" = "W1" ] && [ "$(GET $A "branches/ZZU001/machines" | J 'd.length')" = "0" ] \
  && [ "$(GET $A "branches/$EOLD/open-work-orders" | J 'd.map(o=>o.id).join(",")')" = "$W1" ] && [ "$(GET $A "branches/ZZU001/open-work-orders" | J 'd.length')" = "0" ] \
  && [ "$(GET $A "branches/$EOLD/last-contact" | J 'typeof d')" = "object" ] \
  && pass "GET /branches/:code/… ด้วยรหัสที่มีช่องว่าง+วงเล็บ (เข้ารหัส URL): เครื่อง/ใบค้างของสาขาเดิม · รหัสเดิมได้ของสาขาใหม่ (ว่าง)" \
  || fail "URL (เดิม): $(GET $A "branches/$EOLD/machines" | head -c 200)"
[ "$(GET $A "work-orders?status=ALL&branchCode=$EOLD" | J '(Array.isArray(d)?d:d.items||d.orders||d.rows||[]).map(o=>o.id).join(",")')" = "$W1" ] \
  && pass "รายการใบงานกรองด้วยรหัส “(เดิม)” (ลิงก์ใบงานสาขานี้): ได้ใบของสาขาเดิม" || fail "กรองรหัส (เดิม): $(GET $A "work-orders?status=ALL&branchCode=$EOLD" | head -c 200)"

echo "═══ จ ค้นรหัสเจอทั้งสองสาขา"
M=$(GET $A "branches/manage?search=ZZU001")
[ "$(echo "$M" | J 'd.rows.map(r=>r.code).join(",")')" = "ZZU001,ZZU001 (เดิม)" ] \
  && [ "$(echo "$M" | J 'const o=d.rows[1]; [o.originalCode,o.codeHolder&&o.codeHolder.id,!!o.cancelledAt].join("|")')" = "ZZU001|$NEW|true" ] \
  && [ "$(echo "$M" | J 'const n=d.rows[0]; [n.reusedFrom&&n.reusedFrom.code,!!n.reusedAt,String(n.originalCode)].join("|")')" = "ZZU001 (เดิม)|true|null" ] \
  && pass "หน้าจัดการสาขา ค้น ZZU001 (แท็บเปิดอยู่): สาขาใหม่ + “ZZU001 (เดิม)” · แถวเดิมบอกรหัสจริงและเจ้าของตอนนี้ · แถวใหม่บอกว่ารับรหัสมาจากไหน" \
  || fail "manage ค้น: $(echo "$M" | J 'JSON.stringify(d.rows.map(r=>[r.code,r.originalCode,r.codeHolder,r.reusedFrom]))')"
[ "$(GET $A "branches/manage?status=closed&search=ZZU001" | J 'd.rows.map(r=>r.code).join(",")')" = "ZZU001 (เดิม)" ] \
  && [ "$(GET $A "branches/manage?search=$(enc "$OLDNAME")" | J 'd.rows.length')" = "0" ] \
  && [ "$(GET $A "branches/manage" | J 'd.rows.some(r=>r.code.startsWith("ZZU001 ("))')" = "false" ] \
  && pass "แท็บปิดแล้วมีแต่สาขาเดิม · ค้นด้วยชื่อร้านเดิมหรือไม่ค้น สาขาที่ปิดยังไม่ขึ้นในแท็บเปิดอยู่" || fail "manage แท็บอื่น"
[ "$(GET $A "branches?search=ZZU001" | J 'd.map(b=>b.code).join(",")')" = "ZZU001" ] \
  && pass "ค้นสาขาตอนเปิดใบงาน: ได้แค่สาขาใหม่ (สาขาที่ปิดไม่ขึ้น)" || fail "ค้นเปิดใบงาน: $(GET $A "branches?search=ZZU001" | J 'd.map(b=>b.code).join(",")')"
[ "$(GET $A "work-orders?status=ALL&search=ZZU001" | J '(Array.isArray(d)?d:d.items||d.orders||d.rows||[]).some(o=>o.id==='"$W1"')')" = "true" ] \
  && pass "รายการใบงาน ค้น ZZU001: เจอใบของสาขาเดิม" || fail "ค้นใบงาน"

echo "═══ ฉ เคลมของสาขาเดิมไม่ไปติดสาขาใหม่"
W2=$(newwo ZZU001 W1 "ใบงานของร้านใหม่ทดสอบเครื่อง W1"); IDS="$IDS $W2"
[ "$(DB "select \"branchId\" from \"WorkOrder\" where id=$W2")" = "$NEW" ] && [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$NEW and code='W1'")" = "1" ] \
  && pass "เปิดใบงานด้วยรหัส ZZU001: ลงสาขาใหม่ เครื่อง W1 ใหม่ของสาขาใหม่" || fail "ใบงานใหม่ลงผิดสาขา"
REL_NEW=$(GET $A "part-claims/related?branchCode=ZZU001&machineCode=W1")
REL_OLD=$(GET $A "part-claims/related?branchCode=$EOLD&machineCode=W1")
[ "$(echo "$REL_NEW" | J 'd.branch+"|"+d.machine')" = "0|0" ] && [ "$(echo "$REL_OLD" | J 'd.branch+"|"+d.machine')" = "1|1" ] \
  && pass "ลิงก์ “เคลมสาขานี้/เครื่องนี้”: สาขาใหม่ 0 · สาขาเดิม (รหัส “(เดิม)”) 1 — ใบเคลมยังเขียน ZZU001 แต่นับตามสาขาของใบงาน" \
  || fail "related: ใหม่ $REL_NEW · เดิม $REL_OLD"
[ "$(GET $A "part-claims?branchCode=$EOLD" | J '(d.rows||[]).map(r=>r.branchCode).join(",")')" = "ZZU001" ] \
  && pass "ประวัติเคลมของสาขาเดิม: แถวยังขึ้นรหัสตามใบเคลม (ZZU001 — เอกสารที่ออกไปแล้วไม่เปลี่ยน)" || fail "ประวัติเคลม: $(GET $A "part-claims?branchCode=$EOLD" | head -c 300)"
[ "$(GET $A "work-orders/$W2" | J 'JSON.stringify(d.claimRepeats||[])')" = "[]" ] \
  && pass "เคลมซ้ำของ W1 สาขาใหม่: ไม่มี (เคลมของ W1 ร้านเดิมไม่นับ)" || fail "เคลมซ้ำติดมา: $(GET $A "work-orders/$W2" | J 'JSON.stringify(d.claimRepeats)')"

echo "═══ ช รายงานเครื่อง"
REPORT() {
  (cd backend && node_modules/.bin/ts-node --transpile-only -e '
    import("./src/machines/import").then(async (m) => {
      const rows = JSON.parse(process.argv[1]);
      if (process.argv[2] === "plan") {
        const p = await m.planImport({ rows, rowsInFile: rows.length, duplicateRows: 0, recordedAt: null, errors: [] }, new Date(), "manual");
        console.log(JSON.stringify({ newBranchCount: p.newBranchCount, newBranchSample: p.newBranchSample, warnings: p.warnings }));
      } else {
        const r = await m.writeReportBranches(rows);
        console.log(JSON.stringify({ branches: r.branchesTouched }));
      }
      process.exit(0);
    }).catch((e) => { console.log("ERR " + e.message); process.exit(1); });' "$1" "$2" 2>&1 | tail -1)
}
row() { echo "{\"branchCode\":\"$1\",\"branchName\":\"$2\",\"ownership\":null,\"branchStatus\":null,\"machineCode\":\"$3\",\"machineType\":\"WASHER\",\"machineBrand\":null,\"stateCode\":\"0\",\"signalLost\":false,\"region\":null,\"zone\":null,\"grade\":null}"; }
ROWS="[$(row ZZU001 "ปตท. ศรีสุนทร ภูเก็ต (รายงาน)" W5),$(row "ZZU001 (เดิม)" "$OLDNAME" W9),$(row "ZZU777 (เดิม)" "ร้านที่ไม่มี" W1)]"
P=$(REPORT "$ROWS" plan)
RETIRED_NOTE="ข้าม 2 แถว — รหัสลงท้าย “(เดิม)” ระบบตั้งให้สาขาที่ยกรหัสให้สาขาใหม่ ไม่ใช่รหัสในทะเบียน ไฟล์แก้สาขาพวกนี้ไม่ได้: ZZU001 (เดิม), ZZU777 (เดิม)"
[ "$(echo "$P" | J 'd.newBranchCount+"|"+d.warnings.includes(process.argv[2])' "$RETIRED_NOTE")" = "0|true" ] \
  && pass "หน้าสรุปรายงานเครื่อง: ZZU001 ไม่ใช่สาขาใหม่ (มีแล้ว) · แถว “(เดิม)” ข้ามพร้อมข้อความไทย" || fail "planImport: $P"
REPORT "$ROWS" >/dev/null
[ "$(DB "select string_agg(code,',' order by code) from \"Machine\" where \"branchId\"=$NEW")" = "W1,W5" ] \
  && [ "$(DB "select string_agg(code,',' order by code) from \"Machine\" where \"branchId\"=$OLD")" = "W1" ] \
  && [ "$(DB "select count(*) from \"Machine\" where code='W9' and \"branchId\" in ($OLD,$NEW)")" = "0" ] \
  && [ "$(DB "select count(*) from \"Branch\" where code like 'ZZU777%'")" = "0" ] \
  && [ "$(DB "select name from \"Branch\" where id=$OLD")" = "$OLDNAME" ] \
  && [ "$(DB "select name from \"Branch\" where id=$NEW")" = "ปตท. ศรีสุนทร ภูเก็ต (รายงาน)" ] \
  && pass "เขียนรายงานเครื่อง: แถว ZZU001 ลงสาขาใหม่ (W5 + ชื่อตามรายงาน) · สาขาเดิมไม่ถูกแตะ · ไม่สร้างสาขา “ZZU777 (เดิม)” (ฐานข้อมูล)" \
  || fail "writeReportBranches: ใหม่ $(DB "select string_agg(code,',') from \"Machine\" where \"branchId\"=$NEW") · เดิม $(DB "select string_agg(code,',') from \"Machine\" where \"branchId\"=$OLD") · $(DB "select string_agg(code,',') from \"Branch\" where code like 'ZZU%'")"

echo "═══ ซ ไฟล์สาขายกเลิก"
OTHER=$(SEND $A POST branches '{"code":"ZZU002","name":"ร้านทดสอบปิดด้วยไฟล์"}' | J 'd.id')
XLSX() {  # $1=ไฟล์ปลายทาง $2=แถว JSON [[code,num,action],…]
  node -e '
    const ExcelJS = require(process.argv[1] + "/node_modules/exceljs");
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("cancel");
    ws.addRow(["code", "num", "action", "หมายเหตุ"]);
    for (const r of JSON.parse(process.argv[3])) ws.addRow([r[0], r[1] || null, r[2] || null, "ทดสอบใช้รหัสซ้ำ"]);
    wb.xlsx.writeFile(process.argv[2]).then(() => process.exit(0));' "$PWD/backend" "$1" "$2"
}
UP() { curl -s -X POST localhost:4000/api/branches/cancelled-import -H "$(H $A)" -F "file=@$1" ${2:+-F mode=commit}; }
REUSED_DAY=$(thday "$(DB "select \"reusedAt\" from \"Branch\" where id=$NEW")")
XLSX "$TMP/one.xlsx" '[["ZZU001"]]'
P1=$(UP "$TMP/one.xlsx")
NOTE1="ข้าม ZZU001 — รหัสนี้ใช้กับสาขาใหม่เมื่อ $REUSED_DAY (สาขาเดิมปิดไปแล้ว) · ถ้าจะปิดสาขาใหม่ ให้กดปิดสาขาในแอป"
[ "$(echo "$P1" | J 'const p=d.plan; [p.toCancel.length,p.skippedReused.map(r=>r.code+":"+r.rows).join(","),p.warnings.includes(process.argv[2])].join("|")' "$NOTE1")" = "0|ZZU001:1|true" ] \
  && pass "ไฟล์ที่ยังมี ZZU001 (ไฟล์สะสม): หน้าสรุปไม่ยกเลิกสาขาใหม่ · บอก “$NOTE1”" || fail "หน้าสรุปแถวเดียว: $P1"
# ทั้งสาขา + ถอดเครื่อง W5 + คืนเครื่อง W1 (แถวคืนทั้งสาขาตรวจตอนสาขาใหม่ปิดอยู่ — ข้อ ฌ) · "(เดิม)" สั่งคืน · สาขาอื่นยังทำงานปกติ
XLSX "$TMP/mix.xlsx" '[["ZZU001"],["ZZU001","W5"],["ZZU001","W1","restore"],["ZZU001 (เดิม)",null,"restore"],["ZZU002"]]'
P2=$(UP "$TMP/mix.xlsx")
NOTE3="ข้าม ZZU001 (3 แถว) — รหัสนี้ใช้กับสาขาใหม่เมื่อ $REUSED_DAY (สาขาเดิมปิดไปแล้ว) · ถ้าจะปิดสาขาใหม่ ให้กดปิดสาขาในแอป"
NOTE_RET="ข้าม 1 แถว — รหัสลงท้าย “(เดิม)” ระบบตั้งให้สาขาที่ยกรหัสให้สาขาใหม่ ไม่ใช่รหัสในทะเบียน ไฟล์แก้สาขาพวกนี้ไม่ได้: ZZU001 (เดิม)"
[ "$(echo "$P2" | J 'const p=d.plan; [p.toCancel.map(b=>b.code).join(","),p.machinesToRemove.length,p.toRestore.length,p.warnings.includes(process.argv[2]),p.warnings.includes(process.argv[3]),p.skippedRetired.join(",")].join("|")' "$NOTE3" "$NOTE_RET")" = "ZZU002|0|0|true|true|ZZU001 (เดิม)" ] \
  && pass "ไฟล์ปนกัน: ยกเลิกทั้งสาขา/ถอดเครื่อง W5/คืนเครื่อง W1 ของ ZZU001 ข้ามทั้งหมด (3 แถว) · คืน “ZZU001 (เดิม)” ข้าม · ZZU002 ยังยกเลิกตามปกติ" \
  || fail "หน้าสรุปไฟล์ปนกัน: $(echo "$P2" | head -c 600)"
UP "$TMP/mix.xlsx" commit >/dev/null
[ "$(DB "select (\"cancelledAt\" is null)::text from \"Branch\" where id=$NEW")" = "true" ] \
  && [ "$(DB "select (\"removedAt\" is null)::text from \"Machine\" where \"branchId\"=$NEW and code='W5'")" = "true" ] \
  && [ "$(brow $OLD)" = "ZZU001 (เดิม)|ZZU001|-|false|true|$OLDNAME" ] \
  && [ "$(DB "select (\"cancelledAt\" is not null)::text from \"Branch\" where id=$OTHER")" = "true" ] \
  && pass "บันทึกไฟล์: สาขาใหม่ยังเปิด เครื่อง W5 ไม่ถูกถอด · สาขาเดิมยังปิด รหัสเดิม · ZZU002 ถูกยกเลิก (ฐานข้อมูล)" \
  || fail "บันทึกไฟล์: ใหม่ $(brow $NEW) · เดิม $(brow $OLD) · ZZU002 $(brow $OTHER)"

echo "═══ ฌ ใช้ซ้ำรอบสอง · เปิดสาขาเดิมอีกครั้ง"
SEND $A POST branches/$NEW/close '{"note":"ร้านใหม่ปิดทดสอบ"}' >/dev/null
# สาขาใหม่ปิดในแอปแล้ว — ไฟล์สาขายกเลิกสั่ง "คืน" ZZU001 ต้องไม่เปิดคืนให้ (แถวนั้นในไฟล์หมายถึงสาขาเดิม ไม่ใช่การตัดสินใจเรื่องร้านใหม่)
XLSX "$TMP/restore.xlsx" '[["ZZU001",null,"restore"]]'
P3=$(UP "$TMP/restore.xlsx" commit)
[ "$(echo "$P3" | J 'd.plan.toRestore.length+"|"+d.plan.skippedReused.map(r=>r.code).join(",")')" = "0|ZZU001" ] \
  && [ "$(DB "select (\"cancelledAt\" is not null)::text from \"Branch\" where id=$NEW")" = "true" ] \
  && pass "ไฟล์สั่งคืน ZZU001 ขณะสาขาใหม่ปิดในแอป: ข้าม ไม่เปิดคืนให้ (ฐานข้อมูล)" || fail "คืนจากไฟล์: $(echo "$P3" | head -c 300) · $(brow $NEW)"
R4=$(SEND $A POST branches '{"code":"ZZU001","name":"ร้านที่สามทดสอบ"}')
[ "$(echo "$R4" | J 'd.reuse.id+"|"+d.reuse.retiredCode+"|"+d.reuse.machines')" = "$NEW|ZZU001 (เดิม 2)|2" ] \
  && pass "รหัสเดียวกันปิดอีกรอบ: ข้อเสนอบอก “ZZU001 (เดิม 2)” (“(เดิม)” มีเจ้าของแล้ว) และเป็นสาขาที่ปิดล่าสุด" || fail "ข้อเสนอรอบสอง: $R4"
THIRD=$(SEND $A POST branches '{"code":"ZZU001","name":"ร้านที่สามทดสอบ","reuseClosedCode":true}' | J 'd.id')
[ "$(brow $NEW)" = "ZZU001 (เดิม 2)|ZZU001|$OLD|true|true|ปตท. ศรีสุนทร ภูเก็ต (รายงาน)" ] \
  && [ "$(brow $THIRD)" = "ZZU001|-|$NEW|true|false|ร้านที่สามทดสอบ" ] && [ "$(brow $OLD)" = "ZZU001 (เดิม)|ZZU001|-|false|true|$OLDNAME" ] \
  && [ "$(GET $A "branches/manage?search=ZZU001" | J 'd.rows.map(r=>r.code).sort().join(",")')" = "ZZU001,ZZU001 (เดิม 2),ZZU001 (เดิม)" ] \
  && pass "ใช้ซ้ำรอบสอง: “ZZU001 (เดิม 2)” · “(เดิม)” แรกไม่ถูกแตะ · ค้น ZZU001 เจอทั้งสามสาขา" || fail "รอบสอง: $(brow $NEW) · $(brow $THIRD)"
E5=$(SEND $A POST branches/$OLD/reopen | J 'd.error')
[ "$E5" = "เปิด ZZU001 (เดิม) อีกครั้งไม่ได้ — รหัส ZZU001 ใช้กับสาขาใหม่ “ร้านที่สามทดสอบ” แล้ว · ใบงาน เครื่อง และประวัติของสาขานี้ยังเปิดดูได้ตามเดิม" ] \
  && [ "$(brow $OLD)" = "ZZU001 (เดิม)|ZZU001|-|false|true|$OLDNAME" ] \
  && pass "เปิด “(เดิม)” อีกครั้งขณะรหัสมีเจ้าของ: 400 บอกว่ารหัสอยู่กับสาขาไหน · ยังปิด รหัสไม่เปลี่ยน" || fail "เปิดคืน (เดิม): $E5 · $(brow $OLD)"
[ "$(CODE $A branches/$THIRD DELETE)" = "204" ] && SEND $A POST branches/$NEW/reopen >/dev/null
[ "$(brow $NEW)" = "ZZU001|-|$OLD|true|false|ปตท. ศรีสุนทร ภูเก็ต (รายงาน)" ] \
  && [ "$(last $NEW)" = "REOPENED|เปิดสาขาอีกครั้ง — คืนรหัส ZZU001 (ไม่มีสาขาอื่นใช้รหัสนี้แล้ว)|$ANAME|$AID" ] \
  && pass "ลบสาขาที่เพิ่มผิด (ยังว่าง) แล้วเปิดสาขาก่อนหน้าอีกครั้ง: ได้รหัส ZZU001 คืน originalCode ว่าง + ประวัติบอกว่าคืนรหัส" \
  || fail "เปิดคืนพร้อมรหัส: $(brow $NEW) · $(last $NEW)"
[ "$(CODE $A branches/$OLD/reopen POST)" = "400" ] && [ "$(brow $OLD)" = "ZZU001 (เดิม)|ZZU001|-|false|true|$OLDNAME" ] \
  && pass "สาขาแรกยังเปิดคืนไม่ได้ — รหัสกลับไปอยู่กับสาขาที่สอง" || fail "สาขาแรกเปิดได้: $(brow $OLD)"

[ -z "$FAILED" ]
