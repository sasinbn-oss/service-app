#!/bin/bash
# ทดสอบ: ประกันนับจากเปิดร้าน (3 ปี · Oasis 2 ปี) · รอแอดมินเช็คอะไหล่ (เช็คของก่อนเสนอราคา) ·
#        เสนอราคาและรับเงินมาก่อนนัด · เบิกอะไหล่หลังลูกค้าคอนเฟิร์มวัน (นัดลูกค้าก่อนเบิก ต.ค. 69)
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
# รอแอดมินเช็คอะไหล่ — ตอบว่ามีครบ (คลัง 94) แล้วไปเสนอราคา / นัดวัน
source_ok() { curl -s -X POST "localhost:4000/api/work-orders/$1/parts-sourcing" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}"; }
st() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
# วันนัดหลังลูกค้าจ่ายเงิน (วันที่คาดว่าของเข้าไม่ใช่วันนัด ไม่ถูกกฎนี้ — ใช้วันตายตัวต่อได้)
D1=$(day 7)

PID=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')

# เปิดใบงานแล้วให้หัวหน้าภาคระบุอะไหล่ — หยุดตรงนั้น ที่เหลือแต่ละเทสต์เดินเอง
prep() {  # $1=branchCode  $2=needsParts(yes|no)
  local R=$(curl -s "localhost:4000/api/branches?search=$1" -H "$(H $A)" | J 'd[0].region')
  curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$R\"}" >/dev/null
  local WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
    -d "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W71\",\"model\":\"Oasis\",\"capacityKg\":13,\"symptom\":\"ทดสอบเสนอราคา\"}]}")
  local ID=$(echo "$WO" | J 'd.orders?d.orders[0].id:d.id')
  if [ "$2" = "yes" ]; then
    curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
      -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
  else
    curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' -d '{"needsParts":false}' >/dev/null
  fi
  echo "$ID"
}
checkparts() {  # เบิกอะไหล่
  curl -s -X POST "localhost:4000/api/work-orders/$1/parts-check" -H "$(H $A)" -H 'Content-Type: application/json' \
    -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-900\"}]}"
}

# หาสาขาแฟรนไชส์คนละฝั่งของเส้น 3 ปี — ถามผ่าน Prisma ของโปรเจกต์
# ไม่ใช่ psql ที่ต้องรู้รหัสผ่านฐานข้อมูล จะได้รันได้ทุกเครื่องที่รันโปรเจกต์ได้
CUT=$(node -pe 'const d=new Date();d.setFullYear(d.getFullYear()-3);d.toISOString().slice(0,10)')
PICK=$(cd "$SP/../backend" && node -e '
const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();
(async()=>{const cut=new Date(process.argv[1]);
const o=await p.branch.findFirst({where:{code:{startsWith:"D"},cancelledAt:null,openedAt:{lt:cut}},select:{code:true},orderBy:{openedAt:"asc"}});
const n=await p.branch.findFirst({where:{code:{startsWith:"D"},cancelledAt:null,openedAt:{gt:cut}},select:{code:true},orderBy:{openedAt:"desc"}});
console.log((o?o.code:"")+" "+(n?n.code:""));await p.$disconnect();})()' "$CUT")
DOLD=$(echo "$PICK" | awk '{print $1}')
DNEW=$(echo "$PICK" | awk '{print $2}')
if [ -z "$DOLD" ] || [ -z "$DNEW" ]; then
  echo "ข้ามทั้งชุด — ต้องมีสาขา D ทั้งที่หมดประกันและยังอยู่ในประกันในฐานข้อมูล"
  exit 0
fi

echo "═══ ประกันนับจากวันเปิดร้าน"
echo "  เส้นแบ่ง: $CUT · เปิดก่อนหน้านี้ = หมดประกัน"
B=$(curl -s "localhost:4000/api/branches?search=$DOLD" -H "$(H $A)")
echo "$B" | J '"  "+d[0].code+" เปิด "+String(d[0].openedAt).slice(0,10)+" → หมดประกัน "+String(d[0].warrantyExpiresAt).slice(0,10)'
# จำนวนปีขึ้นกับยี่ห้อ (เครื่องสาขานี้ถูกเลือกรุ่น Oasis ในรอบทดสอบก่อน ๆ = 2 ปี) — ไม่รู้ยี่ห้อ = 3 ปี
echo "$B" | J 'const b=d[0]; const y=(b.warranties[0]&&b.warranties[0].years)||3; const o=new Date(b.openedAt), w=new Date(b.warrantyExpiresAt); (w.getFullYear()-o.getFullYear()===y&&w.getMonth()===o.getMonth()&&w.getDate()===o.getDate())?"ok":"bad"' \
  | grep -q ok && pass "วันหมดประกัน = วันเปิดร้าน + ปีตามยี่ห้อพอดี" || fail "ปีไม่ตรงยี่ห้อ: $(echo "$B" | J 'JSON.stringify(d[0].warranties)')"
B2=$(curl -s "localhost:4000/api/branches?search=$DNEW" -H "$(H $A)")
echo "$B2" | J '"  "+d[0].code+" เปิด "+String(d[0].openedAt).slice(0,10)+" → หมดประกัน "+String(d[0].warrantyExpiresAt).slice(0,10)'
echo "$B2" | J 'd[0].warrantyExpiresAt?"ok":"bad"' | grep -q ok \
  && pass "สาขาที่ไม่เคยกรอกวันหมดประกันก็มีวันให้แล้ว" || fail "ยังไม่มีวันหมดประกัน"

echo
echo "═══ สาขา D หมดประกัน + ใช้อะไหล่ → รอแอดมินเช็คอะไหล่ (เช็คของก่อน) แล้วค่อยเสนอราคา"
ID1=$(prep "$DOLD" yes)
echo "  $(st $ID1)"
[ "$(DB "select status||'|'||coalesce(\"workStatus\",'-') from \"WorkOrder\" where id=$ID1")" = "PARTS_SOURCING|CHECKING_PARTS" ] \
  && pass "ระบุอะไหล่เสร็จเข้าขั้นรอแอดมินเช็คอะไหล่ก่อนเสนอราคา · สถานะ \"รอแอดมินเช็คอะไหล่\" (ยังไม่มีใครบอกว่าหมด)" || fail "ไม่เข้าขั้นรอแอดมินเช็คอะไหล่: $(st $ID1)"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ยังไม่ถึงขั้นนี้" && pass "ยังไม่เช็คอะไหล่ เสนอราคาไม่ได้" || fail "เสนอราคาได้ก่อนเช็คอะไหล่: $R"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/parts-sourcing" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}]}")
