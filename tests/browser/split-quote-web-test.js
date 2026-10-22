// ทดสอบ: แยกตัวที่หมดจากใบที่เก็บเงินลูกค้าแล้ว ต้องตอบว่าลูกค้าจ่ายค่าตัวที่หมดแล้วหรือยัง (WO-00528 ต.ค. 69)
//   · ฟอร์มเบิกขึ้นคำถามเฉพาะตอนแยก · ยังไม่ตอบ ปุ่มยืนยันกดไม่ได้
//   · ตอบ "ยังไม่จ่าย" → ใบใหม่เริ่มที่เช็คอะไหล่ (ฐานข้อมูล)
//   · แถบขั้นตอนของใบใหม่: ขั้นก่อนหน้าขึ้นว่า "ทำในใบเดิม WO-…" ไม่ใช่ ✓
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const fs = require("fs");
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
  let page = null;
  const extra = [];
  try {
    fx = await setup();
    // สาขาแฟรนไชส์หมดประกัน — ต้องเสนอราคา
    const branch = fx.sql(`select code from "Branch" where code like 'D%' and "cancelledAt" is null and "openedAt" < now() - interval '4 years' order by "openedAt" limit 1`);
    const board = fx.part("SP-BOARD"), belt = fx.part("SP-BELT");
    const wo = await fx.workOrder(branch, [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 1 }]);
    const up = async (file, role, type) => {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(path.join(DIR, "..", file))], { type }), file);
      fd.append("role", role);
      await fetch(`http://localhost:4000/api/work-orders/${wo.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${fx.A}` }, body: fd });
    };
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/parts-sourcing`, { results: [{ sparePartId: board, inStock: true }, { sparePartId: belt, inStock: true }] });
    await up("quote-sample.pdf", "QUOTE", "application/pdf");
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/quote`, {});
    await up("site-photo.png", "RECEIPT", "image/png");
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/payment`, {});
    fx.sql(`select status from "WorkOrder" where id=${wo.id}`) === "PARTS_REQUESTED" ? pass("เตรียมใบ: เสนอราคา รับเงินแล้ว ถึงขั้นเบิก") : fail("เตรียมใบไม่ถึงขั้นเบิก");

    page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    async function open(code) {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.waitForTimeout(2500);
      if (await page.getByPlaceholder("รหัสพนักงาน").count()) {
        await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
        await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
        await vis("เข้าสู่ระบบ").click();
        await page.waitForTimeout(3500);
      }
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await vis(code).last().click();
      await page.waitForTimeout(3000);
    }
    await open(wo.code);
    await vis("เบิกอะไหล่ (คลัง 94)").first().click();
    await page.waitForTimeout(1200);
    // ผลเช็คก่อนเสนอราคา (ไม่เกิน 3 วัน) เติม "มีของ" ให้แล้ว — เหลือเลือกคลัง
    await label("คลังที่มี SP-BOARD").click();
    await page.waitForTimeout(600);
    await page.getByPlaceholder("ค้นหา").locator("visible=true").first().fill("ลาดพร้าว");
    await page.waitForTimeout(700);
    await vis("คลังลาดพร้าว 94").last().click();
    await page.waitForTimeout(400);
    await vis("หมด").last().click();
    await page.waitForTimeout(400);
    await label("เลขใบเบิกอะไหล่").fill("RQ-SQ-WEB");
    await page.waitForTimeout(400);
    const ask = label("ลูกค้าจ่ายค่าอะไหล่ที่หมดแล้วหรือยัง");
    (await ask.count()) ? pass("แยกตัวที่หมด: ขึ้นคำถามลูกค้าจ่ายค่าตัวที่หมดแล้วหรือยัง") : fail("ไม่มีคำถามจ่ายแล้วหรือยัง");
    const save = vis("ยืนยัน").last();
    const dim = async () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
    (await dim()) !== "1" ? pass("ยังไม่ตอบ ปุ่มยืนยันกดไม่ได้") : fail("ยังไม่ตอบแต่ปุ่มกดได้");
    await label("ยังไม่จ่าย เสนอราคาใหม่").click();
    await page.waitForTimeout(400);
    (await vis("ใบใหม่เริ่มที่แอดมินเช็คอะไหล่", false).count()) ? pass("ตอบยังไม่จ่าย: บอกว่าใบใหม่เริ่มที่เช็คอะไหล่แล้วเสนอราคา") : fail("ไม่มีคำอธิบายผล");
    await page.screenshot({ path: path.join(DIR, "split-quote-form.png") });
    await save.click();
    await page.waitForTimeout(3500);
    const child = fx.sql(`select id||'|'||code||'|'||status from "WorkOrder" where "parentId"=${wo.id}`);
    const [cid, ccode, cst] = child.split("|");
    if (cid) extra.push(Number(cid));
    cst === "PARTS_SOURCING" && fx.sql(`select status from "WorkOrder" where id=${wo.id}`) === "PARTS_CHECKED"
      ? pass(`ฐานข้อมูล: ใบใหม่ ${ccode} เริ่มที่เช็คอะไหล่ · ใบเดิมไปจ่ายงาน`) : fail(`ใบใหม่: ${child} · ใบเดิม ${fx.sql(`select status from "WorkOrder" where id=${wo.id}`)}`);

    // ── แถบขั้นตอนของใบใหม่
    await open(ccode);
    const skip = page.locator('[aria-label^="ข้าม "]').locator("visible=true").first();
    if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }
    (await vis(`ทำในใบเดิม ${wo.code}`, false).count()) > 0
      ? pass(`แถบขั้นตอนใบใหม่: ขั้นก่อนหน้าขึ้นว่า "ทำในใบเดิม ${wo.code}"`) : fail("ไม่ขึ้นว่าทำในใบเดิม");
    (await page.locator('[aria-label="ขั้นตอนงาน"]').getByText("ระบุอะไหล่แล้ว", { exact: true }).locator("visible=true").count()) === 0
      ? pass("ไม่ขึ้น ✓ ระบุอะไหล่แล้ว ทั้งที่ใบใหม่ไม่ได้ผ่านขั้นนั้น") : fail("ยังขึ้นว่าผ่านขั้นระบุอะไหล่");
    await page.screenshot({ path: path.join(DIR, "split-quote-child.png") });
  } catch (e) {
    fail(String(e).split("\n").slice(0, 3).join(" ").slice(0, 300));
    if (page) await page.screenshot({ path: path.join(DIR, "split-quote-error.png") }).catch(() => {});
  } finally {
    if (fx) {
      for (const id of extra) await fx.call(fx.A, "DELETE", `/work-orders/${id}`);
      await fx.cleanup();
    }
    errors.length ? fail(`page error: ${errors[0].slice(0, 200)}`) : pass("ไม่มี error ในหน้าเว็บ");
    await browser.close();
  }
})();
