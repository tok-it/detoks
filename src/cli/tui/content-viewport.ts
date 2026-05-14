export interface ContentViewportState {
  pinnedToBottom: boolean;
  topRow: number;
}

export interface ContentViewportWindow extends ContentViewportState {
  startIndex: number;
  endIndex: number;
  maxTopRow: number;
}

export interface ContentViewportTrackingInfo extends ContentViewportWindow {
  distanceFromBottom: number;
}

export const createPinnedViewportState = (): ContentViewportState => ({
  pinnedToBottom: true,
  topRow: 0,
});

const getMaxTopRow = (totalLines: number, viewportHeight: number): number =>
  Math.max(0, totalLines - Math.max(0, viewportHeight));

export const resolveViewportWindow = (
  totalLines: number,
  viewportHeight: number,
  state: ContentViewportState,
): ContentViewportWindow => {
  const safeHeight = Math.max(0, viewportHeight);
  const maxTopRow = getMaxTopRow(totalLines, safeHeight);
  const effectiveTopRow = state.pinnedToBottom
    ? maxTopRow
    : Math.min(Math.max(0, state.topRow), maxTopRow);

  return {
    pinnedToBottom: state.pinnedToBottom || effectiveTopRow >= maxTopRow,
    topRow: effectiveTopRow,
    startIndex: effectiveTopRow,
    endIndex: Math.min(totalLines, effectiveTopRow + safeHeight),
    maxTopRow,
  };
};

export const describeViewportTracking = (
  totalLines: number,
  viewportHeight: number,
  state: ContentViewportState,
): ContentViewportTrackingInfo => {
  const window = resolveViewportWindow(totalLines, viewportHeight, state);

  return {
    ...window,
    distanceFromBottom: Math.max(0, window.maxTopRow - window.topRow),
  };
};

export const formatViewportTrackingHint = (
  totalLines: number,
  viewportHeight: number,
  state: ContentViewportState,
): string => {
  const tracking = describeViewportTracking(totalLines, viewportHeight, state);

  if (tracking.pinnedToBottom) {
    return "최신 따라가기 ON";
  }

  return `최신 따라가기 OFF · 위 ${tracking.distanceFromBottom}줄 · End 최신으로 이동`;
};

export const scrollViewportBy = (
  totalLines: number,
  viewportHeight: number,
  state: ContentViewportState,
  deltaRows: number,
): ContentViewportState => {
  const current = resolveViewportWindow(totalLines, viewportHeight, state);
  const nextTopRow = Math.min(
    Math.max(0, current.topRow + deltaRows),
    current.maxTopRow,
  );

  return {
    pinnedToBottom: nextTopRow >= current.maxTopRow,
    topRow: nextTopRow,
  };
};

export const scrollViewportToTop = (): ContentViewportState => ({
  pinnedToBottom: false,
  topRow: 0,
});

export const scrollViewportToBottom = (): ContentViewportState => ({
  pinnedToBottom: true,
  topRow: 0,
});
