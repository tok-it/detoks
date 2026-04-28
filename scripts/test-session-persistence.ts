import { orchestratePipeline } from "../src/core/pipeline/orchestrator.js";
import { SessionStateManager } from "../src/core/state/SessionStateManager.js";
import { promises as fs } from "fs";
import { join } from "path";

async function runPersistenceTest() {
  const sessionId = "persistence-test-" + Date.now();
  console.log(`Starting Persistence Test with Session ID: ${sessionId}`);

  try {
    // 1차 실행: 분석 요청
    console.log("\n--- Run 1: Analysis ---");
    const result1 = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: true,
      userRequest: {
        raw_input: "Analyze the project structure",
        session_id: sessionId
      }
    });

    if (!result1.ok) throw new Error("Run 1 failed");
    console.log("Run 1 Completed. Tasks:", result1.taskRecords.length);

    // 세션 파일 존재 확인
    const sessionExists = await SessionStateManager.sessionExists(sessionId);
    console.log("Session File Exists:", sessionExists);

    // 2차 실행: 이전 결과를 바탕으로 한 요청
    console.log("\n--- Run 2: Summarize based on Run 1 ---");
    const result2 = await orchestratePipeline({
      mode: "run",
      adapter: "codex",
      executionMode: "stub",
      verbose: false,
      trace: true,
      userRequest: {
        raw_input: "Summarize the analysis results",
        session_id: sessionId
      }
    });

    if (!result2.ok) throw new Error("Run 2 failed");
    console.log("Run 2 Completed. Tasks:", result2.taskRecords.length);

    // 검증: Run 2의 traceLog에서 ContextOptimizer 단계 확인
    if (result2.traceLog) {
      const contextEntries = result2.traceLog.entries.filter(e => e.stage === "ContextOptimizer");
      console.log("\n--- Context Verification ---");
      for (const entry of contextEntries) {
        const contextData = entry.data as any;
        console.log(`Task ID: ${contextData.active_task_id}`);
        console.log(`Context Summary: ${contextData.context_summary}`);
        
        // 이전 태스크 결과가 포함되어 있는지 확인
        if (contextData.context_summary && contextData.context_summary.length > 50) {
            console.log("✅ Success: Previous context found in summary!");
        } else {
            console.log("❌ Failure: Context summary is empty or too short.");
        }
      }
    }

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    // 테스트 후 세션 파일 삭제
    try {
      await fs.rm(join(".state/sessions", `${sessionId}.json`), { force: true });
      console.log("\nCleanup: Session file deleted.");
    } catch {}
  }
}

runPersistenceTest();
