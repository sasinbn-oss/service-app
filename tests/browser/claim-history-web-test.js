// ทดสอบ: หน้าประวัติเคลม (เจ้าของงานขอ ต.ค. 69 · ตามตัวอย่างที่ตกลง)
//   · เมนูข้างกลุ่ม "อะไหล่" มี "ประวัติเคลม" + ป้าย "รอตรวจ n" ตรงฐานข้อมูล · ช่างไม่เห็นเมนู/ลิงก์
//   · จอคอมเป็นตาราง · ค่าตั้งต้นเฉพาะรอบล่าสุด · ติ๊กรวมรอบเก่าแล้วเห็นรอบที่ตีกลับ (ป้าย "ส่งใหม่แล้ว")
//   · ปุ่มสถานะกรองได้ · ปุ่ม Excel เปิดลิงก์ไฟล์ · ลิงก์ "เคลมเครื่องนี้ทั้งหมด" ในใบงานเปิดหน้านี้กรองให้
//   · Admin Spare Part มีการ์ด "ดูประวัติเคลม" ในงานของฉัน · จอมือถือเป็นการ์ดไม่ล้นจอ
//   · ใครเห็นหน้านี้ (เจ้าของงานยืนยัน): Admin Spare Part · แอดมิน · Super Admin · หัวหน้าภาค — หัวหน้าภาคเห็นเฉพาะใบในภาคตัวเอง
//   · ไม่มีช่อง "ส่งผู้ขาย" (เจ้าของงานบอกไม่ต้อง) · ปุ่มช่วง "เดือนก่อน" ไม่เอาเคลมของเดือนนี้
//   · การ์ดของ Admin Spare Part: ป้ายรอตรวจเลขเดียวกับเมนู (รวมที่ส่งเดือนก่อน) · บรรทัดล่างบอกว่านับจากที่ส่งเดือนนี้
//   · ปุ่มช่วงที่ได้วันเดียวกัน (มีนาคม: 3 เดือน = ปีนี้) ติดปุ่มที่กดจริง ชิปบนมือถือขึ้นชื่อช่วงที่กด
//   · แสดงเพิ่มขณะมีเคลมใหม่เข้ามาไม่ซ้ำแถว · เปิดใบงานแล้วกลับมา แถวที่แสดงเพิ่มไว้ยังอยู่
// ต้องมี DATABASE_URL — แถวเคลมใส่ด้วย SQL บนใบงานจริงที่เปิดผ่าน API (ทางปิดงานจริงอยู่ใน claim-test.sh)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup } = require("./fixture");

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let fx = null;
  const suf = String(Date.now()).slice(-5);
  const pa = `ZCHW${suf}`;
  const sa = `ZCHS${suf}`;
  let outId = null;
  try {
    fx = await setup();
    const board = fx.part("SP-BOARD");
    const a = await fx.workOrder("C0006", null);
    const b = await fx.workOrder("C0006", null);
    const tech = fx.sql(`select id from "User" where "employeeCode"='T001'`);
    const admin = fx.sql(`select id from "User" where "employeeCode"='A001'`);
    // ใบ a: รอบแรกตีกลับ (2 ชม.ก่อน) → รอบสองอนุมัติ (1 ชม.ก่อน) · ใบ b: รอตรวจ — ส่งวันนี้ อยู่ในค่าตั้งต้น "เดือนนี้"
    const ins = (wo, broken, status, ago, reason) =>
      fx.sql(`insert into "PartClaim"("workOrderId","sparePartId","partCode","partName","brokenPartCode",quantity,"branchCode","branchName",brand,"machineCode",symptom,"checkNote",status,"rejectReason","createdById","createdAt","reviewedById","reviewedAt")
        select ${wo},${board},"partCode",name,'${broken}',1,'C0006',(select name from "Branch" where code='C0006'),'ยี่ห้อทดสอบหน้าจอ','W77','อาการ','เช็ค','${status}',${reason ? `'${reason}'` : "null"},${tech},now()-interval '${ago} minutes',
          ${status === "PENDING" ? "null" : admin},${status === "PENDING" ? "null" : `now()-interval '${ago - 10} minutes'`} from "SparePart" where id=${board}`);
    ins(a.id, "WEB-OLD-1", "REJECTED", 120, "รูปป้ายรุ่นไม่ชัด");
    ins(a.id, "WEB-OLD-2", "APPROVED", 60);
    ins(b.id, "WEB-OLD-3", "PENDING", 30);
    fx.sql(`update "WorkOrder" set status='CLAIM_REVIEW' where id=${b.id}`);
    const hash = fx.sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    fx.sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('${pa}','แอดมินอะไหล่ทดสอบหน้าจอ','PARTS_ADMIN','${hash}',false)`);
    fx.sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword") values ('${sa}','ซูเปอร์แอดมินทดสอบหน้าจอ','SUPER_ADMIN','${hash}',false)`);
    // ใบนอกภาคของหัวหน้าภาค — เปิดผ่าน API ตรง ๆ ไม่ผ่าน fx.workOrder (ซึ่งย้าย S001 ไปภาคของสาขานั้น)
    const outBranch = fx.sql(`select code from "Branch" where code like 'C%' and "cancelledAt" is null and region is not null
      and region <> (select region from "Branch" where code='C0006') order by code limit 1`);
    const out = await fx.call(fx.A, "POST", "/work-orders", {
      branchCode: outBranch, jobType: "CM", priority: "NORMAL", contactName: "คุณทดสอบ", contactPhone: "081-234-5678",
      machines: [{ code: "W78", model: "Oasis", symptom: "ทดสอบหน้าจอ (สร้างโดยเทสต์)" }],
    });
    outId = out.orders ? out.orders[0].id : out.id;
    ins(outId, "WEB-OUT-1", "APPROVED", 40);
    /**
     * ใบ c: 105 ชิ้น (เกินหน้าแรก 100) ไว้ลองแสดงเพิ่ม — ไม่ผูกอะไหล่ในสโตร์ (รหัสต่างกันทุกชิ้น = ชิ้นละรอบเดียว)
     * ส่งห่างกันทีละวินาทีจากตอนนี้ อยู่ในเดือนนี้เสมอ (ยกเว้นรันในสองนาทีแรกของเดือน) · อนุมัติแล้ว ไม่ไปเพิ่มตัวเลขรอตรวจ
     * + ชิ้นรอตรวจที่ส่ง 40 วันก่อน (เดือนก่อนเสมอ) — ป้ายรอตรวจบนการ์ดต้องนับด้วยเหมือนเมนู
     * เครื่อง W79 ไม่ใช่ W77 — ลิงก์ "เคลมเครื่องนี้ทั้งหมด" ของใบ a ต้องเห็นแถวใบ b ในหน้าแรก ไม่ถูก 105 ชิ้นนี้ดันไปหน้าสอง
     */
    const c = await fx.workOrder("C0006", null);
    const insFree = (code, status, when) =>
      fx.sql(`insert into "PartClaim"("workOrderId","partCode","partName","brokenPartCode",quantity,"branchCode","branchName",brand,"machineCode",symptom,"checkNote",status,"createdById","createdAt","reviewedById","reviewedAt")
        values (${c.id},'${code}','ชิ้นทดสอบแบ่งหน้า','${code}-BROKEN',1,'C0006',(select name from "Branch" where code='C0006'),'ยี่ห้อทดสอบหน้าจอ','W79','อาการ','เช็ค','${status}',${tech},${when},
          ${status === "PENDING" ? "null" : admin},${status === "PENDING" ? "null" : when})`);
    fx.sql(`insert into "PartClaim"("workOrderId","partCode","partName","brokenPartCode",quantity,"branchCode","branchName",brand,"machineCode",symptom,"checkNote",status,"createdById","createdAt","reviewedById","reviewedAt")
      select ${c.id},'WEB-PG-'||lpad(i::text,3,'0'),'ชิ้นทดสอบแบ่งหน้า','WEB-PG-BROKEN',1,'C0006',(select name from "Branch" where code='C0006'),'ยี่ห้อทดสอบหน้าจอ','W79','อาการ','เช็ค','APPROVED',${tech},
        now()-make_interval(secs => i),${admin},now()-make_interval(secs => i) from generate_series(1,105) i`);
    insFree("WEB-PREV-1", "PENDING", "now()-interval '40 days'");
    const pending = () => fx.sql(`select count(*) from "PartClaim" c join "WorkOrder" w on w.id=c."workOrderId" where c.status='PENDING' and not w."isTest"`);

    const open = async (code, width, at) => {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await ctx.newPage();
      // at = ตั้งนาฬิกาของหน้าเว็บ (ปุ่มช่วงวันที่คิดจากวันนี้) แล้วปล่อยเดินต่อ — หยุดเวลาไว้ (setFixedTime) แอนิเมชันค้าง เมนูไม่เลื่อนออก
      if (at) await page.clock.install({ time: at });
      await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
      page.on("pageerror", (e) => errors.push(String(e)));
      const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
      return { ctx, page, vis };
    };
    const label = (page, l) => page.locator(`[aria-label^="${l}"]`).locator("visible=true").first();
    const search = async (page, text) => {
      await page.getByLabel("ค้นหาในประวัติเคลม").locator("visible=true").first().fill(text);
      await page.waitForTimeout(1500);
    };

    {
      const { ctx, page, vis } = await open("A001", 1400);
      const n = pending();
      (await label(page, `เคลมรอตรวจ ${n}`).count()) > 0 ? pass(`เมนูข้าง: ประวัติเคลม + ป้ายรอตรวจ ${n} (ตรงฐานข้อมูล)`) : fail(`ไม่มีป้ายรอตรวจ ${n} ข้างเมนู`);
      await vis("ประวัติเคลม").first().click();
      await page.waitForTimeout(3000);
      (await vis("ส่งผู้ขาย", false).count()) === 0 ? pass("ไม่มีช่อง ส่งผู้ขาย (เจ้าของงานบอกไม่ต้อง)") : fail("ยังมีช่องส่งผู้ขาย");
      await search(page, a.code);
      const rows = () => page.locator(`[aria-label^="แถวเคลม ${a.code}"]`).locator("visible=true");
      const text = async () => (await rows().allInnerTexts()).join(" | ");
      (await rows().count()) === 1 && (await text()).includes("อนุมัติ") && (await text()).includes("ส่งรอบ 2") && (await text()).includes("WEB-OLD-2")
        ? pass("ตาราง: ค่าตั้งต้นเห็นแค่รอบล่าสุด (ส่งรอบ 2 · อนุมัติ)") : fail(`แถวค่าตั้งต้น: ${await text()}`);
      await page.screenshot({ path: path.join(DIR, "claim-history-1-desktop.png") });
      await label(page, "รวมรอบที่ถูกตีกลับแล้วส่งใหม่").click();
      await page.waitForTimeout(2000);
      (await rows().count()) === 2 && (await text()).includes("ตีกลับ · ส่งใหม่แล้ว") && (await text()).includes("รูปป้ายรุ่นไม่ชัด")
        ? pass("ติ๊กรวมรอบเก่า: เห็นรอบแรกที่ตีกลับ + เหตุผล") : fail(`รวมรอบเก่า: ${await text()}`);
      await page.screenshot({ path: path.join(DIR, "claim-history-2-rounds.png") });
      await label(page, "รวมรอบที่ถูกตีกลับแล้วส่งใหม่").click();
      await page.waitForTimeout(1500);
      // ช่วงวันที่: เคลมทั้งหมดของเทสต์ส่งเมื่อไม่กี่ชั่วโมงก่อน — "เดือนก่อน" ต้องไม่เห็น (ยกเว้นเพิ่งขึ้นเดือนใหม่ไม่ถึง 3 ชม.)
      const bkk = new Date(Date.now() + 7 * 3600_000);
      if (!(bkk.getUTCDate() === 1 && bkk.getUTCHours() < 3)) {
        await label(page, "ช่วง เดือนก่อน").click();
        await page.waitForTimeout(2000);
        (await rows().count()) === 0 ? pass("ปุ่มช่วง เดือนก่อน: ไม่เห็นเคลมที่ส่งเดือนนี้") : fail(`เดือนก่อนยังเห็น ${await rows().count()} แถว`);
        await label(page, "ช่วง เดือนนี้").click();
        await page.waitForTimeout(2000);
        (await rows().count()) === 1 ? pass("กลับมาเดือนนี้: เห็นแถวเดิม") : fail(`เดือนนี้: ${await rows().count()} แถว`);
      }
      await search(page, "WEB-OUT-1");
      (await page.locator('[aria-label^="แถวเคลม "]').locator("visible=true").count()) === 1
        ? pass("แอดมินเห็นเคลมทุกภาค (ใบนอกภาคของหัวหน้าภาค)") : fail("แอดมินไม่เห็นเคลมใบนอกภาค");
      await search(page, "WEB-OLD-");
      await label(page, "สถานะ รอตรวจ").click();
      await page.waitForTimeout(2000);
      const shown = await page.locator('[aria-label^="แถวเคลม "]').locator("visible=true").allInnerTexts();
      shown.length === 1 && shown[0].includes(b.code) && shown[0].includes("รอตรวจ")
        ? pass("ปุ่มสถานะ รอตรวจ: เหลือแถวที่รอตรวจแถวเดียว") : fail(`กรองรอตรวจ: ${shown.join(" | ")}`);
      // แท็บใหม่เปิดแบบ noopener — ดูจากคำขอไฟล์ของทั้งบราวเซอร์ แล้วโหลดไฟล์เดียวกันมาเช็คว่าเป็น xlsx จริง
      const docReq = ctx.waitForEvent("request", { predicate: (r) => /\/api\/documents\/[^/?]+\?token=/.test(r.url()), timeout: 20000 }).catch(() => null);
      await label(page, "ดาวน์โหลด Excel").click();
      const req = await docReq;
      const head = req ? Buffer.from(await (await fetch(req.url())).arrayBuffer()).subarray(0, 2).toString() : "";
      head === "PK" ? pass("ปุ่ม Excel เปิดไฟล์ xlsx ตามตัวกรอง") : fail(`ปุ่ม Excel: ${req ? req.url() : "ไม่มีคำขอไฟล์"}`);
      for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
      // ลิงก์ในใบงาน → หน้าประวัติกรองเครื่อง/สาขาให้ (ทุกช่วงเวลา)
      await label(page, "สถานะ ทั้งหมด").click();
      await search(page, a.code);
      await label(page, `เปิดใบงาน ${a.code}`).click();
      await page.waitForTimeout(3500);
      const link = label(page, "เคลมเครื่องนี้ทั้งหมด");
      (await link.count()) > 0 && /\(\d+\)/.test(await link.innerText()) ? pass(`ใบงาน: ลิงก์ "${await link.innerText()}"`) : fail("ไม่มีลิงก์เคลมเครื่องนี้ในใบงาน");
      await link.click();
      await page.waitForTimeout(3000);
      (await vis("เครื่อง W77 · สาขา C0006 · ทุกช่วงเวลา").count()) > 0 && (await page.locator(`[aria-label^="แถวเคลม ${b.code}"]`).locator("visible=true").count()) > 0
        ? pass("กดลิงก์แล้วเปิดหน้าประวัติ กรองเครื่อง+สาขาให้ ทุกช่วงเวลา") : fail("ลิงก์ไม่ได้กรองให้");
      await page.screenshot({ path: path.join(DIR, "claim-history-3-deeplink.png") });
      await ctx.close();
    }
    // แสดงเพิ่ม: หน้าแรก 100 แถว → ช่างส่งเคลมใหม่ระหว่างนั้น → กดแสดงเพิ่ม (เดิมนับลำดับ แถวที่ 100 ขึ้นซ้ำ)
    // → เปิดใบงานแล้วกลับมา (เดิมโหลดหน้าแรกใหม่ รายการหดเหลือ 100 แถว)
    {
      const { ctx, page } = await open("A001", 1400);
      await page.getByText("ประวัติเคลม", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
      await search(page, "WEB-PG-");
      const pg = () => page.locator(`[aria-label^="แถวเคลม ${c.code} WEB-PG-"]`).locator("visible=true");
      const first = await pg().count();
      insFree("WEB-PG-NEW", "APPROVED", "now()");
      await label(page, "แสดงเพิ่ม").click();
      await page.waitForTimeout(2500);
      const labels = await pg().evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      first === 100 && labels.length === 105 && new Set(labels).size === 105
        ? pass("แสดงเพิ่มขณะมีเคลมใหม่เข้ามา: ได้อีก 5 แถว ไม่มีแถวซ้ำ (105 แถว)")
        : fail(`แสดงเพิ่ม: หน้าแรก ${first} · หลังกด ${labels.length} แถว ไม่ซ้ำ ${new Set(labels).size}`);
      // จอคอมใบงานเปิดเป็นหน้าต่างทับ (ปุ่ม "ปิด") — ปิดแล้วหน้าประวัติได้โฟกัสคืนและโหลดใหม่
      // ช่างส่งเคลมอีกชิ้นระหว่างดูใบงาน: เห็นชิ้นนั้น = โหลดใหม่จริง ไม่ใช่รายการเดิมที่ค้างอยู่ใต้หน้าต่าง
      await label(page, `เปิดใบงาน ${c.code}`).click();
      await page.waitForTimeout(3000);
      insFree("WEB-PG-NEW2", "APPROVED", "now()");
      await page.locator('[aria-label="ปิด"]').locator("visible=true").first().click();
      await page.waitForTimeout(3500);
      const after = await pg().count();
      const fresh = await page.locator(`[aria-label="แถวเคลม ${c.code} WEB-PG-NEW2"]`).locator("visible=true").count();
      fresh === 1 && after === 105
        ? pass("เปิดใบงานแล้วกลับมา: โหลดใหม่ (เห็นเคลมที่เพิ่งส่ง) และยังแสดง 105 แถวเท่าที่กดแสดงเพิ่มไว้")
        : fail(`กลับมาแล้ว: ${after} แถว · เห็นเคลมที่เพิ่งส่ง ${fresh}`);
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("T001", 1400);
      (await vis("ประวัติเคลม").count()) === 0 ? pass("ช่างไม่เห็นเมนูประวัติเคลม") : fail("ช่างเห็นเมนูประวัติเคลม");
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open(pa, 1400);
      const card = label(page, "ดูประวัติเคลม");
      (await card.count()) > 0 ? pass("Admin Spare Part: การ์ดดูประวัติเคลมในงานของฉัน") : fail("ไม่มีการ์ดดูประวัติเคลม");
      // ป้ายรอตรวจบนการ์ด = เลขเดียวกับเมนู (ทุกเดือน รวมชิ้นที่ส่ง 40 วันก่อน) · บรรทัดล่างบอกว่านับจากที่ส่งเดือนนี้
      const n = pending();
      const exact = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
      (await exact(`ประวัติเคลม รอตรวจ ${n}`).count()) > 0 && (await exact(`เคลมรอตรวจ ${n}`).count()) > 0
        ? pass(`การ์ด: ป้ายรอตรวจ ${n} ตรงฐานข้อมูลและตรงกับเมนู (นับชิ้นที่ส่งเดือนก่อนด้วย)`)
        : fail(`ป้ายรอตรวจบนการ์ดไม่ใช่ ${n}: ${await page.locator('[aria-label^="ประวัติเคลม รอตรวจ"]').getAttribute("aria-label").catch(() => "ไม่มีป้าย")}`);
      (await page.getByText(/^ส่งเคลมเดือนนี้ \d+ · อนุมัติ \d+ · ตีกลับ \d+$/).locator("visible=true").count()) > 0
        ? pass("การ์ด: บรรทัดล่างบอกว่านับจากที่ส่งเคลมเดือนนี้") : fail("การ์ดยังไม่บอกว่านับจากที่ส่งเดือนนี้");
      await page.screenshot({ path: path.join(DIR, "claim-history-4-parts-admin.png") });
      await card.click();
      await page.waitForTimeout(3000);
      (await label(page, "สถานะ ทั้งหมด").count()) > 0 ? pass("กดการ์ดแล้วไปหน้าประวัติเคลม") : fail("การ์ดไม่พาไปหน้าประวัติ");
      (await vis("ประวัติเคลม").count()) > 0 ? pass("Admin Spare Part: เมนูข้างมี ประวัติเคลม") : fail("Admin Spare Part ไม่เห็นเมนูประวัติเคลม");
      await ctx.close();
    }
    // Super Admin กับหัวหน้าภาค — เจ้าของงานยืนยันว่าดูหน้านี้ได้ (หัวหน้าภาคเฉพาะใบในภาคตัวเอง)
    {
      const { ctx, page, vis } = await open(sa, 1400);
      (await vis("ประวัติเคลม").count()) > 0 ? pass("Super Admin: เมนูข้างมี ประวัติเคลม") : fail("Super Admin ไม่เห็นเมนู");
      await vis("ประวัติเคลม").first().click();
      await page.waitForTimeout(3000);
      await search(page, "WEB-O");
      const n = await page.locator('[aria-label^="แถวเคลม "]').locator("visible=true").count();
      n === 3 ? pass("Super Admin เห็นเคลมทุกภาค (รอบล่าสุด 3 แถว)") : fail(`Super Admin เห็น ${n} แถว`);
      await ctx.close();
    }
    {
      const { ctx, page, vis } = await open("S001", 1400);
      (await vis("ประวัติเคลม").count()) > 0 ? pass("หัวหน้าภาค: เมนูข้างมี ประวัติเคลม") : fail("หัวหน้าภาคไม่เห็นเมนู");
      await vis("ประวัติเคลม").first().click();
      await page.waitForTimeout(3000);
      await search(page, "WEB-O");
      const shown = await page.locator('[aria-label^="แถวเคลม "]').locator("visible=true").allInnerTexts();
      shown.length === 2 && shown.some((t) => t.includes(a.code)) && shown.some((t) => t.includes(b.code)) && !shown.some((t) => t.includes("WEB-OUT-1"))
        ? pass("หัวหน้าภาคเห็นเฉพาะเคลมของใบในภาคตัวเอง (ไม่เห็นใบนอกภาค)") : fail(`หัวหน้าภาคเห็น: ${shown.join(" | ").slice(0, 300)}`);
      await page.screenshot({ path: path.join(DIR, "claim-history-6-supervisor.png") });
      await ctx.close();
    }
    {
      const { ctx, page } = await open("A001", 420);
      await page.getByLabel("เปิดเมนู").locator("visible=true").first().click().catch(() => {});
      await page.waitForTimeout(800);
      await page.getByText("ประวัติเคลม", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
      await search(page, "WEB-OLD-");
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      over <= 1 && (await label(page, `การ์ดเคลม ${a.code}`).count()) > 0 && (await label(page, `การ์ดเคลม ${b.code}`).count()) > 0
        ? pass("จอมือถือ: การ์ดทีละชิ้น ไม่ล้นจอ") : fail(`จอมือถือ: ล้น ${over}px`);
      await page.screenshot({ path: path.join(DIR, "claim-history-5-phone.png") });
      await ctx.close();
    }
    // 15 มี.ค.: "3 เดือน" กับ "ปีนี้" ได้ช่วงเดียวกัน (1 ม.ค.–วันนี้) — เดิมหน้าจอเดาปุ่มจากวันที่ กดปีนี้แต่ 3 เดือนติด
    {
      const year = new Date().getUTCFullYear();
      const { ctx, page } = await open("A001", 420, new Date(`${year}-03-15T05:00:00Z`));
      await page.getByLabel("เปิดเมนู").locator("visible=true").first().click().catch(() => {});
      await page.waitForTimeout(800);
      await page.getByText("ประวัติเคลม", { exact: true }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
      const chip = label(page, "ช่วงวันที่และตัวกรองอื่น");
      await chip.click();
      await page.waitForTimeout(800);
      await label(page, "ช่วง ปีนี้").click();
      await page.waitForTimeout(1500);
      const sel = async (l) => label(page, l).getAttribute("aria-selected");
      const yy = String((year + 543) % 100).padStart(2, "0");
      const txt = await chip.innerText();
      (await sel("ช่วง ปีนี้")) === "true" && (await sel("ช่วง 3 เดือน")) !== "true" && txt.includes(`ปี ${yy}`)
        ? pass(`15 มี.ค. กดปีนี้: ปุ่มปีนี้ติด (ไม่ใช่ 3 เดือน) · ชิปขึ้น "ปี ${yy}"`)
        : fail(`ปีนี้: ปีนี้=${await sel("ช่วง ปีนี้")} 3 เดือน=${await sel("ช่วง 3 เดือน")} ชิป "${txt}"`);
      await label(page, "ช่วง 3 เดือน").click();
      await page.waitForTimeout(1500);
      (await sel("ช่วง 3 เดือน")) === "true" && (await sel("ช่วง ปีนี้")) !== "true" && (await chip.innerText()).includes("3 เดือน")
        ? pass("กด 3 เดือน: ปุ่ม 3 เดือนติด ชิปขึ้น 3 เดือน") : fail(`3 เดือน: ชิป "${await chip.innerText()}"`);
      await ctx.close();
    }
  } catch (e) {
    fail(String(e).slice(0, 400));
  } finally {
    if (fx) {
      await fx.cleanup();
      if (outId) await fx.call(fx.A, "DELETE", `/work-orders/${outId}`);
      fx.sql(`delete from "User" where "employeeCode" in ('${pa}','${sa}')`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
