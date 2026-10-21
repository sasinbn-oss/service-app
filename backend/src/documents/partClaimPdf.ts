/**
 * ใบเคลมอะไหล่เป็น PDF — หัวข้อและลำดับตามหน้า "ข้อมูลแจ้งเคลม" ของฟอร์มใบเคลมอะไหล่ที่ผู้ขายใช้
 *
 * หัวกระดาษ K-nex เป็นรูปทั้งแถบ (assets/knex-letterhead.png) ตามที่เจ้าของงานส่งมา ต.ค. 69
 * รอบแรกวาดที่อยู่ด้วยฟอนต์เพราะรูปที่ได้มาเล็ก พิมพ์แล้วเบลอ — รูปชุดใหม่กว้าง 1,880 px
 * ซึ่งเต็มความกว้างหน้า A4 ได้ราว 280 dpi พิมพ์ชัด และตรงกับหัวกระดาษจริงทุกจุดโดยไม่ต้องจัดเอง
 * เปลี่ยนหัวกระดาษครั้งหน้าแทนที่ไฟล์นั้นไฟล์เดียว (ตัดขอบขาวออกก่อน)
 * ช่อง "ผู้รับเคลม" เว้นว่างไว้ให้ผู้ขายเซ็นจริง
 *
 * ฟอนต์ต้องฝังลงไฟล์เสมอ (ดู transferRequestPdf.ts) ฟอนต์มาตรฐานของ PDF ไม่มีอักษรไทย
 */
import path from "path";
import PDFDocument from "pdfkit";

const FONT_DIR = path.join(__dirname, "..", "..", "assets", "fonts");
const LETTERHEAD = path.join(__dirname, "..", "..", "assets", "knex-letterhead.png");
const NAVY = "#1B2A6B";
const REGULAR = "sarabun";
const BOLD = "sarabun-bold";

// A4 — ฟอร์มต้นฉบับเป็น A4
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const WIDTH = PAGE.width - MARGIN * 2;

export interface PartClaimPdfData {
  workOrderCode: string;
  claim: {
    status: string;
    partCode: string;
    partName: string;
    /** รหัสตัวที่เสียที่ช่างอ่านจากของจริง — ว่างเฉพาะใบเก่าก่อนมีช่องนี้ */
    brokenPartCode: string | null;
    quantity: number;
    branchCode: string;
    branchName: string;
    branchOpenedAt: Date | null;
    brand: string | null;
    model: string | null;
    machineCode: string | null;
    symptom: string;
    checkNote: string;
    troubleshooting: string[];
    /** ข้อมูลป้ายรุ่นที่สแกน/พิมพ์ตอนปิดงาน (Json ของ PartClaim) — ใบเก่าว่าง */
    nameplate?: unknown;
    createdAt: Date;
    reviewedAt: Date | null;
  };
  requesterName: string | null;
  /** ชื่อหลักฐานที่แนบในระบบ (รูปอะไหล่เก่า · วิดีโอ Error code …) */
  evidence: string[];
}

function thaiDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });
}

