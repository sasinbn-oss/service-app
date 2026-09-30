# ย้าย Render กับ Supabase ไปสิงคโปร์

## ทำไมต้องย้าย

วัดจากของจริงแล้ว เซิร์ฟเวอร์คุยกับฐานข้อมูลหนึ่งรอบใช้เวลา **234 ms** เพราะอยู่คนละทวีป
(เซิร์ฟเวอร์อยู่อเมริกา/ยุโรป ฐานข้อมูลอยู่มุมไบ) การบันทึกใบงานหนึ่งใบใช้ประมาณ 13 รอบ
จึงกลายเป็น **~3 วินาที** ต่อการกดบันทึกหนึ่งครั้ง

ย้ายให้ทั้งคู่อยู่สิงคโปร์แล้วเหลือ **~5 ms ต่อรอบ** หรือ **ไม่ถึง 0.1 วินาทีต่อการบันทึก**
และสิงคโปร์ยังใกล้ผู้ใช้ที่ไทยที่สุดด้วย

## ทำตอนนี้ดีที่สุด

**ยังไม่ได้ตั้ง Supabase Storage** แปลว่ายังไม่มีไฟล์รูปในระบบ ถ้าตั้งไปแล้วและช่าง
เริ่มอัปรูป การย้ายจะต้องขนไฟล์ตามไปอีกชุด ซึ่งยุ่งกว่ามาก

**ตั้ง Storage หลังย้ายเสร็จ** บนโปรเจกต์ใหม่

---

## ช่วงที่ 1 — ย้าย Render ไปสิงคโปร์

ช่วงนี้**ไม่แตะข้อมูลเลย** ย้อนกลับได้ตลอด ทำก่อนได้เลยไม่ต้องรอใคร

Render เปลี่ยน region ของ service เดิมไม่ได้ ต้องสร้างใหม่

### 1.1 สร้าง Web Service ใหม่

**New → Web Service** → เลือก repo `sasinbn-oss/service-app`

| ช่อง | ค่า |
|---|---|
| Branch | `claude/service-app-registration-dvbv18` |
| **Region** | **Singapore** ← จุดสำคัญของทั้งช่วงนี้ |
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `node_modules/.bin/prisma migrate deploy && npm run start` |
| Instance Type | $7 (0.5 CPU / 512 MB) — เท่าเดิม |

> Start command ใช้ `node_modules/.bin/prisma` ไม่ใช่ `npx prisma` เพราะ `npx` จะไป
> ดึง prisma รุ่นใหม่จากอินเทอร์เน็ตมาแทนตัวที่ติดตั้งไว้ ซึ่งเคยทำให้คำสั่งเปลี่ยน
> ความหมายมาแล้วในโปรเจกต์นี้

### 1.2 คัดลอก environment variables

เปิด service เดิม → Environment → คัดลอก**ทุกตัว**มาใส่ service ใหม่

ตอนนี้ยังชี้ไปที่ฐานข้อมูลมุมไบเหมือนเดิม (ยังไม่ต้องแก้)

- `DATABASE_URL` — **พอร์ต 5432 ไม่มี `?pgbouncer=true`** (ดูเหตุผลใน README หัวข้อ
  "เวลากดบันทึกแล้วช้า")
- `DIRECT_URL`
- `JWT_SECRET` — **ต้องเป็นค่าเดิมเป๊ะ** ไม่งั้นทุกคนถูกเตะออกจากระบบ
- **ห้ามตั้ง `PORT`** — Render กำหนดให้เอง

### 1.3 ตรวจว่าใช้ได้

```
https://<ชื่อใหม่>.onrender.com/health      →  {"status":"ok"}
```

แล้วล็อกอินในแอป (ยังชี้ตัวเก่าอยู่) เปิด Console แล้วยิงไปที่**ตัวใหม่**:

```js
fetch("https://<ชื่อใหม่>.onrender.com/health/db", {
  headers: { Authorization: "Bearer " + localStorage.getItem("service-app/token") }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
```

`roundTripMs` ควรลดจาก 234 เหลือ **~60 ms** (สิงคโปร์ ↔ มุมไบ)
ถ้ายังเป็น 234 แปลว่า region ตั้งไม่ติด ให้เช็กก่อนไปต่อ

### 1.4 สลับเว็บมาที่ backend ตัวใหม่

Static site `service-app-1` → Settings → Environment →
แก้ `EXPO_PUBLIC_API_URL` เป็น URL ของ backend ตัวใหม่

จากนั้น **Manual Deploy → Clear build cache & deploy** — ค่านี้ถูกฝังลงไฟล์ตอน build
ถ้า deploy ธรรมดาโดยไม่ล้าง cache ค่าเก่าจะยังติดอยู่

เช็กท้ายหน้าแรกของแอปว่ารหัสคอมมิตเปลี่ยนแล้ว แล้วลองล็อกอิน เปิดกระดาน เปิดใบงาน

### 1.5 ปิดตัวเก่า

ใช้ตัวใหม่ได้สัก 1-2 วันแล้วค่อย **Suspend** service เดิม (อย่าเพิ่งลบ) เผื่อต้องย้อนกลับ

**ถึงตรงนี้: บันทึกหนึ่งครั้งเหลือ ~0.8 วินาที จาก 3 วินาที โดยไม่แตะข้อมูลเลย**

---

## ช่วงที่ 2 — ย้าย Supabase ไปสิงคโปร์

ช่วงนี้**ขนข้อมูลจริง** ต้องมีช่วงที่ไม่มีใครใช้งาน แนะนำให้ทำนอกเวลาทำการ

