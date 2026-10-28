// ทดสอบ: รายงานอะไหล่หมด — การ์ดแบบหน้ารายการอะไหล่ (เจ้าของงานเลือก ต.ค. 69)
//   · การ์ดในเมนูรายงาน · ช่างไม่เห็น
//   · แท็บแรก "ตามอะไหล่": การ์ดอะไหล่ (ชื่อ รหัส ป้ายหมด ต้องใช้กี่ชิ้น) + สาขาที่รอ เลขใบงาน วันของเข้าเลย/ยังไม่ใส่
//   · ตัวเลขด้านบนตรงกับฐานข้อมูล · กรองเลยวันของเข้า · แท็บตามสาขา · กดเลขใบงานไปหน้าใบงาน · จอมือถือไม่ล้น
//   · หมายเหตุทีละแถวสาขา+อะไหล่: เพิ่ม → ลงฐานข้อมูล · ขึ้นทั้งสองแท็บ · แก้แล้วล้างได้ · ไม่ขึ้นในหน้าใบงาน
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
    const BOARD = fx.part("SP-BOARD"), BELT = fx.part("SP-BELT");
    const beltName = fx.sql(`select name from "SparePart" where id=${BELT}`);
    const boardName = fx.sql(`select name from "SparePart" where id=${BOARD}`);
    const parts = [{ sparePartId: BOARD, quantity: 1 }, { sparePartId: BELT, quantity: 2 }];
    const a = await fx.workOrder("C0006", parts);
    const b = await fx.workOrder("C0006", parts);
    // ของหมดรู้ตั้งแต่ขั้นเช็คอะไหล่ (นัดลูกค้าก่อนเบิก ต.ค. 69)
    const ok = (id) => ({ sparePartId: id, inStock: true, warehouse: "คลังลาดพร้าว 94" });
    await fx.call(fx.A, "POST", `/work-orders/${a.id}/parts-sourcing`, { expectedAt: "2026-01-05", results: [ok(BOARD), { sparePartId: BELT, inStock: false }] });
    await fx.call(fx.A, "POST", `/work-orders/${b.id}/parts-sourcing`, { results: [{ sparePartId: BOARD, inStock: false }, ok(BELT)] });
    const outRows = Number(fx.sql(`select count(*) from "WorkOrderPart" p join "WorkOrder" w on w.id=p."workOrderId"
      where p.kind='WAITING' and p."inStock"=false and not w."isTest" and w.status in ('PARTS_SOURCING','PARTS_REQUESTED','WAITING_PARTS')`));
    const outOrders = Number(fx.sql(`select count(distinct w.id) from "WorkOrderPart" p join "WorkOrder" w on w.id=p."workOrderId"
      where p.kind='WAITING' and p."inStock"=false and not w."isTest" and w.status in ('PARTS_SOURCING','PARTS_REQUESTED','WAITING_PARTS')`));
    outRows >= 2 ? pass(`เตรียมข้อมูล: ฐานข้อมูลมีอะไหล่หมด ${outRows} แถว ${outOrders} ใบ`) : fail("ฐานข้อมูลไม่มีตัวที่หมด");

    const open = async (code, width) => {
      const ctx = await browser.newContext({ viewport: { width, height: 950 } });
      const page = await ctx.newPage();
      // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เทสต์นี้กดรายการในกลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      // จอแคบเมนูซ่อนอยู่หลังปุ่ม ☰ — เปิดก่อนแล้วค่อยกด "รายงาน"
      if (width < 760) {
        await page.getByLabel("เปิดเมนู").locator("visible=true").first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      await vis("รายงาน").first().click().catch(() => {});
      await page.waitForTimeout(2000);
      return { ctx, page, vis };
    };

    {
      const { ctx, vis } = await open("T001", 1400);
      (await vis("สาขาที่ติดอะไหล่หมด").count()) === 0 ? pass("ช่างไม่เห็นการ์ดรายงานอะไหล่หมด") : fail("ช่างเห็นการ์ด");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("A001", 1400);
      await vis("สาขาที่ติดอะไหล่หมด").first().click();
      await page.waitForTimeout(3000);
      const tile = async (label) => page.locator(`[aria-label^="${label} "]`).locator("visible=true").first().getAttribute("aria-label");
      (await tile("ใบงาน")) === `ใบงาน ${outOrders}` ? pass(`ตัวเลข "ใบงาน" ตรงกับฐานข้อมูล (${outOrders})`) : fail(`ใบงาน: ${await tile("ใบงาน")}`);

      const belt = page.locator(`[aria-label="การ์ดอะไหล่ ${beltName}"]`).locator("visible=true");
      const beltText = (await belt.count()) ? await belt.first().innerText() : "";
      beltText.includes("● หมด") && beltText.includes("รหัส: SP-BELT") && beltText.includes(a.code) && beltText.includes("C0006") &&
      beltText.includes("ของเข้าเลยมา") && !beltText.includes(b.code)
        ? pass("การ์ดสายพาน: ชื่อ รหัส ป้ายหมด · สาขาที่รอ + เลขใบงาน · ของเข้าเลยมา (ใบที่มีของไม่อยู่ในการ์ดนี้)")
        : fail(`การ์ดสายพาน: ${beltText.replace(/\n/g, " | ").slice(0, 300)}`);
      const board = page.locator(`[aria-label="การ์ดอะไหล่ ${boardName}"]`).locator("visible=true");
      const boardText = (await board.count()) ? await board.first().innerText() : "";
      boardText.includes(b.code) && boardText.includes("ยังไม่ใส่วันของเข้า") ? pass("การ์ดแผงวงจร: ใบที่ไม่ใส่วันบอกว่า \"ยังไม่ใส่วันของเข้า\"") : fail(`การ์ดแผงวงจร: ${boardText.slice(0, 200)}`);
      await page.screenshot({ path: path.join(DIR, "parts-out-cards.png") });

      // ── หมายเหตุ — ผูกกับแถวสาขา+อะไหล่ (สายพานของใบ a)
      const beltRow = Number(fx.sql(`select id from "WorkOrderPart" where "workOrderId"=${a.id} and "sparePartId"=${BELT} and kind='WAITING'`));
      const nl = (verb) => page.locator(`[aria-label="${verb} ${a.code} C0006 SP-BELT"]`).locator("visible=true").first();
      await nl("เพิ่มหมายเหตุ").click();
      await page.waitForTimeout(400);
      await nl("ช่องหมายเหตุ").fill("สั่งผู้ขายแล้ว รอ 2 สัปดาห์");
      await nl("บันทึกหมายเหตุ").click();
      await page.waitForTimeout(1500);
      fx.sql(`select coalesce("outNote",'') from "WorkOrderPart" where id=${beltRow}`) === "สั่งผู้ขายแล้ว รอ 2 สัปดาห์"
        ? pass("เพิ่มหมายเหตุในการ์ดอะไหล่ → ลงฐานข้อมูลที่แถวสาขา+อะไหล่นั้น") : fail("หมายเหตุไม่ลงฐานข้อมูล");
      ((await belt.first().innerText()).includes("สั่งผู้ขายแล้ว รอ 2 สัปดาห์")) && (await nl("แก้หมายเหตุ").count()) === 1
        ? pass("หมายเหตุขึ้นใต้แถวสาขาในการ์ด พร้อมแตะเพื่อแก้") : fail("หมายเหตุไม่ขึ้นบนการ์ด");
      (await page.locator(`[aria-label="แก้หมายเหตุ ${a.code} C0006 SP-BOARD"]`).count()) === 0
        ? pass("หมายเหตุไม่ไปติดแถวอื่น (ตัวอื่นของสาขาเดียวกันไม่มี)") : fail("หมายเหตุไปโผล่แถวอื่น");
      await page.screenshot({ path: path.join(DIR, "parts-out-note.png") });
      await page.locator('[aria-label="แท็บตามสาขา"]').locator("visible=true").first().click();
      await page.waitForTimeout(800);
      (await page.locator('[aria-label="สาขา C0006"]').locator("visible=true").first().innerText()).includes("สั่งผู้ขายแล้ว รอ 2 สัปดาห์")
        ? pass("แท็บตามสาขาเห็นหมายเหตุเดียวกันใต้อะไหล่ตัวนั้น") : fail("แท็บตามสาขาไม่มีหมายเหตุ");
      await nl("แก้หมายเหตุ").click();
      await page.waitForTimeout(400);
      await nl("ช่องหมายเหตุ").fill("");
      await nl("บันทึกหมายเหตุ").click();
      await page.waitForTimeout(1500);
      fx.sql(`select coalesce("outNote",'NULL') from "WorkOrderPart" where id=${beltRow}`) === "NULL" && (await nl("เพิ่มหมายเหตุ").count()) === 1
        ? pass("ลบข้อความแล้วบันทึก = ล้างหมายเหตุ (ฐานข้อมูลว่าง ปุ่มกลับเป็น + หมายเหตุ)") : fail("ล้างหมายเหตุไม่ได้");
      await nl("เพิ่มหมายเหตุ").click();
      await nl("ช่องหมายเหตุ").fill("โน้ตทดสอบห้ามขึ้นในใบงาน");
      await nl("บันทึกหมายเหตุ").click();
      await page.waitForTimeout(1500);
      await page.locator('[aria-label="แท็บตามอะไหล่"]').locator("visible=true").first().click();
      await page.waitForTimeout(600);

      await page.locator('[aria-label="กรองเลยวันของเข้า"]').locator("visible=true").first().click();
      await page.waitForTimeout(800);
      (await vis(a.code).count()) > 0 && (await vis(b.code).count()) === 0 ? pass("กรองเลยวันของเข้า: เหลือใบที่เลย ใบที่ไม่ใส่วันหายไป") : fail("กรองเลยวันไม่ถูก");
      await page.locator('[aria-label="กรองทั้งหมด"]').locator("visible=true").first().click();
      await page.waitForTimeout(500);

      await page.locator('[aria-label="แท็บตามสาขา"]').locator("visible=true").first().click();
      await page.waitForTimeout(800);
      const br = page.locator('[aria-label="สาขา C0006"]').locator("visible=true");
      const brText = (await br.count()) ? await br.first().innerText() : "";
      brText.includes(a.code) && brText.includes(b.code) && brText.includes(beltName) && brText.includes(boardName)
        ? pass("แท็บตามสาขา: สาขา C0006 มีทั้งสองใบ พร้อมอะไหล่ที่หมดของแต่ละใบ") : fail(`ตามสาขา: ${brText.slice(0, 300)}`);
      await page.screenshot({ path: path.join(DIR, "parts-out-branch.png") });

      await page.locator(`[aria-label="เปิดใบงาน ${a.code}"]`).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
      (await page.evaluate(() => document.body.innerText)).includes("สาขาและเครื่อง") ? pass("กดเลขใบงานแล้วไปหน้าใบงาน") : fail("กดเลขใบงานไม่ไปหน้าใบงาน");
      // หน้ารายงานยังอยู่ข้างหลังใบงานที่เด้งทับ ดูจากจอแยกไม่ได้ — ดูที่ข้อมูลใบงานที่หน้าใบงานโหลดแทน
      const wo = JSON.stringify(await fx.call(fx.A, "GET", `/work-orders/${a.id}`));
      wo.includes(a.code) && !wo.includes("โน้ตทดสอบห้ามขึ้นในใบงาน")
        ? pass("หมายเหตุไม่อยู่ในข้อมูลหน้าใบงาน (เฉพาะหน้ารายงาน)") : fail("หมายเหตุหลุดไปอยู่ในข้อมูลใบงาน");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("A001", 390);
      await vis("สาขาที่ติดอะไหล่หมด").first().click();
      await page.waitForTimeout(3000);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      over <= 1 && (await vis("● หมด").count()) > 0 ? pass("จอมือถือ: การ์ดเรียงทีละใบ ไม่ล้นจอ") : fail(`จอมือถือล้น ${over}px`);
      await page.screenshot({ path: path.join(DIR, "parts-out-phone.png") });
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
