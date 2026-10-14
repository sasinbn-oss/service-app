// ทดสอบ: หน้ารายการใบงานบนจอแคบ — แถบโลโก้/"☰ ใบงานซ่อม" และแท็บล่างหลบตอนเลื่อนลง กลับมาตอนเลื่อนขึ้นนิดเดียว
//        · เปิด/ปิดใบงานแล้วรายการไม่กระโดด · ไปแท็บอื่นแล้วแถบกลับเป็นปกติ (utils/chrome.ts)
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const H = 860;
  const page = await browser.newPage({ viewport: { width: 400, height: H } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:8081");
  await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
  await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
  await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
  await page.waitForTimeout(3000);
  const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
  await vis("ใบงาน").last().click();
  await page.waitForTimeout(2500);
  await vis("ทั้งหมด").first().click();
  await page.waitForTimeout(2000);

  const y = async (loc) => {
    const bb = await loc.boundingBox().catch(() => null);
    return bb ? Math.round(bb.y) : null;
  };
  const logo = page.getByText("OTTERI", { exact: true }).first();
  const tab = page.getByText("หน้าหลัก", { exact: true }).last();
  const listTop = () =>
    page.evaluate(() => {
      // แท็บอื่นที่เปิดค้างไว้ก็มีกล่องเลื่อนที่มีรหัสใบงาน — เอาตัวที่ถูกเลื่อนลงไปมากสุด คือรายการที่กำลังใช้อยู่
      const els = [...document.querySelectorAll("div")].filter(
        (d) => d.scrollHeight > d.clientHeight + 20 && ["auto", "scroll"].includes(getComputedStyle(d).overflowY) &&
          d.innerText.includes("WO-")
      );
      return els.length ? Math.max(...els.map((e) => Math.round(e.scrollTop))) : null;
    });

  const logo0 = await y(logo), tab0 = await y(tab);
  logo0 >= 0 && tab0 < H ? pass("เปิดหน้า: เห็นแถบโลโก้และแท็บล่าง") : fail(`เปิดหน้า: โลโก้ ${logo0} แท็บ ${tab0}`);

  await page.mouse.move(200, 600);
  for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(100); }
  await page.waitForTimeout(400);
  const logoD = await y(logo), tabD = await y(tab);
  logoD < 0 && tabD >= H ? pass("เลื่อนลง: แถบโลโก้ขึ้นพ้นจอ และแท็บล่างลงพ้นจอ") : fail(`เลื่อนลง: โลโก้ ${logoD} แท็บ ${tabD}`);

  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -40); await page.waitForTimeout(100); }
  await page.waitForTimeout(400);
  const logoU = await y(logo), tabU = await y(tab);
  logoU > logoD && tabU < tabD ? pass("เลื่อนขึ้นนิดเดียว (80 จุด): แถบเริ่มกลับมาทันที ไม่ต้องไปถึงบนสุด") : fail(`เลื่อนขึ้น: โลโก้ ${logoU} แท็บ ${tabU}`);

  // เปิดใบงานด้วยรหัสที่เห็นอยู่บนจอ แล้วปิด — รายการข้างหลังต้องอยู่ที่เดิม
  const code = await page.evaluate((h) => {
    const el = [...document.querySelectorAll("div")].find((d) => {
      if (!/^WO-\d{5}$/.test(d.innerText) || d.children.length) return false;
      const r = d.getBoundingClientRect();
      return r.top > 150 && r.bottom < h - 100;
    });
    return el ? el.innerText : null;
  }, H);
  const before = await listTop();
  await vis(code).first().click();
  await page.waitForTimeout(2000);
  // exact — "ปิด" เฉย ๆ จับปุ่มอื่นที่ชื่อขึ้นต้นด้วยคำนี้ไปด้วย (ปิดหน้าต่าง ปิดงาน) แล้วใบงานไม่ได้ปิดจริง
  await page.getByLabel("ปิด", { exact: true }).locator("visible=true").last().click();
  await page.waitForTimeout(1500);
  (await page.getByLabel("ปิด", { exact: true }).locator("visible=true").count()) === 0
    ? pass("ปิดใบงานแล้วหน้าต่างหายจริง")
    : fail("ใบงานยังเปิดค้าง");
  const after = await listTop();
  before > 0 && before === after ? pass(`เปิด/ปิดใบงาน ${code}: รายการอยู่ที่เดิม (${after})`) : fail(`รายการกระโดด ${before} → ${after}`);

  await vis("หน้าหลัก").last().click();
  await page.waitForTimeout(2000);
  const logoH = await y(logo), tabH = await y(tab);
  logoH >= 0 && tabH < H ? pass("ไปแท็บหน้าหลัก: แถบโลโก้และแท็บล่างกลับเป็นปกติ") : fail(`แท็บหน้าหลัก: โลโก้ ${logoH} แท็บ ${tabH}`);

  await vis("ใบงาน").last().click();
  await page.waitForTimeout(2000);
  await page.mouse.move(200, 600);
  for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(100); }
  await page.waitForTimeout(400);
  const logoB = await y(logo);
  logoB < 0 ? pass("กลับมาแท็บใบงานแล้วเลื่อนลง: แถบหลบได้อีก") : fail(`กลับมาแท็บใบงาน: โลโก้ ${logoB}`);

  errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
  await browser.close();
})();
