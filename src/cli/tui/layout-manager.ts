import type { ScreenDimensions } from "./screen-manager.js";

export interface PanelRegion {
  startRow: number;
  endRow: number; // exclusive
  columns: number;
}

export interface LayoutConfig {
  rows: number;
  columns: number;
  headerRegion: PanelRegion; // 제목 + 구분선 (3줄)
  statusPanelRegion: PanelRegion; // 파이프라인 상태 (고정 8줄)
  transcriptRegion: PanelRegion; // 실시간 출력 (가변)
  resultRegion: PanelRegion; // 결과 요약 (가변)
  inputRegion: PanelRegion; // 입력 + 푸터 (3줄)
}

const MIN_TRANSCRIPT_ROWS = 5;
const STATUS_PANEL_ROWS = 8; // 파이프라인 상태 + 옵션
const HEADER_ROWS = 3; // 제목 + 구분선
const INPUT_ROWS = 3; // 구분선 + 입력 + 푸터

export const computeLayout = (dims: ScreenDimensions): LayoutConfig => {
  const { rows, columns } = dims;

  // 최소 필요 높이: header + status + input + min_transcript
  const minRequired = HEADER_ROWS + STATUS_PANEL_ROWS + INPUT_ROWS + MIN_TRANSCRIPT_ROWS;

  let headerStartRow = 0;
  let statusStartRow = headerStartRow + HEADER_ROWS;
  let inputStartRow = rows - INPUT_ROWS;

  // 가용 공간을 transcript와 result 사이에 분배
  const availableForContent = inputStartRow - statusStartRow - STATUS_PANEL_ROWS;
  const transcriptRows = Math.max(MIN_TRANSCRIPT_ROWS, Math.floor(availableForContent * 0.7));
  const resultRows = Math.max(0, availableForContent - transcriptRows);

  return {
    rows,
    columns,
    headerRegion: {
      startRow: headerStartRow,
      endRow: statusStartRow,
      columns,
    },
    statusPanelRegion: {
      startRow: statusStartRow,
      endRow: statusStartRow + STATUS_PANEL_ROWS,
      columns,
    },
    transcriptRegion: {
      startRow: statusStartRow + STATUS_PANEL_ROWS,
      endRow: statusStartRow + STATUS_PANEL_ROWS + transcriptRows,
      columns,
    },
    resultRegion: {
      startRow: statusStartRow + STATUS_PANEL_ROWS + transcriptRows,
      endRow: inputStartRow,
      columns,
    },
    inputRegion: {
      startRow: inputStartRow,
      endRow: rows,
      columns,
    },
  };
};

export const getPanelHeight = (region: PanelRegion): number => {
  return region.endRow - region.startRow;
};

export const getContentArea = (region: PanelRegion): { usableWidth: number; usableHeight: number } => {
  return {
    usableWidth: Math.max(0, region.columns - 4), // 좌우 테두리 2 + 패딩 2
    usableHeight: Math.max(0, getPanelHeight(region) - 2), // 상하 라인 2
  };
};
