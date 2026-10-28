#!/bin/bash
# ทดสอบ: ของหมด = ใบค้างที่แอดมินขั้นเช็คอะไหล่จนของเข้าครบ แล้วค่อยส่งหัวหน้าภาคนัด (นัดลูกค้าก่อนเบิก ต.ค. 69)
#        ของไม่พอตอนเบิก → กลับไปเช็คอะไหล่ วันนัดล้าง · ของอยู่คลังอื่นนัดล่วงหน้า 7 วัน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { psql "${DATABASE_URL%%\?*}" -tAc "$1"; }
st() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }
parts() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.waitingParts.map(p=>p.partCode+" "+(p.inStock===null?"ยังไม่เช็ค":p.inStock?"มีของ@"+p.warehouse:"หมด")+" ใบเบิก="+(p.requisitionNo||"-")).join(" · ")'; }
post() { curl -s -X POST "localhost:4000/api/work-orders/$1/$2" -H "$(H ${4:-$A})" -H 'Content-Type: application/json' -d "$3"; }
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }

PP=$(curl -s "localhost:4000/api/spare-parts?search=SP-" -H "$(H $A)")
BOARD=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
R=$(curl -s "localhost:4000/api/branches?search=C0006" -H "$(H $A)" | J 'd[0].region')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
L94="คลังลาดพร้าว 94"

echo "═══ เปิดใบงาน ขออะไหล่สองตัว"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W61","symptom":"ทดสอบของหมด"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
echo "  $(echo "$WO" | J 'd.orders[0].code') (id=$ID)"
post $ID parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" $S >/dev/null
TEAM=$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.suggestedTeam')
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ระบุอะไหล่แล้วไปแอดมินเช็คอะไหล่ (ยังไม่เบิก)" || fail "หลังระบุอะไหล่: $(st $ID)"

echo
echo "═══ เช็ครอบ 1 — บอร์ดมีของ สายพานหมด"
RR=$(post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true},{\"sparePartId\":$BELT,\"inStock\":false}]}")
echo "$RR" | grep -q "ต้องบอกด้วยว่าอยู่คลังไหน" && pass "มีของแต่ไม่บอกคลัง ถูกปฏิเสธ (หัวหน้าภาคต้องรู้ว่าต้องโอนไหม)" || fail "รับทั้งที่ไม่บอกคลัง: $RR"
RR=$(post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"}]}")
echo "$RR" | grep -q "ยังไม่ได้บอกว่ามีหรือหมด" && pass "ตอบไม่ครบทุกตัว ถูกปฏิเสธ" || fail "รับทั้งที่ตอบไม่ครบ: $RR"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":false}],\"expectedAt\":\"2026-11-20\"}" >/dev/null
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ของหมด ใบงานค้างอยู่ที่แอดมิน ไม่ส่งหัวหน้าภาคนัด" || fail "ส่งต่อไปแล้วทั้งที่ของยังไม่มา: $(st $ID)"
st $ID | grep -q "รออะไหล่" && pass "สถานะขึ้นว่ารออะไหล่" || fail "สถานะไม่ขึ้นรออะไหล่: $(st $ID)"
[ "$(DB "select \"partsExpectedAt\"::date from \"WorkOrder\" where id=$ID")" = "2026-11-20" ] && pass "จำวันคาดว่าของเข้า" || fail "วันคาดว่าของเข้าไม่ถูกบันทึก"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^OUT$" \
  && pass "การ์ดในรายการขึ้นป้าย อะไหล่หมด" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ OUT"

echo
echo "═══ หัวหน้าภาคยังนัดไม่ได้ เพราะยังไม่ถึงขั้นนั้น"
RR=$(post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 10)\"}" $S)
echo "$RR" | grep -q "ยังไม่ถึงขั้นนี้" && pass "นัดไม่ได้ระหว่างรออะไหล่" || fail "นัดได้ทั้งที่ของยังไม่มา: $RR"
RR=$(post $ID parts-short "{\"sparePartIds\":[$BELT]}")
echo "$RR" | grep -q "ยังไม่ถึงขั้นนี้" && pass "แจ้งของไม่พอได้เฉพาะขั้นเบิก" || fail "แจ้งของไม่พอได้ที่ขั้นเช็ค: $RR"

