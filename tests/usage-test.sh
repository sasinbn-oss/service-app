#!/bin/bash
# ทดสอบ: การใช้งานแอป (GET /api/usage) — Super Admin และแอดมินเท่านั้น
#   · ทุกคำขอจดเป็นช่วง 5 นาที (แถวเดียวต่อช่วง) แยกคอม/มือถือ · ดูในฐานะไม่นับ
#   · ครั้ง = ช่วงที่ห่างไม่เกิน 15 นาที · เวลา = จำนวนช่วง × 5 · ค้นหาชื่อ/กรองตำแหน่ง · ย้อนหลังรายคน · Excel
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -At -v ON_ERROR_STOP=1 -c "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
ENC() { node -pe "encodeURIComponent(process.argv[1])" "$1"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" "localhost:4000/api/$2" -H "$(H $1)"; }

U=zz.usage
cleanup() { DB "delete from \"User\" where \"employeeCode\"='$U'" >/dev/null; }
cleanup; trap cleanup EXIT
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"passwordHash\") select '$U','ช่างทดสอบการใช้งาน','EMPLOYEE','ทีมทดสอบใช้งาน',\"passwordHash\" from \"User\" where \"employeeCode\"='A001'" >/dev/null
UID_=$(DB "select id from \"User\" where \"employeeCode\"='$U'")
A=$(login A001); T=$(login T001); S=$(login S001)

echo "═══ จดการใช้งาน"
X=$(login $U)
for i in 1 2 3; do curl -s -o /dev/null localhost:4000/api/auth/me -H "$(H $X)" -H 'User-Agent: Mozilla/5.0 (Linux; Android 14) Mobile'; done
sleep 1
[ "$(DB "select count(*)||'|'||min(device) from \"UsageSlot\" where \"userId\"=$UID_")" = "1|MOBILE" ] \
  && pass "เรียกหลายครั้งในช่วงเดียว = แถวเดียว · มือถือถูกจดเป็น MOBILE (ฐานข้อมูล)" || fail "แถว: $(DB "select slot, device from \"UsageSlot\" where \"userId\"=$UID_")"

# ช่วงสมมุติของวันนี้ (เวลาไทย): 08:00 08:05 08:10 = ครั้งเดียว · 08:30 ห่าง 15 นาทีพอดี = ยังครั้งเดิม · 10:00 = ครั้งใหม่
DB "delete from \"UsageSlot\" where \"userId\"=$UID_" >/dev/null
DAY=$(TZ=Asia/Bangkok date +%F)
for t in 08:00 08:05 08:10 08:30 10:00; do DB "insert into \"UsageSlot\" values ($UID_, ('$DAY $t'::timestamp - interval '7 hours'), 'WEB')" >/dev/null; done
DB "insert into \"UsageSlot\" values ($UID_, ('$DAY 07:00'::timestamp - interval '7 hours' - interval '3 days'), 'MOBILE')" >/dev/null

echo
echo "═══ ใครดูได้"
[ "$(CODE $A usage)" = "200" ] && pass "แอดมินดูได้" || fail "แอดมินดูไม่ได้"
[ "$(CODE $S usage)" = "403" ] && [ "$(CODE $T usage)" = "403" ] && [ "$(CODE $T usage/online)" = "403" ] && pass "หัวหน้าภาค/ช่างดูไม่ได้ (403)" || fail "คนอื่นดูได้"

echo
echo "═══ ภาพรวม + ค้นหา"
R=$(curl -s "localhost:4000/api/usage?range=today&q=$(ENC ทดสอบการใช้งาน)" -H "$(H $A)")
echo "$R" | J 'd.people.map(p=>p.name).join(",")==="ช่างทดสอบการใช้งาน"?"ok":"bad"' | grep -q ok && pass "ค้นหาชื่อเจอคนเดียว" || fail "ค้นหา: $(echo "$R" | J 'd.people.map(p=>p.name).join(",")')"
P=$(echo "$R" | J 'const p=d.people[0]; [p.sessions,p.minutes,p.today.length].join("|")')
[ "$P" = "2|25|2" ] && pass "วันนี้: 2 ครั้ง · 25 นาที (5 ช่วง × 5) · แถบเวลา 2 แท่ง" || fail "วันนี้ ครั้ง|นาที|แท่ง = $P"
[ "$(curl -s "localhost:4000/api/usage?range=7d&q=$(ENC ทีมทดสอบใช้งาน)" -H "$(H $A)" | J 'const p=d.people[0]; p.activeDays+"|"+p.devices.sort().join("+")')" = "2|MOBILE+WEB" ] \
  && pass "7 วัน: ค้นจากชื่อทีมได้ · ใช้ 2 วัน · คอม + มือถือ" || fail "7 วัน"
[ "$(curl -s "localhost:4000/api/usage?range=today&role=SUPERVISOR&q=$(ENC ทดสอบการใช้งาน)" -H "$(H $A)" | J 'd.people.length')" = "0" ] \
  && pass "กรองตำแหน่งหัวหน้าภาค ไม่เจอช่าง" || fail "กรองตำแหน่ง"
[ "$(echo "$R" | J 'd.heatmap.days.length+"|"+d.heatmap.cells[6].reduce((a,b)=>a+b,0)')" = "7|2" ] \
  && pass "ตารางสี 7 วัน · วันนี้ชั่วโมง 08 และ 10 มีคนนี้ (นับคน ไม่ใช่ช่วง)" || fail "heatmap: $(echo "$R" | J 'd.heatmap.days.length+"|"+d.heatmap.cells[6].join(",")')"

echo
echo "═══ รายคน + Excel"
D=$(curl -s "localhost:4000/api/usage/user/$UID_?days=7" -H "$(H $A)")
[ "$(echo "$D" | J 'const t=d.days[0], o=d.days[3]; [d.days.length,t.minutes,t.sessions,o.minutes,o.bars[0].device].join("|")')" = "7|25|2|5|MOBILE" ] \
  && pass "ย้อนหลัง 7 วัน: วันนี้ 25 นาที 2 ครั้ง · 3 วันก่อนใช้มือถือ 5 นาที" || fail "รายคน: $(echo "$D" | head -c 300)"
E=$(curl -s "localhost:4000/api/usage/export?range=7d&q=$(ENC ทดสอบการใช้งาน)" -H "$(H $A)")
XL=$(mktemp --suffix=.xlsx); curl -s "localhost:4000$(echo "$E" | J 'd.path')" -o "$XL"
ROWS=$(NODE_PATH=backend/node_modules node -e 'const E=require("exceljs");const w=new E.Workbook();w.xlsx.readFile(process.argv[1]).then(()=>{const o=[];w.worksheets[0].eachRow((r,i)=>{if(i>1)o.push([r.getCell(6).text,r.getCell(7).text,r.getCell(8).text,r.getCell(9).text].join("/"))});console.log(o.join(" "))})' "$XL"); rm -f "$XL"
[ "$ROWS" = "08:00/10:05/25/2 07:00/07:05/5/1" ] && pass "Excel: แถวละคนละวัน เข้าครั้งแรก/ใช้ล่าสุด/นาที/ครั้ง ถูก" || fail "Excel: $ROWS"

echo
echo "═══ ดูในฐานะไม่นับเป็นการใช้ของคนที่ถูกดู"
BEFORE=$(DB "select count(*) from \"UsageSlot\" where \"userId\"=(select id from \"User\" where \"employeeCode\"='T001') and slot >= now() - interval '6 minutes'")
DB "delete from \"UsageSlot\" where \"userId\"=(select id from \"User\" where \"employeeCode\"='T001') and slot >= now() - interval '6 minutes'" >/dev/null
VA=$(curl -s -X POST localhost:4000/api/auth/view-as -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"userId\":$(DB "select id from \"User\" where \"employeeCode\"='T001'")}" | J 'd.token')
curl -s -o /dev/null localhost:4000/api/work-orders -H "$(H $VA)"
curl -s -o /dev/null -X POST localhost:4000/api/auth/view-as/stop -H "$(H $VA)"
sleep 1
[ "$(DB "select count(*) from \"UsageSlot\" where \"userId\"=(select id from \"User\" where \"employeeCode\"='T001') and slot >= now() - interval '6 minutes'")" = "0" ] \
  && pass "ดูในฐานะช่างแล้ว ช่างไม่มีช่วงการใช้งานเพิ่ม" || fail "ดูในฐานะถูกนับเป็นการใช้ของช่าง"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
