// ทดสอบ: แถบเลิกเคลมในฟอร์มปิดงาน (เจ้าของงานเลือก 3 พ.ย. 69) ผ่านหน้าจอจริง (จอมือถือ 360×780 · ช่างของชุดนี้เอง)
//   สาขาหมดประกัน — ฟอร์มปิดงานเป็นหน้าเดียว มีช่องติ๊ก "ส่งอะไหล่เก่าเคลม" ทีละชิ้น ติ๊กแล้วฟอร์มกลายเป็นทีละขั้นที่ขั้น 1
//   1) ติ๊กชิ้นแรก → แถบใต้แถบขั้น "ส่งเคลม {ชิ้น} · ติ๊กผิด?" + ปุ่ม "เลิกเคลม" (ขั้น 1 ไม่ต้องไปหาในขั้นเคลม)
//   2) ยังไม่ได้กรอกอะไรของเคลม → กด "เลิกเคลม" เลิกทันทีไม่ถาม · ไม่เหลือชิ้นที่เคลม → ฟอร์มกลับเป็นหน้าเดียว (ช่องติ๊กกลับมา ไม่มีแถบขั้น)
//   3) ติ๊กใหม่ + แนบรูปอะไหล่เก่าในขั้นเคลม (ขึ้นใบงานทันที — ฐานข้อมูล) → "เลิกเคลม" ถาม "เลิกเคลม {ชิ้น}?" ·
//      กด "ยกเลิก" = ยังเคลมอยู่ รูปยังอยู่ (ฐานข้อมูล) · กด "เลิกเคลม" = รูปของชิ้นนั้นถูกลบ (ฐานข้อมูล) ฟอร์มกลับเป็นหน้าเดียว
//   4) ติ๊กสองชิ้น → แถบมีสองแถว · เลิกชิ้นหนึ่ง ฟอร์มยังเป็นทีละขั้น (ยังมีอีกชิ้นที่เคลม) แถบเหลือแถวเดียว
//   5) ไม่มีการปิดงาน: ใบยังอยู่ขั้นช่าง ไม่มีแถวเคลม (ฐานข้อมูล) — แถบนี้ไม่ส่งอะไรไปเซิร์ฟเวอร์นอกจากลบไฟล์ที่ฟอร์มนี้แนบเอง
//   สาขาในประกันไม่มีแถบนี้ (เปิดเคลมให้เอง ไม่ใช่ติ๊กผิด · ไม่ส่งต้องเลือกเหตุผลในขั้นเคลม) — claim-close-steps-web-test.js ตรวจว่าไม่มีแถบ
// วันนัด 12 วันข้างหน้าตอนปล่อยงาน แล้วย้ายเป็นวันนี้ด้วย SQL · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const API = "http://localhost:4000/api";
const LAT = 8.0863;
const LNG = 98.9063;

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, url, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
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
  const bc = `DZCQ${suf}`;
  const team = "กระบี่";
  const TECH = `ZCQT${suf}`;
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const ids = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  const W = 360;
  const H = 780;

  try {
    // ── เตรียม: สาขาแฟรนไชส์เปิดมา 5 ปี (หมดประกันทุกยี่ห้อ) · เครื่องซัก Huebsch · ใบซ่อมสองชิ้น · ช่างของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('${TECH}','ช่างสมชาย ทดสอบเลิกเคลม','EMPLOYEE','${hash}',false,'${team}')`);
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt",latitude,longitude) values ('สาขาทดสอบเลิกเคลม','${bc}','ใต้','${team}','FRANCHISE',now()-interval '5 years',${LAT},${LNG})`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,model,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch','HL055L',now())`);

    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "HL055L", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id = wo.orders ? wo.orders[0].id : wo.id;
    if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
    ids.push(id);
    const sps = [fxPart(id, "BOARD"), fxPart(id, "BELT")];
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: sps.map((s) => ({ sparePartId: s, quantity: 1 })) });
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: sps.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
    // สาขาหมดประกันต้องผ่านขั้นเสนอราคาก่อนนัดวัน — ข้ามแบบ "บริษัทออกให้" (เทสต์นี้ดูแค่ฟอร์มปิดงาน)
    await call(A, "POST", `/work-orders/${id}/quote`, { skip: true, note: "บริษัทออกให้ (เทสต์)" });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: sps.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CQ${suf}` })),
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    { const st = sql(`select status from "WorkOrder" where id=${id}`); if (st !== "IN_PROGRESS") throw new Error(`เตรียมใบไม่ถึงขั้นเข้างาน (${st} · ${sql(`select string_agg(action, ',' order by id) from "WorkOrderLog" where "workOrderId"=${id}`)})`); }
    sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${id}`);
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    const [code1, code2] = sps.map((s) => sql(`select "partCode" from "SparePart" where id=${s}`));
    const [name1, name2] = sps.map((s) => sql(`select name from "SparePart" where id=${s}`));
    pass(`เตรียม ${code} สาขาหมดประกัน (แฟรนไชส์เปิด 5 ปี) · ${code1} · ${code2} ปล่อยงานแล้ว นัดวันนี้ (ฐานข้อมูล)`);

    const ctx = await browser.newContext({ viewport: { width: W, height: H }, geolocation: { latitude: LAT, longitude: LNG }, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(TECH);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
    await page.waitForTimeout(3500);

    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const cardOf = (c) => page.locator(`[aria-label="งาน ${c}"]`).locator("visible=true").first();
    const count = (q) => Number(sql(q));
    const stepper = () => page.locator('[aria-label="ขั้นปิดงาน"]').locator("visible=true");
    const tick = (c) => byLabel(`ส่งอะไหล่เก่าเคลม ${c}`).first();
    const barRow = (c) => byLabel(`แถบเลิกเคลม ${c}`);
    const quit = (c) => byLabel(`เลิกเคลม ${c}`).first();
    const claimFiles = (sp) =>
      count(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role like 'CLAIM_%' and "sparePartId"=${sp}`);

    await cardOf(code).waitFor({ timeout: 15000 }).catch(() => {});
    await cardOf(code).locator('[aria-label="ถึงหน้างาน"]').first().click();
    await waitFor(() => sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='ARRIVED'`) === "1", 20000);
    await page.waitForTimeout(2500);
    await cardOf(code).locator('[aria-label="ปิดงาน"]').first().click();
    await page.waitForTimeout(4000);

    // ── 0) สาขาหมดประกัน: ฟอร์มหน้าเดียว มีช่องติ๊ก ไม่มีแถบขั้น ไม่มีแถบเลิกเคลม ──
    (await tick(code1).count()) > 0 && (await tick(code2).count()) > 0 && (await stepper().count()) === 0 && (await barRow(code1).count()) === 0
      ? pass("สาขาหมดประกัน: ฟอร์มปิดงานหน้าเดียว มีช่องติ๊ก \"ส่งอะไหล่เก่าเคลม\" ทั้งสองชิ้น · ไม่มีแถบขั้น ไม่มีแถบเลิกเคลม")
      : fail(`ฟอร์มตั้งต้น: ติ๊ก=${await tick(code1).count()}/${await tick(code2).count()} แถบขั้น=${await stepper().count()} แถบเลิก=${await barRow(code1).count()}`);

    // ── 1) ติ๊กชิ้นแรก → ทีละขั้นที่ขั้น 1 + แถบเลิกเคลม ──
    await tick(code1).click();
    await page.waitForTimeout(1200);
    const row1 = (await barRow(code1).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const barBox = await barRow(code1).first().boundingBox();
    (await stepper().count()) > 0 && (await vis(/^ขั้น 1\/4 · งานที่ทำ/).count()) > 0 &&
      row1.includes(`ส่งเคลม ${name1} · ติ๊กผิด?`) && row1.includes("เลิกเคลม") && !!barBox && barBox.y >= 0 && barBox.y + barBox.height <= H
      ? pass(`ติ๊ก ${code1} → ฟอร์มทีละขั้นที่ขั้น 1 · แถบใต้แถบขั้น "ส่งเคลม ${name1} · ติ๊กผิด?" + ปุ่ม "เลิกเคลม" เห็นในจอโดยไม่ต้องเลื่อน`)
      : fail(`หลังติ๊ก: แถบขั้น=${await stepper().count()} แถว="${row1}" กรอบ=${JSON.stringify(barBox)}`);
    await page.screenshot({ path: path.join(DIR, "claim-quit-1-bar.png") });

    // ── 2) ยังไม่ได้กรอกอะไร → เลิกทันที กลับหน้าเดียว ──
    await quit(code1).click();
    await page.waitForTimeout(1000);
    (await vis(`เลิกเคลม ${name1}?`).count()) === 0 && (await stepper().count()) === 0 && (await tick(code1).count()) > 0 &&
      (await barRow(code1).count()) === 0
      ? pass("ยังไม่ได้กรอกอะไรของเคลม → \"เลิกเคลม\" เลิกทันทีไม่ถาม · ฟอร์มกลับเป็นหน้าเดียว (ช่องติ๊กกลับมา ไม่มีแถบขั้น)")
      : fail(`เลิกเคลมครั้งแรก: ถาม=${await vis(`เลิกเคลม ${name1}?`).count()} แถบขั้น=${await stepper().count()} ช่องติ๊ก=${await tick(code1).count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-quit-2-back.png") });

    // ── 3) ติ๊กใหม่ + แนบรูปอะไหล่เก่า → ถามก่อนเลิก ──
    await tick(code1).click();
    await page.waitForTimeout(1200);
    await page.locator('[aria-label="ขั้นปิดงาน"]').locator('[aria-label^="ขั้น 3 "]').locator("visible=true").first().click();
    await page.waitForTimeout(900);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      byLabel(`แนบรูปอะไหล่เก่า ${code1}`).first().click(),
    ]);
    await chooser.setFiles(PHOTO);
    await waitFor(() => claimFiles(sps[0]) === 1, 30000);
    await page.waitForTimeout(1500);
    claimFiles(sps[0]) === 1 ? pass(`แนบรูปอะไหล่เก่า ${code1} ในขั้นเคลม → ขึ้นใบงานทันที (ฐานข้อมูล 1 ไฟล์)`) : fail(`รูปอะไหล่เก่าไม่ขึ้นใบงาน (${claimFiles(sps[0])})`);
    await quit(code1).click();
    await page.waitForTimeout(800);
    const asked = (await vis(`เลิกเคลม ${name1}?`).count()) > 0 && (await vis("รูปและข้อมูลเคลมของชิ้นนี้ที่กรอกในฟอร์มนี้จะถูกลบ").count()) > 0;
    await page.screenshot({ path: path.join(DIR, "claim-quit-3-ask.png") });
    await vis("ยกเลิก").last().click();
    await page.waitForTimeout(800);
    asked && (await stepper().count()) > 0 && (await barRow(code1).count()) > 0 && claimFiles(sps[0]) === 1
      ? pass(`มีรูปแล้ว → "เลิกเคลม" ถาม "เลิกเคลม ${name1}?" (รูปและข้อมูลเคลมจะถูกลบ) · กด "ยกเลิก" = ยังเคลมอยู่ รูปยังอยู่ (ฐานข้อมูล)`)
      : fail(`ถามก่อนเลิก: ถาม=${asked} แถบขั้น=${await stepper().count()} ไฟล์=${claimFiles(sps[0])}`);
    await quit(code1).click();
    await page.waitForTimeout(800);
    await vis("เลิกเคลม").last().click();
    await waitFor(() => claimFiles(sps[0]) === 0, 15000);
    await page.waitForTimeout(1000);
    claimFiles(sps[0]) === 0 && (await stepper().count()) === 0 && (await tick(code1).count()) > 0
      ? pass("กด \"เลิกเคลม\" ในกล่องถาม → รูปอะไหล่เก่าของชิ้นนั้นถูกลบ (ฐานข้อมูล 0 ไฟล์) · ฟอร์มกลับเป็นหน้าเดียว")
      : fail(`ยืนยันเลิก: ไฟล์=${claimFiles(sps[0])} แถบขั้น=${await stepper().count()} ช่องติ๊ก=${await tick(code1).count()}`);

    // ── 4) สองชิ้น: เลิกชิ้นเดียว ฟอร์มยังเป็นทีละขั้น ──
    await tick(code1).click();
    await page.waitForTimeout(1200);
    // ชิ้นที่สองติ๊กในขั้นเคลม — ฟอร์มทีละขั้นไม่มีช่องติ๊กของหน้าเดียวแล้ว ชิ้นที่ยังไม่ส่งมีปุ่ม "ส่งเคลมชิ้นนี้" ในแท็บของมัน
    await page.locator('[aria-label="ขั้นปิดงาน"]').locator('[aria-label^="ขั้น 3 "]').locator("visible=true").first().click();
    await page.waitForTimeout(800);
    await page.locator(`[aria-label^="ชิ้น ${name2} "]`).locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(800);
    // ปุ่ม "ส่งเคลมชิ้นนี้" ในแท็บชิ้นที่ยังไม่ส่ง ใช้ป้ายเดียวกับช่องติ๊กของหน้าเดียว ("ส่งอะไหล่เก่าเคลม {รหัส}")
    await tick(code2).click().catch(() => {});
    await page.waitForTimeout(1000);
    const two = (await barRow(code1).count()) > 0 && (await barRow(code2).count()) > 0;
    await quit(code2).click().catch(() => {});
    await page.waitForTimeout(1000);
    two && (await stepper().count()) > 0 && (await barRow(code1).count()) > 0 && (await barRow(code2).count()) === 0
      ? pass("ส่งเคลมสองชิ้น → แถบมีสองแถว · เลิกชิ้นหนึ่ง ฟอร์มยังเป็นทีละขั้น (ยังมีอีกชิ้นที่เคลม) แถบเหลือแถวเดียว")
      : fail(`สองชิ้น: สองแถว=${two} แถบขั้น=${await stepper().count()} แถว1=${await barRow(code1).count()} แถว2=${await barRow(code2).count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-quit-4-two.png") });

    // ── 5) ไม่มีอะไรถูกส่งไปปิดงาน ──
    sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS" &&
      count(`select count(*) from "PartClaim" where "workOrderId"=${id}`) === 0
      ? pass("ใบยังอยู่ขั้นช่าง ไม่มีแถวเคลม (ฐานข้อมูล) — แถบเลิกเคลมไม่ส่งอะไรนอกจากลบไฟล์ที่ฟอร์มนี้แนบเอง")
      : fail(`ฐานข้อมูลเปลี่ยน: ${sql(`select status from "WorkOrder" where id=${id}`)}`);
  } catch (e) {
    fail(String(e));
  } finally {
    for (const i of ids) await call(A, "DELETE", `/work-orders/${i}`);
    // กดถึงหน้างานสร้างแถวเช็คอินผูกทั้งสาขาและช่าง — ไม่ลบก่อน ลบสาขา/ผู้ใช้ไม่ได้ (FK)
    sql(`delete from "BranchCheckIn" where "branchId" in (select id from "Branch" where code='${bc}') or "userId" in (select id from "User" where "employeeCode"='${TECH}');
         delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "User" where "employeeCode"='${TECH}';
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    const left = sql(`select count(*) from "WorkOrder" where id in (${ids.length ? ids.join(",") : "0"})`) +
      sql(`select count(*) from "User" where "employeeCode"='${TECH}'`) + sql(`select count(*) from "Branch" where code='${bc}'`);
    left === "000" ? pass("ลบใบทดสอบ สาขา เครื่อง ผู้ใช้ที่สร้าง และคืนภาคของ S001 แล้ว (ฐานข้อมูล)") : fail(`ของทดสอบยังค้าง ${left}`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
