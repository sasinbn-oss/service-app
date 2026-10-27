// ทดสอบ: หัวหน้าภาคจ่ายงานข้ามไปทีมนอกความดูแล (เจ้าของงานขอ ต.ค. 69)
//   · ช่องทีมแยก "ทีมที่คุณดูแล" กับ "ทีมนอกความดูแล" บอกชื่อคนดูแล · เลือกแล้วบอกว่าหลังจ่ายใครทำอะไรได้
//   · จ่ายผ่านหน้าจอได้ (ฐานข้อมูล) · หน้าใบงานมีกล่องจ่ายข้ามทีม · รายการติด "ข้ามทีม"
//   · หัวหน้าภาคของทีมที่รับเปิดใบได้ แต่ไม่มีปุ่ม (ดูได้อย่างเดียว)
//   · ช่างทีมประจำสาขาและทีมที่รับเห็นปุ่มปิดงานทั้งคู่
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const API = "http://localhost:4000/api";

const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, url, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const login = async (code, password = "test1234") =>
  (await (await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password }),
  })).json()).token;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = await login("A001");
  const S = await login("S001");
  const suf = String(Date.now()).slice(-5);
  const t1Team = sql(`select coalesce(team,'') from "User" where "employeeCode"='T001'`);
  const t1Id = Number(sql(`select id from "User" where "employeeCode"='T001'`));
  const made = [];
  const mkuser = async (code, name, patch) => {
    await call(A, "POST", "/auth/users", { employeeCode: code, name, role: "EMPLOYEE", password: "temp12345" });
    const id = Number(sql(`select id from "User" where "employeeCode"='${code}'`));
    await call(A, "PATCH", `/auth/users/${id}`, patch);
    sql(`update "User" set "mustChangePassword"=false where id=${id}`);
    made.push(id);
    return id;
  };
  let id = null;
  const db = (col) => sql(`select coalesce(${col}::text,'-') from "WorkOrder" where id=${id}`);

  try {
    if (sql(`select region||'|'||zone from "Branch" where code='C0006'`) !== "ใต้|กระบี่" || sql(`select region from "User" where "employeeCode"='S001'`) !== "ใต้") {
      throw new Error("ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้ · C0006 ใต้/กระบี่)");
    }
    const zName = "หัวหน้าภาคกลางทดสอบเว็บ";
    await mkuser(`WR${suf}`, zName, { role: "SUPERVISOR", region: "กลาง-ตะวันตก" });
    await mkuser(`WK${suf}`, "ช่างกรุงเทพทดสอบเว็บ", { team: "กรุงเทพ" });
    await call(A, "PATCH", `/auth/users/${t1Id}`, { team: "กระบี่" });

    const wo = await call(A, "POST", "/work-orders", { branchCode: "C0006", jobType: "CM", priority: "NORMAL", machines: [{ code: "W4", symptom: "ทดสอบจ่ายข้ามทีมผ่านหน้าจอ" }] });
    id = wo.orders ? wo.orders[0].id : wo.id;
    const code = sql(`select code from "WorkOrder" where id=${id}`);
    await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: false });
    // วันเข้างานเติมให้ฟอร์ม — เรื่องที่ทดสอบคือทีม ไม่ใช่ปฏิทิน
    sql(`update "WorkOrder" set "scheduledAt"='2026-12-01' where id=${id}`);

    const session = async (user, password = "test1234") => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill(password);
      await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
      await page.waitForTimeout(3500);
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const lbl = (l) => page.getByLabel(l, { exact: true }).locator("visible=true");
      const openOrder = async () => {
        await vis("ใบงานซ่อม").last().click();
        await page.waitForTimeout(2500);
        await vis("ทั้งหมด").first().click().catch(() => {});
        await page.waitForTimeout(1200);
        await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
        await page.waitForTimeout(2500);
      };
      return { ctx, page, vis, lbl, openOrder };
    };

    // ════ หัวหน้าภาคเจ้าของพื้นที่ จ่ายข้ามทีม ════
    {
      const { ctx, page, vis, lbl, openOrder } = await session("S001");
      await openOrder();
      await vis(code).last().click();
      await page.waitForTimeout(3000);
      await vis("จ่ายงานให้ทีม").first().click();
      await page.waitForTimeout(1500);
      await lbl("ทีมที่จะรับงาน").last().click();
      await page.waitForTimeout(800);
      const own = await vis("ทีมที่คุณดูแล").count();
      const other = await vis("ทีมนอกความดูแล · จ่ายข้ามทีมได้").count();
      const hint = await vis(`${zName} ดูแล`, false).count();
      own && other && hint
        ? pass("ช่องทีม: แยกทีมที่คุณดูแล / ทีมนอกความดูแล · บอกชื่อหัวหน้าภาคที่ดูแลทีมนั้น")
        : fail(`กลุ่มทีม: ของตัวเอง=${own} นอกความดูแล=${other} ชื่อคนดูแล=${hint}`);
      await page.screenshot({ path: path.join(DIR, "cross-team-dropdown.png") });
      await vis("กรุงเทพ").last().click();
      await page.waitForTimeout(800);
      const warn = await vis("ทีมนอกความดูแล — ใบยังอยู่กับคุณ", false).count();
      const both = await vis("ช่างปิดงานได้ทั้ง กรุงเทพ และ กระบี่", false).count();
      warn && both ? pass("เลือกทีมนอกความดูแลแล้วบอกว่าใบยังอยู่กับคุณ · ช่างปิดได้ทั้งสองทีม") : fail(`คำเตือน: อยู่กับคุณ=${warn} ปิดได้ทั้งสอง=${both}`);
      await page.screenshot({ path: path.join(DIR, "cross-team-warn.png") });
      await vis("ยืนยัน").last().click();
      await page.waitForTimeout(4000);
      db('"assignedTeam"') === "กรุงเทพ" && db("status") === "AWAITING_CONFIRM"
        ? pass("จ่ายผ่านหน้าจอได้ — ฐานข้อมูลได้ทีมกรุงเทพ รอแอดมินคอนเฟิร์ม")
        : fail(`ฐานข้อมูล: ${db("status")} ทีม ${db('"assignedTeam"')}`);
      const box = (await lbl("กล่องจ่ายข้ามทีม").count()) ? await lbl("กล่องจ่ายข้ามทีม").first().innerText() : "";
      box.includes("กรุงเทพ เข้าทำแทนทีมประจำสาขา (กระบี่)") && box.includes(zName)
        ? pass("หน้าใบงานมีกล่องจ่ายข้ามทีม บอกทีมประจำ/ทีมที่รับ/หัวหน้าภาคที่เห็นใบ") : fail(`กล่อง: ${box}`);
      await page.screenshot({ path: path.join(DIR, "cross-team-detail-owner.png") });
      await ctx.close();
    }
    await call(A, "POST", `/work-orders/${id}/confirm-appointment`, {});

    // ════ หัวหน้าภาคของทีมที่รับ — ดูได้อย่างเดียว ════
    {
      const { ctx, page, vis, lbl, openOrder } = await session(`WR${suf}`, "temp12345");
      await openOrder();
      const row = await vis("ข้ามทีม", false).count();
      row ? pass("รายการติด \"ข้ามทีม\" ต่อชื่อทีม") : fail("รายการไม่บอกว่าข้ามทีม");
      await page.screenshot({ path: path.join(DIR, "cross-team-list.png") });
      await vis(code).last().click();
      await page.waitForTimeout(3000);
      const box = (await lbl("กล่องจ่ายข้ามทีม").count()) ? await lbl("กล่องจ่ายข้ามทีม").first().innerText() : "";
      // "รับทราบ ปล่อยงาน" ยังขึ้นเป็นชื่อขั้น (แถบขั้นตอน/หัวการ์ด) — ปุ่มไม่มี แทนที่ด้วยการ์ด "ดูได้อย่างเดียว · ขั้นนี้รอ…"
      const waiting = await vis("ดูได้อย่างเดียว · ", false).count();
      box.includes("คุณดูได้อย่างเดียว") && waiting > 0
        ? pass("หัวหน้าภาคทีมที่รับ: เปิดใบได้ · ไม่มีปุ่มปล่อยงาน (การ์ด \"ดูได้อย่างเดียว · ขั้นนี้รอ…\") · กล่องบอกว่าใบเป็นของใคร")
        : fail(`ทีมที่รับ: กล่อง="${box}" การ์ดดูอย่างเดียว=${waiting}`);
      const ends = (await vis("แก้ไข").count()) + (await vis("ปิดใบงาน").count()) + (await vis("ย้อนขั้นตอน").count());
      ends === 0 ? pass("ไม่มีปุ่มแก้ไข / ปิดใบงาน / ย้อนขั้น") : fail(`ยังมีปุ่มจัดการใบ ${ends} ปุ่ม`);
      await page.screenshot({ path: path.join(DIR, "cross-team-detail-viewer.png") });
      await ctx.close();
    }
    await call(S, "POST", `/work-orders/${id}/dispatch`, {});
    db("status") === "IN_PROGRESS" ? pass("เจ้าของพื้นที่ปล่อยงานได้ (ฐานข้อมูล)") : fail(`ปล่อยงาน: ${db("status")}`);

    // ════ ช่างสองทีม ════
    for (const [user, pw, who] of [["T001", "test1234", "ทีมประจำสาขา (กระบี่)"], [`WK${suf}`, "temp12345", "ทีมที่รับ (กรุงเทพ)"]]) {
      const { ctx, page, vis, openOrder } = await session(user, pw);
      await openOrder();
      await vis(code).last().click();
      await page.waitForTimeout(3000);
      (await vis("ปิดงาน").count()) > 0 ? pass(`ช่าง${who} เห็นปุ่มปิดงาน`) : fail(`ช่าง${who} ไม่มีปุ่มปิดงาน`);
      if (user === "T001") await page.screenshot({ path: path.join(DIR, "cross-team-home-tech.png") });
      await ctx.close();
    }
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    if (made.length) sql(`delete from "User" where id in (${made.join(",")})`);
    await call(A, "PATCH", `/auth/users/${t1Id}`, { team: t1Team || null });
    await browser.close();
  }
})();
