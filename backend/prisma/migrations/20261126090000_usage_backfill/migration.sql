-- การใช้งานย้อนหลังตั้งแต่เปิดบัญชี (เจ้าของงานขอ ต.ค. 69) — สร้างจากร่องรอยการทำงานที่มีเวลาอยู่แล้ว
-- ก่อนวันที่เริ่มจดการใช้งานจริงไม่มีบันทึกว่าใครเปิดแอปเมื่อไร จึงประมาณจาก "ตอนที่ทำอะไรในระบบ":
-- กดขั้นใบงาน · แนบรูป · รายงานตัว · บันทึกงาน · ใช้/คืนรถ · ขอ/อนุมัติเบิก · กรอกเคสเครื่องเสีย · เช็คอะไหล่ · จัดแผน · เปลี่ยนรหัส
-- device = 'ACTION' แยกจากช่วงที่จดจริง (WEB/MOBILE) — หน้าจอแสดงเป็นสีเทา "จากการทำงานในระบบ"
-- ปัดลงเป็นช่วง 5 นาทีแบบเดียวกับที่จดจริง · ช่วงที่จดจริงอยู่แล้วไม่ทับ (ON CONFLICT)
-- ไม่นับประวัติที่แอดมินกรอกย้อนหลัง (backfilledAt) — เวลานั้นไม่ใช่เวลาที่คนนั้นใช้แอป
INSERT INTO "UsageSlot" ("userId", "slot", "device")
SELECT DISTINCT a.uid,
       date_trunc('hour', a.t) + floor(extract(minute FROM a.t) / 5) * interval '5 minutes',
       'ACTION'
FROM (
  SELECT "userId" AS uid, "createdAt" AS t FROM "WorkOrderLog" WHERE "backfilledAt" IS NULL
  UNION ALL SELECT "createdById", "createdAt" FROM "WorkOrderAttachment"
  UNION ALL SELECT "userId", "checkedInAt" FROM "BranchCheckIn"
  UNION ALL SELECT "userId", "createdAt" FROM "WorkLog"
  UNION ALL SELECT "userId", "startedAt" FROM "VehicleLog"
  UNION ALL SELECT "returnedById", "endedAt" FROM "VehicleLog"
  UNION ALL SELECT "userId", "endedAt" FROM "VehicleLog" WHERE "returnedById" IS NULL
  UNION ALL SELECT "uploadedById", "createdAt" FROM "VehicleLogPhoto"
  UNION ALL SELECT "uploadedById", "createdAt" FROM "VehicleDoc"
  UNION ALL SELECT "createdById", "createdAt" FROM "VehicleMaintenance"
  UNION ALL SELECT "userId", "createdAt" FROM "OutageNoteLog"
  UNION ALL SELECT "userId", "createdAt" FROM "ConsumableRequest"
  UNION ALL SELECT "reviewedById", "reviewedAt" FROM "ConsumableRequest"
  UNION ALL SELECT "checkedById", "checkedAt" FROM "WorkOrderPart"
  UNION ALL SELECT "outNoteById", "outNoteAt" FROM "WorkOrderPart"
  UNION ALL SELECT "plannedById", "updatedAt" FROM "TeamDayPlan"
  UNION ALL SELECT "id", "passwordChangedAt" FROM "User"
  UNION ALL SELECT "byUserId", "startedAt" FROM "ViewAsLog"
) a
JOIN "User" u ON u."id" = a.uid
WHERE a.uid IS NOT NULL AND a.t IS NOT NULL AND a.t <= now()
ON CONFLICT DO NOTHING;
