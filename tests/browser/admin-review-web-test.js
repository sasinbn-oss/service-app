// ทดสอบ: ส่งกลับให้แอดมินตรวจสอบ โดยขั้นตอนไม่เปลี่ยน (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
//   · หัวหน้าภาค (มือถือ): ปุ่มบนการ์ดในงานของฉันวันนี้ → เลือกเรื่อง + รายละเอียด → ส่ง (ฐานข้อมูล: มีคำขอ ขั้นไม่เปลี่ยน)
//     การ์ดขึ้น "รอแอดมินตรวจสอบ" + ปุ่มยกเลิกคำขอ · ปุ่มขั้นเดิมยังอยู่
//   · แอดมิน (จอคอม): หัวข้อ "หัวหน้าภาคส่งให้ตรวจสอบ" อยู่บนสุด → ตรวจแล้ว · ตอบกลับ (ฐานข้อมูล: มีคำตอบ ขั้นไม่เปลี่ยน)
//   · หัวหน้าภาค: การ์ดโชว์คำตอบสีเขียว → รับทราบ (ฐานข้อมูล) → กล่องหาย ปุ่มส่งกลับมา
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
  let id = null;
  const review = () => sql(`select coalesce(string_agg(reason||'|'||coalesce(reply,'-')||'|'||("ackAt" is not null)::text, ','),'-') from "AdminReview" where "workOrderId"=${id}`);
  const status = () => sql(`select status from "WorkOrder" where id=${id}`);

  try {
    if (sql(`select region from "User" where "employeeCode"='S001'`) !== "ใต้") throw new Error("ข้อมูลตั้งต้นไม่ตรง (S001 ภาคใต้)");
    // ด่วน — ขึ้นบนสุดของกลุ่ม "ระบุอะไหล่" ในงานของฉันวันนี้
    const wo = await call(A, "POST", "/work-orders", { branchCode: "C0006", jobType: "CM", priority: "URGENT", machines: [{ code: "W4", symptom: "ทดสอบส่งกลับให้แอดมินตรวจสอบ" }] });
    id = wo.orders ? wo.orders[0].id : wo.id;
    const code = sql(`select code from "WorkOrder" where id=${id}`);

    const session = async (user, viewport) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(user);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
      await page.waitForTimeout(4500);
      const lbl = (l) => page.getByLabel(l, { exact: true }).locator("visible=true");
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      const click = async (loc) => {
        await loc.first().scrollIntoViewIfNeeded().catch(() => {});
        await loc.first().click();
      };
      return { ctx, page, lbl, vis, click };
    };
    const phone = { width: 420, height: 1000 };

    // ════ หัวหน้าภาคส่ง ════
    {
      const { ctx, page, lbl, vis, click } = await session("S001", phone);
      // รายการงานของฉันโหลดหลังเข้าหน้า — รอการ์ดใบนี้ก่อนนับปุ่ม
      await lbl(`ทำขั้น ระบุอะไหล่ ${code}`).first().waitFor({ timeout: 20000 }).catch(() => {});
      (await lbl(`ส่งกลับให้แอดมินตรวจสอบ ${code}`).count()) && (await lbl(`ทำขั้น ระบุอะไหล่ ${code}`).count())
        ? pass("การ์ดใบงาน (มือถือ): มีปุ่มส่งกลับให้แอดมินตรวจสอบ คู่กับปุ่มขั้นเดิม")
        : fail("ไม่มีปุ่มบนการ์ด");
      await lbl(`ส่งกลับให้แอดมินตรวจสอบ ${code}`).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "admin-review-1-card.png") });
      await click(lbl(`ส่งกลับให้แอดมินตรวจสอบ ${code}`));
      await page.waitForTimeout(800);
      (await vis("ขั้นตอนไม่เปลี่ยน", false).count()) ? pass("ฟอร์มบอกว่าขั้นตอนไม่เปลี่ยน") : fail("ฟอร์มไม่บอกว่าขั้นไม่เปลี่ยน");
      await click(lbl("ยืนยันส่งให้แอดมิน"));
      await page.waitForTimeout(600);
      (await vis("เลือกเรื่องที่ให้แอดมินตรวจก่อน").count()) && review() === "-" ? pass("ยังไม่เลือกเรื่อง ส่งไม่ได้ (ฐานข้อมูลไม่มีคำขอ)") : fail(`ส่งได้ทั้งที่ไม่เลือกเรื่อง ${review()}`);
      await click(lbl("เรื่อง เครื่อง/รุ่นไม่ถูก"));
      await lbl("รายละเอียดที่ให้แอดมินตรวจ").first().fill("ร้านแจ้งว่าเครื่องที่เสียคือ W12 ไม่ใช่ W4");
      await page.screenshot({ path: path.join(DIR, "admin-review-2-sheet.png") });
      await click(lbl("ยืนยันส่งให้แอดมิน"));
      await page.waitForTimeout(3000);
      review() === "MACHINE|-|false" && status() === "NEW"
        ? pass("ส่งผ่านหน้าจอได้ — ฐานข้อมูลมีคำขอ (เครื่อง/รุ่นไม่ถูก) ขั้นยังเป็นระบุอะไหล่")
        : fail(`ฐานข้อมูล: ${review()} ขั้น ${status()}`);
      const card = await lbl("กล่องรอแอดมินตรวจสอบ").count();
      (await vis("รอแอดมินตรวจสอบ").count()) && card && (await lbl(`ยกเลิกคำขอ ${code}`).count()) && (await lbl(`ทำขั้น ระบุอะไหล่ ${code}`).count())
        ? pass("การ์ดขึ้นป้ายรอแอดมินตรวจสอบ + เรื่องที่ส่ง · ปุ่มยกเลิกคำขอ · ปุ่มขั้นเดิมยังกดได้")
        : fail("การ์ดหลังส่งไม่ครบ");
      await lbl("กล่องรอแอดมินตรวจสอบ").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "admin-review-3-waiting.png") });
      await ctx.close();
    }

    // ════ แอดมินตอบ (จอคอม) ════
    {
      const { ctx, page, lbl, vis, click } = await session("A001", { width: 1280, height: 900 });
      await lbl(`ตรวจแล้ว ตอบกลับ ${code}`).first().waitFor({ timeout: 20000 }).catch(() => {});
      const head = vis("หัวหน้าภาคส่งให้ตรวจสอบ");
      const groups = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label^="กลุ่ม "]')].filter((g) => g.offsetParent).map((g) => g.getAttribute("aria-label"))
      );
      (await head.count()) && groups[0] === "กลุ่ม หัวหน้าภาคส่งให้ตรวจสอบ" && (await lbl(`ตรวจแล้ว ตอบกลับ ${code}`).count())
        ? pass("แอดมิน: หัวข้อ \"หัวหน้าภาคส่งให้ตรวจสอบ\" อยู่บนสุด มีปุ่มตรวจแล้ว · ตอบกลับ")
        : fail(`กลุ่มของแอดมิน: ${groups.slice(0, 3).join(" / ")}`);
      await page.screenshot({ path: path.join(DIR, "admin-review-4-admin.png") });
      await click(lbl(`ตรวจแล้ว ตอบกลับ ${code}`));
      await page.waitForTimeout(800);
      await lbl("คำตอบถึงหัวหน้าภาค").first().fill("โทรเช็คกับร้านแล้ว เป็นเครื่อง W12 จริง แก้เลขเครื่องในใบแล้ว");
      await page.screenshot({ path: path.join(DIR, "admin-review-5-reply.png") });
      await click(lbl("ยืนยันส่งคำตอบ"));
      await page.waitForTimeout(3000);
      review() === "MACHINE|โทรเช็คกับร้านแล้ว เป็นเครื่อง W12 จริง แก้เลขเครื่องในใบแล้ว|false" && status() === "NEW"
        ? pass("แอดมินตอบผ่านหน้าจอได้ — ฐานข้อมูลมีคำตอบ ขั้นยังเป็นระบุอะไหล่")
        : fail(`ฐานข้อมูล: ${review()} ขั้น ${status()}`);
      (await lbl(`ตรวจแล้ว ตอบกลับ ${code}`).count()) === 0 ? pass("ตอบแล้วการ์ดออกจากหัวข้อรอตอบ") : fail("ยังค้างในหัวข้อรอตอบ");
      await ctx.close();
    }

    // ════ หัวหน้าภาคเห็นคำตอบ → รับทราบ ════
    {
      const { ctx, page, lbl, vis, click } = await session("S001", phone);
      await lbl("กล่องแอดมินตรวจแล้ว").first().waitFor({ timeout: 20000 }).catch(() => {});
      const box = (await lbl("กล่องแอดมินตรวจแล้ว").count()) ? await lbl("กล่องแอดมินตรวจแล้ว").first().innerText() : "";
      box.includes("เป็นเครื่อง W12 จริง") && (await lbl(`รับทราบคำตอบแอดมิน ${code}`).count())
        ? pass("หัวหน้าภาค: การ์ดโชว์คำตอบสีเขียว + ปุ่มรับทราบ")
        : fail(`กล่องคำตอบ: ${box}`);
      await lbl("กล่องแอดมินตรวจแล้ว").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "admin-review-6-answered.png") });
      await click(lbl(`รับทราบคำตอบแอดมิน ${code}`));
      await page.waitForTimeout(2500);
      review().endsWith("|true") && (await lbl("กล่องแอดมินตรวจแล้ว").count()) === 0 && (await lbl(`ส่งกลับให้แอดมินตรวจสอบ ${code}`).count())
        ? pass("รับทราบแล้ว (ฐานข้อมูล) — กล่องคำตอบหาย ปุ่มส่งกลับให้แอดมินตรวจสอบกลับมา")
        : fail(`รับทราบ: ${review()}`);
      await ctx.close();
    }
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    if (id) await call(A, "DELETE", `/work-orders/${id}`);
    await browser.close();
  }
})();
