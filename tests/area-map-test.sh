#!/bin/bash
# ทดสอบ: ผังผู้รับผิดชอบ — เบอร์โทร + ผังฝั่ง Area (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
#   · ผังฝ่ายบริการมีเบอร์ของคนที่มีเบอร์ · ผังฝั่ง Area ทุกคนเปิดได้ มีเบอร์ ดูแลสาขาไหน ใบงานค้าง
#   · แก้ผังฝั่ง Area ได้เฉพาะแอดมินและ Area (Area ย้ายได้ทุก Area) — ช่าง/หัวหน้าภาค/Supervisor (COCO)/Admin Spare Part ไม่ได้
#   · ย้าย Supervisor ไป Area อื่น · ย้ายสาขาระหว่าง Supervisor (เปลี่ยนว่าใครเห็นใบงาน) · ตรวจค่าที่ส่งมาทุกตัว
#   · Maid (COCO): ส่งแยก (maids + branches[].maids) — ผังวาดใต้คนที่ถือสาขา · ไม่อยู่ใน people · ลบบัญชีแล้วไม่ขึ้น
#   · คนลาออก: ย้ายสาขาทั้งหมดให้คนดูแลแทน (จำว่าเป็นของใคร) → คนใหม่มา ส่งต่อเฉพาะสาขาที่ดูแลแทน
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }

LOGINS="'zm.area1','zm.area2','zm.sup1','zm.sup2','zm.sup3','zm.sup4','zm.parts'"
T_PHONE=$(DB "select coalesce(phone,'') from \"User\" where \"employeeCode\"='T001'")
cleanup() {
  [ -n "$WID" ] && curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$WID" -H "$(H $A)"
  DB "update \"Branch\" set \"cocoSupervisorId\"=null, \"coverForId\"=null, \"coverForName\"=null, \"coverSince\"=null where code in ('C0001','C0006','CNX')" >/dev/null
  DB "update \"User\" set \"areaId\"=null where \"employeeCode\" like 'zm.%'" >/dev/null
  DB "delete from \"User\" where \"employeeCode\" like 'zm.%'" >/dev/null
  DB "update \"User\" set phone=NULLIF('$T_PHONE','') where \"employeeCode\"='T001'" >/dev/null
}
cleanup
trap cleanup EXIT

# บัญชีทดสอบ — รหัสผ่านเดียวกับ A001 (test1234) ไม่ต้องเปลี่ยนรหัส
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='A001'")
mkuser() { DB "insert into \"User\"(\"employeeCode\",name,phone,role,\"passwordHash\",\"mustChangePassword\",\"areaId\") values ('$1','$2',NULLIF('$3',''),'$4','$HASH',false,(select id from \"User\" where \"employeeCode\"=NULLIF('$5','')))" >/dev/null; }
mkuser zm.area1 "ทดสอบ อาเรียหนึ่ง (บี)" "081-700-0001" AREA ""
mkuser zm.area2 "ทดสอบ อาเรียสอง (ซี)" "" AREA ""
mkuser zm.sup1 "ทดสอบ ซุปหนึ่ง (นุ่น)" "089-100-0001" COCO_SUPERVISOR zm.area1
mkuser zm.sup2 "ทดสอบ ซุปสอง (ปอนด์)" "" COCO_SUPERVISOR zm.area1
mkuser zm.sup3 "ทดสอบ ซุปสาม (กล้วย)" "089-100-0003" COCO_SUPERVISOR zm.area2
mkuser zm.parts "ทดสอบ แอดมินอะไหล่" "" PARTS_ADMIN ""
id() { DB "select id from \"User\" where \"employeeCode\"='$1'"; }
AREA1=$(id zm.area1); AREA2=$(id zm.area2); SUP1=$(id zm.sup1); SUP2=$(id zm.sup2); SUP3=$(id zm.sup3); TID=$(id T001)
DB "update \"Branch\" set \"cocoSupervisorId\"=$SUP1 where code in ('C0001','C0006')" >/dev/null
DB "update \"Branch\" set \"cocoSupervisorId\"=$SUP2 where code='CNX'" >/dev/null
DB "update \"User\" set phone='081-555-0101' where \"employeeCode\"='T001'" >/dev/null

