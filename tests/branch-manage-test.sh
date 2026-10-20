#!/bin/bash
# ทดสอบ: หน้าจัดการสาขา (ออกแบบใหม่ ต.ค. 69)
#   · ลบสาขาที่มีใบงาน/ประวัติไม่ได้ (เดิมลบได้ และใบงานทั้งหมดของสาขาหายตาม) · สาขาว่างที่เพิ่มผิดยังลบได้
#   · ปิดสาขา: ต้องมีเหตุผล ปิดเคสบนกระดานที่ค้าง ใบงาน/ประวัติอยู่ครบ · เปิดคืนได้
#   · รายการแบบกรอง/แบ่งหน้า + ตัวเลขสรุป · ล้างพิกัดได้ · อ่านพิกัดจากลิงก์ Google Maps
#   · ช่างใช้ไม่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
SEND() { curl -s -X "$1" "localhost:4000/api/$3" -H "$(H $2)" -H 'Content-Type: application/json' -d "${4:-{\}}"; }
A=$(login A001); T=$(login T001)

# สาขาที่มีใบงานอยู่จริง — ใช้ทดสอบว่าลบไม่ได้ และทดสอบปิด/เปิดคืน
BR=C0006
BID=$(DB "select id from \"Branch\" where code='$BR'")
OLD=$(DB "select coalesce(latitude::text,'')||'|'||coalesce(longitude::text,'')||'|'||\"radiusMeters\"||'|'||coalesce(address,'') from \"Branch\" where id=$BID")
OLD_LAT=$(echo "$OLD" | cut -d'|' -f1); OLD_LNG=$(echo "$OLD" | cut -d'|' -f2); OLD_RAD=$(echo "$OLD" | cut -d'|' -f3)
OLD_ADDR=$(DB "select coalesce(address,'') from \"Branch\" where id=$BID")
WO_BEFORE=$(DB "select count(*) from \"WorkOrder\" where \"branchId\"=$BID")
NEW=ZZT901
PIN=ZZT902
OUT=""
cleanup() {
  [ -n "$OUT" ] && DB "delete from \"Outage\" where id=$OUT" >/dev/null
  DB "update \"Branch\" set \"cancelledAt\"=null, \"cancelledNote\"=null, latitude=nullif('$OLD_LAT','')::float, longitude=nullif('$OLD_LNG','')::float, \"radiusMeters\"=$OLD_RAD, address=nullif(\$q\$$OLD_ADDR\$q\$,'') where id=$BID" >/dev/null
  DB "delete from \"Branch\" where code in ('$NEW','$PIN')" >/dev/null
}
trap cleanup EXIT
cleanup

echo "═══ ลบสาขาที่มีข้อมูล"
[ "$WO_BEFORE" -gt 0 ] || fail "เตรียมข้อมูล: $BR ควรมีใบงาน"
R=$(curl -s -w '\n%{http_code}' -X DELETE localhost:4000/api/branches/$BID -H "$(H $A)")
[ "$(echo "$R" | tail -1)" = "409" ] && echo "$R" | head -1 | grep -q "ปิดสาขา" \
  && pass "ลบ $BR: 409 พร้อมบอกให้ใช้ปิดสาขา" || fail "ลบได้/ข้อความไม่ถูก: $R"
[ "$(DB "select count(*) from \"Branch\" where id=$BID")" = "1" ] && [ "$(DB "select count(*) from \"WorkOrder\" where \"branchId\"=$BID")" = "$WO_BEFORE" ] \
  && pass "สาขาและใบงาน $WO_BEFORE ใบยังอยู่ในฐานข้อมูล" || fail "ข้อมูลหาย"
[ "$(curl -s localhost:4000/api/branches/$BID/usage -H "$(H $A)" | J 'd.workOrders')" = "$WO_BEFORE" ] && pass "usage นับใบงานตรงฐานข้อมูล" || fail "usage ไม่ตรง"

