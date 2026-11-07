// จำลองคนทั้งบริษัทเปิดแอปค้างไว้ แล้ววัดว่าคนที่เพิ่งมาล็อกอินได้เร็วแค่ไหน — tests/load-test.sh เรียกตัวนี้
// node tests/load/load-sim.js <base> <seconds> <users>
//
// ทำไมมีเทสต์นี้: 7 พ.ย. 69 ล็อกอินไม่ได้ทั้งระบบสองรอบในวันเดียว (P2024 — สายฐานข้อมูลไม่พอ) ทั้งที่เทสต์ API 2,600 ข้อผ่านหมด
// เทสต์ปกติยิงทีละคำขอบนฐานข้อมูลในเครื่อง (ไปกลับไม่ถึง 1 ms) จึงไม่มีวันเห็นเพดานของสาย 7 เส้นข้าม region
// จังหวะของแต่ละคน = จังหวะของแอปจริง (ดูในโค้ดแอป): เปลี่ยนหน้า → รายการ + ลายนิ้วมือ + ตัวเลขเมนู + กระดิ่ง/แชท (ห่าง ≥ 30 วิ) ·
// ตัวเช็ครายการทุก 60 วิ · กระดิ่ง/แชททุก 2 นาที · 30% เปิดใบงานค้าง ถามรุ่นทุก 20 วิ · แอดมินถามคนออนไลน์ทุก 60 วิ ·
// 20% เปิดหน้าอะไหล่ (ขอรูปทีละ 6 แบบเบราว์เซอร์)
// ตั้งใจให้หนักกว่าของจริง (ทุกคนเปลี่ยนหน้าทุก ~45 วิ ไม่หยุด) — ผ่านตรงนี้ได้ ของจริงต้องผ่าน
const BASE = process.argv[2] || "http://localhost:4100";
const SECS = Number(process.argv[3] || 180);
const N = Number(process.argv[4] || 145);
const LOGIN_MAX_MS = 3000;

const t0 = Date.now();
const stats = new Map();
const rec = (k, ms, st) => {
  const s = stats.get(k) ?? { n: 0, ms: 0, max: 0, bad: 0 };
  s.n++;
  s.ms += ms;
  s.max = Math.max(s.max, ms);
  if (st >= 500 || st === 0) s.bad++;
  stats.set(k, s);
};
async function call(token, method, path, body, key) {
  const st = Date.now();
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90_000),
    });
    const txt = await r.text();
    rec(key ?? path.replace(/\d+/g, ":id").split("?")[0], Date.now() - st, r.status);
    return { status: r.status, txt, ms: Date.now() - st };
  } catch (e) {
    rec(key ?? path.replace(/\d+/g, ":id").split("?")[0], Date.now() - st, 0);
    return { status: 0, txt: String(e), ms: Date.now() - st };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.6 + Math.random() * 0.8);
let t1 = 0;
const end = () => t1 && Date.now() - t1 > SECS * 1000;

async function user(i, token, role, woIds, parts) {
  await sleep(Math.random() * 60_000);
  let lastBell = 0;
  const bellChats = async () => {
    lastBell = Date.now();
    await Promise.all([call(token, "GET", "/api/work-orders/bell"), call(token, "GET", "/api/work-orders/chats")]);
  };
  const loops = [
    (async () => {
      while (!end()) {
        await Promise.all([
          call(token, "GET", "/api/work-orders?status=INBOX"),
          call(token, "GET", "/api/work-orders/version?status=INBOX"),
          call(token, "GET", "/api/work-orders/inbox-count"),
          Date.now() - lastBell > 30_000 ? bellChats() : null,
        ]);
        await sleep(jitter(45_000));
        if (woIds.length && Math.random() < 0.4) await call(token, "GET", `/api/work-orders/${woIds[(i * 7 + Date.now()) % woIds.length]}`);
      }
    })(),
    (async () => { while (!end()) { await sleep(jitter(60_000)); await call(token, "GET", "/api/work-orders/version?status=INBOX"); } })(),
    (async () => { while (!end()) { await sleep(120_000); if (Date.now() - lastBell >= 30_000) await bellChats(); } })(),
    i % 10 < 3 && woIds.length
      ? (async () => { const id = woIds[i % woIds.length]; while (!end()) { await sleep(20_000); await call(token, "GET", `/api/work-orders/${id}/version`); } })()
      : null,
    role === "ADMIN" ? (async () => { while (!end()) { await sleep(60_000); await call(token, "GET", "/api/usage/online"); } })() : null,
    // หน้าอะไหล่: รูปละคำขอ เบราว์เซอร์ขอพร้อมกันทีละ 6
    i % 5 === 0 && parts.length
      ? (async () => {
          while (!end()) {
            await sleep(jitter(90_000));
            const list = parts.slice(0, 60);
            for (let k = 0; k < list.length && !end(); k += 6)
              await Promise.all(list.slice(k, k + 6).map((p) => call(null, "GET", `/api/spare-parts/${p.id}/image?v=${encodeURIComponent(p.v)}`)));
          }
        })()
      : null,
  ];
  await Promise.all(loops);
}

