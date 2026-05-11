interface TerminalCell {
  char: string;
}

export interface TerminalEmulatorSnapshot {
  columns: number;
  rows: number;
  scrollbackRows: string[];
  visibleRows: string[];
  cursorRow: number;
  cursorColumn: number;
  alternateScreen: boolean;
}

const DEFAULT_SCROLLBACK_LIMIT = 200;

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

const createBlankRow = (columns: number): TerminalCell[] => {
  return Array.from({ length: Math.max(0, columns) }, () => ({ char: "" }));
};

const cloneRow = (row: TerminalCell[], columns: number): TerminalCell[] => {
  const nextRow = row.slice(0, columns).map((cell) => ({ ...cell }));
  while (nextRow.length < columns) {
    nextRow.push({ char: "" });
  }
  return nextRow;
};

const rowToText = (row: TerminalCell[]): string => {
  return row.map((cell) => cell.char || " ").join("");
};

const splitCsi = (sequence: string): { params: string; command: string } | null => {
  const match = /^\u001b\[([?0-9;]*)([@-~])$/.exec(sequence);
  if (!match) {
    return null;
  }
  const [, params = "", command = ""] = match;
  return { params, command };
};

export class TerminalEmulatorBuffer {
  private columns: number;
  private rows: number;
  private readonly scrollbackLimit: number;
  private mainScreen: TerminalCell[][];
  private alternateScreenBuffer: TerminalCell[][];
  private activeScreen: TerminalCell[][];
  private cursorRow = 0;
  private cursorColumn = 0;
  private alternateScreen = false;
  private wrapPending = false;
  private pendingEscape = "";
  private savedMainState: {
    screen: TerminalCell[][];
    cursorRow: number;
    cursorColumn: number;
  } | null = null;
  private readonly scrollbackRows: string[] = [];

  constructor(columns: number, rows: number, scrollbackLimit = DEFAULT_SCROLLBACK_LIMIT) {
    this.columns = Math.max(0, columns);
    this.rows = Math.max(0, rows);
    this.scrollbackLimit = Math.max(0, scrollbackLimit);
    this.mainScreen = this.buildScreen();
    this.alternateScreenBuffer = this.buildScreen();
    this.activeScreen = this.mainScreen;
  }

  private buildScreen(): TerminalCell[][] {
    return Array.from({ length: this.rows }, () => createBlankRow(this.columns));
  }

  private getActiveScreen(): TerminalCell[][] {
    return this.alternateScreen ? this.alternateScreenBuffer : this.mainScreen;
  }

  private setActiveScreen(screen: TerminalCell[][]): void {
    this.activeScreen = screen;
  }

  private normalizeCursor(): void {
    this.cursorRow = Math.max(0, Math.min(this.rows - 1, this.cursorRow));
    this.cursorColumn = Math.max(0, Math.min(this.columns - 1, this.cursorColumn));
  }

  private getCurrentRow(): TerminalCell[] {
    const screen = this.getActiveScreen();
    if (this.cursorRow < 0 || this.cursorRow >= screen.length) {
      return createBlankRow(this.columns);
    }
    const row = screen[this.cursorRow];
    if (!row) {
      return createBlankRow(this.columns);
    }
    return row;
  }

  private ensureCursorInBounds(): void {
    if (this.rows === 0 || this.columns === 0) {
      this.cursorRow = 0;
      this.cursorColumn = 0;
      return;
    }

    if (this.cursorRow >= this.rows) {
      this.cursorRow = this.rows - 1;
    }
    if (this.wrapPending && this.cursorColumn >= this.columns) {
      this.cursorColumn = this.columns;
      return;
    }
    if (this.cursorColumn >= this.columns) {
      this.cursorColumn = this.columns - 1;
    }
  }

  private pushScrollback(row: TerminalCell[]): void {
    this.scrollbackRows.push(rowToText(row));
    while (this.scrollbackRows.length > this.scrollbackLimit) {
      this.scrollbackRows.shift();
    }
  }

  private scrollUp(): void {
    if (this.rows <= 0) {
      return;
    }

    const screen = this.getActiveScreen();
    const removed = screen.shift();
    if (removed) {
      this.pushScrollback(removed);
    }
    screen.push(createBlankRow(this.columns));
    this.setActiveScreen(screen);
    this.cursorRow = Math.max(0, this.rows - 1);
  }

  private advanceLine(): void {
    this.cursorColumn = 0;
    this.cursorRow += 1;
    this.wrapPending = false;
    if (this.cursorRow >= this.rows) {
      this.scrollUp();
    }
  }

  private clearRow(rowIndex: number): void {
    const screen = this.getActiveScreen();
    const row = screen[rowIndex];
    if (!row) {
      return;
    }
    for (let i = 0; i < row.length; i += 1) {
      row[i] = { char: "" };
    }
  }

  private clearScreen(): void {
    const screen = this.getActiveScreen();
    for (let rowIndex = 0; rowIndex < screen.length; rowIndex += 1) {
      this.clearRow(rowIndex);
    }
  }

  private writeChar(char: string): void {
    if (this.rows === 0 || this.columns === 0) {
      return;
    }

    if (this.wrapPending) {
      this.advanceLine();
    }

    const width = isWideCharacter(char) ? 2 : 1;
    if (width === 2 && this.columns > 1 && this.cursorColumn === this.columns - 1) {
      this.advanceLine();
    }

    const screen = this.getActiveScreen();
    const row = screen[this.cursorRow];
    if (!row) {
      return;
    }

    row[this.cursorColumn] = { char };
    if (width === 2 && this.cursorColumn + 1 < this.columns) {
      row[this.cursorColumn + 1] = { char: "" };
    }

    this.cursorColumn += width;
    if (this.cursorColumn >= this.columns) {
      this.cursorColumn = this.columns;
      this.wrapPending = true;
    }
  }

  private handleEscape(sequence: string): void {
    if (sequence === "\u001b[?1049h") {
      if (!this.alternateScreen) {
        this.savedMainState = {
          screen: this.mainScreen.map((row) => cloneRow(row, this.columns)),
          cursorRow: this.cursorRow,
          cursorColumn: this.cursorColumn,
        };
      }
      this.alternateScreen = true;
      this.setActiveScreen(this.alternateScreenBuffer);
      this.cursorRow = 0;
      this.cursorColumn = 0;
      this.wrapPending = false;
      return;
    }

    if (sequence === "\u001b[?1049l") {
      this.alternateScreen = false;
      if (this.savedMainState) {
        this.mainScreen = this.savedMainState.screen.map((row) => cloneRow(row, this.columns));
        this.cursorRow = this.savedMainState.cursorRow;
        this.cursorColumn = this.savedMainState.cursorColumn;
        this.savedMainState = null;
      }
      this.setActiveScreen(this.mainScreen);
      this.ensureCursorInBounds();
      this.wrapPending = false;
      return;
    }

    const parsed = splitCsi(sequence);
    if (!parsed) {
      return;
    }

    const args = parsed.params.length > 0
      ? parsed.params.split(";").map((value) => Number.parseInt(value, 10) || 0)
      : [];

    switch (parsed.command) {
      case "A": {
        const amount = args[0] ?? 1;
        this.cursorRow = Math.max(0, this.cursorRow - amount);
        this.wrapPending = false;
        break;
      }
      case "B": {
        const amount = args[0] ?? 1;
        this.cursorRow = Math.min(Math.max(0, this.rows - 1), this.cursorRow + amount);
        this.wrapPending = false;
        break;
      }
      case "C": {
        const amount = args[0] ?? 1;
        this.cursorColumn = Math.min(Math.max(0, this.columns - 1), this.cursorColumn + amount);
        this.wrapPending = false;
        break;
      }
      case "D": {
        const amount = args[0] ?? 1;
        this.cursorColumn = Math.max(0, this.cursorColumn - amount);
        this.wrapPending = false;
        break;
      }
      case "G": {
        const column = Math.max(1, args[0] ?? 1);
        this.cursorColumn = Math.min(Math.max(0, this.columns - 1), column - 1);
        this.wrapPending = false;
        break;
      }
      case "H":
      case "f": {
        const row = Math.max(1, args[0] ?? 1);
        const column = Math.max(1, args[1] ?? 1);
        this.cursorRow = Math.min(Math.max(0, this.rows - 1), row - 1);
        this.cursorColumn = Math.min(Math.max(0, this.columns - 1), column - 1);
        this.wrapPending = false;
        break;
      }
      case "J": {
        const mode = args[0] ?? 0;
        if (mode === 2) {
          this.clearScreen();
          this.cursorRow = 0;
          this.cursorColumn = 0;
          this.wrapPending = false;
        }
        break;
      }
      case "K": {
        const mode = args[0] ?? 0;
        const screen = this.getActiveScreen();
        const row = screen[this.cursorRow];
        if (!row) {
          break;
        }
        if (mode === 2) {
          this.clearRow(this.cursorRow);
        } else if (mode === 1) {
          for (let i = 0; i <= this.cursorColumn && i < row.length; i += 1) {
            row[i] = { char: "" };
          }
        } else {
          for (let i = this.cursorColumn; i < row.length; i += 1) {
            row[i] = { char: "" };
          }
        }
        this.wrapPending = false;
        break;
      }
      case "m":
        break;
      default:
        break;
    }

    this.ensureCursorInBounds();
  }

  private consumePrintable(char: string): void {
    if (char === "\n") {
      this.wrapPending = false;
      this.advanceLine();
      return;
    }

    if (char === "\r") {
      this.cursorColumn = 0;
      this.wrapPending = false;
      return;
    }

    if (char === "\b") {
      this.cursorColumn = Math.max(0, this.cursorColumn - 1);
      this.wrapPending = false;
      const screen = this.getActiveScreen();
      const row = screen[this.cursorRow];
      if (row && row[this.cursorColumn]) {
        row[this.cursorColumn] = { char: "" };
      }
      return;
    }

    if (char === "\t") {
      const nextTabStop = Math.min(this.columns, Math.floor(this.cursorColumn / 8 + 1) * 8);
      this.cursorColumn = nextTabStop >= this.columns ? this.columns - 1 : nextTabStop;
      this.wrapPending = false;
      return;
    }

    const code = char.codePointAt(0) ?? 0;
    if (code < 32) {
      return;
    }

    this.writeChar(char);
  }

  write(chunk: string): void {
    const chars = Array.from(chunk);
    for (const char of chars) {
      if (this.pendingEscape.length > 0) {
        this.pendingEscape += char;
        if (/^\u001b\[[?0-9;]*[@-~]$/.test(this.pendingEscape) || /^\u001b\[\?[0-9]+[hl]$/.test(this.pendingEscape)) {
          this.handleEscape(this.pendingEscape);
          this.pendingEscape = "";
        } else if (this.pendingEscape.length > 64) {
          this.pendingEscape = "";
        }
        continue;
      }

      if (char === "\u001b") {
        this.pendingEscape = char;
        continue;
      }

      this.consumePrintable(char);
    }
  }

  resize(columns: number, rows: number): void {
    const nextColumns = Math.max(0, columns);
    const nextRows = Math.max(0, rows);

    const resizeScreen = (screen: TerminalCell[][]): TerminalCell[][] => {
      const preservedRows = screen.slice(Math.max(0, screen.length - nextRows)).map((row) => {
        const nextRow = row.slice(0, nextColumns).map((cell) => ({ ...cell }));
        while (nextRow.length < nextColumns) {
          nextRow.push({ char: "" });
        }
        return nextRow;
      });

      while (preservedRows.length < nextRows) {
        preservedRows.push(createBlankRow(nextColumns));
      }
      return preservedRows;
    };

    this.columns = nextColumns;
    this.rows = nextRows;
    this.mainScreen = resizeScreen(this.mainScreen);
    this.alternateScreenBuffer = resizeScreen(this.alternateScreenBuffer);
    this.setActiveScreen(this.alternateScreen ? this.alternateScreenBuffer : this.mainScreen);
    this.wrapPending = false;
    if (this.savedMainState) {
      this.savedMainState = {
        screen: resizeScreen(this.savedMainState.screen),
        cursorRow: Math.min(Math.max(0, nextRows - 1), this.savedMainState.cursorRow),
        cursorColumn: Math.min(Math.max(0, nextColumns - 1), this.savedMainState.cursorColumn),
      };
    }
    this.ensureCursorInBounds();
  }

  reset(): void {
    this.mainScreen = this.buildScreen();
    this.alternateScreenBuffer = this.buildScreen();
    this.setActiveScreen(this.mainScreen);
    this.cursorRow = 0;
    this.cursorColumn = 0;
    this.alternateScreen = false;
    this.pendingEscape = "";
    this.wrapPending = false;
    this.savedMainState = null;
    this.scrollbackRows.length = 0;
  }

  hasContent(): boolean {
    return (
      this.scrollbackRows.length > 0 ||
      this.mainScreen.some((row) => row.some((cell) => cell.char.length > 0)) ||
      this.alternateScreenBuffer.some((row) => row.some((cell) => cell.char.length > 0))
    );
  }

  getVisibleRows(): string[] {
    return this.getActiveScreen().map((row) => rowToText(row));
  }

  getScrollbackRows(): string[] {
    return [...this.scrollbackRows];
  }

  snapshot(): TerminalEmulatorSnapshot {
    return {
      columns: this.columns,
      rows: this.rows,
      scrollbackRows: this.getScrollbackRows(),
      visibleRows: this.getVisibleRows(),
      cursorRow: this.cursorRow,
      cursorColumn: this.cursorColumn,
      alternateScreen: this.alternateScreen,
    };
  }
}
