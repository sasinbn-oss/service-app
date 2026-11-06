#!/usr/bin/env node
/*
 * ผู้ให้บริการแจ้งเตือนจำลอง (แทน FCM/Apple) สำหรับ tests/push-test.sh
 *
 *   node push-mock.js keys <ไฟล์>                 สร้างกุญแจของ "เบราว์เซอร์" หนึ่งเครื่อง (ECDH P-256 + auth) พิมพ์ {p256dh, auth}
 *   node push-mock.js serve <พอร์ต> <โฟลเดอร์กุญแจ> <ไฟล์บันทึก> <cert> <key>
 *       https เท่านั้น (web-push ส่งผ่าน https เสมอ) · /sub/<ชื่อ> ถอดรหัสด้วยกุญแจ <ชื่อ>.json แล้วจดลงไฟล์บันทึกทีละบรรทัด ตอบ 201
 *       /gone/<ชื่อ> ตอบ 410 (เครื่องเลิกสมัครแล้ว — เซิร์ฟเวอร์ต้องลบแถวนั้น)
 *
 * ถอดรหัสจริง (aes128gcm ด้วย http_ece ตัวเดียวกับที่ web-push ใช้) — ยืนยันว่าข้อความที่ส่งอ่านได้และตรง ไม่ใช่แค่ "มีคำขอมา"
 */
const fs = require("fs");
const https = require("https");
const path = require("path");
const crypto = require("crypto");
const ece = require(path.join(__dirname, "../../backend/node_modules/http_ece"));

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const [mode, ...args] = process.argv.slice(2);

if (mode === "keys") {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const out = { priv: b64u(ecdh.getPrivateKey()), p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) };
  fs.writeFileSync(args[0], JSON.stringify(out));
  console.log(JSON.stringify({ p256dh: out.p256dh, auth: out.auth }));
} else if (mode === "serve") {
  const [port, keyDir, logFile, cert, key] = args;
  https
    .createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, (req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const [, kind, name] = req.url.split("/");
        const entry = { kind, name, ttl: req.headers.ttl, urgency: req.headers.urgency, encoding: req.headers["content-encoding"] };
        if (kind === "sub") {
          try {
            const k = JSON.parse(fs.readFileSync(path.join(keyDir, `${name}.json`), "utf8"));
            const ecdh = crypto.createECDH("prime256v1");
            ecdh.setPrivateKey(Buffer.from(k.priv, "base64url"));
            const plain = ece.decrypt(Buffer.concat(chunks), { version: "aes128gcm", privateKey: ecdh, authSecret: Buffer.from(k.auth, "base64url") });
            entry.payload = JSON.parse(plain.toString("utf8"));
          } catch (e) {
            entry.error = String(e);
          }
        }
        fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
        res.writeHead(kind === "gone" ? 410 : 201);
        res.end();
      });
    })
    .listen(Number(port), () => console.log("ready"));
} else {
  console.error("ใช้: keys <ไฟล์> | serve <พอร์ต> <โฟลเดอร์กุญแจ> <ไฟล์บันทึก> <cert> <key>");
  process.exit(2);
}
