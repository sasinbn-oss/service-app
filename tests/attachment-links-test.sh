#!/bin/bash
# ทดสอบ: ไฟล์แนบโหลดไวขึ้น + เปิด PDF ในแอป (เจ้าของงานขอ ต.ค. 69)
#   · GET /:id/attachments/links — ลิงก์ของทุกไฟล์ในคำขอเดียว · เปิดแต่ละลิงก์ได้ไฟล์ตรงกับที่อัป
#   · GET /:id/attachments?have= — รูปย่อที่แอปจำไว้แล้วไม่ส่งซ้ำ (hasThumbnail ยังบอกว่ามี)
#   · GET /:id/attachments ส่งลิงก์เปิดไฟล์มาด้วย (รอบสอง ต.ค. 69 — ไม่ต้องขอ /links แยก) · เปิดลิงก์ได้ไฟล์ตรงกับที่อัป
#   · GET /:id/attachments/:aid/file — ทางสำรองของตัวแสดง PDF: ได้ไฟล์ PDF เดิมทุกไบต์ · รูปขอทางนี้ไม่ได้
#   · ชื่อไฟล์ภาษาไทยเก็บตรงตัวอักษรทั้งแถวไฟล์ ประวัติ และชื่อตอนโหลด · key ในถังเป็น ASCII (พ.ย. 69 — เคยเก็บเป็นอักษรเพี้ยน)
#   · หัวหน้าภาคนอกขอบเขตขอลิงก์/ไฟล์ไม่ได้ (403)
# ยืนยันกับฐานข้อมูลและไฟล์จริง (CLAUDE.md)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
TMP=$(mktemp -d)
W=""
cleanup() {
  purge_orders "$A" "$W"
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
W=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W96","symptom":"ทดสอบลิงก์ไฟล์"}]}' | J 'd.orders?d.orders[0].id:d.id')
UP() { curl -s -X POST "localhost:4000/api/work-orders/$W/attachments" -H "$(H $A)" "$@" | J 'd.id'; }
I1=$(UP -F "file=@$SP/site-photo.png;type=image/png" -F "thumbnail=@$SP/site-photo.png;type=image/jpeg")
I2=$(UP -F "file=@$SP/site-photo.png;type=image/png" -F "thumbnail=@$SP/site-photo.png;type=image/jpeg")
P1=$(UP -F "file=@$SP/quote-2pages.pdf;type=application/pdf" -F "role=QUOTE")
[ "$(DB "select string_agg(kind||':'||(thumbnail is not null)::text, ',' order by id) from \"WorkOrderAttachment\" where \"workOrderId\"=$W")" = "IMAGE:true,IMAGE:true,DOCUMENT:false" ] \
  && pass "เตรียมไฟล์ (ฐานข้อมูล): รูป 2 มีรูปย่อ · PDF 1" || fail "เตรียมไฟล์: $(DB "select kind, thumbnail is not null from \"WorkOrderAttachment\" where \"workOrderId\"=$W")"

echo "═══ ลิงก์ทุกไฟล์ในคำขอเดียว"
L=$(curl -s "localhost:4000/api/work-orders/$W/attachments/links" -H "$(H $A)")
[ "$(echo "$L" | J "[$I1,$I2,$P1].every(i=>/^http/.test(d.links[i]))&&Object.keys(d.links).length===3&&d.expiresInSeconds===7200")" = "true" ] \
  && pass "ได้ลิงก์ครบ 3 ไฟล์ อายุ 2 ชั่วโมง" || fail "links: $L"
curl -s -o "$TMP/p.pdf" "$(echo "$L" | J "d.links[$P1]")"
curl -s -o "$TMP/i.png" "$(echo "$L" | J "d.links[$I1]")"
cmp -s "$TMP/p.pdf" "$SP/quote-2pages.pdf" && cmp -s "$TMP/i.png" "$SP/site-photo.png" \
  && pass "เปิดลิงก์ได้ไฟล์ตรงกับที่อัปทุกไบต์ (PDF + รูป)" || fail "ไฟล์จากลิงก์ไม่ตรง"

echo "═══ รูปย่อที่แอปจำไว้แล้วไม่ส่งซ้ำ"
R=$(curl -s "localhost:4000/api/work-orders/$W/attachments?have=$I1" -H "$(H $A)")
[ "$(echo "$R" | J "const a=d.rows.find(r=>r.id===$I1),b=d.rows.find(r=>r.id===$I2);[a.thumbnailDataUrl===null,a.hasThumbnail,/^data:image/.test(b.thumbnailDataUrl),b.hasThumbnail].join()")" = "true,true,true,true" ] \
  && pass "?have= ใบที่จำไว้ไม่ส่งรูปย่อ (แต่บอกว่ามี) · ใบอื่นส่งตามปกติ" || fail "have: $(echo "$R" | J 'JSON.stringify(d.rows.map(r=>[r.id,!!r.thumbnailDataUrl,r.hasThumbnail]))')"
[ "$(curl -s "localhost:4000/api/work-orders/$W/attachments" -H "$(H $A)" | J 'd.rows.filter(r=>r.thumbnailDataUrl).length')" = "2" ] \
  && pass "ไม่ส่ง have = ส่งรูปย่อครบเหมือนเดิม (แอปรุ่นเก่ายังใช้ได้)" || fail "ไม่มี have แล้วรูปย่อหาย"

echo "═══ ลิงก์มากับรายการไฟล์"
R=$(curl -s "localhost:4000/api/work-orders/$W/attachments" -H "$(H $A)")
[ "$(echo "$R" | J "d.rows.every(r=>/^http/.test(r.url))&&d.rows.length===3&&d.expiresInSeconds===7200")" = "true" ] \
  && curl -s -o "$TMP/lp.pdf" "$(echo "$R" | J "d.rows.find(r=>r.id===$P1).url")" && cmp -s "$TMP/lp.pdf" "$SP/quote-2pages.pdf" \
  && curl -s -o "$TMP/li.png" "$(echo "$R" | J "d.rows.find(r=>r.id===$I2).url")" && cmp -s "$TMP/li.png" "$SP/site-photo.png" \
  && pass "รายการไฟล์มีลิงก์ครบ 3 ไฟล์ อายุ 2 ชั่วโมง · เปิดได้ไฟล์ตรงกับที่อัปทุกไบต์" || fail "ลิงก์ในรายการ: $(echo "$R" | J 'JSON.stringify(d.rows.map(r=>[r.id,!!r.url]))+" "+d.expiresInSeconds')"

echo "═══ ทางสำรองของตัวแสดง PDF"
[ "$(curl -s -o "$TMP/f.pdf" -w '%{http_code}|%{content_type}' "localhost:4000/api/work-orders/$W/attachments/$P1/file" -H "$(H $A)")" = "200|application/pdf" ] \
  && cmp -s "$TMP/f.pdf" "$SP/quote-2pages.pdf" && pass "PDF ผ่านเซิร์ฟเวอร์ได้ไฟล์เดิมทุกไบต์ (application/pdf)" || fail "file proxy"
[ "$(CODE "localhost:4000/api/work-orders/$W/attachments/$I1/file" -H "$(H $A)")" = "400" ] && pass "รูปขอทางนี้ไม่ได้ (400)" || fail "รูปผ่านทาง file ได้"
[ "$(CODE "localhost:4000/api/work-orders/$W/attachments/$P1/file")" = "401" ] && pass "ไม่ล็อกอินขอไฟล์ไม่ได้ (401)" || fail "ไม่ล็อกอินก็ได้ไฟล์"

echo "═══ ชื่อไฟล์ภาษาไทย"
# multer อ่านชื่อไฟล์ในคำขอเป็น latin1 ตามค่าตั้งต้น ใบเสนอราคาที่แนบจากเว็บเคยถูกเก็บเป็น "à¹\u0083à¸…" (พ.ย. 69)
# ดูที่ฐานข้อมูล ไม่ใช่แค่ JSON ที่ตอบกลับ — ชื่อเดียวกันไปอยู่สามที่: แถวไฟล์ · ประวัติใบงาน · ชื่อตอนโหลด
THAI="ใบเสนอราคา WO-01143.pdf"
T1=$(UP -F "file=@$SP/quote-2pages.pdf;filename=$THAI;type=application/pdf" -F "role=QUOTE")
[ "$(DB "select \"fileName\" from \"WorkOrderAttachment\" where id=${T1:-0}")" = "$THAI" ] \
  && [ "$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W and action='ATTACHED' order by id desc limit 1")" = "เอกสาร PDF: $THAI" ] \
  && pass "ชื่อไฟล์ไทยเก็บตรงตัวอักษร (ฐานข้อมูล: แถวไฟล์ + ประวัติ \"เอกสาร PDF: $THAI\")" \
  || fail "ชื่อไฟล์ไทยเพี้ยน: [$(DB "select \"fileName\" from \"WorkOrderAttachment\" where id=${T1:-0}")]"
