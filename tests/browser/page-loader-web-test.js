// ทดสอบ: เครื่องซักผ้า "กำลังโหลด..." ตอนเปิดหน้าครั้งแรกอยู่กลางที่ว่างของหน้า ไม่ติดอยู่ใต้ชื่อหน้า
//   เจ้าของงานถาม (ต.ค. 69) ว่าทำไมเครื่องซักผ้าไม่อยู่กลางหน้า — ภาพจากจอคอมสูง เครื่องซักผ้าอยู่ใต้ "งานของฉันวันนี้" เลย
//   ข้างล่างว่างทั้งจอ (components/Spinner.tsx — Spinner page)
//
//   ทำ API ช้า 3.5 วิ แล้วเปิดหน้าจริงสี่ชุด: ช่าง T001 งานของฉัน · แอดมิน A001 งานของฉันวันนี้ + ใบงานซ่อม
//   ทั้งจอคอม 1366×768 (เมนูค้างซ้าย ไม่มีแท็บล่าง) และมือถือ 390×844 (แท็บล่าง · รายการใบงานแถบลอย)
//   ตัวเฝ้าในหน้าจดตำแหน่งเครื่องซักผ้าทุก 50 ms ตั้งแต่ก่อนมันโผล่จนหายไป แล้วตรวจ:
//   · ศูนย์กลาง (เครื่อง+ข้อความ) อยู่กลางที่ว่างระหว่าง "ของชิ้นล่างสุดที่อยู่เหนือมัน" ถึงขอบล่างที่มองเห็น (ล่างจอ หรือขอบบนแท็บล่าง)
//   · ห่างชื่อหน้าลงมามาก ไม่ใช่ติดข้างบน · อยู่กลางคอลัมน์เนื้อหา (กล่องเลื่อนของหน้า ข้างเมนูค้าง)
//   · ไม่กระโดด: ตั้งแต่เห็นครั้งแรกจนหาย ระยะจากของข้างบนไม่เปลี่ยน (หน้าใหม่เลื่อนขึ้น 8 px ตอนเปิด จึงเทียบกับของข้างบน ไม่ใช่ขอบจอ)
//   · แล้วหน้าโหลดเสร็จตามปกติ: ตัวโหลดหาย และสิ่งที่ขึ้นตรงกับที่ API ตอบมาจริง (มีใบ → เห็นใบ · ไม่มี → ข้อความว่าง)
//   วัดขอบล่าง/คอลัมน์จาก DOM เอง ไม่ใช้สูตรเดียวกับแอป ไม่งั้นแอปคำนวณผิดแบบเดียวกับเทสต์ก็ผ่าน
//
//   ไม่สร้างหรือแก้ข้อมูล — อ่านอย่างเดียว
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const LABEL = "กำลังโหลด...";
const DELAY = 3500;

