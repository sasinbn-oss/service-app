// ทดสอบ: สิทธิ์ใบงานบนหน้าจอ (ตรวจระบบ ต.ค. 69)
//   · ช่าง: ใบทีมตัวเองไม่มีปุ่มยกเลิก · ใบถูกย้ายไปทีมอื่นระหว่างดูรายการ → เปิดแล้วขึ้นหน้ากุญแจ ไม่เห็นเบอร์ลูกค้า
//   · ช่าง: ฟอร์มเปิดใบงาน กล่องเตือนใบซ้ำแบบย่อ (ไม่มีอาการ ไม่มีปุ่มเปิดดู)
//   · แอดมิน: ปุ่มยกเลิกใบงานท้ายหน้า (เหนือลบถาวร) เลือกเหตุผล → ฐานข้อมูลยกเลิก · หน้าใบงานบอกเหตุผล
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
  let fx = null;
  try {
    fx = await setup();
    const myTeam = fx.sql(`select team from "User" where "employeeCode"='T001'`);
    const otherTeam = fx.sql(`select zone from "Branch" where code='C0006'`);
    if (myTeam === otherTeam) throw new Error("ทีม T001 ตรงกับทีมสาขา C0006 — เทสต์นี้ต้องการคนละทีม");
    const dup = await fx.workOrder("C0006", null);
    fx.sql(`update "WorkOrder" set symptom='อาการลับของสาขาอื่น' where id=${dup.id}`);
    const mine = await fx.workOrder("C0006", null);
    fx.sql(`update "WorkOrder" set status='IN_PROGRESS', "needsParts"=false, "assignedTeam"='${myTeam}', "scheduledAt"='2026-11-20', "appointmentStatus"='CONFIRMED' where id=${mine.id}`);
    const branchName = fx.sql(`select name from "Branch" where code='C0006'`);

    const open = async (code) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1200);
      return { ctx, page, vis };
    };
    const search = async (page, text) => {
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(text);
      await page.waitForTimeout(2500);
    };

    {
      const { ctx, page, vis } = await open("T001");
      await search(page, mine.code);
      await vis(mine.code).last().click();
      await page.waitForTimeout(3000);
      (await vis("สาขาและเครื่อง").count()) > 0 && (await page.locator('[aria-label="จบใบงาน"]').locator("visible=true").count()) === 0
        ? pass("ช่างเปิดใบทีมตัวเองได้ และไม่มีปุ่มยกเลิกใบงาน") : fail("ช่างเปิดใบตัวเองไม่ได้ หรือเห็นปุ่มยกเลิก");
      await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
      await page.waitForTimeout(1500);
      // หัวหน้าภาคย้ายใบไปทีมอื่นระหว่างที่ช่างยังเห็นใบในรายการ
      fx.sql(`update "WorkOrder" set "assignedTeam"='${otherTeam}' where id=${mine.id}`);
      await vis(mine.code).last().click();
      await page.waitForTimeout(3000);
      const t = await page.evaluate(() => document.body.innerText);
      (await page.locator('[aria-label="ไม่มีสิทธิ์ดูใบงานนี้"]').locator("visible=true").count()) > 0 && t.includes("ใบงานนี้ไม่ใช่ของทีมคุณ") && !t.includes("081-234-5678")
        ? pass("ใบถูกย้ายไปทีมอื่น: ช่างเปิดแล้วขึ้นหน้ากุญแจ ไม่เห็นเบอร์ลูกค้า") : fail("ไม่ขึ้นหน้ากุญแจ / เบอร์หลุด");
      await page.screenshot({ path: path.join(DIR, "perm-locked.png") });
      await vis("กลับไปรายการใบงาน").first().click();
      await page.waitForTimeout(1500);

      await vis("เพิ่มใบงาน").first().click();
      await page.waitForTimeout(2500);
      const box = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
      await box.click();
      await box.type("C0006", { delay: 70 });
      await page.waitForTimeout(2400);
      await vis(branchName, false).last().click();
      await page.waitForTimeout(2500);
      const warn = (await page.locator('[aria-label="เตือนใบงานเปิดค้าง"]').count()) ? await page.locator('[aria-label="เตือนใบงานเปิดค้าง"]').first().innerText() : "";
      warn.includes("ถามหัวหน้าภาคก่อนเปิดซ้ำ") && warn.includes(dup.code) && !warn.includes("อาการลับของสาขาอื่น") && !warn.includes("เปิดดู ›")
        ? pass("ช่าง: กล่องเตือนใบซ้ำแบบย่อ (เห็นเลขใบงาน ไม่เห็นอาการ ไม่มีปุ่มเปิดดู)") : fail(`กล่องเตือน: ${warn.replace(/\n/g, " | ").slice(0, 300)}`);
      await page.screenshot({ path: path.join(DIR, "perm-warning.png") });
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("A001");
      await search(page, dup.code);
      await vis(dup.code).last().click();
      await page.waitForTimeout(3000);
      // ปุ่มยกเลิกอยู่ท้ายหน้าคู่กับลบถาวร ไม่ใช่หัวใบงาน (เจ้าของงานขอ ต.ค. 69)
      const yOf = async (loc) => (await loc.first().boundingBox())?.y ?? -1;
      // ปุ่มเดียว "จบใบงาน…" (ต.ค. 69) — ยกเลิกเป็นทางเลือกข้างใน ยังอยู่ท้ายหน้า
      const cancelY = await yOf(page.locator('[aria-label="จบใบงาน"]').locator("visible=true"));
      const deleteY = await yOf(page.getByText("ลบใบงานนี้ถาวร", { exact: true }).locator("visible=true"));
      const branchY = await yOf(page.getByText("สาขาและเครื่อง", { exact: true }).locator("visible=true"));
      cancelY > branchY && deleteY > cancelY ? pass("ปุ่มยกเลิกใบงานอยู่ท้ายหน้า เหนือ ลบใบงานนี้ถาวร") : fail(`ตำแหน่งปุ่ม: ยกเลิก ${cancelY} สาขา ${branchY} ลบ ${deleteY}`);
      await page.locator('[aria-label="จบใบงาน"]').locator("visible=true").first().click();
      await page.waitForTimeout(800);
      await page.locator('[aria-label="จบ: ไม่ทำแล้ว"]').locator("visible=true").last().click();
      await page.waitForTimeout(800);
      await page.locator('[aria-label="ยืนยันยกเลิกใบงาน"]').locator("visible=true").last().click();
      await page.waitForTimeout(800);
      fx.sql(`select status from "WorkOrder" where id=${dup.id}`) !== "CANCELLED" && (await vis("เลือกเหตุผลก่อน").count()) > 0
        ? pass("ไม่เลือกเหตุผล: ยกเลิกไม่ได้ บอกให้เลือกเหตุผล") : fail("ยกเลิกได้โดยไม่มีเหตุผล");
      await page.locator('[aria-label="เหตุผลยกเลิก เปิดซ้ำ"]').locator("visible=true").first().click();
      await page.locator('[aria-label="รายละเอียดที่ยกเลิก"]').locator("visible=true").first().fill(`ซ้ำกับ ${mine.code}`);
      await page.screenshot({ path: path.join(DIR, "perm-cancel.png") });
      await page.locator('[aria-label="ยืนยันยกเลิกใบงาน"]').locator("visible=true").last().click();
      await page.waitForTimeout(3500);
      const note = fx.sql(`select coalesce(max(note),'-') from "WorkOrderLog" where "workOrderId"=${dup.id} and action='CANCELLED'`);
      fx.sql(`select status from "WorkOrder" where id=${dup.id}`) === "CANCELLED" && note === `เปิดซ้ำ — ซ้ำกับ ${mine.code}`
        ? pass("แอดมินกดยกเลิกผ่านหน้าจอ: ฐานข้อมูลยกเลิก พร้อมเหตุผล") : fail(`ฐานข้อมูล: ${fx.sql(`select status from "WorkOrder" where id=${dup.id}`)} / ${note}`);
      const banner = (await page.locator('[aria-label="กล่องยกเลิกใบงาน"]').count()) ? await page.locator('[aria-label="กล่องยกเลิกใบงาน"]').first().innerText() : "";
      banner.includes("ยกเลิกแล้ว — เปิดซ้ำ") && banner.includes(mine.code) ? pass("หน้าใบงานบอกว่ายกเลิกเพราะอะไร ใคร เมื่อไร") : fail(`กล่อง: ${banner}`);
      await page.screenshot({ path: path.join(DIR, "perm-cancelled.png") });
      await ctx.close();
    }
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
