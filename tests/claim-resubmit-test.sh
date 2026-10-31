#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 1 — ช่างไม่หลงทางหลังถูกตีกลับ (ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน)
#   · ส่งใหม่หลังถูกตีกลับต้องแก้อะไรสักอย่างต่อชิ้น (ไฟล์เคลมใหม่ของชิ้นนั้น · ข้อความ · Troubleshooting · ป้าย · Error)
#     หรือกด "ค่าเดิมถูกแล้ว" + คำอธิบาย 3–300 ตัว — ไม่งั้น 400 บอกชื่อชิ้น ใบไม่ขยับ ไม่มีแถวใหม่
#   · คำอธิบาย "ค่าเดิมถูกแล้ว" อยู่ในประวัติ CLAIM_SUBMITTED ทั้งข้อความ (note) และ meta.keep (ไม่มีคอลัมน์ใหม่)
#   · แถวเคลมของการส่งครั้งเดียวกันเวลาเท่ากันเป๊ะ · รายละเอียดใบงานเรียงใหม่สุดก่อนด้วย id ตัดสิน
#   · ส่งปิดซ้อนกัน (สองคำขอผ่านด่านอ่านพร้อมกัน) → 200 หนึ่ง 409 หนึ่ง code CLOSE_ALREADY_SENT · ใบเคลมชิ้นละแถว
#     ประวัติปิดงานแถวเดียว · กดซ้ำหลังสำเร็จ = 409 code เดียวกัน
#   · งานของฉันวันนี้ (my-day) มีก้อน claim: สถานะ · จำนวนชิ้น · รอบ · เหตุผลทุกชิ้นที่ถูกตีกลับ · คนตรวจ · แถบสถานะ
#     เหตุผล/จำนวนชิ้นนับเฉพาะการตรวจครั้งล่าสุด (ชิ้นที่เลิกส่งแล้วไม่ค้าง) · ใบรอตรวจที่ส่งเมื่อวานยังอยู่ในงานของฉัน
#   · ตีกลับ → แจ้งปัญหาหน้างาน → จ่ายงานใหม่ (รอบหลักฐานขยับ) → คำอธิบาย "ค่าเดิมถูกแล้ว" ยังเข้าประวัติ
#   · รายละเอียดใบงาน: claimEvidence มี id/createdAt/createdById · claims มี reviewedByName / partLabel
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"

TMP=$(mktemp -d)
claim_extra_cleanup() { rm -rf "${TMP:?}"; }

