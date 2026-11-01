#!/bin/bash
# ทดสอบ: เคลมอะไหล่เก่า ก้อน 2 — ผู้ตรวจเห็นครบในหน้าเดียว (ข้อมูลที่หน้าตรวจอ่าน + ใบเคลม PDF · ยืนยันที่ฐานข้อมูล)
#   · fieldCheck.offered = ข้อเช็คตามคู่มือของ Error ที่ช่างเลือก (รายการที่ช่างเห็นตอนนั้น) · "ไม่มี Error ขึ้น" = []
#   · claims[] มี createdByName/createdByCode · round (นับต่อชิ้น) · firstSubmittedAt (วันที่ส่งครั้งแรกของห่วงโซ่) · evidenceIds
#     (ไฟล์ตาม claimEvidenceFor — ไฟล์ที่ลงเวลาหลังส่งไม่อยู่ทั้งในรายการและในใบเคลม · แถวรอบเก่าไม่เห็นไฟล์รอบใหม่)
#   · claimRepeats เฉพาะฝั่งแอดมิน (แอดมิน · Admin Spare Part): ใบเก่าของเครื่องเดียวกัน · ไม่รวมแถวของงานซ่อมครั้งนี้ของใบนี้
#     (แถวก่อนเปิดใบใหม่ยังนับ) · ไม่รวมใบทดสอบ (ใบทดสอบเองเห็นใบจริง) · ช่าง/หัวหน้าภาคไม่มีคีย์นี้เลย
#   · ใบเคลม PDF: "ชิ้นที่ n จาก m" (ชิ้นที่ช่างเลิกส่งหลังถูกตีกลับไม่นับ) · "Error ที่เครื่องขึ้น" ชื่อไทย / "ไม่มี Error ขึ้น" ·
#     ภาพตัดรุ่น/Serial 2 ภาพ · ภาพตัดที่ไม่ใช่ JPEG (PNG สลับแถว) ไม่ทำให้เซิร์ฟเวอร์ล่ม · "หน้า 1/1" ·
#     ใบทดสอบมีเส้น "ใบทดสอบ" (ใบจริงไม่มี)
#   · เปิดใบใหม่ (REOPENED) แล้วส่งเคลมชิ้นเดิม: round เริ่ม 1 ใหม่ · เคลมที่อนุมัติไปก่อนเปิดใบใหม่ขึ้นเป็นเคลมซ้ำของใบตัวเอง
#   · รายการ Error ในคู่มือมี label ขึ้นต้นภาษาไทย อังกฤษในวงเล็บ
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"

if ! command -v pdftotext >/dev/null; then
  echo "FAIL ต้องมี pdftotext (แพ็กเกจ poppler-utils) — เทสต์นี้อ่านข้อความในใบเคลม PDF"
  exit 1
fi
TMP=$(mktemp -d)
claim_extra_cleanup() { rm -rf "${TMP:?}"; }

