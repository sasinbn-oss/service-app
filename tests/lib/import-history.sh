# ล้างประวัติการนำเข้า (ImportRun) ที่ชุดทดสอบทำให้เกิด — ไฟล์นี้ไว้ source จากสคริปต์เทสต์ ไม่ได้รันเดี่ยว ๆ
#
#   . "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/import-history.sh"
#   ih_mark      # ต้นชุด ก่อนนำเข้าไฟล์ใด ๆ: จำ id ล่าสุดของ ImportRun
#   ih_clean     # ใน cleanup / trap EXIT: ลบรอบที่เกิดหลังจากนั้น (ผลทีละแถวหายตาม — ON DELETE CASCADE)
#
# ทำไมต้องมี (ประวัติการนำเข้า 5 พ.ย. 69): ทุกการนำเข้าที่กดบันทึก (ใบแจ้งซ่อม · สาขา · รถ · รายชื่อ · รายงานเครื่องที่ล้ม)
#   เขียนรอบลงประวัติ — ชุดที่ลบใบงาน/สาขา/ผู้ใช้ของตัวเองทิ้งตอนจบแต่ไม่ลบรอบ ทิ้งประวัติของสิ่งที่ไม่มีแล้วสะสมทุกรอบที่รัน
#   (แบบเดียวกับที่ชุดอะไหล่ล้าง SparePartImport ของตัวเอง)
# ทำไมจำ id ไม่ใช่ชื่อไฟล์: ไฟล์ของเทสต์ส่วนใหญ่เป็น mktemp ชื่อสุ่ม · run-all รันทีละชุด รอบที่เกิดระหว่างชุดจึงเป็นของชุดนั้น
# ข้อตกลงเดียวกับ purge-orders.sh: ไม่ล้มเทสต์ ไม่หยุด cleanup (|| true) · ปฏิเสธฐานข้อมูลบนคลาวด์ (_po_psql)
#   · ไม่ได้ ih_mark (ชุดพังก่อนถึง) = ไม่ลบอะไร

_IH_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
declare -F _po_psql >/dev/null || . "$_IH_LIB/purge-orders.sh"

ih_mark() {
  IH_START=$(_po_psql 'select coalesce(max(id),0) from "ImportRun"' 2>/dev/null || true)
}

ih_clean() {
  case "${IH_START:-}" in '' | *[!0-9]*) return 0 ;; esac
  _po_psql "delete from \"ImportRun\" where id > $IH_START" >/dev/null 2>&1 || true
}
