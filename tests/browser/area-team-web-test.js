// ทดสอบ: ตำแหน่ง Area Team ผ่านเบราว์เซอร์ — ฟอร์มเปิดใบงานล็อกจนกรอกครบ (รวมรูป)
// · เปิดได้จริง (เช็คฐานข้อมูล) · หน้าใบงานไม่มีปุ่มทำขั้นตอน · ไม่มีคำขอที่โดนปฏิเสธ (403) ระหว่างใช้งานปกติ
// · เมนู: Supervisor (COCO) เห็น 3 เมนู (แผนงาน · กล่องงานของฉัน · ใบงานซ่อม) ไม่มีติดตามเครื่องเสีย/รายงาน/ผังผู้รับผิดชอบ
//   (เจ้าของงานขอ ต.ค. 69 — เหลือเฉพาะ Area) · เปิดมาเจอแผนงาน · หลุดไปหน้าเหล่านั้น (หน้าที่จำไว้ข้ามการโหลดใหม่) ได้หน้ากุญแจ ไม่ยิง API
// · Area เห็นครบ 6 เมนู · ติดตามเครื่องเสียเปิดได้จริง ไม่มีปุ่มส่งออก · ผังผู้รับผิดชอบเปิดมาเจอผังฝั่ง Area · รายงานปุ่มเดียว
// สร้างบัญชี Supervisor (COCO) ชั่วคราวผูกกับสาขา C0006 + บัญชี Area ชั่วคราว แล้วลบทิ้งตอนจบ
const { chromium } = require("playwright");
const { confirmDuplicate } = require("./dup");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");
const DIR = __dirname;
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const LOGIN = "zz.web.sup";
const AREA_LOGIN = "zz.web.area";
// สามเมนูที่เหลือเฉพาะ Area (mobile/src/utils/areaTeam.ts · AREA_ONLY_SCREENS)
const AREA_ONLY_MENU = ["ติดตามเครื่องเสีย", "รายงาน", "ผังผู้รับผิดชอบ"];

function cleanup() {
  sql(`delete from "WorkOrder" where "createdById" in (select id from "User" where "employeeCode" in ('${LOGIN}','${AREA_LOGIN}'));
       update "Branch" set "cocoSupervisorId"=null where "cocoSupervisorId" in (select id from "User" where "employeeCode"='${LOGIN}');
       delete from "User" where "employeeCode" in ('${LOGIN}','${AREA_LOGIN}');`);
}