[ "$(DB "select status from \"WorkOrder\" where id=$ID1")" = "PARTS_SOURCING" ] && echo "$R" | grep -q "error" \
  && pass "หัวหน้าภาคกดขั้นรอแอดมินเช็คอะไหล่ไม่ได้ (ขั้นของแอดมิน)" || fail "หัวหน้าภาคกดได้: $R"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/parts-sourcing" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"results":[{"sparePartId":999999,"inStock":true}]}')
echo "$R" | grep -q "ยังไม่ได้บอกว่ามีหรือหมด" && pass "ต้องตอบครบทุกตัว" || fail "ตอบไม่ครบผ่าน: $R"
curl -s -X POST "localhost:4000/api/work-orders/$ID1/parts-sourcing" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":false}],\"expectedAt\":\"2026-11-20\"}" >/dev/null
[ "$(DB "select w.status||'|'||to_char(w.\"partsExpectedAt\",'YYYY-MM-DD')||'|'||p.\"inStock\" from \"WorkOrder\" w join \"WorkOrderPart\" p on p.\"workOrderId\"=w.id and p.kind='WAITING' where w.id=$ID1")" = "PARTS_SOURCING|2026-11-20|false" ] \
  && pass "อะไหล่หมด → ค้างที่รอแอดมินเช็คอะไหล่ พร้อมวันที่คาดว่าของเข้า (ฐานข้อมูล)" || fail "หมดแล้วไม่ค้าง: $(st $ID1)"
[ "$(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")" = "WAITING_PARTS" ] \
  && pass "แอดมินตอบว่าหมด → สถานะเปลี่ยนเป็น \"รออะไหล่\" ตามที่ระบุจริง" || fail "ตอบหมดแล้วสถานะ: $(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")"
curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.logs[0].action+"|"+d.logs[0].note.replace(/\n/g," ")+"|"+d.partsExpectedAt.slice(0,10)' | grep -q "^PARTS_BACKORDERED|.*หมด: .*คาดว่าเข้า 2026-11-20.*|2026-11-20$" \
  && pass "ประวัติบอกตัวที่หมดและวันที่คาด · หน้าใบงานได้วันที่" || fail "ประวัติ: $(curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.logs[0].action+" "+d.logs[0].note')"
