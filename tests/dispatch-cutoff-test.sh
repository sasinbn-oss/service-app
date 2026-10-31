#!/bin/bash
# ทดสอบ: เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — งานพรุ่งนี้ต้องปล่อยให้ช่างก่อนเวลาที่แอดมินตั้งของวันก่อนวันนัด
#   · ตั้งค่า GET/PUT /api/settings/dispatch-cutoff: ใครอ่าน/เปลี่ยนได้ · เลือกได้ 15:00–17:00 ทีละครึ่งชั่วโมง
#     · เปลี่ยนแต่ละครั้งเป็นแถวใหม่ (ใครเปลี่ยนจากอะไรเป็นอะไร) · แอดมินที่เคยเปลี่ยนแล้วถูกลบ = ปิดบัญชี ชื่อยังอยู่
#   · คณิตเส้นตาย utils/dispatchCutoff.ts (วันก่อนวันนัด · ข้ามสิ้นเดือน/ปี · 15:59:59.999 ได้ 16:00:00.000 ไม่ได้
#     · ไม่ล็อกย้อนหลังก่อนเวลาเริ่มใช้กฎ · งานด่วนผูกกับวันนัด) — คิดด้วยเวลาที่ส่งเข้าไปเอง ไม่ขึ้นกับเวลาที่รันเทสต์
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

MAXSET0=$(MAXSET)
cleanup() {
  # เก็บกวาดให้ครบทุกบรรทัด — ลบแถวตั้งค่าไม่สำเร็จต้องไม่ทำให้ข้ามการลบผู้ใช้ชั่วคราว
  set +e
  trap - ERR
  DB "delete from \"AppSetting\" where id>$MAXSET0" >/dev/null
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

# exit แทน [ ] เปล่า — คำสั่งสุดท้ายที่ล้มจะไปเรียก trap ERR ให้ขึ้น "หยุดกลางทาง" ซ้ำกับ FAIL ที่พิมพ์ไปแล้ว
[ -z "$FAILED" ] || exit 1
