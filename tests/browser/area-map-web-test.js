// ทดสอบ: ผังผู้รับผิดชอบ — เบอร์โทร + ผังฝั่ง Area (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
//   · ช่าง (มือถือ): ผังฝ่ายบริการมีเบอร์ + ปุ่มโทร · สลับไปผังฝั่ง Area ได้ เห็นเบอร์ · ไม่มีปุ่มแก้ไข
//   · แอดมิน (จอคอม): แก้ผัง Area — ย้าย Supervisor ไป Area อื่น · ย้ายสาขาไปให้ Supervisor อื่น (ฐานข้อมูล)
//     ระหว่างแก้ไขสลับผังไม่ได้
//   · Area (จอคอม): เปิดมาเจอผังฝั่ง Area · ย้ายสาขาทั้งหมดของคนลาออกให้คนดูแลแทน (ฐานข้อมูล: จำว่าเป็นของใคร)
//     → มีคนใหม่ ส่งต่อเฉพาะสาขาที่ดูแลแทน (ฐานข้อมูล: สาขาเดิมของคนดูแลแทนไม่ติดไป)
//   · Supervisor (COCO): ไม่มีเมนูผังผู้รับผิดชอบ (เจ้าของงานขอ ต.ค. 69 — เหลือเฉพาะ Area)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;

