#!/bin/bash
# ทดสอบ: GET /work-orders/locate — ใบงานตอนนี้อยู่แท็บไหนของหน้ารายการ (ปุ่ม "มีอัปเดต" พาไป · ต.ค. 69)
#   · กล่องงานก่อนแท็บสถานะ: ใบใหม่ = กล่องงานหัวหน้าภาค แต่เป็น "ที่ยังค้าง" ของแอดมิน
#   · รอคอนเฟิร์มลูกค้า = กล่องงานแอดมิน แต่เป็นแท็บ "รอคอนเฟิร์มลูกค้า" ของหัวหน้าภาค · ยกเลิก = "ทั้งหมด"
#   · นอกขอบเขต/ไม่มีจริง/รหัสเพี้ยน ไม่อยู่ในคำตอบ · ทีม Area เช็คใน area-team-test
#   · กล่องงาน + คำค้น ได้เฉพาะใบในกล่องงาน (เดิมคำค้นทับเงื่อนไขกล่องงาน)
# สถานะตั้งต้นของแต่ละข้อยืนยันที่ฐานข้อมูล (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
LOC() { curl -s "localhost:4000/api/work-orders/locate?ids=$2" -H "$(H $1)"; }
TAB() { LOC $1 $2 | J "(d.rows.find(r=>r.id===$2)||{tab:'-'}).tab"; }
A=$(login A001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region=(select region from \"Branch\" where code='C0006') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
W=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W97","model":"Oasis","symptom":"ทดสอบหาแท็บ"}]}' | J 'd.orders?d.orders[0].id:d.id'); IDS="$W"

[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "NEW" ] && [ "$(TAB $S $W)" = "INBOX" ] && [ "$(TAB $A $W)" = "ACTIVE" ] \
  && pass "ใบใหม่: หัวหน้าภาค = กล่องงาน · แอดมิน = ที่ยังค้าง" || fail "ใบใหม่: S=$(TAB $S $W) A=$(TAB $A $W)"
[ "$(LOC $S $W | J "JSON.stringify(d.rows[0])")" = "{\"id\":$W,\"status\":\"NEW\",\"outsource\":false,\"tab\":\"INBOX\"}" ] \
  && pass "คำตอบมีสถานะกับธง outsource (หน้าจอแบ่งแท็บย่อยกล่องงานหัวหน้าภาค)" || fail "รูปคำตอบ: $(LOC $S $W)"

POST $S work-orders/$W/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-20\"}}" >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "AWAITING_CONFIRM" ] && [ "$(TAB $A $W)" = "INBOX" ] && [ "$(TAB $S $W)" = "AWAITING_CONFIRM" ] \
  && pass "รอคอนเฟิร์มลูกค้า: แอดมิน = กล่องงาน · หัวหน้าภาค = แท็บรอคอนเฟิร์มลูกค้า" || fail "รอคอนเฟิร์ม: S=$(TAB $S $W) A=$(TAB $A $W)"

# กล่องงาน + คำค้น: ใบนี้ไม่ใช่งานของหัวหน้าภาคตอนนี้ — ค้นเจอในทั้งหมด แต่ไม่ขึ้นในกล่องงาน
# (เดิมคำค้นทับเงื่อนไขกล่องงาน ค้นแล้วได้ทุกใบที่ตรงคำค้น)
CODE_W=$(DB "select code from \"WorkOrder\" where id=$W")
LIST() { curl -s "localhost:4000/api/work-orders?status=$2&search=$CODE_W" -H "$(H $1)" | J 'd.rows.map(r=>r.id).join()'; }
[ "$(LIST $S ALL)" = "$W" ] && [ "$(LIST $S INBOX)" = "" ] && [ "$(LIST $A INBOX)" = "$W" ] \
  && pass "กล่องงาน + คำค้น: ได้เฉพาะใบในกล่องงานที่ตรงคำค้น (หัวหน้าภาคไม่เห็น แอดมินเห็น)" || fail "กล่องงาน+ค้น: S-ALL=$(LIST $S ALL) S-INBOX=$(LIST $S INBOX) A-INBOX=$(LIST $A INBOX)"

POST $A work-orders/$W/cancel '{"reasonCode":"DUPLICATE"}' >/dev/null
[ "$(DB "select status from \"WorkOrder\" where id=$W")" = "CANCELLED" ] && [ "$(TAB $S $W)" = "ALL" ] \
  && pass "ยกเลิกแล้ว = แท็บทั้งหมด" || fail "ยกเลิก: $(TAB $S $W)"

DB "update \"User\" set region='ภาคที่ไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
[ "$(LOC $S $W | J 'd.rows.length')" = "0" ] && pass "ใบนอกขอบเขตหัวหน้าภาค ไม่อยู่ในคำตอบ" || fail "นอกขอบเขตยังตอบ: $(LOC $S $W)"
[ "$(LOC $A "999999999,abc,-3" | J 'd.rows.length')" = "0" ] && pass "รหัสไม่มีจริง/เพี้ยน ได้รายการว่าง ไม่ล้ม" || fail "รหัสเพี้ยน: $(LOC $A '999999999,abc,-3')"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
