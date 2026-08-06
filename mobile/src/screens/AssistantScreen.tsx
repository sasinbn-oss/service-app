import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage, resolveImageUrl } from "../api/client";
import { openUrl } from "../utils/share";
import { useAuth } from "../context/AuthContext";
import Markdown from "../components/Markdown";
import { downloadText, shareText } from "../utils/share";
import { colors, radius, shadow, spacing } from "../theme";

/** ไฟล์ที่ผู้ช่วยสร้างขึ้นระหว่างตอบ เช่น เอกสารขอโอนสินค้า */
interface GeneratedDocument {
  id: string;
  filename: string;
  path: string;
  title: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  documents?: GeneratedDocument[];
}

interface Preset {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  prompt: string;
  adminOnly?: boolean;
}

/**
 * One tap instead of typing a paragraph. Each prompt names the document and the
 * date range so the assistant fetches real rows rather than asking a follow-up
 * question first.
 */
const PRESETS: Preset[] = [
  {
    label: "เอกสารขอโอนสินค้า",
    icon: "swap-horizontal",
    prompt:
      "ฉันอยากได้เอกสารขอโอนสินค้าระหว่างคลัง ช่วยบอกหน่อยว่าต้องบอกอะไรบ้าง " +
      "แล้วยกตัวอย่างวิธีพิมพ์รายการให้ดูสั้น ๆ",
  },
  {
    label: "สรุปงานเดือนนี้",
    icon: "calendar",
    prompt:
      "ช่วยออกรายงานสรุปการทำงานของเดือนนี้ แยกตามวันที่และสาขา พร้อมรวมจำนวนงานและชั่วโมงรวม",
  },
  {
    label: "ใบรายงานการซ่อม",
    icon: "document-text",
    prompt:
      "ช่วยออกใบรายงานการซ่อมจากงานล่าสุดที่ฉันบันทึกไว้ ให้มีหัวเอกสาร วันที่ สาขา อาการ/งานที่ทำ และช่องลงชื่อผู้ปฏิบัติงานกับผู้รับงาน",
  },
  {
    label: "สรุปการเบิกของ",
    icon: "file-tray-full",
    prompt: "ช่วยสรุปการเบิกของใช้สิ้นเปลืองย้อนหลัง 3 เดือน เป็นตาราง แยกตามสถานะอนุมัติ",
  },
  {
    label: "สรุปการใช้รถ",
    icon: "car",
    prompt: "ช่วยสรุปการใช้รถของเดือนนี้ เป็นตาราง มีทะเบียนรถ ปลายทาง วันที่ และระยะทางรวม",
  },
  {
    label: "ขั้นตอนตรวจซ่อม",
    icon: "construct",
    prompt:
      "ฉันอยากได้เอกสารขั้นตอนการตรวจซ่อมจากผังวินิจฉัยในระบบ ช่วยบอกก่อนว่ามีเรื่องอะไรให้เลือกบ้าง",
  },
  {
    label: "สรุปงานทั้งทีม",
    icon: "people",
    adminOnly: true,
    prompt:
      "ช่วยออกรายงานสรุปงานของช่างทุกคนในเดือนนี้ เป็นตาราง แยกตามช่าง พร้อมจำนวนงานและชั่วโมงรวมของแต่ละคน",
  },
];

