/**
 * ไทม์ไลน์ (Super Admin) — ใครทำอะไรกับใบงาน/ทีม เมื่อไร
 *
 * ไม่มีตารางของตัวเอง ประกอบจากสิ่งที่ระบบบันทึกอยู่แล้ว: ประวัติใบงาน (WorkOrderLog รวมการแนบไฟล์)
 * เบิก/คืนรถที่ผูกกับใบงาน รายงานตัวด้วย GPS ที่สาขา และแผนรายวัน — จึงย้อนดูใบงานเก่าได้ทันที
 * และไม่ต้องให้ใครกรอกเพิ่ม เจ้าของระบบต้องการเห็นว่างานค้างอยู่ที่ใคร นานเท่าไร
 */
import { prisma } from "../prisma";
import {
  WORK_ORDER_ACTION_LABELS,
  WORK_ORDER_STATUS_LABELS,
  bangkokDayRange,
} from "./constants";

export type TimelineRole = "ADMIN" | "SUPERVISOR" | "EMPLOYEE" | "SYSTEM";

export interface TimelineEvent {
  at: string;
  role: TimelineRole;
  who: string;
  what: string;
  note?: string | null;
  tags?: { text: string; tone?: "ok" | "warn" }[];
  workOrder?: { id: number; code: string };
}

// Super Admin ทำงานแบบแอดมิน — สีเดียวกัน ไม่ต้องแยกบทบาทในไทม์ไลน์
const roleOf = (r: string | null | undefined): TimelineRole =>
  r === "SUPERVISOR" ? "SUPERVISOR" : r === "EMPLOYEE" ? "EMPLOYEE" : r ? "ADMIN" : "SYSTEM";

const sort = (e: TimelineEvent[]) => e.sort((a, b) => a.at.localeCompare(b.at));

