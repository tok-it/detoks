import { UserRequestSchema } from "../schemas/pipeline.js";
import { AdapterValues, type CliArgs, type CliMode, type NormalizedCliRequest } from "./types.js";

const DEFAULT_ADAPTER = "codex";

const isAdapter = (value: string): value is (typeof AdapterValues)[number] =>
  AdapterValues.includes(value as (typeof AdapterValues)[number]);

const assertPrompt = (prompt: string | undefined): string => {
  const normalized = prompt?.trim();
  if (!normalized) {
    throw new Error(
      "Missing prompt. Usage: detoks \"<prompt>\" [--adapter codex|gemini] [--verbose] or detoks repl",
    );
  }
  return normalized;
};

export const parseCliArgs = (argv: string[]): CliArgs => {
  const positionals: string[] = [];
  let adapter: CliArgs["adapter"] = DEFAULT_ADAPTER;
  let verbose = false;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (current === "--verbose") {
      verbose = true;
      continue;
    }

    if (current === "--adapter") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--adapter requires a value: codex|gemini");
      }
      if (!isAdapter(next)) {
        throw new Error(`Unsupported adapter: ${next}`);
      }
      adapter = next;
      i += 1;
      continue;
    }

    if (current.startsWith("--adapter=")) {
      const inline = current.split("=")[1] ?? "";
      if (!isAdapter(inline)) {
        throw new Error(`Unsupported adapter: ${inline}`);
      }
      adapter = inline;
      continue;
    }

    if (current.startsWith("--")) {
      throw new Error(`Unknown flag: ${current}`);
    }

    positionals.push(current);
  }

  const first = positionals[0];
  if (first === "repl") {
    if (positionals.length > 1) {
      throw new Error('REPL mode does not accept prompt arguments. Use: detoks repl');
    }
    return { mode: "repl", adapter, verbose };
  }

  const prompt = assertPrompt(positionals.join(" "));
  return {
    mode: "run",
    prompt,
    adapter,
    verbose,
  };
};

export const toNormalizedRequest = (
  args: CliArgs,
  options?: { cwd?: string; sessionId?: string; mode?: CliMode },
): NormalizedCliRequest => {
  const mode = options?.mode ?? args.mode;
  const prompt = mode === "repl" ? args.prompt ?? "" : assertPrompt(args.prompt);

  return {
    mode,
    adapter: args.adapter,
    verbose: args.verbose,
    userRequest: UserRequestSchema.parse({
      raw_input: prompt,
      cwd: options?.cwd ?? process.cwd(),
      session_id: options?.sessionId,
      timestamp: new Date().toISOString(),
    }),
  };
};
