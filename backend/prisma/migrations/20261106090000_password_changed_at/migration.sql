-- เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว การล็อกอินที่ออกก่อนเวลานี้ใช้ไม่ได้ (ตรวจระบบ ต.ค. 69)
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
