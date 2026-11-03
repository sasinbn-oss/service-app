// ทดสอบ: สอนการใช้งานในแอป (กล่องชี้ปุ่มจริง · ข้าม / ย้อนกลับ / ถัดไป — เจ้าของงานเลือก ต.ค. 69) ผ่านหน้าเว็บ
//
// ส่วนที่มีตอนนี้ (ก้อน 2 — ตัวเครื่อง + ปุ่ม ? + ช่าง "งานของฉันวันนี้") มือถือ 390×844 จอสัมผัส:
//   · กด ? บนแถบหัว → กล่อง 1/7 ชี้แถบแท็บ (ฐานข้อมูลยังไม่จดอะไรตอนเริ่ม)
//   · นิ้วแตะแท็บ "พรุ่งนี้" ใต้พื้นมืด → แท็บไม่เปลี่ยน (aria-selected) · Tab 15 ครั้ง / Shift+Tab 5 ครั้ง โฟกัสอยู่ในกล่องทุกครั้ง
//   · ลากลงบนพื้นมืด → ไม่รีเฟรช (ไม่มีคำขอ my-day · วงลากรีเฟรชไม่โผล่)
//   · ขั้น 2–4 ชี้การ์ด/ถึงหน้างาน/ปิดงานจริง (มีงานจริงให้ชี้ ไม่ใช่การ์ดตัวอย่าง)
//   · ขั้น 5 ลองกด: "ถัดไป" กดไม่ได้จนแตะรู → เมนูเปิด → กดได้ · ย้อนกลับไปขั้น 4 เมนูปิดคืนและปุ่มปิดงานโผล่
//   · ขั้น 6 เป็นแผ่นขอบล่าง (ล่างสุดชิดจอ กว้างเต็มจอ) · ขั้น 7 กางกลุ่ม "รถ" ให้เห็น แต่ไม่เขียนลงเครื่อง
//   · เข้าใจแล้ว → เมนูปิด · แถบข้อความ "ดูวิธีใช้อีกครั้ง กดปุ่ม ? ข้างปุ่มรีเฟรช" · ฐานข้อมูลจด tours."tech.myday" · ไม่เหลือ inert
//   · ชั้นของกล่องอยู่ใน <body> เหนือ Modal (9999) ใต้ชั้นแจ้งผล/ยืนยัน
//   · เล่นใหม่แล้วกด Esc → กล่องหาย · แถบ "ข้ามแล้ว · …" · ฐานข้อมูลไม่เปลี่ยน · ไม่เหลือ inert
//   · กรอบที่วาดล้อมปุ่มจริงทุกขั้นที่ชี้ · โหมดมืดใช้สีธีม
// หน้า "สอนการใช้งาน" (ก้อน 3):
//   · ปุ่ม ? ของหน้าที่ไม่มีวิธีใช้ (ลงทะเบียนใช้รถ) → หน้าสอนการใช้งานซ้อนหน้าเดิม · "ดูแล้ว x จาก n" ตรงฐานข้อมูล · ไม่มี ? ในหน้านี้
//   · "ดูอีกครั้ง" → ไปหน้างานของฉันแล้วเริ่มขั้น 1 · จอคอม: ปุ่มมีชื่อ · ชื่อหน้าตัวใหญ่ · 6 ขั้น
//   · แอดมินจอแคบ: ไม่มี ? บนแถบหัว · แถว "วิธีใช้หน้านี้" ในเมนูข้าง (กดแล้วเมนูปิด)
//   · ทีม Area (บัญชีใหม่ pending): ไม่มีกล่องขึ้นเอง · ปุ่ม ? และเมนูพาไปหน้า "ยังไม่มีวิธีใช้สำหรับตำแหน่งนี้" · ฐานข้อมูลไม่ถูกเขียน
// ก้อนถัดไปเพิ่มในไฟล์นี้: กล่องต้อนรับ/ข้อความแนะนำ · ดูในฐานะ · จอคอมของแอดมิน · ให้ดูวิธีใช้ใหม่
//
// สร้างผู้ใช้ zzht.tech (ช่างทีมของ C0006) · zzht.area (Area) ด้วย SQL + ใบงานสองใบของทีมนั้นวันนี้ (ใบหนึ่งถึงหน้างานแล้ว) แล้วลบทั้งหมดตอนจบ
// หน้าในไฟล์นี้ปิดกล่องที่ขึ้นเอง (otteri-howto-auto=off) ยกเว้นส่วนที่ตรวจว่า "ไม่ขึ้น" (ทีม Area)
// ต้องมี DATABASE_URL · ยืนยันผลที่ฐานข้อมูล (CLAUDE.md)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

