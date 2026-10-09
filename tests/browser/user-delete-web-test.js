// ทดสอบ: ปุ่มลบผู้ใช้ — Super Admin เห็นและลบได้ แอดมินทั่วไปไม่เห็นปุ่ม · ยืนยันผลที่ฐานข้อมูล
// สร้าง Super Admin กับผู้ใช้ทดสอบชั่วคราวผ่าน API แล้วลบทิ้งตอนจบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const API = "http://localhost:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();
const call = async (method, url, token, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

(async () => {
  const suf = String(Date.now()).slice(-5);
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const admin = (await call("POST", "/auth/login", null, { employeeCode: "A001", password: "test1234" })).token;
  // บัญชีที่แอดมินสร้างต้องเปลี่ยนรหัสก่อน — ทำผ่าน API ให้เลย
  async function make(code, name, role) {
    await call("POST", "/auth/users", admin, { employeeCode: code, name, role, password: "temp12345" });
    const t = (await call("POST", "/auth/login", null, { employeeCode: code, password: "temp12345" })).token;
    await call("POST", "/auth/change-password", t, { currentPassword: "temp12345", newPassword: "test12345" });
  }
  const victim = `ผู้ใช้ทดสอบลบ${suf}`;

  async function open(code, password) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill(password);
    await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
    await page.waitForTimeout(3500);
    await page.getByText("สิทธิ์ผู้ใช้", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(2500);
    return page;
  }

  try {
    await make(`ZWSA${suf}`, "ซุปเปอร์ทดสอบ", "SUPER_ADMIN");
    await make(`ZWU${suf}`, victim, "EMPLOYEE");

    const a = await open("A001", "test1234");
    (await a.getByText(victim).locator("visible=true").count()) ? pass("แอดมินเห็นผู้ใช้ในรายชื่อ") : fail("ไม่เห็นผู้ใช้ทดสอบ");
    (await a.getByLabel(`ลบผู้ใช้ ${victim}`).count()) ? fail("แอดมินทั่วไปเห็นปุ่มลบ") : pass("แอดมินทั่วไปไม่เห็นปุ่มลบผู้ใช้");

    const s = await open(`ZWSA${suf}`, "test12345");
    (await s.getByLabel("ลบผู้ใช้ ซุปเปอร์ทดสอบ").count()) ? fail("เห็นปุ่มลบตัวเอง") : pass("ไม่มีปุ่มลบบัญชีตัวเอง");
    // ค้นหา: ด้วยรหัสพนักงาน → เหลือคนเดียว · หลายคำ (สิทธิ์ + ทีม) · ไม่เจอ → ข้อความบอก · ล้าง → ครบ
    const total = await s.getByText("ตั้งรหัสผ่านใหม่ให้", { exact: true }).locator("visible=true").count();
    const search = s.getByLabel("ค้นหาผู้ใช้");
    await search.fill(`zwu${suf}`);
    await s.waitForTimeout(300);
    const one = await s.getByText("ตั้งรหัสผ่านใหม่ให้", { exact: true }).locator("visible=true").count();
    one === 1 && (await s.getByText(victim).locator("visible=true").count()) && (await s.getByText(`1 / ${total} คน`).count())
      ? pass(`ค้นหารหัสพนักงาน (ไม่สนตัวพิมพ์) เหลือคนเดียว 1 / ${total}`) : fail(`ค้นหาได้ ${one} คน`);
    await search.fill("ช่าง กรุงเทพ");
    await s.waitForTimeout(300);
    (await s.getByText("ช่างสมชาย").locator("visible=true").count()) && !(await s.getByText(victim).locator("visible=true").count())
      ? pass("ค้นหาหลายคำ (สิทธิ์ + ทีม) ได้เฉพาะคนที่ตรงทุกคำ") : fail("ค้นหาหลายคำไม่ถูก");
    await search.fill("ไม่มีใครชื่อนี้แน่นอน");
    await s.waitForTimeout(300);
    (await s.getByText(/ไม่พบผู้ใช้ที่ตรงกับ/).count()) ? pass("ไม่เจอ → บอกว่าไม่พบ") : fail("ไม่มีข้อความไม่พบ");
    await s.screenshot({ path: path.join(DIR, "usersearch-1.png") });
    await s.getByLabel("ล้างคำค้นหา").click();
    await s.waitForTimeout(300);
    (await s.getByText("ตั้งรหัสผ่านใหม่ให้", { exact: true }).locator("visible=true").count()) === total
      ? pass("ล้างคำค้นแล้วกลับมาครบ") : fail("ล้างแล้วไม่ครบ");
    await search.fill(victim);
    await s.waitForTimeout(300);
    await s.screenshot({ path: path.join(DIR, "usersearch-2.png") });

    // แก้ไขรายละเอียด — เปลี่ยนเบอร์โทร แล้วยืนยันที่ฐานข้อมูล
    await s.getByLabel(`แก้ไขรายละเอียด ${victim}`).click();
    await s.waitForTimeout(500);
    await s.getByLabel("เบอร์โทร").locator("visible=true").last().fill("0811112222");
    await s.screenshot({ path: path.join(DIR, "useredit-1.png") });
    await s.getByText("บันทึก", { exact: true }).locator("visible=true").last().click();
    await s.waitForTimeout(1500);
    sql(`select coalesce(phone,'') from "User" where "employeeCode"='ZWU${suf}'`) === "0811112222"
      ? pass("แก้ไขรายละเอียด: DB ได้เบอร์โทรใหม่") : fail("แก้ไขรายละเอียดไม่ถูกบันทึก");
    (await s.getByText(`แก้รายละเอียดของ ${victim} แล้ว`).count()) ? pass("ขึ้นข้อความบันทึกแล้ว") : fail("ไม่ขึ้นข้อความบันทึก");
    await s.getByText("ตกลง", { exact: true }).locator("visible=true").last().click().catch(() => {});
    await s.waitForTimeout(400);
    const btn = s.getByLabel(`ลบผู้ใช้ ${victim}`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await s.waitForTimeout(600);
    (await s.getByText(`ลบผู้ใช้ ${victim}?`).count()) ? pass("ขึ้นกล่องยืนยันก่อนลบ") : fail("ไม่มีกล่องยืนยัน");
    await s.screenshot({ path: path.join(DIR, "userdel-1-confirm.png") });
    await s.getByText("ลบผู้ใช้", { exact: true }).locator("visible=true").last().click();
    await s.waitForTimeout(2500);
    sql(`select count(*) from "User" where "employeeCode"='ZWU${suf}'`) === "0" ? pass("DB: ผู้ใช้ถูกลบ") : fail("DB: ผู้ใช้ยังอยู่");
    // ชื่อยังอยู่ใน toast "ลบ … แล้ว" — ดูจากการ์ดของคนนั้น (ปุ่มลบของเขา) แทน
    (await s.getByLabel(`ลบผู้ใช้ ${victim}`).count()) ? fail("ยังเห็นการ์ดในรายการ") : pass("การ์ดหายจากรายการทันที");
    await s.screenshot({ path: path.join(DIR, "userdel-2-after.png") });
  } catch (e) {
    fail(String(e));
  } finally {
    sql(`delete from "User" where "employeeCode" in ('ZWSA${suf}','ZWU${suf}')`);
    errors.length ? fail("page errors: " + errors.join(" | ")) : pass("ไม่มี error ในหน้า");
    await browser.close();
  }
})();
