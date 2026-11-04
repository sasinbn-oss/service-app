#!/bin/bash
# ทดสอบ: ตัวกันถังขยะ (trashGuard — router.param("id") ของ routes/workOrders.ts) เมื่อฐานข้อมูลพัง และเมื่อรายชื่อที่จำไว้ไม่ตรงแถวจริง
#   · ฐานข้อมูลพังตอนตัวกันถาม (อ่าน/แก้) → 500 ข้อความไทยจากตัวจัดการท้าย index.ts — ไม่ค้าง ไม่มี promise หลุด (Node 22 ฆ่าโปรเซส)
#   · พังระหว่างตอบ 404 "อยู่ในถังขยะ" → 500 ไม่มี promise หลุด (รุ่นแรก .then(ตอบ, next) หลุดตรงนี้ → exit 1 ทั้งเซิร์ฟเวอร์)
#   · รายชื่อว่าอยู่ในถัง แต่แถวจริงถูกกู้คืนแล้ว (อีกเครื่อง/SQL) → ปล่อยผ่าน · ยังอยู่ในถัง → 404 trashed
#   · รายชื่อว่าไม่อยู่ แต่แถวจริงเพิ่งถูกย้ายไปถัง → คำขอแก้ถูกปฏิเสธ (ถามแถวจริงทุกครั้ง) · คำขออ่านไม่ถามแถวเพิ่ม (ไม่เสียรอบ)
# ไม่ยิงเซิร์ฟเวอร์ที่รันอยู่ — รัน trash.ts ตัวจริงในโปรเซสแยก แทนที่คำถาม Prisma (tests/lib/trash-guard-check.js อ่านเหตุผล)
# ต้องมี backend/node_modules (ts-node มากับ ts-node-dev)
SP="$(cd "$(dirname "$0")" && pwd)"
B="$SP/../backend"
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
run() { timeout 60 node "$SP/lib/trash-guard-check.js" "$B" "$1" 2>&1; }
res() { echo "$1" | sed -n 's/^RESULT //p'; }
calls() { echo "$1" | sed -n 's/^CALLS //p'; }
loose() { echo "$1" | sed -n 's/^UNHANDLED //p'; }
ERR500='500 {"error":"เซิร์ฟเวอร์ทำรายการนี้ไม่สำเร็จ — แจ้งแอดมินให้ดู log ของเซิร์ฟเวอร์"}'

O=$(run dbDownRead)
[ "$(res "$O")" = "$ERR500" ] && [ "$(loose "$O")" = "none" ] \
  && pass "ฐานข้อมูลพังตอนเช็ครายชื่อ (เปิดดู) → 500 ข้อความไทย ไม่ค้าง ไม่มี promise หลุด" || fail "ฐานพัง (อ่าน): $(res "$O") · หลุด $(loose "$O")"
O=$(run dbDownWrite)
[ "$(res "$O")" = "$ERR500" ] && [ "$(loose "$O")" = "none" ] \
  && pass "ฐานข้อมูลพังตอนเช็คแถวจริง (กดแก้) → 500 ข้อความไทย ไม่ค้าง" || fail "ฐานพัง (แก้): $(res "$O") · หลุด $(loose "$O")"
O=$(run throwWhileAnswering)
[ "$(res "$O")" = "$ERR500" ] && [ "$(loose "$O")" = "none" ] \
  && pass "พังระหว่างตอบ \"อยู่ในถังขยะ\" → 500 ไม่มี promise หลุด (ของจริงไม่มีตัวจับ = โปรเซสตาย)" || fail "พังระหว่างตอบ: $(res "$O") · หลุด $(loose "$O")"
O=$(run trashedRead)
echo "$(res "$O")" | grep -q '^404 .*"trashed":true' && pass "รายชื่อ+แถวจริงอยู่ในถัง → 404 trashed" || fail "อยู่ในถัง: $(res "$O")"
O=$(run restoredElsewhere)
[ "$(res "$O")" = '200 {"reached":true}' ] && pass "รายชื่อว่าอยู่ในถัง แต่แถวจริงกู้คืนแล้ว (เครื่องอื่น/SQL) → ปล่อยผ่านทันที ไม่รอรอบโหลด 60 วินาที" || fail "กู้จากที่อื่น: $(res "$O")"
O=$(run trashedElsewhereWrite)
echo "$(res "$O")" | grep -q '^404 .*"trashed":true' && pass "รายชื่อว่าไม่อยู่ แต่แถวจริงเพิ่งเข้าถัง (เครื่องอื่น) → กดแก้ได้ 404 trashed" || fail "ย้ายจากที่อื่นแล้วแก้: $(res "$O")"
O=$(run aliveRead)
[ "$(res "$O")" = '200 {"reached":true}' ] && [ "$(calls "$O")" = "findMany=1 findUnique=0" ] \
  && pass "ใบปกติ เปิดดู → ผ่าน ไม่ถามแถวจริงเพิ่ม (โหลดรายชื่อครั้งเดียว)" || fail "ใบปกติ: $(res "$O") · $(calls "$O")"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
