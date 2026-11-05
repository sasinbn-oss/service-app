#!/bin/bash
# ทดสอบ: ประวัติการนำเข้า (เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69) — GET /import-history · /runs/:id · /runs/:id/excel · POST /stop
#   1. ใบแจ้งซ่อมยืนยันสองชุด (runKey เดียวกัน) = รอบเดียว · ผลทุกแถว NEW/OPEN/IMPORTED/ERROR + รหัสใบงานตรงฐานข้อมูล
#      · ชื่อไฟล์ไทยไม่เพี้ยน · ไม่มีชื่อ/เบอร์ผู้ติดต่อ · ใบที่ย้ายไปถังขยะขึ้นว่าอยู่ในถัง · Excel ผลทีละแถวครบ ไม่มีเบอร์
#   2. หยุดกลางทาง: ส่งชุดแรกแล้วกดหยุด → STOPPED ทันที · นำเข้าไฟล์เดิมใหม่ = รอบใหม่ (ลิงก์ถึงกันทั้งสองทาง)
#      · ไม่บอกหยุดแต่เงียบเกิน 5 นาที → หน้าประวัติตัดสินตอนอ่าน (ฐานข้อมูลยัง RUNNING) · ไม่มีใบไหนเปิด = ไม่สำเร็จ
#   3. เซิร์ฟเวอร์พังกลางทาง (trigger ชั่วคราว): เปิดไปแล้วบางใบ → หยุดกลางทาง + ข้อความไทยเดียวกับที่แอดมินเห็น · พังแถวแรก → ไม่สำเร็จ
#   4. แอปรุ่นก่อน: ทั้งไฟล์ไม่มี runKey = รอบละคำขอ (นำเข้าซ้ำ = รอบใหม่) · ทีละชุดไม่มี runKey = รวมเป็นรอบเดียวด้วยไฟล์เดียวกัน
#   5. ชนิดอื่น: ทะเบียนสาขา · สาขาที่ยกเลิก · รถ (ไม่มีเลขบัตร) · รายชื่อ (ไม่มีรหัสตั้งต้น) · Maid (ไม่มีรหัสสุ่ม/เบอร์) · รายงานเครื่องที่ล้ม
#      · ประวัติเดิมของรายงานเครื่อง (ชื่อไฟล์ที่เก็บเพี้ยนไว้อ่านออก) และอะไหล่ ขึ้นย้อนหลังในหน้าเดียวกัน · ดูตัวอย่างไม่เกิดรอบ
#   6. สิทธิ์: หัวหน้าภาค/ช่าง 403 ทุกเส้น · Admin Spare Part ดูได้ แต่สั่งหยุดรอบไม่ได้
# ต้องมี DATABASE_URL (ทุกข้อเช็คที่ฐานข้อมูล ไม่ใช่แค่คำตอบของ API) · ล้างทุกอย่างที่สร้างตอนจบ
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
A=$(login A001); S=$(login S001); T=$(login T001)
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")

R=$RANDOM
B=$((R % 500 + 3500))
PRE="ประวัติทดสอบ$R"
DIR=$(mktemp -d)
IH0=$(DB 'select coalesce(max(id),0) from "ImportRun"')
MI=""
cleanup() {
  _po_psql 'drop trigger if exists test_history_fail on "WorkOrder"; drop function if exists test_history_fail()' >/dev/null 2>&1
  purge_orders "$A" $(DB "select id from \"WorkOrder\" where symptom like '$PRE%'")
  DB "delete from \"Machine\" where code in ('W$B','W$((B + 1))','W$((B + 2))') and \"branchId\"=(select id from \"Branch\" where code='C0006')" >/dev/null
  DB "delete from \"ImportRun\" where id > $IH0" >/dev/null
  [ -n "$MI" ] && DB "delete from \"MachineImport\" where id=$MI" >/dev/null
  DB "delete from \"SparePartImport\" where \"batchId\" like 'zihp$R%'" >/dev/null
  DB "delete from \"Branch\" where code like 'ZIH$R%'" >/dev/null
  DB "delete from \"Vehicle\" where replace(replace(\"plateNumber\",' ',''),'-','') like '9ทส100%'" >/dev/null
  DB "update \"Branch\" set \"cocoSupervisorId\"=null where \"cocoSupervisorId\" in (select id from \"User\" where \"employeeCode\" like 'zz.hmaid%')" >/dev/null
  DB "delete from \"User\" where \"employeeCode\" like '99____' or \"employeeCode\" like 'zz.hmaid%' or \"employeeCode\"='ZIHPA$R'" >/dev/null
  rm -rf "$DIR"
}
trap cleanup EXIT

# ไฟล์ฟอร์มแจ้งซ่อมแบบของจริง (tests/fixtures-repair-form.js) — spec เป็น JSON ต่อแถว
form() { echo "$2" > "$DIR/spec.json"; NODE_PATH=backend/node_modules node tests/fixtures-repair-form.js "$DIR/spec.json" "$DIR/$1" >/dev/null; }
row() { echo "{\"branch\":\"${1}\",\"jobType\":\"${2}\",\"machine\":\"${3}\",\"model\":\"OASIS\",\"size\":\"13 Kg\",\"symptom\":\"$PRE ${4}\",\"contact\":\"คุณประวัติ\",\"phone\":\"${5:-081-111-0000}\",\"place\":\"สาขาทดสอบ\"${6:+,\"image\":true}}"; }
# ส่งไฟล์แบบหน้าจอ: $1 = ไฟล์ · ที่เหลือ = ฟิลด์เพิ่ม (apply/only/runKey) · ชื่อไฟล์ภาษาไทยตามที่แอดมินอัปจริง
IMP() { local f="$1"; shift; curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$DIR/$f;filename=$THAI" "$@"; }
RUNID() { DB "select id from \"ImportRun\" where \"runKey\"='$AID:$1'"; }
RES() { DB "select string_agg(line||':'||result, ',' order by line) from \"ImportRunRow\" where \"runId\"=$1"; }

echo "═══ 1. ใบแจ้งซ่อม: ยืนยันสองชุดเป็นรอบเดียว"
THAI="แบบฟอร์มแจ้งซ่อม COCO ทดสอบ$R.xlsx"
form f1.xlsx "[$(row C0006 CM W$B 'ประตูล็อค' 081-111-0002),$(row C0006 CM W$B 'น้ำไม่เข้า' 081-111-0003),$(row C0006 ตู้แลกเหรียญ '' 'เหรียญไม่ออก' 081-111-0004),
  $(row ZZ998 CM W1 'สาขาไม่มี' 081-111-0005),$(row C0006 ตู้แลกเหรียญ '' 'เหรียญไม่ออก' 081-111-0004),$(row C0006 CM W$((B + 1)) 'แถว7' 081-111-0007),
  $(row C0006 CM W$((B + 2)) 'แถว8' 081-111-0008 1)]"
