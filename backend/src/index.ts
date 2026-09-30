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
import { checkFileStore } from "./storage/fileStore";
import { prisma } from "./prisma";

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
 * แยกไว้ต่างหากเพราะเวลาตั้งค่าผิด อาการที่ผู้ใช้เห็นคือ "อัปรูปไม่ขึ้น"
 * เหมือนกันหมด แต่สาเหตุมีหลายแบบและแก้คนละทาง ตรงนี้บอกว่าพังขั้นไหน
 * แอดมินเท่านั้น เพราะคำตอบบอกชื่อถังและสถานะคีย์
 */
app.get("/health/storage", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await checkFileStore());
});

/**
 * ฐานข้อมูลอยู่ไกลแค่ไหน
 *
 * เวลาคนบอกว่า "กดบันทึกแล้วช้า" สาเหตุที่เป็นไปได้มีสามแบบและแก้คนละทางสุดขั้ว
 * — เซิร์ฟเวอร์เพิ่งตื่นจากหลับ (ช้าครั้งแรกครั้งเดียว) · ฐานข้อมูลอยู่คนละทวีป
 * กับเซิร์ฟเวอร์ (ช้าทุกครั้ง ทุกหน้า) · หรือโค้ดคุยกับฐานข้อมูลเยอะเกิน
 *
 * ตรงนี้แยกให้ออกด้วยตัวเลขเดียว: เวลาไปกลับฐานข้อมูลหนึ่งรอบ การบันทึก
 * ใบงานหนึ่งใบใช้ประมาณสิบกว่ารอบ คูณเอาได้เลยว่าควรใช้เวลาเท่าไร
 */
app.get("/health/db", requireAuth, requireAdmin, async (_req, res) => {
  /**
   * วัดรอบแรกแยกจากรอบที่เหลือ
   *
   * รอบแรกรวมเวลาเปิดการเชื่อมต่อกับจับมือ TLS ด้วย ซึ่งเกิดครั้งเดียว
   * ส่วนรอบหลัง ๆ คือเวลาเดินทางไปกลับล้วน ๆ ถ้ารอบแรกช้ามากแต่รอบหลังเร็ว
   * แปลว่าปัญหาคือการเปิดการเชื่อมต่อ ไม่ใช่ระยะทาง — คนละวิธีแก้กัน
   */
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    const started = process.hrtime.bigint();
    await prisma.$queryRaw`SELECT 1`;
    samples.push(Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10);
  }
  const first = samples[0];
  const rest = samples.slice(1).sort((a, b) => a - b);
  const median = rest[Math.floor(rest.length / 2)];

  /**
   * บอกว่าฐานข้อมูลตั้งอยู่ที่ไหน โดยไม่เปิดเผยรหัสผ่าน
   *
   * ชื่อโฮสต์ของ Supabase มี region อยู่ในตัวอยู่แล้ว เช่น
   * aws-0-ap-southeast-1.pooler.supabase.com — เอามาเทียบกับ region
   * ของเซิร์ฟเวอร์ได้เลยว่าอยู่ที่เดียวกันหรือเปล่า ไม่ต้องเดา
   */
  let database: { host: string; region: string | null; port: string; mode: string } | null = null;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    const region = url.hostname.match(/aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com/)?.[1] ?? null;
    database = {
      host: url.hostname,
      region,
      port: url.port || "5432",
      // 6543 คือ pooler แบบ transaction ซึ่งเป็นตัวที่ Prisma ควรใช้ตอนใช้งานปกติ
      mode: url.port === "6543" ? "pooled (transaction)" : "direct/session",
    };
  } catch {
    database = null;
  }

  // region ของเซิร์ฟเวอร์เอง — Render ใส่ค่านี้ให้ ส่วนโฮสต์อื่นอาจไม่มี
  const serverRegion = process.env.RENDER_REGION ?? process.env.FLY_REGION ?? null;

  const verdict =
    median < 30
      ? "ปกติ — ฐานข้อมูลอยู่ใกล้เซิร์ฟเวอร์"
      : median < 80
        ? "พอใช้ได้ แต่เริ่มรู้สึก"
        : median < 350
          ? "ช้า — ฐานข้อมูลอยู่คนละ region กับเซิร์ฟเวอร์ ย้ายให้อยู่ที่เดียวกันจะเร็วขึ้นหลายเท่า"
          : // ไกลสุดในโลกยังไม่ถึง 350 ms เกินกว่านี้แปลว่ามีอย่างอื่นซ้อนอยู่
            "ช้าเกินกว่าระยะทางจะอธิบายได้ — ไกลสุดในโลกยังไม่ถึง 350 ms " +
            "ให้ดู connectionMs กับ mode ประกอบ อาจเป็นเครื่องฐานข้อมูลเล็กเกินไป " +
            "หรือต่อผ่านช่องทางที่ไม่ใช่ pooler";

  res.json({
    roundTripMs: median,
    // รอบแรกรวมเวลาเปิดการเชื่อมต่อ ถ้าต่างจากรอบหลังมาก ปัญหาอยู่ที่การเชื่อมต่อ
    firstCallMs: first,
    samples,
    // ประมาณจากจำนวนคำสั่งที่การเปิดใบงานหนึ่งใบใช้จริง
    estimatedSaveMs: Math.round(median * 13),
    database,
    serverRegion,
    verdict,
  });
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
