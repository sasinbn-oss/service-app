// ทดสอบ: เคลมก้อน 5 — ฟอร์มปิดงานทีละขั้น + ถ่ายก่อนซ่อม ผ่านหน้าจอจริง (จอมือถือ 360×780 · ช่างของชุดนี้เอง)
//   1) งานของฉัน: ใบซ่อมสาขาในประกันมีกล่อง "ถ่ายก่อนซ่อม" (ในประกันถึง … · ยังไม่ได้ถ่าย · ไม่บังคับ) · กดถึงหน้างานแล้วกล่องกางเอง
//      เลือกวิดีโอ Error + รูปอาการเสียในกล่อง → ขึ้นใบงานทันทีโดยไม่ผูกชิ้น (ฐานข้อมูล sparePartId ว่าง) · "✓ ถ่ายไว้แล้ว 2 ไฟล์ — …"
//   2) ใบ Oasis: บรรทัดการ์ดและช่องวิดีโอในกล่องเป็น "วิดีโออาการตอนเครื่องเดิน" (ไม่มีจอ Error)
//   3) ฟอร์มปิดงาน: แถบสี่ขั้นพร้อมตัวนับ เห็นครบในจอ 360 ไม่มีเลื่อนข้าง · "ขั้น 1/4 · งานที่ทำ · ยังขาด n" ·
//      รูปก่อนซ่อม "✓ ใช้จากที่ถ่ายก่อนซ่อม (2 ไฟล์)" · ปุ่ม "ยังขาด n อย่าง — พาไป" เลื่อนไปช่องแรกที่ขาด กรอบแดงกระพริบ ไม่ส่งคำขอ ·
//      รูปหลังซ่อม/ป้ายรุ่น/ใบเหลืองขึ้นใบงานทันทีที่เลือก (ฐานข้อมูลก่อนกดส่ง) · คนที่ไปเติมช่างที่เข้าระบบไว้ให้
//   4) ขั้นเครื่อง: อ่านรูปป้ายจริง (tests/plate-huebsch.jpg) จากขั้นงานที่ทำ · ตัวที่ขีดแดงแตะสลับได้ "แก้แล้ว 1 ตัว (พื้นฟ้า)" → สลับกลับ
//      "ยังไม่ได้แก้ตัวไหน" · ยืนยันรุ่นกับ Serial ทีละช่อง · ยืนยันแล้วแตะสลับตัว = การยืนยันหาย ตัวนับขั้นถอยหนึ่งข้อ (ตัวหารคงที่) ต้องกดใหม่ ·
//      Error แนะนำจากใบแจ้ง (แตะเอง) · เครื่องซักไม่มี Error ของเครื่องอบในรายการ
//   5) ขั้นเคลมทีละชิ้น: แท็บชิ้น "{ครบ}/7" · ⑥ "✓ ถ่ายไว้ตอนก่อนซ่อม (2 ไฟล์)" · "ใช้ข้อความนี้" · ข้อเช็คตาม Error ของชิ้นนี้ (คำอ่านไทย) ·
//      Troubleshooting มีคำใบ้ "(มีวิดีโอ Error code แล้ว)" · "เติมจากข้อที่ติ๊ก" · ชิ้นที่สองติ๊กข้อเช็คอีกข้อ (ไม่ปนกับชิ้นแรก) แล้ว
//      "ไม่ส่งเคลมชิ้นนี้" → เลือกเหตุผล "อื่น ๆ" + พิมพ์ → แท็บชิ้นขึ้น "ไม่ส่งเคลม"
//   6) ขั้นส่ง: สรุปทุกขั้น · รหัสตัวเสียไม่ตรงขึ้นเตือน "· ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (…)" + "▸ ดู" พาไปข้อ ② · ชิ้นที่ไม่ส่ง "— ไม่ส่งเคลม (…)"
//   7) เน็ตหลุดตอนส่ง → แถบ "ส่งไม่สำเร็จ — เน็ตหลุด" + "ข้อมูลที่กรอกไว้ยังอยู่: ไฟล์ … · ข้อความ … · ค่าป้าย · ข้อเช็ค — กด “…” อีกครั้ง" ·
//      ของที่กรอกยังอยู่ · ฐานข้อมูลไม่เปลี่ยน → ส่งใหม่สำเร็จ
//   8) คำขอปิดงานที่แอปส่ง: claims[].errorChecked ของชิ้นแรกเท่านั้น (ข้อที่ติ๊กในชิ้นที่สองไม่ปน) · claimSkips · ป้าย confirmed ไม่มี verified
//      ฐานข้อมูล: ใบรอตรวจเคลม · ใบเคลมเฉพาะชิ้นที่ส่ง · ป้ายยืนยันทีละช่อง (confirmed + read) · ข้อเช็คตาม Error ของชิ้น ·
//      ประวัติ "ไม่ส่งเคลมอะไหล่เก่า" พร้อม meta (เหตุผล · TECH) · ไฟล์ไม่ซ้ำ · การ์ดรอตรวจเคลมไม่มีกล่องถ่ายก่อนซ่อมแล้ว
// วันนัด 12 วันข้างหน้าตอนปล่อยงาน (G10) แล้วย้ายเป็นวันนี้ด้วย SQL หลังปล่อยงาน ให้การ์ดอยู่แท็บ "วันนี้"
// ยืนยันผลที่ฐานข้อมูลทุกข้อที่เปลี่ยนข้อมูล · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์) · อ่านป้ายช้า ให้เวลานาน
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const CLIP = path.join(DIR, "..", "site-clip.mp4");
// รูปป้าย Huebsch ทั้งป้าย (เจ้าของงานส่งมา ต.ค. 69) — รุ่นเต็ม HL055LWHPRXG6W0000 · Serial 2402600330
const PLATE_PHOTO = path.join(DIR, "..", "plate-huebsch.jpg");
const API = "http://localhost:4000/api";
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
  const bc = `DZCS${suf}`;
  const team = "กระบี่";
  const TECH = `ZCST${suf}`;
  const TECH_NAME = "ช่างสมศักดิ์ ทดสอบปิดทีละขั้น";
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
    // ── เตรียม: สาขาแฟรนไชส์ในประกัน (เปิด 12 เดือน) · เครื่องซัก Huebsch W1 + เครื่อง Oasis W2 · ช่างของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('${TECH}','${TECH_NAME}','EMPLOYEE','${hash}',false,'${team}')`);
    const tid = Number(sql(`select id from "User" where "employeeCode"='${TECH}'`));
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt",latitude,longitude) values ('สาขาทดสอบปิดทีละขั้น','${bc}','ใต้','${team}','FRANCHISE',now()-interval '12 months',${LAT},${LNG})`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    // ทะเบียนรุ่น HL055L ของ W1 ใส่ตรงในฐานข้อมูล ไม่ได้มาจาก model ตอนเปิดใบ — W1 มียี่ห้อจากรายงานแล้ว (HB - Huebsch)
    // ตั้งแต่ล็อกยี่ห้อ (เลือกอะไหล่ตามไฟล์ยี่ห้อ ก้อน 4) การเปิดใบเขียน model ให้เฉพาะเครื่องที่ยังไม่รู้ยี่ห้อ ค่าที่ prepare ส่งจึงถูกข้าม
    // ขั้นเครื่องต้องมีรุ่นในทะเบียนให้ OCR เทียบ (อ่าน HLOSSL… แล้วแก้ตัวต้นเป็น HL055L) ไม่งั้นเทสต์พังทั้งที่แอปไม่ได้ผิด
    sql(`insert into "Machine"("branchId",code,type,brand,model,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch','HL055L',now()),(${bid},'W2','WASHER','Oasis',null,now())`);

    /** เปิดใบ ระบุอะไหล่ เบิก ปล่อยงาน (วันข้างหน้า · G10) แล้วย้ายวันนัดเป็นวันนี้ด้วย SQL */
    async function prepare(machine, model, symptom, kinds) {
      const wo = await call(A, "POST", "/work-orders", {
        branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
        machines: [{ code: machine, model, symptom }],
      });
      const oid = wo.orders ? wo.orders[0].id : wo.id;
      if (!oid) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
      ids.push(oid);
      const sps = kinds.map((k) => fxPart(oid, k));
      await call(S, "POST", `/work-orders/${oid}/parts`, { needsParts: true, parts: sps.map((s) => ({ sparePartId: s, quantity: 1 })) });
      await call(A, "POST", `/work-orders/${oid}/parts-sourcing`, { results: sps.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
      await call(S, "POST", `/work-orders/${oid}/assign`, { team, scheduledAt: visitDay(12) });
      await call(A, "POST", `/work-orders/${oid}/parts-check`, {
        results: sps.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CS${suf}` })),
      });
      await call(A, "POST", `/work-orders/${oid}/confirm-appointment`, {});
      await call(S, "POST", `/work-orders/${oid}/dispatch`, {});
      if (sql(`select status from "WorkOrder" where id=${oid}`) !== "IN_PROGRESS") throw new Error(`เตรียมใบ ${machine} ไม่ถึงขั้นเข้างาน`);
      sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${oid}`);
      return { id: oid, code: sql(`select code from "WorkOrder" where id=${oid}`), sps };
    }
    const O = await prepare("W1", "HL055L", "ประตูล็อกไม่ลง ขึ้น E dL", ["BOARD", "BELT"]);
    const OA = await prepare("W2", "Oasis", "เครื่องไม่ปั่น", ["BOARD"]);
    const id = O.id;
    const [sp1, sp2] = O.sps;
    const [code1, code2] = O.sps.map((s) => sql(`select "partCode" from "SparePart" where id=${s}`));
    const [name1, name2] = O.sps.map((s) => sql(`select name from "SparePart" where id=${s}`));
    pass(`เตรียม ${O.code} (Huebsch · ${code1} · ${code2}) และ ${OA.code} (Oasis) ปล่อยงานแล้ว นัดวันนี้ (ฐานข้อมูล)`);

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
    const cardOf = (code) => page.locator(`[aria-label="งาน ${code}"]`).locator("visible=true").first();
    const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ");
    const inView = (box) => !!box && box.y >= 0 && box.y + box.height <= H;
    const choose = async (loc, file) => {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), loc.click()]);
      await chooser.setFiles(file);
    };
    const count = (q) => Number(sql(q));
    const nullPart = () =>
      count(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role in ('CLAIM_ERROR_VIDEO','CLAIM_SYMPTOM') and "sparePartId" is null`);

    // ── 1) งานของฉัน: กล่องถ่ายก่อนซ่อม ──
    await cardOf(O.code).waitFor({ timeout: 15000 }).catch(() => {});
    const preBox = () => cardOf(O.code).locator('[aria-label="กล่องถ่ายก่อนซ่อม"]').first();
    let t = await textOf(preBox());
    t.includes("ในประกันถึง ") && t.includes("ก่อนลงมือซ่อม: ถ่ายวิดีโอ Error + รูปอาการเสีย (ใช้เคลม)") &&
      t.includes("ยังไม่ได้ถ่าย · ไม่บังคับ") && t.includes("ถ่ายก่อนซ่อม")
      ? pass("การ์ดใบซ่อมสาขาในประกัน: \"ในประกันถึง …\" · \"ก่อนลงมือซ่อม: ถ่ายวิดีโอ Error + รูปอาการเสีย (ใช้เคลม)\" · \"ยังไม่ได้ถ่าย · ไม่บังคับ\" + ปุ่มถ่ายก่อนซ่อม")
      : fail(`กล่องถ่ายก่อนซ่อม: "${t.slice(0, 300)}"`);
    // ใบ Oasis — ไม่มีจอ Error รู้จากยี่ห้อตั้งแต่ก่อนซ่อม ช่องวิดีโอในกล่องจึงเป็นวิดีโออาการตอนเครื่องเดิน (เจ้าของงานตอบข้อ 4)
    const preA = cardOf(OA.code).locator('[aria-label="กล่องถ่ายก่อนซ่อม"]').first();
    await preA.locator('[aria-label="ถ่ายก่อนซ่อม"]').first().click().catch(() => {});
    await page.waitForTimeout(600);
    t = await textOf(preA);
    t.includes("ก่อนลงมือซ่อม: ถ่ายวิดีโออาการตอนเครื่องเดิน + รูปอาการเสีย (ใช้เคลม)") && t.includes("ถ่ายก่อนลงมือซ่อม (ใช้เคลม)") &&
      t.includes("วิดีโออาการตอนเครื่องเดิน") && t.includes("ให้เห็นอาการเสียตอนเครื่องเดิน ชัด ๆ 5–10 วินาที") && !t.includes("วิดีโอ Error code")
      ? pass(`ใบ Oasis ${OA.code}: บรรทัดการ์ดและช่องวิดีโอในกล่องเป็น "วิดีโออาการตอนเครื่องเดิน"`)
      : fail(`กล่องถ่ายก่อนซ่อมใบ Oasis: "${t.slice(0, 400)}"`);
    await preA.locator('[aria-label="ย่อ ถ่ายก่อนซ่อม"]').first().click().catch(() => {});
    await page.waitForTimeout(400);

    // กดถึงหน้างาน (พิกัดตรงสาขา) — ยังไม่ได้ถ่ายก่อนซ่อม กล่องกางเอง: เครื่องยังเสียอยู่ตรงหน้าคือตอนเดียวที่ถ่ายอาการได้
    await cardOf(O.code).locator('[aria-label="ถึงหน้างาน"]').first().click();
    await waitFor(() => sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='ARRIVED'`) === "1", 20000);
    await page.waitForTimeout(2500);
    t = await textOf(preBox());
    t.includes("ถ่ายก่อนลงมือซ่อม (ใช้เคลม)") && t.includes("วิดีโอ Error code") && t.includes("ให้เห็นหน้าจอขึ้นรหัส เช่น E dL ชัด ๆ 5–10 วินาที") &&
      t.includes("รูปอาการเสีย") && t.includes("ไม่บังคับ — ถ้ายังไม่ถ่าย ตอนปิดงานก็ยังแนบได้")
      ? pass("กดถึงหน้างานแล้วกล่องถ่ายก่อนซ่อมกางเอง (ฐานข้อมูลบันทึกถึงหน้างาน) · ช่องวิดีโอ Error code + รูปอาการเสีย")
      : fail(`หลังถึงหน้างาน กล่องไม่กาง: "${t.slice(0, 300)}"`);
    await choose(preBox().locator('[aria-label="เลือกไฟล์ วิดีโอ Error code"]').first(), CLIP);
    await waitFor(() => nullPart() >= 1, 30000);
    await choose(preBox().locator('[aria-label="เลือกรูป รูปอาการเสีย"]').first(), PHOTO);
    await waitFor(() => nullPart() === 2, 30000);
    await page.waitForTimeout(2500);
    t = await textOf(preBox());
    nullPart() === 2 &&
      count(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role like 'CLAIM_%' and "sparePartId" is not null`) === 0 &&
      t.includes("✓ ถ่ายไว้แล้ว 2 ไฟล์ — ใช้เป็นรูปก่อนซ่อมด้วย ไม่ต้องถ่ายซ้ำ")
      ? pass("ถ่ายก่อนซ่อม: วิดีโอ Error + รูปอาการขึ้นใบงานทันที ไม่ผูกชิ้น (ฐานข้อมูล sparePartId ว่าง 2 ไฟล์) · \"✓ ถ่ายไว้แล้ว 2 ไฟล์ — ใช้เป็นรูปก่อนซ่อมด้วย ไม่ต้องถ่ายซ้ำ\"")
      : fail(`ถ่ายก่อนซ่อม: ไม่ผูกชิ้น ${nullPart()} ไฟล์ · กล่อง "${t.slice(0, 300)}"`);
    await cardOf(O.code).scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-steps-1-prerepair.png") });

    // ── 3) ฟอร์มปิดงานทีละขั้น ──
    await cardOf(O.code).locator('[aria-label="ปิดงาน"]').first().click();
    await page.waitForTimeout(4000);
    // แถบขั้นของใบงานเอง (ขั้น 1 ระบุอะไหล่ …) อยู่หลังฟอร์มและขึ้นต้น "ขั้น n " เหมือนกัน — ต้องจำกัดที่แถบของฟอร์มปิดงานเท่านั้น
    const tab = (n) => page.locator('[aria-label="ขั้นปิดงาน"]').locator(`[aria-label^="ขั้น ${n} "]`).locator("visible=true").first();
    const stepTo = async (n) => {
      await tab(n).click();
      await page.waitForTimeout(700);
    };
    const boxes = await Promise.all([1, 2, 3, 4].map(async (n) => tab(n).boundingBox()));
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const tabLabels = await Promise.all([1, 2, 3, 4].map(async (n) => (await tab(n).getAttribute("aria-label").catch(() => "")) ?? ""));
    boxes.every((b) => !!b && b.x >= 0 && b.x + b.width <= W + 1 && inView(b)) && scrollW <= W + 2 &&
      /^ขั้น 1 งานที่ทำ \d+\/\d+$/.test(tabLabels[0]) && /^ขั้น 2 เครื่อง \d+\/\d+$/.test(tabLabels[1]) &&
      /^ขั้น 3 เคลมทีละชิ้น \d+\/\d+$/.test(tabLabels[2]) && /^ขั้น 4 ส่ง ยังขาด \d+$/.test(tabLabels[3]) &&
      (await vis(/^ขั้น 1\/4 · งานที่ทำ · ยังขาด \d+$/).count()) > 0
      ? pass(`แถบสี่ขั้นพร้อมตัวนับเห็นครบในจอ ${W} ไม่มีเลื่อนข้าง (${tabLabels.join(" | ")}) · "ขั้น 1/4 · งานที่ทำ · ยังขาด …"`)
      : fail(`แถบขั้น: ${tabLabels.join(" | ")} · กว้าง ${scrollW} · ${JSON.stringify(boxes)}`);
    (await vis("✓ ใช้จากที่ถ่ายก่อนซ่อม (2 ไฟล์)").count()) > 0 && (await vis("ไม่ต้องถ่ายซ้ำ — ไฟล์ชุดเดียวกันใช้เป็นหลักฐานเคลมด้วย").count()) > 0 &&
      (await byLabel("ถ่ายรูปก่อนซ่อม").count()) === 0
      ? pass("รูปก่อนซ่อม: \"✓ ใช้จากที่ถ่ายก่อนซ่อม (2 ไฟล์)\" ไม่มีช่องให้ถ่ายซ้ำ")
      : fail("ขั้นงานที่ทำไม่ใช้ไฟล์จากที่ถ่ายก่อนซ่อม");
    const workers = await textOf(byLabel("ผู้เข้าปฏิบัติงานคนที่ 1").first());
    if (workers.includes(TECH_NAME)) pass(`คนที่ไปเติมช่างที่เข้าระบบไว้ให้ (${TECH_NAME})`);
    else {
      fail(`คนที่ไปไม่ได้เติมช่างที่เข้าระบบ: "${workers}"`);
      await byLabel("ผู้เข้าปฏิบัติงานคนที่ 1").first().click();
      await page.waitForTimeout(400);
      await vis(TECH_NAME, false).last().click();
    }
    await page.screenshot({ path: path.join(DIR, "claim-steps-2-work.png") });

    // ปุ่มล่างพาไปช่องแรกที่ขาด (เลื่อนลงท้ายขั้นก่อน — ต้องพากลับขึ้นไป) ไม่ส่งคำขอปิดงาน
    const closePosts = [];
    // ตัวคำขอที่แอปส่งจริง — ข้อเช็คทีละชิ้น (claims[].errorChecked) ฐานข้อมูลแยกไม่ออกจากชุดรวม (claimCheck.checked) เมื่อเคลมชิ้นเดียว
    const closeBodies = [];
    page.on("request", (r) => {
      if (r.method() !== "POST" || !new RegExp(`/work-orders/${id}/close$`).test(r.url())) return;
      closePosts.push(r.url());
      closeBodies.push(r.postData() ?? "");
    });
    await byLabel("อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").last().scrollIntoViewIfNeeded().catch(() => {});
    const goBtn = page.getByText(/^ยังขาด \d+ อย่าง — พาไป$/).locator("visible=true").last();
    const goText = await goBtn.innerText().catch(() => "");
    await goBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    const flash = await page.locator('[aria-label="ช่องที่ยังขาด"]').count();
    let afterInView = false;
    for (let i = 0; i < 20 && !(afterInView = inView(await byLabel("เลือกรูปหลังซ่อม").first().boundingBox())); i++) await page.waitForTimeout(100);
    /^ยังขาด \d+ อย่าง — พาไป$/.test(goText) && flash > 0 && afterInView && closePosts.length === 0 &&
      sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
      ? pass(`ปุ่มล่าง "${goText}": เลื่อนไปช่องแรกที่ขาด (รูปหลังซ่อม) อยู่ในจอ กรอบแดงกระพริบ ไม่ส่งคำขอปิดงาน`)
      : fail(`ปุ่มพาไป: "${goText}" · กรอบ ${flash} · อยู่ในจอ ${afterInView} · คำขอ ${closePosts.length}`);

    // ไฟล์ขั้นงานที่ทำขึ้นใบงานทันทีที่เลือก
    await choose(byLabel("เลือกรูปหลังซ่อม").first(), PHOTO);
    await choose(byLabel("เลือกรูปป้ายรุ่น").first(), PLATE_PHOTO);
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ");
    await choose(vis("เลือกรูปใบเหลือง").last(), PHOTO);
    const roleCount = (role) => count(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role='${role}'`);
    await waitFor(() => roleCount("AFTER") === 1 && roleCount("NAMEPLATE") === 1 && roleCount("REQUISITION") === 1, 30000);
    roleCount("AFTER") === 1 && roleCount("NAMEPLATE") === 1 && roleCount("REQUISITION") === 1 && roleCount("BEFORE") === 0 &&
      sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS"
      ? pass("รูปหลังซ่อม · ป้ายรุ่น · ใบเหลือง ขึ้นใบงานทันทีที่เลือก ก่อนกดส่ง (ฐานข้อมูล · ไม่มีรูปก่อนซ่อมแยก)")
      : fail(`ไฟล์ขั้นงานที่ทำ: หลังซ่อม ${roleCount("AFTER")} · ป้าย ${roleCount("NAMEPLATE")} · ใบเหลือง ${roleCount("REQUISITION")}`);
    await vis("ถัดไป: ข้อมูลเครื่อง").last().click();
    await page.waitForTimeout(1500);

    // ── 4) ขั้นเครื่อง ──
    // อ่านรูปป้ายที่ถ่ายในขั้นงานที่ทำ (เริ่มอ่านตั้งแต่เลือกรูป) — เครื่องทดสอบช้ากว่ามือถือจริง ให้เวลานาน
    await byLabel("สถานะอ่านป้าย").first().waitFor({ state: "detached", timeout: 240000 }).catch(() => {});
    await page.waitForTimeout(800);
    const shown = async (prefix) =>
      ((await page.locator(`[aria-label^="${prefix}"]`).locator("visible=true").first().getAttribute("aria-label").catch(() => null)) ?? "").slice(prefix.length);
    const model = await shown("รุ่นที่จะส่ง ");
    (await vis("✓ ป้ายรุ่น: ใช้รูปจากแท็บงานที่ทำ ไม่ต้องถ่ายซ้ำ").count()) > 0 &&
      (await vis("ระบบอ่านป้ายแล้ว — กดยืนยันรุ่นกับ Serial ทีละช่อง").count()) > 0 &&
      /^HL055LWHPRXG/.test(model) && model.length === 18 && (await shown("Serialที่จะส่ง ")) === "2402600330"
      ? pass(`ขั้นเครื่องใช้รูปป้ายจากขั้นงานที่ทำ อ่านได้รุ่นเต็ม ${model} + Serial 2402600330 · "ระบบอ่านป้ายแล้ว — กดยืนยันรุ่นกับ Serial ทีละช่อง"`)
      : fail(`ขั้นเครื่อง: รุ่น=${model} · Serial=${await shown("Serialที่จะส่ง ")}`);
    // ตัวที่หน้าตาคล้ายกัน (O/0 · S/5 · E/6) ขีดแดงแตะสลับได้ — สลับแล้วนับว่าแก้ 1 ตัว · สลับกลับไม่นับ
    const tapCell = page.locator('[aria-label^="ตัวที่ "][aria-label*="แตะเพื่อเปลี่ยนเป็น"]').locator("visible=true").first();
    const cellLabel = (await tapCell.getAttribute("aria-label").catch(() => "")) ?? "";
    const pos = (/^ตัวที่ (\d+) /.exec(cellLabel) ?? [])[1];
    await tapCell.click().catch(() => {});
    await page.waitForTimeout(400);
    const swapped = await shown("รุ่นที่จะส่ง ");
    const oneChanged = (await page.getByText(/แก้แล้ว 1 ตัว \(พื้นฟ้า\)/).locator("visible=true").count()) > 0;
    await page.locator(`[aria-label^="ตัวที่ ${pos} คือ "]`).locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(400);
    const back = await shown("รุ่นที่จะส่ง ");
    !!pos && swapped !== model && swapped.length === model.length && oneChanged && back === model &&
      (await page.getByText(/ยังไม่ได้แก้ตัวไหน/).locator("visible=true").count()) > 0
      ? pass(`แตะตัวที่ ${pos} (ขีดแดง) สลับ ${model[Number(pos) - 1]}→${swapped[Number(pos) - 1]} "แก้แล้ว 1 ตัว (พื้นฟ้า)" · แตะอีกครั้งกลับ "ยังไม่ได้แก้ตัวไหน"`)
      : fail(`แตะสลับตัว: ตัวที่ ${pos} · ${model} → ${swapped} → ${back} · แก้แล้ว 1 ตัว=${oneChanged}`);
    await page.screenshot({ path: path.join(DIR, "claim-steps-3-plate.png") });
    await byLabel("ยืนยัน รุ่น ตรงกับรูป").first().click();
    await byLabel("ยืนยัน Serial ตรงกับรูป").first().click();
    await page.waitForTimeout(400);
    (await vis("✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว").count()) > 0 && (await vis("✓ ยืนยันแล้ว: ตรงกับรูป").count()) > 0
      ? pass("ยืนยันทีละช่อง: รุ่น \"✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว\" · Serial \"✓ ยืนยันแล้ว: ตรงกับรูป\"")
      : fail("ยืนยันรุ่น/Serial ไม่ขึ้นสถานะยืนยันแล้ว");
    // ยืนยันแล้วแตะสลับตัว = ค่าที่ส่งไม่ใช่ค่าที่ช่างดูแล้ว — การยืนยันต้องหาย กดใหม่ (ไม่งั้นแอปส่ง confirmed:true ของค่าที่ไม่มีใครดู)
    const counter = async () => {
      const m = /(\d+)\/(\d+)$/.exec((await tab(2).getAttribute("aria-label").catch(() => "")) ?? "");
      return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
    };
    const before = await counter();
    await page.locator(`[aria-label^="ตัวที่ ${pos} คือ "]`).locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(400);
    const after = await counter();
    const unconfirmed =
      (await vis("✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว").count()) === 0 && (await byLabel("ยืนยัน รุ่น ตรงกับรูป").count()) > 0 &&
      (await vis("✓ ยืนยันแล้ว: ตรงกับรูป").count()) > 0;
    await page.locator(`[aria-label^="ตัวที่ ${pos} คือ "]`).locator("visible=true").first().click().catch(() => {});
    await page.waitForTimeout(400);
    await byLabel("ยืนยัน รุ่น ตรงกับรูป").first().click().catch(() => {});
    await page.waitForTimeout(400);
    const again = await counter();
    !!before && !!after && !!again && unconfirmed && after.done === before.done - 1 && after.total === before.total &&
      again.done === before.done && (await shown("รุ่นที่จะส่ง ")) === model && (await vis("✓ ยืนยันแล้ว: ตรงกับรูปทุกตัว").count()) > 0
      ? pass(`ยืนยันรุ่นแล้วแตะสลับตัว: การยืนยันรุ่นหาย (Serial ยังยืนยันอยู่) ตัวนับขั้นเครื่อง ${before.done}/${before.total} → ${after.done}/${after.total} (ตัวหารไม่เปลี่ยน) · สลับกลับแล้วกดยืนยันใหม่`)
      : fail(`แก้หลังยืนยัน: ตัวนับ ${JSON.stringify(before)} → ${JSON.stringify(after)} → ${JSON.stringify(again)} · การยืนยันหาย ${unconfirmed}`);
    // Error: แนะนำจากใบแจ้ง (ไม่เลือกให้) · เครื่องซักไม่มี Error ของเครื่องอบ
    const sug = byLabel("เลือก Error ที่แนะนำ E dL / E dL1 / E dL2").first();
    const sugText = await textOf(sug);
    const filtered = (await vis("แสดงเฉพาะ Error ของเครื่องซัก (คู่มือ Error in Field)").count()) > 0;
    await byLabel("Error ที่เครื่องขึ้น").first().click();
    await page.waitForTimeout(500);
    const dryer = (await page.getByText(/^ECoFAn/).locator("visible=true").count()) + (await page.getByText(/^อบไม่ร้อน/).locator("visible=true").count());
    const washer = await page.getByText(/^E FL — /).locator("visible=true").count();
    const noneFirst = await page.getByText("ไม่มี Error ขึ้น", { exact: true }).locator("visible=true").count();
    await byLabel("Error ที่เครื่องขึ้น").first().click();
    await page.waitForTimeout(400);
    sugText.includes("จากใบแจ้ง “E dL” — แนะนำ แตะเพื่อเลือก") && filtered && dryer === 0 && washer > 0 && noneFirst > 0 &&
      sql(`select count(*) from "PartClaim" where "workOrderId"=${id}`) === "0"
      ? pass("Error: \"จากใบแจ้ง “E dL” — แนะนำ แตะเพื่อเลือก\" (ไม่เลือกให้) · \"ไม่มี Error ขึ้น\" · \"แสดงเฉพาะ Error ของเครื่องซัก\" ไม่มี Error ของเครื่องอบ")
      : fail(`Error: แนะนำ "${sugText}" · กรองเครื่องซัก ${filtered} · เครื่องอบ ${dryer} · เครื่องซัก ${washer} · ไม่มี Error ขึ้น ${noneFirst}`);
    await sug.click();
    await page.waitForTimeout(500);
    await page.getByText(/^ถัดไป: เคลม /).locator("visible=true").last().click();
    await page.waitForTimeout(1200);

    // ── 5) ขั้นเคลมทีละชิ้น ──
    const partTab = (name) => page.locator(`[aria-label^="ชิ้น ${name} "]`).locator("visible=true").first();
    const tab1 = (await partTab(name1).getAttribute("aria-label").catch(() => "")) ?? "";
    /\d+\/7$/.test(tab1) && (await partTab(name2).count()) > 0 &&
      (await vis("✓ ถ่ายไว้ตอนก่อนซ่อม (2 ไฟล์) — ไม่ต้องแนบซ้ำทุกชิ้น").count()) > 0
      ? pass(`แท็บชิ้น "${tab1}" (7 ข้อ = ①–⑤ + Troubleshooting + ⑥ ของเครื่อง) · ⑥ "✓ ถ่ายไว้ตอนก่อนซ่อม (2 ไฟล์) — ไม่ต้องแนบซ้ำทุกชิ้น"`)
      : fail(`ขั้นเคลมทีละชิ้น: แท็บ "${tab1}" · ข้อ ⑥ ${await vis("✓ ถ่ายไว้ตอนก่อนซ่อม (2 ไฟล์) — ไม่ต้องแนบซ้ำทุกชิ้น").count()}`);
    await choose(byLabel(`แนบรูปอะไหล่เก่า ${code1}`).first(), PHOTO);
    await byLabel(`รหัสอะไหล่ตัวที่เสีย ${code1}`).first().fill("XX-OLD-1");
    await page.waitForTimeout(300);
    const mismatchHint = (await vis(`ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${code1}) — ดูสติกเกอร์อีกครั้ง`).count()) > 0;
    await byLabel(`ใช้ข้อความนี้ ${code1}`).first().click();
    await page.waitForTimeout(300);
    const symptom = await byLabel(`อาการ/สาเหตุ ${code1}`).first().inputValue().catch(() => "");
    await byLabel(`เช็คแล้ว Solenoid ไม่ฝืด ${code1}`).first().click();
    const ts = (await call(A, "GET", `/work-orders/${id}`)).claimTroubleshooting ?? [];
    for (const x of ts) await byLabel(`${x} ${code1}`).first().click();
    await page.waitForTimeout(300);
    const hint = (await page.getByText(/\(มีวิดีโอ Error code แล้ว\)/).locator("visible=true").count()) > 0;
    await byLabel(`เติมจากข้อที่ติ๊ก ${code1}`).first().click();
    await page.waitForTimeout(300);
    const note = await byLabel(`สิ่งที่เข้าเช็ค ${code1}`).first().inputValue().catch(() => "");
    mismatchHint && symptom === "ประตูล็อกไม่ลง ขึ้น E dL" && hint && note.startsWith("เช็คแล้ว: โซลินอยด์ (Solenoid) ไม่ฝืด · ") &&
      (await vis("โซลินอยด์ (Solenoid) ไม่ฝืด").count()) > 0 &&
      (await vis("เช็คตาม Error E dL / E dL1 / E dL2 (คู่มือ Error in Field) — ติ๊กข้อที่ทำ").count()) > 0
      ? pass("ชิ้นแรก: รหัสไม่ตรงเตือนทันที · \"ใช้ข้อความนี้\" ใส่อาการจากใบแจ้ง · ข้อเช็คตาม Error ของชิ้นนี้ขึ้นคำอ่านไทย · คำใบ้ \"(มีวิดีโอ Error code แล้ว)\" · \"เติมจากข้อที่ติ๊ก\"")
      : fail(`ชิ้นแรก: เตือนรหัส ${mismatchHint} · อาการ "${symptom}" · คำใบ้ ${hint} · เขียนเพิ่ม "${note.slice(0, 80)}"`);
    await choose(byLabel(`แนบวิดีโอการตรวจเช็ค ${code1}`).first(), CLIP);
    await waitFor(
      () => count(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${id} and role in ('CLAIM_PART','CLAIM_CHECK_VIDEO') and "sparePartId"=${sp1}`) === 2,
      30000
    );
    await page.waitForTimeout(1500);
    const tab1Done = (await partTab(name1).getAttribute("aria-label").catch(() => "")) ?? "";
    tab1Done.endsWith("7/7 ✓") ? pass(`ชิ้นแรกครบ: แท็บ "${tab1Done}"`) : fail(`แท็บชิ้นแรกหลังกรอกครบ: "${tab1Done}"`);
    await page.getByText(/^ถัดไป: เคลม /).locator("visible=true").last().click();
    await page.waitForTimeout(800);
    // ชิ้นที่สองติ๊กข้อเช็คอีกข้อก่อน — ข้อเช็คเป็นของแต่ละชิ้น ต้องไม่ไปโผล่ในชิ้นแรก (ตรวจที่คำขอปิดงานในข้อ 8)
    await byLabel(`เช็คแล้ว ประตูไม่ตก กลอนเข้าร่อง ${code2}`).first().click().catch(() => {});
    await page.waitForTimeout(300);
    (await byLabel(`เช็คแล้ว ประตูไม่ตก กลอนเข้าร่อง ${code2}`).first().getAttribute("aria-checked").catch(() => null)) === "true"
      ? pass(`ชิ้นที่สองติ๊ก "ประตูไม่ตก กลอนเข้าร่อง" ก่อนกดไม่ส่งเคลม (ข้อ 8 ตรวจว่าไม่ปนไปชิ้นแรก)`)
      : fail("ติ๊กข้อเช็คของชิ้นที่สองไม่ได้");
    // ชิ้นที่สอง: ไม่ส่งเคลม — สาขาในประกัน ต้องเลือกเหตุผล (เจ้าของงานตอบข้อ 10)
    await byLabel(`ไม่ส่งเคลมชิ้นนี้ ${code2}`).first().click();
    await page.waitForTimeout(400);
    const panel = await textOf(byLabel(`เหตุผลที่ไม่ส่งเคลม ${code2}`).first());
    await byLabel(`อื่น ๆ ${code2}`).first().click();
    await byLabel(`เหตุผลอื่น (บังคับ) ${code2}`).first().fill("ลูกค้าขอเก็บอะไหล่เก่าไว้");
    await byLabel(`ยืนยัน ไม่ส่งเคลม ${code2}`).first().click();
    await page.waitForTimeout(500);
    const tab2 = (await partTab(name2).getAttribute("aria-label").catch(() => "")) ?? "";
    panel.includes("ไม่ส่งเคลมชิ้นนี้ — เลือกเหตุผล") && panel.includes("ชิ้นนี้อยู่ในประกัน เหตุผลจะขึ้นในประวัติใบงาน") &&
      panel.includes("อะไหล่เก่าเสียหาย/หาย") && panel.includes("ไม่ใช่ชิ้นในประกัน") &&
      (await vis("✓ ไม่ส่งเคลมชิ้นนี้").count()) > 0 && (await vis("เหตุผล: อื่น ๆ: ลูกค้าขอเก็บอะไหล่เก่าไว้").count()) > 0 &&
      tab2.endsWith("ไม่ส่งเคลม")
      ? pass(`ชิ้นที่สอง "ไม่ส่งเคลมชิ้นนี้": เลือกเหตุผล (สาขาในประกัน) → "✓ ไม่ส่งเคลมชิ้นนี้" · "เหตุผล: อื่น ๆ: …" · แท็บ "${tab2}"`)
      : fail(`ไม่ส่งเคลม: แผง "${panel.slice(0, 200)}" · แท็บ "${tab2}"`);
    await page.screenshot({ path: path.join(DIR, "claim-steps-4-skip.png") });
    await vis("ถัดไป: ตรวจก่อนส่ง").last().click();
    await page.waitForTimeout(800);

    // ── 6) ขั้นส่ง ──
    const SEND = "ยืนยันปิดงาน · ส่งตรวจเคลม";
    const review = await textOf(byLabel("ตรวจก่อนส่ง").first());
    review.includes("✓ งานที่ทำ — ") && review.includes("รูปก่อนซ่อม 2 · หลังซ่อม 1 · ป้ายรุ่น 1") &&
      review.includes(`✓ ข้อมูลเครื่อง — ${model} · 2402600330 · E dL / E dL1 / E dL2`) &&
      review.includes(`✓ เคลม ${name1} — หลักฐานครบ 7/7 · รหัสตัวเสีย XX-OLD-1`) &&
      review.includes(`· ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${code1})`) &&
      review.includes(`เคลม ${name2} — ไม่ส่งเคลม (อื่น ๆ: ลูกค้าขอเก็บอะไหล่เก่าไว้)`) &&
      review.includes("หลังส่ง: ใบงานไปรอ Admin Spare Part ตรวจเคลม") &&
      review.includes("ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้") && (await vis(SEND).count()) > 0
      ? pass(`ขั้นส่ง: สรุปทุกขั้น · รหัสตัวเสียไม่ตรงขึ้น "· ไม่ตรงกับอะไหล่ที่เปลี่ยนใส่ (${code1})" (ไม่บล็อก) · ชิ้นที่ไม่ส่ง + เหตุผล · ปุ่ม "${SEND}"`)
      : fail(`ขั้นส่ง: "${review.slice(0, 600)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-steps-5-send.png") });
    await vis("▸ ดู").first().click();
    await page.waitForTimeout(800);
    inView(await byLabel(`รหัสอะไหล่ตัวที่เสีย ${code1}`).first().boundingBox())
      ? pass("\"▸ ดู\" พากลับไปข้อ ② ของชิ้นนั้น (ช่องรหัสตัวเสียอยู่ในจอ)") : fail("\"▸ ดู\" ไม่พาไปช่องรหัสตัวเสีย");
    await stepTo(4);

    // ── 7) เน็ตหลุดตอนส่ง ──
    await page.route(`**/api/work-orders/${id}/close`, (route) => route.abort("internetdisconnected"));
    await vis(SEND).last().click();
    await vis("ส่งไม่สำเร็จ — เน็ตหลุด").first().waitFor({ timeout: 20000 }).catch(() => {});
    const errBox = page.locator('[role="alert"]').filter({ hasText: "ส่งไม่สำเร็จ — เน็ตหลุด" }).locator("visible=true").first();
    const errText = await textOf(errBox);
    /ข้อมูลที่กรอกไว้ยังอยู่: ไฟล์ \d+ ไฟล์ · ข้อความ \d+ ช่อง · ค่าป้าย · ข้อเช็ค — กด “ยืนยันปิดงาน · ส่งตรวจเคลม” อีกครั้ง/.test(errText) &&
      inView(await errBox.boundingBox()) && sql(`select status from "WorkOrder" where id=${id}`) === "IN_PROGRESS" &&
      sql(`select count(*) from "PartClaim" where "workOrderId"=${id}`) === "0"
      ? pass(`เน็ตหลุดตอนส่ง: แถบ "${errText.slice(0, 140)}…" ปักในจอ · ฐานข้อมูลไม่เปลี่ยน`)
      : fail(`แถบเน็ตหลุด: "${errText.slice(0, 300)}"`);
    await page.screenshot({ path: path.join(DIR, "claim-steps-6-offline.png") });
    await stepTo(3);
    await partTab(name1).click();
    await page.waitForTimeout(500);
    (await byLabel(`รหัสอะไหล่ตัวที่เสีย ${code1}`).first().inputValue().catch(() => "")) === "XX-OLD-1" &&
      (await byLabel(`สิ่งที่เข้าเช็ค ${code1}`).first().inputValue().catch(() => "")) === note
      ? pass("หลังส่งไม่สำเร็จ ของที่กรอกยังอยู่ครบ (รหัสตัวเสีย · เขียนเพิ่ม)") : fail("ส่งไม่สำเร็จแล้วของที่กรอกหาย");
    await page.unroute(`**/api/work-orders/${id}/close`);
    await stepTo(4);
    await vis(SEND).last().click();
    await waitFor(() => sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW", 20000);
    await page.waitForTimeout(3000);

    // ── 8) คำขอที่แอปส่ง + ฐานข้อมูล ──
    let body = {};
    try {
      body = JSON.parse(closeBodies[closeBodies.length - 1] || "{}");
    } catch {}
    const sentClaims = body.claims ?? [];
    const plateSent = body.claimNameplate?.fields ?? [];
    const pf = (k) => plateSent.find((x) => x.key === k) ?? {};
    sentClaims.length === 1 && sentClaims[0].sparePartId === sp1 &&
      JSON.stringify(sentClaims[0].errorChecked) === '["Solenoid ไม่ฝืด"]' &&
      JSON.stringify(body.claimSkips) === JSON.stringify([{ sparePartId: sp2, reason: "OTHER", note: "ลูกค้าขอเก็บอะไหล่เก่าไว้" }]) &&
      pf("model").confirmed === true && pf("serial").confirmed === true && plateSent.every((x) => !("verified" in x))
      ? pass(`คำขอปิดงาน: claims[].errorChecked ของชิ้นแรก ["Solenoid ไม่ฝืด"] (ข้อที่ติ๊กในชิ้นที่สองไม่ปน) · claimSkips ชิ้นที่สอง (อื่น ๆ + เหตุผล) · ป้าย confirmed ทีละช่อง ไม่มี verified`)
      : fail(`คำขอปิดงาน: claims ${JSON.stringify(sentClaims.map((c) => ({ sp: c.sparePartId, ec: c.errorChecked })))} · skips ${JSON.stringify(body.claimSkips)} · ป้าย ${JSON.stringify(plateSent.map((x) => [x.key, x.confirmed, "verified" in x]))}`);
    const claim = sql(`select "sparePartId"||'|'||"brokenPartCode"||'|'||(nameplate->'fields')::text||'|'||("fieldCheck"->'checked')::text from "PartClaim" where "workOrderId"=${id}`);
    const [cSp, cBroken, ...rest] = claim.split("|");
    const fieldsJson = rest.slice(0, -1).join("|");
    const checked = rest[rest.length - 1];
    const fields = JSON.parse(fieldsJson || "[]");
    const f = (k) => fields.find((x) => x.key === k) ?? {};
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" && sql(`select count(*) from "PartClaim" where "workOrderId"=${id}`) === "1" &&
      Number(cSp) === sp1 && cBroken === "XX-OLD-1" &&
      f("model").value === model && f("model").confirmed === true && f("model").source === "SCAN" && f("model").read === model &&
      f("serial").confirmed === true && checked === '["Solenoid ไม่ฝืด"]'
      ? pass("ฐานข้อมูล: ใบรอตรวจเคลม · ใบเคลมเฉพาะชิ้นที่ส่ง · รุ่น/Serial ยืนยันทีละช่อง (confirmed · read = ค่าที่ระบบอ่าน) · ข้อเช็คของชิ้นนี้ไม่มีข้อที่ติ๊กในชิ้นที่สอง")
      : fail(`ใบเคลม: ${claim.slice(0, 400)}`);
    const skipLog = sql(`select note||'|'||meta::text from "WorkOrderLog" where "workOrderId"=${id} and action='CLAIM_SKIPPED' order by id desc limit 1`);
    const skipMeta = JSON.parse(skipLog.slice(skipLog.indexOf("|") + 1) || "{}");
    const s0 = (skipMeta.skips ?? [])[0] ?? {};
    const order2 = sql(`select string_agg(action, ',' order by id) from "WorkOrderLog" where "workOrderId"=${id} and action in ('CLAIM_SKIPPED','CLOSED')`);
    skipMeta.by === "TECH" && (skipMeta.skips ?? []).length === 1 && s0.sparePartId === sp2 && s0.reason === "OTHER" &&
      s0.note === "ลูกค้าขอเก็บอะไหล่เก่าไว้" && skipLog.includes("ลูกค้าขอเก็บอะไหล่เก่าไว้") && order2 === "CLAIM_SKIPPED,CLOSED"
      ? pass(`ประวัติ "ไม่ส่งเคลมอะไหล่เก่า": ${name2} · อื่น ๆ + เหตุผลที่พิมพ์ (note + meta · by TECH) อยู่ก่อนบรรทัดปิดงาน (ฐานข้อมูล)`)
      : fail(`ประวัติไม่ส่งเคลม: ${skipLog.slice(0, 300)} · ลำดับ ${order2}`);
    roleCount("AFTER") === 1 && roleCount("NAMEPLATE") === 1 && roleCount("REQUISITION") === 1 && roleCount("BEFORE") === 0 && nullPart() === 2 &&
      sql(`select (nameplate->>'photoId')::int = (select max(id) from "WorkOrderAttachment" where "workOrderId"=${id} and role='NAMEPLATE') from "PartClaim" where "workOrderId"=${id}`) === "t"
      ? pass("ไฟล์ไม่ซ้ำหลังส่งไม่สำเร็จแล้วส่งใหม่ (หลังซ่อม 1 · ป้าย 1 · ใบเหลือง 1 · ถ่ายก่อนซ่อม 2 · ไม่มีรูปก่อนซ่อมแยก) · ใบเคลมผูกรูปป้ายที่ถ่าย (ฐานข้อมูล)")
      : fail(`ไฟล์หลังส่ง: หลังซ่อม ${roleCount("AFTER")} · ป้าย ${roleCount("NAMEPLATE")} · ใบเหลือง ${roleCount("REQUISITION")} · ก่อนซ่อม ${roleCount("BEFORE")} · ไม่ผูกชิ้น ${nullPart()}`);
    (await page.evaluate((k) => localStorage.getItem(k), `draft:close:${id}`)) === null && (await vis(SEND).count()) === 0
      ? pass("ส่งสำเร็จ: ฟอร์มปิด ร่างในเครื่องถูกล้าง") : fail("ส่งสำเร็จแล้วฟอร์ม/ร่างยังค้าง");

    // การ์ดรอตรวจเคลมไม่มีกล่องถ่ายก่อนซ่อมแล้ว
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(3500);
    await cardOf(O.code).waitFor({ timeout: 15000 }).catch(() => {});
    t = await textOf(cardOf(O.code));
    t.includes("รอตรวจเคลม") && !t.includes("ถ่ายก่อนซ่อม") && !t.includes("ก่อนลงมือซ่อม") &&
      (await cardOf(O.code).locator('[aria-label="กล่องถ่ายก่อนซ่อม"]').count()) === 0
      ? pass("การ์ดรอตรวจเคลม: ไม่มีกล่องถ่ายก่อนซ่อม (ส่งเคลมแล้ว)") : fail(`การ์ดหลังส่ง: "${t.slice(0, 300)}"`);
    await cardOf(O.code).scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-steps-7-review-card.png") });
    await ctx.close();
  } catch (e) {
    fail(String(e));
  } finally {
    for (const i of ids) await call(A, "DELETE", `/work-orders/${i}`);
    // กดถึงหน้างานสร้างแถวเช็คอินผูกทั้งสาขาและช่าง — ไม่ลบก่อน ลบสาขา/ผู้ใช้ไม่ได้ (FK) และของทดสอบค้างฐาน
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
