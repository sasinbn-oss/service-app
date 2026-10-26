#!/bin/bash
# ทดสอบ: นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO (POST /work-orders/import-form) — เจ้าของงานขอ ต.ค. 69
#   · ดูตัวอย่างไม่บันทึก · ประเภทงานในฟอร์มแปลงเป็นรหัสของระบบ · ช่องเครื่องที่ไม่ใช่ W/D ไม่ทำให้แถวตก
#   · สาขาไม่มี = นำเข้าไม่ได้ · แถวส่งซ้ำ / เครื่องมีใบค้าง = ข้าม · บันทึกแล้วเช็คที่ฐานข้อมูล
#   · นำเข้าไฟล์เดิมซ้ำไม่เกิดใบซ้ำ · ช่าง/หัวหน้าภาคนำเข้าไม่ได้
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

# เครื่องเลขสูงที่ไม่ชนกับเทสต์อื่น — สุ่มต่อรอบ เผื่อรอบก่อนค้าง
N=$((RANDOM % 800 + 900))
X=$(mktemp --suffix=.xlsx)
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const n=process.argv[1]; const wb=new E.Workbook(); const ws=wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง","รหัสสาขา","ประเภทงาน","เครื่อง","รุ่นของเครื่อง","ขนาดเครื่อง","อาการที่พบ","ผู้ติดต่อที่สาขา","เบอร์ติดต่อสาขา","ชื่อสถานที่","รูปภาพ","วิดีโอ "]);
  const d=new Date(Date.UTC(2026,9,16));
  ws.addRow([d,"C0006","CM","W"+n+" ","OASIS","13 Kg","ทดสอบนำเข้า เวลาไม่ลด","คุณกุ้ง","095-000-0000","สาขาทดสอบ",{text:"รูป",hyperlink:"https://example.com/p.jpg"},null]);
  ws.addRow([d,"C0006","ตู้แลกเหรียญ","",null,null,"ทดสอบนำเข้า เหรียญไม่ออก","คุณกุ้ง","095-000-0000","สาขาทดสอบ",null,null]);
  ws.addRow([d,"C0006","ระบบ IT","กล่องเกตเวย์",null,null,"ทดสอบนำเข้า ออนไลน์ไม่ได้","คุณกุ้ง","095-000-0000","สาขาทดสอบ",null,null]);
  ws.addRow([d,"C0006","ตู้แลกเหรียญ","",null,null,"ทดสอบนำเข้า เหรียญไม่ออก","คุณกุ้ง","095-000-0000","สาขาทดสอบ",null,null]);
  ws.addRow([d,"ZZ999","CM","W1","OASIS","10 Kg","ทดสอบนำเข้า สาขาไม่มี","ก","0","ไม่มี",null,null]);
  ws.addRow([d,"C0006","ตุ้คอนโทรลปั้มดูดเข้าแท้งค์","",null,null,"ทดสอบนำเข้า ปั๊มเสียงดัง","คุณกุ้ง","095-000-0000","สาขาทดสอบ",null,null]);
  wb.xlsx.writeFile(process.argv[2]);' "$N" "$X"

IMP() { curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $1)" -F "file=@$X" ${2:+-F apply=true}; }
BEFORE=$(DB "select count(*) from \"WorkOrder\" where source='FORM'")

P=$(IMP $A)
[ "$(echo "$P" | J 'JSON.stringify(d.summary)')" = '{"new":4,"imported":1,"open":0,"error":1,"skipped":0,"photos":0,"photoFill":0}' ] \
  && pass "ดูตัวอย่าง: เปิดใหม่ 4 · ซ้ำในไฟล์ 1 · สาขาไม่มี 1" || fail "สรุปตัวอย่าง: $(echo "$P" | J 'JSON.stringify(d.summary)||d.error')"
[ "$(DB "select count(*) from \"WorkOrder\" where source='FORM'")" = "$BEFORE" ] && pass "ดูตัวอย่างไม่บันทึกอะไรลงฐานข้อมูล" || fail "ดูตัวอย่างแล้วมีใบงานเพิ่ม"
[ "$(echo "$P" | J 'd.rows.map(r=>r.jobType).join(",")')" = "CM,COIN_CHANGER,IT,COIN_CHANGER,CM,WATER_PUMP" ] \
  && pass "ประเภทงานในฟอร์มแปลงถูก (ตู้คอนโทรลปั้ม → ปั๊มน้ำ · ระบบ IT → IT)" || fail "ประเภทงาน: $(echo "$P" | J 'd.rows.map(r=>r.jobType).join(",")')"
