#!/bin/sh
# เริ่ม backend ของระบบทดสอบในเครื่อง — สร้างตาราง → ใส่ข้อมูลครั้งแรก → เปิดเซิร์ฟเวอร์
set -e
cd /app/backend

# กันชี้ผิดที่: ระบบทดสอบต้องใช้ฐานข้อมูลใน docker (โฮสต์ชื่อ db) เท่านั้น
# migrate/restore ด้านล่างแก้ข้อมูลทั้งฐาน — ถ้าวันหนึ่งมีคนเปลี่ยน DATABASE_URL ไปที่ Supabase จะหยุดตรงนี้
case "$DATABASE_URL" in
  *@db:5432/*) ;;
  *) echo "⛔ DATABASE_URL ไม่ได้ชี้ไปที่ฐานข้อมูลของระบบทดสอบ (db:5432) — หยุด"; exit 1 ;;
esac

echo "รอฐานข้อมูล..."
for i in $(seq 1 60); do
  node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`select 1\`.then(()=>process.exit(0),()=>process.exit(1))" && break
  sleep 2
done

node_modules/.bin/prisma migrate deploy

USERS=$(node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().user.count().then(n=>{console.log(n);process.exit(0)})")
if [ "$USERS" = "0" ]; then
  BACKUP=$(ls -t /backup/*.json.gz 2>/dev/null | head -1 || true)
  if [ -n "$BACKUP" ]; then
    # คัดลอกจากระบบจริง: ไฟล์สำรองจากหน้า "สำรองข้อมูล" (Super Admin) — ใช้รหัสผ่านเดิมของแต่ละคน
    echo "ครั้งแรก: กู้ข้อมูลจากไฟล์สำรอง $BACKUP"
    node scripts/restore-backup.js "$BACKUP" --yes
  else
    echo "ครั้งแรก: ใส่ข้อมูลตัวอย่าง"
    npx --no-install ts-node prisma/seed.ts
    npx --no-install ts-node scripts/seed-test-fixtures.ts
    node /local-test/seed-extra.js
  fi
fi

exec node dist/index.js
