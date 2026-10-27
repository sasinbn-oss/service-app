// ทดสอบ: กล่องงานหัวหน้าภาคแยกแท็บ + ทีม outsource แสดงชื่อปกติแต่แยกกลุ่ม (เจ้าของงานขอ ต.ค. 69)
//   · แท็บ งานแจ้งซ่อม / จ่ายงาน/ปล่อยงาน / ใบงาน SUB (ทีม outsource) — ใบแต่ละแบบอยู่แท็บของตัวเอง ไม่ปนกัน
//   · ใบงาน SUB ที่ทีมเข้างานค้างเกิน 2 วัน ขึ้นแดง "ตามผลงาน SUB จากทีม"
//   · ช่องเลือกทีมตอนจ่ายงาน: หัวข้อ "ทีมช่าง" กับ "ทีม outsource" แยกกัน ชื่อทีมไม่มีป้ายต่อท้าย
// ต้องมี DATABASE_URL
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
  const oldS = sql(`select coalesce(region,'')||'|'||coalesce(array_to_string("supervisedTeams",','),'') from "User" where "employeeCode"='S001'`);
  const region = sql(`select region from "Branch" where code='C0006'`);
  const os = `ZZOS${Date.now() % 100000}`;
  const ids = [];
  const A = await login("A001");
  try {
    sql(`update "User" set region='${region}', "supervisedTeams"='{}' where "employeeCode"='S001'`);
    const S = await login("S001");
    await call(A, "POST", "teams/outsource", { name: os });
    const mk = async (n) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: `W7${n}`, symptom: "ทดสอบแท็บกล่องงาน" }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      ids.push(id);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    const R = await mk(1); // ใบแจ้งซ่อมใหม่ (NEW)
    const D = await mk(2); // รอจ่ายงาน ทีมปกติ
    await call(S, "POST", `work-orders/${D.id}/parts`, { needsParts: false });
    const O = await mk(3); // ทีม outsource เข้างานอยู่
    await call(S, "POST", `work-orders/${O.id}/parts`, { needsParts: false, assign: { team: os, scheduledAt: "2026-12-03" } });
    await call(A, "POST", `work-orders/${O.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${O.id}/dispatch`, {});
    // ย้อนเวลาเข้าขั้นไป 3 วัน — ค้างเกินกำหนด
    sql(`update "WorkOrderLog" set "createdAt"=now() - interval '3 days' where "workOrderId"=${O.id}`);
    const st = sql(`select string_agg(status||':'||coalesce("assignedTeam",'-'), ',' order by id) from "WorkOrder" where id in (${R.id},${D.id},${O.id})`);
    st === `NEW:-,PARTS_CHECKED:-,IN_PROGRESS:${os}` ? pass("เตรียมใบสามแบบ (ฐานข้อมูล): ใหม่ · รอจ่ายงาน · outsource เข้างาน") : fail(`เตรียมข้อมูล: ${st}`);

    const page = await (await browser.newContext({ viewport: { width: 1300, height: 1100 } })).newPage();
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เทสต์นี้กดรายการในกลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label^="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("กล่องงานของฉัน").first().click();
    await page.waitForTimeout(3500);

    const has = async (code) => (await vis(code).count()) > 0;
    const tab = async (name) => {
      await label(`แท็บ ${name}`).first().click();
      await page.waitForTimeout(1200);
    };
    (await label("แท็บ งานแจ้งซ่อม").count()) && (await label("แท็บ จ่ายงาน/ปล่อยงาน").count()) && (await label("แท็บ ใบงาน SUB").count())
      ? pass("กล่องงานหัวหน้าภาคมีสามแท็บ") : fail("ไม่เห็นแท็บ");
    await tab("งานแจ้งซ่อม");
    (await has(R.code)) && !(await has(D.code)) && !(await has(O.code))
      ? pass("แท็บงานแจ้งซ่อม: เห็นแต่ใบใหม่") : fail(`แท็บงานแจ้งซ่อม ${[R, D, O].map((x) => x.code)}`);
    await tab("จ่ายงาน/ปล่อยงาน");
    (await has(D.code)) && !(await has(R.code)) && !(await has(O.code))
      ? pass("แท็บจ่ายงาน/ปล่อยงาน: เห็นแต่ใบรอจ่ายงานทีมปกติ") : fail("แท็บจ่ายงานปนใบอื่น");
    await tab("ใบงาน SUB");
    (await has(O.code)) && !(await has(R.code)) && !(await has(D.code))
      ? pass("แท็บทีม outsource: เห็นแต่ใบทีม outsource") : fail("แท็บ outsource ปนใบอื่น");
    (await vis("ตามผลงาน SUB จากทีม", false).count())
      ? pass("ค้างเกิน 2 วัน ขึ้นเตือนให้ตามทีม outsource ปิดงาน") : fail("ไม่มีเตือนค้างเกินกำหนด");
    const n = await label("แท็บ ใบงาน SUB").first().getAttribute("aria-label");
    const want = sql(`select count(*) from "WorkOrder" w where w."assignedTeam" in (select name from "OutsourceTeam") and w.status in ('ASSIGNED','IN_PROGRESS') and w."branchId" in (select id from "Branch" where region='${region}')`);
    n === `แท็บ ใบงาน SUB ${want} ใบ` ? pass(`ตัวเลขบนแท็บตรงกับฐานข้อมูล (${want})`) : fail(`ตัวเลขแท็บ ${n} · ฐานข้อมูล ${want}`);
    // ตัวเลขต้องไม่ขัดกัน: หัวข้อ = ผลรวมทุกแท็บ = ชิปกล่องงาน · แถวสาขานับตามแท็บ · ไม่มีแถว "รอใคร"
    const tabN = async (name) => Number((await label(`แท็บ ${name}`).first().getAttribute("aria-label")).match(/(\d+) ใบ$/)[1]);
    const total = (await tabN("งานแจ้งซ่อม")) + (await tabN("จ่ายงาน/ปล่อยงาน")) + (await tabN("ใบงาน SUB"));
    (await vis(`${total} ใบ`).count()) && (await label(`กล่องงานของฉัน ${total} ใบ`).count())
      ? pass(`หัวข้อบอก ${total} ใบ เท่ากับผลรวมแท็บและชิปกล่องงาน`) : fail(`หัวข้อ/ชิปไม่ตรงผลรวมแท็บ ${total}`);
    (await vis("ทุกคน").count()) === 0 ? pass("กล่องงานหัวหน้าภาคไม่มีแถว รอใคร (ไม่มีปุ่ม ทุกคน)") : fail("ยังมีแถว รอใคร");
    await page.screenshot({ path: __dirname + "/sup-inbox-tabs-list.png" });

    // ช่องเลือกทีมตอนจ่ายงาน
    await tab("จ่ายงาน/ปล่อยงาน");
    await vis(D.code).first().click();
    await page.waitForTimeout(3500);
    await vis("จ่ายงานให้ทีม").last().click();
    await page.waitForTimeout(1500);
    await label("ทีมที่จะรับงาน").first().click();
    await page.waitForTimeout(800);
    // หัวหน้าภาค: กลุ่มแรกคือ "ทีมที่คุณดูแล" (ทีมของคนอื่นอยู่กลุ่ม "ทีมนอกความดูแล" ถัดไป — จ่ายข้ามทีมได้ ต.ค. 69)
    const own = vis("ทีมที่คุณดูแล"), out = vis("ทีม outsource · หัวหน้าภาคปิดงานแทน"), osRow = vis(os);
    if ((await own.count()) && (await out.count()) && (await osRow.count())) {
      const y = async (l) => (await l.first().boundingBox()).y;
      (await y(own)) < (await y(out)) && (await y(out)) < (await y(osRow))
        ? pass("ช่องเลือกทีม: ทีมที่คุณดูแลก่อน แล้วหัวข้อทีม outsource แยกท้าย · ชื่อทีมไม่มีป้ายต่อท้าย")
        : fail("ลำดับกลุ่มไม่ถูก");
    } else fail(`ไม่เห็นหัวข้อกลุ่ม/ชื่อทีม ${os}`);
    (await vis(`${os} · outsource`).count()) === 0 ? pass("ไม่มีชื่อแบบ “· outsource” ต่อท้ายแล้ว") : fail("ยังมีป้ายต่อท้ายชื่อ");
    await page.screenshot({ path: __dirname + "/sup-inbox-tabs.png" });
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    sql(`delete from "OutsourceTeam" where name='${os}'`);
    const [r, t] = oldS.split("|");
    sql(`update "User" set region=nullif('${r}',''), "supervisedTeams"=string_to_array(nullif('${t}',''),',') where "employeeCode"='S001'`);
    await browser.close();
  }
})();
