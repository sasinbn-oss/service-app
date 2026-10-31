#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 6 — กล่องงานตรวจเคลม + ดาวน์โหลดหลักฐานส่งผู้ขาย (ยืนยันที่ฐานข้อมูล/ตัวไฟล์ทุกข้อ)
#   · GET /part-claims/queue: เฉพาะ Admin Spare Part / Super Admin (ช่าง · หัวหน้าภาค · แอดมินทั่วไป 403) · เรียงจากที่รอนานที่สุด ·
#     รอบนับต่อชิ้น (2 ชิ้นถูกตีกลับครั้งเดียว = รอบ 2 ไม่ใช่ 3) · รหัสตัวเสียไม่ตรง (ไม่สนตัวพิมพ์/ช่องว่าง/ขีด) ·
#     เคลมซ้ำของเครื่องเดียวกัน (ตรงกับ claimRepeats ในหน้าใบงาน · ใบทดสอบไม่นับให้ใบจริง) · หมดประกัน · ใบทดสอบอยู่ในกล่องพร้อมป้าย ·
#     /queue-count เท่าหัวรายการ (และเท่าที่ฐานข้อมูลนับ)
#   · Super Admin ดูในฐานะ Admin Spare Part: อ่านกล่องงานได้ · ตัดสินเคลม 403 viewAsReadOnly แถวในฐานข้อมูลไม่เปลี่ยน ·
#     ขอลิงก์ zip ได้ (แค่ออกตั๋ว)
#   · zip หลักฐาน: ก่อนอนุมัติ 409 · แอดมินทั่วไป 403 · หลังอนุมัติ: ชื่อในไฟล์ตรงตัว (ใบเคลม PDF + รูปอะไหล่เก่าของแต่ละชิ้น ·
#     รูปอาการ · ป้ายรุ่น) ไม่มีวิดีโอ · ไฟล์ข้างในเป็นของจริง (PDF เปิดได้ · รูปตรงไบต์กับที่อัป) · ไฟล์ที่ลงวันที่หลังส่งเคลมไม่หลุดเข้าไป ·
#     กุญแจผิด 404 · ไม่แตะที่พักเอกสาร (ลิงก์ Excel ที่สั่งก่อนยังโหลดได้) · ปิดเคลมทุกชิ้น = ไม่มีอะไรให้ส่ง 409
#   · GET …/claims/files: ชื่อใน zip ตรงกับ zip จริง · วิดีโอแยกไฟล์ (วิดีโอการตรวจเช็คต่อชิ้น + วิดีโอError) ลิงก์ attachment ชื่อส่งผู้ขาย
#   · ใบเคลม PDF: บล็อก "หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้)" ชื่อเดียวกับ zip ก่อนช่องลายเซ็น · ยาวปกติยังหน้าเดียว · ยาวสุดลายเซ็นอยู่หน้าสุดท้าย
SP="$(cd "$(dirname "$0")" && pwd)"
CLAIM_SETUP_SUPER=1
. "$SP/claim-setup.sh"

for c in pdftotext pdfinfo unzip; do
  if ! command -v $c >/dev/null; then
    echo "FAIL ต้องมี $c (แพ็กเกจ poppler-utils / unzip) — เทสต์นี้เปิดดูไฟล์ใน zip และข้อความในใบเคลม PDF"
    exit 1
  fi
done
TMP=$(mktemp -d)
# unzip แปลงชื่อไฟล์ตาม locale — เครื่องที่ตั้งเป็น C/POSIX ได้ "#U0e43…" แทนอักษรไทย ทั้งที่ zip ตั้งธง UTF-8 ถูกต้อง
UZ() { LC_ALL=C.UTF-8 unzip "$@"; }
claim_extra_cleanup() {
  DB "update \"Branch\" set \"warrantyExpiresAt\"=null where code='$BC'" >/dev/null
  # ประวัติ "ดูในฐานะ" ไม่ผูกกับตาราง User (ตั้งใจ — ลบผู้ใช้แล้วประวัติยังอยู่) ลบผู้ใช้ทดสอบแล้วจึงไม่หายตาม
  # ต้องลบเองก่อนลบผู้ใช้ ไม่งั้นรายการตรวจสอบของ Super Admin มีแถวผีเพิ่มทุกครั้งที่รัน
  DB "delete from \"ViewAsLog\" where \"byUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZCS%$SUF')
      or \"targetUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZCS%$SUF')" >/dev/null
  rm -rf "${TMP:?}"
}

