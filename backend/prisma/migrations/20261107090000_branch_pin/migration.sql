-- ภาค/ประเภทสาขาที่แก้ในหน้าจัดการสาขา — ตัวนำเข้าไฟล์ไม่เขียนทับ (ต.ค. 69)
CREATE TABLE "BranchPin" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "value" TEXT NOT NULL,
    "pinnedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchPin_branchId_field_key" ON "BranchPin"("branchId", "field");

ALTER TABLE "BranchPin" ADD CONSTRAINT "BranchPin_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
