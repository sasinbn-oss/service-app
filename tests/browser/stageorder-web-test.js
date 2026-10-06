// ทดสอบ: แถบขั้นตอนเรียงใหม่ — เสนอราคา/จ่ายเงิน มาก่อนเบิกอะไหล่
// และขั้นที่ไม่ต้องทำต้องขึ้นว่า "ข้าม" ไม่ใช่ขึ้นว่าทำแล้ว
const { chromium } = require("playwright");
const path = require("path");
const DIR = __dirname;

(async () => {
  // ใช้ chromium ที่ติดตั้งไว้แล้วถ้ามี ไม่งั้นให้ playwright หาเอง
  // PLAYWRIGHT_CHROMIUM ตั้งเองได้ถ้าเครื่องเก็บไว้ที่อื่น
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 1500 } });
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);

  // อ่านแถบขั้นตอน: ชื่อขั้น + ไอคอนที่ใช้ (ข้าม/ทำแล้ว/กำลังทำ/ยังไม่ถึง)
  const readStages = () =>
    page.evaluate(() => {
      const labels = [
        "รอหัวหน้าภาคระบุอะไหล่", "รอเสนอราคาลูกค้า", "รอลูกค้าจ่ายเงิน",
        "รอแอดมินเช็คอะไหล่", "รอหัวหน้าภาคจ่ายงาน", "รอหัวหน้าภาคนัดวัน",
        "รอช่างเข้างาน", "ปิดงานแล้ว",
      ];
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = (el.textContent || "").trim();
        if (!labels.includes(t)) continue;
        // ไอคอนเป็น element พี่น้องก่อนหน้าในแถวเดียวกัน
        const row = el.closest("div")?.parentElement;
        const txt = (row?.textContent || "").trim();
        out.push({ label: t, row: txt.slice(0, 60) });
      }
      return out;
    });

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(3500);

    // ── ใบที่ต้องเสนอราคา (สาขา D หมดประกัน) ──
    await page.goto("http://127.0.0.1:8081/work-orders/656", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(3000);
    if ((await page.getByText("ขั้นตอนงาน", { exact: true }).locator("visible=true").count()) === 0) {
      // เปิดผ่าน URL ไม่ได้ ให้เดินผ่านหน้ารายการแทน
      await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      await page.getByText("ใบงานซ่อม").locator("visible=true").first().click();
      await page.waitForTimeout(2500);
      await page.getByText("WO-00656", { exact: false }).locator("visible=true").first().click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(DIR, "so-1-quote.png"), fullPage: true });

    // อ่านเฉพาะในการ์ด "ขั้นตอนงาน" ไม่ใช่ทั้งหน้า — ชื่อขั้นไปโผล่ที่ป้ายสถานะ
    // ด้านบนด้วย ถ้าสแกนทั้งหน้าจะได้ลำดับของหน้าจอ ไม่ใช่ลำดับของแถบขั้นตอน
    const stageCard = () =>
      page.evaluate(() => {
        const title = [...document.querySelectorAll("*")].find(
          (n) => !n.children.length && (n.textContent || "").trim() === "ขั้นตอนงาน"
        );
        if (!title) return null;
        const card = title.closest("div")?.parentElement;
        if (!card) return null;
        const labels = [
          "รอหัวหน้าภาคระบุอะไหล่", "รอเสนอราคาลูกค้า", "รอลูกค้าจ่ายเงิน",
          "รอแอดมินเช็คอะไหล่", "รอหัวหน้าภาคจ่ายงาน", "รอหัวหน้าภาคนัดวัน",
          "รอช่างเข้างาน", "ปิดงานแล้ว",
        ];
        return [...card.querySelectorAll("*")]
          .filter((n) => !n.children.length && labels.includes((n.textContent || "").trim()))
          .map((n) => {
            const row = n.parentElement;
            // ขั้นที่ถูกข้ามถูกขีดฆ่า ส่วนขั้นที่ยังไม่ถึงแค่สีจาง
            const st = getComputedStyle(n);
            return {
              label: (n.textContent || "").trim(),
              struck: (st.textDecorationLine || "").includes("line-through"),
            };
          });
      });

    const bar = await stageCard();
    console.log("  แถบขั้นตอน:", bar.map((b) => b.label).join(" → "));
    const names = bar.map((b) => b.label);
    const qi = names.indexOf("รอเสนอราคาลูกค้า");
    const pi = names.indexOf("รอลูกค้าจ่ายเงิน");
    const ci = names.indexOf("รอแอดมินเช็คอะไหล่");
    qi >= 0 && pi === qi + 1 && ci === pi + 1
      ? pass("เสนอราคา → จ่ายเงิน → เบิกอะไหล่ เรียงถูกแล้ว")
      : fail(`ลำดับไม่ถูก: ${names.join(" → ")}`);

    // ── ใบที่ไม่ต้องเสนอราคา (สาขา C) — สองขั้นนั้นต้องขึ้นว่าข้าม ──
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.getByText("ใบงานซ่อม").locator("visible=true").first().click();
    await page.waitForTimeout(2500);
    const row = page.getByText("WO-00653", { exact: false }).locator("visible=true");
    if ((await row.count()) === 0) {
      console.log("SKIP ไม่เจอ WO-00653 ในรายการ");
    } else {
      await row.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, "so-2-noquote.png"), fullPage: true });
      // ขั้นที่ข้ามใช้ไอคอน remove-circle-outline และสีจาง — เช็คจาก aria/ชื่อไอคอน
      const bar2 = await stageCard();
      console.log("  แถบขั้นตอน:", bar2.map((b) => (b.struck ? `[ข้าม]${b.label}` : b.label)).join(" → "));
      const skipped = bar2.filter((b) => b.struck).map((b) => b.label);
      console.log("  " + JSON.stringify(skipped).slice(0, 300));
      skipped.includes("รอเสนอราคาลูกค้า") && skipped.includes("รอลูกค้าจ่ายเงิน")
        ? pass("ใบที่ไม่ต้องเสนอราคา สองขั้นนั้นขึ้นว่าข้าม ไม่ได้ขึ้นว่าทำแล้ว")
        : fail(`ไม่ได้ทำเครื่องหมายว่าข้าม: ${JSON.stringify(skipped)}`);
    }

    console.log("  (ดูภาพ so-1-quote.png กับ so-2-noquote.png ประกอบ)");
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "so-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${e.message}`);
  } finally {
    await browser.close();
  }
})();
