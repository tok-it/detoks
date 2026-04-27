# PR: Fix document follow-up DAG connectivity

## Summary

This PR fixes a TaskGraph construction regression where ordered multi-step requests could fail DAG validation with `DISCONNECTED_NODE` after a `document` task.

The failure was caused by two gaps:

- Documentation artifacts such as `create comprehensive documentation` could be classified as `create` instead of `document`.
- `document` was treated as an absolute terminal type, so explicit follow-up tasks were disconnected from the prior workflow.

`DAGValidator` is left unchanged. Its disconnected-node check is still correct; the graph builder now avoids producing a disconnected graph for explicitly ordered follow-up workflows.

## Related Issue

- Closes #

## Change Type

- [x] Bug fix
- [ ] Feature
- [x] Tests
- [x] Docs
- [ ] Refactor

## Changes

- `src/core/task-graph/TaskGraphProcessor.ts`
  - Added a `document` pattern for `create/generate/draft/produce documentation/docs/readme/guide/docstring/comments`.
  - Updated `FLOWS_TO.document` so explicit follow-up work can continue into `analyze`, `modify`, `validate`, `execute`, `create`, or `plan`.

- `tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts`
  - Added coverage for `Create comprehensive documentation -> document`.
  - Updated `document -> validate` expectation to sequential.
  - Added regression coverage for `analyze -> document -> create -> validate`.

- `docs/TYPE_DEFINITION.md`
  - Clarified that `document` is typically terminal, but explicitly ordered follow-up work can continue the workflow.

## Before

```text
Analyze the entire codebase
create a comprehensive documentation with examples
implement all suggested improvements
validate everything
```

Could produce a partially connected graph:

```text
t1 analyze -> t2 document
t3 create
t4 validate
```

`DAGValidator` then rejected `t3` as disconnected.

## After

The same ordered workflow produces a connected graph:

```text
t1 analyze -> t2 document -> t3 create -> t4 validate
```

## Validation

- [x] `npm run build`
- [x] `npm run test -- tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts tests/ts/unit/core/task-graph/TaskSentenceSplitter.test.ts tests/ts/unit/core/task-graph/DAGValidator.test.ts`
- [x] `npm run test`

Full test result:

```text
Test Files  37 passed | 1 skipped (38)
Tests       321 passed | 1 skipped (322)
```

## Risk / Notes

- This changes the old assumption that `document` always terminates dependency flow.
- The updated behavior is intentionally limited to graph construction for ordered task sentences.
- Genuine disconnected graphs are still rejected by `DAGValidator`.

## Files Changed

```text
docs/TYPE_DEFINITION.md
src/core/task-graph/TaskGraphProcessor.ts
tests/ts/unit/core/task-graph/TaskGraphProcessor.test.ts
```