ST() { DB "select status from \"WorkOrder\" where id=$ID"; }
NROWS() { DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID"; }
NLOG() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='$1'"; }
# ก้อน claim ของใบนี้ในงานของฉันวันนี้ (ช่าง) — $1 = นิพจน์ JS ที่อ่าน c (ก้อน claim)
MYDAY() { GET $T work-orders/my-day | J "const r=d.rows.find(x=>x.id===$ID); if(!r) 'missing'; else { const c=r.claim; $1 }"; }
# ใบเคลมหนึ่งชิ้นที่ยืนยันค่าเดิม — $1 ใบเคลม (claim_json) · $2 คำอธิบาย · $3 ช่องที่ยืนยัน (ไม่ส่ง = ALL ทั้งชิ้น)
KEEP() { echo "${1%\}},\"keep\":[{\"flag\":\"${3:-ALL}\",\"note\":\"$2\"}]}"; }
REJECT() { POST $PA "work-orders/$ID/claim-review" "{\"approve\":false,\"reason\":\"$1\"}" >/dev/null; }

claim_order 2
claim_files $PID
claim_files $PID2
PNAME=$(DB "select name from \"SparePart\" where id=$PID")
PNAME2=$(DB "select name from \"SparePart\" where id=$PID2")
PANAME=$(DB "select name from \"User\" where \"employeeCode\"='ZCSP$SUF'")
TNAME=$(DB "select name from \"User\" where \"employeeCode\"='ZCST$SUF'")
REASON="วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่"

echo "═══ ส่งเคลมครั้งแรก — แถวของการส่งครั้งเดียวกันเวลาเท่ากัน"
[ "$(MYDAY '[String(c.state),c.parts,c.trail.length,c.reasons.length].join("|")')" = "null|0|0|0" ] \
  && pass "งานของฉัน: ใบที่ยังไม่มีเคลมได้ก้อน claim ที่ state ว่าง (หน้าจออ่านได้โดยไม่ต้องเช็คว่ามีก้อนไหม)" || fail "my-day ก่อนเคลม: $(MYDAY 'JSON.stringify(c)')"
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] \
  && [ "$(DB "select count(distinct \"createdAt\")||'|'||count(*) from \"PartClaim\" where \"workOrderId\"=$ID")" = "1|2" ] \
  && pass "ส่งเคลม 2 ชิ้น → รอตรวจเคลม · ฐานข้อมูล 2 แถวเวลาเดียวกันเป๊ะ" || fail "ส่งครั้งแรก: $(echo $R | head -c 200) · $(DB "select string_agg(\"createdAt\"::text,',') from \"PartClaim\" where \"workOrderId\"=$ID")"
G=$(GET $T "work-orders/$ID")
[ "$(echo "$G" | J 'd.claims.map(c=>c.id).join(",")')" = "$(DB "select string_agg(id::text,',' order by id desc) from \"PartClaim\" where \"workOrderId\"=$ID")" ] \
  && [ "$(echo "$G" | J 'd.claims.map(c=>c.partLabel+"|"+c.reviewedByName).sort().join(",")')" = "$(printf '%s\n' "$PNAME|null" "$PNAME2|null" | LC_ALL=C sort | paste -sd,)" ] \
  && pass "รายละเอียดใบงานเรียงใบเคลมใหม่สุดก่อน (เวลาเท่ากันใช้ id ตัดสิน) · มี partLabel = ชื่ออะไหล่ · ยังไม่มีคนตรวจ" \
  || fail "claims: $(echo "$G" | J 'JSON.stringify(d.claims.map(c=>[c.id,c.partLabel,c.reviewedByName]))')"
SENT=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"PartClaim\" where \"workOrderId\"=$ID limit 1")
[ "$(MYDAY '[c.state,c.parts,c.round,c.sentAt,c.trail.map(e=>e.k+":"+e.who).join(">")].join("|")')" = "REVIEW|2|1|$SENT|send:$TNAME" ] \
  && pass "งานของฉัน: รอตรวจเคลม 2 ชิ้น รอบ 1 · เวลาส่งตรงฐานข้อมูล · แถบสถานะ 'ส่งเคลม (ช่าง $TNAME)'" \
  || fail "my-day รอตรวจ: $(MYDAY 'JSON.stringify(c)')"

echo
echo "═══ ตีกลับ — การ์ดงานบอกทุกชิ้น · ใครตรวจ"
REJECT "$REASON"
[ "$(ST)" = "IN_PROGRESS" ] || fail "เตรียม: ตีกลับแล้วใบไม่กลับมาที่ช่าง ($(ST))"
REJAT=$(DB "select to_char(max(\"reviewedAt\"),'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"PartClaim\" where \"workOrderId\"=$ID")
[ "$(MYDAY '[c.state,c.parts,c.round,c.reviewerName,c.rejectedAt].join("|")')" = "REJECTED|2|1|$PANAME|$REJAT" ] \
  && [ "$(MYDAY 'c.reasons.map(x=>x.partLabel+"="+x.reason).sort().join(",")')" = "$(printf '%s\n' "$PNAME=$REASON" "$PNAME2=$REASON" | LC_ALL=C sort | paste -sd,)" ] \
  && pass "งานของฉัน: เคลมถูกตีกลับ ต้องแก้ 2 ชิ้น · เหตุผลครบทุกชิ้น · คนตรวจ $PANAME · เวลาตีกลับตรงฐานข้อมูล" \
  || fail "my-day ตีกลับ: $(MYDAY 'JSON.stringify(c)')"
