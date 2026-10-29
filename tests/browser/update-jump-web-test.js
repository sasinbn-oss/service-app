// ทดสอบ: ปุ่ม "มีอัปเดต" พาไปแท็บที่ใบงานอยู่ แล้วกระพริบใบนั้น (เจ้าของงานขอ ต.ค. 69) — มือถือ หัวหน้าภาค
//        · อยู่แท็บ "รอคอนเฟิร์มลูกค้า" แอดมินคอนเฟิร์มใบ A (→ กล่องงาน › จ่ายงาน/ปล่อยงาน) + ยกเลิกใบ B (→ ทั้งหมด)
//          ปุ่มบอก "2 แท็บ" · กดแล้วไปกล่องงาน › จ่ายงาน/ปล่อยงาน ใบ A มีป้ายอัปเดต + บรรทัดเปลี่ยนอะไร
//          ปุ่มเข้ม "อีก 1 ใบ · แท็บ ทั้งหมด" → กดแล้วไปแท็บทั้งหมด ใบ B มีป้าย · แตะการ์ดแล้วป้ายหาย
//        · อยู่แท็บ "ที่ยังค้าง" (ใบเยอะ) แอดมินคอนเฟิร์มใบ C (ยังค้างอยู่) → ปุ่มบอก "ในแท็บนี้" กดแล้วเลื่อนไปหาใบ C
//        · เช็คสถานะที่ฐานข้อมูลทุกขั้น (CLAUDE.md) · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { visitDay } = require("./fixture"); // วันนัดนับจากวันนี้ — เซิร์ฟเวอร์ไม่รับวันย้อนหลัง
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
const login = async (code) =>
  (await (await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode: code, password: "test1234" }),
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
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const ids = [];
  const status = (id) => sql(`select status from "WorkOrder" where id=${id}`);
  const codeOf = (id) => sql(`select code from "WorkOrder" where id=${id}`);

  try {
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const S = await login("S001");
    const team = sql(`select zone from "Branch" where code='C0006'`);
    // ใบที่ถึงขั้นแอดมินคอนเฟิร์มลูกค้า (ไม่ใช้อะไหล่ + จ่ายงานแล้ว)
    const mk = async (n) => {
      const wo = await call(A, "POST", "/work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL",
        machines: [{ code: `W9${n}`, model: "Oasis", symptom: `ทดสอบปุ่มอัปเดต ${n}` }],
      });
      const id = wo.orders ? wo.orders[0].id : wo.id;
      ids.push(id);
      await call(S, "POST", `/work-orders/${id}/parts`, { needsParts: false, assign: { team, scheduledAt: visitDay(22) } });
      return id;
    };
    const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
    if ([a, b, c].some((id) => status(id) !== "AWAITING_CONFIRM")) throw new Error("เตรียมใบงานไม่ถึงขั้นคอนเฟิร์มลูกค้า");
    const [codeA, codeB, codeC] = [codeOf(a), codeOf(b), codeOf(c)];

    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const tap = async (t, exact = true) => {
      const el = vis(t, exact).last();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click().catch(async () => el.evaluate((n) => (n.closest("[tabindex]") || n).click()));
    };
    // ตัวเช็คเบื้องหลังรอบละ 1 นาที — ทำทีเหมือนกลับมาเปิดแท็บ ให้เช็คทันที
    const poke = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const pill = (re) => page.locator('[aria-label="ดูข้อมูลที่อัปเดต"]').filter({ hasText: re }).locator("visible=true");
    // แท็บที่เลือกอยู่ (role=tab · aria-selected) — ชื่อแท็บอยู่ต้น aria-label ("ทั้งหมด 91 ใบ" · "แท็บ จ่ายงาน/ปล่อยงาน 1 ใบ")
    const selected = (label) =>
      page.evaluate(
        (l) => [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((n) => (n.getAttribute("aria-label") || "").replace(/^แท็บ /, "").startsWith(l)),
        label
      );
    // การ์ดของใบนี้: ข้อความทั้งใบ + อยู่ในจอไหม
    const card = (code) =>
      page.evaluate((c) => {
        const el = [...document.querySelectorAll("div")].find((n) => n.childElementCount === 0 && n.innerText === c && n.offsetParent);
        const box = el && el.closest("[tabindex]");
        if (!box) return null;
        const r = box.getBoundingClientRect();
        return { text: box.innerText, inView: r.top >= 0 && r.bottom <= innerHeight };
      }, code);

    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    await tap("ใบงาน");
    await page.waitForTimeout(3000);

    // ════ อัปเดตสองใบ ไปคนละแท็บ ════
    await tap("รอคอนเฟิร์มลูกค้า");
    await page.waitForTimeout(3000);
    (await card(codeA)) && (await card(codeB)) ? pass("แท็บรอคอนเฟิร์มลูกค้าเห็นใบ A กับ B") : fail("ไม่เห็นใบ A/B ในแท็บรอคอนเฟิร์ม");
    await call(A, "POST", `/work-orders/${a}/confirm-appointment`, {});
    await call(A, "POST", `/work-orders/${b}/cancel`, { reasonCode: "DUPLICATE" });
    status(a) === "ASSIGNED" && status(b) === "CANCELLED"
      ? pass("ฐานข้อมูล: ใบ A รอหัวหน้าภาคปล่อยงาน · ใบ B ยกเลิก")
      : fail(`สถานะ A=${status(a)} B=${status(b)}`);
    await poke();
    await pill(/2 แท็บ/).first().waitFor({ timeout: 20000 }).catch(() => {});
    (await pill(/มีอัปเดต 2 ใบงาน · 2 แท็บ/).count()) > 0
      ? pass('ปุ่มขึ้น "มีอัปเดต 2 ใบงาน · 2 แท็บ"')
      : fail(`ปุ่มไม่บอกแท็บ: ${await page.locator('[aria-label="ดูข้อมูลที่อัปเดต"]').allInnerTexts()}`);
    await pill(/2 แท็บ/).last().click();
    // กรอบกระพริบอยู่แค่ ~2 วิหลังพาไป — เช็คว่ามี animation จริงระหว่างนั้น (เดิม keyframes ถูกทิ้งเงียบ ๆ ไม่เคยกระพริบ)
    let blink = null;
    for (let i = 0; i < 30 && !blink; i++) {
      blink = await page.evaluate(() => {
        const el = [...document.querySelectorAll("div")].find((n) => getComputedStyle(n).animationDuration === "0.62s");
        return el ? getComputedStyle(el).animationName : null;
      });
      if (!blink) await page.waitForTimeout(150);
    }
    blink && blink !== "none" ? pass(`ใบที่พาไปกระพริบจริง (${blink})`) : fail(`ใบที่พาไปไม่กระพริบ: ${blink}`);
    await page.waitForTimeout(4000);
    const cardA = await card(codeA);
    (await selected("กล่องงานของฉัน")) && (await selected("จ่ายงาน/ปล่อยงาน"))
      ? pass("กดแล้วไปกล่องงานของฉัน › จ่ายงาน/ปล่อยงาน")
      : fail("ไม่ได้สลับไปแท็บจ่ายงาน/ปล่อยงาน");
    cardA && /อัปเดต/.test(cardA.text) && /คอนเฟิร์มลูกค้า →/.test(cardA.text) && cardA.inView
      ? pass("ใบ A อยู่ในจอ มีป้ายอัปเดต และบอกว่าเปลี่ยนจากคอนเฟิร์มลูกค้า → ขั้นใหม่")
      : fail(`ใบ A: ${JSON.stringify(cardA)}`);
    await page.screenshot({ path: path.join(DIR, "update-jump-1.png") });
    const next = page.getByLabel("อีก 1 ใบ · แท็บ ทั้งหมด", { exact: true }).locator("visible=true");
    (await next.count()) > 0 ? pass('มีปุ่ม "อีก 1 ใบ · แท็บ ทั้งหมด"') : fail("ไม่มีปุ่มไปแท็บถัดไป");
    await next.last().click();
    await page.waitForTimeout(4000);
    const cardB = await card(codeB);
    (await selected("ทั้งหมด")) && cardB && /อัปเดต/.test(cardB.text) && /→ ยกเลิก/.test(cardB.text) && cardB.inView
      ? pass("กดแล้วไปแท็บทั้งหมด ใบ B อยู่ในจอ มีป้าย → ยกเลิก")
      : fail(`แท็บทั้งหมด/ใบ B: ${JSON.stringify(cardB)}`);
    (await page.getByLabel(/^อีก \d+ ใบ/).locator("visible=true").count()) === 0 ? pass("ไม่มีแท็บเหลือให้ไปต่อ ปุ่มเข้มหาย") : fail("ปุ่มเข้มยังค้าง");
    await page.screenshot({ path: path.join(DIR, "update-jump-2.png") });

    // ════ อัปเดตใบเดียว ยังอยู่แท็บเดิม (รายการยาว) ════
    await tap("ที่ยังค้าง");
    await page.waitForTimeout(3500);
    await call(A, "POST", `/work-orders/${c}/confirm-appointment`, {});
    status(c) === "ASSIGNED" ? pass("ฐานข้อมูล: ใบ C คอนเฟิร์มแล้ว (ยังค้างอยู่)") : fail(`สถานะ C=${status(c)}`);
    await poke();
    await pill(/ในแท็บนี้/).first().waitFor({ timeout: 20000 }).catch(() => {});
    (await pill(/มีอัปเดต 1 ใบงาน · ในแท็บนี้/).count()) > 0 ? pass('ปุ่มขึ้น "มีอัปเดต 1 ใบงาน · ในแท็บนี้"') : fail("ปุ่มไม่บอกว่าในแท็บนี้");
    await pill(/ในแท็บนี้/).last().click();
    await page.waitForTimeout(3500);
    const cardC = await card(codeC);
    (await selected("ที่ยังค้าง")) && cardC && cardC.inView && /อัปเดต/.test(cardC.text)
      ? pass("อยู่แท็บเดิม เลื่อนไปที่ใบ C ให้ มีป้ายอัปเดต")
      : fail(`ใบ C: ${JSON.stringify(cardC)}`);
    await page.screenshot({ path: path.join(DIR, "update-jump-3.png") });
    // แตะการ์ด = ดูแล้ว ป้ายหาย — ปิดใบงานกลับมาที่รายการ แล้วค้นใบ C ให้การ์ดขึ้นมาดู
    await vis(codeC).last().click();
    await page.waitForTimeout(3000);
    await page.getByLabel("ปิด", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(2000);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(codeC);
    await page.waitForTimeout(3000);
    const after = await card(codeC);
    after && !/คอนเฟิร์มลูกค้า →/.test(after.text) ? pass("กดเข้าไปดูแล้วกลับมา ป้ายเปลี่ยนอะไรหายไป") : fail(`ป้ายยังค้าง: ${JSON.stringify(after)}`);
  } catch (e) {
    fail(String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `/work-orders/${id}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