N0=$(DB 'select count(*) from "ImportRun"')
P=$(IMP f1.xlsx)
[ "$(echo "$P" | J 'd.rows.map(r=>r.line+":"+r.status).join(",")')" = "2:NEW,3:OPEN,4:NEW,5:ERROR,6:IMPORTED,7:NEW,8:NEW" ] && [ "$(DB 'select count(*) from "ImportRun"')" = "$N0" ] \
  && pass "ดูตัวอย่าง: ใบใหม่ 4 · เครื่องซ้ำในไฟล์ 1 · สาขาไม่มี 1 · ส่งซ้ำ 1 — ไม่เกิดรอบในประวัติ (ฐานข้อมูล)" || fail "ตัวอย่าง: $(echo "$P" | J 'd.rows.map(r=>r.line+":"+r.status).join(",")||d.error') · รอบ $(DB 'select count(*) from "ImportRun"')/$N0"
K1="k1-$R-abcdef"
B1=$(IMP f1.xlsx -F apply=true -F only=2,4 -F runKey=$K1)
RID=$(RUNID $K1)
[ -n "$RID" ] && [ "$(echo "$B1" | J 'd.runId')" = "r$RID" ] && [ "$(DB "select status||'|'||kind||'|'||(\"finishedAt\" is null)||'|'||\"rowsInFile\" from \"ImportRun\" where id=$RID")" = "RUNNING|REPAIR_FORM|true|7" ] \
  && [ "$(RES $RID)" = "2:NEW,3:OPEN,4:NEW,5:ERROR,6:IMPORTED,7:PENDING,8:PENDING" ] \
  && pass "ชุดแรก (แถว 2,4): รอบเริ่ม RUNNING · ทุกแถวของไฟล์ถูกเก็บ · แถว 7,8 ยังไม่ได้เปิด (PENDING) — ฐานข้อมูล" || fail "ชุดแรก: run=$RID $(echo "$B1" | J 'd.runId+" "+(d.error||"")') · $(RES "${RID:-0}")"
D=$(GET $A "import-history/runs/r$RID")
[ "$(echo "$D" | J 'd.status+"|"+d.tiles.map(t=>t.key+"="+t.n).join(",")')" = "running|NEW=2,PENDING=2,OPEN=1,IMPORTED=1,ERROR=1" ] \
  && pass "ระหว่างนำเข้า: หน้าประวัติขึ้น 'กำลังนำเข้า' · เปิดแล้ว 2 · รอเปิด 2" || fail "ระหว่างนำเข้า: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.tiles)')"
B2=$(IMP f1.xlsx -F apply=true -F only=7,8 -F runKey=$K1)
[ "$(echo "$B2" | J 'd.runId+"|"+d.created.length')" = "r$RID|2" ] && [ "$(DB "select count(*) from \"ImportRun\" where id > $IH0 and kind='REPAIR_FORM'")" = "1" ] \
  && [ "$(DB "select status||'|'||(\"finishedAt\" is not null) from \"ImportRun\" where id=$RID")" = "DONE|true" ] \
  && [ "$(RES $RID)" = "2:NEW,3:OPEN,4:NEW,5:ERROR,6:IMPORTED,7:NEW,8:NEW" ] \
  && pass "ชุดที่สองเข้ารอบเดิม (runKey เดียวกัน) · ไม่เหลือแถวรอเปิด = DONE — ฐานข้อมูลมีรอบเดียว" || fail "ชุดที่สอง: $(echo "$B2" | J 'd.runId+" "+(d.error||"")') · $(DB "select status from \"ImportRun\" where id=$RID") · $(RES $RID)"
# รหัสใบงานในแถว = ใบที่เปิดจริง (สาขา/อาการตรง)
REFS=$(DB "select string_agg(r.line||'='||w.symptom, ',' order by r.line) from \"ImportRunRow\" r join \"WorkOrder\" w on w.code=r.ref where r.\"runId\"=$RID and r.result='NEW'")
[ "$REFS" = "2=$PRE ประตูล็อค,4=$PRE เหรียญไม่ออก,7=$PRE แถว7,8=$PRE แถว8" ] \
  && [ "$(DB "select string_agg(line||'|'||coalesce(code,'')||'|'||coalesce(name,'-')||'|'||coalesce(machine,'-'), ',' order by line) from \"ImportRunRow\" where \"runId\"=$RID and line in (2,5)")" = "2|C0006|$(DB "select name from \"Branch\" where code='C0006'")|W$B,5|ZZ998|-|W1" ] \
  && pass "แถวเก็บสาขา/ชื่อสาขา/เครื่อง · รหัสใบงานของแถวที่เปิด = ใบที่เปิดจริงจากแถวนั้น (ฐานข้อมูล)" || fail "รหัสใบงานในแถว: $REFS"
[ "$(DB "select note from \"ImportRunRow\" where \"runId\"=$RID and line=5")|$(DB "select note from \"ImportRunRow\" where \"runId\"=$RID and line=6")" = "ไม่พบสาขา ZZ998 ในระบบ|ซ้ำกับแถว 4 ในไฟล์นี้ (ส่งฟอร์มซ้ำ)" ] \
  && pass "เหตุผลของแถวที่ข้าม/นำเข้าไม่ได้เก็บไว้ (สาขาไม่มี · ส่งฟอร์มซ้ำ)" || fail "เหตุผล: $(DB "select string_agg(line||'='||coalesce(note,''), ' | ' order by line) from \"ImportRunRow\" where \"runId\"=$RID")"
[ "$(DB "select \"fileName\"||'|'||coalesce(\"byName\",'')||'|'||\"byUserId\" from \"ImportRun\" where id=$RID")" = "$THAI|$(DB "select name from \"User\" where id=$AID")|$AID" ] \
  && pass "ชื่อไฟล์ภาษาไทยไม่เพี้ยน (multer อ่านเป็น latin1) · จำคนนำเข้า" || fail "ชื่อไฟล์/คน: $(DB "select \"fileName\"||'|'||coalesce(\"byName\",'') from \"ImportRun\" where id=$RID")"
LEAK=$(DB "select count(*) from \"ImportRunRow\" r join \"ImportRun\" u on u.id=r.\"runId\" where u.id > $IH0 and (concat_ws('|',r.code,r.name,r.machine,r.detail,r.note,r.ref,u.\"fileName\",u.error,u.summary::text) like '%081-111%' or concat_ws('|',r.code,r.name,r.machine,r.detail,r.note,r.ref) like '%คุณประวัติ%')")
[ "$LEAK" = "0" ] && pass "ไม่เก็บชื่อ/เบอร์ผู้ติดต่อจากฟอร์มในประวัติ (ฐานข้อมูล — ทุกช่องของทุกแถว)" || fail "เจอชื่อ/เบอร์ผู้ติดต่อในประวัติ $LEAK แถว"
D=$(GET $A "import-history/runs/r$RID")
[ "$(echo "$D" | J '[d.status,d.statusLabel,d.tiles.map(t=>t.key+"="+t.n).join(","),d.rows.length,d.rowsTotal,d.actions.opened,d.actions.excel,d.fileName].join("|")')" = "ok|ครบ|NEW=4,OPEN=1,IMPORTED=1,ERROR=1|7|7|4|true|$THAI" ] \
  && pass "รายละเอียดรอบ: ครบ · เปิดใหม่ 4 · มีใบค้าง 1 · ซ้ำ 1 · นำเข้าไม่ได้ 1 · ทุกแถว 7 · ปุ่มดูใบงานที่เปิด (4)" || fail "รายละเอียด: $(echo "$D" | J '[d.status,JSON.stringify(d.tiles),d.rows.length,d.rowsTotal,JSON.stringify(d.actions)].join(" ")')"
echo "$D" | J 'const r=d.rows.find(x=>x.line===3); r.chip==="มีใบค้าง — ข้าม"&&/แถว 2 ในไฟล์นี้/.test(r.note)&&r.ref===null&&d.rows.find(x=>x.line===5).chip==="นำเข้าไม่ได้"?"ok":"bad"' | grep -q ok \
  && pass "แถวบอกผลเป็นภาษาไทย (มีใบค้าง — ข้าม · นำเข้าไม่ได้) พร้อมเหตุผล" || fail "ป้ายแถว: $(echo "$D" | J 'JSON.stringify(d.rows.slice(0,4))')"
SH=$(GET $A "import-history/runs/r$RID?show=NEW")
WID=$(DB "select id from \"WorkOrder\" where symptom='$PRE แถว7'")
echo "$SH" | J 'd.rows.length===4&&d.shownTotal===4&&d.rows.every(r=>r.result==="NEW"&&r.refState==="open"&&r.refId>0)&&d.rows.find(r=>r.line===7).refId==='$WID'?"ok":"bad"' | grep -q ok \
  && pass "กดตัวเลข 'เปิดใบใหม่' = เฉพาะ 4 แถวที่เปิด · แต่ละแถวเปิดใบงานได้ (id ตรงฐานข้อมูล)" || fail "กรองแถวที่เปิด: $(echo "$SH" | J 'JSON.stringify(d.rows.map(r=>[r.line,r.refState,r.refId]))')"
# ใบที่ถูกย้ายไปถังขยะ — แถวบอกว่าอยู่ในถัง แทนลิงก์ที่กดแล้วไม่เจอใบ
W4=$(DB "select id from \"WorkOrder\" where symptom='$PRE เหรียญไม่ออก'")
curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$W4" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"reason":"TEST","note":"ทดสอบประวัติการนำเข้า"}'
[ "$(DB "select \"deletedAt\" is not null from \"WorkOrder\" where id=$W4")" = "t" ] \
  && GET $A "import-history/runs/r$RID?show=NEW" | J 'const r=d.rows.find(x=>x.line===4); r.refState==="trash"&&r.refId===null?"ok":"bad"' | grep -q ok \
  && pass "ใบที่ย้ายไปถังขยะ: แถวขึ้น 'อยู่ในถังขยะ' ไม่ใช่ลิงก์เปิดใบ" || fail "ใบในถังขยะ: $(GET $A "import-history/runs/r$RID?show=NEW" | J 'JSON.stringify(d.rows.find(x=>x.line===4))')"
# ดาวน์โหลดผลทีละแถว (Excel) — สร้างจากที่เก็บไว้ ไม่ได้เก็บไฟล์ต้นฉบับ
XL=$(GET $A "import-history/runs/r$RID/excel")
curl -s "localhost:4000$(echo "$XL" | J 'd.path')" -o "$DIR/out.xlsx"
XR=$(NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const ws=wb.getWorksheet("ผลทีละแถว"); const rows=[]; ws.eachRow((r,i)=>{ if(i>1) rows.push(r.values.slice(1).map(v=>v??"").join("|")); });
    const all=[]; wb.eachSheet(s=>s.eachRow(r=>all.push(r.values.join("|"))));
    console.log([wb.worksheets.map(s=>s.name).join(","), rows.length, rows.find(r=>r.startsWith("7|"))?.split("|")[5], /WO-\d+/.test(rows.find(r=>r.startsWith("7|"))), all.some(x=>/081-111|คุณประวัติ/.test(x))].join(";")); });' "$DIR/out.xlsx")