# ข้อความใน PDF แบบที่เทียบได้ (เหมือน claim-fixes-test.sh) — pdftotext แตกสระบน/ล่างและวรรณยุกต์ไทยเป็นตัวลอย
NORM() { node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").replace(/[^\S\f]|[ัิ-ฺ็-๎]/g,""))'; }
# ใบเคลม PDF ของแถว $1 (ใบงาน $ID) — เก็บไฟล์ไว้ที่ $TMP/$1.pdf แล้วพิมพ์ข้อความที่ NORM แล้ว
PDFTXT() { curl -s "localhost:4000/api/work-orders/$ID/claims/$1/pdf" -H "$(H $A)" -o "$TMP/$1.pdf"; pdftotext -layout "$TMP/$1.pdf" - | NORM; }
# ข้อความ $2 อยู่ในข้อความ PDF $1 (NORM ทั้งคู่)
HAS() { echo "$1" | grep -qF "$(printf '%s' "$2" | NORM)"; }
PAGES() { pdfinfo "$1" 2>/dev/null | awk '/^Pages:/{print $2}'; }
# จำนวนภาพในไฟล์ PDF (XObject ชนิดภาพ — หัวกระดาษ + ภาพตัดป้าย)
IMGS() { grep -ac '/Subtype /Image' "$1"; }
ISO() { DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"$1\" where id=$2"; }
# JSON เทียบได้ (Postgres พิมพ์ jsonb มีช่องว่างหลังจุลภาค)
JN() { node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")))'; }
# แถวเคลม $2 ในคำตอบ $1 — $3 = นิพจน์ JS ที่อ่าน c
ROW() { echo "$1" | J "const c=d.claims.find(x=>x.id===$2); c ? ($3) : 'missing'"; }
# ไฟล์ที่ควรเป็นหลักฐานของแถว $1 ตามฐานข้อมูล: ไฟล์เคลมที่แนบในรอบ ถึงเวลาที่ส่ง ไฟล์ล่าสุดต่อชนิด + รูปป้ายที่ผูกไว้
# รูปอะไหล่เก่า/วิดีโอการตรวจเช็ค = ของชิ้นนั้น · วิดีโอ Error/รูปอาการ = ของเครื่อง ไฟล์ล่าสุดของชิ้นไหนก็ได้ (เคลมก้อน 5)
EVDB() {
  DB "with c as (select * from \"PartClaim\" where id=$1),
      f as (select distinct on (a.role) a.id from \"WorkOrderAttachment\" a, c
            where a.\"workOrderId\"=c.\"workOrderId\" and a.role like 'CLAIM_%'
              and (a.\"sparePartId\"=c.\"sparePartId\" or a.role in ('CLAIM_ERROR_VIDEO','CLAIM_SYMPTOM'))
              and a.\"createdAt\"<=c.\"createdAt\"
            order by a.role, a.\"createdAt\" desc, a.id desc)
      select string_agg(id::text, ',' order by id) from
        (select id from f union select (nameplate->>'photoId')::int from c where nameplate->>'photoId' is not null) x"
}

# ภาพตัดบรรทัดรุ่น/Serial จริง (JPEG เล็ก แบบที่แอปเก็บตอนสแกน) — ใบเคลมต้องวาดทั้งสองภาพข้างค่า
CROP_MODEL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//wAALCAAaAHgBAREA/8QAGwABAAICAwAAAAAAAAAAAAAAAAMEAQUCBgf/xAAnEAABBAEDBAIDAQEAAAAAAAABAAIDBBEFEiEGEyIxFEEyUWGRof/aAAgBAQAAPwD05EREREREREWg6tkdDDpcjYpJnN1GEiOPG535cDJA/wBKghuS2+tKRl0+1U20Z8CfZ5ecfra53/VY6ScWdJV3tbuLRKQP35uWmNeKHouDqFgzqvbjtOsj83ucQSwn7aclu30r17SnWddv2JunquoNIjEcllzWjAbyG5BOc594H9WLcMOsVtFlp6PHapNbIPjyhrWREDaA73jBBHAPpVtSdVi6V1ejBpsOnTV3xmaGHGw7nNw4EAZyB9gHhdzRERERVb1CK98bvOePjztnZtI5c3OAePXKPoRP1SHUC5/dhhfC0AjaQ4tJzx78QqGn6AdOETK+r6j2I3Fwgd2iw5OSD4Zxz+1yb09Va9re/ZNRkvdbTLh2g7O4fW7GeducfxTWdIEtmSeC/dqumx3WwvbtfgYzhwODj7bhYdolZtarDUlnpmq0tifA/wAgD7B3Ah2cZ5B55UUnT1WXTrlSSey51wgz2C4GRxGMfWBjHoDCs0aE1SVz5dUu2wW42T9vA/o2sacq8iIiIiIiIiIiIiIv/9k="
CROP_SERIAL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//wAALCAAaAHgBAREA/8QAGwABAAIDAQEAAAAAAAAAAAAAAAIDAQQFBgf/xAAtEAABAwQBAwMCBgMAAAAAAAABAgMEAAURIRITMUEUQlEGFSIjNFJhcTND0f/aAAgBAQAAPwD6dSlKUpSlKUpSladzgIuMdLDzq0MhYW4lJx1Ej2k/HbP9VxbOYca43CbbgmNZGmAFKTppbiSSpaB2wBgEjRPziqIaHnfq23XKUlSHZkWQUtq/1NAtcE4+dkn+VEeKizCYuVlud1ljE8OyOm/n8cfpqUlASfbjiDgd9571uuMQJ9sh3m/qSpj0aFKYe/xJWoAlXHyrYA7/AMd65bvq2LLb4bjMoR51xUlEfmQ4GMLUhoknIzxGd6BIqx14WSLeBGt4t0xEBT7bTLvNlQGRzAwMKBIzreu9bUq3xrL9olW9PB9cpph5wHJkJXpXM+4+7J+KoZhMXKy3O6yxieHZHTfz+OP01KSgJPtxxBwO+89633GGrlaoFzn29+4LXGQTETwKApQBKuKiAT4768VRY4zc/wCm1x31PlDUlwqipWQpsBRIYUVYJwCB8HW8VzjKVbPvzlviLthbt/VahrSBlQ5ZeASSkDYGj434roSrfGsv2iVb08H1ymmHnAcmQlelcz7j7sn4r1FK0Lza0XiF6R2VIYbKgpXQKQVge1XIEFPyMbqMa0hppbEqa/OjrRw6EltrgB/SUD/lUD6XsiLjHmtW2K05HCuKW2EJSSSCFEY7jjo+MmpSLBGfckYkSmo8pXKRGbWA26fOdZGfPEjPmsXGwonzo8v18uOqMnDTbXTKEn9wSpCvxeM/FXrtKXoPppcyVIUlwOIfWUpcbUOxBSkDX9eTnNYi2dhlx52Q8/Neeb6S3JBSTw/aAAABvwN+ari2JiO8wtUqVIbi/p2nlhSWdYyMAEkAkAqJxmsSLBGfckYkSmo8pXKRGbWA26fOdZGfPEjPmrpdpQ/ITIjy5MN4IDZVHUnCkjYBSoFOsneM7qoWCImH0EOyEOdYyPUBz80uHRUT2OtYxjGsVONZmGn3X5Lz8191roqckFJ/L7lICQAAfOt1CLYmI7zC1SpUhuL+naeWFJZ1jIwASQCQConGa6tKUpSlKUpSlKUpX//Z"
# ป้ายรุ่นที่ยืนยันรุ่นกับ Serial ทีละช่องแล้ว (confirmed ล่วงหน้าไว้ให้ก้อน 5 — เซิร์ฟเวอร์ตอนนี้ไม่อ่าน)
PLATE2="{\"fields\":[{\"key\":\"model\",\"label\":\"รุ่น\",\"value\":\"HL055L\",\"source\":\"SCAN\",\"crop\":\"$CROP_MODEL\",\"confirmed\":true},{\"key\":\"serial\",\"label\":\"Serial\",\"value\":\"2402600330\",\"source\":\"SCAN\",\"crop\":\"$CROP_SERIAL\",\"confirmed\":true}],\"verified\":true}"
ERRCODE="E dL / E dL1 / E dL2"

echo "═══ ใบเก่าของเครื่องเดียวกัน (W1 สาขาเดียวกัน) — เคลมอนุมัติไปแล้ว 40 วันก่อน"
claim_order 1
EID=$ID; EPCODE=$PCODE
ECODE=$(DB "select code from \"WorkOrder\" where id=$EID")
claim_files $PID
R=$(CLOSE "[$(claim_json $PID)]")
POST $PA "work-orders/$EID/claim-review" '{"approve":true}' >/dev/null
DB "update \"PartClaim\" set \"createdAt\"=\"createdAt\"-interval '40 days', \"reviewedAt\"=\"reviewedAt\"-interval '40 days' where \"workOrderId\"=$EID" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$EID")" = "DONE" ] || fail "เตรียม: ใบเก่าไม่ปิด ($(echo $R | head -c 150))"
ECLAIM=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$EID")

echo
echo "═══ ใบนี้: ส่งเคลม 2 ชิ้น พร้อมภาพตัดรุ่น/Serial"
claim_order 2
MID=$ID
# ใบทดสอบที่คัดลอกตอนใบจริงยังอยู่ที่ช่าง — ปิดพร้อมเคลมทีหลัง (ใบเคลมต้องมีเส้น "ใบทดสอบ" และไม่นับเป็นเคลมซ้ำของใบจริง)
CID=$(POST $A "work-orders/$MID/test-copy" '{}' | J 'd.id')
IDS="$CID $IDS"
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]" "$PLATE2")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งเคลมไม่ผ่าน ($(echo $R | head -c 200))"
CA=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID")
CB=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2")
TNAME=$(DB "select name from \"User\" where \"employeeCode\"='ZCST$SUF'")

G=$(GET $T "work-orders/$ID")
GUIDE=$(echo "$G" | J "JSON.stringify(d.claimGuide.errors.find(e=>e.code===\"$ERRCODE\").checks)")
OFF=$(DB "select string_agg(distinct (\"fieldCheck\"->'offered')::text, '¦') from \"PartClaim\" where \"workOrderId\"=$ID")
CHK=$(DB "select string_agg(distinct (\"fieldCheck\"->'checked')::text, '¦') from \"PartClaim\" where \"workOrderId\"=$ID")
[ "$(echo "$GUIDE" | J 'd.length')" = "4" ] && [ "$(echo "$OFF" | JN)" = "$GUIDE" ] && [ "$(echo "$CHK" | JN)" = '["Solenoid ไม่ฝืด"]' ] \
  && pass "fieldCheck.offered ทั้ง 2 แถว = ข้อเช็คตามคู่มือของ $ERRCODE ทั้ง 4 ข้อ (ฐานข้อมูล) · checked ยังเป็นข้อที่ช่างติ๊ก" \
  || fail "offered: DB=$OFF guide=$GUIDE checked=$CHK"

SENT=$(ISO PartClaim $CA)
[ "$(ROW "$G" $CA '[c.createdByName,c.createdByCode,c.round,c.firstSubmittedAt].join("|")')|$(ROW "$G" $CB '[c.createdByName,c.createdByCode,c.round,c.firstSubmittedAt].join("|")')" \
  = "$TNAME|ZCST$SUF|1|$SENT|$TNAME|ZCST$SUF|1|$SENT" ] \
  && pass "claims[]: createdByName/createdByCode = ช่างที่ส่ง ($TNAME · ZCST$SUF) · round 1 · firstSubmittedAt = เวลาส่งในฐานข้อมูล ทั้งสองชิ้น" \
  || fail "claims extras: $(echo "$G" | J 'JSON.stringify(d.claims.map(c=>[c.id,c.createdByName,c.createdByCode,c.round,c.firstSubmittedAt]))') · DB $SENT"
EA=$(ROW "$G" $CA 'c.evidenceIds.slice().sort((a,b)=>a-b).join(",")'); EB=$(ROW "$G" $CB 'c.evidenceIds.slice().sort((a,b)=>a-b).join(",")')
# ไฟล์ของเครื่องที่แนบล่าสุด (claim_files ของชิ้นที่ 2 แนบทีหลัง) — ใช้ร่วมทั้งสองชิ้น (เคลมก้อน 5)
MSYM=$(DB "select max(id) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_SYMPTOM'")
MVID=$(DB "select max(id) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_ERROR_VIDEO'")
[ -n "$EA" ] && [ "$EA" = "$(EVDB $CA)" ] && [ "$EB" = "$(EVDB $CB)" ] && [ "$(echo "$EA" | tr ',' '\n' | wc -l)" = "5" ] \
  && [ "$(ROW "$G" $CA "c.evidenceIds.includes($MSYM)&&c.evidenceIds.includes($MVID)")|$(ROW "$G" $CB "c.evidenceIds.includes($MSYM)&&c.evidenceIds.includes($MVID)")" = "true|true" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where id in ($EA) and role in ('CLAIM_PART','CLAIM_CHECK_VIDEO') and \"sparePartId\"<>$PID")" = "0" ] \
  && pass "evidenceIds ตรงฐานข้อมูลทั้งสองชิ้น: รูปอะไหล่เก่า/วิดีโอการตรวจเช็คของชิ้นนั้น (ไม่ปนอีกชิ้น) + วิดีโอ Error/รูปอาการล่าสุดของเครื่อง (ใช้ร่วม) + รูปป้าย" \
  || fail "evidenceIds: A=$EA (DB $(EVDB $CA)) · B=$EB (DB $(EVDB $CB)) · เครื่อง $MSYM/$MVID"

echo
echo "═══ ไฟล์ที่ลงเวลาหลังส่งเคลม ไม่ใช่หลักฐานของแถวนั้น (หน้าตรวจ + ใบเคลม PDF)"
# รูปอาการเป็นของเครื่อง ใช้ร่วมทุกชิ้น (เคลมก้อน 5) — เลื่อนรูปอาการทุกไฟล์ของใบไปหลังเวลาส่ง แล้วทั้งสองแถวต้องไม่มีรูปอาการ
# (เลื่อนไฟล์เดียว แถวจะใช้รูปอาการไฟล์ก่อนหน้าแทน ซึ่งถูกตามกติกา แต่พิสูจน์ขอบบนไม่ได้) · เก็บเวลาเดิมไว้คืนทีละไฟล์
LATE=$(DB "select string_agg(id::text, ',') from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_SYMPTOM'")
LATE_AT=$(DB "select string_agg(id||'@'||\"createdAt\", '|') from \"WorkOrderAttachment\" where id in ($LATE)")
DB "update \"WorkOrderAttachment\" set \"createdAt\"=(select \"createdAt\" from \"PartClaim\" where id=$CB)+interval '1 minute' where id in ($LATE)" >/dev/null
G=$(GET $A "work-orders/$ID")
TA=$(PDFTXT $CA); TB=$(PDFTXT $CB)
[ "$(ROW "$G" $CB "c.evidenceIds.some(x=>[$LATE].includes(x))")|$(ROW "$G" $CA "c.evidenceIds.some(x=>[$LATE].includes(x))")" = "false|false" ] \
  && [ "$(ROW "$G" $CB 'c.evidenceIds.length')|$(ROW "$G" $CA 'c.evidenceIds.length')" = "4|4" ] \
  && ! HAS "$TA" "รูปอาการเสีย" && ! HAS "$TB" "รูปอาการเสีย" && HAS "$TB" "_${PCODE2}_รูปอะไหล่เก่า" && HAS "$TB" "_วิดีโอError" \
  && pass "รูปอาการลงเวลาหลังส่ง (psql): ไม่อยู่ใน evidenceIds ของแถวไหน และใบเคลมทั้งสองไม่ลง \"รูปอาการเสีย\" (หลักฐานอื่นยังลง)" \
  || fail "ไฟล์หลังส่ง: B=$(ROW "$G" $CB 'JSON.stringify(c.evidenceIds)') A=$(ROW "$G" $CA 'JSON.stringify(c.evidenceIds)') late=$LATE · PDF B: $(echo "$TB" | grep -o 'หลักฐาน.\{0,60\}' | head -1)"
IFS='|' read -ra _back <<< "$LATE_AT"
for x in "${_back[@]}"; do DB "update \"WorkOrderAttachment\" set \"createdAt\"='${x#*@}' where id=${x%%@*}" >/dev/null; done

echo
echo "═══ ใบเคลม PDF: ชิ้นที่ n จาก m · Error ที่เครื่องขึ้น · ภาพตัดป้าย · เลขหน้า"
TA=$(PDFTXT $CA); TB=$(PDFTXT $CB)
HAS "$TA" "อ้างอิงใบงาน $(DB "select code from \"WorkOrder\" where id=$ID") · ชิ้นที่ 1 จาก 2" && HAS "$TB" "ชิ้นที่ 2 จาก 2" \
  && pass "หัวใบเคลม: \"อ้างอิงใบงาน … · ชิ้นที่ 1 จาก 2\" / \"ชิ้นที่ 2 จาก 2\"" \
  || fail "ชิ้นที่ n จาก m: $(echo "$TA" | grep -o 'อ้างอิงใบงาน.\{0,40\}' | head -1) · $(echo "$TB" | grep -o 'อ้างอิงใบงาน.\{0,40\}' | head -1)"
HAS "$TA" "Error ที่เครื่องขึ้น" && HAS "$TA" "$ERRCODE — ประตูล็อก/ปลดล็อก" && ! HAS "$TA" "Door Lock" \
  && pass "บรรทัด \"Error ที่เครื่องขึ้น\" = \"$ERRCODE — ประตูล็อก/ปลดล็อก\" (ชื่อไทย ไม่ใช่ชื่ออังกฤษในคู่มือ)" \
  || fail "Error ในใบเคลม: $(echo "$TA" | grep -o 'Error.\{0,40\}' | head -2 | tr '\n' ' ')"
NIMG=$(IMGS "$TMP/$CA.pdf")
[ "$NIMG" -ge 3 ] && [ "$(PAGES "$TMP/$CA.pdf")|$(PAGES "$TMP/$CB.pdf")" = "1|1" ] && HAS "$TA" "หน้า 1/1" && ! HAS "$TA" "ใบทดสอบ" \
  && pass "ใบเคลมมีภาพ $NIMG ภาพ (หัวกระดาษ + ภาพตัดรุ่น/Serial) · ยังจบหน้าเดียว · \"หน้า 1/1\" · ใบจริงไม่มีคำว่า \"ใบทดสอบ\"" \
  || fail "ภาพ/หน้า: ภาพ $NIMG · หน้า $(PAGES "$TMP/$CA.pdf")/$(PAGES "$TMP/$CB.pdf") · ท้ายหน้า $(echo "$TA" | grep -o 'หน้า[0-9/]*' | tail -1)"

# ภาพตัดที่เป็น PNG สลับแถว (interlace) ข้อมูลภาพเสีย — pdfkit แตก PNG แบบนี้ด้วย zlib ที่โยน error นอก try/catch
# เคยทำให้เซิร์ฟเวอร์ล้มทั้งตัวทุกครั้งที่เปิดใบเคลมใบนั้น (ใครก็ได้ที่เป็นช่างส่งมาทาง POST /close) — ต้องข้ามภาพ ค่ายังพิมพ์
BADPNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAAEAAAAAAAAADElEQVRub3R6bGliZGF0YSEAAAAAAAAAAElFTkQAAAAA"
NPRAW=$(DB "select nameplate::text from \"PartClaim\" where id=$CA")
DB "update \"PartClaim\" set nameplate=jsonb_set(nameplate,'{fields,1,crop}','\"$BADPNG\"') where id=$CA" >/dev/null
PCODE_HTTP=$(curl -s -o "$TMP/badpng.pdf" -w '%{http_code}' --max-time 20 "localhost:4000/api/work-orders/$ID/claims/$CA/pdf" -H "$(H $A)")
sleep 1
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 localhost:4000/health)
TP=$(pdftotext -layout "$TMP/badpng.pdf" - 2>/dev/null | NORM)
DB "update \"PartClaim\" set nameplate='$NPRAW'::jsonb where id=$CA" >/dev/null
[ "$PCODE_HTTP|$HEALTH" = "200|200" ] && HAS "$TP" "2402600330" && [ "$(IMGS "$TMP/badpng.pdf")" = "$((NIMG - 1))" ] \
  && [ "$(DB "select nameplate->'fields'->1->>'crop' = '$CROP_SERIAL' from \"PartClaim\" where id=$CA")" = "t" ] \
  && pass "ภาพตัด Serial เป็น PNG สลับแถวข้อมูลเสีย (psql): ใบเคลมตอบ 200 · Serial ยังพิมพ์ · ข้ามแค่ภาพนั้น · เซิร์ฟเวอร์ยังตอบ /health" \
  || fail "ภาพตัด PNG เสีย: PDF $PCODE_HTTP · health $HEALTH · ภาพ $(IMGS "$TMP/badpng.pdf" 2>/dev/null)/$((NIMG - 1)) · $(echo "$TP" | head -c 120)"

