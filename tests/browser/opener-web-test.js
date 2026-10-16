// ทดสอบ: คอลัมน์ "เปิดโดย" ในรายการใบงาน (แอดมิน · แท็บทั้งหมด)
//   · จอคอม: หัวคอลัมน์ขึ้น · กรองด้วยชื่อผู้เปิด → ทุกแถวที่เห็นเป็นใบที่คนนั้นเปิดตาม API
//   · จอ 1024px (ขอบล่างของโหมดตาราง): ป้ายสถานะไม่ถูกตัดเพราะคอลัมน์เพิ่ม
//   · มือถือ: การ์ดขึ้นบรรทัด "เปิดโดย"
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
  // ใบที่หัวหน้าภาคเปิด — ข้อมูลทดสอบส่วนใหญ่แอดมินเปิดทั้งหมด กรองแล้วไม่หายสักใบก็พิสูจน์อะไรไม่ได้
  const fx = await setup();
  const wo = await fx.workOrder("C0006", null);
  fx.sql(`update "WorkOrder" set "createdById"=(select id from "User" where "employeeCode"='S001') where id=${wo.id}`);
  const sName = fx.sql(`select name from "User" where "employeeCode"='S001'`);
  const target = `${sName} (หัวหน้าภาค)`;
  const all = await fx.call(fx.A, "GET", "/work-orders?status=ALL");
  const apiRows = all.rows ?? all;
  const openerOf = (r) => (r.createdByName ? `${r.createdByName}${r.createdByRole ? ` (${{ ADMIN: "แอดมิน", SUPERVISOR: "หัวหน้าภาค", EMPLOYEE: "ช่าง" }[r.createdByRole]})` : ""}` : "ระบบ");

  const open = async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    // ต่ำกว่าจอคอมเต็ม ๆ เมนูข้างซ่อน เหลือแถบล่าง
    if (width >= 1200) await page.getByLabel("ใบงานซ่อม").first().click();
    else await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click();
    await page.waitForTimeout(3000);
    return { page, vis, label: (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true") };
  };

  try {
    const { page, vis, label } = await open(1600, 1000);
    (await vis("เปิดโดย").count()) > 0 ? pass("หัวคอลัมน์ เปิดโดย ขึ้นในตาราง") : fail("ไม่มีหัวคอลัมน์ เปิดโดย");
    await label("ตัวกรองคอลัมน์ เปิดโดย").first().click();
    await page.waitForTimeout(800);
    const value = target;
    await label("เลือกทั้งหมด").click();
    await label(`ค่า ${value}`).first().click();
    await label("ตกลง ตัวกรอง เปิดโดย").click();
    await page.waitForTimeout(1500);
    const expected = apiRows.filter((r) => openerOf(r) === value).length;
    const codes = await page.getByText(/^WO-\d+$/).locator("visible=true").allTextContents();
    const wrong = codes.filter((c) => openerOf(apiRows.find((r) => r.code === c) ?? {}) !== value);
    expected > 0 && expected < apiRows.length && codes.includes(wo.code) && !wrong.length && (await vis(`เหลือ ${expected} ใบ`, false).count()) > 0
      ? pass(`กรอง "${value}" → เหลือ ${expected} ใบ ตรงกับ API`)
      : fail(`กรองผู้เปิด "${value}": API ${expected} · เห็น ${codes.length} · แถวผิด ${wrong.join(",")}`);
    await page.screenshot({ path: path.join(DIR, "opener-wide.png") });
    await page.close();

    // ป้ายสถานะยาวสุดต้องไม่ล้นช่องเมื่อตารางแคบสุด
    const n = await open(1024, 900);
    const clipped = await n.page.evaluate(() =>
      [...document.querySelectorAll("div")].filter((d) => d.children.length === 0 && /^(รอ|ตรวจ|เสนอ|ปิด)/.test(d.textContent) && d.scrollWidth > d.clientWidth + 1).length
    );
    clipped === 0 ? pass("จอ 1024px ข้อความสถานะไม่ถูกตัด") : fail(`จอ 1024px ข้อความถูกตัด ${clipped} จุด`);
    await n.page.screenshot({ path: path.join(DIR, "opener-1024.png") });
    await n.page.close();

    const m = await open(400, 860);
    (await m.vis("เปิดโดย").count()) > 0 ? pass("การ์ดบนมือถือขึ้น เปิดโดย") : fail("การ์ดไม่มี เปิดโดย");
    await m.page.screenshot({ path: path.join(DIR, "opener-phone.png") });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
