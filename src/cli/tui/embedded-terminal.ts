import type { PanelRegion } from "./layout-manager.js";

export const EMBEDDED_TERMINAL_MIN_ROWS = 24;
export const EMBEDDED_TERMINAL_MIN_COLUMNS = 80;

export const EmbeddedTerminalFocusValues = [
  "detoks-input",
  "adapter-terminal",
  "summary",
] as const;

export type EmbeddedTerminalFocus = (typeof EmbeddedTerminalFocusValues)[number];

export interface EmbeddedTerminalPaneLayout {
  rows: number;
  columns: number;
  supported: boolean;
  fallbackReason?: string;
  headerRows: number;
  statusRows: number;
  embeddedRows: number;
  summaryRows: number;
  hintRows: number;
  footerRows: number;
  headerRegion: PanelRegion;
  statusRegion: PanelRegion;
  embeddedRegion: PanelRegion;
  summaryRegion: PanelRegion;
  hintRegion: PanelRegion;
  footerRegion: PanelRegion;
}

const HEADER_ROWS = 2;
const FOOTER_ROWS = 1;
const HINT_ROWS = 1;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const isEmbeddedTerminalPaneSupported = (rows: number, columns: number): boolean => {
  return rows >= EMBEDDED_TERMINAL_MIN_ROWS && columns >= EMBEDDED_TERMINAL_MIN_COLUMNS;
};

export const getEmbeddedTerminalFallbackReason = (
  rows: number,
  columns: number,
): string | undefined => {
  if (isEmbeddedTerminalPaneSupported(rows, columns)) {
    return undefined;
  }

  return `Embedded native CLI pane needs at least ${EMBEDDED_TERMINAL_MIN_COLUMNS}x${EMBEDDED_TERMINAL_MIN_ROWS}. Falling back to foreground passthrough.`;
};

export const computeEmbeddedTerminalPaneLayout = (
  rows: number,
  columns: number,
  hasResult: boolean,
): EmbeddedTerminalPaneLayout => {
  const supported = isEmbeddedTerminalPaneSupported(rows, columns);
  const fallbackReason = getEmbeddedTerminalFallbackReason(rows, columns);

  const statusRows = clamp(Math.floor(rows * 0.12), 3, 5);
  const summaryRows = hasResult
    ? clamp(Math.floor(rows * 0.22), 6, 10)
    : 4;

  const availableRows = Math.max(
    0,
    rows - HEADER_ROWS - FOOTER_ROWS - HINT_ROWS - statusRows - summaryRows,
  );
  const embeddedRows = supported ? Math.max(8, availableRows) : availableRows;

  const headerRegion: PanelRegion = {
    startRow: 0,
    endRow: HEADER_ROWS,
    columns,
  };

  const statusRegion: PanelRegion = {
    startRow: headerRegion.endRow,
    endRow: headerRegion.endRow + statusRows,
    columns,
  };

  const embeddedRegion: PanelRegion = {
    startRow: statusRegion.endRow,
    endRow: statusRegion.endRow + embeddedRows,
    columns,
  };

  const summaryRegion: PanelRegion = {
    startRow: embeddedRegion.endRow,
    endRow: embeddedRegion.endRow + summaryRows,
    columns,
  };

  const hintRegion: PanelRegion = {
    startRow: summaryRegion.endRow,
    endRow: summaryRegion.endRow + HINT_ROWS,
    columns,
  };

  const footerRegion: PanelRegion = {
    startRow: rows - FOOTER_ROWS,
    endRow: rows,
    columns,
  };

  return {
    rows,
    columns,
    supported,
    ...(fallbackReason ? { fallbackReason } : {}),
    headerRows: HEADER_ROWS,
    statusRows,
    embeddedRows,
    summaryRows,
    hintRows: HINT_ROWS,
    footerRows: FOOTER_ROWS,
    headerRegion,
    statusRegion,
    embeddedRegion,
    summaryRegion,
    hintRegion,
    footerRegion,
  };
};

export const formatEmbeddedTerminalFocusHint = (
  focus: EmbeddedTerminalFocus,
  adapter: string,
): string => {
  if (focus === "adapter-terminal") {
    return `[native: ${adapter}] keys go to ${adapter} CLI · Esc/Ctrl+G returns to detoks · Ctrl+C forwards interrupt`;
  }

  if (focus === "summary") {
    return `[summary] detoks recap focused · Enter to return to native CLI · Esc/Ctrl+G returns to detoks`;
  }

  return "[detoks] / command autocomplete enabled · Enter runs detoks prompt · Ctrl+T focuses native CLI";
};
