// ทดสอบ: ปุ่ม "อัปเดตจากไฟล์ Excel" ในหน้าจัดการข้อมูลอะไหล่ (เจ้าของงานขอ ต.ค. 69 · แบบตามตัวอย่างที่ตกลง)
//   · เลือก 2 ไฟล์พร้อมกัน → ตรวจก่อนอัปเดต (ไม่บันทึก) · ไฟล์ที่หาคอลัมน์ไม่เจอบอกแยก ไฟล์อื่นยังอัปเดตได้
//   · แท็บ เพิ่มใหม่ / มีปัญหา / ไม่อยู่ในไฟล์ · รูปย่อจากไฟล์ · ติ๊กเก็บรูปเดิมแล้วตัวเลขบนปุ่มเปลี่ยน
//   · กดอัปเดต → รายงาน → ฐานข้อมูลมีอะไหล่+รูป · ดาวน์โหลดรายงาน · แถบ "อัปเดตจากไฟล์ล่าสุด" เปิดรายงานซ้ำได้
//   · ค้นหาด้วย Part No. ในหน้าจัดการ · ฟอร์มแก้ไขมีช่อง Part No. · จอมือถือไม่ล้นข้าง
//   แก้จากตรวจโค้ด: รหัสซ้ำข้ามไฟล์นับครั้งเดียว · อัปเดตหยุดกลางทาง (ทำให้ไฟล์ที่สองพังด้วยการดักคำขอ) →
//   รายงานบอกไฟล์ที่พังและไฟล์ที่ยังไม่ถึง · ปุ่มตรวจไฟล์ที่เหลือ → อัปเดตต่อได้ · รูปในหน้ารายการอะไหล่มีตัวกันแคช (?v=)
//   ไฟล์ 200 MB (รูปถ่ายก๊อปวางเป็น PNG — เจ้าของงานเจอกับ Huebsch/Oasis): เบราว์เซอร์ย่อรูป + แปลงเป็น JPEG ก่อนส่ง →
//   อัปเดตได้ · รูปในฐานข้อมูลเป็น JPEG เล็กลง เก็บค่ารูปต้นฉบับ · เลือกไฟล์เดิมอีกรอบ รูปไม่ขึ้นว่าเปลี่ยน ·
//   รูปเยอะจนย่อรอบแรกยังเกินเป้า → ย่อเพิ่มอีกรอบจนต่ำกว่า 45 MB
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
const FA = path.join(dir, `zztw-a-${SUF}.xlsx`);
const FB = path.join(dir, `zztw-b-${SUF}.xlsx`);
const FC = path.join(dir, `zztw-c-${SUF}.xlsx`);
const FBIG = path.join(dir, `zztw-big-${SUF}.xlsx`);
const BIG_N = 10;
const FMANY = path.join(dir, `zztw-many-${SUF}.xlsx`);
const MANY_N = 50;
const fixture = (out, spec) =>
  execSync(`node ${path.join(__dirname, "../fixtures-parts-xlsx.js")} ${out} '${JSON.stringify(spec)}'`, {
    env: { ...process.env, NODE_PATH: path.join(__dirname, "../../backend/node_modules") },
  }).toString();

