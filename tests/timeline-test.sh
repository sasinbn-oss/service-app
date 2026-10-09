#!/bin/bash
# ทดสอบ: ไทม์ไลน์ (Super Admin เท่านั้น) — ใบงาน: ทุกขั้นพร้อมบทบาทคนกด · รับ/คืนรถที่ผูกกับใบงาน ·
#        รายงานตัว GPS ที่สาขา · แผนรายวัน · เวลาแต่ละช่วง · ทีมทั้งวัน · แอดมิน/หัวหน้าภาค/ช่างดูไม่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
ID=""
cleanup() {
  [ -n "$ID" ] && curl -s -X DELETE "localhost:4000/api/work-orders/$ID" -H "$(H $A)" >/dev/null
  DB "delete from \"VehicleLog\" where purpose='ทดสอบไทม์ไลน์$SUF'; delete from \"BranchCheckIn\" where note='ทดสอบไทม์ไลน์$SUF';
      delete from \"TeamDayPlan\" where team='กระบี่' and date=current_date+50; delete from \"User\" where \"employeeCode\" like 'ZT%$SUF'" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"passwordHash\",\"mustChangePassword\") values
  ('ZTS$SUF','ซุปเปอร์ไทม์ไลน์','SUPER_ADMIN',null,'$HASH',false),('ZTE$SUF','ช่างไทม์ไลน์','EMPLOYEE','กระบี่','$HASH',false)" >/dev/null
SA=$(login ZTS$SUF); T=$(login ZTE$SUF)
TID=$(DB "select id from \"User\" where \"employeeCode\"='ZTE$SUF'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null

WO=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบไทม์ไลน์"}]}')
ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id'); CODE=$(echo "$WO" | J 'd.orders?d.orders[0].code:d.code')
POST $S "work-orders/$ID/parts" '{"needsParts":false}' >/dev/null
POST $S "work-orders/$ID/assign" '{"team":"กระบี่"}' >/dev/null
DAY=$(DB "select to_char(current_date+50,'YYYY-MM-DD')")
DB "update \"WorkOrder\" set \"scheduledAt\"='$DAY' where id=$ID" >/dev/null
curl -s -X PUT localhost:4000/api/plans -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"date\":\"$DAY\",\"team\":\"กระบี่\",\"memberIds\":[$TID],\"startTime\":\"08:30\"}" >/dev/null
BR=$(DB "select id from \"Branch\" where code='C0006'")
DB "insert into \"VehicleLog\"(\"vehicleId\",\"userId\",purpose,\"startMileage\",\"endMileage\",\"startedAt\",\"endedAt\",status,\"workOrderId\",cost)
    values (1,$TID,'ทดสอบไทม์ไลน์$SUF',1000,1146,now(),now()+interval '5 hour','DONE',$ID,600)" >/dev/null
DB "insert into \"BranchCheckIn\"(\"userId\",\"branchId\",latitude,longitude,\"distanceMeters\",\"withinRadius\",note) values ($TID,$BR,8.06,98.91,38.4,true,'ทดสอบไทม์ไลน์$SUF')" >/dev/null

echo "═══ สิทธิ์"
for who in A S T; do
  R=$(curl -s "localhost:4000/api/work-orders/$ID/timeline" -H "$(H ${!who})")
  echo "$R" | grep -q "เฉพาะ Super Admin" || { fail "$who ดูไทม์ไลน์ได้: $(echo $R|head -c 80)"; continue; }
done
[ -z "$FAILED" ] && pass "แอดมิน หัวหน้าภาค ช่าง ดูไทม์ไลน์ใบงานไม่ได้"
R=$(curl -s -G localhost:4000/api/plans/timeline --data-urlencode "date=$DAY" --data-urlencode "team=กระบี่" -H "$(H $A)")
echo "$R" | grep -q "เฉพาะ Super Admin" && pass "แอดมินดูไทม์ไลน์ทีมไม่ได้" || fail "แอดมินดูไทม์ไลน์ทีมได้"

echo
echo "═══ ไทม์ไลน์ใบงาน"
R=$(curl -s "localhost:4000/api/work-orders/$ID/timeline" -H "$(H $SA)")
N=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID")
[ "$(echo "$R" | J 'd.events.filter(e=>e.tags&&e.tags.some(t=>t.text.startsWith("สถานะ"))).length')" = "$N" ] && pass "ทุกรายการในประวัติใบงานอยู่ในไทม์ไลน์ ($N รายการ)" || fail "ประวัติไม่ครบ: $(echo "$R" | head -c 200)"
echo "$R" | J 'const f=(w)=>d.events.find(e=>e.what.startsWith(w)); [f("เปิดใบงาน").role,f("ระบุว่าไม่ต้องใช้อะไหล่").role,f("จ่ายงาน").role].join("|")' | grep -q "^ADMIN|SUPERVISOR|SUPERVISOR$" \
  && pass "บอกบทบาทคนกดถูก: เปิดใบงาน = แอดมิน · ระบุอะไหล่/จ่ายงาน = หัวหน้าภาค" || fail "บทบาท: $(echo "$R" | J 'd.events.map(e=>e.what+":"+e.role).join(", ")')"
echo "$R" | J 'const e=d.events.find(e=>e.what.startsWith("รายงานตัว")); e&&e.role==="EMPLOYEE"&&e.tags[0].tone==="ok"&&/38 ม/.test(e.tags[0].text)?"ok":"bad"' | grep -q ok \
  && pass "มีรายงานตัว GPS ของช่าง (ห่าง 38 ม. · ในรัศมี)" || fail "ไม่มีรายงานตัว"
echo "$R" | J '[d.events.some(e=>e.what==="รับรถ 1กก-1234"),d.events.some(e=>e.what==="คืนรถ 1กก-1234"&&/146 กม/.test(e.note)&&/600 บาท/.test(e.note))].join()' | grep -q "true,true" \
  && pass "มีรับรถ/คืนรถที่ผูกกับใบงาน พร้อมระยะทางและค่าใช้จ่าย" || fail "ไม่มีรถ"
echo "$R" | J 'd.events.some(e=>e.what==="จัดแผนทีม กระบี่"&&e.role==="SUPERVISOR"&&/เข้า 08:30/.test(e.note))?"ok":"bad"' | grep -q ok \
  && pass "มีการจัดแผนทีมของวันนัด (ใครจัด · เวลาเข้า)" || fail "ไม่มีแผน"
echo "$R" | J 'const s=d.stages.reduce((a,x)=>a+x.ms,0); s<=d.summary.totalMs+1000&&d.summary.open&&d.summary.people>=2&&d.events.every((e,i,a)=>!i||a[i-1].at<=e.at)?"ok":"bad"' | grep -q ok \
  && pass "สรุปเวลาแต่ละช่วงไม่เกินเวลารวม · เรียงตามเวลา · นับคนที่แตะใบงาน" || fail "สรุป: $(echo "$R" | J 'JSON.stringify(d.summary)')"

echo
echo "═══ ไทม์ไลน์ทีมทั้งวัน"
R=$(curl -s -G localhost:4000/api/plans/timeline --data-urlencode "date=$DAY" --data-urlencode "team=กระบี่" -H "$(H $SA)")
echo "$R" | J 'd.members.join()==="ช่างไทม์ไลน์"&&d.events.some(e=>e.what==="เวลาเข้าหน้างานตามแผน")&&d.events.some(e=>e.what==="จัดแผนทีม")?"ok":"bad"' | grep -q ok \
  && pass "ไทม์ไลน์ทีม: คนในแผน · เวลาเข้าตามแผน · ใครจัดแผน" || fail "ทีม: $(echo "$R" | head -c 300)"
TODAY=$(DB "select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD')")
R=$(curl -s -G localhost:4000/api/plans/timeline --data-urlencode "date=$TODAY" --data-urlencode "team=กระบี่" -H "$(H $SA)")
echo "$R" | J '[d.events.some(e=>e.what.startsWith("รายงานตัว")),d.events.some(e=>e.what.startsWith("รับรถ")),d.events.some(e=>e.workOrder&&e.workOrder.code==="'$CODE'")].join()' | grep -q "true,true,true" \
  && pass "ไทม์ไลน์ทีมวันนี้: รายงานตัว · รับรถ · ทุกการกดในใบงานของทีม" || fail "ทีมวันนี้: $(echo "$R" | J 'd.events.map(e=>e.what).join(", ")')"

DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