echo
echo "═══ เช็ครอบ 2 — ของเข้าครบ ส่งหัวหน้าภาคนัด"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
echo "  $(st $ID)"
st $ID | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ของครบแล้วไปหัวหน้าภาคนัดวันเข้า (สาขา C ไม่ต้องเสนอราคา)" || fail "ไม่เดินต่อ: $(st $ID)"
[ -z "$(DB "select \"partsExpectedAt\" from \"WorkOrder\" where id=$ID")" ] && pass "ของเข้าครบแล้ว ล้างวันคาดว่าของเข้า" || fail "วันคาดว่าของเข้ายังค้าง"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID and \"requisitionNo\" is not null")" = "0" ] && pass "ยังไม่มีใบเบิก (เบิกหลังลูกค้าคอนเฟิร์ม)" || fail "มีใบเบิกก่อนนัด"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^READY$" \
  && pass "การ์ดขึ้นป้าย อะไหล่ครบ · ยังไม่เบิก" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ READY"

echo
echo "═══ นัด → ลูกค้าคอนเฟิร์ม → ถึงขั้นเบิก แต่ของถูกงานอื่นใช้ไปแล้ว"
post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 3)\",\"scheduledTime\":\"09:00\"}" $S >/dev/null
st $ID | grep -q "คอนเฟิร์ม" && pass "ของคลัง 94 ทั้งหมด นัดภายใน 7 วันได้" || fail "หลังนัด: $(st $ID)"
post $ID confirm-appointment '{}' >/dev/null
st $ID | grep -q "^แอดมิน · เบิกอะไหล่" && pass "คอนเฟิร์มแล้วไปแอดมินเบิกอะไหล่" || fail "หลังคอนเฟิร์ม: $(st $ID)"
RR=$(post $ID parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-1\"},{\"sparePartId\":$BELT,\"inStock\":false}]}")
echo "$RR" | grep -q "ของไม่พอ" && pass "เบิกไม่ครบโดยไม่แยกใบ ถูกปฏิเสธ — ให้ใช้ปุ่มของไม่พอ" || fail "เบิกไม่ครบแล้วผ่าน: $RR"
RR=$(post $ID parts-short "{\"sparePartIds\":[$BELT],\"expectedAt\":\"2026-11-25\",\"note\":\"งานด่วนอีกใบใช้ไป\"}")
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "^แอดมิน · เช็คอะไหล่" && pass "ของไม่พอ — ใบกลับไปแอดมินขั้นเช็คอะไหล่ รอของเข้า" || fail "หลังแจ้งของไม่พอ: $(st $ID)"
st $ID | grep -q "รออะไหล่" && pass "สถานะกลับเป็นรออะไหล่" || fail "สถานะ: $(st $ID)"
[ "$(DB "select coalesce(\"scheduledAt\"::text,'-')||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"appointmentStatus\"::text,'-') from \"WorkOrder\" where id=$ID")" = "-|-|-" ] \
  && pass "วันนัด/ทีม/คอนเฟิร์มเดิมล้างทิ้ง (ไม่ค้างบนแผนงาน)" || fail "นัดเดิมยังค้าง: $(DB "select \"scheduledAt\",\"assignedTeam\",\"appointmentStatus\" from \"WorkOrder\" where id=$ID")"
[ "$(DB "select \"inStock\"::text||'|'||coalesce(warehouse,'-') from \"WorkOrderPart\" where \"workOrderId\"=$ID and \"sparePartId\"=$BOARD")" = "true|$L94" ] \
  && pass "ตัวที่ยังมีของ ผลเช็คเดิมไม่หาย" || fail "ผลเช็คบอร์ดหาย"
[ "$(DB "select \"partsExpectedAt\"::date from \"WorkOrder\" where id=$ID")" = "2026-11-25" ] && pass "จำวันคาดว่าของเข้ารอบใหม่" || fail "ไม่จำวันคาดว่าของเข้า"
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.logs[0].action+"|"+d.logs[0].note.replace(/\n/g," ")' | grep -q "^PARTS_SHORT|.*SP-BELT.*งานด่วนอีกใบใช้ไป" \
  && pass "ประวัติบันทึกว่าของไม่พอ ตัวไหน และเหตุผล" || fail "ประวัติ: $(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J 'd.logs[0].action+"|"+d.logs[0].note')"

echo
echo "═══ ของเข้าอีกรอบ → นัดใหม่ → คอนเฟิร์ม → เบิกครบ"
post $ID parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
post $ID assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 5)\"}" $S >/dev/null
post $ID confirm-appointment '{}' >/dev/null
RES=$(post $ID parts-check "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-1\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ROUND-2\"}]}")
echo "  $(st $ID)"
echo "  $(parts $ID)"
st $ID | grep -q "ปล่อยงาน" && pass "เบิกครบ ลูกค้าคอนเฟิร์มแล้ว → หัวหน้าภาคปล่อยงาน" || fail "หลังเบิก: $(st $ID)"
echo "$RES" | J 'd.waitingParts.map(p=>p.partCode+"="+p.requisitionNo).sort().join(",")' | grep -q "^SP-BELT=RQ-ROUND-2,SP-BOARD=RQ-ROUND-1$" \
  && pass "แต่ละตัวได้เลขใบเบิกของตัวเอง" || fail "เลขใบเบิก: $(echo "$RES" | J 'd.waitingParts.map(p=>p.partCode+"="+p.requisitionNo).join(",")')"
