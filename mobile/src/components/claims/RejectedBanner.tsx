/**
 * แถบเหตุผลที่ถูกตีกลับ ปักไว้บนสุดของฟอร์มปิดงาน (AppModal banner) ตอนแก้เคลม
 *
 * เดิมเหตุผลอยู่บนหน้าใบงานเท่านั้น พอเปิดฟอร์มปิดงานช่างต้องจำเอาเองว่าโดนตีกลับเรื่องอะไร
 * แล้วเลื่อนฟอร์มยาว ๆ หาช่องที่ต้องแก้ — ปักไว้ใต้หัวฟอร์ม เลื่อนไปช่องไหนก็ยังเห็น (ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69)
 * บอกทุกชิ้นที่ถูกตีกลับ ไม่ใช่แค่แถวแรก — ใบที่เคลมสองชิ้นอาจโดนคนละเหตุผล
 *
 * ย่อไว้ก่อน (ชิ้นละไม่เกินสองบรรทัด · ไม่เกินสองชิ้น) กดดูเต็มได้ และตอนเปิดเต็มสูงไม่เกินราวหนึ่งในสามของจอ เลื่อนในแถบเอง:
 * แถบนี้อยู่นอกส่วนที่เลื่อนของฟอร์ม เหตุผลยาว (รับได้ถึง 1000 ตัว และตอนนี้ตีกลับทั้งใบใช้เหตุผลเดียวกันทุกชิ้น
 * จึงซ้ำตามจำนวนชิ้น) ดันฟอร์มจนเหลือแถบบาง ๆ บนมือถือ — ช่างเลื่อนไปช่องที่ต้องแก้ไม่ได้
 * เหตุผลเต็มของแต่ละชิ้นอยู่ในกล่องของชิ้นนั้นในฟอร์มอยู่แล้ว ("ตีกลับ: …")
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import TouchableOpacity from "../Tap";
import { colors, spacing } from "../../theme";
import { dayTime } from "./ClaimTrail";

/** ย่อแล้วยังเห็นครบ ไม่ต้องมีปุ่มดูเต็ม — ประมาณสองบรรทัดบนจอมือถือแคบ */
const SHORT = 70;
const SHOWN = 2;

export default function RejectedBanner({
  reviewer,
  at,
  lines,
}: {
  reviewer: string | null;
  at: string | null;
  lines: { part: string; reason: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const meta = [reviewer, dayTime(at)].filter(Boolean).join(" · ");
  const long = lines.length > SHOWN || lines.some((l) => l.reason.length > SHORT);
  const shown = open ? lines : lines.slice(0, SHOWN);
  const body = shown.map((l, i) => (
    <Text key={`${l.part}-${i}`} style={styles.line} numberOfLines={open ? undefined : 2}>
      <Text style={{ fontWeight: "800" }}>{l.part}:</Text> “{l.reason}”
    </Text>
  ));
  return (
    <View style={styles.box} accessibilityLabel="เหตุผลที่ Admin Spare Part ตีกลับ">
      <Text style={styles.title}>Admin Spare Part ตีกลับใบเคลม — แก้แล้วส่งใหม่</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {open ? (
        <ScrollView style={{ maxHeight: Math.round(height * 0.33) }} contentContainerStyle={{ gap: 2 }}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {long ? (
        <TouchableOpacity
          style={styles.more}
          onPress={() => setOpen((o) => !o)}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>
            {open
              ? "ย่อเหตุผล ▴"
              : lines.length > SHOWN
                ? `ดูเหตุผลครบ ${lines.length} ชิ้น ▾`
                : "ดูเหตุผลเต็ม ▾"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.dangerSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.dangerLine,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  title: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.dangerInk },
  meta: { fontSize: 12, lineHeight: 17, color: colors.dangerInk },
  line: { fontSize: 14, lineHeight: 20, color: colors.dangerInk },
  // สูง 40 + hitSlop บนล่าง = พื้นที่กด 48 โดยไม่ทำให้แถบที่ปักไว้สูงขึ้นอีก
  more: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingRight: spacing.md },
  moreText: { fontSize: 13, fontWeight: "800", color: colors.dangerInk, textDecorationLine: "underline" },
});
