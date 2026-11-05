// ทดสอบ: สอนการใช้งาน — ทุกขั้นของทุกเรื่องหาปุ่มจริงเจอ (เจ้าของงานเลือก ข้อ 10 "เทสต์อัตโนมัติเช็คว่าทุกขั้นหาปุ่มเจอ")
//
// เดินทุกเรื่องของทุกบทบาท บนมือถือ 390×844 (จอสัมผัส) และจอคอม 1366×900: เปิดหน้าของเรื่องนั้น (ฟอร์มเปิดด้วยปุ่มจริง:
// "ปิดงาน" บนการ์ด · "ระบุอะไหล่" ในหน้าใบงาน · "เพิ่มใบงาน") กด ? ของหน้า/หน้าต่าง/ฟอร์ม แล้วกด "ถัดไป" จนขั้นสุดท้าย
// อ่านผลจากชั้นของกล่อง (data-howto-step / -target / -skipped) — ทุกขั้นต้อง found และไม่มีขั้นที่ข้าม ยกเว้นที่ระบุไว้ในเทสต์นี้:
//   · ขั้นที่ไม่มีเป้า (กล่องกลางจอโดยตั้งใจ): หัวหน้าภาค/แอดมิน "งานของฉันวันนี้" ขั้น 1
//   · ขั้น C ที่ข้อมูลชุดนี้ไม่มีของให้ชี้โดยตั้งใจ: หัวหน้าภาค "ใบงานซ่อม" ขั้น 2 (แท็บย่อยมีเฉพาะกล่องงาน — เปิดจากเมนูใบงานซ่อม)
//     · หัวหน้าภาค "งานของฉันวันนี้" ขั้น 7 (แถบเวลาปิดนัดขึ้นเฉพาะ 3 ชม. ก่อนปิด — found หรือ center ก็ได้)
//   · ช่าง "ปิดงาน" ขั้น 6 (แถบสี่ขั้น) ข้ามเองบนใบที่ไม่ใช่ฟอร์มทีละขั้น · ใบสาขาในประกัน (ฟอร์มทีละขั้น) ต้อง found
// เริ่มจากหน้าสอนการใช้งาน (คำสั่งเปิดของให้): ช่าง "ปิดงาน" (myday.openClose) · หัวหน้าภาค "ระบุอะไหล่" (queue.openParts →
// order.openStage) · "เปิดใบงานใหม่" (หน้าต่างเปล่า) — ขั้น 1 ต้อง found · ระหว่างนั้นไม่มีคำขอเขียนข้อมูลใด ๆ (นอกจากจดว่าดูแล้ว)
// · ฟอร์มปิดงานไม่เขียนร่าง (localStorage draft:close:*) · ใบงานในฐานข้อมูลไม่เปลี่ยน (สถานะ · ประวัติ) · ใบค้างเปิดหลังจบ
// · ช่างที่ไม่มีงานถึงหน้างาน: ปิดงานจากหน้าสอนการใช้งาน = กล่องกลางจอทุกขั้น (ข้ามแถบสี่ขั้น) → เข้าใจแล้ว จดที่บัญชี
// Senior ช่างดูแลสองทีม ใบปล่อยงานทีมละใบ: "ใบงานซ่อม" ขั้น 5 กรอบล้อมหัวคอลัมน์ "ทีม" บนคอม · บรรทัดชื่อทีมในการ์ดบนมือถือ
// พิมพ์ชื่อเรื่อง + ขั้น + ชื่อขั้นของทุกขั้นที่ไม่ found
//
// เตรียมเอง (ลบทั้งหมดตอนจบ): ผู้ใช้ zzha.* (ดูแล้วทุกคน — ไม่มีกล่องขึ้นเอง และปิดด้วย otteri-howto-auto ด้วย)
// · สาขาชั่วคราว CZHB… (ทีมที่สองของ Senior) · DZHA… (แฟรนไชส์ในประกัน — ใบเคลมเปิดฟอร์มทีละขั้น)
// · ใบงาน: ทีม C0006 ถึงหน้างานแล้ว / ยังไม่ถึง (วันนี้) · ทีมที่สอง (วันนี้) · ใบเคลมสาขาในประกัน ถึงหน้างานแล้ว
//   · ใบรอหัวหน้าภาคระบุอะไหล่ (ไม่มีรายการที่ช่างเลือก) · ใบรอแอดมินเช็คอะไหล่
// วันนี้ปิดนัดเสมอ: ใบไม่ใช้อะไหล่ = แอดมินแก้เป็นงานด่วนให้วันนี้ก่อน (field-flow) · ใบใช้อะไหล่ = นัด 12 วันหน้าแล้วย้ายเป็นวันนี้ด้วย SQL
// (claim-close-steps) · A001/S001 กด Esc จบทุกเรื่อง ฐานข้อมูลของสองคนนี้ไม่ถูกจด · Super Admin สร้างท้ายสุด
// ต้องมี DATABASE_URL · เทสต์นี้ยาว (เดินราว 30 เรื่อง) · ไฟล์ *.howto.ts ใหม่ = รีสตาร์ท Expo ก่อนรัน (tests/README)
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");

