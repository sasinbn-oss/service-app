#!/bin/bash
# ทดสอบ: นำเข้ารายงานเครื่อง POST /api/machines/import ผ่านเส้นทาง HTTP จริง — ชื่อไฟล์ภาษาไทย (พ.ย. 69)
#   multer อ่านชื่อไฟล์ในคำขอเป็น latin1 ตามค่าตั้งต้น ไฟล์ชื่อไทยเคยถูกเก็บใน MachineImport.fileName เป็น "à¸£à¸²à¸¢…"
#   และไปโผล่ในคำเตือน "ไฟล์นี้เก่ากว่ารอบล่าสุด (…)" ที่แอดมินอ่านก่อนกดยืนยัน
#   ก ตรวจสอบ (ไม่บันทึก): ชื่อไทยที่มีวันเวลา → วันที่ของข้อมูลมาจากชื่อไฟล์ · ชื่อไทยไม่มีวันที่ ("5 พ.ย.") → เวลาที่อัปโหลด
#       (ตัวอ่านวันที่ในชื่อดูแค่เลขอารบิกกับ _ - ซึ่งไม่เปลี่ยนตอนถอดผิด ผลจึงต้องเท่าเดิม) · ไม่เกิดแถว MachineImport
#   ข บันทึก: ชื่อไทยแบบที่เบราว์เซอร์ส่ง (filename="…" เป็นไบต์ UTF-8) ตรงตัวอักษรใน MachineImport.fileName — ดูที่ฐาน
#       · snapshotAt ในฐานมาจากชื่อไฟล์
#   ค ไฟล์ถัดไปที่เก่ากว่า: คำเตือนบอกชื่อรอบล่าสุดเป็นภาษาไทยที่อ่านออก
#   ง ชื่อแบบ filename*=UTF-8'' (RFC 5987) busboy ถอดเองอยู่แล้ว — ไม่ถูกแปลงซ้ำจนเพี้ยน (ดูที่ฐาน)
#
# ⚠ โหมดบันทึกปิด "ทุกเคสที่เปิดอยู่แต่ไม่อยู่ในไฟล์" ทั้งฐาน (หายจากไฟล์ = ซ่อมเสร็จ) — ชุดอื่นจึงเรียก writeReportBranches ตรง
#   แต่ชื่อไฟล์ถูกถอดที่ multer ชุดนี้ต้องผ่าน HTTP จริง จึงใช้วันที่ในชื่อไฟล์เป็นปี 2099 (ค่าที่ข้อมูลจริงไม่มีวันมี)
#   ทุกเคสที่ถูกปิดด้วยเวลานั้นคือเคสที่ชุดนี้ปิดเอง → trap เปิดคืนทั้งหมด · ลบแถว MachineImport ของชุดนี้ (ScoreSnapshot หายตาม)
#   · ลบสาขา ZZM… (เครื่อง/เคสหายตาม) — รอบที่ตายกลางทางก่อน trap ทำงาน รอบถัดไปเก็บกวาดให้ตอนเริ่มด้วยเงื่อนไขเดียวกัน
#   · มีเคสพยาน (ZZM900 นอกไฟล์) ให้เห็นว่าบันทึกจริงปิดเคสอื่นจริง และ trap เปิดคืนจริง — ฐานเทสต์ใหม่ไม่มีเคสเปิดสักเคส
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
IMP() { curl -s -X POST localhost:4000/api/machines/import -H "$(H $A)" "$@"; }
A=$(login A001)
TMP=$(mktemp -d)

# 08:30 เวลาไทยในชื่อไฟล์ = 01:30 UTC ในฐาน
SNAP="2099-11-05 01:30:00"
THAI="รายงานเครื่อง_20991105_083000.xlsx"
IMPORT_BEFORE=$(DB "select coalesce(max(id),0) from \"MachineImport\"")
# closeReason ของเคสที่เปิดอยู่ว่างเสมอ (ไม่มีทางไหนเปิดเคสที่ปิดแล้วคืน) จึงคืนเป็นว่างได้ — เช็คไว้ก่อนบันทึกด้านล่าง
reopen() { DB "update \"Outage\" set \"endedAt\"=null, \"closeReason\"=null where \"endedAt\"='$SNAP'" >/dev/null; }
cleanup() {
  reopen
  DB "delete from \"MachineImport\" where id>$IMPORT_BEFORE or \"snapshotAt\"='$SNAP'" >/dev/null
  DB "delete from \"Branch\" where upper(trim(code)) like 'ZZM%'" >/dev/null
  rm -rf "$TMP"
}
cleanup
mkdir -p "$TMP"
trap cleanup EXIT