function thaiStamp(d: Date) {
  const t = new Date(d.getTime() + 7 * 3600_000);
  const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${t.getUTCDate()} ${M[t.getUTCMonth()]} ${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

function km(n: number) {
  return n.toLocaleString("en-US");
}

export async function workOrderTimeline(id: number) {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      jobType: true,
      assignedTeam: true,
      scheduledAt: true,
      createdAt: true,
      closedAt: true,
      branchId: true,
      branch: { select: { code: true, name: true } },
      workers: { select: { userId: true } },
      logs: {
        orderBy: { createdAt: "asc" },
        select: { action: true, status: true, note: true, createdAt: true, backfilledAt: true, userId: true, user: { select: { name: true, role: true } } },
      },
      vehicleLogs: {
        select: {
          startedAt: true,
          endedAt: true,
          startMileage: true,
          endMileage: true,
          cost: true,
          status: true,
          user: { select: { name: true, role: true } },
          vehicle: { select: { plateNumber: true } },
        },
      },
    },
  });
  if (!wo) return null;

  const events: TimelineEvent[] = [];
  const people = new Set<number>();
  for (const l of wo.logs) {
    if (l.userId) people.add(l.userId);
    events.push({
      at: l.createdAt.toISOString(),
      role: roleOf(l.user?.role),
      who: l.user?.name ?? "ระบบ",
      what: WORK_ORDER_ACTION_LABELS[l.action] ?? l.action,
      note: l.note,
      tags: [
        { text: `สถานะ: ${WORK_ORDER_STATUS_LABELS[l.status] ?? l.status}`, tone: l.status === "DONE" ? "ok" : undefined },
        // ปิดงานย้อนหลัง — เวลาของรายการคือเวลาจริงของงาน ส่วนนี่คือตอนที่แอดมินกรอก
        ...(l.backfilledAt ? [{ text: `แอดมินบันทึกย้อนหลัง ${thaiStamp(l.backfilledAt)}`, tone: "warn" as const }] : []),
      ],
    });
  }
  for (const v of wo.vehicleLogs) {
    events.push({
      at: v.startedAt.toISOString(),
      role: roleOf(v.user.role),
      who: v.user.name,
      what: `รับรถ ${v.vehicle.plateNumber}`,
      note: `ไมล์ ${km(v.startMileage)}`,
    });
    if (v.endedAt) {
      events.push({
        at: v.endedAt.toISOString(),
        role: roleOf(v.user.role),
        who: v.user.name,
        what: `คืนรถ ${v.vehicle.plateNumber}`,
        note: [
          v.endMileage !== null ? `ไมล์ ${km(v.endMileage)} · ${km(v.endMileage - v.startMileage)} กม.` : null,
          v.cost ? `ค่าใช้จ่าย ${km(v.cost)} บาท` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  // รายงานตัวที่สาขานี้ ระหว่างเปิดใบงานจนปิด (+1 วันเผื่อรายงานตัวหลังกดปิด) — ของคนที่ไปทำงานใบนี้
  // หรือช่างทีมที่รับงาน · คนอื่นที่บังเอิญแวะสาขาเดียวกันไม่เกี่ยวกับใบนี้
  const team = wo.assignedTeam
    ? await prisma.user.findMany({ where: { team: wo.assignedTeam }, select: { id: true } })
    : [];
  const relevant = [...new Set([...wo.workers.map((w) => w.userId), ...team.map((t) => t.id)])];
  const until = new Date((wo.closedAt ?? new Date()).getTime() + 86_400_000);
  const checkIns = relevant.length
    ? await prisma.branchCheckIn.findMany({
        where: { branchId: wo.branchId, userId: { in: relevant }, checkedInAt: { gte: wo.createdAt, lte: until } },
        select: { checkedInAt: true, distanceMeters: true, withinRadius: true, user: { select: { name: true, role: true } } },
        orderBy: { checkedInAt: "asc" },
      })
    : [];
  for (const c of checkIns) {
    events.push({
      at: c.checkedInAt.toISOString(),
      role: roleOf(c.user.role),
      who: c.user.name,
      what: `รายงานตัวที่ ${wo.branch.name}`,
      tags: [
        {
          text: `GPS ห่าง ${Math.round(c.distanceMeters)} ม. · ${c.withinRadius ? "ในรัศมี" : "นอกรัศมี"}`,
          tone: c.withinRadius ? "ok" : "warn",
        },
      ],
    });
  }

  // แผนทีมของวันนัด — ใครจัดคน เมื่อไร
  if (wo.assignedTeam && wo.scheduledAt) {
    const plan = await prisma.teamDayPlan.findUnique({
      where: { date_team: { date: wo.scheduledAt, team: wo.assignedTeam } },
      select: {
        updatedAt: true,
        startTime: true,
        plannedBy: { select: { name: true, role: true } },
        vehicle: { select: { plateNumber: true } },
        members: { orderBy: { position: "asc" }, select: { user: { select: { name: true } } } },
      },
    });
    if (plan) {
      events.push({
        at: plan.updatedAt.toISOString(),
        role: roleOf(plan.plannedBy?.role),
        who: plan.plannedBy?.name ?? "ระบบ",
        what: `จัดแผนทีม ${wo.assignedTeam}`,
        note: [
          plan.members.map((m, i) => (i === 0 ? `★ ${m.user.name}` : m.user.name)).join(" · "),
          plan.vehicle ? `รถ ${plan.vehicle.plateNumber}` : null,
          plan.startTime ? `เข้า ${plan.startTime} น.` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        tags: [{ text: "แผนรายวัน" }],
      });
    }
  }
  sort(events);

  // แต่ละสถานะค้างอยู่นานเท่าไร — สถานะหลังรายการหนึ่งอยู่จนถึงรายการถัดไป
  const end = wo.closedAt ?? new Date();
  const stages: { status: string; label: string; ms: number }[] = [];
  for (let i = 0; i < wo.logs.length; i++) {
    const l = wo.logs[i];
    if (l.status === "DONE" || l.status === "CANCELLED") break;
    const next = wo.logs[i + 1]?.createdAt ?? end;
    const ms = Math.max(0, next.getTime() - l.createdAt.getTime());
    const last = stages[stages.length - 1];
    if (last && last.status === l.status) last.ms += ms;
    else stages.push({ status: l.status, label: WORK_ORDER_STATUS_LABELS[l.status] ?? l.status, ms });
  }
  const longest = stages.reduce<(typeof stages)[number] | null>((m, s) => (!m || s.ms > m.ms ? s : m), null);
  const firstCheckIn = checkIns[0]?.checkedInAt;
  return {
    workOrder: {
      id: wo.id,
      code: wo.code,
      title: wo.title,
      status: wo.status,
      statusLabel: WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status,
      jobType: wo.jobType,
      team: wo.assignedTeam,
      branch: wo.branch,
      createdAt: wo.createdAt,
      closedAt: wo.closedAt,
    },
    summary: {
      totalMs: end.getTime() - wo.createdAt.getTime(),
      open: !wo.closedAt,
      longest,
      // ช่างอยู่หน้างาน = รายงานตัวครั้งแรก → ปิดงาน (ไม่มีรายงานตัว = ไม่รู้)
      onSiteMs: firstCheckIn && wo.closedAt && wo.closedAt > firstCheckIn ? wo.closedAt.getTime() - firstCheckIn.getTime() : null,
      people: new Set([...people, ...checkIns.map((c) => c.user.name)]).size,
    },
    stages,
    events,
  };
}

/** วันหนึ่งของทีมหนึ่ง — แผน รับ/คืนรถ รายงานตัว และทุกการกดในใบงานของทีม */
export async function teamDayTimeline(day: string, team: string) {
  const { from, to } = bangkokDayRange(day);
  const plan = await prisma.teamDayPlan.findUnique({
    where: { date_team: { date: new Date(`${day}T00:00:00.000Z`), team } },
    select: {
      updatedAt: true,
      startTime: true,
      plannedBy: { select: { name: true, role: true } },
      vehicle: { select: { plateNumber: true } },
      members: { orderBy: { position: "asc" }, select: { userId: true, user: { select: { name: true } } } },
    },
  });
  const memberIds = [
    ...new Set([
      ...(plan?.members.map((m) => m.userId) ?? []),
      ...(await prisma.user.findMany({ where: { team, deletedAt: null }, select: { id: true } })).map((u) => u.id),
    ]),
  ];

  const [vehicles, checkIns, logs] = await Promise.all([
    prisma.vehicleLog.findMany({
      where: { userId: { in: memberIds }, OR: [{ startedAt: { gte: from, lt: to } }, { endedAt: { gte: from, lt: to } }] },
      select: {
        startedAt: true,
        endedAt: true,
        startMileage: true,
        endMileage: true,
        cost: true,
        user: { select: { name: true, role: true } },
        vehicle: { select: { plateNumber: true } },
      },
    }),
    prisma.branchCheckIn.findMany({
      where: { userId: { in: memberIds }, checkedInAt: { gte: from, lt: to } },
      select: { checkedInAt: true, distanceMeters: true, withinRadius: true, user: { select: { name: true, role: true } }, branch: { select: { name: true } } },
    }),
    prisma.workOrderLog.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        OR: [{ workOrder: { assignedTeam: team } }, { userId: { in: memberIds } }],
      },
      select: {
        action: true,
        status: true,
        note: true,
        createdAt: true,
        backfilledAt: true,
        user: { select: { name: true, role: true } },
        workOrder: { select: { id: true, code: true } },
      },
    }),
  ]);

  const events: TimelineEvent[] = [];
  if (plan?.startTime) {
    events.push({
      at: new Date(`${day}T${plan.startTime}:00+07:00`).toISOString(),
      role: "SYSTEM",
      who: "แผนรายวัน",
      what: "เวลาเข้าหน้างานตามแผน",
      note: plan.members.map((m, i) => (i === 0 ? `★ ${m.user.name}` : m.user.name)).join(" · "),
    });
  }
  if (plan) {
    events.push({
      at: plan.updatedAt.toISOString(),
      role: roleOf(plan.plannedBy?.role),
      who: plan.plannedBy?.name ?? "ระบบ",
      what: "จัดแผนทีม",
      note: [plan.vehicle ? `รถ ${plan.vehicle.plateNumber}` : null, plan.startTime ? `เข้า ${plan.startTime} น.` : null].filter(Boolean).join(" · ") || null,
      tags: [{ text: "แผนรายวัน" }],
    });
  }
  for (const v of vehicles) {
    if (v.startedAt >= from && v.startedAt < to) {
      const late = plan?.startTime && v.startedAt > new Date(`${day}T${plan.startTime}:00+07:00`);
      events.push({
        at: v.startedAt.toISOString(),
        role: roleOf(v.user.role),
        who: v.user.name,
        what: `รับรถ ${v.vehicle.plateNumber}`,
        note: `ไมล์ ${km(v.startMileage)}`,
        tags: late ? [{ text: "หลังเวลาเข้าตามแผน", tone: "warn" }] : undefined,
      });
    }
    if (v.endedAt && v.endedAt >= from && v.endedAt < to) {
      events.push({
        at: v.endedAt.toISOString(),
        role: roleOf(v.user.role),
        who: v.user.name,
        what: `คืนรถ ${v.vehicle.plateNumber}`,
        note:
          [
            v.endMileage !== null ? `${km(v.endMileage - v.startMileage)} กม.` : null,
            v.cost ? `ค่าใช้จ่าย ${km(v.cost)} บาท` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      });
    }
  }
  for (const c of checkIns) {
    events.push({
      at: c.checkedInAt.toISOString(),
      role: roleOf(c.user.role),
      who: c.user.name,
      what: `รายงานตัว ${c.branch.name}`,
      tags: [{ text: `GPS ห่าง ${Math.round(c.distanceMeters)} ม. · ${c.withinRadius ? "ในรัศมี" : "นอกรัศมี"}`, tone: c.withinRadius ? "ok" : "warn" }],
    });
  }
  for (const l of logs) {
    events.push({
      at: l.createdAt.toISOString(),
      role: roleOf(l.user?.role),
      who: l.user?.name ?? "ระบบ",
      what: `${WORK_ORDER_ACTION_LABELS[l.action] ?? l.action} ${l.workOrder.code}`,
      note: l.note,
      tags: [
        ...(l.status === "DONE" ? [{ text: "ปิดงาน", tone: "ok" as const }] : []),
        ...(l.backfilledAt ? [{ text: `แอดมินบันทึกย้อนหลัง ${thaiStamp(l.backfilledAt)}`, tone: "warn" as const }] : []),
      ],
      workOrder: l.workOrder,
    });
  }
  return {
    day,
    team,
    members: plan?.members.map((m) => m.user.name) ?? [],
    vehicle: plan?.vehicle?.plateNumber ?? null,
    events: sort(events),
  };
}
