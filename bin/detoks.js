#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntry = resolve(packageRoot, "src/cli/index.ts");
const distEntry = resolve(packageRoot, "dist/src/cli/index.js");
const cliArgs = process.argv.slice(2);

const launch = (() => {
  if (existsSync(sourceEntry)) {
    try {
      const tsxLoader = require.resolve("tsx");
      return {
        command: process.execPath,
        args: [
          "--import",
          pathToFileURL(tsxLoader).href,
          sourceEntry,
          ...cliArgs,
        ],
      };
    } catch {
      // Fall back to the built JS entrypoint when tsx is unavailable.
    }
  }

  if (existsSync(distEntry)) {
    return {
      command: process.execPath,
      args: [distEntry, ...cliArgs],
    };
  }

  return {
    command: process.execPath,
    args: [distEntry, ...cliArgs],
  };
})();

const child = spawn(launch.command, launch.args, {
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
