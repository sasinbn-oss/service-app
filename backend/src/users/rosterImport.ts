/**
 * นำเข้ารายชื่อหัวหน้าภาคและช่างจากไฟล์ประกาศแบ่งทีม (.ods / .xlsx)
 *
 * ไฟล์ต้นทางคือบันทึกภายในที่ฝ่าย Service ใช้ประกาศอยู่แล้ว (เช่น 4 ต.ค. 69) ไม่ใช่แบบฟอร์ม
 * ที่ทำขึ้นมาให้ระบบอ่าน — จึงอ่านตามโครงของบันทึก แทนการบังคับให้แอดมินไปจัดไฟล์ใหม่:
 *
 *   "1. หัวหน้าภาค 5 ท่าน"                      → แถวข้างล่างเป็นหัวหน้าภาค
 *   "2.1 หัวหน้าภาค: ธนรัตต์ … (อาร์ม) — 20 คน"  → แถวข้างล่างเป็นช่างของหัวหน้าภาคคนนั้น
 *   "2.6 ทีมส่วนกลาง (…) — 8 คน"                  → ช่างที่ไม่มีหัวหน้าภาค
 *   แถวหัวตาราง "รหัสพนักงาน | ชื่อ-สกุล | ชื่อเล่น | ทีม / พื้นที่"  → บอกว่าคอลัมน์ไหนคืออะไร
 *
 * ชื่อพื้นที่ในบันทึกไม่จำเป็นต้องสะกดตรงกับทีมในทะเบียนสาขา — หน้าตัวอย่างเดาคู่ให้
 * แล้วแอดมินแก้เองทีละชื่อพื้นที่ก่อนกดยืนยัน
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";

export interface RosterPerson {
  code: string;
  /** ชื่อ-สกุลอย่างเดียว ไม่มีชื่อเล่น */
  fullName: string;
  nick: string | null;
  role: "SUPERVISOR" | "EMPLOYEE";
  /** ทีม/พื้นที่ตามที่เขียนในบันทึก */
  area: string | null;
  /** รหัสพนักงานของหัวหน้าภาค (ช่างที่อยู่ใต้หัวข้อ "หัวหน้าภาค: …") */
  supervisorCode: string | null;
  /** หัวข้อในบันทึกที่คนนี้อยู่ — ใช้จัดกลุ่มในหน้าตัวอย่าง */
  group: string;
}

/** ชื่อที่แสดงในระบบ — ชื่อเล่นช่วยให้หัวหน้าภาคหาเจอ เพราะในหน้างานเรียกกันด้วยชื่อเล่น */
export function displayName(p: Pick<RosterPerson, "fullName" | "nick">) {
  // ชื่อเล่นที่เป็นชื่อจริงอยู่แล้ว ("มนูญ สร้อยชื่น" ชื่อเล่น "มนูญ") ใส่ซ้ำก็ไม่ได้ช่วยอะไร
  if (!p.nick || p.fullName.split(/\s+/)[0] === p.nick) return p.fullName;
  return `${p.fullName} (${p.nick})`;
}

// ── อ่านไฟล์เป็นแถวของข้อความ ─────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : ENTITIES[e] ?? m
  );
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];

/**
 * อ่าน content.xml ของ .ods แบบไล่แท็ก — โครงของไฟล์ตายตัวพอ ไม่ต้องพึ่งตัวอ่าน XML เพิ่ม
 * แถว/ช่องที่ซ้ำ (number-*-repeated) จำกัดจำนวนไว้ ไฟล์จากโปรแกรมตารางมักมีช่องว่างซ้ำเป็นพัน
 */
