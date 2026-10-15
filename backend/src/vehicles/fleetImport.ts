/**
 * นำเข้ารถจากไฟล์ "รถช่าง Service" ที่ฝ่ายบัญชี/จัดซื้อทำอยู่แล้ว (เจ้าของงานส่งมา ต.ค. 69)
 *
 * ไฟล์มีหลายตอนในชีตเดียว — "รถบริษัท" · "(รถเช่า) ORIX …" · "รถส่วนตัว ทีมหัวหน้าภาค" แต่ละตอนมีหัวตารางของตัวเอง
 * และคอลัมน์ไม่ตรงกันทุกตอน (ตอน ORIX ไม่มีหัวคอลัมน์วงเงินบัตร) จึงหาคอลัมน์จากชื่อหัวตารางของแต่ละตอน
 * ชีต "Easy pass" เอามาเติมเลขบัตร Easy Pass ให้รถคันเดียวกัน (จับคู่ด้วยทะเบียน)
 *
 * เลขบัตรเติมน้ำมัน/Easy Pass เก็บแค่ 4 ตัวท้าย — พอให้รู้ว่าบัตรใบไหนอยู่กับรถคันไหน
 * เลขเต็มคือของที่เอาไปใช้จ่ายได้ ไม่ควรอยู่ในระบบที่ช่างทุกคนเปิดดูได้
 *
 * รถส่วนตัวของหัวหน้าภาคไม่นำเข้า — ไม่ใช่รถที่ช่างเบิกไปใช้ได้ ขึ้นในหน้าตัวอย่างว่าข้ามพร้อมเหตุผล
 */
import ExcelJS from "exceljs";

export interface FleetRow {
  plateNumber: string;
  brand: string | null;
  type: string;
  owner: string | null;
  insCompany: string | null;
  note: string | null;
}

export interface FleetSkip {
  plateNumber: string;
  reason: string;
}

/** ตัดช่องว่าง/ขีดออก แล้วเว้นวรรคก่อนเลขท้าย — "3 ฒฉ 1984" "3ฒฉ1984" "4ฒฎ-580" กลายเป็นรูปเดียวกัน */
export function normalizePlate(raw: string): string {
  const compact = raw.replace(/[\s\-–]+/g, "");
  const m = compact.match(/^(.*?\D)(\d+)$/);
  return m ? `${m[1]} ${m[2]}` : compact;
}

/** ชื่อยี่ห้อในไฟล์สะกดหลายแบบ ("MITSU" "NISSON") — แปลงเป็นชื่อเดียว ไม่งั้นกรองตามยี่ห้อแยกเป็นหลายกลุ่ม */
const BRAND_NAMES: [RegExp, string][] = [
  [/^mitsu/i, "Mitsubishi"],
  [/^niss/i, "Nissan"],
  [/^toyota/i, "Toyota"],
  [/^isuzu/i, "Isuzu"],
  [/^chev/i, "Chevrolet"],
  [/^honda/i, "Honda"],
  [/^ford/i, "Ford"],
  [/^mazda/i, "Mazda"],
];
function brandName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return BRAND_NAMES.find(([re]) => re.test(t))?.[1] ?? t;
}

const lastDigits = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
};
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function readSheets(buf: Buffer): Promise<{ name: string; rows: string[][] }[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ — รองรับเฉพาะไฟล์ .xlsx");
  }
  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(String(row.getCell(c).text ?? "").trim());
      rows.push(cells);
    });
    return { name: ws.name, rows };
  });
}

/** เลขบัตร Easy Pass ตามทะเบียน — ชีตที่มีหัวคอลัมน์ "ทะเบียนรถ" กับ "รหัสบัตร" */
function easyPassByPlate(sheets: { rows: string[][] }[]) {
  const out = new Map<string, string>();
  for (const { rows } of sheets) {
    let plateCol = -1;
    let cardCol = -1;
    for (const cells of rows) {
      const p = cells.findIndex((c) => c.replace(/\s/g, "") === "ทะเบียนรถ");
      const k = cells.findIndex((c) => c.replace(/\s/g, "") === "รหัสบัตร");
      if (p >= 0 && k >= 0) {
        plateCol = p;
        cardCol = k;
        continue;
      }
      if (plateCol < 0 || !cells[plateCol]) continue;
      const last = lastDigits(cells[cardCol] ?? "");
      if (last) out.set(normalizePlate(cells[plateCol]).replace(/\s/g, ""), last);
    }
  }
  return out;
}

