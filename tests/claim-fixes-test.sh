#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 0 — แก้บั๊ก ไม่เปลี่ยนขั้นตอนงาน (ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน)
#   · หลักฐานเคลมแนบผิดชนิดไม่ได้ (รูปเป็นวิดีโอ Error · วิดีโอเป็นรูปอะไหล่) · ทีม Area แนบหลักฐานเคลมไม่ได้ ·
#     ใบที่ยังไม่ถึงขั้นปิดงาน / ส่งตรวจเคลมแล้ว / ปิดแล้ว แนบหลักฐานเคลมไม่ได้ (ไม่มีแถวเกิดในฐานข้อมูล) — สองกรณีหลัง
#     ได้ code CLOSE_ALREADY_SENT เหมือนส่งปิดซ้ำ (ฟอร์มปิดงานแนบไฟล์ก่อนสั่งปิด)
#   · ใบเคลม PDF: ข้อความยาวปกติ (อาการ 300 · เช็คอะไรบ้าง 600 ตัว) จบในหน้าเดียว · ยาวสุด (1000/2000) ช่องลายเซ็น
#     และบรรทัดหลักฐานอยู่หน้าสุดท้ายต่อจากเนื้อหา ไม่ทับกัน · ส่งใหม่หลังถูกตีกลับ "วันที่เปลี่ยนอะไหล่" = วันที่ส่งครั้งแรก
#     ส่วนวันที่ลายเซ็นผู้ขอเคลม = วันที่ส่งใบนั้น
#   · ช่างลบไฟล์ที่ส่งเป็นหลักฐานเคลมแล้วไม่ได้ (409 code CLAIM_EVIDENCE_LOCKED · รวมรูปป้ายรุ่นที่ผูกกับใบเคลม) ·
#     ไฟล์ที่ถูกแนบใหม่แทนก่อนส่ง / แนบหลังส่ง / ของชิ้นที่ไม่ได้เคลม ลบได้ · แอดมินยังลบได้
#   · ส่งปิดงานซ้ำ (รอตรวจเคลม / ปิดแล้ว) = 409 code CLOSE_ALREADY_SENT ฐานข้อมูลไม่เปลี่ยน — แอปนับเป็นส่งสำเร็จได้
#   · ขั้นตรวจเคลมบอกว่ารอ "Admin Spare Part" (ไม่ใช่ "แอดมิน") · งานของฉันยังบอก done + status CLAIM_REVIEW
#   · ปิดพร้อมเคลมแล้ว (รอตรวจเคลม) เปิดใบรออะไหล่ต่อได้ · ทะเบียนที่มีแค่ยี่ห้อ (isBrandOnly ของแอป) ครบทุกยี่ห้อ
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"

if ! command -v pdftotext >/dev/null || ! command -v pdfinfo >/dev/null; then
  echo "FAIL ต้องมี pdftotext และ pdfinfo (แพ็กเกจ poppler-utils) — เทสต์นี้อ่านหน้าและข้อความในใบเคลม PDF"
  exit 1
