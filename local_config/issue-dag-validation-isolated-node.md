# Issue: DAG validation fails on ordered document follow-up workflow

## Summary

Long multi-step requests can fail during DAG validation with `DISCONNECTED_NODE` when a `document` task appears in the middle of an explicitly ordered workflow.

Observed failure:

```text
DAG validation failed: DISCONNECTED_NODE - Task "t3" has no dependencies and no dependents - isolated from the graph
```

This is a Role 2.1 TaskGraph construction issue, not a DAGValidator issue. `DAGValidator` is correctly rejecting a partially connected graph. The graph becomes partially connected because `TaskGraphProcessor` currently treats `document` as a hard terminal type.

## Reproduction

Use a long request that splits into ordered task sentences:

```ts
[
  "Analyze the entire codebase",
  "create a comprehensive documentation with examples",
  "implement all suggested improvements",
  "validate everything",
]
```

Expected task flow:

```text
t1 analyze -> t2 document -> t3 create -> t4 validate
```

Current behavior before fix:

```text
t1 analyze -> t2 document
t3 create
t4 validate
```

`t3` can become isolated from the connected component, causing `DAGValidator.validate()` to fail with `DISCONNECTED_NODE`.

## Root Cause

### 1. Documentation creation classification is incomplete

`TaskGraphProcessor.TYPE_PATTERNS` classifies obvious documentation verbs such as `write documentation` or `update docs`, but phrases like `create comprehensive documentation` can be classified as `create`.

That classification is unstable for documentation artifacts.

### 2. `document` is treated as an absolute terminal node

`TaskGraphProcessor.FLOWS_TO.document` is currently empty:

```ts
document: []
```

That means any task after `document` is forced into `depends_on: []`, even when the splitter produced the tasks from explicit ordering signals such as comma order, `and then`, or repeated imperative steps.

## Expected Behavior

- Documentation artifacts should classify as `document` even when the verb is `create`, `generate`, `draft`, or `produce`.
- `document` should remain usually terminal, but explicit follow-up tasks should be allowed to continue the ordered workflow.
- The reproduction should produce one connected sequential graph:

```text
analyze -> document -> create -> validate
```

## Proposed Fix

1. Add documentation artifact patterns before generic `create` patterns:

```ts
/\b(create|generate|draft|produce)\s+(a\s+|an\s+|the\s+)?(comprehensive\s+)?(documentation|docs|readme|guide|docstring|comment[s]?)\b/
```

2. Allow `document` to flow into follow-up task types:

```ts
document: ["analyze", "modify", "validate", "execute", "create", "plan"]
```

3. Keep `DAGValidator` unchanged. It should continue to reject genuinely disconnected graphs.

## Acceptance Criteria

- [ ] `Create comprehensive documentation` classifies as `document`.
- [ ] `document -> validate` creates a sequential dependency when represented as ordered task sentences.
- [ ] `analyze -> document -> create -> validate` creates a connected sequential graph.
- [ ] Existing disconnected-node validation behavior remains intact.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.

## Related Files

- `src/core/task-graph/TaskGraphProcessor.ts`
- `src/core/task-graph/DAGValidator.ts`
- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
- `tests/ts/unit/core/task-graph/DAGValidator.test.ts`
- `docs/TYPE_DEFINITION.md`

