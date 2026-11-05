// ทดสอบ: เพิ่มสาขาด้วยรหัสของสาขาที่ปิดแล้ว (เจ้าของงานตัดสิน 4 พ.ย. 69 — "เปลี่ยนใหม่ คือข้อมูลใหม่ทั้งหมด เเต่ยังเก็บประวัติเก่าอยู่")
//   · กด "เพิ่มสาขา" ด้วยรหัสนั้น (พิมพ์ตัวเล็ก) → กล่องยืนยันของแอปเอง (วาดใน <body> ชั้น data-otteri-overlay อยู่บนหน้าต่างเพิ่มสาขา)
//     บอกชื่อ วันปิด ใบงาน เครื่อง รหัสที่สาขาเดิมจะได้ และทางเปิดสาขาเดิมอีกครั้ง
//   · "ยกเลิก" → ฐานไม่เปลี่ยน หน้าต่างเพิ่มสาขายังเปิดพร้อมค่าที่กรอก · ไม่เหลือ [inert]
//   · "เพิ่มเป็นสาขาใหม่" → ฐาน: สาขาเดิม "(เดิม)" + originalCode · สาขาใหม่ reusedFromId · ประวัติสองสาขา · แถบแจ้งผลบอกรหัสใหม่ของสาขาเดิม
//   · ค้นรหัสในแท็บเปิดอยู่ (aria-selected) → สองแถว แถวเดิมขึ้น "ZZW001 (เดิม)" บรรทัดเดียว + ป้ายปิดแล้ว
//   · แผงแก้ไขสาขาเดิม: รหัสเดิมไปไหน · ประวัติ · ไม่มีปุ่มเปิดอีกครั้ง (บอกเหตุผลแทน) · แผงสาขาใหม่: รับรหัสมาจากไหน + ประวัติ
//   · ที่อยู่หน้า "เคลมสาขานี้" ของรหัส "(เดิม)" เข้ารหัสวงเล็บ (ลิงก์ไม่จบด้วย ")") เปิดแล้วตัวกรองได้รหัสครบ
//   · จอแคบ: การ์ดสาขาเดิมขึ้นรหัส "(เดิม)" ไม่ล้นข้าง
// ใช้สาขา ZZW… ของตัวเอง + ใบงานหนึ่งใบ (purgeOrders) ลบตอนจบ (ต้องมี DATABASE_URL) · **รีสตาร์ท Expo ก่อนรัน**
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { purgeOrders } = require("./purge");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL.split("?")[0]}" -qAt -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const API = "http://127.0.0.1:4000/api";
const BASE = process.env.APP_URL || "http://localhost:8081";

const cleanup = () => sql(`delete from "Branch" where code like 'ZZW%';`);

