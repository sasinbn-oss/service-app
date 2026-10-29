#!/bin/bash
# ทดสอบ: อะไหล่หมด — วันคาดว่าของเข้า · ป้ายแดงในรายการ (partsOut) · แอดมินเลื่อนวัน · ของครบแล้วล้าง
#        ของหมดรู้ตั้งแต่ขั้นเช็คอะไหล่ (ก่อนนัด) — นัดลูกค้าก่อนเบิก ต.ค. 69
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$1" -H "$(H $A)"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
eta() { GET "work-orders/$1" | J 'd.partsExpectedAt?d.partsExpectedAt.slice(0,10):"-"'; }
out() { GET "work-orders?status=ALL&search=$2" | J "(d.rows||d).find(r=>r.id===$1)?.partsOut ?? 'none'"; }

PP=$(GET "spare-parts?search=SP-")
BOARD=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
R=$(GET "branches?search=C0006" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null

newWo() {
  local W=$(POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"ทดสอบอะไหล่หมด\"}]}")
  local I=$(echo "$W" | J 'd.orders[0].id')
  POST $S "work-orders/$I/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
  echo $I
}

echo "═══ เช็คคลัง: สายพานหมด พร้อมวันคาดว่าเข้า"
ID=$(newWo W71); CODE=$(GET "work-orders/$ID" | J 'd.code')
OUT0=$(out $ID $CODE)
[ "$OUT0" = "0" ] && pass "ก่อนเช็ค รายการขึ้น partsOut=0" || fail "ก่อนเช็ค partsOut=$OUT0"
POST $A "work-orders/$ID/parts-sourcing" "{\"expectedAt\":\"2026-11-20\",\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"},{\"sparePartId\":$BELT,\"inStock\":false}]}" >/dev/null
[ "$(eta $ID)" = "2026-11-20" ] && pass "เก็บวันคาดว่าของเข้าไว้ที่ใบงาน" || fail "วันคาดว่าเข้า: $(eta $ID)"
[ "$(out $ID $CODE)" = "1" ] && pass "รายการขึ้น partsOut=1 (ป้ายแดง)" || fail "partsOut=$(out $ID $CODE)"
GET "work-orders/$ID" | J 'd.logs.find(l=>l.action==="PARTS_BACKORDERED").note' | grep -q "หมด: SP-BELT.*2026-11-20" \
  && pass "ประวัติบอกตัวที่หมดและวันคาดว่าเข้า" || fail "ประวัติไม่บอกตัวที่หมด"

echo
echo "═══ เลื่อนวันคาดว่าเข้า"
R=$(POST $S "work-orders/$ID/parts-eta" '{"expectedAt":"2026-11-30"}')
echo "$R" | grep -q "เฉพาะแอดมิน" && pass "หัวหน้าภาคเลื่อนวันไม่ได้" || fail "หัวหน้าภาคเลื่อนได้: $R"
R=$(POST $A "work-orders/$ID/parts-eta" '{"expectedAt":"30/11/2026"}')
echo "$R" | grep -q "ปี-เดือน-วัน" && pass "วันผิดรูปแบบถูกปฏิเสธ" || fail "รับวันผิดรูปแบบ: $R"
POST $A "work-orders/$ID/parts-eta" '{"expectedAt":"2026-11-30","note":"ผู้ขายเลื่อน"}' >/dev/null
[ "$(eta $ID)" = "2026-11-30" ] && pass "แอดมินเลื่อนวันได้" || fail "วันไม่เปลี่ยน: $(eta $ID)"
GET "work-orders/$ID" | J 'd.status+" "+d.waitingParts.find(p=>p.partCode==="SP-BELT").inStock' | grep -q "^PARTS_SOURCING false$" \
  && pass "เลื่อนวันไม่แตะขั้นและผลเช็ค" || fail "ขั้นหรือผลเช็คเปลี่ยน"
GET "work-orders/$ID" | J 'd.logs.find(l=>l.action==="PARTS_ETA_CHANGED").note' | grep -q "2026-11-20 → 2026-11-30 — ผู้ขายเลื่อน" \
  && pass "ประวัติบันทึกวันเดิม → วันใหม่" || fail "ประวัติเลื่อนวันไม่ตรง"

echo
echo "═══ ของมาแล้ว — ครบ ป้ายแดงหาย วันถูกล้าง"
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}" >/dev/null
GET "work-orders/$ID" | J 'd.status' | grep -q PARTS_CHECKED && pass "ของครบ เดินต่อไปหัวหน้าภาคนัดวันเข้า" || fail "ไม่เดินต่อ: $(GET "work-orders/$ID" | J 'd.status')"
[ "$(eta $ID)" = "-" ] && pass "วันคาดว่าเข้าถูกล้าง" || fail "วันค้าง: $(eta $ID)"
[ "$(out $ID $CODE)" = "0" ] && pass "รายการไม่ขึ้นป้ายแดงแล้ว" || fail "partsOut=$(out $ID $CODE)"
R=$(POST $A "work-orders/$ID/parts-eta" '{"expectedAt":"2026-12-01"}')
echo "$R" | grep -q "ไม่ได้รออะไหล่" && pass "ใบที่ไม่ได้รอของ เลื่อนวันไม่ได้" || fail "เลื่อนได้: $R"

