// ทดสอบ: ผังฝั่ง Area แบบใหม่ (เจ้าของงานขอ ต.ค. 69 — ผังเดิมไม่มี Maid ใหญ่ดูยาก ไม่มีแถบเลื่อน/ซูม ต้องเลื่อนไปล่างสุด)
//   · แอดมิน (จอคอม): เปิดมาเห็นการ์ด Area ทั้งหมดก่อน (Area เกิน 3 = ยังไม่กาง) · กดการ์ดกาง Supervisor + Maid ใต้แถว
//     แถบเครื่องมือติดบนสุดตอนเลื่อน · แถบเลื่อนเห็นตลอด (CSS) · ชิปเกิน 6 สาขาย่อเป็น "+n" · กางทั้งหมด/ย่อทั้งหมด
//     ขนาดผัง (กะทัดรัด/ปกติ/ใหญ่) จำไว้หลังโหลดใหม่ · ค้นหารหัสสาขา → คำตอบด่วน (Supervisor · Maid · Area + เบอร์) · ค้นชื่อ Maid
//     Enter ไปผลถัดไป · แก้ไขผัง: ย้ายสาขาที่มี Maid → รายการรอบันทึกบอกว่า Maid ย้ายตาม → บันทึก (ฐานข้อมูล) → Maid ขึ้นใต้คนใหม่
//     วางรหัสสาขาบนการ์ด Area = กาง Area นั้น ไม่ได้ยกสาขาให้คน Area (ฐานข้อมูลไม่เปลี่ยน)
//   · Area / Maid (COCO): เปิดมาเจอ Area ของตัวเองกางรอ
//   · ช่าง (มือถือ): ติดบนสุดแค่ช่องค้นหา · ค้นรหัสสาขาแล้วได้ปุ่มโทรหา Maid
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;

const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const id = (code) => sql(`select id from "User" where "employeeCode"='${code}'`);

