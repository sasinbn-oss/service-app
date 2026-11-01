#!/bin/bash
# ทดสอบ: เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — งานพรุ่งนี้ต้องปล่อยให้ช่างก่อนเวลาที่แอดมินตั้งของวันก่อนวันนัด
#   · ตั้งค่า GET/PUT /api/settings/dispatch-cutoff: ใครอ่าน/เปลี่ยนได้ · เลือกได้ 15:00–17:00 ทีละครึ่งชั่วโมง
#     · เปลี่ยนแต่ละครั้งเป็นแถวใหม่ (ใครเปลี่ยนจากอะไรเป็นอะไร) · แอดมินที่เคยเปลี่ยนแล้วถูกลบ = ปิดบัญชี ชื่อยังอยู่
#   · คณิตเส้นตาย utils/dispatchCutoff.ts (วันก่อนวันนัด · ข้ามสิ้นเดือน/ปี · 15:59:59.999 ได้ 16:00:00.000 ไม่ได้
#     · ไม่ล็อกย้อนหลังก่อนเวลาเริ่มใช้กฎ · งานด่วนผูกกับวันนัด) — คิดด้วยเวลาที่ส่งเข้าไปเอง ไม่ขึ้นกับเวลาที่รันเทสต์
#   · กฎจริงที่เซิร์ฟเวอร์ (ก้อน 2a): ปุ่มปล่อยงาน 409 DISPATCH_LOCKED · แอดมินแก้เป็นงานด่วน (ทีละใบ · กดพร้อมกันผ่านคนเดียว)
#     · ติ๊กงานด่วนในฟอร์มคอนเฟิร์มลูกค้า/เลื่อนวันนัด · หัวหน้าภาคขอ/ยกเลิกคำขอ · ทางที่ไม่ผ่านปุ่มปล่อยงานไม่ติดกฎ
#     · ทุกทางที่เปลี่ยน/ล้างวันนัดล้างงานด่วน — ผลต้องเหมือนกันไม่ว่ารันกี่โมง (เวลาปิดรับทดสอบห่างจากตอนนี้ไม่เกิน ±5 นาที)
#
# คุมเวลาด้วยแถวในตาราง AppSetting เท่านั้น (แถวล่าสุด = เวลาปิดรับที่ใช้) แล้วลบแถวที่เพิ่มทุกแถวตอนจบ (trap)
# — แถวที่ค้างไว้จะเปลี่ยนผลของทุกชุดที่รันต่อจากนี้ · ยืนยันที่ฐานข้อมูลทุกข้อ (CLAUDE.md)
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
# ตั้งเวลาปิดรับทาง SQL (เทสต์ใช้เวลาใด ๆ ได้ ไม่จำกัดแค่ 5 ตัวเลือก) แล้วเรียก GET ให้เซิร์ฟเวอร์อ่านสด ไม่ใช้ค่าที่จำไว้ 30 วิ
SETCUT() { DB "insert into \"AppSetting\" (key,value) values ('dispatchCutoff','$1')" >/dev/null; GETCUT $A >/dev/null; }

SUF=$RANDOM

# กันข้ามเที่ยงคืน: เวลาปิดรับทดสอบห่างจากตอนนี้ไม่เกิน 5 นาที ทั้งชุดใช้ราว 2 นาที — ภายใน 10 นาทีก่อน/หลังเที่ยงคืน
# "วันนี้/พรุ่งนี้" จะเปลี่ยนกลางทาง (หรือ 23:58+5 นาทีกลายเป็น 00:03 ของวันเดียวกัน) รอให้พ้น 00:11 ก่อน · ขยับ offset ต้องขยับตรงนี้ด้วย
# รอก่อนแตะฐานข้อมูลสักบรรทัด: ถูกฆ่าระหว่าง sleep (ตัวคุมรอบหมดเวลา) bash ยังไม่ได้เรียก trap — ถ้าถอยเวลาเริ่มใช้กฎ/แก้ S001
# ไว้ก่อนแล้ว ของพวกนั้นจะค้างในฐานโดยไม่มีใครคืน
WAIT=$(node -e '
  const now = Date.now() + 7 * 3600e3, d = new Date(now), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m < 24 * 60 - 10 && m >= 11) { console.log(0); process.exit(0); }
  const t = new Date(now); t.setUTCHours(0, 11, 0, 0); if (t.getTime() <= now) t.setUTCDate(t.getUTCDate() + 1);
  console.log(Math.ceil((t.getTime() - now) / 1000));')
if [ "$WAIT" -gt 0 ]; then echo "    รอข้ามเที่ยงคืน $WAIT วินาที — เวลาปิดรับทดสอบจะข้ามวัน"; sleep "$WAIT"; fi

