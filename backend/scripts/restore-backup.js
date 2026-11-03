/**
 * กู้คืนข้อมูลจากไฟล์สำรอง (.json.gz จากหน้า "สำรองข้อมูล") ลงฐานข้อมูลที่ "ว่าง"
 *
 *   cd backend
 *   node_modules/.bin/prisma migrate deploy        # สร้างตารางในฐานข้อมูลใหม่ก่อน
 *   node scripts/restore-backup.js OTTERI-backup-2026-10-16-1700.json.gz --yes
 *
 * ⛔ ยอมรันเฉพาะฐานข้อมูลที่ยังไม่มีข้อมูลเลย — ใช้กู้ลงฐานข้อมูลใหม่ ไม่ใช่เขียนทับของที่ใช้งานอยู่
 *    (ของจริงที่หายได้คือทั้งบริษัท ดู CLAUDE.md หัวข้อคำสั่งที่ลบข้อมูล) เช็ค DATABASE_URL ใน .env ก่อนรันเสมอ
 *
 * ไม่มีในไฟล์: Fleet Card / Easy Pass (เจ้าของงานเลือกไม่ใส่) — นำเข้าไฟล์รถซ้ำหลังกู้คืน
 * รูป/วิดีโอหน้างานอยู่ในที่เก็บไฟล์ ไม่ได้อยู่ในไฟล์นี้ — กู้ลงฐานข้อมูลใหม่แต่ใช้ที่เก็บไฟล์เดิม ลิงก์รูปจะใช้ได้ตามเดิม
 */
const fs = require("fs");
const path = require("path");
const { gunzipSync } = require("zlib");
const { PrismaClient, Prisma } = require("@prisma/client");

const FORMAT = "otteri-backup";
// ตารางที่ migration ใส่ค่าเริ่มต้นให้เอง ฐานข้อมูลที่เพิ่ง migrate จึงไม่ว่างจริง — ล้างแล้วใช้ของในไฟล์แทน
// (ยอมเฉพาะเมื่อตารางอื่นว่างทั้งหมด ซึ่งแปลว่าเป็นฐานข้อมูลใหม่แน่ ๆ)
// OutsourceTeam ตามมาทีหลัง (20261108 ใส่ทีม outsource ตั้งต้น) — ลืมใส่ตรงนี้แล้วกู้คืนลงฐานใหม่ไม่ได้เลย
// เจอ ต.ค. 69 ตอนลองกู้ลงฐานใหม่ · migration ใหม่ที่ INSERT ลงตารางเปล่าต้องเพิ่มชื่อที่นี่ด้วย
// AppSetting ใส่แถวตั้งต้นโดย 20261210090000_dispatch_cutoff — แถวในไฟล์ต้องมาแทน ไม่ใช่แถวที่ migrate เพิ่งใส่
// เพราะ createdAt ของแถวแรกคือวันที่เริ่มใช้เวลาปิดรับปล่อยงาน ใช้แถวใหม่แล้วใบที่ล็อกอยู่จะกลายเป็นไม่ล็อก
// SparePartBrandFile: 20261211090000_parts_pick ใส่แถวตั้งต้นจากช่องยี่ห้อของอะไหล่ — ฐานใหม่ไม่มีอะไหล่จึงได้ 0 แถว
// แต่ใส่ชื่อไว้ตามกติกา ให้การกู้ไฟล์ที่มีตารางนี้ไม่ต้องพึ่งข้อนั้น (ไฟล์ที่ทำก่อนมีตารางนี้ ดู REPLAY_IF_DUMP_PREDATES)
const SEEDED_BY_MIGRATION = new Set(["TeamGroup", "OutsourceTeam", "AppSetting", "SparePartBrandFile"]);

