/**
 * แจ้งเตือนงานเข้ากล่องใหม่เข้ามือถือ (เจ้าของงานเลือกข้อ 23 — "แชทใหม่ + งานใหม่เข้ากล่องงาน")
 *
 * ทำไมเป็นรอบทุก 2 นาที ไม่ใช่ส่งตอนเดินขั้น: ใครต้องทำขั้นไหนตัดสินจาก inboxFilter (ภาค ทีม ไม่มีคนรับ เวลาปิดนัด คนดูแลงาน IT …)
 * การกลับด้านหาว่า "ใบนี้เข้ากล่องใครบ้าง" ทุกจุดที่เดินขั้น (ราว 60 จุด) คือกฎชุดที่สองที่จะเพี้ยนจากของจริงทันทีที่กฎเปลี่ยน
 * รอบนี้ถามกระดิ่งของแต่ละคน (bellItemsFor — กติกาเดียวกับตัวเลขบนกระดิ่ง) เฉพาะคนที่เปิดแจ้งเตือนไว้ ช้าสุดราว 2 นาที
 *
 * ส่งเฉพาะใบที่เข้าขั้นหลัง User.pushSince (ตอนสมัครครั้งแรก/รอบที่แล้ว) — ไม่ส่งซ้ำ และใบที่เปิดดูแล้วไม่อยู่ในกระดิ่งอยู่แล้ว
 * ทีละคนตามลำดับ ไม่พร้อมกัน — Prisma เปิดได้ 5 connection (src/prisma.ts) รอบเบื้องหลังต้องไม่แย่งคำขอของคนที่ใช้แอปอยู่
 */
import { prisma } from "../prisma";
import { bellItemsFor } from "../routes/workOrders";
import type { Role } from "../utils/constants";
import type { TokenPayload } from "../utils/jwt";
import { pushToUsers } from "./webPush";

const EVERY_MS = 2 * 60_000;

/** ตำแหน่งในฐานข้อมูล → สิทธิ์ที่ requireAuth ให้ (Super Admin/Admin Spare Part = แอดมิน · Senior = ช่าง) */
function authOf(u: { id: number; role: string }): TokenPayload {
  if (u.role === "SUPER_ADMIN") return { userId: u.id, role: "ADMIN" as Role, superAdmin: true };
  if (u.role === "PARTS_ADMIN") return { userId: u.id, role: "ADMIN" as Role, partsAdmin: true };
  if (u.role === "SENIOR_TECH") return { userId: u.id, role: "EMPLOYEE" as Role, seniorTech: true };
  return { userId: u.id, role: u.role as Role };
}

export async function inboxPushRound() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, pushSubscriptions: { some: {} } },
    select: { id: true, role: true, pushSince: true },
  });
  let sent = 0;
  for (const u of users) {
    // เวลาก่อนถาม — ใบที่เข้าขั้นระหว่างถามได้ในรอบหน้า ไม่ใช่ทั้งสองรอบ
    const until = new Date();
    const since = u.pushSince ?? until;
    try {
      const items = (await bellItemsFor(authOf(u))).filter((x) => x.at > since && x.at <= until);
      await prisma.user.update({ where: { id: u.id }, data: { pushSince: until } });
      if (!items.length) continue;
      const first = items[0];
      await pushToUsers(
        [u.id],
        items.length === 1
          ? {
              title: `งานเข้าใหม่ · ${first.code}${first.urgent ? " · ด่วน" : ""}`,
              body: `${first.branch} — ${first.title} (${first.statusLabel})`,
              url: `/wo/${first.code}`,
              tag: "inbox",
            }
          : {
              title: `งานเข้าใหม่ ${items.length} ใบ${items.some((i) => i.urgent) ? " · มีงานด่วน" : ""}`,
              body: items
                .slice(0, 3)
                .map((i) => `${i.code} ${i.branch}`)
                .join(" · ") + (items.length > 3 ? ` · และอีก ${items.length - 3} ใบ` : ""),
              url: "/work-orders",
              tag: "inbox",
            }
      );
      sent++;
    } catch (e) {
      console.error("[push] รอบงานเข้ากล่องของผู้ใช้", u.id, e);
    }
  }
  return { users: users.length, sent };
}

export function startInboxPush() {
  let running = false;
  const run = () => {
    if (running) return; // รอบก่อนยังไม่จบ (ฐานข้อมูลช้า) — ข้ามไป ไม่ซ้อนกัน
    running = true;
    inboxPushRound()
      .catch((e) => console.error("[push] รอบงานเข้ากล่อง", e))
      .finally(() => (running = false));
  };
  setInterval(run, EVERY_MS).unref();
}
