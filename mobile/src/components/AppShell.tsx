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
  // height + overflow pin the shell to the viewport, and minHeight:0 lets the
  // scrolling content shrink instead of growing and pushing the tab bar off
  // the bottom of the page.
  backdrop: {
    flex: 1,
    height: "100%",
    overflow: "hidden",
    alignItems: "center",
    backgroundColor: colors.border,
  },
  column: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    width: "100%",
    maxWidth: 820,
    backgroundColor: colors.background,
  },
});
