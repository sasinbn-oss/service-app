// ทดสอบหน้าจอ: ของที่เบิกไปแล้วแยกออกมา ไม่ต้องตอบซ้ำ และเลขใบเบิกไม่ถูกเติมค่าเก่า
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const WO = process.argv[2] || "WO-00671";

(async () => {
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  // PLAYWRIGHT_CHROMIUM ตั้งเองได้ถ้าเครื่องเก็บไว้ที่อื่น
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 1500 } });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const seen = (t, exact = false) => page.getByText(t, { exact }).locator("visible=true").count();
  const tap = async (t, exact = true) => {
    const el = page.getByText(t, { exact }).locator("visible=true").first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(async () => {
      await el.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
  };

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await tap("ใบงาน");
    await page.waitForTimeout(2500);

    const row = page.getByText(WO, { exact: false }).locator("visible=true");
    if ((await row.count()) === 0) { fail(`ไม่เจอ ${WO} ในรายการ`); throw new Error("no row"); }
    await row.first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(DIR, "bo-1-detail.png"), fullPage: true });

    (await seen("รออะไหล่", false)) > 0
      ? pass("ใบงานขึ้นสถานะรออะไหล่")
      : fail("ไม่ขึ้นสถานะรออะไหล่");
    (await seen("รอแอดมินเช็คอะไหล่", false)) > 0
      ? pass("ใบงานยังค้างอยู่ขั้นแอดมิน ไม่เลยไปจ่ายงาน")
      : fail("ไม่ได้ค้างที่ขั้นแอดมิน");

    // เปิดฟอร์มเช็คอะไหล่
    await tap("เช็คอะไหล่ในคลัง", false);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, "bo-2-modal.png"), fullPage: true });

    (await seen("เบิกไปแล้วรอบก่อน", true)) > 0
      ? pass("มีกล่องแยกของที่เบิกไปแล้ว")
      : fail("ไม่มีกล่องของที่เบิกไปแล้ว");
    (await seen("RQ-2569-0042", false)) > 0
      ? pass("โชว์เลขใบเบิกของรอบก่อนไว้ให้เห็น")
      : fail("ไม่โชว์เลขใบเบิกรอบก่อน");

    // ช่องเลขใบเบิกต้องว่าง ไม่ใช่เติมเลขของรอบก่อนไว้
    const box = page.getByLabel("เลขใบเบิกอะไหล่").locator("visible=true").first();
    const val = await box.inputValue();
    val === ""
      ? pass("ช่องเลขใบเบิกว่าง ไม่ได้เอาเลขรอบก่อนมาเติม")
      : fail(`ช่องเลขใบเบิกถูกเติมไว้ว่า "${val}" ซึ่งเป็นของรอบก่อน`);

    // ตัวที่เบิกไปแล้วต้องไม่มีปุ่มให้ตอบซ้ำ — นับปุ่ม "มีของ" ควรเหลือตัวเดียว
    const inStockButtons = await page.getByText("มีของ", { exact: true }).locator("visible=true").count();
    inStockButtons === 1
      ? pass("เหลือให้ตอบแค่ตัวที่ยังไม่ได้เบิก (1 ตัว)")
      : fail(`ยังให้ตอบ ${inStockButtons} ตัว ควรเหลือ 1`);

    // ของมาแล้ว — ตอบมีของ เลือกคลัง ใส่ใบเบิกใบใหม่ แล้วบันทึก
    await tap("มีของ");
    await page.waitForTimeout(600);
    await tap("เลือกคลังที่มีของ", false);
    await page.waitForTimeout(800);
    // ค้นในช่องของ dropdown ก่อน ไม่งั้นคำว่า "คลังกระบี่" ไปโดนข้อความ
    // ในกล่อง "เบิกไปแล้วรอบก่อน" ซึ่งอยู่เหนือกว่าใน DOM
    const find = page.getByPlaceholder("ค้นหา").locator("visible=true").first();
    await find.fill("กระบี่");
    await page.waitForTimeout(900);
    const opt = page.getByText("คลังกระบี่", { exact: true }).locator("visible=true").last();
    await opt.click().catch(async () => {
      await opt.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
    await page.waitForTimeout(700);
    await box.fill("RQ-WEB-2");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "bo-3-filled.png"), fullPage: true });
    // ปุ่มส่งของโมดัลชื่อ "ยืนยัน" ส่วน "บันทึกเพิ่มเติม" เป็นหัวข้อช่องหมายเหตุ
    await tap("ยืนยัน");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(DIR, "bo-4-after.png"), fullPage: true });

    // บันทึกแล้วแอปเด้งกลับหน้ารายการ ต้องเปิดใบเดิมซ้ำก่อนถึงจะอ่านป้ายของมันได้
    const again = page.getByText(WO, { exact: false }).locator("visible=true");
    if ((await again.count()) > 0) {
      await again.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, "bo-4-after.png"), fullPage: true });
    }

    // อ่านจากป้ายสถานะบนหัวใบงาน ไม่ใช่ทั้งหน้า — แถบขั้นตอนมีชื่อทุกขั้นอยู่แล้ว
    // ถ้าดูทั้งหน้าจะเจอ "รอหัวหน้าภาคจ่ายงาน" ตลอดไม่ว่าสถานะจริงจะเป็นอะไร
    // หาใบที่เจาะจง ไม่ใช่ใบแรกที่เจอ — หน้ารายการยังค้างอยู่ใน DOM ข้างหลัง
    // หน้ารายละเอียด ถ้าเอาใบแรกจะได้ใบอื่นที่ไม่เกี่ยวกับที่กำลังทดสอบ
    const badge = await page.evaluate((code) => {
      const hits = [...document.querySelectorAll("*")].filter(
        (n) => !n.children.length && (n.textContent || "").trim() === code
      );
      return hits.map((n) => n.parentElement?.textContent?.trim() || "").pop() || "";
    }, WO);
    console.log("  ป้ายสถานะ:", badge);
    /จ่ายงาน/.test(badge)
      ? pass("ของครบแล้วเดินต่อไปขั้นจ่ายงาน")
      : fail(`ไม่เดินต่อหลังของมาครบ — ป้ายยังเป็น "${badge}"`);
    (await seen("RQ-2569-0042", false)) > 0 && (await seen("RQ-WEB-2", false)) > 0
      ? pass("เห็นใบเบิกทั้งสองใบในใบงาน")
      : fail("ใบเบิกใบใดใบหนึ่งหายไป");

    errors.length === 0 ? pass("ไม่มี error ในหน้า") : fail(`error: ${errors.slice(0, 2).join(" | ")}`);
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "bo-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${e.message}`);
  } finally {
    await browser.close();
  }
})();