// ตัวเฝ้าในหน้า — ติดตั้งก่อนแอปโหลด (addInitScript) จดทุก 50 ms ในเบราว์เซอร์เอง ไม่รอไป-กลับของ Playwright
function sampler(LABEL) {
  const pl = (window.__pl = { t0: performance.now(), samples: [] });
  const aboveBottom = (block) => {
    const top = block.getBoundingClientRect().top;
    for (let e = block; e && e !== document.body; e = e.parentElement) {
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) {
        const cs = getComputedStyle(s);
        if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed") continue;
        const r = s.getBoundingClientRect();
        if (r.height > 0 && r.width > 0 && r.bottom <= top + 1) return r.bottom;
      }
    }
    return 0;
  };
  // ขอบล่างที่มองเห็น = ขอบบนของแท็บล่าง ถ้ามีแท็บที่ติดล่างจอ ไม่งั้นล่างจอ
  const visibleBottom = () => {
    let vb = innerHeight;
    for (const tl of document.querySelectorAll('[role="tablist"]')) {
      const r = tl.getBoundingClientRect();
      if (!r.height || r.bottom < innerHeight - 120) continue;
      let bar = tl;
      while (bar.parentElement) {
        const pr = bar.parentElement.getBoundingClientRect();
        if (pr.height > 160 || pr.width < innerWidth - 2) break;
        bar = bar.parentElement;
      }
      vb = Math.min(vb, bar.getBoundingClientRect().top);
    }
    return vb;
  };
  const scrollBox = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll") return p.getBoundingClientRect();
    }
    return { left: 0, right: innerWidth };
  };
  const find = () => {
    const hits = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.data !== LABEL) continue;
      const label = n.parentElement;
      const washer = label && label.previousElementSibling;
      const block = label && label.parentElement && label.parentElement.parentElement;
      if (!washer || !block) continue;
      const wr = washer.getBoundingClientRect();
      if (wr.width < 50 || wr.height < 60) continue; // ตัวใหญ่กลางหน้าเท่านั้น
      let op = 1;
      for (let e = label; e && e !== document.documentElement; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
      hits.push({ label, washer, block, wr, op });
    }
    return hits.sort((a, b) => b.op - a.op)[0] || null;
  };
  setInterval(() => {
    const t = Math.round(performance.now() - pl.t0);
    const h = find();
    if (!h) return pl.samples.push({ t, seen: false });
    const lr = h.label.getBoundingClientRect();
    const col = scrollBox(h.block);
    pl.samples.push({
      t,
      seen: true,
      op: Math.round(h.op * 100) / 100,
      wTop: h.wr.top,
      wBottom: h.wr.bottom,
      wCx: h.wr.left + h.wr.width / 2,
      lBottom: lr.bottom,
      above: aboveBottom(h.block),
      vb: visibleBottom(),
      colL: col.left,
      colR: col.right,
      vw: innerWidth,
      vh: innerHeight,
    });
  }, 50);
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });

  const VIEWS = [
    { name: "จอคอม", tag: "desk", viewport: { width: 1366, height: 768 } },
    { name: "มือถือ", tag: "phone", viewport: { width: 390, height: 844 } },
  ];

  try {
    for (const view of VIEWS) {
      for (const who of ["T001", "A001"]) {
        const ctx = await browser.newContext({ viewport: view.viewport });
        await ctx.addInitScript(sampler, LABEL);
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");

        // คำขอข้อมูลหลักของหน้าทั้งสาม — ส่งต่อไปเซิร์ฟเวอร์จริงทันที แต่ถือคำตอบไว้ DELAY ms แล้วจดว่าตอบอะไร
        const answers = [];
        const slow = (u) => u.pathname === "/api/work-orders" || u.pathname === "/api/work-orders/my-day";
        await page.route(slow, async (route) => {
          let resp;
          try {
            resp = await route.fetch();
          } catch {
            return route.abort().catch(() => {});
          }
          const u = new URL(route.request().url());
          const body = await resp.json().catch(() => null);
          answers.push({ path: u.pathname, status: resp.status(), inbox: u.searchParams.get("status") === "INBOX", rows: Array.isArray(body?.rows) ? body.rows.length : null });
          await new Promise((x) => setTimeout(x, DELAY));
          await route.fulfill({ response: resp }).catch(() => {});
        });

        await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
        await page.getByPlaceholder("รหัสพนักงาน").fill(who);
        await page.getByPlaceholder("รหัสผ่าน").fill("test1234");

        const reset = () => page.evaluate(() => { window.__pl.samples = []; window.__pl.t0 = performance.now(); });
        const samples = () => page.evaluate(() => window.__pl.samples);

        /**
         * เปิดหน้าแล้วเฝ้าตัวโหลดจนหาย — คืนค่าตัวอย่างที่เห็นตัวโหลด
         * title = ชื่อหน้าที่ต้องอยู่เหนือเครื่องซักผ้าไกล ๆ · loaded = ตรวจหน้าหลังโหลดเสร็จ
         */
        const check = async (label, open, title, loaded) => {
          const name = `${view.name} ${who} ${label}`;
          const nAnswers = answers.length;
          await reset();
          await open();
          // รอเห็นตัวโหลดเต็มตา (ไม่จาง) — ตัวเลขข้างล่างวัดตอนนั้น ไม่ใช่ตอนกำลังจางเข้า
          let S = [];
          for (let i = 0; i < 60; i++) {
            S = await samples();
            if (S.some((s) => s.seen && s.op >= 0.99)) break;
            await page.waitForTimeout(200);
          }
          const full = S.filter((s) => s.seen && s.op >= 0.99);
          if (!full.length) {
            fail(`${name}: ไม่เห็นเครื่องซักผ้า "${LABEL}" ตอนโหลดช้า (เห็น ${S.filter((s) => s.seen).length} จังหวะ ความชัดสูงสุด ${Math.max(0, ...S.filter((s) => s.seen).map((s) => s.op))})`);
            return false;
          }
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(DIR, `page-loader-${view.tag}-${who}-${label === "ใบงานซ่อม" ? "list" : "home"}.png`) });
          // ชื่อหน้า — ตัวที่อยู่ในคอลัมน์เนื้อหา (เมนูข้างก็มีคำเดียวกัน) และอยู่เหนือเครื่องซักผ้า
          const s0 = (await samples()).filter((s) => s.seen && s.op >= 0.99).pop() || full[full.length - 1];
          let titleBottom = null;
          for (const bb of await Promise.all((await vis(title).all()).map((l) => l.boundingBox()))) {
            if (bb && bb.x >= s0.colL - 1 && bb.y + bb.height <= s0.wTop) titleBottom = Math.max(titleBottom ?? 0, bb.y + bb.height);
          }

          // เฝ้าจนตัวโหลดหายไปอย่างน้อย 0.5 วิ
          let gone = false;
          for (let i = 0; i < 100 && !gone; i++) {
            await page.waitForTimeout(200);
            S = await samples();
            const lastSeen = S.map((s) => s.seen).lastIndexOf(true);
            gone = lastSeen >= 0 && S.length - 1 - lastSeen >= 10;
          }
          const shown = S.filter((s) => s.seen && s.op > 0.05);
          const last = shown.filter((s) => s.op >= 0.99).pop();

          // กลางที่ว่าง — ศูนย์กลางของเครื่อง+ข้อความ และตัวเครื่องเอง (เครื่องอยู่สูงกว่าศูนย์กลางกลุ่มราว 19 px เพราะข้อความอยู่ใต้)
          const free = last.vb - last.above;
          const mid = (last.above + last.vb) / 2;
          const group = (last.wTop + last.lBottom) / 2;
          const slack = free - (last.lBottom - last.wTop);
          const r = (n) => Math.round(n);
          const geo = `ของข้างบนจบที่ y=${r(last.above)} · ขอบล่างที่เห็น y=${r(last.vb)} · เครื่อง y=${r(last.wTop)}–${r(last.wBottom)} · ข้อความจบ y=${r(last.lBottom)}`;
          Math.abs(group - mid) <= Math.max(20, free * 0.05)
            ? pass(`${name}: เครื่องซักผ้า+ข้อความอยู่กลางที่ว่าง (ห่างกลาง ${r(group - mid)} px · ${geo})`)
            : fail(`${name}: ไม่อยู่กลางที่ว่าง — ศูนย์กลาง y=${r(group)} กลางที่ว่าง y=${r(mid)} · ${geo}`);
          const wMid = (last.wTop + last.wBottom) / 2;
          Math.abs(wMid - mid) <= Math.max(40, free * 0.08)
            ? pass(`${name}: ตัวเครื่องซักผ้าอยู่ใกล้กลางที่ว่าง (ห่าง ${r(wMid - mid)} px)`)
            : fail(`${name}: ตัวเครื่องซักผ้าห่างกลางที่ว่าง ${r(wMid - mid)} px · ${geo}`);
          last.wTop - last.above >= Math.max(40, slack * 0.3)
            ? pass(`${name}: ไม่ติดข้างบน — เว้นจากของข้างบน ${r(last.wTop - last.above)} px จากที่ว่างเหลือ ${r(slack)} px`)
            : fail(`${name}: เครื่องซักผ้ายังติดข้างบน (เว้นแค่ ${r(last.wTop - last.above)} px จากที่ว่างเหลือ ${r(slack)} px)`);
          if (titleBottom === null) fail(`${name}: หาชื่อหน้า "${title}" เหนือเครื่องซักผ้าไม่เจอ`);
          else
            last.wTop - titleBottom >= 100
              ? pass(`${name}: อยู่ใต้ชื่อหน้า "${title}" ลงมา ${r(last.wTop - titleBottom)} px`)
              : fail(`${name}: ใกล้ชื่อหน้า "${title}" เกิน — ห่างแค่ ${r(last.wTop - titleBottom)} px`);
          const colCx = (last.colL + last.colR) / 2;
          Math.abs(last.wCx - colCx) <= 12
            ? pass(`${name}: อยู่กลางคอลัมน์เนื้อหาแนวนอน (คอลัมน์ x=${r(last.colL)}–${r(last.colR)} · ห่างกลาง ${r(last.wCx - colCx)} px)`)
            : fail(`${name}: ไม่อยู่กลางคอลัมน์ — เครื่องกลางที่ x=${r(last.wCx)} คอลัมน์กลางที่ x=${r(colCx)}`);

          // ไม่กระโดด — ตั้งแต่เห็นครั้งแรก (แม้ยังจางอยู่) ระยะจากของข้างบนต้องเท่าเดิม
          const offs = shown.map((s) => s.wTop - s.above);
          const spread = Math.max(...offs) - Math.min(...offs);
          spread <= 2
            ? pass(`${name}: ไม่กระโดดระหว่างโหลด (${shown.length} จังหวะที่เห็น ระยะจากของข้างบนต่างกันไม่เกิน ${r(spread)} px)`)
            : fail(`${name}: เครื่องซักผ้ากระโดด ${r(spread)} px ระหว่างที่เห็น: ${JSON.stringify(shown.slice(0, 3).map((s) => ({ t: s.t, op: s.op, off: r(s.wTop - s.above) })))}`);

          // โหลดเสร็จตามปกติ — ตัวโหลดหาย คำขอช้าตอบ 200 และสิ่งที่ขึ้นตรงกับข้อมูลที่ตอบมา
          if (!gone) return fail(`${name}: ผ่านไป 20 วิ ตัวโหลดยังไม่หาย`), false;
          const mine = answers.slice(nAnswers);
          const bad = mine.find((a) => a.status !== 200);
          if (!mine.length) fail(`${name}: ไม่เห็นคำขอข้อมูลของหน้าเลย — เทสต์ไม่ได้ทำให้หน้านี้ช้าจริง`);
          else if (bad) fail(`${name}: เซิร์ฟเวอร์ตอบ ${bad.status} ที่ ${bad.path}`);
          else await loaded(mine, name);
          const oops = await page.getByText(/โหลดข้อมูลไม่สำเร็จ|เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/).locator("visible=true").count();
          if (oops) fail(`${name}: หน้าขึ้นข้อความโหลดไม่สำเร็จ`);
          return true;
        };

        const either = async (name, okText, hasRows, rowsVisible, emptyTexts) => {
          if (hasRows) {
            const n = await rowsVisible();
            n > 0 ? pass(`${name}: โหลดเสร็จ ${okText} ${n} รายการ ตรงกับที่ API ตอบว่ามีข้อมูล`) : fail(`${name}: API ตอบว่ามีข้อมูลแต่หน้าไม่ขึ้นสักรายการ`);
          } else {
            let seen = null;
            for (const t of emptyTexts) if (await vis(t).count()) seen = t;
            seen ? pass(`${name}: โหลดเสร็จ ไม่มีข้อมูล ขึ้น "${seen}" ตรงกับที่ API ตอบ`) : fail(`${name}: API ตอบว่าไม่มีข้อมูลแต่ไม่เห็นข้อความว่าง ${JSON.stringify(emptyTexts)}`);
          }
        };

        const login = () => vis("เข้าสู่ระบบ").last().click();
        if (who === "T001") {
          // ช่าง: เปิดแอปมาที่งานของฉัน (TechJobs) — แท็บ "วันนี้" ว่าง = ข้อความว่าง · มีงาน = การ์ด "งาน WO-…"
          await check("งานของฉัน", login, "งานของฉัน", async (mine, name) => {
            const seg = await page.getByLabel(/^แท็บ วันนี้ \d+ งาน$/).first().getAttribute("aria-label").catch(() => null);
            const today = seg ? Number(seg.match(/(\d+) งาน$/)[1]) : null;
            if (today === null) return fail(`${name}: ไม่เห็นแท็บ "วันนี้" หลังโหลดเสร็จ`);
            const rows = mine.find((a) => a.path.endsWith("/my-day"))?.rows ?? 0;
            if (today > 0 && rows === 0) return fail(`${name}: แท็บบอก ${today} งาน แต่ API ตอบว่าไม่มีงาน`);
            await either(name, "การ์ดงาน", today > 0, () => page.locator('[aria-label^="งาน "]').locator("visible=true").count(), ["วันนี้ยังไม่มีงานที่ปล่อยให้ทีม"]);
          });
        } else {
          // แอดมิน: เปิดแอปมาที่งานของฉันวันนี้ (MyQueue = ใบที่รอแอดมิน · ภาพที่เจ้าของงานส่งมา)
          await check("งานของฉันวันนี้", login, view.tag === "desk" ? "งานของฉันวันนี้" : "งานของฉัน", async (mine, name) => {
            const inbox = mine.find((a) => a.inbox);
            if (!inbox) return fail(`${name}: ไม่เห็นคำขอกล่องงาน (status=INBOX)`);
            await either(name, "กลุ่มใบงาน", inbox.rows > 0, () => page.locator('[aria-label^="กลุ่ม "]').locator("visible=true").count(), ["ไม่มีงานค้างรอคุณ"]);
          });
          // แล้วไปใบงานซ่อม — จอคอมกดเมนูข้าง · มือถือกดแท็บล่าง "ใบงาน" (หน้ารายการโหมดแถบลอย)
          const openList = view.tag === "desk"
            ? () => page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click()
            : () => vis("ใบงาน").last().click();
          await check("ใบงานซ่อม", openList, "ใบงานซ่อม", async (mine, name) => {
            const list = mine.find((a) => !a.inbox && a.path === "/api/work-orders");
            if (!list) return fail(`${name}: ไม่เห็นคำขอรายการใบงาน`);
            await either(name, "ใบงานที่เห็นรหัส", list.rows > 0, () => page.getByText(/^WO-\d+/).locator("visible=true").count(), ["ไม่มีใบงานในหมวดนี้", "ไม่มีใบงานตามตัวกรองนี้"]);
          });
        }
        errors.length ? fail(`${view.name} ${who}: error บนหน้า: ${errors[0]}`) : pass(`${view.name} ${who}: ไม่มี error บนหน้า`);
        await ctx.close();
      }
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    await browser.close();
  }
})();
