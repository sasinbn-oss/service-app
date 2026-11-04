import { Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { cleanName } from "../utils/names";
import { prisma } from "../prisma";
import { ALIVE, IN_TRASH } from "../utils/trash";
import { AuthRequest, requireAuth, requireAdmin } from "../middleware/auth";
import { supervisorScope, workOrderInScope } from "../utils/supervisorScope";
import { AREA_OUT_OF_SCOPE, areaBranchSelect, areaBranchWhere, areaCoversBranch, isAreaTeam } from "../utils/areaScope";
import { resolveMapLink } from "../utils/mapLink";
import { applyTeamAliases } from "../utils/teamAliases";
import {
  applyBranchPins,
  branchActor,
  logBranch,
  pinBranchField,
  recordTeamMove,
  renameBranch,
  restoreBranchName,
} from "../utils/branchPins";
import {
  applyBranchImport,
  parseBranchWorkbook,
  planBranchImport,
} from "../machines/branchImport";
import {
  applyCancelledImport,
  parseCancelledWorkbook,
  planCancelledImport,
} from "../machines/cancellationImport";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  machineMake,
  warrantyEndFor,
  warrantyYearsFor,
} from "../utils/constants";
import { brandFileOf, openPickOf, statusLabelOf } from "../utils/brandFile";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * นำเข้าทะเบียนสาขา (ภาค / ทีมช่าง) จากไฟล์ Excel
 *
 * ค่าเริ่มต้นคือโหมดตรวจสอบ ต้องส่ง mode=commit ถึงจะบันทึกจริง
 * ไฟล์นี้แตะเฉพาะข้อมูลสาขา ไม่ยุ่งกับสถานะเครื่องหรือเคสที่เปิดค้างอยู่
 */
router.post("/import", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

  const commit = req.body?.mode === "commit";
  try {
    const parsed = await parseBranchWorkbook(req.file.buffer);
    if (parsed.errors.length > 0) return res.status(400).json({ error: parsed.errors.join(" / ") });
    if (parsed.rows.length === 0) return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์" });
    // ไฟล์ยังเขียนชื่อทีมที่แอดมินเปลี่ยนไปแล้ว — แปลงก่อน ไม่งั้นชื่อเดิมถูกเขียนกลับลงสาขา
    await applyTeamAliases(parsed.rows);
    // ภาค/ประเภทที่แก้ในหน้าจัดการสาขา — ไฟล์ยังเขียนค่าเดิมจนกว่าจะมีคนแก้ต้นฉบับ
    await applyBranchPins(parsed.rows);

    const plan = commit ? await applyBranchImport(parsed) : await planBranchImport(parsed);
    res.json({ committed: commit, plan });
  } catch (err) {
    console.error("Branch import failed:", err);
    res.status(400).json({
      error: `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : "ไฟล์อาจไม่ใช่ .xlsx"}`,
    });
  }
});

/**
 * รายชื่อสาขาหรือเครื่องที่ยกเลิกแล้ว
 *
 * แยกจากทะเบียนสาขาเพราะเป็นคนละเรื่องและคนละจังหวะ ทะเบียนบอกว่าใครดูแลสาขาไหน
 * ไฟล์นี้บอกว่าอะไรไม่มีอยู่แล้ว ซึ่งกระทบถึงการปิดเคสที่ค้างอยู่
 */
router.post("/cancelled-import", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "กรุณาแนบไฟล์ Excel" });

  const commit = req.body?.mode === "commit";
  try {
    const parsed = await parseCancelledWorkbook(req.file.buffer);
    if (parsed.errors.length > 0) return res.status(400).json({ error: parsed.errors.join(" / ") });
    if (parsed.rows.length === 0) return res.status(400).json({ error: "ไม่พบข้อมูลในไฟล์" });

    const plan = commit ? await applyCancelledImport(parsed) : await planCancelledImport(parsed);
    res.json({ committed: commit, plan });
  } catch (err) {
    console.error("Cancelled branch import failed:", err);
    res.status(400).json({
      error: `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : "ไฟล์อาจไม่ใช่ .xlsx"}`,
    });
  }
});