# ข้อความใน PDF แบบที่เทียบได้ (เหมือน claim-fixes-test) — pdftotext แตกสระ/วรรณยุกต์ไทยเป็นตัวลอย จึงตัดทิ้งก่อนเทียบทั้งสองฝั่ง
NORM() { node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").replace(/[^\S\f]|[ัิ-ฺ็-๎]/g,""))'; }
PAGES() { pdfinfo "$1" | awk '/^Pages:/{print $2}'; }
TXT() { node -e 'const [s,n]=[process.argv[1],+process.argv[2]];let o="";while(o.length<n)o+=s;process.stdout.write(o.slice(0,n))' "$1" "$2"; }
ISO() { DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"PartClaim\" where id=$1"; }
# GET แล้วเก็บคำตอบที่ $TMP/body — พิมพ์รหัส HTTP
GC() { curl -s -o "$TMP/body" -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
PC() { local body=${3:-'{}'}; curl -s -o "$TMP/body" -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$body"; }
BODY() { J "$1" < "$TMP/body"; }
# แถวของใบ $2 ในกล่องงานที่อ่านไว้ใน $1 — $3 = นิพจน์ JS ที่อ่าน r
QROW() { echo "$1" | J "const r=d.rows.find(x=>x.workOrderId===$2); r ? (()=>{ $3 })() : 'missing'"; }
# สถานะ+เหตุผล+คนตรวจของทุกแถวเคลมในใบ — ใช้ยืนยันว่า "ไม่มีอะไรเปลี่ยน"
SNAP() { DB "select string_agg(id||':'||status||':'||coalesce(\"reviewedById\"::text,'-'), ',' order by id) from \"PartClaim\" where \"workOrderId\"=$1"; }

echo "═══ ใบเก่าของเครื่องเดียวกัน — อนุมัติไปแล้ว 41 วันก่อน (ต้นทางของป้าย \"เคลมซ้ำ\")"
claim_order 1
ID1=$ID; PCODE1=$PCODE
CODE1=$(DB "select code from \"WorkOrder\" where id=$ID1")
claim_files $PID
R=$(CLOSE "[$(claim_json $PID)]")
POST $PA "work-orders/$ID1/claim-review" '{"approve":true}' >/dev/null
DB "update \"PartClaim\" set \"createdAt\"=\"createdAt\"-interval '41 days', \"reviewedAt\"=\"reviewedAt\"-interval '41 days' where \"workOrderId\"=$ID1" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID1")" = "DONE" ] || fail "เตรียม: ใบเก่าไม่ปิด ($(echo "$R" | head -c 150))"

echo
echo "═══ ใบหลัก: ส่งเคลม 2 ชิ้น → ตีกลับทั้งสองชิ้น (ส่งรอบ 2 ทีหลังใบทดสอบ)"
claim_order 2
ID2=$ID; PID_A=$PID; PID_B=$PID2; PCODE_A=$PCODE; PCODE_B=$PCODE2; PARTS2=$PARTS
CODE2=$(DB "select code from \"WorkOrder\" where id=$ID2")
NAME_A=$(DB "select name from \"SparePart\" where id=$PID_A"); NAME_B=$(DB "select name from \"SparePart\" where id=$PID_B")
claim_files $PID_A; claim_files $PID_B
SYM=$(TXT "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม " 300)
NOTE=$(TXT "วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย " 600)
# ชิ้น ก. ช่างพิมพ์รหัสตัวเสียเป็นตัวเล็ก เว้นวรรคแทนขีด — ตัวเดียวกับที่เปลี่ยนใส่ ต้องไม่นับว่า "ไม่ตรง" · ชิ้น ข. รหัสอื่นจริง ๆ
LOOSE_A=$(node -e 'console.log(" " + process.argv[1].toLowerCase().replace(/-/g, " ") + " ")' "$PCODE_A")
CLAIM_A() { claim_json $PID_A "$1" "$NOTE" | node -e 'const c=JSON.parse(require("fs").readFileSync(0,"utf8")); c.brokenPartCode=process.argv[1]; console.log(JSON.stringify(c))' "$LOOSE_A"; }
R=$(CLOSE "[$(CLAIM_A "$SYM"),$(claim_json $PID_B "$SYM" "$NOTE")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งเคลมรอบแรกไม่ผ่าน ($(echo "$R" | head -c 200))"
CA1=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID2 and \"sparePartId\"=$PID_A")
CB1=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID2 and \"sparePartId\"=$PID_B")
FIRST2=$(ISO $CA1)
POST $PA "work-orders/$ID2/claim-review" "{\"decisions\":[{\"claimId\":$CA1,\"verdict\":\"REJECT\",\"reason\":\"รูปมืด ถ่ายใหม่\"},{\"claimId\":$CB1,\"verdict\":\"REJECT\",\"reason\":\"รูปมืด ถ่ายใหม่\"}]}" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID2")" = "IN_PROGRESS" ] || fail "เตรียม: ตีกลับแล้วใบไม่กลับไปที่ช่าง"

echo
echo "═══ ใบทดสอบของเครื่องเดียวกัน: ส่งเคลม 1 ชิ้น (รอนานกว่าใบหลักที่ส่งรอบ 2 ทีหลัง)"
claim_order 1
ID3=$ID; PID_C=$PID
CODE3=$(DB "select code from \"WorkOrder\" where id=$ID3")
DB "update \"WorkOrder\" set \"isTest\"=true where id=$ID3" >/dev/null
claim_files $PID_C
R=$(CLOSE "[$(claim_json $PID_C)]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ใบทดสอบส่งเคลมไม่ผ่าน ($(echo "$R" | head -c 200))"
CC=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID3")

# ใบหลักส่งรอบ 2 (แก้อาการ/สาเหตุ — ตีกลับแบบไม่ชี้ช่อง แก้อะไรก็ได้หนึ่งอย่าง)
ID=$ID2; PARTS=$PARTS2
SYM2="$(TXT "ประตูล็อกไม่ลง ขึ้น Error dL1 หลังเปิดเครื่อง " 300)"
R=$(CLOSE "[$(CLAIM_A "$SYM2"),$(claim_json $PID_B "$SYM2" "$NOTE")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งรอบ 2 ไม่ผ่าน ($(echo "$R" | head -c 200))"
CA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID2 and \"sparePartId\"=$PID_A and status='PENDING'")
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID2 and \"sparePartId\"=$PID_B and status='PENDING'")
WAIT2=$(ISO $CA)

