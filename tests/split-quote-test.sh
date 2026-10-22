#!/bin/bash
# ใบรออะไหล่ที่แยกออกมา ต้องเสนอราคาเมื่อลูกค้ายังไม่ได้จ่ายค่าของตัวนั้น (เจ้าของงานแจ้ง ต.ค. 69 — WO-00528)
#   · แยกตัวที่หมดจากใบที่เก็บเงินแล้ว ต้องบอกว่าลูกค้าจ่ายค่าตัวที่หมดแล้วหรือยัง (ไม่บอก = 400 ใบไม่ขยับ)
#   · ยังไม่จ่าย → ใบใหม่เริ่มที่เช็คอะไหล่ (มี/หมด) · จ่ายแล้ว → เริ่มที่เบิก · ใบที่ไม่ต้องเสนอราคาไม่ถาม
#   · อะไหล่ไม่ครบตอนปิดงาน (ของใหม่) ใช้กฎเสนอราคาเดียวกับระบุอะไหล่
#   · ใบแยกรุ่นก่อน (เริ่มที่เบิกทั้งที่ยังไม่จ่าย) ย้อนกลับไปเช็คอะไหล่ได้
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
UP() { curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $A)" -F "file=@$SP/$2" -F "role=$3" >/dev/null; }
ST() { DB "select status from \"WorkOrder\" where id=$1"; }

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

BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
# สาขาแฟรนไชส์หมดประกัน (ต้องเสนอราคา) · สาขาบริษัท (ไม่ต้อง)
DOLD=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null and \"openedAt\" < now() - interval '4 years' order by \"openedAt\" limit 1")
open() {  # $1=branch → id (หัวหน้าภาคระบุ BOARD + BELT แล้ว)
  DB "update \"User\" set region=(select region from \"Branch\" where code='$1') where \"employeeCode\"='S001'" >/dev/null
  local id=$(POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W71\",\"model\":\"Huebsch\",\"symptom\":\"ทดสอบใบแยก (สร้างโดยเทสต์)\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  S=$(login S001)
  POST $S "work-orders/$id/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":1}]}" >/dev/null
  echo $id
}
paid() {  # เช็คครบ → เสนอราคา → รับเงิน → ถึงขั้นเบิก
  POST $A "work-orders/$1/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true},{\"sparePartId\":$BELT,\"inStock\":true}]}" >/dev/null
  UP $1 quote-sample.pdf QUOTE; POST $A "work-orders/$1/quote" '{}' >/dev/null
  UP $1 site-photo.png RECEIPT; POST $A "work-orders/$1/payment" '{}' >/dev/null
}
SPLIT() {  # $1=id $2=ส่วนเพิ่มใน body
  POST $A "work-orders/$1/parts-check" "{\"splitOut\":true$2,\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-SQ1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}"
}
CHILD() { DB "select id from \"WorkOrder\" where \"parentId\"=$1 order by id desc limit 1"; }

echo "═══ แยกตัวที่หมดจากใบที่เก็บเงินแล้ว ($DOLD แฟรนไชส์หมดประกัน)"
ID=$(open $DOLD); IDS="$IDS $ID"; paid $ID
[ "$(ST $ID)" = "PARTS_REQUESTED" ] && pass "เตรียมใบ: เสนอราคา + รับเงินแล้ว ถึงขั้นเบิก" || fail "เตรียมใบไม่ถึงขั้นเบิก: $(ST $ID)"
R=$(SPLIT $ID "")
echo "$R" | grep -q "ลูกค้าจ่ายค่าอะไหล่ที่หมดไปแล้วหรือยัง" && [ "$(ST $ID)" = "PARTS_REQUESTED" ] && [ -z "$(CHILD $ID)" ] \
  && pass "ไม่บอกว่าลูกค้าจ่ายตัวที่หมดหรือยัง แยกไม่ได้ ใบไม่ขยับ ไม่มีใบใหม่" || fail "แยกได้โดยไม่ถาม: $(echo $R | head -c 150)"
SPLIT $ID ',"splitPaid":false' >/dev/null
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_SOURCING" ] && [ "$(ST $ID)" = "PARTS_CHECKED" ] \
  && pass "ยังไม่จ่าย → ใบใหม่เริ่มที่เช็คอะไหล่ (มี/หมด) · ใบเดิมไปจ่ายงานด้วยของที่มี" || fail "ใบใหม่ $C: $(ST ${C:-0}) · ใบเดิม $(ST $ID)"
