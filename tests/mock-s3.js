// ชั่วคราว: จำลอง S3 แบบ path-style เพื่อทดสอบ src/storage/fileStore.ts
const http = require("http");

const BUCKET = "service-app";
const objects = new Map();
const seen = [];

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const [rawPath, query = ""] = req.url.split("?");
    const full = decodeURIComponent(rawPath).replace(/^\/+/, "");
    seen.push(`${req.method} /${full}${query ? "?" + query.slice(0, 24) : ""}`);

    // path-style: ชื่อถังต้องอยู่หน้าสุดของ path เสมอ
    if (full !== BUCKET && !full.startsWith(BUCKET + "/")) {
      return res.writeHead(404).end();
    }
    const key = full === BUCKET ? "" : full.slice(BUCKET.length + 1);

    if (req.method === "GET" && query.includes("list-type=2")) {
      res
        .writeHead(200, { "Content-Type": "application/xml" })
        .end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${BUCKET}</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`
        );
    } else if (req.method === "PUT") {
      objects.set(key, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"x"' }).end();
    } else if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
    } else if (req.method === "GET") {
      const data = objects.get(key);
      if (!data) return res.writeHead(404).end();
      res.writeHead(200).end(data);
    } else {
      res.writeHead(400).end();
    }
  });
});

server.listen(9100, "127.0.0.1", async () => {
  console.log("mock s3 (path-style) on 9100");
});
