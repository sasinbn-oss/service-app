#!/bin/bash
# ทดสอบ: รายงานทั้งระบบ (GET /reports/system) — แอดมินเท่านั้น
#   · หัวหน้าภาค/ช่างได้ 403 · ช่วงวันที่ต้องครบคู่และไม่กลับด้าน
#   · ไฟล์มี 8 ชีตตามลำดับ · จำนวนแถวพนักงาน/สาขา/เครื่อง/ใบงานตรงกับฐานข้อมูล
#   · ช่วงวันที่กรองชีตใบงาน (ใบที่เปิดวันนี้อยู่ ใบที่ย้อนไปเมื่อปีก่อนไม่อยู่) · ไม่นับใบทดสอบ
#   · เบอร์โทรพนักงานมา · ไม่มีรหัสผ่าน (hash) หรือเลขบัตรเติมน้ำมันหลุดเข้าไฟล์
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s -G "localhost:4000/api/reports/system" ${2:+--data-urlencode "from=$2"} ${3:+--data-urlencode "to=$3"} -H "$(H $1)"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -G "localhost:4000/api/reports/system" ${2:+--data-urlencode "from=$2"} ${3:+--data-urlencode "to=$3"} -H "$(H $1)"; }
A=$(login A001); S=$(login S001); T=$(login T001)
XLSX=/tmp/system-report-test.xlsx
IDS=""
OLD_PHONE=$(DB "select coalesce(phone,'') from \"User\" where \"employeeCode\"='T001'")
VID=$(DB "select id from \"Vehicle\" order by id limit 1")
cleanup() {
  DB "update \"User\" set phone=nullif('$OLD_PHONE','') where \"employeeCode\"='T001'" >/dev/null
  [ -n "$VID" ] && DB "delete from \"VehicleCard\" where \"fleetCardNo\"='ZZFLEET998877'" >/dev/null
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  rm -f $XLSX
}
trap cleanup EXIT
# ค่าที่ต้องเห็นในไฟล์ (เบอร์) กับค่าที่ต้องไม่เห็น (เลขบัตร) ต้องมีอยู่จริง ไม่งั้นเทสต์ผ่านเพราะไม่มีอะไรให้เช็ค
DB "update \"User\" set phone='0891234567' where \"employeeCode\"='T001'" >/dev/null
[ -n "$VID" ] && DB "insert into \"VehicleCard\"(\"vehicleId\",\"fleetCardNo\",\"easyPassNo\") values ($VID,'ZZFLEET998877','ZZEASY665544') on conflict do nothing" >/dev/null
TODAY=$(TZ=Asia/Bangkok date +%F)
BR=$(DB "select code from \"Branch\" where \"cancelledAt\" is null order by code limit 1")
NEWWO() { POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"$1\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
W1=$(NEWWO "ทดสอบรายงานทั้งระบบ วันนี้"); W2=$(NEWWO "ทดสอบรายงานทั้งระบบ ปีก่อน"); W3=$(NEWWO "ทดสอบรายงานทั้งระบบ ใบทดสอบ"); IDS="$W1 $W2 $W3"
DB "update \"WorkOrder\" set \"createdAt\"=now()-interval '400 days' where id=$W2; update \"WorkOrder\" set \"isTest\"=true where id=$W3" >/dev/null
C1=$(DB "select code from \"WorkOrder\" where id=$W1"); C2=$(DB "select code from \"WorkOrder\" where id=$W2"); C3=$(DB "select code from \"WorkOrder\" where id=$W3")

echo "═══ สิทธิ์"
[ "$(CODE $S)" = 403 ] && pass "หัวหน้าภาคออกไม่ได้ (403)" || fail "หัวหน้าภาคได้ $(CODE $S)"
[ "$(CODE $T)" = 403 ] && pass "ช่างออกไม่ได้ (403)" || fail "ช่างได้ $(CODE $T)"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/reports/system)" = 401 ] && pass "ไม่ล็อกอินได้ 401" || fail "ไม่ล็อกอิน"

echo
echo "═══ ช่วงวันที่"
[ "$(CODE $A $TODAY "")" = 400 ] && pass "ใส่วันเริ่มอย่างเดียวถูกปฏิเสธ: $(REP $A $TODAY "" | J 'd.error')" || fail "วันเดียวผ่าน"
[ "$(CODE $A 2026-10-10 2026-10-01)" = 400 ] && pass "วันเริ่มหลังวันสิ้นสุดถูกปฏิเสธ" || fail "กลับด้านผ่าน"
[ "$(CODE $A 2026-1-1 2026-02-01)" = 400 ] && pass "รูปแบบวันที่ผิดถูกปฏิเสธ" || fail "รูปแบบผิดผ่าน"