[ "$XR" = "สรุป,ผลทีละแถว;7;เปิดใบใหม่;true;false" ] && pass "Excel ผลทีละแถว: แผ่นสรุป + ทุกแถว 7 แถว (ผล · รหัสใบงาน) · ไม่มีชื่อ/เบอร์ผู้ติดต่อ" || fail "Excel: $XR · $(echo "$XL" | head -c 200)"

echo
echo "═══ 2. หยุดกลางทาง"
THAI="ฟอร์มแจ้งซ่อม หยุดกลางทาง$R.xlsx"
form f2.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'หยุด ก' 081-222-0002),$(row C0006 ตู้แลกเหรียญ '' 'หยุด ข' 081-222-0003),$(row C0006 ตู้แลกเหรียญ '' 'หยุด ค' 081-222-0004)]"
K2="k2-$R-abcdef"
IMP f2.xlsx -F apply=true -F only=2 -F runKey=$K2 >/dev/null
RS=$(RUNID $K2)
ST=$(curl -s -X POST localhost:4000/api/import-history/stop -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"runKey\":\"$K2\",\"reason\":\"user\"}")
[ "$(echo "$ST" | J 'd.ok')" = "true" ] && [ "$(DB "select status||'|'||(\"finishedAt\" is not null)||'|'||error from \"ImportRun\" where id=$RS")" = "STOPPED|true|กดหยุดเองระหว่างนำเข้า" ] \
  && [ "$(RES $RS)" = "2:NEW,3:PENDING,4:PENDING" ] \
  && pass "กดหยุดหลังชุดแรก → รอบเป็น STOPPED ทันทีพร้อมเหตุผล · แถว 3,4 ยังไม่ได้เปิด (ฐานข้อมูล)" || fail "หยุด: $ST · $(DB "select status||'|'||coalesce(error,'') from \"ImportRun\" where id=${RS:-0}") · $(RES ${RS:-0})"
D=$(GET $A "import-history/runs/r$RS")
echo "$D" | J 'd.status==="partial"&&d.statusLabel==="หยุดกลางทาง"&&d.banner.title==="หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ"&&/กดหยุดเอง/.test(d.banner.text)&&/อีก 2 แถวยังไม่ได้เปิด/.test(d.banner.text)&&d.tiles.find(t=>t.key==="PENDING").n===2&&d.rows.filter(r=>r.chip==="ยังไม่ได้เปิด").length===2?"ok":"bad"' | grep -q ok \
  && pass "หน้าประวัติ: หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ · อีก 2 แถวยังไม่ได้เปิด · ช่อง 'ยังไม่ได้เปิด' 2" || fail "รายละเอียดรอบที่หยุด: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.banner)+" "+JSON.stringify(d.tiles)')"
[ "$(CODE $A import-history/stop POST "{\"runKey\":\"$K2\",\"reason\":\"user\"}")" = "200" ] && [ "$(curl -s -X POST localhost:4000/api/import-history/stop -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"runKey\":\"$K1\"}" | J 'd.ok')" = "false" ] \
  && [ "$(DB "select status from \"ImportRun\" where id=$RID")" = "DONE" ] \
  && pass "สั่งหยุดรอบที่จบแล้วไม่เปลี่ยนอะไร (รอบที่ครบยัง DONE)" || fail "หยุดรอบที่จบแล้ว: $(DB "select status from \"ImportRun\" where id=$RID")"
# นำเข้าไฟล์เดิมใหม่ = รอบใหม่ เปิดเฉพาะที่เหลือ — สองรอบลิงก์ถึงกัน
K3="k3-$R-abcdef"
IMP f2.xlsx -F apply=true -F only=3,4 -F runKey=$K3 >/dev/null
RN=$(RUNID $K3)
[ -n "$RN" ] && [ "$RN" != "$RS" ] && [ "$(RES $RN)" = "2:IMPORTED,3:NEW,4:NEW" ] && [ "$(DB "select status from \"ImportRun\" where id=$RN")" = "DONE" ] \
  && GET $A "import-history/runs/r$RN" | J 'd.banner&&d.banner.runBefore.id==="r'$RS'"&&/รอบก่อน/.test(d.banner.text)?"ok":"bad"' | grep -q ok \
  && GET $A "import-history/runs/r$RS" | J 'd.banner.runAfter.id==="r'$RN'"?"ok":"bad"' | grep -q ok \
  && pass "นำเข้าไฟล์เดิมอีกครั้ง = รอบใหม่ (แถวที่เปิดรอบก่อนเป็นนำเข้าแล้ว) · รอบที่หยุดชี้ไปรอบที่เปิดที่เหลือ และกลับกัน" || fail "รอบใหม่ของไฟล์เดิม: $RN/$RS $(RES ${RN:-0}) · $(GET $A "import-history/runs/r$RN" | J 'JSON.stringify(d.banner)')"
# แอปหายกลางทาง (ปิดเบราว์เซอร์) — ไม่มีใครบอกหยุด · เงียบเกิน 5 นาที หน้าประวัติตัดสินเอง
THAI="ฟอร์มแจ้งซ่อม แอปหาย$R.xlsx"
form f3.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'หาย ก' 081-333-0002),$(row C0006 ตู้แลกเหรียญ '' 'หาย ข' 081-333-0003)]"
K4="k4-$R-abcdef"
IMP f3.xlsx -F apply=true -F only=2 -F runKey=$K4 >/dev/null
RI=$(RUNID $K4)
[ "$(GET $A "import-history/runs/r$RI" | J 'd.status')" = "running" ] || fail "รอบที่เพิ่งส่งชุดแรกต้องเป็นกำลังนำเข้า"
DB "update \"ImportRun\" set \"lastAt\" = timezone('utc', now()) - interval '6 minutes' where id=$RI" >/dev/null
D=$(GET $A "import-history/runs/r$RI")
[ "$(echo "$D" | J 'd.status+"|"+d.banner.title')" = "partial|หยุดกลางทาง — เปิดไปแล้ว 1 จาก 2 ใบ" ] && [ "$(DB "select status from \"ImportRun\" where id=$RI")" = "RUNNING" ] \
  && echo "$D" | J '/แอปไม่ได้ส่งชุดที่เหลือมา/.test(d.banner.text)?"ok":"bad"' | grep -q ok \
  && pass "เงียบเกิน 5 นาที → หน้าประวัติขึ้นหยุดกลางทาง (ตัดสินตอนอ่าน — ฐานข้อมูลยัง RUNNING ไม่มีงานเบื้องหลังมาแก้)" || fail "รอบที่แอปหาย: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.banner)') · $(DB "select status from \"ImportRun\" where id=$RI")"
