#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 3 — Admin Spare Part ตัดสินทีละชิ้น (ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน)
#   · POST claim-review { decisions: [{ claimId, verdict: APPROVE|REJECT|DECLINE, reason }] }:
#     ผ่าน ก. + ตีกลับ ข. → ใบกลับไปหาช่าง · แถว ก. ผ่าน (ไม่มีเหตุผล) · ข. ตีกลับพร้อมเหตุผลของตัวเอง · ประวัติบอกผลทีละชิ้น
#     ตัดสินไม่ครบ/ซ้ำ → 400 · ตีกลับไม่มีเหตุผล → 400 · ปิดเคลมไม่มีเหตุผล ("อื่น ๆ" เฉย ๆ ก็ไม่นับ) → 400 ·
#     ช่องที่ให้แก้ (ยังไม่มีในก้อนนี้) → 400 ไม่รู้จัก · ชิ้นที่ไม่ได้รอตรวจ → 409 ให้โหลดใหม่ · แอดมิน/หัวหน้าภาค/ช่าง → 403
#     Admin Spare Part กับ Super Admin กดพร้อมกัน → 200 หนึ่ง 409 หนึ่ง ตัดสินครั้งเดียว ประวัติแถวเดียว
#   · detail.claimRound: ใบที่ ก. ผ่าน ข. ตีกลับ = rejected ไม่ว่าแถวไหนอยู่บน (แถวบนสุดคือ ก. ที่ผ่าน) · ชิ้นที่ล็อก ·
#     ข้อมูลเครื่องล็อกพร้อม ก. · ป้ายในรายการ (claimStatus) = REJECTED ทุกครั้งที่โหลด · งานของฉันบอกเฉพาะ ข.
#   · ชิ้นที่ผ่าน/ปิดเคลมล็อก: เอาออกจากอะไหล่ที่ใช้ไม่ได้ทั้งช่างปิดงาน · ปิดงานย้อนหลัง · หัวหน้าภาคปิดใบงาน (400 ใบไม่ขยับ)
#     ส่งซ้ำมาก็ไม่เกิดแถวใหม่ · แจ้งปัญหาหน้างาน (ใบไปขั้นอะไหล่ ยังแดง) → จ่ายงานใหม่ ยังล็อก · แถวใหม่ของ ข. ใช้ป้ายรุ่น/Error
#     ของ ก. ที่ผ่านแล้ว (ค่าป้าย/Error ที่แอปส่งมาไม่ใช้) · เปิดใบใหม่ (REOPENED) = ซ่อมครั้งใหม่ ชิ้นเดิมเคลมได้อีก ไม่มีอะไรล็อก
#   · ก. ผ่านรอบแรก แล้วปิดเคลม ข. วันรุ่งขึ้น → ประวัติ CLAIM_APPROVED (มีใบเคลมไปผู้ขาย) · งานของฉันยังเห็นใบที่ตรวจวันนี้
#     แม้เวลาปิดเป็นเมื่อวาน · ชิ้นที่ช่างเลิกส่งค้างตีกลับ: ไม่อยู่ใน rejectedIds · ใบที่ปิดแล้วไม่แดง
#   · ปิดเคลมทุกชิ้น → ปิดงาน ประวัติ CLAIM_DECLINED · claimStatus DECLINED · ใบเคลม PDF ของชิ้นนั้น 409 ·
#     ประวัติเคลมกรอง DECLINED ได้ ป้าย "ปิดเคลม ไม่ส่งผู้ขาย" · Excel ชีตรวมตามอะไหล่มีคอลัมน์สุดท้ายนี้ ·
#     รายงานอะไหล่ที่ไปแต่ละสาขาเขียนผลทีละชิ้น (ผ่าน = ส่งเคลมตัวเก่าแล้ว · ตีกลับ = รอช่างปิดงานใหม่ · ปิดเคลม)
#   · ตีกลับ ก. + ปิดเคลม ข. → ช่างส่งใหม่ ข. ยังปิดเคลมอยู่ · ผ่าน ก. → ประวัติ CLAIM_APPROVED (มีชิ้นที่ส่งผู้ขาย)
#   · แบบเดิม { approve:true } ยังอนุมัติทุกชิ้นที่รอตรวจ · ตัวเลือกเหตุผลปิดเคลมมากับ /work-orders/options
SP="$(cd "$(dirname "$0")" && pwd)"
CLAIM_SETUP_SUPER=1
. "$SP/claim-setup.sh"

TMP=$(mktemp -d)
claim_extra_cleanup() { rm -rf "${TMP:?}"; }

