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
#   C  ช่างเลือกอะไหล่ตอนตรวจหน้างาน → รอหัวหน้าภาคคอนเฟิร์ม (รายการยังไม่ลงใบ/กระดาน) · ล็อกไฟล์ยี่ห้อ (Maytag · ไม่อยู่ในไฟล์ไหน ·
#      นอกสโตร์ · ไม่มีเครื่อง) · เครื่องไม่รู้ยี่ห้อต้องส่งยี่ห้อ (จำไว้ที่ Machine.model) · ยี่ห้อที่รู้แล้วเปลี่ยนไม่ได้ · ของใช้ร่วม/หลายไฟล์
#      · ป้าย "หัวหน้าภาค · คอนเฟิร์มอะไหล่" ในหน้าใบงาน กล่องงาน version · หัวหน้าภาคระบุอะไหล่ทับไม่ได้ (409)
#   C2 ไม่เลือกอะไหล่ — แถวเดิมที่เอาออกหายจากใบจริง ยกเว้นของที่เบิกแล้ว · แอปรุ่นเก่า (ไม่ส่ง parts) ไม่แตะรายการ
#   D  ตีกลับ — สิทธิ์ · เหตุผลบังคับ · pickId · ใบกลับตรวจหน้างานทีมเดิม · การ์ดแดงใน my-day · ทีม Area ไม่เห็นเหตุผล ·
#      ไม่ขึ้น "รอจัดแผน" · ด่านส่งใหม่สามแบบ · ส่งรอบ 2 (previous · เพิ่มใหม่) · แก้ผลตรวจ/เพิ่มรูปอย่างเดียวก็ส่งได้
#   E  คอนเฟิร์ม — สิทธิ์ (ช่าง · แอดมินอะไหล่ · ดูในฐานะ) · ตัวไม่ตรงคอนเฟิร์มไม่ได้ · ลงใบแทนของในสโตร์ทั้งชุด + อะไหล่นอก/ค่าบริการ ·
#      ประวัติ (ของที่เอาออก + เลขใบเบิก) · กล่องเขียว · ถึงกระดานตอนนี้ · แอดมินคอนเฟิร์มแทน · ยี่ห้อเครื่องเปลี่ยนหลังส่ง
#   F  หัวหน้าภาคบันทึกแทน — ลงใบเลย ไม่ต้องคอนเฟิร์มตัวเอง · ล็อกยี่ห้อเหมือนช่าง · ปิดรอบที่ถูกตีกลับ
#   G  ทุกทางออกปิดรอบ — ส่งตรวจใหม่ · ยกเลิก · ย้อนขั้น · ย้อนกลับไปตรวจแล้วการ์ดแดงเก่าไม่กลับมา · ส่งว่างหลังตีกลับ
#   J  คัดลอกเป็นใบทดสอบพารอบที่รอคอนเฟิร์มไปด้วย · ลบใบแล้วรอบหายตาม
#   (H/H2/I — ล็อกยี่ห้อเส้นทางเดิมทุกเส้น · แก้ยี่ห้อเครื่องจากหน้าใบงาน — มากับก้อนถัดไป)
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
  DB "delete from \"User\" where \"employeeCode\" in ('ZPP$SUF','ZPR$SUF','ZPT$SUF')" >/dev/null 2>&1 || :
  # ทีมของ T001 / ภาคของ S001 ที่กลุ่ม C ตั้งให้ตรงกับสาขา C0006 — คืนค่าเดิม (CLAUDE.md)
  if [ -n "${TID:-}" ]; then DB "update \"User\" set team=nullif('$OLD_TEAM','') where id=$TID" >/dev/null 2>&1 || :; fi
  if [ -n "${SID:-}" ]; then DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null 2>&1 || :; fi
  if [ -n "${VSTART:-}" ]; then DB "delete from \"ViewAsLog\" where id>$VSTART and \"byUserId\"=(select id from \"User\" where \"employeeCode\"='A001') and \"targetUserId\"=${SID:-0}" >/dev/null 2>&1 || :; fi
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
echo "═══ C ช่างเลือกอะไหล่ตอนตรวจหน้างาน → รอหัวหน้าภาคคอนเฟิร์ม (POST /work-orders/:id/inspection)"
# ทีมของ T001 = ทีมของสาขา C0006 (คืนค่าเดิมตอนจบใน cleanup) · S001 ดูแลภาคของ C0006
TEAM=$(DB "select zone from \"Branch\" where code='C0006'"); BREGION=$(DB "select region from \"Branch\" where code='C0006'")
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'"); TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID"); OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where id=$TID")
PATCHU() { curl -s -o /dev/null -X PATCH "localhost:4000/api/auth/users/$1" -H "$(H $A)" -H 'Content-Type: application/json' -d "$2"; }
PATCHU $SID "{\"region\":\"$BREGION\"}"; PATCHU $TID "{\"team\":\"$TEAM\"}"
TNAME=$(DB "select name from \"User\" where id=$TID"); SNAME=$(DB "select name from \"User\" where id=$SID")
# ช่างทีมอื่น — แก้ใบของทีมนี้ไม่ได้
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"passwordHash\",\"mustChangePassword\") values
  ('ZPT$SUF','ช่างทีมอื่นทดสอบเลือกอะไหล่','EMPLOYEE','ทีมทดสอบอื่น$SUF','$HASH',false)" >/dev/null
TX=$(login ZPT$SUF)
# A3 เอา MT1 ออกจากทุกไฟล์ไปแล้ว — กลุ่มนี้ต้องการ MT1 ในไฟล์ Maytag
DB "insert into \"SparePartBrandFile\"(\"sparePartId\",file,source) select id,'Maytag','MANUAL' from \"SparePart\" where \"partCode\"='$K-MT1' on conflict do nothing" >/dev/null
HB1=$(PID $K-HB1); HB2=$(PID $K-HB2); HB3=$(PID $K-HB3); MT1=$(PID $K-MT1); OT1=$(PID $K-OT1)
HM1=$(PID $K-HM1); MO1=$(PID $K-MO1); NB1=$(PID $K-NB1)
L_HB1="$K-HB1 c สายพานทดสอบไฟล์"; L_HB2="$K-HB2 z บอร์ดหลักทดสอบไฟล์"; L_HB3="$K-HB3 b ใช้แทน $K-HB2"
L_OT1="$K-OT1 k น้ำยาของใช้ร่วมทดสอบ"; L_MO1="$K-MO1 d สวิตช์ประตูใช้ร่วมทดสอบ"
STAGE_LABEL="หัวหน้าภาค · คอนเฟิร์มอะไหล่"; BACK_LABEL="ช่าง · ตรวจหน้างาน — แก้รายการอะไหล่"
# วันนัดตรวจ D+5 — ไม่ติดเวลาปิดรับปล่อยงานไม่ว่ารันตอนไหน (tests/README "เวลาปิดรับปล่อยงาน")
D5=$(node -e "console.log(new Date(Date.now()+7*3600e3+5*86400e3).toISOString().slice(0,10))")

