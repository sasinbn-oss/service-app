const ExcelJS = require('exceljs');
const F = "/root/.claude/uploads/5ff10b40-0dfd-5476-8cbe-560a9c1678bd/91009c00-DryerTroubleshoot_1.xlsx";
const flat = v => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t=>t.text).join('');
    if (v.text) return v.text;
    if (v.result !== undefined) return String(v.result);
    if (v.hyperlink) return v.hyperlink;
    if (v.error) return v.error;
    return JSON.stringify(v).slice(0,50);
  }
  return String(v);
};
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(F);
  console.log('จำนวนชีต:', wb.worksheets.length);
  for (const ws of wb.worksheets) {
    console.log(`\n===== ชีต "${ws.name}" : ${ws.rowCount} แถว x ${ws.columnCount} คอลัมน์ =====`);
    for (let i = 1; i <= Math.min(ws.rowCount, 25); i++) {
      const row = ws.getRow(i);
      const vals = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(flat(row.getCell(c).value).replace(/\n/g,'⏎').slice(0,45));
      if (vals.some(v => v !== '')) console.log(`R${String(i).padStart(2)}: ${vals.map((v,ix)=>`[${ix+1}]${v}`).join(' ')}`);
    }
    console.log('  รูป (drawing):', ws.getImages ? ws.getImages().length : 0);
    console.log('  merged cells:', ws.model.merges ? ws.model.merges.length : 0);
  }
})();
