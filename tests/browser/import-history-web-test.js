// ทดสอบหน้าจอ: ประวัติการนำเข้า (เจ้าของงานอนุมัติตัวอย่าง 5 พ.ย. 69) · จอคอม 1440 + มือถือ 390
//   A. เปิดจากเมนูข้าง (กลุ่มผู้ดูแลระบบ ถัดจากถังขยะใบงาน) → ที่อยู่ #/admin/imports · ชิป "ทั้งหมด" ติด (aria-selected)
//      · กดชิป "ใบแจ้งซ่อม" → ชิปติด ที่อยู่มี kind=repair · กดรอบที่ครบ → การ์ดติด ที่อยู่มี run=r… · ตัวเลขบนกล่องตรงฐานข้อมูล
//      · กดตัวเลข "เปิดใบใหม่" → เหลือเฉพาะแถวที่เปิด (กล่องติด) · กดซ้ำ → ทุกแถว · กดรหัสใบงาน → เปิดใบนั้น (รหัสในที่อยู่)
//      · รอบที่หยุดกลางทาง/ไม่สำเร็จขึ้นแถบเหลือง/แดงตามตัวอย่าง · ดาวน์โหลดผลทีละแถว (Excel) เปิดลิงก์ไฟล์
//   B. ปุ่ม "ประวัติการนำเข้า" ข้างปุ่มนำเข้าในหน้ารายการใบงาน → หน้าประวัติกรองใบแจ้งซ่อมไว้ให้ · F5 ที่ลิงก์รอบ = รอบเดิม
//   C. หน้าต่างนำเข้าใบแจ้งซ่อม: ไฟล์ 12 แถว (2 ชุด) กด "หยุดหลังชุดนี้" บนหน้าโหลด → หยุดหลังชุดแรก กล่องบอก "แล้วหยุดตามที่กด"
//      → "ดูในประวัติการนำเข้า" เปิดรอบนั้น (หยุดกลางทาง) · ฐานข้อมูล: รอบ STOPPED เปิด 10 ใบ เหลือ 2 แถว
//   D. มือถือ 390: รายการอยู่บน รายละเอียดอยู่ล่าง กดรอบแล้วเลื่อนลงไปที่รายละเอียด · ไม่มีเลื่อนซ้ายขวา · โหมดมืดใช้สีการ์ดของโหมดมืด
// สร้างรอบด้วย API (ไฟล์ฟอร์มแจ้งซ่อมจาก tests/fixtures-repair-form.js) แล้วลบทั้งรอบ ใบงาน (purgeOrders) ตอนจบ · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const { purgeOrders } = require("./purge");
const DIR = __dirname;
const APP = "http://127.0.0.1:8081";
const API = "http://127.0.0.1:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SUF = String(process.pid % 100000);
const PRE = `ประวัติเว็บ${SUF}`;
const tmp = (n) => path.join(os.tmpdir(), `import-history-${process.pid}-${n}`);

