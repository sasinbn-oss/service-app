#!/bin/bash
# ทดสอบ: หัวหน้าภาคปิดใบงานเอง ไม่ต้องส่งช่าง (รอบสอง ต.ค. 69) — หัวหน้าภาค/แอดมินเท่านั้น (ช่าง ·
#        หัวหน้าภาคนอกขอบเขต · Admin Spare Part ไม่ได้) · บังคับเหตุผล + รายละเอียด ≥ 10 ตัวอักษร ไม่บังคับรูป ·
#        ปิดได้ทุกขั้นที่ยังไม่ปิด (รวมรอช่างปิดงาน · เบิกอะไหล่แล้วก็ได้) แต่ไม่ใช่รอตรวจเคลม · ผล SUPERVISOR_CLOSED + ประวัติ
#
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
BS="DZSS$SUF"; BN="DZSN$SUF"
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code in ('$BS','$BN'));
      delete from \"Branch\" where code in ('$BS','$BN');
      delete from \"User\" where \"employeeCode\"='ZSCP$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZSCP$SUF','แอดมินอะไหล่ทดสอบปิด','PARTS_ADMIN','$HASH',false)" >/dev/null
PA=$(login ZSCP$SUF)
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
OK='{"reason":"PHONE","note":"โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้"}'

echo "═══ ใครกดได้"
[ "$(CODE $T work-orders/$W1/supervisor-close "$OK")" = 403 ] && pass "ช่างปิดแบบนี้ไม่ได้ (ช่างปิดจากหน้างาน)" || fail "ช่างปิดได้"
[ "$(CODE $S work-orders/$W2/supervisor-close "$OK")" = 403 ] && pass "หัวหน้าภาคปิดใบนอกขอบเขตไม่ได้" || fail "ปิดใบนอกขอบเขตได้"
[ "$(CODE $PA work-orders/$W1/supervisor-close "$OK")" = 403 ] && pass "Admin Spare Part ปิดไม่ได้ (ดูได้อย่างเดียว)" || fail "Admin Spare Part ปิดได้"
[ "$(DB "select string_agg(status,',' order by id) from \"WorkOrder\" where id in ($W1,$W2)")" = "NEW,NEW" ] \
  && pass "คนที่ไม่มีสิทธิ์กดแล้วใบงานไม่เปลี่ยน (ฐานข้อมูล)" || fail "ใบงานเปลี่ยน"

echo
echo "═══ ต้องกรอกครบ"
POST $S work-orders/$W1/supervisor-close '{"note":"เครื่องกลับมาใช้ได้แล้วตั้งแต่เมื่อวาน"}' | grep -q "เลือกเหตุผล" && pass "ไม่เลือกเหตุผลไม่ได้" || fail "ไม่มีเหตุผลผ่าน"
POST $S work-orders/$W1/supervisor-close '{"reason":"NOPE","note":"เครื่องกลับมาใช้ได้แล้วตั้งแต่เมื่อวาน"}' | grep -q "เลือกเหตุผล" && pass "เหตุผลนอกรายการไม่ได้" || fail "เหตุผลนอกรายการผ่าน"
POST $S work-orders/$W1/supervisor-close '{"reason":"SELF","note":""}' | grep -q "อย่างน้อย 10 ตัวอักษร" && pass "ไม่พิมพ์รายละเอียดไม่ได้" || fail "ไม่มีรายละเอียดผ่าน"
POST $S work-orders/$W1/supervisor-close '{"reason":"SELF","note":"  ปกติแล้ว  "}' | grep -q "อย่างน้อย 10 ตัวอักษร" && pass "รายละเอียดสั้นกว่า 10 ตัวอักษร (ไม่นับช่องว่างหัวท้าย) ไม่ได้" || fail "รายละเอียดสั้นผ่าน"
[ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "NEW" ] && pass "กรอกไม่ครบ ใบงานยังไม่ปิด (ฐานข้อมูล)" || fail "ใบงานถูกปิดทั้งที่ไม่ครบ"

