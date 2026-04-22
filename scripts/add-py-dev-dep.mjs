import { requirePackages, runCommand, uvCommand } from "./_dep-helper.mjs";

const packages = process.argv.slice(2);
requirePackages(packages);
runCommand(uvCommand(), ["add", "--dev", ...packages]);
