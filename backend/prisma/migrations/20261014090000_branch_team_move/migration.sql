-- CreateTable
CREATE TABLE "BranchTeamMove" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fromTeam" TEXT,
    "toTeam" TEXT NOT NULL,
    "movedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchTeamMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchTeamMove_branchId_field_key" ON "BranchTeamMove"("branchId", "field");

-- AddForeignKey
ALTER TABLE "BranchTeamMove" ADD CONSTRAINT "BranchTeamMove_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