echo "$P" | J 'const r=d.rows[2]; r.status==="NEW"&&r.machineCode===null&&r.machineNote==="กล่องเกตเวย์"?"ok":"bad"' | grep -q ok \
  && pass "ช่องเครื่องที่ไม่ใช่ W/D (กล่องเกตเวย์) ไม่ทำให้แถวตก — ไม่ผูกเครื่อง" || fail "แถวกล่องเกตเวย์: $(echo "$P" | J 'JSON.stringify(d.rows[2])')"
echo "$P" | J 'd.rows[4].status==="ERROR"&&/ไม่พบสาขา ZZ999/.test(d.rows[4].reason)&&/ซ้ำกับแถว 3/.test(d.rows[3].reason)?"ok":"bad"' | grep -q ok \
  && pass "สาขาไม่มีในระบบ = นำเข้าไม่ได้ · แถวส่งซ้ำบอกว่าซ้ำกับแถวไหน" || fail "เหตุผลแถวที่ข้าม"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4000/api/work-orders/import-form -H "$(H $S)" -F "file=@$X")" = "403" ] \
  && pass "หัวหน้าภาคนำเข้าไม่ได้" || fail "หัวหน้าภาคนำเข้าได้"

R=$(IMP $A 1)
[ "$(echo "$R" | J 'd.summary.created')" = "4" ] && pass "ยืนยันแล้วเปิดใบงาน 4 ใบ" || fail "ยืนยัน: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
ROW=$(DB "select w.\"jobType\"||'|'||w.title||'|'||w.status||'|'||m.code||'|'||coalesce(m.model,'')||'|'||coalesce(m.\"capacityKg\"::text,'')||'|'||w.\"contactName\"||'|'||(w.detail like '%รูปจากฟอร์ม: https://example.com/p.jpg%') from \"WorkOrder\" w join \"Machine\" m on m.id=w.\"machineId\" where w.source='FORM' and m.code='W$N' and w.\"branchId\"=(select id from \"Branch\" where code='C0006')")
[ "$ROW" = "CM|งาน CM|NEW|W$N|Oasis|13|คุณกุ้ง|true" ] && pass "ฐานข้อมูล: งาน CM ขั้นแรก เครื่อง W$N รุ่น Oasis 13 kg ผู้ติดต่อ + ลิงก์รูปในรายละเอียด" || fail "แถวเครื่อง: $ROW"
EQ=$(DB "select string_agg(\"jobType\"||':'||coalesce(\"machineId\"::text,'-'), ',' order by id) from \"WorkOrder\" where source='FORM' and symptom like 'ทดสอบนำเข้า%' and \"machineId\" is null")
[ "$EQ" = "COIN_CHANGER:-,IT:-,WATER_PUMP:-" ] && pass "ฐานข้อมูล: ตู้แลกเหรียญ / IT / ปั๊มน้ำ ไม่ผูกเครื่อง" || fail "แถวไม่ผูกเครื่อง: $EQ"
[ "$(DB "select count(*) from \"WorkOrder\" where symptom like 'ทดสอบนำเข้า%' and detail like '%อุปกรณ์ตามที่แจ้ง: กล่องเกตเวย์%'")" = "1" ] \
  && pass "ข้อความในช่องเครื่องเก็บไว้ในรายละเอียด" || fail "ไม่เก็บกล่องเกตเวย์"

R2=$(IMP $A 1)
[ "$(echo "$R2" | J 'd.summary.created+"|"+d.summary.imported')" = "0|5" ] && [ "$(DB "select count(*) from \"WorkOrder\" where symptom like 'ทดสอบนำเข้า%'")" = "4" ] \
  && pass "นำเข้าไฟล์เดิมซ้ำ: ไม่เกิดใบซ้ำ (ฐานข้อมูลยังมี 4 ใบ)" || fail "นำเข้าซ้ำ: $(echo "$R2" | J 'JSON.stringify(d.summary)')"
echo "$(curl -s "localhost:4000/api/work-orders?status=ALL&search=W$N" -H "$(H $A)" | J 'd.rows.find(r=>r.machineCode==="W'$N'")?.source')" | grep -q "^FORM$" \
  && pass "รายการใบงานบอกที่มา FORM (ป้ายฟอร์มแจ้งซ่อม)" || fail "source ในรายการ"
echo "$R2" | J 'const o=d.rows[0].branchOpen; o.some(w=>w.machineCode==="W'$N'"&&/^WO-/.test(w.code)&&w.id>0)&&o.some(w=>w.machineCode===null)?"ok":"bad"' | grep -q ok \
  && pass "แถวบอกใบค้างของสาขาเดียวกันทุกเครื่อง (มี id ให้กดเปิดดู)" || fail "branchOpen: $(echo "$R2" | J 'JSON.stringify(d.rows[0].branchOpen)')"

