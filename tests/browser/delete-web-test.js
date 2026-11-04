// ทดสอบหน้าจอ: ลบใบงาน = ย้ายไปถังขยะ (เจ้าของงานตัดสิน 4 พ.ย. 69 — ตัวอย่างที่ตกลง)
//   · ช่าง/หัวหน้าภาคไม่เห็นปุ่ม · แอดมินเห็น
//   · กล่อง "ย้ายใบงานนี้ไปถังขยะ?" บอกครบ: เก็บ 30 วัน · ย้ายไปพร้อมกัน (อะไหล่ · ไฟล์แนบ · ประวัติ) · แนะนำ "ยกเลิกใบงาน"
//   · ยังไม่เลือกเหตุผล = ปุ่ม "เลือกเหตุผลก่อน" กดแล้วไม่มีคำขอออก (ฐานข้อมูลไม่เปลี่ยน) · ชิปเหตุผลบอกสถานะด้วย aria-pressed
//   · เลือก "เปิดซ้ำ" แล้วย้าย → ฐานข้อมูล: deletedAt · เหตุผล · คนลบ · ประวัติ "ย้ายไปถังขยะ" · หายจากรายการ · แถบบอกวันที่กู้คืนได้ถึง
// ทั้ง "เลิกทำ" และหน้าถังขยะอยู่ที่ trash-web-test.js · ต้องมี DATABASE_URL (โหลดจาก backend/.env)
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();
const { fxPart } = require("./fixture"); // อะไหล่ตรงยี่ห้อเครื่องของใบ
const { purgeOrders } = require("./purge"); // ล้างใบงานของเทสต์ — DELETE ย้ายไปถังขยะแล้ว (tests/lib/purge-orders.sh)
const DIR = __dirname;
const API = "http://127.0.0.1:4000/api";
const call = async (p, token, method = "GET", body) => {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`${p} ${r.status} ${await r.text()}`); return r.json();
};
const login = async (c) => (await call("/auth/login", null, "POST", { employeeCode: c, password: "test1234" })).token;
const BUTTON = '[aria-label="ลบใบงานนี้ (ย้ายไปถังขยะ)"]';