curl -s "localhost:4000/api/work-orders?filter=ALL" -H "$(H $A)" | J "(d.rows||d).find(r=>r.id===$ID1).partsExpectedAt" | grep -q "2026-11-20" \
  && pass "รายการใบงานได้วันที่คาดว่าของเข้า" || fail "รายการไม่มีวันที่คาด"
source_ok $ID1 | J 'd.statusLabel' | grep -q "แอดมิน · ส่งใบเสนอราคา" && pass "ของมาแล้ว ตอบว่ามีครบ → ไปเสนอราคา" || fail "มีครบแล้วไม่ไปเสนอราคา"
[ "$(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")" = "QUOTING" ] \
  && pass "ขั้นเสนอราคา สถานะ \"รอแอดมินส่งใบเสนอราคา\" (ไม่ใช่รอลูกค้าจ่ายเงิน — ลูกค้ายังไม่ได้ราคา)" || fail "สถานะขั้นเสนอราคา: $(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")"
[ "$(DB "select coalesce(to_char(w.\"partsExpectedAt\",'YYYY-MM-DD'),'-')||'|'||p.\"inStock\"||'|'||coalesce(p.\"requisitionNo\",'-') from \"WorkOrder\" w join \"WorkOrderPart\" p on p.\"workOrderId\"=w.id and p.kind='WAITING' where w.id=$ID1")" = "-|true|-" ] \
  && pass "ครบแล้วล้างวันที่คาด · ยังไม่มีเลขใบเบิก (เบิกจริงหลังรับเงิน)" || fail "หลังครบ: $(DB "select \"partsExpectedAt\" from \"WorkOrder\" where id=$ID1")"
curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.contactPhone==="081-234-5678"?"ok":"bad"' | grep -q ok \
  && pass "เก็บชื่อและเบอร์ผู้ติดต่อสาขาแล้ว" || fail "ไม่ได้เก็บผู้ติดต่อ"

echo
echo "═══ ยังไม่จ่ายเงิน เบิกอะไหล่ไม่ได้"
R=$(checkparts $ID1)
echo "$R" | grep -q "ยังไม่ถึงขั้นนี้" && pass "เบิกอะไหล่ก่อนจ่ายเงินไม่ได้" || fail "เบิกได้ทั้งที่ยังไม่จ่าย: $R"

echo
echo "═══ ยังไม่แนบใบเสนอราคา ส่งต่อไม่ได้"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ต้องแนบใบเสนอราคา" && pass "ไม่มีใบเสนอราคา ส่งต่อไม่ได้" || fail "ผ่านไปได้: $R"

echo
echo "═══ แนบใบเสนอราคาแล้วไปขั้นรอจ่ายเงิน"
# ใบเสนอราคาจากโปรแกรมบัญชีเป็น PDF — แนบตรง ๆ ได้ ไม่ต้องแคปเป็นรูป
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/attachments" -H "$(H $A)" -F "file=@$SP/quote-sample.pdf;type=application/pdf")
echo "$R" | grep -q "PDF แนบได้เฉพาะ" && pass "PDF ที่ไม่ใช่ใบเสนอราคา/บิล แนบเป็นรูปหน้างานไม่ได้" || fail "PDF เข้ากองรูปหน้างานได้: $R"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/attachments" -H "$(H $A)" \
  -F "file=@$SP/quote-sample.pdf;type=application/pdf" -F "role=QUOTE")
echo "$R" | J 'd.kind+"|"+d.role+"|"+d.mimeType' | grep -q "^DOCUMENT|QUOTE|application/pdf$" \
  && pass "แนบใบเสนอราคาเป็น PDF ได้" || fail "แนบ PDF ไม่ได้: $(echo $R | head -c 160)"
curl -s -X POST "localhost:4000/api/work-orders/$ID1/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
st $ID1 | grep -q "รอลูกค้าจ่ายเงิน" && pass "ไปขั้นรอลูกค้าจ่ายเงินแล้ว" || fail "ไม่ไปขั้นจ่ายเงิน: $(st $ID1)"

echo
echo "═══ ยังไม่แนบบิล ส่งต่อไม่ได้"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/payment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ต้องแนบบิล" && pass "ไม่มีบิล ส่งต่อไม่ได้" || fail "ผ่านไปได้: $R"

echo
echo "═══ จ่ายเงินแล้วไปนัดวัน → คอนเฟิร์มลูกค้า → ถึงเบิกอะไหล่ได้ (นัดลูกค้าก่อนเบิก)"
curl -s -X POST "localhost:4000/api/work-orders/$ID1/attachments" -H "$(H $A)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=RECEIPT" | J '"  แนบแล้ว: "+d.roleLabel'
curl -s -X POST "localhost:4000/api/work-orders/$ID1/payment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
echo "  $(st $ID1)"
st $ID1 | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "จ่ายเงินแล้วไปหัวหน้าภาคนัดวันเข้า (ยังไม่เบิก)" || fail "หลังจ่ายเงิน: $(st $ID1)"
R=$(checkparts $ID1)
echo "$R" | grep -q "ยังไม่ถึงขั้นนี้" && pass "ยังไม่คอนเฟิร์มลูกค้า เบิกอะไหล่ไม่ได้" || fail "เบิกได้ก่อนคอนเฟิร์ม: $R"
TEAM1=$(curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.suggestedTeam')
curl -s -X POST "localhost:4000/api/work-orders/$ID1/assign" -H "$(H $S)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM1\",\"scheduledAt\":\"$D1\"}" >/dev/null
curl -s -X POST "localhost:4000/api/work-orders/$ID1/confirm-appointment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
st $ID1 | grep -q "^แอดมิน · เบิกอะไหล่" && pass "ลูกค้าคอนเฟิร์มแล้วมาถึงขั้นเบิกอะไหล่" || fail "ไม่มาขั้นเบิกอะไหล่: $(st $ID1)"
[ "$(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")" = "CHECKING_PARTS" ] \
  && pass "ถึงขั้นเบิกอะไหล่ สถานะเป็น \"รอแอดมินเช็คอะไหล่\" ไม่ใช่ \"รออะไหล่\"" || fail "สถานะขั้นเบิกอะไหล่: $(DB "select \"workStatus\" from \"WorkOrder\" where id=$ID1")"
checkparts $ID1 | J 'd.statusLabel' | grep -q "ปล่อยงาน" && pass "เบิกอะไหล่เสร็จไปหัวหน้าภาคปล่อยงาน" || fail "เบิกแล้วไม่ไปปล่อยงาน"
curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.logs.map(l=>l.action).reverse().join(" → ")' | sed 's/^/  ประวัติ: /'

echo
echo "═══ สาขา D ที่ยังอยู่ในประกัน (เปิดไม่ถึง 3 ปี) ไม่ต้องเสนอราคา"
ID2=$(prep "$DNEW" yes)
echo "  $DNEW → $(st $ID2)"
source_ok $ID2 | J 'd.statusLabel' | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ยังอยู่ในประกัน เช็คอะไหล่ครบแล้วข้ามเสนอราคาไปนัดวันเลย" || fail "ไม่ข้ามขั้นเสนอราคา: $(st $ID2)"

echo
echo "═══ สาขาบริษัท (C) ไม่ต้องผ่านขั้นเสนอราคา"
ID3=$(prep "C0006" yes)
source_ok $ID3 | J 'd.statusLabel' | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "สาขา C ข้ามขั้นเสนอราคา" || fail "สาขา C ไม่ควรเข้าขั้นเสนอราคา: $(st $ID3)"

echo
echo "═══ งานที่ไม่ใช้อะไหล่ ข้ามทั้งเสนอราคาและเบิกอะไหล่"
ID4=$(prep "$DOLD" no)
st $ID4 | grep -q "นัดวันเข้า" && pass "ไม่ใช้อะไหล่ ข้ามไปนัดวันเลย" || fail "ไม่ข้าม: $(st $ID4)"

echo
echo "═══ ข้ามขั้นเสนอราคาได้ แต่ต้องบอกเหตุผล และไปโผล่ที่นัดวันเข้า"
ID5=$(prep "$DOLD" yes)
source_ok $ID5 >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID5/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"skip":true}')
echo "$R" | grep -q "ต้องบอกเหตุผล" && pass "ข้ามโดยไม่บอกเหตุผลไม่ได้" || fail "ข้ามได้โดยไม่บอกเหตุผล"
curl -s -X POST "localhost:4000/api/work-orders/$ID5/quote" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"skip":true,"note":"ตกลงกับลูกค้าแล้วว่าบริษัทออกให้"}' >/dev/null
st $ID5 | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ข้ามพร้อมเหตุผลแล้วไปขั้นนัดวันเข้า" || fail "ข้ามแล้วไปผิดขั้น: $(st $ID5)"
curl -s "localhost:4000/api/work-orders/$ID5" -H "$(H $A)" | J '"  ประวัติ: "+d.logs.find(l=>l.action==="QUOTE_SKIPPED").note'

