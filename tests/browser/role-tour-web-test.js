// ทดสอบ: เดินทุกเมนูของแต่ละตำแหน่ง (ช่าง · หัวหน้าภาค · แอดมิน) บนหน้าเว็บจริง
//        · เมนูข้างที่เห็นตรงกับสิทธิ์ (ช่างไม่เห็นหลังบ้าน หัวหน้าภาคไม่เห็นหน้ารถของแอดมิน)
//        · เปิดทุกหน้าได้ ไม่มี error บนหน้า ไม่มีคำขอที่เซิร์ฟเวอร์ตอบ 5xx
//          ไม่มีข้อความ "โหลดข้อมูลไม่สำเร็จ" / "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
//        · ในหน้ารายงานเปิดทุกรายงาน · ในใบงานซ่อมเปิดใบแรก
//
// เทสต์นี้ไม่สร้างหรือแก้ข้อมูล — กดเฉพาะเมนู ไม่กดปุ่มบันทึก
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;

// ลำดับเดียวกับเมนูข้าง (components/SideMenu.tsx)
const ALL = [
  "แผนงาน", "หน้าหลัก", "กล่องงานของฉัน", "ใบงานซ่อม", "ติดตามเครื่องเสีย", "รายงาน",
  "วินิจฉัยอาการเสีย", "รายการอะไหล่", "รายงานตัวเข้าสาขา", "บันทึกการทำงาน", "คู่มือแก้ปัญหา",
  "ลงทะเบียนใช้รถ", "ประวัติการใช้รถของฉัน", "ภาพรวมรถ", "ประวัติการใช้รถ", "ทะเบียน & ซ่อมบำรุง",
  "เอกสารขอโอนสินค้า", "เบิกของใช้สิ้นเปลือง", "ประวัติ", "เปลี่ยนรหัสผ่าน",
  "ระบบหลังบ้าน", "อนุมัติคำขอเบิก", "สิทธิ์ผู้ใช้", "ทีมช่าง", "จัดการข้อมูลสาขา",
];
const ADMIN_ONLY = ["ภาพรวมรถ", "ประวัติการใช้รถ", "ทะเบียน & ซ่อมบำรุง", "ระบบหลังบ้าน", "อนุมัติคำขอเบิก", "สิทธิ์ผู้ใช้", "ทีมช่าง", "จัดการข้อมูลสาขา"];
const ROLES = [
  { code: "T001", name: "ช่าง", expect: ALL.filter((l) => l !== "แผนงาน" && !ADMIN_ONLY.includes(l)) },
  { code: "S001", name: "หัวหน้าภาค", expect: ALL.filter((l) => !ADMIN_ONLY.includes(l)) },
  { code: "A001", name: "แอดมิน", expect: ALL },
];
// หน้าย่อยที่เปิดต่อจากเมนู — หน้าเมนูของแท็บประวัติ/หลังบ้าน/รายงาน
const SUB = {
  "รายงาน": ["ใบงานวันนี้", "สรุปรายสัปดาห์", "ภาพรวมผู้บริหาร", "อะไหล่ที่ต้องสั่ง"],
  "ประวัติ": ["ประวัติการรายงานตัว", "ประวัติการทำงาน", "ประวัติการเบิกของ", "คู่มือแบบข้อความ"],
  "ระบบหลังบ้าน": ["ตรวจสอบผังวินิจฉัย", "จัดการคู่มือแก้ปัญหา", "จัดการข้อมูลอะไหล่", "จัดการของใช้สิ้นเปลือง"],
};
const BAD_TEXT = ["โหลดข้อมูลไม่สำเร็จ", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "โหลดเอกสารไม่สำเร็จ"];

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });

  for (const role of ROLES) {
    console.log(`\n═══ ${role.name} (${role.code})`);
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — เทสต์นี้กดรายการในกลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    let errors = [];
    let bad = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    page.on("response", (r) => {
      if (r.url().includes(":4000/api/") && r.status() >= 500) bad.push(`${r.status()} ${r.url().split(":4000")[1]}`);
    });
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const menu = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").first();

    try {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(role.code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(4000);

      // ── เมนูตรงสิทธิ์ ──
      const seen = [];
      for (const l of ALL) if ((await menu(l).count()) > 0) seen.push(l);
      const extra = seen.filter((l) => !role.expect.includes(l));
      const missing = role.expect.filter((l) => !seen.includes(l));
      !extra.length && !missing.length
        ? pass(`เมนูข้างตรงสิทธิ์ (${seen.length} เมนู)`)
        : fail(`เมนูไม่ตรง — เกิน: ${extra.join(",") || "-"} · ขาด: ${missing.join(",") || "-"}`);

      // ── เปิดทีละหน้า ──
      async function check(where) {
        await page.waitForTimeout(2500);
        const shown = [];
        for (const t of BAD_TEXT) if ((await vis(t, false).count()) > 0) shown.push(t);
        const e = errors.splice(0), b = bad.splice(0);
        if (!e.length && !b.length && !shown.length) return true;
        fail(`${where}: ${[...e, ...b, ...shown].join(" | ")}`);
        return false;
      }
      let ok = 0;
      let opened = false;
      for (const l of seen) {
        await menu(l).click();
        if (await check(l)) ok++;
        for (const s of SUB[l] ?? []) {
          const item = vis(s).last();
          if (!(await item.count())) continue;
          await item.click();
          if (await check(`${l} › ${s}`)) ok++;
          await menu(l).click();
          await page.waitForTimeout(800);
        }
        if (l === "ใบงานซ่อม") {
          // เปิดใบแรกในรายการ — เลขใบงานขึ้นต้น WO-
          // ค้นเลขใบก่อนแล้วกดตัวบนสุด — แผนงานที่ค้างอยู่ข้างหลังก็มีเลขใบงาน กดตัวแรกที่เจอจะโดนฉากบัง
          const search = page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first();
          const code = await page.getByText(/^WO-\d+$/).locator("visible=true").last().textContent().catch(() => null);
          if (code && (await search.count())) {
            await search.fill(code);
            await page.waitForTimeout(2000);
            await vis(code).last().click();
            if (await check("ใบงานซ่อม › เปิดใบงาน")) ok++;
            opened = true;
            const close = page.locator('[aria-label="ปิด"]').locator("visible=true").last();
            if (await close.count()) await close.click().catch(() => {});
            else await page.keyboard.press("Escape");
            await page.waitForTimeout(1000);
          }
        }
      }
      // กดใบงานซ่อมต่อจากกล่องงาน ต้องได้รายการรวม ไม่ใช่กล่องงานค้าง (เคยพัง: ช่างเห็น 0 ใบ)
      opened ? pass("กดใบงานซ่อมต่อจากกล่องงานแล้วเห็นรายการรวม เปิดใบงานได้") : fail("ใบงานซ่อมไม่มีใบให้เปิด (ค้างที่กล่องงาน?)");
      pass(`เปิดได้ไม่มีปัญหา ${ok} หน้า`);
      await page.screenshot({ path: path.join(DIR, `role-tour-${role.code}.png`) });
    } catch (e) {
      fail(String(e).slice(0, 300));
    } finally {
      await page.close();
    }
  }
  await browser.close();
})();
