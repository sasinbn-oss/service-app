#!/bin/bash
# ทดสอบ: กระดิ่งงานเข้าใหม่ + ช่องค้นหาทั้งระบบบนแถบหัว (เจ้าของงานเลือก พ.ย. 69)
#   กระดิ่ง (GET /work-orders/bell · POST /bell/seen-all)
#   · วันแรกเริ่มจากศูนย์ — ใบที่อยู่ในกล่องก่อน bellSince ไม่นับ
#   · ใบเข้ากล่องใหม่ = นับ · เปิดดู (GET /:id) = ไม่นับ · เดินขั้นมาถึงคิวเราอีกรอบ = นับใหม่
#   · ใบงานขั้นคนอื่นไม่เข้ากระดิ่งเรา · ดูในฐานะคนอื่นเปิดใบไม่นับว่าเจ้าของบัญชีเปิดดู และกด "อ่านแล้วทั้งหมด" ไม่ได้
#   · อ่านแล้วทั้งหมด = 0 · ใบที่ระงับชั่วคราวหายจากกระดิ่ง กลับมาทำต่อแล้วขึ้นใหม่
#   ค้นหา (GET /work-orders/search-all)
#   · สั้นกว่า 2 ตัวอักษรไม่ค้น · ใบงานตามขอบเขตเดียวกับรายการ · คนในระบบเฉพาะแอดมิน/หัวหน้าภาค
#   · เจอสาขา เครื่อง อะไหล่ · ค้นเลขใบด้วยตัวเลขท้ายอย่างเดียว
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
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
OLD_BELL=$(DB "select \"bellSince\" from \"User\" where id=$AID")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "update \"User\" set \"bellSince\"='$OLD_BELL' where id=$AID" >/dev/null
}
trap cleanup EXIT

# ใบที่รอแอดมินเช็คอะไหล่ (ขั้นของแอดมิน → กล่องแอดมิน · ไม่ใช่ขั้นช่าง)
mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบกระดิ่งงานเข้าใหม่"}]}' | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='PARTS_SOURCING' where id=$id" >/dev/null
  echo $id
}
CODE_OF() { DB "select code from \"WorkOrder\" where id=$1"; }
BELL() { GET ${2:-$A} work-orders/bell | J "d.items.some(i=>i.id==$1)?'in':'out'"; }
SEEN() { DB "select count(*) from \"WorkOrderSeen\" where \"workOrderId\"=$1 and \"userId\"=${2:-$AID}"; }
MOVE() { DB "insert into \"WorkOrderLog\" (\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($1,null,'DISPATCHED','PARTS_SOURCING','ทดสอบเดินขั้น',now()+interval '1 second')" >/dev/null; sleep 1.2; }
DAY() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }

echo "═══ กระดิ่ง: วันแรกเริ่มจากศูนย์"
OLD=$(mk); IDS="$OLD"
DB "update \"User\" set \"bellSince\"=now() where id=$AID" >/dev/null
sleep 1
[ "$(BELL $OLD)" = "out" ] && [ "$(GET $A work-orders/bell | J 'd.count')" = "0" ] \
  && pass "ใบที่อยู่ในกล่องก่อนวันขึ้นระบบกระดิ่งไม่นับ (ตัวเลข 0)" || fail "วันแรกไม่เริ่มจากศูนย์: $(GET $A work-orders/bell | J 'd.count')"

echo "═══ ใบเข้ากล่องใหม่ · เปิดดู · เดินขั้นกลับมาอีกรอบ"
W1=$(mk); W2=$(mk); IDS="$IDS $W1 $W2"
R=$(GET $A work-orders/bell)
[ "$(echo "$R" | J "d.items.filter(i=>[$W1,$W2].includes(i.id)).length")" = "2" ] && [ "$(echo "$R" | J 'd.count')" -ge 2 ] \
  && pass "ใบเข้ากล่องหลังวันขึ้นระบบขึ้นในกระดิ่ง ($(CODE_OF $W1) · $(CODE_OF $W2))" || fail "ใบใหม่ไม่ขึ้นกระดิ่ง: $R"
[ "$(echo "$R" | J "d.items.find(i=>i.id==$W1).branch.startsWith('C0006')")" = "true" ] && pass "รายการในกระดิ่งบอกสาขา" || fail "ไม่มีสาขา"
[ "$(BELL $W1 $T)" = "out" ] && pass "ใบขั้นแอดมินไม่เข้ากระดิ่งช่าง" || fail "ช่างเห็นใบขั้นแอดมินในกระดิ่ง"
GET $A work-orders/$W1 >/dev/null; sleep 1
[ "$(BELL $W1)" = "out" ] && [ "$(SEEN $W1)" = "1" ] && [ "$(BELL $W2)" = "in" ] \
  && pass "เปิดดูแล้วหายจากกระดิ่ง (WorkOrderSeen 1 แถว) · ใบที่ยังไม่เปิดยังอยู่" || fail "เปิดดู: W1=$(BELL $W1) seen=$(SEEN $W1) W2=$(BELL $W2)"
