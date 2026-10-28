#!/bin/bash
# ทดสอบ: ช่างปิดงานไม่ได้ → ส่งกลับหัวหน้าภาค ข้อมูลเดิมอยู่ครบ แก้ได้ทั้งหมด แล้วเดินต่อตามที่แก้
#   · หมวดเหตุ · อะไหล่ที่เบิกแล้วไม่หาย · ไม่มีตัวใหม่ = ข้ามเช็คคลังไปนัดวัน · ตัวที่ขอซ้ำ = เช็ค → นัด → เบิกใหม่
#   · แก้ผู้ติดต่อ/เรื่อง/ความเร่งด่วนได้ · แก้รายการอะไหล่ไม่ล้างผลเช็คตัวที่ไม่เปลี่ยน
#   · ใบเก่าที่ข้ามรอแอดมินเช็คอะไหล่ ย้อนกลับไปขั้นนั้นได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$1" -H "$(H $A)"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
status() { DB "select status from \"WorkOrder\" where id=$1"; }
parts() { DB "select string_agg(s.\"partCode\"||':'||coalesce(p.\"inStock\"::text,'-')||':'||coalesce(p.\"requisitionNo\",'-'),' ' order by s.\"partCode\") from \"WorkOrderPart\" p join \"SparePart\" s on s.id=p.\"sparePartId\" where p.\"workOrderId\"=$1 and p.kind='WAITING'"; }

PP=$(GET "spare-parts?search=SP-")
BOARD=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BOARD").id')
BELT=$(echo "$PP" | J 'const a=Array.isArray(d)?d:d.rows; a.find(x=>x.partCode==="SP-BELT").id')
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
OLDR=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
BR=$(GET "branches?search=C0006")
R=$(echo "$BR" | J 'd[0].region'); TEAM=$(echo "$BR" | J 'd[0].zone')
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
S=$(login S001)
L94="คลังลาดพร้าว 94"
toWork() {  # PARTS_CHECKED → IN_PROGRESS · ตัวที่ยังไม่เบิก เบิกหลังลูกค้าคอนเฟิร์ม (เลขใบเบิก $2)
  POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-10\"}" >/dev/null
  POST $A "work-orders/$1/confirm-appointment" '{}' >/dev/null
  if [ "$(status $1)" = "PARTS_REQUESTED" ]; then
    local res=$(DB "select string_agg('{\"sparePartId\":'||\"sparePartId\"||',\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"$2\"}', ',') from \"WorkOrderPart\" where \"workOrderId\"=$1 and kind='WAITING' and \"requisitionNo\" is null")
    POST $A "work-orders/$1/parts-check" "{\"results\":[$res]}" >/dev/null
  fi
  POST $S "work-orders/$1/dispatch" '{}' >/dev/null
}

echo "═══ เตรียมใบงาน: บอร์ด + สายพาน เบิกแล้ว ช่างเข้างาน"
WO=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactName":"คุณเดิม","contactPhone":"081-111-1111","machines":[{"code":"W81","symptom":"ทดสอบส่งกลับ"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":true,\"warehouse\":\"$L94\"},{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
toWork $ID RQ-SB1
[ "$(status $ID)" = "IN_PROGRESS" ] && pass "ใบงานถึงขั้นช่างเข้างาน" || fail "เตรียมไม่ถึง: $(status $ID)"

echo
echo "═══ ส่งกลับด้วยเหตุร้านปิด — ไม่เกี่ยวกับอะไหล่"
R=$(POST $A "work-orders/$ID/reassess-parts" '{"reasonCode":"XYZ","reason":"ทดสอบ"}')
echo "$R" | grep -q "error" && [ "$(status $ID)" = "IN_PROGRESS" ] && pass "หมวดเหตุที่ไม่รู้จักถูกปฏิเสธ" || fail "รับหมวดแปลก: $R"
POST $A "work-orders/$ID/reassess-parts" '{"reasonCode":"SHOP","reason":"ไปถึงร้านปิด โทรไม่ติด"}' >/dev/null
# ร้านปิด → แอดมินนัดใหม่ ทีมเดิม อะไหล่เดิม (เจ้าของงานเลือก ต.ค. 69 — เดิมกลับขั้นแรกทุกเหตุผล)
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$ID")" = "AWAITING_CONFIRM|PENDING|$TEAM" ] \
  && pass "ร้านปิด → แอดมินคอนเฟิร์มลูกค้าใหม่ ทีมเดิม (ไม่กลับขั้นแรก)" || fail "สถานะ: $(status $ID)"
