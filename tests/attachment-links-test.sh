#!/bin/bash
# ทดสอบ: ไฟล์แนบโหลดไวขึ้น + เปิด PDF ในแอป (เจ้าของงานขอ ต.ค. 69)
#   · GET /:id/attachments/links — ลิงก์ของทุกไฟล์ในคำขอเดียว · เปิดแต่ละลิงก์ได้ไฟล์ตรงกับที่อัป
#   · GET /:id/attachments?have= — รูปย่อที่แอปจำไว้แล้วไม่ส่งซ้ำ (hasThumbnail ยังบอกว่ามี)
#   · GET /:id/attachments ส่งลิงก์เปิดไฟล์มาด้วย (รอบสอง ต.ค. 69 — ไม่ต้องขอ /links แยก) · เปิดลิงก์ได้ไฟล์ตรงกับที่อัป
#   · GET /:id/attachments/:aid/file — ทางสำรองของตัวแสดง PDF: ได้ไฟล์ PDF เดิมทุกไบต์ · รูปขอทางนี้ไม่ได้
#   · หัวหน้าภาคนอกขอบเขตขอลิงก์/ไฟล์ไม่ได้ (403)
# ยืนยันกับฐานข้อมูลและไฟล์จริง (CLAUDE.md)
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
  [ -n "$W" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$W" -H "$(H $A)" >/dev/null
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

echo "═══ ขอบเขต"
DB "update \"User\" set region='ภาคที่ไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
[ "$(CODE "localhost:4000/api/work-orders/$W/attachments/links" -H "$(H $S)")" = "403" ] && [ "$(CODE "localhost:4000/api/work-orders/$W/attachments/$P1/file" -H "$(H $S)")" = "403" ] \
  && [ "$(curl -s "localhost:4000/api/work-orders/$W/attachments" -H "$(H $S)" | J 'd.error && !d.rows ? "blocked" : "leak"')" = "blocked" ] \
  && pass "หัวหน้าภาคนอกขอบเขต ขอรายการ/ลิงก์/ไฟล์ไม่ได้ (403 · รายการไม่หลุดออกมา)" || fail "นอกขอบเขตได้ลิงก์หรือรายการ"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
