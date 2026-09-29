import "dotenv/config";
import express from "express";
import compression from "compression";
import cors from "cors";
import authRoutes from "./routes/auth";
import vehicleRoutes from "./routes/vehicles";
import vehicleLogRoutes from "./routes/vehicleLogs";
import branchRoutes from "./routes/branches";
import branchCheckInRoutes from "./routes/branchCheckIns";
import workLogRoutes from "./routes/workLogs";
import guideRoutes from "./routes/guides";
import troubleshootFlowRoutes from "./routes/troubleshootFlows";
import sparePartRoutes from "./routes/spareParts";
import consumableRoutes from "./routes/consumables";
import consumableRequestRoutes from "./routes/consumableRequests";
import documentRoutes from "./routes/documents";
import machineRoutes from "./routes/machines";
import workOrderRoutes from "./routes/workOrders";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { checkR2 } from "./storage/r2";

const app = express();

/**
 * บีบอัดคำตอบก่อนส่งออก
 *
 * คำตอบของระบบนี้เป็น JSON ภาษาไทยที่มีคำซ้ำกันทั้งก้อน (ชื่อสาขา ชื่อภาค
 * ป้ายสถานะ ชื่อช่อง) ซึ่งเป็นรูปแบบที่ gzip ย่อได้เยอะมาก — กระดานติดตาม
 * เครื่องเสียลดจากหลักร้อย KB เหลือหลักสิบ
 *
 * Render ไม่ได้บีบอัดให้เอง ถ้าไม่ใส่ตรงนี้ก็ส่งดิบทั้งก้อนจริง ๆ
 * คนที่จ่ายส่วนต่างคือช่างที่เปิดจากหน้างานด้วย 4G ไม่ใช่เซิร์ฟเวอร์
 */
app.use(compression());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

/**
 * เช็คว่าที่เก็บไฟล์แนบต่อได้จริงไหม
 *
 * แยกไว้ต่างหากเพราะเวลาตั้งค่า R2 ผิด อาการที่ผู้ใช้เห็นคือ "อัปรูปไม่ขึ้น"
 * เหมือนกันหมด แต่สาเหตุมีสี่แบบและแก้คนละทาง ตรงนี้บอกว่าพังขั้นไหน
 * แอดมินเท่านั้น เพราะคำตอบบอกชื่อถังและสถานะคีย์
 */
app.get("/health/storage", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await checkR2());
});

app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/vehicle-logs", vehicleLogRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/branch-checkins", branchCheckInRoutes);
app.use("/api/work-logs", workLogRoutes);
app.use("/api/guides", guideRoutes);
app.use("/api/troubleshoot-flows", troubleshootFlowRoutes);
app.use("/api/spare-parts", sparePartRoutes);
app.use("/api/consumables", consumableRoutes);
app.use("/api/consumable-requests", consumableRequestRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/work-orders", workOrderRoutes);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Service-app backend listening on port ${PORT}`);
});
