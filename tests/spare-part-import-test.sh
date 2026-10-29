#!/bin/bash
# ทดสอบ: อัปเดตข้อมูลอะไหล่จากไฟล์ Excel (POST /spare-parts/import) — เจ้าของงานขอ ต.ค. 69
#   · ดูตัวอย่างไม่บันทึก · หาคอลัมน์ได้แม้หัวสะกดผิด ("Pant No.") · รหัสเป็นตัวพิมพ์ใหญ่ · ช่องว่าง/ขึ้นบรรทัดในชื่อไม่นับว่าต่าง
#   · เพิ่มใหม่ / แก้ไข / เหมือนเดิม · ช่องว่างในไฟล์ = คงค่าเดิม · รหัสซ้ำในไฟล์ใช้แถวหลัง · ไม่มีรหัส = ข้าม
#   · รูป: เดิมไม่มี = ใส่ · ต่างจากเดิม = แทน (ค่าตั้งต้น) หรือเก็บเดิม · เหมือนเดิม = ไม่นับ — เช็คด้วย md5 ที่ฐานข้อมูล
#   · อะไหล่ยี่ห้อเดียวกันที่ไม่อยู่ในไฟล์ไม่ถูกลบ · ประวัติรอบอัปเดต (หลายไฟล์ในรอบเดียว) · รายงาน Excel
#   · แอดมินอะไหล่ทำได้ · หัวหน้าภาค/ช่างทำไม่ได้ · ค้นหาด้วย Part No. · ล้าง Part No. ในฟอร์ม = null
#   แก้จากตรวจโค้ด: หัวตารางสองชั้น/เซลล์ผสาน · แถวชื่อเรื่องเหนือหัวตาราง · ลิงก์ที่ข้อความจัดรูปแบบ · รูปเดิมเป็นลิงก์ภายนอก (เก็บรูปเดิมต้องไม่ทับ)
#   · รูปเข้าแต่ลิงก์รูปหาย ซ่อมให้ · ยี่ห้อเดียวแยกสองไฟล์ในรอบเดียวไม่ฟ้อง "ไม่อยู่ในไฟล์" · แถวที่ข้ามไม่นับเป็นไม่อยู่ในไฟล์
#   · Part No. ยาวเกินข้าม · ข้อความผิดพลาดของฟอร์มเป็นภาษาไทย
#   ไฟล์เกิน 50 MB (เบราว์เซอร์ย่อรูปก่อนส่ง): เก็บค่ารูปต้นฉบับ (imageHashes) — ย่อใหม่ได้ไบต์ต่างแต่ต้นฉบับเดิม = เหมือนเดิม ·
#   ไฟล์ต้นฉบับไม่ย่อก็ = เหมือนเดิม · ค่าผิดรูปแบบถูกทิ้ง · อัปโหลดรูปเองล้างค่าต้นฉบับ
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }

SUF=$RANDOM
P="ZZTP$SUF"       # รหัสอะไหล่ทดสอบขึ้นต้นด้วยตัวนี้
B="ZZยี่ห้อ$SUF"    # ยี่ห้อของเทสต์นี้คนเดียว — "ไม่อยู่ในไฟล์" นับเฉพาะยี่ห้อเดียวกัน จะได้ไม่ปนกับข้อมูลจริง
B1="zztpb1$SUF"; B2="zztpb2$SUF"; B3ID="zztpb3$SUF"; B4ID="zztpb4$SUF"; B5ID="zztpb5$SUF"
DIR=$(mktemp -d)
cleanup() {
  DB "delete from \"SparePartImport\" where \"batchId\" like 'zztpb%$SUF';
      delete from \"SparePartImage\" where \"sparePartId\" in (select id from \"SparePart\" where \"partCode\" like '$P%');
      delete from \"SparePart\" where \"partCode\" like '$P%';
      delete from \"User\" where \"employeeCode\"='ZPI$SUF'" >/dev/null
  rm -rf "$DIR"
}
trap cleanup EXIT

