// ทดสอบ: รายงานอะไหล่เบิกแล้ว · งานยังไม่จบ (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
//   · การ์ดในเมนูรายงาน · ช่างไม่เห็นการ์ด
//   · ตัวเลข "ใบงาน" ตรงกับฐานข้อมูล · จอคอมเป็นตารางจัดกลุ่มตามขั้น เห็นเลขใบเบิก · เลยวันนัดขึ้นป้าย
//   · ปุ่มกรองเลยวันนัด · ค้นเลขใบเบิก · แท็บตามอะไหล่ · กดเลขใบงานไปหน้าใบงาน · จอมือถือเป็นการ์ดไม่ล้นจอ
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");

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
    const board = fx.part("SP-BOARD");
    const L94 = "คลังลาดพร้าว 94";
    // a: เบิกแล้ว รอปล่อยงาน · b: ช่างเข้างาน เลยวันนัด 2 วัน · c: เช็คแล้ว ยังไม่เบิก (ไม่ขึ้น)
    const a = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
    await fx.source(a.id);
    await fx.schedule(a.id, visitDay(30));
    await fx.call(fx.A, "POST", `/work-orders/${a.id}/parts-check`, { results: [{ sparePartId: board, inStock: true, warehouse: L94, requisitionNo: "RQ-WEB-IR1" }] });
    const b = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 2 }]);
    await fx.source(b.id);
    await fx.schedule(b.id, visitDay(31));
    await fx.call(fx.A, "POST", `/work-orders/${b.id}/parts-check`, { results: [{ sparePartId: board, inStock: true, warehouse: L94, requisitionNo: "RQ-WEB-IR2" }] });
    await fx.call(fx.supervisor(), "POST", `/work-orders/${b.id}/dispatch`, {});
    fx.sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date - 2 where id=${b.id}`);
    const c = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
    await fx.source(c.id);
    const st = fx.sql(`select string_agg(status,',' order by id) from "WorkOrder" where id in (${a.id},${b.id},${c.id})`);
    st === "ASSIGNED,IN_PROGRESS,PARTS_CHECKED" ? pass("เตรียมใบ: รอปล่อยงาน · ช่างเข้างาน · ยังไม่เบิก (ฐานข้อมูล)") : fail(`เตรียมใบ: ${st}`);
    const dbOrders = fx.sql(`select count(distinct w.id) from "WorkOrder" w join "WorkOrderPart" p on p."workOrderId"=w.id join "SparePart" s on s.id=p."sparePartId"
      where p.kind='WAITING' and not s."offCatalog" and w.status not in ('DONE','CANCELLED') and not w."isTest"
      and ((p."inStock" and p."requisitionNo" is not null) or p."transferReqNo" is not null)`);

    const open = async (code, width) => {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      if (width < 760) {
        await page.getByLabel("เปิดเมนู").locator("visible=true").first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      await vis("รายงาน").first().click().catch(() => {});
      await page.waitForTimeout(2000);
      return { ctx, page, vis };
    };
    const label = (page, l) => page.locator(`[aria-label^="${l}"]`).locator("visible=true").first();

    {
      const { ctx, vis } = await open("T001", 1400);
      (await vis("อะไหล่เบิกแล้ว · งานยังไม่จบ").count()) === 0 ? pass("ช่างไม่เห็นการ์ดรายงาน") : fail("ช่างเห็นการ์ด");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("A001", 1400);
      await page.screenshot({ path: path.join(DIR, "issued-1-menu.png") });
      await vis("อะไหล่เบิกแล้ว · งานยังไม่จบ").first().click();
      await page.waitForTimeout(3000);
      (await label(page, "ใบงาน ").getAttribute("aria-label")) === `ใบงาน ${dbOrders}`
        ? pass(`ตัวเลข "ใบงาน" ตรงกับฐานข้อมูล (${dbOrders})`) : fail(`ใบงาน: ${await label(page, "ใบงาน ").getAttribute("aria-label")} · ฐานข้อมูล ${dbOrders}`);
      const search = page.getByLabel("ค้นหาในรายงานอะไหล่เบิกแล้ว").locator("visible=true").first();
      await search.fill("RQ-WEB-IR");
      await page.waitForTimeout(800);
      (await label(page, `แถวใบงาน ${a.code}`).count()) && (await label(page, `แถวใบงาน ${b.code}`).count()) && !(await label(page, `แถวใบงาน ${c.code}`).count())
        ? pass("ค้นเลขใบเบิก: เจอสองใบที่เบิก ไม่มีใบที่ยังไม่เบิก") : fail("ค้นเลขใบเบิกไม่ตรง");
      (await vis("ใบเบิก RQ-WEB-IR1", false).count()) > 0 && (await vis("หัวหน้าภาค · รับทราบ ปล่อยงาน").count()) > 0
        ? pass("ตาราง: บอกคลัง + เลขใบเบิก และจัดกลุ่มตามขั้น") : fail("ตารางไม่บอกใบเบิก/กลุ่มขั้น");
      (await vis("เลยนัด 2 วัน · ยังไม่ปิดงาน").count()) > 0 ? pass("ใบที่ช่างเข้างานแล้ววันนัดผ่านไป 2 วัน ขึ้นป้ายเลยนัด") : fail("ไม่ขึ้นป้ายเลยนัด");
      await page.screenshot({ path: path.join(DIR, "issued-2-table.png") });
      await label(page, "กรองเลยวันนัด").click();
      await page.waitForTimeout(600);
      (await label(page, `แถวใบงาน ${b.code}`).count()) && !(await label(page, `แถวใบงาน ${a.code}`).count())
        ? pass("กรองเลยวันนัด: เหลือใบที่เลยนัด") : fail("กรองเลยวันนัดไม่ถูก");
      await label(page, "กรองทั้งหมด").click();
      await page.waitForTimeout(400);
      await label(page, "แท็บตามอะไหล่").click();
      await page.waitForTimeout(800);
      const card = label(page, "การ์ดอะไหล่ ");
      const text = (await card.count()) ? await card.innerText() : "";
      text.includes("SP-BOARD") && text.includes("3") && text.includes(a.code) && text.includes(b.code)
        ? pass("แท็บตามอะไหล่: บอร์ดออกจากคลัง 3 ชิ้น อยู่ในสองใบ") : fail(`การ์ดอะไหล่: ${text.slice(0, 200)}`);
      await page.screenshot({ path: path.join(DIR, "issued-3-bypart.png") });
      await label(page, "แท็บตามใบงาน").click();
      await page.waitForTimeout(500);
      await label(page, `เปิดใบงาน ${a.code}`).click();
      await page.waitForTimeout(3000);
      (await vis(a.code, false).count()) > 0 && (await vis("รับทราบ ปล่อยงาน", false).count()) > 0
        ? pass("กดเลขใบงานแล้วเปิดหน้าใบงาน") : fail("กดเลขใบงานแล้วไม่ไปหน้าใบงาน");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("S001", 420);
      await vis("อะไหล่เบิกแล้ว · งานยังไม่จบ").first().click();
      await page.waitForTimeout(3000);
      await page.getByLabel("ค้นหาในรายงานอะไหล่เบิกแล้ว").locator("visible=true").first().fill("RQ-WEB-IR");
      await page.waitForTimeout(800);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      over <= 1 && (await label(page, `การ์ดใบงาน ${a.code}`).count()) > 0
        ? pass("จอมือถือ (หัวหน้าภาค): เป็นการ์ดทีละใบ ไม่ล้นจอ") : fail(`จอมือถือ: ล้น ${over}px`);
      await page.screenshot({ path: path.join(DIR, "issued-4-phone.png"), fullPage: true });
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