(async () => {
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);

  const signIn = async (p, code) => {
    await p.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await p.getByPlaceholder("รหัสพนักงาน").fill(code);
    await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").first().click();
    await p.waitForTimeout(4000);
  };
  const openWO = async (p, code) => {
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await p.getByText("ใบงาน", { exact: true }).locator("visible=true").last().click();
    await p.waitForTimeout(2500);
    const s = p.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
    await s.click(); await s.type(code, { delay: 60 }); await p.waitForTimeout(2500);
    await p.getByText(code, { exact: false }).locator("visible=true").first().click();
    await p.waitForTimeout(3000);
  };

  // ค่าที่เทสต์นี้เปลี่ยน — คืนใน finally เสมอ: เดิมไม่คืน S001 ค้างภาคกลาง-ตะวันตก
  // แล้วเทสต์อื่นที่ถือว่า S001 = ภาคใต้ภาคเดียวพังตามด้วยเหตุที่ไม่เกี่ยว
  const saved = sql(`select coalesce(region,'')||'|'||array_to_string("extraRegions",',') from "User" where "employeeCode"='S001'`)
    + "|" + sql(`select coalesce(team,'') from "User" where "employeeCode"='T001'`);
  let woId = null;
  let admin = null;
  try {
    admin = await login("A001");
    const sup = await login("S001");
    const branch = (await call("/branches?search=C0001", admin))[0];
    const users = await call("/auth/users", admin);
    await call(`/auth/users/${users.find(u=>u.employeeCode==="S001").id}`, admin, "PATCH", { region: branch.region });
    await call(`/auth/users/${users.find(u=>u.employeeCode==="T001").id}`, admin, "PATCH", { team: branch.zone });
    const wo = await call("/work-orders", admin, "POST", { branchCode: "C0001", jobType: "CM", priority: "NORMAL",
      machines: [{ code: "W97", model: "Oasis", symptom: "ทดสอบปุ่มลบ" }] });
    const o = wo.orders ? wo.orders[0] : wo;
    woId = o.id;
    // อะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ (fxPart) จึงเลือกหลังเปิดใบ — แถวแรกของผลค้นรหัสไม่รู้ว่าเครื่องยี่ห้ออะไร
    // ข้อที่ทดสอบ ("อะไหล่ 1 รายการ" ในกล่องยืนยัน) ไม่ขึ้นกับว่าเป็นตัวไหน
    const pid = fxPart(o.id, "BOARD");
    await call(`/work-orders/${o.id}/parts`, sup, "POST", { needsParts: true, parts: [{ sparePartId: pid, quantity: 2 }] });
    // ช่างเห็นเฉพาะใบงานของทีมตัวเอง — ใส่ทีมให้ตรง ๆ ข้อที่ทดสอบคือ "ช่างที่เปิดใบงานได้ ไม่เห็นปุ่มลบ"
    sql(`update "WorkOrder" set "assignedTeam"='${branch.zone}' where id=${o.id}`);
    const statusBefore = sql(`select status from "WorkOrder" where id=${o.id}`);
    const logsBefore = Number(sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${o.id}`));
    console.log("เตรียมใบงาน", o.code, statusBefore);

    // ── ช่างต้องไม่เห็นปุ่มลบ ──
    const t = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    // ผู้ใช้ที่เทสต์นี้สร้างเองยังไม่เคยตอบกล่องสอนการใช้งาน — ปิดกล่องที่ขึ้นเอง ไม่งั้นพื้นมืดบังทุกปุ่ม (tests/README)
    await t.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    await signIn(t, "T001"); await openWO(t, o.code);
    (await t.locator(BUTTON).locator("visible=true").count()) === 0 ? pass("ช่างไม่เห็นปุ่มลบ") : fail("ช่างเห็นปุ่มลบ");
    await t.close();

    // ── หัวหน้าภาคต้องไม่เห็น ──
    const s2 = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    await s2.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    await signIn(s2, "S001"); await openWO(s2, o.code);
    (await s2.locator(BUTTON).locator("visible=true").count()) === 0 ? pass("หัวหน้าภาคไม่เห็นปุ่มลบ") : fail("หัวหน้าภาคเห็นปุ่มลบ");
    await s2.close();

    // ── แอดมิน: กล่องยืนยัน → เลือกเหตุผล → ย้ายไปถังขยะ ──
    const a = await browser.newPage({ viewport: { width: 420, height: 1400 } });
    await a.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    const seen = (x, e = false) => a.getByText(x, { exact: e }).locator("visible=true").count();
    const deletes = [];
    a.on("request", (r) => { if (r.method() === "DELETE" && /\/work-orders\/\d+$/.test(r.url())) deletes.push(r.url()); });
    await signIn(a, "A001"); await openWO(a, o.code);
    (await a.locator(BUTTON).locator("visible=true").count()) > 0 ? pass("แอดมินเห็นปุ่มลบ (ย้ายไปถังขยะ)") : fail("แอดมินไม่เห็นปุ่มลบ");
    await a.locator(BUTTON).locator("visible=true").first().click();
    await a.waitForTimeout(1000);
    (await seen("ย้ายใบงานนี้ไปถังขยะ?", true)) > 0 ? pass("หัวกล่อง \"ย้ายใบงานนี้ไปถังขยะ?\"") : fail("ไม่มีหัวกล่องยืนยัน");
    (await seen("ยังเก็บไว้ในถังขยะ 30 วัน")) > 0 && (await seen("ระบบลบจริงพร้อมรูปและวิดีโอ")) > 0
      ? pass("บอกว่าเก็บ 30 วัน กู้คืนได้ แล้วลบจริงพร้อมรูปและวิดีโอ") : fail("ข้อความ 30 วัน/ลบจริงไม่ครบ");
    (await seen("หายจากรายการใบงาน กล่องงาน รายงาน และการค้นหา")) > 0 ? pass("บอกว่าหายจากรายการ กล่องงาน รายงาน การค้นหา") : fail("ไม่บอกว่าหายจากไหนบ้าง");
    (await seen(`อะไหล่ 1 รายการ · ไฟล์แนบ 0 ไฟล์ · ประวัติ ${logsBefore} รายการ`)) > 0
      ? pass(`บรรทัด "ย้ายไปพร้อมกัน" นับอะไหล่ ไฟล์ ประวัติ (${logsBefore})`) : fail("บรรทัดย้ายไปพร้อมกันไม่ตรง");
    (await seen("ใช้ “ยกเลิกใบงาน” ดีกว่า")) > 0 ? pass("กล่องเหลืองแนะนำยกเลิกใบงานแทน") : fail("ไม่แนะนำยกเลิกใบงาน");

    // ยังไม่เลือกเหตุผล — ปุ่มบอกว่าต้องเลือกก่อน กดแล้วไม่มีอะไรออกไป
    const chip = (l) => a.locator(`[aria-label="เหตุผลที่ลบ ${l}"]`).locator("visible=true").last();
    const pressed = async () =>
      Promise.all(["ใบทดสอบ / ลองระบบ", "เปิดซ้ำ", "เปิดผิดสาขา / ผิดเครื่อง", "อื่น ๆ"].map((l) => chip(l).getAttribute("aria-pressed")));
    (await pressed()).join(",") === "false,false,false,false" ? pass("ชิปเหตุผลสี่ตัว ยังไม่มีตัวไหนติด (aria-pressed)") : fail(`aria-pressed ตอนเปิด: ${await pressed()}`);
    await a.getByText("เลือกเหตุผลก่อน", { exact: true }).locator("visible=true").last().click({ force: true }).catch(() => {});
    await a.waitForTimeout(1000);
    deletes.length === 0 && sql(`select ("deletedAt" is null)::text from "WorkOrder" where id=${o.id}`) === "true"
      ? pass("ปุ่ม \"เลือกเหตุผลก่อน\" กดแล้วไม่มีคำขอออก (ฐานข้อมูลไม่เปลี่ยน)") : fail(`ยังไม่เลือกเหตุผลแต่มีคำขอ ${deletes.join(",")}`);

    await chip("เปิดซ้ำ").click();
    await a.waitForTimeout(500);
    (await pressed()).join(",") === "false,true,false,false" ? pass("กด \"เปิดซ้ำ\" → ชิปนั้นติด (aria-pressed=true) ตัวอื่นไม่ติด") : fail(`aria-pressed หลังเลือก: ${await pressed()}`);
    await a.screenshot({ path: path.join(DIR, "del-2-modal.png"), fullPage: true });
    await a.getByText("ย้ายไปถังขยะ", { exact: true }).locator("visible=true").last().click();
    await a.waitForTimeout(4000);

    const row = sql(`select coalesce(to_char(w."deletedAt",'YYYY'),'-')||'|'||coalesce(w."deleteReason",'-')||'|'||coalesce(u."employeeCode",'-')||'|'||w.status
                     from "WorkOrder" w left join "User" u on u.id=w."deletedById" where w.id=${o.id}`);
    const [yr, reason, by, st] = row.split("|");
    /^\d{4}$/.test(yr) && reason === "DUPLICATE" && by === "A001" && st === statusBefore
      ? pass("ฐานข้อมูล: อยู่ในถังขยะ · เหตุผล เปิดซ้ำ · คนลบ A001 · ขั้นไม่เปลี่ยน (แถวยังอยู่)") : fail(`ฐานข้อมูล: ${row}`);
    sql(`select action||'|'||coalesce(note,'') from "WorkOrderLog" where "workOrderId"=${o.id} order by id desc limit 1`) === "TRASHED|เปิดซ้ำ"
      ? pass("ประวัติ: ย้ายไปถังขยะ + เหตุผล") : fail(`ประวัติล่าสุด: ${sql(`select action||'|'||coalesce(note,'') from "WorkOrderLog" where "workOrderId"=${o.id} order by id desc limit 1`)}`);
    (await seen(`ย้าย ${o.code} ไปถังขยะแล้ว · กู้คืนได้ถึง`)) > 0 ? pass("แถบแจ้งเตือนบอกวันที่กู้คืนได้ถึง") : fail("ไม่มีแถบแจ้งเตือนหลังย้าย");
    const list = await call(`/work-orders?status=ALL`, admin);
    list.rows.find((r) => r.code === o.code) ? fail("ใบงานยังอยู่ในรายการ") : pass("ย้ายแล้วหายจากรายการ (API)");
    await a.screenshot({ path: path.join(DIR, "del-3-after.png"), fullPage: true });
    await a.close();
  } catch (e) { fail(e.message); } finally {
    // ใบของเทสต์ — ย้ายไปถังขยะ (ถ้ายังไม่ได้ย้าย) แล้วลบจริงทางครบ 30 วัน
    if (woId && admin) await purgeOrders(admin, [woId]);
    const [r, e, team] = saved.split("|");
    sql(`update "User" set region=nullif('${r}',''), "extraRegions"=coalesce(string_to_array(nullif('${e}',''),','),'{}') where "employeeCode"='S001'`);
    sql(`update "User" set team=nullif('${team}','') where "employeeCode"='T001'`);
    await browser.close();
  }
})();
