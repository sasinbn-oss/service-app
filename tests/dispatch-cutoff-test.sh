#!/bin/bash
# ทดสอบ: เวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายจากขั้นปล่อยงานมาที่การนัดวัน 2 พ.ย. 69)
#   งานพรุ่งนี้ต้องนัดก่อนเวลาที่แอดมินตั้ง (ตั้งต้น 16:00) ของวันนี้ · วันนี้นัดไม่ได้ · มะรืนเป็นต้นไปนัดได้
#   · ตั้งค่า GET/PUT /api/settings/dispatch-cutoff (key/ค่า/ค่าตั้งต้นเดิม · ชื่อใหม่ "เวลาปิดนัดงานพรุ่งนี้")
#   · คณิตของกฎ utils/dispatchCutoff.ts (closedFor · grantedFor · firstOpenDay · closedRefusal · pastRelease) ด้วยเวลาที่ส่งเข้าไปเอง
#   · หัวหน้าภาคนัดวัน (/parts ไม่ใช้อะไหล่จ่ายงาน · /inspect-request ส่งตรวจ · /assign นัดวันเข้า) → 400 DATE_CLOSED วันที่ปิด
#     · แอดมินกดแทนที่ขั้นนัดวัน ติ๊ก urgent = แก้เป็นงานด่วนไปพร้อมกัน (ประวัติ via=schedule) · ติ๊กของหัวหน้าภาคไม่มีผล
#   · คำขอนัดด่วน (/urgent-request · /cancel · /answer) · แอดมินแก้เป็นงานด่วน (/urgent-release ใช้วันที่ขอ · ไม่ดูเวลาเริ่มใช้กฎ
#     · แอปกดจากคำขอส่ง fromAsk = คำขอต้องยังรออยู่ ไม่แก้ทับคำตอบของแอดมินอีกคน)
#     · 409 เรื่องสถานะคำขอมี code URGENT_ASK_STATE (ฟอร์มนัดวันไม่ถูกปิด) · 409 เรื่องขั้นไม่มี code
#   · คอนเฟิร์มลูกค้า/เลื่อนวันนัด/ดึงงานคืนไปวันที่ปิดต้องติ๊ก · คอนเฟิร์มวันเดิมไม่มีกฎ · เลื่อนแค่เวลาไม่ล้างงานด่วน
#   · ปล่อยงานไม่ล็อกแล้ว · ฝั่งอ่าน (urgentAsk/urgentAnswer · กล่อง "ขอนัดด่วน" · /version · บอร์ด) · ทางที่ไม่ได้นัดวันไม่ติดกฎ
#
# ทุกข้อที่ทดสอบกฎต้อง FAIL ถ้าโค้ดถอยกลับไปเป็นแบบ PR #165 (ล็อกที่ขั้นปล่อยงาน) — แต่ละบรรทัด PASS มีข้อเท็จจริงของกฎใหม่
# อย่างน้อยหนึ่งข้อ (ปฏิเสธที่เดิมไม่มี · รับที่เดิมปฏิเสธ · ช่องใหม่ · ผลข้างเคียงที่หายไป) คู่กับสภาพในฐานข้อมูล
# ใบวันนี้/พรุ่งนี้ที่ใช้ทดสอบ "ปล่อยงานไม่ล็อก" สร้างด้วยการนัดมะรืนแล้วย้ายวันทาง SQL (urgentReleaseFor ว่าง) ไม่ใช่ด้วยงานด่วน —
# ใบที่แอดมินแก้เป็นงานด่วนให้ โค้ดเก่าก็ปล่อยผ่าน ข้อนั้นจะผ่านทั้งที่กฎถอยกลับไปแล้ว
#
# คุมเวลาด้วยแถวในตาราง AppSetting เท่านั้น (แถวล่าสุด = เวลาปิดที่ใช้) แล้วลบแถวที่เพิ่มทุกแถวตอนจบ (trap)
# — แถวที่ค้างไว้จะเปลี่ยนผลของทุกชุดที่รันต่อจากนี้ · ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
# ผลต้องเหมือนกันไม่ว่ารันกี่โมง: วันนี้ปิดเสมอ (เวลาเริ่มใช้กฎถอยไว้ 30 วัน) · พรุ่งนี้ตัดสินด้วย OPEN/CLOSE เท่านั้น · มะรืนเปิดเสมอ
#
# หยุดกลางทาง = FAIL เสมอ (แบบเดียวกับ claim-setup.sh): run-all.sh นับแค่บรรทัด PASS/FAIL ไม่ดู exit code
# ถ้า set -e จบสคริปต์เงียบ ๆ (curl ต่อไม่ติดตอน ts-node-dev รีสตาร์ต · ไม่มีตาราง AppSetting เพราะลืม migrate ·
# เซิร์ฟเวอร์ตอบ HTML แล้ว J อ่านไม่ออก) ชุดนี้จะขึ้น "14 ผ่าน" หรือ "0 ผ่าน" และทั้งรอบจบว่าผ่านทั้งหมด ทั้งที่แอปพัง
# -E ให้ trap ERR ทำงานในฟังก์ชันด้วย (SETCUT ฯลฯ) · พิมพ์เฉพาะเชลล์หลัก ไม่งั้น $(…) ที่พังพิมพ์ซ้ำ/หลุดเข้าตัวแปร
set -eE
_dc_died() {
  if [ "${BASH_SUBSHELL:-0}" -eq 0 ]; then echo "FAIL สคริปต์หยุดกลางทาง (บรรทัด $1): $2"; fi
}
trap '_dc_died "$LINENO" "$BASH_COMMAND"' ERR
cd "$(dirname "$0")/../backend"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GETCUT() { curl -s localhost:4000/api/settings/dispatch-cutoff -H "$(H $1)"; }
PUTCUT() { curl -s -X PUT localhost:4000/api/settings/dispatch-cutoff -H "$(H $1)" -H 'Content-Type: application/json' -d "$2"; }
PUTCODE() { CODE -X PUT localhost:4000/api/settings/dispatch-cutoff -H "$(H $1)" -H 'Content-Type: application/json' -d "$2"; }
MAXSET() { DB "select coalesce(max(id),0) from \"AppSetting\""; }
LATEST() { DB "select value||'|'||coalesce(\"createdById\"::text,'-') from \"AppSetting\" where key='dispatchCutoff' order by id desc limit 1"; }
# ตั้งเวลาปิดทาง SQL (เทสต์ใช้เวลาใด ๆ ได้ ไม่จำกัดแค่ 5 ตัวเลือก) แล้วเรียก GET ให้เซิร์ฟเวอร์อ่านสด ไม่ใช้ค่าที่จำไว้ 30 วิ
SETCUT() { DB "insert into \"AppSetting\" (key,value) values ('dispatchCutoff','$1')" >/dev/null; GETCUT $A >/dev/null; }

SUF=$RANDOM

# กันข้ามเที่ยงคืน: เวลาปิดทดสอบห่างจากตอนนี้ไม่เกิน 5 นาที ทั้งชุดใช้ราว 3 นาที — ภายใน 10 นาทีก่อน/หลังเที่ยงคืน
# "วันนี้/พรุ่งนี้" จะเปลี่ยนกลางทาง (หรือ 23:58+5 นาทีกลายเป็น 00:03 ของวันเดียวกัน) รอให้พ้น 00:11 ก่อน · ขยับ offset ต้องขยับตรงนี้ด้วย
# รอก่อนแตะฐานข้อมูลสักบรรทัด: ถูกฆ่าระหว่าง sleep (ตัวคุมรอบหมดเวลา) bash ยังไม่ได้เรียก trap — ถ้าถอยเวลาเริ่มใช้กฎ/แก้ S001
# ไว้ก่อนแล้ว ของพวกนั้นจะค้างในฐานโดยไม่มีใครคืน
WAIT=$(node -e '
  const now = Date.now() + 7 * 3600e3, d = new Date(now), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m < 24 * 60 - 10 && m >= 11) { console.log(0); process.exit(0); }
  const t = new Date(now); t.setUTCHours(0, 11, 0, 0); if (t.getTime() <= now) t.setUTCDate(t.getUTCDate() + 1);
  console.log(Math.ceil((t.getTime() - now) / 1000));')
if [ "$WAIT" -gt 0 ]; then echo "    รอข้ามเที่ยงคืน $WAIT วินาที — เวลาปิดทดสอบจะข้ามวัน"; sleep "$WAIT"; fi

# แถวที่รอบก่อนทิ้งไว้ (ถูกฆ่ากลางทางก่อน trap ทำงาน · หมดเวลาจากตัวคุมรอบ) ต้องโผล่เป็น FAIL ไม่ใช่ถูกกลบ —
# เดิม "ตั้ง 16:00 ทับแล้วลบแถวของตัวเองตอนจบ" ทำให้ฐานกลับไปค้างเวลาเสีย (23:59 · abc) ทุกครั้ง แอปกับทุกชุดที่รัน
# ต่อจากนี้ใช้เวลาผิดไปเรื่อย ๆ โดยไม่มีชุดไหนบอก · แถวหลังแถวตั้งต้นที่ไม่มีคนเปลี่ยน (ใส่ทาง SQL) หรือเปลี่ยนโดย
# ผู้ใช้ชั่วคราว ZDC* มาจากเทสต์เท่านั้น ลบได้แน่นอน · แถวที่แอดมินจริงเปลี่ยนไว้ไม่แตะ (คืนให้ตอนจบตามเดิม)
LEAK_WHERE="s.key='dispatchCutoff'
  and s.id > (select min(id) from \"AppSetting\" where key='dispatchCutoff')
  and (s.\"createdById\" is null or s.\"createdById\" in (select id from \"User\" where \"employeeCode\" like 'ZDC%'))"
LEAK=$(DB "select string_agg(s.id||'='||s.value, ' ' order by s.id) from \"AppSetting\" s where $LEAK_WHERE")
if [ -n "$LEAK" ]; then
  fail "มีแถวเวลาปิดนัดที่เทสต์รอบก่อนทิ้งค้างไว้ (id=ค่า: $LEAK) — ลบออกแล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้แอปใช้เวลาผิด"
  DB "delete from \"AppSetting\" s where $LEAK_WHERE" >/dev/null
fi
# เวลาเริ่มใช้กฎที่รอบก่อนถอยไว้ 30 วันแล้วไม่ได้คืน (ดู SEED_MARK ในส่วนเตรียมข้อมูล) — คืนจากค่าที่จดไว้ ไม่เดา
SEED_MARK=dispatchCutoffTestSeedAt
SEED_LEFT=$(DB "select value from \"AppSetting\" where key='$SEED_MARK' order by id limit 1")
if [ -n "$SEED_LEFT" ]; then
  fail "เวลาเริ่มใช้กฎค้างถอยหลัง 30 วันจากเทสต์รอบก่อน — คืนเป็น $SEED_LEFT แล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้วันนี้ของทุกใบปิดนัดทั้งที่ฐานนี้เพิ่งเปิดกฎ"
  DB "update \"AppSetting\" set \"createdAt\"='$SEED_LEFT' where id=(select min(id) from \"AppSetting\" where key='dispatchCutoff');
      delete from \"AppSetting\" where key='$SEED_MARK'" >/dev/null
fi
# เบอร์ของ S001 ที่ส่วนคำขอนัดด่วนตั้งชั่วคราว — เก็บค่าเดิมเป็นแถว key อื่นแบบเดียวกับ SEED_MARK (readCutoff อ่านเฉพาะ key='dispatchCutoff')
# ถูกฆ่ากลางทางแล้วไม่มีแถวนี้ รอบถัดไปจะจำเบอร์ทดสอบเป็น "ค่าเดิม" แล้วคืนเบอร์ผิดทุกรอบ — area-map-test.sh (เบอร์ S001 ต้องว่าง)
# พังทุกรอบโดยไม่มีอะไรชี้กลับมาที่ชุดนี้ · คืนแบบมีเงื่อนไข: ไม่มีแถวจด = ไม่แตะเบอร์ (ไม่ใช่ล้างเป็นว่าง)
PHONE_MARK=dispatchCutoffTestS001Phone
RESTORE_PHONE="update \"User\" set phone=nullif((select value from \"AppSetting\" where key='$PHONE_MARK' order by id limit 1),'')
    where \"employeeCode\"='S001' and exists (select 1 from \"AppSetting\" where key='$PHONE_MARK');
  delete from \"AppSetting\" where key='$PHONE_MARK'"
PHONE_LEFT=$(DB "select coalesce(nullif(value,''),'(ว่าง)') from \"AppSetting\" where key='$PHONE_MARK' order by id limit 1")
if [ -n "$PHONE_LEFT" ]; then
  fail "เบอร์ของ S001 ค้างเป็นเบอร์ทดสอบจากรอบก่อน — คืนเป็น $PHONE_LEFT แล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้ชุดที่ดูเบอร์ S001 (area-map) พัง"
  DB "$RESTORE_PHONE" >/dev/null
fi

MAXSET0=$(MAXSET)
cleanup() {
  # เก็บกวาดให้ครบทุกบรรทัด — ลบแถวตั้งค่าไม่สำเร็จต้องไม่ทำให้ข้ามการลบผู้ใช้ชั่วคราว
  set +e
  trap - ERR
  # ใบงานของรอบนี้ (รวมใบทดสอบที่คัดลอก) หาจากอาการที่มีเลขสุ่ม — สร้างใน $(...) ตัวแปรในเชลล์ลูกไม่กลับมา
  # ลบก่อนผู้ใช้ชั่วคราว: ประวัติที่ผู้ใช้เหล่านั้นเขียนหายไปกับใบ
  if [ -n "$A" ]; then
    for i in $(DB "select id from \"WorkOrder\" where symptom='ทดสอบเวลาปิดนัด $SUF'"); do
      curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null
    done
  fi
  # เวลาเริ่มใช้กฎที่ถอยไป 30 วันระหว่างรัน — ค้างไว้ = วันนี้ของทุกชุดที่รันต่อปิดนัดทั้งที่ฐานนี้เพิ่งเปิดกฎ
  # ลบแถวจดค่าเดิมในคำสั่งเดียวกับที่คืน — คืนไม่สำเร็จ แถวจดยังอยู่ให้รอบหน้าคืนให้
  [ -n "$SEED_AT" ] && DB "update \"AppSetting\" set \"createdAt\"='$SEED_AT' where id=$SEED_ID;
      delete from \"AppSetting\" where key='$SEED_MARK'" >/dev/null
  if [ -n "$SAVED_USERS" ]; then
    DB "update \"User\" set region=nullif('$OLD_REGION',''), \"supervisedTeams\"=coalesce(string_to_array(nullif('$OLD_TEAMS',''),','),'{}') where \"employeeCode\"='S001'" >/dev/null
    DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
  fi
  # เบอร์ของ S001 ที่ตั้งชั่วคราวในส่วนคำขอนัดด่วน — คืนจากแถวจดและลบแถวจดในคำสั่งเดียว (คืนไม่สำเร็จ แถวจดยังอยู่ให้รอบหน้าคืน)
  DB "$RESTORE_PHONE" >/dev/null
  DB "delete from \"OutsourceTeam\" where name='ZDCOS$SUF'" >/dev/null
  DB "delete from \"AppSetting\" where id>$MAXSET0 and key not in ('$SEED_MARK','$PHONE_MARK')" >/dev/null
  DB "delete from \"ViewAsLog\" where \"byUserId\" in (select id from \"User\" where \"employeeCode\" like 'ZDC%$SUF%');
      delete from \"User\" where \"employeeCode\" like 'ZDC%$SUF%'" >/dev/null
  # เซิร์ฟเวอร์จำค่าไว้ 30 วิ — อ่านสดหนึ่งครั้งให้ชุดถัดไปเห็นเวลาเดิม ไม่ใช่เวลาที่เทสต์นี้ตั้งค้างไว้
  [ -n "$A" ] && GETCUT $A >/dev/null 2>&1 || true
}
trap cleanup EXIT

A=$(login A001)
S=$(login S001)
T=$(login T001)
A_ID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
A_NAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
# ผู้ใช้ชั่วคราว: Super Admin (ลบผู้ใช้ · ดูในฐานะ) · Admin Spare Part · ทีม Area · แอดมินคนที่สองที่ไม่มีประวัติอื่นเลย
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values
  ('ZDCS$SUF','ซุปเปอร์ทดสอบเวลาปิดนัด','SUPER_ADMIN','$HASH',false),
  ('ZDCP$SUF','แอดมินอะไหล่ทดสอบเวลาปิดนัด','PARTS_ADMIN','$HASH',false),
  ('ZDCR$SUF','Area ทดสอบเวลาปิดนัด','AREA','$HASH',false),
  ('ZDCA$SUF','แอดมินสองทดสอบเวลาปิดนัด','ADMIN','$HASH',false)" >/dev/null
SA=$(login ZDCS$SUF); PA=$(login ZDCP$SUF); AR=$(login ZDCR$SUF); A2=$(login ZDCA$SUF)
A2_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDCA$SUF'")
S_ID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
VA=$(POST $SA auth/view-as "{\"userId\":$S_ID}" | J 'd.token||""')
[ -n "$VA" ] || { echo "FAIL ขอโทเคนดูในฐานะ S001 ไม่ได้"; exit 1; }
# ดูในฐานะแอดมิน (A001) — โทเคนนี้ role=ADMIN จึงเหลือแค่ viewAs ที่กัน canEdit/PUT ไว้ (ดูในฐานะ S001 ถูกกันด้วย role อยู่แล้ว
# ข้อนั้นจึงผ่านต่อให้ใครลบเงื่อนไข viewAs ออก) — Super Admin ดูในฐานะแอดมินได้ (canViewAs)
SA_ID=$(DB "select id from \"User\" where \"employeeCode\"='ZDCS$SUF'")
VAA=$(POST $SA auth/view-as "{\"userId\":$A_ID}" | J 'd.token||""')
[ -n "$VAA" ] || { echo "FAIL ขอโทเคนดูในฐานะ A001 ไม่ได้"; exit 1; }

# เริ่มจาก 16:00 เสมอ — แอดมินบนเครื่องนี้อาจตั้งเวลาอื่นไว้ (แถวนี้ถูกลบตอนจบ ค่าของแอดมินกลับมาเหมือนเดิม)
[ "$(LATEST | cut -d'|' -f1)" = "16:00" ] || SETCUT 16:00

echo "═══ อ่านค่า: ใครเห็นอะไร"
R=$(GETCUT $A)
SINCE_DB=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"AppSetting\" where key='dispatchCutoff' order by id limit 1")
[ "$(echo "$R" | J '[d.time, d.choices.join(","), d.canEdit].join("|")')" = "16:00|15:00,15:30,16:00,16:30,17:00|true" ] \
  && pass "แอดมินอ่านได้: 16:00 · ตัวเลือก 15:00–17:00 ทีละครึ่งชั่วโมง · แก้ได้" || fail "GET แอดมิน: $R"
# "ยังไม่เคยเปลี่ยน" ต้องว่างทั้งสามช่อง — หน้าตั้งค่าใช้แยก "ค่าตั้งต้น 16:00 น." กับ "เปลี่ยนล่าสุด: <ชื่อ> · …"
# ถ้าคิดจากแถวล่าสุดตรง ๆ ฐานใหม่ทุกฐาน (รวมของจริงเช้าวัน deploy) จะขึ้น "เปลี่ยนล่าสุด: null"
# ปกติมีแค่แถวตั้งต้น (สภาพที่ cleanup คืนให้) · ถ้าแอดมินบนเครื่องนี้เคยเปลี่ยนไว้ เช็คอีกด้านแทน — ข้อนี้ไม่ถูกข้าม
NROWS=$(DB "select count(*) from \"AppSetting\" where key='dispatchCutoff'")
if [ "$NROWS" = "1" ]; then
  [ "$(echo "$R" | J '[d.changedAt, d.changedByName, d.previous].every(v => v === null)')" = "true" ] \
    && pass "ยังไม่เคยมีใครเปลี่ยน (มีแค่แถวตั้งต้น · ฐานข้อมูล) → changedAt · changedByName · previous ว่างทั้งสาม" \
    || fail "แถวตั้งต้นแถวเดียวแต่ส่งค่าเปลี่ยนล่าสุดมา: $R"
else
  LAST_DB=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"AppSetting\" where key='dispatchCutoff' order by id desc limit 1")
  [ "$(echo "$R" | J 'd.changedAt')" = "$LAST_DB" ] \
    && pass "มีแถวหลังแถวตั้งต้น ($NROWS แถว · ฐานข้อมูล) → changedAt = createdAt ของแถวล่าสุด" \
    || fail "changedAt $(echo "$R" | J 'd.changedAt') ≠ แถวล่าสุด $LAST_DB ($NROWS แถว)"
