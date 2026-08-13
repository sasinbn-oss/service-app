-- CreateTable
CREATE TABLE "OutagePart" (
    "id" SERIAL NOT NULL,
    "outageId" INTEGER NOT NULL,
    "sparePartId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OutagePart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutagePart_sparePartId_idx" ON "OutagePart"("sparePartId");

-- CreateIndex
CREATE UNIQUE INDEX "OutagePart_outageId_sparePartId_key" ON "OutagePart"("outageId", "sparePartId");

-- AddForeignKey
ALTER TABLE "OutagePart" ADD CONSTRAINT "OutagePart_outageId_fkey" FOREIGN KEY ("outageId") REFERENCES "Outage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutagePart" ADD CONSTRAINT "OutagePart_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "SparePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

