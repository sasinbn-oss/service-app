// ทดสอบ: ตรวจหน้างาน 3 จังหวะ (เจ้าของงานกำหนด ต.ค. 69 รอบสอง) — แต่ละจังหวะกดจากหน้าจอด้วยบทบาทจริง
//   1) หัวหน้าภาคส่งตรวจ — ต้องใส่วันเข้าตรวจ ปุ่มยืนยันกดไม่ได้จนใส่วัน → รอแอดมินนัดลูกค้า
//   2) แอดมินคอนเฟิร์มวันกับร้าน → รอหัวหน้าภาคส่งช่างตรวจ (ยังไม่ถึงช่าง)
//   3) หัวหน้าภาคส่งช่างเข้าตรวจ → รอทีมตรวจหน้างาน ตามวันนัด แถบขั้นตอนขั้นนัด/ขั้นส่งขึ้นว่าทำแล้ว
//   เช็คฐานข้อมูลทุกจังหวะ
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
    const wo = await fx.workOrder("C0006", null);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    const state = () => db(`status||'|'||coalesce("appointmentStatus",'-')||'|'||coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-')||'|'||coalesce("assignedTeam",'-')`);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);

    // วันที่ 15 ของเดือนหน้า (ตามเวลาไทย)
    const target = fx.sql("select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok')) + interval '1 month' + interval '14 day','YYYY-MM-DD')");
    const [ty, tm] = target.split("-").map(Number);
    const dayLabel = `${DOW[new Date(Date.UTC(ty, tm - 1, 15)).getUTCDay()]} 15 ${MONTHS[tm - 1]} ${ty + 543}`;

    const openAs = async (code, width = 420) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      // จอคอมมีเมนูข้าง ไม่มีแถบล่าง
      if (width >= 1200) await page.getByLabel("ใบงานซ่อม").first().click();
      else await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
      await page.waitForTimeout(2500);
      await vis(wo.code).last().click();
      await page.waitForTimeout(3000);
      const save = vis("ยืนยัน").last();
      const op = () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
      return { ctx, page, vis, save, op };
    };

    // ── 1) หัวหน้าภาคส่งตรวจ ต้องใส่วัน ──
    {
      const { ctx, page, vis, save, op } = await openAs("S001");
      await vis("ระบุอะไหล่").first().click();
      await page.waitForTimeout(1200);
      await vis("ต้องเข้าตรวจสอบหน้างานก่อน").click();
      await page.waitForTimeout(500);
      (await op()) !== "1" ? pass("ส่งตรวจ: ยังไม่ใส่วันเข้าตรวจ ปุ่มยืนยันกดไม่ได้") : fail("ส่งตรวจได้ทั้งที่ไม่มีวัน");
      await page.getByLabel("วันเข้าตรวจหน้างาน", { exact: true }).locator("visible=true").last().click();
      await page.waitForTimeout(400);
      await page.getByLabel("เดือนถัดไป").last().click();
      await page.waitForTimeout(200);
      await page.getByLabel(dayLabel, { exact: true }).click();
      await page.waitForTimeout(400);
      (await op()) === "1" ? pass(`ใส่วัน ${dayLabel} แล้วปุ่มกดได้`) : fail("ใส่วันแล้วยังกดไม่ได้");
      await save.click();
      await page.waitForTimeout(3500);
      state() === `INSPECT_CONFIRM|PENDING|${target}|${team}`
        ? pass("หัวหน้าภาคส่งตรวจพร้อมวัน → รอแอดมินนัดลูกค้า (ฐานข้อมูล)")
        : fail(`หลังส่งตรวจ: ${state()}`);
      await ctx.close();
    }

    // ── 2) แอดมินคอนเฟิร์มวันกับร้าน ──
    {
      const { ctx, page, vis, save } = await openAs("A001");
      await vis("นัดร้าน (ตรวจหน้างาน)").first().click();
      await page.waitForTimeout(1500);
      (await vis("ส่งให้หัวหน้าภาคส่งช่างเข้าตรวจ").count()) > 0
        ? pass("ฟอร์มนัดบอกว่าคอนเฟิร์มแล้วกลับไปให้หัวหน้าภาคส่งช่าง")
        : fail("ฟอร์มนัดไม่บอกขั้นถัดไป");
      await vis("ลูกค้าคอนเฟิร์มวันนี้").click();
      await page.waitForTimeout(400);
      await save.click();
      await page.waitForTimeout(3500);
      state() === `INSPECT_DISPATCH|CONFIRMED|${target}|${team}`
        ? pass("แอดมินคอนเฟิร์ม → หัวหน้าภาค · ส่งช่างตรวจ วันเดิม (ฐานข้อมูล)")
        : fail(`หลังคอนเฟิร์ม: ${state()}`);
      (await vis("หัวหน้าภาค · ส่งช่างตรวจ", false).count()) > 0 ? pass("หน้าจอขึ้นว่าหัวหน้าภาค · ส่งช่างตรวจ") : fail("หน้าจอไม่อัปเดตสถานะ");
      await ctx.close();
    }

    // ── 3) หัวหน้าภาคส่งช่างเข้าตรวจ ──
    {
      // จอคอม — แถบขั้นตอนบนมือถือเหลือแต่วงกลม ไม่มีชื่อขั้นให้เช็ค
      const { ctx, page, vis, save } = await openAs("S001", 1400);
      await vis("ส่งช่างตรวจ").first().click();
      await page.waitForTimeout(1500);
      (await vis("ลูกค้าคอนเฟิร์มแล้ว · เข้าตรวจ", false).count()) > 0 && (await vis("ทีมที่จะไปตรวจ").count()) > 0
        ? pass("ฟอร์มส่งช่างบอกว่าร้านคอนเฟิร์มแล้ว และเลือก/เปลี่ยนทีมได้")
        : fail("ฟอร์มส่งช่างไม่บอกผลคอนเฟิร์ม");
      await save.click();
      await page.waitForTimeout(3500);
      state() === `INSPECTING|CONFIRMED|${target}|${team}`
        ? pass("หัวหน้าภาคส่งช่าง → ช่าง · ตรวจหน้างาน ตามวันนัด ทีมเดิม (ฐานข้อมูล)")
        : fail(`หลังส่งช่าง: ${state()}`);
      // แถบขั้นตอน — ขั้นนัดและขั้นส่งช่างต้องไม่ถูกขีดฆ่า (ทำแล้วจริง ไม่ใช่ข้าม)
      const struck = await page.evaluate(() => {
        const card = document.querySelector('[aria-label="ขั้นตอนงาน"]');
        const of = (t) => {
          const n = card && [...card.querySelectorAll("*")].find((x) => !x.children.length && x.textContent.trim() === t);
          return n ? getComputedStyle(n).textDecorationLine : "missing";
        };
        return [of("นัดร้านแล้ว"), of("ส่งช่างตรวจแล้ว")];
      });
      struck.every((x) => x !== "missing" && !x.includes("line-through"))
        ? pass("แถบขั้นตอนมีขั้นนัดตรวจและขั้นส่งช่าง ขึ้นว่าทำแล้วทั้งคู่")
        : fail(`แถบขั้นตอน: ${struck.join(" / ")}`);
      await page.screenshot({ path: path.join(DIR, "inspect-confirm-done.png") });
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
