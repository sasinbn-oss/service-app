/**
 * แจ้งเตือนเข้ามือถือ (Web Push · เจ้าของงานเลือก พ.ย. 69) — ฝั่งแอป
 *
 * ใช้ได้เฉพาะเว็บ (แอปที่ใช้จริงคือเว็บที่เพิ่มไปยังหน้าจอโฮม) · ตัวรับแจ้งเตือนคือ public/push-sw.js
 * iPhone: Apple เปิดให้เฉพาะเว็บที่เปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4 ขึ้นไป) — เปิดใน Safari ปกติขอสิทธิ์ไม่ได้เลย
 * ต้องขอสิทธิ์จากการกดปุ่มเท่านั้น (เบราว์เซอร์บล็อกการขอเองตอนโหลดหน้า) จึงมีปุ่มเปิดในเมนูผู้ใช้
 */
import { Platform } from "react-native";
import { api } from "../api/client";

const SW_URL = "/push-sw.js";

export type PushState =
  /** ไม่ใช่เว็บ / เบราว์เซอร์ไม่รองรับ */
  | "unsupported"
  /** iPhone/iPad ที่ยังไม่ได้เปิดจากไอคอนบนหน้าจอโฮม */
  | "ios-needs-home"
  /** ผู้ใช้กดไม่อนุญาตไว้ — แอปขอใหม่ไม่ได้ ต้องไปเปิดในตั้งค่าของเบราว์เซอร์ */
  | "denied"
  | "off"
  | "on";

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function standalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function supported() {
  return Platform.OS === "web" && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (Platform.OS !== "web" || typeof window === "undefined") return "unsupported";
  if (isIos() && !standalone()) return "ios-needs-home";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

/** base64url → Uint8Array (applicationServerKey) */
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sendToServer(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys }, { loadingText: false });
}

/** ต้องเรียกจากการกดปุ่ม — คืนสถานะหลังทำ */
export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state === "unsupported" || state === "ios-needs-home" || state === "denied") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const { data } = await api.get<{ publicKey: string }>("/push/key", { loadingText: false });
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) }));
  await sendToServer(sub);
  return "on";
}

/**
 * ปิดแจ้งเตือนของเครื่องนี้ — ลบที่เซิร์ฟเวอร์ก่อน แล้วเลิกที่เบราว์เซอร์
 * ออกจากระบบก็เรียกตัวนี้ (ก่อนลบโทเคน): คนถัดไปที่ล็อกอินเครื่องเดียวกันต้องกดเปิดเอง ไม่ได้แจ้งเตือนต่อจากคนก่อนโดยไม่รู้ตัว
 */
export async function disablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const sub = await currentSubscription();
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }, { loadingText: false }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return "off";
}

/**
 * เปิดแอป/ล็อกอิน: เครื่องที่เคยเปิดแจ้งเตือนไว้ ผูกกับคนที่ล็อกอินอยู่ตอนนี้ (เครื่องเดียวเปลี่ยนคน = แถวเดิมย้ายไปเป็นของคนใหม่)
 * ไม่ขอสิทธิ์เอง — ไม่เคยกดอนุญาตก็ไม่ทำอะไร
 */
export async function syncPush() {
  try {
    if (!supported() || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (sub) await sendToServer(sub);
  } catch {
    // ไม่ใช่เรื่องที่ต้องบอกผู้ใช้ตอนเปิดแอป — ปุ่มในเมนูบอกสถานะจริงอยู่แล้ว
  }
}