K5="k5-$R-abcdef"
IMP f3.xlsx -F apply=true -F only=99 -F runKey=$K5 >/dev/null
R5=$(RUNID $K5)
DB "update \"ImportRun\" set \"lastAt\" = timezone('utc', now()) - interval '6 minutes' where id=$R5" >/dev/null
[ "$(GET $A "import-history/runs/r$R5" | J 'd.status+"|"+d.statusLabel+"|"+d.banner.title')" = "failed|ไม่สำเร็จ|นำเข้าไม่สำเร็จ — ไม่มีใบไหนเปิด" ] \
  && [ "$(GET $A 'import-history?kind=repair&days=1' | J 'd.runs.find(r=>r.id==="r'$R5'").short')" = "ไม่มีใบไหนเปิด" ] \
  && pass "รอบที่เงียบไปโดยไม่มีใบไหนเปิด → ไม่สำเร็จ ('ไม่มีใบไหนเปิด' ทั้งรายการและรายละเอียด)" || fail "รอบไม่สำเร็จ: $(GET $A "import-history/runs/r$R5" | J 'd.status+" "+JSON.stringify(d.banner)')"

echo
echo "═══ 3. เซิร์ฟเวอร์พังกลางทาง"
# trigger ชั่วคราวในฐานข้อมูลทดสอบ (แบบ repair-import-test.sh) — แถวที่อาการขึ้นต้น "…พัง" สร้างใบไม่ได้ · ลบใน cleanup เสมอ
_po_psql "create or replace function test_history_fail() returns trigger as \$\$ begin
  if new.symptom like '$PRE พัง%' then raise exception 'ทดสอบ: แถวนี้ต้องพัง'; end if; return new; end \$\$ language plpgsql;
  create trigger test_history_fail before insert on \"WorkOrder\" for each row execute function test_history_fail()" >/dev/null
