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

/** ทีมไหนบ้างที่ช่างทีมนี้เห็นงาน · all = ทุกทีม · null = ไม่มีทีม (ทั้งคน — ใช้ coverageOfUser ไม่ใช่ coverageOf(user.team)) */
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

/** คอลัมน์ที่ teamsOf ต้องใช้ — select ชุดนี้ทุกที่ที่คิดขอบเขตช่าง จะได้ไม่มีที่ไหนลืม extraTeams */
export const TEAM_HOLDER_SELECT = { role: true, team: true, extraTeams: true } as const;

export interface TeamHolder {
  role: string;
  team: string | null;
  extraTeams?: string[] | null;
}

/**
 * ทีม/ทีมรวมทั้งหมดที่คนนี้ถือ (อันแรก = team) — Senior ช่างเลือกได้หลายอัน ช่างธรรมดามีอันเดียว
 *
 * อ่าน extraTeams เฉพาะ SENIOR_TECH: ขอบเขตช่างคิดให้ทุกคนที่ไม่ใช่แอดมิน/หัวหน้าภาค ถ้าอ่านทุก role
 * ค่าค้างของคนที่ถูกลดเป็นช่างธรรมดา (หรือแก้ฐานข้อมูลด้วยมือ) จะกลายเป็นสิทธิ์เห็นงานหลายทีมเงียบ ๆ
 * ไม่ทำความสะอาดชื่อตรงนี้ — ทุกทางที่เขียนล้างชื่อแล้ว และต้องเทียบตรงตัวกับ WorkOrder.assignedTeam
 */
export function teamsOf(u: TeamHolder): string[] {
  const out: string[] = [];
  for (const t of [u.team, ...(u.role === "SENIOR_TECH" ? u.extraTeams ?? [] : [])]) if (t && !out.includes(t)) out.push(t);
  return out;
}

/** รวมขอบเขตของหลายชื่อ (ทีม = ทีมนั้น · ทีมรวม = ทีมที่ครอบคลุม) — ทีมรวมแบบทุกทีมอันเดียวก็ได้ทั้งบริษัท */
export async function coverageOfTeams(names: string[]): Promise<Coverage | null> {
  if (!names.length) return null;
  const teams = new Set<string>();
  for (const n of names) {
    const c = await coverageOf(n);
    if (!c) continue;
    if (c.all) return { all: true, teams: [] };
    for (const t of c.teams) teams.add(t);
  }
  return { all: false, teams: [...teams] };
}

/** ขอบเขตงานของช่าง/Senior ช่างคนหนึ่ง — ใช้ที่รายการ กล่องงาน งานวันนี้ ปุ่มทุกขั้น และ teamCoverage ที่ส่งให้แอป */
export function coverageOfUser(u: TeamHolder): Promise<Coverage | null> {
  return coverageOfTeams(teamsOf(u));
}

/** แบบเดียวกันแต่ถามฐานข้อมูลเอง — จุดที่มีแค่ id ของคนที่ล็อกอิน */
export async function coverageOfUserId(id: number): Promise<Coverage | null> {
  const u = await prisma.user.findUnique({ where: { id }, select: TEAM_HOLDER_SELECT });
  return u ? coverageOfUser(u) : null;
}
