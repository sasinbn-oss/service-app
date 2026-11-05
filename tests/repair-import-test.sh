#!/bin/bash
# ทดสอบ: นำเข้าใบแจ้งซ่อมจากไฟล์ฟอร์ม COCO (POST /work-orders/import-form) — เจ้าของงานขอ ต.ค. 69
#   · ดูตัวอย่างไม่บันทึก · ประเภทงานในฟอร์มแปลงเป็นรหัสของระบบ · ช่องเครื่องที่ไม่ใช่ W/D ไม่ทำให้แถวตก
#   · สาขาไม่มี = นำเข้าไม่ได้ · แถวส่งซ้ำ / เครื่องมีใบค้าง = ข้าม · บันทึกแล้วเช็คที่ฐานข้อมูล
#   · นำเข้าไฟล์เดิมซ้ำไม่เกิดใบซ้ำ · ช่าง/หัวหน้าภาคนำเข้าไม่ได้
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"  # purge_orders: ล้างใบงานของเทสต์ (DELETE = ย้ายไปถังขยะแล้ว)
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/import-history.sh"  # ih_mark/ih_clean: ล้างรอบในประวัติการนำเข้าที่ชุดนี้ทำให้เกิด
ih_mark
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
# วัดขนาดโดยไม่นับ branchOpen (ใบค้างของสาขา — โตตามข้อมูลในฐานข้อมูล ไม่เกี่ยวกับรูป) ไม่งั้นสาขาทดสอบมีใบค้างเยอะแล้วตกเอง
[ "$(G | J 'JSON.stringify([d.summary.photos,d.rows[0].photoInFile,d.rows[0].photo,JSON.stringify({...d,rows:d.rows.map(r=>({...r,branchOpen:undefined}))}).length<20000])')" = '[1,true,null,true]' ] \
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

# ใบ PM ในไฟล์ที่ใส่เลขเครื่องมา → เปิดเป็นงานทั้งร้าน (PM ไม่ระบุเครื่อง · เจ้าของงานกำหนด ต.ค. 69) · ดูตัวอย่างอย่างเดียว ไม่บันทึก
X4=$(mktemp --suffix=.xlsx)
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const n=process.argv[1]; const wb=new E.Workbook(); const ws=wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง","รหัสสาขา","ประเภทงาน","เครื่อง","รุ่นของเครื่อง","ขนาดเครื่อง","อาการที่พบ","ผู้ติดต่อที่สาขา","เบอร์ติดต่อสาขา","ชื่อสถานที่"]);
  ws.addRow([new Date(Date.UTC(2026,9,18)),"C0006","PM","W"+n,"OASIS","13 Kg","ทดสอบนำเข้า PM ตามรอบ","คุณกุ้ง","095-000-0000","สาขาทดสอบ"]);
  wb.xlsx.writeFile(process.argv[2]);' "$N" "$X4"
curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X4" \
  | J 'const r=d.rows[0]; r.jobType==="PM"&&r.machineCode===null&&r.machineNote==="W'$N'"?"ok":JSON.stringify(r)' | grep -q '^ok$' \
  && pass "แถว PM ที่ใส่เครื่องมา: เปิดเป็นงานทั้งร้าน ไม่ผูกเครื่อง (เลขเครื่องเก็บไว้ในรายละเอียด)" || fail "แถว PM ผูกเครื่อง"
rm -f "$X4"

# ── ยืนยันทีละชุด (only) — เจ้าของงานเจอ 5 พ.ย. 69: ไฟล์ 196 ใบในคำขอเดียวชนเพดานเวลา (P2028) ทุกครั้ง ไม่มีใบไหนเข้า ──
# ไฟล์แบบของจริง: วันที่ว่าง · หัว "ผู้ติดต่อสาขา" · รูปฝังหลายแถว · ตู้ขายน้ำยา (ไม่ผูกเครื่อง) · เครื่องใหม่ปนเครื่องที่มีอยู่
B=$((N + 100))
DB "insert into \"Machine\" (\"branchId\",code,type,status,brand,\"capacityKg\",\"updatedAt\") select id,'W$((B + 1))','WASHER','ON','Huebsch',25,now() from \"Branch\" where code='C0006';
    insert into \"Machine\" (\"branchId\",code,type,status,\"updatedAt\") select id,'W$((B + 2))','WASHER','ON',now() from \"Branch\" where code='C0006'" >/dev/null
