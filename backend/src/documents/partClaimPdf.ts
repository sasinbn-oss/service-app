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
  /**
   * วันที่เปลี่ยนอะไหล่จริง = วันที่ส่งเคลมชิ้นนี้ครั้งแรก (ก่อนถูกตีกลับ) — ดู firstSubmittedAt ใน utils/claimRules.ts
   * ไม่ส่งมา = ใช้วันที่ส่งใบนี้ · ช่องลายเซ็นผู้ขอเคลมยังลงวันที่ส่งใบนี้ เพราะเป็นวันที่ช่างยืนยันข้อมูลชุดนี้
   */
  repairedAt?: Date | null;
  requesterName: string | null;
  /**
   * ชื่อไฟล์หลักฐานที่ส่งไปพร้อมใบนี้ ตามที่ผู้ขายได้จริง (WO-01208_201384P_รูปอะไหล่เก่า.jpg …) — vendorFilePlan
   * ตัวเดียวกับ zip/ปุ่มวิดีโอ (เคลมก้อน 6) ผู้ขายเทียบใบเคลมกับกองไฟล์ที่ได้รับทีละชื่อได้
   */
  evidence: string[];
  /** ชิ้นที่ n จาก m ของงานซ่อมครั้งนี้ (claimPosition) — ไม่ส่งมา = ไม่พิมพ์ */
  position?: { n: number; m: number } | null;
  /** บรรทัด "Error ที่เครื่องขึ้น" (machineErrorText) — null = เครื่องที่ไม่มีคู่มือ Error / ใบเก่า ไม่พิมพ์บรรทัดนี้ */
  machineError?: string | null;
  /** ใบงานทดสอบ — พิมพ์เส้นแดง "ใบทดสอบ" กันใบที่ลองระบบหลุดไปถึงผู้ขาย */
  isTest?: boolean;
}

/**
 * ภาพตัดบรรทัดรุ่น/Serial จากรูปป้าย (data URL ที่แอปเก็บไว้ตอนสแกน) → ไบต์รูปที่ pdfkit วางได้อย่างปลอดภัย
 *
 * รับเฉพาะ JPEG (แอปสร้างแต่ JPEG) — pdfkit อ่านหัว JPEG ทันทีใน try/catch แล้วฝังไบต์ไปทั้งก้อนโดยไม่แตกไฟล์
 * ไม่รับ PNG เพราะ pdfkit แตก PNG บางแบบ (สลับแถว/มีช่องโปร่งใส/จานสี) ด้วย zlib แบบ callback ที่โยน error
 * ออกนอก try/catch และนอก promise — PNG เสียภาพเดียวที่ส่งมาจาก POST /close ทำให้เซิร์ฟเวอร์ล้มทั้งตัว
 * ทุกครั้งที่มีคนเปิดใบเคลมใบนั้น (ตรวจไบต์หัว PNG ไม่พอ: ไฟล์มี IHDR ซ้ำได้ ตัวที่ pdfkit ใช้คือตัวหลังสุด)
 * ภาพที่ไม่ผ่าน = ไม่วาด ค่าที่ช่างยืนยันยังพิมพ์ครบ
 */
function cropImage(src: unknown): Buffer | null {
  if (typeof src !== "string") return null;
  const m = /^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 32) return null;
  return buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}

function thaiDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });
}

/**
 * ขนาดตัวอักษรของเนื้อหา — ใบเคลมที่กรอกยาวปกติ (อาการ ~300 ตัว · เช็คอะไรบ้าง ~600 ตัว · Troubleshooting 5 ข้อ)
 * ต้องจบในหน้าเดียวพร้อมช่องลายเซ็น ผู้ขายพิมพ์แผ่นเดียวแล้วเซ็นรับ — Sarabun 11 pt ยังอ่านง่ายบนกระดาษ A4
 * (Sarabun ตัวใหญ่กว่า TH Sarabun ที่ขนาดเท่ากัน) และเหลือที่ให้บรรทัดที่จะเพิ่มทีหลัง (Error ที่เครื่องขึ้น · ภาพตัดป้าย)
 */
