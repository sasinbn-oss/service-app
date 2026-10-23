// ทดสอบ: นำเข้าใบแจ้งซ่อมจากไฟล์ — ตัวอย่างบอกใบค้างของสาขาเดียวกัน กดเข้าไปดูใบเดิมได้ (เจ้าของงานขอ ต.ค. 69)
//   · แถวสาขา D0012 เครื่องใหม่ (ไม่ถูกข้าม) แต่สาขามีใบค้าง → ขึ้นรายการใบค้างพร้อมรหัส
//   · กดรหัส → ไปหน้ารายละเอียดใบนั้น · กลับมา → ตัวอย่างที่อ่านไว้ยังอยู่ ไม่ต้องเลือกไฟล์ใหม่
//   · ดูตัวอย่างอย่างเดียว ไม่บันทึกอะไร — ไม่มีอะไรต้องเก็บกวาด
const { chromium } = require("playwright");
const os = require("os");
const path = require("path");
const fs = require("fs");
const ExcelJS = require(path.join(__dirname, "../../backend/node_modules/exceljs"));

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const file = path.join(os.tmpdir(), `repair-import-${process.pid}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง", "รหัสสาขา", "ประเภทงาน", "เครื่อง", "รุ่นของเครื่อง", "ขนาดเครื่อง", "อาการที่พบ", "ผู้ติดต่อที่สาขา", "เบอร์ติดต่อสาขา", "ชื่อสถานที่", "รูปภาพ", "วิดีโอ"]);
  ws.addRow([new Date(), "D0012", "CM", "W998", "OASIS", "13 Kg", "ทดสอบนำเข้าเว็บ เครื่องไม่ปั่น", "คุณทดสอบ", "090-000-0000", "สาขาทดสอบ", null, null]);
  await wb.xlsx.writeFile(file);

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await page.getByLabel("นำเข้าใบแจ้งซ่อมจากไฟล์").locator("visible=true").first().click();
    await page.waitForTimeout(1200);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByLabel("เลือกไฟล์ฟอร์มแจ้งซ่อม").locator("visible=true").first().click(),
    ]);
    await chooser.setFiles(file);
    await page.waitForTimeout(4000);

    (await vis(/ใบค้างที่สาขานี้ \d+ ใบ/, false).count()) ? pass("แถวสาขาเดิมคนละเครื่อง บอกใบค้างของสาขา") : fail("ไม่ขึ้นใบค้างของสาขา");
    const chip = page.locator('[aria-label^="ดูใบงาน WO-"]').locator("visible=true").first();
    const code = ((await chip.getAttribute("aria-label")) || "").replace("ดูใบงาน ", "");
    await page.screenshot({ path: path.join(__dirname, "repair-import-open.png") });
    await chip.click();
    await page.waitForTimeout(3000);
    (await vis(code).count()) && !(await vis("ยืนยันนำเข้าใบแจ้งซ่อม").count())
      ? pass(`กดรหัสแล้วไปหน้ารายละเอียด ${code}`)
      : fail(`ไม่ได้ไปหน้ารายละเอียด ${code}`);
    await page.screenshot({ path: path.join(__dirname, "repair-import-detail.png") });
    // จอคอมเปิดรายละเอียดเป็นหน้าต่างลอย — ปิดด้วยกากบาท (ประวัติเบราว์เซอร์ไม่มีให้ย้อน)
    await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(__dirname, "repair-import-back.png") });
    await page.waitForTimeout(2500);
    (await vis("ทดสอบนำเข้าเว็บ เครื่องไม่ปั่น").count()) && (await page.getByLabel("ยืนยันนำเข้าใบแจ้งซ่อม").locator("visible=true").count())
      ? pass("กลับมาแล้วตัวอย่างที่อ่านไว้ยังอยู่")
      : fail("กลับมาแล้วตัวอย่างหาย");
    errors.length ? fail(`page error: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
  } finally {
    await browser.close();
    fs.rmSync(file, { force: true });
  }
})();
