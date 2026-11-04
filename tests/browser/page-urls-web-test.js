// ทดสอบ: ที่อยู่ของแต่ละหน้าบนเว็บ (เจ้าของงานขอ 4 พ.ย. 69 "อยากให้อิงจากหน้านั้นๆได้ด้วย เวลาก๊อบ url")
//   หน้าอยู่หลัง # (/#/wo/WO-00045) — Render ไม่มีกฎส่งทุกที่อยู่ไป index.html (ดู README "ที่อยู่ของแต่ละหน้าบนเว็บ")
//   1. A001 กดเมนูข้างทีละหน้า → ที่อยู่เปลี่ยนตามหน้า (#/inbox · #/work-orders · #/reports ...)
//   2. เปิดใบงานจากรายการ → ที่อยู่มีรหัสใบงาน (อ่านรหัสจากฐานข้อมูล) · ชื่อแท็บเบราว์เซอร์เป็นรหัส · ปิดหน้าต่าง → กลับ #/work-orders
//   3. ปุ่มย้อนกลับของเบราว์เซอร์ → หน้าก่อนหน้าในแอป (ใบงานปิด · รายการ → รายงาน → ย้อนกลับมารายการ) · ไปข้างหน้าได้
//   4. F5 ที่หน้าใบงาน → อยู่ใบเดิม (รหัสบนหัวหน้าต่างตรงฐานข้อมูล)
//   5. ลิงก์ใบงานในบริบทใหม่ (ยังไม่เข้าระบบ) → หน้าเข้าสู่ระบบ (#/login) → เข้าระบบ → ใบงานนั้น (รหัสตรงฐานข้อมูล)
//      + พิมพ์รหัสตัวเล็กก็เปิดได้ (ที่อยู่กลับเป็นตัวใหญ่)
//   6. วางลิงก์อื่นในแถบที่อยู่ของแท็บที่เปิดแอปอยู่ (เปลี่ยนแค่ #) → ได้หน้าในลิงก์ ไม่ใช่หน้าแรกของประวัติ
//   7. ที่อยู่ที่ไม่รู้จัก → หน้าแรก (#/my-jobs) ไม่มี error
//   8. ออกจากระบบตอนอยู่หน้าใบงาน แล้วเข้าระบบใหม่ → หน้าแรก (ไม่พากลับหน้าที่คนก่อนเปิดค้าง)
//   9. ช่าง T001 เปิดลิงก์หน้าแอดมิน → ไม่ได้ (ไปหน้าแรก — แท็บหลังบ้านไม่มีในแอปช่าง) · ลิงก์ใบงานทีมอื่น → หน้ากุญแจ
//      (เซิร์ฟเวอร์: GET /work-orders/by-code ตอบ 403 กฎเดียวกับเปิดใบ · ไม่พบ 404 · แอดมินได้ id ตรงฐานข้อมูล)
// สร้างใบงานหนึ่งใบที่สาขา C0006 ผ่าน fixture แล้วลบทิ้งตอนจบ (fx.cleanup คืนภาคของ S001 ด้วย)
// ต้องมี DATABASE_URL · backend :4000 · expo web :8081
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");
const BASE = "http://localhost:8081";

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  try {
    fx = await setup();
    const wo = await fx.workOrder("C0006", null);
    // รหัสจากฐานข้อมูล ไม่ใช่จากที่แอปคิด — ที่อยู่ต้องตรงของจริง
    const CODE = fx.sql(`select code from "WorkOrder" where id=${wo.id}`);
    if (!/^WO-\d+$/.test(CODE)) throw new Error(`รหัสใบงานในฐานข้อมูลผิดรูป: ${CODE}`);

    // ── เซิร์ฟเวอร์: รหัส → เลขใบ ──
    const T = await fx.login("T001");
    const byA = await fx.call(fx.A, "GET", `/work-orders/by-code/${CODE}`);
    byA.id === wo.id && byA.code === CODE ? pass(`by-code: แอดมินได้เลขใบตรงฐานข้อมูล (${CODE} → ${wo.id})`) : fail(`by-code แอดมิน: ${JSON.stringify(byA)}`);
    const byLower = await fx.call(fx.A, "GET", `/work-orders/by-code/${CODE.toLowerCase()}`);
    byLower.id === wo.id ? pass("by-code: ตัวพิมพ์เล็กก็หาเจอ") : fail(`by-code ตัวเล็ก: ${JSON.stringify(byLower)}`);
    const none = await fetch(`http://localhost:4000/api/work-orders/by-code/WO-99999999`, { headers: { Authorization: `Bearer ${fx.A}` } });
    none.status === 404 ? pass("by-code: รหัสที่ไม่มี → 404") : fail(`by-code ไม่มี: ${none.status}`);
    const myTeam = fx.sql(`select coalesce(team,'') from "User" where "employeeCode"='T001'`);
    const branchTeam = fx.sql(`select coalesce(zone,'') from "Branch" where code='C0006'`);
    const otherTeam = myTeam !== branchTeam;
    if (otherTeam) {
      const r = await fetch(`http://localhost:4000/api/work-orders/by-code/${CODE}`, { headers: { Authorization: `Bearer ${T}` } });
      r.status === 403 ? pass("by-code: ช่างทีมอื่นได้ 403 (กฎเดียวกับเปิดใบงาน)") : fail(`by-code ช่างทีมอื่น: ${r.status}`);
    } else {
      console.log(`SKIP ทีมของ T001 ตรงกับสาขา C0006 (${myTeam}) — ข้ามข้อ 403`);
    }

    const newPage = async (ctx) => {
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      return page;
    };
    const tools = (page) => {
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const hash = () => decodeURIComponent(new URL(page.url()).hash);
      // รอจนเงื่อนไขเป็นจริง — หน้าเว็บโหลดข้อมูลข้ามภูมิภาค เวลาไม่แน่นอน
      const until = async (fn, ms = 20000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (await fn().catch(() => false)) return true;
          await page.waitForTimeout(250);
        }
        return false;
      };
      const signIn = async (code) => {
        await page.getByPlaceholder("รหัสพนักงาน").fill(code);
        await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
        await vis("เข้าสู่ระบบ").click();
      };
      const menu = async (label) => {
        await page.locator(`#side-menu [aria-label="${label}"]`).locator("visible=true").first().click();
      };
      return { vis, hash, until, signIn, menu };
    };
    // หัวหน้าต่างใบงานแสดง order.code ที่มาจากเซิร์ฟเวอร์ — ตรงกับฐานข้อมูล = เปิดใบถูกจริง ไม่ใช่แค่ที่อยู่ถูก
    const onOrder = async (t) => (await t.vis(CODE).count()) > 0 && (await t.vis("สาขาและเครื่อง").count()) > 0;

    // ── 1–4: แอดมิน ──
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ — กางทุกกลุ่มให้กดเมนูหลังบ้านได้
    await ctx.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    const page = await newPage(ctx);
    const t = tools(page);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 180000 });
    (await t.until(async () => t.hash() === "#/login")) ? pass("ยังไม่เข้าระบบ → ที่อยู่ #/login") : fail(`ก่อนเข้าระบบ: ${t.hash()}`);
    await t.signIn("A001");
    (await t.until(async () => t.hash() === "#/my-jobs")) ? pass("เข้าระบบแล้ว → หน้าแรก #/my-jobs") : fail(`หลังเข้าระบบ: ${t.hash()}`);

    const tour = [
      ["กล่องงานของฉัน", "#/inbox"],
      ["ใบงานซ่อม", "#/work-orders"],
      ["รายงาน", "#/reports"],
      ["ผังผู้รับผิดชอบ", "#/coverage"],
      ["รายการอะไหล่", "#/spare-parts"],
      ["ระบบหลังบ้าน", "#/admin"],
      ["สิทธิ์ผู้ใช้", "#/admin/users"],
      ["งานของฉันวันนี้", "#/my-jobs"],
    ];
    const seen = [];
    for (const [label, want] of tour) {
      await t.menu(label);
      const ok = await t.until(async () => t.hash() === want, 10000);
      seen.push(`${label}=${t.hash()}`);
      if (!ok) fail(`กดเมนู "${label}" ที่อยู่ไม่เป็น ${want}: ${t.hash()}`);
    }
    new Set(seen.map((s) => s.split("=")[1])).size === tour.length
      ? pass(`กดเมนูข้าง ${tour.length} หน้า → ที่อยู่ไม่ซ้ำกันทุกหน้า`)
      : fail(`ที่อยู่ซ้ำ: ${seen.join(" · ")}`);

    // เปิดใบงานจากรายการ
    await t.menu("ใบงานซ่อม");
    await t.until(async () => t.hash() === "#/work-orders");
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(CODE);
    await t.until(async () => (await t.vis(CODE).count()) > 0);
    await t.vis(CODE).last().click();
    (await t.until(async () => t.hash() === `#/wo/${CODE}` && (await onOrder(t))))
      ? pass(`เปิดใบงานจากรายการ → ที่อยู่ #/wo/${CODE} (รหัสจากฐานข้อมูล)`)
      : fail(`เปิดใบงาน: ที่อยู่ ${t.hash()}`);
    const title = await page.title();
    title.includes(CODE) ? pass(`ชื่อแท็บเบราว์เซอร์เป็นรหัสใบงาน (${title})`) : fail(`ชื่อแท็บ: ${title}`);

    // 4. F5 อยู่ใบเดิม
    await page.reload({ waitUntil: "networkidle" });
    (await t.until(async () => t.hash() === `#/wo/${CODE}` && (await onOrder(t))))
      ? pass("F5 ที่หน้าใบงาน → ยังเป็นใบเดิม")
      : fail(`F5: ที่อยู่ ${t.hash()} · เห็นใบ ${await onOrder(t)}`);

    // ปิดหน้าต่าง → ที่อยู่ของรายการข้างใต้ (ใบที่เปิดจากลิงก์ก็มีรายการรองอยู่)
    await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
    (await t.until(async () => t.hash() === "#/work-orders" && (await t.vis("สาขาและเครื่อง").count()) === 0))
      ? pass("ปิดหน้าต่างใบงาน (หลัง F5) → กลับรายการ #/work-orders")
      : fail(`ปิดใบงาน: ${t.hash()}`);

    // 3. ย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(CODE);
    await t.until(async () => (await t.vis(CODE).count()) > 0);
    await t.vis(CODE).last().click();
    await t.until(async () => t.hash() === `#/wo/${CODE}` && (await onOrder(t)));
    await page.goBack();
    (await t.until(async () => t.hash() === "#/work-orders" && (await t.vis("สาขาและเครื่อง").count()) === 0))
      ? pass("ปุ่มย้อนกลับของเบราว์เซอร์ที่หน้าใบงาน → ใบงานปิด กลับรายการ")
      : fail(`ย้อนกลับจากใบงาน: ${t.hash()}`);
    await t.menu("รายงาน");
    await t.until(async () => t.hash() === "#/reports");
    await page.goBack();
    (await t.until(async () => t.hash() === "#/work-orders" && (await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").count()) > 0))
      ? pass("รายงาน → ย้อนกลับ → รายการใบงาน (ที่อยู่และหน้าจอตรงกัน)")
      : fail(`ย้อนกลับจากรายงาน: ${t.hash()}`);
    await page.goForward();
    (await t.until(async () => t.hash() === "#/reports" && (await t.vis("สรุปรายสัปดาห์").count()) > 0))
      ? pass("ไปข้างหน้า → กลับหน้ารายงาน")
      : fail(`ไปข้างหน้า: ${t.hash()}`);

    // 6. วางลิงก์ในแถบที่อยู่ของแท็บเดิม — เปลี่ยนแค่ # (เบราว์เซอร์ไม่โหลดเอง แอปต้องจับแล้วไปหน้านั้น)
    // Playwright ถือเป็นการเปลี่ยนในหน้าเดิม แล้วแอปโหลดหน้าใหม่ต่อ — goto อาจบอกว่าถูกขัด ไม่ใช่ความผิดของแอป
    await page.goto(`${BASE}/#/reports/confirmed`).catch(() => {});
    (await t.until(async () => t.hash() === "#/reports/confirmed" && (await t.vis("สรุปคอนเฟิร์มลูกค้า").count()) > 0, 30000))
      ? pass("วางลิงก์ในแท็บที่เปิดแอปอยู่ → ได้หน้าในลิงก์ (สรุปคอนเฟิร์มลูกค้า)")
      : fail(`วางลิงก์ในแท็บเดิม: ${t.hash()}`);

    // 7. ที่อยู่ที่ไม่รู้จัก → หน้าแรก
    const p2 = await newPage(ctx);
    const t2 = tools(p2);
    await p2.goto(`${BASE}/#/no-such-page/123`, { waitUntil: "networkidle", timeout: 180000 });
    (await t2.until(async () => t2.hash() === "#/my-jobs"))
      ? pass("ที่อยู่ที่ไม่รู้จัก → หน้าแรก #/my-jobs")
      : fail(`ที่อยู่ไม่รู้จัก: ${t2.hash()}`);
    await p2.close();

    // 8. ออกจากระบบที่หน้าใบงาน แล้วเข้าระบบใหม่ → หน้าแรก ไม่ใช่ใบงานที่เปิดค้าง
    await page.goto(`${BASE}/?t=${Date.now()}#/wo/${CODE}`, { waitUntil: "networkidle" });
    await t.until(async () => onOrder(t));
    await page.locator('[aria-label="ออกจากระบบ"]').locator("visible=true").first().click();
    await t.vis("ตกลง").last().click();
    await t.until(async () => t.hash() === "#/login");
    await t.signIn("A001");
    (await t.until(async () => t.hash() === "#/my-jobs"))
      ? pass("ออกจากระบบที่หน้าใบงานแล้วเข้าใหม่ → หน้าแรก (ไม่จำหน้าของคนก่อน)")
      : fail(`เข้าระบบใหม่หลังออก: ${t.hash()}`);
    await ctx.close();

    // ── 5: ลิงก์ในบริบทใหม่ (ยังไม่เข้าระบบ) ──
    {
      const c = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const p = await newPage(c);
      const tt = tools(p);
      await p.goto(`${BASE}/#/wo/${CODE}`, { waitUntil: "networkidle", timeout: 180000 });
      (await tt.until(async () => tt.hash() === "#/login" && (await p.getByPlaceholder("รหัสพนักงาน").count()) > 0))
        ? pass("เปิดลิงก์ใบงานตอนยังไม่เข้าระบบ → หน้าเข้าสู่ระบบ (#/login)")
        : fail(`ลิงก์ตอนยังไม่เข้าระบบ: ${tt.hash()}`);
      // F5 ที่หน้าเข้าสู่ระบบยังจำหน้าที่ขอไว้
      await p.reload({ waitUntil: "networkidle" });
      await tt.signIn("A001");
      (await tt.until(async () => tt.hash() === `#/wo/${CODE}` && (await onOrder(tt)), 30000))
        ? pass(`เข้าระบบแล้วไปใบงานในลิงก์ (${CODE} ตรงฐานข้อมูล) — F5 ที่หน้าเข้าสู่ระบบก่อนหน้านั้นไม่ลืม`)
        : fail(`หลังเข้าระบบจากลิงก์: ${tt.hash()} · เห็นใบ ${await onOrder(tt)}`);
      const left = await p.evaluate(() => sessionStorage.getItem("otteri-link-after-login"));
      left === null ? pass("หน้าที่จำไว้ถูกลบหลังพาไปแล้ว") : fail(`ยังค้าง: ${left}`);
      // ปิดหน้าต่างใบงานที่เปิดจากลิงก์ → มีรายการรองอยู่ ไม่ใช่จอว่าง
      await p.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
      (await tt.until(async () => tt.hash() === "#/work-orders" && (await p.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").count()) > 0))
        ? pass("ปิดใบงานที่เปิดจากลิงก์ → รายการใบงานซ่อม")
        : fail(`ปิดใบงานจากลิงก์: ${tt.hash()}`);
      // รหัสตัวเล็ก (คนพิมพ์เอง) — แอปถามเซิร์ฟเวอร์แล้วที่อยู่กลับเป็นรหัสจริง
      await p.goto(`${BASE}/?t=${Date.now()}#/wo/${CODE.toLowerCase()}`, { waitUntil: "networkidle" });
      (await tt.until(async () => tt.hash() === `#/wo/${CODE}` && (await onOrder(tt))))
        ? pass("ลิงก์รหัสตัวเล็ก → เปิดใบเดียวกัน ที่อยู่เป็นรหัสตัวใหญ่")
        : fail(`รหัสตัวเล็ก: ${tt.hash()}`);
      await c.close();
    }

    // ── 9: ช่างกับลิงก์ที่ไม่มีสิทธิ์ ──
    {
      const c = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const p = await newPage(c);
      const tt = tools(p);
      await p.goto(`${BASE}/#/admin/users`, { waitUntil: "networkidle", timeout: 180000 });
      await tt.until(async () => (await p.getByPlaceholder("รหัสพนักงาน").count()) > 0);
      await tt.signIn("T001");
      (await tt.until(async () => tt.hash() === "#/my-jobs"))
        ? pass("ช่างเปิดลิงก์หน้าสิทธิ์ผู้ใช้ → เข้าระบบแล้วอยู่หน้าแรก")
        : fail(`ช่าง + ลิงก์แอดมิน: ${tt.hash()}`);
      (await tt.vis("สิทธิ์ผู้ใช้").count()) === 0 ? pass("ช่างไม่เห็นหน้าสิทธิ์ผู้ใช้") : fail("ช่างเห็นหน้าสิทธิ์ผู้ใช้");
      // เข้าระบบอยู่แล้วเปิดลิงก์หลังบ้านตรง ๆ ก็เหมือนกัน
      await p.goto(`${BASE}/?t=${Date.now()}#/admin/teams`, { waitUntil: "networkidle" });
      (await tt.until(async () => tt.hash() === "#/my-jobs"))
        ? pass("ช่างที่เข้าระบบอยู่แล้วเปิด #/admin/teams → หน้าแรก")
        : fail(`ช่าง + #/admin/teams: ${tt.hash()}`);
      if (otherTeam) {
        await p.goto(`${BASE}/?t=${Date.now()}#/wo/${CODE}`, { waitUntil: "networkidle" });
        (await tt.until(async () => (await tt.vis("ใบงานนี้ไม่ใช่ของทีมคุณ").count()) > 0))
          ? pass("ช่างเปิดลิงก์ใบงานทีมอื่น → หน้ากุญแจ (ไม่เห็นรายละเอียดใบ)")
          : fail("ช่างเปิดลิงก์ใบงานทีมอื่นแล้วไม่เห็นหน้ากุญแจ");
        (await tt.vis("สาขาและเครื่อง").count()) === 0 ? pass("หน้ากุญแจไม่มีรายละเอียดสาขา/เครื่อง") : fail("เห็นรายละเอียดใบทีมอื่น");
      }
      await p.screenshot({ path: path.join(DIR, "page-urls-tech.png") });
      await c.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
