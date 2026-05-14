import { colors } from "../colors.js";
import { padDisplayWidth, wrapTextToDisplayWidth } from "./renderer.js";

const APPROVAL_MESSAGES = [
  "실행 전 확인",
  "Enter 실행 · Esc 편집 복귀",
] as const;

export const buildExecutionApprovalLines = (width: number): string[] => {
  if (width <= 0) {
    return [];
  }

  const lines: string[] = [];
  const divider = padDisplayWidth(`── Run Check ${"─".repeat(Math.max(0, width - 13))}`.slice(0, width), width);
  lines.push(colors.warning(divider));

  for (const message of APPROVAL_MESSAGES) {
    for (const segment of wrapTextToDisplayWidth(message, width)) {
      lines.push(colors.warning(padDisplayWidth(segment, width)));
    }
  }

  return lines;
};