[ "$(parts $ID)" = "SP-BELT:true:RQ-SB1 SP-BOARD:true:RQ-SB1" ] && pass "อะไหล่ที่เบิกแล้วอยู่ครบ พร้อมเลขใบเบิก (ฐานข้อมูล)" || fail "อะไหล่: $(parts $ID)"
[ "$(DB "select coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$ID")" = "$TEAM" ] && pass "ทีมเดิมยังอยู่" || fail "ทีมหาย"
GET "work-orders/$ID" | J 'd.logs.filter(l=>l.action==="PARTS_ROLLBACK").map(l=>l.note).join("\n")' | grep -q "^\[ร้านปิด / ลูกค้าไม่สะดวก\] ไปถึงร้านปิด" \
  && pass "ประวัติขึ้นหมวดเหตุนำหน้า" || fail "ประวัติไม่มีหมวด"
GET "work-orders/options" | J 'd.sendBackReasons.length' | grep -q "^5$" && pass "รายการหมวดเหตุส่งไปให้แอป" || fail "options ไม่มีหมวดเหตุ"

echo
echo "═══ เครื่องมือ/คนไม่พอ → หัวหน้าภาคนัดวันใหม่"
POST $A "work-orders/$ID/confirm-appointment" '{"scheduledAt":"2026-11-12"}' >/dev/null
[ "$(status $ID)" = "ASSIGNED" ] && pass "อะไหล่เบิกไว้แล้ว คอนเฟิร์มวันใหม่แล้วไปปล่อยงานเลย ไม่เบิกซ้ำ" || fail "หลังคอนเฟิร์มใหม่: $(status $ID)"
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
POST $A "work-orders/$ID/reassess-parts" '{"reasonCode":"RESOURCES","reason":"บันไดไม่พอ ต้องไปสองคน"}' >/dev/null
[ "$(DB "select status||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::text,'-') from \"WorkOrder\" where id=$ID")" = "PARTS_CHECKED|-|-" ] \
  && [ "$(parts $ID)" = "SP-BELT:true:RQ-SB1 SP-BOARD:true:RQ-SB1" ] && pass "ไปรอหัวหน้าภาคนัดวันใหม่ (ล้างทีม/วัน) อะไหล่ที่เบิกแล้วอยู่ครบ" || fail "RESOURCES: $(status $ID)"

echo
echo "═══ ต้องตรวจเพิ่ม → กลับไปหัวหน้าภาคระบุอะไหล่"
toWork $ID
POST $A "work-orders/$ID/reassess-parts" '{"reasonCode":"INSPECT","reason":"ยังหาสาเหตุไม่เจอ"}' >/dev/null
[ "$(status $ID)" = "NEW" ] && pass "เด้งกลับไปที่หัวหน้าภาค" || fail "สถานะ: $(status $ID)"

echo
echo "═══ หัวหน้าภาคแก้รายละเอียดทั้งหมด"
# อะไหล่ไม่ส่งทางนี้แล้ว (ตรวจระบบ ต.ค. 69) — เปลี่ยนอะไหล่ผ่านขั้นระบุอะไหล่ข้างล่าง เหมือนที่แอปทำ
curl -s -X PATCH "localhost:4000/api/work-orders/$ID" -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"title\":\"เครื่อง W81 ไม่ปั่น (นัดใหม่)\",\"priority\":\"URGENT\",\"contactName\":\"คุณใหม่\",\"contactPhone\":\"089-999-9999\"}" >/dev/null
[ "$(DB "select title||'|'||priority||'|'||\"contactName\"||'|'||\"contactPhone\" from \"WorkOrder\" where id=$ID")" = "เครื่อง W81 ไม่ปั่น (นัดใหม่)|URGENT|คุณใหม่|089-999-9999" ] \
  && pass "แก้เรื่อง ความเร่งด่วน ผู้ติดต่อได้ (ฐานข้อมูล)" || fail "แก้ไม่ติด"
[ "$(parts $ID)" = "SP-BELT:true:RQ-SB1 SP-BOARD:true:RQ-SB1" ] && pass "แก้ใบงานโดยรายการอะไหล่ไม่เปลี่ยน ผลเช็คไม่หาย" || fail "ผลเช็คหาย: $(parts $ID)"

echo
echo "═══ ยืนยันอะไหล่ชุดเดิม — เบิกแล้วทุกตัว ข้ามเช็คอะไหล่"
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
[ "$(status $ID)" = "PARTS_CHECKED" ] && pass "ไปขั้นนัดวันเข้าเลย ไม่ต้องให้แอดมินเช็คซ้ำ" || fail "สถานะ: $(status $ID)"

