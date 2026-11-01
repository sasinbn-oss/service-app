// ทดสอบ: หน้าสรุปคอนเฟิร์มลูกค้า (จ่ายงานผ่านกลุ่มไลน์ช่าง) ด้วยบทบาทจริง — อ่านคลิปบอร์ดจริง
//   รูปแบบข้อความ (ต.ค. 69): ไม่มีอิโมจิ · หัวคิวงาน+ทีม · เส้นคั่นงาน · เลขที่ใบงาน/รหัสสาขาแยกบรรทัด
//   · ไม่มีอาการ · ไม่มีเบอร์ = "ไม่มีในใบงาน" · ลิงก์แผนที่ · ใบที่ยังไม่ปล่อยงานมีบรรทัด "สถานะ: ยังไม่ปล่อยงาน" (เวลาปิดรับ ต.ค. 69)
//   · การ์ดในเมนูรายงาน: แอดมินเห็น · ช่างไม่เห็น
//   · เคสที่คอนเฟิร์มวันนี้แยกตามทีม · คัดลอกทั้งหมดได้ทุกเคส + เบอร์ร้าน + ไม่มีชื่อแอดมิน
//   · คัดลอกทีมนี้ได้เฉพาะทีมนั้น · สลับ "นัดเข้างานวันที่" ไปวันที่ไม่มีนัด = ว่าง
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
  let restoreBranch = () => {};
  try {
    fx = await setup();
    const a = await fx.workOrder("C0006", null);
    const b = await fx.workOrder("C0006", null);
    const teamA = fx.sql(`select zone from "Branch" where code='C0006'`);
    const teamB = fx.sql(`select zone from "Branch" where zone is not null and zone<>'${teamA}' order by zone limit 1`);
    const aid = fx.sql(`select id from "User" where "employeeCode"='A001'`);
    const aname = fx.sql(`select name from "User" where "employeeCode"='A001'`);
    // พิกัดสาขาชั่วคราว (คืนค่าเดิมตอนจบ) — ข้อความต้องมีลิงก์แผนที่
    const oldLat = fx.sql(`select coalesce(latitude::text,'null')||','||coalesce(longitude::text,'null') from "Branch" where code='C0006'`);
    fx.sql(`update "Branch" set latitude=13.7563, longitude=100.5018 where code='C0006'`);
    restoreBranch = () => fx.sql(`update "Branch" set latitude=${oldLat.split(",")[0]}, longitude=${oldLat.split(",")[1]} where code='C0006'`);
    // a ยังรอหัวหน้าภาคปล่อยงาน (ASSIGNED) · b ปล่อยให้ช่างแล้ว (IN_PROGRESS) — บรรทัด "สถานะ: ยังไม่ปล่อยงาน" ต้องขึ้นเฉพาะ a
    // (สองใบขั้นเดียวกัน = ขึ้นทุกใบก็ผ่าน เทสต์จับไม่ได้ว่าบอกช่างว่างานที่ปล่อยแล้วยังไม่ปล่อย)
    for (const [wo, team, t, st] of [[a, teamA, "09:00", "ASSIGNED"], [b, teamB, "14:00", "IN_PROGRESS"]]) {
      fx.sql(`update "WorkOrder" set status='${st}', "scheduledAt"='2026-12-10', "scheduledTime"='${t}', "appointmentStatus"='CONFIRMED', "assignedTeam"='${team}', "contactPhone"='081-111-222${wo.id % 10}' where id=${wo.id}`);
      fx.sql(`insert into "WorkOrderLog"("workOrderId","userId",action,status,note) values (${wo.id},${aid},'CONFIRMED','ASSIGNED','ทดสอบ')`);
    }
    // a: มีอาการ (ต้องไม่ติดไปในไลน์) · b: ไม่มีเบอร์ผู้ติดต่อ
    fx.sql(`update "WorkOrder" set symptom='${"ก".repeat(30)} ${"ข".repeat(40)} ท้ายสุดไม่ต้องอยู่ในไลน์' where id=${a.id}`);
    fx.sql(`update "WorkOrder" set "contactPhone"=null, "contactName"=null where id=${b.id}`);

    const openAs = async (code) => {
      const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
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
    const clip = (page) => page.evaluate(() => navigator.clipboard.readText());

    {
      const { ctx, vis } = await openAs("T001");
      (await vis("สรุปคอนเฟิร์มลูกค้า").count()) === 0 ? pass("ช่างไม่เห็นการ์ดสรุปคอนเฟิร์มลูกค้า") : fail("ช่างเห็นการ์ด");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await openAs("A001");
      await vis("สรุปคอนเฟิร์มลูกค้า").first().click();
      await page.waitForTimeout(2500);
      (await vis(a.code).count()) > 0 && (await vis(b.code).count()) > 0 && (await vis(`👷 ${teamA}`).count()) > 0 && (await vis(`👷 ${teamB}`).count()) > 0
        ? pass("เคสที่คอนเฟิร์มวันนี้ขึ้น แยกตามทีม") : fail("ไม่เห็นเคส/ทีม");
      await page.screenshot({ path: path.join(DIR, "confirmed-report.png"), fullPage: true });
      await page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").first().click();
      await page.waitForTimeout(500);
      const all = await clip(page);
      const lines = all.split("\n");
      all.startsWith("คิวงานช่าง พฤ. 10 ธ.ค. 69") && lines.includes(`ทีม: ${teamA} (1 งาน)`) &&
      lines.includes("1) 09:00 น. | ซ่อม") && lines.includes("------------------------") &&
      lines.includes(`เลขที่ใบงาน: ${a.code}`) && lines.includes(`เลขที่ใบงาน: ${b.code}`) && lines.includes("รหัสสาขา: C0006") &&
      lines.includes("ผู้ติดต่อ: ไม่มีในใบงาน") && lines.includes("แผนที่: https://maps.google.com/?q=13.7563,100.5018") &&
      !lines.some((l) => l.startsWith("อาการ")) && !all.includes("ท้ายสุด") &&
      !/\p{Extended_Pictographic}/u.test(all) && lines.every((l) => !l.startsWith(" ")) && !all.includes(aname)
        ? pass("คัดลอกทุกทีม: ไม่มีอิโมจิ · หัวคิวงาน+ทีม · เส้นคั่น · เลขที่ใบงาน/รหัสสาขาแยกบรรทัด · ไม่มีอาการ · ไม่มีเบอร์บอกตรง ๆ · แผนที่ · ไม่ย่อหน้า · ไม่มีชื่อแอดมิน")
        : fail(`คลิปบอร์ด: ${all.replace(/\n/g, " | ").slice(0, 400)}`);
      /**
       * บรรทัด "สถานะ: ยังไม่ปล่อยงาน" (เวลาปิดรับ ต.ค. 69) ดูทีละใบ — ตัดข้อความเป็นก้อนของแต่ละใบจากบรรทัด "เลขที่ใบงาน:" ถึงเส้นคั่นถัดไป
       * a (ASSIGNED) ต้องมีต่อจากบรรทัด "สาขา:" · b (IN_PROGRESS) ต้องไม่มี — ไม่นับทั้งข้อความ: ใบอื่นที่คอนเฟิร์มวันนี้ในฐานข้อมูลเครื่องทดสอบ
       * ไม่ทำให้ผล "กี่บรรทัด" เพี้ยน · ฐานข้อมูลยืนยันขั้นของทั้งสองใบ ไม่เชื่อแค่ที่ตั้งไว้ตอนเตรียม
       */
      const blockOf = (code) => {
        const i = lines.indexOf(`เลขที่ใบงาน: ${code}`);
        if (i < 0) return null;
        const end = lines.findIndex((l, k) => k > i && l === "------------------------");
        return lines.slice(i, end < 0 ? lines.length : end);
      };
      const ba = blockOf(a.code) || [];
      const bb = blockOf(b.code) || [];
      const at = ba.indexOf("สถานะ: ยังไม่ปล่อยงาน");
      const stAB = fx.sql(`select string_agg(status, ',' order by id) from "WorkOrder" where id in (${a.id},${b.id})`);
      stAB === "ASSIGNED,IN_PROGRESS" && at > 0 && ba[at - 1].startsWith("สาขา: ") && bb.length > 0 && !bb.includes("สถานะ: ยังไม่ปล่อยงาน")
        ? pass("บรรทัด \"สถานะ: ยังไม่ปล่อยงาน\" ต่อจากบรรทัดสาขาเฉพาะใบที่ยังไม่ปล่อย (ฐานข้อมูล ASSIGNED) · ใบที่ปล่อยแล้ว (IN_PROGRESS) ไม่มี")
        : fail(`บรรทัดสถานะ: ใบรอปล่อย ${ba.join(" / ")} · ใบปล่อยแล้ว ${bb.join(" / ")} · ฐานข้อมูล ${stAB}`);
      // ปุ่มที่สอง = คัดลอกทีมแรก
      await page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").nth(1).click();
      await page.waitForTimeout(500);
      const one = await clip(page);
      const first = [teamA, teamB].sort((x, y) => x.localeCompare(y, "th"))[0];
      const other = first === teamA ? b.code : a.code;
      one.includes(`ทีม: ${first}`) && !one.includes(other)
        ? pass("คัดลอกทีมนี้: ได้เฉพาะเคสของทีมนั้น") : fail(`คัดลอกทีม: ${one.replace(/\n/g, " | ").slice(0, 200)}`);
      // ปุ่มแยกตามผู้คอนเฟิร์ม — ใบ b ให้คนอื่น (S001) เป็นคนคอนเฟิร์ม แล้วกดปุ่มชื่อแอดมิน
      const sname = fx.sql(`select name from "User" where "employeeCode"='S001'`);
      fx.sql(`update "WorkOrderLog" set "userId"=(select id from "User" where "employeeCode"='S001') where "workOrderId"=${b.id} and action='CONFIRMED'`);
      // ปุ่มรีเฟรชของแอป — โหลดหน้าเว็บใหม่จะกลับไปหน้าแรก
      await vis("รีเฟรช").first().click();
      await page.waitForTimeout(3000);
      await page.locator(`[aria-label="ผู้คอนเฟิร์ม ${aname}"]`).locator("visible=true").first().click();
      await page.waitForTimeout(800);
      (await vis(a.code).count()) > 0 && (await vis(b.code).count()) === 0 && (await page.locator(`[aria-label="ผู้คอนเฟิร์ม ${sname}"]`).count()) > 0
        ? pass("ปุ่มแยกตามผู้คอนเฟิร์ม: กดชื่อแล้วเหลือเฉพาะเคสของคนนั้น") : fail("ปุ่มผู้คอนเฟิร์มไม่กรอง");
      await page.locator('[aria-label="คัดลอกข้อความแจ้งลูกค้า"]').locator("visible=true").first().click();
      await page.waitForTimeout(500);
      const mine = await clip(page);
      mine.includes(a.code) && !mine.includes(b.code) && !mine.includes(aname)
        ? pass("คัดลอกหลังเลือกผู้คอนเฟิร์ม: ได้เฉพาะเคสของคนนั้น") : fail(`คัดลอกรายคน: ${mine.replace(/\n/g, " | ").slice(0, 200)}`);
      await page.screenshot({ path: path.join(DIR, "confirmed-report-by.png"), fullPage: true });
      await page.locator('[aria-label="ผู้คอนเฟิร์ม ทุกคน"]').locator("visible=true").first().click();
      await page.waitForTimeout(500);
      await vis("นัดเข้างานวันที่").first().click();
      await page.waitForTimeout(2500);
      (await vis("ไม่มีคิวนัดเข้างานวันนี้").count()) > 0 || (await vis(a.code).count()) === 0
        ? pass("สลับเป็นนัดเข้างานวันที่ (วันนี้) — เคสที่นัด 10 ธ.ค. ไม่ขึ้น") : fail("นัดเข้างานวันนี้ยังเห็นเคสวันอื่น");
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) {
      restoreBranch();
      await fx.cleanup();
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
