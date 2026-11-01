// ทดสอบผ่านเบราว์เซอร์: เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — ก้อน 3 การ์ดตั้งค่า + แท็บกล่องงาน · ก้อน 4 จอหัวหน้าภาค
//   ส่วน 1 (นับถอยหลัง — เวลาปิดรับ = อีก 45 นาที): แถบส้มบนงานของฉันวันนี้ "ปล่อยงานพรุ่งนี้ก่อน …" + "เหลือ N นาที" (N คิดจากนาฬิกาจริง)
//     · ป้ายบนการ์ด · ป้ายข้างปุ่มขั้นในหน้าใบงาน · กล่องเส้นตายในฟอร์ม · กดปล่อย → toast "ปล่อยงาน … เห็นในแท็บ “พรุ่งนี้” แล้ว"
//     ไม่มีกล่อง "อัปเดตสถานะแล้ว" ซ้อน · ฐานข้อมูล IN_PROGRESS + DISPATCHED
//   ส่วน 3 (กดตอนเวลาเพิ่งผ่าน): เปิดฟอร์มตอนยังกดได้ → เวลาปิดรับย้ายไปเมื่อนาทีก่อน (SQL) → กดปล่อย → ฟอร์มไม่ปิด กลายเป็นหน้าล็อก
//     พร้อม "คุณกดเมื่อ … ระบบได้รับหลังปิดรับจึงไม่รับ" · ฐานข้อมูลยัง ASSIGNED ไม่มี DISPATCHED
//   ส่วน 2 (ล็อกแล้ว): แถบ "เลยเวลาปล่อยงาน N ใบ" (N ตรงกับใบที่เซิร์ฟเวอร์บอกว่าล็อก) · ป้ายแดงบนการ์ด + ขอบแดง · ฟอร์ม: กล่องแดง
//     ทีมเลือกไม่ได้ ช่องบอกแอดมิน · ขอแอดมิน → ฟอร์มค้างเป็นกล่องม่วง "ส่งคำขอแล้ว" · กลับไปงานของฉัน → ป้ายม่วง · ยกเลิกคำขอ
//     · ส่งกลับไม่ใส่เหตุผล → บอกในฟอร์ม · ใส่แล้ว → toast + AWAITING_CONFIRM · ใบวันนัดผ่านแล้ว: กล่องแดงกับ "กลับไปงานของฉัน" เท่านั้น
//     · มือถือ 420: ปุ่มเรียงลงล่าง ไม่ล้นจอ
//   ส่วน 6 (กล่องงาน): แถบนับข้ามแท็บ (ใบล็อกอยู่แท็บจ่ายงาน แต่แถบขึ้นตอนเปิดแท็บงานแจ้งซ่อม)
//     · หัวหน้าภาคที่กล่องว่าง (ภาค/สาขาชั่วคราว) แต่มีงานพรุ่งนี้รอแอดมินคอนเฟิร์ม เห็น "งานพรุ่งนี้ยังไม่ถึงขั้นปล่อยงาน 1 ใบ" เหนือ "ไม่มีงานค้างรอคุณ"
//   ส่วน 5 (การ์ดตั้งค่า "เวลาปิดรับปล่อยงาน" ท้ายหน้าระบบหลังบ้าน)
//   · แอดมินแตะ 16:30 → บันทึกทันที (ไม่ถาม) · toast · ชิปที่เลือก · บรรทัด "เปลี่ยนล่าสุด: <ชื่อ> · 15:00 → 16:30 น." · ฐานข้อมูลมีแถวใหม่ของ A001
//   · เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านไปแล้ว (ใบพรุ่งนี้ที่ยังไม่ปล่อยจะล็อกทันที) → กล่องยืนยันบอกจำนวนใบ · "ยกเลิก" ไม่เขียนอะไร
//     · "ตั้งเป็น 15:00 น." บันทึก — จำนวนในกล่องตรงกับ dispatch-watch ของเซิร์ฟเวอร์
//   · Admin Spare Part เห็นการ์ด ชิปกดไม่ได้ · กดแรง ๆ ก็ไม่มีคำขอ PUT และฐานข้อมูลไม่เปลี่ยน
//   · จอมือถือ 420: การ์ดไม่ล้นจอ ชิปห้าตัวอยู่ในแถวเดียว
//   ส่วน 6 (แท็บกล่องงานหัวหน้าภาค)
//   · "ส่งช่างตรวจ" (INSPECT_DISPATCH) อยู่แท็บ จ่ายงาน/ปล่อยงาน ไม่อยู่แท็บงานแจ้งซ่อม (เจ้าของงานตอบข้อ ก)
//   ส่วน 4 (จอแอดมิน) มากับหน้าจอก้อน 5
//
// คุมเวลาไม่ให้ขึ้นกับว่ารันกี่โมง (tests/README "เทสต์ที่ขึ้นกับเวลาปิดรับ"):
//   · เวลาปิดรับจริงตั้งทาง SQL (แถวใหม่ใน AppSetting) แล้วเรียก GET /api/settings/dispatch-cutoff ให้เซิร์ฟเวอร์อ่านสด
//   · กล่องยืนยันขึ้นเมื่อ "ตอนนี้" เลยเวลาใหม่แล้ว — การ์ดเชื่อนาฬิกาเซิร์ฟเวอร์ (serverNow ในคำตอบ GET) ไม่ใช่นาฬิกาเครื่อง
//     เทสต์จึงแก้ serverNow ในคำตอบ GET ของหน้านั้นเป็น 15:30 ของวันนี้ แทนการรอให้ถึงบ่ายสาม (แผนเดิมข้ามข้อนี้ถ้ารันก่อน 15:00)
//     ถ้าการ์ดหันไปใช้นาฬิกาเครื่อง ข้อนี้จะล้มทุกครั้งที่รันนอก 15:00–23:59 — จับบั๊กแบบนั้นได้ด้วย
//     เวลาปิดรับจริงตั้งเป็น 23:59 ระหว่างข้อนี้ ใบพรุ่งนี้จึงยังไม่ล็อกจริง (ไม่งั้น dispatch-watch ไม่นับมัน)
//   · ก้อน 4 ตั้งเวลาปิดรับเป็น "ตอนนี้ ±นาที" (ทาง SQL) — ล็อก/ไม่ล็อกจึงไม่ขึ้นกับว่ารันกี่โมง · เวลาเริ่มใช้กฎ (createdAt แถวแรก)
//     ถอยไป 30 วันระหว่างรัน ใบวันนัดเมื่อวานจึงล็อกจริงแม้ migration เพิ่งรันวันนี้ · คืนค่าเดิมตอนจบ (จดค่าเดิมไว้เป็นแถว key อื่น)
//   · ตัวกันคร่อมเที่ยงคืน: 23:10–00:06 รอให้พ้นก่อน — เวลาปิดรับทดสอบ (+45 นาที · 23:59) จะข้ามวัน และ "พรุ่งนี้" เปลี่ยนกลางทาง
//     เช็คซ้ำก่อนก้อน 4 (23:00–00:06) — ส่วนก้อน 3 ใช้เวลาหลายนาที เช็คครั้งเดียวตอนเริ่ม +45 นาทีของก้อน 4 ยังข้ามเที่ยงคืนได้
//   · แถวที่เพิ่มลบทั้งหมดตอนจบ · จดเลขแถวสุดท้ายไว้เป็นแถว key อื่น (readCutoff อ่านเฉพาะ key='dispatchCutoff' ไม่มีผลกับแอป)
//     ถูกฆ่ากลางทาง รอบหน้าเจอแถวจดนี้ → FAIL แล้วลบแถวที่ค้างให้ ไม่ปล่อยให้แอปใช้เวลาผิดเงียบ ๆ
// ยืนยันที่ฐานข้อมูลทุกข้อ ไม่เชื่อหน้าจออย่างเดียว (CLAUDE.md) · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { setup, visitDay } = require("./fixture");

const APP = "http://localhost:8081";
const MARK = "dispatchCutoffWebTestMax";
const shot = (name) => path.join(__dirname, `dispatch-cutoff-${name}.png`);

