/**
 * งานของฉันวันนี้ของแอดมิน แบบแยกหัวข้อ (เจ้าของงานเลือก 5 พ.ย. 69 · ตัวอย่าง myday — ตอบ "ทำตามที่แนะนำ" ทั้ง 4 ข้อ)
 *
 * เดิมหน้าเป็นกลุ่มตามขั้นเรียงต่อกันยาว (กลุ่มที่มีงานด่วน/ค้างนานขึ้นก่อน — ลำดับเปลี่ยนทุกวัน) แอดมินหาไม่เจอว่าอะไรอยู่ตรงไหน
 * ตอนนี้แบ่งเป็นหัวข้อตามลำดับงาน "ที่เดิมทุกวัน": ต้องทำก่อนวันนี้ → ตอบหัวหน้าภาค → ขั้นของแอดมินตามสายงาน → อื่น ๆ
 * ไฟล์นี้คิดอย่างเดียว (ไม่มีหน้าจอ) — ใบไหนอยู่หัวข้อไหน · เรียงอย่างไร · ชิป/ป้ายนับจากอะไร
 *
 * ใบหนึ่งอยู่หัวข้อเดียว ลำดับความสำคัญเดียวกับหัวข้อปักเดิม: ขอนัดด่วน → เลยนัด → คำขอตรวจสอบที่ยังไม่ตอบ → ขั้นของใบ → อื่น ๆ
 * "ต้องทำก่อนวันนี้" มาจากตัวสร้างเดียวกับกล่องงาน (adminGroups) — สองหน้านับตรงกันเสมอ
 */
import type { WorkOrderRow } from "../screens/WorkOrderListScreen";
import { addDays, dayFull, dayShort, serverDay, type AdminCutoffGroups } from "./dispatchCutoff";
import { dayTime } from "../components/claims/ClaimTrail";

/** ค้างเกินนี้ขึ้นแดง — ตัวเลขเดียวกับชิป "ค้างขั้นเดิมเกิน 3 วัน" ในหน้ารายการ (STALE_DAYS ของ MyQueue) */
export const STALE_DAYS = 3;

/**
 * ขั้นของแอดมินตามลำดับสายงาน (ตัวอย่าง: นัดร้าน → เช็คอะไหล่ → ส่งใบเสนอราคา → รอลูกค้าจ่ายเงิน → เบิกอะไหล่ → คอนเฟิร์มลูกค้า)
 * ชื่อหัวข้ออ่านจากตัวเลือกขั้นของเซิร์ฟเวอร์ (stages[].action = ป้ายขั้นที่ตัด "แอดมิน · " ออก) ไม่พิมพ์ซ้ำในแอป
 * — คำบนหัวข้อต้องตรงกับป้ายขั้นทุกที่ในแอป เปลี่ยนชื่อขั้นที่เซิร์ฟเวอร์แล้วหัวข้อเปลี่ยนตาม
 */
export const TOPIC_STAGES = ["INSPECT_CONFIRM", "PARTS_SOURCING", "AWAITING_QUOTE", "AWAITING_PAYMENT", "PARTS_REQUESTED", "AWAITING_CONFIRM"] as const;
/** ขั้นที่มีวันนัด/วันตรวจอยู่แล้ว — เรียงวันใกล้สุดก่อน (ร้านที่รอพรุ่งนี้ต้องได้โทรก่อน) ไม่ใช่ด่วน/ค้างนาน */
const DATE_STAGES = ["INSPECT_CONFIRM", "PARTS_REQUESTED", "AWAITING_CONFIRM"];

export type TopicId = "first" | "review" | (typeof TOPIC_STAGES)[number] | "it" | "other";
/** ชนิดของแถวในหัวข้อ "ต้องทำก่อนวันนี้" — ปุ่มบนแถวต่างกัน (ขอนัดด่วน: ตอบกลับ/แก้เป็นงานด่วน · เลยนัด: เลื่อนวันนัด) */
export type RowKind = "ask" | "past" | "review" | "stage";
export type ChipTone = "red" | "redSoft" | "amber" | "plain";

export interface TopicChip {
  key: string;
  label: string;
  n: number;
  tone: ChipTone;
  /** ขึ้นเป็นป้ายบนการ์ดภาพรวม/เมนูซ้ายด้วย (เรื่องที่ต้องรีบ) — "ตามแล้ว" เป็นแค่ตัวกรอง ไม่ใช่ป้าย */
  flag: boolean;
  test: (r: WorkOrderRow) => boolean;
}

