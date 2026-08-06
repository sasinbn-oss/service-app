/**
 * The read-only view of the app's data that the AI assistant is allowed to see.
 *
 * Every tool runs the same permission rule the REST routes use: an EMPLOYEE only
 * ever reads their own records, an ADMIN reads everyone's. The assistant never
 * writes — approving a requisition or editing a flow stays a deliberate tap in
 * the app, not something a chat message can trigger.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import { TokenPayload } from "../utils/jwt";

/** Rows returned per tool call. Enough for a monthly report, small enough to stay cheap. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value: unknown): number {
  const n = typeof value === "number" ? value : DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(n) || DEFAULT_LIMIT, 1), MAX_LIMIT);
}

/**
 * Dates arrive as YYYY-MM-DD from the model. An unparseable one is dropped
 * rather than turned into `Invalid Date`, which Prisma would reject outright and
 * which would fail the whole answer over a typo.
 */
function dateRange(from: unknown, to: unknown) {
  const parse = (v: unknown) => {
    if (typeof v !== "string" || !v.trim()) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const gte = parse(from);
  const lte = parse(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

const dateArgs = {
  fromDate: { type: "string", description: "วันเริ่มต้น รูปแบบ YYYY-MM-DD (ไม่ระบุ = ไม่จำกัด)" },
  toDate: { type: "string", description: "วันสิ้นสุด รูปแบบ YYYY-MM-DD (ไม่ระบุ = ไม่จำกัด)" },
  limit: { type: "number", description: `จำนวนแถวสูงสุด (ค่าเริ่มต้น ${DEFAULT_LIMIT})` },
} as const;

export const assistantTools: Anthropic.Tool[] = [
  {
    name: "search_work_logs",
    description:
      "ค้นบันทึกการทำงาน (WorkLog) ของช่าง ใช้เมื่อผู้ใช้ขอสรุปงาน รายงานประจำเดือน หรือรายงานการซ่อม",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "คำค้นในรายละเอียดงาน (ไม่ระบุ = ทุกงาน)" },
        ...dateArgs,
      },
    },
  },
  {
    name: "search_spare_parts",
    description: "ค้นข้อมูลอะไหล่จากรหัส ชื่อ ยี่ห้อ หรือหมวดหมู่",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "คำค้น เช่น รหัสอะไหล่ ชื่อ หรือยี่ห้อ" },
        limit: dateArgs.limit,
      },
      required: ["keyword"],
    },
  },
  {
    name: "list_branches",
    description: "รายชื่อสาขาทั้งหมดพร้อมรหัสและที่อยู่",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_branch_checkins",
    description: "ประวัติการรายงานตัวเข้าสาขาด้วย GPS ใช้ตรวจว่าใครไปสาขาไหนวันไหน",
    input_schema: { type: "object", properties: { ...dateArgs } },
  },
  {
    name: "search_troubleshooting",
    description:
      "ค้นคู่มือแก้ปัญหาและผังวินิจฉัยอาการเสีย ใช้เมื่อผู้ใช้ถามวิธีแก้อาการเสีย หรือขอเอกสารขั้นตอนการตรวจซ่อม",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "อาการเสียหรือชื่อเรื่องที่ต้องการค้น" },
        limit: dateArgs.limit,
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_troubleshoot_flow",
    description:
      "ดึงขั้นตอนทั้งหมดของผังวินิจฉัยหนึ่งเรื่อง (ใช้ id ที่ได้จาก search_troubleshooting) เพื่อทำเป็นเอกสารขั้นตอนตรวจซ่อม",
    input_schema: {
      type: "object",
      properties: { flowId: { type: "number", description: "id ของผังวินิจฉัย" } },
      required: ["flowId"],
    },
  },
  {
    name: "list_consumable_requests",
    description: "รายการคำขอเบิกของใช้สิ้นเปลือง พร้อมรายการของและสถานะอนุมัติ",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
        ...dateArgs,
      },
    },
  },
  {
    name: "list_consumable_stock",
    description: "ยอดคงเหลือของใช้สิ้นเปลืองในคลัง",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_vehicle_logs",
    description: "ประวัติการใช้รถ พร้อมเลขไมล์เริ่ม/สิ้นสุด ปลายทาง และวัตถุประสงค์",
    input_schema: { type: "object", properties: { ...dateArgs } },
  },
];

