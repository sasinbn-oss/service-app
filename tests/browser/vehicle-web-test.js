// ทดสอบ: ลงทะเบียนใช้รถแบบ FLEET ผ่านเบราว์เซอร์จริง
// ช่างเบิกรถ (ไมล์ + ไปทำอะไร + รูป 5 รูป) → คืนรถ (แจ้งซ่อม) → แอดมินเห็นในภาพรวม/ประวัติ/ทะเบียน
// ยืนยันผลที่ฐานข้อมูลด้วย ไม่เชื่อข้อความบนจออย่างเดียว
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const PHOTO = path.join(DIR, "..", "site-photo.png");

const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -Atc ${JSON.stringify(q)}`).toString().trim();

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];

  const plate = "ทดสอบ-9" + String(Date.now()).slice(-3);
  sql(`insert into "Vehicle" ("plateNumber", brand, status, "currentMileage", "updatedAt") values ('${plate}', 'Toyota', 'AVAILABLE', 5000, now())`);
  const vid = sql(`select id from "Vehicle" where "plateNumber"='${plate}'`);

  async function session(user, viewport) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(String(e)));
    // แท็บอื่นยังถูกวาดค้างอยู่ข้างหลัง ข้อความ/ปุ่มเดียวกันจึงมีหลายตัว — เลือกตัวที่อยู่บนสุดจริง ๆ
    const topmost = async (loc) => {
      const n = await loc.count();
      for (let i = n - 1; i >= 0; i--) {
        const hit = await loc.nth(i).evaluate((node) => {
          const r = node.getBoundingClientRect();
          const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!at && (node.contains(at) || at.contains(node));
        }).catch(() => false);
        if (hit) return loc.nth(i);
      }
      return null;
    };
    const tap = async (t, exact = true) => {
      const loc = page.getByText(t, { exact }).locator("visible=true");
      const el = (await topmost(loc)) ?? loc.last();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click().catch(async () => el.evaluate((n) => (n.closest("[tabindex]") || n).click()));
    };
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(user);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);
    const menu = async (label) => {
      // จอกว้างเมนูข้างค้างอยู่แล้ว — ปุ่ม ☰ ถูกบังอยู่ กดเฉพาะตอนยังไม่เห็นรายการเมนู
      const btn = await topmost(page.getByLabel("เปิดเมนู").locator("visible=true"));
      if (btn && !(await topmost(page.getByText(label, { exact: true }).locator("visible=true")))) await btn.click();
      await page.waitForTimeout(500);
      await tap(label);
      await page.waitForTimeout(2500);
    };
    return { page, tap, menu, topmost };
  }

  async function addPhotos(page, n) {
    for (let i = 0; i < n; i++) {
      const slot = page.getByLabel(new RegExp(`^${i + 1}\\. `)).locator("visible=true").first();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15000 }).catch(async (e) => {
          await page.screenshot({ path: path.join(DIR, "veh-fail.png"), fullPage: true });
          throw e;
        }),
        slot.click(),
      ]);
      await chooser.setFiles(PHOTO);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(2500);
  }

  try {
    // ── ช่าง ──
    const t = await session("T001", { width: 420, height: 1500 });
    await t.menu("ลงทะเบียนใช้รถ");
    await t.page.getByLabel(`เลือกรถ ${plate}`).click();
    await t.page.waitForTimeout(800);
    await t.page.getByLabel("เลขไมล์ตอนเบิก").fill("5020");
    await t.page.waitForTimeout(300);
    (await t.page.getByText("ต่างจากล่าสุด +20").count()) ? pass("เตือนไมล์ต่างจากล่าสุดทันที") : fail("ไม่เห็นคำเตือนไมล์");
    await t.tap("ตรวจหน้างาน");
    await t.page.getByLabel("ปลายทาง").fill("สาขาทดสอบ");
    await addPhotos(t.page, 5);
    (await t.page.getByText("อัปโหลดแล้วทั้งหมด (5/5)").count()) ? pass("อัปรูป 5 รูปเบื้องหลังครบ") : fail("รูปยังอัปไม่ครบ");
    await t.page.screenshot({ path: path.join(DIR, "veh-1-checkout.png"), fullPage: true });
    await t.tap("ยืนยันนำรถออกใช้งาน");
    await t.page.waitForTimeout(3000);
    (await t.page.getByText("เบิกรถเรียบร้อย").count()) ? pass("ขึ้นกล่องเบิกรถเรียบร้อย") : fail("ไม่เห็นกล่องเบิกรถเรียบร้อย");
    await t.tap("ตกลง");
    await t.page.waitForTimeout(500);
    const log = sql(`select id||'|'||"startMileage"||'|'||"mileageGap"||'|'||(select count(*) from "VehicleLogPhoto" p where p."logId"=l.id) from "VehicleLog" l where "vehicleId"=${vid} and status='ONGOING'`);
    const [logId, sm, gap, photos] = log.split("|");
    sm === "5020" && gap === "20" && photos === "5" ? pass(`DB: เบิกแล้ว ไมล์ 5020 gap 20 รูป 5 (${log})`) : fail(`DB หลังเบิกไม่ตรง: ${log}`);
    sql(`select status from "Vehicle" where id=${vid}`) === "IN_USE" ? pass("DB: รถเป็นกำลังใช้งาน") : fail("รถไม่เป็น IN_USE");
    (await t.page.getByText("ยืนยันคืนรถ").count()) ? pass("หน้าเปลี่ยนเป็นคืนรถ") : fail("ไม่เห็นหน้าคืนรถ");

    await t.page.getByLabel("เลขไมล์ตอนคืน").fill("5000");
    await t.page.waitForTimeout(300);
    (await t.page.getByText("ต้องไม่น้อยกว่าตอนเบิก", { exact: false }).count()) ? pass("ไมล์คืนน้อยกว่าตอนเบิกถูกเตือน") : fail("ไม่เตือนไมล์คืนต่ำ");
    await t.page.getByLabel("เลขไมล์ตอนคืน").fill("5150");
    await addPhotos(t.page, 5);
    await t.page.getByLabel("ค่าใช้จ่าย").fill("350");
    await t.page.getByLabel("แจ้งซ่อม").fill("ไฟเบรกหลังขวาไม่ติด");
    await t.page.screenshot({ path: path.join(DIR, "veh-2-return.png"), fullPage: true });
    await t.tap("ยืนยันคืนรถ");
    await t.page.waitForTimeout(3000);
    (await t.page.getByText("คืนรถเรียบร้อย").count()) ? pass("ขึ้นกล่องคืนรถเรียบร้อย") : fail("ไม่เห็นกล่องคืนรถเรียบร้อย");
    await t.tap("ตกลง");
    await t.page.waitForTimeout(500);
    const done = sql(`select status||'|'||"endMileage"||'|'||cost||'|'||coalesce("repairNote",'') from "VehicleLog" where id=${logId}`);
    done === "COMPLETED|5150|350|ไฟเบรกหลังขวาไม่ติด" ? pass(`DB: คืนแล้ว (${done})`) : fail(`DB หลังคืนไม่ตรง: ${done}`);
    const v = sql(`select status||'|'||"currentMileage"||'|'||coalesce("maintNote",'') from "Vehicle" where id=${vid}`);
    /^AVAILABLE\|5150\|ช่างแจ้งซ่อม .*ไฟเบรกหลังขวาไม่ติด$/.test(v) ? pass(`DB: รถกลับเป็นว่าง ไมล์ 5150 มีแจ้งซ่อม`) : fail(`DB รถไม่ตรง: ${v}`);

    await t.menu("ประวัติการใช้รถของฉัน");
    (await t.page.getByText(plate).locator("visible=true").count()) ? pass("ประวัติของฉันเห็นรายการ") : fail("ประวัติของฉันไม่เห็นรายการ");
    await t.page.getByLabel(`ดูรายการ ${plate}`).first().click();
    await t.page.waitForTimeout(2000);
    const thumbs = await t.page.getByLabel(/^เปิดรูป \d+$/).locator("visible=true").count();
    thumbs === 10 ? pass("รายละเอียดแสดงรูปเบิก+คืน 10 รูป") : fail(`รูปในรายละเอียด ${thumbs}`);
    await t.page.screenshot({ path: path.join(DIR, "veh-3-mine.png"), fullPage: true });
    await t.page.getByLabel("ปิด", { exact: true }).locator("visible=true").last().click();
    await t.page.waitForTimeout(500);
    // เมนูแอดมินต้องไม่โผล่ให้ช่าง
    const tb = await t.topmost(t.page.getByLabel("เปิดเมนู").locator("visible=true"));
    if (tb) await tb.click();
    await t.page.waitForTimeout(500);
    (await t.topmost(t.page.getByText("ประวัติการใช้รถของฉัน", { exact: true }).locator("visible=true"))) &&
    !(await t.topmost(t.page.getByText("ภาพรวมรถ", { exact: true }).locator("visible=true"))) ? pass("ช่างเห็นแค่เมนูรถของช่าง ไม่เห็นเมนูแอดมิน") : fail("เมนูรถของช่างไม่ถูกต้อง");

    // ── แอดมิน ──
    const a = await session("A001", { width: 1280, height: 1400 });
    await a.menu("ภาพรวมรถ");
    (await a.page.getByText("กิโลเมตรที่ใช้ แยกรายคัน").count()) ? pass("ภาพรวมรถเปิดได้") : fail("ภาพรวมรถไม่ขึ้น");
    (await a.page.getByText("130 กม.").locator("visible=true").count()) ? pass("ภาพรวมนับ 130 กม. ของคันทดสอบ") : fail("ไม่เห็น 130 กม.");
    (await a.page.getByText(/เลขไมล์ไม่ต่อเนื่อง \d+ รายการ/).count()) ? pass("ภาพรวมเตือนไมล์ไม่ต่อเนื่อง") : fail("ไม่เห็นคำเตือนไมล์ไม่ต่อเนื่อง");
    await a.page.screenshot({ path: path.join(DIR, "veh-4-dash.png"), fullPage: true });

    await a.menu("ประวัติการใช้รถ");
    (await a.page.getByText(plate).locator("visible=true").count()) ? pass("ประวัติแอดมินเห็นรายการ") : fail("ประวัติแอดมินไม่เห็นรายการ");
    await a.page.screenshot({ path: path.join(DIR, "veh-5-log.png"), fullPage: true });

    await a.menu("ทะเบียน & ซ่อมบำรุง");
    (await a.page.getByText(`แจ้งซ่อม: ${plate}`).count()) ? pass("ทะเบียนแสดงแจ้งซ่อมของช่าง") : fail("ไม่เห็นแจ้งซ่อม");
    await a.page.getByLabel(`เปิดรถ ${plate}`).click();
    await a.page.waitForTimeout(800);
    await a.page.getByLabel("ภาษีหมดอายุ").fill("2026-10-20");
    await a.tap("บันทึกข้อมูล");
    await a.page.waitForTimeout(2000);
    sql(`select "taxExpire"::date from "Vehicle" where id=${vid}`) === "2026-10-20" ? pass("DB: บันทึกวันภาษีหมดอายุ") : fail("วันภาษีไม่ถูกบันทึก");
    await a.tap("ตกลง").catch(() => {});
    await a.page.waitForTimeout(500);
    await a.tap("ประวัติซ่อมบำรุง");
    await a.page.waitForTimeout(1200);
    (await a.page.getByText("ไฟเบรกหลังขวาไม่ติด").locator("visible=true").count()) ? pass("ประวัติซ่อมมีรายการช่างแจ้ง") : fail("ไม่เห็นรายการช่างแจ้งในประวัติซ่อม");
    await a.tap("บันทึกการซ่อม / เปลี่ยนน้ำมัน");
    await a.page.waitForTimeout(500);
    await a.page.getByLabel("ค่าใช้จ่าย (บาท)").fill("1200");
    await a.tap("บันทึก");
    await a.page.waitForTimeout(2500);
    const m = sql(`select "lastOilKm"||'|'||coalesce("maintNote",'(null)') from "Vehicle" where id=${vid}`);
    m === "5150|(null)" ? pass("DB: เปลี่ยนน้ำมันเริ่มรอบใหม่ที่ 5150 และล้างแจ้งซ่อม") : fail(`DB หลังบันทึกซ่อม: ${m}`);
    await a.page.screenshot({ path: path.join(DIR, "veh-6-maint.png"), fullPage: true });
  } catch (e) {
    fail(String(e));
  } finally {
    // ล้างข้อมูลทดสอบ — รูปใน mock storage ทิ้งไว้ได้ ไม่ใช่ข้อมูลจริง
    sql(`delete from "VehicleLogPhoto" where "logId" in (select id from "VehicleLog" where "vehicleId"=${vid})`);
    sql(`delete from "VehicleMaintenance" where "vehicleId"=${vid}`);
    sql(`delete from "VehicleLog" where "vehicleId"=${vid}`);
    sql(`delete from "Vehicle" where id=${vid}`);
    errors.length ? fail("page errors: " + errors.join(" | ")) : pass("ไม่มี error ในหน้า");
    await browser.close();
  }
})();
