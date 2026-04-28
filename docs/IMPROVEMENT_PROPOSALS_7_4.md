# Improvement Proposals for Phase 7.4 (Supplementing Phase 3)

## Overview
Phase 7.4 focuses on persisting the `task.type` (determined by Role 2.1) through the Orchestrator into the Session State. The following two improvement proposals leverage this newly available metadata to supplement Phase 3 (Adapter Execution) and ensure a robust data flow between the Executor (Role 3) and the State Manager (Role 2.2).

---

## Proposal 1: Type-Aware Adapter Execution (Supplementing Phase 3)

### Motivation
Currently, Phase 3 adapters (Role 3) receive a generic execution request (containing `prompt`, `mode`, etc.) without semantic awareness of the task's intent. While Role 2.1 successfully classifies tasks into semantic categories (e.g., `analyze`, `modify`, `validate`), this intent is not forwarded to the adapter execution layer. By passing the `task.type` down to `executeWithAdapter`, we enable execution environments to perform intelligent, type-specific optimizations.

### Implementation Details
1. **Schema Update**: Update `ExecutionRequest` in `src/integrations/adapters/types.ts` (and related adapter interfaces) to include an optional `task_type: RequestCategory`.
2. **Orchestrator Injection**: Modify `orchestratePipeline` in `src/core/pipeline/orchestrator.ts` to pass `task.type` directly into the `executeWithAdapter` function call.
3. **Adapter Utilization**: 
   - **Dynamic Timeouts**: Adapters can apply strict, shorter timeouts for `explore` tasks and extended timeouts for resource-intensive `modify` or `execute` tasks.
   - **Parameter Tuning**: Adapters can adjust LLM hyperparameters dynamically based on the task type (e.g., lower temperature for `validate` to ensure strict, deterministic output; higher temperature for `create` to encourage variety).
   - **Specialized Parsing**: Adapters can select specialized output parsing logic tailored to the expected result format of the specific task type.

---

## Proposal 2: Post-Execution Structural Validation (Refining Phase 7.4)

### Motivation
Phase 7.4 ensures that `task.type` is persisted in the session state. This contextual metadata serves as a reliable baseline for validating the physical output produced by Role 3. Generic JSON validation is insufficient for complex tasks; type-driven structural validation confirms that the execution output structurally aligns with its intended semantic category, creating a robust feedback loop.

### Implementation Details
1. **Normalizer Enhancement**: Update `ExecutionResultNormalizer` in `src/core/state/ExecutionResultNormalizer.ts` to accept `task.type` as an additional parameter during the output normalization process.
2. **Type-Driven Integrity Checks**:
   - **`modify` / `create`**: Verify that the extracted `changed_files` array is present and non-empty in the structured output. If empty, trigger fallback heuristic extraction from `raw_output`.
   - **`validate`**: Ensure a compliance report, test results array, or a boolean success indicator is strictly present in the `structured_output`.
   - **`analyze`**: Require a `summary` or `findings` object.
3. **Feedback Loop**: If mandatory structural fields for a specific task type are missing, the normalizer should flag the execution result as structurally incomplete. This prevents "hallucinated success"—where an LLM claims an action is complete without providing the required structural proof (e.g., a file change list).
