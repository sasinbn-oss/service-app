#!/bin/bash
# สุขภาพเซิร์ฟเวอร์ + คิวของคำขอที่ถามเป็นรอบ (ระบบล่ม 7 พ.ย. 69 — P2024 สายฐานข้อมูล 5 เส้นถูกตัวเลขกระดิ่ง/แชทแย่งหมด ล็อกอินไม่ได้)
#
# 1) /health/status เปิดได้โดยไม่ล็อกอิน — ตอนที่ต้องดูที่สุดคือตอนล็อกอินไม่ได้ และไม่มีข้อมูลคน/ใบงานหลุดออกไป
# 2) รหัสข้อผิดพลาดของฐานข้อมูล: แบบไม่ว่าง/ต่อไม่ติด = 503 พร้อมรหัส · แบบอื่นของ Prisma = 500 พร้อมรหัส · error ทั่วไปไม่มีรหัส
# 3) แบ่งคิว: ถามเป็นรอบ 2 (คิวเต็ม/รอนาน = 503 ไม่แตะฐานข้อมูล) · ดูข้อมูล 4 (รอ ไม่ทิ้ง) · ล็อกอิน/บันทึก/ดาวน์โหลดไฟล์ไม่เข้าคิว
# 4) ตัวเลขกระดิ่ง/แชท/กล่องงานยังตอบปกติเมื่อไม่มีคิว (ไม่มีอะไรพังเพราะคิว)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API=http://localhost:4000/api
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; }
J() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log(eval(process.argv[1]))})" "$1"; }
TS() { (cd "$ROOT/backend" && node_modules/.bin/ts-node --transpile-only -e "$1"); }

# ---------- 1) /health/status ----------
ST=$(curl -s -m 20 -w '\n%{http_code}' localhost:4000/health/status)
CODE=$(echo "$ST" | tail -1); BODY=$(echo "$ST" | sed '$d')
[ "$CODE" = 200 ] && echo "$BODY" | J 'd.db.ok===true&&typeof d.db.sec==="number"&&d.lanes.polls.maxRunning===2&&d.lanes.reads.maxRunning===4&&typeof d.waitingNow==="number"&&Array.isArray(d.last15min.busiestRoutes)?"ok":"bad"' | grep -q ok \
  && pass "/health/status เปิดได้โดยไม่ล็อกอิน: ฐานข้อมูลตอบ · คิวถามเป็นรอบ (2) / ดูข้อมูล (4) · คำขอค้าง · ทางที่ใช้เวลารวมมากสุด" || fail "/health/status: $CODE $(echo "$BODY" | head -c 300)"
# ไม่มีรหัสพนักงาน/ชื่อ/รหัสใบงานหลุด — ทางที่มีเลขถูกแทนด้วย :id
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"employeeCode":"A001","password":"test1234"}' | J 'd.token')
WO=$(curl -s "$API/work-orders?status=INBOX" -H "Authorization: Bearer $TOKEN" | J 'd.rows[0].id')
curl -s -o /dev/null "$API/work-orders/$WO/version" -H "Authorization: Bearer $TOKEN"
BODY=$(curl -s -m 20 localhost:4000/health/status)
echo "$BODY" | J 'd.last15min.busiestRoutes.some(r=>r.route==="GET /api/work-orders/:id/version")?"ok":"bad"' | grep -q ok \
  && ! echo "$BODY" | grep -qE "A001|T001|WO-[0-9]|/work-orders/$WO/" \
  && pass "/health/status: ทางที่มีเลขรวมกลุ่มเป็น :id · ไม่มีรหัสพนักงาน/รหัสใบงาน" || fail "/health/status รั่ว/ไม่รวมกลุ่ม: $(echo "$BODY" | head -c 400)"

