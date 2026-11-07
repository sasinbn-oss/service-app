#!/bin/bash
# ทดสอบ: ระงับใบงานชั่วคราว (เจ้าของงานเลือก พ.ย. 69 — POST /work-orders/:id/hold · /resume)
#   · ใส่เหตุผล + วันกลับมาทำ → ใบออกจากกล่องงาน (ตัวเลขกล่องงานลดด้วย) ยังอยู่ในแท็บทั้งหมดพร้อม hold · ประวัติ HOLD
#   · หยุดนับวันค้าง: stageSince ในรายการเลื่อนไปเท่าช่วงที่ระงับ (pausedSince) · HOLD/RESUMED ไม่ใช่การเดินขั้น
#   · กลับมาทำต่อก่อนกำหนด → กลับเข้ากล่อง · holdUntil = ตอนที่กด (ช่วงที่ระงับยังหักวันค้างได้) · ประวัติ RESUMED
#   · ปฏิเสธ: ช่าง · หัวหน้าภาคนอกพื้นที่ · วันวันนี้/ย้อนหลัง · เกิน 60 วัน · เหตุผลสั้น · ระงับซ้อน · กลับมาทำใบที่ไม่ได้ระงับ · ใบปิดแล้ว
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
A=$(login A001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
OTHER=$(DB "select region from \"Branch\" where region is not null and region <> '$REGION' limit 1")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)

# ใบที่รอแอดมินเช็คอะไหล่ (ขั้นของแอดมิน → อยู่ในกล่องแอดมิน) — เปิดย้อนไป 5 วันให้วันค้างวัดได้
mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบระงับชั่วคราว"}]}' | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='PARTS_SOURCING' where id=$id" >/dev/null
  DB "update \"WorkOrderLog\" set \"createdAt\"=now()-interval '5 days' where \"workOrderId\"=$id" >/dev/null
  echo $id
}
DAY() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
CODE_OF() { DB "select code from \"WorkOrder\" where id=$1"; }
COUNT() { GET $A work-orders/inbox-count | J 'd.inbox'; }
IN_INBOX() { GET $A "work-orders?status=INBOX&search=$(CODE_OF $1)" | J "d.rows.some(r=>r.id==$1)?'yes':'no'"; }
ROW() { GET $A "work-orders?status=ALL&search=$(CODE_OF $1)" | J "const r=d.rows.find(r=>r.id==$1); $2"; }
HOLD_DB() { DB "select coalesce(\"holdReason\",'-')||'|'||(\"holdUntil\" is not null)||'|'||(\"heldAt\" is not null) from \"WorkOrder\" where id=$1"; }
LOGS() { DB "select string_agg(action, ',' order by id) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action in ('HOLD','RESUMED')"; }

W1=$(mk); W2=$(mk); IDS="$W1 $W2"
[ "$(IN_INBOX $W1)" = "yes" ] || fail "เตรียมข้อมูล: ใบไม่อยู่ในกล่องงานแอดมิน"
N0=$(COUNT)

echo "═══ ปฏิเสธ"
[ "$(PC $T work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 3)\"}")" = "403" ] && [ "$(HOLD_DB $W1)" = "-|false|false" ] \
  && pass "ช่างระงับไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "ช่างระงับได้"
R=$(POST $A work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 0)\"}")
echo "$R" | J 'd.error' | grep -q "พรุ่งนี้" && [ "$(HOLD_DB $W1)" = "-|false|false" ] && pass "วันกลับมาทำเป็นวันนี้: 400 ข้อความไทย" || fail "วันนี้: $R"
R=$(POST $A work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 61)\"}")
echo "$R" | J 'd.error' | grep -q "60 วัน" && [ "$(HOLD_DB $W1)" = "-|false|false" ] && pass "เกิน 60 วัน: 400" || fail "เกิน 60 วัน: $R"
R=$(POST $A work-orders/$W1/hold "{\"reason\":\"ปิด\",\"until\":\"$(DAY 3)\"}")
echo "$R" | J 'd.error' | grep -q "5 ตัวอักษร" && [ "$(HOLD_DB $W1)" = "-|false|false" ] && pass "เหตุผลสั้นเกิน: 400" || fail "เหตุผลสั้น: $R"
DB "update \"User\" set region='$OTHER' where \"employeeCode\"='S001'" >/dev/null
S2=$(login S001)
[ "$(PC $S2 work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 3)\"}")" = "403" ] && [ "$(HOLD_DB $W1)" = "-|false|false" ] \
  && pass "หัวหน้าภาคนอกพื้นที่ระงับไม่ได้ (403)" || fail "หัวหน้าภาคนอกพื้นที่ระงับได้"
DB "update \"User\" set region='$REGION' where \"employeeCode\"='S001'" >/dev/null