/**
 * รายชื่อสาขา
 *
 * ไม่ส่ง search มาก็ได้ทั้งหมดเหมือนเดิม เพราะหน้าจัดการสาขาและหน้ารายงานตัว
 * ต้องการทั้งชุด ส่วนช่องค้นหาในฟอร์มใบงานส่ง search มาเพื่อไม่ต้องดึงพันกว่าแถว
 * มากรองในเครื่องผู้ใช้
 */
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const keyword = typeof req.query.search === "string" ? req.query.search.trim() : "";
  // Area Team เลือกได้เฉพาะสาขา COCO ที่ตัวเองเห็น — ค้นสาขาอื่นเจอแล้วเปิดไม่ได้ ดีกว่าไม่ให้เจอเลย
  const area = isAreaTeam(req.auth) ? areaBranchWhere(req.auth!) : null;
  const branches = await prisma.branch.findMany({
    where: area
      ? { AND: [area, keyword ? { cancelledAt: null, OR: [{ code: { contains: keyword, mode: "insensitive" } }, { name: { contains: keyword, mode: "insensitive" } }] } : {}] }
      : keyword
      ? {
          // สาขาที่ยกเลิกแล้วไม่ควรถูกเลือกไปเปิดใบงานใหม่
          cancelledAt: null,
          OR: [
            { code: { contains: keyword, mode: "insensitive" } },
            { name: { contains: keyword, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { name: "asc" },
    ...(keyword ? { take: 20 } : {}),
  });
  /**
   * ส่งวันหมดประกันที่คิดแล้วออกไป ไม่ใช่ค่าดิบในตาราง
   *
   * กฎ "3 ปีนับจากเปิดร้าน" อยู่ที่เซิร์ฟเวอร์ที่เดียว หน้าจอจึงไม่ต้องรู้ว่ากี่ปี
   * และไม่มีทางที่หน้าจอสองหน้าจะคิดคนละแบบ — ค่าในตารางเป็นการกรอกทับเฉพาะราย
   * ซึ่งทะเบียนจริงยังไม่มีสักสาขา
   */
  /**
   * ประกันขึ้นกับยี่ห้อเครื่อง (Oasis 2 ปี · อื่น ๆ 3 ปี) — สาขาเดียวมีได้หลายยี่ห้อ จึงส่งแยกยี่ห้อมาด้วย
   * ค่า warrantyExpiresAt ตัวเดียวใช้วันที่หมดเร็วสุด: ตอนเปิดใบงานยังไม่รู้ว่าเป็นเครื่องไหน
   * บอกว่า "ยังอยู่ในประกัน" ทั้งที่เครื่อง Oasis หมดไปแล้ว อันตรายกว่าเตือนเกินไปหนึ่งปี
   * ดึงยี่ห้อเป็นคิวรีเดียวทั้งชุด ไม่ใช่ทีละสาขา — หน้าจัดการสาขาขอทั้งพันกว่าแถว
   */
  const brandRows = await prisma.machine.groupBy({
    by: ["branchId", "brand", "model"],
    where: { removedAt: null, branchId: { in: branches.map((b) => b.id) } },
  });
  const brandsOf = new Map<number, string[]>();
  for (const r of brandRows) {
    const name = machineMake(r);
    if (!name) continue;
    const list = brandsOf.get(r.branchId) ?? [];
    if (!list.includes(name)) brandsOf.set(r.branchId, [...list, name]);
  }
  res.json(
    branches.map((b) => {
      const warranties = (brandsOf.get(b.id) ?? [])
        .map((brand) => ({
          brand,
          years: b.warrantyExpiresAt ? null : warrantyYearsFor(brand),
          expiresAt: warrantyEndFor(b.openedAt, b.warrantyExpiresAt, brand),
        }))
        .sort((x, y) => (x.expiresAt?.getTime() ?? 0) - (y.expiresAt?.getTime() ?? 0));
      return {
        ...b,
        warrantyExpiresAt: warranties[0]?.expiresAt ?? warrantyEndFor(b.openedAt, b.warrantyExpiresAt),
        warranties,
      };
    })
  );
});

/**
 * หน้าจัดการสาขา (แอดมิน — ออกแบบใหม่ ต.ค. 69): ค้นหา กรอง แบ่งหน้า + ตัวเลขสรุปด้านบน
 *
 * แยกจาก GET / เพราะตัวนั้นหน้าอื่นใช้ (ค้นสาขาตอนเปิดใบงาน รายงานตัว) และส่งทั้งพันกว่าแถว
 * หน้านี้ขอทีละ 50 · ตัวเลขสรุปนับทั้งระบบ ไม่ขึ้นกับตัวกรอง (เป็นทางลัดกรอง ต้องนิ่ง)
 */
const manageQuery = z.object({
  search: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  team: z.string().trim().max(100).optional(),
  coords: z.enum(["has", "none"]).optional(),
  noTeam: z.enum(["1"]).optional(),
  status: z.enum(["open", "closed"]).default("open"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/manage", requireAuth, requireAdmin, async (req, res) => {
  const parsed = manageQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const q = parsed.data;
  const where: Prisma.BranchWhereInput = {
    cancelledAt: q.status === "closed" ? { not: null } : null,
    ...(q.region ? { region: q.region } : {}),
    ...(q.team ? { OR: [{ zone: q.team }, { pmTeam: q.team }] } : {}),
    ...(q.coords === "has" ? { latitude: { not: null }, longitude: { not: null } } : {}),
    ...(q.coords === "none" ? { OR: [{ latitude: null }, { longitude: null }] } : {}),
    ...(q.noTeam ? { zone: null, pmTeam: null } : {}),
  };
  const and: Prisma.BranchWhereInput[] = [where];
  if (q.search) {
    and.push({
      OR: [
        { code: { contains: q.search, mode: "insensitive" } },
        { name: { contains: q.search, mode: "insensitive" } },
        { address: { contains: q.search, mode: "insensitive" } },
      ],
    });
  }
  const [total, rows, open, noCoords, noTeam, closed] = await Promise.all([
    prisma.branch.count({ where: { AND: and } }),
    prisma.branch.findMany({
      where: { AND: and },
      orderBy: { code: "asc" },
      skip: q.offset,
      take: q.limit,
      select: {
        id: true, code: true, name: true, address: true, region: true, zone: true, pmTeam: true, ownership: true,
        latitude: true, longitude: true, radiusMeters: true, cancelledAt: true, cancelledNote: true,
        teamMoves: { select: { field: true } },
        pins: { select: { field: true, fromValue: true } },
      },
    }),
    prisma.branch.count({ where: { cancelledAt: null } }),
    prisma.branch.count({ where: { cancelledAt: null, OR: [{ latitude: null }, { longitude: null }] } }),
    prisma.branch.count({ where: { cancelledAt: null, zone: null, pmTeam: null } }),
    prisma.branch.count({ where: { cancelledAt: { not: null } } }),
  ]);
  const openOrders = rows.length
    ? await prisma.workOrder.groupBy({
        by: ["branchId"],
        where: { ...ALIVE, branchId: { in: rows.map((r) => r.id) }, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] }, isTest: false },
        _count: true,
      })
    : [];
  const openOf = new Map(openOrders.map((o) => [o.branchId, o._count]));
  res.json({
    total,
    counts: { open, noCoords, noTeam, closed },
    rows: rows.map(({ teamMoves, pins, ...r }) => ({
      ...r,
      openWorkOrders: openOf.get(r.id) ?? 0,
      // ช่องที่แก้ในแอป (นำเข้าไฟล์ไม่ทับ) — แผงแก้ไขติดป้ายให้รู้ว่าไม่ตรงกับไฟล์ทะเบียน ("name" = ชื่อที่แก้ในแอป)
      editedInApp: [...teamMoves.map((m) => m.field), ...pins.map((p) => p.field)],
      // ชื่อในรายงานเครื่องล่าสุด ของสาขาที่แก้ชื่อในแอป — แผงแก้ไขโชว์คู่กับปุ่ม "คืนตามรายงาน" · ไม่ได้แก้ = null
      reportName: pins.find((p) => p.field === "name")?.fromValue ?? null,
    })),
  });
});

/**
 * ตัวเลือกภาค/ประเภท/ทีม สำหรับแผงแก้ไขสาขา — เลือกจากค่าที่มีในระบบเท่านั้น
 *
 * ชื่อพวกนี้เป็นข้อความที่ใช้จับคู่กันหลายที่ (ภาคของหัวหน้าภาค ทีมของช่าง) พิมพ์เองสะกดต่างไปตัวเดียว
 * สาขาก็หลุดจากคนดูแลโดยไม่มีใครรู้ · ทีมใหม่ให้สร้างที่หน้าทีมช่าง (ย้ายสาขาเข้าทีม)
 */
async function registryOptions() {
  const [regions, ownerships, cm, pm] = await Promise.all([
    prisma.branch.findMany({ where: { region: { not: null } }, distinct: ["region"], select: { region: true } }),
    prisma.branch.findMany({ where: { ownership: { not: null } }, distinct: ["ownership"], select: { ownership: true } }),
    prisma.branch.findMany({ where: { zone: { not: null } }, distinct: ["zone"], select: { zone: true } }),
    prisma.branch.findMany({ where: { pmTeam: { not: null } }, distinct: ["pmTeam"], select: { pmTeam: true } }),
  ]);
  const sorted = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x?.trim()))].sort((a, b) => a.localeCompare(b, "th"));
  return {
    regions: sorted(regions.map((r) => r.region)),
    ownerships: sorted(["COCO", "DODO", ...ownerships.map((r) => r.ownership)]),
    teams: sorted([...cm.map((r) => r.zone), ...pm.map((r) => r.pmTeam)]),
  };
}

