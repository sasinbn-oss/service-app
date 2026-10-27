// ทดสอบ: ไฟล์แนบ — เปิด PDF ในแอป · รูปเอกสารคมขึ้น · โหลดไวขึ้น (เจ้าของงานขอ ต.ค. 69) · มือถือ แอดมิน
//   · ส่งใบเสนอราคา: PDF 2 หน้า + รูปเอกสารกว้าง 1170 กับ 3000 → ฐานข้อมูล: PDF มีรูปย่อหน้าแรก ·
//     รูป 1170 ไม่ถูกขยาย (ยังกว้าง 1170) · รูป 3000 ย่อเหลือ 2400 (เดิม 1600 ทั้งคู่)
//   · การ์ดไฟล์แนบ: PDF มีป้าย PDF · เปิด PDF แล้วเห็นทั้งสองหน้าในหน้าดูไฟล์ (canvas มีภาพจริง) · ซูมแล้ววาดใหม่กว้างขึ้น
//   · เปิดไฟล์ไม่ถามลิงก์ทีละไฟล์ (ใช้ชุดที่ขอไว้ตอนโหลดรายการ /attachments/links)
//   · ที่เก็บไฟล์ไม่ตอบ CORS (จำลองด้วยการบล็อก) → เปิดผ่านเซิร์ฟเวอร์ (/file) ได้เหมือนเดิม
//   · รูปเต็มโหลดช้า (จำลองหน่วง) → ขึ้น "กำลังโหลดรูปเต็ม… รูปนี้ยังเป็นรูปย่อ" แล้วหายเมื่อรูปขึ้น
// ต้องมี DATABASE_URL · mock-s3 ตัวล่าสุด (ตอบ CORS) · รูปทดสอบสร้างด้วย Python PIL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const DIR = __dirname;
const PDF = path.join(DIR, "..", "quote-2pages.pdf");
const { setup } = require("./fixture");

