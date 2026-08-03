# Service App

แอปสำหรับงานบริการภาคสนาม ประกอบด้วย 6 ฟีเจอร์หลัก:

1. **คู่มือแก้ปัญหา (Troubleshooting guide)** — สองแบบ: ผังวินิจฉัยแบบกดตอบใช่/ไม่ทีละขั้นพร้อมแผนผังวงจร (นำเข้าจาก Excel ของผู้ผลิต) และคู่มือแบบข้อความที่แอดมินเขียนเอง
2. **รายการอะไหล่ (Spare part list)** — ค้นหาจากชื่อ/รหัส/ยี่ห้อ แสดงรหัสสินค้า ยี่ห้อ และรูปภาพ
3. **รายงานตัวเข้าสาขา** — ยืนยันตำแหน่งด้วย GPS เทียบกับพิกัดสาขา
4. **บันทึกข้อมูลการทำงาน** — ลงงานที่ทำในแต่ละวัน
5. **ลงทะเบียนใช้รถ** — เช็คอิน/เช็คเอาท์การใช้รถ พร้อมบันทึกเลขไมล์
6. **เบิกของใช้สิ้นเปลือง** — พนักงานขอเบิก หัวหน้าอนุมัติ ระบบตัดสต็อกอัตโนมัติ

ระบบมีการล็อกอินและแบ่งสิทธิ์ผู้ใช้ 2 ระดับ: **พนักงาน (EMPLOYEE)** และ **ผู้ดูแลระบบ (ADMIN)**
ผู้ใช้คนแรกที่ลงทะเบียนในระบบจะได้รับสิทธิ์ ADMIN โดยอัตโนมัติ

## โครงสร้างโปรเจกต์

```
service-app/
├── backend/   # REST API (Node.js + Express + TypeScript + Prisma + PostgreSQL)
└── mobile/    # แอปมือถือ (Expo SDK 54 / React Native + TypeScript)
```

## Backend