A=$(login A001); S=$(login S001); T=$(login T001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZPI$SUF','แอดมินอะไหล่ทดสอบนำเข้า','PARTS_ADMIN','$HASH',false)" >/dev/null
PA=$(login ZPI$SUF)

# อะไหล่ยี่ห้อเดียวกันที่มีอยู่แล้วแต่ไม่อยู่ในไฟล์ — ต้องไม่ถูกลบ
curl -s -X POST localhost:4000/api/spare-parts -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"partCode\":\"${P}D\",\"name\":\"ฝาครอบทดสอบ\",\"brand\":\"$B\"}" >/dev/null

xlsx() { NODE_PATH=backend/node_modules node tests/fixtures-parts-xlsx.js "$DIR/$1" "$2"; }
IMP() { local who=$1 file=$2; shift 2; curl -s -X POST localhost:4000/api/spare-parts/import -H "$(H $who)" -F "file=@$DIR/$file;filename=$file" "$@"; }
COUNT() { DB "select count(*) from \"SparePart\" where \"partCode\" like '$P%'"; }
MD5() { DB "select md5(i.data) from \"SparePartImage\" i join \"SparePart\" p on p.id=i.\"sparePartId\" where p.\"partCode\"='$1'"; }

HEAD='["ลำดับ","รูปภาพประกอบ","รหัสสินค้า","ชื่อรวม (ไทย)","ยี่ห้อสินค้า","หมวดหมู่","Pant No."]'
M1=$(xlsx r1.xlsx "{\"headers\":$HEAD,\"rows\":[
  [1,null,\"${P,,}a\",\"ปั๊ม   น้ำทิ้ง\n(ทดสอบ)\",\"$B\",\"ปั๊ม\",\"W111 , W222\"],
  [2,null,\"${P}B\",\"สายพานทดสอบ\",\"$B\",null,null],
  [3,null,\"${P}C\",\"ลูกยางทดสอบ\",\"$B\",null,70613801],
  [4,null,null,\"แถวไม่มีรหัส\",\"$B\",null,null]
], \"images\":{\"B2\":\"a1-$SUF\",\"B3\":\"b1-$SUF\"}}")

# ── รอบแรก: ดูตัวอย่าง ──
R=$(IMP $A r1.xlsx)
[ "$(echo "$R" | J 'JSON.stringify(d.summary)')" = '{"rows":3,"changed":3,"created":3,"updated":0,"images":2,"same":0,"skipped":1,"notInFile":1}' ] \
  && pass "ดูตัวอย่าง: เพิ่ม 3 · รูป 2 · ข้าม 1 · ยี่ห้อเดียวกันไม่อยู่ในไฟล์ 1" || fail "สรุปตัวอย่าง: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
[ "$(COUNT)" = "1" ] && pass "ดูตัวอย่างไม่บันทึกอะไรลงฐานข้อมูล" || fail "ดูตัวอย่างแล้วมีอะไหล่เพิ่ม ($(COUNT))"
[ "$(echo "$R" | J '[d.columns.partCode,d.columns.name,d.columns.partNo,d.columns.image].join("|")')" = "รหัสสินค้า|ชื่อรวม (ไทย)|Pant No.|รูปภาพประกอบ" ] \
  && pass "หาคอลัมน์เจอ รวม \"Pant No.\" ที่สะกดผิดมาจากไฟล์จริง" || fail "คอลัมน์: $(echo "$R" | J 'JSON.stringify(d.columns)')"
echo "$R" | J 'const a=d.items.find(i=>i.partCode==="'$P'A"); a&&a.name==="ปั๊ม น้ำทิ้ง (ทดสอบ)"&&a.partNo==="W111, W222"&&d.items.find(i=>i.partCode==="'$P'C").partNo==="70613801"?"ok":"bad"' | grep -q ok \
  && pass "รหัสเป็นตัวพิมพ์ใหญ่ · ช่องว่างซ้ำ/ขึ้นบรรทัดในชื่อถูกรวบ · Part No. จัดรูป · Part No. ที่เป็นตัวเลขอ่านได้" || fail "ค่าที่อ่าน: $(echo "$R" | J 'JSON.stringify(d.items)')"
echo "$R" | J 'd.problems.length===1&&d.problems[0].line===5&&/ไม่มีรหัสสินค้า/.test(d.problems[0].note)&&d.notInFile[0].partCode==="'$P'D"&&d.notInFile[0].usedIn===0?"ok":"bad"' | grep -q ok \
  && pass "แถวไม่มีรหัสบอกเลขแถว · อะไหล่ที่ไม่อยู่ในไฟล์บอกว่ายังไม่เคยใช้ในใบงาน" || fail "problems/notInFile: $(echo "$R" | J 'JSON.stringify([d.problems,d.notInFile])')"
echo "$R" | J 'Object.keys(d.thumbs).sort().join(",")==="'$P'A,'$P'B"&&/^data:image\/jpeg;base64,/.test(d.thumbs["'$P'A"])?"ok":"bad"' | grep -q ok \
  && pass "หน้าตรวจได้รูปย่อของแถวที่จะใส่รูป" || fail "thumbs: $(echo "$R" | J 'Object.keys(d.thumbs||{})')"

[ "$(IMP $A r1.xlsx -F apply=true | J 'd.error')" = "ไม่มีรหัสรอบอัปเดต — ลองเลือกไฟล์ใหม่" ] && pass "บันทึกต้องมีรหัสรอบอัปเดต" || fail "apply ไม่มี batchId"
[ "$(COUNT)" = "1" ] && pass "คำขอที่ไม่มีรหัสรอบไม่บันทึกอะไร" || fail "บันทึกทั้งที่ไม่มีรหัสรอบ"

# ── รอบแรก: บันทึก ──
R=$(IMP $A r1.xlsx -F apply=true -F batchId=$B1)
[ "$(echo "$R" | J 'd.applied+"|"+d.summary.created+"|"+d.summary.images')" = "true|3|2" ] && pass "บันทึก: เพิ่ม 3 · รูป 2" || fail "บันทึก: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
ROW=$(DB "select \"partCode\"||'|'||name||'|'||brand||'|'||category||'|'||\"partNo\"||'|'||(\"imageUrl\"='/api/spare-parts/'||id||'/image') from \"SparePart\" where upper(\"partCode\")='${P}A'")
[ "$ROW" = "${P}A|ปั๊ม น้ำทิ้ง (ทดสอบ)|$B|ปั๊ม|W111, W222|true" ] && pass "ฐานข้อมูล: รหัส ชื่อ ยี่ห้อ หมวด Part No. ลิงก์รูป ครบ" || fail "แถว A: $ROW"
[ "$(MD5 ${P}A)" = "$(echo "$M1" | J 'd.B2')" ] && [ "$(MD5 ${P}B)" = "$(echo "$M1" | J 'd.B3')" ] && [ -z "$(MD5 ${P}C)" ] \
  && pass "ฐานข้อมูล: รูปตรงกับไฟล์ทุกไบต์ (md5) · แถวไม่มีรูปไม่ได้รูป" || fail "md5: A=$(MD5 ${P}A) B=$(MD5 ${P}B) C=$(MD5 ${P}C)"
[ "$(DB "select \"partNo\" from \"SparePart\" where \"partCode\"='${P}C'")" = "70613801" ] && pass "ฐานข้อมูล: Part No. ตัวเลขเก็บเป็นข้อความ" || fail "Part No. C"
[ "$(DB "select count(*) from \"SparePartImport\" where \"batchId\"='$B1' and \"fileName\"='r1.xlsx' and \"byName\" is not null and (summary->>'created')::int=3")" = "1" ] \
  && pass "ฐานข้อมูล: เก็บประวัติรอบอัปเดต (ไฟล์ · คนทำ · สรุป)" || fail "ไม่มีประวัติรอบ"
GET=$(curl -s -o /dev/null -w '%{http_code}|%{content_type}' "localhost:4000/api/spare-parts/$(DB "select id from \"SparePart\" where \"partCode\"='${P}A'")/image")
[ "$GET" = "200|image/jpeg" ] && pass "รูปที่ใส่จากไฟล์เปิดได้จากลิงก์รูปอะไหล่" || fail "เปิดรูป: $GET"

# ── รอบสอง: แก้ไข / เหมือนเดิม / ช่องว่างคงค่าเดิม / รหัสซ้ำในไฟล์ / เก็บรูปเดิม ──
UPD_A=$(DB "select \"updatedAt\" from \"SparePart\" where \"partCode\"='${P}A'")
M2=$(xlsx r2.xlsx "{\"headers\":$HEAD,\"rows\":[
  [1,null,\"${P}A\",\"ปั๊ม น้ำทิ้ง (ทดสอบ)\",null,null,\"W111, W333\"],
  [2,null,\"${P}B\",\"สายพานทดสอบ\",\"$B\",null,null],
  [3,null,\"${P}C\",\"ลูกยางประตูทดสอบ\",\"$B\",null,null],
  [4,null,\"${P}E\",\"ใบพัดทดสอบ\",\"$B\",\"ปั๊ม\",\"WP-9\"],
  [5,null,\"${P}C\",\"ลูกยางประตูทดสอบ (แถวหลัง)\",\"$B\",null,null]
], \"images\":{\"B2\":\"a2-$SUF\",\"B3\":\"b1-$SUF\",\"B5\":\"e1-$SUF\"}}")
R=$(IMP $A r2.xlsx)
[ "$(echo "$R" | J 'JSON.stringify(d.summary)')" = '{"rows":4,"changed":3,"created":1,"updated":2,"images":2,"same":1,"skipped":0,"notInFile":1}' ] \
  && pass "ดูตัวอย่างรอบสอง: เพิ่ม 1 · แก้ไข 2 · รูป 2 (แทน 1 ใหม่ 1) · เหมือนเดิม 1" || fail "สรุปรอบสอง: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
echo "$R" | J 'const a=d.items.find(i=>i.partCode==="'$P'A"); a.image==="CHANGED"&&a.diffs.length===1&&a.diffs[0].label==="Part No."&&a.diffs[0].from==="W111, W222"&&a.diffs[0].to==="W111, W333"?"ok":"bad"' | grep -q ok \
  && pass "แก้ไข: บอกเฉพาะช่องที่ต่าง ค่าเดิม → ค่าใหม่ · ยี่ห้อ/หมวดที่เว้นว่างไม่นับว่าต่าง" || fail "diff A: $(echo "$R" | J 'JSON.stringify(d.items.find(i=>i.partCode==="'$P'A"))')"
echo "$R" | J '!d.items.some(i=>i.partCode==="'$P'B")?"ok":"bad"' | grep -q ok \
  && pass "แถวที่เหมือนเดิม (รวมรูปเดิมไบต์เดียวกัน) ไม่อยู่ในรายการเปลี่ยน" || fail "B อยู่ในรายการ"
echo "$R" | J 'const c=d.items.find(i=>i.partCode==="'$P'C"); c.line===6&&c.name==="ลูกยางประตูทดสอบ (แถวหลัง)"&&d.problems.some(p=>p.note==="รหัสซ้ำในไฟล์ (แถว 4 และ 6) — ใช้แถว 6")?"ok":"bad"' | grep -q ok \
  && pass "รหัสซ้ำในไฟล์: ใช้แถวหลัง และบอกว่าซ้ำแถวไหน" || fail "ซ้ำ: $(echo "$R" | J 'JSON.stringify(d.problems)')"
K=$(IMP $A r2.xlsx -F replaceImages=false)
[ "$(echo "$K" | J 'd.summary.images+"|"+d.items.find(i=>i.partCode==="'$P'A").image')" = "1|KEPT" ] \
  && pass "เลือกเก็บรูปเดิม: รูปที่ต่างไม่นับเป็นรูปที่จะเปลี่ยน" || fail "KEPT: $(echo "$K" | J 'JSON.stringify(d.summary)')"

R=$(IMP $A r2.xlsx -F apply=true -F batchId=$B2 -F replaceImages=false)
[ "$(echo "$R" | J 'd.summary.created+"|"+d.summary.updated+"|"+d.summary.images')" = "1|2|1" ] && pass "บันทึกรอบสอง (เก็บรูปเดิม): เพิ่ม 1 · แก้ 2 · รูป 1" || fail "บันทึกรอบสอง: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
ROW=$(DB "select name||'|'||brand||'|'||category||'|'||\"partNo\" from \"SparePart\" where \"partCode\"='${P}A'")
[ "$ROW" = "ปั๊ม น้ำทิ้ง (ทดสอบ)|$B|ปั๊ม|W111, W333" ] && pass "ฐานข้อมูล: ช่องว่างในไฟล์คงค่าเดิม (ยี่ห้อ หมวด) · Part No. เปลี่ยน" || fail "A หลังรอบสอง: $ROW"
[ "$(MD5 ${P}A)" = "$(echo "$M1" | J 'd.B2')" ] && pass "ฐานข้อมูล: เลือกเก็บรูปเดิม → รูปไม่เปลี่ยน" || fail "รูป A ถูกแทน"
[ "$(DB "select name from \"SparePart\" where \"partCode\"='${P}C'")" = "ลูกยางประตูทดสอบ (แถวหลัง)" ] && pass "ฐานข้อมูล: รหัสซ้ำใช้ค่าจากแถวหลัง" || fail "C"
[ "$(MD5 ${P}E)" = "$(echo "$M2" | J 'd.B5')" ] && [ "$(DB "select category||'|'||\"partNo\" from \"SparePart\" where \"partCode\"='${P}E'")" = "ปั๊ม|WP-9" ] \
  && pass "ฐานข้อมูล: อะไหล่ใหม่ได้ข้อมูลและรูปครบ" || fail "E"
[ "$(DB "select count(*) from \"SparePart\" where \"partCode\"='${P}D'")" = "1" ] && pass "ฐานข้อมูล: อะไหล่ยี่ห้อเดียวกันที่ไม่อยู่ในไฟล์ไม่ถูกลบ" || fail "D ถูกลบ"
[ "$(DB "select \"updatedAt\" > '$UPD_A' from \"SparePart\" where \"partCode\"='${P}A'")" = "t" ] && pass "ฐานข้อมูล: แก้แล้วเวลาแก้ล่าสุดขยับ (ตัวกันแคชรูปในแอป)" || fail "updatedAt A ไม่ขยับ"

# ไฟล์ที่สองในรอบเดียวกัน — แทนรูป (ค่าตั้งต้น)
UPD_A=$(DB "select \"updatedAt\" from \"SparePart\" where \"partCode\"='${P}A'")
xlsx r3.xlsx "{\"headers\":[\"รหัสสินค้า\",\"ชื่อสินค้า\",\"รูป\"],\"rows\":[[\"${P}A\",\"ปั๊ม น้ำทิ้ง (ทดสอบ)\",null]],\"images\":{\"C2\":\"a2-$SUF\"}}" >/dev/null
R=$(IMP $PA r3.xlsx -F apply=true -F batchId=$B2)
[ "$(echo "$R" | J 'd.summary.images+"|"+d.summary.updated')" = "1|0" ] && pass "แอดมินอะไหล่อัปเดตได้ · แทนรูปเดิมเป็นค่าตั้งต้น" || fail "PA apply: $(echo "$R" | J 'JSON.stringify(d.summary)||d.error')"
[ "$(MD5 ${P}A)" != "$(echo "$M1" | J 'd.B2')" ] && [ "$(DB "select \"updatedAt\" > '$UPD_A' from \"SparePart\" where \"partCode\"='${P}A'")" = "t" ] \
  && pass "ฐานข้อมูล: รูปถูกแทน และเวลาแก้ล่าสุดขยับ (รูปใหม่ไม่ติดแคช)" || fail "รูปไม่ถูกแทน"

# ── ประวัติ / รายงาน ──
L=$(curl -s localhost:4000/api/spare-parts/imports/latest -H "$(H $A)")
echo "$L" | J 'd.batchId==="'$B2'"&&d.files.length===2&&d.totals.changed===4&&d.totals.created===1&&d.totals.updated===2&&d.totals.images===2&&!("details" in d.files[0])?"ok":"bad"' | grep -q ok \
  && pass "รอบล่าสุด: รวมทุกไฟล์ในรอบ (2 ไฟล์) ไม่ส่งรายละเอียด" || fail "latest: $L"
BT=$(curl -s localhost:4000/api/spare-parts/imports/batch/$B2 -H "$(H $PA)")
echo "$BT" | J 'd.files[0].details.items.some(i=>i.partCode==="'$P'A"&&i.diffs[0].to==="W111, W333")&&d.files[0].details.notInFile.some(p=>p.partCode==="'$P'D")?"ok":"bad"' | grep -q ok \
  && pass "รายงานรอบ: มีรายละเอียดค่าเดิม → ค่าใหม่ และอะไหล่ที่ไม่อยู่ในไฟล์" || fail "batch: $(echo "$BT" | head -c 300)"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/spare-parts/imports/batch/nope123 -H "$(H $A)")" = "404" ] && pass "รอบที่ไม่มี = 404" || fail "batch ไม่มี"
XL=$(curl -s localhost:4000/api/spare-parts/imports/batch/$B2/excel -H "$(H $A)")
XP=$(echo "$XL" | J 'd.path')
curl -s -o "$DIR/report.xlsx" "localhost:4000$XP" -H "$(H $A)"
REP=$(NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const ws=wb.worksheets[0]; const out=[];
    ws.eachRow((r)=>out.push(r.values.slice(1).join("¦"))); console.log(out.join("\n")); });' "$DIR/report.xlsx")
echo "$REP" | grep -q "^r2.xlsx¦2¦${P}A¦.*¦แก้ไข¦Part No.: W111, W222 → W111, W333" \
  && echo "$REP" | grep -q "¦${P}D¦.*¦ไม่อยู่ในไฟล์ (ไม่ลบ)¦" \
  && echo "$REP" | grep -q "^r3.xlsx¦2¦${P}A¦.*¦รูป¦แทนรูปเดิมด้วยรูปในไฟล์" \
  && pass "รายงาน Excel: แถวละอะไหล่ ค่าเดิม → ค่าใหม่ แยกไฟล์ ($(echo "$XL" | J 'd.filename'))" || fail "Excel: $(echo "$REP" | head -5)"

# ── ไฟล์ผิดรูป / สิทธิ์ ──
xlsx bad.xlsx '{"headers":["ชื่อสินค้า","ราคา"],"rows":[["ก",1]]}' >/dev/null
[ "$(IMP $A bad.xlsx | J 'd.error')" = "หาคอลัมน์ “รหัสสินค้า” ไม่เจอ — ไฟล์นี้ไม่ได้อัปเดต" ] && pass "ไฟล์ไม่มีคอลัมน์รหัสสินค้า: บอกชัดว่าไฟล์นี้ไม่ได้อัปเดต" || fail "bad header"
echo "ไม่ใช่ excel" > "$DIR/x.xlsx"
[ "$(IMP $A x.xlsx | J 'd.error')" = "อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx)" ] && pass "ไฟล์ที่ไม่ใช่ Excel: แจ้งเป็นภาษาไทย" || fail "not xlsx"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4000/api/spare-parts/import -H "$(H $S)" -F "file=@$DIR/r1.xlsx")" = "403" ] \
  && [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4000/api/spare-parts/import -H "$(H $T)" -F "file=@$DIR/r1.xlsx")" = "403" ] \
  && [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/spare-parts/imports/latest -H "$(H $T)")" = "403" ] \
  && pass "หัวหน้าภาค/ช่างอัปเดตและดูประวัติไม่ได้" || fail "สิทธิ์ S/T"

# ── Part No. ในหน้าจัดการ/ค้นหา ──
[ "$(curl -s "localhost:4000/api/spare-parts?search=w333" -H "$(H $T)" | J 'd.map(p=>p.partCode).join(",")')" = "${P}A" ] \
  && pass "ค้นหาด้วย Part No. เจอ (ช่างก็ค้นได้)" || fail "search partNo"
AID=$(DB "select id from \"SparePart\" where \"partCode\"='${P}A'")
curl -s -X PUT localhost:4000/api/spare-parts/$AID -H "$(H $A)" -H 'Content-Type: application/json' -d '{"partNo":"  "}' >/dev/null
[ "$(DB "select coalesce(\"partNo\",'NULL') from \"SparePart\" where id=$AID")" = "NULL" ] && pass "ล้างช่อง Part No. ในฟอร์ม = เก็บเป็น null" || fail "PUT partNo ว่าง"
curl -s -X PUT localhost:4000/api/spare-parts/$AID -H "$(H $A)" -H 'Content-Type: application/json' -d '{"name":"ปั๊ม น้ำทิ้ง (ทดสอบ)"}' >/dev/null
[ "$(DB "select coalesce(\"partNo\",'NULL') from \"SparePart\" where id=$AID")" = "NULL" ] && pass "แก้ช่องอื่นไม่แตะ Part No." || fail "PUT ไม่ส่ง partNo"

# ── แก้จากตรวจโค้ด ──
BB="ZZผสาน$SUF"
# แถวชื่อเรื่องเหนือหัวตาราง (มีคำว่ารหัสสินค้า) · หัวตารางสองชั้นผสานลงมา (แถว 3 = หัวย่อย "ไทย") ·
# อะไหล่ที่ผสานรหัส/ชื่อลงสองแถว (แถว 4-5) · รหัสเป็นลิงก์ที่ข้อความจัดรูปแบบบางส่วน
M3=$(xlsx m1.xlsx "{\"title\":\"ข้อมูลรหัสสินค้าอะไหล่ ทดสอบ\",
  \"headers\":[\"ลำดับ\",\"รูปภาพประกอบ\",\"รหัสสินค้า\",\"ชื่อรวม\",\"ยี่ห้อสินค้า\",\"Part No.\"],
  \"rows\":[[null,null,null,\"ไทย\",null,null],
    [1,null,\"${P}M1\",\"มอเตอร์ทดสอบ\",\"$BB\",\"MX-1\"],
    [null,null,null,null,null,null],
    [2,null,{\"text\":{\"richText\":[{\"text\":\"${P}\"},{\"font\":{\"bold\":true},\"text\":\"M2\"}]},\"hyperlink\":\"https://example.com/p\"},\"ลิงก์ทดสอบ\",\"$BB\",null]],
  \"merges\":[\"A2:A3\",\"B2:B3\",\"C2:C3\",\"E2:E3\",\"F2:F3\",\"C4:C5\",\"D4:D5\"],
  \"images\":{\"B4\":\"m1-$SUF\"}}")
R=$(IMP $A m1.xlsx)
echo "$R" | J 'd.columns.partCode==="รหัสสินค้า"&&d.items.length===2&&!d.items.some(i=>/รหัสสินค้า|ไทย/.test(i.partCode+i.name))&&d.problems.length===0?"ok":"bad"' | grep -q ok \
  && pass "หัวตารางสองชั้น + แถวชื่อเรื่อง: ไม่มีอะไหล่ปลอมจากหัวตาราง ไม่มีรหัสซ้ำปลอม" || fail "หัวตารางผสาน: $(echo "$R" | J 'JSON.stringify([d.columns,d.items.map(i=>i.partCode+"|"+i.name),d.problems])||d.error')"
echo "$R" | J 'const m=d.items.find(i=>i.partCode==="'$P'M1"); m&&m.line===4&&m.partNo==="MX-1"&&m.image==="NEW"?"ok":"bad"' | grep -q ok \
  && pass "อะไหล่ที่ผสานรหัสลงสองแถว: ใช้แถวจริง (รูป + Part No. ไม่หาย)" || fail "แถวผสาน: $(echo "$R" | J 'JSON.stringify(d.items)')"
echo "$R" | J 'd.items.some(i=>i.partCode==="'$P'M2"&&i.name==="ลิงก์ทดสอบ")?"ok":"bad"' | grep -q ok \
  && pass "รหัสที่เป็นลิงก์ข้อความจัดรูปแบบอ่านได้" || fail "ลิงก์ rich text: $(echo "$R" | J 'JSON.stringify(d.items.map(i=>i.partCode))')"
IMP $A m1.xlsx -F apply=true -F batchId=$B3ID >/dev/null
[ "$(MD5 ${P}M1)" = "$(echo "$M3" | J 'd.B4')" ] && [ "$(DB "select count(*) from \"SparePart\" where name in ('ไทย','ชื่อรวม') and brand='$BB'")" = "0" ] \
  && pass "ฐานข้อมูล: รูปของแถวผสานเข้า · ไม่มีอะไหล่ชื่อหัวตาราง" || fail "ฐานข้อมูลหลังไฟล์ผสาน"
[ "$(DB "select count(*) from \"SparePartImport\" where \"batchId\" in ('$B1','$B3ID') and summary ? 'incomplete'")" = "0" ] \
  && pass "อัปเดตสำเร็จ: ประวัติไม่ติดป้ายอัปเดตไม่ครบ (เขียนประวัติก่อนลงมือแล้วแก้ทีหลัง)" || fail "ป้าย incomplete ค้าง"

# รูปเดิมเป็นลิงก์ภายนอก (สคริปต์นำเข้าเก่า) — "เก็บรูปเดิม" ต้องไม่ทับ · แทนรูป = เปลี่ยน
curl -s -X POST localhost:4000/api/spare-parts -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"partCode\":\"${P}X\",\"name\":\"รูปภายนอกทดสอบ\",\"brand\":\"$BB\",\"imageUrl\":\"https://example.com/zz.jpg\"}" >/dev/null
MX=$(xlsx x1.xlsx "{\"headers\":[\"รหัสสินค้า\",\"ชื่อสินค้า\",\"รูป\"],\"rows\":[[\"${P}X\",\"รูปภายนอกทดสอบ\",null]],\"images\":{\"C2\":\"x1-$SUF\"}}")
[ "$(IMP $A x1.xlsx -F replaceImages=false | J 'd.items[0].image+"|"+d.summary.images')" = "KEPT|0" ] \
  && [ "$(IMP $A x1.xlsx | J 'd.items[0].image')" = "CHANGED" ] \
  && pass "รูปเดิมเป็นลิงก์ภายนอก = มีรูปแล้ว (เก็บ = KEPT · แทน = CHANGED) ไม่ใช่ 'เดิมไม่มีรูป'" || fail "ลิงก์ภายนอก: $(IMP $A x1.xlsx -F replaceImages=false | J 'JSON.stringify(d.items)')"
IMP $A x1.xlsx -F replaceImages=false -F apply=true -F batchId=$B3ID >/dev/null
[ "$(DB "select \"imageUrl\" from \"SparePart\" where \"partCode\"='${P}X'")" = "https://example.com/zz.jpg" ] && [ -z "$(MD5 ${P}X)" ] \
  && pass "ฐานข้อมูล: เลือกเก็บรูปเดิม ลิงก์รูปภายนอกยังอยู่" || fail "ลิงก์ภายนอกถูกทับ"
IMP $A x1.xlsx -F apply=true -F batchId=$B3ID >/dev/null
XID=$(DB "select id from \"SparePart\" where \"partCode\"='${P}X'")
[ "$(DB "select \"imageUrl\" from \"SparePart\" where id=$XID")" = "/api/spare-parts/$XID/image" ] && [ "$(MD5 ${P}X)" = "$(echo "$MX" | J 'd.C2')" ] \
  && pass "ฐานข้อมูล: เลือกแทนรูป ลิงก์ภายนอกถูกแทนด้วยรูปในไฟล์" || fail "แทนลิงก์ภายนอก"
# อัปเดตรอบก่อนพังหลังเขียนรูปแต่ก่อนเขียนลิงก์รูป — ไบต์เท่าเดิมแต่ลิงก์หาย ต้องซ่อมให้ ไม่ใช่ "เหมือนเดิม" ตลอดไป
DB "update \"SparePart\" set \"imageUrl\"=null where id=$XID" >/dev/null
[ "$(IMP $A x1.xlsx | J 'd.items.length&&d.items[0].image')" = "NEW" ] && IMP $A x1.xlsx -F apply=true -F batchId=$B3ID >/dev/null \
  && [ "$(DB "select \"imageUrl\" from \"SparePart\" where id=$XID")" = "/api/spare-parts/$XID/image" ] \
  && pass "รูปเข้าแล้วแต่ลิงก์รูปหาย: อัปเดตซ้ำแล้วลิงก์กลับมา" || fail "ซ่อมลิงก์รูป: $(DB "select coalesce(\"imageUrl\",'NULL') from \"SparePart\" where id=$XID")"

# ยี่ห้อเดียวแยกสองไฟล์ในรอบเดียว (ไฟล์ใหญ่เกิน 50 MB) — "ไม่อยู่ในไฟล์" นับทั้งรอบ ตัวละครั้ง
curl -s -X POST localhost:4000/api/spare-parts -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"partCode\":\"${P}Y\",\"name\":\"ไม่อยู่ทั้งสองไฟล์\",\"brand\":\"$BB\"}" >/dev/null
xlsx s1.xlsx "{\"headers\":[\"รหัสสินค้า\",\"ชื่อสินค้า\",\"ยี่ห้อ\"],\"rows\":[[\"${P}M1\",\"มอเตอร์ทดสอบ\",\"$BB\"]]}" >/dev/null
xlsx s2.xlsx "{\"headers\":[\"รหัสสินค้า\",\"ชื่อสินค้า\",\"ยี่ห้อ\"],\"rows\":[[\"${P}M2\",\"ลิงก์ทดสอบ (แก้)\",\"$BB\"],[\"${P}X\",\"รูปภายนอกทดสอบ\",\"$BB\"]]}" >/dev/null
IMP $A s1.xlsx -F apply=true -F batchId=$B4ID >/dev/null
IMP $A s2.xlsx -F apply=true -F batchId=$B4ID >/dev/null
BT=$(curl -s localhost:4000/api/spare-parts/imports/batch/$B4ID -H "$(H $A)")
[ "$(echo "$BT" | J 'd.totals.notInFile+"|"+d.notInFile.map(g=>g.partCode).join(",")')" = "1|${P}Y" ] \
  && pass "สองไฟล์ยี่ห้อเดียวกัน: ไม่อยู่ในไฟล์เหลือเฉพาะตัวที่ไม่อยู่ทั้งสองไฟล์ (นับครั้งเดียว)" || fail "notInFile รอบ: $(echo "$BT" | J 'JSON.stringify([d.totals,d.notInFile])')"
[ "$(curl -s localhost:4000/api/spare-parts/imports/latest -H "$(H $A)" | J 'd.totals.notInFile+"|"+("notInFile" in d)')" = "1|false" ] \
  && pass "แถบอัปเดตล่าสุด: นับไม่อยู่ในไฟล์แบบทั้งรอบ (ไม่ส่งรายการ)" || fail "latest notInFile"
XP=$(curl -s localhost:4000/api/spare-parts/imports/batch/$B4ID/excel -H "$(H $A)" | J 'd.path')
curl -s -o "$DIR/r4.xlsx" "localhost:4000$XP" -H "$(H $A)"
REP=$(NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const out=[]; wb.worksheets[0].eachRow((r)=>out.push(r.values.slice(1).join("¦"))); console.log(out.join("\n")); });' "$DIR/r4.xlsx")
[ "$(echo "$REP" | grep -c "ไม่อยู่ในไฟล์ (ไม่ลบ)")" = "1" ] && echo "$REP" | grep -q "^(ทุกไฟล์ในรอบ)¦¦${P}Y¦" \
  && pass "รายงาน Excel: ไม่อยู่ในไฟล์แถวเดียว (ทั้งรอบ)" || fail "Excel notInFile: $(echo "$REP" | grep "ไม่อยู่ในไฟล์")"

# แถวที่ข้าม (ไม่มีชื่อ) อยู่ในไฟล์ — ไม่ใช่ "ไม่อยู่ในไฟล์" ด้วย · Part No. ยาวเกินข้ามแถว
LONG=$(printf 'W%.0s' $(seq 1 2001))
xlsx s3.xlsx "{\"headers\":[\"รหัสสินค้า\",\"ชื่อสินค้า\",\"ยี่ห้อ\",\"Part No.\"],\"rows\":[[\"${P}M1\",\"มอเตอร์ทดสอบ\",\"$BB\",null],[\"${P}Y\",null,\"$BB\",null],[\"${P}L\",\"ยาวทดสอบ\",\"$BB\",\"$LONG\"]]}" >/dev/null
R=$(IMP $A s3.xlsx)
echo "$R" | J '!d.notInFile.some(g=>g.partCode==="'$P'Y")&&d.notInFile.some(g=>g.partCode==="'$P'M2")&&d.problems.some(p=>p.partCode==="'$P'Y"&&/ไม่มีชื่อ/.test(p.note))?"ok":"bad"' | grep -q ok \
  && pass "แถวที่ข้ามเพราะไม่มีชื่อ ไม่ขึ้นซ้ำว่าไม่อยู่ในไฟล์" || fail "problem+notInFile: $(echo "$R" | J 'JSON.stringify([d.notInFile.map(g=>g.partCode),d.problems])')"
echo "$R" | J 'd.problems.some(p=>p.partCode==="'$P'L"&&p.note==="Part No. ยาวเกิน 2,000 ตัวอักษร — ข้ามแถวนี้")&&!d.items.some(i=>i.partCode==="'$P'L")?"ok":"bad"' | grep -q ok \
  && pass "Part No. ยาวเกิน 2,000 ตัวอักษร: ข้ามแถว บอกเหตุผล (ฟอร์มแก้ไขรับได้เท่านี้)" || fail "Part No. ยาว: $(echo "$R" | J 'JSON.stringify(d.problems)')"

# ฟอร์มอะไหล่: ข้อความผิดพลาดเป็นภาษาไทย ไม่ใช่โครง zod
MID=$(DB "select id from \"SparePart\" where \"partCode\"='${P}M1'")
[ "$(curl -s -X PUT localhost:4000/api/spare-parts/$MID -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"partNo\":\"$LONG\"}" | J 'd.error')" = "Part No. ยาวเกิน 2,000 ตัวอักษร" ] \
  && [ "$(curl -s -X PUT localhost:4000/api/spare-parts/$MID -H "$(H $A)" -H 'Content-Type: application/json' -d '{"name":""}' | J 'd.error')" = "ต้องกรอกชื่ออะไหล่" ] \
  && pass "ฟอร์มอะไหล่: ข้อผิดพลาดเป็นภาษาไทย (Part No. ยาวเกิน · ไม่กรอกชื่อ)" || fail "ข้อความฟอร์ม: $(curl -s -X PUT localhost:4000/api/spare-parts/$MID -H "$(H $A)" -H 'Content-Type: application/json' -d '{"name":""}')"

# ── รูปที่เบราว์เซอร์ย่อก่อนส่ง (ไฟล์เกิน 50 MB) — เทียบด้วยค่ารูปต้นฉบับ ไม่ใช่ไบต์ที่ย่อ ──
HH='["รหัสสินค้า","ชื่อสินค้า","รูป"]'
O=$(xlsx h0.xlsx "{\"headers\":$HH,\"rows\":[[\"${P}H\",\"แฮชทดสอบ\",null]],\"images\":{\"C2\":\"orig-$SUF\"}}")
SHA_O=$(echo "$O" | J 'd._sha.C2')
S1=$(xlsx h1.xlsx "{\"headers\":$HH,\"rows\":[[\"${P}H\",\"แฮชทดสอบ\",null]],\"images\":{\"C2\":\"shrunk1-$SUF\"}}")
xlsx h2.xlsx "{\"headers\":$HH,\"rows\":[[\"${P}H\",\"แฮชทดสอบ\",null]],\"images\":{\"C2\":\"shrunk2-$SUF\"}}" >/dev/null
HASHES="{\"xl/media/image1.jpeg\":\"$SHA_O\"}"
IMP $A h1.xlsx -F "imageHashes=$HASHES" -F apply=true -F batchId=$B5ID >/dev/null
[ "$(DB "select i.\"sourceHash\"||'|'||md5(i.data) from \"SparePartImage\" i join \"SparePart\" p on p.id=i.\"sparePartId\" where p.\"partCode\"='${P}H'")" = "$SHA_O|$(echo "$S1" | J 'd.C2')" ] \
  && pass "ฐานข้อมูล: เก็บรูปที่ย่อแล้ว + ค่ารูปต้นฉบับ (sourceHash)" || fail "sourceHash: $(DB "select coalesce(i.\"sourceHash\",'NULL') from \"SparePartImage\" i join \"SparePart\" p on p.id=i.\"sparePartId\" where p.\"partCode\"='${P}H'")"
[ "$(IMP $A h2.xlsx -F "imageHashes=$HASHES" | J 'd.items.length+"|"+d.summary.images+"|"+d.summary.same')" = "0|0|1" ] \
  && pass "ย่อใหม่ได้ไบต์ต่าง แต่ต้นฉบับเดิม = เหมือนเดิม (ไม่ขึ้นว่าเปลี่ยนรูปทุกรอบ)" || fail "ย่อใหม่: $(IMP $A h2.xlsx -F "imageHashes=$HASHES" | J 'JSON.stringify([d.items,d.summary])')"
[ "$(IMP $A h0.xlsx | J 'd.items.length+"|"+d.summary.same')" = "0|1" ] \
  && pass "ไฟล์ต้นฉบับที่ไม่ได้ย่อ (รูปเดิม) = เหมือนเดิม" || fail "ต้นฉบับ: $(IMP $A h0.xlsx | J 'JSON.stringify(d.items)')"
[ "$(IMP $A h2.xlsx -F 'imageHashes={"../x.jpeg":"zz","xl/media/image1.jpeg":"ไม่ใช่แฮช"}' | J 'd.items[0]&&d.items[0].image')" = "CHANGED" ] \
  && pass "ค่ารูปต้นฉบับผิดรูปแบบถูกทิ้ง (ใช้ไบต์ที่ส่งมาแทน)" || fail "imageHashes ผิดรูปแบบ"
HID=$(DB "select id from \"SparePart\" where \"partCode\"='${P}H'")
printf '\xff\xd8\xff\xe0manual-%s\xff\xd9' "$SUF" > "$DIR/manual.jpg"
curl -s -X POST localhost:4000/api/spare-parts/$HID/image -H "$(H $A)" -F "image=@$DIR/manual.jpg;type=image/jpeg" >/dev/null
[ "$(DB "select coalesce(\"sourceHash\",'NULL') from \"SparePartImage\" where \"sparePartId\"=$HID")" = "NULL" ] \
  && [ "$(IMP $A h0.xlsx | J 'd.items[0]&&d.items[0].image')" = "CHANGED" ] \
  && pass "อัปโหลดรูปเองในแอป: ล้างค่าต้นฉบับ — ไฟล์เดิมขึ้นว่ารูปต่างจากที่อัปโหลด" || fail "อัปโหลดเองไม่ล้าง sourceHash"

[ -z "$FAILED" ]