(async () => {
  const fail = (m) => {
    console.log("FAIL", m);
    process.exitCode = 1;
  };
  const pass = (m) => console.log("PASS", m);
  const errors = [];

  /**
   * กันคร่อมเที่ยงคืน: ถ้าเวลาไทยอยู่ระหว่าง fromMin (นาทีของวัน) ถึง 00:06 รอให้พ้น 00:06 ก่อน
   * เรียกสองที่ เพราะเช็คครั้งเดียวตอนเริ่มไม่พอ — ก่อนถึงก้อน 4 มีส่วนก้อน 3 เปิดเบราว์เซอร์หลายรอบ
   * (รอบแรกหลัง expo-wt.sh รอ bundle ได้ถึง 3 นาที) เริ่ม 23:09 ไปถึงก้อน 4 ตอน 23:15 แล้ว +45 นาที = 00:00
   * เส้นตายของใบพรุ่งนี้กลายเป็นเที่ยงคืนที่ผ่านไปแล้ว ใบล็อกตั้งแต่ต้น ส่วน 1 ล้มทั้งที่แอปถูก
   */
  const waitPastMidnight = async (fromMin, why) => {
    const now = Date.now() + 7 * 3600e3;
    const d = new Date(now);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (m >= fromMin || m < 6) {
      const t = new Date(now);
      t.setUTCHours(0, 6, 0, 0);
      if (t.getTime() <= now) t.setUTCDate(t.getUTCDate() + 1);
      const wait = t.getTime() - now;
      console.log(`    รอข้ามเที่ยงคืน — ${why} (${Math.ceil(wait / 1000)} วินาที)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  };
  // ก่อนแตะฐานข้อมูลสักบรรทัด (ถูกฆ่าระหว่างรอจะไม่มีอะไรค้าง)
  await waitPastMidnight(23 * 60 + 10, "เวลาปิดรับทดสอบ 23:59 ของการ์ดตั้งค่าจะข้ามวัน");

  const fx = await setup();
  const { sql, call, A } = fx;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const suf = Date.now() % 100000;
  const PA = `ZDCW${suf}`;
  // ก้อน 4: หัวหน้าภาคชั่วคราวที่กล่องว่าง (ภาค + สาขาของตัวเอง) — ลบตอนจบ
  const ZS = `ZDCS${suf}`;
  const ZB = `ZDC${suf}`;
  const ZR = `ภาคทดสอบเวลาปิดรับ${suf}`;
  const SINCE_MARK = "dispatchCutoffWebTestSince";
  let sinceSaved = null;
  let zOrder = null;
  let MAXSET = null;
  const latest = () =>
    sql(`select value||'|'||coalesce("createdById"::text,'-') from "AppSetting" where key='dispatchCutoff' order by id desc limit 1`);
  const maxId = () => Number(sql(`select coalesce(max(id),0) from "AppSetting" where key='dispatchCutoff'`));
  const refresh = () => call(A, "GET", "/settings/dispatch-cutoff");
  const setCut = async (v) => {
    sql(`insert into "AppSetting"(key,value) values ('dispatchCutoff','${v}')`);
    await refresh();
  };

  try {
    // แถวที่รอบก่อนทิ้งไว้ต้องโผล่เป็น FAIL — แถวล่าสุดคือเวลาที่ทั้งแอปใช้อยู่ ค้างไว้ทุกชุดที่รันต่อจะได้ผลผิด
    const left = sql(`select value from "AppSetting" where key='${MARK}' order by id limit 1`);
    if (left) {
      const ids = sql(`select string_agg(id||'='||value, ' ' order by id) from "AppSetting" where key='dispatchCutoff' and id > ${Number(left)}`);
      fail(`มีแถวเวลาปิดรับที่เทสต์นี้รอบก่อนทิ้งไว้ (${ids || "ไม่มีแถวค้าง เหลือแค่แถวจด"}) — ลบออกแล้ว รอบหน้าจะผ่าน`);
      sql(`delete from "AppSetting" where key='dispatchCutoff' and id > ${Number(left)}; delete from "AppSetting" where key='${MARK}'`);
    }
    // เวลาเริ่มใช้กฎที่รอบก่อนถอยไว้แล้วไม่ได้คืน (ถูกฆ่ากลางทาง) — คืนให้ก่อน แล้วโผล่เป็น FAIL
    const leftSince = sql(`select value from "AppSetting" where key='${SINCE_MARK}' order by id limit 1`);
    if (leftSince) {
      const [sid, sat] = leftSince.split("|");
      sql(`update "AppSetting" set "createdAt"='${sat}'::timestamp where id=${Number(sid)}; delete from "AppSetting" where key='${SINCE_MARK}'`);
      fail(`เวลาเริ่มใช้กฎที่เทสต์นี้รอบก่อนถอยไว้ยังไม่ได้คืน (แถว ${sid}) — คืนค่าเดิม ${sat} แล้ว`);
    }
    MAXSET = Number(sql(`select coalesce(max(id),0) from "AppSetting"`));
    sql(`insert into "AppSetting"(key,value) values ('${MARK}','${MAXSET}')`);

    const aId = sql(`select id from "User" where "employeeCode"='A001'`);
    const aName = sql(`select name from "User" where "employeeCode"='A001'`);
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('${PA}','แอดมินอะไหล่ทดสอบเวลาปิดรับ','PARTS_ADMIN','${hash}',false)`);

    const openAs = async (code, width, height = 1000) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ — "ระบบหลังบ้าน" อยู่ในกลุ่มผู้ดูแลระบบ จึงกางทุกกลุ่มไว้ก่อน
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(`${code}: ${e}`));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      return { ctx, page, vis };
    };
    const card = (page) => page.locator('[aria-label="การ์ดเวลาปิดรับปล่อยงาน"]').locator("visible=true").first();
    const chip = (page, v) => card(page).locator(`[aria-label="${v}"]`).first();
    const checked = async (page, v) => (await chip(page, v).getAttribute("aria-checked").catch(() => null)) === "true";
    const openSettings = async (s, phone = false) => {
      await (phone ? s.vis("Admin").last() : s.vis("ระบบหลังบ้าน").first()).click();
      await card(s.page).waitFor({ timeout: 20000 });
      // การ์ดโหลดค่าจากเซิร์ฟเวอร์ — รอจนบรรทัดล่างไม่ใช่ "กำลังโหลด…"
      await s.page.waitForFunction(
        () => ![...document.querySelectorAll('[aria-label="การ์ดเวลาปิดรับปล่อยงาน"]')].some((n) => n.innerText.includes("กำลังโหลดเวลาปิดรับ")),
        null,
        { timeout: 15000 }
      );
      await s.page.waitForTimeout(500);
    };

    // ── 5) การ์ดตั้งค่า — แอดมิน จอคอม ──
    // เริ่มจาก 15:00 (ใส่ทาง SQL ไม่มีชื่อคนเปลี่ยน) แล้วแตะ 16:30 = เลื่อนให้ช้าลง ไม่มีทางล็อกอะไรทันที → ต้องไม่ถาม ไม่ว่ากี่โมง
    await setCut("15:00");
    const a = await openAs("A001", 1280);
    await openSettings(a);
    const cardText = await card(a.page).innerText();
    (await a.vis("ตั้งค่า").count()) &&
    cardText.includes("เวลาปิดรับปล่อยงาน") &&
    cardText.includes("งานของพรุ่งนี้ต้องปล่อยให้ช่างก่อนเวลานี้ · ทุกวันรวมเสาร์–อาทิตย์และวันหยุด · ใช้ทุกภาค · แอดมินเปลี่ยนได้ (Admin Spare Part ดูอย่างเดียว)")
      ? pass("หน้าระบบหลังบ้านมีหัวข้อ ตั้งค่า + การ์ดเวลาปิดรับปล่อยงานพร้อมคำอธิบายตามตัวอย่าง")
      : fail(`การ์ดตั้งค่าไม่ครบ: ${cardText.slice(0, 200)}`);
    const five = [];
    for (const v of ["15:00", "15:30", "16:00", "16:30", "17:00"]) five.push(await chip(a.page, v).count());
    five.every((n) => n === 1) ? pass("ชิปเวลาครบ 5 ตัว 15:00–17:00 ทีละครึ่งชั่วโมง") : fail(`ชิปเวลา: ${five}`);
    (await checked(a.page, "15:00")) && !(await checked(a.page, "16:30"))
      ? pass("ชิปที่เลือกตรงกับค่าในฐานข้อมูล (15:00)")
      : fail("ชิปที่เลือกไม่ตรงค่าในฐานข้อมูล");
    cardText.includes("→ 15:00 น. · มีผลกับการกดครั้งต่อไปทันที ใบที่ปล่อยไปแล้วไม่เปลี่ยน")
      ? pass("บรรทัดเปลี่ยนล่าสุดบอกค่าใหม่ 15:00")
      : fail(`บรรทัดเปลี่ยนล่าสุด: ${cardText}`);

    // จดคำขอของหน้านี้ — ตรงนี้ยังไม่มีใบพรุ่งนี้รอปล่อย (จำนวนในกล่องยืนยัน = 0) กล่องไม่ขึ้นอยู่แล้วต่อให้การ์ดคิดผิดว่า "ล็อกทันที"
    // ด่านที่จับได้จริงคือการ์ดไม่ไปนับใบที่ dispatch-watch เลย: การ์ดนับเฉพาะตอนตัดสินว่าล็อกทันที เลื่อนให้ช้าลงต้องไม่นับไม่ว่ากี่โมง
    // นับเฉพาะช่วงแตะ — หน้าจออื่นที่ค้างอยู่เบื้องหลัง (งานของฉันวันนี้ ก้อน 4) ก็เรียก dispatch-watch ตอนโหลดของมันเอง
    const reqs = [];
    a.page.on("request", (r) => reqs.push(`${r.method()} ${r.url()}`));
    const watchCalls = (from) => reqs.slice(from).filter((x) => x.startsWith("GET ") && x.includes("/work-orders/dispatch-watch")).length;
    const putCalls = (from) => reqs.slice(from).filter((x) => x.startsWith("PUT ") && x.includes("/settings/dispatch-cutoff")).length;
    const before = maxId();
    const r16 = reqs.length;
    await chip(a.page, "16:30").click();
    const toast16 = "ตั้งเวลาปิดรับปล่อยงานเป็น 16:30 น. แล้ว — มีผลกับการกดครั้งต่อไปทันที";
    const toastSeen = await a.vis(toast16).first().waitFor({ timeout: 6000 }).then(() => true, () => false);
    await a.page.waitForTimeout(600);
    (await a.vis("ตั้งเวลาปิดรับเป็น 16:30 น.?", false).count()) === 0
      ? pass("เลื่อนให้ช้าลง (15:00 → 16:30) บันทึกทันที ไม่มีกล่องยืนยัน")
      : fail("ขึ้นกล่องยืนยันทั้งที่ไม่มีใบล็อกทันที");
    watchCalls(r16) === 0 && putCalls(r16) === 1
      ? pass("เลื่อนให้ช้าลง: การ์ดไม่ไปนับใบที่จะล็อก (dispatch-watch 0 ครั้ง) ส่ง PUT ครั้งเดียว")
      : fail(`เลื่อนให้ช้าลงแล้วการ์ดเรียก dispatch-watch ${watchCalls(r16)} ครั้ง · PUT ${putCalls(r16)} ครั้ง — การ์ดคิดว่าล็อกทันที`);
    latest() === `16:30|${aId}` && maxId() - before === 1
      ? pass("แตะ 16:30 → ฐานข้อมูลมีแถวใหม่ 1 แถว ค่า 16:30 คนเปลี่ยน A001")
      : fail(`หลังแตะ 16:30 ฐานข้อมูล: ${latest()} · แถวใหม่ ${maxId() - before}`);
    toastSeen ? pass(`toast: ${toast16}`) : fail("ไม่เห็น toast หลังตั้งเวลา");
    const after16 = await card(a.page).innerText();
    (await checked(a.page, "16:30")) && !(await checked(a.page, "15:00"))
      ? pass("ชิป 16:30 เป็นตัวที่เลือก")
      : fail("ชิปที่เลือกไม่เปลี่ยนเป็น 16:30");
    after16.includes(`เปลี่ยนล่าสุด: ${aName} · 15:00 → 16:30 น. · มีผลกับการกดครั้งต่อไปทันที ใบที่ปล่อยไปแล้วไม่เปลี่ยน`)
      ? pass(`บรรทัดเปลี่ยนล่าสุด: ${aName} · 15:00 → 16:30 น.`)
      : fail(`บรรทัดเปลี่ยนล่าสุดหลังแตะ: ${after16}`);
    // แตะตัวที่เลือกอยู่แล้วซ้ำ — ไม่ส่งอะไร (เซิร์ฟเวอร์ตอบ "เป็นเวลานี้อยู่แล้ว" ถ้าส่ง ผู้ใช้จะเห็นแจ้งเตือนแดงทั้งที่ไม่ได้ทำอะไรผิด)
    // ฐานข้อมูลไม่มีทางเพิ่มแถวอยู่แล้ว (เซิร์ฟเวอร์ปฏิเสธค่าเดิม) — ด่านจริงคือไม่มีคำขอ PUT ออกไปเลย
    const same = maxId();
    const rSame = reqs.length;
    await chip(a.page, "16:30").click();
    await a.page.waitForTimeout(1200);
    putCalls(rSame) === 0 && maxId() === same && (await a.vis("เป็นเวลานี้อยู่แล้ว", false).count()) === 0
      ? pass("แตะเวลาที่เลือกอยู่แล้วซ้ำ ไม่ส่งคำขอ ไม่บันทึก ไม่ขึ้นข้อผิดพลาด")
      : fail(`แตะซ้ำแล้ว: PUT ${putCalls(rSame)} ครั้ง · แถวใหม่ ${maxId() - same}`);
    await a.page.screenshot({ path: shot("1-settings"), fullPage: true });

    // ── 5) กล่องยืนยันก่อนเปลี่ยนเวลาที่ทำให้ใบพรุ่งนี้ล็อกทันที ──
    // ใบพรุ่งนี้ที่ถึงขั้นปล่อยงานแล้วแต่ยังไม่ปล่อย 1 ใบ (ใบไม่ใช้อะไหล่ → นัดพรุ่งนี้ → แอดมินคอนเฟิร์มวันเดิม)
    await setCut("23:59");
    const T = await fx.workOrder("C0006", []);
    await fx.schedule(T.id, visitDay(1));
    await fx.confirm(T.id);
    const tRow = sql(`select status||'|'||to_char("scheduledAt",'YYYY-MM-DD') from "WorkOrder" where id=${T.id}`);
    tRow === `ASSIGNED|${visitDay(1)}` ? pass(`เตรียมใบพรุ่งนี้รอปล่อยงาน ${T.code} (ฐานข้อมูล)`) : fail(`เตรียมใบพรุ่งนี้: ${tRow}`);
    const watch = await call(A, "GET", "/work-orders/dispatch-watch");
    const unreleased = watch.unreleasedTomorrow ?? [];
    const n = unreleased.length;
    unreleased.some((w) => w.id === T.id)
      ? pass(`dispatch-watch นับ ${T.code} ในงานพรุ่งนี้ที่ยังไม่ปล่อย (ทั้งหมด ${n} ใบ)`)
      : fail(`dispatch-watch ไม่มี ${T.code}: ${JSON.stringify(watch).slice(0, 300)}`);

    // นาฬิกาเซิร์ฟเวอร์ที่การ์ดเห็น = 15:30 ของวันนี้ (เวลาไทย) — แก้เฉพาะคำตอบ GET ของการ์ด คำขอ PUT/dispatch-watch ไปเซิร์ฟเวอร์จริง
    const fakeNow = new Date(`${visitDay(0)}T15:30:00.000+07:00`).toISOString();
    await a.page.route("**/api/settings/dispatch-cutoff", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const resp = await route.fetch();
      const json = await resp.json();
      json.serverNow = fakeNow;
      await route.fulfill({ response: resp, json });
    });
    await a.page.reload({ waitUntil: "networkidle" });
    await a.page.waitForTimeout(3000);
    await openSettings(a);
    const text59 = await card(a.page).innerText();
    const none = [];
    for (const v of ["15:00", "15:30", "16:00", "16:30", "17:00"]) none.push(await checked(a.page, v));
    !none.some(Boolean) && text59.includes("→ 23:59 น.")
      ? pass("ค่าปัจจุบัน 23:59 (นอกตัวเลือก — ตั้งทาง SQL) ไม่มีชิปไหนเลือก บรรทัดเปลี่ยนล่าสุดบอก 23:59")
      : fail(`การ์ดตอนค่า 23:59: ${none} · ${text59}`);

    const m1 = maxId();
    await chip(a.page, "15:00").click();
    const askTitle = a.vis("ตั้งเวลาปิดรับเป็น 15:00 น.?");
    const asked = await askTitle.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    const body = `ตอนนี้เลย 15:00 น. แล้ว — ใบพรุ่งนี้ที่ยังไม่ปล่อย ${n} ใบจะล็อกทันที หัวหน้าภาคกดปล่อยไม่ได้ ต้องให้แอดมินแก้เป็นงานด่วนทีละใบ`;
    asked && (await a.vis(body).count())
      ? pass(`เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านแล้ว → กล่องยืนยันบอก ${n} ใบ (ตรงกับ dispatch-watch)`)
      : fail(`ไม่ขึ้นกล่องยืนยัน/จำนวนไม่ตรง (คาด ${n} ใบ)`);
    maxId() === m1 ? pass("ระหว่างกล่องยืนยันเปิดอยู่ ยังไม่มีอะไรบันทึก (ฐานข้อมูล)") : fail("บันทึกก่อนกดยืนยัน");
    await a.page.screenshot({ path: shot("2-confirm") });
    if (asked) {
      await a.vis("ยกเลิก").last().click();
      await a.page.waitForTimeout(1500);
      maxId() === m1 && latest() === "23:59|-" && (await askTitle.count()) === 0
        ? pass("กด ยกเลิก → กล่องปิด ฐานข้อมูลไม่เปลี่ยน (ยัง 23:59)")
        : fail(`กดยกเลิกแล้วฐานข้อมูล: ${latest()} · แถวใหม่ ${maxId() - m1}`);
      await chip(a.page, "15:00").click();
      await askTitle.first().waitFor({ timeout: 8000 }).catch(() => {});
      await a.vis("ตั้งเป็น 15:00 น.").last().click();
      await a.page.waitForTimeout(2000);
      latest() === `15:00|${aId}` && maxId() === m1 + 1
        ? pass("กด ตั้งเป็น 15:00 น. → ฐานข้อมูลมีแถวใหม่ ค่า 15:00 คนเปลี่ยน A001")
        : fail(`หลังยืนยัน ฐานข้อมูล: ${latest()} · แถวใหม่ ${maxId() - m1}`);
      (await checked(a.page, "15:00")) ? pass("ชิป 15:00 เป็นตัวที่เลือกหลังยืนยัน") : fail("ชิปไม่เปลี่ยนหลังยืนยัน");
    }
    await a.page.unroute("**/api/settings/dispatch-cutoff");
    await a.ctx.close();

    // ── 5) Admin Spare Part ดูอย่างเดียว ──
    const p = await openAs(PA, 1280);
    const puts = [];
    p.page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("/settings/dispatch-cutoff")) puts.push(r.url());
    });
    await openSettings(p);
    const paText = await card(p.page).innerText();
    const dis = [];
    for (const v of ["15:00", "15:30", "16:00", "16:30", "17:00"]) dis.push(await chip(p.page, v).getAttribute("aria-disabled").catch(() => null));
    (await p.vis("จัดการข้อมูลอะไหล่").count()) && paText.includes("เวลาปิดรับปล่อยงาน") && dis.every((d) => d === "true")
      ? pass("Admin Spare Part: เห็นการ์ดเวลาปิดรับคู่กับจัดการข้อมูลอะไหล่ · ชิปทั้ง 5 กดไม่ได้")
      : fail(`Admin Spare Part: การ์ด/ชิป ${dis}`);
    (await checked(p.page, "15:00")) ? pass("Admin Spare Part เห็นค่าปัจจุบัน (15:00)") : fail("Admin Spare Part ไม่เห็นค่าปัจจุบัน");
    const m2 = maxId();
    await chip(p.page, "16:00").click({ force: true });
    await p.page.waitForTimeout(1500);
    maxId() === m2 && puts.length === 0
      ? pass("Admin Spare Part กดชิปแรง ๆ ก็ไม่ส่งคำขอเปลี่ยน ฐานข้อมูลไม่เปลี่ยน")
      : fail(`Admin Spare Part กดแล้ว: PUT ${puts.length} ครั้ง · แถวใหม่ ${maxId() - m2}`);
    await p.page.screenshot({ path: shot("3-parts-admin"), fullPage: true });
    await p.ctx.close();

    // ── 5) จอมือถือ ──
    const ph = await openAs("A001", 420, 900);
    await openSettings(ph, true);
    const fit = await ph.page.evaluate(() => {
      const box = document.querySelector('[aria-label="การ์ดเวลาปิดรับปล่อยงาน"]');
      const chips = [...(box?.querySelectorAll('[role="radio"]') ?? [])].map((c) => c.getBoundingClientRect());
      return {
        n: chips.length,
        right: Math.max(...chips.map((r) => r.right)),
        rows: new Set(chips.map((r) => Math.round(r.top))).size,
        scroll: document.scrollingElement.scrollWidth,
      };
    });
    fit.n === 5 && fit.right <= 420 && fit.rows === 1 && fit.scroll <= 420
      ? pass("มือถือ 420: ชิปห้าตัวอยู่แถวเดียวในจอ หน้าไม่เลื่อนข้าง")
      : fail(`มือถือ 420: ${JSON.stringify(fit)}`);
    await card(ph.page).scrollIntoViewIfNeeded();
    await ph.page.screenshot({ path: shot("4-phone") });
    await ph.ctx.close();

    // ── 6) ส่งช่างตรวจอยู่แท็บ จ่ายงาน/ปล่อยงาน ──
    // วันตรวจ D+30 — เส้นตายยังไกล ข้อนี้ไม่ขึ้นกับเวลาปิดรับ
    const V = await fx.workOrder("C0006", null);
    const vd = await call(A, "GET", `/work-orders/${V.id}`);
    await call(fx.supervisor(), "POST", `/work-orders/${V.id}/inspect-request`, { team: vd.suggestedTeam, scheduledAt: visitDay(30) });
    await fx.confirm(V.id);
    const vRow = sql(`select status from "WorkOrder" where id=${V.id}`);
    vRow === "INSPECT_DISPATCH" ? pass(`เตรียมใบรอส่งช่างตรวจ ${V.code} (ฐานข้อมูล)`) : fail(`เตรียมใบส่งช่างตรวจ: ${vRow}`);
    const s = await openAs("S001", 1300, 1100);
    await s.vis("กล่องงานของฉัน").first().click();
    await s.page.waitForTimeout(3500);
    const search = s.page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
    const inTab = async (name) => {
      await s.page.locator(`[aria-label^="แท็บ ${name}"]`).locator("visible=true").first().click();
      await s.page.waitForTimeout(1200);
      await search.fill(V.code);
      await s.page.waitForTimeout(1200);
      return (await s.vis(V.code).count()) > 0;
    };
    const inDispatch = await inTab("จ่ายงาน/ปล่อยงาน");
    await s.page.screenshot({ path: shot("5-inbox-tab") });
    const inRepair = await inTab("งานแจ้งซ่อม");
    inDispatch && !inRepair
      ? pass("ส่งช่างตรวจ (INSPECT_DISPATCH) อยู่แท็บ จ่ายงาน/ปล่อยงาน ไม่อยู่แท็บงานแจ้งซ่อม")
      : fail(`แท็บของใบส่งช่างตรวจ: จ่ายงาน=${inDispatch} งานแจ้งซ่อม=${inRepair}`);
    await search.fill("");
    await s.ctx.close();

    // ════════════════ ก้อน 4: จอหัวหน้าภาค ════════════════
    // เช็คเที่ยงคืนอีกรอบก่อนสร้างใบและคิดวันนี้/พรุ่งนี้ — ตั้งแต่ 23:00 เผื่อเวลาสร้างใบห้าใบก่อนตั้ง +45 นาที
    // และให้ทั้งก้อน 4 จบก่อนเที่ยงคืน ("พรุ่งนี้" ห้ามเปลี่ยนกลางทาง ใบพรุ่งนี้จะกลายเป็นใบวันนี้)
    await waitPastMidnight(23 * 60, "เวลาปิดรับทดสอบ (+45 นาที) จะข้ามวัน และ \"พรุ่งนี้\" เปลี่ยนระหว่างก้อน 4");
    // เวลาเริ่มใช้กฎถอยไป 30 วัน — ใบวันนัดเมื่อวาน (ส่วน 2) ต้องล็อกจริง ไม่ใช่ "ค้างมาก่อนเปิดกฎ" เพราะ migration เพิ่งรันวันนี้
    const seedId = sql(`select id from "AppSetting" where key='dispatchCutoff' order by id asc limit 1`);
    if (seedId) {
      const seedAt = sql(`select to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS') from "AppSetting" where id=${seedId}`);
      sql(`insert into "AppSetting"(key,value) values ('${SINCE_MARK}','${seedId}|${seedAt}')`);
      sql(`update "AppSetting" set "createdAt"=now()-interval '30 days' where id=${seedId}`);
      sinceSaved = { id: seedId, at: seedAt };
    }
    const pad2 = (n) => String(n).padStart(2, "0");
    /** "HH:MM" ตามเวลาไทยอีก off นาทีจากตอนนี้ (ตัดวินาทีทิ้ง) — เวลาปิดรับทดสอบ */
    const bkk = (off) => {
      const d = new Date(Date.now() + 7 * 3600e3 + off * 60e3);
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    };
    const S = fx.supervisor();
    const today = visitDay(0);
    const tomorrow = visitDay(1);
    const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
    const lastLog = (id) => sql(`select action||'|'||coalesce(note,'') from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`);
    const logCount = (id, action) => Number(sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='${action}'`));
    /** ใบพรุ่งนี้ (หรือวันอื่น) ที่ถึงขั้นรับทราบ ปล่อยงานแล้ว — ไม่ใช้อะไหล่ → นัด → แอดมินคอนเฟิร์มวันเดิม */
    const releaseOrder = async (day = tomorrow) => {
      const o = await fx.workOrder("C0006", []);
      await fx.schedule(o.id, day);
      await fx.confirm(o.id);
      return o;
    };
    const T1 = await releaseOrder(); // ส่วน 1 นับถอยหลังแล้วปล่อย
    const R1 = await releaseOrder(); // ส่วน 3 กดตอนเวลาเพิ่งผ่าน
    const L1 = await releaseOrder(); // ส่วน 2 ขอแอดมิน / ยกเลิก / ส่งกลับ
    const L2 = await releaseOrder(); // ส่วน 2 มือถือ · ส่วน 6 แถบนับข้ามแท็บ
    const P1 = await releaseOrder(); // ส่วน 2 วันนัดผ่านแล้ว (ย้ายวันทาง SQL ข้างล่าง)
    sql(`update "WorkOrder" set "scheduledAt"='${visitDay(-1)}'::timestamp where id=${P1.id}`);
    const prep = [T1, R1, L1, L2].map((o) => sql(`select status||'|'||to_char("scheduledAt",'YYYY-MM-DD') from "WorkOrder" where id=${o.id}`));
    prep.every((r) => r === `ASSIGNED|${tomorrow}`) && sql(`select status||'|'||to_char("scheduledAt",'YYYY-MM-DD') from "WorkOrder" where id=${P1.id}`) === `ASSIGNED|${visitDay(-1)}`
      ? pass(`เตรียมใบรอปล่อยงาน: พรุ่งนี้ 4 ใบ (${T1.code} ${R1.code} ${L1.code} ${L2.code}) · เมื่อวาน 1 ใบ (${P1.code}) (ฐานข้อมูล)`)
      : fail(`เตรียมใบรอปล่อยงาน: ${prep.join(" ")}`);
    const teamOf = (id) => sql(`select coalesce("assignedTeam",'') from "WorkOrder" where id=${id}`);

    /** การ์ดของใบในงานของฉันวันนี้ — ขึ้นจากปุ่ม "รายละเอียด <code>" ไปจนถึงกล่องที่ข้อความขึ้นต้นด้วยรหัสใบ */
    const queueCard = (page, code) =>
      page.evaluate((code) => {
        const btn = [...document.querySelectorAll(`[aria-label="รายละเอียด ${code}"]`)].find((n) => n.getClientRects().length);
        let el = btn;
        while (el && !(el.innerText || "").trim().startsWith(code)) el = el.parentElement;
        if (!el) return null;
        return {
          text: el.innerText,
          labels: [...el.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label")),
          border: getComputedStyle(el).borderTopWidth,
        };
      }, code);
    const toQueue = async (sess) => {
      await sess.page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await sess.page.locator('[aria-label="ตัวเลขสรุปงานที่รอ"]').locator("visible=true").first().waitFor({ timeout: 30000 });
      await sess.page.waitForTimeout(1500);
    };
    /** จากงานของฉันวันนี้ → หน้าใบงาน → ปุ่มขั้น "รับทราบ ปล่อยงาน" (ปุ่มสุดท้ายในหน้า — ชื่อขั้นบนแถบขั้นตอนอยู่ก่อน) */
    const openRelease = async (sess, code) => {
      await sess.page.locator(`[aria-label="รายละเอียด ${code}"]`).locator("visible=true").first().click();
      await sess.page.waitForTimeout(3500);
      await sess.vis("รับทราบ ปล่อยงาน").last().click();
      await sess.page.waitForTimeout(1500);
    };
    const lbl = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");

    // ── 1) นับถอยหลัง: เวลาปิดรับอีก 45 นาที ──
    const C1 = bkk(45);
    await setCut(C1);
    const dl1 = Date.parse(`${today}T${C1}:00.000+07:00`);
    /** "เหลือ N นาที" ที่ยอมรับได้ ณ ตอนนี้ — จอปัดเศษลงแบบตัวอย่าง คิดจากนาฬิกาจริง (คลาดได้หนึ่งนาทีตอนข้ามนาที) */
    const leftRe = () => {
      const n = Math.floor((dl1 - Date.now()) / 60000);
      return new RegExp(`เหลือ (${n - 1}|${n}|${n + 1}) นาที`);
    };
    const s1 = await openAs("S001", 1280);
    await toQueue(s1);
    const amberTitle = `ปล่อยงานพรุ่งนี้ก่อน ${C1} น. · ยังไม่ปล่อย `;
    const amber = s1.page.locator(`[aria-label^="หัวข้อ ${amberTitle}"]`).locator("visible=true").first();
    const amberText = (await amber.count()) ? await amber.innerText() : "";
    amberText && leftRe().test(amberText) && amberText.includes(`ถึง ${C1} น. แล้วกดไม่ได้ — ต้องให้แอดมินแก้เป็นงานด่วนทีละใบ`)
      ? pass(`งานของฉันวันนี้: แถบส้ม "${amberText.split("\n")[0]}" + เหลือ N นาที (ตรงนาฬิกาจริง)`)
      : fail(`แถบนับถอยหลังส้ม: "${amberText}" · คาด ${leftRe()}`);
    const t1Card = await queueCard(s1.page, T1.code);
    t1Card && t1Card.labels.some((l) => l.startsWith(`ต้องปล่อยก่อน ${C1} น. · เหลือ `))
      ? pass(`การ์ด ${T1.code} มีป้ายส้ม "ต้องปล่อยก่อน ${C1} น. · เหลือ …"`)
      : fail(`ป้ายบนการ์ด ${T1.code}: ${t1Card ? t1Card.labels.join(" | ") : "ไม่เจอการ์ด"}`);
    await s1.page.screenshot({ path: shot("6-sup-countdown"), fullPage: true });
    // เปิดหน้าใบงานแล้วการ์ดในงานของฉันวันนี้ถูกถอดออก (MyQueue ไม่วาดรายการตอนหน้าไม่ได้โฟกัส) — ป้ายที่เหลือบนจอ
    // จึงเป็นของหน้าใบงานเท่านั้น เช็คว่าการ์ดหายจริงก่อน ไม่งั้นป้ายบนการ์ดจะถูกนับเป็นป้ายของหน้าใบงาน (ผ่านหลอก)
    const chipSel = `[aria-label^="ต้องปล่อยก่อน ${C1} น. · เหลือ "]`;
    await s1.page.locator(`[aria-label="รายละเอียด ${T1.code}"]`).locator("visible=true").first().click();
    await s1.page.waitForTimeout(3500);
    const cardGone = (await s1.page.locator(`[aria-label="รายละเอียด ${T1.code}"]`).locator("visible=true").count()) === 0;
    const pageChips = await s1.page.locator(chipSel).locator("visible=true").allInnerTexts();
    const onStage = (await s1.vis("รับทราบ ปล่อยงาน").count()) > 0;
    cardGone && onStage && pageChips.length === 1 && leftRe().test(pageChips[0])
      ? pass(`หน้าใบงาน: ป้ายเวลาปิดรับข้างปุ่มขั้น "${pageChips[0]}"`)
      : fail(`หน้าใบงาน ป้ายข้างปุ่มขั้น: การ์ดหาย=${cardGone} ปุ่มขั้น=${onStage} ป้าย=${JSON.stringify(pageChips)} · คาด ${leftRe()}`);
    await s1.vis("รับทราบ ปล่อยงาน").last().click();
    await s1.page.waitForTimeout(1500);
    const box1 = s1.page.locator(`[aria-label="กล่องเส้นตาย ปล่อยงานของพรุ่งนี้ได้ก่อน ${C1} น. วันนี้"]`).locator("visible=true").first();
    const box1Text = (await box1.count()) ? await box1.innerText() : "";
    box1Text && leftRe().test(box1Text) && box1Text.includes(`ตามเวลาระบบ · ตอนนี้ `) && box1Text.includes(`ถึง ${C1} น. แล้วกดไม่ได้`)
      ? pass("ฟอร์มปล่อยงาน: กล่องเส้นตาย \"ปล่อยงานของพรุ่งนี้ได้ก่อน … วันนี้\" + เหลือ N นาที + ตามเวลาระบบ")
      : fail(`กล่องเส้นตายในฟอร์ม: "${box1Text}"`);
    await s1.page.screenshot({ path: shot("7-release-form") });
    await s1.vis("รับทราบ ปล่อยงานให้ช่าง").last().click();
    const toast1 = `ปล่อยงาน ${T1.code} แล้ว — ทีม${teamOf(T1.id)} เห็นในแท็บ “พรุ่งนี้” แล้ว`;
    const toast1Seen = await s1.vis(toast1).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await s1.page.waitForTimeout(800);
    toast1Seen ? pass(`toast: ${toast1}`) : fail(`ไม่เห็น toast หลังปล่อยงาน (คาด "${toast1}")`);
    (await s1.vis(`${T1.code} อัปเดตสถานะแล้ว`, false).count()) === 0
      ? pass("ไม่มีกล่อง \"อัปเดตสถานะแล้ว\" ซ้อนกับ toast")
      : fail("ขึ้นทั้ง toast และกล่อง อัปเดตสถานะแล้ว");
    st(T1.id) === "IN_PROGRESS" && logCount(T1.id, "DISPATCHED") === 1
      ? pass(`ปล่อยงาน ${T1.code} ก่อนเวลาปิดรับ → IN_PROGRESS + ประวัติ DISPATCHED (ฐานข้อมูล)`)
      : fail(`หลังปล่อย ${T1.code}: ${st(T1.id)} · DISPATCHED ${logCount(T1.id, "DISPATCHED")}`);

    // ── 3) กดตอนเวลาเพิ่งผ่าน: ฟอร์มเปิดค้างตอนยังกดได้ แล้วเวลาปิดรับย้ายไปเมื่อนาทีก่อน ──
    await toQueue(s1);
    await openRelease(s1, R1.code);
    const openOk = (await s1.page.locator('[aria-label^="กล่องเส้นตาย ปล่อยงานของพรุ่งนี้ได้ก่อน "]').locator("visible=true").count()) > 0;
    openOk ? pass(`เปิดฟอร์มปล่อยงาน ${R1.code} ตอนยังกดได้ (มีกล่องเส้นตาย)`) : fail("ฟอร์มที่เปิดตอนยังกดได้ไม่มีกล่องเส้นตาย");
    await setCut(bkk(-1));
    const r1Logs = logCount(R1.id, "DISPATCHED");
    await s1.vis("รับทราบ ปล่อยงานให้ช่าง").last().click();
    const refused = await s1.page.getByText(/คุณกดเมื่อ \d\d:\d\d น\. — ระบบได้รับหลังปิดรับจึงไม่รับ · โหลดใบใหม่ให้แล้ว ไม่มีอะไรถูกบันทึก/).locator("visible=true").first()
      .waitFor({ timeout: 10000 }).then(() => true, () => false);
    refused ? pass("ถูกปฏิเสธ: ฟอร์มบอก \"คุณกดเมื่อ … ระบบได้รับหลังปิดรับจึงไม่รับ · … ไม่มีอะไรถูกบันทึก\"") : fail("ไม่เห็นบรรทัด คุณกดเมื่อ … ในฟอร์ม");
    (await s1.vis("ปล่อยงานไม่ได้ — เลยเวลาปิดรับแล้ว").count()) > 0 && (await lbl(s1.page, "ขอแอดมินแก้เป็นงานด่วน").count()) > 0
      ? pass("ฟอร์มไม่ปิด — กลายเป็นหน้าล็อก (กล่องแดง + ปุ่มขอแอดมินแก้เป็นงานด่วน)")
      : fail("ถูกปฏิเสธแล้วฟอร์มปิด หรือไม่กลายเป็นหน้าล็อก");
    st(R1.id) === "ASSIGNED" && logCount(R1.id, "DISPATCHED") === r1Logs
      ? pass(`${R1.code} ยัง ASSIGNED ไม่มีประวัติ DISPATCHED เพิ่ม (ฐานข้อมูล)`)
      : fail(`หลังถูกปฏิเสธ ${R1.code}: ${st(R1.id)} · DISPATCHED ${logCount(R1.id, "DISPATCHED")}`);
    await s1.page.screenshot({ path: shot("8-refused") });
    await lbl(s1.page, "กลับ").last().click();
    await s1.page.waitForTimeout(800);

    // ── 2) ล็อกแล้ว (เวลาปิดรับเมื่อนาทีก่อน) ──
    await toQueue(s1);
    const inbox = await call(S, "GET", "/work-orders?status=INBOX");
    const lockedN = (inbox.rows || []).filter((r) => r.release && r.release.locked && !r.release.past).length;
    const pastN = (inbox.rows || []).filter((r) => r.release && r.release.locked && r.release.past).length;
    (await lbl(s1.page, `หัวข้อ เลยเวลาปล่อยงาน ${lockedN} ใบ`).count()) > 0 && lockedN >= 3
      ? pass(`แถบ "เลยเวลาปล่อยงาน ${lockedN} ใบ" — ตรงกับจำนวนใบที่เซิร์ฟเวอร์บอกว่าล็อก`)
      : fail(`แถบเลยเวลาปล่อยงาน: คาด ${lockedN} ใบ · เห็น ${await s1.page.locator('[aria-label^="หัวข้อ เลยเวลาปล่อยงาน"]').allInnerTexts()}`);
    (await lbl(s1.page, `หัวข้อ เลยวันนัดแล้ว ${pastN} ใบ`).count()) > 0 && pastN >= 1
      ? pass(`แถบ "เลยวันนัดแล้ว ${pastN} ใบ" (รวม ${P1.code})`)
      : fail(`แถบเลยวันนัดแล้ว: คาด ${pastN} ใบ`);
    const l1Card = await queueCard(s1.page, L1.code);
    l1Card && l1Card.labels.includes("เลยเวลาปล่อยงาน · ขอแอดมินแก้เป็นงานด่วน หรือส่งกลับ") && l1Card.border === "2px"
      ? pass(`การ์ด ${L1.code}: ป้ายแดง "เลยเวลาปล่อยงาน · ขอแอดมินแก้เป็นงานด่วน หรือส่งกลับ" + ขอบแดงหนา`)
      : fail(`การ์ด ${L1.code}: ${l1Card ? `${l1Card.labels.join(" | ")} · ขอบ ${l1Card.border}` : "ไม่เจอ"}`);
    await s1.page.screenshot({ path: shot("9-sup-locked"), fullPage: true });

    await openRelease(s1, L1.code);
    const teamDis = await lbl(s1.page, "ทีมที่จะรับงาน").last().getAttribute("aria-disabled").catch(() => null);
    (await s1.vis("ปล่อยงานไม่ได้ — เลยเวลาปิดรับแล้ว").count()) > 0 &&
    teamDis === "true" &&
    (await s1.vis("บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)").count()) > 0 &&
    (await lbl(s1.page, "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่").count()) > 0 &&
    (await lbl(s1.page, "รับทราบ ปล่อยงานให้ช่าง").count()) === 0 &&
    (await s1.vis("รับทราบ ปล่อยงานให้ช่าง").count()) === 0
      ? pass("ฟอร์มตอนล็อก: กล่องแดง · ทีมเลือกไม่ได้ · ช่องบอกแอดมิน · ปุ่มขอแอดมิน/ส่งกลับ · ไม่มีปุ่มปล่อยงาน")
      : fail(`ฟอร์มตอนล็อกไม่ครบ (ทีม aria-disabled=${teamDis})`);
    const askNote = "ลูกค้ารอพรุ่งนี้เช้า (เทสต์)";
    await lbl(s1.page, "บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)").last().fill(askNote);
    await lbl(s1.page, "ขอแอดมินแก้เป็นงานด่วน").last().click();
    const pending = await s1.vis("ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await s1.page.waitForTimeout(600);
    pending &&
    (await s1.vis(`“${askNote}” · ขึ้นที่แอดมินในหัวข้อ “เลยเวลาปล่อยงาน” แล้ว`, false).count()) > 0 &&
    (await lbl(s1.page, "ยกเลิกคำขอ").count()) > 0 &&
    (await lbl(s1.page, "กลับไปงานของฉัน").count()) > 0 &&
    (await lbl(s1.page, "บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)").count()) === 0
      ? pass("ขอแอดมินแล้วฟอร์มไม่ปิด: กล่องม่วง ส่งคำขอแล้ว + ส่งเมื่อ … “ข้อความ” · ปุ่มยกเลิกคำขอ/กลับไปงานของฉัน · ช่องพิมพ์หายไป")
      : fail("หลังขอแอดมิน ฟอร์มไม่เป็นกล่องม่วงตามตัวอย่าง");
    lastLog(L1.id) === `URGENT_REQUESTED|${askNote}` && st(L1.id) === "ASSIGNED"
      ? pass(`ประวัติ URGENT_REQUESTED พร้อมข้อความ · ${L1.code} ยัง ASSIGNED (ฐานข้อมูล)`)
      : fail(`ประวัติหลังขอแอดมิน: ${lastLog(L1.id)} · ${st(L1.id)}`);
    await s1.page.screenshot({ path: shot("10-ask-pending") });
    // แถบขั้นตอนมีแต่ในหน้าใบงาน — นับรวมตัวที่ซ่อนอยู่ (ไม่ใช่แค่ที่มองเห็น): ถ้าปุ่มซ้อน "งานของฉัน" หน้าใหม่ทับแทนการย้อนกลับ
    // หน้าใบงานยังค้างอยู่ใต้กอง (ซ่อน) การ์ดก็ขึ้นครบ ข้อข้างล่างผ่านทั้งที่กองหน้าโตขึ้นทุกรอบ — จอกว้างไม่มีปุ่ม "ใบงาน ›" ให้เห็นด้วย
    const stepsBefore = await s1.page.locator('[aria-label="ขั้นตอนงาน"]').count();
    await lbl(s1.page, "กลับไปงานของฉัน").last().click();
    await s1.page.waitForTimeout(3500);
    const l1Pending = await queueCard(s1.page, L1.code);
    l1Pending && l1Pending.labels.includes("เลยเวลาปล่อยงาน · ขอแอดมินแล้ว รอแก้เป็นงานด่วน")
      ? pass(`กลับไปงานของฉัน → การ์ด ${L1.code} ป้ายม่วง "เลยเวลาปล่อยงาน · ขอแอดมินแล้ว รอแก้เป็นงานด่วน"`)
      : fail(`หลังกลับไปงานของฉัน การ์ด ${L1.code}: ${l1Pending ? l1Pending.labels.join(" | ") : "ไม่เจอ (ไม่ได้กลับมาหน้างานของฉัน?)"}`);
    const stepsAfter = await s1.page.locator('[aria-label="ขั้นตอนงาน"]').count();
    stepsBefore > 0 && stepsAfter === 0
      ? pass("กลับไปงานของฉัน = ย้อนกลับหน้าเดิม หน้าใบงานไม่ค้างอยู่ใต้กอง (ไม่ซ้อนงานของฉันหน้าใหม่)")
      : fail(`กลับไปงานของฉันแล้วหน้าใบงานยังค้างในกอง: แถบขั้นตอนก่อนกด ${stepsBefore} · หลังกด ${stepsAfter}`);

    await openRelease(s1, L1.code);
    (await s1.vis("ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน").count()) > 0
      ? pass("เปิดฟอร์มอีกครั้ง: ยังเป็นสถานะรอแอดมิน (มาจากประวัติในเซิร์ฟเวอร์)")
      : fail("เปิดฟอร์มอีกครั้งแล้วไม่เห็นสถานะรอแอดมิน");
    await lbl(s1.page, "ยกเลิกคำขอ").last().click();
    const backToAsk = await lbl(s1.page, "ขอแอดมินแก้เป็นงานด่วน").last().waitFor({ timeout: 8000 }).then(() => true, () => false);
    lastLog(L1.id) === "URGENT_REQUEST_CANCELLED|" && backToAsk
      ? pass("ยกเลิกคำขอ → ประวัติ URGENT_REQUEST_CANCELLED · ฟอร์มกลับมามีปุ่มขอแอดมิน (ฐานข้อมูล)")
      : fail(`ยกเลิกคำขอ: ${lastLog(L1.id)} · ปุ่มขอแอดมินกลับมา=${backToAsk}`);
    await lbl(s1.page, "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่").last().click();
    await s1.page.waitForTimeout(800);
    (await s1.vis("ส่งกลับต้องบอกเหตุผล เช่น ทีมไม่ว่างวันนั้น · ร้านขอเลื่อน").count()) > 0 && st(L1.id) === "ASSIGNED"
      ? pass("ส่งกลับไม่ใส่เหตุผล → ฟอร์มบอก \"ส่งกลับต้องบอกเหตุผล …\" ไม่ส่งอะไร (ฐานข้อมูลยัง ASSIGNED)")
      : fail(`ส่งกลับไม่ใส่เหตุผล: ${st(L1.id)}`);
    const why = "ทีมไม่ว่างวันนั้น (เทสต์)";
    await lbl(s1.page, "บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)").last().fill(why);
    await lbl(s1.page, "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่").last().click();
    const toast36 = `ส่ง ${L1.code} กลับให้แอดมินนัดใหม่แล้ว — ใบออกจากรายการของคุณ แอดมินเห็นในหัวข้อ “เลยเวลาปล่อยงาน”`;
    const t36 = await s1.vis(toast36).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await s1.page.waitForTimeout(800);
    t36 ? pass(`toast: ${toast36}`) : fail(`ไม่เห็น toast หลังส่งกลับ (คาด "${toast36}")`);
    st(L1.id) === "AWAITING_CONFIRM" && lastLog(L1.id).startsWith("NEW_DATE_DECLINED|") && lastLog(L1.id).includes(why)
      ? pass(`ส่งกลับ → ${L1.code} AWAITING_CONFIRM + ประวัติ NEW_DATE_DECLINED พร้อมเหตุผล (ฐานข้อมูล)`)
      : fail(`หลังส่งกลับ: ${st(L1.id)} · ${lastLog(L1.id)}`);

    // ใบวันนัดผ่านแล้ว — กล่องแดงกับปุ่มกลับไปงานของฉันเท่านั้น (แอดมินต้องเลื่อนวันนัด)
    await toQueue(s1);
    await openRelease(s1, P1.code);
    (await s1.vis("ปล่อยงานไม่ได้ — วันนัดผ่านไปแล้ว").count()) > 0 &&
    (await lbl(s1.page, "กลับไปงานของฉัน").count()) > 0 &&
    (await lbl(s1.page, "ขอแอดมินแก้เป็นงานด่วน").count()) === 0 &&
    (await lbl(s1.page, "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่").count()) === 0 &&
    (await lbl(s1.page, "บอกแอดมินสั้น ๆ (ขอแก้เป็นงานด่วน: ไม่บังคับ · ส่งกลับ: ต้องใส่เหตุผล)").count()) === 0
      ? pass(`ใบวันนัดผ่านแล้ว (${P1.code}): กล่องแดง "วันนัดผ่านไปแล้ว" + "กลับไปงานของฉัน" อย่างเดียว ไม่มีขอแอดมิน/ส่งกลับ/ช่องพิมพ์`)
      : fail("ฟอร์มใบวันนัดผ่านแล้วมีปุ่มเกิน หรือไม่มีกล่องแดง");
    await s1.page.screenshot({ path: shot("11-past") });
    await s1.ctx.close();

    // มือถือ 420: หน้าล็อกปุ่มเรียงลงล่างเต็มกว้าง ไม่ล้นจอ
    const sp = await openAs("S001", 420, 900);
    await toQueue(sp);
    await openRelease(sp, L2.code);
    const lay = await sp.page.evaluate(() => {
      // ปุ่มทั้งสามอยู่ในแถวเดียวกัน (LockActions) — หา "กลับ" ในแถวนั้น ไม่ใช่ปุ่มกลับของหัวหน้าจอ
      const dec = [...document.querySelectorAll('[aria-label="ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่"]')].find((x) => x.getClientRects().length);
      const row = dec ? dec.parentElement : null;
      const box = (l) => {
        const n = row ? row.querySelector(`[aria-label="${l}"]`) : null;
        return n ? n.getBoundingClientRect() : null;
      };
      return {
        ask: box("ขอแอดมินแก้เป็นงานด่วน"),
        decline: box("ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่"),
        back: box("กลับ"),
        scroll: document.scrollingElement.scrollWidth,
      };
    });
    lay.ask && lay.decline && lay.back &&
    lay.ask.top < lay.decline.top && lay.decline.top < lay.back.top &&
    Math.abs(lay.ask.left - lay.decline.left) < 2 && lay.ask.right <= 420 && lay.scroll <= 420
      ? pass("มือถือ 420: ปุ่มขอแอดมิน · ส่งกลับ · กลับ เรียงลงล่างแนวเดียวกัน ไม่ล้นจอ")
      : fail(`มือถือ 420 หน้าล็อก: ${JSON.stringify(lay)}`);
    await sp.page.screenshot({ path: shot("12-phone-locked") });
    await sp.ctx.close();

    // ── 6) กล่องงาน: แถบนับข้ามแท็บ ──
    const s6 = await openAs("S001", 1300, 1100);
    await s6.vis("กล่องงานของฉัน").first().click();
    await s6.page.waitForTimeout(3500);
    await s6.page.locator('[aria-label^="แท็บ งานแจ้งซ่อม"]').locator("visible=true").first().click();
    await s6.page.waitForTimeout(1500);
    const inbox6 = await call(S, "GET", "/work-orders?status=INBOX");
    const locked6 = (inbox6.rows || []).filter((r) => r.release && r.release.locked && !r.release.past).length;
    const rowL2 = s6.page.locator(`[aria-label="เลยเวลาปล่อยงาน ${locked6} ใบ ${L2.code}"]`).locator("visible=true");
    (await rowL2.count()) > 0
      ? pass(`กล่องงาน แท็บงานแจ้งซ่อม: แถบ "เลยเวลาปล่อยงาน ${locked6} ใบ" มีแถว ${L2.code} (ใบอยู่แท็บจ่ายงาน — แถบนับทุกแท็บ)`)
      : fail(`แถบในกล่องงาน: ${await s6.page.locator('[aria-label^="หัวข้อ เลยเวลาปล่อยงาน"]').allInnerTexts()}`);
    await s6.page.screenshot({ path: shot("13-inbox-banner") });
    await s6.ctx.close();

    // หัวหน้าภาคที่กล่องว่าง แต่มีงานพรุ่งนี้รอแอดมินคอนเฟิร์มลูกค้า — แถบยังต้องขึ้นเหนือ "ไม่มีงานค้างรอคุณ"
    const zone = sql(`select coalesce(zone,'') from "Branch" where code='C0006'`);
    sql(`insert into "Branch"(name,code,region,zone) values ('สาขาทดสอบเวลาปิดรับ','${ZB}','${ZR}',nullif('${zone}',''))`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",region) values ('${ZS}','หัวหน้าภาคทดสอบกล่องว่าง','SUPERVISOR','${hash}',false,'${ZR}')`);
    const zTok = await fx.login(ZS);
    const zw = await call(A, "POST", "/work-orders", {
      branchCode: ZB, jobType: "CM", priority: "NORMAL", contactName: "คุณทดสอบ", contactPhone: "081-234-5678",
      machines: [{ code: "W77", model: "Oasis", symptom: "ทดสอบกล่องว่าง (สร้างโดยเทสต์)" }],
    });
    zOrder = zw.orders ? zw.orders[0].id : zw.id;
    await call(zTok, "POST", `/work-orders/${zOrder}/parts`, { needsParts: false });
    const zd = await call(A, "GET", `/work-orders/${zOrder}`);
    await call(zTok, "POST", `/work-orders/${zOrder}/assign`, { team: zd.suggestedTeam, scheduledAt: tomorrow });
    const zRow = sql(`select status||'|'||to_char("scheduledAt",'YYYY-MM-DD') from "WorkOrder" where id=${zOrder}`);
    zRow === `AWAITING_CONFIRM|${tomorrow}` ? pass(`เตรียมใบพรุ่งนี้รอแอดมินคอนเฟิร์มในภาคชั่วคราว (ฐานข้อมูล)`) : fail(`เตรียมใบกล่องว่าง: ${zRow}`);
    const z = await openAs(ZS, 1280);
    await z.page.waitForTimeout(2000);
    const nr = z.page.locator('[aria-label="หัวข้อ งานพรุ่งนี้ยังไม่ถึงขั้นปล่อยงาน 1 ใบ"]').locator("visible=true").first();
    const nrText = (await nr.count()) ? await nr.innerText() : "";
    const ys = await z.page.evaluate(() => {
      const top = (sel, text) =>
        [...document.querySelectorAll(sel)].filter((n) => n.getClientRects().length && (!text || n.innerText.trim() === text)).map((n) => n.getBoundingClientRect().top)[0] ?? null;
      return { banner: top('[aria-label="หัวข้อ งานพรุ่งนี้ยังไม่ถึงขั้นปล่อยงาน 1 ใบ"]'), empty: top("div", "ไม่มีงานค้างรอคุณ") };
    });
    nrText.includes("รอแอดมินคอนเฟิร์มลูกค้า 1 · ของยังโอนไม่ถึง 0") && ys.banner !== null && ys.empty !== null && ys.banner < ys.empty
      ? pass("กล่องว่าง: แถบ \"งานพรุ่งนี้ยังไม่ถึงขั้นปล่อยงาน 1 ใบ\" (รอแอดมินคอนเฟิร์มลูกค้า 1 · ของยังโอนไม่ถึง 0) อยู่เหนือ \"ไม่มีงานค้างรอคุณ\"")
      : fail(`กล่องว่าง: "${nrText}" · ตำแหน่ง ${JSON.stringify(ys)}`);
    await z.page.screenshot({ path: shot("14-empty-inbox") });
    await z.ctx.close();

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    // ลบแถวเวลาปิดรับที่เพิ่ม (ทั้งทาง SQL และที่แอดมินกดในจอ) แล้วให้เซิร์ฟเวอร์อ่านสด — ค่าที่จำไว้ 30 วิจะได้ไม่ค้างค่าทดสอบ
    // คืนเวลาเริ่มใช้กฎก่อน แล้วค่อยให้เซิร์ฟเวอร์อ่านสด (readCutoff อ่าน since จากแถวแรก)
    if (sinceSaved) {
      try {
        sql(`update "AppSetting" set "createdAt"='${sinceSaved.at}'::timestamp where id=${sinceSaved.id}; delete from "AppSetting" where key='${SINCE_MARK}'`);
      } catch (e) {
        fail(`คืนเวลาเริ่มใช้กฎไม่สำเร็จ: ${e}`);
      }
    }
    if (MAXSET !== null) {
      sql(`delete from "AppSetting" where key='dispatchCutoff' and id > ${MAXSET}; delete from "AppSetting" where key='${MARK}'`);
      await refresh().catch(() => {});
    }
    await fx.cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
    // ใบ/สาขา/หัวหน้าภาคชั่วคราวของกล่องว่าง — ใบลบผ่าน API (ประวัติไปด้วย) แล้วค่อยลบเครื่อง สาขา และบัญชี
    try {
      if (zOrder) await call(A, "DELETE", `/work-orders/${zOrder}`);
      sql(`delete from "Machine" where "branchId" in (select id from "Branch" where code='${ZB}'); delete from "Branch" where code='${ZB}'; delete from "User" where "employeeCode"='${ZS}'`);
    } catch (e) {
      fail(`ลบสาขา/หัวหน้าภาคชั่วคราวไม่สำเร็จ: ${e}`);
    }
    sql(`delete from "User" where "employeeCode"='${PA}'`);
    await browser.close();
  }
})();
