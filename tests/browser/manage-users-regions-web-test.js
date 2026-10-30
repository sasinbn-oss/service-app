// ทดสอบ: หน้าสิทธิ์ผู้ใช้ — หัวหน้าภาคเลือกได้หลายภาค (เจ้าของงานขอ ต.ค. 69 · ทุกภาคได้สิทธิ์เต็ม)
//   · การ์ด: ป้าย "ภาคที่ดูแล (เลือกได้หลายภาค · กดซ้ำเพื่อเอาออก)" · กดภาคที่สอง = เพิ่มต่อท้าย ภาคแรกไม่เปลี่ยน
//     (ฐานข้อมูล region + extraRegions) · กดซ้ำ = เอาออกเฉพาะภาคนั้น ภาคถัดไปขึ้นเป็นภาคแรก
//   · ค้นหาผู้ใช้ด้วยภาคที่เพิ่มเจอ · เปิดหน้าใหม่แล้วปุ่มที่เลือกยังติด (aria-selected)
//   · ภาคที่ถืออยู่แต่ไม่มีในทะเบียนแล้ว ขึ้นปุ่ม "<ภาค> · ไม่มีในทะเบียนสาขา" กดแล้วหายจากฐานข้อมูล
//     — สมัยภาคเดียว กดภาคอื่นก็ทับภาคเก่าไปเอง พอเลือกได้หลายภาค ภาคที่ไม่มีปุ่มจะค้างตลอดไป
//   · ภาคที่หัวหน้าภาคคนอื่นถือด้วย มีบรรทัดบอก "ภาคX มี <ชื่อ> ดูแลด้วย — ใบงานเข้ากล่องทั้งสองคน"
//   · หน้าต่างเพิ่มบัญชี: หัวหน้าภาคยังไม่เลือกภาค = สร้างไม่ได้ · เลือกสองภาค → ฐานข้อมูลเก็บครบ (ภาคแรก = ที่กดก่อน)
// ภาคทดสอบมาจากสาขาชั่วคราวที่ไม่มีทีม — ไม่แตะภาคจริงที่ใบงาน/เทสต์อื่นใช้ · สร้างผู้ใช้เองแล้วลบ (ต้องมี DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const path = require("path");
const DIR = __dirname;
const API = "http://localhost:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (method, url, token, body) =>
  (await fetch(API + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json();

const SUF = String(Math.floor(Math.random() * 1e5));
// ชื่อภาคไม่ขึ้นต้นด้วย "ภาค" — หน้าจอเติมคำว่า "ภาค" ให้เอง
const R1 = `เว็บก${SUF}`, R2 = `เว็บข${SUF}`, STALE = `เว็บค้าง${SUF}`;
const MAIN = `zmrw${SUF}`, MAIN_NAME = `หัวหน้าหลายภาคเว็บ${SUF}`;
const OTHER = `zmrv${SUF}`, OTHER_NAME = `หัวหน้าร่วมเว็บ${SUF}`;
const NEW = `zmrn${SUF}`, NEW_NAME = `หัวหน้าใหม่หลายภาค${SUF}`;
const db = (code) => sql(`select coalesce(region,'-')||'|'||array_to_string("extraRegions",',') from "User" where "employeeCode"='${code}'`);
function cleanup() {
  sql(`delete from "User" where "employeeCode" in ('${MAIN}','${OTHER}','${NEW}');
       delete from "Branch" where code in ('ZMRW1${SUF}','ZMRW2${SUF}')`);
}

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  sql(`insert into "Branch"(code,name,region) values ('ZMRW1${SUF}','สาขาเว็บหลายภาค ก','${R1}'),('ZMRW2${SUF}','สาขาเว็บหลายภาค ข','${R2}')`);
  const admin = (await call("POST", "/auth/login", null, { employeeCode: "A001", password: "test1234" })).token;

  async function open() {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    // เมนูข้างย่อกลุ่มที่ไม่ใช่ "งานซ่อม" ไว้ตั้งแต่แรก — สิทธิ์ผู้ใช้อยู่กลุ่มอื่น จึงกางทุกกลุ่มไว้ก่อน
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await page.getByText("เข้าสู่ระบบ", { exact: true }).last().click();
    await page.waitForTimeout(3500);
    await page.getByText("สิทธิ์ผู้ใช้", { exact: true }).locator("visible=true").first().click();
    await page.waitForTimeout(2500);
    const vis = (t, exact = true) => page.getByText(t, { exact }).locator("visible=true");
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    const search = async (q) => {
      await page.getByLabel("ค้นหาผู้ใช้").locator("visible=true").first().fill(q);
      await page.waitForTimeout(600);
    };
    // ปุ่มภาคติดอยู่ไหม — อ่านจาก aria-selected (accessibilityState) ไม่อ่านสี
    const sel = async (name, which = "first") =>
      vis(name)[which]().evaluate((el) => el.closest("[aria-selected]")?.getAttribute("aria-selected") ?? "none");
    return { page, vis, label, search, sel };
  }

  try {
    const made = await call("POST", "/auth/users", admin, { employeeCode: MAIN, name: MAIN_NAME, role: "SUPERVISOR", regions: [R1], password: "temp12345" });
    made.id && db(MAIN) === `${R1}|` ? pass("เตรียมหัวหน้าภาคทดสอบ ภาคเดียว (ฐานข้อมูล)") : fail(`สร้างผู้ใช้: ${JSON.stringify(made).slice(0, 200)}`);

    // ════ การ์ด: เลือกหลายภาค ════
    let { page, vis, search, sel } = await open();
    await search(MAIN);
    (await vis("ภาคที่ดูแล (เลือกได้หลายภาค · กดซ้ำเพื่อเอาออก)").count()) > 0
      ? pass("ป้ายบอกว่าเลือกได้หลายภาค · กดซ้ำเพื่อเอาออก") : fail("ไม่มีป้ายภาคที่ดูแลแบบใหม่");
    `${await sel(R1)}|${await sel(R2)}` === "true|false" ? pass("ตอนเปิด: ปุ่มภาคที่ถืออยู่ติด ภาคอื่นไม่ติด") : fail(`ปุ่มตอนเปิด: ${await sel(R1)} ${await sel(R2)}`);
    await vis(R2).first().click();
    await page.waitForTimeout(2000);
    db(MAIN) === `${R1}|${R2}` && `${await sel(R1)}|${await sel(R2)}` === "true|true"
      ? pass("กดภาคที่สอง = เพิ่ม ไม่ทับ · ภาคแรกยังเป็นภาคเดิม (ฐานข้อมูล region + extraRegions)") : fail(`เพิ่มภาค: ${db(MAIN)}`);
    await page.screenshot({ path: path.join(DIR, "manage-users-regions-1.png") });
    await search(R2);
    (await vis(MAIN_NAME).count()) > 0 ? pass("ค้นหาผู้ใช้ด้วยภาคที่เพิ่มเจอ") : fail("ค้นด้วยภาคที่เพิ่มไม่เจอ");
    await search(MAIN);
    await vis(R1).first().click();
    await page.waitForTimeout(2000);
    db(MAIN) === `${R2}|` && `${await sel(R1)}|${await sel(R2)}` === "false|true"
      ? pass("กดซ้ำเอาออกเฉพาะภาคนั้น ภาคที่เหลือขึ้นเป็นภาคแรก (ฐานข้อมูล)") : fail(`เอาภาคออก: ${db(MAIN)}`);
    await vis(R1).first().click();
    await page.waitForTimeout(2000);
    db(MAIN) === `${R2}|${R1}` ? pass("กดกลับเข้ามา = ต่อท้าย (ฐานข้อมูล)") : fail(`เพิ่มกลับ: ${db(MAIN)}`);
    await page.close();

    // ════ ภาคที่ค้าง (ไม่มีในทะเบียนแล้ว) + เปิดหน้าใหม่ ════
    sql(`update "User" set "extraRegions"=array['${R1}','${STALE}'] where "employeeCode"='${MAIN}'`);
    ({ page, vis, search, sel } = await open());
    await search(MAIN);
    `${await sel(R1)}|${await sel(R2)}` === "true|true" ? pass("เปิดหน้าใหม่ ปุ่มที่เลือกไว้ยังติดครบ") : fail(`หลังเปิดใหม่: ${await sel(R1)} ${await sel(R2)}`);
    const staleChip = vis(`${STALE} · ไม่มีในทะเบียนสาขา`);
    (await staleChip.count()) > 0 && (await sel(`${STALE} · ไม่มีในทะเบียนสาขา`)) === "true"
      ? pass("ภาคที่ไม่มีในทะเบียนแล้วขึ้นปุ่มแยก (ติดอยู่) ให้กดเอาออก") : fail("ไม่มีปุ่มภาคที่ค้าง");
    await page.screenshot({ path: path.join(DIR, "manage-users-regions-2.png") });
    await staleChip.first().click();
    await page.waitForTimeout(2000);
    db(MAIN) === `${R2}|${R1}` && (await vis(`${STALE} · ไม่มีในทะเบียนสาขา`).count()) === 0
      ? pass("กดภาคที่ค้าง → หายจากฐานข้อมูลและหน้าจอ ภาคอื่นอยู่ครบ") : fail(`เอาภาคค้างออก: ${db(MAIN)}`);
    await page.close();

    // ════ ภาคที่คนอื่นถือด้วย ════
    await call("POST", "/auth/users", admin, { employeeCode: OTHER, name: OTHER_NAME, role: "SUPERVISOR", regions: [R2], password: "temp12345" });
    ({ page, vis, search, sel } = await open());
    await search(MAIN);
    const hint = page.getByText(new RegExp(`ภาค${R2} มี ${OTHER_NAME} ดูแลด้วย — ใบงานเข้ากล่องทั้งสองคน`)).locator("visible=true");
    (await hint.count()) > 0 && (await page.getByText(/ดูแลด้วย — ใบงานเข้ากล่อง/).locator("visible=true").count()) === 1
      ? pass("ภาคที่หัวหน้าภาคคนอื่นถือด้วยมีบรรทัดบอก (เฉพาะภาคนั้น)") : fail("ไม่มีบรรทัดบอกภาคร่วม");
    await page.screenshot({ path: path.join(DIR, "manage-users-regions-3.png") });

    // ════ หน้าต่างเพิ่มบัญชี ════
    const label = (l) => page.getByLabel(l, { exact: true }).locator("visible=true").last();
    await vis("เพิ่มบัญชีผู้ใช้").last().click();
    await page.waitForTimeout(800);
    await label("ชื่อผู้ใช้").fill(NEW);
    await label("ชื่อ-นามสกุล").fill(NEW_NAME);
    await label("รหัสตั้งต้น").fill("temp12345");
    await vis("หัวหน้าภาค").last().click();
    await page.waitForTimeout(500);
    await vis("สร้างบัญชี").last().click();
    await page.waitForTimeout(1200);
    sql(`select count(*) from "User" where "employeeCode"='${NEW}'`) === "0" ? pass("หัวหน้าภาคยังไม่เลือกภาค → สร้างบัญชีไม่ได้ (ฐานข้อมูลไม่มีบัญชี)") : fail("สร้างได้ทั้งที่ไม่มีภาค");
    await vis(R1).last().click();
    await vis(R2).last().click();
    await page.waitForTimeout(500);
    (await page.getByText(new RegExp(`ภาค${R2} มี .+ ดูแลด้วย — ใบงานเข้ากล่องทั้ง 3 คน`)).locator("visible=true").count()) > 0
      ? pass("หน้าต่างเพิ่มบัญชีบอกว่าภาคนี้มีอีกสองคนถืออยู่ (เข้ากล่องทั้ง 3 คน)") : fail("หน้าต่างเพิ่มบัญชีไม่บอกภาคร่วม");
    await page.screenshot({ path: path.join(DIR, "manage-users-regions-4.png") });
    await vis("สร้างบัญชี").last().click();
    await page.waitForTimeout(2500);
    const row = sql(`select role||'|'||coalesce(region,'-')||'|'||array_to_string("extraRegions",',') from "User" where "employeeCode"='${NEW}'`);
    row === `SUPERVISOR|${R1}|${R2}` ? pass("สร้างหัวหน้าภาคสองภาค → ฐานข้อมูลภาคแรก = ที่กดก่อน ภาคที่สองเก็บใน extraRegions") : fail(`สร้างบัญชี: ${row}`);
    await vis("ตกลง").last().click().catch(() => {});
    await page.close();
  } catch (e) {
    fail(String(e).slice(0, 300));
  } finally {
    cleanup();
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    await browser.close();
  }
})();
