# อะไหล่ทดสอบที่ตรงยี่ห้อเครื่องของใบงาน — ไฟล์นี้ไว้ source จากสคริปต์เทสต์ ไม่ได้รันเดี่ยว ๆ
#
#   SP="$(cd "$(dirname "$0")" && pwd)"
#   . "$SP/lib/fixture-parts.sh"
#   PID=$(fx_part "$ID" BOARD)        # id ของ SP-BOARD หรือตัวแฝดที่ตรงยี่ห้อเครื่องของใบ $ID
#   CODE=$(fx_part_code "$ID" BOARD)  # รหัสของตัวเดียวกัน — ไว้เทียบข้อความที่พิมพ์รหัสอะไหล่
#
# ทำไมต้องมี: กฎ "เลือกอะไหล่ได้เฉพาะไฟล์ยี่ห้อเดียวกับเครื่อง" ปฏิเสธอะไหล่ไม่มียี่ห้อและอะไหล่ต่างยี่ห้อจากทุกเส้นทาง
# เทสต์ที่ส่ง SP-BOARD ตัวเดียวให้ทุกเครื่อง (Oasis Huebsch Haier ไม่รู้ยี่ห้อ ปนกันในฐานทดสอบ) จะพังทั้งที่แอปไม่ได้ผิด
# ตัวแฝดแยกยี่ห้ออยู่ใน seed:test (backend/scripts/seed-test-fixtures.ts) — ต้องรัน seed:test ก่อน
#
# ข้อตกลง
#   $1 = id ใบงาน (ตัวเลข) · $2 = BOARD หรือ BELT
#   พิมพ์ทาง stdout บรรทัดเดียว: id ของ SparePart (fx_part) หรือรหัสอะไหล่ (fx_part_code)
#   ผิดพลาด (ไม่มีใบนี้ · ยังไม่ได้รัน seed:test · ส่งค่าผิด · ต่อฐานข้อมูลไม่ได้ · DATABASE_URL บนคลาวด์) → บรรทัด "FAIL fx_part: เหตุผล"
#   ทาง stderr, stdout ว่าง, return 1 — คนเรียกที่ใช้ set -e หยุดตรงนั้น ไม่ส่งอะไหล่ว่างไปแล้วพังไกลจากต้นเหตุ
#   ขึ้นต้นด้วย FAIL เพราะ run-all.sh นับบรรทัด ^FAIL จาก stdout+stderr ของแต่ละชุด — ชุดที่ตายกลางทางเพราะ set -e
#   ไม่พิมพ์ FAIL เอง ยอดรวมแค่ลดลงเงียบ ๆ ถ้า helper ไม่บอก
#   ผลข้างเคียงอย่างเดียว: เครื่องของใบที่ยังไม่รู้ยี่ห้อเลย (brand และ model ว่างทั้งคู่) ถูกตั้ง model='Haier' ถาวร
#     เพราะกฎใหม่บังคับให้เครื่องมียี่ห้อก่อนเลือกอะไหล่ — ตั้งให้เฉพาะตอนว่างทั้งคู่ ยี่ห้อที่มีอยู่ไม่ถูกแตะ
#     ทำไม Haier ไม่ใช่ Oasis: เครื่องไม่รู้ยี่ห้อกับ Haier ได้ผลเหมือนกันทุกกฎที่ดูยี่ห้ออยู่ตอนนี้ —
#     ประกัน 3 ปีตามค่าตั้งต้น (warrantyYearsFor · Oasis = 2 ปี) และป้ายรุ่นแบบ OTHER (plateTemplateFor · Oasis = OASIS)
#     ถ้าเป็น Oasis การเสนอราคา ป้ายประกัน และกฎเคลมของเครื่องทดสอบจะเปลี่ยนไปทั้งที่ไม่มีใครแก้กฎ
#   ใบที่ไม่มีเครื่อง → SP-BOARD / SP-BELT (กฎใหม่ไม่ล็อกใบที่ไม่มีเครื่อง)
#   ใช้กับฐานข้อมูลทดสอบเท่านั้นเหมือนเทสต์อื่นทั้งหมด (tests/README.md) — ห้ามชี้ไปที่ของจริง
#     กันไว้สองชั้นก่อนเขียนอะไร: DATABASE_URL บนคลาวด์ถูกปฏิเสธแบบเดียวกับ seed:test (ALLOW_REMOTE_FIXTURES=1 = ตั้งใจจริง)
#     และต้องมีอะไหล่ทดสอบครบห้าไฟล์ก่อนตั้ง model — ฐานที่ไม่เคยรัน seed:test จึงไม่ถูกแตะเลย
#
# จับคู่ยี่ห้อ (ต้องตรงกับ brandFileOf ใน backend/src/utils/brandFile.ts ทุกบรรทัด — ไฟล์นั้นมาพร้อมกฎล็อกยี่ห้อ
# เขียนตามตรงนี้ · แก้ที่หนึ่งต้องแก้อีกที่ ไม่งั้นเทสต์ส่งอะไหล่ที่แอปบอกว่าคนละไฟล์):
#   ยี่ห้อเครื่อง = brand ก่อน ว่างแล้วใช้ model (= machineMake() — ลำดับเดียวกับประกัน)
#   จับแบบ "มีคำนี้อยู่" ไม่สนตัวพิมพ์ ตามลำดับ: huebsch → Huebsch · oasis → Oasis · haier → Haier · maytag → Maytag
#   มีข้อความแต่ไม่ตรงคำไหน → Other · ไม่มีข้อความ → ไม่รู้ยี่ห้อ
#   "HB - Huebsch" → Huebsch เพราะมีคำว่า huebsch (ตัวย่อ "HB" เดี่ยว ๆ ยังเป็น Other จนกว่าจะเห็นไฟล์จริง — แผน G1)
#   ไฟล์ → ตัวแฝด: Oasis = SP-BOARD · Huebsch = -HB · Haier = -HA · Maytag = -MT · Other = -OT