const cleanup = () => {
  sql(`delete from "SparePartImport" where "fileName" like 'zztw-%${SUF}.xlsx';
       delete from "SparePartImage" where "sparePartId" in (select id from "SparePart" where "partCode" like '${P}%');
       delete from "SparePart" where "partCode" like '${P}%';`);
  for (const f of [F1, F2, FA, FB, FC, FBIG, FMANY]) require("fs").rmSync(f, { force: true });
};

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
  const H3 = ["รหัสสินค้า", "ชื่อสินค้า", "ยี่ห้อ"];
  fixture(FA, { headers: H3, rows: [[`${P}Q1`, "ใหม่หนึ่งทดสอบเว็บ", BRAND]] });
  fixture(FB, { headers: H3, rows: [[`${P}Q1`, "ใหม่หนึ่งทดสอบเว็บ (ไฟล์หลัง)", BRAND], [`${P}Q2`, "ใหม่สองทดสอบเว็บ", BRAND]] });
  fixture(FC, { headers: H3, rows: [[`${P}Q3`, "ใหม่สามทดสอบเว็บ", BRAND]] });

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
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    if (await label("ปิด").count()) await label("ปิด").last().click().catch(() => {});
    await page.waitForTimeout(800);

    // ── รหัสซ้ำข้ามไฟล์ + อัปเดตหยุดกลางทาง ──
    await label("อัปเดตจากไฟล์ Excel").click();
    await page.waitForTimeout(1000);
    const [ch2] = await Promise.all([page.waitForEvent("filechooser"), label("เลือกไฟล์อะไหล่").click()]);
    await ch2.setFiles([FA, FB, FC]);
    await page.waitForTimeout(600);
    await label("ตรวจก่อนอัปเดต").click();
    await vis("ตรวจก่อนอัปเดต — ยังไม่เปลี่ยนอะไรในระบบ").waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    (await label("เพิ่มใหม่ 3 รายการ").count()) && /อัปเดต 3 รายการ/.test(await applyText())
      ? pass("รหัสใหม่ตัวเดียวอยู่สองไฟล์ นับครั้งเดียว (เพิ่มใหม่ 3 ไม่ใช่ 4)")
      : fail(`นับซ้ำข้ามไฟล์: ${await applyText()}`);
    // ไฟล์ที่สองพังตอนอัปเดต — ดักคำขอที่มีชื่อไฟล์นั้นพร้อม apply
    await page.route("**/api/spare-parts/import", (route) => {
      const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
      if (body.includes(path.basename(FB)) && body.includes('name="apply"')) {
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "ทดสอบ: เซิร์ฟเวอร์หลุด" }) });
      }
      return route.continue();
    });
    await label("อัปเดตอะไหล่").click();
    await vis(/^อัปเดตข้อมูลอะไหล่แล้ว \d+ รายการ$/, false).waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    (await vis(`${path.basename(FB)} — ไม่ได้อัปเดต: ทดสอบ: เซิร์ฟเวอร์หลุด`, false).count()) &&
    (await vis(`${path.basename(FC)} — ไม่ได้อัปเดต: หยุดก่อนถึงไฟล์นี้`, false).count())
      ? pass("หยุดกลางทาง: รายงานบอกไฟล์ที่พัง และไฟล์ที่ยังไม่ถึง")
      : fail("รายงานไม่บอกไฟล์ที่ยังไม่ได้อัปเดต");
    sql(`select string_agg("partCode", ',' order by "partCode") from "SparePart" where "partCode" like '${P}Q%'`) === `${P}Q1`
      ? pass("ฐานข้อมูล: อัปเดตแค่ไฟล์แรก ไฟล์ที่พัง/ยังไม่ถึงไม่ได้บันทึก")
      : fail(`ฐานข้อมูลหลังหยุดกลางทาง: ${sql(`select string_agg("partCode", ',') from "SparePart" where "partCode" like '${P}Q%'`)}`);
    await page.screenshot({ path: path.join(__dirname, "spare-import-6-partial.png") });
    await page.unroute("**/api/spare-parts/import");
    await label("ตรวจไฟล์ที่ยังไม่ได้อัปเดต").click();
    await vis("ตรวจก่อนอัปเดต — ยังไม่เปลี่ยนอะไรในระบบ").waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    (await vis(/^2 ไฟล์ ·/, false).count()) && (await label("เพิ่มใหม่ 2 รายการ").count()) && (await label("แก้ไข 1 รายการ").count())
      ? pass("ตรวจไฟล์ที่เหลือ: เหลือ 2 ไฟล์ (Q1 มีแล้ว = แก้ไข · Q2 Q3 = เพิ่ม)")
      : fail("ตรวจไฟล์ที่เหลือไม่ตรง");
    await label("อัปเดตอะไหล่").click();
    await vis(/^อัปเดตข้อมูลอะไหล่แล้ว \d+ รายการ$/, false).waitFor({ timeout: 60000 });
    sql(`select string_agg("partCode"||'='||name, ',' order by "partCode") from "SparePart" where "partCode" like '${P}Q%'`) ===
    `${P}Q1=ใหม่หนึ่งทดสอบเว็บ (ไฟล์หลัง),${P}Q2=ใหม่สองทดสอบเว็บ,${P}Q3=ใหม่สามทดสอบเว็บ`
      ? pass("ฐานข้อมูล: อัปเดตไฟล์ที่เหลือครบ (รหัสซ้ำได้ค่าจากไฟล์หลัง)")
      : fail("อัปเดตไฟล์ที่เหลือไม่ครบ");
    await label("กลับไปหน้าข้อมูลอะไหล่").click();
    await page.waitForTimeout(1000);

    // ── ไฟล์ 200 MB (เจ้าของงานเจอ): รูปถ่ายที่ก๊อปวาง Excel เก็บเป็น PNG รูปละ 20 MB — สุ่มจุดให้บีบไม่ลง วาดด้วย canvas ──
    const noise = (kind, w, h, q, seed) =>
      page.evaluate(
        ({ kind, w, h, q, seed }) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          const img = ctx.createImageData(w, h);
          let x = seed * 9973 + 1;
          for (let i = 0; i < img.data.length; i += 4) {
            x = (x * 1103515245 + 12345) & 0x7fffffff;
            img.data[i] = x & 255;
            img.data[i + 1] = (x >> 8) & 255;
            img.data[i + 2] = (x >> 16) & 255;
            img.data[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          return c.toDataURL(kind, q).split(",")[1];
        },
        { kind, w, h, q, seed }
      );
    const shots = [];
    for (let k = 0; k < BIG_N; k++) {
      const f = path.join(dir, `zztw-shot-${SUF}-${k}.png`);
      require("fs").writeFileSync(f, Buffer.from(await noise("image/png", 3000, 2400, 1, k + 1), "base64"));
      shots.push(f);
    }
    const bigMd5 = JSON.parse(
      fixture(FBIG, {
        headers: ["รูปภาพประกอบ", "รหัสสินค้า", "ชื่อรวม (ไทย)", "ยี่ห้อสินค้า"],
        rows: shots.map((_, k) => [null, `${P}G${k}`, `รูปใหญ่ทดสอบเว็บ ${k}`, BRAND]),
        images: Object.fromEntries(shots.map((f, k) => [`A${k + 2}`, `file:${f}`])),
        imageExt: "png",
      })
    );
    const shot0 = require("fs").statSync(shots[0]).size;
    for (const f of shots) require("fs").rmSync(f, { force: true });
    const bigSize = require("fs").statSync(FBIG).size;
    bigSize > 180 * 1024 * 1024 ? pass(`ไฟล์ทดสอบ ${(bigSize / 1048576).toFixed(0)} MB รูป PNG ${BIG_N} รูป (แบบไฟล์จริง 200 MB)`) : fail(`ไฟล์ทดสอบเล็กไป ${bigSize}`);
    const pickFile = async (file) => {
      await label("อัปเดตจากไฟล์ Excel").click();
      await page.waitForTimeout(1000);
      const [chB] = await Promise.all([page.waitForEvent("filechooser"), label("เลือกไฟล์อะไหล่").click()]);
      await chB.setFiles([file]);
      await page.waitForTimeout(600);
      await label("ตรวจก่อนอัปเดต").click();
      await vis("ตรวจก่อนอัปเดต — ยังไม่เปลี่ยนอะไรในระบบ").waitFor({ timeout: 300000 });
      await page.waitForTimeout(800);
    };
    const closeImport = async () => {
      await label("เลือกไฟล์ใหม่").click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      if (await vis("อัปเดตข้อมูลอะไหล่จากไฟล์ Excel").count()) await label("ปิด").last().click().catch(() => {});
      await page.waitForTimeout(800);
    };
    await pickFile(FBIG);
    const shrinkNote = await vis(new RegExp(`ย่อรูปใหญ่ ${BIG_N} รูป \\(\\d+ MB → [\\d.]+ MB\\)`), false).first().innerText().catch(() => "");
    shrinkNote && (await label(`เพิ่มใหม่ ${BIG_N} รายการ`).count())
      ? pass(`ไฟล์ 200 MB ตรวจได้ — เบราว์เซอร์ย่อรูป + แปลง PNG เป็น JPEG ก่อนส่ง (${(shrinkNote.match(/ย่อรูปใหญ่[^)]*\)/) || [""])[0]})`)
      : fail(`ไฟล์ใหญ่: ${(await page.locator("body").innerText()).slice(0, 300)}`);
    await page.screenshot({ path: path.join(__dirname, "spare-import-7-big.png") });
    await label("อัปเดตอะไหล่").click();
    await vis(/^อัปเดตข้อมูลอะไหล่แล้ว \d+ รายการ$/, false).waitFor({ timeout: 300000 });
    const g0 = sql(`select length(i.data)||'|'||i."mimeType"||'|'||coalesce(i."sourceHash",'') from "SparePartImage" i join "SparePart" p on p.id=i."sparePartId" where p."partCode"='${P}G0'`).split("|");
    sql(`select count(*) from "SparePartImage" i join "SparePart" p on p.id=i."sparePartId" where p."partCode" like '${P}G%'`) === String(BIG_N) &&
    Number(g0[0]) < shot0 / 5 && g0[1] === "image/jpeg" && g0[2] === bigMd5._sha.A2
      ? pass(`ฐานข้อมูล: รูปครบ ${BIG_N} รูป PNG ${(shot0 / 1048576).toFixed(1)} MB → JPEG ${(Number(g0[0]) / 1048576).toFixed(1)} MB · เก็บค่ารูปต้นฉบับ`)
      : fail(`รูปจากไฟล์ใหญ่: ${g0.join(" | ")} ต้นฉบับ ${shot0}`);
    await label("กลับไปหน้าข้อมูลอะไหล่").click();
    await page.waitForTimeout(1000);
    // เลือกไฟล์เดิมอีกรอบ — ย่อใหม่ได้ไบต์ไม่ตรงเดิมก็ได้ แต่ต้นฉบับเดิม = ไม่มีอะไรเปลี่ยน
    await pickFile(FBIG);
    (await label("รูปใหม่ / เปลี่ยนรูป 0 รายการ").count()) && (await label(`เหมือนเดิม ${BIG_N} รายการ`).count())
      ? pass("เลือกไฟล์ใหญ่เดิมซ้ำ: รูปไม่ขึ้นว่าเปลี่ยน (เทียบด้วยรูปต้นฉบับ)")
      : fail(`ไฟล์ใหญ่ซ้ำ: ${await applyText()}`);
    await closeImport();
    require("fs").rmSync(FBIG, { force: true });

    // ── ย่อรอบแรกแล้วยังเกินเป้า (รูปเยอะ) — ย่อเพิ่มอีกรอบจนส่งได้ ──
    const many = [];
    for (let k = 0; k < MANY_N; k++) {
      const f = path.join(dir, `zztw-many-${SUF}-${k}.jpg`);
      require("fs").writeFileSync(f, Buffer.from(await noise("image/jpeg", 1600, 1280, 0.95, 100 + k), "base64"));
      many.push(f);
    }
    fixture(FMANY, {
      headers: ["รูปภาพประกอบ", "รหัสสินค้า", "ชื่อรวม (ไทย)", "ยี่ห้อสินค้า"],
      rows: many.map((_, k) => [null, `${P}R${k}`, `รูปเยอะทดสอบเว็บ ${k}`, BRAND]),
      images: Object.fromEntries(many.map((f, k) => [`A${k + 2}`, `file:${f}`])),
    });
    for (const f of many) require("fs").rmSync(f, { force: true });
    await pickFile(FMANY);
    const manyNote = await vis(/ย่อรูปใหญ่ \d+ รูป \([^)]*ย่อ \d+ รอบ\)/, false).first().innerText().catch(() => "");
    const after = Number((manyNote.match(/→ ([\d.]+) MB/) || [])[1]);
    manyNote && after <= 45
      ? pass(`รูปเยอะ ย่อรอบแรกยังเกิน → ย่อเพิ่มจนต่ำกว่าเป้า (${(manyNote.match(/ย่อรูปใหญ่[^)]*\)/) || [""])[0]})`)
      : fail(`ย่อหลายรอบ: ${manyNote || (await page.locator("body").innerText()).slice(0, 300)}`);
    await closeImport();
    require("fs").rmSync(FMANY, { force: true });

    // หน้ารายการอะไหล่ (ช่างใช้) — รูปต้องมีตัวกันแคช รูปถูกแทนจากไฟล์แล้วเห็นรูปใหม่ทันที
    await vis("รายการอะไหล่").first().click();
    await page.waitForTimeout(2000);
    await page.getByPlaceholder("ค้นหาจากชื่อ รหัสสินค้า ยี่ห้อ หรือ Part No.").locator("visible=true").first().fill(`${P}N`);
    await page.waitForTimeout(2000);
    const srcs = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => i.getAttribute("src") || ""));
    srcs.some((u) => /\/api\/spare-parts\/\d+\/image\?v=/.test(u))
      ? pass("หน้ารายการอะไหล่: ลิงก์รูปมีตัวกันแคช (?v=เวลาแก้ล่าสุด)")
      : fail(`ลิงก์รูปในรายการ: ${srcs.filter((u) => u.includes("spare-parts")).join(" ")}`);
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
