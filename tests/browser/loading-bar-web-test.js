// ทดสอบ: แถบกำลังโหลดบาง 3 px บนสุดของจอ — เติมจากซ้ายไปขวาครั้งเดียวจนสุด (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง)
//   เดิมเป็นขีดวิ่งวนไปมา (และก่อนหน้านั้นค้างนิ่งเพราะ keyframes ถูกทิ้ง) · เทสต์นี้ทำให้ API ช้า 6 วิ แล้ววัดแถบตลอดการรอ:
//   ขึ้นหลัง 0.3 วิ · ติดซ้ายเสมอ · ไม่มี animation วนซ้ำ · ยาวขึ้นเรื่อย ๆ ไม่หดกลับ แต่ไม่เต็มระหว่างรอ · โหลดเสร็จเติมเต็มแล้วหาย
//   ป้าย "กำลังโหลดข้อมูล…" ล่างกลางจอเอาออกแล้ว (เจ้าของงานขอ ต.ค. 69 — ซ้ำกับเครื่องซักผ้า "กำลังโหลด..." ของหน้าเอง ดูรก)
//   จึงเฝ้าทั้งหน้าตลอดการรอด้วยสองทาง (MutationObserver จับทุกครั้งที่มีโหนดเพิ่ม + ไล่ข้อความทุก 0.1 วิ) ว่าไม่มีข้อความนี้โผล่เลย
//   และลองใส่ข้อความนี้เองก่อนเริ่ม ให้แน่ใจว่าตัวเฝ้าจับได้จริง — ไม่งั้นเทสต์ "ไม่มีป้าย" ผ่านได้แม้ตัวเฝ้าเสีย
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const PILL = "กำลังโหลดข้อมูล"; // ไม่ใส่ "…" — ป้ายกลับมาแบบ "..." ก็ต้องจับได้

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").last().click();
    await page.waitForTimeout(4000);

    // ตัวเฝ้าในหน้า — วัดแถบทุก 0.1 วิในเบราว์เซอร์เอง (ไม่รอไป-กลับของ Playwright) และจดทุกครั้งที่เห็นข้อความป้าย
    await page.evaluate((PILL) => {
      const textHit = (root) => {
        if (root.nodeType === Node.TEXT_NODE) return root.data.includes(PILL) ? root.data : null;
        if (root.nodeType !== Node.ELEMENT_NODE) return null;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode?.nodeName || "") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.includes(PILL)) return n.data;
        return null;
      };
      const lb = (window.__lb = { t0: performance.now(), samples: [], obsHits: [], pollHits: [] });
      lb.obs = new MutationObserver((ms) => {
        for (const m of ms) {
          const hit = m.type === "characterData" ? textHit(m.target) : [...m.addedNodes].map(textHit).find(Boolean);
          if (hit) lb.obsHits.push(hit);
        }
      });
      lb.obs.observe(document.body, { subtree: true, childList: true, characterData: true });
      lb.timer = setInterval(() => {
        const t = Math.round(performance.now() - lb.t0);
        const hit = textHit(document.body);
        if (hit) lb.pollHits.push(hit);
        const bar = document.querySelector('[aria-label="กำลังโหลดข้อมูล"]')?.firstElementChild;
        if (!bar) return lb.samples.push({ t, bar: false });
        const r = bar.getBoundingClientRect();
        lb.samples.push({ t, bar: true, x: Math.round(r.x), w: Math.round(r.width), vw: window.innerWidth, anim: getComputedStyle(bar).animationName });
      }, 100);
    }, PILL);
    const lbState = () => page.evaluate(() => window.__lb && { samples: window.__lb.samples, obsHits: window.__lb.obsHits, pollHits: window.__lb.pollHits });

    // ลองตัวเฝ้าก่อน: ใส่ข้อความป้ายเองชั่วคราว ทั้งสองทางต้องจับได้ แล้วล้างทิ้ง
    await page.evaluate((PILL) => {
      const d = document.createElement("div");
      d.id = "__lb_canary";
      d.textContent = PILL + "…";
      document.body.appendChild(d);
    }, PILL);
    await page.waitForTimeout(350);
    const canary = await lbState();
    await page.evaluate(() => document.getElementById("__lb_canary")?.remove());
    await page.waitForTimeout(250);
    canary && canary.obsHits.length > 0 && canary.pollHits.length > 0
      ? pass("ตัวเฝ้าข้อความป้ายใช้ได้จริง (ใส่ข้อความเองแล้วจับได้ทั้งสองทาง)")
      : fail(`ตัวเฝ้าข้อความป้ายจับไม่ได้ — เทสต์ "ไม่มีป้าย" ข้างล่างเชื่อไม่ได้: ${JSON.stringify(canary && { obs: canary.obsHits.length, poll: canary.pollHits.length })}`);

    // อ่านรายการใบงานช้า 6 วิ — นานพอให้แถบขึ้น (ขึ้นเมื่ออ่านนานเกิน 300 ms)
    await page.route("**/api/work-orders**", async (r) => {
      await new Promise((x) => setTimeout(x, 6000));
      r.continue().catch(() => {});
    });
    // เริ่มนับเวลาใหม่ตรงก่อนกด และจดว่าตอนนั้นไม่มีแถบค้างจากการอ่านก่อนหน้า (ไม่งั้นวัดจังหวะ 0.3 วิไม่ได้)
    const barAtStart = await page.evaluate(() => {
      const lb = window.__lb;
      lb.samples = [];
      lb.obsHits = [];
      lb.pollHits = [];
      lb.t0 = performance.now();
      return !!document.querySelector('[aria-label="กำลังโหลดข้อมูล"]');
    });
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(900);
    // ทั้งจอ ไม่ใช่แค่แถบบน — ให้คนเปิดดูเห็นว่าล่างจอไม่มีป้ายแล้ว
    await page.screenshot({ path: path.join(DIR, "loading-bar-1.png") });

    // เฝ้าจนแถบเติมเต็มแล้วหาย (ราว 6–7 วิ) แล้วเฝ้าต่ออีกครู่ — ช่วงที่ไม่มีป้ายต้องครอบทั้งการรอ ไม่ใช่แค่บางจังหวะ
    const isFull = (s) => s.bar && s.w >= s.vw * 0.98;
    let st = null;
    for (let i = 0; i < 75; i++) {
      st = await lbState();
      if (!st) break;
      const iFull = st.samples.findIndex(isFull);
      if (iFull >= 0 && st.samples.slice(iFull).some((s) => !s.bar)) break;
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);
    st = await lbState();
    await page.evaluate(() => {
      if (!window.__lb) return;
      clearInterval(window.__lb.timer);
      window.__lb.obs.disconnect();
    });
    if (!st) throw new Error("ตัวเฝ้าหายระหว่างทาง (หน้าโหลดใหม่ทั้งหน้า?) — วัดอะไรต่อไม่ได้");

    const S = st.samples;
    const iFull = S.findIndex(isFull);
    const waiting = (iFull >= 0 ? S.slice(0, iFull) : S).filter((s) => s.bar);
    const first = waiting[0];
    first ? pass(`อ่านช้า → แถบกำลังโหลดขึ้น (เห็นที่ ${first.t} ms หลังกด)`) : fail("แถบกำลังโหลดไม่ขึ้น");
    if (barAtStart) console.log("SKIP วัดจังหวะ 0.3 วิไม่ได้ — ตอนกดมีแถบจากการอ่านก่อนหน้าค้างอยู่");
    else if (first) first.t >= 280 ? pass("แถบไม่ขึ้นทันที รอเกิน 0.3 วิก่อน") : fail(`แถบขึ้นเร็วเกิน: ${first.t} ms หลังกด`);
    waiting.length && waiting.every((s) => s.x === 0)
      ? pass("แถบติดซ้ายเสมอ (ไม่ใช่ขีดลอยวิ่ง)")
      : fail(`ตำแหน่งแถบ: ${JSON.stringify(waiting.filter((s) => s.x !== 0).slice(0, 3))}`);
    waiting.length && waiting.every((s) => s.anim === "none")
      ? pass("ไม่มี animation วนซ้ำ")
      : fail(`ยังมี animation: ${JSON.stringify(waiting.find((s) => s.anim !== "none"))}`);
    // ระหว่างรอ = ก่อนคำขอช้าตอบ (6 วิ) — เผื่อไว้ 0.2 วิ
    const a = waiting.find((s) => s.t >= 900);
    const b = a && waiting.find((s) => s.t >= a.t + 1800 && s.t < 5800);
    a && b && b.w > a.w && b.w < b.vw * 0.95
      ? pass(`ระหว่างรอแถบยาวขึ้นแต่ยังไม่เต็ม (${a.w} → ${b.w} จาก ${b.vw} px)`)
      : fail(`ความยาวแถบระหว่างรอ: ${JSON.stringify([a, b])}`);
    const back = waiting.findIndex((s, i) => i > 0 && s.w < waiting[i - 1].w - 1);
    waiting.length > 1 && back < 0
      ? pass(`ระหว่างรอแถบไม่หดกลับเลย (${waiting.length} จังหวะ)`)
      : fail(`แถบหดกลับระหว่างรอ: ${JSON.stringify(waiting.slice(Math.max(0, back - 1), back + 1))}`);
    iFull >= 0 ? pass("โหลดเสร็จแล้วแถบเติมจนสุด") : fail("โหลดเสร็จแต่แถบไม่เติมจนสุด");
    const gone = iFull >= 0 ? S.slice(iFull).find((s) => !s.bar) : null;
    gone && gone.t - S[iFull].t <= 1500
      ? pass(`เติมสุดแล้วแถบหายไป (${gone.t - S[iFull].t} ms หลังเต็ม)`)
      : fail(`โหลดเสร็จแล้วแถบยังค้าง: ${JSON.stringify({ full: S[iFull], gone })}`);

    // ไม่มีป้าย — ต้องเฝ้าได้ครอบทั้งการรอจริง (นับจังหวะที่แถบขึ้น) ไม่งั้น "ไม่เจอ" ไม่มีความหมาย
    const watchedWithBar = S.filter((s) => s.bar).length;
    const hits = [...st.obsHits, ...st.pollHits];
    if (watchedWithBar < 30) fail(`เฝ้าระหว่างที่แถบขึ้นได้แค่ ${watchedWithBar} จังหวะ — น้อยเกินจะบอกว่าไม่มีป้าย`);
    else if (hits.length) fail(`ป้าย "${PILL}…" กลับมา: ${JSON.stringify(hits.slice(0, 3))} (เจอ ${hits.length} ครั้ง)`);
    else pass(`ตลอดการรอไม่มีป้าย "${PILL}…" เลย (เฝ้า ${S.length} จังหวะ แถบขึ้น ${watchedWithBar} จังหวะ + ทุกโหนดที่เพิ่มเข้าหน้า)`);
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
