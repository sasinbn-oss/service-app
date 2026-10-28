// ทดสอบ: Maid (COCO) ผ่านเบราว์เซอร์ (เจ้าของงานเพิ่ม ต.ค. 69)
//   · หน้าสิทธิ์ผู้ใช้: ปุ่มตำแหน่ง Maid (COCO) · ต้องเลือกสาขาที่ประจำก่อนสร้าง · เพิ่ม/เอาสาขาออกจากการ์ด (เช็คฐานข้อมูล)
//   · ปุ่ม "นำเข้า Area Team" รับไฟล์รายชื่อ Maid: ตัวอย่างบอกจำนวน Maid · ยืนยันแล้วมีบัญชี + สาขา (ฐานข้อมูล)
//   · Maid เข้าระบบ: หัวจอบอกตำแหน่ง · เห็นเฉพาะใบงานสาขาที่ประจำ
// ต้องมี DATABASE_URL · สร้างบัญชีชั่วคราว zz.web.maid* แล้วลบทิ้งตอนจบ
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");
const ExcelJS = require(path.join(__dirname, "../../backend/node_modules/exceljs"));
const DIR = __dirname;
const API = "http://localhost:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const LOGINS = "'zz.web.maid','zz.web.maid2','zz.web.maid3'";
const call = async (method, url, token, body) =>
  (await fetch(API + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json();

function cleanup() {
  sql(`delete from "WorkOrder" where "createdById" in (select id from "User" where "employeeCode" in (${LOGINS})) or symptom='ทดสอบ maid web';
       delete from "User" where "employeeCode" in (${LOGINS});`);
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  cleanup();
  const xlsx = path.join(os.tmpdir(), "maid-list-test.xlsx");
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Maid");
    ws.addRow(["ลำดับ", "Area (หัวหน้า)", "Name-Surname (Thai)", "Nickname", "Tel", "ERP", "Project Name", "Position", "Remark", "User"]);
    ws.addRow([1, "นายหัวหน้า ทดสอบ (บี)", "นางสาวสอง เว็บ", "สอง", "080-000-0001", "C0006", "สาขาทดสอบ", "Maid (COCO)", "", "zz.web.maid2"]);
    ws.addRow([2, "นายหัวหน้า ทดสอบ (บี)", "นางสาวสาม เว็บ", "สาม", "080-000-0002", "CNX", "สาขาทดสอบ", "Maid (COCO)", "", "zz.web.maid3"]);
    await wb.xlsx.writeFile(xlsx);
  }
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const LINKS = () =>
    sql(`select coalesce(string_agg(u."employeeCode"||'='||b.code, ' ' order by u."employeeCode", b.code),'') from "CocoMaidBranch" m
         join "User" u on u.id=m."userId" join "Branch" b on b.id=m."branchId" where u."employeeCode" in (${LOGINS})`);

  async function open(code, width = 1400) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
    await page.waitForTimeout(3500);
    return page;
  }

  try {
    const admin = (await call("POST", "/auth/login", null, { employeeCode: "A001", password: "test1234" })).token;
    const body = (b) => ({ branchCode: b, jobType: "CM", machines: [{ code: "W9", symptom: "ทดสอบ maid web" }] });
    const w1 = await call("POST", "/work-orders", admin, body("C0001"));
    const w6 = await call("POST", "/work-orders", admin, body("C0006"));

    // ════ เพิ่มทีละคน ════
    const page = await open("A001");
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    await vis("สิทธิ์ผู้ใช้").first().click();
    await page.waitForTimeout(2500);
    await vis("เพิ่มบัญชีผู้ใช้").last().click();
    await page.waitForTimeout(800);
    await label("ชื่อผู้ใช้").fill("ZZ.Web.Maid");
    await label("ชื่อ-นามสกุล").fill("นางสาวเมด ทดสอบ (มด)");
    await label("รหัสตั้งต้น").fill("temp12345");
    await vis("Maid (COCO)").last().click();
    await page.waitForTimeout(500);
    const picker = label("เพิ่มสาขาที่ประจำ ผู้ใช้ใหม่");
    (await picker.count()) > 0 ? pass("เลือก Maid (COCO) แล้วมีช่องเลือกสาขาที่ประจำ") : fail("ไม่มีช่องเลือกสาขา");
    await vis("สร้างบัญชี").last().click();
    await page.waitForTimeout(1200);
    sql(`select count(*) from "User" where "employeeCode"='zz.web.maid'`) === "0" ? pass("ยังไม่เลือกสาขา → ปุ่มสร้างบัญชีกดไม่ได้ (ฐานข้อมูลไม่มีบัญชี)") : fail("สร้างได้ทั้งที่ไม่มีสาขา");
    await picker.click();
    await page.waitForTimeout(600);
    const c0006 = sql(`select name from "Branch" where code='C0006'`);
    await vis(`C0006 · ${c0006}`).last().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(DIR, "maid-1-create.png") });
    await vis("สร้างบัญชี").last().click();
    await page.waitForTimeout(2500);
    const row = sql(`select role||'|'||"mustChangePassword" from "User" where "employeeCode"='zz.web.maid'`);
    row === "COCO_MAID|true" && LINKS() === "zz.web.maid=C0006"
      ? pass("สร้างบัญชี Maid พร้อมสาขา C0006 · ชื่อผู้ใช้เก็บเป็นตัวเล็ก (ฐานข้อมูล)") : fail(`สร้างบัญชี: ${row} · ${LINKS()}`);
    await vis("ตกลง").last().click().catch(() => {});
    await page.waitForTimeout(800);

    // ════ แก้สาขาในการ์ด ════
    await page.getByLabel("ค้นหาผู้ใช้").locator("visible=true").first().fill("zz.web.maid");
    await page.waitForTimeout(800);
    const who = "นางสาวเมด ทดสอบ (มด)";
    await label(`เพิ่มสาขาที่ประจำ ${who}`).click();
    await page.waitForTimeout(600);
    const c0001 = sql(`select name from "Branch" where code='C0001'`);
    await vis(`C0001 · ${c0001}`).last().click();
    await page.waitForTimeout(2000);
    LINKS() === "zz.web.maid=C0001 zz.web.maid=C0006" ? pass("เพิ่มสาขาจากการ์ด → ประจำสองสาขา (ฐานข้อมูล)") : fail(`เพิ่มสาขา: ${LINKS()}`);
    await page.screenshot({ path: path.join(DIR, "maid-2-card.png") });
    await label(`เอาสาขา C0006 ออกจาก ${who}`).click();
    await page.waitForTimeout(2000);
    LINKS() === "zz.web.maid=C0001" ? pass("กด × เอาสาขาออก (ฐานข้อมูล)") : fail(`เอาสาขาออก: ${LINKS()}`);
    await page.getByLabel("ค้นหาผู้ใช้").locator("visible=true").first().fill("C0001");
    await page.waitForTimeout(600);
    (await vis(who).count()) > 0 ? pass("ค้นหาผู้ใช้ด้วยรหัสสาขาที่ประจำเจอ") : fail("ค้นด้วยรหัสสาขาไม่เจอ");

    // ════ นำเข้าไฟล์รายชื่อ Maid ════
    await vis("นำเข้า Area Team").last().click();
    await page.waitForTimeout(800);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label("เลือกไฟล์ Area Team").click()]);
    await chooser.setFiles(xlsx);
    await page.waitForTimeout(3000);
    // หลังหน้าต่างมีการ์ดผู้ใช้ที่มีปุ่มตำแหน่งทุกแบบ — เช็คข้อความที่มีเฉพาะในหน้าต่างนำเข้า
    (await vis("Maid (COCO) · หัวหน้า: นายหัวหน้า ทดสอบ (บี) · 1 สาขา: C0006").count()) > 0 && (await vis("ยืนยัน · สร้าง 2 บัญชี · ผูก 2 สาขา").count()) > 0
      ? pass("ตัวอย่าง: แถวบอกตำแหน่ง Maid + หัวหน้า + สาขา · ปุ่มยืนยันบอกจำนวน") : fail("ตัวอย่างไฟล์ Maid ไม่ถูก");
    sql(`select count(*) from "User" where "employeeCode" in ('zz.web.maid2','zz.web.maid3')`) === "0" ? pass("ดูตัวอย่างยังไม่สร้างบัญชี") : fail("ดูตัวอย่างแล้วมีบัญชี");
    await page.screenshot({ path: path.join(DIR, "maid-3-import.png") });
    await label("ยืนยันนำเข้า Area Team").click();
    await page.waitForTimeout(3500);
    LINKS() === "zz.web.maid=C0001 zz.web.maid2=C0006 zz.web.maid3=CNX"
      && sql(`select string_agg(role,',') from "User" where "employeeCode" in ('zz.web.maid2','zz.web.maid3')`) === "COCO_MAID,COCO_MAID"
      ? pass("ยืนยันนำเข้า → บัญชี Maid 2 คน ผูกสาขาตามไฟล์ (ฐานข้อมูล)") : fail(`นำเข้า: ${LINKS()}`);
    (await label("ดาวน์โหลดรหัสผ่านเริ่มต้น").count()) > 0 ? pass("มีปุ่มดาวน์โหลดรหัสผ่านเริ่มต้น") : fail("ไม่มีปุ่มดาวน์โหลดรหัสผ่าน");
    await page.close();

    // ════ Maid เข้าระบบ ════
    sql(`update "User" set "passwordHash"=(select "passwordHash" from "User" where "employeeCode"='A001'), "mustChangePassword"=false where "employeeCode"='zz.web.maid'`);
    const m = await open("zz.web.maid", 1280);
    const mv = (t, exact = true) => m.getByText(t, { exact }).locator("visible=true");
    (await mv("Maid (COCO)").count()) > 0 ? pass("หัวจอบอกตำแหน่ง Maid (COCO)") : fail("ไม่บอกตำแหน่ง");
    await m.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await m.waitForTimeout(3000);
    (await mv(w1.code, false).count()) > 0 && (await mv(w6.code, false).count()) === 0
      ? pass(`รายการใบงาน: เห็น ${w1.code} (C0001) ไม่เห็น ${w6.code} (C0006)`) : fail(`Maid เห็นใบงานไม่ถูก (${w1.code} / ${w6.code})`);
    await m.screenshot({ path: path.join(DIR, "maid-4-list.png") });
    await m.close();
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    cleanup();
    fs.rmSync(xlsx, { force: true });
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
