# backend ของระบบทดสอบในเครื่อง — build จากโค้ดชุดเดียวกับระบบจริง (context = โฟลเดอร์บนสุดของโปรเจกต์)
# image เต็ม (ไม่ใช่ -slim) เพราะมี openssl ที่ Prisma ต้องใช้อยู่แล้ว — ไม่ต้องติดตั้งเพิ่มตอน build
FROM node:22-bookworm
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# npm ci สั่ง prisma generate เอง (postinstall) — ต้องมี schema ก่อนติดตั้ง
COPY backend/prisma ./prisma
# ไม่ตั้ง NODE_ENV=production ตอนติดตั้ง — ts-node (ใช้ใส่ข้อมูลตัวอย่าง) อยู่ใน devDependencies
RUN npm ci
COPY backend/ ./
RUN node_modules/.bin/prisma generate && npm run build
COPY local-test/ /local-test/
RUN chmod +x /local-test/backend-start.sh
EXPOSE 4000
CMD ["/local-test/backend-start.sh"]
