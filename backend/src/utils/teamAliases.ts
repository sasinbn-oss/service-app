/**
 * แปลงชื่อทีมเดิมเป็นชื่อปัจจุบัน — ใช้ตอนนำเข้าไฟล์ทะเบียนสาขาและไฟล์เครื่อง
 *
 * แอดมินเปลี่ยนชื่อทีมในแอปได้ แต่ไฟล์ที่อัปวันละสองครั้งยังเขียนชื่อเดิมอยู่จนกว่าจะมีคนแก้ต้นฉบับ
 * ถ้าไม่แปลง การอัปรอบถัดไปจะเขียนชื่อเดิมกลับลงสาขา ช่างกับหัวหน้าภาคที่ย้ายไปชื่อใหม่แล้ว
 * จะมองไม่เห็นงานของสาขาเหล่านั้นทันที
 */
import { prisma } from "../prisma";

export async function teamAliasMap(): Promise<Map<string, string>> {
  const rows = await prisma.teamRename.findMany({ select: { fromName: true, toName: true } });
  return new Map(rows.map((r) => [r.fromName, r.toName]));
}

/** ไล่ต่อเป็นทอด (ก→ข แล้ว ข→ค = ก→ค) จำกัดรอบไว้กันวนถ้าข้อมูลผิดพลาด */
export function resolveTeam(name: string | null, map: Map<string, string>): string | null {
  if (!name) return name;
  let cur = name;
  for (let i = 0; i < 10 && map.has(cur); i++) cur = map.get(cur)!;
  return cur;
}

/**
 * ปรับชื่อทีมในแถวที่อ่านจากไฟล์ (zone / pmTeam) ก่อนวางแผนนำเข้า — แก้ในที่
 *
 * 1) ชื่อทีมที่เปลี่ยนในแอปแล้ว → ชื่อปัจจุบัน
 * 2) สาขาที่แอดมินย้ายทีมในแอป (BranchTeamMove) → ทีมที่ย้ายไป ไม่ว่าไฟล์จะเขียนว่าอะไร
 *    ไฟล์ทะเบียนยังเขียนทีมเดิมจนกว่าจะมีคนแก้ต้นฉบับ อัปทีไรสาขาก็เด้งกลับทีมเดิม
 */
export async function applyTeamAliases(
  rows: { code?: string; branchCode?: string; zone?: string | null; pmTeam?: string | null }[]
) {
  const [map, moves] = await Promise.all([
    teamAliasMap(),
    prisma.branchTeamMove.findMany({ select: { field: true, toTeam: true, branch: { select: { code: true } } } }),
  ]);
  const moved = new Map(moves.map((m) => [`${m.branch.code}|${m.field}`, m.toTeam]));
  if (map.size === 0 && moved.size === 0) return 0;
  let changed = 0;
  for (const r of rows) {
    const code = r.code ?? r.branchCode;
    for (const key of ["zone", "pmTeam"] as const) {
      if (!(key in r)) continue;
      // ไฟล์ไม่ได้กรอกช่องนี้ = ไม่แตะค่าในระบบอยู่แล้ว (COALESCE) ไม่ต้องใส่ทีมที่ย้ายไป
      const pinned = r[key] && code ? moved.get(`${code}|${key}`) : undefined;
      const next = pinned ?? resolveTeam(r[key] ?? null, map);
      if (next !== (r[key] ?? null)) {
        r[key] = next;
        changed++;
      }
    }
  }
  return changed;
}
