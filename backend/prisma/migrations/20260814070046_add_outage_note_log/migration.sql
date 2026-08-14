-- CreateTable
CREATE TABLE "OutageNoteLog" (
    "id" SERIAL NOT NULL,
    "outageId" INTEGER NOT NULL,
    "userId" INTEGER,
    "symptom" TEXT,
    "workStatus" TEXT,
    "scheduledVisitAt" TIMESTAMP(3),
    "partsSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutageNoteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutageNoteLog_outageId_createdAt_idx" ON "OutageNoteLog"("outageId", "createdAt");

-- CreateIndex
CREATE INDEX "OutageNoteLog_createdAt_idx" ON "OutageNoteLog"("createdAt");

-- AddForeignKey
ALTER TABLE "OutageNoteLog" ADD CONSTRAINT "OutageNoteLog_outageId_fkey" FOREIGN KEY ("outageId") REFERENCES "Outage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutageNoteLog" ADD CONSTRAINT "OutageNoteLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

