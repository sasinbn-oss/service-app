// ทดสอบ: อะไหล่ที่ไปแต่ละสาขา (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
//   · แอดมิน: การ์ดในหน้ารายงาน → เปิดได้ · ค่าเริ่มต้น "ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)" อยู่ปุ่มแรกและถูกเลือก
//   · ตัวเลขบนสุดตรงกับฐานข้อมูล (psql) ทั้งระบบ และเมื่อกรองภาค · ใช้แล้ว/เบิกแล้วไม่รวมเป็นเลขเดียว
//   · หัวกลุ่มทีละ 50 สาขา + "โหลดเพิ่ม" (ลำดับเลื่อนระหว่างโหลด = บอกให้โหลดใหม่ ไม่ทำสาขาหาย) · กดเปิดกลุ่มแล้วโหลดแถว (วันที่ · อะไหล่ · จำนวน · เครื่อง · ใบงาน · สถานะ) · ป้ายนอกสโตร์
//   · ปุ่มสถานะ · ค้นหาที่เซิร์ฟเวอร์ · ตามอะไหล่ (ไปที่สาขาไหนบ้าง) · Excel ได้ไฟล์จริง แถวตรงตัวกรอง
//   · ใบงาน: ลิงก์ "อะไหล่ที่สาขานี้ได้ไปแล้ว" / "เฉพาะเครื่องนี้" ตัวเลขตรงฐานข้อมูล → เปิดรายงานกรองสาขา/เครื่องให้
//   · Super Admin เห็นการ์ด · Admin Spare Part และหัวหน้าภาคไม่เห็นการ์ดและลิงก์ (และไม่ยิงคำขอที่ได้ 403) · จอมือถือไม่ล้น
// ข้อมูลสมมติทั้งหมด (สาขา CZW… อะไหล่ ZWP-… ใบงาน ZWW… ผู้ใช้ ZWPA/ZWSV/ZWSA…) ใส่ด้วย SQL แล้วลบทิ้งท้ายไฟล์
// ไม่แตะ T001/S001 — ท้ายไฟล์เช็คให้ว่ายังเป็นค่าเดิม · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const DIR = __dirname;
const ExcelJS = require(path.join(DIR, "../../backend/node_modules/exceljs"));

// ส่งคำสั่งทาง stdin ไม่ใช่ -c — รหัสผ่านที่แฮชแล้วมี $ ซึ่ง shell จะกินไปเงียบ ๆ
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -qAt -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

/**
 * ยอดจากฐานข้อมูลตรง ๆ ตามกฎในสัญญา API (เขียนแยกจาก SQL ของเซิร์ฟเวอร์ — เทียบกันจึงมีความหมาย)
 * ใช้แล้ว = USED ของใบที่ช่างปิดแล้ว (DONE/รอตรวจเคลม/เคลมถูกตีกลับรอปิดใหม่ = คนปิดยังอยู่) · เบิกแล้ว = WAITING ที่ออกจากคลัง
 * ของใบที่ยังไม่มีใครปิด ไม่ใช่นอกสโตร์
 * ไม่นับใบทดสอบ · where = เงื่อนไขเพิ่ม (b = สาขา, w = ใบงาน)
 */