st() { DB "select status from \"WorkOrder\" where id=$1"; }
NC=""
newcode() {
  local c
  while :; do
    c="W$((9000 + RANDOM % 999))"
    case " $MCODES " in *" $c "*) continue ;; esac
    [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$BID and code='$c'")" = "0" ] && break
  done
  MCODES="$MCODES $c"; NC=$c
}
UP() { curl -s -o /dev/null -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $T)" -F "file=@tests/$2" -F "role=$3"; }
# ส่งตรวจ (D+5) → แอดมินนัด → หัวหน้าภาคส่งช่าง → แนบไฟล์ครบสามอย่าง = ใบรอ "ช่าง · ตรวจหน้างาน"
INSP() {
  POST $S work-orders/$1/inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\",\"scheduledTime\":\"09:30\"}" >/dev/null
  POST $A work-orders/$1/confirm-appointment '{}' >/dev/null
  POST $S work-orders/$1/dispatch '{}' >/dev/null
  UP $1 "site-photo.png;type=image/png" INSPECT_SITE
  UP $1 "site-photo.png;type=image/png" INSPECT_PART
  UP $1 "site-clip.mp4;type=video/mp4" INSPECT_VIDEO
  [ "$(st $1)" = "INSPECTING" ] || fail "พาใบ $1 ไปถึงตรวจหน้างานไม่ได้ ($(st $1))"
}
# ใบใหม่บนเครื่องรหัสใหม่ ยี่ห้อ $1 (ว่าง = ไม่รู้ยี่ห้อ) ที่ไปถึงตรวจหน้างานแล้ว → $WO (ใบ) · $NC (รหัสเครื่อง)
WO=""
newinsp() {
  newcode
  local model=""; [ -n "$1" ] && model=",\"model\":\"$1\""
  WO=$(OPENWO CM "{\"code\":\"$NC\"$model,\"symptom\":\"ทดสอบเลือกอะไหล่ $2\"}"); ADDWO "$WO"
  INSP "$WO"
}
# อะไหล่ในรูป JSON: PL <id>:<จำนวน> ...
PL() { local out="" a; for a in "$@"; do out="$out{\"sparePartId\":${a%%:*},\"quantity\":${a##*:}},"; done; echo "[${out%,}]"; }
INS() { POST ${3:-$T} work-orders/$1/inspection "$2"; }
RET() { POST ${3:-$S} work-orders/$1/parts-pick/return "$2"; }
CONF() { POST ${3:-$S} work-orders/$1/parts-pick/confirm "$2"; }
DET() { curl -s localhost:4000/api/work-orders/$1 -H "$(H ${2:-$A})"; }
EMSG() { J 'd.error===undefined?"(ไม่มี error) "+JSON.stringify(d).slice(0,160):typeof d.error==="string"?d.error:JSON.stringify(d.error)'; }
# รอบเลือกอะไหล่ทุกรอบของใบ: สถานะ:รอบ:ยังไม่ถูกยกเลิก · รายการของรอบล่าสุด: รหัสxจำนวน:ป้ายตรง/ไม่ตรง
PICKS() { DB "select coalesce(string_agg(status||':'||round||':'||(\"voidedAt\" is null), ',' order by id),'') from \"PartsPick\" where \"workOrderId\"=$1"; }
ITEMS() { DB "select coalesce(string_agg(x, ',' order by x collate \"C\"),'') from (select replace(p.\"partCode\",'$K-','')||'x'||i.quantity||':'||coalesce(i.mark,'-') x from \"PartsPickItem\" i join \"SparePart\" p on p.id=i.\"sparePartId\" where i.\"pickId\"=(select max(id) from \"PartsPick\" where \"workOrderId\"=$1)) s"; }
PICKID() { DB "select max(id) from \"PartsPick\" where \"workOrderId\"=$1"; }
PITEMS() { DB "select coalesce(string_agg(x, ',' order by x collate \"C\"),'') from (select replace(p.\"partCode\",'$K-','')||'x'||i.quantity||':'||coalesce(i.mark,'-') x from \"PartsPickItem\" i join \"SparePart\" p on p.id=i.\"sparePartId\" where i.\"pickId\"=$1) s"; }
# อะไหล่ที่รอในใบ (ของนอกสโตร์ = OFF) · อะไหล่ที่รอบนกระดานเครื่องดับ
WAIT() { DB "select coalesce(string_agg(x, ',' order by x collate \"C\"),'') from (select case when p.\"offCatalog\" then 'OFF' else replace(p.\"partCode\",'$K-','') end||'x'||w.quantity x from \"WorkOrderPart\" w join \"SparePart\" p on p.id=w.\"sparePartId\" where w.\"workOrderId\"=$1 and w.kind='WAITING') s"; }
OPARTS() { DB "select coalesce(string_agg(x, ',' order by x collate \"C\"),'') from (select replace(p.\"partCode\",'$K-','')||'x'||o.quantity x from \"OutagePart\" o join \"SparePart\" p on p.id=o.\"sparePartId\" where o.\"outageId\"=$1) s"; }
LASTNOTE() { DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
LASTACTS() { DB "select string_agg(action, ',' order by \"createdAt\", id) from (select action, \"createdAt\", id from \"WorkOrderLog\" where \"workOrderId\"=$1 order by \"createdAt\" desc, id desc limit ${2:-2}) s"; }
WAITROW() { DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind,\"inStock\",\"requisitionNo\") values ($1,$2,${3:-1},'WAITING',${4:-null},${5:-null})" >/dev/null; }
# เคสเครื่องดับ (ทาง SQL) บนเครื่องรหัสใหม่ยี่ห้อ Huebsch + อะไหล่ที่รอบนกระดาน แล้ว "+ สร้างใบงาน" → $OUTG (เคส) · $WO (ใบ)
OUTG=""
outagewo() {
  newcode
  local mk; mk=$(OPENWO CM "{\"code\":\"$NC\",\"model\":\"Huebsch\",\"symptom\":\"สร้างเครื่องให้เคสทดสอบเลือกอะไหล่\"}"); ADDWO "$mk"
  local mid; mid=$(DB "select id from \"Machine\" where \"branchId\"=$BID and code='$NC'")
  OUTG=$(DB "insert into \"Outage\"(kind,\"branchId\",\"machineId\",\"startedAt\",\"lastSeenAt\") values ('MACHINE_OFF',$BID,$mid,now()-interval '2 hours',now()) returning id")
  OUTAGES="$OUTAGES $OUTG"
  local p; for p in "$@"; do DB "insert into \"OutagePart\"(\"outageId\",\"sparePartId\",quantity) values ($OUTG,${p%%:*},${p##*:})" >/dev/null; done
  WO=$(POST $A work-orders/from-outage/$OUTG '{}' | J 'd.id??"ERR "+JSON.stringify(d.error)'); ADDWO "$WO"
}

newinsp Huebsch "P"; P=$WO
NOTE_P="บอร์ดไหม้ สายพานขาด"
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $MT1:1)}")
[ "$(echo "$R" | EMSG)" = "$K-MT1 m มอเตอร์เมย์แท็กทดสอบ$SUF (แก้) อยู่ในไฟล์ Maytag — เครื่อง $NC (Huebsch) เลือกได้เฉพาะอะไหล่ไฟล์ Huebsch และของใช้ร่วม (ไฟล์ Other)" ] \
  && [ "$(st $P)" = "INSPECTING" ] && [ "$(PICKS $P)" = "" ] \
  && pass "ช่างเลือก MT1 (ไฟล์ Maytag) บนเครื่อง Huebsch → 400 บอกว่าอยู่ในไฟล์ Maytag · ใบยังรอตรวจหน้างาน · ไม่มีรอบเลือกอะไหล่" \
  || fail "MT1 บน Huebsch: $(echo "$R" | EMSG) · $(st $P)"
R1=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $NB1:1)}"); R2=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $OC:1)}")
[ "$(echo "$R1" | EMSG)" = "$K-NB1 ยังไม่อยู่ในไฟล์ยี่ห้อไหน — เลือกไม่ได้ (แอดมินอัปโหลดไฟล์ที่มีรหัสนี้ หรือติ๊กไฟล์ที่หน้าจัดการข้อมูลอะไหล่)" ] \
  && [ "$(echo "$R2" | EMSG)" = "อะไหล่นอกสโตร์ใส่ตอนตรวจหน้างานไม่ได้ — เขียนชื่อไว้ในข้อ 4 หัวหน้าภาคจะใส่ให้" ] && [ "$(st $P)" = "INSPECTING" ] \
  && pass "อะไหล่ที่ไม่อยู่ในไฟล์ไหน (NB1 แม้ข้อความยี่ห้อเป็น HB) → 400 · ของนอกสโตร์ → 400 (หัวหน้าภาคใส่ให้)" \
  || fail "NB1/นอกสโตร์: $(echo "$R1" | EMSG) / $(echo "$R2" | EMSG)"
R1=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":[{\"sparePartId\":$HB1,\"quantity\":100}]}")
R2=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:60 $HB1:50)}")
[ "$(echo "$R1" | EMSG)" = "ใส่จำนวนให้ครบทุกรายการ (1–99)" ] && [ "$(echo "$R2" | EMSG)" = "ใส่จำนวนให้ครบทุกรายการ (1–99)" ] && [ "$(PICKS $P)" = "" ] \
  && pass "จำนวนเกิน 99 → 400 ภาษาไทย · ตัวเดิมส่งซ้ำรวมจำนวนก่อนตรวจ (60+50)" || fail "จำนวน: $(echo "$R1" | EMSG) / $(echo "$R2" | EMSG)"
INSCODE() { CODE -X POST localhost:4000/api/work-orders/$1/inspection -H "$(H $2)" -H 'Content-Type: application/json' -d "{\"note\":\"x\",\"parts\":$(PL $HB1:1)}"; }
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:1)}" $TX)
[ "$(echo "$R" | EMSG)" = "ใบงานนี้จ่ายให้ $TEAM ไม่ใช่ทีมของคุณ" ] && [ "$(INSCODE $P $PA)|$(INSCODE $P $AR)" = "403|403" ] && [ "$(st $P)" = "INSPECTING" ] \
  && pass "ช่างทีมอื่น 403 · แอดมินอะไหล่ 403 · Area 403 · ใบไม่ขยับ" || fail "สิทธิ์ส่งผลตรวจ: $(echo "$R" | EMSG) PA=$(INSCODE $P $PA) AR=$(INSCODE $P $AR)"
# อะไหล่ที่อยู่ในใบก่อนตรวจ (OT1) — รายการของช่างยังไม่เขียนลงใบจนกว่าจะคอนเฟิร์ม (ข้อ 12)
WAITROW $P $OT1
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:2 $HB2:1)}")
[ "$(st $P)" = "NEW" ] && [ "$(PICKS $P)" = "PENDING:1:true" ] && [ "$(ITEMS $P)" = "HB1x2:-,HB2x1:-" ] \
  && [ "$(DB "select \"brandFile\"||'|'||team||'|'||note||'|'||\"createdById\" from \"PartsPick\" where \"workOrderId\"=$P")" = "Huebsch|$TEAM|$NOTE_P|$TID" ] \
  && [ "$(DB "select (\"inspectedAt\" is not null)||'|'||(\"scheduledAt\" is null)||'|'||coalesce(\"needsParts\"::text,'-')||'|'||\"inspectionNote\" from \"WorkOrder\" where id=$P")" = "true|true|-|$NOTE_P" ] \
  && pass "ช่างเลือก HB1×2 + HB2 → ใบไป NEW · รอบที่ 1 รอคอนเฟิร์ม (ไฟล์ Huebsch · ทีมที่ไปตรวจ · ผลตรวจ · คนส่ง) · ล้างวันนัด" \
  || fail "ส่งรายการ: $(echo "$R" | EMSG) · $(st $P) · $(PICKS $P) · $(ITEMS $P)"
