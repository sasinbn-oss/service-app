#!/bin/bash
# ทดสอบ: ขนาดเครื่องเก็บที่ตัวเครื่อง + ผู้ติดต่อตอนเปิดจากกระดาน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

echo "═══ ตัวเลือกขนาดมาจากเซิร์ฟเวอร์"
OPT=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)")
echo "$OPT" | J '"  ขนาด: "+d.machineCapacities.join(", ")+" · รับได้ "+d.machineCapacityRange.min+"-"+d.machineCapacityRange.max+" kg"'
echo "$OPT" | J 'd.machineCapacities.includes(10)&&d.machineCapacities.includes(13)?"ok":"bad"' | grep -q ok \
  && pass "มี 10 กับ 13 ตามที่สั่ง" || fail "ไม่มีขนาดที่สั่งไว้"

echo
echo "═══ เปิดใบงานพร้อมขนาด"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactName":"คุณสมหญิง","contactPhone":"0812345678","machines":[{"code":"W41","model":"Huebsch","capacityKg":13,"symptom":"น้ำไม่เข้า"},{"code":"D41","model":"Haier","capacityKg":25,"symptom":"ไม่ร้อน"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
echo "$WO" | J 'd.orders.map(o=>o.code).join(" ")' | sed 's/^/  เปิดได้: /'
R=$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)")
echo "$R" | J '"  "+d.machineCode+" · "+d.machineModel+" · "+d.machineCapacityLabel'
echo "$R" | J 'd.machineCapacityKg===13&&d.machineCapacityLabel==="13 kg"?"ok":"bad"' | grep -q ok \
  && pass "ขนาดถูกบันทึกและส่งกลับพร้อมหน่วย" || fail "ขนาดไม่ตรง"

echo
echo "═══ ขนาดเก็บที่ตัวเครื่อง ใบถัดไปไม่ต้องกรอกซ้ำ"
M=$(curl -s "localhost:4000/api/branches/C0006/machines" -H "$(H $A)")
echo "$M" | J 'const m=d.find(x=>x.code==="W41"); "  W41 → รุ่น "+m.model+" ขนาด "+m.capacityKg+" kg"'
echo "$M" | J 'd.find(x=>x.code==="W41").capacityKg===13?"ok":"bad"' | grep -q ok \
  && pass "สาขาตอบขนาดของเครื่องกลับมาให้เติมในฟอร์ม" || fail "สาขาไม่ตอบขนาด"
WO2=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W41","symptom":"อีกรอบ"}]}')
ID2=$(echo "$WO2" | J 'd.orders[0].id')
curl -s "localhost:4000/api/work-orders/$ID2" -H "$(H $A)" | J 'd.machineCapacityLabel==="13 kg"?"ok":"bad"' | grep -q ok \
  && pass "ไม่ส่งขนาดมาก็ไม่ล้างของเดิม" || fail "ของเดิมถูกล้างทิ้ง"

echo
echo "═══ ขนาดนอกขอบเขตต้องถูกปฏิเสธ"
R=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W42","capacityKg":500,"symptom":"พิมพ์พลาด"}]}')
echo "$R" | grep -q "error" && pass "500 kg ถูกปฏิเสธ" || fail "รับ 500 kg: $R"

echo
echo "═══ เปิดจากกระดาน — ผู้ติดต่อต้องไม่หาย (ของเดิมหายเงียบ)"
OUT=$(curl -s "localhost:4000/api/machines/outages?limit=40" -H "$(H $A)")
OID=$(echo "$OUT" | J 'const r=d.rows||d; const f=r.find(x=>!x.workOrder&&x.machineCode); f?f.id:""')
if [ -z "$OID" ]; then echo "  (ข้าม — ไม่มีเคสว่างบนกระดาน)"; else
  MC=$(echo "$OUT" | J 'const r=d.rows||d; r.find(x=>x.id==='"$OID"').machineCode')
  echo "  เคส $OID เครื่อง $MC"
  R=$(curl -s -X POST "localhost:4000/api/work-orders/from-outage/$OID" -H "$(H $A)" -H 'Content-Type: application/json' \
    -d '{"jobType":"CM","priority":"NORMAL","contactName":"คุณมานพ","contactPhone":"0899999999","model":"Oasis","capacityKg":18,"symptom":"ดับทั้งเครื่อง"}')
  echo "$R" | J '"  "+d.code+" · ผู้ติดต่อ "+(d.contactName||"(ว่าง)")+" "+(d.contactPhone||"")+" · ขนาด "+(d.machineCapacityLabel||"(ว่าง)")'
  echo "$R" | J 'd.contactName==="คุณมานพ"&&d.contactPhone==="0899999999"?"ok":"bad"' | grep -q ok \
    && pass "ผู้ติดต่อถูกบันทึกตอนเปิดจากกระดาน" || fail "ผู้ติดต่อยังหาย"
  echo "$R" | J 'd.machineCapacityLabel==="18 kg"&&d.machineModel==="Oasis"?"ok":"bad"' | grep -q ok \
    && pass "รุ่นกับขนาดถูกบันทึกตอนเปิดจากกระดาน" || fail "รุ่น/ขนาดไม่ถูกบันทึก"
  echo "IDOUT=$(echo "$R" | J 'd.id')"
fi

echo
echo "IDS=$ID,$ID2"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
