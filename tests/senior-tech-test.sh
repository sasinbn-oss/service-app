#!/bin/bash
# ทดสอบ: Senior ช่าง (เจ้าของงานขอ ต.ค. 69 · role SENIOR_TECH · User.team = ทีมแรก + User.extraTeams = ทีม/ทีมรวมที่เหลือ)
#   · สิทธิ์เท่าช่างทุกอย่าง แต่เห็น/กดงานได้ทุกทีมที่เลือก (ทีม = ทีมนั้น · ทีมรวม = ทุกทีมที่ครอบคลุม · ทีมรวมแบบทุกทีม = ทั้งบริษัท)
#   · การ์ด: POST/PATCH teams ตัดช่องว่าง/ซ้ำ เก็บทีมแรก/ที่เหลือ (ฐานข้อมูล) · ชื่อไม่มีในทะเบียน/ช่างธรรมดาหลายทีม/เกิน 50 ได้ 400 ภาษาไทย
#     แอปรุ่นเก่าส่ง team เดี่ยว: แทนทีมแรก ที่เหลืออยู่ต่อ · ชื่อที่ถืออยู่แม้หายจากทะเบียนบันทึกผ่าน (เอาทีมอื่นออกได้)
#   · login / me / view-as ส่ง role ดิบ SENIOR_TECH (แบบ PARTS_ADMIN) + teams + teamCoverage = ขอบเขตรวม
#   · ขอบเขต: รายการ · หน้าใบงาน (403 นอกทีม) · กล่องงาน + inbox-count · งานของฉันวันนี้ · locate · คำแนะนำใบงานตอนรับรถ
#   · กดงาน: ถึงหน้างาน · บันทึกผลตรวจ · แจ้งปัญหา (เปิดใบรออะไหล่) · ปิดงาน — ทีมที่ดูแลผ่าน ทีมอื่น 403 "ไม่ใช่ทีมของคุณ" ฐานข้อมูลไม่เปลี่ยน
#   · ตัวเลือกช่าง (/work-orders/options) · ผังผู้รับผิดชอบ · /teams/members · /teams นับ Senior · รายงานคนไม่มีพื้นที่
#   · บอร์ดแผนงาน: Senior จัดแผนไม่ได้ · แอดมินใส่ Senior เป็นคนในทีมได้หลายเลนในวันเดียว · รถตามแผนของทีมที่ถือ/แผนที่มีชื่อ
#   · ดูในฐานะ Senior: เห็นเท่าตัวจริง กดไม่ได้ · ป้าย "Senior ช่าง" ในรายงานการใช้งาน/ผู้เปิดใบงาน/ทั้งระบบ · ไทม์ไลน์ (Super Admin) สีช่าง ป้าย Senior ช่าง
#   · นำเข้ารายชื่อ: Senior ที่ไฟล์บอกเป็นช่างยังเป็น Senior ทีมในไฟล์ต่อท้าย · ช่างธรรมดาที่มีค่าค้างถูกล้าง
#   · เปลี่ยนชื่อ/รวม/ลบทีม และเปลี่ยนชื่อ/ลบทีมรวม ตามไปแก้ extraTeams (ลำดับคงเดิม ไม่ซ้ำทีมแรก ทีมแรกหายแล้วตัวถัดไปขึ้นแทน)
#     ลบทีม/ทีมรวม: คำเตือนก่อนลบ (usage · การ์ดทีมรวม) และผลลบแยก "ไม่มีสังกัด" (ช่าง + Senior ที่ถือชื่อนี้ชื่อเดียว) ออกจาก "Senior เหลือทีมอื่น"
#   · ลดเป็นช่าง/หัวหน้าภาค/ลบบัญชี ล้าง extraTeams · ค่าค้างบนช่างธรรมดา (แก้ฐานข้อมูลด้วยมือ) ไม่ให้สิทธิ์อะไร
#     และไม่ติดไปตอนตั้งเป็น Senior ด้วย role อย่างเดียว (ชิปบนการ์ด)
#     โทเคนเดิมหมดสิทธิ์ทันที — ขอบเขตอ่านจากฐานข้อมูลทุกคำขอ ไม่อยู่ในโทเคน
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md) · สร้างสาขา/ทีม/ทีมรวม/ผู้ใช้ ZS… เองแล้วลบทั้งหมด · ไม่แตะ T001/S001
cd "$(dirname "$0")/.."
. tests/lib/fixture-parts.sh
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1" 2>/dev/null; }
H() { echo "Authorization: Bearer $1"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
TOK() { login "$@" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SEND() { curl -s -X "$1" "localhost:4000/api/$3" -H "$(H $2)" -H 'Content-Type: application/json' -d "$4"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "localhost:4000/api/$3" -H "$(H $2)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
UP() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/work-orders/$2/attachments" -H "$(H $1)" -F "file=@tests/$3" -F "role=$4"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
sorted() { printf '%s\n' "$@" | sort | paste -sd,; }
# team|extraTeams ของคนนี้ (ตามลำดับที่เก็บ)
TT() { DB "select coalesce(team,'-')||'|'||array_to_string(\"extraTeams\",',') from \"User\" where id=$1"; }
# activate: บัญชีที่แอดมินสร้างต้องเปลี่ยนรหัสก่อนใช้ — ข้ามขั้นนั้นที่ฐานข้อมูล (ไม่ใช่สิ่งที่เทสต์นี้ดู)
ready() { DB "update \"User\" set \"mustChangePassword\"=false where id=$1" >/dev/null; }

SUF=$((RANDOM % 9000 + 1000))
X="ZSX$SUF"; Y="ZSY$SUF"; Z="ZSZ$SUF"; W="ZSW$SUF"; V="ZSV$SUF"
G="ZSG กลุ่ม$SUF"; G2="ZSG2 กลุ่ม$SUF"; GA="ZSG ทุกทีม$SUF"
# รหัสของคนในไฟล์นำเข้าต้องเป็นตัวเลข — 7 หลักไม่ชนกับ 99____ ของ roster-import-test
RC1="97${SUF}5"; RC2="97${SUF}6"
SYMPTOM="ทดสอบ Senior ช่าง$SUF"
SNAME="Senior ทดสอบ$SUF"
TODAY=$(TZ=Asia/Bangkok date +%F)
A=$(TOK A001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
T1SNAP=$(DB "select role||'|'||coalesce(team,'-')||'|'||array_to_string(\"extraTeams\",',') from \"User\" where \"employeeCode\"='T001'")
VSTART=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
BRS="select id from \"Branch\" where code like 'CZS%$SUF'"
USERS="select id from \"User\" where \"employeeCode\" like 'ZS%$SUF%' or \"employeeCode\" like '97${SUF}%'"
cleanup() {
  # ใบลูก (แจ้งปัญหา) id มากกว่าใบแม่ — ลบจากมากไปน้อย
  for i in $(DB "select id from \"WorkOrder\" where \"branchId\" in ($BRS) order by id desc"); do
    curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"
  done
  DB "delete from \"TeamDayPlan\" where team like 'ZS%$SUF%'" >/dev/null
  DB "delete from \"BranchCheckIn\" where \"userId\" in ($USERS)" >/dev/null
  DB "delete from \"ViewAsLog\" where id>$VSTART and (\"targetUserId\" in ($USERS) or \"byUserId\" in ($USERS))" >/dev/null
  DB "delete from \"UsageSlot\" where \"userId\" in ($USERS)" >/dev/null
  DB "delete from \"User\" where id in ($USERS)" >/dev/null
  DB "delete from \"TeamGroup\" where name like 'ZSG%$SUF'" >/dev/null
  DB "delete from \"TeamRename\" where \"fromName\" like 'ZS%$SUF%' or \"toName\" like 'ZS%$SUF%'" >/dev/null
  DB "delete from \"BranchTeamMove\" where \"fromTeam\" like 'ZS%$SUF%' or \"toTeam\" like 'ZS%$SUF%'" >/dev/null
  DB "delete from \"Machine\" where \"branchId\" in ($BRS)" >/dev/null
  DB "delete from \"Branch\" where code like 'CZS%$SUF'" >/dev/null
  local left
  left="$(DB "select count(*) from \"User\" where id in ($USERS)")|$(DB "select count(*) from \"Branch\" where code like 'CZS%$SUF'")|$(DB "select count(*) from \"TeamGroup\" where name like 'ZSG%$SUF'")"
  [ "$left" = "0|0|0" ] || echo "FAIL เก็บกวาดไม่หมด (ผู้ใช้|สาขา|ทีมรวม = $left)"
  [ "$(DB "select role||'|'||coalesce(team,'-')||'|'||array_to_string(\"extraTeams\",',') from \"User\" where \"employeeCode\"='T001'")" = "$T1SNAP" ] || echo "FAIL T001 เปลี่ยนไป"
}
trap cleanup EXIT

echo "═══ ตั้งฉาก: สาขา/ทีม X Y Z W V · ทีมรวม G (Y,Z) · ทีมรวมทุกทีม GA"
for t in X Y Z W V; do
  DB "insert into \"Branch\"(code,name,zone,\"pmTeam\") values ('CZS$t$SUF','สาขาทดสอบ Senior $t$SUF','${!t}','${!t}')" >/dev/null
done
SEND POST $A teams/groups "{\"name\":\"$G\",\"covers\":[\"$Y\",\"$Z\"]}" >/dev/null
SEND POST $A teams/groups "{\"name\":\"$GA\",\"covers\":[],\"allTeams\":true}" >/dev/null
GROUP() { DB "select array_to_string(covers,',')||'|'||\"allTeams\" from \"TeamGroup\" where name='$1'"; }
[ "$(GROUP "$G")/$(GROUP "$GA")" = "$Y,$Z|false/|true" ] && pass "ทีมรวม G ครอบคลุม Y,Z · GA ทุกทีม (ฐานข้อมูล)" || fail "ตั้งทีมรวม: $(DB "select name, covers, \"allTeams\" from \"TeamGroup\" where name like 'ZSG%$SUF'")"

echo
echo "═══ การ์ดผู้ใช้: teams"
R=$(SEND POST $A auth/users "{\"employeeCode\":\"ZSN$SUF\",\"name\":\"$SNAME\",\"role\":\"SENIOR_TECH\",\"teams\":[\"$X\",\" $G \",\"$X\"],\"password\":\"temp12345\"}")
SID=$(DB "select id from \"User\" where \"employeeCode\"='ZSN$SUF'")
[ -n "$SID" ] && [ "$(DB "select role from \"User\" where id=$SID")|$(TT $SID)|$(echo "$R" | J 'd.teams.join(",")')" = "SENIOR_TECH|$X|$G|$X,$G" ] \
  && pass "สร้าง Senior ช่างพร้อมหลายทีม: ตัดช่องว่าง/ซ้ำ → team=X extraTeams={G} (ฐานข้อมูล) · คำตอบมี teams" || fail "สร้าง Senior: $R"
ready $SID
[ "$(GET $A auth/users | J "const u=d.find(u=>u.id===$SID); u.role+'|'+u.teams.join(',')")" = "SENIOR_TECH|$X,$G" ] && pass "รายชื่อผู้ใช้ (GET /auth/users) มี teams ครบ" || fail "GET users: $(GET $A auth/users | J "JSON.stringify(d.find(u=>u.id===$SID))")"
R=$(SEND PATCH $A auth/users/$SID "{\"teams\":[\"$X\",\"ไม่มีทีมนี้$SUF\"]}")
[ "$(echo "$R" | J 'd.error')" = "ไม่มีทีม “ไม่มีทีมนี้$SUF” ในทะเบียนสาขาหรือทีมรวม" ] && [ "$(TT $SID)" = "$X|$G" ] \
  && pass "ชื่อทีมที่ไม่มีในทะเบียน → 400 ภาษาไทย ฐานข้อมูลไม่เปลี่ยน" || fail "ทีมไม่มีจริง: $R"
R=$(SEND POST $A auth/users "{\"employeeCode\":\"ZSE$SUF\",\"name\":\"ช่างธรรมดา$SUF\",\"role\":\"EMPLOYEE\",\"teams\":[\"$X\",\"$Y\"],\"password\":\"temp12345\"}")
[ "$(echo "$R" | J 'd.error')" = "ช่างเลือกได้ทีมเดียว — ถ้าต้องดูหลายทีมให้ตั้งเป็น Senior ช่าง" ] && [ "$(DB "select count(*) from \"User\" where \"employeeCode\"='ZSE$SUF'")" = "0" ] \
  && pass "สร้างช่างธรรมดาสองทีม → 400 บอกให้ตั้งเป็น Senior ช่าง ไม่สร้างบัญชี" || fail "ช่างสองทีม: $R"
SEND POST $A auth/users "{\"employeeCode\":\"ZSE$SUF\",\"name\":\"ช่างธรรมดา$SUF\",\"role\":\"EMPLOYEE\",\"teams\":[\"$W\"],\"password\":\"temp12345\"}" >/dev/null
EID=$(DB "select id from \"User\" where \"employeeCode\"='ZSE$SUF'")
[ -n "$EID" ] && [ "$(TT $EID)" = "$W|" ] && pass "ช่างธรรมดาส่ง teams ทีมเดียวได้ → team=W" || fail "สร้างช่าง W: $(TT $EID)"
ready $EID
R=$(SEND PATCH $A auth/users/$EID "{\"teams\":[\"$W\",\"$X\"]}")
echo "$R" | grep -q "ช่างเลือกได้ทีมเดียว" && [ "$(TT $EID)" = "$W|" ] && pass "แก้ช่างธรรมดาเป็นสองทีม → 400 ฐานข้อมูลไม่เปลี่ยน" || fail "PATCH ช่างสองทีม: $R"
R=$(SEND PATCH $A auth/users/$EID "{\"team\":\"ไม่มีทีมนี้$SUF\"}")
echo "$R" | grep -q "ไม่มีทีม “ไม่มีทีมนี้$SUF”" && [ "$(TT $EID)" = "$W|" ] && pass "team เดี่ยวที่ไม่มีจริง (ช่างธรรมดา) → 400 ไม่บันทึก" || fail "team เดี่ยวไม่มีจริง: $R"
SEND PATCH $A auth/users/$SID "{\"team\":\"$W\"}" >/dev/null
[ "$(TT $SID)" = "$W|$G" ] && pass "แอปรุ่นเก่าส่ง team เดี่ยว: แทนทีมแรก ทีมที่เพิ่มอยู่ต่อ" || fail "team เดี่ยว: $(TT $SID)"
SEND PATCH $A auth/users/$SID "{\"team\":\"$G\"}" >/dev/null
[ "$(TT $SID)" = "$G|" ] && pass "team เดี่ยวซ้ำกับทีมที่เพิ่ม: ขึ้นเป็นทีมแรก ไม่ซ้ำ" || fail "team เดี่ยวซ้ำ: $(TT $SID)"
R=$(SEND PATCH $A auth/users/$SID "{\"teams\":$(node -pe 'JSON.stringify(Array.from({length:51},(_, i)=>"t"+i))')}")
echo "$R" | grep -q "เลือกทีมได้ไม่เกิน 50 ทีม" && [ "$(TT $SID)" = "$G|" ] && pass "เกิน 50 ทีม → 400 ภาษาไทย" || fail "เกิน 50: $R"
# ชื่อที่ถืออยู่แล้วแต่หายจากทะเบียน (ทีมถูกยุบนอกแอป) — ต้องบันทึกผ่าน ไม่งั้นเอาทีมอื่นออกไม่ได้เลย
DB "update \"User\" set team='$X', \"extraTeams\"='{\"$G\",ทีมเก่า$SUF}' where id=$SID" >/dev/null
R=$(SEND PATCH $A auth/users/$SID "{\"teams\":[\"$X\",\"ทีมเก่า$SUF\"]}")
[ "$(TT $SID)" = "$X|ทีมเก่า$SUF" ] && pass "ชื่อที่ถืออยู่แม้หายจากทะเบียน บันทึกผ่าน (เอาทีมรวมออกได้)" || fail "ชื่อค้าง: $R $(TT $SID)"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"$X\",\"$G\"]}" >/dev/null
[ "$(TT $SID)" = "$X|$G" ] && pass "ตั้งกลับเป็น [X, G]" || fail "ตั้ง [X,G]: $(TT $SID)"

echo
echo "═══ login / me"
S=$(TOK ZSN$SUF temp12345)
COV=$(sorted $X $Y $Z)
ME=$(GET $S auth/me)
[ "$(echo "$ME" | J '[d.role, d.team, d.teams.join(","), d.teamCoverage.all, d.teamCoverage.teams.slice().sort().join(",")].join("|")')" = "SENIOR_TECH|$X|$X,$G|false|$COV" ] \
  && pass "/me: role ดิบ SENIOR_TECH · teams [X,G] · teamCoverage = X+Y+Z (ทีม + ทุกทีมที่ทีมรวมครอบคลุม)" || fail "/me: $ME"
LG=$(login ZSN$SUF temp12345)
[ "$(echo "$LG" | J 'd.user.role+"|"+d.user.teams.join(",")+"|"+d.user.teamCoverage.teams.slice().sort().join(",")')" = "SENIOR_TECH|$X,$G|$COV" ] \
  && pass "login: role ดิบ + teams + ขอบเขตรวม" || fail "login: $(echo "$LG" | head -c 300)"

echo
echo "═══ ขอบเขต: รายการ · หน้าใบงาน · กล่องงาน · งานของฉันวันนี้ · locate · รับรถ"
# $1 สาขา · $2 ทีม · $3 สถานะ · $4 รหัสเครื่อง (สองใบในสาขาเดียวกันใช้เครื่องคนละตัว ไม่งั้นติดถามว่าเปิดซ้ำ)
mk() {
  local id; id=$(SEND POST $A work-orders "{\"branchCode\":\"CZS$1$SUF\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"${4:-W1}\",\"symptom\":\"$SYMPTOM $1 $3\"}]}" | J 'd.orders?d.orders[0].id:d.id')
  [ -n "$id" ] && DB "update \"WorkOrder\" set status='$3', \"assignedTeam\"='$2', \"scheduledAt\"=date_trunc('day', now() at time zone 'Asia/Bangkok') where id=$id" >/dev/null
  echo "$id"
}
OX=$(mk X $X IN_PROGRESS); OY=$(mk Y $Y IN_PROGRESS); OZ=$(mk Z $Z IN_PROGRESS); OW=$(mk W $W IN_PROGRESS)
OI=$(mk Y $Y INSPECTING W2); OIW=$(mk W $W INSPECTING W2)
ALL="$OX,$OY,$OZ,$OW,$OI,$OIW"
[ "$(echo $OX $OY $OZ $OW $OI $OIW | wc -w)" = "6" ] && pass "ใบงานทดสอบ 6 ใบ (กำลังซ่อม X Y Z W · ตรวจหน้างาน Y W)" || fail "เปิดใบงานไม่ครบ: $OX $OY $OZ $OW $OI $OIW"
mine() { GET $1 "work-orders?status=$2" | J "d.rows.map(r=>r.id).filter(i=>[$ALL].includes(i)).sort((a,b)=>a-b).join(',')"; }
EXP=$(printf '%s\n' $OX $OY $OZ $OI | sort -n | paste -sd,)
[ "$(mine $S ACTIVE)" = "$EXP" ] && pass "รายการ (ที่ยังค้าง): X Y Z + ตรวจหน้างาน Y · ไม่มีของทีม W" || fail "รายการ: $(mine $S ACTIVE) ≠ $EXP"
[ "$(mine $S INBOX)" = "$EXP" ] && pass "กล่องงาน: ใบของทุกทีมที่ดูแล · ไม่มีทีม W" || fail "กล่องงาน: $(mine $S INBOX)"
[ "$(GET $S work-orders/inbox-count | J 'd.inbox')" = "4" ] && pass "inbox-count = 4 (ตรงกับกล่องงาน)" || fail "inbox-count: $(GET $S work-orders/inbox-count)"
[ "$(GET $S work-orders/my-day | J "d.rows.map(r=>r.id).filter(i=>[$ALL].includes(i)).sort((a,b)=>a-b).join(',')")" = "$EXP" ] \
  && pass "งานของฉันวันนี้: งานกำลังซ่อม/ตรวจหน้างานของทุกทีมที่ดูแล" || fail "my-day: $(GET $S work-orders/my-day | J 'd.rows.map(r=>r.id+":"+r.team).join(",")')"
[ "$(CODE GET $S work-orders/$OW)|$(CODE GET $S work-orders/$OZ)|$(CODE GET $S work-orders/$OY)" = "403|200|200" ] && pass "เปิดใบทีม W → 403 · ทีม Z/Y (ผ่านทีมรวม) → 200" || fail "หน้าใบงาน: $(CODE GET $S work-orders/$OW) $(CODE GET $S work-orders/$OZ)"
[ "$(GET $S "work-orders/locate?ids=$OX,$OZ,$OW" | J "d.rows.map(r=>r.id).sort((a,b)=>a-b).join(',')")" = "$(sorted $OX $OZ | tr ',' '\n' | sort -n | paste -sd,)" ] \
  && pass "locate: ตอบเฉพาะใบในขอบเขต (ไม่มี W)" || fail "locate: $(GET $S "work-orders/locate?ids=$OX,$OZ,$OW")"
[ "$(GET $S vehicle-logs/status | J "d.workOrders.map(w=>w.id).filter(i=>[$ALL].includes(i)).sort((a,b)=>a-b).join(',')")" = "$EXP" ] \
  && pass "รับรถ: ใบงานที่แนะนำ = ทุกทีมที่ดูแล ไม่มี W" || fail "รับรถ: $(GET $S vehicle-logs/status | J 'd.workOrders.map(w=>w.id).join(",")')"

echo
echo "═══ กดงาน: ถึงหน้างาน · บันทึกผลตรวจ · แจ้งปัญหา · ปิดงาน"
for o in $OX $OY $OZ; do
  [ "$(CODE POST $S work-orders/$o/arrive '{}')" = "200" ] && [ "$(DB "select \"userId\"||'|'||action from \"WorkOrderLog\" where \"workOrderId\"=$o order by id desc limit 1")" = "$SID|ARRIVED" ] \
    && pass "ถึงหน้างานใบ $o (ประวัติเป็นชื่อ Senior)" || fail "ถึงหน้างาน $o"
done
R=$(SEND POST $S work-orders/$OW/arrive '{}')
[ "$(echo "$R" | J 'd.error')" = "ใบงานนี้จ่ายให้ $W ไม่ใช่ทีมของคุณ" ] && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$OW and action='ARRIVED'")" = "0" ] \
  && pass "ถึงหน้างานทีม W → 403 ภาษาไทย ไม่มีประวัติ" || fail "arrive W: $R"
# ผลตรวจหน้างานทีม Y (ผ่านทีมรวม G) — ไฟล์ครบสามอย่างแล้วส่งผล ใบกลับไปให้ระบุอะไหล่
UPS="$(UP $S $OI site-photo.png\;type=image/png INSPECT_SITE)$(UP $S $OI site-photo.png\;type=image/png INSPECT_PART)$(UP $S $OI site-clip.mp4\;type=video/mp4 INSPECT_VIDEO)"
R=$(SEND POST $S work-orders/$OI/inspection '{"note":"Senior ตรวจแล้ว วาล์วน้ำทิ้งค้าง"}')
[ "$(DB "select status from \"WorkOrder\" where id=$OI")|$(DB "select \"userId\"||'|'||action from \"WorkOrderLog\" where \"workOrderId\"=$OI order by id desc limit 1")" = "NEW|$SID|INSPECTED" ] \
  && pass "บันทึกผลตรวจทีม Y (ผ่านทีมรวม): แนบไฟล์ได้ ($UPS) · ใบกลับไปให้ระบุอะไหล่ · ประวัติเป็นชื่อ Senior" || fail "ผลตรวจ Y: $UPS $(echo "$R" | head -c 200)"
C=$(UP $S $OIW site-photo.png\;type=image/png INSPECT_SITE)
R=$(SEND POST $S work-orders/$OIW/inspection '{"note":"ลอง"}')
[ "$C" = "403" ] && echo "$R" | grep -q "ไม่ใช่ทีมของคุณ" && [ "$(DB "select status from \"WorkOrder\" where id=$OIW")|$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$OIW")" = "INSPECTING|0" ] \
  && pass "ทีม W: แนบไฟล์ 403 · ส่งผลตรวจ 403 ฐานข้อมูลไม่เปลี่ยน" || fail "ผลตรวจ W: $C $R"
# อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ — Z กับ W เป็นคนละเครื่องคนละสาขา หยิบของแต่ละใบเอง
# ใบ W ต้องถูกปฏิเสธเพราะ "ไม่ใช่ทีมของคุณ" เท่านั้น ไม่ใช่เพราะส่งอะไหล่ผิดยี่ห้อ
PART=$(fx_part "$OZ" BOARD); PARTW=$(fx_part "$OW" BOARD)
R=$(SEND POST $S work-orders/$OZ/follow-up "{\"parts\":[{\"sparePartId\":$PART,\"quantity\":1}],\"note\":\"Senior แจ้งของขาด\"}")
CH=$(echo "$R" | J 'd.createdChild?d.createdChild.id:""')
[ -n "$CH" ] && [ "$(DB "select \"parentId\" from \"WorkOrder\" where id=$CH")|$(DB "select \"userId\"||'|'||action from \"WorkOrderLog\" where \"workOrderId\"=$OZ order by id desc limit 1")" = "$OZ|$SID|SPLIT" ] \
  && pass "แจ้งปัญหาทีม Z (ผ่านทีมรวม): เปิดใบรออะไหล่ต่อ ผูกกับใบเดิม ประวัติเป็นชื่อ Senior" || fail "แจ้งปัญหา Z: $(echo "$R" | head -c 200)"
R=$(SEND POST $S work-orders/$OW/follow-up "{\"parts\":[{\"sparePartId\":$PARTW,\"quantity\":1}]}")
echo "$R" | grep -q "ไม่ใช่ทีมของคุณ" && [ "$(DB "select count(*) from \"WorkOrder\" where \"parentId\"=$OW")" = "0" ] && pass "แจ้งปัญหาทีม W → 403 ไม่มีใบลูก" || fail "แจ้งปัญหา W: $R"
for role in BEFORE AFTER NAMEPLATE; do UP $S $OY site-photo.png\;type=image/png $role >/dev/null; done
R=$(SEND POST $S work-orders/$OY/close "{\"result\":\"FIXED\",\"note\":\"Senior ปิดงานทีม Y ผ่านทีมรวม\",\"workerIds\":[$SID]}")
[ "$(DB "select status||'|'||\"closedById\" from \"WorkOrder\" where id=$OY")|$(DB "select count(*) from \"WorkOrderWorker\" where \"workOrderId\"=$OY and \"userId\"=$SID")" = "DONE|$SID|1" ] \
  && pass "ปิดงานทีม Y (ผ่านทีมรวม) → ปิดแล้ว · ผู้ปิด/ผู้เข้าปฏิบัติงานเป็น Senior" || fail "ปิด Y: $(echo "$R" | head -c 300)"
R=$(SEND POST $S work-orders/$OW/close "{\"result\":\"FIXED\",\"note\":\"ลอง\",\"workerIds\":[$SID]}")
[ "$(DB "select status from \"WorkOrder\" where id=$OW")" = "IN_PROGRESS" ] && echo "$R" | grep -q "ไม่ใช่ทีมของคุณ" && pass "ปิดงานทีม W → ปฏิเสธ ฐานข้อมูลไม่เปลี่ยน" || fail "ปิด W: $R"

echo
echo "═══ ทีมรวมแบบทุกทีม = ทั้งบริษัท"
SEND POST $A auth/users "{\"employeeCode\":\"ZSA$SUF\",\"name\":\"Senior ทุกทีม$SUF\",\"role\":\"SENIOR_TECH\",\"teams\":[\"$GA\"],\"password\":\"temp12345\"}" >/dev/null
AID=$(DB "select id from \"User\" where \"employeeCode\"='ZSA$SUF'")
ready $AID
SA2=$(TOK ZSA$SUF temp12345)
[ "$(TT $AID)|$(GET $SA2 auth/me | J 'String(d.teamCoverage.all)')" = "$GA||true" ] && pass "Senior ถือทีมรวมทุกทีม: teamCoverage.all = true" || fail "GA me: $(TT $AID) $(GET $SA2 auth/me | J 'JSON.stringify(d.teamCoverage)')"
[ "$(GET $SA2 "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OW))")|$(GET $SA2 work-orders/my-day | J "String(d.rows.some(r=>r.id===$OW))")" = "true|true" ] \
  && pass "เห็นใบทีม W ในรายการและงานวันนี้" || fail "GA เห็น W ไม่ได้"
