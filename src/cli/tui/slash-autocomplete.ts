import type { Adapter } from "../../core/pipeline/types.js";
import type { SlashCommand } from "../repl-commands/index.js";
import { getActiveSlashCommands } from "../repl-commands/index.js";

const normalizeQuery = (query: string): string => {
  return query.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
};

const matchesCommand = (command: SlashCommand, normalizedQuery: string): boolean => {
  if (normalizedQuery.length === 0) {
    return true;
  }

  const candidates = [
    command.name,
    command.usage.startsWith("/") ? command.usage.slice(1) : command.usage,
    ...(command.aliases ?? []),
  ].map((value) => value.toLowerCase());

  return candidates.some((candidate) => candidate.startsWith(normalizedQuery));
};

export const getSlashAutocompleteQuery = (input: string): string | null => {
  if (!input.startsWith("/")) {
    return null;
  }

  const token = input.slice(1);
  if (/\s/.test(token)) {
    return null;
  }

  return token;
};

export const filterSlashAutocompleteCommands = (
  commands: SlashCommand[],
  query: string,
): SlashCommand[] => {
  const normalizedQuery = normalizeQuery(query);
  return commands.filter((command) => matchesCommand(command, normalizedQuery));
};

export const getSlashAutocompleteCommands = (
  adapter: Adapter,
  query: string,
): SlashCommand[] => {
  return filterSlashAutocompleteCommands(getActiveSlashCommands(adapter), query);
};

export const getNextSlashAutocompleteIndex = (
  currentIndex: number,
  direction: "up" | "down",
  optionCount: number,
): number => {
  if (optionCount <= 0) {
    return 0;
  }

  if (direction === "up") {
    return currentIndex <= 0 ? optionCount - 1 : currentIndex - 1;
  }

  return currentIndex >= optionCount - 1 ? 0 : currentIndex + 1;
};

export const getSlashAutocompleteSelection = (
  commands: SlashCommand[],
  selectedIndex: number,
): SlashCommand | null => {
  if (commands.length === 0) {
    return null;
  }

  const clampedIndex = Math.min(Math.max(selectedIndex, 0), commands.length - 1);
  return commands[clampedIndex] ?? null;
};
