#!/bin/bash
# ทดสอบ: รายงานอะไหล่หมด (GET /work-orders/reports/parts-out) — สาขาไหนรอของอะไร
#   · ขึ้นเฉพาะตัวที่แอดมินเช็คว่าหมด (ตัวที่มีของไม่ขึ้น) · ชื่อ/รหัสอะไหล่ จำนวน สาขา เครื่อง คนเช็ค หมดมาแล้วกี่วัน
#   · วันของเข้า: เลยแล้วติดลบ · ไม่ใส่ = null · ของมาแล้วเช็คใหม่ว่ามี = หายจากรายงาน · ใบทดสอบไม่ขึ้น
#   · หัวหน้าภาคนอกพื้นที่ไม่เห็น · ช่าง 403 · ไฟล์ Excel มีเลขใบงานจริง
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s "localhost:4000/api/work-orders/reports/parts-out$2" -H "$(H $1)"; }
A=$(login A001); T=$(login T001)
BR=C0006
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
newwo() { # $1 เครื่อง → ใบที่หัวหน้าภาคระบุแผงวงจร 1 + สายพาน 2 แล้ว
  local I=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"ทดสอบรายงานอะไหล่หมด\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
  echo $I
}
mine() { REP $1 | J "d.rows.filter(r=>[$W1,$W2,$W3].includes(r.workOrderId)).map(r=>r.code+'/'+r.partCode).sort().join(',')"; }

W1=$(newwo W71); W2=$(newwo W72); W3=$(newwo W73); IDS="$W1 $W2 $W3"
C1=$(DB "select code from \"WorkOrder\" where id=$W1"); C2=$(DB "select code from \"WorkOrder\" where id=$W2"); C3=$(DB "select code from \"WorkOrder\" where id=$W3")
# W1: สายพานหมด ของเข้าเลยมาแล้ว · W2: แผงวงจรหมด ไม่ใส่วัน · W3: สายพานหมดแต่เป็นใบทดสอบ
POST $A "work-orders/$W1/parts-check" "{\"expectedAt\":\"2026-01-05\",\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-R1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}" >/dev/null
POST $A "work-orders/$W2/parts-check" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-R2\"}]}" >/dev/null
POST $A "work-orders/$W3/parts-check" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-R3\"},{\"sparePartId\":$BELT,\"inStock\":false}]}" >/dev/null
DB "update \"WorkOrder\" set \"isTest\"=true where id=$W3" >/dev/null
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\" in ($W1,$W2) and \"inStock\"=false")" = "2" ] || fail "เตรียมข้อมูลไม่ได้ (ฐานข้อมูลไม่มีตัวที่หมด)"

[ "$(mine $A)" = "$(printf '%s\n' "$C1/SP-BELT" "$C2/SP-BOARD" | sort | paste -sd,)" ] \
  && pass "ขึ้นเฉพาะตัวที่หมด (ตัวที่มีของไม่ขึ้น) · ใบทดสอบไม่ขึ้น" || fail "รายการ: $(mine $A)"
R1=$(REP $A | J "JSON.stringify(d.rows.find(r=>r.workOrderId==$W1))")
[ "$(echo "$R1" | J '[d.branchCode,d.machineCode,d.quantity,d.checkedBy,d.outDays,d.expectedAt,d.etaDays<0,d.partName.length>0].join("|")')" = "$BR|W71|2|$ANAME|0|2026-01-05|true|true" ] \
  && pass "แถวบอก สาขา เครื่อง จำนวน คนเช็ค หมดมาแล้ว 0 วัน · วันของเข้าเลยแล้ว (ติดลบ)" || fail "แถว: $R1"
[ "$(REP $A | J "d.rows.find(r=>r.workOrderId==$W2).etaDays")" = "null" ] && pass "ไม่ใส่วันของเข้า = null" || fail "วันของเข้า W2 ไม่ใช่ null"

[ "$(mine $S)" = "$(mine $A)" ] && pass "หัวหน้าภาคในพื้นที่เห็นเหมือนแอดมิน" || fail "หัวหน้าภาคเห็น: $(mine $S)"
DB "update \"User\" set region='ภาคทดสอบไม่มีจริง' where \"employeeCode\"='S001'" >/dev/null
S2=$(login S001)
[ -z "$(mine $S2)" ] && pass "หัวหน้าภาคนอกพื้นที่ไม่เห็น" || fail "นอกพื้นที่เห็น: $(mine $S2)"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/reports/parts-out -H "$(H $T)")" = "403" ] && pass "ช่าง 403" || fail "ช่างเข้าได้"

P=$(REP $A "?format=xlsx" | J 'd.path')
curl -s "localhost:4000$P" -H "$(H $A)" -o /tmp/parts-out-test.xlsx
unzip -p /tmp/parts-out-test.xlsx xl/sharedStrings.xml 2>/dev/null | grep -q "$C1" && unzip -p /tmp/parts-out-test.xlsx xl/workbook.xml | grep -q "รวมตามอะไหล่" \
  && pass "Excel มีเลขใบงานจริง และชีตรวมตามอะไหล่" || fail "Excel ไม่มีข้อมูล (path=$P)"
rm -f /tmp/parts-out-test.xlsx

# ของมาแล้ว — แอดมินเช็คใหม่ว่ามี ใบหายจากรายงาน
POST $A "work-orders/$W1/parts-check" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-R4\"}]}" >/dev/null
[ "$(mine $A)" = "$C2/SP-BOARD" ] && pass "ของมาแล้วเช็คใหม่ว่ามี = หายจากรายงานเอง" || fail "หลังของมา: $(mine $A)"

[ -z "$FAILED" ]
