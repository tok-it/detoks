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

// PTY/Session controller 기반 이벤트 타입
export type PtyEventType = "chunk" | "prompt" | "reply" | "exit" | "timeout" | "error";

export interface PtyEvent {
  type: PtyEventType;
  timestamp: number;
  data?: string; // chunk payload, prompt text, user reply
  stream?: "stdout" | "stderr"; // for chunk events
}

export interface PtyTranscript {
  events: PtyEvent[];
  startTime: number;
  endTime: number;
  totalDuration: number;
  exitCode?: number;
  timedOut: boolean;
}

export interface PtyResult extends SubprocessResult {
  transcript: PtyTranscript;
  interactionTurns?: Array<{ prompt: string; reply: string }>;
}

export interface SubprocessRunner {
  run(request: SubprocessRequest): Promise<SubprocessResult>;
}
