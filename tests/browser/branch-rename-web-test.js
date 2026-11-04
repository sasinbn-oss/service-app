// ทดสอบ: แก้ชื่อสาขาในแผงแก้ไข · คืนตามรายงาน · ประวัติสาขา (เจ้าของงานตัดสิน 4 พ.ย. 69 — ไม่รวมสาขา)
//   · พิมพ์ชื่อใหม่: กล่อง "ชื่อในรายงานเครื่องเสีย" ขึ้นก่อนบันทึก · บันทึก → ฐานเปลี่ยน + จำไว้ (BranchPin name) + ประวัติ RENAMED
//     · ข้อความผลในแผง (aria-label "ผลการทำงาน") · แถวขึ้นชื่อใหม่ + ป้าย "แก้ในแอป" · ประวัติในแผงขึ้นทันทีพร้อมชื่อคนแก้
//   · "คืนตามรายงาน" → ฐานกลับเป็นชื่อตามรายงาน เลิกบังคับ · ช่องชื่อกลับเป็นชื่อตามรายงาน · ประวัติ "คืนชื่อตามรายงาน"
//   · ปิดสาขาในแผง (มีเหตุผล) → ฐาน + ประวัติ CLOSED · แท็บ "ปิดแล้ว" เห็นสาขาพร้อมประวัติ "ปิดสาขา — เหตุผล"
//     · เปิดสาขาอีกครั้ง → ฐาน + ประวัติ "เปิดสาขาอีกครั้ง" (เปิดแผงใหม่จากแท็บเปิดอยู่)
//   · จอแคบ: แผงในหน้าต่างมีช่องชื่อ + ประวัติ ไม่ล้นข้าง
// ใช้สาขา ZZN… ของตัวเอง ลบตอนจบ — ประวัติ/pin หายตามสาขา (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -qAt -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

