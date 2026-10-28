// ทดสอบ: เคลมอะไหล่เก่าผ่านหน้าจอจริง บนใบทดสอบที่คัดลอกจากใบจริง (ใบจริงต้องไม่ถูกแตะ) · Admin Spare Part ดูใบงานได้อย่างเดียว
//        · ปุ่มปิดงานกดไม่ได้จนกว่าจะครบ · ใบงานไปรอตรวจเคลม · แอดมินทั่วไปไม่มีปุ่มตรวจ
//        · Admin Spare Part ตีกลับ → ช่างเห็นเหตุผล ปิดใหม่ได้โดยไม่ต้องแนบซ้ำ → อนุมัติ → ปิดงาน
// ยืนยันผลที่ฐานข้อมูลทุกขั้น ไม่เชื่อข้อความบนจออย่างเดียว
const { chromium } = require("playwright");
const { execSync } = require("child_process");
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
    const sp = sql(`select id from "SparePart" where "partCode"='SP-BOARD'`);
    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "HL055L", symptom: "ประตูล็อกไม่ลง" }],
    });
    id = wo.orders ? wo.orders[0].id : wo.id;
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: [{ sparePartId: Number(sp), quantity: 1 }] });
    // เช็คอะไหล่ → นัด → คอนเฟิร์ม → เบิก (นัดลูกค้าก่อนเบิก ต.ค. 69)
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, {
      results: [{ sparePartId: Number(sp), inStock: true, warehouse: "คลังลาดพร้าว 94" }],
    });
    await call(S, "POST", `/work-orders/${id}/assign`, { team: "กระบี่", scheduledAt: "2026-11-10" });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: [{ sparePartId: Number(sp), inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CW${suf}` }],
    });
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
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").fill("เปลี่ยนบอร์ด ทดสอบแล้วปกติ");
    await label(page, "ผู้เข้าปฏิบัติงานคนที่ 1").click();
    await page.waitForTimeout(500);
    await vis(page, "ช่างสมชาย", false).last().click();
    await page.waitForTimeout(500);
    // อะไหล่ที่เบิกไว้ (SP-BOARD) ถูกเติมเป็นอะไหล่ที่ใช้ไปให้แล้ว — ช่างไม่ต้องเพิ่มเอง กล่องเคลมจึงขึ้นทันที
    (await label(page, "ส่งอะไหล่เก่าเคลม SP-BOARD").count()) > 0 && (await vis(page, "ยังขาด:", false).count()) > 0
      ? pass("อะไหล่ที่เบิกไว้เติมให้เอง · สาขาในประกัน: เปิดใบเคลมไว้ให้ และบอกว่ายังขาดอะไร")
      : fail("ไม่มีส่วนเคลมหรือไม่ได้เปิดไว้ให้");
    const saveBtn = vis(page, "ยืนยันปิดงาน").last();
    const dim = async () => saveBtn.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
    (await dim()) !== "1" ? pass("หลักฐานไม่ครบ ปุ่มยืนยันปิดงานกดไม่ได้") : fail("ปุ่มกดได้ทั้งที่ยังไม่ครบ");

    await label(page, "รหัสอะไหล่ตัวที่เสีย SP-BOARD").fill("SP-BOARD");
    await label(page, "อาการ/สาเหตุ SP-BOARD").fill("ประตูล็อกไม่ลง ขึ้น Error dL");
    await label(page, "สิ่งที่เข้าเช็ค SP-BOARD").fill("วัดไฟเข้าบอร์ด 220V ปกติ สลับบอร์ดแล้วหาย");
    await attach(page, "แนบรูปอะไหล่เก่า SP-BOARD", PHOTO);
    await attach(page, "แนบรูปอาการเสีย SP-BOARD", PHOTO);
    await attach(page, "แนบวิดีโอ Error code SP-BOARD", CLIP);
    await attach(page, "แนบวิดีโอการตรวจเช็ค SP-BOARD", CLIP);
    const items = await call(A, "GET", `/work-orders/${id}`).then((d) => d.claimTroubleshooting);
    for (const t of items) await label(page, `${t} SP-BOARD`).click();
    await page.waitForTimeout(500);

    // ── ข้อมูลเครื่องสำหรับเคลม: สแกนป้ายด้วยกล้อง (ทีละบรรทัด) + เช็คตามคู่มือ Error in Field ──
    (await label(page, "ข้อมูลเครื่องสำหรับเคลม").count()) > 0 && (await vis(page, "ยังขาด: ข้อมูลป้ายรุ่น", false).count()) > 0
      ? pass("เคลมแล้วขึ้นกล่องข้อมูลเครื่อง บอกว่ายังขาดข้อมูลป้ายรุ่น") : fail("ไม่มีกล่องข้อมูลเครื่องสำหรับเคลม");
    await attach(page, "ถ่ายรูปป้ายรุ่น", PLATE_PHOTO);
    // อ่านทั้งป้ายในเบราว์เซอร์ (หาบรรทัด → อ่านซ้ำทีละบรรทัด) — เครื่องทดสอบช้ากว่ามือถือจริง ให้เวลานาน
    await page.waitForTimeout(1500);
    await label(page, "สถานะอ่านป้าย").waitFor({ state: "detached", timeout: 180000 });
    const val = (f) => label(page, `ป้ายรุ่น ${f}`).inputValue();
    // MODEL: รุ่นเต็มในกรอบข้าง ๆ (HL055LWHPRXG6W0000 · เจ้าของงานขอ ต.ค. 69) อ่านได้ HLOSSL… → ตัวต้นแก้ตามทะเบียน HL055L
    // ส่วนท้ายอ่านเพี้ยนได้ (6 → E/S) ระบบติดธงให้ช่างตรวจ — เทสต์ดูตัวต้นที่แก้ตามทะเบียน + ความยาวเต็ม 18 ตัว
    const model = await val("รุ่น");
    /^HL055LWHPRXG/.test(model) && model.length === 18 && (await val("Serial")) === "2402600330" && (await vis(page, "อ่านจากรูป").count()) >= 2
      ? pass(`ถ่ายรูปทั้งป้ายรูปเดียว: ระบบเลือกรุ่นเต็ม ${model} (ตัวต้นแก้ตามทะเบียน HL055L) + Serial 2402600330 ติดป้าย "อ่านจากรูป"`)
      : fail(`ค่าที่อ่านจากรูป: รุ่น=${await val("รุ่น")} Serial=${await val("Serial")}`);
    // ตัวท้ายแต่ละรอบอ่านไม่ตรงกัน (6 อ่านเป็น E/S) — ต้องขึ้นกรอบเหลืองบอกว่าส่วนท้ายไม่มั่นใจ ไม่ใช่ปล่อยผ่านเงียบ ๆ
    (await vis(page, "ส่วนท้ายรุ่นเต็มอ่านได้ไม่ตรงกันทุกรอบ", false).count()) > 0
      ? pass("รุ่นเต็มที่ตัวท้ายอ่านไม่ตรงกันทุกรอบ ขึ้นเตือนให้ช่างดูกับรูป") : fail("รุ่นเต็มไม่ขึ้นเตือนทั้งที่ตัวท้ายไม่แน่นอน");
    (await label(page, "รูปป้ายรุ่นเต็ม").count()) > 0 && (await vis(page, "ยังขาด:", false).first().innerText()).includes("ติ๊กตรวจค่ากับรูปป้าย")
      ? pass("โชว์รูปป้ายเต็มในฟอร์ม · ยังต้องติ๊กตรวจค่ากับรูป") : fail("ไม่มีรูปป้ายเต็ม/ไม่บังคับตรวจกับรูป");
    await label(page, "ข้อมูลเครื่องสำหรับเคลม").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-0a-scanner.png") });
    await label(page, "ตรวจค่ากับรูปป้ายแล้ว").click();
    await page.waitForTimeout(300);
    await label(page, "ข้อมูลเครื่องสำหรับเคลม").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-0-scanned.png") });
    await label(page, "Error ที่เครื่องขึ้น").click();
    await page.waitForTimeout(400);
    await vis(page, "E dL / E dL1 / E dL2 · Door Lock — ประตูล็อก/ปลดล็อก").last().click();
    await page.waitForTimeout(300);
    await label(page, "เช็คแล้ว Solenoid ไม่ฝืด").click();
    (await vis(page, "การติดตั้งฐานเครื่อง", false).count()) === 0
      ? pass("ไม่มีเช็คลิสต์การติดตั้งฐานเครื่องในฟอร์มแล้ว")
      : fail("ยังมีเช็คลิสต์การติดตั้งฐานเครื่อง");
    await page.waitForTimeout(500);
    await label(page, "Error ที่เครื่องขึ้น").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-0b-check.png") });
    (await vis(page, "ยังขาด:", false).count()) === 0 ? pass("ครบทุกข้อ ข้อความยังขาดหายไป") : fail(`ยังขึ้นว่าขาด: ${await vis(page, "ยังขาด:", false).first().innerText()}`);
    await page.screenshot({ path: path.join(DIR, "claim-1-close.png") });

    /**
     * หลอดสถานะตอนส่งไฟล์ + กดใหม่ไม่ส่งซ้ำ (WO-00133 — ไฟล์ซ้ำจนเต็มเพดานแล้วปิดงานไม่ได้)
     * บีบเน็ตขาขึ้นให้ช้าพอจะเห็นหลอด · คำสั่งปิดรอบแรกให้ล้มหลังไฟล์ขึ้นครบ แล้วกดใหม่
     * ต้องไม่มีไฟล์เพิ่ม — นับที่ฐานข้อมูล ไม่ใช่ดูจากหน้าจอ
     */
    const filesBefore = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 60 * 1024 });
    let failOnce = true;
    await page.route(`**/api/work-orders/${id}/close`, (route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "ทดสอบ: ปิดไม่ผ่านรอบแรก" }) });
    });
    await saveBtn.click();
    const bar = page.getByRole("progressbar").locator("visible=true");
    await bar.first().waitFor({ timeout: 15000 }).catch(() => {});
    if (await bar.count()) {
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(DIR, "claim-1b-progress.png") });
      const now = Number(await bar.first().getAttribute("aria-valuenow"));
      const text = await bar.first().innerText();
      /ไฟล์ \d+\/\d+/.test(text) && now >= 0 && now <= 100
        ? pass(`ส่งไฟล์ตอนปิดงานมีหลอดสถานะ (${text.replace(/\s+/g, " ")})`)
        : fail(`หลอดสถานะ: ${text} · ${now}`);
    } else fail("ไม่เห็นหลอดสถานะตอนส่งไฟล์");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await vis(page, "ทดสอบ: ปิดไม่ผ่านรอบแรก").waitFor({ timeout: 120000 });
    const filesSent = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    filesSent > filesBefore ? pass(`รอบแรกไฟล์ขึ้น ${filesSent - filesBefore} ไฟล์ แล้วคำสั่งปิดล้ม`) : fail("รอบแรกไม่มีไฟล์ขึ้น");
    await saveBtn.click();
    await page.waitForTimeout(6000);
    const filesAfter = Number(sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id}`));
    filesAfter === filesSent
      ? pass("กดปิดใหม่ไม่ส่งไฟล์ซ้ำ (จำนวนไฟล์ในฐานข้อมูลเท่าเดิม)")
      : fail(`ไฟล์ซ้ำ: รอบแรก ${filesSent} · หลังกดใหม่ ${filesAfter}`);

    sql(`select w.status||'|'||c."brokenPartCode" from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id}`) === "CLAIM_REVIEW|SP-BOARD"
      ? pass("ปิดงานแล้วใบงานไปรอตรวจเคลม พร้อมรหัสตัวที่เสียที่กรอก (ฐานข้อมูล)")
      : fail(`สถานะ ${sql(`select status from "WorkOrder" where id=${id}`)}`);
    const np = sql(`select (nameplate->'fields')::text||'|'||("fieldCheck"->>'errorCode')||'|'||("fieldCheck"->'checked')::text||'|'||("fieldCheck" ? 'install')::text from "PartClaim" where "workOrderId"=${id}`);
    const fields = JSON.parse(np.split("|")[0]);
    const f = (k) => fields.find((x) => x.key === k) ?? {};
    f("model").value === model && f("model").source === "SCAN" && f("serial").value === "2402600330" && f("serial").source === "SCAN" &&
      /^data:image\/jpeg/.test(f("serial").crop ?? "") && np.endsWith('|E dL / E dL1 / E dL2|["Solenoid ไม่ฝืด"]|false')
      ? pass(`ฐานข้อมูล: รุ่นเต็ม ${model} · Serial 2402600330 (อ่านจากรูป + ภาพบรรทัด) · Error E dL · ข้อที่เช็ค · ไม่มีคำตอบเรื่องติดตั้ง`)
      : fail(`ข้อมูลเครื่องในใบเคลม: ${np.slice(-200)} · ${fields.map((x) => `${x.key}=${x.value}/${x.source}`).join(",")}`);
    sql(`select (c.nameplate->>'photoId')::int = (select max(a.id) from "WorkOrderAttachment" a where a."workOrderId"=${id} and a.role='NAMEPLATE')
           and (select count(*) from "WorkOrderAttachment" a where a."workOrderId"=${id} and a.role='NAMEPLATE') >= 1
           and (c.nameplate->>'verified')::boolean from "PartClaim" c where c."workOrderId"=${id}`) === "t"
      ? pass("รูปป้ายเต็มที่ถ่ายขึ้นเป็นไฟล์ป้ายรุ่นของงาน และผูกกับใบเคลม + บันทึกว่าตรวจกับรูปแล้ว (ฐานข้อมูล)")
      : fail("รูปป้ายเต็มไม่ผูกกับใบเคลม");
    sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and "sparePartId"=${sp} and role like 'CLAIM_%'`) === "4"
      ? pass("หลักฐาน 4 ไฟล์ขึ้นไปผูกกับอะไหล่ที่เคลม (ฐานข้อมูล)")
      : fail("หลักฐานในฐานข้อมูลไม่ครบ");
    (await vis(page, "เคลมอะไหล่เก่า").count()) > 0 && (await label(page, "ตีกลับให้ช่างแก้").count()) === 0 &&
      (await vis(page, "ปุ่มตีกลับให้ช่างแก้", false).count()) === 0 && (await vis(page, "ตีกลับให้ช่างแก้").count()) === 0
      ? pass("แอดมินทั่วไปเห็นใบเคลม แต่ไม่มีปุ่มตรวจ")
      : fail("แอดมินทั่วไปมีปุ่มตรวจเคลม");
    await page.close();

    // ── Admin Spare Part ตีกลับ ──
    page = await open(`ZCWP${suf}`);
    // ดูได้อย่างเดียว — ปุ่มแก้ใบงานทุกอย่างหายไป เหลือแค่ปุ่มตรวจเคลม
    const gone = [];
    for (const t of ["ปิดงานย้อนหลัง (กรอกทุกขั้น)", "ลบใบงานถาวร", "แก้ไขอาการ/สถานะ", "เพิ่มใบงาน"]) if ((await vis(page, t).count()) > 0) gone.push(t);
    gone.length === 0 ? pass("Admin Spare Part: ไม่มีปุ่มแก้ใบงาน/เปิดใบงาน") : fail(`Admin Spare Part ยังเห็นปุ่ม ${gone.join(", ")}`);
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().scrollIntoViewIfNeeded();
    (await vis(page, "หลักฐาน (+ รูปป้ายรุ่นในผลการทำงาน)").count()) > 0 ? pass("Admin Spare Part เห็นหลักฐานของชิ้นนั้น") : fail("ไม่เห็นหลักฐาน");
    (await vis(page, "2402600330").count()) > 0 && (await vis(page, "เช็คตามคู่มือ Error in Field").count()) > 0
      ? pass("Admin Spare Part เห็นข้อมูลป้ายรุ่น (Serial) และผลเช็คตามคู่มือในการ์ดเคลม") : fail("การ์ดเคลมไม่มีข้อมูลเครื่อง");
    (await label(page, "เปิดรูปป้ายรุ่นเต็ม").count()) > 0 && (await vis(page, "ช่างติ๊กว่าตรวจค่ากับรูปแล้ว").count()) > 0
      ? pass("Admin Spare Part เห็นรูปป้ายเต็มที่ระบบอ่านค่ามา + ช่างตรวจกับรูปแล้ว") : fail("การ์ดเคลมไม่มีรูปป้ายเต็ม");
    await page.getByLabel("ข้อมูลเครื่องในใบเคลม").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(DIR, "claim-1b-review-machine.png") });
    await page.screenshot({ path: path.join(DIR, "claim-2-review.png"), fullPage: true });
    await vis(page, "ตีกลับให้ช่างแก้").first().click();
    await page.waitForTimeout(800);
    (await vis(page, "ตีกลับต้องบอกเหตุผล", false).count()) > 0 && sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW"
      ? pass("ตีกลับโดยไม่กรอกเหตุผล หน้าจอเตือนและไม่ส่ง")
      : fail("ตีกลับเปล่าได้");
    await label(page, "เหตุผลที่ตีกลับเคลม").fill("วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่");
    await vis(page, "ตีกลับให้ช่างแก้").first().click();
    await page.waitForTimeout(3000);
    sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS" ? pass("ตีกลับแล้วใบงานกลับไปรอช่าง (ฐานข้อมูล)") : fail("ตีกลับไม่สำเร็จ");
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
    const summary = page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last();
    (await summary.inputValue()) === "เปลี่ยนบอร์ด ทดสอบแล้วปกติ" &&
      (await vis(page, "ช่างสมชาย", false).count()) > 0 &&
      (await label(page, "อาการ/สาเหตุ SP-BOARD").inputValue()) === "ประตูล็อกไม่ลง ขึ้น Error dL" &&
      (await label(page, "รหัสอะไหล่ตัวที่เสีย SP-BOARD").inputValue()) === "SP-BOARD" &&
      (await vis(page, "รูปอะไหล่เก่า — แนบไว้แล้ว").count()) > 0
      ? pass("ปิดใหม่: รหัสตัวที่เสีย สรุปงาน ผู้เข้าปฏิบัติงาน อะไหล่ ข้อความเคลม และหลักฐานเดิมมาให้ ไม่ต้องกรอกซ้ำ")
      : fail(`ปิดใหม่ต้องกรอกใหม่: สรุป="${await summary.inputValue()}"`);
    await summary.fill("ถ่ายวิดีโอใหม่ เห็นมิเตอร์");
    await attach(page, "แนบวิดีโอการตรวจเช็ค SP-BOARD", CLIP);
    await vis(page, "ยืนยันปิดงาน").last().click();
    await page.waitForTimeout(5000);
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" ? pass("ปิดใหม่แล้วไปรอตรวจอีกรอบ") : fail("ปิดใหม่ไม่สำเร็จ");
    await page.close();

    // ── อนุมัติ ──
    page = await open(`ZCWP${suf}`);
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().click();
    await page.waitForTimeout(3000);
    sql(`select w.status||'|'||string_agg(c.status,',' order by c.id) from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id} group by w.status`) === "DONE|REJECTED,APPROVED"
      ? pass("อนุมัติแล้วใบงานปิด ใบเคลมรอบแรกตีกลับ รอบสองอนุมัติ (ฐานข้อมูล)")
      : fail("หลังอนุมัติ");
    (await vis(page, "ปิดงานแล้ว").count()) > 0 && (await vis(page, "อนุมัติแล้ว").count()) > 0
      ? pass("หน้าจอขึ้นปิดงานแล้ว และใบเคลมอนุมัติแล้ว")
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
