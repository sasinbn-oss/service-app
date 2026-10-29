// สร้างไฟล์อะไหล่แบบไฟล์จริง (Haier/Huebsch/Maytag/Oasis/Other) — รูปวางในเซลล์ (Excel 365 "วางในเซลล์") ได้หลายรูป
// ExcelJS เขียนรูปแบบนี้ไม่ได้ จึงเขียนไฟล์ปกติก่อนแล้วฉีด xl/metadata.xml + xl/richData/* + xl/media/* เอง (แบบ fixtures-incell-image.js)
// ใช้: node tests/fixtures-parts-xlsx.js <ออก.xlsx> '<JSON>'
//   JSON = { "headers": [...], "rows": [[...], ...], "images": { "B2": "a", "B3": "b" } }
//   ค่าใน images คือ "เมล็ด" ของรูป — เมล็ดเดียวกัน = ไบต์เดียวกัน (ไว้เทสต์รูปเหมือนเดิม/เปลี่ยนรูป)
// พิมพ์ md5 ของรูปแต่ละเซลล์ออกมาเป็น JSON
const E = require("exceljs");
const JSZip = require("jszip");
const crypto = require("crypto");
const fs = require("fs");
const [out, specJson] = process.argv.slice(2);
const spec = JSON.parse(specJson);
// JPEG 1×1 พิกเซล + ไบต์ท้ายไฟล์ตามเมล็ด — โปรแกรมดูรูปไม่อ่านส่วนหลัง EOI แต่ไบต์ (md5) ต่างกัน
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);
const imageOf = (seed) => Buffer.concat([JPG, Buffer.from(`seed:${seed}`)]);
(async () => {
  const wb = new E.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(spec.headers);
  for (const r of spec.rows) ws.addRow(r);
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const sheetPath = Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
  let sheet = await zip.file(sheetPath).async("string");
  const refs = Object.keys(spec.images || {});
  const md5 = {};
  refs.forEach((ref, k) => {
    // เซลล์รูป → ค่า error ที่ชี้ไปรูปลำดับที่ k+1 แบบที่ Excel เขียน (เซลล์ว่างยังไม่มีใน XML ก็เติมให้)
    const cell = `<c r="${ref}" t="e" vm="${k + 1}"><v>#VALUE!</v></c>`;
    const re = new RegExp(`<c r="${ref}"[^>]*?(\\/>|>[\\s\\S]*?<\\/c>)`);
    if (re.test(sheet)) sheet = sheet.replace(re, cell);
    else {
      const row = ref.match(/\d+$/)[0];
      sheet = sheet.replace(new RegExp(`(<row r="${row}"[^>]*>)`), `$1${cell}`);
    }
    const data = imageOf(spec.images[ref]);
    md5[ref] = crypto.createHash("md5").update(data).digest("hex");
    zip.file(`xl/media/image${k + 1}.jpeg`, data);
  });
  zip.file(sheetPath, sheet);
  if (refs.length) {
    const n = refs.length;
    const each = (f) => refs.map((_, k) => f(k)).join("");
    zip.file(
      "xl/metadata.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${n}">${each(
        (k) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${k}"/></ext></extLst></bk>`
      )}</futureMetadata><valueMetadata count="${n}">${each((k) => `<bk><rc t="1" v="${k}"/></bk>`)}</valueMetadata></metadata>`
    );
    zip.file(
      "xl/richData/rdrichvalue.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="${n}">${each((k) => `<rv s="0"><v>${k}</v><v>5</v></rv>`)}</rvData>`
    );
    zip.file(
      "xl/richData/richValueRel.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${each((k) => `<rel r:id="rId${k + 1}"/>`)}</richValueRels>`
    );
    zip.file(
      "xl/richData/_rels/richValueRel.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${each(
        (k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${k + 1}.jpeg"/>`
      )}</Relationships>`
    );
  }
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  console.log(JSON.stringify(md5));
})();