# key ในถังต้องเป็น ASCII (Supabase ไม่รับอักษรไทย) — ส่วนที่เป็นอังกฤษของชื่อยังอยู่ให้ไล่ดูในถังได้
[[ "$(DB "select \"objectKey\" from \"WorkOrderAttachment\" where id=${T1:-0}")" =~ ^work-orders/[A-Za-z0-9-]+/[0-9]+-WO-01143\.pdf$ ]] \
  && pass "key ในถังเป็น ASCII ล้วน (…-WO-01143.pdf)" || fail "objectKey: $(DB "select \"objectKey\" from \"WorkOrderAttachment\" where id=${T1:-0}")"
CD=$(curl -s -D - -o /dev/null "$(curl -s "localhost:4000/api/work-orders/$W/attachments/${T1:-0}/link" -H "$(H $A)" | J 'd.url')" | tr -d '\r' | grep -i '^content-disposition:')
[ "$CD" = "Content-Disposition: inline; filename*=UTF-8''$(node -pe 'encodeURIComponent(process.argv[1])' "$THAI")" ] \
  && pass "เปิดลิงก์แล้วชื่อไฟล์ที่ได้เป็นชื่อไทยเดิม" || fail "Content-Disposition: $CD"
# ชื่อแบบ RFC 5987 (filename*=UTF-8''…) busboy ถอดเป็น UTF-8 เองอยู่แล้ว — ถ้าวันหนึ่งเปลี่ยนไปแปลงซ้ำด้วย
# Buffer.from(ชื่อ, "latin1") แบบเส้นทางนำเข้า Excel ชื่อแบบนี้จะเพี้ยนแทน จึงใช้ defParamCharset ของ multer และตรวจไว้ตรงนี้
B=thai-name-boundary
{ printf -- "--$B\r\nContent-Disposition: form-data; name=\"file\"; filename*=UTF-8''%s\r\nContent-Type: image/png\r\n\r\n" \
    "$(node -pe 'encodeURIComponent("รูปหน้าร้าน.png")')"; cat "$SP/site-photo.png"; printf -- "\r\n--$B--\r\n"; } > "$TMP/rfc5987.body"
T2=$(UP -H "Content-Type: multipart/form-data; boundary=$B" --data-binary "@$TMP/rfc5987.body")
[ "$(DB "select \"fileName\" from \"WorkOrderAttachment\" where id=${T2:-0}")" = "รูปหน้าร้าน.png" ] \
  && pass "ชื่อแบบ filename*=UTF-8'' ก็ได้ชื่อไทยเดิม (ไม่ถูกแปลงซ้ำ)" \
  || fail "filename*: [$(DB "select \"fileName\" from \"WorkOrderAttachment\" where id=${T2:-0}")]"

echo "═══ ขอบเขต"
DB "update \"User\" set region='ภาคที่ไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
[ "$(CODE "localhost:4000/api/work-orders/$W/attachments/links" -H "$(H $S)")" = "403" ] && [ "$(CODE "localhost:4000/api/work-orders/$W/attachments/$P1/file" -H "$(H $S)")" = "403" ] \
  && [ "$(curl -s "localhost:4000/api/work-orders/$W/attachments" -H "$(H $S)" | J 'd.error && !d.rows ? "blocked" : "leak"')" = "blocked" ] \
  && pass "หัวหน้าภาคนอกขอบเขต ขอรายการ/ลิงก์/ไฟล์ไม่ได้ (403 · รายการไม่หลุดออกมา)" || fail "นอกขอบเขตได้ลิงก์หรือรายการ"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