fi
[ "$(echo "$R" | J 'd.since')" = "$SINCE_DB" ] \
  && pass "since = createdAt ของแถวแรก (เวลาเริ่มใช้กฎ $SINCE_DB · ฐานข้อมูล)" || fail "since $(echo "$R" | J 'd.since') ≠ ฐานข้อมูล $SINCE_DB"
[ "$(echo "$R" | J 'Math.abs(Date.parse(d.serverNow) - Date.now()) < 60000')" = "true" ] \
  && pass "ส่งเวลาเซิร์ฟเวอร์ (serverNow) มาด้วย — การ์ดตั้งค่าใช้เช็คว่าเลยเวลาใหม่ไปแล้วหรือยัง" || fail "serverNow: $R"
OK=1
for who in S T PA VA VAA; do
  r=$(GETCUT ${!who}); [ "$(echo "$r" | J '[d.time, d.canEdit].join("|")')" = "16:00|false" ] || { OK=; echo "    $who → $r"; }
done
[ -n "$OK" ] && pass "หัวหน้าภาค · ช่าง · Admin Spare Part · ดูในฐานะหัวหน้าภาค/แอดมิน อ่านได้ แต่ canEdit=false" || fail "อ่านค่าไม่ตรง"
r="$(CODE localhost:4000/api/settings/dispatch-cutoff -H "$(H $AR)")"
[ "$r" = "403" ] && pass "ทีม Area อ่านไม่ได้ (403 — ไม่อยู่ในรายการอนุญาต)" || fail "Area GET → $r"

echo
echo "═══ เปลี่ยนเวลา: แถวใหม่ทุกครั้ง · ใครเปลี่ยนจากอะไร"
M0=$(MAXSET)
R=$(PUTCUT $A '{"time":"15:30"}')
[ "$(echo "$R" | J '[d.time, d.previous, d.changedByName].join("|")')" = "15:30|16:00|$A_NAME" ] \
  && [ "$(LATEST)" = "15:30|$A_ID" ] && [ "$(DB "select count(*) from \"AppSetting\" where id>$M0")" = "1" ] \
  && pass "แอดมินตั้ง 15:30 → แถวใหม่หนึ่งแถว โดย A001 (ฐานข้อมูล)" || fail "PUT 15:30: $R · $(LATEST)"
R=$(GETCUT $S)
CHANGED_DB=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"AppSetting\" where key='dispatchCutoff' order by id desc limit 1")
[ "$(echo "$R" | J '[d.time, d.previous, d.changedByName, d.changedAt].join("|")')" = "15:30|16:00|$A_NAME|$CHANGED_DB" ] \
  && [ "$(echo "$R" | J 'd.since')" = "$SINCE_DB" ] \
  && pass "อ่านอีกครั้ง (หัวหน้าภาค): 16:00 → 15:30 โดย $A_NAME · since ไม่เปลี่ยน" || fail "GET หลังเปลี่ยน: $R"
M1=$(MAXSET)
OK=1
for body in '{"time":"15:45"}' '{"time":"14:30"}' '{"time":"17:30"}' '{"time":"abc"}' '{}'; do
  r=$(PUTCUT $A "$body"); [ "$(echo "$r" | J 'd.error')" = "เลือกได้ 15:00–17:00 ทีละครึ่งชั่วโมง" ] || { OK=; echo "    $body → $r"; }
done
[ -n "$OK" ] && [ "$(PUTCODE $A '{"time":"15:45"}')" = "400" ] && [ "$(MAXSET)" = "$M1" ] \
  && pass "นอกตัวเลือก (15:45 · 14:30 · 17:30 · abc · ว่าง) → 400 และฐานข้อมูลไม่มีแถวเพิ่ม" || fail "ค่านอกตัวเลือกผ่าน"
R=$(PUTCUT $A '{"time":"15:30"}')
[ "$(echo "$R" | J 'd.error')" = "เป็นเวลานี้อยู่แล้ว" ] && [ "$(MAXSET)" = "$M1" ] \
  && pass "ตั้งค่าเดิมซ้ำ → 400 \"เป็นเวลานี้อยู่แล้ว\" ไม่มีแถวซ้ำ (ฐานข้อมูล)" || fail "ค่าเดิมซ้ำ: $R"

echo
echo "═══ ใครเปลี่ยนไม่ได้"
R=$(PUTCUT $S '{"time":"17:00"}')
[ "$(echo "$R" | J 'd.error')" = "ตั้งเวลาปิดนัดงานพรุ่งนี้ได้เฉพาะแอดมิน" ] && [ "$(PUTCODE $T '{"time":"17:00"}')" = "403" ] && [ "$(MAXSET)" = "$M1" ] \
  && pass "หัวหน้าภาค/ช่างเปลี่ยนไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "หัวหน้าภาค/ช่าง PUT: $R"
R=$(PUTCUT $PA '{"time":"17:00"}')
echo "$R" | grep -q "Admin Spare Part ดูได้อย่างเดียว" && [ "$(MAXSET)" = "$M1" ] \
  && pass "Admin Spare Part เปลี่ยนไม่ได้ (403) และ AppSetting ไม่มีแถวเพิ่ม" || fail "Admin Spare Part PUT: $R"
R=$(PUTCUT $VA '{"time":"17:00"}')
R2=$(PUTCUT $VAA '{"time":"17:00"}')
echo "$R" | grep -q "ดูในฐานะผู้ใช้อื่น" && echo "$R2" | grep -q "ดูในฐานะผู้ใช้อื่น" \
  && [ "$(PUTCODE $AR '{"time":"17:00"}')" = "403" ] && [ "$(MAXSET)" = "$M1" ] \
  && pass "ดูในฐานะ (หัวหน้าภาค · แอดมิน)/ทีม Area เปลี่ยนไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "ดูในฐานะ/Area PUT: $R · $R2"

echo
echo "═══ แอดมินที่เคยเปลี่ยนเวลาถูกลบ → ปิดบัญชี ไม่ลบจริง (ชื่อในประวัติต้องอยู่)"
R=$(PUTCUT $A2 '{"time":"16:30"}')
[ "$(echo "$R" | J '[d.time, d.previous].join("|")')" = "16:30|15:30" ] && [ "$(LATEST)" = "16:30|$A2_ID" ] \
  && pass "แอดมินคนที่สอง (ไม่มีประวัติอื่น) ตั้ง 16:30 → แถวโดยคนนี้ (ฐานข้อมูล)" || fail "แอดมินสอง PUT: $R"
R=$(curl -s -X DELETE "localhost:4000/api/auth/users/$A2_ID" -H "$(H $SA)")
[ "$(echo "$R" | J 'd.mode')" = "deactivated" ] && [ -n "$(DB "select \"deletedAt\" from \"User\" where id=$A2_ID")" ] \
  && [ "$(LATEST)" = "16:30|$A2_ID" ] \
  && pass "ลบแล้วเป็นปิดบัญชี (deletedAt) แถวผู้ใช้ยังอยู่ · แถวตั้งค่ายังชี้คนนี้ (ฐานข้อมูล)" || fail "ลบแอดมินสอง: $R"
R=$(GETCUT $A)
[ "$(echo "$R" | J '[d.time, d.previous, d.changedByName].join("|")')" = "16:30|15:30|แอดมินสองทดสอบเวลาปิดนัด" ] \
  && pass "\"เปลี่ยนล่าสุด\" ยังขึ้นชื่อแอดมินที่ถูกลบ: 15:30 → 16:30" || fail "ชื่อหายหลังลบ: $R"

echo
echo "═══ Super Admin เปลี่ยนได้ (เจ้าของงาน: แอดมินทุกคนรวม Super Admin)"
R=$(GETCUT $SA)
R2=$(PUTCUT $SA '{"time":"17:00"}')
[ "$(echo "$R" | J 'd.canEdit')" = "true" ] \
  && [ "$(echo "$R2" | J '[d.time, d.previous, d.changedByName].join("|")')" = "17:00|16:30|ซุปเปอร์ทดสอบเวลาปิดนัด" ] \
  && [ "$(LATEST)" = "17:00|$SA_ID" ] \
  && pass "Super Admin: canEdit=true · ตั้ง 17:00 → แถวใหม่โดยคนนี้ (ฐานข้อมูล)" || fail "Super Admin: $R · $R2 · $(LATEST)"

echo
echo "═══ ค่าที่ไม่ได้มาจากปุ่ม (เทสต์คุมเวลาทาง SQL · มีคนแก้ฐานข้อมูลตรง ๆ)"
SETCUT 23:59
[ "$(GETCUT $A | J 'd.time')" = "23:59" ] && pass "ค่านอก 5 ตัวเลือกที่ใส่ทาง SQL อ่านได้ตามจริง (23:59) — เทสต์ใช้คุมเวลา" || fail "อ่าน 23:59 ไม่ได้"
SETCUT abc
R=$(GETCUT $A)
[ "$(echo "$R" | J '[d.time, d.previous].join("|")')" = "16:00|23:59" ] \
  && pass "ค่าเสีย (abc) ใช้ 16:00 แทน ไม่ทำให้ระบบล่ม" || fail "ค่าเสีย: $R"
R=$(PUTCUT $A '{"time":"16:00"}')
[ "$(echo "$R" | J 'd.time')" = "16:00" ] && [ "$(LATEST)" = "16:00|$A_ID" ] \
  && pass "แอดมินกด 16:00 ทับค่าเสียได้ (แถวใหม่ในฐานข้อมูล)" || fail "ทับค่าเสีย: $R"

