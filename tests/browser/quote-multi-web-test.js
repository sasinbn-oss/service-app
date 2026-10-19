// ทดสอบ: แนบใบเสนอราคา/บิลได้หลายไฟล์ (เจ้าของงานขอ ต.ค. 69)
//   · เลือก PDF ทีเดียวสองไฟล์ แล้วกดแนบเพิ่มอีกไฟล์ = สามไฟล์ ต่อท้าย ไม่แทนที่
//   · ลบไฟล์ออกหนึ่งไฟล์ก่อนส่ง · ส่งแล้วฐานข้อมูลมี QUOTE ครบเท่าที่เหลือ และไปขั้นรอลูกค้าจ่ายเงิน
//   · บิลที่ลูกค้าจ่ายแล้วก็แนบได้หลายไฟล์เหมือนกัน
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

// PDF เล็กที่สุดที่ยังเป็น PDF จริง — เซิร์ฟเวอร์เช็คชนิดไฟล์
const pdf = (name) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`),
});

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
    fx.sql(`update "WorkOrder" set status='AWAITING_QUOTE', "needsParts"=false where id=${wo.id}`);
    const count = (role) => Number(fx.sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${wo.id} and role='${role}'`));

    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);

    const attach = async (files) => {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), vis("แนบไฟล์ PDF").last().click()]);
      chooser.isMultiple() ? pass("ช่องเลือก PDF เลือกได้หลายไฟล์") : fail("ช่องเลือก PDF เลือกได้ไฟล์เดียว");
      await chooser.setFiles(files);
      await page.waitForTimeout(1200);
    };

    // ── ใบเสนอราคา ──
    await vis("เสนอราคาลูกค้า").first().click();
    await page.waitForTimeout(1200);
    await attach([pdf("ใบเสนอราคา-อะไหล่.pdf"), pdf("ใบเสนอราคา-ค่าบริการ.pdf")]);
    await attach([pdf("ใบเสนอราคา-ลบทิ้ง.pdf")]);
    const names = ["ใบเสนอราคา-อะไหล่.pdf", "ใบเสนอราคา-ค่าบริการ.pdf", "ใบเสนอราคา-ลบทิ้ง.pdf"];
    const shown = [];
    for (const n of names) if ((await vis(n).count()) > 0) shown.push(n);
    shown.length === 3 && (await vis("3 ไฟล์ — กดแนบอีกเพื่อเพิ่ม").count()) > 0
      ? pass("แนบสองรอบได้ 3 ไฟล์ ต่อท้ายกัน ไม่แทนที่") : fail(`เห็นไฟล์: ${shown.join(", ")}`);
    await page.screenshot({ path: path.join(DIR, "quote-multi.png") });
    await page.locator('[aria-label="เอาไฟล์ที่ 3 ออก"]').locator("visible=true").last().click();
    await page.waitForTimeout(600);
    (await vis("ใบเสนอราคา-ลบทิ้ง.pdf").count()) === 0 && (await vis("ใบเสนอราคา-อะไหล่.pdf").count()) > 0
      ? pass("ลบไฟล์ออกหนึ่งไฟล์ ไฟล์อื่นยังอยู่") : fail("ลบไฟล์ไม่ได้/ลบผิดไฟล์");
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(6000);
    const status = fx.sql(`select status from "WorkOrder" where id=${wo.id}`);
    const quoteNames = fx.sql(`select string_agg("fileName", ',' order by "fileName") from "WorkOrderAttachment" where "workOrderId"=${wo.id} and role='QUOTE'`);
    count("QUOTE") === 2 && status === "AWAITING_PAYMENT" && !quoteNames.includes("ลบทิ้ง")
      ? pass("ส่งแล้ว: ฐานข้อมูลมีใบเสนอราคา 2 ไฟล์ (ไม่มีไฟล์ที่ลบ) · ไปขั้นรอลูกค้าจ่ายเงิน")
      : fail(`QUOTE=${count("QUOTE")} (${quoteNames}) สถานะ=${status}`);

    // ── บิลที่ลูกค้าจ่ายแล้ว ──
    await vis("ลูกค้าจ่ายเงินแล้ว").first().click();
    await page.waitForTimeout(1200);
    await attach([pdf("บิล-1.pdf"), pdf("บิล-2.pdf")]);
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(6000);
    count("RECEIPT") === 2 && fx.sql(`select status from "WorkOrder" where id=${wo.id}`) !== "AWAITING_PAYMENT"
      ? pass("บิลแนบได้ 2 ไฟล์ (ฐานข้อมูล) ไปขั้นถัดไป") : fail(`RECEIPT=${count("RECEIPT")}`);
    await ctx.close();
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