echo
echo "═══ ขั้นเสนอราคาเป็นของแอดมิน หัวหน้าภาคทำแทนไม่ได้"
ID6=$(prep "$DOLD" yes)
source_ok $ID6 >/dev/null
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID6/quote" -H "$(H $S)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ขั้นเสนอราคาเป็นของแอดมินเท่านั้น" || fail "หัวหน้าภาคทำได้: $R"

echo
echo "═══ ประกันตามยี่ห้อเครื่อง: Oasis 2 ปี · Huebsch 3 ปี"
# สาขาชั่วคราวที่เปิดมา 2 ปีครึ่ง มีทั้งสองยี่ห้อ — Oasis หมดแล้ว Huebsch ยังอยู่ในประกัน
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
BC="DZW$RANDOM"
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบประกันยี่ห้อ','$BC','ใต้','กระบี่','FRANCHISE',now()-interval '30 months')" >/dev/null
BID=$(DB "select id from \"Branch\" where code='$BC'")
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ($BID,'W1','WASHER','OASIS',now()),($BID,'W2','WASHER','HB - Huebsch',now())" >/dev/null
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"region":"ใต้"}' >/dev/null
brandWo() {  # $1=เครื่อง $2=รุ่นที่เลือกในฟอร์ม (ไม่ใส่ = X) → id ใบงานที่ระบุอะไหล่แล้ว
  local ID=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
    -d "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"$1\",\"model\":\"${2:-X}\",\"symptom\":\"ทดสอบประกันยี่ห้อ\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  curl -s -X POST "localhost:4000/api/work-orders/$ID/parts" -H "$(H $S)" -H 'Content-Type: application/json' \
    -d "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}]}" >/dev/null
  echo "$ID"
}
IDO=$(brandWo W1); IDH=$(brandWo W2)
# ทุกใบเช็คอะไหล่ก่อน — เสนอราคาหรือไม่ตัดสินตอนเช็คครบ
source_ok $IDO | J 'd.statusLabel' | grep -q "^แอดมิน · ส่งใบเสนอราคา" && pass "Oasis เปิดร้านมา 2 ปีครึ่ง = หมดประกัน → เช็คครบแล้วต้องเสนอราคา" || fail "Oasis: $(st $IDO)"
source_ok $IDH | J 'd.statusLabel' | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "Huebsch สาขาเดียวกัน = ยังอยู่ในประกัน → ข้ามเสนอราคา" || fail "Huebsch: $(st $IDH)"
curl -s "localhost:4000/api/work-orders/$IDO" -H "$(H $A)" | J '[d.branchWarrantyYears,d.branchWarrantyExpired].join()' | grep -q "^2,true$" \
  && pass "ใบงาน Oasis บอกว่าประกัน 2 ปี และหมดแล้ว" || fail "รายละเอียด Oasis: $(curl -s "localhost:4000/api/work-orders/$IDO" -H "$(H $A)" | J '[d.branchWarrantyYears,d.branchWarrantyExpired].join()')"