echo
echo "═══ เคลมซ้ำ (claimRepeats) — เฉพาะฝั่งแอดมิน"
EAT=$(ISO PartClaim $ECLAIM)
EXP="$EID|$ECODE|$EPCODE|APPROVED|$EAT"
REP_A=$(GET $A "work-orders/$ID" | J "(d.claimRepeats||[]).map(r=>[r.workOrderId,r.code,r.partCode,r.status,r.createdAt].join('|')).join(',')")
NOSELF=$(GET $A "work-orders/$ID" | J "(d.claimRepeats||[]).some(r=>r.workOrderId===$ID)")
[ "$REP_A" = "$EXP" ] && [ "$NOSELF" = "false" ] \
  && pass "แอดมินเห็นเคลมซ้ำ: $ECODE ($EPCODE · APPROVED · เวลาตรงฐานข้อมูล) · ไม่รวมแถวของใบนี้เอง" \
  || fail "claimRepeats แอดมิน: $REP_A (คาด $EXP) · self=$NOSELF"
REP_PA=$(GET $PA "work-orders/$ID" | J "(d.claimRepeats||[]).map(r=>[r.workOrderId,r.code,r.partCode,r.status,r.createdAt].join('|')).join(',')")
[ "$REP_PA" = "$EXP" ] && [ "$(GET $PA "work-orders/$ID" | J 'd.claimRepeats[0].partName')" = "$(DB "select \"partName\" from \"PartClaim\" where id=$ECLAIM")" ] \
  && pass "Admin Spare Part (คนตรวจเคลม) เห็นเคลมซ้ำชุดเดียวกัน พร้อมชื่ออะไหล่" || fail "claimRepeats Admin Spare Part: $REP_PA"