ST() { DB "select status from \"WorkOrder\" where id=$ID"; }
# จำนวนแถวเคลมของอะไหล่ $1 ในใบนี้ (ไม่ส่ง = ทุกชิ้น)
NROWS() { DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID ${1:+and \"sparePartId\"=$1}"; }
NLOG() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='$1'"; }
LASTLOG() { DB "select action||'¦'||coalesce(note,'') from \"WorkOrderLog\" where \"workOrderId\"=$ID order by id desc limit 1"; }
# อะไหล่ที่ใช้ (USED) ของใบนี้ — รหัสอะไหล่เรียงตาม id
USED() { DB "select coalesce(string_agg(\"sparePartId\"::text, ',' order by \"sparePartId\"), '') from \"WorkOrderPart\" where \"workOrderId\"=$ID and kind='USED'"; }
# POST แล้วเก็บคำตอบไว้ที่ $TMP/body — พิมพ์รหัส HTTP · ERR = ข้อความ error ในคำตอบนั้น
PC() { curl -s -o "$TMP/body" -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
ERR() { J 'd.error' < "$TMP/body"; }
# คำตัดสินหนึ่งชิ้น — $1 claimId · $2 APPROVE/REJECT/DECLINE · $3 เหตุผล (ไม่ส่ง = ไม่มี)
DEC() { echo "{\"claimId\":$1,\"verdict\":\"$2\"${3:+,\"reason\":\"$3\"}}"; }
# ตัดสินใบ $ID — $1 token · ที่เหลือ = คำตัดสิน (DEC) ทีละชิ้น
REVIEW() { local t=$1; shift; local IFS=,; PC "$t" "work-orders/$ID/claim-review" "{\"decisions\":[$*]}"; }
# ป้ายเคลมของใบนี้ในรายการใบงาน
LISTST() { GET $A "work-orders?status=ALL&branchCode=$BC" | J "String((d.rows.find(r=>r.id===$ID)||{claimStatus:'missing'}).claimStatus)"; }
# ก้อน claim ของใบนี้ในงานของฉันวันนี้ (ช่าง) — $1 = นิพจน์ JS ที่อ่าน c
MYDAY() { GET $T work-orders/my-day | J "const r=d.rows.find(x=>x.id===$ID); if(!r) 'missing'; else { const c=r.claim; $1 }"; }
# detail.claimRound ของใบนี้ (Admin Spare Part เปิด) — $1 = นิพจน์ JS ที่อ่าน k
ROUND() { GET $PA "work-orders/$ID" | J "const k=d.claimRound; $1"; }
# บรรทัดรายงานอะไหล่ที่ไปแต่ละสาขา (ใช้แล้ว) ของอะไหล่ $1 ในใบนี้ — "claimStatus|detail"
BPR() { GET $A "work-orders/reports/branch-parts/detail?view=branch&key=$BC&kind=used" | J "const r=d.rows.find(x=>x.workOrderId===$ID&&x.sparePartId===$1); r ? r.claimStatus+'|'+r.detail : 'missing'"; }
# ปล่อยงานใบ $ID ใหม่หลังจ่ายงาน (เบิกให้ถ้าใบไปขั้นเบิก · คอนเฟิร์ม · ปล่อยงาน) แล้วแนบรูปที่ปิดงานบังคับของรอบใหม่
redispatch() {
  POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
  if [ "$(ST)" = "PARTS_REQUESTED" ]; then
    local res
    res=$(DB "select string_agg('{\"sparePartId\":'||\"sparePartId\"||',\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CS$SUF\"}', ',') from \"WorkOrderPart\" where \"workOrderId\"=$ID and kind='WAITING' and \"requisitionNo\" is null")
    POST $A "work-orders/$ID/parts-check" "{\"results\":[$res]}" >/dev/null
  fi
  if [ "$(ST)" = "AWAITING_CONFIRM" ]; then POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null; fi
  POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
  for r in BEFORE AFTER NAMEPLATE REQUISITION; do UP image/png -F "role=$r" >/dev/null; done
}

SEND_BACK="ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร"
STALE="มีคนตรวจใบนี้ไปแล้ว — โหลดใหม่"
REASON_B="วิดีโอการตรวจเช็คไม่เห็นค่าที่วัด ถ่ายใหม่"

echo "═══ ใบที่ 1: ส่งเคลม 2 ชิ้น (ข. ก่อน ก. — แถวของ ก. จึงอยู่บนสุดในรายละเอียดใบงาน)"
claim_order 2
ID1=$ID
claim_files $PID; claim_files $PID2
PNAME=$(DB "select name from \"SparePart\" where id=$PID")
PNAME2=$(DB "select name from \"SparePart\" where id=$PID2")
FULL_PARTS=$PARTS
R=$(CLOSE "[$(claim_json $PID2),$(claim_json $PID)]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งเคลมไม่ผ่าน ($(echo "$R" | head -c 200))"
CA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
[ "$CA" -gt "$CB" ] && [ "$(DB "select count(distinct \"createdAt\") from \"PartClaim\" where \"workOrderId\"=$ID")" = "1" ] \
  || fail "เตรียม: แถว ก. ต้อง id มากกว่า ข. และเวลาเท่ากัน (ก. $CA · ข. $CB)"

echo
echo "═══ ตัดสินไม่ถูกต้อง — ปฏิเสธทั้งคำขอ ไม่มีอะไรเปลี่ยน"
OK=$(DEC $CA APPROVE); BAD=$(DEC $CB REJECT "$REASON_B")
C1=$(REVIEW $A "$OK" "$BAD"); E1=$(ERR)
C2=$(REVIEW $S "$OK" "$BAD")
C3=$(REVIEW $T "$OK" "$BAD")
[ "$C1|$C2|$C3" = "403|403|403" ] && [ "$E1" = "ตรวจเคลมได้เฉพาะ Admin Spare Part" ] \
  && pass "แอดมินทั่วไป · หัวหน้าภาค · ช่าง ตัดสินเคลม = 403 \"$E1\"" || fail "403: $C1/$C2/$C3 $E1"
C1=$(REVIEW $PA "$OK"); E1=$(ERR)
C2=$(REVIEW $PA "$OK" "$(DEC $CA REJECT x)" "$BAD"); E2=$(ERR)
[ "$C1|$C2" = "400|400" ] && [ "$E1" = "ตัดสินให้ครบทุกชิ้นก่อน" ] && [ "$E2" = "ตัดสินให้ครบทุกชิ้นก่อน" ] \
  && pass "ตัดสินชิ้นเดียวจากสอง · ตัดสินชิ้นเดียวกันสองครั้ง = 400 \"ตัดสินให้ครบทุกชิ้นก่อน\"" || fail "ไม่ครบ/ซ้ำ: $C1 $E1 · $C2 $E2"
C1=$(REVIEW $PA "$OK" "$(DEC $CB REJECT)"); E1=$(ERR)
[ "$C1|$E1" = "400|$SEND_BACK" ] && pass "ตีกลับไม่มีเหตุผล = 400 \"$SEND_BACK\"" || fail "ตีกลับไม่มีเหตุผล: $C1 $E1"
C1=$(REVIEW $PA "$OK" "$(DEC $CB DECLINE)"); E1=$(ERR)
C2=$(REVIEW $PA "$OK" "$(DEC $CB DECLINE "อื่น ๆ")"); E2=$(ERR)
[ "$C1|$C2" = "400|400" ] && [ "$E1" = "ปิดเคลม ไม่ส่งผู้ขาย ต้องเลือกเหตุผล" ] && [ "$E2" = "$E1" ] \
  && pass "ปิดเคลมไม่มีเหตุผล · เลือก \"อื่น ๆ\" แต่ไม่พิมพ์ = 400 \"$E1\"" || fail "ปิดเคลมไม่มีเหตุผล: $C1 $E1 · $C2 $E2"
C1=$(REVIEW $PA "$OK" "{\"claimId\":$CB,\"verdict\":\"REJECT\",\"reason\":\"x\",\"flags\":[\"MODEL\"]}"); E1=$(ERR)
[ "$C1|$E1" = "400|ไม่รู้จักช่องที่ให้แก้ “MODEL”" ] && pass "ส่งช่องที่ให้แก้มา (ยังไม่มีในก้อนนี้) = 400 ไม่รู้จัก — ไม่ทิ้งเงียบ ๆ" || fail "flags: $C1 $E1"
C1=$(REVIEW $PA "$OK" "$(DEC 999999999 APPROVE)"); E1=$(ERR)
[ "$C1|$E1" = "409|$STALE" ] && [ "$(ST)" = "CLAIM_REVIEW" ] \
  && [ "$(DB "select string_agg(status||coalesce(\"rejectReason\",'')||coalesce(\"reviewedAt\"::text,''),',') from \"PartClaim\" where \"workOrderId\"=$ID")" = "PENDING,PENDING" ] \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID and action in ('CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_DECLINED')")" = "0" ] \
  && pass "ชิ้นที่ไม่ได้รอตรวจในใบนี้ = 409 \"$STALE\" · หลังคำขอที่ถูกปฏิเสธทั้งหมด: ใบยังรอตรวจ สองแถวยังรอตรวจ ไม่มีประวัติตัดสิน (ฐานข้อมูล)" \
  || fail "409/ไม่เปลี่ยน: $C1 $E1 · $(ST) · $(DB "select string_agg(status,',') from \"PartClaim\" where \"workOrderId\"=$ID")"

echo
echo "═══ ผ่าน ก. + ตีกลับ ข."
C=$(REVIEW $PA "$OK" "$BAD")
[ "$C" = "200" ] && [ "$(DB "select status||'|'||(\"closedAt\" is null) from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS|true" ] \
  && [ "$(DB "select status||'|'||coalesce(\"rejectReason\",'-') from \"PartClaim\" where id=$CA")" = "APPROVED|-" ] \
  && [ "$(DB "select status||'|'||coalesce(\"rejectReason\",'-') from \"PartClaim\" where id=$CB")" = "REJECTED|$REASON_B" ] \
  && [ "$(DB "select count(distinct \"reviewedAt\")||'|'||count(*) from \"PartClaim\" where \"workOrderId\"=$ID and \"reviewedById\" is not null")" = "1|2" ] \
  && pass "ใบกลับไปหาช่าง (ล้างเวลาปิด) · ก. ผ่าน ไม่มีเหตุผล · ข. ตีกลับพร้อมเหตุผลของตัวเอง · ตัดสินเวลาเดียวกัน (ฐานข้อมูล)" \
  || fail "ผ่าน+ตีกลับ: $C $(head -c 200 "$TMP/body") · $(DB "select string_agg(id||':'||status||':'||coalesce(\"rejectReason\",'-'),',') from \"PartClaim\" where \"workOrderId\"=$ID")"
# เรียงตามที่ส่ง (ข. ส่งก่อนในใบนี้)
[ "$(LASTLOG)" = "CLAIM_REJECTED¦ตีกลับ $PNAME2: $REASON_B · ผ่าน $PNAME" ] \
  && pass "ประวัติ CLAIM_REJECTED บอกผลทีละชิ้น: \"ตีกลับ $PNAME2: … · ผ่าน $PNAME\"" || fail "ประวัติ: $(LASTLOG)"
K="[k.rejected, k.rejectedIds.join(','), k.parts.map(p=>p.sparePartId+':'+p.status+':'+p.claimId+':'+p.round).sort().join(','), k.lockedMachine&&k.lockedMachine.byParts.join(',')].join('|')"
[ "$(GET $PA "work-orders/$ID" | J 'd.claims[0].id')" = "$CA" ] \
  && [ "$(ROUND "$K")" = "true|$CB|$(printf '%s\n' "$PID:APPROVED:$CA:1" "$PID2:REJECTED:$CB:1" | LC_ALL=C sort | paste -sd,)|$PNAME" ] \
  && pass "claimRound: แถวบนสุด (claims[0]) คือ ก. ที่ผ่าน แต่ rejected=true · rejectedIds=[ข.] · ก. ผ่าน ข. ตีกลับ รอบ 1 · ข้อมูลเครื่องล็อกพร้อม $PNAME" \
  || fail "claimRound: $(ROUND 'JSON.stringify(k)')"
L1=$(LISTST); L2=$(LISTST); L3=$(LISTST)
[ "$L1|$L2|$L3" = "REJECTED|REJECTED|REJECTED" ] && pass "ป้ายในรายการ = REJECTED ทั้ง 3 ครั้งที่โหลด (ไม่สลับตามแถวบนสุด)" || fail "claimStatus: $L1 $L2 $L3"
[ "$(MYDAY '[c.state,c.parts,c.reasons.map(x=>x.partLabel+"="+x.reason).join(","),c.outcome.map(o=>o.partLabel+":"+o.status).join(","),c.trail[c.trail.length-1].k+":"+c.trail[c.trail.length-1].what].join("|")')" \
  = "REJECTED|1|$PNAME2=$REASON_B|$PNAME:APPROVED|reject:$PNAME2" ] \
  && pass "งานของฉัน: ถูกตีกลับ 1 ชิ้น เหตุผลเฉพาะ $PNAME2 · outcome บอก $PNAME ผ่านแล้ว · แถบสถานะ 'ตีกลับ ($PNAME2)' ไม่มี 'อนุมัติ' ซ้อน" \
  || fail "my-day: $(MYDAY 'JSON.stringify({s:c.state,p:c.parts,r:c.reasons,o:c.outcome,t:c.trail})')"
BPR $PID | grep -q '^APPROVED|.*ส่งเคลมตัวเก่าแล้ว$' && ! BPR $PID | grep -q 'ตีกลับ' \
  && BPR $PID2 | grep -q '^REJECTED|.*เคลมถูกตีกลับ · รอช่างปิดงานใหม่$' \
  && pass "รายงานอะไหล่ที่ไปแต่ละสาขา (ใบยังไม่ปิด): $PNAME \"ส่งเคลมตัวเก่าแล้ว\" · $PNAME2 \"เคลมถูกตีกลับ · รอช่างปิดงานใหม่\" — ทีละชิ้น" \
  || fail "branch-parts: ก. $(BPR $PID) · ข. $(BPR $PID2)"

echo
echo "═══ ชิ้นที่ผ่านแล้วเอาออกจากอะไหล่ที่ใช้ไม่ได้ (ทุกทางที่เขียนทับอะไหล่ที่ใช้)"
LOCKED_A="$PNAME อนุมัติเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้"
N0=$(NROWS); U0=$(USED); L0=$(NLOG CLOSED)
PARTS="[{\"sparePartId\":$PID2,\"quantity\":1}]"
R=$(CLOSE "[$(claim_json $PID2 "สายพานขาด ขึ้นเสียงดัง")]"); PARTS=$FULL_PARTS
[ "$(echo "$R" | J 'd.error')" = "$LOCKED_A" ] && [ "$(ST)|$(NROWS)|$(USED)" = "IN_PROGRESS|$N0|$U0" ] \
  && pass "ช่างปิดงานโดยเอา $PNAME ออก = 400 \"$LOCKED_A\" · ใบไม่ขยับ ไม่มีแถวใหม่ อะไหล่ที่ใช้เท่าเดิม (ฐานข้อมูล)" \
  || fail "close ตัด ก.: $(echo "$R" | head -c 200) · $(ST) $(NROWS)/$N0 $(USED)/$U0"
NOWISO=$(node -e 'console.log(new Date().toISOString())'); TODAY=$(day 0)
C=$(PC $A "work-orders/$ID/backfill-close" "{\"reason\":\"ทดสอบ\",\"team\":\"กระบี่\",\"visitDate\":\"$TODAY\",\"visitTime\":\"00:00\",\"result\":\"FIXED\",\"closedAt\":\"$NOWISO\",\"parts\":[{\"sparePartId\":$PID2,\"quantity\":1}],\"otherWorkers\":\"ช่างทดสอบ\",\"noPhotoReason\":\"ทดสอบ\"}"); E1=$(ERR)
C2=$(PC $S "work-orders/$ID/supervisor-close" "{\"reason\":\"TECH_FIXED\",\"note\":\"ช่างเข้าซ่อมเสร็จแล้ว ทดสอบปิดแทน\",\"otherWorkers\":\"ช่างทดสอบ\",\"visitDate\":\"$TODAY\",\"parts\":[{\"sparePartId\":$PID2,\"quantity\":1}]}"); E2=$(ERR)
[ "$C|$E1" = "400|$LOCKED_A" ] && [ "$C2|$E2" = "400|$LOCKED_A" ] && [ "$(ST)|$(NROWS)|$(USED)" = "IN_PROGRESS|$N0|$U0" ] \
  && [ "$(NLOG CLOSED)|$(NLOG BACKFILLED)" = "$L0|0" ] \
  && pass "ปิดงานย้อนหลัง · หัวหน้าภาคปิดใบงาน (ช่างซ่อมเสร็จแล้ว) โดยเอา $PNAME ออก = 400 ข้อความเดียวกัน · ใบไม่ปิด อะไหล่ที่ใช้เท่าเดิม (ฐานข้อมูล)" \
  || fail "backfill/supervisor: $C $E1 · $C2 $E2 · $(ST) $(USED)/$U0"

echo
echo "═══ แจ้งปัญหาหน้างาน → จ่ายงานใหม่ → ส่งใหม่ทั้งสองชิ้น: ก. ยังล็อก · ข. ใช้ป้ายรุ่น/Error ของ ก."
A_PLATE=$(DB "select nameplate::text from \"PartClaim\" where id=$CA")
A_ERR=$(DB "select \"fieldCheck\"->>'errorCode' from \"PartClaim\" where id=$CA")
POST $T "work-orders/$ID/reassess-parts" '{"reasonCode":"RESOURCES","reason":"บันไดไม่พอ ต้องไปสองคน"}' >/dev/null
# ใบออกจากขั้นกำลังซ่อมไปขั้นอะไหล่ — เคลมยังรอช่างแก้อยู่ ป้ายแดงต้องไม่หายระหว่างรอจ่ายงานใหม่
ST_MID=$(ST)
[ "$ST_MID" != "IN_PROGRESS" ] && [ "$(ROUND '[k.rejected,k.rejectedIds.join(",")].join("|")')" = "true|$CB" ] && [ "$(LISTST)" = "REJECTED" ] \
  && pass "หลังแจ้งปัญหาหน้างาน (ใบอยู่ขั้น $ST_MID): claimRound.rejected ยัง true · rejectedIds=[ข.] · ป้ายในรายการยัง REJECTED" \
  || fail "ระหว่างแจ้งปัญหาหน้างาน: $ST_MID · $(ROUND 'JSON.stringify(k)') · $(LISTST)"
redispatch
[ "$(ST)" = "IN_PROGRESS" ] || fail "เตรียม: จ่ายงานใหม่ไม่ถึงขั้นเข้างาน ($(ST))"
claim_files $PID2
OTHER_PLATE='{"fields":[{"key":"model","label":"รุ่น","value":"HL999X","source":"HAND"},{"key":"serial","label":"Serial","value":"9999999999","source":"HAND"}],"verified":true}'
OTHER_CHECK='{"errorCode":"Door Close","checked":[]}'
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2 "สายพานขาด ขึ้นเสียงดังตอนปั่น")]" "$OTHER_PLATE" "$OTHER_CHECK")
CB2=$(DB "select max(id) from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(NROWS $PID)|$(NROWS $PID2)" = "1|2" ] && [ "$(USED)" = "$U0" ] \
  && [ "$(DB "select status from \"PartClaim\" where id=$CA")" = "APPROVED" ] \
  && pass "ส่ง $PNAME มาซ้ำหลังจ่ายงานใหม่: ไม่มีแถวใหม่ ยังผ่านอยู่ · $PNAME2 ได้แถวใหม่ · อะไหล่ที่ใช้ยังมีทั้งสองชิ้น (ฐานข้อมูล)" \
  || fail "re-close: $(echo "$R" | head -c 200) · rows ก.$(NROWS $PID) ข.$(NROWS $PID2) · USED $(USED)/$U0"
[ "$(DB "select nameplate::text from \"PartClaim\" where id=$CB2")" = "$A_PLATE" ] \
  && [ "$(DB "select \"fieldCheck\"->>'errorCode' from \"PartClaim\" where id=$CB2")" = "$A_ERR" ] \
  && [ "$(DB "select nameplate->'fields'->0->>'value' from \"PartClaim\" where id=$CB2")" = "HL055L" ] \
  && pass "แถวใหม่ของ $PNAME2: ป้ายรุ่น (HL055L ไม่ใช่ HL999X ที่ส่งมา) และ Error ($A_ERR ไม่ใช่ Door Close) คัดลอกจาก $PNAME ที่ผ่านแล้ว (ฐานข้อมูล)" \
  || fail "ข้อมูลเครื่องล็อก: $(DB "select nameplate->'fields'->0->>'value'||' · '||coalesce(\"fieldCheck\"->>'errorCode','-') from \"PartClaim\" where id=$CB2")"
[ "$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SUBMITTED' order by id desc limit 1")" = "ส่งเคลมอะไหล่เก่า: $PCODE2" ] \
  || fail "ประวัติส่งเคลมรอบสองควรมีแค่ $PCODE2: $(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLAIM_SUBMITTED' order by id desc limit 1")"
C=$(REVIEW $PA "$(DEC $CB APPROVE)"); E1=$(ERR)
[ "$C|$E1" = "409|$STALE" ] && [ "$(DB "select status from \"PartClaim\" where id=$CB")|$(DB "select status from \"PartClaim\" where id=$CB2")|$(ST)" = "REJECTED|PENDING|CLAIM_REVIEW" ] \
  && pass "ตัดสินแถวเก่าของ $PNAME2 (ตีกลับไปแล้ว ไม่ได้รอตรวจ) = 409 \"$STALE\" · ไม่มีอะไรเปลี่ยน (ฐานข้อมูล)" \
  || fail "แถวเก่า: $C $E1 · $(DB "select string_agg(id||':'||status,',') from \"PartClaim\" where \"workOrderId\"=$ID")"

echo
echo "═══ ปิดเคลม ข. วันรุ่งขึ้น → ปิดงาน (ก. ผ่านตั้งแต่รอบก่อน = ยังเป็น \"อนุมัติ\")"
# ตรวจเคลมมักเป็นวันหลังจากวันที่ช่างส่ง — ย้อนเวลาปิดไปหนึ่งวัน การ์ดผลตรวจต้องยังขึ้นในงานของฉันวันที่ตรวจ
DB "update \"WorkOrder\" set \"closedAt\" = \"closedAt\" - interval '1 day' where id=$ID" >/dev/null
C=$(REVIEW $PA "$(DEC $CB2 DECLINE "หมดประกัน")")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] && [ "$(LASTLOG)" = "CLAIM_APPROVED¦$PNAME2 ปิดเคลม ไม่ส่งผู้ขาย (หมดประกัน)" ] && [ "$(LISTST)" = "APPROVED" ] \
  && pass "ปิดเคลม $PNAME2 เมื่อ $PNAME ผ่านไปตั้งแต่รอบก่อน → ปิดงาน · ประวัติ CLAIM_APPROVED (มีใบเคลมไปผู้ขาย) ไม่ใช่ CLAIM_DECLINED · ป้าย APPROVED (ฐานข้อมูล)" \
  || fail "ปิดเคลม ข. หลัง ก. ผ่าน: $C $(head -c 200 "$TMP/body") · $(ST) · $(LASTLOG) · $(LISTST)"
[ "$(MYDAY '[c.state,c.parts,c.outcome.map(o=>o.partLabel+":"+o.status+":"+(o.reason||"")).sort().join(","),c.trail[c.trail.length-1].k].join("|")')" \
  = "APPROVED|1|$(printf '%s\n' "$PNAME:APPROVED:" "$PNAME2:DECLINED:หมดประกัน" | LC_ALL=C sort | paste -sd,)|approve" ] \
  && pass "งานของฉัน (ช่างส่งเมื่อวาน ตรวจวันนี้): ยังเห็นใบนี้ · อนุมัติ $PNAME · $PNAME2 ปิดเคลม (หมดประกัน) · แถบจบที่ 'อนุมัติ' ไม่ใช่ 'ปิดงาน (ปิดเคลม…)'" \
  || fail "my-day ตรวจวันรุ่งขึ้น: $(MYDAY 'JSON.stringify({s:c.state,p:c.parts,o:c.outcome,t:c.trail})')"
[ "$(ROUND '[k.rejected,k.rejectedIds.length,k.parts.map(p=>p.status+p.round).sort().join(","),k.lockedMachine.byParts.length].join("|")')" = "false|0|APPROVED1,DECLINED2|1" ] \
  && [ "$(CODE $A GET "work-orders/$ID/claims/$CA/pdf")" = "200" ] \
  && pass "claimRound หลังปิด: ไม่อยู่ในรอบตีกลับ · $PNAME ผ่านรอบ 1 · $PNAME2 ปิดเคลมรอบ 2 · ใบเคลมของชิ้นที่ผ่านยังเปิดได้" \
  || fail "claimRound ปิดแล้ว: $(ROUND 'JSON.stringify(k)')"

echo
echo "═══ ใบที่ 2: ปิดเคลม ไม่ส่งผู้ขาย ทุกชิ้น"
claim_order 2
ID2=$ID
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
DA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
DB2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
DROP_B="อื่น ๆ: อะไหล่เก่าไม่ใช่ของที่เบิกจากบริษัท"
C=$(REVIEW $PA "$(DEC $DA DECLINE "หมดประกัน")" "$(DEC $DB2 DECLINE "$DROP_B")")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] \
  && [ "$(DB "select string_agg(status||'='||\"rejectReason\", ',' order by id) from \"PartClaim\" where \"workOrderId\"=$ID")" = "DECLINED=หมดประกัน,DECLINED=$DROP_B" ] \
  && [ "$(LASTLOG)" = "CLAIM_DECLINED¦$PNAME ปิดเคลม ไม่ส่งผู้ขาย (หมดประกัน) · $PNAME2 ปิดเคลม ไม่ส่งผู้ขาย ($DROP_B)" ] \
  && pass "ปิดเคลมทั้งสองชิ้น → ปิดงาน · เหตุผลอยู่ใน rejectReason · ประวัติ CLAIM_DECLINED (ไม่ใช้คำว่าอนุมัติ) (ฐานข้อมูล)" \
  || fail "ปิดเคลมทั้งใบ: $C $(head -c 200 "$TMP/body") · $(ST) · $(LASTLOG)"
[ "$(LISTST)" = "DECLINED" ] \
  && [ "$(MYDAY '[c.state,c.parts,c.outcome.map(o=>o.status+"="+o.reason).join(","),c.trail[c.trail.length-1].k,c.trail[c.trail.length-1].what].join("|")')" = "DECLINED|2|DECLINED=หมดประกัน,DECLINED=$DROP_B|close|ปิดเคลม ไม่ส่งผู้ขาย" ] \
  && [ "$(GET $A "work-orders/$ID" | J 'd.claims.map(c=>c.status).join(",")')" = "DECLINED,DECLINED" ] \
  && pass "ป้ายในรายการ DECLINED · งานของฉัน state DECLINED พร้อมเหตุผลทีละชิ้น แถบจบที่ 'ปิดงาน (ปิดเคลม ไม่ส่งผู้ขาย)' · รายละเอียดใบงานส่ง DECLINED" \
  || fail "DECLINED payload: $(LISTST) · $(MYDAY 'JSON.stringify({s:c.state,o:c.outcome,t:c.trail})')"
C=$(curl -s -o "$TMP/body" -w '%{http_code}' "localhost:4000/api/work-orders/$ID/claims/$DA/pdf" -H "$(H $PA)"); E1=$(ERR)
C2=$(PC $PA "work-orders/$ID/claims/$DA/pdf-link" '{}'); E2=$(ERR)
[ "$C|$E1" = "409|ชิ้นนี้ปิดเคลม ไม่ส่งผู้ขาย — ไม่มีใบเคลม" ] && [ "$C2|$E2" = "409|$E1" ] \
  && pass "ใบเคลม PDF ของชิ้นที่ปิดเคลม (เปิดตรง · ขอลิงก์) = 409 \"$E1\"" || fail "PDF DECLINED: $C $E1 · $C2 $E2"
# เฉพาะใบนี้ — ใบที่ 1 ก็มีชิ้นที่ปิดเคลมในสาขาเดียวกัน
WO2=$(DB "select code from \"WorkOrder\" where id=$ID")
HIST=$(GET $PA "part-claims?branchCode=$BC&status=DECLINED&q=$WO2")
[ "$(echo "$HIST" | J "d.rows.map(r=>r.id+':'+r.look+':'+r.statusLabel).sort().join(',')")" = "$(printf '%s\n' "$DA:DECLINED:ปิดเคลม ไม่ส่งผู้ขาย" "$DB2:DECLINED:ปิดเคลม ไม่ส่งผู้ขาย" | LC_ALL=C sort | paste -sd,)" ] \
  && [ "$(echo "$HIST" | J '[d.counts.DECLINED,d.tiles.declined].join("|")')" = "2|2" ] \
  && pass "ประวัติเคลมกรอง DECLINED ได้เฉพาะสองแถวนี้ ป้าย \"ปิดเคลม ไม่ส่งผู้ขาย\" · counts.DECLINED = tiles.declined = 2" \
  || fail "ประวัติเคลม DECLINED: $(echo "$HIST" | head -c 300)"
OUT=$(GET $PA "part-claims/export?branchCode=$BC&status=DECLINED&q=$WO2")
curl -s "localhost:4000$(echo "$OUT" | J d.path)" -o "$TMP/h.xlsx"
X=$(node -e '
  const E=require(process.argv[1]); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[2]).then(()=>{
    const s=wb.worksheets[1]; let head=null; const rows=[];
    s.eachRow((r)=>{ const v=r.values; if(v[1]==="รหัสอะไหล่") head=v; else if(head&&v[1]) rows.push(v[10]); });
    console.log([head?head.length-1:0, head?head[head.length-1]:"", rows.join(",")].join("|"));
  }).catch(e=>console.log("อ่านไม่ได้ "+e.message));
' "$SP/../backend/node_modules/exceljs" "$TMP/h.xlsx")
[ "$X" = "10|ปิดเคลม ไม่ส่งผู้ขาย|1,1" ] \
  && pass "Excel ชีต \"รวมตามอะไหล่\": คอลัมน์สุดท้าย (ที่ 10) \"ปิดเคลม ไม่ส่งผู้ขาย\" นับชิ้นละ 1 · คอลัมน์เดิมไม่ขยับ" || fail "Excel ชีต 2: $X"
BPR $PID | grep -q '^DECLINED|.*ปิดเคลม ไม่ส่งผู้ขาย$' && BPR $PID2 | grep -q '^DECLINED|.*ปิดเคลม ไม่ส่งผู้ขาย$' \
  && pass "รายงานอะไหล่ที่ไปแต่ละสาขา: ชิ้นที่ปิดเคลมเขียน \"ปิดเคลม ไม่ส่งผู้ขาย\"" || fail "branch-parts DECLINED: $(BPR $PID)"

echo
echo "═══ ใบที่ 3: ตีกลับ ก. + ปิดเคลม ข. → ช่างส่งใหม่ ข. ยังปิดเคลม → ผ่าน ก."
claim_order 2
ID3=$ID
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
EA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
EB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
C=$(REVIEW $PA "$(DEC $EA REJECT "รูปอะไหล่เก่าไม่เห็นสติกเกอร์รหัส")" "$(DEC $EB DECLINE "ไม่ใช่ชิ้นในประกัน")")
PARTS="[{\"sparePartId\":$PID,\"quantity\":1}]"
R=$(CLOSE "[$(claim_json $PID "ประตูล็อกไม่ลง บอร์ดไหม้")]"); PARTS=$FULL_PARTS
[ "$C" = "200" ] && [ "$(echo "$R" | J 'd.error')" = "$PNAME2 ปิดเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้" ] && [ "$(ST)|$(NROWS)" = "IN_PROGRESS|2" ] \
  && pass "ตีกลับ ก. + ปิดเคลม ข. → ใบกลับไปหาช่าง · ปิดงานโดยเอา $PNAME2 ออก = 400 \"…ปิดเคลมไปแล้ว — เอาออกจากอะไหล่ที่ใช้ไม่ได้\"" \
  || fail "ตีกลับ+ปิดเคลม: $C · $(echo "$R" | head -c 200) · $(ST)"
UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" >/dev/null
R=$(CLOSE "[$(claim_json $PID "ประตูล็อกไม่ลง บอร์ดไหม้"),$(claim_json $PID2)]")
EA2=$(DB "select max(id) from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(NROWS $PID)|$(NROWS $PID2)" = "2|1" ] \
  && [ "$(DB "select status from \"PartClaim\" where id=$EB")" = "DECLINED" ] \
  && pass "ช่างส่งใหม่ทั้งสองชิ้น: $PNAME2 ที่ปิดเคลมแล้วไม่มีแถวใหม่ ยังปิดเคลม · $PNAME ได้แถวใหม่ (ฐานข้อมูล)" \
  || fail "ส่งใหม่หลังปิดเคลม: $(echo "$R" | head -c 200) · ก.$(NROWS $PID) ข.$(NROWS $PID2) $(DB "select status from \"PartClaim\" where id=$EB")"
C=$(REVIEW $PA "$(DEC $EA2 APPROVE)")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] && [ "$(LASTLOG)" = "CLAIM_APPROVED¦อนุมัติ $PNAME" ] && [ "$(LISTST)" = "APPROVED" ] \
  && [ "$(MYDAY '[c.state,c.outcome.map(o=>o.partLabel+":"+o.status+":"+(o.reason||"")).sort().join(",")].join("|")')" \
     = "APPROVED|$(printf '%s\n' "$PNAME:APPROVED:" "$PNAME2:DECLINED:ไม่ใช่ชิ้นในประกัน" | LC_ALL=C sort | paste -sd,)" ] \
  && pass "ผ่าน $PNAME → ปิดงาน ประวัติ CLAIM_APPROVED · งานของฉัน: อนุมัติ $PNAME · $PNAME2 ปิดเคลม (ไม่ใช่ชิ้นในประกัน)" \
  || fail "ผ่านหลังปิดเคลม: $C · $(ST) · $(LASTLOG) · $(LISTST) · $(MYDAY 'JSON.stringify(c.outcome)')"

echo
echo "═══ ใบที่ 4: Admin Spare Part กับ Super Admin กดพร้อมกัน"
claim_order 1
claim_files $PID
R=$(CLOSE "[$(claim_json $PID)]")
FA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID")
BODY="{\"decisions\":[$(DEC $FA APPROVE)]}"
curl -s -o "$TMP/r1" -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/claim-review" -H "$(H $PA)" -H 'Content-Type: application/json' -d "$BODY" > "$TMP/c1" &
curl -s -o "$TMP/r2" -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$ID/claim-review" -H "$(H $SA)" -H 'Content-Type: application/json' -d "$BODY" > "$TMP/c2" &
wait
CODES=$(printf '%s\n' "$(cat "$TMP/c1")" "$(cat "$TMP/c2")" | sort | paste -sd,)
[ "$CODES" = "200,409" ] && [ "$(ST)" = "DONE" ] && [ "$(NLOG CLAIM_APPROVED)" = "1" ] \
  && [ "$(DB "select status||'|'||count(*) over () from \"PartClaim\" where \"workOrderId\"=$ID")" = "APPROVED|1" ] \
  && pass "กดพร้อมกันสองคน: 200 หนึ่ง 409 หนึ่ง · แถวเคลมผ่านครั้งเดียว · ประวัติ CLAIM_APPROVED แถวเดียว · ใบปิด (ฐานข้อมูล)" \
  || fail "พร้อมกัน: $CODES · $(ST) · log $(NLOG CLAIM_APPROVED) · $(head -c 120 "$TMP/r1") / $(head -c 120 "$TMP/r2")"

echo
echo "═══ ใบที่ 5: แบบเดิม { approve:true } ยังอนุมัติทุกชิ้นที่รอตรวจ"
claim_order 2
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
POST $PA "work-orders/$ID/claim-review" '{"approve":true}' >/dev/null
[ "$(ST)" = "DONE" ] && [ "$(DB "select string_agg(status,',') from \"PartClaim\" where \"workOrderId\"=$ID")" = "APPROVED,APPROVED" ] \
  && [ "$(LISTST)" = "APPROVED" ] \
  && pass "แอปที่เปิดค้างไว้ก่อนอัปเดตส่ง {approve:true}: ทั้งสองชิ้นผ่าน ใบปิด ป้าย APPROVED (ฐานข้อมูล)" \
  || fail "legacy approve: $(ST) · $(DB "select string_agg(status,',') from \"PartClaim\" where \"workOrderId\"=$ID")"

echo
echo "═══ ใบที่ 6: ตีกลับสองชิ้น → ช่างส่งใหม่เฉพาะ ก. (ข. ค้างตีกลับของรอบแรก) → ตีกลับ ก. อีก → ปิดเคลม ก."
claim_order 2
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]")
GA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
GB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
REVIEW $PA "$(DEC $GA REJECT "รูปอะไหล่เก่าเบลอ")" "$(DEC $GB REJECT "วิดีโอสั้นเกินไป")" >/dev/null
# ช่างเลิกส่งเคลม ข. (ยังใช้อยู่ในอะไหล่ที่ใช้) แก้เฉพาะ ก.
UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" >/dev/null
R=$(CLOSE "[$(claim_json $PID "ประตูล็อกไม่ลง ถ่ายรูปบอร์ดใหม่ชัดแล้ว")]")
GA2=$(DB "select max(id) from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
REVIEW $PA "$(DEC $GA2 REJECT "ยังไม่เห็นรอยไหม้บนบอร์ด")" >/dev/null
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(ST)" = "IN_PROGRESS" ] \
  && [ "$(DB "select string_agg(status, ',' order by id) from \"PartClaim\" where id in ($GB,$GA2)")" = "REJECTED,REJECTED" ] \
  && [ "$(ROUND '[k.rejected,k.rejectedIds.join(","),k.parts.map(p=>p.status).join(",")].join("|")')" = "true|$GA2|REJECTED,REJECTED" ] \
  && [ "$(MYDAY '[c.state,c.parts,c.reasons.map(x=>x.partLabel).join(",")].join("|")')" = "REJECTED|1|$PNAME" ] \
  && pass "แถวล่าสุดของทั้งสองชิ้นเป็นตีกลับ แต่ rejectedIds = [ก. รอบสอง] เท่านั้น · งานของฉันบอกต้องแก้ 1 ชิ้น ($PNAME) ไม่ใช่เหตุผลเก่าของ $PNAME2 (ฐานข้อมูล)" \
  || fail "ค้างตีกลับ: $(echo "$R" | head -c 160) · $(ST) · $(ROUND 'JSON.stringify(k)') · $(MYDAY 'JSON.stringify(c.reasons)')"
UP image/png -F "role=CLAIM_PART" -F "sparePartId=$PID" >/dev/null
R=$(CLOSE "[$(claim_json $PID "ประตูล็อกไม่ลง ถ่ายรอยไหม้บนบอร์ดแล้ว")]")
GA3=$(DB "select max(id) from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
C=$(REVIEW $PA "$(DEC $GA3 DECLINE "หมดประกัน")")
[ "$C" = "200" ] && [ "$(ST)" = "DONE" ] && [ "$(DB "select status from \"PartClaim\" where id=$GB")" = "REJECTED" ] \
  && [ "$(LISTST)" = "DECLINED" ] \
  && [ "$(MYDAY '[c.state,c.outcome.map(o=>o.partLabel+":"+o.status).join(",")].join("|")')" = "DECLINED|$PNAME:DECLINED" ] \
  && [ "$(ROUND '[k.rejected,k.rejectedIds.length].join("|")')" = "false|0" ] \
  && pass "ปิดเคลม ก. → ปิดงาน: แถว ข. ยังค้างตีกลับในฐานข้อมูล แต่ป้ายในรายการ DECLINED (ไม่แดง) · งานของฉัน DECLINED · claimRound ไม่อยู่ในรอบตีกลับ" \
  || fail "ปิดงานที่มีแถวค้างตีกลับ: $C · $(ST) · $(LISTST) · $(MYDAY 'JSON.stringify({s:c.state,o:c.outcome})') · $(ROUND 'JSON.stringify(k)')"

echo
echo "═══ ใบที่ 1 เปิดใหม่ (REOPENED) = ซ่อมครั้งใหม่ — ไม่มีอะไรล็อก ชิ้นเดิมเคลมได้อีก"
ID=$ID1
POST $A "work-orders/$ID/reopen" '{}' >/dev/null
redispatch
[ "$(ST)" = "IN_PROGRESS" ] || fail "เตรียม: ใบที่เปิดใหม่ไม่ถึงขั้นเข้างาน ($(ST))"
[ "$(LISTST)" = "null" ] && [ "$(ROUND '[k.since!==null,k.parts.length,k.rejected,String(k.lockedMachine)].join("|")')" = "true|0|false|null" ] \
  && pass "หลังเปิดใบใหม่ยังไม่ส่งเคลม: ป้ายในรายการว่าง · claimRound ไม่มีชิ้น ไม่ล็อกข้อมูลเครื่อง (เคลมของการซ่อมครั้งก่อนไม่นับ)" \
  || fail "หลังเปิดใหม่: $(LISTST) · $(ROUND 'JSON.stringify(k)')"
claim_files $PID
PARTS="[{\"sparePartId\":$PID,\"quantity\":1}]"
R=$(CLOSE "[$(claim_json $PID)]"); PARTS=$FULL_PARTS
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] && [ "$(NROWS $PID)" = "2" ] && [ "$(USED)" = "$PID" ] \
  && [ "$(ROUND '[k.parts.map(p=>p.sparePartId+":"+p.status+":"+p.round).join(","),String(k.lockedMachine)].join("|")')" = "$PID:PENDING:1|null" ] \
  && [ "$(LISTST)" = "PENDING" ] \
  && pass "ซ่อมครั้งใหม่: เคลม $PNAME ได้อีก (แถวที่ 2) · เอา $PNAME2 ออกจากอะไหล่ที่ใช้ได้ · claimRound รอตรวจรอบ 1 ข้อมูลเครื่องไม่ล็อก · ป้าย PENDING" \
  || fail "หลังเปิดใหม่ส่งเคลม: $(echo "$R" | head -c 200) · rows $(NROWS $PID) USED $(USED) · $(ROUND 'JSON.stringify(k)')"

echo
echo "═══ ตัวเลือก"
[ "$(GET $T work-orders/options | J 'd.claimDeclineReasons.join("|")')" = "หมดประกัน|ไม่ใช่ชิ้นในประกัน|อื่น ๆ" ] \
  && pass "/work-orders/options ส่ง claimDeclineReasons: หมดประกัน · ไม่ใช่ชิ้นในประกัน · อื่น ๆ" \
  || fail "options: $(GET $T work-orders/options | J 'JSON.stringify(d.claimDeclineReasons)')"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
