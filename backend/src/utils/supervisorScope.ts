/**
 * ขอบเขตของหัวหน้าภาค — ใบงาน/สาขาไหนที่เห็นและแตะได้
 *
 * = สาขาในทุกภาคที่ตั้งไว้ (User.region + User.extraRegions) รวมกับทีมที่ดูแล (User.supervisedTeams)
 * ทุกภาคได้สิทธิ์เท่ากัน — เจ้าของงานกำหนด ต.ค. 69: ภาคที่เลือกเพิ่มต้องทำได้เหมือนภาคแรก ไม่ใช่ดูอย่างเดียว
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
  /** ภาคที่ดูแลทั้งหมด (ผ่าน cleanName แล้ว) — ว่าง = ดูแลตามทีมอย่างเดียว */
  regions: string[];
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

type SupervisorRow = { id: number; region: string | null; extraRegions?: string[] | null; supervisedTeams: string[] };

/**
 * ภาคทั้งหมดของผู้ใช้หนึ่งคน = region ตามด้วย extraRegions · ตัดค่าว่าง/ซ้ำ เรียงตามที่ตั้ง
 *
 * ทุกที่ที่อ่านภาคของคนต้องผ่านตัวนี้ — อ่าน region ตรง ๆ คือเห็นแค่ภาคแรก แล้วภาคที่เพิ่ม
 * ใช้ได้ในกล่องงานแต่หายจากรายงาน/หน้าผัง (หรือกลับกัน) โดยไม่มีอะไรเตือน
 * ?? [] — คอลัมน์เป็น NULL ได้ถ้ามีคนแก้ฐานข้อมูลตรง ๆ หรือกู้จากไฟล์สำรองก่อนมีคอลัมน์นี้
 */
export function regionsOf(u: { region: string | null; extraRegions?: string[] | null }): string[] {
  const out: string[] = [];
  for (const r of [u.region, ...(u.extraRegions ?? [])]) {
    const c = cleanName(r);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

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
      return [u.id, { regions: regionsOf(u), teams: u.supervisedTeams ?? [], claimed }];
    })
  );
}

export async function supervisorScope(userId: number): Promise<SupervisorScope> {
  const sups = await prisma.user.findMany({
    where: { OR: [{ id: userId }, { role: "SUPERVISOR", deletedAt: null }] },
    select: { id: true, region: true, extraRegions: true, supervisedTeams: true },
  });
  return scopesOf(sups).get(userId) ?? { regions: [], teams: [] };
}

type ScopedOrder = {
  jobType: string;
  assignedTeam: string | null;
  branch: { region: string | null; zone: string | null; pmTeam: string | null };
};

/**
 * ทีมประจำสาขาของงานประเภทนี้ — งาน PM มีทีมดูแลของตัวเอง (ไม่ได้ตั้งไว้ก็ทีม CM)
 * ตัวเดียวกับที่ประวัติใช้บอกว่า "ข้ามทีม" (teamNote ใน routes/workOrders.ts)
 */
export function ownTeamOf(wo: { jobType: string; branch: { zone: string | null; pmTeam: string | null } }) {
  return cleanName(wo.jobType === "PM" ? wo.branch.pmTeam ?? wo.branch.zone : wo.branch.zone);
}

/**
 * จ่ายข้ามทีม — ทีมที่รับงานไม่ใช่ทีมประจำสาขาของงานนี้ · สาขาที่ไม่มีทีมประจำไม่นับ (ไม่มีอะไรให้ข้าม)
 *
 * เจ้าของงานขอ ต.ค. 69: "ใบงานอยู่ในพื้นที่รับผิดชอบเรา แต่อยากจ่ายงานให้ทีมอื่นเข้าไป"
 * ใบยังเป็นของหัวหน้าภาคเจ้าของพื้นที่ (กดปล่อยงานเอง) · หัวหน้าภาคของทีมที่รับเห็นใบแต่ทำอะไรไม่ได้
 * · ช่างปิดงานได้ทั้งทีมที่รับและทีมประจำสาขา
 */
export function isCrossTeam(wo: ScopedOrder) {
  const own = ownTeamOf(wo);
  const sent = cleanName(wo.assignedTeam);
  return own !== null && sent !== null && own !== sent;
}

/**
 * ทีมที่ตัดสินว่าใบนี้เป็นของหัวหน้าภาคคนไหน (ทีมมาก่อนภาค) · ตัวเดียวกับที่โชว์ในเหตุผล "ไม่มีคนรับ"
 * ยังไม่จ่าย = ทีมประจำสาขา (CM ก่อน PM) · จ่ายแล้ว = ทีมประจำสาขาของงานประเภทนี้ ซึ่งคือทีมที่รับงานพอดี
 * ถ้าไม่ได้จ่ายข้ามทีม — จ่ายข้ามทีมไปแล้วใบจึงไม่ตามทีมที่รับไป · สาขาไม่มีทีมประจำ = ทีมที่รับงาน
 */