[ "$(DB "select string_agg(sp.\"partCode\"||':'||coalesce(p.\"inStock\"::text,'null'),',') from \"WorkOrderPart\" p join \"SparePart\" sp on sp.id=p.\"sparePartId\" where p.\"workOrderId\"=$C and p.kind='WAITING'")" = "SP-BELT:false" ] \
  && pass "ใบใหม่มีแต่ตัวที่หมด และยังขึ้นว่าหมด (ป้ายแดง)" || fail "อะไหล่ใบใหม่ผิด"
[ "$(DB "select status||'|'||(note like '%ลูกค้ายังไม่จ่าย%')::text from \"WorkOrderLog\" where \"workOrderId\"=$C and action='SPLIT_FROM'")" = "PARTS_SOURCING|true" ] \
  && pass "ประวัติใบใหม่บอกขั้นที่เริ่ม (แถบขั้นตอนใช้) และว่าลูกค้ายังไม่จ่าย" || fail "ประวัติ SPLIT_FROM"
# ของเข้าแล้ว → เดินเสนอราคาแบบใบปกติ
R=$(POST $A "work-orders/$C/parts-sourcing" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true}]}")
[ "$(ST $C)" = "AWAITING_QUOTE" ] && pass "ของเข้าแล้วกดมีอะไหล่ → ใบใหม่ไปเสนอราคา" || fail "หลังเช็คอะไหล่: $(ST $C) $(echo $R | head -c 120)"

echo "═══ ลูกค้าจ่ายค่าตัวที่หมดไปแล้ว"
ID=$(open $DOLD); IDS="$IDS $ID"; paid $ID
SPLIT $ID ',"splitPaid":true' >/dev/null
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_REQUESTED" ] && [ "$(DB "select status from \"WorkOrderLog\" where \"workOrderId\"=$C and action='SPLIT_FROM'")" = "PARTS_REQUESTED" ] \
  && pass "จ่ายแล้ว → ใบใหม่เริ่มที่แอดมินเบิก (เหมือนเดิม)" || fail "ใบใหม่ $C: $(ST ${C:-0})"
# ใบแยกรุ่นก่อนที่เริ่มที่เบิกทั้งที่ยังไม่จ่าย — ย้อนกลับไปเช็คอะไหล่ได้ แล้วเดินเสนอราคา
R=$(POST $A "work-orders/$C/rollback" '{"toStage":"PARTS_SOURCING","reason":"ลูกค้ายังไม่จ่ายค่าตัวนี้"}')
[ "$(ST $C)" = "PARTS_SOURCING" ] && pass "ใบแยกที่ขั้นเบิก ย้อนกลับไปเช็คอะไหล่เพื่อเสนอราคาได้" || fail "ย้อนไปเช็คอะไหล่: $(echo $R | head -c 150)"

echo "═══ ใบที่ไม่ต้องเสนอราคา (สาขาบริษัท) — ไม่ถาม แยกไปเบิกเหมือนเดิม"
ID=$(open C0001); IDS="$IDS $ID"
R=$(SPLIT $ID "")
C=$(CHILD $ID)
[ -n "$C" ] && [ "$(ST $C)" = "PARTS_REQUESTED" ] && pass "สาขาบริษัท แยกได้โดยไม่ถาม ใบใหม่เริ่มที่เบิก" || fail "สาขาบริษัท: $(echo $R | head -c 150)"

echo "═══ อะไหล่ไม่ครบตอนปิดงาน (ของใหม่) — ใช้กฎเสนอราคา"
fu() {  # $1=id ใบที่ถึงหน้างานแล้ว → id ใบใหม่
  DB "update \"WorkOrder\" set status='IN_PROGRESS' where id=$1" >/dev/null
  POST $A "work-orders/$1/follow-up" "{\"parts\":[{\"sparePartId\":$BELT,\"quantity\":1}],\"note\":\"ต้องเปลี่ยนสายพานด้วย\"}" >/dev/null
  CHILD $1
}
ID=$(open $DOLD); IDS="$IDS $ID"
C=$(fu $ID)
[ "$(ST $C)" = "PARTS_SOURCING" ] && pass "แฟรนไชส์หมดประกัน: ใบรออะไหล่เริ่มที่เช็คอะไหล่ → เสนอราคา" || fail "follow-up แฟรนไชส์: $(ST $C)"
ID=$(open C0001); IDS="$IDS $ID"
C=$(fu $ID)
[ "$(ST $C)" = "PARTS_REQUESTED" ] && pass "สาขาบริษัท: ใบรออะไหล่เริ่มที่เบิก (ไม่ต้องเสนอราคา)" || fail "follow-up สาขาบริษัท: $(ST $C)"

[ -z "$FAILED" ]
