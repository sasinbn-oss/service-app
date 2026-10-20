-- ทีม outsource — รับงานเป็นครั้ง ๆ ไม่มีสาขาประจำ หัวหน้าภาคปิดงานแทน (ต.ค. 69)
CREATE TABLE "OutsourceTeam" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsourceTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutsourceTeam_name_key" ON "OutsourceTeam"("name");

-- ห้าทีมที่เจ้าของงานแจ้งมา — เพิ่ม/ลบได้ที่หน้าทีมช่าง
INSERT INTO "OutsourceTeam" ("name") VALUES ('PWS'), ('SPK'), ('TBL'), ('COB'), ('STM') ON CONFLICT ("name") DO NOTHING;
