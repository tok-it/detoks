import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { createInterface } from "node:readline";
import { colors } from "../colors.js";

export interface PromptLineOptions {
  placeholder?: string;
  validate?: (value: string) => string | null;
}

export interface PromptLineStreams {
  input?: typeof defaultInput;
  output?: typeof defaultOutput;
}

export const promptLine = async (
  message: string,
  options: PromptLineOptions = {},
  streams: PromptLineStreams = {},
): Promise<string | null> => {
  const input = streams.input ?? defaultInput;
  const output = streams.output ?? defaultOutput;

  if (!input.isTTY || !output.isTTY) {
    return null;
  }

  const { placeholder, validate } = options;

  const hint = placeholder ? colors.muted(` (예: ${placeholder})`) : "";
  output.write(`${colors.title(message)}${hint}\n`);

  while (true) {
    const value = await new Promise<string | null>((resolve) => {
      const rl = createInterface({ input, output, terminal: true });

      rl.on("SIGINT", () => {
        rl.close();
        output.write("\n");
        process.exit(130);
      });

      rl.question(colors.muted("> "), (answer) => {
        rl.close();
        resolve(answer.trim() || null);
      });
    });

    if (value === null) {
      return null;
    }

    if (validate) {
      const error = validate(value);
      if (error) {
        output.write(`${colors.error(`✗ ${error}`)}\n`);
        continue;
      }
    }

    return value;
  }
};
