# Service App

แอปสำหรับงานบริการภาคสนาม ประกอบด้วย 2 ฟังก์ชันหลัก:

1. **ลงทะเบียนใช้รถ** — เช็คอิน/เช็คเอาท์การใช้รถ พร้อมบันทึกเลขไมล์ วัตถุประสงค์ และปลายทาง
2. **ลงข้อมูลการทำงาน และรายงานตัวเข้าสาขา** — บันทึกงานที่ทำในแต่ละวัน และรายงานตัวเข้าสาขาโดยยืนยันตำแหน่งด้วย GPS

ระบบมีการล็อกอินและแบ่งสิทธิ์ผู้ใช้ 2 ระดับ: **พนักงาน (EMPLOYEE)** และ **ผู้ดูแลระบบ (ADMIN)**
ผู้ใช้คนแรกที่ลงทะเบียนในระบบจะได้รับสิทธิ์ ADMIN โดยอัตโนมัติ (สามารถจัดการข้อมูลรถและสาขาได้)

## โครงสร้างโปรเจกต์

```
service-app/
├── backend/   # REST API (Node.js + Express + TypeScript + Prisma + SQLite)
└── mobile/    # แอปมือถือ (Expo / React Native + TypeScript)
```

## Backend

```bash
cd backend
cp .env.example .env       # แก้ไข JWT_SECRET ก่อนใช้งานจริง
npm install
npx prisma migrate dev     # สร้างฐานข้อมูล SQLite และตาราง
npx prisma db seed         # ใส่ข้อมูลตัวอย่าง (รถ 2 คัน, สาขา 2 แห่ง)
npm run dev                # รันที่ http://localhost:4000
```

### Endpoints หลัก

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/vehicles`, `PUT/DELETE /api/vehicles/:id` (ADMIN)
- `POST /api/vehicle-logs/start`, `POST /api/vehicle-logs/:id/end`, `GET /api/vehicle-logs`, `GET /api/vehicle-logs/active`
- `GET/POST /api/branches`, `PUT/DELETE /api/branches/:id` (ADMIN)
- `POST /api/branch-checkins`, `GET /api/branch-checkins` — คำนวณระยะห่างจากพิกัดสาขา (Haversine) และตั้งค่า `withinRadius`
- `GET/POST /api/work-logs`, `DELETE /api/work-logs/:id`

ทุก endpoint (ยกเว้น auth) ต้องแนบ header `Authorization: Bearer <token>`

## Mobile App

```bash
cd mobile
cp .env.example .env       # ตั้งค่า EXPO_PUBLIC_API_URL ให้ชี้ไปที่ IP เครื่องที่รัน backend
npm install
npm start                  # เปิด Expo Dev Tools แล้วสแกน QR ด้วยแอป Expo Go
```

**สำคัญ:** เมื่อทดสอบบนมือถือจริงผ่าน Expo Go ให้ตั้งค่า `EXPO_PUBLIC_API_URL` ใน `mobile/.env`
เป็น IP แบบ LAN ของเครื่องที่รัน backend (เช่น `http://192.168.1.20:4000`) ไม่ใช่ `localhost`
เพราะมือถือกับเครื่อง dev คนละเครื่องกัน ต้องอยู่ใน Wi-Fi วงเดียวกัน

### ฟีเจอร์ในแอป

- ล็อกอิน / ลงทะเบียนพนักงาน
- **ลงทะเบียนใช้รถ**: เลือกรถที่ว่าง ระบุวัตถุประสงค์และเลขไมล์เริ่มต้น เมื่อคืนรถให้กรอกเลขไมล์สิ้นสุด
- **รายงานตัวเข้าสาขา**: เลือกสาขา ระบบขอสิทธิ์ตำแหน่ง GPS และคำนวณระยะห่างจากพิกัดสาขาที่ตั้งไว้ (ถ้าห่างเกินรัศมีที่กำหนดจะแจ้งเตือนว่า "นอกระยะ" แต่ยังบันทึกข้อมูลไว้)
- **บันทึกข้อมูลการทำงาน**: ลงวันที่ รายละเอียดงาน จำนวนชั่วโมง และสาขาที่เกี่ยวข้อง
- ดูประวัติย้อนหลังของแต่ละฟังก์ชัน
- สำหรับ ADMIN: จัดการข้อมูลรถและสาขา (เพิ่ม/ลบ) รวมถึงตั้งพิกัดและรัศมีของแต่ละสาขา

## หมายเหตุด้านความปลอดภัย

- รหัสผ่านถูกเข้ารหัสด้วย bcrypt ก่อนบันทึกลงฐานข้อมูล
- Token เป็น JWT อายุ 30 วัน ควรเปลี่ยน `JWT_SECRET` ใน production
- SQLite เหมาะสำหรับการพัฒนา/ทดสอบ หากใช้งานจริงในหลายสาขาพร้อมกันแนะนำเปลี่ยนเป็น PostgreSQL โดยแก้ `datasource` ใน `backend/prisma/schema.prisma`
