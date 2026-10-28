// ป๊อปอัพยืนยันก่อนเปิดใบงานซ้ำ (ต.ค. 69) — สาขามีใบที่ยังไม่ปิด กด "เปิดใบงาน" แล้วต้องยืนยันก่อนถึงจะบันทึก
// เทสต์ที่เปิดใบงานผ่านฟอร์มบนสาขาที่มีใบค้างอยู่แล้ว เรียกตัวนี้หลังกดปุ่ม · ไม่มีป๊อปอัพ = คืน false ไม่ทำอะไร
// เครื่องเดียวกันมีใบค้าง ต้องติ๊ก "ยืนยันว่าเป็นอาการใหม่" ก่อน ปุ่มยืนยันถึงกดได้
async function confirmDuplicate(page, wait = 4000) {
  const btn = page.getByLabel("ยืนยัน เปิดใบใหม่", { exact: true }).locator("visible=true");
  try {
    await btn.first().waitFor({ timeout: wait });
  } catch {
    return false;
  }
  const tick = page.getByLabel("ยืนยันว่าเป็นอาการใหม่", { exact: true }).locator("visible=true");
  if (await tick.count()) await tick.first().click();
  await btn.first().click();
  return true;
}

module.exports = { confirmDuplicate };
