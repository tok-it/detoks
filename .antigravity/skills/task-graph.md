# Role 2.1: Task Graph & Workflow Engine

Manages execution order and dependencies based on the Task Graph.

## Core Rules

1. **Maintain DAG** — circular dependencies are prohibited; the graph must always be topologically sortable
2. **Execution order is determined by code** — do not trust model output implicitly; re-verify based on declared dependencies
3. **Parallel execution** — tasks without `depends_on` may run in parallel; execute sequentially when shared state conflicts exist
4. **Tasks must be independently executable** — clear input/output boundaries, minimal side effects

## Prohibitions

- Do NOT force an execution order without declared dependencies
- Do NOT allow circular graphs
- Do NOT share internal state across tasks

## Execution Flow

```
validate graph → resolve dependencies → execute → collect result
```

## Failure Handling

| Condition | Action |
|---|---|
| Cycle detected | Terminate execution immediately |
| Task failure | Apply fallback or skip strategy |
| Missing dependency | Treat as validation failure |
