// ทดสอบ: ข้อความแจ้งคิวช่างให้ลูกค้า + ปุ่มคัดลอก (เจ้าของงานขอ ต.ค. 69)
//   · แอดมินกดคอนเฟิร์มลูกค้าผ่านหน้าจอ → เด้งข้อความ · คัดลอกแล้วคลิปบอร์ดได้ข้อความครบ (อ่านคลิปบอร์ดจริง)
//   · ข้อความ: เลขใบงาน · ชื่อสาขา · เครื่อง · อาการบรรทัดแรกเท่านั้น · วันเวลานัด · งานซ่อมใช้ "เข้าซ่อม"
//   · การ์ดในหน้าใบงานยังอยู่หลังปิดหน้าต่าง · งานตรวจหน้างานใช้ "เข้าตรวจสอบ" · ช่างไม่เห็นการ์ด
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
    const repair = await fx.workOrder("C0006", null);
    const inspect = await fx.workOrder("C0006", null);
    const branchName = fx.sql(`select name from "Branch" where code='C0006'`);
    fx.sql(`update "WorkOrder" set status='AWAITING_CONFIRM', "scheduledAt"='2026-11-20', "scheduledTime"='13:00', "appointmentStatus"='PENDING', "assignedTeam"='กระบี่',
            symptom='เครื่องไม่ปั่นหมาด'||chr(10)||'สาเหตุ: สายพานขาด (ภายใน)' where id=${repair.id}`);
    fx.sql(`update "WorkOrder" set status='INSPECT_DISPATCH', "scheduledAt"='2026-11-21', "scheduledTime"=null, "appointmentStatus"='CONFIRMED', "assignedTeam"=(select team from "User" where "employeeCode"='T001') where id=${inspect.id}`);

    const openAs = async (code, wo) => {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
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
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      await vis(wo.code).last().click();
      await page.waitForTimeout(3000);
      return { ctx, page, vis };
    };

    {
      const { ctx, page, vis } = await openAs("A001", repair);
      (await vis("💬 ข้อความแจ้งลูกค้า").count()) === 0 ? pass("ยังรอลูกค้าคอนเฟิร์ม = ยังไม่มีข้อความให้คัดลอก") : fail("มีข้อความก่อนคอนเฟิร์ม");
      await vis("คอนเฟิร์มลูกค้า").first().click();
      await page.waitForTimeout(1200);
      await vis("ลูกค้าคอนเฟิร์มวันนี้").click();
      await page.waitForTimeout(300);
      await vis("ยืนยัน").last().click();
      await page.waitForTimeout(4000);
      fx.sql(`select "appointmentStatus" from "WorkOrder" where id=${repair.id}`) === "CONFIRMED" &&
      (await vis(`คอนเฟิร์มลูกค้าแล้ว · ${repair.code}`).count()) > 0
        ? pass("กดคอนเฟิร์มแล้ว (ฐานข้อมูล) เด้งหน้าต่างข้อความแจ้งลูกค้าทันที") : fail("ไม่เด้งหน้าต่างข้อความ");
      await page.screenshot({ path: path.join(DIR, "customer-message-modal.png") });
      await page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").last().click();
      await page.waitForTimeout(500);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      const want = [
        "🛠️ Service Care ขอแจ้งคิวช่างสำหรับการเข้าซ่อมที่สาขานะคะ",
        `📋 Case No. ${repair.code}`,
        `🏪 ชื่อสาขา: ${branchName}`,
        "🧺 เครื่อง: W77",
        "🔧 อาการ: เครื่องไม่ปั่นหมาด",
        "📅 วัน–เวลา: 20 พ.ย. 69 · 13:00 น.",
        "✅ หลังจากเสร็จสิ้นงาน จะมีการแจ้งผลการซ่อมให้ทราบอีกครั้งค่ะ",
      ];
      const missing = want.filter((l) => !clip.split("\n").includes(l));
      !missing.length && !clip.includes("สาเหตุ") && (await vis("คัดลอกแล้ว").count()) > 0
        ? pass("คัดลอกแล้วคลิปบอร์ดได้ข้อความครบ (เลขใบงาน สาขา เครื่อง อาการบรรทัดแรก วันเวลา) ไม่มีบรรทัดสาเหตุ")
        : fail(`คลิปบอร์ด: ขาด ${missing.join(" / ")} :: ${clip.replace(/\n/g, " | ")}`);
      await vis("ปิด").last().click();
      await page.waitForTimeout(800);
      (await vis("💬 ข้อความแจ้งลูกค้า").count()) > 0 ? pass("ปิดหน้าต่างแล้ว การ์ดข้อความยังอยู่ในหน้าใบงาน") : fail("ไม่มีการ์ดข้อความในหน้าใบงาน");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await openAs("A001", inspect);
      const t = await page.evaluate(() => document.body.innerText);
      t.includes("สำหรับการเข้าตรวจสอบที่สาขา") && t.includes("แจ้งผลการตรวจสอบ") && t.includes("📅 วัน–เวลา: 21 พ.ย. 69\n")
        ? pass("งานตรวจหน้างานใช้ \"เข้าตรวจสอบ / ผลการตรวจสอบ\" · ไม่มีเวลาขึ้นแค่วัน") : fail("ข้อความงานตรวจไม่ถูก");
      await page.screenshot({ path: path.join(DIR, "customer-message-card.png") });
      await ctx.close();
    }
    {
      const { ctx, vis } = await openAs("T001", inspect).catch(() => ({}));
      if (vis) {
        (await vis("💬 ข้อความแจ้งลูกค้า").count()) === 0 ? pass("ช่างไม่เห็นการ์ดข้อความแจ้งลูกค้า") : fail("ช่างเห็นการ์ดข้อความ");
        await ctx.close();
      } else fail("ช่างเปิดใบงานไม่ได้");
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