router.get("/manage/options", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await registryOptions());
});

/**
 * แก้ภาค ประเภท ทีม CM ทีม PM ในแผงแก้ไขสาขา (เจ้าของงานขอ ต.ค. 69 — เดิมต้องแก้ไฟล์แล้วนำเข้า)
 *
 * ค่าที่แก้ต้องอยู่รอดการนำเข้ารอบหน้า ไม่งั้นไฟล์เครื่องที่อัปวันละสองครั้งเขียนค่าเดิมกลับ:
 * ทีม → BranchTeamMove (ขึ้นในรายการย้ายสาขาของหน้าทีมช่าง คืนตามไฟล์ได้) · ภาค/ประเภท → BranchPin
 * ใบงานที่จ่ายไปแล้วไม่ย้ายตาม (assignedTeam ของใบ) — มีผลกับใบงานใหม่
 */
const registrySchema = z.object({
  region: z.string().trim().min(1).transform((v) => cleanName(v)!).optional(),
  ownership: z.string().trim().min(1).optional(),
  zone: z.string().trim().min(1).transform((v) => cleanName(v)!).optional(),
  pmTeam: z.string().trim().min(1).transform((v) => cleanName(v)!).optional(),
});

router.put("/:id/registry", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const parsed = registrySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
  const want = parsed.data;
  const branch = await prisma.branch.findUnique({
    where: { id },
    select: { id: true, region: true, ownership: true, zone: true, pmTeam: true, teamMoves: true, pins: true },
  });
  if (!branch) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  const opt = await registryOptions();
  if (want.region && !opt.regions.includes(want.region)) return res.status(400).json({ error: `ไม่มีภาค “${want.region}” ในระบบ` });
  if (want.ownership && !opt.ownerships.includes(want.ownership)) return res.status(400).json({ error: `ไม่มีประเภท “${want.ownership}” ในระบบ` });
  for (const f of ["zone", "pmTeam"] as const) {
    const t = want[f];
    if (t && !opt.teams.includes(t)) return res.status(400).json({ error: `ไม่มีทีม “${t}” ในระบบ — ทีมใหม่สร้างที่หน้าทีมช่าง` });
  }
  const uid = req.auth!.userId;
  await prisma.$transaction(
    async (tx) => {
      for (const f of ["region", "ownership"] as const) {
        const v = want[f];
        if (v) await pinBranchField(tx, branch, f, v, uid);
      }
      for (const f of ["zone", "pmTeam"] as const) {
        const t = want[f];
        if (!t || branch[f] === t) continue;
        await tx.branch.update({ where: { id }, data: { [f]: t } });
        await recordTeamMove(tx, branch, f, t, uid);
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  res.json(await prisma.branch.findUniqueOrThrow({ where: { id } }));
});

/**
 * แก้ชื่อสาขา (เจ้าของงานตัดสิน 4 พ.ย. 69: "แก้ชื่อในแอปได้ + นำเข้าไม่ทับ" — เดิมแก้ไม่ได้เพราะรายงานเครื่องเขียนชื่อทับทุกรอบ)
 *
 * ชื่อที่แก้ถูกจำไว้ (BranchPin field "name") ตัวนำเข้ารายงานเครื่องไม่ทับ · ใบงานเก่าขึ้นชื่อใหม่เอง (อ้างสาขาด้วย id)
 * ลงประวัติสาขาทุกครั้ง · ใบเคลมที่ส่งไปแล้วไม่เปลี่ยน (เก็บชื่อ ณ ตอนส่ง — เป็นเอกสารที่ออกไปแล้ว)
 * ไม่ใช่การรวมสาขา: สาขาที่ต้นทางเปลี่ยนรหัสคือสาขาใหม่ทั้งหมด สาขาเดิมเก็บประวัติของตัวเองไว้ (ปิดสาขาแทน)
 */
const BRANCH_NAME_MAX = 200;

/** ชื่อจากแอป/API → ชื่อที่เก็บ หรือข้อความไทยที่ตอบ 400 (ใช้ทั้ง PUT /:id/name และ PUT /:id ที่ส่ง name มา) */
function branchNameInput(raw: unknown): { name: string } | { error: string } {
  const name = typeof raw === "string" ? cleanName(raw) : null;
  if (!name) return { error: "ชื่อสาขาว่างไม่ได้" };
  if (name.length > BRANCH_NAME_MAX) return { error: `ชื่อสาขายาวเกิน ${BRANCH_NAME_MAX} ตัวอักษร` };
  return { name };
}

router.put("/:id/name", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const input = branchNameInput(req.body?.name);
  if ("error" in input) return res.status(400).json({ error: input.error });
  const actor = await branchActor(req.auth!.userId);
  const out = await prisma.$transaction((tx) => renameBranch(tx, id, input.name, actor), { timeout: 30_000, maxWait: 15_000 });
  if (!out) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  const { changed: _changed, ...state } = out;
  res.json(state);
});

router.post("/:id/name/restore", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const actor = await branchActor(req.auth!.userId);
  const out = await prisma.$transaction((tx) => restoreBranchName(tx, id, actor), { timeout: 30_000, maxWait: 15_000 });
  if (!out) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  if (!out.changed) return res.status(400).json({ error: `${out.code} ใช้ชื่อตามรายงานอยู่แล้ว` });
  const { changed: _changed, ...state } = out;
  res.json(state);
});