const APP = "http://localhost:8081";
const TECH = "zzht.tech";
// ค่าตั้งต้นของแอปเอง (SideMenu) — หน้าใหม่ไม่มีคีย์นี้เลย (แอปเขียนตอนกดหัวกลุ่มเท่านั้น) ต้องรู้ค่าตั้งต้นจึงเช็คได้ว่ากางชั่วคราวไม่ถูกเขียนลง
const GROUPS_SEED = JSON.stringify(["หน้างาน", "รถ", "เอกสารและบัญชี", "ผู้ดูแลระบบ"]);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const users = `select id from "User" where "employeeCode" like 'zzht.%'`;
  async function cleanup() {
    if (fx) await fx.cleanup().catch(() => {});
    fx?.sql(`delete from "BranchCheckIn" where "userId" in (${users});
             delete from "ViewAsLog" where "targetUserId" in (${users}) or "byUserId" in (${users});
             delete from "User" where id in (${users})`);
  }

  /** auto = ไม่ปิดกล่องที่ขึ้นเอง (ส่วนที่ตรวจว่ากล่องต้อนรับ/ข้อความแนะนำ "ไม่ขึ้น") · จอกว้างไม่ใช่จอสัมผัส */
  async function open(code, { width = 390, height = 844, auto = false } = {}) {
    const touch = width < 640;
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    await page.addInitScript(([seed, off]) => {
      try {
        localStorage.setItem("otteri-side-groups", seed);
        if (off) localStorage.setItem("otteri-howto-auto", "off");
      } catch {}
    }, [GROUPS_SEED, !auto]);
    page.on("pageerror", (e) => errors.push(`${code}: ${e}`));
    await page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(4000);
    return { ctx, page };
  }

  try {
    fx = await setup();
    const { sql, call } = fx;
    cleanupStale(sql, users);
    const team = sql(`select zone from "Branch" where code='C0006'`);
    sql(`insert into "User"("employeeCode",name,role,team,"passwordHash","howtoSeen")
         select '${TECH}','ช่างทดสอบวิธีใช้','EMPLOYEE','${team}',"passwordHash",'{"pending": true}'::jsonb from "User" where "employeeCode"='A001'`);
    const T = await fx.login(TECH);

    // งานวันนี้สองใบของทีม C0006 — วันนี้ปิดนัดเสมอ แอดมินแก้เป็นงานด่วนให้วันนี้ก่อน (แบบเดียวกับ field-flow-web-test)
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const release = async (time) => {
      const o = await fx.workOrder("C0006", null);
      const S = fx.supervisor();
      await call(fx.A, "POST", `/work-orders/${o.id}/urgent-release`, { day: today });
      await call(S, "POST", `/work-orders/${o.id}/parts`, { needsParts: false, assign: { team, scheduledAt: today, scheduledTime: time } });
      await call(fx.A, "POST", `/work-orders/${o.id}/confirm-appointment`, {});
      await call(S, "POST", `/work-orders/${o.id}/dispatch`, {});
      return o;
    };
    const arrivedJob = await release("08:30");
    const freshJob = await release("10:30");
    await call(T, "POST", `/work-orders/${arrivedJob.id}/arrive`, {});
    const ready = sql(`select string_agg(status, ',' order by id) from "WorkOrder" where id in (${arrivedJob.id},${freshJob.id})`);
    const arrivedLog = sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${arrivedJob.id} and action='ARRIVED'`);
    ready === "IN_PROGRESS,IN_PROGRESS" && arrivedLog === "1"
      ? pass("เตรียม (ฐานข้อมูล): สองใบปล่อยให้ทีมวันนี้ · ใบแรกถึงหน้างานแล้ว")
      : fail(`เตรียมใบไม่ครบ: ${ready} · ถึงหน้างาน ${arrivedLog}`);

    // ── มือถือ: ช่าง "งานของฉันวันนี้" เริ่มด้วยปุ่ม ? ──
    const { ctx, page } = await open(TECH);
    const host = page.locator("[data-howto-tour]");
    const box = page.locator('[data-otteri-howto] [role="dialog"]');
    const inBox = (label) => box.locator(`[aria-label="${label}"]`);
    const attr = (name) => host.getAttribute(name).catch(() => null);
    /** รอจนขั้น n ขึ้นจอ (หาปุ่มเจอแล้ว หรือขึ้นกลางจอ) — คืนสถานะเป้า found/center */
    const waitStep = async (n, ms = 9000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const step = await attr("data-howto-step");
        const target = await attr("data-howto-target");
        if (step === String(n) && target && target !== "seek" && (await box.count())) {
          await page.waitForTimeout(250); // จางเข้า 150 ms
          return target;
        }
        await page.waitForTimeout(150);
      }
      return `ไม่ขึ้น (ขั้น ${await attr("data-howto-step")} · ${await attr("data-howto-target")})`;
    };
    const tapCenter = async (loc) => {
      const b = await loc.boundingBox();
      if (!b) return false;
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      return true;
    };
    /**
     * กรอบที่วาดล้อมปุ่มของขั้นนี้จริงไหม — "หาเจอ" (data-howto-target=found) บอกแค่ว่าเจอชื่อ ไม่ได้บอกว่าวาดถูกที่
     * เทียบกรอบ (data-howto-ring) กับปุ่มที่มองเห็นตัวแรกของชื่อนั้น: ปุ่มต้องอยู่ในกรอบทั้งตัว และอยู่ในจอ
     */
    const ringHolds = async (id) => {
      const ring = await page.locator("[data-howto-ring]").boundingBox().catch(() => null);
      const els = page.locator(`[data-testid="howto-${id}"]`).locator("visible=true");
      const vp = page.viewportSize();
      for (let k = 0; k < (await els.count()); k++) {
        const b = await els.nth(k).boundingBox();
        if (!ring || !b || b.y < 0 || b.y + b.height > vp.height) continue;
        if (b.x >= ring.x - 1 && b.y >= ring.y - 1 && b.x + b.width <= ring.x + ring.width + 1 && b.y + b.height <= ring.y + ring.height + 1) return true;
      }
      return false;
    };
    const inertCount = () => page.evaluate(() => document.querySelectorAll("[inert]").length);
    const seenAt = () => sql(`select coalesce("howtoSeen"->'tours'->>'tech.myday','') from "User" where "employeeCode"='${TECH}'`);
    const myDayReads = [];
    page.on("request", (r) => {
      if (r.method() === "GET" && r.url().includes("/work-orders/my-day")) myDayReads.push(Date.now());
    });

    (await page.getByText(arrivedJob.code, { exact: false }).locator("visible=true").count())
      ? pass("ช่างเห็นงานของทีมวันนี้บนงานของฉัน") : fail("ไม่เห็นงานที่เตรียมไว้");
    const help = page.locator('[aria-label="วิธีใช้หน้านี้"]').locator("visible=true");
    (await help.count()) === 1 ? pass('ปุ่ม "วิธีใช้หน้านี้" (?) อยู่บนแถบหัวของงานของฉัน') : fail(`ปุ่ม ? บนแถบหัว: ${await help.count()} ปุ่ม`);
    await help.first().click();
    const t1 = await waitStep(1);
    const counter1 = await box.getByText("1/7", { exact: true }).count();
    t1 === "found" && counter1 === 1 && (await attr("data-howto-total")) === "7" && (await attr("data-howto-tour")) === "tech.myday" && (await ringHolds("myday.tabs"))
      ? pass("กด ? → กล่องขั้น 1/7 กรอบล้อมแถบแท็บ (มือถือ 7 ขั้น)") : fail(`ขั้น 1: ${t1} · 1/7=${counter1} · total=${await attr("data-howto-total")} · กรอบล้อมแท็บ ${await ringHolds("myday.tabs")}`);
    (await box.getByText("งานของฉัน", { exact: true }).count()) === 1 ? pass('หัวข้อขั้น 1 "งานของฉัน"') : fail("หัวข้อขั้น 1 ไม่ตรง");
    seenAt() === "" ? pass("เริ่มดูยังไม่จดอะไรในฐานข้อมูล") : fail(`เริ่มแล้วจดทันที: ${seenAt()}`);
    // ชั้นของกล่อง: ลูกของ <body> เหนือ Modal ของ react-native-web (9999) ต่ำกว่าชั้นแจ้งผล/ยืนยัน
    const layer = await page.evaluate(() => {
      const el = document.querySelector("[data-otteri-howto]");
      return el ? { z: Number(getComputedStyle(el).zIndex), body: el.parentElement === document.body } : null;
    });
    layer && layer.body && layer.z > 9999 && layer.z < 2147483000
      ? pass(`ชั้นของกล่องอยู่ใน <body> z ${layer.z} (เหนือ Modal ใต้กล่องยืนยัน)`) : fail(`ชั้นของกล่อง: ${JSON.stringify(layer)}`);
    (await inertCount()) > 0 ? pass("ระหว่างเล่น หน้าข้างหลังถูกตั้ง inert") : fail("ไม่มี inert ระหว่างเล่น");
    await page.screenshot({ path: path.join(DIR, "howto-1-step1.png") });

    // นิ้วแตะแท็บ "พรุ่งนี้" ใต้พื้นมืด (ตรงรูที่เจาะด้วย) — แท็บต้องไม่เปลี่ยน
    const tomorrow = page.locator('[aria-label^="แท็บ พรุ่งนี้"]').first();
    await tapCenter(tomorrow);
    await page.waitForTimeout(600);
    const selected = await page.evaluate(() => {
      const on = [...document.querySelectorAll('[aria-label^="แท็บ "]')].find((e) => e.getAttribute("aria-selected") === "true");
      return on ? on.getAttribute("aria-label") : "ไม่มี";
    });
    selected.startsWith("แท็บ วันนี้") ? pass("แตะแท็บ พรุ่งนี้ ใต้พื้นมืด → ยังเลือก วันนี้ อยู่ (กดไม่ได้)") : fail(`แท็บที่เลือก: ${selected}`);

    // คีย์บอร์ด: Tab / Shift+Tab วนในกล่องเสมอ ไม่หลุดไปหน้าข้างหลังหรือ <body>
    let outside = 0;
    for (let k = 0; k < 20; k++) {
      await page.keyboard.press(k < 15 ? "Tab" : "Shift+Tab");
      const inside = await page.evaluate(() => !!document.activeElement?.closest("[data-otteri-howto]"));
      if (!inside) outside++;
    }
    outside === 0 ? pass("Tab 15 ครั้ง + Shift+Tab 5 ครั้ง โฟกัสอยู่ในกล่องทุกครั้ง") : fail(`โฟกัสหลุดออกนอกกล่อง ${outside} ครั้ง`);
    (await attr("data-howto-step")) === "1" ? pass("กด Tab แล้วกล่องยังอยู่ขั้นเดิม") : fail(`Tab แล้วขั้นเปลี่ยนเป็น ${await attr("data-howto-step")}`);

    // ลากลงบนพื้นมืด — ต้องไม่รีเฟรชหน้าข้างใต้
    const cdp = await ctx.newCDPSession(page);
    const before = myDayReads.length;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 560 }] });
    let ball = 0;
    for (let y = 570; y <= 760; y += 20) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] });
      await page.waitForTimeout(16);
      ball = Math.max(ball, await page.evaluate(() => Number(document.querySelector('[aria-label="ลากรีเฟรช"]')?.style.opacity || 0)));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(1500);
    myDayReads.length === before && ball === 0
      ? pass("ลากลงบนพื้นมืด → ไม่รีเฟรช (ไม่มีคำขอ my-day · วงลากรีเฟรชไม่โผล่)") : fail(`ลากบนพื้นมืด: คำขอ my-day ${myDayReads.length - before} · วง ${ball}`);

    // ขั้น 2–4 มีของจริงให้ชี้ — ไม่ใช่การ์ดตัวอย่างกลางจอ
    // ปุ่ม "ถึงหน้างาน" อยู่การ์ดใบที่สอง ใต้แถบเมนูล่างของมือถือ (จุดกลางอยู่ในจอแต่ถูกบัง) — ต้องเลื่อนหาให้ ไม่ใช่ขึ้นกลางจอ
    const real = [];
    for (const [n, id] of [[2, "myday.card"], [3, "myday.arrive"], [4, "myday.close"]]) {
      await inBox("ถัดไป").click();
      real.push(`${n}:${await waitStep(n)}:${(await ringHolds(id)) ? "ล้อม" : "ไม่ล้อม"}`);
      if (n === 3) await page.screenshot({ path: path.join(DIR, "howto-1b-arrive.png") });
    }
    real.join(" ") === "2:found:ล้อม 3:found:ล้อม 4:found:ล้อม"
      ? pass("ขั้น 2–4 กรอบล้อมการ์ด · ถึงหน้างาน (เลื่อนหาให้) · ปิดงาน ของจริง") : fail(`ขั้น 2–4: ${real.join(" ")}`);
    (await box.getByText("ตัวอย่าง", { exact: true }).count()) === 0 ? pass("มีงานจริงแล้วไม่วาดการ์ดตัวอย่าง") : fail("วาดการ์ดตัวอย่างทั้งที่มีงานจริง");

    // ขั้น 5 ลองกดปุ่มสามขีด — ถัดไปกดไม่ได้จนกว่าเมนูเปิด
    await inBox("ถัดไป").click();
    const t5 = await waitStep(5);
    const disabledBefore = await inBox("ถัดไป").getAttribute("aria-disabled");
    (await page.getByText("ลองกดตรงนี้", { exact: true }).locator("visible=true").count()) === 1 && t5 === "found" && disabledBefore === "true"
      ? pass('ขั้น 5: ป้าย "ลองกดตรงนี้" · "ถัดไป" กดไม่ได้ก่อนเปิดเมนู') : fail(`ขั้น 5: ${t5} · aria-disabled=${disabledBefore}`);
    await inBox("ถัดไป").click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    (await attr("data-howto-step")) === "5" ? pass("กด ถัดไป ตอนยังไม่เปิดเมนู → ยังอยู่ขั้น 5") : fail("ข้ามขั้นลองกดได้โดยไม่เปิดเมนู");
    const proxy = page.locator('[data-otteri-howto] [aria-label="เปิดเมนู"]');
    await tapCenter(proxy);
    await page.waitForTimeout(900);
    const drawerOpen = () => page.evaluate(() => !!document.getElementById("side-menu-backdrop"));
    (await drawerOpen()) && (await inBox("ถัดไป").getAttribute("aria-disabled")) !== "true" && (await box.getByText('เปิดเมนูแล้ว — กด "ถัดไป" ดูต่อ', { exact: true }).count()) === 1
      ? pass("แตะรูที่ปุ่มสามขีด → เมนูเปิด · ถัดไปกดได้ · ข้อความเปลี่ยนเป็น เปิดเมนูแล้ว") : fail(`หลังแตะ: เมนู ${await drawerOpen()} · aria-disabled=${await inBox("ถัดไป").getAttribute("aria-disabled")}`);

    // ย้อนกลับไปขั้น 4 — เมนูที่วิธีใช้เปิดปิดคืน ปุ่มปิดงานโผล่ให้ชี้
    await inBox("ย้อนกลับ").click();
    const back4 = await waitStep(4);
    await page.waitForTimeout(500);
    !(await drawerOpen()) && back4 === "found" && (await page.locator('[aria-label="ปิดงาน"]').locator("visible=true").count()) > 0
      ? pass("ย้อนกลับไปขั้น 4 → เมนูปิดคืน · ชี้ปุ่ม ปิดงาน ได้") : fail(`ย้อนกลับ: เมนู ${await drawerOpen()} · ขั้น 4 ${back4}`);

    // เดินหน้าอีกรอบ (ขั้น 5 ต้องลองกดใหม่) → ขั้น 6 แผ่นขอบล่าง
    await inBox("ถัดไป").click();
    await waitStep(5);
    await tapCenter(proxy);
    await page.waitForTimeout(900);
    await inBox("ถัดไป").click();
    const t6 = await waitStep(6);
    const sheet = await box.boundingBox();
    const vp = page.viewportSize();
    sheet && t6 === "found" && Math.abs(sheet.y + sheet.height - vp.height) <= 1 && Math.abs(sheet.width - vp.width) <= 1 && sheet.x <= 1 && (await ringHolds("menu.inbox"))
      ? pass("ขั้น 6 (กล่องงานของฉัน ในเมนู) เป็นแผ่นขอบล่าง: ล่างสุดชิดจอ กว้างเต็มจอ · กรอบล้อมรายการในเมนู") : fail(`ขั้น 6: ${t6} · กล่อง ${JSON.stringify(sheet)} · กรอบ ${await ringHolds("menu.inbox")}`);
    (await drawerOpen()) ? pass("ขั้นเมนูเปิดเมนูค้างไว้") : fail("ขั้น 6 เมนูไม่เปิด");
    await page.screenshot({ path: path.join(DIR, "howto-2-sheet.png") });

    // ขั้น 7 กางกลุ่ม "รถ" ให้ดู — ไม่เขียนลงเครื่อง (กลุ่มที่ผู้ใช้ย่อไว้ยังย่ออยู่หลังดูจบ)
    await inBox("ถัดไป").click();
    const t7 = await waitStep(7);
    const stored = await page.evaluate(() => localStorage.getItem("otteri-side-groups"));
    t7 === "found" && (await page.getByText("ลงทะเบียนใช้รถ", { exact: true }).locator("visible=true").count()) > 0 && stored === GROUPS_SEED
      ? pass('ขั้น 7 กางกลุ่ม "รถ" ให้เห็น ลงทะเบียนใช้รถ · ค่าที่จำในเครื่องไม่เปลี่ยน') : fail(`ขั้น 7: ${t7} · เก็บไว้ ${stored}`);
    (await box.getByText("เข้าใจแล้ว", { exact: true }).count()) === 1 && (await inBox("ข้าม").count()) === 0
      ? pass('ขั้นสุดท้ายปุ่ม "เข้าใจแล้ว" ไม่มีปุ่มข้าม') : fail("ปุ่มขั้นสุดท้ายไม่ถูก");

    // เข้าใจแล้ว → เมนูปิด · แถบข้อความ · จดที่บัญชี · inert หายหมด
    await inBox("เข้าใจแล้ว").click();
    const toast = page.getByText("ดูวิธีใช้อีกครั้ง กดปุ่ม ? ข้างปุ่มรีเฟรช", { exact: true }).locator("visible=true");
    await toast.waitFor({ timeout: 4000 }).catch(() => {});
    (await toast.count()) === 1 ? pass('แถบข้อความ "ดูวิธีใช้อีกครั้ง กดปุ่ม ? ข้างปุ่มรีเฟรช"') : fail("ไม่มีแถบข้อความหลังดูจบ");
    await page.waitForTimeout(1200);
    !(await drawerOpen()) ? pass("ดูจบแล้วเมนูที่วิธีใช้เปิดไว้ปิดคืน") : fail("เมนูยังเปิดค้างหลังดูจบ");
    const seen = seenAt();
    seen ? pass(`ฐานข้อมูลจด tours."tech.myday" (${seen})`) : fail("ฐานข้อมูลไม่จดหน้าที่ดูจบ");
    sql(`select ("howtoSeen" ? 'pending')::text from "User" where "employeeCode"='${TECH}'`) === "false"
      ? pass("ดูจบแล้ว pending หายจากฐานข้อมูล (กล่องต้อนรับไม่ขึ้นทีหลัง)") : fail("pending ยังค้าง");
    (await inertCount()) === 0 && (await page.locator("[data-otteri-howto]").count()) === 0
      ? pass("จบแล้วไม่เหลือ inert และชั้นของกล่อง") : fail(`จบแล้วเหลือ inert ${await inertCount()} · ชั้น ${await page.locator("[data-otteri-howto]").count()}`);
    (await page.evaluate(() => localStorage.getItem("otteri-side-groups"))) === GROUPS_SEED
      ? pass("กลุ่มเมนูที่ย่อไว้กลับเป็นแบบเดิม (ค่าในเครื่องไม่ถูกแตะ)") : fail("ค่ากลุ่มเมนูในเครื่องเปลี่ยน");

    // Esc = ข้าม: ไม่จด · แถบข้อความข้ามแล้ว · ไม่เหลือ inert
    // แถบข้อความบนมือถืออยู่บนสุด ทับปุ่ม ? (แตะแถบ = ปิดแถบ) — รอให้หายเองก่อน ไม่งั้นการกดไปโดนแถบแทนปุ่ม
    await toast.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
    (await toast.count()) === 0 ? pass("แถบข้อความหลังดูจบหายเอง") : fail("แถบข้อความหลังดูจบค้างไม่หาย");
    await help.first().click();
    const esc1 = await waitStep(1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const skipToast = page.getByText("ข้ามแล้ว · ดูวิธีใช้อีกครั้ง กดปุ่ม ? ข้างปุ่มรีเฟรช", { exact: true }).locator("visible=true");
    esc1 === "found" && (await box.count()) === 0 && (await skipToast.count()) === 1
      ? pass('กด Esc → กล่องหาย · แถบ "ข้ามแล้ว · ดูวิธีใช้อีกครั้ง …"') : fail(`Esc: ขั้น 1 ${esc1} · กล่อง ${await box.count()} · แถบ ${await skipToast.count()}`);
    seenAt() === seen ? pass("ข้ามไม่จดอะไรเพิ่มในฐานข้อมูล") : fail(`ข้ามแล้วฐานข้อมูลเปลี่ยน: ${seenAt()}`);
    (await inertCount()) === 0 ? pass("ข้ามแล้วไม่เหลือ inert") : fail(`ข้ามแล้วเหลือ inert ${await inertCount()}`);
    await page.screenshot({ path: path.join(DIR, "howto-3-after-esc.png") });
    await ctx.close();

    // โหมดมืด — กล่องใช้สีของธีม (ไม่ใช่กล่องขาวกลางจอมืด) และยังชี้ถูกปุ่ม · ภาพไว้ดูด้วยตา
    {
      const d = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const dp = await d.newPage();
      await dp.addInitScript((seed) => {
        try {
          localStorage.setItem("otteri-side-groups", seed);
          localStorage.setItem("otteri-howto-auto", "off");
          localStorage.setItem("otteri-theme", "dark");
        } catch {}
      }, GROUPS_SEED);
      dp.on("pageerror", (e) => errors.push(`dark: ${e}`));
      await dp.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await dp.getByPlaceholder("รหัสพนักงาน").fill(TECH);
      await dp.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await dp.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
      await dp.waitForTimeout(4000);
      await dp.locator('[aria-label="วิธีใช้หน้านี้"]').locator("visible=true").first().click();
      const dBox = dp.locator('[data-otteri-howto] [role="dialog"]');
      await dBox.waitFor({ timeout: 9000 }).catch(() => {});
      await dp.waitForTimeout(400);
      const bg = await dBox.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => "");
      await dp.screenshot({ path: path.join(DIR, "howto-4-dark-step1.png") });
      for (let k = 0; k < 2; k++) {
        await dBox.locator('[aria-label="ถัดไป"]').click();
        await dp.waitForTimeout(1200);
      }
      const dStep = await dp.locator("[data-howto-tour]").getAttribute("data-howto-step").catch(() => null);
      const dTarget = await dp.locator("[data-howto-tour]").getAttribute("data-howto-target").catch(() => null);
      await dp.screenshot({ path: path.join(DIR, "howto-5-dark-arrive.png") });
      bg && bg !== "rgb(255, 255, 255)" && dStep === "3" && dTarget === "found"
        ? pass(`โหมดมืด: กล่องใช้สีธีมมืด (${bg}) · ขั้น 3 ชี้ปุ่มถึงหน้างานได้`) : fail(`โหมดมืด: พื้นกล่อง ${bg} · ขั้น ${dStep} ${dTarget}`);
      await dp.keyboard.press("Escape");
      await d.close();
    }

    // ── หน้า "สอนการใช้งาน" (ก้อน 3) — ช่าง มือถือ ──
    // ปุ่ม ? ของหน้าที่ไม่มีวิธีใช้ → หน้าสอนการใช้งาน (ไม่ใช่กดแล้วเงียบ) · ดูแล้วกี่เรื่องตรงฐานข้อมูล · ? ซ่อนในหน้านี้ · เริ่มดูจากที่นี่
    {
      const { ctx: hc, page: hp } = await open(TECH);
      const hv = (sel) => hp.locator(sel).locator("visible=true");
      await hv('[aria-label="เปิดเมนู"]').first().click();
      await hp.waitForTimeout(800);
      await hv('[aria-label="กางกลุ่ม รถ"]').first().click();
      await hp.waitForTimeout(800);
      await hv('[aria-label="ลงทะเบียนใช้รถ"]').first().click();
      await hp.waitForTimeout(2000);
      const hHelp = hv('[aria-label="วิธีใช้หน้านี้"]');
      (await hHelp.count()) === 1 ? pass('หน้า "ลงทะเบียนใช้รถ" (ไม่มีวิธีใช้) ก็มีปุ่ม ? บนแถบหัว') : fail(`ลงทะเบียนใช้รถ: ปุ่ม ? ${await hHelp.count()} ปุ่ม`);
      await hHelp.first().click();
      await hp.waitForTimeout(1800);
      const rows = hv('[aria-label^="เริ่มดู "], [aria-label^="ดูอีกครั้ง "]');
      const nRows = await rows.count();
      (await hp.locator("[data-howto-tour]").count()) === 0 && nRows >= 1 && (await hv('[aria-label="กลับไปลงทะเบียนใช้รถ"]').count()) === 1
        ? pass(`กด ? → เปิดหน้า "สอนการใช้งาน" ซ้อนบนหน้าเดิม (${nRows} เรื่อง · ‹ กลับไปลงทะเบียนใช้รถ) ไม่เริ่มวิธีใช้เอง`)
        : fail(`? บนหน้าที่ไม่มีวิธีใช้: กล่อง ${await hp.locator("[data-howto-tour]").count()} · แถว ${nRows}`);
      const dbSeen = Number(sql(`select count(*) from "User" u, jsonb_object_keys(coalesce(u."howtoSeen"->'tours','{}'::jsonb)) where u."employeeCode"='${TECH}'`));
      (await hp.getByText(`ดูแล้ว ${dbSeen} จาก ${nRows}`, { exact: true }).locator("visible=true").count()) === 1 && dbSeen === 1
        ? pass(`"ดูแล้ว ${dbSeen} จาก ${nRows}" ตรงฐานข้อมูล (tours ${dbSeen} หน้า)`) : fail(`จำนวนที่ดูแล้ว: ฐานข้อมูล ${dbSeen} · แถว ${nRows}`);
      (await hv('[aria-label="ดูอีกครั้ง งานของฉันวันนี้"]').count()) === 1 &&
      (await hp.getByText(/^7 ขั้น · ดูแล้ว \d{1,2} \S+ \d{2}:\d{2}$/).locator("visible=true").count()) === 1
        ? pass('แถว "งานของฉันวันนี้": 7 ขั้น · ดูแล้ว วันเวลา · ปุ่ม "ดูอีกครั้ง"') : fail("แถวงานของฉันวันนี้ไม่ตรง (ควรดูแล้ว)");
      (await hHelp.count()) === 0 ? pass("ในหน้าสอนการใช้งานไม่มีปุ่ม ? (กดแล้วก็เปิดหน้าเดิม)") : fail("หน้าสอนการใช้งานยังมีปุ่ม ?");
      await hp.screenshot({ path: path.join(DIR, "howto-6-hub.png") });
      await hv('[aria-label="ดูอีกครั้ง งานของฉันวันนี้"]').first().click();
      const started = await hp
        .locator('[data-howto-tour="tech.myday"][data-howto-step="1"][data-howto-target="found"]')
        .waitFor({ timeout: 9000 })
        .then(() => true, () => false);
      started && (await hp.locator('[aria-label^="แท็บ วันนี้"]').locator("visible=true").count()) > 0
        ? pass("ดูอีกครั้งจากหน้าสอนการใช้งาน → ไปหน้างานของฉันแล้วเริ่มขั้น 1 ชี้แถบแท็บ") : fail("เริ่มจากหน้าสอนการใช้งานไม่ได้");
      await hp.waitForTimeout(300);
      await hp.keyboard.press("Escape");
      await hp.waitForTimeout(600);
      seenAt() === seen ? pass("เริ่มจากหน้าสอนการใช้งานแล้วข้าม — ฐานข้อมูลไม่เปลี่ยน") : fail(`ฐานข้อมูลเปลี่ยน: ${seenAt()}`);
      await hc.close();
    }

    // ── จอคอม 1366 (ช่าง): ปุ่มมีชื่อ "วิธีใช้หน้านี้" · หน้าสอนการใช้งานมีชื่อหน้าตัวใหญ่ · จำนวนขั้นตามจอ (คอมไม่มีขั้นลองกด = 6)
    {
      const { ctx: wc, page: wp } = await open(TECH, { width: 1366, height: 900 });
      const wv = (sel) => wp.locator(sel).locator("visible=true");
      (await wp.getByText("วิธีใช้หน้านี้", { exact: true }).locator("visible=true").count()) === 1
        ? pass('จอคอม: ปุ่ม "วิธีใช้หน้านี้" มีชื่อบนแถบบน') : fail("จอคอม: ไม่เห็นชื่อปุ่ม วิธีใช้หน้านี้");
      await wv('[aria-label="กางกลุ่ม เอกสารและบัญชี"]').first().click();
      await wp.waitForTimeout(900);
      await wv('[aria-label="สอนการใช้งาน"]').first().click();
      await wp.waitForTimeout(1800);
      (await wp.getByText("สอนการใช้งาน", { exact: true }).locator("visible=true").count()) >= 2 &&
      (await wp.getByText(/^6 ขั้น · ดูแล้ว /).locator("visible=true").count()) === 1 &&
      (await wv('[aria-label="วิธีใช้หน้านี้"]').count()) === 0
        ? pass("จอคอม: เมนู สอนการใช้งาน → ชื่อหน้าตัวใหญ่ · งานของฉันวันนี้ 6 ขั้น (ไม่มีขั้นลองกด) · ไม่มีปุ่ม ?")
        : fail(`จอคอมหน้าสอนการใช้งาน: ชื่อ ${await wp.getByText("สอนการใช้งาน", { exact: true }).locator("visible=true").count()} · ? ${await wv('[aria-label="วิธีใช้หน้านี้"]').count()}`);
      await wp.screenshot({ path: path.join(DIR, "howto-8-hub-wide.png") });
      await wc.close();
    }

    // ── แอดมินจอแคบ: ไม่มี ? บนแถบหัว (แถบเต็ม) — "วิธีใช้หน้านี้" เป็นแถวในเมนูข้าง กดแล้วเมนูปิด ──
    // ไปหน้าที่ไม่มีวิธีใช้ก่อน (เปลี่ยนรหัสผ่าน) ให้ผลไม่ขึ้นกับว่าแอดมินมีวิธีใช้ของหน้างานของฉันหรือยัง
    {
      const { ctx: ac, page: ap } = await open("A001");
      const av = (sel) => ap.locator(sel).locator("visible=true");
      (await av('[aria-label="วิธีใช้หน้านี้"]').count()) === 0 ? pass("แอดมินจอแคบ: แถบหัวไม่มีปุ่ม ?") : fail("แอดมินจอแคบมีปุ่ม ? บนแถบหัว");
      await av('[aria-label="เปิดเมนู"]').first().click();
      await ap.waitForTimeout(800);
      await av('[aria-label="กางกลุ่ม เอกสารและบัญชี"]').first().click();
      await ap.waitForTimeout(800);
      await av('[aria-label="เปลี่ยนรหัสผ่าน"]').first().click();
      await ap.waitForTimeout(1500);
      await av('[aria-label="เปิดเมนู"]').first().click();
      await ap.waitForTimeout(900);
      const row = av('[data-testid="howto-menu.help"]');
      const rowOk = (await row.count()) === 1 && (await row.getAttribute("aria-label")) === "วิธีใช้หน้านี้";
      await ap.screenshot({ path: path.join(DIR, "howto-7-admin-drawer.png") });
      await row.first().click().catch(() => {});
      await ap.waitForTimeout(1500);
      const drawer = await ap.evaluate(() => !!document.getElementById("side-menu-backdrop"));
      rowOk && !drawer && (await av('[aria-label="กลับไปเปลี่ยนรหัสผ่าน"]').count()) === 1 && (await ap.locator("[data-howto-tour]").count()) === 0
        ? pass('แอดมินจอแคบ: แถว "วิธีใช้หน้านี้" ในเมนู → เมนูปิด · เปิดหน้าสอนการใช้งานซ้อนหน้าเดิม') : fail(`แถวในเมนูของแอดมิน: แถว ${rowOk} · เมนูค้าง ${drawer}`);
      await ac.close();
    }

    // ── ทีม Area: เห็นเมนูและปุ่ม ? (เจ้าของงานเลือก) — รอบนี้ยังไม่มีวิธีใช้: หน้าที่บอกว่ากำลังทำ · ไม่มีกล่องขึ้นเอง ──
    {
      sql(`insert into "User"("employeeCode",name,role,"passwordHash","howtoSeen")
           select 'zzht.area','Area ทดสอบวิธีใช้','AREA',"passwordHash",'{"pending": true}'::jsonb from "User" where "employeeCode"='A001'`);
      const { ctx: rc, page: rp } = await open("zzht.area", { auto: true });
      const rv = (sel) => rp.locator(sel).locator("visible=true");
      await rp.waitForTimeout(2500); // กล่องที่ขึ้นเองรอ 800 ms หลังหน้าพร้อม — ให้เวลาเกินพอ
      (await rp.locator("[data-otteri-howto]").count()) === 0 ? pass("ทีม Area (บัญชีใหม่ pending): ไม่มีกล่องสอนการใช้งานขึ้นเอง") : fail("ทีม Area มีกล่องขึ้นเอง");
      const empty = async () =>
        (await rp.getByText("ยังไม่มีวิธีใช้สำหรับตำแหน่งนี้", { exact: true }).locator("visible=true").count()) === 1 &&
        (await rp.getByText("กำลังทำเพิ่ม — เปิดใช้แล้วจะขึ้นในหน้านี้", { exact: true }).locator("visible=true").count()) === 1;
      const rHelp = rv('[aria-label="วิธีใช้หน้านี้"]');
      const hadHelp = (await rHelp.count()) === 1;
      if (hadHelp) await rHelp.first().click();
      await rp.waitForTimeout(1500);
      hadHelp && (await empty()) ? pass('ทีม Area: ปุ่ม ? บนแถบหัว → "ยังไม่มีวิธีใช้สำหรับตำแหน่งนี้"') : fail(`ทีม Area ปุ่ม ?: มีปุ่ม ${hadHelp}`);
      await rp.screenshot({ path: path.join(DIR, "howto-9-area-empty.png") });
      await rv('[aria-label^="กลับไป"]').first().click().catch(() => {});
      await rp.waitForTimeout(1200);
      await rv('[aria-label="เปิดเมนู"]').first().click();
      await rp.waitForTimeout(800);
      await rv('[aria-label="กางกลุ่ม เอกสารและบัญชี"]').first().click();
      await rp.waitForTimeout(800);
      const item = rv('[aria-label="สอนการใช้งาน"]');
      const hadItem = (await item.count()) === 1;
      if (hadItem) await item.first().click();
      await rp.waitForTimeout(1500);
      hadItem && (await empty()) ? pass('ทีม Area: เมนู "สอนการใช้งาน" → หน้าเดียวกัน (กำลังทำเพิ่ม)') : fail(`ทีม Area เมนู: มีเมนู ${hadItem}`);
      sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='zzht.area'`) === '{"pending": true}'
        ? pass("ทีม Area: ฐานข้อมูลไม่ถูกเขียน (ยัง pending)") : fail("ทีม Area: howtoSeen เปลี่ยน");
      await rc.close();
    }

    errors.length === 0 ? pass("ไม่มี error ในหน้าเว็บ") : fail(`error ในหน้าเว็บ: ${errors.slice(0, 3).join(" | ")}`);
  } catch (e) {
    fail(`เทสต์พัง: ${e.stack || e}`);
  } finally {
    await cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่ได้: ${e}`));
    await browser.close();
  }
})();

/** รอบก่อนพังกลางทาง — ผู้ใช้ zzht.* ค้างอยู่ (ใบงานของรอบก่อนถูกลบไปพร้อม fixture แล้ว) */
function cleanupStale(sql, users) {
  sql(`delete from "BranchCheckIn" where "userId" in (${users});
       delete from "ViewAsLog" where "targetUserId" in (${users}) or "byUserId" in (${users});
       delete from "User" where id in (${users})`);
}
