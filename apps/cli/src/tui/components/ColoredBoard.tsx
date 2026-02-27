import React from "react";
import { Box, Text } from "ink";

/**
 * Maps CSS classes from game UI renderBoard() output to terminal colors.
 * These match the definitions in apps/web/src/styles/terminal.css.
 */
const CLASS_STYLES: Record<string, { color?: string; bold?: boolean }> = {
  // Chess
  "chess-white": { color: "#00ffff" },
  "chess-black": { color: "#ffb000" },
  "chess-last-move": { bold: true },
  // Tic-tac-toe
  "ttt-x": { color: "#00ffff" },
  "ttt-o": { color: "#ffb000" },
  // Connect Four
  "c4-r": { color: "#00ffff" },
  "c4-y": { color: "#ffb000" },
  // Othello
  "oth-b": { color: "#00ffff" },
  "oth-w": { color: "#ffb000" },
  // Hex
  "hex-r": { color: "#00ffff" },
  "hex-b": { color: "#ffb000" },
  // Checkers
  "ck-black": { color: "#00ffff" },
  "ck-white": { color: "#ffb000" },
  // Sudoku
  "sudoku-clue": { color: "#00ff41", bold: true },
  "sudoku-player": { color: "#00ffff" },
  "sudoku-error": { color: "#ff3333" },
};

interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
}

function parseSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /<span class="([^"]*)">(.*?)<\/span>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index) });
    }

    const classes = match[1].split(/\s+/);
    const content = match[2];
    let color: string | undefined;
    let bold: boolean | undefined;

    for (const cls of classes) {
      const style = CLASS_STYLES[cls];
      if (style) {
        if (style.color) color = style.color;
        if (style.bold) bold = true;
      }
    }

    segments.push({ text: content, color, bold });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex) });
  }

  return segments;
}

/**
 * Renders board HTML (with <span class="..."> tags) as colored Ink text.
 * Falls back to plain text for any content without spans.
 */
export function ColoredBoard({ html }: { html: string }) {
  const lines = html.split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const segments = parseSegments(line);
        return (
          <Text key={i}>
            {segments.map((seg, j) => (
              <Text key={j} color={seg.color} bold={seg.bold}>
                {seg.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </Box>
  );
}
