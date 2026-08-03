import { Platform, ViewStyle } from "react-native";

export const colors = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  primarySoft: "#eff6ff",
  danger: "#dc2626",
  dangerSoft: "#fee2e2",
  success: "#16a34a",
  successSoft: "#dcfce7",
  warning: "#d97706",
  warningSoft: "#fef3c7",
  background: "#f1f5f9",
  card: "#ffffff",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

/**
 * Elevation needs different properties per platform: iOS and web take a shadow,
 * Android only understands `elevation`.
 */
function elevation(level: 1 | 2): ViewStyle {
  const config = {
    1: { offset: 1, radius: 3, opacity: 0.06, android: 1 },
    2: { offset: 4, radius: 12, opacity: 0.08, android: 3 },
  }[level];

  return Platform.select<ViewStyle>({
    android: { elevation: config.android },
    default: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: config.offset },
      shadowOpacity: config.opacity,
      shadowRadius: config.radius,
    },
  })!;
}

export const shadow = {
  card: elevation(1),
  raised: elevation(2),
};
