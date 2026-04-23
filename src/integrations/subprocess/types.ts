export interface SubprocessRequest {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface SubprocessRunner {
  run(request: SubprocessRequest): Promise<SubprocessResult>;
}