echo
echo "═══ คณิตของกฎ (utils/dispatchCutoff.ts — เวลาที่ส่งเข้าไปเอง ไม่ขึ้นกับเวลาที่รัน · 2 พ.ย. 69 เป็นวันจันทร์)"
OUT=$(node_modules/.bin/ts-node --transpile-only -e '
  import { addDays, closedFor, closedRefusal, deadlineOf, firstEnforcedDay, firstOpenDay, grantedFor, pastRelease } from "./src/utils/dispatchCutoff";
  const ok = (c: boolean, m: string, extra = "") => console.log(c ? `PASS ${m}` : `FAIL ${m} ${extra}`);
  const iso = (d: Date) => d.toISOString();
  const at = (s: string) => new Date(s);
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const cfg = (time: string, since = "2026-01-01T00:00:00.000Z") =>
    ({ time, since: at(since), changedAt: null, changedByName: null, previous: null });
  const c16 = cfg("16:00");
  const o = (u: Date | null, isTest = false) => ({ isTest, urgentReleaseFor: u });
  const T3 = at("2026-11-02T03:00:00.000Z");   // จันทร์ 10:00 เวลาไทย
  const T9 = at("2026-11-02T09:00:00.000Z");   // จันทร์ 16:00:00.000 เวลาไทย

  // เส้นตาย (ไม่เปลี่ยนจากเดิม): วันก่อนวันนัด เวลาปิด · ข้ามสิ้นเดือน/ปี
  const mon = deadlineOf("2026-11-02", "16:00");
  ok(iso(mon) === "2026-11-01T09:00:00.000Z" && iso(deadlineOf("2027-01-01", "16:00")) === "2026-12-31T09:00:00.000Z"
     && iso(deadlineOf("2028-03-01", "15:30")) === "2028-02-29T08:30:00.000Z" && addDays("2026-12-31", 1) === "2027-01-01",
     "เส้นตาย: งานวันจันทร์ปิดนัดวันอาทิตย์ 16:00 · ข้ามปี · 29 ก.พ. ปีอธิกสุรทิน", iso(mon));
  ok(closedFor("2026-11-02", c16, T3) && !closedFor("2026-11-03", c16, at("2026-11-02T08:59:59.999Z"))
     && closedFor("2026-11-03", c16, T9) && !closedFor("2026-11-04", c16, T9) && !closedFor("2026-11-04", c16, at("2026-11-02T16:59:00.000Z")),
     "closedFor: วันนี้ปิดตลอด (10:00) · พรุ่งนี้ 15:59:59.999 ยังเปิด 16:00:00.000 ปิด (ไม่มีเวลาผ่อน) · มะรืนเปิด (ถึง 23:59)");
  const late = cfg("16:00", "2026-11-02T10:00:00.000Z");
  ok(!closedFor("2026-11-02", late, at("2026-11-02T12:00:00.000Z")) && !closedFor("2026-11-03", late, at("2026-11-02T12:00:00.000Z"))
     && closedFor("2026-11-04", late, at("2026-11-03T09:00:00.000Z")),
     "เส้นตายก่อนเวลาเริ่มใช้กฎไม่ปิดย้อนหลัง (เปิดกฎ 17:00 → วันนี้/พรุ่งนี้ยังนัดได้) · วันที่เส้นตายหลังเริ่มกฎปิดตามปกติ");
  ok(!closedFor("2026-11-03", cfg("15:30"), at("2026-11-02T08:29:59.999Z")) && closedFor("2026-11-03", cfg("15:30"), at("2026-11-02T08:30:00.000Z")),
     "เวลาปิดตามที่ตั้ง (15:30): 15:29:59.999 เปิด · 15:30 ปิด");
  ok(grantedFor("2026-11-03", o(day("2026-11-03"))) && !grantedFor("2026-11-03", o(day("2026-11-04"))) && !grantedFor("2026-11-03", o(null))
     && grantedFor("2026-11-02", o(at("2026-11-02T17:00:00.000Z"))) && !grantedFor("2026-11-03", o(at("2026-11-02T17:00:00.000Z"))),
     "grantedFor: วันเดียวกันเท่านั้น · urgentReleaseFor ที่ไม่ตรงเที่ยงคืนอ่านวันแบบ UTC (17:00Z ของ 2 พ.ย. = 2 พ.ย. ไม่ใช่ 3 พ.ย. ไทย)");
  const sup0 = closedRefusal("2026-11-02", o(null), c16, T9, "supervisor", false);
  const sup1 = closedRefusal("2026-11-03", o(null), c16, T9, "supervisor", false);
  const adm0 = closedRefusal("2026-11-02", o(null), c16, T9, "admin", false);
  const adm1 = closedRefusal("2026-11-03", o(null), c16, T9, "admin", false);
  ok(JSON.stringify(sup0) === JSON.stringify({ error: "วันนี้นัดไม่ได้ — ต้องให้แอดมินแก้เป็นงานด่วน", code: "DATE_CLOSED", day: "2026-11-02", firstOpen: "2026-11-04" })
     && JSON.stringify(sup1) === JSON.stringify({ error: "เลย 16:00 น. แล้ว — นัดพรุ่งนี้ไม่ได้ เลือกวันใหม่", code: "DATE_CLOSED", day: "2026-11-03", firstOpen: "2026-11-04" })
     && adm0?.error === "วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"
     && adm1?.error === "พรุ่งนี้ปิดนัดแล้ว (เลย 16:00 น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"
     && closedRefusal("2026-11-03", o(null), cfg("15:30"), T9, "supervisor", false)?.error === "เลย 15:30 น. แล้ว — นัดพรุ่งนี้ไม่ได้ เลือกวันใหม่",
     "closedRefusal: ข้อความไทยสี่แบบตรงทุกตัวอักษร (หัวหน้าภาค/แอดมิน × วันนี้/พรุ่งนี้) · เวลาตามที่ตั้ง · code/day/firstOpen", JSON.stringify({ sup0, sup1, adm0, adm1 }));
  ok(closedRefusal("2026-11-03", o(day("2026-11-03")), c16, T9, "supervisor", false) === null
     && closedRefusal("2026-11-03", o(day("2026-11-04")), c16, T9, "supervisor", false)?.code === "DATE_CLOSED"
     && closedRefusal("2026-11-02", o(day("2026-11-03")), c16, T9, "supervisor", false)?.code === "DATE_CLOSED",
     "แอดมินแก้เป็นงานด่วนให้วันไหน = นัดวันนั้นได้ · วันอื่นยังปิด (แก้พรุ่งนี้ไม่ได้เปิดวันนี้)");
  ok(closedRefusal("2026-11-02", o(null, true), c16, T9, "supervisor", false) === null
     && closedRefusal("2026-11-03", o(null), c16, T9, "admin", true) === null
     && closedRefusal("2026-11-03", o(null), c16, T9, "supervisor", true)?.code === "DATE_CLOSED"
     && closedRefusal("2026-11-04", o(null), c16, T9, "supervisor", false) === null,
     "ใบทดสอบไม่ติดกฎ · แอดมินติ๊กแล้วผ่าน · หัวหน้าภาคติ๊กมาไม่มีผล · วันที่เปิดไม่ปฏิเสธ");
  ok(firstOpenDay(c16, T3) === "2026-11-03" && firstOpenDay(c16, T9) === "2026-11-04"
     && firstOpenDay(cfg("16:00", "2026-11-02T02:00:00.000Z"), T3) === "2026-11-02" && firstOpenDay(c16, at("2026-12-31T10:00:00.000Z")) === "2027-01-02",
     "firstOpenDay: ก่อนเวลาปิด = พรุ่งนี้ · หลังเวลาปิด = มะรืน · วันนี้ยังไม่อยู่ใต้กฎ = วันนี้ · 31 ธ.ค. หลังปิด → 2 ม.ค.");
  const pr = (status: string, d: string, isTest = false, c = c16) => pastRelease({ status, isTest, scheduledAt: day(d) }, c, T9);
  ok(pr("ASSIGNED", "2026-11-01") && pr("INSPECT_DISPATCH", "2026-10-31") && !pr("ASSIGNED", "2026-11-02") && !pr("AWAITING_CONFIRM", "2026-11-01")
     && !pr("ASSIGNED", "2026-11-01", true) && !pr("ASSIGNED", "2026-11-01", false, cfg("16:00", "2026-11-01T00:00:00.000Z")),
     "pastRelease (เลยนัด): ขั้นปล่อยงาน/ส่งช่างตรวจที่วันผ่านแล้ว · ไม่ใช่วันนี้ · ไม่ใช่ขั้นอื่น · ไม่ใช่ใบทดสอบ · ไม่ใช่วันก่อนเริ่มใช้กฎ");
  ok(firstEnforcedDay(cfg("16:00", "2026-10-31T21:38:00.000Z")) === "2026-11-02" && firstEnforcedDay(cfg("16:00", "2026-11-01T09:00:00.001Z")) === "2026-11-03",
     "firstEnforcedDay (ขอบล่างของ \"เลยนัด\") ไม่เปลี่ยน: เปิดกฎเช้า → พรุ่งนี้ · เปิดหลังเวลาปิด → มะรืน");
  process.exit(0);
' 2>&1) || true
echo "$OUT"
echo "$OUT" | grep -q '^FAIL' && FAILED=1
[ "$(echo "$OUT" | grep -c '^PASS')" = "11" ] || fail "คณิตของกฎรันไม่ครบ 11 ข้อ: $(echo "$OUT" | grep -v '^PASS' | head -3 | tr '\n' ' ')"

# ════════════════════════════════════════════════════════════════════════════════
# กฎจริงที่เซิร์ฟเวอร์ — คุมเวลาด้วยสองอย่างเท่านั้น: เวลาปิด (แถว AppSetting ห่างจากตอนนี้ไม่เกิน ±5 นาที) และเวลาเริ่มใช้กฎ
# (createdAt ของแถวแรก ถอยไป 30 วันระหว่างรัน — ไม่งั้นวันที่ migration รัน วันนี้ยังไม่อยู่ใต้กฎ ข้อ 14) · คืนทั้งสองอย่างตอนจบ
echo
echo "═══ เตรียมผู้ใช้/ข้อมูลทดสอบ"
SYM="ทดสอบเวลาปิดนัด $SUF"
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAMS=$(DB "select array_to_string(\"supervisedTeams\",',') from \"User\" where \"employeeCode\"='S001'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where \"employeeCode\"='T001'")
SEED_ID=$(DB "select min(id) from \"AppSetting\" where key='dispatchCutoff'")
SEED_AT=$(DB "select to_char(\"createdAt\",'YYYY-MM-DD HH24:MI:SS.MS') from \"AppSetting\" where id=$SEED_ID")
SAVED_USERS=1
REGION=$(DB "select region from \"Branch\" where code='C0006'"); TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
OTEAM=$(DB "select zone from \"Branch\" where code='C0001'")
DB "update \"User\" set region='$REGION', \"supervisedTeams\"='{}' where \"employeeCode\"='S001'" >/dev/null
DB "update \"User\" set team='$TEAM' where \"employeeCode\"='T001'" >/dev/null
# หัวหน้าภาคอีกคน ภาคที่ไม่มีสาขาจริง — ใบในภาคนี้อยู่นอกขอบเขตของคนนี้ (403)
DB "insert into \"User\"(\"employeeCode\",name,role,region,\"passwordHash\",\"mustChangePassword\") values
  ('ZDCO$SUF','หัวหน้าภาคอื่นทดสอบเวลาปิดนัด','SUPERVISOR','ภาคทดสอบ$SUF','$HASH',false)" >/dev/null
S=$(login S001); T=$(login T001); SO=$(login ZDCO$SUF)
S_ID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
S_NAME=$(DB "select name from \"User\" where \"employeeCode\"='S001'")
OS=ZDCOS$SUF
POST $A teams/outsource "{\"name\":\"$OS\"}" >/dev/null
# C0001 อยู่ภาคที่ไม่มีหัวหน้าภาคดูแล = ใบ "ไม่มีคนรับ" (แบบเดียวกับ flow-simplify-test.sh)
[ "$(DB "select count(*) from \"User\" where role='SUPERVISOR' and \"deletedAt\" is null and (region=(select region from \"Branch\" where code='C0001') or '$OTEAM'=any(\"supervisedTeams\"))")" = "0" ] \
  || fail "เตรียมข้อมูล: มีหัวหน้าภาคดูแลภาคของ C0001 — ใบไม่มีคนรับทดสอบไม่ได้"
# ค่าเดิมเก็บเป็นแถว key อื่น (readCutoff อ่านเฉพาะ key='dispatchCutoff' — แถวนี้ไม่มีผลกับแอป) ในคำสั่งเดียวกับที่ถอยเวลา
# ถูกฆ่ากลางทาง (SIGKILL ไม่เรียก trap) รอบถัดไปเจอแถวนี้ → FAIL แล้วคืนค่าจริงให้ · ไม่มีแถวนี้ รอบถัดไปจะจำค่าที่ถอยไว้
# เป็น "ค่าเดิม" แล้วคืนค่าผิดให้ทุกรอบ — วันนี้ของทุกชุดปิดนัดตลอดไปโดยไม่มีชุดไหนบอก
DB "insert into \"AppSetting\" (key,value) values ('$SEED_MARK','$SEED_AT');
    update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') - interval '30 days' where id=$SEED_ID" >/dev/null
GETCUT $A >/dev/null
SINCEISO() { DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"AppSetting\" where id=$SEED_ID"; }
SINCE_PIN=$(SINCEISO)
# เบอร์ทดสอบของ S001 — แถวในกล่อง "ขอนัดด่วน" ของแอดมินขึ้น "หัวหน้าภาค <ชื่อ> <เบอร์>" · จดเบอร์เดิมในคำสั่งเดียวกับที่ตั้ง (ดู PHONE_MARK)
SPHONE="089-$SUF-01"
DB "insert into \"AppSetting\" (key,value) select '$PHONE_MARK', coalesce(phone,'') from \"User\" where \"employeeCode\"='S001';
    update \"User\" set phone='$SPHONE' where \"employeeCode\"='S001'" >/dev/null

day() { node -e "console.log(new Date(Date.now()+7*3600e3+($1)*86400e3).toISOString().slice(0,10))"; }
TODAY=$(day 0); TOMORROW=$(day 1); YESTERDAY=$(day -1); D2=$(day 2); D3=$(day 3)
# เวลาไทย HH:MM ห่างจากตอนนี้ $1 นาที — OPEN = เส้นตายของพรุ่งนี้ยังไม่ถึง · CLOSE = เลยมาแล้ว (วันนี้ปิดเสมอทั้งสองแบบ)
BKK() { node -e "console.log(new Date(Date.now()+7*3600e3+($1)*60e3).toISOString().slice(11,16))"; }
OPEN() { SETCUT "$(BKK 5)"; CUT=$(LATEST | cut -d'|' -f1); }
CLOSE() { SETCUT "$(BKK -2)"; CUT=$(LATEST | cut -d'|' -f1); }
TH_DOW="['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.']"
TH_MON="['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']"
# "อ. 3 พ.ย." (SHORT) · "อ. 3 พ.ย. 69" (VT = visitText ไม่มีเวลา) — ข้อความที่เซิร์ฟเวอร์สร้าง
SHORT() { node -e "const [y,m,d]='$1'.split('-').map(Number); console.log($TH_DOW[new Date(Date.UTC(y,m-1,d)).getUTCDay()]+' '+d+' '+$TH_MON[m-1])"; }
VT() { node -e "const [y,m,d]='$1'.split('-').map(Number); console.log($TH_DOW[new Date(Date.UTC(y,m-1,d)).getUTCDay()]+' '+d+' '+$TH_MON[m-1]+' '+String((y+543)%100).padStart(2,'0'))"; }
# รหัสตอบกลับบรรทัดสุดท้าย เนื้อหาข้างบน — ต้องได้ทั้งสองอย่างจากคำขอเดียว (กดซ้ำ = คนละสถานการณ์)
CALL() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3" -w '\n%{http_code}'; }
code_of() { echo "${1##*$'\n'}"; }
body_of() { echo "${1%$'\n'*}"; }
err_of() { body_of "$1" | J 'd.error||""'; }
# code ในคำตอบ (none = ไม่มีช่อง) — 409 เรื่องสถานะคำขอต้องมี URGENT_ASK_STATE · 409 เรื่องขั้นต้องไม่มี
BCODE() { body_of "$1" | J 'd.code === undefined ? "none" : d.code'; }
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
LIST() { curl -s "localhost:4000/api/work-orders?status=$2" -H "$(H $1)"; }
# แถวของใบ $2 ในรายการที่โหลดไว้ $1 → ค่าของนิพจน์ $3 (r = แถว) · ไม่อยู่ในรายการ = missing
RW() { echo "$1" | J "const r=d.rows.find(w=>w.id===$2); r ? ($3) : 'missing'"; }
DET() { curl -s "localhost:4000/api/work-orders/$2" -H "$(H $1)" | J "$3"; }
ICOUNT() { curl -s localhost:4000/api/work-orders/inbox-count -H "$(H $1)" | J 'd.inbox'; }
VER() { curl -s "localhost:4000/api/work-orders/version?status=INBOX" -H "$(H $1)" | J 'd.version'; }

mk() {  # $1 เครื่อง [$2 สาขา] → ใบใหม่ (ขั้นระบุอะไหล่ NEW)
  POST $A work-orders "{\"branchCode\":\"${2:-C0006}\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYM\"}]}" | J 'd.orders?d.orders[0].id:d.id'
}
toChecked() { POST "${2:-$S}" work-orders/$1/parts '{"needsParts":false}' >/dev/null; }   # → รอนัดวันเข้า (PARTS_CHECKED)
# นัดวันทางใดทางหนึ่ง — $1 คนกด $2 ทาง (parts|inspect|assign) $3 ใบ $4 วัน [$5 ช่องเพิ่ม เช่น ,"urgent":true] [$6 ทีม]
SCHEDCALL() {
  local team="${6:-$TEAM}"
  case "$2" in
    parts) CALL "$1" "work-orders/$3/parts" "{\"needsParts\":false,\"assign\":{\"team\":\"$team\",\"scheduledAt\":\"$4\"$5}}" ;;
    inspect) CALL "$1" "work-orders/$3/inspect-request" "{\"team\":\"$team\",\"scheduledAt\":\"$4\"$5}" ;;
    assign) CALL "$1" "work-orders/$3/assign" "{\"team\":\"$team\",\"scheduledAt\":\"$4\"$5}" ;;
  esac
}
MOVEDAY() { DB "update \"WorkOrder\" set \"scheduledAt\"='$2' where id=$1" >/dev/null; }
# ใบรอคอนเฟิร์มลูกค้าวัน $2 — นัดมะรืน (เปิดเสมอ) แล้วย้ายวันทาง SQL: urgentReleaseFor ว่างจริง ไม่ผ่านงานด่วน
toConfirm() {  # $1 ใบ $2 วัน [$3 ทีม] [$4 คนกด]
  SCHEDCALL "${4:-$S}" parts $1 $D2 "" "${3:-$TEAM}" >/dev/null
  if [ "$2" != "$D2" ]; then MOVEDAY $1 $2; fi
}
rel() { toConfirm "$@"; POST $A work-orders/$1/confirm-appointment '{}' >/dev/null; }   # → รอหัวหน้าภาคปล่อยงาน (ASSIGNED)
insp() {  # $1 ใบ $2 วัน → รอส่งช่างตรวจ (INSPECT_DISPATCH) แบบเดียวกัน: ส่งตรวจมะรืนแล้วย้ายวัน
  SCHEDCALL $S inspect $1 $D2 >/dev/null
  if [ "$2" != "$D2" ]; then MOVEDAY $1 $2; fi
  POST $A work-orders/$1/confirm-appointment '{}' >/dev/null
}
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
SCH() { DB "select coalesce(\"scheduledAt\"::date::text,'-') from \"WorkOrder\" where id=$1"; }
URF() { DB "select coalesce(\"urgentReleaseFor\"::date::text,'-') from \"WorkOrder\" where id=$1"; }
SETURF() { DB "update \"WorkOrder\" set \"urgentReleaseFor\"='$2' where id=$1" >/dev/null; }
NLOG() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2'"; }
NLOGS() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action in ($2)"; }
# ประวัติแถวล่าสุดของ action นี้: note|meta.via|meta.reason|meta.day|ผู้กด|ขั้น
LOGROW() { DB "select coalesce(l.note,'-')||'|'||coalesce(l.meta->>'via','-')||'|'||coalesce(l.meta->>'reason','-')||'|'||coalesce(l.meta->>'day','-')||'|'||coalesce(u.\"employeeCode\",'-')||'|'||l.status from \"WorkOrderLog\" l left join \"User\" u on u.id=l.\"userId\" where l.\"workOrderId\"=$1 and l.action='$2' order by l.id desc limit 1"; }
# meta ของประวัติล่าสุดชนิดนี้: day|note
LOGMETA() { DB "select coalesce(meta->>'day','-')||'|'||coalesce(meta->>'note','-') from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
LOGISO() { DB "select to_char(\"createdAt\",'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2' order by id desc limit 1"; }
# ลำดับประวัติชุดนี้ของใบ ตามเวลา|จำนวนเวลาไม่ซ้ำ (เวลาเท่ากันจะเรียงผิดในทามไลน์)
SEQ() { DB "select string_agg(action, ',' order by \"createdAt\", id)||'|'||count(distinct \"createdAt\") from \"WorkOrderLog\" where \"workOrderId\"=$1 and action in ($2)"; }
# 400 DATE_CLOSED ครบรูป: $1 คำตอบ $2 ข้อความ $3 วัน $4 วันแรกที่นัดได้ — เวลาปิด/เวลาเริ่มใช้กฎในคำตอบตรงกับฐานข้อมูล
CLOSED_OK() {
  [ "$(code_of "$1")" = 400 ] && [ "$(body_of "$1" | J '[d.code, d.error, d.day, d.firstOpen, d.cutoff.time, d.cutoff.since, Math.abs(Date.parse(d.serverNow) - Date.now()) < 60000].join("|")')" = "DATE_CLOSED|$2|$3|$4|$CUT|$SINCE_PIN|true" ]
}
PAST_TEXT="วันนัดย้อนหลังไม่ได้ — นัดได้ตั้งแต่วันนี้ ($(VT $TODAY)) เป็นต้นไป"
SUP_TODAY="วันนี้นัดไม่ได้ — ต้องให้แอดมินแก้เป็นงานด่วน"
ADM_TODAY="วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"
SUP_TMR() { echo "เลย $CUT น. แล้ว — นัดพรุ่งนี้ไม่ได้ เลือกวันใหม่"; }
ADM_TMR() { echo "พรุ่งนี้ปิดนัดแล้ว (เลย $CUT น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก"; }
CODEOF() { DB "select code from \"WorkOrder\" where id=$1"; }
LABEL() { DET $A $1 'd.statusLabel'; }

echo
echo "═══ หัวหน้าภาคนัดวัน: วันนี้ปิดตลอด · พรุ่งนี้ปิดตั้งแต่เวลาปิด · มะรืนเปิด (ทุกฟอร์มที่เลือกวันเข้า — ข้อ 5)"
EP_NAME() { case $1 in parts) echo "ไม่ใช้อะไหล่ — จ่ายงาน (/parts)" ;; inspect) echo "ส่งตรวจ (/inspect-request)" ;; assign) echo "นัดวันเข้า (/assign)" ;; esac; }
EP_FROM() { case $1 in assign) echo PARTS_CHECKED ;; *) echo NEW ;; esac; }
EP_TO() { case $1 in inspect) echo INSPECT_CONFIRM ;; *) echo AWAITING_CONFIRM ;; esac; }
EP_LOGS() { case $1 in parts) echo "'NO_PARTS','ASSIGNED'" ;; inspect) echo "'INSPECT_REQUESTED'" ;; assign) echo "'ASSIGNED'" ;; esac; }
EP_NLOG() { case $1 in parts) echo 2 ;; *) echo 1 ;; esac; }
NEWFOR() { local W; W=$(mk $2); if [ "$1" = assign ]; then toChecked $W; fi; echo $W; }
M=81
for E in parts inspect assign; do
  N=$(EP_NAME $E); F=$(EP_FROM $E); TO=$(EP_TO $E); LG=$(EP_LOGS $E)
  X1=$(NEWFOR $E W$M); X2=$(NEWFOR $E W$((M+1))); X3=$(NEWFOR $E W$((M+2))); M=$((M+3))
  OPEN
  R=$(SCHEDCALL $S $E $X1 $TODAY); MID="$(ST $X1)|$(SCH $X1)|$(NLOGS $X1 "$LG")"
  R2=$(SCHEDCALL $S $E $X1 $TOMORROW)
  if CLOSED_OK "$R" "$SUP_TODAY" $TODAY $TOMORROW && [ "$MID" = "$F|-|0" ] \
    && [ "$(code_of "$R2")" = 200 ] && [ "$(ST $X1)|$(SCH $X1)|$(URF $X1)|$(NLOGS $X1 "$LG")" = "$TO|$TOMORROW|-|$(EP_NLOG $E)" ]; then
    pass "$N วันนี้ → 400 DATE_CLOSED \"$SUP_TODAY\" (firstOpen=พรุ่งนี้ · serverNow/cutoff ในคำตอบ) ใบยัง $F ไม่มีวันนัด ไม่มีประวัติ · ก่อนเวลาปิด ($CUT) นัดพรุ่งนี้ได้ → $TO (ฐานข้อมูล)"
  else fail "$N วันนี้/พรุ่งนี้ก่อนปิด: $(code_of "$R") $(body_of "$R") · กลาง $MID · $(code_of "$R2") $(err_of "$R2") · $(ST $X1) $(SCH $X1)"; fi
  CLOSE
  R=$(SCHEDCALL $S $E $X2 $TOMORROW); MID="$(ST $X2)|$(SCH $X2)|$(NLOGS $X2 "$LG")"
  R2=$(SCHEDCALL $S $E $X2 $D2)
  if CLOSED_OK "$R" "$(SUP_TMR)" $TOMORROW $D2 && [ "$MID" = "$F|-|0" ] \
    && [ "$(code_of "$R2")" = 200 ] && [ "$(ST $X2)|$(SCH $X2)" = "$TO|$D2" ]; then
    pass "$N หลังเวลาปิด ($CUT) พรุ่งนี้ → 400 \"$(SUP_TMR)\" firstOpen=มะรืน · ใบไม่ขยับ · เลือกมะรืนแทนได้ทันที → $TO (ฐานข้อมูล)"
  else fail "$N พรุ่งนี้หลังปิด: $(code_of "$R") $(body_of "$R") · กลาง $MID · $(code_of "$R2") $(err_of "$R2") · $(ST $X2) $(SCH $X2)"; fi
  R=$(SCHEDCALL $S $E $X3 $TOMORROW ',"urgent":true')
  R2=$(SCHEDCALL $S $E $X3 $YESTERDAY ',"urgent":true')
  if CLOSED_OK "$R" "$(SUP_TMR)" $TOMORROW $D2 && [ "$(err_of "$R2")|$(BCODE "$R2")|$(code_of "$R2")" = "$PAST_TEXT|none|400" ] \
    && [ "$(ST $X3)|$(SCH $X3)|$(URF $X3)|$(NLOG $X3 URGENT_RELEASE)" = "$F|-|-|0" ]; then
    pass "$N หัวหน้าภาคส่ง urgent:true มาเองไม่มีผล (ยัง 400 · ไม่มีงานด่วน ไม่มีประวัติ) · เมื่อวาน → \"วันนัดย้อนหลังไม่ได้…\" (เช็คก่อนเวลาปิด ไม่มี code) (ฐานข้อมูล)"
  else fail "$N urgent ของหัวหน้าภาค/ย้อนหลัง: $(code_of "$R") $(body_of "$R") · $(code_of "$R2") $(body_of "$R2") · $(ST $X3) $(URF $X3)"; fi