async function odsRows(buf: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("ไม่ใช่ไฟล์ .ods ที่อ่านได้");
  const rows: string[][] = [];
  let row: string[] | null = null;
  let cell: string | null = null;
  let cellRepeat = 1;
  let rowRepeat = 1;
  let para = 0;
  let tableDepth = 0;
  const re = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(xml)); ) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (cell !== null && para > 0) cell += decode(text);
      continue;
    }
    if (tag === "table:table") {
      // อ่านเฉพาะแผ่นแรกที่มีข้อมูล แผ่นที่ลิงก์ไปไฟล์อื่นว่างอยู่แล้ว
      tableDepth += close ? -1 : selfClose ? 0 : 1;
      continue;
    }
    if (tableDepth === 0) continue;
    if (tag === "table:table-row") {
      if (!close) {
        row = [];
        rowRepeat = Math.min(Number(attr(attrs, "table:number-rows-repeated") ?? 1), 3);
        if (selfClose) row = null;
      } else if (row) {
        while (row.length && !row[row.length - 1]) row.pop();
        if (row.length) for (let i = 0; i < rowRepeat; i++) rows.push(row);
        row = null;
      }
    } else if (tag === "table:table-cell" || tag === "table:covered-table-cell") {
      if (!close) {
        cellRepeat = Math.min(Number(attr(attrs, "table:number-columns-repeated") ?? 1), 40);
        if (selfClose) {
          for (let i = 0; i < cellRepeat; i++) row?.push("");
        } else cell = "";
      } else if (cell !== null) {
        const v = cell.trim();
        for (let i = 0; i < cellRepeat; i++) row?.push(v);
        cell = null;
      }
    } else if (tag === "text:p") {
      if (!close && !selfClose) {
        if (cell && para === 0) cell += "\n";
        para++;
      } else if (close) para--;
    } else if (tag === "text:s" && cell !== null) {
      cell += " ".repeat(Number(attr(attrs, "text:c") ?? 1));
    } else if ((tag === "text:line-break" || tag === "text:tab") && cell !== null) {
      cell += tag === "text:tab" ? " " : "\n";
    }
  }
  return rows;
}

async function xlsxRows(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((r) => {
    const cells: string[] = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      cells[col - 1] = (c.text ?? "").trim();
    });
    rows.push(Array.from(cells, (v) => v ?? ""));
  });
  return rows;
}

export async function readRows(buf: Buffer, fileName: string): Promise<string[][]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ods")) return odsRows(buf);
  if (lower.endsWith(".xlsx")) return xlsxRows(buf);
  throw new Error("รองรับเฉพาะไฟล์ .ods และ .xlsx");
}

// ── แปลงแถวเป็นรายชื่อ ───────────────────────────────────

const stripNick = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();

