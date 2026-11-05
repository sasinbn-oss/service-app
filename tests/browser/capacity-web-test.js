// ทดสอบ: ขนาดเครื่องในฟอร์ม · เติมของเดิมให้ · เปิดจากกระดานแล้วผู้ติดต่อไม่หาย · ทางกระดานล็อกยี่ห้อที่รู้แล้ว
//   · อะไหล่ที่รอบนกระดานอยู่ในไฟล์ยี่ห้ออื่น (บันทึกข้ามยี่ห้อไว้ — เจ้าของงานเลือก 3 พ.ย. 69) → กด "เปิดใบงาน" แล้วถาม
//     "ใช้อะไหล่ข้ามยี่ห้อ?" → "ใช้ข้ามยี่ห้อ" → ใบเปิดพร้อมอะไหล่นั้น + ประวัติข้ามยี่ห้อ (ฐานข้อมูล)
// ต้องมี DATABASE_URL — ทางกระดานสร้างเคสเครื่องดับของ W55 และอะไหล่ทดสอบ CAPX… เองแล้วลบตอนจบ
const { chromium } = require("playwright");
const { setup } = require("./fixture");
const { confirmDuplicate } = require("./dup");
const { attachPhoto } = require("./photo");
const path = require("path");
const DIR = __dirname;