echo "═══ ระงับ"
R=$(POST $A work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุงถึงสิ้นเดือน\",\"until\":\"$(DAY 3)\"}")
[ "$(echo "$R" | J 'd.hold?d.hold.reason:"-"')" = "ร้านปิดปรับปรุงถึงสิ้นเดือน" ] && [ "$(HOLD_DB $W1)" = "ร้านปิดปรับปรุงถึงสิ้นเดือน|true|true" ] \
  && [ "$(DB "select to_char((\"holdUntil\" at time zone 'UTC') at time zone 'Asia/Bangkok','YYYY-MM-DD HH24:MI') from \"WorkOrder\" where id=$W1")" = "$(DAY 3) 00:00" ] \
  && pass "แอดมินระงับ: เก็บเหตุผล · กลับมาทำ = เที่ยงคืนเวลาไทยของวันที่เลือก · หน้าใบงานส่ง hold" || fail "ระงับ: $R · $(HOLD_DB $W1)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='HOLD'" | grep -q "ร้านปิดปรับปรุงถึงสิ้นเดือน · กลับมาทำ" \
  && [ "$(DB "select status from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='HOLD'")" = "PARTS_SOURCING" ] \
  && pass "ประวัติ HOLD บอกเหตุผล + วันกลับมาทำ ใบอยู่ขั้นเดิม" || fail "ประวัติ HOLD"
[ "$(IN_INBOX $W1)" = "no" ] && [ "$(COUNT)" = "$((N0 - 1))" ] && pass "ใบออกจากกล่องงาน ตัวเลขกล่องงานลด 1" || fail "ยังอยู่ในกล่อง: $(IN_INBOX $W1) · $(COUNT) จาก $N0"
[ "$(ROW $W1 'r&&r.hold?r.hold.reason:"-"')" = "ร้านปิดปรับปรุงถึงสิ้นเดือน" ] && pass "แท็บทั้งหมดยังเห็นใบ พร้อม hold (ป้ายระงับในรายการ)" || fail "แถวไม่มี hold"
[ "$(PC $A work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 5)\"}")" = "409" ] && [ "$(LOGS $W1)" = "HOLD" ] \
  && pass "ระงับซ้อนไม่ได้ (409) ไม่มีประวัติซ้ำ" || fail "ระงับซ้อนได้"
R=$(POST $S work-orders/$W2/hold "{\"reason\":\"รอร้านยืนยันวันเปิด\",\"until\":\"$(DAY 2)\"}")
[ "$(HOLD_DB $W2)" = "รอร้านยืนยันวันเปิด|true|true" ] && pass "หัวหน้าภาคของพื้นที่ระงับได้" || fail "หัวหน้าภาคระงับไม่ได้: $R"

echo "═══ หยุดนับวันค้าง"
# เข้าขั้นเมื่อ 5 วันก่อน ระงับมาแล้ว 2 วัน → วันค้างที่รายการส่ง = เข้าขั้นเลื่อนไป 2 วัน (≈ 3 วันก่อน)
DB "update \"WorkOrder\" set \"heldAt\"=now()-interval '2 days' where id=$W1" >/dev/null
GAP=$(ROW $W1 'Math.round((Date.now()-Date.parse(r.stageSince))/3600e3)')
[ "$GAP" -ge 71 ] && [ "$GAP" -le 73 ] && pass "ระงับอยู่: วันค้างนับแค่ก่อนระงับ (${GAP} ชม. แทน 120 ชม.)" || fail "วันค้างตอนระงับ: ${GAP} ชม."

echo "═══ กลับมาทำต่อ"
R=$(POST $A work-orders/$W1/resume '{}')
[ "$(echo "$R" | J 'd.hold?"held":"none"')" = "none" ] && [ "$(LOGS $W1)" = "HOLD,RESUMED" ] && [ "$(IN_INBOX $W1)" = "yes" ] && [ "$(COUNT)" = "$((N0 - 1))" ] \
  && pass "กลับมาทำต่อก่อนกำหนด: กลับเข้ากล่องงาน (ตัวเลขยังขาด 1 = ใบที่หัวหน้าภาคระงับไว้) ประวัติ RESUMED" || fail "กลับมาทำ: $R · $(LOGS $W1) · $(IN_INBOX $W1)"
[ "$(DB "select (\"holdUntil\" <= now() and \"holdUntil\" > now()-interval '5 minutes') from \"WorkOrder\" where id=$W1")" = "t" ] \
  && [ "$(echo "$R" | J 'd.holdSpan?"span":"-"')" = "span" ] && pass "holdUntil = ตอนที่กด · หน้าใบงานยังได้ช่วงระงับ (holdSpan) ไว้หักวันค้าง" || fail "holdUntil หลังกลับมาทำ"
GAP=$(ROW $W1 'Math.round((Date.now()-Date.parse(r.stageSince))/3600e3)')
[ "$GAP" -ge 71 ] && [ "$GAP" -le 73 ] && pass "หลังกลับมาทำ ช่วงที่ระงับยังไม่นับ (${GAP} ชม.)" || fail "วันค้างหลังกลับมาทำ: ${GAP} ชม."
[ "$(PC $A work-orders/$W1/resume '{}')" = "409" ] && pass "กลับมาทำใบที่ไม่ได้ระงับ: 409" || fail "resume ซ้ำผ่าน"
[ "$(PC $T work-orders/$W2/resume '{}')" = "403" ] && [ "$(HOLD_DB $W2)" = "รอร้านยืนยันวันเปิด|true|true" ] && pass "ช่างกดกลับมาทำแทนไม่ได้" || fail "ช่าง resume ได้"

echo "═══ ใบปิดแล้ว"
DB "update \"WorkOrder\" set status='DONE' where id=$W1" >/dev/null
[ "$(PC $A work-orders/$W1/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 3)\"}")" = "409" ] && [ "$(LOGS $W1)" = "HOLD,RESUMED" ] \
  && pass "ใบปิดแล้วระงับไม่ได้ (409)" || fail "ใบปิดระงับได้"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
