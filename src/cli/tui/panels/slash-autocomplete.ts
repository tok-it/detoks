import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import type { SlashCommand } from "../../repl-commands/index.js";
import { getContentArea } from "../layout-manager.js";
import { measureDisplayWidth } from "../renderer.js";
import { fillRemaining, truncateByDisplayWidth } from "./base.js";
import { glyph, statusColor } from "../design/tokens.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

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
    const truncated = truncateByDisplayWidth(text, safeWidth);
    const padding = " ".repeat(Math.max(0, safeWidth - measureDisplayWidth(truncated)));
    lines.push(`${style(truncated)}${padding}`);
  };

  pushStyledLine("슬래시 자동완성", statusColor.title);
  pushStyledLine(
    query.length > 0 ? `검색: /${query}` : "입력하며 명령을 좁히세요.",
    statusColor.muted,
  );

  if (commands.length === 0) {
    lines.push(" ".repeat(safeWidth));
    pushStyledLine("일치하는 명령이 없습니다.", statusColor.warn);
    pushStyledLine("다른 글자를 입력하거나 Enter로 현재 입력을 실행하세요.", statusColor.muted);
  } else {
    if (needsWindow) {
      pushStyledLine(`${windowStart + 1}-${windowEnd}/${commands.length}`, statusColor.muted);
    } else {
      lines.push(" ".repeat(safeWidth));
    }

    for (const [index, command] of visibleCommands.entries()) {
      const isSelected = index === selectedVisibleIndex;
      const label = truncateByDisplayWidth(formatCommandLabel(command), Math.max(0, safeWidth - 2));
      const plainWidth = measureDisplayWidth(`${glyph.selected} ${label}`);
      const padding = " ".repeat(Math.max(0, safeWidth - plainWidth));
      lines.push(
        isSelected
          ? `${statusColor.success(glyph.selected)} ${statusColor.strong(label)}${padding}`
          : `  ${statusColor.muted(label)}${" ".repeat(Math.max(0, safeWidth - measureDisplayWidth(`  ${label}`)))}`,
      );
    }

    lines.push(" ".repeat(safeWidth));
    pushStyledLine("↑↓ 선택 · Enter 실행 · ESC 닫기", statusColor.muted);
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

  fillRemaining(ctx, region, currentRow);
};