[ "$(WAIT $P)" = "OT1x1" ] && pass "อะไหล่ที่รอในใบไม่เปลี่ยน (OT1 เดิมอยู่ · HB1/HB2 ยังไม่ลงใบจนกว่าจะคอนเฟิร์ม)" || fail "WorkOrderPart เปลี่ยน: $(WAIT $P)"
[ "$(LASTACTS $P)" = "INSPECTED,PARTS_PICKED" ] \
  && [ "$(LASTNOTE $P PARTS_PICKED)" = "เลือกอะไหล่ 2 รายการ ส่งให้หัวหน้าภาคคอนเฟิร์ม: $L_HB1 × 2 · $L_HB2 × 1" ] \
  && [ "$(DB "select (select \"createdAt\" from \"WorkOrderLog\" where \"workOrderId\"=$P and action='INSPECTED') < (select \"createdAt\" from \"WorkOrderLog\" where \"workOrderId\"=$P and action='PARTS_PICKED')")" = "t" ] \
  && [ "$(DB "select (select \"createdAt\" from \"PartsPick\" where \"workOrderId\"=$P) = (select \"createdAt\" from \"WorkOrderLog\" where \"workOrderId\"=$P and action='INSPECTED')")" = "t" ] \
  && pass "ประวัติ: บันทึกผลตรวจ แล้ว \"ช่างเลือกอะไหล่ ส่งให้หัวหน้าภาคคอนเฟิร์ม\" พร้อมรายการ · เวลาเรียงกัน (รอบใช้เวลาเดียวกับผลตรวจ)" \
  || fail "ประวัติ: $(LASTACTS $P) · $(LASTNOTE $P PARTS_PICKED)"
R=$(DET $P)
[ "$(echo "$R" | J 'const p=d.partsPick; [d.statusLabel,p.status,p.round,p.items.length,p.sentBy.name,p.brandFile,p.team,p.reason,p.previous].join("|")')" = "$STAGE_LABEL|PENDING|1|2|$TNAME|Huebsch|$TEAM||" ] \
  && [ "$(echo "$R" | J 'd.logs.slice(0,2).map(l=>l.actionLabel).join("|")')" = "ช่างเลือกอะไหล่ ส่งให้หัวหน้าภาคคอนเฟิร์ม|บันทึกผลตรวจหน้างาน" ] \
  && pass "หน้าใบงาน: \"$STAGE_LABEL\" · partsPick (รอบ 1 · 2 รายการ · ช่างที่ส่ง · ไฟล์ Huebsch) · ชื่อประวัติภาษาไทย" \
  || fail "detail: $(echo "$R" | J 'JSON.stringify([d.statusLabel,d.partsPick])' 2>&1 | head -c 300)"
R=$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)")
[ "$(echo "$R" | J 'const r=d.rows.find(x=>x.id==='$P'); r?[r.statusLabel,r.partsPick.round,r.partsPick.count,r.partsPick.sentByName,r.partsPick.line,r.machineMake].join("|"):"ไม่มีในกล่อง"')" = "$STAGE_LABEL|1|2|$TNAME|$L_HB1 × 2 · $L_HB2 × 1|Huebsch" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/$P/version -H "$(H $S)" | J 'd.statusLabel')" = "$STAGE_LABEL" ] \
  && pass "กล่องงานหัวหน้าภาค: ป้ายคอนเฟิร์มอะไหล่ + partsPick (รอบ · จำนวน · ช่าง · บรรทัดรายการ) + ยี่ห้อเครื่อง · /:id/version ป้ายเดียวกัน" \
  || fail "กล่องงาน: $(echo "$R" | J 'JSON.stringify(d.rows.find(x=>x.id==='$P'))' 2>&1 | head -c 300)"
[ "$(curl -s localhost:4000/api/branches/C0006/open-work-orders -H "$(H $S)" | J 'const r=d.find(x=>x.id==='$P'); r?r.statusLabel:"ไม่มี"')" = "$STAGE_LABEL" ] \
  && pass "ป๊อปอัปใบที่เปิดค้าง (branches/:code/open-work-orders) ใช้ป้ายเดียวกัน" || fail "open-work-orders: $(curl -s localhost:4000/api/branches/C0006/open-work-orders -H "$(H $S)" | head -c 200)"
R=$(POST $S work-orders/$P/parts "{\"needsParts\":true,\"parts\":$(PL $HB3:1)}")
[ "$(echo "$R" | EMSG)" = "ใบนี้รอคอนเฟิร์มอะไหล่ที่ช่างเลือก — กด “คอนเฟิร์มอะไหล่” หรือ “ตีกลับให้ช่างแก้” (แก้รายการของช่างเองไม่ได้)" ] \
  && [ "$(st $P)|$(WAIT $P)" = "NEW|OT1x1" ] \
  && pass "หัวหน้าภาคระบุอะไหล่ทับรายการของช่างไม่ได้ (409) — ใบและรายการไม่เปลี่ยน" || fail "/parts ระหว่างรอคอนเฟิร์ม: $(echo "$R" | EMSG) · $(WAIT $P)"

# ใบที่ผูกเคสเครื่องดับ — รายการของช่างยังไม่ขึ้นกระดาน (อะไหล่ที่รอบนกระดานยังเป็นของเดิม)
outagewo $HB1:1; O=$WO; OUT2=$OUTG
INSP $O
R=$(INS $O "{\"note\":\"เคสเครื่องดับ บอร์ดเสีย\",\"parts\":$(PL $HB2:1)}")
[ "$(st $O)|$(PICKS $O)|$(WAIT $O)|$(OPARTS $OUT2)" = "NEW|PENDING:1:true|HB1x1|HB1x1" ] \
  && pass "ใบจากเคสเครื่องดับ: ช่างเลือก HB2 → รอคอนเฟิร์ม · อะไหล่ในใบ (HB1) และอะไหล่ที่รอบนกระดานไม่เปลี่ยน" \
  || fail "ใบเคสเครื่องดับ: $(echo "$R" | EMSG) · $(st $O) · ใบ=$(WAIT $O) · กระดาน=$(OPARTS $OUT2)"

# เครื่องไม่รู้ยี่ห้อ — ต้องเลือกยี่ห้อก่อน · ยี่ห้อที่เลือกจำไว้กับเครื่อง (Machine.model) ทั้งตอนเลือกและไม่เลือกอะไหล่
newinsp "" "ไม่รู้ยี่ห้อ"; U1W=$WO; U1M=$NC
R=$(INS $U1W "{\"note\":\"ไม่รู้ยี่ห้อ\",\"parts\":$(PL $HB1:1)}")
[ "$(echo "$R" | EMSG)" = "เครื่อง $U1M ยังไม่รู้ยี่ห้อ — เลือกยี่ห้อเครื่องก่อนเลือกอะไหล่" ] && [ "$(st $U1W)" = "INSPECTING" ] \
  && pass "เครื่องไม่รู้ยี่ห้อ + เลือกอะไหล่ ไม่ส่งยี่ห้อ → 400 \"เลือกยี่ห้อเครื่องก่อน\"" || fail "ไม่รู้ยี่ห้อ: $(echo "$R" | EMSG)"
R=$(INS $U1W "{\"note\":\"ไม่รู้ยี่ห้อ\",\"parts\":$(PL $HB1:1),\"machineBrand\":\"Huebsch\"}")
[ "$(st $U1W)|$(PICKS $U1W)" = "NEW|PENDING:1:true" ] \
  && [ "$(DB "select coalesce(brand,'-')||'|'||model from \"Machine\" where \"branchId\"=$BID and code='$U1M'")" = "-|Huebsch" ] \
  && [ "$(LASTNOTE $U1W MACHINE_BRAND_SET)" = "บันทึกยี่ห้อเครื่อง $U1M: Huebsch (ช่างเลือกตอนตรวจหน้างาน)" ] \
  && [ "$(LASTACTS $U1W 3)" = "MACHINE_BRAND_SET,INSPECTED,PARTS_PICKED" ] \
  && [ "$(DB "select \"brandFile\" from \"PartsPick\" where \"workOrderId\"=$U1W")" = "Huebsch" ] \
  && pass "ส่งยี่ห้อ Huebsch มาด้วย → บันทึกที่ Machine.model + ประวัติ \"บันทึกยี่ห้อเครื่อง\" (ก่อนแถวผลตรวจ) · รอบเลือกอะไหล่ใช้ไฟล์ Huebsch" \
  || fail "บันทึกยี่ห้อพร้อมอะไหล่: $(echo "$R" | EMSG) · $(PICKS $U1W) · $(LASTACTS $U1W 3)"
newinsp "" "ไม่รู้ยี่ห้อ ไม่เลือกอะไหล่"; U2W=$WO; U2M=$NC
R=$(INS $U2W "{\"note\":\"ไม่รู้ยี่ห้อ ไม่เลือกอะไหล่\",\"parts\":[],\"machineBrand\":\"Spinz\"}")
[ "$(st $U2W)|$(PICKS $U2W)" = "NEW|" ] \
  && [ "$(DB "select model from \"Machine\" where \"branchId\"=$BID and code='$U2M'")" = "Spinz" ] \
  && [ "$(LASTNOTE $U2W MACHINE_BRAND_SET)" = "บันทึกยี่ห้อเครื่อง $U2M: Spinz (ช่างเลือกตอนตรวจหน้างาน)" ] \
  && pass "ไม่เลือกอะไหล่แต่เลือกยี่ห้อ (Spinz) → ยังจำยี่ห้อไว้กับเครื่อง + ประวัติ · ไม่มีรอบเลือกอะไหล่" \
  || fail "ยี่ห้อไม่มีอะไหล่: $(echo "$R" | EMSG) · $(st $U2W)"

# เครื่องที่รู้ยี่ห้อแล้ว — ฟอร์มเปลี่ยนยี่ห้อไม่ได้ · ของใช้ร่วม (Other) และรหัสที่อยู่หลายไฟล์เลือกได้
newinsp Huebsch "ของใช้ร่วม"; KW=$WO; KM=$NC
R=$(INS $KW "{\"note\":\"เปลี่ยนยี่ห้อ\",\"parts\":$(PL $HB1:1),\"machineBrand\":\"Maytag\"}")
[ "$(echo "$R" | EMSG)" = "เครื่อง $KM มียี่ห้อในระบบแล้ว (Huebsch) — แก้ยี่ห้อได้ที่หัวหน้าภาคหรือแอดมิน" ] \
  && [ "$(st $KW)|$(DB "select model from \"Machine\" where \"branchId\"=$BID and code='$KM'")" = "INSPECTING|Huebsch" ] \
  && pass "เครื่องรู้ยี่ห้อแล้ว (Huebsch) ส่งยี่ห้ออื่นมา → 400 · ยี่ห้อเดิมไม่เปลี่ยน" || fail "เปลี่ยนยี่ห้อ: $(echo "$R" | EMSG)"