THAI="ฟอร์มแจ้งซ่อม พังกลางทาง$R.xlsx"
form f4.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'ผ่าน' 081-444-0002),$(row C0006 ตู้แลกเหรียญ '' 'พังแถว3' 081-444-0003),$(row C0006 ตู้แลกเหรียญ '' 'ไม่ถึง' 081-444-0004)]"
K6="k6-$R-abcdef"
F4=$(curl -s -w '\n%{http_code}' -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$DIR/f4.xlsx;filename=$THAI" -F apply=true -F only=2,3,4 -F runKey=$K6)
RF=$(RUNID $K6)
ERR=$(echo "$F4" | head -n -1 | J 'd.error')
[ "$(echo "$F4" | tail -1)" = "500" ] && [ "$(echo "$F4" | head -n -1 | J 'd.code+"|"+d.runId')" = "IMPORT_FAILED|r$RF" ] \
  && [ "$(DB "select status||'|'||(error = \$q\$$ERR\$q\$) from \"ImportRun\" where id=$RF")" = "FAILED|true" ] && [ "$(RES $RF)" = "2:NEW,3:PENDING,4:PENDING" ] \
  && pass "พังที่แถว 3 → รอบ FAILED เก็บข้อความเดียวกับที่แอดมินเห็น · แถว 2 เปิดแล้ว · แถว 3,4 ยังไม่ได้เปิด (ฐานข้อมูล)" || fail "พังกลางทาง: $(echo "$F4" | tail -1) $(DB "select status||'|'||coalesce(error,'') from \"ImportRun\" where id=${RF:-0}") · $(RES ${RF:-0})"
D=$(GET $A "import-history/runs/r$RF")
echo "$D" | J 'd.status==="partial"&&d.banner.tone==="warn"&&/ตอนเปิดแถว 3/.test(d.banner.text)&&/อีก 2 แถวยังไม่ได้เปิด/.test(d.banner.text)?"ok":"bad"' | grep -q ok \
  && pass "หน้าประวัติ: หยุดกลางทาง · บอกว่าพังแถวไหนและเหลือกี่แถว" || fail "รายละเอียดรอบที่พัง: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.banner)')"
THAI="ฟอร์มแจ้งซ่อม พังแถวแรก$R.xlsx"
form f5.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'พังแถวแรก' 081-555-0002),$(row C0006 ตู้แลกเหรียญ '' 'หลังพัง' 081-555-0003)]"
K7="k7-$R-abcdef"
IMP f5.xlsx -F apply=true -F only=2,3 -F runKey=$K7 >/dev/null
R7=$(RUNID $K7)
D=$(GET $A "import-history/runs/r$R7")
[ "$(echo "$D" | J '[d.status,d.banner.title,d.tiles[0].label,d.tiles[0].n,d.tiles[1].label,d.tiles[1].n].join("|")')" = "failed|นำเข้าไม่สำเร็จ — ไม่มีใบไหนเปิด|ตอนดูตัวอย่าง: จะเปิดใหม่|2|เปิดได้จริง|0" ] \
  && [ "$(DB "select status from \"ImportRun\" where id=$R7")" = "FAILED" ] && echo "$D" | J '/ฐานข้อมูลไม่รับข้อมูล|เซิร์ฟเวอร์ทำรายการไม่สำเร็จ/.test(d.banner.text)?"ok":"bad"' | grep -q ok \
  && pass "พังตั้งแต่แถวแรก → ไม่สำเร็จ · ตอนดูตัวอย่างจะเปิด 2 · เปิดได้จริง 0 · เหตุผลภาษาไทย" || fail "พังแถวแรก: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.banner)+" "+JSON.stringify(d.tiles)')"
_po_psql 'drop trigger if exists test_history_fail on "WorkOrder"; drop function if exists test_history_fail()' >/dev/null

