// ทดสอบ: เคลมก้อน 2 — Admin Spare Part เห็นทุกอย่างที่ต้องใช้ตัดสินบนจอเดียว ผ่านหน้าจอจริง
//   จอ 1280×656 (พื้นที่ใช้งานของจอ 1366×768 ตามตัวอย่างที่เจ้าของงานเลือก) · ใบเคลม 2 ชิ้น ถูกตีกลับมาแล้วหนึ่งรอบ ช่างส่งใหม่
//   1) เปิดใบแล้วเจอหน้าตรวจเคลมก่อนอย่างอื่น: หัว "{ใบ} · {สาขา} · W1 Huebsch" · "รอบ 2 · รอ {d} วัน" · ช่างที่ส่ง (ชื่อ + รหัส) ·
//      ในประกันถึง · เคลมซ้ำ (เครื่องใหม่ = ไม่พบ) · แถบสถานะ "… → รอ Admin Spare Part ตรวจ · {d} วัน" · เนื้อใบงานที่เหลือพับไว้
//      (ประวัติทั้งใบเลื่อนย้อนไป 1 วันด้วย psql ตอนเตรียม — d ต้องไม่ใช่ 0 · d คิดจากฐานข้อมูลตอนตรวจ ตามวันไทย)
//   2) แถบตัดสินอยู่ในจอทั้งแถบโดยไม่ต้องเลื่อน สูงไม่เกิน 56 · เลื่อนลงสุดก็ยังอยู่ที่เดิม
//   3) ข้อมูลเครื่องครั้งเดียว "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)" · ภาพตัดรุ่น · Error "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก"
//   4) แท็บชิ้นเป็นชื่ออะไหล่ "{ชื่อ} · ● รอตัดสิน" · ทุกชิ้นบอก "Troubleshooting x/y · เช็คตาม Error a/b" และข้อที่ไม่ได้ทำ "(ไม่ได้ทำ)"
//      — ชิ้นที่สองเปลี่ยน fieldCheck.offered ด้วย psql (ข้อที่ฟอร์มเคยให้เห็น ≠ คู่มือวันนี้) หน้าตรวจต้องนับจาก offered ของแถว
//   5) วิดีโอเล่นในหน้า (<video>) พร้อมปุ่ม "เปิดไฟล์" · วิดีโอที่ขึ้นคือไฟล์ล่าสุดของชิ้นนั้น (ฐานข้อมูล)
//      — วิดีโอเคลมใช้ site-clip.webm (VP8): Chromium ของ Playwright ไม่มีตัวถอด H.264 คลิป mp4 เล่นไม่ได้ ผู้เล่นจะถูกแทนด้วยกล่อง
//      "เบราว์เซอร์นี้เล่นไฟล์นี้ไม่ได้" แล้วข้อนี้ตกทั้งที่แอปถูก
//   6) รอบสอง: ป้าย "ใหม่รอบนี้" · "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม" · ชิ้นที่แก้อาการบอกค่าเดิม → ค่าใหม่ ·
//      รอบเก่าพับไว้ "รอบ 1 · ตีกลับ ▸" เปิดแล้วเห็นเหตุผล คนตรวจ และไฟล์เดิมที่เก็บเป็นประวัติ
//   7) "ดูรายละเอียดใบงาน ▸" เปิดเนื้อใบงานที่เหลือ + กล่องใบแจ้ง · "ซ่อนรายละเอียดใบงาน ▾" พับกลับ
//   8) แอดมินทั่วไปเปิดใบเดียวกัน: การ์ดเคลมแบบเดิม (หลักฐานรอบนี้ · แถบสถานะ · รอบเก่าพับไว้) ไม่มีแถบตัดสิน ·
//      ไม่มีบรรทัด ✗ "(ไม่ได้ทำ)" (เฉพาะคนตัดสินเคลม) แต่ยังเห็นข้อที่ทำ
//   9) Super Admin ดูในฐานะ Admin Spare Part: หน้าตรวจขึ้น แต่ไม่มีปุ่มตัดสิน — "ดูได้อย่างเดียว แก้ไขไม่ได้"
//  10) จอมือถือ 360×780: แถบตัดสินอยู่ในจอ ไม่มีเลื่อนซ้ายขวา · ปุ่มใบเคลมร่าง/แท็บชิ้นไม่ล้นขอบหน้าตรวจ (หน้าเลื่อนข้างไม่ได้ ล้นแล้วถูกตัดเงียบ ๆ)
//  11) กด "อนุมัติเคลม · ปิดงาน" ที่แถบ → ปิดงาน ทุกแถวของรอบนี้อนุมัติ (ฐานข้อมูล) หน้าตรวจหาย การ์ดเคลมขึ้น "อนุมัติแล้ว"
// วันนัด 12 วันข้างหน้าตอนปล่อยงาน (G10) · อะไหล่ตรงยี่ห้อเครื่องจาก fxPart (G0)
// ยืนยันผลที่ฐานข้อมูลทุกข้อที่เปลี่ยนข้อมูล · ต้องมี DATABASE_URL · รีสตาร์ท Expo ก่อนรัน (เว็บไม่เฝ้าไฟล์)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay, fxPart } = require("./fixture");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");
// VP8 — Chromium ของ Playwright เล่น H.264 (site-clip.mp4) ไม่ได้ (ดูหัวไฟล์ข้อ 5)
const CLIP = path.join(DIR, "..", "site-clip.webm");
const API = "http://localhost:4000/api";
// ภาพตัดบรรทัดรุ่นที่ใช้ได้จริง (PNG 1×1) — เหมือนของที่ช่างส่ง
const CROP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const REASON = "วิดีโอการตรวจเช็คไม่เห็นมิเตอร์ ถ่ายใหม่";
const SYMPTOM = "ประตูล็อกไม่ลง ขึ้น Error dL";
const SYMPTOM2 = "ประตูล็อกไม่ลง ขึ้น Error dL สายพานแตกร้าว";

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
  const bc = `DZCR${suf}`;
  const team = "กระบี่";
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const users = [`ZCRP${suf}`, `ZCRT${suf}`, `ZCRS${suf}`];
  const ids = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  let W = 1280;
  let H = 656;

  try {
    // ── เตรียม: สาขาแฟรนไชส์ในประกัน เครื่อง Huebsch · Admin Spare Part / ช่าง / Super Admin ของชุดนี้เอง ──
    sql(`update "User" set region='ใต้' where "employeeCode"='S001'`);
    const S = await login("S001");
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCRP${suf}','คุณวันดี ทดสอบตรวจ','PARTS_ADMIN','${hash}',false)`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('ZCRT${suf}','ช่างสมชาย ทดสอบตรวจ','EMPLOYEE','${hash}',false,'${team}')`);
    // Super Admin ทดสอบ — ยกสิทธิ์ในฐานข้อมูล (หน้าจอ/API สร้าง Super Admin ไม่ได้)
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('ZCRS${suf}','ซูเปอร์ทดสอบตรวจ','SUPER_ADMIN','${hash}',false)`);
    const PA = await login(`ZCRP${suf}`);
    const T = await login(`ZCRT${suf}`);
    const tid = Number(sql(`select id from "User" where "employeeCode"='ZCRT${suf}'`));
    const paId = Number(sql(`select id from "User" where "employeeCode"='ZCRP${suf}'`));
    sql(`insert into "Branch"(name,code,region,zone,ownership,"openedAt") values ('สาขาทดสอบตรวจเคลม','${bc}','ใต้','${team}','FRANCHISE',now()-interval '12 months')`);
    const bid = sql(`select id from "Branch" where code='${bc}'`);
    sql(`insert into "Machine"("branchId",code,type,brand,"updatedAt") values (${bid},'W1','WASHER','HB - Huebsch',now())`);

    const wo = await call(A, "POST", "/work-orders", {
      branchCode: bc, jobType: "CM", priority: "NORMAL", contactName: "คุณสมหญิง", contactPhone: "081-234-5678",
      machines: [{ code: "W1", model: "Huebsch", symptom: "ประตูล็อกไม่ลง" }],
    });
    const id = wo.orders ? wo.orders[0].id : wo.id;
    if (!id) throw new Error(`เปิดใบงานไม่สำเร็จ: ${JSON.stringify(wo).slice(0, 200)}`);
    ids.push(id);
    const sp1 = fxPart(id, "BOARD");
    const sp2 = fxPart(id, "BELT");
    const name1 = sql(`select name from "SparePart" where id=${sp1}`);
    const name2 = sql(`select name from "SparePart" where id=${sp2}`);
    const both = [sp1, sp2];
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: true, parts: both.map((s) => ({ sparePartId: s, quantity: 1 })) });
    await call(A, "POST", `/work-orders/${id}/parts-sourcing`, { results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94" })) });
    await call(S, "POST", `/work-orders/${id}/assign`, { team, scheduledAt: visitDay(12) });
    await call(A, "POST", `/work-orders/${id}/parts-check`, {
      results: both.map((s) => ({ sparePartId: s, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-CR${suf}` })),
    });
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error("เตรียมใบไม่ถึงขั้นเข้างาน");
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    const upload = async (role, file, type, sparePartId) => {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
      form.append("role", role);
      if (sparePartId) form.append("sparePartId", String(sparePartId));
      return call(T, "POST", `/work-orders/${id}/attachments`, form);
    };
    await call(T, "POST", `/work-orders/${id}/arrive`, {});
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) await upload(role, PHOTO, "image/png");
    for (const s of both) {
      for (const role of ["CLAIM_PART", "CLAIM_SYMPTOM"]) await upload(role, PHOTO, "image/png", s);
      for (const role of ["CLAIM_ERROR_VIDEO", "CLAIM_CHECK_VIDEO"]) await upload(role, CLIP, "video/webm", s);
    }
    const ts = (await call(T, "GET", `/work-orders/${id}`)).claimTroubleshooting ?? [];
    const closeBody = (symptomOf) => ({
      result: "FIXED", note: "เปลี่ยนบอร์ดกับสายพาน ทดสอบแล้วปกติ", workerIds: [tid], parts: both.map((s) => ({ sparePartId: s, quantity: 1 })),
      claims: both.map((s) => ({ sparePartId: s, brokenPartCode: `OLD-${s}`, symptom: symptomOf(s), checkNote: "วัดไฟเข้าบอร์ด 220V ปกติ", troubleshooting: ts })),
      claimNameplate: {
        fields: [
          { key: "model", label: "รุ่น", value: "HL055LWHPRXG6W0000", source: "SCAN", crop: CROP },
          { key: "serial", label: "Serial", value: "2402600330", source: "HAND" },
        ],
        verified: true,
      },
      claimCheck: { errorCode: "E dL / E dL1 / E dL2", checked: ["Solenoid ไม่ฝืด"] },
    });
    let closed = await call(T, "POST", `/work-orders/${id}/close`, closeBody(() => SYMPTOM));
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "CLAIM_REVIEW") throw new Error(`ปิดพร้อมเคลมไม่ผ่าน: ${JSON.stringify(closed).slice(0, 200)}`);
    // รอบแรกตีกลับทั้งใบ (คำสั่งแบบเดิม) → ช่างแนบวิดีโอการตรวจเช็คใหม่ให้ชิ้นแรก แก้อาการของชิ้นที่สอง แล้วส่งใหม่
    const rj = await call(PA, "POST", `/work-orders/${id}/claim-review`, { approve: false, reason: REASON });
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "IN_PROGRESS") throw new Error(`ตีกลับไม่สำเร็จ: ${JSON.stringify(rj).slice(0, 200)}`);
    await upload("CLAIM_CHECK_VIDEO", CLIP, "video/webm", sp1);
    closed = await call(T, "POST", `/work-orders/${id}/close`, closeBody((s) => (s === sp2 ? SYMPTOM2 : SYMPTOM)));
    if (sql(`select status from "WorkOrder" where id=${id}`) !== "CLAIM_REVIEW") throw new Error(`ส่งใหม่ไม่ผ่าน: ${JSON.stringify(closed).slice(0, 200)}`);
    sql(`select count(*) filter (where status='REJECTED')||'|'||count(*) filter (where status='PENDING') from "PartClaim" where "workOrderId"=${id}`) === "2|2"
      ? pass(`เตรียม ${code}: ส่งเคลม 2 ชิ้น → ตีกลับทั้งใบ → ช่างส่งใหม่ (รอบ 2) รอตรวจ (ฐานข้อมูล: ตีกลับ 2 แถว · รอตรวจ 2 แถว)`)
      : fail(`เตรียมรอบสอง: ${sql(`select string_agg(status,',' order by id) from "PartClaim" where "workOrderId"=${id}`)}`);
    // วิดีโอการตรวจเช็คล่าสุดของชิ้นแรก = ไฟล์ที่หน้าตรวจต้องเล่น (ไฟล์รอบแรกเก็บเป็นประวัติ)
    const newVideoKey = sql(`select "objectKey" from "WorkOrderAttachment" where "workOrderId"=${id} and role='CLAIM_CHECK_VIDEO' and "sparePartId"=${sp1} order by id desc limit 1`);
    // เลื่อนประวัติทั้งใบย้อนไป 1 วันพร้อมกัน (ใบงาน · ประวัติ · ไฟล์ · แถวเคลม) — ลำดับเวลาคงเดิม รอบหลักฐานไม่เพี้ยน
    // "รอ 0 วัน" ที่ตายตัวพิสูจน์อะไรไม่ได้ (คิดจากวันที่ผิด/ไม่มีวันที่ก็ได้ 0) ต้องเห็นเลขที่ไม่ใช่ 0 ที่คิดจากฐานข้อมูล
    sql(`update "WorkOrder" set "createdAt"="createdAt"-interval '1 day', "closedAt"="closedAt"-interval '1 day' where id=${id};
         update "WorkOrderLog" set "createdAt"="createdAt"-interval '1 day' where "workOrderId"=${id};
         update "WorkOrderAttachment" set "createdAt"="createdAt"-interval '1 day' where "workOrderId"=${id};
         update "PartClaim" set "createdAt"="createdAt"-interval '1 day', "reviewedAt"="reviewedAt"-interval '1 day' where "workOrderId"=${id}`);
    // รอกี่วัน ตามวันไทย ณ ตอนตรวจ — กติกาเดียวกับแอป (วันไทยของแถวที่รอตรวจล่าสุด ถึงวันนี้) ไม่พังเมื่อเทสต์คร่อมเที่ยงคืน
    const waitDays = () =>
      Number(sql(`select ((now() at time zone 'Asia/Bangkok')::date - max(("createdAt" at time zone 'UTC') at time zone 'Asia/Bangkok')::date)
                  from "PartClaim" where "workOrderId"=${id} and status='PENDING'`));
    if (waitDays() < 1) throw new Error(`เตรียม: เลื่อนประวัติแล้วยังรอ ${waitDays()} วัน`);
    // ชิ้นที่สอง: ข้อเช็คที่ฟอร์มเคยให้ช่างเห็น (offered) ต่างจากคู่มือวันนี้ — หน้าตรวจต้องนับ ✓/✗ จาก offered ของแถว
    // ไม่ใช่คู่มือปัจจุบัน (ถ้าแอปเลิกอ่าน offered ชิ้นนี้จะกลายเป็น 1/4 และขึ้นข้อที่ช่างไม่เคยเห็น)
    sql(`update "PartClaim" set "fieldCheck"=jsonb_set("fieldCheck",'{offered}','["Solenoid ไม่ฝืด","ข้อทดสอบเก่า"]'::jsonb)
         where "workOrderId"=${id} and "sparePartId"=${sp2} and status='PENDING'`);

    async function signIn(user, viewAsOf) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on("pageerror", (e) => errors.push(`${user}: ${e}`));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      if (viewAsOf) {
        // ดูในฐานะ: ใส่โทเคนแบบที่แอปเก็บเองตอนกด "ดูในฐานะ" (ตัวจริงเก็บไว้ใน token-self) แล้วโหลดใหม่
        const own = await login(user);
        const va = await call(own, "POST", "/auth/view-as", { userId: viewAsOf });
        if (!va.token) throw new Error(`ดูในฐานะไม่สำเร็จ: ${JSON.stringify(va).slice(0, 200)}`);
        await page.evaluate(([o, v]) => {
          localStorage.setItem("service-app/token-self", o);
          localStorage.setItem("service-app/token", v);
        }, [own, va.token]);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(3500);
        return page;
      }
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
      await page.waitForTimeout(3500);
      return page;
    }
    async function openOrder(page) {
      // จอกว้าง (≥ 1100) เมนูข้างกางค้าง ไม่มีแถบล่าง — ทางเข้าคือเมนู "ใบงานซ่อม" · มือถือใช้แท็บล่าง "ใบงาน"
      if (page.viewportSize().width >= 1100) {
        await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click({ timeout: 10000 });
      } else {
        await page.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click({ timeout: 10000 });
      }
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await page.getByText(code, { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3500);
    }
    const vis = (page, t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const inView = (box) => !!box && box.y >= 0 && box.y + box.height <= H + 0.5;
    const title = `${code} · ${bc} สาขาทดสอบตรวจเคลม · W1 Huebsch`;

    // ── 1) หน้าตรวจเคลมขึ้นก่อน ──
    let page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    const head = vis(page, title).first();
    await head.waitFor({ timeout: 15000 }).catch(() => {});
    const headBox = await head.boundingBox();
    const d1 = waitDays();
    headBox && headBox.y < 200 && (await vis(page, `รอบ 2 · รอ ${d1} วัน`).count()) > 0 && (await vis(page, "ดูรายละเอียดใบงาน ▸").count()) > 0
      ? pass(`หน้าตรวจเคลมขึ้นบนสุดของใบงาน (หัวอยู่ที่ y=${Math.round(headBox.y)}) · "รอบ 2 · รอ ${d1} วัน" (ตรงฐานข้อมูล) · รายละเอียดใบงานพับไว้`)
      : fail(`หัวหน้าตรวจเคลม: ${JSON.stringify(headBox)} · "รอบ 2 · รอ ${d1} วัน"=${await vis(page, `รอบ 2 · รอ ${d1} วัน`).count()}`);
    // เนื้อใบงานที่เหลือพับอยู่ — การ์ดขั้นตอน/ประวัติไม่อยู่บนจอ
    (await byLabel(page, "ขั้นตอนงาน").count()) === 0 && (await vis(page, "เคลมอะไหล่เก่า").count()) === 0
      ? pass("เนื้อใบงานที่เหลือ (ขั้นตอน · การ์ดเคลมแบบเดิม) พับไว้ ไม่แย่งที่หน้าตรวจ")
      : fail("เนื้อใบงานยังกางอยู่ใต้หน้าตรวจเคลม");
    const meta = (await page.locator('[aria-label="หน้าตรวจเคลม"]').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const d1b = waitDays();
    meta.includes(`ช่าง ช่างสมชาย ทดสอบตรวจ (ZCRT${suf}) · ส่ง `) && /✓ ในประกันถึง \d+ \S+ \d{2}/.test(meta) && meta.includes("✓ เคลมซ้ำ: ไม่พบที่เครื่องนี้") &&
      new RegExp(`ส่งเคลม .+ \\(ช่าง ช่างสมชาย ทดสอบตรวจ\\) → ตีกลับ .+ → ส่งใหม่ .+ → รอ Admin Spare Part ตรวจ · ${d1b} วัน`).test(meta)
      ? pass(`หัวบอก ช่างที่ส่ง (ชื่อ + รหัส ZCRT${suf}) · ในประกันถึง · เคลมซ้ำ (เครื่องใหม่ = ไม่พบ) · แถบสถานะ ส่งเคลม → ตีกลับ → ส่งใหม่ → รอ Admin Spare Part ตรวจ · ${d1b} วัน`)
      : fail(`หัวหน้าตรวจเคลม: ${meta.slice(0, 400)}`);

    // ── 2) แถบตัดสินอยู่ในจอ ──
    const bar = byLabel(page, "แถบตัดสินเคลม").first();
    const barBox = await bar.boundingBox();
    const okBox = await vis(page, "อนุมัติเคลม · ปิดงาน").first().boundingBox();
    const noBox = await vis(page, "ตีกลับให้ช่างแก้").first().boundingBox();
    inView(barBox) && barBox.height <= 57 && inView(okBox) && inView(noBox)
      ? pass(`แถบตัดสินอยู่ในจอทั้งแถบโดยไม่ต้องเลื่อน (สูง ${Math.round(barBox.height)} px · ล่างสุด y=${Math.round(barBox.y + barBox.height)})`)
      : fail(`แถบตัดสิน: แถบ ${JSON.stringify(barBox)} · อนุมัติ ${JSON.stringify(okBox)} · ตีกลับ ${JSON.stringify(noBox)}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-1-first-view.png") });

    // ── 3) ข้อมูลเครื่องครั้งเดียว ──
    const machine = byLabel(page, "ข้อมูลเครื่องในใบเคลม");
    (await machine.count()) === 1 && (await vis(page, "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)").count()) === 1 &&
      (await vis(page, "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก").count()) > 0 && (await byLabel(page, "ภาพตัดจากรูปป้าย รุ่น").count()) > 0 &&
      (await vis(page, "2402600330").count()) > 0
      ? pass("ข้อมูลเครื่องขึ้นครั้งเดียว (ใช้ร่วมทุกชิ้น): ภาพตัดรุ่น · Serial · Error \"E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก\"")
      : fail(`ข้อมูลเครื่อง: กล่อง ${await machine.count()} · หัว ${await vis(page, "ข้อมูลเครื่อง (ใช้ร่วมทุกชิ้น)").count()} · Error ${await vis(page, "E dL / E dL1 / E dL2 — ประตูล็อก/ปลดล็อก").count()}`);

    // ── 4) แท็บชิ้น + ข้อเช็ค ──
    const count = `ช่างเข้าเช็คอะไรบ้าง · Troubleshooting ${ts.length}/${ts.length} · เช็คตาม Error 1/4`;
    const count2 = `ช่างเข้าเช็คอะไรบ้าง · Troubleshooting ${ts.length}/${ts.length} · เช็คตาม Error 1/2`;
    (await vis(page, `${name1} · ● รอตัดสิน`).count()) === 1 && (await vis(page, `${name2} · ● รอตัดสิน`).count()) === 1
      ? pass(`แท็บชิ้นเป็นชื่ออะไหล่: "${name1} · ● รอตัดสิน" · "${name2} · ● รอตัดสิน"`)
      : fail("แท็บชิ้นไม่ได้ขึ้นชื่ออะไหล่");
    const checks1 = (await vis(page, count).count()) === 1 && (await vis(page, "ประตูไม่ตก กลอนเข้าร่อง (ไม่ได้ทำ)", false).count()) > 0;
    await vis(page, `${name2} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(600);
    const checks2 = (await vis(page, count2).count()) === 1 && (await vis(page, `ใบเคลม PDF (ร่าง) · ${name2}`).count()) === 1 &&
      (await vis(page, "ข้อทดสอบเก่า (ไม่ได้ทำ)", false).count()) > 0 && (await vis(page, "Limit switch ทำงาน", false).count()) === 0;
    checks1 && checks2
      ? pass(`ชิ้นแรก "${count.replace("ช่างเข้าเช็คอะไรบ้าง · ", "")}" ✗ "(ไม่ได้ทำ)" ตามคู่มือ · ชิ้นสองนับจาก offered ของแถว "เช็คตาม Error 1/2" + "ข้อทดสอบเก่า (ไม่ได้ทำ)" ไม่ขึ้นข้อในคู่มือวันนี้ · ปุ่มใบเคลมร่างตามชิ้นที่เปิด`)
      : fail(`ข้อเช็ค: ชิ้นแรก ${checks1} · ชิ้นสอง ${checks2} (1/2 ${await vis(page, count2).count()} · ข้อเก่า ${await vis(page, "ข้อทดสอบเก่า (ไม่ได้ทำ)", false).count()} · Limit switch ${await vis(page, "Limit switch ทำงาน", false).count()})`);
    // ชิ้นที่สองแก้อาการมา — บอกค่าเดิม → ค่าใหม่ (ตัดข้อความยาว)
    (await vis(page, /^แก้จากรอบก่อน: อาการ\/สาเหตุ .+ → .+/).count()) > 0
      ? pass("ชิ้นที่แก้อาการมา: \"แก้จากรอบก่อน: อาการ/สาเหตุ {เดิม} → {ใหม่}\"")
      : fail("ไม่บอกว่าชิ้นที่สองแก้อาการ/สาเหตุจากรอบก่อน");

    // ── 5) + 6) ชิ้นแรก: วิดีโอใหม่รอบนี้ ──
    await vis(page, `${name1} · ● รอตัดสิน`).first().click();
    await page.waitForTimeout(1500);
    const videos = page.locator("video").locator("visible=true");
    const srcs = await videos.evaluateAll((els) => els.map((e) => e.getAttribute("src") || ""));
    const keyTail = newVideoKey.split("/").pop();
    (await videos.count()) >= 2 && (await vis(page, "เปิดไฟล์").count()) >= 2 && srcs.some((s) => s.includes(keyTail))
      ? pass(`วิดีโอเล่นในหน้า ${await videos.count()} ตัว พร้อมปุ่ม "เปิดไฟล์" · วิดีโอการตรวจเช็คที่ขึ้นคือไฟล์ที่ช่างแนบใหม่ (ฐานข้อมูล)`)
      : fail(`วิดีโอในหน้า: ${await videos.count()} ตัว · ไฟล์ใหม่ ${keyTail} · src ${srcs.join(" | ").slice(0, 300)}`);
    (await vis(page, "หลักฐานรอบนี้:").count()) === 1 && (await vis(page, "ใหม่รอบนี้").count()) >= 1 &&
      (await vis(page, "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม").count()) === 1
      ? pass("ชิ้นแรก: \"หลักฐานรอบนี้:\" · ป้าย \"ใหม่รอบนี้\" · \"แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม\"")
      : fail(`ชิ้นแรก: หลักฐานรอบนี้ ${await vis(page, "หลักฐานรอบนี้:").count()} · ใหม่รอบนี้ ${await vis(page, "ใหม่รอบนี้").count()} · แก้จากรอบก่อน ${await vis(page, "แก้จากรอบก่อน: วิดีโอการตรวจเช็ค — ไฟล์ใหม่แทนไฟล์เดิม").count()}`);
    const oldBtn = vis(page, "รอบ 1 · ตีกลับ ▸");
    const folded = (await oldBtn.count()) === 1 && (await vis(page, `✗ ${name1} ตีกลับ — “${REASON}”`).count()) === 0;
    await oldBtn.first().click().catch(() => {});
    await page.waitForTimeout(500);
    (folded &&
      (await vis(page, "รอบ 1 · ตีกลับ ▾").count()) === 1 &&
      (await vis(page, /^รอบ 1 · ตีกลับ .+ โดยคุณวันดี ทดสอบตรวจ$/).count()) === 1 &&
      (await vis(page, `✗ ${name1} ตีกลับ — “${REASON}”`).count()) === 1 &&
      (await vis(page, `ไฟล์เดิมของ ${name1} · วิดีโอการตรวจเช็ค (รอบ 1) เก็บเป็นประวัติ ไม่ส่งไปกับใบเคลม`).count()) === 1)
      ? pass("รอบเก่าพับไว้ \"รอบ 1 · ตีกลับ ▸\" · เปิดแล้วบอกเวลา คนตรวจ เหตุผลรายชิ้น และไฟล์เดิมที่เก็บเป็นประวัติ")
      : fail(`รอบเก่า: พับ=${folded} · เปิด ${await vis(page, "รอบ 1 · ตีกลับ ▾").count()}`);
    // เลื่อนลงสุดของหน้าตรวจ แถบตัดสินยังอยู่ที่เดิม
    await vis(page, "รอบ 1 · ตีกลับ ▾").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(500);
    const barBox2 = await bar.boundingBox();
    inView(barBox2) && Math.abs(barBox2.y - barBox.y) < 1
      ? pass("เลื่อนลงสุดแล้วแถบตัดสินยังอยู่ที่เดิม (ไม่ได้เลื่อนตามเนื้อหา)")
      : fail(`แถบตัดสินหลังเลื่อน: ${JSON.stringify(barBox2)} (ก่อนเลื่อน ${JSON.stringify(barBox)})`);
    await page.screenshot({ path: path.join(DIR, "claim-review-2-part-old-rounds.png") });

    // ── 7) ดูรายละเอียดใบงาน ──
    await vis(page, "ดูรายละเอียดใบงาน ▸").first().click();
    await page.waitForTimeout(800);
    (await vis(page, "ซ่อนรายละเอียดใบงาน ▾").count()) === 1 && (await vis(page, /^ใบแจ้ง: “ประตูล็อกไม่ลง” · .*ผลการทำงาน:/).count()) === 1 &&
      (await byLabel(page, "ขั้นตอนงาน").count()) > 0
      ? pass("\"ดูรายละเอียดใบงาน ▸\" กางเนื้อใบงานที่เหลือ + กล่องใบแจ้ง/ผลการทำงาน")
      : fail(`กางรายละเอียดใบงาน: ซ่อน ${await vis(page, "ซ่อนรายละเอียดใบงาน ▾").count()} · ขั้นตอน ${await byLabel(page, "ขั้นตอนงาน").count()}`);
    await vis(page, "ซ่อนรายละเอียดใบงาน ▾").first().click();
    await page.waitForTimeout(500);
    (await byLabel(page, "ขั้นตอนงาน").count()) === 0 ? pass("\"ซ่อนรายละเอียดใบงาน ▾\" พับกลับ") : fail("พับรายละเอียดใบงานกลับไม่ได้");
    sql(`select status from "WorkOrder" where id=${id}`) === "CLAIM_REVIEW" &&
      sql(`select count(*) from "PartClaim" where "workOrderId"=${id} and status='PENDING'`) === "2"
      ? pass("ดูหน้าตรวจทั้งหมดแล้วยังไม่มีอะไรถูกส่ง (ฐานข้อมูล: รอตรวจ 2 แถว)")
      : fail("ดูหน้าตรวจแล้วข้อมูลเปลี่ยน");
    await page.close();

    // ── 8) แอดมินทั่วไป: การ์ดเคลมแบบเดิม ──
    page = await signIn("A001");
    await openOrder(page);
    const card = (await page.getByText("เคลมอะไหล่เก่า", { exact: true }).locator("visible=true").count()) > 0;
    const d8 = waitDays();
    (card && (await byLabel(page, "แถบตัดสินเคลม").count()) === 0 && (await vis(page, title).count()) === 0 &&
      (await vis(page, "หลักฐานรอบนี้:").count()) >= 2 && (await vis(page, "รอบ 1 · ตีกลับ ▸").count()) === 1 &&
      (await vis(page, `รอ Admin Spare Part ตรวจ · ${d8} วัน`).count()) > 0)
      ? pass(`แอดมินทั่วไป: การ์ดเคลมแบบเดิม (หลักฐานรอบนี้ทุกชิ้น · แถบสถานะ "รอ Admin Spare Part ตรวจ · ${d8} วัน" · รอบเก่าพับไว้) ไม่มีหน้าตรวจ/แถบตัดสิน`)
      : fail(`แอดมินทั่วไป: การ์ด=${card} · แถบตัดสิน ${await byLabel(page, "แถบตัดสินเคลม").count()} · หลักฐานรอบนี้ ${await vis(page, "หลักฐานรอบนี้:").count()} · รอ ${d8} วัน ${await vis(page, `รอ Admin Spare Part ตรวจ · ${d8} วัน`).count()}`);
    // ✗ "(ไม่ได้ทำ)" มีไว้ให้คนตัดสินเคลม (เจ้าของงานเลือกข้อ 7 ค) — แอดมินทั่วไป/ช่างเห็นแค่ข้อที่ทำ
    (await vis(page, "(ไม่ได้ทำ)", false).count()) === 0 && (await vis(page, "Solenoid ไม่ฝืด", false).count()) > 0
      ? pass("แอดมินทั่วไป: การ์ดเคลมไม่มีบรรทัด ✗ \"(ไม่ได้ทำ)\" (เฉพาะคนตัดสินเคลม) แต่ยังเห็นข้อเช็คที่ช่างทำ")
      : fail(`แอดมินทั่วไป ข้อเช็ค: ไม่ได้ทำ ${await vis(page, "(ไม่ได้ทำ)", false).count()} · ข้อที่ทำ ${await vis(page, "Solenoid ไม่ฝืด", false).count()}`);
    await page.close();

    // ── 9) Super Admin ดูในฐานะ Admin Spare Part ──
    page = await signIn(`ZCRS${suf}`, paId);
    await openOrder(page);
    (await vis(page, title).count()) > 0 && (await vis(page, "ดูได้อย่างเดียว แก้ไขไม่ได้").count()) > 0 &&
      (await vis(page, "อนุมัติเคลม · ปิดงาน").count()) === 0 && (await vis(page, "ตีกลับให้ช่างแก้").count()) === 0
      ? pass("Super Admin ดูในฐานะ Admin Spare Part: เห็นหน้าตรวจ ไม่มีปุ่มตัดสิน — \"ดูได้อย่างเดียว แก้ไขไม่ได้\"")
      : fail(`ดูในฐานะ: หัว ${await vis(page, title).count()} · ดูได้อย่างเดียว ${await vis(page, "ดูได้อย่างเดียว แก้ไขไม่ได้").count()} · ปุ่มอนุมัติ ${await vis(page, "อนุมัติเคลม · ปิดงาน").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-3-view-as.png") });
    await page.close();

    // ── 10) จอมือถือ ──
    W = 360;
    H = 780;
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    await vis(page, title).first().waitFor({ timeout: 15000 }).catch(() => {});
    const pBar = await byLabel(page, "แถบตัดสินเคลม").first().boundingBox();
    const pOk = await vis(page, "อนุมัติเคลม · ปิดงาน").first().boundingBox();
    const sideScroll = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    inView(pBar) && inView(pOk) && pOk.x + pOk.width <= W + 0.5 && sideScroll <= 1
      ? pass(`จอมือถือ 360×780: แถบตัดสินอยู่ในจอ (สูง ${Math.round(pBar.height)} px) · ไม่มีเลื่อนซ้ายขวา`)
      : fail(`จอมือถือ: แถบ ${JSON.stringify(pBar)} · ปุ่ม ${JSON.stringify(pOk)} · เกินขวา ${sideScroll}`);
    // หน้าตรวจอยู่ในส่วนที่เลื่อนข้างไม่ได้ ของที่ล้นถูกตัดเงียบ ๆ (scrollWidth ของหน้ายังเท่าเดิม) — วัดขอบขวาของปุ่ม/แท็บกับขอบหน้าตรวจ
    const pane = await page.locator('[aria-label="หน้าตรวจเคลม"]').locator("visible=true").first().boundingBox();
    const draft = await byLabel(page, `ใบเคลม PDF (ร่าง) · ${name1}`).first().boundingBox();
    const tabs = await Promise.all([name1, name2].map((n) => vis(page, `${n} · ● รอตัดสิน`).first().boundingBox()));
    const inside = (b) => !!b && !!pane && b.x >= pane.x - 0.5 && b.x + b.width <= pane.x + pane.width + 0.5;
    inside(draft) && tabs.every(inside)
      ? pass(`จอมือถือ: ปุ่ม "ใบเคลม PDF (ร่าง) · ${name1}" และแท็บชิ้นอยู่ในขอบหน้าตรวจ (ไม่ถูกตัด)`)
      : fail(`ปุ่ม/แท็บล้นหน้าตรวจ: หน้าตรวจ ${JSON.stringify(pane)} · ปุ่ม ${JSON.stringify(draft)} · แท็บ ${JSON.stringify(tabs)}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-4-phone.png") });
    await page.close();

    // ── 11) อนุมัติจากแถบ ──
    W = 1280;
    H = 656;
    page = await signIn(`ZCRP${suf}`);
    await openOrder(page);
    await vis(page, "อนุมัติเคลม · ปิดงาน").first().click();
    await page.waitForTimeout(4000);
    sql(`select w.status||'|'||string_agg(c.status,',' order by c.id) from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id} group by w.status`) ===
      "DONE|REJECTED,REJECTED,APPROVED,APPROVED"
      ? pass("กดอนุมัติที่แถบ: ใบงานปิด รอบแรกยังเป็นตีกลับ รอบสองอนุมัติทั้งสองชิ้น (ฐานข้อมูล)")
      : fail(`หลังอนุมัติ: ${sql(`select w.status||'|'||string_agg(c.status,',' order by c.id) from "WorkOrder" w join "PartClaim" c on c."workOrderId"=w.id where w.id=${id} group by w.status`)}`);
    (await byLabel(page, "แถบตัดสินเคลม").count()) === 0 && (await vis(page, "อนุมัติแล้ว").count()) >= 2 && (await vis(page, title).count()) === 0
      ? pass("หลังอนุมัติ: หน้าตรวจกับแถบตัดสินหายไป การ์ดเคลมขึ้น \"อนุมัติแล้ว\"")
      : fail(`หน้าจอหลังอนุมัติ: แถบ ${await byLabel(page, "แถบตัดสินเคลม").count()} · อนุมัติแล้ว ${await vis(page, "อนุมัติแล้ว").count()}`);
    await page.screenshot({ path: path.join(DIR, "claim-review-5-approved.png"), fullPage: true });
    await page.close();
  } catch (e) {
    fail(String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `/work-orders/${id}`);
    const list = users.map((u) => `'${u}'`).join(",");
    sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${bc}');
         delete from "Branch" where code='${bc}';
         delete from "ViewAsLog" where "byUserId" in (select id from "User" where "employeeCode" in (${list}))
           or "targetUserId" in (select id from "User" where "employeeCode" in (${list}));
         delete from "User" where "employeeCode" in (${list});
         update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    ids.length && sql(`select count(*) from "WorkOrder" where id in (${ids.join(",")})`) === "0"
      ? pass("ลบข้อมูลทดสอบแล้ว (ฐานข้อมูล: ไม่มีใบทดสอบค้าง)")
      : ids.length && fail("ใบทดสอบยังค้างในฐานข้อมูล");
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
