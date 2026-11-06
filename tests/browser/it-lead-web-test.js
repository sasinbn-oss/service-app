// ทดสอบ: หัวหน้าภาคที่ดูแลงาน IT ผ่านเบราว์เซอร์ (เจ้าของงานตัดสิน 6 พ.ย. 69)
//   · จัดการผู้ใช้: สวิตช์ "ดูแลงาน IT ทุกภาคด้วย" (aria-checked) → ฐานข้อมูลตั้งคนนี้ · ป้าย "ดูแลงาน IT" บนการ์ด
//     เปิดให้อีกคนขณะที่มีคนถือ → กล่องยืนยันบอกชื่อคนเดิม → ยืนยัน → ฐานข้อมูลมีคนเดียว (คนใหม่)
//   · กล่องงานหัวหน้า IT: สวิตช์ "งาน CM ภาค… | งาน IT ทุกภาค" พร้อมจำนวน (aria-selected) · ส่วน IT มีชิปภาค (ทุกภาค + ภาคที่มีใบ)
//     กดชิปภาคแล้วเหลือใบของภาคนั้น
//   · หน้าใบงาน: ใบ IT ขั้นของแอดมิน (ส่งใบเสนอราคา) หัวหน้า IT เห็นปุ่มของขั้น · ใบ CM ขั้นเดียวกันไม่เห็น
//   · แก้จากระยะไกลแล้ว · ปิดงาน: บันทึก + ภาพหน้าจอ → ฐานข้อมูล DONE · REMOTE_FIXED · ไฟล์ REMOTE_FIX · ประวัติ REMOTE_CLOSED
//   · หัวหน้าภาคคนอื่น (ภาคเดียวกับสาขาของใบ IT) ไม่เห็นใบ IT ในกล่องงาน · เปิดใบได้ กล่องบอกว่าใครดูแล + ปุ่ม "ปิดใบงาน"
//     ไม่มีปุ่มขั้นอื่น (เจ้าของงานขอ 6 พ.ย. 69: หัวหน้าภาคอื่นเห็นและปิดใบงาน IT ได้)
//   · กล่องงานแอดมิน: ใบ IT อยู่ส่วน "งาน IT" ไม่อยู่ส่วน "งาน CM" · งานของฉันวันนี้มีหัวข้อ "งาน IT"
// ต้องมี DATABASE_URL · สร้างหัวหน้าภาคชั่วคราวสองคนแล้วลบทิ้ง · คืนภาคของ S001 และธง itLead ทุกคน
const { chromium } = require("playwright");
const { purgeOrders } = require("./purge");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const API = "http://localhost:4000/api";
const BASE = "http://localhost:8081";
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
  const suf = Date.now() % 100000;
  const LC = `ZWIL${suf}`, BC = `ZWIB${suf}`;
  const oldRegion = sql(`select coalesce(region,'') from "User" where "employeeCode"='S001'`);
  const oldLeads = sql(`select coalesce(string_agg(id::text, ','),'') from "User" where "itLead"`);
  const brS = sql(`select code from "Branch" where region='ใต้' and "cancelledAt" is null order by code limit 1`);
  const brC = sql(`select code from "Branch" where region is not null and region<>'ใต้' and "cancelledAt" is null order by code limit 1`);
  const regC = sql(`select region from "Branch" where code='${brC}'`);
  // เครื่อง W83 ที่ใบทดสอบสร้างขึ้นเอง — เก็บว่าสาขาไหนยังไม่มี จะได้ลบตอนจบ (อ่านก่อนลบใบ)
  const noMachine = [brS, brC].filter((b) => !sql(`select m.id from "Machine" m join "Branch" b on b.id=m."branchId" where b.code='${b}' and m.code='W83'`));
  const ids = [];
  const shot = path.join(os.tmpdir(), `it-lead-shot-${suf}.jpg`);
  fs.copyFileSync(path.join(__dirname, "..", "plate-huebsch.jpg"), shot);
  const A = await login("A001");
  try {
    sql(`update "User" set "itLead"=false where "itLead"; update "User" set region='ใต้' where "employeeCode"='S001'`);
    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,region,"passwordHash","mustChangePassword") values
      ('${LC}','หัวหน้าไอทีเว็บ','SUPERVISOR','${regC}','${hash}',false),
      ('${BC}','หัวหน้าภาคบีเว็บ','SUPERVISOR','${regC}','${hash}',false)`);
    const lid = sql(`select id from "User" where "employeeCode"='${LC}'`);
    const mk = async (branch, jobType, status) => {
      const r = await call(A, "POST", "work-orders", {
        branchCode: branch, jobType, priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: "W83", model: "Oasis", symptom: "ทดสอบหัวหน้าภาคที่ดูแลงาน IT (เว็บ)" }],
      });
      const id = r.orders ? r.orders[0].id : r.id;
      ids.push(id);
      if (status !== "NEW") sql(`update "WorkOrder" set status='${status}', "needsParts"=false where id=${id}`);
      return { id, code: sql(`select code from "WorkOrder" where id=${id}`) };
    };
    const IS = await mk(brS, "IT", "NEW"); // ใบ IT ภาคใต้ — ไว้ปิดแบบแก้จากระยะไกล
    const IQ = await mk(brC, "IT", "AWAITING_QUOTE"); // ใบ IT ขั้นแอดมิน
    const CQ = await mk(brC, "CM", "AWAITING_QUOTE"); // ใบ CM ขั้นแอดมิน
    pass(`เตรียมใบ: ${IS.code} (IT ใต้) · ${IQ.code} (IT ขั้นแอดมิน) · ${CQ.code} (CM ขั้นแอดมิน)`);

    const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem("otteri-howto-auto", "off");
        localStorage.setItem("otteri-side-groups", "[]");
      } catch {}
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label^="${l}"]`).locator("visible=true");
    const signIn = async (code) => {
      await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: "networkidle", timeout: 180000 });
      await page.evaluate(() => localStorage.removeItem("token")).catch(() => {});
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
    };
    const signOut = async () => {
      await ctx.clearCookies();
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("otteri-howto-auto", "off"); localStorage.setItem("otteri-side-groups", "[]"); } catch {}
      });
    };
    const leads = () => sql(`select coalesce(string_agg("employeeCode", ',' order by id),'-') from "User" where "itLead"`);

    // ── จัดการผู้ใช้ ──
    await signIn("A001");
    await page.goto(`${BASE}/#/admin/users`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!(await label("ค้นหาผู้ใช้").count())) {
      await vis("สิทธิ์ผู้ใช้").first().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
    await label("ค้นหาผู้ใช้").first().fill("เว็บ");
    await page.waitForTimeout(800);
    const sw = (name) => label(`ดูแลงาน IT ทุกภาคด้วย ${name}`).first();
    (await sw("หัวหน้าไอทีเว็บ").count()) && (await sw("หัวหน้าภาคบีเว็บ").count())
      ? pass("การ์ดหัวหน้าภาคมีสวิตช์ \"ดูแลงาน IT ทุกภาคด้วย\"") : fail("ไม่เห็นสวิตช์ในจัดการผู้ใช้");
    (await vis("ได้คนเดียว · ใบงาน IT ทุกภาคมาที่คนนี้ หัวหน้าภาคคนอื่นไม่เห็น · งาน CM ภาคตัวเองยังทำเหมือนเดิม").count())
      ? pass("คำอธิบายใต้สวิตช์ตามที่ตกลง") : fail("ไม่เห็นคำอธิบายใต้สวิตช์");
    await sw("หัวหน้าไอทีเว็บ").click();
    await page.waitForTimeout(2000);
    leads() === LC && (await sw("หัวหน้าไอทีเว็บ").getAttribute("aria-checked")) === "true"
      ? pass("เปิดสวิตช์ → ฐานข้อมูลตั้งคนนี้ · aria-checked") : fail(`เปิดสวิตช์: ${leads()} ${await sw("หัวหน้าไอทีเว็บ").getAttribute("aria-checked")}`);
    (await label("หัวหน้าไอทีเว็บ ดูแลงาน IT").count()) && (await vis("ดูแลงาน IT").count())
      ? pass("ป้าย \"ดูแลงาน IT\" บนการ์ด") : fail("ไม่เห็นป้าย ดูแลงาน IT");
    await sw("หัวหน้าภาคบีเว็บ").click();
    await page.waitForTimeout(1500);
    const dlg = page.locator("[data-otteri-overlay]").locator("visible=true");
    const dlgText = (await dlg.allInnerTexts().catch(() => [])).join(" ");
    /หัวหน้าไอทีเว็บ/.test(dlgText) && /ย้ายงาน IT/.test(dlgText) && leads() === LC
      ? pass("เปิดให้คนที่สอง → กล่องยืนยันบอกชื่อคนเดิม (ฐานข้อมูลยังไม่เปลี่ยน)") : fail(`กล่องยืนยัน: "${dlgText.slice(0, 160)}" ${leads()}`);
    await page.getByText("ย้ายมาที่ หัวหน้าภาคบีเว็บ", { exact: true }).locator("visible=true").first().click().catch((e) => fail(`กดยืนยัน: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(2500);
    leads() === BC && (await sw("หัวหน้าไอทีเว็บ").getAttribute("aria-checked")) === "false"
      ? pass("ยืนยันย้าย → ฐานข้อมูลมีคนเดียว (คนใหม่) · สวิตช์คนเดิมดับ") : fail(`หลังย้าย: ${leads()}`);
    // คืนให้ L ทาง API (ทางเดียวกับปุ่มยืนยัน)
    await call(A, "PATCH", `auth/users/${lid}`, { itLead: true, replaceItLead: true });
    leads() === LC ? pass("ย้ายกลับมาที่ L") : fail(`ย้ายกลับ: ${leads()}`);

    // ── กล่องงานแอดมิน: แยก งาน CM | งาน IT ──
    await page.goto(`${BASE}/#/inbox`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    const seg = (name) => label(name).first();
    const segOn = async (name) => (await seg(name).getAttribute("aria-selected")) === "true";
    (await seg("งาน CM ").count()) && (await seg("งาน IT ").count())
      ? pass("กล่องงานแอดมินมีสวิตช์ งาน CM | งาน IT") : fail("ไม่เห็นสวิตช์ในกล่องแอดมิน");
    const codeVis = async (c) => (await vis(c).count()) > 0;
    (await codeVis(CQ.code)) && !(await codeVis(IQ.code)) ? pass("ส่วน งาน CM: มีใบ CM ไม่มีใบ IT") : fail(`CM: ${await codeVis(CQ.code)} ${await codeVis(IQ.code)}`);
    await seg("งาน IT ").click();
    await page.waitForTimeout(1200);
    (await segOn("งาน IT ")) && (await codeVis(IQ.code)) && !(await codeVis(CQ.code))
      ? pass("ส่วน งาน IT (aria-selected): มีใบ IT ไม่มีใบ CM") : fail(`IT: ${await segOn("งาน IT ")} ${await codeVis(IQ.code)} ${await codeVis(CQ.code)}`);

    // ── งานของฉันวันนี้ของแอดมิน: หัวข้อ งาน IT ──
    await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    const itCard = label("หัวข้อ งาน IT ");
    (await itCard.count()) ? pass(`งานของฉันวันนี้ (แอดมิน) มีหัวข้อ งาน IT: ${await itCard.first().getAttribute("aria-label")}`) : fail("ไม่เห็นหัวข้อ งาน IT");
    if (await itCard.count()) {
      await itCard.first().click();
      await page.waitForTimeout(1200);
      (await codeVis(IQ.code)) ? pass("ในหัวข้อ งาน IT มีใบ IT ขั้นของแอดมิน") : fail("ไม่เห็นใบ IT ในหัวข้อ งาน IT");
    }

    // ── หัวหน้า IT ──
    await signOut();
    await signIn(LC);
    await page.goto(`${BASE}/#/inbox`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    (await seg(`งาน CM ภาค${regC}`).count()) && (await seg("งาน IT ทุกภาค").count())
      ? pass(`กล่องหัวหน้า IT: "งาน CM ภาค${regC}" | "งาน IT ทุกภาค" พร้อมจำนวน (${await seg("งาน IT ทุกภาค").getAttribute("aria-label")})`)
      : fail("ไม่เห็นสวิตช์ของหัวหน้า IT");
    await seg("งาน IT ทุกภาค").click();
    await page.waitForTimeout(1200);
    (await codeVis(IS.code)) && (await codeVis(IQ.code)) ? pass("ส่วน งาน IT ทุกภาค: ใบ IT ทั้งสองภาค (ขั้นหัวหน้าภาค + ขั้นแอดมิน)") : fail("ไม่เห็นใบ IT ครบ");
    const chip = (r) => label(`ภาค ${r} `).first();
    (await chip("ทุกภาค").count()) && (await chip("ใต้").count()) && (await chip(regC).count())
      ? pass("ชิปภาค: ทุกภาค + ภาคที่มีใบ") : fail("ชิปภาคไม่ครบ");
    await chip("ใต้").click();
    await page.waitForTimeout(800);
    (await chip("ใต้").getAttribute("aria-selected")) === "true" && (await codeVis(IS.code)) && !(await codeVis(IQ.code))
      ? pass("กดชิปภาคใต้ (aria-selected) → เหลือใบ IT ภาคใต้") : fail("ชิปภาคไม่กรอง");

    // หน้าใบงาน: ใบ IT ขั้นแอดมิน → ปุ่มของขั้น · ใบ CM ขั้นเดียวกัน → ไม่มี
    await page.goto(`${BASE}/#/wo/${IQ.code}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    (await label("ส่งใบเสนอราคา").count()) ? pass("ใบ IT ขั้นส่งใบเสนอราคา: หัวหน้า IT เห็นปุ่มของขั้น") : fail("ไม่เห็นปุ่มส่งใบเสนอราคาในใบ IT");
    await page.goto(`${BASE}/#/wo/${CQ.code}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    !(await label("ส่งใบเสนอราคา").count()) ? pass("ใบ CM ขั้นเดียวกัน: ไม่มีปุ่ม (ยังเป็นของแอดมิน)") : fail("ใบ CM มีปุ่มส่งใบเสนอราคา");

    // แก้จากระยะไกลแล้ว · ปิดงาน
    await page.goto(`${BASE}/#/wo/${IS.code}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    const rc = label("แก้จากระยะไกลแล้ว · ปิดงาน");
    (await rc.count()) ? pass("ใบ IT ขั้นใหม่มีปุ่ม \"แก้จากระยะไกลแล้ว · ปิดงาน\"") : fail("ไม่เห็นปุ่มแก้จากระยะไกล");
    await rc.first().click();
    await page.waitForTimeout(1200);
    await label("สิ่งที่แก้จากระยะไกล").first().fill("รีสตาร์ทระบบจ่ายเงินจากหลังบ้าน ทดสอบสแกนจ่ายผ่านแล้ว");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), label("เลือกภาพหน้าจอหลักฐาน").first().click()]);
    await chooser.setFiles(shot);
    await page.waitForTimeout(1500);
    (await vis("เลือกไว้ 1 รูป (ส่งตอนกดปิดงาน)").count()) ? pass("เลือกภาพหน้าจอแล้ว 1 รูป") : fail("ไม่เห็นว่าเลือกรูปแล้ว");
    await label("ยืนยันปิดงาน แก้จากระยะไกล").first().click();
    await page.waitForTimeout(4000);
    const done = sql(`select status||'|'||coalesce("closeResult",'-')||'|'||("closedById"=${lid})::text from "WorkOrder" where id=${IS.id}`);
    const evid = sql(`select count(*) from "WorkOrderAttachment" where "workOrderId"=${IS.id} and role='REMOTE_FIX'`);
    const lastLog = sql(`select action from "WorkOrderLog" where "workOrderId"=${IS.id} order by id desc limit 1`);
    done === "DONE|REMOTE_FIXED|true" && evid === "1" && lastLog === "REMOTE_CLOSED"
      ? pass("ปิดแล้ว (ฐานข้อมูล): DONE · REMOTE_FIXED · ปิดโดยหัวหน้า IT · ไฟล์ REMOTE_FIX 1 · ประวัติ REMOTE_CLOSED")
      : fail(`ปิดแบบแก้จากระยะไกล: ${done} ไฟล์ ${evid} ${lastLog}`);
    // กล่องแจ้งผล "WO-… ปิดงานแล้ว (แก้จากระยะไกล)" ต้องกด "ตกลง" ก่อน (บังทั้งหน้า — tests/README.md)
    for (const b of await page.getByText("ตกลง", { exact: true }).locator("visible=true").all()) await b.click().catch(() => {});
    await page.waitForTimeout(800);
    (await vis("สิ่งที่แก้จากระยะไกล").count()) && (await vis("ปิดงาน (แก้จากระยะไกล)", false).count())
      ? pass("หน้าใบงานหลังปิด: หัวข้อ \"สิ่งที่แก้จากระยะไกล\" + ประวัติ \"ปิดงาน (แก้จากระยะไกล)\"") : fail("หน้าใบงานหลังปิดไม่บอกว่าแก้จากระยะไกล");

    // ── หัวหน้าภาคคนอื่น (ภาคใต้ = ภาคของใบ IT) ──
    sql(`update "WorkOrder" set status='NEW', "closedAt"=null, "closedById"=null, "closeResult"=null where id=${IS.id}`);
    await signOut();
    await signIn("S001");
    await page.goto(`${BASE}/#/inbox`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    !(await codeVis(IS.code)) && !(await seg("งาน IT").count())
      ? pass("หัวหน้าภาคคนอื่น: ไม่เห็นใบ IT ในกล่องงาน · ไม่มีสวิตช์ งาน IT") : fail("หัวหน้าภาคคนอื่นยังเห็นใบ IT");
    await page.goto(`${BASE}/#/wo/${IS.code}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3500);
    {
      const box = (await label("กล่องใบงาน IT").count()) ? await label("กล่องใบงาน IT").first().innerText() : "";
      const closeBtn = await page.locator('[aria-label="ปิดใบงาน"]').locator("visible=true").count();
      const stepBtn = await label("ระบุอะไหล่").count();
      box.includes("หัวหน้าไอทีเว็บ") && box.includes("ปิดใบงานได้") && closeBtn > 0 && stepBtn === 0
        ? pass("หัวหน้าภาคของพื้นที่เปิดใบ IT: กล่องบอกว่าใครดูแล + ปุ่ม \"ปิดใบงาน\" · ไม่มีปุ่มระบุอะไหล่")
        : fail(`ใบ IT ของหัวหน้าภาคพื้นที่: กล่อง="${box}" ปุ่มปิด=${closeBtn} ปุ่มขั้น=${stepBtn}`);
    }

    errors.length ? fail(`JS error: ${errors.slice(0, 3).join(" | ")}`) : pass("ไม่มี JS error");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    await browser.close();
    await purgeOrders(A, ids);
    for (const b of noMachine)
      sql(`delete from "Machine" m using "Branch" b where b.id=m."branchId" and b.code='${b}' and m.code='W83' and not exists (select 1 from "WorkOrder" w where w."machineId"=m.id)`);
    sql(`update "User" set "itLead"=false where "itLead";
      delete from "User" where "employeeCode" in ('${LC}','${BC}');
      update "User" set region=nullif('${oldRegion}','') where "employeeCode"='S001'`);
    if (oldLeads) sql(`update "User" set "itLead"=true where id in (${oldLeads})`);
    fs.rmSync(shot, { force: true });
  }
})();
