#!/bin/bash
# ทดสอบ: รายงานใบงานแยกตามผู้เปิด (GET /work-orders/reports/by-opener)
#   · ตัวเลขตรงกับฐานข้อมูล (นับวันตามเวลาไทย · ไม่นับใบทดสอบ) · รวมทุกคน = จำนวนแถว
#   · กรองผู้เปิดคนเดียว · ใบไม่มีผู้เปิดรวมเป็น "ระบบ" · หัวหน้าภาคเห็นเฉพาะภาคที่ดูแล · ช่างไม่ได้
#   · ช่วงวันที่ผิด/ยาวเกินปฏิเสธ · ไฟล์ Excel มีชีตสรุป รายการทั้งหมด และ 1 ชีตต่อคน ตัวเลขในไฟล์ตรงกัน
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s -G "localhost:4000/api/work-orders/reports/by-opener" --data-urlencode "from=$2" --data-urlencode "to=$3" ${4:+--data-urlencode "opener=$4"} ${5:+--data-urlencode "format=$5"} -H "$(H $1)"; }
A=$(login A001); S=$(login S001); T=$(login T001)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  rm -f /tmp/opener-report-test.xlsx
}
trap cleanup EXIT
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
TODAY=$(TZ=Asia/Bangkok date +%F)
NEWWO() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"${2:-NORMAL}\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"ทดสอบรายงานผู้เปิด\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
SOUTH=$(DB "select code from \"Branch\" where region='ใต้' and \"cancelledAt\" is null order by code limit 1")
OTHER=$(DB "select code from \"Branch\" where region<>'ใต้' and region is not null and \"cancelledAt\" is null order by code limit 1")
W1=$(NEWWO $SOUTH URGENT); W2=$(NEWWO $SOUTH); W3=$(NEWWO $OTHER); W4=$(NEWWO $SOUTH); IDS="$W1 $W2 $W3 $W4"
# W4 ไม่มีผู้เปิด (บัญชีถูกลบ/ระบบสร้าง) · W2 ปิดแล้ว · ใบทดสอบไม่นับ
DB "update \"WorkOrder\" set symptom='น้ำเข้าเครื่องช้า'||chr(10)||'สาเหตุ: 4 way ชำรุด', \"workStatus\"='WAITING_PARTS' where id=$W1;
    update \"WorkOrder\" set \"createdById\"=null where id=$W4; update \"WorkOrder\" set status='DONE', \"closedAt\"=now(), \"closeResult\"='FIXED' where id=$W2" >/dev/null
# นับจากฐานข้อมูลด้วยช่วงเวลาไทยเดียวกัน
RANGE="\"createdAt\" >= ('$TODAY'::date - interval '7 hours') and \"createdAt\" < ('$TODAY'::date + interval '17 hours') and not \"isTest\""

echo "═══ ตัวเลขตรงกับฐานข้อมูล"
R=$(REP $A $TODAY $TODAY)
[ "$(echo "$R" | J 'd.totals.total+"|"+d.count')" = "$(DB "select count(*)||'|'||count(*) from \"WorkOrder\" where $RANGE")" ] \
  && pass "รวมทุกคน = จำนวนใบในฐานข้อมูลวันนี้ (นับตามเวลาไทย ไม่นับใบทดสอบ)" || fail "รวม: $(echo "$R" | J 'd.totals.total') ฐานข้อมูล $(DB "select count(*) from \"WorkOrder\" where $RANGE")"
[ "$(echo "$R" | J "const s=d.summary.find(x=>x.userId===$AID); s.total+'|'+s.urgent+'|'+s.done")" = "$(DB "select count(*)||'|'||count(*) filter (where priority='URGENT')||'|'||count(*) filter (where status='DONE') from \"WorkOrder\" where $RANGE and \"createdById\"=$AID")" ] \
  && pass "แถวของ A001: เปิด/ด่วน/ปิดแล้ว ตรงฐานข้อมูล" || fail "แถว A001: $(echo "$R" | J "JSON.stringify(d.summary.find(x=>x.userId===$AID))")"
echo "$R" | J 'const s=d.summary.at(-1); s.userId===null&&s.name.startsWith("ระบบ")&&s.total>=1?"ok":"bad"' | grep -q ok \
  && pass "ใบไม่มีผู้เปิดรวมเป็น \"ระบบ\" อยู่ท้ายตาราง" || fail "ไม่มีแถวระบบ"
echo "$R" | J 'd.summary.reduce((n,s)=>n+s.open+s.done+s.cancelled,0)===d.totals.total&&d.summary.reduce((n,s)=>n+s.fromBoard+s.manual,0)===d.totals.total?"ok":"bad"' | grep -q ok \
  && pass "ค้าง+ปิด+ยกเลิก และ กระดาน+เปิดเอง รวมได้เท่ายอดทั้งหมด" || fail "ยอดย่อยไม่ลงตัว"

echo
echo "═══ กรองผู้เปิด"
[ "$(REP $A $TODAY $TODAY $AID | J 'd.summary.length+"|"+d.openerLabel+"|"+d.count')" = "1|Admin|$(DB "select count(*) from \"WorkOrder\" where $RANGE and \"createdById\"=$AID")" ] \
  && pass "เลือก A001 คนเดียว เหลือแถวเดียว จำนวนตรง" || fail "กรองผู้เปิด: $(REP $A $TODAY $TODAY $AID | head -c 200)"
