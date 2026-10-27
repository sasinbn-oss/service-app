/**
 * อ่านไฟล์ Area Team (ชีตแรก: ERP · Project Name · … · Name-Surname (Thai) · Nickname · Tel · Mail · Area · Mail)
 *
 * แถวละสาขา — สาขาหนึ่งมี Supervisor (COCO) คนเดียว · Supervisor อยู่ใต้ Area คนเดียว
 * ชื่อผู้ใช้คืออีเมลบริษัทส่วนหน้า @ (เจ้าของงานเลือก ต.ค. 69) — คนจำอีเมลตัวเองได้อยู่แล้ว
 * และไม่ซ้ำกันแน่นอน ต่างจากชื่อเล่นที่ซ้ำกันได้หลายคน
 *
 * หาคอลัมน์จากชื่อหัวตาราง ไม่ยึดตำแหน่ง · มีคอลัมน์ Mail สองคอลัมน์ — อันแรกของ Supervisor
 * อันที่อยู่หลัง Area เป็นของ Area
 */
export interface AreaTeamPlan {
  /** branches = สาขาที่ Area คนนี้ดูแลเองโดยตรง (ไฟล์จริงมี Area ที่ใส่ตัวเองเป็น Supervisor ของบางสาขา) */
  areas: { login: string; name: string; branches: string[] }[];
  supervisors: { login: string; name: string; phone: string | null; areaLogin: string; branches: string[] }[];
  /** แถวที่อ่านไม่ได้/ขัดกันเอง — ไม่ทำให้ทั้งไฟล์ใช้ไม่ได้ แค่แถวนั้นถูกข้าม */
  problems: string[];
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const loginOf = (mail: string) => {
  const m = mail.trim().toLowerCase().match(/^([a-z0-9._-]+)@/);
  return m ? m[1] : null;
};

export function parseAreaTeam(rows: string[][]): AreaTeamPlan | null {
  const headAt = rows.findIndex((r) => r.some((c) => norm(c) === "erp") && r.some((c) => norm(c) === "area"));
  if (headAt < 0) return null;
  const head = rows[headAt].map(norm);
  const col = (pred: (h: string) => boolean, from = 0) => head.findIndex((h, i) => i >= from && pred(h));
  const c = {
    branch: col((h) => h === "erp"),
    name: col((h) => h.startsWith("name-surname(thai)") || h === "name-surname"),
    nick: col((h) => h === "nickname"),
    tel: col((h) => h === "tel"),
    mail: col((h) => h === "mail"),
    area: col((h) => h === "area"),
  };
  const areaMail = col((h) => h === "mail", c.area + 1);
  if ([c.branch, c.name, c.mail, c.area].some((i) => i < 0) || areaMail < 0) return null;

  const problems: string[] = [];
  const areas = new Map<string, AreaTeamPlan["areas"][number]>();
  const sups = new Map<string, AreaTeamPlan["supervisors"][number]>();
  const branchOwner = new Map<string, string>();

  rows.slice(headAt + 1).forEach((r, i) => {
    const line = headAt + i + 2;
    const at = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
    const branch = at(c.branch).toUpperCase();
    if (!branch) return;
    const supLogin = loginOf(at(c.mail));
    const aLogin = loginOf(at(areaMail));
    const aName = at(c.area);
    if (!supLogin) return void problems.push(`แถว ${line} (${branch}): ไม่มีอีเมล Supervisor`);
    if (!aLogin || !aName) return void problems.push(`แถว ${line} (${branch}): ไม่มี Area หรืออีเมล Area`);
    if (!areas.has(aLogin)) areas.set(aLogin, { login: aLogin, name: aName, branches: [] });
    const owner = branchOwner.get(branch);
    if (owner && owner !== supLogin) return void problems.push(`แถว ${line}: สาขา ${branch} มี Supervisor สองคน — ใช้คนแรกที่เจอ`);
    // Area ที่ดูแลสาขานั้นเอง — ผูกสาขากับ Area (รายงานขึ้นชื่อผู้ดูแล) แต่ไม่สร้างบัญชี Supervisor ซ้ำ
    if (aLogin === supLogin) {
      branchOwner.set(branch, aLogin);
      const a = areas.get(aLogin)!;
      if (!a.branches.includes(branch)) a.branches.push(branch);
      return;
    }
    const nick = at(c.nick);
    const thai = at(c.name);
    let s = sups.get(supLogin);
    if (!s) {
      s = { login: supLogin, name: nick ? `${thai} (${nick})` : thai, phone: at(c.tel) || null, areaLogin: aLogin, branches: [] };
      sups.set(supLogin, s);
    } else if (s.areaLogin !== aLogin) {
      return void problems.push(`แถว ${line} (${branch}): ${s.name} อยู่ใต้ Area สองคน — ใช้ Area แรกที่เจอ`);
    }
    branchOwner.set(branch, supLogin);
    if (!s.branches.includes(branch)) s.branches.push(branch);
  });

  // คนที่เป็นทั้ง Area และ Supervisor ในไฟล์เดียวกัน — ถือเป็น Area (ตำแหน่งที่เห็นกว้างกว่า)
  for (const login of areas.keys()) {
    if (sups.has(login)) {
      problems.push(`${areas.get(login)!.name} เป็นทั้ง Area และ Supervisor — ตั้งเป็น Area (เห็นสาขา COCO ทั้งหมดอยู่แล้ว)`);
      areas.get(login)!.branches.push(...sups.get(login)!.branches);
      sups.delete(login);
    }
  }
  return { areas: [...areas.values()], supervisors: [...sups.values()], problems };
}
