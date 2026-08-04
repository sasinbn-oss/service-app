/**
 * Reads a troubleshooting flowchart drawn in Excel and rebuilds it as a
 * decision tree.
 *
 * The source is a drawing, not a table. Excel records almost no logical
 * connections between the arrows and the boxes they visually join
 * (stCxn/endCxn are absent), so the graph has to be recovered geometrically.
 * That is reliable here because every shape and every connector carries
 * absolute EMU coordinates: an arrow's tail identifies the box it leaves and
 * its head the box it enters, and the ใช่/ไม่ labels sit in worksheet cells
 * beside the arrow they belong to.
 *
 * Anything that cannot be resolved confidently is reported as a warning rather
 * than guessed at, so a human can check it before technicians rely on it.
 */
import JSZip from "jszip";
import fs from "fs";

export type NodeKind = "QUESTION" | "ACTION";
export type Answer = "YES" | "NO";

export interface FlowNode {
  key: string;
  kind: NodeKind;
  text: string;
  /** Marker such as "(1)" cross-referencing the wiring diagrams. */
  stepNumber?: string;
  yesKey?: string;
  noKey?: string;
  /** Targets reached by an unlabelled arrow, kept so nothing is silently lost. */
  otherKeys: string[];
  warnings: string[];
}

export interface FlowImage {
  mediaPath: string;
  bytes: number;
  row: number;
}

export interface Flow {
  title: string;
  notes: string[];
  rootKey?: string;
  nodes: FlowNode[];
  images: FlowImage[];
  warnings: string[];
  startRow: number;
  endRow: number;
  /** Share of question nodes with both answers resolved. */
  confidence: number;
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Shape {
  key: string;
  rect: Rect;
  row: number;
  text: string;
}

interface Arrow {
  start: { x: number; y: number };
  end: { x: number; y: number };
  row: number;
  /** Grid extent, used to attach the ใช่/ไม่ cell sitting beside the line. */
  grid: { col1: number; row1: number; col2: number; row2: number };
  answer?: Answer;
}

interface Cell {
  row: number;
  col: number;
  colOff: number;
  style: number;
  text: string;
}

interface Label {
  answer: Answer;
  col: number;
  row: number;
}

const HEADING_STYLES = new Set([2, 4, 7, 10]);
const MIN_DIAGRAM_BYTES = 20_000;
const QUESTION_ENDINGS = ["หรือไม่", "หรือไม", "หรือเปล่า", "ไหม", "?"];
const STEP_NUMBER_RE = /^\(\s*[0-9]+[a-z]?(\s*,\s*[0-9]+[a-z]?)*\s*\)$/;
const NAVIGATION_RE = /^(ต่อหน้าถัดไป|ต่อจากหน้าที่ผ่านมา)$/;

/** An arrow tip this close to a box (in EMU) is touching it. */
const ENDPOINT_TOLERANCE = 400_000;
/** Wider reach used only to repair a branch the strict pass left open. */
const RELAXED_ENDPOINT_TOLERANCE = 1_000_000;
/** Marker "(1)" this far from a box (EMU) still belongs to it. */
const MARKER_TOLERANCE = 700_000;
/** Columns are far wider than rows are tall, so weight them when measuring. */
const COLUMN_WEIGHT = 3;
/** Grid distance beyond which a ใช่/ไม่ cell cannot belong to an arrow. */
const LABEL_GRID_TOLERANCE = 6;

function columnToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const isQuestion = (t: string) => QUESTION_ENDINGS.some((e) => t.trim().endsWith(e));

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x1 - px, 0, px - r.x2);
  const dy = Math.max(r.y1 - py, 0, py - r.y2);
  return Math.hypot(dx, dy);
}

function parseSharedStrings(xml: string): string[] {
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) =>
    decodeXml(
      Array.from(m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g))
        .map((t) => t[1])
        .join("")
    )
  );
}

function parseCells(sheetXml: string, shared: string[]): Cell[] {
  const cells: Cell[] = [];
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const [, letters, rowStr, attrs, body] = m;
    const value = body.match(/<v>([^<]*)<\/v>/);
    if (!value) continue;
    const text = /\bt="s"/.test(attrs) ? shared[Number(value[1])] ?? "" : value[1];
    if (!text.trim()) continue;
    cells.push({
      row: Number(rowStr),
      col: columnToIndex(letters),
      colOff: 0,
      style: Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0),
      text: collapse(text),
    });
  }
  return cells;
}

