/**
 * ออกเอกสารเป็นไฟล์ Word และให้ดาวน์โหลด
 *
 * เส้นทางนี้ไม่พึ่ง AI เลย หน้าฟอร์มในแอปกรอกอะไรมาก็ประกอบตามนั้นตรง ๆ
 * ผู้ช่วย AI ใช้ตัวประกอบเอกสารชุดเดียวกัน ต่างกันแค่ว่าใครเป็นคนกรอกข้อมูล
 * เอกสารที่ออกมาจึงหน้าตาเหมือนกันไม่ว่ามาจากทางไหน
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  buildTransferRequestDocx,
  transferRequestAsciiFilename,
  transferRequestFilename,
} from "../documents/transferRequest";
import { documentPath, getDocument, saveDocument } from "../documents/store";
import { WAREHOUSES } from "../documents/warehouses";
import { prisma } from "../prisma";

const router = Router();

/**
 * รายชื่อคลังสำหรับ dropdown ในแอป
 *
 * ให้แอปดึงตอนเปิดหน้าแทนที่จะฝังรายชื่อไว้ในตัวแอป เพิ่มคลังใหม่จึงแก้ที่
 * backend ไฟล์เดียวแล้ว deploy ไม่ต้อง build แอปใหม่และรอให้ทุกคนอัปเดต
 */
router.get("/warehouses", requireAuth, (_req, res) => {
  res.json({ warehouses: WAREHOUSES });
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const transferSchema = z.object({
  fromWarehouse: z.string().trim().min(1, "กรุณาระบุคลังต้นทาง"),
  toWarehouse: z.string().trim().min(1, "กรุณาระบุคลังปลายทาง"),
  documentNo: z.string().trim().optional(),
  documentDate: z.string().trim().optional(),
  note: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        code: z.string().trim(),
        name: z.string().trim().min(1, "กรุณาระบุชื่อรายการ"),
        quantity: z.number().positive("จำนวนต้องมากกว่า 0"),
        unit: z.string().trim().optional(),
        note: z.string().trim().optional(),
      })
    )
    .min(1, "ต้องมีรายการอย่างน้อย 1 รายการ"),
});

router.post("/transfer-request", requireAuth, async (req: AuthRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? "ข้อมูลไม่ถูกต้อง" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { name: true },
  });
  if (!user) return res.status(401).json({ error: "ไม่พบผู้ใช้" });

  // ชื่อทางการจากฐานข้อมูลมีน้ำหนักกว่าชื่อที่พิมพ์มา เพราะเป็นชื่อที่ฝ่ายคลังใช้
  // ส่วนรหัสที่ยังไม่มีในระบบก็ยังออกเอกสารให้ แต่ส่งกลับไปเตือนที่หน้าจอ
  const codes = parsed.data.items.map((i) => i.code).filter(Boolean);
  const known = codes.length
    ? await prisma.sparePart.findMany({
        where: { partCode: { in: codes } },
        select: { partCode: true, name: true },
      })
    : [];
  const byCode = new Map(known.map((p) => [p.partCode.toUpperCase(), p.name]));

  const data = {
    ...parsed.data,
    preparedBy: user.name,
    items: parsed.data.items.map((item) => ({
      ...item,
      name: byCode.get(item.code.toUpperCase()) ?? item.name,
    })),
  };

  const stored = saveDocument({
    filename: transferRequestFilename(data),
    asciiFilename: transferRequestAsciiFilename(data),
    mimeType: DOCX_MIME,
    data: await buildTransferRequestDocx(data),
    ownerId: req.auth!.userId,
  });

  res.status(201).json({
    id: stored.id,
    filename: stored.filename,
    path: documentPath(stored),
    title: `ขอโอนสินค้า: ${data.fromWarehouse} → ${data.toWarehouse}`,
    unknownCodes: parsed.data.items
      .filter((i) => i.code && !byCode.has(i.code.toUpperCase()))
      .map((i) => i.code),
  });
});

/**
 * ดาวน์โหลดเอกสารที่เพิ่งสร้าง
 *
 * ใช้ token ในลิงก์แทน Authorization header เพราะต้องเปิดได้ทั้งจากปุ่มบนเว็บ
 * และจากเบราว์เซอร์บนมือถือที่แนบ header เองไม่ได้ token สุ่ม 24 ไบต์และหมดอายุ
 * ใน 2 ชั่วโมง ใครได้ลิงก์ไปก็เปิดได้ในช่วงนั้น — ตั้งใจให้ส่งต่อให้คนอนุมัติได้เลย
 */
router.get("/:id", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const doc = token ? getDocument(req.params.id, token) : null;
  if (!doc) {
    return res.status(404).json({ error: "ไม่พบเอกสารนี้ หรือลิงก์หมดอายุแล้ว (เก็บไว้ 2 ชั่วโมง)" });
  }

  res.setHeader("Content-Type", doc.mimeType);
  // filename* เป็นแบบ RFC 5987 เพื่อให้ชื่อไฟล์ภาษาไทยไม่เพี้ยนตอนดาวน์โหลด
  // ส่วน filename= เป็นชื่อสำรองสำหรับตัวโหลดที่อ่านแบบ UTF-8 ไม่ได้
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${doc.asciiFilename}"; filename*=UTF-8''${encodeURIComponent(
      doc.filename
    )}`
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.send(doc.data);
});

export default router;