echo
echo "═══ ไฟล์ทั้งหมด (ไม่เลือกช่วง)"
R=$(REP $A)
P=$(echo "$R" | J 'd.path'); B=$(echo "$R" | J 'd.bytes')
curl -s -o $XLSX "localhost:4000$P" -H "$(H $A)"
[ "$(stat -c %s $XLSX)" = "$B" ] && pass "ดาวน์โหลดได้ ขนาดตรงกับที่แจ้ง ($B ไบต์)" || fail "ขนาด $(stat -c %s $XLSX) vs $B"
READ() { python3 - "$XLSX" "$@" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
def rows(name): return [r for r in wb[name].iter_rows(min_row=5, values_only=True) if r and r[0] not in (None, "ไม่มีข้อมูล")]
what = sys.argv[2]
if what == "sheets": print("/".join(wb.sheetnames))
elif what == "count": print(len(rows(sys.argv[3])))
elif what == "codes": print(" ".join(str(r[1]) for r in rows("ใบงาน")))
elif what == "phone":
    r = next(r for r in rows("พนักงาน") if r[0] == sys.argv[3]); print(r[5] or "")
elif what == "all":
    print("\n".join(str(c) for s in wb.sheetnames for r in wb[s].iter_rows(values_only=True) for c in r if c is not None))
PY
}
[ "$(READ sheets)" = "ภาพรวม/พนักงาน/ทีมช่าง/สาขา/เครื่อง/ใบงาน/อะไหล่/รถ" ] && pass "มี 8 ชีตตามลำดับ" || fail "ชีต: $(READ sheets)"
[ "$(READ count พนักงาน)" = "$(DB 'select count(*) from "User"')" ] && pass "พนักงานครบทุกบัญชี รวมที่ถูกลบ ($(READ count พนักงาน))" || fail "พนักงาน $(READ count พนักงาน) vs $(DB 'select count(*) from "User"')"
[ "$(READ count สาขา)" = "$(DB 'select count(*) from "Branch"')" ] && pass "สาขาครบ ($(READ count สาขา))" || fail "สาขา $(READ count สาขา) vs $(DB 'select count(*) from "Branch"')"
[ "$(READ count เครื่อง)" = "$(DB 'select count(*) from "Machine"')" ] && pass "เครื่องครบ ($(READ count เครื่อง))" || fail "เครื่อง $(READ count เครื่อง) vs $(DB 'select count(*) from "Machine"')"
[ "$(READ count ใบงาน)" = "$(DB 'select count(*) from "WorkOrder" where not "isTest"')" ] && pass "ใบงานครบทุกใบที่ไม่ใช่ใบทดสอบ ($(READ count ใบงาน))" || fail "ใบงาน $(READ count ใบงาน) vs $(DB 'select count(*) from "WorkOrder" where not "isTest"')"
CODES=$(READ codes)
echo " $CODES " | grep -q " $C2 " && pass "ไม่เลือกช่วง = รวมใบเก่าด้วย" || fail "ไม่มีใบเก่า $C2"
echo " $CODES " | grep -q " $C3 " && fail "ใบทดสอบหลุดเข้าไฟล์" || pass "ไม่นับใบทดสอบ"

PHONE=0891234567
[ "$(READ phone T001)" = "$PHONE" ] && pass "เบอร์โทรพนักงานมา (T001: ${PHONE:-ว่าง})" || fail "เบอร์ $(READ phone T001) vs $PHONE"
ALL=$(READ all)
echo "$ALL" | grep -q '^\$2[aby]\$' && fail "มี password hash ในไฟล์" || pass "ไม่มี password hash"
CARDS=$(DB "select string_agg(x, ' ') from (select \"fleetCardNo\" x from \"VehicleCard\" union all select \"easyPassNo\" from \"VehicleCard\") t where x is not null and x<>''" 2>/dev/null || true)
LEAK=""; for c in $CARDS; do echo "$ALL" | grep -qF "$c" && LEAK="$LEAK $c"; done
[ -z "$LEAK" ] && pass "ไม่มีเลขบัตรเติมน้ำมัน/Easy Pass ($(echo $CARDS | wc -w) ใบในระบบ)" || fail "เลขบัตรหลุด:$LEAK"

echo
echo "═══ เลือกช่วงวันที่ = วันนี้"
P=$(REP $A $TODAY $TODAY | J 'd.path'); curl -s -o $XLSX "localhost:4000$P" -H "$(H $A)"
CODES=$(READ codes)
RANGE="\"createdAt\" >= ('$TODAY'::date - interval '7 hours') and \"createdAt\" < ('$TODAY'::date + interval '17 hours') and not \"isTest\""
[ "$(READ count ใบงาน)" = "$(DB "select count(*) from \"WorkOrder\" where $RANGE")" ] && pass "ใบงานเฉพาะที่เปิดวันนี้ตามเวลาไทย ($(READ count ใบงาน))" || fail "ช่วง: $(READ count ใบงาน) vs $(DB "select count(*) from \"WorkOrder\" where $RANGE")"
echo " $CODES " | grep -q " $C1 " && ! echo " $CODES " | grep -q " $C2 " && pass "ใบวันนี้อยู่ ใบเมื่อปีก่อนไม่อยู่" || fail "กรองช่วงผิด"
[ "$(READ count เครื่อง)" = "$(DB 'select count(*) from "Machine"')" ] && pass "ช่วงวันที่ไม่กระทบชีตเครื่อง (ข้อมูล ณ ตอนนี้)" || fail "เครื่องโดนกรอง"

[ -z "$FAILED" ]