# งานด่วนของวันนัดเดิม (เวลาปิดรับปล่อยงาน) ต้องหมดผลเมื่อวันนัดถูกล้างตอนส่งผลตรวจ — ทุกทางของปุ่มนี้
DB "update \"WorkOrder\" set \"urgentReleaseFor\"=\"scheduledAt\" where id=$KW" >/dev/null
R=$(INS $KW "{\"note\":\"ใช้ของใช้ร่วม\",\"parts\":$(PL $OT1:1 $HM1:1),\"machineBrand\":\"huebsch\"}")
[ "$(st $KW)|$(PICKS $KW)|$(ITEMS $KW)" = "NEW|PENDING:1:true|HM1x1:-,OT1x1:-" ] \
  && [ "$(DB "select (\"urgentReleaseFor\" is null)||'|'||(\"scheduledAt\" is null) from \"WorkOrder\" where id=$KW")" = "true|true" ] \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$KW and action='MACHINE_BRAND_SET'")" = "0" ] \
  && pass "เครื่อง Huebsch เลือก OT1 (ไฟล์ Other = ของใช้ร่วม) + HM1 (Huebsch+Maytag) ได้ · ส่งยี่ห้อเดิม (ตัวพิมพ์ต่าง) ไม่ลงประวัติซ้ำ · ล้างวันนัด+งานด่วน" \
  || fail "ของใช้ร่วม/หลายไฟล์: $(echo "$R" | EMSG) · $(ITEMS $KW)"
newinsp Electrolux "ไม่มีไฟล์ยี่ห้อ"; EW=$WO; EM=$NC
R1=$(INS $EW "{\"note\":\"ยี่ห้อไม่มีไฟล์\",\"parts\":$(PL $HB1:1)}")
R=$(INS $EW "{\"note\":\"ยี่ห้อไม่มีไฟล์\",\"parts\":$(PL $MO1:1)}")
[ "$(echo "$R1" | EMSG)" = "$L_HB1 อยู่ในไฟล์ Huebsch — เครื่อง $EM (Electrolux) ไม่มีไฟล์ยี่ห้อของตัวเอง เลือกได้เฉพาะของใช้ร่วม (ไฟล์ Other)" ] \
  && [ "$(st $EW)|$(ITEMS $EW)|$(DB "select \"brandFile\" from \"PartsPick\" where \"workOrderId\"=$EW")" = "NEW|MO1x1:-|Other" ] \
  && pass "เครื่อง Electrolux (ไม่มีไฟล์ของตัวเอง): HB1 → 400 \"เลือกได้เฉพาะของใช้ร่วม\" · MO1 (Maytag+Other) เลือกได้ · รอบใช้ไฟล์ Other" \
  || fail "Electrolux: $(echo "$R1" | EMSG) / $(echo "$R" | EMSG) · $(ITEMS $EW)"

# ใบที่ไม่มีเครื่อง — ช่องอะไหล่ของช่างล็อก (D15) · ไม่เลือกอะไหล่ส่งได้ตามเดิม
NM=$(OPENWO COIN_CHANGER "{\"model\":null,\"symptom\":\"ทดสอบเลือกอะไหล่ ไม่มีเครื่อง\"}"); ADDWO "$NM"; INSP "$NM"
R1=$(INS $NM "{\"note\":\"ไม่มีเครื่อง\",\"parts\":$(PL $HB1:1)}")
[ "$(echo "$R1" | EMSG)" = "ใบงานนี้ไม่ได้ระบุเครื่อง — เลือกอะไหล่ไม่ได้ เขียนในข้อ 4 หัวหน้าภาคระบุอะไหล่แทน" ] && [ "$(st $NM)" = "INSPECTING" ] \
  && pass "ใบไม่มีเครื่อง + เลือกอะไหล่ → 400 ข้อความ D15" || fail "ไม่มีเครื่อง: $(echo "$R1" | EMSG)"
R=$(INS $NM "{\"note\":\"ไม่มีเครื่อง\",\"parts\":[]}")
[ "$(st $NM)|$(PICKS $NM)|$(DET $NM | J 'd.statusLabel+"|"+d.partsPick')" = "NEW||หัวหน้าภาค · ระบุอะไหล่|null" ] \
  && pass "ใบไม่มีเครื่อง ไม่เลือกอะไหล่ → ทางเดิม \"หัวหน้าภาค · ระบุอะไหล่\" ไม่มีรอบเลือกอะไหล่" || fail "ไม่มีเครื่อง ไม่เลือก: $(echo "$R" | EMSG)"

echo
echo "═══ C2 ไม่เลือกอะไหล่ — แถวเดิมที่ช่างเอาออกหายจากใบจริง ยกเว้นของที่เบิกแล้ว (D1)"
outagewo $HB1:1 $HB2:1; C2W=$WO; OUT3=$OUTG
DB "update \"WorkOrderPart\" set \"inStock\"=true, \"requisitionNo\"='RQC$SUF' where \"workOrderId\"=$C2W and \"sparePartId\"=$HB2" >/dev/null
INSP $C2W
R=$(INS $C2W "{\"note\":\"ไม่ต้องใช้อะไหล่แล้ว\",\"parts\":[],\"removed\":[$HB1,$HB2]}")
[ "$(st $C2W)|$(PICKS $C2W)|$(WAIT $C2W)" = "NEW||HB2x1" ] \
  && pass "ส่งรายการว่าง เอา HB1 กับ HB2 ออก → ใบไประบุอะไหล่ · HB1 หายจากใบ · HB2 (เบิกแล้ว) ยังอยู่" || fail "เอาออก: $(echo "$R" | EMSG) · $(WAIT $C2W)"
[ "$(LASTNOTE $C2W INSPECTED)" = "ไม่ต้องใช้อะไหล่แล้ว · เอาอะไหล่เดิมออกจากใบ: $L_HB1 · ของที่เบิกแล้วยังอยู่ในใบ: $K-HB2 (ใบเบิก RQC$SUF) — หัวหน้าภาคตัดสิน" ] \
  && [ "$(DB "select \"inspectionNote\" from \"WorkOrder\" where id=$C2W")" = "ไม่ต้องใช้อะไหล่แล้ว" ] \
  && pass "ประวัติผลตรวจบอกทั้งตัวที่เอาออกและของที่เบิกแล้วที่ยังอยู่ (เลขใบเบิก) · ผลตรวจในใบเป็นข้อความที่ช่างเขียน" \
  || fail "ประวัติเอาออก: $(LASTNOTE $C2W INSPECTED)"
[ "$(OPARTS $OUT3)" = "HB2x1" ] && pass "กระดานเครื่องดับตัด HB1 ตามใบทันที (การเอาออกไม่ใช่การเพิ่ม — ไม่ต้องรอคอนเฟิร์ม)" || fail "กระดาน: $(OPARTS $OUT3)"
newinsp Huebsch "แอปรุ่นเก่า"; OLDW=$WO
WAITROW $OLDW $HB1
R=$(INS $OLDW '{"note":"แอปรุ่นเก่าส่งแค่ผลตรวจ"}')
[ "$(st $OLDW)|$(PICKS $OLDW)|$(WAIT $OLDW)" = "NEW||HB1x1" ] \
  && pass "แอปรุ่นเก่าไม่ส่ง parts → ทางเดิม รายการในใบไม่แตะ" || fail "แอปเก่า: $(echo "$R" | EMSG) · $(WAIT $OLDW)"

echo
echo "═══ D หัวหน้าภาคตีกลับรายการอะไหล่ (POST /work-orders/:id/parts-pick/return)"
PK=$(PICKID $P)
R=$(RET $P "{\"pickId\":$PK,\"reason\":\"ช่างตีกลับเอง\"}" $T)
[ "$(echo "$R" | EMSG)" = "ขั้นนี้เป็นของหัวหน้าภาค ไม่ใช่ของคุณ" ] && [ "$(st $P)|$(PICKS $P)" = "NEW|PENDING:1:true" ] \
  && pass "ช่างตีกลับเองไม่ได้ (403)" || fail "ช่างตีกลับ: $(echo "$R" | EMSG)"
R1=$(RET $P "{\"pickId\":$PK,\"reason\":\"   \"}"); R2=$(RET $P "{\"pickId\":$PK}")
[ "$(echo "$R1" | EMSG)" = "ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร" ] && [ "$(echo "$R2" | EMSG)" = "ตีกลับต้องบอกเหตุผล — ช่างจะได้รู้ว่าต้องแก้อะไร" ] \
  && [ "$(PICKS $P)" = "PENDING:1:true" ] && pass "ตีกลับไม่มีเหตุผล → 400 ข้อความเดียวกับตีกลับเคลม" || fail "ไม่มีเหตุผล: $(echo "$R1" | EMSG)"
R1=$(RET $P "{\"pickId\":$((PK + 100000)),\"reason\":\"รอบเก่า\"}"); R2=$(RET $P "{\"pickId\":$PK,\"reason\":\"ชี้ผิดตัว\",\"flags\":[$OT1]}")
[ "$(echo "$R1" | EMSG)" = "รายการอะไหล่เปลี่ยนไปแล้ว — โหลดใหม่ให้แล้ว ดูอีกครั้งก่อนกด" ] \
  && [ "$(echo "$R2" | EMSG)" = "รายการที่ชี้ว่าไม่ตรงไม่อยู่ในรายการที่ช่างเลือก" ] && [ "$(PICKS $P)" = "PENDING:1:true" ] \
  && pass "pickId ไม่ใช่รอบที่รออยู่ → 409 · ชี้ตัวที่ไม่อยู่ในรายการ → 400" || fail "pickId/flags: $(echo "$R1" | EMSG) / $(echo "$R2" | EMSG)"
