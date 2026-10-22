// ทดสอบ: วันนัด + สถานะนัดในรายการใบงาน (เจ้าของงานขอ ต.ค. 69)
//   · จอคอม: คอลัมน์ "วันนัด" — วัน+เวลา · ป้ายสถานะนัด · "เลยนัดมา N วัน" / "วันนี้" · ยังไม่นัด
//   · กรองหัวคอลัมน์ "เลยนัด" เหลือเฉพาะใบที่เลยนัด (ตามฐานข้อมูล) · ปุ่มเรียง "วันนัดใกล้สุด" เลยนัดขึ้นก่อนวันนี้
//   · จอ 1024 px: ป้ายสถานะใบงานไม่ถูกตัดเพราะคอลัมน์เพิ่ม · มือถือ: การ์ดมีบรรทัดนัด
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
    const late = await fx.workOrder("C0006", null);
    const today = await fx.workOrder("C0006", null);
    const none = await fx.workOrder("C0006", null);
    // วันตามเวลาไทย: เลยนัด 5 วัน (รอลูกค้าคอนเฟิร์ม) · วันนี้ 10:30 (คอนเฟิร์มแล้ว)
    const bkk = fx.sql("select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD')");
    fx.sql(`update "WorkOrder" set status='AWAITING_CONFIRM', "scheduledAt"=('${bkk}'::date - 5), "scheduledTime"='14:00', "appointmentStatus"='PENDING', "assignedTeam"='กระบี่' where id=${late.id}`);
    fx.sql(`update "WorkOrder" set status='IN_PROGRESS', "scheduledAt"='${bkk}'::date, "scheduledTime"='10:30', "appointmentStatus"='CONFIRMED', "assignedTeam"='กระบี่' where id=${today.id}`);
    // แอดมินคอนเฟิร์มนัดใบ "วันนี้" — ประวัติคือที่มาของชื่อ · อีกแถวเป็นของปิดงานย้อนหลัง (ต้องไม่ถูกนับ)
    const aid = fx.sql(`select id from "User" where "employeeCode"='A001'`);
    const aname = fx.sql(`select name from "User" where "employeeCode"='A001'`);
    fx.sql(`insert into "WorkOrderLog"("workOrderId","userId",action,status,note,"createdAt") values (${today.id},${aid},'CONFIRMED','ASSIGNED','ทดสอบคอนเฟิร์ม',now() - interval '1 hour')`);
    const lateCount = Number(fx.sql(`select count(*) from "WorkOrder" where "scheduledAt" < '${bkk}'::date and status not in ('DONE','CANCELLED') and not "isTest"`));

    const open = async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      if (width >= 1200) await page.getByLabel("ใบงานซ่อม").first().click();
      else await vis("ใบงาน").last().click();
      await page.waitForTimeout(3000);
      return { page, vis, label: (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true") };
    };
    // ข้อความของแถวใบงานหนึ่ง — ค้นด้วยรหัสให้เหลือแถวเดียว แล้วอ่านทั้งตาราง
    const rowText = async (page, code) => {
      const box = page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
      await box.fill(code);
      await page.waitForTimeout(2500);
      const t = await page.evaluate(() => document.body.innerText);
      await box.fill("");
      await page.waitForTimeout(2000);
      return t;
    };

    {
      const { page, vis, label } = await open(1600);
      (await vis("วันนัด").count()) > 0 ? pass("มีหัวคอลัมน์ วันนัด") : fail("ไม่มีคอลัมน์วันนัด");
      const t1 = await rowText(page, late.code);
      /14:00\sน\./.test(t1) && t1.includes("รอลูกค้าคอนเฟิร์ม") && t1.includes("เลยนัดมา 5 วัน")
        ? pass("ใบเลยนัด: วัน+เวลา · รอลูกค้าคอนเฟิร์ม · เลยนัดมา 5 วัน") : fail(`แถวเลยนัด: ${t1.replace(/\n/g, " | ")}`);
      const t2 = await rowText(page, today.code);
      /10:30\sน\./.test(t2) && t2.includes("ลูกค้าคอนเฟิร์มแล้ว") && t2.includes("วันนี้")
        ? pass("ใบนัดวันนี้: ลูกค้าคอนเฟิร์มแล้ว · วันนี้") : fail(`แถววันนี้: ${t2.replace(/\n/g, " | ")}`);
      t2.includes(`โดย ${aname}`) && !t1.includes(`โดย ${aname}`)
        ? pass(`คอนเฟิร์มแล้วขึ้น "โดย ${aname}" · ใบที่ยังรอคอนเฟิร์มไม่มีชื่อ`) : fail("ชื่อคนคอนเฟิร์มในรายการไม่ถูก");
      (await rowText(page, none.code)).includes("ยังไม่นัด") ? pass("ใบที่ยังไม่มีวัน: ยังไม่นัด") : fail("ใบไม่มีวันไม่ขึ้นยังไม่นัด");

      // การเรียงอยู่ในปุ่ม "เรียง ▾" (ตัวกรองแบบใหม่ ต.ค. 69)
      await label("เลือก เรียง").first().click();
      await page.waitForTimeout(500);
      await label("ตัวกรอง วันนัดใกล้สุด").first().click();
      await page.waitForTimeout(1200);
      const codes = await page.getByText(/^WO-\d+$/).locator("visible=true").allTextContents();
      // ใบที่ยังไม่นัดไปท้ายรายการ — อาจยังไม่ถูกวาด (รายการวาดเท่าที่เห็น) จึงยอมให้ไม่เจอ
      const ni = codes.indexOf(none.code);
      codes.indexOf(late.code) >= 0 && codes.indexOf(late.code) < codes.indexOf(today.code) && (ni === -1 || ni > codes.indexOf(today.code))
        ? pass("เรียงวันนัดใกล้สุด: เลยนัด → วันนี้ → ยังไม่นัดไปท้าย") : fail(`ลำดับ: ${[late.code, today.code, none.code].map((c) => codes.indexOf(c)).join(",")}`);
      await label("เลือก เรียง").first().click();
      await page.waitForTimeout(500);
      await label("ตัวกรอง ด่วนก่อน").first().click();
      await page.waitForTimeout(800);

      await label("ตัวกรองคอลัมน์ วันนัด").first().click();
      await page.waitForTimeout(800);
      await label("เลือกทั้งหมด").click();
      await label("ค่า เลยนัด").first().click();
      await label("ตกลง ตัวกรอง วันนัด").click();
      await page.waitForTimeout(1500);
      const left = await page.getByText(/^WO-\d+$/).locator("visible=true").allTextContents();
      left.includes(late.code) && !left.includes(today.code) && left.length === lateCount
        ? pass(`กรอง "เลยนัด" เหลือ ${left.length} ใบ ตรงกับฐานข้อมูล`) : fail(`กรองเลยนัด: เห็น ${left.length} ฐานข้อมูล ${lateCount}`);
      await page.screenshot({ path: path.join(DIR, "appointment-list.png") });
      await page.close();
    }
    {
      const { page } = await open(1024);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll("*")].filter((n) => !n.children.length && n.offsetParent && n.textContent.includes("รอ") && n.scrollWidth > n.clientWidth + 1).length
      );
      clipped === 0 ? pass("จอ 1024 px: ข้อความป้ายไม่ถูกตัด") : fail(`จอ 1024 px: ข้อความถูกตัด ${clipped} จุด`);
      await page.close();
    }
    {
      const { page, vis } = await open(420);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(late.code);
      await page.waitForTimeout(2500);
      (await vis("เลยนัดมา 5 วัน").count()) > 0 && (await vis("รอลูกค้าคอนเฟิร์ม").count()) > 0 && (await vis("นัด").count()) > 0
        ? pass("มือถือ: การ์ดมีบรรทัดนัด + สถานะ + เลยนัด") : fail("การ์ดมือถือไม่มีบรรทัดนัด");
      await page.screenshot({ path: path.join(DIR, "appointment-card.png") });
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(today.code);
      await page.waitForTimeout(2500);
      (await vis(`คอนเฟิร์มโดย ${aname}`).count()) > 0 ? pass("การ์ดมือถือ: คอนเฟิร์มโดย …") : fail("การ์ดมือถือไม่บอกคนคอนเฟิร์ม");
      await vis(today.code).last().click();
      await page.waitForTimeout(3000);
      (await vis(new RegExp(`^โดย ${aname} · `)).count()) > 0 ? pass("หน้าใบงาน: สถานะนัดบอกชื่อและเวลาที่คอนเฟิร์ม") : fail("หน้าใบงานไม่บอกคนคอนเฟิร์ม");
      await page.screenshot({ path: path.join(DIR, "appointment-detail.png") });
      await page.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