ใช้ PostgreSQL — แนะนำ [Supabase](https://supabase.com) (มี free tier)

```bash
cd backend
cp .env.example .env       # ใส่ค่า DATABASE_URL / DIRECT_URL จาก Supabase และตั้ง JWT_SECRET
npm install
npx prisma migrate dev     # สร้างตารางทั้งหมด
npx prisma db seed         # ใส่ข้อมูลตัวอย่าง
npm run dev                # รันที่ http://localhost:4000
```

ค่าใน `.env` หาได้จาก Supabase → ปุ่ม **Connect** → **ORM** → **Prisma**
(`DATABASE_URL` คือ pooled connection สำหรับใช้งานทั่วไป, `DIRECT_URL` ใช้ตอนรัน migration)

### นำเข้าอะไหล่จากไฟล์ Excel

```bash
cd backend

# 1) ตรวจสอบก่อน (ยังไม่บันทึกลงฐานข้อมูล)
npm run import:parts -- "C:\path\to\parts.xlsx"

# 2) ถ้าข้อมูลถูกต้องแล้ว บันทึกจริง
npm run import:parts -- "C:\path\to\parts.xlsx" --yes

# ใส่หลายไฟล์ในคำสั่งเดียวก็ได้ จะสรุปยอดรวมให้ตอนจบ
npm run import:parts -- "ไฟล์1.xlsx" "ไฟล์2.xlsx" "ไฟล์3.xlsx" --yes
```

ถ้าไฟล์ใดหาคอลัมน์ที่จำเป็นไม่เจอ จะข้ามเฉพาะไฟล์นั้นพร้อมแจ้งเตือน ไฟล์ที่เหลือยังนำเข้าตามปกติ

สคริปต์จะอ่านหัวตารางแถวแรกแล้วจับคู่คอลัมน์ให้อัตโนมัติ รองรับทั้งหัวตารางไทยและอังกฤษ
เช่น `รหัสสินค้า` `ชื่อรวม (ไทย)` `ยี่ห้อสินค้า` `Category` `รูปภาพประกอบ`
คอลัมน์ลำดับที่ (`ลำดับ`, `No.`) จะถูกข้ามโดยอัตโนมัติ

| ฟิลด์ | หัวตารางที่รองรับ (บางส่วน) | บังคับ |
|---|---|---|
| `partCode` | รหัสสินค้า, รหัสอะไหล่, Part Code, SKU | ✅ |
| `name` | ชื่อรวม, ชื่อสินค้า, ชื่ออะไหล่, Name | ✅ |
| `brand` | ยี่ห้อสินค้า, ยี่ห้อ, แบรนด์, Brand | |
| `category` | หมวดหมู่, ประเภท, Category | |
| `description` | รายละเอียด, หมายเหตุ, Description | |
| `imageUrl` | รูปภาพประกอบ, รูปภาพ, Image | |

**รูปภาพ** นำเข้าได้ 3 แบบ:
1. **รูปที่วางในเซลล์** (Excel: Insert → Picture → Place in Cell) — ดึงออกมาให้อัตโนมัติ ไม่ต้องทำอะไรเพิ่ม
2. **ลิงก์ URL** ในคอลัมน์รูปภาพ — เก็บลิงก์ไว้ตรงๆ
3. **โฟลเดอร์รูป** — ตั้งชื่อไฟล์ตามรหัสสินค้า (`SPOS0002.jpg`) แล้วเพิ่ม `--images ./photos`

การนำเข้าใช้รหัสสินค้าเป็นตัวเทียบ — รหัสที่มีอยู่แล้วจะถูก**อัปเดต** รหัสใหม่จะถูก**เพิ่ม**
และจะ**ไม่ลบ**ข้อมูลเดิมทิ้ง จึงรันซ้ำได้อย่างปลอดภัย

### นำเข้าผังวินิจฉัยจาก Excel

ผังแก้ปัญหาของผู้ผลิตมักวาดเป็น flowchart ใน Excel (กล่องคำถาม + ลูกศร + ป้ายใช่/ไม่)
สคริปต์จะอ่านผังนั้นแล้วประกอบกลับเป็นต้นไม้ตัดสินใจที่กดตอบทีละขั้นได้ในแอป

```bash
cd backend

# 1) ดูผังที่ประกอบได้ ก่อนบันทึกอะไร
npm run preview:flow -- "C:\path\DryerTroubleshoot.xlsx"

# ดูรายละเอียดเป็นต้นไม้ทีละหัวข้อ
npm run preview:flow -- "C:\path\DryerTroubleshoot.xlsx" --topic 2

# 2) บันทึกจริง
npm run import:flow -- "C:\path\DryerTroubleshoot.xlsx" --yes --machine "เครื่องอบผ้า"
```

**ข้อจำกัดสำคัญ:** Excel ไม่ได้เก็บว่าลูกศรเส้นไหนเชื่อมกล่องไหน (ไม่มี `stCxn`/`endCxn`)
สคริปต์จึงต้องประกอบผังกลับจาก**พิกัดของกล่องและลูกศร** ซึ่งได้ผลราว **77%** ของคำถาม
ส่วนที่เหลือจะถูกนำเข้าโดยเว้นเส้นทางไว้ว่าง แล้ว:

- แอปจะขึ้นป้าย "⚠ ยังไม่สมบูรณ์" ที่หัวข้อนั้น และบอกช่างตรงจุดที่ผังขาด — **ไม่เดาเส้นทางให้**
- แอดมินเข้าไปเติมได้ที่เมนู **ตรวจสอบผังวินิจฉัย** (เลือกกล่องปลายทางจากรายการ)

เนื่องจากเป็นงานไฟฟ้าแรงสูง ควรตรวจผังให้ครบก่อนให้ช่างใช้งานจริง

รูปแผนผังวงจรที่ฝังในไฟล์ Excel จะถูกนำเข้าอัตโนมัติ และแตะดูแบบขยาย/ซูมได้ในแอป

### Endpoints หลัก

**Auth**
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

**ผังวินิจฉัย (กดตอบทีละขั้น)**
- `GET /api/troubleshoot-flows?search=` — ค้นหาจากชื่ออาการ ชนิดเครื่อง หรือข้อความในขั้นตอน
- `GET /api/troubleshoot-flows/:id` — ผังเต็มพร้อมทุกกล่องและเส้นทาง
- `GET /api/troubleshoot-flows/:id/images/:imageId` — แผนผังวงจร (ไม่ต้องใช้ token)
- `PUT /api/troubleshoot-flows/:id/nodes/:key` (ADMIN) — เติม/แก้เส้นทางที่ขาด
- `PUT/DELETE /api/troubleshoot-flows/:id` (ADMIN)

**คู่มือแก้ปัญหาแบบข้อความ**
- `GET /api/guides?search=&category=` — ค้นหาจากชื่อหัวข้อ อาการ หรือหมวดหมู่
- `GET /api/guides/categories`, `GET /api/guides/:id`
- `POST/PUT/DELETE /api/guides` (ADMIN)

**อะไหล่**
- `GET /api/spare-parts?search=` — ค้นหาจากชื่อ รหัส ยี่ห้อ หรือหมวดหมู่
- `GET /api/spare-parts/:id`
- `GET /api/spare-parts/:id/image` — รูปภาพ (ไม่ต้องใช้ token เพื่อให้ `<Image>` โหลดได้ตรง)
- `POST/PUT/DELETE /api/spare-parts` (ADMIN)
- `POST /api/spare-parts/:id/image` (ADMIN) — อัปโหลดรูป (multipart, JPEG/PNG/WebP, สูงสุด 5MB)

**รถ**
- `GET/POST /api/vehicles`, `PUT/DELETE /api/vehicles/:id` (ADMIN)
- `POST /api/vehicle-logs/start`, `POST /api/vehicle-logs/:id/end`, `GET /api/vehicle-logs`, `GET /api/vehicle-logs/active`

**สาขา / รายงานตัว**
- `GET/POST /api/branches`, `PUT/DELETE /api/branches/:id` (ADMIN)
- `POST /api/branch-checkins`, `GET /api/branch-checkins` — คำนวณระยะห่างจากพิกัดสาขา (Haversine) และตั้งค่า `withinRadius`

**บันทึกการทำงาน**
- `GET/POST /api/work-logs`, `DELETE /api/work-logs/:id`

**ของใช้สิ้นเปลือง**
- `GET /api/consumables?search=`, `POST/PUT/DELETE /api/consumables` (ADMIN)
- `GET/POST /api/consumable-requests`, `GET /api/consumable-requests/:id`
- `DELETE /api/consumable-requests/:id` — ยกเลิกคำขอที่ยังรออนุมัติ
- `GET /api/consumable-requests/pending-count` (ADMIN)
- `POST /api/consumable-requests/:id/approve` (ADMIN) — ตัดสต็อกในทรานแซกชันเดียว
- `POST /api/consumable-requests/:id/reject` (ADMIN)

ทุก endpoint (ยกเว้น auth และรูปอะไหล่) ต้องแนบ header `Authorization: Bearer <token>`

## Mobile App

```bash
cd mobile
cp .env.example .env       # ตั้งค่า EXPO_PUBLIC_API_URL ให้ชี้ไปที่ backend
npm install
npx expo start             # สแกน QR ด้วยแอป Expo Go
```

**การตั้งค่า `EXPO_PUBLIC_API_URL`:**
- ถ้า deploy backend แล้ว ใช้ URL จริง เช่น `https://service-app-xxxx.onrender.com`
- ถ้ารัน backend ในเครื่อง ใช้ IP แบบ LAN เช่น `http://192.168.1.20:4000` (ไม่ใช่ `localhost`
  เพราะมือถือเป็นคนละเครื่อง) และมือถือต้องอยู่ Wi-Fi วงเดียวกัน

หลังแก้ `.env` ทุกครั้งต้องปิด Expo (Ctrl+C) แล้วรัน `npx expo start` ใหม่

### สิทธิ์การใช้งาน

| ฟีเจอร์ | พนักงาน | แอดมิน |
|---|---|---|
| ผังวินิจฉัย | กดตอบทีละขั้น + ดูผังวงจร | เติมเส้นทางที่ขาด, ลบผัง |
| คู่มือแก้ปัญหา | อ่าน + ค้นหา | เพิ่ม/แก้/ลบ |
| รายการอะไหล่ | ค้นหา + ดูรูป | เพิ่ม/แก้/ลบ + อัปโหลดรูป |
| รายงานตัว / บันทึกงาน / ใช้รถ | บันทึก + ดูของตัวเอง | ดูของทุกคน |
| เบิกของใช้สิ้นเปลือง | ขอเบิก + ดูสถานะ | อนุมัติ/ปฏิเสธ + จัดการสต็อก |

## การ Deploy

**Backend (Render free tier):**
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npx prisma migrate deploy && npm run start`
- Environment Variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (ใส่ค่าเปล่าๆ ไม่ต้องมีเครื่องหมาย `"`)
- ห้ามตั้ง `PORT` เอง — Render กำหนดให้อัตโนมัติ

Render free tier จะพักเซิร์ฟเวอร์เมื่อไม่มีคนใช้งาน ครั้งแรกที่เรียกอาจช้า 30-60 วินาที

**Mobile (ไฟล์ APK ติดตั้งบนมือถือ):**

ระหว่างพัฒนา แอปรันผ่าน `npx expo start` ซึ่งต้องเปิดคอมค้างไว้ตลอด
ถ้าต้องการให้ช่างใช้งานได้โดยไม่ต้องพึ่งคอม ให้ build เป็น APK:

```bash
cd mobile
# แก้ EXPO_PUBLIC_API_URL ใน eas.json ให้เป็น URL จริงของ Render ก่อน
npx eas build --platform android --profile preview
```

**สำคัญ:** ต้องแก้ `EXPO_PUBLIC_API_URL` ใน `eas.json` ก่อน build เพราะค่านี้ถูกฝังลงในแอปตอน build
ไฟล์ `.env` ในเครื่องไม่ถูกส่งขึ้น EAS (อยู่ใน .gitignore) แอปที่ได้จึงจะหา backend ไม่เจอถ้าไม่ตั้งค่าตรงนี้

เมื่อ build เสร็จ EAS จะให้ลิงก์ดาวน์โหลด APK ส่งให้ช่างติดตั้งได้เลย ไม่ต้องลง Expo Go

แก้โค้ดภายหลังแล้วส่งอัปเดตเข้าแอปที่ติดตั้งไว้แล้วได้โดยไม่ต้อง build ใหม่:

```bash
npx eas update --branch preview
```

## หมายเหตุด้านความปลอดภัย

- รหัสผ่านถูกเข้ารหัสด้วย bcrypt ก่อนบันทึกลงฐานข้อมูล
- Token เป็น JWT อายุ 30 วัน ต้องเปลี่ยน `JWT_SECRET` ก่อนใช้งานจริง
- รูปอะไหล่เก็บเป็น binary ในฐานข้อมูล และ endpoint รูปเปิดสาธารณะเพื่อให้แอปโหลดรูปได้ตรง
  หากรูปอะไหล่ถือเป็นข้อมูลลับ ควรเพิ่มการตรวจสอบ token ที่ endpoint นี้
