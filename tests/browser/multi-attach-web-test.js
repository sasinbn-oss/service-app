// ทดสอบ: แนบไฟล์ได้หลายไฟล์ทีเดียว + ลากไฟล์มาวาง (เจ้าของงานขอ ต.ค. 69 — ทุกที่ที่แนบไฟล์)
//   · การ์ดไฟล์ในใบงาน: ปุ่มเลือกรูปเปิดตัวเลือกแบบหลายไฟล์ · เลือก 3 รูปขึ้นครบ 3 (ฐานข้อมูล)
//   · ลากมาวาง: กรอบขึ้น "วางไฟล์ที่นี่" · วาง 2 รูปขึ้นครบ (ฐานข้อมูล) · ไฟล์ผิดชนิดถูกตัดออกพร้อมบอกชื่อ ไฟล์ที่เหลือยังขึ้น
//   · วางไฟล์พลาดนอกกรอบ เบราว์เซอร์ไม่เปิดไฟล์ทับแอป
//   · ฟอร์มเปิดใบงาน: วาง 2 รูปที่กรอบรูปหน้างาน → เปิดใบแล้วไฟล์ขึ้นครบ (ฐานข้อมูล)
//   · นำเข้าไฟล์ Excel (Area Team): วางไฟล์ .xlsx ได้ตัวอย่าง · วางไฟล์ผิดนามสกุลบอกว่าต้องเป็นไฟล์อะไร
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { setup } = require("./fixture");
const { confirmDuplicate } = require("./dup");
const ExcelJS = require(path.join(__dirname, "../../backend/node_modules/exceljs"));
const DIR = __dirname;

// PNG 1×1 จริง — ตัวย่อรูปต้องเปิดได้
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const png = (name) => ({ name, mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });

