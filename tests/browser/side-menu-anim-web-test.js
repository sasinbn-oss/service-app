// ทดสอบ: กาง/ย่อกลุ่มในเมนูข้าง — แบบ ค. "ทยอยทีละรายการ" 0.32 วินาที (เจ้าของงานเลือกจากตัวอย่าง ต.ค. 69)
//   วัด DOM จริงทุกเฟรม (นับเวลาจากจังหวะคลิกในหน้า ไม่ใช่จากฝั่ง node ซึ่งช้ากว่าหลายสิบ ms):
//   · พัก: รายการของกลุ่มที่ย่อไม่อยู่ในหน้า · หัวกลุ่มมีตัวเลขจำนวนรายการ · ลูกศรไม่หมุน
//   · กาง ~100 ms: ช่องของทุกแถวสูงระหว่าง 0 กับเต็ม (เท่ากันทุกแถว — กางพร้อมกัน) · แถวล่างจางกว่าแถวบน (ทยอย)
//     ตั้งเวลาไว้ 320 ms ทุกช่อง ทยอยแถวละ 35 ms · ~450 ms ช่องสูงเต็มแล้ว (ตรึง 0.32 วิ — ช้าเท่าตัวหรือคูณ TEMPO ต้องตก)
//   · กาง ~1 วิ: ทุกแถวสูงเต็ม ทึบเต็ม ไม่มีสไตล์การเคลื่อนไหวค้าง · ลูกศรหมุน 180° · ตัวเลขบนหัวกลุ่มหายไปจากหน้า
//   · ย่อ: แถวที่กำลังหุบกดไม่ได้ (inert · aria-hidden · pointer-events none) · ตั้งเวลา 256 ms ไม่ทยอย
//     ช่องหดลงเรื่อย ๆ · จางพร้อมกันไม่ไล่ · ~330 ms หุบสุด · ~1 วิ แถวถูกถอดออกจากหน้า ตัวเลขกลับมา ลูกศรกลับ
//   · ย่อกลุ่มที่มีหน้าที่เปิดอยู่: แถวนั้นอยู่ครบทุกเฟรม ไม่หุบ ไม่จาง
//   · "ลดการเคลื่อนไหว" (prefers-reduced-motion): กาง/ย่อทันทีตั้งแต่เฟรมแรก ไม่มีเฟรมครึ่ง ๆ
//   · สร้างครั้งแรก (หลังเข้าระบบ · โหลดหน้าใหม่ · เปิดเมนูเลื่อนออกบนมือถือ) ไม่มีการเคลื่อนไหวเลย
//   · จอมือถือ: เมนูเลื่อนออกกาง/ย่อแบบเดียวกัน
// ใช้ผู้ใช้ทดสอบ A001 อย่างเดียว ไม่สร้างข้อมูลในฐานข้อมูล (สถานะกลุ่มอยู่ใน localStorage ของบริบทเบราว์เซอร์ที่สร้างใหม่)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const URL = "http://127.0.0.1:8081/";
const ADMIN = "ผู้ดูแลระบบ";
// รายการในกลุ่มผู้ดูแลระบบ — "สำรองข้อมูล" มีเฉพาะ Super Admin เทสต์จึงใช้เฉพาะแถวที่มีจริงตอนกางสุด
const ADMIN_ROWS = ["ระบบหลังบ้าน", "อนุมัติคำขอเบิก", "สิทธิ์ผู้ใช้", "ทีมช่าง", "จัดการข้อมูลสาขา", "สำรองข้อมูล"];
const ACTIVE = "งานของฉันวันนี้";
const ACTIVE_GROUP = "งานซ่อม";
const OTHER_ROWS = ["กล่องงานของฉัน", "ใบงานซ่อม"];

/**
 * ตัววัดในหน้า — ติดตั้งทุกครั้งที่โหลดหน้า
 * แถวเมนู = [aria-label=ชื่อเมนู] · พ่อ = ตัวรายการที่จาง/เลื่อน · ปู่ = ช่องที่สูงขึ้น/หดลง (MenuReveal.tsx)
 */
