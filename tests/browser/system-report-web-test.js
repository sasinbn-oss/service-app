// ทดสอบ: หน้ารายงานทั้งระบบ (แอดมินเท่านั้น)
//   · แอดมินเห็นการ์ดในเมนูรายงาน · หัวหน้าภาคไม่เห็น
//   · ค่าเริ่มต้น "ทั้งหมด" → กดดาวน์โหลดแล้วเปิดไฟล์ .xlsx ที่ได้จริง (ไม่ใช่แค่ไม่ error)
//   · เลือกช่วงวันที่กลับด้าน → ปุ่มกดไม่ได้และบอกเหตุผล
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const login = async (code) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("รายงาน").first().click();
    await page.waitForTimeout(2000);
    return { ctx, page, vis };
  };

  try {
    const sup = await login("S001");
    (await sup.vis("รายงานตามผู้เปิดใบงาน").count()) > 0 && (await sup.vis("รายงานทั้งระบบ").count()) === 0
      ? pass("หัวหน้าภาคไม่เห็นการ์ดรายงานทั้งระบบ")
      : fail("หัวหน้าภาคเห็นการ์ดรายงานทั้งระบบ (หรือหน้าเมนูไม่ขึ้น)");
    await sup.ctx.close();

    const { ctx, page, vis } = await login("A001");
    await vis("รายงานทั้งระบบ").first().click();
    await page.waitForTimeout(1500);
    (await vis("ในไฟล์มี 8 ชีต").count()) > 0 ? pass("หน้ารายงานทั้งระบบเปิดได้ บอกว่ามี 8 ชีต") : fail("หน้าไม่ขึ้น");
    await page.screenshot({ path: path.join(DIR, "system-report.png") });

    // เปิดลิงก์ไฟล์ในแท็บใหม่ (ซึ่งกลายเป็นดาวน์โหลด URL ของแท็บจึงไม่เปลี่ยน) — เอาลิงก์จากคำตอบ API แล้วโหลดเอง
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/reports/system"), { timeout: 120000 }),
      page.locator('[aria-label="ดาวน์โหลดรายงานทั้งระบบ"]').click(),
    ]);
    const { path: filePath } = await resp.json();
    const res = await page.request.get(`http://localhost:4000${filePath}`);
    const body = await res.body();
    // xlsx คือไฟล์ zip — ขึ้นต้นด้วย PK
    res.ok() && body.slice(0, 2).toString() === "PK"
      ? pass(`ดาวน์โหลดได้ไฟล์ Excel จริง (${body.length} ไบต์)`)
      : fail(`ไฟล์ที่ได้ไม่ใช่ xlsx: ${res.status()} ${filePath}`);
    for (const p of ctx.pages()) if (p !== page) await p.close();
    await page.waitForTimeout(800);
    (await vis("ล่าสุด:", false).count()) > 0 ? pass("บอกชื่อไฟล์และขนาดล่าสุด") : fail("ไม่บอกไฟล์ล่าสุด");

    await vis("เลือกช่วงวันที่เปิด").click();
    await page.waitForTimeout(500);
    // DateField เป็นปฏิทินของแอปเอง — เลือกวันเริ่มเป็นเดือนหน้า ให้หลังวันสิ้นสุด (วันนี้)
    await page.locator('[aria-label="เปิดตั้งแต่วันที่"]').locator("visible=true").first().click();
    await page.waitForTimeout(400);
    await page.locator('[aria-label="เดือนถัดไป"]').locator("visible=true").first().click();
    await page.waitForTimeout(300);
    await vis("15").first().click();
    await page.waitForTimeout(500);
    (await vis("วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด").count()) > 0 &&
    (await page.locator('[aria-label="ดาวน์โหลดรายงานทั้งระบบ"]').getAttribute("aria-disabled")) === "true"
      ? pass("วันที่กลับด้าน → ปุ่มกดไม่ได้และบอกเหตุผล")
      : fail("วันที่กลับด้านแล้วยังกดได้/ไม่บอก");
    await page.screenshot({ path: path.join(DIR, "system-report-range.png") });
  } catch (e) {
    fail(e.stack);
  } finally {
    errors.length ? fail(`JS error: ${errors.join(" | ")}`) : pass("ไม่มี JS error");
    await browser.close();
  }
})();