const AREAS = ["อัมพร ทดสอบผัง", "บุษบา ทดสอบผัง", "จารุวรรณ ทดสอบผัง", "ดวงใจ ทดสอบผัง", "เพ็ญศรี ทดสอบผัง"];
const SUP = (a, s) => `ซุป${a}${s} ทดสอบผัง`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const cleanup = () => {
    sql(`update "Branch" set "cocoSupervisorId"=null, "coverForId"=null, "coverForName"=null, "coverSince"=null where code like 'CY%'`);
    sql(`delete from "Branch" where code like 'CY%'`);
    sql(`update "User" set "areaId"=null where "employeeCode" like 'zx.%'`);
    sql(`delete from "User" where "employeeCode" like 'zx.%'`);
  };

  try {
    cleanup();
    // Area 5 คน × Supervisor 3 คน × 2 สาขา (ซุป11 ถือ 9 สาขา ให้เห็นการย่อชิป) · Maid 2 คน (คนหนึ่งลบบัญชีแล้ว)
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='A001'`);
    const mk = (code, name, phone, role, area) =>
      sql(`insert into "User"("employeeCode",name,phone,role,"passwordHash","mustChangePassword","areaId")
           values ('${code}','${name}',NULLIF('${phone}',''),'${role}','${hash}',false,(select id from "User" where "employeeCode"=NULLIF('${area}','')))`);
    let n = 0;
    const br = () => {
      n++;
      const c = `CY${String(n).padStart(3, "0")}`;
      sql(`insert into "Branch"(code,name) values ('${c}','ทดสอบผัง ${n}')`);
      return c;
    };
    for (let a = 1; a <= 5; a++) {
      mk(`zx.area${a}`, AREAS[a - 1], `081-700-00${a}${a}`, "AREA", "");
      for (let s = 1; s <= 3; s++) {
        mk(`zx.sup${a}${s}`, SUP(a, s), `089-200-0${a}${s}0`, "COCO_SUPERVISOR", `zx.area${a}`);
        const cnt = a === 1 && s === 1 ? 9 : 2;
        for (let k = 0; k < cnt; k++) sql(`update "Branch" set "cocoSupervisorId"=${id(`zx.sup${a}${s}`)} where code='${br()}'`);
      }
    }
    mk("zx.maid1", "ฝนทิพย์ แม่บ้านทดสอบ", "089-300-1111", "COCO_MAID", "");
    mk("zx.maid2", "นิดา แม่บ้านลาออก", "089-300-2222", "COCO_MAID", "");
    sql(`insert into "CocoMaidBranch"("userId","branchId") select ${id("zx.maid1")}, id from "Branch" where code in ('CY001','CY017')`);
    sql(`insert into "CocoMaidBranch"("userId","branchId") select ${id("zx.maid2")}, id from "Branch" where code='CY002'`);
    sql(`update "User" set "deletedAt"=now() where "employeeCode"='zx.maid2'`);
    const holderOf = (c) => sql(`select coalesce("cocoSupervisorId"::text,'-') from "Branch" where code='${c}'`);
    // CY001 = ซุป11 (Area 1) · CY017 = ซุป22 (Area 2) · Maid ฝนทิพย์ประจำทั้งสองสาขา

    const session = async (user, viewport) => {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`${user}: ${String(e)}`));
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.evaluate(() => localStorage.removeItem("areaMap.ui.v1"));
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
      const open = async () => {
        if (!(await vis("ผังผู้รับผิดชอบ").count())) {
          await page.getByLabel("เมนู").first().click().catch(() => {});
          await page.waitForTimeout(800);
        }
        await click(vis("ผังผู้รับผิดชอบ"));
        await page.waitForTimeout(3000);
        if (!(await vis("ผังผู้ดูแลฝั่ง Area").count())) {
          await click(lbl("ผังฝั่ง Area"));
          await page.waitForTimeout(2500);
        }
      };
      const search = async (q) => {
        await lbl("ค้นหาในผังฝั่ง Area").first().fill(q);
        await page.waitForTimeout(900);
      };
      return { ctx, page, lbl, vis, click, open, search };
    };

    // ════ แอดมิน (จอคอม) ════
    {
      const { ctx, page, lbl, vis, click, open, search } = await session("A001", { width: 1440, height: 1000 });
      await open();
      const tiles = await Promise.all(AREAS.map((a) => lbl(`กางดู Area ${a}`).count()));
      tiles.every((c) => c === 1) && (await vis(SUP(1, 1)).count()) === 0
        ? pass("เปิดมาเห็นการ์ด Area ทั้ง 5 คน ยังไม่กาง (Area เกิน 3)")
        : fail(`การ์ด Area: ${JSON.stringify(tiles)} · ซุป11 เห็น ${await vis(SUP(1, 1)).count()}`);
      (await vis("Maid (COCO)").count()) ? pass("ตัวเลขรวมมี Maid (COCO)") : fail("ไม่มีตัวเลข Maid (COCO)");
      const css = await page.evaluate(() =>
        [...document.querySelectorAll("style")].some((s) => s.textContent.includes(".am-scroll::-webkit-scrollbar{width:12px")) && !!document.querySelector(".am-scroll")
      );
      css ? pass("แถบเลื่อนเห็นตลอด: ใส่ CSS แถบเลื่อนให้กล่องเลื่อนของผัง") : fail("ไม่มี CSS แถบเลื่อน");
      await page.screenshot({ path: path.join(DIR, "area-map-new-1-overview.png") });

      await click(lbl(`กางดู Area ${AREAS[0]}`));
      await page.waitForTimeout(800);
      (await vis(SUP(1, 1)).count()) && (await vis(SUP(1, 3)).count()) && (await vis(SUP(2, 1)).count()) === 0
        ? pass("กดการ์ด Area 1 → กาง Supervisor ของ Area นั้นเท่านั้น")
        : fail("กางการ์ดไม่ถูก");
      (await vis("Maid (COCO) ประจำสาขา (1)").count()) && (await vis("089-300-1111").count())
        ? pass("Maid (COCO) ขึ้นใต้ Supervisor ที่ถือสาขา พร้อมเบอร์")
        : fail("ไม่เห็นกล่อง Maid ใต้ซุป11");
      (await vis("นิดา แม่บ้านลาออก", false).count()) === 0 ? pass("Maid ที่ลบบัญชีแล้วไม่ขึ้น") : fail("Maid ลาออกยังขึ้นในผัง");
      (await lbl("สาขา CY007").count()) === 0 && (await lbl(`แสดงสาขาของ ${SUP(1, 1)} ทั้งหมด`).count())
        ? pass("ซุป11 ถือ 9 สาขา: โชว์ 6 + ปุ่ม “+3 สาขา”")
        : fail("ชิปไม่ถูกย่อ");
      await click(lbl(`แสดงสาขาของ ${SUP(1, 1)} ทั้งหมด`));
      await page.waitForTimeout(400);
      (await lbl("สาขา CY009").count()) ? pass("กด +3 แล้วเห็นครบ 9 สาขา") : fail("กด +3 แล้วยังไม่ครบ");

      // แถบเครื่องมือติดบนสุด
      await page.mouse.move(800, 700);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(800);
      const box = await lbl("ค้นหาในผังฝั่ง Area").first().boundingBox();
      box && box.y > 50 && box.y < 160 ? pass(`เลื่อนลงแล้วแถบเครื่องมือยังติดบนสุด (ช่องค้นหา y=${Math.round(box.y)})`) : fail(`ช่องค้นหาหลุดจอ: ${JSON.stringify(box)}`);
      await page.screenshot({ path: path.join(DIR, "area-map-new-2-sticky.png") });

      // ค้นหารหัสสาขา → คำตอบด่วน
      await search("CY017");
      const q = await page.evaluate(() => document.getElementById("am-quick")?.innerText || "");
      q.includes(SUP(2, 2)) && q.includes("ฝนทิพย์ แม่บ้านทดสอบ") && q.includes(AREAS[1]) && q.includes("089-300-1111")
        ? pass("ค้น CY017 → คำตอบด่วน: Supervisor · Maid · Area พร้อมเบอร์")
        : fail(`คำตอบด่วน: ${q.slice(0, 200)}`);
      (await vis("พบ 1 · 1/1").count()) && (await vis(SUP(2, 2)).count()) ? pass("ตัวนับผลค้นหา พบ 1 · 1/1 + กาง Area ที่พบให้เอง") : fail("ตัวนับ/การกาง Area ที่พบไม่ถูก");
      await page.screenshot({ path: path.join(DIR, "area-map-new-3-quick.png") });
      await search("ฝนทิพย์");
      const q2 = await page.evaluate(() => document.getElementById("am-quick")?.innerText || "");
      q2.includes("Maid (COCO)") && q2.includes("CY001") && q2.includes(AREAS[0]) ? pass("ค้นชื่อ Maid → บอกสาขาที่ประจำ + Area") : fail(`ค้นชื่อ Maid: ${q2.slice(0, 200)}`);
      await search("CY00");
      await lbl("ค้นหาในผังฝั่ง Area").first().press("Enter");
      await page.waitForTimeout(800);
      (await vis("พบ 9 · 2/9").count()) ? pass("Enter → ไปผลถัดไป (2/9)") : fail("Enter ไม่เลื่อนผลค้นหา");
      await lbl("ล้างคำค้น").first().click();
      await page.waitForTimeout(500);

      // ขนาดผัง — จำไว้หลังโหลดใหม่
      await click(lbl("ขยายขนาดผัง"));
      await page.waitForTimeout(500);
      const ui = await page.evaluate(() => JSON.parse(localStorage.getItem("areaMap.ui.v1") || "{}"));
      (await vis("ใหญ่").count()) && ui.z === 2 ? pass("ขยายผัง → ขนาด “ใหญ่” จำไว้ในเครื่อง") : fail(`ขนาดผัง: ${JSON.stringify(ui)}`);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(4000);
      await open();
      (await vis("ใหญ่").count()) && (await vis(SUP(1, 1)).count()) ? pass("โหลดใหม่ ยังเป็นขนาดใหญ่ และ Area ที่กางไว้ยังกาง") : fail("โหลดใหม่แล้วลืมขนาด/Area ที่กาง");
      await click(lbl("ย่อขนาดผัง"));
      await page.waitForTimeout(300);

      await click(lbl("กางทุก Area"));
      await page.waitForTimeout(800);
      (await vis(SUP(5, 3)).count()) && (await lbl("ย่อทุก Area").count()) ? pass("กางทั้งหมด → เห็นทุก Area · ปุ่มเปลี่ยนเป็นย่อทั้งหมด") : fail("กางทั้งหมดไม่ได้");
      await page.mouse.move(800, 700);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(800);
      if (await lbl("กลับขึ้นบน").count()) {
        await lbl("กลับขึ้นบน").first().click();
        await page.waitForTimeout(1200);
        const top = await page.evaluate(() => document.querySelector(".am-scroll")?.scrollTop ?? -1);
        top === 0 ? pass("เลื่อนลงไกล → ปุ่มกลับขึ้นบน กดแล้วกลับบนสุด") : fail(`กดกลับขึ้นบนแล้ว scrollTop=${top}`);
      } else fail("เลื่อนลงไกลแล้วไม่มีปุ่มกลับขึ้นบน");
      await click(lbl("ย่อทุก Area"));
      await page.waitForTimeout(600);
      (await vis(SUP(1, 1)).count()) === 0 ? pass("ย่อทั้งหมด → เหลือแต่การ์ด Area") : fail("ย่อทั้งหมดไม่ได้");

      // แก้ไขผัง: วางรหัสสาขาบนการ์ด Area = กาง Area นั้น ไม่ได้ยกให้คน Area
      await click(lbl(`กางดู Area ${AREAS[0]}`));
      await page.waitForTimeout(600);
      await click(lbl("แก้ไขผังฝั่ง Area"));
      await page.waitForTimeout(600);
      await click(lbl("สาขา CY001"));
      await page.waitForTimeout(300);
      await click(lbl(`หัว Area ${AREAS[2]}`));
      await page.waitForTimeout(700);
      (await vis(SUP(3, 1)).count()) && (await vis("รอบันทึก", false).count()) === 0 && holderOf("CY001") === id("zx.sup11")
        ? pass("วาง CY001 บนการ์ด Area 3 → กาง Area 3 ให้เลือกคน ไม่ได้ยกสาขาให้ Area (ฐานข้อมูลไม่เปลี่ยน)")
        : fail(`วางบนการ์ด Area: holder=${holderOf("CY001")}`);
      // ยังถือ CY001 อยู่ — แตะการ์ด Supervisor ปลายทาง
      await click(lbl(`Supervisor ${SUP(3, 1)}`));
      await page.waitForTimeout(600);
      const pend = await vis("รอบันทึก 1 รายการ").count();
      const note = await vis("Maid ฝนทิพย์ แม่บ้านทดสอบ ประจำสาขานี้ — ย้ายตาม", false).count();
      pend && note ? pass("ย้าย CY001 ไปซุป31 → รอบันทึกบอกว่า Maid ฝนทิพย์ย้ายตาม") : fail(`รายการรอบันทึก: pend=${pend} note=${note}`);
      await page.screenshot({ path: path.join(DIR, "area-map-new-4-edit.png") });
      await click(lbl("บันทึกผังฝั่ง Area"));
      await page.waitForTimeout(3000);
      holderOf("CY001") === id("zx.sup31") ? pass("บันทึกแล้ว CY001 เป็นของซุป31 (ฐานข้อมูล)") : fail(`ฐานข้อมูล CY001=${holderOf("CY001")}`);
      // กล่อง Maid ใต้การ์ดซุป31 (id am-m<maid>-<holder>) — และไม่อยู่ใต้ซุป11 แล้ว
      const rows = await page.evaluate(([m, to, from]) => [!!document.getElementById(`am-m${m}-${to}`), !!document.getElementById(`am-m${m}-${from}`)], [id("zx.maid1"), id("zx.sup31"), id("zx.sup11")]);
      rows[0] && !rows[1] ? pass("หลังบันทึก Maid ฝนทิพย์ขึ้นใต้ซุป31 ไม่อยู่ใต้ซุป11 แล้ว") : fail(`กล่อง Maid หลังย้าย: ใต้ซุป31=${rows[0]} ใต้ซุป11=${rows[1]}`);
      await ctx.close();
    }

    // ════ Area: เปิดมาเจอ Area ตัวเองกาง ════
    {
      const { ctx, vis, open } = await session("zx.area4", { width: 1440, height: 1000 });
      await open();
      (await vis(SUP(4, 2)).count()) && (await vis(SUP(1, 2)).count()) === 0 && (await vis("Area ของคุณ").count())
        ? pass("Area: เปิดมาเจอ Area ของตัวเองกางรอ (Area อื่นยังไม่กาง)")
        : fail("Area ไม่ได้เปิดที่ Area ตัวเอง");
      await ctx.close();
    }
    // ════ Maid: Area ของสาขาที่ประจำ (CY001 ย้ายไป Area 3 แล้ว · CY017 อยู่ Area 2 — กางทั้งสอง) ════
    {
      const { ctx, vis, open } = await session("zx.maid1", { width: 1440, height: 1000 });
      await open();
      (await vis(SUP(2, 2)).count()) && (await vis(SUP(3, 1)).count()) && (await vis(SUP(1, 1)).count()) === 0 && (await vis(" · คุณ", false).count())
        ? pass("Maid (COCO): เปิดมาเจอทุก Area ที่มีสาขาที่ประจำ (ไม่ใช่ทุก Area) · ชื่อตัวเองมีป้าย “คุณ”")
        : fail("Maid ไม่ได้เปิดที่ Area ของตัวเอง");
      await ctx.close();
    }

    // ════ ช่าง (มือถือ) ════
    {
      const { ctx, page, lbl, open, search } = await session("T001", { width: 390, height: 844 });
      await open();
      await page.mouse.move(200, 600);
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(800);
      const sb = await lbl("ค้นหาในผังฝั่ง Area").first().boundingBox();
      const zoomInView = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[aria-label="ขยายขนาดผัง"]')].find((e) => e.offsetParent);
        const r = el && el.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
      });
      sb && sb.y < 160 && !zoomInView ? pass("มือถือ: เลื่อนแล้วติดบนสุดแค่ช่องค้นหา (ปุ่มอื่นเลื่อนไปกับผัง)") : fail(`มือถือ sticky: ${JSON.stringify(sb)} zoomInView=${zoomInView}`);
      await search("CY017");
      await page.waitForTimeout(800);
      (await lbl("โทรหา ฝนทิพย์ แม่บ้านทดสอบ").count()) ? pass("มือถือ: ค้นรหัสสาขา → ปุ่มโทรหา Maid ในคำตอบด่วน") : fail("ไม่มีปุ่มโทรหา Maid");
      await page.screenshot({ path: path.join(DIR, "area-map-new-5-phone.png") });
      await ctx.close();
    }

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ").slice(0, 400)}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    cleanup();
    await browser.close();
  }
})();
