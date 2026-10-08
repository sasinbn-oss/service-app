/**
 * กล่องใต้ช่องบนมือถือ (แอป) — กางในที่ใต้ช่องแบบเดิม
 *
 * บนเว็บลอยทับ (Popover.web.tsx) แต่ในแอปมือถือทุกช่องอยู่ใน Modal ของเครื่องอยู่แล้ว
 * Modal ซ้อน Modal ในแอปทำงานไม่เหมือนกันแต่ละเครื่อง กางในที่เชื่อถือได้กว่า
 */
import React from "react";
import { View } from "react-native";
import { colors, radius, spacing } from "../theme";
import type { PopoverProps } from "./Popover.web";

export type { PopoverProps };

export default function Popover({ open, children, maxHeight = 330 }: PopoverProps) {
  if (!open) return null;
  return (
    <View
      style={{
        marginTop: spacing.xs,
        maxHeight,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.card,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
