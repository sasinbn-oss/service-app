#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 4 — ตีกลับแบบชี้ช่อง (ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน)
#   · POST claim-review decisions[].flags: ช่องของชิ้นเก็บใน PartClaim.reviewFlags · ไม่พิมพ์เหตุผล = เขียนชื่อช่องแทน ·
#     ช่องที่ไม่รู้จัก / เครื่องนี้ไม่มี (ข้อมูลป้ายรุ่นของ Oasis บนเครื่อง Huebsch) → 400 ไม่รู้จัก
#   · ช่องของเครื่อง (รุ่น · วิดีโอ Error …) = ตีกลับทั้งใบ: มีชิ้นผ่านในคำขอเดียวกัน → 400 · ทุกแถวที่ตีกลับติดช่องนั้น ·
#     ชิ้นที่ถูกพลิกเพราะข้อมูลเครื่องไม่มีช่องของชิ้นค้าง · ชิ้นที่ปิดเคลมคงปิดเคลม (ช่างส่งใหม่ก็ไม่เกิดแถวใหม่) ·
#     ชิ้นใดผ่านแล้วในงานซ่อมครั้งนี้ ข้อมูลเครื่องล็อก → ชี้ช่องของเครื่อง 400 ฐานข้อมูลไม่เปลี่ยน
#   · ช่างส่งใหม่: ทุกช่องที่ถูกชี้ต้องแก้ หรือตอบ "ค่าเดิมถูกแล้ว" ทีละช่อง (claims[].keep · claimMachineKeep) →
#     ไม่งั้น 400 "เคลม {ชิ้น}: ยังไม่ได้แก้ {ช่อง}" / "ข้อมูลเครื่อง: ยังไม่ได้แก้ {ช่อง}" · รุ่นแก้ได้ด้วยค่าใหม่ หรือรูปป้ายใหม่ ·
#     วิดีโอ Error แก้ได้ด้วยวิดีโอใหม่ของชิ้นไหนก็ได้ · คำอธิบายอยู่ใน meta.keep ของประวัติส่งเคลม + detail.claimKeep
#   · ตีกลับแบบเดิม (มีแต่ข้อความ ไม่มีช่อง) ยังใช้กติกาก้อน 1 "แก้อะไรสักอย่าง"
#   · ช่องที่เหลือแก้ทีละแบบ: รูปอะไหล่เก่าต้องเป็นของชิ้นนั้น (แนบที่ชิ้นอื่นไม่นับ) · อาการ = ข้อความเปลี่ยน ·
#     ช่างเข้าเช็คอะไรบ้าง = ข้อเช็คตาม Error เปลี่ยนก็นับ · Serial = ค่าเปลี่ยน · Error ที่เครื่องขึ้น = รหัสเปลี่ยน ·
#     รูปอาการ = รูปใหม่ของชิ้นไหนก็ได้ (ข้อมูลป้ายรุ่นของ Oasis ไม่ได้ทดสอบที่นี่ — ชุดนี้ใช้เครื่อง Huebsch)
#   · งานของฉัน: claim.fields (จำนวนช่อง) · needsSite (มีช่องที่เป็นไฟล์ = ต้องกลับไปหน้าเครื่อง · ข้อความอย่างเดียว = ไม่ต้อง ·
#     ตีกลับแบบเดิม = ไม่รู้) · whole (ชื่อช่องของเครื่อง) · แถบสถานะตีกลับทั้งใบ = "ทั้งใบ" (ตรงกับหน้าใบงาน) ·
#     options ส่งรายการช่อง/เหตุผลด่วน/เหตุผลปิดเคลม
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"

TMP=$(mktemp -d)
claim_extra_cleanup() { rm -rf "${TMP:?}"; }

