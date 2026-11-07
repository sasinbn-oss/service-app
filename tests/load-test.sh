#!/bin/bash
# เทสต์โหลดทั้งบริษัท — คนที่เพิ่งมาล็อกอินต้องเข้าได้เร็ว ขณะที่คนอื่นเปิดแอปค้างกันเต็มบริษัท
#
# ทำไมมี: 7 พ.ย. 69 ล็อกอินไม่ได้ทั้งระบบสองรอบในวันเดียว (log มีแต่ P2024 — รอสายฐานข้อมูลเกิน 10 วิ) ทั้งที่เทสต์ API ผ่านหมด
# เทสต์ปกติยิงทีละคำขอบนฐานข้อมูลในเครื่อง จึงไม่มีวันเห็นเพดานของสายฐานข้อมูลข้าม region
#
# ทำอะไร (ไม่แตะฐานข้อมูลพัฒนา serviceapp — ใช้สำเนา):
#  1. สำเนา serviceapp → loadtest แล้วเติมผู้ใช้ 145 คน · ใบงาน ~700 · คนเปิดแจ้งเตือน 70 · อะไหล่มีรูป 60 (รูปละ ~50 KB เก็บในฐานข้อมูลแบบของจริง)
#  2. พร็อกซีหน่วง 115 ms ต่อทิศ (tests/lag-proxy.js — ไปกลับ 0.23 วิ เท่าของจริง) หน้าฐานข้อมูลสำเนา
#  3. backend ตัวที่สองที่ :4100 ต่อผ่านพร็อกซี (โค้ดปัจจุบันในเครื่อง)
#  4. tests/load/load-sim.js: ทุกคนทำตามจังหวะของแอป แล้วล็อกอินใหม่ทุก 5 วิ วัดเวลา
#  5. ลบทุกอย่างทิ้ง (ฐานข้อมูลสำเนา · พร็อกซี · backend ตัวที่สอง)
#
# ผ่าน = ล็อกอินไม่พังสักครั้ง · ไม่เกิน 3 วิ ทุกครั้ง · ไม่มี P2024/EMAXCONNSESSION
# ใช้: bash tests/load-test.sh [วินาที=180] [ผู้ใช้=145]   (ราว 5 นาที — ไม่อยู่ใน run-all.sh)
# ต้องรันก่อนเปิด PR ที่: เพิ่มอะไรที่ทุกเครื่องถามเป็นรอบ · แก้หน้าที่ทุกคนเปิด (รายการ กล่องงาน หน้าใบงาน) · แตะ src/prisma.ts หรือ utils/pollGate.ts
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECS=${1:-180}
USERS=${2:-145}
set -a; . "$ROOT/backend/.env"; set +a

# ฐานข้อมูลจริงห้ามโดนเด็ดขาด — สร้าง/ลบฐานข้อมูลได้เฉพาะเครื่องตัวเอง
HOST=$(node -e 'try{console.log(new URL(process.env.DATABASE_URL).hostname)}catch{console.log("")}')
if [ "$HOST" != localhost ] && [ "$HOST" != 127.0.0.1 ]; then
  echo "FAIL DATABASE_URL ใน backend/.env ไม่ได้ชี้ที่เครื่องนี้ ($HOST) — เทสต์นี้สร้าง/ลบฐานข้อมูล ไม่รันกับที่อื่น"
  exit 1
fi
BASE_URL="${DATABASE_URL%%\?*}"
ADMIN_URL="${BASE_URL%/*}/postgres"
LOAD_DB_URL="${BASE_URL%/*}/loadtest"
# URL ของ backend ตัวที่สอง: ฐานข้อมูลสำเนาผ่านพร็อกซีหน่วง (คงพารามิเตอร์เดิมไว้ — connection_limit ฯลฯ คิดจาก src/prisma.ts)
LAG_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.port="5499";u.pathname="/loadtest";console.log(u.toString())')

PIDS=()
TMP=$(mktemp -d)
cleanup() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done
  sleep 2
  psql "$ADMIN_URL" -qAtc "drop database if exists loadtest" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

if curl -s -m 2 -o /dev/null localhost:4100/health; then echo "FAIL มีอะไรรันที่ :4100 อยู่แล้ว"; exit 1; fi

echo "เตรียมฐานข้อมูลสำเนา…"
psql "$ADMIN_URL" -qAtc "drop database if exists loadtest" >/dev/null 2>&1
psql "$ADMIN_URL" -qAtc "create database loadtest" >/dev/null || { echo "FAIL สร้างฐานข้อมูลสำเนาไม่ได้"; exit 1; }
pg_dump "$BASE_URL" | psql -q "$LOAD_DB_URL" >/dev/null 2>&1
psql "$LOAD_DB_URL" -v ON_ERROR_STOP=1 -q -v users="$USERS" <<'SQL' || { echo "FAIL เติมข้อมูลจำลองไม่ได้"; exit 1; }
-- ผู้ใช้ L0001… : ช่าง 83% · หัวหน้าภาค 10% · แอดมินที่เหลือ (รหัสผ่านเดียวกับ T001 = test1234)
INSERT INTO "User" ("employeeCode",name,phone,"passwordHash",role,"createdAt",region,"mustChangePassword",team,"supervisedTeams","extraRegions","extraTeams","howtoSeen","itLead","bellSince","pushSince")
SELECT 'L'||lpad(g::text,4,'0'), 'โหลด '||g, phone, "passwordHash",
  CASE WHEN g <= :users*0.83 THEN 'EMPLOYEE' WHEN g <= :users*0.93 THEN 'SUPERVISOR' ELSE 'ADMIN' END, now(),
  CASE WHEN g > :users*0.83 AND g <= :users*0.93 THEN 'ใต้' END, false,
  CASE WHEN g <= :users*0.83 THEN 'กรุงเทพ' END, '{}', '{}', '{}', "howtoSeen", false, '2020-01-01', now()