const APP = "http://localhost:8081";
const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1366, height: 900 };

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const SUF = String(Date.now()).slice(-5);
  const B2 = `CZHB${SUF}`; // ทีมที่สองของ Senior (รหัสขึ้นต้น C = สาขาบริษัท ไม่มีประกัน)
  const BK = `DZHA${SUF}`; // แฟรนไชส์เปิด 12 เดือน (Oasis ประกัน 2 ปี) — ฟอร์มปิดงานแบบทีละขั้น
  const T2 = `ทีมวิธีใช้ข${SUF}`;
  const users = `select id from "User" where "employeeCode" like 'zzha.%'`;
  const branches = `select id from "Branch" where code in ('${B2}','${BK}')`;
  let fx = null;

  async function cleanup() {
    if (fx) await fx.cleanup().catch(() => {});
    fx?.sql(`delete from "BranchCheckIn" where "userId" in (${users});
             delete from "UsageSlot" where "userId" in (${users});
             delete from "ViewAsLog" where "targetUserId" in (${users}) or "byUserId" in (${users});
             delete from "User" where id in (${users});
             delete from "Machine" where "branchId" in (${branches});
             delete from "Branch" where id in (${branches})`);
  }

  // ── หน้าเว็บ: ล็อกอินครั้งเดียวต่อคนต่อขนาดจอ · ก่อนแต่ละเรื่องโหลดแอปใหม่ (กล่อง/แถบข้อความ/หน้าต่างของเรื่องก่อนไม่ค้าง) ──
  async function open(code, size) {
    const touch = size.width < 640;
    const ctx = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    // กางทุกกลุ่มเมนูไว้ก่อน (เมนูที่ต้องกดหาอยู่หลายกลุ่ม) · ปิดกล่องที่ขึ้นเอง (ผู้ใช้ชั่วคราวดูแล้วอยู่แล้ว — กันไว้อีกชั้น)
    await page.addInitScript(() => {
      try {
        localStorage.setItem("otteri-side-groups", "[]");
        localStorage.setItem("otteri-howto-auto", "off");
      } catch {}
    });
    page.on("pageerror", (e) => errors.push(`${code} ${size.width}: ${e}`));
    const writes = [];
    // คำขอเขียนข้อมูลทุกคำขอ (ยกเว้นจดว่าดูวิธีใช้แล้ว) — ช่วงที่วิธีใช้เปิดของให้ต้องไม่มีเลย
    page.on("request", (r) => {
      if (r.method() !== "GET" && r.url().includes("/api/") && !/\/api\/auth\/(howto|login)$/.test(r.url())) writes.push(`${r.method()} ${r.url().replace(/^.*\/api/, "")}`);
    });
    await page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill(code);
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
    await page.waitForTimeout(4500);
    return { ctx, page, writes, code, size };
  }
  /** โหลดแอปใหม่ที่หน้าแรก (ยังล็อกอินอยู่ — โทเคนอยู่ในเครื่อง) */
  async function fresh(s) {
    await s.page.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
    if (await s.page.getByPlaceholder("รหัสพนักงาน").locator("visible=true").count()) {
      await s.page.getByPlaceholder("รหัสพนักงาน").fill(s.code);
      await s.page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await s.page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").last().click();
    }
    await s.page.waitForTimeout(3500);
  }
  const vis = (p, sel) => p.locator(sel).locator("visible=true");
  /** ไปหน้าจากเมนูข้าง (testID howto-menu.<key>) — จอแคบเปิดลิ้นชักก่อน */
  async function openItem(p, key) {
    const item = vis(p, `[data-testid="howto-menu.${key}"]`);
    if (!(await item.count())) {
      await vis(p, '[aria-label="เปิดเมนู"]').first().click();
      await p.waitForTimeout(900);
    }
    await item.first().click();
    await p.waitForTimeout(2500);
  }
  /** กดปุ่ม ? — แถบหัว (app.help · แอดมินจอแคบอยู่ในเมนูข้าง menu.help) หรือของหน้าต่าง/ฟอร์ม (order.help · close.help …) */
  async function pressHelp(p, id = "app.help") {
    const btn = vis(p, `[data-testid="howto-${id}"]`);
    if (id === "app.help" && !(await btn.count())) {
      await vis(p, '[aria-label="เปิดเมนู"]').first().click();
      await p.waitForTimeout(900);
      await vis(p, '[data-testid="howto-menu.help"]').first().click();
      return;
    }
    const ok = await btn.first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (!ok) throw new Error(`ไม่เจอปุ่ม ? (${id})`);
    await btn.first().click();
  }
  /** เริ่มเรื่องจากหน้า "สอนการใช้งาน" (เมนู › เอกสารและบัญชี) */
  async function fromHub(p, title) {
    await openItem(p, "howto");
    const row = vis(p, `[aria-label="เริ่มดู ${title}"], [aria-label="ดูอีกครั้ง ${title}"]`);
    const ok = await row.first().waitFor({ timeout: 9000 }).then(() => true, () => false);
    if (!ok) throw new Error(`หน้าสอนการใช้งานไม่มีเรื่อง "${title}"`);
    await row.first().click();
  }
  /** กรอบของชั้นวิธีใช้ล้อมปุ่มชื่อนี้ทั้งตัวไหม (ตัวที่มองเห็นตัวใดตัวหนึ่ง) */
  async function ringAround(p, id) {
    const ring = await p.locator("[data-howto-ring]").boundingBox().catch(() => null);
    const els = vis(p, `[data-testid="howto-${id}"]`);
    for (let k = 0; ring && k < (await els.count()); k++) {
      const b = await els.nth(k).boundingBox();
      if (b && b.x >= ring.x - 1 && b.y >= ring.y - 1 && b.x + b.width <= ring.x + ring.width + 1 && b.y + b.height <= ring.y + ring.height + 1) return true;
    }
    return false;
  }

  /**
   * เดิน "ถัดไป" จนขั้นสุดท้าย — คืน { tour, total, seen: ["1:found", …], titles: {n: ชื่อขั้น}, skipped: "6", ended }
   * ขั้นลองกด (ถัดไปกดไม่ได้จนเปิดเมนู) แตะปุ่มแทนในรูให้ · finish: "esc" = ข้าม (ไม่จด) · "done" = เข้าใจแล้ว (จด) · null = ค้างไว้
   * onStep(n) เรียกตอนขั้น n ขึ้นจอแล้ว (เช็คกรอบเพิ่มเติม)
   */
  async function walk(p, { finish = "esc", onStep, max = 10, firstWait = 20000 } = {}) {
    const host = p.locator("[data-howto-tour]");
    const box = p.locator('[data-otteri-howto] [role="dialog"]');
    const r = { tour: null, total: null, seen: [], titles: {}, skipped: "", ended: "" };
    await host.waitFor({ timeout: 9000 }).catch(() => {});
    let prev = null;
    for (let k = 0; k < max; k++) {
      const state = await p
        .waitForFunction(
          (before) => {
            const h = document.querySelector("[data-howto-tour]");
            if (!h) return "gone";
            const st = h.getAttribute("data-howto-step");
            const t = h.getAttribute("data-howto-target");
            if (st === before || t === "seek" || !document.querySelector('[data-otteri-howto] [role="dialog"]')) return false;
            return "ok";
          },
          prev,
          { timeout: k === 0 ? firstWait : 15000 },
        )
        .then((h) => h.jsonValue(), () => "timeout");
      if (state !== "ok") {
        r.ended = state === "gone" ? "จบเอง (ขั้นท้ายหาไม่เจอ)" : `ค้างหลังขั้น ${prev ?? "-"}`;
        break;
      }
      await p.waitForTimeout(250);
      const n = await host.getAttribute("data-howto-step");
      r.tour = await host.getAttribute("data-howto-tour");
      r.total = await host.getAttribute("data-howto-total");
      r.skipped = (await host.getAttribute("data-howto-skipped")) ?? "";
      r.seen.push(`${n}:${await host.getAttribute("data-howto-target")}`);
      r.titles[n] = ((await box.getAttribute("aria-label").catch(() => "")) || "").replace(/^.*?: /, "");
      if (onStep) await onStep(Number(n));
      prev = n;
      if (k === max - 1 || (await box.locator('[aria-label="เข้าใจแล้ว"]').count())) break;
      const next = box.locator('[aria-label="ถัดไป"]');
      if ((await next.getAttribute("aria-disabled")) === "true") {
        // ขั้นลองกด (ปุ่มสามขีด) — แตะปุ่มแทนขนาดเท่ารู แล้ว "ถัดไป" ถึงกดได้
        await p.locator('[data-otteri-howto] [aria-label="เปิดเมนู"]').click().catch(() => {});
        await p.waitForTimeout(900);
      }
      await next.click();
    }
    if (finish && (await box.count())) {
      if (finish === "done" && (await box.locator('[aria-label="เข้าใจแล้ว"]').count())) await box.locator('[aria-label="เข้าใจแล้ว"]').click();
      else await p.keyboard.press("Escape");
      await p.waitForTimeout(700);
    }
    return r;
  }
  /**
   * ตัดสินผลเดิน — want: { n: "found" | "center" | "found|center" | "skip" } ขั้นที่ไม่ระบุ = found
   * พิมพ์ชื่อเรื่อง + ขั้น + ชื่อขั้นของทุกขั้นที่ไม่ตรง (ขั้นที่ข้ามไม่ได้ขึ้นจอ จึงไม่มีชื่อ)
   */
  function judge(label, r, tour, total, want = {}) {
    const got = Object.fromEntries(r.seen.map((s) => s.split(":")));
    const skipped = r.skipped ? r.skipped.split(",") : [];
    const misses = [];
    if (r.tour !== tour) misses.push(`เรื่อง ${r.tour} (ควร ${tour})`);
    if (r.total !== String(total)) misses.push(`${r.total} ขั้น (ควร ${total})`);
    for (let n = 1; n <= total; n++) {
      const w = want[n] ?? "found";
      const have = got[n] ?? (skipped.includes(String(n)) ? "skip" : "ไม่ขึ้น");
      if (!w.split("|").includes(have)) misses.push(`${tour} ขั้น ${n}${r.titles[n] ? ` "${r.titles[n]}"` : ""}: ${have} (ควร ${w})`);
    }
    const line = `${r.seen.join(" ")}${r.skipped ? ` · ข้าม ${r.skipped}` : ""}${r.ended ? ` · ${r.ended}` : ""}`;
    misses.length ? fail(`${label}: ${misses.join(" | ")} [${line}]`) : pass(`${label}: ${line}`);
    return misses.length === 0;
  }
  const drafts = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("draft:close:")));
  const orderWindows = (p) => vis(p, '[aria-label="ขั้นตอนงาน"]').count();

  try {
    fx = await setup();
    const { sql, call } = fx;
    sql(`delete from "User" where id in (${users})`); // รอบก่อนพังกลางทาง — ใบงาน/สาขาของรอบก่อนลบไปแล้ว (สาขาใช้ชื่อใหม่ทุกรอบ)
    const today = visitDay(0);
    const team = sql(`select zone from "Branch" where code='C0006'`);
    const region = sql(`select coalesce(region,'') from "Branch" where code='C0006'`);
    const seenJson = `'{"welcome": "${new Date().toISOString()}", "notice": "${new Date().toISOString()}"}'::jsonb`;
    const addUser = (code, name, role, cols = "", vals = "") =>
      sql(`insert into "User"("employeeCode",name,role,"passwordHash","howtoSeen"${cols})
           select '${code}','${name}','${role}',"passwordHash",${seenJson}${vals} from "User" where "employeeCode"='A001'`);
    addUser("zzha.tech", "ช่างทดสอบชี้ปุ่ม", "EMPLOYEE", ",team", `,'${team}'`);
    // ทีมที่ไม่มีสาขาเลย = งานของฉันว่างเสมอ (ช่างใหม่ที่ยังไม่มีงาน)
    addUser("zzha.solo", "ช่างไม่มีงานทดสอบชี้ปุ่ม", "EMPLOYEE", ",team", `,'ทีมว่างวิธีใช้${SUF}'`);
    addUser("zzha.senior", "Senior ทดสอบชี้ปุ่ม", "SENIOR_TECH", `,team,"extraTeams"`, `,'${team}',ARRAY['${T2}']`);
    sql(`insert into "Branch"(name,code,region,zone,latitude,longitude) values ('สาขาทีมสองทดสอบชี้ปุ่ม','${B2}',nullif('${region}',''),'${T2}',13.75,100.5);
         insert into "Branch"(name,code,region,zone,ownership,"openedAt",latitude,longitude)
           values ('สาขาในประกันทดสอบชี้ปุ่ม','${BK}',nullif('${region}',''),'${team}','FRANCHISE',now()-interval '12 months',13.75,100.5);
         insert into "Machine"("branchId",code,type,brand,model,"updatedAt")
           select id,'W77','WASHER','Oasis',null,now() from "Branch" where code in ('${B2}','${BK}')`);

    // ใบไม่ใช้อะไหล่ ปล่อยงานวันนี้ (แอดมินแก้เป็นงานด่วนให้วันนี้ก่อน — field-flow-web-test)
    const release = async (branch, toTeam, time) => {
      const o = await fx.workOrder(branch, null);
      const S = fx.supervisor();
      await call(fx.A, "POST", `/work-orders/${o.id}/urgent-release`, { day: today });
      await call(S, "POST", `/work-orders/${o.id}/parts`, { needsParts: false, assign: { team: toTeam, scheduledAt: today, ...(time ? { scheduledTime: time } : {}) } });
      await call(fx.A, "POST", `/work-orders/${o.id}/confirm-appointment`, {});
      await call(S, "POST", `/work-orders/${o.id}/dispatch`, {});
      return o;
    };
    const st = (id) => sql(`select status from "WorkOrder" where id=${id}`);
    const J3 = await release(B2, T2, null); // ทีมที่สองของ Senior
    // ใบเคลมสาขาในประกัน: ระบุอะไหล่ → เช็ค → นัด 12 วันหน้า → เบิก → คอนเฟิร์ม → ปล่อยงาน แล้วย้ายวันนัดเป็นวันนี้ (claim-close-steps)
    const K1 = await fx.workOrder(BK, null);
    {
      const S = fx.supervisor();
      const sp = fx.fxPart(K1.id, "BOARD");
      await call(S, "POST", `/work-orders/${K1.id}/parts`, { needsParts: true, parts: [{ sparePartId: sp, quantity: 1 }] });
      await call(fx.A, "POST", `/work-orders/${K1.id}/parts-sourcing`, { results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94" }] });
      await call(S, "POST", `/work-orders/${K1.id}/assign`, { team, scheduledAt: visitDay(12) });
      await call(fx.A, "POST", `/work-orders/${K1.id}/parts-check`, {
        results: [{ sparePartId: sp, inStock: true, warehouse: "คลังลาดพร้าว 94", requisitionNo: `RQ-HA${SUF}` }],
      });
      await call(fx.A, "POST", `/work-orders/${K1.id}/confirm-appointment`, {});
      await call(S, "POST", `/work-orders/${K1.id}/dispatch`, {});
      sql(`update "WorkOrder" set "scheduledAt"=(now() at time zone 'Asia/Bangkok')::date where id=${K1.id}`);
    }
    const J1 = await release("C0006", team, "08:30"); // ถึงหน้างานแล้ว
    const J2 = await release("C0006", team, "10:30"); // ยังไม่ถึง (ปุ่มถึงหน้างาน)
    // ใบรอแอดมินเช็คอะไหล่ — แอดมินมีกลุ่มตามขั้นแน่ ๆ และใบที่ถึงคิวแอดมินให้ "ใบงานซ่อม" ขั้น 6 เปิด
    const AJ = await fx.workOrder("C0006", null);
    await call(fx.supervisor(), "POST", `/work-orders/${AJ.id}/parts`, { needsParts: true, parts: [{ sparePartId: fx.fxPart(AJ.id, "BOARD"), quantity: 1 }] });
    // ใบรอหัวหน้าภาคระบุอะไหล่ (สร้างท้ายสุดของ C0006 — S001 อยู่ภาคของ C0006 ตอนจบ) ไม่มีรายการที่ช่างเลือก
    const N1 = await fx.workOrder("C0006", null);
    const T = await fx.login("zzha.tech");
    await call(T, "POST", `/work-orders/${J1.id}/arrive`, {});
    await call(T, "POST", `/work-orders/${K1.id}/arrive`, {});
    const ready = [J1, J2, J3, K1, AJ, N1].map((o) => st(o.id)).join(",");
    const arrived = sql(`select count(*) from "WorkOrderLog" where "workOrderId" in (${J1.id},${K1.id}) and action='ARRIVED'`);
    const warranty = (await call(fx.A, "GET", `/work-orders/${K1.id}`)).branchWarrantyExpired;
    ready === "IN_PROGRESS,IN_PROGRESS,IN_PROGRESS,IN_PROGRESS,PARTS_SOURCING,NEW" && arrived === "2" && warranty === false
      ? pass(`เตรียม (ฐานข้อมูล): ${J1.code} ถึงแล้ว · ${J2.code} ยังไม่ถึง · ${J3.code} ทีมสอง · ${K1.code} เคลมในประกัน ถึงแล้ว · ${AJ.code} รอแอดมิน · ${N1.code} รอระบุอะไหล่`)
      : fail(`เตรียมใบไม่ครบ: ${ready} · ถึงหน้างาน ${arrived} · ในประกัน ${warranty}`);
    const logsOf = () => sql(`select count(*) from "WorkOrderLog" where "workOrderId" in (${J1.id},${K1.id},${N1.id})`);

    // ══════════ ช่าง (zzha.tech) — มือถือ แล้วจอคอม ══════════
    for (const size of [PHONE, WIDE]) {
      const W = size.width < 640 ? "มือถือ" : "คอม";
      const s = await open("zzha.tech", size);
      const p = s.page;
      // งานของฉันวันนี้ — มือถือ 7 ขั้น (ขั้น 5 ลองกด) · คอม 6
      await pressHelp(p);
      judge(`ช่าง ${W} · งานของฉันวันนี้`, await walk(p), "tech.myday", size.width < 640 ? 7 : 6);

      // ใบงานซ่อม — 4 ขั้น
      await fresh(s);
      await openItem(p, "wo");
      await pressHelp(p);
      judge(`ช่าง ${W} · ใบงานซ่อม`, await walk(p), "tech.orders", 4);

      // ใบงาน — เปิดใบที่ถึงหน้างานแล้วจากปุ่ม "รายละเอียด" บนการ์ด แล้วกด ? ของหน้าต่างใบงาน
      await fresh(s);
      await vis(p, `[aria-label="รายละเอียด ${J1.code}"]`).first().click();
      await pressHelp(p, "order.help");
      judge(`ช่าง ${W} · ใบงาน (${J1.code})`, await walk(p), "tech.order", 5);

      // ปิดงาน — ใบธรรมดา (ฟอร์มหน้าเดียว): ขั้น 6 แถบสี่ขั้นข้ามเอง · ใบเคลมในประกัน (ฟอร์มทีละขั้น): ครบ 7 ขั้น
      for (const [o, kind, want] of [
        [J1, "ฟอร์มหน้าเดียว", { 6: "skip" }],
        [K1, "ฟอร์มทีละขั้น", {}],
      ]) {
        await fresh(s);
        const card = vis(p, `[aria-label="งาน ${o.code}"]`).first();
        await card.locator('[aria-label="ปิดงาน"]').first().click();
        await pressHelp(p, "close.help");
        const r = await walk(p);
        judge(`ช่าง ${W} · ปิดงาน ${o.code} (${kind})`, r, "tech.close", 7, want);
        const left = await drafts(p);
        left.length === 0 ? pass(`ช่าง ${W} · เปิดฟอร์มปิดงาน ${o.code} แล้วดูวิธีใช้จบ — ไม่มีร่างในเครื่อง`) : fail(`ฟอร์มปิดงานเขียนร่าง: ${left.join(",")}`);
      }
      await p.screenshot({ path: path.join(DIR, `howto-anchors-close-${size.width}.png`) });

      // ปิดงานจากหน้าสอนการใช้งาน — แอปเปิดฟอร์มปิดงานของงานแรกที่ถึงหน้างานให้เอง: ขั้น 1 ต้อง found · ไม่เขียนอะไรเลย
      await fresh(s);
      const logs0 = logsOf();
      s.writes.length = 0;
      await fromHub(p, "ปิดงาน");
      const h = await walk(p, { finish: null });
      judge(`ช่าง ${W} · ปิดงาน จากหน้าสอนการใช้งาน`, h, "tech.close", 7, { 6: "skip|found" });
      const opened = (await vis(p, '[data-testid="howto-close.help"]').count()) > 0;
      await p.keyboard.press("Escape");
      await p.waitForTimeout(800);
      const stillOpen = (await orderWindows(p)) + (await vis(p, '[data-testid="howto-close.help"]').count());
      const left = await drafts(p);
      opened && stillOpen > 0 && s.writes.length === 0 && left.length === 0 && logsOf() === logs0 && st(J1.id) === "IN_PROGRESS" && st(K1.id) === "IN_PROGRESS"
        ? pass(`ช่าง ${W} · คำสั่งเปิดฟอร์มปิดงาน: ฟอร์มเปิดเอง ค้างไว้หลังข้าม · ไม่มีคำขอเขียน ไม่มีร่าง ใบงาน/ประวัติไม่เปลี่ยน (ฐานข้อมูล)`)
        : fail(`ช่าง ${W} · คำสั่งเปิดฟอร์มปิดงาน: เปิด ${opened} · ค้าง ${stillOpen} · เขียน ${s.writes.join(",") || "-"} · ร่าง ${left.join(",") || "-"} · ประวัติ ${logs0}→${logsOf()}`);
      await s.ctx.close();
    }

    // ── ช่างที่ยังไม่มีงานถึงหน้างาน: ปิดงานจากหน้าสอนการใช้งาน = กล่องกลางจอทุกขั้น (ข้ามแถบสี่ขั้น) → เข้าใจแล้ว จดที่บัญชี ──
    {
      const s = await open("zzha.solo", PHONE);
      await fromHub(s.page, "ปิดงาน");
      const r = await walk(s.page, { finish: "done", firstWait: 25000 });
      judge("ช่างไม่มีงาน · ปิดงาน จากหน้าสอนการใช้งาน (กลางจอ)", r, "tech.close", 7, { 1: "center", 2: "center", 3: "center", 4: "center", 5: "center", 6: "skip", 7: "center" });
      let at = "";
      for (let k = 0; k < 25 && !at; k++) {
        await s.page.waitForTimeout(200);
        at = sql(`select coalesce("howtoSeen"->'tours'->>'tech.close','') from "User" where "employeeCode"='zzha.solo'`);
      }
      at && (await orderWindows(s.page)) === 0
        ? pass(`ช่างไม่มีงาน: เข้าใจแล้ว → ฐานข้อมูลจด tours."tech.close" (${at}) · ไม่มีหน้าต่างใบงานเปิด`) : fail(`ช่างไม่มีงาน: จด "${at}" · หน้าต่าง ${await orderWindows(s.page)}`);
      await s.ctx.close();
    }

    // ══════════ Senior ช่าง ดูแลสองทีม — "ใบงานซ่อม" 5 ขั้น · ขั้น 5 คอม = หัวคอลัมน์ "ทีม" · มือถือ = บรรทัดชื่อทีมในการ์ด ══════════
    for (const size of [PHONE, WIDE]) {
      const W = size.width < 640 ? "มือถือ" : "คอม";
      const id = size.width >= 1024 ? "orders.colTeam" : "orders.rowTeam";
      const s = await open("zzha.senior", size);
      await openItem(s.page, "wo");
      const both = (await vis(s.page, `text=${J1.code}`).count()) > 0 && (await vis(s.page, `text=${J3.code}`).count()) > 0;
      both ? pass(`Senior ${W}: เห็นใบของทั้งสองทีม (${J1.code} · ${J3.code})`) : fail(`Senior ${W}: ไม่เห็นใบของทั้งสองทีม`);
      let ring = false;
      await pressHelp(s.page);
      const r = await walk(s.page, { onStep: async (n) => { if (n === 5) ring = await ringAround(s.page, id); } });
      judge(`Senior ${W} · ใบงานซ่อม`, r, "tech.orders", 5);
      ring ? pass(`Senior ${W} · ขั้น 5 "เห็นงานหลายทีม" กรอบล้อม ${id}`) : fail(`Senior ${W} · ขั้น 5 กรอบไม่ล้อม ${id}`);
      await s.page.screenshot({ path: path.join(DIR, `howto-anchors-senior-${size.width}.png`) });
      await s.ctx.close();
    }

    // ══════════ หัวหน้าภาค (S001) — Esc ทุกเรื่อง ฐานข้อมูลของ S001 ไม่ถูกจด ══════════
    const sSeen = () => sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='S001'`);
    const sBefore = sSeen();
    for (const size of [PHONE, WIDE]) {
      const W = size.width < 640 ? "มือถือ" : "คอม";
      const s = await open("S001", size);
      const p = s.page;
      await pressHelp(p);
      judge(`หัวหน้าภาค ${W} · งานของฉันวันนี้`, await walk(p), "sup.myday", 7, { 1: "center", 7: "found|center" });

      // ใบงานซ่อม (เมนู ใบงานซ่อม = ไม่ใช่กล่องงาน: แท็บย่อยไม่มี ขั้น 2 กลางจอ) · ขั้น 5 แอปเปิดใบให้ · ขั้น 6 ปุ่มของขั้น
      await fresh(s);
      await openItem(p, "wo");
      await pressHelp(p);
      judge(`หัวหน้าภาค ${W} · ใบงานซ่อม (เมนูใบงานซ่อม)`, await walk(p), "sup.orders", 6, { 2: "center" });
      if (size === WIDE) {
        // จากกล่องงานของฉัน แท็บย่อยมีจริง — ขั้น 2 ต้องหาเจอ
        await fresh(s);
        await openItem(p, "inbox");
        await pressHelp(p);
        judge(`หัวหน้าภาค ${W} · ใบงานซ่อม (กล่องงานของฉัน)`, await walk(p), "sup.orders", 6);
      }

      // ระบุอะไหล่ (ในฟอร์ม) — เปิดใบรอระบุอะไหล่จาก "รายละเอียด" บนการ์ด → ปุ่ม "ระบุอะไหล่" ในหน้าใบงาน → ? ในหัวฟอร์ม
      await fresh(s);
      // งานของหัวหน้าภาคในเครื่องพัฒนาอาจยาวหลายจอ — ค้นเลขใบก่อน ให้การ์ดของใบนี้อยู่บนสุด
      await vis(p, '[aria-label="ค้นหาในงานของฉัน"]').first().fill(N1.code);
      await p.waitForTimeout(900);
      await vis(p, `[aria-label="รายละเอียด ${N1.code}"]`).first().click();
      await vis(p, '[data-testid="howto-order.action"] [aria-label="ระบุอะไหล่"]').first().waitFor({ timeout: 15000 }).catch(() => {});
      await vis(p, '[data-testid="howto-order.action"] [aria-label="ระบุอะไหล่"]').first().click();
      await pressHelp(p, "parts.help");
      // ขั้น 2 "ใช้อะไหล่": ข้อความเดิมบอกว่า "ของที่ไม่มีในไฟล์ไหนเลย กด เพิ่มอะไหล่นอก" — ตั้งแต่ 4 พ.ย. 69 ของแบบนั้นคืออะไหล่นอกเครื่อง
      // (มีรหัสในสโตร์ ค้นเจอ เลือกได้เลย) ทำตามข้อความเดิมได้ของนอกสโตร์ซ้ำกับรหัสในสโตร์ — อ่านข้อความจริงในกล่อง ไม่ใช่ไฟล์ .howto.ts
      let useParts = "";
      const readUseParts = async (n) => {
        if (n === 2) useParts = await p.locator('[data-otteri-howto] [role="dialog"]').first().innerText().catch(() => "");
      };
      judge(`หัวหน้าภาค ${W} · ระบุอะไหล่ (${N1.code})`, await walk(p, { onStep: readUseParts }), "sup.parts", 5);
      useParts.includes("อะไหล่นอกเครื่องเลือกได้ทุกเครื่อง ไม่ต้องยืนยัน") &&
      useParts.includes("ของที่ไม่มีในสโตร์ (ค้นไม่เจอ) กด \"เพิ่มอะไหล่นอก\"") &&
      !useParts.includes("ของที่ไม่มีในไฟล์ไหนเลย")
        ? pass(`หัวหน้าภาค ${W} · ระบุอะไหล่ ขั้น "ใช้อะไหล่": บอกว่าอะไหล่นอกเครื่องเลือกได้เลย · "เพิ่มอะไหล่นอก" เฉพาะของที่ไม่มีในสโตร์`)
        : fail(`หัวหน้าภาค ${W} · ระบุอะไหล่ ขั้น "ใช้อะไหล่" ยังให้ของที่ไม่อยู่ในไฟล์ไหนไปกดเพิ่มอะไหล่นอก: ${useParts.replace(/\s+/g, " ").slice(0, 300)}`);

      // ระบุอะไหล่จากหน้าสอนการใช้งาน — งานของฉันวันนี้เปิดใบรอระบุอะไหล่ใบแรกให้ แล้วหน้าใบงานเปิดฟอร์มต่อ: ไม่เขียนอะไรเลย
      await fresh(s);
      const logs0 = logsOf();
      s.writes.length = 0;
      await fromHub(p, "ระบุอะไหล่");
      const h = await walk(p, { finish: null });
      judge(`หัวหน้าภาค ${W} · ระบุอะไหล่ จากหน้าสอนการใช้งาน`, h, "sup.parts", 5);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(800);
      const formOpen = (await vis(p, '[data-testid="howto-parts.help"]').count()) > 0;
      s.writes.length === 0 && st(N1.id) === "NEW" && logsOf() === logs0 && formOpen
        ? pass(`หัวหน้าภาค ${W} · คำสั่งเปิดฟอร์มระบุอะไหล่: ฟอร์มค้างไว้หลังข้าม · ไม่มีคำขอเขียน · ใบยังรอระบุอะไหล่ ประวัติไม่เปลี่ยน (ฐานข้อมูล)`)
        : fail(`หัวหน้าภาค ${W} · คำสั่งเปิดฟอร์มระบุอะไหล่: เขียน ${s.writes.join(",") || "-"} · ${st(N1.id)} · ประวัติ ${logs0}→${logsOf()} · ฟอร์ม ${formOpen}`);

      // เปิดใบงานใหม่ — ปุ่ม "เพิ่มใบงาน" ในใบงานซ่อม → ? ในหัวหน้าต่าง
      await fresh(s);
      await openItem(p, "wo");
      await vis(p, '[data-testid="howto-orders.add"]').first().click();
      await pressHelp(p, "newOrder.help");
      judge(`หัวหน้าภาค ${W} · เปิดใบงานใหม่`, await walk(p), "sup.newOrder", 6);
      await p.screenshot({ path: path.join(DIR, `howto-anchors-sup-${size.width}.png`) });

      // เปิดใบงานใหม่จากหน้าสอนการใช้งาน — หน้าต่างเปล่าเปิดเอง ขั้น 1 found · ข้ามแล้วหน้าต่างค้าง แถบข้อความรอจนปิดหน้าต่าง
      await fresh(s);
      s.writes.length = 0;
      await fromHub(p, "เปิดใบงานใหม่");
      const n1 = await walk(p, { max: 1, finish: "esc" });
      const formOn = (await vis(p, '[data-testid="howto-newOrder.help"]').count()) > 0;
      const toastNow = await p.getByText(/^ข้ามแล้ว · ดูวิธีใช้อีกครั้ง/).locator("visible=true").count();
      n1.tour === "sup.newOrder" && n1.seen[0] === "1:found" && formOn && toastNow === 0 && s.writes.length === 0
        ? pass(`หัวหน้าภาค ${W} · เปิดใบงานใหม่จากหน้าสอนการใช้งาน: หน้าต่างเปล่าเปิดเอง ขั้น 1 ชี้หัวข้อ สาขา · ข้ามแล้วหน้าต่างค้าง ไม่มีแถบข้อความทับ · ไม่มีคำขอเขียน`)
        : fail(`หัวหน้าภาค ${W} · เปิดใบงานใหม่จากหน้าสอนการใช้งาน: ${n1.tour} ${n1.seen.join(" ")} · หน้าต่าง ${formOn} · แถบ ${toastNow} · เขียน ${s.writes.join(",") || "-"}`);
      await s.ctx.close();
    }
    sSeen() === sBefore ? pass("S001 ข้ามทุกเรื่อง — ฐานข้อมูลไม่ถูกจด") : fail(`S001 ถูกจด: ${sBefore} → ${sSeen()}`);

    // ══════════ แอดมิน (A001) — Esc ทุกเรื่อง ══════════
    const aSeen = () => sql(`select coalesce("howtoSeen"::text,'NULL') from "User" where "employeeCode"='A001'`);
    const aBefore = aSeen();
    for (const size of [PHONE, WIDE]) {
      const W = size.width < 640 ? "มือถือ" : "คอม";
      const wide = size.width >= 1100;
      const s = await open("A001", size);
      const p = s.page;
      // มือถือ: ปุ่ม "วิธีใช้หน้านี้" ของแอดมินอยู่ในเมนูข้าง (แถบหัวเต็ม)
      await pressHelp(p);
      judge(`แอดมิน ${W} · งานของฉันวันนี้`, await walk(p), "admin.myday", 6, { 1: "center" });

      await fresh(s);
      await openItem(p, "wo");
      await pressHelp(p);
      judge(`แอดมิน ${W} · ใบงานซ่อม`, await walk(p), "admin.orders", wide ? 7 : 6);

      await fresh(s);
      await openItem(p, "wo");
      await vis(p, '[data-testid="howto-orders.add"]').first().click();
      await pressHelp(p, "newOrder.help");
      judge(`แอดมิน ${W} · เปิดใบงานใหม่`, await walk(p), "admin.newOrder", 6);
      await s.ctx.close();
    }
    aSeen() === aBefore ? pass("A001 ข้ามทุกเรื่อง — ฐานข้อมูลไม่ถูกจด") : fail(`A001 ถูกจด: ${aBefore} → ${aSeen()}`);

    // ══════════ Super Admin (สร้างท้ายสุด — ระหว่างมีอยู่ กติกาบางข้อของแอดมินทั่วไปเปลี่ยน) — งานของฉันวันนี้ 7 ขั้น ══════════
    addUser("zzha.super", "ซุปเปอร์ทดสอบชี้ปุ่ม", "SUPER_ADMIN");
    for (const size of [PHONE, WIDE]) {
      const W = size.width < 640 ? "มือถือ" : "คอม";
      const s = await open("zzha.super", size);
      await pressHelp(s.page);
      judge(`Super Admin ${W} · งานของฉันวันนี้`, await walk(s.page), "admin.myday", 7, { 1: "center" });
      await s.ctx.close();
    }

    errors.length === 0 ? pass("ไม่มี error ในหน้าเว็บ") : fail(`error ในหน้าเว็บ: ${errors.slice(0, 3).join(" | ")}`);
  } catch (e) {
    fail(`เทสต์พัง: ${e.stack || e}`);
  } finally {
    await cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่ได้: ${e}`));
    const left = fx?.sql(`select count(*) from "User" where "employeeCode" like 'zzha.%'`) ?? "0";
    left === "0" ? pass("ลบผู้ใช้/สาขา/ใบงานทดสอบแล้ว") : fail(`ผู้ใช้ทดสอบค้าง ${left} คน`);
    await browser.close();
  }
})();
