-- CreateTable
CREATE TABLE "TeamGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "covers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allTeams" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamGroup_name_key" ON "TeamGroup"("name");


-- พื้นที่รับผิดชอบตามบันทึกแบ่งทีม 4 ต.ค. 69 ที่ไม่ใช่ทีมของสาขา — ชื่อตรงตามบันทึกทุกตัวอักษร
-- ตัวนำเข้ารายชื่อจะจับคู่ชื่อพื้นที่ในไฟล์กับทีมรวมได้เอง · ทีมใน covers ตามชื่อในทะเบียนสาขาของระบบจริง
INSERT INTO "TeamGroup" ("name", "covers", "allTeams") VALUES
  ('Senior บางน้ำจืด หลักสี่ ลาดพร้าว', ARRAY['บางน้ำจืด','กทมหลักสี่','กทมลาดพร้าว'], false),
  ('Senior มีนบุรี ปทุมธานี ประเวศ', ARRAY['กทมมีนบุรี','ปทุมธานี','กทมประเวศ'], false),
  ('ทีมเสริม กทม. + IT กทม.', ARRAY['กทมโซนใน','กทมประเวศ','กทมมีนบุรี','กทมลาดกระบัง','กทมลาดพร้าว','กทมหลักสี่','บางน้ำจืด'], false),
  ('ทีมเสริมปริมณฑล + IT พื้นที่ซัพ', ARRAY['นนทบุรี','ปทุมธานี'], false),
  ('QC QA (ลาดหลุมแก้ว)', ARRAY[]::text[], true),
  ('PM Quality control', ARRAY[]::text[], true)
ON CONFLICT ("name") DO NOTHING;
