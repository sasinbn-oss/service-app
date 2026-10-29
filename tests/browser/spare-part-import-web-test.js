// ทดสอบ: ปุ่ม "อัปเดตจากไฟล์ Excel" ในหน้าจัดการข้อมูลอะไหล่ (เจ้าของงานขอ ต.ค. 69 · แบบตามตัวอย่างที่ตกลง)
//   · เลือก 2 ไฟล์พร้อมกัน → ตรวจก่อนอัปเดต (ไม่บันทึก) · ไฟล์ที่หาคอลัมน์ไม่เจอบอกแยก ไฟล์อื่นยังอัปเดตได้
//   · แท็บ เพิ่มใหม่ / มีปัญหา / ไม่อยู่ในไฟล์ · รูปย่อจากไฟล์ · ติ๊กเก็บรูปเดิมแล้วตัวเลขบนปุ่มเปลี่ยน
//   · กดอัปเดต → รายงาน → ฐานข้อมูลมีอะไหล่+รูป · ดาวน์โหลดรายงาน · แถบ "อัปเดตจากไฟล์ล่าสุด" เปิดรายงานซ้ำได้
//   · ค้นหาด้วย Part No. ในหน้าจัดการ · ฟอร์มแก้ไขมีช่อง Part No. · จอมือถือไม่ล้นข้าง
const { chromium } = require("playwright");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SUF = String(process.pid);
const P = `ZZTW${SUF}`;
const BRAND = `ZZเว็บ${SUF}`;
const dir = os.tmpdir();
const F1 = path.join(dir, `zztw-${SUF}.xlsx`);
const F2 = path.join(dir, `zztw-bad-${SUF}.xlsx`);
const fixture = (out, spec) =>
  execSync(`node ${path.join(__dirname, "../fixtures-parts-xlsx.js")} ${out} '${JSON.stringify(spec)}'`, {
    env: { ...process.env, NODE_PATH: path.join(__dirname, "../../backend/node_modules") },
  }).toString();