interface AnchorPos {
  col: number;
  colOff: number;
  row: number;
  rowOff: number;
}

function readAnchor(block: string, tag: "from" | "to"): AnchorPos | null {
  const m = block.match(new RegExp(`<xdr:${tag}>([\\s\\S]*?)</xdr:${tag}>`));
  if (!m) return null;
  const read = (t: string) =>
    Number(m[1].match(new RegExp(`<xdr:${t}>(-?\\d+)</xdr:${t}>`))?.[1] ?? 0);
  return { col: read("col"), colOff: read("colOff"), row: read("row") + 1, rowOff: read("rowOff") };
}

function readTransform(block: string) {
  const off = block.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/);
  const ext = block.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
  if (!off || !ext) return null;
  return { x: Number(off[1]), y: Number(off[2]), cx: Number(ext[1]), cy: Number(ext[2]) };
}

/** Shortest distance from a point to a segment, both on the weighted grid. */
function gridDistanceToSegment(
  point: { col: number; row: number },
  seg: { col1: number; row1: number; col2: number; row2: number }
): number {
  const px = point.col * COLUMN_WEIGHT;
  const py = point.row;
  const ax = seg.col1 * COLUMN_WEIGHT;
  const ay = seg.row1;
  const dx = seg.col2 * COLUMN_WEIGHT - ax;
  const dy = seg.row2 - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Each ใช่/ไม่ cell labels exactly one arrow. Claiming the nearest arrow for
 * each label in ascending distance order keeps that one-to-one, where letting
 * every arrow grab its nearest label would let one label serve several arrows.
 */
function assignLabelsToArrows(arrows: Arrow[], labels: Label[]) {
  const pairs: { label: Label; arrow: Arrow; d: number }[] = [];
  for (const label of labels) {
    for (const arrow of arrows) {
      const d = gridDistanceToSegment(label, arrow.grid);
      if (d <= LABEL_GRID_TOLERANCE) pairs.push({ label, arrow, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const usedLabels = new Set<Label>();
  for (const pair of pairs) {
    if (usedLabels.has(pair.label) || pair.arrow.answer) continue;
    pair.arrow.answer = pair.label.answer;
    usedLabels.add(pair.label);
  }
}

export async function readFlowchart(filePath: string): Promise<Flow[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const readText = async (name: string) => (await zip.file(name)?.async("text")) ?? "";

  const shared = parseSharedStrings(await readText("xl/sharedStrings.xml"));
  const cells = parseCells(await readText("xl/worksheets/sheet1.xml"), shared);
  const drawing = await readText("xl/drawings/drawing1.xml");
  const rels = await readText("xl/drawings/_rels/drawing1.xml.rels");

  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\s+([^>]*)\/>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1];
    const target = m[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTargets.set(id, target);
  }

  const shapes: Shape[] = [];
  const arrows: Arrow[] = [];
  const images: FlowImage[] = [];
  let shapeIndex = 0;

  for (const m of drawing.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
    const block = m[0];
    const from = readAnchor(block, "from");
    if (!from) continue;

    if (/<xdr:pic[\s>]/.test(block)) {
      const embed = block.match(/r:embed="([^"]+)"/)?.[1];
      const target = embed ? relTargets.get(embed) : undefined;
      if (!target) continue;
      const mediaPath = `xl/${target.replace(/^\.\.\//, "")}`;
      const file = zip.file(mediaPath);
      if (!file) continue;
      // @ts-expect-error JSZip keeps the uncompressed size on the internal entry.
      const bytes: number = file._data?.uncompressedSize ?? 0;
      images.push({ mediaPath, bytes, row: from.row });
      continue;
    }

    const xf = readTransform(block);
    if (!xf) continue;

    if (/<xdr:cxnSp[\s>]/.test(block)) {
      // A connector's box holds the line diagonally; the flip flags say which
      // corner it starts from, and the arrowhead is always at the far end.
      const flipH = /flipH="1"/.test(block);
      const flipV = /flipV="1"/.test(block);
      const to = readAnchor(block, "to");
      arrows.push({
        start: { x: flipH ? xf.x + xf.cx : xf.x, y: flipV ? xf.y + xf.cy : xf.y },
        end: { x: flipH ? xf.x : xf.x + xf.cx, y: flipV ? xf.y : xf.y + xf.cy },
        row: from.row,
        grid: {
          col1: from.col,
          row1: from.row,
          col2: to?.col ?? from.col,
          row2: to?.row ?? from.row,
        },
      });
      continue;
    }
    if (!/<xdr:sp[\s>]/.test(block)) continue;

    const text = collapse(
      Array.from(block.matchAll(/<a:t>([^<]*)<\/a:t>/g))
        .map((t) => decodeXml(t[1]))
        .join(" ")
    );
    if (!text) continue;
    shapes.push({
      key: `n${shapeIndex++}`,
      rect: { x1: xf.x, y1: xf.y, x2: xf.x + xf.cx, y2: xf.y + xf.cy },
      row: from.row,
      text,
    });
  }

  const labels: Label[] = cells
    .filter((c) => c.text === "ใช่" || c.text === "ไม่")
    .map((c) => ({ answer: c.text === "ใช่" ? ("YES" as Answer) : ("NO" as Answer), col: c.col, row: c.row }));

  assignLabelsToArrows(arrows, labels);
  return buildFlows(cells, shapes, arrows, images);
}

function buildFlows(
  cells: Cell[],
  shapes: Shape[],
  arrows: Arrow[],
  images: FlowImage[]
): Flow[] {
  const headings = cells
    .filter((c) => c.col === 0 && HEADING_STYLES.has(c.style))
    .sort((a, b) => a.row - b.row);

  const sections: { title: string; startRow: number }[] = [];
  for (const heading of headings) {
    const base = heading.text.replace(/\s*\(ต่อ\)\s*$/, "").trim();
    const previous = sections[sections.length - 1];
    if (previous && previous.title === base) continue;
    sections.push({ title: base, startRow: heading.row });
  }

  const maxRow = Math.max(...shapes.map((s) => s.row), ...cells.map((c) => c.row), 0);

  const flows: Flow[] = [];
  for (let i = 0; i < sections.length; i++) {
    const startRow = sections[i].startRow;
    const endRow = i + 1 < sections.length ? sections[i + 1].startRow - 1 : maxRow;
    const flow = buildFlow(sections[i].title, startRow, endRow, cells, shapes, arrows, images);
    if (flow.nodes.some((n) => n.kind === "QUESTION")) flows.push(flow);
  }
  return flows;
}

function buildFlow(
  title: string,
  startRow: number,
  endRow: number,
  allCells: Cell[],
  allShapes: Shape[],
  allArrows: Arrow[],
  allImages: FlowImage[]
): Flow {
  const sectionShapes = allShapes.filter(
    (s) => s.row >= startRow && s.row <= endRow && !NAVIGATION_RE.test(s.text)
  );
  const sectionArrows = allArrows.filter((a) => a.row >= startRow - 3 && a.row <= endRow + 3);
  const cells = allCells.filter((c) => c.row >= startRow && c.row <= endRow);
  const images = allImages
    .filter((i) => i.row >= startRow && i.row <= endRow && i.bytes >= MIN_DIAGRAM_BYTES)
    .sort((a, b) => a.row - b.row);

  const notes = cells
    .filter((c) => c.col === 0 && !HEADING_STYLES.has(c.style) && c.text.startsWith("หมายเหตุ"))
    .map((c) => c.text);

  const markers = sectionShapes.filter((s) => STEP_NUMBER_RE.test(s.text));
  const content = sectionShapes.filter((s) => !STEP_NUMBER_RE.test(s.text));

  const nodes = new Map<string, FlowNode>();
  for (const shape of content) {
    // The circled step markers sit just outside a box; attach the nearest one.
    const marker = markers
      .map((m) => ({
        m,
        d: distanceToRect((m.rect.x1 + m.rect.x2) / 2, (m.rect.y1 + m.rect.y2) / 2, shape.rect),
      }))
      .filter((x) => x.d < MARKER_TOLERANCE)
      .sort((a, b) => a.d - b.d)[0]?.m;

    nodes.set(shape.key, {
      key: shape.key,
      kind: isQuestion(shape.text) ? "QUESTION" : "ACTION",
      text: shape.text,
      stepNumber: marker?.text,
      otherKeys: [],
      warnings: [],
    });
  }

  const nearestShape = (px: number, py: number, tolerance = ENDPOINT_TOLERANCE) =>
    content
      .map((s) => ({ s, d: distanceToRect(px, py, s.rect) }))
      .filter((x) => x.d <= tolerance)
      .sort((a, b) => a.d - b.d)[0]?.s;

  const incoming = new Set<string>();
  const usedArrows = new Set<Arrow>();

  const attach = (node: FlowNode, targetKey: string, answer?: Answer) => {
    if (answer === "YES" && !node.yesKey) node.yesKey = targetKey;
    else if (answer === "NO" && !node.noKey) node.noKey = targetKey;
    else node.otherKeys.push(targetKey);
    incoming.add(targetKey);
  };

  for (const arrow of sectionArrows) {
    const source = nearestShape(arrow.start.x, arrow.start.y);
    const target = nearestShape(arrow.end.x, arrow.end.y);
    if (!source || !target || source.key === target.key) continue;

    const node = nodes.get(source.key);
    if (!node) continue;

    attach(node, target.key, arrow.answer);
    usedArrows.add(arrow);
  }

  // Second pass. Most unresolved branches are an arrow whose tip stops a little
  // short of the box it points at, so retry those with a wider tolerance — but
  // only for questions still missing a branch, and only when a single unused
  // arrow fits, so a relaxed match can never displace a confident one.
  for (const node of nodes.values()) {
    if (node.kind !== "QUESTION") continue;
    if (node.yesKey && node.noKey) continue;

    const shape = content.find((s) => s.key === node.key);
    if (!shape) continue;

    const candidates = sectionArrows
      .filter((a) => !usedArrows.has(a))
      .map((a) => ({ a, d: distanceToRect(a.start.x, a.start.y, shape.rect) }))
      .filter((x) => x.d <= RELAXED_ENDPOINT_TOLERANCE)
      .sort((x, y) => x.d - y.d);

    for (const { a } of candidates) {
      if (node.yesKey && node.noKey) break;
      const target = nearestShape(a.end.x, a.end.y, RELAXED_ENDPOINT_TOLERANCE);
      if (!target || target.key === node.key) continue;

      // Without a label, only fill a branch when exactly one side is open —
      // otherwise there is no way to tell which answer this arrow belongs to.
      const answer =
        a.answer ?? (node.yesKey ? "NO" : node.noKey ? "YES" : undefined);
      if (!answer) continue;

      attach(node, target.key, answer);
      usedArrows.add(a);
      node.warnings.push(
        `ทาง "${answer === "YES" ? "ใช่" : "ไม่"}" จับคู่จากตำแหน่งลูกศรแบบผ่อนเกณฑ์ ควรตรวจกับต้นฉบับ`
      );
    }
  }

  // A question with only one labelled branch can take the remaining unlabelled
  // arrow for its other answer; that is a deduction, not a guess.
  for (const node of nodes.values()) {
    if (node.kind !== "QUESTION") continue;
    if (node.yesKey && !node.noKey && node.otherKeys.length === 1) {
      node.noKey = node.otherKeys.shift();
    } else if (node.noKey && !node.yesKey && node.otherKeys.length === 1) {
      node.yesKey = node.otherKeys.shift();
    }
    if (!node.yesKey && !node.noKey) node.warnings.push("ไม่พบทางออกของคำถามนี้เลย");
    else if (!node.yesKey) node.warnings.push('ไม่พบทางออกเมื่อตอบ "ใช่"');
    else if (!node.noKey) node.warnings.push('ไม่พบทางออกเมื่อตอบ "ไม่"');
  }

  const questions = [...nodes.values()].filter((n) => n.kind === "QUESTION");
  const resolved = questions.filter((n) => n.yesKey && n.noKey).length;
  const confidence = questions.length === 0 ? 0 : resolved / questions.length;

  const roots = questions.filter((n) => !incoming.has(n.key));
  const rootKey = roots.sort((a, b) => {
    const sa = content.find((s) => s.key === a.key)!;
    const sb = content.find((s) => s.key === b.key)!;
    return sa.rect.y1 - sb.rect.y1 || sa.rect.x1 - sb.rect.x1;
  })[0]?.key;

  const warnings: string[] = [];
  if (roots.length > 1) {
    warnings.push(`มีคำถามเริ่มต้น ${roots.length} จุด — ผังนี้อาจมีหลายสายที่ไม่ต่อกัน`);
  }
  if (!rootKey) warnings.push("หาคำถามเริ่มต้นไม่พบ");

  return {
    title,
    notes,
    rootKey,
    nodes: [...nodes.values()],
    images,
    warnings,
    startRow,
    endRow,
    confidence,
  };
}
