#!/bin/bash
# ทดสอบ: เลขใบเบิกอะไหล่ตอนแอดมินเบิก (หลังนัดวัน ก่อนคอนเฟิร์มลูกค้า — ต.ค. 69 รอบสอง) + รูปใบเหลืองตอนปิดงาน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
# วันนัดของทั้งสองใบ (ใบเบิกอะไหล่ · ใบไม่ใช้อะไหล่)
D1=$(day 7)

PARTS=$(curl -s "localhost:4000/api/spare-parts?search=SP-" -H "$(H $A)")
BOARD_ID=$(echo "$PARTS" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT_ID=$(echo "$PARTS" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')

# ตั้งภาคให้หัวหน้าภาคตรงกับสาขาที่ทดสอบ ไม่งั้นลำดับการรันเทสต์มีผลต่อผลลัพธ์
SUPID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
# เก็บกวาดตอนจบ (ผ่านหรือไม่ก็ตาม) — ลบใบที่สร้าง คืนภาค/ทีมของผู้ใช้ทดสอบ (CLAUDE.md)
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
ID=""; ID2=""
cleanup() {
  for i in $ID $ID2; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'; update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
}
trap cleanup EXIT
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
echo "═══ เช็คอะไหล่ (มี/หมด) → นัดวัน → เบิก → คอนเฟิร์ม"
TECH=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)" | J 'd.technicians.find(t=>t.employeeCode==="T001").id')
# จ่ายเป็นทีม และจัดช่างทดสอบเข้าทีมของสาขา C0006 ตามไฟล์ทะเบียนจริง
TEAM=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].zone')
curl -s -X PATCH "localhost:4000/api/auth/users/$TECH" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-sourcing" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"},{\"sparePartId\":$BELT_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}")
echo "$R" | J 'd.statusLabel' | grep -q "นัดวันเข้า" && pass "เช็คอะไหล่ครบ (ยังไม่เบิก) → หัวหน้าภาคนัดวันเข้า" || fail "หลังเช็คอะไหล่: $R"
echo "$R" | J 'd.waitingParts.every(p=>p.inStock===true&&!p.requisitionNo)?"ok":"bad"' | grep -q ok \
  && pass "ขั้นเช็คไม่ตัดของ — ยังไม่มีเลขใบเบิก" || fail "ขั้นเช็คมีเลขใบเบิกติดมา"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D1\"}")
echo "$R" | J 'd.statusLabel' | grep -q "เบิกอะไหล่" && pass "นัดวันแล้วไปขั้นแอดมินเบิกอะไหล่ (ยังไม่คอนเฟิร์มลูกค้า)" || fail "หลังนัดวัน: $(echo "$R" | J 'd.statusLabel')"

echo
echo "═══ เบิกโดยไม่ใส่เลขใบเบิก — ต้องถูกปฏิเสธ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"},{\"sparePartId\":$BELT_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}")
echo "$R" | grep -q "เลขใบเบิก" && pass "ไม่ใส่เลขใบเบิกแล้วถูกปฏิเสธ" || fail "รับไปทั้งที่ไม่มีเลขใบเบิก: $R"

echo
echo "═══ ตอนเบิกเจอของหมด (นัดวันแล้ว ยังไม่คอนเฟิร์มลูกค้า) — ต้องแยกใบ หรือยกเลิกนัดรอของ ค้างที่ขั้นเบิกไม่ได้"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-2569-0042\"},{\"sparePartId\":$BELT_ID,\"inStock\":false}]}")
echo "$R" | grep -q "ของไม่พอ" && pass "ของหมดตอนเบิกโดยไม่แยกใบ ถูกปฏิเสธ (บอกทางไป)" || fail "รับไป: $R"
# ร้านยังไม่รู้วัน — ปุ่มที่บอกต้องเป็น "ยกเลิกนัด" ไม่ใช่ "แจ้งเลื่อนนัด" (คำนั้นเฉพาะใบที่คอนเฟิร์มแล้ว)
echo "$R" | grep -q "ของไม่พอ — ยกเลิกนัด รอของเข้า" && ! echo "$R" | grep -q "แจ้งเลื่อนนัด" \
  && pass "ยังไม่คอนเฟิร์มลูกค้า ข้อความบอกปุ่ม “ยกเลิกนัด รอของเข้า”" || fail "ข้อความปุ่มของไม่พอ: $R"
