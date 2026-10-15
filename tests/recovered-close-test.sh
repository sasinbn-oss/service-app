#!/bin/bash
# ทดสอบ: หัวหน้าภาคปิดงานเอง (เครื่องใช้งานได้แล้ว ไม่ต้องส่งช่าง) — หัวหน้าภาค/แอดมินเท่านั้น (ช่าง ·
#        หัวหน้าภาคนอกขอบเขต · Admin Spare Part ไม่ได้) · บังคับเหตุผล คำอธิบาย รูป/วิดีโอ RECOVERY ·
#        ปิดได้ทุกขั้นที่ยังไม่ปิด (รวมรอช่างปิดงาน · เบิกอะไหล่แล้วก็ได้) แต่ไม่ใช่รอตรวจเคลม · ผลเป็น RECOVERED + ประวัติ
#
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md) · ต้องมี mock-s3 รันอยู่ (tests/README.md)
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PHOTO() { curl -s -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=RECOVERY" | J 'd.id||d.error'; }
SUF=$RANDOM
BS="DZRS$SUF"; BN="DZRN$SUF"
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code in ('$BS','$BN'));
      delete from \"Branch\" where code in ('$BS','$BN');
      delete from \"User\" where \"employeeCode\"='ZRCP$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZRCP$SUF','แอดมินอะไหล่ทดสอบปิด','PARTS_ADMIN','$HASH',false)" >/dev/null
PA=$(login ZRCP$SUF)
# สาขาในภาคใต้ (ขอบเขตของ S001) กับสาขาภาคอื่น (นอกขอบเขต)
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values
  ('สาขาทดสอบปิดเอง ใต้','$BS','ใต้','กระบี่','FRANCHISE',now()-interval '12 months'),
  ('สาขาทดสอบปิดเอง เหนือ','$BN','เหนือทดสอบ$SUF','ทีมเหนือทดสอบ$SUF','FRANCHISE',now()-interval '12 months')" >/dev/null
for b in $BS $BN; do
  DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") select id,'W1','WASHER','Electrolux',now() from \"Branch\" where code='$b'" >/dev/null
done
NEWWO() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-000-0000\",\"machines\":[{\"code\":\"W1\",\"model\":\"Electrolux\",\"symptom\":\"เครื่องไม่ปั่น\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
W1=$(NEWWO $BS); W2=$(NEWWO $BN); W3=$(NEWWO $BS); W4=$(NEWWO $BS)
IDS="$W1 $W2 $W3 $W4"
OK='{"reason":"PHONE_GUIDE","note":"โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้"}'

echo "═══ ใครกดได้"
[ "$(CODE $T work-orders/$W1/recovered-close "$OK")" = 403 ] && pass "ช่างปิดแบบนี้ไม่ได้ (ช่างปิดจากหน้างาน)" || fail "ช่างปิดได้"
[ "$(CODE $S work-orders/$W2/recovered-close "$OK")" = 403 ] && pass "หัวหน้าภาคปิดใบนอกขอบเขตไม่ได้" || fail "ปิดใบนอกขอบเขตได้"
[ "$(CODE $PA work-orders/$W1/recovered-close "$OK")" = 403 ] && pass "Admin Spare Part ปิดไม่ได้ (ดูได้อย่างเดียว)" || fail "Admin Spare Part ปิดได้"
[ "$(DB "select string_agg(status,',' order by id) from \"WorkOrder\" where id in ($W1,$W2)")" = "NEW,NEW" ] \
  && pass "คนที่ไม่มีสิทธิ์กดแล้วใบงานไม่เปลี่ยน (ฐานข้อมูล)" || fail "ใบงานเปลี่ยน"

echo
echo "═══ ต้องกรอกครบ"
POST $S work-orders/$W1/recovered-close '{"note":"เครื่องกลับมาใช้ได้แล้ว"}' | grep -q "เลือกเหตุผล" && pass "ไม่เลือกเหตุผลไม่ได้" || fail "ไม่มีเหตุผลผ่าน"
POST $S work-orders/$W1/recovered-close '{"reason":"SELF","note":""}' | grep -q "ต้องอธิบาย" && pass "ไม่อธิบายไม่ได้" || fail "ไม่มีคำอธิบายผ่าน"
POST $S work-orders/$W1/recovered-close "$OK" | grep -q "ต้องแนบรูปหรือวิดีโอ" && pass "ไม่มีรูป/วิดีโอเครื่องที่ใช้งานได้ ปิดไม่ได้" || fail "ไม่มีรูปผ่าน"
DB "insert into \"WorkOrderAttachment\"(\"workOrderId\",kind,\"fileName\",\"mimeType\",\"sizeBytes\") values ($W1,'IMAGE','x.png','image/png',1)" >/dev/null
POST $S work-orders/$W1/recovered-close "$OK" | grep -q "ต้องแนบรูปหรือวิดีโอ" && pass "รูปหน้างานทั่วไปไม่นับแทนรูปเครื่องที่ใช้งานได้" || fail "รูปทั่วไปนับแทน"
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "NEW" ] && pass "กรอกไม่ครบ ใบงานยังไม่ปิด (ฐานข้อมูล)" || fail "ใบงานถูกปิดทั้งที่ไม่ครบ"

