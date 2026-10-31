// ทดสอบ: แก้บั๊กเคลมก้อน 0 ผ่านหน้าจอจริง (ไม่เปลี่ยนพฤติกรรม)
//   1) ตัวดูรูปหลักฐานเคลม: กด Esc ปิดแค่รูป ใบงานยังเปิดอยู่ · กด Esc อีกครั้ง (ไม่มีรูปเปิด) ปิดใบงานได้ตามเดิม
//   2) ภาพตัดจากรูปป้ายในการ์ดเคลม: สูงอย่างน้อย 60 px แตะแล้วขยาย แตะอีกครั้งย่อ · หัวการ์ดขั้นปัจจุบัน "Admin Spare Part"
//   3) ฟอร์มปิดงานส่งไม่สำเร็จ: เซิร์ฟเวอร์ไม่รับ → แถบแดง "ส่งไม่สำเร็จ" + เหตุผล ปักบนสุดของฟอร์มและอยู่ในจอ ·
//      เน็ตหลุด → "ส่งไม่สำเร็จ — เน็ตหลุด" · ข้อมูลที่กรอกยังอยู่ · ใบยังไม่ถูกปิด (ฐานข้อมูล)
//   4) คำสั่งปิดผ่านแต่คำตอบหาย แล้วกดซ้ำ → นับเป็นปิดสำเร็จ (ฟอร์มปิด ร่างถูกล้าง ไม่มีคำเตือน 409 ทั่วไป) ·
//      ประวัติปิดงานมีบรรทัดเดียว (ฐานข้อมูล)
//   5) งานของฉัน (ช่าง): ใบรอตรวจเคลมขึ้น "รอตรวจเคลม" + "ยังไม่นับว่าปิดงาน…" ไม่ใช่ "✓ ปิดงานแล้ว" · ใบที่ปิดจริงยังขึ้น "✓ ปิดงานแล้ว"
// วันนัดเป็นวันข้างหน้า 12 วัน (ไม่ปล่อยงานของวันนี้/พรุ่งนี้ — กฎเวลาปิดรับปล่อยงานที่จะตามมา) ·
// ใบที่ปิดวันนี้ขึ้นในแท็บวันนี้ของงานของฉันเองไม่ว่าวันนัดเป็นวันไหน จึงไม่ต้องย้ายวันนัด
// ยืนยันผลที่ฐานข้อมูลทุกข้อที่เปลี่ยนข้อมูล ไม่เชื่อข้อความบนจออย่างเดียว · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
const CLIP = path.join(DIR, "..", "site-clip.mp4");
const API = "http://localhost:4000/api";
// ภาพตัดบรรทัดรุ่นที่ใช้ได้จริง (PNG 1×1) — ภาพเสียก็วาดกรอบได้ แต่เทสต์ควรเหมือนของจริงที่ช่างส่ง
const CROP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
  const bc = `DZCF${suf}`;
  const team = "กระบี่";
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const oldTeam = sql(`select coalesce(team,'') from "User" where "employeeCode"='T001'`);
  const ids = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  const W = 420;
  const H = 860;

  try {
    // ── เตรียม: สาขาแฟรนไชส์ในประกัน เครื่อง Huebsch สองเครื่อง · ช่าง T001 อยู่ทีมของสาขาชั่วคราว ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    sql(`update "User" set team='${team}' where "employeeCode"='T001'`);
    const S = await login("S001");
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt") values ('สาขาทดสอบแก้บั๊กเคลม','${bc}','ใต้','${team}','FRANCHISE',now()-interval '12 months')`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch',now()),(${bid},'W2','WASHER','HB - Huebsch',now())`);
    const me = Number(sql(`select id from "User" where "employeeCode"='A001'`));
    const upload = async (id, role, file, type, sparePartId) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      form.append("role", role);
      if (sparePartId) form.append("sparePartId", String(sparePartId));
      return call(A, "POST", `/work-orders/${id}/attachments`, form);
    };
    const open = async (machine, symptom) => {
      const wo = await call(A, "POST", "/work-orders", {
        branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
        machines: [{ code: machine, model: "Huebsch", symptom }],
      });
      const id = wo.orders ? wo.orders[0].id : wo.id;
      if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
      ids.push(id);
      return id;
    };

    // ใบ C (เคลม): เดินถึงเข้างานแล้วปิดพร้อมเคลมผ่าน API → รอตรวจเคลม
    const C = await open("W1", "ประตูล็อกไม่ลง");
    const sp = fxPart(C, "BOARD");
    await call(S, "POST", `/work-orders/${C}/parts`, { needsParts: true, parts: [{ sparePartId: sp, quantity: 1 }] });
    await call(A, "POST", `/work-orders/${C}/parts-sourcing`, { results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94" }] });
    await call(S, "POST", `/work-orders/${C}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${C}/parts-check`, {
      results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CF${suf}` }],
    });
    await call(A, "POST", `/work-orders/${C}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${C}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${C}`) !== "IN_PROGRESS") throw new Error("เตรียมใบเคลมไม่ถึงขั้นเข้างาน");
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) await upload(C, role, PHOTO, "image/png");
    for (const role of ["CLAIM_PART", "CLAIM_SYMPTOM"]) await upload(C, role, PHOTO, "image/png", sp);
    for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await upload(C, role, CLIP, "video/mp4", sp);
    const ts = (await call(A, "GET", `/work-orders/${C}`)).claimTroubleshooting ?? [];
    const closed = await call(A, "POST", `/work-orders/${C}/close`, {
      result: "FIXED", note: "เปลี่ยนบอร์ด ทดสอบแล้วปกติ", workerIds: [me], parts: [{ sparePartId: sp, quantity: 1 }],
      claims: [{ sparePartId: sp, brokenPartCode: "SP-BOARD-OLD", symptom: "ประตูล็อกไม่ลง ขึ้น Error dL", checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ", troubleshooting: ts }],
      // ยืนยันรุ่นกับ Serial ทีละช่อง (เคลมก้อน 5) — ป้ายที่ไม่มี confirmed เซิร์ฟเวอร์ถือว่าเป็นแอปรุ่นเก่า ไม่รับ
      claimNameplate: {
        fields: [
          { key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "SCAN", crop: CROP, confirmed: true, read: "HL055LWHPRXG6W0000" },
          { key: "serial", label: "Serial", value: "2402600330", source: "HAND", confirmed: true },
        ],
      },
      claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
    });
    const codeC = sql(`select code from "WorkOrder" where id=${C}`);
    sql(`select status from "WorkOrder" where id=${C}`) === "CLAIM_REVIEW"
      ? pass(`เตรียมใบเคลม ${codeC}: ปิดพร้อมเคลมแล้ว รอตรวจเคลม (ฐานข้อมูล)`)
      : (() => { throw new Error(`ใบเคลมไม่ไปรอตรวจ: ${JSON.stringify(closed).slice(0, 200)}`); })();

    // ใบ B (ไม่ใช้อะไหล่): เข้างานแล้ว รูปก่อน/หลังซ่อม + ป้ายรุ่นแนบไว้แล้ว — ปิดผ่านฟอร์มบนจอ
    const B = await open("W2", "เครื่องไม่ปั่น");
    await call(S, "POST", `/work-orders/${B}/parts`, { needsParts: false, assign: { team, scheduledAt: visitDay(12) } });
    await call(A, "POST", `/work-orders/${B}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${B}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${B}`) !== "IN_PROGRESS") throw new Error("เตรียมใบปิดงานไม่ถึงขั้นเข้างาน");
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE"]) await upload(B, role, PHOTO, "image/png");
    const codeB = sql(`select code from "WorkOrder" where id=${B}`);

    async function signIn(user) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on("pageerror", (e) => errors.push(`${user}: ${e}`));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
      await page.waitForTimeout(3500);
      return page;
    }
    async function openOrder(page, code) {
      await page.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await page.getByText(code, { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
    }
    const vis = (page, t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const inView = (box) => !!box && box.y >= 0 && box.y + box.height <= H;

    // ── 1) + 2) การ์ดเคลม: ภาพตัด · Esc ของตัวดูรูป ──
    let page = await signIn("A001");
    await openOrder(page, codeC);
    (await vis(page, "ขั้นปัจจุบัน · Admin Spare Part", false).count()) > 0
      ? pass("หัวการ์ดขั้นปัจจุบันของใบรอตรวจเคลมบอก Admin Spare Part (ไม่ใช่ แอดมิน)")
      : fail("หัวการ์ดขั้นปัจจุบันไม่ได้บอก Admin Spare Part");
    const crop = label(page, "ภาพตัดจากรูปป้าย รุ่น").first();
    await crop.scrollIntoViewIfNeeded();
    const h0 = (await crop.boundingBox())?.height ?? 0;
    await crop.click();
    await page.waitForTimeout(400);
    const h1 = (await crop.boundingBox())?.height ?? 0;
    await crop.click();
    await page.waitForTimeout(400);
    const h2 = (await crop.boundingBox())?.height ?? 0;
    h0 >= 60 && h1 >= 150 && h2 < 100
      ? pass(`ภาพตัดจากรูปป้ายสูง ${Math.round(h0)} px · แตะขยาย ${Math.round(h1)} px · แตะอีกครั้งย่อ ${Math.round(h2)} px`)
      : fail(`ภาพตัดจากรูปป้าย: ${h0} → ${h1} → ${h2}`);
    await page.screenshot({ path: path.join(DIR, "claim-fixes-1-crop.png") });

    await label(page, "เปิด รูปอะไหล่เก่า (เคลม)").first().click();
    await page.waitForTimeout(1500);
    const viewerOpen = (await label(page, "ปิดรูป").count()) > 0;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    viewerOpen && (await label(page, "ปิดรูป").count()) === 0 && (await vis(page, "เคลมอะไหล่เก่า").count()) > 0
      ? pass("เปิดรูปหลักฐานเคลมแล้วกด Esc: ปิดแค่รูป ใบงานยังเปิดอยู่")
      : fail(`Esc ที่ตัวดูรูป: เปิดรูปได้=${viewerOpen} · ยังมีรูป=${await label(page, "ปิดรูป").count()} · ใบงานยังอยู่=${await vis(page, "เคลมอะไหล่เก่า").count()}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    (await vis(page, "เคลมอะไหล่เก่า").count()) === 0
      ? pass("ไม่มีรูปเปิดอยู่ กด Esc ปิดใบงานได้ตามเดิม")
      : fail("กด Esc ตอนไม่มีรูปเปิด ใบงานไม่ปิด");

    // ── 3) ฟอร์มปิดงานส่งไม่สำเร็จ ──
    await openOrder(page, codeB);
    await vis(page, "ปิดงาน").first().click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("ล้างตัวกรอง ทดสอบแล้วปั่นได้");
    await label(page, "คนอื่นที่ไปด้วย").last().fill("ช่างทดสอบนอกระบบ");
    await page.waitForTimeout(800);
    const draft = await page.evaluate((k) => localStorage.getItem(k), `draft:close:${B}`);
    const submit = vis(page, "ยืนยันปิดงาน").last();
    // เลื่อนฟอร์มลงล่างสุดก่อนกด — แถบต้องพากลับขึ้นบน ไม่ใช่ไปโผล่ท้ายฟอร์มที่บังเอิญอยู่ในจอ
    await label(page, "อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").last().scrollIntoViewIfNeeded();
    const firstStep = vis(page, "รูป / วิดีโอก่อนซ่อม", false).first();
    const scrolledAway = !inView(await firstStep.boundingBox());

    let mode = "refuse";
    await page.route(`**/api/work-orders/${B}/close`, async (route) => {
      if (mode === "refuse") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "ทดสอบ: เซิร์ฟเวอร์ไม่รับ" }) });
      if (mode === "drop") return route.abort("internetdisconnected");
      // ส่งถึงเซิร์ฟเวอร์จริง (ปิดงานผ่าน) แต่คำตอบไม่กลับมาถึงแอป
      await route.fetch();
      return route.abort("internetdisconnected");
    });
    await submit.click();
    await vis(page, "ส่งไม่สำเร็จ").waitFor({ timeout: 20000 }).catch(() => {});
    const bannerBox = await vis(page, "ส่งไม่สำเร็จ").first().boundingBox();
    const kept = `ข้อมูลที่กรอกไว้ยังอยู่ — กด "ยืนยันปิดงาน" อีกครั้ง`;
    (await vis(page, "ทดสอบ: เซิร์ฟเวอร์ไม่รับ").count()) > 0 && (await vis(page, kept).count()) > 0 && inView(bannerBox) && bannerBox.y < H / 2
      ? pass(`เซิร์ฟเวอร์ไม่รับ: แถบแดง "ส่งไม่สำเร็จ" + เหตุผลจากเซิร์ฟเวอร์ + ${kept} ปักบนสุดของฟอร์ม (y=${Math.round(bannerBox.y)})`)
      : fail(`แถบส่งไม่สำเร็จ: ${JSON.stringify(bannerBox)}`);
    // เลื่อนกลับแบบนุ่ม (scrollTo animated → behavior "smooth") ใช้เวลา 0.4–0.7 วิ ตามความยาวฟอร์ม — แถบขึ้นทันที
    // แต่หัวขั้นแรกเข้าจอตอนท้ายแอนิเมชัน วัดครั้งเดียวจะได้ FAIL ทั้งที่แอปถูก จึงรอดูซ้ำได้ถึง 3 วิ
    let backToTop = false;
    for (let i = 0; i < 30 && !(backToTop = inView(await firstStep.boundingBox())); i++) await page.waitForTimeout(100);
    // เลื่อนลงล่างไม่ได้ตั้งแต่ตอนเตรียม = เช็คนี้ไม่ได้ทดสอบอะไร ต้องเป็น FAIL ไม่ใช่ข้ามไปเงียบ ๆ
    !scrolledAway
      ? fail("เตรียมเลื่อนฟอร์มลงล่างไม่ได้ (หัวขั้นแรกยังอยู่ในจอ) — เช็คการเลื่อนกลับขึ้นบนไม่ได้")
      : backToTop
        ? pass("ส่งไม่สำเร็จแล้วฟอร์มเลื่อนกลับขึ้นบนสุด")
        : fail("ส่งไม่สำเร็จแล้วฟอร์มไม่เลื่อนกลับขึ้นบน");
    (await page.locator('[role="alert"]').filter({ hasText: "ส่งไม่สำเร็จ" }).count()) > 0
      ? pass("แถบส่งไม่สำเร็จเป็น role=alert (โปรแกรมอ่านจออ่านให้ทันที)") : fail("แถบส่งไม่สำเร็จไม่มี role=alert");
    sql(`select status from "WorkOrder" where id=${B}`) === "IN_PROGRESS" &&
      (await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().inputValue()) === "ล้างตัวกรอง ทดสอบแล้วปั่นได้"
      ? pass("ส่งไม่สำเร็จ: ใบยังไม่ถูกปิด (ฐานข้อมูล) และสรุปงานที่พิมพ์ยังอยู่ในฟอร์ม")
      : fail(`หลังส่งไม่สำเร็จ: สถานะ ${sql(`select status from "WorkOrder" where id=${B}`)}`);
    await page.screenshot({ path: path.join(DIR, "claim-fixes-2-refused.png") });

    mode = "drop";
    await submit.click();
    await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").waitFor({ timeout: 20000 }).catch(() => {});
    (await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").count()) > 0 && (await vis(page, "ทดสอบ: เซิร์ฟเวอร์ไม่รับ").count()) === 0 &&
      inView(await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").first().boundingBox()) &&
      sql(`select status from "WorkOrder" where id=${B}`) === "IN_PROGRESS"
      ? pass("คำขอไปไม่ถึง: แถบเปลี่ยนเป็น \"ส่งไม่สำเร็จ — เน็ตหลุด\" (ไม่เอาเหตุผลรอบก่อนมาค้าง) · ใบยังไม่ถูกปิด (ฐานข้อมูล)")
      : fail("แถบเน็ตหลุดไม่ขึ้น หรือยังค้างเหตุผลรอบก่อน");
    await page.screenshot({ path: path.join(DIR, "claim-fixes-3-offline.png") });

    // ── 4) ปิดผ่านแต่คำตอบหาย → กดซ้ำ = สำเร็จ ──
    mode = "lost";
    await submit.click();
    // แถบเน็ตหลุดของรอบก่อนยังอยู่จนกว่าจะเริ่มส่ง — รอที่ฐานข้อมูลก่อน (คำสั่งปิดถึงเซิร์ฟเวอร์จริง) แล้วค่อยรอแถบรอบใหม่
    for (let i = 0; i < 40 && sql(`select status from "WorkOrder" where id=${B}`) !== "DONE"; i++) await page.waitForTimeout(250);
    await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    const after = sql(`select status||'|'||coalesce("closedById"::text,'') from "WorkOrder" where id=${B}`);
    after === `DONE|${me}` && (await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").count()) > 0
      ? pass("คำสั่งปิดถึงเซิร์ฟเวอร์แล้ว (ฐานข้อมูล: ปิดงานโดยคนที่กด) แต่คำตอบหาย หน้าจอขึ้นว่าเน็ตหลุด")
      : fail(`ปิดผ่านแต่คำตอบหาย: ${after}`);
    await page.unroute(`**/api/work-orders/${B}/close`);
    await submit.click();
    await page.waitForTimeout(5000);
    const formGone = (await vis(page, "ยืนยันปิดงาน").count()) === 0;
    const staleToast = await vis(page, "โหลดข้อมูลล่าสุดให้แล้ว", false).count();
    const leftDraft = await page.evaluate((k) => localStorage.getItem(k), `draft:close:${B}`);
    // แจ้งเตือนสีแดงของรอบเน็ตหลุดค้างได้อีกไม่กี่วินาที — ดูเฉพาะหัวแถบ (ข้อความตรงตัว) ซึ่งต้องหายไปพร้อมฟอร์ม
    const banners = (await vis(page, "ส่งไม่สำเร็จ").count()) + (await vis(page, "ส่งไม่สำเร็จ — เน็ตหลุด").count());
    formGone && staleToast === 0 && banners === 0 && !!draft && leftDraft === null
      ? pass("กดซ้ำแล้วเซิร์ฟเวอร์บอกว่าปิดไปแล้ว: นับเป็นปิดสำเร็จ ฟอร์มปิด ร่างสรุปงานถูกล้าง ไม่มีคำเตือนข้อมูลเก่า")
      : fail(`กดซ้ำหลังคำตอบหาย: ฟอร์มปิด=${formGone} · เตือน409=${staleToast} · ร่างก่อน=${!!draft} · ร่างหลัง=${leftDraft}`);
    sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${B} and action='CLOSED'`) === "1" &&
      sql(`select status from "WorkOrder" where id=${B}`) === "DONE"
      ? pass("ประวัติปิดงานมีบรรทัดเดียว ใบปิดแล้ว (ฐานข้อมูล)")
      : fail(`ประวัติปิดงาน ${sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${B} and action='CLOSED'`)} บรรทัด`);
    await page.screenshot({ path: path.join(DIR, "claim-fixes-4-retried.png") });
    await page.close();

    // ── 5) งานของฉัน (ช่าง) ──
    page = await signIn("T001");
    await vis(page, codeC, false).first().waitFor({ timeout: 15000 }).catch(() => {});
    const cardC = page.locator(`[aria-label="งาน ${codeC}"]`).locator("visible=true").first();
    const cardB = page.locator(`[aria-label="งาน ${codeB}"]`).locator("visible=true").first();
    (await cardC.getByText("รอตรวจเคลม", { exact: true }).count()) > 0 &&
      (await cardC.getByText("ยังไม่นับว่าปิดงาน จนกว่าจะอนุมัติ — อาจถูกตีกลับมาให้แก้", { exact: true }).count()) > 0 &&
      (await cardC.getByText("✓ ปิดงานแล้ว", { exact: false }).count()) === 0
      ? pass("งานของฉัน: ใบรอตรวจเคลมขึ้น \"รอตรวจเคลม\" + ยังไม่นับว่าปิดงาน (ไม่ใช่ ✓ ปิดงานแล้ว)")
      : fail(`การ์ดใบรอตรวจเคลม: ${(await cardC.innerText().catch(() => "ไม่พบการ์ด")).replace(/\s+/g, " ").slice(0, 200)}`);
    (await cardB.getByText("✓ ปิดงานแล้ว", { exact: false }).count()) > 0 && (await cardB.getByText("รอตรวจเคลม", { exact: true }).count()) === 0
      ? pass("งานของฉัน: ใบที่ปิดจริงยังขึ้น \"✓ ปิดงานแล้ว\"")
      : fail(`การ์ดใบที่ปิดแล้ว: ${(await cardB.innerText().catch(() => "ไม่พบการ์ด")).replace(/\s+/g, " ").slice(0, 200)}`);
    await cardC.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "claim-fixes-5-myjobs.png") });
    await page.close();
  } catch (e) {
    fail(String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001';
         update "User" set team=nullif('${oldTeam}','') where "employeeCode"='T001'`);
    const left = sql(`select count(*) from "WorkOrder" where id in (${ids.length ? ids.join(",") : "0"})`);
    left === "0" ? pass("ลบใบทดสอบ สาขา เครื่อง และคืนภาค/ทีมของผู้ใช้ทดสอบแล้ว (ฐานข้อมูล)") : fail(`ใบทดสอบยังค้าง ${left} ใบ`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