# เคลมที่ส่งหลังใบนี้ไม่ใช่ "เคย" — เลื่อนเคลมของใบเก่าไปเป็นพรุ่งนี้ชั่วคราว แล้วคืนค่าเดิม
ERAW=$(DB "select \"createdAt\" from \"PartClaim\" where id=$ECLAIM")
DB "update \"PartClaim\" set \"createdAt\"=now()+interval '1 day' where id=$ECLAIM" >/dev/null
LATER=$(GET $A "work-orders/$ID" | J "JSON.stringify(d.claimRepeats)")
DB "update \"PartClaim\" set \"createdAt\"='$ERAW' where id=$ECLAIM" >/dev/null
[ "$LATER" = "[]" ] && [ "$(ISO PartClaim $ECLAIM)" = "$EAT" ] \
  && pass "เคลมของใบอื่นที่ส่งหลังเคลมล่าสุดของใบนี้ ไม่ขึ้นเป็น \"เคยเคลม\" (เลื่อนเวลาด้วย psql แล้วคืนค่า)" \
  || fail "เคลมที่ใหม่กว่าหลุดเข้าเคลมซ้ำ: $LATER · คืนเวลา $(ISO PartClaim $ECLAIM) / $EAT"
[ "$(GET $T "work-orders/$ID" | J '"claimRepeats" in d')|$(GET $S "work-orders/$ID" | J '"claimRepeats" in d')" = "false|false" ] \
  && pass "ช่างและหัวหน้าภาคไม่ได้รับ claimRepeats (ไม่มีคีย์ในคำตอบ)" \
  || fail "claimRepeats หลุดถึงช่าง/หัวหน้าภาค: T=$(GET $T "work-orders/$ID" | J '"claimRepeats" in d') S=$(GET $S "work-orders/$ID" | J '"claimRepeats" in d')"