# เคสพยาน: เครื่องดับที่เปิดอยู่ในสาขาที่ไม่อยู่ในไฟล์ — ฐานเทสต์ใหม่ไม่มีเคสเปิดเลย ถ้าไม่มีพยาน
# ข้อ "เปิดคืนครบ" ท้ายไฟล์จะผ่านโดยไม่ได้ทดสอบอะไร
WB=$(DB "insert into \"Branch\"(code,name) values ('ZZM900','ร้านพยานเคสค้าง') returning id")
WM=$(DB "insert into \"Machine\"(\"branchId\",code,type,\"updatedAt\") values ($WB,'W9','WASHER',now()) returning id")
WO=$(DB "insert into \"Outage\"(kind,\"branchId\",\"machineId\",\"startedAt\",\"lastSeenAt\") values ('MACHINE_OFF',$WB,$WM,now()-interval '2 days',now()-interval '1 day') returning id")

# ไฟล์แบบรายงานจริง ไม่มีคอลัมน์ recorded_at (ไม่งั้นวันที่มาจากคอลัมน์ ไม่ได้ทดสอบชื่อไฟล์) — เครื่องดับ 1 เครื่องในสาขาของชุดนี้
X="$TMP/report.xlsx"
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("Sheet1");
  ws.addRow(["crm_code","name","num","state","offline","machine_type"]);
  ws.addRow(["ZZM001","ร้านทดสอบชื่อไฟล์","W1","0","false","WASHER"]);
  wb.xlsx.writeFile(process.argv[1]);' "$X"

OPEN_REAL=$(DB "select count(*) from \"Outage\" where \"endedAt\" is null")
if [ "$(DB "select count(*) from \"Outage\" where \"endedAt\" is null and \"closeReason\" is not null")" != "0" ]; then
  fail "มีเคสที่เปิดอยู่แต่มี closeReason — trap คืนค่าเดิมไม่ได้ ไม่บันทึกไฟล์ (ดูหัวไฟล์)"
  exit 1
fi

echo "═══ ก ตรวจสอบ (ไม่บันทึก)"
P=$(IMP -F "file=@$X;filename=$THAI")
[ "$(echo "$P" | J 'd.committed+"|"+d.plan.snapshotSource+"|"+d.plan.snapshotAt+"|"+d.plan.machinesOff')" = "false|fileName|2099-11-05T01:30:00.000Z|1" ] \
  && pass "ชื่อไทยที่มีวันเวลา: วันที่ของข้อมูลมาจากชื่อไฟล์ (08:30 ไทย = 01:30 UTC)" || fail "ตรวจสอบชื่อไทย: $P"
P=$(IMP -F "file=@$X;filename=รายงานเครื่อง 5 พ.ย.xlsx")
[ "$(echo "$P" | J 'd.plan.snapshotSource')" = "uploadTime" ] \
  && pass "ชื่อไทยไม่มีวันที่ (\"5 พ.ย.\"): ใช้เวลาที่อัปโหลด ไม่เดาวันจากเลขเดี่ยว" || fail "ชื่อไม่มีวันที่: $P"
[ "$(DB "select count(*) from \"MachineImport\" where id>$IMPORT_BEFORE")" = "0" ] \
  && pass "โหมดตรวจสอบไม่เขียนแถว MachineImport (ฐานข้อมูล)" || fail "โหมดตรวจสอบเขียนลงฐาน"

echo "═══ ข บันทึก — ชื่อไทยแบบที่เบราว์เซอร์ส่ง"
C=$(IMP -F "file=@$X;filename=$THAI" -F "mode=commit")
I1=$(DB "select coalesce(max(id),0) from \"MachineImport\" where id>$IMPORT_BEFORE")
GOT=$(DB "select \"fileName\" from \"MachineImport\" where id=$I1")
[ "$(echo "$C" | J 'd.committed')" = "true" ] && [ "$I1" != "0" ] && [ "$GOT" = "$THAI" ] \
  && pass "ชื่อไฟล์ไทยเก็บตรงตัวอักษร (ฐานข้อมูล: MachineImport.fileName = \"$THAI\")" \
  || fail "ชื่อไฟล์ไทยเพี้ยน: [$GOT] · $C"
[ "$(DB "select \"snapshotAt\"='$SNAP' and \"rowsInFile\"=1 and \"machinesOff\"=1 from \"MachineImport\" where id=$I1")" = "t" ] \
  && [ "$(DB "select count(*) from \"Outage\" o join \"Branch\" b on b.id=o.\"branchId\" where b.code='ZZM001' and o.\"endedAt\" is null and o.\"startedAt\"='$SNAP'")" = "1" ] \
  && pass "snapshotAt ในฐานมาจากชื่อไฟล์ · เปิดเคสเครื่องดับ ZZM001/W1 ด้วยเวลานั้น" \
  || fail "รอบนำเข้า: $(DB "select \"snapshotAt\", \"rowsInFile\", \"machinesOff\" from \"MachineImport\" where id=$I1")"
