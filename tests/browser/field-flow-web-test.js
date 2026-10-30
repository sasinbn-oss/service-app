// ทดสอบ: สามเรื่องที่เจ้าของงานเลือก ต.ค. 69 (หลังเทียบกับ Salesforce Field Service)
//   1) ช่าง: เปิดแอปมาเจอ "งานของฉัน" · กด ถึงหน้างาน (พิกัดจริงจากเบราว์เซอร์) → ปุ่มเปลี่ยนเป็น ปิดงาน → กดแล้วเปิดฟอร์มปิดงานเลย
//   2) หัวหน้าภาค: ลูกค้าขอเปลี่ยนวัน → กล่องงานขึ้น "คอนเฟิร์มวันใหม่" · เลือก ทีมไม่ว่าง ใส่เหตุผล ส่งกลับ → แอดมินเห็นกล่องเหตุผล
//   3) ใบงาน SUB: กล่องอธิบาย + ปุ่มคัดลอกข้อมูลส่งทีม · ปุ่ม "บันทึกผลงาน SUB" เปิดฟอร์มชื่อเดียวกัน · แอดมินกรองชิป ใบงาน SUB ได้
// ยืนยันผลที่ฐานข้อมูล · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const API = "http://localhost:4000/api";
const call = async (token, method, path, body) => {
  const r = await fetch(`${API}/${path}`, {
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
  const oldTeam = sql(`select coalesce(team,'') from "User" where "employeeCode"='T001'`);
  const team = sql(`select zone from "Branch" where code='C0006'`);
  const [lat, lng] = sql(`select latitude||'|'||longitude from "Branch" where code='C0006'`).split("|").map(Number);
  const checkin0 = Number(sql(`select coalesce(max(id),0) from "BranchCheckIn"`));
  const os = `ZZOS${Date.now() % 100000}`;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 31 * 3600e3).toISOString().slice(0, 10);
  const ids = [];
  const A = await login("A001");
  const page = async (who, width = 1300) => {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 }, geolocation: { latitude: lat, longitude: lng }, permissions: ["geolocation"] });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${who}: ${e}`));
    await p.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await p.getByPlaceholder("รหัสพนักงาน").fill(who);
    await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
    await p.waitForTimeout(4000);
    return p;
  };
  const vis = (p, t, exact = true) => p.getByText(t, { exact }).locator("visible=true");
  const label = (p, l) => p.locator(`[aria-label="${l}"]`).locator("visible=true");
  const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
  const openOrder = async (p, code) => {
    // เริ่มจากหน้าแรกทุกครั้ง — ใบงานที่เปิดค้างอยู่ทับเมนูข้าง
    await p.goto("http://localhost:8081", { waitUntil: "networkidle" });
    await p.waitForTimeout(3000);
    await vis(p, "ใบงานซ่อม").first().click();
    await p.waitForTimeout(2500);
    await p.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await p.waitForTimeout(2500);
    await vis(p, code).last().click();
    await p.waitForTimeout(3500);
  };
  try {
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    sql(`update "User" set team='${team}' where "employeeCode"='T001'`);
    const S = await login("S001");
    await call(A, "POST", "teams/outsource", { name: os });
    const mk = async (n) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: `W9${n}`, symptom: "ทดสอบหน้างาน" }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      ids.push(id);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    // ใบ 1: ปล่อยงานให้ทีม T001 วันนี้ · ใบ 2: ลูกค้าขอเปลี่ยนวัน · ใบ 3: ใบงาน SUB ทีมเข้างานอยู่
    const J = await mk(1);
    await call(S, "POST", `work-orders/${J.id}/parts`, { needsParts: false, assign: { team, scheduledAt: today, scheduledTime: "09:30" } });
    await call(A, "POST", `work-orders/${J.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${J.id}/dispatch`, {});
    const R = await mk(2);
    await call(S, "POST", `work-orders/${R.id}/parts`, { needsParts: false, assign: { team, scheduledAt: today } });
    await call(A, "POST", `work-orders/${R.id}/confirm-appointment`, { scheduledAt: tomorrow, note: "ร้านปิดวันนี้" });
    const B = await mk(3);
    await call(S, "POST", `work-orders/${B.id}/parts`, { needsParts: false, assign: { team: os, scheduledAt: today } });
    await call(A, "POST", `work-orders/${B.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${B.id}/dispatch`, {});
    const ready = [J, R, B].map((x) => st(x.id)).join(",");
    ready === "IN_PROGRESS,ASSIGNED,IN_PROGRESS" ? pass("เตรียมใบ (ฐานข้อมูล): ช่างเข้างาน · รอคอนเฟิร์มวันใหม่ · SUB เข้างาน") : fail(`เตรียม: ${ready}`);

    // ── 1) ช่าง ──
    const t = await page("T001", 420);
    (await vis(t, "งานของฉัน").count()) && (await vis(t, J.code, false).count())
      ? pass("ช่างเปิดแอปมาเจอ งานของฉัน และเห็นใบที่ปล่อยให้ทีม") : fail("ช่างไม่ได้เริ่มที่งานของฉัน");
    (await vis(t, R.code, false).count()) === 0 ? pass("ใบที่ยังไม่ปล่อยงานไม่ขึ้นให้ช่าง") : fail("ใบยังไม่ปล่อยขึ้นให้ช่าง");
    // แถบขั้นตอนแบบใหม่ใช้ชื่อสั้น "เบิกอะไหล่" (ต.ค. 69 รอบสอง) — เช็คทั้งสองชื่อ ไม่งั้นข้อนี้ผ่านเองแม้แถบโผล่
    (await vis(t, "เบิกอะไหล่ (คลัง 94)").count()) === 0 && (await vis(t, "เบิกอะไหล่").count()) === 0 && (await t.locator('[aria-label="ขั้นตอนงาน"]').count()) === 0
      ? pass("ไม่เห็นขั้นของแอดมิน/หัวหน้าภาค") : fail("ช่างเห็นแถบขั้นตอน");
    const card = t.locator(`[aria-label="งาน ${J.code}"]`).locator("visible=true");
    await card.locator('[aria-label="ถึงหน้างาน"]').click();
    await t.waitForTimeout(4000);
    const arrived = sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${J.id} and action='ARRIVED'`);
    const ci = sql(`select coalesce(string_agg("withinRadius"::text, ','),'') from "BranchCheckIn" where id>${checkin0}`);
    arrived === "1" && ci === "true" && st(J.id) === "IN_PROGRESS"
      ? pass("กดถึงหน้างาน: ฐานข้อมูลบันทึกเวลา + รายงานตัวในรัศมี (พิกัดจากเบราว์เซอร์) ใบยังเข้างานอยู่") : fail(`ถึงหน้างาน: log=${arrived} checkin=${ci}`);
    (await card.locator('[aria-label="ปิดงาน"]').count()) ? pass("ปุ่มเปลี่ยนเป็น ปิดงาน") : fail("ปุ่มไม่เปลี่ยน");
    await t.screenshot({ path: __dirname + "/field-myjobs.png" });
    await card.locator('[aria-label="ปิดงาน"]').click();
    await t.waitForTimeout(4000);
    (await vis(t, `ปิดงาน ${J.code}`, false).count()) ? pass("กดปิดงานแล้วเปิดฟอร์มปิดงานของใบนั้นเลย") : fail("ไม่เปิดฟอร์มปิดงาน");

    // ── 2) หัวหน้าภาค: คอนเฟิร์มวันใหม่ ──
    const s = await page("S001");
    await vis(s, "กล่องงานของฉัน").first().click();
    await s.waitForTimeout(3500);
    await s.locator('[aria-label^="แท็บ จ่ายงาน/ปล่อยงาน"]').first().click();
    await s.waitForTimeout(1500);
    (await vis(s, "หัวหน้าภาค · คอนเฟิร์มวันใหม่").count()) ? pass("กล่องงานขึ้นป้าย คอนเฟิร์มวันใหม่ (แยกจากรับทราบปล่อยงาน)") : fail("ไม่มีป้ายคอนเฟิร์มวันใหม่");
    await openOrder(s, R.code);
    await vis(s, "คอนเฟิร์มวันใหม่").first().click();
    await s.waitForTimeout(1500);
    await label(s, "ทีมไม่ว่าง ส่งกลับแอดมิน").click();
    await s.waitForTimeout(500);
    (await label(s, "ทีมที่จะรับงาน").count()) === 0 ? pass("เลือกทีมไม่ว่าง: ช่องเลือกทีมหาย เหลือช่องเหตุผล") : fail("ยังมีช่องเลือกทีม");
    await label(s, "บันทึกเพิ่มเติม").fill("ทีมเต็มวันพรุ่งนี้");
    await vis(s, "ส่งกลับให้แอดมินนัดใหม่").click();
    await s.waitForTimeout(3500);
    st(R.id) === "AWAITING_CONFIRM" && sql(`select action from "WorkOrderLog" where "workOrderId"=${R.id} order by id desc limit 1`) === "NEW_DATE_DECLINED"
      ? pass("ส่งกลับแล้ว: ฐานข้อมูลกลับขั้นคอนเฟิร์มลูกค้า พร้อมประวัติ") : fail(`ส่งกลับ: ${st(R.id)}`);

    // ── 3) ใบงาน SUB ──
    await openOrder(s, B.code);
    (await label(s, `ใบงาน SUB ทีม ${os}`).count()) && (await vis(s, `คัดลอกข้อมูลส่งทีม ${os}`).count())
      ? pass("ใบงาน SUB: กล่องอธิบาย + ปุ่มคัดลอกข้อมูลส่งทีม") : fail("ไม่มีกล่องใบงาน SUB");
    await vis(s, "บันทึกผลงาน SUB").first().click();
    await s.waitForTimeout(2000);
    (await vis(s, `บันทึกผลงาน SUB ${B.code}`, false).count()) ? pass("ปุ่ม บันทึกผลงาน SUB เปิดฟอร์มชื่อเดียวกัน") : fail("ฟอร์มไม่ใช่บันทึกผลงาน SUB");

    const a = await page("A001");
    await openOrder(a, R.code);
    (await label(a, "กล่องหัวหน้าภาคส่งกลับนัดใหม่").count()) && (await vis(a, "ทีมเต็มวันพรุ่งนี้", false).count())
      ? pass("แอดมินเห็นกล่อง หัวหน้าภาคส่งกลับ พร้อมเหตุผล") : fail("แอดมินไม่เห็นเหตุผล");
    await a.goto("http://localhost:8081", { waitUntil: "networkidle" });
    await a.waitForTimeout(3000);
    await vis(a, "ใบงานซ่อม").first().click();
    await a.waitForTimeout(3500);
    // ตัวกรองแบบใหม่ (ต.ค. 69): จอคอมเป็นปุ่ม "ทีม ▾" · จอแคบอยู่ในหน้าต่างตัวกรอง
    if (await label(a, "เลือก ทีม").count()) {
      await label(a, "เลือก ทีม").first().click();
      await a.waitForTimeout(500);
      await label(a, "ตัวกรอง ใบงาน SUB").last().click();
    } else {
      await label(a, "เปิดตัวกรอง").first().click();
      await a.waitForTimeout(1000);
      await label(a, "ตัวกรอง ใบงาน SUB").last().click();
      await a.waitForTimeout(500);
      await a.locator('[aria-label^="ดู "]').locator("visible=true").last().click();
    }
    await a.waitForTimeout(1500);
    (await vis(a, B.code).count()) && (await vis(a, J.code).count()) === 0
      ? pass("แอดมินกรอง ใบงาน SUB: เห็นใบ SUB ไม่เห็นใบทีมปกติ") : fail("ชิป ใบงาน SUB กรองไม่ถูก");
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    sql(`delete from "OutsourceTeam" where name='${os}'`);
    sql(`delete from "BranchCheckIn" where id>${checkin0}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    sql(`update "User" set team=nullif('${oldTeam}','') where "employeeCode"='T001'`);
    await browser.close();
  }
})();