done

CLOSE
XR=$(mk W90); XTC=$(POST $A work-orders/$XR/test-copy '{}' | J 'd.id')
R=$(SCHEDCALL $S parts $XTC $TODAY); R2=$(SCHEDCALL $S parts $XR $TODAY)
[ "$(code_of "$R")" = 200 ] && [ "$(DB "select \"isTest\"::text||'|'||status||'|'||\"scheduledAt\"::date||'|'||coalesce(\"urgentReleaseFor\"::text,'-') from \"WorkOrder\" where id=$XTC")" = "true|AWAITING_CONFIRM|$TODAY|-" ] \
  && CLOSED_OK "$R2" "$SUP_TODAY" $TODAY $D2 && [ "$(ST $XR)" = NEW ] \
  && pass "ใบทดสอบ (คัดลอกที่ขั้น NEW) หัวหน้าภาคนัดวันนี้ได้ ไม่มีงานด่วน · ใบจริงต้นฉบับวันเดียวกัน 400 (ข้อ 15 · ฐานข้อมูล)" \
  || fail "ใบทดสอบนัดวันนี้: $(code_of "$R") $(err_of "$R") · ต้นฉบับ $(code_of "$R2") $(err_of "$R2")"
# อ่านเวลาปิดสด: GET ตั้งค่าตอนเปิด (ค่าที่จำไว้ 30 วิ = เปิด) แล้วใส่แถว "ปิด" ทาง SQL โดยไม่เรียก GET — ปุ่มนัดวันต้องเห็นทันที
OPEN
XF=$(mk W91); toChecked $XF
DB "insert into \"AppSetting\" (key,value) values ('dispatchCutoff','$(BKK -2)')" >/dev/null; CUT=$(LATEST | cut -d'|' -f1)
R=$(SCHEDCALL $S assign $XF $TOMORROW)
CLOSED_OK "$R" "$(SUP_TMR)" $TOMORROW $D2 && [ "$(ST $XF)" = PARTS_CHECKED ] \
  && pass "ปุ่มนัดวันอ่านเวลาปิดสด (ไม่ใช้ค่าที่จำไว้ 30 วิ): เปลี่ยนเป็น $CUT ทาง SQL โดยไม่มี GET → นัดพรุ่งนี้ 400 ทันที (ฐานข้อมูล)" \
  || fail "อ่านเวลาปิดสด: $(code_of "$R") $(err_of "$R")"
