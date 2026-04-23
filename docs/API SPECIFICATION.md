🔌 API Specification
Overview
This document defines the internal API contracts for detoks.

At the current stage, detoks does not expose a public HTTP API.
Instead, its primary APIs are the contracts between:

CLI layer
TypeScript core pipeline
Python Role 1 modules
CLI adapter integrations
state persistence layer
API Style
Contract-first
JSON-serializable payloads
Explicit validation at boundaries
Clear separation between model work and orchestration work
Scope
This specification covers:

CLI input and output contracts
Role 1 Python integration contracts
pipeline stage input/output contracts
adapter execution contracts
state persistence contracts
This specification does not yet define:

public REST endpoints
WebSocket APIs
external SDK bindings
Canonical Data Types
Task
type Task = {
  id: string;
  type: string;
  depends_on: string[];
};
TaskGraph
type TaskGraph = {
  tasks: Task[];
};
SessionState
type SessionState = {
  shared_context: Record<string, unknown>;
  task_results: Record<string, unknown>;
};
Common Request / Response Envelopes
Success Envelope
type ApiSuccess<T> = {
  ok: true;
  data: T;
};
Error Envelope
type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
Union
type ApiResult<T> = ApiSuccess<T> | ApiError;
1. CLI Layer API
The CLI layer must behave as an orchestrator, not as a business-logic holder.

Input Contract
type CliInput = {
  raw: string;
  session_id?: string;
  cwd?: string;
  timestamp?: string;
};
Output Contract
type CliOutput = {
  summary: string;
  content?: string;
  structured?: Record<string, unknown>;
  next_action?: string;
};
Routing Rules
/... -> internal command route
!... -> shell execution route
default text -> LLM pipeline route
2. Prompt Compiler API
The Prompt Compiler compresses Korean user input into concise English prompts while preserving intent.

Request
type PromptCompileRequest = {
  raw_input: string;
  shared_context?: Record<string, unknown>;
};
Response
type PromptCompileResponse = {
  compressed_prompt: string;
  language: "ko" | "en" | "mixed";
  preserved_constraints?: string[];
};
Contract
input text may be Korean, English, or mixed
output must remain semantically aligned with the original request
output must be shorter and cleaner than the source input when possible
3. Request Analyzer API
The Request Analyzer classifies the request and extracts executable tasks.

Request
type RequestAnalyzeRequest = {
  compressed_prompt: string;
  session_state?: SessionState;
};
Response
type RequestAnalyzeResponse = {
  category: string;
  keywords: string[];
  tasks: Task[];
};
Notes
category is a routing and orchestration label
keywords are used for context selection and later retrieval
tasks must be decomposed into executable units
4. Task Graph Builder API
The Task Graph Builder converts extracted tasks into a dependency-aware graph.

Request
type TaskGraphBuildRequest = {
  tasks: Task[];
};
Response
type TaskGraphBuildResponse = {
  graph: TaskGraph;
};
Rules
each task must have a unique id
depends_on must always exist
graph must be topologically executable
5. Context Optimizer API
The Context Optimizer selects only the context needed for the current execution step.

Request
type ContextOptimizeRequest = {
  category: string;
  keywords: string[];
  graph: TaskGraph;
  session_state?: SessionState;
  available_context?: Record<string, unknown>;
};
Response
type ContextOptimizeResponse = {
  optimized_context: Record<string, unknown>;
  removed_keys?: string[];
  summary?: string;
};
Rules
avoid duplicate context
keep only execution-relevant information
preserve critical decisions and active state
6. Role 1 Python Integration API
Role 1 Python modules are consumed through an explicit integration boundary.

Boundary Rule
TypeScript must not import Python implementation details directly.
It must invoke Role 1 functionality through src/integrations/role1-python.

Python Invocation Request
type Role1InvocationRequest = {
  action: "prompt_compile" | "request_analyze";
  payload: Record<string, unknown>;
};
Python Invocation Response
type Role1InvocationResponse = {
  action: string;
  result: Record<string, unknown>;
};
Transport Expectation
JSON in
JSON out
explicit exit code handling
separate stdout / stderr handling
7. Executor API
The Executor triggers the target LLM CLI or a system adapter.

Request
type ExecuteRequest = {
  prompt: string;
  context?: Record<string, unknown>;
  target: "codex" | "gemini";
  cwd?: string;
  timeout_ms?: number;
};
Response
type ExecuteResponse = {
  raw_output: string;
  exit_code: number;
  stderr?: string;
};
Rules
subprocesses must be timeout-aware
stdout and stderr must be separable
non-zero exit codes must be handled explicitly
8. Output Processor API
The Output Processor converts raw execution output into a compact reusable result.

Request
type OutputProcessRequest = {
  raw_output: string;
  category?: string;
};
Response
type OutputProcessResponse = {
  summary: string;
  structured?: Record<string, unknown>;
  next_action?: string;
};
Rules
preserve key results
remove redundant explanation
emit data that can be reused in the next turn
9. State Manager API
The State Manager persists reusable session state between turns.

Save Request
type StateSaveRequest = {
  session_id: string;
  state: SessionState;
};
Load Request
type StateLoadRequest = {
  session_id: string;
};
Load Response
type StateLoadResponse = {
  session_id: string;
  state: SessionState | null;
};
Rules
state must be JSON-serializable
state updates must be explicit
persistence format must remain deterministic
10. Adapter API
Adapters abstract differences between target CLIs.

Adapter Interface
type CliAdapter = {
  name: "codex" | "gemini";
  buildCommand(input: ExecuteRequest): {
    command: string;
    args: string[];
  };
  parseResult(result: ExecuteResponse): OutputProcessResponse;
};
Required Behaviors
convert a normalized request into target-specific command execution
normalize target-specific output back into a common response shape
11. Error Codes
Recommended internal error codes:

INVALID_INPUT
VALIDATION_FAILED
ROLE1_EXECUTION_FAILED
ADAPTER_EXECUTION_FAILED
TIMEOUT
STATE_LOAD_FAILED
STATE_SAVE_FAILED
UNSUPPORTED_TARGET
12. Non-Goals
The following are explicitly outside the scope of the current API surface:

public SaaS API exposure
authentication / authorization API
billing API
remote multi-tenant session service
13. Future Extensions
Potential future API additions:

REST or local HTTP control API
WebSocket streaming output API
checkpoint retrieval API
document retrieval / RAG support API
agent coordination API