[ "$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.waitingParts.filter(p=>p.requisitionNo).length')" = "0" ] \
  && pass "ถูกปฏิเสธแล้วไม่มีของตัดออกจากคลังครึ่ง ๆ" || fail "มีเลขใบเบิกค้างทั้งที่ถูกปฏิเสธ"

echo
echo "═══ เบิกครบ → แอดมินคอนเฟิร์มลูกค้า → หัวหน้าภาคปล่อยงาน (ไม่ต้องจ่ายงานซ้ำ)"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-2569-0042\"},{\"sparePartId\":$BELT_ID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-2569-0042\"}]}")
echo "$R" | J 'd.statusLabel' | grep -q "คอนเฟิร์มลูกค้า" && pass "เบิกครบแล้วไปแอดมินคอนเฟิร์มลูกค้า (ของอยู่ในมือแล้ว)" || fail "เบิกแล้วไม่ไปคอนเฟิร์มลูกค้า: $(echo "$R" | J 'd.statusLabel')"
echo "$R" | J 'd.waitingParts.map(p=>p.partCode+" คลัง="+(p.warehouse||"-")+" ใบเบิก="+(p.requisitionNo||"-")).join(" · ")'
echo "$R" | J 'd.waitingParts.every(p=>p.requisitionNo==="RQ-2569-0042")?"ok":"bad"' | grep -q ok \
  && pass "เลขใบเบิกบันทึกครบทุกตัว" || fail "เลขใบเบิกไม่ครบ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/confirm-appointment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | J 'd.statusLabel' | grep -q "ปล่อยงาน" && pass "ลูกค้าคอนเฟิร์มแล้วไปหัวหน้าภาคปล่อยงาน (ไม่วนกลับไปเบิก)" || fail "หลังคอนเฟิร์ม: $(echo "$R" | J 'd.statusLabel')"
curl -s -X POST "localhost:4000/api/work-orders/$ID/dispatch" -H "$(H $S)" -H 'Content-Type: application/json' -d '{}' >/dev/null

echo
# รูปหน้างานต้องมีก่อน ไม่งั้นจะโดนปฏิเสธด้วยเหตุผลอื่นแทน
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=BEFORE" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=AFTER" >/dev/null
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
  -d '{"branchCode":"C0006","jobType":"PM","priority":"NORMAL","machines":[{"symptom":"ตรวจตามรอบ"}]}')
ID2=$(echo "$WO2" | J 'd.orders?d.orders[0].id:d.id')
curl -s -X POST "localhost:4000/api/work-orders/$ID2/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D1\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/confirm-appointment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/dispatch" -H "$(H $S)" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=BEFORE" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID2/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=AFTER" >/dev/null
# ปิดงานต้องมีป้ายรุ่นของรอบนี้ด้วย ไว้ไล่เทียบว่าไปถูกเครื่อง
curl -s -X POST "localhost:4000/api/work-orders/$ID2/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=NAMEPLATE" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID2/close" -H "$(H $T)" -H 'Content-Type: application/json' -d "{\"result\":\"FIXED\",\"note\":\"ปกติดี\",\"workerIds\":[$TECH]}")
echo "$R" | J 'd.statusLabel' | grep -q "ปิดงาน" && pass "งานไม่ใช้อะไหล่ปิดได้ตามปกติ" || fail "ถูกบล็อกทั้งที่ไม่ได้ใช้อะไหล่: $R"

echo
echo "IDS=$ID,$ID2"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