GETCUT $A >/dev/null
# เวลาเริ่มใช้กฎ = ตอนนี้ → เส้นตายของวันนี้/พรุ่งนี้อยู่ก่อนเริ่มกฎ ต้องนัดได้ (ข้อ 14 — ข้อนี้ FAIL ถ้าเซิร์ฟเวอร์ไม่ดู since)
# XS3 นัดพรุ่งนี้อีกใบหลังคืน since เป็น 30 วันก่อน ต้อง 400 ในบรรทัดเดียวกัน — "นัดได้ 200" อย่างเดียวผ่านบนโค้ด PR #165
# ด้วย (ตอนนั้นการนัดวันไม่มีกฎ) จึงพิสูจน์อะไรไม่ได้ ต้องเห็นทั้ง since ใหม่เปิดวัน และ since ปกติปิดวันเดียวกัน
XS1=$(mk W92); XS2=$(mk W93); toChecked $XS2; XS3=$(mk W117); toChecked $XS3
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') where id=$SEED_ID" >/dev/null
CLOSE
R=$(SCHEDCALL $S parts $XS1 $TODAY); R2=$(SCHEDCALL $S assign $XS2 $TOMORROW)
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') - interval '30 days' where id=$SEED_ID" >/dev/null
GETCUT $A >/dev/null; SINCE_PIN=$(SINCEISO)
R3=$(SCHEDCALL $S assign $XS3 $TOMORROW)
[ "$(code_of "$R")|$(code_of "$R2")" = "200|200" ] && [ "$(ST $XS1)|$(SCH $XS1)|$(ST $XS2)|$(SCH $XS2)" = "AWAITING_CONFIRM|$TODAY|AWAITING_CONFIRM|$TOMORROW" ] \
  && CLOSED_OK "$R3" "$(SUP_TMR)" $TOMORROW $D2 && [ "$(ST $XS3)|$(SCH $XS3)" = "PARTS_CHECKED|-" ] \
  && pass "เวลาเริ่มใช้กฎเพิ่งเริ่ม (ฐานใหม่/วัน deploy): วันนี้และพรุ่งนี้หลังเวลาปิดยังนัดได้ — ไม่ปิดย้อนหลัง · คืน since เป็น 30 วันก่อน พรุ่งนี้ 400 ทันที (ข้อ 14 · ฐานข้อมูล)" \
  || fail "since: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(err_of "$R2") · since ปกติ $(code_of "$R3") $(err_of "$R3") $(ST $XS3) $(SCH $XS3)"

echo
echo "═══ แอดมินกดแทนที่ขั้นนัดวัน: วันที่ปิดต้องติ๊ก \"แก้เป็นงานด่วนไปพร้อมกัน\" (ข้อ 2 · 4)"
CLOSE
AP=$(mk W94)
R=$(SCHEDCALL $A parts $AP $TODAY); MID="$(ST $AP)|$(SCH $AP)"
R2=$(SCHEDCALL $A parts $AP $TODAY ',"urgent":true')
CLOSED_OK "$R" "$ADM_TODAY" $TODAY $D2 && [ "$MID" = "NEW|-" ] && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $AP)|$(SCH $AP)|$(URF $AP)" = "AWAITING_CONFIRM|$TODAY|$TODAY" ] \
  && [ "$(SEQ $AP "'NO_PARTS','ASSIGNED','URGENT_RELEASE'")" = "NO_PARTS,ASSIGNED,URGENT_RELEASE|3" ] \
  && [ "$(LOGROW $AP URGENT_RELEASE)" = "ตอนนัดวันแทนหัวหน้าภาค · ไม่ได้ใส่เหตุผล · นัด $(VT $TODAY)|schedule|-|$TODAY|A001|AWAITING_CONFIRM" ] \
  && pass "แอดมิน /parts จ่ายงานวันนี้: ไม่ติ๊ก → 400 \"$ADM_TODAY\" · ติ๊ก → 200 urgentReleaseFor=วันนี้ ประวัติ ไม่ใช้อะไหล่→จ่ายงาน→แก้เป็นงานด่วน เวลาไม่ซ้ำ via=schedule (ฐานข้อมูล)" \
  || fail "แอดมิน /parts วันนี้: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(err_of "$R2") · $(SEQ $AP "'NO_PARTS','ASSIGNED','URGENT_RELEASE'") · $(LOGROW $AP URGENT_RELEASE)"
AI=$(mk W95)
R=$(SCHEDCALL $A inspect $AI $TOMORROW)
R2=$(SCHEDCALL $A inspect $AI $TOMORROW ',"urgent":true,"note":"ร้านต้องการพรุ่งนี้"')
CLOSED_OK "$R" "$(ADM_TMR)" $TOMORROW $D2 && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $AI)|$(SCH $AI)|$(URF $AI)" = "INSPECT_CONFIRM|$TOMORROW|$TOMORROW" ] \
  && [ "$(SEQ $AI "'INSPECT_REQUESTED','URGENT_RELEASE'")" = "INSPECT_REQUESTED,URGENT_RELEASE|2" ] \
  && [ "$(LOGROW $AI URGENT_RELEASE)" = "ตอนนัดวันแทนหัวหน้าภาค · ร้านต้องการพรุ่งนี้ · นัด $(VT $TOMORROW)|schedule|ร้านต้องการพรุ่งนี้|$TOMORROW|A001|INSPECT_CONFIRM" ] \
  && pass "แอดมินส่งตรวจพรุ่งนี้หลังเวลาปิด: ไม่ติ๊ก → 400 \"$(ADM_TMR)\" · ติ๊ก → ส่งตรวจ + แก้เป็นงานด่วน (เหตุผล = หมายเหตุในฟอร์ม · ฐานข้อมูล)" \
  || fail "แอดมิน /inspect-request: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(err_of "$R2") · $(LOGROW $AI URGENT_RELEASE)"
AA=$(mk W96); toChecked $AA
R=$(SCHEDCALL $A assign $AA $TODAY ',"urgent":true')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $AA)|$(SCH $AA)|$(URF $AA)" = "AWAITING_CONFIRM|$TODAY|$TODAY" ] \
  && [ "$(SEQ $AA "'ASSIGNED','URGENT_RELEASE'")" = "ASSIGNED,URGENT_RELEASE|2" ] && [ "$(LOGROW $AA URGENT_RELEASE | cut -d'|' -f2,4)" = "schedule|$TODAY" ] \
  && pass "แอดมิน /assign นัดวันนี้ + ติ๊ก → นัดได้ urgentReleaseFor=วันนี้ ประวัติ จ่ายงาน→แก้เป็นงานด่วน (ฐานข้อมูล)" \
  || fail "แอดมิน /assign วันนี้: $(code_of "$R") $(err_of "$R") · $(SEQ $AA "'ASSIGNED','URGENT_RELEASE'")"
AO=$(mk W97); toChecked $AO
R=$(SCHEDCALL $A assign $AO $TODAY); R2=$(SCHEDCALL $A assign $AO $D2 ',"urgent":true')
CLOSED_OK "$R" "$ADM_TODAY" $TODAY $D2 && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $AO)|$(SCH $AO)|$(URF $AO)|$(NLOG $AO URGENT_RELEASE)" = "AWAITING_CONFIRM|$D2|-|0" ] \
  && pass "แอดมินนัดวันนี้ไม่ติ๊ก → 400 · ติ๊กบนวันที่ยังเปิด (มะรืน) → ไม่สนใจ: ไม่ตั้งงานด่วน ไม่ลงประวัติ (ฐานข้อมูล)" \
  || fail "แอดมินติ๊กวันเปิด: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") · $(URF $AO) $(NLOG $AO URGENT_RELEASE)"

echo
echo "═══ คำขอนัดด่วน: หัวหน้าภาคขอ · ยกเลิก · แอดมินตอบ (ข้อ 2 · 3)"
Q1=$(mk W98); toChecked $Q1
Q2=$(mk W99); toChecked $Q2
QA=$(mk W100); rel $QA $D2
QT=$(POST $A work-orders/$(mk W101)/test-copy '{}' | J 'd.id')
[ "$(ST $Q1) $(ST $Q2) $(ST $QA) $(ST $QT) $(DB "select \"isTest\" from \"WorkOrder\" where id=$QT")" = "PARTS_CHECKED PARTS_CHECKED ASSIGNED NEW t" ] \
  || fail "เตรียมใบคำขอ: $(ST $Q1) $(ST $Q2) $(ST $QA) $(ST $QT)"
Q1C=$(CODEOF $Q1); QAC=$(CODEOF $QA)
REQ() { CALL $1 work-orders/$2/urgent-request "$3"; }
R=$(REQ $S $QA "{\"day\":\"$TOMORROW\"}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|none" ] \
  && [ "$(err_of "$R")" = "$QAC อยู่ขั้น \"$(LABEL $QA)\" — ขอแก้เป็นงานด่วนได้เฉพาะตอนนัดวัน (นัดวันเข้า / ไม่ใช้อะไหล่จ่ายงาน / ส่งตรวจ)" ] \
  && [ "$(NLOG $QA URGENT_REQUESTED)" = 0 ] \
  && pass "ขอนัดด่วนที่ขั้นรอปล่อยงาน → 409 ข้อความขั้น (ไม่มี code — ขั้นเปลี่ยนจริง แอปปิดฟอร์มตามเดิม) ไม่มีประวัติ (ฐานข้อมูล)" \
  || fail "ขอที่ขั้นปล่อยงาน: $(code_of "$R") $(body_of "$R")"
OPEN
R=$(REQ $S $Q1 "{\"day\":\"$TOMORROW\"}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R")" = "$Q1C ยังนัด $(SHORT $TOMORROW) ได้ — ไม่ต้องขอแอดมิน" ] \
  && [ "$(NLOG $Q1 URGENT_REQUESTED)" = 0 ] \
  && pass "ก่อนเวลาปิด ($CUT) ขอพรุ่งนี้ → 409 URGENT_ASK_STATE \"ยังนัด … ได้ — ไม่ต้องขอแอดมิน\" ไม่มีประวัติ (ฐานข้อมูล)" \
  || fail "ขอตอนยังเปิด: $(code_of "$R") $(body_of "$R")"
CLOSE
SINCE0=$(RW "$(LIST $S ACTIVE)" $Q1 'r.stageSince'); IC0=$(ICOUNT $A)
R=$(REQ $S $Q1 "{\"day\":\"$TOMORROW\",\"note\":\"ร้านปิดมะรืน\"}")
[ "$(code_of "$R")" = 200 ] && [ "$(ST $Q1)" = PARTS_CHECKED ] && [ "$(NLOG $Q1 URGENT_REQUESTED)" = 1 ] \
  && [ "$(LOGROW $Q1 URGENT_REQUESTED | cut -d'|' -f1,4,5,6)" = "ร้านต้องการ $(VT $TOMORROW) — ร้านปิดมะรืน|$TOMORROW|S001|PARTS_CHECKED" ] \
  && [ "$(LOGMETA $Q1 URGENT_REQUESTED)" = "$TOMORROW|ร้านปิดมะรืน" ] \
  && [ "$(RW "$(LIST $S ACTIVE)" $Q1 'r.stageSince')" = "$SINCE0" ] \
  && pass "หลังเวลาปิด ($CUT) ขอพรุ่งนี้ → 200 ประวัติ \"ร้านต้องการ <วัน> — <ข้อความ>\" meta.day/note · ใบอยู่ขั้นเดิม \"ค้างขั้นนี้มา\" ไม่เริ่มนับใหม่ (ฐานข้อมูล)" \
  || fail "ขอนัดด่วน: $(code_of "$R") $(err_of "$R") · $(ST $Q1) · $(LOGROW $Q1 URGENT_REQUESTED) · $(LOGMETA $Q1 URGENT_REQUESTED)"
R=$(REQ $S $Q1 "{\"day\":\"$TOMORROW\"}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R")" = "ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน" ] && [ "$(NLOG $Q1 URGENT_REQUESTED)" = 1 ] \
  && pass "ขอซ้ำระหว่างรอ → 409 URGENT_ASK_STATE \"ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน\" ประวัติไม่ซ้ำ (ฐานข้อมูล)" || fail "ขอซ้ำ: $(code_of "$R") $(body_of "$R")"
R1=$(REQ $S $Q2 '{}'); R2=$(REQ $S $Q2 "{\"day\":\"$YESTERDAY\"}")
LONG=$(node -e 'console.log("ก".repeat(301))')
R3=$(REQ $S $Q2 "{\"day\":\"$TOMORROW\",\"note\":\"$LONG\"}"); R4=$(REQ $S $QT "{\"day\":\"$TODAY\"}")
GOT="$(code_of "$R1") $(err_of "$R1") · $(code_of "$R2") $(err_of "$R2") · $(code_of "$R3") $(err_of "$R3") · $(code_of "$R4") $(err_of "$R4")"
[ "$GOT" = "400 ต้องระบุวันที่ร้านต้องการ · 400 $PAST_TEXT · 400 ข้อความยาวได้ไม่เกิน 300 ตัวอักษร · 400 ใบทดสอบไม่ติดเวลาปิดนัด — นัดวันไหนก็ได้" ] \
  && [ "$(NLOG $Q2 URGENT_REQUESTED)|$(NLOG $QT URGENT_REQUESTED)" = "0|0" ] \
  && pass "ไม่ระบุวัน · วันย้อนหลัง · ข้อความเกิน 300 · ใบทดสอบ → 400 ข้อความไทยตรงทุกตัว ไม่มีประวัติ (ฐานข้อมูล)" || fail "ขอไม่ถูกต้อง: $GOT"
GOT=""; for who in T AR PA VA SO; do GOT="$GOT $(PC ${!who} work-orders/$Q2/urgent-request "{\"day\":\"$TOMORROW\"}")"; done
R=$(REQ $T $Q2 "{\"day\":\"$TOMORROW\"}")
[ "$GOT" = " 403 403 403 403 403" ] && [ "$(err_of "$R")" = "ขอแก้เป็นงานด่วนได้เฉพาะหัวหน้าภาค — แอดมินกด “แก้เป็นงานด่วน” ได้เลย" ] && [ "$(NLOG $Q2 URGENT_REQUESTED)" = 0 ] \
  && pass "ช่าง · ทีม Area · Admin Spare Part · ดูในฐานะหัวหน้าภาค · หัวหน้าภาคต่างภาค ขอไม่ได้ (403) ไม่มีประวัติ (ฐานข้อมูล)" || fail "สิทธิ์ขอ:$GOT · $(err_of "$R")"
ASKJ="{\"day\":\"$TOMORROW\",\"at\":\"$(LOGISO $Q1 URGENT_REQUESTED)\",\"note\":\"ร้านปิดมะรืน\",\"byName\":\"$S_NAME\"}"
LAI=$(LIST $A INBOX)
[ "$(ICOUNT $A)" = "$((IC0 + 1))" ] && [ "$(RW "$LAI" $Q1 'JSON.stringify(r.urgentAsk)')" = "$ASKJ" ] \
  && [ "$(echo "$LAI" | J "d.rows.find(w=>w.id===$Q1).waitingOnSupervisors.some(s=>s.name==='$S_NAME' && s.phone==='$SPHONE')")" = true ] \
  && [ "$(DET $A $Q1 'JSON.stringify(d.urgentAsk)')" = "$ASKJ" ] \
  && pass "กล่องงานแอดมิน: ตัวเลข +1 ($IC0 → $((IC0 + 1))) · แถวมี urgentAsk {วัน · เวลา = ประวัติ · ข้อความ · ชื่อหัวหน้าภาค} + เบอร์หัวหน้าภาค · หน้าใบงานเหมือนกัน (ฐานข้อมูล)" \
  || fail "กล่องแอดมิน: $(ICOUNT $A) (เดิม $IC0) · $(RW "$LAI" $Q1 'JSON.stringify(r.urgentAsk)') ≠ $ASKJ"
LS=$(LIST $S INBOX)
[ "$(RW "$LS" $Q1 'JSON.stringify(r.urgentAsk)')" = "$ASKJ" ] && [ "$(DET $S $Q1 'JSON.stringify(d.urgentAsk)')" = "$ASKJ" ] \
  && [ "$(RW "$LS" $Q1 '!r.waitingOnSupervisors.some(s=>"phone" in s)')" = true ] && [ "$(RW "$LS" $Q2 'String(r.urgentAsk)')" = null ] \
  && pass "หัวหน้าภาค: แถวในกล่องและหน้าใบงานมี urgentAsk เดียวกัน (ชิป \"ขอนัดด่วน … แล้ว · รอแอดมิน\") · ไม่มีเบอร์ · ใบที่ไม่ได้ขอ = null" \
  || fail "urgentAsk หัวหน้าภาค: $(RW "$LS" $Q1 'JSON.stringify(r.urgentAsk)')"
