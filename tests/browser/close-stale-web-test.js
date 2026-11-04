// ทดสอบ: ปิดงานแล้วหน้าใบงานต้องไม่ย้อนกลับเป็น "ยังไม่ปิด" (บั๊กที่เจ้าของงานเจอ 4 พ.ย. 69 — "ขึ้นว่าสำเร็จ แต่ใบยังค้าง ปิดซ้ำถึงได้")
//   ไฟล์เคลมในฟอร์มปิดงานขึ้นใบงานทันทีที่เลือก แล้วฟอร์มโหลดใบเงียบ ๆ — กดส่งตอนคำถามนั้นยังไม่กลับ
//   คำตอบที่อ่านก่อนปิดมาถึงทีหลังแล้วทับใบที่ปิดแล้ว (บนเครื่องจริงเกิดบางครั้ง: ฐานข้อมูลอยู่ไกล · connection จำกัด 5)
//   ที่นี่บังคับให้เกิดทุกครั้ง: ดักคำถามใบงานที่ออกไปหลังแนบรูปอะไหล่เก่า ให้เซิร์ฟเวอร์ตอบทันที (ข้อมูลก่อนปิด)
//   แต่กักคำตอบไว้จนปิดงานเสร็จและจอขึ้นว่าปิดแล้ว แล้วค่อยปล่อยให้ถึงหน้าจอ
//   1) คำตอบที่กักไว้เป็นของก่อนปิดจริง (สถานะเข้างาน) — ไม่งั้นเทสต์ไม่ได้ทดสอบอะไร
//   2) ปล่อยแล้วหน้าใบงานยังเป็นปิดงานแล้ว ไม่มีปุ่ม "ปิดงาน" กลับมา · ฐานข้อมูล DONE
//   (เคลมเลิกก่อนส่ง — ปิดแบบไม่เคลม เทสต์นี้ดูแค่ลำดับคำตอบ ไม่ใช่กติกาเคลม)
// รันกับแอปที่พอร์ตอื่นได้ด้วย APP_URL (ค่าเริ่ม http://localhost:8081) · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const API = "http://localhost:4000/api";
const APP = process.env.APP_URL || "http://localhost:8081";
const LAT = 8.0863;
const LNG = 98.9063;

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
const waitFor = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return fn();
};

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const suf = String(Date.now()).slice(-5);
  const bc = `DZSL${suf}`;
  const team = "กระบี่";
  const TECH = `ZSTL${suf}`;
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  let id = null;
  let today = null;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");

  try {
    // ── เตรียม: สาขาแฟรนไชส์เปิดมา 5 ปี (หมดประกัน — เคลมเป็นช่องติ๊ก) · ใบซ่อมหนึ่งชิ้น · ช่างของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('${TECH}','ช่างสมชาย ทดสอบใบค้าง','EMPLOYEE','${hash}',false,'${team}')`);
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt",latitude,longitude) values ('สาขาทดสอบใบค้าง','${bc}','ใต้','${team}','FRANCHISE',now()-interval '5 years',${LAT},${LNG})`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,model,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch','HL055L',now())`);
    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "HL055L", symptom: "ประตูล็อกไม่ลง" }],
    });
    id = wo.orders ? wo.orders[0].id : wo.id;
    if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
    const sp = fxPart(id, "BOARD");
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: [{ sparePartId: sp, quantity: 1 }] });
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94" }] });
    await call(A, "POST", `/work-orders/${id}/quote`, { skip: true, note: "บริษัทออกให้ (เทสต์)" });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CS${suf}` }],
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    { const st = sql(`select status from "WorkOrder" where id=${id}`); if (st !== "IN_PROGRESS") throw new Error(`เตรียมใบไม่ถึงขั้นเข้างาน (${st})`); }
    sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${id}`);
    // ป้ายรุ่น · ก่อนซ่อม · หลังซ่อม · ใบเหลือง แนบทาง API — ฟอร์มเหลือแค่สรุปงาน (เทสต์นี้ไม่ได้ดูกติกาไฟล์ปิดงาน)
    for (const role of ["NAMEPLATE", "BEFORE", "AFTER", "REQUISITION"]) {
      const f = new FormData();
      f.append("file", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "p.png");
      f.append("role", role);
      await call(A, "POST", `/work-orders/${id}/attachments`, f);
    }
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    // ช่างของชุดนี้อยู่ในแผนทีมวันนี้ — ช่องผู้เข้าปฏิบัติงานขึ้นเอง ไม่ต้องเลือกในเทสต์
    const techId = Number(sql(`select id from "User" where "employeeCode"='${TECH}'`));
    today = sql(`select to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD')`);
    await call(A, "PUT", "/plans", { date: today, team, memberIds: [techId] });
    const pcode = sql(`select "partCode" from "SparePart" where id=${sp}`);

    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, geolocation: { latitude: LAT, longitude: LNG }, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const cardOf = (c) => page.locator(`[aria-label="งาน ${c}"]`).locator("visible=true").first();
    const claimFiles = () => sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role like 'CLAIM_%'`);

    /**
     * ดักเฉพาะ GET ตัวใบ (/work-orders/:id ไม่ใช่ /version · /attachments) ที่ออกไประหว่าง hold
     * route.fetch() = ให้เซิร์ฟเวอร์ตอบตอนนี้ (อ่านก่อนปิด) · fulfill ทีหลัง = คำตอบถึงหน้าจอช้า เหมือนเน็ต/ฐานข้อมูลช้าบนเครื่องจริง
     */
    let hold = false;
    let release;
    const released = new Promise((r) => (release = r));
    const held = [];
    await page.route(new RegExp(`/api/work-orders/${id}(\\?.*)?$`), async (route) => {
      if (!hold || route.request().method() !== "GET") return route.continue();
      const resp = await route.fetch();
      const body = await resp.json().catch(() => null);
      held.push(body?.status ?? "?");
      await released;
      await route.fulfill({ response: resp });
    });

    await page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(TECH);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await cardOf(code).waitFor({ timeout: 15000 }).catch(() => {});
    await cardOf(code).locator('[aria-label="ถึงหน้างาน"]').first().click();
    await waitFor(() => sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='ARRIVED'`) === "1", 20000);
    await page.waitForTimeout(2500);
    await cardOf(code).locator('[aria-label="ปิดงาน"]').first().click();
    await page.waitForTimeout(4000);
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ");

    // ── ติ๊กเคลม แล้วแนบรูปอะไหล่เก่า (ขึ้นใบงานทันที) → ฟอร์มโหลดใบเงียบ ๆ — คำถามนั้นถูกกักไว้ ──
    await byLabel(`ส่งอะไหล่เก่าเคลม ${pcode}`).first().click();
    await page.waitForTimeout(1200);
    await page.locator('[aria-label="ขั้นปิดงาน"]').locator('[aria-label^="ขั้น 3 "]').locator("visible=true").first().click();
    await page.waitForTimeout(900);
    hold = true;
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      byLabel(`แนบรูปอะไหล่เก่า ${pcode}`).first().click(),
    ]);
    await chooser.setFiles(PHOTO);
    await waitFor(() => claimFiles() === "1", 30000);
    for (let i = 0; i < 60 && !held.length; i++) await page.waitForTimeout(250);
    hold = false;
    held.length > 0 && held[0] === "IN_PROGRESS"
      ? pass(`แนบรูปอะไหล่เก่าแล้วฟอร์มโหลดใบเงียบ ๆ — กักคำตอบไว้ได้ ${held.length} คำถาม เป็นของก่อนปิด (เข้างาน)`)
      : fail(`ไม่มีคำถามใบงานให้กักหลังแนบรูปเคลม หรือไม่ใช่ของก่อนปิด: ${JSON.stringify(held)}`);

    // เลิกเคลม (มีรูปแล้ว = ถามก่อน) — ปิดแบบไม่เคลม
    await byLabel(`เลิกเคลม ${pcode}`).first().click();
    await page.waitForTimeout(800);
    await vis("เลิกเคลม").last().click();
    await waitFor(() => claimFiles() === "0", 15000);
    await page.waitForTimeout(1500);

    if (process.env.TRACE) {
      const t0 = Date.now();
      const short = (u) => u.replace(/.*\/api/, "");
      page.on("request", (r) => /\/api\//.test(r.url()) && console.log("REQ", Date.now() - t0, r.method(), short(r.url())));
      page.on("requestfinished", (r) => /\/api\//.test(r.url()) && console.log("END", Date.now() - t0, r.method(), short(r.url())));
    }
    // ── กดปิดงาน — รอคำตอบปิดงานจริงแล้วให้จอวาดเสร็จ ค่อยปล่อยคำตอบเก่า ──
    const save = vis("ยืนยันปิดงาน").last();
    if (!(await save.count())) {
      await page.screenshot({ path: path.join(DIR, "close-stale-form.png"), fullPage: true });
      const box = page.getByText(/^ยังขาด:/).locator("visible=true");
      throw new Error(`ไม่มีปุ่มยืนยันปิดงาน — ${(await box.count()) ? await box.last().innerText() : "ไม่มีกล่องยังขาด"}`);
    }
    const [closeRes] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && new RegExp(`/work-orders/${id}/close$`).test(r.url()), { timeout: 60000 }),
      save.click(),
    ]);
    await page.waitForTimeout(2500);
    /**
     * ป้ายสถานะของใบบนหน้าใบงาน — ไม่นับปุ่ม "ปิดงาน" เพราะการ์ดในหน้างานของฉันใต้หน้าต่างใบงานก็มีปุ่มชื่อเดียวกัน
     * ยังไม่ปิด = "ช่าง · เข้างาน/ปิดงาน" · ปิดแล้ว = แถบ/ป้าย "ปิดงานแล้ว"
     */
    const state = async () => ({
      open: await page.getByText("ช่าง · เข้างาน/ปิดงาน", { exact: true }).locator("visible=true").count(),
      done: await page.getByText("ปิดงานแล้ว", { exact: true }).locator("visible=true").count(),
    });
    const before = await state();
    if (process.env.TRACE) await page.screenshot({ path: path.join(DIR, "close-stale-before.png"), fullPage: true });
    release();
    await page.waitForTimeout(3000);
    const db = sql(`select status from "WorkOrder" where id=${id}`);
    const after = await state();
    await page.screenshot({ path: path.join(DIR, "close-stale.png"), fullPage: true });
    before.done > 0 && before.open === 0
      ? pass("ปิดงานสำเร็จ: ก่อนคำตอบเก่ามาถึง หน้าใบงานขึ้น \"ปิดงานแล้ว\" (ใช้ก้อนที่ปิดงานส่งกลับ)")
      : fail(`ก่อนปล่อยคำตอบเก่า: ป้ายปิดแล้ว=${before.done} · ป้ายเข้างาน=${before.open}`);
    closeRes.status() === 200 && db === "DONE" && after.done > 0 && after.open === 0
      ? pass("คำตอบเก่ามาถึงหลังปิดงาน: หน้าใบงานยังเป็น \"ปิดงานแล้ว\" ไม่ย้อนกลับเป็นเข้างาน/ปิดงาน (ฐานข้อมูล DONE)")
      : fail(`หลังคำตอบเก่ามาถึง: ปิดงานตอบ ${closeRes.status()} · ฐานข้อมูล ${db} · ป้ายปิดแล้ว=${after.done} · ป้ายเข้างาน=${after.open}`);
    await ctx.close();
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    // กดถึงหน้างานสร้างแถวเช็คอินผูกทั้งสาขาและช่าง — ไม่ลบก่อน ลบสาขา/ผู้ใช้ไม่ได้ (FK)
    sql(`delete from "BranchCheckIn" where "branchId" in (select id from "Branch" where code='${bc}') or "userId" in (select id from "User" where "employeeCode"='${TECH}');
         delete from "TeamDayPlan" where team='${team}' and date='${today ?? "1900-01-01"}';
         delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "User" where "employeeCode"='${TECH}';
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    const left = sql(`select count(*) from "WorkOrder" where id=${id ?? 0}`) +
      sql(`select count(*) from "User" where "employeeCode"='${TECH}'`) + sql(`select count(*) from "Branch" where code='${bc}'`);
    left === "000" ? pass("ลบใบทดสอบ สาขา เครื่อง ผู้ใช้ แผนทีมที่สร้าง และคืนภาคของ S001 แล้ว (ฐานข้อมูล)") : fail(`ของทดสอบยังค้าง ${left}`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
