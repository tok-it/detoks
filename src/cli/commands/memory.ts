import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveSessionsDir } from "../../core/state/SessionStateManager.js";
import { getRagVectorDbPath } from "../../core/rag/rag-config.js";

const DISABLED_FLAG_FILE = join(homedir(), ".detoks", "disabled");

export interface MemoryCommandResult {
  ok: boolean;
  action: "disable" | "purge-all";
  message: string;
}

// detoks memory disable
// ~/.detoks/disabled 파일을 생성. 다음 실행부터 저장/조회/인덱싱 모두 OFF.
export async function runMemoryDisableCommand(): Promise<MemoryCommandResult> {
  try {
    await fs.mkdir(join(homedir(), ".detoks"), { recursive: true });
    await fs.writeFile(DISABLED_FLAG_FILE, "", { flag: "w" });
    return {
      ok: true,
      action: "disable",
      message: `DeToks 메모리 기능이 비활성화되었습니다.\n파일: ${DISABLED_FLAG_FILE}\n재활성화: 파일을 삭제하거나 DETOKS_MEMORY=on 환경 변수를 설정하세요.`,
    };
  } catch (err) {
    return {
      ok: false,
      action: "disable",
      message: `비활성화 파일 생성 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// detoks memory purge --all
// .state/sessions/*.json + .state/rag/vectors.db 일괄 삭제 (확인 프롬프트 포함).
export async function runMemoryPurgeAllCommand(opts: {
  skipConfirm?: boolean;
} = {}): Promise<MemoryCommandResult> {
  if (!opts.skipConfirm) {
    const confirmed = await promptConfirm(
      "⚠️  .state/sessions/ 전체와 벡터 DB를 영구 삭제합니다. 계속하시겠습니까? (yes/N): ",
    );
    if (!confirmed) {
      return { ok: true, action: "purge-all", message: "취소되었습니다." };
    }
  }

  const errors: string[] = [];
  let deletedCount = 0;

  // 1. session 파일 삭제
  const sessionsDir = resolveSessionsDir(process.cwd());
  try {
    const files = await fs.readdir(sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        await fs.unlink(join(sessionsDir, file));
        deletedCount++;
      } catch (e) {
        errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch {
    // sessionsDir이 없으면 그냥 통과
  }

  // 2. 벡터 DB 삭제
  try {
    const dbPath = getRagVectorDbPath(process.cwd());
    await fs.unlink(dbPath);
    deletedCount++;
  } catch {
    // 벡터 DB가 없으면 통과
  }

  if (errors.length > 0) {
    return {
      ok: false,
      action: "purge-all",
      message: `일부 파일 삭제 실패:\n${errors.join("\n")}`,
    };
  }

  return {
    ok: true,
    action: "purge-all",
    message: `${deletedCount}개 파일을 삭제했습니다. DeToks 메모리가 초기화되었습니다.`,
  };
}

async function promptConfirm(question: string): Promise<boolean> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let answer = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      answer = String(chunk).trim().toLowerCase();
      process.stdin.pause();
      resolve(answer === "yes" || answer === "y");
    });
  });
}