[ "$(CODE POST $SA2 work-orders/$OW/arrive '{}')|$(DB "select \"userId\" from \"WorkOrderLog\" where \"workOrderId\"=$OW and action='ARRIVED' order by id desc limit 1")" = "200|$AID" ] \
  && pass "กดถึงหน้างานทีม W ได้ (ฐานข้อมูล)" || fail "GA arrive W"

echo
echo "═══ ตัวเลือกช่าง · ผัง · ทีมช่าง · รายงานคนไม่มีพื้นที่"
OPT=$(GET $A work-orders/options)
[ "$(echo "$OPT" | J "const t=d.technicians.find(x=>x.id===$SID); t ? [t.role,t.senior,t.teams.join(','),t.covers.slice().sort().join(',')].join('|') : 'missing'")" = "SENIOR_TECH|true|$X,$G|$COV" ] \
  && [ "$(echo "$OPT" | J "const t=d.technicians.find(x=>x.id===$AID); t ? String(t.covers) : 'missing'")" = "null" ] \
  && [ "$(echo "$OPT" | J "String(d.technicians.some(x=>x.id===$EID))")" = "true" ] \
  && pass "options.technicians (ตัวเลือกผู้เข้าปฏิบัติงาน/คนในแผน): มี Senior พร้อม teams/covers · ทีมรวมทุกทีม covers=null · ช่างธรรมดายังอยู่" || fail "options: $(echo "$OPT" | J "JSON.stringify(d.technicians.filter(x=>[$SID,$AID].includes(x.id)))")"