const dbTiles = (where = "true") =>
  sql(`with r as (
      select w."branchId", p."sparePartId", p.quantity q, 'U' k from "WorkOrderPart" p join "WorkOrder" w on w.id=p."workOrderId" join "Branch" b on b.id=w."branchId"
        where p.kind='USED' and (w.status in ('DONE','CLAIM_REVIEW') or (w."closedById" is not null and w.status<>'CANCELLED')) and not w."isTest" and ${where}
      union all
      select w."branchId", p."sparePartId", p.quantity, 'I' from "WorkOrderPart" p join "WorkOrder" w on w.id=p."workOrderId" join "Branch" b on b.id=w."branchId"
        join "SparePart" s on s.id=p."sparePartId"
        where p.kind='WAITING' and not s."offCatalog" and not w."isTest" and w.status not in ('DONE','CLAIM_REVIEW','CANCELLED') and w."closedById" is null
          and ((p."inStock" and coalesce(p."requisitionNo",'')<>'') or coalesce(p."transferReqNo",'')<>'') and ${where})
    select count(distinct "branchId")||'|'||count(distinct "sparePartId")||'|'||coalesce(sum(q) filter (where k='U'),0)||'|'||coalesce(sum(q) filter (where k='I'),0) from r`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const SUF = String(Date.now()).slice(-5);
  const M = `CZW${SUF}`; // สาขาขึ้นต้น C = สาขาบริษัท
  const BA = `${M}A`, BB = `${M}B`;
  const R = `ภาคทดสอบเว็บอะไหล่${SUF}`, T1 = `ทีมทดสอบเว็บอะไหล่${SUF}-1`, T2 = `ทีมทดสอบเว็บอะไหล่${SUF}-2`;
  const P1 = `ZWP-${SUF}-P1`, P2 = `ZWP-${SUF}-P2`, OFF = `[นอกสโตร์] สายพานทดสอบเว็บ ${SUF}`;
  const W = (n) => `ZWW${SUF}-${n}`;
  const PA = `ZWPA${SUF}`, SV = `ZWSV${SUF}`, SA = `ZWSA${SUF}`;
  const before = sql(`select string_agg("employeeCode"||':'||role||':'||coalesce(region,'')||':'||coalesce(team,''),',' order by "employeeCode") from "User" where "employeeCode" in ('T001','S001')`);
  const cleanup = () =>
    sql(`delete from "WorkOrder" where code like 'ZWW${SUF}-%';
      delete from "Branch" where code like '${M}%';
      delete from "SparePart" where "partCode" in ('${P1}','${P2}','${OFF}');
      delete from "User" where "employeeCode" in ('${PA}','${SV}','${SA}')`);
  try {
    // ── ข้อมูลสมมติ: ภาคทดสอบ R มี 52 สาขา (เกินหน้าแรก 50) ──
    // A: ใบปิดแล้ว (เครื่อง W1) ใช้ P1 ×3 + ของนอกสโตร์ ×1 · ใบรอคอนเฟิร์มลูกค้า (เครื่อง W2) เบิก P2 ×2 แล้ว
    // B: ใบปิดแล้ว ใช้ P2 ×1 · F01–F50: สาขาละใบ ใช้ P1 ×1 · ใบยกเลิกที่สาขา A (เบิก P1 ×9) ต้องไม่ขึ้นที่ไหนเลย
    sql(`insert into "Branch"(code,name,region,zone) values ('${BA}','ร้านทดสอบเว็บ${SUF} เอ','${R}','${T1}'),('${BB}','ร้านทดสอบเว็บ${SUF} บี','${R}','${T2}');
      insert into "Branch"(code,name,region,zone) select '${M}F'||lpad(i::text,2,'0'),'ร้านทดสอบเว็บ${SUF} ที่ '||i,'${R}','${T2}' from generate_series(1,50) i;
      insert into "SparePart"("partCode",name,"offCatalog","updatedAt") values ('${P1}','ตลับลูกปืนทดสอบเว็บ ${SUF}',false,now()),
        ('${P2}','บอร์ดทดสอบเว็บ ${SUF}',false,now()),('${OFF}','สายพานทดสอบเว็บ ${SUF}',true,now());
      insert into "Machine"("branchId",code,type,brand,"updatedAt") select id,'W1','WASHER','Speed Queen',now() from "Branch" where code='${BA}';
      insert into "Machine"("branchId",code,type,"updatedAt") select id,'W2','WASHER',now() from "Branch" where code='${BA}'`);
    const id = (q) => Number(sql(q));
    const part = (c) => id(`select id from "SparePart" where "partCode"='${c}'`);
    const p1 = part(P1), p2 = part(P2), off = part(OFF);
    const mach = (c) => id(`select m.id from "Machine" m join "Branch" b on b.id=m."branchId" where b.code='${BA}' and m.code='${c}'`);
    const w1 = mach("W1"), w2 = mach("W2");
    const admin = id(`select id from "User" where "employeeCode"='A001'`);
    const wo = (n, branch, status, closed, machine) =>
      id(`insert into "WorkOrder"(code,"branchId","machineId",title,status,"closedAt","closedById","updatedAt")
        values ('${W(n)}',(select id from "Branch" where code='${branch}'),${machine ?? "null"},'ทดสอบหน้าจออะไหล่ที่ไปแต่ละสาขา','${status}',
          ${closed ?? "null"},${closed ? admin : "null"},now()) returning id`);
    const o1 = wo("01", BA, "DONE", "now()-interval '3 days'", w1);
    const o2 = wo("02", BA, "AWAITING_CONFIRM", null, w2);
    const o3 = wo("03", BB, "DONE", "now()-interval '4 days'", null);
    const o4 = wo("04", BA, "CANCELLED", null, w1);
    sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind) values (${o1},${p1},3,'USED'),(${o1},${off},1,'USED'),(${o3},${p2},1,'USED');
      insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind,"inStock",warehouse,"requisitionNo","checkedAt") values
        (${o2},${p2},2,'WAITING',true,'คลังลาดพร้าว 94','RQ-ZWW${SUF}',now()-interval '1 day'),
        (${o4},${p1},9,'WAITING',true,'คลังลาดพร้าว 94','RQ-ZWX${SUF}',now()-interval '1 day');
      insert into "WorkOrder"(code,"branchId",title,status,"closedAt","closedById","updatedAt")
        select 'ZWW${SUF}-F'||substr(b.code,length(b.code)-1),b.id,'ทดสอบหน้าจออะไหล่ที่ไปแต่ละสาขา','DONE',now()-interval '5 days',${admin},now()
        from "Branch" b where b.code like '${M}F%';
      insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind)
        select w.id,${p1},1,'USED' from "WorkOrder" w where w.code like 'ZWW${SUF}-F%'`);
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,region,"passwordHash","mustChangePassword") values
      ('${PA}','แอดมินอะไหล่ทดสอบหน้าจอ','PARTS_ADMIN',null,'${hash}',false),
      ('${SV}','หัวหน้าภาคทดสอบหน้าจอ','SUPERVISOR','${R}','${hash}',false),
      ('${SA}','ซูเปอร์แอดมินทดสอบหน้าจอ','SUPER_ADMIN',null,'${hash}',false)`);
    const inR = `b.region='${R}'`;
    dbTiles(inR) === "52|3|55|2"
      ? pass("เตรียมข้อมูล: ภาคทดสอบ 52 สาขา · 3 อะไหล่ · ใช้แล้ว 55 · เบิกแล้ว 2 (psql · ใบยกเลิกไม่นับ)") : fail(`เตรียมข้อมูล psql ${dbTiles(inR)}`);

    const open = async (code, width) => {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(String(e)));
      // ใครที่ไม่ควรเห็นต้องไม่ยิงคำขอรายงานนี้เลย (ซ่อนลิงก์แล้วแต่ยังยิงตัวเลข = 403 เงียบ ๆ ทุกครั้งที่เปิดใบงาน)
      const hits = [];
      page.on("request", (r) => r.url().includes("/reports/branch-parts") && hits.push(r.url()));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      if (width < 760) {
        await page.getByLabel("เปิดเมนู").locator("visible=true").first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      await vis("รายงาน").first().click().catch(() => {});
      await page.waitForTimeout(2000);
      return { ctx, page, vis, hits };
    };
    const label = (page, l) => page.locator(`[aria-label^="${l}"]`).locator("visible=true").first();
    const exact = (page, l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    /**
     * ตัวที่อยู่บนสุดจริง (elementFromPoint) — กดลิงก์ในใบงานที่เปิดจากรายงาน ได้หน้ารายงานใหม่ซ้อนบนใบงาน
     * หน้ารายงานเดิมยังถูกวาดอยู่ข้างหลัง (ย้อนกลับได้) ตัวแรกที่เจอจึงเป็นของหน้าเก่า · ไม่โดนเลยใช้ตัวท้าย (หน้าใหม่วาดทีหลัง)
     */
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
      return loc.last();
    };
    /** ตัวเลขสี่ช่องบนสุด เรียงแบบเดียวกับ dbTiles */
    const tiles = async (page) => {
      const n = async (l) => {
        const el = await topmost(page.locator(`[aria-label^="ตัวเลข ${l} "]`).locator("visible=true"));
        const a = await el.getAttribute("aria-label").catch(() => null);
        return a ? a.slice(`ตัวเลข ${l} `.length) : "?";
      };
      return [await n("สาขาที่ได้อะไหล่"), await n("อะไหล่"), await n("ใช้แล้ว"), await n("เบิกแล้ว · งานยังไม่จบ")].join("|");
    };
    const groups = (page, kind = "สาขา") => page.locator(`[aria-label^="กล่อง${kind} "]`).locator("visible=true");
    const rows = (page, code) => page.locator(`[aria-label^="แถว ${code} "]`).locator("visible=true");
    const searchBox = (page) => page.getByLabel("ค้นหาในรายงานอะไหล่ที่ไปแต่ละสาขา").locator("visible=true").first();

    // ════ แอดมิน จอคอม ════
    {
      const { ctx, page, vis } = await open("A001", 1400);
      const card = vis("อะไหล่ที่ไปแต่ละสาขา");
      (await card.count()) > 0 && (await vis("แอดมิน · Super Admin").count()) > 0
        ? pass("แอดมิน: การ์ด อะไหล่ที่ไปแต่ละสาขา ในหน้ารายงาน (คนอ่าน แอดมิน · Super Admin)") : fail("แอดมินไม่เห็นการ์ด");
      await page.screenshot({ path: path.join(DIR, "branch-parts-1-menu.png") });
      await card.first().click();
      await page.waitForTimeout(3500);

      // ค่าเริ่มต้น: ทั้งหมดตั้งแต่เริ่มใช้ระบบ เป็นปุ่มแรกและถูกเลือก
      const presets = await page.locator('[aria-label^="ช่วง "]').locator("visible=true").evaluateAll((els) =>
        els.map((e) => `${e.getAttribute("aria-label")}=${e.getAttribute("aria-selected")}`));
      presets[0] === "ช่วง ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)=true" && presets.slice(1).every((p) => p.endsWith("=false")) &&
        presets.map((p) => p.split("=")[0].slice(5)).join(",") === "ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ),เดือนนี้,เดือนก่อน,3 เดือน,ปีนี้"
        ? pass("ค่าเริ่มต้น: ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ) อยู่ปุ่มแรกและถูกเลือก · มีเดือนนี้ เดือนก่อน 3 เดือน ปีนี้") : fail(`ปุ่มช่วง: ${presets.join(" | ")}`);
      // ทั้งระบบ — ชุดเทสต์อื่นอาจเขียนฐานข้อมูลพร้อมกัน จึงเทียบได้ทั้งก่อนและหลังอ่านหน้าจอ
      const dbBefore = dbTiles();
      const all = await tiles(page);
      all === dbBefore || all === dbTiles() ? pass(`ตัวเลขบนสุดทั้งระบบตรงกับฐานข้อมูล (psql ${all})`) : fail(`ทั้งระบบ: จอ ${all} · psql ${dbBefore}`);

      // ภาคทดสอบ — dropdown กางในที่ (กล่องลอยท้าย body) มีช่องค้นหาเมื่อรายการยาว
      await exact(page, "ภาค").first().click();
      await page.waitForTimeout(500);
      await page.getByLabel("ค้นหาใน ภาค").locator("visible=true").last().fill(R).catch(() => {});
      await page.waitForTimeout(400);
      await vis(R).last().click();
      await page.waitForTimeout(3000);
      const inRegion = await tiles(page);
      inRegion === "52|3|55|2" && inRegion === dbTiles(inR)
        ? pass("กรองภาค: ตัวเลขบนสุด 52 สาขา · 3 อะไหล่ · ใช้แล้ว 55 · เบิกแล้ว 2 ตรงกับฐานข้อมูล") : fail(`กรองภาค: จอ ${inRegion} · psql ${dbTiles(inR)}`);
      const first50 = await groups(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      first50.length === 50 && first50[0] === `กล่องสาขา ${BA}` && (await vis("แสดง 50 จาก 52 สาขา", false).count()) > 0
        ? pass("หัวกลุ่มทีละ 50 สาขา มากสุดก่อน (สาขา A 6 ชิ้นอยู่บนสุด) · บอก แสดง 50 จาก 52 สาขา") : fail(`หน้าแรก ${first50.length} กลุ่ม · บนสุด ${first50[0]}`);
      const headA = await groups(page).first().innerText();
      headA.includes("ใช้แล้ว 4 ชิ้น") && headA.includes("เบิกแล้ว 2 ชิ้น") && !headA.includes("6 ชิ้น")
        ? pass("หัวสาขา A: ใช้แล้ว 4 ชิ้น กับ เบิกแล้ว 2 ชิ้น แยกกัน ไม่รวมเป็น 6") : fail(`หัวสาขา A: ${headA.slice(0, 200)}`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-2-branches.png") });
      // ลำดับเลื่อนระหว่างโหลดเพิ่ม: สาขาท้ายสุด (อยู่หน้า 2) ได้ใบปิดใหม่ 2 ชิ้น ขึ้นไปอันดับ 2 — หน้า 2 ที่นับจากตำแหน่งได้กลุ่มซ้ำ
      // และสาขานั้นไม่เคยขึ้น ต้องบอกให้โหลดใหม่ (เดิม: เงียบ ๆ "แสดง 51 จาก 52" ไม่มีปุ่มโหลดเพิ่ม สาขานั้นหายจนรีเฟรช)
      const bump = wo("BUMP", `${M}F50`, "DONE", "now()-interval '2 days'", null);
      sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind) values (${bump},${p2},2,'USED')`);
      await exact(page, "โหลดเพิ่ม").first().click();
      await page.waitForTimeout(2500);
      const driftShown = (await vis("ตัวเลขเปลี่ยนระหว่างโหลด", false).count()) > 0;
      await exact(page, "โหลดใหม่ตั้งแต่ต้น").first().click().catch(() => {});
      await page.waitForTimeout(3000);
      const top2 = await groups(page).evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("aria-label")).join(","));
      driftShown && top2 === `กล่องสาขา ${BA},กล่องสาขา ${M}F50` && (await vis("ตัวเลขเปลี่ยนระหว่างโหลด", false).count()) === 0 &&
        (await groups(page).count()) === 50
        ? pass("ลำดับเลื่อนระหว่างโหลดเพิ่ม: บอกว่าตัวเลขเปลี่ยน · กดโหลดใหม่ได้สาขาที่เลื่อนขึ้นมาอันดับ 2 (ไม่หายเงียบ ๆ)")
        : fail(`ลำดับเลื่อน: แจ้ง=${driftShown} · บนสุด ${top2} · ${await groups(page).count()} กลุ่ม`);
      await exact(page, "โหลดเพิ่ม").first().click();
      await page.waitForTimeout(2500);
      (await groups(page).count()) === 52 && (await exact(page, "โหลดเพิ่ม").count()) === 0 && (await vis("ตัวเลขเปลี่ยนระหว่างโหลด", false).count()) === 0
        ? pass("โหลดเพิ่ม: ครบ 52 สาขา ปุ่มหายเมื่อไม่มีหน้าถัดไป") : fail(`หลังโหลดเพิ่ม ${await groups(page).count()} กลุ่ม`);
      // คืนตัวเลขเดิม — ขั้นต่อไปเทียบกับยอดที่เตรียมไว้ (ตัวกรองถัดไปโหลดใหม่จากฐานข้อมูลเอง)
      sql(`delete from "WorkOrder" where id=${bump}`);

      // เปิดกลุ่มสาขา A → โหลดแถวของกลุ่ม
      await exact(page, `ดูทีละใบงาน ${BA}`).first().click();
      await page.waitForTimeout(2500);
      const r1 = await rows(page, W("01")).allInnerTexts();
      const r2 = await rows(page, W("02")).allInnerTexts();
      (await exact(page, `แถว ${W("01")} ${P1} ใช้แล้ว 3`).count()) === 1 &&
        r1.some((t) => t.includes("สายพานทดสอบเว็บ") && t.includes("นอกสโตร์") && t.includes("ใช้แล้ว")) &&
        (await exact(page, `แถว ${W("02")} ${P2} เบิกแล้ว · งานยังไม่จบ 2`).count()) === 1 && r2.some((t) => t.includes(`ใบเบิก RQ-ZWW${SUF}`)) &&
        (await rows(page, W("04")).count()) === 0
        ? pass("เปิดกลุ่มสาขา A: แถวใช้แล้ว (P1 ×3 · นอกสโตร์มีป้าย) · แถวเบิกแล้ว · งานยังไม่จบ (P2 ×2 บอกใบเบิก) · ไม่มีใบยกเลิก")
        : fail(`แถวสาขา A: ${[...r1, ...r2].join(" | ").slice(0, 400)}`);
      const heads = [];
      for (const h of ["วันที่", "อะไหล่", "จำนวน", "เครื่อง", "ใบงาน", "สถานะ"]) if (!(await vis(h).count())) heads.push(h);
      heads.length === 0 && (await vis("Speed Queen เครื่อง W1").count()) > 0
        ? pass("ตารางแถวตามตัวอย่าง: วันที่ · อะไหล่ · จำนวน · เครื่อง (ยี่ห้อ + เครื่อง W1) · ใบงาน · สถานะ") : fail(`ตารางแถว: ไม่มีหัว ${heads.join(",")} หรือไม่บอกเครื่อง`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-3-expanded.png") });

      // ปุ่มสถานะ: ใช้แล้ว — ตัวเลขบนปุ่มไม่เปลี่ยนตามปุ่มที่เลือก ช่องเบิกแล้วเป็น 0
      await label(page, "สถานะ ใช้แล้ว").click();
      await page.waitForTimeout(2500);
      const usedOnly = await tiles(page);
      const headUsed = await exact(page, `กล่องสาขา ${BA}`).first().innerText();
      usedOnly === "52|3|55|0" && headUsed.includes("ใช้แล้ว 4 ชิ้น") && !headUsed.includes("เบิกแล้ว 2 ชิ้น") &&
        (await exact(page, "สถานะ เบิกแล้ว · งานยังไม่จบ 2 ชิ้น").count()) === 1
        ? pass("สถานะ ใช้แล้ว: เหลือแต่ชิ้นที่ใช้แล้ว (55) · ปุ่มเบิกแล้วยังบอก 2 ชิ้น") : fail(`สถานะใช้แล้ว: ${usedOnly} · ${headUsed.slice(0, 120)}`);
      await label(page, "สถานะ เบิกแล้ว").click();
      await page.waitForTimeout(2500);
      const issuedOnly = await tiles(page);
      issuedOnly === "1|1|0|2" && (await groups(page).count()) === 1
        ? pass("สถานะ เบิกแล้ว · งานยังไม่จบ: เหลือสาขา A ที่เดียว 2 ชิ้น") : fail(`สถานะเบิกแล้ว: ${issuedOnly} · ${await groups(page).count()} กลุ่ม`);
      await exact(page, "สถานะ ทั้งหมด").first().click();
      await page.waitForTimeout(2500);

      // Excel ตามตัวกรองที่เลือกอยู่ (ภาคทดสอบ) — แท็บใหม่เปิดแบบ noopener ดูจากคำขอไฟล์ แล้วโหลดไฟล์เดียวกันมาเปิดด้วย exceljs
      const docReq = ctx.waitForEvent("request", { predicate: (r) => /\/api\/documents\/[^/?]+\?token=/.test(r.url()), timeout: 30000 }).catch(() => null);
      await label(page, "ดาวน์โหลด Excel อะไหล่ที่ไปแต่ละสาขา").click();
      const req = await docReq;
      let xs = "ไม่มีคำขอไฟล์";
      if (req) {
        const res = await fetch(req.url());
        const disp = decodeURIComponent(res.headers.get("content-disposition") || "");
        const buf = Buffer.from(await res.arrayBuffer());
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const flat = wb.getWorksheet("รายการทั้งหมด");
        const data = [];
        flat.eachRow((r, i) => i > 4 && r.values[1] !== "รวม" && data.push(r.values.slice(1)));
        xs = [buf.subarray(0, 2).toString(), /อะไหล่ที่ไปแต่ละสาขา-\d{4}-\d{2}-\d{2}\.xlsx/.test(disp), wb.worksheets.map((w) => w.name).join(","),
          data.length, data.reduce((n, r) => n + (r[8] ?? 0), 0), data.reduce((n, r) => n + (r[9] ?? 0), 0),
          data.some((r) => r[1] === BA && r[2] === `ร้านทดสอบเว็บ${SUF} เอ`)].join("|");
      }
      xs === "PK|true|รายการทั้งหมด,รวมตามสาขา,รวมตามอะไหล่|54|55|2|true"
        ? pass("Excel: ไฟล์ อะไหล่ที่ไปแต่ละสาขา-วันที่.xlsx จริง 3 ชีต · 54 แถวของภาคทดสอบ ใช้แล้ว 55 / เบิกแล้ว 2 คนละคอลัมน์ (ตามตัวกรอง)") : fail(`Excel: ${xs}`);
      for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});

      // ค้นหาที่เซิร์ฟเวอร์ — ยอดตามคำค้น
      await searchBox(page).fill(P2);
      await page.waitForTimeout(2500);
      const found = await groups(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join(","));
      found === `กล่องสาขา ${BA},กล่องสาขา ${BB}` && (await tiles(page)) === "2|1|1|2"
        ? pass(`ค้นหา ${P2}: เหลือสาขา A (เบิกแล้ว 2) กับ B (ใช้แล้ว 1) ตัวเลขบนสุดตามคำค้น`) : fail(`ค้นหา: ${found} · ${await tiles(page)}`);
      await exact(page, "ล้างคำค้น").first().click();
      await page.waitForTimeout(2500);

      // ตามอะไหล่: ตารางเดียว อะไหล่ · ใช้แล้ว · เบิกแล้ว · สาขา · ไปที่สาขาไหนบ้าง
      await exact(page, "มุมมอง ตามอะไหล่").first().click();
      await page.waitForTimeout(3000);
      const parts = await groups(page, "อะไหล่").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join(","));
      parts === `กล่องอะไหล่ ${P1},กล่องอะไหล่ ${P2},กล่องอะไหล่ ${OFF}` && (await vis("ไปที่สาขาไหนบ้าง").count()) > 0
        ? pass("ตามอะไหล่: P1 (53 ชิ้น) · P2 (3) · นอกสโตร์ (1) มากสุดก่อน มีคอลัมน์ ไปที่สาขาไหนบ้าง") : fail(`ตามอะไหล่: ${parts}`);
      await label(page, `อะไหล่ ${P2} `).click();
      await page.waitForTimeout(2500);
      const p2box = await exact(page, `กล่องอะไหล่ ${P2}`).first().innerText();
      p2box.includes(`${BA} ร้านทดสอบเว็บ${SUF} เอ`) && p2box.includes(`${BB} ร้านทดสอบเว็บ${SUF} บี`) &&
        (await rows(page, W("02")).count()) === 1 && (await rows(page, W("03")).count()) === 1
        ? pass("เปิดอะไหล่ P2: ไปที่สาขา A (เบิกแล้ว) และ B (ใช้แล้ว) · แถวทีละใบงาน 2 แถว") : fail(`อะไหล่ P2: ${p2box.slice(0, 300)}`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-4-byparts.png") });
      await exact(page, "มุมมอง ตามสาขา").first().click();
      await page.waitForTimeout(3000);

      // ใบงาน → ลิงก์สองอัน ตัวเลขตรงฐานข้อมูล
      const dbA = dbTiles(`b.code='${BA}'`).split("|");
      const dbW1 = dbTiles(`w."machineId"=${w1}`).split("|");
      await label(page, `เปิดใบงาน ${W("01")}`).click();
      await page.waitForTimeout(3500);
      const brLink = label(page, "อะไหล่ที่สาขานี้ได้ไปแล้ว");
      const mLink = label(page, "อะไหล่เฉพาะเครื่องนี้");
      const brText = (await brLink.count()) ? await brLink.innerText() : "";
      const mText = (await mLink.count()) ? await mLink.innerText() : "";
      brText === `อะไหล่ที่สาขานี้ได้ไปแล้ว (ใช้แล้ว ${dbA[2]} · เบิกแล้ว ${dbA[3]} ชิ้น)` && dbA.join("|") === "1|3|4|2" &&
        mText === `เฉพาะเครื่องนี้ (ใช้แล้ว ${dbW1[2]} ชิ้น)` && dbW1[3] === "0"
        ? pass(`ใบงาน: "${brText}" · "${mText}" ตรงกับฐานข้อมูล`) : fail(`ลิงก์ในใบงาน: "${brText}" · "${mText}" · psql ${dbA} / ${dbW1}`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-5-order-links.png") });
      // กดลิงก์สาขา: หน้ารายงานใหม่ซ้อนบนใบงาน (ย้อนกลับได้ใบงานและรายงานเดิมที่กรองไว้) — ดูตัวที่อยู่บนสุด
      await brLink.click();
      await page.waitForTimeout(3500);
      const deep = await tiles(page);
      const sel = await (await topmost(exact(page, "ช่วง ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)"))).getAttribute("aria-selected").catch(() => null);
      deep === "1|3|4|2" && sel === "true" && (await vis(`สาขา ${BA} ร้านทดสอบเว็บ${SUF} เอ`, false).count()) > 0
        ? pass("กดลิงก์สาขาในใบงาน (เปิดจากรายงาน): รายงานกรองสาขา A ทั้งหมดตั้งแต่เริ่มใช้ระบบ ตัวเลขเท่ากับลิงก์")
        : fail(`ลิงก์สาขา: ${deep} · ทั้งหมด=${sel}`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-6-deeplink.png") });
      await ctx.close();
    }

    // ════ แอดมิน: ใบงานจากรายการใบงาน → "เฉพาะเครื่องนี้" → เลิกกรอง ════
    // หน้ารายงานมีอันเดียว นับกลุ่ม/แถวได้ตรง ๆ · ลิงก์อยู่ในแท็บใบงาน ซึ่งไม่มีหน้ารายงาน (ต้องข้ามไปแท็บหน้าแรก)
    {
      const { ctx, page, vis } = await open("A001", 1400);
      await vis("ใบงานซ่อม").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(W("01"));
      await page.waitForTimeout(2500);
      await vis(W("01")).last().click();
      await page.waitForTimeout(3500);
      await (await topmost(page.locator('[aria-label="อะไหล่เฉพาะเครื่องนี้"]').locator("visible=true"))).click();
      await page.waitForTimeout(3500);
      const deepM = await tiles(page);
      deepM === "1|2|4|0" && (await vis(`เฉพาะเครื่อง W1 · สาขา ${BA}`, false).count()) > 0 &&
        (await groups(page).count()) === 1 && (await rows(page, W("01")).count()) === 2 && (await rows(page, W("02")).count()) === 0
        ? pass("กดลิงก์เฉพาะเครื่องนี้ (จากรายการใบงาน): เหลือใบของเครื่อง W1 ใช้แล้ว 4 · เปิดกลุ่มให้เลย ไม่มีใบของเครื่อง W2")
        : fail(`ลิงก์เครื่อง: ${deepM} · ${await groups(page).count()} กลุ่ม · W1 ${await rows(page, W("01")).count()} แถว · W2 ${await rows(page, W("02")).count()} แถว`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-7-machine.png") });
      await exact(page, "เลิกกรองสาขา/เครื่อง").first().click();
      await page.waitForTimeout(3500);
      const cleared = await tiles(page);
      (await vis(`เฉพาะเครื่อง W1 · สาขา ${BA}`, false).count()) === 0 && Number(cleared.split("|")[0]) >= 52
        ? pass(`กดเลิกกรอง: กลับเป็นทุกสาขา (${cleared.split("|")[0]} สาขา)`) : fail(`เลิกกรอง: ${cleared}`);
      await ctx.close();
    }

    // ════ Super Admin เห็นการ์ดและเปิดได้ ════
    {
      const { ctx, page, vis } = await open(SA, 1400);
      const card = vis("อะไหล่ที่ไปแต่ละสาขา");
      let ok = (await card.count()) > 0;
      if (ok) {
        await card.first().click();
        await page.waitForTimeout(3500);
        ok = (await label(page, "ตัวเลข สาขาที่ได้อะไหล่ ").count()) > 0;
      }
      ok ? pass("Super Admin: เห็นการ์ดและเปิดรายงานได้") : fail("Super Admin เปิดรายงานไม่ได้");
      await ctx.close();
    }

    // ════ Admin Spare Part · หัวหน้าภาค: ไม่มีการ์ด ไม่มีลิงก์ในใบงาน ไม่ยิงคำขอ ════
    for (const [code, who] of [[PA, "Admin Spare Part"], [SV, "หัวหน้าภาค"]]) {
      const { ctx, page, vis, hits } = await open(code, 1400);
      (await vis("อะไหล่เบิกแล้ว · งานยังไม่จบ").count()) > 0 && (await vis("อะไหล่ที่ไปแต่ละสาขา").count()) === 0
        ? pass(`${who}: อยู่หน้ารายงานแล้ว ไม่มีการ์ด อะไหล่ที่ไปแต่ละสาขา`) : fail(`${who}: การ์ด`);
      await vis("ใบงานซ่อม").last().click();
      await page.waitForTimeout(2500);
      await vis("ทั้งหมด").first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(W("02"));
      await page.waitForTimeout(2500);
      await vis(W("02")).last().click();
      await page.waitForTimeout(3500);
      (await vis("สาขาและเครื่อง", false).count()) > 0 && (await vis("อะไหล่ที่สาขานี้ได้ไปแล้ว", false).count()) === 0 &&
        (await vis("เฉพาะเครื่องนี้", false).count()) === 0 && hits.length === 0
        ? pass(`${who}: ใบงานไม่มีลิงก์ อะไหล่ที่สาขานี้ได้ไปแล้ว / เฉพาะเครื่องนี้ และไม่ยิงคำขอรายงาน`)
        : fail(`${who}: ใบงาน สาขาและเครื่อง=${await vis("สาขาและเครื่อง", false).count()} ลิงก์=${await vis("อะไหล่ที่สาขานี้ได้ไปแล้ว", false).count()} คำขอ=${hits.length}`);
      await page.screenshot({ path: path.join(DIR, `branch-parts-8-${code === PA ? "parts-admin" : "supervisor"}.png`) });
      await ctx.close();
    }

    // ════ แอดมิน จอมือถือ: การ์ดทีละสาขา ไม่ล้นจอ ════
    {
      const { ctx, page, vis } = await open("A001", 420);
      await vis("อะไหล่ที่ไปแต่ละสาขา").first().click();
      await page.waitForTimeout(3500);
      await searchBox(page).fill(BA);
      await page.waitForTimeout(3000);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const sum = await label(page, "สรุป สาขา ").getAttribute("aria-label").catch(() => "");
      over <= 1 && sum === "สรุป สาขา 1 อะไหล่ 3 ใช้แล้ว 4 เบิกแล้ว 2" && (await groups(page).count()) === 1 && (await rows(page, W("01")).count()) === 2
        ? pass("จอมือถือ: สรุปบรรทัดเดียว · การ์ดสาขาเปิดให้เลยเมื่อเหลือกลุ่มเดียว · ไม่ล้นจอ") : fail(`จอมือถือ: ล้น ${over}px · ${sum}`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-9-phone.png"), fullPage: true });
      // กางตัวกรอง — ช่องตั้งแต่/ถึงต้องอยู่ในจอทั้งคู่ (เคยกว้างตายตัว 200 คู่กัน ช่อง "ถึง" ล้นขอบขวา ตัดกรอบและลูกศร)
      // ชิปช่วงบอก "ตั้งแต่เริ่มใช้ระบบ" ตั้งแต่ยังไม่กาง (คำของเจ้าของงาน)
      const rangeChip = await label(page, "ช่วงวันที่และตัวกรองอื่น").innerText();
      await label(page, "ช่วงวันที่และตัวกรองอื่น").click();
      await page.waitForTimeout(800);
      const fields = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const hints = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0 && /^(แรกสุด|วันนี้)$/.test((d.innerText || "").trim()));
        // กรอบช่องคือบรรพบุรุษที่มีเส้นขอบ — วัดขอบขวาของกรอบ ไม่ใช่แค่ตัวหนังสือ
        return { w, rights: hints.map((h) => { let p = h; while (p && getComputedStyle(p).borderRightWidth === "0px") p = p.parentElement; return Math.round((p || h).getBoundingClientRect().right); }),
          over: document.documentElement.scrollWidth - w };
      });
      fields.rights.length === 2 && fields.rights.every((r) => r <= fields.w) && fields.over <= 1 && rangeChip.includes("ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)")
        ? pass("จอมือถือ กางตัวกรอง: ช่องตั้งแต่/ถึงอยู่ในจอทั้งคู่ · ชิปช่วงบอก ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ) ตั้งแต่ยังไม่กาง")
        : fail(`จอมือถือ กางตัวกรอง: ขอบขวาช่องวันที่ ${fields.rights} (จอ ${fields.w}) · ล้น ${fields.over} · ชิป "${rangeChip}"`);
      await page.screenshot({ path: path.join(DIR, "branch-parts-10-phone-filters.png") });
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    try {
      cleanup();
      const left = sql(`select (select count(*) from "WorkOrder" where code like 'ZWW${SUF}-%')+(select count(*) from "Branch" where code like '${M}%')
        +(select count(*) from "SparePart" where "partCode" in ('${P1}','${P2}','${OFF}'))+(select count(*) from "User" where "employeeCode" in ('${PA}','${SV}','${SA}'))`);
      const after = sql(`select string_agg("employeeCode"||':'||role||':'||coalesce(region,'')||':'||coalesce(team,''),',' order by "employeeCode") from "User" where "employeeCode" in ('T001','S001')`);
      left === "0" && after === before ? pass(`ลบข้อมูลทดสอบครบ · T001/S001 เหมือนเดิม (${after})`) : fail(`ค้าง ${left} แถว · ผู้ใช้ทดสอบ ${after} (เดิม ${before})`);
    } catch (e) {
      fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${String(e).slice(0, 200)}`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
