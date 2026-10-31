#!/bin/bash
# ใบรออะไหล่ที่แยกออกมา ต้องเสนอราคาเมื่อลูกค้ายังไม่ได้จ่ายค่าของตัวนั้น (เจ้าของงานแจ้ง ต.ค. 69 — WO-00528)
#   · แยกตัวที่หมดจากใบที่เก็บเงินแล้ว ต้องบอกว่าลูกค้าจ่ายค่าตัวที่หมดแล้วหรือยัง (ไม่บอก = 400 ใบไม่ขยับ)
#   · ใบแยกทุกใบรอของที่เช็คอะไหล่ (นัดก่อนเบิก ต.ค. 69) · ของเข้าแล้ว: ยังไม่จ่าย → เสนอราคา ·
#     จ่ายแล้ว → ไปนัดเลย (ไม่เสนอราคาซ้ำ จนกว่าจะระบุอะไหล่ใหม่) · ใบที่ไม่ต้องเสนอราคาไม่ถาม
#   · แยกตอนเช็คอะไหล่ (ก่อนเสนอราคา) ไม่ถาม — ยังไม่มีใครจ่ายอะไร
#   · อะไหล่ไม่ครบตอนปิดงาน (ของใหม่) ใช้กฎเสนอราคาเดียวกับระบุอะไหล่
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
UP() { curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $A)" -F "file=@$SP/$2" -F "role=$3" >/dev/null; }
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
VISIT=$(day 22)