/** ลากไฟล์มาวางที่กรอบ aria-label = label — แบบเดียวกับลากจากโฟลเดอร์ (DataTransfer ที่มีไฟล์) */
async function drop(page, label, files, { hoverOnly = false } = {}) {
  return page.evaluate(
    ({ label, files, hoverOnly }) => {
      const el = [...document.querySelectorAll(`[aria-label="${label}"]`)].filter((n) => n.offsetParent !== null).pop();
      if (!el) return "no-zone";
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
      const fire = (type, target = el) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire("dragenter");
      fire("dragover");
      if (!hoverOnly) fire("drop");
      return "ok";
    },
    { label, files: files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString("base64") })), hoverOnly }
  );
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const extra = [];
  try {
    fx = await setup();
    const wo = await fx.workOrder("C0006", null);
    const count = (id) => Number(fx.sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));

    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").last().click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(4000);

    // ════ เลือกหลายรูปทีเดียว ════
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), vis("เลือกรูป").last().click()]);
    chooser.isMultiple() ? pass("ปุ่มเลือกรูปเปิดตัวเลือกแบบหลายไฟล์") : fail("ตัวเลือกไฟล์เลือกได้ไฟล์เดียว");
    await chooser.setFiles([png("a1.png"), png("a2.png"), png("a3.png")]);
    await page.waitForTimeout(6000);
    count(wo.id) === 3 ? pass("เลือก 3 รูปทีเดียว → ขึ้นใบงานครบ 3 ไฟล์ (ฐานข้อมูล)") : fail(`เลือก 3 รูป: ฐานข้อมูลมี ${count(wo.id)}`);

    // ════ ลากมาวาง ════
    (await vis("หรือลากไฟล์มาวางตรงนี้ (หลายไฟล์พร้อมกันได้)").count()) > 0 ? pass("บอกว่าลากไฟล์มาวางได้") : fail("ไม่มีข้อความบอกว่าลากมาวางได้");
    await drop(page, "วางไฟล์แนบใบงาน", [png("d1.png")], { hoverOnly: true });
    await page.waitForTimeout(400);
    (await vis("วางไฟล์ที่นี่").count()) > 0 ? pass("ลากไฟล์มาเหนือการ์ด → ขึ้นกรอบ \"วางไฟล์ที่นี่\"") : fail("ไม่ขึ้นกรอบตอนลากไฟล์มา");
    await page.screenshot({ path: path.join(DIR, "multi-1-dragover.png") });
    const r = await drop(page, "วางไฟล์แนบใบงาน", [png("d1.png"), png("d2.png")]);
    await page.waitForTimeout(6000);
    r === "ok" && count(wo.id) === 5 ? pass("วาง 2 รูป → ขึ้นใบงานเพิ่ม 2 ไฟล์ (ฐานข้อมูล)") : fail(`วาง 2 รูป (${r}): ฐานข้อมูลมี ${count(wo.id)}`);
    (await vis("วางไฟล์ที่นี่").count()) === 0 ? pass("วางแล้วกรอบหายไป") : fail("กรอบค้างหลังวาง");
    await drop(page, "วางไฟล์แนบใบงาน", [png("d3.png"), { name: "สรุป.txt", mimeType: "text/plain", buffer: Buffer.from("x") }]);
    await page.waitForTimeout(5000);
    (await vis("บางไฟล์แนบที่นี่ไม่ได้ — ที่นี่รับ รูป · วิดีโอ — ไม่ได้แนบ: สรุป.txt", false).count()) > 0 && count(wo.id) === 6
      ? pass("ไฟล์ผิดชนิดถูกตัดออกพร้อมบอกชื่อ · รูปที่มาด้วยยังขึ้น (ฐานข้อมูล)") : fail(`ไฟล์ผิดชนิด: ฐานข้อมูลมี ${count(wo.id)}`);
    await page.screenshot({ path: path.join(DIR, "multi-2-rejected.png") });
    await vis("ตกลง").last().click().catch(() => {});
    await page.waitForTimeout(500);
    // วางพลาดนอกกรอบ — ต้องไม่มีอะไรเกิดขึ้น (เบราว์เซอร์ไม่เปิดไฟล์ทับแอป)
    const url = page.url();
    const prevented = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "x.png", { type: "image/png" }));
      const e = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    prevented && page.url() === url ? pass("วางนอกกรอบ: เบราว์เซอร์ไม่เปิดไฟล์ทับแอป") : fail("วางนอกกรอบแล้วไม่ถูกกัน");

    // ════ ฟอร์มเปิดใบงาน ════
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await vis("เพิ่มใบงาน", false).last().click();
    await page.waitForTimeout(2500);
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0006", { delay: 60 });
    await page.waitForTimeout(2400);
    await vis("ถนนอุตรกิจ", false).last().click();
    await page.waitForTimeout(2000);
    await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first().fill("W78");
    await vis("Oasis").last().click();
    await page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first().fill("ทดสอบลากไฟล์ (เทสต์)");
    await page.getByLabel("ชื่อผู้ติดต่อที่สาขา").locator("visible=true").first().fill("คุณทดสอบ");
    await page.getByLabel("เบอร์ติดต่อสาขา").locator("visible=true").first().fill("081-234-5678");
    await drop(page, "วางรูปหน้างานของเครื่องที่ 1", [png("f1.png"), png("f2.png")]);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(DIR, "multi-3-form.png") });
    await vis("เปิดใบงาน").last().click();
    // สาขาทดสอบมีใบค้างอยู่ (ใบด้านบน) — ป๊อปอัพยืนยันเปิดซ้ำ
    await confirmDuplicate(page);
    await page.waitForTimeout(8000);
    const made = fx.sql(`select id from "WorkOrder" where symptom='ทดสอบลากไฟล์ (เทสต์)' order by id desc limit 1`);
    if (made) extra.push(Number(made));
    made && count(made) === 2 ? pass("ฟอร์มเปิดใบงาน: วาง 2 รูป → เปิดใบแล้วไฟล์ขึ้นครบ 2 (ฐานข้อมูล)") : fail(`ฟอร์มเปิดใบงาน: ใบ ${made || "-"} มี ${made ? count(made) : 0} ไฟล์`);

    // ════ นำเข้าไฟล์ Excel ════
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await vis("สิทธิ์ผู้ใช้").first().click();
    await page.waitForTimeout(2500);
    await vis("นำเข้า Area Team").last().click();
    await page.waitForTimeout(800);
    await drop(page, "วางไฟล์ Area Team", [{ name: "รูป.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") }]);
    await page.waitForTimeout(800);
    (await vis("ไฟล์นี้นำเข้าไม่ได้ — ต้องเป็นไฟล์ .xlsx", false).count()) > 0 ? pass("นำเข้า: วางไฟล์ผิดนามสกุล → บอกว่าต้องเป็น .xlsx") : fail("วางไฟล์ผิดนามสกุลแล้วไม่บอก");
    await vis("ตกลง").last().click().catch(() => {});
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Maid");
    ws.addRow(["ลำดับ", "Area (หัวหน้า)", "Name-Surname (Thai)", "Nickname", "Tel", "ERP", "Project Name", "Position", "Remark", "User"]);
    ws.addRow([1, "หัวหน้า", "นางสาวลาก วาง", "ลาก", "080-000-0009", "C0006", "สาขา", "Maid (COCO)", "", "zz.drop.maid"]);
    const xlsx = { name: "maid.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
    await drop(page, "วางไฟล์ Area Team", [xlsx]);
    await page.waitForTimeout(3000);
    (await vis("ยืนยัน · สร้าง 1 บัญชี · ผูก 1 สาขา").count()) > 0 ? pass("นำเข้า: วางไฟล์ .xlsx → ได้ตัวอย่างเหมือนกดเลือกไฟล์") : fail("วางไฟล์ .xlsx แล้วไม่ได้ตัวอย่าง");
    fx.sql(`select count(*) from "User" where "employeeCode"='zz.drop.maid'`) === "0" ? pass("นำเข้า: ดูตัวอย่างยังไม่สร้างบัญชี") : fail("ดูตัวอย่างแล้วมีบัญชี");
    await page.screenshot({ path: path.join(DIR, "multi-4-import.png") });
    await page.close();
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) {
      for (const id of extra) fx.sql(`delete from "WorkOrder" where id=${id}`);
      fx.sql(`delete from "User" where "employeeCode"='zz.drop.maid'`);
      await fx.cleanup();
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