echo
echo "═══ 4. แอปรุ่นก่อน (ไม่ส่ง runKey)"
THAI="ฟอร์มแจ้งซ่อม แอปรุ่นก่อน$R.xlsx"
form f6.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'เก่า ก' 081-666-0002),$(row C0006 ตู้แลกเหรียญ '' 'เก่า ข' 081-666-0003)]"
IMP f6.xlsx -F apply=true >/dev/null
IMP f6.xlsx -F apply=true >/dev/null
[ "$(DB "select string_agg(status||':'||(select string_agg(result, '' order by line) from \"ImportRunRow\" r where r.\"runId\"=u.id), ',' order by id) from \"ImportRun\" u where id > $IH0 and \"fileName\"='$THAI'")" = "DONE:NEWNEW,DONE:IMPORTEDIMPORTED" ] \
  && pass "ส่งทั้งไฟล์ในคำขอเดียว (แอปรุ่นแรก) = รอบละคำขอ · นำเข้าไฟล์เดิมซ้ำ = รอบใหม่ที่แถวเป็นนำเข้าแล้ว" || fail "แอปรุ่นแรก: $(DB "select string_agg(id||':'||status, ',') from \"ImportRun\" where id > $IH0 and \"fileName\"='$THAI'")"
THAI="ฟอร์มแจ้งซ่อม ทีละชุดไม่มีรหัส$R.xlsx"
form f7.xlsx "[$(row C0006 ตู้แลกเหรียญ '' 'ชุดเก่า ก' 081-777-0002),$(row C0006 ตู้แลกเหรียญ '' 'ชุดเก่า ข' 081-777-0003),$(row C0006 ตู้แลกเหรียญ '' 'ชุดเก่า ค' 081-777-0004)]"
IMP f7.xlsx -F apply=true -F only=2 >/dev/null
IMP f7.xlsx -F apply=true -F only=3,4 >/dev/null
[ "$(DB "select count(*)||'|'||max(status) from \"ImportRun\" where id > $IH0 and \"fileName\"='$THAI'")" = "1|DONE" ] \
  && [ "$(DB "select string_agg(r.result, '' order by r.line) from \"ImportRunRow\" r join \"ImportRun\" u on u.id=r.\"runId\" where u.id > $IH0 and u.\"fileName\"='$THAI'")" = "NEWNEWNEW" ] \
  && pass "ส่งทีละชุดแต่ไม่มี runKey (หน้าเว็บที่เปิดค้างตอน deploy) — ชุดของไฟล์เดียวกันรวมเป็นรอบเดียว" || fail "ทีละชุดไม่มีรหัส: $(DB "select string_agg(id||':'||status, ',') from \"ImportRun\" where id > $IH0 and \"fileName\"='$THAI'")"

echo
echo "═══ 5. ชนิดอื่น"
# ── ทะเบียนสาขา ──
mkx() { NODE_PATH=backend/node_modules node -e 'const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("S"); JSON.parse(process.argv[2]).forEach(r=>ws.addRow(r)); wb.xlsx.writeFile(process.argv[1]);' "$DIR/$1" "$2"; }
mkx br1.xlsx "[[\"code\",\"ชื่อสาขา\",\"ผจก.ภาค\",\"ผู้ดูแล CM\"],[\"ZIH${R}A\",\"สาขาประวัติทดสอบ ก\",\"ใต้\",\"กรุงเทพ\"],[\"ZIH${R}B\",\"สาขาประวัติทดสอบ ข\",\"ใต้\",\"กรุงเทพ\"]]"
mkx br2.xlsx "[[\"code\",\"ชื่อสาขา\",\"ผจก.ภาค\",\"ผู้ดูแล CM\"],[\"ZIH${R}A\",\"สาขาประวัติทดสอบ ก\",\"ใต้\",\"กระบี่\"],[\"ZIH${R}B\",\"สาขาประวัติทดสอบ ข\",\"ใต้\",\"กรุงเทพ\"]]"
BR() { curl -s -X POST localhost:4000/api/branches/import -H "$(H $A)" -F "file=@$DIR/$1;filename=ทะเบียนสาขา $1" ${2:+-F mode=commit}; }
N0=$(DB 'select count(*) from "ImportRun"')
BR br1.xlsx >/dev/null
[ "$(DB 'select count(*) from "ImportRun"')" = "$N0" ] && pass "ตรวจไฟล์สาขา (ไม่กดบันทึก) ไม่เกิดรอบ" || fail "ตรวจไฟล์สาขาแล้วเกิดรอบ"
BR br1.xlsx 1 | J '"history" in d.plan?"leak":"ok"' | grep -q ok || fail "คำตอบนำเข้าสาขาส่งรายการประวัติเต็มกลับไป"
BR br2.xlsx 1 >/dev/null
GOT=$(DB "select string_agg(u.kind||':'||u.status||':'||(u.summary->>'new')||'/'||(u.summary->>'changed')||'/'||(u.summary->>'same')||':'||coalesce((select string_agg(r.line||'='||r.result||'='||r.code||'='||coalesce(r.detail,''), ';' order by r.line) from \"ImportRunRow\" r where r.\"runId\"=u.id),''), ' # ' order by u.id) from \"ImportRun\" u where u.id > $IH0 and u.kind='BRANCH'")
[ "$GOT" = "BRANCH:DONE:2/0/0:2=new=ZIH${R}A=ใต้ / กรุงเทพ;3=new=ZIH${R}B=ใต้ / กรุงเทพ # BRANCH:DONE:0/1/1:2=changed=ZIH${R}A=ใต้ / กรุงเทพ → ใต้ / กระบี่" ] \
  && pass "ทะเบียนสาขา: รอบแรกสาขาใหม่ 2 (เลขแถว) · รอบสองทีมเปลี่ยน 1 (ก่อน → หลัง) เก็บเฉพาะแถวที่เปลี่ยน (ฐานข้อมูล)" || fail "ทะเบียนสาขา: $GOT"
# ── สาขาที่ยกเลิก ──
mkx cx.xlsx "[[\"code\"],[\"ZIH${R}B\"],[\"ZZNOPE$R\"]]"
curl -s -X POST localhost:4000/api/branches/cancelled-import -H "$(H $A)" -F "file=@$DIR/cx.xlsx;filename=สาขายกเลิก.xlsx" -F mode=commit >/dev/null
GOT=$(DB "select u.status||':'||(u.summary->>'closed')||'/'||(u.summary->>'notFound')||':'||(select string_agg(r.result||'='||r.code, ';' order by r.result) from \"ImportRunRow\" r where r.\"runId\"=u.id) from \"ImportRun\" u where u.id > $IH0 and u.kind='BRANCH_CANCELLED'")
[ "$GOT" = "DONE:1/1:closed=ZIH${R}B;notFound=ZZNOPE$R" ] && [ "$(DB "select \"cancelledAt\" is not null from \"Branch\" where code='ZIH${R}B'")" = "t" ] \
  && pass "สาขาที่ยกเลิก: ปิดสาขา 1 · รหัสที่ไม่มีในระบบ 1 (ฐานข้อมูล)" || fail "สาขาที่ยกเลิก: $GOT"
# ── รถ (ไฟล์สมมุติแบบ vehicle-test.sh — มีเลข Fleet Card / Easy Pass) ──
curl -s -X POST localhost:4000/api/vehicles -H "$(H $A)" -H 'Content-Type: application/json' -d '{"plateNumber":"9ทส-1003","brand":"Toyota","currentMileage":12000}' >/dev/null
curl -s -X POST localhost:4000/api/vehicles/import -H "$(H $A)" -F "file=@tests/fleet-fixture.xlsx;filename=รถช่าง Service.xlsx" -F apply=true >/dev/null
VR=$(DB "select id from \"ImportRun\" where id > $IH0 and kind='VEHICLE'")
[ "$(DB "select status||':'||(summary->>'created')||'/'||(summary->>'updated')||'/'||(summary->>'skipped')||':'||(select string_agg(result, ',' order by result) from \"ImportRunRow\" where \"runId\"=$VR) from \"ImportRun\" where id=$VR")" = "DONE:2/1/2:created,created,skipped,skipped,updated" ] \
  && pass "รถ: เพิ่ม 2 · แก้ 1 · ข้าม 2 (เหตุผล) (ฐานข้อมูล)" || fail "รถ: $(DB "select summary from \"ImportRun\" where id=${VR:-0}")"
[ "$(DB "select count(*) from \"ImportRunRow\" where \"runId\"=$VR and concat_ws('|',code,name,machine,detail,note,ref) ~ '0004 0000|3700004444|4444|1111'")" = "0" ] \
  && DB "select detail from \"ImportRunRow\" where \"runId\"=$VR and result='updated'" | grep -q "บัตรเติมน้ำมัน\|Easy Pass\|ยี่ห้อ" \
  && pass "รถ: ประวัติไม่มีเลข Fleet Card / Easy Pass — บอกแค่ชื่อช่องที่เปลี่ยน" || fail "เลขบัตรหลุดในประวัติรถ: $(DB "select string_agg(concat_ws('|',code,detail,note),' / ') from \"ImportRunRow\" where \"runId\"=$VR")"
# ── รายชื่อช่าง/หัวหน้าภาค (roster-fixture.ods ชื่อสมมุติ) ──
DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role,team) values ('990013','ชื่อเก่า','x','EMPLOYEE','กรุงเทพ')" >/dev/null
P=$(curl -s -X POST localhost:4000/api/user-import/preview -H "$(H $A)" -F "file=@tests/roster-fixture.ods")
PW="zzประวัติ$R"
BODY=$(echo "$P" | node -e '
  const d=JSON.parse(require("fs").readFileSync(0));
  const teamMap=Object.fromEntries(d.areas.map(a=>[a.area,a.suggestion]));
  console.log(JSON.stringify({password:process.argv[1],fileName:d.fileName,teamMap,people:d.people.map(({code,fullName,nick,role,area,supervisorCode})=>({code,fullName,nick,role,area,supervisorCode}))}));' "$PW")
CR=$(curl -s -X POST localhost:4000/api/user-import/commit -H "$(H $A)" -H 'Content-Type: application/json' -d "$BODY")
UR=$(DB "select id from \"ImportRun\" where id > $IH0 and kind='USER_ROSTER'")
[ "$(DB "select status||':'||\"fileName\"||':'||(summary->>'created')||':'||(select count(*) from \"ImportRunRow\" where \"runId\"=$UR and result='new') from \"ImportRun\" where id=$UR")" = "DONE:roster-fixture.ods:$(echo "$CR" | J 'd.created'):$(echo "$CR" | J 'd.created')" ] \
  && DB "select detail from \"ImportRunRow\" where \"runId\"=$UR and code='990013'" | grep -q "ชื่อ ชื่อเก่า →" \
  && pass "รายชื่อ: คนใหม่ $(echo "$CR" | J 'd.created') คนตรงกับที่บันทึก · คนเดิมบอกว่าเปลี่ยนอะไร (ชื่อ เดิม → ใหม่) · ชื่อไฟล์ที่ดูตัวอย่าง (ฐานข้อมูล)" || fail "รายชื่อ: $CR · $(DB "select summary from \"ImportRun\" where id=${UR:-0}")"
[ "$(DB "select count(*) from \"ImportRun\" u left join \"ImportRunRow\" r on r.\"runId\"=u.id where u.id > $IH0 and (concat_ws('|',r.code,r.name,r.detail,r.note,u.summary::text,u.error,u.\"fileName\") like '%$PW%')")" = "0" ] \
  && pass "รายชื่อ: ไม่มีรหัสผ่านตั้งต้นในประวัติ (ฐานข้อมูล)" || fail "รหัสผ่านตั้งต้นหลุดในประวัติ"
# ── Maid (COCO) ผ่านปุ่มนำเข้า Area Team — รหัสสุ่มต่อคน ออกในไฟล์ Excel ครั้งเดียว · ไฟล์มีเบอร์โทร ──
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("Maid");
  ws.addRow(["ลำดับ","Area (หัวหน้า)","Name-Surname (Thai)","Nickname","Tel","ERP","Project Name","Position","Remark","User"]);
  ws.addRow([1,"นายหัวหน้า ทดสอบ","นางสาวประวัติ หนึ่ง","หนึ่ง","089-555-1234","C0001","สาขาทดสอบ","Maid (COCO)","","zz.hmaid1"]);
  ws.addRow([2,"นายหัวหน้า ทดสอบ","นางสาวประวัติ สอง","สอง","089-555-5678","C9998","สาขาทดสอบ","Maid (COCO)","","zz.hmaid2"]);
  wb.xlsx.writeFile(process.argv[1]);' "$DIR/maid.xlsx"
MR=$(curl -s -X POST localhost:4000/api/user-import/area-team -H "$(H $A)" -F "file=@$DIR/maid.xlsx;filename=รายชื่อ Maid COCO.xlsx" -F apply=1)
curl -s "localhost:4000$(echo "$MR" | J 'd.credentials.path')" -o "$DIR/cred.xlsx"
PWS=$(NODE_PATH=backend/node_modules node -e 'const E=require("exceljs"); const wb=new E.Workbook(); wb.xlsx.readFile(process.argv[1]).then(()=>{ const out=[]; wb.worksheets[0].eachRow((r,i)=>{ if(i>1&&r.getCell(2).value) out.push(r.getCell(2).value); }); console.log(out.join("|")); });' "$DIR/cred.xlsx")
AR=$(DB "select id from \"ImportRun\" where id > $IH0 and kind='USER_AREA'")
[ "$(DB "select status||':'||\"fileName\"||':'||(summary->>'created')||':'||(select string_agg(result||'='||code, ';' order by result, code) from \"ImportRunRow\" where \"runId\"=$AR) from \"ImportRun\" where id=$AR")" = "DONE:รายชื่อ Maid COCO.xlsx:2:badBranch=zz.hmaid2;new=zz.hmaid1;new=zz.hmaid2" ] \
  && pass "Maid: บัญชีใหม่ 2 · รหัสสาขา C9998 ที่ไม่มีในระบบขึ้นเป็นแถวปัญหา (ฐานข้อมูล)" || fail "Maid: $MR · $(DB "select summary from \"ImportRun\" where id=${AR:-0}")"
[ -n "$PWS" ] && [ "$(DB "select count(*) from \"ImportRunRow\" r join \"ImportRun\" u on u.id=r.\"runId\" where u.id=$AR and concat_ws('|',r.code,r.name,r.detail,r.note,u.summary::text) ~ '$PWS|089-555'")" = "0" ] \
  && pass "Maid: ไม่มีรหัสผ่านที่สุ่มให้ (ตรวจกับไฟล์รหัสจริง) และเบอร์โทรในประวัติ (ฐานข้อมูล)" || fail "รหัสผ่าน/เบอร์หลุดในประวัติ Maid (รหัส: ${PWS:-ไม่ได้ไฟล์รหัส})"
# ── รายงานเครื่อง: รอบที่บันทึกไม่สำเร็จ (MachineImport เก็บเฉพาะรอบสำเร็จ) ──
mkx bad.xlsx '[["ไม่ใช่","ไฟล์รายงานเครื่อง"],["1","2"]]'
N0=$(DB 'select count(*) from "ImportRun"')
curl -s -X POST localhost:4000/api/machines/import -H "$(H $A)" -F "file=@$DIR/bad.xlsx;filename=machine_export_ผิดไฟล์.xlsx" >/dev/null
[ "$(DB 'select count(*) from "ImportRun"')" = "$N0" ] || fail "ตรวจไฟล์รายงานเครื่อง (ไม่กดยืนยัน) แล้วเกิดรอบ"
MC=$(curl -s -w '%{http_code}' -X POST localhost:4000/api/machines/import -H "$(H $A)" -F "file=@$DIR/bad.xlsx;filename=machine_export_ผิดไฟล์.xlsx" -F mode=commit)
MF=$(DB "select id from \"ImportRun\" where id > $IH0 and kind='MACHINE'")
[ "${MC: -3}" = "400" ] && [ "$(DB "select status||':'||\"fileName\"||':'||(error like '%crm_code%' or error like '%คอลัมน์%') from \"ImportRun\" where id=$MF")" = "FAILED:machine_export_ผิดไฟล์.xlsx:true" ] \
  && [ "$(GET $A 'import-history?kind=machine&days=1' | J 'const r=d.runs.find(x=>x.id==="r'$MF'"); r.status+"|"+r.group')" = "failed|machine" ] \
  && pass "รายงานเครื่องที่ยืนยันแล้วล้ม → รอบไม่สำเร็จพร้อมเหตุผล อยู่ในชิปรายงานเครื่อง" || fail "รายงานเครื่องล้ม: $MC · $(DB "select status||':'||coalesce(error,'') from \"ImportRun\" where id=${MF:-0}")"
# ── ประวัติเดิม: รายงานเครื่อง (ชื่อไฟล์ไทยที่รุ่นก่อนเก็บเพี้ยนเป็น latin1) และอะไหล่ — ขึ้นย้อนหลังทันที ──
MANGLED=$(node -e 'process.stdout.write(Buffer.from("รายงานเครื่อง ทดสอบ'$R'.xlsx","utf8").toString("latin1"))')
MI=$(DB "insert into \"MachineImport\" (\"uploadedById\",\"fileName\",\"snapshotAt\",\"rowsInFile\",\"duplicateRows\",\"branchesTouched\",\"machinesOff\",\"branchesSignalLost\",opened,closed,\"createdAt\")
  values ($AID, \$m\$$MANGLED\$m\$, timezone('utc',now()) - interval '200 days', 4812, 3, 900, 37, 4, 14, 9, timezone('utc',now()) - interval '200 days') returning id" | head -1)
L30=$(GET $A 'import-history?kind=machine&days=30'); LALL=$(GET $A 'import-history?kind=machine&days=0')
[ "$(echo "$L30" | J 'd.runs.some(r=>r.id==="m'$MI'")')" = "false" ] && [ "$(echo "$LALL" | J 'const r=d.runs.find(x=>x.id==="m'$MI'"); [r.fileName,r.short,r.status,r.byName].join("|")')" = "รายงานเครื่อง ทดสอบ$R.xlsx|เปิดเคส 14 · ปิดเคส 9|ok|$(DB "select name from \"User\" where id=$AID")" ] \
  && [ "$(GET $A "import-history/runs/m$MI" | J 'd.tiles.map(t=>t.label+"="+t.n).join(",")+"|"+d.actions.machinePage')" = "แถวในไฟล์=4812,เครื่องดับ=37,สาขาสัญญาณหาย=4,เปิดเคสใหม่=14,ปิดเคส (หายจากไฟล์)=9,แถวซ้ำที่ตัดออก=3|true" ] \
  && pass "รายงานเครื่องเดิม (MachineImport 200 วันก่อน): อยู่ใน 'ทั้งหมด' ไม่อยู่ใน 30 วัน · ชื่อไฟล์ไทยที่เก็บเพี้ยนอ่านออก · ยอดเปิด/ปิดเคส" || fail "รายงานเครื่องเดิม: $(echo "$LALL" | J 'JSON.stringify(d.runs.find(x=>x.id==="m'$MI'"))') · $(GET $A "import-history/runs/m$MI" | head -c 300)"
DETAILS='{"items":[{"line":12,"partCode":"ZIH-1","name":"สายพาน","brand":"Haier","partNo":"","action":"UPDATE","diffs":[{"field":"name","label":"ชื่อ","from":"สายพานเก่า","to":"สายพาน"}],"image":null},{"line":57,"partCode":"ZIH-2","name":"ซีลประตู","brand":"Haier","partNo":"","action":"CREATE","diffs":[],"image":"NEW"}],"problems":[{"line":88,"partCode":null,"name":"มอเตอร์","note":"ไม่มีรหัสสินค้า"}],"notInFile":[],"codes":["ZIH-1","ZIH-2"]}'
DB "insert into \"SparePartImport\" (\"batchId\",\"byUserId\",\"byName\",\"fileName\",\"brandFile\",summary,details,\"createdAt\") values
  ('zihp${R}x', $AID, 'แอดมินอะไหล่', 'Haier.xlsx', 'Haier', '{\"rows\":3,\"created\":1,\"updated\":1,\"images\":1,\"same\":0,\"skipped\":1}', \$d\$$DETAILS\$d\$, timezone('utc',now()) - interval '40 days'),
  ('zihp${R}x', $AID, 'แอดมินอะไหล่', 'Other.xlsx', 'Other', '{\"rows\":5,\"created\":2,\"updated\":0,\"images\":0,\"same\":3,\"skipped\":0,\"incomplete\":true}', '{\"items\":[],\"problems\":[],\"notInFile\":[]}', timezone('utc',now()) - interval '40 days' + interval '5 seconds')" >/dev/null
PL=$(GET $A 'import-history?kind=parts&days=90' | J 'const r=d.runs.find(x=>x.id==="pzihp'$R'x"); [r.fileName,r.status,r.short,r.byName].join("|")')
PD=$(GET $A "import-history/runs/pzihp${R}x")
[ "$PL" = "Haier.xlsx + อีก 1 ไฟล์|partial|เพิ่ม 3 · แก้ 1 · รูป 1|แอดมินอะไหล่" ] \
  && [ "$(echo "$PD" | J '[d.tiles.map(t=>t.key+"="+t.n).join(","),d.rows.map(r=>r.line+":"+r.result).join(","),d.actions.partsBatch,d.banner.tone].join("|")')" = "created=3,updated=1,images=1,same=3,skipped=1|88:skipped,12:updated,57:created|zihp${R}x|warn" ] \
  && pass "อะไหล่เดิม (SparePartImport สองไฟล์ · ไฟล์หนึ่งอัปเดตไม่ครบ): รวมเป็นรอบเดียว · หยุดกลางทาง · แถวจากรายงานเดิม · ปุ่มเปิดรายงานอัปเดตอะไหล่" || fail "อะไหล่เดิม: $PL · $(echo "$PD" | head -c 400)"
CN=$(GET $A 'import-history?days=0')
echo "$CN" | J 'const c=d.counts; c.all===d.groups.reduce((n,g)=>n+c[g.id],0)&&c.repair>=10&&c.branch>=3&&c.users>=2&&c.vehicle>=1&&c.machine>=2&&c.parts>=1&&d.runs.every((r,i,a)=>i===0||a[i-1].startedAt>=r.startedAt)?"ok":"bad"' | grep -q ok \
  && pass "รายการรวมทุกชนิดเรียงตามเวลา · ตัวเลขบนชิปนับครบทุกชนิด" || fail "รายการรวม: $(echo "$CN" | J 'JSON.stringify(d.counts)')"

echo
echo "═══ 6. สิทธิ์"
OK=1
for tok in "$S" "$T"; do
  for p in "import-history" "import-history/runs/r$RID" "import-history/runs/r$RID/excel" "import-history/runs/m$MI"; do
    [ "$(CODE $tok "$p")" = "403" ] || { OK=0; echo "  $p → $(CODE $tok "$p")"; }
  done
  [ "$(CODE $tok import-history/stop POST "{\"runKey\":\"$K4\"}")" = "403" ] || OK=0
done
[ "$OK" = "1" ] && [ "$(DB "select status from \"ImportRun\" where id=$RI")" = "RUNNING" ] \
  && pass "หัวหน้าภาค/ช่าง: 403 ทุกเส้น (รายการ · รายละเอียด · Excel · สั่งหยุด) — รอบไม่เปลี่ยน (ฐานข้อมูล)" || fail "สิทธิ์หัวหน้าภาค/ช่าง"
DB "insert into \"User\" (\"employeeCode\",name,\"passwordHash\",role) select 'ZIHPA$R','แอดมินอะไหล่ทดสอบ',\"passwordHash\",'PARTS_ADMIN' from \"User\" where id=$AID" >/dev/null
PA=$(login ZIHPA$R)
[ "$(CODE $PA "import-history?days=0")" = "200" ] && [ "$(CODE $PA "import-history/runs/r$RID")" = "200" ] && [ "$(CODE $PA import-history/stop POST "{\"runKey\":\"$K4\"}")" = "403" ] \
  && [ "$(DB "select status from \"ImportRun\" where id=$RI")" = "RUNNING" ] \
  && pass "Admin Spare Part: ดูประวัติได้ (นำเข้าไฟล์อะไหล่ได้ = ดูได้) แต่สั่งหยุดรอบใบแจ้งซ่อมไม่ได้" || fail "Admin Spare Part: $(CODE $PA "import-history?days=0") $(CODE $PA import-history/stop POST "{\"runKey\":\"$K4\"}")"
[ "$(CODE $A "import-history/runs/x1")" = "404" ] && [ "$(GET $A "import-history/runs/r999999999" | J 'd.notFound')" = "true" ] \
  && pass "รอบที่ไม่มี: 404 / notFound (ไม่ใช่ 500)" || fail "รอบที่ไม่มี"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