curl -s "localhost:4000/api/branches?search=$BC" -H "$(H $A)" | J 'const b=d[0]; const o=new Date(b.openedAt), w=new Date(b.warrantyExpiresAt); [b.warranties.map(x=>x.brand+":"+x.years).join("|"), w.getFullYear()-o.getFullYear()].join(" ")' \
  | grep -q "^OASIS:2|HB - Huebsch:3 2$" && pass "ค้นสาขาได้ประกันแยกยี่ห้อ · วันรวมใช้ตัวที่หมดเร็วสุด (Oasis)" || fail "สาขา: $(curl -s "localhost:4000/api/branches?search=$BC" -H "$(H $A)" | J 'JSON.stringify(d[0].warranties)')"
# ไฟล์รายงานเครื่องส่วนใหญ่ไม่มียี่ห้อ — เครื่องที่ช่องยี่ห้อว่างใช้ "รุ่นของเครื่อง" ที่เลือกตอนเปิดใบงานแทน
IDT=$(brandWo W3 "Oasis(TC)")
source_ok $IDT | J 'd.statusLabel' | grep -q "^แอดมิน · ส่งใบเสนอราคา" && pass "ไม่มียี่ห้อจากไฟล์ แต่เลือกรุ่น Oasis(TC) → นับ 2 ปี ต้องเสนอราคา" || fail "Oasis(TC): $(st $IDT)"
curl -s "localhost:4000/api/work-orders/$IDT" -H "$(H $A)" | J '[d.branchWarrantyYears,d.branchWarrantyBrand].join()' | grep -q "^2,Oasis(TC)$" \
  && pass "ใบงานบอกที่มา (Oasis(TC) 2 ปี)" || fail "ที่มา: $(curl -s "localhost:4000/api/work-orders/$IDT" -H "$(H $A)" | J '[d.branchWarrantyYears,d.branchWarrantyBrand].join()')"
