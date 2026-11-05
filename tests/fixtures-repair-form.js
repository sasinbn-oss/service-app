// สร้างไฟล์ฟอร์มแจ้งซ่อม COCO หลายแถว โครงเดียวกับไฟล์ของเจ้าของงาน 5 พ.ย. 69 (261 แถว · วันที่ว่าง · รูปฝังในเซลล์หลายรูป)
// ไฟล์รูปเดียวของ fixtures-incell-image.js ไม่พอ — ก้อนที่พังจริงคือไฟล์ร้อยกว่าแถวที่แทบทุกแถวมีรูป
// ใช้: node tests/fixtures-repair-form.js <แถว.json> <ออก.xlsx>
//   แถว.json = [{ branch, jobType, machine, model, size, symptom, contact, phone, place, date?, image? }]
//   image: true = ฝังรูป JPEG ~10 KB (ขนาดรูปย่อที่ Excel เก็บจริง) ในช่อง "รูปภาพ" · ไม่ใส่ date = ช่องวันที่ว่าง (แบบไฟล์จริง)
// พิมพ์ขนาดรูปของแต่ละแถวที่มีรูป (JSON: { แถวในไฟล์: ไบต์ }) ให้เทสต์เทียบกับที่แนบในใบงาน
const E = require("exceljs");
const JSZip = require("jszip");
const fs = require("fs");
const [specPath, out] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(specPath, "utf8"));

// JPEG 1×1 พิกเซลที่มีช่องคอมเมนต์ (FF FE) ยัดไว้ให้ได้ขนาดจริงราว 10 KB — เปิดเป็นรูปได้จริง และแต่ละแถวไม่ซ้ำกัน
const TINY = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);
function jpeg(seed) {
  const pad = Buffer.alloc(10 * 1024 - 4, 0x20);
  pad.write(`row-${seed}`);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(pad.length + 2);
  return Buffer.concat([TINY.subarray(0, 2), Buffer.from([0xff, 0xfe]), len, pad, TINY.subarray(2)]);
}

(async () => {
  const wb = new E.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  // หัวคอลัมน์ตามไฟล์จริง — "ผู้ติดต่อสาขา" (ไม่มี "ที่") ต้องยังจับได้
  ws.addRow(["วันที่แจ้ง", "รหัสสาขา", "ประเภทงาน", "เครื่อง", "รุ่นของเครื่อง", "ขนาดเครื่อง", "อาการที่พบ", "ผู้ติดต่อสาขา", "เบอร์ติดต่อสาขา", "ชื่อสถานที่", "รูปภาพ", "วิดีโอ"]);
  for (const r of rows) {
    ws.addRow([r.date ? new Date(r.date) : null, r.branch, r.jobType, r.machine ?? "", r.model ?? null, r.size ?? null, r.symptom, r.contact ?? null, r.phone ?? null, r.place ?? null, r.image ? "X" : null, null]);
  }
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const sheetPath = Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
  let sheet = await zip.file(sheetPath).async("string");
  const sizes = {};
  const imgRows = rows.map((r, i) => (r.image ? i + 2 : 0)).filter(Boolean);
  // แต่ละรูป = เซลล์ K{แถว} ที่เป็นค่า error ชี้ไปรูปลำดับ k (vm = k+1) แบบที่ Excel เขียน — โครงเดียวกับ fixtures-incell-image.js
  imgRows.forEach((line, k) => {
    sheet = sheet.replace(new RegExp(`<c r="K${line}"[^>]*?(/>|>[\\s\\S]*?</c>)`), `<c r="K${line}" t="e" vm="${k + 1}"><v>#VALUE!</v></c>`);
    const img = jpeg(line);
    zip.file(`xl/media/image${k + 1}.jpeg`, img);
    sizes[line] = img.length;
  });
  zip.file(sheetPath, sheet);
  if (imgRows.length) {
    const n = imgRows.length;
    const each = (f) => imgRows.map((_, k) => f(k)).join("");
    zip.file("xl/metadata.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${n}">${each((k) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${k}"/></ext></extLst></bk>`)}</futureMetadata><valueMetadata count="${n}">${each((k) => `<bk><rc t="1" v="${k}"/></bk>`)}</valueMetadata></metadata>`);
    zip.file("xl/richData/rdrichvalue.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="${n}">${each((k) => `<rv s="0"><v>${k}</v><v>5</v></rv>`)}</rvData>`);
    zip.file("xl/richData/richValueRel.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${each((k) => `<rel r:id="rId${k + 1}"/>`)}</richValueRels>`);
    zip.file("xl/richData/_rels/richValueRel.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${each((k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${k + 1}.jpeg"/>`)}</Relationships>`);
  }
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  console.log(JSON.stringify(sizes));
})();