export default function AssistantScreen() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/assistant/status")
      .then((res) => setEnabled(res.data.enabled))
      // A failed status check should not hide the chat — let the send attempt
      // report the real problem instead of guessing it is a setup issue.
      .catch(() => setEnabled(true));
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(history);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const res = await api.post<{
        reply: string;
        truncated?: boolean;
        documents?: GeneratedDocument[];
      }>("/assistant/chat", {
        // ประวัติที่ส่งกลับไปมีแต่บทสนทนา ไม่ต้องแนบข้อมูลไฟล์
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      const reply = res.data.truncated
        ? `${res.data.reply}\n\n_(เอกสารยาวเกินโควตาหนึ่งครั้ง — พิมพ์ว่า "เขียนต่อ" เพื่อขอส่วนที่เหลือ)_`
        : res.data.reply;
      setMessages([
        ...history,
        { role: "assistant", content: reply, documents: res.data.documents },
      ]);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const presets = PRESETS.filter((p) => !p.adminOnly || user?.role === "ADMIN");
  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {enabled === false ? (
          <View style={styles.setupCard}>
            <Ionicons name="warning-outline" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>ยังไม่ได้เปิดใช้งานผู้ช่วย AI</Text>
              <Text style={styles.setupText}>
                ผู้ดูแลระบบต้องเพิ่ม ANTHROPIC_API_KEY ในค่า Environment ของเซิร์ฟเวอร์ก่อน
                แล้วรีสตาร์ทเซิร์ฟเวอร์หนึ่งครั้ง (ดูวิธีในไฟล์ README หัวข้อ "ผู้ช่วย AI")
              </Text>
            </View>
          </View>
        ) : null}

        {empty ? (
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Ionicons name="sparkles" size={26} color={colors.primary} />
            </View>
            <Text style={styles.introTitle}>ผู้ช่วย AI</Text>
            <Text style={styles.introText}>
              ถามข้อมูลในระบบ หรือให้ช่วยร่างเอกสารจากงานที่บันทึกไว้จริง
              {"\n"}เลือกหัวข้อด้านล่าง หรือพิมพ์สิ่งที่ต้องการได้เลย
            </Text>

            <View style={styles.exampleCard}>
              <Text style={styles.exampleTitle}>ตัวอย่าง — พิมพ์แบบนี้ได้เลย</Text>
              <Text style={styles.exampleText}>
                ขอเอกสารโอนอะไหล่ จากคลังลาดพร้าว 94 ไปคลังเชียงใหม่{"\n"}
                SPHB416 ELECTRODE, SPARK PKG 3 ตัว{"\n"}
                SPOS0028 วาล์วน้ำ 4 ทาง Oasis 3 ตัว
              </Text>
            </View>

            <View style={styles.presetGrid}>
              {presets.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={styles.preset}
                  activeOpacity={0.7}
                  onPress={() => send(p.prompt)}
                >
                  <Ionicons name={p.icon} size={18} color={colors.primary} />
                  <Text style={styles.presetText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.noteText}>
                ผู้ช่วยอ่านข้อมูลได้อย่างเดียว บันทึกงาน อนุมัติคำขอ หรือแก้ข้อมูล
                ยังต้องกดในเมนูปกติเอง
              </Text>
            </View>
          </View>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <View key={i} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={styles.assistantBubble}>
              <Markdown content={m.content} />

              {m.documents?.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.docCard}
                  activeOpacity={0.7}
                  onPress={() => openUrl(resolveImageUrl(doc.path)!)}
                >
                  <View style={styles.docIcon}>
                    <Ionicons name="document-text" size={22} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>{doc.title}</Text>
                    <Text style={styles.docName}>{doc.filename}</Text>
                  </View>
                  <Ionicons name="download-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.action} onPress={() => shareText(m.content)}>
                  <Ionicons
                    name={Platform.OS === "web" ? "copy-outline" : "share-outline"}
                    size={15}
                    color={colors.primary}
                  />
                  <Text style={styles.actionText}>
                    {Platform.OS === "web" ? "คัดลอก" : "แชร์"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === "web" ? (
                  <TouchableOpacity
                    style={styles.action}
                    onPress={() =>
                      downloadText(m.content, `เอกสาร-${new Date().toISOString().slice(0, 10)}.md`)
                    }
                  >
                    <Ionicons name="download-outline" size={15} color={colors.primary} />
                    <Text style={styles.actionText}>บันทึกไฟล์</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )
        )}

        {sending ? (
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.thinkingText}>กำลังค้นข้อมูลและเรียบเรียง…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="พิมพ์คำถาม หรือบอกว่าอยากได้เอกสารอะไร"
          placeholderTextColor={colors.textFaint}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || sending) && styles.sendDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },

  intro: { alignItems: "center", paddingVertical: spacing.lg },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.md,
  },
  introText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  exampleCard: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  exampleTitle: { fontSize: 12, lineHeight: 20, fontWeight: "700", color: colors.textMuted },
  exampleText: { fontSize: 13, lineHeight: 22, color: colors.text, marginTop: 4 },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  preset: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  presetText: { fontSize: 14, lineHeight: 22, color: colors.text, fontWeight: "600" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.textMuted },

  userRow: { alignItems: "flex-end", marginTop: spacing.md },
  userBubble: {
    maxWidth: "88%",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  userText: { color: "#fff", fontSize: 15, lineHeight: 24 },
  assistantBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { fontSize: 13, lineHeight: 20, color: colors.primary, fontWeight: "600" },

  docCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 14, lineHeight: 22, fontWeight: "700", color: colors.text },
  docName: { fontSize: 12, lineHeight: 20, color: colors.textMuted },

  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  thinkingText: { fontSize: 13, lineHeight: 22, color: colors.textMuted },

  setupCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  setupTitle: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: colors.text },
  setupText: { fontSize: 13, lineHeight: 22, color: colors.textMuted, marginTop: 2 },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 22, color: colors.danger },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: colors.borderStrong },
});
