// ทดสอบ: หัวหน้าภาคปิดใบงานเอง (ไม่ต้องเข้าหน้างาน · บังคับเหตุผล) ผ่านหน้าจอ
//   · ช่างไม่เห็นปุ่ม · หัวหน้าภาคเห็นปุ่มในใบที่ยังไม่ปิด
//   · กดยืนยันตอนยังไม่ครบ → บอกว่าขาดอะไร ใบงานยังไม่ปิด (ฐานข้อมูล) · รายละเอียดสั้นเกินก็ยังไม่ได้
//   · เลือกเหตุผล + รายละเอียด (ไม่แนบรูป) → ยืนยัน → ปิดงาน ผล SUPERVISOR_CLOSED (ฐานข้อมูล) · แถบขั้นตอนขึ้นข้าม
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

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
    const wo = await fx.workOrder("C0006", []);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    // แผง "จบใบงาน" ท้ายหน้า เห็นสามทางทันที (ต.ค. 69) — เดิมเป็นปุ่ม "ปิดใบงาน (ไม่ต้องเข้าหน้างาน)" แยก
    const BTN = "จบใบงาน";

    const open = async (code, width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      return { page, vis };
    };
    const label = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();

    // ช่าง (ทีมอื่น) อาจไม่เห็นใบนี้เลย — ถ้าเห็นต้องไม่มีปุ่ม
    {
      const { page, vis } = await open("T001", 420);
      if ((await vis(wo.code).count()) > 0) {
        await vis(wo.code).last().click();
        await page.waitForTimeout(3000);
      }
      (await label(page, BTN).count()) === 0 ? pass("ช่างไม่เห็นปุ่มปิดใบงานแบบนี้") : fail("ช่างเห็นปุ่ม");
      await page.close();
    }

    const { page, vis } = await open("S001", 420);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);
    (await label(page, BTN).count()) > 0 ? pass(`หัวหน้าภาคเห็นปุ่ม "${BTN}"`) : fail("ไม่เห็นปุ่ม");
    await page.screenshot({ path: path.join(DIR, "sup-close-button.png") });
    await label(page, "จบ: ไม่ต้องเข้าหน้างาน").click();
    await page.waitForTimeout(1200);

    await label(page, "ยืนยันปิดใบงาน").click();
    await page.waitForTimeout(800);
    (await vis("เลือกเหตุผล และพิมพ์รายละเอียดอย่างน้อย 10 ตัวอักษร", false).count()) > 0
      ? pass("ยืนยันตอนยังไม่ครบ → บอกว่าขาดเหตุผลและรายละเอียด")
      : fail("ไม่บอกว่าขาดอะไร");
    await label(page, "เหตุผล เครื่องกลับมาใช้งานได้เอง").click();
    await label(page, "รายละเอียดที่ปิดใบงาน").fill("ปกติแล้ว");
    await label(page, "ยืนยันปิดใบงาน").click();
    await page.waitForTimeout(1000);
    (await vis("พิมพ์รายละเอียดอย่างน้อย 10 ตัวอักษร", false).count()) > 0 ? pass("รายละเอียดสั้นเกิน → ยังกดไม่ได้") : fail("ไม่เตือนรายละเอียดสั้น");
    await page.screenshot({ path: path.join(DIR, "sup-close-missing.png") });
    db("status") !== "DONE" ? pass("ยังไม่ครบ ใบงานยังไม่ปิด (ฐานข้อมูล)") : fail("ปิดทั้งที่ไม่ครบ");

    await label(page, "รายละเอียดที่ปิดใบงาน").fill("โทรถามร้าน ผู้จัดการสาขายืนยันว่าเครื่องกลับมาใช้งานได้แล้ว");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(DIR, "sup-close-form.png") });
    await label(page, "ยืนยันปิดใบงาน").click();
    await page.waitForTimeout(4000);
    const sid = fx.sql(`select id from "User" where "employeeCode"='S001'`);
    db(`status||'|'||"closeResult"||'|'||"closedById"||'|'||"closeNote"`) ===
    `DONE|SUPERVISOR_CLOSED|${sid}|เครื่องกลับมาใช้งานได้เอง — โทรถามร้าน ผู้จัดการสาขายืนยันว่าเครื่องกลับมาใช้งานได้แล้ว`
      ? pass("ยืนยันแล้วปิดงาน ผล SUPERVISOR_CLOSED คนปิดคือหัวหน้าภาค มีเหตุผล+รายละเอียด (ฐานข้อมูล) ไม่ต้องแนบรูป")
      : fail(`ฐานข้อมูล: ${db(`status||'|'||coalesce("closeResult",'')`)}`);
    (await vis("ปิดงานแล้ว").count()) > 0 ? pass("หน้าใบงานขึ้นแถบปิดงานแล้ว") : fail("ไม่ขึ้นแถบปิดงานแล้ว");
    (await vis("เหตุผลที่หัวหน้าภาคปิด").count()) > 0 ? pass("หน้าใบงานขึ้นหัวข้อ เหตุผลที่หัวหน้าภาคปิด") : fail("ไม่มีหัวข้อเหตุผล");
    (await label(page, BTN).count()) === 0 ? pass("ปิดแล้วปุ่มหายไป") : fail("ปุ่มยังอยู่หลังปิด");
    // แถบขั้นตอนรวมขั้นที่ข้ามติดกันเป็นชิปเดียว "ข้าม n"
    const chip = await page.getByText(/^ข้าม \d+$/).locator("visible=true").allTextContents();
    const skipped = chip.reduce((n, t) => n + Number(t.replace(/\D/g, "")), 0);
    skipped >= 3 ? pass(`แถบขั้นตอน: ขั้นที่ไปไม่ถึงตอนปิดขึ้นว่าข้าม (${skipped} ขั้น)`) : fail(`ขั้นที่ขึ้นว่าข้าม: ${chip.join(",") || 0}`);
    await page.screenshot({ path: path.join(DIR, "sup-close-done.png"), fullPage: true });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
