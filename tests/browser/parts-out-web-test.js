// ทดสอบ: อะไหล่หมด — ป้ายแดงบนแถบขั้นตอน/หัวใบงาน/รายการ · แอดมินเลื่อนวัน · ของมาแล้วอัปเดตสถานะ
//   · ทุกครั้งที่เปลี่ยนสถานะ เด้งแจ้งสถานะใหม่ (จากไหน → ไปไหน)
//   · ของหมดค้างที่ขั้นเช็คอะไหล่ (นัดลูกค้าก่อนเบิก ต.ค. 69) — ของมาแล้วตอบมีพร้อมคลัง ส่งหัวหน้าภาคนัด ไม่มีเลขใบเบิก
// ต้องมี DATABASE_URL
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
    const branch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and region is not null order by code limit 1`);
    // อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ (fxPart) ซึ่งรู้ได้เมื่อมีใบแล้ว — เปิดใบก่อนแล้วหัวหน้าภาคค่อยระบุ
    // (ทางเดียวกับที่ fx.workOrder ทำให้เมื่อส่งรายการอะไหล่มาด้วย)
    const wo = await fx.workOrder(branch, null);
    const board = fx.fxPart(wo.id, "BOARD"), belt = fx.fxPart(wo.id, "BELT");
    await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, {
      needsParts: true, parts: [{ sparePartId: board, quantity: 1 }, { sparePartId: belt, quantity: 2 }],
    });
    // ป้ายปุ่มในฟอร์มต่อท้ายด้วยรหัสอะไหล่ — ใช้รหัสตัวที่ส่งจริง ไม่ใช่รหัสตายตัว
    const beltCode = fx.sql(`select "partCode" from "SparePart" where id=${belt}`);
    const db = (f) => fx.sql(`select ${f} from "WorkOrder" where id=${wo.id}`);
    await fx.call(fx.A, "POST", `/work-orders/${wo.id}/parts-sourcing`, {
      expectedAt: "2026-11-20",
      results: [
        { sparePartId: board, inStock: true, warehouse: "คลังลาดพร้าว 94" },
        { sparePartId: belt, inStock: false },
      ],
    });

    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    (await vis("● อะไหล่หมด 1").count()) > 0 ? pass("รายการ: ป้ายแดง \"อะไหล่หมด\"") : fail("รายการไม่มีป้ายแดง");
    await page.screenshot({ path: path.join(DIR, "parts-out-list.png") });
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);

    (await label("อะไหล่หมดบนแถบขั้นตอน").count()) > 0 && (await vis("อะไหล่หมด 1 รายการ").count()) > 0
      ? pass("แถบขั้นตอน: ป้ายแดง \"อะไหล่หมด 1 รายการ\"") : fail("แถบขั้นตอนไม่มีป้ายแดง");
    (await label("ป้ายอะไหล่หมด").count()) > 0 ? pass("หัวใบงาน: ป้ายแดง") : fail("หัวใบงานไม่มีป้ายแดง");
    (await vis("คาดเข้า 20 พ.ย. 69", false).count()) > 0 ? pass("แถบขั้นตอนบอกวันคาดว่าเข้า") : fail("ไม่บอกวันคาดว่าเข้า");
    (await vis("อะไหล่มาแล้ว — อัปเดตสถานะ").count()) > 0 ? pass("ปุ่มแอดมิน: \"อะไหล่มาแล้ว — อัปเดตสถานะ\"") : fail("ปุ่มไม่เปลี่ยน");
    await page.screenshot({ path: path.join(DIR, "parts-out-detail.png") });

    // เลื่อนวัน
    await label("เลื่อนวันคาดว่าเข้า").click();
    await page.waitForTimeout(800);
    // ปฏิทินเปิดที่เดือนของวันเดิม (พ.ย. 69) — 30 พ.ย. 2569 เป็นวันจันทร์
    await label("คาดว่าของเข้า").click();
    await page.waitForTimeout(400);
    await page.locator('[aria-label="จ. 30 พ.ย. 2569"]').locator("visible=true").last().click();
    await page.waitForTimeout(400);
    await label("บันทึกวันคาดว่าเข้า").click();
    await page.waitForTimeout(2500);
    db(`to_char("partsExpectedAt",'YYYY-MM-DD')`) === "2026-11-30" ? pass("เลื่อนวันแล้ว (ฐานข้อมูล)") : fail(`วันในฐานข้อมูล: ${db(`"partsExpectedAt"`)}`);
    (await vis("อัปเดตวันคาดว่าอะไหล่เข้าแล้ว", false).count()) > 0 ? pass("เด้งแจ้งหลังเลื่อนวัน") : fail("ไม่เด้งแจ้งหลังเลื่อนวัน");
    await page.waitForTimeout(4000);

    // ของมาแล้ว
    await vis("อะไหล่มาแล้ว — อัปเดตสถานะ").first().click();
    await page.waitForTimeout(1200);
    // ผลรอบก่อนเติมไว้ (บอร์ดมี · คลัง 94) — เปลี่ยนเฉพาะสายพานเป็นมี แล้วเลือกคลัง
    await label(`มีของ ${beltCode}`).click();
    await page.waitForTimeout(300);
    await label(`คลังที่มี ${beltCode}`).click();
    await page.waitForTimeout(400);
    await vis("คลังลาดพร้าว 94").last().click();
    await page.waitForTimeout(300);
    (await page.getByPlaceholder("เลขใบเบิกจากระบบคลัง").locator("visible=true").count()) === 0
      ? pass("ขั้นเช็คไม่มีช่องเลขใบเบิก (เบิกหลังลูกค้าคอนเฟิร์ม)") : fail("ขั้นเช็คยังถามเลขใบเบิก");
    await page.screenshot({ path: path.join(DIR, "parts-out-form.png") });
    await vis("มีครบ — ส่งหัวหน้าภาคนัดวัน").last().click();
    await page.waitForTimeout(3000);
    db("status") === "PARTS_CHECKED" && db(`coalesce("partsExpectedAt"::text,'-')`) === "-"
      ? pass("ของครบ → หัวหน้าภาคนัดวันเข้า · วันคาดว่าเข้าถูกล้าง (ฐานข้อมูล)") : fail(`สถานะ: ${db("status")}`);
    (await vis("อัปเดตสถานะแล้ว", false).count()) > 0 && (await vis("→", false).count()) > 0
      ? pass("เด้งแจ้งสถานะใหม่ (จากไหน → ไปไหน)") : fail("ไม่เด้งแจ้งสถานะ");
    await page.screenshot({ path: path.join(DIR, "parts-out-toast.png") });
    // ดูที่แถบขั้นตอน — หน้ารายการที่อยู่ข้างหลังหน้าต่างใบงานยังเป็นข้อมูลก่อนเปิด (โหลดใหม่ตอนกลับไป)
    (await label("อะไหล่หมดบนแถบขั้นตอน").count()) === 0 && (await vis("อะไหล่มาแล้ว — อัปเดตสถานะ").count()) === 0
      ? pass("ป้ายแดงบนแถบขั้นตอนหายหลังของครบ") : fail("ป้ายแดงยังอยู่");
  } catch (e) {
    fail(String(e).slice(0, 600));
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
