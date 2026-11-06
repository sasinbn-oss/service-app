-- แจ้งเตือนเข้ามือถือ (Web Push · พ.ย. 69) — ตารางใหม่ + คอลัมน์ว่าง ไม่ INSERT ข้อมูล
-- กุญแจ VAPID เซิร์ฟเวอร์สร้างเองครั้งแรกแล้วเก็บใน AppSetting (key "webPushVapid") — ไม่ต้องตั้งค่าบน Render
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "pushSince" TIMESTAMP(3);
