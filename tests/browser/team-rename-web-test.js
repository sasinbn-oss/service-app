// ทดสอบ: หน้าทีมช่าง — เปลี่ยนชื่อทีมผ่านหน้าจอ แล้วยืนยันที่ฐานข้อมูลว่าสาขาและช่างย้ายตาม
// ใช้สาขา/ช่างทดสอบของตัวเอง (ต้องมี DATABASE_URL) ลบทิ้งตอนจบ
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();

(async () => {
  const suf = String(Date.now()).slice(-5);
  const OLD = `ทีมหน้าจอ${suf}`, NEW = `ทีมเปลี่ยนแล้ว${suf}`;
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  sql(`insert into "Branch" (code,name,zone) values ('ZW${suf}','สาขาหน้าจอ','${OLD}')`);
  sql(`insert into "User" ("employeeCode",name,"passwordHash",role,team) values ('ZW${suf}','ช่างหน้าจอ','x','EMPLOYEE','${OLD}')`);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  const tap = async (t) => {
    const el = page.getByText(t, { exact: true }).locator("visible=true").last();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click();
  };
  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    await tap("ทีมช่าง");
    await page.waitForTimeout(2500);
    await page.getByLabel("ค้นหาทีม").fill(suf);
    await page.waitForTimeout(400);
    (await page.getByText(OLD, { exact: true }).locator("visible=true").count()) ? pass("หน้าทีมช่างแสดงทีมพร้อมค้นหาได้") : fail("ไม่เห็นทีมทดสอบ");
    (await page.getByText(/สาขา CM 1 · PM 0 · ช่าง 1 คน/).locator("visible=true").count()) ? pass("นับสาขาและช่างของทีมถูก") : fail("ตัวเลขทีมไม่ถูก");
    await page.getByLabel(`เปลี่ยนชื่อทีม ${OLD}`).click();
    await page.waitForTimeout(400);
    await page.getByLabel("ชื่อทีมใหม่").fill(NEW);
    await page.screenshot({ path: path.join(DIR, "team-1-rename.png") });
    await tap("เปลี่ยนชื่อ");
    await page.waitForTimeout(2500);
    (await page.getByText(`เปลี่ยนชื่อเป็น ${NEW} แล้ว`).count()) ? pass("ขึ้นสรุปการเปลี่ยนชื่อ") : fail("ไม่ขึ้นสรุป");
    const db = `${sql(`select zone from "Branch" where code='ZW${suf}'`)}|${sql(`select team from "User" where "employeeCode"='ZW${suf}'`)}`;
    db === `${NEW}|${NEW}` ? pass("DB: สาขาและช่างย้ายไปชื่อใหม่") : fail(`DB: ${db}`);
    await tap("ตกลง").catch(() => {});
    await page.waitForTimeout(800);
    await page.getByLabel("ค้นหาทีม").fill(suf);
    await page.waitForTimeout(400);
    (await page.getByText(NEW, { exact: true }).locator("visible=true").count()) ? pass("รายการเปลี่ยนเป็นชื่อใหม่") : fail("รายการไม่อัปเดต");
    (await page.getByText(`${OLD} → ${NEW}`).count()) ? pass("แสดงชื่อเดิมที่ระบบจะแปลงให้ตอนอัปไฟล์") : fail("ไม่แสดงรายการชื่อเดิม");
    await page.screenshot({ path: path.join(DIR, "team-2-after.png"), fullPage: true });
  } catch (e) {
    fail(String(e));
    await page.screenshot({ path: path.join(DIR, "team-fail.png"), fullPage: true }).catch(() => {});
  } finally {
    sql(`delete from "TeamRename" where "fromName" like '%${suf}'`);
    sql(`delete from "User" where "employeeCode"='ZW${suf}'`);
    sql(`delete from "Branch" where code='ZW${suf}'`);
    errors.length ? fail("page errors: " + errors.join(" | ")) : pass("ไม่มี error ในหน้า");
    await browser.close();
  }
})();