R=$(CALL $S work-orders/$Q1/urgent-request/cancel '{}'); R2=$(CALL $S work-orders/$Q1/urgent-request/cancel '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(LOGMETA $Q1 URGENT_REQUEST_CANCELLED)" = "$TOMORROW|-" ] && [ "$(ICOUNT $A)" = "$IC0" ] \
  && [ "$(RW "$(LIST $A INBOX)" $Q1 'true')" = missing ] && [ "$(DET $S $Q1 'String(d.urgentAsk)')" = null ] \
  && [ "$(code_of "$R2")|$(BCODE "$R2")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R2")" = "ไม่มีคำขอที่รอแอดมินแล้ว — แอดมินอาจแก้เป็นงานด่วนหรือตอบไปแล้ว" ] \
  && [ "$(NLOG $Q1 URGENT_REQUEST_CANCELLED)" = 1 ] \
  && pass "ยกเลิกคำขอ → ประวัติ meta.day · ออกจากกล่องแอดมิน (ตัวเลขกลับ $IC0) · ยกเลิกซ้ำ → 409 URGENT_ASK_STATE ข้อความใหม่ (ไม่มี \"ลองรีเฟรช\") (ฐานข้อมูล)" \
  || fail "ยกเลิก: $(code_of "$R") $(err_of "$R") · $(ICOUNT $A) · $(code_of "$R2") $(body_of "$R2")"
REQ $S $Q1 "{\"day\":\"$TOMORROW\"}" >/dev/null
R1=$(CALL $S work-orders/$Q1/urgent-request/answer '{"note":"ร้านรอได้"}'); R2=$(CALL $A work-orders/$Q1/urgent-request/answer '{"note":"  "}')
R=$(CALL $A work-orders/$Q1/urgent-request/answer '{"note":"ร้านรอได้ถึงมะรืน"}'); R3=$(CALL $A work-orders/$Q1/urgent-request/answer '{"note":"ซ้ำ"}')
ANSJ="{\"day\":\"$TOMORROW\",\"at\":\"$(LOGISO $Q1 URGENT_REQUEST_ANSWERED)\",\"note\":\"ร้านรอได้ถึงมะรืน\",\"byName\":\"$A_NAME\"}"
[ "$(code_of "$R1") $(err_of "$R1")" = "403 ตอบคำขอนัดด่วนได้เฉพาะแอดมิน" ] && [ "$(code_of "$R2") $(err_of "$R2")" = "400 ต้องบอกหัวหน้าภาคว่าทำไม เช่น ร้านรอได้ถึงมะรืน" ] \
  && [ "$(code_of "$R")" = 200 ] && [ "$(NLOG $Q1 URGENT_REQUEST_ANSWERED)" = 1 ] && [ "$(ST $Q1)" = PARTS_CHECKED ] \
  && [ "$(LOGROW $Q1 URGENT_REQUEST_ANSWERED | cut -d'|' -f1,5)" = "ร้านรอได้ถึงมะรืน · คำขอนัด $(VT $TOMORROW)|A001" ] && [ "$(LOGMETA $Q1 URGENT_REQUEST_ANSWERED)" = "$TOMORROW|ร้านรอได้ถึงมะรืน" ] \
  && [ "$(ICOUNT $A)" = "$IC0" ] && [ "$(DET $S $Q1 'JSON.stringify(d.urgentAnswer)')" = "$ANSJ" ] && [ "$(DET $S $Q1 'String(d.urgentAsk)')" = null ] \
  && [ "$(code_of "$R3")|$(BCODE "$R3")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R3")" = "ไม่มีคำขอนัดด่วนที่รออยู่แล้ว — หัวหน้าภาคอาจยกเลิกหรือนัดวันอื่นไปแล้ว" ] \
  && pass "แอดมินตอบคำขอ: หัวหน้าภาคตอบเองไม่ได้ (403) · ข้อความว่าง 400 · ตอบแล้วคำขอปิด (กล่องกลับ $IC0) หัวหน้าภาคเห็น urgentAnswer · ตอบซ้ำ 409 URGENT_ASK_STATE (ฐานข้อมูล)" \
  || fail "ตอบคำขอ: $(code_of "$R1") $(err_of "$R1") · $(code_of "$R2") $(err_of "$R2") · $(code_of "$R") $(err_of "$R") · $(DET $S $Q1 'JSON.stringify(d.urgentAnswer)') · $(code_of "$R3") $(body_of "$R3")"
# แอดมินอีกคนกด "แก้เป็นงานด่วน" จากการ์ดที่โหลดไว้ก่อนคำตอบ (แอปส่ง fromAsk + วันที่ขอ) — คำขอจบแล้ว ต้องไม่แก้ทับคำตอบเงียบ ๆ
# (CLOSE อยู่: ถ้าเซิร์ฟเวอร์ไม่ดู fromAsk พรุ่งนี้เลยเส้นตายแล้ว จะได้ 200 + urgentReleaseFor)
R=$(CALL $A work-orders/$Q1/urgent-release "{\"day\":\"$TOMORROW\",\"fromAsk\":true}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|URGENT_ASK_STATE" ] \
  && [ "$(err_of "$R")" = "$Q1C ไม่มีคำขอนัดด่วน $(SHORT $TOMORROW) ที่รออยู่แล้ว — แอดมินอีกคนอาจตอบไปแล้วหรือหัวหน้าภาคยกเลิกคำขอ" ] \
  && [ "$(URF $Q1)|$(NLOG $Q1 URGENT_RELEASE)" = "-|0" ] && [ "$(DET $S $Q1 'd.urgentAnswer && d.urgentAnswer.note')" = "ร้านรอได้ถึงมะรืน" ] \
  && pass "แก้เป็นงานด่วนจากการ์ดเก่า (fromAsk) หลังแอดมินอีกคนตอบแล้ว → 409 URGENT_ASK_STATE \"ไม่มีคำขอนัดด่วน … ที่รออยู่แล้ว\" · ไม่ตั้งงานด่วน คำตอบยังอยู่ (ฐานข้อมูล)" \
  || fail "แก้ทับคำตอบ: $(code_of "$R") $(body_of "$R") · $(URF $Q1) · URGENT_RELEASE $(NLOG $Q1 URGENT_RELEASE)"
[ "$(RW "$(LIST $S INBOX)" $Q1 '"urgentAnswer" in r')" = false ] \
  && pass "urgentAnswer อยู่เฉพาะหน้าใบงาน — แถวในรายการไม่มีช่องนี้" || fail "urgentAnswer หลุดเข้ารายการ"
# วันที่ขอผ่านไปแล้ว = คำขอตาย: ไม่อยู่ในกล่อง และขอใหม่ได้ · คำตอบของวันที่ผ่านไปแล้วไม่ค้างในฟอร์ม
R=$(REQ $S $Q1 "{\"day\":\"$TOMORROW\"}")
DB "update \"WorkOrderLog\" set meta=jsonb_set(meta,'{day}','\"$YESTERDAY\"') where id=(select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$Q1 and action='URGENT_REQUESTED')" >/dev/null
GOT="$(code_of "$R") · $(DET $S $Q1 'String(d.urgentAnswer)') · กล่อง $(RW "$(LIST $A INBOX)" $Q1 'true') · $(ICOUNT $A) · $(DET $A $Q1 'String(d.urgentAsk)')"
R2=$(REQ $S $Q1 "{\"day\":\"$TOMORROW\"}")
[ "$GOT" = "200 · null · กล่อง missing · $IC0 · null" ] && [ "$(code_of "$R2")" = 200 ] && [ "$(ICOUNT $A)" = "$((IC0 + 1))" ] \
  && pass "ขอใหม่หลังแอดมินตอบได้ (คำตอบเก่าหายจากฟอร์ม) · คำขอที่วันผ่านไปแล้ว (meta.day = เมื่อวานทาง SQL) ไม่อยู่ในกล่อง/ไม่นับ และขอใหม่ได้ (ฐานข้อมูล)" \
  || fail "คำขอวันผ่าน: $GOT · ขอใหม่ $(code_of "$R2") $(err_of "$R2")"
CALL $A work-orders/$Q1/urgent-request/answer '{"note":"ทีมพรุ่งนี้เต็ม"}' >/dev/null
A1=$(DET $S $Q1 'd.urgentAnswer && d.urgentAnswer.note')
DB "update \"WorkOrderLog\" set meta=jsonb_set(meta,'{day}','\"$YESTERDAY\"') where id=(select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$Q1 and action='URGENT_REQUEST_ANSWERED')" >/dev/null
[ "$A1" = "ทีมพรุ่งนี้เต็ม" ] && [ "$(DET $S $Q1 'String(d.urgentAnswer)')" = null ] \
  && pass "คำตอบของแอดมินที่วันที่ขอผ่านไปแล้ว (meta.day = เมื่อวาน) → หน้าใบงานไม่ส่ง urgentAnswer (ไม่ค้างในฟอร์มนัดวัน)" || fail "คำตอบวันผ่าน: $A1 · $(DET $S $Q1 'JSON.stringify(d.urgentAnswer)')"
# วันนี้ขอได้ทุกเวลา (ข้อ 3 — วันนี้ปิดตลอด) · คำขอทีละหนึ่งต่อใบ
OPEN
R=$(REQ $S $Q2 "{\"day\":\"$TODAY\"}")
CLOSE
R2=$(REQ $S $Q2 "{\"day\":\"$TOMORROW\"}")
GOT="$(code_of "$R") · $(LOGMETA $Q2 URGENT_REQUESTED) · $(RW "$(LIST $A INBOX)" $Q2 'r.urgentAsk && r.urgentAsk.day') · $(code_of "$R2") $(BCODE "$R2") $(err_of "$R2")"
R3=$(CALL $S work-orders/$Q2/urgent-request/cancel '{}')
[ "$GOT" = "200 · $TODAY|- · $TODAY · 409 URGENT_ASK_STATE ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน" ] && [ "$(code_of "$R3")" = 200 ] && [ "$(NLOG $Q2 URGENT_REQUESTED)" = 1 ] \
  && pass "ขอวันนี้ได้แม้ยังไม่ถึงเวลาปิด (วันนี้ปิดตลอด) → meta.day=วันนี้ ขึ้นกล่องแอดมิน · ขอพรุ่งนี้ซ้อนระหว่างรอ → 409 ส่งคำขอแล้ว · ยกเลิกได้ (ฐานข้อมูล)" \
  || fail "ขอวันนี้: $GOT · ยกเลิก $(code_of "$R3")"

echo
echo "═══ แอดมินแก้เป็นงานด่วน (POST /urgent-release) — ให้นัดวันที่ปิดแล้วได้ เฉพาะใบนี้ วันนั้น"
CLOSE
G1=$(mk W102); toChecked $G1; REQ $S $G1 "{\"day\":\"$TOMORROW\"}" >/dev/null
G2=$(mk W103); toChecked $G2
G3=$(mk W104); toChecked $G3
GA=$(mk W105); rel $GA $D2
GT=$(POST $A work-orders/$(mk W106)/test-copy '{}' | J 'd.id')
G1C=$(CODEOF $G1); G2C=$(CODEOF $G2); G3C=$(CODEOF $G3); GAC=$(CODEOF $GA)
IC1=$(ICOUNT $A)
R=$(CALL $S work-orders/$G1/urgent-release '{}'); R2=$(CALL $T work-orders/$G1/urgent-release '{}')
[ "$(code_of "$R") $(err_of "$R")" = "403 แก้เป็นงานด่วนได้เฉพาะแอดมิน — หัวหน้าภาคกด “ร้านต้องการพรุ่งนี้จริง — ขอแอดมินแก้เป็นงานด่วน” ใต้ปฏิทินในฟอร์มนัดวัน" ] \
  && [ "$(code_of "$R2")" = 403 ] && [ "$(URF $G1)|$(NLOG $G1 URGENT_RELEASE)" = "-|0" ] \
  && pass "หัวหน้าภาค/ช่างกดแก้เป็นงานด่วนไม่ได้ (403 บอกทางใต้ปฏิทิน) ฐานข้อมูลไม่เปลี่ยน" || fail "สิทธิ์แก้เป็นงานด่วน: $(code_of "$R") $(err_of "$R") · $(code_of "$R2")"
R=$(CALL $A work-orders/$G1/urgent-release '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $G1)|$(URF $G1)" = "PARTS_CHECKED|$TOMORROW" ] \
  && [ "$(LOGROW $G1 URGENT_RELEASE)" = "ให้นัดหลังเวลาปิดได้ · ไม่ได้ใส่เหตุผล · นัด $(VT $TOMORROW)|direct|-|$TOMORROW|A001|PARTS_CHECKED" ] \
  && [ "$(ICOUNT $A)" = "$((IC1 - 1))" ] && [ "$(RW "$(LIST $A INBOX)" $G1 'true')" = missing ] && [ "$(DET $S $G1 '[String(d.urgentAsk), d.urgentReleaseFor].join("|")')" = "null|$TOMORROW" ] \
  && pass "แก้เป็นงานด่วนไม่ส่งวัน = ใช้วันที่ขอ → urgentReleaseFor=พรุ่งนี้ ใบอยู่ขั้นเดิม ประวัติ via=direct · คำขอปิด ออกจากกล่อง (ฐานข้อมูล)" \
  || fail "แก้เป็นงานด่วนตามคำขอ: $(code_of "$R") $(err_of "$R") · $(URF $G1) · $(LOGROW $G1 URGENT_RELEASE) · $(ICOUNT $A)/$IC1"
R=$(CALL $A work-orders/$G1/urgent-release "{\"day\":\"$TOMORROW\"}"); R2=$(CALL $A work-orders/$G2/urgent-release '{}')
[ "$(code_of "$R")|$(BCODE "$R")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R")" = "$G1C แก้เป็นงานด่วนให้ $(SHORT $TOMORROW) ไว้แล้ว — หัวหน้าภาคนัดได้เลย" ] \
  && [ "$(code_of "$R2") $(err_of "$R2")" = "400 ต้องระบุวันที่จะให้นัด" ] && [ "$(NLOG $G1 URGENT_RELEASE)" = 1 ] \
  && pass "กดซ้ำวันเดิม → 409 URGENT_ASK_STATE \"แก้… ไว้แล้ว\" ประวัติไม่ซ้ำ · ใบที่ไม่มีคำขอและไม่ส่งวัน → 400 ต้องระบุวัน (ฐานข้อมูล)" \
  || fail "ซ้ำ/ไม่มีวัน: $(code_of "$R") $(body_of "$R") · $(code_of "$R2") $(err_of "$R2")"
R=$(CALL $A work-orders/$GA/urgent-release "{\"day\":\"$TOMORROW\"}"); R2=$(CALL $A work-orders/$GT/urgent-release "{\"day\":\"$TODAY\"}")
R3=$(CALL $A work-orders/$G2/urgent-release "{\"day\":\"$YESTERDAY\"}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|none" ] \
  && [ "$(err_of "$R")" = "$GAC อยู่ขั้น \"$(LABEL $GA)\" — แก้เป็นงานด่วนได้เฉพาะใบที่รอหัวหน้าภาคนัดวัน (ขั้นอื่นติ๊ก “แก้เป็นงานด่วนไปพร้อมกัน” ในฟอร์มคอนเฟิร์มลูกค้า / เลื่อนวันนัด)" ] \
  && [ "$(code_of "$R2") $(err_of "$R2")" = "400 ใบทดสอบไม่ติดเวลาปิดนัด — นัดวันไหนก็ได้" ] \
  && [ "$(code_of "$R3") $(err_of "$R3")" = "409 $G2C วัน $(VT $YESTERDAY) ผ่านไปแล้ว — แก้เป็นงานด่วนไม่ได้ ให้หัวหน้าภาคนัดวันอื่น" ] \
  && [ "$(URF $GA)|$(URF $GT)|$(URF $G2)" = "-|-|-" ] \
  && pass "ขั้นรอปล่อยงาน → 409 บอกให้ติ๊กในฟอร์มคอนเฟิร์ม/เลื่อนวัน (ไม่มี code) · ใบทดสอบ 400 · วันผ่านแล้ว 409 (ฐานข้อมูลไม่เปลี่ยน)" \
  || fail "แก้เป็นงานด่วนที่ไม่ได้: $(code_of "$R") $(body_of "$R") · $(code_of "$R2") $(err_of "$R2") · $(code_of "$R3") $(err_of "$R3")"
OPEN
R=$(CALL $A work-orders/$G2/urgent-release "{\"day\":\"$TOMORROW\"}")
[ "$(code_of "$R")|$(BCODE "$R")" = "409|URGENT_ASK_STATE" ] \
  && [ "$(err_of "$R")" = "$G2C ยังนัด $(SHORT $TOMORROW) ได้ (ปิดนัด $(SHORT $TODAY) $CUT น.) — ไม่ต้องแก้เป็นงานด่วน" ] && [ "$(URF $G2)" = - ] \
  && pass "ก่อนเวลาปิด ($CUT) แก้พรุ่งนี้ → 409 URGENT_ASK_STATE \"ยังนัด … ได้ (ปิดนัด … น.)\" ไม่ตั้ง (ฐานข้อมูล)" || fail "แก้ตอนยังเปิด: $(code_of "$R") $(body_of "$R")"
CLOSE
TF1=$(mktemp); TF2=$(mktemp)
CALL $A work-orders/$G3/urgent-release "{\"day\":\"$TOMORROW\"}" > "$TF1" &
CALL $SA work-orders/$G3/urgent-release "{\"day\":\"$TOMORROW\",\"reason\":\"คนที่สอง\"}" > "$TF2" & wait
C1=$(code_of "$(cat "$TF1")"); C2=$(code_of "$(cat "$TF2")")
LOSER=$([ "$C1" = 409 ] && cat "$TF1" || cat "$TF2"); rm -f "$TF1" "$TF2"
[ "$(echo "$C1 $C2" | tr ' ' '\n' | sort | tr '\n' ' ')" = "200 409 " ] && [ "$(BCODE "$LOSER")" = URGENT_ASK_STATE ] \
  && [ "$(NLOG $G3 URGENT_RELEASE)|$(URF $G3)" = "1|$TOMORROW" ] \
  && pass "แอดมินสองคนกดพร้อมกัน → ผ่านคนเดียว อีกคน 409 URGENT_ASK_STATE \"ไว้แล้ว\" · ประวัติแถวเดียว (ฐานข้อมูล)" \
  || fail "กดพร้อมกัน: $C1 $C2 · $(body_of "$LOSER") · $(NLOG $G3 URGENT_RELEASE) $(URF $G3)"
R=$(SCHEDCALL $S assign $G1 $TODAY); R2=$(SCHEDCALL $S assign $G2 $TOMORROW); R3=$(SCHEDCALL $S assign $G1 $TOMORROW)
CLOSED_OK "$R" "$SUP_TODAY" $TODAY $D2 && CLOSED_OK "$R2" "$(SUP_TMR)" $TOMORROW $D2 && [ "$(code_of "$R3")" = 200 ] \
  && [ "$(ST $G1)|$(SCH $G1)|$(URF $G1)" = "AWAITING_CONFIRM|$TOMORROW|$TOMORROW" ] && [ "$(ST $G2)" = PARTS_CHECKED ] \
  && pass "แก้ให้พรุ่งนี้ไม่ได้เปิดวันนี้ (400) และไม่เปิดใบอื่น (400) · หัวหน้าภาคนัดพรุ่งนี้หลังเวลาปิดได้ urgentReleaseFor ยังอยู่ (ฐานข้อมูล)" \
  || fail "ใช้งานด่วน: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(err_of "$R2") · $(code_of "$R3") $(err_of "$R3") · $(URF $G1)"
# อ่านค่าก่อนกดในบรรทัดเดียวกัน — ถ้างานด่วนไม่ได้ตั้งตั้งแต่แรก (แก้พร้อมกันพัง/โค้ดเก่า 409 ที่ขั้นนี้) ช่องว่างอยู่แล้ว "ล้าง" ก็ผ่านเปล่า ๆ
PRE="$(URF $G3)"
R=$(SCHEDCALL $S assign $G3 $D2)
[ "$PRE" = "$TOMORROW" ] && [ "$(code_of "$R")" = 200 ] && [ "$(ST $G3)|$(SCH $G3)|$(URF $G3)" = "AWAITING_CONFIRM|$D2|-" ] \
  && pass "ได้งานด่วนพรุ่งนี้แต่หัวหน้าภาคนัดมะรืนแทน → urgentReleaseFor ล้าง (นัดวันอื่นแล้วหมดผล · ฐานข้อมูล)" || fail "นัดวันอื่น: ก่อนกด $PRE · $(code_of "$R") $(err_of "$R") · $(URF $G3)"
G4=$(mk W107); G5=$(mk W108); toChecked $G5
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') where id=$SEED_ID" >/dev/null
GETCUT $A >/dev/null
R=$(CALL $A work-orders/$G4/urgent-release "{\"day\":\"$TODAY\"}"); R2=$(REQ $S $G5 "{\"day\":\"$TODAY\"}")
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') - interval '30 days' where id=$SEED_ID" >/dev/null
GETCUT $A >/dev/null; SINCE_PIN=$(SINCEISO)
[ "$(code_of "$R")" = 200 ] && [ "$(ST $G4)|$(URF $G4)" = "NEW|$TODAY" ] \
  && [ "$(code_of "$R2")|$(BCODE "$R2")" = "409|URGENT_ASK_STATE" ] && [ "$(err_of "$R2")" = "$(CODEOF $G5) ยังนัด $(SHORT $TODAY) ได้ — ไม่ต้องขอแอดมิน" ] \
  && pass "เวลาเริ่มใช้กฎเพิ่งเริ่ม: แอดมินแก้วันนี้ได้ (เทียบเส้นตายตรง ๆ ไม่ดู since) แต่หัวหน้าภาคขอวันนี้ → 409 \"ยังนัด … ได้\" (คำขอดู since) (ฐานข้อมูล)" \
  || fail "แก้เป็นงานด่วนไม่ดู since: $(code_of "$R") $(err_of "$R") · $(URF $G4) · $(code_of "$R2") $(body_of "$R2")"

echo
echo "═══ แอดมินคอนเฟิร์มลูกค้า / เลื่อนวันนัด / ดึงงานคืน — วันที่ปิดต้องติ๊ก · วันเดิมไม่มีกฎ (ข้อ 4)"
CLOSE
K1=$(mk W109); toConfirm $K1 $TODAY
K2=$(mk W110); toConfirm $K2 $D2
K3=$(mk W111); toConfirm $K3 $D3; SETURF $K3 $D3
K5=$(mk W112); toConfirm $K5 $TODAY; SETURF $K5 $TODAY
[ "$(ST $K1)|$(SCH $K1)|$(URF $K1)" = "AWAITING_CONFIRM|$TODAY|-" ] || fail "เตรียม K1: $(ST $K1) $(SCH $K1) $(URF $K1)"
R=$(CALL $A work-orders/$K1/confirm-appointment '{"urgent":true}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $K1)|$(SCH $K1)|$(URF $K1)|$(NLOG $K1 URGENT_RELEASE)|$(NLOG $K1 CONFIRMED)" = "ASSIGNED|$TODAY|-|0|1" ] \
  && pass "คอนเฟิร์มวันเดิม (วันนี้ · ไม่มีงานด่วน) → ผ่าน ไม่มีกฎเวลา · urgent:true ไม่มีผล (ไม่ตั้ง ไม่ลงประวัติ — ฐานข้อมูล)" \
  || fail "คอนเฟิร์มวันเดิม: $(code_of "$R") $(err_of "$R") · $(ST $K1) $(URF $K1) $(NLOG $K1 URGENT_RELEASE)"
R=$(CALL $A work-orders/$K2/confirm-appointment "{\"scheduledAt\":\"$TOMORROW\"}"); MID="$(ST $K2)|$(SCH $K2)"
R2=$(CALL $A work-orders/$K2/confirm-appointment "{\"scheduledAt\":\"$TOMORROW\",\"urgent\":true,\"note\":\"ร้านขอพรุ่งนี้\"}")
CLOSED_OK "$R" "$(ADM_TMR)" $TOMORROW $D2 && [ "$MID" = "AWAITING_CONFIRM|$D2" ] && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $K2)|$(SCH $K2)|$(URF $K2)" = "ASSIGNED|$TOMORROW|$TOMORROW" ] \
  && [ "$(SEQ $K2 "'RESCHEDULED','URGENT_RELEASE'")" = "RESCHEDULED,URGENT_RELEASE|2" ] && [ "$(LOGROW $K2 URGENT_RELEASE | cut -d'|' -f2-4)" = "confirm|ร้านขอพรุ่งนี้|$TOMORROW" ] \
  && pass "ลูกค้าขอเลื่อนเป็นพรุ่งนี้หลังเวลาปิด: ไม่ติ๊ก → 400 \"$(ADM_TMR)\" ใบไม่ขยับ · ติ๊ก → เลื่อน + แก้เป็นงานด่วน via=confirm (ฐานข้อมูล)" \
  || fail "คอนเฟิร์มเลื่อนพรุ่งนี้: $(code_of "$R") $(body_of "$R") · $MID · $(code_of "$R2") $(err_of "$R2") · $(SEQ $K2 "'RESCHEDULED','URGENT_RELEASE'")"
R=$(CALL $A work-orders/$K3/confirm-appointment "{\"scheduledAt\":\"$TODAY\"}"); MID="$(ST $K3)|$(SCH $K3)|$(URF $K3)"
R2=$(CALL $A work-orders/$K3/confirm-appointment "{\"scheduledAt\":\"$D2\"}")
CLOSED_OK "$R" "$ADM_TODAY" $TODAY $D2 && [ "$MID" = "AWAITING_CONFIRM|$D3|$D3" ] && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $K3)|$(SCH $K3)|$(URF $K3)|$(NLOG $K3 URGENT_RELEASE)" = "ASSIGNED|$D2|-|0" ] \
  && pass "ลูกค้าขอเลื่อนเป็นวันนี้ไม่ติ๊ก → 400 \"$ADM_TODAY\" · เลื่อนเป็นมะรืนได้ งานด่วนของวันเดิมล้าง (ฐานข้อมูล)" \
  || fail "คอนเฟิร์มเลื่อนวันนี้/มะรืน: $(code_of "$R") $(body_of "$R") · $MID · $(code_of "$R2") $(err_of "$R2") · $(URF $K3)"
R=$(CALL $A work-orders/$K5/confirm-appointment '{"scheduledTime":"13:00"}')
[ "$(code_of "$R")" = 200 ] \
  && [ "$(DB "select status||'|'||\"scheduledAt\"::date||'|'||\"scheduledTime\"||'|'||\"urgentReleaseFor\"::date from \"WorkOrder\" where id=$K5")" = "ASSIGNED|$TODAY|13:00|$TODAY" ] \
  && [ "$(NLOG $K5 URGENT_RELEASE)|$(NLOG $K5 RESCHEDULED)" = "0|1" ] \
  && pass "คอนเฟิร์มเปลี่ยนแค่เวลาในวันเดิม (วันนี้ที่แก้เป็นงานด่วนไว้) → ไม่ต้องติ๊ก urgentReleaseFor ยังอยู่ (สิทธิ์ผูกกับวัน — ฐานข้อมูล)" \
  || fail "เปลี่ยนแค่เวลา: $(code_of "$R") $(err_of "$R") · $(DB "select \"scheduledTime\"||'|'||coalesce(\"urgentReleaseFor\"::text,'-') from \"WorkOrder\" where id=$K5")"
M1=$(mk W113); rel $M1 $D2
M2=$(mk W114); rel $M2 $D2; SETURF $M2 $D2
M3=$(mk W115); rel $M3 $TODAY; SETURF $M3 $TODAY
N1=$(mk W116); rel $N1 $D2; POST $S work-orders/$N1/dispatch '{}' >/dev/null
[ "$(ST $M1) $(ST $M2) $(ST $M3) $(ST $N1)" = "ASSIGNED ASSIGNED ASSIGNED IN_PROGRESS" ] || fail "เตรียมใบเลื่อนวัน: $(ST $M1) $(ST $M2) $(ST $M3) $(ST $N1)"
RS() { CALL $A work-orders/$1/reschedule "$2"; }
R=$(RS $M1 "{\"scheduledAt\":\"$TOMORROW\",\"reason\":\"ร้านขอพรุ่งนี้\"}"); MID="$(ST $M1)|$(SCH $M1)"
R2=$(RS $M1 "{\"scheduledAt\":\"$TOMORROW\",\"reason\":\"ร้านขอพรุ่งนี้\",\"urgent\":true}")
CLOSED_OK "$R" "$(ADM_TMR)" $TOMORROW $D2 && [ "$MID" = "ASSIGNED|$D2" ] && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $M1)|$(SCH $M1)|$(URF $M1)" = "ASSIGNED|$TOMORROW|$TOMORROW" ] \
  && [ "$(SEQ $M1 "'APPOINTMENT_MOVED','URGENT_RELEASE'")" = "APPOINTMENT_MOVED,URGENT_RELEASE|2" ] && [ "$(LOGROW $M1 URGENT_RELEASE | cut -d'|' -f2-4)" = "reschedule|ร้านขอพรุ่งนี้|$TOMORROW" ] \
  && pass "เลื่อนวันนัดเป็นพรุ่งนี้หลังเวลาปิด: ไม่ติ๊ก → 400 ใบไม่ขยับ · ติ๊ก → เลื่อน + แก้เป็นงานด่วน via=reschedule (ฐานข้อมูล)" \
  || fail "เลื่อนพรุ่งนี้: $(code_of "$R") $(body_of "$R") · $MID · $(code_of "$R2") $(err_of "$R2") · $(SEQ $M1 "'APPOINTMENT_MOVED','URGENT_RELEASE'")"
