#!/bin/bash
# ทดสอบ: จ่ายงานเป็นทีม · ขอบเขตที่ช่างเห็น · ปิดงานต้องมีรูปและชื่อผู้เข้าปฏิบัติงาน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

TECH=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)" | J 'd.technicians.find(t=>t.employeeCode==="T001").id')
# ตั้งภาคให้หัวหน้าภาคตรงกับสาขาที่ทดสอบ ไม่งั้นลำดับการรันเทสต์มีผลต่อผลลัพธ์
SUPID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
TESTREGION=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SUPID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$TESTREGION\"}" >/dev/null
# ล้างทีมของช่างทดสอบก่อน ไม่งั้นรันรอบสองจะเริ่มจากสภาพที่รอบแรกทิ้งไว้
curl -s -X PATCH "localhost:4000/api/auth/users/$TECH" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"team":null}' >/dev/null

echo "═══ รายชื่อทีมมาจากทะเบียนสาขา"
curl -s localhost:4000/api/branches/teams -H "$(H $A)" | J 'd.map(t=>t.name+" ("+t.branches+" สาขา)").join(", ")'
curl -s localhost:4000/api/work-orders/options -H "$(H $A)" | J 'd.teams.length>0?"ok":"bad"' | grep -q ok \
  && pass "options ส่งรายชื่อทีมมาด้วย" || fail "options ไม่มีทีม"

echo
echo "═══ เปิดใบงานและเดินถึงขั้นจ่ายงาน"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบจ่ายเป็นทีม"}]}')
ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id'); CODE=$(echo "$WO" | J 'd.orders?d.orders[0].code:d.code')
echo "  $CODE (id=$ID)"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null

echo
echo "═══ ทีมที่ไม่มีในทะเบียนต้องถูกปฏิเสธ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"team":"ทีมที่ไม่มีจริง"}')
echo "$R" | grep -q "ไม่รู้จักทีม" && pass "ทีมมั่วถูกปฏิเสธ" || fail "รับทีมมั่ว: $R"

echo
echo "═══ จ่ายให้ทีมของสาขาเอง"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"team":"กระบี่"}')
echo "$R" | J 'd.assignedTeam' | grep -q "กระบี่" && pass "จ่ายให้ทีมได้" || fail "จ่ายไม่ได้: $R"
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J '"  ประวัติ: "+d.logs.find(l=>l.action==="ASSIGNED").note'

echo
echo "═══ ช่างที่ยังไม่ได้จัดทีม ต้องไม่เห็นงานของทีม"
N=$(curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $T)" | J 'const r=d.rows||d; r.filter(w=>w.code==="'"$CODE"'").length')
[ "$N" = "0" ] && pass "ช่างไม่มีทีม ไม่เห็นงานของทีม" || fail "เห็นทั้งที่ยังไม่ได้จัดทีม"
# นัดวันเป็นขั้นของหัวหน้าภาคแล้ว ช่างแตะไม่ได้ไม่ว่าจะอยู่ทีมไหน
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $T)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-08"}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างนัดวันเองไม่ได้" || fail "ช่างยังนัดวันได้: $R"

echo
echo "═══ จัดช่างเข้าทีมแล้วต้องเห็น"
curl -s -X PATCH "localhost:4000/api/auth/users/$TECH" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"team":"กระบี่"}' | J '"  "+d.name+" → ทีม "+d.team'
N=$(curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $T)" | J 'const r=d.rows||d; r.filter(w=>w.code==="'"$CODE"'").length')
[ "$N" = "1" ] && pass "ช่างในทีมเห็นงานของทีม" || fail "ยังไม่เห็น"
curl -s -X POST "localhost:4000/api/work-orders/$ID/schedule" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"scheduledAt":"2026-10-08"}' \
  | J 'd.statusLabel' | grep -q "เข้างาน" && pass "หัวหน้าภาคนัดวันได้" || fail "นัดวันไม่ได้"

echo
echo "═══ ปิดงานโดยไม่มีรูปหน้างาน — ต้องถูกปฏิเสธ"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"เสร็จ\",\"workerIds\":[$TECH]}")
echo "$R" | grep -q "รูปหรือวิดีโอหน้างาน" && pass "ไม่มีรูปหน้างาน ปิดไม่ได้" || fail "ปิดได้ทั้งที่ไม่มีรูป: $R"

echo
echo "═══ ปิดงานโดยไม่บอกว่าใครไป — ต้องถูกปฏิเสธ"
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
# ปิดงานต้องมีป้ายรุ่นของรอบนี้ด้วย ไว้ไล่เทียบว่าไปถูกเครื่อง
curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $T)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=NAMEPLATE" >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d '{"result":"FIXED","note":"เสร็จ"}')
echo "$R" | grep -q "ผู้เข้าปฏิบัติงาน" && pass "ไม่บอกว่าใครไป ปิดไม่ได้" || fail "ปิดได้ทั้งที่ไม่บอก: $R"

echo
echo "═══ ครบแล้วปิดได้ และบันทึกคนที่ไป"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/close" -H "$(H $T)" -H 'Content-Type: application/json' \
  -d "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนสายพาน\",\"workerIds\":[$TECH],\"otherWorkers\":\"ช่างผู้รับเหมา 1 คน\"}")
echo "$R" | J 'd.statusLabel' | grep -q "ปิดงาน" && pass "ปิดงานได้" || fail "ปิดไม่ได้: $R"
echo "$R" | J '"  ผู้เข้าปฏิบัติงาน: "+d.workers.map(w=>w.name).join(", ")+" · อื่นๆ: "+(d.otherWorkers||"-")'
echo "$R" | J 'd.workers.length===1?"ok":"bad"' | grep -q ok && pass "บันทึกคนที่ไปแล้ว" || fail "ไม่ได้บันทึกคนที่ไป"

echo
echo "═══ จ่ายข้ามทีมได้ และบันทึกว่าข้าม"
WO2=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"PM","priority":"NORMAL","machines":[{"code":"D8","model":"Oasis","symptom":"ทดสอบข้ามทีม"}]}')
ID2=$(echo "$WO2" | J 'd.orders?d.orders[0].id:d.id')
curl -s -X POST "localhost:4000/api/work-orders/$ID2/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null
TEAMS=$(curl -s localhost:4000/api/branches/teams -H "$(H $A)" | J 'd.map(t=>t.name).join("|")')
OTHER=$(echo "$TEAMS" | tr '|' '\n' | grep -v "กระบี่" | head -1)
if [ -n "$OTHER" ]; then
  R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID2/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$OTHER\"}")
  curl -s "localhost:4000/api/work-orders/$ID2" -H "$(H $A)" | J '"  ประวัติ: "+d.logs.find(l=>l.action==="ASSIGNED").note' | grep -q "ข้ามทีม" \
    && pass "จ่ายข้ามทีมได้ และประวัติบอกว่าข้าม" || fail "ประวัติไม่บอกว่าข้ามทีม"
else
  echo "  (ข้าม — มีทีมเดียวในฐานข้อมูลทดสอบ)"
fi

echo
echo "IDS=$ID,$ID2"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