/** ประวัติสาขา (แก้ชื่อ · คืนชื่อ · ปิด/เปิดสาขา) ใหม่ก่อนเก่า — แผงแก้ไขแสดงไม่กี่รายการล่าสุด */
router.get("/:id/logs", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const take = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  res.json(
    await prisma.branchLog.findMany({
      where: { branchId: id },
      // id ไม่ใช่ createdAt: สองรายการในวินาทีเดียวกัน (แก้ชื่อแล้วปิดทันที) ต้องเรียงตามที่ทำจริง
      orderBy: { id: "desc" },
      take,
      select: { id: true, action: true, note: true, byName: true, createdAt: true },
    })
  );
});

/** วางลิงก์ Google Maps → พิกัด (ลิงก์สั้นต้องตามที่เซิร์ฟเวอร์ — ดู utils/mapLink.ts) */
router.post("/resolve-map-link", requireAuth, requireAdmin, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.slice(0, 2000) : "";
  if (!text.trim()) return res.status(400).json({ error: "วางลิงก์ Google Maps หรือพิกัดก่อน" });
  try {
    const found = await resolveMapLink(text);
    if (!found) {
      return res.status(400).json({ error: "อ่านพิกัดจากลิงก์นี้ไม่ได้ — เปิดหมุดใน Google Maps แล้วกดแชร์ลิงก์ หรือพิมพ์พิกัดเอง" });
    }
    res.json(found);
  } catch {
    res.status(400).json({ error: "เปิดลิงก์ไม่สำเร็จ — ลองใหม่ หรือพิมพ์พิกัดเอง" });
  }
});

/**
 * ภาคทั้งหมดจากทะเบียนสาขา
 *
 * ต่างจาก /machines/regions ที่ให้เฉพาะภาคที่มีเคสค้างอยู่ตอนนี้ — ภาคที่หัวหน้าภาค
 * ดูแลไม่ควรขึ้นกับว่าตอนนี้มีเครื่องเสียอยู่หรือเปล่า ภาคที่ทุกอย่างปกติก็ยังต้องมีหัวหน้า
 */
router.get("/regions", requireAuth, async (_req, res) => {
  const rows = await prisma.branch.groupBy({
    by: ["region"],
    where: { region: { not: null }, cancelledAt: null },
    _count: true,
    orderBy: { region: "asc" },
  });
  res.json(rows.map((r) => ({ name: r.region as string, branches: r._count })));
});

/**
 * ทีมช่างทั้งหมดจากทะเบียนสาขา
 *
 * ทีมไม่ได้เป็นตารางของตัวเอง — เป็นคอลัมน์ "ทีมช่าง" ในไฟล์ทะเบียนสาขา
 * (เก็บที่ Branch.zone) เพราะความจริงของการแบ่งทีมอยู่ที่ไฟล์นั้น ถ้าทำตาราง
 * แยกจะมีสองที่ที่บอกว่าทีมไหนมีอยู่บ้าง แล้ววันหนึ่งจะไม่ตรงกัน
 *
 * คืนจำนวนสาขาไปด้วย จะได้รู้ว่าทีมไหนดูแลกี่สาขาตอนเลือกจ่ายงานข้ามทีม
 */
router.get("/teams", requireAuth, async (_req, res) => {
  // ทีม CM กับทีม PM มาคนละคอลัมน์ แต่เป็นทีมชุดเดียวกัน — บางทีมรับเฉพาะงาน CM
  // จึงโผล่แค่คอลัมน์เดียว ถ้าเอาแค่คอลัมน์เดียวจะมีทีมหายไปจากรายการเลือก
  const [cm, pm] = await Promise.all([
    prisma.branch.groupBy({
      by: ["zone"],
      where: { zone: { not: null }, cancelledAt: null },
      _count: true,
    }),
    prisma.branch.groupBy({
      by: ["pmTeam"],
      where: { pmTeam: { not: null }, cancelledAt: null },
      _count: true,
    }),
  ]);

  const tally = new Map<string, { cm: number; pm: number }>();
  const add = (name: string | null, kind: "cm" | "pm", n: number) => {
    const key = name?.trim();
    if (!key) return;
    const row = tally.get(key) ?? { cm: 0, pm: 0 };
    row[kind] += n;
    tally.set(key, row);
  };
  for (const r of cm) add(r.zone, "cm", r._count);
  for (const r of pm) add(r.pmTeam, "pm", r._count);

  res.json(
    [...tally.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "th"))
      .map(([name, n]) => ({ name, branches: Math.max(n.cm, n.pm), cmBranches: n.cm, pmBranches: n.pm }))
  );
});

