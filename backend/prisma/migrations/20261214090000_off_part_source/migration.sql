-- อะไหล่นอกสโตร์: จัดหาได้ไหม · หาได้จากที่ไหน / ทำไมหาไม่ได้ (เจ้าของงานขอ 4 พ.ย. 69) — ความหมายของแต่ละช่องดู schema.prisma
-- เพิ่มคอลัมน์อย่างเดียว ไม่เติมค่าให้แถวเดิม: ใบเก่าขึ้น "ยังไม่ระบุ" ไม่บังคับย้อนหลัง (เจ้าของงานเลือก) ใส่ตอนแก้รายการครั้งหน้า
-- ไม่มี INSERT/UPDATE จึงไม่ต้องอยู่ใน SEEDED_BY_MIGRATION / REPLAY_IF_DUMP_PREDATES ของ scripts/restore-backup.js —
-- ไฟล์สำรองที่ทำก่อน migration นี้กู้กลับมาเป็น NULL = "ยังไม่ระบุ" ซึ่งตรงกับความจริงของใบพวกนั้น
ALTER TABLE "WorkOrderPart"
  ADD COLUMN "offFound" BOOLEAN,
  ADD COLUMN "offKind" TEXT,
  ADD COLUMN "offDetail" TEXT,
  ADD COLUMN "offAnswerAt" TIMESTAMP(3),
  ADD COLUMN "offAnswerById" INTEGER;

-- คนตอบถูกลบบัญชี (ปกติลบแบบ deletedAt ไม่ลบแถว) คำตอบยังอยู่ แค่ไม่รู้ว่าใคร — แบบเดียวกับ outNoteById
ALTER TABLE "WorkOrderPart"
  ADD CONSTRAINT "WorkOrderPart_offAnswerById_fkey" FOREIGN KEY ("offAnswerById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