echo
echo "═══ ใบทดสอบ (คัดลอกจากใบนี้): \"ไม่มี Error ขึ้น\" · เส้น \"ใบทดสอบ\" · ไม่นับเป็นเคลมซ้ำ"
ID=$CID
for r in BEFORE AFTER NAMEPLATE REQUISITION; do UP image/png -F "role=$r" >/dev/null; done
claim_files $PID; claim_files $PID2
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]" "$PLATE" '{"errorCode":"อื่น ๆ","checked":[]}')
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ใบทดสอบส่งเคลมไม่ผ่าน ($(echo $R | head -c 200))"
CC=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$CID and \"sparePartId\"=$PID")
TC=$(PDFTXT $CC)
[ "$(DB "select (\"fieldCheck\"->'offered')::text from \"PartClaim\" where id=$CC")" = "[]" ] \
  && HAS "$TC" "ใบทดสอบ" && HAS "$TC" "Error ที่เครื่องขึ้น" && HAS "$TC" "ไม่มี Error ขึ้น" && [ "$(PAGES "$TMP/$CC.pdf")" = "1" ] \
  && pass "ใบทดสอบ: ใบเคลมมีเส้น \"ใบทดสอบ\" · Error = \"ไม่มี Error ขึ้น\" · offered = [] (ฐานข้อมูล) · หน้าเดียว" \
  || fail "ใบทดสอบ: offered=$(DB "select (\"fieldCheck\"->'offered')::text from \"PartClaim\" where id=$CC") · $(echo "$TC" | head -c 300)"
# ภาพตัดป้ายที่เสีย (ค่าตั้งต้นของ claim-setup.sh เป็น JPEG ไม่ครบ) ต้องไม่ทำให้ใบเคลมพัง — ข้ามภาพ ค่ายังพิมพ์
CIMG=$(IMGS "$TMP/$CC.pdf")
[ $((NIMG - CIMG)) = "2" ] && HAS "$TC" "HL055L" \
  && pass "ภาพตัดป้ายเสีย: ใบเคลมยังออก ค่ารุ่นยังพิมพ์ แค่ไม่มีภาพ (ภาพน้อยกว่าใบที่มีภาพตัดจริง 2 ภาพพอดี: $CIMG / $NIMG)" \
  || fail "ภาพตัดเสีย: ภาพ $CIMG / $NIMG"
ID=$MID

echo
echo "═══ ตีกลับ → ส่งใหม่: รอบ 2 · วันที่ส่งครั้งแรก · หลักฐานแยกรอบ"
POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่"}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || fail "เตรียม: ตีกลับแล้วใบไม่กลับมาที่ช่าง"
OLDV=$(DB "select id from \"WorkOrderAttachment\" where \"workOrderId\"=$ID and role='CLAIM_CHECK_VIDEO' and \"sparePartId\"=$PID")
NEWV=$(UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID" | J 'd.id')
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID2" >/dev/null
R=$(CLOSE "[$(claim_json $PID),$(claim_json $PID2)]" "$PLATE2")
CA2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID and status='PENDING'")
CB2=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2 and status='PENDING'")
G=$(GET $PA "work-orders/$ID")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] \
  && [ "$(ROW "$G" $CA2 '[c.round,c.firstSubmittedAt].join("|")')|$(ROW "$G" $CB2 '[c.round,c.firstSubmittedAt].join("|")')|$(ROW "$G" $CA 'c.round')" = "2|$SENT|2|$SENT|1" ] \
  && [ "$(ISO PartClaim $CA2)" != "$SENT" ] \
  && pass "ส่งใหม่: แถวใหม่ทั้งสองชิ้น round 2 (นับต่อชิ้น ไม่ใช่ 3) · firstSubmittedAt = วันที่ส่งครั้งแรก · แถวเก่ายัง round 1" \
  || fail "รอบ 2: $(echo "$G" | J 'JSON.stringify(d.claims.map(c=>[c.id,c.status,c.round,c.firstSubmittedAt]))') · ส่งครั้งแรก $SENT"
[ "$(ROW "$G" $CA2 "c.evidenceIds.includes($NEWV)+'|'+c.evidenceIds.includes($OLDV)")|$(ROW "$G" $CA "c.evidenceIds.includes($NEWV)+'|'+c.evidenceIds.includes($OLDV)")" = "true|false|false|true" ] \
  && [ "$(ROW "$G" $CA2 'c.evidenceIds.slice().sort((a,b)=>a-b).join(",")')" = "$(EVDB $CA2)" ] \
  && pass "หลักฐานแยกรอบ: แถวใหม่ใช้วิดีโอใหม่แทนวิดีโอเดิม · แถวรอบที่ถูกตีกลับยังเป็นวิดีโอเดิม ไม่เห็นไฟล์ที่แนบทีหลัง" \
  || fail "หลักฐานรอบ 2: ใหม่ $(ROW "$G" $CA2 'JSON.stringify(c.evidenceIds)') เก่า $(ROW "$G" $CA 'JSON.stringify(c.evidenceIds)') (วิดีโอเดิม $OLDV ใหม่ $NEWV)"
T2=$(PDFTXT $CB2)
HAS "$T2" "ชิ้นที่ 2 จาก 2" && [ "$(PAGES "$TMP/$CB2.pdf")" = "1" ] \
  && pass "ใบเคลมรอบส่งใหม่ของชิ้นที่ 2 ยังเป็น \"ชิ้นที่ 2 จาก 2\" (เรียงตามที่ส่งครั้งแรก เลขไม่สลับ)" \
  || fail "ชิ้นที่ n จาก m รอบ 2: $(echo "$T2" | grep -o 'อ้างอิงใบงาน.\{0,40\}' | head -1)"
# ตรวจตรงนี้ (หลังส่งรอบ 2) ไม่ใช่ทันทีหลังใบทดสอบส่ง — ตอนนั้นเคลมของใบทดสอบใหม่กว่าเคลมล่าสุดของใบนี้
# เงื่อนไข "ส่งก่อนเคลมล่าสุดของใบนี้" ตัดทิ้งให้อยู่แล้ว เทสต์จะผ่านแม้ตัวกรองใบทดสอบหายไป
# ตอนนี้แถวรอบ 2 ใหม่กว่าเคลมของใบทดสอบ เหลือแค่ตัวกรองใบทดสอบที่กันไว้ได้
[ "$(DB "select count(*) from \"PartClaim\" where id=$CC and \"createdAt\" < (select max(\"createdAt\") from \"PartClaim\" where \"workOrderId\"=$MID)")" = "1" ] \
  || fail "เตรียม: เคลมของใบทดสอบไม่ได้เก่ากว่าแถวรอบ 2 ของใบจริง"
REP_A=$(GET $A "work-orders/$MID" | J "(d.claimRepeats||[]).map(r=>r.workOrderId).join(',')")
REP_C=$(GET $A "work-orders/$CID" | J "[...new Set((d.claimRepeats||[]).map(r=>r.workOrderId))].sort((a,b)=>a-b).join(',')")
[ "$REP_A" = "$EID" ] && [ "$REP_C" = "$(printf '%s\n' $EID $MID | sort -n | paste -sd,)" ] \
  && pass "เคลมของใบทดสอบเครื่องเดียวกันไม่นับเป็นเคลมซ้ำของใบจริง (เหลือ $ECODE ใบเดียว) · เปิดใบทดสอบเองเห็นเคลมของใบจริงทั้งสองใบ" \
  || fail "ใบทดสอบ/เคลมซ้ำ: ใบจริง $REP_A (คาด $EID) · ใบทดสอบ $REP_C (คาด $EID,$MID)"

echo
echo "═══ ตีกลับอีกครั้ง แล้วช่างส่งใหม่เฉพาะชิ้นที่ 1 (เลิกส่งชิ้นที่ 2) — ใบเคลมต้องเป็น \"ชิ้นที่ 1 จาก 1\""
POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"รูปมืด ถ่ายใหม่ทั้งสองชิ้น"}' >/dev/null
UP video/mp4 -F "role=CLAIM_CHECK_VIDEO" -F "sparePartId=$PID" >/dev/null
R=$(CLOSE "[$(claim_json $PID)]" "$PLATE2")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ส่งใหม่เฉพาะชิ้นที่ 1 ไม่ผ่าน ($(echo $R | head -c 200))"
CA3=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID and status='PENDING'")
[ "$(DB "select status from \"PartClaim\" where \"workOrderId\"=$ID and \"sparePartId\"=$PID2 order by \"createdAt\" desc, id desc limit 1")" = "REJECTED" ] \
  || fail "เตรียม: แถวล่าสุดของชิ้นที่ 2 ไม่ใช่ตีกลับค้าง"
