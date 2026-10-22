/**
 * ที่เก็บไฟล์ของระบบทดสอบในเครื่อง — แทน Supabase Storage (S3) ของระบบจริง
 *
 * เขียนเองแทนการใช้ MinIO เพราะ image ของ MinIO เลิกลง Docker Hub แล้ว และระบบทดสอบ
 * ต้องการแค่ "เก็บไฟล์ลงดิสก์ แล้วเปิดคืนได้" — ไม่ตรวจลายเซ็นของลิงก์ชั่วคราว
 * (คนที่เข้าถึงได้คือคนในวง Wi-Fi ที่เปิดระบบทดสอบอยู่แล้ว)
 *
 * รองรับเท่าที่ backend ใช้ (src/storage/fileStore.ts): PUT · GET · HEAD · DELETE · list (ตรวจสุขภาพ)
 * แบบ path-style: /<ชื่อถัง>/<key> · ไฟล์อยู่ใน /data (volume ของ docker — ลบ volume = ไฟล์หาย)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.DATA_DIR || "/data";
const PORT = Number(process.env.PORT || 9000);

// key มาจาก URL — กันไม่ให้ ../ หลุดออกนอกโฟลเดอร์เก็บไฟล์
function fileFor(bucket, key) {
  const p = path.resolve(ROOT, bucket, key);
  if (!p.startsWith(path.resolve(ROOT, bucket) + path.sep)) return null;
  return p;
}

http
  .createServer((req, res) => {
    const [rawPath, query = ""] = req.url.split("?");
    const parts = decodeURIComponent(rawPath).replace(/^\/+/, "").split("/");
    const bucket = parts.shift();
    const key = parts.join("/");
    const params = new URLSearchParams(query);
    if (!bucket || !/^[a-z0-9.-]+$/.test(bucket)) return res.writeHead(400).end();

    if (req.method === "GET" && !key && params.get("list-type") === "2") {
      return res
        .writeHead(200, { "Content-Type": "application/xml" })
        .end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
    const file = key ? fileFor(bucket, key) : null;
    if (!file) return res.writeHead(400).end();

    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(chunks));
        fs.writeFileSync(file + ".type", req.headers["content-type"] || "application/octet-stream");
        res.writeHead(200, { ETag: '"local"' }).end();
      });
      return;
    }
    if (req.method === "DELETE") {
      fs.rmSync(file, { force: true });
      fs.rmSync(file + ".type", { force: true });
      return res.writeHead(204).end();
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (!fs.existsSync(file)) return res.writeHead(404).end();
      const type = fs.existsSync(file + ".type") ? fs.readFileSync(file + ".type", "utf8") : "application/octet-stream";
      const headers = { "Content-Type": type, "Content-Length": fs.statSync(file).size, "Cache-Control": "private, max-age=3600" };
      // ลิงก์ชั่วคราวของ S3 บอกชื่อไฟล์ตอนดาวน์โหลดผ่าน query — ทำตามให้ได้ชื่อไฟล์จริงเหมือนระบบจริง
      const disposition = params.get("response-content-disposition");
      if (disposition) headers["Content-Disposition"] = disposition;
      res.writeHead(200, headers);
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(405).end();
  })
  .listen(PORT, () => console.log(`file store :${PORT} → ${ROOT}`));
