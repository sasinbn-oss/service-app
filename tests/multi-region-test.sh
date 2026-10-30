#!/bin/bash
# ทดสอบ: หัวหน้าภาคดูแลได้หลายภาค (เจ้าของงานขอ ต.ค. 69 · User.region = ภาคแรก + User.extraRegions = ภาคที่เพิ่ม)
#   · แอดมินตั้งหลายภาคผ่าน PATCH regions → ฐานข้อมูลเก็บภาคแรกที่ region ที่เหลือที่ extraRegions (ตัดช่องว่าง/ซ้ำ)
#   · ชื่อภาคที่ไม่มีในทะเบียนสาขา 400 ภาษาไทย (ทั้งสร้างและแก้) · เกิน 20 ภาค 400 · ภาคที่ถืออยู่แล้วแม้หายจากทะเบียน เอาภาคอื่นออกได้
#   · ชื่อภาคว่าง/ยาวเกินได้ข้อความไทย · สร้างบัญชีที่ไม่ผ่านได้ error เป็นข้อความ (ไม่ใช่ก้อน JSON ที่แอปโชว์ดิบ)
#   · ผัง: คอลัมน์ "ไม่ระบุภาค" มีธง noRegion ให้ผังห้ามวางหัวหน้าภาค (ชื่อนี้เซิร์ฟเวอร์ไม่รับ)
#   · แอปรุ่นเก่าส่ง region เดี่ยว: แทนภาคแรก ภาคที่เพิ่มไว้อยู่ต่อ (ตัวซ้ำถูกตัด) · null = ภาคถัดไปขึ้นแทน · ส่งทั้งคู่ regions ชนะ
#     — แอปรุ่นเก่ามองไม่เห็นภาคที่เพิ่ม จะให้มันลบสิ่งที่มองไม่เห็นไม่ได้
#   · ภาคที่เพิ่มได้สิทธิ์เต็มเท่าภาคแรก: รายการ · หน้าใบงาน (ไม่ใช่ดูอย่างเดียว) · กล่องงาน · ระบุอะไหล่ → นัด → ปล่อยงาน
#     โทเคนที่ล็อกอินไว้ก่อนแก้ภาคได้ผลทันที (ขอบเขตอ่านจากฐานข้อมูลทุกคำขอ ไม่อยู่ในโทเคน)
#   · สองคนถือภาคเดียวกัน: เข้ากล่องทั้งคู่ · "รอใคร" มีทั้งสองชื่อ ไม่ขึ้นไม่มีคนรับ · คนกดช้าได้ 409 แล้วเห็นขั้นใหม่ · คนไหนก็ทำขั้นต่อได้
#   · ทีมมาก่อนภาค: หัวหน้าภาคอีกคนดูแลทีมกรุงเทพ → ใบของทีมนั้นออกจากทุกคนที่ถือภาคกลาง-ตะวันตก (ภาคแรกหรือภาคที่เพิ่ม)
#   · บอร์ดแผนงาน: ทีมที่จัดแผนได้ = ทีมของทุกภาค · เลนมีใบของภาคที่เพิ่ม · จัดแผนทีมนั้นได้ · เอาภาคออกแล้ว 403
#   · ผังผู้รับผิดชอบ · รายงานคนไม่มีพื้นที่ · ดูในฐานะหัวหน้าภาคหลายภาค (เห็นครบ แต่กดไม่ได้)
#   · รายงาน: คอนเฟิร์มลูกค้า (ส่งไลน์) มีภาคของสาขา ครบทั้งสองภาค · ผู้เปิดใบงาน/การใช้งาน/รายงานทั้งระบบโชว์ทุกภาค
#   · เปลี่ยนเป็นช่าง/ลบบัญชี ล้างทุกภาค
# ยืนยันผลที่ฐานข้อมูลทุกข้อ (CLAUDE.md) · คืน S001 เป็นค่าเดิม (ภาคใต้ ไม่มีภาคเพิ่ม ไม่มีทีม)
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1" 2>/dev/null; }
H() { echo "Authorization: Bearer $1"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
TOK() { login "$@" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SEND() { curl -s -X "$1" "localhost:4000/api/$3" -H "$(H $2)" -H 'Content-Type: application/json' -d "$4"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "localhost:4000/api/$3" -H "$(H $2)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
# วันนัดย้อนหลังไม่ได้ — ใช้วันข้างหน้าเสมอ
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
REG() { DB "select coalesce(region,'-')||'|'||array_to_string(\"extraRegions\",',') from \"User\" where \"employeeCode\"='$1'"; }
ST() { DB "select status||'|'||coalesce(\"appointmentStatus\",'-') from \"WorkOrder\" where id=$1"; }
WCODE() { DB "select code from \"WorkOrder\" where id=$1"; }
# ใบนี้อยู่ในรายการ (ALL/INBOX) ของคนนี้ไหม — ค้นด้วยเลขใบงาน ไม่ต้องดึงทั้งหมด
has() { GET $1 "work-orders?status=$2&search=$(WCODE $3)" | J "String((d.rows||[]).some(r=>r.id===$3))"; }
# "รอใคร" ที่แอดมินเห็น = id หัวหน้าภาคเรียงน้อยไปมาก | ป้ายไม่มีคนรับ
waiting() { GET $A "work-orders?status=ALL&search=$(WCODE $1)" | J "const r=d.rows.find(x=>x.id===$1); r.waitingOnSupervisors.map(s=>s.id).sort((a,b)=>a-b).join(',')+'|'+r.orphan"; }
MINE() { GET $1 work-orders/options | J "String((d.teams.find(t=>t.name==='$2')||{}).mine)"; }
PLANNABLE() { GET $1 "plans/day?date=$VISIT" | J '[...(d.plannableTeams||[])].sort().join(",")'; }
# ทีมของสาขาที่ยังเปิดอยู่ในภาคเหล่านี้ (ทีม CM + ทีม PM) — คำตอบที่ถูกของ plannableTeams เมื่อไม่มีทีมไหนถูกคนอื่นดูแล
TEAMS_OF() { DB "select string_agg(t, ',' order by t) from (select zone t from \"Branch\" where region in ($1) and \"cancelledAt\" is null and zone is not null union select \"pmTeam\" from \"Branch\" where region in ($1) and \"cancelledAt\" is null and \"pmTeam\" is not null) x" | tr ',' '\n' | sort | paste -sd,; }
# บัญชีที่แอดมินสร้างต้องเปลี่ยนรหัสก่อนใช้ — เปลี่ยนให้แล้วคืนโทเคนที่ใช้งานได้
activate() {
  local t=$(TOK "$1" temp12345)
  SEND POST $t auth/change-password '{"currentPassword":"temp12345","newPassword":"test12345"}' | J 'd.token'
}

SUF=$((RANDOM % 9000 + 1000))
SYMPTOM="ทดสอบหลายภาค$SUF"
NEWREG="ภาคทดสอบหลายภาค$SUF"
VISIT=$(day 41)
TODAY=$(TZ=Asia/Bangkok date +%F)
A=$(TOK A001)
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
SNAME=$(DB "select name from \"User\" where id=$SID")
SNAP=$(DB "select coalesce(region,'')||'|'||array_to_string(\"extraRegions\",',')||'|'||array_to_string(\"supervisedTeams\",',') from \"User\" where id=$SID")
VSTART=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
cleanup() {
  for i in $(DB "select id from \"WorkOrder\" where symptom like '$SYMPTOM%'"); do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"TeamDayPlan\" where date='$VISIT' and \"plannedById\"=$SID" >/dev/null
  DB "delete from \"ViewAsLog\" where id>$VSTART and \"targetUserId\"=$SID" >/dev/null
  # % ท้าย — บัญชีที่ลบแบบเก็บประวัติถูกเปลี่ยนรหัสเป็น "<รหัส>~ลบ<id>" (ปล่อยรหัสเดิมให้ใช้ซ้ำได้)
  DB "delete from \"User\" where \"employeeCode\" like 'ZMR%$SUF%'" >/dev/null
  DB "delete from \"Branch\" where code in ('ZMRB$SUF','ZMRN$SUF')" >/dev/null
  local R E T
  IFS='|' read -r R E T <<< "$SNAP"
  DB "update \"User\" set region=nullif('$R',''), \"extraRegions\"=coalesce(string_to_array(nullif('$E',''),','),'{}'),
      \"supervisedTeams\"=coalesce(string_to_array(nullif('$T',''),','),'{}') where id=$SID" >/dev/null
}
trap cleanup EXIT

# ฉากตั้งต้น — ถ้ามีคนอื่นดูแลภาคกลาง-ตะวันตก/ทีมกรุงเทพอยู่ก่อน ข้อ "รอใคร" กับทีมมาก่อนภาคจะเพี้ยนด้วยเหตุที่ไม่เกี่ยว
[ "$SNAP" = "ใต้||" ] && [ "$(DB "select region||'|'||zone from \"Branch\" where code='C0001'")|$(DB "select region||'|'||zone from \"Branch\" where code='C0006'")" = "กลาง-ตะวันตก|กรุงเทพ|ใต้|กระบี่" ] \
  || { echo "FAIL ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้ ไม่มีภาคเพิ่ม/ทีม · C0001 กลาง-ตะวันตก/กรุงเทพ · C0006 ใต้/กระบี่) — S001=$SNAP"; exit 1; }
OTHERS=$(DB "select string_agg(\"employeeCode\", ',') from \"User\" where role='SUPERVISOR' and \"deletedAt\" is null and id<>$SID
  and ('กลาง-ตะวันตก' = region or 'กลาง-ตะวันตก' = any(\"extraRegions\") or 'กรุงเทพ' = any(\"supervisedTeams\"))")
[ -z "$OTHERS" ] || { echo "FAIL มีหัวหน้าภาคคนอื่นดูแลภาคกลาง-ตะวันตก/ทีมกรุงเทพอยู่แล้ว ($OTHERS) — ผลเทสต์นี้จะไม่น่าเชื่อถือ"; exit 1; }

# โทเคนของ S001 ล็อกอินก่อนแก้ภาค — ใช้ตัวเดิมตลอด พิสูจน์ว่าขอบเขตไม่ได้ฝังในโทเคน
S=$(TOK S001)
# สาขาชั่วคราวในภาคใหม่ — ภาคที่สามสำหรับกฎ region เดี่ยว (ไม่มีทีม จึงไม่กระทบแผนงาน/ผังของใคร)
DB "insert into \"Branch\"(code,name,region) values ('ZMRB$SUF','สาขาทดสอบหลายภาค','$NEWREG')" >/dev/null

echo "═══ ก่อนเพิ่มภาค: ใบสาขา C0001 (กลาง-ตะวันตก) ไม่ใช่ของ S001"
W1=$(SEND POST $A work-orders "{\"branchCode\":\"C0001\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W1\",\"symptom\":\"$SYMPTOM ใบที่หนึ่ง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
[ "$(has $S ALL $W1)|$(CODE GET $S work-orders/$W1)|$(waiting $W1)" = "false|403||true" ] \
  && pass "S001 (ภาคใต้อย่างเดียว) ไม่เห็นใบ C0001 · เปิดตรง ๆ 403 · แอดมินเห็นว่าไม่มีคนรับ" || fail "ก่อนเพิ่มภาค: $(has $S ALL $W1) $(CODE GET $S work-orders/$W1) $(waiting $W1)"

echo
echo "═══ แอดมินตั้งหลายภาค"
R=$(SEND PATCH $A auth/users/$SID '{"regions":["ใต้"," กลาง-ตะวันตก ","ใต้"]}')
[ "$(echo "$R" | J 'JSON.stringify(d.regions)+"|"+d.region+"|"+JSON.stringify(d.extraRegions)')" = '["ใต้","กลาง-ตะวันตก"]|ใต้|["กลาง-ตะวันตก"]' ] \
  && [ "$(REG S001)" = "ใต้|กลาง-ตะวันตก" ] \
  && pass "PATCH regions: ตัดช่องว่าง/ซ้ำ · ฐานข้อมูล region=ใต้ extraRegions={กลาง-ตะวันตก} · คำตอบมี regions" || fail "PATCH regions: $(echo "$R" | head -c 200) DB=$(REG S001)"
[ "$(GET $S auth/me | J 'JSON.stringify(d.regions)+"|"+d.region')|$(login S001 | J 'JSON.stringify(d.user.regions)')" = '["ใต้","กลาง-ตะวันตก"]|ใต้|["ใต้","กลาง-ตะวันตก"]' ] \
  && pass "/auth/me (โทเคนเดิม) และล็อกอินใหม่ ส่ง regions ครบ · region = ภาคแรก" || fail "me/login: $(GET $S auth/me | J 'JSON.stringify(d.regions)')"
[ "$(GET $A auth/users | J "JSON.stringify(d.find(u=>u.id===$SID).regions)")" = '["ใต้","กลาง-ตะวันตก"]' ] \
  && pass "/auth/users มี regions ของแต่ละคน" || fail "/auth/users: $(GET $A auth/users | J "JSON.stringify(d.find(u=>u.id===$SID))" | head -c 200)"

echo
echo "═══ ตรวจชื่อภาค"
R=$(SEND PATCH $A auth/users/$SID "{\"regions\":[\"ใต้\",\"ไม่มีภาคนี้$SUF\"]}")
[ "$(echo "$R" | J 'd.error')" = "ไม่มีภาค “ไม่มีภาคนี้$SUF” ในทะเบียนสาขา" ] && [ "$(REG S001)" = "ใต้|กลาง-ตะวันตก" ] \
  && pass "ภาคที่ไม่มีในทะเบียนสาขา → 400 บอกชื่อเป็นภาษาไทย · ฐานข้อมูลไม่เปลี่ยน" || fail "ภาคไม่มีจริง: $R DB=$(REG S001)"
MANY=$(node -e 'console.log(JSON.stringify({regions:Array.from({length:21},(_,i)=>"ภาค"+i)}))')
R=$(SEND PATCH $A auth/users/$SID "$MANY")
echo "$R" | grep -q "เลือกภาคได้ไม่เกิน 20 ภาค" && [ "$(REG S001)" = "ใต้|กลาง-ตะวันตก" ] \
  && pass "เกิน 20 ภาค → 400 \"เลือกภาคได้ไม่เกิน 20 ภาค\"" || fail "21 ภาค: $(echo "$R" | head -c 150)"
# ข้อความจาก zod ขึ้นหน้าจอตรง ๆ — ต้องเป็นไทย และ POST ต้องเป็นข้อความ ไม่ใช่ก้อน flatten ที่แอปโชว์เป็น JSON ดิบ
LONG=$(node -e 'console.log("ก".repeat(121))')
[ "$(SEND PATCH $A auth/users/$SID '{"regions":["  "]}' | J 'd.error')|$(SEND PATCH $A auth/users/$SID "{\"regions\":[\"$LONG\"]}" | J 'd.error')|$(REG S001)" \
  = "ชื่อภาคว่างไม่ได้|ชื่อภาคยาวเกิน 120 ตัวอักษร|ใต้|กลาง-ตะวันตก" ] \
  && pass "ชื่อภาคว่าง/ยาวเกิน → 400 ภาษาไทย · ฐานข้อมูลไม่เปลี่ยน" || fail "ข้อความชื่อภาค: $(SEND PATCH $A auth/users/$SID '{"regions":["  "]}')"
MANYP=$(node -e 'console.log(JSON.stringify({employeeCode:"ZMRY"+process.argv[1],name:"หัวหน้าภาคเกินยี่สิบ",role:"SUPERVISOR",password:"temp12345",regions:Array.from({length:21},(_,i)=>"ภาค"+i)}))' $SUF)
[ "$(SEND POST $A auth/users "$MANYP" | J 'typeof d.error+"|"+d.error')|$(DB "select count(*) from \"User\" where \"employeeCode\"='ZMRY$SUF'")" = "string|เลือกภาคได้ไม่เกิน 20 ภาค|0" ] \
  && pass "สร้างบัญชีเกิน 20 ภาค → error เป็นข้อความไทย (ไม่ใช่ก้อน JSON) · ไม่สร้างบัญชี" || fail "POST 21 ภาค: $(SEND POST $A auth/users "$MANYP" | head -c 200)"
R=$(SEND POST $A auth/users "{\"employeeCode\":\"ZMRX$SUF\",\"name\":\"หัวหน้าภาคชื่อภาคผิด\",\"role\":\"SUPERVISOR\",\"regions\":[\"ไม่มีภาคนี้$SUF\"],\"password\":\"temp12345\"}")
[ "$(echo "$R" | J 'd.error')" = "ไม่มีภาค “ไม่มีภาคนี้$SUF” ในทะเบียนสาขา" ] && [ "$(DB "select count(*) from \"User\" where \"employeeCode\"='ZMRX$SUF'")" = "0" ] \
  && pass "สร้างบัญชีด้วยภาคที่ไม่มีจริง → 400 ไม่สร้างบัญชี" || fail "POST ภาคไม่มีจริง: $R"
R=$(SEND PATCH $A auth/users/$SID "{\"regions\":[\"ใต้\",\"กลาง-ตะวันตก\",\"$NEWREG\"]}")
[ "$(REG S001)" = "ใต้|กลาง-ตะวันตก,$NEWREG" ] && pass "ภาคที่เพิ่งมีสาขาในทะเบียนเลือกได้ทันที (สามภาค)" || fail "ภาคใหม่: $(echo "$R" | head -c 150) DB=$(REG S001)"
# ภาคที่ถืออยู่แต่หายจากทะเบียน (สาขาย้ายออกหมด) ต้องไม่ทำให้บันทึกทั้งชุดไม่ผ่าน — ไม่งั้นเอาภาคอื่นออกไม่ได้เลย
DB "update \"User\" set \"extraRegions\"=array['กลาง-ตะวันตก','ภาคเก่าค้าง$SUF'] where id=$SID" >/dev/null
[ "$(CODE PATCH $A auth/users/$SID "{\"regions\":[\"ใต้\",\"ภาคเก่าค้าง$SUF\"]}")|$(REG S001)" = "200|ใต้|ภาคเก่าค้าง$SUF" ] \
  && pass "ภาคที่ถืออยู่แม้ไม่มีในทะเบียนแล้ว บันทึกผ่าน (เอากลาง-ตะวันตกออกได้)" || fail "ภาคค้าง: DB=$(REG S001)"
[ "$(GET $A auth/users | J "JSON.stringify(d.find(u=>u.id===$SID).regions)")" = "[\"ใต้\",\"ภาคเก่าค้าง$SUF\"]" ] \
  && pass "/auth/users ส่งภาคที่ค้างมาด้วย (หน้าสิทธิ์ผู้ใช้ขึ้นปุ่มให้เอาออก)" || fail "ภาคค้างไม่อยู่ในรายการ"

echo
echo "═══ แอปรุ่นเก่าส่ง region เดี่ยว"
SEND PATCH $A auth/users/$SID '{"regions":["ใต้","กลาง-ตะวันตก"]}' >/dev/null
SEND PATCH $A auth/users/$SID "{\"region\":\"$NEWREG\"}" >/dev/null
[ "$(REG S001)" = "$NEWREG|กลาง-ตะวันตก" ] && pass "region เดี่ยวแทนภาคแรก ภาคที่เพิ่มไว้อยู่ต่อ" || fail "region เดี่ยว: $(REG S001)"
SEND PATCH $A auth/users/$SID '{"region":"กลาง-ตะวันตก"}' >/dev/null
[ "$(REG S001)" = "กลาง-ตะวันตก|" ] && pass "region เดี่ยวที่ซ้ำกับภาคที่เพิ่ม → เหลือตัวเดียว ไม่เก็บซ้ำ" || fail "region ซ้ำ: $(REG S001)"
SEND PATCH $A auth/users/$SID '{"regions":["ใต้","กลาง-ตะวันตก"]}' >/dev/null
SEND PATCH $A auth/users/$SID '{"region":null}' >/dev/null
[ "$(REG S001)" = "กลาง-ตะวันตก|" ] && pass "region:null เอาภาคแรกออก ภาคถัดไปขึ้นแทน (ไม่ล้างทุกภาค)" || fail "region null: $(REG S001)"
SEND PATCH $A auth/users/$SID "{\"regions\":[\"ใต้\",\"กลาง-ตะวันตก\"],\"region\":\"$NEWREG\"}" >/dev/null
[ "$(REG S001)" = "ใต้|กลาง-ตะวันตก" ] && pass "ส่งทั้ง regions และ region → ใช้ regions" || fail "ส่งทั้งคู่: $(REG S001)"
# ผังผู้รับผิดชอบบันทึกด้วย PATCH ตัวเดียวกัน — แก้แค่ทีมต้องไม่ล้างภาค
SEND PATCH $A auth/users/$SID '{"supervisedTeams":[]}' >/dev/null
[ "$(REG S001)" = "ใต้|กลาง-ตะวันตก" ] && pass "PATCH ที่ไม่ส่งภาคมา ภาคเดิมอยู่ครบ" || fail "PATCH ทีมล้างภาค: $(REG S001)"

echo
echo "═══ ภาคที่เพิ่มได้สิทธิ์เต็ม (โทเคนเดิมก่อนแก้ภาค)"
D=$(GET $S work-orders/$W1)
[ "$(has $S ALL $W1)|$(echo "$D" | J 'String(d.viewOnly===undefined||d.viewOnly===false)')|$(has $S INBOX $W1)" = "true|true|true" ] \
  && pass "ใบ C0001: อยู่ในรายการ · เปิดได้ไม่ใช่ดูอย่างเดียว · อยู่ในกล่องงาน" || fail "ขอบเขตภาคเพิ่ม: list=$(has $S ALL $W1) detail=$(echo "$D" | head -c 120) inbox=$(has $S INBOX $W1)"
C=$(GET $S work-orders/inbox-count | J 'd.inbox'); L=$(GET $S "work-orders?status=INBOX" | J 'd.rows.length+"|"+d.counts.INBOX')
[ "$L" = "$C|$C" ] && pass "ตัวเลขกล่องงานตรงกับรายการ ($C) — นับใบของทุกภาค" || fail "กล่องงาน นับ=$C รายการ|ชิป=$L"
[ "$(waiting $W1)" = "$SID|false" ] && [ "$(GET $A "work-orders?status=ALL&search=$(WCODE $W1)" | J "JSON.stringify(d.rows.find(x=>x.id===$W1).waitingOnSupervisors[0].regions)")" = '["ใต้","กลาง-ตะวันตก"]' ] \
  && pass "แอดมิน: รอ S001 (พร้อมทุกภาค) · ไม่ขึ้นไม่มีคนรับ" || fail "รอใคร: $(waiting $W1)"
[ "$(CODE POST $S work-orders/$W1/parts '{"needsParts":false}')|$(ST $W1)" = "200|PARTS_CHECKED|-" ] \
  && pass "ระบุอะไหล่ (ไม่ใช้อะไหล่) ได้ → ขั้นนัดวัน (ฐานข้อมูล)" || fail "ระบุอะไหล่: $(ST $W1)"
[ "$(CODE POST $S work-orders/$W1/assign "{\"team\":\"กรุงเทพ\",\"scheduledAt\":\"$VISIT\",\"scheduledTime\":\"10:00\"}")|$(ST $W1)|$(DB "select \"assignedTeam\"||'|'||\"scheduledAt\"::date from \"WorkOrder\" where id=$W1")" = "200|AWAITING_CONFIRM|PENDING|กรุงเทพ|$VISIT" ] \
  && pass "นัดวัน + จ่ายทีมกรุงเทพได้ → รอแอดมินคอนเฟิร์มลูกค้า (ฐานข้อมูล)" || fail "จ่ายงาน: $(ST $W1)"
SEND POST $A work-orders/$W1/confirm-appointment '{}' >/dev/null
[ "$(CODE POST $S work-orders/$W1/dispatch '{}')|$(ST $W1)" = "200|IN_PROGRESS|CONFIRMED" ] \
  && pass "คอนเฟิร์มแล้ว S001 ปล่อยงานได้ → ถึงช่าง (ฐานข้อมูล)" || fail "ปล่อยงาน: $(ST $W1)"
[ "$(DB "select string_agg(action, ',' order by id) from \"WorkOrderLog\" where \"workOrderId\"=$W1 and \"userId\"=$SID")" = "NO_PARTS,ASSIGNED,DISPATCHED" ] \
  && pass "ประวัติลงชื่อ S001 ทุกขั้นที่ทำ" || fail "ประวัติ: $(DB "select string_agg(action||':'||coalesce(\"userId\"::text,'-'), ',' order by id) from \"WorkOrderLog\" where \"workOrderId\"=$W1")"
[ "$(MINE $S กรุงเทพ)|$(MINE $S กระบี่)" = "true|true" ] && pass "ช่องทีมที่จะรับงาน: ทีมของทั้งสองภาคติดธงทีมของตัวเอง" || fail "options mine: กรุงเทพ=$(MINE $S กรุงเทพ) กระบี่=$(MINE $S กระบี่)"

echo
echo "═══ บอร์ดแผนงาน"
WANT=$(TEAMS_OF "'ใต้','กลาง-ตะวันตก'")
[ "$(PLANNABLE $S)" = "$WANT" ] && echo "$WANT" | tr ',' '\n' | grep -qx กรุงเทพ \
  && pass "ทีมที่จัดแผนได้ = ทีมของทุกภาคที่ดูแล ($WANT)" || fail "plannableTeams '$(PLANNABLE $S)' ≠ '$WANT'"
[ "$(GET $S "plans/day?date=$VISIT" | J "String(d.lanes.some(l=>l.team==='กรุงเทพ'&&l.stops.some(s=>s.id===$W1)))")" = "true" ] \
  && pass "เลนทีมกรุงเทพมีใบของภาคที่เพิ่ม" || fail "เลน: $(GET $S "plans/day?date=$VISIT" | J 'JSON.stringify(d.lanes.map(l=>l.team))')"
[ "$(CODE PUT $S plans "{\"date\":\"$VISIT\",\"team\":\"กรุงเทพ\",\"note\":\"$SYMPTOM\"}")|$(DB "select count(*) from \"TeamDayPlan\" where date='$VISIT' and team='กรุงเทพ' and \"plannedById\"=$SID")" = "200|1" ] \
  && pass "จัดแผนทีมกรุงเทพได้ บันทึกว่า S001 จัด (ฐานข้อมูล)" || fail "จัดแผน: $(SEND PUT $S plans "{\"date\":\"$VISIT\",\"team\":\"กรุงเทพ\",\"note\":\"$SYMPTOM\"}")"
SEND PUT $S plans "{\"date\":\"$VISIT\",\"team\":\"กรุงเทพ\",\"memberIds\":[]}" >/dev/null

echo
echo "═══ สองคนถือภาคเดียวกัน"
R=$(SEND POST $A auth/users "{\"employeeCode\":\"ZMRZ$SUF\",\"name\":\"หัวหน้าภาคกลางร่วม$SUF\",\"role\":\"SUPERVISOR\",\"regions\":[\"กลาง-ตะวันตก\"],\"password\":\"temp12345\"}")
ZID=$(DB "select id from \"User\" where \"employeeCode\"='ZMRZ$SUF'")
[ "$(echo "$R" | J 'JSON.stringify(d.regions)')|$(REG ZMRZ$SUF)" = '["กลาง-ตะวันตก"]|กลาง-ตะวันตก|' ] && pass "สร้างหัวหน้าภาคด้วย regions (ฐานข้อมูล)" || fail "สร้าง: $(echo "$R" | head -c 200)"
Z=$(activate ZMRZ$SUF)
W2=$(SEND POST $A work-orders "{\"branchCode\":\"C0001\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W2\",\"symptom\":\"$SYMPTOM ใบที่สอง\"}]}" | J 'd.orders?d.orders[0].id:d.id')
[ "$(has $S INBOX $W2)|$(has $Z INBOX $W2)" = "true|true" ] && pass "ใบเข้ากล่องงานทั้งสองคน" || fail "กล่องงาน S=$(has $S INBOX $W2) Z=$(has $Z INBOX $W2)"
[ "$(waiting $W2)" = "$(echo -e "$SID\n$ZID" | sort -n | paste -sd,)|false" ] && pass "แอดมิน: รอทั้งสองคน · ไม่ขึ้นไม่มีคนรับ" || fail "รอใคร: $(waiting $W2)"
[ "$(GET $S work-orders/$W2 | J 'd.supervisors.map(s=>s.name).sort().join()')" = "$(echo -e "$SNAME\nหัวหน้าภาคกลางร่วม$SUF" | sort | paste -sd,)" ] \
  && pass "หน้าใบงานบอกหัวหน้าภาคที่รับผิดชอบครบสองคน" || fail "detail.supervisors: $(GET $S work-orders/$W2 | J 'JSON.stringify(d.supervisors)')"
[ "$(CODE POST $Z work-orders/$W2/parts '{"needsParts":false}')|$(ST $W2)" = "200|PARTS_CHECKED|-" ] && pass "คนแรกระบุอะไหล่ได้ (ฐานข้อมูล)" || fail "Z ระบุอะไหล่: $(ST $W2)"
R=$(SEND POST $S work-orders/$W2/parts '{"needsParts":false}')
[ "$(CODE POST $S work-orders/$W2/parts '{"needsParts":false}')" = "409" ] && echo "$R" | grep -q "ยังไม่ถึงขั้นนี้" \
  && [ "$(DB "select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$W2 and action='NO_PARTS'")" = "1" ] \
  && pass "คนกดช้าได้ 409 บอกขั้นปัจจุบัน · ไม่บันทึกซ้ำ" || fail "กดซ้ำ: $R"
[ "$(GET $S "work-orders?status=ALL&search=$(WCODE $W2)" | J "d.rows.find(x=>x.id===$W2).status")" = "PARTS_CHECKED" ] \
  && pass "คนกดช้าเห็นขั้นใหม่ในรายการ" || fail "S001 เห็นขั้น: $(GET $S "work-orders?status=ALL&search=$(WCODE $W2)" | J "d.rows.find(x=>x.id===$W2).status")"
[ "$(CODE POST $S work-orders/$W2/assign "{\"team\":\"กรุงเทพ\",\"scheduledAt\":\"$VISIT\"}")|$(ST $W2)|$(DB "select \"userId\" from \"WorkOrderLog\" where \"workOrderId\"=$W2 and action='ASSIGNED'")" = "200|AWAITING_CONFIRM|PENDING|$SID" ] \
  && pass "อีกคนทำขั้นต่อได้ (S001 นัดวัน · ประวัติลงชื่อ S001)" || fail "S001 นัดต่อ: $(ST $W2)"

echo
echo "═══ ทีมมาก่อนภาค (ภาคที่เพิ่มก็เหมือนภาคแรก)"
W3=$(SEND POST $A work-orders "{\"branchCode\":\"C0001\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"$SYMPTOM ใบที่สาม\"}]}" | J 'd.orders?d.orders[0].id:d.id')
SEND POST $A auth/users "{\"employeeCode\":\"ZMRP$SUF\",\"name\":\"หัวหน้าทีมกรุงเทพ$SUF\",\"role\":\"SUPERVISOR\",\"regions\":[\"กลาง-ตะวันตก\"],\"password\":\"temp12345\"}" >/dev/null
PID=$(DB "select id from \"User\" where \"employeeCode\"='ZMRP$SUF'")
SEND PATCH $A auth/users/$PID '{"supervisedTeams":["กรุงเทพ"]}' >/dev/null
[ "$(waiting $W3)" = "$PID|false" ] && pass "ใบสาขาทีมกรุงเทพรอเฉพาะคนดูแลทีม ไม่ใช่คนที่ถือภาค" || fail "รอใคร: $(waiting $W3)"
[ "$(has $S ALL $W3)|$(CODE GET $S work-orders/$W3)|$(has $Z ALL $W3)" = "false|403|false" ] \
  && pass "S001 (ภาคที่เพิ่ม) และ Z (ภาคแรก) ไม่เห็นใบ · เปิดตรง ๆ 403" || fail "ทีมมาก่อนภาค: S=$(has $S ALL $W3) $(CODE GET $S work-orders/$W3) Z=$(has $Z ALL $W3)"
[ "$(MINE $S กรุงเทพ)|$(MINE $S กระบี่)" = "false|true" ] && ! PLANNABLE $S | tr ',' '\n' | grep -qx กรุงเทพ \
  && pass "ทีมกรุงเทพไม่ใช่ทีมของ S001 แล้ว (ช่องทีม + บอร์ดแผนงาน) · กระบี่ยังเป็น" || fail "options/plan: กรุงเทพ=$(MINE $S กรุงเทพ) plannable=$(PLANNABLE $S)"
[ "$(GET $A "teams/members?name=$(node -p 'encodeURIComponent("กรุงเทพ")')" | J "const s=d.supervisors.find(x=>x.id===$PID); const t=d.technicians.find(x=>x.employeeCode==='T001'); JSON.stringify(s.regions)+'|'+JSON.stringify(t.regions)")" = '["กลาง-ตะวันตก"]|[]' ] \
  && pass "หน้าสมาชิกทีม: หัวหน้าภาคมี regions · ช่าง regions ว่าง" || fail "members: $(GET $A "teams/members?name=$(node -p 'encodeURIComponent("กรุงเทพ")')" | head -c 200)"
SEND PATCH $A auth/users/$PID '{"role":"EMPLOYEE"}' >/dev/null
[ "$(REG ZMRP$SUF)|$(has $S ALL $W3)|$(has $Z INBOX $W3)|$(waiting $W3)" = "-||true|true|$(echo -e "$SID\n$ZID" | sort -n | paste -sd,)|false" ] \
  && pass "คนดูแลทีมเปลี่ยนเป็นช่าง (ล้างภาคในฐานข้อมูล) → ใบกลับมาที่ทั้งสองคนที่ถือภาค" || fail "หลังเอาคนดูแลทีมออก: $(REG ZMRP$SUF) S=$(has $S ALL $W3) Z=$(has $Z INBOX $W3) $(waiting $W3)"

echo
echo "═══ ดูในฐานะหัวหน้าภาคหลายภาค"
R=$(SEND POST $A auth/view-as "{\"userId\":$SID}")
V=$(echo "$R" | J 'd.token')
[ "$(echo "$R" | J 'JSON.stringify(d.user.regions)')|$(GET $V auth/me | J 'JSON.stringify(d.regions)')" = '["ใต้","กลาง-ตะวันตก"]|["ใต้","กลาง-ตะวันตก"]' ] \
  && pass "ดูในฐานะ: ข้อมูลผู้ใช้มี regions ครบ" || fail "view-as user: $(echo "$R" | head -c 200)"
R=$(SEND POST $V work-orders/$W3/parts '{"needsParts":false}')
[ "$(has $V ALL $W3)|$(ST $W3)" = "true|NEW|-" ] && echo "$R" | grep -q "ดูได้อย่างเดียว" \
  && pass "เห็นใบของภาคที่เพิ่ม แต่กดทำขั้นไม่ได้ (ดูได้อย่างเดียว · ฐานข้อมูลไม่เปลี่ยน)" || fail "view-as act: $(has $V ALL $W3) $(ST $W3) $R"
SEND POST $V auth/view-as/stop '{}' >/dev/null

echo
echo "═══ ผังผู้รับผิดชอบ · รายงานคนไม่มีพื้นที่"
[ "$(GET $A teams/coverage-map | J "const s=d.supervisors.find(x=>x.id===$SID); JSON.stringify(s.regions)+'|'+s.region")" = '["ใต้","กลาง-ตะวันตก"]|ใต้' ] \
  && pass "ผัง: S001 มี regions ครบ (วางชื่อได้ทุกภาค) · region = ภาคแรกสำหรับแอปรุ่นเก่า" || fail "coverage-map: $(GET $A teams/coverage-map | J "JSON.stringify(d.supervisors.find(x=>x.id===$SID))")"
# คอลัมน์ "ไม่ระบุภาค" ในผัง (ทีมที่สาขาไม่ได้ตั้งภาค) ไม่ใช่ภาคจริง — ผังต้องรู้จากธง noRegion ว่าห้ามวางหัวหน้าภาคที่หัวคอลัมน์
# เพราะเซิร์ฟเวอร์ปฏิเสธชื่อนี้ตอนบันทึก (ไม่มีในทะเบียนสาขา) · สาขาชั่วคราวลบทันทีหลังเช็ค ทีมนี้จะได้ไม่โผล่ในหน้าจอของใคร
DB "insert into \"Branch\"(code,name,zone,region) values ('ZMRN$SUF','สาขาทดสอบไม่มีภาค','ทีมไม่มีภาค$SUF',null)" >/dev/null
NOREG=$(GET $A teams/coverage-map | J "d.regions.filter(r=>r.noRegion).map(r=>r.name+':'+r.teams.some(t=>t.name==='ทีมไม่มีภาค$SUF')).join(',')+'|'+d.regions.filter(r=>r.name!=='ไม่ระบุภาค').every(r=>!r.noRegion)")
R=$(SEND PATCH $A auth/users/$SID '{"regions":["ใต้","กลาง-ตะวันตก","ไม่ระบุภาค"]}')
DB "delete from \"Branch\" where code='ZMRN$SUF'" >/dev/null
[ "$NOREG" = "ไม่ระบุภาค:true|true" ] && [ "$(echo "$R" | J 'd.error')|$(REG S001)" = "ไม่มีภาค “ไม่ระบุภาค” ในทะเบียนสาขา|ใต้|กลาง-ตะวันตก" ] \
  && pass "ผัง: คอลัมน์ไม่ระบุภาคมีธง noRegion (ภาคจริงไม่มี) · ตั้งภาคชื่อนี้ 400 ภาษาไทย ฐานข้อมูลไม่เปลี่ยน" || fail "ไม่ระบุภาค: $NOREG / $R / $(REG S001)"
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,region,\"extraRegions\",\"supervisedTeams\",\"passwordHash\",\"mustChangePassword\") values
  ('ZMRG1$SUF','ภาคเพิ่มมีจริงอย่างเดียว','SUPERVISOR',null,'{กลาง-ตะวันตก}','{}','$HASH',false),
  ('ZMRG2$SUF','ทุกภาคไม่มีจริง','SUPERVISOR','ภาคเก่าก$SUF','{ภาคเก่าข$SUF}','{}','$HASH',false),
  ('ZMRG3$SUF','ภาคแรกไม่มีจริงภาคเพิ่มมี','SUPERVISOR','ภาคเก่าก$SUF','{ใต้}','{}','$HASH',false)" >/dev/null
P=$(GET $A auth/users/unassigned-report | J 'd.path')
X=$(mktemp --suffix=.xlsx)
curl -s "localhost:4000$P" -H "$(H $A)" -o "$X"
GAPS=$(NODE_PATH="backend/node_modules" node -e '
  const E=require("exceljs"); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[1]).then(()=>{ const m={};
    wb.worksheets[0].eachRow((r,i)=>{ if(i>1&&r.getCell(2).value) m[String(r.getCell(2).value)]=String(r.getCell(5).value); });
    console.log(JSON.stringify(m)); });' "$X")
rm -f "$X"
gap() { echo "$GAPS" | J "d['$1']||'-'"; }
[ "$(gap ZMRG1$SUF)|$(gap ZMRG3$SUF)" = "-|-" ] && pass "ไม่อยู่ในรายงาน: มีภาคเพิ่มที่มีจริง (แม้ไม่มีภาคแรก หรือภาคแรกไม่มีจริง)" || fail "ไม่ควรอยู่: G1=$(gap ZMRG1$SUF) G3=$(gap ZMRG3$SUF)"
[ "$(gap ZMRG2$SUF)" = "ภาค/ทีมที่ตั้งไว้ไม่มีในทะเบียนสาขา (ภาคเก่าก$SUF, ภาคเก่าข$SUF)" ] \
  && pass "ทุกภาคไม่มีในทะเบียน → อยู่ในรายงาน บอกชื่อครบทุกภาค" || fail "G2: $(gap ZMRG2$SUF)"
[ "$(gap S001)" = "-" ] && pass "S001 (สองภาคที่มีจริง) ไม่อยู่ในรายงาน" || fail "S001 ในรายงาน: $(gap S001)"
DB "delete from \"User\" where \"employeeCode\" like 'ZMRG%$SUF'" >/dev/null

echo
echo "═══ รายงาน"
# ใบภาคใต้ที่ S001 เปิดเอง — รายงานคอนเฟิร์มต้องมีทั้งสองภาค และ S001 ต้องมีแถวในรายงานผู้เปิด
W4=$(SEND POST $S work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"$SYMPTOM ใบที่สี่\"}]}" | J 'd.orders?d.orders[0].id:d.id')
[ "$(DB "select \"createdById\" from \"WorkOrder\" where id=$W4")" = "$SID" ] || fail "S001 เปิดใบภาคใต้ไม่ได้"
SEND POST $S work-orders/$W4/parts '{"needsParts":false}' >/dev/null
SEND POST $S work-orders/$W4/assign "{\"team\":\"กระบี่\",\"scheduledAt\":\"$VISIT\",\"scheduledTime\":\"09:00\"}" >/dev/null
SEND POST $A work-orders/$W4/confirm-appointment '{}' >/dev/null
CONF() { GET $1 "work-orders/reports/confirmed?date=$TODAY" | J "[$W1,$W4].map(i=>{const r=d.rows.find(x=>x.id===i); return r?r.region+'/'+r.team:'none'}).join('|')"; }
[ "$(ST $W4)|$(CONF $S)" = "ASSIGNED|CONFIRMED|กลาง-ตะวันตก/กรุงเทพ|ใต้/กระบี่" ] \
  && pass "สรุปคอนเฟิร์มลูกค้า (ส่งไลน์) ของ S001 มีใบทั้งสองภาค · แต่ละแถวบอกภาคของสาขา" || fail "confirmed: $(ST $W4) $(CONF $S)"
R=$(curl -s -G localhost:4000/api/work-orders/reports/by-opener --data-urlencode "from=$TODAY" --data-urlencode "to=$TODAY" --data-urlencode "opener=$SID" -H "$(H $A)")
[ "$(echo "$R" | J 'd.summary[0].region')" = "ใต้ · กลาง-ตะวันตก" ] && pass "รายงานผู้เปิดใบงาน: ภาคของ S001 = \"ใต้ · กลาง-ตะวันตก\"" || fail "by-opener: $(echo "$R" | J 'JSON.stringify(d.summary)' | head -c 200)"
[ "$(GET $A "usage?range=today&q=S001" | J "d.people.find(p=>p.code==='S001').team")|$(GET $A "usage/user/$SID?days=7" | J 'JSON.stringify(d.user.regions)')" = 'ใต้ · กลาง-ตะวันตก|["ใต้","กลาง-ตะวันตก"]' ] \
  && pass "การใช้งานแอป: ช่องทีม/ภาคโชว์ทุกภาค · รายคนมี regions" || fail "usage: $(GET $A "usage?range=today&q=S001" | J "JSON.stringify(d.people.find(p=>p.code==='S001'))" | head -c 200)"
[ "$(GET $A "usage?range=today&q=$(node -p 'encodeURIComponent("กลาง-ตะวันตก S001")')" | J "String(d.people.some(p=>p.code==='S001'))")" = "true" ] \
  && pass "ค้นหาการใช้งานด้วยภาคที่เพิ่มเจอ S001" || fail "ค้นด้วยภาคที่เพิ่มไม่เจอ"
XL=$(mktemp --suffix=.xlsx)
curl -s -o "$XL" "localhost:4000$(GET $A reports/system | J 'd.path')" -H "$(H $A)"
SCOPE=$(python3 - "$XL" <<'PY'
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
print(next((r[4] for r in wb["พนักงาน"].iter_rows(min_row=5, values_only=True) if r and r[0] == "S001"), "-"))
PY
)
rm -f "$XL"
[ "$SCOPE" = "ใต้ (ทั้งภาค), กลาง-ตะวันตก (ทั้งภาค)" ] && pass "รายงานทั้งระบบ ชีตพนักงาน: พื้นที่ที่ดูแลครบทุกภาค" || fail "system report: $SCOPE"

echo
echo "═══ เอาภาคออก → หมดสิทธิ์ทันที (โทเคนเดิม)"
SEND PATCH $A auth/users/$SID '{"regions":["ใต้"]}' >/dev/null
[ "$(REG S001)" = "ใต้|" ] && pass "ฐานข้อมูลเหลือภาคใต้ภาคเดียว" || fail "DB: $(REG S001)"
[ "$(has $S ALL $W3)|$(has $S INBOX $W3)|$(CODE GET $S work-orders/$W3)|$(CODE POST $S work-orders/$W3/parts '{"needsParts":false}')|$(ST $W3)" = "false|false|403|403|NEW|-" ] \
  && pass "ใบ C0001: หายจากรายการ/กล่องงาน · เปิด 403 · กดขั้น 403 ฐานข้อมูลไม่เปลี่ยน" || fail "หลังเอาภาคออก: $(has $S ALL $W3) $(has $S INBOX $W3) $(CODE GET $S work-orders/$W3) $(ST $W3)"
R=$(SEND PUT $S plans "{\"date\":\"$VISIT\",\"team\":\"กรุงเทพ\",\"note\":\"$SYMPTOM\"}")
[ "$(MINE $S กรุงเทพ)|$(PLANNABLE $S)|$(DB "select count(*) from \"TeamDayPlan\" where date='$VISIT' and team='กรุงเทพ' and \"plannedById\"=$SID")" = "false|$(TEAMS_OF "'ใต้'")|0" ] \
  && echo "$R" | grep -q "ไม่ได้ดูแลสาขาในภาคของคุณ" \
  && pass "ทีมกรุงเทพหลุดจากช่องทีม/บอร์ดแผนงาน · จัดแผนทีมนั้น 403 ภาษาไทย" || fail "แผนงานหลังเอาภาคออก: $(MINE $S กรุงเทพ) $(PLANNABLE $S) $R"
[ "$(CONF $S)" = "none|ใต้/กระบี่" ] && pass "สรุปคอนเฟิร์มลูกค้าเหลือเฉพาะภาคใต้" || fail "confirmed หลังเอาออก: $(CONF $S)"
[ "$(has $Z INBOX $W3)" = "true" ] && pass "คนที่ถือภาคร่วมยังมีใบอยู่ในกล่อง" || fail "Z หลุด"

echo
echo "═══ เปลี่ยนเป็นช่าง / ลบบัญชี ล้างทุกภาค"
SEND PATCH $A auth/users/$ZID '{"regions":["กลาง-ตะวันตก","ใต้"]}' >/dev/null
[ "$(REG ZMRZ$SUF)" = "กลาง-ตะวันตก|ใต้" ] || fail "ตั้งสองภาคให้ Z: $(REG ZMRZ$SUF)"
SEND PATCH $A auth/users/$ZID '{"role":"EMPLOYEE"}' >/dev/null
[ "$(REG ZMRZ$SUF)|$(has $Z ALL $W3)|$(GET $Z auth/me | J 'JSON.stringify(d.regions)')" = "-||false|[]" ] \
  && pass "เปลี่ยนเป็นช่าง: region + extraRegions ว่าง (ฐานข้อมูล) · โทเคนเดิมหมดสิทธิ์ใบของภาคนั้นทันที" || fail "เปลี่ยนบทบาท: $(REG ZMRZ$SUF) $(has $Z ALL $W3)"
# ลบบัญชีที่มีประวัติ = ลบแบบเก็บประวัติ (deletedAt) — ภาคต้องถูกล้าง ไม่งั้นรายงานยังนับว่าคนนี้ดูแลภาคนั้น
SEND POST $A auth/users "{\"employeeCode\":\"ZMRA$SUF\",\"name\":\"ซุปเปอร์ทดสอบหลายภาค\",\"role\":\"SUPER_ADMIN\",\"password\":\"temp12345\"}" >/dev/null
SA=$(activate ZMRA$SUF)
SEND PATCH $A auth/users/$ZID '{"role":"SUPERVISOR","regions":["กลาง-ตะวันตก","ใต้"]}' >/dev/null
[ "$(REG ZMRZ$SUF)" = "กลาง-ตะวันตก|ใต้" ] || fail "ตั้งกลับเป็นหัวหน้าภาคสองภาค: $(REG ZMRZ$SUF)"
R=$(curl -s -X DELETE localhost:4000/api/auth/users/$ZID -H "$(H $SA)")
[ "$(DB "select (\"deletedAt\" is not null)::text||'|'||coalesce(region,'-')||'|'||array_to_string(\"extraRegions\",',') from \"User\" where id=$ZID")" = "true|-|" ] \
  && pass "ลบบัญชี (มีประวัติ เก็บไว้แบบลบแล้ว) ล้างทุกภาค (ฐานข้อมูล)" || fail "ลบบัญชี: $R $(DB "select \"deletedAt\", region, \"extraRegions\" from \"User\" where id=$ZID")"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
