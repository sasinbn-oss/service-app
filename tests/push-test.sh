#!/bin/bash
# ทดสอบ: แจ้งเตือนเข้ามือถือ (Web Push · เจ้าของงานเลือก พ.ย. 69 — แชทใหม่ + งานเข้ากล่องงาน)
#   · กุญแจ VAPID: เซิร์ฟเวอร์สร้างเองครั้งแรก เก็บแถวเดียวใน AppSetting · ถามซ้ำได้กุญแจเดิม
#   · สมัคร: ข้อมูลผิด 400 ข้อความไทย · ดูในฐานะคนอื่นสมัครไม่ได้ · Admin Spare Part สมัครได้ · เครื่องเดิมเปลี่ยนคน = แถวย้ายเจ้าของ
#     เลิกสมัครได้เฉพาะของตัวเอง · สมัครครั้งแรกตั้ง pushSince (ไม่ส่งงานที่ค้างอยู่ก่อนหน้า)
#   · รอบงานเข้ากล่อง (inboxPushRound): ใบที่เข้ากล่องหลังสมัครส่งถึงเครื่องจริง (ผู้ให้บริการจำลองถอดรหัสได้ · ชื่อ/ลิงก์ /wo/<รหัส>/แท็ก inbox)
#     รอบถัดไปไม่ส่งซ้ำ · เครื่องที่ผู้ให้บริการตอบ 410 ถูกลบ
#   · ใครได้แจ้งเตือนแชท (chatRecipients): ช่างถามก่อน → แอดมินทุกคน · แอดมินตอบ → ช่างทีมที่รับ + หัวหน้าภาคเจ้าของใบ
#     มีแอดมินในห้องแล้ว → ไม่ส่งหาแอดมินทุกคนอีก · คนส่งไม่ได้แจ้งเตือนของตัวเอง
# ยืนยันผลที่ฐานข้อมูลและที่ "เครื่อง" (ผู้ให้บริการจำลอง tests/lib/push-mock.js) · ล้างทุกอย่างที่สร้าง
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/purge-orders.sh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
PC() { curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
uid() { DB "select id from \"User\" where \"employeeCode\"='$1'"; }

TMP=$(mktemp -d); PORT=$((9600 + RANDOM % 300)); LOG=$TMP/push.log; touch $LOG
openssl req -x509 -newkey rsa:2048 -nodes -keyout $TMP/key.pem -out $TMP/cert.pem -days 1 -subj "/CN=localhost" >/dev/null 2>&1
node "$ROOT/tests/lib/push-mock.js" serve $PORT $TMP $LOG $TMP/cert.pem $TMP/key.pem > $TMP/mock.out 2>&1 &
MOCK=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q ready $TMP/mock.out && break; sleep 0.3; done
KEYS() { node "$ROOT/tests/lib/push-mock.js" keys $TMP/$1.json; }
SUB() { # $1 token · $2 kind (sub/gone) · $3 ชื่อเครื่อง
  local k; k=$(KEYS $3)
  POST $1 push/subscribe "{\"endpoint\":\"https://localhost:$PORT/$2/$3\",\"keys\":$k}"
}
ROUND() { (cd "$ROOT/backend" && set -a && . ./.env && set +a && NODE_TLS_REJECT_UNAUTHORIZED=0 node_modules/.bin/ts-node --transpile-only -e \
  'require("./src/push/inboxPush").inboxPushRound().then((r) => { console.log(JSON.stringify(r)); process.exit(0); }, (e) => { console.error(e); process.exit(1); })' 2>/dev/null | tail -1); }
RECIP() { (cd "$ROOT/backend" && set -a && . ./.env && set +a && node_modules/.bin/ts-node --transpile-only -e \
  "require('./src/routes/workOrders').chatRecipients($1, $2, '$3', { assignedTeam: '$TEAM', assignedToId: null }).then((r) => { console.log(r.sort((a,b)=>a-b).join(',')); process.exit(0); })" 2>/dev/null | tail -1); }
GOT() { grep -c "\"name\":\"$1\"" $LOG; }

A=$(login A001); T=$(login T001)
AID=$(uid A001); TID=$(uid T001); SID=$(uid S001)
TEAM=$(DB "select zone from \"Branch\" where code='C0006'")
REGION=$(DB "select region from \"Branch\" where code='C0006'")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where id=$TID")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
OLD_PS=$(DB "select string_agg(id||'='||coalesce(\"pushSince\"::text,''), ' ') from \"User\" where id in ($AID,$TID,$SID)")
SUF=$RANDOM
IDS=""
# ข้อดูในฐานะช่างเขียนบันทึกดูในฐานะ — ลบตอนจบ ไม่ให้ค้างทุกรอบ
VSTART=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
cleanup() {
  kill $MOCK 2>/dev/null
  purge_orders "$A" $IDS
  DB "delete from \"ViewAsLog\" where id > $VSTART;
      delete from \"PushSubscription\" where endpoint like 'https://localhost:$PORT/%';
      delete from \"User\" where \"employeeCode\"='ZPSP$SUF';
      update \"User\" set team=nullif('$OLD_TEAM','') where id=$TID;
      update \"User\" set region=nullif('$OLD_REGION','') where id=$SID" >/dev/null
  for kv in $OLD_PS; do DB "update \"User\" set \"pushSince\"=nullif('${kv#*=}','')::timestamp where id=${kv%%=*}" >/dev/null; done
  rm -rf $TMP
}
trap cleanup EXIT
DB "update \"User\" set team='$TEAM' where id=$TID; update \"User\" set region='$REGION' where id=$SID" >/dev/null
T=$(login T001); S=$(login S001)

echo "═══ กุญแจ"
K1=$(GET $A push/key | J 'd.publicKey'); K2=$(GET $T push/key | J 'd.publicKey')
LEN=$(node -e "const b=Buffer.from('$K1','base64url'); console.log(b.length+'|'+b[0])")
[ "$LEN" = "65|4" ] && [ "$K1" = "$K2" ] && [ "$(DB "select count(*) from \"AppSetting\" where key='webPushVapid'")" -le 1 ] \
  && pass "กุญแจสาธารณะ P-256 (65 ไบต์) · ทุกคนได้กุญแจเดียวกัน · เก็บแถวเดียว" || fail "กุญแจ: $LEN · $K1 vs $K2"

echo "═══ สมัคร / เลิกสมัคร"
R=$(POST $A push/subscribe '{"endpoint":"ไม่ใช่ลิงก์","keys":{}}')
echo "$R" | J 'd.error' | grep -q "ข้อมูลการสมัครแจ้งเตือนไม่ถูกต้อง" && pass "ข้อมูลผิด: 400 ข้อความไทย" || fail "ข้อมูลผิด: $R"
AV=$(POST $A auth/view-as "{\"userId\":$TID}" | J 'd.token||""')
[ "$(PC $AV push/subscribe "{\"endpoint\":\"https://localhost:$PORT/sub/viewas\",\"keys\":$(KEYS viewas)}")" = "403" ] \
  && [ "$(DB "select count(*) from \"PushSubscription\" where endpoint like '%/viewas'")" = "0" ] && pass "ดูในฐานะคนอื่นสมัครแจ้งเตือนแทนเขาไม่ได้ (403)" || fail "ดูในฐานะสมัครได้"
POST $AV auth/view-as/stop '{}' >/dev/null
SUB $S sub shared >/dev/null
[ "$(DB "select \"userId\" from \"PushSubscription\" where endpoint like '%/sub/shared'")" = "$SID" ] && pass "หัวหน้าภาคสมัครเครื่อง shared" || fail "S สมัคร"
SUB $A sub shared >/dev/null
[ "$(DB "select \"userId\"||'|'||count(*) over () from \"PushSubscription\" where endpoint like '%/sub/shared'")" = "$AID|1" ] \
  && pass "เครื่องเดิมเปลี่ยนคนล็อกอิน — แถวเดิมย้ายเป็นของแอดมิน (ไม่ซ้ำสองแถว)" || fail "ย้ายเจ้าของ"
POST $S push/unsubscribe "{\"endpoint\":\"https://localhost:$PORT/sub/shared\"}" >/dev/null
[ "$(DB "select count(*) from \"PushSubscription\" where endpoint like '%/sub/shared'")" = "1" ] && pass "เลิกสมัครเครื่องที่ไม่ใช่ของตัวเองไม่มีผล" || fail "ลบของคนอื่นได้"
POST $A push/unsubscribe "{\"endpoint\":\"https://localhost:$PORT/sub/shared\"}" >/dev/null
[ "$(DB "select count(*) from \"PushSubscription\" where endpoint like '%/sub/shared'")" = "0" ] && pass "เจ้าของเลิกสมัครได้ (ฐานข้อมูลลบแถว)" || fail "เลิกสมัคร"
HASH=$(DB "select \"passwordHash\" from \"User\" where id=$TID")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZPSP$SUF','อะไหล่ทดสอบแจ้งเตือน','PARTS_ADMIN','$HASH',false)" >/dev/null
P=$(login ZPSP$SUF)
[ "$(SUB $P sub parts | J 'd.ok')" = "true" ] && pass "Admin Spare Part สมัครแจ้งเตือนได้ (ไม่ติดดูได้อย่างเดียว)" || fail "Admin Spare Part สมัครไม่ได้"

echo "═══ รอบงานเข้ากล่อง"
SUB $A sub admin >/dev/null
[ "$(DB "select \"pushSince\" > now() - interval '1 minute' from \"User\" where id=$AID")" = "t" ] && pass "สมัครครั้งแรกตั้งจุดเริ่มนับ (pushSince = ตอนนี้)" || fail "pushSince ไม่ถูกตั้ง"
sleep 1
W1=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"URGENT","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบแจ้งเตือนเข้ามือถือ"}]}' | J 'd.orders?d.orders[0].id:d.id')
IDS="$IDS $W1"; DB "update \"WorkOrder\" set status='PARTS_SOURCING' where id=$W1" >/dev/null
C1=$(DB "select code from \"WorkOrder\" where id=$W1")
R=$(ROUND)
E=$(grep '"name":"admin"' $LOG | tail -1)
[ "$(GOT admin)" = "1" ] && echo "$E" | J "d.payload.title.includes('$C1') && d.payload.url==='/#/wo/$C1' && d.payload.tag==='inbox' && d.payload.title.includes('ด่วน') && d.ttl==='43200'" | grep -q true \
  && pass "งานเข้ากล่องแอดมินส่งถึงเครื่อง (ถอดรหัสได้: \"$(echo "$E" | J 'd.payload.title')\" · ลิงก์ /#/wo/$C1 · TTL 12 ชม.)" || fail "รอบแรก: $R · $(cat $LOG)"