/**
 * ผู้ติดต่อที่ใช้ล่าสุดของสาขานี้ — เอาไว้เติมให้ตอนเปิดใบงานใหม่
 *
 * เก็บอยู่ที่ใบงาน ไม่ได้เก็บที่สาขา เพราะคนเฝ้าร้านเปลี่ยนตามกะ ค่าที่ใช้ล่าสุด
 * จึงเป็นการเดาที่ดีที่สุดที่มี ไม่ใช่ความจริงที่ต้องรักษาให้ตรงตลอด —
 * คนเปิดใบงานเห็นแล้วแก้ทับได้ทันทีถ้าเปลี่ยนคน
 */
/** Area Team ดูข้อมูลได้เฉพาะสาขาที่ตัวเองเห็น — คืน true เมื่อ "ห้าม" และตอบ 403 ให้แล้ว */
async function blockedForArea(req: AuthRequest, res: Response) {
  if (!isAreaTeam(req.auth)) return false;
  const b = await prisma.branch.findUnique({ where: { code: req.params.code }, select: areaBranchSelect(req.auth) });
  if (b && areaCoversBranch(req.auth!, b)) return false;
  res.status(403).json({ error: AREA_OUT_OF_SCOPE });
  return true;
}

router.get("/:code/last-contact", requireAuth, async (req: AuthRequest, res) => {
  if (await blockedForArea(req, res)) return;
  // ใบในถังขยะไม่เป็นต้นแบบผู้ติดต่อ — ใบทดสอบ/เปิดผิดสาขามักมีชื่อเบอร์ที่กรอกเล่น ๆ
  const last = await prisma.workOrder.findFirst({
    where: {
      ...ALIVE,
      branch: { code: req.params.code },
      OR: [{ contactName: { not: null } }, { contactPhone: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    select: { contactName: true, contactPhone: true, createdAt: true },
  });
  res.json(last ?? { contactName: null, contactPhone: null, createdAt: null });
});

/**
 * ใบงานที่ยังเปิดค้างของสาขานี้ — ฟอร์มเปิดใบงานใช้เตือนก่อนเปิดซ้ำ (เจ้าของงานขอ ต.ค. 69)
 *
 * ทางกระดานเครื่องดับบล็อกใบซ้ำได้เพราะผูกกับเคส แต่ทางฟอร์มไม่มีอะไรผูก —
 * ลูกค้าแจ้งสองช่องทาง หรือแอดมินสองคนต่างคนต่างเปิด ช่างก็ขับไปสาขาเดียวกันสองรอบ
 * แค่เตือน ไม่บล็อก: สาขาเดียวกันมีหลายเรื่องจริงได้ ระบบแยกไม่ออกว่าอาการใหม่หรือเรื่องเดิม
 *
 * ส่งทั้งหมดใหม่ก่อนเก่า หน้าจอตัดเหลือ 3 ใบเอง (ต้องรู้จำนวนทั้งหมดไว้บอก "ดูทั้งหมด")
 * ไม่นับใบทดสอบ — แอดมินคัดลอกไว้ลองระบบ ไม่ใช่งานจริงที่ช่างจะไป
 * ไม่นับใบที่รอตรวจเคลม (CLAIM_REVIEW) — ช่างปิดงานซ่อมแล้ว เหลือแค่เอกสารเคลม เครื่องเสียอีกคือเรื่องใหม่
 * (เจ้าของงานเลือก ต.ค. 69 ตอนเพิ่มป๊อปอัพยืนยันก่อนเปิดใบซ้ำ — กล่องเตือนกับป๊อปอัพใช้รายการนี้ทั้งคู่)
 *
 * ใครเห็นอะไร (ตรวจระบบ ต.ค. 69 — เดิมทุกคนเห็นทุกสาขาครบทุกช่อง):
 * หัวหน้าภาคเฉพาะใบในพื้นที่ · ช่างเห็นแบบย่อ (เลขใบงาน เครื่อง ขั้น) พอให้รู้ว่ามีใบอยู่แล้ว
 * แต่ไม่เห็นอาการ/ชื่อคน/ทีมของสาขาอื่น และเปิดจากกล่องเตือนไม่ได้ (เจ้าของงานเลือก)
 */
router.get("/:code/open-work-orders", requireAuth, async (req: AuthRequest, res) => {
  if (await blockedForArea(req, res)) return;
  const role = req.auth!.role;
  // Area Team เห็นครบ — ผ่าน blockedForArea มาแล้ว สาขานี้จึงเป็นสาขาของตัวเอง
  const limited = role !== "ADMIN" && role !== "SUPERVISOR" && !isAreaTeam(req.auth);
  const scope = role === "SUPERVISOR" ? workOrderInScope(await supervisorScope(req.auth!.userId)) : {};
  const rows = await prisma.workOrder.findMany({
    where: {
      // ใบในถังขยะไม่ใช่ใบค้าง — ลบใบซ้ำแล้วกล่องเตือน/ป๊อปอัปยืนยันต้องไม่ขึ้นใบนั้นอีก
      AND: [scope, ALIVE],
      branch: { code: req.params.code },
      status: { in: ACTIVE_WORK_ORDER_STATUSES.filter((st) => st !== "CLAIM_REVIEW") },
      isTest: false,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      title: true,
      symptom: true,
      assignedTeam: true,
      createdAt: true,
      machine: { select: { code: true } },
      createdBy: { select: { name: true } },
      // ป้าย "หัวหน้าภาค · คอนเฟิร์มอะไหล่" ในป๊อปอัปใบที่เปิดซ้ำ — ป้ายเดียวกับหน้าใบงาน (utils/brandFile.ts statusLabelOf)
      partsPicks: { orderBy: { id: "desc" }, take: 1, select: { status: true, voidedAt: true, reviewedAt: true } },
    },
  });
  res.json(
    rows.map((w) =>
      limited
        ? {
            id: null,
            code: w.code,
            status: w.status,
            statusLabel: statusLabelOf(w.status, openPickOf(w.status, w.partsPicks)),
            machineCode: w.machine?.code ?? null,
            symptom: null,
            team: null,
            createdAt: w.createdAt,
            createdBy: null,
            limited: true,
          }
        : {
            id: w.id,
            code: w.code,
            status: w.status,
            statusLabel: statusLabelOf(w.status, openPickOf(w.status, w.partsPicks)),
            machineCode: w.machine?.code ?? null,
            // บรรทัดแรกพอให้จำได้ว่าเรื่องไหน — บรรทัดหลังเป็นสาเหตุที่ช่างเติม
            symptom: (w.symptom ?? "").split("\n")[0].trim() || w.title,
            team: w.assignedTeam,
            createdAt: w.createdAt,
            createdBy: w.createdBy?.name ?? null,
            limited: false,
          }
    )
  );
});

/**
 * เครื่องของสาขานี้พร้อมรุ่นและขนาดที่เคยกรอกไว้ — เอาไปเติมในฟอร์มเปิดใบงาน
 *
 * รุ่นกับขนาดเก็บไว้ที่ตัวเครื่องเพื่อ "กรอกครั้งเดียวแล้วครั้งหน้าขึ้นให้เอง"
 * ซึ่งจะเป็นจริงได้ก็ต่อเมื่อฟอร์มอ่านของเดิมมาดูได้ ไม่งั้นค่าถูกเก็บไว้เฉย ๆ
 * แล้วยังถามซ้ำทุกใบอยู่ดี
 *
 * ส่งทั้งสาขาในรอบเดียว ไม่ได้ถามเครื่องละรอบตอนพิมพ์รหัส เพราะสาขาหนึ่งมี
 * ไม่กี่สิบเครื่อง แต่การพิมพ์ "W12" คือสามจังหวะ ซึ่งจะกลายเป็นสามคำขอ
 *
 * เครื่องที่ถอดออกไปแล้วไม่ส่งมา — เปิดใบงานให้เครื่องที่ไม่มีอยู่ไม่ได้อยู่แล้ว
 */
router.get("/:code/machines", requireAuth, async (req: AuthRequest, res) => {
  if (await blockedForArea(req, res)) return;
  const branch = await prisma.branch.findUnique({
    where: { code: req.params.code },
    select: { id: true },
  });
  if (!branch) return res.status(404).json({ error: `ไม่พบสาขา ${req.params.code}` });

  const machines = await prisma.machine.findMany({
    where: { branchId: branch.id, removedAt: null },
    select: { code: true, type: true, brand: true, model: true, capacityKg: true },
    orderBy: { code: "asc" },
  });
  // make = ยี่ห้อที่ใช้จริง (ยี่ห้อจากไฟล์รายงานเครื่องก่อน แล้วยี่ห้อที่เลือกในแอป) · brandFile = ไฟล์อะไหล่ของเครื่องนั้น
  // ฟอร์มเปิดใบงานล็อกปุ่มยี่ห้อเมื่อรู้ยี่ห้อแล้ว — รวมเครื่องที่รู้แค่จากรายงาน (model ว่าง) ไม่งั้นถามซ้ำทั้งที่ระบบรู้
  res.json(machines.map((m) => ({ ...m, make: machineMake(m), brandFile: brandFileOf(machineMake(m)) })));
});

const branchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
  // พิกัดไม่บังคับ สาขาที่ยังไม่ได้ไปวัดพิกัดก็ขึ้นในแดชบอร์ดเครื่องได้
  // แต่จะรายงานตัวด้วย GPS ไม่ได้จนกว่าจะใส่พิกัด
  // null = ล้างพิกัด (ใส่ผิดสาขา) — หน้าจัดการสาขาแก้ได้
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  radiusMeters: z.number().int().positive().optional(),
  // ชื่อภาค/ทีมผ่าน cleanName — ช่องว่างท้ายทำให้ขอบเขตหัวหน้าภาคจับคู่ไม่ได้ (utils/names.ts)
  region: z.string().transform((v) => cleanName(v) ?? undefined).optional(),
  ownership: z.enum(["COCO", "DODO"]).optional(),
  zone: z.string().transform((v) => cleanName(v) ?? undefined).optional(),
  grade: z.enum(["A", "B", "C"]).optional(),
  // วันที่ส่งมาเป็น YYYY-MM-DD ส่งค่าว่างมาคือล้างทิ้ง
  openedAt: z.string().nullable().optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
});

/** หน้าจัดการสาขาแสดง error เป็นข้อความตรง ๆ — เดิมส่งก้อน flatten() ของ zod ไปซึ่งแอปแสดงไม่ได้ */
function branchInputError(err: z.ZodError) {
  const field = String(err.issues[0]?.path[0] ?? "");
  const label: Record<string, string> = {
    name: "ชื่อสาขา", code: "รหัสสาขา", latitude: "ละติจูด (-90 ถึง 90)", longitude: "ลองจิจูด (-180 ถึง 180)", radiusMeters: "รัศมี",
  };
  return label[field] ? `${label[field]}ไม่ถูกต้อง` : "ข้อมูลสาขาไม่ถูกต้อง";
}

/** แปลงวันที่จากฟอร์มให้เป็น Date โดยไม่แตะช่องที่ไม่ได้ส่งมา */
function branchDates(body: { openedAt?: string | null; warrantyExpiresAt?: string | null }) {
  const out: { openedAt?: Date | null; warrantyExpiresAt?: Date | null } = {};
  if (body.openedAt !== undefined) out.openedAt = body.openedAt ? new Date(body.openedAt) : null;
  if (body.warrantyExpiresAt !== undefined) {
    out.warrantyExpiresAt = body.warrantyExpiresAt ? new Date(body.warrantyExpiresAt) : null;
  }
  return out;
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: branchInputError(parsed.error) });

  const existing = await prisma.branch.findUnique({ where: { code: parsed.data.code } });
  if (existing) return res.status(409).json({ error: `มีสาขารหัส ${parsed.data.code} อยู่แล้ว` });

  const branch = await prisma.branch.create({
    data: { ...parsed.data, ...branchDates(parsed.data) },
  });
  res.status(201).json(branch);
});