R=$(RS $M2 "{\"scheduledAt\":\"$TODAY\",\"reason\":\"ร้านขอวันนี้\"}"); MID="$(SCH $M2)|$(URF $M2)"
R2=$(RS $M2 "{\"scheduledAt\":\"$D3\",\"reason\":\"ร้านขอเลื่อน\"}")
CLOSED_OK "$R" "$ADM_TODAY" $TODAY $D2 && [ "$MID" = "$D2|$D2" ] && [ "$(code_of "$R2")" = 200 ] && [ "$(SCH $M2)|$(URF $M2)" = "$D3|-" ] \
  && pass "เลื่อนวันนัดเป็นวันนี้ไม่ติ๊ก → 400 \"$ADM_TODAY\" · เลื่อนไปวันที่เปิด งานด่วนของวันเดิมล้าง (ฐานข้อมูล)" \
  || fail "เลื่อนวันนี้/วันเปิด: $(code_of "$R") $(body_of "$R") · $MID · $(code_of "$R2") $(err_of "$R2") · $(URF $M2)"
R=$(RS $M3 "{\"scheduledAt\":\"$TODAY\",\"scheduledTime\":\"14:00\",\"reason\":\"ร้านขอบ่าย\"}")
[ "$(code_of "$R")" = 200 ] && [ "$(DB "select \"scheduledTime\"||'|'||coalesce(\"urgentReleaseFor\"::date::text,'-') from \"WorkOrder\" where id=$M3")" = "14:00|$TODAY" ] \
  && [ "$(NLOG $M3 URGENT_RELEASE)" = 0 ] \
  && pass "เลื่อนแค่เวลาในวันเดิม (วันนี้ที่แก้เป็นงานด่วนไว้) → ไม่ต้องติ๊ก urgentReleaseFor ยังอยู่ (เดิมล้างทิ้ง — ฐานข้อมูล)" \
  || fail "เลื่อนแค่เวลา: $(code_of "$R") $(err_of "$R") · $(URF $M3)"
