import chalk from "chalk";
import { colors } from "../../colors.js";

export type Style = (text: string) => string;

const identity: Style = (text) => text;

const supportsTruecolor = (): boolean => chalk.level >= 2;

// ── Theme palettes ────────────────────────────────────────────────────────

export interface ThemePalette {
  success: Style;
  pipelineDone: Style;
  warn: Style;
  error: Style;
  info: Style;
  muted: Style;
  accent: Style;
  pending: Style;
  active: Style;
  title: Style;
  header: Style;
  strong: Style;
  footer: Style;
  plain: Style;
}

const darkActive: Style = supportsTruecolor()
  ? colors.statusOrange
  : (text) => chalk.yellow(text);

const darkPalette: ThemePalette = {
  success: colors.success,         // green
  pipelineDone: colors.statusBlue, // blue ("ALL BLUE" convention)
  warn: colors.warning,            // yellow
  error: colors.statusRed,         // red
  info: colors.info,               // gray
  muted: colors.muted,             // dim
  accent: colors.prompt,           // cyan
  pending: darkActive,
  active: darkActive,
  title: colors.title,             // bold cyan
  header: colors.header,           // bold blue
  strong: colors.boldText,         // bold
  footer: colors.footer,           // gray
  plain: identity,
};

// Light terminals lose information from chalk.gray — swap muted/footer to dim.
const lightPalette: ThemePalette = {
  ...darkPalette,
  info: (text) => chalk.dim(text),
  muted: (text) => chalk.dim(text),
  footer: (text) => chalk.dim(text),
  active: (text) => chalk.yellow(text),
  pending: (text) => chalk.yellow(text),
};

// Deuteranopia/protanopia-friendly: avoid the red/green pair entirely.
// Uses blue + cyan + yellow + magenta (well-separated across common deficiencies).
const colorblindPalette: ThemePalette = {
  success: (text) => chalk.cyan(text),
  pipelineDone: (text) => chalk.blueBright(text),
  warn: (text) => chalk.yellow(text),
  error: (text) => chalk.magenta(text),
  info: (text) => chalk.gray(text),
  muted: (text) => chalk.dim(text),
  accent: (text) => chalk.white(text),
  pending: (text) => chalk.yellow(text),
  active: (text) => chalk.yellow(text),
  title: (text) => chalk.bold.white(text),
  header: (text) => chalk.bold.cyan(text),
  strong: (text) => chalk.bold(text),
  footer: (text) => chalk.gray(text),
  plain: identity,
};

export type ThemeName = "dark" | "light" | "colorblind";

export const isThemeName = (value: string): value is ThemeName =>
  value === "dark" || value === "light" || value === "colorblind";

export const themes: Record<ThemeName, ThemePalette> = {
  dark: darkPalette,
  light: lightPalette,
  colorblind: colorblindPalette,
};

export const resolveActiveTheme = (): ThemePalette => {
  const envName = process.env.DETOKS_THEME?.trim().toLowerCase();
  if (envName && isThemeName(envName)) {
    return themes[envName];
  }
  return themes.dark;
};

// Mutable reference so applyTheme() can switch palettes at runtime.
let activeTheme: ThemePalette = resolveActiveTheme();

export const applyTheme = (theme: ThemePalette): void => {
  activeTheme = theme;
};

export const getActiveTheme = (): ThemePalette => activeTheme;

// ── Public token surfaces ────────────────────────────────────────────────

// statusColor stays a const but each entry resolves through the live theme,
// so applyTheme() at runtime affects all subsequent calls without re-importing.
export const statusColor = {
  success: (text: string) => activeTheme.success(text),
  pipelineDone: (text: string) => activeTheme.pipelineDone(text),
  warn: (text: string) => activeTheme.warn(text),
  error: (text: string) => activeTheme.error(text),
  info: (text: string) => activeTheme.info(text),
  muted: (text: string) => activeTheme.muted(text),
  accent: (text: string) => activeTheme.accent(text),
  pending: (text: string) => activeTheme.pending(text),
  active: (text: string) => activeTheme.active(text),
  title: (text: string) => activeTheme.title(text),
  header: (text: string) => activeTheme.header(text),
  strong: (text: string) => activeTheme.strong(text),
  footer: (text: string) => activeTheme.footer(text),
  plain: (text: string) => activeTheme.plain(text),
} as const;