const BODY = 11;
const LABEL_W = 150;
/**
 * ช่องลายเซ็นทั้งก้อน (หัว · ที่เซ็น ~1 ซม. · ชื่อ · วันที่) — ต้องอยู่หน้าเดียวกันทั้งก้อน (ดูท้ายฟังก์ชัน)
 * ที่เซ็นเดิมสูงกว่านี้ ย่อลงตอนเพิ่มรายการชื่อไฟล์หลักฐาน (เคลมก้อน 6) ให้ใบร่างที่กรอกยาวปกติยังจบหน้าเดียว
 */
const SIG_LINE = 30;
const SIG_H = SIG_LINE + 34;
/**
 * ชื่อไฟล์หลักฐาน — ตัวเล็กกว่าเนื้อหา (ตามตัวอย่าง) เป็นชื่อไฟล์ ไม่ใช่ข้อความที่ต้องอ่านยาว
 * ไม่บีบระยะบรรทัด: สระบน/วรรณยุกต์ของบรรทัดล่างจะชนขีดล่าง "_" ของบรรทัดบน อ่านชื่อไฟล์ผิดตัว
 */
const EVIDENCE_PT = 9;
/**
 * ภาพตัดป้ายข้างค่ารุ่น/Serial — ผู้ขายเทียบตัวอักษรกับป้ายจริงได้จากกระดาษแผ่นเดียว (เจ้าของงานเลือกข้อ 5 ก)
 * สูงเท่าบรรทัดเดียว ใบเคลมยาวปกติยังจบหน้าเดียว · กว้างสุดเท่านี้ ค่าที่อยู่ซ้ายยังมีที่พอ
 */
const CROP_H = 16;
const CROP_W = 150;

