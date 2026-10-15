// ทดสอบ: ป้ายประกันในรายการ — ติดตามเครื่องเสีย (ตาราง + ตัวกรอง "ประกัน") และรายการใบงานซ่อม
//        สาขาแฟรนไชส์ชั่วคราวเปิดมา 35 เดือน: Oasis (2 ปี) หมดประกัน · Huebsch (3 ปี) ใกล้หมด
//        สร้างสาขา/เครื่อง/เคสเครื่องดับเอง แล้วลบทิ้งตอนจบ (ต้องมี DATABASE_URL)
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
  const fx = await setup();
  const BC = `DZW${Math.floor(Math.random() * 90000) + 10000}`;
  let bid = null;
  let woId = null;
  try {
    fx.sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt") values ('สาขาทดสอบป้ายประกัน','${BC}','ใต้','กระบี่','FRANCHISE',now()-interval '35 months')`);
    bid = fx.sql(`select id from "Branch" where code='${BC}'`);
    fx.sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','OASIS',now()),(${bid},'W2','WASHER','HUEBSCH',now())`);
    fx.sql(`insert into "Outage"(kind,"branchId","machineId","startedAt","lastSeenAt") select 'MACHINE_OFF',${bid},id,now()-interval '2 hours',now() from "Machine" where "branchId"=${bid}`);
    const wo = await fx.call(fx.A, "POST", "/work-orders", {
      branchCode: BC, jobType: "CM", priority: "NORMAL",
      machines: [{ code: "W2", symptom: "ทดสอบป้ายประกัน" }],
    });
    woId = wo.orders ? wo.orders[0].id : wo.id;
    const woCode = fx.sql(`select code from "WorkOrder" where id=${woId}`);

    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);

    // ── ติดตามเครื่องเสีย ──
    await page.locator('[aria-label="ติดตามเครื่องเสีย"]').locator("visible=true").first().click();
    await page.waitForTimeout(3500);
    await page.getByPlaceholder(/ค้นรหัสสาขา/).locator("visible=true").first().fill(BC);
    await page.waitForTimeout(1500);
    const badges = await page.evaluate(() =>
      [...document.querySelectorAll("[aria-label]")]
        .map((n) => n.getAttribute("aria-label"))
        .filter((t) => /^(ในประกัน|ใกล้หมดประกัน|หมดประกัน|ไม่ทราบวันเปิดร้าน)/.test(t || ""))
    );
    badges.some((t) => t.startsWith("หมดประกัน ·")) && badges.some((t) => /^ใกล้หมดประกัน · เหลือ \d+ วัน$/.test(t))
      ? pass(`ตารางติดตามเครื่องเสีย: Oasis หมดประกัน · Huebsch ใกล้หมด (${badges.join(" | ")})`)
      : fail(`ป้ายในตาราง: ${JSON.stringify(badges)}`);
    (await vis("ประกัน").count()) > 0 ? pass("มีแถวตัวกรอง \"ประกัน\"") : fail("ไม่มีแถวตัวกรองประกัน");
    // กดชิปใกล้หมดประกัน — เหลือแถวเดียว (W2)
    await page.getByText(/^ใกล้หมดประกัน/).locator("visible=true").first().click();
    await page.waitForTimeout(1200);
    (await vis("ประกัน: ใกล้หมดประกัน").count()) > 0 && (await page.getByText(/^1 จาก/).locator("visible=true").count()) > 0
      ? pass("กดชิปใกล้หมดประกันแล้วเหลือ 1 เครื่อง และขึ้นในแถบกำลังกรอง")
      : fail("ตัวกรองประกันไม่ทำงาน");
    await page.screenshot({ path: path.join(DIR, "warranty-monitor.png") });

    // ── รายการใบงานซ่อม ──
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").first().click();
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(woCode);
    await page.waitForTimeout(2500);
    (await page.getByText(/^ใกล้หมดประกัน · เหลือ \d+ วัน$/).locator("visible=true").count()) > 0
      ? pass(`รายการใบงานซ่อม: ${woCode} ขึ้นป้ายใกล้หมดประกัน`)
      : fail("รายการใบงานไม่มีป้ายประกัน");
    await page.screenshot({ path: path.join(DIR, "warranty-list.png") });
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    if (woId) await fx.call(fx.A, "DELETE", `/work-orders/${woId}`);
    if (bid) fx.sql(`delete from "Outage" where "branchId"=${bid}; delete from "Machine" where "branchId"=${bid}; delete from "Branch" where id=${bid}`);
    await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
