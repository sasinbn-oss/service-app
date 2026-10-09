/**
 * ทีมรวม (TeamGroup) — ช่างที่สังกัดทีมรวมเห็นใบงานของทุกทีมที่ทีมรวมครอบคลุม
 *
 * จำไว้ในหน่วยความจำ 60 วินาที เพราะถูกถามทุกครั้งที่ช่างเปิดรายการใบงาน และฐานข้อมูลอยู่คนละ region
 * ทีมรวมแทบไม่เปลี่ยน — แก้ในแอปแล้วเรียก forgetTeamGroups() ให้เครื่องนี้ใช้ค่าใหม่ทันที
 */
import { prisma } from "../prisma";

export interface TeamGroupRow {
  name: string;
  covers: string[];
  allTeams: boolean;
}

let cache: { at: number; groups: Map<string, TeamGroupRow> } | null = null;

export async function teamGroups(): Promise<Map<string, TeamGroupRow>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.groups;
  const rows = await prisma.teamGroup.findMany({ select: { name: true, covers: true, allTeams: true } });
  cache = { at: Date.now(), groups: new Map(rows.map((r) => [r.name, r])) };
  return cache.groups;
}

export function forgetTeamGroups() {
  cache = null;
}

/** ทีมไหนบ้างที่ช่างทีมนี้เห็นงาน · all = ทุกทีม · null = ไม่มีทีม */
export interface Coverage {
  all: boolean;
  teams: string[];
}

export async function coverageOf(team: string | null): Promise<Coverage | null> {
  if (!team) return null;
  const g = (await teamGroups()).get(team);
  if (!g) return { all: false, teams: [team] };
  return { all: g.allTeams, teams: g.covers };
}

export function covers(c: Coverage | null, assignedTeam: string | null) {
  if (!c || assignedTeam === null) return false;
  return c.all || c.teams.includes(assignedTeam);
}
