#!/bin/bash
# ทดสอบ: เลือกอะไหล่ตามไฟล์ยี่ห้อ (เจ้าของงานขอ ต.ค. 69 · ตอบคำถามไฟล์ยี่ห้อ 31 ต.ค. 69)
#   ไฟล์ของอะไหล่ = ชื่อไฟล์ Excel ที่อัปโหลด (Haier · Huebsch · Maytag · Oasis · Spinz · Other) เก็บใน SparePartBrandFile
#   รหัสเดียวอยู่ได้หลายไฟล์ · Other = ของใช้ร่วม ทุกเครื่องเลือกได้ · ไฟล์ยี่ห้อด้วยกันไม่ข้ามกัน
#   A1 ค้นอะไหล่ตามยี่ห้อเครื่อง GET /spare-parts/for-brand — กลุ่มไฟล์ของเครื่อง + กลุ่มของใช้ร่วม · "HB" = Huebsch
#      · ยี่ห้ออื่น = Other · รหัสตรงทั้งคำขึ้นก่อน · ไม่เจอ → บอกว่าอยู่ไฟล์ไหน · ไม่อยู่ในไฟล์ไหน/นอกสโตร์ไม่ขึ้นเลย · สิทธิ์
#   A2 อัปโหลดตามชื่อไฟล์ — ชื่อบอกยี่ห้อ / ไม่บอก (ต้องเลือก) / บอกหลายยี่ห้อ · ชื่อที่ตรงยี่ห้อเดียวเปลี่ยนไม่ได้
#      · ทุกรหัสในไฟล์เข้าไฟล์ยี่ห้อ เพิ่มอย่างเดียวไม่ลบ · "ไม่อยู่ในไฟล์" นับตามไฟล์ยี่ห้อ · หัวช่อง "อัปเดต {วันที่}"
#      · อัปไฟล์เดิมที่ไม่มีอะไรเปลี่ยนซ้ำ: แถวที่เดาตอนขึ้นระบบ (SEED) ยังนับเป็นงาน (confirmed) และกลายเป็น IMPORT
#   A3 หน้าจัดการข้อมูลอะไหล่ — brandFiles ในรายการ · ติ๊กไฟล์ในฟอร์ม (แถวที่ยังอยู่เก็บ source เดิม · ไม่แตะ updatedAt) · สิทธิ์
#      · อัปไฟล์ที่มีรหัสที่ติ๊กเอง (MANUAL) → IMPORT · รอบเดียวหลายยี่ห้อ: "ไม่อยู่ในไฟล์" หักเฉพาะไฟล์ยี่ห้อเดียวกัน
#        (หายจาก Haier แต่ยังอยู่ใน Other = ยังฟ้อง Haier) · หายจากสองไฟล์ = สองแถว
#   B  หน้าใบงาน — partsBrand (รู้ยี่ห้อ / ไม่รู้ / ไม่มีเครื่อง / ยี่ห้อจากรายงานชนะ / "HB") · อะไหล่ในใบมี brandFiles + issued
#      · เครื่องของสาขา (ฟอร์มเปิดใบงาน) มี make + brandFile · กระดานเครื่องดับมี machineMake + brandFiles ของอะไหล่ที่รอ
#      · ตัวเลือกยี่ห้อมี Spinz · CASE ใน tests/lib/fixture-parts.sh ให้ไฟล์เดียวกับ brandFileOf ของเซิร์ฟเวอร์ทุกคำทดสอบ
#   (กลุ่ม C เป็นต้นไป — ช่างเลือก/หัวหน้าภาคคอนเฟิร์ม/ตีกลับ/ล็อกยี่ห้อทุกเส้นทาง — มากับก้อนถัดไป)
#
# อะไหล่ทดสอบสร้างทาง SQL และใส่ไฟล์เอง (source MANUAL) · ช่องยี่ห้อตั้งเป็นข้อความที่ไม่เกี่ยวโดยตั้งใจ —
# พิสูจน์ว่าการค้นดูไฟล์ ไม่ได้ดูข้อความยี่ห้อ (NB1 มีข้อความ "HB - Huebsch" แต่ไม่อยู่ในไฟล์ไหน ต้องไม่ขึ้นที่ไหนเลย)
# ทุกข้อที่เปลี่ยนข้อมูลยืนยันที่ฐานข้อมูล (CLAUDE.md) · ลบทุกอย่างที่สร้างตอนจบ (trap)
#
# หยุดกลางทาง = FAIL (run-all.sh นับแค่บรรทัด PASS/FAIL — set -e จบเงียบ ๆ ชุดนี้จะดูเหมือนผ่าน)
set -eE
_pp_died() {
  if [ "${BASH_SUBSHELL:-0}" -eq 0 ]; then echo "FAIL สคริปต์หยุดกลางทาง (บรรทัด $1): $2"; fi
}
trap '_pp_died "$LINENO" "$BASH_COMMAND"' ERR
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PUT() { curl -s -X PUT "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# ค้นอะไหล่ตามยี่ห้อเครื่อง: FB <token> <ยี่ห้อ> [คำค้น]
FB() { curl -s -G localhost:4000/api/spare-parts/for-brand -H "$(H $1)" --data-urlencode "brand=$2" --data-urlencode "search=${3:-}"; }
FBCODE() { CODE -G localhost:4000/api/spare-parts/for-brand -H "$(H $1)" --data-urlencode "brand=$2" --data-urlencode "search=${3:-}"; }

SUF=$((RANDOM % 90000 + 10000))
K="ZPK-$SUF"            # รหัสอะไหล่ทดสอบ
DIR=$(mktemp -d)
BID=$(DB "select id from \"Branch\" where code='C0006'")
ORDERS=""
MCODES=""
OUTAGES=""
# ทีละคำสั่ง ไม่ใช่ psql -c ก้อนเดียว: หลายคำสั่งใน -c คือ transaction เดียว — คำสั่งแรกพัง (เช่น id ใบงานเพี้ยน)
# จะย้อนการลบทุกอย่าง ทิ้งผู้ใช้ PARTS_ADMIN/AREA รหัสผ่าน test1234 และอะไหล่ในไฟล์ Other ที่ไปโผล่ในช่องของใช้ร่วมของชุดอื่น
# และเกิดตอนที่ชุดนี้พังอยู่แล้วพอดี · || : กัน set -e ตัดการลบที่เหลือ
cleanup() {
  for w in $ORDERS; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$w" -H "$(H $A)"; done
  local codes ids outs; codes=$(for c in $MCODES; do printf "'%s'," "$c"; done); ids=$(echo $ORDERS | tr ' ' ','); outs=$(echo $OUTAGES | tr ' ' ',')
  DB "delete from \"WorkOrder\" where id in (${ids:-0})" >/dev/null 2>&1 || :
  # เคสเครื่องดับก่อนอะไหล่ — OutagePart ชี้อะไหล่แบบไม่ cascade ลบอะไหล่ก่อนจะติด
  DB "delete from \"Outage\" where id in (${outs:-0})" >/dev/null 2>&1 || :
  DB "delete from \"Machine\" where \"branchId\"=$BID and code in (${codes}'-')" >/dev/null 2>&1 || :
  DB "delete from \"SparePartImport\" where \"fileName\" like '%zpk-$SUF%'" >/dev/null 2>&1 || :
  DB "delete from \"SparePart\" where \"partCode\" like '$K-%' or \"partCode\" = '[นอกสโตร์] $K ของนอก'" >/dev/null 2>&1 || :
  DB "delete from \"User\" where \"employeeCode\" in ('ZPP$SUF','ZPR$SUF')" >/dev/null 2>&1 || :
  rm -rf "$DIR"
}
trap cleanup EXIT

A=$(login A001); S=$(login S001); T=$(login T001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZPP$SUF','แอดมินอะไหล่ทดสอบไฟล์ยี่ห้อ','PARTS_ADMIN','$HASH',false),
  ('ZPR$SUF','Area ทดสอบไฟล์ยี่ห้อ','AREA','$HASH',false)" >/dev/null
PA=$(login ZPP$SUF); AR=$(login ZPR$SUF)

# ── อะไหล่ทดสอบ ── ชื่อขึ้นต้นด้วยตัวอักษรอังกฤษให้ลำดับตามชื่อไม่ขึ้นกับ collation ภาษาไทยของฐาน
#   HB3 มีรหัส HB2 อยู่ในชื่อ (ค้นรหัส HB2 เจอทั้งคู่) · HM1 มี "$K-HB" อยู่ในชื่อและชื่อเรียงก่อนทุกตัว
DB "insert into \"SparePart\"(\"partCode\",name,brand,\"partNo\",\"offCatalog\",\"updatedAt\") values
  ('$K-HB1','c สายพานทดสอบไฟล์','ZZไม่เกี่ยว','PNZ$SUF',false,now()),
  ('$K-HB2','z บอร์ดหลักทดสอบไฟล์','ZZไม่เกี่ยว',null,false,now()),
  ('$K-HB3','b ใช้แทน $K-HB2','ZZไม่เกี่ยว',null,false,now()),
  ('$K-MT1','m มอเตอร์เมย์แท็กทดสอบ$SUF','ZZไม่เกี่ยว',null,false,now()),
  ('$K-OA1','o ลูกยางโอเอซิสทดสอบ','ZZไม่เกี่ยว',null,false,now()),
  ('$K-SZ1','s ปั๊มสปินซ์ทดสอบ','ZZไม่เกี่ยว',null,false,now()),
  ('$K-OT1','k น้ำยาของใช้ร่วมทดสอบ','ZZไม่เกี่ยว',null,false,now()),
  ('$K-HM1','a ชุดซ่อม $K-HB ร่วม','ZZไม่เกี่ยว',null,false,now()),
  ('$K-MO1','d สวิตช์ประตูใช้ร่วมทดสอบ','ZZไม่เกี่ยว',null,false,now()),
  ('$K-NB1','n ไม่อยู่ในไฟล์ไหนทดสอบ','HB - Huebsch',null,false,now()),
  ('[นอกสโตร์] $K ของนอก','$K ของนอก',null,null,true,now());
  insert into \"SparePartBrandFile\"(\"sparePartId\",file,source)
  select p.id, f.file, 'MANUAL' from \"SparePart\" p join (values
    ('$K-HB1','Huebsch'),('$K-HB2','Huebsch'),('$K-HB3','Huebsch'),('$K-MT1','Maytag'),('$K-OA1','Oasis'),
    ('$K-SZ1','Spinz'),('$K-OT1','Other'),('$K-HM1','Huebsch'),('$K-HM1','Maytag'),('$K-MO1','Maytag'),('$K-MO1','Other'),
    ('[นอกสโตร์] $K ของนอก','Huebsch')) as f(code,file) on f.code=p.\"partCode\"" >/dev/null
PID() { DB "select id from \"SparePart\" where \"partCode\"='$1'"; }
FILES() { DB "select coalesce(string_agg(b.file||':'||b.source, ',' order by b.file),'') from \"SparePartBrandFile\" b join \"SparePart\" p on p.id=b.\"sparePartId\" where p.\"partCode\"='$1'"; }
# รหัสในแต่ละกลุ่ม (ตัด "$K-" ออก) · ชื่อตัวแปรไม่ใช่ GROUPS — bash จองชื่อนั้นไว้ (กลุ่มของผู้ใช้ เขียนทับไม่ได้)
GRPX='const c=(a)=>a.map(x=>x.partCode.replace("'$K'-","")).join(","); "file="+d.file+" rows="+c(d.rows)+" shared="+c(d.shared)'

echo "═══ A1 ค้นอะไหล่ตามยี่ห้อเครื่อง (GET /spare-parts/for-brand)"
R=$(FB $T Huebsch "$K")
[ "$(echo "$R" | J "$GRPX")" = "file=Huebsch rows=HM1,HB3,HB1,HB2 shared=MO1,OT1" ] \
  && pass "เครื่อง Huebsch: กลุ่มไฟล์ Huebsch = HB1–HB3 + HM1 (อยู่สองไฟล์) · ของใช้ร่วม = OT1 + MO1 · ไม่มี MT1/OA1/SZ1/NB1/ของนอกสโตร์" \
  || fail "Huebsch: $(echo "$R" | J "$GRPX" 2>&1 | head -c 300)"
echo "$R" | J 'const h=d.rows.find(r=>r.partCode==="'$K'-HM1"), m=d.shared.find(r=>r.partCode==="'$K'-MO1"); h.brandFiles.join(",")==="Huebsch,Maytag"&&m.brandFiles.join(",")==="Maytag,Other"&&d.rows[0].name&&"partNo" in d.rows[0]&&"brand" in d.rows[0]?"ok":"bad"' | grep -q ok \
  && pass "แถวผลค้นมีรหัส ชื่อ Part No. ยี่ห้อ และไฟล์ทุกไฟล์ที่อะไหล่อยู่ (HM1 = Huebsch,Maytag · MO1 = Maytag,Other)" \
  || fail "ช่องของแถว: $(echo "$R" | J 'JSON.stringify(d.rows[0])' 2>&1 | head -c 300)"
OUT=""
for b in "Huebsch (TC)" "HB" "HB - Huebsch" "hb_2026"; do OUT="$OUT$(FB $T "$b" "$K-HB1" | J 'd.file+":"+d.rows.map(r=>r.partCode).join("")')|"; done
[ "$OUT" = "Huebsch:$K-HB1|Huebsch:$K-HB1|Huebsch:$K-HB1|Huebsch:$K-HB1|" ] \
  && [ "$(FB $T "THB" "$K-HB1" | J 'd.file+":"+d.rows.length')" = "Other:0" ] \
  && pass "\"Huebsch (TC)\" · \"HB\" · \"HB - Huebsch\" · \"hb_2026\" → ไฟล์ Huebsch · \"THB\" ไม่ใช่ HB แบบเป็นคำ → Other" \
  || fail "จับคำ Huebsch: $OUT / THB=$(FB $T "THB" "$K-HB1" | J 'd.file' 2>&1)"
[ "$(FB $T OASIS "$K" | J "$GRPX")" = "file=Oasis rows=OA1 shared=MO1,OT1" ] && [ "$(FB $T "Oasis(TC)" "$K" | J 'd.file')" = "Oasis" ] \
  && pass "\"OASIS\" / \"Oasis(TC)\" → ไฟล์ Oasis (OA1 + ของใช้ร่วม)" || fail "Oasis: $(FB $T OASIS "$K" | J "$GRPX" 2>&1)"
[ "$(FB $T Spinz "$K" | J "$GRPX")" = "file=Spinz rows=SZ1 shared=MO1,OT1" ] \
  && pass "\"Spinz\" → ไฟล์ Spinz (SZ1 + ของใช้ร่วม)" || fail "Spinz: $(FB $T Spinz "$K" | J "$GRPX" 2>&1)"
[ "$(FB $T Electrolux "$K" | J "$GRPX")" = "file=Other rows=MO1,OT1 shared=" ] \
  && pass "ยี่ห้อที่ไม่มีไฟล์ของตัวเอง (Electrolux) → ไฟล์ Other กลุ่มเดียว = OT1 + MO1 · ไม่มีกลุ่มของใช้ร่วมซ้ำ" \
  || fail "Electrolux: $(FB $T Electrolux "$K" | J "$GRPX" 2>&1)"
[ "$(FB $T Maytag "$K" | J "$GRPX")" = "file=Maytag rows=HM1,MO1,MT1 shared=OT1" ] \
  && pass "เครื่อง Maytag: HM1 MT1 MO1 อยู่กลุ่มไฟล์ Maytag · MO1 (Maytag+Other) ไม่ซ้ำในของใช้ร่วม" \
  || fail "Maytag: $(FB $T Maytag "$K" | J "$GRPX" 2>&1)"
R=$(FB $T Huebsch "$K-MT1")
[ "$(echo "$R" | J 'd.rows.length+"|"+d.shared.length+"|"+JSON.stringify(d.elsewhere)')" = '0|0|[{"file":"Maytag","exact":true}]' ] \
  && pass "รหัส MT1 บนเครื่อง Huebsch: ไม่ขึ้นในกลุ่มไหน · บอกว่าอยู่ไฟล์ Maytag (รหัสตรงทั้งคำ)" \
  || fail "elsewhere รหัส: $(echo "$R" | head -c 300)"
[ "$(FB $T Huebsch "เมย์แท็กทดสอบ$SUF" | J 'JSON.stringify(d.elsewhere)')" = '[{"file":"Maytag","exact":false}]' ] \
  && pass "ค้นด้วยชื่อบางส่วน: บอกไฟล์ Maytag แต่ไม่นับว่ารหัสตรง (exact false)" \
  || fail "elsewhere ชื่อ: $(FB $T Huebsch "เมย์แท็กทดสอบ$SUF" | head -c 300)"
NB=""
for b in Huebsch Maytag Other Electrolux; do NB="$NB$(FB $T "$b" "$K-NB1" | J 'd.rows.length+d.shared.length+d.elsewhere.length')"; done
[ "$NB" = "0000" ] && [ "$(FB $T Huebsch "HB - Huebsch" | J 'd.rows.concat(d.shared).some(r=>r.partCode==="'$K'-NB1")')" = "false" ] \
  && pass "อะไหล่ที่ไม่อยู่ในไฟล์ไหน (NB1) ไม่ขึ้นที่ไหนเลย — แม้ค้นด้วยข้อความยี่ห้อของมันเอง (\"HB - Huebsch\")" || fail "NB1 ขึ้น: $NB"
[ "$(FB $T Huebsch "$K ของนอก" | J 'd.rows.length+d.shared.length+d.elsewhere.length')" = "0" ] \
  && pass "ของนอกสโตร์ไม่ขึ้นในการค้น แม้มีแถวไฟล์ Huebsch (ใส่ทาง SQL)" || fail "ของนอกสโตร์ขึ้น"
[ "$(FB $T Huebsch "$K-HB2" | J 'd.rows.map(r=>r.partCode.replace("'$K'-","")).join(",")')" = "HB2,HB3" ] \
  && [ "$(FB $T Huebsch "$K-HB" | J 'd.rows.map(r=>r.partCode.replace("'$K'-","")).join(",")')" = "HB3,HB1,HB2,HM1" ] \
  && pass "เรียงรหัสตรงทั้งคำก่อน (HB2 ก่อน HB3 ทั้งที่ชื่อ HB2 เรียงทีหลัง) · แล้วรหัสขึ้นต้นด้วยคำค้น · ชื่อที่มีคำค้นอยู่ท้าย (HM1)" \
  || fail "ลำดับ: $(FB $T Huebsch "$K-HB2" | J 'd.rows.map(r=>r.partCode).join(",")') / $(FB $T Huebsch "$K-HB" | J 'd.rows.map(r=>r.partCode).join(",")')"
[ "$(FB $T Huebsch "pnz$SUF" | J 'd.rows.map(r=>r.partCode).join(",")')" = "$K-HB1" ] && [ "$(FB $T Huebsch "ZZไม่เกี่ยว" | J 'd.rows.length+d.shared.length')" = "0" ] \
  && [ "$(FB $T Huebsch "$K-H%" | J 'd.rows.length+d.shared.length+d.elsewhere.length')" = "0" ] \
  && pass "ค้นด้วย Part No. ได้ (ไม่สนตัวพิมพ์) · ไม่ค้นข้อความยี่ห้อ · % ในคำค้นไม่ใช่ wildcard" \
  || fail "ช่องที่ค้น: pn=$(FB $T Huebsch "pnz$SUF" | J 'd.rows.length') brand=$(FB $T Huebsch "ZZไม่เกี่ยว" | J 'd.rows.length')"
[ "$(FB $T Huebsch | J 'd.file+"|"+d.rows.length+"|"+d.shared.length+"|"+("updatedAt" in d)')" = "Huebsch|0|0|true" ] \
  && [ "$(curl -s -G localhost:4000/api/spare-parts/for-brand -H "$(H $T)" --data-urlencode "brand=  " | J 'd.error')" = "ต้องระบุยี่ห้อเครื่อง" ] \
  && pass "ไม่มีคำค้น = หัวช่องอย่างเดียว (ไฟล์ + วันอัปเดต ไม่มีรายการ) · ไม่ส่งยี่ห้อ = 400 ภาษาไทย" || fail "หัวช่อง/400"
[ "$(FBCODE $AR Huebsch "$K")" = "403" ] \
  && [ "$(FBCODE $T Huebsch "$K")|$(FBCODE $S Huebsch "$K")|$(FBCODE $A Huebsch "$K")|$(FBCODE $PA Huebsch "$K")" = "200|200|200|200" ] \
  && pass "Area ค้นไม่ได้ (403) · ช่าง หัวหน้าภาค แอดมิน แอดมินอะไหล่ ค้นได้" || fail "สิทธิ์ for-brand: AR=$(FBCODE $AR Huebsch x)"

echo
echo "═══ A2 อัปโหลดไฟล์อะไหล่ — ไฟล์ยี่ห้อมาจากชื่อไฟล์"
xlsx() { NODE_PATH=backend/node_modules node tests/fixtures-parts-xlsx.js "$DIR/$1" "$2" >/dev/null; }
IMP() { local who=$1 file=$2; shift 2; curl -s -X POST localhost:4000/api/spare-parts/import -H "$(H $who)" -F "file=@$DIR/$file;filename=$file" "$@"; }
HD='["รหัสสินค้า","ชื่อรวม (ไทย)","ยี่ห้อสินค้า"]'
U3ROWS="[\"$K-U1\",\"u1 ใบพัดอัปโหลดทดสอบ\",\"HB - Huebsch\"],[\"$K-U2\",\"u2 ซีลอัปโหลดทดสอบ\",\"HB - Huebsch\"],[\"$K-U3\",\"u3 ลูกปืนอัปโหลดทดสอบ\",\"HB - Huebsch\"]"
for f in "Huebsch-zpk-$SUF.xlsx" "HB zpk-$SUF.xlsx" "Haier-zpk-$SUF.xlsx" "zpk-$SUF.xlsx" "Haier Other zpk-$SUF.xlsx"; do
  xlsx "$f" "{\"headers\":$HD,\"rows\":[$U3ROWS]}"
done
BRANDS='d.brandFile+"|"+d.brandFileFrom+"|"+JSON.stringify(d.brandFileMatches)'
[ "$(IMP $A "Huebsch-zpk-$SUF.xlsx" | J "$BRANDS")" = 'Huebsch|name|[]' ] \
  && pass "ดูตัวอย่าง Huebsch-zpk….xlsx → ไฟล์ Huebsch (จากชื่อไฟล์)" || fail "Huebsch-zpk: $(IMP $A "Huebsch-zpk-$SUF.xlsx" | J "$BRANDS" 2>&1 | head -c 200)"
[ "$(IMP $A "HB zpk-$SUF.xlsx" | J "$BRANDS")" = 'Huebsch|name|[]' ] \
  && pass "\"HB zpk….xlsx\" → ไฟล์ Huebsch (\"HB\" แบบเป็นคำ = Huebsch)" || fail "HB zpk: $(IMP $A "HB zpk-$SUF.xlsx" | J "$BRANDS" 2>&1 | head -c 200)"
R=$(IMP $A "zpk-$SUF.xlsx")
[ "$(echo "$R" | J "$BRANDS"'+"|"+d.summary.joined+"|"+d.notInFile.length')" = 'null|null|[]|0|0' ] \
  && pass "ชื่อไฟล์ไม่บอกยี่ห้อ (zpk….xlsx) → ไฟล์ยี่ห้อว่าง ให้หน้าตรวจถาม · ยังไม่นับเข้าไฟล์/ไม่อยู่ในไฟล์" \
  || fail "zpk ไม่บอกยี่ห้อ: $(echo "$R" | J "$BRANDS" 2>&1 | head -c 200)"
NIMP() { DB "select count(*) from \"SparePartImport\" where \"fileName\" like '%zpk-$SUF%'"; }
R=$(IMP $A "zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb1$SUF)
[ "$(echo "$R" | J 'd.error')" = "ไฟล์ zpk-$SUF.xlsx ยังไม่ได้เลือกยี่ห้อ — เลือกที่หน้าตรวจก่อนกดอัปเดต" ] && [ "$(NIMP)" = "0" ] \
  && [ "$(DB "select count(*) from \"SparePart\" where \"partCode\" like '$K-U%'")" = "0" ] \
  && pass "บันทึกไฟล์ที่ยังไม่ได้เลือกยี่ห้อ → 400 ภาษาไทย · ไม่มีแถวประวัติ ไม่มีอะไหล่เพิ่ม" || fail "apply ไม่เลือกยี่ห้อ: $(echo "$R" | head -c 200) · ประวัติ $(NIMP)"
R=$(IMP $A "zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb1$SUF -F brandFile=maytag)
[ "$(echo "$R" | J 'd.applied+"|"+d.brandFile+"|"+d.brandFileFrom+"|"+d.summary.joined')" = "true|Maytag|chosen|3" ] \
  && [ "$(FILES $K-U1)|$(FILES $K-U2)|$(FILES $K-U3)" = "Maytag:IMPORT|Maytag:IMPORT|Maytag:IMPORT" ] \
  && [ "$(DB "select \"brandFile\"||'|'||(summary->>'joined') from \"SparePartImport\" where \"batchId\"='zpkb1$SUF'")" = "Maytag|3" ] \
  && pass "เลือก Maytag แล้วบันทึก (ตัวพิมพ์เล็กก็รับ): U1–U3 อยู่ไฟล์ Maytag (IMPORT) · ประวัติเก็บไฟล์ยี่ห้อ + เข้าไฟล์ใหม่ 3" \
  || fail "apply Maytag: $(echo "$R" | J 'JSON.stringify([d.summary,d.brandFile,d.error])' 2>&1 | head -c 300) · $(FILES $K-U1)"
UPD_U1=$(DB "select \"updatedAt\" from \"SparePart\" where \"partCode\"='$K-U1'")
R=$(IMP $A "Haier-zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb2$SUF)
[ "$(echo "$R" | J 'd.brandFile+"|"+d.summary.joined+"|"+d.summary.same')" = "Haier|3|3" ] \
  && [ "$(FILES $K-U1)|$(FILES $K-U3)" = "Haier:IMPORT,Maytag:IMPORT|Haier:IMPORT,Maytag:IMPORT" ] \
  && [ "$(DB "select \"updatedAt\"='$UPD_U1' from \"SparePart\" where \"partCode\"='$K-U1'")" = "t" ] \
  && pass "รหัสเดิมในไฟล์ Haier → อยู่ทั้ง Maytag และ Haier (ไม่ทับกัน) · แถวที่เหมือนเดิมก็เข้าไฟล์ · updatedAt ของอะไหล่ไม่ขยับ (ตัวกันแคชรูป)" \
  || fail "สองไฟล์: $(echo "$R" | J 'JSON.stringify([d.summary,d.brandFile,d.error])' 2>&1 | head -c 300) · U1=$(FILES $K-U1)"
[ "$(IMP $A "Haier Other zpk-$SUF.xlsx" | J "$BRANDS")" = 'null|null|["Haier","Other"]' ] \
  && pass "ชื่อไฟล์ตรงสองยี่ห้อ (Haier Other …) → ไม่เดา ให้เลือก พร้อมบอกว่าตรง Haier, Other" \
  || fail "ตรงหลายยี่ห้อ: $(IMP $A "Haier Other zpk-$SUF.xlsx" | J "$BRANDS" 2>&1 | head -c 200)"
N0=$(NIMP)
R=$(IMP $A "Huebsch-zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb3$SUF -F brandFile=Oasis)
[ "$(echo "$R" | J 'd.error')" = "ชื่อไฟล์ Huebsch-zpk-$SUF.xlsx เป็นไฟล์ Huebsch — ถ้าไม่ใช่ เปลี่ยนชื่อไฟล์ก่อนอัปโหลด" ] && [ "$(NIMP)" = "$N0" ] \
  && [ "$(IMP $A "zpk-$SUF.xlsx" -F brandFile=Speed | J 'd.error')" = "ไฟล์ยี่ห้อไม่ถูกต้อง — เลือก Haier · Huebsch · Maytag · Oasis · Spinz หรือ Other" ] \
  && [ "$(FILES $K-U1)" = "Haier:IMPORT,Maytag:IMPORT" ] \
  && pass "ชื่อที่ตรง Huebsch ส่งเป็น Oasis → 400 (เปลี่ยนชื่อไฟล์ก่อน) ไม่บันทึก · ยี่ห้อนอกรายการ → 400" \
  || fail "บังคับยี่ห้อทับชื่อ: $(echo "$R" | head -c 200)"
xlsx "Haier-zpk-$SUF.xlsx" "{\"headers\":$HD,\"rows\":[[\"$K-U1\",\"u1 ใบพัดอัปโหลดทดสอบ\",null],[\"$K-U2\",\"u2 ซีลอัปโหลดทดสอบ\",null]]}"
R=$(IMP $A "Haier-zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb4$SUF)
echo "$R" | J 'const g=d.notInFile.filter(x=>x.partCode.startsWith("'$K'-"));g.length===1&&g[0].partCode==="'$K'-U3"&&g[0].file==="Haier"&&d.summary.joined===0?"ok":"bad"' | grep -q ok \
  && [ "$(FILES $K-U3)" = "Haier:IMPORT,Maytag:IMPORT" ] \
  && [ "$(curl -s localhost:4000/api/spare-parts/imports/batch/zpkb4$SUF -H "$(H $A)" | J 'd.files[0].brandFile+"|"+d.notInFile.filter(x=>x.partCode.startsWith("'$K'-")).map(x=>x.partCode+":"+x.file).join(",")')" = "Haier|$K-U3:Haier" ] \
  && pass "อัปโหลด Haier ซ้ำโดยไม่มี U3 → \"ไม่อยู่ในไฟล์\" บอก U3 (ไฟล์ Haier) · U3 ยังอยู่ไฟล์ Haier (เพิ่มอย่างเดียว ไม่เอาออก) · รายงานรอบมีไฟล์ยี่ห้อ" \
  || fail "อัปโหลดซ้ำ: $(echo "$R" | J 'JSON.stringify([d.notInFile.filter(x=>x.partCode.startsWith("'$K'-")),d.summary])' 2>&1 | head -c 300) · U3=$(FILES $K-U3)"
# แถวที่ migration เดาจากช่องยี่ห้อตอนขึ้นระบบ (SEED) — หลังเปิดใช้แอดมินอัปครบ 6 ไฟล์อีกรอบ (§15.6) ไฟล์ส่วนใหญ่ตรงฐานข้อมูลทุกช่อง
# ต้องยังมีงาน (confirmed) ให้กดอัปเดตได้ และแถวกลายเป็น IMPORT — ไม่งั้น SEED ที่ค้างดูเหมือนรหัสที่ไม่มีไฟล์ไหนยืนยัน
U2ID=$(PID $K-U2)
DB "update \"SparePartBrandFile\" set source='SEED' where \"sparePartId\"=$U2ID and file='Haier'" >/dev/null
P6=$(IMP $A "Haier-zpk-$SUF.xlsx" | J 'const s=d.summary; [d.brandFile,s.changed,s.joined,s.confirmed].join("|")')
F6=$(FILES $K-U2)
R=$(IMP $A "Haier-zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb6$SUF)
[ "$P6" = "Haier|0|0|1" ] && [ "$F6" = "Haier:SEED,Maytag:IMPORT" ] && [ "$(echo "$R" | J 'd.applied+"|"+d.summary.confirmed')" = "true|1" ] \
  && [ "$(FILES $K-U2)" = "Haier:IMPORT,Maytag:IMPORT" ] \
  && [ "$(DB "select (summary->>'confirmed')||'|'||(summary->>'joined') from \"SparePartImport\" where \"batchId\"='zpkb6$SUF'")" = "1|0" ] \
  && pass "อัปไฟล์ Haier เดิมซ้ำ (ไม่มีช่องไหนเปลี่ยน) ที่ U2 เป็น SEED: ดูตัวอย่างบอกยืนยัน 1 (ไม่เปลี่ยนฐานข้อมูล) · บันทึกแล้ว U2 Haier = IMPORT · ประวัติเก็บ confirmed" \
  || fail "ยืนยัน SEED: ตัวอย่าง $P6 (ก่อนบันทึก $F6) · $(echo "$R" | J 'JSON.stringify([d.summary,d.error])' 2>&1 | head -c 300) · U2=$(FILES $K-U2)"
# หัวช่อง "อัปเดต {วันที่}" = การอัปโหลดล่าสุดของไฟล์นั้น — ไฟล์ที่ไม่เคยอัปโหลดได้ null (เทียบกับฐานข้อมูลตรง ๆ ทุกไฟล์)
IMP $A "HB zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb5$SUF >/dev/null
ISO() { DB "select coalesce(to_char(max(\"createdAt\"),'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'null') from \"SparePartImport\" where \"brandFile\"='$1'"; }
UA=""; UE=""
for f in Huebsch Oasis Spinz Haier Maytag Other; do UA="$UA$f=$(FB $T "$f" | J 'd.updatedAt'),"; UE="$UE$f=$(ISO $f),"; done
OWN=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"SparePartImport\" where \"batchId\"='zpkb5$SUF'")
[ "$UA" = "$UE" ] && [ "$(FB $T Huebsch | J 'd.updatedAt')" = "$OWN" ] \
  && pass "หัวช่อง: updatedAt = อัปโหลดล่าสุดของไฟล์นั้น (Huebsch = รอบที่เพิ่งอัป) · ไฟล์ที่ไม่เคยอัปโหลด = null ($UA)" \
  || fail "updatedAt: API $UA / DB $UE / own $OWN"

echo
echo "═══ A3 หน้าจัดการข้อมูลอะไหล่ — ไฟล์ยี่ห้อของอะไหล่"
[ "$(curl -s -G localhost:4000/api/spare-parts -H "$(H $A)" --data-urlencode "search=$K-" | J 'const f=(c)=>d.find(p=>p.partCode==="'$K'-"+c).brandFiles.join("+")||"-"; [f("HM1"),f("NB1"),f("U1"),f("OT1")].join(" ")')" = "Huebsch+Maytag - Haier+Huebsch+Maytag Other" ] \
  && [ "$(curl -s localhost:4000/api/spare-parts/$(PID $K-MO1) -H "$(H $T)" | J 'd.brandFiles.join("+")')" = "Maytag+Other" ] \
  && pass "GET /spare-parts และ /spare-parts/:id มี brandFiles (เรียงตามลำดับไฟล์ · ไม่อยู่ในไฟล์ไหน = [])" \
  || fail "brandFiles ในรายการ: $(curl -s -G localhost:4000/api/spare-parts -H "$(H $A)" --data-urlencode "search=$K-HM1" | head -c 300)"
U1=$(PID $K-U1); UPD_U1=$(DB "select \"updatedAt\" from \"SparePart\" where id=$U1")
R=$(PUT $A spare-parts/$U1 '{"brandFiles":["Haier","Other"]}')
[ "$(echo "$R" | J 'd.brandFiles.join("+")')" = "Haier+Other" ] && [ "$(FILES $K-U1)" = "Haier:IMPORT,Other:MANUAL" ] \
  && [ "$(DB "select \"updatedAt\"='$UPD_U1' from \"SparePart\" where id=$U1")" = "t" ] \
  && pass "ติ๊กไฟล์ Haier+Other: ไฟล์เป็นตามนั้นพอดี (Huebsch/Maytag ออก) · Haier ที่ยังอยู่เก็บ IMPORT เดิม · Other ใหม่ = MANUAL · updatedAt ไม่ขยับ" \
  || fail "PUT brandFiles: $(echo "$R" | head -c 200) · $(FILES $K-U1)"
OC=$(DB "select id from \"SparePart\" where \"partCode\"='[นอกสโตร์] $K ของนอก'")
[ "$(PUT $A spare-parts/$U1 '{"brandFiles":["Speed Queen"]}' | J 'd.error')" = "ไฟล์ยี่ห้อไม่ถูกต้อง — เลือก Haier · Huebsch · Maytag · Oasis · Spinz หรือ Other" ] \
  && [ "$(PUT $A spare-parts/$U1 '{"brandFiles":["Haier","haier"]}' | J 'd.error')" = "ไฟล์ยี่ห้อไม่ถูกต้อง — เลือก Haier · Huebsch · Maytag · Oasis · Spinz หรือ Other" ] \
  && [ "$(PUT $A spare-parts/$OC '{"brandFiles":["Huebsch"]}' | J 'd.error')" = "อะไหล่นอกสโตร์ไม่อยู่ในไฟล์ยี่ห้อ" ] \
  && [ "$(FILES $K-U1)" = "Haier:IMPORT,Other:MANUAL" ] \
  && pass "ไฟล์นอกรายการ (Speed Queen) / ซ้ำ → 400 ภาษาไทย · ของนอกสโตร์ใส่ไฟล์ไม่ได้ · ไฟล์เดิมไม่เปลี่ยน" || fail "PUT ผิด: $(FILES $K-U1)"
MT1=$(PID $K-MT1)
R=$(PUT $PA spare-parts/$MT1 '{"brandFiles":[],"name":"m มอเตอร์เมย์แท็กทดสอบ'$SUF' (แก้)"}')
[ "$(echo "$R" | J 'd.brandFiles.length+"|"+d.name')" = "0|m มอเตอร์เมย์แท็กทดสอบ$SUF (แก้)" ] && [ "$(FILES $K-MT1)" = "" ] \
  && [ "$(CODE -X PUT localhost:4000/api/spare-parts/$MT1 -H "$(H $T)" -H 'Content-Type: application/json' -d '{"brandFiles":["Maytag"]}')" = "403" ] \
  && [ "$(FILES $K-MT1)" = "" ] \
  && pass "แอดมินอะไหล่ติ๊กไฟล์ได้ (ส่ง [] = ไม่อยู่ในไฟล์ไหน พร้อมแก้ชื่อในคำขอเดียว) · ช่างแก้ไม่ได้ (403) ไฟล์ไม่เปลี่ยน" \
  || fail "PA/T PUT: $(echo "$R" | head -c 200) · $(FILES $K-MT1)"
# รอบเดียวสองยี่ห้อ (แบบอัปครบ 6 ไฟล์ทีเดียว): Haier ไม่มี U2/U3 · Other มี U1 (ติ๊กเอง MANUAL) + U2
#   U2 หายจาก Haier แต่อยู่ใน Other ของรอบเดียวกัน → ยังต้องฟ้อง Haier (รหัสในไฟล์ Other ไม่ได้แปลว่ายังอยู่ไฟล์ Haier)
#   U3 อยู่ทั้ง Haier และ Other (ใส่ทาง SQL) แต่ไม่อยู่ทั้งสองไฟล์ → สองแถว (ต้องเอาออกทีละไฟล์ในฟอร์มอะไหล่)
DB "insert into \"SparePartBrandFile\"(\"sparePartId\",file,source) select id,'Other','MANUAL' from \"SparePart\" where \"partCode\"='$K-U3'" >/dev/null
xlsx "Haier-zpk-$SUF-b.xlsx" "{\"headers\":$HD,\"rows\":[[\"$K-U1\",\"u1 ใบพัดอัปโหลดทดสอบ\",null]]}"
xlsx "Other zpk-$SUF.xlsx" "{\"headers\":$HD,\"rows\":[[\"$K-U1\",\"u1 ใบพัดอัปโหลดทดสอบ\",null],[\"$K-U2\",\"u2 ซีลอัปโหลดทดสอบ\",null]]}"
IMP $A "Haier-zpk-$SUF-b.xlsx" -F apply=true -F batchId=zpkb7$SUF >/dev/null
R=$(IMP $A "Other zpk-$SUF.xlsx" -F apply=true -F batchId=zpkb7$SUF)
[ "$(echo "$R" | J 'd.brandFile+"|"+d.brandFileFrom+"|"+d.summary.joined+"|"+d.summary.confirmed')" = "Other|name|1|1" ] \
  && [ "$(FILES $K-U1)" = "Haier:IMPORT,Other:IMPORT" ] && [ "$(FILES $K-U2)" = "Haier:IMPORT,Huebsch:IMPORT,Maytag:IMPORT,Other:IMPORT" ] \
  && [ "$(FILES $K-U3)" = "Haier:IMPORT,Huebsch:IMPORT,Maytag:IMPORT,Other:MANUAL" ] \
  && pass "อัปไฟล์ Other: U1 ที่ติ๊กเอง (MANUAL) → IMPORT (ยืนยัน 1) · U2 เข้าไฟล์ Other ใหม่ (1) · U3 ที่ไม่อยู่ในไฟล์ยังอยู่ (เพิ่มอย่างเดียว)" \
  || fail "ยืนยัน MANUAL: $(echo "$R" | J 'JSON.stringify([d.brandFile,d.summary,d.error])' 2>&1 | head -c 300) · U1=$(FILES $K-U1) U2=$(FILES $K-U2) U3=$(FILES $K-U3)"
BT=$(curl -s localhost:4000/api/spare-parts/imports/batch/zpkb7$SUF -H "$(H $A)")
[ "$(echo "$BT" | J 'd.notInFile.filter(x=>x.partCode.startsWith("'$K'-")).map(x=>x.partCode.replace("'$K'-","")+":"+x.file).join(",")')" = "MO1:Other,OT1:Other,U2:Haier,U3:Haier,U3:Other" ] \
  && [ "$(echo "$BT" | J 'd.files.map(f=>f.brandFile).join(",")+"|"+(d.totals.notInFile===d.notInFile.length)+"|"+d.totals.joined')" = "Haier,Other|true|1" ] \
  && pass "รายงานรอบ Haier+Other: U2 ที่หายจาก Haier ยังฟ้อง (ไม่ถูกหักด้วยไฟล์ Other) · U3 หายจากสองไฟล์ = สองแถว · MO1/OT1 ของไฟล์ Other · ยอดรวมตรงรายการ" \
  || fail "รายงานรอบหลายยี่ห้อ: $(echo "$BT" | J 'JSON.stringify([d.notInFile.filter(x=>x.partCode.startsWith("'$K'-")),d.totals])' 2>&1 | head -c 400)"

echo
echo "═══ B หน้าใบงาน — ยี่ห้อเครื่องสำหรับช่องเลือกอะไหล่ (partsBrand) และไฟล์ของอะไหล่ในใบ"
# เครื่องทดสอบรหัสสุ่ม W9### ที่ยังไม่มีในสาขา C0006 — สร้างจากการเปิดใบงาน แล้วลบตอนจบ (ไม่แตะเครื่องที่มีอยู่)
c=$((9000 + RANDOM % 800)); n=0
while [ $n -lt 4 ]; do
  if [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$BID and code='W$c'")" = "0" ]; then MCODES="$MCODES W$c"; n=$((n + 1)); fi
  c=$((c + 1))
done
set -- $MCODES; MK=$1; MU=$2; MR=$3; MH=$4
OPENWO() { POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"$1\",\"priority\":\"NORMAL\",\"machines\":[$2]}" | J 'd.orders?d.orders[0].id:d.id??"ERR "+d.error'; }
# เก็บเฉพาะ id ที่เป็นตัวเลข — เปิดใบไม่ได้ (เช่นกฎล็อกยี่ห้อของก้อนหลังปฏิเสธ) บอกเป็น FAIL ที่นี่ ไม่ปล่อยค่าเพี้ยนไปพังตอนลบ
ADDWO() { case "$1" in '' | *[!0-9]*) fail "เปิดใบงานทดสอบไม่ได้: $1" ;; *) ORDERS="$ORDERS $1" ;; esac; }
W1=$(OPENWO CM "{\"code\":\"$MK\",\"model\":\"Huebsch\",\"symptom\":\"ทดสอบไฟล์ยี่ห้อ รู้ยี่ห้อ\"}"); ADDWO "$W1"
W2=$(OPENWO CM "{\"code\":\"$MU\",\"symptom\":\"ทดสอบไฟล์ยี่ห้อ ไม่รู้ยี่ห้อ\"}"); ADDWO "$W2"
W3=$(OPENWO CM "{\"code\":\"$MR\",\"symptom\":\"ทดสอบไฟล์ยี่ห้อ ยี่ห้อจากรายงาน\"}"); ADDWO "$W3"
W4=$(OPENWO CM "{\"code\":\"$MH\",\"symptom\":\"ทดสอบไฟล์ยี่ห้อ HB\"}"); ADDWO "$W4"
W5=$(OPENWO COIN_CHANGER "{\"model\":null,\"symptom\":\"ทดสอบไฟล์ยี่ห้อ ไม่มีเครื่อง\"}"); ADDWO "$W5"
DB "update \"Machine\" set brand='HB - Huebsch', model='Maytag' where \"branchId\"=$BID and code='$MR';
    update \"Machine\" set brand='HB', model=null where \"branchId\"=$BID and code='$MH'" >/dev/null
PB() { curl -s localhost:4000/api/work-orders/$1 -H "$(H $2)" | J 'JSON.stringify(d.partsBrand)'; }
[ "$(PB $W1 $A)" = "{\"machine\":true,\"make\":\"Huebsch\",\"file\":\"Huebsch\",\"fromReport\":false,\"machineCode\":\"$MK\"}" ] \
  && [ "$(DB "select coalesce(brand,'-')||'|'||model from \"Machine\" where \"branchId\"=$BID and code='$MK'")" = "-|Huebsch" ] \
  && pass "เครื่องที่รู้ยี่ห้อ (เลือก Huebsch ตอนเปิดใบ — Machine.model) → partsBrand ไฟล์ Huebsch · ไม่ได้มาจากรายงาน" \
  || fail "รู้ยี่ห้อ: $(PB $W1 $A)"
[ "$(PB $W2 $A)" = "{\"machine\":true,\"make\":null,\"file\":null,\"fromReport\":false,\"machineCode\":\"$MU\"}" ] \
  && [ "$(PB $W5 $A)" = '{"machine":false,"make":null,"file":null,"fromReport":false,"machineCode":null}' ] \
  && pass "เครื่องไม่รู้ยี่ห้อ → file ว่าง (ต้องกดยี่ห้อก่อน) · ใบที่ไม่มีเครื่อง → machine false (ไม่ล็อก)" \
  || fail "ไม่รู้ยี่ห้อ/ไม่มีเครื่อง: $(PB $W2 $A) / $(PB $W5 $A)"
BM=$(curl -s localhost:4000/api/branches/C0006/machines -H "$(H $T)" | J 'const m=d.find(x=>x.code==="'$MR'"), u=d.find(x=>x.code==="'$MU'"); [m.brand,m.model,m.make,m.brandFile,u.make,u.brandFile].join("|")')
[ "$(PB $W3 $A)" = "{\"machine\":true,\"make\":\"HB - Huebsch\",\"file\":\"Huebsch\",\"fromReport\":true,\"machineCode\":\"$MR\"}" ] \
  && [ "$BM" = "HB - Huebsch|Maytag|HB - Huebsch|Huebsch||" ] \
  && pass "ยี่ห้อจากรายงานเครื่องชนะยี่ห้อที่เลือก (HB - Huebsch ชนะ Maytag) · fromReport true · เครื่องของสาขามี make/brandFile ตรงกัน" \
  || fail "ยี่ห้อจากรายงาน: $(PB $W3 $A) · เครื่องของสาขา $BM"
[ "$(PB $W4 $A | J 'd.make+"|"+d.file+"|"+d.fromReport')" = "HB|Huebsch|true" ] \
  && pass "เครื่องยี่ห้อ \"HB\" เฉย ๆ (model ว่าง) → ไฟล์ Huebsch (เจ้าของงานยืนยัน HB = Huebsch)" || fail "HB: $(PB $W4 $A)"
DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",\"requisitionNo\") values
  ($W1,$(PID $K-HM1),1,'WAITING',true,'RQZ$SUF'),($W1,$(PID $K-NB1),2,'WAITING',null,null),($W1,$(PID $K-OT1),1,'USED',null,null)" >/dev/null
R=$(curl -s localhost:4000/api/work-orders/$W1 -H "$(H $A)")
[ "$(echo "$R" | J 'const s=(p)=>p.partCode.replace("'$K'-","")+":"+(p.brandFiles.join("+")||"-")+":"+p.issued; d.waitingParts.map(s).join(",")+" / "+d.parts.map(s).join(",")')" = "HM1:Huebsch+Maytag:true,NB1:-:false / OT1:Other:false" ] \
  && pass "อะไหล่ในใบมีไฟล์ยี่ห้อ (ไม่อยู่ในไฟล์ไหน = []) และ issued (มีของ + เลขใบเบิก) ทั้งรออะไหล่และใช้แล้ว" \
  || fail "partShape: $(echo "$R" | J 'JSON.stringify([d.waitingParts,d.parts])' 2>&1 | head -c 400)"
# กระดานเครื่องดับ: ช่องอะไหล่ที่รอ (ก้อนช่องเลือกอะไหล่) ล็อกตามยี่ห้อเครื่องที่ใช้จริง และติดป้ายตามไฟล์ของอะไหล่ — สองช่องนี้ต้องมาจากเซิร์ฟเวอร์
MRID=$(DB "select id from \"Machine\" where \"branchId\"=$BID and code='$MR'")
OUT1=$(DB "insert into \"Outage\"(kind,\"branchId\",\"machineId\",\"startedAt\",\"lastSeenAt\") values ('MACHINE_OFF',$BID,$MRID,now()-interval '2 hours',now()) returning id")
OUTAGES="$OUTAGES $OUT1"
DB "insert into \"OutagePart\"(\"outageId\",\"sparePartId\",quantity) values ($OUT1,$(PID $K-HM1),1)" >/dev/null
OG=$(curl -s -G localhost:4000/api/machines/outages -H "$(H $A)" --data-urlencode "search=$MR" | J 'const r=d.rows.find(x=>x.id==='$OUT1'); r?r.machineMake+"|"+r.parts.map(p=>p.partCode.replace("'$K'-","")+":"+p.brandFiles.join("+")).join(","):"ไม่มีแถว"')
[ "$OG" = "HB - Huebsch|HM1:Huebsch+Maytag" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/options -H "$(H $T)" | J 'd.machineModels.includes("Spinz")')" = "true" ] \
  && pass "กระดานเครื่องดับ: machineMake = ยี่ห้อที่ใช้จริง (HB - Huebsch) · อะไหล่ที่รอมีไฟล์ยี่ห้อ · ตัวเลือกยี่ห้อตอนเปิดใบมี Spinz" \
  || fail "กระดานเครื่องดับ/ตัวเลือก: $OG"
# CASE ใน tests/lib/fixture-parts.sh (ที่ทุกชุดใช้เลือกตัวแฝด) ต้องให้ไฟล์เดียวกับ brandFileOf ของเซิร์ฟเวอร์ทุกคำ
# ไม่งั้นพอกฎล็อกยี่ห้อมา เทสต์หลายสิบชุดส่งตัวแฝดที่เซิร์ฟเวอร์ถือว่าคนละไฟล์ แล้วพังไกลจากต้นเหตุ
# ตั้งยี่ห้อเครื่องของ W4 ทีละคำ เทียบไฟล์ของตัวแฝดที่ fx_part_code เลือก กับ partsBrand.file จาก API (brand มีค่าตลอด fx จึงไม่ตั้ง model)
. tests/lib/fixture-parts.sh
SYNC=""
for b in "Huebsch (TC)" "HB" "HB - Huebsch" "hb_2026" "THB" "อะไหล่HB" "(HB)" "HBHB" "HB2" "Haier/Maytag" "Maytag Spinz" \
  "OASIS" "Oasis(TC)" "haier" "MAYTAG" "Spinz" "Electrolux" "Speed Queen"; do
  DB "update \"Machine\" set brand='$b' where \"branchId\"=$BID and code='$MH'" >/dev/null
  case "$(fx_part_code "$W4" BOARD)" in
    *-HB) fx=Huebsch ;; *-HA) fx=Haier ;; *-MT) fx=Maytag ;; *-SZ) fx=Spinz ;; *-OT) fx=Other ;; SP-BOARD) fx=Oasis ;; *) fx="?" ;;
  esac
  api=$(PB $W4 $A | J 'd.file')
  [ "$fx" = "$api" ] || SYNC="$SYNC [$b] fixture=$fx api=$api"
done
DB "update \"Machine\" set brand='HB' where \"branchId\"=$BID and code='$MH'" >/dev/null
[ -z "$SYNC" ] \
  && pass "fixture-parts.sh กับ brandFileOf ให้ไฟล์เดียวกันทั้ง 18 คำ (HB แบบเป็นคำ · THB · Haier/Maytag · ยี่ห้ออื่น = Other …)" \
  || fail "fixture-parts.sh ไม่ตรงกับ brandFileOf:$SYNC"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
