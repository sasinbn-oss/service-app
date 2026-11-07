/*
 * ตัวรับแจ้งเตือนเข้ามือถือ (Web Push · พ.ย. 69) — ดู src/utils/push.ts และ backend/src/push/webPush.ts
 *
 * ไฟล์นี้ทำแค่สองอย่าง: โชว์แจ้งเตือน · แตะแล้วเปิดแอปที่หน้านั้น
 * ไม่มี fetch handler โดยตั้งใจ — ไม่แคชอะไร หน้าแอปโหลดจากเซิร์ฟเวอร์ตามเดิม (มีรุ่นใหม่ก็ได้รุ่นใหม่ทันที)
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "OTTERI Service", body: "", url: "/", tag: "otteri" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch (e) {
    // ข้อความที่อ่านไม่ได้ยังขึ้นแจ้งเตือนเปล่า ๆ — iOS ตัดสิทธิ์เว็บที่ได้ push แล้วไม่โชว์อะไรเลย
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      // แท็กเดิมมาใหม่ยังสั่น/มีเสียง — ข้อความแชทใหม่ในห้องเดิมต้องรู้ตัว แม้จะทับอันเก่า
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: msg.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // แอปเปิดอยู่แล้ว — ใช้หน้าต่างเดิม ไม่เปิดแท็บใหม่ทุกครั้งที่แตะ
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        return win.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })()
  );
});
