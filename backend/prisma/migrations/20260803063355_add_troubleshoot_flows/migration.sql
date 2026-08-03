-- CreateTable
CREATE TABLE "TroubleshootFlow" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "machineType" TEXT,
    "notes" TEXT,
    "rootKey" TEXT,
    "sourceFile" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TroubleshootFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroubleshootNode" (
    "id" SERIAL NOT NULL,
    "flowId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "stepNumber" TEXT,
    "yesKey" TEXT,
    "noKey" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TroubleshootNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroubleshootImage" (
    "id" SERIAL NOT NULL,
    "flowId" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TroubleshootImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TroubleshootNode_flowId_key_key" ON "TroubleshootNode"("flowId", "key");

-- AddForeignKey
ALTER TABLE "TroubleshootNode" ADD CONSTRAINT "TroubleshootNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "TroubleshootFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootImage" ADD CONSTRAINT "TroubleshootImage_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "TroubleshootFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