A=$(login A001); T=$(login T001); S=$(login S001)
AR1=$(login zm.area1); AR2=$(login zm.area2); C1=$(login zm.sup1); C2=$(login zm.sup2); C3=$(login zm.sup3); PA=$(login zm.parts)
[ -n "$AR1" ] && [ -n "$C3" ] && [ -n "$PA" ] || { echo "FAIL ล็อกอินบัญชีทดสอบไม่ได้"; exit 1; }

echo "═══ ผังฝ่ายบริการ: เบอร์โทร"
CM=$(GET $T teams/coverage-map)
[ "$(echo "$CM" | J 'd.technicians.find(t=>t.code==="T001").phone')" = "081-555-0101" ] \
  && pass "ช่างที่มีเบอร์ในระบบ: ผังส่งเบอร์มา (ช่างเปิดดูเองก็เห็น)" || fail "ไม่มีเบอร์ของ T001: $(echo "$CM" | head -c 200)"
[ "$(echo "$CM" | J 'd.supervisors.find(s=>s.code==="S001").phone')" = "null" ] && pass "คนที่ไม่มีเบอร์ = null (หน้าจอไม่ขึ้นบรรทัดเบอร์)" || fail "เบอร์ S001 ไม่ใช่ null"

echo "═══ ผังฝั่ง Area: ทุกคนเปิดได้"
for who in T S C2 AR1 A; do
  M=$(GET ${!who} teams/area-map)
  [ "$(echo "$M" | J 'Array.isArray(d.people) && Array.isArray(d.branches)')" = "true" ] || fail "$who เปิดผังฝั่ง Area ไม่ได้: $(echo "$M" | head -c 150)"
done
pass "ช่าง · หัวหน้าภาค · Supervisor (COCO) · Area · แอดมิน เปิดผังฝั่ง Area ได้"
M=$(GET $T teams/area-map)
[ "$(echo "$M" | J "const p=d.people.find(x=>x.id===$SUP1); [p.phone,p.areaId,p.role].join('|')")" = "089-100-0001|$AREA1|COCO_SUPERVISOR" ] \
  && pass "Supervisor (COCO): เบอร์ · อยู่ใต้ Area ไหน" || fail "ข้อมูล sup1: $(echo "$M" | J "JSON.stringify(d.people.find(x=>x.id===$SUP1))")"
[ "$(echo "$M" | J "d.branches.filter(b=>b.holderId===$SUP1).map(b=>b.code).join(',')")" = "C0001,C0006" ] \
  && pass "สาขาที่แต่ละคนดูแล (C0001 C0006 = ซุปหนึ่ง)" || fail "สาขาของ sup1: $(echo "$M" | J 'JSON.stringify(d.branches)')"
[ "$(echo "$M" | J 'd.branches.every(b=>/^c/i.test(b.code))')" = "true" ] && pass "มีแต่สาขา COCO" || fail "มีสาขาที่ไม่ใช่ COCO"

# Maid (COCO) — ไม่ใช่ผู้ดูแลสาขา จึงไม่อยู่ใน people แต่ผังต้องรู้ว่าสาขาไหนมีใครประจำ (ขึ้นใต้คนที่ถือสาขา)
mkuser zm.maid1 "ทดสอบ แม่บ้าน (ฝน)" "089-300-0001" COCO_MAID ""
mkuser zm.maid2 "ทดสอบ แม่บ้านลาออก (นิด)" "089-300-0002" COCO_MAID ""
MAID1=$(id zm.maid1); MAID2=$(id zm.maid2)
DB "insert into \"CocoMaidBranch\"(\"userId\",\"branchId\") select $MAID1, id from \"Branch\" where code in ('C0006','CNX')" >/dev/null
DB "insert into \"CocoMaidBranch\"(\"userId\",\"branchId\") select $MAID2, id from \"Branch\" where code='C0006'" >/dev/null
DB "update \"User\" set \"deletedAt\"=now() where id=$MAID2" >/dev/null
M=$(GET $T teams/area-map)
[ "$(echo "$M" | J "const m=d.maids.find(x=>x.id===$MAID1); m ? [m.name,m.code,m.phone].join('|') : '-'")" = "ทดสอบ แม่บ้าน (ฝน)|zm.maid1|089-300-0001" ] \
  && pass "Maid (COCO): ชื่อ รหัส เบอร์ (ช่างเปิดผังก็เห็น)" || fail "maids: $(echo "$M" | J 'JSON.stringify(d.maids)')"
