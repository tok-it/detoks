import chalk from "chalk";

export const colors = {
  title: (text: string) => chalk.bold.cyan(text),
  header: (text: string) => chalk.bold.blue(text),
  success: (text: string) => chalk.green(text),
  error: (text: string) => chalk.red(text),
  warning: (text: string) => chalk.yellow(text),
  info: (text: string) => chalk.gray(text),
  prompt: (text: string) => chalk.cyan(text),
  muted: (text: string) => chalk.dim(text),
  boldText: (text: string) => chalk.bold(text),

  checkmark: chalk.green("✓"),
  cross: chalk.red("✗"),
  arrow: chalk.cyan("→"),
  bullet: chalk.cyan("•"),
};