ROUND >/dev/null
[ "$(GOT admin)" = "1" ] && pass "รอบถัดไปไม่ส่งซ้ำ (ยังได้ 1 ครั้ง)" || fail "ส่งซ้ำ: $(GOT admin)"
GET $A work-orders/$W1 >/dev/null
DB "insert into \"WorkOrderLog\" (\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($W1,null,'DISPATCHED','PARTS_SOURCING','ทดสอบเดินขั้น',now()+interval '1 second')" >/dev/null
sleep 1.5; ROUND >/dev/null
[ "$(GOT admin)" = "2" ] && pass "ใบเดินขั้นกลับมาคิวเราอีกรอบ — ส่งอีกครั้ง" || fail "เดินขั้นแล้วไม่ส่ง: $(GOT admin)"

echo "═══ เครื่องที่เลิกสมัครแล้ว (410)"
SUB $T gone tech >/dev/null
sleep 1
W2=$(POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactPhone":"089-111-2222","machines":[{"code":"W81","symptom":"ทดสอบแจ้งเตือนช่าง"}]}' | J 'd.orders?d.orders[0].id:d.id')
IDS="$IDS $W2"
DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='$TEAM', \"scheduledAt\"=date_trunc('day', now()) where id=$W2;
    insert into \"WorkOrderLog\" (\"workOrderId\",\"userId\",action,status,note,\"createdAt\") values ($W2,null,'DISPATCHED','IN_PROGRESS','ทดสอบ',now())" >/dev/null
sleep 1; ROUND >/dev/null
[ "$(grep -c '"kind":"gone","name":"tech"' $LOG)" -ge 1 ] && [ "$(DB "select count(*) from \"PushSubscription\" where endpoint like '%/gone/tech'")" = "0" ] \
  && pass "ผู้ให้บริการตอบ 410 — ลบเครื่องนั้นออกจากฐานข้อมูล" || fail "410: $(DB "select count(*) from \"PushSubscription\" where endpoint like '%/gone/tech'")"

echo "═══ ใครได้แจ้งเตือนแชท"
POST $T work-orders/$W2/chat '{"body":"ถามเรื่องใบนี้ครับ"}' >/dev/null
ADMINS=$(DB "select string_agg(id::text, ',' order by id) from \"User\" where role in ('ADMIN','SUPER_ADMIN') and \"deletedAt\" is null")
[ "$(RECIP $W2 $TID EMPLOYEE)" = "$ADMINS" ] && pass "ช่างถามก่อน (ยังไม่มีแอดมินในห้อง) → แอดมินทุกคน" || fail "ช่างถาม: $(RECIP $W2 $TID EMPLOYEE) ≠ $ADMINS"
POST $A work-orders/$W2/chat '{"body":"รับทราบครับ"}' >/dev/null
R=$(RECIP $W2 $AID ADMIN)
echo ",$R," | grep -q ",$TID," && echo ",$R," | grep -q ",$SID," && ! echo ",$R," | grep -q ",$AID," \
  && pass "แอดมินตอบ → ช่างทีมที่รับ + หัวหน้าภาคเจ้าของใบ (ไม่รวมคนส่ง)" || fail "แอดมินตอบ: $R"
R=$(RECIP $W2 $TID EMPLOYEE)
[ "$R" = "$AID" ] && pass "มีแอดมินในห้องแล้ว — ช่างถามต่อแจ้งแค่แอดมินที่อยู่ในห้อง ($R)" || fail "ถามต่อ: $R"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
[ -z "$FAILED" ]