[ "$(echo "$M" | J "['C0001','C0006','CNX'].map(c=>c+':'+d.branches.find(b=>b.code===c).maids.join('+')).join(',')")" = "C0001:,C0006:$MAID1,CNX:$MAID1" ] \
  && pass "สาขาบอกว่ามี Maid คนไหนประจำ — Maid คนเดียวประจำได้หลายสาขา · ลบบัญชีแล้วไม่ขึ้น" || fail "branches[].maids: $(echo "$M" | J "JSON.stringify(d.branches.filter(b=>b.maids.length))")"
[ "$(echo "$M" | J "d.people.some(p=>p.id===$MAID1||p.id===$MAID2) || d.maids.some(m=>m.id===$MAID2)")" = "false" ] \
  && pass "Maid ไม่อยู่ใน people (ไม่ใช่ที่วางสาขา) · Maid ที่ลบบัญชีแล้วไม่อยู่ใน maids" || fail "Maid หลุดเข้า people หรือ Maid ลาออกยังอยู่"
[ "$(GET $(login zm.maid1) teams/area-map | J 'Array.isArray(d.maids) && d.canEdit === false')" = "true" ] \
  && pass "Maid (COCO) เปิดผังได้ แต่แก้ไม่ได้" || fail "Maid เปิดผัง/สิทธิ์แก้ไม่ถูก"
canEdit() { GET $1 teams/area-map | J 'd.canEdit'; }
[ "$(canEdit $A)|$(canEdit $AR2)|$(canEdit $T)|$(canEdit $S)|$(canEdit $C1)|$(canEdit $PA)" = "true|true|false|false|false|false" ] \
  && pass "ปุ่มแก้ไข: แอดมิน · Area เท่านั้น" || fail "canEdit: $(canEdit $A)|$(canEdit $AR2)|$(canEdit $T)|$(canEdit $S)|$(canEdit $C1)|$(canEdit $PA)"

echo "═══ ใครบันทึกได้"
MOVE="{\"supervisors\":[{\"id\":$SUP2,\"areaId\":$AREA2}]}"
[ "$(CODE $T teams/area-map "$MOVE")|$(CODE $S teams/area-map "$MOVE")|$(CODE $C1 teams/area-map "$MOVE")|$(CODE $PA teams/area-map "$MOVE")" = "403|403|403|403" ] \
  && pass "ช่าง · หัวหน้าภาค · Supervisor (COCO) · Admin Spare Part บันทึกไม่ได้ (403)" || fail "สิทธิ์บันทึก: $(CODE $T teams/area-map "$MOVE")|$(CODE $S teams/area-map "$MOVE")|$(CODE $C1 teams/area-map "$MOVE")|$(CODE $PA teams/area-map "$MOVE")"
[ "$(DB "select \"areaId\" from \"User\" where id=$SUP2")" = "$AREA1" ] && pass "ฐานข้อมูลไม่เปลี่ยนหลังถูกปฏิเสธ" || fail "areaId เปลี่ยนทั้งที่ 403"

echo "═══ Area ย้าย Supervisor ไป Area อื่น"
R=$(POST $AR1 teams/area-map "$MOVE")
[ "$(echo "$R" | J 'd.ok')" = "true" ] && [ "$(DB "select \"areaId\" from \"User\" where id=$SUP2")" = "$AREA2" ] \
  && pass "Area (บี) ย้ายซุปสองไปอยู่ใต้ Area ซี (ฐานข้อมูล)" || fail "ย้าย Supervisor: $R"