(async () => {
  cleanup();
  sql(`insert into "User"("employeeCode",name,role,"passwordHash")
       select '${LOGIN}','นางทดสอบ เว็บ (นุ่น)','COCO_SUPERVISOR',"passwordHash" from "User" where "employeeCode"='A001';
       insert into "User"("employeeCode",name,role,"passwordHash")
       select '${AREA_LOGIN}','นางทดสอบ เว็บ (บี)','AREA',"passwordHash" from "User" where "employeeCode"='A001';
       update "Branch" set "cocoSupervisorId"=(select id from "User" where "employeeCode"='${LOGIN}') where code='C0006';`);
  const photo = path.join(os.tmpdir(), "area-team-photo.png");
  // PNG 1×1 จริง — ตัวย่อรูปในฟอร์มต้องเปิดได้
  fs.writeFileSync(photo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const denied = [];
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() === 403) denied.push(`${r.request().method()} ${r.url().replace(/^.*\/api/, "")}`); });
  const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
  const seen = (t, exact = false) => vis(t, exact).count();
  const tap = async (t, exact = true) => {
    const el = vis(t, exact).last();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(async () => el.evaluate((n) => (n.closest("[tabindex]") || n).click()));
  };

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(LOGIN);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(6000);

    // ════ เมนู ════
    // เมนูข้างหาด้วย aria-label (ชื่อเมนู) — ปุ่มบนเว็บไม่ได้เป็น role=button (CLAUDE.md)
    const menuCount = (p, m) => p.locator(`[aria-label="${m}"]`).locator("visible=true").count();
    const menu = ["แผนงาน", "กล่องงานของฉัน", "ใบงานซ่อม", "เปลี่ยนรหัสผ่าน"];
    const missingMenu = [];
    for (const m of menu) if ((await menuCount(page, m)) === 0) missingMenu.push(m);
    missingMenu.length ? fail(`เมนูหาย: ${missingMenu}`) : pass("Supervisor (COCO) เห็น แผนงาน · กล่องงานของฉัน · ใบงานซ่อม · เปลี่ยนรหัสผ่าน");
    const areaOnlyShown = [];
    for (const m of AREA_ONLY_MENU) if ((await menuCount(page, m)) > 0) areaOnlyShown.push(m);
    areaOnlyShown.length
      ? fail(`Supervisor (COCO) ยังเห็นเมนูของ Area: ${areaOnlyShown}`)
      : pass("Supervisor (COCO) ไม่เห็น ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ (เหลือเฉพาะ Area — เจ้าของงานขอ ต.ค. 69)");
    const hidden = ["งานของฉันวันนี้", "หน้าหลัก", "ลงทะเบียนใช้รถ", "รายการอะไหล่", "ระบบหลังบ้าน", "เบิกของใช้สิ้นเปลือง"];
    const leaked = [];
    for (const m of hidden) if ((await menuCount(page, m)) > 0) leaked.push(m);
    leaked.length ? fail(`เห็นเมนูที่ต้องซ่อน: ${leaked}`) : pass("เมนูอื่นซ่อนหมด");
    (await seen("Supervisor (COCO)", true)) > 0 ? pass("หัวจอบอกตำแหน่ง Supervisor (COCO)") : fail("ไม่บอกตำแหน่ง");
    // หน้าแรกหลังเข้าระบบ = แผนงาน (ป้ายขอบเขต "สาขาที่ดูแล" มีเฉพาะหน้าแผนงานของ Supervisor (COCO))
    (await seen("สาขาที่ดูแล", true)) > 0 ? pass("เข้าระบบแล้วเปิดมาเจอแผนงาน (สาขาที่ดูแล)") : fail("หน้าแรกไม่ใช่แผนงาน");
    (await seen("จัดแผน", true)) === 0 ? pass("แผนงาน: ไม่มีปุ่มจัดแผน") : fail("แผนงานยังมีปุ่มจัดแผน");

    // ════ ฟอร์มเปิดใบงาน ════
    await page.locator('[aria-label="ใบงานซ่อม"]').locator("visible=true").last().click();
    await page.waitForTimeout(2500);
    await tap("เพิ่มใบงาน", false);
    await page.waitForTimeout(2500);
    (await seen("ยังบันทึกไม่ได้ — ขาด", false)) > 0 ? pass("ฟอร์มเปล่าบอกว่ายังบันทึกไม่ได้") : fail("ไม่มีแถบบอกช่องที่ขาด");
    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0", { delay: 70 });
    await page.waitForTimeout(2400);
    (await seen("สาขาทดสอบกรุงเทพ", false)) === 0 ? pass("ค้นสาขาไม่เจอสาขาที่ไม่ได้ดูแล (C0001)") : fail("ค้นเจอสาขาคนอื่น");
    await tap("ถนนอุตรกิจ", false);
    await page.waitForTimeout(2000);
    await page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first().fill("W77");
    await tap("Oasis");
    await page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first().fill("เครื่องไม่ปั่น ทดสอบ Area Team");
    await page.getByLabel("ชื่อผู้ติดต่อที่สาขา").locator("visible=true").first().fill("คุณนุ่น");
    await page.getByLabel("เบอร์ติดต่อสาขา").locator("visible=true").first().fill("081-234-5678");
    await page.waitForTimeout(800);
    const lock = await vis("ยังบันทึกไม่ได้ — ขาด 1 ช่อง: รูปหน้างาน", false).count();
    lock > 0 ? pass("กรอกครบแต่ยังไม่มีรูป → ขาด 1 ช่อง: รูปหน้างาน") : fail("แถบช่องที่ขาดไม่ตรง");
    await page.screenshot({ path: path.join(DIR, "area-1-locked.png") });
    const before = sql(`select count(*) from "WorkOrder" where "createdById"=(select id from "User" where "employeeCode"='${LOGIN}')`);
    await vis("เปิดใบงาน").last().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    sql(`select count(*) from "WorkOrder" where "createdById"=(select id from "User" where "employeeCode"='${LOGIN}')`) === before
      ? pass("ปุ่มเปิดใบงานกดไม่ได้ระหว่างที่ยังขาดรูป (ฐานข้อมูลไม่มีใบใหม่)")
      : fail("เปิดใบงานได้ทั้งที่ยังไม่มีรูป");

    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), vis("เลือกรูป").last().click()]);
    await chooser.setFiles(photo);
    await page.waitForTimeout(2500);
    (await seen("ยังบันทึกไม่ได้", false)) === 0 ? pass("แนบรูปแล้วแถบช่องที่ขาดหายไป") : fail("แนบรูปแล้วยังล็อก");
    await page.screenshot({ path: path.join(DIR, "area-2-ready.png") });
    await vis("เปิดใบงาน").last().click();
    // สาขาทดสอบมีใบค้างอยู่ — ป๊อปอัพยืนยันเปิดซ้ำ (ต.ค. 69)
    await confirmDuplicate(page);
    await page.waitForTimeout(7000);
    const row = sql(`select w.code||'|'||b.code||'|'||coalesce(w."contactPhone",'')||'|'||(select count(*) from "WorkOrderAttachment" a where a."workOrderId"=w.id)
                     from "WorkOrder" w join "Branch" b on b.id=w."branchId" where w."createdById"=(select id from "User" where "employeeCode"='${LOGIN}') order by w.id desc limit 1`);
    const [code, branch, phone, files] = row.split("|");
    branch === "C0006" && phone === "081-234-5678" && Number(files) >= 1
      ? pass(`เปิดใบงาน ${code} ได้ พร้อมเบอร์และรูป (ฐานข้อมูล)`)
      : fail(`ใบงานในฐานข้อมูล: ${row}`);

    // ════ หน้าใบงาน — ดูอย่างเดียว ════
    await page.screenshot({ path: path.join(DIR, "area-3-detail.png") });
    (await seen(code, false)) > 0 ? pass("บันทึกแล้วไปหน้าใบงาน") : fail("ไม่ได้ไปหน้าใบงาน");
    // หาเป็นปุ่ม (ชื่อปุ่มในแถบขั้นตอนเป็นข้อความเฉย ๆ ไม่ใช่ปุ่ม)
    const actions = ["แก้ไขอาการ/สถานะ", "บันทึกอะไหล่", "จ่ายงาน", "ปิดงาน", "ยกเลิกใบงาน", "คัดลอกเป็นใบทดสอบ", "เลือกรูป"];
    const shown = [];
    for (const a of actions) if ((await vis(a, true).count()) > 0) shown.push(a);
    shown.length ? fail(`หน้าใบงานมีปุ่มทำขั้นตอน: ${shown}`) : pass("หน้าใบงานไม่มีปุ่มทำขั้นตอน");

    // ════ หน้าอื่น ๆ ที่ยังมี ════
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    for (const m of ["กล่องงานของฉัน", "ใบงานซ่อม", "แผนงาน"]) {
      await page.locator(`[aria-label="${m}"]`).locator("visible=true").last().click();
      await page.waitForTimeout(3000);
    }

    // ════ หลุดไปหน้าของ Area — หน้าที่แอปจำไว้ข้ามการโหลดใหม่ (สลับโหมดมืด · navigationRef.ts) ════
    // เมนูซ่อนแล้วแต่ทางนี้ยังพาไปถึงได้ — ต้องได้หน้ากุญแจ ไม่ใช่หน้าที่ยิง API แล้วโดน 403
    const supId = Number(sql(`select id from "User" where "employeeCode"='${LOGIN}'`));
    const lockedOn = async (screen) => {
      const before = denied.length;
      await page.evaluate(
        ([userId, name]) =>
          sessionStorage.setItem(
            "otteri-nav-restore",
            JSON.stringify({ userId, state: { routes: [{ name: "HomeTab", state: { routes: [{ name: "PlanBoard" }, { name }] } }] } })
          ),
        [supId, screen]
      );
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(4000);
      const lock = await seen("เมนูนี้สำหรับตำแหน่ง Area เท่านั้น", true);
      return { lock, denied: denied.slice(before) };
    };
    for (const screen of ["MachineDashboard", "ReportsMenu", "CoverageMap"]) {
      const r = await lockedOn(screen);
      r.lock > 0 && r.denied.length === 0
        ? pass(`Supervisor (COCO) หลุดไป ${screen}: ขึ้นหน้ากุญแจ "เมนูนี้สำหรับตำแหน่ง Area เท่านั้น" ไม่ยิง API ที่โดน 403`)
        : fail(`${screen}: หน้ากุญแจ=${r.lock} คำขอโดนปฏิเสธ=${r.denied.join(", ")}`);
    }
    await page.screenshot({ path: path.join(DIR, "area-4-locked-screen.png") });
    await tap("ไปที่แผนงาน");
    await page.waitForTimeout(2500);
    (await seen("สาขาที่ดูแล", true)) > 0 && (await seen("เมนูนี้สำหรับตำแหน่ง Area เท่านั้น", true)) === 0
      ? pass("ปุ่ม ไปที่แผนงาน บนหน้ากุญแจพากลับแผนงาน")
      : fail("ปุ่ม ไปที่แผนงาน ไม่พากลับ");
    denied.length ? fail(`มีคำขอโดนปฏิเสธระหว่างใช้งาน: ${[...new Set(denied)].join(", ")}`) : pass("Supervisor (COCO) ใช้งานทุกหน้าไม่มีคำขอโดนปฏิเสธ (403)");

    // ════ Area — สามเมนูยังอยู่ครบ ════
    const ap = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await ap.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    const areaDenied = [];
    ap.on("response", (r) => { if (r.url().includes("/api/") && r.status() === 403) areaDenied.push(`${r.request().method()} ${r.url().replace(/^.*\/api/, "")}`); });
    const aSeen = (t, exact = false) => ap.getByText(t, { exact }).locator("visible=true").count();
    await ap.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await ap.getByPlaceholder("รหัสพนักงาน").fill(AREA_LOGIN);
    await ap.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await ap.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
    await ap.waitForTimeout(6000);
    const areaMissing = [];
    for (const m of ["แผนงาน", "กล่องงานของฉัน", "ใบงานซ่อม", ...AREA_ONLY_MENU]) if ((await menuCount(ap, m)) === 0) areaMissing.push(m);
    areaMissing.length ? fail(`Area เมนูหาย: ${areaMissing}`) : pass("Area เห็นครบ 6 เมนู (รวม ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ)");
    (await aSeen("สาขา COCO ทั้งหมด", true)) > 0 ? pass("Area เข้าระบบแล้วเปิดมาเจอแผนงาน (สาขา COCO ทั้งหมด)") : fail("หน้าแรกของ Area ไม่ใช่แผนงาน");
    for (const m of ["ติดตามเครื่องเสีย", "ผังผู้รับผิดชอบ", "รายงาน", "กล่องงานของฉัน"]) {
      await ap.locator(`[aria-label="${m}"]`).locator("visible=true").last().click();
      await ap.waitForTimeout(3000);
      if (m !== "กล่องงานของฉัน" && (await aSeen("เมนูนี้สำหรับตำแหน่ง Area เท่านั้น", true)) > 0) fail(`Area เปิด ${m} แล้วเจอหน้ากุญแจ`);
      // เช็คตอนหน้านั้นยังเปิดอยู่ — กดเมนูถัดไปแล้วหน้าเดิมถูกซ่อน นับปุ่มทีหลังได้ 0 เสมอ (เคยผ่านทั้งที่ไม่ได้ดูหน้าจริง)
      // ต้องเห็นของที่มีแค่หน้านั้นด้วย ไม่งั้น "ไม่มีหน้ากุญแจ" อย่างเดียวผ่านได้แม้หน้าโหลดไม่ขึ้น
      if (m === "ติดตามเครื่องเสีย") {
        (await aSeen("Power Off")) > 0 && (await aSeen("ส่งออก Excel", true)) === 0
          ? pass("Area ติดตามเครื่องเสีย: เปิดหน้าได้จริง (แท็บเครื่องดับ) ไม่มีปุ่มส่งออก")
          : fail("Area ติดตามเครื่องเสีย: ไม่เห็นแท็บเครื่องดับ หรือยังมีปุ่มส่งออก");
      }
      if (m === "ผังผู้รับผิดชอบ") {
        (await aSeen("ผังผู้ดูแลฝั่ง Area", true)) > 0 && (await aSeen("โหลดผังฝั่ง Area ไม่ได้", true)) === 0
          ? pass("Area ผังผู้รับผิดชอบ: เปิดมาเจอผังผู้ดูแลฝั่ง Area โหลดได้")
          : fail("Area ผังผู้รับผิดชอบ: ไม่เห็นผังผู้ดูแลฝั่ง Area หรือโหลดไม่ได้");
      }
    }
    await ap.locator('[aria-label="รายงาน"]').locator("visible=true").last().click();
    await ap.waitForTimeout(2500);
    (await aSeen("ดาวน์โหลด Excel", true)) === 1 && (await aSeen("รายงานตามผู้เปิดใบงาน", false)) === 0 && (await aSeen("ใบงานทุกสถานะของสาขา COCO ทั้งหมด", false)) > 0
      ? pass("Area หน้ารายงานมีปุ่มเดียว (ใบงานของสาขา COCO ทั้งหมด)")
      : fail("หน้ารายงานของ Area ไม่ใช่ปุ่มเดียว");
    await ap.screenshot({ path: path.join(DIR, "area-5-report.png") });
    areaDenied.length ? fail(`Area มีคำขอโดนปฏิเสธ: ${[...new Set(areaDenied)].join(", ")}`) : pass("Area ใช้สามเมนูไม่มีคำขอโดนปฏิเสธ (403)");
    await ap.close();
  } catch (e) {
    fail("ทดสอบพัง: " + e.message);
    await page.screenshot({ path: path.join(DIR, "area-error.png") }).catch(() => {});
  } finally {
    await browser.close();
    cleanup();
    fs.rmSync(photo, { force: true });
  }
})();
