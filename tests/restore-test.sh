#!/bin/bash
# ทดสอบ: ไฟล์สำรอง (หน้า "สำรองข้อมูล") กู้คืนลงฐานข้อมูลใหม่ได้จริง — scripts/restore-backup.js
#   · migration ที่ใส่ข้อมูลตั้งต้นลงตารางเปล่า ต้องอยู่ใน SEEDED_BY_MIGRATION ไม่งั้นกู้ลงฐานใหม่ไม่ได้เลย
#     (เจอจริง ต.ค. 69: OutsourceTeam ทำให้กู้ไม่ผ่าน — วันที่ต้องกู้ของจริงจะกู้ไม่ได้เลย)
#   · AppSetting (เวลาปิดรับปล่อยงาน) ใส่แถวตั้งต้นโดย migration — นับจำนวนแถวด้วย ถ้าวันหนึ่งชื่อหลุดจาก SEEDED_BY_MIGRATION
#     กู้จะล้มที่นี่ · แถวแรกจากไฟล์ (เวลาเริ่มใช้กฎ) ต้องมาแทนแถวที่ migrate เพิ่งใส่ ไม่งั้นใบที่ล็อกอยู่จะไม่ล็อก
#   · SparePartBrandFile (อะไหล่อยู่ในไฟล์ยี่ห้อไหน) migration ใส่แถวจากช่องยี่ห้อ — กู้ไม่ครบ = ช่างเลือกอะไหล่ไม่ได้ทั้งระบบ
#     PartsPick/PartsPickItem (อะไหล่ที่ช่างเลือกรอคอนเฟิร์ม) นับด้วย — หายไปแล้วใบที่รอคอนเฟิร์มกลายเป็น "ระบุอะไหล่" เงียบ ๆ
#     ฐานทดสอบปกติไม่มีใบเลือกอะไหล่ค้าง (ชุดที่สร้างลบทิ้งตอนจบ) นับ 0 เทียบ 0 จะผ่านแม้ตารางไม่ถูกสำรองเลย
#     จึงใส่ใบชั่วคราวหนึ่งใบ (ตีกลับแล้ว ผู้ส่ง T001 ผู้ตรวจ S001 — อ้างผู้ใช้สองทางกับใบงานหนึ่งทาง) ก่อนสำรอง แล้วลบตอนจบ
#     ใบนี้ยกเลิกแล้ว (voidedAt) — ระหว่างรันชุดนี้ใบงานที่ถูกยืมจึงไม่กลายเป็น "รอแก้รายการอะไหล่" ในแอป
#   · ไฟล์สำรองที่ทำก่อนมีตารางไฟล์ยี่ห้อ (กดสำรองก่อน deploy แล้ว deploy พัง) — migrate ฐานใหม่ตอนอะไหล่ยังว่าง
#     แถวตั้งต้นจากช่องยี่ห้อจึงได้ 0 แถว สคริปต์กู้ต้องรันส่วนนั้นซ้ำหลังใส่อะไหล่ ไม่งั้นอะไหล่ทุกตัว "ไม่อยู่ในไฟล์ไหน"
#     รอบกู้ปกติจับเรื่องนี้ไม่ได้ เพราะไฟล์สำรองรุ่นเดียวกับฐานมีตารางนี้อยู่แล้ว
#   · จำนวนแถวหลังกู้เท่าต้นฉบับ · ล็อกอินด้วยรหัสผ่านเดิมได้ · กู้ซ้ำลงฐานที่มีข้อมูลแล้วต้องปฏิเสธ
#   · สอนการใช้งาน (User.howtoSeen) ตามมาทุกคน: NULL ยังเป็น NULL (= พนักงานเดิม ถ้ากลายเป็นค่าอื่น วิธีใช้เด้งทั้งบริษัท)
#     และค่าที่เป็น JSON ตรงทุกตัวอักษร — ไม่แตะผู้ใช้ในฐานต้นฉบับ (A001/S001/T001 ต้องคง "ดูแล้ว" ไว้ให้เทสต์เบราว์เซอร์)
#     ฐานทดสอบหลัง seed:test มีแต่สามคนนั้น (มีค่าทุกคน) — เทียบแล้วไม่มี NULL ให้ตรวจ จึงใส่ผู้ใช้ชั่วคราวสองคน
#     (ว่าง · มีค่าพร้อมหน้าที่ดูแล้ว) ก่อนสำรอง แล้วลบตอนจบ แบบเดียวกับใบเลือกอะไหล่ชั่วคราว
# สร้างฐานข้อมูลชั่วคราว serviceapp_restore_test ในเครื่อง แล้วลบทิ้งตอนจบ
set -e
cd "$(dirname "$0")/../backend"
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
PG() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres "$@"; }
TMPDB=serviceapp_restore_test
SRC_URL="$DATABASE_URL"
case "$SRC_URL" in *@localhost:5432/*) ;; *) echo "FAIL DATABASE_URL ไม่ใช่ฐานข้อมูลในเครื่อง — ไม่รัน"; exit 1 ;; esac
TMP_URL="${SRC_URL%%/serviceapp*}/$TMPDB"
DIR=$(mktemp -d)
PICK_MARK='restore-test ใบชั่วคราว'
cleanup() {
  PG -d serviceapp -qc "delete from \"PartsPick\" where note='$PICK_MARK'" >/dev/null 2>&1 || true   # รายการในใบลบตาม (cascade)
  PG -d serviceapp -qc "delete from \"User\" where \"employeeCode\" like 'zz.restore.howto.%'" >/dev/null 2>&1 || true
  PG -d postgres -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null 2>&1 || true; rm -rf "$DIR"
}
trap cleanup EXIT
cleanup; DIR=$(mktemp -d)

COUNT_SQL='select concat_ws($$,$$, (select count(*) from "WorkOrder"), (select count(*) from "User"), (select count(*) from "Branch"), (select count(*) from "WorkOrderLog"), (select count(*) from "OutsourceTeam"), (select count(*) from "TeamGroup"), (select count(*) from "AppSetting"), (select count(*) from "PartsPick"), (select count(*) from "PartsPickItem"), (select count(*) from "SparePartBrandFile"))'

# ใบเลือกอะไหล่ชั่วคราว (เหตุผลอยู่หัวไฟล์) — ใบงานใบแรกของฐาน ไม่แตะตัวใบงาน
# ใส่ไม่สำเร็จไม่หยุดตรงนี้ (set -e จะตายเงียบโดยไม่มีบรรทัด FAIL) — ข้อ 2 รายงานเองจาก SRC_PICKS
PG -d serviceapp -v ON_ERROR_STOP=1 -q >/dev/null 2>&1 <<SQL || true
WITH p AS (
  INSERT INTO "PartsPick" ("workOrderId", round, status, "brandFile", note, "createdById", "reviewedById", "reviewedAt", reason,
                           "voidedAt", "voidNote")
  SELECT (SELECT id FROM "WorkOrder" ORDER BY id LIMIT 1), 2, 'RETURNED', 'Oasis', '$PICK_MARK',
         (SELECT id FROM "User" WHERE "employeeCode"='T001'), (SELECT id FROM "User" WHERE "employeeCode"='S001'), now(), 'ทดสอบกู้คืน',
         now(), 'ทดสอบกู้คืน'
  RETURNING id
)
INSERT INTO "PartsPickItem" ("pickId", "sparePartId", quantity, mark)
SELECT p.id, s.id, 2, 'NO' FROM p, "SparePart" s WHERE s."partCode" = 'SP-BOARD';
SQL
SRC_PICKS=$(PG -d serviceapp -Atc "select count(*) from \"PartsPickItem\" i join \"PartsPick\" p on p.id=i.\"pickId\" where p.note='$PICK_MARK'" 2>/dev/null) || SRC_PICKS=0

# ผู้ใช้ชั่วคราวสองคน (เหตุผลอยู่หัวไฟล์) — ไม่มีอะไรอ้างถึง ลบได้ตรง ๆ · ใส่ไม่สำเร็จให้ข้อ 3b รายงานเอง
PG -d serviceapp -v ON_ERROR_STOP=1 -q >/dev/null 2>&1 <<'SQL' || true
INSERT INTO "User" ("employeeCode", name, role, "passwordHash", "howtoSeen") VALUES
  ('zz.restore.howto.old', 'พนักงานเดิม ทดสอบกู้คืน', 'EMPLOYEE', 'x', NULL),
  ('zz.restore.howto.new', 'ดูวิธีใช้แล้ว ทดสอบกู้คืน', 'EMPLOYEE', 'x',
   '{"notice": "2026-11-03T09:00:00.000Z", "tours": {"tech.myday": "2026-11-03T09:05:00.000Z", "tech.close": "2026-11-03T09:10:00.000Z"}}');
SQL

# ลายนิ้วมือของ howtoSeen ทุกคน (NULL | มีค่า | md5 ของรหัสผู้ใช้:md5 ค่า เรียงตามรหัส) — อ่านก่อนสำรอง
# ไม่ใช้ set -e ตายเงียบ: คอลัมน์ยังไม่มี (ยังไม่ migrate) ให้ข้อ 3b รายงานเอง
HOWTO_SQL='select count(*) filter (where "howtoSeen" is null)||$$|$$||count(*) filter (where "howtoSeen" is not null)||$$|$$||md5(string_agg("employeeCode"||$$:$$||coalesce(md5("howtoSeen"::text),$$NULL$$), $$,$$ order by "employeeCode")) from "User"'
SRC_HOWTO=$(PG -d serviceapp -Atc "$HOWTO_SQL" 2>/dev/null) || SRC_HOWTO=""

# 1) ไฟล์สำรองจากฐานข้อมูลที่ใช้เทสต์ — ฟังก์ชันเดียวกับปุ่มสำรองข้อมูล
node_modules/.bin/ts-node --transpile-only -e "
  import { writeBackupFiles } from './src/backup/backup';
  import { prisma } from './src/prisma';
  (async () => {
    const m = (await prisma.\$queryRawUnsafe('SELECT migration_name FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL')) as { migration_name: string }[];
    await writeBackupFiles('$DIR', m.map((r) => r.migration_name));
    await prisma.\$disconnect();
  })();" >/dev/null
[ -s "$DIR/backup.json.gz" ] && pass "สร้างไฟล์สำรองได้" || fail "ไม่มีไฟล์สำรอง"
SRC=$(PG -d serviceapp -Atc "$COUNT_SQL")

# 2) ฐานข้อมูลใหม่ → migrate → กู้
PG -d postgres -qc "CREATE DATABASE $TMPDB" >/dev/null
DATABASE_URL="$TMP_URL" DIRECT_URL="$TMP_URL" node_modules/.bin/prisma migrate deploy >/dev/null 2>&1
OUT=$(DATABASE_URL="$TMP_URL" node scripts/restore-backup.js "$DIR/backup.json.gz" --yes 2>&1) || true
DST=$(PG -d $TMPDB -Atc "$COUNT_SQL")
if [ "${SRC_PICKS:-0}" != 1 ]; then
  fail "ใส่ใบเลือกอะไหล่ชั่วคราวไม่สำเร็จ (ได้ ${SRC_PICKS:-0} รายการ — ต้องมี SP-BOARD จาก seed:test) นับ 0 เทียบ 0 ไม่ได้ตรวจอะไร"
elif [ "$SRC" = "$DST" ]; then
  pass "กู้ลงฐานข้อมูลใหม่ครบ (ใบงาน,ผู้ใช้,สาขา,ประวัติ,ทีม outsource,ทีมรวม,ตั้งค่าระบบ,ใบเลือกอะไหล่,รายการที่ช่างเลือก,อะไหล่ในไฟล์ยี่ห้อ = $DST)"
else
  fail "กู้ไม่ครบ: ต้นฉบับ $SRC · หลังกู้ $DST · $(echo "$OUT" | tail -2 | tr '\n' ' ' | head -c 200)"
fi

# 2b) เวลาเริ่มใช้กฎเวลาปิดรับ (createdAt แถวแรกของ AppSetting) มาจากไฟล์ ไม่ใช่เวลาที่ migrate ฐานใหม่
#     ถ้าเป็นเวลาที่กู้ ใบที่เส้นตายอยู่ระหว่างวันเปิดกฎถึงวันกู้จะกลายเป็น "ก่อนเปิดกฎ" แล้วปลดล็อกเองทั้งหมด
SINCE_SQL='select coalesce(to_char("createdAt",$$YYYY-MM-DD HH24:MI:SS.MS$$),$$-$$) from "AppSetting" where key=$$dispatchCutoff$$ order by id limit 1'
SRC_SINCE=$(PG -d serviceapp -Atc "$SINCE_SQL"); DST_SINCE=$(PG -d $TMPDB -Atc "$SINCE_SQL")
[ -n "$SRC_SINCE" ] && [ "$SRC_SINCE" = "$DST_SINCE" ] && pass "เวลาเริ่มใช้กฎเวลาปิดรับตามมาจากไฟล์ ($DST_SINCE)" \
  || fail "เวลาเริ่มใช้กฎไม่ตรง: ต้นฉบับ $SRC_SINCE · หลังกู้ $DST_SINCE"

# 3) รหัสผ่านเดิมใช้ได้ (hash มาตามไฟล์)
SRC_HASH=$(PG -d serviceapp -Atc "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
DST_HASH=$(PG -d $TMPDB -Atc "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
[ -n "$SRC_HASH" ] && [ "$SRC_HASH" = "$DST_HASH" ] && pass "รหัสผ่านเดิมตามมา (A001)" || fail "รหัสผ่านไม่ตามมา"

# 3b) สอนการใช้งาน — ต้นฉบับต้องมีทั้ง NULL และค่า JSON (ไม่งั้นเทียบแล้วผ่านโดยไม่ได้ตรวจอะไร: seed:test ตั้งค่าให้ A001/S001/T001
#     ส่วนผู้ใช้ที่สร้างด้วย SQL เป็น NULL) · หลังกู้ต้องตรงทุกคน — NULL ไม่ถูกเติมค่าตั้งต้น และ JSON ไม่เพี้ยน
DST_HOWTO=$(PG -d $TMPDB -Atc "$HOWTO_SQL" 2>/dev/null) || DST_HOWTO=""
SRC_NULLS=$(echo "$SRC_HOWTO" | cut -d'|' -f1); SRC_SET=$(echo "$SRC_HOWTO" | cut -d'|' -f2)
if [ -z "$SRC_HOWTO" ] || [ "${SRC_NULLS:-0}" -lt 1 ] || [ "${SRC_SET:-0}" -lt 1 ]; then
  fail "ต้นฉบับต้องมีผู้ใช้ที่ howtoSeen ว่างและมีค่าอย่างละคนขึ้นไป (ได้ [$SRC_HOWTO]) — ใส่ผู้ใช้ชั่วคราวไม่สำเร็จ หรือยังไม่ migrate user_howto_seen"
elif [ "$SRC_HOWTO" = "$DST_HOWTO" ]; then
  pass "สอนการใช้งานตามมาครบ: ว่าง $SRC_NULLS คนยังว่าง (พนักงานเดิม) · มีค่า $SRC_SET คนตรงทุกตัวอักษร"
else
  fail "howtoSeen หลังกู้ไม่ตรง: ต้นฉบับ [$SRC_HOWTO] · หลังกู้ [$DST_HOWTO]"
fi

# 4) กู้ซ้ำลงฐานที่มีข้อมูลแล้ว ต้องปฏิเสธ ไม่เขียนทับ
OUT=$(DATABASE_URL="$TMP_URL" node scripts/restore-backup.js "$DIR/backup.json.gz" --yes 2>&1) && fail "กู้ทับฐานที่มีข้อมูลได้" \
  || { echo "$OUT" | grep -q "มีข้อมูลอยู่แล้ว" && [ "$(PG -d $TMPDB -Atc "$COUNT_SQL")" = "$DST" ] \
    && pass "กู้ซ้ำลงฐานที่มีข้อมูลแล้ว ปฏิเสธและไม่แตะข้อมูล" || fail "ข้อความปฏิเสธไม่ตรง: $(echo "$OUT" | tail -1)"; }

# 5) ไฟล์สำรองที่ทำก่อน 20261211090000_parts_pick → อะไหล่กลับมาอยู่ในไฟล์ยี่ห้อตามช่องยี่ห้อ
#    ทำไฟล์ "รุ่นก่อน" จากไฟล์เมื่อกี้: ไม่มีตาราง/ช่องที่ migration นั้นเพิ่ม และไม่มีชื่อ migration ในรายการ
#    เทียบตัวแฝดทดสอบ (seed:test ให้อยู่ไฟล์ของตัวเองไฟล์เดียว และช่องยี่ห้อตรงกับไฟล์) กับต้นฉบับ
node -e '
  const fs = require("fs"), { gzipSync, gunzipSync } = require("zlib");
  const d = JSON.parse(gunzipSync(fs.readFileSync(process.argv[1])).toString("utf8"));
  for (const t of ["PartsPick", "PartsPickItem", "SparePartBrandFile"]) delete d.tables[t];
  for (const r of d.tables.SparePartImport || []) delete r.brandFile;
  d.migrations = d.migrations.filter((m) => m !== "20261211090000_parts_pick");
  fs.writeFileSync(process.argv[2], gzipSync(JSON.stringify(d)));' "$DIR/backup.json.gz" "$DIR/old.json.gz"
TWIN_SQL='select coalesce(string_agg(p."partCode"||$$=$$||b.file, $$ $$ order by p."partCode", b.file), $$$$) from "SparePart" p join "SparePartBrandFile" b on b."sparePartId"=p.id where p."partCode" ~ $r$^SP-(BOARD|BELT)(-(HB|HA|MT|SZ|OT))?$$r$'
PG -d postgres -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null; PG -d postgres -qc "CREATE DATABASE $TMPDB" >/dev/null
DATABASE_URL="$TMP_URL" DIRECT_URL="$TMP_URL" node_modules/.bin/prisma migrate deploy >/dev/null 2>&1
OUT=$(DATABASE_URL="$TMP_URL" node scripts/restore-backup.js "$DIR/old.json.gz" --yes 2>&1) || true
SRC_TWINS=$(PG -d serviceapp -Atc "$TWIN_SQL"); OLD_TWINS=$(PG -d $TMPDB -Atc "$TWIN_SQL")
[ "$(echo "$SRC_TWINS" | wc -w)" = 12 ] && [ "$SRC_TWINS" = "$OLD_TWINS" ] \
  && pass "กู้ไฟล์สำรองที่ทำก่อนมีตารางไฟล์ยี่ห้อ อะไหล่กลับมาอยู่ในไฟล์ตามช่องยี่ห้อ (ตัวแฝดทดสอบ 12 ตัวตรงไฟล์ของตัวเอง)" \
  || fail "กู้ไฟล์สำรองรุ่นก่อนแล้วไฟล์ยี่ห้อไม่ตรง: ต้นฉบับ [$SRC_TWINS] · หลังกู้ [$OLD_TWINS] · $(echo "$OUT" | tail -2 | tr '\n' ' ' | head -c 200)"

[ -z "$FAILED" ]
