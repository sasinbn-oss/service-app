// ทดสอบ: กดเมนูข้างไปหน้าแรกของแท็บ (TAB_ROOTS ใน components/SideMenu.tsx) ต้องถอยกลับหน้าเดิม ไม่ซ้อนหน้าใหม่
//   เดิม (React Navigation 7) ช่างกด ลงทะเบียนใช้รถ → รายการอะไหล่ → "งานของฉันวันนี้" ได้หน้างานของฉันใบที่สองทับบนสุด
//   มีทาง "‹ รายการอะไหล่" ให้กด และหน้าเดิมทุกใบยังโหลด/ถามข้อมูลค้างอยู่ข้างหลัง กดเมนูกี่ครั้งก็งอกเพิ่ม
//
//   นับหน้าที่ค้างในชุดหน้าจากแถบหัวของแต่ละหน้า (☰ + ชื่อหน้า — native-stack บนเว็บวาดทุกหน้าในชุดไว้ในหน้าเว็บ แค่ซ่อน)
//   · งานของฉัน: เหลือใบเดียว เป็นตัวเดิม (ติดป้ายไว้ก่อนแล้วป้ายยังอยู่ = ไม่ถูกสร้างใหม่) · ไม่มีทางย้อน · หน้าที่ซ้อนอยู่หายจากชุด
//   · หน้าหลัก (ไม่ใช่หน้าแรกของชุด): ยังไม่อยู่ในชุด = ถอยกลับหน้าแรกก่อนแล้วค่อยเปิด → "งานของฉัน ›" ไม่ใช่หน้าที่ทิ้งไว้
//     อยู่ในชุดแล้ว = ถอยกลับไปตัวเดิม ไม่มีใบที่สอง
//   · ข้ามแท็บ: แท็บประวัติ (คู่มือ → ประวัติ) · ยืนอยู่แท็บอื่นแล้วกดหน้าแรกของแท็บหน้าหลัก ชุดหน้านั้นก็ต้องถูกล้าง
//   · แอดมิน: ระบบหลังบ้าน (สิทธิ์ผู้ใช้ → ระบบหลังบ้าน) · แผนงาน (ไม่ใช่หน้าแรกของชุดสำหรับแอดมิน) แบบเดียวกับหน้าหลัก
//   · ไม่มี error บนหน้า และไม่มีคำเตือนของ React Navigation ว่าคำสั่งนำทางไม่ถูกจัดการ
// จอ 390×844 (เมนูเลื่อนออก) · ใช้ T001 กับ A001 · ไม่สร้างหรือแก้ข้อมูล กดเฉพาะเมนู
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;
const URL = "http://localhost:8081";

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const check = (ok, m, why) => (ok ? pass(m) : fail(`${m} — ${why}`));
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });

  async function session(code, body) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    // กลุ่มรถ/หน้างาน/เอกสาร/ผู้ดูแลระบบย่อไว้ตั้งแต่แรก — เทสต์กดรายการในกลุ่มพวกนั้น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => {
      try {
        localStorage.setItem("otteri-side-groups", "[]");
      } catch {}
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    // คำสั่งที่ navigator ไหนก็ไม่รับ React Navigation แค่เตือนใน console แล้วเงียบ — ต้องจับตรงนี้ ไม่งั้นผ่านทั้งที่ไม่ได้ล้างอะไร
    page.on("console", (m) => {
      if (m.type() === "error" && /was not handled|couldn't be applied/.test(m.text())) errors.push(m.text().slice(0, 200));
    });
    try {
      await page.goto(URL, { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
      await page.locator('[aria-label="เปิดเมนู"]').locator("visible=true").first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      await body(page);
      check(!errors.length, `${code}: ไม่มี error / คำเตือนการนำทาง`, errors.join(" | "));
      await page.screenshot({ path: path.join(DIR, `menu-root-${code}.png`) });
    } catch (e) {
      fail(`${code}: ${String(e).slice(0, 300)}`);
    } finally {
      await page.close();
    }
  }

  /**
   * ลำดับของปุ่ม ☰ บนหน้าที่เห็นอยู่จริง — แท็บที่ไม่ได้เลือกยังอยู่ในหน้าเว็บและไม่ได้ display:none (สลับแท็บแบบจาง)
   * "มองเห็น" ของ Playwright จึงเจอปุ่มของแท็บอื่นก่อน · ใช้ปุ่มที่จุดกลางของมันกดโดนตัวมันเอง
   */
  const topHead = (page) =>
    page.evaluate(() => {
      const btns = [...document.querySelectorAll('[aria-label="เปิดเมนู"]')];
      return btns.findIndex((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && b.contains(hit);
      });
    });

  /** กดรายการในแผงเมนูเลื่อนออก (ไม่ใช่ปุ่มชื่อเดียวกันในหน้า/แถบล่าง) แล้วรอแผงหุบหาย */
  async function pick(page, label) {
    await page.locator('[aria-label="เปิดเมนู"]').nth(await topHead(page)).click();
    const item = page.locator(`#side-menu-backdrop + div [aria-label="${label}"]`).first();
    await item.waitFor({ state: "visible", timeout: 10000 });
    await item.click();
    await page.locator("#side-menu-backdrop").waitFor({ state: "detached", timeout: 10000 });
    await page.waitForTimeout(1200);
  }

  /**
   * ชื่อหน้าของทุกหน้าที่ค้างในชุดหน้า (ทุกแท็บ) + หน้าที่เห็นอยู่ และทาง "‹ หน้าก่อน" ของหน้านั้น
   * แถบหัวจอแคบ = ปุ่ม ☰ ตามด้วยกล่อง [ทางย้อน?, ชื่อหน้า] (NarrowBar ใน MainNavigator.tsx)
   */
  const stacks = (page) =>
    page.evaluate(() => {
      const onTop = (b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && b.contains(hit);
      };
      const heads = [...document.querySelectorAll('[aria-label="เปิดเมนู"]')]
        .map((b) => ({ box: b.nextElementSibling, shown: onTop(b) }))
        .filter((h) => h.box && h.box.lastElementChild);
      const titles = heads.map((h) => h.box.lastElementChild.textContent.trim());
      const top = heads.find((h) => h.shown);
      const crumb = top?.box.querySelector('[aria-label^="กลับไป"]');
      return { titles, title: top?.box.lastElementChild.textContent.trim() ?? null, crumb: crumb ? crumb.textContent.trim() : null };
    });
  const count = (s, t) => s.titles.filter((x) => x === t).length;
  const show = (s) => `เห็น "${s.title}" ทางย้อน ${s.crumb ? `"${s.crumb}"` : "ไม่มี"} · ชุดหน้า [${s.titles.join(", ")}]`;

  // ═══ ช่าง ═══
  await session("T001", async (page) => {
    // ติดป้ายที่แท็บวันนี้ของงานของฉันตัวที่เปิดมาตอนเข้าระบบ — หลังกดเมนูต้องเป็นตัวเดิม ไม่ใช่ตัวใหม่ที่ถูกสร้างทับ
    await page.locator('[aria-label^="แท็บ วันนี้"]').first().evaluate((el) => el.setAttribute("data-menu-root-probe", "1"));
    let s = await stacks(page);
    check(s.title === "งานของฉัน" && !s.crumb, "เข้าระบบมาเจองานของฉัน ไม่มีทางย้อน", show(s));

    await pick(page, "ลงทะเบียนใช้รถ");
    await pick(page, "รายการอะไหล่");
    s = await stacks(page);
    check(s.crumb === "ลงทะเบียนใช้รถ ›", "หน้าที่ไม่ใช่หน้าแรกยังซ้อนกันตามปกติ (มีทางย้อน)", show(s));

    await pick(page, "งานของฉันวันนี้");
    s = await stacks(page);
    const copies = await page.locator('[aria-label^="แท็บ วันนี้"]').count();
    const same = await page.locator('[data-menu-root-probe="1"]').count();
    check(copies === 1 && count(s, "งานของฉัน") === 1, "งานของฉัน: เหลือใบเดียว ไม่ซ้อนใบที่สอง", `งานของฉัน ${copies} ใบ · ${show(s)}`);
    // ต้องดูคู่กับจำนวนใบ — โค้ดเดิมตัวที่ติดป้ายก็ยังอยู่ (ซ่อนอยู่ใต้ใบที่สอง)
    check(same === 1 && copies === 1, "งานของฉัน: ใช้ตัวเดิม ไม่ถูกสร้างใหม่", `ป้ายที่ติดไว้ ${same} · งานของฉัน ${copies} ใบ`);
    check(s.title === "งานของฉัน" && !s.crumb, "งานของฉัน: ไม่มีทางย้อนไปหน้าก่อน", show(s));
    check(!s.titles.includes("ลงทะเบียนใช้รถ") && !s.titles.includes("รายการอะไหล่"), "งานของฉัน: หน้าที่ซ้อนอยู่ถูกล้าง", show(s));

    // หน้าหลักยังไม่อยู่ในชุด — ถอยกลับงานของฉันก่อนแล้วค่อยเปิด ไม่ใช่ซ้อนบนหน้าที่ทิ้งไว้
    await pick(page, "ลงทะเบียนใช้รถ");
    await pick(page, "หน้าหลัก");
    s = await stacks(page);
    check(
      s.title === "หน้าหลัก" && s.crumb === "งานของฉัน ›" && !s.titles.includes("ลงทะเบียนใช้รถ"),
      "หน้าหลัก (ยังไม่อยู่ในชุด): งานของฉัน › หน้าหลัก ไม่ค้างหน้ารถไว้ข้างใต้",
      show(s)
    );

    // หน้าหลักอยู่ในชุดแล้ว — ถอยกลับตัวเดิม
    await pick(page, "รายการอะไหล่");
    await pick(page, "หน้าหลัก");
    s = await stacks(page);
    check(
      s.title === "หน้าหลัก" && count(s, "หน้าหลัก") === 1 && s.crumb === "งานของฉัน ›" && !s.titles.includes("รายการอะไหล่"),
      "หน้าหลัก (อยู่ในชุดแล้ว): ถอยกลับใบเดิม ไม่มีใบที่สอง",
      show(s)
    );

    // แท็บประวัติ: คู่มือแก้ปัญหาเปิดแบบซ้อนบนหน้าประวัติ (initial: false) → กดประวัติต้องถอยกลับ
    await pick(page, "คู่มือแก้ปัญหา");
    s = await stacks(page);
    check(s.title === "คู่มือแก้ปัญหา" && s.crumb === "ประวัติการทำงาน ›", "คู่มือแก้ปัญหาซ้อนบนหน้าประวัติ", show(s));
    await pick(page, "ประวัติ");
    s = await stacks(page);
    check(
      s.title === "ประวัติการทำงาน" && !s.crumb && count(s, "ประวัติการทำงาน") === 1 && !s.titles.includes("คู่มือแก้ปัญหา"),
      "ประวัติ: ถอยกลับหน้าแรกของแท็บ ไม่ซ้อนใบที่สอง",
      show(s)
    );

    // ข้ามแท็บ: แท็บหน้าหลักค้าง [งานของฉัน, หน้าหลัก, รายการอะไหล่] ขณะยืนอยู่แท็บประวัติ
    await pick(page, "รายการอะไหล่");
    await pick(page, "ประวัติ");
    await pick(page, "งานของฉันวันนี้");
    s = await stacks(page);
    check(
      s.title === "งานของฉัน" && !s.crumb && count(s, "งานของฉัน") === 1 && !s.titles.includes("รายการอะไหล่") && !s.titles.includes("หน้าหลัก"),
      "ข้ามแท็บ → งานของฉัน: ล้างชุดหน้าของแท็บหน้าหลัก",
      show(s)
    );

    // ข้ามแท็บ + หน้าหลักยังไม่อยู่ในชุด — ชุดหน้าของแท็บที่ไม่ได้ยืนอยู่ต้องถูกถอยด้วย
    await pick(page, "ลงทะเบียนใช้รถ");
    await pick(page, "ประวัติ");
    await pick(page, "หน้าหลัก");
    s = await stacks(page);
    check(
      s.title === "หน้าหลัก" && s.crumb === "งานของฉัน ›" && !s.titles.includes("ลงทะเบียนใช้รถ"),
      "ข้ามแท็บ → หน้าหลัก: งานของฉัน › หน้าหลัก ไม่ค้างหน้ารถ",
      show(s)
    );
  });

  // ═══ แอดมิน ═══
  await session("A001", async (page) => {
    await pick(page, "สิทธิ์ผู้ใช้");
    let s = await stacks(page);
    check(s.title === "สิทธิ์ผู้ใช้" && s.crumb === "ระบบหลังบ้าน ›", "สิทธิ์ผู้ใช้ซ้อนบนระบบหลังบ้าน", show(s));
    await pick(page, "ระบบหลังบ้าน");
    s = await stacks(page);
    check(
      s.title === "ระบบหลังบ้าน" && !s.crumb && count(s, "ระบบหลังบ้าน") === 1 && !s.titles.includes("สิทธิ์ผู้ใช้"),
      "ระบบหลังบ้าน: ถอยกลับหน้าแรกของแท็บ ไม่ซ้อนใบที่สอง",
      show(s)
    );

    // แผนงานของแอดมินไม่ใช่หน้าแรกของชุด (เปิดแอปมาเจองานของฉัน) — แบบเดียวกับหน้าหลัก
    await pick(page, "ลงทะเบียนใช้รถ");
    await pick(page, "แผนงาน");
    s = await stacks(page);
    check(
      s.title === "แผนงาน" && s.crumb === "งานของฉัน ›" && !s.titles.includes("ลงทะเบียนใช้รถ"),
      "แผนงาน (ยังไม่อยู่ในชุด): งานของฉัน › แผนงาน ไม่ค้างหน้ารถ",
      show(s)
    );
    await pick(page, "รายการอะไหล่");
    await pick(page, "แผนงาน");
    s = await stacks(page);
    check(
      s.title === "แผนงาน" && count(s, "แผนงาน") === 1 && s.crumb === "งานของฉัน ›" && !s.titles.includes("รายการอะไหล่"),
      "แผนงาน (อยู่ในชุดแล้ว): ถอยกลับใบเดิม ไม่มีใบที่สอง",
      show(s)
    );
  });

  await browser.close();
})();
