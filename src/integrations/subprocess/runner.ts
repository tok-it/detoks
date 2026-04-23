import type { SubprocessRequest, SubprocessResult, SubprocessRunner } from "./types.js";

const formatCommand = (request: SubprocessRequest): string => {
  const args = request.args.length > 0 ? ` ${request.args.join(" ")}` : "";
  return `${request.command}${args}`;
};

export const createStubSubprocessRunner = (): SubprocessRunner => ({
  async run(request: SubprocessRequest): Promise<SubprocessResult> {
    return {
      stdout: `[stub:subprocess] ${formatCommand(request)}`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    };
  },
});
