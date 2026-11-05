// พร็อกซี TCP หน่วงเวลา — จำลองฐานข้อมูล/ที่เก็บไฟล์ที่อยู่คนละ region (ของจริง: ไปกลับ ~0.23 วิ ทุกคำสั่ง)
// เครื่องพัฒนาไปกลับไม่ถึง 1 ms งานที่วนเป็นร้อยแถวจึงผ่านที่นี่แต่ชนเพดานบนของจริง (นำเข้าใบแจ้งซ่อม 5 พ.ย. 69)
// ใช้: LISTEN=5499 TARGET=5432 LAG=115 node tests/lag-proxy.js   (LAG = มิลลิวินาทีต่อทิศ · คงลำดับข้อมูล)
// แล้วรัน backend ตัวที่สองที่ DATABASE_URL ชี้ :5499 (และ STORAGE_ENDPOINT ชี้พร็อกซีอีกตัวหน้า tests/mock-s3.js) — ดู tests/README.md
const net = require("net");
const ONE_WAY = Number(process.env.LAG ?? 115);
const LISTEN = Number(process.env.LISTEN ?? 5499);
const TARGET = Number(process.env.TARGET ?? 5432);
net
  .createServer((c) => {
    const s = net.connect(TARGET, "127.0.0.1");
    const pipe = (from, to) => from.on("data", (d) => setTimeout(() => to.write(d), ONE_WAY));
    pipe(c, s);
    pipe(s, c);
    const close = () => {
      c.destroy();
      s.destroy();
    };
    c.on("error", close);
    s.on("error", close);
    c.on("close", close);
    s.on("close", close);
  })
  .listen(LISTEN, () => console.log(`lag proxy ${LISTEN} → ${TARGET} (${ONE_WAY} ms ต่อทิศ)`));