const updateSchema = branchSchema.partial();

router.put("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: branchInputError(parsed.error) });
  // ชื่อวิ่งผ่าน renameBranch เหมือน PUT /:id/name — แก้ชื่อทางนี้ (แผงแก้ไขบันทึกทางนี้) ก็ต้องถูกจำไว้กันไฟล์ทับ
  // และลงประวัติ ไม่ใช่ทางลัดข้ามทั้งสองอย่าง
  const { name, code, ...rest } = parsed.data;
  // รหัสสาขาแก้ไม่ได้ (เจ้าของงานตัดสิน 4 พ.ย. 69: "เปลี่ยนใหม่ คือข้อมูลใหม่ทั้งหมด เเต่ยังเก็บประวัติเก่าอยู่")
  // ไฟล์รายงานเครื่อง/ทะเบียน/สาขายกเลิกจับคู่สาขาด้วยรหัส — แก้รหัสสาขาเดิมเป็นรหัสใหม่ ใบงาน เครื่อง เคสของรหัสเก่า
  // ไปติดกับรหัสใหม่ แล้วไฟล์รอบหน้าที่ยังมีรหัสเก่าก็สร้างสาขาเก่าขึ้นมาใหม่เปล่า ๆ = รวมสาขาแบบเงียบ ๆ ที่เจ้าของงานไม่เอา
  // ส่งรหัสเดิมมาด้วย (ส่งทั้งก้อน) ไม่ถือว่าเปลี่ยน · ไม่เขียนรหัสจากทางนี้เลยแม้ตรงกัน (ช่องว่างหัวท้ายต้องไม่หลุดลงฐาน)
  if (code !== undefined) {
    const current = await prisma.branch.findUnique({ where: { id }, select: { code: true } });
    if (!current) return res.status(404).json({ error: "ไม่พบสาขานี้" });
    if (code.trim() !== current.code) {
      return res.status(400).json({
        error: `เปลี่ยนรหัสสาขา ${current.code} ไม่ได้ — รหัสใหม่คือสาขาใหม่ ให้กด “เพิ่มสาขา” ด้วยรหัสใหม่แทน · สาขาเดิมเก็บประวัติของตัวเองไว้ ถ้าเลิกใช้ให้ปิดสาขา`,
      });
    }
  }
  let newName: string | null = null;
  if (name !== undefined) {
    const input = branchNameInput(name);
    if ("error" in input) return res.status(400).json({ error: input.error });
    newName = input.name;
  }
  const actor = newName ? await branchActor(req.auth!.userId) : null;
  try {
    const branch = await prisma.$transaction(
      async (tx) => {
        if (Object.keys(rest).length) await tx.branch.update({ where: { id }, data: { ...rest, ...branchDates(rest) } });
        if (newName && actor) await renameBranch(tx, id, newName, actor);
        return tx.branch.findUnique({ where: { id } });
      },
      { timeout: 30_000, maxWait: 15_000 }
    );
    if (!branch) return res.status(404).json({ error: "ไม่พบสาขานี้" });
    res.json(branch);
  } catch (e) {
    // เดิมจับทุกข้อผิดพลาดเป็น "ไม่พบสาขานี้" — วันที่ผิดรูปแบบก็ขึ้นว่าไม่พบสาขา แอดมินไม่รู้ว่าต้องแก้อะไร
    // (รหัสซ้ำ P2002 เกิดไม่ได้แล้ว: ทางนี้ไม่เขียนรหัส — ดูข้างบน)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return res.status(404).json({ error: "ไม่พบสาขานี้" });
    if (e instanceof Prisma.PrismaClientValidationError) return res.status(400).json({ error: "ข้อมูลสาขาไม่ถูกต้อง" });
    throw e;
  }
});