[ "$(echo "$OPT" | J "String(d.teams.some(t=>t.name==='$SNAME'||t.name===\"$G\"))")" = "false" ] && pass "options.teams (ทีมที่จ่ายงานได้) ไม่มี Senior/ทีมรวม" || fail "options.teams มีของแปลก"
CM=$(GET $A teams/coverage-map)
[ "$(echo "$CM" | J "const t=d.technicians.find(x=>x.id===$SID); t ? [t.senior,t.team,t.teams.join(',')].join('|') : 'missing'")" = "true|$X|$X,$G" ] \
  && pass "ผังผู้รับผิดชอบ: Senior มี senior=true + teams" || fail "ผัง: $(echo "$CM" | J "JSON.stringify(d.technicians.find(x=>x.id===$SID))")"
[ "$(GET $A "teams/members?name=$Y" | J "d.seniors.filter(s=>s.id===$SID).map(s=>s.via.join(',')).join(';')")" = "$G" ] && pass "สมาชิกทีม Y: Senior เห็นผ่านทีมรวม G (via)" || fail "members Y: $(GET $A "teams/members?name=$Y" | head -c 300)"
[ "$(GET $A "teams/members?name=$X" | J "String(d.technicians.some(t=>t.id===$SID&&t.role==='SENIOR_TECH'))")" = "true" ] && pass "สมาชิกทีม X: Senior อยู่ในรายชื่อช่าง พร้อม role" || fail "members X"
[ "$(GET $A teams | J "const g=d.groups.find(g=>g.name===\"$G\"); g ? g.technicians+'|'+g.seniors : 'missing'")" = "1|1" ] && pass "หน้าทีมช่าง (GET /teams): ทีมรวม G นับ Senior" || fail "teams: $(GET $A teams | J "JSON.stringify(d.groups.find(g=>g.name===\"$G\"))")"
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"extraTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('ZSU1$SUF','Senior ทีมหายหมด','SENIOR_TECH','ทีมเก่าก$SUF','{ทีมเก่าข$SUF}','$HASH',false),
  ('ZSU2$SUF','Senior ยังไม่มีทีม','SENIOR_TECH',null,'{}','$HASH',false),
  ('ZSU3$SUF','Senior ทีมแรกหายแต่ทีมเพิ่มมี','SENIOR_TECH','ทีมเก่าก$SUF','{\"$G\"}','$HASH',false)" >/dev/null
P=$(GET $A auth/users/unassigned-report | J 'd.path')
XL=$(mktemp --suffix=.xlsx)
curl -s "localhost:4000$P" -H "$(H $A)" -o "$XL"
GAPS=$(NODE_PATH="backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const m={};
    wb.worksheets[0].eachRow((r,i)=>{ if(i>1&&r.getCell(2).value) m[String(r.getCell(2).value)]=String(r.getCell(4).value)+"|"+String(r.getCell(5).value); });
    console.log(JSON.stringify(m)); });' "$XL")
rm -f "$XL"
gap() { echo "$GAPS" | J "d['$1']||'-'"; }
[ "$(gap ZSU1$SUF)" = "Senior ช่าง|ทีมที่ตั้งไว้ไม่มีในทะเบียนสาขา (ทีมเก่าก$SUF, ทีมเก่าข$SUF)" ] && [ "$(gap ZSU2$SUF)" = "Senior ช่าง|ยังไม่ได้จัดทีม" ] \
  && pass "รายงานคนไม่มีพื้นที่: Senior ทีมหายหมด (บอกทุกชื่อ) · Senior ไม่มีทีม · ป้าย Senior ช่าง" || fail "unassigned: U1=$(gap ZSU1$SUF) U2=$(gap ZSU2$SUF)"
[ "$(gap ZSU3$SUF)|$(gap ZSN$SUF)" = "-|-" ] && pass "ไม่อยู่ในรายงาน: Senior ที่มีทีมเพิ่มที่มีจริง · Senior ปกติ" || fail "ไม่ควรอยู่: U3=$(gap ZSU3$SUF) N=$(gap ZSN$SUF)"
DB "delete from \"User\" where \"employeeCode\" like 'ZSU_$SUF'" >/dev/null

echo
echo "═══ บอร์ดแผนงาน · รถตามแผน"
R=$(SEND PUT $S plans "{\"date\":\"$TODAY\",\"team\":\"$X\",\"memberIds\":[$SID]}")
[ "$(echo "$R" | J 'd.error')" = "บอร์ดแผนงานเปิดได้เฉพาะแอดมินกับหัวหน้าภาค" ] && [ "$(DB "select count(*) from \"TeamDayPlan\" where team='$X'")" = "0" ] \
  && pass "Senior จัดแผนเองไม่ได้ (403 แบบช่าง)" || fail "Senior จัดแผน: $R"
SEND PUT $A plans "{\"date\":\"$TODAY\",\"team\":\"$X\",\"memberIds\":[$SID]}" >/dev/null
SEND PUT $A plans "{\"date\":\"$TODAY\",\"team\":\"$W\",\"memberIds\":[$SID,$EID],\"vehicleId\":1}" >/dev/null
SEND PUT $A plans "{\"date\":\"$TODAY\",\"team\":\"$G\",\"vehicleId\":2,\"note\":\"$SYMPTOM\"}" >/dev/null
[ "$(DB "select string_agg(p.team, ',' order by p.team) from \"TeamDayPlanMember\" m join \"TeamDayPlan\" p on p.id=m.\"planId\" where m.\"userId\"=$SID and p.date='$TODAY'")" = "$(sorted $X $W)" ] \
  && pass "แอดมินใส่ Senior เป็นคนในทีม X และ W วันเดียวกัน (ฐานข้อมูล 2 แถว)" || fail "แผน: $(DB "select p.team from \"TeamDayPlanMember\" m join \"TeamDayPlan\" p on p.id=m.\"planId\" where m.\"userId\"=$SID")"
[ "$(GET $A "plans/day?date=$TODAY" | J "const l=d.lanes.find(l=>l.team==='$X'); l&&l.plan ? l.plan.members.map(m=>m.role).join(',') : 'none'")" = "SENIOR_TECH" ] \
  && pass "plans/day: คนในแผนมี role (บอร์ดติดป้าย Senior)" || fail "plans/day role: $(GET $A "plans/day?date=$TODAY" | J "JSON.stringify(d.lanes.find(l=>l.team==='$X'))" | head -c 300)"
PFM() { GET $1 vehicle-logs/status | J "d.vehicles.filter(v=>[1,2].includes(v.id)).sort((a,b)=>a.id-b.id).map(v=>v.plannedForMe).join(',')"; }
[ "$(PFM $S)|$(PFM $(TOK ZSE$SUF temp12345))" = "true,true|true,false" ] \
  && pass "รถตามแผน: Senior ได้คันของแผนที่มีชื่อ (W) + แผนของทีมรวมที่ถือ (G) · ช่างทีม W ไม่ได้คันของ G" || fail "plannedForMe: S=$(PFM $S) E=$(PFM $(TOK ZSE$SUF temp12345))"

echo
echo "═══ ดูในฐานะ Senior"
VA=$(SEND POST $A auth/view-as "{\"userId\":$SID}")
VT=$(echo "$VA" | J 'd.token')
[ "$(echo "$VA" | J 'd.user.role+"|"+d.user.teams.join(",")')" = "SENIOR_TECH|$X,$G" ] && [ "$(mine $VT ACTIVE)" = "$(mine $S ACTIVE)" ] && [ -n "$(mine $S ACTIVE)" ] \
  && pass "แอดมินดูในฐานะ Senior: role/teams ตรง · เห็นใบชุดเดียวกับตัวจริง" || fail "view-as: $(echo "$VA" | head -c 200)"
N0=$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$OX")
[ "$(CODE POST $VT work-orders/$OX/arrive '{}')|$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$OX")" = "403|$N0" ] && pass "ดูในฐานะ: กดไม่ได้ (403) ฐานข้อมูลไม่เปลี่ยน" || fail "view-as กดได้"
SEND POST $VT auth/view-as/stop '{}' >/dev/null

echo
echo "═══ ป้ายในรายงาน · ไทม์ไลน์"
U=$(GET $A "usage?role=EMPLOYEE&q=ZSN$SUF" | J "d.people.map(u=>u.roleLabel+'|'+u.team).join(';')")
[ "$U" = "Senior ช่าง|$X · $G" ] && pass "การใช้งานแอป: ตัวกรองช่างรวม Senior · ป้าย Senior ช่าง · ทุกทีม" || fail "usage: $U"
DB "update \"WorkOrder\" set \"createdById\"=$SID where id=$OX" >/dev/null
R=$(curl -s -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" --data-urlencode "opener=$SID" -H "$(H $A)")
[ "$(echo "$R" | J 'd.summary[0].role')" = "Senior ช่าง" ] && pass "รายงานผู้เปิดใบงาน: ตำแหน่ง Senior ช่าง" || fail "by-opener: $(echo "$R" | head -c 200)"
XL=$(mktemp --suffix=.xlsx)
curl -s -o "$XL" "localhost:4000$(GET $A reports/system | J 'd.path')" -H "$(H $A)"
SYS=$(python3 - "$XL" "ZSN$SUF" "$X" "$Y" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
emp = next((r for r in wb["พนักงาน"].iter_rows(min_row=5, values_only=True) if r and r[0] == sys.argv[2]), None)
team = {r[0]: r for r in wb["ทีมช่าง"].iter_rows(min_row=5, values_only=True) if r and r[0]}
x = team.get(sys.argv[3]); y = team.get(sys.argv[4])
print("|".join([emp[2] if emp else "-", emp[3] if emp else "-", str(x[3]) if x else "-", x[4] if x else "-", str(y[3]) if y else "-"]))
PY
)
rm -f "$XL"
[ "$SYS" = "Senior ช่าง|$X, $G|1|$SNAME (Senior)|0" ] && pass "รายงานทั้งระบบ: ชีตพนักงาน ป้าย/ทุกทีม · ชีตทีมช่าง X มี \"(Senior)\" · ทีม Y ไม่นับคนที่เห็นผ่านทีมรวม" || fail "system report: $SYS"
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"passwordHash\",\"mustChangePassword\") values ('ZSSA$SUF','ซุปเปอร์ทดสอบ Senior','SUPER_ADMIN',null,'$HASH',false)" >/dev/null
SA=$(TOK ZSSA$SUF)
TL() { GET $SA work-orders/$OX/timeline | J "$1"; }
[ "$(TL "d.events.filter(e=>e.what==='ช่างถึงหน้างาน'&&e.who===\"$SNAME\").map(e=>e.role+'/'+e.roleLabel).join(',')")" = "EMPLOYEE/Senior ช่าง" ] \
  && pass "ไทม์ไลน์ใบงาน: ถึงหน้างานของ Senior เป็นสีช่าง (EMPLOYEE) ป้าย Senior ช่าง (ตรงกับประวัติใบงาน)" || fail "timeline role: $(TL "JSON.stringify(d.events.map(e=>e.who+':'+e.what+':'+e.role))" | head -c 300)"
# รายงานตัวของคนที่ถือทีมนี้เป็นทีมที่เพิ่ม (ไม่ใช่ทีมแรก) ต้องขึ้นด้วย
SEND PATCH $A auth/users/$SID "{\"teams\":[\"$G\",\"$X\"]}" >/dev/null
BX=$(DB "select id from \"Branch\" where code='CZSX$SUF'")
DB "insert into \"BranchCheckIn\"(\"userId\",\"branchId\",latitude,longitude,\"distanceMeters\",\"withinRadius\",note) values ($SID,$BX,13.7,100.5,25,true,'$SYMPTOM')" >/dev/null
[ "$(TT $SID)|$(TL "String(d.events.some(e=>e.what.startsWith('รายงานตัว')&&e.who===\"$SNAME\"&&e.role==='EMPLOYEE'))")" = "$G|$X|true" ] \
  && pass "ไทม์ไลน์ใบงาน: รายงานตัวของ Senior ที่ถือทีม X เป็นทีมที่เพิ่ม" || fail "timeline check-in: $(TT $SID) $(TL "JSON.stringify(d.events.map(e=>e.who+':'+e.what))" | head -c 300)"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"$X\",\"$G\"]}" >/dev/null

echo
echo "═══ นำเข้ารายชื่อ (บันทึกแบ่งทีม)"
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"extraTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('$RC1','ชื่อเก่า Senior','SENIOR_TECH','$X','{\"$G\"}','x',false),
  ('$RC2','ชื่อเก่าช่าง','EMPLOYEE','$X','{\"$G\"}','x',false)" >/dev/null
BODY="{\"teamMap\":{\"พื้นที่ทดสอบ$SUF\":\"$W\"},\"people\":[
  {\"code\":\"$RC1\",\"fullName\":\"Senior นำเข้า\",\"nick\":null,\"role\":\"EMPLOYEE\",\"area\":\"พื้นที่ทดสอบ$SUF\",\"supervisorCode\":null},
  {\"code\":\"$RC2\",\"fullName\":\"ช่างนำเข้า\",\"nick\":null,\"role\":\"EMPLOYEE\",\"area\":\"พื้นที่ทดสอบ$SUF\",\"supervisorCode\":null}]}"
R=$(SEND POST $A user-import/commit "$BODY")
R1=$(DB "select role||'|'||team||'|'||array_to_string(\"extraTeams\",',')||'|'||name from \"User\" where \"employeeCode\"='$RC1'")
R2=$(DB "select role||'|'||team||'|'||array_to_string(\"extraTeams\",',') from \"User\" where \"employeeCode\"='$RC2'")
[ "$R1" = "SENIOR_TECH|$X|$G,$W|Senior นำเข้า" ] && pass "Senior ที่ไฟล์บอกเป็นช่าง: ยังเป็น Senior · ทีมเดิมครบ + ทีมในไฟล์ต่อท้าย · ชื่อใหม่" || fail "นำเข้า Senior: $R1 ($R)"
[ "$R2" = "EMPLOYEE|$W|" ] && pass "ช่างธรรมดาที่มีค่าค้าง: ได้ทีมตามไฟล์ extraTeams ถูกล้าง" || fail "นำเข้าช่าง: $R2"

echo
echo "═══ เปลี่ยนชื่อ/รวม/ลบทีม · เปลี่ยนชื่อ/ลบทีมรวม → extraTeams ตามไป"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"$X\",\"$G\",\"$W\"]}" >/dev/null
[ "$(TT $SID)" = "$X|$G,$W" ] || fail "ตั้ง [X,G,W]: $(TT $SID)"
SEND POST $A teams/rename "{\"from\":\"$W\",\"to\":\"${W}R\"}" >/dev/null
[ "$(TT $SID)" = "$X|$G,${W}R" ] && pass "เปลี่ยนชื่อทีมที่อยู่ในทีมที่เพิ่ม → แทนที่ตำแหน่งเดิม" || fail "rename W: $(TT $SID)"
SEND POST $A teams/rename "{\"from\":\"$X\",\"to\":\"${X}R\"}" >/dev/null
[ "$(TT $SID)" = "${X}R|$G,${W}R" ] && pass "เปลี่ยนชื่อทีมแรก → team เปลี่ยนตาม" || fail "rename X: $(TT $SID)"
GID=$(DB "select id from \"TeamGroup\" where name='$G'")
SEND PUT $A teams/groups/$GID "{\"name\":\"$G2\",\"covers\":[\"$Y\",\"$Z\"]}" >/dev/null
[ "$(TT $SID)" = "${X}R|$G2,${W}R" ] && pass "เปลี่ยนชื่อทีมรวม → extraTeams ตามไป" || fail "rename group: $(TT $SID)"
SEND POST $A teams/rename "{\"from\":\"${W}R\",\"to\":\"${X}R\",\"merge\":true}" >/dev/null
[ "$(TT $SID)" = "${X}R|$G2" ] && pass "รวมทีม WR เข้า XR (ทีมแรก) → ตัดตัวซ้ำ ลำดับคงเดิม" || fail "merge: $(TT $SID)"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"${X}R\",\"$V\",\"$G2\"]}" >/dev/null
R=$(SEND POST $A teams/delete "{\"name\":\"$V\",\"moveTo\":\"${X}R\"}")
[ "$(TT $SID)|$(echo "$R" | J 'd.technicians+"/"+d.seniors')" = "${X}R|$G2|0/1" ] && pass "ลบทีม V (ย้ายสาขาไป XR) → หายจากทีมที่เพิ่ม · ผลลบ: ไม่มีสังกัด 0 · Senior เหลือทีมอื่น 1" || fail "delete V: $(TT $SID) $R"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"$G2\",\"${X}R\"]}" >/dev/null
GID=$(DB "select id from \"TeamGroup\" where name='$G2'")
R=$(curl -s -X DELETE "localhost:4000/api/teams/groups/$GID" -H "$(H $A)")
[ "$(TT $SID)|$(echo "$R" | J 'd.technicians+"/"+d.seniors')" = "${X}R||0/2" ] \
  && pass "ลบทีมรวมที่เป็นทีมแรก → ทีมถัดไปขึ้นแทน · ผลลบไม่นับเป็น \"ไม่มีสังกัด\" (Senior 2 คนเหลือทีมอื่น)" || fail "group delete: $(TT $SID) $R"
[ "$(DB "select role||'|'||team||'|'||array_to_string(\"extraTeams\",',') from \"User\" where \"employeeCode\"='$RC1'")" = "SENIOR_TECH|${X}R|" ] \
  && pass "Senior คนอื่นได้ผลชุดเดียวกัน (ทีมแรก X→XR · G→G2 แล้วลบ · W→WR แล้วรวมเข้าทีมแรก)" || fail "RC1: $(DB "select team, \"extraTeams\" from \"User\" where \"employeeCode\"='$RC1'")"

echo
echo "═══ นับคนตอนลบทีม/ทีมรวม: Senior ที่เหลือทีมอื่น ≠ คนที่ไม่เหลือทีม (คำเตือนก่อนลบ = ผลหลังลบ = ฐานข้อมูล)"
UD="ZSU$SUF"; GD="ZSG ลบ$SUF"
DB "insert into \"Branch\"(code,name,zone,\"pmTeam\") values ('CZSU$SUF','สาขาทดสอบ Senior U$SUF','$UD','$UD')" >/dev/null
SEND POST $A teams/groups "{\"name\":\"$GD\",\"covers\":[\"$Y\"]}" >/dev/null
# K1 ทีมแรก = U (ทีมถัดไปขึ้นแทน) · K2 ถือ U เป็นทีมที่เพิ่ม · K3 Senior ถือ U ทีมเดียว · K4 ช่างธรรมดาทีม U มีค่าค้าง (ไม่นับ)
# K5 ทีมแรก = ทีมรวม GD + ทีม Y · K6 Senior ถือ GD อันเดียว · K7 ช่างธรรมดาในทีมรวม GD
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"extraTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('ZSK1$SUF','K1','SENIOR_TECH','$UD','{\"$Y\"}','x',false), ('ZSK2$SUF','K2','SENIOR_TECH','$Y','{\"$UD\"}','x',false),
  ('ZSK3$SUF','K3','SENIOR_TECH','$UD','{}','x',false), ('ZSK4$SUF','K4','EMPLOYEE','$UD','{\"$Y\"}','x',false),
  ('ZSK5$SUF','K5','SENIOR_TECH','$GD','{\"$Y\"}','x',false), ('ZSK6$SUF','K6','SENIOR_TECH','$GD','{}','x',false),
  ('ZSK7$SUF','K7','EMPLOYEE','$GD','{}','x',false)" >/dev/null
K() { DB "select string_agg(coalesce(team,'-')||'|'||array_to_string(\"extraTeams\",','), ' ; ' order by \"employeeCode\") from \"User\" where \"employeeCode\" in ($1)"; }
USE=$(curl -s -G localhost:4000/api/teams/usage --data-urlencode "name=$UD" -H "$(H $A)" | J 'd.technicians+"/"+d.seniors+"/"+d.seniorsSole')
[ "$USE" = "4/3/1" ] && pass "คำเตือนก่อนลบทีม U: ถือ 4 · Senior 3 · ถือทีมนี้ทีมเดียว 1 (แอปบอก ไม่มีสังกัด 2 · เหลือทีมอื่น 2)" || fail "teams/usage: $USE"
R=$(SEND POST $A teams/delete "{\"name\":\"$UD\",\"moveTo\":\"$Y\"}")
[ "$(echo "$R" | J 'd.technicians+"/"+d.seniors')" = "2/2" ] && pass "ผลลบทีม U: ไม่มีสังกัด 2 (Senior ทีมเดียว + ช่าง) · Senior เหลือทีมอื่น 2 (ทีมแรกหาย/ทีมที่เพิ่มหาย)" || fail "teams/delete: $R"
[ "$(K "'ZSK1$SUF','ZSK2$SUF','ZSK3$SUF','ZSK4$SUF'")" = "$Y| ; $Y| ; -| ; -|$Y" ] \
  && pass "ฐานข้อมูลตรงกับที่บอก: K1 Y ขึ้นเป็นทีมแรก · K2 เหลือ Y · K3 ไม่มีทีม · K4 ไม่มีทีม (ค่าค้างไม่ให้สิทธิ์)" || fail "หลังลบ U: $(K "'ZSK1$SUF','ZSK2$SUF','ZSK3$SUF','ZSK4$SUF'")"
GDR=$(GET $A teams | J "const g=d.groups.find(g=>g.name===\"$GD\"); g.technicians+'/'+g.seniors+'/'+g.seniorsSole")
[ "$GDR" = "3/2/1" ] && pass "การ์ดทีมรวม GD (ใช้เตือนก่อนลบ): ถือ 3 · Senior 2 · ถืออันเดียว 1" || fail "teams groups: $GDR"
R=$(curl -s -X DELETE "localhost:4000/api/teams/groups/$(DB "select id from \"TeamGroup\" where name='$GD'")" -H "$(H $A)")
[ "$(echo "$R" | J 'd.technicians+"/"+d.seniors')|$(K "'ZSK5$SUF','ZSK6$SUF','ZSK7$SUF'")" = "2/1|$Y| ; -| ; -|" ] \
  && pass "ลบทีมรวม GD: ไม่มีสังกัด 2 (K6 K7) · Senior เหลือทีมอื่น 1 (K5 → Y) ตรงกับฐานข้อมูล" || fail "group delete GD: $R $(K "'ZSK5$SUF','ZSK6$SUF','ZSK7$SUF'")"

# ตั้งฉากกลับสำหรับข้อถัดไป — ใบ OX/OZ ตามชื่อทีมใหม่
SEND POST $A teams/groups "{\"name\":\"$G\",\"covers\":[\"$Y\",\"$Z\"]}" >/dev/null
SEND PATCH $A auth/users/$SID "{\"teams\":[\"${X}R\",\"$G\"]}" >/dev/null
DB "update \"WorkOrder\" set \"assignedTeam\"='${X}R' where id=$OX" >/dev/null

echo
echo "═══ ลดสิทธิ์ · ค่าค้าง · ลบบัญชี (โทเคนเดิม)"
[ "$(GET $S "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OZ))")" = "true" ] && pass "ก่อนลด: เห็นใบทีม Z ผ่านทีมรวม" || fail "ก่อนลดไม่เห็น Z"
SEND PATCH $A auth/users/$SID '{"role":"EMPLOYEE"}' >/dev/null
[ "$(DB "select role from \"User\" where id=$SID")|$(TT $SID)" = "EMPLOYEE|${X}R|" ] && pass "Senior → ช่าง: คงทีมแรก ล้าง extraTeams (ฐานข้อมูล)" || fail "ลดเป็นช่าง: $(TT $SID)"
[ "$(GET $S "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OZ))")|$(CODE POST $S work-orders/$OZ/arrive '{}')|$(GET $S auth/me | J 'd.role+":"+d.teamCoverage.teams.join(",")')" = "false|403|EMPLOYEE:${X}R" ] \
  && pass "โทเคนเดิม: ใบ Z หาย · กด 403 · ขอบเขตเหลือทีมแรก" || fail "หลังลด: $(GET $S auth/me | J 'JSON.stringify(d.teamCoverage)')"
DB "update \"User\" set \"extraTeams\"='{\"$G\"}' where id=$SID" >/dev/null
[ "$(GET $S "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OZ))")|$(CODE GET $S work-orders/$OZ)|$(GET $S work-orders/my-day | J "String(d.rows.some(r=>r.id===$OZ))")" = "false|403|false" ] \
  && pass "extraTeams ค้างบนช่างธรรมดา (แก้ฐานข้อมูลด้วยมือ) ไม่ให้สิทธิ์อะไร" || fail "ค่าค้างรั่ว"
SEND PATCH $A auth/users/$SID "{\"name\":\"$SNAME\"}" >/dev/null
[ "$(TT $SID)" = "${X}R|" ] && pass "แก้การ์ดช่างธรรมดาครั้งไหนก็ล้างค่าค้าง" || fail "ค่าค้างไม่ถูกล้าง: $(TT $SID)"
# กดชิป "Senior ช่าง" บนการ์ด = ส่งแค่ role — ค่าค้างที่ไม่มีแอดมินคนไหนเลือกต้องไม่กลายเป็นสิทธิ์ทันทีที่ตั้งเป็น Senior
DB "update \"User\" set \"extraTeams\"='{\"$G\"}' where id=$SID" >/dev/null
R=$(SEND PATCH $A auth/users/$SID '{"role":"SENIOR_TECH"}')
[ "$(echo "$R" | J 'd.teams.join(",")')|$(DB "select role from \"User\" where id=$SID")|$(TT $SID)|$(GET $S "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OZ))")" = "${X}R|SENIOR_TECH|${X}R||false" ] \
  && pass "ช่างที่มีค่าค้าง → Senior (ส่งแค่ role): เริ่มจากทีมแรกบนการ์ดเท่านั้น ค่าค้างถูกล้าง · ไม่เห็นใบ Z (ฐานข้อมูล)" || fail "ตั้งเป็น Senior ด้วย role อย่างเดียว: $R $(TT $SID)"
SEND PATCH $A auth/users/$SID "{\"teams\":[\"${X}R\",\"$G\"]}" >/dev/null
[ "$(TT $SID)" = "${X}R|$G" ] && pass "ตั้งทีม XR + ทีมรวม G ให้ Senior (ฐานข้อมูล)" || fail "ตั้งทีม: $(TT $SID)"
R=$(SEND PATCH $A auth/users/$SID '{"role":"SENIOR_TECH"}')
[ "$(TT $SID)" = "${X}R|$G" ] && pass "ส่ง role SENIOR_TECH ให้คนที่เป็น Senior อยู่แล้ว: ทีมที่เพิ่มคงเดิม (ฐานข้อมูล)" || fail "role ซ้ำล้างทีม: $(TT $SID)"
SEND PATCH $A auth/users/$SID '{"role":"EMPLOYEE"}' >/dev/null
SEND PATCH $A auth/users/$SID "{\"role\":\"SENIOR_TECH\",\"teams\":[\"${X}R\",\"$G\"]}" >/dev/null
[ "$(DB "select role from \"User\" where id=$SID")|$(TT $SID)|$(GET $S "work-orders?status=ACTIVE" | J "String(d.rows.some(r=>r.id===$OZ))")" = "SENIOR_TECH|${X}R|$G|true" ] \
  && pass "ตั้งกลับเป็น Senior พร้อม teams ในคำขอเดียว (ทีมไม่ถูกล้าง) · โทเคนเดิมเห็น Z อีกครั้ง" || fail "ตั้งกลับ: $(TT $SID)"
SEND PATCH $A auth/users/$SID '{"role":"SUPERVISOR"}' >/dev/null
[ "$(DB "select role from \"User\" where id=$SID")|$(TT $SID)" = "SUPERVISOR|-|" ] && pass "Senior → หัวหน้าภาค: ล้าง team และ extraTeams" || fail "เป็นหัวหน้าภาค: $(TT $SID)"
SEND PATCH $A auth/users/$SID "{\"role\":\"SENIOR_TECH\",\"teams\":[\"${X}R\",\"$G\"]}" >/dev/null
R=$(curl -s -X DELETE localhost:4000/api/auth/users/$SID -H "$(H $SA)")
[ "$(echo "$R" | J 'd.mode')|$(DB "select (\"deletedAt\" is not null)::text from \"User\" where id=$SID")|$(TT $SID)" = "deactivated|true|-|" ] \
  && pass "ลบบัญชี Senior (มีประวัติ เก็บแบบลบแล้ว) ล้าง team และ extraTeams" || fail "ลบบัญชี: $R $(TT $SID)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
