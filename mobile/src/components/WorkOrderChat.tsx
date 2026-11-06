/**
 * แชทในใบงาน (พ.ย. 69 · เจ้าของงานขอ "คล้าย ๆ facebook")
 *
 * - ChatBubble: ปุ่มกลมมุมขวาล่างของหน้าใบงาน (แบบ Messenger) + ตัวเลขยังไม่อ่าน → กางหน้าต่างแชทของใบนั้น
 * - ChatInbox: ไอคอนแชทบนแถบหัว + ตัวเลขห้องที่ยังไม่อ่าน → รายการห้องแชท (ใบงาน) ใหม่สุดก่อน กดแล้วเปิดใบพร้อมแชท
 *
 * ทุกคนที่เปิดใบได้คุยได้ (เซิร์ฟเวอร์ใช้กติกาเดียวกับหน้าใบงาน) · ถามใหม่ทุก 8 วินาทีตอนเปิดหน้าต่างอยู่
 * หน้าต่างแชทเป็นแผ่นที่กางในที่ ไม่ใช่ Modal — หน้าใบงานเป็น Modal อยู่แล้ว Modal ซ้อน Modal บนเว็บไม่น่าเชื่อถือ (CLAUDE.md)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";
import { colors, headingFont } from "../theme";
import { appendFile, pickImageAttachment, PickedAttachment } from "../utils/attachments";
import { showAlert } from "../utils/alert";
import { isAreaTeam } from "../utils/areaTeam";

export interface ChatMessage {
  id: number;
  body: string;
  createdAt: string;
  userId: number;
  byName: string;
  byRole: string;
  /** ลบแล้ว (ภายใน 5 นาทีหลังส่ง) — ขึ้นว่า "ลบข้อความแล้ว" */
  deleted: boolean;
  hasImage: boolean;
  /** ลิงก์ชั่วคราวเปิดรูปเต็ม (2 ชม.) · thumb = รูปย่อโชว์ในฟอง */
  imageUrl: string | null;
  thumb: string | null;
}
/** ลบข้อความของตัวเองได้ภายใน 5 นาที — ตรงกับ CHAT_DELETE_MS ฝั่งเซิร์ฟเวอร์ */
const DELETE_MS = 5 * 60_000;
interface Thread {
  id: number;
  code: string;
  title: string;
  branch: string;
  statusLabel: string;
  last: ChatMessage;
  unread: number;
}

const ROLE_TONE: Record<string, { fg: string; bg: string }> = {
  แอดมิน: { fg: colors.roleAdmin, bg: colors.roleAdminSoft },
  หัวหน้าภาค: { fg: colors.roleSupervisor, bg: colors.roleSupervisorSoft },
  ช่าง: { fg: colors.roleTech, bg: colors.roleTechSoft },
};
const tone = (role: string) => ROLE_TONE[role] ?? { fg: colors.textMuted, bg: colors.background };

function timeText(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
  const hm = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  if (day(d) === day(new Date())) return hm;
  return `${d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" })} ${hm}`;
}

function Avatar({ name, role, size = 30 }: { name: string; role: string; size?: number }) {
  const t = tone(role);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
      <Text style={[styles.avatarText, { color: t.fg, fontSize: size * 0.45 }]}>{name.trim().charAt(0)}</Text>
    </View>
  );
}

/** ห้องแชททั้งหมดของฉัน — ตัวเลขบนแถบหัว และตัวเลขบนปุ่มแชทของแต่ละใบ อ่านจากที่เดียวกัน */
function useThreads(poll: boolean) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const load = useCallback(() => {
    api
      .get<{ threads: Thread[] }>("/work-orders/chats", { loadingText: false })
      .then((r) => setThreads(r.data.threads))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const off = navigationRef.addListener("state", load);
    // 30 วิเท่ากระดิ่ง — ทุกหน้ามีแถบหัวถามอยู่ตลอด ถี่กว่านี้ = ทุกคนยิงเซิร์ฟเวอร์ข้าม region เพิ่มเท่าตัว
    const t = poll ? setInterval(load, 30_000) : null;
    return () => {
      off();
      if (t) clearInterval(t);
    };
  }, [load, poll]);
  return [threads, load] as const;
}

