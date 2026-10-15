// ทดสอบ: หัวหน้าภาคปิดงานเอง (เครื่องใช้งานได้แล้ว) ผ่านหน้าจอ
//   · ช่างไม่เห็นปุ่ม · หัวหน้าภาคเห็นปุ่มในใบที่ยังไม่ปิด
//   · กดยืนยันตอนยังไม่ครบ → บอกว่าขาดอะไร ใบงานยังไม่ปิด (ฐานข้อมูล)
//   · เลือกเหตุผล + อธิบาย + แนบรูป (ส่งขึ้นทันที role RECOVERY) → ยืนยัน → ปิดงาน ผล RECOVERED (ฐานข้อมูล)
// ต้องมี DATABASE_URL และ mock-s3
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
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
      (await label(page, "ปิดงาน — เครื่องใช้งานได้แล้ว").count()) === 0 ? pass("ช่างไม่เห็นปุ่มปิดงานแบบนี้") : fail("ช่างเห็นปุ่ม");
      await page.close();
    }

    const { page, vis } = await open("S001", 420);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);
    (await label(page, "ปิดงาน — เครื่องใช้งานได้แล้ว").count()) > 0 ? pass("หัวหน้าภาคเห็นปุ่ม \"ปิดงาน — เครื่องใช้งานได้แล้ว\"") : fail("ไม่เห็นปุ่ม");
    await label(page, "ปิดงาน — เครื่องใช้งานได้แล้ว").click();
    await page.waitForTimeout(1200);

    await label(page, "ยืนยันปิดงาน").click();
    await page.waitForTimeout(1200);
    (await vis("เลือกเหตุผลที่ปิดงาน", false).count()) > 0 ? pass("ยืนยันตอนยังไม่ครบ → บอกว่าต้องเลือกเหตุผล") : fail("ไม่บอกว่าขาดเหตุผล");
    await vis("ตกลง").last().click().catch(() => {});
    await page.waitForTimeout(500);
    db("status") !== "DONE" ? pass("ยังไม่ครบ ใบงานยังไม่ปิด (ฐานข้อมูล)") : fail("ปิดทั้งที่ไม่ครบ");

    await label(page, "เหตุผล แนะนำลูกค้าทางโทรศัพท์/ไลน์ แล้วใช้งานได้").click();
    await label(page, "อธิบายสิ่งที่ทำ").fill("โทรแนะนำพนักงานสาขาให้ล้างกรองน้ำทิ้ง เครื่องกลับมาปั่นได้ ทดสอบ 1 รอบผ่าน");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      label(page, "แนบรูปเครื่องที่ใช้งานได้").click(),
    ]);
    await chooser.setFiles(PHOTO);
    await page.waitForTimeout(5000);
    fx.sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${wo.id} and role='RECOVERY'`) === "1"
      ? pass("เลือกรูปแล้วส่งขึ้นทันที เป็นรูปเครื่องที่ใช้งานได้ (ฐานข้อมูล)")
      : fail("รูปไม่ถูกส่งขึ้น");
    await page.screenshot({ path: path.join(DIR, "recovered-close-form.png") });

    await label(page, "ยืนยันปิดงาน").click();
    await page.waitForTimeout(4000);
    const sid = fx.sql(`select id from "User" where "employeeCode"='S001'`);
    db(`status||'|'||"closeResult"||'|'||"closedById"`) === `DONE|RECOVERED|${sid}`
      ? pass("ยืนยันแล้วปิดงาน ผล RECOVERED คนปิดคือหัวหน้าภาค (ฐานข้อมูล)")
      : fail(`ฐานข้อมูล: ${db("status")}`);
    (await vis("ปิดงานแล้ว").count()) > 0 ? pass("หน้าใบงานขึ้นแถบปิดงานแล้ว") : fail("ไม่ขึ้นแถบปิดงานแล้ว");
    (await label(page, "ปิดงาน — เครื่องใช้งานได้แล้ว").count()) === 0 ? pass("ปิดแล้วปุ่มหายไป") : fail("ปุ่มยังอยู่หลังปิด");
    // ไม่ใช้อะไหล่ (ข้าม) + คอนเฟิร์มลูกค้า · ยืนยันออกงาน · รอช่างปิดงาน ที่ไม่มีใครทำ ต้องขึ้นว่าข้าม ไม่ใช่ติ๊กว่าทำแล้ว
    const skipped = await vis("ข้าม").count();
    skipped >= 4 ? pass(`แถบขั้นตอน: ขั้นที่ไปไม่ถึงตอนปิดขึ้นว่าข้าม (${skipped} ขั้น)`) : fail(`ขั้นที่ขึ้นว่าข้าม: ${skipped}`);
    await page.screenshot({ path: path.join(DIR, "recovered-close-done.png"), fullPage: true });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
