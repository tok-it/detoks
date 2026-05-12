// Ensures node-pty's spawn-helper binaries are executable after npm install.
// node-pty prebuilds ship without +x on some platforms (macOS arm64), causing
// posix_spawnp failed at runtime.
const { chmodSync, existsSync } = require("fs");
const { join } = require("path");
const { platform, arch } = require("os");

const key = `${platform()}-${arch()}`;
const helperPath = join(
  __dirname,
  "..",
  "node_modules",
  "node-pty",
  "prebuilds",
  key,
  "spawn-helper",
);

if (existsSync(helperPath)) {
  try {
    chmodSync(helperPath, 0o755);
  } catch {
    // Non-fatal: may already be executable or on a read-only fs.
  }
}
