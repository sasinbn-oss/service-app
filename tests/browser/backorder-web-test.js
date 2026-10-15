// ทดสอบหน้าจอ: ของที่เบิกไปแล้วแยกออกมา ไม่ต้องตอบซ้ำ และเลขใบเบิกไม่ถูกเติมค่าเก่า
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");
// ส่งเลขใบงานมาเองได้ ไม่ส่งก็สร้างใบที่ตรงเงื่อนไขให้: บอร์ดเบิกไปแล้ว (RQ-2569-0042) สายพานหมด
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
      const wo = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }]);
      await fx.call(fx.A, "POST", `/work-orders/${wo.id}/parts-check`, {
        results: [
          { sparePartId: board, inStock: true, warehouse: "คลังกระบี่", requisitionNo: "RQ-2569-0042" },
          { sparePartId: belt, inStock: false },
        ],
      });
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

    (await seen("รออะไหล่", false)) > 0
      ? pass("ใบงานขึ้นสถานะรออะไหล่")
      : fail("ไม่ขึ้นสถานะรออะไหล่");
    (await seen("รอแอดมินเบิกอะไหล่", false)) > 0
      ? pass("ใบงานยังค้างอยู่ขั้นแอดมิน ไม่เลยไปจ่ายงาน")
      : fail("ไม่ได้ค้างที่ขั้นแอดมิน");

    // เปิดฟอร์มเบิกอะไหล่ — ของหมดอยู่ ปุ่มขั้นนี้เป็น "อะไหล่มาแล้ว — อัปเดตสถานะ"
    await tap("อะไหล่มาแล้ว — อัปเดตสถานะ", false);
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

    // ของมาแล้ว — ตอบมีของ เลือกคลัง ใส่ใบเบิกใบใหม่ แล้วบันทึก
    await tap("มีของ");
    await page.waitForTimeout(600);
    await tap("เลือกคลังที่มีของ", false);
    await page.waitForTimeout(800);
    // ค้นในช่องของ dropdown ก่อน ไม่งั้นคำว่า "คลังกระบี่" ไปโดนข้อความ
    // ในกล่อง "เบิกไปแล้วรอบก่อน" ซึ่งอยู่เหนือกว่าใน DOM
    const find = page.getByPlaceholder("ค้นหา").locator("visible=true").first();
    await find.fill("กระบี่");
    await page.waitForTimeout(900);
    const opt = page.getByText("คลังกระบี่", { exact: true }).locator("visible=true").last();
    await opt.click().catch(async () => {
      await opt.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
    await page.waitForTimeout(700);
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

    // อ่านจากป้ายสถานะบนหัวใบงาน ไม่ใช่ทั้งหน้า — แถบขั้นตอนมีชื่อทุกขั้นอยู่แล้ว
    // ถ้าดูทั้งหน้าจะเจอ "รอหัวหน้าภาคจ่ายงาน" ตลอดไม่ว่าสถานะจริงจะเป็นอะไร
    // หาใบที่เจาะจง ไม่ใช่ใบแรกที่เจอ — หน้ารายการยังค้างอยู่ใน DOM ข้างหลัง
    // หน้ารายละเอียด ถ้าเอาใบแรกจะได้ใบอื่นที่ไม่เกี่ยวกับที่กำลังทดสอบ
    const badge = await page.evaluate((code) => {
      const hits = [...document.querySelectorAll("*")].filter(
        (n) => !n.children.length && (n.textContent || "").trim() === code
      );
      return hits.map((n) => n.parentElement?.textContent?.trim() || "").pop() || "";
    }, WO);
    console.log("  ป้ายสถานะ:", badge);
    /จ่ายงาน/.test(badge)
      ? pass("ของครบแล้วเดินต่อไปขั้นจ่ายงาน")
      : fail(`ไม่เดินต่อหลังของมาครบ — ป้ายยังเป็น "${badge}"`);
    (await seen("RQ-2569-0042", false)) > 0 && (await seen("RQ-WEB-2", false)) > 0
      ? pass("เห็นใบเบิกทั้งสองใบในใบงาน")
      : fail("ใบเบิกใบใดใบหนึ่งหายไป");

    if (fx) {
      // ยืนยันที่ฐานข้อมูลด้วย ไม่ใช่เชื่อป้ายบนจออย่างเดียว
      const db = fx.sql(`select w.status||'|'||(select string_agg(p."requisitionNo",',' order by p."requisitionNo") from "WorkOrderPart" p where p."workOrderId"=w.id) from "WorkOrder" w where w.code='${WO}'`);
      db === "PARTS_CHECKED|RQ-2569-0042,RQ-WEB-2"
        ? pass("DB: ไปขั้นจ่ายงาน ใบเบิกสองใบครบ ไม่ถูกทับ")
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
