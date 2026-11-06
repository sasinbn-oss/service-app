/**
 * แจ้งเตือนเข้ามือถือ (Web Push · เจ้าของงานเลือก พ.ย. 69 — ข้อ 22 ก. · ข้อ 23 ก.)
 *
 * ทำไม Web Push: แอปที่ใช้จริงคือเว็บ (เพิ่มไปยังหน้าจอโฮม) — ไม่ต้องมีบัญชีภายนอก ไม่มีค่ารายเดือน
 * Android กดอนุญาตครั้งเดียว · iPhone ต้องเปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4 ขึ้นไป) ข้อจำกัดของ Apple ไม่ใช่ของเรา
 *
 * แจ้งสองเรื่อง: ข้อความแชทใหม่ในใบที่เกี่ยวกับเรา (chatRecipients ใน routes/workOrders.ts) · งานเข้ากล่องใหม่ (startInboxPush)
 * ส่งไม่สำเร็จไม่ใช่เหตุให้คำขอหลักล้ม — ทุกจุดเรียกแบบไม่รอผล และ error ลง log อย่างเดียว
 */
import webpush from "web-push";
import { prisma } from "../prisma";

const VAPID_KEY = "webPushVapid";
/** ติดต่อเจ้าของเซิร์ฟเวอร์แจ้งเตือน (ผู้ให้บริการ push ของเบราว์เซอร์ใช้ติดต่อเมื่อส่งผิดปกติ) — ไม่ใช่อีเมลของใคร */
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@otteri.invalid";

let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

/**
 * กุญแจ VAPID — ตั้งใน env ได้ (VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY) ไม่ตั้ง = เซิร์ฟเวอร์สร้างเองครั้งแรกแล้วเก็บใน AppSetting
 * เจ้าของงานไม่ใช่นักพัฒนา การให้ไปสร้างกุญแจแล้วใส่ใน Render คือขั้นที่พลาดง่ายที่สุด
 * อ่านแถวแรกสุดเสมอ (ไม่ใช่ล่าสุด) — สองเครื่องสร้างพร้อมกันตอนเริ่ม ทั้งคู่ยังใช้กุญแจเดียวกัน
 * กุญแจเปลี่ยน = การสมัครเดิมใช้ไม่ได้ทั้งหมด (เบราว์เซอร์ผูกกับกุญแจตอนสมัคร) จึงไม่สร้างใหม่ถ้ามีอยู่แล้ว
 */
export function vapidKeys() {
  keys ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const first = () => prisma.appSetting.findFirst({ where: { key: VAPID_KEY }, orderBy: { id: "asc" } });
    let row = await first();
    if (!row) {
      await prisma.appSetting.create({ data: { key: VAPID_KEY, value: JSON.stringify(webpush.generateVAPIDKeys()) } });
      row = await first();
    }
    return JSON.parse(row!.value) as { publicKey: string; privateKey: string };
  })().catch((e) => {
    keys = null; // ฐานข้อมูลสะดุดตอนเริ่ม — ครั้งหน้าลองใหม่ ไม่จำความล้มเหลวไว้ตลอดอายุเซิร์ฟเวอร์
    throw e;
  });
  return keys;
}

export interface PushMessage {
  title: string;
  body: string;
  /** ที่อยู่ในแอปที่จะเปิดเมื่อแตะ เช่น /#/wo/WO-04324 (เว็บใช้ที่อยู่หลัง # — ดู navigation/linking.ts) */
  url: string;
  /** ข้อความเรื่องเดียวกันทับกัน ไม่กองเป็นสิบอันบนจอล็อก (เช่น chat-<id> · inbox) */
  tag: string;
}

/** ส่งให้ทุกเครื่องของคนเหล่านี้ — การสมัครที่ผู้ให้บริการบอกว่าหมดอายุ (404/410) ลบทิ้ง */
export async function pushToUsers(userIds: number[], msg: PushMessage) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids }, user: { deletedAt: null } } });
  if (!subs.length) return;
  const { publicKey, privateKey } = await vapidKeys();
  const payload = JSON.stringify(msg);
  const gone: number[] = [];
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject: SUBJECT, publicKey, privateKey },
          // เครื่องปิดอยู่นานกว่านี้ไม่ต้องส่งแล้ว — งานเข้ากล่อง/แชทเก่าเกินวันไม่มีประโยชน์ (เปิดแอปก็เห็นในกระดิ่งอยู่แล้ว)
          TTL: 12 * 3600,
          urgency: "high",
        })
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.id);
          else console.error("[push] ส่งไม่สำเร็จ", s.userId, e.statusCode ?? e);
        })
    )
  );
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
}

/** ไม่รอผล — คำขอหลัก (ส่งข้อความ · เดินขั้น) ต้องไม่ช้าลงหรือล้มเพราะแจ้งเตือน */
export function pushLater(userIds: number[] | Promise<number[]>, msg: PushMessage) {
  Promise.resolve(userIds)
    .then((ids) => pushToUsers(ids, msg))
    .catch((e) => console.error("[push] เตรียมส่งไม่สำเร็จ", e));
}
