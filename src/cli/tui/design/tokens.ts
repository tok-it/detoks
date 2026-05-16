import chalk from "chalk";
import { colors } from "../../colors.js";

export type Style = (text: string) => string;

const identity: Style = (text) => text;

const supportsTruecolor = (): boolean => chalk.level >= 2;

const statusOrange: Style = supportsTruecolor()
  ? colors.statusOrange
  : (text) => chalk.yellow(text);

export const statusColor = {
  // Green — universal success / checkmark / selected highlight
  success: colors.success,
  // Blue — "ALL BLUE" pipeline stage-done convention
  pipelineDone: colors.statusBlue,
  warn: colors.warning,
  error: colors.statusRed,
  info: colors.info,
  muted: colors.muted,
  accent: colors.prompt,
  pending: statusOrange,
  active: statusOrange,
  title: colors.title,
  header: colors.header,
  strong: colors.boldText,
  footer: colors.footer,
  plain: identity,
} as const;

export type StatusColorKey = keyof typeof statusColor;

export const glyph = {
  active: "●",
  done: "●",
  skipped: "○",
  error: "●",
  pending: "●",
  info: "●",
  warn: "⚠",
  success: "✓",
  failure: "✗",
  selected: "▶",
  arrow: "→",
  bullet: "•",
  separator: "━",
  ellipsisOneChar: "…",
  ellipsisThreeDot: "...",
  spinner: ["|", "/", "-", "\\"] as const,
  changeAdd: "+",
  changeDelete: "-",
  changeRename: "→",
  changeUpdate: "~",
} as const;

export const spacing = {
  panelPaddingX: 0,
  sectionGap: 1,
  listIndent: 2,
  headerRows: 3,
  inputRows: 3,
} as const;

export const width = {
  cjkCharCells: 2,
  asciiCharCells: 1,
  spinnerFrameMs: 250,
} as const;

export const colorLevel = {
  supportsTruecolor,
  current: (): number => chalk.level,
};