const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const id = (code) => sql(`select id from "User" where "employeeCode"='${code}'`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const tPhone = sql(`select coalesce(phone,'') from "User" where "employeeCode"='T001'`);
  const cleanup = () => {
    sql(`update "Branch" set "cocoSupervisorId"=null, "coverForId"=null, "coverForName"=null, "coverSince"=null where code in ('C0001','C0006','CNX')`);
    sql(`update "User" set "areaId"=null where "employeeCode" like 'zw.%'`);
    sql(`delete from "User" where "employeeCode" like 'zw.%'`);
    sql(`update "User" set phone=NULLIF('${tPhone}','') where "employeeCode"='T001'`);
  };

  try {
    cleanup();
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='A001'`);
    const mk = (code, name, phone, role, area) =>
      sql(`insert into "User"("employeeCode",name,phone,role,"passwordHash","mustChangePassword","areaId")
           values ('${code}','${name}',NULLIF('${phone}',''),'${role}','${hash}',false,(select id from "User" where "employeeCode"=NULLIF('${area}','')))`);
    mk("zw.area1", "ฐิติพรรณ ทดสอบ (บี)", "081-700-0001", "AREA", "");
    mk("zw.area2", "สมฤดี ทดสอบ (ซี)", "", "AREA", "");
    mk("zw.sup1", "กัลยา ทดสอบ (นุ่น)", "089-100-0001", "COCO_SUPERVISOR", "zw.area1");
    mk("zw.sup2", "ปทิตตา ทดสอบ (ปอนด์)", "", "COCO_SUPERVISOR", "zw.area1");
    mk("zw.sup3", "รุ่งนภา ทดสอบ (กล้วย)", "089-100-0003", "COCO_SUPERVISOR", "zw.area2");
    mk("zw.sup4", "มณีรัตน์ ทดสอบ (มายด์)", "089-100-0004", "COCO_SUPERVISOR", "zw.area1");
    const [AREA2, SUP1, SUP2, SUP3, SUP4] = ["zw.area2", "zw.sup1", "zw.sup2", "zw.sup3", "zw.sup4"].map(id);
    sql(`update "Branch" set "cocoSupervisorId"=${SUP1} where code in ('C0001','C0006')`);
    sql(`update "Branch" set "cocoSupervisorId"=${SUP2} where code='CNX'`);
    sql(`update "User" set phone='081-555-0101' where "employeeCode"='T001'`);
    const holders = () => sql(`select string_agg(code||'='||coalesce("cocoSupervisorId"::text,'-')||'/'||coalesce("coverForId"::text,'-'), ' ' order by code) from "Branch" where code in ('C0001','C0006','CNX')`);

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
      // เมนูข้างบนจอคอม · มือถือเปิดจากปุ่มเมนู
      const open = async () => {
        if (!(await vis("ผังผู้รับผิดชอบ").count())) {
          await page.getByLabel("เมนู").first().click().catch(() => {});
          await page.waitForTimeout(800);
        }
        await click(vis("ผังผู้รับผิดชอบ"));
        await page.waitForTimeout(3500);
      };
      return { ctx, page, lbl, vis, click, open };
    };

    // ════ ช่างบนมือถือ ════
    {
      const { ctx, page, lbl, vis, click, open } = await session("T001", { width: 420, height: 900 });
      await open();
      (await vis("081-555-0101").count()) && (await lbl("โทรหา ช่างสมชาย").count())
        ? pass("ช่าง (มือถือ): ผังฝ่ายบริการมีเบอร์ใต้ชื่อ + ปุ่มโทร")
        : fail("ไม่มีเบอร์/ปุ่มโทรของช่าง");
      await vis("081-555-0101").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "area-map-1-phone-service.png") });
      await click(lbl("ผังฝั่ง Area"));
      await page.waitForTimeout(2500);
      (await vis("ผังผู้ดูแลฝั่ง Area").count()) && (await vis("089-100-0003").count()) && (await lbl("โทรหา รุ่งนภา ทดสอบ (กล้วย)").count())
        ? pass("ช่าง: สลับไปผังฝั่ง Area ได้ เห็นเบอร์ Supervisor (COCO) + ปุ่มโทร")
        : fail("ผังฝั่ง Area บนมือถือไม่ครบ");
      (await lbl("แก้ไขผังฝั่ง Area").count()) === 0 ? pass("ช่าง: ไม่มีปุ่มแก้ไขผัง") : fail("ช่างเห็นปุ่มแก้ไข");
      await vis("กัลยา ทดสอบ (นุ่น)").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "area-map-2-phone-area.png") });
      await ctx.close();
    }

    // ════ แอดมิน: ย้าย Supervisor + ย้ายสาขา ════
    {
      const { ctx, page, lbl, vis, click, open } = await session("A001", { width: 1440, height: 1000 });
      await open();
      (await vis("081-555-0101").count()) ? pass("แอดมิน (จอคอม): ผังฝ่ายบริการมีเบอร์") : fail("ไม่มีเบอร์บนผังฝ่ายบริการ");
      await click(lbl("ผังฝั่ง Area"));
      await page.waitForTimeout(2500);
      await click(lbl("แก้ไขผังฝั่ง Area"));
      await page.waitForTimeout(600);
      await click(lbl("ผังฝ่ายบริการ"));
      await page.waitForTimeout(800);
      (await vis("ผังผู้ดูแลฝั่ง Area").count()) ? pass("ระหว่างแก้ไข กดสลับผังแล้วยังอยู่ผังเดิม") : fail("สลับผังได้ทั้งที่กำลังแก้ไข");
      await click(lbl("Supervisor (COCO) ปทิตตา ทดสอบ (ปอนด์)"));
      await page.waitForTimeout(400);
      await click(lbl("หัว Area สมฤดี ทดสอบ (ซี)"));
      await page.waitForTimeout(500);
      await click(lbl("สาขา CNX"));
      await page.waitForTimeout(400);
      await click(lbl("Supervisor รุ่งนภา ทดสอบ (กล้วย)"));
      await page.waitForTimeout(500);
      (await vis("รอบันทึก 2 รายการ").count()) && sql(`select "areaId" from "User" where id=${SUP2}`) !== AREA2
        ? pass("ย้ายแล้วยังไม่บันทึก — รอบันทึก 2 รายการ (ฐานข้อมูลยังไม่เปลี่ยน)")
        : fail("รายการรอบันทึกไม่ถูก");
      await page.screenshot({ path: path.join(DIR, "area-map-3-admin-edit.png") });
      await click(lbl("บันทึกผังฝั่ง Area"));
      await page.waitForTimeout(3000);
      sql(`select "areaId" from "User" where id=${SUP2}`) === AREA2 && holders() === `C0001=${SUP1}/- C0006=${SUP1}/- CNX=${SUP3}/-`
        ? pass("บันทึกผ่านหน้าจอ — ปอนด์อยู่ใต้ Area ซี · CNX ย้ายไปกล้วย (ฐานข้อมูล)")
        : fail(`ฐานข้อมูล: areaId=${sql(`select "areaId" from "User" where id=${SUP2}`)} ${holders()}`);
      await ctx.close();
    }

    // ════ Area: คนลาออก → ดูแลแทน → ส่งต่อคนใหม่ ════
    {
      const { ctx, page, lbl, vis, click, open } = await session("zw.area1", { width: 1440, height: 1000 });
      await open();
      (await vis("ผังผู้ดูแลฝั่ง Area").count()) ? pass("Area: เปิดมาเจอผังฝั่ง Area ก่อน") : fail("Area ไม่ได้เปิดที่ผังฝั่ง Area");
      await click(lbl("แก้ไขผังฝั่ง Area"));
      await page.waitForTimeout(600);
      await click(lbl("ย้ายสาขาทั้งหมดของ กัลยา ทดสอบ (นุ่น)"));
      await page.waitForTimeout(800);
      await click(lbl("เลือกคนที่จะรับสาขา"));
      await page.waitForTimeout(500);
      await click(vis("รุ่งนภา ทดสอบ (กล้วย) · 1 สาขา"));
      await page.waitForTimeout(400);
      (await lbl("ดูแลแทนชั่วคราว").count()) ? pass("หน้าต่างย้ายทั้งหมด: เลือกคนรับ + ดูแลแทนชั่วคราว/ย้ายถาวร") : fail("ไม่มีตัวเลือกดูแลแทน");
      await page.screenshot({ path: path.join(DIR, "area-map-4-move-all.png") });
      await click(lbl("ยืนยันย้าย 2 สาขา"));
      await page.waitForTimeout(600);
      await click(lbl("บันทึกผังฝั่ง Area"));
      await page.waitForTimeout(3000);
      holders() === `C0001=${SUP3}/${SUP1} C0006=${SUP3}/${SUP1} CNX=${SUP3}/-`
        ? pass("ย้ายสาขาทั้งหมดของนุ่นให้กล้วยดูแลแทน — จำว่าเป็นของนุ่น (ฐานข้อมูล)")
        : fail(`ดูแลแทน: ${holders()}`);
      (await vis("ดูแลแทน กัลยา ทดสอบ (นุ่น)", false).count()) ? pass("การ์ดกล้วยแยกกลุ่ม “ดูแลแทน นุ่น” จากสาขาของตัวเอง") : fail("ไม่มีกลุ่มดูแลแทนบนการ์ด");
      await vis("ดูแลแทน กัลยา ทดสอบ (นุ่น)", false).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(DIR, "area-map-5-covering.png") });

      await click(lbl("แก้ไขผังฝั่ง Area"));
      await page.waitForTimeout(600);
      await click(lbl("ส่งต่อสาขาที่ดูแลแทน กัลยา ทดสอบ (นุ่น)"));
      await page.waitForTimeout(800);
      await click(lbl("เลือกคนที่จะรับสาขา"));
      await page.waitForTimeout(500);
      await click(vis("มณีรัตน์ ทดสอบ (มายด์) · 0 สาขา"));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(DIR, "area-map-6-handover.png") });
      await click(lbl("ยืนยันส่งต่อ 2 สาขา"));
      await page.waitForTimeout(600);
      await click(lbl("บันทึกผังฝั่ง Area"));
      await page.waitForTimeout(3000);
      holders() === `C0001=${SUP4}/- C0006=${SUP4}/- CNX=${SUP3}/-`
        ? pass("ส่งต่อให้คนใหม่: 2 สาขาเป็นของมายด์ถาวร · CNX ของกล้วยไม่ติดไป (ฐานข้อมูล)")
        : fail(`ส่งต่อ: ${holders()}`);
      await ctx.close();
    }

    // ════ Supervisor (COCO) — ไม่มีเมนูผังผู้รับผิดชอบแล้ว (เจ้าของงานขอ ต.ค. 69 · เหลือเฉพาะ Area) ════
    {
      const { ctx, page, vis } = await session("zw.sup3", { width: 1280, height: 900 });
      // จอ 1280 เมนูข้างค้างอยู่ — หาด้วย aria-label ของเมนู (ปุ่มบนเว็บไม่ได้เป็น role=button)
      const menu = (t) => page.locator(`[aria-label="${t}"]`).locator("visible=true").count();
      (await menu("ใบงานซ่อม")) > 0 && (await menu("ผังผู้รับผิดชอบ")) === 0 && (await vis("ผังผู้ดูแลฝั่ง Area").count()) === 0
        ? pass("Supervisor (COCO): ไม่มีเมนูผังผู้รับผิดชอบ (เมนูอื่นยังอยู่)")
        : fail("Supervisor (COCO) ยังเห็นเมนูผังผู้รับผิดชอบ/ไม่เห็นเมนูข้าง");
      await ctx.close();
    }
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    cleanup();
    await browser.close();
  }
})();