WHAT=$(MYDAY 'c.trail.find(e=>e.k==="reject")?.what')
[ "$(MYDAY 'c.trail.map(e=>e.k+":"+e.who).join(">")')" = "send:$TNAME>reject:$PANAME" ] && echo "$WHAT" | grep -qF "$PNAME" && echo "$WHAT" | grep -qF "$PNAME2" \
  && pass "แถบสถานะ: ส่งเคลม → ตีกลับ ($WHAT · $PANAME)" || fail "trail: $(MYDAY 'JSON.stringify(c.trail)')"
G=$(GET $T "work-orders/$ID")
[ "$(echo "$G" | J 'd.claims.map(c=>c.reviewedByName).join(",")')" = "$PANAME,$PANAME" ] \
  && pass "รายละเอียดใบงาน: ใบเคลมบอกชื่อคนตีกลับ (reviewedByName)" || fail "reviewedByName: $(echo "$G" | J 'JSON.stringify(d.claims.map(c=>c.reviewedByName))')"
# หลักฐานเคลมของรอบนี้ — ฟอร์มที่แนบไฟล์ทันทีต้องรู้ว่าไฟล์ไหนใหม่กว่าการตีกลับ และไฟล์ไหนตัวเองแนบ
EV=$(echo "$G" | J "d.claimEvidence.filter(e=>e.id>0&&!isNaN(Date.parse(e.createdAt))&&e.createdById===$TID&&e.role&&e.sparePartId).map(e=>e.id).sort((a,b)=>a-b).join(',')")
[ -n "$EV" ] && [ "$EV" = "$(DB "select string_agg(id::text,',' order by id) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role like 'CLAIM_%'")" ] \
  && [ "$(echo "$G" | J 'd.claimEvidence.length')" = "8" ] \
  && pass "claimEvidence: ไฟล์เคลมครบ 8 ไฟล์ ทุกไฟล์มี id · createdAt · createdById (ช่างที่แนบ) ตรงฐานข้อมูล" || fail "claimEvidence: $(echo "$G" | J 'JSON.stringify(d.claimEvidence.slice(0,2))')"

echo
echo "═══ ส่งใหม่โดยไม่แก้อะไร = 400 · ค่าเดิมถูกแล้วต้องอธิบาย"
N0=$(NROWS); C0=$(NLOG CLOSED)
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
echo "$R" | J 'd.error' | grep -qF "ยังไม่ได้แก้อะไรจากรอบที่ถูกตีกลับ — แก้ตามเหตุผล หรือกด “ค่าเดิมถูกแล้ว” แล้วอธิบาย" \
  && echo "$R" | J 'd.error' | grep -qF "เคลม $PNAME:" && [ "$(ST)|$(NROWS)|$(NLOG CLOSED)" = "IN_PROGRESS|$N0|$C0" ] \
  && pass "ส่งซ้ำโดยไม่แก้อะไร = 400 บอกชื่อชิ้น ($PNAME) · ใบยังอยู่ที่ช่าง ไม่มีแถวเคลม/ประวัติปิดงานใหม่ (ฐานข้อมูล)" \
  || fail "ส่งซ้ำไม่แก้: $(echo $R | head -c 200) · $(ST)|$(NROWS)|$(NLOG CLOSED)"