# ยืนยันว่าบันทึกจริงปิดเคสนอกไฟล์ด้วยเวลารอบนี้ — ถ้าไม่ปิด trap ก็ไม่มีอะไรให้คืน และข้อท้ายไฟล์ไม่ได้พิสูจน์อะไร
[ "$(DB "select \"endedAt\"='$SNAP' and \"closeReason\"='REPAIRED' from \"Outage\" where id=$WO")" = "t" ] \
  && pass "เคสพยานนอกไฟล์ถูกปิดด้วยเวลาของรอบทดสอบ (หายจากไฟล์ = ซ่อมเสร็จ)" \
  || fail "เคสพยาน: $(DB "select \"endedAt\", \"closeReason\" from \"Outage\" where id=$WO")"

echo "═══ ค คำเตือนไฟล์เก่ากว่ารอบล่าสุด"
P=$(IMP -F "file=@$X;filename=machine_offline_20991104_083000.xlsx")
[ "$(echo "$P" | J "d.plan.warnings.some(w=>w.startsWith('ไฟล์นี้เก่ากว่ารอบล่าสุด') && w.includes('($THAI)'))")" = "true" ] \
  && pass "คำเตือนบอกชื่อรอบล่าสุดเป็นภาษาไทยที่อ่านออก" || fail "คำเตือน: $(echo "$P" | J 'JSON.stringify(d.plan&&d.plan.warnings)')"

echo "═══ ง ชื่อแบบ filename*=UTF-8''"
# ถ้าวันหนึ่งเปลี่ยนไปแปลงซ้ำด้วย Buffer.from(ชื่อ, "latin1") แบบเส้นทางนำเข้า Excel อื่น ชื่อแบบนี้จะเพี้ยนแทน
STAR="เครื่องดับ_20991105_083000.xlsx"
B=thai-name-boundary
{ printf -- "--$B\r\nContent-Disposition: form-data; name=\"mode\"\r\n\r\ncommit\r\n"
  printf -- "--$B\r\nContent-Disposition: form-data; name=\"file\"; filename*=UTF-8''%s\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n" \
    "$(node -pe 'encodeURIComponent(process.argv[1])' "$STAR")"
  cat "$X"; printf -- "\r\n--$B--\r\n"; } > "$TMP/rfc5987.body"
C=$(IMP -H "Content-Type: multipart/form-data; boundary=$B" --data-binary "@$TMP/rfc5987.body")
I2=$(DB "select coalesce(max(id),0) from \"MachineImport\" where id>$I1")
GOT=$(DB "select \"fileName\" from \"MachineImport\" where id=$I2")
[ "$I2" != "0" ] && [ "$GOT" = "$STAR" ] \
  && pass "ชื่อแบบ filename*=UTF-8'' ได้ชื่อไทยเดิม ไม่ถูกแปลงซ้ำ (ฐานข้อมูล)" || fail "filename*: [$GOT] · $C"

# เคสที่ถูกปิดไประหว่างทดสอบต้องกลับมาเปิดครบ — ถ้า trap คืนไม่ครบ ชุดอื่นที่อ่านกระดานจะพังด้วยเหตุที่ไม่เกี่ยว
# (+1 = เคสของ ZZM001 ที่ไฟล์ของชุดนี้เปิดเอง ยังอยู่จนลบสาขา)
reopen
[ "$(DB "select count(*) from \"Outage\" where \"endedAt\" is null")" = "$((OPEN_REAL + 1))" ] \
  && [ "$(DB "select \"endedAt\" is null and \"closeReason\" is null from \"Outage\" where id=$WO")" = "t" ] \
  && pass "เปิดคืน: เคสที่เปิดอยู่ก่อนทดสอบกลับมาเปิดครบ $OPEN_REAL เคส (รวมเคสพยาน) · closeReason ว่างเหมือนเดิม" \
  || fail "เปิดคืน: เคสเปิด $(DB "select count(*) from \"Outage\" where \"endedAt\" is null") (ควรเป็น $((OPEN_REAL + 1)))"
cleanup
mkdir -p "$TMP"
[ "$(DB "select count(*) from \"MachineImport\" where id>$IMPORT_BEFORE")" = "0" ] \
  && [ "$(DB "select count(*) from \"Branch\" where code like 'ZZM%'")" = "0" ] \
  && pass "เก็บกวาด: ไม่เหลือรอบนำเข้าและสาขาของชุดนี้ (ฐานข้อมูล)" \
  || fail "เก็บกวาด: รอบนำเข้า $(DB "select count(*) from \"MachineImport\" where id>$IMPORT_BEFORE") · สาขา $(DB "select count(*) from \"Branch\" where code like 'ZZM%'")"
