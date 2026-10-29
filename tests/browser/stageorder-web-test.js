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
   * ยกเว้นรอบตรวจ ขั้นย่อย และรายการขั้นที่ข้าม · สถานะ: วงที่มีเลข = ยังไม่ทำ/กำลังทำ (เทียบกับ "ขั้นที่ k จาก N")
   * วงที่ไม่มีเลข = ติ๊กแล้ว · ↻ = ขั้น 1 ระหว่างตรวจหน้างาน
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
          // ไอคอนติ๊กเป็นตัวอักษรในช่วง Private Use ของฟอนต์ไอคอน
          const label = ls.find((t) => !/^\d+$/.test(t) && !/^[-]$/.test(t) && t !== "↻" && t !== "!");
          const num = ls.find((t) => /^\d+$/.test(t));
          const state = ls.includes("↻") ? "loop" : num == null ? "done" : Number(num) === head[0] ? "now" : "future";
          return { aria, label, num: num == null ? null : Number(num), state, text: ls.join(" ") };
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
    const board = fx.part("SP-BOARD"), belt = fx.part("SP-BELT");
    const st = (id) => fx.sql(`select status||'|'||coalesce("appointmentStatus",'-') from "WorkOrder" where id=${id}`);
    const team = fx.sql(`select zone from "Branch" where code='C0006'`);
    // ใบที่ต้องเสนอราคา = สาขาแฟรนไชส์ (D) ที่เปิดเกิน 3 ปี หมดประกัน
    const dOld = fx.sql(`select code from "Branch" where code like 'D%' and "cancelledAt" is null and "openedAt" < now() - interval '3 years' order by "openedAt" limit 1`);
    const Q = await fx.workOrder(dOld, [{ sparePartId: board, quantity: 1 }]);
    // ใบทั่วไป: เช็คแล้วมีที่คลัง 94 → หัวหน้าภาคนัดวัน → ถึงขั้นเบิก (ลูกค้ายังไม่คอนเฟิร์ม)
    const N = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
    await fx.source(N.id);
    await fx.schedule(N.id, visitDay(30));
    // ใบโอน: ของอยู่คลังภูเก็ต → นัดวัน → แอดมินส่งให้หัวหน้าภาคเบิก+โอน
    const T = await fx.workOrder("C0006", [{ sparePartId: belt, quantity: 1 }]);
    await fx.source(T.id, "คลังภูเก็ต");
    await fx.schedule(T.id, visitDay(30));
    await fx.call(fx.A, "POST", `/work-orders/${T.id}/parts-check`, { results: [{ sparePartId: belt, inStock: true, warehouse: "คลังภูเก็ต" }] });
    // ใบตรวจหน้างาน: หัวหน้าภาคส่งตรวจพร้อมวัน → รอแอดมินนัดร้าน
    const I = await fx.workOrder("C0006", null);
    await fx.call(fx.supervisor(), "POST", `/work-orders/${I.id}/inspect-request`, { team, scheduledAt: visitDay(20) });
    // ใบไม่ใช้อะไหล่ → ไปนัดวันเลย
    const P = await fx.workOrder("C0006", []);
    // ใบที่คอนเฟิร์มลูกค้าก่อนเบิก — ค้างอยู่ที่ขั้นคอนเฟิร์มตอนสลับลำดับ (ไม่ถูกย้ายโดย migration) แล้วแอดมินคอนเฟิร์ม
    const O = await fx.workOrder("C0006", [{ sparePartId: board, quantity: 1 }]);
    await fx.source(O.id);
    await fx.schedule(O.id, visitDay(30));
    fx.sql(`update "WorkOrder" set status='AWAITING_CONFIRM' where id=${O.id}`);
    await fx.confirm(O.id);

    const ready = [Q, N, T, I, P, O].map((x) => st(x.id)).join(",");
    ready === "PARTS_SOURCING|-,PARTS_REQUESTED|PENDING,PARTS_TRANSFER|PENDING,INSPECT_CONFIRM|PENDING,PARTS_CHECKED|-,PARTS_REQUESTED|CONFIRMED"
      ? pass("เตรียมใบ (ฐานข้อมูล): เช็คอะไหล่ · เบิก · เบิก+โอน · นัดร้านตรวจ · นัดวัน · เบิก (คอนเฟิร์มแล้ว)")
      : fail(`เตรียมใบ: ${ready}`);

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
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "so-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${String(e).split("\n")[0].slice(0, 300)}`);
  } finally {
    if (fx) await fx.cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0].slice(0, 200)}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