echo
echo "═══ รอบสอง: สายพานที่ได้ไปใช้ไม่ได้ ขอเบิกใหม่"
toWork $ID
POST $A "work-orders/$ID/reassess-parts" "{\"reasonCode\":\"PARTS\",\"reason\":\"สายพานที่ได้ไปผิดรุ่น\",\"parts\":[{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
[ "$(parts $ID)" = "SP-BELT:-:- SP-BOARD:true:RQ-SB1" ] && pass "ตัวที่ขอซ้ำต้องเบิกใหม่ ตัวอื่นยังเบิกแล้ว" || fail "อะไหล่: $(parts $ID)"
GET "work-orders/$ID" | J 'd.logs.find(l=>l.action==="PARTS_ROLLBACK").note' | grep -q "ใบเบิกเดิม RQ-SB1" && pass "เลขใบเบิกเดิมลงประวัติไว้" || fail "ประวัติไม่มีใบเบิกเดิม"
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
[ "$(status $ID)" = "PARTS_SOURCING" ] && pass "มีตัวต้องเบิกใหม่ → ไปแอดมินเช็คอะไหล่" || fail "สถานะ: $(status $ID)"
R=$(POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\"}]}")
[ "$(status $ID)" = "PARTS_CHECKED" ] && pass "แอดมินเช็คเฉพาะตัวใหม่ แล้วส่งหัวหน้าภาคนัด" || fail "หลังเช็ค: $(status $ID) $R"
POST $S "work-orders/$ID/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-14\"}" >/dev/null
POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
[ "$(status $ID)" = "PARTS_REQUESTED" ] && pass "คอนเฟิร์มแล้วไปเบิกตัวใหม่" || fail "หลังคอนเฟิร์ม: $(status $ID)"
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$BELT,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-SB2\"}]}" >/dev/null
[ "$(status $ID)" = "ASSIGNED" ] && [ "$(parts $ID)" = "SP-BELT:true:RQ-SB2 SP-BOARD:true:RQ-SB1" ] \
  && pass "เบิกเฉพาะตัวใหม่ แล้วไปปล่อยงาน · บอร์ดยังเป็นใบเบิกเดิม" || fail "หลังเบิก: $(status $ID) $(parts $ID)"

echo
echo "═══ ใบเก่าที่ข้ามรอแอดมินเช็คอะไหล่ ย้อนกลับไปขั้นนั้นได้"
CUT=$(date -u -d '3 years ago' +%Y-%m-%d)
DOLD=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null and \"openedAt\" < '$CUT' and region is not null order by \"openedAt\" limit 1")
if [ -n "$DOLD" ]; then
  R2=$(GET "branches?search=$DOLD" | J 'd[0].region')
  curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R2\"}" >/dev/null
  S=$(login S001)
  W2=$(POST $A work-orders "{\"branchCode\":\"$DOLD\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W82\",\"model\":\"Oasis\",\"symptom\":\"ทดสอบย้อน\"}]}")
  ID2=$(echo "$W2" | J 'd.orders[0].id')
  POST $S "work-orders/$ID2/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1}]}" >/dev/null
  # จำลองใบเก่า: ไปเสนอราคาตรง ๆ ไม่มีประวัติรอแอดมินเช็คอะไหล่
  DB "update \"WorkOrder\" set status='AWAITING_QUOTE' where id=$ID2" >/dev/null
  POST $A "work-orders/$ID2/rollback" '{"toStage":"PARTS_SOURCING","reason":"เช็คหลังบ้านแล้วของหมด"}' >/dev/null
  [ "$(status $ID2)" = "PARTS_SOURCING" ] && pass "ย้อนจากรอเสนอราคา ไปรอแอดมินเช็คอะไหล่ได้" || fail "ย้อนไม่ได้: $(status $ID2)"
  POST $A "work-orders/$ID2/parts-sourcing" "{\"results\":[{\"sparePartId\":$BOARD,\"inStock\":false}],\"expectedAt\":\"2026-11-25\"}" >/dev/null
  [ "$(GET "work-orders?status=ALL&search=$(DB "select code from \"WorkOrder\" where id=$ID2")" | J "(d.rows||d).find(r=>r.id===$ID2).partsOut")" = "1" ] \
    && pass "ตอบว่าหมด → ขึ้นป้ายแดงอะไหล่หมด" || fail "ไม่ขึ้นอะไหล่หมด"
else
  echo "ข้าม — ไม่มีสาขา D ที่หมดประกัน"
fi

curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$OLDR\"}" >/dev/null
for i in $ID ${ID2:-}; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"; done
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
