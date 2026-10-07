// ทดสอบ: ขนาดเครื่องในฟอร์ม · เติมของเดิมให้ · เปิดจากกระดานแล้วผู้ติดต่อไม่หาย
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
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });
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
  };

  try {
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await tap("เข้าสู่ระบบ");
    await page.waitForTimeout(3500);

    // ════ เปิดเอง ════
    await tap("ใบงานซ่อม", false);
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
    await tap("Huebsch");
    await page.waitForTimeout(500);
    const symptom = page.getByLabel("อาการที่พบของเครื่องที่ 1").locator("visible=true").first();
    await symptom.fill("น้ำไม่เข้า ทดสอบขนาด");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, "cap-2-filled.png") });
    await submitForm();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(DIR, "cap-3-detail.png") });
    (await seen("WO-", false)) > 0
      ? pass("บันทึกแล้วไปหน้ารายละเอียดใบงาน")
      : fail("ยังค้างอยู่ที่ฟอร์ม ไม่ได้บันทึก");
    (await seen("ขนาดเครื่อง (ไม่บังคับ)", true)) === 0 && (await seen("13 kg", false)) > 0
      ? pass("ใบงานแสดงขนาดเครื่อง")
      : fail("ใบงานไม่แสดงขนาดเครื่อง");

    // ════ เติมของเดิมให้รอบถัดไป ════
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await tap("ใบงานซ่อม", false);
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
      ? pass("พิมพ์รหัสเดิมแล้วรุ่นกับขนาดขึ้นให้เอง")
      : fail(`ไม่ได้เติมให้: ${JSON.stringify(picked)}`);

    // ════ เปิดจากกระดาน ════
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await tap("ติดตามเครื่องเสีย", false);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(DIR, "cap-5a-board-list.png") });
    const woBtn = page.getByText("สร้างใบงาน", { exact: true }).locator("visible=true");
    if ((await woBtn.count()) === 0) {
      console.log("SKIP ไม่มีปุ่มสร้างใบงานบนกระดาน");
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
      (await seen("รุ่นของเครื่อง", false)) > 0
        ? pass("เปิดจากกระดานมีช่องรุ่น")
        : fail("เปิดจากกระดานไม่มีช่องรุ่น");
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
      await submitForm();
      await page.waitForTimeout(5500);
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
    }

    errors.length === 0 ? pass("ไม่มี error ในหน้า") : fail(`error: ${errors.slice(0, 2).join(" | ")}`);
  } catch (e) {
    await page.screenshot({ path: path.join(DIR, "cap-error.png") }).catch(() => {});
    fail(`ทดสอบพัง: ${e.message}`);
  } finally {
    await browser.close();
  }
})();