echo
echo "═══ กล่องงานตรวจเคลม — ใครเปิดได้"
C1=$(GC $T part-claims/queue); E1=$(BODY 'd.error')
C2=$(GC $S part-claims/queue); C3=$(GC $A part-claims/queue); C4=$(GC $A part-claims/queue-count)
[ "$C1|$C2|$C3|$C4" = "403|403|403|403" ] && [ "$E1" = "ตรวจเคลมได้เฉพาะ Admin Spare Part" ] \
  && pass "ช่าง · หัวหน้าภาค · แอดมินทั่วไป เปิดกล่องงาน/ตัวเลขตรวจเคลม = 403 \"$E1\"" || fail "403: $C1/$C2/$C3/$C4 $E1"
Q=$(GET $PA part-claims/queue); QS=$(GET $SA part-claims/queue)
# "กี่วันก่อน" ของใบเก่า ตามวันไทย ณ ตอนอ่านกล่องงาน — ไม่ใช้ 41 ตายตัว: รันคร่อมเที่ยงคืน (17:00 UTC) แล้วกลายเป็น 42 ทั้งที่แอปถูก
D1=$(DB "select (now() at time zone 'Asia/Bangkok')::date - max(((\"createdAt\" at time zone 'UTC') at time zone 'Asia/Bangkok')::date) from \"PartClaim\" where \"workOrderId\"=$ID1")
[ "$(echo "$Q" | J 'Array.isArray(d.rows)')|$(echo "$QS" | J 'Array.isArray(d.rows)')" = "true|true" ] \
  && pass "Admin Spare Part และ Super Admin เปิดกล่องงานได้ (200)" || fail "เปิดกล่องงาน: $(echo "$Q" | head -c 150) / $(echo "$QS" | head -c 150)"

echo
echo "═══ กล่องงานตรวจเคลม — ลำดับ · รอบ · ป้ายเตือน"
SORTED=$(echo "$Q" | J 'd.rows.every((r,i,a)=>i===0||a[i-1].waitingSince<=r.waitingSince)')
I2=$(echo "$Q" | J "d.rows.findIndex(r=>r.workOrderId===$ID2)"); I3=$(echo "$Q" | J "d.rows.findIndex(r=>r.workOrderId===$ID3)")
[ "$SORTED" = "true" ] && [ "$I3" -ge 0 ] && [ "$I2" -gt "$I3" ] \
  && pass "เรียงจากที่รอนานที่สุด: ใบทดสอบ (ส่งก่อน) อยู่ก่อนใบหลักที่ส่งรอบ 2 ทีหลัง (ตำแหน่ง $I3 < $I2)" || fail "ลำดับ: sorted=$SORTED ใบทดสอบ@$I3 ใบหลัก@$I2"
EXP_PARTS="$CA:$PID_A:$PCODE_A:$NAME_A:1,$CB:$PID_B:$PCODE_B:$NAME_B:1"
[ "$(QROW "$Q" $ID2 'return [r.code,r.round,r.parts.map(p=>[p.claimId,p.sparePartId,p.partCode,p.partName,p.quantity].join(":")).join(","),r.isTest].join("|")')" \
  = "$CODE2|2|$EXP_PARTS|false" ] && [ "$(QROW "$Q" $ID3 'return r.round+"|"+r.parts.length')" = "1|1" ] \
  && [ "$(DB "select count(*) from \"PartClaim\" where \"workOrderId\"=$ID2")" = "4" ] \
  && pass "ใบหลัก 2 ชิ้นที่ถูกตีกลับครั้งเดียว = รอบ 2 (ไม่ใช่ 3 · ฐานข้อมูลมี 4 แถว) · claimId ตรงแถวที่รอตรวจ · ใบทดสอบรอบ 1" \
  || fail "รอบ/ชิ้น: $(QROW "$Q" $ID2 'return JSON.stringify([r.round,r.parts])') · ใบทดสอบ $(QROW "$Q" $ID3 'return r.round')"
TNAME=$(DB "select name from \"User\" where id=$TID")
[ "$(QROW "$Q" $ID2 'return [r.techName,r.techCode,r.waitingSince,r.firstSubmittedAt,r.branchCode,r.machineCode,r.machineType,r.brand].join("|")')" \
  = "$TNAME|ZCST$SUF|$WAIT2|$FIRST2|$BC|W1|WASHER|$(DB "select brand from \"PartClaim\" where id=$CA")" ] \
  && pass "ช่างที่ส่ง ($TNAME · ZCST$SUF) · รอตั้งแต่ส่งรอบ 2 · ส่งครั้งแรก = แถวรอบแรก · สาขา/เครื่อง/ชนิดเครื่อง ตรงฐานข้อมูล" \
  || fail "หัวแถว: $(QROW "$Q" $ID2 'return JSON.stringify(r)' | head -c 400) · คาด $WAIT2 / $FIRST2"
