#!/bin/bash
# ทดสอบ: ไฟล์สำรอง (หน้า "สำรองข้อมูล") กู้คืนลงฐานข้อมูลใหม่ได้จริง — scripts/restore-backup.js
#   · migration ที่ใส่ข้อมูลตั้งต้นลงตารางเปล่า ต้องอยู่ใน SEEDED_BY_MIGRATION ไม่งั้นกู้ลงฐานใหม่ไม่ได้เลย
#     (เจอจริง ต.ค. 69: OutsourceTeam ทำให้กู้ไม่ผ่าน — ทั้งระบบทดสอบ local-test/ และวันที่ต้องกู้ของจริง)
#   · จำนวนแถวหลังกู้เท่าต้นฉบับ · ล็อกอินด้วยรหัสผ่านเดิมได้ · กู้ซ้ำลงฐานที่มีข้อมูลแล้วต้องปฏิเสธ
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
cleanup() { PG -d postgres -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
cleanup; DIR=$(mktemp -d)

COUNT_SQL='select concat_ws($$,$$, (select count(*) from "WorkOrder"), (select count(*) from "User"), (select count(*) from "Branch"), (select count(*) from "WorkOrderLog"), (select count(*) from "OutsourceTeam"), (select count(*) from "TeamGroup"))'

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
[ "$SRC" = "$DST" ] && pass "กู้ลงฐานข้อมูลใหม่ครบ (ใบงาน,ผู้ใช้,สาขา,ประวัติ,ทีม outsource,ทีมรวม = $DST)" \
  || fail "กู้ไม่ครบ: ต้นฉบับ $SRC · หลังกู้ $DST · $(echo "$OUT" | tail -2 | tr '\n' ' ' | head -c 200)"

# 3) รหัสผ่านเดิมใช้ได้ (hash มาตามไฟล์)
SRC_HASH=$(PG -d serviceapp -Atc "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
DST_HASH=$(PG -d $TMPDB -Atc "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
[ -n "$SRC_HASH" ] && [ "$SRC_HASH" = "$DST_HASH" ] && pass "รหัสผ่านเดิมตามมา (A001)" || fail "รหัสผ่านไม่ตามมา"

# 4) กู้ซ้ำลงฐานที่มีข้อมูลแล้ว ต้องปฏิเสธ ไม่เขียนทับ
OUT=$(DATABASE_URL="$TMP_URL" node scripts/restore-backup.js "$DIR/backup.json.gz" --yes 2>&1) && fail "กู้ทับฐานที่มีข้อมูลได้" \
  || { echo "$OUT" | grep -q "มีข้อมูลอยู่แล้ว" && [ "$(PG -d $TMPDB -Atc "$COUNT_SQL")" = "$DST" ] \
    && pass "กู้ซ้ำลงฐานที่มีข้อมูลแล้ว ปฏิเสธและไม่แตะข้อมูล" || fail "ข้อความปฏิเสธไม่ตรง: $(echo "$OUT" | tail -1)"; }

[ -z "$FAILED" ]
