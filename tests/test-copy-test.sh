#!/bin/bash
# ทดสอบ: คัดลอกเป็นใบทดสอบ — ใบใหม่ขั้น/ทีม/อะไหล่เดียวกัน ไม่มีไฟล์และไม่ผูกเคส · ใบต้นทางไม่ถูกแตะ ·
#        แอดมินเท่านั้น (หัวหน้าภาค/Admin Spare Part ไม่ได้) · ใบที่ปิดแล้วคัดลอกได้ เริ่มที่รอช่างเข้างาน · ลบใบทดสอบแล้วใบจริงยังอยู่
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
BC="DZTC$SUF"
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$BC');
      delete from \"Branch\" where code='$BC';
      delete from \"User\" where \"employeeCode\"='ZTCP$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZTCP$SUF','แอดมินอะไหล่ทดสอบคัดลอก','PARTS_ADMIN','$HASH',false)" >/dev/null
PA=$(login ZTCP$SUF)
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบคัดลอก','$BC','ใต้','กระบี่','FRANCHISE',now()-interval '12 months')" >/dev/null
BID=$(DB "select id from \"Branch\" where code='$BC'")
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ($BID,'W1','WASHER','HB - Huebsch',now())" >/dev/null
PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')

ID=$(POST $A work-orders "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"URGENT\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"model\":\"Huebsch\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
IDS="$ID"
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":2}]}" >/dev/null
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-TC$SUF\"}]}" >/dev/null
POST $S "work-orders/$ID/assign" '{"team":"กระบี่","scheduledAt":"2026-11-10"}' >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || { echo "FAIL เตรียมใบงานไม่ถึงขั้นเข้างาน"; exit 1; }
BEFORE=$(DB "select status||'|'||\"updatedAt\" from \"WorkOrder\" where id=$ID")

echo "═══ ใครคัดลอกได้"
POST $S "work-orders/$ID/test-copy" '{}' | grep -q "สำหรับแอดมิน" && pass "หัวหน้าภาคคัดลอกไม่ได้" || fail "หัวหน้าภาคคัดลอกได้"
POST $PA "work-orders/$ID/test-copy" '{}' | grep -q "ดูได้อย่างเดียว" && pass "Admin Spare Part คัดลอกไม่ได้" || fail "Admin Spare Part คัดลอกได้"
[ "$(DB "select count(*) from \"WorkOrder\" where \"testOfId\"=$ID")" = "0" ] && pass "ฐานข้อมูลไม่มีใบทดสอบเกิดขึ้น" || fail "มีใบทดสอบหลุดออกมา"

echo
echo "═══ คัดลอกใบที่กำลังเข้างาน"
R=$(POST $A "work-orders/$ID/test-copy" '{}')
C=$(echo "$R" | J 'd.id'); IDS="$C $IDS"
echo "$R" | J 'd.code' | grep -qE '^WO-[0-9]{5}$' && pass "ได้ใบใหม่ $(echo "$R" | J 'd.code')" || fail "คัดลอก: $R"
ROW=$(DB "select w.\"isTest\"||'|'||w.status||'|'||w.\"assignedTeam\"||'|'||w.priority||'|'||(w.\"branchId\"=o.\"branchId\")||'|'||(w.\"machineId\"=o.\"machineId\")||'|'||coalesce(w.\"outageId\"::text,'-')||'|'||left(w.title,7)||'|'||w.\"contactPhone\" from \"WorkOrder\" w, \"WorkOrder\" o where w.id=$C and o.id=$ID")
[ "$ROW" = "true|IN_PROGRESS|กระบี่|URGENT|true|true|-|[ทดสอบ]|081-234-5678" ] && pass "ใบทดสอบ: ขั้น ทีม ความด่วน สาขา เครื่อง ผู้ติดต่อเดียวกัน ไม่ผูกเคส มีป้าย [ทดสอบ] (ฐานข้อมูล)" || fail "ใบทดสอบ: $ROW"
[ "$(DB "select kind||'|'||quantity||'|'||\"inStock\"||'|'||\"requisitionNo\" from \"WorkOrderPart\" where \"workOrderId\"=$C")" = "WAITING|2|true|RQ-TC$SUF" ] \
  && pass "อะไหล่และผลเช็คคลังติดมาด้วย" || fail "อะไหล่: $(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$C")"
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$C")" = "0" ] && pass "ไม่คัดลอกรูป/ไฟล์" || fail "คัดลอกไฟล์มาด้วย"
[ "$(DB "select string_agg(action,',') from \"WorkOrderLog\" where \"workOrderId\"=$C")" = "TEST_COPY" ] && pass "ประวัติมีแค่บรรทัดคัดลอก" || fail "ประวัติ: $(DB "select string_agg(action,',') from \"WorkOrderLog\" where \"workOrderId\"=$C")"
[ "$(DB "select status||'|'||\"updatedAt\" from \"WorkOrder\" where id=$ID")" = "$BEFORE" ] && pass "ใบต้นทางไม่ถูกแตะ (ฐานข้อมูล)" || fail "ใบต้นทางเปลี่ยน"
curl -s "localhost:4000/api/work-orders/$C" -H "$(H $A)" | J 'd.isTest' | grep -q true && pass "หน้าจอรู้ว่าเป็นใบทดสอบ" || fail "isTest ไม่ส่งมา"
T=$(login T001)
DB "update \"User\" set team='กระบี่' where \"employeeCode\"='T001'" >/dev/null
curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $T)" | J 'd.rows.some(r=>r.id==='$C')?"in":"out"' | grep -q in && pass "ช่างในทีมเห็นใบทดสอบในกล่องงาน (ปิดงานทดสอบได้)" || fail "ช่างไม่เห็นใบทดสอบ"
DB "update \"User\" set team='กรุงเทพ' where \"employeeCode\"='T001'" >/dev/null

echo
echo "═══ คัดลอกใบที่ปิดแล้ว"
DB "update \"WorkOrder\" set status='DONE', \"closedAt\"=now() where id=$ID" >/dev/null
C2=$(POST $A "work-orders/$ID/test-copy" '{}' | J 'd.id'); IDS="$C2 $IDS"
[ "$(DB "select status||'|'||coalesce(\"closedAt\"::text,'null') from \"WorkOrder\" where id=$C2")" = "IN_PROGRESS|null" ] \
  && pass "ใบปิดแล้วคัดลอกได้ ใบทดสอบเริ่มที่รอช่างเข้างาน ยังไม่ปิด" || fail "คัดลอกใบปิดแล้ว: $(DB "select status from \"WorkOrder\" where id=$C2")"

echo
echo "═══ ลบใบทดสอบ"
curl -s -X DELETE "localhost:4000/api/work-orders/$C" -H "$(H $A)" >/dev/null
[ "$(DB "select count(*) from \"WorkOrder\" where id=$C")|$(DB "select count(*) from \"WorkOrder\" where id=$ID")" = "0|1" ] \
  && pass "ลบใบทดสอบแล้ว ใบจริงยังอยู่" || fail "ลบใบทดสอบ"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
