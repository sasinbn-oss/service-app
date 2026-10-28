// ทดสอบ: ช่องค้นหาในงานของฉันวันนี้ (เจ้าของงานขอ ต.ค. 69 ตามตัวอย่างที่ตกลง)
//   · แอดมินจอคอม: ช่องค้นหาอยู่แถวหัวข้อ · พิมพ์แล้วเหลือเฉพาะใบที่ตรง (ใบอื่นหาย) · แถบ "แสดง N ใบ … จากทั้งหมด M ใบ"
//     M ตรงกับจำนวนใบในกล่องงานจาก API · ตัวเลขสรุปไม่เปลี่ยนตามคำค้น · ล้างคำค้นแล้วกลับมาครบ
//   · กด / แล้วพิมพ์ได้เลย · ค้นไม่เจอ → ปุ่ม "ค้นในใบงานซ่อมทั้งหมด" พาไปหน้าใบงานซ่อมพร้อมคำค้นเดิม
//   · หัวหน้าภาคบนมือถือ: ช่องค้นหา + "พบ N จาก M ใบ"
// ต้องมี DATABASE_URL
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
  const S = await login("S001");
  const ids = [];
  try {
    // สองใบอาการเดียวกัน (คำค้น) ที่ C0001 — ภาคนี้ไม่มีหัวหน้าภาค ใบจึงเข้ากล่องแอดมิน ("ไม่มีคนรับ")
    // + หนึ่งใบที่ C0006 (ภาคใต้ของ S001) ไว้ค้นบนมือถือหัวหน้าภาค · ใบอื่นในกล่องงานต้องหายตอนค้น
    for (const [branchCode, code] of [["C0001", "W91"], ["C0001", "W92"], ["C0006", "W93"]]) {
      const wo = await call(A, "POST", "/work-orders", { branchCode, jobType: "CM", machines: [{ code, symptom: "ทดสอบค้นหางานของฉัน" }] });
      ids.push(wo.orders ? wo.orders[0].id : wo.id);
    }
    const codes = ids.map((i) => sql(`select code from "WorkOrder" where id=${i}`));
    const inboxA = (await call(A, "GET", "/work-orders?status=INBOX")).rows;
    const inboxS = (await call(S, "GET", "/work-orders?status=INBOX")).rows;
    const other = inboxA.find((r) => !ids.includes(r.id));
    if (![ids[0], ids[1]].every((i) => inboxA.some((r) => r.id === i))) throw new Error("ใบที่ C0001 ไม่อยู่ในกล่องแอดมิน (ภาคนี้มีหัวหน้าภาคแล้ว?)");
    if (!other) throw new Error("กล่องงานแอดมินไม่มีใบอื่นให้เทียบ");

    const session = async (user, viewport) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
      await page.waitForTimeout(5000);
      const lbl = (l) => page.getByLabel(l, { exact: true }).locator("visible=true");
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      return { ctx, page, lbl, vis };
    };

    // ════ แอดมิน จอคอม ════
    {
      const { ctx, page, lbl, vis } = await session("A001", { width: 1440, height: 950 });
      await lbl(`รายละเอียด ${codes[0]}`).first().waitFor({ timeout: 20000 }).catch(() => {});
      const box = lbl("ค้นหาในงานของฉัน");
      (await box.count()) ? pass("แอดมินจอคอม: มีช่องค้นหาในงานของฉันวันนี้") : fail("ไม่มีช่องค้นหา");
      await page.screenshot({ path: path.join(DIR, "queue-search-1-desktop.png") });
      const totalTile = await vis("รอทำทั้งหมด").first().evaluate((n) => n.parentElement.innerText);

      // กด / ที่ไหนก็ได้ แล้วพิมพ์ลงช่องค้นหา
      await page.locator("body").click({ position: { x: 700, y: 20 } }).catch(() => {});
      await page.keyboard.press("/");
      await page.keyboard.type("ทดสอบค้นหางานของฉัน");
      await page.waitForTimeout(800);
      (await box.first().inputValue()) === "ทดสอบค้นหางานของฉัน" ? pass("กด / แล้วพิมพ์ลงช่องค้นหาได้เลย") : fail(`ช่องค้นหา: "${await box.first().inputValue()}"`);

      const shown = (c) => lbl(`รายละเอียด ${c}`).count();
      (await shown(codes[0])) && (await shown(codes[1])) && (await shown(other.code)) === 0
        ? pass(`ค้นแล้วเหลือเฉพาะใบที่ตรง (${codes.join(", ")}) · ใบอื่น (${other.code}) หาย`)
        : fail(`ผลค้น: ${await shown(codes[0])}/${await shown(codes[1])} อื่น ${await shown(other.code)}`);
      const strip = (await vis("แสดง", false).count()) ? await page.evaluate(() => document.body.innerText) : "";
      strip.includes(`2 ใบ ที่ตรงกับ “ทดสอบค้นหางานของฉัน” จากทั้งหมด ${inboxA.length} ใบ`)
        ? pass(`แถบผลค้น: แสดง 2 ใบ จากทั้งหมด ${inboxA.length} ใบ (ตรงกับกล่องงานจาก API)`)
        : fail("แถบผลค้นไม่ตรง");
      (await vis("รอทำทั้งหมด").first().evaluate((n) => n.parentElement.innerText)) === totalTile
        ? pass("ตัวเลขสรุปไม่เปลี่ยนตามคำค้น (นับจากทั้งหมด)")
        : fail("ตัวเลขสรุปเปลี่ยนตามคำค้น");
      await page.screenshot({ path: path.join(DIR, "queue-search-2-typed.png") });

      await lbl("ล้างคำค้นหา").first().click();
      await page.waitForTimeout(800);
      (await shown(other.code)) && (await box.first().inputValue()) === "" ? pass("ล้างคำค้นแล้วกลับมาครบ") : fail("ล้างแล้วไม่กลับมาครบ");

      await box.first().fill("ไม่มีจริงxyz999");
      await page.waitForTimeout(800);
      (await vis("ไม่มี “ไม่มีจริงxyz999” ในงานของฉันวันนี้").count()) ? pass("ค้นไม่เจอ: บอกว่าไม่มีในงานของฉัน") : fail("ไม่มีข้อความค้นไม่เจอ");
      await page.screenshot({ path: path.join(DIR, "queue-search-3-none.png") });
      await lbl("ค้นในใบงานซ่อมทั้งหมด").first().click();
      await page.waitForTimeout(3500);
      const listSearch = await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").evaluateAll((ns) => ns.map((n) => n.value));
      listSearch.includes("ไม่มีจริงxyz999")
        ? pass("ปุ่ม “ค้นในใบงานซ่อมทั้งหมด” พาไปหน้าใบงานซ่อมพร้อมคำค้นเดิม")
        : fail(`หน้าใบงานซ่อม ช่องค้นหา: ${JSON.stringify(listSearch)}`);
      await ctx.close();
    }

    // ════ หัวหน้าภาค มือถือ ════
    {
      const { ctx, page, lbl, vis } = await session("S001", { width: 420, height: 900 });
      const box = lbl("ค้นหาในงานของฉัน");
      await box.first().waitFor({ timeout: 20000 }).catch(() => {});
      await box.first().fill(codes[2]);
      await page.waitForTimeout(800);
      const otherS = inboxS.find((r) => r.id !== ids[2]);
      (await vis(`พบ 1 จาก ${inboxS.length} ใบ`).count()) && (await lbl(`รายละเอียด ${codes[2]}`).count()) && (!otherS || (await lbl(`รายละเอียด ${otherS.code}`).count()) === 0)
        ? pass(`หัวหน้าภาคมือถือ: ค้นด้วยเลขใบงาน → พบ 1 จาก ${inboxS.length} ใบ (ตรงกับกล่องงานจาก API)`)
        : fail(`มือถือ: ${await page.evaluate(() => document.body.innerText.slice(0, 300))}`);
      await page.screenshot({ path: path.join(DIR, "queue-search-4-phone.png") });
      await ctx.close();
    }
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `/work-orders/${id}`);
    await browser.close();
  }
})();
