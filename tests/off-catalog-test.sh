#!/bin/bash
# ทดสอบ: อะไหล่นอกสโตร์ (ไม่มี SKU — เจ้าของงานขอ ต.ค. 69)
#   · หัวหน้าภาคระบุของในสโตร์ + นอกสโตร์ในใบเดียว / มีแต่นอกสโตร์ก็ได้ · ชื่อว่างไม่ได้
#   · แฟรนไชส์หมดประกัน → ยังผ่านขั้นเช็คอะไหล่/เสนอราคา · หน่วยกับหมายเหตุถูกเก็บ
#   · ชื่อเดียวกันข้ามใบงาน = แถวเดียวกัน · ไม่ขึ้นในรายการอะไหล่/ช่องค้นหา · ไม่ปนในรายงานอะไหล่ที่ต้องสั่ง
#   · เบิก: ของนอกสโตร์ "มี" ไม่ต้องมีคลัง/เลขใบเบิก (ของในสโตร์ยังต้อง) · แก้หมายเหตุอย่างเดียวผลเช็คไม่หาย
#   · ปิดงาน: ช่างเพิ่มของนอกสโตร์ได้ · ใช้แต่ของนอกสโตร์ไม่ต้องแนบใบเหลือง
#   · มีของนอกสโตร์/ค่าบริการ = เสนอราคาเสมอ แม้สาขาบริษัท (เจ้าของงานเลือก ต.ค. 69)
#   · ค่าบริการล้วน (ไม่ใช้อะไหล่): ตรงไปเสนอราคา → จ่ายเงิน → จ่ายงาน ไม่ค้างที่ขั้นเบิก — เช็คฐานข้อมูลทุกข้อ
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
A=$(login A001)
ME=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
PID=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
NAME1="สายพานมอเตอร์ทดสอบ 5PJ-1200"
NAME2="ค่าแรงเชื่อมท่อทดสอบ"
IDS=""
OUTS=""
cleanup() {
  for o in $OUTS; do DB "delete from \"Outage\" where id=$o" >/dev/null; done
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"SparePart\" where \"offCatalog\" and name like '%ทดสอบ%'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
# สาขาแฟรนไชส์ที่เปิดเกิน 3 ปี (หมดประกัน) กับสาขาบริษัท — หัวหน้าภาคต้องดูแลทั้งสองภาค ใช้ภาคทีละรอบ
DOLD=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null and \"openedAt\" < now() - interval '4 years' order by \"openedAt\" limit 1")
COMP=$(DB "select code from \"Branch\" where code like 'C%' and \"cancelledAt\" is null and zone is not null order by code limit 1")
if [ -z "$DOLD" ] || [ -z "$COMP" ]; then echo "ข้ามทั้งชุด — ต้องมีสาขาแฟรนไชส์หมดประกันและสาขาบริษัท"; exit 0; fi
as_region_of() { DB "update \"User\" set region=(select region from \"Branch\" where code='$1') where \"employeeCode\"='S001'" >/dev/null; S=$(login S001); }
newwo() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W71\",\"symptom\":\"ทดสอบอะไหล่นอกสโตร์\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
st() { DB "select status from \"WorkOrder\" where id=$1"; }
OFFROWS() { DB "select sp.name||'|'||p.quantity||'|'||coalesce(p.unit,'-')||'|'||coalesce(p.note,'-') from \"WorkOrderPart\" p join \"SparePart\" sp on sp.id=p.\"sparePartId\" where p.\"workOrderId\"=$1 and p.kind='$2' and sp.\"offCatalog\" order by sp.name"; }

echo "═══ หัวหน้าภาคระบุ: ของในสโตร์ + นอกสโตร์ (แฟรนไชส์หมดประกัน $DOLD)"
as_region_of $DOLD
W1=$(newwo $DOLD); IDS="$IDS $W1"
R=$(POST $S "work-orders/$W1/parts" "{\"needsParts\":true,\"offParts\":[{\"name\":\"  \",\"quantity\":1}]}")
echo "$R" | grep -q "อะไหล่นอกสโตร์ต้องมีชื่อ" && [ "$(st $W1)" = "NEW" ] && pass "ชื่ออะไหล่นอกสโตร์ว่างไม่ได้" || fail "ชื่อว่างผ่าน: $(echo $R|head -c 120)"
POST $S "work-orders/$W1/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"offParts\":[{\"name\":\"$NAME1\",\"quantity\":2,\"unit\":\"เส้น\",\"note\":\"ซื้อร้านในพื้นที่\"}]}" >/dev/null
[ "$(st $W1)" = "PARTS_SOURCING" ] && pass "มีของนอกสโตร์ปน ยังไปขั้นเช็คอะไหล่ก่อนเสนอราคา" || fail "สถานะ: $(st $W1)"
[ "$(OFFROWS $W1 WAITING)" = "$NAME1|2|เส้น|ซื้อร้านในพื้นที่" ] && pass "เก็บชื่อ จำนวน หน่วย หมายเหตุ (ฐานข้อมูล)" || fail "แถว: $(OFFROWS $W1 WAITING)"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1 and kind='WAITING'")" = "2" ] && pass "ของในสโตร์ยังอยู่คู่กัน (2 รายการ)" || fail "จำนวนแถวไม่ถูก"
D=$(GET $A "work-orders/$W1")
[ "$(echo "$D" | J 'const p=d.waitingParts.find(x=>x.offCatalog);p?[p.name,p.unit,p.note].join("|"):"none"')" = "$NAME1|เส้น|ซื้อร้านในพื้นที่" ] \
  && pass "หน้าใบงานได้ offCatalog + หน่วย + หมายเหตุ" || fail "API: $(echo "$D" | J 'JSON.stringify(d.waitingParts)')"

