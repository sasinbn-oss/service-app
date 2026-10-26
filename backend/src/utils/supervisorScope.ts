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
import { cleanName } from "./names";

export interface SupervisorScope {
  region: string | null;
  teams: string[];
  /**
   * ทีมที่หัวหน้าภาค "คนอื่น" ดูแลอยู่ — ใบของทีมเหล่านี้ไม่เข้ามาทางภาค (ทีมมาก่อนภาค)
   *
   * เจ้าของงานกำหนด ต.ค. 69: สาขาในภาคกลางที่ทีมประจำคือ OPL ซึ่งมีหัวหน้าภาคดูแลอยู่แล้ว
   * เดิมเข้ากล่องทั้งคนดูแล OPL และคนดูแลภาคกลาง — สองคนเห็นใบเดียวกัน ไม่รู้ว่าใครต้องทำ
   * ไม่ส่งมา (undefined) = ไม่ตัดอะไร เหมือนเดิม
   */
  claimed?: string[];
}

type SupervisorRow = { id: number; region: string | null; supervisedTeams: string[] };

/** ขอบเขตของหัวหน้าภาคทุกคนจากรายชื่อชุดเดียว — claimed ของแต่ละคน = ทีมของคนอื่นที่ตัวเองไม่ได้ดูแล */
export function scopesOf(sups: SupervisorRow[]): Map<number, SupervisorScope> {
  const owners = new Map<string, Set<number>>();
  // ?? [] — คอลัมน์เป็น NULL ได้ถ้ามีคนแก้ฐานข้อมูลตรง ๆ (เทสต์เคยทำ) ไม่ควรทำให้ทั้งรายการพัง
  for (const u of sups)
    for (const t of u.supervisedTeams ?? []) {
      const c = cleanName(t);
      if (c) owners.set(c, (owners.get(c) ?? new Set()).add(u.id));
    }
  return new Map(
    sups.map((u) => {
      const mine = new Set((u.supervisedTeams ?? []).map(cleanName));
      const claimed = [...owners.entries()].filter(([t, ids]) => !mine.has(t) && [...ids].some((id) => id !== u.id)).map(([t]) => t);
      return [u.id, { region: u.region, teams: u.supervisedTeams ?? [], claimed }];
    })
  );
}

export async function supervisorScope(userId: number): Promise<SupervisorScope> {
  const sups = await prisma.user.findMany({
    where: { OR: [{ id: userId }, { role: "SUPERVISOR", deletedAt: null }] },
    select: { id: true, region: true, supervisedTeams: true },
  });
  return scopesOf(sups).get(userId) ?? { region: null, teams: [] };
}

/** ทีมของใบงาน — ทีมที่จ่ายไปแล้ว ไม่งั้นทีมประจำสาขา (CM ก่อน PM) · ตัวเดียวกับที่โชว์ในเหตุผล "ไม่มีคนรับ" */
function teamOf(wo: { assignedTeam: string | null; branch: { zone: string | null; pmTeam: string | null } }) {
  return cleanName(wo.assignedTeam ?? wo.branch.zone ?? wo.branch.pmTeam);
}

/** เงื่อนไขของใบงานในขอบเขต — ใส่ใน AND เสมอ จะได้ไม่ชนกับ OR/branch ของตัวกรองอื่น */
export function workOrderInScope(s: SupervisorScope): Prisma.WorkOrderWhereInput {
  const or: Prisma.WorkOrderWhereInput[] = [];
  if (s.region) {
    const c = s.claimed ?? [];
    // ทีมของใบ (assignedTeam ?? zone ?? pmTeam) ต้องไม่ใช่ทีมที่คนอื่นดูแล — เขียนแยกกรณีเพราะ NOT IN ตัดแถว null ทิ้ง
    const unclaimed: Prisma.WorkOrderWhereInput = c.length
      ? {
          OR: [
            { assignedTeam: { not: null, notIn: c } },
            { assignedTeam: null, branch: { zone: { not: null, notIn: c } } },
            { assignedTeam: null, branch: { zone: null, OR: [{ pmTeam: null }, { pmTeam: { notIn: c } }] } },
          ],
        }
      : {};
    or.push({ AND: [{ branch: { region: s.region } }, unclaimed] });
  }
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
  // เทียบหลังทำความสะอาดชื่อ — ข้อมูลที่ยังไม่ผ่าน migration ล้างชื่อ (หรือหลุดมาทางอื่น) ก็ยังจับคู่ได้ ดู utils/names.ts
  const teams = new Set(s.teams.map(cleanName).filter(Boolean));
  if ([wo.assignedTeam, wo.branch.zone, wo.branch.pmTeam].some((t) => {
    const c = cleanName(t);
    return c !== null && teams.has(c);
  }))
    return true;
  const region = cleanName(s.region);
  if (!region || cleanName(wo.branch.region) !== region) return false;
  const team = teamOf(wo);
  return !(team && (s.claimed ?? []).includes(team));
}

/**
 * ทีมที่หัวหน้าภาคจ่ายงานให้ได้ = ทีมที่ดูแล + ทีมประจำสาขาในภาคที่ยังไม่มีหัวหน้าภาคคนอื่นดูแล (ชื่อผ่าน cleanName)
 * ทีม outsource จุดเรียกอนุญาตเพิ่มเอง — เจ้าของงานกำหนด ต.ค. 69: หัวหน้าภาคเห็นทีม OPL ของคนอื่นในช่องจ่ายงาน
 */
export async function teamsForSupervisor(s: SupervisorScope): Promise<Set<string>> {
  const out = new Set(s.teams.map(cleanName).filter((t): t is string => !!t));
  if (s.region) {
    const claimed = new Set(s.claimed ?? []);
    const rows = await prisma.branch.findMany({
      where: { region: s.region, cancelledAt: null },
      select: { zone: true, pmTeam: true },
      distinct: ["zone", "pmTeam"],
    });
    for (const r of rows)
      for (const t of [r.zone, r.pmTeam].map(cleanName)) if (t && !claimed.has(t)) out.add(t);
  }
  return out;
}

export const OUT_OF_SCOPE = "ใบงานนี้ไม่อยู่ในภาคหรือทีมที่คุณดูแล";