# เอาแถวออก / เปิดเพิ่มทั้งที่เครื่องมีใบค้าง (คนละเรื่อง) — เลือกในหน้าตัวอย่าง ส่งเป็นเลขแถว skip / force
X2=$(mktemp --suffix=.xlsx)
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const n=process.argv[1]; const wb=new E.Workbook(); const ws=wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง","รหัสสาขา","ประเภทงาน","เครื่อง","รุ่นของเครื่อง","ขนาดเครื่อง","อาการที่พบ","ผู้ติดต่อที่สาขา","เบอร์ติดต่อสาขา","ชื่อสถานที่"]);
  const d=new Date(Date.UTC(2026,9,17));
  ws.addRow([d,"C0006","CM","W"+n,"OASIS","13 Kg","ทดสอบนำเข้า ประตูล็อคเปิดไม่ได้","คุณกุ้ง","095-000-0000","สาขาทดสอบ"]);
  ws.addRow([d,"C0006","ตู้แลกเหรียญ","",null,null,"ทดสอบนำเข้า เอาออกไม่ต้องเปิด","คุณกุ้ง","095-000-0000","สาขาทดสอบ"]);
  wb.xlsx.writeFile(process.argv[2]);' "$N" "$X2"
F() { curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X2" "$@"; }
[ "$(F | J 'd.rows.map(r=>r.status).join(",")')" = "OPEN,NEW" ] \
  && [ "$(F -F skip=3 | J 'JSON.stringify([d.summary.new,d.summary.skipped,d.summary.open,d.rows[1].status])')" = '[0,1,1,"SKIPPED"]' ] \
  && pass "ดูตัวอย่าง: เอาแถว 3 ออก → นับเป็นเอาออก ไม่เปิด" || fail "skip: $(F -F skip=3 | J 'JSON.stringify(d.summary)')"
FP=$(F -F force=2 -F skip=3)
echo "$FP" | J 'const r=d.rows[0]; r.status==="NEW"&&r.forced&&/คนละเรื่อง/.test(r.reason)&&d.summary.new===1?"ok":"bad"' | grep -q ok \
  && pass "เลือกเปิดเพิ่มแถวที่เครื่องมีใบค้าง → กลายเป็นใบใหม่ บอกว่าเลือกเอง" || fail "force: $(echo "$FP" | J 'JSON.stringify(d.rows[0])')"
FA=$(F -F force=2 -F skip=3 -F apply=true)
[ "$(echo "$FA" | J 'd.summary.created')" = "1" ] \
  && [ "$(DB "select count(*) from \"WorkOrder\" w join \"Machine\" m on m.id=w.\"machineId\" where w.source='FORM' and m.code='W$N' and w.\"branchId\"=(select id from \"Branch\" where code='C0006')")" = "2" ] \
  && [ "$(DB "select count(*) from \"WorkOrder\" where symptom='ทดสอบนำเข้า เอาออกไม่ต้องเปิด'")" = "0" ] \
  && pass "ยืนยัน: เปิดเพิ่ม 1 ใบ (เครื่อง W$N มี 2 ใบ) · แถวที่เอาออกไม่ถูกเปิด (เช็คที่ฐานข้อมูล)" || fail "apply skip/force: $(echo "$FA" | J 'JSON.stringify(d.summary)')"
rm -f "$X2"

# รูปฝังในเซลล์ (ไฟล์ 26 ต.ค. 69) → แนบเป็นรูปจริง · ใบที่นำเข้าแล้วแต่ไม่มีรูป นำเข้าซ้ำแล้วเติมรูปให้
X3=$(mktemp --suffix=.xlsx)
M2=$((N + 50))  # เครื่องคนละตัวกับข้างบน — เครื่อง W$N มีใบค้างจากเทสต์ก่อนหน้า แถวจะถูกข้าม
JB=$(NODE_PATH=backend/node_modules node tests/fixtures-incell-image.js "$X3" C0006 "W$M2" "ทดสอบนำเข้า รูปในเซลล์")
G() { curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X3" "$@"; }
[ "$(G | J 'JSON.stringify([d.summary.photos,d.rows[0].photoInFile,d.rows[0].photo,JSON.stringify(d).length<20000])')" = '[1,true,null,true]' ] \
  && pass "ดูตัวอย่าง: เห็นรูปในเซลล์ 1 รูป · ช่องรูปไม่กลายเป็นข้อความ · ไม่ส่งตัวรูปกลับมา" || fail "พรีวิวรูปในเซลล์: $(G | J 'JSON.stringify(d.summary)')"
G -F apply=true >/dev/null
# key ในถังต้องเป็น ASCII — Supabase ไม่รับอักษรไทย (tests/mock-s3.js จำลองข้อนี้) · ชื่อไทยอยู่ใน fileName
KEY=$(DB "select a.\"objectKey\"||'|'||a.\"fileName\" from \"WorkOrderAttachment\" a join \"WorkOrder\" w on w.id=a.\"workOrderId\" where w.symptom='ทดสอบนำเข้า รูปในเซลล์'")
echo "$KEY" | grep -qP '^[\x20-\x7e]+\|ฟอร์มแจ้งซ่อม-แถว2\.jpg$' && pass "ไฟล์รูปในถังชื่อภาษาอังกฤษ (Supabase ไม่รับไทย) · ชื่อที่คนเห็นยังเป็นไทย" || fail "objectKey: $KEY"
IMG=$(DB "select a.kind||'|'||a.\"sizeBytes\"||'|'||(a.thumbnail is not null)||'|'||(w.detail not like '%object Object%' or w.detail is null) from \"WorkOrderAttachment\" a join \"WorkOrder\" w on w.id=a.\"workOrderId\" where w.symptom='ทดสอบนำเข้า รูปในเซลล์' and a.\"fileName\" like 'ฟอร์มแจ้งซ่อม-%'")
[ "$IMG" = "IMAGE|$JB|true|true" ] && pass "ยืนยัน: รูปในเซลล์แนบเข้าใบงานเป็นรูปจริง (ขนาดตรงกับที่ฝัง มีรูปย่อ) ไม่มี [object Object] ในรายละเอียด" || fail "แนบรูป: $IMG (คาด IMAGE|$JB|true|true)"
DB "delete from \"WorkOrderAttachment\" where \"fileName\" like 'ฟอร์มแจ้งซ่อม-%' and \"workOrderId\"=(select id from \"WorkOrder\" where symptom='ทดสอบนำเข้า รูปในเซลล์')" >/dev/null
[ "$(G | J 'd.summary.photoFill+"|"+d.summary.new')" = "1|0" ] && [ "$(G -F apply=true | J 'd.summary.photoFilled')" = "1" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"fileName\" like 'ฟอร์มแจ้งซ่อม-%' and \"workOrderId\"=(select id from \"WorkOrder\" where symptom='ทดสอบนำเข้า รูปในเซลล์')")" = "1" ] \
  && [ "$(G | J 'd.summary.photoFill')" = "0" ] \
  && pass "ใบที่นำเข้าแล้วแต่ไม่มีรูป: นำเข้าไฟล์เดิมซ้ำ → เติมรูปให้ 1 รูป · รอบถัดไปไม่เติมซ้ำ" || fail "เติมรูป: $(G | J 'JSON.stringify(d.summary)')"
# ไฟล์ที่อัปซ้ำต่างจากรอบแรกเล็กน้อย (importKey ไม่ตรง) — ยังเติมรูปให้ใบเดิมได้ด้วย สาขา + เครื่อง + อาการ (26 ต.ค. 69)
WID=$(DB "select id from \"WorkOrder\" where symptom='ทดสอบนำเข้า รูปในเซลล์'")
DB "update \"WorkOrder\" set \"importKey\"='ทดสอบ-key-ไม่ตรง-$N' where id=$WID; delete from \"WorkOrderAttachment\" where \"workOrderId\"=$WID and \"fileName\" like 'ฟอร์มแจ้งซ่อม-%'" >/dev/null
[ "$(G | J 'd.rows[0].status+"|"+d.rows[0].photoFill+"|"+d.summary.photoFill')" = "OPEN|true|1" ] && [ "$(G -F apply=true | J 'd.summary.photoFilled+"|"+d.summary.created')" = "1|0" ] \
  && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$WID and \"fileName\" like 'ฟอร์มแจ้งซ่อม-%'")" = "1" ] \
  && pass "importKey ไม่ตรงแต่ สาขา+เครื่อง+อาการ ตรง → เติมรูปให้ใบเดิม ไม่เปิดใบใหม่ (เช็คที่ฐานข้อมูล)" || fail "เติมรูปแบบหลวม: $(G | J 'JSON.stringify([d.rows[0].status,d.rows[0].reason,d.summary])')"
rm -f "$X3"

# เก็บกวาด
for id in $(DB "select id from \"WorkOrder\" where symptom like 'ทดสอบนำเข้า%'"); do curl -s -X DELETE "localhost:4000/api/work-orders/$id" -H "$(H $A)" >/dev/null; done
DB "delete from \"Machine\" where code in ('W$N','W$M2') and \"branchId\"=(select id from \"Branch\" where code='C0006')" >/dev/null
rm -f "$X"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
