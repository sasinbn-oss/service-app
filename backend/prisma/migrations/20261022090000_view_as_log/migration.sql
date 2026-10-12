-- บันทึกว่า Super Admin "ดูในฐานะ" ใคร เมื่อไร (ดู routes/auth.ts /view-as)
-- CreateTable
CREATE TABLE "ViewAsLog" (
    "id" SERIAL NOT NULL,
    "byUserId" INTEGER NOT NULL,
    "targetUserId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ViewAsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViewAsLog_byUserId_startedAt_idx" ON "ViewAsLog"("byUserId", "startedAt");

