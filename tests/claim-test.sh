#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่าตามฟอร์มใบเคลม — ปิดงานต้องมีหลักฐานครบ (รูป/วิดีโอ/ช่องกรอก/Troubleshooting Huebsch) ·
#        ไปรอ Admin Spare Part ตรวจ · แอดมินทั่วไปตรวจไม่ได้และไม่เห็นในกล่องงาน · ตีกลับต้องมีเหตุผล ·
#        ตีกลับแล้วกลับไปที่ช่าง · ปิดใหม่ได้ · อนุมัติแล้วปิดงาน · ใบเคลม PDF · ย้อนขั้นจากรอตรวจไม่ได้
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
UP() { curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=$1" "${@:2}"; }
SUF=$RANDOM
BC="DZCL$SUF"
ID=""
cleanup() {
  [ -n "$ID" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$ID" -H "$(H $A)" >/dev/null
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$BC');
      delete from \"Branch\" where code='$BC';
      delete from \"User\" where \"employeeCode\" like 'ZCL%$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCLP$SUF','แอดมินอะไหล่ทดสอบเคลม','PARTS_ADMIN','$HASH',false)" >/dev/null
PA=$(login ZCLP$SUF)
# สาขาแฟรนไชส์เปิดมาปีเดียว เครื่อง Huebsch — อยู่ในประกัน (ไม่ต้องเสนอราคา) และต้องทำ Troubleshooting
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบเคลม','$BC','ใต้','กระบี่','FRANCHISE',now()-interval '12 months')" >/dev/null
BID=$(DB "select id from \"Branch\" where code='$BC'")
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ($BID,'W1','WASHER','HB - Huebsch',now())" >/dev/null
PID=$(GET $A "spare-parts?search=SP-BOARD" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
PID2=$(GET $A "spare-parts?search=SP-BELT" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')

ID=$(POST $A work-orders "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"model\":\"Huebsch\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-CL$SUF\"}]}" >/dev/null
POST $S "work-orders/$ID/assign" '{"team":"กระบี่","scheduledAt":"2026-11-10"}' >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || { echo "FAIL เตรียมใบงานไม่ถึงขั้นเข้างาน"; exit 1; }
UP image/png -F "role=BEFORE" >/dev/null
UP image/png -F "role=AFTER" >/dev/null
UP image/png -F "role=NAMEPLATE" >/dev/null
UP image/png -F "role=REQUISITION" >/dev/null
ME=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
CLOSE() {  # $1 = claims json
  POST $A "work-orders/$ID/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนบอร์ด ทดสอบแล้วปกติ\",\"workerIds\":[$ME],\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"claims\":$1}"
}
TS=$(GET $A "work-orders/$ID" | J 'JSON.stringify(d.claimTroubleshooting)')
FULL="[{\"sparePartId\":$PID,\"brokenPartCode\":\"SP-BOARD-OLD\",\"symptom\":\"ประตูล็อกไม่ลง ขึ้น Error dL\",\"checkNote\":\"วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย\",\"troubleshooting\":$TS}]"

echo "═══ ปิดงานพร้อมเคลม — หลักฐานต้องครบ"
[ "$(echo "$TS" | J 'd.length')" -gt 0 ] && pass "เครื่อง Huebsch ได้รายการ Troubleshooting ($(echo "$TS" | J 'd.length') ข้อ)" || fail "ไม่มีรายการ Troubleshooting"
R=$(CLOSE "$FULL")
echo "$R" | grep -q "ยังขาดรูปอะไหล่เก่า" && [ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] \
  && pass "ยังไม่แนบหลักฐานเคลม ปิดไม่ได้ และใบงานยังไม่ถูกปิด" || fail "ไม่มีหลักฐานแต่ผ่าน: $(echo $R | head -c 150)"
UP image/png -F "role=CLAIM_PART" | grep -q "ระบุว่าเป็นของอะไหล่ชิ้นไหน" && pass "หลักฐานเคลมที่ไม่บอกอะไหล่ ถูกปฏิเสธ" || fail "รับหลักฐานที่ไม่ผูกอะไหล่"
for r in CLAIM_PART CLAIM_SYMPTOM; do UP image/png -F "role=$r" -F "sparePartId=$PID" >/dev/null; done
for r in CLAIM_ERROR_VIDEO CLAIM_CHECK_VIDEO; do UP video/mp4 -F "role=$r" -F "sparePartId=$PID" >/dev/null; done
[ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID and role like 'CLAIM_%'")" = "4" ] \
  && pass "หลักฐานเคลม 4 ไฟล์ผูกกับอะไหล่ในฐานข้อมูล" || fail "หลักฐานไม่ผูกกับอะไหล่"
R=$(CLOSE "[{\"sparePartId\":$PID,\"brokenPartCode\":\"SP-BOARD-OLD\",\"symptom\":\"x\",\"checkNote\":\"y\",\"troubleshooting\":[]}]")
echo "$R" | grep -q "Troubleshooting ครบ (0/" && pass "เครื่อง Huebsch ไม่ทำ Troubleshooting ปิดไม่ได้" || fail "Troubleshooting: $(echo $R | head -c 150)"
R=$(CLOSE "[{\"sparePartId\":$PID,\"brokenPartCode\":\" \",\"symptom\":\"x\",\"checkNote\":\"y\",\"troubleshooting\":$TS}]")
echo "$R" | grep -q "รหัสอะไหล่ตัวที่เสีย" && pass "ไม่กรอกรหัสอะไหล่ตัวที่เสีย ปิดไม่ได้" || fail "รหัสตัวที่เสียว่างผ่าน: $(echo $R | head -c 150)"
R=$(CLOSE "[{\"sparePartId\":$PID,\"brokenPartCode\":\"SP-BOARD-OLD\",\"symptom\":\"\",\"checkNote\":\"y\",\"troubleshooting\":$TS}]")
echo "$R" | grep -q "อาการ/สาเหตุ" && pass "ไม่กรอกอาการ/สาเหตุ ปิดไม่ได้" || fail "อาการว่างผ่าน: $(echo $R | head -c 150)"
R=$(CLOSE "[{\"sparePartId\":$PID2,\"brokenPartCode\":\"X\",\"symptom\":\"x\",\"checkNote\":\"y\",\"troubleshooting\":$TS}]")
echo "$R" | grep -q "เฉพาะอะไหล่ที่ใส่ไว้" && pass "เคลมอะไหล่ที่ไม่ได้ใช้ไม่ได้" || fail "เคลมของที่ไม่ได้ใช้ได้: $(echo $R | head -c 150)"
R=$(CLOSE "$FULL")
echo "$R" | J 'd.status' | grep -q "^CLAIM_REVIEW$" && pass "หลักฐานครบ → รอตรวจเคลม (ยังไม่ปิด)" || fail "ไม่ไปรอตรวจ: $(echo $R | head -c 200)"
ROW=$(DB "select status||'|'||\"partCode\"||'|'||\"brokenPartCode\"||'|'||coalesce(brand,'')||'|'||array_length(troubleshooting,1)||'|'||\"branchCode\" from \"PartClaim\" where \"workOrderId\"=$ID")
[ "$ROW" = "PENDING|SP-BOARD|SP-BOARD-OLD|HB - Huebsch|$(echo "$TS" | J 'd.length')|$BC" ] && pass "ฐานข้อมูลมีใบเคลมรอตรวจ พร้อมหัวใบเคลมจากระบบ และรหัสตัวที่เสียที่ช่างกรอก" || fail "แถวเคลม: $ROW"

echo
echo "═══ ใครตรวจได้"
GET $A "work-orders?status=INBOX" | J 'd.rows.some(r=>r.id==='$ID')?"in":"out"' | grep -q out && pass "แอดมินทั่วไปไม่เห็นในกล่องงาน" || fail "แอดมินทั่วไปเห็นในกล่องงาน"
GET $PA "work-orders?status=INBOX" | J 'd.rows.some(r=>r.id==='$ID')?"in":"out"' | grep -q in && pass "Admin Spare Part เห็นในกล่องงาน" || fail "Admin Spare Part ไม่เห็นในกล่องงาน"
POST $A "work-orders/$ID/claim-review" '{"approve":true}' | grep -q "เฉพาะ Admin Spare Part" && pass "แอดมินทั่วไปอนุมัติเคลมไม่ได้" || fail "แอดมินทั่วไปอนุมัติได้"
POST $A "work-orders/$ID/rollback" '{"toStage":"IN_PROGRESS","reason":"ทดสอบ"}' | grep -q "ตีกลับ" && pass "ย้อนขั้นจากรอตรวจเคลมไม่ได้ (ต้องตีกลับ)" || fail "ย้อนขั้นได้"

echo
echo "═══ ตีกลับ"
POST $PA "work-orders/$ID/claim-review" '{"approve":false}' | grep -q "ต้องบอกเหตุผล" && pass "ตีกลับโดยไม่บอกเหตุผลไม่ได้" || fail "ตีกลับได้โดยไม่มีเหตุผล"
R=$(POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่"}')
[ "$(DB "select status||'|'||coalesce(\"closedAt\"::text,'null') from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS|null" ] \
  && pass "ตีกลับแล้วใบงานกลับไปรอช่าง และล้างเวลาปิด" || fail "สถานะหลังตีกลับ: $(DB "select status from \"WorkOrder\" where id=$ID")"
[ "$(DB "select \"closeResult\"||'|'||\"closeNote\"||'|'||(\"closedById\"=$ME)||'|'||(select count(*) from \"WorkOrderWorker\" where \"workOrderId\"=$ID) from \"WorkOrder\" where id=$ID")" = "FIXED|เปลี่ยนบอร์ด ทดสอบแล้วปกติ|true|1" ] \
  && pass "ตีกลับแล้วผล สรุปงาน คนปิด และผู้เข้าปฏิบัติงานรอบเดิมยังอยู่ (ฐานข้อมูล)" || fail "ข้อมูลปิดงานเดิมหาย"
[ "$(DB "select status||'|'||\"rejectReason\" from \"PartClaim\" where \"workOrderId\"=$ID")" = "REJECTED|วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่" ] \
  && pass "ใบเคลมบันทึกว่าถูกตีกลับพร้อมเหตุผล" || fail "แถวเคลมหลังตีกลับ"
echo "$R" | J 'd.claims[0].rejectReason' | grep -q "ถ่ายใหม่" && pass "ใบงานส่งเหตุผลตีกลับให้หน้าจอช่าง" || fail "หน้าจอไม่เห็นเหตุผล"

echo
echo "═══ ช่างปิดใหม่ → อนุมัติ"
R=$(CLOSE "$FULL")
echo "$R" | J 'd.status' | grep -q "^CLAIM_REVIEW$" && pass "ปิดใหม่ได้ (หลักฐานเดิมยังนับ)" || fail "ปิดใหม่ไม่ได้: $(echo $R | head -c 200)"
[ "$(DB "select string_agg(status,',' order by id) from \"PartClaim\" where \"workOrderId\"=$ID")" = "REJECTED,PENDING" ] \
  && pass "ใบเคลมรอบที่ถูกตีกลับเก็บไว้เป็นประวัติ" || fail "ประวัติเคลม: $(DB "select string_agg(status,',') from \"PartClaim\" where \"workOrderId\"=$ID")"
CID=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")
curl -s "localhost:4000/api/work-orders/$ID/claims/$CID/pdf" -H "$(H $A)" -o /tmp/claim-$SUF.pdf -w "%{content_type}" | grep -q "application/pdf" \
  && head -c 4 /tmp/claim-$SUF.pdf | grep -q "%PDF" && pass "เปิดใบเคลม PDF ได้" || fail "PDF"
rm -f /tmp/claim-$SUF.pdf
# ลิงก์สำหรับมือถือ — เปิดได้โดยไม่ต้องแนบ header (เบราว์เซอร์ของเครื่องแนบเองไม่ได้)
LINK=$(POST $A "work-orders/$ID/claims/$CID/pdf-link" '{}' | J 'd.path')
curl -s "localhost:4000$LINK" | head -c 4 | grep -q "%PDF" && pass "ลิงก์ใบเคลมเปิดได้โดยไม่ต้องล็อกอิน" || fail "ลิงก์ใบเคลม: $LINK"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000${LINK%%token=*}token=wrong")" = "404" ] && pass "ลิงก์ใบเคลม token ผิดเปิดไม่ได้" || fail "token ผิดเปิดได้"
POST $PA "work-orders/$ID/claim-review" '{"approve":true}' >/dev/null
[ "$(DB "select w.status||'|'||c.status from \"WorkOrder\" w join \"PartClaim\" c on c.\"workOrderId\"=w.id and c.id=$CID where w.id=$ID")" = "DONE|APPROVED" ] \
  && pass "อนุมัติแล้วใบงานปิด และใบเคลมเป็นอนุมัติ" || fail "หลังอนุมัติ: $(DB "select status from \"WorkOrder\" where id=$ID")"
[ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action in ('CLAIM_SUBMITTED','CLAIM_REJECTED','CLAIM_APPROVED')")" = "4" ] \
  && pass "ประวัติบันทึก ส่งเคลม ×2 · ตีกลับ · อนุมัติ" || fail "ประวัติเคลม"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
