#!/bin/bash
# ทดสอบ: สอนการใช้งานในแอป ฝั่งเซิร์ฟเวอร์ (เจ้าของงานเลือก ต.ค. 69) — User.howtoSeen · POST /auth/howto · POST /auth/users/:id/howto-reset
#   · ช่องใหม่ไม่มีค่าตั้งต้น (NULL = พนักงานเดิม ได้ข้อความสั้นครั้งเดียว) · login / me / usage ส่ง howto ให้แอป
#   · จดทีละอย่าง: ตอบกล่องต้อนรับ · ตอบข้อความสั้น · ดูหน้าไหนจบ (ดูจบแล้วข้อความสั้นไม่ต้องขึ้นอีก)
#   · ห้าหน้าพร้อมกันจากหลายเครื่องติดครบ (รวม JSON ในคำสั่งเดียว ไม่อ่านก่อนเขียน) · เพดาน 40 หน้า
#   · บัญชีที่แอดมินสร้าง = pending · ยังไม่เปลี่ยนรหัส 423 · ทีม Area / Admin Spare Part บันทึกได้ · ดูในฐานะบันทึกไม่ได้
#   · แอดมินกด "ให้ดูวิธีใช้ใหม่" ได้ (หัวหน้าภาค/ช่าง/Admin Spare Part/ทีม Area/ดูในฐานะ 403)
#   · migration: เฉพาะบัญชีที่ยังใช้รหัสตั้งต้น ไม่เคยถูกตั้งรหัสใหม่ และไม่มีบันทึกการใช้งาน เป็น pending (รันไฟล์จริงแล้ว ROLLBACK)
#   · ไม่มีคำว่า "ทัวร์" ในแอป (เจ้าของงานกำหนด — เรียก "สอนการใช้งาน" / "วิธีใช้")
# ผู้ใช้ทดสอบทั้งหมดขึ้นต้น zz.howto. สร้างด้วย SQL (รหัสผ่านเดียวกับ A001) แล้วลบตอนจบ — ยืนยันที่ฐานข้อมูลทุกข้อที่เขียน (CLAUDE.md)
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -At -v ON_ERROR_STOP=1 -c "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
LOGIN() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}"; }
tok() { LOGIN "$@" | J 'd.token'; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
# เนื้อหา|รหัส HTTP — ข้อที่ต้องดูทั้งรหัสและข้อความ
CALL() { curl -s -w '|%{http_code}' -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
code() { echo "${1##*|}"; }
body() { echo "${1%|*}"; }
# ค่าในฐานข้อมูลเป็นข้อความ (jsonb เรียงคีย์ให้เอง) — NULL แยกจาก {} ได้
SEEN() { DB "select coalesce(\"howtoSeen\"::text,'NULL') from \"User\" where \"employeeCode\"='$1'"; }
KEYS() { DB "select coalesce(string_agg(k, ',' order by k), '') from \"User\" u, jsonb_object_keys(coalesce(u.\"howtoSeen\"->'tours','{}'::jsonb)) k where u.\"employeeCode\"='$1'"; }
IDOF() { DB "select id from \"User\" where \"employeeCode\"='$1'"; }

cleanup() {
  DB "delete from \"ViewAsLog\" where \"targetUserId\" in (select id from \"User\" where \"employeeCode\" like 'zz.howto.%');
      delete from \"User\" where \"employeeCode\" like 'zz.howto.%'" >/dev/null
}
cleanup; trap cleanup EXIT
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\")
    select v.code, v.name, v.role, u.\"passwordHash\", v.lock from \"User\" u, (values
      ('zz.howto.t','ช่างทดสอบวิธีใช้','EMPLOYEE',false),
      ('zz.howto.s','หัวหน้าภาคทดสอบวิธีใช้','SUPERVISOR',false),
      ('zz.howto.a','Area ทดสอบวิธีใช้','AREA',false),
      ('zz.howto.c','Supervisor COCO ทดสอบวิธีใช้','COCO_SUPERVISOR',false),
      ('zz.howto.m','Maid COCO ทดสอบวิธีใช้','COCO_MAID',false),
      ('zz.howto.p','Admin Spare Part ทดสอบวิธีใช้','PARTS_ADMIN',false),
      ('zz.howto.lock','ช่างยังไม่เปลี่ยนรหัส ทดสอบวิธีใช้','EMPLOYEE',true)
    ) as v(code, name, role, lock) where u.\"employeeCode\"='A001'" >/dev/null
A=$(tok A001); S=$(tok S001); T=$(tok T001)
AID=$(IDOF A001); TID=$(IDOF zz.howto.t)
LEGACY='{"legacy":true,"pending":false,"welcomeAt":null,"noticeAt":null,"tours":{},"resetAt":null}'

echo "═══ ช่องในฐานข้อมูล + ค่าที่แอปได้"
[ "$(DB "select data_type||'|'||is_nullable||'|'||coalesce(column_default,'') from information_schema.columns where table_name='User' and column_name='howtoSeen'")" = "jsonb|YES|" ] \
  && pass "User.howtoSeen เป็น jsonb ว่างได้ ไม่มีค่าตั้งต้น (ไฟล์สำรองเก่ากู้กลับเป็นพนักงานเดิม)" || fail "คอลัมน์: $(DB "select data_type, is_nullable, column_default from information_schema.columns where table_name='User' and column_name='howtoSeen'")"
L=$(LOGIN zz.howto.t)
TT=$(echo "$L" | J 'd.token')
[ "$(echo "$L" | J 'JSON.stringify(d.user.howto)')" = "$LEGACY" ] && [ "$(SEEN zz.howto.t)" = "NULL" ] \
  && pass "ล็อกอินพนักงานเดิม (ช่อง NULL) ได้ howto legacy · ยังไม่ตอบอะไร" || fail "login howto: $(echo "$L" | J 'JSON.stringify(d.user.howto)')"
[ "$(GET $TT auth/me | J 'JSON.stringify(d.howto)')" = "$LEGACY" ] && pass "/auth/me ได้ค่าเดียวกับตอนล็อกอิน" || fail "me howto: $(GET $TT auth/me | J 'JSON.stringify(d.howto)')"

echo
echo "═══ จดว่าตอบ/ดูแล้ว (เจ้าของบัญชี)"
R=$(CALL $TT auth/howto '{"notice":true}')
[ "$(code "$R")" = "200" ] && [ "$(body "$R" | J 'd.howto.legacy+"|"+!!d.howto.noticeAt')" = "false|true" ] \
  && [ "$(DB "select (\"howtoSeen\"->>'notice') is not null from \"User\" where \"employeeCode\"='zz.howto.t'")" = "t" ] \
  && pass "ตอบข้อความสั้น → 200 · ฐานข้อมูลมีเวลา notice · ไม่ใช่ legacy แล้ว" || fail "notice: $R · DB $(SEEN zz.howto.t)"
CALL $TT auth/howto '{"tour":"tech.myday"}' >/dev/null
R=$(CALL $TT auth/howto '{"tour":"tech.close"}')
[ "$(code "$R")" = "200" ] && [ "$(KEYS zz.howto.t)" = "tech.close,tech.myday" ] && [ "$(body "$R" | J 'Object.keys(d.howto.tours).sort().join()')" = "tech.close,tech.myday" ] \
  && pass "ดูจบสองหน้า → ฐานข้อมูลมีทั้งสองหน้า (หน้าที่สองไม่ทับหน้าแรก)" || fail "สองหน้า: $R · DB $(SEEN zz.howto.t)"
ST=$(tok zz.howto.s)
R=$(CALL $ST auth/howto '{"tour":"sup.myday"}')
[ "$(code "$R")" = "200" ] && [ "$(DB "select (\"howtoSeen\"->>'notice' is not null)::text||'|'||(\"howtoSeen\" ? 'pending')::text||'|'||(\"howtoSeen\" ? 'welcome')::text from \"User\" where \"employeeCode\"='zz.howto.s'")" = "true|false|false" ] \
  && pass "พนักงานเดิมดูจบหน้าแรก (ยังไม่ได้ตอบข้อความสั้น) → ถือว่าตอบแล้ว: มี notice ไม่มี pending" || fail "ดูจบแล้วข้อความสั้นยังค้าง: $(SEEN zz.howto.s)"

# ห้าหน้าพร้อมกัน — แบบเดียวกับดูจบจากมือถือกับคอมพร้อมกัน · อ่านก่อนเขียนจะเหลือหน้าเดียวที่เขียนทีหลังสุด
OUT=$(mktemp -d)
i=0; for id in tech.orders tech.order sup.parts admin.myday admin.orders; do
  i=$((i + 1)); curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4000/api/auth/howto -H "$(H $TT)" -H 'Content-Type: application/json' -d "{\"tour\":\"$id\"}" >"$OUT/$i" &
done; wait
CODES=$(cat "$OUT"/* | tr -d '\n'); rm -rf "$OUT"
[ "$CODES" = "200200200200200" ] && [ "$(KEYS zz.howto.t)" = "admin.myday,admin.orders,sup.parts,tech.close,tech.myday,tech.order,tech.orders" ] \
  && pass "ห้าหน้าพร้อมกัน → ติดครบทั้งห้า + สองหน้าเดิม (ฐานข้อมูล)" || fail "พร้อมกัน: $CODES · $(KEYS zz.howto.t)"

BEFORE=$(SEEN zz.howto.t); BAD=""
for b in '{}' '{"welcome":true,"notice":true}' '{"tour":"a b"}' '{"tour":"ทัวร์"}' '{"welcome":false}' '{"tour":"tech.myday","notice":true}'; do
  R=$(CALL $TT auth/howto "$b")
  [ "$(code "$R")" = "400" ] && [ "$(body "$R" | J 'd.error')" = "ข้อมูลวิธีใช้ไม่ถูกต้อง" ] || BAD="$BAD $b→$R"
done
[ -z "$BAD" ] && [ "$(SEEN zz.howto.t)" = "$BEFORE" ] && pass "ข้อมูลผิดรูปแบบ (ว่าง · สองอย่างพร้อมกัน · ชื่อหน้าผิด/ภาษาไทย) → 400 ข้อความไทย · ฐานข้อมูลไม่เปลี่ยน" || fail "ข้อมูลผิด:$BAD"

# เพดาน 40 หน้า — ใส่ 40 หน้า (ta.kaa … ta.kbn) ด้วย SQL
DB "update \"User\" set \"howtoSeen\" = jsonb_build_object('notice', now()::text, 'tours',
      (select jsonb_object_agg('ta.k' || chr(97 + i / 26) || chr(97 + i % 26), now()::text) from generate_series(0, 39) i))
    where \"employeeCode\"='zz.howto.s'" >/dev/null
BEFORE=$(SEEN zz.howto.s)
R=$(CALL $ST auth/howto '{"tour":"ta.new"}')
R2=$(CALL $ST auth/howto '{"tour":"ta.kaa"}')
[ "$(code "$R")" = "400" ] && [ "$(body "$R" | J 'd.error')" = "บันทึกวิธีใช้ได้ไม่เกิน 40 หน้า" ] && [ "$(DB "select (\"howtoSeen\"->'tours'->>'ta.new') is null from \"User\" where \"employeeCode\"='zz.howto.s'")" = "t" ] \
  && [ "$(code "$R2")" = "200" ] && [ "$(DB "select count(*) from \"User\" u, jsonb_object_keys(u.\"howtoSeen\"->'tours') where u.\"employeeCode\"='zz.howto.s'")" = "40" ] \
  && [ "$(SEEN zz.howto.s)" != "$BEFORE" ] \
  && pass "ครบ 40 หน้าแล้ว: หน้าใหม่ 400 ไม่ถูกเพิ่ม · หน้าเดิมจดเวลาใหม่ได้ (ยังคง 40)" || fail "เพดาน: $R · $R2"

echo
echo "═══ บัญชีใหม่ = กล่องต้อนรับ"
R=$(CALL $A auth/users '{"employeeCode":"zz.howto.new","name":"ช่างใหม่ทดสอบวิธีใช้","role":"EMPLOYEE","password":"howto1234"}')
[ "$(code "$R")" = "201" ] && [ "$(SEEN zz.howto.new)" = '{"pending": true}' ] \
  && pass "แอดมินสร้างบัญชี → ฐานข้อมูล {\"pending\": true}" || fail "สร้างบัญชี: $R · DB $(SEEN zz.howto.new)"
L=$(LOGIN zz.howto.new howto1234); NT=$(echo "$L" | J 'd.token')
R=$(CALL $NT auth/howto '{"welcome":true}')
R2=$(CALL $(tok zz.howto.lock) auth/howto '{"notice":true}')
[ "$(echo "$L" | J 'd.user.howto.pending+"|"+d.user.howto.legacy')" = "true|false" ] && [ "$(code "$R")" = "423" ] && [ "$(code "$R2")" = "423" ] \
  && [ "$(SEEN zz.howto.new)" = '{"pending": true}' ] && [ "$(SEEN zz.howto.lock)" = "NULL" ] \
  && pass "ยังไม่เปลี่ยนรหัส: ล็อกอินได้ pending แต่บันทึกไม่ได้ (423) · ฐานข้อมูลไม่เปลี่ยน" || fail "ยังไม่เปลี่ยนรหัส: login $(echo "$L" | J 'JSON.stringify(d.user&&d.user.howto)') · $R · $R2"
# โทเคนเดิมพกธง "ต้องเปลี่ยนรหัส" ใน JWT — ต้องล็อกอินใหม่หลังปลดธง ไม่งั้นยัง 423
DB "update \"User\" set \"mustChangePassword\"=false where \"employeeCode\"='zz.howto.new'" >/dev/null
NT=$(tok zz.howto.new howto1234)
R=$(CALL $NT auth/howto '{"welcome":true}')
[ "$(code "$R")" = "200" ] && [ "$(body "$R" | J 'd.howto.pending+"|"+!!d.howto.welcomeAt')" = "false|true" ] \
  && [ "$(DB "select (\"howtoSeen\" ? 'pending')::text||'|'||(\"howtoSeen\"->>'welcome' is not null)::text from \"User\" where \"employeeCode\"='zz.howto.new'")" = "false|true" ] \
  && pass "ตอบกล่องต้อนรับ → ฐานข้อมูลมี welcome ไม่มี pending (ไม่ขึ้นซ้ำ)" || fail "welcome: $R · DB $(SEEN zz.howto.new)"

echo
echo "═══ ทุกตำแหน่งบันทึกได้ (ทีม Area · Admin Spare Part)"
BAD=""
for u in zz.howto.a zz.howto.c zz.howto.m; do
  R=$(CALL $(tok $u) auth/howto '{"tour":"area.plan"}')
  [ "$(code "$R")" = "200" ] && [ "$(KEYS $u)" = "area.plan" ] || BAD="$BAD $u→$R"
done
[ -z "$BAD" ] && pass "Area · Supervisor (COCO) · Maid (COCO) บันทึกดูแล้วได้ (ฐานข้อมูล)" || fail "ทีม Area:$BAD"
R=$(CALL $(tok zz.howto.p) auth/howto '{"notice":true}')
[ "$(code "$R")" = "200" ] && [ "$(DB "select (\"howtoSeen\"->>'notice' is not null)::text from \"User\" where \"employeeCode\"='zz.howto.p'")" = "true" ] \
  && pass "Admin Spare Part บันทึกได้ (ฐานข้อมูล)" || fail "Admin Spare Part: $R"

echo
echo "═══ ดูในฐานะ — เห็นของคนที่ถูกดู · บันทึกไม่ได้"
V=$(CALL $A auth/view-as "{\"userId\":$TID}"); VT=$(body "$V" | J 'd.token||""')
[ -n "$VT" ] && [ "$(GET $VT auth/me | J 'Object.keys(d.howto.tours).sort().join()')" = "$(KEYS zz.howto.t)" ] && [ "$(body "$V" | J 'Object.keys(d.user.howto.tours).length')" = "7" ] \
  && pass "ดูในฐานะช่าง: /auth/me และผลเริ่มดูได้หน้าที่ช่างคนนั้นดูแล้ว (ตรงฐานข้อมูล)" || fail "ดูในฐานะ: $(echo "$V" | head -c 200)"
BEFORE=$(SEEN zz.howto.t)
R=$(CALL $VT auth/howto '{"tour":"tech.myday"}')
[ "$(code "$R")" = "403" ] && [ "$(body "$R" | J 'd.viewAsReadOnly')" = "true" ] && [ "$(SEEN zz.howto.t)" = "$BEFORE" ] \
  && pass "ดูในฐานะบันทึกไม่ได้ (403 ดูได้อย่างเดียว) · ฐานข้อมูลไม่เปลี่ยน" || fail "ดูในฐานะบันทึกได้: $R"

echo
echo "═══ ให้ดูวิธีใช้ใหม่ (แอดมิน)"
R=$(CALL $A "auth/users/$TID/howto-reset" '{}')
[ "$(code "$R")" = "200" ] && [ "$(DB "select (\"howtoSeen\"->>'pending')||'|'||(\"howtoSeen\" ? 'resetAt')::text||'|'||(\"howtoSeen\"->>'resetBy')||'|'||(\"howtoSeen\" ? 'tours')::text||'|'||(\"howtoSeen\" ? 'notice')::text from \"User\" where id=$TID")" = "true|true|$AID|false|false" ] \
  && pass "แอดมินกดให้ดูใหม่ → pending + เวลา + คนกด · หน้าที่ดูแล้วถูกล้าง (ฐานข้อมูล)" || fail "reset: $R · DB $(SEEN zz.howto.t)"
SID=$(IDOF zz.howto.s); BEFORE=$(SEEN zz.howto.s)
RS=$(CALL $S "auth/users/$SID/howto-reset" '{}'); RT=$(CALL $T "auth/users/$SID/howto-reset" '{}')
[ "$(code "$RS")|$(code "$RT")" = "403|403" ] && [ "$(body "$RS" | J 'd.error')" = "หน้านี้สำหรับแอดมินเท่านั้น" ] && [ "$(body "$RT" | J 'd.error')" = "หน้านี้สำหรับแอดมินเท่านั้น" ] \
  && [ "$(SEEN zz.howto.s)" = "$BEFORE" ] && pass "หัวหน้าภาค/ช่างกดให้ดูใหม่ไม่ได้ (403) · ฐานข้อมูลไม่เปลี่ยน" || fail "หัวหน้าภาค/ช่าง: $RS · $RT"
R=$(CALL $(tok zz.howto.p) "auth/users/$SID/howto-reset" '{}')
[ "$(code "$R")" = "403" ] && body "$R" | J 'd.error' | grep -q "Admin Spare Part ดูได้อย่างเดียว" && [ "$(SEEN zz.howto.s)" = "$BEFORE" ] \
  && pass "Admin Spare Part กดไม่ได้ (403) · ฐานข้อมูลไม่เปลี่ยน" || fail "Admin Spare Part: $R"
R=$(CALL $(tok zz.howto.a) "auth/users/$SID/howto-reset" '{}')
[ "$(code "$R")" = "403" ] && [ "$(body "$R" | J 'd.error')" = "ตำแหน่งนี้แจ้งและเปิดใบงานได้ ส่วนอื่นดูได้อย่างเดียว" ] && [ "$(SEEN zz.howto.s)" = "$BEFORE" ] \
  && pass "ทีม Area กดไม่ได้ (403 ข้อความเดิมของตำแหน่ง) · ฐานข้อมูลไม่เปลี่ยน" || fail "Area: $R"
MISSING=$(DB "select coalesce(max(id),0)+100000 from \"User\"")
DB "update \"User\" set \"deletedAt\"=now() where \"employeeCode\"='zz.howto.lock'" >/dev/null
R1=$(CALL $A "auth/users/$MISSING/howto-reset" '{}'); R2=$(CALL $A "auth/users/abc/howto-reset" '{}')
R3=$(CALL $A "auth/users/$(IDOF zz.howto.lock)/howto-reset" '{}'); R4=$(CALL $VT "auth/users/$SID/howto-reset" '{}')
[ "$(code "$R1")|$(body "$R1" | J 'd.error')" = "404|ไม่พบผู้ใช้คนนี้" ] && [ "$(code "$R2")|$(body "$R2" | J 'd.error')" = "400|รหัสผู้ใช้ไม่ถูกต้อง" ] \
  && [ "$(code "$R3")" = "404" ] && [ "$(SEEN zz.howto.lock)" = "NULL" ] && [ "$(code "$R4")" = "403" ] && [ "$(SEEN zz.howto.s)" = "$BEFORE" ] \
  && pass "ไม่มีผู้ใช้/ถูกลบแล้ว 404 · รหัสไม่ใช่ตัวเลข 400 · ดูในฐานะ 403 (ฐานข้อมูลไม่เปลี่ยน)" || fail "404/400/403: $R1 · $R2 · $R3 · $R4"
curl -s -o /dev/null -X POST localhost:4000/api/auth/view-as/stop -H "$(H $VT)"

echo
echo "═══ หน้าการใช้งานแอป"
P=$(GET $A "usage?range=7d&q=zz.howto.c")
[ "$(echo "$P" | J 'd.people.length+"|"+d.people[0].role+"|"+Object.keys(d.people[0].howto.tours).sort().join()')" = "1|COCO_SUPERVISOR|$(KEYS zz.howto.c)" ] && [ -n "$(KEYS zz.howto.c)" ] \
  && pass "/usage ส่ง howto ต่อคน (หน้าที่ดูแล้วตรงฐานข้อมูล) และตำแหน่งดิบ" || fail "usage: $(echo "$P" | J 'JSON.stringify(d.people)' | head -c 300)"

echo
echo "═══ migration: ใครนับเป็นบัญชีใหม่ (รันไฟล์จริงแล้ว ROLLBACK)"
# หาไฟล์ด้วยชื่อท้าย ไม่ใช่ชื่อเต็ม — โฟลเดอร์อาจถูกเปลี่ยนเลขนำหน้าให้เรียงหลัง migration ที่ขึ้นก่อน
MIGS=$(ls backend/prisma/migrations/*_user_howto_seen/migration.sql 2>/dev/null)
if [ "$(echo "$MIGS" | grep -c .)" != 1 ]; then
  fail "ต้องเจอไฟล์ migration *_user_howto_seen หนึ่งไฟล์พอดี: [$MIGS]"
else
  PENDING_SQL=$(sed -n '/^-- pending:/,$p' "$MIGS")
  GOT=$(PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAt -v ON_ERROR_STOP=1 <<SQL
BEGIN;
INSERT INTO "User"("employeeCode",name,role,"passwordHash","mustChangePassword") VALUES
  ('zz.howto.mig.a','ยังไม่เคยเข้าแอป','EMPLOYEE','x',true),
  ('zz.howto.mig.b','เคยเข้าแอปแล้ว','EMPLOYEE','x',true),
  ('zz.howto.mig.c','แอดมินเคยตั้งรหัสใหม่ให้','EMPLOYEE','x',true);
INSERT INTO "UsageSlot"("userId",slot,device) SELECT id, now(), 'WEB' FROM "User" WHERE "employeeCode"='zz.howto.mig.b';
UPDATE "User" SET "passwordChangedAt"=now() - interval '120 days' WHERE "employeeCode"='zz.howto.mig.c';
$PENDING_SQL
SELECT 'mig|'||string_agg(substr("employeeCode",14)||'='||coalesce("howtoSeen"::text,'NULL'), ' ' ORDER BY "employeeCode") FROM "User" WHERE "employeeCode" LIKE 'zz.howto.mig.%';
ROLLBACK;
SQL
)
  [ "$(echo "$GOT" | grep '^mig|')" = 'mig|a={"pending": true} b=NULL c=NULL' ] && [ "$(DB "select count(*) from \"User\" where \"employeeCode\" like 'zz.howto.mig.%'")" = "0" ] \
    && pass "เฉพาะบัญชีที่ยังไม่เคยเข้าแอป → pending · เคยเข้าแอป/แอดมินเคยตั้งรหัสใหม่ (บันทึกถูกลบไปแล้ว) = พนักงานเดิม" || fail "migration: $GOT"
fi

echo
echo "═══ คำที่ห้ามใช้"
! grep -rq "ทัวร์" mobile/src && pass "ไม่มีคำว่า ทัวร์ ในแอป (mobile/src)" || fail "เจอคำว่า ทัวร์: $(grep -rln "ทัวร์" mobile/src | head -3 | tr '\n' ' ')"

[ -z "$FAILED" ]
