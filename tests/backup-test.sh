#!/bin/bash
# ทดสอบ: สำรองข้อมูล — Super Admin เท่านั้น · กดสำรองแล้วได้ไฟล์ Excel + ไฟล์กู้คืนที่ครบ ·
#        ไม่มีเลข Fleet Card / รหัสผ่านใน Excel · รอบ 17:00 ทำวันละครั้ง · เก่ากว่า 30 วันถูกลบทั้งไฟล์และแถว
#
# รอบอัตโนมัติกับการลบของเก่าเรียกฟังก์ชันตรง (ts-node) พร้อมเวลาที่กำหนดเอง — รอให้ถึง 17:00 จริงไม่ได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "localhost:4000/api/$3" -H "$(H $2)"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SP="$(cd "$(dirname "$0")" && pwd)"
BE="$SP/../backend"
WORK=$(mktemp -d)
# เทสต์ใช้ที่เก็บไฟล์จำลองเสมอ (tests/README.md) — ตัวที่ backend รันอยู่ก็ชี้ไปที่เดียวกัน
export STORAGE_ENDPOINT=${STORAGE_ENDPOINT:-http://localhost:9100} STORAGE_REGION=${STORAGE_REGION:-us-east-1}
export STORAGE_ACCESS_KEY_ID=${STORAGE_ACCESS_KEY_ID:-dev} STORAGE_SECRET_ACCESS_KEY=${STORAGE_SECRET_ACCESS_KEY:-devsecret}
export STORAGE_BUCKET=${STORAGE_BUCKET:-service-app}
TS() { (cd "$BE" && node_modules/.bin/ts-node-transpile-only -e "$1"); }
SUF=$RANDOM
START=$(DB "select coalesce(max(id),0) from \"Backup\"")
PLATE="ZBK-$SUF"
CARD="99998888$SUF"
cleanup() {
  # แถวที่เทสต์สร้าง: ตั้งให้เก่าแล้วให้ระบบลบเอง — ลบไฟล์ในที่เก็บไฟล์ด้วย ไม่ใช่แค่แถว
  DB "update \"Backup\" set \"createdAt\"='2000-01-01' where id>$START" >/dev/null
  TS 'require("./src/backup/backup").pruneOld().then(()=>process.exit(0))' >/dev/null 2>&1 || true
  DB "delete from \"Vehicle\" where \"plateNumber\"='$PLATE'; delete from \"User\" where \"employeeCode\"='ZBK$SUF'" >/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZBK$SUF','ซุปเปอร์สำรอง','SUPER_ADMIN','$HASH',false)" >/dev/null
VID=$(DB "insert into \"Vehicle\"(\"plateNumber\") values ('$PLATE') returning id" | head -1)
DB "insert into \"VehicleCard\"(\"vehicleId\",\"fleetCardNo\",\"easyPassNo\") values ($VID,'$CARD','EP$CARD')" >/dev/null
SA=$(login ZBK$SUF); A=$(login A001); S=$(login S001); T=$(login T001)

echo "═══ สิทธิ์"
for who in A S T; do
  tok=${!who}
  c="$(CODE GET $tok backups)$(CODE POST $tok backups)$(CODE GET $tok backups/today)$(CODE GET $tok 'backups/1/link?file=data')"
  [ "$c" = "403403403403" ] && pass "${who}001 ดู/กดสำรอง/โหลดไฟล์ไม่ได้ (403 ทุกทาง)" || fail "${who}001 ได้ $c"
done
[ "$(DB "select count(*) from \"Backup\" where id>$START")" = 0 ] && pass "คนที่ไม่ใช่ Super Admin กดแล้วไม่มีไฟล์ถูกสร้าง (ฐานข้อมูล)" || fail "มีแถวสำรองเกิดขึ้น"
GET $A backups | grep -q "เฉพาะ Super Admin" && pass "ข้อความปฏิเสธเป็นภาษาไทย" || fail "ข้อความ: $(GET $A backups)"

echo
echo "═══ กดสำรองตอนนี้"
R=$(curl -s -X POST localhost:4000/api/backups -H "$(H $SA)")
BID=$(echo "$R" | J 'd.id')
echo "$R" | J 'd.kind==="MANUAL"&&/^OTTERI-backup-\d{4}-\d\d-\d\d-\d{4}$/.test(d.baseName)&&d.excelBytes>0&&d.dataBytes>0?"ok":"bad"' | grep -q ok \
  && pass "สำรองแล้วได้ชื่อไฟล์ตามเวลาไทย + ขนาดทั้งสองไฟล์" || fail "ผล: $(echo "$R" | head -c 300)"
DB "select kind||'|'||\"byName\"||'|'||coalesce(\"dayKey\",'-') from \"Backup\" where id=$BID" | grep -q "^MANUAL|ซุปเปอร์สำรอง|-$" \
  && pass "แถวในฐานข้อมูลบอกว่าใครกด และไม่นับเป็นรอบประจำวัน" || fail "แถว: $(DB "select * from \"Backup\" where id=$BID")"
GET $SA backups | J 'const n=new Date(d.nextRunAt); const bkk=new Date(n.getTime()+7*3600e3); d.keepDays===30&&d.hour===17&&bkk.getUTCHours()===17&&n>Date.now()&&n-Date.now()<=86400e3&&d.rows[0].id==='$BID'?"ok":"bad"' | grep -q ok \
  && pass "รายการ: เก็บ 30 วัน · รอบถัดไป 17:00 ภายใน 24 ชม. · ล่าสุดอยู่บน" || fail "รายการ: $(GET $SA backups | head -c 300)"

EX=$(GET $SA "backups/$BID/link?file=excel")
DA=$(GET $SA "backups/$BID/link?file=data")
echo "$EX" | J 'd.fileName' | grep -q '\.xlsx$' && echo "$DA" | J 'd.fileName' | grep -q '\.json\.gz$' \
  && pass "ลิงก์ดาวน์โหลดตั้งชื่อไฟล์ .xlsx / .json.gz" || fail "ชื่อไฟล์: $EX $DA"
curl -s -o "$WORK/b.xlsx" "$(echo "$EX" | J 'd.url')"
curl -s -o "$WORK/b.gz" "$(echo "$DA" | J 'd.url')"

R=$( (cd "$BE" && node -e '
const ExcelJS=require("exceljs");
(async()=>{const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(process.argv[1]);
const names=wb.worksheets.map(w=>w.name);let text="";
wb.eachSheet(ws=>ws.eachRow(r=>r.eachCell(c=>{text+=String(c.value)+"\n"})));
console.log([names[0], names.length>30, names.includes("ใบงาน"), text.includes("passwordHash"), text.includes(process.argv[2]), text.includes(process.argv[3])].join("|"))})()' "$WORK/b.xlsx" "$CARD" "$HASH") )
[ "$R" = "อ่านก่อน|true|true|false|false|false" ] && pass "Excel: หน้าแรก 'อ่านก่อน' · ทุกตาราง · ไม่มีรหัสผ่าน ไม่มีเลข Fleet Card / Easy Pass" || fail "Excel: $R"

DBWO=$(DB "select count(*) from \"WorkOrder\"")
DBBR=$(DB "select count(*) from \"Branch\"")
R=$(node -e '
const d=JSON.parse(require("zlib").gunzipSync(require("fs").readFileSync(process.argv[1])).toString());
const raw=JSON.stringify(d);
console.log([d.format, d.version, d.migrations.length>10, d.tables.WorkOrder.length, d.tables.Branch.length,
  "VehicleCard" in d.tables, "Backup" in d.tables, raw.includes(process.argv[2]), d.tables.User.every(u=>u.passwordHash)].join("|"))' "$WORK/b.gz" "$CARD")
[ "$R" = "otteri-backup|1|true|$DBWO|$DBBR|false|false|false|true" ] \
  && pass "ไฟล์กู้คืน: ใบงาน $DBWO สาขา $DBBR ครบตามฐานข้อมูล · มีรหัสผ่าน (เข้ารหัส) · ไม่มี Fleet Card" || fail "ไฟล์กู้คืน: $R (ฐานข้อมูล ใบงาน $DBWO สาขา $DBBR)"

echo
echo "═══ รอบอัตโนมัติ 17:00"
R=$(TS '
const b=require("./src/backup/backup");const {prisma}=require("./src/prisma");
(async()=>{
  const before=await b.ensureDailyBackup(new Date("2001-02-03T09:59:00Z"));   // 16:59 เวลาไทย
  const [x,y]=await Promise.all([b.ensureDailyBackup(new Date("2001-02-03T10:05:00Z")),b.ensureDailyBackup(new Date("2001-02-03T12:00:00Z"))]);
  const again=await b.ensureDailyBackup(new Date("2001-02-03T16:00:00Z"));      // 23:00 วันเดียวกัน
  const rows=await prisma.backup.findMany({where:{dayKey:"2001-02-03"}});
  console.log([before===null, rows.length, rows[0]&&rows[0].kind, again===null].join("|"));
  await prisma.$disconnect();
})()' 2>&1 | tail -1)
[ "$R" = "true|1|AUTO|true" ] && pass "ก่อน 17:00 ไม่ทำ · หลัง 17:00 ทำครั้งเดียวต่อวัน แม้ถามพร้อมกันหรือถามซ้ำ" || fail "รอบอัตโนมัติ: $R"
TODAY=$(GET $SA backups/today)
if [ "$(TZ=Asia/Bangkok date +%H)" -ge 17 ]; then
  echo "$TODAY" | J 'd.backup&&d.backup.kind==="AUTO"?"ok":"bad"' | grep -q ok && pass "/today หลัง 17:00 ได้ไฟล์ของวันนี้" || fail "/today: $TODAY"
else
  echo "$TODAY" | J 'd.backup===null?"ok":"bad"' | grep -q ok && pass "/today ก่อน 17:00 ยังไม่มีไฟล์ให้โหลด" || fail "/today: $TODAY"
fi

echo
echo "═══ เก็บ 30 วัน"
DB "update \"Backup\" set \"createdAt\"=now()-interval '31 days' where id=$BID" >/dev/null
DB "update \"Backup\" set \"createdAt\"=now()-interval '29 days' where \"dayKey\"='2001-02-03'" >/dev/null
OLDURL=$(GET $SA "backups/$BID/link?file=data" | J 'd.url')
TS 'require("./src/backup/backup").pruneOld().then(()=>process.exit(0))' >/dev/null 2>&1
[ "$(DB "select count(*) from \"Backup\" where id=$BID")$(DB "select count(*) from \"Backup\" where \"dayKey\"='2001-02-03'")" = "01" ] \
  && pass "เก่ากว่า 30 วันถูกลบ · 29 วันยังอยู่ (ฐานข้อมูล)" || fail "ลบของเก่าไม่ตรง"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$OLDURL")" = 404 ] && pass "ไฟล์ในที่เก็บไฟล์ถูกลบด้วย ไม่ใช่แค่แถว" || fail "ไฟล์เก่ายังอยู่ในที่เก็บไฟล์"
GET $SA "backups/$BID/link" | grep -q "เก่ากว่า 30 วัน" && pass "ขอลิงก์ไฟล์ที่ถูกลบแล้ว บอกเหตุผลเป็นภาษาไทย" || fail "ลิงก์ของที่ลบ: $(GET $SA "backups/$BID/link")"

[ -z "$FAILED" ]
