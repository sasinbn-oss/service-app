import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { colors } from "../theme";

/**
 * Constrains the app to a readable column on desktop browsers.
 *
 * The screens are laid out for a phone, so on a wide monitor they would
 * otherwise stretch edge to edge and read as a blown-up phone app. On native
 * this renders nothing extra.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", backgroundColor: colors.border },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 820,
    backgroundColor: colors.background,
  },
});
