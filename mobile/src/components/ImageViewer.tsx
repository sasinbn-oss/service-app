/**
 * ดูรูปของใบงานเต็มจอ — เลื่อนรูปถัดไป ซูมเข้าออก ลากดูส่วนที่ซูม
 *
 * เดิมกดรูปแล้วเปิดแท็บใหม่ทีละรูป ดูรูปหน้างานห้ารูปต้องเปิดปิดแท็บห้ารอบ และรูปป้ายรุ่น
 * กับใบเหลืองที่ตัวหนังสือเล็กต้องซูมด้วยเบราว์เซอร์เอง — ที่นี่เปิดทับใบงาน กดลูกศร/ปัด
 * ไปรูปถัดไปได้ และซูมได้ทั้งปุ่ม ล้อเมาส์ ดับเบิลคลิก/แตะสองครั้ง และหนีบนิ้วบนมือถือ
 *
 * ลิงก์ของไฟล์ขอทีละรูปตอนจะดู (ลิงก์ชั่วคราว ถังไม่ได้เปิดสาธารณะ) แล้วจำไว้ระหว่างที่เปิดอยู่
 * ระหว่างรอโหลดโชว์รูปย่อที่มีอยู่แล้วก่อน จะได้ไม่เห็นจอดำ
 * วิดีโอกับ PDF ซูมไม่ได้ — ขึ้นปุ่มเปิดไฟล์แทน
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import TouchableOpacity from "./Tap";
import Overlay from "./Overlay";
import { api, apiErrorMessage } from "../api/client";
import { openUrl } from "../utils/share";
import { attachmentIcon } from "../utils/attachments";
import { colors } from "../theme";
import type { Attachment } from "./WorkOrderAttachments";

const MIN = 1;
const MAX = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function ImageViewer({
  workOrderId,
  items,
  startIndex,
  onClose,
}: {
  workOrderId: number;
  items: Attachment[];
  startIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const item = items[index];
  const isImage = item?.kind === "IMAGE";

  // เก็บค่าล่าสุดไว้ใน ref — PanResponder สร้างครั้งเดียว อ่าน state ตรง ๆ จะได้ค่าเก่าตอนสร้าง
  const live = useRef({ scale, pan, index });
  live.current = { scale, pan, index };

  const go = useCallback(
    (d: number) => {
      setIndex((i) => clamp(i + d, 0, items.length - 1));
      setScale(1);
      setPan({ x: 0, y: 0 });
    },
    [items.length]
  );
  const zoomTo = useCallback((s: number) => {
    const next = clamp(s, MIN, MAX);
    setScale(next);
    // ซูมออกจนสุดแล้วรูปต้องกลับมากลางจอ ไม่งั้นค้างอยู่มุมที่ลากไว้
    if (next === 1) setPan({ x: 0, y: 0 });
  }, []);

  // ขอลิงก์ของรูปที่กำลังดู และรูปถัดไป (เปิดรูปถัดไปแล้วขึ้นทันที ไม่ต้องรอ)
  useEffect(() => {
    let alive = true;
    for (const i of [index, index + 1]) {
      const it = items[i];
      if (!it || urls[it.id] || !it.available) continue;
      api
        .get<{ url: string }>(`/work-orders/${workOrderId}/attachments/${it.id}/link`)
        .then((res) => alive && setUrls((u) => ({ ...u, [it.id]: res.data.url })))
        .catch((e) => alive && i === index && setError(apiErrorMessage(e)));
    }
    setError(null);
    return () => {
      alive = false;
    };
    // urls ไม่อยู่ใน deps — ไม่งั้นได้ลิงก์มาแล้ววนขอใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items, workOrderId]);

  // คีย์บอร์ดบนจอคอม: ← → เลื่อนรูป · + − ซูม · 0 กลับขนาดเดิม · Esc ปิด
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoomTo(live.current.scale * 1.4);
      else if (e.key === "-") zoomTo(live.current.scale / 1.4);
      else if (e.key === "0") zoomTo(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, zoomTo, onClose]);

  // ล้อเมาส์ = ซูม (บนจอคอมคือท่าที่คนลองเป็นอย่างแรก)
  // ใช้ callback ref ไม่ใช่ useRef — บนเว็บ Overlay วาดลง <body> ช้ากว่ารอบแรกหนึ่งจังหวะ
  // ตอน effect รันครั้งแรกจึงยังไม่มีตัวรูปให้ผูก แล้วจะไม่ได้ผูกอีกเลย
  const [stageEl, setStageEl] = useState<View | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = stageEl as unknown as HTMLElement | null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(live.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, stageEl]);

  /**
   * นิ้วเดียว: ซูมอยู่ = ลากดูส่วนอื่น · ไม่ได้ซูม = ปัดซ้ายขวาเปลี่ยนรูป
   * สองนิ้ว: หนีบซูม · แตะสองครั้งเร็ว ๆ: สลับ 1× ↔ 2.5×
   */
  const gesture = useRef({ startPan: { x: 0, y: 0 }, startDist: 0, startScale: 1, lastTap: 0, moved: false });
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const g = gesture.current;
        g.startPan = live.current.pan;
        g.startScale = live.current.scale;
        g.startDist = 0;
        g.moved = false;
        const t = e.nativeEvent.touches;
        if (t && t.length === 2) g.startDist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
      },
      onPanResponderMove: (e, s) => {
        const g = gesture.current;
        const t = e.nativeEvent.touches;
        if (Math.abs(s.dx) + Math.abs(s.dy) > 6) g.moved = true;
        if (t && t.length === 2) {
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (!g.startDist) {
            g.startDist = d;
            g.startScale = live.current.scale;
          } else setScale(clamp((g.startScale * d) / g.startDist, MIN, MAX));
          return;
        }
        if (live.current.scale > 1) setPan({ x: g.startPan.x + s.dx, y: g.startPan.y + s.dy });
      },
      onPanResponderRelease: (_e, s) => {
        const g = gesture.current;
        if (live.current.scale === 1 && !g.startDist && Math.abs(s.dx) > 60 && Math.abs(s.dx) > Math.abs(s.dy)) {
          setIndex((i) => clamp(i + (s.dx < 0 ? 1 : -1), 0, items.length - 1));
          return;
        }
        if (!g.moved) {
          const now = Date.now();
          if (now - g.lastTap < 300) {
            const next = live.current.scale > 1 ? 1 : 2.5;
            setScale(next);
            if (next === 1) setPan({ x: 0, y: 0 });
            g.lastTap = 0;
          } else g.lastTap = now;
        }
      },
    })
  ).current;

  if (!item) return null;
  const url = urls[item.id];
  const thumbW = Math.min(width, 1200);

  const body = (
    <View style={styles.backdrop} pointerEvents="auto">
      {/* แถบบน: ลำดับ ชื่อ ป้าย และปุ่ม */}
      <View style={styles.top}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.counter}>
            {index + 1} / {items.length}
            {item.roleLabel ? <Text style={styles.role}>  {item.roleLabel}</Text> : null}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {item.fileName}
            {item.createdByName ? ` · ${item.createdByName}` : ""}
          </Text>
        </View>
        {isImage ? (
          <View style={styles.zoomBox}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => zoomTo(scale / 1.4)} accessibilityLabel="ซูมออก">
              <Ionicons name="remove" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => zoomTo(1)} accessibilityLabel="ขนาดเดิม">
              <Text style={styles.zoomText}>{Math.round(scale * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => zoomTo(scale * 1.4)} accessibilityLabel="ซูมเข้า">
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : null}
        {url ? (
          <TouchableOpacity style={styles.iconBtn} onPress={() => openUrl(url)} accessibilityLabel="เปิดไฟล์ต้นฉบับ">
            <Ionicons name="open-outline" size={19} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityLabel="ปิดรูป">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ตัวรูป */}
      <View ref={setStageEl} style={styles.stage} {...(isImage ? responder.panHandlers : {})}>
        {isImage ? (
          <View
            style={{
              width: thumbW,
              height: height - 190,
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
            }}
          >
            {/* รูปย่อรองไว้ระหว่างรอรูปจริง — เห็นทันทีว่ารูปอะไร ไม่ใช่จอดำ */}
            {item.thumbnailDataUrl && !loaded[item.id] ? (
              <Image source={{ uri: item.thumbnailDataUrl }} style={styles.fill} resizeMode="contain" blurRadius={2} />
            ) : null}
            {url ? (
              <Image
                source={{ uri: url }}
                style={styles.fill}
                resizeMode="contain"
                onLoad={() => setLoaded((l) => ({ ...l, [item.id]: true }))}
                accessibilityLabel={item.fileName}
              />
            ) : null}
            {!loaded[item.id] && !error ? <ActivityIndicator color="#fff" style={styles.spinner} /> : null}
          </View>
        ) : (
          <View style={styles.fileBox}>
            <Ionicons name={attachmentIcon(item.kind)} size={56} color="#fff" />
            <Text style={styles.fileText}>{item.kindLabel} · {item.fileName}</Text>
            {url ? (
              <TouchableOpacity style={styles.openBtn} onPress={() => openUrl(url)}>
                <Text style={styles.openText}>เปิดไฟล์</Text>
              </TouchableOpacity>
            ) : (
              <ActivityIndicator color="#fff" />
            )}
          </View>
        )}
        {!item.available ? <Text style={styles.err}>ไฟล์นี้ส่งขึ้นที่เก็บไม่สำเร็จ เหลือแต่รูปย่อ</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>

      {/* ลูกศรซ้ายขวา — ขยายพื้นที่กดให้ใหญ่ กดง่ายบนมือถือ */}
      {index > 0 ? (
        <TouchableOpacity style={[styles.nav, styles.navLeft]} onPress={() => go(-1)} accessibilityLabel="รูปก่อนหน้า">
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
      ) : null}
      {index < items.length - 1 ? (
        <TouchableOpacity style={[styles.nav, styles.navRight]} onPress={() => go(1)} accessibilityLabel="รูปถัดไป">
          <Ionicons name="chevron-forward" size={30} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* แถบรูปย่อด้านล่าง — กระโดดไปรูปไหนก็ได้ */}
      {items.length > 1 ? (
        <ScrollView horizontal style={styles.strip} contentContainerStyle={styles.stripIn} showsHorizontalScrollIndicator={false}>
          {items.map((it, i) => (
            <TouchableOpacity
              key={it.id}
              onPress={() => {
                setIndex(i);
                setScale(1);
                setPan({ x: 0, y: 0 });
              }}
              style={[styles.thumb, i === index && styles.thumbOn]}
              accessibilityLabel={`รูปที่ ${i + 1}`}
            >
              {it.thumbnailDataUrl ? (
                <Image source={{ uri: it.thumbnailDataUrl }} style={styles.thumbImg} />
              ) : (
                <Ionicons name={attachmentIcon(it.kind)} size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  // เว็บ: วาดลง <body> ผ่าน Overlay (เหนือหน้าต่างใบงานที่เปิดค้าง) · มือถือ: Modal เต็มจอ
  return Platform.OS === "web" ? (
    <Overlay>{body}</Overlay>
  ) : (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, width: "100%", backgroundColor: "rgba(6,12,18,0.97)" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  counter: { color: "#fff", fontSize: 15, lineHeight: 22, fontWeight: "800" },
  role: { color: "#FCD34D", fontSize: 13, fontWeight: "700" },
  name: { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18 },
  zoomBox: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 4 },
  zoomText: { color: "#fff", fontSize: 12, fontWeight: "700", minWidth: 44, textAlign: "center" },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  spinner: { position: "absolute", top: "50%", left: "50%", marginLeft: -10, marginTop: -10 },
  fileBox: { alignItems: "center", gap: 12 },
  fileText: { color: "#fff", fontSize: 14 },
  openBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 },
  openText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  err: { position: "absolute", bottom: 12, color: "#FCA5A5", fontSize: 13 },
  nav: {
    position: "absolute",
    top: "45%",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  navLeft: { left: 12 },
  navRight: { right: 12 },
  strip: { flexGrow: 0, flexShrink: 0 },
  stripIn: { gap: 8, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: "auto" },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    opacity: 0.6,
  },
  thumbOn: { borderColor: "#fff", opacity: 1 },
  thumbImg: { width: "100%", height: "100%" },
});
