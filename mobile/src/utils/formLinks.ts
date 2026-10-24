/**
 * ใบงานที่นำเข้าจากฟอร์มแจ้งซ่อม COCO เก็บลิงก์รูป/วิดีโอ SharePoint ไว้ในรายละเอียด (backend/src/utils/repairFormImport.ts)
 *
 * รูปอยู่ใน SharePoint ของบริษัทที่ต้องล็อกอิน เซิร์ฟเวอร์ดึงมาเก็บเองไม่ได้ จึงเก็บเป็นลิงก์
 * แต่ลิงก์ยาวสามบรรทัดรกหัวใบงาน (เจ้าของงานขอเอาออก ต.ค. 69) — หน้าใบงานแยกออกมาแสดงเป็นปุ่ม
 * ในการ์ดรูปหน้างานแทน · บรรทัด "แจ้งผ่านฟอร์ม…" ของใบที่นำเข้ารุ่นแรกตัดทิ้ง (ที่มาโชว์ในการ์ดอยู่แล้ว)
 * แยกตอนแสดง ไม่แก้ข้อมูล — ใบที่นำเข้าไปแล้วก็สะอาดด้วย
 */
export type FormLink = { kind: "รูป" | "วิดีโอ"; url: string; /** ชื่อปุ่ม — มีหลายรูปถึงจะใส่เลข */ label: string };

// สาขาแนบได้หลายรูปต่อครั้ง — ฟอร์มเขียนลิงก์ทั้งหมดในช่องเดียวคั่นด้วย "; " (เจอในไฟล์จริง ต.ค. 69)
// รุ่นแรกจับแค่บรรทัดละลิงก์เดียว ใบที่มีหลายรูปเลยยังโชว์ลิงก์ยาวเต็มหัวใบงาน
const LINE = /^(รูป|วิดีโอ)จากฟอร์ม: (.+)$/;
const URL = /https?:\/\/[^\s;]+/g;
const OLD_HEADER = "แจ้งผ่านฟอร์มแจ้งซ่อม COCO";

export function splitFormDetail(detail: string | null): { text: string; links: FormLink[] } {
  const links: FormLink[] = [];
  const keep: string[] = [];
  for (const line of (detail ?? "").split("\n")) {
    const m = line.match(LINE);
    const urls = m ? m[2].match(URL) ?? [] : [];
    if (m && urls.length) {
      const kind = m[1] as FormLink["kind"];
      urls.forEach((url, i) => links.push({ kind, url, label: urls.length > 1 ? `${kind}ที่ ${i + 1} จากฟอร์มแจ้งซ่อม` : `${kind}จากฟอร์มแจ้งซ่อม` }));
    } else if (!line.startsWith(OLD_HEADER)) keep.push(line);
  }
  return { text: keep.join("\n").trim(), links };
}
