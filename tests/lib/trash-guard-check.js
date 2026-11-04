// ตัวกันถังขยะ (trashGuard · backend/src/utils/trash.ts) กับฐานข้อมูลที่บังคับให้พัง/บังคับคำตอบ — รันจาก tests/trash-guard-test.sh
//
// ทำไมไม่ยิงเซิร์ฟเวอร์จริงแบบเทสต์อื่น: ต้องทำให้ฐานข้อมูลพังเฉพาะคำถามของตัวกัน (เซิร์ฟเวอร์จริงทำไม่ได้โดยไม่ดับฐานข้อมูล
// ที่ทุกคนใช้อยู่) และต้องดูว่าโปรเซสยังอยู่ไหม — ตัวนี้โหลด trash.ts ตัวจริงกับ Express/express-async-errors ของ backend
// (ลำดับเดียวกับ index.ts) แทนที่คำถาม Prisma สองตัวที่ตัวกันใช้ แล้วยิงคำขอเดียว · หนึ่งโปรเซสต่อหนึ่งกรณี (รายชื่อที่จำไว้อยู่ในโปรเซส)
//
// argv: <backend dir> <กรณี> · พิมพ์ RESULT <http> <body> · body ของเส้นทาง = {"reached":true} (ตัวกันปล่อยผ่าน)
// พิมพ์ CALLS findMany=<n> findUnique=<n> — ดูว่าคำขออ่านไม่เสียรอบถามแถวจริงเพิ่ม
const path = require("path");
const { createRequire } = require("module");
const backend = path.resolve(process.argv[2]);
const kase = process.argv[3];
const req = createRequire(path.join(backend, "package.json"));
process.chdir(backend);
req("dotenv").config({ quiet: true });
req("ts-node").register({ transpileOnly: true, project: path.join(backend, "tsconfig.json") });
req("express-async-errors"); // ลำดับเดียวกับ index.ts — แพตช์ก่อนสร้าง Router
const express = req("express");
const { trashGuard } = req("./src/utils/trash.ts");
const { prisma } = req("./src/prisma.ts");
const { signToken } = req("./src/utils/jwt.ts");

const ID = 42;
let calls = { findMany: 0, findUnique: 0 };
// listed = รายชื่อที่โหลดได้ (ใบในถัง) · row = แถวจริงตอนถาม (deletedAt) · fail = ฐานข้อมูลพัง
const C = {
  dbDownRead: { fail: true, method: "GET" },
  dbDownWrite: { fail: true, method: "POST" },
  throwWhileAnswering: { listed: [ID], row: new Date(), method: "GET", breakStatus: true },
  trashedRead: { listed: [ID], row: new Date(), method: "GET" },
  restoredElsewhere: { listed: [ID], row: null, method: "GET" },
  trashedElsewhereWrite: { listed: [], row: new Date(), method: "POST" },
  aliveRead: { listed: [], row: null, method: "GET" },
}[kase];
if (!C) {
  console.log(`RESULT bad-case ${kase}`);
  process.exit(2);
}
prisma.workOrder.findMany = async () => {
  calls.findMany += 1;
  if (C.fail) throw new Error("บังคับให้ฐานข้อมูลพัง (findMany)");
  return C.listed.map((id) => ({ id }));
};
prisma.workOrder.findUnique = async () => {
  calls.findUnique += 1;
  if (C.fail) throw new Error("บังคับให้ฐานข้อมูลพัง (findUnique)");
  return { deletedAt: C.row };
};

let unhandled = null;
process.on("unhandledRejection", (e) => {
  // ไม่ปล่อยให้ Node ฆ่าโปรเซส — จดไว้แล้วรายงานเป็นผลของกรณีนี้ (ของจริงไม่มีตัวจับนี้ = exit 1)
  unhandled = e;
});

const app = express();
app.use((rq, rs, nx) => {
  if (C.breakStatus) {
    // คำตอบ 404 ของตัวกันโยน (เช่นมีคนตอบไปแล้ว) — ครั้งแรกเท่านั้น ตัวจัดการ error ยังตอบได้ตามปกติ
    const real = rs.status.bind(rs);
    let first = true;
    rs.status = (c) => {
      if (first) {
        first = false;
        throw new Error("บังคับให้พังระหว่างตอบ 404");
      }
      return real(c);
    };
  }
  nx();
});
const router = express.Router();
router.param("id", trashGuard);
router.get("/:id", (rq, rs) => rs.json({ reached: true }));
router.post("/:id", (rq, rs) => rs.json({ reached: true }));
app.use("/api/work-orders", router);
// ตัวเดียวกับท้าย index.ts
app.use((err, rq, rs, _n) => {
  if (rs.headersSent) return;
  rs.status(500).json({ error: "เซิร์ฟเวอร์ทำรายการนี้ไม่สำเร็จ — แจ้งแอดมินให้ดู log ของเซิร์ฟเวอร์" });
});
const srv = app.listen(0, "127.0.0.1", async () => {
  const tok = signToken({ userId: 1, role: "ADMIN" });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  let out;
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/work-orders/${ID}`, {
      method: C.method,
      headers: { Authorization: `Bearer ${tok}` },
      signal: ac.signal,
    });
    out = `${r.status} ${await r.text()}`;
  } catch (e) {
    out = `HANG ${e.name}`;
  }
  clearTimeout(t);
  // ให้ promise ที่ค้างได้จบก่อนสรุปว่าไม่มีอะไรหลุด
  await new Promise((ok) => setTimeout(ok, 100));
  console.log(`RESULT ${out}`);
  console.log(`CALLS findMany=${calls.findMany} findUnique=${calls.findUnique}`);
  console.log(`UNHANDLED ${unhandled ? unhandled.message : "none"}`);
  srv.close();
  process.exit(0);
});