// ข้อมูลที่ migration "คำนวณจากข้อมูลเดิม" ไม่ใช่ค่าตั้งต้นคงที่ — ตอน migrate ฐานใหม่ตารางต้นทางยังว่าง คำสั่งพวกนี้จึงได้ 0 แถว
// ไฟล์สำรองที่ทำหลัง migration นั้นมีผลลัพธ์อยู่ในไฟล์แล้ว แต่ไฟล์ที่ทำก่อน (เช่นไฟล์ที่กดสำรองไว้ก่อน deploy แล้ว deploy พัง)
// ไม่มี — ไม่รันซ้ำหลังใส่ข้อมูล ได้ฐานที่ "กู้ครบ" แต่ใช้งานไม่ได้เงียบ ๆ
// 20261211090000_parts_pick: ไม่มีแถวใน SparePartBrandFile = อะไหล่ทุกตัว "ไม่อยู่ในไฟล์ไหน" ช่างเลือกอะไหล่ไม่ได้ทั้งระบบ
//   จนกว่าแอดมินจะอัปโหลดครบ 6 ไฟล์ และหัวช่องเลือกอะไหล่ไม่มีวันที่อัปเดต (SparePartImport.brandFile ว่างหมด)
// อ่านคำสั่งจากไฟล์ migration ตรง ๆ ไม่ลอกมาไว้ที่นี่ — สองชุดวันหนึ่งจะไม่ตรงกัน (ไฟล์ migration ที่ขึ้นระบบแล้วแก้ไม่ได้อยู่แล้ว)
// ระบุด้วยคำขึ้นต้นของคำสั่ง แล้วตัดถึง ; ตัวแรก — คำสั่งพวกนี้ไม่มี ; อยู่ข้างใน
const REPLAY_IF_DUMP_PREDATES = [
  {
    migration: "20261211090000_parts_pick",
    statements: ['INSERT INTO "SparePartBrandFile"', 'UPDATE "SparePartImport"'],
    label: (n) => `SparePartBrandFile: เติมจากช่องยี่ห้อ ${n[0]} แถว · SparePartImport: ไฟล์ยี่ห้อจากชื่อไฟล์ ${n[1]} แถว`,
  },
];

function migrationStatements(name, starts) {
  const text = fs.readFileSync(path.join(__dirname, "..", "prisma", "migrations", name, "migration.sql"), "utf8");
  return starts.map((start) => {
    const i = text.indexOf(start);
    const j = i < 0 ? -1 : text.indexOf(";", i);
    if (j < 0) throw new Error(`หาคำสั่ง ${start} ในไฟล์ migration ${name} ไม่เจอ — ยังไม่ได้เขียนอะไรลงฐานข้อมูล`);
    return text.slice(i, j + 1);
  });
}