SPEC=$(mktemp --suffix=.json); X5=$(mktemp --suffix=.xlsx)
cat > "$SPEC" <<EOF
[{"branch":"C0006","jobType":"CM","machine":"W$B","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด แถว2 ไม่ปั่น","contact":"คุณชุด","phone":"081-000-0002","image":true},
 {"branch":"C0006","jobType":"ตู้ขายน้ำยา","machine":"","symptom":"ทดสอบนำเข้า ชุด แถว3 น้ำยาไม่ออก","contact":"คุณชุด","phone":"081-000-0003","image":true},
 {"branch":"C0006","jobType":"CM","machine":"W$((B + 1))","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด แถว4 รู้ยี่ห้อแล้ว","contact":"คุณชุด","phone":"081-000-0004"},
 {"branch":"C0006","jobType":"CM","machine":"W$((B + 2))","model":"OASIS","size":"25 Kg","symptom":"ทดสอบนำเข้า ชุด แถว5 ยังไม่รู้ยี่ห้อ","contact":"คุณชุด","phone":"081-000-0005"},
 {"branch":"C0006","jobType":"ตู้ขายน้ำยา","machine":"ตู้น้ำยา 1","symptom":"ทดสอบนำเข้า ชุด แถว6 หยอดเหรียญไม่ขึ้น","contact":"คุณชุด","phone":"081-000-0006","image":true},
 {"branch":"C0006","jobType":"CM","machine":"W$B","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด แถว7 เครื่องเดียวกับแถว2","contact":"คุณชุด","phone":"081-000-0007"},
 {"branch":"C0006","jobType":"CM","machine":"W$((B + 3))","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด แถว8 น้ำไม่เข้า","contact":"คุณชุด","phone":"081-000-0008","image":true},
 {"branch":"C0006","jobType":"CM","machine":"W$((B + 4))","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด พังแถวนี้","contact":"คุณชุด","phone":"081-000-0009"},
 {"branch":"C0006","jobType":"CM","machine":"W$((B + 5))","model":"OASIS","size":"13 Kg","symptom":"ทดสอบนำเข้า ชุด แถว10 ประตูล็อค","contact":"คุณชุด","phone":"081-000-0010","image":true}]