echo "═══ เพิ่มแล้วลบสาขาว่าง"
NID=$(SEND POST $A branches "{\"code\":\"$NEW\",\"name\":\"สาขาทดสอบจัดการ\",\"latitude\":13.75,\"longitude\":100.5}" | J 'd.id')
[ "$(DB "select name from \"Branch\" where id=$NID")" = "สาขาทดสอบจัดการ" ] && pass "เพิ่มสาขาใหม่ได้" || fail "เพิ่มไม่ได้"
R=$(SEND POST $A branches "{\"code\":\"$NEW\",\"name\":\"ซ้ำ\"}")
echo "$R" | J 'd.error' | grep -q "มีสาขารหัส $NEW อยู่แล้ว" && pass "รหัสซ้ำ: ข้อความภาษาไทย" || fail "รหัสซ้ำ: $R"
R=$(SEND PUT $A branches/$NID '{"latitude":95}')
[ "$(echo "$R" | J 'typeof d.error==="string" && d.error.includes("ละติจูด")')" = "true" ] && pass "ละติจูดเกิน 90: ปฏิเสธเป็นภาษาไทย" || fail "ละติจูดผิด: $R"
SEND PUT $A branches/$NID '{"latitude":null,"longitude":null}' >/dev/null
[ "$(DB "select coalesce(latitude::text,'-')||coalesce(longitude::text,'-') from \"Branch\" where id=$NID")" = "--" ] && pass "ล้างพิกัดด้วย null ได้" || fail "ล้างพิกัดไม่ได้"
[ "$(CODE -X DELETE localhost:4000/api/branches/$NID -H "$(H $A)")" = "204" ] && [ "$(DB "select count(*) from \"Branch\" where id=$NID")" = "0" ] \
  && pass "สาขาว่างลบได้ (หายจากฐานข้อมูล)" || fail "ลบสาขาว่างไม่ได้"

echo "═══ ปิด/เปิดสาขา"
OUT=$(DB "insert into \"Outage\" (kind,\"branchId\",\"startedAt\",\"lastSeenAt\") values ('OFFLINE', $BID, now(), now()) returning id" | head -1)
[ "$(CODE -X POST localhost:4000/api/branches/$BID/close -H "$(H $A)" -H 'Content-Type: application/json' -d '{"note":"  "}')" = "400" ] \
  && [ -z "$(DB "select \"cancelledAt\" from \"Branch\" where id=$BID")" ] && pass "ปิดโดยไม่มีเหตุผล: 400 ยังเปิดอยู่" || fail "ปิดได้โดยไม่มีเหตุผล"