FROM "User" u, generate_series(1, :users) g WHERE u."employeeCode"='T001';
-- ใบงาน ×30 จากใบที่มี (ใบงานจริงมีหลายร้อยใบเปิดค้าง)
INSERT INTO "WorkOrder" (code,source,"branchId","machineId",title,detail,priority,status,"assignedToId","scheduledAt","createdById","createdAt","updatedAt","closedAt","closedById","closeResult","closeNote",symptom,"workStatus","jobType","needsParts","assignedTeam","closeOtherWorkers","contactName","contactPhone","appointmentStatus","inspectedAt","inspectionNote","scheduledTime","isTest","partsExpectedAt","closeSubTeam","urgentReleaseFor","holdUntil","holdReason","heldAt")
SELECT code||'-L'||g,source,"branchId","machineId",title,detail,priority,status,"assignedToId","scheduledAt","createdById",now()-(g||' minutes')::interval,now(),"closedAt","closedById","closeResult","closeNote",symptom,"workStatus","jobType","needsParts","assignedTeam","closeOtherWorkers","contactName","contactPhone","appointmentStatus","inspectedAt","inspectionNote","scheduledTime","isTest","partsExpectedAt","closeSubTeam","urgentReleaseFor","holdUntil","holdReason","heldAt"
FROM "WorkOrder" w, generate_series(1,30) g WHERE w."deletedAt" IS NULL AND w."parentId" IS NULL;
INSERT INTO "WorkOrderLog" ("workOrderId","userId",action,status,"createdAt")
SELECT id, "createdById", 'CREATED', status, "createdAt" FROM "WorkOrder" WHERE code LIKE '%-L%';
-- คนเปิดแจ้งเตือนครึ่งหนึ่งของช่าง/หัวหน้าภาค — รอบแจ้งเตือนงานเข้ากล่องถามกระดิ่งของทีละคน
INSERT INTO "PushSubscription" ("userId",endpoint,p256dh,auth,"createdAt")
SELECT id, 'https://127.0.0.1:9/push/'||id, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', now()
FROM "User" WHERE "employeeCode" LIKE 'L%' AND role <> 'ADMIN' AND id % 2 = 0;
-- อะไหล่มีรูป 60 ตัว รูปละ ~50 KB เก็บเป็นไบต์ในฐานข้อมูลแบบของจริง
INSERT INTO "SparePart" ("partCode",name,"updatedAt","imageUrl")
SELECT 'LOAD-'||g, 'อะไหล่จำลอง '||g, now(), NULL FROM generate_series(1,60) g;
UPDATE "SparePart" SET "imageUrl" = '/api/spare-parts/'||id||'/image' WHERE "partCode" LIKE 'LOAD-%';
INSERT INTO "SparePartImage" ("sparePartId","mimeType",data,"updatedAt")
SELECT id, 'image/jpeg', convert_to(repeat(md5(id::text), 1600), 'UTF8'), now() FROM "SparePart" WHERE "partCode" LIKE 'LOAD-%';
SQL
PARTS=$(psql "$LOAD_DB_URL" -Atc "select coalesce(json_agg(json_build_object('id',id,'v',\"updatedAt\")),'[]') from \"SparePart\" where \"partCode\" like 'LOAD-%'")

LISTEN=5499 TARGET=5432 LAG=115 node "$ROOT/tests/lag-proxy.js" > /dev/null 2>&1 &
PIDS+=($!)
(cd "$ROOT/backend" && DATABASE_URL="$LAG_URL" DIRECT_URL="$LAG_URL" PORT=4100 \
  STORAGE_ENDPOINT=http://localhost:9100 STORAGE_REGION=us-east-1 STORAGE_ACCESS_KEY_ID=dev STORAGE_SECRET_ACCESS_KEY=devsecret STORAGE_BUCKET=service-app \
  exec node_modules/.bin/ts-node --transpile-only src/index.ts) > "$TMP/backend.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do curl -s -m 2 -o /dev/null localhost:4100/health && break; sleep 2; done
curl -s -m 2 -o /dev/null localhost:4100/health || { echo "FAIL backend ตัวที่สองไม่ขึ้น"; tail -5 "$TMP/backend.log"; exit 1; }

LOAD_PARTS="$PARTS" node "$ROOT/tests/load/load-sim.js" http://localhost:4100 "$SECS" "$USERS" | tee "$TMP/sim.log"
grep -q "^FAIL" "$TMP/sim.log" && exit 1
exit 0
