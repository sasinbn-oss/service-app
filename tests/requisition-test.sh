#!/bin/bash
# ทดสอบ: เลขใบเบิกอะไหล่ตอนแอดมินเช็ค + รูปใบเหลืองตอนปิดงาน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

PARTS=$(curl -s "localhost:4000/api/spare-parts?search=SP-" -H "$(H $A)")
BOARD_ID=$(echo "$PARTS" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT_ID=$(echo "$PARTS" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')

# ตั้งภาคให้หัวหน้าภาคตรงกับสาขาที่ทดสอบ ไม่งั้นลำดับการรันเทสต์มีผลต่อผลลัพธ์
SUPID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
TESTREGION=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SUPID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$TESTREGION\"}" >/dev/null

echo "═══ เปิดใบงานและขอเบิกอะไหล่สองตัว"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W5","model":"Huebsch","symptom":"บอร์ดไหม้"}]}')
ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id')
CODE=$(echo "$WO" | J 'd.orders?d.orders[0].code:d.code')
echo "  $CODE (id=$ID)"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD_ID,\"quantity\":1},{\"sparePartId\":$BELT_ID,\"quantity\":2}]}" >/dev/null

echo
echo "═══ เช็คอะไหล่โดยไม่ใส่เลขใบเบิก — ต้องถูกปฏิเสธ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"},{\"sparePartId\":$BELT_ID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\"}]}")
echo "$R" | grep -q "เลขใบเบิก" && pass "ไม่ใส่เลขใบเบิกแล้วถูกปฏิเสธ" || fail "รับไปทั้งที่ไม่มีเลขใบเบิก: $R"

echo
echo "═══ ของที่หมดไม่ต้องมีเลขใบเบิก"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-2569-0042\"},{\"sparePartId\":$BELT_ID,\"inStock\":false}]}")
echo "$R" | J 'd.statusLabel' | grep -q "เช็คอะไหล่" && pass "เช็คผ่านโดยตัวที่หมดไม่ต้องมีเลขใบเบิก" || fail "เช็คไม่ผ่าน: $R"
echo "$R" | J 'd.waitingParts.map(p=>p.partCode+" คลัง="+(p.warehouse||"-")+" ใบเบิก="+(p.requisitionNo||"-")).join(" · ")'
echo "$R" | J 'd.waitingParts.find(p=>p.inStock===false).requisitionNo===null?"ok":"bad"' | grep -q ok \
  && pass "ตัวที่หมดไม่มีเลขใบเบิกค้างไว้" || fail "ตัวที่หมดมีเลขใบเบิกติดมา"
# ของหมดทำให้ใบงานค้างอยู่ขั้นนี้ ต้องรอของเข้าแล้วเบิกอีกรอบถึงจะเดินต่อ
echo "$R" | J 'd.statusLabel' | grep -q "เช็คอะไหล่" && pass "ของหมด ใบงานยังค้างอยู่ที่แอดมิน" || fail "ส่งต่อทั้งที่ของไม่ครบ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BELT_ID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-2569-0099\"}]}")
echo "$R" | J 'd.statusLabel' | grep -q "จ่ายงาน" && pass "ของมาแล้วเบิกรอบสอง ใบงานเดินต่อ" || fail "เบิกรอบสองแล้วไม่เดินต่อ: $R"
echo "$R" | J 'd.waitingParts.find(p=>p.partCode==="SP-BOARD").requisitionNo==="RQ-2569-0042"?"ok":"bad"' | grep -q ok \
  && pass "ใบเบิกรอบแรกไม่ถูกเขียนทับ" || fail "ใบเบิกรอบแรกถูกทับ"

echo
echo "═══ จ่ายงานและนัดวัน"
TECH=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)" | J 'd.technicians.find(t=>t.employeeCode==="T001").id')
# จ่ายเป็นทีม และจัดช่างทดสอบเข้าทีมของสาขา C0006 ตามไฟล์ทะเบียนจริง
TEAM=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].zone')
curl -s -X PATCH "localhost:4000/api/auth/users/$TECH" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-02"}' >/dev/null

echo
# รูปหน้างานต้องมีก่อน ไม่งั้นจะโดนปฏิเสธด้วยเหตุผลอื่นแทน
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
# ปิดงานต้องมีป้ายรุ่นของรอบนี้ด้วย ไว้ไล่เทียบว่าไปถูกเครื่อง
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=NAMEPLATE" >/dev/null
echo "═══ ปิดงานพร้อมอะไหล่ที่ใช้ แต่ยังไม่แนบใบเหลือง — ต้องถูกปฏิเสธ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนบอร์ด\",\"parts\":[{\"sparePartId\":$BOARD_ID,\"quantity\":1}],\"workerIds\":[$TECH]}")
echo "$R" | grep -q "ใบเหลือง" && pass "ไม่แนบใบเหลืองแล้วปิดงานไม่ได้" || fail "ปิดงานได้ทั้งที่ไม่มีใบเหลือง: $R"

echo
echo "═══ แนบใบเหลืองแล้วค่อยปิด"
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=REQUISITION" | J '"  แนบแล้ว: "+d.fileName+" role="+d.role+" ("+d.roleLabel+")"'
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนบอร์ด\",\"parts\":[{\"sparePartId\":$BOARD_ID,\"quantity\":1}],\"workerIds\":[$TECH]}")
echo "$R" | J 'd.statusLabel' | grep -q "ปิดงาน" && pass "แนบใบเหลืองแล้วปิดงานได้" || fail "ยังปิดไม่ได้: $R"
echo "$R" | J 'd.hasRequisitionSlip===true?"ok":"bad"' | grep -q ok && pass "ใบงานรายงานว่ามีใบเหลืองแล้ว" || fail "hasRequisitionSlip ไม่ตรง"

echo
echo "═══ งานที่ไม่ใช้อะไหล่ ปิดได้โดยไม่ต้องมีใบเหลือง"
WO2=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"PM","priority":"NORMAL","machines":[{"code":"D5","model":"Haier","symptom":"ตรวจตามรอบ"}]}')
ID2=$(echo "$WO2" | J 'd.orders?d.orders[0].id:d.id')
curl -s -X POST "localhost:4000/api/work-orders/$ID2/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/schedule" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-02"}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
# ปิดงานต้องมีป้ายรุ่นของรอบนี้ด้วย ไว้ไล่เทียบว่าไปถูกเครื่อง
curl -s -X POST "localhost:4000/api/work-orders/$ID2/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=NAMEPLATE" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID2/close" -H "$(H $T)" -H 'Content-Type: application/json' -d "{\"result\":\"FIXED\",\"note\":\"ปกติดี\",\"workerIds\":[$TECH]}")
echo "$R" | J 'd.statusLabel' | grep -q "ปิดงาน" && pass "งานไม่ใช้อะไหล่ปิดได้ตามปกติ" || fail "ถูกบล็อกทั้งที่ไม่ได้ใช้อะไหล่: $R"

echo
echo "IDS=$ID,$ID2"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
