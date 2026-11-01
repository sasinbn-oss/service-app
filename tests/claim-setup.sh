# ชุดเตรียมของเทสต์เคลมอะไหล่เก่า — ไฟล์นี้ไว้ source จากสคริปต์เทสต์ ไม่ได้รันเดี่ยว ๆ และไม่อยู่ใน run-all.sh
#
#   SP="$(cd "$(dirname "$0")" && pwd)"
#   . "$SP/claim-setup.sh"
#   claim_order 2        # เปิดใบใหม่ (อะไหล่ 1 หรือ 2 ชิ้น) เดินถึงขั้นเข้างาน แนบก่อน/หลังซ่อม ป้ายรุ่น ใบเหลือง (ช่างแนบ)
#   claim_files $PID     # ช่างแนบหลักฐานเคลมครบสี่อย่างของอะไหล่ชิ้นนั้น
#   CLOSE "[$(claim_json $PID) , $(claim_json $PID2)]"   # ช่างปิดงานพร้อมเคลม
#
# ทำไมแยกไฟล์: เทสต์เคลมหลายชุดต้องการของชุดเดียวกัน (สาขาในประกัน เครื่อง Huebsch ช่าง Admin Spare Part
# ใบที่เดินถึงขั้นเข้างานพร้อมรูปที่ปิดงานบังคับ) ถ้าแต่ละชุดคัดลอกกันไปเอง วันหนึ่งจะเพี้ยนไม่เท่ากัน
#
# สิ่งที่ได้ (ตัวแปร): A แอดมิน · S หัวหน้าภาค (S001 ย้ายมาภาคใต้ชั่วคราว) · PA Admin Spare Part · T ช่าง (TID = id)
#   SA Super Admin (เฉพาะเมื่อตั้ง CLAIM_SETUP_SUPER=1 ก่อน source) · BC/BID สาขาทดสอบ · SUF เลขสุ่มของรอบ
#   หลัง claim_order: ID ใบงาน · PID/PID2 อะไหล่ (ตัวแฝดที่ตรงยี่ห้อเครื่อง — fx_part) · PCODE/PCODE2 รหัสของสองตัวนั้น
#   PARTS = รายการอะไหล่ที่ใช้ (JSON) ที่ CLOSE ส่ง · TS = รายการ Troubleshooting ของเครื่อง (JSON)
# ตัวช่วย: J H pass fail DB login POST GET CODE day UPAS UP claim_files claim_json claim_skips CLOSE
# เก็บกวาด: trap EXIT ลบใบงานทุกใบที่เปิด (IDS) สาขา เครื่อง ผู้ใช้ที่สร้าง และคืนภาคของ S001 — สคริปต์ที่ source
#   ไฟล์นี้ถ้าต้องเก็บกวาดเพิ่ม ให้ใส่ใน claim_extra_cleanup() (ถูกเรียกก่อนลบของในไฟล์นี้) ไม่ใช่ตั้ง trap ใหม่ทับ
#
# วันนัดใช้วันข้างหน้า 12 วัน (G10 ในแผนรวม): ปล่อยงาน (/dispatch) ใบที่นัดวันนี้/พรุ่งนี้จะถูกกฎเวลาปิดรับปล่อยงาน
# ปฏิเสธเมื่อฟีเจอร์นั้นมาถึง — เทสต์ที่ต้องให้งานอยู่ "วันนี้" ในงานของฉัน ให้เลื่อน scheduledAt ด้วย SQL หลังปล่อยงานแล้ว
#
# หยุดกลางทาง = FAIL เสมอ: set -e ทำให้คำสั่งที่พัง (เซิร์ฟเวอร์ตอบ HTML 502 แล้ว J อ่าน JSON ไม่ออก · curl ต่อไม่ติด ·
# ค่าที่เทสต์อยู่หายไปจนอ่าน .actorLabel ของ undefined) จบสคริปต์ทันทีโดยไม่มีบรรทัด FAIL — run-all.sh นับแค่บรรทัด
# PASS/FAIL ไม่ดู exit code ชุดที่ตายหลังผ่านไป 3 ข้อจึงขึ้นว่า "3 ผ่าน" และทั้งรอบจบว่าผ่านทั้งหมด ทั้งที่แอปพัง
# -E ให้ trap ERR ทำงานในฟังก์ชันด้วย (claim_order ฯลฯ) · พิมพ์เฉพาะเชลล์หลัก ไม่งั้น $(…) ที่พังพิมพ์ซ้ำ/หลุดเข้าตัวแปร
set -eE
_cs_died() {
  if [ "${BASH_SUBSHELL:-0}" -eq 0 ]; then echo "FAIL สคริปต์หยุดกลางทาง (บรรทัด $1): $2"; fi
}
trap '_cs_died "$LINENO" "$BASH_COMMAND"' ERR
_CS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$_CS_DIR/lib/fixture-parts.sh"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
# รหัส HTTP อย่างเดียว — $1 token · $2 method · $3 path · ที่เหลือส่งต่อให้ curl
CODE() { local t=$1 m=$2 p=$3; shift 3; curl -s -o /dev/null -w '%{http_code}' -X "$m" "localhost:4000/api/$p" -H "$(H $t)" "$@"; }
# วันข้างหน้า n วัน (เวลาไทย) — วันนัดย้อนหลังไม่ได้ และวันตายตัววันหนึ่งจะกลายเป็นอดีต
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
# แนบไฟล์ใส่ใบ $ID ในนามคนที่ให้ token มา — $1 token · $2 ชนิดไฟล์ (image/png · video/mp4) · ที่เหลือ = -F ของ curl
UPAS() { local t=$1 mime=$2; shift 2; curl -s -X POST "localhost:4000/api/work-orders/$ID/attachments" -H "$(H $t)" -F "file=@$_CS_DIR/site-photo.png;type=$mime" "$@"; }
# แนบในนามช่าง (คนที่ปิดงาน) — หลักฐานเคลมจริงมาจากมือถือช่าง กติกา "ลบได้เฉพาะไฟล์ตัวเอง" จึงทดสอบได้ตรงตัว
UP() { UPAS "$T" "$@"; }

