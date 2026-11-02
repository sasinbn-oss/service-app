// ทดสอบผ่านเบราว์เซอร์: เวลาปิดนัดงานพรุ่งนี้ (เจ้าของงานขอ ต.ค. 69 · ย้ายจากขั้นปล่อยงานมาที่การนัดวัน 2 พ.ย. 69)
//   ส่วน 1 การ์ดตั้งค่า "เวลาปิดนัดงานพรุ่งนี้": หัว/คำอธิบาย/บรรทัดล่าง · แตะเวลาที่ช้ากว่า → บันทึกทันที + toast + แถวใหม่
//     · เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านแล้ว → กล่องยืนยันเสมอ (ไม่นับใบ ไม่ถาม dispatch-watch) "ยกเลิก" ไม่เขียน · ยืนยันเขียน
//     · Admin Spare Part ดูอย่างเดียว · มือถือ 420 ชิปห้าตัวแถวเดียว
//   ส่วน 2 ฟอร์มนัดวันเข้า (PARTS_CHECKED) ของหัวหน้าภาค ตอนเหลือ 45 นาที: วันนี้กดไม่ได้ + "งานด่วนเท่านั้น" · พรุ่งนี้กดได้
//     + "เหลือ N นาที" (N ตามนาฬิกาจริง) และช่องพรุ่งนี้เป็นสีส้ม · บรรทัดส้ม · ปุ่มขอวันนี้มี ปุ่มขอพรุ่งนี้ไม่มี
//     · งานของฉันวันนี้: แถบ "รอนัดวัน n ใบ — นัดพรุ่งนี้ได้ถึง HH:MM (เหลือ …)" + ป้ายบนการ์ด · กล่องงานมีแถบเดียวกัน
//     · สถานะที่ดูอย่างเดียว (แก้ serverNow 10:00 + cutoff 16:00 ในคำตอบ): "นัดได้ถึง 16:00" + บรรทัดเทา ไม่มีแถบ
//   ส่วน 8 มือถือ 420: แถบ ปฏิทินพร้อมแถวป้าย และปุ่มขอ อยู่ในจอ ไม่เลื่อนข้าง
//   ส่วน 3 กดตอนเวลาเพิ่งผ่าน: เปิดฟอร์มตอนยังนัดพรุ่งนี้ได้ → เวลาปิดย้ายไปเมื่อนาทีก่อน (SQL) → กดยืนยัน
//     → ฟอร์มไม่ปิด บรรทัดแดง "วันที่เลือกไว้ … ปิดนัดแล้ว" ปุ่มบันทึกปิด เวลาที่กรอกยังอยู่ · ฐานข้อมูลยัง PARTS_CHECKED ไม่มี ASSIGNED
//   ส่วน 4 หลังเวลาปิด: พรุ่งนี้ขีดฆ่า + "ปิด HH:MM แล้ว" · บรรทัดฟ้าบอกวันแรกที่นัดได้ · ปุ่มขอพรุ่งนี้กับวันนี้
//     · ขอพรุ่งนี้ → กล่องม่วง + URGENT_REQUESTED meta.day · ปุ่มหาย · ทีม/เวลาที่กรอกอยู่ครบ · ยกเลิก → ปุ่มกลับมา
//     · ขอวันนี้ → กล่องม่วงของวันนี้ · ยกเลิก
//     · แข่งกัน: ขอพรุ่งนี้ → กันตัวเช็ค 20 วิไว้ → แอดมินแก้เป็นงานด่วนทาง API → หัวหน้าภาคกดยกเลิกคำขอ
//       → ฟอร์มไม่ปิด ทีม/เวลาอยู่ครบ บรรทัด "ไม่มีคำขอที่รอแอดมินแล้ว — …" + บรรทัดเขียว + ป้ายเขียว (ผ่านเฉพาะเมื่อ 409 URGENT_ASK_STATE
//         ไม่ถูกตัวจัดการกลางรับไป) · ฐานข้อมูลมี URGENT_RELEASE 1 แถว ไม่มียกเลิกเพิ่ม ขั้นไม่เปลี่ยน
//   ส่วน 5 แอดมินแก้เป็นงานด่วนทาง API ระหว่างฟอร์มเปิด → ตัวเช็ค 20 วิวาดทับ: toast · เลือกพรุ่งนี้ให้เอง · ป้าย/บรรทัดเขียว
//     → บันทึก → ฐานข้อมูลวันนัดพรุ่งนี้ + urgentReleaseFor คงอยู่
//   ส่วน 6 ฟอร์มระบุอะไหล่ (NEW): ไม่ใช้อะไหล่จ่ายงาน/ส่งตรวจ วันนี้กดไม่ได้ · แอดมินทำแทน: "ต้องติ๊กงานด่วน" + บรรทัดแดง + ช่องติ๊ก
//     บันทึกไม่ได้จนกว่าจะติ๊ก → ฐานข้อมูล URGENT_RELEASE via schedule · ใบทดสอบ: ไม่มีกฎในแอปเลย นัดวันนี้ได้ (ฐานข้อมูลไม่มีงานด่วน)
//   ส่วน 7 ปล่อยงานไม่มีล็อก: ใบวันนี้/พรุ่งนี้หลังเวลาปิด (ไม่มีงานด่วน) ไม่มีกล่องแดง/กล่องเส้นตาย ปล่อยได้ → IN_PROGRESS
//     · ใบเลื่อนวันยังมี "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่" → toast ใหม่ (ไม่บอกหัวข้อที่ไม่มีแล้ว) + AWAITING_CONFIRM
//
// คุมเวลาไม่ให้ขึ้นกับว่ารันกี่โมง (tests/README "เทสต์ที่ขึ้นกับเวลาปิด"):
//   · เวลาปิดจริงตั้งทาง SQL (แถวใหม่ใน AppSetting) แล้วเรียก GET /api/settings/dispatch-cutoff ให้เซิร์ฟเวอร์อ่านสด
//     +45 นาที = ช่วงนับถอยหลัง · −1/−2 นาที = หลังเวลาปิด · วันนี้ปิดเสมอ (เส้นตายคือเมื่อวาน) · มะรืนเปิดเสมอ
//   · เวลาเริ่มใช้กฎ (createdAt แถวแรก) ถอยไป 30 วันระหว่างรัน ไม่งั้นฐานที่เพิ่งเปิดกฎวันนี้ "วันนี้" ยังไม่อยู่ใต้กฎ
//     คืนค่าเดิมตอนจบ (จดไว้เป็นแถว key อื่น — readCutoff อ่านเฉพาะ key='dispatchCutoff')
//   · สถานะที่ดูอย่างเดียว (เทา · นัดได้ถึง …) แก้ทั้ง serverNow และ cutoff ในคำตอบ GET ไม่ผสม serverNow ปลอมกับแถวเวลาปิดจริง
//     (ตั้งแต่ 00:06 ถึงราว 09:15 แถวจริง "ตอนนี้ +45 นาที" เช้ากว่า 10:00 จอจะคิดว่าเลยเวลาปิดแล้ว ผลขึ้นกับเวลาที่รัน)
//     ระหว่างแก้คำตอบไม่มีการบันทึก และถอดก่อนขั้นถัดไปที่ใช้เวลาจริง
//   · ตัวกันคร่อมเที่ยงคืน: เริ่มหลัง 23:10 / ก่อนส่วนนัดวันหลัง 22:50 รอให้พ้น 00:06 ก่อน — "+45 นาที" ข้ามวันได้และ "พรุ่งนี้" เปลี่ยนกลางทาง
//   · แถวที่เพิ่มลบทั้งหมดตอนจบ · ถูกฆ่ากลางทาง รอบหน้าเจอแถวจด → FAIL แล้วลบ/คืนให้ ไม่ปล่อยให้แอปใช้เวลาผิดเงียบ ๆ
// ยืนยันที่ฐานข้อมูลทุกข้อ ไม่เชื่อหน้าจออย่างเดียว (CLAUDE.md) · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { setup, visitDay } = require("./fixture");

const APP = "http://localhost:8081";
const MARK = "dispatchCutoffWebTestMax";
const SINCE_MARK = "dispatchCutoffWebTestSince";
const shot = (name) => path.join(__dirname, `dispatch-cutoff-${name}.png`);

// คำตามตัวอย่างที่เจ้าของงานอนุมัติ (appt-cutoff) — แอปต้องขึ้นตรงทุกตัวอักษร
const CARD_DESC =
  "หัวหน้าภาคนัดงานของพรุ่งนี้ได้ถึงเวลานี้ — เลยแล้วปฏิทินปิดวันพรุ่งนี้ (วันนี้ปิดตลอด) ร้านต้องการจริงให้แอดมินแก้เป็นงานด่วน · " +
  "คอนเฟิร์มลูกค้าและปล่อยงานกดได้ทุกเวลา · ทุกวันรวมเสาร์–อาทิตย์และวันหยุด · ใช้ทุกภาค · แอดมินเปลี่ยนได้ (Admin Spare Part ดูอย่างเดียว)";
