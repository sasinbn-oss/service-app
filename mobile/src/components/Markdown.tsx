import React from "react";
import { ScrollView, StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
import { colors, radius, spacing } from "../theme";

/**
 * Renders the small slice of Markdown the assistant actually produces:
 * headings, bullet and numbered lists, tables, rules, and inline **bold**.
 *
 * A full Markdown library is a heavy dependency for that, and most of them
 * render to HTML, which does not exist on native. Anything unrecognised falls
 * through as plain text, so an unexpected construct degrades to readable output
 * instead of disappearing.
 */

/** Splits on **bold** runs so a heading or cell can mix weights. */
function InlineText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part.replace(/`/g, "")}</Text>
        )
      )}
    </Text>
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
/** The |---|---| line under a table header. */
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

function Table({ rows }: { rows: string[][] }) {
  const [header, ...body] = rows;
  // Wide reports would squeeze columns to nothing on a phone, so the table
  // scrolls sideways instead of wrapping every cell to one character.
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          {header.map((cell, i) => (
            <View key={i} style={styles.tableCell}>
              <InlineText text={cell} style={styles.tableHeaderText} />
            </View>
          ))}
        </View>
        {body.map((row, r) => (
          <View key={r} style={styles.tableRow}>
            {row.map((cell, i) => (
              <View key={i} style={styles.tableCell}>
                <InlineText text={cell} style={styles.tableText} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableDivider(lines[i])) rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      if (rows.length > 0) blocks.push(<Table key={blocks.length} rows={rows} />);
      continue;
    }

    if (!line.trim()) {
      blocks.push(<View key={blocks.length} style={styles.gap} />);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<View key={blocks.length} style={styles.rule} />);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <InlineText
          key={blocks.length}
          text={heading[2]}
          style={[styles.heading, level <= 2 ? styles.h1 : styles.h3]}
        />
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <View key={blocks.length} style={styles.listItem}>
          <Text style={styles.bulletDot}>•</Text>
          <InlineText text={bullet[1]} style={styles.listText} />
        </View>
      );
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      blocks.push(
        <View key={blocks.length} style={styles.listItem}>
          <Text style={styles.bulletNum}>{numbered[1]}.</Text>
          <InlineText text={numbered[2]} style={styles.listText} />
        </View>
      );
      continue;
    }

    blocks.push(<InlineText key={blocks.length} text={line} style={styles.paragraph} />);
  }

  return <View>{blocks}</View>;
}

const styles = StyleSheet.create({
  // Thai vowel and tone marks sit above the line, so every text style needs a
  // lineHeight well above its fontSize or the marks get clipped.
  paragraph: { fontSize: 15, lineHeight: 24, color: colors.text },
  bold: { fontWeight: "700" },
  heading: { color: colors.text, fontWeight: "700", marginTop: spacing.md, marginBottom: 2 },
  h1: { fontSize: 18, lineHeight: 28 },
  h3: { fontSize: 16, lineHeight: 26 },
  listItem: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.xs },
  bulletDot: { fontSize: 15, lineHeight: 24, color: colors.textMuted },
  bulletNum: { fontSize: 15, lineHeight: 24, color: colors.textMuted, fontWeight: "600" },
  listText: { flex: 1, fontSize: 15, lineHeight: 24, color: colors.text },
  gap: { height: spacing.sm },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  tableScroll: { marginVertical: spacing.sm },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  tableHeaderRow: { borderTopWidth: 0, backgroundColor: colors.primarySoft },
  tableCell: { minWidth: 96, maxWidth: 220, padding: spacing.sm },
  tableHeaderText: { fontSize: 13, lineHeight: 22, fontWeight: "700", color: colors.text },
  tableText: { fontSize: 13, lineHeight: 22, color: colors.text },
});