Supabase เปลี่ยน region ของโปรเจกต์เดิมไม่ได้ ต้องสร้างใหม่แล้วย้ายข้อมูลไป

### 2.1 เตรียมเครื่องที่จะใช้ย้าย

ต้องมี `pg_dump` กับ `psql` รุ่นเท่ากับหรือใหม่กว่าฐานข้อมูล

```bash
pg_dump --version
```

ถ้าได้ต่ำกว่า 15 ให้ติดตั้ง PostgreSQL client ใหม่ก่อน ไม่งั้น dump จะล้มกลางคัน

### 2.2 สร้างโปรเจกต์ใหม่

Supabase → New project

- **Region: Southeast Asia (Singapore) `ap-southeast-1`**
- แผน **Pro**
- **จดรหัสผ่านฐานข้อมูลไว้ให้ดี** หน้านี้แสดงครั้งเดียว

### 2.3 ประกาศปิดระบบชั่วคราว

บอกทีมว่าห้ามใช้แอปช่วงนี้ — ข้อมูลที่บันทึกหลังจากขั้นตอน dump จะไม่ถูกขนไปด้วย

### 2.4 Dump ข้อมูลจากมุมไบ

ใช้สตริงของโปรเจกต์**เก่า** (Connect → Direct หรือ Session pooler)

```bash
pg_dump \
  --no-owner --no-privileges \
  --schema=public \
  --clean --if-exists \
  --quote-all-identifiers \
  "postgresql://postgres.เก่า:รหัส@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
  > service-app-backup.sql
```

`--schema=public` สำคัญมาก — เอาเฉพาะตารางของแอป ไม่ไปยุ่งกับ schema ภายในของ
Supabase เอง (`auth`, `storage`, `extensions`) ซึ่งโปรเจกต์ใหม่มีของตัวเองอยู่แล้ว

เช็กว่าไฟล์ไม่ว่าง:

```bash
ls -lh service-app-backup.sql
grep -c "CREATE TABLE" service-app-backup.sql   # ควรได้ 25
```

### 2.5 Restore เข้าสิงคโปร์

```bash
psql \
  -v ON_ERROR_STOP=1 \
  "postgresql://postgres.ใหม่:รหัส@aws-x-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  -f service-app-backup.sql
```

`ON_ERROR_STOP=1` ทำให้หยุดทันทีที่เจอ error แทนที่จะ restore ไปได้ครึ่งเดียวแบบเงียบ ๆ
แล้วเราไปรู้ทีหลังว่าข้อมูลขาด

### 2.6 ตรวจว่าข้อมูลครบ

รันคำสั่งนี้กับ**ทั้งสองฐานข้อมูล** แล้วเทียบตัวเลขให้ตรงกันทุกตาราง

```sql
select table_name,
       (xpath('/row/cnt/text()',
              query_to_xml(format('select count(*) as cnt from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text::int as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

ดูให้แน่ว่า `_prisma_migrations` ติดมาด้วย (ควรมี 22 แถว) — ถ้ามี แปลว่า
`prisma migrate deploy` ตอนเครื่องเริ่มจะไม่ทำอะไร ซึ่งถูกต้องแล้ว

### 2.7 สลับ backend มาที่ฐานข้อมูลใหม่

Render (service สิงคโปร์) → Environment → แก้สองตัว:

- `DATABASE_URL` → **session pooler พอร์ต 5432** ของโปรเจกต์ใหม่ **ไม่ใส่ `?pgbouncer=true`**
- `DIRECT_URL` → ของโปรเจกต์ใหม่

Render restart ให้เอง

### 2.8 ตรวจผล

```js
fetch("https://<ชื่อใหม่>.onrender.com/health/db", {
  headers: { Authorization: "Bearer " + localStorage.getItem("service-app/token") }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
```

ควรได้:

| ช่อง | ค่าที่คาดหวัง |
|---|---|
| `roundTripMs` | **ต่ำกว่า 10** |
| `estimatedSaveMs` | **ต่ำกว่า 150** |
| `database.region` | `ap-southeast-1` |
| `database.mode` | `direct/session` |
| `verdict` | ปกติ — ฐานข้อมูลอยู่ใกล้เซิร์ฟเวอร์ |

แล้วลองใช้งานจริง: ล็อกอิน · เปิดกระดานติดตามเครื่องเสีย · เปิดใบงาน · กดบันทึกสักใบ

### 2.9 เก็บกวาด

- **เก็บโปรเจกต์มุมไบไว้อย่างน้อย 1 สัปดาห์** ก่อนลบ
- ลบไฟล์ `service-app-backup.sql` ออกจากเครื่อง — ในนั้นมีข้อมูลทั้งบริษัท
- ค่อยไปตั้ง Storage บนโปรเจกต์ใหม่ (ดู README หัวข้อ "ตั้งค่า")

---

## ถ้าอะไรพัง ย้อนกลับยังไง

ทุกขั้นย้อนได้ เพราะของเดิมยังอยู่ครบ

| พังตอน | ย้อนยังไง |
|---|---|
| ช่วงที่ 1 | แก้ `EXPO_PUBLIC_API_URL` ของ static site กลับเป็น backend ตัวเก่า แล้ว Clear cache & deploy |
| ช่วงที่ 2 | แก้ `DATABASE_URL` / `DIRECT_URL` กลับเป็นของมุมไบ Render restart เอง |

สิ่งเดียวที่ย้อนไม่ได้คือ**ข้อมูลที่ถูกบันทึกลงฐานข้อมูลใหม่หลังสลับแล้ว** จึงต้องตรวจ
ข้อ 2.6 ให้ผ่านก่อนเปิดให้คนใช้งาน
