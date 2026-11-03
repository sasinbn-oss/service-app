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
//   ส่วน 9 แอดมิน "ขอนัดด่วน": หัวข้อปักในงานของฉันวันนี้ (คำอธิบาย · แถวใครขอ+เบอร์+เวลา · วันที่ขอ · ข้อความ · ปุ่ม) · กล่องงาน
//     "ขอนัดด่วน n" (n ตามเซิร์ฟเวอร์) ไม่มีหัวข้อรุ่นเดิม · การ์ดเรียงวันที่ขอ (วันนี้ก่อน) แล้วเวลาที่ขอ ไม่ใช่ลำดับของรายการ
//     · แก้เป็นงานด่วนจากการ์ด → toast + ฐานข้อมูล via direct + การ์ดออก
//     · แข่งกัน: แอดมินอีกคนแก้ก่อน → 409 URGENT_ASK_STATE ขึ้นในหน้าต่าง ปุ่มปิด ไม่ปิดเอง → ยกเลิกแล้วโหลดใหม่ การ์ดออก
//     · การ์ดเก่า: แอดมินอีกคนตอบคำขอไปก่อน → กดแก้เป็นงานด่วน → 409 URGENT_ASK_STATE ในหน้าต่าง ไม่แก้ทับคำตอบ (fromAsk)
//     · เบอร์ของ S001 ตั้งชั่วคราว (ฐานทดสอบไม่มีเบอร์) ให้แถว "หัวหน้าภาค <ชื่อ> <เบอร์>" เช็คเบอร์ได้จริง คืนค่าเดิมตอนจบ
//     · หน้าใบงาน: กล่องม่วง "หัวหน้าภาค … ขอนัดด่วน …" + ปุ่ม
//   ส่วน 10 ตอบคำขอ: ยังไม่พิมพ์ส่งไม่ได้ · ส่ง → toast + URGENT_REQUEST_ANSWERED · แข่งกับหัวหน้าภาคยกเลิก → ข้อความในหน้าต่าง
//     · หัวหน้าภาคเห็นคำตอบในฟอร์มนัดวัน
//   ส่วน 11 คอนเฟิร์มลูกค้า: "ลูกค้าคอนเฟิร์มวันเดิม" (ไม่มีคำเดิม "วันนี้") ใบพรุ่งนี้หลังเวลาปิดไม่มีบรรทัด/ช่องติ๊ก → ASSIGNED ไม่มีงานด่วน
//     · "ลูกค้าขอเลื่อน" ไปวันที่เปิด = บรรทัดเทา · ไปพรุ่งนี้ = แดง + ช่องติ๊ก ปุ่มปิดจนติ๊ก → ฐานข้อมูลงานด่วน via confirm
//     · ใบทดสอบขอเลื่อนไปพรุ่งนี้: ไม่มีป้าย/บรรทัด/ช่องติ๊ก บันทึกได้เลย (ฐานข้อมูลไม่มีงานด่วน)
//     · กดตอนเวลาเพิ่งผ่าน: เปิดตอนพรุ่งนี้ยังเปิด → เวลาปิดย้าย (SQL) → กด → ฟอร์มไม่ปิด แดง + ช่องติ๊กขึ้นเอง ข้อความไม่ซ้ำ ฐานข้อมูลไม่เปลี่ยน
//   ส่วน 12 เลื่อนวันนัดไปวันนี้ · ดึงงานคืนไปพรุ่งนี้: แดง + ติ๊ก → toast "… — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่ · แก้เป็นงานด่วนไปพร้อมกันแล้ว"
//     · ฟอร์มเปิดที่วันเดิม · กดตอนเวลาเพิ่งผ่าน: ฟอร์มไม่ปิด เหตุผลอยู่ แดง + ช่องติ๊กขึ้นเอง ข้อความไม่ซ้ำ ฐานข้อมูลไม่เปลี่ยน → ติ๊กแล้วบันทึกได้
//   ส่วน 13 บอร์ดแผนงาน: ไม่มี "ปิดรับ …"/"เลยเวลาปล่อยงาน" · จุดที่แอดมินแก้เป็นงานด่วนมีป้ายเขียว "แอดมินแก้เป็นงานด่วน"
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
  /**
   * ส่วน 9: เบอร์ของ S001 ตั้งชั่วคราว — ฐานข้อมูลเครื่องทดสอบ S001 ไม่มีเบอร์ (area-map-test ต้องการแบบนั้น) ถ้าไม่ตั้ง
   * แถว "หัวหน้าภาค <ชื่อ> <เบอร์> · ขอเมื่อ …" บนการ์ด "ขอนัดด่วน" เช็คได้แค่ชื่อ ลบเบอร์ทิ้งทั้งทาง (askRowLines) ก็ยังผ่าน
   * ทั้งที่เบอร์คือเหตุผลที่การ์ดมีบรรทัดนี้ (แอดมินโทรถามจากการ์ด) · จดเบอร์เดิมเป็นแถว key อื่นในคำสั่งเดียวกับที่ตั้ง
   * (readCutoff อ่านเฉพาะ key='dispatchCutoff') ถูกฆ่ากลางทาง รอบหน้าคืนให้แล้วโผล่เป็น FAIL · คืนแบบมีเงื่อนไข: ไม่มีแถวจด = ไม่แตะเบอร์
   */
  const PHONE_MARK = "dispatchCutoffWebTestS001Phone";
  const RESTORE_PHONE = `update "User" set phone=nullif((select value from "AppSetting" where key='${PHONE_MARK}' order by id limit 1),'')
      where "employeeCode"='S001' and exists (select 1 from "AppSetting" where key='${PHONE_MARK}');
    delete from "AppSetting" where key='${PHONE_MARK}'`;
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
    const leftPhone = sql(`select coalesce(nullif(value,''),'(ว่าง)') from "AppSetting" where key='${PHONE_MARK}' order by id limit 1`);
    if (leftPhone) {
      sql(RESTORE_PHONE);
      fail(`เบอร์ของ S001 ค้างเป็นเบอร์ทดสอบจากรอบก่อน — คืนเป็น ${leftPhone} แล้ว รอบหน้าจะผ่าน แต่ระหว่างนี้ชุดที่ดูเบอร์ S001 (area-map) พัง`);
    }
    MAXSET =Number(sql(`select coalesce(max(id),0) from "AppSetting"`));
    sql(`insert into "AppSetting"(key,value) values ('${MARK}','${MAXSET}')`);

    const aId = sql(`select id from "User" where "employeeCode"='A001'`);
    const aName = sql(`select name from "User" where "employeeCode"='A001'`);
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('${PA}','แอดมินอะไหล่ทดสอบเวลาปิดนัด','PARTS_ADMIN','${hash}',false)`);

    const openAs = async (code, width, height = 1000) => {
      // เบราว์เซอร์ทดสอบอยู่เขตเวลา UTC แต่ผู้ใช้จริงอยู่ไทย: บอร์ดแผนงานเปิดที่ "วันนี้" ตามนาฬิกาเครื่อง
      // ตั้งเขตเวลาให้ตรงกับ visitDay() (เวลาไทย) ไม่งั้นช่วง 00:00–07:00 ของไทยบอร์ดเปิดที่เมื่อวาน หาจุดของวันนี้ไม่เจอ
      const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: "Asia/Bangkok" });
      const page = await ctx.newPage();
      // ผู้ใช้ที่เทสต์นี้สร้างเองยังไม่เคยตอบกล่องสอนการใช้งาน — ปิดกล่องที่ขึ้นเอง ไม่งั้นพื้นมืดบังทุกปุ่ม (tests/README)
      await page.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
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
    /** "อ. 3 พ.ย. 2569" → "2026-11-03" (ชื่อช่องวันของปฏิทิน) */
    const isoOfLong = (l) => {
      const [, d, m, y] = l.split(" ");
      return `${Number(y) - 543}-${String(MON.indexOf(m) + 1).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
    };
    /**
     * เลือกวันในปฏิทิน — ปฏิทินเปิดที่เดือนของค่าที่เลือกไว้ (หรือเดือนนี้) วันที่ต้องการอาจอยู่เดือนถัดไป (พรุ่งนี้ของวันสิ้นเดือน)
     * หรือเดือนก่อน (ฟอร์มเลื่อนวันเปิดที่วันเดิมซึ่งอาจเป็นเดือนหน้า แล้วเลือกวันนี้) — ช่องแรกที่เห็นบอกว่าต้องเลื่อนทางไหน
     */
    const pickDay = async (page, field, day) => {
      await openCal(page, field);
      for (let i = 0; i < 2 && (await cell(page, day).count()) === 0; i++) {
        const first = await page.evaluate(() =>
          [...document.querySelectorAll("[aria-label]")]
            .filter((n) => n.getClientRects().length)
            .map((n) => n.getAttribute("aria-label"))
            .find((l) => /^(อา|จ|อ|พ|พฤ|ศ|ส)\. \d{1,2} \S+ \d{4}$/.test(l))
        );
        await lbl(page, !first || day > isoOfLong(first) ? "เดือนถัดไป" : "เดือนก่อน").last().click();
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

    // ════════════════ 9) แอดมิน: หัวข้อ "ขอนัดด่วน" · แก้เป็นงานด่วน · แข่งกับแอดมินอีกคน · กล่องในหน้าใบงาน ════════════════
    // เวลาปิดเมื่อสองนาทีก่อน — พรุ่งนี้ปิดแล้ว (ขอได้) · วันนี้ปิดเสมอ
    const C9 = cutIn(-2);
    await setCut(C9);
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
    /** "HH:MM" เวลาไทยของคำขอล่าสุดของใบ (ประวัติเก็บ UTC) */
    const askAt = (id, action = "URGENT_REQUESTED") =>
      sql(`select to_char(("createdAt" at time zone 'UTC') at time zone 'Asia/Bangkok','HH24:MI') from "WorkOrderLog" where "workOrderId"=${id} and action='${action}' order by id desc limit 1`);
    const viaOf = (id) => sql(`select coalesce(meta->>'via','-')||'|'||coalesce(meta->>'reason','-') from "WorkOrderLog" where "workOrderId"=${id} and action='URGENT_RELEASE' order by id desc limit 1`);
    const dFull = (s) => `${dShort(s)} ${String((Number(s.slice(0, 4)) + 543) % 100).padStart(2, "0")}`;
    const note9 = "ร้านเปิดพรุ่งนี้เช้า (เทสต์เวลาปิดนัด)";
    const P9 = await partsChecked();
    const P10 = await partsChecked();
    const P11 = await partsChecked();
    const P12 = await partsChecked();
    const P13 = await partsChecked();
    await call(S(), "POST", `/work-orders/${P9.id}/urgent-request`, { day: tomorrow, note: note9 });
    await call(S(), "POST", `/work-orders/${P10.id}/urgent-request`, { day: today });
    await call(S(), "POST", `/work-orders/${P11.id}/urgent-request`, { day: tomorrow });
    await call(S(), "POST", `/work-orders/${P12.id}/urgent-request`, { day: today });
    await call(S(), "POST", `/work-orders/${P13.id}/urgent-request`, { day: today });
    [P9, P10, P11, P12, P13].every((o) => lastAction(o.id) === "URGENT_REQUESTED") &&
    askDayOf(P9.id) === tomorrow && askDayOf(P10.id) === today && askDayOf(P13.id) === today
      ? pass(`เตรียมคำขอนัดด่วน 5 ใบ (หัวหน้าภาคขอทาง API · ${P9.code}/${P11.code} พรุ่งนี้ · ${P10.code}/${P12.code}/${P13.code} วันนี้ — ฐานข้อมูล URGENT_REQUESTED)`)
      : fail(`เตรียมคำขอนัดด่วน: ${[P9, P10, P11, P12, P13].map((o) => `${o.code} ${lastAction(o.id)} ${askDayOf(o.id)}`).join(" · ")}`);
    /** n ของหัวข้อ "ขอนัดด่วน" ตามกติกาเดียวกับแอป — นับจากกล่องงานแอดมินที่เซิร์ฟเวอร์ส่ง (ฐานข้อมูลเครื่องทดสอบอาจมีคำขออื่น) */
    const askCount = async () => {
      const inbox = await call(A, "GET", "/work-orders?status=INBOX");
      return (inbox.rows || []).filter((r) => r.urgentAsk && r.urgentAsk.day >= today && ["NEW", "PARTS_CHECKED"].includes(r.status) && !r.isTest).length;
    };
    const askHint =
      `หัวหน้าภาคขอนัดวันที่ปิดนัดแล้ว (วันนี้ / พรุ่งนี้หลัง ${C9} น.) — ร้านต้องการวันนั้นจริง: “แก้เป็นงานด่วน” (เฉพาะใบนี้ วันนั้น) · ไม่ได้: “ตอบกลับ” ให้หัวหน้าภาคนัดวันอื่น`;
    const a9 = await openAs("A001", 1280);
    await toQueue(a9);
    const n9 = await askCount();
    const groupText = (await lbl(a9.page, "กลุ่ม ขอนัดด่วน").count()) ? await lbl(a9.page, "กลุ่ม ขอนัดด่วน").first().innerText() : "";
    groupText.includes(askHint) && [P9, P10, P11, P12, P13].every((o) => groupText.includes(o.code))
      ? pass(`งานของฉันวันนี้ (แอดมิน): หัวข้อปัก "ขอนัดด่วน" มีทั้ง 5 ใบ + คำอธิบายตามตัวอย่าง`)
      : fail(`หัวข้อขอนัดด่วน: "${groupText.slice(0, 300)}"`);
    /**
     * ลำดับการ์ดในหัวข้อ = วันที่ขอ (วันนี้ก่อน) แล้วเวลาที่ขอ — แบบเดียวกับแถบ "ขอนัดด่วน n" ในกล่องงาน
     * ใบสร้างเรียง P9→P13 (ลำดับที่รายการส่งมา = ด่วน → เปิดก่อน) แต่ P9/P11 ขอพรุ่งนี้ จึงต้องไปอยู่หลังใบที่ขอวันนี้ —
     * ถ้าหน้านี้ใช้ลำดับของรายการ ข้อนี้ล้ม
     */
    const order9 = await a9.page.evaluate((codes) => {
      const g = [...document.querySelectorAll('[aria-label="กลุ่ม ขอนัดด่วน"]')].find((n) => n.getClientRects().length);
      if (!g) return [];
      return [...g.querySelectorAll('[aria-label^="รายละเอียด "]')]
        .map((n) => n.getAttribute("aria-label").slice("รายละเอียด ".length))
        .filter((c, i, all) => codes.includes(c) && all.indexOf(c) === i);
    }, [P9, P10, P11, P12, P13].map((o) => o.code));
    const want9 = [P10, P12, P13, P9, P11].map((o) => o.code);
    order9.join(",") === want9.join(",")
      ? pass(`หัวข้อ "ขอนัดด่วน" เรียงวันที่ขอ (วันนี้ก่อน) แล้วเวลาที่ขอ: ${want9.join(" → ")} (ไม่ใช่ลำดับที่รายการส่งมา)`)
      : fail(`ลำดับการ์ดขอนัดด่วน: ${order9.join(" → ")} · คาด ${want9.join(" → ")}`);
    const who9 = `หัวหน้าภาค ${sName}${sPhone ? ` ${sPhone}` : ""} · ขอเมื่อ ${dShort(today)} ${askAt(P9.id)} น.`;
    const appt9 = `ขอนัด ${dFull(tomorrow)} (พรุ่งนี้)`;
    const c9 = await queueCard(a9.page, P9.code);
    c9 && c9.labels.includes(who9) && c9.labels.includes(appt9) && c9.text.includes(`“${note9}”`) &&
    c9.labels.includes(`ตอบกลับคำขอนัดด่วน ${P9.code}`) && c9.labels.includes(`แก้เป็นงานด่วน ${P9.code}`)
      ? pass(`การ์ด ${P9.code}: "${who9}" · "${appt9}" · ข้อความของหัวหน้าภาค · ปุ่ม ตอบกลับ + แก้เป็นงานด่วน`)
      : fail(`การ์ด ${P9.code}: ${c9 ? c9.labels.join(" | ") : "ไม่เจอการ์ด"}`);
    const c10 = await queueCard(a9.page, P10.code);
    c10 && c10.labels.includes(`ขอนัด ${dFull(today)} (วันนี้)`) && !c10.text.includes("“")
      ? pass(`การ์ด ${P10.code}: "ขอนัด ${dFull(today)} (วันนี้)" ไม่มีบรรทัดข้อความ (หัวหน้าภาคไม่ได้พิมพ์)`)
      : fail(`การ์ด ${P10.code}: ${c10 ? c10.labels.join(" | ") : "ไม่เจอการ์ด"}`);
    await a9.page.screenshot({ path: shot("10-admin-asks"), fullPage: true });

    // กล่องงาน: หัวข้อ "ขอนัดด่วน n" ตัวสร้างเดียวกัน มีแถวของ P9
    await a9.vis("กล่องงานของฉัน").first().click();
    await a9.page.waitForTimeout(3500);
    (await lbl(a9.page, `หัวข้อ ขอนัดด่วน ${n9}`).count()) > 0 && (await lbl(a9.page, `ขอนัดด่วน ${n9} ${P9.code}`).count()) > 0
      ? pass(`กล่องงาน (แอดมิน): หัวข้อ "ขอนัดด่วน ${n9}" มีแถว ${P9.code} — นับตรงกับกล่องงานของเซิร์ฟเวอร์`)
      : fail(`กล่องงาน หัวข้อขอนัดด่วน: ${await a9.page.locator('[aria-label^="หัวข้อ "]').allInnerTexts()} · คาด ${n9}`);
    (await a9.page.locator('[aria-label^="หัวข้อ เลยเวลาปล่อยงาน"], [aria-label^="หัวข้อ งานพรุ่งนี้ที่"]').count()) === 0
      ? pass("กล่องงาน (แอดมิน): ไม่มีหัวข้อ \"เลยเวลาปล่อยงาน\" / \"งานพรุ่งนี้ที่ยังไม่ปล่อย/คอนเฟิร์ม\" แล้ว")
      : fail("กล่องงานแอดมินยังมีหัวข้อเวลาปิดรับรุ่นเดิม");

    // แก้เป็นงานด่วนจากการ์ด
    await toQueue(a9);
    await lbl(a9.page, `แก้เป็นงานด่วน ${P9.code}`).first().click();
    await a9.page.waitForTimeout(800);
    const win9 = [
      `แก้เป็นงานด่วน · ${P9.code}`,
      `หัวหน้าภาคขอนัดด่วน · ${askAt(P9.id)} น. — “${note9}”`,
      `หัวหน้าภาคนัด ${dShort(tomorrow)} ได้ทันที — เฉพาะใบนี้ วันนั้น · การ์ดขึ้นป้าย “แอดมินแก้เป็นงานด่วน” · ไม่เปลี่ยนความเร่งด่วน (ด่วน/ปกติ) ของใบ · นัดวันอื่นแล้วต้องแก้ใหม่`,
    ];
    const winText = await a9.page.evaluate(() => document.body.innerText);
    win9.every((t) => winText.replace(/\s+/g, " ").includes(t)) && winText.includes(`ขอนัด ${dFull(tomorrow)}`)
      ? pass(`หน้าต่างแก้เป็นงานด่วน: หัว · "ขอนัด ${dFull(tomorrow)}" · กล่องคำขอ · คำอธิบายตามตัวอย่าง`)
      : fail(`หน้าต่างแก้เป็นงานด่วน: ${win9.filter((t) => !winText.replace(/\s+/g, " ").includes(t)).join(" | ")}`);
    await lbl(a9.page, "เหตุผล (ไม่บังคับ — ลงประวัติใบงาน)").last().fill("ร้านต้องเปิดพรุ่งนี้ (เทสต์)");
    await lbl(a9.page, "บันทึก แก้เป็นงานด่วน").last().click();
    const toast9 = `แก้ ${P9.code} เป็นงานด่วนแล้ว — หัวหน้าภาคนัด ${dShort(tomorrow)} ได้ทันที (ลงประวัติใบงานแล้ว)`;
    const t9 = await a9.vis(toast9).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a9.page.waitForTimeout(2000);
    t9 && urfOf(P9.id) === tomorrow && logCount(P9.id, "URGENT_RELEASE") === 1 && viaOf(P9.id) === "direct|ร้านต้องเปิดพรุ่งนี้ (เทสต์)" &&
    st(P9.id) === "PARTS_CHECKED" && (await lbl(a9.page, `รายละเอียด ${P9.code}`).count()) === 0
      ? pass(`แก้เป็นงานด่วน → toast "${toast9}" · ฐานข้อมูล urgentReleaseFor = ${tomorrow} · URGENT_RELEASE via direct + เหตุผล · ยัง PARTS_CHECKED · การ์ดออกจากหัวข้อ`)
      : fail(`แก้เป็นงานด่วน ${P9.code}: toast=${t9} · ${urfOf(P9.id)} · ${logCount(P9.id, "URGENT_RELEASE")} · ${viaOf(P9.id)} · ${st(P9.id)}`);

    // แข่งกัน: เปิดหน้าต่างค้างไว้ แอดมินอีกคนแก้ให้ก่อน (API) → กดบันทึก → 409 URGENT_ASK_STATE ขึ้นในหน้าต่าง ไม่ปิดเอง
    await lbl(a9.page, `แก้เป็นงานด่วน ${P11.code}`).first().click();
    await a9.page.waitForTimeout(800);
    await call(A, "POST", `/work-orders/${P11.id}/urgent-release`, { day: tomorrow });
    await lbl(a9.page, "บันทึก แก้เป็นงานด่วน").last().click();
    const race9 = `${P11.code} แก้เป็นงานด่วนให้ ${dShort(tomorrow)} ไว้แล้ว — หัวหน้าภาคนัดได้เลย`;
    const r9 = await a9.vis(race9).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    const winOpen9 = (await a9.vis(`แก้เป็นงานด่วน · ${P11.code}`).count()) > 0;
    const saveOff9 = (await lbl(a9.page, "บันทึก แก้เป็นงานด่วน").last().getAttribute("aria-disabled")) === "true";
    r9 && winOpen9 && saveOff9 && logCount(P11.id, "URGENT_RELEASE") === 1
      ? pass(`แข่งกัน (แก้เป็นงานด่วน): หน้าต่างไม่ปิด ขึ้น "${race9}" · ปุ่มบันทึกปิด · ฐานข้อมูล URGENT_RELEASE 1 แถว`)
      : fail(`แข่งกัน (แก้เป็นงานด่วน): ข้อความ=${r9} · หน้าต่างเปิด=${winOpen9} · ปุ่มปิด=${saveOff9} · URGENT_RELEASE ${logCount(P11.id, "URGENT_RELEASE")}`);
    await a9.page.screenshot({ path: shot("11-grant-race") });
    await a9.vis("ยกเลิก").last().click();
    await a9.page.waitForTimeout(2500);
    (await lbl(a9.page, `รายละเอียด ${P11.code}`).count()) === 0
      ? pass(`ปิดหน้าต่างแล้วงานของฉันวันนี้โหลดใหม่ — การ์ด ${P11.code} ออกจากหัวข้อ (คำขอจบแล้ว)`)
      : fail(`ปิดหน้าต่างแล้วการ์ด ${P11.code} ยังค้าง`);

    // แข่งกัน (การ์ดเก่า): เปิดหน้าต่างค้างไว้ แอดมินอีกคนตอบคำขอไปก่อน (API) → กดบันทึก → 409 URGENT_ASK_STATE ในหน้าต่าง
    // ต้องไม่แก้ทับคำตอบ (แอปส่ง fromAsk ให้เซิร์ฟเวอร์เช็คว่าคำขอยังรออยู่) — ไม่เช็ค = 200 + toast สำเร็จ + คำตอบหายจากฟอร์มหัวหน้าภาค
    await lbl(a9.page, `แก้เป็นงานด่วน ${P13.code}`).first().click();
    await a9.page.waitForTimeout(800);
    await call(A, "POST", `/work-orders/${P13.id}/urgent-request/answer`, { note: "ทีมวันนี้เต็ม (เทสต์เวลาปิดนัด)" });
    await lbl(a9.page, "บันทึก แก้เป็นงานด่วน").last().click();
    const race9b = `${P13.code} ไม่มีคำขอนัดด่วน ${dShort(today)} ที่รออยู่แล้ว — แอดมินอีกคนอาจตอบไปแล้วหรือหัวหน้าภาคยกเลิกคำขอ`;
    const r9b = await a9.vis(race9b).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    const winOpen9b = (await a9.vis(`แก้เป็นงานด่วน · ${P13.code}`).count()) > 0;
    const saveOff9b = (await lbl(a9.page, "บันทึก แก้เป็นงานด่วน").last().getAttribute("aria-disabled")) === "true";
    r9b && winOpen9b && saveOff9b && logCount(P13.id, "URGENT_RELEASE") === 0 && urfOf(P13.id) === "-" &&
    lastAction(P13.id) === "URGENT_REQUEST_ANSWERED"
      ? pass(`แข่งกัน (การ์ดเก่าหลังแอดมินอีกคนตอบ): หน้าต่างไม่ปิด ขึ้น "${race9b}" · ปุ่มบันทึกปิด · ฐานข้อมูลไม่มี URGENT_RELEASE คำตอบยังเป็นแถวล่าสุด`)
      : fail(`แข่งกัน (การ์ดเก่า): ข้อความ=${r9b} · หน้าต่างเปิด=${winOpen9b} · ปุ่มปิด=${saveOff9b} · URGENT_RELEASE ${logCount(P13.id, "URGENT_RELEASE")} · ${urfOf(P13.id)} · ${lastAction(P13.id)}`);
    await a9.vis("ยกเลิก").last().click();
    await a9.page.waitForTimeout(2500);
    (await lbl(a9.page, `รายละเอียด ${P13.code}`).count()) === 0
      ? pass(`ปิดหน้าต่างแล้วโหลดใหม่ — การ์ด ${P13.code} ออกจากหัวข้อ (คำขอตอบไปแล้ว)`)
      : fail(`ปิดหน้าต่างแล้วการ์ด ${P13.code} ยังค้าง`);

    // หน้าใบงาน: กล่องม่วงคำขอในการ์ดขั้น (แอดมิน)
    await lbl(a9.page, `รายละเอียด ${P10.code}`).first().click();
    await a9.page.waitForTimeout(3500);
    const box10 = `หัวหน้าภาค ${sName}ขอนัดด่วน ${dFull(today)} · ${askAt(P10.id)} น.`;
    (await lbl(a9.page, box10).count()) > 0 && (await lbl(a9.page, "ตอบกลับ").count()) > 0 && (await lbl(a9.page, "แก้เป็นงานด่วน").count()) > 0
      ? pass(`หน้าใบงาน ${P10.code}: กล่อง "${box10}" + ปุ่ม ตอบกลับ / แก้เป็นงานด่วน`)
      : fail(`หน้าใบงาน ${P10.code}: ไม่เห็นกล่องคำขอ "${box10}"`);

    // ════════════════ 10) แอดมินตอบคำขอ · แข่งกับหัวหน้าภาคยกเลิก · หัวหน้าภาคเห็นคำตอบ ════════════════
    await lbl(a9.page, "ตอบกลับ").last().click();
    await a9.page.waitForTimeout(800);
    const sendOff = async () => (await lbl(a9.page, "ส่งคำตอบ").last().getAttribute("aria-disabled")) === "true";
    const info10 = `หัวหน้าภาคขอนัด ${dFull(today)} — บอกเหตุผลที่ไม่แก้เป็นงานด่วน หัวหน้าภาคจะเห็นในฟอร์มนัดวันแล้วนัดวันอื่น`;
    (await a9.vis(`ตอบคำขอนัดด่วน · ${P10.code}`).count()) > 0 && (await a9.vis(info10).count()) > 0 && (await sendOff())
      ? pass(`หน้าต่างตอบคำขอ: หัว · "${info10}" · ยังไม่พิมพ์ = ปุ่มส่งคำตอบกดไม่ได้`)
      : fail(`หน้าต่างตอบคำขอ: ปุ่มปิด=${await sendOff()}`);
    const note10 = "ร้านรอได้ถึงมะรืน (เทสต์เวลาปิดนัด)";
    await lbl(a9.page, "ข้อความถึงหัวหน้าภาค (ต้องใส่)").last().fill(note10);
    await a9.page.waitForTimeout(300);
    const sendOn = !(await sendOff());
    await lbl(a9.page, "ส่งคำตอบ").last().click();
    const toast10 = `ตอบคำขอนัดด่วน ${P10.code} แล้ว — หัวหน้าภาคเห็นในฟอร์มนัดวัน`;
    const t10 = await a9.vis(toast10).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a9.page.waitForTimeout(2000);
    const ans10 = sql(`select coalesce(meta->>'note','-')||'|'||coalesce(meta->>'day','-') from "WorkOrderLog" where "workOrderId"=${P10.id} and action='URGENT_REQUEST_ANSWERED' order by id desc limit 1`);
    sendOn && t10 && ans10 === `${note10}|${today}` && lastAction(P10.id) === "URGENT_REQUEST_ANSWERED" && (await lbl(a9.page, box10).count()) === 0
      ? pass(`พิมพ์แล้วส่งได้ → toast "${toast10}" · ฐานข้อมูล URGENT_REQUEST_ANSWERED meta.note/day · กล่องคำขอหายจากหน้าใบงาน`)
      : fail(`ตอบคำขอ ${P10.code}: ปุ่มเปิด=${sendOn} · toast=${t10} · ${ans10} · ${lastAction(P10.id)}`);

    // แข่งกัน: เปิดหน้าต่างตอบค้างไว้ หัวหน้าภาคยกเลิกคำขอ (API) → กดส่ง → 409 URGENT_ASK_STATE ในหน้าต่าง
    await toQueue(a9);
    await lbl(a9.page, `ตอบกลับคำขอนัดด่วน ${P12.code}`).first().click();
    await a9.page.waitForTimeout(800);
    await lbl(a9.page, "ข้อความถึงหัวหน้าภาค (ต้องใส่)").last().fill("ทีมพรุ่งนี้เต็ม (เทสต์)");
    await call(S(), "POST", `/work-orders/${P12.id}/urgent-request/cancel`, {});
    await lbl(a9.page, "ส่งคำตอบ").last().click();
    const race10 = "ไม่มีคำขอนัดด่วนที่รออยู่แล้ว — หัวหน้าภาคอาจยกเลิกหรือนัดวันอื่นไปแล้ว";
    const r10 = await a9.vis(race10).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    const winOpen10 = (await a9.vis(`ตอบคำขอนัดด่วน · ${P12.code}`).count()) > 0;
    r10 && winOpen10 && (await sendOff()) && logCount(P12.id, "URGENT_REQUEST_ANSWERED") === 0 && lastAction(P12.id) === "URGENT_REQUEST_CANCELLED"
      ? pass(`แข่งกัน (ตอบคำขอ): หน้าต่างไม่ปิด ขึ้น "${race10}" · ปุ่มส่งปิด · ฐานข้อมูลไม่มีคำตอบ (คำขอถูกยกเลิกแล้ว)`)
      : fail(`แข่งกัน (ตอบคำขอ): ข้อความ=${r10} · หน้าต่างเปิด=${winOpen10} · ${lastAction(P12.id)} · คำตอบ ${logCount(P12.id, "URGENT_REQUEST_ANSWERED")}`);
    await a9.vis("ยกเลิก").last().click();
    await a9.page.waitForTimeout(2500);
    (await lbl(a9.page, `รายละเอียด ${P12.code}`).count()) === 0
      ? pass(`ปิดหน้าต่างแล้วโหลดใหม่ — การ์ด ${P12.code} ออกจากหัวข้อ`)
      : fail(`ปิดหน้าต่างแล้วการ์ด ${P12.code} ยังค้าง`);
    await a9.ctx.close();

    // หัวหน้าภาคเปิดฟอร์มนัดวันของ P10 → เห็นคำตอบ
    const s10 = await openAs("S001", 1280);
    await toQueue(s10);
    await openFromQueue(s10, P10.code, "นัดวันเข้า");
    const aAt10 = askAt(P10.id, "URGENT_REQUEST_ANSWERED");
    const answerLine = `แอดมินตอบคำขอนัดด่วน (${dShort(today)}): “${note10}” · ${aName} ${aAt10} น.`;
    (await s10.vis(answerLine).count()) > 0
      ? pass(`ฟอร์มนัดวันของหัวหน้าภาค: "${answerLine}"`)
      : fail(`ฟอร์มนัดวัน: ไม่เห็นคำตอบ "${answerLine}"`);
    await s10.page.screenshot({ path: shot("12-sup-answer") });
    await s10.vis("ยกเลิก").last().click();
    await s10.ctx.close();

    // ════════════════ 11) คอนเฟิร์มลูกค้า: "วันเดิม" ไม่มีกฎ · "ขอเลื่อน" ไปวันที่ปิดต้องติ๊ก ════════════════
    /** ใบรอคอนเฟิร์มลูกค้า วันนัด day ไม่มีงานด่วน — นัดมะรืน (เปิดเสมอ) แล้วย้ายวันทาง SQL */
    const confirmOrderAt = async (day) => {
      const o = await fx.workOrder("C0006", []);
      await fx.schedule(o.id, d2);
      if (day !== d2) sql(`update "WorkOrder" set "scheduledAt"='${day}'::timestamp where id=${o.id}`);
      return o;
    };
    const K1 = await confirmOrderAt(tomorrow);
    const K2 = await confirmOrderAt(d2);
    rowOf(K1.id) === `AWAITING_CONFIRM|${tomorrow}` && rowOf(K2.id) === `AWAITING_CONFIRM|${d2}` && urfOf(K1.id) === "-"
      ? pass(`เตรียมใบรอคอนเฟิร์มลูกค้า: ${K1.code} พรุ่งนี้ (หลังเวลาปิด ไม่มีงานด่วน) · ${K2.code} มะรืน (ฐานข้อมูล)`)
      : fail(`เตรียมใบคอนเฟิร์ม: ${rowOf(K1.id)} · ${rowOf(K2.id)}`);
    const a11 = await openAs("A001", 1280);
    await toQueue(a11);
    await openFromQueue(a11, K1.code, "คอนเฟิร์มลูกค้า");
    const okLabel = (await lbl(a11.page, "ลูกค้าคอนเฟิร์มวันเดิม").count()) > 0 && (await lbl(a11.page, "ลูกค้าคอนเฟิร์มวันนี้").count()) === 0;
    await lbl(a11.page, "ลูกค้าคอนเฟิร์มวันเดิม").last().click();
    await a11.page.waitForTimeout(500);
    const ruleBits11 =
      (await a11.page.getByText(/ปิดนัดแล้ว|ต้องเป็นงานด่วน|เลยเวลาปิดรับ|แบบล็อก/).locator("visible=true").count()) + (await lbl(a11.page, URGENT_WITH).count());
    okLabel && ruleBits11 === 0 && !(await saveOff(a11.page))
      ? pass("คอนเฟิร์มลูกค้า: ตัวเลือก \"ลูกค้าคอนเฟิร์มวันเดิม\" (ไม่มี \"ลูกค้าคอนเฟิร์มวันนี้\") · ใบพรุ่งนี้หลังเวลาปิดไม่มีบรรทัด ไม่มีช่องติ๊ก ปุ่มยืนยันกดได้")
      : fail(`คอนเฟิร์มวันเดิม: ชื่อตัวเลือก=${okLabel} · สิ่งของกฎ ${ruleBits11} · ปุ่มปิด=${await saveOff(a11.page)}`);
    await a11.vis("ยืนยัน").last().click();
    await a11.page.waitForTimeout(4000);
    rowOf(K1.id) === `ASSIGNED|${tomorrow}` && logCount(K1.id, "URGENT_RELEASE") === 0 && urfOf(K1.id) === "-"
      ? pass(`คอนเฟิร์มวันเดิม → ${K1.code} ASSIGNED พรุ่งนี้ · ไม่มี URGENT_RELEASE · urgentReleaseFor ว่าง (ฐานข้อมูล)`)
      : fail(`คอนเฟิร์มวันเดิม ${K1.code}: ${rowOf(K1.id)} · URGENT_RELEASE ${logCount(K1.id, "URGENT_RELEASE")} · ${urfOf(K1.id)}`);

    await toQueue(a11);
    await openFromQueue(a11, K2.code, "คอนเฟิร์มลูกค้า");
    await lbl(a11.page, "ลูกค้าขอเลื่อน / เปลี่ยนวัน").last().click();
    await a11.page.waitForTimeout(500);
    await pickDay(a11.page, "วันใหม่", d3);
    const grey11 = `วันใหม่ ${dShort(d3)} — บันทึกได้เลย`;
    (await a11.vis(grey11).count()) > 0 && (await lbl(a11.page, URGENT_WITH).count()) === 0
      ? pass(`ลูกค้าขอเลื่อนไปวันที่เปิด: บรรทัดเทา "${grey11}" ไม่มีช่องติ๊ก`)
      : fail(`ขอเลื่อนไป ${d3}: ไม่เห็น "${grey11}"`);
    await pickDay(a11.page, "วันใหม่", tomorrow);
    const red11 = `พรุ่งนี้ปิดนัดแล้ว (เลย ${C9} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`;
    const tick11 = lbl(a11.page, URGENT_WITH).last();
    (await a11.vis(red11).count()) > 0 && (await tick11.count()) > 0 && (await a11.vis("ติ๊กแก้เป็นงานด่วนก่อน").count()) > 0 && (await saveOff(a11.page))
      ? pass(`ลูกค้าขอเลื่อนไปพรุ่งนี้ (หลังเวลาปิด): แดง "${red11}" + ช่องติ๊ก · ปุ่มยืนยันปิดจนกว่าจะติ๊ก`)
      : fail(`ขอเลื่อนไปพรุ่งนี้: แดง ${await a11.vis(red11).count()} · ติ๊ก ${await tick11.count()} · ปุ่มปิด ${await saveOff(a11.page)}`);
    await tick11.click();
    await a11.page.waitForTimeout(400);
    const on11 = !(await saveOff(a11.page));
    await a11.page.screenshot({ path: shot("13-confirm-move") });
    await a11.vis("ยืนยัน").last().click();
    await a11.page.waitForTimeout(4000);
    const r11 = rowOf(K2.id);
    on11 && r11 === `ASSIGNED|${tomorrow}` && urfOf(K2.id) === tomorrow && viaOf(K2.id).startsWith("confirm|")
      ? pass(`ติ๊กแล้วบันทึก → ${K2.code} ${r11} · urgentReleaseFor = ${tomorrow} · URGENT_RELEASE via confirm (ฐานข้อมูล)`)
      : fail(`ขอเลื่อน+ติ๊ก ${K2.code}: ปุ่มเปิด=${on11} · ${r11} · ${urfOf(K2.id)} · ${viaOf(K2.id)}`);

    // ใบทดสอบ (TC จากส่วน 6 — รอคอนเฟิร์มลูกค้า วันนี้) "ลูกค้าขอเลื่อน" ไปพรุ่งนี้หลังเวลาปิด: เซิร์ฟเวอร์ยกเว้นใบทดสอบทุกทาง
    // ฟอร์มแอดมินต้องไม่มีป้าย/บรรทัด/ช่องติ๊กเลย (rule = isTest ? null : cutoff) ปุ่มยืนยันกดได้ทันที — ใบจริงแบบเดียวกัน (K2) ปุ่มปิดจนติ๊ก
    await openOrder(a11, TC.code);
    await lbl(a11.page, "คอนเฟิร์มลูกค้า").last().click();
    await a11.page.waitForTimeout(1500);
    await lbl(a11.page, "ลูกค้าขอเลื่อน / เปลี่ยนวัน").last().click();
    await a11.page.waitForTimeout(500);
    await openCal(a11.page, "วันใหม่");
    const tcTags11 = await tagsOf(a11.page);
    await closeCal(a11.page);
    await pickDay(a11.page, "วันใหม่", tomorrow);
    const tcRule11 =
      (await a11.page.getByText(/ปิดนัดแล้ว|ต้องเป็นงานด่วน|บันทึกได้เลย|ติ๊กแก้เป็นงานด่วนก่อน/).locator("visible=true").count()) +
      (await lbl(a11.page, URGENT_WITH).count());
    const tcOn11 = !(await saveOff(a11.page));
    await a11.vis("ยืนยัน").last().click();
    await a11.page.waitForTimeout(4000);
    const tcRow11 = rowOf(TC.id);
    tcTags11.length === 0 && tcRule11 === 0 && tcOn11 && tcRow11 === `ASSIGNED|${tomorrow}` && logCount(TC.id, "URGENT_RELEASE") === 0 && urfOf(TC.id) === "-"
      ? pass(`ใบทดสอบ ${TC.code} ลูกค้าขอเลื่อนไปพรุ่งนี้ (หลังเวลาปิด): ไม่มีป้าย "ต้องติ๊กงานด่วน" ไม่มีบรรทัด ไม่มีช่องติ๊ก ปุ่มยืนยันกดได้ → ASSIGNED พรุ่งนี้ · ไม่มี URGENT_RELEASE · urgentReleaseFor ว่าง (ฐานข้อมูล)`)
      : fail(`ใบทดสอบขอเลื่อน ${TC.code}: ป้าย ${JSON.stringify(tcTags11)} · สิ่งของกฎ ${tcRule11} · ปุ่มเปิด=${tcOn11} · ${tcRow11} · URGENT_RELEASE ${logCount(TC.id, "URGENT_RELEASE")} · ${urfOf(TC.id)}`);

    /**
     * กดตอนเวลาเพิ่งผ่าน (คอนเฟิร์ม "ลูกค้าขอเลื่อน"): เปิดฟอร์มตอนพรุ่งนี้ยังเปิด (บรรทัดเทา ไม่มีช่องติ๊ก) → เวลาปิดย้ายไปเมื่อนาทีก่อน (SQL)
     * → กดยืนยัน → 400 DATE_CLOSED: ฟอร์มไม่ปิด คิดนาฬิกาใหม่จากคำตอบในที่เดิม บรรทัดแดง + ช่องติ๊ก ปุ่มปิด
     * ข้อความเซิร์ฟเวอร์ (คำเดียวกับบรรทัดแดง) ไม่ขึ้นซ้ำเป็นสองข้อความ · ฐานข้อมูลไม่เปลี่ยน → ติ๊กแล้วบันทึกได้
     * จบแล้วคืนเวลาปิดเป็น C9 — ส่วน 12 เทียบข้อความ "เลย C9 น."
     */
    const K3 = await confirmOrderAt(d2);
    await setCut(cutIn(45));
    await toQueue(a11);
    await openFromQueue(a11, K3.code, "คอนเฟิร์มลูกค้า");
    await lbl(a11.page, "ลูกค้าขอเลื่อน / เปลี่ยนวัน").last().click();
    await a11.page.waitForTimeout(500);
    await pickDay(a11.page, "วันใหม่", tomorrow);
    const grey11b = `วันใหม่ ${dShort(tomorrow)} — บันทึกได้เลย`;
    const open11b = (await a11.vis(grey11b).count()) > 0 && (await lbl(a11.page, URGENT_WITH).count()) === 0 && !(await saveOff(a11.page));
    const C11 = cutIn(-1);
    await setCut(C11);
    await a11.vis("ยืนยัน").last().click();
    const red11b = `พรุ่งนี้ปิดนัดแล้ว (เลย ${C11} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`;
    const redSeen11b = await a11.vis(red11b).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    await a11.page.waitForTimeout(500);
    const once11b = (await a11.vis(red11b).count()) === 1;
    const tick11b = lbl(a11.page, URGENT_WITH).last();
    const off11b = await saveOff(a11.page);
    open11b && redSeen11b && once11b && (await tick11b.count()) > 0 && off11b &&
    rowOf(K3.id) === `AWAITING_CONFIRM|${d2}` && logCount(K3.id, "RESCHEDULED") + logCount(K3.id, "CONFIRMED") === 0
      ? pass(`คอนเฟิร์ม ${K3.code} กดตอนเวลาเพิ่งผ่าน: ก่อนหน้าเทา "${grey11b}" → ฟอร์มไม่ปิด แดง "${red11b}" ขึ้นครั้งเดียว + ช่องติ๊ก ปุ่มปิด · ฐานข้อมูลยัง AWAITING_CONFIRM มะรืน`)
      : fail(`คอนเฟิร์มกดตอนเวลาเพิ่งผ่าน ${K3.code}: เทาก่อน=${open11b} · แดง=${redSeen11b} · ครั้งเดียว=${once11b} · ติ๊ก ${await tick11b.count()} · ปุ่มปิด=${off11b} · ${rowOf(K3.id)}`);
    await tick11b.click();
    await a11.page.waitForTimeout(400);
    await a11.vis("ยืนยัน").last().click();
    await a11.page.waitForTimeout(4000);
    rowOf(K3.id) === `ASSIGNED|${tomorrow}` && urfOf(K3.id) === tomorrow && viaOf(K3.id).startsWith("confirm|")
      ? pass(`ติ๊กแล้วบันทึกในฟอร์มเดิม → ${K3.code} ASSIGNED พรุ่งนี้ · งานด่วน via confirm (ฐานข้อมูล)`)
      : fail(`หลังติ๊ก ${K3.code}: ${rowOf(K3.id)} · ${urfOf(K3.id)} · ${viaOf(K3.id)}`);
    await setCut(C9);
    await a11.ctx.close();

    // ════════════════ 12) เลื่อนวันนัด · ดึงงานคืน ไปวันที่ปิด ════════════════
    const M1 = await releaseOrderAt(d2);
    const M2 = await releaseOrderAt(d2);
    await call(S(), "POST", `/work-orders/${M2.id}/dispatch`, {});
    rowOf(M1.id) === `ASSIGNED|${d2}` && rowOf(M2.id) === `IN_PROGRESS|${d2}`
      ? pass(`เตรียมใบรอปล่อยงาน ${M1.code} และใบที่ปล่อยแล้ว ${M2.code} (มะรืน · ฐานข้อมูล)`)
      : fail(`เตรียมเลื่อนวันนัด: ${rowOf(M1.id)} · ${rowOf(M2.id)}`);
    const a12 = await openAs("A001", 1280);
    const moveTo = async (o, day, red) => {
      await openOrder(a12, o.code);
      await lbl(a12.page, "เลื่อนวันนัด").last().click();
      await a12.page.waitForTimeout(1000);
      await pickDay(a12.page, "วันนัดใหม่", day);
      await lbl(a12.page, "เหตุผลที่เลื่อนวันนัด").last().fill("ร้านขอเลื่อน (เทสต์เวลาปิดนัด)");
      await a12.page.waitForTimeout(300);
      const save = lbl(a12.page, "บันทึกวันนัดใหม่").last();
      const tick = lbl(a12.page, URGENT_WITH).last();
      const before = (await a12.vis(red).count()) > 0 && (await tick.count()) > 0 && (await save.getAttribute("aria-disabled")) === "true";
      await tick.click();
      await a12.page.waitForTimeout(300);
      const after = (await save.getAttribute("aria-disabled")) !== "true";
      await save.click();
      return { before, after };
    };
    const red12 = "วันนี้ต้องเป็นงานด่วน — ต้องไปวันนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก";
    const mv1 = await moveTo(M1, today, red12);
    const toast12 = `เลื่อนวันนัด ${M1.code} เป็น ${dFull(today)} แล้ว — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่ · แก้เป็นงานด่วนไปพร้อมกันแล้ว`;
    const t12 = await a12.vis(toast12).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a12.page.waitForTimeout(1500);
    mv1.before && mv1.after && t12 && rowOf(M1.id) === `ASSIGNED|${today}` && urfOf(M1.id) === today && viaOf(M1.id).startsWith("reschedule|")
      ? pass(`เลื่อนวันนัดไปวันนี้: แดง "${red12}" ปุ่มปิดจนติ๊ก → toast "${toast12}" · ฐานข้อมูล ASSIGNED วันนี้ + งานด่วน via reschedule`)
      : fail(`เลื่อนวันนัด ${M1.code}: ก่อนติ๊ก=${mv1.before} · หลังติ๊ก=${mv1.after} · toast=${t12} · ${rowOf(M1.id)} · ${urfOf(M1.id)} · ${viaOf(M1.id)}`);
    const red12b = `พรุ่งนี้ปิดนัดแล้ว (เลย ${C9} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`;
    const mv2 = await moveTo(M2, tomorrow, red12b);
    const toast12b = `เลื่อนวันนัด ${M2.code} เป็น ${dFull(tomorrow)} แล้ว — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่ · แก้เป็นงานด่วนไปพร้อมกันแล้ว`;
    const t12b = await a12.vis(toast12b).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a12.page.waitForTimeout(1500);
    mv2.before && mv2.after && t12b && rowOf(M2.id) === `ASSIGNED|${tomorrow}` && urfOf(M2.id) === tomorrow &&
    viaOf(M2.id).startsWith("reschedule|") && logCount(M2.id, "APPOINTMENT_RECALLED") === 1
      ? pass(`ดึงงานคืนไปพรุ่งนี้: แดง "${red12b}" → toast "${toast12b}" · ฐานข้อมูล ดึงคืน ASSIGNED พรุ่งนี้ + งานด่วน via reschedule`)
      : fail(`ดึงงานคืน ${M2.code}: ก่อนติ๊ก=${mv2.before} · หลังติ๊ก=${mv2.after} · toast=${t12b} · ${rowOf(M2.id)} · ${urfOf(M2.id)} · ${viaOf(M2.id)} · RECALLED ${logCount(M2.id, "APPOINTMENT_RECALLED")}`);

    /**
     * เลื่อนวันนัด: ฟอร์มเปิดที่วันเดิม (ไม่ใช่วันแรกที่นัดได้ — ตอนนี้พรุ่งนี้ยังเปิด วันแรกที่นัดได้จึงเป็นพรุ่งนี้ ต่างจากวันเดิม)
     * แล้วกดตอนเวลาเพิ่งผ่าน: เลือกพรุ่งนี้ (บรรทัดเทา ไม่มีช่องติ๊ก) + เหตุผล → เวลาปิดย้ายไปเมื่อนาทีก่อน (SQL) → กดบันทึก
     * → 400 DATE_CLOSED: ฟอร์มไม่ปิด เหตุผลยังอยู่ บรรทัดแดง + ช่องติ๊กขึ้นเอง ปุ่มปิด ข้อความเซิร์ฟเวอร์ไม่ซ้ำกับบรรทัดแดง ·
     * ฐานข้อมูลไม่เปลี่ยน → ติ๊กแล้วบันทึกได้ในฟอร์มเดิม
     */
    const M3 = await releaseOrderAt(d2);
    await setCut(cutIn(45));
    await openOrder(a12, M3.code);
    await lbl(a12.page, "เลื่อนวันนัด").last().click();
    await a12.page.waitForTimeout(1000);
    const default12 = await fieldText(a12.page, "วันนัดใหม่");
    await pickDay(a12.page, "วันนัดใหม่", tomorrow);
    const why12 = "ร้านขอเลื่อน (เทสต์กดตอนเวลาเพิ่งผ่าน)";
    await lbl(a12.page, "เหตุผลที่เลื่อนวันนัด").last().fill(why12);
    await a12.page.waitForTimeout(300);
    const save12 = lbl(a12.page, "บันทึกวันนัดใหม่").last();
    const grey12 = `วันใหม่ ${dShort(tomorrow)} — บันทึกได้เลย`;
    const open12 =
      (await a12.vis(grey12).count()) > 0 && (await lbl(a12.page, URGENT_WITH).count()) === 0 && (await save12.getAttribute("aria-disabled")) !== "true";
    default12.includes(dLong(d2)) && open12
      ? pass(`เลื่อนวันนัด ${M3.code}: ฟอร์มเปิดที่วันเดิม (${dLong(d2)}) · เลือกพรุ่งนี้ตอนยังเปิด = บรรทัดเทา "${grey12}" ไม่มีช่องติ๊ก ปุ่มบันทึกกดได้`)
      : fail(`เลื่อนวันนัด ${M3.code} ตอนยังเปิด: วันตั้งต้น "${default12}" · เทา/ไม่มีติ๊ก/ปุ่มกดได้=${open12}`);
    const C12 = cutIn(-1);
    await setCut(C12);
    await save12.click();
    const red12c = `พรุ่งนี้ปิดนัดแล้ว (เลย ${C12} น.) — ต้องไปพรุ่งนี้จริง ติ๊ก “แก้เป็นงานด่วน” ก่อนบันทึก`;
    const redSeen12 = await a12.vis(red12c).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    await a12.page.waitForTimeout(500);
    const tick12 = lbl(a12.page, URGENT_WITH).last();
    const once12 = (await a12.vis(red12c).count()) === 1;
    const kept12 = (await lbl(a12.page, "เหตุผลที่เลื่อนวันนัด").last().inputValue().catch(() => "")) === why12;
    const off12 = (await save12.getAttribute("aria-disabled")) === "true";
    redSeen12 && once12 && (await tick12.count()) > 0 && off12 && kept12 &&
    rowOf(M3.id) === `ASSIGNED|${d2}` && logCount(M3.id, "APPOINTMENT_MOVED") === 0 && urfOf(M3.id) === "-"
      ? pass(`กดตอนเวลาเพิ่งผ่าน: ฟอร์มไม่ปิด เหตุผลยังอยู่ · แดง "${red12c}" ขึ้นครั้งเดียว + ช่องติ๊ก ปุ่มปิด · ฐานข้อมูลยัง ASSIGNED มะรืน ไม่มี APPOINTMENT_MOVED`)
      : fail(`เลื่อนวันกดตอนเวลาเพิ่งผ่าน ${M3.code}: แดง=${redSeen12} · ครั้งเดียว=${once12} · ติ๊ก ${await tick12.count()} · ปุ่มปิด=${off12} · เหตุผลอยู่=${kept12} · ${rowOf(M3.id)} · MOVED ${logCount(M3.id, "APPOINTMENT_MOVED")}`);
    await tick12.click();
    await a12.page.waitForTimeout(300);
    await save12.click();
    const toast12c = `เลื่อนวันนัด ${M3.code} เป็น ${dFull(tomorrow)} แล้ว — ใบกลับไปที่หัวหน้าภาคให้คอนเฟิร์มวันใหม่ · แก้เป็นงานด่วนไปพร้อมกันแล้ว`;
    const t12c = await a12.vis(toast12c).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await a12.page.waitForTimeout(1500);
    t12c && rowOf(M3.id) === `ASSIGNED|${tomorrow}` && urfOf(M3.id) === tomorrow && viaOf(M3.id).startsWith("reschedule|")
      ? pass(`ติ๊กแล้วบันทึกในฟอร์มเดิม → toast "${toast12c}" · ฐานข้อมูล ASSIGNED พรุ่งนี้ + งานด่วน via reschedule`)
      : fail(`หลังติ๊ก ${M3.code}: toast=${t12c} · ${rowOf(M3.id)} · ${urfOf(M3.id)} · ${viaOf(M3.id)}`);

    // ════════════════ 13) บอร์ดแผนงาน: ไม่มีป้ายเวลาปิดรับ · ป้ายเขียวบนจุดที่แอดมินแก้เป็นงานด่วน ════════════════
    await a12.page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
    await a12.page.waitForTimeout(2500);
    await a12.vis("แผนงาน").first().click();
    const stop = a12.page.locator(`[aria-label="เปิด ${M1.code}"]`).locator("visible=true").first();
    const stopSeen = await stop.waitFor({ timeout: 20000 }).then(() => true, () => false);
    const stopText = stopSeen ? await stop.innerText() : "";
    const boardText = await a12.page.evaluate(() => document.body.innerText);
    stopSeen && stopText.includes("แอดมินแก้เป็นงานด่วน") && !stopText.includes("ปล่อยได้เลย") && !/ปิดรับ|เลยเวลาปล่อยงาน/.test(boardText)
      ? pass(`บอร์ดแผนงานวันนี้: จุด ${M1.code} ป้ายเขียว "แอดมินแก้เป็นงานด่วน" · ไม่มีป้าย "ปิดรับ …" / "เลยเวลาปล่อยงาน" ทั้งบอร์ด`)
      : fail(`บอร์ดแผนงาน: จุด=${stopSeen} "${stopText.replace(/\n/g, " ").slice(0, 200)}" · ปิดรับ/เลยเวลา=${/ปิดรับ|เลยเวลาปล่อยงาน/.test(boardText)}`);
    await a12.page.screenshot({ path: shot("14-plan-board"), fullPage: true });
    await a12.ctx.close();

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
    // เบอร์ S001 ที่ส่วน 9 ตั้งชั่วคราว — คืนจากแถวจดและลบแถวจด (คืนไม่สำเร็จ แถวจดยังอยู่ให้รอบหน้าคืน) · ไม่มีแถวจด = ไม่แตะ
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
    sql(`delete from "User" where "employeeCode"='${PA}'`);
    await browser.close();
  }
})();
