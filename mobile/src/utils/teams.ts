/**
 * ทีมที่ช่างคนหนึ่งเลือกไว้ — Senior ช่างเลือกทีมช่างและทีมรวมได้หลายอัน (เจ้าของงานขอ ต.ค. 69)
 * ทุกอันได้สิทธิ์เต็มเท่ากัน ไม่มีทีม "หลัก" ในสายตาผู้ใช้
 *
 * เซิร์ฟเวอร์ส่ง teams (ทุกอัน) มาคู่กับ team (อันแรก) — ตัดสินที่เดียวตรงนี้ว่าอ่านช่องไหน แบบเดียวกับ regionsOf
 * เพราะเซิร์ฟเวอร์รุ่นก่อนส่งแค่ team ถ้าแต่ละหน้าอ่าน teams เองจะมีหน้าที่ลืมถอยกลับ แล้วช่างที่มีทีมอยู่จริงขึ้นว่า "ยังไม่มีทีม"
 * ชื่อทีมช่างกับชื่อทีมรวมอยู่ในรายการเดียวกันได้ เพราะทะเบียนห้ามตั้งชื่อทีมรวมซ้ำทีมช่าง
 */
export function teamsOf(u: { team?: string | null; teams?: string[] | null } | null | undefined): string[] {
  if (!u) return [];
  const out: string[] = [];
  for (const t of Array.isArray(u.teams) ? u.teams : [u.team]) if (t && !out.includes(t)) out.push(t);
  return out;
}

/** ข้อความทีมสำหรับแสดง — ตัวคั่นเดียวกับภาค (regionsText) คนอ่านจะได้เห็นแบบเดียวกันทุกที่ */
export function teamsText(teams: string[], prefix = "") {
  return teams.map((t) => prefix + t).join(" · ");
}

/**
 * ทีมที่จะส่งไปบันทึก — ส่ง team (อันแรก) คู่กับ teams เสมอ เหตุผลเดียวกับ regionsBody:
 * เว็บกับ backend deploy คนละ service ช่วงที่เว็บใหม่ขึ้นก่อน เซิร์ฟเวอร์รุ่นเก่าตัด teams ทิ้งเงียบ ๆ
 * ส่ง teams อย่างเดียวจะได้ Senior ที่ไม่มีทีมเลยโดยไม่มีใครรู้ · เซิร์ฟเวอร์ใหม่เห็นทั้งคู่ใช้ teams
 */
export function teamsBody(teams: string[]) {
  return { teams, team: teams[0] ?? null };
}

/** ข้อมูลทีมรวมเท่าที่ต้องใช้คำนวณ "เห็นใบงานของทีมไหน" */
export interface TeamGroupLike {
  name: string;
  covers: string[];
  allTeams: boolean;
}

/**
 * ทีมทั้งหมดที่ชุดทีมนี้เห็นใบงาน — ทีมช่าง = ตัวเอง · ทีมรวม = ทุกทีมที่ครอบคลุม · ทีมรวมแบบทุกทีม = ทั้งบริษัท
 * กฎเดียวกับ coverageOfUser ฝั่งเซิร์ฟเวอร์ (utils/teamGroups.ts) ใช้แค่บอกแอดมินบนการ์ด ไม่ใช่ตัวกันสิทธิ์
 * null = ทุกทีม
 */
export function coveredTeams(teams: string[], groups: TeamGroupLike[]): string[] | null {
  const out: string[] = [];
  for (const t of teams) {
    const g = groups.find((x) => x.name === t);
    if (g?.allTeams) return null;
    for (const c of g ? g.covers : [t]) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * คำอธิบายใต้ชื่อช่างในตัวเลือกผู้เข้าปฏิบัติงาน — ชื่อซ้ำกันเกิดขึ้นจริงในทีมช่าง รหัสพนักงานกับทีมเป็นตัวแยก
 * Senior ช่างบอกตำแหน่งแทนทีมแรก — ทีมแรกไม่ใช่ทีมหลัก บอกแค่ทีมแรกแล้วดูเหมือนอยู่ทีมเดียว
 */
export function techPickHint(t: { employeeCode: string; team?: string | null; senior?: boolean }) {
  if (t.senior) return `${t.employeeCode} · Senior ช่าง`;
  return `${t.employeeCode}${t.team ? ` · ${t.team}` : ""}`;
}