export function parseRoster(rows: string[][]): { people: RosterPerson[]; problems: string[] } {
  const people: RosterPerson[] = [];
  const problems: string[] = [];
  let cols: { code: number; name: number; nick: number; area: number } | null = null;
  let role: RosterPerson["role"] | null = null;
  let supervisorName: string | null = null;
  let group = "";

  for (const raw of rows) {
    const cells = raw.map((c) => (c ?? "").trim());
    const filled = cells.filter(Boolean);
    const at = (i: number) => (i >= 0 ? cells[i] ?? "" : "");

    // แถวหัวตาราง — หาคอลัมน์จากชื่อ ไม่ยึดตำแหน่ง (บันทึกแต่ละรอบเลื่อนคอลัมน์ได้)
    const codeCol = cells.findIndex((c) => c.replace(/\s/g, "") === "รหัสพนักงาน");
    if (codeCol >= 0) {
      const find = (...keys: string[]) => cells.findIndex((c) => keys.some((k) => c.includes(k)));
      cols = {
        code: codeCol,
        name: find("ชื่อ-สกุล", "ชื่อ - สกุล", "ชื่อสกุล"),
        nick: find("ชื่อเล่น"),
        area: find("พื้นที่", "ทีม"),
      };
      continue;
    }

    // หัวข้อ — แถวที่มีข้อความช่องเดียว
    if (filled.length === 1) {
      const h = filled[0];
      const sup = h.match(/หัวหน้าภาค\s*:\s*(.+?)(?:\s+[—–-]\s+\d+\s*คน)?\s*$/);
      if (sup) {
        role = "EMPLOYEE";
        supervisorName = stripNick(sup[1]);
        group = `ช่างของ ${sup[1].trim()}`;
      } else if (/หัวหน้าภาค\s*:\s*$/.test(h)) {
        // หัวข้อจากแบบฟอร์มที่ยังไม่ได้พิมพ์ชื่อหัวหน้าภาค — ถ้ามีช่างใต้หัวข้อนี้ ต้องเตือน
        // ไม่ใช่ถือเป็นช่างไม่มีหัวหน้าภาคเงียบ ๆ (หัวหน้าภาคจะไม่ได้ทีมของคนกลุ่มนี้)
        role = "EMPLOYEE";
        supervisorName = "";
        group = "ช่างในหัวข้อที่ยังไม่ได้ใส่ชื่อหัวหน้าภาค";
      } else if (/^\d+\.\s*หัวหน้าภาค/.test(h)) {
        role = "SUPERVISOR";
        supervisorName = null;
        group = "หัวหน้าภาค";
      } else if (/^\d+(\.\d+)+\s/.test(h)) {
        // หัวข้อย่อยอื่น (เช่น ทีมส่วนกลาง) — ช่างที่ไม่มีหัวหน้าภาค
        role = "EMPLOYEE";
        supervisorName = null;
        group = h.replace(/^\d+(\.\d+)+\s*/, "").replace(/\s+[—–-]\s+\d+\s*คน\s*$/, "");
      }
      continue;
    }

    if (!cols || !role) continue;
    const code = at(cols.code).replace(/\s/g, "");
    if (!/^\d{3,12}$/.test(code)) continue;
    const name = at(cols.name);
    if (!name) {
      problems.push(`${code}: ไม่มีชื่อ — ข้ามแถวนี้`);
      continue;
    }
    const nick = at(cols.nick);
    people.push({
      code,
      fullName: stripNick(name),
      nick: nick && nick !== "-" ? nick : null,
      role,
      area: at(cols.area).replace(/\s+/g, " ") || null,
      supervisorCode: supervisorName,
      group,
    });
  }

  // หัวข้อ "หัวหน้าภาค: ชื่อ" ระบุคนด้วยชื่อ — เทียบกับรายชื่อหัวหน้าภาคข้างบนให้ได้รหัสพนักงาน
  const supByName = new Map(people.filter((p) => p.role === "SUPERVISOR").map((p) => [p.fullName, p.code]));
  for (const p of people) {
    if (p.role !== "EMPLOYEE" || p.supervisorCode === null) continue;
    if (p.supervisorCode === "") {
      problems.push(`${p.code} ${p.fullName}: หัวข้อ "หัวหน้าภาค:" ที่อยู่ ยังไม่ได้ใส่ชื่อหัวหน้าภาค`);
      p.supervisorCode = null;
      continue;
    }
    const code = supByName.get(p.supervisorCode);
    if (!code) problems.push(`${p.code} ${p.fullName}: ไม่พบหัวหน้าภาค "${p.supervisorCode}" ในรายชื่อหัวหน้าภาค`);
    p.supervisorCode = code ?? null;
  }

  const seen = new Map<string, number>();
  for (const p of people) seen.set(p.code, (seen.get(p.code) ?? 0) + 1);
  for (const [code, n] of seen) if (n > 1) problems.push(`รหัสพนักงาน ${code} ซ้ำ ${n} แถว — ใช้แถวแรก`);
  const unique = people.filter((p, i) => people.findIndex((q) => q.code === p.code) === i);
  return { people: unique, problems };
}

// ── จับคู่ชื่อพื้นที่กับทีมในทะเบียนสาขา ─────────────────────

/** ตัดสิ่งที่เขียนต่างกันได้โดยหมายถึงทีมเดียวกัน: ช่องว่าง จุด "กทม." "ฯ" ตัวพิมพ์ (ไม่ตัด "กรุงเทพ" — มีทีมชื่อนี้จริง) */
export function normaliseTeam(s: string) {
  return s.toLowerCase().replace(/กทม\.?|ฯ|[\s.\-_/()]/g, "");
}

/**
 * เดาทีมของชื่อพื้นที่ — ตรงกันหลังตัดส่วนที่เขียนต่างกันได้ หรือฝั่งหนึ่งอยู่ในอีกฝั่ง
 * แบบมีคู่เดียว ("ลาดพร้าว" กับ "กทม. ลาดพร้าว") เจอหลายคู่ = ไม่เดา ให้แอดมินเลือกเอง
 */
export function suggestTeam(area: string, teams: string[]): string | null {
  const a = normaliseTeam(area);
  if (!a) return null;
  const exact = teams.filter((t) => normaliseTeam(t) === a);
  if (exact.length === 1) return exact[0];
  const partial = teams.filter((t) => {
    const n = normaliseTeam(t);
    return n.length >= 2 && (n.includes(a) || a.includes(n));
  });
  return partial.length === 1 ? partial[0] : null;
}