const cleanup = () =>
  sql(`delete from "SparePartImport" where "fileName" like 'zztw-%${SUF}.xlsx';
       delete from "SparePartImage" where "sparePartId" in (select id from "SparePart" where "partCode" like '${P}%');
       delete from "SparePart" where "partCode" like '${P}%';`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  cleanup();
  // ของเดิมยี่ห้อเดียวกัน 1 ชิ้น มีรูปอยู่แล้ว — ไฟล์ส่งรูปต่างมา (แทน/เก็บ) และอีกชิ้นไม่อยู่ในไฟล์
  sql(`insert into "SparePart"("partCode",name,brand,"updatedAt") values ('${P}A','ฝาปิดทดสอบเว็บ','${BRAND}',now()),('${P}Z','ไม่อยู่ในไฟล์ทดสอบเว็บ','${BRAND}',now());
       insert into "SparePartImage"("sparePartId","mimeType",data,"updatedAt") select id,'image/jpeg','\\xffd8ffd9'::bytea,now() from "SparePart" where "partCode"='${P}A';`);
  const md5 = JSON.parse(
    fixture(F1, {
      headers: ["ลำดับ", "รูปภาพประกอบ", "รหัสสินค้า", "ชื่อรวม (ไทย)", "ยี่ห้อสินค้า", "Pant No."],
      rows: [
        [1, null, `${P}A`, "ฝาปิดทดสอบเว็บ", BRAND, "WP-A1"],
        [2, null, `${P}N`, "ใบพัดทดสอบเว็บ", BRAND, "W111 , W222"],
        [3, null, null, "แถวไม่มีรหัสทดสอบเว็บ", BRAND, null],
      ],
      images: { B2: `a-${SUF}`, B3: `n-${SUF}` },
    })
  );
  fixture(F2, { headers: ["ชื่อสินค้า", "ราคา"], rows: [["ก", 1]] });

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ — "ระบบหลังบ้าน" อยู่ในกลุ่มผู้ดูแลระบบ จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (t) => page.getByLabel(t, { exact: true }).locator("visible=true");
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลอะไหล่").last().click();
    await page.waitForTimeout(2500);

    await label("อัปเดตจากไฟล์ Excel").click();
    await page.waitForTimeout(1200);
    (await vis("อัปเดตข้อมูลอะไหล่จากไฟล์ Excel").count()) ? pass("กดปุ่มแล้วเปิดหน้าต่างอัปเดตจากไฟล์") : fail("ไม่เปิดหน้าต่าง");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), label("เลือกไฟล์อะไหล่").click()]);
    chooser.isMultiple() ? pass("เลือกได้หลายไฟล์พร้อมกัน") : fail("เลือกได้ไฟล์เดียว");
    await chooser.setFiles([F1, F2]);
    await page.waitForTimeout(800);
    (await vis(path.basename(F1)).count()) && (await vis(path.basename(F2)).count()) && (await vis("ตรวจก่อนอัปเดต (2 ไฟล์)").count())
      ? pass("รายการไฟล์ที่เลือกขึ้นครบ 2 ไฟล์")
      : fail("รายการไฟล์ไม่ครบ");
    await page.screenshot({ path: path.join(__dirname, "spare-import-1-pick.png") });

    await label("ตรวจก่อนอัปเดต").click();
    await vis("ตรวจก่อนอัปเดต — ยังไม่เปลี่ยนอะไรในระบบ").waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    sql(`select count(*) from "SparePart" where "partCode" like '${P}%'`) === "2"
      ? pass("ตรวจก่อนอัปเดตไม่บันทึกอะไรลงฐานข้อมูล")
      : fail("ตรวจแล้วมีอะไหล่เพิ่ม");
    (await vis(/หาคอลัมน์ “รหัสสินค้า” ไม่เจอ/, false).count()) ? pass("ไฟล์ที่หาคอลัมน์รหัสสินค้าไม่เจอ บอกแยกเป็นรายไฟล์") : fail("ไม่บอกไฟล์ที่อ่านไม่ได้");
    (await label("เพิ่มใหม่ 1 รายการ").count()) && (await label("รูปใหม่ / เปลี่ยนรูป 2 รายการ").count()) && (await label("ไม่อยู่ในไฟล์ 1 รายการ").count())
      ? pass("กล่องตัวเลข: เพิ่มใหม่ 1 · รูป 2 · ไม่อยู่ในไฟล์ 1")
      : fail("ตัวเลขในกล่องไม่ตรง");
    (await vis(`${P}N`, false).count()) && (await page.getByLabel(/^รูปจากไฟล์/).locator("visible=true").count())
      ? pass("แท็บเพิ่มใหม่: เห็นรหัสและรูปย่อจากไฟล์")
      : fail("ไม่เห็นแถวเพิ่มใหม่/รูปย่อ");
    (await vis(/✓ Pant No\. \(= Part No\.\)/, false).count()) ? pass("บอกคอลัมน์ที่อ่านได้ (Pant No. = Part No.)") : fail("ไม่บอกคอลัมน์ที่อ่าน");
    await page.screenshot({ path: path.join(__dirname, "spare-import-2-preview.png") });
    await label("มีปัญหา 1 รายการ").click();
    await page.waitForTimeout(500);
    (await vis(/ไม่มีรหัสสินค้า/, false).count()) ? pass("แท็บมีปัญหา: บอกแถวที่ไม่มีรหัสสินค้า") : fail("แท็บมีปัญหาว่าง");
    await label("ไม่อยู่ในไฟล์ 1 รายการ").click();
    await page.waitForTimeout(500);
    (await vis(`${P}Z`, false).count()) ? pass("แท็บไม่อยู่ในไฟล์: บอกอะไหล่ยี่ห้อเดียวกันที่ไม่ได้อยู่ในไฟล์") : fail("แท็บไม่อยู่ในไฟล์ว่าง");

    const applyText = async () => (await label("อัปเดตอะไหล่").innerText()).trim();
    const before = await applyText();
    await label("แทนรูปเดิมด้วยรูปในไฟล์").click();
    await page.waitForTimeout(400);
    const kept = await applyText();
    /รูป 2\)/.test(before) && /รูป 1\)/.test(kept) ? pass(`เอาติ๊กแทนรูปออก → ปุ่มนับรูปลดลง (${kept})`) : fail(`ปุ่ม: ${before} / ${kept}`);
    await label("แทนรูปเดิมด้วยรูปในไฟล์").click();
    await page.waitForTimeout(400);

    await label("อัปเดตอะไหล่").click();
    await vis(/^อัปเดตข้อมูลอะไหล่แล้ว \d+ รายการ$/, false).waitFor({ timeout: 60000 });
    pass(`กดอัปเดตแล้วขึ้นรายงาน: ${(await vis(/^อัปเดตข้อมูลอะไหล่แล้ว/, false).first().innerText()).trim()}`);
    (await vis(new RegExp(`zztw-bad-${SUF}\\.xlsx — ไม่ได้อัปเดต: หาคอลัมน์`), false).count())
      ? pass("รายงานบอกไฟล์ที่ไม่ได้อัปเดตพร้อมเหตุผล")
      : fail("รายงานไม่บอกไฟล์ที่ไม่ได้อัปเดต");
    await page.screenshot({ path: path.join(__dirname, "spare-import-3-report.png") });
    const rowN = sql(`select p."partNo"||'|'||(p."imageUrl" is not null)||'|'||md5(i.data) from "SparePart" p join "SparePartImage" i on i."sparePartId"=p.id where p."partCode"='${P}N'`);
    rowN === `W111, W222|true|${md5.B3}` ? pass("ฐานข้อมูล: อะไหล่ใหม่ได้ Part No. และรูปตรงกับไฟล์ (md5)") : fail(`ฐานข้อมูล N: ${rowN}`);
    sql(`select md5(i.data) from "SparePartImage" i join "SparePart" p on p.id=i."sparePartId" where p."partCode"='${P}A'`) === md5.B2
      ? pass("ฐานข้อมูล: รูปเดิมถูกแทนด้วยรูปในไฟล์ (ค่าตั้งต้น)")
      : fail("รูปเดิมไม่ถูกแทน");
    sql(`select count(*) from "SparePart" where "partCode"='${P}Z'`) === "1" ? pass("ฐานข้อมูล: อะไหล่ที่ไม่อยู่ในไฟล์ไม่ถูกลบ") : fail("Z ถูกลบ");
    sql(`select count(*) from "SparePartImport" where "fileName"='${path.basename(F1)}'`) === "1" && sql(`select count(*) from "SparePartImport" where "fileName"='${path.basename(F2)}'`) === "0"
      ? pass("ฐานข้อมูล: บันทึกประวัติเฉพาะไฟล์ที่อัปเดตได้")
      : fail("ประวัติรอบอัปเดตไม่ตรง");

    const docReq = page.waitForRequest((r) => /\/api\/documents\/[^/?]+\?token=/.test(r.url()), { timeout: 20000 }).catch(() => null);
    const popup = page.waitForEvent("popup", { timeout: 20000 }).catch(() => null);
    await label("ดาวน์โหลดรายงาน").click();
    const [req, pop] = await Promise.all([docReq, popup]);
    req || pop ? pass("ดาวน์โหลดรายงาน: เปิดไฟล์ Excel") : fail("กดดาวน์โหลดแล้วไม่เกิดอะไร");
    if (pop) await pop.close().catch(() => {});

    await label("กลับไปหน้าข้อมูลอะไหล่").click();
    await page.waitForTimeout(1500);
    (await vis(/อัปเดตจากไฟล์ล่าสุด/, false).count()) ? pass("หน้าจัดการอะไหล่มีแถบ “อัปเดตจากไฟล์ล่าสุด”") : fail("ไม่มีแถบอัปเดตล่าสุด");
    await label("ดูรายละเอียดการอัปเดตล่าสุด").click();
    await page.waitForTimeout(1500);
    (await vis(/^อัปเดตข้อมูลอะไหล่แล้ว/, false).count()) && (await vis(/W111, W222/, false).count())
      ? pass("กดดูรายละเอียด → เปิดรายงานรอบล่าสุดซ้ำได้ เห็นรายการที่เปลี่ยน")
      : fail("เปิดรายงานซ้ำไม่ได้");
    await label("กลับไปหน้าข้อมูลอะไหล่").click();
    await page.waitForTimeout(1000);

    await label("ค้นหาอะไหล่").fill("W222");
    await page.waitForTimeout(1200);
    (await vis(/Part No\. W111, W222/, false).count()) ? pass("ค้นหาด้วย Part No. ในหน้าจัดการ · การ์ดโชว์ Part No.") : fail("ค้นหา Part No. ไม่เจอ");
    await label(`แก้ไข ${P}N`).click();
    await page.waitForTimeout(1000);
    (await label("Part No.").inputValue()) === "W111, W222" ? pass("ฟอร์มแก้ไขมีช่อง Part No. พร้อมค่าเดิม") : fail("ฟอร์มไม่มี Part No.");
    await page.screenshot({ path: path.join(__dirname, "spare-import-4-form.png") });
    await page.close();

    // จอมือถือ — หน้าต่างตรวจต้องไม่ล้นข้าง
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on("pageerror", (e) => errors.push(String(e)));
    await phone.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    const pv = (t, exact = true) => phone.getByText(t, { exact }).locator("visible=true");
    await phone.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
    await phone.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await phone.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await pv("เข้าสู่ระบบ").click();
    await phone.waitForTimeout(3500);
    await phone.getByLabel("เปิดเมนู").click();
    await phone.waitForTimeout(1000);
    await pv("ระบบหลังบ้าน").first().click();
    await phone.waitForTimeout(2000);
    await pv("จัดการข้อมูลอะไหล่").last().click();
    await phone.waitForTimeout(2500);
    await phone.getByLabel("ดูรายละเอียดการอัปเดตล่าสุด", { exact: true }).locator("visible=true").click();
    await phone.waitForTimeout(1500);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    wide <= 1 && (await pv(/^อัปเดตข้อมูลอะไหล่แล้ว/, false).count()) ? pass("จอมือถือ: รายงานเปิดได้ ไม่ล้นข้าง") : fail(`จอมือถือล้น ${wide}px`);
    await phone.screenshot({ path: path.join(__dirname, "spare-import-5-phone.png") });
  } catch (e) {
    fail(String(e).split("\n").slice(0, 2).join(" "));
    await page?.screenshot({ path: path.join(__dirname, "spare-import-fail.png") }).catch(() => {});
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
    cleanup();
  }
})();