# แถวที่รอบก่อนทิ้งไว้ (ถูกฆ่ากลางทางก่อน trap ทำงาน · หมดเวลาจากตัวคุมรอบ) ต้องโผล่เป็น FAIL ไม่ใช่ถูกกลบ —
# เดิม "ตั้ง 16:00 ทับแล้วลบแถวของตัวเองตอนจบ" ทำให้ฐานกลับไปค้างเวลาเสีย (23:59 · abc) ทุกครั้ง แอปกับทุกชุดที่รัน
# ต่อจากนี้ใช้เวลาผิดไปเรื่อย ๆ โดยไม่มีชุดไหนบอก · แถวหลังแถวตั้งต้นที่ไม่มีคนเปลี่ยน (ใส่ทาง SQL) หรือเปลี่ยนโดย
# ผู้ใช้ชั่วคราว ZDC* มาจากเทสต์เท่านั้น ลบได้แน่นอน · แถวที่แอดมินจริงเปลี่ยนไว้ไม่แตะ (คืนให้ตอนจบตามเดิม)
LEAK_WHERE="s.key='dispatchCutoff'
  and s.id > (select min(id) from \"AppSetting\" where key='dispatchCutoff')
  and (s.\"createdById\" is null or s.\"createdById\" in (select id from \"User\" where \"employeeCode\" like 'ZDC%'))"
LEAK=$(DB "select string_agg(s.id||'='||s.value, ' ' order by s.id) from \"AppSetting\" s where $LEAK_WHERE")
if [ -n "$LEAK" ]; then
  fail "มีแถวเวลาปิดรับที่เทสต์รอบก่อนทิ้งค้างไว้ (id=ค่า: $LEAK) — ลบออกแล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้แอปใช้เวลาผิด"
  DB "delete from \"AppSetting\" s where $LEAK_WHERE" >/dev/null
fi
# เวลาเริ่มใช้กฎที่รอบก่อนถอยไว้ 30 วันแล้วไม่ได้คืน (ดู SEED_MARK ในส่วนก้อน 2a) — คืนจากค่าที่จดไว้ ไม่เดา
SEED_MARK=dispatchCutoffTestSeedAt
SEED_LEFT=$(DB "select value from \"AppSetting\" where key='$SEED_MARK' order by id limit 1")
if [ -n "$SEED_LEFT" ]; then
  fail "เวลาเริ่มใช้กฎค้างถอยหลัง 30 วันจากเทสต์รอบก่อน — คืนเป็น $SEED_LEFT แล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้งานวันนี้ของทุกใบล็อกทั้งที่ไม่ควร"
  DB "update \"AppSetting\" set \"createdAt\"='$SEED_LEFT' where id=(select min(id) from \"AppSetting\" where key='dispatchCutoff');
      delete from \"AppSetting\" where key='$SEED_MARK'" >/dev/null
fi

MAXSET0=$(MAXSET)
cleanup() {
  # เก็บกวาดให้ครบทุกบรรทัด — ลบแถวตั้งค่าไม่สำเร็จต้องไม่ทำให้ข้ามการลบผู้ใช้ชั่วคราว
  set +e
  trap - ERR
  # ใบงานของรอบนี้ (รวมใบทดสอบที่คัดลอก) หาจากอาการที่มีเลขสุ่ม — สร้างใน $(...) ตัวแปรในเชลล์ลูกไม่กลับมา
  # ลบก่อนผู้ใช้ชั่วคราว: ประวัติที่ผู้ใช้เหล่านั้นเขียนหายไปกับใบ
  if [ -n "$A" ]; then
    for i in $(DB "select id from \"WorkOrder\" where symptom='ทดสอบเวลาปิดรับ $SUF'"); do
      curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null
    done
  fi
  # เวลาเริ่มใช้กฎที่ถอยไป 30 วันระหว่างรัน — ค้างไว้ = งานวันนี้ของทุกชุดที่รันต่อล็อกทั้งที่ฐานนี้เพิ่งเปิดกฎ
  # ลบแถวจดค่าเดิมในคำสั่งเดียวกับที่คืน — คืนไม่สำเร็จ แถวจดยังอยู่ให้รอบหน้าคืนให้
  [ -n "$SEED_AT" ] && DB "update \"AppSetting\" set \"createdAt\"='$SEED_AT' where id=$SEED_ID;
      delete from \"AppSetting\" where key='$SEED_MARK'" >/dev/null
  if [ -n "$SAVED_USERS" ]; then
    DB "update \"User\" set region=nullif('$OLD_REGION',''), \"supervisedTeams\"=coalesce(string_to_array(nullif('$OLD_TEAMS',''),','),'{}') where \"employeeCode\"='S001'" >/dev/null
    DB "update \"User\" set team=nullif('$OLD_TEAM','') where \"employeeCode\"='T001'" >/dev/null
  fi
  DB "delete from \"OutsourceTeam\" where name='ZDCOS$SUF'" >/dev/null
  DB "delete from \"AppSetting\" where id>$MAXSET0 and key<>'$SEED_MARK'" >/dev/null
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
  ('ZDCS$SUF','ซุปเปอร์ทดสอบเวลาปิดรับ','SUPER_ADMIN','$HASH',false),
  ('ZDCP$SUF','แอดมินอะไหล่ทดสอบเวลาปิดรับ','PARTS_ADMIN','$HASH',false),
  ('ZDCR$SUF','Area ทดสอบเวลาปิดรับ','AREA','$HASH',false),
  ('ZDCA$SUF','แอดมินสองทดสอบเวลาปิดรับ','ADMIN','$HASH',false)" >/dev/null
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
[ "$(echo "$R" | J 'd.error')" = "ตั้งเวลาปิดรับปล่อยงานได้เฉพาะแอดมิน" ] && [ "$(PUTCODE $T '{"time":"17:00"}')" = "403" ] && [ "$(MAXSET)" = "$M1" ] \
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
[ "$(echo "$R" | J '[d.time, d.previous, d.changedByName].join("|")')" = "16:30|15:30|แอดมินสองทดสอบเวลาปิดรับ" ] \
  && pass "\"เปลี่ยนล่าสุด\" ยังขึ้นชื่อแอดมินที่ถูกลบ: 15:30 → 16:30" || fail "ชื่อหายหลังลบ: $R"

echo
echo "═══ Super Admin เปลี่ยนได้ (เจ้าของงาน: แอดมินทุกคนรวม Super Admin)"
R=$(GETCUT $SA)
R2=$(PUTCUT $SA '{"time":"17:00"}')
[ "$(echo "$R" | J 'd.canEdit')" = "true" ] \
  && [ "$(echo "$R2" | J '[d.time, d.previous, d.changedByName].join("|")')" = "17:00|16:30|ซุปเปอร์ทดสอบเวลาปิดรับ" ] \
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
echo "═══ คณิตเส้นตาย (utils/dispatchCutoff.ts — เวลาที่ส่งเข้าไปเอง ไม่ขึ้นกับเวลาที่รัน)"
OUT=$(node_modules/.bin/ts-node --transpile-only -e '
  import { addDays, deadlineOf, firstEnforcedDay, lockedDates, releaseState } from "./src/utils/dispatchCutoff";
  const ok = (c: boolean, m: string, extra = "") => console.log(c ? `PASS ${m}` : `FAIL ${m} ${extra}`);
  const iso = (d: Date) => d.toISOString();
  const at = (s: string) => new Date(s);
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const cfg = (time: string, since = "2026-01-01T00:00:00.000Z") =>
    ({ time, since: at(since), changedAt: null, changedByName: null, previous: null });
  const wo = (status: string, d: string | null, extra: object = {}) =>
    ({ status, isTest: false, scheduledAt: d ? (d.includes("T") ? at(d) : day(d)) : null, urgentReleaseFor: null, ...extra });

  // 2026-11-02 เป็นวันจันทร์ — เส้นตายคืออาทิตย์ 1 พ.ย. 16:00 เวลาไทย (= 09:00Z)
  const mon = deadlineOf("2026-11-02", "16:00");
  ok(iso(mon) === "2026-11-01T09:00:00.000Z" && new Date(mon.getTime() + 7 * 3600e3).getUTCDay() === 0,
     "งานวันจันทร์ปิดรับวันอาทิตย์ 16:00 (ทุกวันนับเหมือนกัน)", iso(mon));
  ok(iso(deadlineOf("2027-01-01", "16:00")) === "2026-12-31T09:00:00.000Z"
     && iso(deadlineOf("2028-03-01", "15:30")) === "2028-02-29T08:30:00.000Z"
     && addDays("2026-12-31", 1) === "2027-01-01",
     "ข้ามปี/สิ้นเดือน: 1 ม.ค. 2027 → 31 ธ.ค. 16:00 · 1 มี.ค. 2028 → 29 ก.พ. (ปีอธิกสุรทิน)");

  const c16 = cfg("16:00");
  const a = wo("ASSIGNED", "2026-11-02");
  const before = releaseState(a, c16, at("2026-11-01T08:59:59.999Z"));
  const sharp = releaseState(a, c16, at("2026-11-01T09:00:00.000Z"));
  ok(before?.locked === false && sharp?.locked === true && sharp?.past === false && sharp?.enforced === true,
     "15:59:59.999 ยังปล่อยได้ · 16:00:00.000 ล็อก (ไม่มีเวลาผ่อน)", JSON.stringify({ before, sharp }));
  const insp = releaseState(wo("INSPECT_DISPATCH", "2026-11-02"), c16, at("2026-11-01T09:00:00.000Z"));
  ok(insp?.locked === true, "ส่งช่างตรวจ (INSPECT_DISPATCH) ใช้กฎเดียวกัน (ข้อ ก)");
  ok(releaseState(wo("AWAITING_CONFIRM", "2026-11-02"), c16, at("2026-11-02T03:00:00Z")) === null
     && releaseState(wo("ASSIGNED", "2026-11-02", { isTest: true }), c16, at("2026-11-02T03:00:00Z")) === null
     && releaseState(wo("ASSIGNED", null), c16, at("2026-11-02T03:00:00Z")) === null,
     "ไม่อยู่ใต้กฎ: ขั้นอื่น · ใบทดสอบ (ข้อ 15) · ยังไม่มีวันนัด");

  // scheduledAt ที่ไม่ได้เก็บตรงเที่ยงคืน UTC ใช้วันตาม UTC (แบบ seenMatches) ไม่ใช่วันไทย
  const odd = releaseState(wo("ASSIGNED", "2026-11-02T07:00:00.000Z"), c16, at("2026-11-01T08:00:00Z"));
  const odd2 = releaseState(wo("ASSIGNED", "2026-11-01T17:00:00.000Z"), c16, at("2026-10-31T08:00:00Z"));
  ok(iso(odd!.deadline) === "2026-11-01T09:00:00.000Z" && iso(odd2!.deadline) === "2026-10-31T09:00:00.000Z",
     "scheduledAt ที่ไม่ตรงเที่ยงคืน ใช้วันตาม UTC", `${iso(odd!.deadline)} ${iso(odd2!.deadline)}`);

  // เริ่มใช้กฎหลังเส้นตายของใบนี้ → ไม่ล็อกย้อนหลัง (ข้อ 14)
  const late = releaseState(a, cfg("16:00", "2026-11-01T10:00:00.000Z"), at("2026-11-01T12:00:00Z"));
  ok(late?.enforced === false && late?.locked === false, "เส้นตายก่อนเวลาเริ่มใช้กฎ → enforced=false ไม่ล็อก", JSON.stringify(late));

  // งานด่วนผูกกับวันนัด: ตรงวัน = ปลดล็อก · คนละวัน = ยังล็อก · วันนัดผ่านแล้ว = หมดอายุ (ข้อ 7)
  const now = at("2026-11-01T10:00:00Z");
  const u = releaseState(wo("ASSIGNED", "2026-11-02", { urgentReleaseFor: day("2026-11-02") }), c16, now);
  const uOther = releaseState(wo("ASSIGNED", "2026-11-02", { urgentReleaseFor: day("2026-11-03") }), c16, now);
  const uPast = releaseState(wo("ASSIGNED", "2026-10-30", { urgentReleaseFor: day("2026-10-30") }), c16, now);
  ok(u?.urgent === true && u?.locked === false && uOther?.urgent === false && uOther?.locked === true
     && uPast?.past === true && uPast?.urgentExpired === true && uPast?.urgent === false && uPast?.locked === true,
     "งานด่วนใช้ได้เฉพาะวันนัดที่ตรงกันและยังไม่ผ่าน · วันผ่านแล้ว = หมดอายุและล็อก", JSON.stringify({ u, uOther, uPast }));

  // วันนัดแรกที่กฎมีผล: เปิดกฎ 04:38 → งานวันนี้ไม่ติด งานพรุ่งนี้ติด · เปิดหลังเวลาปิดรับ → เริ่มที่มะรืน
  ok(firstEnforcedDay(cfg("16:00", "2026-10-31T21:38:00.000Z")) === "2026-11-02"
     && firstEnforcedDay(cfg("16:00", "2026-11-01T09:00:00.000Z")) === "2026-11-02"
     && firstEnforcedDay(cfg("16:00", "2026-11-01T09:00:00.001Z")) === "2026-11-03",
     "วันแรกที่กฎมีผล: เปิดกฎเช้า → พรุ่งนี้ · 16:00 พอดี → พรุ่งนี้ · เลย 16:00 → มะรืน");

  // ช่วงวันที่ล็อกและยังไม่ผ่าน (กรองกล่องงานแอดมิน): วันนี้เสมอ · พรุ่งนี้เมื่อเลยเวลาปิดรับ
  const far = cfg("16:00");
  const r1 = lockedDates(far, at("2026-11-02T03:00:00Z"));
  const r2 = lockedDates(far, at("2026-11-02T09:00:00Z"));
  const fresh = cfg("16:00", "2026-11-02T02:00:00.000Z");
  ok(JSON.stringify(r1) === `{"from":"2026-11-02","to":"2026-11-02"}`
     && JSON.stringify(r2) === `{"from":"2026-11-02","to":"2026-11-03"}`
     && lockedDates(fresh, at("2026-11-02T03:00:00Z")) === null
     && JSON.stringify(lockedDates(fresh, at("2026-11-02T09:00:00Z"))) === `{"from":"2026-11-03","to":"2026-11-03"}`,
     "ช่วงวันที่ล็อก: ก่อน 16:00 = วันนี้ · ตั้งแต่ 16:00 = วันนี้ถึงพรุ่งนี้ · วันที่ยังไม่อยู่ใต้กฎไม่นับ",
     JSON.stringify({ r1, r2 }));
  process.exit(0);
' 2>&1) || true
echo "$OUT"
echo "$OUT" | grep -q '^FAIL' && FAILED=1
[ "$(echo "$OUT" | grep -c '^PASS')" = "10" ] || fail "คณิตเส้นตายรันไม่ครบ 10 ข้อ: $(echo "$OUT" | grep -v '^PASS' | head -3 | tr '\n' ' ')"

# ════════════════════════════════════════════════════════════════════════════════
# ก้อน 2a — กฎจริงที่เซิร์ฟเวอร์: ปุ่มปล่อยงาน · แอดมินแก้เป็นงานด่วน · หัวหน้าภาคขอแก้เป็นงานด่วน · ทางที่ไม่ติดกฎ ·
# ทุกทางที่เปลี่ยนวันนัดล้างงานด่วน — ยืนยันที่ฐานข้อมูลทุกข้อ ไม่เชื่อแค่รหัสตอบกลับ
#
# คุมเวลาด้วยสองอย่างเท่านั้น: เวลาปิดรับ (แถว AppSetting ห่างจากตอนนี้ไม่เกิน ±5 นาที) และเวลาเริ่มใช้กฎ (createdAt ของแถวแรก
# ถอยไป 30 วันระหว่างรัน — ไม่งั้นวันที่ migration รัน งานวันนี้ยังไม่อยู่ใต้กฎ ข้อ 14) · คืนทั้งสองอย่างตอนจบ (cleanup)
# ผลต้องเหมือนกันไม่ว่ารันกี่โมง — ไม่มีข้อไหนพึ่ง "ตอนนี้ยังไม่ถึง 16:00"
echo
echo "═══ เตรียมใบงานทดสอบปล่อยงาน (ก้อน 2a)"
. ../tests/lib/fixture-parts.sh
SYM="ทดสอบเวลาปิดรับ $SUF"
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
# หัวหน้าภาคอีกคน ภาคที่ไม่มีสาขาจริง — ใบในภาคใต้อยู่นอกขอบเขตของคนนี้ (403)
DB "insert into \"User\"(\"employeeCode\",name,role,region,\"passwordHash\",\"mustChangePassword\") values
  ('ZDCO$SUF','หัวหน้าภาคอื่นทดสอบเวลาปิดรับ','SUPERVISOR','ภาคทดสอบ$SUF','$HASH',false)" >/dev/null
S=$(login S001); T=$(login T001); SO=$(login ZDCO$SUF)
S_ID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OS=ZDCOS$SUF
POST $A teams/outsource "{\"name\":\"$OS\"}" >/dev/null
# C0001 อยู่ภาคที่ไม่มีหัวหน้าภาคดูแล = ใบ "ไม่มีคนรับ" (แบบเดียวกับ flow-simplify-test.sh)
[ "$(DB "select count(*) from \"User\" where role='SUPERVISOR' and \"deletedAt\" is null and (region=(select region from \"Branch\" where code='C0001') or '$OTEAM'=any(\"supervisedTeams\"))")" = "0" ] \
  || fail "เตรียมข้อมูล: มีหัวหน้าภาคดูแลภาคของ C0001 — ใบไม่มีคนรับทดสอบไม่ได้"
# ค่าเดิมเก็บเป็นแถว key อื่น (readCutoff อ่านเฉพาะ key='dispatchCutoff' — แถวนี้ไม่มีผลกับแอป) ในคำสั่งเดียวกับที่ถอยเวลา
# ถูกฆ่ากลางทาง (SIGKILL ไม่เรียก trap) รอบถัดไปเจอแถวนี้ → FAIL แล้วคืนค่าจริงให้ · ไม่มีแถวนี้ รอบถัดไปจะจำค่าที่ถอยไว้
# เป็น "ค่าเดิม" แล้วคืนค่าผิดให้ทุกรอบ — งานวันนี้ของทุกชุดล็อกตลอดไปโดยไม่มีชุดไหนบอก
DB "insert into \"AppSetting\" (key,value) values ('$SEED_MARK','$SEED_AT');
    update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') - interval '30 days' where id=$SEED_ID" >/dev/null
GETCUT $A >/dev/null

day() { node -e "console.log(new Date(Date.now()+7*3600e3+($1)*86400e3).toISOString().slice(0,10))"; }
TODAY=$(day 0); TOMORROW=$(day 1); YESTERDAY=$(day -1); D2=$(day 2); D3=$(day 3); D5=$(day 5); D6=$(day 6)
# เวลาไทย HH:MM ห่างจากตอนนี้ $1 นาที — เปิด = เส้นตายของพรุ่งนี้ยังไม่ถึง · ปิด = เลยมาแล้ว (งานวันนี้ล็อกเสมอทั้งสองแบบ)
BKK() { node -e "console.log(new Date(Date.now()+7*3600e3+($1)*60e3).toISOString().slice(11,16))"; }
OPEN() { SETCUT "$(BKK 5)"; CUT=$(LATEST | cut -d'|' -f1); }
CLOSE() { SETCUT "$(BKK -2)"; CUT=$(LATEST | cut -d'|' -f1); }
# เส้นตาย ISO ของวันนัด $1 ที่เวลาปิดรับ $2 = วันก่อนวันนัด เวลานั้น เวลาไทย
DL() { node -e "const p=new Date(Date.parse('$1T00:00:00Z')-864e5).toISOString().slice(0,10); console.log(new Date(p+'T$2:00.000+07:00').toISOString())"; }
# "ส. 31 ต.ค." ของวันก่อนวันนัด — ข้อความ "ยังปล่อยงานได้ (ก่อน …)"
SHORTPREV() { node -e "const d=new Date(Date.parse('$1T00:00:00Z')-864e5); console.log(['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'][d.getUTCDay()]+' '+d.getUTCDate()+' '+['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getUTCMonth()])"; }
# รหัสตอบกลับบรรทัดสุดท้าย เนื้อหาข้างบน — ต้องได้ทั้งสองอย่างจากคำขอเดียว (กดซ้ำ = คนละสถานการณ์)
CALL() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3" -w '\n%{http_code}'; }
code_of() { echo "${1##*$'\n'}"; }
body_of() { echo "${1%$'\n'*}"; }
err_of() { body_of "$1" | J 'd.error||""'; }
PC() { CODE -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }

mk() {  # $1 เครื่อง [$2 สาขา] [$3 ความเร่งด่วน] → ใบใหม่ (ขั้นระบุอะไหล่)
  POST $A work-orders "{\"branchCode\":\"${2:-C0006}\",\"jobType\":\"CM\",\"priority\":\"${3:-NORMAL}\",\"contactPhone\":\"089-111-2222\",\"machines\":[{\"code\":\"$1\",\"symptom\":\"$SYM\"}]}" | J 'd.orders?d.orders[0].id:d.id'
}
toConfirm() {  # $1 ใบ $2 วัน [$3 ทีม] [$4 คนกด] → รอแอดมินคอนเฟิร์มลูกค้า (ไม่ใช้อะไหล่ + จ่ายงานในฟอร์มเดียว)
  POST "${4:-$S}" work-orders/$1/parts "{\"needsParts\":false,\"assign\":{\"team\":\"${3:-$TEAM}\",\"scheduledAt\":\"$2\"}}" >/dev/null
}
rel() { toConfirm "$@"; POST $A work-orders/$1/confirm-appointment '{}' >/dev/null; }   # → รอหัวหน้าภาคปล่อยงาน
ST() { DB "select status from \"WorkOrder\" where id=$1"; }
URF() { DB "select coalesce(\"urgentReleaseFor\"::date::text,'-') from \"WorkOrder\" where id=$1"; }
SETURF() { DB "update \"WorkOrder\" set \"urgentReleaseFor\"='$2' where id=$1" >/dev/null; }
NLOG() { DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$1 and action='$2'"; }
UPD() { DB "select \"updatedAt\" from \"WorkOrder\" where id=$1"; }
# ประวัติแถวล่าสุดของ action นี้: note|meta.via|meta.reason|meta.day|ผู้กด|ขั้น
LOGROW() { DB "select coalesce(l.note,'-')||'|'||coalesce(l.meta->>'via','-')||'|'||coalesce(l.meta->>'reason','-')||'|'||coalesce(l.meta->>'day','-')||'|'||coalesce(u.\"employeeCode\",'-')||'|'||l.status from \"WorkOrderLog\" l left join \"User\" u on u.id=l.\"userId\" where l.\"workOrderId\"=$1 and l.action='$2' order by l.id desc limit 1"; }
# ลำดับประวัติชุดนี้ของใบ ตามเวลา (เวลาเท่ากันจะเรียงผิดในทามไลน์ — นับเวลาไม่ซ้ำด้วย)
SEQ() { DB "select string_agg(action, ',' order by \"createdAt\", id)||'|'||count(distinct \"createdAt\") from \"WorkOrderLog\" where \"workOrderId\"=$1 and action in ($2)"; }
L94="คลังลาดพร้าว 94"

OPEN
TD=$(mk W81 C0006 URGENT); rel $TD $TODAY         # งานวันนี้ ตั้ง "ด่วน" ไว้ตั้งแต่เปิดใบ
TD2=$(mk W82); rel $TD2 $TODAY
TM=$(mk W83); rel $TM $TOMORROW
TM2=$(mk W84); rel $TM2 $TOMORROW
OR=$(mk W85 C0001); toConfirm $OR $TODAY "$OTEAM" $A; POST $A work-orders/$OR/confirm-appointment '{}' >/dev/null
IN=$(mk W86); POST $S work-orders/$IN/inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$TOMORROW\"}" >/dev/null
POST $A work-orders/$IN/confirm-appointment '{}' >/dev/null
SB=$(mk W87); rel $SB $TOMORROW "$OS"
DD=$(mk W88); rel $DD $D2
ALLST="$(ST $TD) $(ST $TD2) $(ST $TM) $(ST $TM2) $(ST $OR) $(ST $IN) $(ST $SB) $(ST $DD)"
[ "$ALLST" = "ASSIGNED ASSIGNED ASSIGNED ASSIGNED ASSIGNED INSPECT_DISPATCH ASSIGNED ASSIGNED" ] \
  && pass "เตรียมใบรอปล่อยงาน: วันนี้ (ตั้งด่วน) · วันนี้ · พรุ่งนี้ ×2 · ไม่มีคนรับ · ส่งช่างตรวจ · SUB · มะรืน (ฐานข้อมูล)" \
  || fail "เตรียมใบ: $ALLST"

echo
echo "═══ ปุ่มปล่อยงานติดเวลาปิดรับ (POST /dispatch) — เวลาปิดรับ $CUT (อีกไม่กี่นาที)"
N0=$(NLOG $TD DISPATCHED); U0=$(UPD $TD)
R=$(CALL $S work-orders/$TD/dispatch '{}')
B=$(body_of "$R")
[ "$(code_of "$R")" = 409 ] \
  && [ "$(echo "$B" | J '[d.code, d.past, d.urgentExpired, d.deadline].join("|")')" = "DISPATCH_LOCKED|false|false|$(DL $TODAY $CUT)" ] \
  && [ "$(echo "$B" | J 'Math.abs(Date.parse(d.receivedAt) - Date.now()) < 60000')" = true ] \
  && echo "$B" | J 'd.error' | grep -q "^ปล่อยงานไม่ได้ — เลยเวลาปิดรับแล้ว (ต้องปล่อยก่อน .* $CUT น. ตามเวลาระบบ) · ต้องไปตามนัดจริง — กด “ขอแอดมินแก้เป็นงานด่วน” (หรือโทรหาแอดมิน) · ทีมไม่ว่าง — “ส่งกลับแอดมินนัดใหม่”$" \
  && [ "$(ST $TD)" = ASSIGNED ] && [ "$(NLOG $TD DISPATCHED)" = "$N0" ] && [ "$(UPD $TD)" = "$U0" ] \
  && pass "งานวันนี้ (เส้นตาย = เมื่อวาน $CUT) หัวหน้าภาคกด → 409 DISPATCH_LOCKED บอกเส้นตาย/เวลาที่ได้รับ/ทางไปต่อ · ป้ายด่วนตอนเปิดใบไม่ปลดล็อก · ใบไม่ขยับ ไม่มีประวัติ (ฐานข้อมูล)" \
  || fail "ปล่อยงานวันนี้: $(code_of "$R") $B · $(ST $TD)"
R=$(CALL $A work-orders/$TD/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J 'd.code')" = DISPATCH_LOCKED ] && [ "$(ST $TD)" = ASSIGNED ] \
  && pass "แอดมินกดแทนก็ติดกฎเดียวกัน (ข้อ 10) — 409 ใบอยู่ขั้นเดิม" || fail "แอดมินปล่อยงานวันนี้: $(code_of "$R") · $(ST $TD)"
R=$(CALL $A work-orders/$OR/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J 'd.code')" = DISPATCH_LOCKED ] && [ "$(ST $OR)" = ASSIGNED ] && [ "$(NLOG $OR DISPATCHED)" = 0 ] \
  && pass "ใบไม่มีคนรับ (ภาคไม่มีหัวหน้าภาค) แอดมินปล่อยแทน → 409 เหมือนกัน (ฐานข้อมูล)" || fail "ไม่มีคนรับ: $(code_of "$R") · $(ST $OR)"
# ใบที่ล็อกอยู่ (งานวันนี้) — ถ้าเช็คล็อกก่อนเช็คเจ้าของขั้น ช่างจะได้ 409 พร้อมคำแนะนำของหัวหน้าภาค ("ขอแอดมินแก้เป็นงานด่วน")
# ซึ่งช่างทำไม่ได้ · ลองกับใบที่ยังไม่ล็อกจะผ่านทั้งสองลำดับ ไม่ได้ทดสอบอะไร
R=$(CALL $T work-orders/$TD/dispatch '{}')
[ "$(code_of "$R")" = 403 ] && [ "$(body_of "$R" | J 'd.code === undefined')" = true ] && err_of "$R" | grep -q "^ขั้นนี้เป็นของ" \
  && [ "$(ST $TD)" = ASSIGNED ] && [ "$(NLOG $TD DISPATCHED)" = "$N0" ] \
  && pass "ช่างกดปล่อยงานใบที่ล็อก → 403 \"ขั้นนี้เป็นของ…\" ไม่ใช่ 409 ล็อก (เจ้าของขั้นตัดสินก่อนเวลาปิดรับ) ใบไม่ขยับ (ฐานข้อมูล)" \
  || fail "ช่างปล่อยงานใบที่ล็อก: $(code_of "$R") $(body_of "$R") · $(ST $TD)"
OPEN
R=$(CALL $S work-orders/$TM/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $TM)" = IN_PROGRESS ] && [ "$(NLOG $TM DISPATCHED)" = 1 ] \
  && pass "งานพรุ่งนี้ ก่อนเวลาปิดรับ ($CUT) → ปล่อยได้ ใบถึงช่าง (ฐานข้อมูล)" || fail "ปล่อยงานพรุ่งนี้ก่อนปิดรับ: $(code_of "$R") $(err_of "$R") · $(ST $TM)"

CLOSE
R=$(CALL $S work-orders/$TM2/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J '[d.code, d.past, d.deadline].join("|")')" = "DISPATCH_LOCKED|false|$(DL $TOMORROW $CUT)" ] \
  && err_of "$R" | grep -q "เลยเวลาปิดรับ" && [ "$(ST $TM2)" = ASSIGNED ] && [ "$(NLOG $TM2 DISPATCHED)" = 0 ] \
  && pass "งานพรุ่งนี้ หลังเวลาปิดรับ ($CUT เพิ่งผ่าน) → 409 เส้นตาย = วันนี้ $CUT (ฐานข้อมูล)" || fail "ปล่อยงานพรุ่งนี้หลังปิดรับ: $(code_of "$R") $(body_of "$R")"
R=$(CALL $S work-orders/$IN/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J 'd.code')" = DISPATCH_LOCKED ] && [ "$(ST $IN)" = INSPECT_DISPATCH ] \
  && pass "ส่งช่างตรวจ (INSPECT_DISPATCH) พรุ่งนี้หลังปิดรับ → 409 กฎเดียวกัน (ข้อ ก)" || fail "ส่งช่างตรวจ: $(code_of "$R") · $(ST $IN)"
R=$(CALL $S work-orders/$SB/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J 'd.code')" = DISPATCH_LOCKED ] && [ "$(ST $SB)" = ASSIGNED ] \
  && pass "ใบงาน SUB (ทีม outsource) พรุ่งนี้หลังปิดรับ → 409 กฎเดียวกัน (ข้อ 15)" || fail "SUB: $(code_of "$R") · $(ST $SB)"
R=$(CALL $S work-orders/$DD/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $DD)" = IN_PROGRESS ] \
  && pass "งานมะรืน (เส้นตาย = พรุ่งนี้ $CUT) ปล่อยล่วงหน้าได้เสมอ (ฐานข้อมูล)" || fail "ปล่อยงานมะรืน: $(code_of "$R") $(err_of "$R")"
TC=$(POST $A work-orders/$TM2/test-copy '{}' | J 'd.id')
R=$(CALL $S work-orders/$TC/dispatch '{}')
[ "$(DB "select \"isTest\"::text||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$TC")" = "true|$TOMORROW" ] \
  && [ "$(code_of "$R")" = 200 ] && [ "$(ST $TC)" = IN_PROGRESS ] \
  && pass "ใบทดสอบที่คัดลอกจากใบที่ล็อก (วันเดียวกัน) ปล่อยได้ — ใบทดสอบไม่ติดเวลาปิดรับ (ข้อ 15)" || fail "ใบทดสอบ: $(code_of "$R") $(err_of "$R") · $(ST $TC)"
OPEN
R=$(CALL $S work-orders/$TM2/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $TM2)" = IN_PROGRESS ] \
  && pass "แอดมินเลื่อนเวลาปิดรับให้ช้าลง ($CUT) → ใบที่เพิ่งล็อกกดได้ทันทีในครั้งถัดไป (ข้อ 13)" || fail "เลื่อนเวลาแล้ว: $(code_of "$R") $(err_of "$R")"
# เวลาเริ่มใช้กฎ = ตอนนี้ → เส้นตายของงานวันนี้ (เมื่อวาน) อยู่ก่อนเริ่มกฎ ไม่ล็อกย้อนหลัง (ข้อ 14)
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') where id=$SEED_ID" >/dev/null; GETCUT $A >/dev/null
R=$(CALL $S work-orders/$TD2/dispatch '{}')
DB "update \"AppSetting\" set \"createdAt\"=(now() at time zone 'UTC') - interval '30 days' where id=$SEED_ID" >/dev/null; GETCUT $A >/dev/null
[ "$(code_of "$R")" = 200 ] && [ "$(ST $TD2)" = IN_PROGRESS ] \
  && pass "เริ่มใช้กฎหลังเส้นตายของใบ (งานวันนี้ตอนเปิดกฎ) → ไม่ล็อกย้อนหลัง ปล่อยได้ (ข้อ 14)" || fail "ไม่ล็อกย้อนหลัง: $(code_of "$R") $(err_of "$R")"

echo
echo "═══ แอดมินแก้เป็นงานด่วน (POST /urgent-release)"
UT=$(mk W89); rel $UT $TOMORROW
UR2=$(mk W90); rel $UR2 $TODAY
UP=$(mk W91); rel $UP $TODAY
UM=$(mk W92); rel $UM $TODAY
R=$(CALL $S work-orders/$TD/urgent-release '{}')
[ "$(code_of "$R")" = 403 ] && [ "$(err_of "$R")" = "แก้เป็นงานด่วนได้เฉพาะแอดมิน — หัวหน้าภาคกด “ขอแอดมินแก้เป็นงานด่วน” ในหน้าปล่อยงาน" ] \
  && [ "$(PC $T work-orders/$TD/urgent-release '{}')" = 403 ] && [ "$(URF $TD)" = - ] && [ "$(NLOG $TD URGENT_RELEASE)" = 0 ] \
  && pass "หัวหน้าภาค/ช่างแก้เป็นงานด่วนไม่ได้ (403 บอกให้ใช้ปุ่มขอ) ฐานข้อมูลไม่เปลี่ยน" || fail "หัวหน้าภาค/ช่าง urgent: $(code_of "$R") $(err_of "$R")"
R=$(POST $PA work-orders/$TD/urgent-release '{}'); R2=$(POST $VA work-orders/$TD/urgent-release '{}')
echo "$R" | grep -q "Admin Spare Part ดูได้อย่างเดียว" && echo "$R2" | grep -q "ดูในฐานะผู้ใช้อื่น" \
  && [ "$(PC $AR work-orders/$TD/urgent-release '{}')" = 403 ] && [ "$(URF $TD)" = - ] \
  && pass "Admin Spare Part · ดูในฐานะ · ทีม Area แก้ไม่ได้ (403 จาก middleware) ฐานข้อมูลไม่เปลี่ยน" || fail "PA/VA/Area urgent: $R · $R2"
OPEN
R=$(CALL $A work-orders/$UT/urgent-release '{"reason":"ทดสอบ"}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q " ยังปล่อยงานได้ (ก่อน $(SHORTPREV $TOMORROW) $CUT น.) — ไม่ต้องแก้เป็นงานด่วน$" \
  && [ "$(URF $UT)" = - ] && [ "$(NLOG $UT URGENT_RELEASE)" = 0 ] \
  && pass "งานพรุ่งนี้ที่ยังไม่ถึงเวลาปิดรับ → 409 \"ยังปล่อยงานได้ (ก่อน …)\" ไม่ตั้ง ไม่ลงประวัติ (ขอบเขตข้อ 1)" || fail "urgent ก่อนปิดรับ: $(code_of "$R") $(err_of "$R") · $(URF $UT)"
# แถวของใบในกล่องงานหัวหน้าภาค: "ค้างขั้นนี้ตั้งแต่"|ป้าย "คอนเฟิร์มวันใหม่"
INB() { curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J "const r=d.rows.find(x=>x.id===$1); r ? [r.stageSince, r.rescheduled].join('|') : 'missing'"; }
BEFORE=$(INB $TD)
R=$(CALL $A work-orders/$TD/urgent-release '{"reason":"ร้านต้องการวันนี้จริง"}')
L=$(LOGROW $TD URGENT_RELEASE)
[ "$(code_of "$R")" = 200 ] && [ "$(body_of "$R" | J 'd.id')" = "$TD" ] \
  && [ "$(DB "select \"urgentReleaseFor\" = \"scheduledAt\" from \"WorkOrder\" where id=$TD")" = t ] \
  && [ "$(DB "select status||'|'||priority from \"WorkOrder\" where id=$TD")" = "ASSIGNED|URGENT" ] \
  && [[ "$L" == "ปล่อยหลังเวลาปิดรับได้ · ร้านต้องการวันนี้จริง · นัด "*"|direct|ร้านต้องการวันนี้จริง|$TODAY|A001|ASSIGNED" ]] \
  && [ "$(INB $TD)" = "$BEFORE" ] && [ "$BEFORE" != missing ] \
  && pass "แอดมินแก้เป็นงานด่วน (มีเหตุผล): วันที่ปลดล็อก = วันนัด · ขั้น/ความเร่งด่วนไม่เปลี่ยน (ข้อ 3) · ประวัติ via=direct · ค้างขั้นนี้ไม่เริ่มนับใหม่ (ฐานข้อมูล)" \
  || fail "urgent: $(code_of "$R") $(err_of "$R") · $L · $(INB $TD) vs $BEFORE"
# ป้าย "คอนเฟิร์มวันใหม่" ต้องรอดการแก้เป็นงานด่วน — ใบที่ถูกเลื่อนวันจริงเท่านั้นที่ทดสอบได้ (ใบที่ไม่เคยเลื่อน ป้ายเป็นเท็จทั้งก่อน/หลัง
# ใส่ URGENT_RELEASE ใน DATE_SETTLE_ACTIONS ก็ยังผ่าน) · แอดมินเลื่อนวันนัดเป็นวันนี้ = ล็อกเสมอไม่ว่ารันกี่โมง แก้เป็นงานด่วนได้
UMV=$(mk W81); rel $UMV $D2   # เครื่องเดียวกับ TD — ไม่สร้างเครื่องใหม่ค้างในสาขา
POST $A work-orders/$UMV/reschedule "{\"scheduledAt\":\"$TODAY\",\"reason\":\"ร้านขอเร็วขึ้นเป็นวันนี้\"}" >/dev/null
BEFORE=$(INB $UMV)
R=$(CALL $A work-orders/$UMV/urgent-release '{}')
AFTER=$(INB $UMV)
[ "$(code_of "$R")" = 200 ] && [ "$(ST $UMV)|$(URF $UMV)" = "ASSIGNED|$TODAY" ] \
  && [[ "$BEFORE" == *"|true" ]] && [ "$AFTER" = "$BEFORE" ] \
  && pass "แก้เป็นงานด่วนใบที่แอดมินเพิ่งเลื่อนวัน: ป้าย \"คอนเฟิร์มวันใหม่\" ยังอยู่ · ค้างขั้นนี้ไม่เริ่มนับใหม่ (กล่องงานหัวหน้าภาค · ฐานข้อมูล)" \
  || fail "ป้ายคอนเฟิร์มวันใหม่หลังแก้เป็นงานด่วน: $(code_of "$R") $(err_of "$R") · $(ST $UMV) $(URF $UMV) · ก่อน=$BEFORE หลัง=$AFTER"
TMPD=$(mktemp -d)
PC $A work-orders/$UR2/urgent-release '{}' > $TMPD/1 & PC $SA work-orders/$UR2/urgent-release '{}' > $TMPD/2 & wait
CODES=$(sort $TMPD/1 $TMPD/2 | tr '\n' ' '); rm -rf $TMPD
[ "$CODES" = "200 409 " ] && [ "$(NLOG $UR2 URGENT_RELEASE)" = 1 ] && [ "$(URF $UR2)" = "$TODAY" ] \
  && pass "แอดมินสองคนกดพร้อมกัน: ผ่านคนเดียว อีกคน 409 ประวัติแถวเดียว (ฐานข้อมูล)" || fail "กดพร้อมกัน: $CODES ประวัติ $(NLOG $UR2 URGENT_RELEASE)"
R=$(CALL $A work-orders/$UR2/urgent-release '{}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q " แก้เป็นงานด่วนไว้แล้ว (นัด .*) — หัวหน้าภาคปล่อยงานได้เลย$" && [ "$(NLOG $UR2 URGENT_RELEASE)" = 1 ] \
  && pass "กดซ้ำ → 409 \"แก้เป็นงานด่วนไว้แล้ว\" ไม่มีประวัติซ้ำ" || fail "กดซ้ำ: $(code_of "$R") $(err_of "$R")"
R=$(CALL $S work-orders/$TD/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $TD)" = IN_PROGRESS ] \
  && pass "หลังแก้เป็นงานด่วน หัวหน้าภาคปล่อยงานวันนี้ได้ทันที (ฐานข้อมูล)" || fail "ปล่อยหลังงานด่วน: $(code_of "$R") $(err_of "$R")"
R=$(CALL $A work-orders/$TD/urgent-release '{}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q "แก้เป็นงานด่วนได้เฉพาะใบที่รอหัวหน้าภาครับทราบ ปล่อยงาน / ส่งช่างตรวจ$" \
  && pass "ใบที่ปล่อยไปแล้ว (ขั้นช่าง) → 409 บอกว่าแก้ได้เฉพาะขั้นปล่อยงาน" || fail "urgent หลังปล่อย: $(code_of "$R") $(err_of "$R")"
TC2=$(POST $A work-orders/$UP/test-copy '{}' | J 'd.id')
R=$(CALL $A work-orders/$TC2/urgent-release '{}')
[ "$(code_of "$R")" = 400 ] && [ "$(err_of "$R")" = "ใบทดสอบไม่ติดเวลาปิดรับ — ปล่อยงานได้เลย" ] && [ "$(URF $TC2)" = - ] \
  && pass "ใบทดสอบ → 400 \"ใบทดสอบไม่ติดเวลาปิดรับ\"" || fail "urgent ใบทดสอบ: $(code_of "$R") $(err_of "$R")"
R=$(CALL $A work-orders/$UP/urgent-release '{"reason":"x","seenScheduledAt":"'$D5'"}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q "ใบงานนี้เพิ่งถูกเปลี่ยน" && [ "$(URF $UP)" = - ] \
  && pass "หน้าจอเห็นวันนัดอื่น (แอดมินอีกคนเพิ่งเลื่อน) → 409 ไม่ปลดล็อกวันที่ไม่ได้ตั้งใจ" || fail "seen ไม่ตรง: $(code_of "$R") $(err_of "$R")"
DB "update \"WorkOrder\" set \"scheduledAt\"='$YESTERDAY' where id=$UP" >/dev/null
R=$(CALL $A work-orders/$UP/urgent-release '{}')
R2=$(CALL $S work-orders/$UP/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q " วันนัด .* ผ่านไปแล้ว — แก้เป็นงานด่วนไม่ได้ ต้องเลื่อนวันนัด$" && [ "$(URF $UP)" = - ] \
  && [ "$(code_of "$R2")" = 409 ] && [ "$(body_of "$R2" | J '[d.code, d.past, d.urgentExpired].join("|")')" = "DISPATCH_LOCKED|true|false" ] \
  && [ "$(err_of "$R2")" = "ปล่อยงานไม่ได้ — วันนัดผ่านไปแล้ว · แอดมินต้องโทรร้านเลื่อนวันนัด" ] && [ "$(ST $UP)" = ASSIGNED ] \
  && pass "วันนัดผ่านไปแล้ว: แก้เป็นงานด่วนไม่ได้ (409 ต้องเลื่อนวันนัด) · ปล่อยงาน 409 past=true (ฐานข้อมูล)" || fail "วันผ่าน: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(body_of "$R2")"
DB "update \"WorkOrder\" set \"scheduledAt\"='$YESTERDAY', \"urgentReleaseFor\"='$YESTERDAY' where id=$UR2" >/dev/null
R=$(CALL $S work-orders/$UR2/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J '[d.code, d.past, d.urgentExpired].join("|")')" = "DISPATCH_LOCKED|true|true" ] \
  && err_of "$R" | grep -q "งานด่วนหมดอายุ — วันนัดผ่านแล้ว" && [ "$(ST $UR2)" = ASSIGNED ] \
  && pass "งานด่วนหมดอายุเมื่อวันนัดผ่าน → 409 urgentExpired=true (ข้อ 7)" || fail "งานด่วนหมดอายุ: $(code_of "$R") $(body_of "$R")"
SETURF $UM $D2
R=$(CALL $S work-orders/$UM/dispatch '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(body_of "$R" | J 'd.code')" = DISPATCH_LOCKED ] && [ "$(ST $UM)" = ASSIGNED ] \
  && pass "วันที่ปลดล็อกไม่ตรงวันนัด (ทางเลื่อนวันที่ลืมล้าง) → ยังล็อก ไม่ปลดล็อกวันที่แอดมินไม่ได้ตั้งใจ" || fail "urgent คนละวัน: $(code_of "$R")"

echo
echo "═══ ติ๊ก \"แก้เป็นงานด่วนไปพร้อมกัน\" ในฟอร์มคอนเฟิร์มลูกค้า / เลื่อนวันนัด"
CLOSE
UC=$(mk W93); toConfirm $UC $TOMORROW
R=$(CALL $A work-orders/$UC/confirm-appointment '{"urgent":true,"note":"ร้านต้องการพรุ่งนี้"}')
L=$(LOGROW $UC URGENT_RELEASE)
[ "$(code_of "$R")" = 200 ] && [ "$(ST $UC)|$(URF $UC)" = "ASSIGNED|$TOMORROW" ] \
  && [ "$(SEQ $UC "'CONFIRMED','URGENT_RELEASE'")" = "CONFIRMED,URGENT_RELEASE|2" ] \
  && [[ "$L" == "ตอนคอนเฟิร์มลูกค้า · ร้านต้องการพรุ่งนี้ · นัด "*"|confirm|ร้านต้องการพรุ่งนี้|$TOMORROW|A001|ASSIGNED" ]] \
  && pass "คอนเฟิร์มพรุ่งนี้หลังปิดรับ + ติ๊กงานด่วน: ประวัติคอนเฟิร์ม → แก้เป็นงานด่วน (เวลาไม่ชนกัน) via=confirm (ฐานข้อมูล)" || fail "คอนเฟิร์ม+urgent: $(code_of "$R") $(err_of "$R") · $(ST $UC) $(URF $UC) · $(SEQ $UC "'CONFIRMED','URGENT_RELEASE'") · $L"
R=$(CALL $S work-orders/$UC/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $UC)" = IN_PROGRESS ] && pass "แล้วหัวหน้าภาคปล่อยได้เลย (ฐานข้อมูล)" || fail "ปล่อยหลังคอนเฟิร์ม+urgent: $(code_of "$R") $(err_of "$R")"
UI=$(mk W94); toConfirm $UI $D2
R=$(CALL $A work-orders/$UI/confirm-appointment '{"urgent":true}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $UI)|$(URF $UI)|$(NLOG $UI URGENT_RELEASE)|$(NLOG $UI CONFIRMED)" = "ASSIGNED|-|0|1" ] \
  && pass "ติ๊กงานด่วนมากับวันมะรืน (เส้นตายยังไม่ถึง) → ไม่สนใจ: ไม่ตั้ง ไม่ลงประวัติ คอนเฟิร์มผ่านปกติ (ฐานข้อมูล)" || fail "urgent ที่ไม่ต้องใช้: $(code_of "$R") · $(ST $UI) $(URF $UI)"
ULP=$(mk W95); toConfirm $ULP $D2
DB "update \"WorkOrder\" set \"scheduledAt\"='$YESTERDAY' where id=$ULP" >/dev/null
R=$(CALL $A work-orders/$ULP/confirm-appointment '{"urgent":true}')
[ "$(code_of "$R")" = 400 ] && [ "$(err_of "$R")" = "วันนัดผ่านไปแล้ว — แก้เป็นงานด่วนไม่ได้ ต้องเลื่อนวันนัด" ] && [ "$(ST $ULP)|$(URF $ULP)" = "AWAITING_CONFIRM|-" ] \
  && pass "คอนเฟิร์มวันเดิมที่ผ่านไปแล้ว + ติ๊กงานด่วน → 400 ใบไม่ขยับ" || fail "urgent วันผ่าน: $(code_of "$R") $(err_of "$R") · $(ST $ULP)"
UN=$(mk W96); toConfirm $UN $D2
R=$(CALL $A work-orders/$UN/confirm-appointment "{\"scheduledAt\":\"$TOMORROW\"}")
R2=$(CALL $S work-orders/$UN/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $UN)|$(URF $UN)|$(NLOG $UN RESCHEDULED)" = "ASSIGNED|-|1" ] \
  && [ "$(code_of "$R2")" = 409 ] && [ "$(body_of "$R2" | J 'd.code')" = DISPATCH_LOCKED ] \
  && pass "ลูกค้าขอเลื่อนเป็นพรุ่งนี้หลังปิดรับ ไม่ติ๊ก → ใบถึงหัวหน้าภาคแบบล็อก (409)" || fail "คอนเฟิร์มเลื่อนไม่ติ๊ก: $(code_of "$R") · $(ST $UN) · $(code_of "$R2")"
# ใบเก่าที่ยังต้องเบิก: คอนเฟิร์ม+งานด่วน → ไปเบิกก่อน แล้วถึงหัวหน้าภาคแบบปลดล็อกสำหรับวันนั้น (งานด่วนติดไปกับใบ)
LG=$(mk W97); BLG=$(fx_part $LG BOARD)
POST $S work-orders/$LG/parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BLG,\"quantity\":1}]}" >/dev/null
POST $A work-orders/$LG/parts-sourcing "{\"results\":[{\"sparePartId\":$BLG,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
POST $S work-orders/$LG/assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$TOMORROW\"}" >/dev/null
[ "$(ST $LG)" = PARTS_REQUESTED ] || fail "เตรียมใบเก่าที่ยังต้องเบิก: $(ST $LG)"
DB "update \"WorkOrder\" set status='AWAITING_CONFIRM', \"appointmentStatus\"='PENDING' where id=$LG" >/dev/null
CLOSE
R=$(CALL $A work-orders/$LG/confirm-appointment '{"urgent":true}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $LG)|$(URF $LG)|$(NLOG $LG URGENT_RELEASE)" = "PARTS_REQUESTED|$TOMORROW|1" ] \
  && pass "ใบเก่าที่ยังต้องเบิก: คอนเฟิร์ม+งานด่วน → ไปขั้นเบิก งานด่วนติดไปกับใบ (ฐานข้อมูล)" || fail "ใบเก่า+urgent: $(code_of "$R") $(err_of "$R") · $(ST $LG) $(URF $LG)"
POST $A work-orders/$LG/parts-check "{\"results\":[{\"sparePartId\":$BLG,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-DC$SUF\"}]}" >/dev/null
R=$(CALL $S work-orders/$LG/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $LG)" = IN_PROGRESS ] \
  && pass "เบิกเสร็จใบถึงหัวหน้าภาคเอง (คอนเฟิร์มแล้ว) ปล่อยได้ทั้งที่เลยเวลาปิดรับ — ขั้นเบิกไม่ล้างงานด่วน (ฐานข้อมูล)" || fail "ใบเก่าหลังเบิก: $(code_of "$R") $(err_of "$R") · $(ST $LG) $(URF $LG)"
URS=$(mk W98); rel $URS $D2
R=$(CALL $A work-orders/$URS/reschedule "{\"scheduledAt\":\"$TOMORROW\",\"reason\":\"ร้านขอพรุ่งนี้\",\"urgent\":true}")
L=$(LOGROW $URS URGENT_RELEASE)
[ "$(code_of "$R")" = 200 ] && [ "$(ST $URS)|$(URF $URS)" = "ASSIGNED|$TOMORROW" ] \
  && [ "$(SEQ $URS "'APPOINTMENT_MOVED','URGENT_RELEASE'")" = "APPOINTMENT_MOVED,URGENT_RELEASE|2" ] \
  && [[ "$L" == "ตอนเลื่อนวันนัด · ร้านขอพรุ่งนี้ · นัด "*"|reschedule|ร้านขอพรุ่งนี้|$TOMORROW|A001|ASSIGNED" ]] \
  && [ "$(code_of "$(CALL $S work-orders/$URS/dispatch '{}')")" = 200 ] && [ "$(ST $URS)" = IN_PROGRESS ] \
  && pass "เลื่อนวันนัดเป็นพรุ่งนี้หลังปิดรับ + ติ๊กงานด่วน → via=reschedule แล้วหัวหน้าภาคปล่อยได้ (ฐานข้อมูล)" || fail "เลื่อน+urgent: $(code_of "$R") $(err_of "$R") · $(ST $URS) $(URF $URS) · $L"
R=$(CALL $A work-orders/$DD/reschedule "{\"scheduledAt\":\"$TOMORROW\",\"reason\":\"ร้านขอเร็วขึ้น\",\"urgent\":true}")
[ "$(code_of "$R")" = 200 ] && [ "$(ST $DD)|$(URF $DD)" = "ASSIGNED|$TOMORROW" ] \
  && [ "$(SEQ $DD "'APPOINTMENT_RECALLED','URGENT_RELEASE'")" = "APPOINTMENT_RECALLED,URGENT_RELEASE|2" ] \
  && pass "ดึงงานคืนจากช่าง (ยังไม่ถึงหน้างาน) เป็นพรุ่งนี้ + ติ๊กงานด่วน → กลับขั้นปล่อยงานแบบปลดล็อก (ฐานข้อมูล)" || fail "ดึงคืน+urgent: $(code_of "$R") $(err_of "$R") · $(ST $DD) $(URF $DD)"
UIR=$(mk W99); rel $UIR $D2
R=$(CALL $A work-orders/$UIR/reschedule "{\"scheduledAt\":\"$D3\",\"reason\":\"ร้านขอเลื่อน\",\"urgent\":true}")
[ "$(code_of "$R")" = 200 ] && [ "$(URF $UIR)|$(NLOG $UIR URGENT_RELEASE)|$(NLOG $UIR APPOINTMENT_MOVED)" = "-|0|1" ] \
  && pass "เลื่อนไปวันที่เส้นตายยังไม่ถึง + ติ๊กงานด่วน → ไม่สนใจ เลื่อนผ่านปกติ (ฐานข้อมูล)" || fail "เลื่อน urgent ไม่ต้องใช้: $(code_of "$R") · $(URF $UIR)"

echo
echo "═══ หัวหน้าภาคขอแอดมินแก้เป็นงานด่วน (POST /urgent-request · /urgent-request/cancel)"
CLOSE
RQ=$(mk W100); rel $RQ $TOMORROW
RU=$(mk W101); rel $RU $D2
RV=$(mk W102); rel $RV $TOMORROW
RD=$(mk W103); rel $RD $TOMORROW
RP=$(mk W104); rel $RP $TODAY
R=$(CALL $S work-orders/$RU/urgent-request '{"note":"ขอไว้ก่อน"}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q " ยังปล่อยงานได้ (ก่อน $(SHORTPREV $D2) $CUT น.) — ไม่ต้องขอแอดมิน$" && [ "$(NLOG $RU URGENT_REQUESTED)" = 0 ] \
  && pass "ใบที่ยังปล่อยได้ → 409 \"ยังปล่อยงานได้ (ก่อน …) — ไม่ต้องขอแอดมิน\" ไม่ลงประวัติ" || fail "ขอทั้งที่ยังปล่อยได้: $(code_of "$R") $(err_of "$R")"
U0=$(UPD $RQ)
# คำขอ/ยกเลิกคำขอไม่ใช่การเดินขั้น (NON_STAGE_ACTIONS) — ขอทีไร "ค้างขั้นนี้มา N วัน" เริ่มนับใหม่ = ใบที่ค้างนานดูเหมือนเพิ่งมาถึง
SS0=$(INB $RQ)
R=$(CALL $S work-orders/$RQ/urgent-request '{"note":"ทีมว่างพรุ่งนี้ ต้องไปจริง"}')
[ "$(code_of "$R")" = 200 ] && [ "$(LOGROW $RQ URGENT_REQUESTED)" = "ทีมว่างพรุ่งนี้ ต้องไปจริง|-|-|-|S001|ASSIGNED" ] \
  && [ "$(ST $RQ)|$(URF $RQ)" = "ASSIGNED|-" ] && [ "$(UPD $RQ)" != "$U0" ] && [ "$SS0" != missing ] && [ "$(INB $RQ)" = "$SS0" ] \
  && pass "ใบที่ล็อก → ขอได้: ประวัติ \"ขอแอดมินแก้เป็นงานด่วน\" พร้อมข้อความ ใบอยู่ขั้นเดิม ค้างขั้นนี้ไม่เริ่มนับใหม่ (ฐานข้อมูล)" || fail "ขอแก้เป็นงานด่วน: $(code_of "$R") $(err_of "$R") · $(LOGROW $RQ URGENT_REQUESTED) · ก่อน=$SS0 หลัง=$(INB $RQ)"
R=$(CALL $S work-orders/$RQ/urgent-request '{}')
[ "$(code_of "$R")" = 409 ] && [ "$(err_of "$R")" = "ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน" ] && [ "$(NLOG $RQ URGENT_REQUESTED)" = 1 ] \
  && pass "ขอซ้ำระหว่างรอ → 409 \"ส่งคำขอแล้ว\" ประวัติแถวเดียว" || fail "ขอซ้ำ: $(code_of "$R") $(err_of "$R")"
R=$(CALL $S work-orders/$RQ/urgent-request/cancel '{}')
R2=$(CALL $S work-orders/$RQ/urgent-request/cancel '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(LOGROW $RQ URGENT_REQUEST_CANCELLED | cut -d'|' -f5,6)" = "S001|ASSIGNED" ] \
  && [ "$(code_of "$R2")" = 409 ] && [ "$(err_of "$R2")" = "ไม่มีคำขอที่รอแอดมิน — แอดมินอาจแก้เป็นงานด่วนไปแล้ว ลองรีเฟรช" ] \
  && [ "$(INB $RQ)" = "$SS0" ] \
  && pass "ยกเลิกคำขอ → ประวัติ \"ยกเลิกคำขอ\" ค้างขั้นนี้ไม่เริ่มนับใหม่ · ยกเลิกซ้ำ → 409 ไม่มีคำขอที่รอ (ฐานข้อมูล)" || fail "ยกเลิก: $(code_of "$R") · $(code_of "$R2") $(err_of "$R2") · ก่อน=$SS0 หลัง=$(INB $RQ)"
R=$(CALL $S work-orders/$RQ/urgent-request '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(LOGROW $RQ URGENT_REQUESTED | cut -d'|' -f1)" = "ไม่ได้เขียนอะไรเพิ่ม" ] && [ "$(NLOG $RQ URGENT_REQUESTED)" = 2 ] \
  && pass "ขอใหม่โดยไม่เขียนอะไร → ได้ (ข้อความ \"ไม่ได้เขียนอะไรเพิ่ม\")" || fail "ขอไม่มีข้อความ: $(code_of "$R") $(err_of "$R")"
[ "$(code_of "$(CALL $A work-orders/$RQ/urgent-release '{}')")" = 200 ] \
  && [ "$(err_of "$(CALL $S work-orders/$RQ/urgent-request/cancel '{}')")" = "ไม่มีคำขอที่รอแอดมิน — แอดมินอาจแก้เป็นงานด่วนไปแล้ว ลองรีเฟรช" ] \
  && err_of "$(CALL $S work-orders/$RQ/urgent-request '{}')" | grep -q " แอดมินแก้เป็นงานด่วนแล้ว · ปล่อยได้เลย$" && [ "$(NLOG $RQ URGENT_REQUESTED)" = 2 ] \
  && pass "แอดมินแก้เป็นงานด่วน = คำขอจบเอง (ยกเลิกไม่ได้แล้ว · ขอใหม่ 409 \"แอดมินแก้เป็นงานด่วนแล้ว\")" || fail "คำขอไม่จบหลังแอดมินแก้: $(URF $RQ)"
REV0=$(DB "select count(*) from \"AdminReview\" where \"workOrderId\"=$RV")
POST $S work-orders/$RV/admin-review '{"reason":"CONTACT","note":"เบอร์ร้านโทรไม่ติด"}' >/dev/null
R=$(CALL $S work-orders/$RV/urgent-request '{"note":"ต้องไปพรุ่งนี้"}')
[ "$(code_of "$R")" = 200 ] && [ "$REV0" = 0 ] \
  && [ "$(DB "select count(*)||'|'||max(reason)||'|'||bool_and(\"cancelledAt\" is null and \"repliedAt\" is null) from \"AdminReview\" where \"workOrderId\"=$RV")" = "1|CONTACT|true" ] \
  && pass "ส่งให้แอดมินตรวจสอบค้างอยู่ก็ขอแก้เป็นงานด่วนได้ — สองเรื่องไม่ขวางกัน การส่งตรวจสอบเดิมไม่ถูกแตะ (ข้อ 9 · ฐานข้อมูล)" || fail "ขอ+ส่งตรวจสอบ: $(code_of "$R") $(err_of "$R") · ก่อน=$REV0 หลัง=$(DB "select count(*)||'|'||max(reason)||'|'||bool_and(\"cancelledAt\" is null and \"repliedAt\" is null) from \"AdminReview\" where \"workOrderId\"=$RV")"
# แอดมินเลื่อนวันนัด (ใบอยู่ขั้นปล่อยงานเหมือนเดิม — APPOINTMENT_MOVED) = คำขอจบเอง: วันใหม่ เส้นตายใหม่ คำขอเดิมไม่มีความหมายแล้ว
# ค้างไว้ หัวหน้าภาคยังเห็น "ส่งคำขอแล้ว — รอแอดมิน" ทั้งที่แอดมินจัดการไปแล้ว
R=$(CALL $A work-orders/$RV/reschedule "{\"scheduledAt\":\"$D3\",\"reason\":\"ร้านขอเลื่อน\"}")
R2=$(CALL $S work-orders/$RV/urgent-request/cancel '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(DB "select status||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$RV")" = "ASSIGNED|$D3" ] \
  && [ "$(code_of "$R2")" = 409 ] && [ "$(err_of "$R2")" = "ไม่มีคำขอที่รอแอดมิน — แอดมินอาจแก้เป็นงานด่วนไปแล้ว ลองรีเฟรช" ] \
  && [ "$(NLOG $RV URGENT_REQUEST_CANCELLED)" = 0 ] \
  && pass "แอดมินเลื่อนวันนัด (ใบอยู่ขั้นเดิม) = คำขอที่ค้างจบเอง — ยกเลิกไม่ได้แล้ว 409 ไม่มีประวัติยกเลิก (ฐานข้อมูล)" \
  || fail "คำขอไม่จบหลังแอดมินเลื่อนวัน: $(code_of "$R") $(err_of "$R") · $(code_of "$R2") $(err_of "$R2")"
R=$(CALL $A work-orders/$RU/urgent-request '{}')
[ "$(code_of "$R")" = 403 ] && [ "$(err_of "$R")" = "ขอแก้เป็นงานด่วนได้เฉพาะหัวหน้าภาค — แอดมินกด “แก้เป็นงานด่วน” ได้เลย" ] \
  && [ "$(PC $T work-orders/$RD/urgent-request '{}')" = 403 ] && [ "$(PC $SO work-orders/$RD/urgent-request '{}')" = 403 ] \
  && [ "$(PC $SO work-orders/$RQ/urgent-request/cancel '{}')" = 403 ] && [ "$(NLOG $RD URGENT_REQUESTED)" = 0 ] \
  && pass "แอดมิน/ช่าง/หัวหน้าภาคภาคอื่น ขอ/ยกเลิกไม่ได้ (403) ไม่มีประวัติ" || fail "ใครขอได้: $(code_of "$R") $(err_of "$R")"
LONG=$(node -e 'console.log("ก".repeat(301))')
R=$(CALL $S work-orders/$RD/urgent-request "{\"note\":\"$LONG\"}")
[ "$(code_of "$R")" = 400 ] && [ "$(err_of "$R")" = "ข้อความยาวได้ไม่เกิน 300 ตัวอักษร" ] && [ "$(NLOG $RD URGENT_REQUESTED)" = 0 ] \
  && pass "ข้อความยาวเกิน 300 ตัวอักษร → 400" || fail "ข้อความยาว: $(code_of "$R") $(err_of "$R")"
DB "update \"WorkOrder\" set \"scheduledAt\"='$YESTERDAY' where id=$RP" >/dev/null
R=$(CALL $S work-orders/$RP/urgent-request '{}')
[ "$(code_of "$R")" = 409 ] && err_of "$R" | grep -q " วันนัดผ่านไปแล้ว — แก้เป็นงานด่วนไม่ได้แล้ว แอดมินต้องโทรร้านเลื่อนวันนัด$" && [ "$(NLOG $RP URGENT_REQUESTED)" = 0 ] \
  && pass "วันนัดผ่านไปแล้ว → 409 ขอไม่ได้ (ต้องให้แอดมินเลื่อนวันนัด)" || fail "ขอวันผ่าน: $(code_of "$R") $(err_of "$R")"
R=$(CALL $S work-orders/$TC2/urgent-request '{}')
[ "$(code_of "$R")" = 400 ] && [ "$(err_of "$R")" = "ใบทดสอบไม่ติดเวลาปิดรับ — ปล่อยงานได้เลย" ] \
  && pass "ใบทดสอบ → 400" || fail "ขอใบทดสอบ: $(code_of "$R") $(err_of "$R")"
POST $S work-orders/$RD/urgent-request '{"note":"ลองขอก่อน"}' >/dev/null
R=$(CALL $S work-orders/$RD/decline-new-date '{"reason":"ทีมไม่ว่างพรุ่งนี้"}')
N=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$RD and action='NEW_DATE_DECLINED' order by id desc limit 1")
[ "$(code_of "$R")" = 200 ] && [ "$(ST $RD)" = AWAITING_CONFIRM ] && [[ "$N" == "ทีม$TEAM ไม่ว่างวันนัด ("*") — ทีมไม่ว่างพรุ่งนี้" ]] \
  && [ "$(code_of "$(CALL $S work-orders/$RD/urgent-request/cancel '{}')")" = 409 ] \
  && pass "ใบที่ล็อก (ไม่ได้ถูกเลื่อนวัน) ส่งกลับแอดมินได้ → รอคอนเฟิร์มลูกค้า \"ไม่ว่างวันนัด\" · คำขอที่ค้างจบเอง (ฐานข้อมูล)" || fail "ส่งกลับใบล็อก: $(code_of "$R") $(err_of "$R") · $(ST $RD) · $N"
[ "$(curl -s localhost:4000/api/work-orders/$RD -H "$(H $A)" | J "d.logs.find(l=>l.action==='NEW_DATE_DECLINED').actionLabel")" = "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่" ] \
  && pass "ชื่อประวัติส่งกลับ = \"ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่\" (ไม่มี \"วันใหม่\" แล้ว — ข้อ 16)" || fail "ชื่อประวัติส่งกลับ: $(curl -s localhost:4000/api/work-orders/$RD -H "$(H $A)" | J "JSON.stringify(d.logs.find(l=>l.action==='NEW_DATE_DECLINED'))")"

echo
echo "═══ ทางที่ไม่ผ่านปุ่มปล่อยงาน ไม่ติดเวลาปิดรับ (ข้อ 15)"
CLOSE
NS=$(mk W105); rel $NS $TOMORROW
R=$(CALL $S work-orders/$NS/supervisor-close '{"reason":"SELF","note":"เครื่องกลับมาใช้ได้เองแล้ว ร้านยืนยันทางโทรศัพท์"}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $NS)" = DONE ] \
  && pass "หัวหน้าภาคปิดใบแทนจากขั้นปล่อยงานที่ล็อก → ปิดได้ (ฐานข้อมูล)" || fail "ปิดแทน: $(code_of "$R") $(err_of "$R") · $(ST $NS)"
NB=$(mk W106); rel $NB $TODAY; SETURF $NB $D2
NOWISO=$(node -e 'console.log(new Date().toISOString())')
# วันเข้างานเมื่อวาน — ปิดย้อนหลังไม่รับเวลาเข้างานที่ยังไม่ถึง (วันนี้ 10:00 ตอนรันเช้ามืดคืออนาคต)
R=$(CALL $A work-orders/$NB/backfill-close "{\"reason\":\"ทดสอบ\",\"team\":\"$TEAM\",\"visitDate\":\"$YESTERDAY\",\"visitTime\":\"10:00\",\"result\":\"FIXED\",\"closedAt\":\"$NOWISO\",\"otherWorkers\":\"ช่างทดสอบ\",\"noPhotoReason\":\"ทดสอบ\"}")
[ "$(code_of "$R")" = 200 ] && [ "$(ST $NB)|$(URF $NB)" = "DONE|-" ] \
  && pass "แอดมินปิดย้อนหลังใบที่ล็อก → ปิดได้ · ล้างงานด่วนพร้อมวันนัดที่เขียนใหม่ (ฐานข้อมูล)" || fail "ปิดย้อนหลัง: $(code_of "$R") $(err_of "$R") · $(ST $NB) $(URF $NB)"
NI=$(mk W107); POST $S work-orders/$NI/inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D2\"}" >/dev/null
POST $A work-orders/$NI/confirm-appointment '{}' >/dev/null; POST $S work-orders/$NI/dispatch '{}' >/dev/null
[ "$(ST $NI)" = INSPECTING ] || fail "เตรียมใบตรวจหน้างาน: $(ST $NI)"
DB "update \"WorkOrder\" set \"scheduledAt\"='$TOMORROW' where id=$NI" >/dev/null   # ปล่อยแล้วค่อยย้ายวัน (ขั้นช่างไม่ติดกฎ)
R=$(CALL $A work-orders/$NI/rollback '{"toStage":"INSPECT_DISPATCH","reason":"ส่งทีมใหม่"}')
R2=$(CALL $S work-orders/$NI/dispatch '{}')
[ "$(code_of "$R")" = 200 ] && [ "$(ST $NI)" = INSPECT_DISPATCH ] && [ "$(code_of "$R2")" = 409 ] && [ "$(body_of "$R2" | J 'd.code')" = DISPATCH_LOCKED ] \
  && pass "ย้อนจากตรวจหน้างานกลับขั้นส่งช่างตรวจหลังปิดรับ → ย้อนได้ แต่ปล่อยใหม่ติดกฎ (ฐานข้อมูล)" || fail "ย้อนกลับขั้นปล่อย: $(code_of "$R") $(err_of "$R") · $(ST $NI) · $(code_of "$R2")"
NU=$(mk W108); rel $NU $TODAY; POST $A work-orders/$NU/urgent-release '{}' >/dev/null
[ "$(URF $NU)" = "$TODAY" ] || fail "เตรียมใบงานด่วน: $(URF $NU)"
R=$(CALL $A work-orders/$NU/rollback '{"toStage":"INSPECTING","reason":"ให้ทีมเข้าตรวจหน้างานก่อน"}')
[ "$(code_of "$R")" = 200 ] \
  && [ "$(DB "select status||'|'||coalesce(\"scheduledAt\"::text,'-')||'|'||coalesce(\"scheduledTime\",'-')||'|'||coalesce(\"appointmentStatus\",'-')||'|'||coalesce(\"urgentReleaseFor\"::text,'-') from \"WorkOrder\" where id=$NU")" = "INSPECTING|-|-|-|-" ] \
  && pass "ย้อนใบงานด่วนไปตรวจหน้างาน → ถึงช่างโดยไม่ผ่านปุ่มปล่อยงาน วันนัด/เวลา/สถานะนัด/งานด่วน ว่างหมด (ฐานข้อมูล)" || fail "ย้อนไปตรวจ: $(code_of "$R") $(err_of "$R")"

echo
echo "═══ ทุกทางที่เปลี่ยน/ล้างวันนัด ล้างงานด่วนด้วย (urgentReleaseFor)"
CLR() {  # $1 ชื่อทาง $2 ใบ $3 ขั้นที่ควรไป $4 ผลตอบกลับ
  if [ "$(code_of "$4")" = 200 ] && [ "$(ST $2)|$(URF $2)" = "$3|-" ]; then pass "ล้างงานด่วน: $1 → $3 (ฐานข้อมูล)"
  else fail "ล้างงานด่วน: $1 — $(code_of "$4") $(err_of "$4") · $(ST $2) urgentReleaseFor=$(URF $2)"; fi
}
C1=$(mk W109); POST $S work-orders/$C1/parts '{"needsParts":false}' >/dev/null; SETURF $C1 $D5
CLR "นัดวันเข้า (/assign)" $C1 AWAITING_CONFIRM "$(CALL $S work-orders/$C1/assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\"}")"
C2=$(mk W110); SETURF $C2 $D5
CLR "ไม่ใช้อะไหล่ + จ่ายงาน (/parts assign)" $C2 AWAITING_CONFIRM "$(CALL $S work-orders/$C2/parts "{\"needsParts\":false,\"assign\":{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\"}}")"
C3=$(mk W111); SETURF $C3 $D5
CLR "ส่งตรวจหน้างาน (/inspect-request)" $C3 INSPECT_CONFIRM "$(CALL $S work-orders/$C3/inspect-request "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\"}")"
POST $A work-orders/$C3/confirm-appointment '{}' >/dev/null; POST $S work-orders/$C3/dispatch '{}' >/dev/null; SETURF $C3 $D5
# ไฟล์ผลตรวจสามอย่าง (ใส่ตรงในฐานข้อมูล ไม่มีไฟล์จริงในถัง) — ข้อนี้ทดสอบการล้างวัน ไม่ใช่การอัปโหลด
DB "insert into \"WorkOrderAttachment\"(\"workOrderId\",kind,\"fileName\",\"mimeType\",\"sizeBytes\",role,\"createdAt\")
  select $C3,'IMAGE','dc.jpg','image/jpeg',1,r,(now() at time zone 'UTC') + interval '1 second' from unnest(array['INSPECT_SITE','INSPECT_PART','INSPECT_VIDEO']) r" >/dev/null
CLR "บันทึกผลตรวจ (/inspection)" $C3 NEW "$(CALL $T work-orders/$C3/inspection '{"note":"วาล์วน้ำทิ้งค้าง"}')"
C5=$(mk W112); B5=$(fx_part $C5 BOARD)
POST $S work-orders/$C5/parts "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$B5,\"quantity\":1}]}" >/dev/null
POST $A work-orders/$C5/parts-sourcing "{\"results\":[{\"sparePartId\":$B5,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
POST $S work-orders/$C5/assign "{\"team\":\"$TEAM\",\"scheduledAt\":\"$D5\"}" >/dev/null; SETURF $C5 $D5
CLR "ของไม่พอตอนเบิก (/parts-short)" $C5 PARTS_SOURCING "$(CALL $A work-orders/$C5/parts-short "{\"sparePartIds\":[$B5]}")"
C6=$(mk W113); rel $C6 $D5; SETURF $C6 $D5
CLR "ช่างแจ้งปัญหาหน้างาน (/reassess-parts)" $C6 NEW "$(CALL $T work-orders/$C6/reassess-parts '{"reasonCode":"PARTS","reason":"บอร์ดไหม้ ต้องเปลี่ยน"}')"
# อีกทางของปุ่มเดียวกัน (คน/เครื่องมือไม่พอ → หัวหน้าภาคจ่ายงานใหม่) ล้างวันในอีกก้อนข้อมูล — ลืมล้างที่นี่ ไม่มีข้อไหนเห็น
C6B=$(mk W113); rel $C6B $D5; SETURF $C6B $D5
CLR "ช่างแจ้งคนไม่พอ (/reassess-parts → จ่ายงานใหม่)" $C6B PARTS_CHECKED "$(CALL $T work-orders/$C6B/reassess-parts '{"reasonCode":"RESOURCES","reason":"ต้องใช้ช่างสองคน"}')"
SETURF $NS $D5
CLR "เปิดงานใหม่ (/reopen)" $NS PARTS_CHECKED "$(CALL $A work-orders/$NS/reopen '{}')"
C8=$(mk W114); toConfirm $C8 $D5; SETURF $C8 $D5
CLR "คอนเฟิร์มลูกค้าแบบเลื่อนวัน (/confirm-appointment)" $C8 ASSIGNED "$(CALL $A work-orders/$C8/confirm-appointment "{\"scheduledAt\":\"$D6\"}")"
C9=$(mk W115); rel $C9 $D5; SETURF $C9 $D5
CLR "แอดมินเลื่อนวันนัด ไม่ติ๊ก (/reschedule)" $C9 ASSIGNED "$(CALL $A work-orders/$C9/reschedule "{\"scheduledAt\":\"$D6\",\"reason\":\"ร้านขอเลื่อน\"}")"
C10=$(mk W116); rel $C10 $D5; SETURF $C10 $D5
CLR "ย้อนไปนัดวันเข้า (/rollback)" $C10 PARTS_CHECKED "$(CALL $A work-orders/$C10/rollback '{"toStage":"PARTS_CHECKED","reason":"นัดใหม่"}')"

# exit แทน [ ] เปล่า — คำสั่งสุดท้ายที่ล้มจะไปเรียก trap ERR ให้ขึ้น "หยุดกลางทาง" ซ้ำกับ FAIL ที่พิมพ์ไปแล้ว
[ -z "$FAILED" ] || exit 1