fi
TMP=$(mktemp -d)
ABC="CZCS$SUF"
AID=""
claim_extra_cleanup() {
  [ -n "$AID" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$AID" -H "$(H $A)" >/dev/null
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$ABC');
      delete from \"Branch\" where code='$ABC'" >/dev/null
  rm -rf "${TMP:?}"
}

# ข้อความใน PDF แบบที่เทียบได้ — pdftotext แตกสระบน/ล่างและวรรณยุกต์ไทยออกเป็นตัวลอย (บางตัวตกไปบรรทัดถัดไป)
# จึงตัดช่องว่างทุกชนิดกับสระบน/ล่าง/วรรณยุกต์ทิ้งก่อนเทียบ ทั้งข้อความใน PDF และข้อความที่คาด · เก็บ \f (ขึ้นหน้าใหม่) ไว้
NORM() { node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").replace(/[^\S\f]|[ัิ-ฺ็-๎]/g,""))'; }
PAGES() { pdfinfo "$1" | awk '/^Pages:/{print $2}'; }
PDF() { curl -s "localhost:4000/api/work-orders/$ID/claims/$1/pdf" -H "$(H $A)" -o "$2"; }
# วันที่แบบเดียวกับที่ใบเคลมพิมพ์ (พ.ศ. เวลาไทย) จากเวลาของแถวในฐานข้อมูล
THDATE() { node -e 'console.log(new Date(Number(process.argv[1])).toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric"}))' "$1"; }
CLAIM_MS() { DB "select (extract(epoch from \"createdAt\")*1000)::bigint from \"PartClaim\" where id=$1"; }
# ข้อความยาว n ตัวที่มีเว้นวรรค (ตัดบรรทัดได้แบบข้อความที่ช่างพิมพ์จริง)
TXT() { node -e 'const [s,n]=[process.argv[1],+process.argv[2]];let o="";while(o.length<n)o+=s;process.stdout.write(o.slice(0,n))' "$1" "$2"; }
NCLAIMFILES() { DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role like 'CLAIM_%'"; }
DEL() { CODE $1 DELETE "work-orders/$ID/attachments/$2"; }
EXISTS() { DB "select count(*) from \"WorkOrderAttachment\" where id=$1"; }

claim_order 2

echo "═══ แนบหลักฐานเคลม: ชนิดไฟล์ · ใครแนบได้"
N0=$(NCLAIMFILES)
R=$(UP image/png -F "role=CLAIM_ERROR_VIDEO" -F "sparePartId=$PID")
echo "$R" | grep -q "วิดีโอ Error code ต้องเป็นไฟล์วิดีโอ" && [ "$(NCLAIMFILES)" = "$N0" ] \
  && pass "รูปแนบเป็นวิดีโอ Error code ไม่ได้ (400 · ไม่มีแถวในฐานข้อมูล)" || fail "รูปเป็นวิดีโอ Error: $(echo $R | head -c 150)"
R=$(UP video/mp4 -F "role=CLAIM_PART" -F "sparePartId=$PID")
echo "$R" | grep -q "รูปอะไหล่เก่าต้องเป็นรูปภาพ" && [ "$(NCLAIMFILES)" = "$N0" ] \
  && pass "วิดีโอแนบเป็นรูปอะไหล่เก่าไม่ได้ (400 · ไม่มีแถวในฐานข้อมูล)" || fail "วิดีโอเป็นรูปอะไหล่: $(echo $R | head -c 150)"

# ทีม Area แนบรูปได้เฉพาะใบที่ตัวเองเปิด — ใบแบบนั้นต้องอยู่สาขา COCO (รหัส C…) ที่ Area มองเห็น
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบเคลม COCO','$ABC','ใต้','กระบี่','COCO',now()-interval '12 months')" >/dev/null
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ((select id from \"Branch\" where code='$ABC'),'W1','WASHER','HB - Huebsch',now())" >/dev/null
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCSR$SUF','Area ทดสอบเคลม','AREA','$HASH',false)" >/dev/null
AR=$(login ZCSR$SUF)
AID=$(POST $A work-orders "{\"branchCode\":\"$ABC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
DB "update \"WorkOrder\" set \"createdById\"=(select id from \"User\" where \"employeeCode\"='ZCSR$SUF') where id=$AID" >/dev/null
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$AID/attachments" -H "$(H $AR)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=CLAIM_PART" -F "sparePartId=$PID")
echo "$R" | grep -q "หลักฐานเคลมแนบได้จากฟอร์มปิดงานเท่านั้น" && [ "${R##* HTTP}" = "403" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$AID")" = "0" ] \
  && pass "ทีม Area แนบหลักฐานเคลมไม่ได้ แม้เป็นใบที่ตัวเองเปิด (403 · ไม่มีแถว)" || fail "Area แนบหลักฐานเคลม: $(echo $R | head -c 150)"
# ใบที่ยังไม่ถึงช่าง (ยังไม่จ่ายงาน) — แอดมินก็แนบหลักฐานเคลมไม่ได้ และไม่ใช่ "ส่งปิดไปแล้ว" (ไม่มี code ให้แอปนับเป็นสำเร็จ)
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$AID/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=CLAIM_PART" -F "sparePartId=$PID")
echo "$R" | grep -q "ยังไม่ถึงขั้นปิดงาน — แนบหลักฐานเคลมไม่ได้" && [ "${R##* HTTP}" = "409" ] \
  && [ "$(echo "${R% HTTP*}" | J 'd.code||""')" = "" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$AID")" = "0" ] \
  && pass "ใบที่ยังไม่ถึงขั้นปิดงาน แนบหลักฐานเคลมไม่ได้แม้เป็นแอดมิน (409 \"ยังไม่ถึงขั้นปิดงาน\" ไม่มี code · ไม่มีแถว)" || fail "แนบก่อนถึงขั้นปิดงาน: $(echo $R | head -c 150)"

echo
echo "═══ ปิดงานสองชิ้น (อาการ 300 · เช็คอะไรบ้าง 600 ตัว) → ใบเคลม PDF หน้าเดียว"
# รูปอะไหล่เก่าที่ถูกแนบใหม่แทนก่อนกดส่ง (ถ่ายเบลอแล้วถ่ายใหม่) — ไม่ใช่หลักฐานที่ส่งไป ต้องลบเองได้ (ดูหัวข้อตีกลับ)
REPLACED=$(UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" | J 'd.id')
claim_files $PID; claim_files $PID2
SYM=$(TXT "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม " 300)
NOTE=$(TXT "วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย " 600)
R=$(CLOSE "[$(claim_json $PID "$SYM" "$NOTE"),$(claim_json $PID2 "$SYM" "$NOTE")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")" = "2" ] \
  && pass "ช่างปิดงานพร้อมเคลมสองชิ้น → รอตรวจเคลม (ฐานข้อมูล: ใบเคลมรอตรวจ 2 แถว)" || fail "ปิดงานสองชิ้น: $(echo $R | head -c 200)"
CA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
PDF $CA "$TMP/a.pdf"; PDF $CB "$TMP/b.pdf"
[ "$(PAGES "$TMP/a.pdf")|$(PAGES "$TMP/b.pdf")" = "1|1" ] && pdftotext "$TMP/a.pdf" - | NORM | grep -q "$(echo "ผู้ขอเคลม" | NORM)" \
  && pass "ใบเคลม PDF ของทั้งสองชิ้นจบในหน้าเดียว พร้อมช่องลายเซ็น" || fail "จำนวนหน้า PDF: $(PAGES "$TMP/a.pdf") / $(PAGES "$TMP/b.pdf")"

echo
echo "═══ รอตรวจเคลม: รอใคร · งานของฉัน · ส่งซ้ำ · แนบเพิ่ม"
G=$(GET $T "work-orders/$ID")
OPT=$(GET $A "work-orders/options" | J 'd.stages.find(s=>s.value==="CLAIM_REVIEW").actorLabel')
[ "$(echo "$G" | J 'd.stageActorLabel')|$OPT" = "Admin Spare Part|Admin Spare Part" ] \
  && pass "ขั้นตรวจเคลมรอ \"Admin Spare Part\" ทั้งในใบงานและแถบขั้นตอน (ไม่ใช่ \"แอดมิน\")" || fail "actorLabel: $(echo "$G" | J 'd.stageActorLabel') / $OPT"
[ "$(GET $T work-orders/my-day | J "const r=d.rows.find(x=>x.id===$ID); r ? r.done+'|'+r.status : 'missing'")" = "true|CLAIM_REVIEW" ] \
  && pass "งานของฉันยังส่ง done=true และ status=CLAIM_REVIEW (หน้าจอแยกขึ้น \"รอตรวจเคลม\" จาก status)" || fail "my-day: $(GET $T work-orders/my-day | head -c 200)"
NLOG=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLOSED'")
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"ส่งซ้ำ\",\"workerIds\":[$TID],\"parts\":$PARTS,\"claims\":[$(claim_json $PID "$SYM" "$NOTE")],\"claimNameplate\":$PLATE,\"claimCheck\":$CHECK}")
[ "$(echo "${R% HTTP*}" | J 'd.code')|${R##* HTTP}" = "CLOSE_ALREADY_SENT|409" ] && echo "$R" | grep -q "ปิดงานแล้ว กำลังรอ Admin Spare Part ตรวจเคลม" \
  && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID")|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLOSED'")" = "2|$NLOG" ] \
  && pass "ส่งปิดงานซ้ำตอนรอตรวจเคลม: 409 code CLOSE_ALREADY_SENT ฐานข้อมูลไม่เปลี่ยน (ใบเคลม 2 · ปิดงาน $NLOG)" || fail "ส่งซ้ำ: $(echo $R | head -c 200)"
# แอปนับ 409 นี้เป็น "ส่งสำเร็จ" เมื่อคนปิดคือตัวเอง — ใบงานต้องบอก id คนปิด (ชื่อซ้ำกันได้)
[ "$(GET $T "work-orders/$ID" | J 'd.closedById')" = "$TID" ] && [ "$(DB "select \"closedById\" from \"WorkOrder\" where id=$ID")" = "$TID" ] \
  && pass "ใบงานส่ง closedById = ช่างที่ปิด (ตรงฐานข้อมูล) ให้แอปเทียบว่าคำสั่งปิดรอบก่อนเป็นของตัวเอง" || fail "closedById: $(GET $T "work-orders/$ID" | J 'd.closedById')"
N0=$(NCLAIMFILES)
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=CLAIM_PART" -F "sparePartId=$PID")
echo "$R" | grep -q "ส่งตรวจเคลมแล้ว — แนบหลักฐานเคลมเพิ่มไม่ได้" && [ "${R##* HTTP}" = "409" ] && [ "$(NCLAIMFILES)" = "$N0" ] \
  && [ "$(echo "${R% HTTP*}" | J 'd.code')" = "CLOSE_ALREADY_SENT" ] \
  && pass "รอตรวจเคลมอยู่ แนบรูปอะไหล่เก่าเพิ่มไม่ได้ (409 code CLOSE_ALREADY_SENT · ไม่มีแถวในฐานข้อมูล)" || fail "แนบระหว่างรอตรวจ: $(echo $R | head -c 150)"
# ปิดพร้อมเคลมแล้วติ๊ก "อะไหล่ไม่ครบ" — ฟอร์มเปิดใบรออะไหล่หลังปิดสำเร็จ ตอนนั้นใบอยู่ที่รอตรวจเคลม (เดิมได้ 409 ทุกครั้ง)
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/follow-up" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"parts\":[{\"sparePartId\":$PID2,\"quantity\":1}]}")
CHILD=$(DB "select coalesce(max(id),0) from \"WorkOrder\" where \"parentId\"=$ID")
# ใบลูกลบก่อนใบแม่ — ลบใบแม่ก่อนก็ได้ (parentId เป็นค่าว่าง) แต่ใบลูกจะค้างในฐานข้อมูล
[ "$CHILD" != "0" ] && IDS="$CHILD $IDS"
[ "${R##* HTTP}" = "200" ] && [ "$CHILD" != "0" ] \
  && [ "$(DB "select status from \"WorkOrder\" where id=$CHILD")|$(DB "select status from \"WorkOrder\" where id=$ID")" = "PARTS_SOURCING|CLAIM_REVIEW" ] \
  && pass "รอตรวจเคลมอยู่ เปิดใบรออะไหล่ต่อได้ (ฐานข้อมูล: ใบลูกรอเช็คอะไหล่ · ใบนี้ยังรอตรวจเคลม)" || fail "เปิดใบรออะไหล่ตอนรอตรวจเคลม: $(echo $R | head -c 200)"

echo
echo "═══ ใบเคลม PDF ข้อความยาวสุด (อาการ 1000 · เช็คอะไรบ้าง 2000 ตัว)"
# ปิดงานรับยาวสุดเท่านี้ (zod ใน /close) — เขียนตรงลงแถวเพราะทดสอบแค่การจัดหน้า ไม่ใช่การปิดงาน
DB "update \"PartClaim\" set symptom='$(TXT "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม " 1000)', \"checkNote\"='$(TXT "วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย " 2000)' where id=$CB" >/dev/null
PDF $CB "$TMP/long.pdf"
pdftotext -layout "$TMP/long.pdf" - | NORM > "$TMP/long.txt"
LASTITEM=$(echo "$TS" | J 'd[d.length-1]' | NORM)
LAYOUT=$(node -e '
const t = require("fs").readFileSync(process.argv[1], "utf8");
const [item, sig, rcv, ev] = process.argv.slice(2);
const pages = t.split("\f"); if (pages[pages.length - 1] === "") pages.pop();
const last = pages.length - 1, all = pages.join("\f");
const pageOf = (i) => all.slice(0, i).split("\f").length - 1;
const once = (s) => all.indexOf(s) >= 0 && all.indexOf(s) === all.lastIndexOf(s);
const iItem = all.lastIndexOf(item), iSig = all.indexOf(sig), iRcv = all.indexOf(rcv), iEv = all.indexOf(ev);
const ok = once(sig) && once(rcv) && once(ev) && iItem >= 0 && iItem < iSig && iSig < iEv && iRcv < iEv
  && pageOf(iSig) === last && pageOf(iRcv) === last && pageOf(iEv) === last;
console.log(ok ? "ok " + pages.length : "bad pages=" + pages.length + " item@" + pageOf(iItem) + " sig@" + pageOf(iSig) + " ev@" + pageOf(iEv) + " order=" + [iItem, iSig, iEv].join(","));
' "$TMP/long.txt" "$LASTITEM" "$(echo "ผู้ขอเคลม" | NORM)" "$(echo "ผู้รับเคลม" | NORM)" "$(echo "หลักฐานที่แนบในระบบ" | NORM)")
[ "${LAYOUT%% *}" = "ok" ] \
  && pass "ข้อความยาวสุด: ช่องลายเซ็นทั้งสองฝั่งและบรรทัดหลักฐานอยู่หน้าสุดท้าย ต่อจากเนื้อหาสุดท้าย ไม่แตกข้ามหน้า (${LAYOUT#ok } หน้า)" \
  || fail "จัดหน้าข้อความยาว: $LAYOUT"

echo
echo "═══ ตีกลับแล้ว: ไฟล์ที่ส่งไปแล้วช่างลบไม่ได้ · ไฟล์ที่ยังไม่ได้ส่งลบได้"
POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่"}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || fail "เตรียม: ตีกลับแล้วใบไม่กลับมาที่ช่าง"
OLDPART=$(DB "select max(id) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_PART' and \"sparePartId\"=$PID")
R=$(curl -s -w ' HTTP%{http_code}' -X DELETE "localhost:4000/api/work-orders/$ID/attachments/$OLDPART" -H "$(H $T)")
echo "$R" | grep -q "ไฟล์นี้เป็นหลักฐานของใบเคลมที่ส่งไปแล้ว ลบไม่ได้" && [ "${R##* HTTP}" = "409" ] && [ "$(EXISTS $OLDPART)" = "1" ] \
  && [ "$(echo "${R% HTTP*}" | J 'd.code')" = "CLAIM_EVIDENCE_LOCKED" ] \
  && pass "ช่างลบรูปอะไหล่เก่าที่ส่งเคลมไปแล้วไม่ได้ แม้ใบกลับมาที่ช่าง (409 code CLAIM_EVIDENCE_LOCKED · ไฟล์ยังอยู่ในฐานข้อมูล)" || fail "ลบหลักฐานที่ส่งแล้ว: $(echo $R | head -c 150)"
[ -n "$REPLACED" ] && [ "$REPLACED" != "$OLDPART" ] && [ "$(DEL $T $REPLACED)" = "200" ] && [ "$(EXISTS $REPLACED)" = "0" ] \
  && pass "รูปอะไหล่เก่าที่ถูกแนบใหม่แทนก่อนส่ง (ไม่ได้ส่งไป) ช่างลบเองได้ (200 · หายจากฐานข้อมูล)" || fail "ลบไฟล์ที่ถูกแนบแทนไม่ได้: $REPLACED (ที่ส่งไป $OLDPART)"
PLATEID=$(DB "select (nameplate->>'photoId') from \"PartClaim\" where id=$CA")
[ -n "$PLATEID" ] && [ "$(DEL $T $PLATEID)" = "409" ] && [ "$(EXISTS $PLATEID)" = "1" ] \
  && pass "ช่างลบรูปป้ายรุ่นที่ผูกกับใบเคลมไม่ได้ (409 · ไฟล์ยังอยู่)" || fail "ลบรูปป้ายของใบเคลม: photoId=$PLATEID"
NEWPART=$(UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" | J 'd.id')
[ "$(DEL $T $NEWPART)" = "200" ] && [ "$(EXISTS $NEWPART)" = "0" ] \
  && pass "รูปที่แนบใหม่หลังถูกตีกลับ (ยังไม่ได้ส่ง) ช่างลบเองได้ (200 · หายจากฐานข้อมูล)" || fail "ลบไฟล์ที่ยังไม่ได้ส่งไม่ได้: $NEWPART"
OTHER=$(DB "select min(id) from \"SparePart\" where id not in ($PID,$PID2)")
LOOSE=$(UP image/png -F "role=CLAIM_PART" -F "sparePartId=$OTHER" | J 'd.id')
[ "$(DEL $T $LOOSE)" = "200" ] && [ "$(EXISTS $LOOSE)" = "0" ] \
  && pass "หลักฐานของอะไหล่ที่ไม่มีใบเคลม ช่างลบเองได้ (200)" || fail "ลบหลักฐานของชิ้นที่ไม่ได้เคลมไม่ได้: $LOOSE"

echo
echo "═══ ส่งใหม่หลังถูกตีกลับ → วันที่เปลี่ยนอะไหล่ = วันที่ส่งครั้งแรก"
# ให้รอบแรกเป็นของ 40 วันก่อน — วันที่ต้องต่างจากวันที่ส่งใหม่จนเห็นชัด
DB "update \"PartClaim\" set \"createdAt\"=\"createdAt\"-interval '40 days' where \"workOrderId\"=$ID" >/dev/null
R=$(CLOSE "[$(claim_json $PID "$SYM แก้ตามที่ตีกลับ" "$NOTE"),$(claim_json $PID2 "$SYM แก้ตามที่ตีกลับ" "$NOTE")]")
CA2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID and status='PENDING'")
FIRST=$(THDATE "$(CLAIM_MS $CA)" | NORM); SIGD=$(THDATE "$(CLAIM_MS $CA2)" | NORM)
PDF $CA2 "$TMP/r2.pdf"
pdftotext -layout "$TMP/r2.pdf" - | NORM > "$TMP/r2.txt"
LBL=$(echo "วันที่เปลี่ยนอะไหล่" | NORM); W=$(echo "วันที่" | NORM)
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$FIRST" != "$SIGD" ] \
  && grep -q "$LBL$FIRST" "$TMP/r2.txt" && grep -q "$W$SIGD" "$TMP/r2.txt" && ! grep -q "$W$FIRST" "$TMP/r2.txt" \
  && pass "ใบเคลมรอบที่ส่งใหม่: วันที่เปลี่ยนอะไหล่ = วันที่ส่งครั้งแรก · ลายเซ็นผู้ขอเคลม = วันที่ส่งใหม่" \
  || fail "วันที่ในใบเคลม: คาด $FIRST / $SIGD · $(grep -o "$LBL.\{0,24\}" "$TMP/r2.txt" | head -1)"
SYMID=$(DB "select max(id) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_SYMPTOM' and \"sparePartId\"=$PID")
[ "$(DEL $A $SYMID)" = "200" ] && [ "$(EXISTS $SYMID)" = "0" ] \
  && pass "แอดมินยังลบไฟล์ที่เป็นหลักฐานเคลมได้ (200)" || fail "แอดมินลบหลักฐานไม่ได้"

echo
echo "═══ ปิดแล้ว: ส่งซ้ำ · แนบเพิ่ม"
POST $PA "work-orders/$ID/claim-review" '{"approve":true}' >/dev/null
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"ส่งซ้ำ\",\"workerIds\":[$TID],\"parts\":$PARTS}")
CODE_=$(DB "select code from \"WorkOrder\" where id=$ID")
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "DONE" ] && [ "${R##* HTTP}" = "409" ] \
  && [ "$(echo "${R% HTTP*}" | J 'd.code+"|"+d.error')" = "CLOSE_ALREADY_SENT|$CODE_ ปิดงานแล้ว" ] \
  && pass "ส่งปิดงานใบที่ปิดแล้ว: 409 code CLOSE_ALREADY_SENT \"$CODE_ ปิดงานแล้ว\"" || fail "ปิดซ้ำใบที่ปิดแล้ว: $(echo $R | head -c 200)"
N0=$(NCLAIMFILES)
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=video/mp4" -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID")
echo "$R" | grep -q "ปิดแล้ว — แนบหลักฐานเคลมไม่ได้" && [ "${R##* HTTP}" = "409" ] && [ "$(NCLAIMFILES)" = "$N0" ] \
  && [ "$(echo "${R% HTTP*}" | J 'd.code')" = "CLOSE_ALREADY_SENT" ] \
  && pass "ใบที่ปิดแล้ว แนบหลักฐานเคลมไม่ได้แม้เป็นแอดมิน (409 code CLOSE_ALREADY_SENT · ไม่มีแถว)" || fail "แนบหลังปิด: $(echo $R | head -c 150)"

echo
echo "═══ ทะเบียนเครื่องมีแค่ยี่ห้อ (กล่องป้ายรุ่นของแอป)"
# รายการยี่ห้อของแอปต้องตามทัน MACHINE_MODELS ของเซิร์ฟเวอร์ — ยี่ห้อที่หลุด (เช่น Haier) จะขึ้น "ไม่ตรงทะเบียน (Haier)"
# ทุกใบเคลม · โหลดไฟล์ .ts ทั้งสองฝั่งด้วย typescript ของ backend (ไม่มี import ทั้งคู่)
BRAND=$(cd "$SP/../backend" && node -e '
const ts = require("typescript"), fs = require("fs");
const load = (f) => { const m = { exports: {} };
  new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(f, "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText)(m, m.exports, require);
  return m.exports; };
const { isBrandOnly } = load("../mobile/src/utils/nameplate.ts");
const { MACHINE_MODELS } = load("src/utils/constants.ts");
const brands = [...MACHINE_MODELS, "HB - Huebsch", "huebsch (tc)", "Speed Queen", "Primus", "UniMac", "IPSO", "Alliance"];
const models = ["HL055LWHPRXG6W0000", "HL055L", "Huebsch HL055L", ""];
const bad = [...brands.filter((b) => !isBrandOnly(b)).map((b) => "ยี่ห้อ " + b), ...models.filter((m) => isBrandOnly(m)).map((m) => "รุ่น " + m)];
console.log(bad.length ? bad.join(", ") : "ok " + brands.length);
' 2>&1) || true
[ "${BRAND%% *}" = "ok" ] \
  && pass "isBrandOnly รู้จักยี่ห้อครบ (MACHINE_MODELS ของเซิร์ฟเวอร์ + ตระกูล Alliance + \"HB - \") และไม่นับรุ่นเต็มเป็นยี่ห้อ (${BRAND#ok } ชื่อ)" \
  || fail "isBrandOnly: $(echo "$BRAND" | head -c 200)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
