import { regionsOf } from "./supervisorScope";

/**
 * ใครยังไม่มีพื้นที่รับผิดชอบ — ช่างที่ไม่มีทีม หัวหน้าภาคที่ไม่มีทั้งภาคและทีมที่ดูแล
 *
 * นับชื่อทีม/ภาคที่ไม่มีในทะเบียนสาขาว่า "ยังไม่มี" ด้วย เพราะผลเหมือนกันทุกอย่าง: ใบงานผูกกับทีมของสาขา
 * ทีมที่ไม่มีสาขาใช้ (สะกดต่าง หรือทีมใหม่ตามบันทึกที่ยังไม่ได้ย้ายสาขาเข้า) จึงไม่มีงานให้เห็นเลย
 * หน้าสิทธิ์ผู้ใช้ใช้กฎเดียวกันนี้ (mobile/src/screens/ManageUsersScreen.tsx · coverageGap) — แก้ที่หนึ่งต้องแก้อีกที่
 */
export interface CoverageUser {
  role: string;
  team: string | null;
  region: string | null;
  extraRegions?: string[] | null;
  supervisedTeams: string[];
}

export function coverageGap(u: CoverageUser, teams: Set<string>, regions: Set<string>): string | null {
  if (u.role === "EMPLOYEE") {
    if (!u.team) return "ยังไม่ได้จัดทีม";
    if (!teams.has(u.team)) return `ทีม "${u.team}" ไม่มีในทะเบียนสาขา`;
    return null;
  }
  if (u.role === "SUPERVISOR") {
    // ภาคไหนก็ได้ที่ยังมีสาขา = มีพื้นที่แล้ว · ถามแค่ "มีงานให้เห็นไหม" ภาคที่ค้างชื่อเก่าหน้าสิทธิ์ผู้ใช้โชว์ให้เอาออกเอง
    const mine = regionsOf(u);
    if (mine.some((r) => regions.has(r)) || u.supervisedTeams.some((t) => teams.has(t))) return null;
    if (mine.length === 0 && u.supervisedTeams.length === 0) return "ยังไม่ได้ตั้งภาคหรือทีมที่ดูแล";
    return `ภาค/ทีมที่ตั้งไว้ไม่มีในทะเบียนสาขา (${[...mine, ...u.supervisedTeams].join(", ")})`;
  }
  return null;
}