/** สิ่งที่ผูกกับสาขา — ลบสาขาแล้วฐานข้อมูลลบตามทั้งหมด (ใบงาน เครื่อง เคส ... onDelete: Cascade) */
async function branchUsage(id: number) {
  const [workOrders, trashedWorkOrders, openWorkOrders, machines, outages, checkIns, workLogs, snapshots, teamMoves] = await Promise.all([
    /**
     * นับใบในถังขยะด้วย (ลบสาขา = ใบในถังขยะหายจริงไปด้วย กู้คืนไม่ได้อีก) แต่บอกแยก — แอดมินหาใบพวกนี้ในรายการไม่เจอ
     * ถ้าขึ้นแค่ "มีใบงาน 2 ใบ" จะงงว่าใบไหน · งานค้าง (ปิดสาขาแล้วเหลือกี่ใบ) นับเฉพาะใบที่ยังใช้งาน
     */
    prisma.workOrder.count({ where: { branchId: id } }),
    prisma.workOrder.count({ where: { branchId: id, ...IN_TRASH } }),
    prisma.workOrder.count({ where: { ...ALIVE, branchId: id, status: { in: [...ACTIVE_WORK_ORDER_STATUSES] } } }),
    prisma.machine.count({ where: { branchId: id } }),
    prisma.outage.count({ where: { branchId: id } }),
    prisma.branchCheckIn.count({ where: { branchId: id } }),
    prisma.workLog.count({ where: { branchId: id } }),
    prisma.scoreSnapshot.count({ where: { branchId: id } }),
    prisma.branchTeamMove.count({ where: { branchId: id } }),
  ]);
  return { workOrders, trashedWorkOrders, openWorkOrders, machines, outages, checkIns, workLogs, snapshots, teamMoves };
}

