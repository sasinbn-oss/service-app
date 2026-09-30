# เซิร์ฟเวอร์ backend ในรูปแบบ container
#
# เขียนให้รันได้ทุกที่ที่รับ Dockerfile — Fly.io, Railway, Koyeb, DigitalOcean
# หรือแม้แต่ Render เอง จุดประสงค์คือเลือกที่ตั้งเซิร์ฟเวอร์ให้อยู่ region
# เดียวกับฐานข้อมูลได้ เพราะการเปิดใบงานหนึ่งใบคุยกับฐานข้อมูลสิบกว่ารอบ
# ถ้าอยู่คนละทวีปกัน เวลาเดินทางไปกลับคือเวลาที่ผู้ใช้รอจริง ๆ

# ── ขั้นที่ 1: ติดตั้งและ build ──
FROM node:22-slim AS build
WORKDIR /app

# ใช้ debian ไม่ใช่ alpine เพราะ Prisma ต้องการ OpenSSL แบบ glibc
# บน alpine ต้องไปตั้ง binaryTargets เพิ่ม ซึ่งเป็นจุดที่พังเงียบตอน deploy
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# คัดลอกแค่สองไฟล์นี้ก่อน เพื่อให้ layer ของ npm ci ถูก cache ไว้
# ตราบใดที่ dependency ไม่เปลี่ยน แก้โค้ดแล้ว build ใหม่จะไม่ต้องติดตั้งซ้ำ
COPY package.json package-lock.json ./
# schema ต้องมาก่อน npm ci เพราะ postinstall เรียก prisma generate
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── ขั้นที่ 2: image ที่เอาไปรันจริง ──
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# โฮสต์ส่วนใหญ่ส่ง PORT มาให้เอง ค่านี้เป็นค่าตั้งต้นเผื่อไม่ส่งมา
ENV PORT=8080

# ยกทั้ง node_modules มาจากขั้น build โดยตั้งใจ ไม่ได้ตัด devDependencies ออก
# เพราะคำสั่ง prisma (ที่ใช้รัน migrate ตอนเครื่องเริ่ม) เป็น devDependency
# ถ้าตัดออกแล้ว container จะขึ้นไม่ได้ โดยที่ build ผ่านปกติ — พังแบบที่เจอ
# ตอน deploy เท่านั้น
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./
# ฟอนต์ไทยของไฟล์ PDF — โค้ดอ่านจาก assets/fonts ตอนออกเอกสาร ไม่ได้ฝังไว้ใน dist
COPY assets ./assets

EXPOSE 8080

# ใช้ node_modules/.bin/prisma ไม่ใช่ npx prisma — npx จะไปดึง prisma รุ่นใหม่
# จากอินเทอร์เน็ตมาแทนตัวที่ติดตั้งไว้ ซึ่งเคยทำให้คำสั่งเปลี่ยนความหมายมาแล้ว
#
# migrate deploy รันทุกครั้งที่เครื่องเริ่ม ปลอดภัยเพราะถ้า migration ครบแล้ว
# มันไม่ทำอะไร และ Prisma จับ lock ไว้ ต่อให้เครื่องขึ้นพร้อมกันหลายตัวก็ไม่ชนกัน
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