[ "$(QROW "$Q" $ID2 'return r.flags.brokenMismatch')" = "1" ] \
  && pass "รหัสตัวเสียไม่ตรง 1 ชิ้น — ชิ้น ก. พิมพ์ \"$LOOSE_A\" (ตัวเล็ก เว้นวรรคแทนขีด) ยังนับว่าตรงกับ $PCODE_A" \
  || fail "brokenMismatch: $(QROW "$Q" $ID2 'return r.flags.brokenMismatch')"
[ "$(QROW "$Q" $ID2 'return r.flags.repeat.map(x=>[x.workOrderCode,x.partCode,x.daysAgo].join(":")).join(",")')" = "$CODE1:$PCODE1:$D1" ] && [ "$D1" -ge 41 ] \
  && [ "$(GET $A "work-orders/$ID2" | J 'd.claimRepeats.map(x=>x.code+":"+x.partCode).join(",")')" = "$CODE1:$PCODE1" ] \
  && pass "เคลมซ้ำของใบหลัก = ใบเก่า $CODE1 ($PCODE1 · $D1 วันก่อน ตามวันไทยในฐานข้อมูล) ตรงกับ claimRepeats ในหน้าใบงาน · ใบทดสอบไม่นับให้ใบจริง" \
  || fail "repeat ใบหลัก: $(QROW "$Q" $ID2 'return JSON.stringify(r.flags.repeat)') · detail $(GET $A "work-orders/$ID2" | J 'JSON.stringify(d.claimRepeats)')"