export type StatusColorKey = keyof typeof statusColor;

export interface GlyphSet {
  active: string;
  done: string;
  skipped: string;
  error: string;
  pending: string;
  info: string;
  warn: string;
  success: string;
  failure: string;
  selected: string;
  arrow: string;
  bullet: string;
  separator: string;
  ellipsisOneChar: string;
  ellipsisThreeDot: string;
  spinner: readonly string[];
  changeAdd: string;
  changeDelete: string;
  changeRename: string;
  changeUpdate: string;
  cacheHit: string;
  cacheMiss: string;
  cacheAdvise: string;
  ragInjected: string;
  ragSkipped: string;
  gutter: string;
  spinnerBraille: readonly string[];
  toolWeb: string;
  toolMcp: string;
  toolTodo: string;
  execRunning: string;
  execDone: string;
  execFailed: string;
  adapterBadge: string;
  scrollIndicator: string;
}

const _defaultGlyph: GlyphSet = {
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
  spinner: ["|", "/", "-", "\\"],
  changeAdd: "+",
  changeDelete: "-",
  changeRename: "→",
  changeUpdate: "~",
  cacheHit: "▣",
  cacheMiss: "▢",
  cacheAdvise: "⚠",
  ragInjected: "ⓘ",
  ragSkipped: "○",
  gutter: "▎",
  spinnerBraille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  toolWeb: "◐",
  toolMcp: "▢",
  toolTodo: "☐",
  execRunning: "▸",
  execDone: "✓",
  execFailed: "✗",
  adapterBadge: "▣",
  scrollIndicator: "▒",
};

// Nerd Fonts v3 — FontAwesome + Codicon PUA codepoints
const _nerdGlyph: GlyphSet = {
  active:          "",  // nf-fa-circle
  done:            "",  // nf-fa-check_circle
  skipped:         "",  // nf-fa-ban
  error:           "",  // nf-fa-times_circle
  pending:         "",  // nf-fa-clock_o
  info:            "",  // nf-fa-info_circle
  warn:            "",  // nf-fa-warning
  success:         "",  // nf-fa-check
  failure:         "",  // nf-fa-times
  selected:        "",  // nf-fa-chevron_right
  arrow:           "",  // nf-fa-arrow_right
  bullet:          "",  // nf-fa-circle
  separator:       "━",
  ellipsisOneChar: "…",
  ellipsisThreeDot: "...",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  changeAdd:    "+",
  changeDelete: "-",
  changeRename: "",  // nf-fa-arrow_right
  changeUpdate: "~",
  cacheHit:    "",  // nf-fa-database
  cacheMiss:   "",  // nf-fa-database
  cacheAdvise: "",  // nf-fa-warning
  ragInjected: "",  // nf-fa-file_text
  ragSkipped:  "",  // nf-fa-file_text_o
  gutter:        "▎",
  spinnerBraille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  toolWeb:       "",  // nf-fa-globe
  toolMcp:       "",  // nf-fa-plug
  toolTodo:      "",  // nf-fa-tasks
  execRunning:   "",  // nf-fa-play
  execDone:      "",  // nf-fa-check
  execFailed:    "",  // nf-fa-times
  adapterBadge:  "",  // nf-fa-database
  scrollIndicator: "▒",
};

let _nerdFontEnabled: boolean = process.env.DETOKS_NERD_FONT === "1";

export const isNerdFontEnabled = (): boolean => _nerdFontEnabled;

export const setNerdFont = (enabled: boolean): void => {
  _nerdFontEnabled = enabled;
  Object.assign(glyph, enabled ? _nerdGlyph : _defaultGlyph);
};

export const glyph: GlyphSet = { ...(_nerdFontEnabled ? _nerdGlyph : _defaultGlyph) };

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
  gutterColumns: 2,
} as const;

export const colorLevel = {
  supportsTruecolor,
  current: (): number => chalk.level,
};
