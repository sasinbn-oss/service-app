// สร้างไฟล์ฟอร์มแจ้งซ่อมที่ช่อง "รูปภาพ" เป็นรูปฝังในเซลล์ (Excel 365 "วางในเซลล์") — โครงเดียวกับไฟล์จริง 26 ต.ค. 69
// ExcelJS เขียนรูปแบบนี้ไม่ได้ จึงเขียนไฟล์ปกติก่อนแล้วฉีด xl/metadata.xml + xl/richData/* + xl/media/* เอง
// ใช้: node tests/fixtures-incell-image.js <ออก.xlsx> <รหัสสาขา> <เครื่อง> <อาการ>
const E = require("exceljs");
const JSZip = require("jszip");
const fs = require("fs");
const [out, branch, machine, symptom] = process.argv.slice(2);
// JPEG 1×1 พิกเซล — พอให้รู้ว่าไฟล์ที่แนบคือรูปที่ฝังมา (เทียบขนาดได้)
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);
(async () => {
  const wb = new E.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["วันที่แจ้ง", "รหัสสาขา", "ประเภทงาน", "เครื่อง", "รุ่นของเครื่อง", "ขนาดเครื่อง", "อาการที่พบ", "ผู้ติดต่อที่สาขา", "เบอร์ติดต่อสาขา", "ชื่อสถานที่", "รูปภาพ", "วิดีโอ"]);
  ws.addRow([new Date(Date.UTC(2026, 9, 26)), branch, "CM", machine, "OASIS", "13 Kg", symptom, "คุณทดสอบ", "090-000-0000", "สาขาทดสอบ", "X", null]);
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const sheetPath = Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
  let sheet = await zip.file(sheetPath).async("string");
  // เซลล์ K2 (ข้อความ "X") → ค่า error ที่ชี้ไปรูปลำดับที่ 1 แบบที่ Excel เขียน
  sheet = sheet.replace(/<c r="K2"[^>]*?(\/>|>[\s\S]*?<\/c>)/, '<c r="K2" t="e" vm="1"><v>#VALUE!</v></c>');
  zip.file(sheetPath, sheet);
  zip.file("xl/metadata.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata><valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>');
  zip.file("xl/richData/rdrichvalue.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>');
  zip.file("xl/richData/richValueRel.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/></richValueRels>');
  zip.file("xl/richData/_rels/richValueRel.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/></Relationships>');
  zip.file("xl/media/image1.jpeg", JPG);
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  console.log(JPG.length);
})();
