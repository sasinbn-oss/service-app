/**
 * Prints the decision tree rebuilt from a troubleshooting flowchart so it can be
 * checked against the original Excel before any of it is imported.
 *
 *   npm run preview:flow -- ./DryerTroubleshoot.xlsx
 *   npm run preview:flow -- ./DryerTroubleshoot.xlsx --topic 4
 */
import path from "path";
import fs from "fs";
import { readFlowchart, Flow, FlowNode } from "./excel-flowchart";

function printTree(flow: Flow) {
  const byKey = new Map(flow.nodes.map((n) => [n.key, n]));
  const seen = new Set<string>();

  const walk = (key: string | undefined, depth: number, prefix: string) => {
    if (!key) return;
    const node = byKey.get(key);
    if (!node) return;

    const indent = "  ".repeat(depth + 1);
    if (seen.has(key)) {
      console.log(`${indent}${prefix}↩ (กลับไปที่ "${node.text.slice(0, 40)}...")`);
      return;
    }
    seen.add(key);

    const num = node.stepNumber ? ` ${node.stepNumber}` : "";
    if (node.kind === "ACTION") {
      console.log(`${indent}${prefix}✔ ${node.text}`);
    } else {
      console.log(`${indent}${prefix}? ${node.text}${num}`);
      for (const w of node.warnings) console.log(`${indent}   ⚠ ${w}`);
      walk(node.yesKey, depth + 1, "ใช่ → ");
      walk(node.noKey, depth + 1, "ไม่ → ");
    }
  };

  walk(flow.rootKey, 0, "เริ่ม → ");

  const unreached = flow.nodes.filter((n) => !seen.has(n.key));
  if (unreached.length > 0) {
    console.log(`\n  กล่องที่เดินไปไม่ถึงจากจุดเริ่มต้น (${unreached.length}):`);
    for (const n of unreached.slice(0, 6)) {
      console.log(`    · [${n.kind === "QUESTION" ? "ถาม" : "ทำ"}] ${n.text.slice(0, 80)}`);
    }
    if (unreached.length > 6) console.log(`    ... และอีก ${unreached.length - 6} กล่อง`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const topicIndex = args.includes("--topic") ? Number(args[args.indexOf("--topic") + 1]) : null;

  if (!filePath) {
    console.error("Usage: npm run preview:flow -- <file.xlsx> [--topic <n>]");
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
  const actions = flows.reduce((n, f) => n + f.nodes.filter((x) => x.kind === "ACTION").length, 0);
  const resolved = flows.reduce(
    (n, f) => n + f.nodes.filter((x) => x.kind === "QUESTION" && x.yesKey && x.noKey).length,
    0
  );
  const images = flows.reduce((n, f) => n + f.images.length, 0);

  console.log(`\nไฟล์: ${path.resolve(filePath)}`);
  console.log(`\nสรุป`);
  console.log(`  หัวข้ออาการเสีย   : ${flows.length}`);
  console.log(`  กล่องคำถาม        : ${questions}`);
  console.log(`  กล่องวิธีแก้       : ${actions}`);
  console.log(`  รูปวงจรที่แนบได้   : ${images}`);
  console.log(
    `  คำถามที่ครบทั้ง 2 ทาง: ${resolved}/${questions}` +
      ` (${questions ? Math.round((resolved / questions) * 100) : 0}%)`
  );

  console.log(`\n${"=".repeat(72)}`);
  console.log("รายการหัวข้อ  (ความครบถ้วนของเส้นทาง)");
  console.log("=".repeat(72));
  flows.forEach((flow, i) => {
    const q = flow.nodes.filter((n) => n.kind === "QUESTION").length;
    const pct = Math.round(flow.confidence * 100);
    const flag = pct === 100 ? "✔" : pct >= 80 ? " " : "⚠";
    console.log(
      `${flag} ${String(i + 1).padStart(2)}. ${flow.title.slice(0, 46).padEnd(48)}` +
        `${String(q).padStart(3)} คำถาม  ${String(pct).padStart(3)}%  ${flow.images.length} รูป`
    );
  });

  const shown = topicIndex ? [flows[topicIndex - 1]].filter(Boolean) : flows.slice(0, 2);
  console.log(`\n${"=".repeat(72)}`);
  console.log(
    topicIndex ? `รายละเอียดหัวข้อที่ ${topicIndex}` : "ตัวอย่าง 2 หัวข้อแรก (ใช้ --topic <n> เพื่อดูหัวข้ออื่น)"
  );
  console.log("=".repeat(72));

  for (const flow of shown) {
    console.log(`\n■ ${flow.title}   (แถว ${flow.startRow}-${flow.endRow})`);
    for (const note of flow.notes) console.log(`  ${note}`);
    if (flow.images.length > 0) console.log(`  รูปวงจรแนบ: ${flow.images.length} รูป`);
    for (const w of flow.warnings) console.log(`  ⚠ ${w}`);
    console.log();
    printTree(flow);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("── โหมดตรวจสอบเท่านั้น ยังไม่ได้บันทึกอะไรลงฐานข้อมูล ──");
}

main().catch((e) => {
  console.error("\nเกิดข้อผิดพลาด:", e instanceof Error ? e.message : e);
  process.exit(1);
});
