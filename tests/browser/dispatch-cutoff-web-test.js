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
//   ส่วน 4 (จอแอดมิน · ก้อน 5):
//     · ไม่มีใบล็อก (เวลาปิดรับ 23:59 — เช็คทาง API ก่อน ถ้ามีใบล็อกอื่นค้างในฐานข้อมูลบอกเหตุผลแล้วข้ามข้อเดียวนี้) → กล่องเทา "เลยเวลาปล่อยงาน 0"
//     · S001 ได้เบอร์ทดสอบชั่วคราว (จดเบอร์เดิมเป็นแถว key อื่น คืนตอนจบ · ค้างจากรอบก่อน = คืนแล้ว FAIL) — ข้อ "โทรถาม <ชื่อ> <เบอร์>" เช็คเบอร์จริง
//     · ฟอร์มเลื่อนวันนัดตอนเหลือ 45 นาที (ทำทันทีหลังเตรียมใบ — ดู "คุมเวลา"): ส้ม "ใกล้ปิดรับ (เหลือ …)" ไม่มีช่องติ๊ก
//     · แถบของแอดมินใต้แถวค้นหา (งานของฉันวันนี้ + กล่องงาน): "งานพรุ่งนี้ที่หัวหน้าภาคยังไม่ปล่อย N · ปิดรับ …" (แถวบอกชื่อ + เบอร์หัวหน้าภาค)
//       · "งานพรุ่งนี้ที่ยังไม่คอนเฟิร์มลูกค้า N" — N เทียบกับ dispatch-watch ของเซิร์ฟเวอร์
//     · หัวข้อปัก "เลยเวลาปล่อยงาน": การ์ดบอกทีม/หัวหน้าภาค · นัด · ล็อกตั้งแต่ · สาเหตุ · กล่องม่วง "หัวหน้าภาคขอแก้เป็นงานด่วน" (ใบที่ขอ)
//       · กล่องเทา "ยังไม่ได้บอก — โทรถาม <ชื่อ> <เบอร์>" (ใบที่ไม่ได้ขอ) · ใบไม่มีคนรับ: "ทีม… · ไม่มีคนรับ" สาเหตุกลาง ๆ ไม่มีกล่องถาม
//       (ข้ามข้อใบไม่มีคนรับได้เฉพาะเมื่อฐานข้อมูลมีหัวหน้าภาคดูแล C0001 — สร้างใบไม่ได้/เซิร์ฟเวอร์ไม่บอกว่าไม่มีคนรับ = FAIL)
//     · หัวข้อ "เลยนัด" ของงานของฉันวันนี้ = รหัสชุดเดียวกับหัวข้อ "เลยนัด" ในกล่องงาน · กล่องงานมีกล่อง "เลยเวลาปล่อยงาน" ด้วย
//     · ใบเลยนัดที่มีคำขอตรวจสอบค้างอยู่หัวข้อ "เลยนัด" ไม่ใช่หัวข้อคำขอ และปุ่มตอบกลับอยู่บนการ์ดนั้น (มือถือ 420: แถวของตัวเอง)
//     · "แก้เป็นงานด่วน" จากการ์ด → หน้าต่าง → toast → ฐานข้อมูล urgentReleaseFor + ประวัติ meta.via = direct → หัวหน้าภาคเห็นกล่องเขียว
//     · ฟอร์มคอนเฟิร์มลูกค้า: งานพรุ่งนี้หลังปิดรับ = แดง "ถึง HH:MM น. แล้ว …" + ช่องติ๊ก → บันทึก → ฐานข้อมูลงานด่วน (via confirm)
//       งานวันนี้ = "วันนี้เลยเวลาปิดรับแล้ว (…)" ไม่ใช่ "ถึง HH:MM น. แล้ว" (ตอนเช้าประโยคนั้นไม่จริง)
//     · หน้าใบงานของใบที่ล็อก: ปุ่มหลัก "แก้เป็นงานด่วน" · เลื่อนวันนัดเปิดที่วันแรกที่ยังปล่อยได้ → เลือกพรุ่งนี้ = แดง + ช่องติ๊ก → toast
//       "…แก้เป็นงานด่วนไปพร้อมกันแล้ว หัวหน้าภาคปล่อยได้เลย" → ฐานข้อมูลวันใหม่ + งานด่วน + ประวัติ "ตอนเลื่อนวันนัด · "
//     · มือถือ 420: ปุ่มแก้เป็นงานด่วนแถวของตัวเอง ไม่ล้นจอ
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
//     ก้อน 5 เช็คอีกรอบ (23:10–00:06) แล้วคิด +45 นาทีทันทีหลังเตรียมใบ ไม่ใช่ท้ายก้อน (ท้ายก้อนห่างตัวกันหลายนาที เริ่ม 23:09 ก็ข้ามวันได้)
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
  /**
   * ก้อน 5: เบอร์ของ S001 ตั้งชั่วคราว — ฐานข้อมูลเครื่องทดสอบ S001 ไม่มีเบอร์ (area-map-test ต้องการแบบนั้น) ถ้าไม่ตั้ง
   * ข้อ "โทรถาม <ชื่อ> <เบอร์>" เช็คได้แค่ชื่อ ลบเบอร์ทิ้งทั้งทางก็ยังผ่าน · จดเบอร์เดิมเป็นแถว key อื่นในคำสั่งเดียวกับที่ตั้ง
   * (readCutoff อ่านเฉพาะ key='dispatchCutoff') ถูกฆ่ากลางทาง รอบหน้าคืนให้แล้วโผล่เป็น FAIL · คืนแบบมีเงื่อนไข: ไม่มีแถวจด = ไม่แตะเบอร์
   */
  const PHONE_MARK = "dispatchCutoffWebTestS001Phone";
  const RESTORE_PHONE = `update "User" set phone=nullif((select value from "AppSetting" where key='${PHONE_MARK}' order by id limit 1),'')
      where "employeeCode"='S001' and exists (select 1 from "AppSetting" where key='${PHONE_MARK}');
    delete from "AppSetting" where key='${PHONE_MARK}'`;
  let zOrder = null;
  // ก้อน 5: ใบที่สร้างตรงผ่าน API (ไม่ผ่าน fixture — fixture ย้ายภาคของ S001 ไปภาคของสาขานั้น ใบจะมีคนรับ) — ลบตอนจบ
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
    const leftPhone = sql(`select coalesce(nullif(value,''),'(ว่าง)') from "AppSetting" where key='${PHONE_MARK}' order by id limit 1`);
    if (leftPhone) {
      sql(RESTORE_PHONE);
      fail(`เบอร์ของ S001 ค้างเป็นเบอร์ทดสอบจากรอบก่อน — คืนเป็น ${leftPhone} แล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้ชุดที่ดูเบอร์ S001 (area-map) พัง`);
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

    // ════════════════ ก้อน 5: จอแอดมิน ════════════════
    // เช็คเที่ยงคืนอีกรอบ — ส่วนนี้ตั้งเวลาปิดรับ +45 นาที (ฟอร์มเลื่อนวันนัดตอนส้ม) และ "วันนี้/พรุ่งนี้" ห้ามเปลี่ยนกลางทาง
    // วันของก้อน 4 (today/tomorrow) อาจเก่าแล้วถ้าต้องรอข้ามเที่ยงคืน — คิดใหม่หลังรอ และสร้างใบของก้อนนี้ใหม่ทั้งหมด
    await waitPastMidnight(23 * 60 + 10, "เวลาปิดรับทดสอบ (+45 นาที) จะข้ามวัน และ \"พรุ่งนี้\" เปลี่ยนระหว่างก้อน 5");
    const d0 = visitDay(0);
    const d1 = visitDay(1);
    const d2 = visitDay(2);
    const d5 = visitDay(5);
    const dm1 = visitDay(-1);
    const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const ymdParts = (s) => s.split("-").map(Number);
    /** "ส. 31 ต.ค." · "ส. 31 ต.ค. 69" · "ส. 31 ต.ค. 2569" — แบบเดียวกับ dayShort / dayFull / thaiDateLong ของแอป */
    const dShort = (s) => {
      const [y, m, d] = ymdParts(s);
      return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`;
    };
    const dFull = (s) => `${dShort(s)} ${String((Number(s.slice(0, 4)) + 543) % 100).padStart(2, "0")}`;
    const dLong = (s) => `${dShort(s)} ${Number(s.slice(0, 4)) + 543}`;
    const months = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
    const URGENT_WITH = "แก้เป็นงานด่วนไปพร้อมกัน (หัวหน้าภาคปล่อยได้เลย)";
    const sName = sql(`select name from "User" where "employeeCode"='S001'`);
    // เบอร์ทดสอบของ S001 (ดู PHONE_MARK) — จดเบอร์เดิมกับตั้งเบอร์ใหม่ในทรานแซกชันเดียว ไม่มีช่วงที่เบอร์เปลี่ยนแล้วแต่ยังไม่ได้จด
    const sPhone = `089-${String(suf).padStart(5, "0")}-02`;
    sql(`begin;
      insert into "AppSetting"(key,value) select '${PHONE_MARK}', coalesce(phone,'') from "User" where "employeeCode"='S001';
      update "User" set phone='${sPhone}' where "employeeCode"='S001';
      commit;`);
    sql(`select phone from "User" where "employeeCode"='S001'`) === sPhone
      ? pass(`ตั้งเบอร์ทดสอบของ S001 = ${sPhone} (ฐานข้อมูล · คืนค่าเดิมตอนจบ)`)
      : fail(`ตั้งเบอร์ทดสอบของ S001 ไม่สำเร็จ: ${sql(`select coalesce(phone,'-') from "User" where "employeeCode"='S001'`)}`);
    // ชื่อกับเบอร์ติดกันแบบที่แอดมินเห็น — ขาดเบอร์ = แอดมินต้องไปเปิดหาเบอร์เองอีกที่
    const callWho = `${sName} ${sPhone}`;
    const rowOf = (id) => sql(`select status||'|'||to_char("scheduledAt",'YYYY-MM-DD') from "WorkOrder" where id=${id}`);
    const urfOf = (id) => sql(`select coalesce(to_char("urgentReleaseFor",'YYYY-MM-DD'),'-') from "WorkOrder" where id=${id}`);
    /** ประวัติ URGENT_RELEASE ล่าสุด: note|meta.via|meta.reason */
    const urgentLog = (id) =>
      sql(`select coalesce(note,'')||'|'||coalesce(meta->>'via','-')||'|'||coalesce(meta->>'reason','-') from "WorkOrderLog" where "workOrderId"=${id} and action='URGENT_RELEASE' order by id desc limit 1`);
    /** เปิดใบงานจากหน้ารายการ (ค้นรหัส) — ใบที่ไม่อยู่ในกล่องงานแอดมิน (ยังไม่ล็อก) เปิดจากงานของฉันวันนี้ไม่ได้ */
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
    /** เลือกวันในปฏิทินของช่อง "วันนัดใหม่" — ปฏิทินเปิดที่เดือนของวันที่อยู่ในช่อง เลื่อนเดือนไปหน้า/ถอยหลังเท่าที่ต้อง */
    const pickDay = async (page, from, to) => {
      await lbl(page, "วันนัดใหม่").last().click();
      await page.waitForTimeout(500);
      for (let k = months(from); k > months(to); k--) {
        await lbl(page, "เดือนก่อน").last().click();
        await page.waitForTimeout(200);
      }
      for (let k = months(from); k < months(to); k++) {
        await lbl(page, "เดือนถัดไป").last().click();
        await page.waitForTimeout(200);
      }
      await page.getByLabel(dLong(to), { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(600);
    };

    // ── 4) ไม่มีใบล็อก → กล่องเทา "เลยเวลาปล่อยงาน 0" ──
    // เวลาปิดรับ 23:59 = ใบพรุ่งนี้ยังไม่ล็อก (ใบวันนี้ล็อกเสมอ — เส้นตายคือเมื่อวาน) · ฐานข้อมูลเครื่องทดสอบอาจมีใบล็อกค้างจากที่อื่น
    // เช็คทาง API ก่อน มีก็บอกเหตุผลแล้วข้ามข้อนี้ข้อเดียว (กล่องว่างไม่ควรขึ้นจริง ๆ ในกรณีนั้น)
    await setCut("23:59");
    const inbox0 = await call(A, "GET", "/work-orders?status=INBOX");
    const lockedNow = (inbox0.rows || []).filter(
      (r) => (r.release && r.release.locked && !r.release.past) || (r.releaseDeclined && !r.releaseDeclined.past)
    );
    const a5 = await openAs("A001", 1280);
    await toQueue(a5);
    if (lockedNow.length) {
      console.log(`    ข้ามข้อกล่องว่าง "เลยเวลาปล่อยงาน 0" — ฐานข้อมูลมีใบล็อกอื่นอยู่แล้ว ${lockedNow.length} ใบ (${lockedNow.map((r) => r.code).join(" ")})`);
    } else {
      const empty = lbl(a5.page, "หัวข้อ เลยเวลาปล่อยงาน 0").first();
      const emptyText = (await empty.count()) ? await empty.innerText() : "";
      emptyText.includes("ยังไม่มี — งานที่ยังไม่ได้ปล่อยก่อน 23:59 น. ของวันก่อนเข้างานจะขึ้นที่นี่เอง และนับในตัวเลขกล่องงาน ไม่ต้องรอใครกด") &&
      (await lbl(a5.page, "กลุ่ม เลยเวลาปล่อยงาน").count()) === 0
        ? pass("แอดมิน ไม่มีใบล็อก (API ยืนยัน): กล่องเทา \"เลยเวลาปล่อยงาน 0\" + \"ยังไม่มี — …ขึ้นที่นี่เอง…\" ขึ้นเสมอ")
        : fail(`กล่องว่างเลยเวลาปล่อยงาน: "${emptyText}"`);
      await a5.page.screenshot({ path: shot("15-admin-empty"), fullPage: true });
    }

    // ── 4) เตรียมใบ (เวลาปิดรับยัง 23:59 — สร้างเสร็จแล้วค่อยย้ายเวลาปิดรับไปเมื่อสองนาทีก่อน) ──
    const AL = await releaseOrder(d1); // หัวหน้าภาคขอแอดมิน → แอดมินแก้เป็นงานด่วนจากงานของฉันวันนี้
    const AN = await releaseOrder(d1); // หัวหน้าภาคยังไม่ได้บอก (กล่องเทา + เบอร์) · มือถือ
    const AP = await releaseOrder(d1); // ย้ายวันนัดไปเมื่อวาน → เลยนัด
    const AR = await releaseOrder(d0); // งานวันนี้ (ล็อก) → เลื่อนเป็นพรุ่งนี้พร้อมติ๊กงานด่วน
    const AM = await releaseOrder(d5); // ฟอร์มเลื่อนวันนัดตอนส้ม (ไม่บันทึก)
    const AC = await fx.workOrder("C0006", []); // คอนเฟิร์มลูกค้า งานพรุ่งนี้ + ติ๊กงานด่วน
    await fx.schedule(AC.id, d1);
    const AT = await fx.workOrder("C0006", []); // คอนเฟิร์มลูกค้า งานวันนี้ (ดูข้อความเท่านั้น)
    await fx.schedule(AT.id, d0);
    // เลยนัดที่ขั้นคอนเฟิร์มลูกค้า + คำขอตรวจสอบค้าง → อยู่หัวข้อ "เลยนัด" ไม่ใช่หัวข้อคำขอ · มือถือ: ปุ่มตอบกลับขึ้นแถวของตัวเอง
    const AV = await fx.workOrder("C0006", []);
    await fx.schedule(AV.id, d1);
    // ใบไม่มีคนรับ: C0001 อยู่ภาคที่ไม่มีหัวหน้าภาค (แบบเดียวกับเทสต์ API) — สร้างตรงผ่าน API ไม่ผ่าน fixture (fixture ย้ายภาค S001 ไปที่นั่น)
    const oTeam = sql(`select coalesce(zone,'') from "Branch" where code='C0001'`);
    const ow = await call(A, "POST", "/work-orders", {
      branchCode: "C0001", jobType: "CM", priority: "NORMAL", contactName: "คุณทดสอบ", contactPhone: "081-234-5678",
      machines: [{ code: "W78", model: "Oasis", symptom: "ทดสอบใบไม่มีคนรับ (สร้างโดยเทสต์)" }],
    });
    const AO = { id: ow.orders ? ow.orders[0].id : ow.id, code: "" };
    if (AO.id) {
      extraOrders.push(AO.id);
      AO.code = sql(`select code from "WorkOrder" where id=${AO.id}`);
      await call(A, "POST", `/work-orders/${AO.id}/parts`, { needsParts: false, assign: { team: oTeam, scheduledAt: d1 } });
      await fx.confirm(AO.id);
    }
    const prep5 = [AL, AN, AP].map((o) => rowOf(o.id));
    prep5.every((r) => r === `ASSIGNED|${d1}`) && rowOf(AR.id) === `ASSIGNED|${d0}` && rowOf(AM.id) === `ASSIGNED|${d5}` &&
    rowOf(AC.id) === `AWAITING_CONFIRM|${d1}` && rowOf(AT.id) === `AWAITING_CONFIRM|${d0}` && rowOf(AV.id) === `AWAITING_CONFIRM|${d1}`
      ? pass(`เตรียมใบก้อน 5: รอปล่อยพรุ่งนี้ ${AL.code} ${AN.code} ${AP.code} · วันนี้ ${AR.code} · D+5 ${AM.code} · รอคอนเฟิร์ม ${AC.code} ${AV.code} (พรุ่งนี้) ${AT.code} (วันนี้) (ฐานข้อมูล)`)
      : fail(`เตรียมใบก้อน 5: ${prep5.join(" ")} · ${rowOf(AR.id)} · ${rowOf(AM.id)} · ${rowOf(AC.id)} · ${rowOf(AT.id)} · ${rowOf(AV.id)}`);
    /**
     * ใบไม่มีคนรับ: ข้ามได้ด้วยเหตุผลเดียว — ฐานข้อมูลเครื่องนี้มีหัวหน้าภาคดูแลภาค/ทีมของ C0001 (ใบที่นั่นจึงมีคนรับ)
     * ตัดสินจากเงื่อนไขก่อนเริ่ม ไม่ใช่จากผลที่ได้ — สร้างใบไม่สำเร็จ / ใบไม่ถึงขั้นปล่อยงาน / เซิร์ฟเวอร์ไม่บอกว่าไม่มีคนรับ = FAIL
     * (เดิมข้ามเมื่อผลไม่ออกมาเป็นไม่มีคนรับ ข้อนี้เลยผ่านเงียบ ๆ ได้ทั้งที่แอปพัง) · เช็คหลัง fixture ย้ายภาคของ S001 ไปภาคของ C0006 แล้ว
     */
    const c0001 = `(select region from "Branch" where code='C0001')`;
    const oCover = Number(
      sql(`select count(*) from "User" where role='SUPERVISOR' and "deletedAt" is null and (region=${c0001} or ${c0001}=any("extraRegions") or '${oTeam}'=any("supervisedTeams"))`)
    );
    const orphanSkip = oCover > 0;
    if (orphanSkip) console.log(`    ข้ามข้อใบไม่มีคนรับ — ฐานข้อมูลเครื่องนี้มีหัวหน้าภาคดูแลภาค/ทีมของ C0001 ${oCover} คน ใบที่นั่นจึงมีคนรับ`);
    else
      AO.id && rowOf(AO.id) === `ASSIGNED|${d1}`
        ? pass(`เตรียมใบไม่มีคนรับ ${AO.code} (C0001 ไม่มีหัวหน้าภาคดูแล): รอปล่อยพรุ่งนี้ (ฐานข้อมูล)`)
        : fail(`เตรียมใบไม่มีคนรับที่ C0001: ${AO.id ? rowOf(AO.id) : `สร้างใบไม่สำเร็จ ${JSON.stringify(ow).slice(0, 160)}`}`);
    // ใบมาถึงขั้นปล่อยงานก่อนเส้นตาย (ถอยประวัติไป 90 นาที) — สาเหตุต้องเป็น "ยังไม่ได้ปล่อยก่อน …" ไม่ใช่ "ถึงหลังเวลาปิดรับ"
    // ไม่ถอย = ใบที่เพิ่งสร้างเมื่อวินาทีก่อนมาถึงหลังเส้นตายที่ตั้งเป็นสองนาทีก่อน ข้อความสาเหตุจะขึ้นกับว่าสร้างเร็วแค่ไหน
    sql(`update "WorkOrderLog" set "createdAt"="createdAt"-interval '90 minutes' where "workOrderId" in (${[AL.id, AN.id, AO.id].filter(Boolean).join(",")})`);
    sql(`update "WorkOrder" set "scheduledAt"='${dm1}'::timestamp where id in (${AP.id},${AV.id})`);
    const avNote = "เบอร์ร้านในใบไม่ตรงกับที่ร้านแจ้ง (เทสต์ก้อน 5)";
    await call(fx.supervisor(), "POST", `/work-orders/${AV.id}/admin-review`, { reason: "CONTACT", note: avNote });
    rowOf(AV.id) === `AWAITING_CONFIRM|${dm1}` &&
    sql(`select count(*) from "AdminReview" where "workOrderId"=${AV.id} and "cancelledAt" is null and "repliedAt" is null`) === "1"
      ? pass(`${AV.code}: เลยนัด (วันนัดเมื่อวาน) ขั้นคอนเฟิร์มลูกค้า + คำขอตรวจสอบจากหัวหน้าภาคที่ยังไม่ตอบ (ฐานข้อมูล)`)
      : fail(`เตรียม ${AV.code}: ${rowOf(AV.id)} · คำขอค้าง ${sql(`select count(*) from "AdminReview" where "workOrderId"=${AV.id} and "repliedAt" is null`)}`);

    // ── 4) ฟอร์มเลื่อนวันนัดตอนเหลือ 45 นาที: ส้ม ไม่มีช่องติ๊ก (ไม่บันทึก) ──
    // ทำทันทีหลังเตรียมใบ (ไม่ใช่ท้ายก้อน): ตัวกันเที่ยงคืนของก้อนนี้คือ 23:10 — +45 นาทีต้องคิดก่อน 23:15
    // ไว้ท้ายก้อนหลังขั้นตอนหลายนาทีแล้ว เริ่ม 23:09 ไปถึงตอน 23:16 = เวลาปิดรับ 00:01 เส้นตายของพรุ่งนี้ผ่านไปแล้ว ฟอร์มแดงแทนส้ม
    // ยังคร่อมได้ (เครื่องช้ามากจนเกินห้านาที) บอกเหตุผลแล้วข้ามข้อนี้ — ห้ามรอข้ามเที่ยงคืนตรงนี้: d0/d1 คิดไปแล้ว ใบทั้งชุดจะผิดวัน
    const C6 = bkk(45);
    if (C6 <= bkk(0)) {
      console.log(`    ข้ามข้อฟอร์มเลื่อนวันนัดตอนส้ม — เวลาปิดรับ +45 นาที (${C6}) ข้ามเที่ยงคืนแล้ว (เตรียมใบนานเกินคาด)`);
    } else {
      await setCut(C6);
      const dl6 = Date.parse(`${d0}T${C6}:00.000+07:00`);
      await openOrder(a5, AM.code);
      await lbl(a5.page, "เลื่อนวันนัด").last().click();
      await a5.page.waitForTimeout(1500);
      const fieldM = (await lbl(a5.page, "วันนัดใหม่").count()) ? await lbl(a5.page, "วันนัดใหม่").last().innerText() : "";
      fieldM.includes(dLong(d5))
        ? pass(`ใบที่ไม่ล็อก: ฟอร์มเลื่อนวันนัดเริ่มที่วันเดิม (${dLong(d5)})`)
        : fail(`วันตั้งต้นของใบที่ไม่ล็อก: "${fieldM}"`);
      await pickDay(a5.page, d5, d1);
      const nLeft = Math.floor((dl6 - Date.now()) / 60000);
      const amberRe = new RegExp(`^ใกล้ปิดรับ \\(เหลือ (${nLeft - 1}|${nLeft}|${nLeft + 1}) นาที\\) — บอกหัวหน้าภาคให้ปล่อยงานก่อน ${C6} น\\.$`);
      (await a5.page.getByText(amberRe).locator("visible=true").count()) > 0 && (await lbl(a5.page, URGENT_WITH).count()) === 0
        ? pass(`เลือกพรุ่งนี้ตอนเหลือ ~${nLeft} นาที: ส้ม "ใกล้ปิดรับ (เหลือ … นาที) — บอกหัวหน้าภาคให้ปล่อยงานก่อน ${C6} น." ไม่มีช่องติ๊ก`)
        : fail(`ฟอร์มเลื่อนวันนัดตอนส้ม: คาด ${amberRe}`);
      await a5.page.screenshot({ path: shot("23-reschedule-amber") });
      await a5.vis("ยกเลิก").last().click();
      await a5.page.waitForTimeout(800);
      rowOf(AM.id) === `ASSIGNED|${d5}` && urfOf(AM.id) === "-"
        ? pass(`ยกเลิกฟอร์ม — ${AM.code} วันนัดเดิม ไม่มีงานด่วน (ฐานข้อมูล)`)
        : fail(`${AM.code} หลังยกเลิก: ${rowOf(AM.id)} · ${urfOf(AM.id)}`);

      // ── 4) แถบของแอดมิน (ช่อง 2 ใต้แถวค้นหา): งานพรุ่งนี้ที่หัวหน้าภาคยังไม่ปล่อย · ยังไม่คอนเฟิร์มลูกค้า ──
      // เวลาปิดรับยังอีก ~45 นาที ใบพรุ่งนี้จึงยังไม่ล็อก · จำนวนเทียบกับ dispatch-watch ของเซิร์ฟเวอร์ (ฐานข้อมูลเครื่องทดสอบอาจมีใบอื่นด้วย)
      const watch6 = await call(A, "GET", "/work-orders/dispatch-watch");
      const nU = (watch6.unreleasedTomorrow || []).length;
      const nC = (watch6.unconfirmedTomorrow || []).length;
      const unrelTitle = `งานพรุ่งนี้ที่หัวหน้าภาคยังไม่ปล่อย ${nU} · ปิดรับ ${C6} น.`;
      const unconfTitle = `งานพรุ่งนี้ที่ยังไม่คอนเฟิร์มลูกค้า ${nC}`;
      (watch6.unreleasedTomorrow || []).some((w) => w.id === AN.id) && (watch6.unconfirmedTomorrow || []).some((w) => w.id === AC.id)
        ? pass(`dispatch-watch: ${AN.code} อยู่ในงานพรุ่งนี้ที่ยังไม่ปล่อย (${nU}) · ${AC.code} อยู่ในยังไม่คอนเฟิร์มลูกค้า (${nC})`)
        : fail(`dispatch-watch ของแอดมิน: ${JSON.stringify(watch6).slice(0, 300)}`);
      const bannerCheck = async (where) => {
        const anRow = lbl(a5.page, `${unrelTitle} ${AN.code}`).first();
        const anRowText = (await anRow.count()) ? await anRow.innerText() : "";
        const acRow = lbl(a5.page, `${unconfTitle} ${AC.code}`).first();
        const hintOk = (await a5.vis(`คอนเฟิร์มก่อน ${C6} น. หัวหน้าภาคจะได้ปล่อยงานทัน`).count()) > 0;
        // ภาคเดียวกันอาจมีหัวหน้าภาคหลายคน (คั่นด้วย " / ") — ดูว่ามี S001 พร้อมเบอร์ ไม่บังคับว่าต้องเป็นคนแรก
        anRowText.includes("หัวหน้าภาค ") && anRowText.includes(callWho) && (await acRow.count()) > 0 && hintOk
          ? pass(`${where}: "${unrelTitle}" แถว ${AN.code} บอกหัวหน้าภาค "${callWho}" · "${unconfTitle}" แถว ${AC.code} · "คอนเฟิร์มก่อน ${C6} น. …"`)
          : fail(`${where} แถบของแอดมิน: แถว ${AN.code} "${anRowText.replace(/\n/g, " | ")}" · แถว ${AC.code} ${await acRow.count()} · คำอธิบาย ${hintOk}`);
      };
      await toQueue(a5);
      await bannerCheck("งานของฉันวันนี้");
      await a5.page.screenshot({ path: shot("15b-admin-watch"), fullPage: true });
      await a5.vis("กล่องงานของฉัน").first().click();
      await a5.page.waitForTimeout(3500);
      await bannerCheck("กล่องงาน");
    }

    const C5 = bkk(-2);
    await setCut(C5);
    const askNote5 = "ร้านรอพรุ่งนี้เช้า (เทสต์ก้อน 5)";
    await call(fx.supervisor(), "POST", `/work-orders/${AL.id}/urgent-request`, { note: askNote5 });
    lastLog(AL.id) === `URGENT_REQUESTED|${askNote5}`
      ? pass(`หัวหน้าภาคขอแอดมินแก้เป็นงานด่วน ${AL.code} (ฐานข้อมูล URGENT_REQUESTED)`)
      : fail(`ขอแอดมินแก้เป็นงานด่วน ${AL.code}: ${lastLog(AL.id)}`);
    const inbox5 = await call(A, "GET", "/work-orders?status=INBOX");
    const r5 = (id) => (inbox5.rows || []).find((r) => r.id === id);
    [AL, AN].every((o) => r5(o.id)?.release?.locked) && r5(AP.id)?.overdue && r5(AV.id)?.overdue
      ? pass(`เซิร์ฟเวอร์: ${AL.code} ${AN.code} ล็อก · ${AP.code} ${AV.code} เลยนัด (กล่องงานแอดมิน)`)
      : fail(`กล่องงานแอดมินก่อนเปิดจอ: ${JSON.stringify([AL, AN, AP].map((o) => r5(o.id)?.release ?? null)).slice(0, 300)} · ${AV.code} overdue=${r5(AV.id)?.overdue}`);
    if (!orphanSkip)
      AO.id && r5(AO.id)?.orphan && r5(AO.id)?.release?.locked
        ? pass(`เซิร์ฟเวอร์: ${AO.code} ไม่มีคนรับ + ล็อก (กล่องงานแอดมิน)`)
        : fail(`ใบไม่มีคนรับ ${AO.code || "(ไม่มีใบ)"} ในกล่องงานแอดมิน: ${JSON.stringify(AO.id ? r5(AO.id) ?? "ไม่อยู่ในกล่อง" : null).slice(0, 200)}`);

    // ── 4) งานของฉันวันนี้ของแอดมิน: หัวข้อปัก "เลยเวลาปล่อยงาน" ──
    await toQueue(a5);
    const grpL = lbl(a5.page, "กลุ่ม เลยเวลาปล่อยงาน").first();
    const grpText = (await grpL.count()) ? await grpL.innerText() : "";
    grpText.includes(`ยังไม่ได้ปล่อยงานก่อน ${C5} น. ของวันก่อนเข้างาน (สาเหตุอยู่ในแต่ละแถว)`) && (await lbl(a5.page, "หัวข้อ เลยเวลาปล่อยงาน 0").count()) === 0
      ? pass("หัวข้อปัก \"เลยเวลาปล่อยงาน\" พร้อมคำอธิบาย · ไม่มีกล่องว่าง 0 ซ้อน")
      : fail(`หัวข้อเลยเวลาปล่อยงาน: "${grpText.slice(0, 200)}"`);
    const team5 = teamOf(AL.id);
    const since5 = `นัด ${dFull(d1)} · ทั้งวัน · ล็อกตั้งแต่ ${dShort(d0)} ${C5} น.`;
    const alCard = await queueCard(a5.page, AL.code);
    alCard &&
    alCard.text.includes(`ทีม${team5} · หัวหน้าภาค `) && alCard.text.includes(sName) &&
    alCard.text.includes(since5) &&
    alCard.text.includes(`สาเหตุ: หัวหน้าภาคยังไม่ได้ปล่อยก่อน ${C5} น.`) &&
    alCard.labels.some((l) => l.startsWith("หัวหน้าภาคขอแก้เป็นงานด่วน · ") && l.endsWith(`— “${askNote5}”`)) &&
    alCard.labels.includes(`แก้เป็นงานด่วน ${AL.code}`) && alCard.labels.includes(`เลื่อนวันนัด ${AL.code}`)
      ? pass(`การ์ด ${AL.code}: ทีม/หัวหน้าภาค · "${since5}" · สาเหตุ · กล่องม่วง หัวหน้าภาคขอแก้เป็นงานด่วน “…” · ปุ่มเลื่อนวันนัด/แก้เป็นงานด่วน`)
      : fail(`การ์ด ${AL.code}: ${alCard ? `${alCard.text.replace(/\n/g, " | ").slice(0, 400)} · ${alCard.labels.join(" | ")}` : "ไม่เจอ"}`);
    const anCard = await queueCard(a5.page, AN.code);
    anCard && anCard.labels.some((l) => l.startsWith("หัวหน้าภาคยังไม่ได้บอกว่าจะไปไหม — โทรถาม ") && l.includes(callWho))
      ? pass(`การ์ด ${AN.code}: กล่องเทา "หัวหน้าภาคยังไม่ได้บอกว่าจะไปไหม — โทรถาม ${callWho}" (ชื่อ + เบอร์จากฐานข้อมูล)`)
      : fail(`การ์ด ${AN.code} กล่องถาม (คาดชื่อ + เบอร์ "${callWho}"): ${anCard ? anCard.labels.join(" | ") : "ไม่เจอ"}`);
    if (!orphanSkip && AO.id) {
      const aoCard = await queueCard(a5.page, AO.code);
      aoCard &&
      aoCard.text.includes(`ทีม${oTeam} · ไม่มีคนรับ`) &&
      aoCard.text.includes(`สาเหตุ: ยังไม่ได้ปล่อยก่อน ${C5} น.`) &&
      !aoCard.text.includes("หัวหน้าภาคยังไม่ได้ปล่อย") &&
      !aoCard.labels.some((l) => l.startsWith("หัวหน้าภาค"))
        ? pass(`ใบไม่มีคนรับ ${AO.code}: "ทีม${oTeam} · ไม่มีคนรับ" · สาเหตุกลาง ๆ "ยังไม่ได้ปล่อยก่อน ${C5} น." · ไม่มีกล่องถามหัวหน้าภาค`)
        : fail(`การ์ดใบไม่มีคนรับ ${AO.code}: ${aoCard ? `${aoCard.text.replace(/\n/g, " | ").slice(0, 300)} · ${aoCard.labels.join(" | ")}` : "ไม่เจอ"}`);
    }
    await a5.page.screenshot({ path: shot("16-admin-locked"), fullPage: true });

    // ── 4) "เลยนัด" ในงานของฉันวันนี้ = แถวชุดเดียวกับกล่องงาน ──
    const queuePast = await a5.page.evaluate(() => {
      const g = [...document.querySelectorAll('[aria-label="กลุ่ม เลยนัด"]')].find((n) => n.getClientRects().length);
      return g ? [...g.querySelectorAll('[aria-label^="รายละเอียด "]')].map((n) => n.getAttribute("aria-label").slice("รายละเอียด ".length)).sort() : null;
    });
    const apCard = await queueCard(a5.page, AP.code);
    apCard && apCard.text.includes("สาเหตุ: วันนัดผ่านไปแล้ว ยังไม่ได้ปล่อยงาน") && (queuePast || []).includes(AP.code)
      ? pass(`หัวข้อปัก "เลยนัด": ${AP.code} (ใบรอปล่อยงานที่วันนัดผ่านแล้ว) สาเหตุ "วันนัดผ่านไปแล้ว ยังไม่ได้ปล่อยงาน"`)
      : fail(`เลยนัดในงานของฉัน: ${apCard ? apCard.text.replace(/\n/g, " | ").slice(0, 300) : "ไม่เจอการ์ด"} · ${JSON.stringify(queuePast)}`);
    // หัวข้อปักมาก่อนหัวข้อคำขอตรวจสอบ: ใบเลยนัดที่มีคำขอค้างอยู่หัวข้อ "เลยนัด" ที่เดียว และปุ่มตอบกลับตามไปอยู่บนการ์ดนั้น
    const avCard = await queueCard(a5.page, AV.code);
    const avInReview = await a5.page.evaluate((code) => {
      const g = [...document.querySelectorAll('[aria-label="กลุ่ม หัวหน้าภาคส่งให้ตรวจสอบ"]')].find((n) => n.getClientRects().length);
      return !!g && !!g.querySelector(`[aria-label="รายละเอียด ${code}"]`);
    }, AV.code);
    (queuePast || []).includes(AV.code) && !avInReview && avCard &&
    avCard.labels.includes(`ตรวจแล้ว ตอบกลับ ${AV.code}`) && avCard.labels.includes(`เลื่อนวันนัด ${AV.code}`)
      ? pass(`${AV.code} (เลยนัด + คำขอตรวจสอบค้าง): อยู่หัวข้อ "เลยนัด" ไม่ซ้ำในหัวข้อคำขอ · การ์ดมีปุ่ม "ตรวจแล้ว · ตอบกลับ" กับ "เลื่อนวันนัด"`)
      : fail(`${AV.code} หัวข้อปักก่อนคำขอ: เลยนัด=${(queuePast || []).includes(AV.code)} · ในหัวข้อคำขอ=${avInReview} · ${avCard ? avCard.labels.join(" | ") : "ไม่เจอการ์ด"}`);
    await a5.vis("กล่องงานของฉัน").first().click();
    await a5.page.waitForTimeout(3500);
    const inboxCut = await a5.page.evaluate(() => {
      const labels = [...document.querySelectorAll("[aria-label]")].filter((n) => n.getClientRects().length).map((n) => n.getAttribute("aria-label"));
      return {
        past: labels.map((l) => /^เลยนัด \d+ (\S+-\S+)$/.exec(l)).filter(Boolean).map((m) => m[1]).sort(),
        locked: labels.map((l) => /^เลยเวลาปล่อยงาน \d+ (\S+-\S+)$/.exec(l)).filter(Boolean).map((m) => m[1]),
      };
    });
    JSON.stringify(queuePast) === JSON.stringify(inboxCut.past) && inboxCut.past.length > 0
      ? pass(`"เลยนัด" ของงานของฉันวันนี้กับกล่องงานเป็นรหัสชุดเดียวกัน (${inboxCut.past.length} ใบ)`)
      : fail(`เลยนัด งานของฉัน ${JSON.stringify(queuePast)} · กล่องงาน ${JSON.stringify(inboxCut.past)}`);
    inboxCut.locked.includes(AL.code) && inboxCut.locked.includes(AN.code)
      ? pass(`กล่องงานแอดมิน: หัวข้อ "เลยเวลาปล่อยงาน" มีแถว ${AL.code} ${AN.code}`)
      : fail(`กล่องงาน หัวข้อเลยเวลาปล่อยงาน: ${JSON.stringify(inboxCut.locked)}`);
    await a5.page.screenshot({ path: shot("17-admin-inbox") });

    // ── 4) แก้เป็นงานด่วนจากการ์ดในงานของฉันวันนี้ ──
    await toQueue(a5);
    await lbl(a5.page, `แก้เป็นงานด่วน ${AL.code}`).first().click();
    const urgentModal = await a5.vis(`แก้เป็นงานด่วน · ${AL.code}`).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    urgentModal &&
    (await a5.vis("หัวหน้าภาคกดปล่อยงานใบนี้ได้ทันทีแม้เลยเวลาปิดรับ", false).count()) > 0 &&
    (await lbl(a5.page, "เหตุผล (ไม่บังคับ — ลงประวัติใบงาน)").count()) > 0
      ? pass(`หน้าต่าง "แก้เป็นงานด่วน · ${AL.code}" + คำอธิบาย + ช่องเหตุผล (ไม่บังคับ)`)
      : fail("หน้าต่างแก้เป็นงานด่วนไม่ครบ");
    await a5.page.screenshot({ path: shot("18-urgent-modal") });
    const reason5 = "ร้านปิดเครื่องรอ ต้องเข้าพรุ่งนี้ (เทสต์)";
    await lbl(a5.page, "เหตุผล (ไม่บังคับ — ลงประวัติใบงาน)").last().fill(reason5);
    await lbl(a5.page, "บันทึก แก้เป็นงานด่วน").last().click();
    const toast24 = `แก้ ${AL.code} เป็นงานด่วนแล้ว — หัวหน้าภาคกดปล่อยงานได้ทันที (ลงประวัติใบงานแล้ว)`;
    const t24 = await a5.vis(toast24).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a5.page.waitForTimeout(2500);
    t24 ? pass(`toast: ${toast24}`) : fail(`ไม่เห็น toast หลังแก้เป็นงานด่วน (คาด "${toast24}")`);
    const ul = urgentLog(AL.id).split("|");
    urfOf(AL.id) === d1 && ul[0].startsWith(`ปล่อยหลังเวลาปิดรับได้ · ${reason5} · นัด `) && ul[1] === "direct" && ul[2] === reason5 && st(AL.id) === "ASSIGNED"
      ? pass(`ฐานข้อมูล: ${AL.code} urgentReleaseFor = ${d1} · ประวัติ URGENT_RELEASE meta.via=direct พร้อมเหตุผล · ขั้นไม่เปลี่ยน`)
      : fail(`หลังแก้เป็นงานด่วน: ${urfOf(AL.id)} · ${ul.join(" | ")} · ${st(AL.id)}`);
    (await lbl(a5.page, `รายละเอียด ${AL.code}`).count()) === 0
      ? pass(`${AL.code} ออกจากหัวข้อ "เลยเวลาปล่อยงาน" (งานของฉันโหลดใหม่หลังบันทึก)`)
      : fail(`${AL.code} ยังค้างอยู่ในงานของฉันวันนี้ของแอดมินหลังแก้เป็นงานด่วน`);

    // หัวหน้าภาคเห็นงานด่วน: ป้ายเขียวบนการ์ด + กล่องเขียวในฟอร์มปล่อยงาน (ใคร เมื่อไร นัดวันไหน)
    const s5 = await openAs("S001", 1280);
    await toQueue(s5);
    const alSup = await queueCard(s5.page, AL.code);
    alSup && alSup.labels.includes("แอดมินแก้เป็นงานด่วน · ปล่อยได้เลย")
      ? pass(`หัวหน้าภาค: การ์ด ${AL.code} ป้ายเขียว "แอดมินแก้เป็นงานด่วน · ปล่อยได้เลย"`)
      : fail(`หัวหน้าภาค การ์ด ${AL.code}: ${alSup ? alSup.labels.join(" | ") : "ไม่เจอ"}`);
    await openRelease(s5, AL.code);
    const green = lbl(s5.page, `แอดมินแก้เป็นงานด่วน — ${reason5}`).first();
    const greenText = (await green.count()) ? await green.innerText() : "";
    greenText.includes(`${aName} · `) && greenText.includes(` น. · นัด ${dFull(d1)} · ทั้งวัน`)
      ? pass(`ฟอร์มปล่อยงานของหัวหน้าภาค: กล่องเขียว "แอดมินแก้เป็นงานด่วน — ${reason5}" + "${aName} · … น. · นัด ${dFull(d1)} · ทั้งวัน"`)
      : fail(`กล่องเขียวในฟอร์มปล่อยงาน: "${greenText}"`);
    await s5.page.screenshot({ path: shot("19-sup-urgent-note") });
    await s5.ctx.close();

    // ── 4) ฟอร์มคอนเฟิร์มลูกค้า งานพรุ่งนี้หลังเวลาปิดรับ: แดง + ช่องติ๊ก → งานด่วนไปพร้อมกัน ──
    await toQueue(a5);
    await lbl(a5.page, `รายละเอียด ${AC.code}`).first().click();
    await a5.page.waitForTimeout(3500);
    // ปุ่มขั้นในการ์ดขั้นปัจจุบัน (aria-label = ข้อความปุ่ม) — ชื่อขั้นบนแถบขั้นตอนเป็นข้อความเดียวกันแต่ไม่ใช่ปุ่มนี้
    await lbl(a5.page, "คอนเฟิร์มลูกค้า").last().click();
    await a5.page.waitForTimeout(1500);
    await lbl(a5.page, "ลูกค้าคอนเฟิร์มวันนี้").last().click();
    await a5.page.waitForTimeout(600);
    const w28 = `ถึง ${C5} น. แล้ว — คอนเฟิร์มตอนนี้ ใบจะถึงหัวหน้าภาคแบบล็อก · ต้องไปพรุ่งนี้จริง ติ๊กช่องข้างล่าง`;
    const tickC = lbl(a5.page, URGENT_WITH).last();
    (await a5.vis(w28).count()) > 0 && (await tickC.count()) > 0 && (await tickC.getAttribute("aria-checked")) === "false"
      ? pass(`ฟอร์มคอนเฟิร์มลูกค้า (พรุ่งนี้ หลังปิดรับ): แดง "${w28}" + ช่องติ๊ก ${URGENT_WITH} (ยังไม่ติ๊ก)`)
      : fail("ฟอร์มคอนเฟิร์มลูกค้าไม่มีบรรทัดแดง/ช่องติ๊ก");
    await tickC.click();
    await a5.page.waitForTimeout(300);
    (await tickC.getAttribute("aria-checked")) === "true" ? pass("ติ๊กช่องงานด่วนแล้ว (aria-checked)") : fail("ติ๊กช่องงานด่วนไม่ติด");
    await a5.page.screenshot({ path: shot("20-confirm-red") });
    await a5.vis("ยืนยัน").last().click();
    await a5.page.waitForTimeout(3500);
    const ulC = urgentLog(AC.id).split("|");
    st(AC.id) === "ASSIGNED" && urfOf(AC.id) === d1 && ulC[1] === "confirm" && ulC[0].startsWith("ตอนคอนเฟิร์มลูกค้า · ") && logCount(AC.id, "CONFIRMED") === 1
      ? pass(`คอนเฟิร์ม + ติ๊ก → ${AC.code} ASSIGNED · urgentReleaseFor ${d1} · ประวัติ CONFIRMED + URGENT_RELEASE (via=confirm) (ฐานข้อมูล)`)
      : fail(`หลังคอนเฟิร์ม ${AC.code}: ${st(AC.id)} · ${urfOf(AC.id)} · ${ulC.join(" | ")} · CONFIRMED ${logCount(AC.id, "CONFIRMED")}`);

    // ── 4) ฟอร์มคอนเฟิร์มลูกค้า งานวันนี้: "วันนี้เลยเวลาปิดรับแล้ว (…)" ไม่ใช่ "ถึง HH:MM น. แล้ว" ──
    await toQueue(a5);
    await lbl(a5.page, `รายละเอียด ${AT.code}`).first().click();
    await a5.page.waitForTimeout(3500);
    // ปุ่มขั้นในการ์ดขั้นปัจจุบัน (aria-label = ข้อความปุ่ม) — ชื่อขั้นบนแถบขั้นตอนเป็นข้อความเดียวกันแต่ไม่ใช่ปุ่มนี้
    await lbl(a5.page, "คอนเฟิร์มลูกค้า").last().click();
    await a5.page.waitForTimeout(1500);
    await lbl(a5.page, "ลูกค้าคอนเฟิร์มวันนี้").last().click();
    await a5.page.waitForTimeout(600);
    const w28t = `วันนี้เลยเวลาปิดรับแล้ว (${dShort(dm1)} ${C5} น.) — คอนเฟิร์มตอนนี้ ใบจะถึงหัวหน้าภาคแบบล็อก · ต้องไปวันนี้จริง ติ๊กช่องข้างล่าง`;
    (await a5.vis(w28t).count()) > 0 && (await a5.vis(`ถึง ${C5} น. แล้ว`, false).count()) === 0 && (await lbl(a5.page, URGENT_WITH).count()) > 0
      ? pass(`ฟอร์มคอนเฟิร์มลูกค้า (งานวันนี้): "${w28t}" — ไม่ขึ้น "ถึง ${C5} น. แล้ว"`)
      : fail("ฟอร์มคอนเฟิร์มงานวันนี้ใช้ข้อความผิด");
    await a5.vis("ยกเลิก").last().click();
    await a5.page.waitForTimeout(800);
    st(AT.id) === "AWAITING_CONFIRM" && urfOf(AT.id) === "-"
      ? pass(`ปิดฟอร์มโดยไม่บันทึก — ${AT.code} ยังรอคอนเฟิร์ม ไม่มีงานด่วน (ฐานข้อมูล)`)
      : fail(`${AT.code} หลังปิดฟอร์ม: ${st(AT.id)} · ${urfOf(AT.id)}`);

    // ── 4) หน้าใบงานของใบที่ล็อก (งานวันนี้): ปุ่มหลักแก้เป็นงานด่วน · เลื่อนวันนัดเปิดที่วันแรกที่ปล่อยได้ → พรุ่งนี้ + ติ๊ก ──
    await toQueue(a5);
    await lbl(a5.page, `รายละเอียด ${AR.code}`).first().click();
    await a5.page.waitForTimeout(3500);
    (await lbl(a5.page, "แก้เป็นงานด่วน").count()) > 0 && (await lbl(a5.page, "เลื่อนวันนัด").count()) > 0
      ? pass(`หน้าใบงาน ${AR.code} (แอดมิน · ล็อก): ปุ่มหลัก "แก้เป็นงานด่วน" คู่กับ "เลื่อนวันนัด"`)
      : fail("หน้าใบงานของใบที่ล็อกไม่มีปุ่มแก้เป็นงานด่วน/เลื่อนวันนัด");
    await lbl(a5.page, "เลื่อนวันนัด").last().click();
    await a5.page.waitForTimeout(1500);
    const fieldText = (await lbl(a5.page, "วันนัดใหม่").count()) ? await lbl(a5.page, "วันนัดใหม่").last().innerText() : "";
    fieldText.includes(dLong(d2)) && (await a5.vis(`วันใหม่ปิดรับปล่อยงาน ${dFull(d1)} ${C5} น.`).count()) > 0
      ? pass(`ฟอร์มเลื่อนวันนัดของใบที่ล็อก: เปิดที่วันแรกที่ยังปล่อยได้ (${dLong(d2)}) + บรรทัดเทา "วันใหม่ปิดรับปล่อยงาน ${dFull(d1)} ${C5} น."`)
      : fail(`วันตั้งต้นของฟอร์มเลื่อนวันนัด: "${fieldText}"`);
    await pickDay(a5.page, d2, d1);
    const w31 = `พรุ่งนี้เลยเวลาปิดรับแล้ว (${dShort(d0)} ${C5} น.) — ไม่ติ๊ก ใบจะถึงหัวหน้าภาคแบบล็อก`;
    const tickR = lbl(a5.page, URGENT_WITH).last();
    (await a5.vis(w31).count()) > 0 && (await tickR.count()) > 0
      ? pass(`เลือกพรุ่งนี้: แดง "${w31}" + ช่องติ๊กงานด่วน`)
      : fail("ฟอร์มเลื่อนวันนัด (พรุ่งนี้ หลังปิดรับ) ไม่มีบรรทัดแดง/ช่องติ๊ก");
    await tickR.click();
    await lbl(a5.page, "เหตุผลที่เลื่อนวันนัด").last().fill("ร้านขอพรุ่งนี้แทน (เทสต์)");
    await a5.page.waitForTimeout(300);
    await a5.page.screenshot({ path: shot("21-reschedule-red") });
    await lbl(a5.page, "บันทึกวันนัดใหม่").last().click();
    const toast37 = `เลื่อนวันนัด ${AR.code} เป็น ${dFull(d1)} แล้ว — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่ · แก้เป็นงานด่วนไปพร้อมกันแล้ว หัวหน้าภาคปล่อยได้เลย`;
    const t37 = await a5.vis(toast37).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a5.page.waitForTimeout(1500);
    t37 ? pass(`toast: ${toast37}`) : fail(`ไม่เห็น toast หลังเลื่อนวันนัด (คาด "${toast37}")`);
    (await a5.vis(`${AR.code} เลื่อนวันนัดแล้ว`, false).count()) === 0
      ? pass("ไม่มีกล่อง \"เลื่อนวันนัดแล้ว\" แบบเดิมซ้อน")
      : fail("ขึ้นทั้ง toast และกล่องเลื่อนวันนัดแล้ว");
    const ulR = urgentLog(AR.id).split("|");
    rowOf(AR.id) === `ASSIGNED|${d1}` && urfOf(AR.id) === d1 && ulR[0].startsWith("ตอนเลื่อนวันนัด · ") && ulR[1] === "reschedule"
      ? pass(`ฐานข้อมูล: ${AR.code} วันนัด ${d1} · urgentReleaseFor ${d1} · ประวัติ URGENT_RELEASE "ตอนเลื่อนวันนัด · …" (via=reschedule)`)
      : fail(`หลังเลื่อนวันนัด ${AR.code}: ${rowOf(AR.id)} · ${urfOf(AR.id)} · ${ulR.join(" | ")}`);

    // ── 4) หน้าต่างแก้เป็นงานด่วนจากหน้าใบงาน: กล่อง "ยังไม่ได้บอก — โทรถาม <ชื่อ> <เบอร์>" แบบเดียวกับการ์ด · ยกเลิกไม่บันทึก ──
    await toQueue(a5);
    await lbl(a5.page, `รายละเอียด ${AN.code}`).first().click();
    await a5.page.waitForTimeout(3500);
    await lbl(a5.page, "แก้เป็นงานด่วน").last().click();
    const anModal = await a5.vis(`แก้เป็นงานด่วน · ${AN.code}`).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    anModal && (await a5.vis(`หัวหน้าภาคยังไม่ได้บอกว่าจะไปไหม — โทรถาม ${callWho}`, false).count()) > 0
      ? pass(`หน้าใบงาน ${AN.code}: หน้าต่างแก้เป็นงานด่วนบอก "ยังไม่ได้บอก — โทรถาม ${callWho}" (เบอร์จาก GET ใบงานของแอดมิน)`)
      : fail(`หน้าต่างแก้เป็นงานด่วนจากหน้าใบงาน ${AN.code}: เปิด=${anModal} · ไม่เห็นกล่องโทรถาม ${callWho}`);
    await a5.vis("ยกเลิก").last().click();
    await a5.page.waitForTimeout(800);
    urfOf(AN.id) === "-" && logCount(AN.id, "URGENT_RELEASE") === 0
      ? pass(`ยกเลิกหน้าต่าง — ${AN.code} ไม่มีงานด่วน ไม่มีประวัติ (ฐานข้อมูล)`)
      : fail(`${AN.code} หลังยกเลิกหน้าต่าง: ${urfOf(AN.id)} · URGENT_RELEASE ${logCount(AN.id, "URGENT_RELEASE")}`);

    // ── 4) มือถือ 420: การ์ดในหัวข้อเลยเวลาปล่อยงาน ปุ่มแก้เป็นงานด่วนขึ้นแถวของตัวเองเต็มกว้าง ไม่ล้นจอ ──
    const ap = await openAs("A001", 420, 900);
    await toQueue(ap);
    const lay5 = await ap.page.evaluate((code) => {
      const vis1 = (sel) => [...document.querySelectorAll(sel)].find((n) => n.getClientRects().length);
      const b = vis1(`[aria-label="แก้เป็นงานด่วน ${code}"]`);
      const d = vis1(`[aria-label="รายละเอียด ${code}"]`);
      const r = b ? b.getBoundingClientRect() : null;
      return {
        btn: r ? { top: r.top, right: r.right, width: r.width } : null,
        detailTop: d ? d.getBoundingClientRect().top : null,
        scroll: document.scrollingElement.scrollWidth,
      };
    }, AN.code);
    lay5.btn && lay5.detailTop !== null && lay5.btn.top > lay5.detailTop && lay5.btn.width >= 250 && lay5.btn.right <= 420 && lay5.scroll <= 420
      ? pass(`มือถือ 420: ปุ่ม "แก้เป็นงานด่วน ${AN.code}" อยู่แถวใต้ปุ่มรายละเอียด กว้างเต็มการ์ด ไม่ล้นจอ`)
      : fail(`มือถือ 420 การ์ดแอดมิน: ${JSON.stringify(lay5)}`);
    // ใบเลยนัดขั้นอื่นที่มีคำขอตรวจสอบค้าง (ปุ่มแอดมินชุดเดิม + ตอบกลับ): ปุ่มตอบกลับลงแถวของตัวเองเต็มกว้าง ตัวหนังสือบรรทัดเดียว
    // สี่ปุ่มในแถวเดียวบีบปุ่มตอบกลับเหลือแค่ขอบ ตัวหนังสือตกบรรทัดทีละตัวล้นออกนอกปุ่ม — ความสูงของตัวหนังสือจับได้แม้แถวไม่ล้นจอ
    const layV = await ap.page.evaluate((code) => {
      const vis1 = (sel) => [...document.querySelectorAll(sel)].find((n) => n.getClientRects().length);
      const b = vis1(`[aria-label="ตรวจแล้ว ตอบกลับ ${code}"]`);
      const d = vis1(`[aria-label="รายละเอียด ${code}"]`);
      const r = b ? b.getBoundingClientRect() : null;
      const t = b ? [...b.querySelectorAll("div")].find((n) => n.textContent.trim() === "ตรวจแล้ว · ตอบกลับ") : null;
      return {
        btn: r ? { top: r.top, right: r.right, width: r.width } : null,
        detailTop: d ? d.getBoundingClientRect().top : null,
        textH: t ? t.getBoundingClientRect().height : null,
        scroll: document.scrollingElement.scrollWidth,
      };
    }, AV.code);
    layV.btn && layV.detailTop !== null && layV.btn.top > layV.detailTop && layV.btn.width >= 250 && layV.btn.right <= 420 &&
    layV.textH !== null && layV.textH <= 30 && layV.scroll <= 420
      ? pass(`มือถือ 420: ${AV.code} (เลยนัด + คำขอค้าง) ปุ่ม "ตรวจแล้ว · ตอบกลับ" แถวของตัวเองเต็มกว้าง ตัวหนังสือบรรทัดเดียว ไม่ล้นจอ`)
      : fail(`มือถือ 420 ปุ่มตอบกลับบนการ์ดเลยนัด ${AV.code}: ${JSON.stringify(layV)}`);
    await ap.page.screenshot({ path: shot("22-admin-phone"), fullPage: true });
    await ap.ctx.close();

    await a5.ctx.close();

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
    // เบอร์ S001 ที่ก้อน 5 ตั้งชั่วคราว — คืนจากแถวจดและลบแถวจด (คืนไม่สำเร็จ แถวจดยังอยู่ให้รอบหน้าคืน)
    try {
      sql(RESTORE_PHONE);
    } catch (e) {
      fail(`คืนเบอร์ของ S001 ไม่สำเร็จ: ${e}`);
    }
    if (MAXSET !== null) {
      sql(`delete from "AppSetting" where key='dispatchCutoff' and id > ${MAXSET}; delete from "AppSetting" where key='${MARK}'`);
      await refresh().catch(() => {});
    }
    await fx.cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
    for (const id of extraOrders) await call(A, "DELETE", `/work-orders/${id}`).catch((e) => fail(`ลบใบ ${id} ไม่สำเร็จ: ${e}`));
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