REASON="รหัสไม่ตรงกับรูปอะไหล่ที่เสีย"
R=$(RET $P "{\"pickId\":$PK,\"reason\":\"$REASON\",\"flags\":[$HB2],\"marks\":[{\"sparePartId\":$HB1,\"mark\":\"OK\"}]}")
[ "$(st $P)|$(PICKS $P)|$(ITEMS $P)" = "INSPECTING|RETURNED:1:true|HB1x2:OK,HB2x1:NO" ] \
  && [ "$(DB "select \"assignedTeam\"||'|'||(\"inspectedAt\" is not null)||'|'||(\"scheduledAt\" is null) from \"WorkOrder\" where id=$P")" = "$TEAM|true|true" ] \
  && [ "$(DB "select \"reviewedById\"||'|'||reason||'|'||(\"reviewedAt\" is not null) from \"PartsPick\" where id=$PK")" = "$SID|$REASON|true" ] \
  && pass "ตีกลับชี้ HB2 → ใบกลับ \"ตรวจหน้างาน\" ทีมเดิม (ไม่ต้องนัดใหม่ · ไม่มีวันนัด) · รอบ RETURNED + เหตุผล + คนตีกลับ · HB2 ไม่ตรง HB1 ตรง" \
  || fail "ตีกลับ: $(echo "$R" | EMSG) · $(st $P) · $(PICKS $P) · $(ITEMS $P)"
[ "$(LASTACTS $P 1)" = "PARTS_PICK_RETURNED" ] \
  && [ "$(DB "select status||'|'||note from \"WorkOrderLog\" where \"workOrderId\"=$P and action='PARTS_PICK_RETURNED'")" = "INSPECTING|$REASON (ไม่ตรง: $L_HB2)" ] \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$P and action='INSPECT_REQUESTED'")" = "1" ] \
  && pass "ประวัติ \"ตีกลับอะไหล่ให้ช่างแก้\" = เหตุผล + ตัวที่ไม่ตรง · ไม่มีส่งตรวจใหม่ (ไฟล์รอบนี้ยังนับ)" || fail "ประวัติตีกลับ: $(LASTNOTE $P PARTS_PICK_RETURNED)"
R=$(DET $P $T)
[ "$(echo "$R" | J 'const p=d.partsPick; [d.statusLabel,p.status,p.reason,p.reviewedBy.name,p.reviewedBy.roleLabel,p.flags.map(f=>f.partCode).join("+")].join("|")')" = "$BACK_LABEL|RETURNED|$REASON|$SNAME|หัวหน้าภาค|$K-HB2" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/$P/version -H "$(H $T)" | J 'd.statusLabel')" = "$BACK_LABEL" ] \
  && pass "หน้าใบงาน (ช่าง): \"$BACK_LABEL\" · เหตุผล · ใคร (หัวหน้าภาค) · ตัวที่ชี้ · version ป้ายเดียวกัน" \
  || fail "detail ตีกลับ: $(echo "$R" | J 'JSON.stringify([d.statusLabel,d.partsPick])' 2>&1 | head -c 300)"
R=$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)")
[ "$(echo "$R" | J 'const r=d.rows.find(x=>x.id==='$P'); r&&r.partsReturned?[r.statusLabel,r.machineMake,r.partsReturned.byName,r.partsReturned.roleLabel,r.partsReturned.reason,r.partsReturned.flags.map(f=>f.partCode+" "+f.name).join("+"),!!r.partsReturned.at].join("|"):"ไม่มี "+JSON.stringify(r)')" = "$BACK_LABEL|Huebsch|$SNAME|หัวหน้าภาค|$REASON|$L_HB2|true" ] \
  && pass "งานของฉันวันนี้ (ช่าง): การ์ดแดง partsReturned (ใคร · บทบาท · เหตุผล · ตัวที่ชี้ · เวลา) + ยี่ห้อเครื่อง — ใบไม่มีวันนัดก็ขึ้น" \
  || fail "my-day: $(echo "$R" | J 'JSON.stringify(d.rows.find(x=>x.id==='$P'))' 2>&1 | head -c 300)"
R=$(DET $P $AR)
[ "$(echo "$R" | J 'const p=d.partsPick, l=d.logs.find(x=>x.action==="PARTS_PICK_RETURNED"); [d.statusLabel,p.status,p.reason,p.flags,p.items.every(i=>i.mark===null),l.note].join("|")')" = "$BACK_LABEL|RETURNED|||true|" ] \
  && [ "$(DET $P $A | J 'd.logs.find(x=>x.action==="PARTS_PICK_RETURNED").note')" = "$REASON (ไม่ตรง: $L_HB2)" ] \
  && pass "ทีม Area เห็นแค่ป้าย — ไม่มีเหตุผล ตัวที่ชี้ ป้ายตรง/ไม่ตรง หรือข้อความประวัติตีกลับ (แอดมินยังเห็น)" \
  || fail "Area: $(echo "$R" | J 'JSON.stringify([d.partsPick,d.logs.find(x=>x.action==="PARTS_PICK_RETURNED")])' 2>&1 | head -c 300)"
[ "$(curl -s localhost:4000/api/plans/pending -H "$(H $S)" | J 'Array.isArray(d)?String(d.some(r=>r.id==='$P')):"bad "+JSON.stringify(d).slice(0,100)')" = "false" ] \
  && [ "$(DB "select status||'|'||(\"scheduledAt\" is null) from \"WorkOrder\" where id=$P")" = "INSPECTING|true" ] \
  && pass "บอร์ดแผน \"รอจัดแผน\" ไม่มีใบที่ถูกตีกลับ (ไม่ต้องหาวันใหม่ — D9) ทั้งที่ใบอยู่ตรวจหน้างานและไม่มีวัน" || fail "plans/pending มีใบที่ถูกตีกลับ"
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:2 $HB2:1)}")
[ "$(echo "$R" | EMSG)" = "ยังไม่ได้แก้อะไร — แก้ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง ($L_HB2) หรือเขียนในข้อ 4 ว่าทำไมยืนยันรายการเดิม แล้วค่อยส่งใหม่" ] \
  && [ "$(st $P)|$(PICKS $P)" = "INSPECTING|RETURNED:1:true" ] \
  && pass "ส่งใหม่โดยไม่แก้อะไรเลย → 400 บอกตัวที่ถูกชี้ · ไม่มีรอบใหม่" || fail "ส่งซ้ำเหมือนเดิม: $(echo "$R" | EMSG)"
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:3 $HB2:1)}")
[ "$(echo "$R" | EMSG)" = "ยังไม่ได้แก้ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง ($L_HB2) — เอาออก เปลี่ยนจำนวน หรือเขียนในข้อ 4 ว่าทำไมยืนยันตัวนี้ แล้วค่อยส่งใหม่" ] \
  && [ "$(PICKS $P)" = "RETURNED:1:true" ] \
  && pass "แก้แต่ตัวที่ไม่ได้ถูกชี้ (HB1 2→3) → 400 \"ยังไม่ได้แก้ตัวที่หัวหน้าภาคชี้\"" || fail "แก้ผิดตัว: $(echo "$R" | EMSG)"
R=$(INS $P "{\"note\":\"$NOTE_P\",\"parts\":$(PL $HB1:2 $HB3:1)}")
[ "$(st $P)|$(PICKS $P)|$(ITEMS $P)" = "NEW|RETURNED:1:true,PENDING:2:true|HB1x2:-,HB3x1:-" ] \
  && [ "$(LASTNOTE $P PARTS_PICKED)" = "แก้รายการอะไหล่ ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง — เอา $L_HB2 ออก · เพิ่ม $L_HB3 × 1" ] \
  && [ "$(PITEMS $PK)" = "HB1x2:OK,HB2x1:NO" ] \
  && pass "เอา HB2 ออก เพิ่ม HB3 → รอบที่ 2 รอคอนเฟิร์ม (รอบ 1 เก็บไว้พร้อมป้ายเดิม) · ประวัติบอกว่าแก้อะไร" \
  || fail "ส่งรอบ 2: $(echo "$R" | EMSG | head -c 120) · $(st $P) · $(PICKS $P) · ล่าสุด $(ITEMS $P) · รอบ 1 $(PITEMS $PK) · $(LASTNOTE $P PARTS_PICKED)"
R=$(DET $P $S)
[ "$(echo "$R" | J 'const p=d.partsPick, h=(c)=>p.items.find(i=>i.partCode==="'$K'-"+c); [d.statusLabel,p.round,p.previous.round,p.previous.reason,h("HB3").isNew,h("HB1").isNew,h("HB1").prevQty,p.noteChanged,p.addedPartPhotos,p.previous.items.map(i=>i.partCode.replace("'$K'-","")+":"+i.mark).join("+")].join("|")')" = "$STAGE_LABEL|2|1|$REASON|true|false||false|0|HB1:OK+HB2:NO" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J 'String(d.rows.some(r=>r.id==='$P'))')" = "false" ] \
  && pass "หน้าคอนเฟิร์มรอบ 2: previous (รอบ 1 · เหตุผล · ป้ายเดิม) · HB3 เพิ่มใหม่ · HB1 จำนวนเดิม · ใบออกจากงานของฉันของช่าง" \
  || fail "previous: $(echo "$R" | J 'JSON.stringify(d.partsPick)' 2>&1 | head -c 400)"
# รอบ 2 คือครั้งแรกที่มี previous — ทีม Area ต้องไม่เห็นเหตุผลตีกลับ/ป้ายตรง-ไม่ตรงของรอบ 1 ผ่านช่องนี้ (ข้อ 10)
# เช็คตอนรอบ 1 อย่างเดียวไม่พอ: previous ยังเป็น null ลบการซ่อนของ previous ทิ้งเทสต์ก็ยังผ่าน
R=$(DET $P $AR)
[ "$(echo "$R" | J 'const p=d.partsPick, v=p&&p.previous; v?[p.round,v.round,v.reason,v.items.length>0&&v.items.every(i=>i.mark===null)].join("|"):"ไม่มี previous"')" = "2|1||true" ] \
  && pass "ทีม Area เปิดรอบ 2: รอบก่อน (previous) ไม่มีเหตุผลตีกลับและป้ายตรง/ไม่ตรง" \
  || fail "Area previous: $(echo "$R" | J 'JSON.stringify(d.partsPick&&d.partsPick.previous)' 2>&1 | head -c 300)"
