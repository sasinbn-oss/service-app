// ทดสอบ: หัวใบงานด่วน (เจ้าของงานขอ ต.ค. 69) — ไม่มีแถบ "งานด่วน — ทำก่อนใบปกติ" แล้ว เหลือป้าย "ด่วน" ข้างเลขใบงาน
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

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const A = (await call(null, "POST", "auth/login", { employeeCode: "A001", password: "test1234" })).token;
  let id = null;
  try {
    const r = await call(A, "POST", "work-orders", {
      branchCode: "C0006", jobType: "CM", priority: "URGENT", contactPhone: "089-111-2222",
      machines: [{ code: "W81", symptom: "ทดสอบหัวใบงานด่วน" }],
    });
    id = r.orders ? r.orders[0].id : r.id;
    const [code, prio] = sql(`select code||'|'||priority from "WorkOrder" where id=${id}`).split("|");
    prio === "URGENT" ? pass(`เตรียมใบด่วน ${code} (ฐานข้อมูล priority=URGENT)`) : fail(`priority ${prio}`);

    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ใบงานซ่อม").first().click();
    await page.waitForTimeout(3000);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await page.waitForTimeout(2500);
    await vis(code).last().click();
    await page.waitForTimeout(3500);
    (await page.locator('[aria-label="ใบงานด่วน"]').locator("visible=true").count())
      ? pass("หัวใบงานมีป้าย ด่วน ข้างเลขใบงาน") : fail("ไม่เห็นป้ายด่วน");
    (await vis("ทำก่อนใบปกติ", false).count()) === 0 ? pass("ไม่มีแถบ งานด่วน — ทำก่อนใบปกติ แล้ว") : fail("ยังมีแถบงานด่วน");
    await page.screenshot({ path: __dirname + "/urgent-head.png" });
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (id) await call(A, "DELETE", `work-orders/${id}`);
    await browser.close();
  }
})();