async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) throw new Error("ใส่ชื่อไฟล์สำรอง: node scripts/restore-backup.js <ไฟล์.json.gz> --yes");
  const dump = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
  if (dump.format !== FORMAT) throw new Error("ไม่ใช่ไฟล์สำรองของ OTTERI");

  const prisma = new PrismaClient();
  try {
    // โครงสร้างตารางต้องใหม่เท่ากับตอนสำรอง — ไม่งั้นช่องที่ไฟล์มีแต่ตารางยังไม่มีจะหาย
    const applied = new Set(
      (await prisma.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).map(
        (r) => r.migration_name
      )
    );
    const missing = (dump.migrations || []).filter((m) => !applied.has(m));
    if (missing.length) throw new Error(`ฐานข้อมูลนี้ยังขาด migration ${missing.length} ชุด — รัน prisma migrate deploy ก่อน`);
    // อ่านคำสั่งที่ต้องรันซ้ำให้ครบก่อนเขียนอะไร — หาไม่เจอแล้วล้มกลางทางจะเหลือฐานที่กู้ไปครึ่งเดียว
    const dumpMigrations = new Set(dump.migrations || []);
    const replays = REPLAY_IF_DUMP_PREDATES.filter((r) => applied.has(r.migration) && !dumpMigrations.has(r.migration)).map(
      (r) => ({ ...r, sql: migrationStatements(r.migration, r.statements) })
    );

    const models = Prisma.dmmf.datamodel.models.filter((m) => dump.tables[m.name]);
    const table = (m) => `"${m.dbName || m.name}"`;
    for (const m of models) {
      if (SEEDED_BY_MIGRATION.has(m.name)) continue;
      const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM ${table(m)}`);
      if (n > 0) throw new Error(`ตาราง ${m.name} มีข้อมูลอยู่แล้ว ${n} แถว — กู้คืนได้เฉพาะฐานข้อมูลที่ว่าง`);
    }
    if (flag !== "--yes") {
      const rows = models.reduce((s, m) => s + dump.tables[m.name].length, 0);
      console.log(`ไฟล์สำรองเมื่อ ${dump.createdAt} · ${models.length} ตาราง · ${rows} แถว`);
      for (const r of replays) console.log(`ไฟล์นี้ทำก่อน ${r.migration} — หลังกู้จะรันส่วนที่คำนวณจากข้อมูลเดิมของ migration นั้นซ้ำให้`);
      console.log("ตรวจแล้วใส่ --yes ต่อท้ายเพื่อกู้คืนจริง");
      return;
    }

    // ลำดับ: ตารางที่ถูกอ้างถึงก่อน (สาขาก่อนใบงาน ใบงานก่อนประวัติ) — ความสัมพันธ์กับตัวเอง (ใบรออะไหล่ → ใบเดิม)
    // ใส่เป็นว่างไว้ก่อน แล้วค่อยเติมหลังใส่ครบทั้งตาราง
    const deps = new Map(
      models.map((m) => [
        m.name,
        m.fields.filter((f) => f.kind === "object" && f.relationFromFields?.length && f.type !== m.name).map((f) => f.type),
      ])
    );
    const order = [];
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const d of deps.get(name) || []) if (deps.has(d)) visit(d);
      order.push(name);
    };
    models.forEach((m) => visit(m.name));

    const byName = new Map(models.map((m) => [m.name, m]));
    for (const name of order) {
      const m = byName.get(name);
      const fields = new Map(m.fields.filter((f) => f.kind !== "object").map((f) => [f.name, f]));
      const selfKeys = m.fields
        .filter((f) => f.kind === "object" && f.type === m.name && f.relationFromFields?.length)
        .flatMap((f) => f.relationFromFields);
      const rows = dump.tables[name].map((r) => {
        const out = {};
        for (const [k, v] of Object.entries(r)) {
          const f = fields.get(k);
          if (!f) continue; // ช่องที่ตารางรุ่นนี้ไม่มีแล้ว
          if (selfKeys.includes(k)) out[k] = null;
          else if (v === null) out[k] = f.type === "Json" ? Prisma.DbNull : null;
          else if (f.type === "DateTime") out[k] = new Date(v);
          else if (f.type === "Bytes") out[k] = Buffer.from(v.$bytes, "base64");
          else out[k] = v;
        }
        return out;
      });
      const d = prisma[name[0].toLowerCase() + name.slice(1)];
      if (SEEDED_BY_MIGRATION.has(name)) await d.deleteMany({});
      for (let i = 0; i < rows.length; i += 500) await d.createMany({ data: rows.slice(i, i + 500) });
      for (const r of dump.tables[name]) {
        const set = Object.fromEntries(selfKeys.filter((k) => r[k] !== null && r[k] !== undefined).map((k) => [k, r[k]]));
        if (Object.keys(set).length) await d.update({ where: { id: r.id }, data: set });
      }
      // เลข id ถัดไปต้องต่อจากของเดิม ไม่งั้นแถวใหม่แถวแรกชน id ที่กู้กลับมา
      if (m.fields.some((f) => f.name === "id" && f.default?.name === "autoincrement")) {
        await prisma.$executeRawUnsafe(
          `SELECT setval(pg_get_serial_sequence('${table(m)}','id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM ${table(m)}`
        );
      }
      console.log(`${name}: ${rows.length}`);
    }
    for (const r of replays) {
      const n = [];
      for (const q of r.sql) n.push(await prisma.$executeRawUnsafe(q));
      console.log(`${r.label(n)} (ไฟล์สำรองทำก่อน ${r.migration})`);
    }
    console.log("กู้คืนเสร็จ — นำเข้าไฟล์รถซ้ำเพื่อเติม Fleet Card / Easy Pass");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
