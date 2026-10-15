-- ใบที่ส่งตรวจหน้างานก่อนมีขั้น "รอแอดมินนัดลูกค้า (ตรวจหน้างาน)" ข้ามการนัดไปถึงช่างเลย
-- เจ้าของงานให้ส่งกลับมาให้แอดมินนัดทั้งหมด (ต.ค. 69) — นับเฉพาะใบที่ยังรอตรวจอยู่และไม่เคยมีการนัด
-- (นัดแล้ว = มีประวัติคอนเฟิร์ม/เลื่อนที่ส่งต่อไปขั้นตรวจ) วันที่หัวหน้าภาคใส่ไว้กลายเป็นวันที่เสนอ
-- ไฟล์ตรวจที่ช่างแนบไว้แล้วยังนับ เพราะรอบตรวจนับจากตอนส่งตรวจ ไม่ใช่ตอนนัด
WITH moved AS (
  UPDATE "WorkOrder" w
  SET status = 'INSPECT_CONFIRM', "appointmentStatus" = 'PENDING'
  WHERE w.status = 'INSPECTING'
    AND NOT EXISTS (
      SELECT 1 FROM "WorkOrderLog" l
      WHERE l."workOrderId" = w.id AND l.action IN ('CONFIRMED', 'RESCHEDULED') AND l.status = 'INSPECTING'
    )
  RETURNING w.id
)
INSERT INTO "WorkOrderLog" ("workOrderId", "userId", action, status, note)
SELECT id, NULL, 'ROLLED_BACK', 'INSPECT_CONFIRM',
       'ระบบส่งกลับให้แอดมินนัดลูกค้าก่อน — ใบนี้ส่งตรวจหน้างานก่อนมีขั้นนัดตรวจ'
FROM moved;