# Area ย้ายได้ทุก Area — ไม่ใช่แค่คนใต้ตัวเอง
R=$(POST $AR1 teams/area-map "{\"supervisors\":[{\"id\":$SUP3,\"areaId\":$AREA1}]}")
[ "$(DB "select \"areaId\" from \"User\" where id=$SUP3")" = "$AREA1" ] && pass "Area ย้ายคนของ Area อื่นได้ (เท่าแอดมิน)" || fail "ย้ายข้าม Area: $R"
R=$(POST $A teams/area-map "{\"supervisors\":[{\"id\":$SUP3,\"areaId\":null}]}")
[ "$(DB "select coalesce(\"areaId\"::text,'-') from \"User\" where id=$SUP3")" = "-" ] && pass "แอดมินเอาออกจาก Area ได้ (ยังไม่มี Area)" || fail "เอาออก: $R"
POST $A teams/area-map "{\"supervisors\":[{\"id\":$SUP3,\"areaId\":$AREA2}]}" >/dev/null

echo "═══ ตรวจค่าที่ส่งมา"
bad() { [ "$(CODE $A teams/area-map "$2")" = "400" ] && pass "$1 → 400" || fail "$1 ไม่ได้ 400"; }
bad "ย้ายช่าง (ไม่ใช่ Supervisor (COCO))" "{\"supervisors\":[{\"id\":$TID,\"areaId\":$AREA1}]}"
bad "ปลายทางเป็น Supervisor ไม่ใช่ Area" "{\"supervisors\":[{\"id\":$SUP2,\"areaId\":$SUP3}]}"
bad "ให้ช่างถือสาขา" "{\"branches\":[{\"code\":\"C0001\",\"holderId\":$TID}]}"
NONCOCO=$(DB "select code from \"Branch\" where code not ilike 'C%' and \"cancelledAt\" is null limit 1")
bad "สาขาที่ไม่ใช่ COCO ($NONCOCO)" "{\"branches\":[{\"code\":\"$NONCOCO\",\"holderId\":$SUP3}]}"
bad "ดูแลแทนตัวเอง" "{\"branches\":[{\"code\":\"C0001\",\"holderId\":$SUP1,\"coverForId\":$SUP1}]}"
bad "ไม่มีการเปลี่ยนแปลง" "{}"
[ "$(DB "select string_agg(code||'='||\"cocoSupervisorId\", ' ' order by code) from \"Branch\" where code in ('C0001','C0006','CNX')")" = "C0001=$SUP1 C0006=$SUP1 CNX=$SUP2" ] \
  && pass "ฐานข้อมูลไม่เปลี่ยนจากคำขอที่ผิด" || fail "สาขาเปลี่ยน"

echo "═══ ย้ายสาขาทีละสาขา = เปลี่ยนคนที่เห็นใบงาน"
WO=$(POST $A work-orders '{"branchCode":"CNX","jobType":"CM","machines":[{"code":"W1","symptom":"ทดสอบผัง Area ย้ายสาขา"}]}')
WID=$(echo "$WO" | J 'd.orders ? d.orders[0].id : d.id')
see() { curl -s -o /dev/null -w "%{http_code}" "localhost:4000/api/work-orders/$WID" -H "$(H $1)"; }
[ "$(see $C2)" = "200" ] && [ "$(see $C3)" != "200" ] && pass "ก่อนย้าย: ซุปสองเห็นใบงานของ CNX · ซุปสามไม่เห็น" || fail "ก่อนย้าย C2=$(see $C2) C3=$(see $C3)"
R=$(POST $AR2 teams/area-map "{\"branches\":[{\"code\":\"CNX\",\"holderId\":$SUP3}]}")
[ "$(DB "select \"cocoSupervisorId\" from \"Branch\" where code='CNX'")" = "$SUP3" ] && pass "ย้าย CNX ไปให้ซุปสาม (ฐานข้อมูล)" || fail "ย้ายสาขา: $R"
[ "$(see $C3)" = "200" ] && [ "$(see $C2)" != "200" ] && pass "หลังย้าย: ซุปสามเห็นใบงาน ซุปสองไม่เห็นแล้ว (มีผลทันที)" || fail "หลังย้าย C3=$(see $C3) C2=$(see $C2)"

echo "═══ คนลาออก → ดูแลแทน → คนใหม่มารับต่อ"
# ซุปหนึ่งลาออก — บัญชีถูกลบ (มีประวัติ = ปิดบัญชี) แต่สาขายังผูกอยู่
DB "update \"User\" set \"deletedAt\"=now(), \"employeeCode\"='zm.sup1~ลบ$SUP1' where id=$SUP1" >/dev/null
M=$(GET $AR1 teams/area-map)
[ "$(echo "$M" | J "const p=d.people.find(x=>x.id===$SUP1); p&&p.left&&p.code==='zm.sup1' ? d.branches.filter(b=>b.holderId===$SUP1).length : -1")" = "2" ] \
  && pass "คนที่ลบบัญชีแล้วแต่ยังถือสาขา ยังอยู่ในผัง (ลาออก · 2 สาขา) — ไม่หายไปเงียบ ๆ" || fail "คนลาออก: $(echo "$M" | J "JSON.stringify(d.people.find(x=>x.id===$SUP1))")"
COVER="{\"branches\":[{\"code\":\"C0001\",\"holderId\":$SUP3,\"coverForId\":$SUP1},{\"code\":\"C0006\",\"holderId\":$SUP3,\"coverForId\":$SUP1}]}"
R=$(POST $AR1 teams/area-map "$COVER")
[ "$(DB "select string_agg(code||'='||\"cocoSupervisorId\"||'/'||\"coverForId\"||'/'||\"coverForName\"||'/'||(\"coverSince\" is not null)::text, ' ' order by code) from \"Branch\" where code in ('C0001','C0006')")" \
  = "C0001=$SUP3/$SUP1/ทดสอบ ซุปหนึ่ง (นุ่น)/true C0006=$SUP3/$SUP1/ทดสอบ ซุปหนึ่ง (นุ่น)/true" ] \
  && pass "ย้ายสาขาทั้งหมดของนุ่นให้ซุปสามดูแลแทน — จำว่าเป็นของใคร ตั้งแต่เมื่อไร (ฐานข้อมูล)" || fail "ดูแลแทน: $R"
M=$(GET $T teams/area-map)
[ "$(echo "$M" | J "d.branches.filter(b=>b.holderId===$SUP3).map(b=>b.code+':'+(b.cover?b.cover.forName:'-')).join(',')")" = "C0001:ทดสอบ ซุปหนึ่ง (นุ่น),C0006:ทดสอบ ซุปหนึ่ง (นุ่น),CNX:-" ] \
  && pass "ผัง: ซุปสามถือ 3 สาขา — 2 สาขาดูแลแทนนุ่น · CNX ของตัวเอง" || fail "ผังหลังดูแลแทน: $(echo "$M" | J "JSON.stringify(d.branches)")"
SINCE=$(DB "select \"coverSince\" from \"Branch\" where code='C0001'")
mkuser zm.sup4 "ทดสอบ ซุปใหม่ (มายด์)" "089-100-0004" COCO_SUPERVISOR zm.area1
SUP4=$(id zm.sup4)
HAND="{\"branches\":[{\"code\":\"C0001\",\"holderId\":$SUP4},{\"code\":\"C0006\",\"holderId\":$SUP4}]}"
R=$(POST $A teams/area-map "$HAND")
[ "$(DB "select string_agg(code||'='||\"cocoSupervisorId\"||'/'||coalesce(\"coverForName\",'-'), ' ' order by code) from \"Branch\" where code in ('C0001','C0006','CNX')")" \
  = "C0001=$SUP4/- C0006=$SUP4/- CNX=$SUP3/-" ] \
  && pass "ส่งต่อให้คนใหม่: 2 สาขาเป็นของคนใหม่ถาวร · CNX ของซุปสามไม่ติดไปด้วย (ฐานข้อมูล)" || fail "ส่งต่อ: $R"

# ย้ายระหว่างคนดูแลแทนด้วยกัน (เจ้าของเดิมคนเดียวกัน) — วันเริ่มดูแลแทนไม่เริ่มนับใหม่
POST $A teams/area-map "$COVER" >/dev/null
SINCE1=$(DB "select \"coverSince\" from \"Branch\" where code='C0001'")
sleep 1
POST $A teams/area-map "{\"branches\":[{\"code\":\"C0001\",\"holderId\":$SUP2,\"coverForId\":$SUP1}]}" >/dev/null
[ "$(DB "select \"coverSince\" from \"Branch\" where code='C0001'")" = "$SINCE1" ] && [ "$(DB "select \"cocoSupervisorId\" from \"Branch\" where code='C0001'")" = "$SUP2" ] \
  && pass "ย้ายสาขาที่ดูแลแทนไปคนดูแลแทนอีกคน — นับวันเริ่มเดิม" || fail "วันเริ่มดูแลแทนเปลี่ยน"
bad "ให้คนที่ลบบัญชีแล้วรับสาขา" "{\"branches\":[{\"code\":\"C0001\",\"holderId\":$SUP1}]}"

[ -z "$FAILED" ] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }
