#!/bin/bash
# ทดสอบ: ขั้นช่างแยก "เข้างาน" กับ "ปิดงาน" ตามการถึงหน้างานจริง (เจ้าของงานเลือก พ.ย. 69)
#   · ในฐานข้อมูลยังเป็น IN_PROGRESS ตัวเดียว — ป้ายของใบคิดจากประวัติ ARRIVED หลังปล่อยงานล่าสุด (onSiteOf)
#     ยังไม่ถึง = "ช่าง · เข้างาน" · ถึงแล้ว = "ช่าง · ปิดงาน" ทั้งหน้าใบงาน (statusLabel · onSite) และแถวในรายการ
#   · ถึงแล้ววันค้างในรายการนับจากตอนถึง · ปล่อยงานใหม่ (DISPATCHED ใหม่กว่า) = ต้องถึงใหม่
#   · รายงานตัวเข้าสาขา = ถึงหน้างานของใบที่ทีมถืออยู่ที่สาขานั้น (ใบทีมอื่นไม่โดน · รายงานตัวซ้ำไม่เขียนซ้ำ)
#   · ชื่อขั้นรวมของสถานะ (ตัวกรอง/รายงาน) ยังเป็น "ช่าง · เข้างาน/ปิดงาน"
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
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
A=$(login A001)
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
OTHER_TEAM=$(DB "select zone from \"Branch\" where zone is not null and zone <> '$TEAM' limit 1")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
OLD_GEO=$(DB "select coalesce(latitude::text,'')||'|'||coalesce(longitude::text,'')||'|'||\"radiusMeters\" from \"Branch\" where code='C0006'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
IDS=""
cleanup() {
  purge_orders "$A" $IDS
  DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
  IFS='|' read -r LAT LNG RAD <<< "$OLD_GEO"
  DB "update \"Branch\" set latitude=nullif('$LAT','')::float, longitude=nullif('$LNG','')::float, \"radiusMeters\"=$RAD where code='C0006'" >/dev/null
  DB "delete from \"BranchCheckIn\" where \"userId\"=$TID and \"checkedInAt\" > now()-interval '1 hour' and note='ทดสอบแยกเข้างาน'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
T=$(login T001)

# ใบที่ปล่อยงานให้ทีมแล้ว (IN_PROGRESS) — ปล่อยเมื่อ 3 ชม.ก่อน
mk() {
  local id=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบแยกเข้างาน/ปิดงาน"}]}' | J 'd.orders?d.orders[0].id:d.id')
  DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='${1:-$TEAM}', \"scheduledAt\"=date_trunc('day', now()) where id=$id" >/dev/null
  DB "insert into \"WorkOrderLog\" (\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($id,null,'DISPATCHED','IN_PROGRESS','ทดสอบ',now()-interval '3 hours')" >/dev/null
  echo $id
}
CODE_OF() { DB "select code from \"WorkOrder\" where id=$1"; }
D() { GET $A work-orders/$1 | J "$2"; }
ROW() { GET $A "work-orders?status=ALL&search=$(CODE_OF $1)" | J "const r=d.rows.find(r=>r.id==$1); $2"; }
ARRIVED() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='ARRIVED'"; }

W1=$(mk); W2=$(mk); W3=$(mk "$OTHER_TEAM"); IDS="$W1 $W2 $W3"

echo "═══ ยังไม่ถึง = เข้างาน"
[ "$(D $W1 '[d.statusLabel,d.onSite].join("|")')" = "ช่าง · เข้างาน|false" ] && [ "$(ROW $W1 'r.statusLabel')" = "ช่าง · เข้างาน" ] \
  && pass "หน้าใบงานและรายการ: ช่าง · เข้างาน (onSite false)" || fail "ยังไม่ถึง: $(D $W1 '[d.statusLabel,d.onSite].join("|")') · $(ROW $W1 'r.statusLabel')"

echo "═══ ช่างกดถึงหน้างาน = ปิดงาน"
R=$(POST $T work-orders/$W1/arrive '{}')
[ "$(echo "$R" | J 'd.ok')" = "true" ] && [ "$(ARRIVED $W1)" = "1" ] && [ "$(DB "select status from \"WorkOrder\" where id=$W1")" = "IN_PROGRESS" ] \
  && pass "ถึงหน้างาน: ประวัติ ARRIVED 1 แถว สถานะในฐานข้อมูลยังเป็น IN_PROGRESS" || fail "arrive: $R"
[ "$(D $W1 '[d.statusLabel,d.onSite].join("|")')" = "ช่าง · ปิดงาน|true" ] && [ "$(ROW $W1 'r.statusLabel')" = "ช่าง · ปิดงาน" ] \
  && pass "หน้าใบงานและรายการเปลี่ยนเป็น ช่าง · ปิดงาน ทันที" || fail "หลังถึง: $(D $W1 'd.statusLabel') · $(ROW $W1 'r.statusLabel')"
GAP=$(ROW $W1 'Math.round((Date.now()-Date.parse(r.stageSince))/60e3)')
[ "$GAP" -le 2 ] && pass "วันค้างในรายการนับจากตอนถึงหน้างาน (${GAP} นาที ไม่ใช่ 3 ชม.จากตอนปล่อยงาน)" || fail "วันค้างหลังถึง: ${GAP} นาที"

echo "═══ ปล่อยงานใหม่ = ต้องถึงใหม่"
DB "insert into \"WorkOrderLog\" (\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($W1,null,'DISPATCHED','IN_PROGRESS','ปล่อยใหม่',now()+interval '1 second')" >/dev/null
sleep 1
[ "$(D $W1 '[d.statusLabel,d.onSite].join("|")')" = "ช่าง · เข้างาน|false" ] && [ "$(ROW $W1 'r.statusLabel')" = "ช่าง · เข้างาน" ] \
  && pass "ถึงหน้างานของรอบก่อนไม่นับ — กลับเป็น ช่าง · เข้างาน" || fail "ปล่อยใหม่: $(D $W1 'd.statusLabel')"

echo "═══ รายงานตัวเข้าสาขา = ถึงหน้างาน"
DB "update \"Branch\" set latitude=8.0863, longitude=98.9063, \"radiusMeters\"=200 where code='C0006'" >/dev/null
BID=$(DB "select id from \"Branch\" where code='C0006'")
R=$(POST $T branch-checkins "{\"branchId\":$BID,\"latitude\":8.0864,\"longitude\":98.9063,\"note\":\"ทดสอบแยกเข้างาน\"}")
GOT=$(echo "$R" | J '(d.arrived||[]).slice().sort().join(",")')
WANT=$(printf "%s\n%s\n" "$(CODE_OF $W1)" "$(CODE_OF $W2)" | sort | paste -sd,)
[ "$GOT" = "$WANT" ] && [ "$(ARRIVED $W2)" = "1" ] && [ "$(ARRIVED $W3)" = "0" ] \
  && pass "รายงานตัวแล้วใบของทีมที่สาขานี้ขึ้นถึงหน้างาน ($GOT) · ใบทีมอื่นที่สาขาเดียวกันไม่โดน" || fail "check-in: $R · W2=$(ARRIVED $W2) W3=$(ARRIVED $W3)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W2 and action='ARRIVED'" | grep -q "รายงานตัวเข้าสาขา" \
  && [ "$(D $W2 'd.statusLabel')" = "ช่าง · ปิดงาน" ] && pass "ประวัติบอกว่าถึงจากการรายงานตัว · ป้ายเป็น ช่าง · ปิดงาน" || fail "บันทึกจาก check-in"
R=$(POST $T branch-checkins "{\"branchId\":$BID,\"latitude\":8.0864,\"longitude\":98.9063,\"note\":\"ทดสอบแยกเข้างาน\"}")
[ "$(echo "$R" | J '(d.arrived||[]).length')" = "0" ] && [ "$(ARRIVED $W2)" = "1" ] && pass "รายงานตัวซ้ำไม่เขียนถึงหน้างานซ้ำ" || fail "รายงานตัวซ้ำ: $R"

echo "═══ ชื่อขั้นรวมของสถานะไม่เปลี่ยน"
[ "$(GET $A work-orders/options | J '(d.statuses||d.stages||[]).find(s=>s.value==="IN_PROGRESS").label')" = "ช่าง · เข้างาน/ปิดงาน" ] \
  && pass "ตัวเลือกสถานะ (ตัวกรอง/รายงาน) ยังเป็น ช่าง · เข้างาน/ปิดงาน" || fail "ชื่อขั้นรวมเปลี่ยน"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