SUF=$RANDOM
BC="DZCS$SUF"
VISIT=$(day 12)
IDS=""
ID=""
# อ่านภาคเดิมของ S001 ก่อนตั้ง trap — ถ้าตายก่อนอ่าน trap จะคืนภาคเป็นค่าว่างทับของจริง
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
cleanup() {
  # เก็บกวาดให้ครบทุกบรรทัด — เซิร์ฟเวอร์ล่มแล้ว curl พังต้องไม่ทำให้ข้ามการลบสาขา/ผู้ใช้/คืนภาคของ S001
  set +e
  trap - ERR
  if declare -F claim_extra_cleanup >/dev/null; then claim_extra_cleanup || true; fi
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code='$BC');
      delete from \"Branch\" where code='$BC';
      delete from \"User\" where \"employeeCode\" like 'ZCS%$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT

A=$(login A001)
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
# ผู้ใช้ของชุดนี้เอง ไม่แตะทีม/ภาคของผู้ใช้ทดสอบหลัก (T001) — ลบทิ้งตอนจบ
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCSP$SUF','แอดมินอะไหล่ทดสอบเคลม','PARTS_ADMIN','$HASH',false)" >/dev/null
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\",team) values ('ZCST$SUF','ช่างทดสอบเคลม','EMPLOYEE','$HASH',false,'กระบี่')" >/dev/null
PA=$(login ZCSP$SUF)
T=$(login ZCST$SUF)
TID=$(DB "select id from \"User\" where \"employeeCode\"='ZCST$SUF'")
if [ -n "${CLAIM_SETUP_SUPER:-}" ]; then
  DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCSS$SUF','ซูเปอร์แอดมินทดสอบเคลม','SUPER_ADMIN','$HASH',false)" >/dev/null
  SA=$(login ZCSS$SUF)
fi
# สาขาแฟรนไชส์เปิดมาปีเดียว เครื่อง Huebsch — อยู่ในประกัน (ไม่ต้องเสนอราคา) และต้องทำ Troubleshooting
DB "insert into \"Branch\"(name,code,region,zone,ownership,\"openedAt\") values ('สาขาทดสอบเคลม','$BC','ใต้','กระบี่','FRANCHISE',now()-interval '12 months')" >/dev/null
BID=$(DB "select id from \"Branch\" where code='$BC'")
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values ($BID,'W1','WASHER','HB - Huebsch',now())" >/dev/null

# ข้อมูลป้ายรุ่น + เช็คตามคู่มือ (Huebsch = Alliance) ค่าตั้งต้นที่ปิดงานผ่าน — ชุดที่ต้องการค่าอื่นส่งเองใน CLOSE $2/$3
# รุ่นกับ Serial กดยืนยันทีละช่องแล้ว (confirmed · เคลมก้อน 5 บังคับ แม้พิมพ์เอง)
PLATE='{"fields":[{"key":"model","label":"รุ่น","value":"HL055L","source":"SCAN","crop":"data:image/jpeg;base64,/9j/AAAA","confirmed":true},{"key":"serial","label":"Serial","value":"2402600330","source":"HAND","confirmed":true}]}'
CHECK='{"errorCode":"E dL / E dL1 / E dL2","checked":["Solenoid ไม่ฝืด"]}'

