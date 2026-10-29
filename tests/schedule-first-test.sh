#!/bin/bash
# ทดสอบ: เปลี่ยนสายงานเป็น "นัดลูกค้าก่อน แล้วค่อยเบิกอะไหล่" (เจ้าของงานกำหนด ต.ค. 69) — ส่วนที่ชุดอื่นไม่ครอบ
#   · migration 20261130090000_schedule_first ย้ายใบที่เปิดไปแล้ว: ยังไม่เบิกสักตัว → เช็คอะไหล่ (ผลเช็คเดิมอยู่ครบ) ·
#     ใบรออะไหล่รุ่นเก่า → เช็คอะไหล่ที่แอดมิน · เบิกไปแล้ว/ขั้นอื่นไม่แตะ · ทุกใบที่ย้ายมีประวัติ
#     (รันไฟล์ SQL จริงในทรานแซกชันแล้ว ROLLBACK — ใบอื่นในฐานข้อมูลไม่โดน)
#   · ใบที่เบิกไปแล้วก่อนเปลี่ยนสายงาน เดินต่อโดยไม่เบิกซ้ำ: เบิกครบแล้วไปนัด · คอนเฟิร์มแล้วไปปล่อยงานเลย
#   · หัวหน้าภาคไม่ว่างวันที่ลูกค้าขอ → แอดมินคอนเฟิร์มใหม่ → ปล่อยงาน (ไม่วนกลับไปเบิก)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
D1=$(day 14); D2=$(day 16)  # วันนัดแรก · วันที่ลูกค้าขอเลื่อนไป (ต้องต่างจากวันแรก ถึงจะนับเป็นการเปลี่ยนวัน)
MIG="$(cd "$(dirname "$0")/.." && pwd)/backend/prisma/migrations/20261130090000_schedule_first/migration.sql"

A=$(login A001)
BR=C0006
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
newwo() {  # $1 เครื่อง → ใบที่ระบุบอร์ด 1 + สายพาน 2 แล้ว (อยู่ขั้นเช็คอะไหล่)
  local I=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"ทดสอบเปลี่ยนสายงาน\"}]}" | J 'd.orders[0].id')
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
  echo $I
}
part() { DB "update \"WorkOrderPart\" set $3 where \"workOrderId\"=$1 and \"sparePartId\"=$2"; }

echo "═══ จำลองใบที่เปิดไว้ก่อนเปลี่ยนสายงาน"
# A: ค้างขั้นเบิก ยังไม่เช็คสักตัว · B: ค้างขั้นเบิก เช็คแล้วสายพานหมด (มีวันคาดเข้า)
# C: ค้างขั้นเบิก บอร์ดเบิกไปแล้ว · D: ใบรออะไหล่รุ่นเก่า (หัวหน้าภาค) · E: เบิกครบ รอจ่ายงาน
# F: รอหัวหน้าภาคเบิกคลังอื่น (ยังไม่ได้นัด)
WA=$(newwo W81); WB=$(newwo W82); WC=$(newwo W83); WD=$(newwo W84); WE=$(newwo W85); WF=$(newwo W86)
IDS="$WA $WB $WC $WD $WE $WF"
DB "update \"WorkOrder\" set status='PARTS_REQUESTED', \"workStatus\"='CHECKING_PARTS' where id in ($WA,$WB,$WC)" >/dev/null
part $WB $BOARD "\"inStock\"=true, warehouse='คลังลาดพร้าว 94'" >/dev/null
part $WB $BELT "\"inStock\"=false" >/dev/null
DB "update \"WorkOrder\" set \"partsExpectedAt\"='2026-11-20', \"workStatus\"='WAITING_PARTS' where id=$WB" >/dev/null
part $WC $BOARD "\"inStock\"=true, warehouse='คลังลาดพร้าว 94', \"requisitionNo\"='RQ-OLD-C'" >/dev/null
DB "update \"WorkOrder\" set status='WAITING_PARTS', \"workStatus\"='WAITING_PARTS' where id=$WD" >/dev/null
DB "update \"WorkOrderPart\" set \"inStock\"=true, warehouse='คลังลาดพร้าว 94', \"requisitionNo\"='RQ-OLD-E' where \"workOrderId\"=$WE" >/dev/null
DB "update \"WorkOrder\" set status='PARTS_CHECKED', \"workStatus\"='WAITING_TECH' where id=$WE" >/dev/null
DB "update \"WorkOrderPart\" set \"inStock\"=true, warehouse='คลังภูเก็ต', \"transferredAt\"=now() where \"workOrderId\"=$WF" >/dev/null
DB "update \"WorkOrder\" set status='PARTS_PICKUP', \"workStatus\"='WAITING_PARTS' where id=$WF" >/dev/null