SEND POST $A branches/$BID/close '{"note":"ร้านย้ายที่"}' >/dev/null
[ "$(DB "select (\"cancelledAt\" is not null)::text||'|'||\"cancelledNote\" from \"Branch\" where id=$BID")" = "true|ปิดในแอปโดย $(DB "select name from \"User\" where \"employeeCode\"='A001'") — ร้านย้ายที่" ] \
  && pass "ปิดแล้ว: cancelledAt + เหตุผลพร้อมชื่อคนปิด" || fail "ปิด: $(DB "select \"cancelledAt\",\"cancelledNote\" from \"Branch\" where id=$BID")"
[ "$(DB "select (\"endedAt\" is not null)::text||'|'||\"closeReason\" from \"Outage\" where id=$OUT")" = "true|BRANCH_CANCELLED" ] && pass "เคสบนกระดานที่ค้างถูกปิด" || fail "เคสค้าง: $(DB "select \"endedAt\",\"closeReason\" from \"Outage\" where id=$OUT")"
[ "$(DB "select count(*) from \"WorkOrder\" where \"branchId\"=$BID")" = "$WO_BEFORE" ] && pass "ใบงานยังอยู่ครบหลังปิดสาขา" || fail "ใบงานหาย"
[ "$(CODE -X POST localhost:4000/api/branches/$BID/close -H "$(H $A)" -H 'Content-Type: application/json' -d '{"note":"ซ้ำ"}')" = "400" ] && pass "ปิดซ้ำ: 400" || fail "ปิดซ้ำได้"
[ "$(curl -s "localhost:4000/api/branches/manage?status=closed&search=$BR" -H "$(H $A)" | J "d.rows.some(r=>r.code===\"$BR\")")" = "true" ] \
  && [ "$(curl -s "localhost:4000/api/branches/manage?search=$BR" -H "$(H $A)" | J "d.rows.some(r=>r.code===\"$BR\")")" = "false" ] \
  && pass "สาขาที่ปิดอยู่ในแท็บปิดแล้ว ไม่อยู่ในรายการเปิด" || fail "ตัวกรองสถานะไม่ถูก"
SEND POST $A branches/$BID/reopen >/dev/null
[ "$(DB "select coalesce(\"cancelledAt\"::text,'-')||coalesce(\"cancelledNote\",'-') from \"Branch\" where id=$BID")" = "--" ] && pass "เปิดสาขาคืนได้" || fail "เปิดคืนไม่ได้"

echo "═══ รายการ/ตัวกรอง"
M=$(curl -s "localhost:4000/api/branches/manage?limit=5" -H "$(H $A)")
[ "$(echo "$M" | J "d.rows.length===5 && d.total===$(DB "select count(*) from \"Branch\" where \"cancelledAt\" is null") && d.counts.open===d.total")" = "true" ] \
  && pass "แบ่งหน้า 5 แถว · ยอดรวมตรงฐานข้อมูล" || fail "รายการ: $(echo "$M" | head -c 200)"
[ "$(echo "$M" | J 'd.counts.noCoords')" = "$(DB "select count(*) from \"Branch\" where \"cancelledAt\" is null and (latitude is null or longitude is null)")" ] \
  && [ "$(echo "$M" | J 'd.counts.noTeam')" = "$(DB "select count(*) from \"Branch\" where \"cancelledAt\" is null and zone is null and \"pmTeam\" is null")" ] \
  && pass "ตัวเลขสรุป ไม่มีพิกัด/ไม่มีทีม ตรงฐานข้อมูล" || fail "ตัวเลขสรุปไม่ตรง"
[ "$(curl -s "localhost:4000/api/branches/manage?coords=none&limit=200" -H "$(H $A)" | J 'd.rows.every(r=>r.latitude===null||r.longitude===null)')" = "true" ] && pass "กรองไม่มีพิกัด" || fail "กรองพิกัดไม่ถูก"
[ "$(curl -s "localhost:4000/api/branches/manage?search=$BR" -H "$(H $A)" | J "d.rows[0].code===\"$BR\" && d.rows[0].openWorkOrders===$(DB "select count(*) from \"WorkOrder\" where \"branchId\"=$BID and \"isTest\"=false and status not in ('DONE','CANCELLED')")")" = "true" ] \
  && pass "ค้นรหัสเจอ · จำนวนใบงานค้างตรงฐานข้อมูล" || fail "ค้นหา/ใบค้างไม่ตรง"

echo "═══ แก้ภาค ประเภท ทีม (เลือกจากที่มีในระบบ · นำเข้ารอบหน้าไม่ทับ)"
OPT=$(curl -s localhost:4000/api/branches/manage/options -H "$(H $A)")
[ "$(echo "$OPT" | J 'd.regions.includes("ใต้") && d.regions.includes("กลาง-ตะวันตก") && d.teams.includes("กระบี่") && d.teams.includes("กรุงเทพ") && d.ownerships.includes("COCO")')" = "true" ] \
  && pass "ตัวเลือกภาค/ทีม/ประเภทมาจากค่าที่มีในระบบ" || fail "ตัวเลือก: $OPT"
PID=$(DB "insert into \"Branch\"(code,name,region,ownership,zone,\"pmTeam\") values ('$PIN','สาขาทดสอบแก้ทะเบียน','ใต้','COCO','กระบี่','กระบี่') returning id" | head -1)
reg() { DB "select region||'|'||ownership||'|'||zone||'|'||\"pmTeam\" from \"Branch\" where id=$PID"; }
[ "$(CODE -X PUT localhost:4000/api/branches/$PID/registry -H "$(H $A)" -H 'Content-Type: application/json' -d '{"region":"ภาคที่ไม่มีจริง"}')" = "400" ] \
  && [ "$(CODE -X PUT localhost:4000/api/branches/$PID/registry -H "$(H $A)" -H 'Content-Type: application/json' -d '{"zone":"ทีมพิมพ์เอง"}')" = "400" ] \
  && [ "$(reg)" = "ใต้|COCO|กระบี่|กระบี่" ] && pass "ภาค/ทีมที่ไม่มีในระบบ: 400 ฐานข้อมูลไม่เปลี่ยน" || fail "รับค่าที่ไม่มีในระบบ: $(reg)"
[ "$(CODE -X PUT localhost:4000/api/branches/$PID/registry -H "$(H $T)" -H 'Content-Type: application/json' -d '{"region":"กลาง-ตะวันตก"}')" = "403" ] && [ "$(reg)" = "ใต้|COCO|กระบี่|กระบี่" ] \
  && pass "ช่างแก้ไม่ได้: 403" || fail "ช่างแก้ได้"
SEND PUT $A branches/$PID/registry '{"region":"กลาง-ตะวันตก","ownership":"DODO","zone":"กรุงเทพ"}' >/dev/null
[ "$(reg)" = "กลาง-ตะวันตก|DODO|กรุงเทพ|กระบี่" ] && pass "แก้ภาค ประเภท ทีม CM ได้ (ทีม PM ไม่ได้ส่ง = ไม่แตะ)" || fail "แก้: $(reg)"
[ "$(DB "select string_agg(field||':'||coalesce(\"fromValue\",'-')||'>'||value, ',' order by field) from \"BranchPin\" where \"branchId\"=$PID")" = "ownership:COCO>DODO,region:ใต้>กลาง-ตะวันตก" ] \
  && [ "$(DB "select string_agg(field||':'||\"fromTeam\"||'>'||\"toTeam\", ',') from \"BranchTeamMove\" where \"branchId\"=$PID")" = "zone:กระบี่>กรุงเทพ" ] \
  && pass "จำค่าเดิมตามไฟล์ไว้ (ภาค/ประเภท → BranchPin · ทีม → รายการย้ายสาขา)" || fail "ที่จำไว้ไม่ถูก"
[ "$(curl -s "localhost:4000/api/branches/manage?search=$PIN" -H "$(H $A)" | J 'd.rows[0].editedInApp.sort().join(",")')" = "ownership,region,zone" ] && pass "รายการบอกช่องที่แก้ในแอป" || fail "editedInApp ไม่ถูก"
# ไฟล์ทะเบียนที่ยังเขียนค่าเดิม — ต้องไม่ดึงกลับ
X=$(mktemp --suffix=.xlsx)
NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("s");
  ws.addRow(["code","ชื่อสาขา","ผจกภาค","ทีมช่าง","ผู้ดูแล PM"]); ws.addRow([process.argv[1],"สาขาทดสอบแก้ทะเบียน","ใต้","กระบี่","กระบี่"]);
  wb.xlsx.writeFile(process.argv[2]);' "$PIN" "$X"
curl -s -X POST localhost:4000/api/branches/import -H "$(H $A)" -F "file=@$X" -F mode=commit >/dev/null; rm -f "$X"
[ "$(reg)" = "กลาง-ตะวันตก|DODO|กรุงเทพ|กระบี่" ] && pass "นำเข้าไฟล์ทะเบียนที่ยังเขียนค่าเดิม: ค่าที่แก้ในแอปไม่ถูกทับ" || fail "ไฟล์ทับ: $(reg)"
# ไฟล์เครื่องเขียนภาค/ประเภทลงสาขาทุกรอบ — ทดสอบตัวแปลงแถวตรง ๆ (อัปไฟล์เครื่องจริงปิดเคสของสาขาอื่นทั้งระบบ)
R=$(cd "$(dirname "$0")/../backend" && node_modules/.bin/ts-node --transpile-only -e '
  import("./src/utils/branchPins").then(async (m) => {
    const rows = [{ branchCode: process.argv[1], region: "ใต้", ownership: "COCO" }, { branchCode: process.argv[1], region: null, ownership: null }];
    await m.applyBranchPins(rows); console.log(JSON.stringify(rows)); process.exit(0);
  });' "$PIN" 2>&1 | tail -1)
[ "$R" = '[{"branchCode":"'$PIN'","region":"กลาง-ตะวันตก","ownership":"DODO"},{"branchCode":"'$PIN'","region":null,"ownership":null}]' ] \
  && pass "แถวไฟล์เครื่องใช้ภาค/ประเภทที่แก้ในแอป (ช่องว่างในไฟล์ไม่แตะ)" || fail "applyBranchPins: $R"
SEND PUT $A branches/$PID/registry '{"region":"ใต้","zone":"กระบี่"}' >/dev/null
[ "$(reg)" = "ใต้|DODO|กระบี่|กระบี่" ] && [ "$(DB "select count(*) from \"BranchPin\" where \"branchId\"=$PID and field='region'")" = "0" ] \
  && [ "$(DB "select count(*) from \"BranchTeamMove\" where \"branchId\"=$PID")" = "0" ] \
  && pass "แก้กลับเป็นค่าตามไฟล์ = เลิกบังคับ (ไม่ค้างในรายการย้ายสาขา)" || fail "แก้กลับ: $(reg)"

echo "═══ ลิงก์ Google Maps"
[ "$(SEND POST $A branches/resolve-map-link '{"text":"https://www.google.com/maps/place/x/@13.70,100.40,17z/data=!3d13.7563!4d100.5018"}' | J 'd.latitude+","+d.longitude')" = "13.7563,100.5018" ] \
  && pass "ลิงก์ยาว: ใช้ตำแหน่งหมุด (ไม่ใช่กลางจอ)" || fail "อ่านลิงก์ยาวไม่ได้"
[ "$(SEND POST $A branches/resolve-map-link '{"text":"13.75, 100.50"}' | J 'd.latitude+","+d.longitude')" = "13.75,100.5" ] && pass "พิมพ์ตัวเลขตรง ๆ ได้" || fail "อ่านตัวเลขไม่ได้"
[ "$(CODE -X POST localhost:4000/api/branches/resolve-map-link -H "$(H $A)" -H 'Content-Type: application/json' -d '{"text":"http://169.254.169.254/latest"}')" = "400" ] && pass "ลิงก์นอก Google: ไม่ตามไปเปิด" || fail "ตามลิงก์นอก Google"

echo "═══ ช่าง"
for p in "GET branches/manage" "GET branches/$BID/usage" "POST branches/$BID/close" "POST branches/resolve-map-link" "DELETE branches/$BID"; do
  set -- $p
  [ "$(CODE -X $1 localhost:4000/api/$2 -H "$(H $T)" -H 'Content-Type: application/json' -d '{"note":"x","text":"13,100"}')" = "403" ] || fail "ช่าง $p ไม่ใช่ 403"
done
[ -z "$(DB "select \"cancelledAt\" from \"Branch\" where id=$BID")" ] && pass "ช่างจัดการสาขาไม่ได้ (403 ทุกทาง สาขายังเปิด)" || fail "ช่างปิดสาขาได้"

[ -z "$FAILED" ]
