# หน้าเว็บของระบบทดสอบในเครื่อง — build แบบเดียวกับระบบจริง แล้วเสิร์ฟด้วย nginx
FROM node:22-bookworm-slim AS build
WORKDIR /app/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
# same-origin: เรียก API ผ่านที่อยู่เดียวกับหน้าเว็บ (nginx ส่ง /api ต่อให้) — ใช้ได้ทั้ง localhost และ IP ในวง Wi-Fi
# test: ขึ้นแถบส้ม "ระบบทดสอบ" ทุกหน้า
ENV EXPO_PUBLIC_API_URL=same-origin EXPO_PUBLIC_APP_ENV=test CI=1
RUN npm run build:web

FROM nginx:1.27-alpine
COPY --from=build /app/mobile/dist /usr/share/nginx/html
COPY local-test/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