T3=$(PDFTXT $CA3); TB2=$(PDFTXT $CB2)
HAS "$T3" "ชิ้นที่ 1 จาก 1" && ! HAS "$T3" "จาก 2" && HAS "$TB2" "ชิ้นที่ 2 จาก 2" \
  && pass "ชิ้นที่ช่างเลิกส่ง (แถวล่าสุดค้างเป็นตีกลับรอบก่อน) ไม่นับ: ใบเคลมใหม่ \"ชิ้นที่ 1 จาก 1\" · ใบของรอบที่ถูกตีกลับยัง \"2 จาก 2\" ตามที่ส่งตอนนั้น" \
  || fail "ชิ้นที่เลิกส่ง: ใหม่ $(echo "$T3" | grep -o 'อ้างอิงใบงาน.\{0,40\}' | head -1) · รอบก่อน $(echo "$TB2" | grep -o 'อ้างอิงใบงาน.\{0,40\}' | head -1)"

echo
echo "═══ เปิดใบเก่าใหม่ (REOPENED) แล้วส่งเคลมชิ้นเดิมอีกครั้ง"
# ใบเก่า (อนุมัติไปแล้ว 40 วันก่อน) เปิดใหม่ → นัด → คอนเฟิร์ม → ปล่อยงาน → ช่างปิดพร้อมเคลมชิ้นเดิม
ID=$EID
PARTS="[{\"sparePartId\":$PID,\"quantity\":1}]"
POST $A "work-orders/$ID/reopen" '{}' >/dev/null
POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS" ] || fail "เตรียม: ใบที่เปิดใหม่ไม่ถึงขั้นเข้างาน ($(DB "select status from \"WorkOrder\" where id=$ID"))"
for r in BEFORE AFTER NAMEPLATE REQUISITION; do UP image/png -F "role=$r" >/dev/null; done
claim_files $PID
R=$(CLOSE "[$(claim_json $PID)]")
[ "$(echo "$R" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ใบที่เปิดใหม่ส่งเคลมไม่ผ่าน ($(echo $R | head -c 200))"
ENEW=$(DB "select id from \"PartClaim\" where \"workOrderId\"=$ID and status='PENDING'")
ENEW_AT=$(ISO PartClaim $ENEW)
G=$(GET $PA "work-orders/$ID")
REP_E=$(echo "$G" | J "(d.claimRepeats||[]).filter(r=>r.workOrderId===$ID).map(r=>[r.partCode,r.status,r.createdAt].join('|')).join(',')")
[ "$REP_E" = "$EPCODE|APPROVED|$EAT" ] && [ "$(ROW "$G" $ENEW '[c.round,c.firstSubmittedAt].join("|")')|$(ROW "$G" $ECLAIM 'c.round')" = "1|$ENEW_AT|1" ] \
  && pass "หลังเปิดใบใหม่: เคลมที่อนุมัติก่อนเปิดใหม่ขึ้นเป็นเคลมซ้ำของใบตัวเอง (แถวใหม่ไม่ขึ้น) · แถวใหม่ round 1 · firstSubmittedAt = เวลาส่งใหม่" \
  || fail "หลังเปิดใบใหม่: ซ้ำของใบตัวเอง [$REP_E] (คาด $EPCODE|APPROVED|$EAT) · ใหม่ $(ROW "$G" $ENEW '[c.round,c.firstSubmittedAt].join("|")') (คาด 1|$ENEW_AT) · เก่า $(ROW "$G" $ECLAIM 'c.round')"

echo
echo "═══ รายการ Error ในคู่มือ: label ขึ้นต้นภาษาไทย"
# เครื่องซัก (W1) — รายการเหลือเฉพาะ Error ของเครื่องซักตั้งแต่เคลมก้อน 5 จึงใช้ "E d Co" (ชื่ออังกฤษล้วน) แทน ECoFAn ของเครื่องอบ
LBL=$(GET $T "work-orders/$ID" | J "const e=d.claimGuide.errors, f=c=>e.find(x=>x.code===c); [f(\"$ERRCODE\").label, f(\"$ERRCODE\").thai, f('E d Co').label, f('Door Close').label].join('¦')")
[ "$LBL" = "$ERRCODE — ประตูล็อก/ปลดล็อก (Door Lock)¦ประตูล็อก/ปลดล็อก¦E d Co — Drive Board Communication¦Door Close — ประตูปิดไม่ติด" ] \
  && pass "claimGuide.errors[].label: \"{code} — {ไทย} ({อังกฤษ})\" · ชื่อที่ไม่มีส่วนไทยแสดงตามคู่มือ · thai = ส่วนไทย" \
  || fail "label: $LBL"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
