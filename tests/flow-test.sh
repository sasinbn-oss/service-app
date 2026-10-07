#!/bin/bash
# ทดสอบ: นัดวันเป็นของหัวหน้าภาค · สถานะอัปเดตตามขั้น · ใบเหลืองรายรอบ ·
#        ปิดงานได้เฉพาะงานที่จบ · เทียบผลกับกระดานติดตาม
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
ws() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }

BR=$(curl -s "localhost:4000/api/branches?search=C0001" -H "$(H $A)" | J 'd[0].region+"|"+d[0].zone')
REGION=${BR%%|*}; TEAM=${BR##*|}
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
TID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="T001").id')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$REGION\"}" >/dev/null
curl -s -X PATCH "localhost:4000/api/auth/users/$TID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')

WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0001","jobType":"CM","priority":"NORMAL","machines":[{"code":"W31","model":"Oasis","symptom":"ทดสอบสายงาน"}]}')
ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id'); CODE=$(echo "$WO" | J 'd.orders?d.orders[0].code:d.code')
echo "═══ $CODE"
echo "  เปิดใบงาน → $(ws $ID)"

echo
echo "═══ สถานะการดำเนินการต้องขยับตามขั้นเอง"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-001\"}]}" >/dev/null
echo "  เช็คอะไหล่ครบ → $(ws $ID)"
ws $ID | grep -q "รอช่างเข้าแก้ไข" && pass "ของครบแล้วขึ้น 'รอช่างเข้าแก้ไข' ให้เอง" || fail "สถานะไม่ขยับ"

echo
echo "═══ นัดวันต้องเป็นของหัวหน้าภาค ไม่ใช่ช่าง"
curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
ws $ID | grep -q "รอหัวหน้าภาคนัดลูกค้า" && pass "ขั้นนี้ขึ้นว่ารอหัวหน้าภาคนัดลูกค้า" || fail "ป้ายขั้นยังเป็นของช่าง: $(ws $ID)"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $T)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-20"}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างนัดวันเองไม่ได้แล้ว" || fail "ช่างยังนัดวันได้: $(echo $R | head -c 120)"
curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-20"}' >/dev/null
ws $ID | grep -q "รอช่างเข้างาน" && pass "หัวหน้าภาคนัดวันได้" || fail "หัวหน้าภาคนัดไม่ได้: $(ws $ID)"

echo
echo "═══ ปิดงานด้วยผลที่ยังไม่จบ ต้องถูกปฏิเสธ"
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"NEED_REVISIT\",\"workerIds\":[$TID]}")
echo "$R" | grep -q "ยังไม่จบปิดไม่ได้\|Invalid enum" && pass "ผล 'ยังไม่จบ' ปิดงานไม่ได้" || fail "ปิดได้ทั้งที่ยังไม่จบ: $(echo $R|head -c 140)"

echo
echo "═══ ช่างส่งกลับ ใบงานต้องเด้งไปหัวหน้าภาค"
curl -s -X POST "localhost:4000/api/work-orders/$ID/reassess-parts" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"reason\":\"ไปถึงแล้วบอร์ดไหม้ ต้องเบิกเพิ่ม\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
ws $ID | grep -q "รอหัวหน้าภาคระบุอะไหล่" && pass "เด้งกลับไปที่หัวหน้าภาคแล้ว" || fail "ไม่ได้เด้งกลับ: $(ws $ID)"

echo
echo "═══ ใบเหลืองของรอบก่อน ใช้ปิดรอบนี้ไม่ได้"
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=REQUISITION" >/dev/null
echo "  (แนบใบเหลืองไว้ตอนนี้ = ก่อนถูกจ่ายงานรอบใหม่)"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-002\"}]}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-21"}' >/dev/null
# ป้ายรุ่นของรอบนี้ต้องมีก่อน ไม่งั้นจะโดนปฏิเสธด้วยเหตุผลอื่นแทนใบเหลือง
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=NAMEPLATE" >/dev/null
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.hasRequisitionSlip===false?"ok":"bad"' | grep -q ok \
  && pass "ระบบถือว่ารอบนี้ยังไม่มีใบเหลือง" || fail "ยังนับใบเหลืองของรอบก่อน"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"workerIds\":[$TID]}")
echo "$R" | grep -q "ใบเหลือง" && pass "ปิดไม่ได้เพราะใบเหลืองเป็นของรอบก่อน" || fail "ปิดผ่านด้วยใบเก่า: $(echo $R|head -c 140)"

echo
echo "═══ แนบใบเหลืองของรอบนี้แล้วปิดได้"
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=REQUISITION" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนบอร์ด\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"workerIds\":[$TID]}")
echo "$R" | J 'd.statusLabel' | grep -q "ปิดงาน" && pass "ปิดงานได้" || fail "ปิดไม่ได้: $(echo $R|head -c 140)"
echo "  หลังปิด → $(ws $ID)"
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.workStatus===null?"ok":"bad"' | grep -q ok \
  && pass "ปิดแล้วล้างสถานะการดำเนินการ ไม่ค้างบนกระดาน" || fail "สถานะยังค้าง"
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J '"  เทียบกับกระดาน: "+(d.outcomeVerdict||"เทียบไม่ได้ (เปิดเอง ไม่ได้ผูกกับเคส)")'

echo
echo "IDS=$ID"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