export interface Topic {
  id: TopicId;
  /** เลขขั้นบนวงกลม — "!" = ก่อนทุกขั้น · "" = อื่น ๆ (ไม่ใช่ขั้นในสายงาน) */
  step: string;
  name: string;
  /** บรรทัดเดียวว่าต้องทำอะไร (ตัวอย่าง) */
  what: string;
  /** หัวคอลัมน์ข้อมูลของหัวข้อนี้ (จอคอม) */
  infoHead: string;
  sortText: string;
  rows: WorkOrderRow[];
  chips: TopicChip[];
  /** บรรทัดล่างของการ์ดภาพรวม — ค้างนานสุด / นัดใกล้สุด / ขอเร็วสุด */
  oldest: string;
  kindOf: (r: WorkOrderRow) => RowKind;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
/** วันค้างของแถว — ใบรอลูกค้าจ่ายเงินใช้ตัวเลขของเซิร์ฟเวอร์ (ตัวเดียวกับ "รอมาแล้ว N วัน") แบบเดียวกับการ์ดเดิม */
export const rowDays = (r: WorkOrderRow) => (r.payWait ? r.payWait.days : daysSince(r.stageSince));

export const byAppt = (a: WorkOrderRow, b: WorkOrderRow) =>
  (a.scheduledAt ?? "9999").slice(0, 10).localeCompare((b.scheduledAt ?? "9999").slice(0, 10)) ||
  (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") ||
  a.code.localeCompare(b.code);
const score = (r: WorkOrderRow) => (r.priority === "URGENT" ? 1e6 : 0) + rowDays(r);
const byUrgentOld = (a: WorkOrderRow, b: WorkOrderRow) => score(b) - score(a);
const byWait = (a: WorkOrderRow, b: WorkOrderRow) => b.payWait!.days - a.payWait!.days || a.payWait!.since.localeCompare(b.payWait!.since);
const sent = (r: WorkOrderRow) => new Date(r.adminReview?.at ?? r.stageSince).getTime();

/** "6 พ.ย. (พรุ่งนี้)" — วันตามนาฬิกาเซิร์ฟเวอร์ (มือถือตั้งวันผิดต้องไม่บอกว่าพรุ่งนี้) */
export function apptRel(r: WorkOrderRow, now: number): string | null {
  const day = r.scheduledAt?.slice(0, 10);
  if (!day) return null;
  const today = serverDay(now);
  const rel = day === today ? " (วันนี้)" : day === addDays(today, 1) ? " (พรุ่งนี้)" : day < today ? " (เลยนัด)" : "";
  return `${dayShort(day)}${rel}`;
}

const chip = (key: string, label: string, tone: ChipTone, flag: boolean, test: (r: WorkOrderRow) => boolean): Omit<TopicChip, "n"> => ({
  key,
  label,
  tone,
  flag,
  test,
});

/**
 * แบ่งใบในกล่องงานแอดมินเป็นหัวข้อ — rows = ทุกใบในกล่อง (ไม่ตามคำค้น) · cut = adminGroups ของใบชุดเดียวกัน
 * names = ชื่อขั้นจากตัวเลือกของเซิร์ฟเวอร์ · ยังไม่มา = ใช้ป้ายจากแถวที่มีอยู่ (หัวข้อว่างที่ไม่รู้ชื่อยังไม่ขึ้นจนกว่าจะรู้)
 */
export function buildTopics(rows: WorkOrderRow[], cut: AdminCutoffGroups | null, now: number, names: Record<string, string>): Topic[] {
  const askRank = new Map((cut?.asks?.rows ?? []).map((r, i) => [r.id, i]));
  const pastIds = new Set((cut?.past?.rows ?? []).map((r) => r.id));
  const kind = new Map<number, RowKind>();
  const first: WorkOrderRow[] = [];
  const review: WorkOrderRow[] = [];
  const byStage = new Map<string, WorkOrderRow[]>();
  const other: WorkOrderRow[] = [];
  /**
   * ใบงาน IT แยกหัวข้อของตัวเอง (เจ้าของงานแก้ 6 พ.ย. 69 — "แยกหัวข้อในงานของ admin") ไม่ปนกับขั้นของงาน CM
   * ยกเว้น "ต้องทำก่อนวันนี้" ที่ยังนับทุกใบ (ขอนัดด่วน/เลยนัดต้องเห็นก่อนเสมอ ไม่ว่าเป็นงานอะไร)
   * ใบ IT ยังอยู่ในกล่องแอดมินครบ — แอดมินยังทำขั้นของตัวเองได้ หัวหน้าภาคที่ดูแลงาน IT ก็ทำได้ด้วย
   */
  const it: WorkOrderRow[] = [];
  for (const r of rows) {
    if (askRank.has(r.id)) {
      kind.set(r.id, "ask");
      first.push(r);
    } else if (pastIds.has(r.id)) {
      kind.set(r.id, "past");
      first.push(r);
    } else if (r.jobType === "IT") {
      // คำขอตรวจสอบของใบ IT ยังได้ปุ่มตอบกลับ (kind review) แค่อยู่หัวข้องาน IT
      if (r.adminReview && !r.adminReview.answered) kind.set(r.id, "review");
      it.push(r);
    } else if (r.adminReview && !r.adminReview.answered) {
      kind.set(r.id, "review");
      review.push(r);
    } else if ((TOPIC_STAGES as readonly string[]).includes(r.status)) {
      byStage.set(r.status, [...(byStage.get(r.status) ?? []), r]);
    } else other.push(r);
  }
  const kindOf = (r: WorkOrderRow) => kind.get(r.id) ?? "stage";
  const today = serverDay(now);
  const tomorrow = addDays(today, 1);
  const onDay = (d: string) => (r: WorkOrderRow) => r.scheduledAt?.slice(0, 10) === d;
  const stale = (r: WorkOrderRow) => rowDays(r) > STALE_DAYS;
  const nameOf = (s: string) => names[s] ?? stageNameOf(byStage.get(s)?.[0]?.statusLabel);

  // ขอนัดด่วนตามลำดับของตัวสร้างหัวข้อ (วันที่ขอ → เวลาที่ขอ) ก่อน แล้วเลยนัดตามวันนัด — แบบหัวข้อปักเดิมสองหัวข้อต่อกัน
  first.sort((a, b) => {
    const ka = kindOf(a) === "ask" ? 0 : 1;
    const kb = kindOf(b) === "ask" ? 0 : 1;
    return ka - kb || (ka === 0 ? (askRank.get(a.id) ?? 0) - (askRank.get(b.id) ?? 0) : byAppt(a, b));
  });
  review.sort((a, b) => sent(a) - sent(b));
  other.sort(byUrgentOld);

  const make = (t: Omit<Topic, "chips" | "kindOf"> & { chips: Omit<TopicChip, "n">[] }): Topic => ({
    ...t,
    kindOf,
    chips: t.chips.map((c) => ({ ...c, n: t.rows.filter(c.test).length })),
  });

  const nearest = (list: WorkOrderRow[], what: string) => {
    const d = list.map((r) => r.scheduledAt?.slice(0, 10)).filter(Boolean).sort()[0];
    if (!d) return list.length ? `${what} ยังไม่มีวัน` : "ไม่มีใบในหัวข้อนี้";
    const rel = d === today ? " (วันนี้)" : d === tomorrow ? " (พรุ่งนี้)" : "";
    return `${what} ${dayFull(d)}${rel}`;
  };
  const longest = (list: WorkOrderRow[]) =>
    list.length ? `ค้างนานสุด: ${Math.max(...list.map(rowDays))} วัน` : "ไม่มีใบในหัวข้อนี้";

  const topics: Topic[] = [];
  const firstAsk = first.find((r) => kindOf(r) === "ask")?.urgentAsk;
  const firstPast = first.find((r) => kindOf(r) === "past")?.scheduledAt?.slice(0, 10);
  topics.push(
    make({
      id: "first",
      step: "!",
      name: "ต้องทำก่อนวันนี้",
      what: "ร้านขอนัดด่วนรอคำตอบ · วันนัดผ่านไปแล้วแต่ใบยังไม่ถึงช่าง",
      infoHead: "ทำไมต้องทำก่อน",
      sortText: "ขอนัดด่วนก่อน แล้วเลยนัดนานสุด",
      rows: first,
      chips: [
        chip("ask", "ขอนัดด่วน", "red", true, (r) => kindOf(r) === "ask"),
        chip("past", "เลยนัด", "redSoft", true, (r) => kindOf(r) === "past"),
      ],
      oldest: firstAsk
        ? `ขอเร็วสุด: ร้านขอ ${dayFull(firstAsk.day)}${firstAsk.day === today ? " (วันนี้)" : firstAsk.day === tomorrow ? " (พรุ่งนี้)" : ""}`
        : firstPast
          ? `เลยนัดนานสุด: นัด ${dayFull(firstPast)}`
          : "ไม่มีใบในหัวข้อนี้",
    })
  );
  topics.push(
    make({
      id: "review",
      step: "1",
      name: "ตอบหัวหน้าภาค",
      what: "หัวหน้าภาคส่งใบให้ตรวจสอบ รอคำตอบจากแอดมิน",
      infoHead: "หัวหน้าภาคถามว่า",
      sortText: "ส่งมาก่อนขึ้นก่อน",
      rows: review,
      chips: [chip("late", "รอเกิน 1 วัน", "amber", true, (r) => now - sent(r) > 86_400_000)],
      oldest: review.length ? `ส่งมานานสุด: ${dayTime(review[0].adminReview?.at ?? review[0].stageSince)}` : "ไม่มีใบในหัวข้อนี้",
    })
  );
  const stageTopic = (s: (typeof TOPIC_STAGES)[number], step: string) => {
    const list = byStage.get(s) ?? [];
    if (s === "AWAITING_PAYMENT") list.sort(byWait);
    else if (DATE_STAGES.includes(s)) list.sort(byAppt);
    else list.sort(byUrgentOld);
    return { list, step, name: nameOf(s) };
  };
  const ins = stageTopic("INSPECT_CONFIRM", "2");
  topics.push(
    make({
      id: "INSPECT_CONFIRM",
      step: ins.step,
      name: ins.name,
      what: "โทรคอนเฟิร์มวันตรวจกับร้าน ตามวันที่หัวหน้าภาคเลือก",
      infoHead: "วันตรวจที่หัวหน้าภาคเลือก",
      sortText: "วันตรวจใกล้สุดขึ้นก่อน",
      rows: ins.list,
      chips: [chip("today", "ตรวจวันนี้", "redSoft", true, onDay(today)), chip("tmr", "ตรวจพรุ่งนี้", "amber", true, onDay(tomorrow))],
      oldest: nearest(ins.list, "ใกล้สุด: ตรวจ"),
    })
  );
  const src = stageTopic("PARTS_SOURCING", "3");
  topics.push(
    make({
      id: "PARTS_SOURCING",
      step: src.step,
      name: src.name,
      // "มีครบ ส่งต่อได้" ของตัวอย่างไม่มีจริงในขั้นนี้ — ตอบว่ามีครบแล้วใบเดินต่อเอง ใบที่ค้างคือยังไม่เช็คหรือของหมด
      what: "ดูคลังว่ามีของไหม — ยังไม่เช็คให้ตอบมี/หมด · ของหมดให้ตามของเข้า",
      infoHead: "อะไหล่",
      sortText: "ด่วนก่อน แล้วค้างนานสุด",
      rows: src.list,
      chips: [
        chip("out", "อะไหล่หมด", "redSoft", true, (r) => (r.partsOut ?? 0) > 0),
        chip("new", "ยังไม่เช็ค", "plain", false, (r) => !(r.partsOut ?? 0)),
        chip("stale", `ค้างเกิน ${STALE_DAYS} วัน`, "amber", true, stale),
      ],
      oldest: longest(src.list),
    })
  );
  const quo = stageTopic("AWAITING_QUOTE", "4");
  topics.push(
    make({
      id: "AWAITING_QUOTE",
      step: quo.step,
      name: quo.name,
      what: "ทำใบเสนอราคาส่งลูกค้า แนบไฟล์แล้วกดส่ง",
      infoHead: "ค้างขั้นนี้",
      sortText: "ด่วนก่อน แล้วค้างนานสุด",
      rows: quo.list,
      chips: [chip("stale", `ค้างเกิน ${STALE_DAYS} วัน`, "amber", true, stale)],
      oldest: longest(quo.list),
    })
  );
  const pay = stageTopic("AWAITING_PAYMENT", "5");
  // เส้น "เกิน N วัน" มาจากเซิร์ฟเวอร์ (payWait.alertDays) — แอปไม่มีเลข 3 ของขั้นนี้
  const alert = pay.list[0]?.payWait?.alertDays;
  const top = pay.list[0]?.payWait;
  topics.push(
    make({
      id: "AWAITING_PAYMENT",
      step: pay.step,
      name: pay.name,
      what: "ส่งใบเสนอราคาแล้ว — ตามลูกค้า · แนบบิลเมื่อเงินเข้า",
      infoHead: "รอมาแล้ว · ตามลูกค้าล่าสุด",
      sortText: "รอนานสุดขึ้นก่อน",
      rows: pay.list,
      chips: [
        chip("over", alert !== undefined ? `เกิน ${alert} วัน` : "เกินกำหนด", "red", true, (r) => !!r.payWait?.over),
        chip("never", "ยังไม่เคยตาม", "redSoft", true, (r) => !!r.payWait && r.payWait.follows === 0),
        chip("followed", "ตามแล้ว", "plain", false, (r) => !!r.payWait && r.payWait.follows > 0),
      ],
      oldest: top ? `รอนานสุด: ${top.days} วัน · ${top.last ? "ตามแล้ว" : "ยังไม่เคยตาม"}` : "ไม่มีใบในหัวข้อนี้",
    })
  );
  for (const [s, step, what] of [
    ["PARTS_REQUESTED", "6", "หัวหน้าภาคนัดวันเข้าแล้ว — เบิกของจากคลังส่งหน้างาน"],
    ["AWAITING_CONFIRM", "7", "ของพร้อมแล้ว — โทรยืนยันวันเข้ากับร้าน (ร้านขอเลื่อนเปลี่ยนวันได้เลย)"],
  ] as const) {
    const t = stageTopic(s, step);
    topics.push(
      make({
        id: s,
        step,
        name: t.name,
        what,
        infoHead: s === "PARTS_REQUESTED" ? "วันเข้า · อะไหล่" : "วันเข้า",
        sortText: "วันนัดใกล้สุดขึ้นก่อน",
        rows: t.list,
        chips: [chip("today", "นัดวันนี้", "redSoft", true, onDay(today)), chip("tmr", "นัดพรุ่งนี้", "amber", true, onDay(tomorrow))],
        oldest: nearest(t.list, "นัดใกล้สุด:"),
      })
    );
  }
  // งาน IT — หลังขั้นของสายงาน ก่อน "อื่น ๆ" · ชิปตามขั้นที่มีใบ IT (ป้ายขั้นเดียวกับทุกที่) · ขึ้นเฉพาะตอนมีใบ แบบ "อื่น ๆ"
  if (it.length) {
    const order = (s: string) => {
      const i = TOPIC_STAGES.indexOf(s as (typeof TOPIC_STAGES)[number]);
      return i < 0 ? TOPIC_STAGES.length : i;
    };
    it.sort((a, b) => order(a.status) - order(b.status) || byUrgentOld(a, b));
    const stages = [...new Set(it.map((r) => r.status))];
    topics.push(
      make({
        id: "it",
        step: "IT",
        name: "งาน IT",
        what: "ใบงาน IT ทุกขั้นที่รอแอดมิน — หัวหน้าภาคที่ดูแลงาน IT ทำขั้นเหล่านี้ได้ด้วย",
        infoHead: "ขั้นที่ค้าง",
        sortText: "ตามลำดับขั้น แล้วด่วน/ค้างนานสุด",
        rows: it,
        chips: [
          ...stages.map((st) =>
            chip(`st:${st}`, nameOf(st) || stageNameOf(it.find((r) => r.status === st)?.statusLabel), "plain", false, (r) => r.status === st)
          ),
          chip("orphan", "ไม่มีคนรับ", "amber", true, (r) => !!r.orphan),
          chip("stale", `ค้างเกิน ${STALE_DAYS} วัน`, "amber", true, stale),
        ],
        oldest: longest(it),
      })
    );
  }
  // อื่น ๆ — ใบในกล่องงานแอดมินที่ไม่ใช่ขั้นข้างบน (เช่นใบรอหัวหน้าภาคที่ภาค/ทีมไม่มีคนรับ · ตรวจเคลมของ Super Admin) ขึ้นเฉพาะตอนมีใบ
  if (other.length)
    topics.push(
      make({
        id: "other",
        step: "",
        name: "อื่น ๆ",
        what: "ใบที่รอแอดมินนอกจากขั้นข้างบน — แต่ละแถวบอกขั้นที่ค้าง",
        infoHead: "ขั้นที่ค้าง",
        sortText: "ด่วนก่อน แล้วค้างนานสุด",
        rows: other,
        chips: [chip("orphan", "ไม่มีคนรับ", "amber", true, (r) => !!r.orphan), chip("stale", `ค้างเกิน ${STALE_DAYS} วัน`, "amber", true, stale)],
        oldest: longest(other),
      })
    );
  // ชื่อขั้นที่ยังไม่รู้ (ตัวเลือกขั้นยังไม่มาและหัวข้อนั้นไม่มีใบ) — ไม่ขึ้นชื่อว่าง ๆ
  return topics.filter((t) => !!t.name);
}

/** "แอดมิน · เบิกอะไหล่ (คลัง 94)" → "เบิกอะไหล่ (คลัง 94)" — กติกาเดียวกับชื่อกลุ่มเดิม (stageName ของ MyQueue) */
export function stageNameOf(label: string | undefined): string {
  if (!label) return "";
  return label.split(" · ").slice(1).join(" · ") || label;
}
