// ทดสอบผ่านเบราว์เซอร์: เวลาปิดรับปล่อยงาน (เจ้าของงานขอ ต.ค. 69) — ก้อน 3 การ์ดตั้งค่า + แท็บกล่องงาน
//   ส่วน 5 (การ์ดตั้งค่า "เวลาปิดรับปล่อยงาน" ท้ายหน้าระบบหลังบ้าน)
//   · แอดมินแตะ 16:30 → บันทึกทันที (ไม่ถาม) · toast · ชิปที่เลือก · บรรทัด "เปลี่ยนล่าสุด: <ชื่อ> · 15:00 → 16:30 น." · ฐานข้อมูลมีแถวใหม่ของ A001
//   · เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านไปแล้ว (ใบพรุ่งนี้ที่ยังไม่ปล่อยจะล็อกทันที) → กล่องยืนยันบอกจำนวนใบ · "ยกเลิก" ไม่เขียนอะไร
//     · "ตั้งเป็น 15:00 น." บันทึก — จำนวนในกล่องตรงกับ dispatch-watch ของเซิร์ฟเวอร์
//   · Admin Spare Part เห็นการ์ด ชิปกดไม่ได้ · กดแรง ๆ ก็ไม่มีคำขอ PUT และฐานข้อมูลไม่เปลี่ยน
//   · จอมือถือ 420: การ์ดไม่ล้นจอ ชิปห้าตัวอยู่ในแถวเดียว
//   ส่วน 6 (แท็บกล่องงานหัวหน้าภาค)
//   · "ส่งช่างตรวจ" (INSPECT_DISPATCH) อยู่แท็บ จ่ายงาน/ปล่อยงาน ไม่อยู่แท็บงานแจ้งซ่อม (เจ้าของงานตอบข้อ ก)
//   ส่วนที่เหลือของแผน (หัวหน้าภาค/แอดมิน/นับถอยหลัง/แถบหัวข้อ) มากับหน้าจอก้อน 4–5
//
// คุมเวลาไม่ให้ขึ้นกับว่ารันกี่โมง (tests/README "เทสต์ที่ขึ้นกับเวลาปิดรับ"):
//   · เวลาปิดรับจริงตั้งทาง SQL (แถวใหม่ใน AppSetting) แล้วเรียก GET /api/settings/dispatch-cutoff ให้เซิร์ฟเวอร์อ่านสด
//   · กล่องยืนยันขึ้นเมื่อ "ตอนนี้" เลยเวลาใหม่แล้ว — การ์ดเชื่อนาฬิกาเซิร์ฟเวอร์ (serverNow ในคำตอบ GET) ไม่ใช่นาฬิกาเครื่อง
//     เทสต์จึงแก้ serverNow ในคำตอบ GET ของหน้านั้นเป็น 15:30 ของวันนี้ แทนการรอให้ถึงบ่ายสาม (แผนเดิมข้ามข้อนี้ถ้ารันก่อน 15:00)
//     ถ้าการ์ดหันไปใช้นาฬิกาเครื่อง ข้อนี้จะล้มทุกครั้งที่รันนอก 15:00–23:59 — จับบั๊กแบบนั้นได้ด้วย
//     เวลาปิดรับจริงตั้งเป็น 23:59 ระหว่างข้อนี้ ใบพรุ่งนี้จึงยังไม่ล็อกจริง (ไม่งั้น dispatch-watch ไม่นับมัน)
//   · ตัวกันคร่อมเที่ยงคืน: 23:50–00:02 รอให้พ้นก่อน — 23:59 จะผ่านไปและ "พรุ่งนี้" เปลี่ยนกลางทาง
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

  // กันคร่อมเที่ยงคืน — ก่อนแตะฐานข้อมูลสักบรรทัด (ถูกฆ่าระหว่างรอจะไม่มีอะไรค้าง)
  {
    const now = Date.now() + 7 * 3600e3;
    const d = new Date(now);
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (m >= 23 * 60 + 50 || m < 2) {
      const t = new Date(now);
      t.setUTCHours(0, 2, 0, 0);
      if (t.getTime() <= now) t.setUTCDate(t.getUTCDate() + 1);
      const wait = t.getTime() - now;
      console.log(`    รอข้ามเที่ยงคืน ${Math.ceil(wait / 1000)} วินาที — เวลาปิดรับทดสอบ 23:59 จะข้ามวัน`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  const fx = await setup();
  const { sql, call, A } = fx;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const suf = Date.now() % 100000;
  const PA = `ZDCW${suf}`;
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

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    // ลบแถวเวลาปิดรับที่เพิ่ม (ทั้งทาง SQL และที่แอดมินกดในจอ) แล้วให้เซิร์ฟเวอร์อ่านสด — ค่าที่จำไว้ 30 วิจะได้ไม่ค้างค่าทดสอบ
    if (MAXSET !== null) {
      sql(`delete from "AppSetting" where key='dispatchCutoff' and id > ${MAXSET}; delete from "AppSetting" where key='${MARK}'`);
      await refresh().catch(() => {});
    }
    await fx.cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
    sql(`delete from "User" where "employeeCode"='${PA}'`);
    await browser.close();
  }
})();
