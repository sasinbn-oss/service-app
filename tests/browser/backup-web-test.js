// ทดสอบ: หน้าสำรองข้อมูล (Super Admin · จอคอม)
//   1. แอดมินทั่วไปไม่เห็นเมนู
//   2. Super Admin กด "สำรองและดาวน์โหลดตอนนี้" → มีแถวในฐานข้อมูล + ได้ไฟล์ .xlsx และ .json.gz ลงเครื่อง
//   3. ไม่มีรอบอัตโนมัติแล้ว (เอาออก ต.ค. 69) — หลัง 17:00 แอปไม่ถาม /backups/today และไม่โหลดอะไรเอง
//      (ตั้งนาฬิกาของเบราว์เซอร์เป็น 17:05 แล้วเดินเวลา)
// ต้องมี DATABASE_URL และ mock-s3 ที่ตอบ Content-Disposition (tests/mock-s3.js)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const sql = (q) =>
  execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const SUF = String(Math.floor(Math.random() * 1e5));
const CODE = `ZBW${SUF}`;
const START = Number(sql(`select coalesce(max(id),0) from "Backup"`));

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword")
       select '${CODE}','ซุปเปอร์ทดสอบสำรอง','SUPER_ADMIN',"passwordHash",false from "User" where "employeeCode"='A001'`);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const downloads = [];
    page.on("download", (d) => downloads.push(d.suggestedFilename()));
    if (process.env.DEBUG) page.on("request", (r) => r.url().includes("backups") && console.log("REQ", r.url().slice(0, 120)));
    if (process.env.DEBUG) page.on("console", (m) => console.log("CONSOLE", m.text().slice(0, 200)));
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.locator(`[aria-label="${l}"]`).locator("visible=true").last();
    const signIn = async (code) => {
      await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 180000 });
      await page.getByPlaceholder("รหัสพนักงาน").fill(code);
      await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await vis("เข้าสู่ระบบ").click();
      await page.waitForTimeout(3500);
    };

    await signIn("A001");
    (await vis("สำรองข้อมูล").count()) === 0 ? pass("แอดมินทั่วไปไม่เห็นเมนูสำรองข้อมูล") : fail("แอดมินทั่วไปเห็นเมนู");
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();

    await signIn(CODE);
    await vis("สำรองข้อมูล").first().click();
    await page.waitForTimeout(2500);
    (await vis("ไฟล์ที่เก็บไว้").count()) > 0 ? pass("Super Admin เปิดหน้าสำรองข้อมูลได้") : fail("ไม่เห็นหน้าสำรองข้อมูล");

    await label("สำรองและดาวน์โหลดตอนนี้").click();
    await page.waitForTimeout(5000);
    const row = sql(`select id||'|'||kind||'|'||"byName" from "Backup" where id>${START} order by id desc limit 1`);
    row.endsWith("|MANUAL|ซุปเปอร์ทดสอบสำรอง") ? pass("กดแล้วมีแถวสำรองในฐานข้อมูล บอกชื่อคนกด") : fail(`ฐานข้อมูล: ${row}`);
    const id = Number(row.split("|")[0]);
    const got = downloads.join(",");
    downloads.some((f) => /^OTTERI-backup-.*\.xlsx$/.test(f)) && downloads.some((f) => /^OTTERI-backup-.*\.json\.gz$/.test(f))
      ? pass(`ได้ไฟล์ลงเครื่องทั้งสองแบบ (${got})`)
      : fail(`ไฟล์ที่ดาวน์โหลด: [${got}]`);
    const base = sql(`select to_char(("createdAt" at time zone 'UTC') at time zone 'Asia/Bangkok','"OTTERI-backup-"YYYY-MM-DD-HH24MI') from "Backup" where id=${id}`);
    (await vis(base).count()) > 0 ? pass("ไฟล์ใหม่ขึ้นในรายการ") : fail(`รายการไม่มี ${base}`);
    await page.screenshot({ path: path.join(DIR, "backup-screen.png") });

    // ── ไม่มีรอบ 17:00 แล้ว ──
    downloads.length = 0;
    let askedToday = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/backups/today")) askedToday++;
    });
    // 10:05 UTC = 17:05 เวลาไทย · แอปรุ่นเดิมเช็ครอบแรกหลังเปิด 10 วินาที แล้วทุก 5 นาที
    await page.clock.install({ time: new Date(`${new Date().toISOString().slice(0, 10)}T10:05:00Z`) });
    await page.reload({ waitUntil: "networkidle" });
    for (let i = 0; i < 12; i++) {
      await page.clock.runFor(30_000);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);
    askedToday === 0 && downloads.length === 0
      ? pass("หลัง 17:00 แอปไม่ถามรอบประจำวันและไม่โหลดอะไรเอง")
      : fail(`ถาม /today ${askedToday} ครั้ง · โหลด [${downloads.join(",")}]`);
    (await vis("รอบอัตโนมัติ", false).count()) === 0 ? pass("หน้าสำรองข้อมูลไม่พูดถึงรอบอัตโนมัติแล้ว") : fail("ยังมีข้อความรอบอัตโนมัติ");
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    // แถวที่เทสต์สร้าง: ตั้งให้เก่าแล้วให้ระบบลบเอง — ไฟล์ในที่เก็บไฟล์หายตามด้วย
    sql(`update "Backup" set "createdAt"='2000-01-01' where id>${START}`);
    execSync(`node_modules/.bin/ts-node-transpile-only -e 'require("./src/backup/backup").pruneOld().then(()=>process.exit(0))'`, {
      cwd: path.join(DIR, "..", "..", "backend"),
      env: {
        STORAGE_ENDPOINT: "http://localhost:9100",
        STORAGE_REGION: "us-east-1",
        STORAGE_ACCESS_KEY_ID: "dev",
        STORAGE_SECRET_ACCESS_KEY: "devsecret",
        STORAGE_BUCKET: "service-app",
        ...process.env,
      },
      stdio: "ignore",
    });
    sql(`delete from "User" where "employeeCode"='${CODE}'`);
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
