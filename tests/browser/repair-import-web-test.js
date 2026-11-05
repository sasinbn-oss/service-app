// ทดสอบ: นำเข้าใบแจ้งซ่อมจากไฟล์ — ตัวอย่างบอกใบค้างของสาขาเดียวกัน กดเข้าไปดูใบเดิมได้ (เจ้าของงานขอ ต.ค. 69)
//   · แถวสาขา D0012 เครื่องใหม่ (ไม่ถูกข้าม) แต่สาขามีใบค้าง → ขึ้นรายการใบค้างพร้อมรหัส
//   · กดรหัส → ไปหน้ารายละเอียดใบนั้น · กลับมา → ตัวอย่างที่อ่านไว้ยังอยู่ ไม่ต้องเลือกไฟล์ใหม่
//   · เอาแถวออก → ปุ่มยืนยันลดจำนวน · แถวที่เครื่องมีใบค้าง กดเปิดเพิ่ม (คนละเรื่อง) → นับเป็นใบใหม่
//   · ส่วนแรกดูตัวอย่างอย่างเดียว ไม่กดยืนยัน
//   · ยืนยันทีละชุด (5 พ.ย. 69 — ไฟล์ 196 ใบในคำขอเดียวพังทุกครั้ง): ไฟล์ใบใหม่ 23 แถว (รูปฝัง · ตู้ขายน้ำยา · เครื่องที่ยังไม่มี)
//     กดยืนยัน → คำขอละไม่เกิน 10 แถว (only) · หน้าโหลดบอก "กำลังเปิดใบงาน 0/23" → "10/23" · ชุดที่ 2 เน็ตหลุด (ตัดคำขอทิ้ง)
//     → กล่อง "หยุดนำเข้ากลางทาง" บอกเปิดไปแล้ว 10 จาก 23 ใบ · ตัวอย่างอ่านใหม่ เหลือปุ่ม "เปิดใบงาน 13 ใบ" · กดอีกครั้ง → สรุป 13 ใบ
//     → ฐานข้อมูลมี 23 ใบครบ (สาขา เครื่อง ประเภทงาน importKey ไม่ซ้ำ รูป) แล้วลบทิ้ง — ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { execFileSync, execSync } = require("child_process");
const ExcelJS = require(path.join(__dirname, "../../backend/node_modules/exceljs"));
const { purgeOrders } = require("./purge");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const file = path.join(os.tmpdir(), `repair-import-${process.pid}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง", "รหัสสาขา", "ประเภทงาน", "เครื่อง", "รุ่นของเครื่อง", "ขนาดเครื่อง", "อาการที่พบ", "ผู้ติดต่อที่สาขา", "เบอร์ติดต่อสาขา", "ชื่อสถานที่", "รูปภาพ", "วิดีโอ"]);
  ws.addRow([new Date(), "D0012", "CM", "W998", "OASIS", "13 Kg", "ทดสอบนำเข้าเว็บ เครื่องไม่ปั่น", "คุณทดสอบ", "090-000-0000", "สาขาทดสอบ", null, null]);
  // W71 ที่ D0012 มีใบค้างอยู่ในข้อมูลทดสอบ — แถวนี้ถูกข้ามเป็นค่าเริ่มต้น
  ws.addRow([new Date(), "D0012", "CM", "W71", "OASIS", "13 Kg", "ทดสอบนำเข้าเว็บ ประตูล็อค", "คุณทดสอบ", "090-000-0000", "สาขาทดสอบ", null, null]);
  await wb.xlsx.writeFile(file);

  // ไฟล์ชุดใหญ่: 23 ใบใหม่ (D0012 เครื่องที่ยังไม่มี 15 · ตู้ขายน้ำยา 8 — บางแถวมีคำในช่องเครื่อง) + 1 แถวเครื่องซ้ำในไฟล์ (ข้าม)
  const base = 1100 + (process.pid % 500);
  const PREFIX = `ทดสอบนำเข้าเว็บชุด${process.pid}`;
  const spec = [];
  for (let i = 0; i < 15; i++)
    spec.push({ branch: "D0012", jobType: "CM", machine: `W${base + i}`, model: "OASIS", size: "13 Kg", symptom: `${PREFIX} เครื่อง ${i}`, contact: "คุณชุด", phone: `08100${String(i).padStart(5, "0")}`, image: i % 3 === 0 });
  for (let i = 0; i < 8; i++)
    spec.push({ branch: i % 2 ? "C0001" : "D0012", jobType: "ตู้ขายน้ำยา", machine: i % 4 ? "" : "ตู้น้ำยา 1", symptom: `${PREFIX} น้ำยา ${i}`, contact: "คุณชุด", phone: `08200${String(i).padStart(5, "0")}`, image: i === 1 });
  spec.push({ branch: "D0012", jobType: "CM", machine: `W${base}`, model: "OASIS", size: "13 Kg", symptom: `${PREFIX} เครื่องซ้ำในไฟล์`, contact: "คุณชุด", phone: "0819999999" });
  const specFile = path.join(os.tmpdir(), `repair-import-batch-${process.pid}.json`);
  const bigFile = path.join(os.tmpdir(), `repair-import-batch-${process.pid}.xlsx`);
  fs.writeFileSync(specFile, JSON.stringify(spec));
  execFileSync(process.execPath, [path.join(__dirname, "../fixtures-repair-form.js"), specFile, bigFile], {
    env: { ...process.env, NODE_PATH: path.join(__dirname, "../../backend/node_modules") },
  });
  const photoRows = spec.filter((r) => r.image).length;
  const token = (
    await (await fetch("http://127.0.0.1:4000/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "A001", password: "test1234" }) })).json()
  ).token;

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await page.getByLabel("นำเข้าใบแจ้งซ่อมจากไฟล์").locator("visible=true").first().click();
    await page.waitForTimeout(1200);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByLabel("เลือกไฟล์ฟอร์มแจ้งซ่อม").locator("visible=true").first().click(),
    ]);
    await chooser.setFiles(file);
    await page.waitForTimeout(4000);

    (await vis(/ใบค้างที่สาขานี้ \d+ ใบ/, false).count()) ? pass("แถวสาขาเดิมคนละเครื่อง บอกใบค้างของสาขา") : fail("ไม่ขึ้นใบค้างของสาขา");
    const chip = page.locator('[aria-label^="ดูใบงาน WO-"]').locator("visible=true").first();
    const code = ((await chip.getAttribute("aria-label")) || "").replace("ดูใบงาน ", "");
    await page.screenshot({ path: path.join(__dirname, "repair-import-open.png") });
    await chip.click();
    await page.waitForTimeout(3000);
    (await vis(code).count()) && !(await vis("ยืนยันนำเข้าใบแจ้งซ่อม").count())
      ? pass(`กดรหัสแล้วไปหน้ารายละเอียด ${code}`)
      : fail(`ไม่ได้ไปหน้ารายละเอียด ${code}`);
    await page.screenshot({ path: path.join(__dirname, "repair-import-detail.png") });
    // จอคอมเปิดรายละเอียดเป็นหน้าต่างลอย — ปิดด้วยกากบาท (ประวัติเบราว์เซอร์ไม่มีให้ย้อน)
    await page.locator('[aria-label="ปิด"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(__dirname, "repair-import-back.png") });
    await page.waitForTimeout(2500);
    (await vis("ทดสอบนำเข้าเว็บ เครื่องไม่ปั่น").count()) && (await page.getByLabel("ยืนยันนำเข้าใบแจ้งซ่อม").locator("visible=true").count())
      ? pass("กลับมาแล้วตัวอย่างที่อ่านไว้ยังอยู่")
      : fail("กลับมาแล้วตัวอย่างหาย");
    const confirmText = async () =>
      (await page.getByLabel("ยืนยันนำเข้าใบแจ้งซ่อม").locator("visible=true").innerText()).trim();
    // กดกล่องตัวเลข = กรองเฉพาะหมวดนั้น · กดซ้ำ = กลับมาทุกแถว
    const rowVisible = async (n) => (await page.locator(`[aria-label^="แถว ${n} "]`).locator("visible=true").count()) > 0;
    await page.getByLabel("ดูเฉพาะ มีใบค้าง (ข้าม)").locator("visible=true").click();
    await page.waitForTimeout(800);
    (await rowVisible(3)) && !(await rowVisible(2)) && (await vis(/แสดงเฉพาะ/, false).count())
      ? pass("กดกล่อง มีใบค้าง → เหลือเฉพาะแถวที่มีใบค้าง")
      : fail("กรองตามกล่องตัวเลขไม่ได้");
    await page.getByLabel("ดูเฉพาะ มีใบค้าง (ข้าม)").locator("visible=true").click();
    await page.waitForTimeout(800);
    (await rowVisible(2)) && (await rowVisible(3)) ? pass("กดซ้ำ → กลับมาทุกแถว") : fail("กดซ้ำแล้วไม่กลับมาทุกแถว");
    (await confirmText()).includes("1 ใบ") ? pass("เริ่มต้น: เปิดใหม่ 1 ใบ (แถวเครื่องที่มีใบค้างถูกข้าม)") : fail(`ปุ่มยืนยัน: ${await confirmText()}`);
    await page.getByLabel("เอาแถว 2 ออก").locator("visible=true").click();
    await page.waitForTimeout(2500);
    (await page.getByLabel("เอาแถว 2 กลับ").locator("visible=true").count()) && (await confirmText()).includes("ไม่มีใบใหม่")
      ? pass("กดเอาออก → แถวเป็นเอาออกแล้ว ปุ่มยืนยันไม่มีใบให้เปิด")
      : fail(`เอาออกไม่ได้: ${await confirmText()}`);
    await page.getByLabel("เปิดแถว 3 เพิ่ม").locator("visible=true").click();
    await page.waitForTimeout(2500);
    (await vis(/เลือกเปิดเพิ่ม/, false).count()) && (await confirmText()).includes("1 ใบ")
      ? pass("แถวที่เครื่องมีใบค้าง กดเปิดเพิ่ม (คนละเรื่อง) → นับเป็นใบใหม่")
      : fail(`เปิดเพิ่มไม่ได้: ${await confirmText()}`);
    await page.screenshot({ path: path.join(__dirname, "repair-import-picks.png") });

    // ── ยืนยันทีละชุด ──
    const applies = []; // เลขแถว only ของคำขอยืนยันแต่ละครั้ง (ตามลำดับที่ส่ง)
    let dropNext = 2; // คำขอยืนยันครั้งที่ 2 = เน็ตหลุด (ไปไม่ถึงเซิร์ฟเวอร์)
    let applyNo = 0;
    await page.route("**/api/work-orders/import-form", async (route) => {
      const body = (route.request().postDataBuffer() || Buffer.alloc(0)).toString("latin1");
      if (!/name="apply"/.test(body)) return route.continue();
      applyNo++;
      applies.push((body.match(/name="only"\r\n\r\n([0-9,]*)/) || [])[1] ?? null);
      // ช้าลงนิดให้หน้าโหลดค้างพอเห็นตัวเลข (เครื่องทดสอบเร็วกว่าของจริงมาก) — ชุดที่หลุดด้วย ไม่งั้น "10/23" ขึ้นแวบเดียว
      await new Promise((r) => setTimeout(r, 700));
      return applyNo === dropNext ? route.abort("connectionreset") : route.continue();
    });
    // จดข้อความหน้าโหลดทุกแบบที่ขึ้น — ตัวเลขเปลี่ยนทุกชุด ดูทีหลังไม่ทัน
    await page.evaluate(() => {
      window.__progress = [];
      setInterval(() => {
        for (const t of document.body.innerText.match(/กำลังเปิดใบงาน \d+\/\d+/g) || []) if (!window.__progress.includes(t)) window.__progress.push(t);
      }, 25);
    });
    const [chooser2] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByLabel("เลือกไฟล์ฟอร์มแจ้งซ่อม").locator("visible=true").first().click(),
    ]);
    await chooser2.setFiles(bigFile);
    await page.waitForFunction(() => /เปิดใบงาน 23 ใบ/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => undefined);
    (await confirmText()).includes("เปิดใบงาน 23 ใบ") ? pass("ไฟล์ชุดใหญ่: ปุ่มยืนยัน เปิดใบงาน 23 ใบ") : fail(`ปุ่มยืนยันไฟล์ชุด: ${await confirmText()}`);
    await page.getByLabel("ยืนยันนำเข้าใบแจ้งซ่อม").locator("visible=true").click();
    await vis("หยุดนำเข้ากลางทาง").waitFor({ timeout: 60000 }).catch(() => undefined);
    const stopText = await page.locator("body").innerText();
    /เปิดใบงานไปแล้ว 10 จาก 23 ใบ \(WO-\d+–WO-\d+\) แล้วหยุด — ชุดล่าสุดไม่ได้คำตอบจากเซิร์ฟเวอร์/.test(stopText) && /ไม่เกิดใบซ้ำ/.test(stopText)
      ? pass("ชุดที่ 2 เน็ตหลุด → กล่อง 'หยุดนำเข้ากลางทาง' บอกเปิดไปแล้ว 10 จาก 23 ใบ (รหัสช่วง) และว่ากดซ้ำได้ไม่เกิดใบซ้ำ")
      : fail(`กล่องหยุดกลางทาง: ${(stopText.match(/เปิดใบงานไปแล้ว[^\n]*/) || ["(ไม่เจอ)"])[0]}`);
    await page.screenshot({ path: path.join(__dirname, "repair-import-stopped.png") });
    const half = sql(`select count(*) from "WorkOrder" where symptom like '${PREFIX}%'`);
    half === "10" ? pass("ฐานข้อมูลหลังหยุด: 10 ใบ (ชุดแรกเท่านั้น)") : fail(`หลังหยุดฐานข้อมูลมี ${half} ใบ`);
    let seen = await page.evaluate(() => window.__progress);
    seen.includes("กำลังเปิดใบงาน 0/23") && seen.includes("กำลังเปิดใบงาน 10/23")
      ? pass("หน้าโหลดบอกความคืบหน้า กำลังเปิดใบงาน 0/23 → 10/23")
      : fail(`ข้อความหน้าโหลด: ${JSON.stringify(seen)}`);
    await vis("ตกลง").click();
    await page.waitForFunction(() => /เปิดใบงาน 13 ใบ/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => undefined);
    (await confirmText()).includes("เปิดใบงาน 13 ใบ") && (await page.getByLabel("ดูเฉพาะ นำเข้าแล้ว / แถวซ้ำ (ข้าม)").locator("visible=true").innerText()).startsWith("10")
      ? pass("ตัวอย่างอ่านใหม่ให้เอง: 10 แถวที่เปิดแล้วเป็น 'นำเข้าแล้ว' · ปุ่มเหลือ เปิดใบงาน 13 ใบ")
      : fail(`หลังหยุด ปุ่ม: ${await confirmText()} · กล่องนำเข้าแล้ว: ${await page.getByLabel("ดูเฉพาะ นำเข้าแล้ว / แถวซ้ำ (ข้าม)").locator("visible=true").innerText().catch(() => "?")}`);
    // กดยืนยันอีกครั้ง — ไม่มีเน็ตหลุดแล้ว
    dropNext = 0;
    await page.evaluate(() => (window.__progress = []));
    const before = applies.length;
    await page.getByLabel("ยืนยันนำเข้าใบแจ้งซ่อม").locator("visible=true").click();
    const done = vis(/^นำเข้าใบแจ้งซ่อมแล้ว — เปิดใบงานใหม่ 13 ใบ/, false);
    await done.waitFor({ timeout: 60000 }).catch(() => undefined);
    const doneText = (await done.count()) ? await done.first().innerText() : "";
    /เปิดใบงานใหม่ 13 ใบ — อยู่ขั้นแรก/.test(doneText) && /ข้ามเครื่องที่มีใบค้าง 1/.test(doneText) && /แนบรูปจากไฟล์ \d+ รูป/.test(doneText)
      ? pass(`สรุปท้าย: ${doneText.replace(/\s+/g, " ").slice(0, 120)}`)
      : fail(`ไม่ขึ้นสรุปท้าย: "${doneText}"`);
    seen = await page.evaluate(() => window.__progress);
    seen.includes("กำลังเปิดใบงาน 0/13") && seen.includes("กำลังเปิดใบงาน 10/13") ? pass("รอบสอง: กำลังเปิดใบงาน 0/13 → 10/13") : fail(`รอบสอง หน้าโหลด: ${JSON.stringify(seen)}`);
    await page.screenshot({ path: path.join(__dirname, "repair-import-done.png") });
    const sizes = applies.map((o) => (o ? o.split(",").length : 0));
    const lines = applies.filter(Boolean).flatMap((o) => o.split(",").map(Number));
    applies.every((o) => o) && sizes.every((n) => n > 0 && n <= 10) && applies.length === before + 2 && new Set(lines).size === 23
      ? pass(`ส่งยืนยัน ${applies.length} คำขอ แต่ละคำขอไม่เกิน 10 แถว (${sizes.join("+")}) · ชุดที่หลุดถูกส่งใหม่ · ครบ 23 แถว`)
      : fail(`คำขอยืนยัน: ${JSON.stringify(applies)}`);
    // ฐานข้อมูล: 23 ใบครบ ตรงสาขา/เครื่อง/ประเภทงาน · importKey ไม่ซ้ำ · รูปเข้าครบ · แถวซ้ำในไฟล์ไม่ถูกเปิด
    const want = spec.slice(0, 23).map((r) => `${r.symptom}|${r.branch}|${r.jobType === "CM" ? `CM|${r.machine}` : "DETERGENT|-"}`).sort().join("\n");
    // เรียงฝั่ง JS ทั้งคู่ — ลำดับภาษาไทยของ Postgres ไม่ตรงกับ sort() ของ JS
    const got = sql(`select w.symptom||'|'||b.code||'|'||w."jobType"||'|'||coalesce(m.code,'-') from "WorkOrder" w
      join "Branch" b on b.id=w."branchId" left join "Machine" m on m.id=w."machineId" where w.symptom like '${PREFIX}%'`).split("\n").sort().join("\n");
    const keys = sql(`select count(*)||'|'||count(distinct "importKey")||'|'||count(*) filter (where source='FORM' and status='NEW') from "WorkOrder" where symptom like '${PREFIX}%'`);
    const pics = sql(`select count(*) from "WorkOrderAttachment" a join "WorkOrder" w on w.id=a."workOrderId" where w.symptom like '${PREFIX}%' and a."fileName" like 'ฟอร์มแจ้งซ่อม-%'`);
    got === want && keys === "23|23|23" && pics === String(photoRows)
      ? pass(`ฐานข้อมูล: 23 ใบ สาขา/เครื่อง/ประเภทงานตรงไฟล์ · importKey ไม่ซ้ำ · รูปจากไฟล์ ${pics} รูป · แถวซ้ำในไฟล์ไม่ถูกเปิด`)
      : fail(`ฐานข้อมูล: keys=${keys} pics=${pics}/${photoRows} ${got === want ? "" : "แถวไม่ตรงไฟล์"}`);
    errors.length ? fail(`page error: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
  } finally {
    await browser.close();
    fs.rmSync(file, { force: true });
    fs.rmSync(bigFile, { force: true });
    fs.rmSync(specFile, { force: true });
    try {
      await purgeOrders(token, sql(`select id from "WorkOrder" where symptom like '${PREFIX}%'`).split("\n").filter(Boolean));
      sql(`delete from "Machine" m using "Branch" b where b.id=m."branchId" and b.code='D0012' and m.code in (${spec.slice(0, 15).map((r) => `'${r.machine}'`).join(",")})
           and not exists (select 1 from "WorkOrder" w where w."machineId"=m.id)`);
    } catch (e) {
      console.log(`เก็บกวาดไม่สำเร็จ: ${e.message}`);
    }
  }
})();
