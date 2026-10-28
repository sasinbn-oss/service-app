// ทดสอบหน้าจอ: เบิกรอบสอง — ของที่เบิกไปแล้วแยกออกมา ไม่ต้องตอบซ้ำ และเลขใบเบิกไม่ถูกเติมค่าเก่า
//   (นัดลูกค้าก่อนเบิก ต.ค. 69 — ของหมดค้างที่ขั้นเช็คอะไหล่ ขั้นเบิกจึงเจอแค่ใบที่ช่างขอของเพิ่ม)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");
// ส่งเลขใบงานมาเองได้ ไม่ส่งก็สร้างใบที่ตรงเงื่อนไขให้: บอร์ดเบิกไปแล้ว (RQ-2569-0042) ช่างขอสายพานเพิ่ม
// เช็คแล้วว่ามี ลูกค้าคอนเฟิร์มวันใหม่แล้ว → ถึงขั้นเบิกรอบสอง
let WO = process.argv[2] || null;

(async () => {
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  // PLAYWRIGHT_CHROMIUM ตั้งเองได้ถ้าเครื่องเก็บไว้ที่อื่น
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 1500 } });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const seen = (t, exact = false) => page.getByText(t, { exact }).locator("visible=true").count();
  const tap = async (t, exact = true) => {
    const el = page.getByText(t, { exact }).locator("visible=true").first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(async () => {
      await el.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
  };

  let fx = null;
  try {
    if (!WO) {
      fx = await setup();
      const board = fx.part("SP-BOARD"), belt = fx.part("SP-BELT");
      const wo = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
      await fx.source(wo.id);
      await fx.schedule(wo.id);
      await fx.call(fx.A, "POST", `/work-orders/${wo.id}/parts-check`, {
        results: [{ sparePartId: board, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: "RQ-2569-0042" }],
      });
      await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/dispatch`, {});
      // ช่างแจ้งว่าต้องใช้สายพานด้วย → หัวหน้าภาคระบุเพิ่ม → เช็ค → นัดใหม่ → คอนเฟิร์ม
      await fx.call(fx.A, "POST", `/work-orders/${wo.id}/reassess-parts`, {
        reasonCode: "PARTS", reason: "ต้องเปลี่ยนสายพานด้วย", parts: [{ sparePartId: belt, quantity: 2 }],
      });
      await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, {
        needsParts: true, parts: [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }],
      });
      await fx.source(wo.id);
      await fx.schedule(wo.id, "2026-12-03");
      const st = fx.sql(`select status from "WorkOrder" where id=${wo.id}`);
      if (st !== "PARTS_REQUESTED") throw new Error(`เตรียมใบไม่ถึงขั้นเบิก: ${st}`);
      WO = wo.code;
      console.log(`เตรียมใบงาน ${WO}`);
    }
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await tap("ใบงาน");
    await page.waitForTimeout(2500);

    // ค้นเลขใบก่อน — รายการยาวแล้วใบที่ต้องการอาจยังไม่ถูกวาด
    const search = page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
    if (await search.count()) { await search.fill(WO); await page.waitForTimeout(2500); }
    const row = page.getByText(WO, { exact: false }).locator("visible=true");
    if ((await row.count()) === 0) { fail(`ไม่เจอ ${WO} ในรายการ`); throw new Error("no row"); }
    await row.first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(DIR, "bo-1-detail.png"), fullPage: true });

    (await seen("แอดมิน · เบิกอะไหล่ (คลัง 94)", false)) > 0
      ? pass("ลูกค้าคอนเฟิร์มแล้ว ใบงานอยู่ขั้นแอดมินเบิก")
      : fail("ไม่ได้อยู่ขั้นแอดมินเบิก");

    // ปุ่มขั้นอยู่ท้ายการ์ด "ขั้นปัจจุบัน" — ชื่อเดียวกับหัวการ์ดและป้ายสถานะ จึงเอาตัวสุดท้าย
    await page.getByText("เบิกอะไหล่ (คลัง 94)", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, "bo-2-modal.png"), fullPage: true });

    (await seen("เบิกไปแล้วรอบก่อน", true)) > 0
      ? pass("มีกล่องแยกของที่เบิกไปแล้ว")
      : fail("ไม่มีกล่องของที่เบิกไปแล้ว");
    (await seen("RQ-2569-0042", false)) > 0
      ? pass("โชว์เลขใบเบิกของรอบก่อนไว้ให้เห็น")
      : fail("ไม่โชว์เลขใบเบิกรอบก่อน");

    // ช่องเลขใบเบิกต้องว่าง ไม่ใช่เติมเลขของรอบก่อนไว้
    const box = page.getByLabel("เลขใบเบิกอะไหล่").locator("visible=true").first();
    const val = await box.inputValue();
    val === ""
      ? pass("ช่องเลขใบเบิกว่าง ไม่ได้เอาเลขรอบก่อนมาเติม")
      : fail(`ช่องเลขใบเบิกถูกเติมไว้ว่า "${val}" ซึ่งเป็นของรอบก่อน`);

    // ตัวที่เบิกไปแล้วต้องไม่มีปุ่มให้ตอบซ้ำ — นับปุ่ม "มีของ" ควรเหลือตัวเดียว
    const inStockButtons = await page.getByText("มีของ", { exact: true }).locator("visible=true").count();
    inStockButtons === 1
      ? pass("เหลือให้ตอบแค่ตัวที่ยังไม่ได้เบิก (1 ตัว)")
      : fail(`ยังให้ตอบ ${inStockButtons} ตัว ควรเหลือ 1`);

    // ผลเช็คอะไหล่ (มีของ · คลัง 94) เติมไว้ให้แล้ว — เหลือใส่ใบเบิกใบใหม่ แล้วบันทึก
    await box.fill("RQ-WEB-2");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "bo-3-filled.png"), fullPage: true });
    // ปุ่มส่งของโมดัลชื่อ "ยืนยัน" ส่วน "บันทึกเพิ่มเติม" เป็นหัวข้อช่องหมายเหตุ
    await tap("ยืนยัน");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(DIR, "bo-4-after.png"), fullPage: true });

    // รุ่นเก่าบันทึกแล้วเด้งกลับหน้ารายการ รุ่นนี้ค้างที่ใบงานเดิม — เปิดซ้ำเฉพาะเมื่อหน้าต่างปิดไปแล้ว
    // (ถ้ายังเปิดอยู่ เลขใบในรายการข้างหลังถูกหน้าต่างบัง กดไม่ได้)
    const stillOpen = (await page.getByLabel("ขั้นตอนงาน", { exact: true }).locator("visible=true").count()) > 0;
    const again = page.getByText(WO, { exact: false }).locator("visible=true");
    if (!stillOpen && (await again.count()) > 0) {
      await again.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, "bo-4-after.png"), fullPage: true });
    }

    // ป้ายสถานะหัวใบงาน "ใคร · ทำอะไร" — แถบขั้นตอนมีชื่อทุกขั้นอยู่แล้ว ดูชื่อขั้นอย่างเดียวไม่พอ
    (await seen("หัวหน้าภาค · รับทราบ ปล่อยงาน", true)) > 0
      ? pass("เบิกครบแล้ว ลูกค้าคอนเฟิร์มแล้ว → หัวหน้าภาคปล่อยงาน")
      : fail("ไม่เดินต่อไปปล่อยงานหลังเบิกครบ");
    (await seen("RQ-2569-0042", false)) > 0 && (await seen("RQ-WEB-2", false)) > 0
      ? pass("เห็นใบเบิกทั้งสองใบในใบงาน")
      : fail("ใบเบิกใบใดใบหนึ่งหายไป");

    if (fx) {
      // ยืนยันที่ฐานข้อมูลด้วย ไม่ใช่เชื่อป้ายบนจออย่างเดียว
      const db = fx.sql(`select w.status||'|'||(select string_agg(p."requisitionNo",',' order by p."requisitionNo") from "WorkOrderPart" p where p."workOrderId"=w.id) from "WorkOrder" w where w.code='${WO}'`);
      db === "ASSIGNED|RQ-2569-0042,RQ-WEB-2"
        ? pass("DB: ไปขั้นปล่อยงาน ใบเบิกสองใบครบ ไม่ถูกทับ")
        : fail(`DB: ${db}`);
    }
    errors.length === 0 ? pass("ไม่มี error ในหน้า") : fail(`error: ${errors.slice(0, 2).join(" | ")}`);
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "bo-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${e.message}`);
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
