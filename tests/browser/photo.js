// แนบรูปหน้างานในฟอร์มเปิดใบงาน — รูปบังคับทุกตำแหน่งแล้ว (ต.ค. 69) เทสต์ที่เปิดใบงานผ่านฟอร์มต้องแนบก่อนกดบันทึก
// PNG 1×1 จริง (ตัวย่อรูปในฟอร์มต้องเปิดได้) · กดปุ่ม "เลือกรูป" ของแถวเครื่องสุดท้ายที่เห็น
const fs = require("fs");
const os = require("os");
const path = require("path");

const FILE = path.join(os.tmpdir(), "wo-form-photo.png");
fs.writeFileSync(FILE, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

async function attachPhoto(page) {
  const btn = page.getByText("เลือกรูป", { exact: true }).locator("visible=true").last();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15000 }), btn.click()]);
  await chooser.setFiles(FILE);
  await page.waitForTimeout(2000);
}

module.exports = { attachPhoto };