(async () => {
  if (!process.env.DATABASE_URL) {
    console.log("FAIL ต้องมี DATABASE_URL (set -a && . backend/.env && set +a) — ทางกระดานสร้างเคสเครื่องดับเอง");
    process.exit(1);
  }
  const fx = await setup();
  let outageId = null;
  // ใบของช่วง "เปิดเอง" เปิดจากฟอร์มจริงโดยไม่มีเคส — ขั้นลบตาม outageId ตอนจบมองไม่เห็น เดิมค้างใบละรอบ
  // จดเลขใบล่าสุดก่อนกดเปิด แล้วหาด้วยอาการ + สาขา เฉพาะใบหลังเลขนั้น — ใบอาการเดียวกันที่ค้างจากรอบก่อน ๆ ไม่ใช่ของรอบนี้
  // ขอบเขตเป็นเลขใบแทนเวลา — เลขใบออกจากฐานข้อมูลที่เดียว ไม่ต้องสงสัยว่าเวลาที่จดกับ createdAt มาจากนาฬิกาเครื่องเดียวกันไหม
  // (เครื่องที่รันเทสต์ · backend · ฐานข้อมูลคนละ region เป็นคนละเครื่องกันได้)
  const MANUAL_SYMPTOM = "น้ำไม่เข้า ทดสอบขนาด";
  let manualFrom = null;
  const manualOrders = () =>
    fx
      .sql(`select id from "WorkOrder" where id > ${manualFrom} and symptom='${MANUAL_SYMPTOM}'
            and "branchId"=(select id from "Branch" where code='C0006')`)
      .split("\n")
      .filter(Boolean);
  // อะไหล่ข้ามยี่ห้อที่รอบนกระดาน (ใส่ทาง SQL) — ลบตอนจบหลังลบใบและเคส
  const crossCode = `CAPX${process.pid}`;
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  // PLAYWRIGHT_CHROMIUM ตั้งเองได้ถ้าเครื่องเก็บไว้ที่อื่น
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
  // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เทสต์นี้กดรายการในกลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
  await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const seen = (t, exact = false) =>
    page.getByText(t, { exact }).locator("visible=true").count();
  // ใบงานกับฟอร์มเปิดเป็นหน้าต่างลอย หน้ารายการข้างหลังยังมองเห็นอยู่ใต้ฉากมืด
  // ข้อความเดียวกันจึงมีทั้งข้างหน้าและข้างหลัง — เลือกตัวที่อยู่บนสุดจริง ๆ ตรงจุดนั้น
  // (ไม่งั้น click แบบสำรองด้านล่างจะไปกดรายการข้างหลังทะลุฉากมืด)
  const topmost = async (loc) => {
    const n = await loc.count();
    for (let i = n - 1; i >= 0; i--) {
      const hit = await loc.nth(i).evaluate((node) => {
        const r = node.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!at && (node.contains(at) || at.contains(node));
      }).catch(() => false);
      if (hit) return loc.nth(i);
    }
    return loc.first();
  };
  const tap = async (t, exact = true) => {
    const el = await topmost(page.getByText(t, { exact }).locator("visible=true"));
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click().catch(async () => {
      await el.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
  };

  const submitForm = async () => {
    const b = page.getByText("เปิดใบงาน", { exact: true }).locator("visible=true").last();
    await b.scrollIntoViewIfNeeded().catch(() => {});
    await b.click().catch(async () => {
      await b.evaluate((n) => (n.closest("[tabindex]") || n).click());
    });
    // สาขามีใบค้างอยู่ — ป๊อปอัพยืนยันเปิดซ้ำ (ต.ค. 69)
    await confirmDuplicate(page);
  };

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);

    // ════ เปิดเอง ════
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await tap("ใบงาน");
    await page.waitForTimeout(2500);
    await tap("เพิ่มใบงาน", false);
    await page.waitForTimeout(2500);

    const search = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search.click();
    await search.type("C0006", { delay: 70 });
    await page.waitForTimeout(2400);
    await tap("ถนนอุตรกิจ", false);
    await page.waitForTimeout(1800);

    (await seen("ขนาดเครื่อง", false)) > 0 ? pass("มีช่องขนาดเครื่อง") : fail("ไม่มีช่องขนาดเครื่อง");
    for (const c of ["10 kg", "13 kg", "25 kg"]) {
      (await seen(c, true)) > 0 ? pass(`มีขนาด ${c}`) : fail(`ไม่มีขนาด ${c}`);
    }
    (await seen("(ไม่บังคับ)", false)) > 0 ? pass("บอกว่าไม่บังคับ") : fail("ไม่บอกว่าไม่บังคับ");

    // พิมพ์เองได้เมื่อขนาดไม่อยู่ในรายการ
    const others = page.getByText("อื่นๆ", { exact: true }).locator("visible=true");
    await others.last().click();
    await page.waitForTimeout(800);
    (await page.getByPlaceholder("พิมพ์ขนาดเป็นกิโลกรัม เช่น 17").locator("visible=true").count()) > 0
      ? pass("เลือกอื่นๆ แล้วพิมพ์ขนาดเองได้")
      : fail("ไม่มีช่องพิมพ์ขนาดเอง");
    const otherBox = page.getByPlaceholder("พิมพ์ขนาดเป็นกิโลกรัม เช่น 17").locator("visible=true").first();
    await otherBox.type("abc17x", { delay: 40 });
    await page.waitForTimeout(600);
    (await otherBox.inputValue()) === "17"
      ? pass("ช่องขนาดรับแต่ตัวเลข")
      : fail(`ช่องขนาดรับตัวอักษรด้วย: ${await otherBox.inputValue()}`);

    // กลับไปเลือก 13 kg จากรายการ
    await tap("13 kg");
    await page.waitForTimeout(700);
    (await page.getByPlaceholder("พิมพ์ขนาดเป็นกิโลกรัม เช่น 17").locator("visible=true").count()) === 0
      ? pass("เลือกจากรายการแล้วช่องพิมพ์เองหายไป")
      : fail("ช่องพิมพ์เองยังอยู่");

    // กดซ้ำ = เอาออก เพราะไม่บังคับ
    await tap("13 kg");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(DIR, "cap-1-form.png") });
    await tap("13 kg");
    await page.waitForTimeout(600);

    const codeBox = page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first();
    await codeBox.fill("W55");
    await page.waitForTimeout(1500);
    // W55 ได้ยี่ห้อ Huebsch ตั้งแต่รอบแรกที่รัน (ระบบจำยี่ห้อไว้กับเครื่อง) — รอบต่อ ๆ ไปขึ้นเป็นปุ่มล็อก ไม่มีปุ่มให้กด
    const lockedAlready = (await seen("ยี่ห้อในระบบของเครื่อง W55", false)) > 0;
    if (!lockedAlready) await tap("Huebsch");
    await page.waitForTimeout(500);
    // แอดมินไม่มีช่องอะไหล่ในฟอร์มเปิดใบงาน (เฉพาะช่าง/Senior ช่าง — เลือกอะไหล่ตามไฟล์ยี่ห้อ ก้อน 8)
    (await seen("อะไหล่ที่ต้องใช้ (ไม่บังคับ)", true)) === 0
      ? pass("แอดมิน: ไม่มีช่องอะไหล่ที่ต้องใช้ในฟอร์มเปิดใบงาน")
      : fail("แอดมินเห็นช่องอะไหล่ที่ต้องใช้ ทั้งที่เป็นช่องของช่าง");
    const symptom = page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first();
    await symptom.fill(MANUAL_SYMPTOM);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "cap-2-filled.png") });
    // แอดมินไม่บังคับรูปหน้างาน (เจ้าของงานขอ ต.ค. 69 — ตำแหน่งอื่นยังบังคับ ดู admin-photo-web-test) · ยังแนบได้ตามปกติ
    (await seen("ยังบันทึกไม่ได้", false)) === 0 && (await seen("แอดมินไม่บังคับ", true)) > 0
      ? pass("แอดมิน: ยังไม่แนบรูปหน้างานก็ไม่ล็อก มีป้าย \"แอดมินไม่บังคับ\"")
      : fail("แอดมินถูกล็อกเรื่องรูป หรือไม่มีป้าย");
    await attachPhoto(page);
    (await seen("ยังบันทึกไม่ได้", false)) === 0 ? pass("แนบรูปแล้วยังเปิดได้") : fail("แนบรูปแล้วกลับล็อก");
    manualFrom = Number(fx.sql(`select coalesce(max(id),0) from "WorkOrder"`));
    await submitForm();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(DIR, "cap-3-detail.png") });
    (await seen("WO-", false)) > 0
      ? pass("บันทึกแล้วไปหน้ารายละเอียดใบงาน")
      : fail("ยังค้างอยู่ที่ฟอร์ม ไม่ได้บันทึก");
    // ยืนยันที่ฐานข้อมูล — "WO-" บนจออาจเป็นใบเก่าในรายการข้างหลังหน้าต่างลอย · เลขใบนี้คือใบที่ต้องลบตอนจบ
    const manualIds = manualOrders();
    manualIds.length === 1
      ? pass("ฐานข้อมูล: เปิดเองได้ใบงานหนึ่งใบที่ C0006")
      : fail(`ฐานข้อมูล: ใบที่เปิดเองมี ${manualIds.length} ใบ (ควรเป็น 1)`);
    (await seen("ขนาดเครื่อง (ไม่บังคับ)", true)) === 0 && (await seen("13 kg", false)) > 0
      ? pass("ใบงานแสดงขนาดเครื่อง")
      : fail("ใบงานไม่แสดงขนาดเครื่อง");

    // ════ เติมของเดิมให้รอบถัดไป ════
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    // แท็บล่าง "ใบงาน" — แอดมินเปิดมาเจอบอร์ดแผนงาน ไม่ใช่หน้าหลักที่มีการ์ดใบงานซ่อม
    await tap("ใบงาน");
    await page.waitForTimeout(2500);
    await tap("เพิ่มใบงาน", false);
    await page.waitForTimeout(2500);
    const search2 = page.getByPlaceholder("ค้นรหัสหรือชื่อสาขา").locator("visible=true").first();
    await search2.click();
    await search2.type("C0006", { delay: 70 });
    await page.waitForTimeout(2400);
    await tap("ถนนอุตรกิจ", false);
    await page.waitForTimeout(1800);
    const codeBox2 = page.getByLabel("หมายเลขเครื่องที่ 1").locator("visible=true").first();
    await codeBox2.fill("W55");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(DIR, "cap-4-prefill.png") });
    // ยี่ห้อที่รู้แล้วไม่เติมเป็นปุ่มที่กดเปลี่ยนได้ — ขึ้นเป็นปุ่มล็อกพร้อมบรรทัดอธิบาย และไม่มีปุ่มยี่ห้อชุดเลือก
    (await seen("ยี่ห้อในระบบของเครื่อง W55", false)) > 0 && (await seen("Oasis(TC)", true)) === 0
      ? pass("พิมพ์รหัสเดิมแล้วยี่ห้อขึ้นเป็นปุ่มล็อก (Huebsch) ไม่มีปุ่มให้เปลี่ยน")
      : fail("ยี่ห้อของเครื่องที่รู้แล้วไม่ล็อก หรือยังมีปุ่มยี่ห้อให้กด");
    const picked = await page.evaluate(() => {
      const hit = [...document.querySelectorAll("*")].filter(
        (n) => n.children.length === 0 && /^(13 kg|Huebsch)$/.test((n.textContent || "").trim())
      );
      return hit.map((n) => {
        let el = n;
        for (let i = 0; i < 6 && el; i += 1, el = el.parentElement) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            return { text: n.textContent.trim(), bg };
          }
        }
        return { text: n.textContent.trim(), bg: null };
      });
    });
    const highlighted = picked.filter((p) => p.bg && !/255, 255, 255/.test(p.bg));
    highlighted.length >= 2
      ? pass("พิมพ์รหัสเดิมแล้วยี่ห้อกับขนาดขึ้นให้เอง")
      : fail(`ไม่ได้เติมให้: ${JSON.stringify(picked)}`);

    // ════ เปิดจากกระดาน ════
    // สร้างเคสเครื่องดับของ W55 เอง — เดิมกดเคสแรกที่มีบนกระดาน วันที่กระดานว่างเทสต์พิมพ์ SKIP แล้วจบเขียว
    // ทั้งที่ทางกระดานไม่ถูกเช็คเลย (ล็อกยี่ห้อของทางกระดานพังได้โดยไม่มีใครรู้)
    // อาการใส่คำเฉพาะของรอบนี้ไว้ค้นบนกระดาน — C0006 อาจมีเคสค้างจากเทสต์อื่น กดแถวแรกอาจได้เคสคนอื่น
    const boardTag = `capweb${Date.now()}`;
    const [w55Id, w55Brand] = fx
      .sql(`select m.id, coalesce(m.brand,'')||'/'||coalesce(m.model,'') from "Machine" m join "Branch" b on b.id=m."branchId" where b.code='C0006' and m.code='W55'`)
      .split("|");
    if (!w55Id) throw new Error("ไม่มีเครื่อง W55 ของ C0006 (ช่วงเปิดเองด้านบนต้องสร้างให้แล้ว)");
    fx.sql(
      `insert into "Outage"(kind,"branchId","machineId","startedAt","lastSeenAt",symptom) select 'MACHINE_OFF',"branchId",id,now()-interval '2 hours',now(),'${boardTag}' from "Machine" where id=${w55Id}`
    );
    outageId = Number(fx.sql(`select id from "Outage" where symptom='${boardTag}'`)) || null;
    if (!outageId) throw new Error("สร้างเคสเครื่องดับทดสอบไม่ได้");
    // อะไหล่ที่รอบนกระดานจากไฟล์ยี่ห้ออื่นของ W55 (Spinz — หรือ Haier ถ้า W55 เป็น Spinz) — แบบที่กระดานบันทึกข้ามยี่ห้อไว้แล้ว
    const w55Make = fx.sql(`select coalesce(nullif(brand,''), model, '') from "Machine" where id=${w55Id}`);
    const crossFile = /spinz|สปิน/i.test(w55Make) ? "Haier" : "Spinz";
    fx.sql(`insert into "SparePart"("partCode",name,"offCatalog","updatedAt") values ('${crossCode}','x ปั๊มข้ามยี่ห้อทดสอบกระดาน',false,now())`);
    fx.sql(`insert into "SparePartBrandFile"("sparePartId",file,source) select id,'${crossFile}','MANUAL' from "SparePart" where "partCode"='${crossCode}'`);
    fx.sql(`insert into "OutagePart"("outageId","sparePartId",quantity) select ${outageId}, id, 1 from "SparePart" where "partCode"='${crossCode}'`);
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    // แอดมินเปิดมาเจอบอร์ดแผนงาน — ไปกระดานผ่านเมนูสามขีดแทนการ์ดในหน้าหลัก
    await page.getByLabel("เปิดเมนู").locator("visible=true").first().click();
    await page.waitForTimeout(800);
    await tap("ติดตามเครื่องเสีย", false);
    await page.waitForTimeout(4000);
    const boardSearch = page.getByLabel("ค้นหาในกระดาน").locator("visible=true").first();
    await boardSearch.fill(boardTag);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(DIR, "cap-5a-board-list.png") });
    const woBtn = page.getByText("สร้างใบงาน", { exact: true }).locator("visible=true");
    if ((await woBtn.count()) === 0) {
      fail("ไม่เจอเคสเครื่องดับที่สร้างไว้ (หรือปุ่มสร้างใบงาน) บนกระดาน");
    } else {
      const btn = woBtn.first();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click().catch(async () => {
        await btn.evaluate((n) => (n.closest("[tabindex]") || n).click());
      });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, "cap-5-board.png") });
      (await seen("สาขามาจากเคส", false)) > 0 || (await seen("ขนาดเครื่อง", false)) > 0
        ? pass("ฟอร์มจากกระดานเปิดได้")
        : fail("ไม่ใช่ฟอร์มจากกระดาน");
      (await seen("ขนาดเครื่อง", false)) > 0
        ? pass("เปิดจากกระดานมีช่องขนาดเครื่อง")
        : fail("เปิดจากกระดานไม่มีช่องขนาด");
      // W55 รู้ยี่ห้อแล้ว (ช่วงเปิดเองด้านบน) — ทางกระดานต้องขึ้นปุ่มล็อกแบบเดียวกับฟอร์มปกติ ไม่ใช่ปุ่มยี่ห้อให้กด
      // ป้าย "(ไม่บังคับ)" กับปุ่มยี่ห้อมาคู่กันเสมอ (ตัดสินจาก lock ตัวเดียวกัน) — ไม่มีป้ายนี้ = ไม่มีปุ่มให้เปลี่ยน
      (await seen("ยี่ห้อในระบบของเครื่อง W55", false)) > 0 &&
      (await seen("ยี่ห้อเครื่อง (ไม่บังคับ)", true)) === 0 &&
      (await seen("ไม่ตรงกับเครื่องจริง? เปิดใบงานแล้วกด", false)) > 0
        ? pass("เปิดจากกระดาน: ยี่ห้อเครื่องที่รู้แล้วขึ้นเป็นปุ่มล็อก + บอกทางแก้ที่หน้าใบงาน")
        : fail("เปิดจากกระดาน: ยี่ห้อของ W55 ไม่ล็อก (ยังมีปุ่มยี่ห้อให้กด) หรือไม่มีบรรทัดบอกทางแก้");
      const cName = page.getByLabel("ชื่อผู้ติดต่อที่สาขา").locator("visible=true").first();
      const cPhone = page.getByLabel("เบอร์ติดต่อสาขา").locator("visible=true").first();
      (await cName.count()) > 0 ? pass("เปิดจากกระดานมีช่องผู้ติดต่อ") : fail("ไม่มีช่องผู้ติดต่อ");
      await cName.fill("คุณทดสอบกระดาน");
      await cPhone.fill("0871112222");
      await tap("18 kg");
      await page.waitForTimeout(500);
      const bs = page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first();
      await bs.fill("ทดสอบเปิดจากกระดาน");
      await page.waitForTimeout(400);
      await attachPhoto(page);
      await submitForm();
      // อะไหล่ที่รอบนกระดานข้ามยี่ห้อ — เซิร์ฟเวอร์ตอบ 400 พร้อมรายการ แอปถามยืนยันครั้งเดียว แล้วส่งใหม่
      const asked = await page
        .getByText("ใช้อะไหล่ข้ามยี่ห้อ?", { exact: true })
        .locator("visible=true")
        .first()
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      const askedPart = (await seen(`${crossCode} x ปั๊มข้ามยี่ห้อทดสอบกระดาน (อยู่ในไฟล์ ${crossFile})`, false)) > 0;
      const before = fx.sql(`select count(*) from "WorkOrder" where "outageId"=${outageId}`);
      if (asked) await tap("ใช้ข้ามยี่ห้อ");
      await page.waitForTimeout(5500);
      asked && askedPart && before === "0"
        ? pass(`เปิดจากกระดานที่มีอะไหล่ข้ามยี่ห้อ (ไฟล์ ${crossFile}): ถาม "ใช้อะไหล่ข้ามยี่ห้อ?" พร้อมรหัสและไฟล์ ก่อนเปิดใบ (ยังไม่เกิดใบ)`)
        : fail(`ไม่ถามยืนยันข้ามยี่ห้อตอนเปิดจากกระดาน: กล่อง=${asked} รหัส=${askedPart} ใบก่อนยืนยัน=${before}`);
      await page.screenshot({ path: path.join(DIR, "cap-6-board-detail.png") });
      (await seen("คุณทดสอบกระดาน", false)) > 0
        ? pass("ผู้ติดต่อที่กรอกจากกระดานไม่หาย")
        : fail("ผู้ติดต่อที่กรอกจากกระดานหายไป");
      (await seen("0871112222", false)) > 0
        ? pass("เบอร์ที่กรอกจากกระดานไม่หาย")
        : fail("เบอร์ที่กรอกจากกระดานหายไป");
      (await seen("WO-", false)) > 0
        ? pass("บันทึกจากกระดานแล้วไปหน้ารายละเอียด")
        : fail("ยังค้างอยู่ที่ฟอร์มกระดาน ไม่ได้บันทึก");
      (await seen("ขนาดเครื่อง (ไม่บังคับ)", true)) === 0 && (await seen("18 kg", false)) > 0
        ? pass("ขนาดที่กรอกจากกระดานถูกบันทึก")
        : fail("ขนาดที่กรอกจากกระดานหายไป");
      // ยืนยันที่ฐานข้อมูล — ข้อความบนจออาจมาจากใบอื่นของสาขาเดียวกัน
      fx.sql(`select count(*) from "WorkOrder" where "outageId"=${outageId}`) === "1"
        ? pass("ฐานข้อมูล: ใบงานผูกกับเคสเครื่องดับที่สร้างไว้")
        : fail("ฐานข้อมูล: ไม่มีใบงานผูกกับเคสที่สร้างไว้ (กดเคสผิดแถว หรือไม่ได้บันทึก)");
      const crossWaiting = fx.sql(
        `select count(*) from "WorkOrderPart" w join "WorkOrder" o on o.id=w."workOrderId" join "SparePart" p on p.id=w."sparePartId"
         where o."outageId"=${outageId} and p."partCode"='${crossCode}' and w.kind='WAITING'`
      );
      const crossLog = fx.sql(
        `select count(*) from "WorkOrderLog" l join "WorkOrder" o on o.id=l."workOrderId"
         where o."outageId"=${outageId} and l.action='CROSS_BRAND_PARTS' and l.note like 'ใช้อะไหล่ข้ามยี่ห้อ (ยืนยันแล้ว): ${crossCode} %'`
      );
      crossWaiting === "1" && crossLog === "1"
        ? pass("ฐานข้อมูล: ใบจากกระดานได้อะไหล่ข้ามยี่ห้อเป็นอะไหล่ที่รอ + ประวัติ \"ใช้อะไหล่ข้ามยี่ห้อ (ยืนยันแล้ว)\"")
        : fail(`ฐานข้อมูล: อะไหล่ข้ามยี่ห้อในใบ=${crossWaiting} ประวัติ=${crossLog}`);
      const w55After = fx.sql(`select coalesce(brand,'')||'/'||coalesce(model,'') from "Machine" where id=${w55Id}`);
      w55After === w55Brand
        ? pass("ฐานข้อมูล: เปิดจากกระดานแล้วยี่ห้อของ W55 ไม่ถูกเขียนทับ")
        : fail(`ฐานข้อมูล: ยี่ห้อของ W55 เปลี่ยนจาก ${w55Brand} เป็น ${w55After}`);
    }

    errors.length === 0 ? pass("ไม่มี error ในหน้า") : fail(`error: ${errors.slice(0, 2).join(" | ")}`);
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "cap-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${e.message}`);
  } finally {
    // ใบที่เปิดเอง — หาใหม่ตรงนี้แทนการใช้เลขที่อ่านหลังกดเปิด เพราะเทสต์อาจพังระหว่างกดเปิดกับตอนอ่าน แล้วใบหลุดอีก
    // ลบผ่าน API ไม่ใช่ SQL เพราะใบนี้มีรูปหน้างานที่อยู่ในถัง — ลบแถวตรง ๆ ไฟล์ค้างในถังโดยไม่มีอะไรชี้ถึง
    if (manualFrom !== null) {
      try {
        for (const id of manualOrders()) await fx.call(fx.A, "DELETE", `/work-orders/${id}`);
      } catch (e) {
        fail(`ลบใบที่เปิดเองไม่ได้ (อาการ "${MANUAL_SYMPTOM}" เลขใบหลัง ${manualFrom}): ${e.message}`);
      }
    }
    // ใบงานที่เปิดจากกระดานลบผ่าน API (ลบรูป/ประวัติให้ครบ) ก่อนลบเคส — ลบเคสก่อน ใบงานหลุดจากเคสแล้วหาไม่เจอ
    if (outageId) {
      try {
        const ids = fx.sql(`select id from "WorkOrder" where "outageId"=${outageId}`).split("\n").filter(Boolean);
        for (const id of ids) await fx.call(fx.A, "DELETE", `/work-orders/${id}`);
        fx.sql(`delete from "Outage" where id=${outageId}`);
      } catch (e) {
        fail(`ลบเคสทดสอบไม่ได้ (Outage id ${outageId}): ${e.message}`);
      }
    }
    try {
      fx.sql(`delete from "SparePart" where "partCode"='${crossCode}'`);
    } catch (e) {
      fail(`ลบอะไหล่ทดสอบ ${crossCode} ไม่ได้: ${e.message}`);
    }
    await fx.cleanup();
    await browser.close();
  }
})();
