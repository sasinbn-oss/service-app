#!/bin/bash
# ทดสอบ: ประกัน 3 ปีนับจากเปิดร้าน · เสนอราคาและรับเงินมาก่อนเบิกอะไหล่
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
st() { curl -s "localhost:4000/api/work-orders/$1" -H "$(H $A)" | J 'd.statusLabel+" / "+(d.workStatusLabel||"—")'; }

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
    -d "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-900\"}]}"
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

echo "═══ ประกัน 3 ปีนับจากวันเปิดร้าน"
echo "  เส้นแบ่ง: $CUT · เปิดก่อนหน้านี้ = หมดประกัน"
B=$(curl -s "localhost:4000/api/branches?search=$DOLD" -H "$(H $A)")
echo "$B" | J '"  "+d[0].code+" เปิด "+String(d[0].openedAt).slice(0,10)+" → หมดประกัน "+String(d[0].warrantyExpiresAt).slice(0,10)'
echo "$B" | J 'const b=d[0]; const o=new Date(b.openedAt), w=new Date(b.warrantyExpiresAt); (w.getFullYear()-o.getFullYear()===3&&w.getMonth()===o.getMonth()&&w.getDate()===o.getDate())?"ok":"bad"' \
  | grep -q ok && pass "วันหมดประกัน = วันเปิดร้าน + 3 ปีพอดี" || fail "ไม่ใช่ 3 ปีพอดี"
B2=$(curl -s "localhost:4000/api/branches?search=$DNEW" -H "$(H $A)")
echo "$B2" | J '"  "+d[0].code+" เปิด "+String(d[0].openedAt).slice(0,10)+" → หมดประกัน "+String(d[0].warrantyExpiresAt).slice(0,10)'
echo "$B2" | J 'd[0].warrantyExpiresAt?"ok":"bad"' | grep -q ok \
  && pass "สาขาที่ไม่เคยกรอกวันหมดประกันก็มีวันให้แล้ว" || fail "ยังไม่มีวันหมดประกัน"

echo
echo "═══ สาขา D หมดประกัน + ใช้อะไหล่ → เข้าขั้นเสนอราคาตั้งแต่ระบุอะไหล่เสร็จ"
ID1=$(prep "$DOLD" yes)
echo "  $(st $ID1)"
st $ID1 | grep -q "รอเสนอราคาลูกค้า" && pass "ระบุอะไหล่เสร็จเข้าขั้นเสนอราคาเลย ไม่ผ่านเบิกอะไหล่ก่อน" || fail "ไม่เข้าขั้นเสนอราคา"
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
curl -s -X POST "localhost:4000/api/work-orders/$ID1/attachments" -H "$(H $A)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=QUOTE" | J '"  แนบแล้ว: "+d.roleLabel'
curl -s -X POST "localhost:4000/api/work-orders/$ID1/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
st $ID1 | grep -q "รอลูกค้าจ่ายเงิน" && pass "ไปขั้นรอลูกค้าจ่ายเงินแล้ว" || fail "ไม่ไปขั้นจ่ายเงิน: $(st $ID1)"

echo
echo "═══ ยังไม่แนบบิล ส่งต่อไม่ได้"
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID1/payment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ต้องแนบบิล" && pass "ไม่มีบิล ส่งต่อไม่ได้" || fail "ผ่านไปได้: $R"

echo
echo "═══ จ่ายเงินแล้วถึงเบิกอะไหล่ได้"
curl -s -X POST "localhost:4000/api/work-orders/$ID1/attachments" -H "$(H $A)" \
  -F "file=@$SP/site-photo.png;type=image/png" -F "role=RECEIPT" | J '"  แนบแล้ว: "+d.roleLabel'
curl -s -X POST "localhost:4000/api/work-orders/$ID1/payment" -H "$(H $A)" -H 'Content-Type: application/json' -d '{}' >/dev/null
echo "  $(st $ID1)"
st $ID1 | grep -q "รอแอดมินเช็คอะไหล่" && pass "จ่ายเงินแล้วมาถึงขั้นเบิกอะไหล่" || fail "ไม่มาขั้นเบิกอะไหล่"
checkparts $ID1 | J 'd.statusLabel' | grep -q "จ่ายงาน" && pass "เบิกอะไหล่เสร็จไปขั้นจ่ายงาน" || fail "เบิกแล้วไม่ไปจ่ายงาน"
curl -s "localhost:4000/api/work-orders/$ID1" -H "$(H $A)" | J 'd.logs.map(l=>l.action).reverse().join(" → ")' | sed 's/^/  ประวัติ: /'

echo
echo "═══ สาขา D ที่ยังอยู่ในประกัน (เปิดไม่ถึง 3 ปี) ไม่ต้องเสนอราคา"
ID2=$(prep "$DNEW" yes)
echo "  $DNEW → $(st $ID2)"
st $ID2 | grep -q "รอแอดมินเช็คอะไหล่" && pass "ยังอยู่ในประกัน ข้ามขั้นเสนอราคาไปเบิกอะไหล่เลย" || fail "ไม่ข้ามขั้นเสนอราคา"

echo
echo "═══ สาขาบริษัท (C) ไม่ต้องผ่านขั้นเสนอราคา"
ID3=$(prep "C0006" yes)
st $ID3 | grep -q "รอแอดมินเช็คอะไหล่" && pass "สาขา C ข้ามขั้นเสนอราคา" || fail "สาขา C ไม่ควรเข้าขั้นเสนอราคา"

echo
echo "═══ งานที่ไม่ใช้อะไหล่ ข้ามทั้งเสนอราคาและเบิกอะไหล่"
ID4=$(prep "$DOLD" no)
st $ID4 | grep -q "จ่ายงาน" && pass "ไม่ใช้อะไหล่ ข้ามไปจ่ายงานเลย" || fail "ไม่ข้าม: $(st $ID4)"

echo
echo "═══ ข้ามขั้นเสนอราคาได้ แต่ต้องบอกเหตุผล และไปโผล่ที่เบิกอะไหล่"
ID5=$(prep "$DOLD" yes)
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID5/quote" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"skip":true}')
echo "$R" | grep -q "ต้องบอกเหตุผล" && pass "ข้ามโดยไม่บอกเหตุผลไม่ได้" || fail "ข้ามได้โดยไม่บอกเหตุผล"
curl -s -X POST "localhost:4000/api/work-orders/$ID5/quote" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"skip":true,"note":"ตกลงกับลูกค้าแล้วว่าบริษัทออกให้"}' >/dev/null
st $ID5 | grep -q "รอแอดมินเช็คอะไหล่" && pass "ข้ามพร้อมเหตุผลแล้วไปขั้นเบิกอะไหล่" || fail "ข้ามแล้วไปผิดขั้น: $(st $ID5)"
curl -s "localhost:4000/api/work-orders/$ID5" -H "$(H $A)" | J '"  ประวัติ: "+d.logs.find(l=>l.action==="QUOTE_SKIPPED").note'

echo
echo "═══ ขั้นเสนอราคาเป็นของแอดมิน หัวหน้าภาคทำแทนไม่ได้"
ID6=$(prep "$DOLD" yes)
R=$(curl -s -X POST "localhost:4000/api/work-orders/$ID6/quote" -H "$(H $S)" -H 'Content-Type: application/json' -d '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ขั้นเสนอราคาเป็นของแอดมินเท่านั้น" || fail "หัวหน้าภาคทำได้: $R"

echo
echo "IDS=$ID1,$ID2,$ID3,$ID4,$ID5,$ID6"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