// รูปเอกสารสมมุติ (ตัวหนังสือบนพื้นขาว) กว้างตามที่ขอ
function docImage(width) {
  const file = path.join(os.tmpdir(), `doc-${width}.png`);
  execSync(
    `python3 -c "
from PIL import Image, ImageDraw
w=${width}; h=int(w*1.414)
im=Image.new('RGB',(w,h),'white'); d=ImageDraw.Draw(im)
for i in range(40): d.text((int(w*0.06), int(h*0.05)+i*int(h*0.022)), 'QT-6910-0234 line %d  TOTAL 7,778.90' % i, fill='black')
im.save('${file}')"`
  );
  return file;
}
// ความกว้างของ JPEG/PNG จากหัวไฟล์ — ไม่ต้องลงไลบรารีอ่านรูป
function imageWidth(buf) {
  if (buf[0] === 0x89) return buf.readUInt32BE(16);
  for (let i = 2; i < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return buf.readUInt16BE(i + 7);
    i += 2 + len;
  }
  return null;
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
  try {
    fx = await setup();
    const wo = await fx.workOrder("C0006", null);
    fx.sql(`update "WorkOrder" set status='AWAITING_QUOTE', "needsParts"=false where id=${wo.id}`);
    const small = docImage(1170);
    const large = docImage(3000);

    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(wo.code);
    await page.waitForTimeout(2500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3000);

    // ── ส่งใบเสนอราคา: PDF + รูปเอกสารสองขนาด ──
    await vis("ส่งใบเสนอราคา").last().click();
    await page.waitForTimeout(1200);
    let [chooser] = await Promise.all([page.waitForEvent("filechooser"), vis("แนบไฟล์ PDF").last().click()]);
    await chooser.setFiles(PDF);
    await page.waitForTimeout(2500);
    [chooser] = await Promise.all([page.waitForEvent("filechooser"), vis("เลือกรูป").last().click()]);
    await chooser.setFiles([small, large]);
    // ย่อรูป 3000 px ในเบราว์เซอร์ใช้เวลา — รอจนรายการขึ้นครบ 3 ไฟล์ก่อนกดยืนยัน
    await vis("3 ไฟล์ — กดแนบอีกเพื่อเพิ่ม").first().waitFor({ timeout: 40000 }).catch(() => {});
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(8000);
    const rows = fx
      .sql(`select id||'|'||kind||'|'||(thumbnail is not null)::text||'|'||"objectKey" from "WorkOrderAttachment" where "workOrderId"=${wo.id} and role='QUOTE' order by id`)
      .split("\n")
      .filter(Boolean)
      .map((l) => { const [id, kind, thumb, key] = l.split("|"); return { id: Number(id), kind, thumb: thumb === "true", key }; });
    const pdfRow = rows.find((r) => r.kind === "DOCUMENT");
    const imgRows = rows.filter((r) => r.kind === "IMAGE");
    fx.sql(`select status from "WorkOrder" where id=${wo.id}`) === "AWAITING_PAYMENT" && pdfRow && imgRows.length === 2
      ? pass("ส่งใบเสนอราคาแล้ว (ฐานข้อมูล): PDF 1 + รูป 2 · ไปขั้นรอลูกค้าจ่าย")
      : fail(`ส่งใบเสนอราคา: ${JSON.stringify(rows)}`);
    pdfRow && pdfRow.thumb ? pass("PDF มีรูปย่อหน้าแรก (ทำในเครื่องตอนเลือกไฟล์)") : fail("PDF ไม่มีรูปย่อ");
    // ความกว้างจริงของรูปที่เก็บ — ขอลิงก์แล้วอ่านหัวไฟล์
    const links = (await fx.call(fx.A, "GET", `/work-orders/${wo.id}/attachments/links`)).links || {};
    const widths = [];
    for (const r of imgRows) widths.push(imageWidth(Buffer.from(await (await fetch(links[r.id])).arrayBuffer())));
    widths.sort((a, b) => a - b);
    widths[0] === 1170 && widths[1] === 2400
      ? pass("รูปเอกสาร: กว้าง 1170 ไม่ถูกขยาย · กว้าง 3000 ย่อเหลือ 2400 (เดิม 1600 ทั้งคู่)")
      : fail(`ความกว้างรูปที่เก็บ: ${widths.join(", ")}`);

    // ── การ์ดไฟล์แนบ + เปิด PDF ในแอป ──
    await page.waitForTimeout(1500);
    // ปิดใบงานแล้วเปิดใหม่ — รายการไฟล์โหลดใหม่ บอกเซิร์ฟเวอร์ว่ารูปย่อใบไหนมีแล้ว และรูปย่อยังขึ้นครบ
    await page.getByLabel("ปิด", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(1500);
    await vis(wo.code).last().click();
    await page.waitForTimeout(3500);
    const tilesWithImage = await page.evaluate(
      () => [...document.querySelectorAll('[aria-label^="ดูไฟล์ "]')].filter((t) => t.offsetParent && t.querySelector("img")).length
    );
    requests.some((u) => /\/attachments\?have=\d/.test(u)) && tilesWithImage >= 3
      ? pass("โหลดรายการไฟล์ซ้ำส่ง have= (ไม่ส่งรูปย่อเดิมซ้ำ) และรูปย่อยังขึ้นครบ")
      : fail(`have: ${requests.filter((u) => /\/attachments\?/.test(u)).join(" ")} · ไทล์มีรูป ${tilesWithImage}`);
    (await vis("PDF").count()) > 0 ? pass("การ์ดไฟล์แนบ: PDF มีป้าย PDF") : fail("ไม่มีป้าย PDF");
    requests.length = 0;
    const openPdfTile = async () => {
      const tile = page.locator(`[aria-label="ดูไฟล์ quote-2pages.pdf"]`).locator("visible=true").last();
      await tile.scrollIntoViewIfNeeded().catch(() => {});
      await tile.click();
      await page.waitForTimeout(5000);
    };
    const canvasInfo = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("canvas")]
          .filter((c) => c.offsetParent)
          .map((c) => {
            const g = c.getContext("2d");
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let dark = 0;
            for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 128) dark++;
            return { w: c.getBoundingClientRect().width, dark };
          })
      );
    await openPdfTile();
    let pages = await canvasInfo();
    pages.length === 2 && pages.every((p) => p.dark > 20) && (await vis("หน้า 1 / 2").count()) > 0
      ? pass("เปิด PDF ในแอป: เห็นทั้ง 2 หน้า (มีตัวหนังสือจริงบน canvas) ไม่ต้องดาวน์โหลด")
      : fail(`หน้า PDF: ${JSON.stringify(pages)}`);
    await page.screenshot({ path: path.join(DIR, "files-pdf.png") });
    !requests.some((u) => /\/attachments\/\d+\/link$/.test(u)) && requests.every((u) => !/\/attachments\/\d+\/file$/.test(u))
      ? pass("เปิดไฟล์ไม่ถามลิงก์ทีละไฟล์ (ใช้ชุดที่ขอไว้แล้ว) · โหลดตรงจากที่เก็บ ไม่ผ่านเซิร์ฟเวอร์")
      : fail(`คำขอระหว่างเปิด: ${requests.filter((u) => /attachments/.test(u)).join(" ")}`);
    const before = pages[0].w;
    await page.getByLabel("ซูมเข้า", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    pages = await canvasInfo();
    pages[0] && pages[0].w > before * 1.3 && pages[0].dark > 20 ? pass("ซูมเข้า: วาดหน้าใหม่กว้างขึ้น ตัวหนังสือยังอยู่") : fail(`ซูม: ${before} → ${pages[0]?.w}`);
    await page.getByLabel("ปิดรูป", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(1000);

    // ── ที่เก็บไม่ตอบ CORS → เปิดผ่านเซิร์ฟเวอร์ ──
    await page.route(/:9100\/.*quote-sample/, (r) => r.abort());
    requests.length = 0;
    await openPdfTile();
    pages = await canvasInfo();
    pages.length === 2 && pages.every((p) => p.dark > 20) && requests.some((u) => /\/attachments\/\d+\/file$/.test(u))
      ? pass("โหลดตรงจากที่เก็บไม่ได้ → เปิดผ่านเซิร์ฟเวอร์แทน ยังเห็นทั้ง 2 หน้า")
      : fail(`ทางสำรอง: หน้า=${pages.length} file=${requests.some((u) => /\/file$/.test(u))}`);
    await page.getByLabel("ปิดรูป", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(800);
    await page.unroute(/:9100\/.*quote-sample/);

    // ── รูปเต็มโหลดช้า → บอกว่ายังเป็นรูปย่อ ──
    await page.route(/:9100\/.*doc-3000/, async (r) => {
      await new Promise((res) => setTimeout(res, 4000));
      await r.continue();
    });
    const imgTile = page.locator(`[aria-label="ดูไฟล์ doc-3000.jpg"]`).locator("visible=true").last();
    await imgTile.scrollIntoViewIfNeeded().catch(() => {});
    await imgTile.click();
    await page.waitForTimeout(1200);
    const waiting = await vis("กำลังโหลดรูปเต็ม… รูปนี้ยังเป็นรูปย่อ").count();
    await page.waitForTimeout(5500);
    const after = await vis("กำลังโหลดรูปเต็ม… รูปนี้ยังเป็นรูปย่อ").count();
    waiting > 0 && after === 0 ? pass("รูปเต็มโหลดช้า: ขึ้นว่ายังเป็นรูปย่อ แล้วหายเมื่อรูปเต็มขึ้น") : fail(`ป้ายรอรูป: ระหว่างรอ=${waiting} หลังโหลด=${after}`);
    await ctx.close();
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(String(e).slice(0, 500));
  } finally {
    if (fx) await fx.cleanup();
    await browser.close();
  }
})();