[ "$(REP $A $TODAY $TODAY system | J 'd.summary.length+"|"+(d.summary[0].userId===null)')" = "1|true" ] && pass "เลือก \"ระบบ\" ได้เฉพาะใบไม่มีผู้เปิด" || fail "กรองระบบ"

echo
echo "═══ สิทธิ์"
RS=$(REP $S $TODAY $TODAY)
[ "$(echo "$RS" | J 'd.scopeLabel')" = "เฉพาะภาค/ทีมที่ดูแล" ] && [ "$(echo "$RS" | J 'd.count')" -lt "$(echo "$R" | J 'd.count')" ] \
  && pass "หัวหน้าภาคเห็นเฉพาะภาคที่ดูแล (ใบภาคอื่นไม่นับ: $(echo "$RS" | J 'd.count') < $(echo "$R" | J 'd.count'))" || fail "หัวหน้าภาค: $(echo "$RS" | head -c 200)"
[ "$(curl -s -o /dev/null -w '%{http_code}' -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode from=$TODAY --data-urlencode to=$TODAY -H "$(H $T)")" = 403 ] \
  && pass "ช่างเปิดรายงานนี้ไม่ได้" || fail "ช่างเปิดได้"

echo
echo "═══ ช่วงวันที่"
REP $A 2026-10-16 2026-10-01 | grep -q "ไม่หลังวันที่สิ้นสุด" && pass "วันเริ่มหลังวันสิ้นสุด ปฏิเสธ" || fail "ช่วงกลับด้านผ่าน"
REP $A 2024-01-01 2026-10-01 | grep -q "ไม่เกิน 1 ปี" && pass "ช่วงยาวเกิน 1 ปี ปฏิเสธ" || fail "ช่วงยาวผ่าน"

echo
echo "═══ ไฟล์ Excel"
P=$(REP $A $TODAY $TODAY "" xlsx | J 'd.path')
curl -s -o /tmp/opener-report-test.xlsx "localhost:4000$P"
W1CODE=$(DB "select code from \"WorkOrder\" where id=$W1")
OUT=$(python3 - "$AID" "$W1CODE" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook("/tmp/opener-report-test.xlsx")
names = wb.sheetnames
s = wb[names[0]]
rows = [r for r in s.iter_rows(values_only=True)]
total = next(r for r in rows if r and r[0] == "รวม")[4]
detail = wb[names[1]]
n = sum(1 for r in detail.iter_rows(min_row=5, values_only=True) if r and r[0])
per = sum(wb[x].max_row - 4 for x in names[2:])
head = [c.value for c in detail[4]]
i = head.index("ชื่อสาขา")
order = "/".join(head[i:i + 3])
code = sys.argv[2]
row = next(r for r in detail.iter_rows(min_row=5, values_only=True) if r[3] == code)
print(f"{names[0]}|{names[1]}|{len(names)-2}|{total}|{n}|{per}|{order}|{row[i + 1]!r}|{row[i + 2]}")
PY
)
SUMN=$(REP $A $TODAY $TODAY | J 'd.summary.length+"|"+d.totals.total')
[ "$(echo "$OUT" | cut -d'|' -f1,2)" = "สรุปตามผู้เปิด|รายการใบงานทั้งหมด" ] && pass "ไฟล์มีชีตสรุป + รายการทั้งหมด" || fail "ชื่อชีต: $OUT"
[ "$(echo "$OUT" | cut -d'|' -f3)|$(echo "$OUT" | cut -d'|' -f4)" = "$SUMN" ] && pass "1 ชีตต่อผู้เปิด และยอดรวมในไฟล์ตรงกับหน้าจอ ($OUT)" || fail "ชีต/ยอด: $OUT vs $SUMN"
[ "$(echo "$OUT" | cut -d'|' -f5)" = "$(echo "$OUT" | cut -d'|' -f4)" ] && [ "$(echo "$OUT" | cut -d'|' -f6)" = "$(echo "$OUT" | cut -d'|' -f4)" ] \
  && pass "แถวในชีตรายการ = แถวรวมทุกชีตคน = ยอดรวม (กระทบยอดได้)" || fail "แถวไม่ตรง: $OUT"

[ "$(echo "$OUT" | cut -d'|' -f7)" = "ชื่อสาขา/อาการ/สถานะ" ] && pass "อาการกับสถานะอยู่ถัดจากชื่อสาขา" || fail "ลำดับคอลัมน์: $(echo "$OUT" | cut -d'|' -f7)"
[ "$(echo "$OUT" | cut -d'|' -f8)" = "'น้ำเข้าเครื่องช้า\\nสาเหตุ: 4 way ชำรุด'" ] && pass "อาการหลายบรรทัดมาครบในช่องเดียว" || fail "อาการ: $(echo "$OUT" | cut -d'|' -f8)"
[ "$(echo "$OUT" | cut -d'|' -f9)" = "$(curl -s "localhost:4000/api/work-orders/$W1" -H "$(H $A)" | J 'd.workStatusLabel')" ] \
  && pass "สถานะตรงกับที่หน้าใบงานแสดง ($(echo "$OUT" | cut -d'|' -f9))" || fail "สถานะ: $(echo "$OUT" | cut -d'|' -f9)"

[ -z "$FAILED" ]
