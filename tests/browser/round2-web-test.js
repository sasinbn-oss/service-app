// ทดสอบ: สี่เรื่องที่เจ้าของงานขอ ต.ค. 69 (รอบปิดงาน SUB / ขนาดเครื่อง / จำนวนอะไหล่ / ช่างแก้ไขเรียบร้อย)
//   1) ช่องจำนวนอะไหล่: ลบเลขเดิมแล้วพิมพ์ 8 ได้ 8 (เดิมเด้งเป็น 18) · ปุ่ม + เพิ่มเป็น 9 · บันทึกแล้วฐานข้อมูล 9
//   2) หัวใบงานขึ้น "เครื่อง W.. · 25 กก."
//   3) ใบงาน SUB: ฟอร์มบันทึกผลมีช่อง "ทีม SUB ที่เข้าทำ" (เลือกทีมไว้ให้) ไม่มีช่องช่างบริษัทคนที่ 1–3
//   4) หัวหน้าภาค "ช่างเข้าดำเนินการแก้ไขเรียบร้อย": เลือกช่าง แนบรูปหลังซ่อม → ฐานข้อมูลปิดเป็นซ่อมเสร็จ (FIXED)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const PHOTO = path.join(__dirname, "..", "site-photo.png");
const API = "http://localhost:4000/api";
const call = async (token, method, p, body) => {
  const r = await fetch(`${API}/${p}`, {
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
  const team = sql(`select zone from "Branch" where code='C0006'`);
  const os = `ZZOS${Date.now() % 100000}`;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const ids = [];
  let mach = null, oldCap = null;
  const A = await login("A001");
  try {
    sql(`update "User" set region=(select region from "Branch" where code='C0006') where "employeeCode"='S001'`);
    const S = await login("S001");
    await call(A, "POST", "teams/outsource", { name: os });
    const mk = async (n) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "CM", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: `W7${n}`, symptom: "ทดสอบรอบสอง" }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      ids.push(id);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    const P = await mk(1); // ระบุอะไหล่ + ขนาดเครื่อง
    const B = await mk(2); // ใบงาน SUB เข้างานอยู่
    await call(S, "POST", `work-orders/${B.id}/parts`, { needsParts: false, assign: { team: os, scheduledAt: today } });
    await call(A, "POST", `work-orders/${B.id}/confirm-appointment`, {});
    await call(S, "POST", `work-orders/${B.id}/dispatch`, {});
    const F = await mk(3); // ช่างแก้ไขเรียบร้อย
    mach = sql(`select "machineId" from "WorkOrder" where id=${P.id}`);
    oldCap = sql(`select coalesce("capacityKg"::text,'null') from "Machine" where id=${mach}`);
    sql(`update "Machine" set "capacityKg"=25 where id=${mach}`);
    const part = sql(`select "partCode"||'|'||id from "SparePart" where "offCatalog"=false order by id limit 1`).split("|");

    const page = await (await browser.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("S001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(4000);
    const open = async (code) => {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await vis("ใบงานซ่อม").first().click();
      await page.waitForTimeout(2500);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
      await page.waitForTimeout(2500);
      await vis(code).last().click();
      await page.waitForTimeout(3500);
    };

    // ── 2) ขนาดเครื่อง + 1) จำนวนอะไหล่ ──
    await open(P.code);
    const mcode = sql(`select code from "Machine" where id=${mach}`);
    (await vis(`เครื่อง ${mcode} · 25 กก.`).count()) ? pass(`หัวใบงานขึ้น เครื่อง ${mcode} · 25 กก.`) : fail("หัวใบงานไม่มีขนาดเครื่อง");
    await vis("ระบุอะไหล่").first().click();
    await page.waitForTimeout(1200);
    await vis("ใช้อะไหล่").first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("ค้นหารหัสหรือชื่ออะไหล่").locator("visible=true").first().fill(part[0]);
    await page.waitForTimeout(1500);
    await vis(part[0]).last().click();
    await page.waitForTimeout(600);
    const qty = label(`จำนวน ${part[0]}`);
    await qty.click();
    await page.keyboard.press("Backspace");
    await page.keyboard.type("8");
    await page.waitForTimeout(300);
    (await qty.inputValue()) === "8" ? pass("ลบเลขเดิมแล้วพิมพ์ 8 ได้ 8 (เดิมเด้งเป็น 18)") : fail(`ช่องจำนวน = ${await qty.inputValue()}`);
    await label(`เพิ่มจำนวน ${part[0]}`).click();
    await page.waitForTimeout(300);
    (await qty.inputValue()) === "9" ? pass("กด + แล้วเป็น 9") : fail(`กด + แล้ว = ${await qty.inputValue()}`);
    await vis("ยืนยัน").last().click();
    await page.waitForTimeout(3500);
    const q = sql(`select coalesce(max(quantity)::text,'-') from "WorkOrderPart" where "workOrderId"=${P.id} and "sparePartId"=${part[1]} and kind='WAITING'`);
    q === "9" ? pass("บันทึกแล้วฐานข้อมูลได้ 9 ชิ้น") : fail(`ฐานข้อมูลได้ ${q}`);

    // ── 3) ใบงาน SUB ──
    await open(B.code);
    await vis("บันทึกผลงาน SUB").first().click();
    await page.waitForTimeout(2000);
    (await label("ทีม SUB ที่เข้าทำ").count()) && (await label("ทีม SUB ที่เข้าทำ").first().textContent()).includes(os)
      ? pass(`ฟอร์มบันทึกผลงาน SUB มีช่องทีม SUB เลือก ${os} ไว้ให้`) : fail("ไม่มีช่องทีม SUB / ไม่ได้เลือกไว้");
    (await label("ผู้เข้าปฏิบัติงานคนที่ 1").count()) === 0 ? pass("ไม่มีช่องช่างบริษัทคนที่ 1–3 (เปิดได้ถ้ามีช่างไปด้วย)") : fail("ยังมีช่องช่างบริษัท");
    await label("มีช่างบริษัทไปด้วย").click();
    await page.waitForTimeout(400);
    (await label("ผู้เข้าปฏิบัติงานคนที่ 1").count()) ? pass("ติ๊กมีช่างบริษัทไปด้วย ช่องคนที่ 1 โผล่") : fail("ติ๊กแล้วไม่มีช่อง");

    // ── 4) ช่างเข้าดำเนินการแก้ไขเรียบร้อย ──
    await open(F.code);
    await label("จบใบงาน").first().click();
    await page.waitForTimeout(800);
    await label("จบ: ไม่ต้องเข้าหน้างาน").click();
    await page.waitForTimeout(1000);
    await label("เหตุผล ช่างเข้าดำเนินการแก้ไขเรียบร้อย").click();
    await page.waitForTimeout(500);
    (await vis("ช่างเข้าซ่อมเสร็จแล้ว แต่ไม่ได้ปิดในระบบ · นับเป็นงานซ่อมเสร็จ").count())
      ? pass("เลือกช่างแก้ไขเรียบร้อย: หัวฟอร์มบอกว่านับเป็นงานซ่อมเสร็จ") : fail("หัวฟอร์มไม่เปลี่ยน");
    await label("ช่างที่เข้าซ่อม").click();
    await page.waitForTimeout(500);
    const tname = sql(`select name from "User" where "employeeCode"='T001'`);
    await vis(tname).last().click();
    await page.waitForTimeout(400);
    await label("รายละเอียดที่ปิดใบงาน").fill("เปลี่ยนบอร์ดแล้ว ทดสอบปกติครบรอบ");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), label("เลือกรูปหลังซ่อม").click()]);
    await chooser.setFiles(PHOTO);
    await page.waitForTimeout(3000);
    await label("ยืนยันปิดใบงาน").click();
    await page.waitForTimeout(5000);
    const done = sql(`select status||'|'||"closeResult" from "WorkOrder" where id=${F.id}`);
    const after = sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${F.id} and role='AFTER'`);
    const worker = sql(`select count(*) from "WorkOrderWorker" w join "User" u on u.id=w."userId" where w."workOrderId"=${F.id} and u."employeeCode"='T001'`);
    done === "DONE|FIXED" && after === "1" && worker === "1"
      ? pass("ฐานข้อมูล: ปิดเป็นซ่อมเสร็จ (FIXED) มีรูปหลังซ่อม บันทึกช่าง T001") : fail(`ปิด: ${done} รูป ${after} ช่าง ${worker}`);
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    sql(`delete from "OutsourceTeam" where name='${os}'`);
    if (mach) sql(`update "Machine" set "capacityKg"=${oldCap} where id=${mach}`);
    sql(`update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    await browser.close();
  }
})();
