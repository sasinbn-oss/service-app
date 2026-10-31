#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่าตามฟอร์มใบเคลม — ปิดงานต้องมีหลักฐานครบ (รูป/วิดีโอ/ช่องกรอก/Troubleshooting Huebsch) ·
#        ไปรอ Admin Spare Part ตรวจ · แอดมินทั่วไปตรวจไม่ได้และไม่เห็นในกล่องงาน · ตีกลับต้องมีเหตุผล ·
#        ตีกลับแล้วกลับไปที่ช่าง · ปิดใหม่ได้ · อนุมัติแล้วปิดงาน · ใบเคลม PDF · ย้อนขั้นจากรอตรวจไม่ได้
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
UP() { curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=$1" "${@:2}"; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
VISIT=$(day 12)
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

ID=$(POST $A work-orders "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"model\":\"Huebsch\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
# อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่อง (HB - Huebsch) จึงเลือกหลังเปิดใบ — ใบเคลมเก็บรหัสของตัวที่ใช้จริง
PID=$(fx_part $ID BOARD); PID2=$(fx_part $ID BELT); PCODE=$(fx_part_code $ID BOARD)
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}" >/dev/null
POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CL$SUF\"}]}" >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || { echo "FAIL เตรียมใบงานไม่ถึงขั้นเข้างาน"; exit 1; }
UP image/png -F "role=BEFORE" >/dev/null
UP image/png -F "role=AFTER" >/dev/null
UP image/png -F "role=NAMEPLATE" >/dev/null
UP image/png -F "role=REQUISITION" >/dev/null
ME=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
# ข้อมูลป้ายรุ่น + เช็คตามคู่มือ (Huebsch = Alliance) — ค่าตั้งต้นครบ · ข้อทดสอบที่ต้องการขาดส่ง $2/$3 เอง
PLATE='{"fields":[{"key":"model","label":"รุ่น","value":"HL055L","source":"SCAN","crop":"data:image/jpeg;base64,/9j/AAAA"},{"key":"serial","label":"Serial","value":"2402600330","source":"HAND"}],"verified":true}'
CHECK='{"errorCode":"E dL / E dL1 / E dL2","checked":["Solenoid ไม่ฝืด","ข้อที่ไม่มีในคู่มือ"]}'
CLOSE() {  # $1 = claims json · $2 = ข้อมูลป้าย · $3 = เช็คตามคู่มือ
  POST $A "work-orders/$ID/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนบอร์ด ทดสอบแล้วปกติ\",\"workerIds\":[$ME],\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"claims\":$1,\"claimNameplate\":${2-$PLATE},\"claimCheck\":${3-$CHECK}}"
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
echo "═══ ข้อมูลป้ายรุ่น + เช็คตามคู่มือ Error in Field (Huebsch)"
G=$(GET $A "work-orders/$ID")
[ "$(echo "$G" | J 'd.claimGuide.plate.family+"|"+d.claimGuide.plate.lines.map(l=>l.id).join(",")+"|"+(d.claimGuide.errors.length>10)+"|"+(d.claimGuide.installChecks===undefined)')" = "ALLIANCE|model,serial|true|true" ] \
  && pass "ใบงานส่งแบบป้าย Alliance (รุ่น · Serial) + Error ตามคู่มือ · ไม่มีเช็คลิสต์ติดตั้งฐานเครื่องแล้ว" || fail "claimGuide: $(echo "$G" | J 'JSON.stringify(d.claimGuide.plate)' | head -c 150)"
# หน้าปิดงานเตือนก่อนกดว่าไฟล์จะเกินเพดาน — ต้องได้จำนวนไฟล์ทั้งใบกับเพดานจากใบงาน
[ "$(echo "$G" | J 'd.attachmentLimit+"|"+d.attachmentCount')" = "60|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID")" ] \
  && pass "ใบงานบอกเพดานไฟล์ 60 + จำนวนไฟล์ทั้งใบตรงฐานข้อมูล" || fail "attachmentLimit/Count: $(echo "$G" | J 'd.attachmentLimit+"|"+d.attachmentCount')"
R=$(CLOSE "$FULL" '{"fields":[{"key":"serial","label":"Serial","value":"","source":"HAND"}]}')
echo "$R" | grep -q "ข้อมูลป้ายรุ่นอย่างน้อยหนึ่งช่อง" && [ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] \
  && pass "ไม่มีข้อมูลป้ายรุ่น ปิดไม่ได้ ใบงานไม่เปลี่ยน" || fail "ไม่มีข้อมูลป้ายผ่าน: $(echo $R | head -c 150)"
R=$(CLOSE "$FULL" "${PLATE/\"verified\":true/\"verified\":false}")
echo "$R" | grep -q "ตรวจค่าที่ระบบอ่านกับรูปป้ายรุ่น" && pass "ค่าที่ระบบอ่านจากรูป ไม่ติ๊กตรวจกับรูป ปิดไม่ได้" || fail "ไม่ตรวจกับรูปผ่าน: $(echo $R | head -c 150)"
R=$(CLOSE "$FULL" "$PLATE" 'null')
echo "$R" | grep -q "เลือก Error" && pass "เครื่อง Alliance ไม่เลือก Error ปิดไม่ได้" || fail "ไม่เลือก Error ผ่าน: $(echo $R | head -c 150)"
R=$(CLOSE "$FULL" "$PLATE" '{"errorCode":"E XX"}')
echo "$R" | grep -q "เลือก Error" && pass "Error ที่ไม่มีในคู่มือ ไม่รับ" || fail "Error มั่วผ่าน"
R=$(CLOSE "$FULL")
echo "$R" | J 'd.status' | grep -q "^CLAIM_REVIEW$" && pass "หลักฐานครบ → รอตรวจเคลม (ยังไม่ปิด)" || fail "ไม่ไปรอตรวจ: $(echo $R | head -c 200)"
ROW=$(DB "select status||'|'||\"partCode\"||'|'||\"brokenPartCode\"||'|'||coalesce(brand,'')||'|'||array_length(troubleshooting,1)||'|'||\"branchCode\" from \"PartClaim\" where \"workOrderId\"=$ID")
[ "$ROW" = "PENDING|$PCODE|SP-BOARD-OLD|HB - Huebsch|$(echo "$TS" | J 'd.length')|$BC" ] && pass "ฐานข้อมูลมีใบเคลมรอตรวจ พร้อมหัวใบเคลมจากระบบ และรหัสตัวที่เสียที่ช่างกรอก" || fail "แถวเคลม: $ROW"
NP=$(DB "select nameplate->>'family'||'|'||(nameplate->'fields'->1->>'value')||'|'||(nameplate->'fields'->1->>'source')||'|'||(nameplate->'fields'->0->>'crop' like 'data:image/%')||'|'||(\"fieldCheck\"->>'errorCode')||'|'||(\"fieldCheck\"->'checked')::text||'|'||(\"fieldCheck\" ? 'install')::text from \"PartClaim\" where \"workOrderId\"=$ID")
[ "$NP" = 'ALLIANCE|2402600330|HAND|true|E dL / E dL1 / E dL2|["Solenoid ไม่ฝืด"]|false' ] \
  && pass "ฐานข้อมูล: ป้ายรุ่น (Serial พิมพ์เอง · ภาพบรรทัด) + Error + ข้อที่ติ๊ก (ตัดข้อนอกคู่มือ) · ไม่มีคำตอบเรื่องติดตั้ง" || fail "ข้อมูลป้าย/เช็ค: $NP"
PH=$(DB "select ((c.nameplate->>'photoId')::int = (select max(id) from \"WorkOrderAttachment\" a where a.\"workOrderId\"=$ID and a.role='NAMEPLATE'))::text||'|'||(c.nameplate->>'verified') from \"PartClaim\" c where c.\"workOrderId\"=$ID")
[ "$PH" = "true|true" ] && pass "ใบเคลมผูกรูปป้ายรุ่นเต็มของรอบนี้ + บันทึกว่าช่างตรวจกับรูปแล้ว" || fail "รูปป้าย/ตรวจ: $PH"

echo
echo "═══ ใครตรวจได้"
GET $A "work-orders?status=INBOX" | J 'd.rows.some(r=>r.id==='$ID')?"in":"out"' | grep -q out && pass "แอดมินทั่วไปไม่เห็นในกล่องงาน" || fail "แอดมินทั่วไปเห็นในกล่องงาน"
GET $PA "work-orders?status=INBOX" | J 'd.rows.some(r=>r.id==='$ID')?"in":"out"' | grep -q in && pass "Admin Spare Part เห็นในกล่องงาน" || fail "Admin Spare Part ไม่เห็นในกล่องงาน"
# รายการใบงานติดสถานะเคลมรอบล่าสุดมาด้วย — ป้าย "แจ้งเคลม" และตัวกรอง "ใบงานเคลม" ในรายการ (ต.ค. 69)
GET $A "work-orders?status=ALL" | J 'd.rows.find(r=>r.id==='$ID')?.claimStatus' | grep -q "^PENDING$" && pass "รายการใบงานบอกว่าแจ้งเคลม (รอตรวจ)" || fail "รายการไม่บอกสถานะเคลม"
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
GET $A "work-orders?status=ALL" | J 'd.rows.find(r=>r.id==='$ID')?.claimStatus' | grep -q "^REJECTED$" && pass "รายการใบงานเปลี่ยนเป็นเคลมถูกตีกลับ (รอบล่าสุด)" || fail "รายการยังไม่เปลี่ยนสถานะเคลม"
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
# ข้อมูลป้ายลงเอกสารที่ส่งผู้ขาย แต่ผลเช็คการติดตั้งไม่ลง (Admin Spare Part เห็นในระบบเท่านั้น) — ต้องมี pdftotext
if command -v pdftotext >/dev/null; then
  TXT=$(pdftotext /tmp/claim-$SUF.pdf - 2>/dev/null | tr -d '\n')
  echo "$TXT" | grep -q "2402600330" && echo "$TXT" | grep -q "พิมพ์เอง" && ! echo "$TXT" | grep -q "แหวนสปริง" \
    && pass "PDF มี Serial จากป้าย (ติด 'พิมพ์เอง') ไม่มีผลเช็คการติดตั้ง" || fail "ข้อมูลป้ายใน PDF: $(echo "$TXT" | grep -o '.\{20\}2402600330.\{20\}')"
fi
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