# ---------- 2) รหัสข้อผิดพลาดของฐานข้อมูล ----------
R=$(TS '
const { dbErrorOf } = require("./src/utils/dbError");
const { Prisma } = require("@prisma/client");
const known = (code) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "5.22.0" });
const init = new Prisma.PrismaClientInitializationError("FATAL: (EMAXCONNSESSION) max clients reached in session mode", "5.22.0");
const out = [dbErrorOf(known("P2024")), dbErrorOf(init), dbErrorOf(known("P2002")), dbErrorOf(new Error("boom")), dbErrorOf(new Error("Can'"'"'t reach database server at x:5432"))];
console.log(JSON.stringify(out));
')
[ "$R" = '[{"code":"P2024","busy":true},{"code":"EMAXCONNSESSION","busy":true},{"code":"P2002","busy":false},null,{"code":"P1001","busy":true}]' ] \
  && pass "แยกรหัส: P2024/EMAXCONNSESSION/P1001 = ไม่ว่าง (503) · P2002 = รหัสอื่นของ Prisma (500 + รหัส) · error ทั่วไป = ไม่มีรหัส" || fail "แยกรหัส: $R"

# ---------- 3) แบ่งคิว (จำลอง req/res — ไม่ต้องทำให้ฐานข้อมูลจริงช้า) ----------
# ถามเป็นรอบ: พร้อมกัน 2 · คิวเกิน 30 = 503 ทันที · รอเกิน 5 วิ = 503 · ดูข้อมูล: พร้อมกัน 4 ที่เหลือรอ (ไม่ทิ้ง)
# ไม่เข้าคิว: ล็อกอิน · POST · ดาวน์โหลดไฟล์ · ทางนอก /api
R=$(TS '
const { EventEmitter } = require("events");
const { pollGate, pollGateStats } = require("./src/utils/pollGate");
const mk = (path, method = "GET") => {
  const res = new EventEmitter();
  res.locals = {}; res.code = 0; res.headers = {};
  res.status = (c) => { res.code = c; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.json = (b) => { res.body = b; res.emit("finish"); return res; };
  return { req: { method, path }, res };
};
(async () => {
  const ran = [];
  const go = (path, method) => { const x = mk(path, method); pollGate(x.req, x.res, () => ran.push(x)); return x; };
  const a = go("/api/work-orders/bell"), b = go("/api/work-orders/chats"), c = go("/api/work-orders/482/version");
  const s1 = { ...pollGateStats().polls, ran: ran.length };
  const login = go("/api/auth/login", "POST"), save = go("/api/work-orders/bell", "POST"), health = go("/health/status");
  const s2 = ran.length;
  a.res.json({});
  const s3 = ran.includes(c);
  // ดูข้อมูล 4 อันวิ่ง อันที่ 5 รอ · ดาวน์โหลดไฟล์ไม่รอ · จบหนึ่งอัน อันที่ 5 ได้วิ่ง
  const r = [1, 2, 3, 4, 5].map((i) => go(`/api/work-orders/${i}`));
  const f = go("/api/work-orders/1/attachments/2/file");
  const s4 = { reads: pollGateStats().reads, r5: ran.includes(r[4]), file: ran.includes(f) };
  r[0].res.json({});
  const s5 = ran.includes(r[4]);
  // คิวถามเป็นรอบเต็ม 30 → อันที่ 31 ได้ 503 ทันที · ที่เหลือรอเกิน 5 วิ → 503 · ดูข้อมูลที่รออยู่ไม่ถูกทิ้งใน 5 วิ
  const more = []; for (let i = 0; i < 31; i++) more.push(go("/api/work-orders/inbox-count"));
  const extra = go("/api/work-orders/9"); // ดูข้อมูลรอคิว (4 อันยังวิ่ง)
  const shedNow = more.filter((x) => x.res.code === 503).length;
  await new Promise((res) => setTimeout(res, 5300));
  const shedLate = more.filter((x) => x.res.code === 503).length;
  const body = more.find((x) => x.res.code === 503).res;
  console.log(JSON.stringify({ s1, s2, s3, s4, s5, shedNow, shedLate, extraWaiting: extra.res.code === 0 && !ran.includes(extra),
    retry: body.headers["Retry-After"], code: body.body.code, err: body.locals.errCode, after: pollGateStats() }));
  process.exit(0);
})();
')
echo "$R" | J 'd.s1.running===2&&d.s1.queued===1&&d.s1.ran===2&&d.s2===5&&d.s3===true&&d.s4.reads.running===4&&d.s4.reads.queued===1&&d.s4.r5===false&&d.s4.file===true&&d.s5===true&&d.shedNow===1&&d.shedLate===31&&d.extraWaiting===true&&d.retry==="30"&&d.code==="BUSY"&&d.err==="POLL_SHED"&&d.after.polls.queued===0&&d.after.reads.queued===1?"ok":"bad"' | grep -q ok \
  && pass "แบ่งคิว: ถามเป็นรอบ 2 (คิวเต็ม/รอเกิน 5 วิ = 503 Retry-After 30) · ดูข้อมูล 4 ที่เหลือรอไม่ถูกทิ้ง · ล็อกอิน/POST/ดาวน์โหลดไฟล์/นอก /api ไม่เข้าคิว" || fail "แบ่งคิว: $R"

# ---------- 4) ตัวเลขที่ถามเป็นรอบยังตอบปกติ ----------
OK=0
for p in work-orders/bell work-orders/chats work-orders/inbox-count "work-orders/version?status=INBOX" "work-orders/$WO/version"; do
  C=$(curl -s -o /dev/null -w '%{http_code}' "$API/$p" -H "Authorization: Bearer $TOKEN" -H 'Cache-Control: no-cache')
  [ "$C" = 200 ] && OK=$((OK + 1))
done
[ "$OK" = 5 ] && pass "กระดิ่ง · แชท · ตัวเลขกล่องงาน · ลายนิ้วมือรายการ/ใบงาน ตอบ 200 ตามปกติเมื่อไม่มีคิว" || fail "ทางที่ถามเป็นรอบตอบ 200 แค่ $OK/5"