(async () => {
  const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
  const pass = (m) => console.log("PASS", m);
  const errors = [];
  cleanup();
  const oldName = "ร้านเดิมทดสอบเว็บ ปั๊มนครปฐม";
  const newName = "ร้านใหม่ทดสอบเว็บ ศรีสุนทร ภูเก็ต";
  const token = (await (await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "A001", password: "test1234" }),
  })).json()).token;
  const call = (method, path, body) => fetch(`${API}/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
  const adminName = sql(`select name from "User" where "employeeCode"='A001'`);
  let woId = null;

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ["--no-sandbox"],
  });
  async function open(viewport) {
    const page = await (await browser.newContext({ viewport })).newPage();
    await page.addInitScript(() => localStorage.setItem("otteri-side-groups", "[]"));
    page.on("pageerror", (e) => errors.push(String(e)));
    const vis = (t) => page.getByText(t, { exact: true }).locator("visible=true");
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 180000 });
    await page.getByPlaceholder("รหัสพนักงาน").fill("A001");
    await page.getByPlaceholder("รหัสผ่าน").fill("test1234");
    await vis("เข้าสู่ระบบ").click();
    await page.waitForTimeout(3500);
    if (viewport.width < 700) {
      await page.getByLabel("เปิดเมนู").click();
      await page.waitForTimeout(1000);
    }
    await vis("ระบบหลังบ้าน").first().click();
    await page.waitForTimeout(2000);
    await vis("จัดการข้อมูลสาขา").last().click();
    await page.waitForTimeout(4000);
    return page;
  }
  // กล่องยืนยัน/แถบแจ้งผลของแอป — ชั้นที่วาดใน <body> นอก #root (Overlay.web.tsx)
  const overlayText = (page) => page.evaluate(() => [...document.querySelectorAll("[data-otteri-overlay]")].map((n) => n.innerText).join("\n"));
  try {
    // สาขาเดิม: ใบงาน 1 ใบ เครื่อง W1 แล้วปิด — ทางเดียวกับที่แอดมินปิดสาขาจริง
    const created = await call("POST", "branches", { code: "ZZW001", name: oldName });
    const oldId = created.id;
    const wo = await call("POST", "work-orders", { branchCode: "ZZW001", jobType: "CM", priority: "NORMAL", machines: [{ code: "W1", symptom: "ทดสอบเว็บใช้รหัสซ้ำ" }] });
    woId = wo.orders ? wo.orders[0].id : wo.id;
    await call("POST", `branches/${oldId}/close`, { note: "ปั๊มปิดทดสอบเว็บ" });
    const closedDay = sql(`select "cancelledAt" from "Branch" where id=${oldId}`);
    const closedText = new Date(closedDay.replace(" ", "T") + "Z").toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });
    const dbState = () => sql(`select string_agg(code||'|'||coalesce("originalCode",'-')||'|'||coalesce("reusedFromId"::text,'-'), ',' order by id) from "Branch" where code like 'ZZW%'`);

    const page = await open({ width: 1400, height: 900 });
    const label = (l) => page.getByLabel(l, { exact: true });
    const text = async (l) => ((await label(l).count()) ? await label(l).first().innerText() : "");

    // ── เพิ่มสาขาด้วยรหัสของสาขาที่ปิดแล้ว ──
    await label("เพิ่มสาขา").click();
    await page.waitForTimeout(1200);
    const addPanel = page.getByLabel("แผงเพิ่มสาขา");
    await addPanel.getByLabel("รหัสสาขา").fill("zzw001");
    await addPanel.getByLabel("ชื่อสาขา").fill(newName);
    await page.getByLabel("บันทึกสาขาใหม่").click();
    await page.waitForTimeout(2000);
    const dlg = await overlayText(page);
    const want = [
      "รหัส ZZW001 เป็นของสาขาที่ปิดแล้ว",
      `${oldName} (ปิดเมื่อ ${closedText}) · ใบงาน 1 ใบ · เครื่อง 1 เครื่อง`,
      "เพิ่มเป็นสาขาใหม่ด้วยรหัสนี้? สาขาเดิมเก็บใบงาน เครื่อง และประวัติไว้ครบ รหัสของสาขาเดิมจะเปลี่ยนเป็น “ZZW001 (เดิม)”",
      "ถ้าเป็นสาขาเดิมกลับมาเปิด ให้กด “เปิดสาขาอีกครั้ง” ที่สาขาเดิมแทน",
    ];
    want.every((w) => dlg.includes(w)) ? pass("กล่องยืนยัน: ชื่อ วันปิด ใบงาน 1 เครื่อง 1 · รหัสที่สาขาเดิมจะได้ · ทางเปิดสาขาเดิมอีกครั้ง") : fail(`กล่องยืนยัน: ${dlg}`);
    // กล่องต้องอยู่บนหน้าต่างเพิ่มสาขา (Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ — ชั้นนี้วาดใน <body>)
    const onTop = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("[data-otteri-overlay] *")].find((n) => n.textContent === "เพิ่มเป็นสาขาใหม่" && n.children.length === 0);
      if (!btn) return "ไม่มีปุ่ม";
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && !!hit.closest("[data-otteri-overlay]") && !hit.closest("#root") ? "ok" : `ถูกบังโดย ${hit && hit.outerHTML.slice(0, 80)}`;
    });
    onTop === "ok" ? pass("ปุ่ม “เพิ่มเป็นสาขาใหม่” อยู่บนสุด (ชั้นใน <body> นอก #root)") : fail(`ปุ่มยืนยัน: ${onTop}`);
    dbState() === `ZZW001|-|-` ? pass("ยังไม่ยืนยัน: ฐานไม่เปลี่ยน (สาขาเดียว รหัสเดิม)") : fail(`ถามแล้วฐานเปลี่ยน: ${dbState()}`);

    // ── ยกเลิก ──
    await page.locator("[data-otteri-overlay]").getByText("ยกเลิก", { exact: true }).click();
    await page.waitForTimeout(1000);
    const after = await overlayText(page);
    const inert = await page.evaluate(() => document.querySelectorAll("[inert]").length);
    !after.includes("เป็นของสาขาที่ปิดแล้ว") && inert === 0 && dbState() === `ZZW001|-|-`
      && (await addPanel.getByLabel("รหัสสาขา").inputValue()) === "zzw001" && (await addPanel.getByLabel("ชื่อสาขา").inputValue()) === newName
      ? pass("ยกเลิก: กล่องปิด ฐานไม่เปลี่ยน หน้าต่างเพิ่มสาขายังเปิดพร้อมค่าที่กรอก ไม่เหลือ [inert]")
      : fail(`ยกเลิก: กล่อง ${after.slice(0, 80)} · inert ${inert} · ${dbState()}`);

    // ── ยืนยัน ──
    await page.getByLabel("บันทึกสาขาใหม่").click();
    await page.waitForTimeout(2000);
    await page.locator("[data-otteri-overlay]").getByText("เพิ่มเป็นสาขาใหม่", { exact: true }).click();
    await page.waitForTimeout(2500);
    const newId = sql(`select id from "Branch" where code='ZZW001'`);
    dbState() === `ZZW001 (เดิม)|ZZW001|-,ZZW001|-|${oldId}` && newId !== String(oldId)
      ? pass("ยืนยัน (ฐาน): สาขาเดิม “ZZW001 (เดิม)” + originalCode · สาขาใหม่รหัส ZZW001 อ้างสาขาเดิม") : fail(`ฐานหลังยืนยัน: ${dbState()}`);
    const logs = sql(`select string_agg(action||'|'||coalesce("byName",'-'), ',' order by id) from "BranchLog" where "branchId" in (${oldId}, ${newId}) and action like 'CODE_%'`);
    logs === `CODE_RETIRED|${adminName},CODE_REUSED|${adminName}` ? pass("ฐาน: ประวัติสองสาขา (CODE_RETIRED · CODE_REUSED) พร้อมชื่อคนทำ") : fail(`ประวัติ: ${logs}`);
    const toast = await overlayText(page);
    toast.includes("เพิ่มสาขา ZZW001 แล้ว — สาขาเดิมเปลี่ยนเป็น “ZZW001 (เดิม)” — ใบงาน เครื่อง และประวัติอยู่กับสาขาเดิมครบ")
      && (await page.getByLabel("แผงเพิ่มสาขา").count()) === 0
      ? pass("แถบแจ้งผลบอกว่าสาขาเดิมเปลี่ยนเป็น “ZZW001 (เดิม)” · หน้าต่างเพิ่มสาขาปิด") : fail(`แจ้งผล: ${toast}`);
    sql(`select "branchId" from "WorkOrder" where id=${woId}`) === String(oldId) && sql(`select count(*) from "Machine" where "branchId"=${oldId}`) === "1"
      ? pass("ใบงานและเครื่องยังอยู่กับสาขาเดิม (ฐานข้อมูล)") : fail("ใบงาน/เครื่องย้าย");

    // ── ค้นรหัส ──
    await label("ค้นหาสาขา").fill("ZZW001");
    await page.waitForTimeout(1800);
    const openTile = page.getByLabel(/^ตัวกรอง สาขาที่เปิดอยู่/).first();
    const closedTile = page.getByLabel(/^ตัวกรอง ปิดแล้ว/).first();
    const oldRow = label("สาขา ZZW001 (เดิม)");
    const newRow = label("สาขา ZZW001");
    (await openTile.getAttribute("aria-selected")) === "true" && (await closedTile.getAttribute("aria-selected")) === "false"
      && (await oldRow.count()) === 1 && (await newRow.count()) === 1
      ? pass("ค้น ZZW001 ในแท็บเปิดอยู่ (aria-selected): เห็นทั้งสาขาใหม่และ “ZZW001 (เดิม)”")
      : fail(`ค้นรหัส: แท็บ ${await openTile.getAttribute("aria-selected")}/${await closedTile.getAttribute("aria-selected")} · แถวเดิม ${await oldRow.count()} · แถวใหม่ ${await newRow.count()}`);
    const oldRowText = await oldRow.innerText();
    // บรรทัดเดียว = สูงพอ ๆ กับช่องรหัสของสาขาใหม่ (ช่องมี padding ในตัว เทียบกับตัวเลขตายตัวไม่ได้) — สองบรรทัดแถวสูงไม่เท่าแถวอื่น
    // ต่างกันได้ราว 4px: บรรทัดที่มีอักษรไทย (สระบน/ล่าง) สูงกว่าบรรทัดอังกฤษล้วน · ตัดสองบรรทัดจะสูงขึ้นอีกเกือบ 20px
    const codeBox = await oldRow.getByText("ZZW001 (เดิม)", { exact: true }).boundingBox();
    const newBox = await newRow.getByText("ZZW001", { exact: true }).boundingBox();
    oldRowText.includes(oldName) && oldRowText.includes("ปิดแล้ว") && codeBox && newBox && codeBox.height - newBox.height < 10
      ? pass(`แถวสาขาเดิม: รหัส “ZZW001 (เดิม)” บรรทัดเดียว (สูง ${Math.round(codeBox.height)}px · ช่องรหัสสาขาใหม่ ${Math.round(newBox.height)}px) + ชื่อเดิม + ป้ายปิดแล้ว`)
      : fail(`แถวเดิม: ${oldRowText.replace(/\n/g, " / ")} · รหัสเดิม ${JSON.stringify(codeBox)} · รหัสใหม่ ${JSON.stringify(newBox)}`);

    // ── แผงแก้ไขสาขาเดิม ──
    await oldRow.click();
    await page.waitForTimeout(2000);
    const note = await text("รหัสเดิมของสาขา");
    const hist = await text("ประวัติสาขา");
    note.includes(`รหัสเดิม ZZW001 — ใช้กับสาขาใหม่ “${newName}” แล้ว`)
      && hist.includes(`รหัส ZZW001 ไปใช้กับสาขาใหม่ “${newName}” — สาขานี้เปลี่ยนเป็น “ZZW001 (เดิม)”`) && hist.includes("ปิดสาขา — ปั๊มปิดทดสอบเว็บ")
      ? pass("แผงสาขาเดิม: บอกว่ารหัสไปอยู่ที่สาขาใหม่ · ประวัติมีรายการยกรหัส + ปิดสาขา") : fail(`แผงเดิม: ${note} · ${hist}`);
    (await label("เปิดสาขาอีกครั้ง").count()) === 0 && (await text("เหตุผลที่เปิดอีกครั้งไม่ได้")).includes(`เปิดอีกครั้งไม่ได้ — รหัส ZZW001 ใช้กับสาขาใหม่ “${newName}” แล้ว`)
      ? pass("สาขาเดิม: ไม่มีปุ่มเปิดอีกครั้ง บอกเหตุผลแทน") : fail("ปุ่มเปิดสาขาเดิมยังอยู่");

    // ── แผงแก้ไขสาขาใหม่ ──
    await newRow.click();
    await page.waitForTimeout(2000);
    const nnote = await text("รับรหัสต่อจากสาขาที่ปิดแล้ว");
    nnote.includes(`รับรหัสต่อจากสาขาที่ปิดแล้ว ZZW001 (เดิม) “${oldName}”`) && nnote.includes("ไฟล์สาขายกเลิกไม่ปิดสาขานี้")
      && (await text("ประวัติสาขา")).includes(`รับรหัส ZZW001 ต่อจากสาขาที่ปิดแล้ว “${oldName}” (ตอนนี้ “ZZW001 (เดิม)”)`)
      ? pass("แผงสาขาใหม่: รับรหัสมาจากสาขาไหน · ทำไมไฟล์สาขายกเลิกไม่ปิด · ประวัติ") : fail(`แผงใหม่: ${nnote} · ${await text("ประวัติสาขา")}`);

    // ── ที่อยู่หน้าของรหัส "(เดิม)" ──
    const enc = encodeURIComponent("ZZW001 (เดิม)");
    await page.goto(`${BASE}/?t=${Date.now()}#/reports/claims?branch=${enc}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(4000);
    const hash = await page.evaluate(() => location.hash);
    const deep = await page.getByText("สาขา ZZW001 (เดิม) · ทุกช่วงเวลา", { exact: false }).locator("visible=true").count();
    deep > 0 && hash.includes("%28") && hash.includes("%29") && !hash.endsWith(")")
      ? pass(`ที่อยู่ “เคลมสาขานี้” ของสาขาเดิม: ตัวกรองได้รหัสครบ · วงเล็บถูกเข้ารหัส (${hash})`) : fail(`ที่อยู่: ${hash} · ตัวกรอง ${deep}`);

    // ── จอแคบ ──
    const narrow = await open({ width: 420, height: 860 });
    await narrow.getByLabel("ค้นหาสาขา").fill("ZZW001");
    await narrow.waitForTimeout(1800);
    const card = narrow.getByLabel("สาขา ZZW001 (เดิม)", { exact: true });
    const sw = await narrow.evaluate(() => document.documentElement.scrollWidth);
    (await card.count()) === 1 && (await card.innerText()).includes("ZZW001 (เดิม)") && sw <= 420
      ? pass("จอแคบ: การ์ดสาขาเดิมขึ้นรหัส “ZZW001 (เดิม)” ไม่ล้นข้าง") : fail(`จอแคบ: การ์ด ${await card.count()} · กว้าง ${sw}`);

    errors.length ? fail(`error บนหน้า: ${errors.join(" | ")}`) : pass("ไม่มี error บนหน้า");
  } catch (e) {
    fail(e.stack || String(e));
  } finally {
    await purgeOrders(token, [woId]);
    cleanup();
    await browser.close();
  }
})();