curl -s "localhost:4000/api/work-orders?search=W61" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID'); r.partsState' | grep -q "^ISSUED$" \
  && pass "การ์ดขึ้นป้าย เบิกแล้ว" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ ISSUED"

echo
echo "═══ ของอยู่คลังอื่น — นัดล่วงหน้าอย่างน้อย 7 วัน (เผื่อเบิก/โอน)"
WO3=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W63","symptom":"ของคลังอื่น"}]}')
ID3=$(echo "$WO3" | J 'd.orders[0].id')
post $ID3 parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1}]}" $S >/dev/null
post $ID3 parts-sourcing "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"คลังภูเก็ต\"}]}" >/dev/null
st $ID3 | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ของครบรอบเดียว ส่งหัวหน้าภาคนัดทันที" || fail "ของครบแล้วไม่เดินต่อ: $(st $ID3)"
curl -s "localhost:4000/api/work-orders?search=W63" -H "$(H $A)" | J 'const r=(d.rows||d).find(x=>x.id==='$ID3'); r.partsState' | grep -q "^TRANSFER$" \
  && pass "การ์ดขึ้นป้าย อะไหล่ครบ · ต้องโอน" || fail "ป้ายอะไหล่บนการ์ดไม่ใช่ TRANSFER"
RR=$(post $ID3 assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 2)\"}" $S)
echo "$RR" | grep -q "คลังภูเก็ต.*ล่วงหน้า 7 วัน" && pass "นัดเร็วกว่า 7 วัน ถูกปฏิเสธ พร้อมบอกวันแรกที่นัดได้" || fail "นัดเร็วได้: $RR"
post $ID3 assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$(day 8)\"}" $S >/dev/null
st $ID3 | grep -q "คอนเฟิร์ม" && pass "นัดหลัง 7 วันได้" || fail "นัด +8 วันไม่ผ่าน: $(st $ID3)"
RR=$(post $ID3 confirm-appointment "{\"scheduledAt\":\"$(day 3)\"}")
echo "$RR" | grep -q "ล่วงหน้า 7 วัน" && pass "ลูกค้าขอเลื่อนเข้ามาเร็วกว่า 7 วัน ถูกปฏิเสธเหมือนกัน" || fail "เลื่อนเร็วได้: $RR"
post $ID3 confirm-appointment "{\"scheduledAt\":\"$(day 9)\"}" >/dev/null
st $ID3 | grep -q "^แอดมิน · เบิกอะไหล่" && pass "เลื่อนออกไปได้ แล้วไปขั้นเบิก" || fail "หลังเลื่อน: $(st $ID3)"

echo
curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)" | J '"ประวัติ: "+d.logs.filter(l=>/PARTS_/.test(l.action)).map(l=>l.action).reverse().join(" → ")'
echo "IDS=$ID,$ID3"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