export function buildPartClaimPdf(data: PartClaimPdfData): Promise<Buffer> {
  const { claim } = data;
  return new Promise((resolve, reject) => {
    // bufferPages — เลขหน้า "หน้า i/n" เขียนตอนจบ เมื่อรู้แล้วว่ามีกี่หน้า
    const doc = new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    /**
     * ทุกอย่างที่วางด้วยพิกัดตายตัวต้องเช็คก่อนว่ายังพอที่ในหน้านี้
     *
     * pdfkit ขึ้นหน้าใหม่เองเมื่อข้อความไหลเกินขอบล่าง แต่ข้อความที่สั่งวางที่ y ตายตัวซึ่งเลยขอบไปแล้ว
     * จะถูกยกไปหน้าใหม่ทีละชิ้น — ใบเคลมเคยออกมา 6 หน้า (หัวช่องลายเซ็นหน้า 1 ชื่อหน้า 2 วันที่หน้า 3 …)
     * เพราะช่องลายเซ็นวางต่อจากเนื้อหาด้วยพิกัดตายตัวโดยไม่ดูว่าเหลือที่เท่าไหร่
     */
    const bottom = PAGE.height - MARGIN;
    const ensure = (h: number) => {
      if (doc.y + h > bottom) doc.addPage();
    };

    try {
      doc.registerFont(REGULAR, path.join(FONT_DIR, "Sarabun-Regular.ttf"));
      doc.registerFont(BOLD, path.join(FONT_DIR, "Sarabun-Bold.ttf"));

      // ── หัวกระดาษ ── เต็มความกว้างเนื้อหา สูงตามสัดส่วนรูป (1880 × 170)
      const top = 30;
      const headH = (WIDTH * 170) / 1880;
      doc.image(LETTERHEAD, MARGIN, top, { width: WIDTH });
      doc.moveTo(MARGIN, top + headH + 6).lineTo(MARGIN + WIDTH, top + headH + 6).lineWidth(0.8).strokeColor(NAVY).stroke().lineWidth(1);

      doc.font(BOLD).fontSize(18).fillColor("#000").text("เอกสารใบเคลมอะไหล่", MARGIN, top + headH + 12, { width: WIDTH, align: "center" });
      // ชิ้นที่เท่าไหร่จากกี่ชิ้น — ผู้ขายได้ใบละชิ้น ต้องรู้ว่าได้ครบชุดหรือยัง
      const pos = data.position && data.position.m > 0 ? ` · ชิ้นที่ ${data.position.n} จาก ${data.position.m}` : "";
      doc.font(REGULAR).fontSize(10.5).fillColor("#555")
        .text(`อ้างอิงใบงาน ${data.workOrderCode}${pos}`, { width: WIDTH, align: "center" });
      if (data.isTest) {
        doc.font(BOLD).fontSize(11).fillColor("#B91C1C").text("ใบทดสอบ", { width: WIDTH, align: "center" });
      }
      // ยังไม่อนุมัติ = ร่าง — ผู้ขายต้องไม่ได้รับใบที่ Admin Spare Part ยังไม่ได้ตรวจ
      if (claim.status !== "APPROVED") {
        doc.font(BOLD).fontSize(11).fillColor("#B91C1C")
          .text("ร่าง — ยังไม่ผ่านการตรวจของ Admin Spare Part", { width: WIDTH, align: "center" });
      }
      doc.fillColor("#000").moveDown(0.5);
      doc.font(BOLD).fontSize(13).text("ข้อมูลแจ้งเคลม", MARGIN, doc.y, { underline: true });
      doc.moveDown(0.25);

      /**
       * หนึ่งบรรทัดของฟอร์ม: หัวข้อซ้าย ค่าขวา เส้นประใต้ค่า
       * ค่ายาวขึ้นบรรทัดใหม่ได้ — วัดความสูงก่อนแล้วยกทั้งแถวไปหน้าใหม่ ไม่ให้หัวข้ออยู่คนละหน้ากับค่า
       */
      const line = (label: string, value: string, crop?: Buffer | null) => {
        // มีภาพตัดป้าย = ค่าแคบลง ภาพชิดขวาในแถวเดียวกัน
        const valueW = WIDTH - LABEL_W - (crop ? CROP_W + 8 : 0);
        doc.font(REGULAR).fontSize(BODY);
        const valueH = doc.heightOfString(value || "—", { width: valueW });
        doc.font(BOLD).fontSize(BODY);
        const labelH = doc.heightOfString(label, { width: LABEL_W - 6 });
        ensure(Math.max(valueH, labelH, crop ? CROP_H + 1 : 0) + 3);
        const y = doc.y;
        doc.font(BOLD).fontSize(BODY).text(label, MARGIN, y, { width: LABEL_W - 6 });
        const afterLabel = doc.y;
        doc.font(REGULAR).fontSize(BODY).text(value || "—", MARGIN + LABEL_W, y, { width: valueW });
        let rowEnd = Math.max(afterLabel, doc.y);
        if (crop) {
          const keepY = doc.y;
          try {
            doc.image(crop, MARGIN + WIDTH - CROP_W, y, { fit: [CROP_W, CROP_H], align: "right" });
            rowEnd = Math.max(rowEnd, y + CROP_H + 1);
          } catch {
            // ภาพเสีย (แอปรุ่นเก่า/ข้อมูลไม่ครบ) — ข้ามภาพ ค่ายังอยู่
          }
          doc.y = keepY;
        }
        doc.moveTo(MARGIN + LABEL_W, rowEnd).lineTo(MARGIN + WIDTH, rowEnd).dash(1, { space: 2 }).strokeColor("#999").stroke().undash();
        doc.x = MARGIN;
        doc.y = rowEnd + 2.5;
      };
      line("สาขา", `${claim.branchCode} · ${claim.branchName}`);
      line("วันที่เปิดสาขา", thaiDate(claim.branchOpenedAt));
      // วันที่ซ่อมจริง ไม่ใช่วันที่ส่งรอบล่าสุด — ใบที่ถูกตีกลับแล้วส่งใหม่ ผู้ขายต้องเห็นวันเดียวกับที่เปลี่ยนของ
      line("วันที่เปลี่ยนอะไหล่", thaiDate(data.repairedAt ?? claim.createdAt));
      line("ยี่ห้อ", claim.brand ?? "");
      line("โมเดล/รุ่นเครื่อง", claim.model ?? "");
      line("หมายเลขเครื่อง", claim.machineCode ?? "");
      /**
       * ข้อมูลจากป้ายรุ่น (Serial · No. of production ฯลฯ) — ผู้ขายใช้ยืนยันว่าเครื่องอยู่ในประกัน
       * ใส่เฉพาะข้อมูลเครื่อง · ผลเช็คการติดตั้งตามคู่มือไม่พิมพ์ลงเอกสารที่ส่งผู้ขาย (Admin Spare Part เห็นในระบบ)
       * "พิมพ์เอง" ติดท้ายให้รู้ว่าไม่ได้อ่านจากป้ายด้วยกล้อง
       */
      const plate =
        (claim.nameplate as { fields?: { key?: string; label: string; value: string; source: string; crop?: unknown }[] } | null)
          ?.fields ?? [];
      for (const f of plate) {
        // ภาพตัดเฉพาะรุ่นกับ Serial — สองช่องที่ผู้ขายใช้ยืนยันเครื่อง และเป็นช่องที่ OCR สับสนตัวอักษรบ่อยที่สุด
        const crop = f.key === "model" || f.key === "serial" ? cropImage(f.crop) : null;
        line(`${f.label} (ป้ายรุ่น)`, `${f.value}${f.source === "HAND" ? " · พิมพ์เอง" : ""}`, crop);
      }
      // Error ที่ช่างเลือกตอนปิดงาน (เครื่องที่มีคู่มือ Error in Field) — ผลเช็คตามคู่มือยังไม่พิมพ์ (ข้อ 5 ข)
      if (data.machineError) line("Error ที่เครื่องขึ้น", data.machineError);
      // รหัสที่ผู้ขายรับเคลมคือตัวที่ส่งคืน (ช่างอ่านจากของจริง) — ตัวที่เบิกมาใส่แทนแยกไว้อีกบรรทัด
      line("รหัสอะไหล่ (ตัวที่เสีย)", claim.brokenPartCode ?? claim.partCode);
      line("ชื่ออะไหล่", claim.quantity > 1 ? `${claim.partName} × ${claim.quantity}` : claim.partName);
      line("อะไหล่ที่เปลี่ยนใส่", claim.partCode);

      // หัวข้อกับบรรทัดแรกของเนื้อหาต้องอยู่หน้าเดียวกัน — เนื้อหาที่ยาวกว่านั้นไหลข้ามหน้าเองได้
      const block = (title: string, body: string) => {
        doc.moveDown(0.35);
        doc.font(REGULAR).fontSize(BODY);
        ensure(doc.currentLineHeight(true) * 2 + 2);
        doc.font(BOLD).fontSize(BODY).text(title, MARGIN, doc.y, { width: WIDTH, underline: true });
        doc.font(REGULAR).fontSize(BODY).text(body, MARGIN, doc.y + 1, { width: WIDTH });
      };
      block("อาการ/สาเหตุ", claim.symptom);
      block("ช่างเข้าเช็คเครื่องอะไรบ้าง จึงระบุว่าควรเปลี่ยนอะไหล่ชิ้นนี้", claim.checkNote);
      if (claim.troubleshooting.length) {
        block(`Troubleshooting ${claim.brand ?? ""} ที่ทำแล้ว`, claim.troubleshooting.map((t) => `• ${t}`).join("\n"));
      }

      /**
       * หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้) — ชื่อไฟล์ที่ผู้ขายได้จริงทีละบรรทัด ตามตัวอย่างที่เจ้าของงานอนุมัติ (เคลมก้อน 6)
       * อยู่ก่อนช่องลายเซ็น: ผู้รับเคลมเซ็นรับใบนี้พร้อมรายการไฟล์ที่ได้ ไม่ใช่เซ็นแล้วมีรายการห้อยท้าย
       * เดิมเป็นบรรทัดเดียว "หลักฐานที่แนบในระบบ: Nameplate · รูปอะไหล่เก่า …" ที่บอกแค่ชนิดไฟล์ — ผู้ขายจับคู่กับไฟล์ที่ได้ไม่ได้
       */
      doc.moveDown(0.35);
      doc.font(REGULAR).fontSize(BODY);
      ensure(doc.currentLineHeight(true) * 2 + 2);
      doc.font(BOLD).fontSize(BODY).fillColor("#000").text("หลักฐาน (ไฟล์ที่ส่งไปพร้อมใบนี้)", MARGIN, doc.y, { width: WIDTH, underline: true });
      // สองคอลัมน์ อ่านซ้ายไปขวาทีละแถว — ห้าชื่อเรียงบรรทัดเดียวยาวเกินไป ใบเคลมยาวปกติ (อาการ ~300 · เช็ค ~600 ตัว)
      // จะดันช่องลายเซ็นตกไปหน้าสอง ผู้ขายต้องเซ็นแผ่นเดียว (ชื่อไฟล์ยาวสุดราว 45 ตัว ยังพอในครึ่งหน้า ไม่พอก็ตัดบรรทัดในช่องตัวเอง)
      const names = data.evidence.length ? data.evidence : ["—"];
      const half = WIDTH / 2;
      doc.font(REGULAR).fontSize(EVIDENCE_PT).fillColor("#333");
      doc.y += 1;
      for (let i = 0; i < names.length; i += 2) {
        const pair = names.slice(i, i + 2);
        const h = Math.max(...pair.map((n) => doc.heightOfString(n, { width: half - 8 })));
        ensure(h);
        const y = doc.y;
        pair.forEach((n, k) => doc.text(n, MARGIN + k * half, y, { width: half - 8 }));
        doc.x = MARGIN;
        doc.y = y + h;
      }
      doc.fillColor("#000");

      /**
       * ลายเซ็น — ผู้ขอเคลมคือช่างที่ปิดงาน · ผู้รับเคลมเว้นว่างให้เซ็นจริง
       * วางเป็นก้อนเดียว: วัดความสูงทั้งก้อน ไม่พอก็ขึ้นหน้าใหม่ทั้งก้อน
       * ลายเซ็นจึงไม่มีวันแยกจากชื่อ/วันที่ และอยู่หลังเนื้อหาสุดท้ายเสมอ
       */
      doc.y += 8;
      ensure(SIG_H);
      const sigY = doc.y;
      const col = WIDTH / 2;
      const sig = (x: number, title: string, name: string, date: string) => {
        doc.font(BOLD).fontSize(BODY + 0.5).text(title, x, sigY, { width: col - 20, align: "center" });
        doc.moveTo(x + 20, sigY + SIG_LINE).lineTo(x + col - 40, sigY + SIG_LINE).dash(1, { space: 2 }).strokeColor("#999").stroke().undash();
        doc.font(REGULAR).fontSize(BODY).text(name, x, sigY + SIG_LINE + 3, { width: col - 20, align: "center" });
        doc.text(`วันที่ ${date}`, x, sigY + SIG_LINE + 18, { width: col - 20, align: "center" });
      };
      sig(MARGIN, "ผู้ขอเคลม", data.requesterName ?? "", thaiDate(claim.createdAt));
      sig(MARGIN + col, "ผู้รับเคลม", "", "....................");

      /**
       * เลขหน้า "หน้า i/n" ในขอบล่าง — ใบเคลมที่ยาวจนล้นหน้า ผู้ขายรู้ว่ามีแผ่นต่อ ไม่หยิบไปแค่แผ่นแรก
       * เขียนในขอบล่าง ต้องปิดขอบชั่วคราว ไม่งั้น pdfkit เห็นว่าเลยขอบแล้วขึ้นหน้าใหม่เปล่า ๆ ให้ทุกหน้า
       */
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(pages.start + i);
        const keep = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font(REGULAR).fontSize(9).fillColor("#666")
          .text(`หน้า ${i + 1}/${pages.count}`, MARGIN, PAGE.height - MARGIN + 20, { width: WIDTH, align: "center", lineBreak: false });
        doc.page.margins.bottom = keep;
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
