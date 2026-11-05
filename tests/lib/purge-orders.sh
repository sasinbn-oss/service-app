# ล้างใบงานที่เทสต์สร้างให้หายจริง — ไฟล์นี้ไว้ source จากสคริปต์เทสต์ ไม่ได้รันเดี่ยว ๆ
#
#   SP="$(cd "$(dirname "$0")" && pwd)"
#   . "$SP/lib/purge-orders.sh"
#   purge_orders "$A" $IDS          # $A = โทเคนแอดมิน (A001) · $IDS = id ใบงาน คั่นด้วยช่องว่าง (ว่างได้)
#
# ทำไมต้องมี (ถังขยะใบงาน · เจ้าของงานตัดสิน 4 พ.ย. 69):
#   DELETE /work-orders/:id ไม่ได้ลบแล้ว — ย้ายไปถังขยะ 30 วัน และต้องมีเหตุผล · DELETE เปล่า ๆ แบบที่เทสต์เดิมใช้ล้างข้อมูล
#   ได้ 400 แล้วใบงานของเทสต์ค้างอยู่ในฐานข้อมูลทุกรอบโดยไม่มีอะไรเตือน (cleanup ทิ้งคำตอบ >/dev/null)
#   ลบจริงทันทีต้องเป็น Super Admin (DELETE /:id/permanent) ซึ่งบัญชีทดสอบไม่มี — ตัวนี้จึงเดินทางเดียวกับระบบจริง:
#   1) ย้ายไปถังขยะด้วยเหตุผล "ใบทดสอบ" (ผ่าน API — ทางเดียวกับปุ่มในแอป)
#   2) ตั้ง deletedAt ย้อนไป 31 วัน (SQL — ทางเดียวที่ทำให้ "ครบ 30 วัน" ได้ในเทสต์)
#   3) เปิดหน้าถังขยะ (GET /work-orders/trash) — ลบใบที่ครบกำหนดทีละ 5 ใบ ด้วยขั้นตอนเดียวกับรอบชั่วโมง
#      (แถวก่อน ไฟล์ในที่เก็บไฟล์จำลองทีหลัง) วนจนใบของเทสต์หายหมด
#   ทุกชุดที่ล้างข้อมูลแบบนี้จึงลองทางลบครบ 30 วันไปด้วยทุกรอบ
#
# ข้อตกลง: ไม่ล้มเทสต์และไม่หยุด cleanup ที่เรียก (ทุกคำสั่ง || true — สคริปต์ส่วนใหญ่เปิด set -e คำสั่งที่พังใน trap EXIT
#   จะตัดบรรทัดคืนค่าที่ตามหลัง เช่นคืนภาคของ S001) · เรียกจาก trap EXIT ได้ · ใบที่ยังเหลือหลังวน 20 รอบ → บอกทาง stderr · ไม่แตะใบที่ไม่ได้ส่งมา
#   (ใบอื่นที่ครบ 30 วันในฐานทดสอบอาจถูกลบไปด้วยในข้อ 3 — ซึ่งเป็นสิ่งที่ระบบทำกับมันอยู่แล้ว)
# ฐานข้อมูล: DATABASE_URL จาก environment → backend/.env → localhost/postgres แบบเทสต์ส่วนใหญ่ · ปฏิเสธฐานบนคลาวด์
#   (เขียน deletedAt — กติกาเดียวกับ fixture-parts.sh)

_PO_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_po_psql() {
  local url="${DATABASE_URL:-}"
  if [ -z "$url" ] && [ -f "$_PO_LIB/../../backend/.env" ]; then
    url=$(set -a; . "$_PO_LIB/../../backend/.env" >/dev/null 2>&1; printf '%s' "${DATABASE_URL:-}")
  fi
  if [ -n "$url" ] && printf '%s' "$url" | grep -Eqi 'supabase|amazonaws|render' && [ -z "${ALLOW_REMOTE_FIXTURES:-}" ]; then
    echo "purge_orders: DATABASE_URL ชี้ไปที่ฐานข้อมูลบนคลาวด์ — ไม่แตะ (ถ้าตั้งใจจริงให้ตั้ง ALLOW_REMOTE_FIXTURES=1)" >&2
    return 1
  fi
  if [ -n "$url" ]; then
    psql "${url%%\?*}" -qAt -v ON_ERROR_STOP=1 -c "$1"
  else
    PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAt -v ON_ERROR_STOP=1 -c "$1"
  fi
}

purge_orders() {
  local tok="$1"
  shift
  local ids=() i n list left
  for i in "$@"; do
    case "$i" in '' | *[!0-9]*) ;; *) ids+=("$i") ;; esac
  done
  [ ${#ids[@]} -eq 0 ] && return 0
  for i in "${ids[@]}"; do
    curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "Authorization: Bearer $tok" \
      -H 'Content-Type: application/json' -d '{"reason":"TEST","note":"ล้างข้อมูลเทสต์"}' || true
  done
  list=$(IFS=,; echo "${ids[*]}")
  # เวลา UTC ไม่มีโซนแบบที่ Prisma เขียน — now() เฉย ๆ เลื่อนตามโซนของ session
  _po_psql "update \"WorkOrder\" set \"deletedAt\" = timezone('utc', now()) - interval '31 days'
            where id in ($list) and \"deletedAt\" is not null" >/dev/null || return 0
  for n in $(seq 1 20); do
    [ "$(_po_psql "select count(*) from \"WorkOrder\" where id in ($list)")" = "0" ] && return 0
    curl -s -o /dev/null "localhost:4000/api/work-orders/trash" -H "Authorization: Bearer $tok" || true
  done
  left=$(_po_psql "select string_agg(code, ',') from \"WorkOrder\" where id in ($list)" || true)
  echo "purge_orders: ยังเหลือใบงานของเทสต์ $left" >&2
  return 0
}