echo
echo "═══ หัวหน้าภาคปิดเอง"
P=$(PHOTO $S $W1)
[ "$(DB "select role from \"WorkOrderAttachment\" where id=${P:-0}")" = "RECOVERY" ] && pass "หัวหน้าภาคแนบรูปเครื่องที่ใช้งานได้ (role RECOVERY)" || fail "แนบรูป: $P"
R=$(POST $S work-orders/$W1/recovered-close "$OK")
echo "$R" | J 'd.status==="DONE"&&d.closeResultLabel.includes("หัวหน้าภาคปิด")?"ok":"bad"' | grep -q ok && pass "ปิดแล้วได้สถานะปิดงาน + ผลบอกว่าหัวหน้าภาคปิด" || fail "ผล: $(echo "$R" | head -c 200)"
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
[ "$(DB "select status||'|'||\"closeResult\"||'|'||\"closedById\"||'|'||(\"closedAt\" is not null)||'|'||\"closeNote\" from \"WorkOrder\" where id=$W1")" = "DONE|RECOVERED|$SID|true|แนะนำลูกค้าทางโทรศัพท์/ไลน์ แล้วใช้งานได้ — โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้" ] \
  && pass "ฐานข้อมูล: ปิดงาน · ผล RECOVERED · คนปิดคือหัวหน้าภาค · สรุปมีเหตุผล+คำอธิบาย" || fail "ฐานข้อมูล: $(DB "select status, \"closeResult\", \"closedById\" from \"WorkOrder\" where id=$W1")"
[ "$(DB "select action||'|'||\"userId\" from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")" = "RECOVERED_CLOSED|$SID" ] \
  && pass "ประวัติบันทึกว่าหัวหน้าภาคปิดงาน" || fail "ประวัติ: $(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")"
curl -s "localhost:4000/api/work-orders/$W1" -H "$(H $S)" | grep -q "หัวหน้าภาคปิดงาน — เครื่องใช้งานได้แล้ว" && pass "ประวัติในหน้าใบงานขึ้นว่าหัวหน้าภาคปิดงาน" || fail "ประวัติในหน้าใบงานไม่มีป้าย"
POST $S work-orders/$W1/recovered-close "$OK" | grep -q "ปิดไปแล้ว" && pass "ปิดซ้ำไม่ได้" || fail "ปิดซ้ำได้"

echo
echo "═══ ขั้นอื่น"
# รอช่างปิดงาน + เบิกอะไหล่ไปแล้ว — ยังปิดได้ (เตือนให้คืนคลังที่หน้าจอ)
PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='กระบี่' where id=$W3;
    insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",\"requisitionNo\") values ($W3,$PID,1,'WAITING',true,'RQ-RC$SUF')" >/dev/null
PHOTO $A $W3 >/dev/null
[ "$(CODE $A work-orders/$W3/recovered-close '{"reason":"OTHER_ORDER","note":"ซ่อมไปแล้วในใบงานอื่นของสาขาเดียวกัน"}')" = 200 ] \
  && [ "$(DB "select status||'|'||\"closeResult\" from \"WorkOrder\" where id=$W3")" = "DONE|RECOVERED" ] \
  && pass "แอดมินปิดได้ แม้อยู่ขั้นรอช่างปิดงานและเบิกอะไหล่ไปแล้ว (ฐานข้อมูล)" || fail "ปิดขั้นรอช่าง: $(DB "select status from \"WorkOrder\" where id=$W3")"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='USED'")" = "0" ] \
  && pass "อะไหล่ที่เบิกไม่ถูกบันทึกว่าใช้ไป" || fail "อะไหล่ถูกบันทึกว่าใช้"
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$W4" >/dev/null
PHOTO $S $W4 >/dev/null
POST $S work-orders/$W4/recovered-close "$OK" | grep -q "รอ Admin Spare Part ตรวจเคลม" && pass "ใบที่รอตรวจเคลมปิดแบบนี้ไม่ได้" || fail "ข้ามการตรวจเคลมได้"
[ "$(DB "select status from \"WorkOrder\" where id=$W4")" = "CLAIM_REVIEW" ] && pass "ใบรอตรวจเคลมไม่ถูกแตะ (ฐานข้อมูล)" || fail "ใบรอตรวจเคลมเปลี่ยน"

[ -z "$FAILED" ]