const cleanup = () => sql(`delete from "Branch" where code like 'ZZN%';`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  cleanup();
  const oldName = "ร้านทดสอบเว็บ ชื่อตามรายงาน";
  const newName = "ร้านทดสอบเว็บ ชื่อแก้ในแอป";
  const reason = "ร้านย้ายไปใช้รหัสใหม่ (ทดสอบเว็บ)";
  const id = sql(`insert into "Branch"(code,name) values ('ZZN001','${oldName}') returning id`);
  const adminName = sql(`select name from "User" where "employeeCode"='A001'`);
  const logRows = () => sql(`select coalesce(string_agg(action, ',' order by id), '') from "BranchLog" where "branchId"=${id}`);

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  async function open(viewport) {
    const page = await (await browser.newContext({ viewport })).newPage();
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — กางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    if (viewport.width < 700) {
      await page.getByLabel("เปิดเมนู").click();
      await page.waitForTimeout(1000);
    }
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลสาขา").last().click();
    await page.waitForTimeout(4000);
    return page;
  }
  try {
    const page = await open({ width: 1400, height: 900 });
    const text = async (label) => ((await page.getByLabel(label, { exact: true }).count()) ? await page.getByLabel(label, { exact: true }).first().innerText() : "");
    const search = async (q) => {
      await page.getByLabel("ค้นหาสาขา").fill(q);
      await page.waitForTimeout(1500);
    };
    const openRow = async () => {
      await page.getByLabel("สาขา ZZN001").click();
      await page.waitForTimeout(1800);
    };

    // ── แก้ชื่อ ──
    await search("ZZN001");
    await openRow();
    const nameBox = page.getByLabel("ชื่อสาขา", { exact: true });
    (await nameBox.inputValue()) === oldName ? pass("แผงแก้ไขมีช่องชื่อ เริ่มที่ชื่อปัจจุบัน") : fail(`ช่องชื่อ: ${await nameBox.inputValue()}`);
    (await page.getByLabel("ชื่อในรายงานเครื่องเสีย").count()) === 0 ? pass("ยังไม่ได้แก้: ไม่มีกล่องชื่อในรายงาน") : fail("กล่องชื่อในรายงานขึ้นทั้งที่ยังไม่แก้");
    await nameBox.fill(newName);
    await page.waitForTimeout(300);
    (await text("ชื่อในรายงานเครื่องเสีย")).includes(`ชื่อในรายงานเครื่องเสีย: ${oldName}`)
      ? pass("พิมพ์ชื่อใหม่: กล่อง “ชื่อในรายงานเครื่องเสีย” ขึ้นก่อนบันทึก พร้อมคืนตามรายงาน") : fail(`กล่องชื่อในรายงาน: ${await text("ชื่อในรายงานเครื่องเสีย")}`);
    await page.getByLabel("บันทึกสาขา").click();
    await page.waitForTimeout(2500);
    const saved = sql(`select b.name||'|'||coalesce(p."fromValue",'-')||'|'||coalesce(p.value,'-') from "Branch" b
                       left join "BranchPin" p on p."branchId"=b.id and p.field='name' where b.id=${id}`);
    saved === `${newName}|${oldName}|${newName}` ? pass("บันทึกชื่อ: ฐานเปลี่ยน + จำชื่อตามรายงานไว้ (BranchPin name)") : fail(`ฐานหลังบันทึกชื่อ: ${saved}`);
    const renamedLog = sql(`select action||'|'||note||'|'||coalesce("byName",'-') from "BranchLog" where "branchId"=${id} order by id desc limit 1`);
    renamedLog === `RENAMED|ชื่อสาขา: ${oldName} → ${newName}|${adminName}` ? pass("ฐาน: ประวัติ RENAMED พร้อมชื่อคนแก้") : fail(`ประวัติในฐาน: ${renamedLog}`);
    (await text("ผลการทำงาน")).includes("บันทึกชื่อแล้ว") ? pass("ข้อความผลในแผงบอกว่าบันทึกชื่อแล้ว") : fail(`ข้อความผล: ${await text("ผลการทำงาน")}`);
    const rowText = await page.getByLabel("สาขา ZZN001").innerText();
    rowText.includes(newName) && rowText.includes("แก้ในแอป") ? pass("แถวขึ้นชื่อใหม่ + ป้าย แก้ในแอป") : fail(`แถว: ${rowText}`);
    const hist = await text("ประวัติสาขา");
    hist.includes(`ชื่อสาขา: ${oldName} → ${newName}`) && hist.includes(adminName)
      ? pass("ประวัติสาขาในแผงขึ้นทันที พร้อมชื่อคนแก้") : fail(`ประวัติในแผง: ${hist}`);

    // ── คืนตามรายงาน ──
    await page.getByLabel("คืนชื่อตามรายงาน").click();
    await page.waitForTimeout(2500);
    const restored = sql(`select name||'|'||(select count(*) from "BranchPin" where "branchId"=${id} and field='name') from "Branch" where id=${id}`);
    restored === `${oldName}|0` ? pass("คืนตามรายงาน (ฐาน): ชื่อกลับเป็นชื่อในรายงาน เลิกบังคับ") : fail(`คืนตามรายงาน: ${restored}`);
    logRows() === "RENAMED,NAME_RESTORED" ? pass("ฐาน: ประวัติ NAME_RESTORED ต่อจาก RENAMED") : fail(`ประวัติในฐาน: ${logRows()}`);
    (await page.getByLabel("ชื่อสาขา", { exact: true }).inputValue()) === oldName && (await text("ผลการทำงาน")).includes("คืนชื่อ ZZN001 ตามรายงานแล้ว")
      && (await text("ประวัติสาขา")).includes(`คืนชื่อตามรายงาน: ${newName} → ${oldName}`)
      ? pass("หลังคืนชื่อ: ช่องชื่อเป็นชื่อในรายงาน · ข้อความผล · ประวัติในแผง") : fail(`หลังคืนชื่อ: ${await text("ผลการทำงาน")} · ${await text("ประวัติสาขา")}`);
    !(await page.getByLabel("สาขา ZZN001").innerText()).includes("แก้ในแอป") ? pass("แถวไม่มีป้าย แก้ในแอป แล้ว") : fail("ป้ายแก้ในแอปค้างที่แถว");

    // ── ปิดสาขา ──
    await page.getByLabel("ปิดสาขา", { exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByLabel("เหตุผลที่ปิดสาขา").fill(reason);
    await page.getByLabel("ยืนยันปิดสาขา").click();
    await page.waitForTimeout(2500);
    const closed = sql(`select ("cancelledAt" is not null)::text||'|'||(select note||'|'||coalesce("byName",'-') from "BranchLog" where "branchId"=${id} order by id desc limit 1) from "Branch" where id=${id}`);
    closed === `true|ปิดสาขา — ${reason}|${adminName}` ? pass("ปิดสาขา (ฐาน): ปิดแล้ว + ประวัติ “ปิดสาขา — เหตุผล” พร้อมคนปิด") : fail(`ปิดสาขา: ${closed}`);
    await page.getByLabel(/^ตัวกรอง ปิดแล้ว/).first().click();
    await page.waitForTimeout(2000);
    (await page.getByLabel("สาขา ZZN001").count()) === 1 && (await page.getByLabel("สาขา ZZN001").innerText()).includes("ปิดแล้ว")
      ? pass("แท็บ ปิดแล้ว: เห็นสาขาที่ปิด (ป้ายปิดแล้ว)") : fail("แท็บปิดแล้วไม่มีสาขา ZZN001");
    await openRow();
    (await text("ประวัติสาขา")).includes(`ปิดสาขา — ${reason}`) ? pass("สาขาที่ปิด: ประวัติในแผงขึ้น “ปิดสาขา — เหตุผล”") : fail(`ประวัติสาขาที่ปิด: ${await text("ประวัติสาขา")}`);

    // ── เปิดสาขาอีกครั้ง ──
    await page.getByLabel("เปิดสาขาอีกครั้ง").click();
    await page.waitForTimeout(2500);
    const reopened = sql(`select ("cancelledAt" is null)::text from "Branch" where id=${id}`);
    reopened === "true" && logRows() === "RENAMED,NAME_RESTORED,CLOSED,REOPENED" ? pass("เปิดสาขาอีกครั้ง (ฐาน): เปิดแล้ว + ประวัติ REOPENED") : fail(`เปิดคืน: ${reopened} · ${logRows()}`);
    await page.getByLabel(/^ตัวกรอง สาขาที่เปิดอยู่/).first().click();
    await page.waitForTimeout(2000);
    await openRow();
    const after = await text("ประวัติสาขา");
    after.indexOf("เปิดสาขาอีกครั้ง") >= 0 && after.indexOf("เปิดสาขาอีกครั้ง") < after.indexOf(`ปิดสาขา — ${reason}`)
      ? pass("ประวัติในแผง: เปิดสาขาอีกครั้ง อยู่บนสุด (ใหม่ก่อนเก่า)") : fail(`ประวัติหลังเปิดคืน: ${after}`);

    // ── จอแคบ ──
    const narrow = await open({ width: 420, height: 860 });
    await narrow.getByLabel("ค้นหาสาขา").fill("ZZN001");
    await narrow.waitForTimeout(1500);
    await narrow.getByLabel("สาขา ZZN001").click();
    await narrow.waitForTimeout(1800);
    const narrowName = narrow.getByLabel("ชื่อสาขา", { exact: true }).locator("visible=true");
    const sw = await narrow.evaluate(() => document.documentElement.scrollWidth);
    (await narrowName.count()) === 1 && (await narrow.getByLabel("ประวัติสาขา").count()) > 0 && sw <= 420
      ? pass("จอแคบ: หน้าต่างแก้ไขมีช่องชื่อ + ประวัติ ไม่ล้นข้าง") : fail(`จอแคบ: ช่องชื่อ ${await narrowName.count()} · กว้าง ${sw}`);

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    cleanup();
    await browser.close();
  }
})();
