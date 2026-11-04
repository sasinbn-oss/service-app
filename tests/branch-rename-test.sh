#!/bin/bash
# ทดสอบ: แก้ชื่อสาขาในแอป · นำเข้าไม่ทับ · คืนตามรายงาน · ประวัติสาขา (เจ้าของงานตัดสิน 4 พ.ย. 69 — ไม่รวมสาขา)
#   ก PUT /branches/:id/name: ฐานเปลี่ยน (ตัดช่องว่าง) · จำไว้เป็น BranchPin name (fromValue = ชื่อตามรายงาน) · ลงประวัติ RENAMED + ชื่อคนแก้
#       · ว่าง/ไม่ส่ง/ยาวเกิน/id ผิด = 400 ข้อความไทย · ไม่พบ = 404 · ชื่อเดิม = ไม่ลงประวัติซ้ำ · ช่าง 403 ทุกเส้น ฐานไม่เปลี่ยน
#   ข writeReportBranches (ส่วนเขียนสาขาของตัวนำเข้ารายงานเครื่อง — เรียกตรงด้วย ts-node เพราะอัปไฟล์เครื่องจริงปิดเคสทั้งระบบ):
#       ไฟล์ส่งชื่อเดิมมา ชื่อที่แก้ไม่ถูกทับ · fromValue ตามชื่อในไฟล์ล่าสุด · /manage ส่ง reportName + editedInApp มี name
#       · ไฟล์ไม่มีชื่อ (ชื่อ = รหัส) ไม่ทับทั้งชื่อและ fromValue · สาขาที่ไม่ได้แก้ชื่อยังตามไฟล์ (ไม่มี pin ไม่มีประวัติ) · สาขาใหม่ได้ชื่อจากไฟล์
#   ค คืนตามรายงาน: ชื่อในไฟล์ล่าสุด · เลิกบังคับ · ประวัติ NAME_RESTORED · คืนซ้ำ 400 · หลังคืน ไฟล์เขียนชื่อได้ตามเดิม
#   ง PUT /branches/:id ที่ส่ง name ผ่านทางเดียวกัน (pin + ประวัติ) · ไม่ส่ง name ไม่ลงประวัติ · ชื่อว่าง 400 · รหัสซ้ำ 409 (เดิมขึ้น "ไม่พบสาขา")
#       · แก้กลับเป็นชื่อตามรายงาน = เลิกบังคับ · ไฟล์ตามทันชื่อที่แก้ = เลิกบังคับเอง (ชื่อไม่เปลี่ยน)
#   จ GET /:id/logs ใหม่ก่อนเก่า · limit · ลำดับประวัติทั้งหมดในฐาน
#   ฉ ปิด/เปิดสาขาลงประวัติ (เจ้าของงานขอเพิ่ม): CLOSED "ปิดสาขา — เหตุผล" · REOPENED "เปิดสาขาอีกครั้ง" (meta เก็บเหตุผลที่เคยปิด)
#       · ปิดไม่มีเหตุผล/เปิดซ้ำ = 400 ไม่ลงประวัติ · ช่าง 403 · สาขาที่ปิดไม่ขึ้นตอนค้นด้วยคำค้น ขึ้นเฉพาะแท็บ "ปิดแล้ว"
#   ช สาขาว่างที่แก้ชื่อแล้วยังลบได้ (ประวัติหายตามสาขา)
#
# ใช้สาขา ZZR… ของตัวเองทั้งหมด (ไม่แตะสาขาจริง) · ลบใน trap — ประวัติ/pin/เครื่องหายตามสาขา (onDelete: Cascade)
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SEND() { curl -s -X "$2" "localhost:4000/api/$3" -H "$(H $1)" -H 'Content-Type: application/json' -d "${4:-{\}}"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
A=$(login A001); T=$(login T001)
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")

# เขียนสาขา/เครื่องจากแถวรายงานเครื่องด้วยฟังก์ชันเดียวกับตัวนำเข้า (แถวแบบ SheetRow)
REPORT() {
  (cd backend && node_modules/.bin/ts-node --transpile-only -e '
    import("./src/machines/import").then(async (m) => {
      const r = await m.writeReportBranches(JSON.parse(process.argv[1]));
      console.log(JSON.stringify({ branches: r.branchesTouched }));
      process.exit(0);
    }).catch((e) => { console.log("ERR " + e.message); process.exit(1); });' "$1" 2>&1 | tail -1)
}
row() { echo "{\"branchCode\":\"$1\",\"branchName\":\"$2\",\"ownership\":null,\"branchStatus\":null,\"machineCode\":\"$3\",\"machineType\":\"WASHER\",\"machineBrand\":null,\"stateCode\":\"1\",\"signalLost\":false,\"region\":null,\"zone\":null,\"grade\":null}"; }

cleanup() {
  DB "delete from \"Branch\" where code like 'ZZR%'" >/dev/null
}
cleanup
trap cleanup EXIT

R=$(DB "insert into \"Branch\"(code,name) values ('ZZR001','ร้านทดสอบชื่อตามรายงาน') returning id")
nm() { DB "select name from \"Branch\" where id=${1:-$R}"; }
pin() { DB "select coalesce(string_agg(coalesce(\"fromValue\",'-')||'>'||value, ','),'') from \"BranchPin\" where \"branchId\"=${1:-$R} and field='name'"; }
logs() { DB "select count(*) from \"BranchLog\" where \"branchId\"=${1:-$R}"; }
last() { DB "select action||'|'||note||'|'||coalesce(\"byName\",'-')||'|'||coalesce(\"byUserId\"::text,'-') from \"BranchLog\" where \"branchId\"=${1:-$R} order by id desc limit 1"; }

echo "═══ ก แก้ชื่อในแอป"
OUT=$(SEND $A PUT branches/$R/name '{"name":"  ชื่อแก้ในแอป  "}')
[ "$(echo "$OUT" | J 'd.code+"|"+d.name+"|"+d.reportName')" = "ZZR001|ชื่อแก้ในแอป|ร้านทดสอบชื่อตามรายงาน" ] && [ "$(nm)" = "ชื่อแก้ในแอป" ] \
  && [ "$(pin)" = "ร้านทดสอบชื่อตามรายงาน>ชื่อแก้ในแอป" ] \
  && pass "แก้ชื่อ: ฐานเปลี่ยน (ตัดช่องว่าง) · จำชื่อตามรายงานไว้ใน BranchPin name" || fail "แก้ชื่อ: $OUT · $(nm) · $(pin)"
[ "$(last)" = "RENAMED|ชื่อสาขา: ร้านทดสอบชื่อตามรายงาน → ชื่อแก้ในแอป|$ANAME|$AID" ] \
  && pass "ลงประวัติ “ชื่อสาขา: เดิม → ใหม่” พร้อมชื่อและ id คนแก้" || fail "ประวัติ: $(last)"
E1=$(SEND $A PUT branches/$R/name '{"name":"   "}' | J 'd.error')
E2=$(SEND $A PUT branches/$R/name '{}' | J 'd.error')
E3=$(SEND $A PUT branches/$R/name "{\"name\":\"$(printf 'ก%.0s' $(seq 1 201))\"}" | J 'd.error')
E4=$(SEND $A PUT branches/abc/name '{"name":"x"}' | J 'd.error')
[ "$E1" = "ชื่อสาขาว่างไม่ได้" ] && [ "$E2" = "ชื่อสาขาว่างไม่ได้" ] && [ "$E3" = "ชื่อสาขายาวเกิน 200 ตัวอักษร" ] && [ "$E4" = "รหัสสาขาไม่ถูกต้อง" ] \
  && [ "$(CODE $A branches/$R/name PUT '{"name":"   "}')" = "400" ] && [ "$(nm)" = "ชื่อแก้ในแอป" ] && [ "$(logs)" = "1" ] \
  && pass "ชื่อว่าง/ไม่ส่ง/ยาวเกิน/id ผิด: 400 ข้อความไทย · ฐานและประวัติไม่เปลี่ยน" || fail "400: $E1 · $E2 · $E3 · $E4 · $(nm) · $(logs)"
[ "$(CODE $A branches/999999999/name PUT '{"name":"ไม่มีสาขานี้"}')" = "404" ] && pass "สาขาที่ไม่มี: 404" || fail "ไม่พบสาขาไม่ใช่ 404"
SEND $A PUT branches/$R/name '{"name":"ชื่อแก้ในแอป"}' >/dev/null
[ "$(logs)" = "1" ] && [ "$(pin)" = "ร้านทดสอบชื่อตามรายงาน>ชื่อแก้ในแอป" ] && pass "บันทึกชื่อเดิมซ้ำ: ไม่ลงประวัติซ้ำ · pin ไม่เปลี่ยน" || fail "ชื่อเดิมซ้ำ: $(logs) · $(pin)"
[ "$(CODE $T branches/$R/name PUT '{"name":"ช่างแก้ชื่อ"}')" = "403" ] && [ "$(CODE $T branches/$R/name/restore POST)" = "403" ] \
  && [ "$(CODE $T branches/$R/logs)" = "403" ] && [ "$(CODE $T branches/$R PUT '{"name":"ช่างแก้ชื่อ"}')" = "403" ] \
  && [ "$(nm)" = "ชื่อแก้ในแอป" ] && [ "$(pin)" = "ร้านทดสอบชื่อตามรายงาน>ชื่อแก้ในแอป" ] && [ "$(logs)" = "1" ] \
  && pass "ช่าง: แก้ชื่อ/คืนชื่อ/ดูประวัติ/PUT สาขา 403 · ฐานไม่เปลี่ยน" || fail "ช่าง: $(nm) · $(pin) · $(logs)"

echo "═══ ข รายงานเครื่องไม่ทับชื่อที่แก้"
O=$(REPORT "[$(row ZZR001 ชื่อตามรายงานรอบใหม่ W1)]")
[ "$(nm)" = "ชื่อแก้ในแอป" ] && [ "$(pin)" = "ชื่อตามรายงานรอบใหม่>ชื่อแก้ในแอป" ] \
  && [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$R and code='W1'")" = "1" ] && [ "$(logs)" = "1" ] \
  && pass "ไฟล์ส่งชื่ออื่นมา: ชื่อที่แก้ไม่ถูกทับ · ชื่อตามรายงานตามไฟล์ล่าสุด · เครื่องยังเขียนตามปกติ · ไม่ลงประวัติ" \
  || fail "รายงานเครื่อง ($O): $(nm) · $(pin)"
M=$(GET $A "branches/manage?search=ZZR001")
[ "$(echo "$M" | J 'const r=d.rows.find(x=>x.code==="ZZR001"); r.reportName+"|"+r.editedInApp.includes("name")')" = "ชื่อตามรายงานรอบใหม่|true" ] \
  && pass "/manage ส่งชื่อตามรายงาน + ช่องที่แก้ในแอปมี name" || fail "manage: $(echo "$M" | head -c 300)"
REPORT "[$(row ZZR001 ZZR001 W1)]" >/dev/null
[ "$(nm)" = "ชื่อแก้ในแอป" ] && [ "$(pin)" = "ชื่อตามรายงานรอบใหม่>ชื่อแก้ในแอป" ] \
  && pass "ไฟล์ที่ไม่มีชื่อ (ชื่อ = รหัส): ไม่ทับชื่อ และไม่จดรหัสเป็นชื่อตามรายงาน" || fail "ไฟล์ไม่มีชื่อ: $(nm) · $(pin)"
R2=$(DB "insert into \"Branch\"(code,name) values ('ZZR002','ร้านทดสอบไม่ได้แก้ชื่อ') returning id")
REPORT "[$(row ZZR002 ชื่อใหม่จากรายงานเครื่อง W1)]" >/dev/null
[ "$(nm $R2)" = "ชื่อใหม่จากรายงานเครื่อง" ] && [ -z "$(pin $R2)" ] && [ "$(logs $R2)" = "0" ] \
  && pass "สาขาที่ไม่ได้แก้ชื่อ: ชื่อตามไฟล์ได้เหมือนเดิม (ไม่สร้าง pin ไม่ลงประวัติ)" || fail "ไม่ได้แก้ชื่อ: $(nm $R2) · $(pin $R2) · $(logs $R2)"
REPORT "[$(row ZZR002 ZZR002 W1)]" >/dev/null
[ "$(nm $R2)" = "ชื่อใหม่จากรายงานเครื่อง" ] && pass "ไฟล์ไม่มีชื่อ: ไม่เขียนชื่อสาขาเป็นรหัส (เดิมทับเป็น ZZR002)" || fail "ชื่อกลายเป็นรหัส: $(nm $R2)"
REPORT "[$(row ZZR003 ร้านใหม่จากรายงานเครื่อง W1)]" >/dev/null
[ "$(DB "select name from \"Branch\" where code='ZZR003'")" = "ร้านใหม่จากรายงานเครื่อง" ] && pass "สาขาใหม่ในไฟล์: สร้างด้วยชื่อในไฟล์" || fail "สาขาใหม่: $(DB "select name from \"Branch\" where code='ZZR003'")"

echo "═══ ค คืนตามรายงาน"
OUT=$(SEND $A POST branches/$R/name/restore)
[ "$(nm)" = "ชื่อตามรายงานรอบใหม่" ] && [ -z "$(pin)" ] && [ "$(echo "$OUT" | J 'd.name+"|"+d.reportName')" = "ชื่อตามรายงานรอบใหม่|null" ] \
  && [ "$(last)" = "NAME_RESTORED|คืนชื่อตามรายงาน: ชื่อแก้ในแอป → ชื่อตามรายงานรอบใหม่|$ANAME|$AID" ] \
  && pass "คืนตามรายงาน: ชื่อในไฟล์ล่าสุด (ไม่ใช่ชื่อก่อนแก้ครั้งแรก) · เลิกบังคับ · ลงประวัติ" || fail "คืนตามรายงาน: $OUT · $(nm) · $(pin) · $(last)"
E=$(SEND $A POST branches/$R/name/restore | J 'd.error')
[ "$E" = "ZZR001 ใช้ชื่อตามรายงานอยู่แล้ว" ] && [ "$(logs)" = "2" ] && pass "คืนซ้ำ (ไม่ได้แก้ไว้): 400 ข้อความไทย ไม่ลงประวัติ" || fail "คืนซ้ำ: $E · $(logs)"
REPORT "[$(row ZZR001 ชื่อตามรายงานล่าสุด W1)]" >/dev/null
[ "$(nm)" = "ชื่อตามรายงานล่าสุด" ] && pass "หลังคืนชื่อ: รายงานเครื่องเขียนชื่อตามไฟล์ได้ตามเดิม" || fail "ชื่อไม่ตามไฟล์: $(nm)"

echo "═══ ง PUT /branches/:id ที่ส่ง name"
SEND $A PUT branches/$R '{"name":"ชื่อแก้ทางฟอร์ม","radiusMeters":180}' >/dev/null
[ "$(DB "select name||'|'||\"radiusMeters\" from \"Branch\" where id=$R")" = "ชื่อแก้ทางฟอร์ม|180" ] && [ "$(pin)" = "ชื่อตามรายงานล่าสุด>ชื่อแก้ทางฟอร์ม" ] \
  && [ "$(last)" = "RENAMED|ชื่อสาขา: ชื่อตามรายงานล่าสุด → ชื่อแก้ทางฟอร์ม|$ANAME|$AID" ] \
  && pass "PUT /:id ที่ส่ง name: ชื่อ+รัศมีเปลี่ยน · จำไว้และลงประวัติเหมือน PUT /:id/name (ไม่มีทางลัด)" || fail "PUT /:id name: $(nm) · $(pin) · $(last)"
SEND $A PUT branches/$R '{"radiusMeters":150}' >/dev/null
[ "$(DB "select name||'|'||\"radiusMeters\" from \"Branch\" where id=$R")" = "ชื่อแก้ทางฟอร์ม|150" ] && [ "$(logs)" = "3" ] \
  && pass "PUT /:id ไม่ส่ง name: ไม่ลงประวัติ ชื่อไม่เปลี่ยน" || fail "PUT ไม่มีชื่อ: $(logs)"
E=$(SEND $A PUT branches/$R '{"name":"   "}' | J 'd.error')
[ "$E" = "ชื่อสาขาว่างไม่ได้" ] && [ "$(nm)" = "ชื่อแก้ทางฟอร์ม" ] && [ "$(logs)" = "3" ] && pass "PUT /:id ชื่อว่าง: 400 ข้อความไทย ไม่มีอะไรเปลี่ยน" || fail "PUT /:id ชื่อว่าง: $E"
E=$(SEND $A PUT branches/$R2 '{"code":"ZZR001"}' | J 'd.error')
[ "$E" = "มีสาขารหัส ZZR001 อยู่แล้ว" ] && [ "$(DB "select code from \"Branch\" where id=$R2")" = "ZZR002" ] \
  && pass "PUT /:id รหัสซ้ำ: 409 ข้อความไทย (เดิมขึ้น “ไม่พบสาขานี้”)" || fail "รหัสซ้ำ: $E"
[ "$(CODE $A branches/999999999 PUT '{"radiusMeters":100}')" = "404" ] && [ "$(CODE $A branches/999999999 PUT '{"name":"ไม่มีสาขานี้"}')" = "404" ] \
  && pass "PUT /:id สาขาที่ไม่มี: 404 (ทั้งแบบมีและไม่มีชื่อ)" || fail "PUT /:id ไม่พบไม่ใช่ 404"
OUT=$(SEND $A PUT branches/$R/name '{"name":"ชื่อตามรายงานล่าสุด"}')
[ "$(nm)" = "ชื่อตามรายงานล่าสุด" ] && [ -z "$(pin)" ] && [ "$(echo "$OUT" | J 'd.reportName')" = "null" ] && [ "$(logs)" = "4" ] \
  && pass "แก้กลับเป็นชื่อตามรายงานเอง: เลิกบังคับ (ลงประวัติ)" || fail "แก้กลับ: $OUT · $(pin)"
SEND $A PUT branches/$R/name '{"name":"ชื่อแก้รอบสาม"}' >/dev/null
REPORT "[$(row ZZR001 ชื่อแก้รอบสาม W1)]" >/dev/null
[ "$(nm)" = "ชื่อแก้รอบสาม" ] && [ -z "$(pin)" ] && [ "$(logs)" = "5" ] \
  && pass "ไฟล์เขียนชื่อตรงกับที่แก้แล้ว (ต้นทางแก้ตาม): เลิกบังคับเอง ชื่อไม่เปลี่ยน" || fail "pin ยังอยู่: $(pin) · $(nm)"

echo "═══ จ ประวัติสาขา"
L=$(GET $A "branches/$R/logs?limit=2")
[ "$(echo "$L" | J 'd.length===2 && d[0].id>d[1].id && d[0].note==="ชื่อสาขา: ชื่อตามรายงานล่าสุด → ชื่อแก้รอบสาม" && d[1].note==="ชื่อสาขา: ชื่อแก้ทางฟอร์ม → ชื่อตามรายงานล่าสุด" && d[0].byName==="'"$ANAME"'"')" = "true" ] \
  && pass "GET /:id/logs ใหม่ก่อนเก่า · limit · ชื่อคนแก้" || fail "logs: $L"

echo "═══ ฉ ปิด/เปิดสาขาลงประวัติ · สาขาที่ปิดซ่อนจากการค้น"
[ "$(GET $A "branches?search=ZZR001" | J 'd.some(b=>b.code==="ZZR001")')" = "true" ] \
  && [ "$(GET $A "branches?search=$(node -p 'encodeURIComponent("ชื่อแก้รอบสาม")')" | J 'd.some(b=>b.code==="ZZR001")')" = "true" ] \
  && pass "ก่อนปิด: ค้นรหัส/ชื่อที่แก้แล้วเจอ (ตัวเทียบของข้อถัดไป)" || fail "ก่อนปิดค้นไม่เจอ"
[ "$(CODE $A branches/$R/close POST '{"note":"  "}')" = "400" ] && [ "$(CODE $T branches/$R/close POST '{"note":"ช่างปิด"}')" = "403" ] \
  && [ -z "$(DB "select \"cancelledAt\" from \"Branch\" where id=$R")" ] && [ "$(logs)" = "5" ] \
  && pass "ปิดไม่มีเหตุผล 400 · ช่าง 403 · ยังเปิดอยู่ ไม่ลงประวัติ" || fail "ปิดผิดทาง: $(logs)"
SEND $A POST branches/$R/close '{"note":"ร้านย้ายไปใช้รหัสใหม่"}' >/dev/null
[ -n "$(DB "select \"cancelledAt\" from \"Branch\" where id=$R")" ] && [ "$(last)" = "CLOSED|ปิดสาขา — ร้านย้ายไปใช้รหัสใหม่|$ANAME|$AID" ] \
  && [ "$(DB "select \"cancelledNote\" from \"Branch\" where id=$R")" = "ปิดในแอปโดย $ANAME — ร้านย้ายไปใช้รหัสใหม่" ] \
  && pass "ปิดสาขา: ลงประวัติ “ปิดสาขา — เหตุผล” พร้อมคนปิด · cancelledNote เหมือนเดิม" || fail "ปิดสาขา: $(last)"
[ "$(GET $A "branches?search=ZZR001" | J 'd.some(b=>b.code==="ZZR001")')" = "false" ] \
  && [ "$(GET $A "branches?search=$(node -p 'encodeURIComponent("ชื่อแก้รอบสาม")')" | J 'd.some(b=>b.code==="ZZR001")')" = "false" ] \
  && [ "$(GET $A "branches/manage?search=ZZR001" | J 'd.rows.some(r=>r.code==="ZZR001")')" = "false" ] \
  && [ "$(GET $A "branches/manage?status=closed&search=ZZR001" | J 'd.rows.some(r=>r.code==="ZZR001")')" = "true" ] \
  && pass "สาขาที่ปิด: ค้นรหัส/ชื่อไม่เจอ · หน้าจัดการสาขาขึ้นเฉพาะแท็บ ปิดแล้ว" || fail "สาขาที่ปิดยังค้นเจอ"
[ "$(DB "select count(*) from \"Branch\" where id=$R")" = "1" ] && [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$R")" = "1" ] \
  && pass "สาขาที่ปิดไม่ถูกลบ: สาขาและเครื่องยังอยู่ในฐาน" || fail "สาขาที่ปิดหาย"
[ "$(CODE $T branches/$R/reopen POST)" = "403" ] && [ -n "$(DB "select \"cancelledAt\" from \"Branch\" where id=$R")" ] && [ "$(logs)" = "6" ] \
  && pass "ช่างเปิดสาขาคืน: 403 ยังปิดอยู่" || fail "ช่างเปิดคืนได้"
SEND $A POST branches/$R/reopen >/dev/null
[ -z "$(DB "select \"cancelledAt\" from \"Branch\" where id=$R")" ] && [ "$(last)" = "REOPENED|เปิดสาขาอีกครั้ง|$ANAME|$AID" ] \
  && [ "$(DB "select meta->>'closedNote' from \"BranchLog\" where \"branchId\"=$R and action='REOPENED'")" = "ปิดในแอปโดย $ANAME — ร้านย้ายไปใช้รหัสใหม่" ] \
  && pass "เปิดสาขาอีกครั้ง: ลงประวัติ · เหตุผลที่เคยปิดเก็บใน meta (cancelledNote ถูกล้าง)" || fail "เปิดคืน: $(last)"
E=$(SEND $A POST branches/$R/reopen | J 'd.error')
[ "$E" = "ZZR001 ยังเปิดอยู่" ] && [ "$(logs)" = "7" ] && pass "เปิดซ้ำ: 400 ไม่ลงประวัติ" || fail "เปิดซ้ำ: $E · $(logs)"
[ "$(DB "select string_agg(action, ',' order by id) from \"BranchLog\" where \"branchId\"=$R")" = "RENAMED,NAME_RESTORED,RENAMED,RENAMED,RENAMED,CLOSED,REOPENED" ] \
  && [ "$(GET $A "branches/$R/logs?limit=1" | J 'd[0].note')" = "เปิดสาขาอีกครั้ง" ] \
  && pass "ประวัติทั้งหมดในฐานเรียงตามที่ทำ (แก้ชื่อ · คืนชื่อ · ปิด · เปิด)" || fail "ลำดับประวัติ: $(DB "select string_agg(action, ',' order by id) from \"BranchLog\" where \"branchId\"=$R")"

echo "═══ ช สาขาว่างยังลบได้"
R4=$(SEND $A POST branches '{"code":"ZZR004","name":"ร้านเพิ่มผิดทดสอบ"}' | J 'd.id')
SEND $A PUT branches/$R4/name '{"name":"ร้านเพิ่มผิดแก้ชื่อแล้ว"}' >/dev/null
[ "$(logs $R4)" = "1" ] && [ "$(CODE $A branches/$R4 DELETE)" = "204" ] && [ "$(DB "select count(*) from \"Branch\" where id=$R4")" = "0" ] \
  && [ "$(DB "select count(*) from \"BranchLog\" where \"branchId\"=$R4")" = "0" ] && [ "$(DB "select count(*) from \"BranchPin\" where \"branchId\"=$R4")" = "0" ] \
  && pass "สาขาว่างที่แก้ชื่อแล้ว: ลบได้ตามเดิม · ประวัติ/pin หายตามสาขา" || fail "ลบสาขาว่าง: $(logs $R4)"

[ -z "$FAILED" ]
