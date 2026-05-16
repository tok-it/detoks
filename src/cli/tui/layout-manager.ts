import type { ScreenDimensions } from "./screen-manager.js";

export interface PanelRegion {
  startRow: number;
  endRow: number; // exclusive
  columns: number;
}

export interface LayoutConfig {
  rows: number;
  columns: number;
  headerRegion: PanelRegion;
  statusPanelRegion: PanelRegion;
  transcriptRegion: PanelRegion;
  resultRegion: PanelRegion;
  inputRegion: PanelRegion;
}

export type PanelMode = "fixed" | "flex";

export interface PanelDef {
  id: string;
  mode: PanelMode;
  rows?: number;     // mode="fixed"
  weight?: number;   // mode="flex"
  minRows?: number;  // mode="flex"
}

// Default schema preserves the historical 3 / 8 / 70% / 30% / 3 layout.
// Order matters: panels before the first flex panel are anchored top-down,
// panels after the last flex panel are anchored bottom-up. Flex panels fill
// the remaining gap (which may be negative on very small terminals — that
// historical quirk is preserved).
export const DEFAULT_LAYOUT_SCHEMA: readonly PanelDef[] = [
  { id: "header",     mode: "fixed", rows: 3 },
  { id: "status",     mode: "fixed", rows: 8 },
  { id: "transcript", mode: "flex",  weight: 7, minRows: 5 },
  { id: "result",     mode: "flex",  weight: 3, minRows: 0 },
  { id: "input",      mode: "fixed", rows: 3 },
];

const findFirstFlexIndex = (schema: readonly PanelDef[]): number =>
  schema.findIndex((p) => p.mode === "flex");

const findLastFlexIndex = (schema: readonly PanelDef[]): number => {
  for (let i = schema.length - 1; i >= 0; i -= 1) {
    if (schema[i]!.mode === "flex") return i;
  }
  return -1;
};

export const computeLayoutRegions = (
  dims: ScreenDimensions,
  schema: readonly PanelDef[] = DEFAULT_LAYOUT_SCHEMA,
): Map<string, PanelRegion> => {
  const { rows, columns } = dims;
  const result = new Map<string, PanelRegion>();

  const firstFlex = findFirstFlexIndex(schema);
  const lastFlex = findLastFlexIndex(schema);

  // No flex panels: pure fixed allocation top-down.
  if (firstFlex === -1) {
    let cursor = 0;
    for (const panel of schema) {
      const allocated = panel.rows ?? 0;
      result.set(panel.id, { startRow: cursor, endRow: cursor + allocated, columns });
      cursor += allocated;
    }
    return result;
  }

  // 1) Top fixed panels — anchored to row 0, growing downward.
  let topCursor = 0;
  for (let i = 0; i < firstFlex; i += 1) {
    const panel = schema[i]!;
    const allocated = panel.rows ?? 0;
    result.set(panel.id, { startRow: topCursor, endRow: topCursor + allocated, columns });
    topCursor += allocated;
  }

  // 2) Bottom fixed panels — anchored to dims.rows, growing upward.
  const bottomFixed = schema.slice(lastFlex + 1);
  const bottomFixedTotal = bottomFixed.reduce((sum, p) => sum + (p.rows ?? 0), 0);
  const bottomStart = rows - bottomFixedTotal;

  // 3) Flex panels fill the gap between top fixed and bottom fixed.
  const flexPanels = schema.slice(firstFlex, lastFlex + 1);
  const available = bottomStart - topCursor;
  const totalWeight = flexPanels.reduce((sum, p) => sum + (p.weight ?? 0), 0);

  const flexAllocations = new Map<string, number>();
  let allocatedFlex = 0;
  flexPanels.forEach((panel, index) => {
    let allocation = totalWeight > 0
      ? Math.floor((available * (panel.weight ?? 0)) / totalWeight)
      : 0;
    if (index === 0 && panel.minRows !== undefined) {
      allocation = Math.max(panel.minRows, allocation);
    }
    flexAllocations.set(panel.id, allocation);
    allocatedFlex += allocation;
  });

  // Last flex panel absorbs the rounding remainder so flex panels tile exactly.
  if (flexPanels.length > 0) {
    const last = flexPanels[flexPanels.length - 1]!;
    const adjusted = Math.max(
      last.minRows ?? 0,
      (flexAllocations.get(last.id) ?? 0) + (available - allocatedFlex),
    );
    flexAllocations.set(last.id, adjusted);
  }

  // Place flex panels sequentially starting at topCursor.
  let flexCursor = topCursor;
  for (const panel of flexPanels) {
    const allocated = flexAllocations.get(panel.id) ?? 0;
    result.set(panel.id, {
      startRow: flexCursor,
      endRow: flexCursor + allocated,
      columns,
    });
    flexCursor += allocated;
  }

  // 4) Place bottom fixed panels anchored to dims.rows.
  let bottomCursor = bottomStart;
  for (const panel of bottomFixed) {
    const allocated = panel.rows ?? 0;
    result.set(panel.id, {
      startRow: bottomCursor,
      endRow: bottomCursor + allocated,
      columns,
    });
    bottomCursor += allocated;
  }

  return result;
};

export const computeLayout = (
  dims: ScreenDimensions,
  schema: readonly PanelDef[] = DEFAULT_LAYOUT_SCHEMA,
): LayoutConfig => {
  const regions = computeLayoutRegions(dims, schema);
  return {
    rows: dims.rows,
    columns: dims.columns,
    headerRegion: regions.get("header")!,
    statusPanelRegion: regions.get("status")!,
    transcriptRegion: regions.get("transcript")!,
    resultRegion: regions.get("result")!,
    inputRegion: regions.get("input")!,
  };
};

export const getPanelHeight = (region: PanelRegion): number => {
  return region.endRow - region.startRow;
};

export const getContentArea = (region: PanelRegion): { usableWidth: number; usableHeight: number } => {
  return {
    usableWidth: Math.max(0, region.columns),
    usableHeight: Math.max(0, getPanelHeight(region)),
  };
};
