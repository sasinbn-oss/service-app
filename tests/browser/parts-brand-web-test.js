// ทดสอบ: เลือกอะไหล่ตามไฟล์ยี่ห้อ ก้อน 5 — ช่องเลือกอะไหล่ในแอป + หน้าจัดการข้อมูลอะไหล่ (เจ้าของงานตอบ 31 ต.ค. 69)
//   1) แอดมิน · จัดการข้อมูลอะไหล่: ปุ่มกรอง "ไม่มียี่ห้อ" = ไม่อยู่ในไฟล์ไหน (ข้อความยี่ห้อ "HB - Huebsch" ไม่ช่วย) ·
//      ปุ่มไฟล์ Huebsch · แถว "ไฟล์ …" / "ไม่อยู่ในไฟล์ยี่ห้อไหน" · ฟอร์มติ๊ก "อยู่ในไฟล์ยี่ห้อ" → ฐานข้อมูลได้ไฟล์ตรงตามที่ติ๊ก (MANUAL)
//   2) หัวหน้าภาค · ระบุอะไหล่บนเครื่องที่ยังไม่รู้ยี่ห้อ: ต้องกดยี่ห้อก่อน (ไม่มีช่องค้น) → กด Huebsch → หัว "อะไหล่จากไฟล์ Huebsch" ·
//      ค้นรหัส Maytag → "รหัสนี้อยู่ในไฟล์ Maytag" · ค้นของ Other → ขึ้นใต้ "ของใช้ร่วม (ไฟล์ Other)" · เพิ่มตัว Huebsch แล้วยืนยัน →
//      ฐานข้อมูล: Machine.model = Huebsch + ประวัติบันทึกยี่ห้อเครื่อง + อะไหล่ที่รอ
//   3) หัวหน้าภาค · เครื่อง Huebsch ที่มีอะไหล่ Maytag ค้างในใบ: ป้ายแดง "ไม่อยู่ในไฟล์ Huebsch — เอาออกก่อนส่ง" · ปุ่มยืนยันกดไม่ได้ ·
//      เอาออกแล้วเพิ่มตัว Huebsch → บันทึกได้ (ฐานข้อมูล)
//   4) หัวหน้าภาค · "แก้ยี่ห้อเครื่อง" บนหน้าใบงาน → ชีตแยก (ไม่ซ้อนในฟอร์ม) → บันทึก → ฐานข้อมูล Machine.model + ประวัติ "{เดิม} → {ใหม่}"
//   5) ฟอร์มปิดงาน (จอ 420 · แอดมินปิดแทนแบบ before-after) บนเครื่องที่ยังไม่รู้ยี่ห้อ: ชิปยี่ห้อในช่อง "อะไหล่ที่ใช้ไป" ·
//      กด Huebsch เพิ่มตัว Huebsch → ไม่ขาดอะไร · สลับเป็น Maytag → ป้ายแดง + "ยังขาด: เอา … ออกก่อนส่ง" + "ยังขาด 1 อย่าง — พาไป"
//      เลื่อนไปช่องอะไหล่ (กรอบกระพริบ) ไม่ส่งคำขอปิดงาน · สลับกลับ → โหลดหน้าใหม่ เปิดฟอร์มอีกครั้ง ชิป Huebsch ยังติด (ร่าง closeDraft) ·
//      ปิดงาน → ฐานข้อมูล: ใบปิดแล้ว · Machine.model = Huebsch · ประวัติบันทึกยี่ห้อเครื่อง 1 แถว · อะไหล่ที่ใช้ = ตัว Huebsch
// ต้องมี DATABASE_URL · ไม่ขึ้นกับเวลาไทยของวันที่รัน — ข้อ 5 ปล่อยงานด้วยวันนัด 12 วันข้างหน้า (G10 · ไม่ติดเวลาปิดนัดงานพรุ่งนี้)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { visitDay } = require("./fixture");
const PHOTO = path.join(__dirname, "..", "site-photo.png");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const API = "http://localhost:4000/api";
const call = async (token, method, p, body) => {
  const r = await fetch(`${API}/${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.status === 204 ? null : r.json().catch(() => ({}));
};
const login = async (code) => (await call(null, "POST", "auth/login", { employeeCode: code, password: "test1234" })).token;

const SUF = String(process.pid);
const K = `ZPB${SUF}`;
// ชื่อขึ้นต้นด้วยตัวอักษรอังกฤษ — ลำดับตามชื่อไม่ขึ้นกับ collation ภาษาไทยของฐาน
const PARTS = [
  [`${K}-HB1`, "a สายพานทดสอบหน้าจอไฟล์", "Huebsch"],
  [`${K}-HB2`, "b ลูกยางทดสอบหน้าจอไฟล์", "Huebsch"],
  [`${K}-MT1`, "m มอเตอร์ทดสอบหน้าจอไฟล์", "Maytag"],
  [`${K}-OT1`, "o น้ำยาของใช้ร่วมทดสอบหน้าจอ", "Other"],
  // ข้อความยี่ห้อบอก Huebsch แต่ไม่อยู่ในไฟล์ไหน — ช่างต้องเลือกไม่ได้ และต้องขึ้นใต้ "ไม่มียี่ห้อ"
  [`${K}-NB1`, "n ไม่อยู่ในไฟล์ทดสอบหน้าจอ", null],
];
const nameOf = (code) => PARTS.find((p) => p[0] === code)[1];

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const BID = sql(`select id from "Branch" where code='C0006'`);
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  // รหัสเครื่องสุ่มที่ยังไม่มีในสาขา — เครื่องใหม่ = ยังไม่รู้ยี่ห้อแน่นอน (เครื่องเดิมในสาขาอาจถูกเทสต์อื่นตั้งยี่ห้อไว้แล้ว)
  const freeCode = () => {
    for (;;) {
      const c = `W9${Math.floor(Math.random() * 900 + 100)}`;
      if (sql(`select count(*) from "Machine" where "branchId"=${BID} and code='${c}'`) === "0") return c;
    }
  };
  const MU = freeCode();
  let MK = freeCode();
  while (MK === MU) MK = freeCode();
  // ข้อ 5 ใช้เครื่องของตัวเอง — เครื่อง MU ถูกบันทึกยี่ห้อไปแล้วในข้อ 2
  let MC = freeCode();
  while (MC === MU || MC === MK) MC = freeCode();
  const ids = [];
  const A = await login("A001");
  const cleanup = async () => {
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    sql(`delete from "WorkOrder" where "branchId"=${BID} and symptom like 'ทดสอบไฟล์ยี่ห้อหน้าจอ%${SUF}'`);
    sql(`delete from "Machine" where "branchId"=${BID} and code in ('${MU}','${MK}','${MC}')`);
    sql(`delete from "SparePart" where "partCode" like '${K}-%'`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
  };

  let page;
  try {
    sql(`insert into "SparePart"("partCode",name,brand,"offCatalog","updatedAt") values
      ${PARTS.map(([c, n, f]) => `('${c}','${n}','${f ? "ZZไม่เกี่ยว" : "HB - Huebsch"}',false,now())`).join(",")};
      insert into "SparePartBrandFile"("sparePartId",file,source)
      select p.id, f.file, 'MANUAL' from "SparePart" p join (values
        ${PARTS.filter((p) => p[2]).map(([c, , f]) => `('${c}','${f}')`).join(",")}) as f(code,file) on f.code=p."partCode";`);
    const PID = (code) => sql(`select id from "SparePart" where "partCode"='${code}'`);
    const files = (code) =>
      sql(`select coalesce(string_agg(b.file||':'||b.source, ',' order by b.file),'') from "SparePartBrandFile" b join "SparePart" p on p.id=b."sparePartId" where p."partCode"='${code}'`);

    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const S = await login("S001");
    const open = async (machine) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: machine.code, ...(machine.model ? { model: machine.model } : {}), symptom: `ทดสอบไฟล์ยี่ห้อหน้าจอ ${SUF}` }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      if (!id) throw new Error(`เปิดใบงานไม่ได้: ${JSON.stringify(r).slice(0, 200)}`);
      ids.push(id);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`), mid: sql(`select "machineId" from "WorkOrder" where id=${id}`) };
    };
    const U = await open({ code: MU }); // เครื่องที่ยังไม่รู้ยี่ห้อ
    const KN = await open({ code: MK, model: "Huebsch" }); // เครื่อง Huebsch
    sql(`select coalesce(brand,'')||'|'||coalesce(model,'') from "Machine" where id=${U.mid}`) === "|"
      ? pass(`เตรียม: เครื่อง ${MU} ยังไม่รู้ยี่ห้อ`) : fail(`เครื่อง ${MU} มียี่ห้อแล้ว`);
    // อะไหล่ Maytag ค้างในใบของเครื่อง Huebsch (ใส่ก่อนมีล็อกยี่ห้อ — ค่าตั้งต้น D6) · ยังไม่เบิก จึงต้องเอาออกก่อนส่ง
    sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind) values (${KN.id},${PID(`${K}-MT1`)},1,'WAITING')`);

    // หน้าใหม่ (context ใหม่) ต่อผู้ใช้หนึ่งคน — ไม่ต้องหาปุ่มออกจากระบบ และไม่มีค่าของคนก่อนค้างในเครื่อง
    const freshPage = async (viewport = { width: 1366, height: 950 }) => {
      if (page) await page.context().close();
      page = await (await browser.newContext({ viewport })).newPage();
      // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ — "ระบบหลังบ้าน" อยู่ในกลุ่มผู้ดูแลระบบ จึงกางทุกกลุ่มไว้ก่อน
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(String(e)));
    };
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const selected = async (l) => (await label(l).first().getAttribute("aria-selected")) === "true";
    const signIn = async (code, viewport) => {
      await freshPage(viewport);
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
    };

    // ── 1) แอดมิน · จัดการข้อมูลอะไหล่ ──
    await signIn("A001");
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลอะไหล่").last().click();
    await page.waitForTimeout(3000);
    await label("ค้นหาอะไหล่").first().fill(K);
    await page.waitForTimeout(600);
    await label("กรอง ไม่มียี่ห้อ").click();
    await page.waitForTimeout(600);
    (await vis(nameOf(`${K}-NB1`)).count()) === 1 &&
    (await vis(nameOf(`${K}-HB1`)).count()) === 0 &&
    (await vis("ไม่อยู่ในไฟล์ยี่ห้อไหน — ช่างเลือกไม่ได้").count()) === 1
      ? pass("กรอง \"ไม่มียี่ห้อ\": ขึ้นเฉพาะตัวที่ไม่อยู่ในไฟล์ไหน (ข้อความยี่ห้อ HB - Huebsch ไม่นับ) พร้อมป้ายแดง")
      : fail("ปุ่มกรอง ไม่มียี่ห้อ ไม่ตรง");
    await page.screenshot({ path: path.join(__dirname, "parts-brand-1-nofile.png") });
    await label("กรอง Huebsch").click();
    await page.waitForTimeout(600);
    (await vis(nameOf(`${K}-HB1`)).count()) === 1 && (await vis(nameOf(`${K}-NB1`)).count()) === 0 && (await vis("ไฟล์ Huebsch").count()) >= 2
      ? pass("กรอง Huebsch: ขึ้นตัวในไฟล์ Huebsch แถวบอก \"ไฟล์ Huebsch\" · ตัวที่ไม่อยู่ในไฟล์ไม่ขึ้น")
      : fail("ปุ่มกรอง Huebsch ไม่ตรง");
    await label("กรอง ไม่มียี่ห้อ").click();
    await page.waitForTimeout(500);
    await label(`แก้ไข ${K}-NB1`).click();
    await page.waitForTimeout(1200);
    (await vis("ยังไม่ได้เลือกไฟล์ — ช่างเลือกอะไหล่ตัวนี้ไม่ได้ (ยกเว้นใบงานที่ไม่ระบุเครื่อง)").count()) === 1
      ? pass("ฟอร์มอะไหล่: ไม่มีไฟล์ = เตือนว่าช่างเลือกไม่ได้") : fail("ไม่มีคำเตือนไม่มีไฟล์");
    await label("ไฟล์ Huebsch").click();
    await label("ไฟล์ Other").click();
    await page.waitForTimeout(300);
    (await selected("ไฟล์ Huebsch")) && (await selected("ไฟล์ Other")) && !(await selected("ไฟล์ Maytag"))
      ? pass("ติ๊ก Huebsch + Other แล้วปุ่มติดสองปุ่ม") : fail("ปุ่มไฟล์ไม่ติดตามที่กด");
    await vis("บันทึกการแก้ไข").last().click();
    await page.waitForTimeout(2500);
    files(`${K}-NB1`) === "Huebsch:MANUAL,Other:MANUAL"
      ? pass("ฐานข้อมูล: อะไหล่อยู่ในไฟล์ Huebsch และ Other (MANUAL) ตามที่ติ๊ก") : fail(`ไฟล์หลังบันทึก: ${files(`${K}-NB1`)}`);
    await label("กรอง ทั้งหมด").click();
    await page.waitForTimeout(500);
    await label(`แก้ไข ${K}-NB1`).click();
    await page.waitForTimeout(1200);
    await label("ไฟล์ Other").click();
    await page.waitForTimeout(300);
    await vis("บันทึกการแก้ไข").last().click();
    await page.waitForTimeout(2500);
    files(`${K}-NB1`) === "Huebsch:MANUAL"
      ? pass("เอาไฟล์ Other ออกในฟอร์ม → ฐานข้อมูลเหลือ Huebsch ไฟล์เดียว (ที่เดียวที่เอาไฟล์ออกได้)") : fail(`ไฟล์หลังเอาออก: ${files(`${K}-NB1`)}`);
    // คืนเป็น "ไม่อยู่ในไฟล์ไหน" — ข้อต่อไปต้องค้นไม่เจอตัวนี้
    sql(`delete from "SparePartBrandFile" where "sparePartId"=${PID(`${K}-NB1`)}`);

    // ── 2) หัวหน้าภาค · ระบุอะไหล่ บนเครื่องที่ยังไม่รู้ยี่ห้อ ──
    await signIn("S001");
    const openOrder = async (code) => {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await vis("ใบงานซ่อม").first().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await vis(code).last().click();
      await page.waitForTimeout(3500);
    };
    await openOrder(U.code);
    await vis("ระบุอะไหล่").first().click();
    await page.waitForTimeout(1200);
    await vis("ใช้อะไหล่").first().click();
    await page.waitForTimeout(800);
    (await vis("เลือกยี่ห้อเครื่องก่อน").count()) > 0 && (await page.getByPlaceholder(/^ค้นหาในไฟล์|^ค้นหารหัส ชื่อ หรือ Part No\.$/).locator("visible=true").count()) === 0
      ? pass("เครื่องยังไม่รู้ยี่ห้อ: ขึ้น \"เลือกยี่ห้อเครื่องก่อน\" และยังไม่มีช่องค้น (ไม่มีทางค้นทุกไฟล์)")
      : fail("เครื่องไม่รู้ยี่ห้อแต่มีช่องค้น / ไม่มีข้อความให้เลือกยี่ห้อ");
    await page.screenshot({ path: path.join(__dirname, "parts-brand-2-chips.png") });
    await label("ยี่ห้อเครื่อง Huebsch").click();
    await page.waitForTimeout(1500);
    (await vis("อะไหล่จากไฟล์ Huebsch", false).count()) > 0 && (await vis(`จะบันทึกยี่ห้อ Huebsch ให้เครื่อง ${MU} ตอนบันทึก`).count()) > 0
      ? pass(`กด Huebsch: หัวช่อง "อะไหล่จากไฟล์ Huebsch" + "จะบันทึกยี่ห้อ Huebsch ให้เครื่อง ${MU} ตอนบันทึก"`)
      : fail("หลังกดยี่ห้อ หัวช่อง/ข้อความบันทึกยี่ห้อไม่ขึ้น");
    const search = page.getByPlaceholder("ค้นหาในไฟล์ Huebsch").locator("visible=true").first();
    await search.fill(`${K}-MT1`);
    await page.waitForTimeout(2000);
    (await vis(`ไม่พบ “${K}-MT1” ในไฟล์ Huebsch — รหัสนี้อยู่ในไฟล์ Maytag`).count()) > 0
      ? pass("ค้นรหัสอะไหล่ Maytag บนเครื่อง Huebsch: ไม่พบ + บอกว่ารหัสนี้อยู่ในไฟล์ Maytag") : fail("ไม่บอกว่าอยู่ไฟล์ไหน");
    await search.fill(`${K}-NB1`);
    await page.waitForTimeout(2000);
    (await label(`เพิ่ม ${K}-NB1 ${nameOf(`${K}-NB1`)}`).count()) === 0 && (await vis(`ไม่พบ “${K}-NB1” ในไฟล์ Huebsch`).count()) > 0
      ? pass("อะไหล่ที่ไม่อยู่ในไฟล์ไหน (ยี่ห้อเขียน HB - Huebsch) ค้นไม่เจอ") : fail("อะไหล่ที่ไม่อยู่ในไฟล์ไหนโผล่ในผลค้น");
    await search.fill(`${K}-OT1`);
    await page.waitForTimeout(2000);
    (await vis("ของใช้ร่วม (ไฟล์ Other)").count()) > 0 && (await label(`เพิ่ม ${K}-OT1 ${nameOf(`${K}-OT1`)}`).count()) > 0
      ? pass("ของใช้ร่วม: อะไหล่ไฟล์ Other ขึ้นใต้หัว \"ของใช้ร่วม (ไฟล์ Other)\"") : fail("ไม่มีกลุ่มของใช้ร่วม");
    await search.fill(`${K}-HB1`);
    await page.waitForTimeout(2000);
    await label(`เพิ่ม ${K}-HB1 ${nameOf(`${K}-HB1`)}`).first().click();
    await page.waitForTimeout(600);
    (await label(`จำนวน ${K}-HB1`).count()) > 0 ? pass("เพิ่มอะไหล่ Huebsch เข้ารายการ (กดแถวผลค้นด้วยป้าย \"เพิ่ม {รหัส} {ชื่อ}\")") : fail("เพิ่มไม่เข้า");
    await page.screenshot({ path: path.join(__dirname, "parts-brand-3-picked.png") });
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(3500);
    const model = sql(`select coalesce(model,'') from "Machine" where id=${U.mid}`);
    const logs = sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${U.id} and action='MACHINE_BRAND_SET'`);
    const waiting = sql(`select coalesce(string_agg(p."partCode", ','),'') from "WorkOrderPart" w join "SparePart" p on p.id=w."sparePartId" where w."workOrderId"=${U.id} and w.kind='WAITING'`);
    model === "Huebsch" && logs === "1" && waiting === `${K}-HB1`
      ? pass(`ฐานข้อมูล: เครื่อง ${MU} จำยี่ห้อ Huebsch (Machine.model) + ประวัติบันทึกยี่ห้อเครื่อง + อะไหล่ที่รอ ${K}-HB1`)
      : fail(`หลังบันทึก: model=${model} log=${logs} waiting=${waiting}`);

    // ── 3) เครื่อง Huebsch ที่มีอะไหล่ Maytag ค้างในใบ ──
    await openOrder(KN.code);
    await vis("ระบุอะไหล่").first().click();
    await page.waitForTimeout(1200);
    await vis("ใช้อะไหล่").first().click();
    await page.waitForTimeout(1200);
    const save = vis("ยืนยัน").last();
    const op = () => save.evaluate((n) => getComputedStyle(n.closest("[tabindex]") || n.parentElement).opacity);
    (await vis("ไม่อยู่ในไฟล์ Huebsch — เอาออกก่อนส่ง").count()) > 0 &&
    (await vis(`เอา ${K}-MT1 ออกก่อนส่ง — อยู่นอกไฟล์ที่เครื่องนี้เลือกได้`).count()) > 0 &&
    (await op()) !== "1"
      ? pass("แถว Maytag ที่ค้างในใบ: ป้ายแดง \"ไม่อยู่ในไฟล์ Huebsch — เอาออกก่อนส่ง\" + บอกว่าต้องเอาตัวไหนออก · ปุ่มยืนยันกดไม่ได้")
      : fail("แถวนอกไฟล์ไม่ติดป้ายแดง / ปุ่มยังกดได้");
    await page.screenshot({ path: path.join(__dirname, "parts-brand-4-red.png") });
    await label(`เอา ${K}-MT1 ออก`).click();
    await page.waitForTimeout(400);
    await page.getByPlaceholder("ค้นหาในไฟล์ Huebsch").locator("visible=true").first().fill(`${K}-HB2`);
    await page.waitForTimeout(2000);
    await label(`เพิ่ม ${K}-HB2 ${nameOf(`${K}-HB2`)}`).first().click();
    await page.waitForTimeout(600);
    (await op()) === "1" ? pass("เอาแถวนอกไฟล์ออกแล้ว ปุ่มยืนยันกดได้") : fail("เอาออกแล้วปุ่มยังกดไม่ได้");
    await save.click();
    await page.waitForTimeout(3500);
    const waitingK = sql(`select coalesce(string_agg(p."partCode", ','),'') from "WorkOrderPart" w join "SparePart" p on p.id=w."sparePartId" where w."workOrderId"=${KN.id} and w.kind='WAITING'`);
    waitingK === `${K}-HB2` ? pass(`ฐานข้อมูล: อะไหล่ที่รอเหลือ ${K}-HB2 (Maytag ออกจากใบ)`) : fail(`อะไหล่ที่รอ: ${waitingK}`);

    // ── 4) แก้ยี่ห้อเครื่องจากหน้าใบงาน ──
    await openOrder(KN.code);
    await label(`แก้ยี่ห้อเครื่อง ${MK}`).click();
    await page.waitForTimeout(1200);
    (await vis(`แก้ยี่ห้อเครื่อง ${MK}`).count()) > 0 && (await vis("ยี่ห้อนี้ใช้หาไฟล์อะไหล่ คิดอายุประกัน และการเสนอราคา").count()) > 0
      ? pass("ชีตแก้ยี่ห้อเครื่องเปิดจากหน้าใบงาน บอกว่ายี่ห้อมีผลกับอะไร") : fail("ชีตแก้ยี่ห้อไม่เปิด");
    await label("ยี่ห้อเครื่อง Maytag").click();
    await page.waitForTimeout(300);
    await vis("บันทึกยี่ห้อเครื่อง").last().click();
    // รอข้อความทันทีหลังกด — toast หายเองหลังขึ้น 3.5 วินาที รอเวลาตายตัวแล้วค่อยดูจะผ่าน/พังตามความเร็วเครื่อง ไม่ใช่ตามแอป
    const toast = await vis("บันทึกยี่ห้อเครื่องแล้ว", false).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    const fixed = sql(`select coalesce(model,'') from "Machine" where id=${KN.mid}`);
    const fixLog = sql(`select coalesce(max(note),'') from "WorkOrderLog" where "workOrderId"=${KN.id} and action='MACHINE_BRAND_SET'`);
    fixed === "Maytag" && fixLog === `ยี่ห้อเครื่อง ${MK}: Huebsch → Maytag`
      ? pass(`ฐานข้อมูล: เครื่อง ${MK} เป็น Maytag + ประวัติ "ยี่ห้อเครื่อง ${MK}: Huebsch → Maytag"`)
      : fail(`แก้ยี่ห้อ: model=${fixed} log=${fixLog}`);
    toast ? pass("ขึ้นข้อความ บันทึกยี่ห้อเครื่องแล้ว") : fail("ไม่มีข้อความยืนยันการแก้ยี่ห้อ");

    // ── 5) ฟอร์มปิดงานบนเครื่องที่ยังไม่รู้ยี่ห้อ ──
    // ช่องเดียวที่ต่อชิปยี่ห้อเข้ากับรายการ "ยังขาด" + ปุ่มพาไป + ร่างฟอร์ม — ถ้าสายนี้ขาด ทุกชุดเทสต์อื่นยังเขียว (ปิดงานแค่บนเครื่องที่รู้ยี่ห้อ)
    // เดินใบแบบ before-after: ไม่ใช้อะไหล่ จ่ายทีมสาขา วันนัด 12 วันข้างหน้า (G10) ปล่อยงาน แล้วแอดมินปิดแทนในจอ 420
    // ไฟล์ปิดงาน (ก่อน/หลังซ่อม · ป้ายรุ่น · ใบเหลือง) อัปโหลดผ่าน API ไว้ก่อน — ไม่ใช่เรื่องที่ทดสอบ ให้ของที่ขาดเหลือแค่เรื่องยี่ห้อ
    const C = await open({ code: MC });
    await call(S, "POST", `work-orders/${C.id}/parts`, { needsParts: false });
    await call(S, "POST", `work-orders/${C.id}/assign`, { team: "กระบี่", scheduledAt: visitDay(12) });
    await call(A, "POST", `work-orders/${C.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${C.id}/dispatch`, {});
    if (sql(`select status from "WorkOrder" where id=${C.id}`) !== "IN_PROGRESS") throw new Error(`เตรียมใบ ${C.code} ไม่ถึงขั้นเข้างาน`);
    for (const role of ["BEFORE", "AFTER", "NAMEPLATE", "REQUISITION"]) {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(PHOTO)], { type: "image/png" }), "p.png");
      fd.append("role", role);
      await fetch(`${API}/work-orders/${C.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${A}` }, body: fd });
    }
    const shots = sql(`select count(distinct role) from "WorkOrderAttachment" where "workOrderId"=${C.id} and role in ('BEFORE','AFTER','NAMEPLATE','REQUISITION')`);
    if (shots !== "4") throw new Error(`อัปโหลดไฟล์ปิดงานไม่ครบ (${shots}/4)`);
    sql(`select coalesce(brand,'')||'|'||coalesce(model,'') from "Machine" where id=${C.mid}`) === "|"
      ? pass(`เตรียม ${C.code}: เครื่อง ${MC} ยังไม่รู้ยี่ห้อ เข้างานแล้ว มีไฟล์ปิดงานครบ (ฐานข้อมูล)`) : fail(`เครื่อง ${MC} มียี่ห้อแล้ว`);

    const H = 860;
    await signIn("A001", { width: 420, height: H });
    const openPhone = async () => {
      await vis("ใบงาน").last().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(C.code);
      await page.waitForTimeout(2500);
      await vis(C.code).first().click();
      await page.waitForTimeout(3000);
      await vis("ปิดงาน").first().click();
      await page.waitForTimeout(2500);
    };
    // กล่อง "ยังขาด: …" ท้ายฟอร์ม — ไม่มีกล่อง = ไม่ขาดอะไร
    const missing = async () => {
      const box = page.getByText(/^ยังขาด:/).locator("visible=true");
      return (await box.count()) ? await box.last().innerText() : "";
    };
    const pickWorker = async () => {
      await label("ผู้เข้าปฏิบัติงานคนที่ 1").last().click();
      await page.waitForTimeout(500);
      await vis("ช่างสมชาย", false).last().click();
      await page.waitForTimeout(500);
    };
    const addHB1 = async () => {
      await page.getByPlaceholder("ค้นหาในไฟล์ Huebsch").locator("visible=true").last().fill(`${K}-HB1`);
      await page.waitForTimeout(2000);
      await label(`เพิ่ม ${K}-HB1 ${nameOf(`${K}-HB1`)}`).first().click();
      await page.waitForTimeout(600);
    };
    const closePosts = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new RegExp(`/work-orders/${C.id}/close$`).test(r.url())) closePosts.push(r.url());
    });
    await openPhone();
    (await vis("เลือกยี่ห้อเครื่องก่อน").count()) > 0 && (await page.getByPlaceholder(/^ค้นหาในไฟล์/).locator("visible=true").count()) === 0
      ? pass("ฟอร์มปิดงาน เครื่องยังไม่รู้ยี่ห้อ: ช่อง \"อะไหล่ที่ใช้ไป\" ขึ้น \"เลือกยี่ห้อเครื่องก่อน\" ยังไม่มีช่องค้น")
      : fail("ฟอร์มปิดงานไม่ถามยี่ห้อเครื่องก่อน");
    await page.getByPlaceholder("เช่น เปลี่ยนบอร์ดควบคุม ทดสอบแล้วปกติ").locator("visible=true").last().fill("เปลี่ยนสายพาน ทดสอบแล้วปกติ");
    await pickWorker();
    await label("ยี่ห้อเครื่อง Huebsch").last().click();
    await page.waitForTimeout(1500);
    (await vis(`จะบันทึกยี่ห้อ Huebsch ให้เครื่อง ${MC} ตอนปิดงาน`).count()) > 0
      ? pass(`กด Huebsch: "จะบันทึกยี่ห้อ Huebsch ให้เครื่อง ${MC} ตอนปิดงาน"`) : fail("ไม่บอกว่าจะบันทึกยี่ห้อตอนปิดงาน");
    await addHB1();
    const closeBtn = vis("ยืนยันปิดงาน").last();
    (await label(`จำนวน ${K}-HB1`).count()) > 0 && (await closeBtn.count()) > 0 && (await missing()) === ""
      ? pass("เพิ่มตัว Huebsch แล้วไม่ขาดอะไร ปุ่มล่างเป็น \"ยืนยันปิดงาน\"")
      : fail(`หลังเพิ่มตัว Huebsch: ยังขาด "${await missing()}"`);

    await label("ยี่ห้อเครื่อง Maytag").last().click();
    await page.waitForTimeout(1500);
    const go = vis("ยังขาด 1 อย่าง — พาไป").last();
    (await vis("ไม่อยู่ในไฟล์ Maytag — เอาออกก่อนส่ง").count()) > 0 &&
    (await missing()).includes(`เอา ${K}-HB1 ออกก่อนส่ง`) &&
    (await go.count()) > 0 && (await closeBtn.count()) === 0
      ? pass("สลับชิปเป็น Maytag: แถว Huebsch ป้ายแดง · \"ยังขาด: เอา … ออกก่อนส่ง\" · ปุ่มล่าง \"ยังขาด 1 อย่าง — พาไป\"")
      : fail(`สลับเป็น Maytag: ยังขาด "${await missing()}" · ปุ่มพาไป ${await go.count()} · ปุ่มยืนยัน ${await closeBtn.count()}`);
    await page.screenshot({ path: path.join(__dirname, "parts-brand-5-close-red.png") });
    // เลื่อนลงท้ายฟอร์มก่อน — ต้องเห็นว่าปุ่มพากลับขึ้นไปที่ช่องอะไหล่จริง ไม่ใช่บังเอิญอยู่ในจอ
    await label("อะไหล่ไม่ครบ เปิดใบงานรออะไหล่ต่อ").last().scrollIntoViewIfNeeded().catch(() => {});
    const field = page.getByPlaceholder("ค้นหาในไฟล์ Maytag").locator("visible=true").last();
    const inView = (b) => !!b && b.y >= 0 && b.y + b.height <= H;
    const awayBefore = !inView(await field.boundingBox());
    await go.click();
    await page.waitForTimeout(400);
    const flash = await page.locator('[aria-label="ช่องที่ยังขาด"]').count();
    let arrived = false;
    for (let i = 0; i < 30 && !(arrived = inView(await field.boundingBox())); i++) await page.waitForTimeout(100);
    arrived && flash > 0 && closePosts.length === 0 && sql(`select status from "WorkOrder" where id=${C.id}`) === "IN_PROGRESS"
      ? pass(`กด "พาไป": เลื่อนไปช่องอะไหล่ที่ใช้ไป (กรอบกระพริบ${awayBefore ? " · ก่อนกดอยู่นอกจอ" : ""}) ไม่ส่งคำขอปิดงาน`)
      : fail(`พาไป: ถึงช่องอะไหล่ ${arrived} · กรอบ ${flash} · คำขอปิด ${closePosts.length}`);

    await label("ยี่ห้อเครื่อง Huebsch").last().click();
    await page.waitForTimeout(1500);
    (await vis("ไม่อยู่ในไฟล์ Maytag — เอาออกก่อนส่ง").count()) === 0 && (await closeBtn.count()) > 0
      ? pass("สลับกลับเป็น Huebsch: ป้ายแดงหาย ปุ่มกลับเป็น \"ยืนยันปิดงาน\"") : fail("สลับกลับแล้วยังติดป้ายแดง/ปุ่มยังไม่กลับ");
    // ร่างบันทึกหลังแก้ 400 ms และตอนปิดฟอร์ม — ปิดฟอร์ม โหลดหน้าใหม่ (ล้างหน่วยความจำของหน้า เหลือแค่ร่าง) แล้วเปิดอีกครั้ง
    await page.waitForTimeout(1000);
    await label("ปิด").last().click();
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    await page.goto("http://localhost:8081", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await openPhone();
    (await selected("ยี่ห้อเครื่อง Huebsch")) && (await vis("อะไหล่จากไฟล์ Huebsch", false).count()) > 0
      ? pass("โหลดหน้าใหม่แล้วเปิดฟอร์มปิดงานอีกครั้ง: ชิป Huebsch ยังติด หัวช่อง \"อะไหล่จากไฟล์ Huebsch\" (ร่างจำยี่ห้อที่กด)")
      : fail("เปิดฟอร์มใหม่แล้วยี่ห้อที่กดไว้หาย");
    // คนที่ติ๊ก/อะไหล่ที่เพิ่ม ไม่อยู่ในร่างโดยตั้งใจ (ดู buildMissing) — ใส่ใหม่ให้ปิดงานได้
    if ((await missing()).includes("ผู้เข้าปฏิบัติงาน")) await pickWorker();
    if ((await label(`จำนวน ${K}-HB1`).count()) === 0) await addHB1();
    await closeBtn.click();
    let closed = "";
    for (let i = 0; i < 60 && (closed = sql(`select status from "WorkOrder" where id=${C.id}`)) === "IN_PROGRESS"; i++) await page.waitForTimeout(250);
    const cModel = sql(`select coalesce(model,'') from "Machine" where id=${C.mid}`);
    const cLogs = sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${C.id} and action='MACHINE_BRAND_SET'`);
    const used = sql(`select coalesce(string_agg(p."partCode", ','),'') from "WorkOrderPart" w join "SparePart" p on p.id=w."sparePartId" where w."workOrderId"=${C.id} and w.kind='USED'`);
    closed === "DONE" && cModel === "Huebsch" && cLogs === "1" && used === `${K}-HB1`
      ? pass(`ฐานข้อมูล: ${C.code} ปิดแล้ว · เครื่อง ${MC} จำยี่ห้อ Huebsch + ประวัติบันทึกยี่ห้อ 1 แถว · อะไหล่ที่ใช้ ${K}-HB1`)
      : fail(`ปิดงาน: status=${closed} model=${cModel} log=${cLogs} used=${used}`);
  } catch (e) {
    fail(String(e).split("\n").slice(0, 2).join(" "));
    await page?.screenshot({ path: path.join(__dirname, "parts-brand-fail.png") }).catch(() => {});
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
    await cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
  }
})();