function probe() {
  // ค่าเริ่มต้นของแอป: กางแค่งานซ่อม (และเมนูไม่หด) — ไม่ขึ้นกับว่าเทสต์ชุดก่อนทิ้งอะไรไว้
  try {
    localStorage.setItem("otteri-side-groups", JSON.stringify(["หน้างาน", "รถ", "เอกสารและบัญชี", "ผู้ดูแลระบบ"]));
    localStorage.setItem("otteri-side-collapsed", "0");
  } catch {}

  // ค่าแรกของรายการเวลา CSS เป็น ms ("320ms" · "0.32s" · "35ms, 35ms") — ไม่มีค่า = null
  const msOf = (v) => {
    const x = (v || "").split(",")[0].trim();
    return x ? (x.endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000) : null;
  };
  window.__menuSnap = (labels, title) => {
    const menu = document.getElementById("side-menu");
    const rows = labels.map((l) => {
      const row = menu && menu.querySelector(`[aria-label="${l}"]`);
      if (!row) return null;
      const body = row.parentElement;
      const slot = body.parentElement;
      return {
        h: slot.getBoundingClientRect().height,
        full: body.getBoundingClientRect().height,
        op: +getComputedStyle(body).opacity,
        inert: !!slot.inert,
        hidden: slot.getAttribute("aria-hidden") === "true",
        pe: getComputedStyle(slot).pointerEvents,
        overflow: getComputedStyle(slot).overflow,
        // สไตล์การเคลื่อนไหวค้างอยู่ไหม — ตอนพักต้องไม่มีเลย (หน้าตาเหมือนก่อนมีการเคลื่อนไหว)
        styled: !!(slot.style.height || slot.style.transitionProperty || body.style.opacity || body.style.transitionProperty),
        // เวลาที่ตั้งไว้จริง — ตรึงตัวเลขที่เจ้าของงานเลือก (ช่องกาง 320 · หุบ 256 · ทยอยแถวละ 35)
        dur: msOf(slot.style.transitionDuration),
        delay: msOf(body.style.transitionDelay),
      };
    });
    const head = menu && (menu.querySelector(`[aria-label="กางกลุ่ม ${title}"]`) || menu.querySelector(`[aria-label="ย่อกลุ่ม ${title}"]`));
    let turn = null;
    let digits = null;
    if (head) {
      // ลูกศร = ลูกตัวสุดท้ายของหัวกลุ่ม · matrix(a, …) — a = cos(มุม): 1 = ชี้ลง (ย่อ) · -1 = หมุน 180° (กาง)
      const m = getComputedStyle(head.lastElementChild).transform;
      turn = m === "none" ? 1 : parseFloat(m.slice(m.indexOf("(") + 1));
      digits = /\d/.test(head.innerText);
    }
    return { rows, turn, digits, label: head ? head.getAttribute("aria-label") : null };
  };

  // บันทึกทุกเฟรมนับจากคลิกครั้งถัดไป จนครบ ms — เวลา t นับจากจังหวะคลิกจริงในหน้า
  window.__menuRecord = (labels, title, ms) =>
    new Promise((resolve) => {
      const out = [];
      let t0 = null;
      const onClick = () => {
        if (t0 === null) t0 = performance.now();
      };
      document.addEventListener("click", onClick, true);
      const began = performance.now();
      const tick = () => {
        const now = performance.now();
        if (t0 !== null) out.push({ t: now - t0, ...window.__menuSnap(labels, title) });
        if ((t0 !== null && now - t0 >= ms) || now - began > 15000) {
          document.removeEventListener("click", onClick, true);
          resolve(out);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  // 40 เฟรมแรกหลังเมนูโผล่ (เข้าระบบ · โหลดใหม่ · เปิดเมนูเลื่อนออก) กลุ่มต้องไม่เคลื่อนไหวเลย
  // ดูแค่ transition-property ที่ตั้งตรงบนตัว (MenuReveal ใส่แบบนี้เฉพาะตอนขยับ) — ห้ามหาคำว่า "transition" ทั้ง style:
  // TouchableOpacity ของ react-native-web ใส่ transition-duration: 0s ตรงบนตัวทุกปุ่มเสมอ (transition-property อยู่ใน class)
  // หัวกลุ่ม/แถวทุกตัวจึงเข้าข่ายทุกเฟรม เทสต์ตกทุกรอบไม่ว่าเมนูจะขยับหรือไม่
  window.__firstFrames = { seen: 0, moving: 0 };
  const watch = () => {
    const menu = document.getElementById("side-menu");
    const f = window.__firstFrames;
    if (menu) {
      f.seen++;
      if ([...menu.querySelectorAll("[style]")].some((n) => n.style.transitionProperty)) f.moving++;
      if (f.seen >= 40) return;
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const near = (a, b, d = 0.75) => Math.abs(a - b) <= d;
  const fmt = (x) => JSON.stringify(x, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v));
  // เฟรมที่ใกล้เวลา ms ที่สุด (ต้องอยู่ในช่วง ±span) — เครื่องช้าแล้วเฟรมหาย ให้บอกชัด ๆ แทนที่จะไปเทียบเฟรมผิดจังหวะ
  const at = (samples, ms, span = 50) => {
    const c = samples.filter((s) => Math.abs(s.t - ms) <= span);
    return c.sort((a, b) => Math.abs(a.t - ms) - Math.abs(b.t - ms))[0] || null;
  };

  async function login(p) {
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(URL, { waitUntil: "networkidle", timeout: 180000 });
    await p.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
  }
  const head = (p, title) =>
    p.locator("#side-menu").locator(`[aria-label="กางกลุ่ม ${title}"], [aria-label="ย่อกลุ่ม ${title}"]`).first();
  // คลิกหัวกลุ่มแล้วเก็บทุกเฟรม ms มิลลิวินาที
  async function toggle(p, title, labels, ms = 1000) {
    const h = head(p, title);
    await h.scrollIntoViewIfNeeded();
    const rec = p.evaluate(([l, t, n]) => window.__menuRecord(l, t, n), [labels, title, ms]);
    // คลิกพลาดแล้วโยน error ไปที่ catch ด้านล่าง — ตัวบันทึกที่ค้างอยู่ต้องไม่กลายเป็น unhandled rejection ตอนปิดเบราว์เซอร์
    rec.catch(() => {});
    await h.click();
    return rec;
  }
  const snap = (p, labels, title) => p.evaluate(([l, t]) => window.__menuSnap(l, t), [labels, title]);

  /** ตรวจการกางของกลุ่มผู้ดูแลระบบ — ใช้ทั้งจอคอมและจอมือถือ */
  async function checkOpen(p, tag) {
    const before = await snap(p, ADMIN_ROWS, ADMIN);
    before.rows.every((r) => r === null)
      ? pass(`${tag} พัก: กลุ่ม${ADMIN}ที่ย่ออยู่ไม่มีรายการในหน้า`)
      : fail(`${tag} กลุ่มที่ย่ออยู่ยังมีรายการในหน้า ${fmt(before.rows)}`);
    before.digits && near(before.turn, 1, 0.01) && before.label === `กางกลุ่ม ${ADMIN}`
      ? pass(`${tag} พัก: หัวกลุ่มที่ย่อมีตัวเลขจำนวนรายการ ลูกศรชี้ลง`)
      : fail(`${tag} หัวกลุ่มที่ย่อ: ${fmt(before)}`);

    const s = await toggle(p, ADMIN, ADMIN_ROWS);
    const present = ADMIN_ROWS.map((_, i) => s.some((x) => x.rows[i]));
    const idx = present.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    idx.length >= 4 ? pass(`${tag} กางแล้วมี ${idx.length} รายการ`) : fail(`${tag} กางแล้วมีแค่ ${idx.length} รายการ`);

    const mid = at(s, 100, 45);
    if (!mid) fail(`${tag} ไม่มีเฟรมราว 100 ms หลังคลิก (${s.slice(0, 8).map((x) => Math.round(x.t))})`);
    else {
      const rows = idx.map((i) => mid.rows[i]);
      const growing = rows.every((r) => r && r.h > 0.5 && r.h < r.full - 1 && r.overflow === "hidden");
      growing
        ? pass(`${tag} กาง ${Math.round(mid.t)} ms: ช่องสูงขึ้นอยู่ระหว่างทาง (${rows.map((r) => Math.round(r.h)).join("/")} จาก ${Math.round(rows[0].full)} px)`)
        : fail(`${tag} กาง ${Math.round(mid.t)} ms ช่องไม่อยู่ระหว่างทาง ${fmt(rows)}`);
      const hs = rows.filter(Boolean).map((r) => r.h);
      hs.length && Math.max(...hs) - Math.min(...hs) <= 1
        ? pass(`${tag} ช่องของทุกแถวกางพร้อมกัน (ความสูงเท่ากันทุกแถว)`)
        : fail(`${tag} ช่องกางไม่พร้อมกัน ${fmt(hs)}`);
      const first = rows[0];
      const last = rows[rows.length - 1];
      first && last && first.op > last.op + 0.15
        ? pass(`${tag} ทยอยโผล่: แถวบนทึบ ${first.op.toFixed(2)} แถวล่างยัง ${last.op.toFixed(2)}`)
        : fail(`${tag} ไม่ทยอย ${fmt(rows.map((r) => r && r.op))}`);
      rows.every((r) => r && !r.inert && !r.hidden && r.pe !== "none")
        ? pass(`${tag} แถวที่กำลังโผล่กดได้ตามปกติ`)
        : fail(`${tag} แถวที่กำลังโผล่ถูกปิดการกด ${fmt(rows)}`);
      mid.turn > -0.99 && mid.turn < 0.99 ? pass(`${tag} ลูกศรกำลังหมุน (cos = ${mid.turn.toFixed(2)})`) : fail(`${tag} ลูกศรไม่ได้หมุนระหว่างทาง ${mid.turn}`);
      // ช่วงเวลาข้างบนกว้างพอให้ 0.12–0.76 วิผ่านหมด — ตรึงตัวเลขที่ตั้งไว้ตรง ๆ ไม่งั้นช้าลงเท่าตัวหรือคูณ TEMPO ก็ไม่มีใครรู้
      rows.every((r) => r && r.dur === 320)
        ? pass(`${tag} ช่องกาง 0.32 วิ ตามที่เจ้าของงานเลือก (แบบ ค.)`)
        : fail(`${tag} เวลากางไม่ใช่ 0.32 วิ ${fmt(rows.map((r) => r && r.dur))}`);
      rows.every((r, k) => r && r.delay === k * 35)
        ? pass(`${tag} ทยอยแถวละ 35 ms จากบนลงล่าง`)
        : fail(`${tag} ระยะทยอยไม่ใช่แถวละ 35 ms ${fmt(rows.map((r) => r && r.delay))}`);
    }
    // ตัวเลขที่ตั้งไว้ต้องเป็นของที่เห็นจริงด้วย — 0.32 วิ + เผื่อเฟรมช้าแล้วต้องสูงเต็ม (ถ้าช้าเท่าตัว ตรงนี้ยังสูงไม่ถึง 95%)
    const done = at(s, 450, 40);
    done && idx.every((i) => done.rows[i] && near(done.rows[i].h, done.rows[i].full))
      ? pass(`${tag} ช่องกางสุดแล้วที่ ${Math.round(done.t)} ms`)
      : fail(`${tag} ราว 450 ms ช่องยังกางไม่สุด ${fmt(done && idx.map((i) => done.rows[i]))}`);

    const end = await snap(p, ADMIN_ROWS, ADMIN);
    const rows = idx.map((i) => end.rows[i]);
    rows.every((r) => r && near(r.h, r.full) && r.op === 1 && !r.styled)
      ? pass(`${tag} กางสุด: ทุกแถวสูงเต็ม ทึบเต็ม ไม่มีสไตล์การเคลื่อนไหวค้าง`)
      : fail(`${tag} กางสุดแล้วยังไม่ครบ ${fmt(rows)}`);
    near(end.turn, -1, 0.01) && end.label === `ย่อกลุ่ม ${ADMIN}`
      ? pass(`${tag} ลูกศรหมุน 180° · หัวกลุ่มเป็น "ย่อกลุ่ม"`)
      : fail(`${tag} ลูกศร/ชื่อหัวกลุ่มหลังกาง ${fmt(end)}`);
    end.digits === false ? pass(`${tag} ตัวเลขบนหัวกลุ่มถูกถอดออกจากหน้าแล้ว`) : fail(`${tag} หัวกลุ่มที่กางแล้วยังมีตัวเลข`);
    return idx;
  }

  try {
    // ════ จอคอม 1366×768 — เมนูค้างด้านซ้าย ════
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(probe);
    const page = await ctx.newPage();
    await login(page);
    await page.waitForSelector("#side-menu", { timeout: 30000 });
    await page.waitForTimeout(3000);

    const ff = await page.evaluate(() => window.__firstFrames);
    ff.seen >= 40 && ff.moving === 0
      ? pass(`เข้าระบบแล้วเมนูวาดสภาพสุดท้ายเลย (${ff.seen} เฟรมแรกไม่มีการเคลื่อนไหว)`)
      : fail(`เมนูเคลื่อนไหวตอนสร้างครั้งแรก ${fmt(ff)}`);

    const idx = await checkOpen(page, "จอคอม:");
    await page.screenshot({ path: path.join(DIR, "side-menu-anim-1-open.png"), clip: { x: 0, y: 0, width: 300, height: 768 } });
    const present = idx.map((i) => ADMIN_ROWS[i]);

    // ── ย่อ ──
    const c = await toggle(page, ADMIN, present);
    const early = at(c, 40, 30);
    early && early.rows.every((r) => r && r.inert && r.hidden && r.pe === "none")
      ? pass("ย่อ: แถวที่กำลังหุบกดไม่ได้และโปรแกรมอ่านจอข้าม (inert · aria-hidden · pointer-events none)")
      : fail(`ย่อ: แถวที่กำลังหุบยังกดได้ ${fmt(early)}`);
    early && early.rows.every((r) => r && r.dur === 256 && r.delay === 0)
      ? pass("ย่อ: ช่องหุบใน 0.256 วิ (เร็วกว่ากาง) ไม่ทยอย")
      : fail(`ย่อ: เวลาหุบไม่ใช่ 0.256 วิ ${fmt(early && early.rows.map((r) => r && [r.dur, r.delay]))}`);
    const a = at(c, 60, 30);
    const b = at(c, 160, 40);
    a && b && a.rows.every((r, i) => r && b.rows[i] && r.h < r.full - 0.5 && b.rows[i].h > 0.5 && b.rows[i].h < r.h - 3)
      ? pass(`ย่อ: ช่องหดลงเรื่อย ๆ (${Math.round(a.rows[0].h)} → ${Math.round(b.rows[0].h)} px ที่ ${Math.round(a.t)} → ${Math.round(b.t)} ms)`)
      : fail(`ย่อ: ช่องไม่หดแบบค่อย ๆ ${fmt([a, b])}`);
    const fadeAt = at(c, 50, 30);
    fadeAt && fadeAt.rows.every((r) => r && near(r.op, fadeAt.rows[0].op, 0.05) && r.op < 1)
      ? pass(`ย่อ: ทุกแถวจางพร้อมกัน ไม่ไล่ทีละแถว (${fadeAt.rows.map((r) => r.op.toFixed(2)).join("/")})`)
      : fail(`ย่อ: แถวจางไม่พร้อมกัน ${fmt(fadeAt && fadeAt.rows)}`);
    // 0.256 วิ + เผื่อเฟรมแล้วต้องหุบสุด (สูง 0 หรือถูกถอดออกแล้ว) — ช้ากว่าที่ตั้งไว้จะยังเห็นช่องค้าง
    const shutAt = at(c, 330, 30);
    shutAt && shutAt.rows.every((r) => r === null || r.h < 0.5)
      ? pass(`ย่อ: ช่องหุบสุดแล้วที่ ${Math.round(shutAt.t)} ms`)
      : fail(`ย่อ: ราว 330 ms ช่องยังหุบไม่สุด ${fmt(shutAt && shutAt.rows)}`);
    const endC = await snap(page, present, ADMIN);
    endC.rows.every((r) => r === null) ? pass("ย่อสุด: รายการถูกถอดออกจากหน้า") : fail(`ย่อสุดแล้วรายการยังอยู่ ${fmt(endC.rows)}`);
    endC.digits && near(endC.turn, 1, 0.01) && endC.label === `กางกลุ่ม ${ADMIN}`
      ? pass("ย่อสุด: ตัวเลขกลับมาบนหัวกลุ่ม ลูกศรชี้ลง")
      : fail(`ย่อสุด: หัวกลุ่ม ${fmt(endC)}`);
    await page.screenshot({ path: path.join(DIR, "side-menu-anim-2-shut.png"), clip: { x: 0, y: 0, width: 300, height: 768 } });

    // ── กลุ่มที่มีหน้าที่เปิดอยู่: แถวนั้นไม่หุบ ──
    await page.locator("#side-menu").locator(`[aria-label="${ACTIVE}"]`).click();
    await page.waitForTimeout(2000);
    const labels = [ACTIVE, ...OTHER_ROWS];
    const g = await toggle(page, ACTIVE_GROUP, labels);
    const activeOk = g.length > 10 && g.every((x) => x.rows[0] && near(x.rows[0].h, x.rows[0].full) && x.rows[0].op === 1 && !x.rows[0].inert && !x.rows[0].styled);
    activeOk
      ? pass(`ย่อ${ACTIVE_GROUP}: "${ACTIVE}" (หน้าที่เปิดอยู่) อยู่ครบทุกเฟรม ไม่หุบ ไม่จาง (${g.length} เฟรม)`)
      : fail(`หน้าที่เปิดอยู่ขยับตาม ${fmt(g.find((x) => !x.rows[0] || !near(x.rows[0].h, x.rows[0].full) || x.rows[0].op !== 1))}`);
    const gm = at(g, 100, 45);
    gm && gm.rows.slice(1).every((r) => r && r.h < r.full - 1)
      ? pass(`ย่อ${ACTIVE_GROUP}: แถวอื่นกำลังหุบ`)
      : fail(`ย่อ${ACTIVE_GROUP}: แถวอื่นไม่หุบ ${fmt(gm)}`);
    const ge = await snap(page, labels, ACTIVE_GROUP);
    ge.rows[0] && ge.rows.slice(1).every((r) => r === null)
      ? pass(`ย่อ${ACTIVE_GROUP}สุด: เหลือ "${ACTIVE}" แถวเดียว`)
      : fail(`ย่อ${ACTIVE_GROUP}สุด: ${fmt(ge.rows)}`);
    await toggle(page, ACTIVE_GROUP, labels, 900);

    // ── ลดการเคลื่อนไหว ──
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
      ? pass("จำลอง prefers-reduced-motion: reduce แล้ว")
      : fail("จำลอง prefers-reduced-motion ไม่ได้");
    const r1 = await toggle(page, ADMIN, present, 500);
    const firstOpen = r1.find((x) => x.rows.some(Boolean));
    const partial = r1.some((x) => x.rows.some((r) => r && (r.h < r.full - 0.5 || r.op < 1 || r.styled)));
    firstOpen && firstOpen.t < 50 && firstOpen.rows.every((r) => r && near(r.h, r.full) && r.op === 1) && !partial
      ? pass(`ลดการเคลื่อนไหว: กางทันที สูงเต็มตั้งแต่เฟรมแรก (${Math.round(firstOpen.t)} ms) ไม่มีเฟรมครึ่ง ๆ`)
      : fail(`ลดการเคลื่อนไหว: กางไม่ทันที ${fmt(firstOpen)} partial=${partial}`);
    const r2 = await toggle(page, ADMIN, present, 500);
    const gone = r2.find((x) => x.rows.every((r) => r === null));
    gone && gone.t < 50 && !r2.some((x) => x.rows.some((r) => r && (r.inert || r.styled)))
      ? pass(`ลดการเคลื่อนไหว: ย่อทันที รายการหายตั้งแต่เฟรมแรก (${Math.round(gone.t)} ms)`)
      : fail(`ลดการเคลื่อนไหว: ย่อไม่ทันที ${fmt(r2.slice(0, 3))}`);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // ── โหลดหน้าใหม่: ไม่มีการเคลื่อนไหวตอนสร้าง ──
    await page.reload({ waitUntil: "networkidle", timeout: 180000 });
    await page.waitForSelector("#side-menu", { timeout: 30000 });
    await page.waitForTimeout(2000);
    const ff2 = await page.evaluate(() => window.__firstFrames);
    ff2.seen >= 40 && ff2.moving === 0
      ? pass(`โหลดหน้าใหม่: เมนูวาดสภาพสุดท้ายเลย (${ff2.seen} เฟรมแรกไม่มีการเคลื่อนไหว)`)
      : fail(`โหลดหน้าใหม่แล้วเมนูเคลื่อนไหว ${fmt(ff2)}`);
    const rest = await snap(page, present, ADMIN);
    rest.rows.every((r) => r === null) && rest.digits ? pass("โหลดหน้าใหม่: กลุ่มที่ย่ออยู่ไม่มีรายการในหน้า") : fail(`โหลดหน้าใหม่: ${fmt(rest)}`);

    // ════ จอมือถือ — เมนูเลื่อนออก ════
    const mctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    await mctx.addInitScript(probe);
    const m = await mctx.newPage();
    await login(m);
    await m.waitForTimeout(4000);
    await m.getByLabel("เปิดเมนู").locator("visible=true").first().click();
    await m.waitForSelector("#side-menu", { timeout: 15000 });
    await m.waitForTimeout(1200);
    const mf = await m.evaluate(() => window.__firstFrames);
    mf.seen >= 40 && mf.moving === 0
      ? pass(`มือถือ: เปิดเมนูเลื่อนออกแล้วกลุ่มไม่เคลื่อนไหวเอง (${mf.seen} เฟรมแรก)`)
      : fail(`มือถือ: เปิดเมนูแล้วกลุ่มเคลื่อนไหว ${fmt(mf)}`);
    await checkOpen(m, "มือถือ:");
    await m.screenshot({ path: path.join(DIR, "side-menu-anim-3-phone.png") });
  } catch (e) {
    fail(String(e).slice(0, 500));
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
