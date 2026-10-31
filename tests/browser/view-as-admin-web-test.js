// ทดสอบ: แอดมินดูในฐานะหัวหน้าภาค/ช่าง/ทีม Area ได้ (เจ้าของงานเพิ่ม ต.ค. 69)
//   · แอดมินเห็นปุ่ม "ดูในฐานะ…" · ตัวเลือกมี ช่าง/หัวหน้าภาค/Area/Supervisor (COCO)/Maid (COCO) (ไม่มีแท็บแอดมิน)
//   · เลือก T001 → แถบ "กำลังดูในฐานะ" + บันทึกในฐานข้อมูลว่าใครดูใคร · กลับเป็นตัวเองได้ (บันทึกเวลาเลิกดู)
//   · Supervisor (COCO) จัดกลุ่มตาม Area · ค้น Maid ด้วยรหัสสาขา → ดูในฐานะ Maid ได้ แถบบอกตำแหน่ง Maid (COCO)
//     · ระหว่างดูในฐานะ Maid เมนูไม่มีติดตามเครื่องเสีย/รายงาน/ผังผู้รับผิดชอบ และเปิดมาเจอแผนงาน (เท่าที่ Maid เห็น · ต.ค. 69)
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const aid = sql(`select id from "User" where "employeeCode"='A001'`);
  // ทีม Area ที่ยังไม่เคยเข้าระบบ — Maid ประจำ C0006 · Maid อีกคนประจำสาขาอื่น ไว้เช็คว่าค้นรหัสสาขาแล้วกรองออกจริง
  // ล้างของค้างจากรอบที่ถูกตัดกลางทางก่อน ไม่งั้นรหัสพนักงานซ้ำแล้วทุกรอบหลังจากนั้นพัง
  const zw = `('zw.area','zw.sup','zw.maid','zw.maid2')`;
  const cleanZw = () => sql(`delete from "ViewAsLog" where "targetUserId" in (select id from "User" where "employeeCode" in ${zw});
       delete from "Branch" where code='CZW01';
       update "User" set "areaId"=null where "employeeCode" in ${zw}; delete from "User" where "employeeCode" in ${zw}`);
  cleanZw();
  sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
         select 'zw.area', 'Area ทดลองดูแทน', 'AREA', "passwordHash", false from "User" where "employeeCode"='T001';
       insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword","areaId")
         select 'zw.sup', 'Supervisor ทดลองดูแทน', 'COCO_SUPERVISOR', "passwordHash", false, (select id from "User" where "employeeCode"='zw.area')
         from "User" where "employeeCode"='T001';
       insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
         select 'zw.maid', 'Maid ทดลองดูแทน', 'COCO_MAID', "passwordHash", false from "User" where "employeeCode"='T001';
       insert into "CocoMaidBranch"("userId","branchId") select (select id from "User" where "employeeCode"='zw.maid'), id from "Branch" where code='C0006';
       insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
         select 'zw.maid2', 'Maid สาขาอื่นดูแทน', 'COCO_MAID', "passwordHash", false from "User" where "employeeCode"='T001';
       insert into "CocoMaidBranch"("userId","branchId") select (select id from "User" where "employeeCode"='zw.maid2'), id from "Branch" where code='C0001';
       insert into "Branch"(code,name,"cocoSupervisorId") values ('CZW01','สาขาทดลองดูแทน',(select id from "User" where "employeeCode"='zw.sup'));`);
  const maidId = sql(`select id from "User" where "employeeCode"='zw.maid'`);
  const before = Number(sql(`select coalesce(max(id),0) from "ViewAsLog"`));
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);

    (await label("ดูในฐานะผู้ใช้อื่น").count()) ? pass("แอดมินเห็นปุ่ม ดูในฐานะ…") : fail("แอดมินไม่เห็นปุ่ม");
    await label("ดูในฐานะผู้ใช้อื่น").first().click();
    await page.waitForTimeout(1500);
    const tabs = ["ช่าง", "หัวหน้าภาค", "Area", "Supervisor (COCO)", "Maid (COCO)"];
    const have = [];
    for (const t of tabs) if (await label(`ตำแหน่ง ${t}`).count()) have.push(t);
    have.length === tabs.length && !(await label("ตำแหน่ง แอดมิน").count())
      ? pass("ตัวเลือกมี ช่าง/หัวหน้าภาค/Area/Supervisor (COCO)/Maid (COCO) — ไม่มีแท็บแอดมิน") : fail(`แท็บตัวเลือกไม่ถูก: ${have.join(",")}`);
    await label("ค้นหาผู้ใช้ที่จะดู").fill("T001");
    await page.waitForTimeout(600);
    await page.locator('[aria-label^="เลือก "]').locator("visible=true").first().click();
    await page.waitForTimeout(300);
    await label("ดูในฐานะคนนี้").click();
    await page.waitForTimeout(4000);
    const log = sql(`select "byUserId"||'|'||(select "employeeCode" from "User" where id="targetUserId")||'|'||coalesce("endedAt"::text,'open') from "ViewAsLog" where id>${before} order by id desc limit 1`);
    (await vis("กำลังดูในฐานะ", false).count()) && log === `${aid}|T001|open`
      ? pass("ดูในฐานะ T001 ได้ แถบบอกอยู่ · ฐานข้อมูลบันทึกว่าแอดมินดู T001") : fail(`เริ่มดู: ${log}`);
    await label("กลับเป็นตัวเอง").first().click();
    await page.waitForTimeout(3000);
    const ended = sql(`select ("endedAt" is not null)::text from "ViewAsLog" where id>${before} order by id desc limit 1`);
    (await label("ดูในฐานะผู้ใช้อื่น").count()) && ended === "true" ? pass("กลับเป็นตัวเองได้ · บันทึกเวลาเลิกดู") : fail(`กลับเป็นตัวเอง: ${ended}`);

    // ทีม Area — คนโทรมาถามมักบอกชื่อ Area หรือสาขา จึงจัด Supervisor ตาม Area และค้น Maid ด้วยรหัสสาขาได้
    await label("ดูในฐานะผู้ใช้อื่น").first().click();
    await page.waitForTimeout(1500);
    await label("ตำแหน่ง Supervisor (COCO)").click();
    await page.waitForTimeout(400);
    (await vis("Area Area ทดลองดูแทน").count()) && (await vis("Supervisor ทดลองดูแทน").count())
      ? pass("Supervisor (COCO) จัดกลุ่มตาม Area ที่สังกัด") : fail("ไม่เห็นกลุ่ม Area ของ Supervisor (COCO)");
    // ร้านโทรมาบอกรหัสสาขา — ค้นแล้วเจอคนดูแล และบอกว่าเจอเพราะสาขาไหน (เจ้าของงานขอ ต.ค. 69)
    await label("ค้นหาผู้ใช้ที่จะดู").fill("czw01");
    await page.waitForTimeout(600);
    const supRows = await page.locator('[aria-label^="เลือก "]').locator("visible=true").count();
    (await vis("zw.sup · ดูแล CZW01 สาขาทดลองดูแทน", false).count()) && supRows === 1
      ? pass("แท็บ Supervisor (COCO) ค้นด้วยรหัสสาขาที่ดูแลเจอ (คนอื่นถูกกรองออก) และบอกสาขาที่ตรง")
      : fail(`ค้น Supervisor ด้วยรหัสสาขา: แถว=${supRows}`);
    await label("ค้นหาผู้ใช้ที่จะดู").fill("");
    await label("ตำแหน่ง Maid (COCO)").click();
    await label("ค้นหาผู้ใช้ที่จะดู").fill("c0006");
    await page.waitForTimeout(600);
    (await vis("Maid ทดลองดูแทน").count()) && (await vis("zw.maid · ประจำ C0006", false).count()) && !(await vis("Maid สาขาอื่นดูแทน").count())
      ? pass("ค้น Maid ด้วยรหัสสาขาเจอ บอกสาขาที่ประจำ และ Maid สาขาอื่นถูกกรองออก") : fail("ค้น Maid ด้วยรหัสสาขาไม่ถูก");
    await label("เลือก Maid ทดลองดูแทน").click();
    await page.waitForTimeout(300);
    await label("ดูในฐานะคนนี้").click();
    await page.waitForTimeout(4000);
    const mlog = sql(`select "byUserId"||'|'||"targetUserId" from "ViewAsLog" where id>${before} order by id desc limit 1`);
    (await vis("(zw.maid · Maid (COCO))", false).count()) && mlog === `${aid}|${maidId}`
      ? pass("ดูในฐานะ Maid ได้ (บัญชีที่ยังไม่เคยเข้าระบบ) · แถบบอกตำแหน่ง Maid (COCO) · ฐานข้อมูลบันทึก") : fail(`ดู Maid: ${mlog}`);
    // แอดมินต้องเห็นเท่าที่ Maid เห็น — ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ เหลือเฉพาะ Area (เจ้าของงานขอ ต.ค. 69)
    const asMaid = [];
    for (const t of ["ติดตามเครื่องเสีย", "รายงาน", "ผังผู้รับผิดชอบ"]) if (await label(t).count()) asMaid.push(t);
    !asMaid.length && (await label("ใบงานซ่อม").count()) && (await vis("สาขาที่ประจำ").count())
      ? pass("ดูในฐานะ Maid: เมนูไม่มี ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ · เปิดมาเจอแผนงาน (เท่าที่ Maid เห็น)")
      : fail(`ดูในฐานะ Maid เห็นเมนูของ Area: [${asMaid}] หรือไม่ได้เปิดที่แผนงาน`);
    await label("กลับเป็นตัวเอง").first().click();
    await page.waitForTimeout(3000);
    (await label("ดูในฐานะผู้ใช้อื่น").count()) ? pass("กลับจาก Maid เป็นตัวเองได้") : fail("กลับจาก Maid ไม่ได้");
    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    sql(`delete from "ViewAsLog" where id>${before}`);
    cleanZw();
    await browser.close();
  }
})();
