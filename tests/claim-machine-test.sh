#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 5 — ฟอร์มปิดงานทีละขั้น ฝั่งเซิร์ฟเวอร์ (ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน)
#   · หลักฐานของเครื่อง (วิดีโอ Error · รูปอาการ) แนบโดยไม่บอกชิ้นได้ = ถ่ายในกล่อง "ถ่ายก่อนซ่อม" (sparePartId ว่าง) ·
#     รูปอะไหล่เก่ายังต้องบอกชิ้น · ทีม Area แนบไม่ได้ · ไฟล์ถ่ายก่อนซ่อมใช้ร่วมทุกชิ้นและนับเป็นรูปก่อนซ่อม ·
#     ไฟล์ชนิดเดียวกันที่ผูกชิ้น (ข้อ ⑥ ตอนปิดงาน) ไม่นับเป็นรูปก่อนซ่อม · ใบเคลม PDF ทุกชิ้นลงไฟล์ของเครื่อง ·
#     ไฟล์ของเครื่องที่ส่งไปแล้วช่างลบไม่ได้ · ตีกลับวิดีโอ Error แก้ด้วยวิดีโอใหม่ที่ไม่ผูกชิ้นได้
#   · ป้ายรุ่นยืนยันทีละช่อง: รุ่น/Serial ต้อง confirmed แม้พิมพ์เอง · ช่องที่ระบบไม่มั่นใจต้องยืนยัน ·
#     แอปเก่าที่ส่งแค่ verified = 400 ให้โหลดหน้าใหม่ · เก็บ confirmed/edited/read และภาพตัดของค่าที่แก้
#   · ข้อเช็คตาม Error ต่อชิ้น (claims[].errorChecked) · แอปเก่าส่งชุดเดียว (claimCheck.checked) ใช้ให้ทุกชิ้น
#   · สาขาในประกัน: อะไหล่ที่ใช้แต่ไม่ส่งเคลมต้องมีเหตุผล (claimSkips) · "อื่น ๆ" ต้องพิมพ์ · ประวัติ CLAIM_SKIPPED (note + meta) ·
#     รายละเอียดใบงาน claimSkips · งานของฉัน claim.skipped · สาขาหมดประกันไม่ถาม ·
#     หัวหน้าภาคปิดใบงาน / ปิดงานย้อนหลัง ลง CLAIM_SKIPPED ก่อนประวัติปิดงาน (meta.by)
#   · claimGuide ของเครื่องซักไม่มี Error ของเครื่องอบ · "ไม่มี Error ขึ้น" อยู่บนสุด · คำอ่านไทยของข้อเช็ค ·
#     claimApprovedModel จากเคลมที่อนุมัติของเครื่องเดียวกัน (เครื่องอื่นในสาขาไม่ได้) · GET …/attachments/:aid/file ส่งรูปป้ายรุ่น (ให้แอปอ่านป้าย) ·
#     งานของฉัน warrantyUntil / plateFamily / preRepair (นับเฉพาะไฟล์ไม่ผูกชิ้น) · เครื่อง Oasis เรียก "วิดีโออาการตอนเครื่องเดิน"
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"

