#!/bin/bash
# ทดสอบ: ของหมด = ใบงานค้างรออะไหล่ · ของมาแล้วค่อยใส่ใบเบิกอีกรอบ
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
st() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }
parts() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.waitingParts.map(p=>p.partCode+" "+(p.inStock===null?"ยังไม่เช็ค":p.inStock?"มีของ":"หมด")+" ใบเบิก="+(p.requisitionNo||"-")).join(" · ")'; }

PP=$(curl -s "localhost:4000/api/spare-parts?search=SP-" -H "$(H $A)")
BOARD=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
R=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null

echo "═══ เปิดใบงาน ขออะไหล่สองตัว"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W61","symptom":"ทดสอบของหมด"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
echo "  $(echo "$WO" | J 'd.orders[0].code') (id=$ID)" | sed "s/\$ID/$ID/"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null

echo
echo "═══ รอบ 1 — บอร์ดมีของ สายพานหมด"
curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-ROUND-1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}" >/dev/null
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "รอแอดมินเช็คอะไหล่" && pass "ของหมด ใบงานค้างอยู่ที่แอดมิน ไม่ส่งต่อ" || fail "ส่งต่อไปแล้วทั้งที่ของยังไม่มา: $(st $ID)"
st $ID | grep -q "รออะไหล่" && pass "สถานะขึ้นว่ารออะไหล่" || fail "สถานะไม่ขึ้นรออะไหล่"

echo
echo "═══ หัวหน้าภาคยังจ่ายงานไม่ได้ เพราะยังไม่ถึงขั้นนั้น"
RR=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"team":"กระบี่"}')
echo "$RR" | grep -q "ยังไม่ถึงขั้นนี้" && pass "จ่ายงานไม่ได้ระหว่างรออะไหล่" || fail "จ่ายงานได้ทั้งที่ของยังไม่มา: $RR"

echo
echo "═══ รอบ 2 — ของมาแล้ว ส่งมาเฉพาะตัวที่เพิ่งเข้า พร้อมใบเบิกใบใหม่"
RES=$(curl -s -X POST "localhost:4000/api/work-orders/$ID/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-ROUND-2\"}]}")
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "จ่ายงาน" && pass "ของครบแล้วเดินต่อไปขั้นจ่ายงาน" || fail "ไม่เดินต่อ: $(st $ID)"
echo "$RES" | J 'd.waitingParts.find(p=>p.partCode==="SP-BOARD").requisitionNo==="RQ-ROUND-1"?"ok":"bad"' | grep -q ok \
  && pass "ใบเบิกรอบแรกไม่ถูกเขียนทับ" || fail "ใบเบิกรอบแรกหายหรือถูกทับ"
echo "$RES" | J 'd.waitingParts.find(p=>p.partCode==="SP-BELT").requisitionNo==="RQ-ROUND-2"?"ok":"bad"' | grep -q ok \
  && pass "ตัวที่เพิ่งมาได้ใบเบิกใบใหม่ของตัวเอง" || fail "ใบเบิกรอบสองไม่ถูกบันทึก"

echo
echo "═══ ตัวที่ยังไม่เคยเช็ค ยังบังคับให้ตอบครบเหมือนเดิม"
WO2=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W62","symptom":"ทดสอบตอบไม่ครบ"}]}')
ID2=$(echo "$WO2" | J 'd.orders[0].id')
curl -s -X POST "localhost:4000/api/work-orders/$ID2/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":1}]}" >/dev/null
RR=$(curl -s -X POST "localhost:4000/api/work-orders/$ID2/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-X\"}]}")
echo "$RR" | grep -q "ต้องเช็คให้ครบ" && pass "ตอบไม่ครบยังถูกปฏิเสธ" || fail "รับทั้งที่ตอบไม่ครบ: $RR"

echo
echo "═══ ของครบตั้งแต่รอบแรก เดินต่อทันทีเหมือนเดิม"
WO3=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W63","symptom":"ของครบ"}]}')
ID3=$(echo "$WO3" | J 'd.orders[0].id')
curl -s -X POST "localhost:4000/api/work-orders/$ID3/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1}]}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID3/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-OK\"}]}" >/dev/null
st $ID3 | grep -q "จ่ายงาน" && pass "ของครบรอบเดียวยังเดินต่อทันที" || fail "ของครบแล้วไม่เดินต่อ: $(st $ID3)"

echo
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J '"ประวัติ: "+d.logs.filter(l=>l.action==="PARTS_CHECKED").map(l=>l.note).reverse().join(" || ")'
echo "IDS=$ID,$ID2,$ID3"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