/** ใช้บอกในหน้าจัดการสาขาว่าลบได้ไหม และถ้าปิดสาขาจะเหลืองานค้างกี่ใบ */
router.get("/:id/usage", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  res.json(await branchUsage(id));
});

/**
 * ลบสาขาถาวร — เฉพาะสาขาที่ไม่มีอะไรผูกอยู่เลย (ตรวจระบบ ต.ค. 69)
 *
 * เดิมลบได้ทุกสาขา และฐานข้อมูลลบต่อเนื่อง: ใบงาน เครื่อง เคสบนกระดาน ของสาขานั้นหายหมด
 * ปุ่มอยู่ทุกแถวของรายการพันกว่าสาขา กดพลาดครั้งเดียวประวัติงานหาย · สาขาที่เลิกใช้ให้ "ปิดสาขา"
 * ลบมีไว้สำหรับสาขาที่เพิ่มผิด (ยังไม่มีใบงาน/เครื่อง/ประวัติ)
 */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const branch = await prisma.branch.findUnique({ where: { id }, select: { code: true } });
  if (!branch) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  const u = await branchUsage(id);
  const linked = [
    u.workOrders && `ใบงาน ${u.workOrders} ใบ${u.trashedWorkOrders ? ` (อยู่ในถังขยะ ${u.trashedWorkOrders} ใบ)` : ""}`,
    u.machines && `เครื่อง ${u.machines} เครื่อง`,
    u.outages && `เคสบนกระดาน ${u.outages} เคส`,
    u.checkIns && `รายงานตัว ${u.checkIns} ครั้ง`,
    u.workLogs && `บันทึกการทำงาน ${u.workLogs} รายการ`,
    u.snapshots && `คะแนนย้อนหลัง ${u.snapshots} รายการ`,
    u.teamMoves && `ประวัติย้ายทีม ${u.teamMoves} รายการ`,
  ].filter(Boolean);
  if (linked.length) {
    return res.status(409).json({
      error: `ลบ ${branch.code} ไม่ได้ — มี${linked.join(" · ")} ลบสาขาแล้วข้อมูลพวกนี้หายด้วย ใช้ “ปิดสาขา” แทน`,
      usage: u,
    });
  }
  await prisma.branch.delete({ where: { id } });
  res.status(204).send();
});

/**
 * ปิดสาขา — สาขาเลิกใช้ แต่ประวัติอยู่ครบ (แทนการลบ)
 *
 * ช่องเดียวกับ "นำเข้าสาขาที่ยกเลิก" (cancelledAt) และทำแบบเดียวกัน: เคสบนกระดานที่ค้างปิดเป็น BRANCH_CANCELLED
 * สาขาที่ปิดไม่ขึ้นตอนค้นหาเปิดใบงาน ไม่นับในทีม · ใบงานที่ค้างไม่แตะ — หน้าต่างบอกจำนวนให้แอดมินจัดการเอง
 * นำเข้าไฟล์ยกเลิกรอบหน้าไม่เปิดคืนเอง (เปิดคืนเฉพาะแถวที่ไฟล์ระบุว่าคืน)
 */
const closeSchema = z.object({ note: z.string().trim().min(1, "ต้องบอกเหตุผลที่ปิดสาขา").max(200) });

router.post("/:id/close", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const parsed = closeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
  const branch = await prisma.branch.findUnique({ where: { id }, select: { code: true, cancelledAt: true } });
  if (!branch) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  if (branch.cancelledAt) return res.status(400).json({ error: `${branch.code} ปิดไปแล้ว` });
  const actor = await branchActor(req.auth!.userId);
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.branch.update({
        where: { id },
        data: { cancelledAt: now, cancelledNote: `ปิดในแอปโดย ${actor.name ?? "แอดมิน"} — ${parsed.data.note}` },
      });
      const closed = await tx.outage.updateMany({ where: { branchId: id, endedAt: null }, data: { endedAt: now, closeReason: "BRANCH_CANCELLED" } });
      // ลงประวัติด้วย (เจ้าของงานขอ 4 พ.ย. 69) — cancelledNote ถูกล้างตอนเปิดคืน ถ้าไม่จดที่นี่ เหตุผลที่เคยปิดหายไปเลย
      await logBranch(tx, id, "CLOSED", `ปิดสาขา — ${parsed.data.note}`, actor, { note: parsed.data.note, outagesClosed: closed.count });
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  res.json(await prisma.branch.findUniqueOrThrow({ where: { id } }));
});

router.post("/:id/reopen", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "รหัสสาขาไม่ถูกต้อง" });
  const branch = await prisma.branch.findUnique({ where: { id }, select: { code: true, cancelledAt: true, cancelledNote: true } });
  if (!branch) return res.status(404).json({ error: "ไม่พบสาขานี้" });
  if (!branch.cancelledAt) return res.status(400).json({ error: `${branch.code} ยังเปิดอยู่` });
  const actor = await branchActor(req.auth!.userId);
  const reopened = await prisma.$transaction(
    async (tx) => {
      const b = await tx.branch.update({ where: { id }, data: { cancelledAt: null, cancelledNote: null } });
      // เหตุผลที่เคยปิด (รวมที่ปิดจากไฟล์สาขายกเลิก ซึ่งไม่ได้ลงประวัติตอนปิด) เก็บไว้ใน meta ก่อนถูกล้าง
      await logBranch(tx, id, "REOPENED", "เปิดสาขาอีกครั้ง", actor, {
        closedAt: branch.cancelledAt!.toISOString(),
        closedNote: branch.cancelledNote,
      });
      return b;
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  res.json(reopened);
});

export default router;