R=$(CLOSE "[$(KEEP "$(claim_json $PID)" "ok"),$(claim_json $PID2 "อาการเดิม แก้ข้อความ")]")
echo "$R" | J 'd.error' | grep -qF "คำอธิบาย “ค่าเดิมถูกแล้ว” ต้องยาว 3–300 ตัวอักษร" && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "คำอธิบายค่าเดิมถูกแล้ว 2 ตัว = 400 · ฐานข้อมูลไม่เปลี่ยน" || fail "คำอธิบายสั้น: $(echo $R | head -c 200)"
R=$(CLOSE "[$(KEEP "$(claim_json $PID)" "ค่าเดิมถูกแล้ว ตรงกับรูป" "SERIAL"),$(claim_json $PID2 "อาการเดิม แก้ข้อความ")]")
echo "$R" | J 'd.error' | grep -qF "ไม่รู้จักช่องที่ให้แก้ “SERIAL”" && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "ยืนยันค่าเดิมเป็นรายช่อง (ยังไม่มีตีกลับแบบชี้ช่อง) = 400 · ฐานข้อมูลไม่เปลี่ยน" || fail "flag ไม่รู้จัก: $(echo $R | head -c 200)"
R=$(CLOSE "[$(KEEP "$(claim_json $PID)" "ค่าเดิมถูกแล้ว ตรงกับรูป"),$(claim_json $PID2)]")
echo "$R" | J 'd.error' | grep -qF "เคลม $PNAME2: ยังไม่ได้แก้อะไร" && ! echo "$R" | grep -qF "เคลม $PNAME:" && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "ตรวจทีละชิ้น: $PNAME ยืนยันค่าเดิมแล้ว แต่ $PNAME2 ยังไม่ได้แก้ = 400 บอกชื่อ $PNAME2" || fail "ทีละชิ้น: $(echo $R | head -c 200)"
R=$(CLOSE "[$(KEEP "$(claim_json $PID)" "  ค่าเดิมถูกแล้ว ตรงกับรูป  "),$(claim_json $PID2 "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")" = "2" ] \
  && pass "$PNAME ยืนยันค่าเดิม + $PNAME2 แก้อาการอย่างเดียว → ส่งได้ รอตรวจเคลม (ฐานข้อมูล: ใบเคลมใหม่ 2 แถว)" || fail "ส่งใหม่: $(echo $R | head -c 200)"
LOG=$(DB "select note||'¦'||(meta->'keep')::text from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SUBMITTED' order by id desc limit 1")
echo "${LOG%%¦*}" | grep -qF "$PNAME ยืนยันค่าเดิม: ค่าเดิมถูกแล้ว ตรงกับรูป" \
  && [ "${LOG#*¦}" = "[{\"flag\": \"ALL\", \"note\": \"ค่าเดิมถูกแล้ว ตรงกับรูป\", \"sparePartId\": $PID}]" ] \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and meta is not null and action<>'CLAIM_SUBMITTED'")" = "0" ] \
  && pass "ประวัติส่งเคลม: คำอธิบายอยู่ทั้งข้อความ (note) และ meta.keep (ชิ้น $PID · ALL · ตัดช่องว่าง) · ประวัติอื่นไม่มี meta" \
  || fail "ประวัติ keep: $LOG"
[ "$(MYDAY '[c.state,c.parts,c.round,c.reasons.length,c.trail.map(e=>e.k).join(">")].join("|")')" = "REVIEW|2|2|0|send>reject>resend" ] \
  && pass "งานของฉัน: ส่งเคลมใหม่ รอบ 2 (2 ชิ้นถูกตีกลับครั้งเดียว = รอบ 2 ไม่ใช่ 3) · แถบ ส่ง → ตีกลับ → ส่งใหม่" \
  || fail "my-day รอบ 2: $(MYDAY 'JSON.stringify(c)')"