const ASK_TMR = "ร้านต้องการพรุ่งนี้จริง — ขอแอดมินแก้เป็นงานด่วน";
const ASK_TODAY = "ร้านต้องการวันนี้จริง — ขอแอดมินแก้เป็นงานด่วน";
const URGENT_WITH = "แก้เป็นงานด่วนไปพร้อมกัน — ต้องไปวันนั้นจริง (ลงประวัติว่าใครแก้)";
const PENDING_HINT = "ขึ้นที่แอดมินในหัวข้อ “ขอนัดด่วน” · ระหว่างรอจะนัดวันอื่นไปเลยก็ได้";

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "อ. 3 พ.ย." · "อ. 3 พ.ย. 2569" — แบบเดียวกับ dayShort / thaiDateLong ของแอป */
const dShort = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`;
};
const dLong = (s) => `${dShort(s)} ${Number(s.slice(0, 4)) + 543}`;

(async () => {
  const fail = (m) => {
    console.log("FAIL", m);
    process.exitCode = 1;
  };
  const pass = (m) => console.log("PASS", m);
  const errors = [];

  /** กันคร่อมเที่ยงคืน: ถ้าเวลาไทยอยู่ระหว่าง fromMin (นาทีของวัน) ถึง 00:06 รอให้พ้น 00:06 ก่อน */
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
  await waitPastMidnight(23 * 60 + 10, "เวลาปิดทดสอบ 23:59 ของการ์ดตั้งค่าจะข้ามวัน");

  const fx = await setup();
  const { sql, call, A } = fx;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const suf = Date.now() % 100000;
  const PA = `ZDCW${suf}`;
  let sinceSaved = null;
  // ใบทดสอบที่คัดลอกผ่าน API (ไม่ผ่าน fixture) — ลบตอนจบ
  const extraOrders = [];
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
      fail(`มีแถวเวลาปิดที่เทสต์นี้รอบก่อนทิ้งไว้ (${ids || "ไม่มีแถวค้าง เหลือแค่แถวจด"}) — ลบออกแล้ว รอบหน้าจะผ่าน`);
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
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('${PA}','แอดมินอะไหล่ทดสอบเวลาปิดนัด','PARTS_ADMIN','${hash}',false)`);

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
    const lbl = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const card = (page) => lbl(page, "การ์ดเวลาปิดนัดงานพรุ่งนี้").first();
    const chip = (page, v) => card(page).locator(`[aria-label="${v}"]`).first();
    const checked = async (page, v) => (await chip(page, v).getAttribute("aria-checked").catch(() => null)) === "true";
    const openSettings = async (s, phone = false) => {
      await (phone ? s.vis("Admin").last() : s.vis("ระบบหลังบ้าน").first()).click();
      await card(s.page).waitFor({ timeout: 20000 });
      // การ์ดโหลดค่าจากเซิร์ฟเวอร์ — รอจนบรรทัดล่างไม่ใช่ "กำลังโหลด…"
      await s.page.waitForFunction(
        () => ![...document.querySelectorAll('[aria-label="การ์ดเวลาปิดนัดงานพรุ่งนี้"]')].some((n) => n.innerText.includes("กำลังโหลดเวลาปิดนัด")),
        null,
        { timeout: 15000 }
      );
      await s.page.waitForTimeout(500);
    };

    // ════════════════ 1) การ์ดตั้งค่า ════════════════
    // เริ่มจาก 15:00 (ใส่ทาง SQL ไม่มีชื่อคนเปลี่ยน) แล้วแตะ 16:30 = เลื่อนให้ช้าลง ไม่มีทางปิดวันพรุ่งนี้ทันที → ต้องไม่ถาม ไม่ว่ากี่โมง
    await setCut("15:00");
    const a = await openAs("A001", 1280);
    // จดคำขอของหน้านี้ — การ์ดต้องไม่ถาม dispatch-watch อีกเลย (เส้นทางนั้นถูกถอดแล้ว)
    const reqs = [];
    a.page.on("request", (r) => reqs.push(`${r.method()} ${r.url()}`));
    const watchCalls = () => reqs.filter((x) => x.includes("/work-orders/dispatch-watch")).length;
    const putCalls = (from) => reqs.slice(from).filter((x) => x.startsWith("PUT ") && x.includes("/settings/dispatch-cutoff")).length;
    await openSettings(a);
    const cardText = await card(a.page).innerText();
    (await a.vis("ตั้งค่า").count()) && cardText.includes("เวลาปิดนัดงานพรุ่งนี้") && cardText.includes(CARD_DESC) && !cardText.includes("ปิดรับปล่อยงาน")
      ? pass("หน้าระบบหลังบ้าน: การ์ด \"เวลาปิดนัดงานพรุ่งนี้\" พร้อมคำอธิบายตามตัวอย่าง (ไม่มีคำว่าปิดรับปล่อยงานแล้ว)")
      : fail(`การ์ดตั้งค่าไม่ครบ: ${cardText.slice(0, 300)}`);
    const five = [];
    for (const v of ["15:00", "15:30", "16:00", "16:30", "17:00"]) five.push(await chip(a.page, v).count());
    five.every((n) => n === 1) ? pass("ชิปเวลาครบ 5 ตัว 15:00–17:00 ทีละครึ่งชั่วโมง") : fail(`ชิปเวลา: ${five}`);
    (await checked(a.page, "15:00")) && !(await checked(a.page, "16:30"))
      ? pass("ชิปที่เลือกตรงกับค่าในฐานข้อมูล (15:00)")
      : fail("ชิปที่เลือกไม่ตรงค่าในฐานข้อมูล");
    cardText.includes("→ 15:00 น. · มีผลกับการนัดครั้งต่อไปทันที วันที่นัดไปแล้วไม่เปลี่ยน")
      ? pass("บรรทัดเปลี่ยนล่าสุดบอกค่าใหม่ 15:00 + \"มีผลกับการนัดครั้งต่อไปทันที วันที่นัดไปแล้วไม่เปลี่ยน\"")
      : fail(`บรรทัดเปลี่ยนล่าสุด: ${cardText}`);

    const before = maxId();
    const r16 = reqs.length;
    await chip(a.page, "16:30").click();
    const toast16 = "ตั้งเวลาปิดนัดงานพรุ่งนี้เป็น 16:30 น. แล้ว — มีผลกับการนัดครั้งต่อไปทันที";
    const toastSeen = await a.vis(toast16).first().waitFor({ timeout: 6000 }).then(() => true, () => false);
    await a.page.waitForTimeout(600);
    (await a.vis("ตั้งเวลาปิดนัดเป็น 16:30 น.?", false).count()) === 0 && putCalls(r16) === 1
      ? pass("เลื่อนให้ช้าลง (15:00 → 16:30) บันทึกทันที ไม่มีกล่องยืนยัน · ส่ง PUT ครั้งเดียว")
      : fail(`เลื่อนให้ช้าลงแล้วขึ้นกล่องยืนยัน หรือ PUT ${putCalls(r16)} ครั้ง`);
    latest() === `16:30|${aId}` && maxId() - before === 1
      ? pass("แตะ 16:30 → ฐานข้อมูลมีแถวใหม่ 1 แถว ค่า 16:30 คนเปลี่ยน A001")
      : fail(`หลังแตะ 16:30 ฐานข้อมูล: ${latest()} · แถวใหม่ ${maxId() - before}`);
    toastSeen ? pass(`toast: ${toast16}`) : fail("ไม่เห็น toast หลังตั้งเวลา");
    const after16 = await card(a.page).innerText();
    (await checked(a.page, "16:30")) && after16.includes(`เปลี่ยนล่าสุด: ${aName} · 15:00 → 16:30 น. · มีผลกับการนัดครั้งต่อไปทันที วันที่นัดไปแล้วไม่เปลี่ยน`)
      ? pass(`ชิป 16:30 เลือกอยู่ · บรรทัดเปลี่ยนล่าสุด: ${aName} · 15:00 → 16:30 น.`)
      : fail(`หลังแตะ 16:30: ${after16}`);
    // แตะตัวที่เลือกอยู่แล้วซ้ำ — ไม่ส่งอะไร (เซิร์ฟเวอร์ตอบ "เป็นเวลานี้อยู่แล้ว" ถ้าส่ง ผู้ใช้จะเห็นแจ้งเตือนแดงทั้งที่ไม่ได้ทำอะไรผิด)
    const same = maxId();
    const rSame = reqs.length;
    await chip(a.page, "16:30").click();
    await a.page.waitForTimeout(1200);
    putCalls(rSame) === 0 && maxId() === same
      ? pass("แตะเวลาที่เลือกอยู่แล้วซ้ำ ไม่ส่งคำขอ ไม่บันทึก")
      : fail(`แตะซ้ำแล้ว: PUT ${putCalls(rSame)} ครั้ง · แถวใหม่ ${maxId() - same}`);
    await a.page.screenshot({ path: shot("1-settings"), fullPage: true });

    // เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านแล้ว = ปฏิทินของหัวหน้าภาคปิดวันพรุ่งนี้ทันที → ถามก่อนเสมอ
    // นาฬิกาเซิร์ฟเวอร์ที่การ์ดเห็น = 15:30 ของวันนี้ (แก้เฉพาะคำตอบ GET ของการ์ด คำขอ PUT ไปเซิร์ฟเวอร์จริง)
    // ถ้าการ์ดหันไปใช้นาฬิกาเครื่อง ข้อนี้จะล้มทุกครั้งที่รันนอก 15:00–23:59 — จับบั๊กแบบนั้นได้ด้วย
    await setCut("23:59");
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
    const m1 = maxId();
    await chip(a.page, "15:00").click();
    const askTitle = a.vis("ตั้งเวลาปิดนัดเป็น 15:00 น.?");
    const asked = await askTitle.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    const body = "ตอนนี้เลย 15:00 น. แล้ว — ตั้งแล้วปฏิทินของหัวหน้าภาคปิดวันพรุ่งนี้ทันที ร้านที่ต้องการพรุ่งนี้ต้องให้แอดมินแก้เป็นงานด่วนทีละใบ";
    asked && (await a.vis(body).count())
      ? pass("เลื่อนให้เร็วขึ้นหลังเวลาใหม่ผ่านแล้ว → กล่องยืนยัน \"ตั้งเวลาปิดนัดเป็น 15:00 น.?\" + คำอธิบายตามตัวอย่าง")
      : fail("ไม่ขึ้นกล่องยืนยัน/ข้อความไม่ตรง");
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
      latest() === `15:00|${aId}` && maxId() === m1 + 1 && (await checked(a.page, "15:00"))
        ? pass("กด ตั้งเป็น 15:00 น. → ฐานข้อมูลมีแถวใหม่ ค่า 15:00 คนเปลี่ยน A001 · ชิป 15:00 เลือกอยู่")
        : fail(`หลังยืนยัน ฐานข้อมูล: ${latest()} · แถวใหม่ ${maxId() - m1}`);
    }
    watchCalls() === 0
      ? pass("การ์ดไม่ถาม dispatch-watch เลย (ไม่นับใบก่อนถาม — เส้นทางนั้นถูกถอดแล้ว)")
      : fail(`การ์ดยังเรียก dispatch-watch ${watchCalls()} ครั้ง`);
    await a.page.unroute("**/api/settings/dispatch-cutoff");
    await a.ctx.close();

    // Admin Spare Part ดูอย่างเดียว
    const p = await openAs(PA, 1280);
    const puts = [];
    p.page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("/settings/dispatch-cutoff")) puts.push(r.url());
    });
    await openSettings(p);
    const paText = await card(p.page).innerText();
    const dis = [];
    for (const v of ["15:00", "15:30", "16:00", "16:30", "17:00"]) dis.push(await chip(p.page, v).getAttribute("aria-disabled").catch(() => null));
    (await p.vis("จัดการข้อมูลอะไหล่").count()) && paText.includes("เวลาปิดนัดงานพรุ่งนี้") && dis.every((d) => d === "true") && (await checked(p.page, "15:00"))
      ? pass("Admin Spare Part: เห็นการ์ดเวลาปิดนัดคู่กับจัดการข้อมูลอะไหล่ · เห็นค่าปัจจุบัน · ชิปทั้ง 5 กดไม่ได้")
      : fail(`Admin Spare Part: การ์ด/ชิป ${dis}`);
    const m2 = maxId();
    await chip(p.page, "16:00").click({ force: true });
    await p.page.waitForTimeout(1500);
    maxId() === m2 && puts.length === 0
      ? pass("Admin Spare Part กดชิปแรง ๆ ก็ไม่ส่งคำขอเปลี่ยน ฐานข้อมูลไม่เปลี่ยน")
      : fail(`Admin Spare Part กดแล้ว: PUT ${puts.length} ครั้ง · แถวใหม่ ${maxId() - m2}`);
    await p.ctx.close();

    // จอมือถือ 420
    const ph = await openAs("A001", 420, 900);
    await openSettings(ph, true);
    const fit = await ph.page.evaluate(() => {
      const box = document.querySelector('[aria-label="การ์ดเวลาปิดนัดงานพรุ่งนี้"]');
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
    await ph.ctx.close();

    // ════════════════ เตรียมส่วนนัดวัน ════════════════
    // ตั้งแต่ 22:50 รอข้ามเที่ยงคืน — ส่วนที่เหลือใช้เวลาราวสิบห้านาทีและตั้งเวลาปิด +45 นาทีหลายรอบ ต้องไม่ข้ามวันกลางทาง
    await waitPastMidnight(22 * 60 + 50, "เวลาปิดทดสอบ (+45 นาที) จะข้ามวัน และ \"พรุ่งนี้\" เปลี่ยนกลางทาง");
    // เวลาเริ่มใช้กฎถอยไป 30 วัน — วันนี้/พรุ่งนี้ต้องอยู่ใต้กฎจริง แม้ฐานนี้เพิ่งเปิดกฎวันนี้
    const seedId = sql(`select id from "AppSetting" where key='dispatchCutoff' order by id asc limit 1`);
    if (seedId) {
      const seedAt = sql(`select to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS') from "AppSetting" where id=${seedId}`);
      sql(`insert into "AppSetting"(key,value) values ('${SINCE_MARK}','${seedId}|${seedAt}')`);
      sql(`update "AppSetting" set "createdAt"=now()-interval '30 days' where id=${seedId}`);
      sinceSaved = { id: seedId, at: seedAt };
    }
    const pad2 = (n) => String(n).padStart(2, "0");
    /** "HH:MM" ตามเวลาไทยอีก off นาทีจากตอนนี้ (ตัดวินาทีทิ้ง) */
    const bkk = (off) => {
      const d = new Date(Date.now() + 7 * 3600e3 + off * 60e3);
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    };
    /** เวลาปิดทดสอบ — ข้ามเที่ยงคืนแล้วผลจะผิดวัน หยุดพร้อมเหตุผลดีกว่าผ่าน/ล้มแบบสุ่ม */
    const cutIn = (off) => {
      const v = bkk(off);
      if ((off > 0 && v <= bkk(0)) || (off < 0 && v >= bkk(0))) throw new Error(`เวลาปิดทดสอบ ${v} (${off} นาที) ข้ามเที่ยงคืน — รันใหม่หลัง 00:06`);
      return v;
    };
    const today = visitDay(0);
    const tomorrow = visitDay(1);
    const d2 = visitDay(2);
    const d3 = visitDay(3);
    const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
    const rowOf = (id) => sql(`select status||'|'||coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-') from "WorkOrder" where id=${id}`);
    const urfOf = (id) => sql(`select coalesce(to_char("urgentReleaseFor",'YYYY-MM-DD'),'-') from "WorkOrder" where id=${id}`);
    const logCount = (id, action) => Number(sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${id} and action='${action}'`));
    const lastAction = (id) => sql(`select action from "WorkOrderLog" where "workOrderId"=${id} order by id desc limit 1`);
    const askDayOf = (id) =>
      sql(`select coalesce(meta->>'day','-') from "WorkOrderLog" where "workOrderId"=${id} and action='URGENT_REQUESTED' order by id desc limit 1`);
    const teamOf = (id) => sql(`select coalesce("assignedTeam",'') from "WorkOrder" where id=${id}`);
    /** ใบรอนัดวันเข้า (PARTS_CHECKED): ระบุอะไหล่ 1 ชิ้น (ไฟล์ยี่ห้อเดียวกับเครื่อง) → แอดมินเช็คว่ามีที่คลัง 94 */
    const partsChecked = async () => {
      const wo = await fx.workOrder("C0006", null);
      const pid = fx.fxPart(wo.id, "BOARD");
      await call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, { needsParts: true, parts: [{ sparePartId: pid, quantity: 1 }] });
      await fx.source(wo.id);
      return wo;
    };
    /**
     * ใบรอปล่อยงาน (ASSIGNED) วันนัด day ที่ไม่มีงานด่วน — นัดมะรืน (เปิดเสมอ) แล้วย้ายวันทาง SQL
     * นัดตรงไม่ได้แล้ว (วันนี้/พรุ่งนี้หลังเวลาปิดถูกปฏิเสธ) และห้ามใช้งานด่วน: ใบที่มี urgentReleaseFor ปล่อยได้แม้กฎเดิม จะพิสูจน์อะไรไม่ได้
     */
    const releaseOrderAt = async (day) => {
      const o = await fx.workOrder("C0006", []);
      await fx.schedule(o.id, d2);
      await fx.confirm(o.id);
      if (day !== d2) sql(`update "WorkOrder" set "scheduledAt"='${day}'::timestamp where id=${o.id}`);
      return o;
    };
    const S = () => fx.supervisor();

    /** การ์ดของใบในงานของฉันวันนี้ — ขึ้นจากปุ่ม "รายละเอียด <code>" ไปจนถึงกล่องที่ข้อความขึ้นต้นด้วยรหัสใบ */
    const queueCard = (page, code) =>
      page.evaluate((code) => {
        const btn = [...document.querySelectorAll(`[aria-label="รายละเอียด ${code}"]`)].find((n) => n.getClientRects().length);
        let el = btn;
        while (el && !(el.innerText || "").trim().startsWith(code)) el = el.parentElement;
        if (!el) return null;
        return { text: el.innerText, labels: [...el.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label")) };
      }, code);
    const toQueue = async (sess) => {
      await sess.page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await sess.page.locator('[aria-label="ตัวเลขสรุปงานที่รอ"]').locator("visible=true").first().waitFor({ timeout: 30000 });
      await sess.page.waitForTimeout(1500);
    };
    /** เปิดใบงานจากหน้ารายการ (ค้นรหัส) — ใบที่ไม่อยู่ในกล่องของคนเปิด (แอดมินดูใบรอหัวหน้าภาค · ใบทดสอบ) */
    const openOrder = async (sess, code) => {
      await sess.page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await sess.page.waitForTimeout(2500);
      await sess.page.getByLabel("ใบงานซ่อม").first().click();
      await sess.page.waitForTimeout(2500);
      await sess.vis("ทั้งหมด").first().click().catch(() => {});
      await sess.page.waitForTimeout(1200);
      await sess.page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await sess.page.waitForTimeout(2500);
      await sess.vis(code).last().click();
      await sess.page.waitForTimeout(3500);
    };
    /** จากงานของฉันวันนี้ → หน้าใบงาน → ปุ่มขั้น (aria-label = ข้อความปุ่ม — ชื่อขั้นบนแถบขั้นตอนอยู่ก่อน จึงเอาตัวสุดท้าย) */
    const openFromQueue = async (sess, code, stage) => {
      await lbl(sess.page, `รายละเอียด ${code}`).first().click();
      await sess.page.waitForTimeout(3500);
      await lbl(sess.page, stage).last().click();
      await sess.page.waitForTimeout(1500);
    };
    const cell = (page, day) => lbl(page, dLong(day)).first();
    /** ช่องวันในปฏิทินที่เปิดอยู่: aria-disabled · สี/แบบเส้นขอบ · ตัวเลขขีดฆ่าไหม — null = ไม่อยู่ในตารางเดือนที่เปิด */
    const cellInfo = (page, day) =>
      page.evaluate((label) => {
        const el = [...document.querySelectorAll(`[aria-label="${label}"]`)].find((n) => n.getClientRects().length);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const t = [...el.querySelectorAll("*")].find((n) => n.childElementCount === 0 && n.textContent.trim() !== "");
        return {
          disabled: el.getAttribute("aria-disabled") === "true",
          border: cs.borderTopColor,
          borderStyle: cs.borderTopStyle,
          strike: t ? getComputedStyle(t).textDecorationLine : "",
        };
      }, dLong(day));
    /** ป้ายใต้ปฏิทิน "อ. 3 พ.ย. · …" ที่มองเห็นอยู่ */
    const tagsOf = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("[aria-label]")]
          .filter((n) => n.getClientRects().length)
          .map((n) => n.getAttribute("aria-label"))
          .filter((l) => /^(อา|จ|อ|พ|พฤ|ศ|ส)\. \d{1,2} \S+ · /.test(l))
      );
    const openCal = async (page, field) => {
      await lbl(page, field).last().click();
      await page.waitForTimeout(700);
    };
    const closeCal = async (page) => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    };
    /** เลือกวันในปฏิทิน — พรุ่งนี้ของวันสิ้นเดือนอาจไม่อยู่ในตารางเดือนนี้ เลื่อนไปเดือนถัดไปก่อน */
    const pickDay = async (page, field, day) => {
      await openCal(page, field);
      if ((await cell(page, day).count()) === 0) {
        await lbl(page, "เดือนถัดไป").last().click();
        await page.waitForTimeout(300);
      }
      await cell(page, day).click();
      await page.waitForTimeout(600);
    };
    const setTime = async (page, t) => {
      await lbl(page, "เวลา (ไม่ใส่ก็ได้)").last().click();
      await page.waitForTimeout(500);
      await lbl(page, `${t} น.`).last().click();
      await page.waitForTimeout(400);
    };
    const fieldText = async (page, l) => ((await lbl(page, l).count()) ? await lbl(page, l).last().innerText() : "");
    /** ปุ่มบันทึกของฟอร์ม ("ยืนยัน") ถูกปิดอยู่ไหม — ปุ่มบนเว็บไม่ใช่ role=button หาด้วยข้อความ */
    const saveOff = async (page) => (await page.locator('[aria-disabled="true"]').filter({ hasText: /^ยืนยัน$/ }).locator("visible=true").count()) > 0;
    /** "เหลือ N นาที" ที่ยอมรับได้ ณ ตอนนี้ — จอปัดเศษลง คิดจากนาฬิกาจริง (คลาดได้หนึ่งนาทีตอนข้ามนาที) */
    const leftAlt = (C) => {
      const n = Math.floor((Date.parse(`${today}T${C}:00.000+07:00`) - Date.now()) / 60000);
      return `(${n - 1}|${n}|${n + 1})`;
    };
    /** n ของแถบ "รอนัดวัน" ตามกติกาเดียวกับแอป — นับจากกล่องงานของ S001 ที่เซิร์ฟเวอร์ส่ง (ฐานข้อมูลเครื่องทดสอบอาจมีใบอื่น) */
    const waitingCount = async () => {
      const inbox = await call(S(), "GET", "/work-orders?status=INBOX");
      return (inbox.rows || []).filter(
        (r) =>
          ["NEW", "PARTS_CHECKED"].includes(r.status) &&
          !r.isTest &&
          String(r.urgentReleaseFor || "").slice(0, 10) !== tomorrow &&
          !(r.urgentAsk && r.urgentAsk.day === tomorrow)
      ).length;
    };

    // ════════════════ 2) ฟอร์มนัดวันเข้าตอนเหลือ 45 นาที ════════════════
    const P1 = await partsChecked();
    st(P1.id) === "PARTS_CHECKED" ? pass(`เตรียมใบรอนัดวันเข้า ${P1.code} (ฐานข้อมูล PARTS_CHECKED)`) : fail(`เตรียม ${P1.code}: ${st(P1.id)}`);
    const C2 = cutIn(45);
    await setCut(C2);
    const n2 = await waitingCount();
    const s2 = await openAs("S001", 1280);
    await toQueue(s2);
    const banner2 = s2.page.locator(`[aria-label^="หัวข้อ รอนัดวัน ${n2} ใบ — นัดพรุ่งนี้ได้ถึง ${C2} (เหลือ "]`).locator("visible=true").first();
    const banner2Text = (await banner2.count()) ? await banner2.innerText() : "";
    new RegExp(`รอนัดวัน ${n2} ใบ — นัดพรุ่งนี้ได้ถึง ${C2} \\(เหลือ ${leftAlt(C2)} นาที\\)`).test(banner2Text) &&
    banner2Text.includes(`ถึง ${C2} น. ปฏิทินจะปิดวันพรุ่งนี้ — แตะที่ใบเพื่อนัดวัน`)
      ? pass(`งานของฉันวันนี้: แถบ "รอนัดวัน ${n2} ใบ — นัดพรุ่งนี้ได้ถึง ${C2} (เหลือ N นาที)" + คำอธิบาย (n ตามกล่องงานของเซิร์ฟเวอร์ · N ตามนาฬิกาจริง)`)
      : fail(`แถบรอนัดวัน: "${banner2Text}" · คาด ${n2} ใบ`);
    const p1Card = await queueCard(s2.page, P1.code);
    p1Card && p1Card.labels.some((l) => new RegExp(`^นัดพรุ่งนี้ได้ถึง ${C2} · เหลือ ${leftAlt(C2)} นาที$`).test(l))
      ? pass(`การ์ด ${P1.code}: ป้ายส้ม "นัดพรุ่งนี้ได้ถึง ${C2} · เหลือ N นาที"`)
      : fail(`ป้ายบนการ์ด ${P1.code}: ${p1Card ? p1Card.labels.join(" | ") : "ไม่เจอการ์ด"}`);
    await s2.page.screenshot({ path: shot("3-sup-countdown"), fullPage: true });

    // กล่องงาน: แถบเดียวกัน (ตัวสร้างเดียวกัน) มีแถวของ P1
    await s2.vis("กล่องงานของฉัน").first().click();
    await s2.page.waitForTimeout(3500);
    const inboxRow = s2.page.locator(`[aria-label^="รอนัดวัน ${n2} ใบ — นัดพรุ่งนี้ได้ถึง ${C2} (เหลือ "][aria-label$=" ${P1.code}"]`).locator("visible=true");
    (await inboxRow.count()) > 0
      ? pass(`กล่องงาน: แถบ "รอนัดวัน ${n2} ใบ …" มีแถว ${P1.code} — นับตรงกับงานของฉันวันนี้`)
      : fail(`กล่องงาน แถบรอนัดวัน: ${await s2.page.locator('[aria-label^="หัวข้อ รอนัดวัน"]').allInnerTexts()}`);

    // หน้าใบงาน: ป้ายข้างปุ่มขั้น · ฟอร์มนัดวันเข้า
    await toQueue(s2);
    await lbl(s2.page, `รายละเอียด ${P1.code}`).first().click();
    await s2.page.waitForTimeout(3500);
    const stageChip = await s2.page.locator(`[aria-label^="นัดพรุ่งนี้ได้ถึง ${C2} · เหลือ "]`).locator("visible=true").allInnerTexts();
    stageChip.length === 1
      ? pass(`หน้าใบงาน: ป้าย "${stageChip[0]}" ข้างปุ่มขั้น`)
      : fail(`หน้าใบงาน ป้ายข้างปุ่มขั้น: ${JSON.stringify(stageChip)}`);
    await lbl(s2.page, "นัดวันเข้า").last().click();
    await s2.page.waitForTimeout(1500);
    const line4 = new RegExp(`^นัดพรุ่งนี้ได้อีก ${leftAlt(C2)} นาที — ถึง ${C2} น\\. ปฏิทินจะปิดวันพรุ่งนี้$`);
    (await s2.page.getByText(line4).locator("visible=true").count()) > 0
      ? pass(`ฟอร์มนัดวันเข้า: บรรทัดส้ม "นัดพรุ่งนี้ได้อีก N นาที — ถึง ${C2} น. ปฏิทินจะปิดวันพรุ่งนี้"`)
      : fail(`บรรทัดส้มใต้ปฏิทิน: คาด ${line4}`);
    (await lbl(s2.page, ASK_TODAY).count()) === 1 && (await lbl(s2.page, ASK_TMR).count()) === 0
      ? pass("ปุ่ม \"ร้านต้องการวันนี้จริง — ขอแอดมินแก้เป็นงานด่วน\" มี (วันนี้ปิดเสมอ) · ปุ่มขอพรุ่งนี้ยังไม่มี (ยังไม่ถึงเวลาปิด)")
      : fail(`ปุ่มขอ: วันนี้ ${await lbl(s2.page, ASK_TODAY).count()} · พรุ่งนี้ ${await lbl(s2.page, ASK_TMR).count()}`);
    await openCal(s2.page, "วันเข้างาน");
    const tToday = await cellInfo(s2.page, today);
    const tTmr = await cellInfo(s2.page, tomorrow);
    const tags2 = await tagsOf(s2.page);
    tToday && tToday.disabled && tags2.includes(`${dShort(today)} · งานด่วนเท่านั้น`)
      ? pass(`ปฏิทิน: วันนี้ (${dShort(today)}) กดไม่ได้ (aria-disabled) + ป้าย "งานด่วนเท่านั้น"`)
      : fail(`ช่องวันนี้: ${JSON.stringify(tToday)} · ป้าย ${JSON.stringify(tags2)}`);
    const tmrTag = tags2.find((t) => t.startsWith(`${dShort(tomorrow)} · `)) || "";
    new RegExp(`^${dShort(tomorrow).replace(/\./g, "\\.")} · เหลือ ${leftAlt(C2)} นาที$`).test(tmrTag)
      ? pass(`ป้ายพรุ่งนี้ "${tmrTag}" (ตามนาฬิกาจริง)`)
      : fail(`ป้ายพรุ่งนี้: "${tmrTag}" · ป้ายทั้งหมด ${JSON.stringify(tags2)}`);
    // พรุ่งนี้ของวันสิ้นเดือนที่จบวันเสาร์ไม่อยู่ในตารางเดือนนี้เลย — ป้ายใต้ตารางยังบอก (ข้อข้างบน) ช่องเช็คไม่ได้
    if (tTmr) {
      !tTmr.disabled && tTmr.border === "rgb(245, 158, 11)"
        ? pass("ช่องพรุ่งนี้กดได้ และขอบส้ม (นับถอยหลังอยู่บนช่องพรุ่งนี้)")
        : fail(`ช่องพรุ่งนี้: ${JSON.stringify(tTmr)}`);
    } else console.log(`    ช่องพรุ่งนี้ (${tomorrow}) ไม่อยู่ในตารางเดือนนี้ — เช็คแค่ป้ายใต้ตาราง`);
    await s2.page.screenshot({ path: shot("4-sup-calendar") });
    await closeCal(s2.page);
    await s2.vis("ยกเลิก").last().click();
    await s2.page.waitForTimeout(800);
    st(P1.id) === "PARTS_CHECKED" ? pass(`ปิดฟอร์มโดยไม่บันทึก — ${P1.code} ยัง PARTS_CHECKED (ฐานข้อมูล)`) : fail(`${P1.code} หลังปิดฟอร์ม: ${st(P1.id)}`);

    // สถานะที่ดูอย่างเดียว: serverNow 10:00 (วันจริง) + cutoff 16:00 ในคำตอบ GET รายการ/ใบงาน → ก่อนช่วง 3 ชม.
    const fake10 = new Date(`${today}T10:00:00.000+07:00`).toISOString();
    const listOrDetail = (u) => /\/api\/work-orders(\/\d+)?$/.test(u.pathname);
    await s2.page.route(listOrDetail, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const resp = await route.fetch();
      let json;
      try {
        json = await resp.json();
      } catch {
        return route.fulfill({ response: resp });
      }
      if (json && typeof json === "object" && json.cutoff) {
        json.serverNow = fake10;
        json.cutoff = { time: "16:00", since: json.cutoff.since };
      }
      await route.fulfill({ response: resp, json });
    });
    await toQueue(s2);
    const noBanner = (await s2.page.locator('[aria-label^="หัวข้อ รอนัดวัน"]').locator("visible=true").count()) === 0;
    await openFromQueue(s2, P1.code, "นัดวันเข้า");
    const grey = "นัดพรุ่งนี้ได้ถึง 16:00 น. วันนี้ — หลังจากนั้นวันแรกที่นัดได้คือมะรืน";
    const greySeen = (await s2.vis(grey).count()) > 0;
    await openCal(s2.page, "วันเข้างาน");
    const tags10 = await tagsOf(s2.page);
    noBanner && greySeen && tags10.includes(`${dShort(tomorrow)} · นัดได้ถึง 16:00`) && tags10.includes(`${dShort(today)} · งานด่วนเท่านั้น`)
      ? pass("ตอน 10:00 (ปิด 16:00): ไม่มีแถบรอนัดวัน · ป้ายพรุ่งนี้ \"นัดได้ถึง 16:00\" · บรรทัดเทา \"นัดพรุ่งนี้ได้ถึง 16:00 น. วันนี้ — …มะรืน\"")
      : fail(`สถานะ 10:00: แถบหาย=${noBanner} · บรรทัดเทา=${greySeen} · ป้าย ${JSON.stringify(tags10)}`);
    await closeCal(s2.page);
    await s2.vis("ยกเลิก").last().click();
    await s2.page.waitForTimeout(500);
    await s2.page.unroute(listOrDetail);
    await s2.ctx.close();

    // ════════════════ 8) มือถือ 420 (ยัง +45 นาที — มีทั้งแถบ ป้าย และปุ่มขอวันนี้) ════════════════
    const s8 = await openAs("S001", 420, 900);
    await toQueue(s8);
    const bannerBox = await s8.page.evaluate(() => {
      const b = [...document.querySelectorAll('[aria-label^="หัวข้อ รอนัดวัน"]')].find((n) => n.getClientRects().length);
      return b ? b.getBoundingClientRect().right : null;
    });
    await openFromQueue(s8, P1.code, "นัดวันเข้า");
    await openCal(s8.page, "วันเข้างาน");
    const lay8 = await s8.page.evaluate((ask) => {
      const right = (sel) =>
        [...document.querySelectorAll(sel)].filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect().right);
      const tags = [...document.querySelectorAll("[aria-label]")]
        .filter((n) => n.getClientRects().length && / · /.test(n.getAttribute("aria-label")) && /^(อา|จ|อ|พ|พฤ|ศ|ส)\. /.test(n.getAttribute("aria-label")))
        .map((n) => n.getBoundingClientRect().right);
      return { tags, ask: right(`[aria-label="${ask}"]`), scroll: document.scrollingElement.scrollWidth };
    }, ASK_TODAY);
    bannerBox !== null && bannerBox <= 420 && lay8.tags.length >= 2 && Math.max(...lay8.tags) <= 420 && lay8.ask.length === 1 && lay8.ask[0] <= 420 && lay8.scroll <= 420
      ? pass("มือถือ 420: แถบรอนัดวัน · ปฏิทินกับแถวป้าย · ปุ่มขอวันนี้ อยู่ในจอ ไม่เลื่อนข้าง")
      : fail(`มือถือ 420: แถบ ${bannerBox} · ${JSON.stringify(lay8)}`);
    await s8.page.screenshot({ path: shot("5-phone-calendar") });
    await s8.ctx.close();

    // ════════════════ 3) กดตอนเวลาเพิ่งผ่าน ════════════════
    const P2 = await partsChecked();
    await setCut(cutIn(45));
    const s3 = await openAs("S001", 1280);
    await toQueue(s3);
    await openFromQueue(s3, P2.code, "นัดวันเข้า");
    await pickDay(s3.page, "วันเข้างาน", tomorrow);
    await setTime(s3.page, "10:30");
    const picked = (await fieldText(s3.page, "วันเข้างาน")).includes(dLong(tomorrow)) && !(await saveOff(s3.page));
    picked ? pass(`เปิดฟอร์ม ${P2.code} ตอนยังนัดพรุ่งนี้ได้ · เลือกพรุ่งนี้ + 10:30 ปุ่มยืนยันกดได้`) : fail("เลือกพรุ่งนี้ตอนยังเปิดไม่ได้");
    const C3 = cutIn(-1);
    await setCut(C3);
    await s3.vis("ยืนยัน").last().click();
    const red3 = `วันที่เลือกไว้ (${dShort(tomorrow)}) ปิดนัดแล้ว — เลย ${C3} น. ตามเวลาระบบ · เลือกวันใหม่`;
    const redSeen = await s3.vis(red3).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    redSeen && (await saveOff(s3.page)) && (await fieldText(s3.page, "เวลา (ไม่ใส่ก็ได้)")).includes("10:30 น.") &&
    (await s3.vis(`เลย ${C3} น. แล้ว — นัดพรุ่งนี้ไม่ได้ เลือกวันใหม่`).count()) === 0
      ? pass(`ถูกปฏิเสธ: ฟอร์มไม่ปิด บรรทัดแดง "${red3}" · ปุ่มยืนยันปิด · เวลา 10:30 ยังอยู่ · ไม่ขึ้นข้อความซ้ำของเซิร์ฟเวอร์`)
      : fail(`หลังถูกปฏิเสธ: บรรทัดแดง=${redSeen} · ปุ่มปิด=${await saveOff(s3.page)} · เวลา "${await fieldText(s3.page, "เวลา (ไม่ใส่ก็ได้)")}"`);
    await openCal(s3.page, "วันเข้างาน");
    const tmr3 = await cellInfo(s3.page, tomorrow);
    const tags3 = await tagsOf(s3.page);
    (tmr3 === null || tmr3.disabled) && tags3.includes(`${dShort(tomorrow)} · ปิด ${C3} แล้ว`)
      ? pass(`ปฏิทินคิดใหม่จากนาฬิกาในคำตอบ: พรุ่งนี้กดไม่ได้ + "ปิด ${C3} แล้ว" (ไม่โหลดใบใหม่)`)
      : fail(`ปฏิทินหลังถูกปฏิเสธ: ${JSON.stringify(tmr3)} · ${JSON.stringify(tags3)}`);
    await closeCal(s3.page);
    rowOf(P2.id) === "PARTS_CHECKED|-" && logCount(P2.id, "ASSIGNED") === 0
      ? pass(`${P2.code} ยัง PARTS_CHECKED ไม่มีวันนัด ไม่มีประวัติ ASSIGNED (ฐานข้อมูล)`)
      : fail(`หลังถูกปฏิเสธ ${P2.code}: ${rowOf(P2.id)} · ASSIGNED ${logCount(P2.id, "ASSIGNED")}`);
    await s3.page.screenshot({ path: shot("6-stale-press") });
    await s3.ctx.close();

    // ════════════════ 4) หลังเวลาปิด: ขอแอดมิน · ยกเลิก · แข่งกับแอดมิน ════════════════
    const P3 = await partsChecked();
    const C4 = cutIn(-2);
    await setCut(C4);
    const s4 = await openAs("S001", 1280);
    await toQueue(s4);
    await openFromQueue(s4, P3.code, "นัดวันเข้า");
    const blue = `เลย ${C4} น. แล้ว — นัดพรุ่งนี้ (${dShort(tomorrow)}) ไม่ได้ · วันแรกที่นัดได้คือ ${dShort(d2)}`;
    (await s4.vis(blue).count()) > 0 ? pass(`บรรทัดฟ้า "${blue}"`) : fail(`ไม่เห็นบรรทัดฟ้า "${blue}"`);
    await openCal(s4.page, "วันเข้างาน");
    const tmr4 = await cellInfo(s4.page, tomorrow);
    const tags4 = await tagsOf(s4.page);
    tags4.includes(`${dShort(tomorrow)} · ปิด ${C4} แล้ว`) && (tmr4 === null || (tmr4.disabled && tmr4.borderStyle === "dashed" && tmr4.strike.includes("line-through")))
      ? pass(`ปฏิทิน: พรุ่งนี้ขีดฆ่า กดไม่ได้ ขอบเส้นประ + ป้าย "ปิด ${C4} แล้ว"`)
      : fail(`ช่องพรุ่งนี้หลังเวลาปิด: ${JSON.stringify(tmr4)} · ${JSON.stringify(tags4)}`);
    await closeCal(s4.page);
    const askPos = await s4.page.evaluate(
      ([t, d]) => {
        const top = (l) => [...document.querySelectorAll(`[aria-label="${l}"]`)].filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect().top);
        return { tmr: top(t), today: top(d) };
      },
      [ASK_TMR, ASK_TODAY]
    );
    askPos.tmr.length === 1 && askPos.today.length === 1 && askPos.tmr[0] < askPos.today[0]
      ? pass("ปุ่มขอสองปุ่ม: \"ร้านต้องการพรุ่งนี้จริง — …\" แล้ว \"ร้านต้องการวันนี้จริง — …\"")
      : fail(`ปุ่มขอหลังเวลาปิด: ${JSON.stringify(askPos)}`);
    await setTime(s4.page, "10:30");
    const team4 = await fieldText(s4.page, "ทีมที่จะรับงาน");
    const keptInputs = async () =>
      (await fieldText(s4.page, "เวลา (ไม่ใส่ก็ได้)")).includes("10:30 น.") && (await fieldText(s4.page, "ทีมที่จะรับงาน")) === team4 && team4 !== "";

    await lbl(s4.page, ASK_TMR).last().click();
    const pendTmr = `ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน (นัด ${dShort(tomorrow)})`;
    const pend1 = await s4.vis(pendTmr).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    pend1 && (await s4.vis(PENDING_HINT).count()) > 0 && (await lbl(s4.page, ASK_TMR).count()) === 0 && (await lbl(s4.page, ASK_TODAY).count()) === 0 && (await keptInputs())
      ? pass(`ขอพรุ่งนี้ → กล่องม่วง "${pendTmr}" + "${PENDING_HINT}" · ปุ่มขอทั้งสองหาย · ทีม/เวลาที่กรอกอยู่ครบ (ฟอร์มไม่ล้าง)`)
      : fail(`หลังขอพรุ่งนี้: กล่องม่วง=${pend1} · ปุ่มขอ ${await lbl(s4.page, ASK_TMR).count()}/${await lbl(s4.page, ASK_TODAY).count()} · ทีม/เวลา=${await keptInputs()}`);
    lastAction(P3.id) === "URGENT_REQUESTED" && askDayOf(P3.id) === tomorrow && st(P3.id) === "PARTS_CHECKED"
      ? pass(`ฐานข้อมูล: URGENT_REQUESTED meta.day = ${tomorrow} · ${P3.code} ยัง PARTS_CHECKED`)
      : fail(`หลังขอพรุ่งนี้ ฐานข้อมูล: ${lastAction(P3.id)} · day ${askDayOf(P3.id)} · ${st(P3.id)}`);
    await s4.page.screenshot({ path: shot("7-ask-pending") });
    await lbl(s4.page, "ยกเลิกคำขอ").last().click();
    const back4 = await lbl(s4.page, ASK_TMR).last().waitFor({ timeout: 8000 }).then(() => true, () => false);
    back4 && (await lbl(s4.page, ASK_TODAY).count()) === 1 && lastAction(P3.id) === "URGENT_REQUEST_CANCELLED"
      ? pass("ยกเลิกคำขอ → URGENT_REQUEST_CANCELLED (ฐานข้อมูล) · ปุ่มขอทั้งสองกลับมา")
      : fail(`ยกเลิกคำขอ: ${lastAction(P3.id)} · ปุ่มกลับมา=${back4}`);

    await lbl(s4.page, ASK_TODAY).last().click();
    const pendToday = `ส่งคำขอแล้ว — รอแอดมินแก้เป็นงานด่วน (นัด ${dShort(today)})`;
    const pend2 = await s4.vis(pendToday).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    pend2 && askDayOf(P3.id) === today && lastAction(P3.id) === "URGENT_REQUESTED"
      ? pass(`ขอวันนี้ → กล่องม่วง "${pendToday}" · URGENT_REQUESTED meta.day = ${today} (ฐานข้อมูล)`)
      : fail(`ขอวันนี้: กล่องม่วง=${pend2} · ${lastAction(P3.id)} · day ${askDayOf(P3.id)}`);
    await lbl(s4.page, "ยกเลิกคำขอ").last().click();
    await lbl(s4.page, ASK_TMR).last().waitFor({ timeout: 8000 }).catch(() => {});
    lastAction(P3.id) === "URGENT_REQUEST_CANCELLED" ? pass("ยกเลิกคำขอวันนี้ (ฐานข้อมูล)") : fail(`ยกเลิกคำขอวันนี้: ${lastAction(P3.id)}`);

    // แข่งกัน: แอดมินแก้ให้ก่อนที่ตัวเช็ค 20 วิจะมาถึง แล้วหัวหน้าภาคกดยกเลิกคำขอพอดี
    await lbl(s4.page, ASK_TMR).last().click();
    await s4.vis(pendTmr).first().waitFor({ timeout: 8000 }).catch(() => {});
    const versionRoute = "**/work-orders/*/version";
    await s4.page.route(versionRoute, (r) => r.abort());
    const cancels = logCount(P3.id, "URGENT_REQUEST_CANCELLED");
    await call(A, "POST", `/work-orders/${P3.id}/urgent-release`, { day: tomorrow });
    urfOf(P3.id) === tomorrow && logCount(P3.id, "URGENT_RELEASE") === 1
      ? pass(`แอดมินแก้เป็นงานด่วนพรุ่งนี้ทาง API (ฐานข้อมูล urgentReleaseFor = ${tomorrow})`)
      : fail(`แอดมินแก้เป็นงานด่วนไม่สำเร็จ: ${urfOf(P3.id)} · URGENT_RELEASE ${logCount(P3.id, "URGENT_RELEASE")}`);
    await lbl(s4.page, "ยกเลิกคำขอ").last().click();
    const errSeen = await s4.page.getByText(/^ไม่มีคำขอที่รอแอดมินแล้ว — /).locator("visible=true").first()
      .waitFor({ timeout: 10000 }).then(() => true, () => false);
    const green = `แอดมินแก้เป็นงานด่วนให้แล้ว — นัด ${dShort(tomorrow)} ได้ (เฉพาะใบนี้ · ลงประวัติแล้ว)`;
    const formOpen = (await lbl(s4.page, "วันเข้างาน").count()) > 0;
    errSeen && formOpen && (await keptInputs()) && (await s4.vis(green).count()) > 0
      ? pass(`แข่งกัน: ฟอร์มไม่ปิด ทีม/เวลาอยู่ครบ · บรรทัด "ไม่มีคำขอที่รอแอดมินแล้ว — …" · บรรทัดเขียว "${green}"`)
      : fail(`แข่งกัน: ข้อความ=${errSeen} · ฟอร์มเปิด=${formOpen} · ทีม/เวลา=${await keptInputs()} · บรรทัดเขียว=${(await s4.vis(green).count()) > 0}`);
    await openCal(s4.page, "วันเข้างาน");
    const tags4b = await tagsOf(s4.page);
    const tmr4b = await cellInfo(s4.page, tomorrow);
    tags4b.includes(`${dShort(tomorrow)} · แอดมินแก้เป็นงานด่วน`) && (tmr4b === null || !tmr4b.disabled)
      ? pass("ป้ายพรุ่งนี้เป็นเขียว \"แอดมินแก้เป็นงานด่วน\" และกดได้ (วาดทับจากใบที่ดึงมาใหม่)")
      : fail(`ปฏิทินหลังแข่งกัน: ${JSON.stringify(tags4b)} · ${JSON.stringify(tmr4b)}`);
    await closeCal(s4.page);
    logCount(P3.id, "URGENT_RELEASE") === 1 && logCount(P3.id, "URGENT_REQUEST_CANCELLED") === cancels && st(P3.id) === "PARTS_CHECKED"
      ? pass(`ฐานข้อมูล: URGENT_RELEASE 1 แถว · ไม่มียกเลิกคำขอเพิ่ม · ${P3.code} ยัง PARTS_CHECKED`)
      : fail(`หลังแข่งกัน: URGENT_RELEASE ${logCount(P3.id, "URGENT_RELEASE")} · ยกเลิก ${logCount(P3.id, "URGENT_REQUEST_CANCELLED")} (ก่อน ${cancels}) · ${st(P3.id)}`);
    await s4.page.screenshot({ path: shot("8-race") });
    await s4.page.unroute(versionRoute);
    await s4.vis("ยกเลิก").last().click();
    await s4.page.waitForTimeout(800);
    await s4.ctx.close();

    // ════════════════ 5) แอดมินแก้เป็นงานด่วนระหว่างฟอร์มเปิด → ตัวเช็ค 20 วิวาดทับ ════════════════
    const P4 = await partsChecked();
    const s5 = await openAs("S001", 1280);
    await toQueue(s5);
    await openFromQueue(s5, P4.code, "นัดวันเข้า");
    await setTime(s5.page, "13:00");
    (await lbl(s5.page, ASK_TMR).count()) === 1 ? pass(`ฟอร์ม ${P4.code} เปิดหลังเวลาปิด (มีปุ่มขอพรุ่งนี้)`) : fail("ฟอร์มที่สองไม่มีปุ่มขอพรุ่งนี้");
    await call(A, "POST", `/work-orders/${P4.id}/urgent-release`, { day: tomorrow });
    const toast5 = `แอดมินแก้เป็นงานด่วนแล้ว — นัด ${dShort(tomorrow)} ได้`;
    const t5 = await s5.vis(toast5).first().waitFor({ timeout: 35000 }).then(() => true, () => false);
    await s5.page.waitForTimeout(800);
    t5 &&
    (await s5.vis(green).count()) > 0 &&
    (await fieldText(s5.page, "วันเข้างาน")).includes(dLong(tomorrow)) &&
    (await fieldText(s5.page, "เวลา (ไม่ใส่ก็ได้)")).includes("13:00 น.") &&
    !(await saveOff(s5.page))
      ? pass(`ตัวเช็ค 20 วิ: toast "${toast5}" · บรรทัดเขียว · เลือกพรุ่งนี้ให้เอง · เวลา 13:00 ยังอยู่ · ปุ่มยืนยันกดได้`)
      : fail(`วาดทับหลังแอดมินแก้: toast=${t5} · บรรทัดเขียว=${(await s5.vis(green).count()) > 0} · วัน "${await fieldText(s5.page, "วันเข้างาน")}" · เวลา "${await fieldText(s5.page, "เวลา (ไม่ใส่ก็ได้)")}"`);
    await openCal(s5.page, "วันเข้างาน");
    (await tagsOf(s5.page)).includes(`${dShort(tomorrow)} · แอดมินแก้เป็นงานด่วน`)
      ? pass("ป้ายพรุ่งนี้เขียว \"แอดมินแก้เป็นงานด่วน\"")
      : fail(`ป้ายหลังแอดมินแก้: ${JSON.stringify(await tagsOf(s5.page))}`);
    await closeCal(s5.page);
    await s5.vis("ยืนยัน").last().click();
    await s5.page.waitForTimeout(4000);
    const r5 = rowOf(P4.id);
    !r5.startsWith("PARTS_CHECKED|") && r5.endsWith(`|${tomorrow}`) && urfOf(P4.id) === tomorrow && logCount(P4.id, "ASSIGNED") === 1
      ? pass(`บันทึก → ${P4.code} ${r5} · urgentReleaseFor = ${tomorrow} คงอยู่ · ประวัติ ASSIGNED (ฐานข้อมูล)`)
      : fail(`หลังบันทึก ${P4.code}: ${r5} · ${urfOf(P4.id)} · ASSIGNED ${logCount(P4.id, "ASSIGNED")}`);
    await s5.ctx.close();

    // ════════════════ 6) ฟอร์มระบุอะไหล่ (NEW): ไม่ใช้อะไหล่จ่ายงาน · ส่งตรวจ · แอดมินทำแทน · ใบทดสอบ ════════════════
    const N1 = await fx.workOrder("C0006", null);
    const s6 = await openAs("S001", 1280);
    await toQueue(s6);
    await openFromQueue(s6, N1.code, "ระบุอะไหล่");
    await s6.vis("ไม่ใช้อะไหล่").last().click();
    await s6.page.waitForTimeout(500);
    await openCal(s6.page, "วันเข้างาน");
    const n6a = await cellInfo(s6.page, today);
    const n6tags = await tagsOf(s6.page);
    await closeCal(s6.page);
    await s6.vis("ต้องเข้าตรวจสอบหน้างานก่อน").last().click();
    await s6.page.waitForTimeout(500);
    await openCal(s6.page, "วันเข้าตรวจหน้างาน");
    const n6b = await cellInfo(s6.page, today);
    await closeCal(s6.page);
    n6a && n6a.disabled && n6tags.includes(`${dShort(today)} · งานด่วนเท่านั้น`) && n6b && n6b.disabled
      ? pass("ฟอร์มระบุอะไหล่ (หัวหน้าภาค): \"ไม่ใช้อะไหล่ — จ่ายงาน\" และ \"ส่งตรวจ\" วันนี้กดไม่ได้ + ป้าย \"งานด่วนเท่านั้น\"")
      : fail(`ฟอร์มระบุอะไหล่: จ่ายงาน ${JSON.stringify(n6a)} · ส่งตรวจ ${JSON.stringify(n6b)} · ป้าย ${JSON.stringify(n6tags)}`);
    await s6.vis("ยกเลิก").last().click();
    await s6.page.waitForTimeout(500);
    await s6.ctx.close();

    // แอดมินทำแทน: วันที่ปิดยังกดได้ แต่ต้องติ๊กแก้เป็นงานด่วนก่อนบันทึก
    const a6 = await openAs("A001", 1280);
    await openOrder(a6, N1.code);
    await lbl(a6.page, "ระบุอะไหล่").last().click();
    await a6.page.waitForTimeout(1500);
    await a6.vis("ไม่ใช้อะไหล่").last().click();
    await a6.page.waitForTimeout(500);
    await openCal(a6.page, "วันเข้างาน");
    const a6today = await cellInfo(a6.page, today);
    const a6tags = await tagsOf(a6.page);
    a6today && !a6today.disabled && a6tags.includes(`${dShort(today)} · ต้องติ๊กงานด่วน`)
      ? pass("แอดมินทำแทน: วันนี้กดได้ (ไม่ขีดฆ่า) + ป้าย \"ต้องติ๊กงานด่วน\"")
      : fail(`แอดมิน ช่องวันนี้: ${JSON.stringify(a6today)} · ${JSON.stringify(a6tags)}`);
    await cell(a6.page, today).click();
    await a6.page.waitForTimeout(600);
    const red6 = "วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก";
    const tick6 = lbl(a6.page, URGENT_WITH).last();
    (await a6.vis(red6).count()) > 0 &&
    (await tick6.count()) > 0 &&
    (await tick6.getAttribute("aria-checked")) === "false" &&
    (await a6.vis("ติ๊กแก้เป็นงานด่วนก่อน").count()) > 0 &&
    (await saveOff(a6.page)) &&
    (await lbl(a6.page, ASK_TODAY).count()) === 0
      ? pass(`เลือกวันนี้: แดง "${red6}" + ช่องติ๊ก (ยังไม่ติ๊ก) + "ติ๊กแก้เป็นงานด่วนก่อน" · ปุ่มยืนยันปิด · ไม่มีปุ่มขอของหัวหน้าภาค`)
      : fail(`แอดมินเลือกวันนี้: แดง ${await a6.vis(red6).count()} · ติ๊ก ${await tick6.count()} · ปุ่มปิด ${await saveOff(a6.page)}`);
    await tick6.click();
    await a6.page.waitForTimeout(400);
    (await tick6.getAttribute("aria-checked")) === "true" && !(await saveOff(a6.page))
      ? pass("ติ๊กแล้ว → ปุ่มยืนยันกดได้")
      : fail("ติ๊กแล้วปุ่มยืนยันยังปิด");
    await a6.page.screenshot({ path: shot("9-admin-tick") });
    await a6.vis("ยืนยัน").last().click();
    await a6.page.waitForTimeout(4000);
    const via6 = sql(`select coalesce(meta->>'via','-') from "WorkOrderLog" where "workOrderId"=${N1.id} and action='URGENT_RELEASE' order by id desc limit 1`);
    const r6 = rowOf(N1.id);
    r6.endsWith(`|${today}`) && !r6.startsWith("NEW|") && urfOf(N1.id) === today && logCount(N1.id, "URGENT_RELEASE") === 1 && via6 === "schedule"
      ? pass(`แอดมินบันทึก → ${N1.code} ${r6} · urgentReleaseFor = ${today} · URGENT_RELEASE 1 แถว meta.via = schedule (ฐานข้อมูล)`)
      : fail(`หลังแอดมินบันทึก ${N1.code}: ${r6} · ${urfOf(N1.id)} · URGENT_RELEASE ${logCount(N1.id, "URGENT_RELEASE")} via ${via6}`);

    // ใบทดสอบ: เซิร์ฟเวอร์ยกเว้นทุกทาง แอปต้องไม่โชว์กฎเลย
    const N2 = await fx.workOrder("C0006", null);
    const tc = await call(A, "POST", `/work-orders/${N2.id}/test-copy`);
    const TC = { id: tc.id, code: tc.code };
    if (TC.id) extraOrders.push(TC.id);
    sql(`select "isTest"||'|'||status from "WorkOrder" where id=${TC.id || 0}`) === "true|NEW"
      ? pass(`เตรียมใบทดสอบ ${TC.code} (คัดลอกจาก ${N2.code} · ฐานข้อมูล isTest ขั้น NEW)`)
      : fail(`คัดลอกใบทดสอบ: ${JSON.stringify(tc).slice(0, 200)}`);
    await a6.ctx.close();
    const s6t = await openAs("S001", 1280);
    await openOrder(s6t, TC.code);
    await lbl(s6t.page, "ระบุอะไหล่").last().click();
    await s6t.page.waitForTimeout(1500);
    await s6t.vis("ไม่ใช้อะไหล่").last().click();
    await s6t.page.waitForTimeout(500);
    await openCal(s6t.page, "วันเข้างาน");
    const tcToday = await cellInfo(s6t.page, today);
    const tcTags = await tagsOf(s6t.page);
    const tcRule =
      (await s6t.page.getByText(/^นัดพรุ่งนี้ได้|^เลย \d\d:\d\d น\. แล้ว/).locator("visible=true").count()) +
      (await lbl(s6t.page, ASK_TODAY).count()) +
      (await lbl(s6t.page, ASK_TMR).count()) +
      (await lbl(s6t.page, URGENT_WITH).count());
    tcToday && !tcToday.disabled && tcTags.length === 0 && tcRule === 0
      ? pass("ใบทดสอบ: วันนี้กดได้ · ไม่มีแถวป้าย ไม่มีบรรทัดกฎ ไม่มีปุ่มขอ ไม่มีช่องติ๊ก")
      : fail(`ใบทดสอบ: ช่องวันนี้ ${JSON.stringify(tcToday)} · ป้าย ${JSON.stringify(tcTags)} · สิ่งของกฎ ${tcRule}`);
    await cell(s6t.page, today).click();
    await s6t.page.waitForTimeout(600);
    await s6t.vis("ยืนยัน").last().click();
    await s6t.page.waitForTimeout(4000);
    rowOf(TC.id) === `AWAITING_CONFIRM|${today}` && logCount(TC.id, "URGENT_RELEASE") === 0 && urfOf(TC.id) === "-"
      ? pass(`ใบทดสอบนัดวันนี้ได้ → ${TC.code} AWAITING_CONFIRM วันนี้ · ไม่มี URGENT_RELEASE · urgentReleaseFor ว่าง (ฐานข้อมูล)`)
      : fail(`ใบทดสอบหลังบันทึก: ${rowOf(TC.id)} · URGENT_RELEASE ${logCount(TC.id, "URGENT_RELEASE")} · ${urfOf(TC.id)}`);
    await s6t.ctx.close();

    // ════════════════ 7) ปล่อยงานไม่มีล็อก (เวลาปิดยังเป็นเมื่อสองนาทีก่อน) ════════════════
    const RT = await releaseOrderAt(today);
    const RM = await releaseOrderAt(tomorrow);
    const RR = await releaseOrderAt(d2);
    await call(A, "POST", `/work-orders/${RR.id}/reschedule`, { scheduledAt: d3, reason: "ร้านขอเลื่อน (เทสต์เวลาปิดนัด)" });
    rowOf(RT.id) === `ASSIGNED|${today}` && rowOf(RM.id) === `ASSIGNED|${tomorrow}` && rowOf(RR.id) === `ASSIGNED|${d3}` &&
    [RT, RM].every((o) => urfOf(o.id) === "-")
      ? pass(`เตรียมใบรอปล่อยงานไม่มีงานด่วน: วันนี้ ${RT.code} · พรุ่งนี้ ${RM.code} (หลังเวลาปิด) · เลื่อนวัน ${RR.code} (ฐานข้อมูล urgentReleaseFor ว่าง)`)
      : fail(`เตรียมใบรอปล่อยงาน: ${rowOf(RT.id)} ${urfOf(RT.id)} · ${rowOf(RM.id)} ${urfOf(RM.id)} · ${rowOf(RR.id)}`);
    const s7 = await openAs("S001", 1280);
    for (const [o, tab] of [
      [RT, "วันนี้"],
      [RM, "พรุ่งนี้"],
    ]) {
      await toQueue(s7);
      await openFromQueue(s7, o.code, "รับทราบ ปล่อยงาน");
      const clean =
        (await s7.vis("ปล่อยงานไม่ได้", false).count()) === 0 &&
        (await s7.page.locator('[aria-label^="กล่องเส้นตาย"]').count()) === 0 &&
        (await lbl(s7.page, ASK_TMR).count()) === 0 &&
        (tab !== "วันนี้" || (await lbl(s7.page, "ออกงานวันนี้").count()) > 0);
      const lockedBefore = urfOf(o.id);
      await s7.vis("รับทราบ ปล่อยงานให้ช่าง").last().click();
      const toast7 = `ปล่อยงาน ${o.code} แล้ว — ทีม${teamOf(o.id)} เห็นในแท็บ “${tab}” แล้ว`;
      const t7 = await s7.vis(toast7).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
      await s7.page.waitForTimeout(800);
      clean && t7 && lockedBefore === "-" && st(o.id) === "IN_PROGRESS" && logCount(o.id, "DISPATCHED") === 1
        ? pass(`ปล่อยงาน ${o.code} (นัด${tab} ไม่มีงานด่วน): ไม่มีกล่องแดง/กล่องเส้นตาย${tab === "วันนี้" ? " · มี \"ออกงานวันนี้\"" : ""} · toast "${toast7}" · IN_PROGRESS + DISPATCHED (ฐานข้อมูล)`)
        : fail(`ปล่อยงาน ${o.code}: ฟอร์มสะอาด=${clean} · toast=${t7} · urgentReleaseFor ${lockedBefore} · ${st(o.id)} · DISPATCHED ${logCount(o.id, "DISPATCHED")}`);
    }
    // ใบที่แอดมินเลื่อนวัน: ยังมีตัวเลือกทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่ · toast ไม่บอกหัวข้อ "เลยเวลาปล่อยงาน" ที่ไม่มีแล้ว
    await toQueue(s7);
    await openFromQueue(s7, RR.code, "คอนเฟิร์มวันใหม่");
    (await lbl(s7.page, "ทีมไม่ว่าง ส่งกลับแอดมิน").count()) > 0
      ? pass(`ใบเลื่อนวัน ${RR.code}: มีตัวเลือก "ทีมไม่ว่าง — ส่งกลับแอดมินนัดใหม่"`)
      : fail(`ใบเลื่อนวัน ${RR.code}: ไม่มีตัวเลือกส่งกลับ`);
    await lbl(s7.page, "ทีมไม่ว่าง ส่งกลับแอดมิน").last().click();
    await s7.page.waitForTimeout(400);
    const why7 = "ทีมไม่ว่างวันนั้น (เทสต์เวลาปิดนัด)";
    await lbl(s7.page, "บันทึกเพิ่มเติม").last().fill(why7);
    await s7.vis("ส่งกลับให้แอดมินนัดใหม่").last().click();
    const toastD = `ส่ง ${RR.code} กลับให้แอดมินนัดใหม่แล้ว — ใบออกจากรายการของคุณ`;
    const tD = await s7.vis(toastD).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await s7.page.waitForTimeout(800);
    tD && (await s7.vis("เลยเวลาปล่อยงาน", false).count()) === 0 && st(RR.id) === "AWAITING_CONFIRM" && logCount(RR.id, "NEW_DATE_DECLINED") === 1
      ? pass(`ส่งกลับ → toast "${toastD}" (ไม่มีหัวข้อเลยเวลาปล่อยงาน) · AWAITING_CONFIRM + NEW_DATE_DECLINED (ฐานข้อมูล)`)
      : fail(`ส่งกลับ ${RR.code}: toast=${tD} · ${st(RR.id)} · NEW_DATE_DECLINED ${logCount(RR.id, "NEW_DATE_DECLINED")}`);
    await s7.ctx.close();

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    // คืนเวลาเริ่มใช้กฎก่อน แล้วค่อยลบแถวที่เพิ่มและให้เซิร์ฟเวอร์อ่านสด (readCutoff อ่าน since จากแถวแรก จำไว้ 30 วิ)
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
    for (const id of extraOrders) await call(A, "DELETE", `/work-orders/${id}`).catch((e) => fail(`ลบใบ ${id} ไม่สำเร็จ: ${e}`));
    sql(`delete from "User" where "employeeCode"='${PA}'`);
    await browser.close();
  }
})();
