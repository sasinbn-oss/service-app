// ทดสอบ: หน้าสำรองข้อมูล (Super Admin · จอคอม)
//   1. แอดมินทั่วไปไม่เห็นเมนู
//   2. Super Admin กด "สำรองและดาวน์โหลดตอนนี้" → มีแถวในฐานข้อมูล + ได้ไฟล์ .xlsx และ .json.gz ลงเครื่อง
//   3. หลัง 17:00 แอปโหลดไฟล์ของวันนั้นให้เองครั้งเดียว — เปิดหน้าใหม่ไม่โหลดซ้ำ
//      (ตั้งนาฬิกาของเบราว์เซอร์เป็น 17:05 และตอบ /backups/today ด้วยแถวจริงจากข้อ 2 — เซิร์ฟเวอร์ยังเป็นเวลาจริง
//       ฝั่งเซิร์ฟเวอร์ของรอบ 17:00 ทดสอบแยกใน tests/backup-test.sh)
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

    // ── รอบ 17:00 ──
    downloads.length = 0;
    const token = (
      await (await fetch("http://localhost:4000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode: CODE, password: "test1234" }),
      })).json()
    ).token;
    const list = await (await fetch("http://localhost:4000/api/backups", { headers: { Authorization: `Bearer ${token}` } })).json();
    const shaped = list.rows.find((r) => r.id === id);
    if (!shaped) throw new Error("ไม่พบแถวสำรองใน /api/backups");
    await page.route("**/api/backups/today", (r) => r.fulfill({ json: { backup: { ...shaped, kind: "AUTO" } } }));
    // 10:05 UTC = 17:05 เวลาไทย
    // ใช้นาฬิกาปลอมทั้งหน้า แล้วเดินเวลาเอง — แอปเช็ครอบแรกหลังเปิด 10 วินาที
    await page.clock.install({ time: new Date(`${new Date().toISOString().slice(0, 10)}T10:05:00Z`) });
    await page.reload({ waitUntil: "networkidle" });
    // หยุดเดินเวลาทันทีที่ไฟล์มาครบ — เดินต่อข้อความแจ้งจะหมดเวลาหายไปก่อนตรวจ
    for (let i = 0; i < 12 && downloads.length < 2; i++) {
      await page.clock.runFor(1500);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1000);
    downloads.length === 2 ? pass("หลัง 17:00 โหลดไฟล์ของวันนั้นให้เองทั้งสองไฟล์") : fail(`โหลดเอง: [${downloads.join(",")}]`);
    (await vis("ดาวน์โหลดข้อมูลสำรองประจำวันแล้ว", false).count()) > 0 ? pass("บอกว่าโหลดให้แล้ว") : fail("ไม่มีข้อความแจ้ง");
    await page.screenshot({ path: path.join(DIR, "backup-auto.png") });

    downloads.length = 0;
    await page.reload({ waitUntil: "networkidle" });
    for (let i = 0; i < 12; i++) {
      await page.clock.runFor(1500);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(3000);
    downloads.length === 0 ? pass("เปิดหน้าใหม่ไม่โหลดไฟล์ของวันเดิมซ้ำ") : fail(`โหลดซ้ำ: [${downloads.join(",")}]`);
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