echo
echo "═══ migration ย้ายใบ (รันไฟล์จริงแล้ว ROLLBACK)"
GOT=$(PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\i $MIG
SELECT w.id||'|'||w.status||'|'||coalesce(w."workStatus",'-')||'|'||coalesce(w."partsExpectedAt"::date::text,'-')||'|'||
  (SELECT count(*) FROM "WorkOrderLog" l WHERE l."workOrderId"=w.id AND l.action='FLOW_MIGRATED')
FROM "WorkOrder" w WHERE w.id IN ($WA,$WB,$WC,$WD,$WE,$WF) ORDER BY w.id;
SELECT 'parts|'||string_agg(s."partCode"||':'||coalesce(p."inStock"::text,'-')||':'||coalesce(p.warehouse,'-'),',' ORDER BY s."partCode")
FROM "WorkOrderPart" p JOIN "SparePart" s ON s.id=p."sparePartId" WHERE p."workOrderId"=$WB;
ROLLBACK;
SQL
)
row() { echo "$GOT" | grep "^$1|"; }
[ "$(row $WA)" = "$WA|PARTS_SOURCING|CHECKING_PARTS|-|1" ] && pass "ค้างขั้นเบิก ยังไม่เช็ค → เช็คอะไหล่ · รอแอดมินเช็ค · มีประวัติย้าย" || fail "A: $(row $WA)"
[ "$(row $WB)" = "$WB|PARTS_SOURCING|WAITING_PARTS|2026-11-20|1" ] && pass "ค้างขั้นเบิก ของหมด → เช็คอะไหล่ · รออะไหล่ · วันคาดเข้าไม่หาย" || fail "B: $(row $WB)"
[ "$(echo "$GOT" | grep '^parts|')" = "parts|SP-BELT:false:-,SP-BOARD:true:คลังลาดพร้าว 94" ] && pass "ผลมี/หมดและคลังที่เช็คไว้ไม่หาย" || fail "ผลเช็ค B: $(echo "$GOT" | grep '^parts|')"
[ "$(row $WC)" = "$WC|PARTS_REQUESTED|CHECKING_PARTS|-|0" ] && pass "เบิกไปบางตัวแล้ว → ไม่ย้อน อยู่ขั้นเบิกต่อ" || fail "C: $(row $WC)"
[ "$(row $WD)" = "$WD|PARTS_SOURCING|WAITING_PARTS|-|1" ] && pass "ใบรออะไหล่รุ่นเก่า → เช็คอะไหล่ที่แอดมิน · รออะไหล่" || fail "D: $(row $WD)"
[ "$(row $WE)" = "$WE|PARTS_CHECKED|WAITING_TECH|-|0" ] && [ "$(row $WF)" = "$WF|PARTS_PICKUP|WAITING_PARTS|-|0" ] \
  && pass "ขั้นอื่น (เบิกครบรอจ่ายงาน · รอหัวหน้าภาคเบิกคลังอื่น) ไม่แตะ" || fail "E/F: $(row $WE) / $(row $WF)"
[ "$(ST $WA)" = "PARTS_REQUESTED" ] && pass "ROLLBACK แล้วฐานข้อมูลกลับเหมือนเดิม (ไม่กระทบใบอื่น)" || fail "ROLLBACK ไม่กลับ: $(ST $WA)"