[ "$(QROW "$Q" $ID3 "return [r.isTest, r.flags.repeat.some(x=>x.workOrderCode===\"$CODE1\"&&x.daysAgo===$D1), r.flags.repeat.some(x=>x.workOrderCode===\"$CODE2\")].join('|')")" = "true|true|true" ] \
  && pass "ใบทดสอบอยู่ในกล่องงานพร้อม isTest=true · เคลมซ้ำของใบทดสอบนับใบจริงที่ส่งก่อน ($CODE1 · $CODE2 รอบแรก)" \
  || fail "ใบทดสอบ: $(QROW "$Q" $ID3 'return JSON.stringify([r.isTest,r.flags.repeat])')"
OW1=$(QROW "$Q" $ID2 'return r.flags.outOfWarranty')
DB "update \"Branch\" set \"warrantyExpiresAt\"=now()-interval '2 days' where code='$BC'" >/dev/null
OW2=$(QROW "$(GET $PA part-claims/queue)" $ID2 'return r.flags.outOfWarranty')
DB "update \"Branch\" set \"warrantyExpiresAt\"=null where code='$BC'" >/dev/null
[ "$OW1|$OW2" = "false|true" ] && pass "หมดประกัน: สาขาเปิด 12 เดือน = false · ตั้งวันหมดประกันเป็นเมื่อวานซืน = true" || fail "outOfWarranty: $OW1 → $OW2"
# นับซ้ำได้ถ้ามีเทสต์อื่นส่งเคลมพร้อมกัน — อ่านสามอย่างติดกัน ไม่ตรงลองอีกครั้ง
QC_OK=""
for _ in 1 2 3; do
  QQ=$(GET $PA part-claims/queue); QC=$(GET $PA part-claims/queue-count)
  DBC=$(DB "select count(distinct c.\"workOrderId\")||'|'||count(*) from \"PartClaim\" c join \"WorkOrder\" w on w.id=c.\"workOrderId\" where c.status='PENDING' and w.status='CLAIM_REVIEW'")
  if [ "$(echo "$QQ" | J 'd.orders+"|"+d.parts')" = "$(echo "$QC" | J 'd.orders+"|"+d.parts')" ] && [ "$(echo "$QC" | J 'd.orders+"|"+d.parts')" = "$DBC" ] \
    && [ "$(echo "$QQ" | J 'd.rows.length+"|"+d.rows.reduce((n,r)=>n+r.parts.length,0)')" = "$DBC" ]; then QC_OK=1; break; fi
done
[ -n "$QC_OK" ] && pass "queue-count = หัวรายการ = แถวในรายการ = ฐานข้อมูลนับ ($DBC ใบ|ชิ้น · รวมใบทดสอบ)" \
  || fail "queue-count: $(echo "$QC" | head -c 100) · queue $(echo "$QQ" | J 'd.orders+"|"+d.parts') · DB $DBC"

echo
echo "═══ Super Admin ดูในฐานะ Admin Spare Part — ดูได้ ตัดสินไม่ได้"
PAID=$(DB "select id from \"User\" where \"employeeCode\"='ZCSP$SUF'")
VPA=$(POST $SA auth/view-as "{\"userId\":$PAID}" | J 'd.token||""')
B0=$(SNAP $ID2)
C1=$(GC "$VPA" part-claims/queue); N1=$(BODY "d.rows.some(r=>r.workOrderId===$ID2)")
C2=$(PC "$VPA" "work-orders/$ID2/claim-review" '{"approve":true}'); V2=$(BODY 'd.viewAsReadOnly')
[ -n "$VPA" ] && [ "$C1|$N1" = "200|true" ] && [ "$C2|$V2" = "403|true" ] && [ "$(SNAP $ID2)" = "$B0" ] \
  && [ "$(DB "select status from \"WorkOrder\" where id=$ID2")" = "CLAIM_REVIEW" ] \
  && pass "ดูในฐานะ: กล่องงาน 200 · อนุมัติ 403 viewAsReadOnly · แถวเคลมและใบงานไม่เปลี่ยน (ฐานข้อมูล)" \
  || fail "ดูในฐานะ: token=${VPA:+มี} queue $C1/$N1 · review $C2/$V2 · $B0 → $(SNAP $ID2)"

echo
echo "═══ ดาวน์โหลดหลักฐาน — ก่อนอนุมัติ · คนที่ไม่ได้ส่งผู้ขาย"
C1=$(PC $PA "work-orders/$ID2/claims/evidence-link"); E1=$(BODY 'd.error')
C2=$(GC $PA "work-orders/$ID2/claims/files")
[ "$C1|$C2" = "409|409" ] && [ "$E1" = "ยังไม่มีชิ้นที่อนุมัติ — ดาวน์โหลดหลักฐานได้หลังอนุมัติ" ] \
  && pass "ยังรอตรวจ: ขอลิงก์ zip / รายการไฟล์ = 409 \"$E1\" (ใบร่างไม่ไปถึงผู้ขาย)" || fail "ก่อนอนุมัติ: $C1 $E1 · files $C2"

echo
echo "═══ ผ่าน ก. ตีกลับ ข. — ก. ส่งผู้ขายได้แล้ว · ข. ส่งรอบ 3 พร้อมรูปอาการใหม่ แล้วผ่าน"
POST $PA "work-orders/$ID2/claim-review" "{\"decisions\":[{\"claimId\":$CA,\"verdict\":\"APPROVE\"},{\"claimId\":$CB,\"verdict\":\"REJECT\",\"reason\":\"รูปอาการมืด ถ่ายใหม่\"}]}" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID2")|$(DB "select status from \"PartClaim\" where id=$CA")|$(DB "select status from \"PartClaim\" where id=$CB")" = "IN_PROGRESS|APPROVED|REJECTED" ] \
  || fail "เตรียม: ผ่าน ก. ตีกลับ ข. ไม่ได้"
C1=$(GC $PA "work-orders/$ID2/claims/files")
[ "$C1" = "200" ] && [ "$(BODY 'd.photos.join("|")')" = "${CODE2}_${PCODE_A}_ใบเคลม.pdf|${CODE2}_${PCODE_A}_รูปอะไหล่เก่า.png|${CODE2}_รูปอาการเสีย.png|${CODE2}_ป้ายรุ่น.png" ] \
  && [ "$(BODY 'd.videos.map(v=>v.name).join("|")')" = "${CODE2}_${PCODE_A}_วิดีโอการตรวจเช็ค.mp4|${CODE2}_วิดีโอError.mp4" ] \
  && pass "ใบยังอยู่ที่ช่าง (ข. ถูกตีกลับ) แต่ ก. ผ่านแล้ว: ชุดส่งผู้ขายมีเฉพาะของ ก. + ไฟล์ของเครื่อง · ไม่มีของ ข. ที่ยังไม่ผ่าน" \
  || fail "ชุดไฟล์ตอน ก. ผ่าน ข. ตีกลับ: $C1 $(head -c 300 "$TMP/body")"
# ช่างถ่ายรูปอาการใหม่ (ข้อ ⑥ ของ ข.) แล้วส่ง ข. ใหม่ — ไฟล์ของเครื่องของ ข. คนละไฟล์กับที่ส่งไปพร้อม ก.
UP image/png -F "role=CLAIM_SYMPTOM" -F "sparePartId=$PID_B" >/dev/null
R=$(CLOSE "[$(claim_json $PID_B "$SYM2" "$NOTE")]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่ง ข. รอบ 3 ไม่ผ่าน ($(echo "$R" | head -c 200))"
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID2 and \"sparePartId\"=$PID_B and status='PENDING'")
POST $PA "work-orders/$ID2/claim-review" '{"approve":true}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID2")|$(DB "select string_agg(status,',' order by id) from \"PartClaim\" where id in ($CA,$CB)")" = "DONE|APPROVED,APPROVED" ] \
  || fail "เตรียม: อนุมัติ ข. รอบ 3 ไม่ผ่าน"
C1=$(PC $A "work-orders/$ID2/claims/evidence-link"); E1=$(BODY 'd.error')
C2=$(GC $A "work-orders/$ID2/claims/files"); C3=$(PC $T "work-orders/$ID2/claims/evidence-link"); C4=$(PC $S "work-orders/$ID2/claims/evidence-link")
[ "$C1|$C2|$C3|$C4" = "403|403|403|403" ] && [ "$E1" = "ดาวน์โหลดหลักฐานส่งผู้ขายได้เฉพาะ Admin Spare Part" ] \
  && pass "แอดมินทั่วไป (ลิงก์/รายการไฟล์) · ช่าง · หัวหน้าภาค = 403 \"$E1\"" || fail "403 หลักฐาน: $C1/$C2/$C3/$C4 $E1"

echo
echo "═══ zip หลักฐานหลังอนุมัติ"
# ลิงก์ Excel ที่สั่งก่อน zip — zip ต้องไม่ไปเบียดที่พักเอกสารของคนอื่น
XP=$(GET $PA "part-claims/export?status=ALL" | J 'd.path')
# รูปอะไหล่เก่าที่ลงวันที่หลังส่งเคลม (แนบไม่ได้แล้วตอนนี้ — ใส่ตรงฐานข้อมูล) ต้องไม่หลุดเข้า zip · ที่อยู่ไฟล์ไม่มีจริง ถ้าหลุดดาวน์โหลดจะพัง
LATE=$(DB "insert into \"WorkOrderAttachment\"(\"workOrderId\",kind,role,\"fileName\",\"mimeType\",\"sizeBytes\",\"objectKey\",\"uploadedAt\",\"sparePartId\",\"createdById\",\"createdAt\")
  values ($ID2,'IMAGE','CLAIM_PART','late.png','image/png',100,'work-orders/none/late.png',now(),$PID_A,$TID,now()+interval '1 minute') returning id" | head -1)
C1=$(PC $PA "work-orders/$ID2/claims/evidence-link"); ZPATH=$(BODY 'd.path'); ZNAME=$(BODY 'd.filename')
[ "$C1" = "200" ] && [ "$ZNAME" = "${CODE2}_หลักฐาน.zip" ] && echo "$ZPATH" | grep -qE '^/api/work-orders/claims/evidence-zip/[A-Za-z0-9_-]+\?token=[A-Za-z0-9_-]+$' \
  && pass "Admin Spare Part ขอลิงก์ zip ได้ (ไม่ติด PARTS_ADMIN_WRITES) · ชื่อ ${CODE2}_หลักฐาน.zip · ลิงก์มีกุญแจของตัวเอง" \
  || fail "evidence-link: $C1 $(head -c 200 "$TMP/body")"
ZC=$(curl -s -D "$TMP/zh" -o "$TMP/e.zip" -w '%{http_code}' "localhost:4000$ZPATH")
NAMES=$(UZ -Z1 "$TMP/e.zip" 2>/dev/null | paste -sd'|')
EXP="${CODE2}_${PCODE_A}_ใบเคลม.pdf|${CODE2}_${PCODE_A}_รูปอะไหล่เก่า.png|${CODE2}_${PCODE_B}_ใบเคลม.pdf|${CODE2}_${PCODE_B}_รูปอะไหล่เก่า.png|${CODE2}_รูปอาการเสีย.png|${CODE2}_ป้ายรุ่น.png|${CODE2}_${PCODE_B}_รูปอาการเสีย.png"
[ "$ZC" = "200" ] && grep -qi '^content-type: application/zip' "$TMP/zh" && grep -qi "filename\*=UTF-8''$(node -pe 'encodeURIComponent(process.argv[1])' "${CODE2}_หลักฐาน.zip")" "$TMP/zh" \
  && [ "$NAMES" = "$EXP" ] && ! UZ -Z1 "$TMP/e.zip" | grep -qiE '\.(mp4|mov|webm)$' \
  && pass "zip: ใบเคลม PDF + รูปอะไหล่เก่าของแต่ละชิ้น แล้วรูปอาการ · ป้ายรุ่น (ใช้ร่วมกันส่งครั้งเดียว) · รูปอาการใหม่ของ ข. ต่อรหัส $PCODE_B ไม่ทับของ ก. — ชื่อตรงตัวทั้ง 7 ไฟล์ · ไม่มีวิดีโอ · ไม่มีไฟล์ที่ลงวันที่หลังส่ง" \
  || fail "zip: HTTP $ZC · $(echo "$NAMES" | tr '|' '\n' | sed 's/^/      /' | paste -sd' ') · คาด $EXP"
mkdir -p "$TMP/x" && UZ -q -o "$TMP/e.zip" -d "$TMP/x" 2>/dev/null
UZ -tq "$TMP/e.zip" >/dev/null 2>&1 && [ "$(PAGES "$TMP/x/${CODE2}_${PCODE_A}_ใบเคลม.pdf")" = "1" ] \
  && pdftotext "$TMP/x/${CODE2}_${PCODE_B}_ใบเคลม.pdf" - | grep -q "$PCODE_B" \
  && cmp -s "$TMP/x/${CODE2}_${PCODE_A}_รูปอะไหล่เก่า.png" "$SP/site-photo.png" && cmp -s "$TMP/x/${CODE2}_ป้ายรุ่น.png" "$SP/site-photo.png" \
  && ! pdftotext "$TMP/x/${CODE2}_${PCODE_A}_ใบเคลม.pdf" - | grep -q "ร่าง" \
  && pass "ไฟล์ใน zip เป็นของจริง: zip ไม่เสีย · ใบเคลม PDF เปิดได้ (หน้าเดียว ไม่มีคำว่าร่าง · ใบของ ข. มีรหัส $PCODE_B) · รูปตรงไบต์กับไฟล์ที่อัป" \
  || fail "เนื้อไฟล์ใน zip: test=$(UZ -tq "$TMP/e.zip" 2>&1 | head -c 80) · $(ls "$TMP/x" | paste -sd' ')"
C1=$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000${ZPATH%%\?*}?token=wrong-token")
C2=$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000${ZPATH%%\?*}")
C3=$(curl -s -o "$TMP/x.xlsx" -w '%{http_code}' "localhost:4000$XP")
[ "$C1|$C2|$C3" = "404|404|200" ] && [ "$(head -c 2 "$TMP/x.xlsx")" = "PK" ] \
  && pass "กุญแจผิด/ไม่มีกุญแจ = 404 · ลิงก์ Excel ประวัติเคลมที่สั่งก่อน zip ยังโหลดได้ (zip ไม่เก็บในที่พักเอกสาร)" \
  || fail "token/Excel: ผิด $C1 · ไม่มี $C2 · Excel $C3"

echo
echo "═══ รายการไฟล์ส่งผู้ขาย (วิดีโอแยกไฟล์)"
C1=$(GC $PA "work-orders/$ID2/claims/files")
FP=$(BODY 'd.photos.join("|")'); FZ=$(BODY 'd.zip.filename')
VN=$(BODY 'd.videos.map(v=>v.name).join("|")')
EXPV="${CODE2}_${PCODE_A}_วิดีโอการตรวจเช็ค.mp4|${CODE2}_${PCODE_B}_วิดีโอการตรวจเช็ค.mp4|${CODE2}_วิดีโอError.mp4"
[ "$C1" = "200" ] && [ "$FP" = "$NAMES" ] && [ "$FZ" = "$ZNAME" ] && [ "$VN" = "$EXPV" ] \
  && pass "claims/files: ชื่อใน zip ตรงกับ zip ที่ดาวน์โหลดจริงทุกตัว · วิดีโอ 3 ไฟล์ (ตรวจเช็คต่อชิ้น + วิดีโอError ของเครื่อง)" \
  || fail "claims/files: $C1 photos=$FP · videos=$VN"
URL=$(BODY 'd.videos[2].url'); VID=$(BODY 'd.videos[2].attachmentId')
# ชื่อไฟล์ใน response-content-disposition ถูกเข้ารหัสสองชั้น (filename*=UTF-8'' แล้วเข้ารหัสอีกทีใน query) — ถอดสองครั้ง
DEC=$(node -pe 'decodeURIComponent(decodeURIComponent(process.argv[1]))' "$URL")
VC=$(curl -s -D "$TMP/vh" -o "$TMP/v.bin" -w '%{http_code}' "$URL")
[ "$(DB "select role from \"WorkOrderAttachment\" where id=$VID")" = "CLAIM_ERROR_VIDEO" ] \
  && echo "$DEC" | grep -q "response-content-disposition=attachment" && echo "$DEC" | grep -q "${CODE2}_วิดีโอError.mp4" \
  && [ "$VC" = "200" ] && grep -qi '^content-disposition: attachment' "$TMP/vh" && cmp -s "$TMP/v.bin" "$SP/site-photo.png" \
  && pass "ลิงก์วิดีโอตรงไปที่เก็บไฟล์: attachment + ชื่อ ${CODE2}_วิดีโอError.mp4 · เปิดได้ (200) ไบต์ตรงไฟล์ที่อัป" \
  || fail "ลิงก์วิดีโอ: role=$(DB "select role from \"WorkOrderAttachment\" where id=$VID") HTTP $VC · $(echo "$DEC" | head -c 300)"
C1=$(PC "$VPA" "work-orders/$ID2/claims/evidence-link"); P1=$(BODY 'd.path||""')
[ "$C1" = "200" ] && [ -n "$P1" ] && pass "ดูในฐานะ Admin Spare Part ขอลิงก์ zip ได้ (200 — แค่ออกตั๋ว ไม่แตะข้อมูลงาน)" || fail "ดูในฐานะ evidence-link: $C1 $(head -c 150 "$TMP/body")"

echo
echo "═══ ใบเคลม PDF: บล็อกหลักฐาน = ชื่อไฟล์ที่ผู้ขายได้"
curl -s "localhost:4000/api/work-orders/$ID2/claims/$CA/pdf" -H "$(H $PA)" -o "$TMP/a.pdf"
pdftotext -layout "$TMP/a.pdf" - | NORM > "$TMP/a.txt"
EVA=("${CODE2}_${PCODE_A}_รูปอะไหล่เก่า.png" "${CODE2}_${PCODE_A}_วิดีโอการตรวจเช็ค.mp4" "${CODE2}_วิดีโอError.mp4" "${CODE2}_รูปอาการเสีย.png" "${CODE2}_ป้ายรุ่น.png")
ORDER=$(node -e '
const t = require("fs").readFileSync(process.argv[1], "utf8");
const norm = (s) => s.replace(/[^\S\f]|[ัิ-ฺ็-๎]/g, "");
const [title, sig, ...names] = process.argv.slice(2).map(norm);
const at = names.map((n) => t.indexOf(n));
const iT = t.indexOf(title), iS = t.indexOf(sig);
console.log(iT >= 0 && at.every((i, k) => i > iT && (k === 0 || i > at[k - 1])) && at[at.length - 1] < iS ? "ok" : "bad " + [iT, ...at, iS].join(","));
' "$TMP/a.txt" "หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้)" "ผู้ขอเคลม" "${EVA[@]}")
[ "$ORDER" = "ok" ] && [ "$(PAGES "$TMP/a.pdf")" = "1" ] && ! grep -q "$(echo "หลักฐานที่แนบในระบบ" | NORM)" "$TMP/a.txt" \
  && pass "ใบเคลม ก. (อาการ 300 · เช็คอะไรบ้าง 600 ตัว) หน้าเดียว · \"หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้)\" ลงชื่อไฟล์ 5 ตัวตามลำดับ ตรงกับชื่อใน zip/ปุ่มวิดีโอ · ก่อนช่องลายเซ็น" \
  || fail "บล็อกหลักฐานใน PDF: $ORDER · $(PAGES "$TMP/a.pdf") หน้า"
curl -s "localhost:4000/api/work-orders/$ID2/claims/$CB/pdf" -H "$(H $PA)" -o "$TMP/b.pdf"
pdftotext -layout "$TMP/b.pdf" - | NORM > "$TMP/b.txt"
EVB="$(echo "${CODE2}_${PCODE_B}_รูปอาการเสีย.png" | NORM)"
grep -qF "$EVB" "$TMP/b.txt" && grep -qF "$(echo "${CODE2}_ป้ายรุ่น.png" | NORM)" "$TMP/b.txt" && ! grep -qF "$(echo "${CODE2}_รูปอาการเสีย.png" | NORM)" "$TMP/b.txt" \
  && pass "ใบเคลม ข. ลงรูปอาการชื่อ ${CODE2}_${PCODE_B}_รูปอาการเสีย.png (ไฟล์ของรอบ ข.) ตรงกับใน zip · ป้ายรุ่นชื่อเดียวกับของ ก. (ไฟล์เดียวกัน)" \
  || fail "หลักฐานในใบเคลม ข.: $(grep -o 'WO[^ ]*' "$TMP/b.txt" | head -8 | paste -sd' ')"
# ยาวสุดที่ปิดงานรับ (อาการ 1000 · เช็คอะไรบ้าง 2000) — บล็อกหลักฐานอยู่หลังเนื้อหา ก่อนลายเซ็น · ลายเซ็นทั้งสองฝั่งอยู่หน้าสุดท้าย
DB "update \"PartClaim\" set symptom='$(TXT "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม " 1000)', \"checkNote\"='$(TXT "วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย " 2000)' where id=$CB" >/dev/null
curl -s "localhost:4000/api/work-orders/$ID2/claims/$CB/pdf" -H "$(H $PA)" -o "$TMP/long.pdf"
pdftotext -layout "$TMP/long.pdf" - | NORM > "$TMP/long.txt"
LASTITEM=$(echo "$TS" | J 'd[d.length-1]' | NORM)
LAYOUT=$(node -e '
const t = require("fs").readFileSync(process.argv[1], "utf8");
const [item, ev, sig, rcv] = process.argv.slice(2);
const pages = t.split("\f"); if (pages[pages.length - 1] === "") pages.pop();
const last = pages.length - 1, all = pages.join("\f");
const pageOf = (i) => all.slice(0, i).split("\f").length - 1;
const once = (s) => all.indexOf(s) >= 0 && all.indexOf(s) === all.lastIndexOf(s);
const iItem = all.lastIndexOf(item), iEv = all.indexOf(ev), iSig = all.indexOf(sig), iRcv = all.indexOf(rcv);
const ok = once(sig) && once(rcv) && once(ev) && iItem >= 0 && iItem < iEv && iEv < iSig && iEv < iRcv
  && pageOf(iSig) === last && pageOf(iRcv) === last;
console.log(ok ? "ok " + pages.length : "bad pages=" + pages.length + " item@" + pageOf(iItem) + " ev@" + pageOf(iEv) + " sig@" + pageOf(iSig) + " order=" + [iItem, iEv, iSig].join(","));
' "$TMP/long.txt" "$LASTITEM" "$(echo "หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้)" | NORM)" "$(echo "ผู้ขอเคลม" | NORM)" "$(echo "ผู้รับเคลม" | NORM)")
[ "${LAYOUT%% *}" = "ok" ] \
  && pass "ข้อความยาวสุด: บล็อกหลักฐานต่อจากเนื้อหาสุดท้าย ก่อนลายเซ็น · ลายเซ็นทั้งสองฝั่งอยู่หน้าสุดท้าย (${LAYOUT#ok } หน้า)" \
  || fail "จัดหน้าข้อความยาว: $LAYOUT"

echo
echo "═══ ปิดเคลมทุกชิ้น — ไม่มีอะไรส่งผู้ขาย"
C1=$(PC $PA "work-orders/$ID3/claim-review" "{\"decisions\":[{\"claimId\":$CC,\"verdict\":\"DECLINE\",\"reason\":\"หมดประกัน\"}]}")
C2=$(PC $PA "work-orders/$ID3/claims/evidence-link"); E2=$(BODY 'd.error')
Q2=$(GET $PA part-claims/queue)
[ "$C1|$C2" = "200|409" ] && [ "$E2" = "ยังไม่มีชิ้นที่อนุมัติ — ดาวน์โหลดหลักฐานได้หลังอนุมัติ" ] \
  && [ "$(DB "select status from \"WorkOrder\" where id=$ID3")|$(DB "select status from \"PartClaim\" where id=$CC")" = "DONE|DECLINED" ] \
  && [ "$(echo "$Q2" | J "d.rows.some(r=>r.workOrderId===$ID2||r.workOrderId===$ID3)")" = "false" ] \
  && pass "ใบทดสอบปิดเคลมทุกชิ้น → ปิดงาน (ฐานข้อมูล DONE/DECLINED) · ขอ zip = 409 · ใบที่ตัดสินแล้วทั้งสองใบหายจากกล่องงาน" \
  || fail "ปิดเคลมทุกชิ้น: review $C1 · link $C2 $E2 · ยังในกล่อง $(echo "$Q2" | J "d.rows.filter(r=>r.workOrderId===$ID2||r.workOrderId===$ID3).map(r=>r.code).join(',')")"
DB "delete from \"WorkOrderAttachment\" where id=${LATE:-0}" >/dev/null

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