export function buildPartClaimPdf(data: PartClaimPdfData): Promise<Buffer> {
  const { claim } = data;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc.registerFont(REGULAR, path.join(FONT_DIR, "Sarabun-Regular.ttf"));
      doc.registerFont(BOLD, path.join(FONT_DIR, "Sarabun-Bold.ttf"));

      // ── หัวกระดาษ ── เต็มความกว้างเนื้อหา สูงตามสัดส่วนรูป (1880 × 170)
      const top = 34;
      const headH = (WIDTH * 170) / 1880;
      doc.image(LETTERHEAD, MARGIN, top, { width: WIDTH });
      doc.moveTo(MARGIN, top + headH + 8).lineTo(MARGIN + WIDTH, top + headH + 8).lineWidth(0.8).strokeColor(NAVY).stroke().lineWidth(1);

      doc.font(BOLD).fontSize(22).fillColor("#000").text("เอกสารใบเคลมอะไหล่", MARGIN, top + headH + 20, { width: WIDTH, align: "center" });
      doc.font(REGULAR).fontSize(11).fillColor("#555")
        .text(`อ้างอิงใบงาน ${data.workOrderCode}`, { width: WIDTH, align: "center" });
      // ยังไม่อนุมัติ = ร่าง — ผู้ขายต้องไม่ได้รับใบที่ Admin Spare Part ยังไม่ได้ตรวจ
      if (claim.status !== "APPROVED") {
        doc.font(BOLD).fontSize(12).fillColor("#B91C1C")
          .text("ร่าง — ยังไม่ผ่านการตรวจของ Admin Spare Part", { width: WIDTH, align: "center" });
      }
      doc.fillColor("#000").moveDown(1);
      doc.font(BOLD).fontSize(15).text("ข้อมูลแจ้งเคลม", { underline: true });
      doc.moveDown(0.4);

      const line = (label: string, value: string) => {
        const y = doc.y;
        doc.font(BOLD).fontSize(13).text(label, MARGIN, y, { width: 150 });
        doc.font(REGULAR).fontSize(13).text(value || "—", MARGIN + 150, y, { width: WIDTH - 150 });
        doc.moveTo(MARGIN + 150, doc.y).lineTo(MARGIN + WIDTH, doc.y).dash(1, { space: 2 }).strokeColor("#999").stroke().undash();
        doc.moveDown(0.35);
      };
      line("สาขา", `${claim.branchCode} · ${claim.branchName}`);
      line("วันที่เปิดสาขา", thaiDate(claim.branchOpenedAt));
      line("วันที่เปลี่ยนอะไหล่", thaiDate(claim.createdAt));
      line("ยี่ห้อ", claim.brand ?? "");
      line("โมเดล/รุ่นเครื่อง", claim.model ?? "");
      line("หมายเลขเครื่อง", claim.machineCode ?? "");
      /**
       * ข้อมูลจากป้ายรุ่น (Serial · No. of production ฯลฯ) — ผู้ขายใช้ยืนยันว่าเครื่องอยู่ในประกัน
       * ใส่เฉพาะข้อมูลเครื่อง · ผลเช็คการติดตั้งตามคู่มือไม่พิมพ์ลงเอกสารที่ส่งผู้ขาย (Admin Spare Part เห็นในระบบ)
       * "พิมพ์เอง" ติดท้ายให้รู้ว่าไม่ได้อ่านจากป้ายด้วยกล้อง
       */
      const plate = (claim.nameplate as { fields?: { label: string; value: string; source: string }[] } | null)?.fields ?? [];
      for (const f of plate) line(`${f.label} (ป้ายรุ่น)`, `${f.value}${f.source === "HAND" ? " · พิมพ์เอง" : ""}`);
      // รหัสที่ผู้ขายรับเคลมคือตัวที่ส่งคืน (ช่างอ่านจากของจริง) — ตัวที่เบิกมาใส่แทนแยกไว้อีกบรรทัด
      line("รหัสอะไหล่ (ตัวที่เสีย)", claim.brokenPartCode ?? claim.partCode);
      line("ชื่ออะไหล่", claim.quantity > 1 ? `${claim.partName} × ${claim.quantity}` : claim.partName);
      line("อะไหล่ที่เปลี่ยนใส่", claim.partCode);

      const block = (title: string, body: string) => {
        doc.moveDown(0.5);
        doc.font(BOLD).fontSize(13).text(title, MARGIN, doc.y, { width: WIDTH, underline: true });
        doc.font(REGULAR).fontSize(13).text(body, MARGIN, doc.y + 2, { width: WIDTH });
      };
      block("อาการ/สาเหตุ", claim.symptom);
      block("ช่างเข้าเช็คเครื่องอะไรบ้าง จึงระบุว่าควรเปลี่ยนอะไหล่ชิ้นนี้", claim.checkNote);
      if (claim.troubleshooting.length) {
        block(`Troubleshooting ${claim.brand ?? ""} ที่ทำแล้ว`, claim.troubleshooting.map((t) => `• ${t}`).join("\n"));
      }

      // ลายเซ็น — ผู้ขอเคลมคือช่างที่ปิดงาน · ผู้รับเคลมเว้นว่างให้เซ็นจริง
      doc.moveDown(2.2);
      const sigY = doc.y;
      const col = WIDTH / 2;
      const sig = (x: number, title: string, name: string, date: string) => {
        doc.font(BOLD).fontSize(13).text(title, x, sigY, { width: col - 20, align: "center" });
        doc.moveTo(x + 20, sigY + 54).lineTo(x + col - 40, sigY + 54).dash(1, { space: 2 }).strokeColor("#999").stroke().undash();
        doc.font(REGULAR).fontSize(12).text(name, x, sigY + 58, { width: col - 20, align: "center" });
        doc.text(`วันที่ ${date}`, x, sigY + 76, { width: col - 20, align: "center" });
      };
      sig(MARGIN, "ผู้ขอเคลม", data.requesterName ?? "", thaiDate(claim.createdAt));
      sig(MARGIN + col, "ผู้รับเคลม", "", "....................");

      doc.font(REGULAR).fontSize(10.5).fillColor("#444")
        .text(`หลักฐานที่แนบในระบบ: Nameplate · ${data.evidence.join(" · ") || "—"}`, MARGIN, sigY + 120, { width: WIDTH });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
