/**
 * Imports troubleshooting flowcharts from Excel into the interactive
 * diagnostic trees the app serves.
 *
 *   npm run preview:flow  -- ./DryerTroubleshoot.xlsx     # inspect first
 *   npm run import:flow   -- ./DryerTroubleshoot.xlsx --yes
 *   npm run import:flow   -- ./file.xlsx --yes --machine "เครื่องอบ"
 *
 * A flow is matched on its title, so re-importing an edited workbook replaces
 * that flow's nodes rather than creating a duplicate. Branches the reader could
 * not resolve are imported with the branch left empty; the app marks those
 * flows as incomplete and an admin fills them in.
 */
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { readFlowchart, Flow } from "./excel-flowchart";

const prisma = new PrismaClient();

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function countIncomplete(flow: Flow): number {
  return flow.nodes.filter((n) => n.kind === "QUESTION" && (!n.yesKey || !n.noKey)).length;
}

async function importFlow(
  flow: Flow,
  order: number,
  machineType: string | undefined,
  sourceFile: string,
  zip: JSZip
) {
  const existing = await prisma.troubleshootFlow.findFirst({ where: { title: flow.title } });

  // Replacing the whole node set keeps re-imports clean: stale nodes from a
  // previous version of the chart cannot linger and be reachable.
  if (existing) {
    await prisma.troubleshootNode.deleteMany({ where: { flowId: existing.id } });
    await prisma.troubleshootImage.deleteMany({ where: { flowId: existing.id } });
  }

  const record = existing
    ? await prisma.troubleshootFlow.update({
        where: { id: existing.id },
        data: {
          notes: flow.notes.join("\n") || null,
          rootKey: flow.rootKey ?? null,
          machineType,
          sourceFile,
          order,
        },
      })
    : await prisma.troubleshootFlow.create({
        data: {
          title: flow.title,
          notes: flow.notes.join("\n") || null,
          rootKey: flow.rootKey ?? null,
          machineType,
          sourceFile,
          order,
        },
      });

  await prisma.troubleshootNode.createMany({
    data: flow.nodes.map((node, i) => ({
      flowId: record.id,
      key: node.key,
      kind: node.kind,
      text: node.text,
      stepNumber: node.stepNumber ?? null,
      yesKey: node.yesKey ?? null,
      noKey: node.noKey ?? null,
      order: i,
    })),
  });

  let imageCount = 0;
  for (const [i, image] of flow.images.entries()) {
    const file = zip.file(image.mediaPath);
    if (!file) continue;
    const ext = image.mediaPath.split(".").pop()?.toLowerCase() ?? "png";
    await prisma.troubleshootImage.create({
      data: {
        flowId: record.id,
        mimeType: MIME_BY_EXT[ext] ?? "image/png",
        data: await file.async("nodebuffer"),
        order: i,
      },
    });
    imageCount++;
  }

  return { created: !existing, nodes: flow.nodes.length, images: imageCount };
}

async function main() {
  const argv = process.argv.slice(2);
  let filePath: string | undefined;
  let commit = false;
  let machineType: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes") commit = true;
    else if (arg === "--machine") machineType = argv[++i];
    else if (!arg.startsWith("--") && !filePath) filePath = arg;
  }

  if (!filePath) {
    console.error("Usage: npm run import:flow -- <file.xlsx> [--yes] [--machine <ชื่อเครื่อง>]");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`ไม่พบไฟล์: ${path.resolve(filePath)}`);
    process.exit(1);
  }

  const flows = await readFlowchart(filePath);
  const questions = flows.reduce(
    (n, f) => n + f.nodes.filter((x) => x.kind === "QUESTION").length,
    0
  );
  const incomplete = flows.reduce((n, f) => n + countIncomplete(f), 0);

  console.log(`\nไฟล์: ${path.resolve(filePath)}`);
  console.log(`  หัวข้อ ${flows.length} หัวข้อ, คำถาม ${questions} ข้อ`);
  console.log(
    `  คำถามที่เส้นทางครบ: ${questions - incomplete}/${questions}` +
      ` (${questions ? Math.round(((questions - incomplete) / questions) * 100) : 0}%)`
  );
  if (incomplete > 0) {
    console.log(`  ⚠ อีก ${incomplete} ข้อยังขาดเส้นทาง ต้องเข้าไปเติมในเมนูแอดมิน`);
  }

  if (!commit) {
    console.log(
      "\n── โหมดตรวจสอบ ยังไม่ได้บันทึกลงฐานข้อมูล ──\n" +
        "ดูรายละเอียดผังด้วย  npm run preview:flow -- <ไฟล์>\n" +
        "ถ้าถูกต้องแล้วให้รันใหม่โดยเติม --yes ต่อท้าย"
    );
    return;
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const sourceFile = path.basename(filePath);

  let created = 0;
  let updated = 0;
  let images = 0;
  for (const [i, flow] of flows.entries()) {
    const result = await importFlow(flow, i, machineType, sourceFile, zip);
    if (result.created) created++;
    else updated++;
    images += result.images;
    console.log(
      `  ${result.created ? "เพิ่ม " : "อัปเดต"} ${flow.title.slice(0, 50)}` +
        `  (${result.nodes} กล่อง, ${result.images} รูป)`
    );
  }

  console.log(`\nบันทึกแล้ว: เพิ่มใหม่ ${created} หัวข้อ, อัปเดต ${updated} หัวข้อ, รูป ${images} รูป`);
  if (incomplete > 0) {
    console.log(`อย่าลืมเข้าไปเติมเส้นทางที่ขาด ${incomplete} จุด ในเมนู "ตรวจสอบผังวินิจฉัย"`);
  }
}

main()
  .catch((e) => {
    console.error("\nเกิดข้อผิดพลาด:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