A=$(login A001); S=$(login S001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
IDS=""
cleanup() {
  local list=$(echo $IDS | tr ' ' ',')
  [ -z "$list" ] && list=0
  for id in $(DB "select id from \"WorkOrder\" where \"parentId\" in ($list)") $IDS; do
    curl -s -X DELETE "localhost:4000/api/work-orders/$id" -H "$(H $A)" >/dev/null
  done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT

# สาขาแฟรนไชส์หมดประกัน (ต้องเสนอราคา) · สาขาบริษัท (ไม่ต้อง)
DOLD=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null and \"openedAt\" < now() - interval '4 years' order by \"openedAt\" limit 1")
open() {  # $1=branch → id (ยังไม่ระบุอะไหล่ — ตามด้วย spec)
  DB "update \"User\" set region=(select region from \"Branch\" where code='$1') where \"employeeCode\"='S001'" >/dev/null
  local id=$(POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W71\",\"model\":\"Huebsch\",\"symptom\":\"ทดสอบใบแยก (สร้างโดยเทสต์)\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  S=$(login S001)
  echo $id
}
# อะไหล่ต้องตรงยี่ห้อเครื่องของใบ — สาขา D กับ C0001 เป็นคนละเครื่อง ยี่ห้ออาจต่างกัน จึงหยิบใหม่ทุกใบ
# แยกออกจาก open เพราะ open รันใน $(...) ค่า BOARD/BELT ไม่กลับมาที่เชลล์หลัก
# BOARD/BELT ชี้ตัวของใบที่ spec ล่าสุด — ใบแยก/ใบรออะไหล่ต่อใช้เครื่องเดียวกับใบแม่ จึงใช้ตัวเดียวกันได้
spec() {  # $1=id → หัวหน้าภาคระบุ BOARD + BELT
  BOARD=$(fx_part "$1" BOARD); BELT=$(fx_part "$1" BELT)
  POST $S "work-orders/$1/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":1}]}" >/dev/null
}
L94='"warehouse":"คลังลาดพร้าว 94"'
source_in() {  # $1=id $2.. = อะไหล่ที่ตอบว่ามี (คลัง 94)
  local id=$1; shift
  local r=$(for p in "$@"; do printf '{"sparePartId":%s,"inStock":true,%s},' "$p" "$L94"; done)
  POST $A "work-orders/$id/parts-sourcing" "{\"results\":[${r%,}]}"
}
toIssue() {  # หัวหน้าภาคนัด → ถึงขั้นเบิก (เบิกก่อนคอนเฟิร์มลูกค้า)
  local team=$(curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.suggestedTeam')
  POST $S "work-orders/$1/assign" "{\"team\":\"$team\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
}
paid() {  # เช็คครบ → เสนอราคา → รับเงิน → นัด → ถึงขั้นเบิก
  source_in $1 $BOARD $BELT >/dev/null
  UP $1 quote-sample.pdf QUOTE; POST $A "work-orders/$1/quote" '{}' >/dev/null
  UP $1 site-photo.png RECEIPT; POST $A "work-orders/$1/payment" '{}' >/dev/null
  toIssue $1
}
SPLIT() {  # $1=id $2=ส่วนเพิ่มใน body
  POST $A "work-orders/$1/parts-check" "{\"splitOut\":true$2,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-SQ1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}"
}
CHILD() { DB "select id from \"WorkOrder\" where \"parentId\"=$1 order by id desc limit 1"; }

echo "═══ แยกตัวที่หมดจากใบที่เก็บเงินแล้ว ($DOLD แฟรนไชส์หมดประกัน)"
ID=$(open $DOLD); IDS="$IDS $ID"; spec $ID; paid $ID
[ "$(ST $ID)" = "PARTS_REQUESTED" ] && pass "เตรียมใบ: เสนอราคา + รับเงิน + นัดวันแล้ว ถึงขั้นเบิก" || fail "เตรียมใบไม่ถึงขั้นเบิก: $(ST $ID)"
R=$(SPLIT $ID "")
echo "$R" | grep -q "ลูกค้าจ่ายค่าอะไหล่ที่หมดไปแล้วหรือยัง" && [ "$(ST $ID)" = "PARTS_REQUESTED" ] && [ -z "$(CHILD $ID)" ] \
  && pass "ไม่บอกว่าลูกค้าจ่ายตัวที่หมดหรือยัง แยกไม่ได้ ใบไม่ขยับ ไม่มีใบใหม่" || fail "แยกได้โดยไม่ถาม: $(echo $R | head -c 150)"
SPLIT $ID ',"splitPaid":false' >/dev/null
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(ST $ID)" = "AWAITING_CONFIRM" ] \
  && pass "ยังไม่จ่าย → ใบใหม่รอของที่เช็คอะไหล่ · ใบเดิมไปคอนเฟิร์มลูกค้าด้วยของที่มี" || fail "ใบใหม่ $C: $(ST ${C:-0}) · ใบเดิม $(ST $ID)"
[ "$(DB "select string_agg(sp.\"partCode\"||':'||coalesce(p.\"inStock\"::text,'null'),',') from \"WorkOrderPart\" p join \"SparePart\" sp on sp.id=p.\"sparePartId\" where p.\"workOrderId\"=$C and p.kind='WAITING'")" = "$(fx_part_code $ID BELT):false" ] \
  && pass "ใบใหม่มีแต่ตัวที่หมด และยังขึ้นว่าหมด (ป้ายแดง)" || fail "อะไหล่ใบใหม่ผิด"
[ "$(DB "select status||'|'||(note like '%ลูกค้ายังไม่จ่าย%')::text from \"WorkOrderLog\" where \"workOrderId\"=$C and action='SPLIT_FROM'")" = "PARTS_SOURCING|true" ] \
  && pass "ประวัติใบใหม่บอกขั้นที่เริ่ม (แถบขั้นตอนใช้) และว่าลูกค้ายังไม่จ่าย" || fail "ประวัติ SPLIT_FROM"
# ของเข้าแล้ว → เดินเสนอราคาแบบใบปกติ
R=$(source_in $C $BELT)
[ "$(ST $C)" = "AWAITING_QUOTE" ] && pass "ของเข้าแล้วกดมีอะไหล่ → ใบใหม่ไปเสนอราคา" || fail "หลังเช็คอะไหล่: $(ST $C) $(echo $R | head -c 120)"

echo "═══ ลูกค้าจ่ายค่าตัวที่หมดไปแล้ว"
ID=$(open $DOLD); IDS="$IDS $ID"; spec $ID; paid $ID
SPLIT $ID ',"splitPaid":true' >/dev/null
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(DB "select string_agg(action,',' order by id) from \"WorkOrderLog\" where \"workOrderId\"=$C and action in ('SPLIT_FROM','PREPAID')")" = "SPLIT_FROM,PREPAID" ] \
  && pass "จ่ายแล้ว → ใบใหม่รอของที่เช็คอะไหล่ พร้อมบันทึกว่าจ่ายแล้ว" || fail "ใบใหม่ $C: $(ST ${C:-0})"
source_in $C $BELT >/dev/null
[ "$(ST $C)" = "PARTS_CHECKED" ] && pass "ของเข้าแล้ว → ไปหัวหน้าภาคนัดเลย ไม่เสนอราคาซ้ำ" || fail "ใบที่จ่ายแล้ว: $(ST $C)"
# ระบุอะไหล่ใหม่ = ของชุดใหม่ที่ลูกค้ายังไม่ได้จ่าย → กลับมาเสนอราคา
POST $A "work-orders/$C/rollback" '{"toStage":"NEW","reason":"ทดสอบ — ระบุอะไหล่ใหม่"}' >/dev/null
sleep 1
POST $S "work-orders/$C/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
source_in $C $BELT >/dev/null
[ "$(ST $C)" = "AWAITING_QUOTE" ] && pass "ระบุอะไหล่ใหม่หลังจ่าย → เสนอราคาอีกรอบ" || fail "ระบุใหม่: $(ST $C)"

echo "═══ แยกตอนเช็คอะไหล่ (ก่อนเสนอราคา) — ไม่ถาม ยังไม่มีใครจ่าย"
ID=$(open $DOLD); IDS="$IDS $ID"; spec $ID
R=$(POST $A "work-orders/$ID/parts-sourcing" "{\"splitOut\":true,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,$L94},{\"sparePartId\":$BELT,\"inStock\":false}]}")
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $ID)" = "AWAITING_QUOTE" ] && [ "$(ST $C)" = "PARTS_SOURCING" ] \
  && pass "ใบเดิมไปเสนอราคาเฉพาะตัวที่มี · ตัวที่หมดรอของในใบใหม่" || fail "แยกตอนเช็ค: $(ST $ID) / ${C:-ไม่มีใบใหม่} $(echo $R | head -c 120)"

echo "═══ ใบที่ไม่ต้องเสนอราคา (สาขาบริษัท) — ไม่ถาม"
ID=$(open C0001); IDS="$IDS $ID"; spec $ID
source_in $ID $BOARD $BELT >/dev/null
toIssue $ID
R=$(SPLIT $ID "")
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(ST $ID)" = "AWAITING_CONFIRM" ] && pass "สาขาบริษัท แยกได้โดยไม่ถาม ใบใหม่รอของที่เช็คอะไหล่ (ใบเดิมไปคอนเฟิร์มลูกค้า)" || fail "สาขาบริษัท: $(echo $R | head -c 150)"
source_in $C $BELT >/dev/null
[ "$(ST $C)" = "PARTS_CHECKED" ] && pass "ของเข้าแล้วไปนัดเลย (ไม่ต้องเสนอราคา)" || fail "สาขาบริษัทใบแยก: $(ST $C)"

echo "═══ อะไหล่ไม่ครบตอนปิดงาน (ของใหม่) — ใช้กฎเสนอราคา"
fu() {  # $1=id ใบที่ถึงหน้างานแล้ว → id ใบใหม่
  DB "update \"WorkOrder\" set status='IN_PROGRESS' where id=$1" >/dev/null
  POST $A "work-orders/$1/follow-up" "{\"parts\":[{\"sparePartId\":$BELT,\"quantity\":1}],\"note\":\"ต้องเปลี่ยนสายพานด้วย\"}" >/dev/null
  CHILD $1
}
ID=$(open $DOLD); IDS="$IDS $ID"; spec $ID
C=$(fu $ID)
[ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(source_in $C $BELT | J 'd.status')" = "AWAITING_QUOTE" ] \
  && pass "แฟรนไชส์หมดประกัน: ใบรออะไหล่เริ่มที่เช็คอะไหล่ → เสนอราคา" || fail "follow-up แฟรนไชส์: $(ST $C)"
ID=$(open C0001); IDS="$IDS $ID"; spec $ID
C=$(fu $ID)
[ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(source_in $C $BELT | J 'd.status')" = "PARTS_CHECKED" ] \
  && pass "สาขาบริษัท: ใบรออะไหล่เช็คอะไหล่แล้วไปนัดเลย (ไม่ต้องเสนอราคา)" || fail "follow-up สาขาบริษัท: $(ST $C)"

[ -z "$FAILED" ]
