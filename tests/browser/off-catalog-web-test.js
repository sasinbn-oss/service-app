// ทดสอบ: อะไหล่นอกสโตร์ (ไม่มี SKU) ผ่านหน้าจอด้วยบทบาทจริง — เช็คฐานข้อมูลทุกจังหวะ
//   1) หัวหน้าภาค: เลือกใช้อะไหล่ → เพิ่มรายการนอกสโตร์ · แถวที่ไม่มีชื่อปุ่มกดไม่ได้ · ใส่ชื่อ/จำนวน/หน่วย/หมายเหตุแล้วบันทึก
//   2) แอดมิน (แฟรนไชส์หมดประกัน = เช็คอะไหล่ก่อนเสนอราคา): ของนอกสโตร์ขึ้นป้าย ตอบ "หาได้" ได้
//   3) การ์ดอะไหล่ในหน้าใบงานขึ้นชื่อ + ป้าย "นอกสโตร์" ไม่ใช่รหัส "[นอกสโตร์] …"
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");
const NAME = "สายพานทดสอบหน้าจอ 5PJ";

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
    const branch = fx.sql(`select code from "Branch" where code like 'D%' and "cancelledAt" is null and "openedAt" < now() - interval '4 years' order by "openedAt" limit 1`);
    const wo = await fx.workOrder(branch, null);
    const st = () => fx.sql(`select status from "WorkOrder" where id=${wo.id}`);
    const offRow = () =>
      fx.sql(`select sp.name||'|'||p.quantity||'|'||coalesce(p.unit,'-')||'|'||coalesce(p.note,'-')||'|'||coalesce(p."inStock"::text,'-') from "WorkOrderPart" p join "SparePart" sp on sp.id=p."sparePartId" where p."workOrderId"=${wo.id} and sp."offCatalog"`);

    const openAs = async (code) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      await vis(wo.code).last().click();
      await page.waitForTimeout(3000);
      const save = vis("ยืนยัน").last();
      const op = () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
      return { ctx, page, vis, label, save, op };
    };

    // ── 1) หัวหน้าภาค ──
    {
      const { ctx, page, vis, label, save, op } = await openAs("S001");
      await vis("ระบุอะไหล่ที่ต้องใช้").first().click();
      await page.waitForTimeout(1200);
      await vis("ใช้อะไหล่").first().click();
      await page.waitForTimeout(500);
      (await vis("อะไหล่นอกสโตร์").count()) > 0 ? pass("ฟอร์มระบุอะไหล่มีกล่องอะไหล่นอกสโตร์") : fail("ไม่มีกล่องอะไหล่นอกสโตร์");
      await label("เพิ่มรายการนอกสโตร์").click();
      await page.waitForTimeout(400);
      (await op()) !== "1" && (await vis("ใส่ชื่ออะไหล่ให้ครบ", false).count()) > 0
        ? pass("เพิ่มแถวแต่ยังไม่ใส่ชื่อ ปุ่มยืนยันกดไม่ได้ และบอกว่าต้องทำอะไร")
        : fail("แถวไม่มีชื่อแต่กดยืนยันได้");
      await label("ชื่ออะไหล่นอกสโตร์ 1").fill(NAME);
      await label("จำนวนอะไหล่นอกสโตร์ 1").fill("2");
      await label("หน่วยอะไหล่นอกสโตร์ 1").fill("เส้น");
      await label("หมายเหตุอะไหล่นอกสโตร์ 1").fill("ซื้อร้านในพื้นที่");
      await page.waitForTimeout(400);
      (await op()) === "1" ? pass("มีแต่ของนอกสโตร์ (ไม่มี SKU) ก็กดยืนยันได้") : fail("ใส่ครบแล้วยังกดไม่ได้");
      await page.screenshot({ path: path.join(DIR, "off-catalog-supervisor.png") });
      await save.click();
      await page.waitForTimeout(3500);
      offRow() === `${NAME}|2|เส้น|ซื้อร้านในพื้นที่|-` && st() === "PARTS_SOURCING"
        ? pass("บันทึกของนอกสโตร์ครบทุกช่อง → รอแอดมินเช็คอะไหล่ (ฐานข้อมูล)")
        : fail(`หลังบันทึก: ${st()} · ${offRow()}`);
      await ctx.close();
    }

    // ── 2) แอดมิน ──
    {
      const { ctx, page, vis } = await openAs("A001");
      // การ์ดอะไหล่ — ชื่อ + ป้าย ไม่ใช่รหัสที่มีวงเล็บนำหน้า
      (await vis(`${NAME} × 2 เส้น`).count()) > 0 && (await vis(`[นอกสโตร์] ${NAME}`, false).count()) === 0 && (await vis("นอกสโตร์").count()) > 0
        ? pass("การ์ดอะไหล่ขึ้นชื่อ จำนวน หน่วย และป้ายนอกสโตร์")
        : fail("การ์ดอะไหล่แสดงไม่ถูก");
      await vis("เช็คอะไหล่ (มี / หมด)").first().click();
      await page.waitForTimeout(1500);
      (await vis("หาได้").count()) > 0 && (await vis("ยังหาไม่ได้").count()) > 0
        ? pass("ขั้นเช็คอะไหล่ ของนอกสโตร์ถามว่า หาได้ / ยังหาไม่ได้")
        : fail("ตัวเลือกของนอกสโตร์ไม่ตรง");
      await vis("หาได้").last().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, "off-catalog-admin.png") });
      // ปุ่มขั้นนี้บอกปลายทาง ("มีอะไหล่ — ไปเสนอราคา") ไม่ใช่ "ยืนยัน"
      await page.getByText(/ไปเสนอราคา$/).locator("visible=true").last().click();
      await page.waitForTimeout(3500);
      offRow().endsWith("|true") && st() === "AWAITING_QUOTE"
        ? pass("ตอบหาได้ → ไปขั้นเสนอราคา (ฐานข้อมูล)")
        : fail(`หลังเช็ค: ${st()} · ${offRow()}`);
      await vis("เสนอราคาลูกค้า").first().click();
      await page.waitForTimeout(1500);
      (await vis("อะไหล่นอกสโตร์ — อย่าลืมใส่ราคาในใบเสนอราคา").count()) > 0
        ? pass("ขั้นเสนอราคาเตือนรายการนอกสโตร์ให้ใส่ราคา")
        : fail("ขั้นเสนอราคาไม่เตือนของนอกสโตร์");
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) {
      await fx.cleanup();
      fx.sql(`delete from "SparePart" where "offCatalog" and name='${NAME}'`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
