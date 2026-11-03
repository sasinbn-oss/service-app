// ทดสอบ: สี่เรื่องที่เจ้าของงานขอ ต.ค. 69 (รอบปิดงาน SUB / ขนาดเครื่อง / จำนวนอะไหล่ / ช่างแก้ไขเรียบร้อย)
//   1) ช่องจำนวนอะไหล่: ลบเลขเดิมแล้วพิมพ์ 8 ได้ 8 (เดิมเด้งเป็น 18) · ปุ่ม + เพิ่มเป็น 9 · บันทึกแล้วฐานข้อมูล 9
//   2) หัวใบงานขึ้น "เครื่อง W.. · 25 กก."
//   3) ใบงาน SUB: ฟอร์มบันทึกผลมีช่อง "ทีม SUB ที่เข้าทำ" (เลือกทีมไว้ให้) ไม่มีช่องช่างบริษัทคนที่ 1–3
//   4) หัวหน้าภาค "ช่างเข้าดำเนินการแก้ไขเรียบร้อย": เลือกช่าง แนบรูปหลังซ่อม → ฐานข้อมูลปิดเป็นซ่อมเสร็จ (FIXED)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const { fxPart } = require("./fixture"); // อะไหล่ตรงยี่ห้อเครื่องของใบ
const PHOTO = path.join(__dirname, "..", "site-photo.png");
const API = "http://localhost:4000/api";
const call = async (token, method, p, body) => {
  const r = await fetch(`${API}/${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.status === 204 ? null : r.json();
};
const login = async (code) => (await call(null, "POST", "auth/login", { employeeCode: code, password: "test1234" })).token;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const team = sql(`select zone from "Branch" where code='C0006'`);
  const os = `ZZOS${Date.now() % 100000}`;
  // ช่างคนที่สองของทีม C0006 (ฐานทดสอบมีช่างคนเดียว) — ช่องช่างที่เข้าซ่อมเลือกได้สามคน ต้องมีคนให้เลือกคนที่ 2
  const T2 = `ZR2T${Date.now() % 100000}`;
  const planDay = new Date(Date.now() + 7 * 3600e3 + 20 * 86400e3).toISOString().slice(0, 10);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const ids = [];
  let mach = null, oldCap = null;
  const A = await login("A001");
  try {
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const S = await login("S001");
    await call(A, "POST", "teams/outsource", { name: os });
    const mk = async (n) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: `W7${n}`, symptom: "ทดสอบรอบสอง" }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      ids.push(id);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    const P = await mk(1); // ระบุอะไหล่ + ขนาดเครื่อง
    const B = await mk(2); // ใบงาน SUB เข้างานอยู่
    // วันนี้ปิดนัดเสมอ (เส้นตายคือ 16:00 เมื่อวาน) — แอดมินแก้เป็นงานด่วนให้วันนี้ก่อน หัวหน้าภาคจึงนัดวันนี้ได้ ไม่ว่ารันกี่โมง
    // คอนเฟิร์มวันเดิมกับปล่อยงานไม่มีเวลาปิดแล้ว ไม่ต้องติ๊กอะไร
    await call(A, "POST", `work-orders/${B.id}/urgent-release`, { day: today });
    await call(S, "POST", `work-orders/${B.id}/parts`, { needsParts: false, assign: { team: os, scheduledAt: today } });
    await call(A, "POST", `work-orders/${B.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${B.id}/dispatch`, {});
    const F = await mk(3); // ช่างแก้ไขเรียบร้อย (ใบไม่มีแผนงาน — เลือกเองสองคน)
    const G = await mk(4); // ช่างแก้ไขเรียบร้อย (มีแผนงาน — เติมสองคนให้เอง)
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('${T2}','ช่างทดสอบคนที่สอง ${T2}','EMPLOYEE','${hash}',false,'${team}')`);
    const t1id = Number(sql(`select id from "User" where "employeeCode"='T001'`));
    const t2id = Number(sql(`select id from "User" where "employeeCode"='${T2}'`));
    // แผนงานวันนัดของใบ G: ทีมของสาขา วันข้างหน้า 20 วัน (ไม่ชนแผนจริงของวันนี้) — คนที่ 1 = ${T2} · คนที่ 2 = T001
    sql(`update "WorkOrder" set "assignedTeam"='${team}', "scheduledAt"='${planDay}' where id=${G.id}`);
    const planRes = await call(S, "PUT", "plans", { date: planDay, team, memberIds: [t2id, t1id] });
    if (!planRes || planRes.error) throw new Error(`บันทึกแผนงานไม่สำเร็จ: ${JSON.stringify(planRes).slice(0, 200)}`);
    mach = sql(`select "machineId" from "WorkOrder" where id=${P.id}`);
    oldCap = sql(`select coalesce("capacityKg"::text,'null') from "Machine" where id=${mach}`);
    sql(`update "Machine" set "capacityKg"=25 where id=${mach}`);
    // อะไหล่ที่ค้นในฟอร์มต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ P (fxPart) — "ตัวแรกตาม id" ไม่รู้ว่าเครื่องยี่ห้ออะไร
    // part = [รหัส, id] · ข้อที่ทดสอบ (ช่องจำนวน) ไม่ขึ้นกับว่าเป็นตัวไหน
    const pid = fxPart(P.id, "BOARD");
    const part = [sql(`select "partCode" from "SparePart" where id=${pid}`), String(pid)];
    const partName = sql(`select name from "SparePart" where id=${pid}`);
    // ไฟล์ยี่ห้อของตัวแฝด (seed:test ให้แต่ละตัวอยู่ไฟล์ของตัวเองไฟล์เดียว) = ไฟล์ของเครื่องใบ P — ช่องค้นบอกชื่อไฟล์นี้ (ก้อน 5)
    const file = sql(`select string_agg(file, ',') from "SparePartBrandFile" where "sparePartId"=${pid}`);

    const page = await (await browser.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(4000);
    const open = async (code) => {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await vis("ใบงานซ่อม").first().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await vis(code).last().click();
      await page.waitForTimeout(3500);
    };

    // ── 2) ขนาดเครื่อง + 1) จำนวนอะไหล่ ──
    await open(P.code);
    const mcode = sql(`select code from "Machine" where id=${mach}`);
    (await vis(`เครื่อง ${mcode} · 25 กก.`).count()) ? pass(`หัวใบงานขึ้น เครื่อง ${mcode} · 25 กก.`) : fail("หัวใบงานไม่มีขนาดเครื่อง");
    await vis("ระบุอะไหล่").first().click();
    await page.waitForTimeout(1200);
    await vis("ใช้อะไหล่").first().click();
    await page.waitForTimeout(1200);
    // ใบที่มีเครื่อง = ช่องเลือกล็อกตามไฟล์ยี่ห้อ (เลือกอะไหล่ตามไฟล์ยี่ห้อ ก้อน 5): หัวช่องบอกไฟล์ · ช่องค้นค้นในไฟล์นั้น
    (await vis(`อะไหล่จากไฟล์ ${file}`, false).count()) > 0
      ? pass(`ช่องอะไหล่บอกว่าเลือกจากไฟล์ ${file} (ยี่ห้อเครื่องของใบ)`)
      : fail(`ไม่มีหัว "อะไหล่จากไฟล์ ${file}"`);
    await page.getByPlaceholder(`ค้นหาในไฟล์ ${file}`).locator("visible=true").first().fill(part[0]);
    await page.waitForTimeout(1800);
    // กดแถวผลค้นด้วยป้าย "เพิ่ม {รหัส} {ชื่อ}" — กลุ่ม "ของใช้ร่วม (ไฟล์ Other)" มีตัวแฝด -OT ที่ชื่อขึ้นต้นเหมือนกัน
    // หาด้วยชื่อหลวม ๆ จะได้ตัวผิด (§8 ก้อน 5)
    await label(`เพิ่ม ${part[0]} ${partName}`).first().click();
    await page.waitForTimeout(600);
    const qty = label(`จำนวน ${part[0]}`);
    await qty.click();
    await page.keyboard.press("Backspace");
    await page.keyboard.type("8");
    await page.waitForTimeout(300);
    (await qty.inputValue()) === "8" ? pass("ลบเลขเดิมแล้วพิมพ์ 8 ได้ 8 (เดิมเด้งเป็น 18)") : fail(`ช่องจำนวน = ${await qty.inputValue()}`);
    await label(`เพิ่มจำนวน ${part[0]}`).click();
    await page.waitForTimeout(300);
    (await qty.inputValue()) === "9" ? pass("กด + แล้วเป็น 9") : fail(`กด + แล้ว = ${await qty.inputValue()}`);
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(3500);
    const q = sql(`select coalesce(max(quantity)::text,'-') from "WorkOrderPart" where "workOrderId"=${P.id} and "sparePartId"=${part[1]} and kind='WAITING'`);
    q === "9" ? pass("บันทึกแล้วฐานข้อมูลได้ 9 ชิ้น") : fail(`ฐานข้อมูลได้ ${q}`);

    // ── 3) ใบงาน SUB ──
    await open(B.code);
    await vis("บันทึกผลงาน SUB").first().click();
    await page.waitForTimeout(2000);
    (await label("ทีม SUB ที่เข้าทำ").count()) && (await label("ทีม SUB ที่เข้าทำ").first().textContent()).includes(os)
      ? pass(`ฟอร์มบันทึกผลงาน SUB มีช่องทีม SUB เลือก ${os} ไว้ให้`) : fail("ไม่มีช่องทีม SUB / ไม่ได้เลือกไว้");
    (await label("ผู้เข้าปฏิบัติงานคนที่ 1").count()) === 0 ? pass("ไม่มีช่องช่างบริษัทคนที่ 1–3 (เปิดได้ถ้ามีช่างไปด้วย)") : fail("ยังมีช่องช่างบริษัท");
    await label("มีช่างบริษัทไปด้วย").click();
    await page.waitForTimeout(400);
    (await label("ผู้เข้าปฏิบัติงานคนที่ 1").count()) ? pass("ติ๊กมีช่างบริษัทไปด้วย ช่องคนที่ 1 โผล่") : fail("ติ๊กแล้วไม่มีช่อง");

    // ── 4) ช่างเข้าดำเนินการแก้ไขเรียบร้อย ──
    await open(F.code);
    await label("ปิดใบงาน").click();
    await page.waitForTimeout(1000);
    await label("เหตุผล ช่างเข้าดำเนินการแก้ไขเรียบร้อย").click();
    await page.waitForTimeout(500);
    (await vis("ช่างเข้าซ่อมเสร็จแล้ว แต่ไม่ได้ปิดในระบบ · นับเป็นงานซ่อมเสร็จ").count())
      ? pass("เลือกช่างแก้ไขเรียบร้อย: หัวฟอร์มบอกว่านับเป็นงานซ่อมเสร็จ") : fail("หัวฟอร์มไม่เปลี่ยน");
    // ใบไม่มีแผนงานวันนั้น — ไม่มีอะไรเติม · ช่องสามช่อง · รายชื่อเริ่มที่ทีมของใบนี้ (ทีมประจำสาขา)
    await page.waitForTimeout(1500);
    const slots = await Promise.all([1, 2, 3].map((n) => label(`ช่างที่เข้าซ่อมคนที่ ${n}`).count()));
    slots.every((c) => c > 0) && (await vis("ใบนี้ไม่มีแผนงานวันนั้น — เลือกจากรายชื่อ (ทีมของใบนี้และทีมที่คุณดูแลอยู่บนสุด)").count()) > 0
      ? pass("ช่างที่เข้าซ่อมมีสามช่อง (คนที่ 1–3) · ใบไม่มีแผนงานบอกให้เลือกจากรายชื่อ")
      : fail(`ช่องช่าง: ${slots.join("/")}`);
    const tname = sql(`select name from "User" where "employeeCode"='T001'`);
    const t2name = sql(`select name from "User" where "employeeCode"='${T2}'`);
    await label("ช่างที่เข้าซ่อมคนที่ 1").click();
    await page.waitForTimeout(500);
    (await vis(`ทีม${team} (ทีมของใบนี้)`).count()) > 0
      ? pass(`รายชื่อช่างขึ้นกลุ่ม "ทีม${team} (ทีมของใบนี้)" ก่อน`)
      : fail("ไม่มีกลุ่มทีมของใบนี้ในรายชื่อ");
    await vis(tname).last().click();
    await page.waitForTimeout(400);
    await label("ช่างที่เข้าซ่อมคนที่ 2").click();
    await page.waitForTimeout(500);
    await vis(t2name).last().click();
    await page.waitForTimeout(400);
    await label("รายละเอียดที่ปิดใบงาน").fill("เปลี่ยนบอร์ดแล้ว ทดสอบปกติครบรอบ");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label("เลือกรูปหลังซ่อม").click()]);
    await chooser.setFiles(PHOTO);
    await page.waitForTimeout(3000);
    await label("ยืนยันปิดใบงาน").click();
    await page.waitForTimeout(5000);
    const done = sql(`select status||'|'||"closeResult" from "WorkOrder" where id=${F.id}`);
    const after = sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${F.id} and role='AFTER'`);
    const worker = sql(`select string_agg(u."employeeCode", ',' order by u."employeeCode") from "WorkOrderWorker" w join "User" u on u.id=w."userId" where w."workOrderId"=${F.id}`);
    done === "DONE|FIXED" && after === "1" && worker === ["T001", T2].sort().join(",")
      ? pass("ฐานข้อมูล: ปิดเป็นซ่อมเสร็จ (FIXED) มีรูปหลังซ่อม บันทึกช่างสองคนที่เลือก (T001 + คนที่สอง)") : fail(`ปิด: ${done} รูป ${after} ช่าง ${worker}`);

    // ── 4b) มีแผนงานวันนัด — เติมคนที่ 1–2 ตามแผนให้เอง ไม่ต้องพิมพ์ ──
    await open(G.code);
    await label("ปิดใบงาน").click();
    await page.waitForTimeout(1000);
    await label("เหตุผล ช่างเข้าดำเนินการแก้ไขเรียบร้อย").click();
    await page.waitForTimeout(2000);
    const s1 = ((await label("ช่างที่เข้าซ่อมคนที่ 1").first().textContent().catch(() => "")) ?? "");
    const s2 = ((await label("ช่างที่เข้าซ่อมคนที่ 2").first().textContent().catch(() => "")) ?? "");
    const s3 = ((await label("ช่างที่เข้าซ่อมคนที่ 3").first().textContent().catch(() => "")) ?? "");
    s1.includes(t2name) && s2.includes(tname) && s3.includes("ไม่มี") &&
      (await vis(`เติมจากแผนงานของทีม${team}วันนัดแล้ว — ตรวจว่าตรงคนที่ไปจริง แก้ได้`).count()) > 0
      ? pass("ใบที่มีแผนงาน: คนที่ 1–2 เติมตามลำดับในแผนให้เอง คนที่ 3 ว่าง · บอกว่าเติมจากแผนงาน")
      : fail(`เติมจากแผน: 1="${s1}" 2="${s2}" 3="${s3}"`);
    await page.screenshot({ path: path.join(__dirname, "round2-4b-plan-crew.png") });
    await label("ยกเลิก").last().click().catch(() => {});
    sql(`select 1`) === "1" && sql(`select count(*) from "WorkOrderWorker" where "workOrderId"=${G.id}`) === "0"
      ? pass("เปิดฟอร์มแล้วยกเลิก ไม่มีอะไรบันทึก (ฐานข้อมูลไม่มีช่างของใบ G)")
      : fail("เปิดฟอร์มแล้วมีการบันทึกช่าง");
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    // แผนที่มีช่างคนที่สองอยู่ = แผนของเทสต์นี้เท่านั้น (ลบแผน สมาชิกหายตาม) — ต้องลบก่อนผู้ใช้ ไม่งั้นติด FK
    sql(`delete from "TeamDayPlan" where id in (select "planId" from "TeamDayPlanMember" where "userId" in (select id from "User" where "employeeCode"='${T2}'));
         delete from "User" where "employeeCode"='${T2}'`);
    sql(`select count(*) from "User" where "employeeCode"='${T2}'`) === "0" ? pass("ลบช่างคนที่สองและแผนงานทดสอบแล้ว (ฐานข้อมูล)") : fail("ช่างทดสอบคนที่สองยังค้าง");
    sql(`delete from "OutsourceTeam" where name='${os}'`);
    if (mach) sql(`update "Machine" set "capacityKg"=${oldCap} where id=${mach}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    await browser.close();
  }
})();
