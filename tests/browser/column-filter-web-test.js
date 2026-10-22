// ทดสอบ: ตัวกรองหัวคอลัมน์แบบ Excel ในรายการใบงาน (จอคอม · แอดมิน · แท็บทั้งหมด)
//   · กดหัว "สถานะ" → เอาติ๊กทั้งหมดออก → ติ๊กค่าเดียว → ตกลง → ทุกแถวเป็นสถานะนั้น จำนวนตรงกับตัวเลขข้างค่า
//   · หัวคอลัมน์ขึ้นสัญลักษณ์กรอง + ป้าย "หัวคอลัมน์: …" ในแถบสรุปตัวกรอง · เรียง "เครื่อง" ฮ→ก ได้ลำดับจริง
//   · ล้างตัวกรองคอลัมน์ → กลับมาครบ
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click();
    await page.waitForTimeout(3000);
    // รายการวาดเฉพาะช่วงที่เห็น นับแถวบนจอไม่ได้ — เทียบกับตัวเลขจาก API แทน
    const codes = async () => (await page.getByText(/^WO-\d+$/).locator("visible=true").allTextContents());
    const token = (await (await fetch("http://localhost:4000/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "A001", password: "test1234" }),
    })).json()).token;
    const all = await (await fetch("http://localhost:4000/api/work-orders?status=ALL", { headers: { Authorization: `Bearer ${token}` } })).json();
    const apiRows = all.rows ?? all;
    apiRows.length > 3 ? pass(`รายการทั้งหมด ${apiRows.length} ใบ (API)`) : fail(`มีใบน้อยเกินไปสำหรับทดสอบ: ${apiRows.length}`);

    await label("ตัวกรองคอลัมน์ สถานะ").first().click();
    await page.waitForTimeout(800);
    // ค่าแรกในรายการ + จำนวนใบของค่านั้น
    const first = page.locator('[aria-label^="ค่า "]').locator("visible=true").first();
    const value = (await first.getAttribute("aria-label")).replace(/^ค่า /, "");
    const count = Number((await first.innerText()).trim().split(/\s+/).pop());
    await label("เลือกทั้งหมด").click();
    await first.click();
    await label("ตกลง ตัวกรอง สถานะ").click();
    await page.waitForTimeout(1500);
    const expected = apiRows.filter((r) => r.statusLabel === value).length;
    const visibleCodes = await codes();
    const wrong = visibleCodes.filter((c) => apiRows.find((r) => r.code === c)?.statusLabel !== value);
    count === expected && (await vis(`แสดง ${expected} จาก`, false).count()) > 0 && !wrong.length
      ? pass(`กรองสถานะ "${value}" → เหลือ ${expected} ใบ ตรงกับ API · ทุกแถวที่เห็นเป็นสถานะนั้น`)
      : fail(`หลังกรอง: ตัวเลขข้างค่า ${count} · API ${expected} · แถวผิดสถานะ ${wrong.join(",")}`);
    (await vis("หัวคอลัมน์: สถานะ", false).count()) > 0 ? pass("แถบสรุปตัวกรองบอกว่ากรองคอลัมน์สถานะอยู่") : fail("ไม่มีแถบบอกตัวกรอง");
    await page.screenshot({ path: path.join(DIR, "column-filter.png") });

    await label("ล้างตัวกรองคอลัมน์ทั้งหมด").click();
    await page.waitForTimeout(1200);
    const back = await codes();
    (await vis("หัวคอลัมน์:", false).count()) === 0 && back.some((c) => apiRows.find((r) => r.code === c)?.statusLabel !== value)
      ? pass("ล้างตัวกรองคอลัมน์ → แถบหาย สถานะอื่นกลับมา")
      : fail("ล้างแล้วยังกรองอยู่");

    await label("ตัวกรองคอลัมน์ ใบงาน").first().click();
    await page.waitForTimeout(600);
    await label("เรียง ใบงาน ฮ→ก").click();
    await page.waitForTimeout(1200);
    const sorted = await codes();
    // ใบด่วนขึ้นก่อนเสมอ — เทียบลำดับภายในกลุ่มปกติ (ท้ายรายการ) ก็พอ
    const tail = sorted.slice(-Math.min(5, sorted.length));
    const desc = tail.every((c, i) => i === 0 || tail[i - 1].localeCompare(c, "en", { numeric: true }) >= 0);
    desc ? pass(`เรียงใบงาน ฮ→ก ได้ลำดับจริง (${tail.join(", ")})`) : fail(`ลำดับไม่ถูก: ${tail.join(", ")}`);
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