echo
echo "═══ ใบที่เบิกไปแล้วก่อนเปลี่ยนสายงาน เดินต่อโดยไม่เบิกซ้ำ"
# C: เบิกตัวที่เหลือ — ยังไม่ได้นัด จึงไปหัวหน้าภาคนัดวัน ไม่ใช่ปล่อยงาน
POST $A "work-orders/$WC/parts-check" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-NEW-C\"}]}" >/dev/null
[ "$(ST $WC)" = "PARTS_CHECKED" ] && pass "เบิกครบแล้วแต่ยังไม่ได้นัด → หัวหน้าภาคนัดวันเข้า" || fail "C หลังเบิก: $(ST $WC)"
POST $S "work-orders/$WC/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D1\"}" >/dev/null
[ "$(ST $WC)" = "AWAITING_CONFIRM" ] && pass "นัดแล้วข้ามขั้นเบิก (เบิกครบแล้ว) ไปคอนเฟิร์มลูกค้า" || fail "C หลังนัด: $(ST $WC)"
POST $A "work-orders/$WC/confirm-appointment" '{}' >/dev/null
[ "$(ST $WC)" = "ASSIGNED" ] && pass "คอนเฟิร์มแล้วไปปล่อยงานเลย — เบิกไว้ครบแล้ว ไม่ต้องเบิกซ้ำ" || fail "C หลังคอนเฟิร์ม: $(ST $WC)"
[ "$(DB "select string_agg(\"requisitionNo\",',' order by \"requisitionNo\") from \"WorkOrderPart\" where \"workOrderId\"=$WC")" = "RQ-NEW-C,RQ-OLD-C" ] \
  && pass "เลขใบเบิกเดิมกับรอบใหม่อยู่ครบ" || fail "เลขใบเบิก C"
# E: เบิกครบรอจ่ายงาน (ชื่อขั้นใหม่ = นัดวันเข้า)
curl -s "localhost:4000/api/work-orders/$WE" -H "$(H $A)" | J 'd.statusLabel' | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ใบเดิมที่รอจ่ายงาน ขึ้นชื่อขั้นใหม่ \"นัดวันเข้า\"" || fail "ชื่อขั้น E"
POST $S "work-orders/$WE/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D1\"}" >/dev/null
POST $A "work-orders/$WE/confirm-appointment" '{}' >/dev/null
[ "$(ST $WE)" = "ASSIGNED" ] && pass "เบิกครบก่อนเปลี่ยนสายงาน → คอนเฟิร์มแล้วข้ามขั้นเบิก" || fail "E หลังคอนเฟิร์ม: $(ST $WE)"
# F: หัวหน้าภาคเบิกคลังอื่นเสร็จ — ยังไม่ได้นัด
POST $S "work-orders/$WF/parts-pickup" "{\"results\":[{\"sparePartId\":$BOARD,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-PK-1\"},{\"sparePartId\":$BELT,\"warehouse\":\"คลังภูเก็ต\",\"requisitionNo\":\"RQ-PK-2\"}]}" >/dev/null
[ "$(ST $WF)" = "PARTS_CHECKED" ] && pass "เบิกคลังอื่นเสร็จ ยังไม่ได้นัด → หัวหน้าภาคนัดวันเข้า" || fail "F หลังเบิก: $(ST $WF)"
R=$(POST $S "work-orders/$WF/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 2)\"}")
[ "$(ST $WF)" = "AWAITING_CONFIRM" ] && pass "เบิกคลังอื่นเสร็จแล้ว นัดวันเข้าได้ → รอคอนเฟิร์มลูกค้า" || fail "F นัดไม่ผ่าน: $(echo $R | head -c 150)"

echo
echo "═══ ทีมไม่ว่างวันที่ลูกค้าขอ → แอดมินคอนเฟิร์มใหม่ → ปล่อยงาน (ไม่กลับไปเบิก)"
POST $S "work-orders/$WE/decline-new-date" '{"reason":"ทีมติดงานด่วน"}' >/dev/null
[ "$(ST $WE)" = "AWAITING_CONFIRM" ] && pass "หัวหน้าภาคตีกลับให้แอดมินคอนเฟิร์มใหม่" || fail "decline: $(ST $WE)"
POST $A "work-orders/$WE/confirm-appointment" "{\"scheduledAt\":\"$D2\"}" >/dev/null
[ "$(ST $WE)" = "ASSIGNED" ] && pass "คอนเฟิร์มวันใหม่ → ปล่อยงาน ไม่วนไปขั้นเบิก" || fail "หลังคอนเฟิร์มใหม่: $(ST $WE)"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