export async function parseFleetWorkbook(buf: Buffer): Promise<{ rows: FleetRow[]; skipped: FleetSkip[] }> {
  const sheets = await readSheets(buf);
  const easyPass = easyPassByPlate(sheets);
  const rows: FleetRow[] = [];
  const skipped: FleetSkip[] = [];
  const seen = new Set<string>();

  for (const { rows: sheetRows } of sheets) {
    let section: { type: string; personal: boolean } | null = null;
    let col: Record<string, number> | null = null;

    for (const cells of sheetRows) {
      // หัวตอนเป็นเซลล์ผสาน — ExcelJS คืนข้อความเดียวกันทุกช่องที่ผสาน จึงนับแบบไม่ซ้ำ
      // (ช่อง "สาขาเช็ครถ" ที่ผสานลงหลายแถวก็ซ้ำแบบนี้ ซึ่งถูกแล้ว — รถหลายคันเช็คที่เดียวกัน)
      const filled = [...new Set(cells.filter(Boolean))];
      // หัวตอน — แถวที่มีข้อความเดียว
      if (filled.length === 1 && !/^\d+$/.test(filled[0])) {
        const h = filled[0];
        if (/รถส่วนตัว/.test(h)) section = { type: "รถส่วนตัว", personal: true };
        else if (/รถเช่า/.test(h)) section = { type: `รถเช่า${/orix/i.test(h) ? " (ORIX)" : ""}`, personal: false };
        else if (/รถบริษัท/.test(h)) section = { type: "รถบริษัท", personal: false };
        col = null;
        continue;
      }
      // หัวตาราง — หาคอลัมน์จากชื่อ
      const plateCol = cells.findIndex((c) => c.replace(/\s/g, "") === "ทะเบียน");
      if (plateCol >= 0) {
        const find = (...keys: string[]) => cells.findIndex((c) => keys.some((k) => c.includes(k)));
        const ins = find("ประกัน");
        const limit = find("ยอดบัตร", "วงเงิน");
        col = {
          plate: plateCol,
          name: find("ชื่อผู้รับผิดชอบ", "ชื่อหัวหน้"),
          brand: find("ยี่ห้อ"),
          nick: find("ชื่อช่าง"),
          team: find("ทีมช่าง"),
          check: find("สาขาเช็ครถ", "เช็ครถ"),
          card: find("Card Number", "บัตร"),
          ins,
          // ตอน ORIX ไม่มีหัวคอลัมน์วงเงิน แต่ตัวเลขอยู่ถัดจากช่องประกันเหมือนตอนอื่น
          limit: limit >= 0 ? limit : ins >= 0 ? ins + 1 : -1,
        };
        continue;
      }
      if (!col || !section) continue;
      const at = (k: string) => (col![k] >= 0 ? cells[col![k]] ?? "" : "");
      const rawPlate = at("plate");
      if (!rawPlate) continue;
      const plateNumber = normalizePlate(rawPlate);
      const key = plateNumber.replace(/\s/g, "");
      // ข้อความท้ายแถวที่ไม่อยู่ใต้หัวคอลัมน์ไหน เช่น "รอส่งเรื่องขอสลับคัน" — เก็บเป็นหมายเหตุ
      const used = new Set(Object.values(col));
      const extra = cells.filter((c, i) => c && !used.has(i) && i > Math.max(...Object.values(col!))).map(clean);

      if (section.personal) {
        skipped.push({ plateNumber, reason: "รถส่วนตัวหัวหน้าภาค — ไม่ใช่รถให้เบิกใช้" });
        continue;
      }
      const name = clean(at("name"));
      if (!name) {
        skipped.push({
          plateNumber,
          reason: `ยังไม่มีผู้รับผิดชอบในไฟล์${extra.length ? ` (${extra.join(" · ")})` : ""}`,
        });
        continue;
      }
      if (seen.has(key)) {
        skipped.push({ plateNumber, reason: "ทะเบียนซ้ำในไฟล์ — ใช้แถวแรก" });
        continue;
      }
      seen.add(key);

      const team = clean(at("team"));
      const nick = clean(at("nick"));
      const card = lastDigits(at("card"));
      const limit = Number(at("limit").replace(/[,\s]/g, ""));
      const pass = easyPass.get(key);
      const notes = [
        card ? `บัตรเติมน้ำมัน ลงท้าย ${card}${limit > 0 ? ` · วงเงิน ${limit.toLocaleString("en-US")} บาท` : ""}` : null,
        pass ? `Easy Pass ลงท้าย ${pass}` : null,
        at("check") ? `เช็ครถที่: ${clean(at("check"))}` : null,
        ...extra.map((x) => `หมายเหตุ: ${x}`),
      ].filter(Boolean);
      rows.push({
        plateNumber,
        brand: brandName(at("brand")),
        type: section.type,
        // ทีมก่อนชื่อ — ในหน้ารวมรถคนหาด้วยทีม ("รถทีมขอนแก่นคันไหน") บ่อยกว่าหาด้วยชื่อ
        owner: [team, `${name}${nick ? ` (${nick})` : ""}`].filter(Boolean).join(" · "),
        insCompany: clean(at("ins")) || null,
        note: notes.length ? notes.join("\n") : null,
      });
    }
  }
  return { rows, skipped };
}
