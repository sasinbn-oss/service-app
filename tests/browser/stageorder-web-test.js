// ทดสอบ: แถบขั้นตอนแบบใหม่ (เจ้าของงานเลือก ต.ค. 69 รอบสอง) — โชว์เฉพาะขั้นที่ใบนี้ต้องผ่าน ไม่ใช่ทุกขั้นแล้วติดป้าย "ข้าม"
//   · ใบเสนอราคา (สาขา D หมดประกัน) 9 ขั้น: ระบุอะไหล่ → เช็คอะไหล่ → ส่งใบเสนอราคา → แนบบิลรับเงิน → นัดวันเข้า
//     → เบิกอะไหล่ → คอนเฟิร์มลูกค้า → ปล่อยงาน → เข้างาน/ปิดงาน (เบิกก่อนคอนเฟิร์มลูกค้า)
//   · จอแคบ: แถบไม่ล้นจอ เห็นชื่อขั้นปัจจุบัน ("เช็คอะไหล่") ชื่อขั้นอื่นซ่อน
//   · ใบไม่เสนอราคา (C0006) ที่ขั้นเบิก: 7 ขั้น ไม่มีขั้นเสนอราคา ไม่มีปุ่ม "ข้าม" · นัดวันแล้ว ✓ → เบิกอะไหล่ (ขั้นปัจจุบัน)
//     → คอนเฟิร์มลูกค้าอยู่หลังเบิก · คลัง 94 ไม่มีขั้นย่อยโอน
//   · ใบที่ของอยู่คลังอื่น: ขั้นย่อย เบิก + สั่งโอน · รอของถึง · เบิกส่งมอบ อยู่ใต้แถบ ไม่ใช่ขั้นหลัก
//   · ใบที่ส่งตรวจหน้างาน: รอบตรวจเป็นแถบเล็กเหนือแถบหลัก · ขั้น 1 ยังไม่ติ๊ก (ตรวจแล้ววนกลับมาระบุ)
//   · ใบไม่ใช้อะไหล่: 5 ขั้น ไม่มีเช็ค/เบิก
//   · ใบที่คอนเฟิร์มลูกค้าก่อนเบิก (ค้างอยู่ตอนสลับลำดับ): ลูกค้าคอนเฟิร์มแล้ว ✓ อยู่ก่อนเบิกอะไหล่ ไม่ขึ้นว่าข้าม
//   · ขั้นย่อยโอนติ๊กเฉพาะที่เกิดจริง: โอนครบ → ✓ทั้งสาม · เบิกคลังอื่นไม่โอน → ไม่มีขั้นย่อย คนทำ "หัวหน้าภาค · เบิกคลังอื่น"
//     · หัวหน้าภาคส่งกลับ (โอนไม่ได้) แล้วแอดมินเบิกคลัง 94 → ไม่มีขั้นย่อยโอน (เดิมติ๊กว่าสั่งโอน/ของถึงแล้ว)
//   · ย้อนไประบุใหม่ว่าไม่ใช้อะไหล่ → 5 ขั้น ไม่มีขั้นเช็ค/เบิกของรอบก่อนติ๊กค้าง
//   · ใบที่ยกเลิกตอนค้างเบิกโดยยังไม่มีวัน → นัดวันไม่ติ๊ก
//   · ใบตรวจหน้างาน (ขั้น 1 ↻) ยังย้อนกลับไประบุอะไหล่ได้
//   · ใบที่มีของนอกสโตร์ เบิกแล้วถึงขั้นคอนเฟิร์ม → ฟอร์ม "คอนเฟิร์มออกหน้างาน" ปกติ ไม่ใช่ข้อความของใบเก่า
//     → ย้อนกลับไปนัดวันเข้า: แถบติ๊ก "เบิกอะไหล่แล้ว" ล่วงหน้าตาม issueLeft ของเซิร์ฟเวอร์ และนัดแล้วใบข้ามไปคอนเฟิร์มจริง
//     (เดิมแถบดูแค่ของในสโตร์ ใบที่มีแต่ของนอกสโตร์ขึ้นว่ายังต้องเบิก ทั้งที่กดนัดแล้วใบไม่ผ่านขั้นเบิก)
//   ขั้นหลักแต่ละขั้นมีชื่อ "ขั้น k ชื่อขั้น · สถานะ" — เทสต์อ่านสถานะจากชื่อนี้ ไม่ต้องเดาจากวง/ติ๊ก
//   ยืนยันสถานะใบที่ฐานข้อมูลก่อนเปิดจอทุกใบ — แถบที่ "ถูก" กับใบที่อยู่ผิดขั้นไม่ได้พิสูจน์อะไร
// ต้องมี DATABASE_URL
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const { setup, visitDay } = require("./fixture");

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 1200 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
  let fx = null;

  async function open(code) {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.waitForTimeout(2500);
    if (await page.getByPlaceholder("รหัสพนักงาน").count()) {
      await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
    }
    // จอคอมมีเมนูข้าง ไม่มีแถบล่าง
    if (page.viewportSize().width >= 1200) await page.getByLabel("ใบงานซ่อม").first().click();
    else await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await page.waitForTimeout(2500);
    const row = vis(code);
    if (!(await row.count())) throw new Error(`ไม่เจอ ${code} ในรายการ`);
    await row.last().click();
    await page.waitForTimeout(3500);
  }

  /**
   * อ่านแถบขั้นตอนจากโครงของหน้า ไม่ใช่สีหรือ style — ขั้นหลักคือลูกที่มีชื่อ (aria-label) ชั้นแรกของ "ขั้นตอนงาน"
   * ยกเว้นรอบตรวจ ขั้นย่อย และรายการขั้นที่ข้าม · สถานะอ่านจากชื่อ "ขั้น k ชื่อขั้น · เสร็จแล้ว/ทำอยู่/ยังไม่ถึง/รอผลตรวจหน้างาน"
   * ชื่อที่โชว์ (label) อ่านจากตัวหนังสือบนจอ — ขั้นที่ทำแล้วขึ้น "…แล้ว"
   */
  const readBar = () =>
    page.evaluate(() => {
      const root = document.querySelector('[aria-label="ขั้นตอนงาน"]');
      if (!root) return null;
      const OTHER = ["ตรวจหน้างาน (วนกลับ)", "ขั้นย่อยเบิกอะไหล่", "ขั้นที่ข้าม"];
      const leaves = (el) =>
        [...el.querySelectorAll("*")].filter((n) => !n.children.length).map((n) => (n.textContent || "").trim()).filter(Boolean);
      const head = (document.body.innerText.match(/ขั้นที่ (\d+) จาก (\d+)/) || []).slice(1).map(Number);
      const items = [...root.querySelectorAll("[aria-label]")]
        .filter((n) => n.parentElement.closest("[aria-label]") === root && !OTHER.includes(n.getAttribute("aria-label")))
        .map((n) => {
          const aria = n.getAttribute("aria-label");
          const ls = leaves(n);
          if (/^ข้าม \d+ ขั้น$/.test(aria)) return { aria, skip: true, label: ls.join(" "), state: "skipped" };
          const m = aria.match(/^ขั้น (\d+) (.+) · (เสร็จแล้ว|ทำอยู่|ยังไม่ถึง|รอผลตรวจหน้างาน)$/);
          const STATE = { "เสร็จแล้ว": "done", "ทำอยู่": "now", "ยังไม่ถึง": "future", "รอผลตรวจหน้างาน": "loop" };
          // ไอคอนติ๊กเป็นตัวอักษรในช่วง Private Use ของฟอนต์ไอคอน
          const label = ls.find((t) => !/^\d+$/.test(t) && !/^[-]$/.test(t) && t !== "↻" && t !== "!");
          if (!m) return { aria, label, num: null, state: "unknown", text: ls.join(" ") };
          return { aria, label, num: Number(m[1]), state: STATE[m[3]], text: ls.join(" ") };
        });
      const sub = root.querySelector('[aria-label="ขั้นย่อยเบิกอะไหล่"]');
      const track = root.querySelector('[aria-label="ตรวจหน้างาน (วนกลับ)"]');
      return {
        head,
        items,
        sub: sub ? leaves(sub) : null,
        track: track ? leaves(track) : null,
        over: root.scrollWidth - root.clientWidth,
      };
    });
  const show = (b) => b.items.map((i) => `${i.label}${i.state === "done" ? "✓" : i.state === "now" ? "●" : i.state === "loop" ? "↻" : i.state === "skipped" ? "[ข้าม]" : ""}`).join(" → ");
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const STEP7 = ["ระบุอะไหล่แล้ว", "เช็คอะไหล่แล้ว", "นัดวันแล้ว", "เบิกอะไหล่", "คอนเฟิร์มลูกค้า", "ปล่อยงาน", "เข้างาน/ปิดงาน"];

  try {
    fx = await setup();
    // เปิดใบแล้วหัวหน้าภาคระบุอะไหล่ 1 ชิ้น (kind = "BOARD" | "BELT") — ทางเดียวกับ fx.workOrder(สาขา, อะไหล่)
    // แต่เลือกอะไหล่หลังมีใบ เพราะอะไหล่ต้องอยู่ไฟล์ยี่ห้อเดียวกับเครื่องของใบ (fxPart) · คืนใบพร้อม id ที่ส่งไป (wo.pid)
    const withPart = async (branch, kind) => {
      const wo = await fx.workOrder(branch, null);
      wo.pid = fx.fxPart(wo.id, kind);
      await fx.call(fx.supervisor(), "POST", `/work-orders/${wo.id}/parts`, { needsParts: true, parts: [{ sparePartId: wo.pid, quantity: 1 }] });
      return wo;
    };
    const st = (id) => fx.sql(`select status||'|'||coalesce("appointmentStatus",'-') from "WorkOrder" where id=${id}`);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);
    // ใบที่ต้องเสนอราคา = สาขาแฟรนไชส์ (D) ที่เปิดเกิน 3 ปี หมดประกัน
    const dOld = fx.sql(`select code from "Branch" where code like 'D%' and "cancelledAt" is null and "openedAt" < now() - interval '3 years' order by "openedAt" limit 1`);
    const Q = await withPart(dOld, "BOARD");
    // ใบทั่วไป: เช็คแล้วมีที่คลัง 94 → หัวหน้าภาคนัดวัน → ถึงขั้นเบิก (ลูกค้ายังไม่คอนเฟิร์ม)
    const N = await withPart("C0006", "BOARD");
    await fx.source(N.id);
    await fx.schedule(N.id, visitDay(30));
    // ใบโอน: ของอยู่คลังภูเก็ต → นัดวัน → แอดมินส่งให้หัวหน้าภาคเบิก+โอน
    const T = await withPart("C0006", "BELT");
    await fx.source(T.id, "คลังภูเก็ต");
    await fx.schedule(T.id, visitDay(30));
    await fx.call(fx.A, "POST", `/work-orders/${T.id}/parts-check`, { results: [{ sparePartId: T.pid, inStock: true, warehouse: "คลังภูเก็ต" }] });
    // ใบตรวจหน้างาน: หัวหน้าภาคส่งตรวจพร้อมวัน → รอแอดมินนัดร้าน
    const I = await fx.workOrder("C0006", null);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${I.id}/inspect-request`, { team, scheduledAt: visitDay(20) });
    // ใบไม่ใช้อะไหล่ → ไปนัดวันเลย
    const P = await fx.workOrder("C0006", []);
    // ใบที่คอนเฟิร์มลูกค้าก่อนเบิก — ค้างอยู่ที่ขั้นคอนเฟิร์มตอนสลับลำดับ (ไม่ถูกย้ายโดย migration) แล้วแอดมินคอนเฟิร์ม
    const O = await withPart("C0006", "BOARD");
    await fx.source(O.id);
    await fx.schedule(O.id, visitDay(30));
    fx.sql(`update "WorkOrder" set status='AWAITING_CONFIRM' where id=${O.id}`);
    await fx.confirm(O.id);
    // ใบเบิกคลังอื่นไม่โอน: แอดมินบอกว่าของอยู่คลังภูเก็ต ไม่ต้องโอน → หัวหน้าภาคเบิกจากคลังนั้นเลย
    const K = await withPart("C0006", "BELT");
    await fx.source(K.id, "คลังภูเก็ต");
    await fx.schedule(K.id, visitDay(30));
    await fx.call(fx.A, "POST", `/work-orders/${K.id}/parts-check`, { results: [{ sparePartId: K.pid, inStock: true, warehouse: "คลังภูเก็ต" }], transfer: false });
    // ใบที่ส่งให้โอนแล้วหัวหน้าภาคส่งกลับ (คลังนั้นไม่มีของ) → แอดมินเบิกคลัง 94 แทน → ถึงขั้นคอนเฟิร์ม
    const B = await withPart("C0006", "BELT");
    await fx.source(B.id, "คลังภูเก็ต");
    await fx.schedule(B.id, visitDay(30));
    await fx.call(fx.A, "POST", `/work-orders/${B.id}/parts-check`, { results: [{ sparePartId: B.pid, inStock: true, warehouse: "คลังภูเก็ต" }] });
    await fx.call(fx.supervisor(), "POST", `/work-orders/${B.id}/parts-transfer/return`, { reason: "คลังภูเก็ตไม่มีของ (เทสต์)" });
    await fx.issue(B.id);
    // ใบที่เบิกแล้ว ย้อนกลับไประบุอะไหล่ → ระบุใหม่ว่าไม่ใช้อะไหล่ → นัดวัน → ถึงขั้นคอนเฟิร์ม
    const R = await withPart("C0006", "BOARD");
    await fx.source(R.id);
    await fx.schedule(R.id, visitDay(30));
    await fx.issue(R.id);
    await fx.call(fx.A, "POST", `/work-orders/${R.id}/rollback`, { toStage: "NEW", reason: "ระบุอะไหล่ผิดใบ (เทสต์)" });
    await fx.call(fx.supervisor(), "POST", `/work-orders/${R.id}/parts`, { needsParts: false });
    await fx.schedule(R.id, visitDay(30));
    // ใบเก่าที่ค้างขั้นเบิกโดยยังไม่มีวัน (ย้ายมาจากสายงานเดิม) แล้วถูกยกเลิก
    const X = await withPart("C0006", "BOARD");
    await fx.source(X.id);
    fx.sql(`update "WorkOrder" set status='PARTS_REQUESTED' where id=${X.id}`);
    await fx.call(fx.A, "POST", `/work-orders/${X.id}/cancel`, { reasonCode: "CUSTOMER", note: "ลูกค้ายกเลิก (เทสต์)" });
    // ใบที่มีของนอกสโตร์: เช็ค → ข้ามเสนอราคา → นัดวัน → เบิก → ถึงขั้นคอนเฟิร์มลูกค้า
    const F = await fx.workOrder("C0006", null);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${F.id}/parts`, { needsParts: true, offParts: [{ name: `สายพานนอกสโตร์ทดสอบ ${F.id}`, quantity: 1 }] });
    await fx.source(F.id);
    await fx.call(fx.A, "POST", `/work-orders/${F.id}/quote`, { skip: true, note: "บริษัทออกให้ (เทสต์)" });
    await fx.schedule(F.id, visitDay(30));
    await fx.issue(F.id);
    const offCatalog = Number(fx.sql(`select p."sparePartId" from "WorkOrderPart" p where p."workOrderId"=${F.id} and p.kind='WAITING' limit 1`));

    const ready = [Q, N, T, I, P, O, K, B, R, X, F].map((x) => st(x.id)).join(",");
    ready ===
    "PARTS_SOURCING|-,PARTS_REQUESTED|PENDING,PARTS_TRANSFER|PENDING,INSPECT_CONFIRM|PENDING,PARTS_CHECKED|-,PARTS_REQUESTED|CONFIRMED," +
      "PARTS_PICKUP|PENDING,AWAITING_CONFIRM|PENDING,AWAITING_CONFIRM|PENDING,CANCELLED|-,AWAITING_CONFIRM|PENDING"
      ? pass("เตรียมใบ (ฐานข้อมูล): เช็คอะไหล่ · เบิก · เบิก+โอน · นัดร้านตรวจ · นัดวัน · เบิก (คอนเฟิร์มแล้ว) · เบิกคลังอื่น · ส่งกลับแล้วเบิก 94 · ย้อนไปไม่ใช้อะไหล่ · ยกเลิก · ของนอกสโตร์")
      : fail(`เตรียมใบ: ${ready}`);
    fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${B.id} and action='TRANSFER_RETURNED'`) === "1" &&
    fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${R.id} and action='NO_PARTS'`) === "1" &&
    fx.sql(`select coalesce(to_char("scheduledAt",'YYYY-MM-DD'),'-') from "WorkOrder" where id=${X.id}`) === "-" &&
    fx.sql(`select "offCatalog" from "SparePart" where id=${offCatalog}`) === "t"
      ? pass("ฐานข้อมูล: ส่งกลับโอนแล้วจริง · ระบุใหม่ว่าไม่ใช้อะไหล่ · ใบยกเลิกไม่มีวันนัด · อะไหล่นอกสโตร์")
      : fail("ประวัติ/ข้อมูลของใบที่เตรียมไม่ตรง");

    // ── จอแคบ (420) — ใบเสนอราคา ──
    await open(Q.code);
    const narrow = await readBar();
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-0-narrow.png") });
    narrow && narrow.over <= 1 ? pass("จอแคบ แถบขั้นตอนพอดีจอ ไม่ต้องเลื่อนซ้ายขวา") : fail(`แถบล้น ${narrow && narrow.over}px`);
    const bar0 = page.locator('[aria-label="ขั้นตอนงาน"]');
    (await bar0.getByText("เช็คอะไหล่", { exact: true }).locator("visible=true").count()) > 0 &&
    (await bar0.getByText("นัดวันเข้า", { exact: true }).count()) === 0
      ? pass("จอแคบ เห็นชื่อขั้นปัจจุบัน (เช็คอะไหล่) ชื่อขั้นอื่นซ่อน")
      : fail("จอแคบ ชื่อขั้นไม่ตรงที่ควร");

    // ── จอคอม ──
    await page.setViewportSize({ width: 1400, height: 1100 });
    await open(Q.code);
    const q = await readBar();
    console.log("  ใบเสนอราคา:", show(q));
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-1-quote.png") });
    same(q.items.map((i) => i.label), [
      "ระบุอะไหล่แล้ว", "เช็คอะไหล่", "ส่งใบเสนอราคา", "แนบบิลรับเงิน", "นัดวันเข้า", "เบิกอะไหล่", "คอนเฟิร์มลูกค้า", "ปล่อยงาน", "เข้างาน/ปิดงาน",
    ])
      ? pass("ใบเสนอราคา 9 ขั้น: เช็คอะไหล่ → เสนอราคา → รับเงิน → นัดวัน → เบิกอะไหล่ → คอนเฟิร์มลูกค้า → ปล่อยงาน")
      : fail(`ลำดับใบเสนอราคา: ${show(q)}`);
    q.items[1].state === "now" && same(q.head, [2, 9]) ? pass("ขั้นปัจจุบัน: เช็คอะไหล่ (ขั้นที่ 2 จาก 9)") : fail(`ขั้นปัจจุบัน: ${JSON.stringify(q.head)} ${show(q)}`);

    await open(N.code);
    const n = await readBar();
    console.log("  ใบทั่วไป:", show(n));
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-2-noquote.png") });
    same(n.items.map((i) => i.label), STEP7) && !n.items.some((i) => i.skip)
      ? pass("ใบไม่เสนอราคา 7 ขั้น ไม่มีขั้นเสนอราคา/รับเงิน และไม่มีปุ่ม \"ข้าม\"")
      : fail(`ใบไม่เสนอราคา: ${show(n)}`);
    same(n.items.map((i) => i.state), ["done", "done", "done", "now", "future", "future", "future"]) && same(n.head, [4, 7])
      ? pass("ขั้นเบิก: นัดวันแล้ว ✓ → เบิกอะไหล่ (ขั้นที่ 4 จาก 7) → คอนเฟิร์มลูกค้ายังไม่ถึง")
      : fail(`สถานะขั้น: ${JSON.stringify(n.head)} ${show(n)}`);
    n.sub === null && n.track === null ? pass("คลัง 94 ไม่มีขั้นย่อยโอน · ไม่ได้ตรวจหน้างานไม่มีรอบตรวจ") : fail(`ขั้นย่อย/รอบตรวจเกินมา: ${n.sub} ${n.track}`);
    (await vis("แอดมิน · เบิกอะไหล่ (คลัง 94)").count()) > 0 ? pass("ป้ายสถานะยังเป็นชื่อเต็ม แอดมิน · เบิกอะไหล่ (คลัง 94)") : fail("ป้ายสถานะไม่ตรง");

    await open(T.code);
    const t = await readBar();
    console.log("  ใบโอน:", show(t), "· ขั้นย่อย:", (t.sub || []).join(" "));
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-3-transfer.png") });
    same(t.items.map((i) => i.label), STEP7) && t.items[3].state === "now"
      ? pass("ใบโอน: โอนไม่ได้เป็นขั้นหลัก แถบยัง 7 ขั้น ขั้นปัจจุบันคือเบิกอะไหล่")
      : fail(`ใบโอน: ${show(t)}`);
    t.sub && t.sub.includes("● เบิก + สั่งโอน") && t.sub.includes("○ รอของถึง") && t.sub.includes("○ เบิกส่งมอบ")
      ? pass("ขั้นย่อยใต้เบิกอะไหล่: ● เบิก + สั่งโอน · ○ รอของถึง · ○ เบิกส่งมอบ")
      : fail(`ขั้นย่อย: ${t.sub && t.sub.join(" | ")}`);
    // โอนครบจริง (เบิก+สั่งโอน → ของถึงคลัง 94 → แอดมินเบิกส่งมอบ) — ติ๊กครบสามขั้นเพราะเกิดขึ้นจริงทุกขั้น
    await fx.call(fx.supervisor(), "POST", `/work-orders/${T.id}/parts-transfer`, {
      results: [{ sparePartId: T.pid, fromWarehouse: "คลังภูเก็ต", transferReqNo: `TR-WEB-${T.id}`, toWarehouse: "คลังลาดพร้าว 94", transferNo: `TN-WEB-${T.id}` }],
    });
    await fx.call(fx.supervisor(), "POST", `/work-orders/${T.id}/parts-transfer/arrived`, {});
    await fx.issue(T.id);
    st(T.id) === "AWAITING_CONFIRM|PENDING" &&
    fx.sql(`select string_agg(action, ',' order by id) from "WorkOrderLog" where "workOrderId"=${T.id} and action in ('TRANSFER_REQUESTED','TRANSFER_ARRIVED')`) === "TRANSFER_REQUESTED,TRANSFER_ARRIVED"
      ? pass("ใบโอน: สั่งโอน → ของถึง → แอดมินเบิก → คอนเฟิร์มลูกค้า (ฐานข้อมูล)")
      : fail(`ใบโอนหลังโอนครบ: ${st(T.id)}`);
    await open(T.code);
    const t2 = await readBar();
    console.log("  ใบโอนครบ:", show(t2), "· ขั้นย่อย:", (t2.sub || []).join(" "));
    t2.items[3] && t2.items[3].state === "done" && t2.sub && same(t2.sub, ["เบิกอะไหล่ · โอนจากคลังอื่น:", "✓ เบิก + สั่งโอน", "✓ รอของถึง", "✓ เบิกส่งมอบ"])
      ? pass("โอนครบแล้ว: เบิกอะไหล่แล้ว ✓ · ขั้นย่อย ✓ เบิก + สั่งโอน · ✓ รอของถึง · ✓ เบิกส่งมอบ")
      : fail(`ใบโอนครบ: ${show(t2)} · ${t2.sub && t2.sub.join(" | ")}`);

    // เบิกคลังอื่นไม่โอน — ไม่มีขั้นย่อยโอน (ไม่ได้สั่งโอน/รอของ) · คนทำขั้นเบิกบอกว่าหัวหน้าภาคเบิกคลังอื่น
    await open(K.code);
    const k = await readBar();
    console.log("  ใบเบิกคลังอื่น:", show(k));
    const kNow = k.items.find((x) => x.state === "now");
    same(k.items.map((x) => x.label), STEP7) && kNow && kNow.num === 4 && same(k.head, [4, 7]) && k.sub === null
      ? pass("เบิกคลังอื่นไม่โอน: ขั้นที่ 4 เบิกอะไหล่ (ทำอยู่) ไม่มีขั้นย่อยสั่งโอน/รอของถึง")
      : fail(`ใบเบิกคลังอื่น: ${JSON.stringify(k.head)} ${show(k)} · ขั้นย่อย ${k.sub && k.sub.join(" | ")}`);
    kNow && kNow.text.includes("หัวหน้าภาค · เบิกคลังอื่น") && kNow.aria === "ขั้น 4 เบิกอะไหล่ · ทำอยู่"
      ? pass("ขั้นเบิกบอกคนทำ: หัวหน้าภาค · เบิกคลังอื่น · ชื่อขั้น \"ขั้น 4 เบิกอะไหล่ · ทำอยู่\"")
      : fail(`คนทำขั้นเบิก: ${kNow && kNow.text} · ${kNow && kNow.aria}`);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${K.id}/parts-pickup`, { results: [{ sparePartId: K.pid, warehouse: "คลังภูเก็ต", requisitionNo: `RQ-PK-${K.id}` }] });
    st(K.id) === "AWAITING_CONFIRM|PENDING" &&
    fx.sql(`select count(*) from "WorkOrderLog" where "workOrderId"=${K.id} and action in ('TRANSFER_REQUESTED','TRANSFER_ARRIVED')`) === "0"
      ? pass("หัวหน้าภาคเบิกคลังอื่นแล้ว → คอนเฟิร์มลูกค้า · ไม่มีประวัติโอน (ฐานข้อมูล)")
      : fail(`หลังเบิกคลังอื่น: ${st(K.id)}`);
    await open(K.code);
    const k2 = await readBar();
    console.log("  ใบเบิกคลังอื่น (เบิกแล้ว):", show(k2));
    same(k2.items.map((x) => x.state), ["done", "done", "done", "done", "now", "future", "future"]) && k2.sub === null
      ? pass("เบิกคลังอื่นเสร็จ: เบิกอะไหล่แล้ว ✓ ไม่มีขั้นย่อย \"สั่งโอน\" ติ๊กทั้งที่ไม่ได้โอน")
      : fail(`ใบเบิกคลังอื่นหลังเบิก: ${show(k2)} · ขั้นย่อย ${k2.sub && k2.sub.join(" | ")}`);

    // ส่งกลับแล้วแอดมินเบิกคลัง 94 — การโอนรอบที่ถูกส่งกลับไม่ได้เกิดขึ้น ต้องไม่มีขั้นย่อยติ๊ก
    await open(B.code);
    const b = await readBar();
    console.log("  ใบส่งกลับแล้วเบิก 94:", show(b));
    b.items[3] && b.items[3].state === "done" && b.items[4].state === "now" && b.sub === null
      ? pass("โอนถูกส่งกลับ แล้วแอดมินเบิกคลัง 94: เบิกอะไหล่แล้ว ✓ ไม่มีขั้นย่อยโอนที่ไม่ได้เกิด")
      : fail(`ใบส่งกลับ: ${show(b)} · ขั้นย่อย ${b.sub && b.sub.join(" | ")}`);

    await open(I.code);
    const i = await readBar();
    console.log("  ใบตรวจหน้างาน:", show(i), "· รอบตรวจ:", (i.track || []).join(" "));
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-4-inspect.png") });
    i.track && i.track.includes("นัดร้าน") && i.track.includes("ส่งช่างตรวจ") && i.track.includes("ตรวจหน้างาน")
      ? pass("รอบตรวจหน้างานเป็นแถบแยกเหนือแถบหลัก: นัดร้าน · ส่งช่างตรวจ · ตรวจหน้างาน")
      : fail(`รอบตรวจ: ${i.track && i.track.join(" | ")}`);
    i.items[0] && i.items[0].state === "loop" && i.items[0].label === "ระบุอะไหล่" && !i.items.some((x) => x.state === "done")
      ? pass("ระหว่างตรวจ ขั้น 1 ไม่ติ๊ก (↻ ระบุอะไหล่) และยังไม่มีขั้นไหนติ๊ก")
      : fail(`ขั้น 1 ระหว่างตรวจ: ${show(i)}`);
    (await vis("ตรวจหน้างาน (ย่อย 1/3) ก่อนขั้นที่ 1", false).count()) > 0 ? pass("หัวการ์ดบอก ตรวจหน้างาน (ย่อย 1/3) ก่อนขั้นที่ 1") : fail("หัวการ์ดไม่บอกรอบตรวจ");
    // ส่งตรวจผิดใบ — ขั้น 1 ยังไม่ติ๊ก (↻) แต่ใบผ่านขั้นระบุอะไหล่มาแล้วจริง ต้องย้อนกลับไปได้
    if ((await vis("ย้อนขั้นตอน").count()) > 0) {
      await vis("ย้อนขั้นตอน").first().click();
      await page.waitForTimeout(1200);
      const back = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="ย้อนไป "]')].map((n) => n.getAttribute("aria-label")));
      back.some((x) => x.includes("ระบุอะไหล่"))
        ? pass("ใบที่รอนัดร้านตรวจ: ย้อนขั้นตอนกลับไประบุอะไหล่ได้")
        : fail(`ตัวเลือกย้อนขั้น: ${back.join(" | ")}`);
      await vis("ยกเลิก").last().click();
      await page.waitForTimeout(600);
    } else fail("ใบที่รอนัดร้านตรวจไม่มีปุ่มย้อนขั้นตอน");

    await open(P.code);
    const p = await readBar();
    console.log("  ใบไม่ใช้อะไหล่:", show(p));
    same(p.items.map((x) => x.label), ["ระบุ: ไม่ใช้อะไหล่", "นัดวันเข้า", "คอนเฟิร์มลูกค้า", "ปล่อยงาน", "เข้างาน/ปิดงาน"]) && same(p.head, [2, 5])
      ? pass("ใบไม่ใช้อะไหล่ 5 ขั้น ไม่มีเช็ค/เบิก · ขั้นปัจจุบันนัดวันเข้า (2 จาก 5)")
      : fail(`ใบไม่ใช้อะไหล่: ${JSON.stringify(p.head)} ${show(p)}`);

    await open(O.code);
    const o = await readBar();
    console.log("  ใบคอนเฟิร์มก่อนเบิก:", show(o));
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-5-confirm-first.png") });
    same(o.items.map((x) => x.label), ["ระบุอะไหล่แล้ว", "เช็คอะไหล่แล้ว", "นัดวันแล้ว", "ลูกค้าคอนเฟิร์มแล้ว", "เบิกอะไหล่", "ปล่อยงาน", "เข้างาน/ปิดงาน"]) &&
    o.items[4].state === "now" && !o.items.some((x) => x.skip)
      ? pass("ใบที่คอนเฟิร์มก่อนเบิก: ลูกค้าคอนเฟิร์มแล้ว ✓ อยู่ก่อนเบิกอะไหล่ (ขั้นปัจจุบัน) ไม่ขึ้นว่าข้าม")
      : fail(`ใบคอนเฟิร์มก่อนเบิก: ${show(o)}`);

    // ย้อนไประบุใหม่ว่าไม่ใช้อะไหล่ — ขั้นเช็ค/เบิกของรอบก่อนไม่โผล่มาติ๊ก
    await open(R.code);
    const r = await readBar();
    console.log("  ใบย้อนไปไม่ใช้อะไหล่:", show(r));
    same(r.items.map((x) => x.label), ["ระบุ: ไม่ใช้อะไหล่", "นัดวันแล้ว", "คอนเฟิร์มลูกค้า", "ปล่อยงาน", "เข้างาน/ปิดงาน"]) && same(r.head, [3, 5])
      ? pass("ย้อนไประบุใหม่ว่าไม่ใช้อะไหล่: 5 ขั้น ไม่มีเช็ค/เบิกของรอบก่อน · ขั้นที่ 3 จาก 5")
      : fail(`ใบย้อนไปไม่ใช้อะไหล่: ${JSON.stringify(r.head)} ${show(r)}`);

    // ยกเลิกตอนค้างเบิกโดยยังไม่มีวัน — ไม่เคยนัด ขั้นนัดวันต้องไม่ติ๊ก
    await open(X.code);
    const x = await readBar();
    console.log("  ใบยกเลิก (ไม่มีวัน):", show(x));
    const xSched = x.items.find((i) => /^ขั้น \d+ นัดวันเข้า · /.test(i.aria));
    xSched && xSched.state !== "done" && !x.items.some((i) => i.label === "นัดวันแล้ว")
      ? pass("ใบยกเลิกที่ยังไม่มีวันนัด: ขั้นนัดวันไม่ติ๊ก")
      : fail(`ใบยกเลิก: ${show(x)}`);

    // ของนอกสโตร์เบิกแล้ว ถึงขั้นคอนเฟิร์ม — ฟอร์มคอนเฟิร์มออกหน้างานปกติ ไม่ใช่ข้อความของใบเก่าที่ยังไม่เบิก
    await open(F.code);
    await vis("คอนเฟิร์มลูกค้า").last().click();
    await page.waitForTimeout(1500);
    (await vis(`คอนเฟิร์มออกหน้างาน · ${F.code}`, false).count()) > 0 &&
    (await vis("ส่งให้หัวหน้าภาคปล่อยงาน", false).count()) > 0 &&
    (await vis("ใบนี้นัดก่อนเปลี่ยนลำดับ", false).count()) === 0
      ? pass("ของนอกสโตร์เบิกแล้ว: ฟอร์ม คอนเฟิร์มออกหน้างาน → ส่งให้หัวหน้าภาคปล่อยงาน (ไม่ใช่ข้อความใบเก่า)")
      : fail("ใบของนอกสโตร์ขึ้นฟอร์มคอนเฟิร์มของใบเก่า");
    await page.screenshot({ path: path.join(DIR, "so-6-offcatalog-confirm.png") });
    await vis("ยกเลิก").last().click();
    await page.waitForTimeout(600);

    // ย้อนกลับไปนัดวันเข้า (ร้านขอเปลี่ยนทีม) — ของนอกสโตร์เบิกไปแล้ว ขั้นเบิกที่อยู่ข้างหน้าทำแล้วจริง
    await fx.call(fx.A, "POST", `/work-orders/${F.id}/rollback`, { toStage: "PARTS_CHECKED", reason: "ร้านขอเปลี่ยนทีม (เทสต์)" });
    const fd = await fx.call(fx.A, "GET", `/work-orders/${F.id}`);
    st(F.id).startsWith("PARTS_CHECKED|") && fd.issueLeft === false
      ? pass("ย้อนไปนัดวันเข้า (ฐานข้อมูล) · เซิร์ฟเวอร์บอกว่าไม่มีของต้องเบิกแล้ว (issueLeft = false)")
      : fail(`ใบของนอกสโตร์หลังย้อน: ${st(F.id)} · issueLeft=${fd.issueLeft}`);
    await open(F.code);
    const f = await readBar();
    console.log("  ใบของนอกสโตร์ย้อนไปนัดวัน:", show(f));
    const fNow = f.items.find((i) => i.state === "now");
    const fIssue = f.items.find((i) => /^ขั้น \d+ เบิกอะไหล่ · /.test(i.aria));
    fNow && /^ขั้น \d+ นัดวันเข้า · ทำอยู่$/.test(fNow.aria) && fIssue && fIssue.state === "done" && fIssue.label === "เบิกอะไหล่แล้ว" && fIssue.num === fNow.num + 1
      ? pass("แถบ: นัดวันเข้า (ทำอยู่) → เบิกอะไหล่แล้ว ✓ ล่วงหน้า (ตาม issueLeft ของเซิร์ฟเวอร์)")
      : fail(`แถบใบของนอกสโตร์หลังย้อน: ${show(f)}`);
    await page.locator('[aria-label="ขั้นตอนงาน"]').screenshot({ path: path.join(DIR, "so-7-offcatalog-rollback.png") });
    // แถบต้องตรงกับที่ /assign ทำจริง — นัดแล้วใบไปคอนเฟิร์มลูกค้าเลย ไม่ผ่านขั้นเบิก
    await fx.schedule(F.id, visitDay(31));
    st(F.id) === "AWAITING_CONFIRM|PENDING"
      ? pass("นัดวันแล้วใบไปคอนเฟิร์มลูกค้าเลย ไม่กลับไปเบิก (ฐานข้อมูล) — ตรงกับแถบ")
      : fail(`หลังนัดใบของนอกสโตร์: ${st(F.id)}`);
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "so-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${String(e).split("\n")[0].slice(0, 300)}`);
  } finally {
    if (fx) {
      await fx.cleanup();
      // อะไหล่นอกสโตร์ถูกสร้างเป็นแถวใน SparePart ตอนระบุ — ลบใบแล้วแถวนี้ยังค้าง ลบเฉพาะที่ไม่มีใบไหนใช้แล้ว
      fx.sql(`delete from "SparePart" s where s."offCatalog" and s.name like 'สายพานนอกสโตร์ทดสอบ %' and not exists (select 1 from "WorkOrderPart" p where p."sparePartId"=s.id)`);
    }
    errors.length ? fail(`error บนหน้า: ${errors[0].slice(0, 200)}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
