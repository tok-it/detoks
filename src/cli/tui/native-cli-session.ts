import { createInteractivePtySession } from "../../integrations/subprocess/pty-session.js";
import { getAdapter } from "../../core/executor/execute.js";
import type { Adapter } from "../../core/pipeline/types.js";
import type { PtyEvent, PtyResult, PtySessionController, SubprocessRequest } from "../../integrations/subprocess/types.js";

export interface EmbeddedNativeCliSessionOptions {
  adapter: Adapter;
  cwd: string;
  verbose: boolean;
  model?: string | undefined;
  sessionId?: string | undefined;
  onEvent?: (event: PtyEvent) => void;
}

export const buildEmbeddedNativeCliRequest = (
  options: EmbeddedNativeCliSessionOptions,
): SubprocessRequest => {
  const adapter = getAdapter(options.adapter);
  return adapter.buildSubprocessRequest({
    mode: "repl",
    prompt: "",
    verbose: options.verbose,
    ...(options.model !== undefined ? { model: options.model } : {}),
    cwd: options.cwd,
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    presentationMode: "embedded-pane",
  });
};

export const createEmbeddedNativeCliSession = (
  options: EmbeddedNativeCliSessionOptions,
): PtySessionController => {
  const request = buildEmbeddedNativeCliRequest(options);
  return createInteractivePtySession(request, {
    rawOutput: true,
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });
};

export type EmbeddedNativeCliSession = PtySessionController;
export type EmbeddedNativeCliSessionResult = PtyResult;