function teamOf(wo: ScopedOrder) {
  if (wo.assignedTeam === null) return cleanName(wo.branch.zone ?? wo.branch.pmTeam);
  return ownTeamOf(wo) ?? cleanName(wo.assignedTeam);
}

/** ทีมประจำสาขาของงาน (แบบ ownTeamOf) เข้าเงื่อนไข cond — ใช้ใน where ที่เทียบสองคอลัมน์ข้ามตารางตรง ๆ ไม่ได้ */
export function ownTeamWhere(cond: Prisma.StringNullableFilter): Prisma.WorkOrderWhereInput {
  return {
    OR: [
      { jobType: { not: "PM" }, branch: { zone: cond } },
      { jobType: "PM", branch: { pmTeam: cond } },
      { jobType: "PM", branch: { pmTeam: null, zone: cond } },
    ],
  };
}

const NO_OWN_TEAM: Prisma.WorkOrderWhereInput = {
  OR: [
    { jobType: { not: "PM" }, branch: { zone: null } },
    { jobType: "PM", branch: { zone: null, pmTeam: null } },
  ],
};

/**
 * ใบงานที่หัวหน้าภาคคนนี้ "เป็นเจ้าของ" (ทำขั้นของหัวหน้าภาคได้ · เข้ากล่องงาน) — ใส่ใน AND เสมอ
 * จะได้ไม่ชนกับ OR/branch ของตัวกรองอื่น · ที่เห็นได้ (รวมใบที่ทีมตัวเองรับข้ามทีมมา) ดู workOrderVisible
 */
export function workOrderInScope(s: SupervisorScope): Prisma.WorkOrderWhereInput {
  const or: Prisma.WorkOrderWhereInput[] = [];
  if (s.regions.length) {
    const c = s.claimed ?? [];
    // ทีมของใบ (teamOf) ต้องไม่ใช่ทีมที่คนอื่นดูแล — เขียนแยกกรณีเพราะ NOT IN ตัดแถว null ทิ้ง
    const unclaimed: Prisma.WorkOrderWhereInput = c.length
      ? {
          OR: [
            { assignedTeam: null, branch: { zone: { not: null, notIn: c } } },
            { assignedTeam: null, branch: { zone: null, OR: [{ pmTeam: null }, { pmTeam: { notIn: c } }] } },
            { assignedTeam: { not: null }, ...ownTeamWhere({ not: null, notIn: c }) },
            { AND: [{ assignedTeam: { not: null, notIn: c } }, NO_OWN_TEAM] },
          ],
        }
      : {};
    or.push({ AND: [{ branch: { region: { in: s.regions } } }, unclaimed] });
  }
  if (s.teams.length) {
    or.push(
      { branch: { zone: { in: s.teams } } },
      { branch: { pmTeam: { in: s.teams } } },
      // ตามทีมที่รับงานเฉพาะสาขาที่ไม่มีทีมประจำ — ใบที่จ่ายข้ามทีมเข้ามา คนดูแลทีมที่รับแค่เห็น
      { AND: [{ assignedTeam: { in: s.teams } }, NO_OWN_TEAM] }
    );
  }
  // ยังไม่ได้ตั้งภาคหรือทีม = ไม่เห็นอะไร (แบบเดิมที่ไม่มีภาค)
  return or.length ? { OR: or } : { id: -1 };
}

/** ใบที่จ่ายข้ามทีมมาให้ทีมเหล่านี้ (ทีมที่รับไม่ใช่ทีมประจำสาขา) — เทียบทีละทีมเพราะ where เทียบสองคอลัมน์ไม่ได้ */
function receivedWhere(teams: Iterable<string>): Prisma.WorkOrderWhereInput[] {
  return [...teams].map((t) => ({ assignedTeam: t, ...ownTeamWhere({ not: null, notIn: [t] }) }));
}

/**
 * ใบงานที่หัวหน้าภาคคนนี้ "เห็น" = ใบที่เป็นเจ้าของ + ใบในพื้นที่คนอื่นที่จ่ายข้ามทีมมาให้ทีมที่ตัวเองดูแล
 * (เจ้าของงานเลือก ต.ค. 69: เห็นทั้งสองคน คนจ่ายเป็นคนปล่อยงาน) — ใช้กับรายการ/แผนงาน ไม่ใช้กับกล่องงาน
 */
export async function workOrderVisible(s: SupervisorScope): Promise<Prisma.WorkOrderWhereInput> {
  const own = workOrderInScope(s);
  const received = receivedWhere(await teamsForSupervisor(s));
  return received.length ? { OR: [own, ...received] } : own;
}

