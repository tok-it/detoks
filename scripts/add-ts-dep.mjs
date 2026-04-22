import { npmCommand, requirePackages, runCommand } from "./_dep-helper.mjs";

const packages = process.argv.slice(2);
requirePackages(packages);
runCommand(npmCommand(), ["install", ...packages]);
