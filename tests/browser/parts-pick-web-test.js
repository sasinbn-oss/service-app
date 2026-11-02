// ทดสอบ: ช่างเลือกอะไหล่ตอนตรวจหน้างาน → หัวหน้าภาคคอนเฟิร์ม/ตีกลับ (เจ้าของงานขอ ต.ค. 69) — ฝั่งช่างและหน้าใบงาน (ก้อน 6)
//   1) ช่าง (มือถือ 390): งานของฉัน "บันทึกผลตรวจ" → ข้อ 5 "อะไหล่ที่ต้องใช้" (ไม่บังคับ) หัวช่อง "อะไหล่จากไฟล์ Huebsch" ·
//      ค้นรหัส Maytag → "รหัสนี้อยู่ในไฟล์ Maytag" · ของ Other ขึ้นใต้ "ของใช้ร่วม (ไฟล์ Other)" · เพิ่มตัว Huebsch แล้วปิดฟอร์ม
//      เปิดใหม่ยังอยู่ (ร่าง) · ปุ่ม "ส่งให้หัวหน้าภาคคอนเฟิร์ม" → กลับงานของฉันพร้อมกล่อง "ส่งผลตรวจแล้ว" + "ดูใบงาน {WO}" ·
//      ฐานข้อมูล: ใบไป NEW + รอบเลือกอะไหล่ PENDING รอบ 1 · หน้าใบงาน: กล่องฟ้า "อะไหล่ที่ช่างเลือก (รอคอนเฟิร์ม)" + แถบขั้น "คอนเฟิร์มอะไหล่"
//   2) หัวหน้าภาค (จอคอม): งานของฉัน กลุ่ม "คอนเฟิร์มอะไหล่" การ์ด "ช่างเลือก 2 รายการ" · "ส่งมา …" · รายการอะไหล่ ·
//      ตีกลับผ่าน API (หน้าคอนเฟิร์มเป็นก้อน 7 — ข้อนี้ทดสอบสิ่งที่ช่างเห็นหลังถูกตีกลับ)
//   3) ช่าง: การ์ดแดง "อะไหล่ถูกตีกลับ" เหนือแท็บ (เหตุผล · ตัวที่ชี้) → "แก้รายการอะไหล่" → กล่องแดงบนสุดของฟอร์ม (อยู่ในจอ
//      ไม่ถูกบัง — หน้าใบงานข้างหลังก็มีกล่องเดียวกัน) · ไฟล์รอบนี้ยังใช้ได้ · ป้าย "ไม่ตรง — หัวหน้าภาคชี้" · ปิดฟอร์ม → หน้าใบงาน
//      กล่องแดง + แถบตรวจหน้างาน "ถูกตีกลับ — แก้รายการอะไหล่" · เปิดฟอร์มใหม่ กดส่งโดยไม่แก้ → แถบเหลือง "ยังไม่ได้แก้อะไร …"
//      ปักใต้หัวฟอร์ม (อยู่ในจอโดยไม่ต้องเลื่อน) ไม่มีคำขอไปเซิร์ฟเวอร์ · เอาตัวที่ถูกชี้ออก + เพิ่มตัวใหม่ ("เพิ่มใหม่") →
//      "ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง" → ฐานข้อมูลรอบ 2 · หัวหน้าภาคโหลดใหม่เห็นป้าย "ส่งรอบที่ 2"
//   4) คอนเฟิร์มผ่าน API → หน้าใบงานของช่างขึ้นกล่องเขียว "หัวหน้าภาคคอนเฟิร์มอะไหล่แล้ว" + บรรทัดขั้นถัดไปของช่าง ·
//      หัวหน้าภาคเห็นแถบขั้น "คอนเฟิร์มอะไหล่แล้ว" · ฐานข้อมูล: เช็คอะไหล่ (มี/หมด) + อะไหล่ที่รอ = รายการรอบ 2
//   5) ใบที่สอง เครื่องยังไม่รู้ยี่ห้อ + อะไหล่ในสโตร์รออยู่ในใบ: ข้อ 5 เติมแถวเดิม + "เลือกยี่ห้อเครื่องก่อน" → กดชิป Huebsch
//      ("จะบันทึกยี่ห้อ …") → เอาแถวเดิมออก → "บันทึกและส่งผลตรวจ" → ฐานข้อมูล: Machine.model = Huebsch · แถวที่เอาออกหายจากใบ
//      (removed · D1) · ไม่มีรอบเลือกอะไหล่
// ผู้ใช้ของชุดนี้เอง (ช่าง ZPPT… ทีมของ C0006 · หัวหน้าภาค ZPPS… ภาคของ C0006) — ไม่ย้ายทีม T001 / ภาค S001:
// รอบที่ถูกฆ่ากลางทางเคยทิ้ง T001 ไว้ทีมอื่น รอบถัดไปจำค่าผิดเป็น "ค่าเดิม" แล้วชุดอื่นที่ต้องการ T001 ทีมเดิมพังตาม
// ของค้างจากรอบที่ถูกฆ่า (ใบ เครื่อง อะไหล่ ZPP… ผู้ใช้ ZPP[TS]…) ลบตามคำนำหน้าทั้งตอนเริ่มและตอนจบ ไม่ใช่เฉพาะเลข pid ของรอบนี้
// หน้าคอนเฟิร์มของหัวหน้าภาค (ซูมรูป · ตรง/ไม่ตรง · แถบแจ้งผลในกล่องงาน) มากับก้อน 7 — เติมข้อในไฟล์นี้
// ต้องมี DATABASE_URL · ไม่ขึ้นกับเวลาไทยของวันที่รัน: ส่งช่างตรวจด้วยวันนัด 12 วันข้างหน้า (G10 · ไม่ติดเวลาปิดนัดงานพรุ่งนี้)
// แล้วค่อยย้ายวันนัดเป็นวันนี้ด้วย SQL หลังใบอยู่ในมือช่าง (SQL ไม่ผ่านกติกาเวลาปิดนัด · ใบอยู่ในมือช่างแล้ว) — การ์ดจึงขึ้นแท็บ "วันนี้"
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { visitDay } = require("./fixture");
const PHOTO = path.join(__dirname, "..", "site-photo.png");
const CLIP = path.join(__dirname, "..", "site-clip.mp4");
const APP = "http://localhost:8081";
const API = "http://localhost:4000/api";
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const call = async (token, method, p, body) => {
  const r = await fetch(`${API}/${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.status === 204 ? null : await r.json().catch(() => ({}));
  return { status: r.status, data };
};
const login = async (code) => (await call(null, "POST", "auth/login", { employeeCode: code, password: "test1234" })).data.token;

const SUF = String(process.pid);
const K = `ZPP${SUF}`;
// ชื่อขึ้นต้นด้วยตัวอักษรอังกฤษ — ลำดับตามชื่อไม่ขึ้นกับ collation ภาษาไทยของฐาน
const PARTS = [
  [`${K}-HB1`, "a บอร์ดทดสอบเลือกอะไหล่", "Huebsch"],
  [`${K}-HB2`, "b ชุดล็อกทดสอบเลือกอะไหล่", "Huebsch"],
  [`${K}-HB3`, "c วาล์วทดสอบเลือกอะไหล่", "Huebsch"],
  [`${K}-MT1`, "m มอเตอร์ทดสอบเลือกอะไหล่", "Maytag"],
  [`${K}-OT1`, "o น้ำยาของใช้ร่วมทดสอบเลือกอะไหล่", "Other"],
];
const nameOf = (code) => PARTS.find((p) => p[0] === code)[1];
const tagOf = (code) => `${code} ${nameOf(code)}`;

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  const BID = sql(`select id from "Branch" where code='C0006'`);
  const team = sql(`select zone from "Branch" where code='C0006'`);
  const TC = `ZPPT${SUF}`;
  const SC = `ZPPS${SUF}`;
  const tName = "สมชาย ทดสอบเลือกอะไหล่";
  const sName = "สมศักดิ์ ทดสอบเลือกอะไหล่";
  /**
   * ของทดสอบทุกรอบของไฟล์นี้ ไม่ใช่เฉพาะรอบนี้ — ใบ (อาการขึ้นต้นด้วยคำนี้) เครื่องของใบพวกนั้น อะไหล่ ZPP<pid>- ผู้ใช้ ZPP[TS]<pid>
   * เครื่องอ่านจากใบก่อนลบใบ (ลบใบแล้วไม่รู้ว่าเครื่องไหนของเรา) และไม่ลบเครื่องที่ใบอื่นยังใช้ — รหัส W9### ชุดอื่นก็สุ่มใช้
   */
  const SYM = "ทดสอบเลือกอะไหล่หน้าจอ ";
  // เครื่องที่ใบของเรายืนยันถึง และไม่มีใบอื่นใช้ — อ่านก่อนลบใบเสมอ เพราะลบใบแล้วหาเครื่องกลับมาไม่ได้
  // (รอบแรกที่รันลบใบผ่าน API ก่อนแล้วค่อยกวาด เครื่อง W9xxx สองเครื่องจึงค้างในฐาน)
  const myMachines = () =>
    sql(`select coalesce(string_agg(m.id::text, ','), '') from "Machine" m where m."branchId"=${BID}
           and m.id in (select "machineId" from "WorkOrder" where "branchId"=${BID} and symptom like '${SYM}%' and "machineId" is not null)
           and not exists (select 1 from "WorkOrder" w where w."machineId"=m.id and coalesce(w.symptom,'') not like '${SYM}%')`);
  const dropMachines = (list) => (list ? sql(`delete from "Machine" where id in (${list}) and "branchId"=${BID}`) : null);
  const sweep = () =>
    sql(`delete from "WorkOrder" where "branchId"=${BID} and symptom like '${SYM}%';
         delete from "SparePart" where "partCode" ~ '^ZPP[0-9]+-';
         delete from "BranchCheckIn" where "userId" in (select id from "User" where "employeeCode" ~ '^ZPP[TS][0-9]+$');
         delete from "User" where "employeeCode" ~ '^ZPP[TS][0-9]+$';`);
  // เครื่องใหม่รหัสสุ่มสองเครื่อง — ใบแรก Huebsch ที่ตั้งตอนเปิดใบ (เครื่องเดิมในสาขาอาจถูกเทสต์อื่นตั้งยี่ห้อไว้) · ใบสองยังไม่รู้ยี่ห้อ
  const freeCode = (not) => {
    for (;;) {
      const c = `W9${Math.floor(Math.random() * 900 + 100)}`;
      if (c !== not && sql(`select count(*) from "Machine" where "branchId"=${BID} and code='${c}'`) === "0") return c;
    }
  };
  const ids = [];
  const A = await login("A001");
  const cleanup = async () => {
    const mine = myMachines();
    for (const id of ids) await call(A, "DELETE", `work-orders/${id}`);
    sweep();
    dropMachines(mine);
  };

  let page;
  const sessions = [];
  try {
    sweep();
    const MW = freeCode();
    const MW2 = freeCode(MW);
    sql(`insert into "SparePart"("partCode",name,brand,"offCatalog","updatedAt") values
      ${PARTS.map(([c, n]) => `('${c}','${n}','ZZไม่เกี่ยว',false,now())`).join(",")};
      insert into "SparePartBrandFile"("sparePartId",file,source)
      select p.id, f.file, 'MANUAL' from "SparePart" p join (values
        ${PARTS.map(([c, , f]) => `('${c}','${f}')`).join(",")}) as f(code,file) on f.code=p."partCode";`);
    const PID = (code) => Number(sql(`select id from "SparePart" where "partCode"='${code}'`));

    const hash = sql(`select "passwordHash" from "User" where "employeeCode"='T001'`);
    sql(`insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",team) values ('${TC}','${tName}','EMPLOYEE','${hash}',false,'${team}');
         insert into "User"("employeeCode",name,role,"passwordHash","mustChangePassword",region)
           select '${SC}','${sName}','SUPERVISOR','${hash}',false,region from "Branch" where code='C0006';`);
    const S = await login(SC);
    const T = await login(TC);
    if (!S || !T) throw new Error("เข้าระบบด้วยผู้ใช้ทดสอบของชุดนี้ไม่ได้");

    // ── เตรียมใบ: ตรวจหน้างาน → ส่งช่างตรวจ (12 วันข้างหน้า) → ย้ายวันนัดเป็นวันนี้ → ช่างถึงหน้างาน + แนบไฟล์ครบ 3 อย่าง ──
    const prep = async (machine, model, symptom) => {
      const opened = await call(A, "POST", "work-orders", {
        branchCode: "C0006", jobType: "INSPECT", priority: "NORMAL", contactPhone: "089-111-2222",
        machines: [{ code: machine, ...(model ? { model } : {}), symptom }],
      });
      const oid = opened.data.orders ? opened.data.orders[0].id : opened.data.id;
      if (!oid) throw new Error(`เปิดใบงานไม่ได้: ${JSON.stringify(opened.data).slice(0, 200)}`);
      ids.push(oid);
      const ocode = sql(`select code from "WorkOrder" where id=${oid}`);
      await call(S, "POST", `work-orders/${oid}/inspect-request`, { team, scheduledAt: visitDay(12) });
      await call(A, "POST", `work-orders/${oid}/confirm-appointment`, {});
      await call(S, "POST", `work-orders/${oid}/dispatch`, {});
      const now = sql(`select status from "WorkOrder" where id=${oid}`);
      if (now !== "INSPECTING") throw new Error(`เตรียมใบ ${ocode} ไม่ถึงขั้นตรวจหน้างาน (${now})`);
      sql(`update "WorkOrder" set "scheduledAt"='${visitDay(0)}'::timestamp where id=${oid}`);
      const arrived = await call(T, "POST", `work-orders/${oid}/arrive`, {});
      for (const [role, file, type] of [
        ["INSPECT_SITE", PHOTO, "image/png"],
        ["INSPECT_PART", PHOTO, "image/png"],
        ["INSPECT_VIDEO", CLIP, "video/mp4"],
      ]) {
        const fd = new FormData();
        fd.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
        fd.append("role", role);
        await fetch(`${API}/work-orders/${oid}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${T}` }, body: fd });
      }
      const files = sql(`select count(distinct role) from "WorkOrderAttachment" where "workOrderId"=${oid} and role like 'INSPECT_%'`);
      const make = sql(`select coalesce(model,'')||'|'||coalesce(brand,'') from "Machine" where "branchId"=${BID} and code='${machine}'`);
      return { id: oid, code: ocode, arrived: arrived.status, files, make };
    };
    const o1 = await prep(MW, "Huebsch", `${SYM}${SUF}`);
    const { id, code } = o1;
    o1.arrived === 200 && o1.files === "3" && o1.make === "Huebsch|"
      ? pass(`เตรียม ${code}: เครื่อง ${MW} Huebsch · ช่างถึงหน้างาน · ไฟล์ตรวจครบ 3 อย่าง (ฐานข้อมูล)`)
      : fail(`เตรียม ${code}: arrive=${o1.arrived} files=${o1.files} make=${o1.make}`);
    // ใบสอง: เครื่องยังไม่รู้ยี่ห้อ + อะไหล่ในสโตร์รออยู่ในใบแล้ว (ย้อนขั้น/ส่งตรวจหลังระบุอะไหล่) — ข้อ 5 เติมแถวนี้ไว้ให้
    const o2 = await prep(MW2, null, `${SYM}ไม่รู้ยี่ห้อ ${SUF}`);
    const { id: id2, code: code2 } = o2;
    sql(`insert into "WorkOrderPart"("workOrderId","sparePartId",quantity,kind) values (${id2}, ${PID(`${K}-HB1`)}, 2, 'WAITING')`);
    o2.arrived === 200 && o2.files === "3" && o2.make === "|"
      ? pass(`เตรียม ${code2}: เครื่อง ${MW2} ยังไม่รู้ยี่ห้อ · ${K}-HB1 × 2 รออยู่ในใบ · ไฟล์ตรวจครบ (ฐานข้อมูล)`)
      : fail(`เตรียม ${code2}: arrive=${o2.arrived} files=${o2.files} make=${o2.make}`);
    const st = () => sql(`select status from "WorkOrder" where id=${id}`);

    const picks = () =>
      sql(`select coalesce(string_agg(status||':'||round||':'||("voidedAt" is null), ',' order by id),'') from "PartsPick" where "workOrderId"=${id}`);
    const items = () =>
      sql(`select coalesce(string_agg(p."partCode"||'x'||i.quantity, ',' order by p."partCode"),'') from "PartsPickItem" i
           join "SparePart" p on p.id=i."sparePartId" where i."pickId"=(select max(id) from "PartsPick" where "workOrderId"=${id})`);
    const waiting = () =>
      sql(`select coalesce(string_agg(p."partCode"||'x'||w.quantity, ',' order by p."partCode"),'') from "WorkOrderPart" w
           join "SparePart" p on p.id=w."sparePartId" where w."workOrderId"=${id} and w.kind='WAITING'`);

    // หน้าใหม่ (context ใหม่) ต่อผู้ใช้หนึ่งคน — ไม่ต้องหาปุ่มออกจากระบบ ไม่มีค่าของคนก่อนค้างในเครื่อง
    const signIn = async (who, viewport) => {
      const ctx = await browser.newContext({ viewport });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(`${who}: ${e}`));
      sessions.push(ctx);
      await p.goto(APP, { waitUntil: "networkidle", timeout: 180000 });
      await p.getByPlaceholder("รหัสพนักงาน").fill(who);
      await p.getByPlaceholder("รหัสผ่าน").fill("test1234");
      await p.getByText("เข้าสู่ระบบ", { exact: true }).locator("visible=true").click();
      await p.waitForTimeout(4000);
      page = p;
      return p;
    };
    const vis = (p, t, exact = true) => p.getByText(t, { exact }).locator("visible=true");
    const label = (p, l) => p.locator(`[aria-label="${l}"]`).locator("visible=true");
    /**
     * อยู่ในจอและอยู่บนสุดจริง (ไม่มีอะไรบัง) — visible=true ของ Playwright ดูแค่ว่ากล่องมีขนาด
     * ของที่อยู่ใต้ฟอร์มที่เลื่อนมาทับ หรืออยู่ท้ายฟอร์มยาวพ้นจอ ก็นับว่า "เห็น" — เทสต์ที่ผ่านทั้งที่คนมองไม่เห็น (CLAUDE.md)
     * ดูจุดใกล้มุมบนซ้ายของกล่อง ว่าสิ่งที่อยู่บนสุดตรงนั้นคือกล่องนี้ (หรือของข้างใน)
     */
    const onTop = async (loc) => {
      for (let i = 0; i < (await loc.count()); i++) {
        const ok = await loc
          .nth(i)
          .evaluate((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            const x = r.left + Math.min(r.width / 2, 40);
            const y = r.top + Math.min(r.height / 2, 10);
            if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
            const top = document.elementFromPoint(x, y);
            return !!top && (top === el || el.contains(top));
          })
          .catch(() => false);
        if (ok) return true;
      }
      return false;
    };
    // ปุ่มชื่อเดียวกันมีทั้งบนหน้าใบงานและใต้หน้าต่าง (การ์ดแดงในงานของฉัน) — กดตัวที่อยู่บนสุด ไม่ใช่ตัวแรกใน DOM
    // (กดตัวที่ถูกบังจะรอจนหมดเวลา เพราะ Playwright เห็นว่ามีของอื่นรับคลิกแทน)
    const clickTop = async (loc) => {
      for (let i = 0; i < (await loc.count()); i++) {
        await loc.nth(i).scrollIntoViewIfNeeded().catch(() => {});
        if (await onTop(loc.nth(i))) {
          await loc.nth(i).click();
          return true;
        }
      }
      return false;
    };
    // การ์ดเดิมยังวาดอยู่จนงานของฉันโหลดรายการใหม่เสร็จ (กล่อง "ส่งผลตรวจแล้ว" ขึ้นก่อนรายการมา) — รอให้หายก่อนนับ
    // ไม่งั้นเทสต์ไปแข่งกับเวลาโหลดเอง แล้วฟ้องว่าการ์ดค้างทั้งที่แอปทำงานถูก
    const gone = (loc) => loc.first().waitFor({ state: "detached", timeout: 10000 }).then(() => true).catch(() => false);
    const addPart = async (p, partCode) => {
      await p.getByPlaceholder("ค้นหาในไฟล์ Huebsch").locator("visible=true").last().fill(partCode);
      await p.waitForTimeout(2000);
      await label(p, `เพิ่ม ${tagOf(partCode)}`).first().click();
      await p.waitForTimeout(600);
    };

    // ── 1) ช่างเลือกอะไหล่ตอนตรวจหน้างาน (มือถือ) ──
    const t = await signIn(TC, { width: 390, height: 844 });
    const card = label(t, `งาน ${code}`);
    (await card.count()) > 0 ? pass(`งานของฉัน: การ์ด ${code} อยู่ในแท็บวันนี้`) : fail(`ไม่มีการ์ด ${code} ในงานของฉัน`);
    await card.locator('[aria-label="บันทึกผลตรวจ"]').first().click();
    await t.waitForTimeout(3000);
    (await vis(t, "อะไหล่ที่ต้องใช้").count()) > 0 &&
    (await vis(t, "ไม่บังคับ").count()) > 0 &&
    (await vis(t, "ยังบอกไม่ได้ว่าต้องใช้ตัวไหน เว้นว่างได้ — หัวหน้าภาคจะเป็นคนระบุแทน").count()) > 0 &&
    (await vis(t, "อะไหล่จากไฟล์ Huebsch", false).count()) > 0 &&
    (await vis(t, "บันทึกและส่งผลตรวจ").count()) > 0
      ? pass("ฟอร์มผลตรวจ: ข้อ 5 \"อะไหล่ที่ต้องใช้\" ป้ายไม่บังคับ + คำอธิบาย · หัวช่อง \"อะไหล่จากไฟล์ Huebsch\" · ยังไม่เลือก = ปุ่ม \"บันทึกและส่งผลตรวจ\"")
      : fail("ฟอร์มผลตรวจไม่มีข้อ 5 / หัวช่องไฟล์ Huebsch");
    await label(t, "ผลตรวจหน้างาน").last().fill("ประตูล็อกไม่ลง บอร์ดมีรอยไหม้");
    const search = t.getByPlaceholder("ค้นหาในไฟล์ Huebsch").locator("visible=true").last();
    await search.fill(`${K}-MT1`);
    await t.waitForTimeout(2000);
    (await vis(t, `ไม่พบ “${K}-MT1” ในไฟล์ Huebsch — รหัสนี้อยู่ในไฟล์ Maytag`).count()) > 0
      ? pass("ค้นรหัส Maytag บนเครื่อง Huebsch: ไม่พบ + \"รหัสนี้อยู่ในไฟล์ Maytag\"") : fail("ไม่บอกว่ารหัสอยู่ไฟล์ไหน");
    await search.fill(`${K}-OT1`);
    await t.waitForTimeout(2000);
    (await vis(t, "ของใช้ร่วม (ไฟล์ Other)").count()) > 0 && (await label(t, `เพิ่ม ${tagOf(`${K}-OT1`)}`).count()) > 0
      ? pass("ของ Other ขึ้นใต้ \"ของใช้ร่วม (ไฟล์ Other)\"") : fail("ไม่มีกลุ่มของใช้ร่วม");
    await addPart(t, `${K}-HB1`);
    (await label(t, `จำนวน ${K}-HB1`).count()) > 0 && (await vis(t, "ส่งให้หัวหน้าภาคคอนเฟิร์ม").count()) > 0
      ? pass("เพิ่มตัว Huebsch แล้ว ปุ่มเปลี่ยนเป็น \"ส่งให้หัวหน้าภาคคอนเฟิร์ม\"") : fail("เพิ่มอะไหล่แล้วปุ่มไม่เปลี่ยน");
    // ร่างข้อ 5 — ปิดฟอร์มแล้วเปิดใหม่ รายการที่เลือกยังอยู่ (ช่างโดนโทรศัพท์เข้ากลางทาง)
    await vis(t, "ยกเลิก").last().click();
    await t.waitForTimeout(1200);
    await clickTop(label(t, "ตรวจหน้างาน"));
    await t.waitForTimeout(2500);
    (await label(t, `จำนวน ${K}-HB1`).count()) > 0
      ? pass("ปิดฟอร์มแล้วเปิดใหม่: รายการที่เลือกยังอยู่ (ร่างข้อ 5)") : fail("เปิดฟอร์มใหม่แล้วรายการที่เลือกหาย");
    await addPart(t, `${K}-HB2`);
    await t.screenshot({ path: path.join(__dirname, "parts-pick-1-step5.png") });
    await vis(t, "ส่งให้หัวหน้าภาคคอนเฟิร์ม").last().click();
    const sentBox = label(t, "กล่องส่งผลตรวจแล้ว");
    const back = await sentBox.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const left1 = await gone(label(t, `งาน ${code}`));
    back &&
    left1 &&
    (await vis(t, `ส่งผลตรวจแล้ว — ${code} ออกจากงานวันนี้ ไปรอ หัวหน้าภาค · คอนเฟิร์มอะไหล่ · ถ้าไม่ตรง จะกลับมาเป็นการ์ดแดงที่นี่`, false).count()) > 0 &&
    (await label(t, `ดูใบงาน ${code}`).count()) > 0
      ? pass("ส่งแล้วกลับงานของฉัน: กล่อง \"ส่งผลตรวจแล้ว … ไปรอ หัวหน้าภาค · คอนเฟิร์มอะไหล่\" + ปุ่ม \"ดูใบงาน\" · การ์ดออกจากรายการ")
      : fail("หลังส่งไม่กลับงานของฉัน / ไม่มีกล่องส่งผลตรวจแล้ว");
    await t.screenshot({ path: path.join(__dirname, "parts-pick-2-sent.png") });
    st() === "NEW" && picks() === "PENDING:1:true" && items() === `${K}-HB1x1,${K}-HB2x1` && waiting() === ""
      ? pass("ฐานข้อมูล: ใบไป NEW · รอบเลือกอะไหล่ PENDING รอบ 1 (HB1, HB2) · ยังไม่เขียนลงอะไหล่ที่รอ (รอคอนเฟิร์ม)")
      : fail(`หลังส่ง: status=${st()} picks=${picks()} items=${items()} waiting=${waiting()}`);
    await label(t, `ดูใบงาน ${code}`).first().click();
    await t.waitForTimeout(3500);
    (await label(t, "อะไหล่ที่ช่างเลือก (รอคอนเฟิร์ม)").count()) > 0 &&
    (await vis(t, "ใบนี้ออกจาก งานของฉัน แล้ว — ระหว่างรอไม่ต้องทำอะไร").count()) > 0 &&
    (await vis(t, "หัวหน้าภาค · คอนเฟิร์มอะไหล่").count()) > 0 &&
    (await t.locator('[aria-label="ขั้น 1 คอนเฟิร์มอะไหล่ · ทำอยู่"]').count()) > 0
      ? pass("หน้าใบงาน (ช่าง): กล่องฟ้า \"อะไหล่ที่ช่างเลือก (รอคอนเฟิร์ม)\" + \"ระหว่างรอไม่ต้องทำอะไร\" · ป้าย \"หัวหน้าภาค · คอนเฟิร์มอะไหล่\" · ขั้น 1 คอนเฟิร์มอะไหล่")
      : fail("หน้าใบงานไม่บอกว่ารอคอนเฟิร์มอะไหล่");
    await t.screenshot({ path: path.join(__dirname, "parts-pick-3-order.png") });

    // ── 2) หัวหน้าภาค: การ์ดในกลุ่ม "คอนเฟิร์มอะไหล่" ──
    const s = await signIn(SC, { width: 1366, height: 900 });
    const group = label(s, "กลุ่ม คอนเฟิร์มอะไหล่");
    // มาจากการตรวจหน้างาน เครื่องอะไร ยี่ห้ออะไร ช่างคนไหน (ขนาดเครื่องแทรกหลังรหัสได้ถ้ามี)
    const pickMeta = new RegExp(`^ตรวจหน้างาน · เครื่อง ${MW}( · [^·]+)? · Huebsch · ช่าง${tName}$`);
    const inGroup = await group.first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    inGroup &&
    (await group.getByText(code, { exact: true }).count()) > 0 &&
    (await group.getByText("ช่างเลือก 2 รายการ", { exact: true }).count()) > 0 &&
    (await group.getByText(/ส่งมา /).count()) > 0 &&
    (await group.getByText(`${K}-HB1`, { exact: false }).count()) > 0 &&
    (await group.getByText(pickMeta).count()) > 0 &&
    (await group.getByText("ส่งรอบที่", { exact: false }).count()) === 0 &&
    (await label(s, `ทำขั้น คอนเฟิร์มอะไหล่ ${code}`).count()) > 0
      ? pass("งานของฉัน (หัวหน้าภาค): กลุ่ม \"คอนเฟิร์มอะไหล่\" · การ์ด \"ตรวจหน้างาน · เครื่อง … · Huebsch · ช่าง…\" \"ช่างเลือก 2 รายการ\" (รอบ 1 ไม่มีป้ายรอบ) · \"ส่งมา …\" · รายการอะไหล่ · ปุ่ม \"คอนเฟิร์มอะไหล่\"")
      : fail("การ์ดคอนเฟิร์มอะไหล่ในงานของฉันของหัวหน้าภาคไม่ครบ");
    await s.screenshot({ path: path.join(__dirname, "parts-pick-4-queue.png") });
    const pick1 = Number(sql(`select max(id) from "PartsPick" where "workOrderId"=${id}`));
    const reason = "รหัสไม่ตรงกับรูปอะไหล่ที่เสีย";
    const ret = await call(S, "POST", `work-orders/${id}/parts-pick/return`, {
      pickId: pick1,
      reason,
      flags: [PID(`${K}-HB2`)],
      marks: [{ sparePartId: PID(`${K}-HB1`), mark: "OK" }],
    });
    ret.status === 200 && st() === "INSPECTING" && picks() === "RETURNED:1:true"
      ? pass("ตีกลับ (API): ใบกลับไป INSPECTING · รอบ 1 RETURNED (ฐานข้อมูล)") : fail(`ตีกลับ: ${ret.status} ${JSON.stringify(ret.data).slice(0, 160)} · ${st()} ${picks()}`);

    // ── 3) ช่าง: การ์ดแดง → แก้รายการ → ด่านส่งใหม่ → ส่งรอบ 2 ──
    const t2 = await signIn(TC, { width: 390, height: 844 });
    const red = label(t2, `งาน ${code}`);
    (await red.getByText("อะไหล่ถูกตีกลับ", { exact: true }).count()) > 0 &&
    (await red.getByText(`หัวหน้าภาค ${sName}: “${reason}”`, { exact: true }).count()) > 0 &&
    (await red.getByText(`ต้องแก้ 1 รายการ: ${tagOf(`${K}-HB2`)} · ไม่ต้องเข้าหน้างานใหม่ ไฟล์ 3 อย่างเดิมยังใช้ได้`, { exact: true }).count()) > 0
      ? pass("งานของฉัน: การ์ดแดง \"อะไหล่ถูกตีกลับ\" บอกใครตีกลับ เหตุผล ตัวที่ชี้ และไม่ต้องเข้าหน้างานใหม่")
      : fail("การ์ดแดงอะไหล่ถูกตีกลับไม่ครบ");
    await t2.screenshot({ path: path.join(__dirname, "parts-pick-5-red-card.png") });
    await red.locator('[aria-label="แก้รายการอะไหล่"]').first().click();
    await t2.waitForTimeout(3500);
    // กล่องแดงมีสองใบ: บนหน้าใบงาน (ถูกฟอร์มเลื่อนมาทับ แต่ยังอยู่ใน DOM) กับบนสุดของฟอร์ม — นับอย่างเดียวผ่านได้ทั้งที่ฟอร์มไม่มีกล่อง
    // จึงต้องมีสองใบ และใบหนึ่งต้องอยู่บนสุดในจอ (ใบของฟอร์ม — ใบของหน้าใบงานถูกฟอร์มบัง)
    const redBoxes = label(t2, "กล่องตีกลับรายการอะไหล่");
    (await redBoxes.count()) >= 2 &&
    (await onTop(redBoxes)) &&
    (await vis(t2, "หัวหน้าภาคตีกลับรายการอะไหล่ — แก้แล้วส่งใหม่").count()) > 0 &&
    (await vis(t2, `“${reason}”`).count()) > 0 &&
    (await vis(t2, "ไฟล์รอบนี้ยังใช้ได้ — ไม่ต้องถ่ายใหม่ · รูปไม่ชัดก็เพิ่มได้").count()) > 0 &&
    (await vis(t2, "ไม่ตรง — หัวหน้าภาคชี้").count()) > 0 &&
    (await label(t2, "ผลตรวจหน้างาน").last().inputValue()) === "ประตูล็อกไม่ลง บอร์ดมีรอยไหม้" &&
    (await vis(t2, "ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง").count()) > 0
      ? pass("ฟอร์มแก้รายการ: กล่องแดงบนสุดของฟอร์ม (อยู่ในจอ ไม่ถูกบัง) + เหตุผล · ไฟล์รอบนี้ยังใช้ได้ · ป้าย \"ไม่ตรง — หัวหน้าภาคชี้\" · ผลตรวจเดิมเติมไว้ · ปุ่ม \"…อีกครั้ง\"")
      : fail("ฟอร์มหลังถูกตีกลับไม่ครบ / กล่องแดงไม่อยู่บนฟอร์ม");
    // ปิดฟอร์ม → หน้าใบงานเอง: กล่องแดง (5.5) + แถบขั้นตอนบอกว่ากลับมาตรวจเพราะถูกตีกลับ
    await vis(t2, "ยกเลิก").last().click();
    await t2.waitForTimeout(1500);
    const pageRed = label(t2, "กล่องตีกลับรายการอะไหล่");
    await pageRed.first().scrollIntoViewIfNeeded().catch(() => {});
    (await pageRed.count()) >= 1 && (await onTop(pageRed)) && (await vis(t2, "ถูกตีกลับ — แก้รายการอะไหล่").count()) > 0
      ? pass("หน้าใบงาน (ช่าง): กล่องแดงตีกลับรายการอะไหล่ (อยู่บนสุดในจอ) · แถบตรวจหน้างาน \"ถูกตีกลับ — แก้รายการอะไหล่\"")
      : fail("หน้าใบงานหลังถูกตีกลับไม่มีกล่องแดง / แถบขั้นไม่บอกว่าถูกตีกลับ");
    // เปิดฟอร์มใหม่จากปุ่มของขั้น — ฟอร์มเปิดที่บนสุด ด่านส่งใหม่ต้องเห็นได้โดยไม่ต้องเลื่อน
    (await clickTop(label(t2, "แก้รายการอะไหล่"))) ? null : fail("ไม่มีปุ่ม \"แก้รายการอะไหล่\" บนหน้าใบงาน");
    await t2.waitForTimeout(2500);
    const inspectPosts = [];
    t2.on("request", (r) => {
      if (r.method() === "POST" && new RegExp(`/work-orders/${id}/inspection$`).test(r.url())) inspectPosts.push(r.url());
    });
    await vis(t2, "ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง").last().click();
    await t2.waitForTimeout(1200);
    // ต้องเห็นตรงที่ช่างมองอยู่ (ยังไม่ได้เลื่อน) ไม่ใช่แค่มีอยู่ที่ไหนสักแห่งในฟอร์มยาว — มือถือ 844 px ปุ่มที่ไม่บอกอะไรคือ "กดไม่ติด"
    const gateMsg = vis(t2, `ยังไม่ได้แก้อะไร — แก้ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง (${tagOf(`${K}-HB2`)}) หรือเขียนในข้อ 4 ว่าทำไมยืนยันรายการเดิม แล้วค่อยส่งใหม่`);
    (await gateMsg.count()) > 0 &&
    (await onTop(gateMsg)) &&
    inspectPosts.length === 0 &&
    picks() === "RETURNED:1:true"
      ? pass("กดส่งโดยไม่แก้: แถบเหลือง \"ยังไม่ได้แก้อะไร …\" (ข้อความเดียวกับเซิร์ฟเวอร์) อยู่ในจอโดยไม่ต้องเลื่อน · ไม่ส่งคำขอ ใบยังถูกตีกลับ")
      : fail(`ส่งโดยไม่แก้: ข้อความ ${await gateMsg.count()} อยู่ในจอ ${await onTop(gateMsg)} · คำขอ ${inspectPosts.length} · picks=${picks()}`);
    await t2.screenshot({ path: path.join(__dirname, "parts-pick-6-gate.png") });
    await label(t2, `เอา ${K}-HB2 ออก`).first().click();
    await t2.waitForTimeout(500);
    (await vis(t2, `เอา ${tagOf(`${K}-HB2`)} ออกแล้ว — ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง`).count()) > 0 &&
    (await vis(t2, "ยังไม่ได้แก้อะไร", false).count()) === 0
      ? pass("เอาตัวที่ถูกชี้ออก: \"เอา … ออกแล้ว — ตัวที่หัวหน้าภาคชี้ว่าไม่ตรง\" · กล่องเหลืองหาย") : fail("เอาตัวที่ถูกชี้ออกแล้วไม่บอก / กล่องเหลืองค้าง");
    await addPart(t2, `${K}-HB3`);
    (await vis(t2, "เพิ่มใหม่").count()) > 0 ? pass("ตัวที่เพิ่มรอบนี้ติดป้าย \"เพิ่มใหม่\"") : fail("ไม่มีป้ายเพิ่มใหม่");
    await vis(t2, "ส่งให้หัวหน้าภาคคอนเฟิร์มอีกครั้ง").last().click();
    const back2 = await label(t2, "กล่องส่งผลตรวจแล้ว").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const left2 = await gone(label(t2, `งาน ${code}`));
    back2 && left2
      ? pass("ส่งรอบ 2: กลับงานของฉัน กล่องส่งผลตรวจแล้ว · การ์ดแดงหาย") : fail("ส่งรอบ 2 แล้วไม่กลับงานของฉัน / การ์ดแดงค้าง");
    st() === "NEW" && picks() === "RETURNED:1:true,PENDING:2:true" && items() === `${K}-HB1x1,${K}-HB3x1`
      ? pass("ฐานข้อมูล: รอบ 2 PENDING (HB1, HB3) · รอบ 1 ยังเป็นประวัติ RETURNED")
      : fail(`ส่งรอบ 2: status=${st()} picks=${picks()} items=${items()}`);
    // หัวหน้าภาคโหลดงานของฉันใหม่: การ์ดเดิมกลับมาพร้อมป้าย "ส่งรอบที่ 2" (รู้ว่าเคยตีกลับไปแล้ว ดูว่าแก้อะไร)
    await s.goto(APP, { waitUntil: "networkidle" });
    await s.waitForTimeout(3000);
    const group2 = label(s, "กลุ่ม คอนเฟิร์มอะไหล่");
    (await group2.first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) &&
    (await group2.getByText(code, { exact: true }).count()) > 0 &&
    (await group2.getByText("ส่งรอบที่ 2", { exact: true }).count()) > 0 &&
    (await group2.getByText("ช่างเลือก 2 รายการ", { exact: true }).count()) > 0 &&
    (await group2.getByText(pickMeta).count()) > 0
      ? pass("งานของฉัน (หัวหน้าภาค) หลังช่างส่งรอบ 2: ป้าย \"ส่งรอบที่ 2\" · \"ช่างเลือก 2 รายการ\" · บรรทัดเครื่อง/ยี่ห้อ/ช่าง")
      : fail("การ์ดคอนเฟิร์มอะไหล่รอบ 2 ไม่มีป้ายส่งรอบที่ 2 / บรรทัดเครื่อง");

    // ── 4) คอนเฟิร์ม (API) → กล่องเขียวบนหน้าใบงาน ──
    await label(t2, `ดูใบงาน ${code}`).first().click();
    await t2.waitForTimeout(3500);
    const pick2 = Number(sql(`select max(id) from "PartsPick" where "workOrderId"=${id}`));
    const conf = await call(S, "POST", `work-orders/${id}/parts-pick/confirm`, {
      pickId: pick2,
      marks: [`${K}-HB1`, `${K}-HB3`].map((c) => ({ sparePartId: PID(c), mark: "OK" })),
    });
    conf.status === 200 && st() === "PARTS_SOURCING" && waiting() === `${K}-HB1x1,${K}-HB3x1`
      ? pass("คอนเฟิร์ม (API): ใบไปเช็คอะไหล่ (มี/หมด) · อะไหล่ที่รอ = รายการรอบ 2 (ฐานข้อมูล)")
      : fail(`คอนเฟิร์ม: ${conf.status} ${JSON.stringify(conf.data).slice(0, 160)} · ${st()} ${waiting()}`);
    // หน้าใบงานเช็คการเปลี่ยนของคนอื่นทุก 20 วินาที (และตอนกดรีเฟรช) — รอกล่องเขียวแทนการโหลดหน้าใหม่ (เว็บไม่มีลิงก์ตรงไปใบงาน)
    if ((await label(t2, "รีเฟรชข้อมูล").count()) > 0) await label(t2, "รีเฟรชข้อมูล").first().click().catch(() => {});
    const green = await vis(t2, "หัวหน้าภาคคอนเฟิร์มอะไหล่แล้ว", false).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    green &&
    (await vis(t2, `${sName} คอนเฟิร์มครบ 2 รายการ — แอดมินเช็คว่ามีของหรือหมด`).count()) > 0 &&
    (await vis(t2, "ขั้นถัดไปของช่าง: งานจะกลับมาที่ งานของฉัน เมื่อหัวหน้าภาคปล่อยงาน").count()) > 0
      ? pass("หน้าใบงาน (ช่าง): กล่องเขียว \"หัวหน้าภาคคอนเฟิร์มอะไหล่แล้ว\" + ใครคอนเฟิร์มกี่รายการ + ขั้นถัดไปของช่าง")
      : fail("หน้าใบงานไม่ขึ้นกล่องเขียวหลังคอนเฟิร์ม");
    await t2.screenshot({ path: path.join(__dirname, "parts-pick-7-confirmed.png") });

    // หัวหน้าภาค (จอกว้าง ชื่อขั้นไม่ถูกซ่อน): ขั้น 1 บอกว่าผ่านด้วยการคอนเฟิร์มรายการของช่าง
    await s.goto(APP, { waitUntil: "networkidle" });
    await s.waitForTimeout(3000);
    await vis(s, "ใบงานซ่อม").first().click();
    await s.waitForTimeout(2500);
    await s.getByPlaceholder("ค้นรหัสใบงาน สาขา หรือเรื่อง").locator("visible=true").first().fill(code);
    await s.waitForTimeout(2500);
    await vis(s, code).last().click();
    await s.waitForTimeout(3500);
    (await vis(s, "คอนเฟิร์มอะไหล่แล้ว").count()) > 0 && (await label(s, "กล่องคอนเฟิร์มอะไหล่แล้ว").count()) > 0
      ? pass("หน้าใบงาน (หัวหน้าภาค): แถบขั้น \"คอนเฟิร์มอะไหล่แล้ว\" + กล่องเขียว")
      : fail("แถบขั้นไม่บอกว่าคอนเฟิร์มอะไหล่แล้ว");

    // ── 5) ใบสอง: เครื่องไม่รู้ยี่ห้อ + แถวเดิมในใบ → ชิปยี่ห้อ → เอาแถวเดิมออก → ส่งผลตรวจแบบไม่เลือกอะไหล่ ──
    await t2.goto(APP, { waitUntil: "networkidle" });
    await t2.waitForTimeout(4000);
    const card2 = label(t2, `งาน ${code2}`);
    await card2.locator('[aria-label="บันทึกผลตรวจ"]').first().click();
    await t2.waitForTimeout(3000);
    const hb1 = `${K}-HB1`;
    (await label(t2, `จำนวน ${hb1}`).count()) > 0 &&
    (await vis(t2, "เลือกยี่ห้อเครื่องก่อน").count()) > 0 &&
    (await label(t2, "ยี่ห้อเครื่อง Huebsch").count()) > 0
      ? pass(`ข้อ 5 ของใบที่เครื่องไม่รู้ยี่ห้อ: เติม ${hb1} ที่รออยู่ในใบ · "เลือกยี่ห้อเครื่องก่อน" + ชิปยี่ห้อ`)
      : fail("ข้อ 5 ของเครื่องไม่รู้ยี่ห้อไม่เติมแถวเดิม / ไม่มีชิปยี่ห้อ");
    await label(t2, "ยี่ห้อเครื่อง Huebsch").first().click();
    await t2.waitForTimeout(1500);
    (await t2.getByText(new RegExp(`^จะบันทึกยี่ห้อ Huebsch ให้เครื่อง ${MW2}.* ตอนส่งผลตรวจ$`)).locator("visible=true").count()) > 0
      ? pass("กดชิป Huebsch: \"จะบันทึกยี่ห้อ Huebsch ให้เครื่อง … ตอนส่งผลตรวจ\"") : fail("กดชิปยี่ห้อแล้วไม่บอกว่าจะบันทึกยี่ห้อ");
    await label(t2, `เอา ${hb1} ออก`).first().click();
    await t2.waitForTimeout(500);
    await label(t2, "ผลตรวจหน้างาน").last().fill("มอเตอร์ปกติ ยังบอกไม่ได้ว่าต้องเปลี่ยนตัวไหน");
    const sendPlain = vis(t2, "บันทึกและส่งผลตรวจ").last();
    (await label(t2, `จำนวน ${hb1}`).count()) === 0 && (await sendPlain.count()) > 0
      ? pass("เอาแถวเดิมออก: รายการว่าง ปุ่มกลับเป็น \"บันทึกและส่งผลตรวจ\"") : fail("เอาแถวเดิมออกแล้วรายการ/ปุ่มไม่เปลี่ยน");
    await sendPlain.click();
    const back3 = await label(t2, "กล่องส่งผลตรวจแล้ว").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const left3 = await gone(label(t2, `งาน ${code2}`));
    const st2 = sql(`select status from "WorkOrder" where id=${id2}`);
    const picks2 = sql(`select count(*) from "PartsPick" where "workOrderId"=${id2}`);
    const waiting2 = sql(`select count(*) from "WorkOrderPart" where "workOrderId"=${id2} and kind='WAITING'`);
    const make2 = sql(`select coalesce(model,'') from "Machine" where "branchId"=${BID} and code='${MW2}'`);
    const logs2 = sql(`select count(*) filter (where action='MACHINE_BRAND_SET')||':'||count(*) filter (where action='INSPECTED' and note like '%เอาอะไหล่เดิมออกจากใบ%${hb1}%')
                       from "WorkOrderLog" where "workOrderId"=${id2}`);
    back3 && left3 && st2 === "NEW" && picks2 === "0" && waiting2 === "0" && make2 === "Huebsch" && logs2 === "1:1"
      ? pass("ส่งผลตรวจแบบไม่เลือกอะไหล่: กลับงานของฉัน · ฐานข้อมูล: ใบไป NEW ไม่มีรอบเลือกอะไหล่ · แถวที่เอาออกหายจากใบ (removed) · Machine.model = Huebsch + ประวัติบันทึกยี่ห้อ")
      : fail(`ใบสอง: กลับ=${back3}/${left3} status=${st2} picks=${picks2} waiting=${waiting2} model=${make2} logs=${logs2}`);
  } catch (e) {
    fail(String(e).split("\n").slice(0, 2).join(" "));
    await page?.screenshot({ path: path.join(__dirname, "parts-pick-fail.png") }).catch(() => {});
  } finally {
    errors.length ? fail(`error บนหน้า: ${errors[0]}`) : pass("ไม่มี error บนหน้า");
    for (const c of sessions) await c.close().catch(() => {});
    await browser.close();
    await cleanup().catch((e) => fail(`ลบข้อมูลทดสอบไม่สำเร็จ: ${e}`));
  }
})();