/** หัวหน้าภาคคนนี้เป็นเจ้าของใบไหม (ทำขั้นของหัวหน้าภาคได้) — กติกาเดียวกับ workOrderInScope */
export function coversWorkOrder(s: SupervisorScope, wo: ScopedOrder) {
  // เทียบหลังทำความสะอาดชื่อ — ข้อมูลที่ยังไม่ผ่าน migration ล้างชื่อ (หรือหลุดมาทางอื่น) ก็ยังจับคู่ได้ ดู utils/names.ts
  const teams = new Set(s.teams.map(cleanName).filter(Boolean));
  const mine = (t: string | null) => {
    const c = cleanName(t);
    return c !== null && teams.has(c);
  };
  if (mine(wo.branch.zone) || mine(wo.branch.pmTeam)) return true;
  if (ownTeamOf(wo) === null && mine(wo.assignedTeam)) return true;
  const region = cleanName(wo.branch.region);
  if (!region || !s.regions.some((r) => cleanName(r) === region)) return false;
  const team = teamOf(wo);
  return !(team && (s.claimed ?? []).includes(team));
}

/**
 * หัวหน้าภาคคนนี้เปิดดูใบได้ไหม — เป็นเจ้าของ หรือใบถูกจ่ายข้ามทีมมาให้ทีมที่ดูแล (ดูอย่างเดียว)
 * teams = teamsForSupervisor ของคนนั้น
 */
export function seesWorkOrder(s: SupervisorScope, teams: Set<string>, wo: ScopedOrder) {
  if (coversWorkOrder(s, wo)) return true;
  const sent = cleanName(wo.assignedTeam);
  return isCrossTeam(wo) && sent !== null && teams.has(sent);
}

/**
 * ทีมประจำสาขาในแต่ละภาค — จำไว้ 60 วินาที รายการ/กล่องงานถามทุกครั้งที่โหลด (ฐานข้อมูลอยู่ไกล รอบละ ~0.2 วิ)
 * แก้ทีมของสาขาแล้วช้าไปไม่เกินนาที ไม่มีผลกับงาน
 */
let regionTeamCache: { at: number; byRegion: Map<string, string[]> } | null = null;
async function regionTeams(region: string): Promise<string[]> {
  if (!regionTeamCache || Date.now() - regionTeamCache.at > 60_000) {
    const rows = await prisma.branch.findMany({
      where: { cancelledAt: null, region: { not: null } },
      select: { region: true, zone: true, pmTeam: true },
      distinct: ["region", "zone", "pmTeam"],
    });
    const byRegion = new Map<string, string[]>();
    for (const r of rows) {
      const list = byRegion.get(r.region!) ?? [];
      for (const t of [r.zone, r.pmTeam].map(cleanName)) if (t && !list.includes(t)) list.push(t);
      byRegion.set(r.region!, list);
    }
    regionTeamCache = { at: Date.now(), byRegion };
  }
  return regionTeamCache.byRegion.get(region) ?? [];
}

/**
 * ทีมที่หัวหน้าภาคดูแล = ทีมที่ตั้งให้ดูแล + ทีมประจำสาขาในภาคที่ยังไม่มีหัวหน้าภาคคนอื่นดูแล (ชื่อผ่าน cleanName)
 * ทีม outsource จุดเรียกอนุญาตเพิ่มเอง — เจ้าของงานกำหนด ต.ค. 69: หัวหน้าภาคเห็นทีม OPL ของคนอื่นในช่องจ่ายงาน
 */
export async function teamsForSupervisor(s: SupervisorScope): Promise<Set<string>> {
  const out = new Set(s.teams.map(cleanName).filter((t): t is string => !!t));
  if (s.regions.length) {
    const claimed = new Set(s.claimed ?? []);
    for (const r of s.regions) for (const t of await regionTeams(r)) if (!claimed.has(t)) out.add(t);
  }
  return out;
}

export const OUT_OF_SCOPE = "ใบงานนี้ไม่อยู่ในภาคหรือทีมที่คุณดูแล";
/** เห็นใบได้แต่ไม่ใช่เจ้าของ (ทีมตัวเองรับงานข้ามทีมมา) — บอกให้รู้ว่าทำไมกดไม่ได้ ไม่ใช่ "ไม่อยู่ในภาค" ทั้งที่เปิดดูอยู่ */
export const VIEW_ONLY = "ใบนี้จ่ายข้ามทีมมาให้ทีมที่คุณดูแลเข้าทำ — หัวหน้าภาคเจ้าของพื้นที่เป็นคนจัดการ คุณดูได้อย่างเดียว";