R=$(RS $N1 "{\"scheduledAt\":\"$TODAY\",\"reason\":\"ร้านขอวันนี้\"}"); MID="$(ST $N1)|$(SCH $N1)"
R2=$(RS $N1 "{\"scheduledAt\":\"$TODAY\",\"reason\":\"ร้านขอวันนี้\",\"urgent\":true}")
CLOSED_OK "$R" "$ADM_TODAY" $TODAY $D2 && [ "$MID" = "IN_PROGRESS|$D2" ] && [ "$(code_of "$R2")" = 200 ] \
  && [ "$(ST $N1)|$(SCH $N1)|$(URF $N1)" = "ASSIGNED|$TODAY|$TODAY" ] \
  && [ "$(SEQ $N1 "'APPOINTMENT_RECALLED','URGENT_RELEASE'")" = "APPOINTMENT_RECALLED,URGENT_RELEASE|2" ] \
  && pass "ดึงงานคืนจากช่างไปวันนี้: ไม่ติ๊ก → 400 ใบยังอยู่กับช่าง · ติ๊ก → ดึงคืน + แก้เป็นงานด่วน (ฐานข้อมูล)" \
  || fail "ดึงงานคืน: $(code_of "$R") $(body_of "$R") · $MID · $(code_of "$R2") $(err_of "$R2") · $(SEQ $N1 "'APPOINTMENT_RECALLED','URGENT_RELEASE'")"

echo
echo "═══ ปล่อยงานไม่มีเวลาปิดแล้ว (ข้อ 1) — ใบวันนี้/พรุ่งนี้หลังเวลาปิด (นัดมะรืนแล้วย้ายวันทาง SQL · ไม่มีงานด่วน) ปล่อยได้"
CLOSE
L1=$(mk W81); rel $L1 $TODAY
L2=$(mk W82); rel $L2 $TOMORROW
L3=$(mk W83); insp $L3 $TOMORROW
L4=$(mk W84); rel $L4 $TODAY "$OS"
L5=$(mk W85 C0001); rel $L5 $TODAY "$OTEAM" $A
L6=$(mk W86); rel $L6 $TOMORROW
REL() {  # $1 ชื่อ $2 คนกด $3 ใบ $4 ขั้นที่ควรไป
  local u r; u="$(URF $3)|$(SCH $3)"
  r=$(CALL $2 work-orders/$3/dispatch '{}')
  if [ "$(code_of "$r")" = 200 ] && [ "${u%%|*}" = - ] && [ "$(ST $3)|$(NLOG $3 DISPATCHED)" = "$4|1" ]; then
    pass "ปล่อยงาน $1 (วันนัด ${u#*|} · urgentReleaseFor ว่าง) → 200 $4 + ประวัติ DISPATCHED (ฐานข้อมูล)"
  else fail "ปล่อยงาน $1: $(code_of "$r") $(body_of "$r") · ก่อนกด $u · $(ST $3)"; fi
}
REL "วันนี้ — หัวหน้าภาค" $S $L1 IN_PROGRESS
REL "พรุ่งนี้หลังเวลาปิด — แอดมินกดแทน" $A $L2 IN_PROGRESS
REL "ส่งช่างตรวจพรุ่งนี้ (INSPECT_DISPATCH)" $S $L3 INSPECTING
REL "ใบ SUB วันนี้" $S $L4 IN_PROGRESS
REL "ใบไม่มีคนรับวันนี้ — แอดมิน" $A $L5 IN_PROGRESS
R=$(CALL $S work-orders/$L6/decline-new-date '{"reason":"ทีมเต็มพรุ่งนี้"}'); MID="$(ST $L6)"
POST $A work-orders/$L6/confirm-appointment '{}' >/dev/null
R2=$(CALL $S work-orders/$L6/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$MID" = AWAITING_CONFIRM ] && [ "$(code_of "$R2")" = 200 ] && [ "$(ST $L6)|$(URF $L6)" = "IN_PROGRESS|-" ] \
  && pass "ทีมไม่ว่าง — ส่งกลับแอดมินยังใช้ได้ · แอดมินคอนเฟิร์มวันเดิม (พรุ่งนี้หลังเวลาปิด) แล้วหัวหน้าภาคปล่อยได้ ไม่ต้องมีงานด่วน (ฐานข้อมูล)" \
  || fail "ส่งกลับ/ปล่อยใหม่: $(code_of "$R") $(err_of "$R") · $MID · $(code_of "$R2") $(body_of "$R2")"

echo
echo "═══ ฝั่งอ่าน: ช่องที่เลิกใช้ · กล่องงาน/ลายนิ้วมือไม่ขยับตอนถึงเวลาปิด · เลยนัด · บอร์ด"
OPEN
V1=$(mk W87); rel $V1 $TOMORROW
LA=$(LIST $A ACTIVE)
DJ=$(DET $S $V1 '[!("release" in d), !("urgentInfo" in d), "urgentAsk" in d, "urgentAnswer" in d, d.cutoff.time, d.cutoff.since, Math.abs(Date.parse(d.serverNow) - Date.now()) < 60000, "urgentReleaseFor" in d].join("|")')
[ "$(echo "$LA" | J 'd.rows.length > 0 && d.rows.every(r => !("release" in r) && !("releaseDeclined" in r) && "urgentAsk" in r && "urgentReleaseFor" in r && "isTest" in r)')" = true ] \
  && [ "$(echo "$LA" | J '[d.cutoff.time, d.cutoff.since].join("|")')" = "$CUT|$SINCE_PIN" ] \
  && [ "$DJ" = "true|true|true|true|$CUT|$SINCE_PIN|true|true" ] \
  && pass "รายการ: ไม่มี release/releaseDeclined มี urgentAsk · หน้าใบงาน: ไม่มี release/urgentInfo มี urgentAsk/urgentAnswer · serverNow/cutoff/urgentReleaseFor ยังอยู่" \
  || fail "ช่องอ่าน: $DJ · $(echo "$LA" | J 'JSON.stringify(Object.keys(d.rows[0]||{}).filter(k=>/release|urgent/i.test(k)))')"
I1=$(ICOUNT $A); VV1=$(VER $A); VS=$(VER $S)
CLOSE
I2=$(ICOUNT $A); VV2=$(VER $A)
[ "$I1" = "$I2" ] && [ "$VV1" = "$VV2" ] && [ "$(DB "select count(*) from \"WorkOrder\" where status='ASSIGNED' and \"scheduledAt\"='$TOMORROW' and not \"isTest\" and \"urgentReleaseFor\" is null")" -ge 1 ] \
  && pass "ถึงเวลาปิด (เปิด→ปิด) ทั้งที่มีใบพรุ่งนี้รอปล่อยงาน: ตัวเลขกล่องแอดมิน ($I1) และ /version เหมือนเดิมทุกตัวอักษร — ไม่มีใบเข้ากล่องตอน 16:00 แล้ว" \
  || fail "กล่อง/ลายนิ้วมือขยับตอนถึงเวลาปิด: $I1 → $I2 · $VV1 → $VV2"
[ "${VV1##*|}" = "$TODAY" ] && ! echo "${VS##*|}" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' \
  && pass "/version ของแอดมินทั่วไปลงท้ายด้วยวันไทยวันนี้ ($TODAY — กล่องเปลี่ยนตอนเที่ยงคืน) · ของหัวหน้าภาคไม่มีวัน (ไม่ขึ้นปุ่มอัปเดตปลอมทุกเที่ยงคืน)" \
  || fail "/version: แอดมิน $VV1 · หัวหน้าภาค $VS"
V2=$(mk W88); rel $V2 $D2; MOVEDAY $V2 $YESTERDAY
GOT="$(RW "$(LIST $A INBOX)" $V2 'r.overdue')"
R=$(CALL $S work-orders/$V2/dispatch '{}')
[ "$GOT" = true ] && [ "$(code_of "$R")" = 200 ] && [ "$(ST $V2)" = IN_PROGRESS ] \
  && pass "ใบรอปล่อยงานที่วันนัดผ่านแล้ว (เมื่อวาน) ยังอยู่หัวข้อ \"เลยนัด\" ในกล่องแอดมิน (overdue) · แต่ปล่อยงานได้แล้ว ไม่ล็อก (ฐานข้อมูล IN_PROGRESS)" \
  || fail "เลยนัด: overdue=$GOT · ปล่อย $(code_of "$R") $(body_of "$R")"
[ "$(CODE localhost:4000/api/work-orders/dispatch-watch -H "$(H $A)")|$(CODE localhost:4000/api/work-orders/dispatch-watch -H "$(H $S)")" = "400|400" ] \
  && pass "GET /dispatch-watch ไม่มีแล้ว (ตกไปที่ /:id → 400 รหัสใบงานไม่ถูกต้อง — แอปรุ่นเก่าจับ error เงียบ ๆ)" || fail "dispatch-watch ยังตอบ"
V3=$(mk W89); toChecked $V3
POST $A work-orders/$V3/urgent-release "{\"day\":\"$TOMORROW\"}" >/dev/null
SCHEDCALL $S assign $V3 $TOMORROW >/dev/null
PB=$(curl -s "localhost:4000/api/plans/day?date=$TOMORROW" -H "$(H $A)")
GOT=$(echo "$PB" | J "const s=d.lanes.flatMap(l=>l.stops).find(x=>x.id===$V3); s ? [s.urgentReleaseFor, 'release' in s].join('|') : 'missing'")
[ "$GOT" = "$TOMORROW|false" ] && [ "$(echo "$PB" | J '["cutoff" in d, Math.abs(Date.parse(d.serverNow) - Date.now()) < 60000].join("|")')" = "false|true" ] \
  && [ "$(URF $V3)|$(SCH $V3)" = "$TOMORROW|$TOMORROW" ] \
  && pass "บอร์ดแผนงาน: จุดที่นัดด้วยงานด่วนมี urgentReleaseFor = วันนัด (ป้ายเขียว) · ไม่มี release · ไม่มี cutoff มีแต่ serverNow (ฐานข้อมูล)" \
  || fail "บอร์ด: $GOT · $(echo "$PB" | J 'Object.keys(d).join(",")')"

echo
echo "═══ ทางที่ไม่ได้นัดวันไม่ติดกฎ (ปิดย้อนหลัง · หัวหน้าภาคปิดแทน · ใบทดสอบ — ข้อ 15)"
CLOSE
E1=$(mk W90)
R0=$(SCHEDCALL $S parts $E1 $TODAY)
NOWISO=$(node -e 'console.log(new Date().toISOString())')
R=$(CALL $A work-orders/$E1/backfill-close "{\"reason\":\"ทดสอบ\",\"team\":\"$TEAM\",\"visitDate\":\"$TODAY\",\"result\":\"FIXED\",\"closedAt\":\"$NOWISO\",\"otherWorkers\":\"ช่างทดสอบ\",\"noPhotoReason\":\"ทดสอบ\"}")
CLOSED_OK "$R0" "$SUP_TODAY" $TODAY $D2 && [ "$(code_of "$R")" = 200 ] && [ "$(ST $E1)|$(SCH $E1)" = "DONE|$TODAY" ] \
  && pass "หัวหน้าภาคนัดวันนี้ไม่ได้ (400) แต่แอดมินปิดย้อนหลังด้วยวันเข้างาน = วันนี้ได้ (ฐานข้อมูล DONE)" \
  || fail "ปิดย้อนหลังวันนี้: $(code_of "$R0") · $(code_of "$R") $(err_of "$R") · $(ST $E1)"
E2=$(mk W91)
R0=$(SCHEDCALL $S inspect $E2 $TODAY)
DB "insert into \"WorkOrderAttachment\"(\"workOrderId\",kind,\"fileName\",\"mimeType\",\"sizeBytes\",role,\"createdAt\")
  values ($E2,'IMAGE','dc.jpg','image/jpeg',1,'AFTER',now() at time zone 'UTC')" >/dev/null
R=$(CALL $S work-orders/$E2/supervisor-close "{\"reason\":\"TECH_FIXED\",\"note\":\"เปลี่ยนบอร์ดแล้ว ทดสอบปกติครบรอบ\",\"otherWorkers\":\"ช่างทดสอบ\",\"visitDate\":\"$TODAY\"}")
CLOSED_OK "$R0" "$SUP_TODAY" $TODAY $D2 && [ "$(code_of "$R")" = 200 ] && [ "$(ST $E2)" = DONE ] \
  && pass "หัวหน้าภาคส่งตรวจวันนี้ไม่ได้ (400) แต่ปิดแทน \"ช่างเข้าซ่อมเสร็จแล้ว\" วันที่เข้า = วันนี้ได้ (ฐานข้อมูล DONE)" \
  || fail "ปิดแทนวันนี้: $(code_of "$R0") · $(code_of "$R") $(err_of "$R") · $(ST $E2)"
E3=$(mk W92); toChecked $E3; E3T=$(POST $A work-orders/$E3/test-copy '{}' | J 'd.id')
R=$(SCHEDCALL $S assign $E3T $TODAY); R2=$(SCHEDCALL $S assign $E3 $TODAY)
[ "$(code_of "$R")" = 200 ] && [ "$(ST $E3T)|$(SCH $E3T)|$(URF $E3T)" = "AWAITING_CONFIRM|$TODAY|-" ] && CLOSED_OK "$R2" "$SUP_TODAY" $TODAY $D2 && [ "$(ST $E3)" = PARTS_CHECKED ] \
  && pass "ใบทดสอบ (คัดลอกที่ขั้นนัดวันเข้า) นัดวันนี้ได้ ใบจริงต้นฉบับ 400 (ฐานข้อมูล)" || fail "ใบทดสอบ /assign: $(code_of "$R") $(err_of "$R") · $(code_of "$R2")"

# exit แทน [ ] เปล่า — คำสั่งสุดท้ายที่ล้มจะไปเรียก trap ERR ให้ขึ้น "หยุดกลางทาง" ซ้ำกับ FAIL ที่พิมพ์ไปแล้ว
[ -z "$FAILED" ] || exit 1
