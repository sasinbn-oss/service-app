-- ตำแหน่ง Area Team (Area · Supervisor (COCO)) — role เป็นข้อความอยู่แล้ว ไม่ต้องแก้ enum
ALTER TABLE "User" ADD COLUMN "areaId" INTEGER;
ALTER TABLE "Branch" ADD COLUMN "cocoSupervisorId" INTEGER;

ALTER TABLE "User" ADD CONSTRAINT "User_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_cocoSupervisorId_fkey" FOREIGN KEY ("cocoSupervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Branch_cocoSupervisorId_idx" ON "Branch"("cocoSupervisorId");
