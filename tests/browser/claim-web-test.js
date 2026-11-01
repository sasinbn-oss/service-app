// ทดสอบ: เคลมอะไหล่เก่าผ่านหน้าจอจริง บนใบทดสอบที่คัดลอกจากใบจริง (ใบจริงต้องไม่ถูกแตะ) · Admin Spare Part ดูใบงานได้อย่างเดียว
//        · ฟอร์มทีละขั้น (เคลมก้อน 5): งานที่ทำ → เครื่อง (ถ่ายป้ายใหม่ ระบบอ่าน แล้วยืนยันรุ่นกับ Serial ทีละช่อง) → เคลมทีละชิ้น → ส่ง
//        · ยังไม่ครบ ปุ่มล่างบอก "ยังขาด n อย่าง — พาไป" กดแล้วไม่ส่ง · ไฟล์เคลมส่งทันทีที่เลือก (ช่องบอก "กำลังส่ง x%" → "✓ แนบแล้ว")
//        · ใบงานไปรอตรวจเคลม · แอดมินทั่วไปไม่มีปุ่มตรวจ
//        · Admin Spare Part เปิดใบแล้วเจอหน้าตรวจเคลม (หลักฐานรอบนี้ · ข้อมูลเครื่อง · แถบตัดสินล่างจอ — ละเอียดใน claim-review-web-test.js)
//        · Admin Spare Part ตีกลับ (✗ ตีกลับ + ติ๊กช่องที่ต้องแก้ + เหตุผล · เคลมก้อน 4) → ช่างเห็นเหตุผล ฟอร์มแก้เคลมขึ้นเฉพาะช่องที่ถูกชี้
//          (ที่เหลือพับไว้ กางแล้วข้อมูลเดิมมาครบ ไม่ต้องแนบซ้ำ) แนบวิดีโอใหม่ → "ส่งเคลมใหม่"
//          → อนุมัติ (✓ ผ่าน → อนุมัติเคลม · ปิดงาน → ยืนยันอนุมัติ) → ปิดงาน (ตัดสินทีละชิ้น · เคลมก้อน 3)
// ยืนยันผลที่ฐานข้อมูลทุกขั้น ไม่เชื่อข้อความบนจออย่างเดียว
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture"); // วันนัดนับจากวันนี้ — เซิร์ฟเวอร์ไม่รับวันย้อนหลัง · fxPart = อะไหล่ตรงยี่ห้อเครื่อง
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const CLIP = path.join(DIR, "..", "site-clip.mp4");
const API = "http://localhost:4000/api";
// รูปป้าย Huebsch ทั้งป้าย (เจ้าของงานส่งมา ต.ค. 69) — ถ่ายรูปเดียวแล้วระบบเลือกค่าเอง · MODEL อ่านได้ "HLOSSL" ทุกครั้ง
const PLATE_PHOTO = path.join(DIR, "..", "plate-huebsch.jpg");

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, url, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const login = async (code) =>
  (await (await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
  })).json()).token;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const suf = String(Date.now()).slice(-5);
  const bc = `DZCW${suf}`;
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  let id = null;
  let orig = null;
  let before = null;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");

  try {
    // ── เตรียมใบงานให้ถึงขั้นเข้างาน (เครื่อง Huebsch สาขาในประกัน) ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCWP${suf}','แอดมินอะไหล่ทดสอบจอ','PARTS_ADMIN','${hash}',false)`);
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt") values ('สาขาทดสอบเคลมจอ','${bc}','ใต้','กระบี่','FRANCHISE',now()-interval '12 months')`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch',now())`);
    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "HL055L", symptom: "ประตูล็อกไม่ลง" }],
    });
    id = wo.orders ? wo.orders[0].id : wo.id;
    // อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่อง (fxPart) ซึ่งรู้ได้เมื่อมีใบแล้ว — เครื่อง "HB - Huebsch" ได้ตัวแฝด -HB
    // ป้ายในฟอร์มเคลมต่อท้ายด้วยรหัสอะไหล่ ข้อความที่หาบนจอจึงใช้รหัสตัวที่ส่งจริง (spCode) ไม่ใช่รหัสตายตัว
    const sp = fxPart(id, "BOARD");
    const spCode = sql(`select "partCode" from "SparePart" where id=${sp}`);
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: [{ sparePartId: Number(sp), quantity: 1 }] });
    // เช็คอะไหล่ → นัด → เบิก → คอนเฟิร์มลูกค้า → ปล่อยงาน (เบิกก่อนคอนเฟิร์ม ต.ค. 69 รอบสอง)
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, {
      results: [{ sparePartId: Number(sp), inStock: true, warehouse: "คลังลาดพร้าว 94" }],
    });
    await call(S, "POST", `/work-orders/${id}/assign`, { team: "กระบี่", scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: [{ sparePartId: Number(sp), inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CW${suf}` }],
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "p.png");
      if (role) form.append("role", role);
      await call(A, "POST", `/work-orders/${id}/attachments`, form);
    }
    let code = sql(`select code from "WorkOrder" where id=${id}`);
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบงานไม่ถึงขั้นเข้างาน");

    async function open(user) {
      const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
      await page.waitForTimeout(3500);
      await page.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click({ timeout: 10000 }).catch(async (e) => {
        await page.screenshot({ path: path.join(DIR, `claim-fail-${user}.png`) });
        throw e;
      });
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await page.getByText(code, { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
      return page;
    }
    const vis = (page, t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (page, l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    async function attach(page, l, file) {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label(page, l).click()]);
      await chooser.setFiles(file);
      await page.waitForTimeout(1500);
    }

    // ── ช่างปิดงานพร้อมเคลม ──
    let page = await open("A001");

    // ── คัดลอกเป็นใบทดสอบ แล้วเดินเคลมบนใบทดสอบ — ใบจริงต้องไม่ถูกแตะ ──
    orig = id;
    before = sql(`select status||'|'||"updatedAt" from "WorkOrder" where id=${orig}`);
    await vis(page, "คัดลอกเป็นใบทดสอบ").last().click();
    await page.waitForTimeout(800);
    await vis(page, "คัดลอก").last().click();
    await page.waitForTimeout(3500);
    id = Number(sql(`select id from "WorkOrder" where "testOfId"=${orig}`)) || null;
    if (!id) throw new Error("คัดลอกเป็นใบทดสอบไม่สำเร็จ");
    code = sql(`select code from "WorkOrder" where id=${id}`);
    (await vis(page, "ใบทดสอบ — คัดลอกจากใบจริง ไม่กระทบใบจริง ทดสอบเสร็จให้ลบทิ้ง").count()) > 0 &&
      sql(`select "isTest"||'|'||status from "WorkOrder" where id=${id}`) === "true|IN_PROGRESS"
      ? pass(`คัดลอกเป็นใบทดสอบ ${code}: เปิดใบใหม่ให้เลย มีแถบใบทดสอบ ขั้นเดียวกับใบจริง`)
      : fail("คัดลอกเป็นใบทดสอบ");
    // ใบทดสอบไม่คัดลอกรูป — แนบรูปหน้างาน ป้ายรุ่น ใบเหลืองของใบทดสอบเอง (ผู้ทดสอบจริงแนบในฟอร์มปิดงาน)
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "p.png");
      if (role) form.append("role", role);
      await call(A, "POST", `/work-orders/${id}/attachments`, form);
    }
    // ปิดหน้าแล้วเปิดใบทดสอบใหม่ — ใบจริงยังค้างอยู่ข้างหลัง ปุ่มชื่อเดียวกันมีสองชุด
    await page.close();
    page = await open("A001");
    await vis(page, "ปิดงาน").first().click();
    await page.waitForTimeout(1500);
    /**
     * ฟอร์มทีละขั้น (เคลมก้อน 5): สาขาในประกัน + อะไหล่ที่เบิกไว้ (เติมให้เอง) = มีชิ้นที่ส่งเคลม → สี่ขั้น
     * งานที่ทำ · เครื่อง · เคลมทีละชิ้น · ส่ง — ปุ่มล่างพาไปทีละขั้น ส่งได้จากขั้น "ส่ง" เท่านั้น
     */
    // แถบขั้นของใบงานเอง ("ขั้น 1 ระบุอะไหล่ …") ขึ้นต้นเหมือนกัน — นับเฉพาะแถบของฟอร์มปิดงาน ไม่งั้นข้อนี้ผ่านทั้งที่ฟอร์มไม่เป็นทีละขั้น
    const stepTab = (n) => page.locator('[aria-label="ขั้นปิดงาน"]').locator(`[aria-label^="ขั้น ${n} "]`).locator("visible=true").first();
    const SEND = "ยืนยันปิดงาน · ส่งตรวจเคลม";
    (await stepTab(1).count()) > 0 && (await stepTab(4).count()) > 0 && (await label(page, `จำนวน ${spCode}`).count()) > 0
      ? pass("อะไหล่ที่เบิกไว้เติมให้เอง · สาขาในประกันมีชิ้นที่ส่งเคลม: ฟอร์มเปิดเป็นทีละขั้น (งานที่ทำ · เครื่อง · เคลมทีละชิ้น · ส่ง)")
      : fail("ฟอร์มปิดงานพร้อมเคลมไม่เปิดเป็นทีละขั้น");
    // ปุ่มล่างไม่จาง (เคลมก้อน 1) — ขั้นนี้ยังขาดอะไรบอกจำนวน กดแล้วพาไปช่องแรกที่ขาด ไม่ส่งอะไรไปเซิร์ฟเวอร์
    const goBtn = page.getByText(/^ยังขาด \d+ อย่าง — พาไป$/).locator("visible=true").last();
    const closePosts = [];
    page.on("request", (r) => { if (r.method() === "POST" && /\/close$/.test(r.url())) closePosts.push(r.url()); });
    if (await goBtn.count()) {
      const goText = await goBtn.innerText();
      await goBtn.click();
      await page.waitForTimeout(1200);
      closePosts.length === 0 && (await vis(page, SEND).count()) === 0 && sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
        ? pass(`ขั้นงานที่ทำยังไม่ครบ: ปุ่มล่าง "${goText}" กดแล้วไม่ส่งคำขอปิดงาน (ฐานข้อมูลยังรอช่าง)`)
        : fail(`กดปุ่มพาไป: คำขอปิด ${closePosts.length} · ปุ่มส่ง ${await vis(page, SEND).count()}`);
    } else fail("ขั้นงานที่ทำยังไม่ครบแต่ปุ่มล่างไม่บอกว่ายังขาด");
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("เปลี่ยนบอร์ด ทดสอบแล้วปกติ");
    await label(page, "ผู้เข้าปฏิบัติงานคนที่ 1").click();
    await page.waitForTimeout(500);
    await vis(page, "ช่างสมชาย", false).last().click();
    await page.waitForTimeout(500);
    await vis(page, "ถัดไป: ข้อมูลเครื่อง").last().click();
    await page.waitForTimeout(1500);

    // ── ขั้นเครื่อง: รูปป้ายรูปเดียว ระบบอ่านแล้วยืนยันรุ่นกับ Serial ทีละช่อง (เคลมก้อน 5) ──
    // รูปป้ายที่แนบไว้ก่อนเปิดฟอร์ม (รูปหน้างานทดสอบ ไม่ใช่ป้ายจริง) ระบบอ่านเองก่อน — รอให้จบ แล้ว "ถ่ายใหม่" ด้วยรูปป้ายจริง
    await label(page, "สถานะอ่านป้าย").waitFor({ state: "detached", timeout: 180000 }).catch(() => {});
    (await vis(page, "✓ ป้ายรุ่น: ใช้รูปจากแท็บงานที่ทำ ไม่ต้องถ่ายซ้ำ").count()) > 0
      ? pass("ขั้นเครื่องใช้รูปป้ายจากขั้นงานที่ทำ ไม่ต้องถ่ายซ้ำ") : fail("ขั้นเครื่องไม่บอกว่าใช้รูปป้ายจากขั้นงานที่ทำ");
    const claimFilesBefore = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role like 'CLAIM_%'`));
    await attach(page, "ถ่ายรูปป้ายรุ่นใหม่", PLATE_PHOTO);
    // อ่านทั้งป้ายในเบราว์เซอร์ (หาบรรทัด → อ่านซ้ำทีละบรรทัด) — เครื่องทดสอบช้ากว่ามือถือจริง ให้เวลานาน
    await page.waitForTimeout(1500);
    await label(page, "สถานะอ่านป้าย").waitFor({ state: "detached", timeout: 180000 });
    const shown = async (prefix) =>
      ((await page.locator(`[aria-label^="${prefix}"]`).locator("visible=true").first().getAttribute("aria-label").catch(() => null)) ?? "").slice(prefix.length);
    // MODEL: รุ่นเต็มในกรอบข้าง ๆ (HL055LWHPRXG6W0000 · เจ้าของงานขอ ต.ค. 69) อ่านได้ HLOSSL… → ตัวต้นแก้ตามทะเบียน HL055L
    // ส่วนท้ายอ่านเพี้ยนได้ (6 → E/S) ระบบติดธงให้ช่างตรวจ — เทสต์ดูตัวต้นที่แก้ตามทะเบียน + ความยาวเต็ม 18 ตัว
    const model = await shown("รุ่นที่จะส่ง ");
    /^HL055LWHPRXG/.test(model) && model.length === 18 && (await shown("Serialที่จะส่ง ")) === "2402600330" &&
      (await vis(page, "ระบบอ่านป้ายแล้ว — กดยืนยันรุ่นกับ Serial ทีละช่อง").count()) > 0 &&
      (await vis(page, "✓ ถ่ายป้ายใหม่แล้ว — แทนรูปเดิม").count()) > 0
      ? pass(`ถ่ายป้ายใหม่ในขั้นเครื่อง: "✓ ถ่ายป้ายใหม่แล้ว — แทนรูปเดิม" · ระบบเลือกรุ่นเต็ม ${model} (ตัวต้นแก้ตามทะเบียน HL055L) + Serial 2402600330`)
      : fail(`ค่าที่อ่านจากรูป: รุ่น=${model} Serial=${await shown("Serialที่จะส่ง ")}`);
    // ตัวท้ายแต่ละรอบอ่านไม่ตรงกัน (6 อ่านเป็น E/S) — ต้องขึ้นเตือนบอกว่าส่วนท้ายไม่มั่นใจ ไม่ใช่ปล่อยผ่านเงียบ ๆ
    (await vis(page, "ส่วนท้ายรุ่นเต็มอ่านได้ไม่ตรงกันทุกรอบ", false).count()) > 0
      ? pass("รุ่นเต็มที่ตัวท้ายอ่านไม่ตรงกันทุกรอบ ขึ้นเตือนให้ช่างดูกับรูป") : fail("รุ่นเต็มไม่ขึ้นเตือนทั้งที่ตัวท้ายไม่แน่นอน");
    (await label(page, "รูปป้ายรุ่นเต็ม").count()) > 0 && (await vis(page, "ยังขาด:", false).first().innerText().catch(() => "")).includes("ข้อมูลเครื่อง: ยืนยันรุ่น")
      ? pass("โชว์รูปป้ายเต็มในฟอร์ม · ยังต้องกดยืนยันรุ่นกับรูป (กล่องยังขาด \"ข้อมูลเครื่อง: ยืนยันรุ่น\")") : fail("ไม่มีรูปป้ายเต็ม/ไม่บังคับยืนยันรุ่น");
    await page.screenshot({ path: path.join(DIR, "claim-0a-scanner.png") });
    await label(page, "ยืนยัน รุ่น ตรงกับรูป").click();
    await label(page, "ยืนยัน Serial ตรงกับรูป").click();
    await page.waitForTimeout(300);
    (await vis(page, "✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว").count()) > 0 && (await vis(page, "✓ ยืนยันแล้ว: ตรงกับรูป").count()) > 0
      ? pass("กดยืนยันทีละช่อง: \"✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว\" (รุ่น) · \"✓ ยืนยันแล้ว: ตรงกับรูป\" (Serial)")
      : fail("ยืนยันรุ่น/Serial ไม่ขึ้นสถานะยืนยันแล้ว");
    await page.screenshot({ path: path.join(DIR, "claim-0-scanned.png") });
    await label(page, "Error ที่เครื่องขึ้น").click();
    await page.waitForTimeout(400);
    await vis(page, "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก (Door Lock)").last().click();
    await page.waitForTimeout(300);
    (await vis(page, "การติดตั้งฐานเครื่อง", false).count()) === 0
      ? pass("ไม่มีเช็คลิสต์การติดตั้งฐานเครื่องในฟอร์มแล้ว")
      : fail("ยังมีเช็คลิสต์การติดตั้งฐานเครื่อง");
    await page.getByText(/^ถัดไป: เคลม /).locator("visible=true").last().click();
    await page.waitForTimeout(1200);

    // ── ขั้นเคลมทีละชิ้น ──
    await label(page, `รหัสอะไหล่ตัวที่เสีย ${spCode}`).fill(spCode);
    await label(page, `อาการ/สาเหตุ ${spCode}`).fill("ประตูล็อกไม่ลง ขึ้น Error dL");
    await label(page, `สิ่งที่เข้าเช็ค ${spCode}`).fill("วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย");
    /**
     * ไฟล์เคลมส่งทันทีที่เลือก (เคลมก้อน 1) — บีบเน็ตขาขึ้นให้ช้าพอจะเห็นช่องบอก "กำลังส่ง x%"
     * ต้องไม่มีหน้าโหลดเต็มจอ (ช่างกรอกช่องอื่นต่อได้ระหว่างรอ) แล้วจบที่ "✓ แนบแล้ว"
     */
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 60 * 1024 });
    // รอ/ตรวจบนจอเฉพาะในช่องรูปอะไหล่เก่า — ช่องอื่นอาจขึ้น "✓ แนบแล้ว" อยู่แล้ว ถ้าหาทั้งหน้า การรอจบทันทีแล้วนับแข่งกับไฟล์ที่ยังส่งไม่จบ
    const partSlot = page.locator(`[aria-label="วางรูปอะไหล่เก่า ${spCode}"]`).locator("visible=true").last();
    const partFiles = () =>
      Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role='CLAIM_PART' and "sparePartId"=${sp}`));
    const [partChooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label(page, `แนบรูปอะไหล่เก่า ${spCode}`).click()]);
    await partChooser.setFiles(PHOTO);
    const sending = partSlot.getByText(/^กำลังส่ง \d+%$/);
    await sending.first().waitFor({ timeout: 15000 }).catch(() => {});
    if (await sending.count()) {
      const slotText = await sending.first().innerText();
      await page.screenshot({ path: path.join(DIR, "claim-1b-progress.png") });
      (await page.getByRole("progressbar").locator("visible=true").count()) === 0
        ? pass(`เลือกรูปอะไหล่เก่าแล้วส่งทันที: ช่องขึ้น "${slotText}" ไม่มีหน้าโหลดเต็มจอ`)
        : fail("ส่งไฟล์เคลมแล้วยังขึ้นหน้าโหลดเต็มจอ");
    } else fail("ไม่เห็น \"กำลังส่ง x%\" ที่ช่องรูปอะไหล่เก่า");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const partDone = partSlot.getByText("✓ แนบแล้ว", { exact: true });
    await partDone.waitFor({ timeout: 60000 }).catch(() => {});
    // ช่องขึ้น ✓ หลังเซิร์ฟเวอร์ตอบแถวที่สร้างแล้ว — รอฐานข้อมูลอีกชั้นก่อนนับ (ไม่อ่านแข่งกับการบันทึก)
    for (let t = 0; t < 40 && partFiles() !== 1; t++) await page.waitForTimeout(250);
    (await partDone.count()) > 0 && partFiles() === 1
      ? pass("ส่งเสร็จช่องรูปอะไหล่เก่าขึ้น \"✓ แนบแล้ว\" · รูปอยู่ในฐานข้อมูลแล้วก่อนกดปิดงาน")
      : fail(`หลังเลือกรูปอะไหล่เก่า: ช่อง ✓=${await partDone.count()} · ไฟล์เคลมในฐานข้อมูล ${sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role like 'CLAIM_%'`)} (เดิม ${claimFilesBefore})`);
    // ข้อ ⑥ ของเครื่อง (ใช้ร่วมทุกชิ้น) — ไม่ได้ถ่ายก่อนซ่อม แนบตรงนี้ (ผูกชิ้นนี้ ไม่นับเป็นรูปก่อนซ่อม)
    (await vis(page, "อาการหลังซ่อมอาจไม่ขึ้นแล้ว — ผู้ขายอาจไม่รับ").count()) > 0
      ? pass("ไม่ได้ถ่ายก่อนซ่อม: ข้อ ⑥ เตือน \"อาการหลังซ่อมอาจไม่ขึ้นแล้ว — ผู้ขายอาจไม่รับ\"") : fail("ข้อ ⑥ ไม่เตือนว่าไม่มีภาพอาการ");
    await attach(page, "แนบรูปอาการเสีย ใช้ร่วมทุกชิ้น", PHOTO);
    await attach(page, "แนบวิดีโอ Error code ใช้ร่วมทุกชิ้น", CLIP);
    await attach(page, `แนบวิดีโอการตรวจเช็ค ${spCode}`, CLIP);
    const items = await call(A, "GET", `/work-orders/${id}`).then((d) => d.claimTroubleshooting);
    for (const t of items) await label(page, `${t} ${spCode}`).click();
    await label(page, `เช็คแล้ว Solenoid ไม่ฝืด ${spCode}`).click();
    await page.waitForTimeout(500);
    (await vis(page, "โซลินอยด์ (Solenoid) ไม่ฝืด").count()) > 0
      ? pass("ข้อเช็คตาม Error ขึ้นคำอ่านไทยนำหน้า \"โซลินอยด์ (Solenoid) ไม่ฝืด\" (ค่าที่เก็บยังเป็นคำในคู่มือ)")
      : fail("ข้อเช็คตาม Error ไม่ขึ้นคำอ่านไทย");
    await label(page, `เช็คแล้ว Solenoid ไม่ฝืด ${spCode}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-0b-check.png") });
    await vis(page, "ถัดไป: ตรวจก่อนส่ง").last().click();
    await page.waitForTimeout(800);
    (await vis(page, "ยังขาด:", false).count()) === 0 && (await vis(page, SEND).count()) > 0
      ? pass(`ครบทุกข้อ: ขั้นส่งไม่มีอะไรขาด ปุ่มล่าง "${SEND}"`) : fail(`ยังขึ้นว่าขาด: ${await vis(page, "ยังขาด:", false).first().innerText().catch(() => "")}`);
    await page.screenshot({ path: path.join(DIR, "claim-1-close.png") });

    /**
     * กดใหม่ไม่ส่งซ้ำ (WO-00133 — ไฟล์ซ้ำจนเต็มเพดานแล้วปิดงานไม่ได้)
     * ฟอร์มทีละขั้นส่งทุกไฟล์ทันทีที่เลือก (ไฟล์เคลม · รูปป้ายที่ถ่ายใหม่) — ตอนกดปิดไม่มีไฟล์ต้องส่งเพิ่ม
     * คำสั่งปิดรอบแรกให้ล้ม แล้วกดใหม่ ต้องไม่มีไฟล์เพิ่ม — นับที่ฐานข้อมูล ไม่ใช่ดูจากหน้าจอ
     */
    const filesBefore = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and "sparePartId"=${sp} and role like 'CLAIM_%'`)) === 4
      ? pass("ก่อนกดปิดงาน หลักฐานเคลมทั้ง 4 ไฟล์ขึ้นไปแล้ว (ส่งตั้งแต่ตอนเลือก · ฐานข้อมูล)")
      : fail(`ก่อนกดปิดงาน หลักฐานเคลมในฐานข้อมูล ${sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and "sparePartId"=${sp} and role like 'CLAIM_%'`)} ไฟล์`);
    let failOnce = true;
    await page.route(`**/api/work-orders/${id}/close`, (route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "ทดสอบ: ปิดไม่ผ่านรอบแรก" }) });
    });
    await vis(page, SEND).last().click();
    await vis(page, "ทดสอบ: ปิดไม่ผ่านรอบแรก").waitFor({ timeout: 120000 });
    const filesSent = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    filesSent === filesBefore ? pass("กดปิดรอบแรก: ไม่มีไฟล์ต้องส่งเพิ่ม (ขึ้นตั้งแต่ตอนเลือก) แล้วคำสั่งปิดล้ม") : fail(`รอบแรกมีไฟล์ขึ้นตอนกดปิด ${filesSent - filesBefore} ไฟล์`);
    await vis(page, SEND).last().click();
    await page.waitForTimeout(6000);
    const filesAfter = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    filesAfter === filesSent
      ? pass("กดปิดใหม่ไม่ส่งไฟล์ซ้ำ (จำนวนไฟล์ในฐานข้อมูลเท่าเดิม)")
      : fail(`ไฟล์ซ้ำ: รอบแรก ${filesSent} · หลังกดใหม่ ${filesAfter}`);

    sql(`select w.status||'|'||c."brokenPartCode" from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id}`) === `CLAIM_REVIEW|${spCode}`
      ? pass("ปิดงานแล้วใบงานไปรอตรวจเคลม พร้อมรหัสตัวที่เสียที่กรอก (ฐานข้อมูล)")
      : fail(`สถานะ ${sql(`select status from "WorkOrder" where id=${id}`)}`);
    const np = sql(`select (nameplate->'fields')::text||'|'||("fieldCheck"->>'errorCode')||'|'||("fieldCheck"->'checked')::text||'|'||("fieldCheck" ? 'install')::text from "PartClaim" where "workOrderId"=${id}`);
    const fields = JSON.parse(np.split("|")[0]);
    const f = (k) => fields.find((x) => x.key === k) ?? {};
    f("model").value === model && f("model").source === "SCAN" && f("model").confirmed === true && typeof f("model").read === "string" &&
      f("serial").value === "2402600330" && f("serial").source === "SCAN" && f("serial").confirmed === true &&
      /^data:image\/jpeg/.test(f("serial").crop ?? "") && np.endsWith('|E dL / E dL1 / E dL2|["Solenoid ไม่ฝืด"]|false')
      ? pass(`ฐานข้อมูล: รุ่นเต็ม ${model} · Serial 2402600330 (อ่านจากรูป + ภาพบรรทัด · ยืนยันทีละช่อง confirmed + ค่าที่ระบบอ่าน read) · Error E dL · ข้อที่เช็คของชิ้นนี้ · ไม่มีคำตอบเรื่องติดตั้ง`)
      : fail(`ข้อมูลเครื่องในใบเคลม: ${np.slice(-200)} · ${fields.map((x) => `${x.key}=${x.value}/${x.source}/${x.confirmed}`).join(",")}`);
    sql(`select (c.nameplate->>'photoId')::int = (select max(a.id) from "WorkOrderAttachment" a where a."workOrderId"=${id} and a.role='NAMEPLATE')
           and (select count(*) from "WorkOrderAttachment" a where a."workOrderId"=${id} and a.role='NAMEPLATE') >= 1
           and jsonb_path_exists(c.nameplate, '$.fields[*] ? (@.key == "model" && @.confirmed == true)')
           and jsonb_path_exists(c.nameplate, '$.fields[*] ? (@.key == "serial" && @.confirmed == true)')
         from "PartClaim" c where c."workOrderId"=${id}`) === "t"
      ? pass("รูปป้ายที่ถ่ายใหม่ขึ้นเป็นไฟล์ป้ายรุ่นล่าสุดของงาน ผูกกับใบเคลม + รุ่นกับ Serial ยืนยันแล้วทีละช่อง (ฐานข้อมูล)")
      : fail("รูปป้ายไม่ผูกกับใบเคลม หรือรุ่น/Serial ไม่ได้ยืนยัน");
    sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and "sparePartId"=${sp} and role like 'CLAIM_%'`) === "4"
      ? pass("หลักฐาน 4 ไฟล์ขึ้นไปผูกกับอะไหล่ที่เคลม (ข้อ ⑥ แนบในฟอร์มผูกชิ้นที่กรอก · ฐานข้อมูล)")
      : fail("หลักฐานในฐานข้อมูลไม่ครบ");
    (await vis(page, "เคลมอะไหล่เก่า").count()) > 0 && (await label(page, "ตีกลับให้ช่างแก้").count()) === 0 &&
      (await vis(page, "ปุ่มตีกลับให้ช่างแก้", false).count()) === 0 && (await vis(page, "ตีกลับให้ช่างแก้").count()) === 0
      ? pass("แอดมินทั่วไปเห็นใบเคลม แต่ไม่มีปุ่มตรวจ")
      : fail("แอดมินทั่วไปมีปุ่มตรวจเคลม");
    await page.close();

    // ── Admin Spare Part ตีกลับ ──
    page = await open(`ZCWP${suf}`);
    // คำขอตัดสินที่หน้านี้ส่งจริง — ข้อความเตือนขึ้นตั้งแต่กด ✗ ตีกลับ (ก่อนกดส่ง) และเซิร์ฟเวอร์ก็ไม่รับตีกลับเปล่า
    // ดูแค่ข้อความ + สถานะใบจะผ่านแม้ปุ่มส่งยิงคำขอออกไป ต้องนับว่าไม่มีคำขอออกจากหน้าจอเลย
    const reviewPosts = [];
    page.on("request", (r) => { if (r.method() === "POST" && /\/claim-review$/.test(r.url())) reviewPosts.push(r.postData() ?? ""); });
    // ดูได้อย่างเดียว — ปุ่มแก้ใบงานทุกอย่างหายไป เหลือแค่ปุ่มตรวจเคลม
    // หน้าตรวจเคลม (ก้อน 2) พับเนื้อใบงานไว้ด้วย display:none — นับปุ่มตอนพับอยู่ได้ 0 เสมอแม้สิทธิ์พัง
    // จึงกาง "ดูรายละเอียดใบงาน ▸" ก่อน (ยืนยันว่ากางจริงจากการ์ดขั้นตอนงาน) แล้วค่อยนับ แล้วพับกลับ
    await vis(page, "ดูรายละเอียดใบงาน ▸").first().click().catch(() => {});
    await page.waitForTimeout(800);
    const expanded = (await label(page, "ขั้นตอนงาน").count()) > 0;
    const gone = [];
    for (const t of ["ปิดงานย้อนหลัง (กรอกทุกขั้น)", "ลบใบงานถาวร", "แก้ไขอาการ/สถานะ", "เพิ่มใบงาน"]) if ((await vis(page, t).count()) > 0) gone.push(t);
    expanded && gone.length === 0
      ? pass("Admin Spare Part: กางรายละเอียดใบงานแล้วก็ไม่มีปุ่มแก้ใบงาน/เปิดใบงาน")
      : fail(expanded ? `Admin Spare Part ยังเห็นปุ่ม ${gone.join(", ")}` : "กางรายละเอียดใบงานไม่ได้ — นับปุ่มแก้ใบงานไม่ได้");
    await vis(page, "ซ่อนรายละเอียดใบงาน ▾").first().click().catch(() => {});
    await page.waitForTimeout(500);
    // หน้าตรวจเคลม (เคลมก้อน 2): หลักฐานของแถวตามที่เซิร์ฟเวอร์ตัดสิน · ข้อเช็คตาม Error อยู่ในชิ้น (✓ ทำ / ✗ ไม่ได้ทำ)
    await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().scrollIntoViewIfNeeded();
    (await vis(page, "หลักฐานรอบนี้:").count()) > 0 ? pass("Admin Spare Part เห็นหลักฐานรอบนี้ของชิ้นนั้น") : fail("ไม่เห็นหลักฐาน");
    (await vis(page, "2402600330").count()) > 0 && (await vis(page, "เช็คตาม Error E dL / E dL1 / E dL2 (ไม่บังคับ · ไม่พิมพ์ลงใบเคลม)").count()) > 0
      ? pass("Admin Spare Part เห็นข้อมูลป้ายรุ่น (Serial) และผลเช็คตาม Error ในหน้าตรวจเคลม") : fail("หน้าตรวจเคลมไม่มีข้อมูลเครื่อง/ข้อเช็คตาม Error");
    // ยืนยันทีละช่อง (เคลมก้อน 5): ป้ายที่มาบอกว่าช่างกดยืนยันแล้ว — ไม่ใช่คำของใบเก่า "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว"
    (await label(page, "เปิดรูปป้ายรุ่นเต็ม").count()) > 0 && (await vis(page, /ช่างยืนยันแล้ว|ช่างกดยืนยันรุ่นแล้ว/).count()) > 0 &&
      (await vis(page, "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว").count()) === 0
      ? pass("Admin Spare Part เห็นรูปป้ายเต็มที่ระบบอ่านค่ามา + ช่างยืนยันทีละช่องแล้ว") : fail("หน้าตรวจเคลมไม่มีรูปป้ายเต็ม/สถานะยืนยัน");
    await page.getByLabel("ข้อมูลเครื่องในใบเคลม").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-1b-review-machine.png") });
    await page.screenshot({ path: path.join(DIR, "claim-2-review.png"), fullPage: true });
    // ตัดสินทีละชิ้น: "✗ ตีกลับ" ของชิ้นนี้ → กล่องติ๊กช่องที่ต้องแก้ขึ้นเหนือแถบ (เคลมก้อน 4)
    // พิมพ์เหตุผลอย่างเดียวไม่พอ — ต้องติ๊กช่อง ช่างจะได้รู้ว่าแก้ตรงไหน และรู้ว่าต้องกลับไปร้านไหม
    await vis(page, "✗ ตีกลับ").first().click();
    await page.waitForTimeout(500);
    await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").first().click();
    await page.waitForTimeout(800);
    (await vis(page, "ยังไม่ได้ติ๊กช่องที่ต้องแก้ — ช่างจะไม่รู้ว่าต้องแก้อะไร", false).count()) > 0 &&
      reviewPosts.length === 0 && sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW"
      ? pass("ตีกลับโดยไม่ติ๊กช่องที่ต้องแก้ หน้าจอเตือนและไม่ส่ง (ไม่มีคำขอตัดสินออกจากหน้าจอ · ฐานข้อมูลยังรอตรวจ)")
      : fail(`ตีกลับเปล่าได้: คำขอ ${reviewPosts.length} · ใบ ${sql(`select status from "WorkOrder" where id=${id}`)}`);
    await label(page, "เหตุผลที่ตีกลับเคลม").fill("วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่");
    await page.waitForTimeout(400);
    (await vis(page, "ตีกลับให้ช่างแก้ (1 ชิ้น)").count()) === 0 && (await vis(page, "ตัดสินให้ครบทุกชิ้นก่อน").count()) > 0 && reviewPosts.length === 0
      ? pass("พิมพ์เหตุผลอย่างเดียวยังส่งไม่ได้ (ปุ่มยังเป็น \"ตัดสินให้ครบทุกชิ้นก่อน\")")
      : fail("ตีกลับด้วยเหตุผลอย่างเดียว ไม่ติ๊กช่อง ส่งได้");
    await label(page, "ช่องที่ต้องแก้ วิดีโอการตรวจเช็ค").click();
    await page.waitForTimeout(400);
    (await vis(page, "ช่างจะเห็นว่า: ต้องกลับไปถ่ายที่หน้าเครื่อง").count()) > 0
      ? pass("ติ๊ก \"วิดีโอการตรวจเช็ค\" แล้วบอกล่วงหน้า \"ช่างจะเห็นว่า: ต้องกลับไปถ่ายที่หน้าเครื่อง\"")
      : fail("ไม่บอกว่าช่างต้องกลับไปหน้าเครื่องไหม");
    await vis(page, "ตีกลับให้ช่างแก้ (1 ชิ้น)").first().click();
    await page.waitForTimeout(3000);
    sql(`select status||'|'||(select array_to_string("reviewFlags",',') from "PartClaim" where "workOrderId"=${id} order by id desc limit 1) from "WorkOrder" where id=${id}`) === "IN_PROGRESS|CLAIM_CHECK_VIDEO"
      ? pass("ตีกลับแล้วใบงานกลับไปรอช่าง พร้อมช่องที่ต้องแก้ CLAIM_CHECK_VIDEO (ฐานข้อมูล)")
      : fail("ตีกลับไม่สำเร็จ");
    await page.close();

    // ── ช่างเห็นเหตุผล ปิดใหม่ (แนบใหม่เฉพาะวิดีโอที่โดนตีกลับ) ──
    page = await open("A001");
    (await vis(page, "วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่").count()) > 0 ? pass("ช่างเห็นเหตุผลที่ถูกตีกลับบนใบงาน") : fail("ไม่เห็นเหตุผลตีกลับ");
    // ผลปิดงานรอบที่ถูกตีกลับยังอยู่ พร้อม remark เหตุผล (ไม่ใช่หายทั้งการ์ด)
    (await vis(page, "ผลการทำงานรอบที่ถูกตีกลับ").count()) > 0 &&
      (await vis(page, "Remark: ตีกลับเพราะ วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่", false).count()) > 0 &&
      (await vis(page, "เปลี่ยนบอร์ด ทดสอบแล้วปกติ").count()) > 0
      ? pass("ตีกลับแล้วยังเห็นผลการทำงานรอบเดิม พร้อม Remark เหตุผลที่ตีกลับ")
      : fail("ผลการทำงานรอบเดิมหายหลังตีกลับ");
    await vis(page, "ปิดงาน").first().click();
    await page.waitForTimeout(1500);
    // ฟอร์มแก้เคลม (เคลมก้อน 4): ขึ้นเฉพาะช่องที่ถูกชี้ · ที่เหลือพับไว้ แก้ได้ถ้าจำเป็น
    const fixList = (await page.getByLabel("ช่องที่ต้องแก้", { exact: true }).locator("visible=true").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    fixList.includes("ต้องแก้ (1)") && fixList.includes("· วิดีโอการตรวจเช็ค") && fixList.includes("ยังไม่ได้แก้ — ต้องแนบใหม่") &&
      (await vis(page, "▸ ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)").count()) === 1 &&
      (await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").count()) === 0
      ? pass("ฟอร์มแก้เคลม: \"ต้องแก้ (1)\" เฉพาะวิดีโอการตรวจเช็คที่ถูกชี้ · ส่วนที่ไม่ต้องแก้พับไว้")
      : fail(`ฟอร์มแก้เคลม: "${fixList.slice(0, 300)}"`);
    await vis(page, "▸ ส่วนที่ไม่ต้องแก้ (พับไว้ แก้ได้ถ้าจำเป็น)").first().click();
    await page.waitForTimeout(1200);
    const summary = page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last();
    (await summary.inputValue()) === "เปลี่ยนบอร์ด ทดสอบแล้วปกติ" &&
      (await vis(page, "ช่างสมชาย", false).count()) > 0 &&
      (await label(page, `อาการ/สาเหตุ ${spCode}`).inputValue()) === "ประตูล็อกไม่ลง ขึ้น Error dL" &&
      (await label(page, `รหัสอะไหล่ตัวที่เสีย ${spCode}`).inputValue()) === spCode &&
      (await vis(page, "รูปอะไหล่เก่า — แนบไว้แล้ว").count()) > 0
      ? pass("ปิดใหม่: รหัสตัวที่เสีย สรุปงาน ผู้เข้าปฏิบัติงาน อะไหล่ ข้อความเคลม และหลักฐานเดิมมาให้ ไม่ต้องกรอกซ้ำ")
      : fail(`ปิดใหม่ต้องกรอกใหม่: สรุป="${await summary.inputValue()}"`);
    await summary.fill("ถ่ายวิดีโอใหม่ เห็นมิเตอร์");
    await attach(page, `แนบวิดีโอการตรวจเช็ค ${spCode}`, CLIP);
    await vis(page, "✓ แนบใหม่แล้ว — แทนไฟล์เดิม").first().waitFor({ timeout: 30000 }).catch(() => {});
    (await vis(page, "✓ แนบใหม่แล้ว — แทนไฟล์เดิม").count()) > 0 && (await vis(page, "ส่งเคลมใหม่").count()) > 0
      ? pass("แนบวิดีโอใหม่: ช่องที่ถูกชี้ขึ้น \"✓ แนบใหม่แล้ว — แทนไฟล์เดิม\" · ปุ่มล่าง \"ส่งเคลมใหม่\"")
      : fail("แนบวิดีโอใหม่แล้วช่องที่ถูกชี้ยังไม่ผ่าน");
    await vis(page, "ส่งเคลมใหม่").last().click();
    await page.waitForTimeout(5000);
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" ? pass("ปิดใหม่แล้วไปรอตรวจอีกรอบ") : fail("ปิดใหม่ไม่สำเร็จ");
    await page.close();

    // ── อนุมัติ ──
    page = await open(`ZCWP${suf}`);
    // ✓ ผ่าน → ปุ่มส่งเปลี่ยนเป็น "อนุมัติเคลม · ปิดงาน" → ถามยืนยันก่อน (ใบงานจะปิด) → "ยืนยันอนุมัติ"
    await vis(page, "✓ ผ่าน").first().click();
    await page.waitForTimeout(500);
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().click();
    await vis(page, "อนุมัติ 1 ชิ้น ใบงานจะปิด").first().waitFor({ timeout: 10000 }).catch(() => {});
    (await vis(page, "อนุมัติ 1 ชิ้น ใบงานจะปิด").count()) > 0 && sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW"
      ? pass("กดอนุมัติแล้วถามยืนยัน \"อนุมัติ 1 ชิ้น ใบงานจะปิด\" ก่อนส่ง (ฐานข้อมูลยังรอตรวจ)")
      : fail("อนุมัติไม่ถามยืนยัน หรือส่งไปก่อนยืนยัน");
    await vis(page, "ยืนยันอนุมัติ").first().click();
    await page.waitForTimeout(3000);
    sql(`select w.status||'|'||string_agg(c.status,',' order by c.id) from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id} group by w.status`) === "DONE|REJECTED,APPROVED"
      ? pass("อนุมัติแล้วใบงานปิด ใบเคลมรอบแรกตีกลับ รอบสองอนุมัติ (ฐานข้อมูล)")
      : fail("หลังอนุมัติ");
    (await vis(page, "ปิดงานแล้ว").count()) > 0 && (await vis(page, "อนุมัติแล้ว").count()) > 0 &&
      (await vis(page, "✓ อนุมัติเคลมแล้ว · ปิดงาน").count()) > 0
      ? pass("หน้าจอขึ้นปิดงานแล้ว · สรุป \"✓ อนุมัติเคลมแล้ว · ปิดงาน\" · ใบเคลมอนุมัติแล้ว")
      : fail("หน้าจอไม่อัปเดตหลังอนุมัติ");
    await page.screenshot({ path: path.join(DIR, "claim-3-done.png"), fullPage: true });
  } catch (e) {
    fail(String(e));
  } finally {
    if (orig && orig !== id) {
      sql(`select status||'|'||"updatedAt" from "WorkOrder" where id=${orig}`) === before
        ? pass("ใบจริงไม่ถูกแตะตลอดการทดสอบ (ฐานข้อมูล)")
        : fail("ใบจริงเปลี่ยนระหว่างทดสอบ");
      await call(A, "DELETE", `/work-orders/${orig}`);
    }
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "User" where "employeeCode"='ZCWP${suf}';
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