MOVE $W1
[ "$(BELL $W1)" = "in" ] && pass "เดินขั้นมาถึงคิวเราอีกรอบ — ขึ้นในกระดิ่งใหม่" || fail "เดินขั้นแล้วไม่ขึ้นใหม่"

echo "═══ ดูในฐานะคนอื่น"
AV=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token||""')
GET $AV work-orders/$W2 >/dev/null; sleep 1
[ "$(SEEN $W2)" = "0" ] && [ "$(SEEN $W2 $TID)" = "0" ] && pass "ดูในฐานะช่างเปิดใบ — ไม่บันทึกว่าใครเปิดดู" || fail "ดูในฐานะบันทึกการเปิดดู"
[ "$(PC $AV work-orders/bell/seen-all '{}')" = "403" ] && [ "$(BELL $W2)" = "in" ] && pass "ดูในฐานะกดอ่านแล้วทั้งหมดไม่ได้ (403)" || fail "ดูในฐานะกดอ่านแล้วได้"
POST $AV auth/view-as/stop '{}' >/dev/null

echo "═══ อ่านแล้วทั้งหมด"
R=$(POST $A work-orders/bell/seen-all '{}')
[ "$(echo "$R" | J 'd.count')" = "0" ] && [ "$(GET $A work-orders/bell | J 'd.count')" = "0" ] && [ "$(SEEN $W1)" = "1" ] && [ "$(SEEN $W2)" = "1" ] \
  && pass "อ่านแล้วทั้งหมด → 0 (บันทึกเปิดดูครบทุกใบ)" || fail "อ่านแล้วทั้งหมด: $R"

echo "═══ ระงับชั่วคราว"
POST $A work-orders/$W2/hold "{\"reason\":\"ร้านปิดปรับปรุง\",\"until\":\"$(DAY 3)\"}" >/dev/null
[ "$(BELL $W2)" = "out" ] && pass "ใบที่ระงับไม่อยู่ในกระดิ่ง" || fail "ใบระงับอยู่ในกระดิ่ง"
sleep 1
POST $A work-orders/$W2/resume '{}' >/dev/null
[ "$(BELL $W2)" = "in" ] && pass "กลับมาทำต่อ — ขึ้นในกระดิ่งเป็นงานกลับเข้ากล่อง" || fail "กลับมาทำต่อแล้วไม่ขึ้นกระดิ่ง"

echo "═══ ค้นหาทั้งระบบ"
R=$(GET $A "work-orders/search-all?q=C")
[ "$(echo "$R" | J '[d.workOrders,d.branches,d.people,d.machines,d.parts].every(a=>a.length===0)')" = "true" ] && pass "ตัวอักษรเดียวไม่ค้น" || fail "ตัวเดียว: $R"
CODE=$(CODE_OF $W1); NUM=$(echo "$CODE" | grep -oE '[0-9]+$' | sed 's/^0*//')
[ "$(GET $A "work-orders/search-all?q=$NUM" | J "d.workOrders.some(w=>w.code==='$CODE')")" = "true" ] && pass "ค้นด้วยเลขท้าย $NUM เจอ $CODE" || fail "ค้นเลขท้ายไม่เจอ"
IN_LIST=$(GET $T "work-orders?status=ALL&search=$CODE" | J "d.rows.some(r=>r.id==$W1)")
IN_SEARCH=$(GET $T "work-orders/search-all?q=$CODE" | J "d.workOrders.some(w=>w.id==$W1)")
[ "$IN_LIST" = "$IN_SEARCH" ] && pass "ช่างค้นเจอใบเดียวกับที่รายการให้เห็น (รายการ $IN_LIST · ค้นหา $IN_SEARCH)" || fail "ขอบเขตค้นหาไม่ตรงรายการ: $IN_LIST/$IN_SEARCH"
[ "$(GET $A "work-orders/search-all?q=T001" | J "d.people.some(p=>p.employeeCode==='T001')")" = "true" ] && pass "แอดมินค้นคนในระบบได้" || fail "แอดมินค้นคนไม่เจอ"
[ "$(GET $T "work-orders/search-all?q=T001" | J 'd.people.length')" = "0" ] && pass "ช่างไม่เห็นผลค้นคนในระบบ" || fail "ช่างเห็นคน"
R=$(GET $A "work-orders/search-all?q=C0006")
[ "$(echo "$R" | J "d.branches.some(b=>b.code==='C0006')")" = "true" ] && pass "เจอสาขา C0006" || fail "ไม่เจอสาขา"
[ "$(GET $A "work-orders/search-all?q=W81" | J "d.machines.some(m=>m.code==='W81')")" = "true" ] && pass "เจอเครื่อง W81" || fail "ไม่เจอเครื่อง"
PART=$(DB "select \"partCode\" from \"SparePart\" where \"offCatalog\"=false and \"partCode\" is not null order by id limit 1")
[ "$(GET $A "work-orders/search-all?q=$PART" | J "d.parts.some(p=>p.partCode==='$PART')")" = "true" ] && pass "เจออะไหล่ $PART" || fail "ไม่เจออะไหล่ $PART"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
