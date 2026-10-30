// ทดสอบ: Senior ช่าง ผ่านหน้าเว็บ (เจ้าของงานขอ ต.ค. 69 · สิทธิ์เท่าช่าง แต่เลือกได้หลายทีมช่างและหลายทีมรวม)
//   · การ์ดสิทธิ์ผู้ใช้: ชิป "Senior ช่าง" · ช่าง → Senior คงทีมเดิม · แถวทีมช่าง/ทีมรวมเลือกได้หลายอัน กดเพิ่ม = ต่อท้าย
//     (ฐานข้อมูล team + extraTeams) · คำขอส่ง team (ทีมแรก) คู่กับ teams — เซิร์ฟเวอร์รุ่นเก่าช่วง deploy อ่านแค่ team
//     · บรรทัด "เห็นใบงานของ …" = ทีม + ทุกทีมที่ทีมรวมครอบคลุม · กดซ้ำเอาออก ตัวถัดไปขึ้นเป็นทีมแรก · เปิดหน้าใหม่ชิปยังติด
//     · Senior หลายทีม → ช่าง ถามก่อนว่าจะเหลือทีมไหน (ยกเลิก = ไม่เปลี่ยน)
//   · หน้าต่างเพิ่มบัญชี: เลือก Senior ช่าง + ทีม + ทีมรวม → ฐานข้อมูลเก็บครบ
//   · Senior เข้าแอปเอง (มือถือ): มาที่ "งานของฉัน" แบบช่าง (role ดิบ SENIOR_TECH ถูกมองเป็นช่าง) · เห็นงานของสองทีม
//     (ทีมตัวเอง + ทีมที่ทีมรวมครอบคลุม) พร้อมป้าย "ทีม…" · ไม่เห็นงานทีมอื่น · กดถึงหน้างานงานของทีมที่ได้ผ่านทีมรวม → ฐานข้อมูลบันทึก
//   · บอร์ดแผนงาน: Senior ในแถวทีมมีป้าย "Senior" · หน้าต่างลบทีม: Senior ที่ถือทีมนี้ทีมเดียวนับเป็น "จะไม่มีสังกัด"
//     Senior ที่ถือทีมอื่นด้วยนับเป็น "ทีมอื่นที่เลือกไว้ยังอยู่"
// ทีม/ทีมรวม/สาขาชั่วคราวชื่อไม่ซ้ำของจริง — ไม่แตะทีมที่เทสต์อื่นใช้ · สร้างผู้ใช้เองแล้วลบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const API = "http://localhost:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (method, url, token, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.status === 204 ? null : r.json();
};

