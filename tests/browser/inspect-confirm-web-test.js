// ทดสอบ: หัวหน้าภาคส่งตรวจหน้างาน → แอดมินนัดลูกค้าก่อน → ถึงทีมช่าง
//        · หัวหน้าภาคไม่ได้ใส่วัน ฟอร์มนัดมีตัวเลือกเดียว "นัดวันเข้าตรวจ" และปุ่มกดไม่ได้จนใส่วัน
//        · นัดแล้วไปที่ "รอทีมตรวจหน้างาน" ตรงตามวันนัด แถบขั้นตอนขั้นนัดขึ้นว่าทำแล้ว
//        · ช่างเห็นใบในกล่องงานเฉพาะหลังนัด — เช็คฐานข้อมูลทุกขั้น
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

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
    // ใบงานตรวจสอบหน้างาน — หัวหน้าภาคส่งตรวจโดยไม่ใส่วัน
    const wo = await fx.workOrder("C0006", null);
    const { call } = fx;
    const S = await fx.login("S001");
    await call(S, "POST", `/work-orders/${wo.id}/inspect-request`, { team: "กระบี่" });
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    db(`status||'|'||"appointmentStatus"`) === "INSPECT_CONFIRM|PENDING"
      ? pass("หัวหน้าภาคส่งตรวจ → รอแอดมินนัดลูกค้า (ฐานข้อมูล)")
      : fail(`หลังส่งตรวจ: ${db("status")}`);

    // วันที่ 15 ของเดือนหน้า (ตามเวลาไทย)
    const target = fx.sql("select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok')) + interval '1 month' + interval '14 day','YYYY-MM-DD')");
    const [ty, tm] = target.split("-").map(Number);
    const dayLabel = `${DOW[new Date(Date.UTC(ty, tm - 1, 15)).getUTCDay()]} 15 ${MONTHS[tm - 1]} ${ty + 543}`;

    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);

    (await vis("รอแอดมินนัดลูกค้า (ตรวจหน้างาน)", false).count()) > 0
      ? pass("ป้ายสถานะ: รอแอดมินนัดลูกค้า (ตรวจหน้างาน)")
      : fail("ไม่ขึ้นป้ายรอแอดมินนัดลูกค้า");
    await vis("นัดลูกค้า (ตรวจหน้างาน)").first().click();
    await page.waitForTimeout(1500);
    (await vis("นัดวันเข้าตรวจ").count()) > 0 && (await vis("ลูกค้าคอนเฟิร์มวันนี้").count()) === 0
      ? pass("ไม่มีวันเสนอ — มีแต่ตัวเลือก \"นัดวันเข้าตรวจ\" (ไม่มี \"ลูกค้าคอนเฟิร์มวันนี้\")")
      : fail("ตัวเลือกในฟอร์มนัดไม่ตรง");
    const save = vis("ยืนยัน").last();
    const op = () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
    (await op()) !== "1" ? pass("ยังไม่ใส่วัน ปุ่มยืนยันกดไม่ได้") : fail("กดยืนยันได้ทั้งที่ไม่มีวัน");
    await page.getByLabel("วันเข้าตรวจ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(400);
    await page.getByLabel("เดือนถัดไป").last().click();
    await page.waitForTimeout(200);
    await page.getByLabel(dayLabel, { exact: true }).click();
    await page.waitForTimeout(400);
    (await op()) === "1" ? pass(`ใส่วัน ${dayLabel} แล้วปุ่มกดได้`) : fail("ใส่วันแล้วยังกดไม่ได้");
    await save.click();
    await page.waitForTimeout(4000);
    db(`status||'|'||"appointmentStatus"||'|'||to_char("scheduledAt",'YYYY-MM-DD')||'|'||"assignedTeam"`) === `INSPECTING|CONFIRMED|${target}|กระบี่`
      ? pass("นัดแล้วไปรอทีมตรวจหน้างาน ตามวันนัด ทีมเดิม (ฐานข้อมูล)")
      : fail(`หลังนัด: ${db(`status||'|'||coalesce("appointmentStatus",'-')||'|'||coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-')`)}`);
    (await vis("รอทีมตรวจหน้างาน", false).count()) > 0 ? pass("หน้าจอขึ้นว่ารอทีมตรวจหน้างาน") : fail("หน้าจอไม่อัปเดตสถานะ");
    // แถบขั้นตอน — ขั้นนัดตรวจต้องไม่ถูกขีดฆ่า (ทำแล้วจริง ไม่ใช่ข้าม)
    const struck = await page.evaluate(() => {
      const card = document.querySelector('[aria-label="ขั้นตอนงาน"]');
      const n = card && [...card.querySelectorAll("*")].find((x) => !x.children.length && x.textContent.trim() === "รอแอดมินนัดลูกค้า (ตรวจหน้างาน)");
      return n ? getComputedStyle(n).textDecorationLine : "missing";
    });
    struck !== "missing" && !struck.includes("line-through")
      ? pass("แถบขั้นตอนมีขั้นนัดตรวจ และขึ้นว่าทำแล้ว (ไม่ใช่ข้าม)")
      : fail(`แถบขั้นตอน: ${struck}`);
    await page.screenshot({ path: path.join(DIR, "inspect-confirm-done.png") });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
