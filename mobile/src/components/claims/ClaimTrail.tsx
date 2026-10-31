/**
 * แถบสถานะเคลมแบบย่อ — "ส่งเคลม 30 ต.ค. 09:12 (ช่าง สมชาย) → ตีกลับ 14:05 (บอร์ดควบคุม · คุณวันดี) → รอช่างแก้"
 *
 * ทำไมต้องมี: ใบเดียวเดินไปกลับระหว่างช่างกับ Admin Spare Part ได้หลายรอบ เดิมการ์ดบอกแค่สถานะล่าสุด
 * ช่างไม่รู้ว่าส่งไปกี่รอบแล้ว ใครตีกลับเมื่อไหร่ และตอนนี้รอใคร (ตัวอย่างที่เจ้าของงานเลือก ต.ค. 69 · sample strip)
 * เขียนวันที่เฉพาะตอนวันเปลี่ยน — วันเดียวกันซ้ำทุกช่วงอ่านยากบนจอมือถือ
 * ตัวเดียวกันใช้บนการ์ดงานของฉัน (ก้อน 1) และหน้าตรวจเคลม/การ์ดเคลมในใบงาน (ก้อน 2)
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../theme";

/** เหตุการณ์หนึ่งช่วงของเคลม — เซิร์ฟเวอร์สร้างจากประวัติใบงาน (my-day claim.trail) */
export interface TrailEvent {
  k: "send" | "reject" | "resend" | "approve" | "close";
  at: string;
  who?: string | null;
  /** ตีกลับ: "ทั้งใบ" หรือชื่ออะไหล่ · ปิดงาน: เหตุ เช่น "ปิดเคลม ไม่ส่งผู้ขาย" */
  what?: string | null;
}

const TZ = "Asia/Bangkok";
/** "30 ต.ค." */
export function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { timeZone: TZ, day: "numeric", month: "short" });
}
/** "14:05" */
export function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
/** "30 ต.ค. 14:05" */
export function dayTime(iso: string | null | undefined) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return `${shortDay(iso)} ${hhmm(iso)}`;
}

export function trailHead(trail: TrailEvent[]): string {
  let lastDay = "";
  return trail
    .filter((e) => e && e.at && !Number.isNaN(Date.parse(e.at)))
    .map((e) => {
      const day = shortDay(e.at);
      const when = (day !== lastDay ? `${day} ` : "") + hhmm(e.at);
      lastDay = day;
      const who = e.who ?? "";
      if (e.k === "send") return `ส่งเคลม ${when}${who ? ` (ช่าง ${who})` : ""}`;
      if (e.k === "reject") {
        const inner = [e.what, who].filter(Boolean).join(" · ");
        return `ตีกลับ ${when}${inner ? ` (${inner})` : ""}`;
      }
      if (e.k === "resend") return `ส่งใหม่ ${when}`;
      if (e.k === "approve") return `อนุมัติ ${when}${who ? ` (${who})` : ""}`;
      // ปิดงานโดยไม่มีชิ้นที่ส่งผู้ขาย — มีเหตุ (ปิดเคลม ไม่ส่งผู้ขาย · คนตรวจ) หรือไม่ได้ส่งเคลมเลย
      return e.what ? `ปิดงาน ${when} (${[e.what, who].filter(Boolean).join(" · ")})` : `ปิดงาน ${when} (ไม่ส่งเคลม)`;
    })
    .join(" → ");
}

export default function ClaimTrail({
  trail,
  tail,
  tailColor = colors.warningInk,
}: {
  trail: TrailEvent[];
  /** ตอนนี้รอใคร (ตัวหนา ท้ายแถบ) เช่น "รอช่างแก้" · ว่าง = จบแล้ว */
  tail?: string | null;
  tailColor?: string;
}) {
  const head = trailHead(trail ?? []);
  if (!head && !tail) return null;
  return (
    <View style={styles.strip} accessibilityLabel="สถานะเคลม">
      <Text style={styles.text}>
        {head}
        {head && tail ? " → " : ""}
        {tail ? <Text style={[styles.tail, { color: tailColor }]}>{tail}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { backgroundColor: colors.rowAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  text: { fontSize: 12, lineHeight: 18, color: colors.body },
  tail: { fontWeight: "800" },
});