/** ปุ่มกลมมุมขวาล่างของหน้าใบงาน — กดแล้วกางหน้าต่างแชท (startOpen = เปิดมาจากรายการแชทบนแถบหัว) */
/** ทีม Area ไม่อยู่ในวงแชทใบงาน (ช่าง · หัวหน้าภาค · แอดมิน — เจ้าของงานเลือก) เซิร์ฟเวอร์ไม่เปิดเส้นแชทให้ */
function chatAudience(user: ReturnType<typeof useAuth>["user"]) {
  return !!user && !isAreaTeam(user);
}

export function ChatBubble(props: { orderId: number; code: string; branch: string; startOpen?: boolean }) {
  const { user } = useAuth();
  return chatAudience(user) ? <Bubble {...props} /> : null;
}

function Bubble({ orderId, code, branch, startOpen }: { orderId: number; code: string; branch: string; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  const [threads, reload] = useThreads(!open);
  const unread = threads?.find((t) => t.id === orderId)?.unread ?? 0;
  return (
    <>
      {open ? (
        <ChatWindow
          orderId={orderId}
          code={code}
          branch={branch}
          onClose={() => {
            setOpen(false);
            reload();
          }}
        />
      ) : (
        <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85} accessibilityLabel={`แชทใบงาน ${code}${unread ? ` · ยังไม่อ่าน ${unread}` : ""}`}>
          <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
          <Text style={styles.fabText}>แชทใบงาน</Text>
          {unread ? (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      )}
    </>
  );
}

function ChatWindow({ orderId, code, branch, onClose }: { orderId: number; code: string; branch: string; onClose: () => void }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const narrow = width < 640;
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [photo, setPhoto] = useState<PickedAttachment | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const load = useCallback(() => {
    api
      .get<{ messages: ChatMessage[]; readOnly: boolean }>(`/work-orders/${orderId}/chat`, { loadingText: false })
      .then((r) => {
        setMsgs(r.data.messages);
        setReadOnly(r.data.readOnly);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [orderId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    setSending(true);
    setError(null);
    try {
      let r;
      if (photo) {
        // รูป + ข้อความ (ถ้ามี) ส่งในคำขอเดียว — ย่อในเครื่องแล้ว (utils/attachments) ไม่ส่งไฟล์ดิบจากกล้องผ่าน 4G
        const form = new FormData();
        await appendFile(form, "file", photo.uri, photo.name, photo.type);
        if (photo.thumbnailUri) await appendFile(form, "thumbnail", photo.thumbnailUri, "thumb.jpg", "image/jpeg");
        form.append("body", body);
        r = await api.post<{ messages: ChatMessage[] }>(`/work-orders/${orderId}/chat`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          loadingText: false,
        });
      } else {
        r = await api.post<{ messages: ChatMessage[] }>(`/work-orders/${orderId}/chat`, { body }, { loadingText: false });
      }
      setMsgs(r.data.messages);
      setText("");
      setPhoto(null);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  // บนเว็บเปิดตัวเลือกไฟล์ (มือถือมีปุ่มกล้องในตัวเลือก) · แอปมือถือถามว่าถ่ายหรือเลือกจากอัลบั้ม
  async function choosePhoto() {
    const pick = (camera: boolean) => pickImageAttachment(camera).then((p) => p && setPhoto(p));
    if (Platform.OS === "web") return void pick(false);
    showAlert("ส่งรูป", undefined, [
      { text: "ถ่ายรูป", onPress: () => void pick(true) },
      { text: "เลือกจากอัลบั้ม", onPress: () => void pick(false) },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  }

  function askDelete(m: ChatMessage) {
    showAlert("ลบข้อความนี้?", "ลบได้ภายใน 5 นาทีหลังส่ง — ทุกคนในห้องจะเห็นว่า “ลบข้อความแล้ว”", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: () => {
          api
            .delete<{ messages: ChatMessage[] }>(`/work-orders/${orderId}/chat/${m.id}`, { loadingText: false })
            .then((r) => setMsgs(r.data.messages))
            .catch((e) => setError(apiErrorMessage(e)));
        },
      },
    ]);
  }

  const me = user?.id;
  return (
    <View style={[styles.window, narrow && styles.windowNarrow]} accessibilityLabel={`หน้าต่างแชทใบงาน ${code}`}>
      <View style={styles.winHead}>
        <View style={styles.winIcon}>
          <Ionicons name="chatbubbles" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.winTitle, headingFont]} numberOfLines={1}>
            แชทใบงาน {code}
          </Text>
          <Text style={styles.winSub} numberOfLines={1}>
            {branch} · คุยกับแอดมินเรื่องใบนี้
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.winClose} accessibilityLabel="ปิดแชท">
          <Ionicons name="remove" size={22} color={colors.body} />
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={scroller}
        style={styles.list}
        contentContainerStyle={styles.listIn}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      >
        {msgs === null ? (
          <Text style={styles.hint}>กำลังโหลด…</Text>
        ) : msgs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.primaryLine} />
            <Text style={styles.emptyTitle}>ยังไม่มีข้อความ</Text>
            <Text style={styles.hint}>สงสัยอะไรในใบนี้ พิมพ์ถามได้เลย — แอดมินเห็นในรายการแชทบนแถบหัว</Text>
          </View>
        ) : (
          msgs.map((m, i) => {
            const mine = m.userId === me;
            const prev = msgs[i - 1];
            const head = !prev || prev.userId !== m.userId || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 10 * 60_000;
            const t = tone(m.byRole);
            return (
              <View key={m.id} style={[styles.row, mine ? styles.rowMine : null, head && i > 0 ? { marginTop: 10 } : null]}>
                {!mine ? head ? <Avatar name={m.byName} role={m.byRole} /> : <View style={{ width: 30 }} /> : null}
                <View style={[styles.col, mine && { alignItems: "flex-end" }]}>
                  {head ? (
                    <View style={[styles.who, mine && { justifyContent: "flex-end" }]}>
                      {!mine ? <Text style={styles.whoName}>{m.byName}</Text> : null}
                      {!mine ? (
                        <View style={[styles.rolePill, { backgroundColor: t.bg }]}>
                          <Text style={[styles.rolePillText, { color: t.fg }]}>{m.byRole}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.whoTime}>{timeText(m.createdAt)}</Text>
                    </View>
                  ) : null}
                  {m.deleted ? (
                    <View style={[styles.bubble, styles.bubbleGone]}>
                      <Text style={styles.goneText}>ลบข้อความแล้ว</Text>
                    </View>
                  ) : (
                    <>
                      {m.hasImage ? (
                        <TouchableOpacity onPress={() => m.imageUrl && setZoom(m.imageUrl)} activeOpacity={0.85} accessibilityLabel={`รูปจาก ${m.byName}`}>
                          <Image source={{ uri: m.thumb ?? m.imageUrl ?? undefined }} style={styles.photo} resizeMode="cover" />
                        </TouchableOpacity>
                      ) : null}
                      {m.body ? (
                        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                          <Text style={[styles.bubbleText, mine && { color: "#fff" }]}>{m.body}</Text>
                        </View>
                      ) : null}
                      {mine && !readOnly && !user?.viewAs && Date.now() - Date.parse(m.createdAt) < DELETE_MS ? (
                        <TouchableOpacity onPress={() => askDelete(m)} accessibilityLabel="ลบข้อความ" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Text style={styles.delLink}>ลบ</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {readOnly || user?.viewAs ? (
        <View style={styles.closedBar} accessibilityLabel="แชทอ่านอย่างเดียว">
          <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
          <Text style={styles.closedText}>
            {readOnly
              ? "ใบงานปิดแล้ว — อ่านย้อนหลังได้อย่างเดียว มีเรื่องต่อให้เปิดใบงานใหม่"
              : "กำลังดูในฐานะคนอื่น — อ่านแชทได้อย่างเดียว ส่งในนามเขาไม่ได้"}
          </Text>
        </View>
      ) : (
      <>
      {photo ? (
        <View style={styles.pending}>
          <Image source={{ uri: photo.thumbnailUri ?? photo.uri }} style={styles.pendingImg} />
          <Text style={styles.pendingText}>รูปที่จะส่ง · พิมพ์ข้อความประกอบได้</Text>
          <TouchableOpacity onPress={() => setPhoto(null)} accessibilityLabel="เอารูปออก">
            <Ionicons name="close-circle" size={22} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attach} onPress={() => void choosePhoto()} disabled={sending} accessibilityLabel="ส่งรูป">
          <Ionicons name="image-outline" size={22} color={BLUE} />
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="พิมพ์ข้อความ…"
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          accessibilityLabel="พิมพ์ข้อความแชท"
          onKeyPress={(e) => {
            // Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ (แบบ Messenger บนคอม)
            const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
            if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
              (e as unknown as { preventDefault: () => void }).preventDefault();
              void send();
            }
          }}
        />
        <TouchableOpacity
          style={[styles.send, ((!text.trim() && !photo) || sending) && styles.sendOff]}
          onPress={() => void send()}
          disabled={(!text.trim() && !photo) || sending}
          accessibilityLabel="ส่งข้อความ"
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      </>
      )}
      {/* รูปเต็มทับหน้าต่างแชท — แผ่นในที่ ไม่ใช่ Modal (หน้าใบงานเป็น Modal อยู่แล้ว) · กดที่ไหนก็ปิด */}
      {zoom ? (
        <Pressable style={styles.zoom} onPress={() => setZoom(null)} accessibilityLabel="ปิดรูป">
          <Image source={{ uri: zoom }} style={styles.zoomImg} resizeMode="contain" />
          <Text style={styles.zoomHint}>แตะเพื่อปิด</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** ไอคอนแชทบนแถบหัว — ตัวเลข = ห้องที่มีข้อความยังไม่อ่าน · กดแล้วกางรายการห้องแบบ Messenger */
export function ChatInbox() {
  const { user } = useAuth();
  return chatAudience(user) ? <Inbox /> : null;
}

function Inbox() {
  const [open, setOpen] = useState(false);
  // จอมือถือ: กางเต็มความกว้างจอแบบเดียวกับกระดิ่ง — กล่องกว้าง 400 ชิดไอคอนล้นขอบซ้ายของจอ 360
  const narrow = useWindowDimensions().width < 640;
  const [threads, reload] = useThreads(true);
  const unread = threads?.filter((t) => t.unread > 0).length ?? 0;
  const go = (t: Thread) => {
    setOpen(false);
    if (!navigationRef.isReady()) return;
    (navigationRef.navigate as (tab: string, p: object) => void)("WorkOrdersTab", {
      screen: "WorkOrderDetail",
      params: { id: t.id, open: "chat" },
      initial: false,
    });
  };
  return (
    <View style={styles.inboxWrap}>
      <TouchableOpacity
        style={styles.inboxBtn}
        onPress={() => {
          if (!open) reload();
          setOpen((v) => !v);
        }}
        accessibilityLabel={`แชทใบงาน${unread ? ` · ยังไม่อ่าน ${unread} ห้อง` : ""}`}
      >
        <Ionicons name="chatbubbles-outline" size={21} color={colors.primaryInk} />
        {unread ? (
          <View style={styles.inboxBadge}>
            <Text style={styles.inboxBadgeText}>{unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {open ? (
        <>
          <Pressable style={[styles.scrim, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]} onPress={() => setOpen(false)} />
          <View
            style={[styles.inboxPanel, narrow && [styles.inboxPanelNarrow, Platform.OS === "web" ? ({ position: "fixed" } as object) : null]]}
            accessibilityLabel="รายการแชทใบงาน"
          >
            <View style={styles.inboxHead}>
              <Text style={[styles.inboxTitle, headingFont]}>แชทใบงาน</Text>
              {unread ? <Text style={styles.inboxSub}>ยังไม่อ่าน {unread} ห้อง</Text> : null}
            </View>
            {!threads || threads.length === 0 ? (
              <Text style={[styles.hint, { padding: 16 }]}>ยังไม่มีแชท — เปิดได้จากปุ่ม “แชทใบงาน” ในหน้าใบงาน</Text>
            ) : (
              <ScrollView style={{ maxHeight: 460 }}>
                {threads.map((t) => (
                  <TouchableOpacity key={t.id} style={[styles.thread, t.unread > 0 && styles.threadNew]} onPress={() => go(t)} accessibilityLabel={`แชท ${t.code}${t.unread ? ` ยังไม่อ่าน ${t.unread}` : ""}`}>
                    <Avatar name={t.last.byName} role={t.last.byRole} size={42} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.threadTop}>
                        <Text style={[styles.threadCode, t.unread > 0 && { fontWeight: "800" }]} numberOfLines={1}>
                          {t.code} · {t.branch}
                        </Text>
                        <Text style={[styles.threadTime, t.unread > 0 && { color: colors.histBlue, fontWeight: "700" }]}>{timeText(t.last.createdAt)}</Text>
                      </View>
                      <Text style={styles.threadTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={[styles.threadLast, t.unread > 0 && styles.threadLastNew]} numberOfLines={1}>
                        {t.last.byName}: {t.last.deleted ? "ลบข้อความแล้ว" : t.last.body || (t.last.hasImage ? "ส่งรูปภาพ" : "")}
                      </Text>
                    </View>
                    {t.unread > 0 ? (
                      <View style={styles.dotNew}>
                        <Text style={styles.dotNewText}>{t.unread}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

const BLUE = colors.histBlue;
const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 24,
    bottom: 24,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: BLUE,
    shadowColor: "#0B2540",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  fabBadge: { position: "absolute", top: -6, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  fabBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  window: {
    position: "absolute",
    right: 24,
    bottom: 24,
    zIndex: 40,
    width: 380,
    height: 540,
    maxHeight: "86%" as unknown as number,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#0B2540",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  windowNarrow: { left: 8, right: 8, bottom: 8, width: undefined, height: 520 },
  winHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  winIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  winTitle: { fontSize: 15.5, lineHeight: 22, fontWeight: "800", color: colors.text },
  winSub: { fontSize: 12, lineHeight: 17, color: colors.textMuted },
  winClose: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },

  list: { flex: 1, backgroundColor: colors.card },
  listIn: { padding: 12, gap: 3 },
  hint: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  emptyBox: { alignItems: "center", gap: 6, paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowMine: { justifyContent: "flex-end" },
  col: { maxWidth: "78%" as unknown as number, gap: 3 },
  who: { flexDirection: "row", alignItems: "center", gap: 6 },
  whoName: { fontSize: 12, fontWeight: "700", color: colors.body },
  rolePill: { borderRadius: 5, paddingHorizontal: 6 },
  rolePillText: { fontSize: 10.5, lineHeight: 16, fontWeight: "800" },
  whoTime: { fontSize: 11, color: colors.textFaint },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  bubbleMine: { backgroundColor: BLUE, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: colors.background, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  error: { paddingHorizontal: 14, paddingVertical: 4, fontSize: 12.5, color: colors.dangerInk },
  bubbleGone: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  goneText: { fontSize: 13.5, fontStyle: "italic", color: colors.textFaint },
  photo: { width: 200, height: 150, borderRadius: 14, backgroundColor: colors.background },
  delLink: { fontSize: 11.5, fontWeight: "700", color: colors.textFaint, paddingHorizontal: 4 },
  closedBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  closedText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  pending: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  pendingImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.background },
  pendingText: { flex: 1, fontSize: 12.5, color: colors.textMuted },
  attach: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.sky50 },
  zoom: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, backgroundColor: "rgba(11,21,32,0.92)", alignItems: "center", justifyContent: "center" },
  zoomImg: { width: "94%" as unknown as number, height: "86%" as unknown as number },
  zoomHint: { marginTop: 8, fontSize: 12.5, color: "#fff" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.background, fontSize: 14.5, color: colors.text },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },

  inboxWrap: { position: "relative", zIndex: 30 },
  inboxBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sky50, alignItems: "center", justifyContent: "center" },
  inboxBadge: { position: "absolute", top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card },
  inboxBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  scrim: { position: "absolute", top: -2000, left: -4000, right: -4000, bottom: -4000, zIndex: 1 },
  inboxPanelNarrow: { top: 64, left: 8, right: 8, width: undefined },
  inboxPanel: {
    position: "absolute",
    top: 50,
    right: -60,
    width: 400,
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: 6,
    shadowColor: "#0B2540",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  inboxHead: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  inboxTitle: { fontSize: 19, fontWeight: "800", color: colors.text },
  inboxSub: { fontSize: 12.5, color: colors.textMuted },
  thread: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 6, borderRadius: 10 },
  threadNew: { backgroundColor: colors.sky50 },
  threadTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  threadCode: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "700", color: colors.text },
  threadTime: { fontSize: 11.5, color: colors.textFaint },
  threadTitle: { fontSize: 12.5, color: colors.textMuted },
  threadLast: { fontSize: 13, color: colors.textMuted },
  threadLastNew: { color: colors.text, fontWeight: "700" },
  dotNew: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: BLUE, alignItems: "center", justifyContent: "center" },
  dotNewText: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
});