ST() { DB "select status from \"WorkOrder\" where id=$ID"; }
NROWS() { DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID ${1:+and \"sparePartId\"=$1}"; }
# แถวล่าสุดของอะไหล่ $1 ในใบนี้
LATEST() { DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$1 order by \"createdAt\" desc, id desc limit 1"; }
FLAGS() { DB "select \"reviewFlags\"::text from \"PartClaim\" where id=$1"; }
ROWST() { DB "select status from \"PartClaim\" where id=$1"; }
PENDING() { DB "select coalesce(string_agg(status, ',' order by id), '') from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'"; }
LASTLOG() { DB "select action||'¦'||coalesce(note,'') from \"WorkOrderLog\" where \"workOrderId\"=$ID order by id desc limit 1"; }
SUBMITLOG() { DB "select note||'¦'||coalesce((meta->'keep')::text,'-') from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SUBMITTED' order by id desc limit 1"; }
# POST แล้วเก็บคำตอบไว้ที่ $TMP/body — พิมพ์รหัส HTTP · ERR = ข้อความ error ในคำตอบนั้น
PC() { curl -s -o "$TMP/body" -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
ERR() { J 'typeof d.error==="string"?d.error:JSON.stringify(d.error)' < "$TMP/body"; }
# คำตัดสินหนึ่งชิ้น — $1 claimId · $2 APPROVE/REJECT/DECLINE · $3 ช่อง (JSON array · ว่าง = ไม่ส่ง) · $4 เหตุผล
DEC() { echo "{\"claimId\":$1,\"verdict\":\"$2\"${3:+,\"flags\":$3}${4:+,\"reason\":\"$4\"}}"; }
REVIEW() { local IFS=,; PC "$PA" "work-orders/$ID/claim-review" "{\"decisions\":[$*]}"; }
# ใบเคลมหนึ่งชิ้น — $1 อะไหล่ · $2 รหัสตัวเสีย (ไม่ส่ง = OLD-$1) · $3 keep (JSON array · ไม่ส่ง = ไม่มี)
CJ() { echo "{\"sparePartId\":$1,\"brokenPartCode\":\"${2:-OLD-$1}\",\"symptom\":\"ประตูล็อกไม่ลง ขึ้น Error dL\",\"checkNote\":\"วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย\",\"troubleshooting\":$TS${3:+,\"keep\":$3}}"; }
# ช่างปิดงาน — $1 claims · $2 ป้ายรุ่น (ไม่ส่ง = $PLATE) · $3 ส่วนต่อท้ายของ body (เช่น claimMachineKeep)
CLOSEX() { PC "$T" "work-orders/$ID/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนอะไหล่ ทดสอบแล้วปกติ\",\"workerIds\":[$TID],\"parts\":$PARTS,\"claims\":$1,\"claimNameplate\":${2:-$PLATE},\"claimCheck\":$CHECK${3:+,$3}}"; }
# ป้ายที่พิมพ์เอง — $1 รุ่น · $2 Serial · กดยืนยันทีละช่องแล้ว (เคลมก้อน 5 บังคับ แม้พิมพ์เอง)
plate() { echo "{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"$1\",\"source\":\"HAND\",\"confirmed\":true},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"${2:-2402600330}\",\"source\":\"HAND\",\"confirmed\":true}]}"; }
# ใบเคลมที่อาการ/เช็คอะไรบ้างต่างจากค่าตั้งต้น — $1 อะไหล่ · $2 อาการ · $3 เช็คอะไรบ้าง (ไม่ส่ง = ค่าตั้งต้นของ CJ)
CJS() { echo "{\"sparePartId\":$1,\"brokenPartCode\":\"OLD-$1\",\"symptom\":\"$2\",\"checkNote\":\"${3:-วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย}\",\"troubleshooting\":$TS}"; }
MYDAY() { GET $T work-orders/my-day | J "const r=d.rows.find(x=>x.id===$ID); if(!r) 'missing'; else { const c=r.claim; $1 }"; }
MYDAY_SUM='[c.state,c.fields,String(c.needsSite),JSON.stringify(c.whole)].join("|")'

echo "═══ ตัวเลือกจาก /work-orders/options"
OPT=$(GET $T work-orders/options)
[ "$(echo "$OPT" | J 'd.claimReviewFlags.map(f=>f.key+":"+f.scope[0]+(f.site?"!":"")).join(",")')" = "CLAIM_PART:P!,BROKEN_CODE:P,SYMPTOM:P,CHECKS:P,CLAIM_CHECK_VIDEO:P!,MODEL:M,SERIAL:M,PLATE_OTHER:M,ERROR_CODE:M,CLAIM_ERROR_VIDEO:M!,CLAIM_SYMPTOM:M!" ] \
  && [ "$(echo "$OPT" | J 'd.claimReviewFlags.map(f=>f.label).join("|")')" = "รูปอะไหล่เก่า|รหัสอะไหล่ตัวที่เสีย|อาการ/สาเหตุ|ช่างเข้าเช็คอะไรบ้าง|วิดีโอการตรวจเช็ค|รุ่น|Serial|ข้อมูลป้ายรุ่น|Error ที่เครื่องขึ้น|วิดีโอ Error|รูปอาการ" ] \
  && [ "$(echo "$OPT" | J 'd.claimQuickReasons.map(q=>q.text+">"+q.flag).join("|")')" = "รูปอะไหล่เก่าไม่เห็นสติกเกอร์รหัส>CLAIM_PART|วิดีโอไม่เห็นรหัส Error บนจอ>CLAIM_ERROR_VIDEO|รหัสตัวเสียไม่ตรงกับรูป>BROKEN_CODE|ภาพมืด/เบลอ>CLAIM_PART|ป้ายรุ่นไม่ตรงกับรูป>MODEL" ] \
  && [ "$(echo "$OPT" | J 'd.claimDeclineReasons.join("|")')" = "หมดประกัน|ไม่ใช่ชิ้นในประกัน|อื่น ๆ" ] \
  && pass "options: 11 ช่อง (ชิ้น 5 · เครื่อง 6 · ไฟล์ = ต้องไปหน้าเครื่อง) ตามตัวอย่าง · เหตุผลด่วน 5 ข้อพร้อมช่องที่ติ๊กให้ · เหตุผลปิดเคลม" \
  || fail "options: $(echo "$OPT" | J 'JSON.stringify([d.claimReviewFlags,d.claimQuickReasons])' | head -c 400)"

echo
echo "═══ ใบที่ 1: ก. ผ่าน · ข. ตีกลับชี้ช่องของชิ้น"
claim_order 2
claim_files $PID; claim_files $PID2
PNAME=$(DB "select name from \"SparePart\" where id=$PID")
PNAME2=$(DB "select name from \"SparePart\" where id=$PID2")
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]")
[ "$C" = "200" ] || fail "เตรียม: ส่งเคลมไม่ผ่าน ($(head -c 200 "$TMP/body"))"
CA=$(LATEST $PID); CB=$(LATEST $PID2)
[ "$(GET $PA "work-orders/$ID" | J 'd.claimReviewFlags.map(f=>f.key+"="+f.label).join(",")')" = "CLAIM_PART=รูปอะไหล่เก่า,BROKEN_CODE=รหัสอะไหล่ตัวที่เสีย,SYMPTOM=อาการ/สาเหตุ,CHECKS=ช่างเข้าเช็คอะไรบ้าง,CLAIM_CHECK_VIDEO=วิดีโอการตรวจเช็ค,MODEL=รุ่น,SERIAL=Serial,ERROR_CODE=Error ที่เครื่องขึ้น,CLAIM_ERROR_VIDEO=วิดีโอ Error,CLAIM_SYMPTOM=รูปอาการ" ] \
  && pass "รายละเอียดใบงาน (Huebsch): claimReviewFlags มี Serial + Error ที่เครื่องขึ้น ไม่มีข้อมูลป้ายรุ่น (ของ Oasis)" \
  || fail "claimReviewFlags: $(GET $PA "work-orders/$ID" | J 'JSON.stringify(d.claimReviewFlags)' | head -c 300)"

C1=$(REVIEW "$(DEC $CA APPROVE)" "$(DEC $CB REJECT '["NOPE"]' x)"); E1=$(ERR)
C2=$(REVIEW "$(DEC $CA APPROVE)" "$(DEC $CB REJECT '["PLATE_OTHER"]')"); E2=$(ERR)
[ "$C1|$E1" = "400|ไม่รู้จักช่องที่ให้แก้ “NOPE”" ] && [ "$C2|$E2" = "400|ไม่รู้จักช่องที่ให้แก้ “PLATE_OTHER”" ] \
  && [ "$(ST)|$(PENDING)" = "CLAIM_REVIEW|PENDING,PENDING" ] \
  && pass "ช่องที่ไม่รู้จัก · ช่องที่เครื่องนี้ไม่มี (ข้อมูลป้ายรุ่นของ Oasis บน Huebsch) = 400 ไม่รู้จัก · ฐานข้อมูลไม่เปลี่ยน" \
  || fail "ไม่รู้จัก: $C1 $E1 · $C2 $E2 · $(ST) $(PENDING)"
C1=$(REVIEW "$(DEC $CA APPROVE)" "$(DEC $CB REJECT '["MODEL"]')"); E1=$(ERR)
[ "$C1|$E1" = "400|ข้อมูลเครื่องใช้ร่วมทุกชิ้น — ตีกลับข้อมูลเครื่องแล้วต้องตีกลับทุกชิ้นที่ยังไม่ได้ปิดเคลม" ] \
  && [ "$(ST)|$(PENDING)" = "CLAIM_REVIEW|PENDING,PENDING" ] \
  && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID and (\"reviewedAt\" is not null or \"reviewFlags\"<>'{}')")" = "0" ] \
  && pass "ชี้รุ่น (ข้อมูลเครื่อง) ที่ ข. ขณะ ก. ผ่านในคำขอเดียวกัน = 400 \"$E1\" · ฐานข้อมูลไม่เปลี่ยน" \
  || fail "เครื่อง+ผ่าน: $C1 $E1 · $(ST) $(PENDING)"

C=$(REVIEW "$(DEC $CA APPROVE)" "$(DEC $CB REJECT '["CLAIM_CHECK_VIDEO","BROKEN_CODE","BROKEN_CODE"]')")
[ "$C" = "200" ] && [ "$(FLAGS $CB)" = "{BROKEN_CODE,CLAIM_CHECK_VIDEO}" ] && [ "$(FLAGS $CA)" = "{}" ] \
  && [ "$(DB "select status||'|'||\"rejectReason\" from \"PartClaim\" where id=$CB")" = "REJECTED|รหัสอะไหล่ตัวที่เสีย · วิดีโอการตรวจเช็ค ต้องแก้" ] \
  && [ "$(ROWST $CA)|$(ST)" = "APPROVED|IN_PROGRESS" ] \
  && pass "ก. ผ่าน · ข. ตีกลับชี้ 2 ช่อง → reviewFlags เก็บเรียงตามรายการ ไม่ซ้ำ · ไม่พิมพ์เหตุผล = เขียน \"รหัสอะไหล่ตัวที่เสีย · วิดีโอการตรวจเช็ค ต้องแก้\" (ฐานข้อมูล)" \
  || fail "ชี้ช่องของชิ้น: $C $(head -c 200 "$TMP/body") · $(FLAGS $CB) · $(DB "select status||'|'||coalesce(\"rejectReason\",'-') from \"PartClaim\" where id=$CB")"
[ "$(LASTLOG)" = "CLAIM_REJECTED¦ผ่าน $PNAME · ตีกลับ $PNAME2 (ต้องแก้: รหัสอะไหล่ตัวที่เสีย · วิดีโอการตรวจเช็ค)" ] \
  && pass "ประวัติ: \"ผ่าน $PNAME · ตีกลับ $PNAME2 (ต้องแก้: รหัสอะไหล่ตัวที่เสีย · วิดีโอการตรวจเช็ค)\"" || fail "ประวัติ: $(LASTLOG)"
[ "$(GET $T "work-orders/$ID" | J "d.claims.find(c=>c.id===$CB).reviewFlags.join(',')")" = "BROKEN_CODE,CLAIM_CHECK_VIDEO" ] \
  && [ "$(MYDAY "$MYDAY_SUM")" = "REJECTED|2|true|null" ] \
  && [ "$(MYDAY 'c.reasons.map(x=>x.partLabel+":"+x.fieldLabels.join("+")).join(",")')" = "$PNAME2:รหัสอะไหล่ตัวที่เสีย+วิดีโอการตรวจเช็ค" ] \
  && pass "รายละเอียดใบงาน claims[].reviewFlags · งานของฉัน: ต้องแก้ 2 ช่อง · ต้องกลับไปหน้าเครื่อง (มีวิดีโอ) · ไม่ใช่ทั้งใบ · ช่องต่อชิ้นใน reasons" \
  || fail "detail/my-day: $(MYDAY 'JSON.stringify(c)' | head -c 400)"

echo
echo "═══ ช่างส่งใหม่: ทุกช่องที่ถูกชี้ต้องแก้"
N0=$(NROWS)
UP video/mp4 -F role=CLAIM_CHECK_VIDEO -F sparePartId=$PID2 >/dev/null
C=$(CLOSEX "[$(CJ $PID2)]"); E=$(ERR)
[ "$C|$E" = "400|เคลม $PNAME2: ยังไม่ได้แก้ รหัสอะไหล่ตัวที่เสีย" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "แนบวิดีโอใหม่อย่างเดียว (รหัสตัวเสียยังเหมือนเดิม) = 400 \"$E\" · ใบไม่ขยับ ไม่มีแถวใหม่ (ฐานข้อมูล)" \
  || fail "แก้ไม่ครบ: $C $E · $(ST) $(NROWS)"
C=$(CLOSEX "[$(CJ $PID2 NEW-$PID2)]")
CB2=$(LATEST $PID2)
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] && [ "$CB2" != "$CB" ] && [ "$(FLAGS $CB2)" = "{}" ] && [ "$(NROWS $PID)" = "1" ] \
  && [ "$(DB "select \"brokenPartCode\" from \"PartClaim\" where id=$CB2")" = "NEW-$PID2" ] \
  && pass "วิดีโอใหม่ + แก้รหัสตัวเสีย → ส่งได้ รอตรวจ · แถวใหม่ของ ข. ไม่มีช่องค้าง · ก. ที่ผ่านแล้วไม่เกิดแถวใหม่ (ฐานข้อมูล)" \
  || fail "แก้ครบ: $C $(head -c 200 "$TMP/body") · $(ST)"

C1=$(REVIEW "$(DEC $CB2 REJECT '["MODEL"]')"); E1=$(ERR)
[ "$C1|$E1" = "400|ข้อมูลเครื่องล็อกไว้พร้อม $PNAME ที่ผ่านแล้ว — ตีกลับได้เฉพาะช่องของชิ้น" ] \
  && [ "$(ROWST $CB2)|$(FLAGS $CB2)|$(ST)" = "PENDING|{}|CLAIM_REVIEW" ] \
  && pass "ก. ผ่านไปรอบก่อน → ชี้รุ่นที่ ข. = 400 \"ข้อมูลเครื่องล็อกไว้พร้อม $PNAME ที่ผ่านแล้ว…\" · ฐานข้อมูลไม่เปลี่ยน" \
  || fail "ล็อกเครื่อง: $C1 $E1 · $(ROWST $CB2) $(FLAGS $CB2) $(ST)"

C=$(REVIEW "$(DEC $CB2 REJECT '["BROKEN_CODE","SYMPTOM"]' "รหัสบนสติกเกอร์ไม่ใช่ตัวนี้")")
[ "$C" = "200" ] && [ "$(DB "select \"rejectReason\" from \"PartClaim\" where id=$CB2")" = "รหัสบนสติกเกอร์ไม่ใช่ตัวนี้" ] \
  && [ "$(MYDAY "$MYDAY_SUM")" = "REJECTED|2|false|null" ] \
  && pass "ตีกลับชี้เฉพาะช่องข้อความ (+ พิมพ์เหตุผลเอง เก็บตามที่พิมพ์) → งานของฉัน needsSite=false (แก้จากมือถือได้ ไม่ต้องไปร้าน)" \
  || fail "ข้อความอย่างเดียว: $C · $(MYDAY 'JSON.stringify(c)' | head -c 300)"
C1=$(CLOSEX "[$(CJ $PID2 NEW-$PID2 "[{\"flag\":\"BROKEN_CODE\",\"note\":\"รหัสตรงกับสติกเกอร์ ดูรูปที่ 2\"}]")]"); E1=$(ERR)
C2=$(CLOSEX "[$(CJ $PID2 NEW-$PID2 "[{\"flag\":\"BROKEN_CODE\",\"note\":\"รหัสตรงกับสติกเกอร์\"},{\"flag\":\"SYMPTOM\",\"note\":\"อาการตามใบแจ้ง\"}]")]" "" "\"claimMachineKeep\":[{\"flag\":\"BROKEN_CODE\",\"note\":\"ผิดที่\"}]"); E2=$(ERR)
[ "$C1|$E1" = "400|เคลม $PNAME2: ยังไม่ได้แก้ อาการ/สาเหตุ" ] && [ "$C2|$E2" = "400|ไม่รู้จักช่องที่ให้แก้ “BROKEN_CODE”" ] && [ "$(ST)" = "IN_PROGRESS" ] \
  && pass "ตอบค่าเดิมถูกแล้วแค่ช่องเดียวจากสอง = 400 บอกช่องที่เหลือ · ช่องของชิ้นใน claimMachineKeep = 400 ไม่รู้จัก" \
  || fail "keep ไม่ครบ: $C1 $E1 · $C2 $E2"
KNOTE="รหัสตรงกับสติกเกอร์ ดูรูปที่ 2"
C=$(CLOSEX "[$(CJ $PID2 NEW-$PID2 "[{\"flag\":\"BROKEN_CODE\",\"note\":\" $KNOTE \"},{\"flag\":\"SYMPTOM\",\"note\":\"อาการตามใบแจ้งจริง\"}]")]")
LOG=$(SUBMITLOG)
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && echo "${LOG%%¦*}" | grep -qF "$PNAME2 ยืนยันค่าเดิม (รหัสอะไหล่ตัวที่เสีย): $KNOTE" \
  && [ "${LOG#*¦}" = "[{\"flag\": \"BROKEN_CODE\", \"note\": \"$KNOTE\", \"sparePartId\": $PID2}, {\"flag\": \"SYMPTOM\", \"note\": \"อาการตามใบแจ้งจริง\", \"sparePartId\": $PID2}]" ] \
  && pass "ตอบค่าเดิมถูกแล้วครบทุกช่อง (ไม่แก้ค่า) → ส่งได้ · ประวัติ: \"$PNAME2 ยืนยันค่าเดิม (รหัสอะไหล่ตัวที่เสีย): …\" + meta.keep ทีละช่อง (ฐานข้อมูล)" \
  || fail "keep ครบ: $C $(head -c 200 "$TMP/body") · $LOG"
[ "$(GET $PA "work-orders/$ID" | J 'd.claimKeep.map(k=>k.sparePartId+":"+k.flag+":"+k.note).join(",")')" = "$PID2:BROKEN_CODE:$KNOTE,$PID2:SYMPTOM:อาการตามใบแจ้งจริง" ] \
  && pass "รายละเอียดใบงาน claimKeep = คำอธิบายของการส่งครั้งล่าสุด (ชิ้น · ช่อง · ข้อความ) ตรงกับ meta.keep" \
  || fail "claimKeep: $(GET $PA "work-orders/$ID" | J 'JSON.stringify(d.claimKeep)')"

echo
echo "═══ ใบที่ 2: ตีกลับทั้งใบ (ข้อมูลเครื่อง)"
claim_order 2
claim_files $PID; claim_files $PID2
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]")
[ "$C" = "200" ] || fail "เตรียม: ส่งเคลมใบที่ 2 ไม่ผ่าน ($(head -c 200 "$TMP/body"))"
CA=$(LATEST $PID); CB=$(LATEST $PID2)
C=$(REVIEW "$(DEC $CA REJECT '["MODEL","CLAIM_PART"]' "ภาพมืด/เบลอ")" "$(DEC $CB REJECT '["MODEL"]')")
[ "$C" = "200" ] && [ "$(FLAGS $CA)" = "{CLAIM_PART,MODEL}" ] && [ "$(FLAGS $CB)" = "{MODEL}" ] \
  && [ "$(DB "select \"rejectReason\" from \"PartClaim\" where id=$CB")" = "ทั้งใบ (ข้อมูลเครื่อง) — รุ่น ต้องแก้" ] \
  && [ "$(DB "select \"rejectReason\" from \"PartClaim\" where id=$CA")" = "ภาพมืด/เบลอ" ] \
  && pass "ตีกลับทั้งใบ: ทั้งสองแถวติด MODEL · ชิ้นที่ถูกพลิก (ข.) ไม่มีช่องของชิ้นค้าง เหตุผล \"ทั้งใบ (ข้อมูลเครื่อง) — รุ่น ต้องแก้\" (ฐานข้อมูล)" \
  || fail "ทั้งใบ: $C $(head -c 200 "$TMP/body") · $(FLAGS $CA) $(FLAGS $CB)"
[ "$(LASTLOG)" = "CLAIM_REJECTED¦ตีกลับทั้งใบ (ข้อมูลเครื่อง: รุ่น) · ตีกลับ $PNAME: ภาพมืด/เบลอ (ต้องแก้: รูปอะไหล่เก่า) · ตีกลับ $PNAME2" ] \
  && [ "$(MYDAY "$MYDAY_SUM")" = "REJECTED|2|true|[\"รุ่น\"]" ] \
  && pass "ประวัติขึ้นต้น \"ตีกลับทั้งใบ (ข้อมูลเครื่อง: รุ่น)\" · งานของฉัน: 2 ช่อง (รูปอะไหล่เก่า + รุ่นนับครั้งเดียว) · ต้องไปหน้าเครื่อง · whole=[รุ่น]" \
  || fail "ประวัติ/my-day ทั้งใบ: $(LASTLOG) · $(MYDAY "$MYDAY_SUM")"
# การ์ดของช่างอ่านแถบสถานะจากเซิร์ฟเวอร์ หน้าใบงาน/หน้าตรวจคิดเอง — ตีกลับครั้งเดียวกันต้องเขียนแบบเดียวกัน ("ทั้งใบ" แบบตัวอย่าง)
TRAIL=$(MYDAY 'c.trail.filter(e=>e.k==="reject").map(e=>e.what).join(",")')
[ "$TRAIL" = "ทั้งใบ" ] \
  && pass "แถบสถานะบนการ์ดงานของฉัน: ตีกลับทั้งใบ = \"ตีกลับ … (ทั้งใบ · …)\" ไม่ไล่ชื่อทุกชิ้น (ตรงกับหน้าใบงาน)" \
  || fail "แถบสถานะทั้งใบ: $TRAIL"
N0=$(NROWS)
UP image/png -F role=CLAIM_PART -F sparePartId=$PID >/dev/null
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]"); E=$(ERR)
[ "$C|$E" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ รุ่น" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "แนบรูปอะไหล่เก่าใหม่แต่รุ่นยังเหมือนเดิม = 400 \"$E\" · ใบไม่ขยับ (ฐานข้อมูล)" || fail "รุ่นไม่แก้: $C $E"
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)")
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && [ "$(DB "select string_agg(nameplate->'fields'->0->>'value', ',') from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")" = "HL055LX,HL055LX" ] \
  && pass "แก้ค่ารุ่น → ส่งได้ทั้งสองชิ้น · แถวใหม่ใช้รุ่นใหม่ (ฐานข้อมูล)" || fail "แก้รุ่น: $C $(head -c 200 "$TMP/body")"

CA=$(LATEST $PID); CB=$(LATEST $PID2)
C=$(REVIEW "$(DEC $CA REJECT '["MODEL"]')" "$(DEC $CB REJECT '["MODEL"]')")
[ "$C" = "200" ] && [ "$(FLAGS $CA)|$(FLAGS $CB)" = "{MODEL}|{MODEL}" ] || fail "เตรียม: ตีกลับรุ่นรอบ 3 ($C)"
C1=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)"); E1=$(ERR)
UP image/png -F role=NAMEPLATE >/dev/null
C2=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)")
[ "$C1|$E1" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ รุ่น" ] && [ "$C2" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && pass "ตีกลับรุ่นทั้งสองชิ้น (ไม่มีเหตุผล) → ส่งค่าเดิม = 400 · ถ่ายรูปป้ายรุ่นใหม่ (ค่าเดิม) → ส่งได้" || fail "รูปป้ายใหม่: $C1 $E1 · $C2 $(head -c 200 "$TMP/body")"

CA=$(LATEST $PID); CB=$(LATEST $PID2)
REVIEW "$(DEC $CA REJECT '["MODEL"]')" "$(DEC $CB REJECT '["MODEL"]')" >/dev/null
MNOTE="รุ่นตรงกับป้ายแล้ว ดูรูปป้ายรอบก่อน"
C1=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)" "\"claimMachineKeep\":[{\"flag\":\"MODEL\",\"note\":\"ok\"}]"); E1=$(ERR)
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)" "\"claimMachineKeep\":[{\"flag\":\"MODEL\",\"note\":\"$MNOTE\"}]")
LOG=$(SUBMITLOG)
[ "$C1|$E1" = "400|คำอธิบาย “ค่าเดิมถูกแล้ว” ต้องยาว 3–300 ตัวอักษร" ] && [ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && echo "${LOG%%¦*}" | grep -qF "ข้อมูลเครื่อง ยืนยันค่าเดิม (รุ่น): $MNOTE" \
  && [ "${LOG#*¦}" = "[{\"flag\": \"MODEL\", \"note\": \"$MNOTE\", \"sparePartId\": null}]" ] \
  && [ "$(GET $PA "work-orders/$ID" | J 'd.claimKeep.map(k=>k.sparePartId+":"+k.flag).join(",")')" = "null:MODEL" ] \
  && pass "รุ่นตอบด้วย claimMachineKeep (สั้นไป = 400) → ส่งได้ · ประวัติ \"ข้อมูลเครื่อง ยืนยันค่าเดิม (รุ่น): …\" · meta.keep / claimKeep ชิ้นว่าง (ฐานข้อมูล)" \
  || fail "machine keep: $C1 $E1 · $C $(head -c 200 "$TMP/body") · $LOG"

CA=$(LATEST $PID); CB=$(LATEST $PID2)
REVIEW "$(DEC $CA REJECT '["CLAIM_ERROR_VIDEO"]')" "$(DEC $CB REJECT '["CLAIM_ERROR_VIDEO"]')" >/dev/null
[ "$(MYDAY "$MYDAY_SUM")" = "REJECTED|1|true|[\"วิดีโอ Error\"]" ] \
  && pass "ตีกลับวิดีโอ Error ทั้งใบ → งานของฉัน: 1 ช่อง · ต้องกลับไปหน้าเครื่อง · whole=[วิดีโอ Error]" || fail "my-day วิดีโอ: $(MYDAY "$MYDAY_SUM")"
C1=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)"); E1=$(ERR)
UP video/mp4 -F role=CLAIM_ERROR_VIDEO -F sparePartId=$PID2 >/dev/null
C2=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LX)")
[ "$C1|$E1" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ วิดีโอ Error" ] && [ "$C2" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && pass "วิดีโอ Error: ส่งโดยไม่แนบใหม่ = 400 · แนบวิดีโอใหม่ที่ชิ้น ข. ชิ้นเดียว → ส่งได้ทั้งสองชิ้น (ข้อมูลเครื่องใช้ร่วม)" \
  || fail "วิดีโอ Error: $C1 $E1 · $C2 $(head -c 200 "$TMP/body")"

CA=$(LATEST $PID); CB=$(LATEST $PID2)
C=$(REVIEW "$(DEC $CA REJECT '["MODEL"]')" "$(DEC $CB DECLINE "" "หมดประกัน")")
[ "$C" = "200" ] && [ "$(ROWST $CA)|$(FLAGS $CA)|$(ROWST $CB)|$(FLAGS $CB)|$(ST)" = "REJECTED|{MODEL}|DECLINED|{}|IN_PROGRESS" ] \
  || fail "เตรียม: ตีกลับ ก. ทั้งใบ + ปิดเคลม ข. ($C $(head -c 200 "$TMP/body"))"
NB=$(NROWS $PID2)
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]" "$(plate HL055LY)")
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] && [ "$(NROWS $PID2)" = "$NB" ] && [ "$(ROWST $CB)" = "DECLINED" ] \
  && [ "$(LATEST $PID2)" = "$CB" ] && [ "$(ROWST "$(LATEST $PID)")" = "PENDING" ] \
  && pass "ตีกลับ ก. ด้วยรุ่น + ปิดเคลม ข. → 200 · ช่างส่งใหม่พร้อม ข.: ข. ยังปิดเคลม ไม่มีแถวใหม่ · ก. รอตรวจ (ฐานข้อมูล)" \
  || fail "ปิดเคลมคงอยู่: $C $(head -c 200 "$TMP/body") · $(NROWS $PID2) vs $NB · $(ROWST $CB)"

