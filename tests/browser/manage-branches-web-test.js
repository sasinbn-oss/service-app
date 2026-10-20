// ทดสอบ: หน้าจัดการข้อมูลสาขา (ออกแบบใหม่ ต.ค. 69 — เดิมจอขาวเมื่อมีสาขาไม่มีพิกัด)
//   · หน้าเปิดได้แม้มีสาขาไม่มีพิกัด · ตัวเลขสรุปตรงฐานข้อมูล · ค้นหาแล้วเจอ
//   · กดแถว → แผงแก้ไข · วาง "13.75, 100.50" แล้วกดอ่าน → ช่องพิกัดเต็ม · บันทึก → ฐานข้อมูลเปลี่ยน
//   · สาขาที่มีใบงาน: ไม่มีปุ่มลบถาวร มีเหตุผลบอกแทน
//   · จอแคบ (มือถือ): ขึ้นเป็นการ์ด
// แก้พิกัดสาขาชั่วคราวแล้วคืนค่าเดิม (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  // สาขาที่มีใบงาน — ใช้ทั้งทดสอบแก้พิกัดและทดสอบว่าลบไม่ได้
  const [id, code, lat, lng, region] = sql(
    `select b.id||'|'||b.code||'|'||coalesce(b.latitude::text,'')||'|'||coalesce(b.longitude::text,'')||'|'||coalesce(b.region,'') from "Branch" b
     where b."cancelledAt" is null and exists (select 1 from "WorkOrder" w where w."branchId"=b.id) order by b.id limit 1`
  ).split("|");
  const otherRegion = sql(`select region from "Branch" where region is not null and region<>'${region}' limit 1`);
  const restore = () =>
    sql(`update "Branch" set latitude=nullif('${lat}','')::float, longitude=nullif('${lng}','')::float, region=nullif('${region}','') where id=${id};
         delete from "BranchPin" where "branchId"=${id};`);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  try {
    sql(`update "Branch" set latitude=null, longitude=null where id=${id}`);
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลสาขา").last().click();
    await page.waitForTimeout(4000);

    const noCoords = Number(sql(`select count(*) from "Branch" where "cancelledAt" is null and (latitude is null or longitude is null)`));
    const tile = await page.getByLabel(/^ตัวกรอง ยังไม่มีพิกัด/).first().getAttribute("aria-label");
    tile === `ตัวกรอง ยังไม่มีพิกัด ${noCoords}` ? pass(`หน้าเปิดได้ · ตัวเลขไม่มีพิกัด ${noCoords} ตรงฐานข้อมูล`) : fail(`จอขาว/ตัวเลขไม่ตรง: ${tile} vs ${noCoords}`);

    await page.getByLabel("ค้นหาสาขา").fill(code);
    await page.waitForTimeout(1500);
    const row = page.getByLabel(`สาขา ${code}`);
    (await row.count()) === 1 && (await row.innerText()).includes("ยังไม่มีพิกัด")
      ? pass(`ค้น ${code} เจอ · แถวขึ้นว่า ยังไม่มีพิกัด`) : fail(`แถว ${code}: ${(await row.count()) && (await row.innerText())}`);

    await row.click();
    await page.waitForTimeout(1500);
    const panel = page.getByLabel("แผงแก้ไขสาขา");
    (await panel.count()) ? pass("กดแถวแล้วเปิดแผงแก้ไข") : fail("ไม่มีแผงแก้ไข");
    await page.getByLabel("วางลิงก์ Google Maps").fill("13.75, 100.50");
    await page.getByLabel("อ่านพิกัดจากลิงก์").click();
    await page.waitForTimeout(1500);
    const filled = [await page.getByLabel("ละติจูด").inputValue(), await page.getByLabel("ลองจิจูด").inputValue()];
    filled[0] === "13.75" && filled[1] === "100.5" ? pass("วางพิกัดแล้วกดอ่าน: ช่องพิกัดเต็ม") : fail(`ช่องพิกัด: ${filled}`);
    await page.getByLabel("บันทึกสาขา").click();
    await page.waitForTimeout(2500);
    const saved = sql(`select latitude||','||longitude from "Branch" where id=${id}`);
    saved === "13.75,100.5" ? pass("บันทึกแล้วพิกัดเปลี่ยนในฐานข้อมูล") : fail(`ฐานข้อมูล: ${saved}`);

    // ภาคเลือกจากรายการในระบบ แล้วบันทึก — ต้องเปลี่ยนในฐานข้อมูลและจำไว้ให้ตัวนำเข้า
    if (!(await page.getByLabel("แผงแก้ไขสาขา").count())) {
      await page.getByLabel(`สาขา ${code}`).click();
      await page.waitForTimeout(1500);
    }
    await page.getByLabel("เลือกภาค").click();
    await page.waitForTimeout(800);
    await page.getByText(otherRegion, { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(500);
    await page.getByLabel("บันทึกสาขา").click();
    await page.waitForTimeout(2500);
    const reg = sql(`select region||'|'||(select count(*) from "BranchPin" where "branchId"=${id} and field='region') from "Branch" where id=${id}`);
    reg === `${otherRegion}|1` ? pass(`เลือกภาค ${otherRegion} จากรายการ บันทึกแล้วฐานข้อมูลเปลี่ยน และจำไว้กันไฟล์ทับ`) : fail(`ภาค: ${reg}`);
    (await page.getByText("แก้ในแอป", { exact: true }).locator("visible=true").count()) ? pass("ป้าย แก้ในแอป ขึ้นที่ช่องภาค") : fail("ไม่มีป้าย แก้ในแอป");

    // หลังบันทึก แผงอาจปิด — เปิดใหม่เพื่อดูส่วนลบ
    if (!(await page.getByLabel("แผงแก้ไขสาขา").count())) {
      await page.getByLabel(`สาขา ${code}`).click();
      await page.waitForTimeout(1500);
    }
    const why = page.getByLabel("เหตุผลที่ลบไม่ได้");
    (await page.getByLabel("ลบสาขาถาวร").count()) === 0 && (await why.count()) && (await why.innerText()).includes("ใบงาน")
      ? pass("สาขาที่มีใบงาน: ไม่มีปุ่มลบถาวร บอกเหตุผลแทน") : fail("ยังมีปุ่มลบ/ไม่มีเหตุผล");

    const narrow = await (await browser.newContext({ viewport: { width: 420, height: 860 } })).newPage();
    narrow.on("pageerror", (e) => errors.push(String(e)));
    await narrow.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await narrow.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await narrow.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await narrow.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
    await narrow.waitForTimeout(3500);
    await narrow.getByLabel("เปิดเมนู").click();
    await narrow.waitForTimeout(1000);
    await narrow.getByText("ระบบหลังบ้าน", { exact: true }).locator("visible=true").first().click();
    await narrow.waitForTimeout(1500);
    await narrow.getByText("จัดการข้อมูลสาขา", { exact: true }).locator("visible=true").last().click();
    await narrow.waitForTimeout(4000);
    const cards = await narrow.getByLabel(/^สาขา [A-Z]/).count();
    const sw = await narrow.evaluate(() => document.documentElement.scrollWidth);
    cards > 0 && sw <= 420 ? pass(`จอแคบ: ขึ้นเป็นการ์ด ${cards} ใบ ไม่ล้นข้าง`) : fail(`จอแคบ: การ์ด ${cards} กว้าง ${sw}`);

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    restore();
    await browser.close();
  }
})();
