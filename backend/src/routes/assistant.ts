/**
 * The in-app AI assistant. It answers questions and drafts documents (repair
 * reports, monthly summaries, requisition summaries) from the records already in
 * this database, reached through the read-only tools in ../assistant/tools.
 *
 * The API key lives only on the server. The app never sees it and never talks to
 * Anthropic directly — every request goes through here so the caller's role
 * decides which rows the model is allowed to read.
 */
import { Router } from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { assistantTools, runAssistantTool } from "../assistant/tools";
import { prisma } from "../prisma";

const router = Router();

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;
// Each round is one API call plus its tool queries. Real requests settle in two
// or three; the cap stops a confused loop from running up a bill.
const MAX_ROUNDS = 8;
// Only the tail of the conversation is sent, so a long chat stays affordable.
const MAX_HISTORY = 24;

/** Built lazily so the server still starts (and every other route works) without a key. */
let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // The SDK reads ANTHROPIC_API_KEY from the environment itself.
  if (!client) client = new Anthropic();
  return client;
}

function systemPrompt(user: { name: string; employeeCode: string; role: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const scope =
    user.role === "ADMIN"
      ? "ผู้ใช้คนนี้เป็นผู้ดูแลระบบ จึงดูข้อมูลของช่างทุกคนได้"
      : "ผู้ใช้คนนี้เป็นช่าง เครื่องมือจะคืนเฉพาะข้อมูลของตัวเขาเองเท่านั้น";

  return [
    "คุณคือผู้ช่วยในแอปงานบริการภาคสนามของทีมช่างซ่อมเครื่องซักอบผ้า ตอบเป็นภาษาไทยเสมอ",
    "",
    `วันนี้คือ ${today}`,
    `กำลังคุยกับ: ${user.name} (รหัส ${user.employeeCode}) ${scope}`,
    "",
    "หน้าที่หลักของคุณคือช่วยร่างเอกสารจากข้อมูลจริงในระบบ เช่น",
    "- รายงานสรุปการทำงานรายวัน/รายสัปดาห์/รายเดือน",
    "- ใบรายงานการซ่อม",
    "- สรุปการเบิกของใช้สิ้นเปลือง",
    "- สรุปการใช้รถและระยะทาง",
    "- เอกสารขั้นตอนการตรวจซ่อมจากผังวินิจฉัย",
    "",
    "กติกาที่ห้ามฝ่าฝืน:",
    "1. ก่อนออกเอกสารที่อ้างถึงงาน วันที่ ตัวเลข หรือรายการของ ให้เรียกเครื่องมือดึงข้อมูลจริงก่อนเสมอ",
    "   ห้ามแต่งข้อมูลขึ้นเอง ห้ามเดาตัวเลข",
    "2. ถ้าเครื่องมือไม่คืนข้อมูล ให้บอกตรง ๆ ว่าไม่พบข้อมูลในช่วงที่ขอ อย่าสร้างตัวอย่างปลอมมาแทน",
    "3. ถ้าผู้ใช้ไม่ได้ระบุช่วงวันที่ ให้เดาช่วงที่สมเหตุสมผลแล้วบอกไว้ในเอกสารว่าใช้ช่วงไหน",
    "4. เรื่องขั้นตอนซ่อม: เครื่องนี้ใช้ไฟ 100-240VAC ถ้าผังวินิจฉัยมีขั้นตอนที่ไม่ครบ",
    "   ต้องเขียนกำกับว่าจุดนั้นยังไม่สมบูรณ์ ห้ามเติมขั้นตอนเองให้ดูครบ",
    "5. คุณอ่านข้อมูลได้อย่างเดียว แก้ไขหรืออนุมัติอะไรในระบบไม่ได้",
    "   ถ้าผู้ใช้ขอให้ทำ ให้บอกว่าต้องไปกดในเมนูที่เกี่ยวข้องเอง",
    "",
    "รูปแบบคำตอบ: ใช้ Markdown อย่างง่าย (หัวข้อ ###, ตาราง, รายการ) ให้ผู้ใช้คัดลอกไปใช้ต่อได้ทันที",
    "ตอบให้กระชับ ไม่ต้องเกริ่นนำยาว",
  ].join("\n");
}

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(100),
});

/** Lets the app tell "not set up yet" apart from "the call failed". */
router.get("/status", requireAuth, (_req, res) => {
  res.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
});

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const anthropic = getClient();
  if (!anthropic) {
    return res.status(503).json({
      error:
        "ผู้ช่วย AI ยังไม่ถูกเปิดใช้งาน — ผู้ดูแลระบบต้องตั้งค่า ANTHROPIC_API_KEY ที่ฝั่งเซิร์ฟเวอร์ก่อน",
    });
  }

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { name: true, employeeCode: true, role: true },
  });
  if (!user) return res.status(401).json({ error: "ไม่พบผู้ใช้" });

  const messages: Anthropic.MessageParam[] = parsed.data.messages
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));

  const toolsUsed: string[] = [];

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Streaming rather than create(): a long document can take a while to
      // generate, and a non-streamed request is the one that hits a timeout.
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: systemPrompt(user),
        tools: assistantTools,
        messages,
      });
      const response = await stream.finalMessage();

      if (response.stop_reason !== "tool_use") {
        const reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        if (!reply) {
          return res.status(502).json({ error: "ผู้ช่วยไม่ได้ตอบข้อความกลับมา กรุณาลองใหม่" });
        }
        return res.json({
          reply,
          toolsUsed,
          truncated: response.stop_reason === "max_tokens",
        });
      }

      // The assistant turn has to go back verbatim — it carries the thinking
      // blocks and tool_use ids the next request is validated against.
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolsUsed.push(block.name);
        try {
          const output = await runAssistantTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            req.auth!
          );
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(output),
          });
        } catch (err) {
          // A failed query is reported back to the model, not thrown: it can
          // narrow the range and retry instead of killing the whole answer.
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `ดึงข้อมูลไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      messages.push({ role: "user", content: results });
    }

    res.status(504).json({
      error: "ผู้ช่วยค้นข้อมูลหลายรอบเกินไปแล้วยังตอบไม่ได้ ลองถามให้เจาะจงกว่านี้ เช่น ระบุช่วงวันที่",
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Assistant API error ${err.status}:`, err.message);
      if (err.status === 401) {
        return res.status(503).json({ error: "ANTHROPIC_API_KEY ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า" });
      }
      if (err.status === 429) {
        return res.status(429).json({ error: "ใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" });
      }
      return res.status(502).json({ error: `เรียกผู้ช่วยไม่สำเร็จ (${err.status})` });
    }
    console.error("Assistant error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเรียกผู้ช่วย" });
  }
});

export default router;