echo
echo "═══ ใบที่ 3: ตีกลับแบบเดิม (ข้อความอย่างเดียว ไม่มีช่อง)"
claim_order 1
claim_files $PID
C=$(CLOSEX "[$(CJ $PID)]")
[ "$C" = "200" ] || fail "เตรียม: ส่งเคลมใบที่ 3 ไม่ผ่าน"
CA=$(LATEST $PID)
C=$(REVIEW "$(DEC $CA REJECT "" "วิดีโอสั้นไป ถ่ายใหม่")")
[ "$C" = "200" ] && [ "$(FLAGS $CA)" = "{}" ] && [ "$(MYDAY "$MYDAY_SUM")" = "REJECTED|0|null|null" ] \
  && pass "ตีกลับด้วยเหตุผลอย่างเดียว → reviewFlags ว่าง · งานของฉัน fields=0 needsSite=null (ไม่รู้ว่าต้องไปร้านไหม) whole=null" \
  || fail "ตีกลับแบบเดิม: $C · $(FLAGS $CA) · $(MYDAY 'JSON.stringify(c)' | head -c 300)"
C1=$(CLOSEX "[$(CJ $PID)]"); E1=$(ERR)
C2=$(CLOSEX "[$(CJ $PID NEW-$PID)]")
[ "$C1" = "400" ] && echo "$E1" | grep -qF "เคลม $PNAME: ยังไม่ได้แก้อะไรจากรอบที่ถูกตีกลับ" && [ "$C2" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && pass "ตีกลับแบบเดิม: ส่งซ้ำไม่แก้ = 400 กติกาก้อน 1 · แก้อย่างใดอย่างหนึ่ง (รหัสตัวเสีย) → ส่งได้" || fail "กติกาเดิม: $C1 $E1 · $C2"

echo
echo "═══ ใบที่ 4: ช่องที่เหลือ — แก้ทีละแบบ"
claim_order 2
claim_files $PID; claim_files $PID2
C=$(CLOSEX "[$(CJ $PID),$(CJ $PID2)]")
[ "$C" = "200" ] || fail "เตรียม: ส่งเคลมใบที่ 4 ไม่ผ่าน ($(head -c 200 "$TMP/body"))"
CA=$(LATEST $PID); CB=$(LATEST $PID2)
C=$(REVIEW "$(DEC $CA REJECT '["CLAIM_PART"]')" "$(DEC $CB REJECT '["CHECKS","SYMPTOM"]')")
[ "$C" = "200" ] && [ "$(FLAGS $CA)|$(FLAGS $CB)" = "{CLAIM_PART}|{SYMPTOM,CHECKS}" ] \
  || fail "เตรียม: ตีกลับใบที่ 4 ($C $(head -c 200 "$TMP/body") · $(FLAGS $CA) $(FLAGS $CB))"
N0=$(NROWS)
SYM2="ประตูล็อกไม่ลง กลอนสึก ขึ้น Error dL"
# รูปอะไหล่เก่าแนบที่ ข. (ผิดชิ้น) · ข. แก้อาการ + เช็คอะไรบ้างครบ → ที่ค้างมีแค่รูปของ ก.
UP image/png -F role=CLAIM_PART -F sparePartId=$PID2 >/dev/null
C=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2" "วัดไฟเข้าบอร์ดใหม่ 220V ปกติ")]"); E=$(ERR)
[ "$C|$E" = "400|เคลม $PNAME: ยังไม่ได้แก้ รูปอะไหล่เก่า" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "รูปอะไหล่เก่าแนบใหม่ที่ชิ้นอื่น (ข.) ไม่นับเป็นของ ก. = 400 \"$E\" · ใบไม่ขยับ (ฐานข้อมูล)" \
  || fail "รูปผิดชิ้น: $C $E · $(ST) $(NROWS)"
# ก. แนบรูปของตัวเองแล้ว · ข. แก้อาการ แต่เช็คอะไรบ้างยังเหมือนเดิมทุกอย่าง (ข้อความ · Troubleshooting · ข้อเช็คตาม Error)
UP image/png -F role=CLAIM_PART -F sparePartId=$PID >/dev/null
C=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]"); E=$(ERR)
[ "$C|$E" = "400|เคลม $PNAME2: ยังไม่ได้แก้ ช่างเข้าเช็คอะไรบ้าง" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "ก. แนบรูปของชิ้นตัวเอง = แก้แล้ว · ข. อาการเปลี่ยน = แก้แล้ว · เช็คอะไรบ้างเหมือนเดิม = 400 \"$E\"" \
  || fail "อาการ/เช็ค: $C $E · $(ST) $(NROWS)"
# ติ๊กข้อเช็คตาม Error เพิ่มอย่างเดียว (ข้อความเช็คเหมือนเดิม) — นับว่าแก้ "ช่างเข้าเช็คอะไรบ้าง" แล้ว
CHECK='{"errorCode":"E dL / E dL1 / E dL2","checked":["Solenoid ไม่ฝืด","Limit switch ทำงาน"]}'
C=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]")
[ "$C" = "200" ] && [ "$(ST)|$(NROWS)" = "CLAIM_REVIEW|$((N0 + 2))" ] \
  && [ "$(DB "select symptom||'|'||(\"fieldCheck\"->'checked')::text from \"PartClaim\" where id=$(LATEST $PID2)")" = "$SYM2|[\"Solenoid ไม่ฝืด\", \"Limit switch ทำงาน\"]" ] \
  && pass "ติ๊กข้อเช็คตาม Error เพิ่มอย่างเดียว = แก้ \"ช่างเข้าเช็คอะไรบ้าง\" แล้ว → ส่งได้ · แถวใหม่เก็บอาการใหม่ + ข้อเช็คใหม่ (ฐานข้อมูล)" \
  || fail "เช็คตาม Error: $C $(head -c 200 "$TMP/body") · $(ST) $(NROWS)"

CA=$(LATEST $PID); CB=$(LATEST $PID2)
C=$(REVIEW "$(DEC $CA REJECT '["SERIAL","ERROR_CODE","CLAIM_SYMPTOM"]')" "$(DEC $CB REJECT '["SERIAL","ERROR_CODE","CLAIM_SYMPTOM"]')")
[ "$C" = "200" ] && [ "$(FLAGS $CA)|$(FLAGS $CB)" = "{SERIAL,ERROR_CODE,CLAIM_SYMPTOM}|{SERIAL,ERROR_CODE,CLAIM_SYMPTOM}" ] \
  || fail "เตรียม: ตีกลับข้อมูลเครื่องใบที่ 4 ($C $(head -c 200 "$TMP/body"))"
C1=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]"); E1=$(ERR)
C2=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]" "$(plate HL055L 2402600331)"); E2=$(ERR)
CHECK='{"errorCode":"E bELt","checked":["สายพานไม่หลุด ไม่ขาด"]}'
C3=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]" "$(plate HL055L 2402600331)"); E3=$(ERR)
[ "$C1|$E1" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ Serial · Error ที่เครื่องขึ้น · รูปอาการ" ] \
  && [ "$C2|$E2" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ Error ที่เครื่องขึ้น · รูปอาการ" ] \
  && [ "$C3|$E3" = "400|ข้อมูลเครื่อง: ยังไม่ได้แก้ รูปอาการ" ] && [ "$(ST)" = "IN_PROGRESS" ] \
  && pass "ข้อมูลเครื่อง 3 ช่อง: ไม่แก้ = 400 ครบสามช่อง · แก้ Serial → เหลือ Error + รูปอาการ · เปลี่ยน Error → เหลือรูปอาการ (ใบไม่ขยับ)" \
  || fail "Serial/Error: $C1 $E1 · $C2 $E2 · $C3 $E3 · $(ST)"
UP image/png -F role=CLAIM_SYMPTOM -F sparePartId=$PID2 >/dev/null
C=$(CLOSEX "[$(CJ $PID),$(CJS $PID2 "$SYM2")]" "$(plate HL055L 2402600331)")
[ "$C" = "200" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && [ "$(DB "select string_agg((nameplate->'fields'->1->>'value')||'/'||(\"fieldCheck\"->>'errorCode'), ',') from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")" = "2402600331/E bELt,2402600331/E bELt" ] \
  && pass "รูปอาการใหม่ที่ ข. ชิ้นเดียว → ส่งได้ทั้งสองชิ้น · แถวใหม่ทั้งสองเก็บ Serial ใหม่ + Error ใหม่ (ฐานข้อมูล)" \
  || fail "รูปอาการ: $C $(head -c 200 "$TMP/body") · $(ST)"

[ -z "${FAILED:-}" ] || exit 1