EOF
SIZES=$(NODE_PATH=backend/node_modules node tests/fixtures-repair-form.js "$SPEC" "$X5")
C() { curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X5" "$@"; }
BATCH="symptom like 'ทดสอบนำเข้า ชุด%'"
[ "$(C | J 'JSON.stringify([d.summary.new,d.summary.open,d.summary.photos,d.rows.map(r=>r.status).join(",")])')" = '[8,1,5,"NEW,NEW,NEW,NEW,NEW,OPEN,NEW,NEW,NEW"]' ] \
  && pass "ไฟล์แบบของจริง (วันที่ว่าง · ผู้ติดต่อสาขา · รูปฝัง 5 แถว): ใบใหม่ 8 · แถว 7 เครื่องซ้ำกับแถว 2 ในไฟล์" || fail "พรีวิวไฟล์ชุด: $(C | J 'JSON.stringify(d.summary)||d.error')"

# ชุดแรก: เฉพาะแถว 2–4 — ที่เหลือในไฟล์ยังไม่ถูกเปิด
R1=$(C -F apply=true -F only=2,3,4)
[ "$(echo "$R1" | J 'JSON.stringify([d.created.length,d.pending,d.stale,d.rows.map(r=>r.line),d.summary.photosAttached])')" = '[3,[],[],[2,3,4],2]' ] \
  && [ "$(DB "select count(*) from \"WorkOrder\" where $BATCH")" = "3" ] \
  && pass "ยืนยันชุดแรก only=2,3,4 → เปิด 3 ใบ (แนบรูป 2) · ฐานข้อมูลมี 3 ใบ ไม่เปิดแถวอื่นในไฟล์" || fail "only ชุดแรก: $(echo "$R1" | J 'JSON.stringify({c:d.created,p:d.pending,s:d.stale,sum:d.summary,e:d.error})') · ในฐาน $(DB "select count(*) from \"WorkOrder\" where $BATCH")"
# ส่งชุดเดิมซ้ำ (คำตอบหายกลางทางแล้วแอปส่งใหม่) — ไม่เกิดใบซ้ำ บอกว่าแถวไหนเข้าไปแล้ว
R1B=$(C -F apply=true -F only=2,3,4)
[ "$(echo "$R1B" | J 'JSON.stringify([d.created,d.stale])')" = '[[],[2,3,4]]' ] && [ "$(DB "select count(*) from \"WorkOrder\" where $BATCH")" = "3" ] \
  && pass "ส่งชุดเดิมซ้ำ → ไม่เปิดเพิ่ม (stale 2,3,4) · ฐานข้อมูลยังมี 3 ใบ" || fail "ส่งชุดซ้ำ: $(echo "$R1B" | J 'JSON.stringify({c:d.created,s:d.stale,e:d.error})')"
# ชุดแรกเข้าแล้ว (แบบของจริงที่ก้อนแรก ๆ commit ไปก่อนพัง) → ดูตัวอย่างใหม่: 3 แถวขึ้น "นำเข้าไปแล้ว" ที่เหลือยังเป็นใบใหม่
P2=$(C)
echo "$P2" | J 'const by=Object.fromEntries(d.rows.map(r=>[r.line,r])); [2,3,4].every(l=>by[l].status==="IMPORTED"&&/^นำเข้าไปแล้ว \(WO-/.test(by[l].reason))&&d.summary.new===5&&by[7].status==="OPEN"?"ok":"bad"' | grep -q ok \
  && pass "หลังชุดแรก ดูตัวอย่างใหม่: แถว 2–4 'นำเข้าไปแล้ว (WO-…)' · เหลือใบใหม่ 5 · แถว 7 ยังข้าม (เครื่องมีใบค้างแล้ว)" || fail "พรีวิวหลังชุดแรก: $(echo "$P2" | J 'JSON.stringify([d.summary,d.rows.map(r=>r.line+":"+r.status)])')"

# แถวพังกลางทาง — trigger ชั่วคราวในฐานข้อมูลทดสอบให้แถว 9 สร้างไม่ได้ (_po_psql ปฏิเสธฐานข้อมูลบนคลาวด์) · ลบใน trap เสมอ
drop_fail_trigger() { _po_psql 'drop trigger if exists test_import_fail on "WorkOrder"; drop function if exists test_import_fail()' >/dev/null 2>&1; }
trap 'drop_fail_trigger; ih_clean' EXIT
_po_psql "create or replace function test_import_fail() returns trigger as \$\$ begin
  if new.symptom = 'ทดสอบนำเข้า ชุด พังแถวนี้' then raise exception 'ทดสอบ: แถวนี้ต้องพัง'; end if; return new; end \$\$ language plpgsql;
  create trigger test_import_fail before insert on \"WorkOrder\" for each row execute function test_import_fail()" >/dev/null
# ไม่ส่ง only (แอปรุ่นก่อนที่เปิดค้างอยู่) — ทั้งไฟล์ที่เหลือ: แถว 5 6 8 เข้า แล้วพังที่แถว 9
RF=$(curl -s -w '\n%{http_code}' -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X5" -F apply=true)
RFB=$(echo "$RF" | head -n -1)
echo "$RFB" | J 'd.code==="IMPORT_FAILED"&&d.line===9&&d.created.length===3&&d.photosAttached===2&&/ตอนเปิดแถว 9/.test(d.error)&&/รอบนี้เปิดไปแล้ว 3 ใบ/.test(d.error)&&!/แจ้งแอดมินให้ดู log/.test(d.error)?"ok":"bad"' | grep -q ok \
  && [ "$(echo "$RF" | tail -1)" = "500" ] \
  && [ "$(DB "select string_agg(code, ',' order by id) from \"WorkOrder\" where $BATCH and symptom similar to '%แถว(5|6|8) %'")" = "$(echo "$RFB" | J 'd.created.join(",")')" ] \
  && pass "พังกลางทางที่แถว 9 → ตอบเป็นภาษาไทยว่าพังแถวไหน เปิดไปแล้ว 3 ใบ (รหัสตรงกับในฐานข้อมูล) ไม่ใช่ 'แจ้งแอดมินให้ดู log'" || fail "พังกลางทาง: $(echo "$RF" | tail -1) $(echo "$RFB" | J 'JSON.stringify({code:d.code,line:d.line,c:d.created,e:d.error})' 2>&1 | head -c 400)"
[ "$(DB "select count(*) from \"WorkOrder\" where $BATCH")" = "6" ] && [ "$(DB "select count(*) from \"WorkOrder\" where symptom='ทดสอบนำเข้า ชุด พังแถวนี้'")" = "0" ] \
  && [ "$(DB "select count(*) from \"Machine\" where code='W$((B + 4))'")" = "0" ] \
  && pass "แถวที่พังไม่ทิ้งอะไรไว้ (ใบ · เครื่องใหม่ของแถวนั้นถูก rollback) · แถวก่อนหน้าอยู่ครบ 6 ใบ" || fail "หลังพัง: ใบ $(DB "select count(*) from \"WorkOrder\" where $BATCH") · เครื่อง W$((B + 4)) $(DB "select count(*) from \"Machine\" where code='W$((B + 4))'")"
drop_fail_trigger
# ยืนยันทั้งไฟล์ซ้ำหลังแก้ปัญหา — ที่เปิดแล้วขึ้น "นำเข้าไปแล้ว" เปิดเฉพาะที่เหลือ ไม่มีใบซ้ำ
RR=$(C -F apply=true)
[ "$(echo "$RR" | J 'JSON.stringify([d.summary.created,d.summary.imported,d.summary.open,d.pending])')" = '[2,6,1,[]]' ] \
  && [ "$(DB "select count(*)||'|'||count(distinct \"importKey\") from \"WorkOrder\" where $BATCH")" = "8|8" ] \
  && pass "ยืนยันทั้งไฟล์ซ้ำ → เปิดเฉพาะ 2 ใบที่เหลือ (6 แถวนำเข้าไปแล้ว) · ฐานข้อมูล 8 ใบ importKey ไม่ซ้ำ" || fail "ยืนยันซ้ำ: $(echo "$RR" | J 'JSON.stringify(d.summary||d.error)')"

# หน้าตาใบที่เปิดทีละชุด = แบบเดิมทุกช่อง (ทั้งที่เปิดผ่าน only และทั้งไฟล์) — ประเภท · หัวข้อ · ขั้น · ที่มา · เครื่อง/รุ่น/ขนาด ·
# ผู้ติดต่อ · รายละเอียด · รหัสจาก id · importKey · ประวัติเปิดใบ 1 แถว · รูปจากไฟล์ (ชื่อ ขนาด รูปย่อ) · ยี่ห้อที่รู้แล้วไม่ถูกทับ (D7)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
GOT=$(DB "select string_agg(concat_ws('|', substring(w.symptom from 'แถว[0-9]+|พังแถวนี้'), w.\"jobType\", w.title, w.status, w.source, w.priority, coalesce(m.code,'-'),
  coalesce(m.brand,'-'), coalesce(m.model,'-'), coalesce(m.\"capacityKg\"::text,'-'), w.\"contactName\", w.\"contactPhone\", coalesce(w.detail,'(null)'),
  (w.code = 'WO-'||lpad(w.id::text,greatest(5,length(w.id::text)),'0')), (w.\"importKey\" ~ '^[0-9a-f]{40}$'), (w.\"createdById\"=$AID), w.\"assignedTeam\" is null, w.\"scheduledAt\" is null,
  (select count(*) from \"WorkOrderLog\" l where l.\"workOrderId\"=w.id and l.action='CREATED' and l.status='NEW' and l.\"userId\"=$AID),
  coalesce((select string_agg(a.\"fileName\"||':'||a.\"sizeBytes\"||':'||(a.thumbnail is not null), ',') from \"WorkOrderAttachment\" a where a.\"workOrderId\"=w.id), ''),
  (select count(*) from \"WorkOrderLog\" l where l.\"workOrderId\"=w.id and l.action='ATTACHED')), E'\n' order by w.id)
  from \"WorkOrder\" w left join \"Machine\" m on m.id=w.\"machineId\" where w.$BATCH")
SZ() { echo "$SIZES" | J "d[$1]"; }
WANT="แถว2|CM|งาน CM|NEW|FORM|NORMAL|W$B|-|Oasis|13|คุณชุด|081-000-0002||t|t|t|t|t|1|ฟอร์มแจ้งซ่อม-แถว2.jpg:$(SZ 2):true|1
แถว3|DETERGENT|ตู้ขายน้ำยา|NEW|FORM|NORMAL|-|-|-|-|คุณชุด|081-000-0003||t|t|t|t|t|1|ฟอร์มแจ้งซ่อม-แถว3.jpg:$(SZ 3):true|1
แถว4|CM|งาน CM|NEW|FORM|NORMAL|W$((B + 1))|Huebsch|-|13|คุณชุด|081-000-0004||t|t|t|t|t|1||0
แถว5|CM|งาน CM|NEW|FORM|NORMAL|W$((B + 2))|-|Oasis|25|คุณชุด|081-000-0005||t|t|t|t|t|1||0
แถว6|DETERGENT|ตู้ขายน้ำยา|NEW|FORM|NORMAL|-|-|-|-|คุณชุด|081-000-0006|อุปกรณ์ตามที่แจ้ง: ตู้น้ำยา 1|t|t|t|t|t|1|ฟอร์มแจ้งซ่อม-แถว6.jpg:$(SZ 6):true|1
แถว8|CM|งาน CM|NEW|FORM|NORMAL|W$((B + 3))|-|Oasis|13|คุณชุด|081-000-0008||t|t|t|t|t|1|ฟอร์มแจ้งซ่อม-แถว8.jpg:$(SZ 8):true|1
พังแถวนี้|CM|งาน CM|NEW|FORM|NORMAL|W$((B + 4))|-|Oasis|13|คุณชุด|081-000-0009||t|t|t|t|t|1||0
แถว10|CM|งาน CM|NEW|FORM|NORMAL|W$((B + 5))|-|Oasis|13|คุณชุด|081-000-0010||t|t|t|t|t|1|ฟอร์มแจ้งซ่อม-แถว10.jpg:$(SZ 10):true|1"
[ "$GOT" = "$WANT" ] && pass "ใบที่เปิดทีละชุดหน้าตาเหมือนเดิมทุกช่อง (8 ใบ: เครื่อง/รุ่น/ขนาด · ตู้ขายน้ำยาไม่ผูกเครื่อง · ยี่ห้อที่รู้แล้วไม่ถูกทับ · ประวัติ · รูป)" \
  || fail "ช่องของใบที่นำเข้า (คาด → ได้): $(diff <(echo "$WANT") <(echo "$GOT") | grep "^[<>]" | sort -k1.3 -s | head -4 | tr '\n' ' ')"
rm -f "$SPEC" "$X5"

# เก็บกวาด
purge_orders "$A" $(DB "select id from \"WorkOrder\" where symptom like 'ทดสอบนำเข้า%'")
DB "delete from \"Machine\" where code in ('W$N','W$M2','W$B','W$((B + 1))','W$((B + 2))','W$((B + 3))','W$((B + 4))','W$((B + 5))') and \"branchId\"=(select id from \"Branch\" where code='C0006')" >/dev/null
rm -f "$X"
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
