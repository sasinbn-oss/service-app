/**
 * ขอบเขตของหัวหน้าภาค — ใบงาน/สาขาไหนที่เห็นและแตะได้
 *
 * = สาขาในภาคที่ตั้งไว้ (User.region แบบเดิม) รวมกับทีมที่ดูแล (User.supervisedTeams)
 * ทีมนับทั้งทีมที่ดูแลสาขา (zone / pmTeam) และทีมที่ใบงานถูกจ่ายไป — ใบที่ยังไม่จ่าย
 * ต้องเห็นตามสาขา ไม่งั้นหัวหน้าภาคจะจ่ายงานใบนั้นไม่ได้เพราะมองไม่เห็น
 *
 * รวมไว้ที่เดียวเพราะเดิมเทียบภาคกระจายอยู่ 7 จุด เพิ่มเงื่อนไขทีละจุดแล้วลืมจุดหนึ่ง
 * = หัวหน้าภาคเห็นใบในรายการแต่กดทำต่อไม่ได้ (หรือกลับกัน)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export interface SupervisorScope {
  region: string | null;
  teams: string[];
}

export async function supervisorScope(userId: number): Promise<SupervisorScope> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { region: true, supervisedTeams: true } });
  return { region: me?.region ?? null, teams: me?.supervisedTeams ?? [] };
}

/** เงื่อนไขของใบงานในขอบเขต — ใส่ใน AND เสมอ จะได้ไม่ชนกับ OR/branch ของตัวกรองอื่น */
export function workOrderInScope(s: SupervisorScope): Prisma.WorkOrderWhereInput {
  const or: Prisma.WorkOrderWhereInput[] = [];
  if (s.region) or.push({ branch: { region: s.region } });
  if (s.teams.length) {
    or.push({ assignedTeam: { in: s.teams } }, { branch: { zone: { in: s.teams } } }, { branch: { pmTeam: { in: s.teams } } });
  }
  // ยังไม่ได้ตั้งภาคหรือทีม = ไม่เห็นอะไร (แบบเดิมที่ไม่มีภาค)
  return or.length ? { OR: or } : { id: -1 };
}

export function coversWorkOrder(
  s: SupervisorScope,
  wo: { assignedTeam: string | null; branch: { region: string | null; zone: string | null; pmTeam: string | null } }
) {
  if (s.region && wo.branch.region === s.region) return true;
  return [wo.assignedTeam, wo.branch.zone, wo.branch.pmTeam].some((t) => t !== null && s.teams.includes(t));
}

export const OUT_OF_SCOPE = "ใบงานนี้ไม่อยู่ในภาคหรือทีมที่คุณดูแล";
