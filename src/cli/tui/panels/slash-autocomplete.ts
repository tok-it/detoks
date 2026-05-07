import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { SlashCommand } from "../../repl-commands/index.js";
import { getContentArea } from "../layout-manager.js";
import { colors } from "../../colors.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const isWideCharacter = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f)
  );
};

const measureDisplayWidth = (text: string): number => {
  let width = 0;
  for (const char of text) {
    width += isWideCharacter(char) ? 2 : 1;
  }
  return width;
};

const truncateLine = (line: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (measureDisplayWidth(line) <= maxWidth) {
    return line;
  }

  if (maxWidth <= 1) {
    return "…";
  }

  const chars = Array.from(line);
  let result = "";
  let width = 0;

  for (const char of chars) {
    const charWidth = isWideCharacter(char) ? 2 : 1;
    if (width + charWidth > maxWidth - 1) {
      break;
    }

    result += char;
    width += charWidth;
  }

  return `${result}…`;
};

const formatCommandLabel = (command: SlashCommand): string => {
  const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
  return `${command.usage}${aliases} — ${command.description}`;
};

export const renderSlashAutocompletePanel = (
  ctx: RenderContext,
  region: PanelRegion,
  query: string,
  commands: SlashCommand[],
  selectedIndex: number,
): void => {
  const { screen } = ctx;
  const { usableWidth, usableHeight } = getContentArea(region);
  const safeWidth = Math.max(0, usableWidth);
  const safeHeight = Math.max(0, usableHeight);
  const maxItems = Math.max(0, safeHeight - 5);
  const needsWindow = commands.length > maxItems && maxItems > 0;
  const windowStart = needsWindow
    ? clamp(
        selectedIndex - Math.floor(maxItems / 2),
        0,
        Math.max(0, commands.length - maxItems),
      )
    : 0;
  const windowEnd = needsWindow ? windowStart + maxItems : commands.length;
  const visibleCommands = maxItems > 0 ? commands.slice(windowStart, windowEnd) : [];
  const selectedVisibleIndex = Math.min(
    Math.max(selectedIndex - windowStart, 0),
    Math.max(0, visibleCommands.length - 1),
  );

  const lines: string[] = [];
  const pushStyledLine = (
    text: string,
    style: (value: string) => string,
  ): void => {
    const truncated = truncateLine(text, safeWidth);
    const padding = " ".repeat(Math.max(0, safeWidth - measureDisplayWidth(truncated)));
    lines.push(`${style(truncated)}${padding}`);
  };

  pushStyledLine("슬래시 자동완성", colors.title);
  pushStyledLine(
    query.length > 0 ? `검색: /${query}` : "입력하며 명령을 좁히세요.",
    colors.muted,
  );

  if (commands.length === 0) {
    lines.push(" ".repeat(safeWidth));
    pushStyledLine("일치하는 명령이 없습니다.", colors.warning);
    pushStyledLine("다른 글자를 입력하거나 Enter로 현재 입력을 실행하세요.", colors.muted);
  } else {
    if (needsWindow) {
      pushStyledLine(`${windowStart + 1}-${windowEnd}/${commands.length}`, colors.muted);
    } else {
      lines.push(" ".repeat(safeWidth));
    }

    for (const [index, command] of visibleCommands.entries()) {
      const isSelected = index === selectedVisibleIndex;
      const label = truncateLine(formatCommandLabel(command), Math.max(0, safeWidth - 2));
      const plainWidth = measureDisplayWidth(`▶ ${label}`);
      const padding = " ".repeat(Math.max(0, safeWidth - plainWidth));
      lines.push(
        isSelected
          ? `${colors.success("▶")} ${colors.boldText(label)}${padding}`
          : `  ${colors.muted(label)}${" ".repeat(Math.max(0, safeWidth - measureDisplayWidth(`  ${label}`)))}`,
      );
    }

    lines.push(" ".repeat(safeWidth));
    pushStyledLine("↑↓ 선택 · Enter 실행 · ESC 닫기", colors.muted);
  }

  let currentRow = region.startRow;
  for (const line of lines) {
    if (currentRow >= region.endRow) {
      break;
    }

    screen.cursorMoveTo(currentRow, 0);
    screen.write(line);
    currentRow += 1;
  }

  while (currentRow < region.endRow) {
    screen.cursorMoveTo(currentRow, 0);
    screen.write(" ".repeat(safeWidth));
    currentRow += 1;
  }
};
