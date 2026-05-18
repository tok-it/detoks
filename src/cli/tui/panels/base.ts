import type { RenderContext } from "../renderer.js";
import type { PanelRegion } from "../layout-manager.js";
import { getContentArea } from "../layout-manager.js";
import { measureDisplayWidth, padDisplayWidth } from "../renderer.js";
import { glyph, statusColor, type Style } from "../design/tokens.js";

export const fillRemaining = (
  ctx: RenderContext,
  region: PanelRegion,
  fromRow: number,
): number => {
  const { usableWidth } = getContentArea(region);
  let row = fromRow;
  while (row < region.endRow) {
    ctx.screen.cursorMoveTo(row, 0);
    ctx.screen.write(" ".repeat(usableWidth));
    row += 1;
  }
  return row;
};

export const writePaddedLine = (
  ctx: RenderContext,
  row: number,
  text: string,
  usableWidth: number,
  style: Style = (value) => value,
): void => {
  ctx.screen.cursorMoveTo(row, 0);
  ctx.screen.write(style(padDisplayWidth(truncateByDisplayWidth(text, usableWidth), usableWidth)));
};

export interface EmptyStateOptions {
  style?: Style;
}

export const renderEmptyState = (
  ctx: RenderContext,
  region: PanelRegion,
  lines: readonly string[],
  options: EmptyStateOptions = {},
): number => {
  const { usableWidth } = getContentArea(region);
  const style = options.style ?? statusColor.muted;
  let row = region.startRow;
  for (const line of lines) {
    if (row >= region.endRow) break;
    writePaddedLine(ctx, row, line, usableWidth, style);
    row += 1;
  }
  return fillRemaining(ctx, region, row);
};

const ellipsisRight = (text: string, maxWidth: number, marker: string): string => {
  if (maxWidth <= 0) {
    return "";
  }

  if (measureDisplayWidth(text) <= maxWidth) {
    return text;
  }

  const markerWidth = measureDisplayWidth(marker);
  if (maxWidth <= markerWidth) {
    return marker.slice(0, maxWidth);
  }

  const targetWidth = maxWidth - markerWidth;
  let result = "";
  let width = 0;
  for (const char of Array.from(text)) {
    const charWidth = measureDisplayWidth(char);
    if (width + charWidth > targetWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }
  return `${result}${marker}`;
};

// Length-based truncation (counts code units, not display cells).
// Preserves the existing pipeline-status / result-summary / transcript behavior.
export const truncateByLength = (line: string, maxWidth: number): string => {
  if (maxWidth <= 0) {
    return "";
  }
  if (line.length <= maxWidth) {
    return line.padEnd(maxWidth);
  }
  if (maxWidth <= 3) {
    return ".".repeat(maxWidth);
  }
  return `${line.slice(0, maxWidth - 3)}${glyph.ellipsisThreeDot}`;
};

// Display-width-aware truncation with a single-char ellipsis.
// Matches the existing slash-autocomplete behavior.
export const truncateByDisplayWidth = (
  line: string,
  maxWidth: number,
): string => ellipsisRight(line, maxWidth, glyph.ellipsisOneChar);

// Marker text for hidden lines above/below a scrolled viewport.
// Returns empty string when count <= 0; callers should skip rendering in that case.
export const formatHiddenAboveMarker = (count: number): string =>
  count > 0 ? `${glyph.ellipsisOneChar} ↑ ${count}줄 위` : "";

export const formatHiddenBelowMarker = (count: number): string =>
  count > 0 ? `${glyph.ellipsisOneChar} ↓ ${count}줄 아래` : "";