_FX_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_fx_fail() {
  echo "FAIL fx_part: $*" >&2
  return 1
}

# DATABASE_URL จาก environment ก่อน (คนรันทำ set -a && . backend/.env ตาม tests/README.md — run-all.sh ไม่โหลดให้) ไม่มีค่อยอ่าน
# backend/.env เอง — บางชุด (claim-test.sh) ต่อฐานแบบ -h localhost -U postgres ไม่ได้โหลด .env ถ้าบังคับ DATABASE_URL ชุดนั้นจะพังเพราะ helper
_fx_psql() {
  local url="${DATABASE_URL:-}"
  if [ -z "$url" ] && [ -f "$_FX_LIB/../../backend/.env" ]; then
    url=$(set -a; . "$_FX_LIB/../../backend/.env" >/dev/null 2>&1; printf '%s' "${DATABASE_URL:-}")
  fi
  if [ -z "$url" ]; then
    _fx_fail "ไม่มี DATABASE_URL — รัน set -a && . backend/.env && set +a ก่อน"
    return 1
  fi
  # กันเขียนใส่ฐานข้อมูลจริง เงื่อนไขเดียวกับ seed-test-fixtures.ts — helper นี้แก้ model ของเครื่อง ไม่ได้อ่านอย่างเดียว
  # หลุดมาได้จริง: export DATABASE_URL ของ Supabase ค้างไว้ตอน prisma migrate deploy (README หัวข้อ deploy) แล้วรันเทสต์ต่อ
  # ในหน้าต่างเดิม — ค่าใน environment มาก่อน backend/.env ส่วนเทสต์อื่นยิง localhost:4000 ที่ใช้ฐานในเครื่อง จึงไม่มีอะไรเตือน
  # เช็คด้วย grep ไม่ใช่ ${url,,} เพราะ bash 3.2 ที่มากับ macOS ไม่รู้จัก
  if printf '%s' "$url" | grep -Eqi 'supabase|amazonaws|render' && [ -z "${ALLOW_REMOTE_FIXTURES:-}" ]; then
    _fx_fail "DATABASE_URL ชี้ไปที่ฐานข้อมูลบนคลาวด์ — helper นี้แก้ข้อมูลเครื่อง ใช้กับฐานทดสอบเท่านั้น (ถ้าตั้งใจจริงให้ตั้ง ALLOW_REMOTE_FIXTURES=1)"
    return 1
  fi
  # ?connection_limit=… เป็นของ Prisma psql ไม่รู้จัก · -q กันข้อความ "UPDATE 1" ปนผลลัพธ์
  psql "${url%%\?*}" -qAt -v ON_ERROR_STOP=1 "$@"
}

