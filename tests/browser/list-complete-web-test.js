// ทดสอบ: หน้ารายการใบงานวาดครบทุกใบตามตัวเลขบนป้าย — ทุกตัวกรอง · มือถือและจอคอม · ค้นไม่เจอแล้วลบคำค้น
//
// เคยพังเงียบ ๆ หลังย้ายหัวหน้า+ตัวกรองเข้าไปในรายการ (ต.ค. 69): ป้ายบอก 123 ใบ เลื่อนจนสุดเห็นแค่ 6
// เพราะรายการที่สร้างไว้ตอนว่างแล้วค่อยได้ใบงานไม่วาดเพิ่มตอนเลื่อน — หน้าจอดูปกติทุกอย่าง แค่ข้อมูลไม่ครบ
// เทสต์นี้จึงไล่เลื่อนจนสุดแล้วนับรหัสใบงานที่โผล่จริง เทียบกับตัวเลขบนป้าย ไม่เชื่อป้ายอย่างเดียว
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);

  for (const [name, vp] of [["มือถือ", { width: 400, height: 860 }], ["จอคอม", { width: 1400, height: 900 }]]) {
    const page = await browser.newPage({ viewport: vp });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://localhost:8081");
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).click();
    await page.waitForTimeout(3000);
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    if (vp.width >= 640) await page.getByLabel("ใบงานซ่อม").first().click();
    else await vis("ใบงาน").last().click();
    await page.waitForTimeout(2500);
    await vis("ทั้งหมด").first().click();
    await page.waitForTimeout(2000);

    // ไล่เลื่อนจนสุด เก็บรหัสใบงานที่เคยโผล่ (รายการวาดเฉพาะช่วงที่ใกล้จอ จึงต้องสะสมระหว่างเลื่อน)
    const collect = async () => {
      const codes = new Set();
      await page.mouse.move(vp.width / 2 + 100, vp.height - 200);
      // เลื่อนจนไม่เจอใบใหม่ติดกันหลายรอบ ไม่ใช่จำนวนรอบตายตัว — การ์ดสูงขึ้นเมื่อไร (เช่นตอนเพิ่มบรรทัด
      // "เปิดโดย") ระยะเลื่อนแบบตายตัวไปไม่ถึงท้ายรายการ แล้วเทสต์รายงานว่าใบหายทั้งที่แอปวาดครบ
      for (let i = 0, idle = 0; i < 400 && idle < 15; i++) {
        const now = await page.evaluate(() =>
          [...document.querySelectorAll("div")]
            .filter((d) => /^WO-\d{5}$/.test(d.innerText) && d.children.length === 0)
            .map((d) => d.innerText)
        );
        const before = codes.size;
        now.forEach((c) => codes.add(c));
        idle = codes.size === before ? idle + 1 : 0;
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(80);
      }
      // กลับขึ้นบนสุดผ่านแถบสรุป — ตัวกรองอยู่ในหัวรายการ ต้องเห็นก่อนกด
      await page.getByLabel("แสดงตัวกรองและช่องค้นหา").click().catch(() => {});
      await page.waitForTimeout(800);
      return codes.size;
    };
    const pill = async () =>
      Number((await page.getByText(/^\d[\d,]* ใบ$/).locator("visible=true").first().innerText()).replace(/\D/g, ""));
    const check = async (label) => {
      const want = await pill();
      const got = await collect();
      got === want ? pass(`${name} · ${label}: เห็นครบ ${got} ใบ`) : fail(`${name} · ${label}: ป้าย ${want} ใบ แต่เห็นจริง ${got}`);
    };

    await check("เปิดหน้าครั้งแรก");
    // ตัวกรองแบบใหม่ (ต.ค. 69): จอคอม = ปุ่ม "กลุ่ม ▾" กางรายการ · จอแคบ = หน้าต่างตัวกรอง (หัวข้อละกลุ่ม)
    const pick = async (group, option) => {
      const lab = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true");
      if (await lab(`เลือก ${group}`).count()) {
        await lab(`เลือก ${group}`).first().click();
        await page.waitForTimeout(400);
        await lab(`ตัวกรอง ${option}`).last().click();
      } else {
        await lab("เปิดตัวกรอง").first().click();
        await page.waitForTimeout(900);
        // หัวข้อในหน้าต่างเรียง รอใคร → ทีม → สาขา: "ทั้งหมด" ของสาขาคือตัวสุดท้าย
        await lab(`ตัวกรอง ${option}`).last().click();
        await page.waitForTimeout(400);
        await page.locator('[aria-label^="ดู "]').locator("visible=true").last().click();
      }
      await page.waitForTimeout(600);
    };
    for (const combo of [[["รอใคร", "หัวหน้าภาค"]], [["สาขา", "DODO"]], [["สาขา", "ทั้งหมด"], ["รอใคร", "แอดมิน"]], [["รอใคร", "ทุกคน"]]]) {
      for (const [g, o] of combo) await pick(g, o);
      await check(combo.map(([, o]) => o).join(" + "));
    }

    // ค้นไม่เจอ → ลบคำค้น: รายการว่างแล้วกลับมามีใบงาน ต้องวาดครบอีกครั้ง และช่องค้นหาไม่หลุดโฟกัส
    const search = page.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง");
    await search.click();
    await page.keyboard.type("zzz", { delay: 60 });
    await page.waitForTimeout(1500);
    await page.keyboard.type("q", { delay: 60 });
    (await search.inputValue()) === "zzzq"
      ? pass(`${name} · ค้นไม่เจอแล้วพิมพ์ต่อได้ (ช่องค้นหาไม่หลุดโฟกัส)`)
      : fail(`${name} · พิมพ์ต่อไม่ติดหลังค้นไม่เจอ: "${await search.inputValue()}"`);
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.waitForTimeout(2000);
    await check("ค้นไม่เจอแล้วลบคำค้น");

    errors.length ? fail(`${name} · error บนหน้า: ${errors[0]}`) : pass(`${name} · ไม่มี error บนหน้า`);
    await page.close();
  }
  await browser.close();
})();