(async () => {
  const tokens = [];
  for (let b = 1; b <= N; b += 5) {
    await Promise.all(
      [0, 1, 2, 3, 4]
        .filter((k) => b + k <= N)
        .map(async (k) => {
          const i = b + k;
          const r = await call(null, "POST", "/api/auth/login", { employeeCode: "L" + String(i).padStart(4, "0"), password: "test1234" }, "login(setup)");
          try {
            const d = JSON.parse(r.txt);
            tokens.push({ i, token: d.token, role: d.user.role });
          } catch {
            console.log("ล็อกอินตอนเตรียมไม่ได้", i, r.status, r.txt.slice(0, 120));
          }
        })
    );
  }
  const adm = tokens.find((t) => t.role === "ADMIN");
  if (!adm) {
    console.log("FAIL เตรียมผู้ใช้จำลองไม่สำเร็จ");
    process.exit(1);
  }
  const woIds = (JSON.parse((await call(adm.token, "GET", "/api/work-orders?status=INBOX")).txt).rows || []).map((r) => r.id).slice(0, 200);
  const parts = (JSON.parse(process.env.LOAD_PARTS || "[]"));
  console.log(`ผู้ใช้ ${tokens.length} คน · ใบงาน ${woIds.length} · อะไหล่มีรูป ${parts.length} · ${SECS} วิ`);
  t1 = Date.now();
  const logins = [];
  const probe = (async () => {
    while (!end()) {
      const r = await call(null, "POST", "/api/auth/login", { employeeCode: "A001", password: "test1234" }, "LOGIN(probe)");
      logins.push(r);
      if (r.status !== 200 || r.ms > LOGIN_MAX_MS) console.log(`  t=${Math.round((Date.now() - t1) / 1000)}s ล็อกอิน ${r.status} ${r.ms} ms ${r.status !== 200 ? r.txt.slice(0, 120) : ""}`);
      await sleep(5000);
    }
  })();
  await Promise.all([probe, ...tokens.map((t) => user(t.i, t.token, t.role, woIds, parts))]);

  console.log("\nทาง                                       ครั้ง  เฉลี่ยms  ช้าสุดms  5xx");
  for (const [k, s] of [...stats.entries()].sort((a, b) => b[1].ms - a[1].ms))
    console.log(k.padEnd(40), String(s.n).padStart(6), String(Math.round(s.ms / s.n)).padStart(8), String(s.max).padStart(8), String(s.bad).padStart(5));
  const st = JSON.parse((await call(null, "GET", "/health/status", null, "status")).txt);
  console.log("\n/health/status:", JSON.stringify({ db: st.db, lanes: st.lanes, partImages: st.partImages, errors: st.last15min.serverErrors }));

  const bad = logins.filter((r) => r.status !== 200);
  const slow = logins.filter((r) => r.ms > LOGIN_MAX_MS);
  const max = Math.max(...logins.map((r) => r.ms));
  const p2024 = Object.entries(st.last15min.serverErrors).filter(([k]) => /P\d{4}|EMAXCONN|ECONN/.test(k)).reduce((a, [, n]) => a + n, 0);
  const avg = Math.round(logins.reduce((a, r) => a + r.ms, 0) / logins.length);
  console.log("");
  console.log(bad.length === 0 ? "PASS" : "FAIL", `ล็อกอินระหว่างคน ${tokens.length} คนใช้อยู่: พัง ${bad.length} จาก ${logins.length} ครั้ง`);
  console.log(slow.length === 0 ? "PASS" : "FAIL", `ล็อกอินไม่เกิน ${LOGIN_MAX_MS / 1000} วิ ทุกครั้ง (เฉลี่ย ${avg} ms · ช้าสุด ${max} ms)`);
  console.log(p2024 === 0 ? "PASS" : "FAIL", `ไม่มี error ฐานข้อมูลไม่ว่าง/ต่อไม่ติด (P2024 ฯลฯ) — ${p2024} ครั้ง`);
  process.exit(0);
})();
