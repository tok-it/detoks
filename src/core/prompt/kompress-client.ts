import { compressTextNode } from "./node-compressor.js";

export interface KompressClientOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  modelId?: string;
  requestTimeoutMs?: number;
}

export interface KompressClientResult {
  compressed: string;
  compression_ratio: number;
  tokens_saved: number;
  model_used?: string;
}

export async function compressTextWithKompress(
  text: string,
  _options: KompressClientOptions = {},
): Promise<KompressClientResult> {
  return compressTextNode(text);
}

export function shutdownKompressWorker(): boolean {
  return false;
}

export function resetKompressWorkerForTests(): void {
  // no-op: no worker to reset
}
