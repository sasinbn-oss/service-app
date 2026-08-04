/**
 * Explains why the flowchart reader could not resolve a branch, so the matching
 * rules can be improved from evidence instead of guesswork.
 *
 *   npx ts-node scripts/diagnose-flowchart.ts <file.xlsx>
 */
import fs from "fs";
import { readFlowchart } from "./excel-flowchart";

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Usage: ts-node scripts/diagnose-flowchart.ts <file.xlsx>");
    process.exit(1);
  }

  const flows = await readFlowchart(filePath);
  const unresolved = flows.flatMap((flow) =>
    flow.nodes
      .filter((n) => n.kind === "QUESTION" && (!n.yesKey || !n.noKey))
      .map((n) => ({ flow: flow.title, node: n }))
  );

  console.log(`คำถามที่เส้นทางยังไม่ครบ: ${unresolved.length}\n`);

  const reasons = new Map<string, number>();
  for (const { flow, node } of unresolved) {
    const missing = !node.yesKey && !node.noKey ? "ขาดทั้งสองทาง" : !node.yesKey ? 'ขาดทาง "ใช่"' : 'ขาดทาง "ไม่"';
    // otherKeys holds targets reached by an arrow that carried no ใช่/ไม่ label.
    const reason =
      node.otherKeys.length === 0
        ? `${missing} · ไม่มีลูกศรเหลือให้จับคู่`
        : `${missing} · มีลูกศรไม่มีป้าย ${node.otherKeys.length} เส้น`;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    console.log(`  [${flow.slice(0, 28)}] ${reason}`);
    console.log(`     ${node.text.slice(0, 78)}`);
  }

  console.log("\nสรุปสาเหตุ:");
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} × ${reason}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
