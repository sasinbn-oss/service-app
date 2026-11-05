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
#   · ประวัติสาขา (BranchLog) + ชื่อที่แก้ในแอป (BranchPin field='name') ตามมาครบ (พ.ย. 69) — ประวัติหาย = ตอบไม่ได้ว่าสาขา
#     เคยชื่ออะไร ใครปิดเพราะอะไร · ชื่อที่จำไว้หาย = นำเข้ารายงานเครื่องรอบถัดไปเขียนชื่อในไฟล์ทับชื่อที่แก้ในแอปเงียบ ๆ
#     ฐานทดสอบปกติไม่มีทั้งสองอย่าง (เทสต์สาขาลบของตัวเองตอนจบ) นับ 0 เทียบ 0 ผ่านได้แม้ตารางไม่ถูกสำรองเลย จึงใส่ชั่วคราว
#     บนสาขาแรก: ประวัติสองแถว (แก้ชื่อมี meta + คนทำ · ปิดสาขาไม่มี meta + คนทำที่บัญชีถูกลบแล้ว — BranchLog ไม่ผูก User
#     โดยตั้งใจ กู้ต้องไม่ล้มหรือทิ้งแถวเพราะหาผู้ใช้ไม่เจอ) กับชื่อที่จำไว้หนึ่งแถว (ค่าเท่าชื่อปัจจุบัน — ไม่ทำให้สาขาดูเหมือนถูกแก้)
#   · ใช้รหัสของสาขาที่ปิดแล้วซ้ำ (พ.ย. 69): originalCode / reusedFromId / reusedAt ของสาขาตามมาครบ — reusedFromId อ้างตาราง Branch เอง
#     (สคริปต์กู้ใส่ว่างก่อนแล้วเติมทีหลัง แบบใบงานรออะไหล่ → ใบเดิม) หลุดแล้วไฟล์สาขายกเลิกรอบหน้าปิดสาขาใหม่ (ตัวกันอ่าน reusedAt)
#     และสาขา "(เดิม)" ไม่รู้ว่ารหัสจริงคืออะไร · ฐานทดสอบปกติไม่มีคู่แบบนี้ จึงใส่คู่ชั่วคราว ZZRT01 / "ZZRT01 (เดิม)" แล้วลบตอนจบ
#   · ไฟล์สำรองที่ทำก่อน 20261217090000_attachment_file_names (ชื่อไฟล์แนบภาษาไทยเคยถูกเก็บเป็นอักษรเพี้ยน) — migrate ฐานใหม่
#     ตอนตารางยังว่างจึงซ่อม 0 แถว สคริปต์กู้ต้องซ่อมซ้ำหลังใส่ข้อมูล ไม่งั้นชื่อที่ซ่อมไปแล้วกลับมาเพี้ยนทั้งการ์ดไฟล์และประวัติ
#     ฐานทดสอบปกติไม่มีชื่อเพี้ยน (แอปอ่านชื่อเป็น UTF-8 แล้ว) จึงใส่ไฟล์แนบ 3 ไฟล์ + ประวัติ 4 บรรทัดชั่วคราวบนใบงานใบแรก
#     (createdAt = 2001-02-03 04:05:06 เป็นตัวหาตอนลบ) ทั้งตัวที่ต้องซ่อมและตัวที่ต้องไม่ถูกแตะ: café.jpg (latin1 จริง) · ชื่อไทยที่ถูกอยู่แล้ว
#     · ประวัติอย่างอื่น (EDITED) ที่บังเอิญมีข้อความหน้าตาเหมือนกัน — ไฟล์สำรองรุ่นปัจจุบันต้องกู้ตามที่เก็บไว้ ไม่ถูกแปลงซ้ำ
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
BRANCH_MARK='restore-test ประวัติชั่วคราว'
NAME_AT='2001-02-03 04:05:06'
# ชื่อเพี้ยนแบบที่ multer เคยเก็บ: ไบต์ UTF-8 ของชื่อจริงอ่านเป็นอักษร latin1 ทีละไบต์
GARBLED="convert_from(convert_to('ใบเสนอราคา WO-01143.pdf', 'UTF8'), 'LATIN1')"
cleanup() {
  PG -d serviceapp -qc "delete from \"PartsPick\" where note='$PICK_MARK'" >/dev/null 2>&1 || true   # รายการในใบลบตาม (cascade)
  PG -d serviceapp -qc "delete from \"User\" where \"employeeCode\" like 'zz.restore.howto.%'" >/dev/null 2>&1 || true
  PG -d serviceapp -qc "delete from \"BranchLog\" where note like '$BRANCH_MARK%'" >/dev/null 2>&1 || true
  PG -d serviceapp -qc "delete from \"BranchPin\" where field='name' and \"fromValue\"='$BRANCH_MARK'" >/dev/null 2>&1 || true
  PG -d serviceapp -qc "delete from \"Branch\" where code like 'ZZRT01%'" >/dev/null 2>&1 || true
  PG -d serviceapp -qc "delete from \"WorkOrderAttachment\" where \"createdAt\"='$NAME_AT'" >/dev/null 2>&1 || true
  PG -d serviceapp -qc "delete from \"WorkOrderLog\" where \"createdAt\"='$NAME_AT'" >/dev/null 2>&1 || true
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

# ประวัติสาขา + ชื่อที่จำไว้ชั่วคราว (เหตุผลอยู่หัวไฟล์) · คนทำที่บัญชีถูกลบ = id ที่ไม่มีใน User แล้ว (ไม่มี FK ให้ขวาง)
# ใส่ไม่สำเร็จ (ยังไม่ migrate branch_rename) ให้ข้อ 3c รายงานเอง
PG -d serviceapp -v ON_ERROR_STOP=1 -q >/dev/null 2>&1 <<SQL || true
WITH b AS (SELECT id, name FROM "Branch" ORDER BY id LIMIT 1), a AS (SELECT id, name FROM "User" WHERE "employeeCode"='A001')
INSERT INTO "BranchLog" ("branchId", action, note, meta, "byUserId", "byName")
SELECT b.id, 'RENAMED', '$BRANCH_MARK ชื่อสาขา: ' || b.name || ' → ' || b.name || ' ใหม่',
       jsonb_build_object('from', b.name, 'to', b.name || ' ใหม่'), a.id, a.name FROM b, a
UNION ALL
SELECT b.id, 'CLOSED', '$BRANCH_MARK ปิดสาขา — ทดสอบกู้คืน', NULL, (SELECT max(id) + 1000 FROM "User"), 'บัญชีที่ถูกลบแล้ว' FROM b;
INSERT INTO "BranchPin" ("branchId", field, "fromValue", value, "pinnedById")
SELECT b.id, 'name', '$BRANCH_MARK', b.name, (SELECT id FROM "User" WHERE "employeeCode"='A001') FROM "Branch" b ORDER BY b.id LIMIT 1;
SQL
SRC_BRANCH_TMP=$(PG -d serviceapp -Atc "select (select count(*) from \"BranchLog\" where note like '$BRANCH_MARK%')||'+'||(select count(*) from \"BranchPin\" where field='name' and \"fromValue\"='$BRANCH_MARK')" 2>/dev/null) || SRC_BRANCH_TMP=""
# ทุกช่องทุกแถวของสองตาราง (NULL เขียนเป็นคำ ไม่งั้น concat_ws ข้ามไปเงียบ ๆ แล้ว NULL กับค่าว่างดูเหมือนกัน) · id ต้องตรงด้วย
BRANCH_SQL='select (select count(*) from "BranchLog")||$$|$$||(select count(*) from "BranchPin")||$$|$$||coalesce((select md5(string_agg(concat_ws($$~$$, id, "branchId", action, note, coalesce(meta::text,$$NULL$$), coalesce("byUserId"::text,$$NULL$$), coalesce("byName",$$NULL$$), to_char("createdAt",$$YYYY-MM-DD HH24:MI:SS.MS$$)), $$,$$ order by id)) from "BranchLog"),$$-$$)||$$|$$||coalesce((select md5(string_agg(concat_ws($$~$$, id, "branchId", field, coalesce("fromValue",$$NULL$$), value, coalesce("pinnedById"::text,$$NULL$$), to_char("createdAt",$$YYYY-MM-DD HH24:MI:SS.MS$$)), $$,$$ order by id)) from "BranchPin"),$$-$$)'
SRC_BRANCH=$(PG -d serviceapp -Atc "$BRANCH_SQL" 2>/dev/null) || SRC_BRANCH=""

# คู่สาขาที่ใช้รหัสซ้ำชั่วคราว (เหตุผลอยู่หัวไฟล์) — สาขาใหม่อ้างสาขาเดิม · ใส่ไม่สำเร็จ (ยังไม่ migrate branch_code_reuse) ให้ข้อ 3d รายงานเอง
PG -d serviceapp -v ON_ERROR_STOP=1 -q >/dev/null 2>&1 <<'SQL' || true
WITH old AS (
  INSERT INTO "Branch" (code, name, "originalCode", "cancelledAt", "cancelledNote")
  VALUES ('ZZRT01 (เดิม)', 'ร้านเดิม ทดสอบกู้คืน', 'ZZRT01', now() - interval '1 day', 'restore-test')
  RETURNING id
)
INSERT INTO "Branch" (code, name, "reusedFromId", "reusedAt") SELECT 'ZZRT01', 'ร้านใหม่ ทดสอบกู้คืน', id, now() FROM old;
SQL
REUSE_SQL='select count(*)||$$|$$||coalesce(md5(string_agg(concat_ws($$~$$, id, code, coalesce("originalCode",$$NULL$$), coalesce("reusedFromId"::text,$$NULL$$), coalesce(to_char("reusedAt",$$YYYY-MM-DD HH24:MI:SS.MS$$),$$NULL$$)), $$,$$ order by id)),$$-$$) from "Branch" where "originalCode" is not null or "reusedFromId" is not null or "reusedAt" is not null'
SRC_REUSE=$(PG -d serviceapp -Atc "$REUSE_SQL" 2>/dev/null) || SRC_REUSE=""

# ชื่อไฟล์แนบเพี้ยนชั่วคราว (เหตุผลอยู่หัวไฟล์) — ใบงานใบแรกของฐาน ไม่แตะตัวใบงาน · ใส่ไม่สำเร็จให้ข้อ 6 รายงานเอง
# ค่าที่อ่านแทนชื่อเพี้ยนด้วยคำว่า "เพี้ยน" ให้เทียบในเชลล์ได้ (อักษรควบคุม U+0080–U+009F ในชื่อเพี้ยนพิมพ์ออกจอไม่ได้)
PG -d serviceapp -v ON_ERROR_STOP=1 -q >/dev/null 2>&1 <<SQL || true
INSERT INTO "WorkOrderAttachment" ("workOrderId", kind, "fileName", "mimeType", "sizeBytes", "createdAt")
SELECT (SELECT id FROM "WorkOrder" ORDER BY id LIMIT 1), 'DOCUMENT', n, 'application/pdf', 1, '$NAME_AT'
FROM (VALUES ($GARBLED), ('café.jpg'), ('ฟอร์มแจ้งซ่อม-แถว3.jpg')) t(n);
INSERT INTO "WorkOrderLog" ("workOrderId", action, status, note, "createdAt")
SELECT (SELECT id FROM "WorkOrder" ORDER BY id LIMIT 1), a, 'NEW', n, '$NAME_AT'
FROM (VALUES ('ATTACHED', 'เอกสาร PDF: ' || $GARBLED), ('ATTACHMENT_REMOVED', 'รูป: ' || $GARBLED),
             ('ATTACHED', 'รูป: café.jpg'), ('EDITED', 'แก้ไข: ' || $GARBLED)) t(a, n);
SQL
NAMES_SQL="select coalesce((select string_agg(replace(\"fileName\", $GARBLED, 'เพี้ยน'), '|' order by id) from \"WorkOrderAttachment\" where \"createdAt\"='$NAME_AT'), '-')
  || ' / ' || coalesce((select string_agg(action || '=' || replace(note, $GARBLED, 'เพี้ยน'), '|' order by id) from \"WorkOrderLog\" where \"createdAt\"='$NAME_AT'), '-')"
NAMES_BEFORE='เพี้ยน|café.jpg|ฟอร์มแจ้งซ่อม-แถว3.jpg / ATTACHED=เอกสาร PDF: เพี้ยน|ATTACHMENT_REMOVED=รูป: เพี้ยน|ATTACHED=รูป: café.jpg|EDITED=แก้ไข: เพี้ยน'
NAMES_AFTER='ใบเสนอราคา WO-01143.pdf|café.jpg|ฟอร์มแจ้งซ่อม-แถว3.jpg / ATTACHED=เอกสาร PDF: ใบเสนอราคา WO-01143.pdf|ATTACHMENT_REMOVED=รูป: ใบเสนอราคา WO-01143.pdf|ATTACHED=รูป: café.jpg|EDITED=แก้ไข: เพี้ยน'
SRC_NAMES=$(PG -d serviceapp -Atc "$NAMES_SQL" 2>/dev/null) || SRC_NAMES=""

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
DST_NAMES=$(PG -d $TMPDB -Atc "$NAMES_SQL" 2>/dev/null) || DST_NAMES=""
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

# 3c) ประวัติสาขา + ชื่อที่แก้ในแอป — ต้นฉบับต้องมีแถวชั่วคราวครบ (2 ประวัติ + 1 ชื่อ) ไม่งั้นเทียบ 0 กับ 0 ไม่ได้ตรวจอะไร
DST_BRANCH=$(PG -d $TMPDB -Atc "$BRANCH_SQL" 2>/dev/null) || DST_BRANCH=""
if [ "$SRC_BRANCH_TMP" != "2+1" ]; then
  fail "ใส่ประวัติสาขา/ชื่อที่จำไว้ชั่วคราวไม่สำเร็จ (ได้ [$SRC_BRANCH_TMP] ต้อง 2+1) — ยังไม่ migrate branch_rename หรือสาขาแรกมีชื่อที่จำไว้อยู่แล้ว"
elif [ -n "$SRC_BRANCH" ] && [ "$SRC_BRANCH" = "$DST_BRANCH" ]; then
  pass "ประวัติสาขา + ชื่อที่แก้ในแอปตามมาครบทุกช่อง (ประวัติ $(echo "$SRC_BRANCH" | cut -d'|' -f1) แถว รวม meta ว่าง/มีค่า และคนทำที่บัญชีถูกลบแล้ว · ชื่อที่จำไว้ $(echo "$SRC_BRANCH" | cut -d'|' -f2) แถว)"
else
  fail "ประวัติสาขา/ชื่อที่จำไว้หลังกู้ไม่ตรง: ต้นฉบับ [$SRC_BRANCH] · หลังกู้ [$DST_BRANCH]"
fi

# 3d) สาขาที่ใช้รหัสซ้ำ — ต้นฉบับต้องมีคู่ชั่วคราวครบ (2 แถว) ไม่งั้นเทียบ 0 กับ 0 ไม่ได้ตรวจอะไร · reusedFromId ต้องชี้ id เดิม
DST_REUSE=$(PG -d $TMPDB -Atc "$REUSE_SQL" 2>/dev/null) || DST_REUSE=""
if [ "$(echo "$SRC_REUSE" | cut -d'|' -f1)" != "2" ]; then
  fail "ใส่คู่สาขาใช้รหัสซ้ำชั่วคราวไม่สำเร็จ (ได้ [$SRC_REUSE] ต้อง 2 แถว) — ยังไม่ migrate branch_code_reuse หรือมี ZZRT01 ค้างอยู่"
elif [ "$SRC_REUSE" = "$DST_REUSE" ] && [ "$(PG -d $TMPDB -Atc "select o.code from \"Branch\" n join \"Branch\" o on o.id = n.\"reusedFromId\" where n.code='ZZRT01'")" = "ZZRT01 (เดิม)" ]; then
  pass "สาขาที่ใช้รหัสซ้ำตามมาครบ: originalCode · reusedAt · reusedFromId (อ้างตาราง Branch เอง) ชี้สาขาเดิมถูกแถว"
else
  fail "สาขาที่ใช้รหัสซ้ำหลังกู้ไม่ตรง: ต้นฉบับ [$SRC_REUSE] · หลังกู้ [$DST_REUSE]"
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

# 6) ไฟล์สำรองที่ทำก่อน 20261217090000_attachment_file_names → ชื่อไฟล์แนบภาษาไทยที่เพี้ยนถูกซ่อมหลังกู้
#    migration นั้นไม่เพิ่มตาราง/ช่อง ไฟล์ "รุ่นก่อน" จึงต่างจากไฟล์เมื่อกี้แค่ไม่มีชื่อ migration ในรายการ
node -e '
  const fs = require("fs"), { gzipSync, gunzipSync } = require("zlib");
  const d = JSON.parse(gunzipSync(fs.readFileSync(process.argv[1])).toString("utf8"));
  d.migrations = d.migrations.filter((m) => m !== "20261217090000_attachment_file_names");
  fs.writeFileSync(process.argv[2], gzipSync(JSON.stringify(d)));' "$DIR/backup.json.gz" "$DIR/old-names.json.gz"
PG -d postgres -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null; PG -d postgres -qc "CREATE DATABASE $TMPDB" >/dev/null
DATABASE_URL="$TMP_URL" DIRECT_URL="$TMP_URL" node_modules/.bin/prisma migrate deploy >/dev/null 2>&1
OUT=$(DATABASE_URL="$TMP_URL" node scripts/restore-backup.js "$DIR/old-names.json.gz" --yes 2>&1) || true
OLD_NAMES=$(PG -d $TMPDB -Atc "$NAMES_SQL" 2>/dev/null) || OLD_NAMES=""
if [ "$SRC_NAMES" != "$NAMES_BEFORE" ]; then
  fail "ใส่ชื่อไฟล์เพี้ยนชั่วคราวไม่สำเร็จ (ได้ [$SRC_NAMES]) — ฐานไม่มีใบงานให้ผูกแถวชั่วคราว (ใช้ใบแรก)"
elif [ "$DST_NAMES" != "$NAMES_BEFORE" ]; then
  fail "ไฟล์สำรองรุ่นปัจจุบันกู้แล้วชื่อไฟล์แนบไม่ตรงกับที่เก็บไว้: [$DST_NAMES]"
elif [ "$OLD_NAMES" = "$NAMES_AFTER" ]; then
  pass "กู้ไฟล์สำรองที่ทำก่อนซ่อมชื่อไฟล์แนบ: ชื่อไทยที่เพี้ยนถูกซ่อมทั้งไฟล์แนบและประวัติแนบ/ลบไฟล์ · café.jpg ชื่อไทยเดิม และประวัติอย่างอื่นไม่ถูกแตะ · ไฟล์รุ่นปัจจุบันกู้ตามที่เก็บไว้"
else
  fail "กู้ไฟล์สำรองรุ่นก่อนแล้วชื่อไฟล์แนบไม่ตรง: ได้ [$OLD_NAMES] · ต้อง [$NAMES_AFTER] · $(echo "$OUT" | tail -2 | tr '\n' ' ' | head -c 200)"
fi

[ -z "$FAILED" ]