echo
echo "═══ มีแต่ของนอกสโตร์อย่างเดียว"
W2=$(newwo $DOLD); IDS="$IDS $W2"
POST $S "work-orders/$W2/parts" "{\"needsParts\":true,\"offParts\":[{\"name\":\"$NAME1\",\"quantity\":1},{\"name\":\"$NAME2\",\"quantity\":1,\"unit\":\"งาน\"}]}" >/dev/null
[ "$(st $W2)|$(DB "select \"needsParts\" from \"WorkOrder\" where id=$W2")" = "PARTS_SOURCING|t" ] \
  && pass "ไม่มี SKU เลยก็นับว่าใช้อะไหล่ → ผ่านขั้นเช็คอะไหล่/เสนอราคา" || fail "สถานะ: $(st $W2)"
[ "$(DB "select count(distinct \"sparePartId\") from \"WorkOrderPart\" p join \"SparePart\" s on s.id=p.\"sparePartId\" where s.name='$NAME1' and p.\"workOrderId\" in ($W1,$W2)")" = "1" ] \
  && [ "$(DB "select count(*) from \"SparePart\" where name='$NAME1'")" = "1" ] \
  && pass "ชื่อเดียวกันข้ามใบงาน = อะไหล่นอกสโตร์แถวเดียวกัน" || fail "ซ้ำ: $(DB "select count(*) from \"SparePart\" where name='$NAME1'")"
[ "$(curl -s -G localhost:4000/api/spare-parts --data-urlencode "search=ทดสอบ" -H "$(H $A)" | J 'd.filter(p=>p.name.includes("ทดสอบ")).length')" = "0" ] && [ "$(GET $A spare-parts | J 'String(d.some(p=>p.offCatalog))')" = "false" ] \
  && pass "ของนอกสโตร์ไม่ขึ้นในรายการอะไหล่และช่องค้นหา" || fail "หลุดเข้ารายการอะไหล่"
OFF2=$(DB "select id from \"SparePart\" where name='$NAME2'")
R=$(POST $A "work-orders/$W2/parts-sourcing" "{\"results\":[{\"sparePartId\":$(DB "select id from \"SparePart\" where name='$NAME1'"),\"inStock\":true},{\"sparePartId\":$OFF2,\"inStock\":false}]}")
[ "$(st $W2)" = "PARTS_SOURCING" ] && echo "$R" | J 'd.workStatusLabel' | grep -q "รออะไหล่" \
  && pass "แอดมินตอบ \"ยังหาไม่ได้\" → รอของที่ขั้นเดิม เหมือนอะไหล่หมด" || fail "หลังเช็ค: $(st $W2) $(echo "$R"|head -c 120)"
# รายงานอะไหล่ที่ต้องสั่งอ่านจากเคสที่ยังไม่จบ — สร้างเคสทดสอบที่รอทั้งของในสโตร์และนอกสโตร์
# ต้องเห็นของในสโตร์ (พิสูจน์ว่ารายงานอ่านเคสนี้จริง) และไม่เห็นของนอกสโตร์
OUT=$(DB "insert into \"Outage\"(kind,\"branchId\",\"startedAt\",\"lastSeenAt\") select 'MACHINE_OFF',id,now(),now() from \"Branch\" where code='$DOLD' returning id" | head -1)
OUTS="$OUT"
DB "insert into \"OutagePart\"(\"outageId\",\"sparePartId\",quantity) values ($OUT,$PID,1),($OUT,$OFF2,1)" >/dev/null
RP=$(GET $A machines/reports/parts)
[ "$(echo "$RP" | J 'String(d.parts.some(p=>p.sparePartId==='$PID'))+"|"+String(d.parts.some(p=>p.sparePartId==='$OFF2'))')" = "true|false" ] \
  && pass "รายงานอะไหล่ที่ต้องสั่งนับของในสโตร์ แต่ไม่นับของนอกสโตร์" || fail "รายงาน: $(echo "$RP" | head -c 200)"