TMP=$(mktemp -d)
ABC="CZCM$SUF"
AID=""
OLD_OPENED=""
claim_extra_cleanup() {
  rm -rf "${TMP:?}"
  # ใบของสาขา COCO ต้องลบก่อนสาขา (ใบงานอ้างถึงสาขา/เครื่อง)
  [ -n "$AID" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$AID" -H "$(H $A)" >/dev/null
  # คืนวันเปิดร้านของสาขาทดสอบ (ข้อ "หมดประกัน" เลื่อนชั่วคราว) — สาขาถูกลบตามหลังอยู่แล้ว แต่ตายกลางทางก็ไม่ค้างค่าแปลก
  [ -n "$OLD_OPENED" ] && DB "update \"Branch\" set \"openedAt\"='$OLD_OPENED' where code='$BC'" >/dev/null
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$ABC');
      delete from \"Branch\" where code='$ABC'" >/dev/null
}

ST() { DB "select status from \"WorkOrder\" where id=$ID"; }
NROWS() { DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID"; }
NLOG() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='$1'"; }
EXISTS() { DB "select count(*) from \"WorkOrderAttachment\" where id=$1"; }
NCLAIMFILES() { DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role like 'CLAIM_%'"; }
# POST แล้วเก็บคำตอบไว้ที่ $TMP/body — พิมพ์รหัส HTTP · ERR = ข้อความ error ในคำตอบนั้น
PC() { curl -s -o "$TMP/body" -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
ERR() { J 'typeof d.error==="string"?d.error:JSON.stringify(d.error)' < "$TMP/body"; }
# แนบไฟล์แล้วเก็บรหัส HTTP — $1 token · $2 ชนิดไฟล์ · ที่เหลือ = -F
UPC() { local t=$1 mime=$2; shift 2; curl -s -o "$TMP/up" -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $t)" -F "file=@$SP/site-photo.png;type=$mime" "$@"; }
# ใบเคลม (claim_json) + ข้อเช็คตาม Error ของชิ้นนั้น — $1 ใบเคลม · $2 JSON array
EC() { echo "${1%\}},\"errorChecked\":$2}"; }
# ช่างปิดงานแบบส่ง body เอง (เก็บรหัส HTTP) — $1 claims · $2 ป้าย · $3 เช็ค · $4 claimSkips
CLOSEC() { PC $T "work-orders/$ID/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนอะไหล่ ทดสอบแล้วปกติ\",\"workerIds\":[$TID],\"parts\":$PARTS,\"claims\":$1,\"claimNameplate\":$2,\"claimCheck\":${3:-$CHECK},\"claimSkips\":${4:-[]}}"; }
MYDAY() { GET $T work-orders/my-day | J "const r=d.rows.find(x=>x.id===$ID); if(!r) 'missing'; else { $1 }"; }
ROW() { echo "$1" | J "const c=d.claims.find(x=>x.id===$2); c ? ($3) : 'missing'"; }
NORM() { node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").replace(/[^\S\f]|[ัิ-ฺ็-๎]/g,""))'; }
PDFTXT() { curl -s "localhost:4000/api/work-orders/$ID/claims/$1/pdf" -H "$(H $A)" -o "$TMP/$1.pdf"; pdftotext -layout "$TMP/$1.pdf" - | NORM; }
HAS() { echo "$1" | grep -qF "$(printf '%s' "$2" | NORM)"; }

EDL="E dL / E dL1 / E dL2"
CROP="data:image/jpeg;base64,/9j/AAAA"

echo "═══ ถ่ายก่อนซ่อม: วิดีโอ Error / รูปอาการ แนบโดยไม่บอกชิ้น"
claim_order 2
M1=$ID; PID_A=$PID; PID_B=$PID2
PNAME=$(DB "select name from \"SparePart\" where id=$PID")
PNAME2=$(DB "select name from \"SparePart\" where id=$PID2")
C1=$(UPC $T video/mp4 -F "role=CLAIM_ERROR_VIDEO"); PREV=$(J 'd.id' < "$TMP/up"); R1=$(J 'String(d.sparePartId)' < "$TMP/up")
C2=$(UPC $T image/png -F "role=CLAIM_SYMPTOM" -F "sparePartId="); PREP=$(J 'd.id' < "$TMP/up")
[ "$C1|$C2|$R1" = "201|201|null" ] \
  && [ "$(DB "select string_agg(role||':'||coalesce(\"sparePartId\"::text,'null'), ',' order by id) from \"WorkOrderAttachment\" where id in ($PREV,$PREP)")" = "CLAIM_ERROR_VIDEO:null,CLAIM_SYMPTOM:null" ] \
  && pass "วิดีโอ Error + รูปอาการไม่บอกชิ้น (ไม่ส่ง / ส่งค่าว่าง) → 201 · ฐานข้อมูล sparePartId ว่างทั้งสองไฟล์" \
  || fail "แนบของเครื่อง: $C1/$C2 sparePartId=$R1 · $(head -c 200 "$TMP/up")"
N0=$(NCLAIMFILES)
C=$(UPC $T image/png -F "role=CLAIM_PART")
[ "$C" = "400" ] && grep -q "หลักฐานเคลมต้องระบุว่าเป็นของอะไหล่ชิ้นไหน" "$TMP/up" && [ "$(NCLAIMFILES)" = "$N0" ] \
  && pass "รูปอะไหล่เก่าไม่บอกชิ้น = 400 \"ต้องระบุว่าเป็นของอะไหล่ชิ้นไหน\" (ไม่มีแถวใหม่)" || fail "รูปอะไหล่เก่าไม่บอกชิ้น: $C $(head -c 200 "$TMP/up")"
# ทีม Area แนบรูปได้เฉพาะใบที่ตัวเองเปิดในสาขา COCO — ใบแบบนั้นก็ยังแนบหลักฐานเคลมของเครื่องไม่ได้
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบเคลมเครื่อง COCO','$ABC','ใต้','กระบี่','COCO',now()-interval '12 months')" >/dev/null
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ((select id from \"Branch\" where code='$ABC'),'W1','WASHER','HB - Huebsch',now())" >/dev/null
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCSR$SUF','Area ทดสอบเคลมเครื่อง','AREA','$HASH',false)" >/dev/null
AR=$(login ZCSR$SUF)
AID=$(POST $A work-orders "{\"branchCode\":\"$ABC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
DB "update \"WorkOrder\" set \"createdById\"=(select id from \"User\" where \"employeeCode\"='ZCSR$SUF') where id=$AID" >/dev/null
C=$(curl -s -o "$TMP/up" -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$AID/attachments" -H "$(H $AR)" -F "file=@$SP/site-photo.png;type=video/mp4" -F "role=CLAIM_ERROR_VIDEO")
[ "$C" = "403" ] && grep -q "หลักฐานเคลมแนบได้จากฟอร์มปิดงานเท่านั้น" "$TMP/up" \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$AID")" = "0" ] \
  && pass "ทีม Area แนบวิดีโอ Error แบบไม่บอกชิ้นไม่ได้ (403 · ไม่มีแถว)" || fail "Area แนบของเครื่อง: $C $(head -c 200 "$TMP/up")"

echo
echo "═══ ไฟล์ถ่ายก่อนซ่อมนับเป็นรูปก่อนซ่อม · งานของฉันรู้ว่าถ่ายไว้แล้ว"
# รูปก่อนซ่อมที่ claim_order แนบไว้ — ช่างลบเอง (ไม่ใช่หลักฐานเคลม) ให้เหลือแค่ไฟล์จากกล่องถ่ายก่อนซ่อม
BEFORE_ID=$(DB "select id from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='BEFORE'")
[ "$(CODE $T DELETE "work-orders/$ID/attachments/$BEFORE_ID")" = "200" ] || fail "เตรียม: ลบรูปก่อนซ่อมไม่ได้"
G=$(GET $T "work-orders/$ID")
[ "$(echo "$G" | J '[d.beforeCount,d.preRepairCount,d.claimEvidence.filter(e=>e.sparePartId===null).map(e=>e.role).sort().join("+")].join("|")')" = "2|2|CLAIM_ERROR_VIDEO+CLAIM_SYMPTOM" ] \
  && pass "รายละเอียดใบงาน: ไม่มีรูปก่อนซ่อม แต่ beforeCount = 2 (ไฟล์ถ่ายก่อนซ่อม) · preRepairCount = 2 · claimEvidence มีแถว sparePartId ว่าง" \
  || fail "detail ก่อนปิด: $(echo "$G" | J 'JSON.stringify([d.beforeCount,d.preRepairCount,d.claimEvidence])' | head -c 300)"
WEND=$(DB "select to_char(\"openedAt\" + interval '3 years', 'YYYY-MM-DD') from \"Branch\" where code='$BC'")
[ "$(MYDAY '[String(r.warrantyUntil).slice(0,10),r.plateFamily,r.preRepair.video,r.preRepair.photo].join("|")')" = "$WEND|ALLIANCE|1|1" ] \
  && pass "งานของฉัน: warrantyUntil = วันเปิดร้าน + 3 ปี ($WEND · Huebsch) · plateFamily ALLIANCE · preRepair วิดีโอ 1 รูป 1" \
  || fail "my-day: $(MYDAY 'JSON.stringify({w:r.warrantyUntil,p:r.plateFamily,pre:r.preRepair})') (คาดวันหมดประกัน $WEND)"

echo
echo "═══ ป้ายรุ่น: ยืนยันรุ่นกับ Serial ทีละช่อง"
# หลักฐานของชิ้น (รูปอะไหล่เก่า · วิดีโอการตรวจเช็ค) แนบทีละชิ้น — ของเครื่องมีแค่ไฟล์ถ่ายก่อนซ่อมสองไฟล์ข้างบน
for p in $PID $PID2; do
  UP image/png -F "role=CLAIM_PART" -F "sparePartId=$p" >/dev/null
  UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$p" >/dev/null
done
CLAIMS="[$(EC "$(claim_json $PID)" '["Solenoid ไม่ฝืด"]'),$(EC "$(claim_json $PID2)" '["Limit switch ทำงาน","ขั้วต่อสายไม่หลวม","ข้อที่ไม่มีในคู่มือ"]')]"
LEGACY="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"HL055L\",\"source\":\"SCAN\",\"crop\":\"$CROP\"},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"HAND\"}],\"verified\":true}"
C=$(CLOSEC "$CLAIMS" "$LEGACY"); E=$(ERR)
[ "$C|$E" = "400|แอปเวอร์ชันเก่า — โหลดหน้าใหม่แล้วกดยืนยันรุ่นกับ Serial ทีละช่อง" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|0" ] \
  && pass "แอปเก่า (ติ๊กเดียว verified ไม่มี confirmed สักช่อง) = 400 \"$E\" · ใบไม่ขยับ ไม่มีใบเคลม" || fail "ป้ายแบบเดิม: $C $E · $(ST) $(NROWS)"
SCAN_UNCONF="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"HL055L\",\"source\":\"SCAN\",\"crop\":\"$CROP\"},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"HAND\",\"confirmed\":true}]}"
HAND_UNCONF="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"HL055L\",\"source\":\"HAND\",\"confirmed\":false},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"HAND\",\"confirmed\":true}]}"
C1=$(CLOSEC "$CLAIMS" "$SCAN_UNCONF"); E1=$(ERR)
C2=$(CLOSEC "$CLAIMS" "$HAND_UNCONF"); E2=$(ERR)
[ "$C1|$E1" = "400|ต้องกดยืนยันรุ่นกับ Serial ทีละช่องว่าตรงกับรูปป้าย" ] && [ "$C2|$E2" = "$C1|$E1" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|0" ] \
  && pass "รุ่นที่อ่านจากรูปยังไม่ยืนยัน · รุ่นที่พิมพ์เอง confirmed=false → 400 \"$E1\" ทั้งคู่ (ฐานข้อมูลไม่เปลี่ยน)" \
  || fail "ยืนยันรุ่น: $C1 $E1 · $C2 $E2 · $(ST) $(NROWS)"
UNSURE="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"HL055L\",\"source\":\"SCAN\",\"crop\":\"$CROP\",\"confirmed\":true},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"HAND\",\"confirmed\":true},{\"key\":\"productionDate\",\"label\":\"วันผลิต\",\"value\":\"01/2029\",\"source\":\"SCAN\",\"needsCheck\":true,\"confirmed\":false}]}"
C=$(CLOSEC "$CLAIMS" "$UNSURE"); E=$(ERR)
[ "$C|$E" = "400|ต้องกดยืนยันช่อง วันผลิต ที่ระบบไม่มั่นใจ" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|0" ] \
  && pass "ช่องที่ระบบไม่มั่นใจ (needsCheck) ยังไม่ยืนยัน = 400 \"$E\"" || fail "needsCheck: $C $E"

echo
echo "═══ ส่งเคลมสองชิ้นด้วยไฟล์ของเครื่องชุดเดียว (ไม่มีรูปก่อนซ่อม)"
MODEL="HL055LWHPRXG6W0000"
GOOD="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"$MODEL\",\"source\":\"SCAN\",\"crop\":\"$CROP\",\"confirmed\":true,\"edited\":true,\"needsCheck\":true,\"read\":\"HL05SLWHPRXG6W0000\"},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"HAND\",\"confirmed\":true}]}"
C=$(CLOSEC "$CLAIMS" "$GOOD")
[ "$C" = "200" ] && [ "$(ST)|$(NROWS)" = "CLAIM_REVIEW|2" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='BEFORE'")" = "0" ] \
  && pass "ไม่มีรูปก่อนซ่อมเลย แต่มีไฟล์ถ่ายก่อนซ่อม · ของเครื่องไม่ผูกชิ้น → ส่งเคลมสองชิ้นได้ (ฐานข้อมูล: รอตรวจ · ใบเคลม 2 แถว)" \
  || fail "ส่งด้วยไฟล์ของเครื่องชุดเดียว: $C $(head -c 300 "$TMP/body")"
CA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
[ "$(DB "select (\"fieldCheck\"->'checked')::text from \"PartClaim\" where id=$CA")" = '["Solenoid ไม่ฝืด"]' ] \
  && [ "$(DB "select (\"fieldCheck\"->'checked')::text from \"PartClaim\" where id=$CB")" = '["Limit switch ทำงาน", "ขั้วต่อสายไม่หลวม"]' ] \
  && [ "$(DB "select count(distinct (\"fieldCheck\"->'offered')::text)||'|'||max(\"fieldCheck\"->>'errorCode') from \"PartClaim\" where \"workOrderId\"=$ID")" = "1|$EDL" ] \
  && pass "ข้อเช็คตาม Error ต่อชิ้น (errorChecked): $PNAME 1 ข้อ · $PNAME2 2 ข้อ (ตัดข้อนอกคู่มือ) · Error/offered ชุดเดียวกัน (ฐานข้อมูล)" \
  || fail "errorChecked: A=$(DB "select \"fieldCheck\"::text from \"PartClaim\" where id=$CA") B=$(DB "select \"fieldCheck\"::text from \"PartClaim\" where id=$CB")"
NP=$(DB "select (nameplate->'fields'->0->>'confirmed')||'|'||(nameplate->'fields'->0->>'edited')||'|'||(nameplate->'fields'->0->>'read')||'|'||(nameplate->'fields'->0->>'source')||'|'||(nameplate->'fields'->0->>'crop')||'|'||(nameplate->'fields'->1->>'confirmed')||'|'||(nameplate->>'verified') from \"PartClaim\" where id=$CA")
[ "$NP" = "true|true|HL05SLWHPRXG6W0000|SCAN|$CROP|true|true" ] \
  && pass "ป้ายรุ่นเก็บ confirmed · edited · read (ค่าที่ระบบอ่านก่อนแก้) · ยัง SCAN และเก็บภาพตัดของค่าที่แก้ (ฐานข้อมูล)" || fail "nameplate: $NP"
G=$(GET $PA "work-orders/$ID")
[ "$(ROW "$G" $CA "c.evidenceIds.includes($PREV)&&c.evidenceIds.includes($PREP)")|$(ROW "$G" $CB "c.evidenceIds.includes($PREV)&&c.evidenceIds.includes($PREP)")" = "true|true" ] \
  && pass "evidenceIds ของทั้งสองชิ้นมีวิดีโอ Error + รูปอาการที่ถ่ายก่อนซ่อม (ใช้ร่วมทุกชิ้น)" \
  || fail "evidenceIds: A=$(ROW "$G" $CA 'JSON.stringify(c.evidenceIds)') B=$(ROW "$G" $CB 'JSON.stringify(c.evidenceIds)') เครื่อง $PREV/$PREP"
TA=$(PDFTXT $CA); TB=$(PDFTXT $CB)
# รายการหลักฐานในใบเคลมเป็นชื่อไฟล์ที่ผู้ขายได้จริง (เคลมก้อน 6) — ไฟล์ของเครื่องใช้ร่วมทุกชิ้น ชื่อจึงไม่มีรหัสอะไหล่
WOC=$(DB "select code from \"WorkOrder\" where id=$ID")
HAS "$TA" "${WOC}_วิดีโอError" && HAS "$TA" "${WOC}_รูปอาการเสีย" && HAS "$TB" "${WOC}_วิดีโอError" && HAS "$TB" "${WOC}_รูปอาการเสีย" \
  && pass "ใบเคลม PDF ทั้งสองชิ้นลงหลักฐาน \"${WOC}_วิดีโอError\" และ \"${WOC}_รูปอาการเสีย\" จากไฟล์ถ่ายก่อนซ่อม (ชื่อเดียวกันทั้งสองใบ)" \
  || fail "PDF หลักฐาน: A $(echo "$TA" | grep -o 'หลักฐาน.\{0,80\}' | head -1) · B $(echo "$TB" | grep -o 'หลักฐาน.\{0,80\}' | head -1)"
C=$(CODE $T DELETE "work-orders/$ID/attachments/$PREV")
[ "$C" = "409" ] && [ "$(EXISTS $PREV)" = "1" ] \
  && pass "วิดีโอ Error ที่ถ่ายก่อนซ่อมและส่งไปกับใบเคลมแล้ว ช่างลบไม่ได้ (409 · ยังอยู่ในฐานข้อมูล)" || fail "ลบไฟล์ของเครื่องที่ส่งแล้ว: $C · $(EXISTS $PREV)"

echo
echo "═══ ตีกลับวิดีโอ Error (ทั้งใบ) → แก้ด้วยวิดีโอใหม่ที่ไม่ผูกชิ้น · แอปเก่าส่งข้อเช็คชุดเดียว"
C=$(PC $PA "work-orders/$ID/claim-review" "{\"decisions\":[{\"claimId\":$CA,\"verdict\":\"REJECT\",\"flags\":[\"CLAIM_ERROR_VIDEO\"]},{\"claimId\":$CB,\"verdict\":\"REJECT\",\"flags\":[\"CLAIM_ERROR_VIDEO\"]}]}")
[ "$C|$(ST)" = "200|IN_PROGRESS" ] || fail "เตรียม: ตีกลับวิดีโอ Error ไม่ผ่าน ($C $(head -c 200 "$TMP/body"))"
N0=$(NROWS)
# แอปเก่า: ไม่ส่ง errorChecked ต่อชิ้น มีแต่ claimCheck.checked ชุดเดียว
CHECK2="{\"errorCode\":\"$EDL\",\"checked\":[\"Limit switch ทำงาน\",\"Solenoid ไม่ฝืด\"]}"
OLDCLAIMS="[$(claim_json $PID),$(claim_json $PID2)]"
C1=$(CLOSEC "$OLDCLAIMS" "$GOOD" "$CHECK2"); E1=$(ERR)
NEWV=$(UP video/mp4 -F "role=CLAIM_ERROR_VIDEO" | J 'd.id')
C2=$(CLOSEC "$OLDCLAIMS" "$GOOD" "$CHECK2")
CA2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID and status='PENDING'")
CB2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2 and status='PENDING'")
G=$(GET $PA "work-orders/$ID")
[ "$C1|$E1" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ วิดีโอ Error" ] && [ "$C2" = "200" ] && [ "$(ST)|$(NROWS)" = "CLAIM_REVIEW|$((N0 + 2))" ] \
  && [ "$(DB "select coalesce(\"sparePartId\"::text,'null') from \"WorkOrderAttachment\" where id=$NEWV")" = "null" ] \
  && [ "$(ROW "$G" $CA2 "c.evidenceIds.includes($NEWV)&&!c.evidenceIds.includes($PREV)")|$(ROW "$G" $CB2 "c.evidenceIds.includes($NEWV)")" = "true|true" ] \
  && pass "ส่งใหม่โดยไม่แนบวิดีโอ = 400 \"$E1\" · แนบวิดีโอใหม่แบบไม่ผูกชิ้น (ฐานข้อมูล sparePartId ว่าง) → ส่งได้ · ทั้งสองชิ้นใช้วิดีโอใหม่แทนวิดีโอเดิม" \
  || fail "แก้วิดีโอ Error: $C1 $E1 · $C2 $(head -c 200 "$TMP/body") · $(ST) $(NROWS)/$((N0 + 2))"
[ "$(DB "select string_agg(distinct (\"fieldCheck\"->'checked')::text, '¦') from \"PartClaim\" where id in ($CA2,$CB2)")" = '["Solenoid ไม่ฝืด", "Limit switch ทำงาน"]' ] \
  && pass "แอปเก่าส่งข้อเช็คชุดเดียว (claimCheck.checked) → ทั้งสองแถวได้ชุดเดียวกัน เรียงตามคู่มือ (ฐานข้อมูล)" \
  || fail "ข้อเช็คแอปเก่า: $(DB "select string_agg((\"fieldCheck\"->'checked')::text, '¦') from \"PartClaim\" where id in ($CA2,$CB2)")"

echo
echo "═══ claimApprovedModel · รายการ Error ตามชนิดเครื่อง · รูปป้ายรุ่นผ่านเซิร์ฟเวอร์"
[ "$(GET $T "work-orders/$ID" | J 'String(d.claimApprovedModel)')" = "null" ] || fail "ยังไม่อนุมัติแต่มี claimApprovedModel"
POST $PA "work-orders/$ID/claim-review" '{"approve":true}' >/dev/null
[ "$(ST)" = "DONE" ] || fail "เตรียม: อนุมัติไม่ผ่าน ($(ST))"
claim_order 2
M2=$ID
[ "$(GET $T "work-orders/$M2" | J 'String(d.claimApprovedModel)')" = "$MODEL" ] \
  && [ "$(GET $T "work-orders/$M2" | J 'd.machineModel===null||d.machineModel!=="'$MODEL'"')" = "true" ] \
  && pass "ใบใหม่ของเครื่องเดียวกัน: claimApprovedModel = รุ่นจากใบเคลมที่อนุมัติ ($MODEL) · ทะเบียนเครื่องไม่ถูกเขียนทับ" \
  || fail "claimApprovedModel: $(GET $T "work-orders/$M2" | J 'JSON.stringify([d.claimApprovedModel,d.machineModel])')"
G=$(GET $T "work-orders/$M2")
[ "$(echo "$G" | J '[d.claimGuide.machineType, d.claimGuide.errors[0].code, d.claimGuide.errors[0].label, d.claimGuide.errors.some(e=>["ECoFAn","อบไม่ร้อน","EAF1 / EAF2","E co"].includes(e.code)), d.claimGuide.errors.some(e=>e.code==="Push Start"), d.claimGuide.errors.every(e=>e.types.includes("WASHER"))].join("|")')" \
  = "WASHER|อื่น ๆ|ไม่มี Error ขึ้น|false|true|true" ] \
  && pass "claimGuide เครื่องซัก: machineType WASHER · บนสุด \"ไม่มี Error ขึ้น\" (รหัสเดิม อื่น ๆ) · ไม่มี Error ของเครื่องอบ · ยังมี Error ที่ขึ้นได้ทั้งสองแบบ" \
  || fail "claimGuide: $(echo "$G" | J 'JSON.stringify(d.claimGuide.errors.map(e=>e.code+":"+e.types))' | head -c 400)"
[ "$(echo "$G" | J "[d.claimGuide.errors.find(e=>e.code===\"$EDL\").checkLabels[0], d.claimGuide.checkLabels['Contactor ทำงาน (วัดแล้ว)'], d.claimTroubleshootingHints['เปลี่ยนแล้วทดสอบเดินเครื่องครบรอบ']].join('|')")" \
  = "โซลินอยด์ (Solenoid) ไม่ฝืด|คอนแทคเตอร์ (Contactor) ทำงาน (วัดแล้ว)|AFTER" ] \
  && [ "$(GET $A work-orders/options | J 'd.claimSkipReasons.map(r=>r.value+"="+r.label).join(",")')" = "DAMAGED_LOST=อะไหล่เก่าเสียหาย/หาย,NOT_WARRANTY=ไม่ใช่ชิ้นในประกัน,OTHER=อื่น ๆ" ] \
  && pass "ข้อเช็คแสดงคำอ่านไทยนำหน้า (ค่าที่เก็บไม่เปลี่ยน) · claimTroubleshootingHints · options.claimSkipReasons" \
  || fail "checkLabels/hints/skipReasons: $(echo "$G" | J 'JSON.stringify([d.claimGuide.checkLabels,d.claimTroubleshootingHints])' | head -c 300)"
NPID=$(DB "select id from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='NAMEPLATE'")
BFID=$(DB "select id from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='BEFORE'")
FC=$(curl -s -o "$TMP/plate.bin" -w '%{http_code}|%{content_type}' "localhost:4000/api/work-orders/$ID/attachments/$NPID/file" -H "$(H $T)")
BC2=$(CODE $T GET "work-orders/$ID/attachments/$BFID/file")
[ "$FC" = "200|image/png" ] && [ "$(stat -c %s "$TMP/plate.bin")" = "$(DB "select \"sizeBytes\" from \"WorkOrderAttachment\" where id=$NPID")" ] && [ "$BC2" = "400" ] \
  && pass "GET …/attachments/:id/file ส่งรูปป้ายรุ่นทั้งไฟล์ (ขนาดตรงฐานข้อมูล) ให้แอปอ่านป้าย · รูปอื่น (ก่อนซ่อม) ยัง 400" \
  || fail "/file: ป้าย $FC ($(stat -c %s "$TMP/plate.bin") ไบต์) · ก่อนซ่อม $BC2"

echo
echo "═══ รูปอาการที่ผูกชิ้น (ข้อ ⑥ ตอนปิดงาน) ไม่ใช่รูปก่อนซ่อม"
BEFORE_ID=$(DB "select id from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='BEFORE'")
[ "$(CODE $T DELETE "work-orders/$ID/attachments/$BEFORE_ID")" = "200" ] || fail "เตรียม: ลบรูปก่อนซ่อมไม่ได้"
UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" >/dev/null
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID" >/dev/null
UP video/mp4 -F "role=CLAIM_ERROR_VIDEO" -F "sparePartId=$PID" >/dev/null
UP image/png -F "role=CLAIM_SYMPTOM" -F "sparePartId=$PID" >/dev/null
SKIP_B="[{\"sparePartId\":$PID2,\"reason\":\"DAMAGED_LOST\"}]"
C=$(CLOSEC "[$(claim_json $PID)]" "$PLATE" "$CHECK" "$SKIP_B"); E=$(ERR)
[ "$C|$E" = "400|ต้องแนบรูปหรือวิดีโอก่อนซ่อมอย่างน้อยหนึ่งไฟล์" ] && [ "$(GET $T "work-orders/$ID" | J 'd.beforeCount+"|"+d.preRepairCount')" = "0|0" ] \
  && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|0" ] \
  && pass "วิดีโอ Error/รูปอาการที่ผูกชิ้น ไม่นับเป็นรูปก่อนซ่อม = 400 \"$E\" · beforeCount 0 · ใบไม่ขยับ" || fail "ไฟล์ผูกชิ้นนับเป็นก่อนซ่อม: $C $E"
# การ์ดงานของฉันต้องไม่นับไฟล์ข้อ ⑥ เป็น "ถ่ายไว้แล้ว" — นับผิดแล้วกล่องถ่ายก่อนซ่อมไม่กางเอง ทั้งที่ยังไม่ได้ถ่ายตอนเครื่องเสีย
[ "$(MYDAY 'r.preRepair.video+"|"+r.preRepair.photo')" = "0|0" ] \
  && pass "งานของฉัน preRepair ไม่นับวิดีโอ Error/รูปอาการที่ผูกชิ้น (วิดีโอ 0 · รูป 0)" \
  || fail "my-day preRepair นับไฟล์ผูกชิ้น: $(MYDAY 'JSON.stringify(r.preRepair)')"
UP image/png -F "role=BEFORE" >/dev/null

echo
echo "═══ สาขาในประกัน: ไม่ส่งเคลมชิ้นไหนต้องบอกเหตุผล"
C1=$(CLOSEC "[$(claim_json $PID)]" "$PLATE" "$CHECK" '[]'); E1=$(ERR)
C2=$(CLOSEC "[$(claim_json $PID)]" "$PLATE" "$CHECK" "[{\"sparePartId\":$PID2,\"reason\":\"OTHER\",\"note\":\"  \"}]"); E2=$(ERR)
[ "$C1|$E1" = "400|ไม่ส่งเคลม $PNAME2: ต้องเลือกเหตุผล (สาขายังอยู่ในประกัน)" ] && [ "$C2|$E2" = "400|ไม่ส่งเคลม $PNAME2: เลือก “อื่น ๆ” ต้องพิมพ์เหตุผล" ] \
  && [ "$(ST)|$(NROWS)|$(NLOG CLAIM_SKIPPED)" = "IN_PROGRESS|0|0" ] \
  && pass "ถอด $PNAME2 ออกจากเคลมโดยไม่บอกเหตุผล = 400 \"$E1\" · \"อื่น ๆ\" ไม่พิมพ์ = 400 · ฐานข้อมูลไม่เปลี่ยน" \
  || fail "เหตุผลไม่ส่งเคลม: $C1 $E1 · $C2 $E2 · $(ST) $(NROWS) $(NLOG CLAIM_SKIPPED)"
C=$(CLOSEC "[$(claim_json $PID)]" "$PLATE" "$CHECK" "[{\"sparePartId\":$PID2,\"reason\":\"OTHER\",\"note\":\" ลูกค้าเก็บชิ้นเก่าไว้เอง \"}]")
SKIPLOG=$(DB "select note||'¦'||(meta->'skips'->0->>'sparePartId')||'¦'||(meta->'skips'->0->>'reason')||'¦'||(meta->'skips'->0->>'note')||'¦'||(meta->>'by') from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SKIPPED'")
[ "$C" = "200" ] && [ "$(ST)|$(NROWS)" = "CLAIM_REVIEW|1" ] \
  && [ "$SKIPLOG" = "$PNAME2: อื่น ๆ — ลูกค้าเก็บชิ้นเก่าไว้เอง¦$PID2¦OTHER¦ลูกค้าเก็บชิ้นเก่าไว้เอง¦TECH" ] \
  && [ "$(DB "select (select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SKIPPED') < (select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLOSED')")" = "t" ] \
  && pass "\"อื่น ๆ\" + เหตุผล → ส่งเคลมชิ้นเดียว · ประวัติ CLAIM_SKIPPED \"$PNAME2: อื่น ๆ — …\" meta.skips (OTHER · TECH) เขียนก่อนประวัติปิดงาน (ฐานข้อมูล)" \
  || fail "ไม่ส่งเคลมพร้อมเหตุผล: $C $(head -c 200 "$TMP/body") · $(ST) $(NROWS) · $SKIPLOG"
[ "$(GET $PA "work-orders/$ID" | J 'd.claimSkips.map(s=>[s.sparePartId,s.partLabel,s.reasonCode,s.reason,s.by].join(",")).join("/")')" = "$PID2,$PNAME2,OTHER,อื่น ๆ: ลูกค้าเก็บชิ้นเก่าไว้เอง,TECH" ] \
  && [ "$(MYDAY 'r.claim.skipped.map(s=>s.partLabel+"="+s.reason).join("/")')" = "$PNAME2=อื่น ๆ: ลูกค้าเก็บชิ้นเก่าไว้เอง" ] \
  && pass "รายละเอียดใบงาน claimSkips + งานของฉัน claim.skipped: \"$PNAME2 (อื่น ๆ: ลูกค้าเก็บชิ้นเก่าไว้เอง)\"" \
  || fail "claimSkips: $(GET $PA "work-orders/$ID" | J 'JSON.stringify(d.claimSkips)') · my-day $(MYDAY 'JSON.stringify(r.claim.skipped)')"
# ตีกลับแล้วส่งใหม่โดยเคลมครบทุกชิ้น — เหตุผลไม่ส่งเคลมของการปิดครั้งก่อนต้องไม่ค้าง
POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"รูปมืด ถ่ายใหม่"}' >/dev/null
UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" >/dev/null
for r in CLAIM_PART CLAIM_CHECK_VIDEO; do UP $([ $r = CLAIM_PART ] && echo image/png || echo video/mp4) -F "role=$r" -F "sparePartId=$PID2" >/dev/null; done
C=$(CLOSEC "[$(claim_json $PID),$(claim_json $PID2)]" "$PLATE")
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] && [ "$(NLOG CLAIM_SKIPPED)" = "1" ] \
  && [ "$(GET $PA "work-orders/$ID" | J 'd.claimSkips.length')" = "0" ] \
  && pass "ส่งใหม่เคลมครบทุกชิ้น: ไม่มี CLAIM_SKIPPED ใหม่ · claimSkips ว่าง (ไม่เอาเหตุผลของการปิดครั้งก่อนมาแสดง)" \
  || fail "claimSkips หลังเคลมครบ: $C $(head -c 200 "$TMP/body") · $(NLOG CLAIM_SKIPPED) · $(GET $PA "work-orders/$ID" | J 'JSON.stringify(d.claimSkips)')"

echo
echo "═══ สาขาหมดประกัน: ไม่ส่งเคลมไม่ต้องบอกเหตุผล"
claim_order 2
OLD_OPENED=$(DB "select \"openedAt\" from \"Branch\" where code='$BC'")
# เลื่อนวันเปิดร้านหลังใบถึงขั้นเข้างานแล้ว — ถ้าเลื่อนก่อน ใบจะไปขั้นเสนอราคาแทน (ของนอกประกัน)
DB "update \"Branch\" set \"openedAt\"=now()-interval '5 years' where code='$BC'" >/dev/null
C=$(CLOSEC "[]" "$PLATE" "$CHECK" '[]')
[ "$C" = "200" ] && [ "$(ST)|$(NROWS)|$(NLOG CLAIM_SKIPPED)" = "DONE|0|0" ] \
  && [ "$(MYDAY 'String(r.warrantyUntil)')" = "null" ] \
  && pass "สาขาหมดประกัน: ใช้อะไหล่ 2 ชิ้นไม่ส่งเคลมและไม่บอกเหตุผล → ปิดงานได้ · ไม่มี CLAIM_SKIPPED · งานของฉัน warrantyUntil ว่าง" \
  || fail "หมดประกัน: $C $(head -c 200 "$TMP/body") · $(ST) $(NROWS) $(NLOG CLAIM_SKIPPED) · $(MYDAY 'String(r.warrantyUntil)')"
DB "update \"Branch\" set \"openedAt\"='$OLD_OPENED' where code='$BC'" >/dev/null
OLD_OPENED=""

echo
echo "═══ หัวหน้าภาคปิดใบงาน / ปิดงานย้อนหลัง บนสาขาในประกัน: ลงว่าไม่ได้ส่งเคลม"
TODAY=$(day 0)
claim_order 1
C=$(PC $S "work-orders/$ID/supervisor-close" "{\"reason\":\"TECH_FIXED\",\"note\":\"ช่างเข้าซ่อมเสร็จแล้ว ทดสอบปิดแทน\",\"otherWorkers\":\"ช่างทดสอบ\",\"visitDate\":\"$TODAY\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}")
SL=$(DB "select note||'¦'||(meta->>'by')||'¦'||coalesce(meta->'skips'->0->>'reason','null')||'¦'||(meta->'skips'->0->>'sparePartId') from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SKIPPED'")
LAST=$(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$ID order by id desc limit 1")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] && [ "$SL" = "หัวหน้าภาคปิดใบงาน — ไม่ได้ส่งเคลม: $PNAME¦SUPERVISOR_CLOSE¦null¦$PID" ] && [ "$LAST" = "CLOSED" ] \
  && pass "หัวหน้าภาคปิดใบงาน (ช่างซ่อมเสร็จ) พร้อมอะไหล่: CLAIM_SKIPPED \"หัวหน้าภาคปิดใบงาน — ไม่ได้ส่งเคลม: $PNAME\" (meta.by SUPERVISOR_CLOSE) · ประวัติล่าสุดยังเป็นปิดงาน" \
  || fail "supervisor-close: $C $(head -c 200 "$TMP/body") · $SL · ล่าสุด $LAST"
claim_order 1
NOWISO=$(node -e 'console.log(new Date().toISOString())')
C=$(PC $A "work-orders/$ID/backfill-close" "{\"reason\":\"ทดสอบ\",\"team\":\"กระบี่\",\"visitDate\":\"$TODAY\",\"visitTime\":\"00:00\",\"result\":\"FIXED\",\"closedAt\":\"$NOWISO\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"otherWorkers\":\"ช่างทดสอบ\",\"noPhotoReason\":\"ทดสอบ\"}")
SL=$(DB "select note||'¦'||(meta->>'by')||'¦'||(\"backfilledAt\" is not null) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SKIPPED'")
ORDER=$(DB "select (s.\"createdAt\"=c.\"createdAt\" and s.id<c.id)::text from \"WorkOrderLog\" s, \"WorkOrderLog\" c where s.\"workOrderId\"=$ID and c.\"workOrderId\"=$ID and s.action='CLAIM_SKIPPED' and c.action='CLOSED'")
LAST=$(DB "select action from \"WorkOrderLog\" where \"workOrderId\"=$ID order by id desc limit 1")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] && [ "$SL" = "ปิดงานย้อนหลัง (แอดมินกรอกแทน) — ไม่ได้ส่งเคลม: $PNAME¦BACKFILL¦true" ] && [ "$ORDER|$LAST" = "true|BACKFILLED" ] \
  && pass "ปิดงานย้อนหลังพร้อมอะไหล่: CLAIM_SKIPPED \"ปิดงานย้อนหลัง (แอดมินกรอกแทน) — ไม่ได้ส่งเคลม: $PNAME\" (BACKFILL) เวลาเดียวกับปิดงาน วางก่อน (ฐานข้อมูล)" \
  || fail "backfill-close: $C $(head -c 200 "$TMP/body") · $SL · ลำดับ $ORDER · ล่าสุด $LAST"

echo
echo "═══ เครื่อง Oasis: วิดีโออาการตอนเครื่องเดิน"
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ($BID,'W2','WASHER','Oasis',now())" >/dev/null
ID=$(POST $A work-orders "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W2\",\"symptom\":\"เครื่องสั่นแรง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
IDS="$IDS $ID"
OP=$(fx_part $ID BOARD)
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$OP,\"quantity\":1}]}" >/dev/null
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$OP,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}" >/dev/null
POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$OP,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CM$SUF\"}]}" >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(ST)" = "IN_PROGRESS" ] || fail "เตรียม: ใบ Oasis ไม่ถึงขั้นเข้างาน ($(ST))"
N0=$(NCLAIMFILES)
C1=$(UPC $T image/png -F "role=CLAIM_ERROR_VIDEO"); E1=$(J 'd.error' < "$TMP/up")
C2=$(UPC $T video/mp4 -F "role=CLAIM_ERROR_VIDEO")
[ "$C1|$E1" = "400|วิดีโออาการตอนเครื่องเดินต้องเป็นไฟล์วิดีโอ" ] && [ "$C2" = "201" ] && [ "$(NCLAIMFILES)" = "$((N0 + 1))" ] \
  && [ "$(MYDAY '[r.plateFamily,r.preRepair.video,String(r.warrantyUntil)!=="null"].join("|")')" = "OASIS|1|true" ] \
  && pass "Oasis: แนบรูปเป็นวิดีโอ = 400 \"$E1\" · วิดีโอผ่าน (แถวเดียว) · งานของฉัน plateFamily OASIS · preRepair วิดีโอ 1 · ในประกัน (Oasis 2 ปี)" \
  || fail "Oasis: $C1 $E1 · $C2 · $(NCLAIMFILES)/$((N0 + 1)) · $(MYDAY 'JSON.stringify([r.plateFamily,r.preRepair,r.warrantyUntil])')"
# ใบเคลมที่อนุมัติของ W1 ในสาขาเดียวกันต้องไม่กลายเป็นรุ่นเทียบของ W2 — เทียบผิดเครื่อง แอปเตือนว่ารุ่นที่อ่านถูกต้อง "ไม่ตรง"
[ "$(GET $T "work-orders/$ID" | J 'String(d.claimApprovedModel)')" = "null" ] \
  && pass "เครื่องอื่นในสาขาเดียวกัน (W2 · W1 มีใบเคลมอนุมัติแล้ว): claimApprovedModel ว่าง" \
  || fail "claimApprovedModel ข้ามเครื่อง: $(GET $T "work-orders/$ID" | J 'String(d.claimApprovedModel)')"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