# เปิดใบใหม่ให้ $ID — $1 = จำนวนอะไหล่ (1 หรือ 2) · ใบเดินจริงทุกขั้นถึงขั้นเข้างาน แล้วช่างแนบรูปที่ปิดงานบังคับ
claim_order() {
  local n=${1:-1}
  ID=$(POST $A work-orders "{\"branchCode\":\"$BC\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณสมหญิง\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"model\":\"Huebsch\",\"symptom\":\"ประตูล็อกไม่ลง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  IDS="$IDS $ID"
  # อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่อง (HB - Huebsch) — ตัวแฝดจาก fx_part ไม่ใช่รหัสตายตัว
  PID=$(fx_part $ID BOARD); PCODE=$(fx_part_code $ID BOARD)
  PID2=""; PCODE2=""
  local wanted="{\"sparePartId\":$PID,\"quantity\":1}"
  local src="{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}"
  local chk="{\"sparePartId\":$PID,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CS$SUF\"}"
  if [ "$n" -ge 2 ]; then
    PID2=$(fx_part $ID BELT); PCODE2=$(fx_part_code $ID BELT)
    wanted="$wanted,{\"sparePartId\":$PID2,\"quantity\":1}"
    src="$src,{\"sparePartId\":$PID2,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\"}"
    chk="$chk,{\"sparePartId\":$PID2,\"inStock\":true,\"warehouse\":\"คลังลาดพร้าว 94\",\"requisitionNo\":\"RQ-CS$SUF\"}"
  fi
  PARTS="[$wanted]"
  POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[$wanted]}" >/dev/null
  POST $A "work-orders/$ID/parts-sourcing" "{\"results\":[$src]}" >/dev/null
  POST $S "work-orders/$ID/assign" "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
  POST $A "work-orders/$ID/parts-check" "{\"results\":[$chk]}" >/dev/null
  POST $A "work-orders/$ID/confirm-appointment" '{}' >/dev/null
  POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
  if [ "$(DB "select status from \"WorkOrder\" where id=$ID")" != "IN_PROGRESS" ]; then
    echo "FAIL claim-setup: เตรียมใบงานไม่ถึงขั้นเข้างาน ($(DB "select status from \"WorkOrder\" where id=$ID"))"
    exit 1
  fi
  for r in BEFORE AFTER NAMEPLATE REQUISITION; do UP image/png -F "role=$r" >/dev/null; done
  TS=$(GET $T "work-orders/$ID" | J 'JSON.stringify(d.claimTroubleshooting)')
}

# หลักฐานเคลมครบสี่อย่างของอะไหล่ $1 (ช่างแนบ)
claim_files() {
  for r in CLAIM_PART CLAIM_SYMPTOM; do UP image/png -F "role=$r" -F "sparePartId=$1" >/dev/null; done
  for r in CLAIM_ERROR_VIDEO CLAIM_CHECK_VIDEO; do UP video/mp4 -F "role=$r" -F "sparePartId=$1" >/dev/null; done
}

# ใบเคลมหนึ่งชิ้นที่กรอกครบ — $1 อะไหล่ · $2 อาการ/สาเหตุ · $3 เช็คอะไรบ้าง (ไม่ส่ง = ข้อความสั้นตั้งต้น)
claim_json() {
  local sym=${2:-ประตูล็อกไม่ลง ขึ้น Error dL} note=${3:-วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย}
  echo "{\"sparePartId\":$1,\"brokenPartCode\":\"OLD-$1\",\"symptom\":\"$sym\",\"checkNote\":\"$note\",\"troubleshooting\":$TS}"
}

# เหตุผล "ไม่ส่งเคลม" ของทุกชิ้นใน PARTS ที่ไม่อยู่ใน claims ($1) — สาขาทดสอบอยู่ในประกัน ก้อน 5 บังคับเหตุผลชิ้นที่ไม่ส่ง
# ค่าตั้งต้นที่ปิดงานผ่าน (แบบเดียวกับ PLATE) ให้ชุดที่ทดสอบเรื่องอื่นไม่ต้องรู้กติกานี้ · ชิ้นที่ล็อกแล้ว (ผ่าน/ปิดเคลม) เซิร์ฟเวอร์ไม่สนเหตุผล
claim_skips() {
  # claims ที่ไม่ใช่ JSON (ชุดที่ทดสอบคำขอเสีย) = ไม่เติมเหตุผล ปล่อยให้เซิร์ฟเวอร์ตอบเรื่องนั้นเอง
  node -e 'let claims; try { claims = JSON.parse(process.argv[2] || "[]"); } catch { claims = null; }
    const used = JSON.parse(process.argv[1]), on = new Set(Array.isArray(claims) ? claims.map((c) => c && c.sparePartId) : []);
    console.log(Array.isArray(claims) ? JSON.stringify([...new Set(used.map((p) => p.sparePartId))].filter((id) => !on.has(id)).map((id) => ({ sparePartId: id, reason: "DAMAGED_LOST" }))) : "[]")' "$PARTS" "$1"
}

# ช่างปิดงาน — $1 claims (JSON) · $2 ข้อมูลป้าย · $3 เช็คตามคู่มือ (ไม่ส่ง = ค่าตั้งต้นที่ผ่าน)
# $4 เหตุผลชิ้นที่ไม่ส่งเคลม (claimSkips) — ไม่ส่ง = claim_skips ใส่ให้ · ส่ง '[]' = ไม่บอกเหตุผลเลย (ทดสอบกติกานั้นเอง)
CLOSE() {
  local skips=${4-$(claim_skips "$1")}
  POST $T "work-orders/$ID/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนอะไหล่ ทดสอบแล้วปกติ\",\"workerIds\":[$TID],\"parts\":$PARTS,\"claims\":$1,\"claimNameplate\":${2-$PLATE},\"claimCheck\":${3-$CHECK},\"claimSkips\":$skips}"
}