const SUF = String(Math.floor(Math.random() * 1e5));
// ชื่อทีมไม่ขึ้นต้นด้วย "ทีม" — การ์ดงานเติมคำว่า "ทีม" ให้เอง (แบบชื่อทีมจริง กรุงเทพ/กระบี่)
const TX = `เว็บก${SUF}`, TY = `เว็บข${SUF}`, TZ = `เว็บค${SUF}`, TW = `เว็บง${SUF}`, TG = `รวมเว็บ${SUF}`;
const TECH = `zsw${SUF}`, TECH_NAME = `ช่างจะเป็นซีเนียร์${SUF}`;
const NEW = `zsn${SUF}`, NEW_NAME = `ซีเนียร์ใหม่เว็บ${SUF}`;
// Senior ที่ถือทีม ง ทีมเดียว — ลบทีม ง แล้วไม่เหลือทีม หน้าต่างลบทีมต้องนับเป็น "จะไม่มีสังกัด"
const SOLE = `zso${SUF}`, SOLE_NAME = `ซีเนียร์ทีมเดียว${SUF}`;
const LAT = 13.7563, LNG = 100.5018;
const db = (code) => sql(`select role||'|'||coalesce(team,'-')||'|'||array_to_string("extraTeams",',') from "User" where "employeeCode"='${code}'`);
// คำขอบันทึกผู้ใช้ที่หน้าจอส่งจริง — ไว้เช็คว่ามี team (ทีมแรก) คู่กับ teams
const sent = [];
const lastSent = (method) => [...sent].reverse().find((x) => x.method === method && x.body && "teams" in x.body)?.body;
const branches = `select id from "Branch" where code like 'ZSB_${SUF}'`;
const users = `select id from "User" where "employeeCode" in ('${TECH}','${NEW}','${SOLE}')`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const admin = (await call("POST", "/auth/login", null, { employeeCode: "A001", password: "test1234" })).token;
  const orders = [];
  async function cleanup() {
    for (const id of sql(`select id from "WorkOrder" where "branchId" in (${branches}) order by id desc`).split("\n").filter(Boolean)) {
      await call("DELETE", `/work-orders/${id}`, admin).catch(() => {});
    }
    sql(`delete from "BranchCheckIn" where "userId" in (${users});
         delete from "ViewAsLog" where "targetUserId" in (${users});
         delete from "UsageSlot" where "userId" in (${users});
         delete from "TeamDayPlan" where team in ('${TX}','${TY}','${TZ}','${TW}','${TG}');
         delete from "User" where id in (${users});
         delete from "TeamGroup" where name='${TG}';
         delete from "Machine" where "branchId" in (${branches});
         delete from "Branch" where code like 'ZSB_${SUF}'`);
  }

  async function open(who = "A001", pw = "test1234", width = 1400, height = 1100) {
    const ctx = await browser.newContext({ viewport: { width, height }, geolocation: { latitude: LAT, longitude: LNG }, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — สิทธิ์ผู้ใช้อยู่กลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (/\/api\/auth\/users/.test(r.url()) && ["PATCH", "POST"].includes(r.method())) {
        try { sent.push({ method: r.method(), body: r.postDataJSON() }); } catch { /* ไม่มี body */ }
      }
    });
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(who);
    await page.getByPlaceholder("รหัสผ่าน").fill(pw);
    await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
    await page.waitForTimeout(4000);
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const byLabel = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    // ปุ่มติดอยู่ไหม — อ่านจาก aria-selected ไม่อ่านสี
    const sel = async (loc) => loc.evaluate((el) => el.closest("[aria-selected]")?.getAttribute("aria-selected") ?? "none");
    return { page, vis, byLabel, sel };
  }
  async function toUsers(page, vis, q) {
    await vis("สิทธิ์ผู้ใช้").first().click();
    await page.waitForTimeout(2500);
    await page.getByLabel("ค้นหาผู้ใช้").locator("visible=true").first().fill(q);
    await page.waitForTimeout(700);
  }

  try {
    sql(`insert into "Branch"(code,name,zone,"pmTeam",latitude,longitude) values
      ('ZSBX${SUF}','สาขาเว็บ Senior ก${SUF}','${TX}','${TX}',${LAT},${LNG}),
      ('ZSBY${SUF}','สาขาเว็บ Senior ข${SUF}','${TY}','${TY}',${LAT},${LNG}),
      ('ZSBZ${SUF}','สาขาเว็บ Senior ค${SUF}','${TZ}','${TZ}',${LAT},${LNG}),
      ('ZSBW${SUF}','สาขาเว็บ Senior ง${SUF}','${TW}','${TW}',${LAT},${LNG})`);
    await call("POST", "/teams/groups", admin, { name: TG, covers: [TY, TZ] });
    await call("POST", "/auth/users", admin, { employeeCode: TECH, name: TECH_NAME, role: "EMPLOYEE", teams: [TX], password: "temp12345" });
    sql(`select array_to_string(covers,',') from "TeamGroup" where name='${TG}'`) === `${TY},${TZ}` && db(TECH) === `EMPLOYEE|${TX}|`
      ? pass("เตรียม: ทีมรวม (ครอบคลุม ข,ค) + ช่างทีม ก (ฐานข้อมูล)") : fail(`เตรียม: ${db(TECH)}`);

    // ════ การ์ด: ช่าง → Senior ช่าง แล้วเลือกหลายทีม ════
    let { page, vis, byLabel, sel } = await open();
    await toUsers(page, vis, TECH);
    (await vis("Senior ช่าง").count()) > 0 ? pass("มีชิปสิทธิ์ Senior ช่าง") : fail("ไม่มีชิป Senior ช่าง");
    await vis("Senior ช่าง").first().click();
    await page.waitForTimeout(2000);
    db(TECH) === `SENIOR_TECH|${TX}|` ? pass("ช่าง → Senior ช่าง: คงทีมเดิม (ฐานข้อมูล)") : fail(`เป็น Senior: ${db(TECH)}`);
    (await vis("ทีมช่างที่ดูแล (เลือกได้หลายทีม · กดซ้ำเพื่อเอาออก)").count()) > 0 &&
    (await page.getByText(/^ทีมรวม \(เลือกได้หลายอัน\)/).locator("visible=true").count()) > 0
      ? pass("การ์ด Senior: แถวทีมช่างหลายทีม + แถวทีมรวมหลายอัน") : fail("ไม่มีแถวเลือกหลายทีม");
    `${await sel(vis(TX).first())}|${await sel(vis(TY).first())}` === "true|false" ? pass("ตอนเปิด: ทีมเดิมติด ทีมอื่นไม่ติด") : fail("ชิปตอนเปิดไม่ตรง");
    await vis(TY).first().click();
    await page.waitForTimeout(2000);
    db(TECH) === `SENIOR_TECH|${TX}|${TY}` ? pass("กดทีมที่สอง = ต่อท้าย ทีมแรกไม่เปลี่ยน (ฐานข้อมูล)") : fail(`เพิ่มทีม: ${db(TECH)}`);
    await byLabel(`ทีมรวม ${TG}`).first().click();
    await page.waitForTimeout(2000);
    db(TECH) === `SENIOR_TECH|${TX}|${TY},${TG}` && (await sel(byLabel(`ทีมรวม ${TG}`).first())) === "true"
      ? pass("กดทีมรวม = ต่อท้ายในรายการเดียวกัน ชิปติด (ฐานข้อมูล)") : fail(`เพิ่มทีมรวม: ${db(TECH)}`);
    const body = lastSent("PATCH");
    body?.team === TX && JSON.stringify(body?.teams) === JSON.stringify([TX, TY, TG])
      ? pass("PATCH จากการ์ดส่ง team (ทีมแรก) คู่กับ teams") : fail(`PATCH body: ${JSON.stringify(body)}`);
    const scope = (await page.getByText(/^เห็นใบงานของ /).locator("visible=true").first().textContent()) ?? "";
    [TX, TY, TZ].every((t) => scope.includes(t)) && !scope.includes(TW)
      ? pass("บรรทัด \"เห็นใบงานของ\" = ทีม ก ข + ทีม ค ที่ได้จากทีมรวม (ไม่มีทีม ง)") : fail(`เห็นใบงานของ: ${scope}`);
    await page.screenshot({ path: path.join(DIR, "senior-tech-1-card.png") });
    await vis(TX).first().click();
    await page.waitForTimeout(2000);
    db(TECH) === `SENIOR_TECH|${TY}|${TG}` ? pass("กดทีมแรกซ้ำ = เอาออก ตัวถัดไปขึ้นเป็นทีมแรก (ฐานข้อมูล)") : fail(`เอาทีมแรกออก: ${db(TECH)}`);
    await page.context().close();

    ({ page, vis, byLabel, sel } = await open());
    await toUsers(page, vis, TECH);
    `${await sel(vis(TX).first())}|${await sel(vis(TY).first())}|${await sel(byLabel(`ทีมรวม ${TG}`).first())}` === "false|true|true"
      ? pass("เปิดหน้าใหม่ ชิปที่เลือกไว้ยังติดครบ") : fail("ชิปหลังเปิดใหม่ไม่ตรง");
    // Senior หลายทีม → ช่าง: ถามก่อน
    await vis("ช่าง").first().click();
    await page.waitForTimeout(800);
    (await page.getByText(new RegExp(`จะเหลือ "${TY}" ทีมเดียว`)).locator("visible=true").count()) > 0
      ? pass("Senior หลายทีม → ช่าง: ถามก่อนว่าจะเหลือทีมไหน") : fail("ไม่ถามก่อนลดเป็นช่าง");
    await page.screenshot({ path: path.join(DIR, "senior-tech-2-demote.png") });
    await vis("ยกเลิก").last().click();
    await page.waitForTimeout(800);
    db(TECH) === `SENIOR_TECH|${TY}|${TG}` ? pass("กดยกเลิก ไม่เปลี่ยน (ฐานข้อมูล)") : fail(`ยกเลิกแล้วเปลี่ยน: ${db(TECH)}`);
    await vis("ช่าง").first().click();
    await page.waitForTimeout(800);
    await vis("เปลี่ยนเป็นช่าง").last().click();
    await page.waitForTimeout(2000);
    db(TECH) === `EMPLOYEE|${TY}|` ? pass("ยืนยัน → ช่างทีมเดียว ทีมที่เหลือถูกล้าง (ฐานข้อมูล)") : fail(`ลดเป็นช่าง: ${db(TECH)}`);

    // ════ หน้าต่างเพิ่มบัญชี ════
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    await vis("เพิ่มบัญชีผู้ใช้").last().click();
    await page.waitForTimeout(800);
    await label("ชื่อผู้ใช้").fill(NEW);
    await label("ชื่อ-นามสกุล").fill(NEW_NAME);
    await label("รหัสตั้งต้น").fill("temp12345");
    await vis("Senior ช่าง").last().click();
    await page.waitForTimeout(500);
    await vis(TX).last().click();
    await byLabel(`ทีมรวม ${TG}`).last().click();
    await page.waitForTimeout(500);
    const modalScope = (await page.getByText(/^เห็นใบงานของ /).locator("visible=true").last().textContent()) ?? "";
    [TX, TY, TZ].every((t) => modalScope.includes(t)) ? pass("หน้าต่างเพิ่มบัญชีบอกขอบเขตรวม") : fail(`ขอบเขตในหน้าต่าง: ${modalScope}`);
    await page.screenshot({ path: path.join(DIR, "senior-tech-3-create.png") });
    await vis("สร้างบัญชี").last().click();
    await page.waitForTimeout(2500);
    db(NEW) === `SENIOR_TECH|${TX}|${TG}` ? pass("สร้าง Senior ช่างจากหน้าต่างเพิ่มบัญชี: ทีมแรก + ทีมรวม (ฐานข้อมูล)") : fail(`สร้างบัญชี: ${db(NEW)}`);
    const posted = lastSent("POST");
    posted?.team === TX && JSON.stringify(posted?.teams) === JSON.stringify([TX, TG])
      ? pass("หน้าต่างเพิ่มบัญชีส่ง team คู่กับ teams") : fail(`POST body: ${JSON.stringify(posted)}`);
    await vis("ตกลง").last().click().catch(() => {});
    await page.context().close();

    // ════ Senior เข้าแอปเอง: งานของฉันวันนี้มีงานสองทีม ════
    sql(`update "User" set "mustChangePassword"=false where "employeeCode"='${NEW}'`);
    const sid = sql(`select id from "User" where "employeeCode"='${NEW}'`);
    const mk = async (b, team) => {
      const r = await call("POST", "/work-orders", admin, {
        branchCode: `ZSB${b}${SUF}`, jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: "W1", symptom: `ทดสอบ Senior เว็บ ${b}` }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      orders.push(id);
      // ข้ามขั้นของแอดมิน/หัวหน้าภาค — เทสต์นี้ดูแค่ว่า Senior เห็นและกดงานของหลายทีมได้
      sql(`update "WorkOrder" set status='IN_PROGRESS', "assignedTeam"='${team}', "scheduledAt"=date_trunc('day', now() at time zone 'Asia/Bangkok'), "scheduledTime"='09:00' where id=${id}`);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    const OX = await mk("X", TX), OY = await mk("Y", TY), OW = await mk("W", TW);
    sql(`select string_agg(status||':'||"assignedTeam", ',' order by id) from "WorkOrder" where id in (${OX.id},${OY.id},${OW.id})`) ===
      `IN_PROGRESS:${TX},IN_PROGRESS:${TY},IN_PROGRESS:${TW}` ? pass("เตรียมงานวันนี้ 3 ใบ: ทีม ก · ข · ง (ฐานข้อมูล)") : fail("เตรียมใบงานไม่ได้");
    ({ page, vis, byLabel } = await open(NEW, "temp12345", 420, 1000));
    (await vis("งานของฉัน").count()) > 0 && (await byLabel(`งาน ${OX.code}`).count()) > 0 && (await byLabel(`งาน ${OY.code}`).count()) > 0
      ? pass("Senior เปิดแอปมาเจองานของฉัน (แบบช่าง) เห็นงานทีม ก และทีม ข (ผ่านทีมรวม)") : fail("งานของฉันไม่มีงานสองทีม");
    (await byLabel(`งาน ${OW.code}`).count()) === 0 && (await vis(OW.code, false).count()) === 0 ? pass("ไม่เห็นงานทีม ง ที่ไม่ได้ดูแล") : fail("เห็นงานทีมอื่น");
    const metaX = (await byLabel(`งาน ${OX.code}`).first().textContent()) ?? "";
    const metaY = (await byLabel(`งาน ${OY.code}`).first().textContent()) ?? "";
    metaX.includes(`ทีม${TX}`) && metaY.includes(`ทีม${TY}`) ? pass("การ์ดงานบอกว่างานนี้ของทีมไหน (เห็นหลายทีม)") : fail(`ป้ายทีม: ${metaX.slice(0, 120)} / ${metaY.slice(0, 120)}`);
    // จอแคบไม่มีชื่อตำแหน่งบนแถบหัว — อยู่ที่หัวเมนูเลื่อนออก ("ชื่อ · ตำแหน่ง") · ปิดเมนูก่อนกดการ์ด
    await byLabel("เปิดเมนู").first().click();
    await page.waitForTimeout(800);
    (await page.getByText(`${NEW_NAME} · Senior ช่าง`).locator("visible=true").count()) > 0
      ? pass("หัวเมนูบอกตำแหน่ง Senior ช่าง") : fail("หัวเมนูไม่มีป้าย Senior ช่าง");
    await page.keyboard.press("Escape");
    await page.mouse.click(410, 500);
    await page.waitForTimeout(800);
    await byLabel(`งาน ${OY.code}`).first().locator('[aria-label="ถึงหน้างาน"]').click();
    await page.waitForTimeout(4000);
    sql(`select "userId"||'|'||action from "WorkOrderLog" where "workOrderId"=${OY.id} order by id desc limit 1`) === `${sid}|ARRIVED`
      && sql(`select status from "WorkOrder" where id=${OY.id}`) === "IN_PROGRESS"
      ? pass("กดถึงหน้างานงานทีม ข (ได้ผ่านทีมรวม) → ฐานข้อมูลบันทึกเป็นชื่อ Senior") : fail(`ถึงหน้างาน: ${sql(`select string_agg(action, ',') from "WorkOrderLog" where "workOrderId"=${OY.id}`)}`);
    (await byLabel(`งาน ${OY.code}`).first().locator('[aria-label="ปิดงาน"]').count()) > 0 ? pass("ปุ่มเปลี่ยนเป็น ปิดงาน") : fail("ปุ่มไม่เปลี่ยนเป็นปิดงาน");
    await page.screenshot({ path: path.join(DIR, "senior-tech-4-myjobs.png") });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    sw <= 422 ? pass("จอมือถือไม่มีเลื่อนข้าง") : fail(`scrollWidth ${sw}`);
    await page.context().close();

    // ════ บอร์ดแผนงาน: Senior ในแถวทีมมีป้าย "Senior" (ไม่มีแถวของตัวเอง ใส่เป็นคนในทีมไหนก็ได้) ════
    const techId = sql(`select id from "User" where "employeeCode"='${TECH}'`);
    const today = sql(`select to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD')`);
    await call("PUT", "/plans", admin, { date: today, team: TX, memberIds: [Number(sid), Number(techId)] });
    sql(`select string_agg(m."userId"::text, ',' order by m.position) from "TeamDayPlanMember" m join "TeamDayPlan" p on p.id=m."planId" where p.team='${TX}'`) === `${sid},${techId}`
      ? pass("แผนวันนี้ทีม ก: Senior เป็นหัวหน้าทีม + ช่างธรรมดา (ฐานข้อมูล)") : fail("ตั้งแผนไม่ได้");
    ({ page, vis, byLabel } = await open());
    if ((await vis("แผนงาน").count()) === 0) {
      await byLabel("เปิดเมนู").first().click();
      await page.waitForTimeout(800);
    }
    await vis("แผนงาน").first().click();
    await page.waitForTimeout(3500);
    const crew = page.getByText(new RegExp(`^${NEW_NAME}\\s*Senior\\s*\\(หัวหน้าทีม\\) ไปกับ ${TECH_NAME}$`)).locator("visible=true");
    (await crew.count()) > 0 ? pass("แถวทีม ก: ชื่อ Senior มีป้าย Senior · ช่างธรรมดาไม่มีป้าย") : fail(`แถวทีม ก: ${(await page.getByText(NEW_NAME).locator("visible=true").first().textContent().catch(() => "-"))}`);
    await crew.first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(DIR, "senior-tech-5-plan.png") });

    // ════ ลบทีม: คำเตือนแยก Senior ที่เหลือทีมอื่น ออกจากคนที่จะไม่มีสังกัด ════
    await call("POST", "/auth/users", admin, { employeeCode: SOLE, name: SOLE_NAME, role: "SENIOR_TECH", teams: [TW], password: "temp12345" });
    db(SOLE) === `SENIOR_TECH|${TW}|` ? pass("เตรียม: Senior ถือทีม ง ทีมเดียว (ฐานข้อมูล)") : fail(`เตรียม SOLE: ${db(SOLE)}`);
    if ((await vis("ทีมช่าง").count()) === 0) {
      await byLabel("เปิดเมนู").first().click();
      await page.waitForTimeout(800);
    }
    await vis("ทีมช่าง").first().click();
    await page.waitForTimeout(2500);
    await page.getByLabel("ค้นหาทีม").locator("visible=true").first().fill(SUF);
    await page.waitForTimeout(500);
    const warn = async (team) => {
      await byLabel(`ลบทีม ${team}`).first().click();
      await page.waitForTimeout(1500);
      const t = (await page.getByText(/แผนของทีมนี้ตั้งแต่วันนี้ถูกลบ/).locator("visible=true").last().textContent()) ?? "";
      return t;
    };
    const wTW = await warn(TW);
    wTW.includes("ช่าง 1 คนจะไม่มีสังกัด") && !wTW.includes("ทีมอื่นที่เลือกไว้ยังอยู่")
      ? pass("ลบทีม ง: Senior ที่ถือทีมนี้ทีมเดียวนับเป็น \"จะไม่มีสังกัด\" (ไม่ใช่ \"ทีมอื่นยังอยู่\")") : fail(`คำเตือนทีม ง: ${wTW}`);
    await page.screenshot({ path: path.join(DIR, "senior-tech-6-delete-warn.png") });
    await vis("ยกเลิก").last().click();
    await page.waitForTimeout(800);
    const wTX = await warn(TX);
    wTX.includes("Senior ช่าง 1 คนจะเลิกเห็นทีมนี้ — ทีมอื่นที่เลือกไว้ยังอยู่") && !wTX.includes("จะไม่มีสังกัด")
      ? pass("ลบทีม ก: Senior ที่ถือทีมรวมด้วยนับเป็น \"ทีมอื่นยังอยู่\"") : fail(`คำเตือนทีม ก: ${wTX}`);
    await vis("ยกเลิก").last().click();
    await page.waitForTimeout(800);
    db(SOLE) === `SENIOR_TECH|${TW}|` && db(NEW) === `SENIOR_TECH|${TX}|${TG}` ? pass("กดยกเลิก ไม่มีอะไรเปลี่ยน (ฐานข้อมูล)") : fail(`หลังยกเลิก: ${db(SOLE)} / ${db(NEW)}`);
    await page.context().close();
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    await cleanup();
    const left = sql(`select count(*) from "User" where id in (${users})`) + "|" + sql(`select count(*) from "Branch" where code like 'ZSB_${SUF}'`);
    left === "0|0" ? pass("ลบข้อมูลทดสอบหมด (ผู้ใช้ · สาขา)") : fail(`เหลือข้อมูลทดสอบ ${left}`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
