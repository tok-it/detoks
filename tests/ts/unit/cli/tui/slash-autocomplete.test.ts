import { describe, expect, it, vi } from "vitest";
import type { SlashCommand } from "../../../../../src/cli/repl-commands/index.js";
import {
  filterSlashAutocompleteCommands,
  getNextSlashAutocompleteIndex,
  getSlashAutocompleteQuery,
  getSlashAutocompleteSelection,
} from "../../../../../src/cli/tui/slash-autocomplete.js";
import { renderSlashAutocompletePanel } from "../../../../../src/cli/tui/panels/slash-autocomplete.js";

const COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "도움말 표시",
    usage: "/help",
    aliases: ["h", "?"],
  },
  {
    name: "adapter",
    description: "어댑터 변경",
    usage: "/adapter",
    aliases: ["a"],
  },
  {
    name: "verbose",
    description: "상세 출력 토글",
    usage: "/verbose",
    aliases: ["v"],
  },
];

describe("slash autocomplete helpers", () => {
  it("extracts slash queries only for simple command tokens", () => {
    expect(getSlashAutocompleteQuery("/")).toBe("");
    expect(getSlashAutocompleteQuery("/ad")).toBe("ad");
    expect(getSlashAutocompleteQuery("/ad more")).toBeNull();
    expect(getSlashAutocompleteQuery("ad")).toBeNull();
  });

  it("filters commands by usage, name, and aliases", () => {
    const filtered = filterSlashAutocompleteCommands(COMMANDS, "a");
    expect(filtered.map((command) => command.usage)).toEqual(["/adapter"]);

    const aliasFiltered = filterSlashAutocompleteCommands(COMMANDS, "v");
    expect(aliasFiltered.map((command) => command.usage)).toEqual(["/verbose"]);
  });

  it("wraps selection indices across the command list", () => {
    expect(getNextSlashAutocompleteIndex(0, "up", 3)).toBe(2);
    expect(getNextSlashAutocompleteIndex(2, "down", 3)).toBe(0);
    expect(getSlashAutocompleteSelection(COMMANDS, 99)?.usage).toBe("/verbose");
  });
});

describe("renderSlashAutocompletePanel", () => {
  it("renders filtered suggestions and the keyboard hint", () => {
    const screen = {
      cursorMoveTo: vi.fn(),
      write: vi.fn(),
    };
    const context: any = {
      screen,
      dims: { rows: 12, columns: 80 },
    };

    renderSlashAutocompletePanel(context, { startRow: 0, endRow: 8, columns: 80 }, "ad", filterSlashAutocompleteCommands(COMMANDS, "ad"), 0);

    const output = screen.write.mock.calls.map((call: any[]) => call[0]).join("\n");
    expect(output).toContain("슬래시 자동완성");
    expect(output).toContain("/adapter");
    expect(output).toContain("↑↓ 선택");
  });
});