# พิมพ์ "id|รหัสอะไหล่|ไฟล์" — fx_part / fx_part_code หยิบช่องที่ต้องการ ให้ทั้งสองตัวผ่าน CASE ชุดเดียวกัน
_fx_pick() {
  local wo="$1" kind="$2" row
  case "$kind" in
    BOARD | BELT) ;;
    *) _fx_fail "ชนิดอะไหล่ต้องเป็น BOARD หรือ BELT (ได้ '$kind')"; return 1 ;;
  esac
  case "$wo" in
    '' | *[!0-9]*) _fx_fail "id ใบงานต้องเป็นตัวเลข (ได้ '$wo')"; return 1 ;;
  esac
  # ค่าทั้งสองผ่านการตรวจข้างบนแล้ว (ตัวเลข / BOARD|BELT) จึงแทรกลง SQL ตรง ๆ ได้
  # ตรวจก่อนเขียน: อะไหล่ชุดนี้ต้องมีครบทั้งห้าไฟล์ (= ฐานนี้ผ่าน seed:test แล้ว) ก่อนแตะ Machine
  # ถ้ารวมไว้คำสั่งเดียวกับ UPDATE ข้างล่าง UPDATE จะ commit ไปก่อนที่ SELECT จะรู้ว่าอะไหล่ไม่มี — บนฐานที่ไม่ใช่ฐานทดสอบ
  # "ไม่มีอะไหล่" คือสัญญาณเดียวว่าต่อผิดฐาน มันต้องมาก่อนการเขียน ไม่ใช่หลัง
  local missing
  missing=$(_fx_psql <<SQL
SELECT coalesce(string_agg(n.code, ' ' ORDER BY n.code), '')
FROM unnest(ARRAY['SP-$kind', 'SP-$kind-HB', 'SP-$kind-HA', 'SP-$kind-MT', 'SP-$kind-OT']) AS n(code)
WHERE NOT EXISTS (SELECT 1 FROM "SparePart" p WHERE p."partCode" = n.code AND NOT p."offCatalog");
SQL
) || { _fx_fail "อ่านฐานข้อมูลไม่สำเร็จ (ใบ $wo)"; return 1; }
  if [ -n "$missing" ]; then
    _fx_fail "ไม่มีอะไหล่ $missing ในฐานข้อมูล — รัน cd backend && npm run seed:test ก่อน"
    return 1
  fi
  row=$(_fx_psql <<SQL
UPDATE "Machine" m SET model = 'Haier', "updatedAt" = now()
FROM "WorkOrder" w
WHERE w.id = $wo AND m.id = w."machineId"
  AND coalesce(btrim(m.brand), '') = '' AND coalesce(btrim(m.model), '') = '';

WITH o AS (
  SELECT w.id,
         coalesce(nullif(btrim(m.brand), ''), nullif(btrim(m.model), '')) AS make  -- = machineMake()
  FROM "WorkOrder" w LEFT JOIN "Machine" m ON m.id = w."machineId"
  WHERE w.id = $wo
), f AS (
  SELECT o.id, CASE                                                            -- = brandFileOf(make)
      WHEN o.make IS NULL THEN NULL
      WHEN o.make ILIKE '%huebsch%' THEN 'Huebsch'
      WHEN o.make ILIKE '%oasis%' THEN 'Oasis'
      WHEN o.make ILIKE '%haier%' THEN 'Haier'
      WHEN o.make ILIKE '%maytag%' THEN 'Maytag'
      ELSE 'Other'
    END AS file
  FROM o
), c AS (
  SELECT f.file, 'SP-$kind' || CASE f.file
      WHEN 'Huebsch' THEN '-HB'
      WHEN 'Haier' THEN '-HA'
      WHEN 'Maytag' THEN '-MT'
      WHEN 'Other' THEN '-OT'
      ELSE ''                                                                  -- Oasis และใบที่ไม่มีเครื่อง
    END AS code
  FROM f
)
SELECT coalesce(p.id::text, '') || '|' || c.code || '|' || coalesce(c.file, '-')
FROM c LEFT JOIN "SparePart" p ON p."partCode" = c.code AND NOT p."offCatalog";
SQL
) || { _fx_fail "อ่านฐานข้อมูลไม่สำเร็จ (ใบ $wo)"; return 1; }
  if [ -z "$row" ]; then
    _fx_fail "ไม่พบใบงาน id $wo"
    return 1
  fi
  if [ -z "${row%%|*}" ]; then
    # ไม่ควรเกิดหลังตรวจข้างบน (อะไหล่ถูกลบระหว่างสองคำสั่ง) — เก็บไว้เพื่อไม่คืน id ว่าง
    local code="${row#*|}"
    _fx_fail "ไม่มีอะไหล่ ${code%%|*} ในฐานข้อมูล — รัน cd backend && npm run seed:test ก่อน"
    return 1
  fi
  printf '%s\n' "$row"
}

fx_part() {
  local row
  row=$(_fx_pick "$@") || return 1
  printf '%s\n' "${row%%|*}"
}

fx_part_code() {
  local row
  row=$(_fx_pick "$@") || return 1
  row="${row#*|}"
  printf '%s\n' "${row%%|*}"
}