echo
echo "═══ แยกใบ — วันคาดว่าเข้าไปติดใบรออะไหล่"
ID2=$(newWo W72)
R=$(POST $A "work-orders/$ID2/parts-sourcing" "{\"splitOut\":true,\"expectedAt\":\"2026-11-25\",\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"},{\"sparePartId\":$BELT,\"inStock\":false}]}")
CH=$(echo "$R" | J 'd.children[0].id')
echo "$R" | J 'd.status' | grep -q "^PARTS_CHECKED$" && pass "ใบเดิมไปนัดด้วยของที่มี" || fail "ใบเดิม: $(echo "$R" | J 'd.status')"
GET "work-orders/$CH" | J 'd.status' | grep -q "^PARTS_SOURCING$" && pass "ใบแยกค้างที่แอดมินเช็คอะไหล่จนของเข้า" || fail "ใบแยก: $(GET "work-orders/$CH" | J 'd.status')"
[ "$(eta $ID2)" = "-" ] && [ "$(eta $CH)" = "2026-11-25" ] && pass "ใบเดิมไม่มีวัน ใบรออะไหล่ได้วัน" || fail "ใบเดิม $(eta $ID2) ใบลูก $(eta $CH)"
CHCODE=$(GET "work-orders/$CH" | J 'd.code')
[ "$(out $CH $CHCODE)" = "1" ] && pass "ใบรออะไหล่ขึ้นป้ายแดง" || fail "ใบลูก partsOut=$(out $CH $CHCODE)"
# ใบแยกอยู่ที่แอดมินขั้นเช็คอะไหล่ — ของมาแล้วตอบว่ามี ส่งหัวหน้าภาคนัด
POST $A "work-orders/$CH/parts-sourcing" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}" >/dev/null
[ "$(eta $CH)" = "-" ] && [ "$(out $CH $CHCODE)" = "0" ] && pass "ของมาแล้วส่งนัด — วันล้าง ป้ายแดงหาย" || fail "หลังของมา: $(eta $CH) / $(out $CH $CHCODE)"

echo
echo "═══ ย้อนขั้นไปเช็คคลัง — วันของรอบเดิมถูกล้าง"
ID3=$(newWo W73)
POST $A "work-orders/$ID3/parts-sourcing" "{\"expectedAt\":\"2026-11-21\",\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false},{\"sparePartId\":$BELT,\"inStock\":false}]}" >/dev/null
POST $A "work-orders/$ID3/rollback" '{"toStage":"NEW","reason":"ทดสอบ"}' >/dev/null
[ "$(eta $ID3)" = "-" ] && pass "ย้อนขั้นแล้ววันคาดว่าเข้าถูกล้าง" || fail "วันค้าง: $(eta $ID3)"

# เก็บกวาด — ลบใบที่เทสต์สร้าง ไม่ให้ค้างสะสมในสาขาทดสอบ (CLAUDE.md)
for i in $CH $ID $ID2 $ID3; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"; done
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