echo
echo "═══ หัวหน้าภาคปิดเอง (ไม่มีรูปก็ปิดได้)"
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$W1")" = "0" ] && pass "ใบนี้ไม่มีไฟล์แนบเลย" || fail "มีไฟล์แนบ"
R=$(POST $S work-orders/$W1/supervisor-close "$OK")
echo "$R" | J 'd.status==="DONE"&&d.closeResultLabel==="หัวหน้าภาคปิด · ไม่เข้าหน้างาน"?"ok":"bad"' | grep -q ok && pass "ปิดแล้วได้สถานะปิดงาน + ผล หัวหน้าภาคปิด · ไม่เข้าหน้างาน" || fail "ผล: $(echo "$R" | head -c 200)"
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
[ "$(DB "select status||'|'||\"closeResult\"||'|'||\"closedById\"||'|'||(\"closedAt\" is not null)||'|'||\"closeNote\" from \"WorkOrder\" where id=$W1")" = "DONE|SUPERVISOR_CLOSED|$SID|true|แก้ไขทางโทรศัพท์ / แนะนำร้านแล้ว — โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้" ] \
  && pass "ฐานข้อมูล: ปิดงาน · ผล SUPERVISOR_CLOSED · คนปิดคือหัวหน้าภาค · สรุปมีเหตุผล+รายละเอียด" || fail "ฐานข้อมูล: $(DB "select status, \"closeResult\", \"closedById\", \"closeNote\" from \"WorkOrder\" where id=$W1")"
[ "$(DB "select action||'|'||\"userId\"||'|'||status from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")" = "SUPERVISOR_CLOSED|$SID|DONE" ] \
  && pass "ประวัติบันทึกว่าหัวหน้าภาคปิดใบงาน" || fail "ประวัติ: $(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$W1 order by id desc limit 1")"
curl -s "localhost:4000/api/work-orders/$W1" -H "$(H $S)" | grep -q "หัวหน้าภาคปิดใบงาน" && pass "ประวัติในหน้าใบงานขึ้นว่าหัวหน้าภาคปิดใบงาน" || fail "ประวัติในหน้าใบงานไม่มีป้าย"
curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $A)" | J "const r=d.rows.find(x=>x.id===$W1); r&&r.closeResult==='SUPERVISOR_CLOSED'?'ok':'bad'" | grep -q ok \
  && pass "รายการใบงานส่งรหัสผล SUPERVISOR_CLOSED (แยกจากใบที่ช่างปิด)" || fail "รายการไม่มีรหัสผล"
POST $S work-orders/$W1/supervisor-close "$OK" | grep -q "ปิดไปแล้ว" && pass "ปิดซ้ำไม่ได้" || fail "ปิดซ้ำได้"
curl -s "localhost:4000/api/work-orders/options" -H "$(H $T)" | grep -q "SUPERVISOR_CLOSED" && fail "ช่างเลือกผลนี้ตอนปิดหน้างานได้" || pass "ผลนี้ไม่อยู่ในตัวเลือกปิดงานของช่าง"

echo
echo "═══ ขั้นอื่น"
# รอช่างปิดงาน + เบิกอะไหล่ไปแล้ว — ยังปิดได้ (เตือนให้คืนคลังที่หน้าจอ)
PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='กระบี่' where id=$W3;
    insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",\"requisitionNo\") values ($W3,$PID,1,'WAITING',true,'RQ-SC$SUF')" >/dev/null
[ "$(CODE $A work-orders/$W3/supervisor-close '{"reason":"OTHER_ORDER","note":"ซ่อมรวมไปกับใบงานอื่นของสาขาเดียวกัน"}')" = 200 ] \
  && [ "$(DB "select status||'|'||\"closeResult\" from \"WorkOrder\" where id=$W3")" = "DONE|SUPERVISOR_CLOSED" ] \
  && pass "แอดมินปิดได้ แม้อยู่ขั้นรอช่างปิดงานและเบิกอะไหล่ไปแล้ว (ฐานข้อมูล)" || fail "ปิดขั้นรอช่าง: $(DB "select status from \"WorkOrder\" where id=$W3")"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W3 and kind='USED'")" = "0" ] \
  && pass "อะไหล่ที่เบิกไม่ถูกบันทึกว่าใช้ไป" || fail "อะไหล่ถูกบันทึกว่าใช้"
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$W4" >/dev/null
POST $S work-orders/$W4/supervisor-close "$OK" | grep -q "รอ Admin Spare Part ตรวจเคลม" && pass "ใบที่รอตรวจเคลมปิดแบบนี้ไม่ได้" || fail "ข้ามการตรวจเคลมได้"
[ "$(DB "select status from \"WorkOrder\" where id=$W4")" = "CLAIM_REVIEW" ] && pass "ใบรอตรวจเคลมไม่ถูกแตะ (ฐานข้อมูล)" || fail "ใบรอตรวจเคลมเปลี่ยน"

[ -z "$FAILED" ]