echo
echo "═══ แนบวิดีโอใหม่หลังถูกตีกลับ = แก้แล้ว (ของชิ้นนั้นเท่านั้น)"
REJECT "วิดีโอยังไม่เห็นค่าที่วัด"
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID" >/dev/null
N0=$(NROWS)
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2 "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม")]")
echo "$R" | J 'd.error' | grep -qF "เคลม $PNAME2: ยังไม่ได้แก้อะไร" && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|$N0" ] \
  && pass "วิดีโอใหม่ของ $PNAME ไม่นับให้ $PNAME2 — $PNAME2 ยังไม่ได้แก้ = 400 · ฐานข้อมูลไม่เปลี่ยน" || fail "วิดีโอข้ามชิ้น: $(echo $R | head -c 200)"
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID2" >/dev/null
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2 "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(NROWS)" = "$((N0 + 2))" ] \
  && pass "แนบวิดีโอการตรวจเช็คใหม่ทั้งสองชิ้น (ข้อความเดิม) → ส่งได้ (ฐานข้อมูล: แถวใหม่ 2 แถว)" || fail "ส่งหลังแนบวิดีโอ: $(echo $R | head -c 200)"

echo
echo "═══ ส่งปิดซ้อนกัน — เขียนครั้งเดียว"
REJECT "รูปอะไหล่เก่าไม่เห็นสติกเกอร์รหัส"
for p in $PID $PID2; do UP image/png -F "role=CLAIM_PART" -F "sparePartId=$p" >/dev/null; done
N0=$(NROWS); C0=$(NLOG CLOSED); S0=$(NLOG CLAIM_SUBMITTED)
BODY="{\"result\":\"FIXED\",\"note\":\"เปลี่ยนอะไหล่ ทดสอบแล้วปกติ\",\"workerIds\":[$TID],\"parts\":$PARTS,\"claims\":[$(claim_json $PID),$(claim_json $PID2 "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม")],\"claimNameplate\":$PLATE,\"claimCheck\":$CHECK}"
CLOSE_TO() { curl -s -o "$TMP/$1.body" -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' -d "$BODY" >"$TMP/$1.code"; }
# อีกคนถือแถวใบงานค้างไว้ 3 วิ (ล็อกแถว) — สองคำขอที่ยิงตามไปผ่านด่านอ่านนอก transaction ได้ทั้งคู่ (ฐานข้อมูลไม่บล็อกการอ่าน)
# แล้วไปรอที่ด่านเขียนในทรานแซกชัน = ช่องว่างระหว่าง "อ่าน" กับ "เขียน" ตอนกดส่งสองครั้งติดจริง
PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -q -v ON_ERROR_STOP=1 \
  -c "BEGIN; SELECT id FROM \"WorkOrder\" WHERE id=$ID FOR UPDATE; SELECT pg_sleep(3) /* hold-$SUF */; COMMIT;" >/dev/null &
HOLD_PID=$!
for _ in $(seq 50); do
  [ "$(DB "select count(*) from pg_stat_activity where query like '%hold-$SUF */%' and pid<>pg_backend_pid() and state='active'")" = "1" ] && break
  sleep 0.1
done
CLOSE_TO c1 & P1=$!
CLOSE_TO c2 & P2=$!
wait $P1 $P2 $HOLD_PID || true
CODES=$(for c in c1 c2; do cat "$TMP/$c.code"; echo; done | LC_ALL=C sort | paste -sd,)
LOSER=$(for c in c1 c2; do [ "$(cat "$TMP/$c.code")" = "409" ] && J 'd.code+"|"+d.error' <"$TMP/$c.body"; done; true)
WO_CODE=$(DB "select code from \"WorkOrder\" where id=$ID")
[ "$CODES" = "200,409" ] && [ "$LOSER" = "CLOSE_ALREADY_SENT|$WO_CODE ส่งปิดงานไปแล้ว — โหลดใหม่" ] \
  && pass "สองคำขอผ่านด่านอ่านพร้อมกัน: 200 หนึ่ง · 409 หนึ่ง code CLOSE_ALREADY_SENT \"$WO_CODE ส่งปิดงานไปแล้ว — โหลดใหม่\"" \
  || fail "ปิดซ้อน: $CODES · $LOSER"
[ "$(ST)" = "CLAIM_REVIEW" ] && [ "$(NROWS)" = "$((N0 + 2))" ] && [ "$(NLOG CLOSED)" = "$((C0 + 1))" ] && [ "$(NLOG CLAIM_SUBMITTED)" = "$((S0 + 1))" ] \
  && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING' group by \"sparePartId\" having count(*)>1")" = "" ] \
  && pass "ฐานข้อมูล: ใบเคลมใหม่ชิ้นละแถว (2) · ประวัติปิดงาน +1 · ส่งเคลม +1 — คำขอที่แพ้ไม่ได้เขียนอะไรเลย" \
  || fail "หลังปิดซ้อน: $(ST) · แถว $(NROWS)/$((N0 + 2)) · CLOSED $(NLOG CLOSED)/$((C0 + 1)) · CLAIM_SUBMITTED $(NLOG CLAIM_SUBMITTED)/$((S0 + 1))"
N1=$(NROWS)
R=$(curl -s -w ' HTTP%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' -d "$BODY")
[ "${R##* HTTP}" = "409" ] && [ "$(echo "${R% HTTP*}" | J 'd.code')" = "CLOSE_ALREADY_SENT" ] && [ "$(NROWS)|$(NLOG CLOSED)" = "$N1|$((C0 + 1))" ] \
  && pass "กดซ้ำหลังส่งสำเร็จ = 409 code CLOSE_ALREADY_SENT · ฐานข้อมูลไม่เปลี่ยน" || fail "กดซ้ำ: $(echo $R | head -c 200)"

echo
echo "═══ เลิกส่งชิ้นหนึ่งแล้วถูกตีกลับอีก — การ์ดบอกเฉพาะชิ้นที่ถูกตีกลับครั้งล่าสุด"
REJECT "ทั้งสองชิ้น: รูปมืด ถ่ายใหม่"
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID" >/dev/null
R=$(CLOSE "[$(claim_json $PID)]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งเฉพาะ $PNAME ไม่ผ่าน: $(echo $R | head -c 200)"
REASON2="บอร์ด: วิดีโอยังไม่เห็นไฟเข้า"
REJECT "$REASON2"
# ฐานข้อมูล: แถวล่าสุดของชิ้นที่เลิกส่งยังเป็น "ตีกลับ" ของครั้งก่อน — สภาพที่ทำให้การ์ดเคยนับเกิน
[ "$(DB "select status from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2 order by id desc limit 1")" = "REJECTED" ] \
  || fail "เตรียม: แถวล่าสุดของ $PNAME2 ไม่ใช่ตีกลับค้าง"
[ "$(MYDAY '[c.state,c.parts,c.reasons.map(x=>x.partLabel+"="+x.reason).join(",")].join("|")')" = "REJECTED|1|$PNAME=$REASON2" ] \
  && [ "$(MYDAY 'c.trail.filter(e=>e.k==="reject").pop().what')" = "$PNAME" ] \
  && pass "งานของฉัน: ต้องแก้ 1 ชิ้น เหตุผลเฉพาะ $PNAME (ไม่ดึงเหตุผลเก่าของ $PNAME2 ที่เลิกส่งแล้ว) ตรงกับแถบสถานะ" \
  || fail "ตีกลับครั้งล่าสุด: $(MYDAY 'JSON.stringify({parts:c.parts,reasons:c.reasons})')"

echo
echo "═══ จ่ายงานใหม่หลังถูกตีกลับ — คำอธิบาย \"ค่าเดิมถูกแล้ว\" ยังเข้าประวัติ"
A0=$(NLOG ASSIGNED)
POST $T "work-orders/$ID/reassess-parts" '{"reasonCode":"RESOURCES","reason":"บันไดไม่พอ ต้องไปสองคน"}' >/dev/null
POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
if [ "$(ST)" = "PARTS_REQUESTED" ]; then
  RES=$(DB "select string_agg('{\"sparePartId\":'||\"sparePartId\"||',\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CS$SUF\"}', ',') from \"WorkOrderPart\" where \"workOrderId\"=$ID and kind='WAITING' and \"requisitionNo\" is null")
  POST $A "work-orders/$ID/parts-check" "{\"results\":[$RES]}" >/dev/null
fi
[ "$(ST)" = "AWAITING_CONFIRM" ] && POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(ST)" = "IN_PROGRESS" ] && [ "$(NLOG ASSIGNED)" -gt "$A0" ] || fail "เตรียม: จ่ายงานใหม่ไม่ถึงขั้นเข้างาน ($(ST) · ASSIGNED $(NLOG ASSIGNED)/$A0)"
# รอบหลักฐานขยับแล้ว — ไฟล์ที่ปิดงานบังคับต้องแนบใหม่ทั้งชุด
for r in BEFORE AFTER NAMEPLATE REQUISITION; do UP image/png -F "role=$r" >/dev/null; done
claim_files $PID
N0=$(NROWS)
KNOTE="ค่าเดิมถูกแล้ว ไฟเข้าบอร์ด 220V ตามวิดีโอ"
R=$(CLOSE "[$(KEEP "$(claim_json $PID)" "$KNOTE")]")
LOG=$(DB "select note||'¦'||coalesce((meta->'keep')::text,'-') from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SUBMITTED' order by id desc limit 1")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(NROWS)" = "$((N0 + 1))" ] \
  && echo "${LOG%%¦*}" | grep -qF "$PNAME ยืนยันค่าเดิม: $KNOTE" \
  && [ "${LOG#*¦}" = "[{\"flag\": \"ALL\", \"note\": \"$KNOTE\", \"sparePartId\": $PID}]" ] \
  && pass "ตีกลับ → แจ้งปัญหาหน้างาน → จ่ายงานใหม่ → ส่งพร้อมค่าเดิมถูกแล้ว: คำอธิบายอยู่ใน note และ meta.keep (ฐานข้อมูล) ไม่หายเงียบ" \
  || fail "keep หลังจ่ายงานใหม่: $(echo $R | head -c 200) · $LOG"

echo
echo "═══ รอตรวจเคลมข้ามวัน — การ์ดยังอยู่ในงานของฉัน นับวันที่รอ"
# ย้อนเวลาทั้งเรื่องเคลมของใบนี้ไปหนึ่งวัน (เวลาปิด · เวลาส่ง/ตัดสินทุกแถว — ย้อนทั้งชุดลำดับจึงไม่สลับ)
# = ส่งเมื่อวานแล้ว Admin Spare Part ยังไม่ตรวจ
DB "update \"WorkOrder\" set \"closedAt\"=\"closedAt\"-interval '1 day' where id=$ID;
    update \"PartClaim\" set \"createdAt\"=\"createdAt\"-interval '1 day', \"reviewedAt\"=\"reviewedAt\"-interval '1 day' where \"workOrderId\"=$ID" >/dev/null
WAIT=$(MYDAY 'c.sentAt ? Math.round((Date.parse(d.today+"T00:00:00Z")-Date.parse(new Date(Date.parse(c.sentAt)+7*3600e3).toISOString().slice(0,10)+"T00:00:00Z"))/864e5) : "no-sentAt"' || true)
[ "$(MYDAY '[r.done,c.state,c.parts].join("|")')" = "true|REVIEW|1" ] && [ "$WAIT" = "1" ] \
  && pass "ส่งเคลมเมื่อวาน ยังไม่ตรวจ → งานของฉันยังส่งใบนี้มา (รอตรวจ 1 ชิ้น · เวลาส่งห่างวันนี้ 1 วัน)" \
  || fail "รอตรวจข้ามวัน: $(MYDAY 'JSON.stringify({done:r.done,state:c.state,sentAt:c.sentAt,today:d.today})')"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
