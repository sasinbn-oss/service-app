// ทดสอบ: เตือนใบงานซ้ำในฟอร์มเปิดใบงาน (เจ้าของงานเลือกแบบเตือน ไม่บล็อก ต.ค. 69)
//   · เลือกสาขาที่มีใบค้าง → กล่องเหลืองบอกจำนวนตรงกับฐานข้อมูล · โชว์ 3 ใบ + "ดูทั้งหมด (N)" กดแล้วครบ
//   · ใส่เครื่องที่มีใบค้าง → บรรทัดแดงบอกเลขใบงาน · กดการ์ดแล้วไปหน้าใบงานนั้น กลับมาฟอร์มยังอยู่
//   · กดเปิดใบงาน → ป๊อปอัพยืนยัน (ต.ค. 69): เครื่องเดียวกันขึ้นแดง ยังไม่บันทึก · ไม่ติ๊กกดยืนยันไม่ได้ · กลับไปแก้ฟอร์มอยู่
//     ติ๊กแล้วยืนยัน = เปิดได้ · ดับเบิลคลิกปุ่มเปิดใบงาน = ได้ใบเดียว (ฐานข้อมูล)
const { chromium } = require("playwright");
const { attachPhoto } = require("./photo");
const { confirmDuplicate } = require("./dup");
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
  let maxBefore = 0;
  try {
    fx = await setup();
    const wo = await fx.workOrder("C0006", null); // เครื่อง W77 — ใบใหม่สุดของสาขา
    fx.sql(`update "WorkOrder" set symptom='อาการเดิมทดสอบเปิดซ้ำ' where id=${wo.id}`);
    const branchName = fx.sql(`select name from "Branch" where code='C0006'`);
    const openCount = Number(fx.sql(`select count(*) from "WorkOrder" w join "Branch" b on b.id=w."branchId"
      where b.code='C0006' and not w."isTest" and w.status not in ('DONE','CANCELLED')`));
    maxBefore = Number(fx.sql(`select max(id) from "WorkOrder"`));

    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("เพิ่มใบงาน").first().click();
    await page.waitForTimeout(2500);
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0006", { delay: 70 });
    await page.waitForTimeout(2400);
    await vis(branchName, false).last().click();
    await page.waitForTimeout(2500);

    const title = `สาขานี้มีใบงานเปิดค้างอยู่ ${openCount} ใบ — ดูก่อนว่าไม่ใช่เรื่องเดียวกัน`;
    (await vis(title).count()) > 0 ? pass(`เลือกสาขาแล้วขึ้นกล่องเตือน จำนวน ${openCount} ใบตรงกับฐานข้อมูล`) : fail(`ไม่เห็น "${title}"`);
    const cards = async () => page.getByText("เปิดดู ›", { exact: true }).locator("visible=true").count();
    (await cards()) === 3 && (await vis(`ดูทั้งหมด (${openCount})`).count()) > 0 && (await vis(wo.code).count()) > 0
      ? pass("โชว์ 3 ใบล่าสุด (มีใบที่เพิ่งเปิด) + ปุ่มดูทั้งหมด") : fail(`การ์ด ${await cards()} ใบ`);
    await vis(`ดูทั้งหมด (${openCount})`).click();
    await page.waitForTimeout(800);
    (await cards()) === openCount ? pass("กดดูทั้งหมดแล้วครบทุกใบ") : fail(`ดูทั้งหมดได้ ${await cards()} ใบ`);
    await vis("ย่อ").click();
    await page.waitForTimeout(600);

    await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first().fill("W77");
    await page.waitForTimeout(2500);
    const red = `เครื่อง W77 มีใบงานค้าง ${wo.code} (หัวหน้าภาค · ระบุอะไหล่)`;
    (await vis(red).count()) > 0 ? pass("ใส่เครื่องที่มีใบค้าง → บรรทัดแดงบอกเลขใบงาน") : fail(`ไม่เห็น "${red}"`);
    await page.screenshot({ path: path.join(DIR, "open-orders.png") });

    await vis("อาการเดิมทดสอบเปิดซ้ำ").first().click();
    await page.waitForTimeout(3000);
    const t = await page.evaluate(() => document.body.innerText);
    t.includes(wo.code) && (await page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").count()) === 0
      ? pass("กดการ์ดแล้วไปหน้าใบงานเดิม") : fail("กดการ์ดแล้วไม่ไปหน้าใบงาน");
    // หน้าใบงานเปิดซ้อนบนฟอร์ม ปิดด้วย ✕ ของหน้าต่างบนสุด
    await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    (await vis(red).count()) > 0 ? pass("กลับมาฟอร์มยังอยู่ (สาขา เครื่อง ไม่หาย)") : fail("กลับมาแล้วฟอร์มหาย");

    await page.getByPlaceholder("เช่น ประตูไม่ล็อก / บอร์ดควบคุมไหม้").locator("visible=true").first().fill("อาการใหม่ทดสอบกดซ้ำ");
    await attachPhoto(page);
    const btn = vis("เปิดใบงาน").last();
    const made = () => fx.sql(`select coalesce(string_agg(id::text, ','), '') from "WorkOrder" where id>${maxBefore} and symptom like 'อาการใหม่ทดสอบกดซ้ำ%'`);
    await btn.dblclick();
    await page.waitForTimeout(3000);
    (await vis("เครื่อง W77 มีใบงานค้างอยู่แล้ว").count()) && (await vis(`เครื่องเดียวกัน · W77`).count()) && made() === ""
      ? pass("กดเปิดใบงาน → ป๊อปอัพ: เครื่องเดียวกัน (W77) ขึ้นแดง · ยังไม่บันทึกจนกว่าจะยืนยัน (ฐานข้อมูล)")
      : fail(`ป๊อปอัพไม่ขึ้น/บันทึกไปแล้ว: ${made()}`);
    // สาขามีใบค้างเยอะ: ใบเครื่องเดียวกันครบ + ใบอื่น 3 ใบ + "ดูใบอื่นอีก N ใบ" (ช่องติ๊กไม่ไปจมอยู่ล่างสุด)
    {
      const sameN = await vis("เครื่องเดียวกัน · W77").count();
      const views = () => page.getByText("เปิดดูใบเดิม", { exact: true }).locator("visible=true").count();
      const rest = openCount - sameN;
      const moreLabel = `ดูใบอื่นอีก ${rest - 3} ใบ`;
      rest > 3 && (await views()) === sameN + 3 && (await vis(moreLabel).count())
        ? pass(`ป๊อปอัพโชว์ใบเครื่องเดียวกัน ${sameN} ใบ + ใบอื่น 3 ใบ · "${moreLabel}"`)
        : fail(`ป๊อปอัพ: ปุ่มเปิดดู ${await views()} · เครื่องเดียวกัน ${sameN} · ใบอื่น ${rest}`);
      if (rest > 3) {
        await vis(moreLabel).click();
        await page.waitForTimeout(600);
        (await views()) === openCount ? pass("กดดูใบอื่นแล้วครบทุกใบ") : fail(`ดูใบอื่นแล้วได้ ${await views()} ใบ`);
      }
    }
    // ดับเบิลคลิกคลิกที่สองตกลงบนป๊อปอัพแล้วลากคลุมข้อความ — ล้างก่อนถ่ายภาพไว้ดู
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.screenshot({ path: path.join(DIR, "open-orders-popup.png") });
    await page.getByLabel("ยืนยัน เปิดใบใหม่", { exact: true }).locator("visible=true").first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    made() === "" ? pass("ยังไม่ติ๊กยืนยัน กดปุ่มเปิดไม่ได้ (ฐานข้อมูลไม่มีใบใหม่)") : fail("เปิดได้ทั้งที่ยังไม่ติ๊ก");
    await page.getByLabel("กลับไปแก้", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(1500);
    (await page.getByLabel("ยืนยัน เปิดใบใหม่", { exact: true }).locator("visible=true").count()) === 0 && (await vis(red).count()) > 0
      ? pass("กลับไปแก้: ป๊อปอัพปิด ฟอร์มยังอยู่ครบ")
      : fail("กลับไปแก้แล้วป๊อปอัพไม่ปิด/ฟอร์มหาย");
    await btn.dblclick();
    (await confirmDuplicate(page)) ? null : fail("กดเปิดอีกรอบแล้วป๊อปอัพไม่ขึ้น");
    await page.waitForTimeout(6000);
    made() && !made().includes(",")
      ? pass("ติ๊กแล้วยืนยัน = เปิดใบใหม่ได้ · ดับเบิลคลิกได้ใบเดียว (ฐานข้อมูล)")
      : fail(`ใบที่ได้: ${made() || "ไม่มี"}`);
    await ctx.close();
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (fx) {
      const extra = fx.sql(`select coalesce(string_agg(id::text, ' '), '') from "WorkOrder" where id>${maxBefore} and symptom like 'อาการใหม่ทดสอบกดซ้ำ%'`);
      for (const id of extra.split(" ").filter(Boolean)) await fx.call(fx.A, "DELETE", `/work-orders/${id}`);
      await fx.cleanup();
    }
    await browser.close();
  }
})();