# ใบ Q — ตีกลับไม่ชี้ตัว: ส่งซ้ำเหมือนเดิม → ข้อความแบบที่ 3 · แก้ "ตรวจแล้วเจออะไร" อย่างเดียว → ส่งได้
newinsp Huebsch "Q"; Q=$WO; QM=$NC
INS $Q "{\"note\":\"q1 สายพานขาด\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $Q "{\"pickId\":$(PICKID $Q),\"reason\":\"ดูรูปแล้วไม่แน่ใจ\"}" >/dev/null
R=$(INS $Q "{\"note\":\"q1 สายพานขาด\",\"parts\":$(PL $HB1:1)}")
R2=$(INS $Q "{\"note\":\"q1 สายพานขาด — ยืนยันตัวเดิม รูปเห็นรอยขาดชัด\",\"parts\":$(PL $HB1:1)}")
[ "$(echo "$R" | EMSG)" = "ยังไม่ได้แก้อะไร — อ่านเหตุผลของหัวหน้าภาคแล้วแก้รายการ หรือเขียนในข้อ 4 ว่าทำไมยืนยันรายการเดิม แล้วค่อยส่งใหม่" ] \
  && [ "$(PICKS $Q)" = "RETURNED:1:true,PENDING:2:true" ] \
  && [ "$(LASTNOTE $Q PARTS_PICKED)" = "ยืนยันรายการเดิม ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง — แก้ “ตรวจแล้วเจออะไร”" ] \
  && [ "$(DET $Q $S | J 'd.partsPick.noteChanged+"|"+d.partsPick.items[0].isNew')" = "true|false" ] \
  && pass "ตีกลับไม่ชี้ตัว + ส่งซ้ำ → 400 \"อ่านเหตุผล…\" · รายการเดิมแต่แก้ผลตรวจ → ส่งได้ (รอบ 2 · noteChanged)" \
  || fail "แก้ผลตรวจอย่างเดียว: $(echo "$R" | EMSG) / $(echo "$R2" | EMSG) · $(PICKS $Q)"
# ใบ RW — รายการเดิม ผลตรวจเดิม แต่เพิ่มรูปอะไหล่ที่เสียหลังตีกลับ → ส่งได้
newinsp Huebsch "รูปเพิ่ม"; RW=$WO
INS $RW "{\"note\":\"r1 บอร์ด\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $RW "{\"pickId\":$(PICKID $RW),\"reason\":\"จำนวนไม่ตรง\",\"flags\":[$HB1]}" >/dev/null
UP $RW "site-photo.png;type=image/png" INSPECT_PART
R=$(INS $RW "{\"note\":\"r1 บอร์ด\",\"parts\":$(PL $HB1:1)}")
[ "$(PICKS $RW)" = "RETURNED:1:true,PENDING:2:true" ] \
  && [ "$(LASTNOTE $RW PARTS_PICKED)" = "ยืนยันรายการเดิม ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง — เพิ่มรูปอะไหล่ที่เสีย 1 รูป" ] \
  && [ "$(DET $RW $S | J 'd.partsPick.addedPartPhotos')" = "1" ] \
  && pass "รายการและผลตรวจเดิม + รูปอะไหล่ที่เสียรูปใหม่หลังตีกลับ → ส่งได้ (addedPartPhotos 1)" \
  || fail "รูปเพิ่ม: $(echo "$R" | EMSG) · $(PICKS $RW)"
DB "update \"WorkOrder\" set \"assignedTeam\"=null where id=$RW" >/dev/null
R=$(RET $RW "{\"pickId\":$(PICKID $RW),\"reason\":\"ทดสอบไม่มีทีม\"}")
DB "update \"WorkOrder\" set \"assignedTeam\"='$TEAM' where id=$RW" >/dev/null
[ "$(echo "$R" | EMSG)" = "ใบนี้ไม่มีทีมที่ไปตรวจ — ใช้ “ต้องเข้าตรวจสอบหน้างานก่อน” แทน" ] && [ "$(PICKS $RW)" = "RETURNED:1:true,PENDING:2:true" ] \
  && pass "ใบไม่มีทีมที่ไปตรวจ → ตีกลับไม่ได้ (409) ให้ใช้ \"ต้องเข้าตรวจสอบหน้างานก่อน\"" || fail "ไม่มีทีม: $(echo "$R" | EMSG)"

echo
echo "═══ E หัวหน้าภาค/แอดมินคอนเฟิร์มรายการของช่าง (POST /work-orders/:id/parts-pick/confirm)"
PK2=$(PICKID $P)
# ของเดิมในใบ: OT1 (ใส่ไว้ก่อนตรวจ) + MO1 ที่เบิกแล้ว + ของนอกสโตร์ — ช่างไม่ได้เลือก OT1/MO1 = เอาออกตอนคอนเฟิร์ม
WAITROW $P $MO1 1 true "'RQE$SUF'"
WAITROW $P $OC 1
CCODE() { CODE -X POST localhost:4000/api/work-orders/$1/parts-pick/confirm -H "$(H $2)" -H 'Content-Type: application/json' -d "{\"pickId\":$3}"; }
# ViewAsLog ไม่ผูกกับ User — จำ id สูงสุดไว้ก่อน แล้ว cleanup ลบแถวที่ชุดนี้สร้าง (ไม่งั้นค้างในประวัติ "ดูในฐานะ" ทุกรอบที่รัน)
VSTART=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
AVS=$(POST $A auth/view-as "{\"userId\":$SID}" | J 'd.token||""')
R=$(CONF $P "{\"pickId\":$PK2}" $T)
[ "$(echo "$R" | EMSG)" = "ขั้นนี้เป็นของหัวหน้าภาค ไม่ใช่ของคุณ" ] && [ "$(CCODE $P $PA $PK2)|$(CCODE $P "$AVS" $PK2)" = "403|403" ] \
  && [ "$(st $P)|$(PICKS $P)" = "NEW|RETURNED:1:true,PENDING:2:true" ] \
  && pass "ช่าง 403 (ขั้นของหัวหน้าภาค) · แอดมินอะไหล่ 403 · แอดมินดูในฐานะหัวหน้าภาค 403 · ใบไม่ขยับ" \
  || fail "สิทธิ์คอนเฟิร์ม: $(echo "$R" | EMSG) PA=$(CCODE $P $PA $PK2) VA=$(CCODE $P "$AVS" $PK2)"
[ -n "$AVS" ] && POST $AVS auth/view-as/stop '{}' >/dev/null
R1=$(CONF $P "{\"pickId\":$PK}"); R2=$(CONF $P "{\"pickId\":$PK2,\"marks\":[{\"sparePartId\":$HB1,\"mark\":\"OK\"},{\"sparePartId\":$HB3,\"mark\":\"NO\"}]}")
[ "$(echo "$R1" | EMSG)" = "รายการอะไหล่เปลี่ยนไปแล้ว — โหลดใหม่ให้แล้ว ดูอีกครั้งก่อนกด" ] \
  && [ "$(echo "$R2" | EMSG)" = "มีรายการที่กด ไม่ตรง — ตีกลับให้ช่างแก้ หรือเปลี่ยนเป็น ตรง ก่อนคอนเฟิร์ม" ] && [ "$(st $P)" = "NEW" ] \
  && pass "pickId ของรอบเก่า → 409 · มีตัวที่กด \"ไม่ตรง\" → 400 (ต้องตีกลับ)" || fail "คอนเฟิร์มผิด: $(echo "$R1" | EMSG) / $(echo "$R2" | EMSG)"
R=$(CONF $P "{\"pickId\":$PK2,\"offParts\":[{\"name\":\"$K ของนอก\",\"quantity\":2}],\"services\":[{\"name\":\"ค่าแรงทดสอบเลือกอะไหล่\",\"quantity\":1}],\"marks\":[{\"sparePartId\":$HB1,\"mark\":\"OK\"},{\"sparePartId\":$HB3,\"mark\":\"OK\"}]}")
[ "$(DB "select status||'|'||\"needsParts\" from \"WorkOrder\" where id=$P")" = "PARTS_SOURCING|true" ] && [ "$(WAIT $P)" = "HB1x2,HB3x1,OFFx2" ] \
  && pass "คอนเฟิร์ม + อะไหล่นอก + ค่าบริการ → แอดมินเช็คอะไหล่ (มี/หมด) · อะไหล่ที่รอ = รายการของช่าง + ของนอกสโตร์ (OT1 กับ MO1 ที่ช่างไม่เลือกออกจากใบ)" \
  || fail "คอนเฟิร์ม: $(echo "$R" | EMSG) · $(st $P) · $(WAIT $P)"
[ "$(DB "select string_agg(name||'x'||quantity, ',') from \"WorkOrderService\" where \"workOrderId\"=$P")" = "ค่าแรงทดสอบเลือกอะไหล่x1" ] \
  && [ "$(PICKS $P)|$(ITEMS $P)" = "RETURNED:1:true,CONFIRMED:2:true|HB1x2:OK,HB3x1:OK" ] \
  && [ "$(DB "select \"reviewedById\"||'|'||(\"reviewedAt\" is not null) from \"PartsPick\" where id=$PK2")" = "$SID|true" ] \
  && pass "ค่าบริการลงใบ · รอบที่ 2 CONFIRMED ทุกรายการ \"ตรง\" · คนคอนเฟิร์ม = หัวหน้าภาค" || fail "หลังคอนเฟิร์ม: $(PICKS $P) · $(ITEMS $P)"
[ "$(LASTNOTE $P PARTS_PICK_CONFIRMED)" = "คอนเฟิร์มอะไหล่ที่ช่างเลือก 2 รายการ + ใส่อะไหล่นอก 1 รายการ และค่าบริการ 1 รายการ → แอดมิน · เช็คอะไหล่ (มี/หมด) · ต้องเสนอราคาลูกค้าก่อนนัด · เอาออกจากใบ: $L_OT1, $L_MO1 (ใบเบิกเดิม RQE$SUF)" ] \
  && [ "$(DB "select status||'|'||(meta->>'count')||'|'||(meta->>'quote') from \"WorkOrderLog\" where \"workOrderId\"=$P and action='PARTS_PICK_CONFIRMED'")" = "PARTS_SOURCING|2|true" ] \
  && pass "ประวัติ \"คอนเฟิร์มอะไหล่ที่ช่างเลือก\": จำนวน · อะไหล่นอก/ค่าบริการ · ขั้นถัดไป · ต้องเสนอราคา · ของที่เอาออก + เลขใบเบิกเดิม" \
  || fail "ประวัติคอนเฟิร์ม: $(LASTNOTE $P PARTS_PICK_CONFIRMED)"
R=$(DET $P $T)
[ "$(echo "$R" | J 'const c=d.partsPickConfirmed; c?[d.statusLabel,d.partsPick,c.byName,c.roleLabel,c.count,c.quote,!!c.at].join("|"):"ไม่มี"')" = "แอดมิน · เช็คอะไหล่ (มี/หมด)||$SNAME|หัวหน้าภาค|2|true|true" ] \
  && pass "หน้าใบงาน (ช่าง): กล่องเขียว partsPickConfirmed (ใคร · หัวหน้าภาค · 2 รายการ · ต้องเสนอราคา) · ไม่มีรอบที่เปิดแล้ว" \
  || fail "partsPickConfirmed: $(echo "$R" | J 'JSON.stringify([d.statusLabel,d.partsPickConfirmed])' 2>&1 | head -c 300)"
# ใส่ค่าบริการอย่างเดียว — ประวัติต้องเป็น "+ ใส่ค่าบริการ" (หัวหน้าภาคใส่) ไม่ใช่ "… และค่าบริการ" ที่อ่านเหมือนช่างเลือกมา
R=$(CONF $O "{\"pickId\":$(PICKID $O),\"services\":[{\"name\":\"ค่าแรงทดสอบเคสเครื่องดับ\",\"quantity\":1}]}")
[ "$(st $O)|$(WAIT $O)|$(OPARTS $OUT2)" = "PARTS_SOURCING|HB2x1|HB2x1" ] \
  && [ "$(LASTNOTE $O PARTS_PICK_CONFIRMED)" = "คอนเฟิร์มอะไหล่ที่ช่างเลือก 1 รายการ + ใส่ค่าบริการ 1 รายการ → แอดมิน · เช็คอะไหล่ (มี/หมด) · ต้องเสนอราคาลูกค้าก่อนนัด · เอาออกจากใบ: $L_HB1" ] \
  && pass "คอนเฟิร์มใบเคสเครื่องดับ → รายการของช่างถึงกระดานตอนนี้ (HB2 แทน HB1 ทั้งในใบและบนกระดาน) · ค่าบริการอย่างเดียวขึ้น \"+ ใส่ค่าบริการ\"" \
  || fail "คอนเฟิร์มใบเคส: $(echo "$R" | EMSG) · ใบ=$(WAIT $O) · กระดาน=$(OPARTS $OUT2) · $(LASTNOTE $O PARTS_PICK_CONFIRMED)"
R=$(CONF $RW "{\"pickId\":$(PICKID $RW)}" $A)
[ "$(st $RW)" = "PARTS_SOURCING" ] \
  && [ "$(DB "select \"userId\" from \"WorkOrderLog\" where \"workOrderId\"=$RW and action='PARTS_PICK_CONFIRMED'")|$(DB "select \"reviewedById\" from \"PartsPick\" where \"workOrderId\"=$RW and status='CONFIRMED'")" = "$AID|$AID" ] \
  && [ "$(DET $RW $T | J 'd.partsPickConfirmed.roleLabel+"|"+d.partsPickConfirmed.quote')" = "แอดมิน|false" ] \
  && pass "แอดมินคอนเฟิร์มแทนได้ — ประวัติ/คนคอนเฟิร์ม = แอดมิน · กล่องเขียวบอก \"แอดมิน\" (ไม่มีของต้องเสนอราคา)" \
  || fail "แอดมินคอนเฟิร์ม: $(echo "$R" | EMSG) · $(st $RW)"
# ยี่ห้อเครื่องถูกแก้หลังช่างส่ง — รายการที่ไม่อยู่ในไฟล์ใหม่คอนเฟิร์มเข้าใบไม่ได้
DB "update \"Machine\" set model='Maytag' where \"branchId\"=$BID and code='$QM'" >/dev/null
R=$(CONF $Q "{\"pickId\":$(PICKID $Q)}")
DB "update \"Machine\" set model='Huebsch' where \"branchId\"=$BID and code='$QM'" >/dev/null
[ "$(echo "$R" | EMSG)" = "ยี่ห้อเครื่องเปลี่ยนหลังช่างส่ง — $K-HB1 ไม่อยู่ในไฟล์ Maytag หรือของใช้ร่วม ตีกลับให้ช่างเลือกใหม่" ] \
  && [ "$(st $Q)|$(PICKS $Q)|$(WAIT $Q)" = "NEW|RETURNED:1:true,PENDING:2:true|" ] \
  && pass "ยี่ห้อเครื่องเปลี่ยนเป็น Maytag หลังช่างส่ง → คอนเฟิร์มไม่ได้ (400) · ใบ/รอบ/อะไหล่ไม่เปลี่ยน" || fail "ยี่ห้อเปลี่ยน: $(echo "$R" | EMSG)"
R=$(CONF $NM "{\"pickId\":1}")
[ "$(echo "$R" | EMSG)" = "ใบนี้ไม่มีรายการอะไหล่ที่รอคอนเฟิร์ม" ] && pass "ใบที่ไม่มีรายการรอคอนเฟิร์ม → 409" || fail "ไม่มีรอบ: $(echo "$R" | EMSG)"

echo
echo "═══ F หัวหน้าภาค/แอดมินบันทึกผลตรวจแทนช่าง — ไม่ต้องคอนเฟิร์มตัวเอง (ข้อ 11)"
newinsp Huebsch "บันทึกแทน"; F1=$WO
WAITROW $F1 $OC 1
WAITROW $F1 $HB2 1 true "'RQF$SUF'"
R=$(INS $F1 "{\"note\":\"ช่างโทรมาเล่า บอร์ดเสีย\",\"parts\":$(PL $HB1:1)}" $S)
[ "$(st $F1)|$(PICKS $F1)|$(WAIT $F1)" = "NEW||HB1x1,OFFx1" ] \
  && pass "หัวหน้าภาคบันทึกแทนพร้อม HB1 → ไม่มีรอบให้คอนเฟิร์ม · ลงใบเลย (ของนอกสโตร์เดิมอยู่ต่อ · HB2 ที่ไม่ได้เลือกออกจากใบ)" \
  || fail "บันทึกแทน: $(echo "$R" | EMSG) · $(PICKS $F1) · $(WAIT $F1)"
[ "$(LASTACTS $F1)" = "INSPECTED,PARTS_PICKED_ON_BEHALF" ] \
  && [ "$(LASTNOTE $F1 PARTS_PICKED_ON_BEHALF)" = "เลือกอะไหล่ 1 รายการ — ใบไปฟอร์มระบุอะไหล่ เติมรายการที่เลือกไว้ให้ · เอาออกจากใบ: $L_HB2 (ใบเบิกเดิม RQF$SUF)" ] \
  && [ "$(DET $F1 $S | J 'd.statusLabel+"|"+d.partsPick+"|"+d.waitingParts.length')" = "หัวหน้าภาค · ระบุอะไหล่|null|2" ] \
  && pass "ประวัติ \"บันทึกผลตรวจแทนช่าง · เลือกอะไหล่ (ไม่ต้องคอนเฟิร์ม)\" + เลขใบเบิกของที่เอาออก · ป้าย \"หัวหน้าภาค · ระบุอะไหล่\" (ฟอร์มเดิมเติมรายการไว้)" \
  || fail "ประวัติบันทึกแทน: $(LASTACTS $F1) · $(LASTNOTE $F1 PARTS_PICKED_ON_BEHALF)"
newinsp Huebsch "บันทึกแทนหลังตีกลับ"; F2=$WO
R=$(INS $F2 "{\"note\":\"หัวหน้าภาคเลือกผิดยี่ห้อ\",\"parts\":$(PL $MT1:1)}" $S)
echo "$R" | EMSG | grep -qF "อยู่ในไฟล์ Maytag" && [ "$(st $F2)" = "INSPECTING" ] \
  && pass "หัวหน้าภาคบันทึกแทนก็ล็อกยี่ห้อ — MT1 บนเครื่อง Huebsch → 400" || fail "บันทึกแทน MT1: $(echo "$R" | EMSG)"
INS $F2 "{\"note\":\"f2 บอร์ด\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $F2 "{\"pickId\":$(PICKID $F2),\"reason\":\"รหัสไม่ตรง\",\"flags\":[$HB1]}" >/dev/null
R=$(INS $F2 "{\"note\":\"f2 บอร์ด\",\"parts\":$(PL $HB1:1)}" $S)
[ "$(st $F2)|$(PICKS $F2)|$(WAIT $F2)" = "NEW|RETURNED:1:false|HB1x1" ] \
  && [ "$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$F2")" = "หัวหน้าภาคบันทึกผลตรวจแทนช่าง" ] \
  && [ "$(DET $F2 $S | J 'd.statusLabel+"|"+d.partsPick')" = "หัวหน้าภาค · ระบุอะไหล่|null" ] \
  && pass "ถูกตีกลับแล้วหัวหน้าภาคบันทึกแทน → รอบที่ตีกลับถูกปิด (voidedAt) · ไม่ติดด่านส่งใหม่ · ใบไประบุอะไหล่" \
  || fail "บันทึกแทนหลังตีกลับ: $(echo "$R" | EMSG) · $(PICKS $F2)"

echo
echo "═══ G ทุกทางออกจากรอบปิดรอบที่ค้าง (voidOpenPick)"
R=$(POST $S work-orders/$KW/inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\",\"scheduledTime\":\"10:00\"}")
[ "$(st $KW)|$(PICKS $KW)" = "INSPECT_CONFIRM|PENDING:1:false" ] \
  && [ "$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$KW")" = "หัวหน้าภาคส่งตรวจหน้างานใหม่" ] \
  && [ "$(LASTACTS $KW 1)|$(DET $KW $S | J 'd.statusLabel+"|"+d.partsPick')" = "INSPECT_REQUESTED|แอดมิน · นัดร้าน (ตรวจหน้างาน)|null" ] \
  && pass "\"ต้องเข้าตรวจสอบหน้างานก่อน\" ระหว่างรอคอนเฟิร์ม → ส่งตรวจใหม่ + ปิดรอบในทรานแซกชันเดียว" \
  || fail "ส่งตรวจใหม่: $(echo "$R" | EMSG) · $(st $KW) · $(PICKS $KW)"
R=$(POST $A work-orders/$EW/cancel '{"reasonCode":"OTHER","note":"ทดสอบยกเลิกระหว่างรอคอนเฟิร์ม"}')
[ "$(st $EW)|$(PICKS $EW)|$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$EW")" = "CANCELLED|PENDING:1:false|ยกเลิกใบงาน" ] \
  && pass "ยกเลิกใบระหว่างรอคอนเฟิร์ม → รอบถูกปิด" || fail "ยกเลิก: $(echo "$R" | EMSG) · $(PICKS $EW)"
newinsp Huebsch "ย้อนขั้น"; G3=$WO
INS $G3 "{\"note\":\"g3\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $G3 "{\"pickId\":$(PICKID $G3),\"reason\":\"ตัวนี้ยังไม่ต้องเปลี่ยน\"}" >/dev/null
R=$(POST $S work-orders/$G3/rollback '{"toStage":"NEW","reason":"ทดสอบย้อนขั้นใบที่ถูกตีกลับ"}')
[ "$(st $G3)|$(PICKS $G3)|$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$G3")" = "NEW|RETURNED:1:false|ย้อนขั้น" ] \
  && [ "$(DET $G3 $S | J 'd.statusLabel+"|"+d.partsPick')" = "หัวหน้าภาค · ระบุอะไหล่|null" ] \
  && pass "ย้อนขั้นใบที่ถูกตีกลับไป NEW → รอบถูกปิด · ป้ายเป็น \"ระบุอะไหล่\" (ไม่ใช่คอนเฟิร์ม)" || fail "ย้อนขั้น: $(echo "$R" | EMSG) · $(PICKS $G3)"
# F2 = ตีกลับ → หัวหน้าภาคบันทึกแทน (ปิดรอบ) → ระบุอะไหล่ → ย้อนกลับไปตรวจหน้างาน: การ์ดแดงรอบเก่าต้องไม่กลับมา
POST $S work-orders/$F2/parts "{\"needsParts\":true,\"parts\":$(PL $HB1:1)}" >/dev/null
R=$(POST $S work-orders/$F2/rollback '{"toStage":"INSPECTING","reason":"ทดสอบย้อนกลับไปตรวจ"}')
[ "$(st $F2)" = "INSPECTING" ] \
  && [ "$(curl -s localhost:4000/api/work-orders/my-day -H "$(H $T)" | J 'const r=d.rows.find(x=>x.id==='$F2'); r?String(r.partsReturned)+"|"+r.statusLabel:"ไม่มีใบ"')" = "null|ช่าง · ตรวจหน้างาน" ] \
  && [ "$(PICKS $F2)" = "RETURNED:1:false" ] && [ "$(DET $F2 $T | J 'd.statusLabel+"|"+d.partsPick')" = "ช่าง · ตรวจหน้างาน|null" ] \
  && [ "$(curl -s localhost:4000/api/plans/pending -H "$(H $S)" | J 'String(d.some(r=>r.id==='$F2'))')" = "true" ] \
  && pass "ตีกลับ → บันทึกแทน → ระบุอะไหล่ → ย้อนไปตรวจหน้างาน: ไม่มีการ์ดแดงรอบเก่า · ป้ายตรวจหน้างานปกติ · ขึ้น \"รอจัดแผน\" (ต้องหาวัน)" \
  || fail "ย้อนกลับไปตรวจ: $(echo "$R" | EMSG) · $(st $F2) · $(PICKS $F2)"
newinsp Huebsch "ย้อนสองครั้ง"; G5=$WO
INS $G5 "{\"note\":\"g5\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $G5 "{\"pickId\":$(PICKID $G5),\"reason\":\"ขาดอะไหล่ที่ต้องใช้\"}" >/dev/null
POST $S work-orders/$G5/rollback '{"toStage":"INSPECT_DISPATCH","reason":"ทดสอบย้อนไปส่งช่าง"}' >/dev/null
POST $S work-orders/$G5/rollback '{"toStage":"NEW","reason":"ทดสอบย้อนไประบุอะไหล่"}' >/dev/null
INSP $G5
R=$(DET $G5 $T)
[ "$(PICKS $G5)" = "RETURNED:1:false" ] && [ "$(echo "$R" | J 'd.statusLabel+"|"+d.partsPick')" = "ช่าง · ตรวจหน้างาน|null" ] \
  && R2=$(INS $G5 "{\"note\":\"g5\",\"parts\":$(PL $HB1:1)}") && [ "$(PICKS $G5)" = "RETURNED:1:false,PENDING:1:true" ] \
  && pass "ตีกลับ → ย้อนไปส่งช่าง → ย้อนไป NEW → ส่งตรวจใหม่ถึงช่าง: ไม่มีรอบเปิด · ส่งรายการเดิมได้เลย (เริ่มรอบ 1 ใหม่ ไม่ติดด่านส่งใหม่)" \
  || fail "ย้อนสองครั้ง: $(PICKS $G5) · $(echo "$R" | J 'd.statusLabel')"
newinsp Huebsch "ส่งว่างหลังตีกลับ"; G6=$WO
INS $G6 "{\"note\":\"g6\",\"parts\":$(PL $HB1:1)}" >/dev/null
RET $G6 "{\"pickId\":$(PICKID $G6),\"reason\":\"ยังไม่ต้องเปลี่ยน\",\"flags\":[$HB1]}" >/dev/null
R=$(INS $G6 '{"note":"g6","parts":[]}')
[ "$(st $G6)|$(PICKS $G6)|$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$G6")" = "NEW|RETURNED:1:false|ช่างส่งผลตรวจโดยไม่เลือกอะไหล่" ] \
  && [ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J 'const r=d.rows.find(x=>x.id==='$G6'); r?r.statusLabel+"|"+r.partsPick:"ไม่มี"')" = "หัวหน้าภาค · ระบุอะไหล่|null" ] \
  && pass "ถูกตีกลับแล้วช่างส่งแบบไม่เลือกอะไหล่ → รอบถูกปิด · กล่องงานหัวหน้าภาคขึ้น \"ระบุอะไหล่\" (partsPick ว่าง)" \
  || fail "ส่งว่างหลังตีกลับ: $(echo "$R" | EMSG) · $(PICKS $G6)"

newinsp Huebsch "หัวหน้าภาคปิดใบ"; G7=$WO
INS $G7 "{\"note\":\"g7\",\"parts\":$(PL $HB1:1)}" >/dev/null
R=$(POST $S work-orders/$G7/supervisor-close '{"reason":"SELF","note":"เครื่องกลับมาใช้งานได้เองระหว่างรอคอนเฟิร์ม"}')
[ "$(st $G7)|$(PICKS $G7)|$(DB "select \"voidNote\" from \"PartsPick\" where \"workOrderId\"=$G7")" = "DONE|PENDING:1:false|หัวหน้าภาคปิดใบงาน" ] \
  && [ "$(LASTACTS $G7 1)" = "SUPERVISOR_CLOSED" ] \
  && pass "หัวหน้าภาคปิดใบระหว่างรอคอนเฟิร์ม → รอบถูกปิด (ไม่ลงประวัติเพิ่ม — แถวปิดงานยังเป็นแถวล่าสุด)" || fail "หัวหน้าภาคปิดใบ: $(echo "$R" | EMSG) · $(PICKS $G7)"

echo
echo "═══ J คัดลอกเป็นใบทดสอบ — รายการที่รอคอนเฟิร์มติดไปด้วย (D14)"
R=$(POST $A work-orders/$Q/test-copy '{}')
COPY=$(echo "$R" | J 'd.id??"ERR"'); ADDWO "$COPY"
[ "$(PICKS $COPY)|$(ITEMS $COPY)|$(st $COPY)" = "PENDING:2:true|HB1x1:-|NEW" ] \
  && [ "$(DET $COPY $S | J 'd.statusLabel+"|"+d.partsPick.round')" = "$STAGE_LABEL|2" ] \
  && pass "ใบทดสอบของใบที่รอคอนเฟิร์ม: รอบที่ 2 PENDING รายการเดียวกัน · ป้าย \"$STAGE_LABEL\"" || fail "test-copy: $(echo "$R" | head -c 200) · $(PICKS $COPY)"
curl -s -o /dev/null -X DELETE localhost:4000/api/work-orders/$COPY -H "$(H $A)"
[ "$(DB "select count(*) from \"PartsPick\" where \"workOrderId\"=$COPY")|$(DB "select count(*) from \"WorkOrder\" where id=$COPY")" = "0|0" ] \
  && pass "ลบใบทดสอบ → รอบเลือกอะไหล่ของใบนั้นหายตาม (cascade)" || fail "ลบใบทดสอบแล้วรอบค้าง"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