IDT2=$(brandWo W4 "Huebsch")
source_ok $IDT2 | J 'd.statusLabel' | grep -q "^หัวหน้าภาค · นัดวันเข้า" && pass "ไม่มียี่ห้อจากไฟล์ เลือกรุ่น Huebsch → 3 ปี ยังอยู่ในประกัน" || fail "Huebsch รุ่น: $(st $IDT2)"
for i in $IDT $IDT2; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
echo
echo "═══ ป้ายประกันในรายการ (ติดตามเครื่องเสีย · ใบงานซ่อม)"
DB "insert into \"Outage\"(kind,\"branchId\",\"machineId\",\"startedAt\",\"lastSeenAt\") select 'MACHINE_OFF',$BID,id,now()-interval '2 hours',now() from \"Machine\" where \"branchId\"=$BID" >/dev/null
OUT() { curl -s "localhost:4000/api/machines/outages?search=$BC" -H "$(H $A)" | J 'd.rows.sort((a,b)=>a.machineCode.localeCompare(b.machineCode)).map(r=>r.machineCode+":"+r.warranty).join(" ")'; }
WOL() { curl -s "localhost:4000/api/work-orders?status=ALL&search=$BC" -H "$(H $A)" | J 'd.rows.filter(r=>['$IDO','$IDH'].includes(r.id)).sort((a,b)=>a.id-b.id).map(r=>r.warranty).join(" ")'; }
# W3 Oasis(TC) · W4 Huebsch มาจากเทสต์รุ่นด้านบน (ยี่ห้อว่าง ใช้รุ่นที่เลือกในฟอร์ม)
[ "$(OUT)" = "W1:OUT W2:IN W3:OUT W4:IN" ] && [ "$(WOL)" = "OUT IN" ] \
  && pass "เปิดร้าน 2 ปีครึ่ง: Oasis หมดประกัน · Huebsch ในประกัน — ทั้งหน้าติดตามเครื่องเสียและรายการใบงาน" || fail "ป้าย: $(OUT) / $(WOL)"
DB "update \"Branch\" set \"openedAt\"=now()-interval '35 months' where id=$BID" >/dev/null
[ "$(OUT)" = "W1:OUT W2:SOON W3:OUT W4:SOON" ] && pass "Huebsch เหลืออีกราวเดือนเดียว → ใกล้หมดประกัน (60 วัน)" || fail "ใกล้หมด: $(OUT)"
DB "update \"Branch\" set \"openedAt\"=null where id=$BID" >/dev/null
[ "$(OUT)" = "W1:UNKNOWN W2:UNKNOWN W3:UNKNOWN W4:UNKNOWN" ] && [ "$(WOL)" = "UNKNOWN UNKNOWN" ] && pass "ไม่รู้วันเปิดร้าน → ป้าย \"ไม่ทราบ\" (ไม่ใช่หมดประกัน)" || fail "ไม่ทราบ: $(OUT) / $(WOL)"
curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $A)" | J 'const c=d.rows.filter(r=>r.branchType==="COCO"); String(c.length>0 && c.every(r=>r.warranty===null))' | grep -q true \
  && pass "สาขาบริษัท (COCO) ไม่มีป้ายประกัน" || fail "COCO มีป้ายประกัน"
for i in $IDO $IDH; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
DB "delete from \"Machine\" where \"branchId\"=$BID; delete from \"Branch\" where id=$BID" >/dev/null

echo
echo "IDS=$ID1,$ID2,$ID3,$ID4,$ID5,$ID6"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
