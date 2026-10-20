#!/bin/bash
# ทดสอบ: ใบงานเปิดค้างของสาขา (GET /branches/:code/open-work-orders) — ฟอร์มเปิดใบงานใช้เตือนก่อนเปิดซ้ำ
#   · ใบที่เพิ่งเปิดขึ้น ใหม่ก่อนเก่า · ชื่อขั้น · รหัสเครื่อง · อาการบรรทัดแรก · คนเปิด
#   · ใบที่ปิด/ยกเลิกแล้วไม่ขึ้น · ใบทดสอบไม่ขึ้น · สาขาอื่นไม่ปน · ไม่ล็อกอิน 401
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
OPEN() { curl -s "localhost:4000/api/branches/$2/open-work-orders" -H "$(H $1)"; }
A=$(login A001)
# สาขาที่ยังไม่มีใบค้างเลย — นับผลได้ตรง ๆ ไม่ต้องเดาว่าข้อมูลเดิมมีกี่ใบ
BR=$(DB "select b.code from \"Branch\" b where not exists (select 1 from \"WorkOrder\" w where w.\"branchId\"=b.id and w.status not in ('DONE','CANCELLED')) order by b.code limit 1")
[ -n "$BR" ] || { echo "FAIL ไม่มีสาขาว่างให้ทดสอบ"; exit 1; }
OTHER=$(DB "select code from \"Branch\" where code<>'$BR' order by code limit 1")
IDS=""
cleanup() { for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done; }
trap cleanup EXIT
newwo() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$2\",\"symptom\":\"$3\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }

[ "$(OPEN $A $BR | J 'd.length')" = "0" ] && pass "สาขาไม่มีใบค้าง = รายการว่าง (ฟอร์มไม่ขึ้นกล่องเตือน)" || fail "สาขาว่างแต่มีรายการ"

W1=$(newwo $BR W5 "ไม่ปั่นหมาดทดสอบเปิดซ้ำ"); sleep 1
W2=$(newwo $BR D2 "อบไม่ร้อนทดสอบเปิดซ้ำ")
W3=$(newwo $BR W6 "ปิดแล้วทดสอบ"); W4=$(newwo $BR W7 "ใบทดสอบ"); W5=$(newwo $OTHER W5 "สาขาอื่นทดสอบ")
IDS="$W1 $W2 $W3 $W4 $W5"
DB "update \"WorkOrder\" set symptom=symptom||chr(10)||'สาเหตุ: ภายในทดสอบ' where id=$W1" >/dev/null
DB "update \"WorkOrder\" set status='DONE' where id=$W3" >/dev/null
DB "update \"WorkOrder\" set \"isTest\"=true where id=$W4" >/dev/null
R=$(OPEN $A $BR)

[ "$(echo "$R" | J 'd.map(o=>o.id).join(",")')" = "$W2,$W1" ] && pass "ขึ้นเฉพาะใบค้างจริง ใหม่ก่อนเก่า — ไม่มีใบปิดแล้ว ใบทดสอบ หรือใบสาขาอื่น" \
  || fail "รายการ: $(echo "$R" | J 'd.map(o=>o.code+":"+o.status).join(",")')"
[ "$(echo "$R" | J "d.find(o=>o.id==$W1).symptom")" = "ไม่ปั่นหมาดทดสอบเปิดซ้ำ" ] && pass "อาการบรรทัดแรกเท่านั้น (ไม่มีบรรทัดสาเหตุ)" || fail "อาการ: $(echo "$R" | J "d.find(o=>o.id==$W1).symptom")"
[ "$(echo "$R" | J "const o=d.find(o=>o.id==$W1); [o.machineCode,o.statusLabel,!!o.createdBy,!!o.createdAt].join('|')")" = "W5|หัวหน้าภาค · ระบุอะไหล่|true|true" ] \
  && pass "มีรหัสเครื่อง ชื่อขั้น คนเปิด วันที่เปิด" || fail "ช่อง: $(echo "$R" | J "JSON.stringify(d.find(o=>o.id==$W1))")"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/branches/$BR/open-work-orders)" = "401" ] && pass "ไม่ล็อกอิน 401" || fail "ไม่ล็อกอินเข้าได้"

[ -z "$FAILED" ]