/** ไฟล์ฟอร์มแจ้งซ่อม — แถวละอาการ ตู้แลกเหรียญที่ C0006 (ไม่ผูกเครื่อง ไม่ชนใบค้าง) · bad = สาขาที่ไม่มี */
function form(name, symptoms, bad = []) {
  const spec = [
    ...symptoms.map((s, i) => ({ branch: "C0006", jobType: "ตู้แลกเหรียญ", machine: "", symptom: `${PRE} ${s}`, contact: "คุณเว็บ", phone: `08400${SUF}${i}`, place: "สาขาทดสอบ" })),
    ...bad.map((s, i) => ({ branch: "ZZ997", jobType: "CM", machine: "W1", symptom: `${PRE} ${s}`, contact: "คุณเว็บ", phone: `08500${SUF}${i}`, place: "ไม่มี" })),
  ];
  fs.writeFileSync(tmp("spec.json"), JSON.stringify(spec));
  const out = tmp(name);
  execFileSync(process.execPath, [path.join(DIR, "../fixtures-repair-form.js"), tmp("spec.json"), out], {
    env: { ...process.env, NODE_PATH: path.join(DIR, "../../backend/node_modules") },
  });
  return out;
}
async function apply(token, file, fileName, fields) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)]), fileName);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${API}/work-orders/import-form`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  return r.json();
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const IH0 = sql(`select coalesce(max(id),0) from "ImportRun"`);
  const files = [];
  let A = null;
  try {
    A = (await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "A001", password: "test1234" }) })).json()).token;
    // รอบที่ครบ (เปิด 2 · สาขาไม่มี 1) · รอบที่หยุดกลางทาง (เปิด 1 จาก 3 แล้วกดหยุด) · รอบที่ไม่สำเร็จ (แอปหายก่อนเปิดได้สักใบ)
    const OK = `ฟอร์มแจ้งซ่อม ครบ ${SUF}.xlsx`, STOP = `ฟอร์มแจ้งซ่อม หยุด ${SUF}.xlsx`, BAD = `ฟอร์มแจ้งซ่อม ไม่สำเร็จ ${SUF}.xlsx`;
    files.push(form("ok.xlsx", ["ครบ ก", "ครบ ข"], ["ครบ สาขาไม่มี"]));
    const okRes = await apply(A, files[0], OK, { apply: "true", only: "2,3", runKey: `w1-${SUF}-abcdef` });
    files.push(form("stop.xlsx", ["หยุด ก", "หยุด ข", "หยุด ค"]));
    const stopRes = await apply(A, files[1], STOP, { apply: "true", only: "2", runKey: `w2-${SUF}-abcdef` });
    await fetch(`${API}/import-history/stop`, { method: "POST", headers: { Authorization: `Bearer ${A}`, "Content-Type": "application/json" }, body: JSON.stringify({ runKey: `w2-${SUF}-abcdef`, reason: "user" }) });
    files.push(form("bad.xlsx", ["ไม่สำเร็จ ก", "ไม่สำเร็จ ข"]));
    const badRes = await apply(A, files[2], BAD, { apply: "true", only: "99", runKey: `w3-${SUF}-abcdef` });
    sql(`update "ImportRun" set "lastAt" = timezone('utc', now()) - interval '10 minutes' where id=${badRes.runId.slice(1)}`);
    const [rOk, rStop, rBad] = [okRes.runId, stopRes.runId, badRes.runId];
    sql(`select string_agg(status, ',' order by id) from "ImportRun" where id in (${[rOk, rStop, rBad].map((r) => r.slice(1)).join(",")})`) === "DONE,STOPPED,RUNNING"
      ? pass(`เตรียมรอบ: ครบ ${rOk} · หยุด ${rStop} · แอปหาย ${rBad} (ฐานข้อมูล DONE · STOPPED · RUNNING)`) : fail(`เตรียมรอบไม่ได้: ${JSON.stringify([okRes.error, stopRes.error, badRes.error])}`);

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      try {
        localStorage.setItem("otteri-howto-auto", "off");
        // เมนูข้างย่อทุกกลุ่มยกเว้นงานซ่อมไว้ก่อน — กางทุกกลุ่มให้เห็นเมนูผู้ดูแลระบบ
        localStorage.setItem("otteri-side-groups", "[]");
      } catch {}
    });
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const hash = () => decodeURIComponent(new URL(page.url()).hash);
    const sel = async (l) => (await label(l).first().getAttribute("aria-selected").catch(() => null)) === "true";
    await page.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").first().click();
    await page.waitForTimeout(4000);

    // ── A. เมนูข้าง ──
    const menuOrder = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="ถังขยะใบงาน"], [aria-label="ประวัติการนำเข้า"], [aria-label="สำรองข้อมูล"]')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => e.getAttribute("aria-label"))
    );
    menuOrder[0] === "ถังขยะใบงาน" && menuOrder[1] === "ประวัติการนำเข้า"
      ? pass("เมนูข้าง: \"ประวัติการนำเข้า\" อยู่ถัดจาก \"ถังขยะใบงาน\"") : fail(`ลำดับเมนู: ${JSON.stringify(menuOrder)}`);
    await label("ประวัติการนำเข้า").first().click();
    await page.waitForTimeout(3000);
    (await vis("ประวัติการนำเข้า").count()) > 0 && hash().startsWith("#/admin/imports") && (await sel("ชนิด ทั้งหมด"))
      ? pass(`เปิดจากเมนูข้าง → หน้าประวัติ (${hash()}) · ชิป "ทั้งหมด" ติด`) : fail(`เปิดหน้า: ${hash()} · ชิปทั้งหมด ${await sel("ชนิด ทั้งหมด")}`);
    const repairCount = sql(`select count(*) from "ImportRun" where kind='REPAIR_FORM' and "startedAt" > timezone('utc', now()) - interval '30 days'`);
    (await vis(`ใบแจ้งซ่อม (${repairCount})`).count()) > 0 ? pass(`ชิปใบแจ้งซ่อมบอกจำนวนรอบเท่าฐานข้อมูล (${repairCount})`) : fail(`ชิปใบแจ้งซ่อม: ไม่เจอ (${repairCount})`);
    await label("ชนิด ใบแจ้งซ่อม").first().click();
    await page.waitForTimeout(2500);
    (await sel("ชนิด ใบแจ้งซ่อม")) && !(await sel("ชนิด ทั้งหมด")) && /kind=repair/.test(hash()) && (await vis(OK).count()) && (await vis(STOP).count()) && (await vis(BAD).count())
      ? pass("กดชิปใบแจ้งซ่อม → ชิปติด (aria-selected) · ที่อยู่ kind=repair · เห็นสามรอบที่เตรียม") : fail(`ชิปใบแจ้งซ่อม: ${hash()}`);
    await label(`รอบนำเข้า ${OK} ครบ`).first().click();
    await page.waitForTimeout(2500);
    (await sel(`รอบนำเข้า ${OK} ครบ`)) && hash().includes(`run=${rOk}`) && (await vis(OK).count()) >= 2
      ? pass(`กดรอบที่ครบ → การ์ดติด · ที่อยู่ run=${rOk} · รายละเอียดขึ้นชื่อไฟล์`) : fail(`เลือกรอบ: ${hash()}`);
    const tileN = async (l) => (await label(`ดูเฉพาะ ${l}`).first().innerText().catch(() => "")).split("\n")[0].trim();
    const dbCount = (r) => sql(`select count(*) from "ImportRunRow" where "runId"=${rOk.slice(1)} and result='${r}'`);
    (await tileN("เปิดใบใหม่")) === dbCount("NEW") && (await tileN("นำเข้าไม่ได้")) === dbCount("ERROR") && dbCount("NEW") === "2"
      ? pass("ตัวเลขบนกล่อง = ฐานข้อมูล (เปิดใบใหม่ 2 · นำเข้าไม่ได้ 1)") : fail(`กล่อง: เปิด ${await tileN("เปิดใบใหม่")} · ไม่ได้ ${await tileN("นำเข้าไม่ได้")}`);
    const rowsShown = async () =>
      page.evaluate(() => [...document.querySelectorAll('[aria-label^="แถว "]')].filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("aria-label")));
    await label("ดูเฉพาะ เปิดใบใหม่").first().click();
    await page.waitForTimeout(2000);
    let rows = await rowsShown();
    (await sel("ดูเฉพาะ เปิดใบใหม่")) && rows.length === 2 && rows.every((r) => /เปิดใบใหม่/.test(r)) && (await vis(/^กรอง: เปิดใบใหม่/, false).count())
      ? pass("กดตัวเลข \"เปิดใบใหม่\" → กล่องติด เหลือ 2 แถวที่เปิด") : fail(`กรองแถว: ${JSON.stringify(rows)}`);
    await page.screenshot({ path: path.join(DIR, "import-history-1-filter.png") });
    await label("ดูเฉพาะ เปิดใบใหม่").first().click();
    await page.waitForTimeout(2000);
    rows = await rowsShown();
    rows.length === 3 && !(await sel("ดูเฉพาะ เปิดใบใหม่")) ? pass("กดซ้ำ → กลับมาทุกแถว (3)") : fail(`เลิกกรอง: ${JSON.stringify(rows)}`);
    const woCode = sql(`select ref from "ImportRunRow" where "runId"=${rOk.slice(1)} and line=2`);
    await label(`เปิดใบงาน ${woCode}`).first().click();
    await page.waitForTimeout(3500);
    hash() === `#/wo/${woCode}` && (await vis(woCode, false).count()) > 0
      ? pass(`กดรหัสใบงานในแถว → เปิดใบ ${woCode}`) : fail(`เปิดใบงานจากแถว: ${hash()}`);
    await page.goBack();
    await page.waitForTimeout(2500);
    hash().startsWith("#/admin/imports") ? pass("ย้อนกลับของเบราว์เซอร์ → กลับหน้าประวัติ") : fail(`ย้อนกลับ: ${hash()}`);
    // ดาวน์โหลด Excel — แอปเปิดลิงก์ไฟล์ในแท็บใหม่ (openUrl)
    await label(`รอบนำเข้า ${OK} ครบ`).first().click();
    await page.waitForTimeout(2000);
    // แท็บใหม่เป็นการดาวน์โหลด (Content-Disposition) ที่อยู่ของแท็บไม่เปลี่ยน — ดูคำขอไฟล์เอกสารของทั้งบริบทแทน
    const [, docReq] = await Promise.all([
      label("ดาวน์โหลดผลทีละแถว (Excel)").first().click(),
      ctx.waitForEvent("request", { predicate: (r) => /\/api\/documents\//.test(r.url()), timeout: 15000 }).catch(() => null),
    ]);
    const docRes = docReq ? await docReq.response().catch(() => null) : null;
    docReq && docRes && docRes.status() === 200 && /spreadsheetml/.test(docRes.headers()["content-type"] || "")
      ? pass("ดาวน์โหลดผลทีละแถว (Excel) → เปิดลิงก์ไฟล์ Excel (200)") : fail(`ดาวน์โหลด: ${docReq ? `${docRes?.status()} ${docRes?.headers()["content-type"]}` : "ไม่มีคำขอไฟล์"}`);
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => undefined);
    await label(`รอบนำเข้า ${STOP} หยุดกลางทาง`).first().click();
    await page.waitForTimeout(2500);
    (await vis("หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ").count()) > 0 && (await vis(/กดหยุดเองระหว่างนำเข้า/, false).count()) > 0 && (await label("สถานะรอบ หยุดกลางทาง").count()) > 0
      ? pass("รอบที่หยุด: แถบ \"หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ\" + เหตุผล (กดหยุดเอง)") : fail("แถบรอบที่หยุดไม่ขึ้น");
    await page.screenshot({ path: path.join(DIR, "import-history-2-stopped.png") });
    await label(`รอบนำเข้า ${BAD} ไม่สำเร็จ`).first().click();
    await page.waitForTimeout(2500);
    (await vis("นำเข้าไม่สำเร็จ — ไม่มีใบไหนเปิด").count()) > 0 && (await label("ดูเฉพาะ ตอนดูตัวอย่าง: จะเปิดใหม่").count()) > 0
      ? pass("รอบที่แอปหายก่อนเปิดได้สักใบ (เงียบเกิน 5 นาที): แถบแดง \"นำเข้าไม่สำเร็จ — ไม่มีใบไหนเปิด\" · กล่อง \"ตอนดูตัวอย่าง: จะเปิดใหม่\"") : fail("แถบรอบที่ไม่สำเร็จไม่ขึ้น");

    // ── B. ปุ่มข้างนำเข้าในหน้ารายการใบงาน · F5 ที่ลิงก์รอบ ──
    await label("ใบงานซ่อม").first().click();
    await page.waitForTimeout(3000);
    await label("ดูประวัติการนำเข้า ใบแจ้งซ่อม").first().click();
    await page.waitForTimeout(3000);
    hash().startsWith("#/admin/imports") && /kind=repair/.test(hash()) && (await sel("ชนิด ใบแจ้งซ่อม"))
      ? pass("ปุ่ม \"ประวัติการนำเข้า\" ข้างปุ่มนำเข้าในรายการใบงาน → หน้าประวัติกรองใบแจ้งซ่อมไว้ให้") : fail(`ปุ่มข้างนำเข้า: ${hash()}`);
    await page.goto(`${APP}/#/admin/imports?kind=repair&run=${rStop}`);
    await page.waitForTimeout(5000);
    (await sel(`รอบนำเข้า ${STOP} หยุดกลางทาง`)) && (await vis("หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ").count()) > 0
      ? pass(`เปิดลิงก์รอบ (#/admin/imports?kind=repair&run=${rStop}) → รอบเดิมติดและเปิดรายละเอียด`) : fail(`ลิงก์รอบ: ${hash()}`);

    // ── C. หยุดเองจากหน้าต่างนำเข้า แล้วดูในประวัติ ──
    const BIG = `ฟอร์มแจ้งซ่อม กดหยุด ${SUF}.xlsx`;
    const big = form("big.xlsx", Array.from({ length: 12 }, (_, i) => `กดหยุด ${i + 1}`));
    files.push(big);
    // ชุดยืนยันช้าลงพอให้กดหยุดทัน (เครื่องทดสอบเร็วกว่าของจริงมาก)
    await page.route("**/api/work-orders/import-form", async (route) => {
      const body = (route.request().postDataBuffer() || Buffer.alloc(0)).toString("latin1");
      if (/name="apply"/.test(body)) await new Promise((r) => setTimeout(r, 2500));
      return route.continue();
    });
    await label("ใบงานซ่อม").first().click();
    await page.waitForTimeout(2500);
    await label("นำเข้าใบแจ้งซ่อมจากไฟล์").first().click();
    await page.waitForTimeout(1500);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), label("เลือกไฟล์ฟอร์มแจ้งซ่อม").first().click()]);
    // ชื่อไฟล์ที่อัปโหลด = ชื่อที่แอดมินเห็นในประวัติ — ส่งเป็นก้อนข้อมูลพร้อมชื่อไทย (setFiles ด้วยทางไฟล์ที่ชื่อไทย
    // เบราว์เซอร์ทดสอบเงียบ ไม่มี change event — เทสต์พังเองทั้งที่แอปไม่ผิด · ชื่อไทยจากเบราว์เซอร์จริงผ่าน API ทดสอบใน import-history-test.sh)
    await chooser.setFiles({ name: BIG, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(big) });
    await page.waitForFunction(() => /เปิดใบงาน 12 ใบ/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => undefined);
    await label("ยืนยันนำเข้าใบแจ้งซ่อม").first().click();
    await label("หยุดหลังชุดนี้").first().waitFor({ timeout: 15000 }).catch(() => undefined);
    (await label("หยุดหลังชุดนี้").count()) > 0 ? pass("หน้าโหลดตอนยืนยันมีปุ่ม \"หยุดหลังชุดนี้\"") : fail("ไม่มีปุ่มหยุดบนหน้าโหลด");
    await label("หยุดหลังชุดนี้").first().click().catch(() => undefined);
    await vis("หยุดนำเข้ากลางทาง").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    const stopText = await page.locator("body").innerText();
    /เปิดใบงานไปแล้ว 10 จาก 12 ใบ แล้วหยุดตามที่กด — อีก 2 แถวยังไม่ได้เปิด/.test(stopText)
      ? pass("กดหยุด → ชุดแรก (10 แถว) จบแล้วหยุด · กล่องบอก \"เปิดใบงานไปแล้ว 10 จาก 12 ใบ แล้วหยุดตามที่กด — อีก 2 แถวยังไม่ได้เปิด\"")
      : fail(`กล่องหยุด: ${(stopText.match(/เปิดใบงานไปแล้ว[^\n]*/) || ["(ไม่เจอ)"])[0]}`);
    await page.waitForTimeout(1500);
    const bigRun = sql(`select id||'|'||status||'|'||coalesce(error,'') from "ImportRun" where id > ${IH0} and "fileName"='${BIG}'`);
    const bigRows = sql(`select count(*) filter (where r.result='NEW')||'|'||count(*) filter (where r.result='PENDING') from "ImportRunRow" r join "ImportRun" u on u.id=r."runId" where u.id > ${IH0} and u."fileName"='${BIG}'`);
    /^\d+\|STOPPED\|กดหยุดเองระหว่างนำเข้า$/.test(bigRun) && bigRows === "10|2" && sql(`select count(*) from "WorkOrder" where symptom like '${PRE} กดหยุด%'`) === "10"
      ? pass("ฐานข้อมูล: รอบ STOPPED (กดหยุดเอง) · เปิดแล้ว 10 · ยังไม่ได้เปิด 2 · ใบงาน 10 ใบ") : fail(`ฐานข้อมูลรอบที่กดหยุด: ${bigRun} · ${bigRows}`);
    await page.screenshot({ path: path.join(DIR, "import-history-3-stop-dialog.png") });
    await vis("ดูในประวัติการนำเข้า").last().click();
    await page.waitForTimeout(3500);
    const bigId = bigRun.split("|")[0];
    hash().includes(`run=r${bigId}`) && (await vis("หยุดกลางทาง — เปิดไปแล้ว 10 จาก 12 ใบ").count()) > 0
      ? pass("\"ดูในประวัติการนำเข้า\" ในกล่องหยุด → เปิดรอบนั้นในประวัติ (หยุดกลางทาง — เปิดไปแล้ว 10 จาก 12 ใบ)") : fail(`ดูในประวัติจากกล่องหยุด: ${hash()}`);
    await page.unroute("**/api/work-orders/import-form");

    // ── D. มือถือ + โหมดมืด ──
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await phone.newPage();
    m.on("pageerror", (e) => errors.push(String(e)));
    await m.addInitScript(() => {
      try {
        localStorage.setItem("otteri-howto-auto", "off");
        localStorage.setItem("otteri-theme", "dark");
      } catch {}
    });
    await m.goto(`${APP}/`, { waitUntil: "networkidle", timeout: 180000 });
    await m.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await m.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await m.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").first().click();
    await m.waitForTimeout(4000);
    await m.goto(`${APP}/#/admin/imports?kind=repair`);
    await m.waitForTimeout(5000);
    const card = m.locator(`[aria-label="รอบนำเข้า ${STOP} หยุดกลางทาง"]`).locator("visible=true").first();
    const yList = (await card.boundingBox())?.y ?? -1;
    await card.tap();
    await m.waitForTimeout(3000);
    const banner = m.getByText("หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ", { exact: true }).locator("visible=true").first();
    const bb = await banner.boundingBox();
    const wide = await m.evaluate(() => document.documentElement.scrollWidth);
    bb && bb.y >= 0 && bb.y < 844 && wide <= 391
      ? pass(`มือถือ 390: กดรอบแล้วเลื่อนลงไปที่รายละเอียด (แถบอยู่ในจอ y=${Math.round(bb.y)}) · ไม่มีเลื่อนซ้ายขวา (กว้าง ${wide})`)
      : fail(`มือถือ: การ์ด y=${yList} · แถบ ${JSON.stringify(bb)} · กว้าง ${wide}`);
    const detailBelow = await m.evaluate((file) => {
      const cards = [...document.querySelectorAll('[aria-label^="รอบนำเข้า "]')];
      const last = cards[cards.length - 1]?.getBoundingClientRect();
      const title = [...document.querySelectorAll("div")].find((d) => d.textContent === file && d.getBoundingClientRect().height > 20 && !d.closest('[aria-label^="รอบนำเข้า "]'));
      return last && title ? title.getBoundingClientRect().top > last.bottom : null;
    }, STOP);
    detailBelow ? pass("มือถือ: รายละเอียดอยู่ใต้รายการรอบ") : fail(`มือถือ: ตำแหน่งรายละเอียด ${detailBelow}`);
    const darkBg = await m.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => d.textContent?.startsWith("หยุดกลางทาง — เปิดไปแล้ว 1 จาก 3 ใบ") && d.children.length > 0);
      let p = el;
      for (let i = 0; p && i < 12; i++, p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor;
        if (getComputedStyle(p).borderTopLeftRadius === "16px" && bg !== "rgba(0, 0, 0, 0)") return bg;
      }
      return null;
    });
    darkBg === "rgb(20, 32, 45)" ? pass("โหมดมืด: การ์ดรายละเอียดใช้สีการ์ดของโหมดมืด (ไม่ใช่พื้นขาวตายตัว)") : fail(`โหมดมืด: พื้นการ์ด ${darkBg}`);
    await m.screenshot({ path: path.join(DIR, "import-history-4-phone-dark.png"), fullPage: false });
    await phone.close();
    errors.length ? fail(`page error: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
  } finally {
    await browser.close();
    try {
      if (A) await purgeOrders(A, sql(`select id from "WorkOrder" where symptom like '${PRE}%'`).split("\n").filter(Boolean));
      sql(`delete from "ImportRun" where id > ${IH0}`);
    } catch (e) {
      console.log(`เก็บกวาดไม่สำเร็จ: ${e.message}`);
    }
    for (const f of [...files, tmp("spec.json")]) fs.rmSync(f, { force: true, recursive: true });
  }
})();