echo
echo "═══ เบิก + ปิดงาน (สาขาบริษัท $COMP)"
as_region_of $COMP
TEAM=$(DB "select zone from \"Branch\" where code='$COMP'")
W3=$(newwo $COMP); IDS="$IDS $W3"
POST $S "work-orders/$W3/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"offParts\":[{\"name\":\"$NAME1\",\"quantity\":1,\"note\":\"ร้านเดิม\"}]}" >/dev/null
OFF1=$(DB "select id from \"SparePart\" where name='$NAME1'")
[ "$(st $W3)" = "PARTS_SOURCING" ] && [ "$(GET $A "work-orders/$W3" | J 'String(d.needsQuote)')" = "true" ] \
  && pass "สาขาบริษัทแต่มีของนอกสโตร์ → ต้องเสนอราคา (ไปเช็คอะไหล่ก่อนเสนอราคา)" || fail "สถานะ: $(st $W3)"
POST $A "work-orders/$W3/parts-sourcing" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true},{\"sparePartId\":$OFF1,\"inStock\":true}]}" >/dev/null
POST $A "work-orders/$W3/quote" '{"skip":true,"note":"ทดสอบ — ข้ามเสนอราคา"}' >/dev/null
[ "$(st $W3)" = "PARTS_REQUESTED" ] && pass "มีอะไหล่ → หลังเสนอราคา/รับเงินไปขั้นเบิกตามเดิม" || fail "หลังเสนอราคา: $(st $W3)"
R=$(POST $A "work-orders/$W3/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true},{\"sparePartId\":$OFF1,\"inStock\":true}]}")
echo "$R" | grep -q "อยู่คลังไหน" && [ "$(st $W3)" = "PARTS_REQUESTED" ] && pass "ของในสโตร์ยังต้องระบุคลัง/เลขใบเบิก" || fail "ของในสโตร์ผ่านโดยไม่มีคลัง: $(echo $R|head -c 120)"
# แก้หมายเหตุอย่างเดียวก่อนเบิก — ไม่ใช่ของคนละชิ้น ผลเช็คเดิม (ยังไม่มี) ไม่เกี่ยว แค่ต้องไม่สร้างแถวใหม่
POST $A "work-orders/$W3/parts-check" "{\"results\":[{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-OFF1\"},{\"sparePartId\":$OFF1,\"inStock\":true}]}" >/dev/null
[ "$(st $W3)" = "PARTS_CHECKED" ] && [ "$(DB "select \"inStock\"||'|'||coalesce(warehouse,'-')||'|'||coalesce(\"requisitionNo\",'-') from \"WorkOrderPart\" where \"workOrderId\"=$W3 and \"sparePartId\"=$OFF1")" = "true|-|-" ] \
  && pass "ของนอกสโตร์ \"มี\" ผ่านได้โดยไม่มีคลังและเลขใบเบิก (ฐานข้อมูล)" || fail "เบิก: $(st $W3)"
POST $S "work-orders/$W3/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-20\"}" >/dev/null
for r in NAMEPLATE BEFORE AFTER; do
  curl -s -X POST "localhost:4000/api/work-orders/$W3/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=$r" >/dev/null
done
R=$(POST $A "work-orders/$W3/close" "{\"result\":\"FIXED\",\"note\":\"ใช้ของนอกสโตร์\",\"workerIds\":[$ME],\"parts\":[{\"sparePartId\":$OFF1,\"quantity\":1}],\"offParts\":[{\"name\":\"$NAME2\",\"quantity\":1,\"unit\":\"งาน\",\"note\":\"ซื้อหน้างาน\"}]}")
[ "$(st $W3)" = "DONE" ] && pass "ใช้แต่ของนอกสโตร์ ปิดงานได้โดยไม่ต้องแนบใบเหลือง" || fail "ปิดไม่ได้: $(echo $R|head -c 160)"
[ "$(OFFROWS $W3 USED | tr '\n' ';')" = "$NAME2|1|งาน|ซื้อหน้างาน;$NAME1|1|-|-;" ] \
  && pass "อะไหล่ที่ใช้จริงมีทั้งของที่ระบุไว้และของที่ช่างเพิ่มตอนปิดงาน (ฐานข้อมูล)" || fail "USED: $(OFFROWS $W3 USED | tr '\n' ';')"

W4=$(newwo $COMP); IDS="$IDS $W4"
POST $S "work-orders/$W4/parts" '{"needsParts":false}' >/dev/null
POST $S "work-orders/$W4/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-20\"}" >/dev/null
for r in NAMEPLATE BEFORE AFTER; do
  curl -s -X POST "localhost:4000/api/work-orders/$W4/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=$r" >/dev/null
done
R=$(POST $A "work-orders/$W4/close" "{\"result\":\"FIXED\",\"workerIds\":[$ME],\"parts\":[{\"sparePartId\":$PID,\"quantity\":1}],\"offParts\":[{\"name\":\"$NAME2\",\"quantity\":1}]}")
echo "$R" | grep -q "ใบเหลือง" && [ "$(st $W4)" != "DONE" ] && pass "ใช้ของในสโตร์ด้วย ยังต้องแนบใบเหลือง" || fail "ปิดได้โดยไม่มีใบเหลือง: $(echo $R|head -c 120)"

echo
echo "═══ ค่าบริการ (สาขาบริษัท $COMP)"
W5=$(newwo $COMP); IDS="$IDS $W5"
R=$(POST $S "work-orders/$W5/parts" '{"needsParts":false,"services":[{"name":" ","quantity":1}]}')
echo "$R" | grep -q "ค่าบริการต้องมีชื่อรายการ" && [ "$(st $W5)" = "NEW" ] && pass "ค่าบริการไม่มีชื่อไม่ได้" || fail "ชื่อว่างผ่าน: $(echo $R|head -c 120)"
POST $S "work-orders/$W5/parts" '{"needsParts":false,"services":[{"name":"ค่าล้างเครื่องทดสอบ","quantity":3,"unit":"เครื่อง","note":"ลูกค้าขอเพิ่ม"},{"name":"ค่าเดินทางทดสอบ","quantity":1}]}' >/dev/null
SV() { DB "select string_agg(name||'|'||quantity||'|'||coalesce(unit,'-')||'|'||coalesce(note,'-'), ';' order by id) from \"WorkOrderService\" where \"workOrderId\"=$1"; }
[ "$(st $W5)" = "AWAITING_QUOTE" ] && [ "$(SV $W5)" = "ค่าล้างเครื่องทดสอบ|3|เครื่อง|ลูกค้าขอเพิ่ม;ค่าเดินทางทดสอบ|1|-|-" ] \
  && pass "ไม่ใช้อะไหล่ + ค่าบริการ → ตรงไปรอเสนอราคา (ไม่ผ่านเช็คอะไหล่) เก็บครบทุกช่อง (ฐานข้อมูล)" || fail "ค่าบริการ: $(st $W5) · $(SV $W5)"
[ "$(GET $A "work-orders/$W5" | J 'd.services.map(v=>v.name).join(",")+"|"+d.needsQuote')" = "ค่าล้างเครื่องทดสอบ,ค่าเดินทางทดสอบ|true" ] \
  && pass "หน้าใบงานได้รายการค่าบริการ และขึ้นว่าต้องเสนอราคา" || fail "API ค่าบริการ"
UPQ() { curl -s -X POST "localhost:4000/api/work-orders/$W5/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=$1" >/dev/null; }
UPQ QUOTE; POST $A "work-orders/$W5/quote" '{}' >/dev/null
UPQ RECEIPT; POST $A "work-orders/$W5/payment" '{}' >/dev/null
[ "$(st $W5)" = "PARTS_CHECKED" ] && DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W5 and action='PAID'" | grep -q "ไม่มีอะไหล่ให้เบิก" \
  && pass "แนบใบเสนอราคา → รับเงิน → ไปจ่ายงานเลย ไม่ค้างที่ขั้นเบิก (ฐานข้อมูล)" || fail "หลังรับเงิน: $(st $W5)"

W6=$(newwo $COMP); IDS="$IDS $W6"
POST $S "work-orders/$W6/parts" '{"needsParts":false,"services":[{"name":"ค่าแรงทดสอบ","quantity":1}]}' >/dev/null
POST $A "work-orders/$W6/rollback" '{"toStage":"NEW","reason":"ทดสอบ — ลูกค้าไม่เอาค่าบริการ"}' >/dev/null
POST $S "work-orders/$W6/parts" '{"needsParts":false,"services":[]}' >/dev/null
[ "$(st $W6)" = "PARTS_CHECKED" ] && [ -z "$(SV $W6)" ] \
  && pass "ระบุใหม่โดยไม่มีค่าบริการ → ค่าบริการเดิมถูกล้าง และไปจัดคิวช่างเหมือนเดิม" || fail "ระบุใหม่: $(st $W6) · $(SV $W6)"

[ -z "$FAILED" ]