/** Serialised so the model sees ISO dates rather than JS Date objects. */
type ToolResult = unknown;

export async function runAssistantTool(
  name: string,
  input: Record<string, unknown>,
  auth: TokenPayload
): Promise<ToolResult> {
  const isAdmin = auth.role === "ADMIN";
  const limit = clampLimit(input.limit);
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  // An EMPLOYEE's queries are pinned to their own rows; only an admin sees the team.
  const ownRows = isAdmin ? {} : { userId: auth.userId };

  switch (name) {
    case "search_work_logs": {
      const range = dateRange(input.fromDate, input.toDate);
      const logs = await prisma.workLog.findMany({
        where: {
          ...ownRows,
          ...(range ? { workDate: range } : {}),
          ...(keyword ? { taskDescription: { contains: keyword, mode: "insensitive" } } : {}),
        },
        include: {
          branch: { select: { name: true, code: true } },
          user: { select: { name: true, employeeCode: true } },
        },
        orderBy: { workDate: "desc" },
        take: limit,
      });
      return logs.map((l) => ({
        id: l.id,
        วันที่: l.workDate.toISOString().slice(0, 10),
        ช่าง: l.user.name,
        รหัสพนักงาน: l.user.employeeCode,
        สาขา: l.branch?.name ?? null,
        งานที่ทำ: l.taskDescription,
        ชั่วโมง: l.hoursSpent,
      }));
    }

    case "search_spare_parts": {
      const parts = await prisma.sparePart.findMany({
        where: keyword
          ? {
              OR: [
                { partCode: { contains: keyword, mode: "insensitive" } },
                { name: { contains: keyword, mode: "insensitive" } },
                { brand: { contains: keyword, mode: "insensitive" } },
                { category: { contains: keyword, mode: "insensitive" } },
              ],
            }
          : {},
        orderBy: { partCode: "asc" },
        take: limit,
      });
      return parts.map((p) => ({
        id: p.id,
        รหัสอะไหล่: p.partCode,
        ชื่อ: p.name,
        ยี่ห้อ: p.brand,
        หมวดหมู่: p.category,
        รายละเอียด: p.description,
      }));
    }

    case "list_branches": {
      const branches = await prisma.branch.findMany({ orderBy: { code: "asc" } });
      return branches.map((b) => ({
        id: b.id,
        รหัสสาขา: b.code,
        ชื่อสาขา: b.name,
        ที่อยู่: b.address,
      }));
    }

    case "list_branch_checkins": {
      const range = dateRange(input.fromDate, input.toDate);
      const checkIns = await prisma.branchCheckIn.findMany({
        where: { ...ownRows, ...(range ? { checkedInAt: range } : {}) },
        include: {
          branch: { select: { name: true, code: true } },
          user: { select: { name: true, employeeCode: true } },
        },
        orderBy: { checkedInAt: "desc" },
        take: limit,
      });
      return checkIns.map((c) => ({
        วันเวลา: c.checkedInAt.toISOString(),
        ช่าง: c.user.name,
        สาขา: c.branch.name,
        รหัสสาขา: c.branch.code,
        ห่างจากสาขาเมตร: Math.round(c.distanceMeters),
        อยู่ในรัศมี: c.withinRadius,
        หมายเหตุ: c.note,
      }));
    }

    case "search_troubleshooting": {
      const [guides, flows] = await Promise.all([
        prisma.troubleshootingGuide.findMany({
          where: keyword
            ? {
                OR: [
                  { title: { contains: keyword, mode: "insensitive" } },
                  { symptom: { contains: keyword, mode: "insensitive" } },
                  { category: { contains: keyword, mode: "insensitive" } },
                ],
              }
            : {},
          take: limit,
        }),
        prisma.troubleshootFlow.findMany({
          where: keyword ? { title: { contains: keyword, mode: "insensitive" } } : {},
          select: { id: true, title: true, machineType: true, _count: { select: { nodes: true } } },
          take: limit,
        }),
      ]);
      return {
        คู่มือ: guides.map((g) => ({
          หมวดหมู่: g.category,
          เรื่อง: g.title,
          อาการ: g.symptom,
          วิธีแก้: g.solution,
        })),
        ผังวินิจฉัย: flows.map((f) => ({
          flowId: f.id,
          เรื่อง: f.title,
          ประเภทเครื่อง: f.machineType,
          จำนวนขั้นตอน: f._count.nodes,
        })),
      };
    }

    case "get_troubleshoot_flow": {
      const flowId = Number(input.flowId);
      if (!Number.isInteger(flowId)) return { error: "flowId ต้องเป็นตัวเลข" };
      const flow = await prisma.troubleshootFlow.findUnique({
        where: { id: flowId },
        include: { nodes: { orderBy: { order: "asc" } } },
      });
      if (!flow) return { error: "ไม่พบผังวินิจฉัยนี้" };
      return {
        เรื่อง: flow.title,
        ประเภทเครื่อง: flow.machineType,
        เริ่มที่ขั้นตอน: flow.rootKey,
        ขั้นตอน: flow.nodes.map((n) => ({
          key: n.key,
          ชนิด: n.kind === "QUESTION" ? "คำถาม" : "วิธีแก้",
          ข้อความ: n.text,
          จุดอ้างอิงในผังวงจร: n.stepNumber,
          ถ้าใช่ไปที่: n.yesKey,
          ถ้าไม่ไปที่: n.noKey,
        })),
        // Imported charts can still have gaps; say so rather than let the model
        // present an incomplete procedure as a finished document.
        หมายเหตุ:
          flow.nodes.filter((n) => n.kind === "QUESTION" && (!n.yesKey || !n.noKey)).length > 0
            ? "ผังนี้ยังมีคำถามที่เส้นทางไม่ครบ ต้องบอกผู้ใช้ว่าเอกสารยังไม่สมบูรณ์"
            : null,
      };
    }

    case "list_consumable_requests": {
      const range = dateRange(input.fromDate, input.toDate);
      const status = typeof input.status === "string" ? input.status : undefined;
      const requests = await prisma.consumableRequest.findMany({
        where: {
          ...ownRows,
          ...(status ? { status } : {}),
          ...(range ? { createdAt: range } : {}),
        },
        include: {
          items: { include: { item: true } },
          user: { select: { name: true, employeeCode: true } },
          reviewedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return requests.map((r) => ({
        เลขที่คำขอ: r.id,
        วันที่ขอ: r.createdAt.toISOString().slice(0, 10),
        ผู้ขอ: r.user.name,
        รหัสพนักงาน: r.user.employeeCode,
        สถานะ: r.status,
        ผู้อนุมัติ: r.reviewedBy?.name ?? null,
        หมายเหตุ: r.note,
        รายการ: r.items.map((i) => ({
          ของ: i.item.name,
          จำนวน: i.quantity,
          หน่วย: i.item.unit,
        })),
      }));
    }

    case "list_consumable_stock": {
      const items = await prisma.consumableItem.findMany({ orderBy: { name: "asc" } });
      return items.map((i) => ({ ของ: i.name, คงเหลือ: i.stockQty, หน่วย: i.unit }));
    }

    case "list_vehicle_logs": {
      const range = dateRange(input.fromDate, input.toDate);
      const logs = await prisma.vehicleLog.findMany({
        where: { ...ownRows, ...(range ? { startedAt: range } : {}) },
        include: {
          vehicle: { select: { plateNumber: true, brand: true, model: true } },
          user: { select: { name: true, employeeCode: true } },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
      });
      return logs.map((l) => ({
        ทะเบียนรถ: l.vehicle.plateNumber,
        รถ: [l.vehicle.brand, l.vehicle.model].filter(Boolean).join(" ") || null,
        ผู้ใช้รถ: l.user.name,
        วัตถุประสงค์: l.purpose,
        ปลายทาง: l.destination,
        ออกเมื่อ: l.startedAt.toISOString(),
        คืนเมื่อ: l.endedAt?.toISOString() ?? null,
        ไมล์เริ่ม: l.startMileage,
        ไมล์สิ้นสุด: l.endMileage,
        ระยะทางกม: l.endMileage != null ? l.endMileage - l.startMileage : null,
        สถานะ: l.status,
      }));
    }

    default:
      return { error: `ไม่รู้จักเครื่องมือ "${name}"` };
  }
}
