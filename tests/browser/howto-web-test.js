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
// กล่องที่ขึ้นเองตอนเปิดแอป (ก้อน 4):
//   · บัญชีใหม่ (pending) มือถือ: กล่องต้อนรับ กรอบล้อมปุ่ม ? · "ยินดีต้อนรับ {ชื่อแรก}" · "ดูวิธีใช้หน้า งานของฉัน — 7 ขั้น ประมาณ 1 นาที"
//     · ยังไม่ตอบ = ฐานข้อมูลไม่เปลี่ยน · Tab วนในกล่อง · "เริ่มเลย" → ขั้น 1/7 ต่อทันที + จด welcome (pending หาย)
//     · Esc กลางทาง = ข้าม ไม่จดหน้า · โหลดใหม่ไม่ขึ้นซ้ำ · ตั้ง pending ใหม่ (แทนปุ่มให้ดูใหม่ของก้อน 7) → ขึ้นอีก · Esc = ไว้ทีหลัง
//   · พนักงานเดิม (NULL) มือถือ: ข้อความแนะนำ (ไม่ใช่กล่องต้อนรับ) ใต้ปุ่ม ? · เข้าใจแล้ว → จด notice · โหลดใหม่ไม่ขึ้นซ้ำ
//     · จอคอม: คำบอกที่อยู่ปุ่มเป็น "วิธีใช้หน้านี้" · Esc = เข้าใจแล้ว
//   · ดูในฐานะ (A001 ดูบัญชีใหม่ pending): ไม่มีกล่องต้อนรับ · ปุ่ม ? เล่นจนจบได้ · ฐานข้อมูลไม่เปลี่ยน ไม่มีคำขอ POST /auth/howto
// ใบงานซ่อม · งานของฉันวันนี้ของหัวหน้าภาค/แอดมิน · หน้าใบงาน (ก้อน 5):
//   · จอคอม A001: งานของฉันวันนี้ 6 ขั้น · ใบงานซ่อม 7 ขั้น — ขั้น 6 แอปเปิดใบงานให้ (ใบที่ถึงคิวแอดมิน ไม่ใช่ใบรอตรวจเคลม — ยืนยันที่
//     ฐานข้อมูล/API) กรอบล้อมแถบขั้นตอนในหน้าต่างใบงาน กล่องอยู่บนสุด · ขั้น 7 ชี้ปุ่มของขั้น · ย้อนกลับไปขั้น 5 = หน้าต่างปิด
//     · ถัดไปอีกครั้งเปิดใบเดิม · Esc = กล่องหาย หน้าต่างใบงานยังเปิด ไม่มีแถบข้อความ · กด ✕ ปิดหน้าต่างแล้วแถบ "ข้ามแล้ว · …" ขึ้น
//     · หน้าต่างใบงานมีปุ่ม ? ของตัวเอง · ฐานข้อมูลของ A001 ไม่ถูกจด
//   · หลบหน้าโหลด: A001 ดูในฐานะ S001 → ใบงานซ่อม → ขั้น 5 เปิดใบงาน ซึ่งตอบ 401 viewAsEnded (ปลอมด้วย page.route) แอปกลับเป็นตัวเอง
//     พร้อมหน้าโหลดเต็มจอ (ถือคำขอ view-as/stop ไว้ 3 วิ): ระหว่างนั้นไม่มีกล่อง ชั้นยังอยู่ inert ไม่หลุด · Esc ไม่ปิดหน้าต่างใบงาน
//     · ปล่อยแล้วเป็น A001 ไม่มีวิธีใช้ค้าง ไม่เหลือ inert
//   · หัวหน้าภาค (S001 จอคอม): ขั้น 7 "เวลาปิดนัดงานพรุ่งนี้" บอกเวลาที่แอดมินเพิ่งตั้ง (PUT ของจริง) · คืนค่าแล้วโหลดใหม่ บอกเวลาเดิม
//     · กรอบหัวกลุ่ม/ปุ่มของขั้นอยู่เฉพาะกลุ่มตามขั้น ไม่ใช่หัวข้อปัก
//   · Super Admin (zzht.super จอคอม): งานของฉันวันนี้ 7 ขั้น · ขั้น 7 กางกลุ่ม ผู้ดูแลระบบ ชี้ สำรองข้อมูล (ไม่จดลงเครื่อง)
//     · เข้าใจแล้ว → ฐานข้อมูลจด tours."admin.myday" · กลุ่มย่อกลับ
// ให้ดูวิธีใช้ใหม่ + คอลัมน์ "ดูวิธีใช้แล้ว" (ก้อน 7 · จอคอม A001):
//   · การใช้งานแอป: แถวของ zzht.tech บอก "x/n · ยังขาด …" ตรงฐานข้อมูล · หัวคอลัมน์ "ดูวิธีใช้แล้ว" · หัวการ์ด "ดูวิธีใช้ครบแล้ว k คน"
//   · สิทธิ์ผู้ใช้: ลิงก์ "ให้ดูวิธีใช้ใหม่" บนการ์ดช่าง (ไม่มีบนการ์ดทีม Area — ยังไม่มีวิธีใช้) · ยกเลิก = ฐานข้อมูลไม่เปลี่ยน
//     · ยืนยัน → แถบเขียว "ตั้งให้ … ดูวิธีใช้ใหม่แล้ว" · ฐานข้อมูล pending + resetAt + resetBy = A001 ไม่มีหน้าที่ดูแล้ว
//     · การใช้งานแอปกลับเป็น "ยังไม่ได้ดู" · zzht.tech เปิดแอปครั้งถัดไปได้กล่องต้อนรับ (Esc = ไว้ทีหลัง จด welcome)
//   · Super Admin ดูในฐานะ A001: หน้าสิทธิ์ผู้ใช้ไม่มีลิงก์ "ให้ดูวิธีใช้ใหม่" บนการ์ดไหนเลย (การ์ดยังขึ้นครบ)
//
// สร้างผู้ใช้ zzht.tech (ช่างทีมของ C0006) · zzht.area (Area) · zzht.new (ช่างบัญชีใหม่) · zzht.old (ช่างพนักงานเดิม)
// · zzht.super (Super Admin ดูแล้ว — สร้างท้ายสุด) ด้วย SQL + ใบงานสองใบของทีมนั้นวันนี้ (ใบหนึ่งถึงหน้างานแล้ว)
// + ใบรอแอดมินเช็คอะไหล่หนึ่งใบ แล้วลบทั้งหมดตอนจบ · เวลาปิดนัดที่ตั้งเพิ่ม (แถวใน AppSetting) ลบคืนตอนจบ
// · บันทึกดูในฐานะ S001 ที่เทสต์นี้สร้างลบตอนจบ
// หน้าในไฟล์นี้ปิดกล่องที่ขึ้นเอง (otteri-howto-auto=off) ยกเว้นส่วนที่ตรวจว่ากล่อง "ขึ้น/ไม่ขึ้น" (auto: true)
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
  /**
   * เวลาปิดนัดที่เทสต์นี้ตั้ง (ก้อน 5) — จดแถวสูงสุดไว้เป็นแถว key อื่นก่อนตั้ง (readCutoff อ่านเฉพาะ key='dispatchCutoff')
   * คืน = ลบแถวที่เพิ่มหลังแถวจด แล้วเรียก GET ให้เซิร์ฟเวอร์อ่านใหม่ · ถูกฆ่ากลางทาง รอบหน้าเจอแถวจดแล้วคืนให้ (โผล่เป็น FAIL)
   * แถวเวลาปิดค้าง = ทั้งแอปใช้เวลาผิดเงียบ ๆ และเทสต์ที่ขึ้นกับเวลาปิด (dispatch-cutoff) ได้ผลผิด
   */
  const CUT_MARK = "howtoWebTestCutoffMax";
  async function restoreCutoff() {
    const mark = fx?.sql(`select value from "AppSetting" where key='${CUT_MARK}' order by id limit 1`);
    if (!mark) return false;
    fx.sql(`delete from "AppSetting" where key='dispatchCutoff' and id > ${Number(mark)}; delete from "AppSetting" where key='${CUT_MARK}'`);
    await fx.call(fx.A, "GET", "/settings/dispatch-cutoff").catch(() => {});
    return true;
  }
  /** บันทึกดูในฐานะ S001 ที่เทสต์นี้สร้าง (ก้อน 5) — แถวก่อนหน้านี้ไม่แตะ */
  let viewLogMax = null;
  async function cleanup() {
    await restoreCutoff().catch(() => {});
    if (fx && viewLogMax !== null) {
      fx.sql(`delete from "ViewAsLog" where id > ${viewLogMax} and "targetUserId"=(select id from "User" where "employeeCode"='S001')`);
    }
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
    if (await restoreCutoff()) fail("เวลาปิดนัดที่เทสต์นี้รอบก่อนตั้งไว้ยังไม่ได้คืน (ถูกฆ่ากลางทาง) — คืนให้แล้ว รอบหน้าจะผ่าน");
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

    // ══════════ ก้อน 4: กล่องที่ขึ้นเองตอนเปิดแอป (หน้าในส่วนนี้เปิดด้วย auto: true — ไม่ปิดกล่องที่ขึ้นเอง) ══════════
    /** สถานะในฐานข้อมูลแบบอ่านง่าย: pending|welcome|notice|จำนวนหน้าที่ดูจบ (NULL = false|false|false|0) */
    const flags = (code) =>
      sql(`select coalesce(("howtoSeen" ? 'pending'),false)::text||'|'||coalesce(("howtoSeen" ? 'welcome'),false)::text||'|'||
                  coalesce(("howtoSeen" ? 'notice'),false)::text||'|'||
                  (select count(*) from jsonb_object_keys(coalesce("howtoSeen"->'tours','{}'::jsonb)))::text
           from "User" where "employeeCode"='${code}'`);
    /** การจดที่บัญชีส่งเบื้องหลัง (ไม่รอ) — รอให้ฐานข้อมูลเป็นค่าที่คาดได้ถึง 5 วิ แล้วคืนค่าล่าสุด */
    const flagsBecome = async (p, code, want) => {
      let v = flags(code);
      for (let k = 0; k < 25 && v !== want; k++) {
        await p.waitForTimeout(200);
        v = flags(code);
      }
      return v;
    };
    /** กรอบในชั้นของกล่องล้อมปุ่มนี้ทั้งตัวไหม (ปุ่มที่มองเห็นตัวใดตัวหนึ่ง) */
    const ringAround = async (p, id) => {
      const ring = await p.locator("[data-howto-ring]").boundingBox().catch(() => null);
      const els = p.locator(`[data-testid="howto-${id}"]`).locator("visible=true");
      for (let k = 0; ring && k < (await els.count()); k++) {
        const b = await els.nth(k).boundingBox();
        if (b && b.x >= ring.x - 1 && b.y >= ring.y - 1 && b.x + b.width <= ring.x + ring.width + 1 && b.y + b.height <= ring.y + ring.height + 1) return true;
      }
      return false;
    };
    /** รอกล่องที่ขึ้นเอง (welcome / notice) วาดเสร็จ: หาปุ่ม ? แล้ว (found) หรือขึ้นกลางจอ (center) — ไม่ขึ้นภายในเวลา = null */
    const waitPrompt = async (p, kind, ms = 12000) => {
      const sel = `[data-howto-prompt="${kind}"]:not([data-howto-target="seek"])`;
      const ok = await p.locator(sel).waitFor({ timeout: ms }).then(() => true, () => false);
      if (!ok) return null;
      await p.waitForTimeout(300); // จางเข้า 150 ms
      return p.locator(sel).getAttribute("data-howto-target");
    };
    const layerText = (p) => p.evaluate(() => document.querySelector("[data-otteri-howto]")?.innerText ?? "");
    const inertOf = (p) => p.evaluate(() => document.querySelectorAll("[inert]").length);

    // ── บัญชีใหม่ (pending) มือถือ: กล่องต้อนรับ + กรอบรอบปุ่ม ? → เริ่มเลย = ขั้น 1/7 ──
    sql(`insert into "User"("employeeCode",name,role,team,"passwordHash","howtoSeen")
         select 'zzht.new','สมใจ ทดสอบต้อนรับ','EMPLOYEE','${team}',"passwordHash",'{"pending": true}'::jsonb from "User" where "employeeCode"='A001'`);
    {
      const { ctx: nc, page: np } = await open("zzht.new", { auto: true });
      const welcome = np.locator('[data-otteri-howto] [role="dialog"][aria-label="ยินดีต้อนรับ"]');
      const wt = await waitPrompt(np, "welcome");
      wt === "found" && (await welcome.count()) === 1
        ? pass("บัญชีใหม่เปิดแอป → กล่องต้อนรับขึ้นเอง (กรอบหาปุ่ม ? เจอ)") : fail(`กล่องต้อนรับ: ${wt} · กล่อง ${await welcome.count()}`);
      (await ringAround(np, "app.help")) && (await np.locator('[aria-label="วิธีใช้หน้านี้"]').locator("visible=true").count()) === 1
        ? pass("กรอบบนพื้นมืดล้อมปุ่ม ? (วิธีใช้หน้านี้) บนแถบหัวทั้งปุ่ม") : fail("กรอบไม่ล้อมปุ่ม ?");
      const wtext = async (t) => (await welcome.getByText(t, { exact: true }).count()) === 1;
      (await wtext("ยินดีต้อนรับ สมใจ")) &&
      (await wtext("ดูวิธีใช้หน้า งานของฉัน — 7 ขั้น ประมาณ 1 นาที")) &&
      (await wtext("ดูอีกครั้งได้ที่ปุ่ม ? ข้างปุ่มรีเฟรช หรือเมนู › เอกสารและบัญชี › สอนการใช้งาน")) &&
      (await welcome.locator('[aria-label="เริ่มเลย"]').count()) === 1 &&
      (await welcome.locator('[aria-label="ไว้ทีหลัง"]').count()) === 1
        ? pass('ข้อความกล่องต้อนรับ: "ยินดีต้อนรับ สมใจ" · "ดูวิธีใช้หน้า งานของฉัน — 7 ขั้น ประมาณ 1 นาที" · เริ่มเลย / ไว้ทีหลัง · ดูอีกครั้งได้ที่…')
        : fail(`ข้อความกล่องต้อนรับไม่ตรง: ${(await layerText(np)).replace(/\s+/g, " ").slice(0, 300)}`);
      !(await layerText(np)).includes("ทัวร์") ? pass('กล่องต้อนรับไม่มีคำว่า "ทัวร์"') : fail('กล่องต้อนรับมีคำว่า "ทัวร์"');
      flags("zzht.new") === "true|false|false|0" ? pass("ยังไม่ตอบ — ฐานข้อมูลยัง pending ไม่จดอะไร") : fail(`ก่อนตอบ: ${flags("zzht.new")}`);
      (await inertOf(np)) > 0 ? pass("ระหว่างกล่องต้อนรับ หน้าข้างหลังถูกตั้ง inert") : fail("กล่องต้อนรับไม่มี inert");
      let out = 0;
      for (let k = 0; k < 6; k++) {
        await np.keyboard.press(k < 4 ? "Tab" : "Shift+Tab");
        if (!(await np.evaluate(() => !!document.activeElement?.closest("[data-otteri-howto]")))) out++;
      }
      out === 0 ? pass("Tab / Shift+Tab วนอยู่ในกล่องต้อนรับ") : fail(`โฟกัสหลุดจากกล่องต้อนรับ ${out} ครั้ง`);
      await np.screenshot({ path: path.join(DIR, "howto-10-welcome.png") });

      await welcome.locator('[aria-label="เริ่มเลย"]').click();
      const first = await np
        .locator('[data-howto-tour="tech.myday"][data-howto-step="1"][data-howto-target="found"]')
        .waitFor({ timeout: 9000 })
        .then(() => true, () => false);
      await np.waitForTimeout(300);
      first && (await np.locator("[data-howto-prompt]").count()) === 0 &&
      (await np.locator('[data-otteri-howto] [role="dialog"]').getByText("1/7", { exact: true }).count()) === 1 && (await inertOf(np)) > 0
        ? pass("เริ่มเลย → ขั้น 1/7 ของงานของฉันวันนี้ต่อทันที (กล่องต้อนรับหาย หน้าข้างหลังยัง inert)") : fail(`เริ่มเลย: ขั้น 1 ${first}`);
      const afterStart = await flagsBecome(np, "zzht.new", "false|true|false|0");
      afterStart === "false|true|false|0"
        ? pass("ฐานข้อมูล: ตอบกล่องต้อนรับแล้ว (welcome) · pending หาย · ยังไม่จดหน้าที่ดูจบ") : fail(`หลังเริ่มเลย: ${afterStart}`);
      await np.keyboard.press("Escape");
      await np.waitForTimeout(900);
      (await np.locator("[data-otteri-howto]").count()) === 0 &&
      (await np.getByText("ข้ามแล้ว · ดูวิธีใช้อีกครั้ง กดปุ่ม ? ข้างปุ่มรีเฟรช", { exact: true }).locator("visible=true").count()) === 1
        ? pass("Esc กลางทาง = ข้าม (แถบข้อความข้ามแล้ว)") : fail("Esc หลังเริ่มจากกล่องต้อนรับไม่ข้าม");
      flags("zzht.new") === "false|true|false|0" ? pass("ข้ามแล้วไม่จดหน้าที่ดูจบ") : fail(`ข้ามแล้วฐานข้อมูล: ${flags("zzht.new")}`);

      // โหลดหน้าใหม่ (เปิดแอปรอบสอง) — ตอบแล้วไม่ขึ้นอีก
      await np.reload({ waitUntil: "networkidle", timeout: 180000 });
      await np.waitForTimeout(6000);
      (await np.locator("[data-otteri-howto]").count()) === 0 ? pass("เปิดแอปรอบสอง: ไม่มีกล่องต้อนรับซ้ำ") : fail("กล่องต้อนรับขึ้นซ้ำหลังตอบแล้ว");

      // แอดมินกดให้ดูใหม่ (จำลองด้วย SQL — ปุ่มจริงมาก้อน 7) → ขึ้นอีกครั้ง · Esc = ไว้ทีหลัง: จดว่าตอบ ไม่เริ่ม ไม่มีแถบข้อความ
      sql(`update "User" set "howtoSeen"='{"pending": true}'::jsonb where "employeeCode"='zzht.new'`);
      await np.reload({ waitUntil: "networkidle", timeout: 180000 });
      const again = await waitPrompt(np, "welcome");
      await np.keyboard.press("Escape");
      await np.waitForTimeout(900);
      const later = await flagsBecome(np, "zzht.new", "false|true|false|0");
      again === "found" && (await np.locator("[data-otteri-howto]").count()) === 0 && (await np.locator("[data-howto-tour]").count()) === 0 &&
      (await np.getByText("ข้ามแล้ว", { exact: false }).locator("visible=true").count()) === 0 && later === "false|true|false|0" && (await inertOf(np)) === 0
        ? pass("กล่องต้อนรับ + Esc = ไว้ทีหลัง: กล่องหาย ไม่เริ่มเล่น ไม่มีแถบข้อความ · ฐานข้อมูลจด welcome · ไม่เหลือ inert")
        : fail(`Esc บนกล่องต้อนรับ: ขึ้น ${again} · ฐานข้อมูล ${later} · inert ${await inertOf(np)}`);
      await nc.close();
    }

    // ── พนักงานเดิม (howtoSeen NULL) มือถือ: ข้อความแนะนำครั้งเดียว ชี้ปุ่ม ? → เข้าใจแล้ว ──
    sql(`insert into "User"("employeeCode",name,role,team,"passwordHash")
         select 'zzht.old','สมหมาย พนักงานเดิม','EMPLOYEE','${team}',"passwordHash" from "User" where "employeeCode"='A001'`);
    const NOTICE_PHONE = "กดปุ่ม ? ข้างปุ่มรีเฟรช เมื่อไม่แน่ใจว่าหน้านี้ใช้ยังไง — แอปจะชี้ทีละปุ่มให้ดู · ดูทั้งหมดได้ที่เมนู › เอกสารและบัญชี › สอนการใช้งาน";
    {
      const { ctx: oc, page: op } = await open("zzht.old", { auto: true });
      const notice = op.locator('[data-otteri-howto] [role="dialog"][aria-label="ใหม่: วิธีใช้หน้านี้"]');
      const nt = await waitPrompt(op, "notice");
      nt === "found" && (await ringAround(op, "app.help")) && (await op.locator("[data-howto-prompt=welcome]").count()) === 0
        ? pass("พนักงานเดิมเปิดแอป → ข้อความแนะนำ (ไม่ใช่กล่องต้อนรับ) กรอบล้อมปุ่ม ?") : fail(`ข้อความแนะนำ: ${nt} · กรอบ ${await ringAround(op, "app.help")}`);
      (await notice.getByText("ใหม่: วิธีใช้หน้านี้", { exact: true }).count()) === 1 &&
      (await notice.getByText(NOTICE_PHONE, { exact: true }).count()) === 1 &&
      (await notice.locator('[aria-label="ข้าม"], [aria-label="ย้อนกลับ"], [aria-label="ถัดไป"]').count()) === 0
        ? pass('ข้อความแนะนำ: "ใหม่: วิธีใช้หน้านี้" · "กดปุ่ม ? ข้างปุ่มรีเฟรช เมื่อไม่แน่ใจ…" · ปุ่มเดียว เข้าใจแล้ว')
        : fail(`ข้อความแนะนำไม่ตรง: ${(await layerText(op)).replace(/\s+/g, " ").slice(0, 300)}`);
      const nBox = await notice.boundingBox();
      const ring = await op.locator("[data-howto-ring]").boundingBox();
      nBox && ring && nBox.y >= ring.y + ring.height
        ? pass("ข้อความแนะนำอยู่ใต้ปุ่ม ? (ชี้ลงมาจากแถบหัว)") : fail(`ตำแหน่งข้อความแนะนำ ${JSON.stringify(nBox)} · กรอบ ${JSON.stringify(ring)}`);
      flags("zzht.old") === "false|false|false|0" ? pass("ยังไม่ตอบ — ฐานข้อมูลยัง NULL") : fail(`ก่อนตอบ: ${flags("zzht.old")}`);
      await op.screenshot({ path: path.join(DIR, "howto-11-notice.png") });
      await notice.locator('[aria-label="เข้าใจแล้ว"]').click();
      const nAfter = await flagsBecome(op, "zzht.old", "false|false|true|0");
      await op.waitForTimeout(500);
      (await op.locator("[data-otteri-howto]").count()) === 0 && (await inertOf(op)) === 0 && nAfter === "false|false|true|0"
        ? pass("เข้าใจแล้ว → กล่องหาย ไม่เหลือ inert · ฐานข้อมูลจด notice (ไม่ใช่ welcome)") : fail(`หลังเข้าใจแล้ว: ${nAfter} · inert ${await inertOf(op)}`);
      await op.reload({ waitUntil: "networkidle", timeout: 180000 });
      await op.waitForTimeout(6000);
      (await op.locator("[data-otteri-howto]").count()) === 0 ? pass("เปิดแอปรอบสอง: ข้อความแนะนำไม่ขึ้นซ้ำ") : fail("ข้อความแนะนำขึ้นซ้ำ");
      await oc.close();
    }

    // ── พนักงานเดิม จอคอม 1366: คำบอกที่อยู่ปุ่มเป็น "วิธีใช้หน้านี้" · Esc = เข้าใจแล้ว ──
    sql(`update "User" set "howtoSeen"=null where "employeeCode"='zzht.old'`);
    {
      const { ctx: wc2, page: wp2 } = await open("zzht.old", { width: 1366, height: 900, auto: true });
      const notice = wp2.locator('[data-otteri-howto] [role="dialog"][aria-label="ใหม่: วิธีใช้หน้านี้"]');
      const nt = await waitPrompt(wp2, "notice");
      const wideText = 'กดปุ่ม "วิธีใช้หน้านี้" ข้างปุ่มรีเฟรช เมื่อไม่แน่ใจว่าหน้านี้ใช้ยังไง — แอปจะชี้ทีละปุ่มให้ดู · ดูทั้งหมดได้ที่เมนู › เอกสารและบัญชี › สอนการใช้งาน';
      nt === "found" && (await ringAround(wp2, "app.help")) && (await notice.getByText(wideText, { exact: true }).count()) === 1
        ? pass('จอคอม: ข้อความแนะนำบอก "ปุ่ม "วิธีใช้หน้านี้" ข้างปุ่มรีเฟรช" กรอบล้อมปุ่มที่มีชื่อ') : fail(`จอคอม ข้อความแนะนำ: ${nt} · ${(await layerText(wp2)).replace(/\s+/g, " ").slice(0, 200)}`);
      await wp2.keyboard.press("Escape");
      const wAfter = await flagsBecome(wp2, "zzht.old", "false|false|true|0");
      await wp2.waitForTimeout(500);
      (await wp2.locator("[data-otteri-howto]").count()) === 0 && wAfter === "false|false|true|0"
        ? pass("จอคอม: Esc = เข้าใจแล้ว (กล่องหาย · ฐานข้อมูลจด notice)") : fail(`Esc บนข้อความแนะนำ: ${wAfter}`);
      await wc2.close();
    }

    // ── ดูในฐานะ: แอดมินดูเป็นบัญชีใหม่ (pending) — ไม่มีกล่องขึ้นเอง · ปุ่ม ? เล่นได้จนจบ · ไม่บันทึกอะไรเลย ──
    sql(`update "User" set "howtoSeen"='{"pending": true}'::jsonb where "employeeCode"='zzht.new'`);
    {
      const before = sql(`select "howtoSeen"::text from "User" where "employeeCode"='zzht.new'`);
      const { ctx: vc, page: vp } = await open("A001", { width: 1366, height: 900, auto: true });
      const writes = [];
      vp.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/auth/howto")) writes.push(r.url());
      });
      const vl = (l) => vp.locator(`[aria-label="${l}"]`).locator("visible=true");
      await vp.waitForTimeout(1500);
      (await vp.locator("[data-otteri-howto]").count()) === 0 ? pass("A001 (ตอบแล้วจาก seed:test) ไม่มีกล่องขึ้นเอง") : fail("A001 มีกล่องขึ้นเอง — รัน seed:test แล้วหรือยัง");
      await vl("ดูในฐานะผู้ใช้อื่น").first().click();
      await vp.waitForTimeout(1500);
      await vl("ค้นหาผู้ใช้ที่จะดู").fill("zzht.new");
      await vp.waitForTimeout(800);
      await vp.locator('[aria-label^="เลือก "]').locator("visible=true").first().click();
      await vp.waitForTimeout(300);
      await vl("ดูในฐานะคนนี้").click();
      await vp.waitForTimeout(4000);
      const viewing = (await vp.getByText("กำลังดูในฐานะ", { exact: false }).locator("visible=true").count()) > 0;
      await vp.waitForTimeout(3000); // กล่องที่ขึ้นเองรอ 0.8 วิหลังหน้าพร้อม + ถามเซิร์ฟเวอร์ — ให้เวลาเกินพอ
      viewing && (await vp.locator("[data-otteri-howto]").count()) === 0
        ? pass("ดูในฐานะบัญชีใหม่ (pending): ไม่มีกล่องต้อนรับ") : fail(`ดูในฐานะ: แถบ ${viewing} · ชั้นกล่อง ${await vp.locator("[data-otteri-howto]").count()}`);
      await vl("วิธีใช้หน้านี้").first().click();
      let finished = false;
      let steps = 0;
      for (let k = 0; k < 12 && !finished; k++) {
        await vp
          .waitForFunction(() => {
            const h = document.querySelector("[data-howto-tour]");
            return !!h && h.getAttribute("data-howto-target") !== "seek" && !!document.querySelector('[data-otteri-howto] [role="dialog"]');
          }, null, { timeout: 9000 })
          .catch(() => {});
        await vp.waitForTimeout(250);
        if (!(await vp.locator("[data-howto-tour]").count())) break;
        steps++;
        const done = vp.locator('[data-otteri-howto] [aria-label="เข้าใจแล้ว"]');
        if (await done.count()) {
          await done.click();
          finished = true;
        } else await vp.locator('[data-otteri-howto] [aria-label="ถัดไป"]').click();
      }
      const doneToast = vp.getByText('ดูวิธีใช้อีกครั้ง กดปุ่ม "วิธีใช้หน้านี้" ข้างปุ่มรีเฟรช', { exact: true }).locator("visible=true");
      await doneToast.waitFor({ timeout: 4000 }).catch(() => {});
      finished && (await doneToast.count()) === 1
        ? pass(`ดูในฐานะ: ปุ่ม ? เล่นงานของฉันวันนี้ได้จนจบ (${steps} ขั้น) · แถบข้อความหลังจบ`) : fail(`ดูในฐานะ: เล่นไม่จบ (${steps} ขั้น)`);
      await vp.waitForTimeout(1500);
      const after = sql(`select "howtoSeen"::text from "User" where "employeeCode"='zzht.new'`);
      after === before && writes.length === 0
        ? pass("ดูในฐานะ: ฐานข้อมูลของคนที่ถูกดูไม่เปลี่ยน (ยัง pending) · ไม่มีคำขอ POST /auth/howto เลย")
        : fail(`ดูในฐานะบันทึก: ${before} → ${after} · คำขอ ${writes.length}`);
      await vl("กลับเป็นตัวเอง").first().click();
      await vp.waitForTimeout(4000);
      (await vl("ดูในฐานะผู้ใช้อื่น").count()) > 0 && (await vp.locator("[data-otteri-howto]").count()) === 0 && writes.length === 0
        ? pass("กลับเป็นตัวเอง: ไม่มีกล่องขึ้นเอง ไม่มีการจด") : fail("กลับเป็นตัวเองแล้วมีกล่อง/การจด");
      await vc.close();
    }

    // ══════════ ก้อน 5: ใบงานซ่อม · งานของฉันวันนี้ของหัวหน้าภาค/แอดมิน · หน้าใบงาน (จอคอม 1366) ══════════
    /** รอขั้น n ของวิธีใช้ในหน้า p ขึ้นจอ (หาเจอ/กลางจอ) — คืน found/center หรือข้อความบอกว่าค้างที่ไหน */
    const stepOn = async (p, n, ms = 9000) => {
      const h = p.locator("[data-howto-tour]");
      const b = p.locator('[data-otteri-howto] [role="dialog"]');
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const step = await h.getAttribute("data-howto-step").catch(() => null);
        const target = await h.getAttribute("data-howto-target").catch(() => null);
        if (step === String(n) && target && target !== "seek" && (await b.count())) {
          await p.waitForTimeout(250); // จางเข้า 150 ms
          return target;
        }
        await p.waitForTimeout(150);
      }
      return `ไม่ขึ้น (ขั้น ${await h.getAttribute("data-howto-step").catch(() => null)} · ${await h.getAttribute("data-howto-target").catch(() => null)})`;
    };
    const hostAttr = (p, name) => p.locator("[data-howto-tour]").getAttribute(name).catch(() => null);
    const boxOf = (p) => p.locator('[data-otteri-howto] [role="dialog"]');
    const pressIn = (p, label) => boxOf(p).locator(`[aria-label="${label}"]`).click();
    /** กด "ถัดไป" จนถึงขั้นสุดท้าย — คืน "ขั้น:found|center" ของทุกขั้นที่ขึ้นจอ (ขั้นที่หาไม่เจอแล้วข้ามไม่อยู่ในรายการ) */
    const walkOn = async (p, max = 9) => {
      const seen = [];
      for (let k = 0; k < max; k++) {
        await p
          .waitForFunction(() => {
            const h = document.querySelector("[data-howto-tour]");
            return !!h && h.getAttribute("data-howto-target") !== "seek" && !!document.querySelector('[data-otteri-howto] [role="dialog"]');
          }, null, { timeout: 12000 })
          .catch(() => {});
        await p.waitForTimeout(250);
        seen.push(`${await hostAttr(p, "data-howto-step")}:${await hostAttr(p, "data-howto-target")}`);
        if (await boxOf(p).locator('[aria-label="เข้าใจแล้ว"]').count()) break;
        await pressIn(p, "ถัดไป");
      }
      return seen;
    };
    /** หน้าต่างใบงานที่เปิดอยู่ (แถบขั้นตอนที่มองเห็น) — ใบงานที่วิธีใช้เปิดให้ยังเปิดอยู่ไหม */
    const orderWindows = (p) => p.locator('[aria-label="ขั้นตอนงาน"]').locator("visible=true").count();

    // ใบรอแอดมินเช็คอะไหล่ (ขั้นของแอดมิน) — รายการ "ที่ยังค้าง" ของ A001 มีใบที่ถึงคิวแอดมินแน่ ๆ ไม่ขึ้นกับข้อมูลในเครื่อง
    const adminJob = await fx.workOrder("C0006", null);
    await call(fx.supervisor(), "POST", `/work-orders/${adminJob.id}/parts`, {
      needsParts: true,
      parts: [{ sparePartId: fx.fxPart(adminJob.id, "BOARD"), quantity: 1 }],
    });
    const adminJobActor = (await call(fx.A, "GET", `/work-orders/${adminJob.id}`)).stageActor;
    adminJobActor === "ADMIN"
      ? pass(`เตรียม: ${adminJob.code} รอแอดมิน (${sql(`select status from "WorkOrder" where id=${adminJob.id}`)})`)
      : fail(`เตรียมใบรอแอดมินไม่ได้: ขั้นของ ${adminJob.code} เป็นของ ${adminJobActor}`);

    // ── A001 จอคอม: งานของฉันวันนี้ 6 ขั้น · ใบงานซ่อม 7 ขั้น เปิดใบงานให้ดู · ย้อนกลับ · Esc ไม่ปิดหน้าต่าง · แถบข้อความรอ ──
    {
      const aSeen = () => sql(`select coalesce("howtoSeen"->'tours'::text,'{}') from "User" where "employeeCode"='A001'`);
      const aBefore = aSeen();
      const { ctx: ac, page: ap } = await open("A001", { width: 1366, height: 900 });
      const av = (sel) => ap.locator(sel).locator("visible=true");

      // งานของฉันวันนี้ (MyQueue) ของแอดมินทั่วไป — 6 ขั้น (ขั้น 7 เป็นของ Super Admin เท่านั้น)
      await av('[aria-label="วิธีใช้หน้านี้"]').first().click();
      const m1 = await stepOn(ap, 1);
      m1 === "center" && (await hostAttr(ap, "data-howto-tour")) === "admin.myday" && (await hostAttr(ap, "data-howto-total")) === "6"
        ? pass("แอดมิน งานของฉันวันนี้: ? → 6 ขั้น ขั้น 1 กลางจอ (ไม่มีขั้น Super Admin)") : fail(`แอดมิน งานของฉันวันนี้: ขั้น 1 ${m1} · ${await hostAttr(ap, "data-howto-tour")} · ${await hostAttr(ap, "data-howto-total")} ขั้น`);
      await ap.keyboard.press("Escape");
      // แถบข้อความข้ามบนจอคอมอยู่กลางบน — รอให้หายเองก่อนกดเมนู
      await ap.getByText(/^ข้ามแล้ว · /).locator("visible=true").waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});

      await av('[data-testid="howto-menu.wo"]').first().click();
      await ap.waitForTimeout(2500);
      (await ap.getByText("วิธีใช้หน้านี้", { exact: true }).locator("visible=true").count()) === 1
        ? pass('ใบงานซ่อม จอคอม: ปุ่ม "วิธีใช้หน้านี้" มีชื่อ') : fail("ใบงานซ่อม: ไม่เห็นปุ่ม วิธีใช้หน้านี้");
      await av('[aria-label="วิธีใช้หน้านี้"]').first().click();
      const o1 = await stepOn(ap, 1);
      // เมนูค้างสูงเต็มจอ — กรอบถูกตัดที่ขอบจอ เทียบทั้งตัวแบบปุ่มอื่นไม่ได้ ดูแค่ว่ากรอบชิดซ้าย
      const sideRing = await ap.locator("[data-howto-ring]").boundingBox().catch(() => null);
      o1 === "found" && (await hostAttr(ap, "data-howto-tour")) === "admin.orders" && (await hostAttr(ap, "data-howto-total")) === "7" && !!sideRing && sideRing.x <= 1
        ? pass("ใบงานซ่อม (แอดมิน จอคอม): 7 ขั้น ขั้น 1 กรอบล้อมเมนูด้านซ้าย") : fail(`ใบงานซ่อม ขั้น 1: ${o1} · ${await hostAttr(ap, "data-howto-tour")} · ${await hostAttr(ap, "data-howto-total")} ขั้น`);
      const list = [];
      for (const [n, id] of [[2, "orders.tabs"], [3, "orders.quick"], [4, "orders.who"], [5, "orders.add"]]) {
        await pressIn(ap, "ถัดไป");
        list.push(`${n}:${await stepOn(ap, n)}:${(await ringAround(ap, id)) ? "ล้อม" : "ไม่ล้อม"}`);
      }
      list.join(" ") === "2:found:ล้อม 3:found:ล้อม 4:found:ล้อม 5:found:ล้อม"
        ? pass("ขั้น 2–5 กรอบล้อมแถบแท็บ · ต้องรีบดู · ป้ายรอใคร · เพิ่มใบงาน") : fail(`ขั้น 2–5: ${list.join(" ")}`);
      (await orderWindows(ap)) === 0 ? pass("ก่อนขั้น 6 ยังไม่มีหน้าต่างใบงาน") : fail("มีหน้าต่างใบงานเปิดก่อนขั้น 6");

      // ขั้น 6: แอปเปิดใบงานให้เอง — ใบที่ถึงคิวแอดมิน ไม่ใช่ใบรอตรวจเคลม
      await pressIn(ap, "ถัดไป");
      const o6 = await stepOn(ap, 6, 15000);
      const note = ((await layerText(ap)).match(/เปิดใบงาน (\S+) ให้ดูแล้ว — ไม่ต้องกด/) || [])[1] ?? "";
      const openedRow = note ? sql(`select id||'|'||status from "WorkOrder" where code='${note}'`) : "";
      const [openedId, openedStatus] = openedRow.split("|");
      const openedActor = openedId ? (await call(fx.A, "GET", `/work-orders/${openedId}`)).stageActor : null;
      o6 === "found" && (await ringAround(ap, "order.steps")) && (await orderWindows(ap)) >= 1 &&
      (await ap.getByText(note, { exact: true }).locator("visible=true").count()) >= 1
        ? pass(`ขั้น 6: แอปเปิดหน้าต่างใบงาน ${note} ให้ · กรอบล้อมแถบขั้นตอนในหน้าต่าง · กล่องเล็กบอกรหัสใบ`) : fail(`ขั้น 6: ${o6} · กล่องเล็ก "${note}" · หน้าต่าง ${await orderWindows(ap)}`);
      openedActor === "ADMIN" && openedStatus && openedStatus !== "CLAIM_REVIEW"
        ? pass(`ใบที่เปิดให้ถึงคิวแอดมิน (API stageActor ADMIN · ฐานข้อมูล ${openedStatus} ไม่ใช่ CLAIM_REVIEW)`) : fail(`ใบที่เปิดให้: ${note} · ${openedStatus} · ขั้นของ ${openedActor}`);
      // กล่องอยู่เหนือหน้าต่างใบงาน — จุดกลางกล่องเป็นของชั้นวิธีใช้ ชั้นเป็นลูกของ <body> เหนือ Modal ใต้ชั้นแจ้งผล
      const layering = await ap.evaluate(() => {
        const box = document.querySelector('[data-otteri-howto] [role="dialog"]');
        const layer = document.querySelector("[data-otteri-howto]");
        if (!box || !layer) return null;
        const r = box.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
        return { top: !!el?.closest("[data-otteri-howto]"), z: Number(getComputedStyle(layer).zIndex), body: layer.parentElement === document.body };
      });
      layering && layering.top && layering.body && layering.z > 9999 && layering.z < 2147483000
        ? pass(`กล่องอยู่บนสุดเหนือหน้าต่างใบงาน (ชั้นใน <body> z ${layering.z})`) : fail(`ชั้นของกล่องตอนเปิดใบงาน: ${JSON.stringify(layering)}`);
      await ap.screenshot({ path: path.join(DIR, "howto-12-admin-order.png") });

      // ขั้น 7 ชี้ปุ่มของขั้นจริง (ใบถึงคิวแอดมิน) · ย้อนกลับไปขั้น 6 ใบยังเปิด · ย้อนกลับไปขั้น 5 ใบปิด
      await pressIn(ap, "ถัดไป");
      const o7 = await stepOn(ap, 7);
      o7 === "found" && (await ringAround(ap, "order.action"))
        ? pass("ขั้น 7 กรอบล้อมแถวปุ่มของขั้นในใบที่เปิดให้") : fail(`ขั้น 7: ${o7}`);
      await pressIn(ap, "ย้อนกลับ");
      const b6 = await stepOn(ap, 6);
      b6 === "found" && (await orderWindows(ap)) >= 1 ? pass("ย้อนกลับไปขั้น 6 → ใบงานยังเปิดอยู่") : fail(`ย้อนกลับไปขั้น 6: ${b6} · หน้าต่าง ${await orderWindows(ap)}`);
      await pressIn(ap, "ย้อนกลับ");
      const b5 = await stepOn(ap, 5);
      await ap.waitForTimeout(800);
      b5 === "found" && (await orderWindows(ap)) === 0 && (await ringAround(ap, "orders.add"))
        ? pass("ย้อนกลับไปขั้น 5 → หน้าต่างใบงานที่แอปเปิดให้ปิดคืน · กรอบกลับมาที่ปุ่มเพิ่มใบงาน") : fail(`ย้อนกลับไปขั้น 5: ${b5} · หน้าต่าง ${await orderWindows(ap)}`);
      await pressIn(ap, "ถัดไป");
      const a6 = await stepOn(ap, 6, 15000);
      const note2 = ((await layerText(ap)).match(/เปิดใบงาน (\S+) ให้ดูแล้ว — ไม่ต้องกด/) || [])[1] ?? "";
      a6 === "found" && (await orderWindows(ap)) >= 1 && note2 === note
        ? pass(`ถัดไปอีกครั้ง → เปิดใบเดิม (${note2}) ให้อีกรอบ`) : fail(`ถัดไปอีกครั้ง: ${a6} · ${note2} · หน้าต่าง ${await orderWindows(ap)}`);

      // Esc = ข้าม: กล่องหาย แต่หน้าต่างใบงานต้องไม่ปิด และแถบข้อความรอจนปิดหน้าต่าง (ไม่บังปุ่มที่เพิ่งชี้)
      await ap.keyboard.press("Escape");
      await ap.waitForTimeout(1500);
      const skipText = 'ข้ามแล้ว · ดูวิธีใช้อีกครั้ง กดปุ่ม "วิธีใช้หน้านี้" ข้างปุ่มรีเฟรช';
      const skipToast = ap.getByText(skipText, { exact: true }).locator("visible=true");
      (await ap.locator("[data-otteri-howto]").count()) === 0 && (await orderWindows(ap)) >= 1 && (await inertOf(ap)) === 0
        ? pass("Esc → กล่องหาย ไม่เหลือ inert · หน้าต่างใบงานยังเปิดอยู่") : fail(`Esc: ชั้น ${await ap.locator("[data-otteri-howto]").count()} · หน้าต่าง ${await orderWindows(ap)} · inert ${await inertOf(ap)}`);
      (await skipToast.count()) === 0 ? pass("ระหว่างหน้าต่างใบงานยังเปิด ไม่มีแถบข้อความ (รอไว้)") : fail("แถบข้อความขึ้นทับหน้าต่างใบงานทันที");
      (await av('[data-testid="howto-order.help"]').count()) === 1 && (await av('[data-testid="howto-order.help"]').getAttribute("aria-label")) === "วิธีใช้หน้านี้"
        ? pass("หน้าต่างใบงานมีปุ่ม ? (วิธีใช้หน้านี้) ของตัวเอง") : fail(`ปุ่ม ? ในหน้าต่างใบงาน: ${await av('[data-testid="howto-order.help"]').count()}`);
      // ปิดหน้าต่างด้วย ✕ ในหัวหน้าต่าง (แถวเดียวกับปุ่ม ?) → แถบข้อความที่รอไว้ขึ้น
      await av('[data-testid="howto-order.help"]').first().locator("xpath=../..").locator('[aria-label="ปิด"]').first().click();
      await skipToast.waitFor({ timeout: 5000 }).catch(() => {});
      (await skipToast.count()) === 1 && (await orderWindows(ap)) === 0
        ? pass(`ปิดหน้าต่างใบงาน → แถบ "${skipText}" ขึ้น`) : fail(`ปิดหน้าต่างแล้ว: แถบ ${await skipToast.count()} · หน้าต่าง ${await orderWindows(ap)}`);
      aSeen() === aBefore ? pass("A001 ข้ามทุกรอบ — ฐานข้อมูลไม่ถูกจด") : fail(`A001 ถูกจด: ${aBefore} → ${aSeen()}`);
      await ac.close();
    }

    // ── หลบหน้าโหลด: ดูในฐานะ S001 → ใบงานซ่อม → ขั้นที่เปิดใบงานเจอ 401 viewAsEnded → แอปกลับเป็นตัวเองพร้อมหน้าโหลดเต็มจอ ──
    // (ทางจริงทางเดียวที่หน้าโหลด/กล่องยืนยันของแอปขึ้นระหว่างวิธีใช้ยังเล่นอยู่ — แผนงานข้อ 8.4 · การกลับมาหลังหน้าโหลดปิดตรวจด้วยการอ่านโค้ด)
    {
      viewLogMax = Number(sql(`select coalesce(max(id),0) from "ViewAsLog"`));
      const { ctx: pc, page: pp } = await open("A001", { width: 1366, height: 900 });
      const pv = (sel) => pp.locator(sel).locator("visible=true");
      await pv('[aria-label="ดูในฐานะผู้ใช้อื่น"]').first().click();
      await pp.waitForTimeout(1500);
      await pv('[aria-label="ตำแหน่ง หัวหน้าภาค"]').first().click();
      await pp.waitForTimeout(400);
      await pv('[aria-label="ค้นหาผู้ใช้ที่จะดู"]').fill("S001");
      await pp.waitForTimeout(800);
      await pp.locator('[aria-label^="เลือก "]').locator("visible=true").first().click();
      await pp.waitForTimeout(300);
      await pv('[aria-label="ดูในฐานะคนนี้"]').click();
      await pp.waitForTimeout(4000);
      const viewing = (await pp.getByText("กำลังดูในฐานะ", { exact: false }).locator("visible=true").count()) > 0;
      await pv('[data-testid="howto-menu.wo"]').first().click();
      await pp.waitForTimeout(2500);
      await pv('[aria-label="วิธีใช้หน้านี้"]').first().click();
      const p1 = await stepOn(pp, 1);
      viewing && p1 === "found" && (await hostAttr(pp, "data-howto-tour")) === "sup.orders" && (await hostAttr(pp, "data-howto-total")) === "6"
        ? pass("ดูในฐานะ S001 · ใบงานซ่อม: ? → วิธีใช้ของหัวหน้าภาค 6 ขั้น") : fail(`ดูในฐานะ S001: แถบ ${viewing} · ขั้น 1 ${p1} · ${await hostAttr(pp, "data-howto-tour")}`);
      const pList = [];
      for (const n of [2, 3, 4]) {
        await pressIn(pp, "ถัดไป");
        pList.push(`${n}:${await stepOn(pp, n)}`);
      }
      // ขั้น 2 แท็บย่อยมีเฉพาะในกล่องงาน — เปิดจากเมนูใบงานซ่อม (ที่ยังค้าง) จึงขึ้นกลางจอ
      pList.join(" ") === "2:center 3:found 4:found" ? pass("หัวหน้าภาค ขั้น 2 กลางจอ (ไม่ได้อยู่กล่องงาน) · ขั้น 3–4 ชี้ของจริง") : fail(`หัวหน้าภาค ขั้น 2–4: ${pList.join(" ")}`);

      const detailGets = [];
      const DETAIL = /\/api\/work-orders\/\d+(\?.*)?$/;
      await pp.route(DETAIL, (route) => {
        if (route.request().method() !== "GET") return route.continue();
        detailGets.push(route.request().url());
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "หมดสิทธิ์ดูในฐานะผู้ใช้นี้แล้ว", viewAsEnded: true }),
        });
      });
      let stops = 0;
      await pp.route("**/api/auth/view-as/stop", async (route) => {
        stops++;
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue().catch(() => {});
      });
      await pressIn(pp, "ถัดไป");
      const loader = pp.locator("[data-otteri-overlay]").getByText("กำลังบันทึก...", { exact: true }).locator("visible=true");
      const loaderOn = await loader.waitFor({ timeout: 6000 }).then(() => true, () => false);
      await pp.waitForTimeout(300);
      const during = {
        loader: await loader.count(),
        boxes: await boxOf(pp).count(),
        host: await pp.locator("[data-howto-tour]").count(),
        inert: await inertOf(pp),
        windows: await pp.locator('[aria-label="ปิดหน้าต่าง"]').count(),
      };
      loaderOn && detailGets.length >= 1 && during.boxes === 0 && during.host === 1 && during.inert > 0 && during.windows > 0
        ? pass("หน้าโหลดเต็มจอขึ้นระหว่างเล่น → กล่องหลบ (ไม่วาด) แต่ชั้นยังอยู่ หน้าข้างหลังยัง inert · หน้าต่างใบงานเปิดอยู่")
        : fail(`ระหว่างหน้าโหลด: ${JSON.stringify({ loaderOn, gets: detailGets.length, ...during })}`);
      await pp.screenshot({ path: path.join(DIR, "howto-13-paused-loader.png") });
      // Esc ระหว่างหลบ: ถูกกินเฉย ๆ — ไม่ข้าม ไม่ปิดหน้าต่างใบงานใต้หน้าโหลด (หน้าโหลด/กล่องยืนยันไม่มี Esc ของตัวเอง)
      await pp.keyboard.press("Escape");
      await pp.waitForTimeout(400);
      const afterEsc = {
        loader: await loader.count(),
        host: await pp.locator("[data-howto-tour]").count(),
        inert: await inertOf(pp),
        windows: await pp.locator('[aria-label="ปิดหน้าต่าง"]').count(),
      };
      afterEsc.loader === 1 && afterEsc.host === 1 && afterEsc.inert === during.inert && afterEsc.windows === during.windows
        ? pass("Esc ระหว่างหน้าโหลด: หน้าต่างใบงานไม่ปิด · วิธีใช้ไม่ข้าม · inert เท่าเดิม") : fail(`Esc ระหว่างหน้าโหลด: ${JSON.stringify({ during, afterEsc })}`);
      // ปล่อยคำขอ → กลับเป็น A001 (MainNavigator ขึ้นใหม่) — ไม่มีวิธีใช้ค้าง ไม่เหลือ inert
      await pp.waitForTimeout(5500);
      (await pv('[aria-label="ดูในฐานะผู้ใช้อื่น"]').count()) > 0 && (await pp.getByText("กำลังดูในฐานะ", { exact: false }).locator("visible=true").count()) === 0 &&
      (await pp.locator("[data-otteri-howto]").count()) === 0 && (await inertOf(pp)) === 0 && stops >= 1
        ? pass("ปล่อยหน้าโหลดแล้วกลับเป็น A001 · ไม่มีวิธีใช้ค้าง ไม่เหลือ inert") : fail(`หลังปล่อย: ชั้น ${await pp.locator("[data-otteri-howto]").count()} · inert ${await inertOf(pp)} · คำขอ stop ${stops}`);
      await pp.unroute(DETAIL);
      await pp.unroute("**/api/auth/view-as/stop");
      await pc.close();
    }

    // ── หัวหน้าภาค S001 จอคอม: ขั้น 7 "เวลาปิดนัดงานพรุ่งนี้" บอกเวลาที่แอดมินตั้งจริง (เจ้าของงานตอบ 4.2) ──
    {
      const was = (await call(fx.A, "GET", "/settings/dispatch-cutoff")).time;
      const want = was === "15:30" ? "16:30" : "15:30";
      const cutMax = Number(sql(`select coalesce(max(id),0) from "AppSetting" where key='dispatchCutoff'`));
      sql(`insert into "AppSetting"(key,value) values ('${CUT_MARK}','${cutMax}')`);
      const put = await call(fx.A, "PUT", "/settings/dispatch-cutoff", { time: want });
      const latestCut = () => sql(`select coalesce((select value from "AppSetting" where key='dispatchCutoff' order by id desc limit 1),'16:00')`);
      put.time === want && latestCut() === want
        ? pass(`ตั้งเวลาปิดนัด ${was} → ${want} ผ่านหน้าตั้งค่าของแอดมิน (ฐานข้อมูลแถวล่าสุด ${want})`) : fail(`ตั้งเวลาปิดนัดไม่ได้: ${JSON.stringify(put)} · ฐานข้อมูล ${latestCut()}`);

      const sSeen = () => sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='S001'`);
      const sBefore = sSeen();
      const { ctx: uc, page: up } = await open("S001", { width: 1366, height: 900 });
      const uv = (sel) => up.locator(sel).locator("visible=true");
      /** เล่นงานของฉันวันนี้จนขั้นสุดท้าย — คืนข้อความในกล่องขั้นสุดท้าย (แล้วกด Esc ข้าม ไม่จด) */
      const lastStepText = async () => {
        await uv('[aria-label="วิธีใช้หน้านี้"]').first().click();
        const seen = await walkOn(up);
        const total = await hostAttr(up, "data-howto-total");
        const tour = await hostAttr(up, "data-howto-tour");
        const text = (await boxOf(up).innerText().catch(() => "")).replace(/\s+/g, " ");
        return { seen, total, tour, text };
      };
      const r1 = await lastStepText();
      const last1 = r1.seen[r1.seen.length - 1] ?? "";
      r1.tour === "sup.myday" && r1.total === "7" && /^7:(found|center)$/.test(last1) && r1.text.includes("เวลาปิดนัดงานพรุ่งนี้")
        ? pass(`หัวหน้าภาค งานของฉันวันนี้ 7 ขั้น (${r1.seen.join(" ")}) · ขั้น 7 "เวลาปิดนัดงานพรุ่งนี้"`) : fail(`หัวหน้าภาค: ${r1.tour} · ${r1.total} ขั้น · ${r1.seen.join(" ")}`);
      r1.text.includes(`พรุ่งนี้นัดได้ถึง ${want} น.`) && !r1.text.includes("ปกติ 16:00")
        ? pass(`ขั้น 7 บอกเวลาปิดที่ตั้งใหม่ "พรุ่งนี้นัดได้ถึง ${want} น." (ไม่ใช่ 16:00 ที่เขียนตาย)`) : fail(`ขั้น 7 ไม่บอกเวลาที่ตั้ง: ${r1.text.slice(0, 260)}`);
      !r1.text.includes("ทัวร์") ? pass('กล่องไม่มีคำว่า "ทัวร์"') : fail('กล่องมีคำว่า "ทัวร์"');
      // กรอบหัวกลุ่ม/ปุ่มของขั้นอยู่เฉพาะกลุ่มตามขั้น — หัวข้อปัก (แอดมินตอบแล้ว ฯลฯ) ไม่มีชื่อนี้
      const pinned = await up.evaluate(() =>
        [...document.querySelectorAll('[data-testid="howto-queue.group"]')].filter((el) => /แอดมินตอบแล้ว|หัวหน้าภาคส่งให้ตรวจสอบ|ขอนัดด่วน|เลยนัด/.test(el.textContent || "")).length,
      );
      pinned === 0 ? pass("หัวหน้าภาค: กรอบหัวกลุ่มไม่อยู่บนหัวข้อปัก") : fail(`หัวข้อปักมีชื่อ queue.group ${pinned} กลุ่ม`);
      await up.screenshot({ path: path.join(DIR, "howto-14-sup-cutoff.png") });
      await up.keyboard.press("Escape");
      await up.waitForTimeout(600);

      // คืนค่าเดิม (ลบแถวที่เทสต์เพิ่ม) แล้วเปิดแอปใหม่ — กล่องต้องบอกเวลาเดิม ไม่ใช่ค่าที่จำไว้ในเครื่อง
      await restoreCutoff();
      const leftRows = sql(`select count(*) from "AppSetting" where key='dispatchCutoff' and id > ${cutMax}`);
      leftRows === "0" && latestCut() === was ? pass(`คืนเวลาปิดนัดเป็น ${was} (ฐานข้อมูลไม่เหลือแถวที่เทสต์เพิ่ม)`) : fail(`คืนเวลาปิดนัด: เหลือ ${leftRows} แถว · ล่าสุด ${latestCut()}`);
      await up.reload({ waitUntil: "networkidle", timeout: 180000 });
      await up.waitForTimeout(4000);
      const r2 = await lastStepText();
      r2.text.includes(`พรุ่งนี้นัดได้ถึง ${was} น.`) && !r2.text.includes(`ถึง ${want} น.`)
        ? pass(`คืนค่าแล้วขั้น 7 บอก "พรุ่งนี้นัดได้ถึง ${was} น." ตามค่าจริง`) : fail(`หลังคืนค่า ขั้น 7: ${r2.text.slice(0, 260)}`);
      await up.keyboard.press("Escape");
      await up.waitForTimeout(600);
      sSeen() === sBefore ? pass("S001 ข้ามทุกรอบ — ฐานข้อมูลไม่ถูกจด") : fail(`S001 ถูกจด: ${sBefore} → ${sSeen()}`);
      await uc.close();
    }

    // ── Super Admin (บัญชีชั่วคราว ดูแล้ว) จอคอม: งานของฉันวันนี้ 7 ขั้น · ขั้น 7 กางกลุ่ม "ผู้ดูแลระบบ" ชี้ "สำรองข้อมูล" ──
    // สร้างท้ายสุด: ระหว่างมี Super Admin เพิ่มอีกคน กติกาบางข้อของแอดมินทั่วไปเปลี่ยน (ตั้งรหัสใหม่ให้แอดมินคนอื่น ฯลฯ)
    const seenIso = new Date().toISOString();
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","howtoSeen")
         select 'zzht.super','ซุปเปอร์ ทดสอบวิธีใช้','SUPER_ADMIN',"passwordHash",
                '{"welcome": "${seenIso}", "notice": "${seenIso}"}'::jsonb from "User" where "employeeCode"='A001'`);
    {
      const { ctx: zc, page: zp } = await open("zzht.super", { width: 1366, height: 900 });
      const zv = (sel) => zp.locator(sel).locator("visible=true");
      await zv('[aria-label="วิธีใช้หน้านี้"]').first().click();
      const seen = await walkOn(zp);
      const zText = (await boxOf(zp).innerText().catch(() => "")).replace(/\s+/g, " ");
      (await hostAttr(zp, "data-howto-tour")) === "admin.myday" && (await hostAttr(zp, "data-howto-total")) === "7" && seen[seen.length - 1] === "7:found"
        ? pass(`Super Admin งานของฉันวันนี้ 7 ขั้น (${seen.join(" ")})`) : fail(`Super Admin: ${await hostAttr(zp, "data-howto-tour")} · ${await hostAttr(zp, "data-howto-total")} ขั้น · ${seen.join(" ")}`);
      zText.includes("เฉพาะ Super Admin") && zText.includes('"สำรองข้อมูล" อยู่เมนู ผู้ดูแลระบบ') && zText.includes('กางกลุ่ม "ผู้ดูแลระบบ" ให้แล้ว — ไม่ต้องกด') &&
      (await zv('[data-testid="howto-menu.backup"]').count()) >= 1 && (await ringAround(zp, "menu.backup"))
        ? pass('ขั้น 7 "เฉพาะ Super Admin": กางกลุ่ม ผู้ดูแลระบบ ให้ · กรอบล้อม สำรองข้อมูล') : fail(`Super Admin ขั้น 7: ${zText.slice(0, 220)}`);
      (await zp.evaluate(() => localStorage.getItem("otteri-side-groups"))) === GROUPS_SEED
        ? pass("กางกลุ่มให้ดูแต่ไม่เขียนลงเครื่อง") : fail("ค่ากลุ่มเมนูในเครื่องเปลี่ยนระหว่างกางให้ดู");
      const queueMarks = await zp.evaluate(() => ({
        pinnedHeads: [...document.querySelectorAll('[data-testid="howto-queue.group"]')].filter((el) => /ขอนัดด่วน|เลยนัด|หัวหน้าภาคส่งให้ตรวจสอบ/.test(el.textContent || "")).length,
        urgentBtns: [...document.querySelectorAll('[data-testid="howto-queue.actions"]')].filter((el) => /แก้เป็นงานด่วน/.test(el.textContent || "")).length,
      }));
      queueMarks.pinnedHeads === 0 && queueMarks.urgentBtns === 0
        ? pass("แอดมิน: กรอบหัวกลุ่ม/ปุ่มของขั้นไม่อยู่บนกรอบปัก (ขอนัดด่วน · เลยนัด)") : fail(`กรอบบนหัวข้อปัก: ${JSON.stringify(queueMarks)}`);
      await zp.screenshot({ path: path.join(DIR, "howto-15-super-step7.png") });
      await pressIn(zp, "เข้าใจแล้ว");
      const zSeen = () => sql(`select coalesce("howtoSeen"->'tours'->>'admin.myday','') from "User" where "employeeCode"='zzht.super'`);
      let zAt = zSeen();
      for (let k = 0; k < 25 && !zAt; k++) {
        await zp.waitForTimeout(200);
        zAt = zSeen();
      }
      await zp.waitForTimeout(1200);
      zAt && (await zv('[data-testid="howto-menu.backup"]').count()) === 0 && (await inertOf(zp)) === 0
        ? pass(`เข้าใจแล้ว → ฐานข้อมูลจด tours."admin.myday" (${zAt}) · กลุ่ม ผู้ดูแลระบบ ย่อกลับ · ไม่เหลือ inert`)
        : fail(`Super Admin เข้าใจแล้ว: ฐานข้อมูล "${zAt}" · สำรองข้อมูลยังเห็น ${await zv('[data-testid="howto-menu.backup"]').count()}`);
      await zc.close();
    }

    // ══════════ ก้อน 7: ให้ดูวิธีใช้ใหม่ (สิทธิ์ผู้ใช้) + คอลัมน์ "ดูวิธีใช้แล้ว" (การใช้งานแอป) — จอคอม ══════════
    {
      // รายชื่อเรื่องของช่างในแอป (utils/howtoTours) — หน้าการใช้งานแอปนับเทียบรายชื่อนี้ ไม่ใช่จำนวนที่เซิร์ฟเวอร์รู้
      const TECH_TOURS = ["tech.myday", "tech.orders", "tech.order", "tech.close"];
      const techName = "ช่างทดสอบวิธีใช้";
      const seenIds = () =>
        sql(`select coalesce(string_agg(k, ',' order by k),'') from "User" u, jsonb_object_keys(coalesce(u."howtoSeen"->'tours','{}'::jsonb)) k where u."employeeCode"='${TECH}'`)
          .split(",")
          .filter((k) => TECH_TOURS.includes(k));
      const { ctx: mc, page: mp } = await open("A001", { width: 1366, height: 900 });
      const mv = (sel) => mp.locator(sel).locator("visible=true");
      /** หน้าการใช้งานแอป ค้นชื่อช่างทดสอบ — คืนข้อความแถว (ไม่มีแถว = "") และหัวการ์ดรายคน */
      const usageRow = async () => {
        await mv('[aria-label^="การใช้งานแอป"]').first().click();
        await mp.waitForTimeout(3500);
        const box = mp.getByLabel("ค้นหารายชื่อ").locator("visible=true").first();
        await box.fill("");
        await box.fill(techName);
        await mp.waitForTimeout(2500);
        const row = (await mv(`[aria-label="การใช้งานของ ${techName}"]`).first().innerText().catch(() => "")).replace(/\s+/g, " ");
        const title = (await mp.getByText(/^รายคน · /).locator("visible=true").first().innerText().catch(() => "")).replace(/\s+/g, " ");
        return { row, title };
      };
      const ids0 = seenIds();
      const u1 = await usageRow();
      const missing0 = TECH_TOURS.length - ids0.length;
      (await mp.getByText("ดูวิธีใช้แล้ว", { exact: true }).locator("visible=true").count()) >= 1
        ? pass('การใช้งานแอป (จอกว้าง): มีหัวคอลัมน์ "ดูวิธีใช้แล้ว"') : fail("ไม่มีหัวคอลัมน์ ดูวิธีใช้แล้ว");
      ids0.length >= 1 && missing0 >= 1 && u1.row.includes(`${ids0.length}/${TECH_TOURS.length} · ยังขาด `)
        ? pass(`แถว ${techName}: "${ids0.length}/${TECH_TOURS.length} · ยังขาด …" ตรงฐานข้อมูล (ดูแล้ว ${ids0.join(", ")})`)
        : fail(`แถวการใช้งานก่อนตั้งใหม่: "${u1.row.slice(0, 200)}" · ฐานข้อมูล ${ids0.join(",") || "-"}`);
      /^รายคน · 1 คน · ดูวิธีใช้ครบแล้ว 0 คน/.test(u1.title) ? pass(`หัวการ์ด: "${u1.title}"`) : fail(`หัวการ์ดรายคน: "${u1.title}"`);
      await mp.screenshot({ path: path.join(DIR, "howto-16-usage-before.png") });

      // สิทธิ์ผู้ใช้ (กลุ่ม ผู้ดูแลระบบ ย่ออยู่ตามค่าตั้งต้น)
      if (!(await mv('[data-testid="howto-menu.users"]').count())) await mv('[aria-label="กางกลุ่ม ผู้ดูแลระบบ"]').first().click();
      await mp.waitForTimeout(900);
      await mv('[data-testid="howto-menu.users"]').first().click();
      await mp.waitForTimeout(3000);
      const search = mp.getByLabel("ค้นหาผู้ใช้").locator("visible=true").first();
      await search.fill("zzht.area");
      await mp.waitForTimeout(900);
      const areaCards = await mp.getByText("ตั้งรหัสผ่านใหม่ให้", { exact: true }).locator("visible=true").count();
      areaCards >= 1 && (await mv('[aria-label^="ให้ดูวิธีใช้ใหม่ "]').count()) === 0
        ? pass('การ์ดทีม Area (ยังไม่มีวิธีใช้): ไม่มีลิงก์ "ให้ดูวิธีใช้ใหม่"') : fail(`การ์ดทีม Area: การ์ด ${areaCards} · ลิงก์ ${await mv('[aria-label^="ให้ดูวิธีใช้ใหม่ "]').count()}`);
      await search.fill(TECH);
      await mp.waitForTimeout(900);
      const link = mv(`[aria-label="ให้ดูวิธีใช้ใหม่ ${techName}"]`);
      (await link.count()) === 1 && (await link.first().innerText()).includes("ให้ดูวิธีใช้ใหม่")
        ? pass(`การ์ด ${techName}: มีลิงก์ "ให้ดูวิธีใช้ใหม่"`) : fail(`ลิงก์ให้ดูวิธีใช้ใหม่: ${await link.count()}`);
      const dbBefore = sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='${TECH}'`);
      const overlay = mp.locator("[data-otteri-overlay]");
      // ยกเลิก = ไม่มีอะไรเปลี่ยน
      await link.first().click();
      const ask = overlay.getByText(`ให้ ${techName} ดูวิธีใช้ใหม่?`, { exact: true }).locator("visible=true");
      const asked = await ask.waitFor({ timeout: 5000 }).then(() => true, () => false);
      const why = (await overlay.getByText("วิธีใช้จะขึ้นเองตอนเปิดแอปครั้งถัดไป", { exact: false }).locator("visible=true").count()) === 1;
      await overlay.getByText("ยกเลิก", { exact: true }).locator("visible=true").first().click();
      await mp.waitForTimeout(1200);
      asked && why && sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='${TECH}'`) === dbBefore
        ? pass(`กดลิงก์ → กล่องยืนยัน "ให้ ${techName} ดูวิธีใช้ใหม่?" บอกผล · ยกเลิก = ฐานข้อมูลไม่เปลี่ยน`) : fail(`กล่องยืนยัน: ขึ้น ${asked} · คำอธิบาย ${why}`);
      // ยืนยัน → ฐานข้อมูล pending + resetAt + resetBy (A001) · ล้างหน้าที่ดูแล้ว
      const a001 = sql(`select id from "User" where "employeeCode"='A001'`);
      await link.first().click();
      await ask.waitFor({ timeout: 5000 }).catch(() => {});
      await overlay.getByText("ให้ดูวิธีใช้ใหม่", { exact: true }).locator("visible=true").last().click();
      const done = overlay.getByText(`ตั้งให้ ${techName} ดูวิธีใช้ใหม่แล้ว`, { exact: true }).locator("visible=true");
      const toasted = await done.waitFor({ timeout: 6000 }).then(() => true, () => false);
      const reset = sql(`select ("howtoSeen"->>'pending')||'|'||coalesce("howtoSeen"->>'resetBy','')||'|'||(("howtoSeen" ? 'resetAt')::text)||'|'||(("howtoSeen" ? 'tours')::text)
                         from "User" where "employeeCode"='${TECH}'`);
      toasted && reset === `true|${a001}|true|false`
        ? pass(`ยืนยัน → แถบ "ตั้งให้ ${techName} ดูวิธีใช้ใหม่แล้ว" · ฐานข้อมูล pending + resetAt + resetBy=A001 ไม่มีหน้าที่ดูแล้ว`)
        : fail(`ให้ดูวิธีใช้ใหม่: แถบ ${toasted} · ฐานข้อมูล ${reset}`);
      await mp.screenshot({ path: path.join(DIR, "howto-17-reshow.png") });

      // การใช้งานแอปนับใหม่
      const u2 = await usageRow();
      u2.row.includes("ยังไม่ได้ดู") && !u2.row.includes("ยังขาด")
        ? pass(`การใช้งานแอปหลังตั้งใหม่: แถว ${techName} "ยังไม่ได้ดู"`) : fail(`แถวการใช้งานหลังตั้งใหม่: "${u2.row.slice(0, 200)}"`);
      sql(`select ("howtoSeen" ? 'pending')::text from "User" where "employeeCode"='A001'`) === "false"
        ? pass("A001 กดให้คนอื่นดูใหม่ — ค่าของ A001 เองไม่ถูกแตะ") : fail("ค่า howtoSeen ของ A001 ถูกเปลี่ยน");
      await mc.close();

      // ครั้งถัดไปที่ zzht.tech เปิดแอป: กล่องต้อนรับขึ้นเอง · Esc = ไว้ทีหลัง (จด welcome · pending หาย)
      const { ctx: tc, page: tp } = await open(TECH, { auto: true });
      const welcomed = await waitPrompt(tp, "welcome");
      await tp.keyboard.press("Escape");
      const afterWelcome = await flagsBecome(tp, TECH, "false|true|false|0");
      welcomed && afterWelcome === "false|true|false|0"
        ? pass("zzht.tech เปิดแอปครั้งถัดไป → กล่องต้อนรับขึ้นเอง · Esc = ไว้ทีหลัง (ฐานข้อมูลจด welcome pending หาย)")
        : fail(`หลังให้ดูใหม่: กล่องต้อนรับ ${welcomed} · ฐานข้อมูล ${afterWelcome}`);
      await tc.close();

      // Super Admin ดูในฐานะ A001 — หน้าสิทธิ์ผู้ใช้เปิดได้ แต่ไม่มีลิงก์ให้ดูวิธีใช้ใหม่บนการ์ดไหนเลย (ระหว่างดูแก้อะไรไม่ได้)
      const { ctx: zc2, page: zp2 } = await open("zzht.super", { width: 1366, height: 900 });
      const zv2 = (sel) => zp2.locator(sel).locator("visible=true");
      await zv2('[aria-label="ดูในฐานะผู้ใช้อื่น"]').first().click();
      await zp2.waitForTimeout(1500);
      await zv2('[aria-label="ตำแหน่ง แอดมิน"]').first().click();
      await zp2.waitForTimeout(400);
      await zv2('[aria-label="ค้นหาผู้ใช้ที่จะดู"]').fill("A001");
      await zp2.waitForTimeout(800);
      await zp2.locator('[aria-label^="เลือก "]').locator("visible=true").first().click();
      await zp2.waitForTimeout(300);
      await zv2('[aria-label="ดูในฐานะคนนี้"]').click();
      await zp2.waitForTimeout(4000);
      const viewingA = (await zp2.getByText("กำลังดูในฐานะ", { exact: false }).locator("visible=true").count()) > 0;
      if (!(await zv2('[data-testid="howto-menu.users"]').count())) await zv2('[aria-label="กางกลุ่ม ผู้ดูแลระบบ"]').first().click();
      await zp2.waitForTimeout(900);
      await zv2('[data-testid="howto-menu.users"]').first().click();
      await zp2.waitForTimeout(3500);
      const cards = await zp2.getByText("ตั้งรหัสผ่านใหม่ให้", { exact: true }).locator("visible=true").count();
      const links = await zp2.locator('[aria-label^="ให้ดูวิธีใช้ใหม่ "]').count();
      viewingA && cards >= 1 && links === 0
        ? pass(`Super Admin ดูในฐานะ A001: สิทธิ์ผู้ใช้ ${cards} การ์ด ไม่มีลิงก์ "ให้ดูวิธีใช้ใหม่" เลย`) : fail(`ดูในฐานะ A001: แถบ ${viewingA} · การ์ด ${cards} · ลิงก์ ${links}`);
      await zp2.screenshot({ path: path.join(DIR, "howto-18-viewas-users.png") });
      await zv2('[aria-label="กลับเป็นตัวเอง"]').first().click().catch(() => {});
      await zp2.waitForTimeout(1500);
      await zc2.close();
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
