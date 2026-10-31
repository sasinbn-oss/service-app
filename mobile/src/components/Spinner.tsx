import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { colors, shadow } from "../theme";
import { useChrome } from "../utils/chrome";

/**
 * เครื่องซักผ้าหมุน — ตัวบอก "กำลังโหลด" ตัวเดียวของทั้งแอป ตามมาตรฐาน OTTERI
 *
 * ใช้แทน ActivityIndicator ทุกที่ ทั้งหน้าที่กำลังโหลดและปุ่มที่กำลังบันทึก
 * วงหมุนธรรมดาหน้าตาต่างกันตามเครื่อง (iOS / Android / เบราว์เซอร์) ส่วนอันนี้
 * เหมือนกันทุกที่ และคนใช้จำได้ว่าเป็นของระบบนี้
 */
export function WasherIcon({ size = 92, color = colors.primary }: { size?: number; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  /*
    สัดส่วนทุกตัวลอกจาก .washer / .drum / .water ใน otteri-theme.css ของชุด OTTERI
    (ตัวเต็มสูง 92 px) แล้วคูณด้วย k — ตัวเล็กในปุ่มกับตัวใหญ่กลางจอจึงเป็นรูปเดียวกับต้นแบบ
    เดิมวาดเองจากคำบรรยาย ตัวเครื่องโปร่งใสและน้ำจาง หน้าตาเลยไม่ตรงกับต้นแบบ
  */
  const k = size / 92;
  const border = Math.max(1.5, 3 * k);
  const onButton = color.toLowerCase() === "#fff" || color.toLowerCase() === "#ffffff";
  const drum = 50 * k;
  const inner = drum - border * 2;
  const detail = size >= 30; // ตัวเล็กเกินไปจะเห็นช่องผงซักฟอกกับไฟเป็นจุดเลอะ ๆ ตัดทิ้ง
  const brand = color === colors.primary;
  // สีเดียวกับต้นแบบเมื่อเป็นสีหลัก สีอื่น (เช่น ในปุ่มแดง) ใช้สีนั้นแบบจางแทน
  const water = brand ? "#7FD0F2" : color;

  return (
    <View
      style={{
        width: 78 * k,
        height: size,
        borderRadius: 16 * k,
        borderWidth: border,
        borderColor: color,
        backgroundColor: onButton ? "transparent" : colors.card,
        ...(size >= 60 ? shadow.raised : null),
      }}
    >
      {detail ? (
        <>
          <View
            style={{
              position: "absolute",
              top: 8 * k - border,
              left: 10 * k - border,
              width: 22 * k,
              height: 5 * k,
              borderRadius: 3 * k,
              backgroundColor: onButton ? "rgba(255,255,255,0.5)" : colors.primarySoft,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 7 * k - border,
              right: 10 * k - border,
              width: 8 * k,
              height: 8 * k,
              borderRadius: 4 * k,
              backgroundColor: colors.success,
            }}
          />
        </>
      ) : null}
      <View
        style={{
          position: "absolute",
          left: (78 * k - drum) / 2 - border,
          top: size * 0.56 - drum / 2 - border,
          width: drum,
          height: drum,
          borderRadius: drum / 2,
          borderWidth: border,
          borderColor: color,
          overflow: "hidden",
          backgroundColor: onButton ? "transparent" : colors.card,
        }}
      >
        {/* .water { inset: 40% -30% -30% } — ผิวน้ำเริ่มที่ 40% ของถัง กว้างเกินถังแล้วหมุน */}
        <Animated.View
          style={{
            position: "absolute",
            top: inner * 0.4,
            left: -inner * 0.3,
            width: inner * 1.6,
            height: inner * 0.9,
            borderRadius: inner * 0.42,
            backgroundColor: water,
            opacity: brand ? 1 : onButton ? 0.55 : 0.45,
            transform: [{ rotate }],
          }}
        />
      </View>
    </View>
  );
}

/**
 * ใช้แทน <ActivityIndicator> ได้ตรงตัว (รับ color / size / style เหมือนกัน)
 *
 * - size="small" หรือสีขาว (อยู่ในปุ่มสี) = เครื่องซักผ้าเล็กพอดีบรรทัด ไม่มีข้อความ
 * - นอกนั้น = หน้ากำลังโหลด ตัวใหญ่พร้อมข้อความ คนจะได้รู้ว่ารออะไรอยู่
 *   ไม่ใช่จ้องจอว่างแล้วสงสัยว่าแอปค้าง
 * - page = ข้อมูลหลักของหน้ายังไม่มา และตัวโหลดคือทุกอย่างใต้หัวหน้า → วางกลางที่ว่างที่เหลือ (ดู PageSpinner)
 *   ห้ามใช้กับตัวโหลดย่อยในการ์ด หน้าต่าง หรือส่วนหนึ่งของหน้าที่มีของอื่นขึ้นอยู่แล้ว
 */
export default function Spinner({
  color = colors.primary,
  size,
  style,
  label = "กำลังโหลด...",
  page,
}: {
  color?: string;
  size?: "small" | "large" | number;
  style?: StyleProp<ViewStyle>;
  label?: string | null;
  page?: boolean;
}) {
  const onButton = color.toLowerCase() === "#fff" || color.toLowerCase() === "#ffffff";
  const small = size === "small" || onButton;
  // ตัวใหญ่ใช้ขนาดเต็มของต้นแบบ (92 px) — ต้นแบบมีขนาดเดียว ไม่มีตัวกลาง
  const px = typeof size === "number" ? size : small ? 22 : 92;
  if (page && !small) return <PageSpinner color={color} px={px} label={label} style={style} />;
  return (
    <View style={[small ? styles.inline : styles.block, style]}>
      <WasherIcon size={px} color={color} />
      {!small && label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

/** ระยะบน/ล่างของตัวโหลดแบบบล็อกเดิม — แบบกลางหน้าไม่บีบต่ำกว่านี้ จอเตี้ยหรือหัวหน้าสูงจึงหน้าตาเหมือนเดิม */
const BLOCK_PAD = 16;

/** กล่องเลื่อนแนวตั้งที่ใกล้ที่สุด (เว็บ) — ขอบล่างของมันคือขอบล่างที่มองเห็นของหน้า */
function scrollBoxOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

/**
 * ตัวโหลดกลางหน้า — เจ้าของงานถาม (ต.ค. 69) ว่าทำไมเครื่องซักผ้าไม่อยู่กลางหน้า
 * เดิมวางต่อจากหัวหน้าเลย จอคอมสูง ๆ จึงเห็นติดอยู่ใต้ชื่อหน้า ข้างล่างว่างทั้งจอ
 *
 * ตัวโหลดส่วนใหญ่อยู่ในกล่องเลื่อน (ScrollView / FlatList) ที่สูงเท่าเนื้อหา flex: 1 จึงยืดไม่ได้
 * และจะใส่ flexGrow ให้กล่องเลื่อนก็ไม่ได้เพราะเปลี่ยนหน้าตาตอนโหลดเสร็จ
 * จึงวัดเอา: ขอบบนของตัวเองบนจอ ถึงขอบล่างที่มองเห็น แล้วเว้นบนให้เครื่องซักผ้า+ข้อความอยู่กลางช่วงนั้น
 *
 * เว้นบนแทนที่จะยืดสูงเต็มแล้วจัดกลาง — ยืดเต็มแล้ว padding ท้ายหน้าล้นจอ แถบเลื่อนโผล่ระหว่างโหลด
 * (Windows แถบเลื่อนกินที่ 15 px หน้าขยับซ้ายขวา) ข้างล่างก็ยืดให้เท่าที่ไม่ล้น การ์ดที่ห่อตัวโหลดอยู่จึงยาวถึงล่างจอ
 *
 * ขอบล่างที่มองเห็น:
 * - เว็บ: ขอบล่างของกล่องเลื่อน (หรือกล่องแม่ถ้าไม่ได้อยู่ในกล่องเลื่อน) — แท็บล่างอยู่นอกกล่องนี้แล้ว
 *   จอคอมเมนูค้างซ่อนแท็บล่าง (MainNavigator) กล่องก็ยาวถึงล่างจอเอง ไม่ต้องรู้ว่าเมนูค้างไหม
 *   ยกเว้นโหมดลอยของรายการใบงานบนจอแคบ (utils/chrome.ts) แท็บล่างลอยทับกล่อง จึงหักความสูงแท็บเอง
 *   วัดจากกล่องไม่ใช่ขอบจอ เพราะหน้าใหม่เลื่อนขึ้น 8 px ตอนเปิด (PageEnter) ทั้งตัวโหลดและกล่องเลื่อนไปพร้อมกัน
 *   ถ้าเทียบกับขอบจอ ตัวโหลดจะต่ำไป 4 px ค้างไว้อย่างนั้นหลังหน้านิ่ง
 * - มือถือ: ความสูงจอ − แท็บล่าง (หรือขอบจอล่างถ้าไม่มีแท็บ)
 *
 * ซ่อนไว้ (opacity 0) จนวัดเสร็จ ไม่งั้นเห็นเครื่องซักผ้าโผล่ใต้หัวแล้วกระโดดลงมากลางจอ
 */
function PageSpinner({ color, px, label, style }: { color: string; px: number; label: string | null; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const tabH = useContext(BottomTabBarHeightContext);
  const insets = useContext(SafeAreaInsetsContext);
  const { overlay } = useChrome();
  const [inner, setInner] = useState(0);
  const [pad, setPad] = useState<{ top: number; bottom: number } | null>(null);
  const [late, setLate] = useState(false);

  // winW อยู่ในรายการเพราะจอแคบลง ของข้างบนตัดบรรทัดใหม่ สูงไม่เท่าเดิม — ต้องวัดใหม่แม้ในตัวไม่ได้ใช้
  const measure = useCallback(() => {
    const node = ref.current;
    if (!node || !inner) return;
    // below = ของที่ยังอยู่ต่อท้ายตัวโหลดในกล่องเลื่อน (padding ท้ายหน้า ขอบการ์ด) — null = วัดไม่ได้ (มือถือ · ไม่ได้อยู่ในกล่องเลื่อน)
    const place = (free: number, below: number | null) => {
      const room = free - inner;
      let top = Math.floor(room / 2);
      // ดันท้ายหน้าล้นจอไม่ได้ (แถบเลื่อนโผล่) — ยอมให้สูงกว่ากลางนิดหน่อยแทน · เผื่อ 2 px ให้เศษทศนิยม
      if (below !== null) top = Math.min(top, Math.floor(room - below) - 2);
      top = Math.max(BLOCK_PAD, top);
      const bottom = below === null ? BLOCK_PAD : Math.max(0, Math.floor(room - top - below) - 2);
      setPad((p) => (p && Math.abs(p.top - top) <= 1 && Math.abs(p.bottom - bottom) <= 1 ? p : { top, bottom }));
    };
    if (Platform.OS === "web") {
      // อ่านจาก DOM ตรง ๆ ทันที — measureInWindow ของเว็บรอ setTimeout ก่อน จอวาดตำแหน่งเก่าไปหนึ่งเฟรม
      const el = node as unknown as HTMLElement;
      if (!el.isConnected) return;
      const box = scrollBoxOf(el);
      const frame = (box ?? el.parentElement)?.getBoundingClientRect();
      // กล่องสูง 0 = หน้านี้ถูกซ่อนอยู่ (แท็บอื่น) วัดตอนนี้ได้ค่าผิด — รอขนาดเปลี่ยนตอนหน้าโผล่ค่อยวัด
      if (!frame || !frame.height) return;
      const own = el.getBoundingClientRect();
      const content = box?.firstElementChild?.getBoundingClientRect();
      // โหมดลอย: กล่องเลื่อนยาวลอดใต้แท็บลงไปถึงล่างจอ และรายการเว้นท้ายเท่าแท็บไว้แล้ว (ให้ใบสุดท้ายพ้นแท็บ)
      // ส่วนที่เว้นนั้นซ่อนอยู่ใต้แท็บ ไม่ได้กินที่ที่มองเห็น — ไม่หักออกจาก below = นับแท็บซ้ำสองรอบ
      // เพดานกันล้นแน่นเกินไป 76 px จอเตี้ย (iPhone SE ในเบราว์เซอร์) เครื่องซักผ้ากลับไปติดใต้หัวเหมือนเดิม
      const tb = overlay ? tabH ?? 0 : 0;
      place(frame.bottom - tb - own.top, content ? Math.max(0, content.bottom - own.bottom - tb) : null);
      return;
    }
    node.measureInWindow((_x, y) => place(winH - (tabH ?? insets?.bottom ?? 0) - y, null));
  }, [inner, winH, winW, tabH, insets?.bottom, overlay]);

  useEffect(() => {
    measure();
  }, [measure]);

  // onLayout บนเว็บดูแค่ขนาดของตัวเอง — ของข้างบนสูงขึ้นทีหลัง (ตัวเลขในตัวกรองที่โหลดแยก) ดันตัวโหลดลงโดยไม่มีอะไรบอก
  // จึงฟังขนาดของกล่องแม่และของชิ้นที่อยู่ติดข้างบนเพิ่ม
  // และฟังว่ามีชิ้นใหม่ถูกแทรกเข้ามาข้างบนไหม (ชิปหมวดของคู่มือมาก่อนรายการ) — กล่องแม่ flex: 1 ไม่ยืดตาม
  // ชิ้นเดิมข้างบนก็ขนาดเท่าเดิม ไม่มีขนาดไหนเปลี่ยนให้เห็น ตัวโหลดถูกดันต่ำกว่ากลางค้างไว้จนโหลดเสร็จ
  useEffect(() => {
    if (Platform.OS !== "web" || typeof ResizeObserver === "undefined") return;
    const el = ref.current as unknown as HTMLElement | null;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => measure());
    const follow = () => {
      ro.disconnect();
      ro.observe(parent);
      if (el.previousElementSibling) ro.observe(el.previousElementSibling);
    };
    follow();
    const mo = new MutationObserver(() => {
      follow();
      measure();
    });
    mo.observe(parent, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  // กันกรณีวัดไม่ได้ (เช่นวัดก่อนหน้าถูกแสดง) — โหลดนานแล้วต้องเห็นเครื่องซักผ้า ถึงจะไม่อยู่กลางเป๊ะ
  // มือถือวัดซ้ำด้วย: ตอนหน้าเปิดแอนิเมชันเปลี่ยนหน้าของเครื่องยังเลื่อนหน้าอยู่ ค่าที่วัดครั้งแรกจึงเพี้ยนได้
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    const t = setTimeout(() => {
      if (Platform.OS !== "web") measureRef.current();
      setLate(true);
    }, 450);
    return () => clearTimeout(t);
  }, []);

  return (
    <View
      ref={ref}
      onLayout={measure}
      style={[
        styles.page,
        style,
        { paddingTop: pad?.top ?? BLOCK_PAD, paddingBottom: pad?.bottom ?? BLOCK_PAD, opacity: pad || late ? 1 : 0 },
      ]}
    >
      <View style={styles.pageInner} onLayout={(e) => setInner(Math.ceil(e.nativeEvent.layout.height))}>
        <WasherIcon size={px} color={color} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inline: { alignItems: "center", justifyContent: "center" },
  block: { alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 16 },
  // ยืดเต็มความกว้างเสมอ แม้กล่องแม่จะ alignItems: "center" — เครื่องซักผ้าจึงอยู่กลางคอลัมน์ของหน้า
  page: { alignSelf: "stretch", alignItems: "center" },
  pageInner: { alignItems: "center", gap: 14 },
  // .loader p ของต้นแบบ: ตัวหนา สีกรมท่า ห่างจากเครื่อง 14 px
  label: { fontSize: 15, lineHeight: 24, fontWeight: "600", color: colors.navy },
});
