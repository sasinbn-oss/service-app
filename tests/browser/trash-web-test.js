// ทดสอบหน้าจอ: ถังขยะใบงาน (เจ้าของงานตัดสิน 4 พ.ย. 69 — ตัวอย่างที่ตกลง) · จอคอม
//   A. หน้าใบงาน: เลือก "อื่น ๆ" ต้องพิมพ์เหตุผลก่อน (ปุ่ม "พิมพ์เหตุผลก่อน") · ย้ายแล้วแถบ "…กู้คืนได้ถึง …" พร้อม "เลิกทำ"
//      → กดเลิกทำ: ฐานข้อมูลกลับมาไม่อยู่ในถัง ขั้นเดิม ประวัติ "ย้ายไปถังขยะ" แล้ว "กู้คืนจากถังขยะ"
//   B. หน้าถังขยะ (แอดมิน): เมนูข้าง "ถังขยะใบงาน" มีตัวเลขเท่าฐานข้อมูล · ค้นเลขใบงาน · แถวบอกขั้นก่อนลบ เหตุผล เหลือ 30 วัน
//      · ใบที่ลบมา 25 วัน = "เหลือ 5 วัน" สีแดง · แอดมินไม่มีปุ่ม "ลบถาวรตอนนี้" · กด "กู้คืน" → ฐานข้อมูลกลับมา + แถบบอกขั้นเดิม
//   D. ที่อยู่ของหน้าถังขยะ (#/admin/trash?q=…): ค้นแล้วที่อยู่ตามคำค้น · F5 ได้หน้าเดิมพร้อมคำค้นและแถวเดิม · วางลิงก์ในแท็บใหม่ได้หน้าเดิม
//      · ลิงก์ใบงานที่อยู่ในถังขยะ (#/wo/WO-…): แอดมินเห็น "… อยู่ในถังขยะ" + ใครลบ/เหตุผล + ปุ่ม "เปิดถังขยะใบงาน" → ไปหน้าถังขยะ
//        ที่ค้นรหัสนั้นไว้แล้ว · ช่าง (T001) เห็น "ไม่พบใบงาน …" เหมือนรหัสที่ไม่มี ไม่มีคำว่าถังขยะ (เซิร์ฟเวอร์ไม่บอก)
//   C. Super Admin: มีปุ่ม "ลบถาวรตอนนี้" → กล่องยืนยันบอกว่ากู้คืนไม่ได้ → ลบแล้วแถวหายจากฐานข้อมูลจริง
// สร้าง Super Admin ชั่วคราวเอง (ลบใน finally) · ใบงานของเทสต์ล้างด้วย purgeOrders · ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const { purgeOrders } = require("./purge");
const DIR = __dirname;
const API = "http://127.0.0.1:4000/api";
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, p, body) => {
  const r = await fetch(API + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const login = async (c) => (await call(null, "POST", "/auth/login", { employeeCode: c, password: "test1234" })).data.token;
const SUF = String(Math.floor(Math.random() * 1e5));
const SA = `ZTW${SUF}`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const ids = [];
  let A = null;
  // เครื่อง W81–W84 ที่ C0001 — เปิดใบด้วยรหัสที่ไม่มีอยู่ = สร้างเครื่องใหม่ ซึ่งไม่หายไปกับใบ (รุ่นแรกทิ้งไว้ 4 เครื่องทุกรอบ)
  // จำว่าเครื่องไหนมีอยู่ก่อน แล้วตอนจบลบเฉพาะที่ชุดนี้สร้าง (ฐานอื่นอาจมีเครื่องรหัสนี้จริง — ไม่แตะ)
  const MACHINES = ["W81", "W82", "W83", "W84"];
  let hadMachines = null;
  try {
    A = await login("A001");
    hadMachines = sql(`select coalesce(string_agg(m.code, ','), '') from "Machine" m join "Branch" b on b.id=m."branchId"
                       where b.code='C0001' and m.code in (${MACHINES.map((c) => `'${c}'`).join(",")})`).split(",").filter(Boolean);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
         select '${SA}','ซุปเปอร์ทดสอบถังขยะ','SUPER_ADMIN',"passwordHash",false from "User" where "employeeCode"='A001'`);
    const open = async (n) => {
      const r = await call(A, "POST", "/work-orders", {
        branchCode: "C0001", jobType: "CM", priority: "NORMAL", contactName: "คุณทดสอบ", contactPhone: "081-234-5678",
        machines: [{ code: `W8${n}`, model: "Oasis", symptom: `ทดสอบถังขยะ ${SUF}-${n}` }],
      });
      const o = r.data.orders ? r.data.orders[0] : r.data;
      ids.push(o.id);
      return { id: o.id, code: sql(`select code from "WorkOrder" where id=${o.id}`) };
    };
    const [o1, o2, o3, o4] = [await open(1), await open(2), await open(3), await open(4)];
    const st = (o) => sql(`select status||'|'||("deletedAt" is null)::text from "WorkOrder" where id=${o.id}`);
    const before1 = st(o1);

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    // ผู้ใช้ที่เทสต์นี้สร้างเองยังไม่เคยตอบกล่องสอนการใช้งาน — ปิดกล่องที่ขึ้นเอง ไม่งั้นพื้นมืดบังทุกปุ่ม (tests/README)
    await page.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เมนูถังขยะอยู่กลุ่มผู้ดูแลระบบ จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => { try { localStorage.setItem("otteri-side-groups", "[]"); } catch {} });
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
    const signIn = async (code) => {
      await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").first().click();
      await page.waitForTimeout(4000);
    };
    const openTrash = async (q) => {
      await label("ถังขยะใบงาน").first().click();
      await page.waitForTimeout(2500);
      const box = page.getByPlaceholder("ค้นเลขใบงาน รหัส/ชื่อสาขา หรือคนที่ลบ").locator("visible=true").first();
      await box.fill(q);
      await page.waitForTimeout(2000);
    };

    // ── A. ลบจากหน้าใบงาน + เลิกทำ ──
    await signIn("A001");
    await vis("ใบงานซ่อม").first().click();
    await page.waitForTimeout(2500);
    const s = page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
    await s.click(); await s.type(o1.code, { delay: 50 }); await page.waitForTimeout(2500);
    await vis(o1.code, false).first().click();
    await page.waitForTimeout(3500);
    await label("ลบใบงานนี้ (ย้ายไปถังขยะ)").first().click();
    await page.waitForTimeout(1000);
    await label("เหตุผลที่ลบ อื่น ๆ").last().click();
    await page.waitForTimeout(400);
    (await label("เหตุผลที่ลบ อื่น ๆ").last().getAttribute("aria-pressed")) === "true" && (await vis("พิมพ์เหตุผลก่อน").count()) > 0
      ? pass("เลือก \"อื่น ๆ\" (aria-pressed) แล้วปุ่มยังเป็น \"พิมพ์เหตุผลก่อน\"") : fail("อื่น ๆ ไม่บังคับพิมพ์เหตุผล");
    await label("เหตุผลอื่น").last().fill("ทดสอบเลิกทำ");
    await page.waitForTimeout(300);
    await vis("ย้ายไปถังขยะ").last().click();
    await page.waitForTimeout(3500);
    sql(`select coalesce("deleteReason",'-')||'|'||coalesce("deleteNote",'-') from "WorkOrder" where id=${o1.id}`) === "OTHER|ทดสอบเลิกทำ"
      ? pass("ย้ายไปถังขยะด้วย \"อื่น ๆ\" + ข้อความที่พิมพ์ (ฐานข้อมูล)") : fail(`ฐานข้อมูล: ${st(o1)}`);
    (await vis(`ย้าย ${o1.code} ไปถังขยะแล้ว · กู้คืนได้ถึง`, false).count()) > 0 ? pass("แถบแจ้งเตือน \"…กู้คืนได้ถึง …\"") : fail("ไม่มีแถบแจ้งเตือน");
    // ตัวเช็ครุ่นที่ยิงตอนกล่องยืนยันปิดได้ 404 ของใบที่ตัวเองเพิ่งลบ — รุ่นแรกขึ้นแถบที่สอง "…ถูกย้ายไปถังขยะแล้ว…" แล้ว goBack ซ้ำ
    // พาแอดมินหลุดจากรายการใบงานไป "งานของฉันวันนี้" (เจอตอนตรวจด้วยมือ 4 พ.ย. 69)
    const hashNow = decodeURIComponent(new URL(page.url()).hash);
    (await vis(`${o1.code} ถูกย้ายไปถังขยะแล้ว`, false).count()) === 0 && hashNow.startsWith("#/work-orders")
      ? pass("ลบเองแล้วไม่มีแถบซ้ำ \"ถูกย้ายไปถังขยะแล้ว\" · กลับมาที่รายการใบงาน (ไม่ถอยเกิน)") : fail(`หลังลบเอง: ที่อยู่ ${hashNow} · แถบซ้ำ ${await vis(`${o1.code} ถูกย้ายไปถังขยะแล้ว`, false).count()}`);
    await page.screenshot({ path: path.join(DIR, "trash-1-toast.png") });
    await label("เลิกทำ").first().click();
    await page.waitForTimeout(3500);
    st(o1) === before1 ? pass(`เลิกทำ → ใบกลับมา ขั้นเดิม (${before1.split("|")[0]}) (ฐานข้อมูล)`) : fail(`หลังเลิกทำ: ${st(o1)} (ก่อน ${before1})`);
    sql(`select string_agg(action, ',' order by id) from (select action, id from "WorkOrderLog" where "workOrderId"=${o1.id} order by id desc limit 2) x`) === "TRASHED,RESTORED"
      ? pass("ประวัติ: ย้ายไปถังขยะ แล้ว กู้คืนจากถังขยะ") : fail("ประวัติไม่มีสองแถว");
    (await vis(`กู้คืน ${o1.code} แล้ว`, false).count()) > 0 ? pass("แถบแจ้งเตือนบอกว่ากู้คืนแล้ว") : fail("ไม่มีแถบกู้คืน");

    // ── B. หน้าถังขยะ (แอดมิน) ──
    const del = (o, reason) => call(A, "DELETE", `/work-orders/${o.id}`, { reason });
    await del(o2, "TEST");
    await del(o3, "WRONG");
    await del(o4, "DUPLICATE");
    // ลบมาแล้ว 25 วัน — เหลือ 5 วัน (≤ 7 = แดง) · เวลา UTC แบบที่ Prisma เขียน
    sql(`update "WorkOrder" set "deletedAt" = timezone('utc', now()) - interval '25 days' where id=${o4.id}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    const total = sql(`select count(*) from "WorkOrder" where "deletedAt" is not null`);
    (await label(`ถังขยะ ${total} ใบ`).count()) > 0 ? pass(`เมนูข้าง "ถังขยะใบงาน" บอก ${total} ใบ เท่าฐานข้อมูล`) : fail(`ตัวเลขข้างเมนูไม่ตรง ${total}`);
    await openTrash(o2.code);
    const row2 = label(`แถวถังขยะ ${o2.code}`);
    const t2 = (await row2.count()) ? await row2.first().innerText() : "";
    t2.includes("ก่อนลบอยู่ขั้น:") && t2.includes("ใบทดสอบ / ลองระบบ") && t2.includes("เหลือ 30 วัน") && t2.includes("C0001")
      ? pass("แถว: สาขา · ก่อนลบอยู่ขั้น · เหตุผล · เหลือ 30 วัน") : fail(`แถว: ${t2.slice(0, 200)}`);
    (await vis("ลบถาวรตอนนี้").count()) === 0 ? pass("แอดมินทั่วไปไม่มีปุ่ม \"ลบถาวรตอนนี้\"") : fail("แอดมินเห็นปุ่มลบถาวร");
    (await label(`แถวถังขยะ ${o3.code}`).count()) === 0 ? pass("ค้นเลขใบงานแล้วเหลือเฉพาะใบนั้น") : fail("ค้นแล้วยังเห็นใบอื่น");
    await page.screenshot({ path: path.join(DIR, "trash-2-page.png") });

    await openTrash(o4.code);
    const left = vis("เหลือ 5 วัน");
    const red = (await left.count()) ? await left.first().evaluate((el) => getComputedStyle(el).color) : "";
    red === "rgb(185, 28, 28)" ? pass("ลบมา 25 วัน: \"เหลือ 5 วัน\" สีแดง") : fail(`เหลือ 5 วัน: สี ${red || "ไม่เจอ"}`);

    await openTrash(o2.code);
    await label(`กู้คืน ${o2.code}`).first().click();
    await page.waitForTimeout(3500);
    sql(`select ("deletedAt" is null)::text||'|'||(select action from "WorkOrderLog" where "workOrderId"=${o2.id} order by id desc limit 1) from "WorkOrder" where id=${o2.id}`) === "true|RESTORED"
      ? pass("กด \"กู้คืน\" → ใบกลับมา + ประวัติกู้คืน (ฐานข้อมูล)") : fail(`หลังกู้คืน: ${st(o2)}`);
    (await vis("กลับไปขั้น", false).count()) > 0 ? pass("แถบแจ้งเตือนบอกว่ากลับไปขั้นเดิม") : fail("แถบไม่บอกขั้น");
    (await label(`แถวถังขยะ ${o2.code}`).count()) === 0 ? pass("ใบที่กู้แล้วหายจากหน้าถังขยะ") : fail("ใบที่กู้แล้วยังอยู่ในถัง");

    // ── D. ที่อยู่ของหน้าถังขยะ + ลิงก์ใบงานที่อยู่ในถัง ──
    const hash = (pg) => decodeURIComponent(new URL(pg.url()).hash);
    const until = async (pg, fn, ms = 20000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await fn().catch(() => false)) return true;
        await pg.waitForTimeout(250);
      }
      return false;
    };
    const searchBox = (pg) => pg.getByPlaceholder("ค้นเลขใบงาน รหัส/ชื่อสาขา หรือคนที่ลบ").locator("visible=true").first();
    const rowOf = (pg, code) => pg.locator(`[aria-label="แถวถังขยะ ${code}"]`).locator("visible=true");
    await openTrash(o4.code);
    (await until(page, async () => hash(page) === `#/admin/trash?q=${o4.code}`))
      ? pass(`ค้นในถังขยะแล้วที่อยู่ตามคำค้น (${hash(page)})`) : fail(`ที่อยู่หน้าถังขยะ: ${hash(page)}`);
    await page.reload({ waitUntil: "networkidle" });
    (await until(page, async () => (await rowOf(page, o4.code).count()) > 0 && (await searchBox(page).inputValue()) === o4.code && (await rowOf(page, o3.code).count()) === 0))
      ? pass("F5 ที่หน้าถังขยะ → หน้าเดิม คำค้นเดิม แถวเดิม") : fail(`F5: ${hash(page)} · ช่องค้น "${await searchBox(page).inputValue().catch(() => "?")}"`);
    const pasted = await ctx.newPage();
    await pasted.goto(`http://127.0.0.1:8081/#/admin/trash?q=${o3.code}`, { waitUntil: "networkidle", timeout: 180000 });
    (await until(pasted, async () => (await rowOf(pasted, o3.code).count()) > 0 && (await rowOf(pasted, o4.code).count()) === 0))
      ? pass("วางลิงก์ #/admin/trash?q=… ในแท็บใหม่ → หน้าถังขยะค้นใบนั้นไว้") : fail(`วางลิงก์: ${hash(pasted)}`);
    await pasted.screenshot({ path: path.join(DIR, "trash-4-pasted.png") });
    // ลิงก์ใบงานที่อยู่ในถัง (ลิงก์เก่าในกลุ่มไลน์) — แอดมิน
    await pasted.goto(`http://127.0.0.1:8081/?t=${Date.now()}#/wo/${o4.code}`, { waitUntil: "networkidle", timeout: 180000 });
    const note = (pg) => pg.getByText(`${o4.code} อยู่ในถังขยะ`, { exact: true }).locator("visible=true");
    (await until(pasted, async () => (await note(pasted).count()) > 0 && (await pasted.getByText("เหตุผล: เปิดซ้ำ", { exact: false }).locator("visible=true").count()) > 0))
      ? pass("แอดมินเปิดลิงก์ใบในถังขยะ → \"… อยู่ในถังขยะ\" + เหตุผล") : fail("แอดมิน: ไม่ขึ้นว่าอยู่ในถังขยะ");
    await pasted.screenshot({ path: path.join(DIR, "trash-5-link-admin.png") });
    await pasted.getByText("เปิดถังขยะใบงาน", { exact: true }).locator("visible=true").first().click();
    (await until(pasted, async () => hash(pasted) === `#/admin/trash?q=${o4.code}` && (await rowOf(pasted, o4.code).count()) > 0))
      ? pass("กด \"เปิดถังขยะใบงาน\" → หน้าถังขยะค้นรหัสนี้ไว้ (ที่อยู่ + แถว)") : fail(`ปุ่มไปถังขยะ: ${hash(pasted)}`);
    await pasted.close();
    // ช่าง — ไม่รู้ว่าใบเคยมี
    const tctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await tctx.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    const tp = await tctx.newPage();
    await tp.goto(`http://127.0.0.1:8081/#/wo/${o4.code}`, { waitUntil: "networkidle", timeout: 180000 });
    await tp.getByPlaceholder("รหัสพนักงาน").fill("T001");
    await tp.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tp.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").first().click();
    (await until(tp, async () => (await tp.getByText(`ไม่พบใบงาน ${o4.code}`, { exact: true }).locator("visible=true").count()) > 0))
      && (await tp.getByText("ถังขยะ", { exact: false }).locator("visible=true").count()) === 0
      ? pass("ช่างเปิดลิงก์ใบในถังขยะ → \"ไม่พบใบงาน …\" เหมือนรหัสที่ไม่มี ไม่มีคำว่าถังขยะ") : fail(`ช่าง: ${hash(tp)}`);
    await tp.screenshot({ path: path.join(DIR, "trash-6-link-tech.png") });
    await tctx.close();

    // ── C. Super Admin ลบถาวรตอนนี้ ──
    await page.evaluate(() => localStorage.clear());
    await ctx.clearCookies();
    await page.addInitScript(() => { try { localStorage.setItem("otteri-howto-auto", "off"); } catch {} });
    await signIn(SA);
    await openTrash(o3.code);
    (await label(`ลบถาวรตอนนี้ ${o3.code}`).count()) > 0 ? pass("Super Admin เห็นปุ่ม \"ลบถาวรตอนนี้\"") : fail("Super Admin ไม่เห็นปุ่มลบถาวร");
    await label(`ลบถาวรตอนนี้ ${o3.code}`).first().click();
    await page.waitForTimeout(800);
    (await vis("กู้คืนไม่ได้อีก", false).count()) > 0 ? pass("กล่องยืนยันบอกว่ากู้คืนไม่ได้") : fail("กล่องยืนยันไม่เตือน");
    await page.screenshot({ path: path.join(DIR, "trash-3-purge.png") });
    await vis("ลบถาวร").last().click();
    await page.waitForTimeout(3500);
    sql(`select count(*) from "WorkOrder" where id=${o3.id}`) === "0" ? pass("ลบถาวรแล้วแถวหายจากฐานข้อมูลจริง") : fail("ลบถาวรแล้วแถวยังอยู่");
    await ctx.close();
  } catch (e) {
    fail(String(e).split("\n")[0].slice(0, 300));
  } finally {
    if (A) await purgeOrders(A, ids);
    const made = hadMachines ? MACHINES.filter((c) => !hadMachines.includes(c)) : [];
    if (made.length)
      sql(`delete from "Machine" m using "Branch" b where b.id=m."branchId" and b.code='C0001' and m.code in (${made.map((c) => `'${c}'`).join(",")})
           and not exists (select 1 from "WorkOrder" w where w."machineId"=m.id)`);
    sql(`delete from "UsageSlot" where "userId" in (select id from "User" where "employeeCode"='${SA}');
         delete from "User" where "employeeCode"='${SA}'`);
    await browser.close();
  }
})();
