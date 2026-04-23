# tokit — Claude Code Instructions

## Project Overview

tokit is a wrapper system that sits in front of LLM CLIs (Codex, Gemini).
It controls prompt compilation, task decomposition, and execution flow.

Pipeline: User Input → Prompt Compiler → Request Analyzer → Task Graph Builder → Context Optimizer → LLM CLI → Output Processor → State Manager → User Output

---

## Role 2.1: Task Graph & Workflow Engine

Manages execution order and dependencies based on the Task Graph.

### Core Rules

1. **Maintain DAG** — circular dependencies are prohibited; the graph must always be topologically sortable
2. **Execution order is determined by code** — do not trust model output implicitly; re-verify based on declared dependencies
3. **Parallel execution** — tasks without `depends_on` may run in parallel; execute sequentially when shared state conflicts exist
4. **Tasks must be independently executable** — clear input/output boundaries, minimal side effects

### Prohibitions

- Do NOT force an execution order without declared dependencies
- Do NOT allow circular graphs
- Do NOT share internal state across tasks

### Execution Flow

```
validate graph → resolve dependencies → execute → collect result
```

### Failure Handling

| Condition | Action |
|---|---|
| Cycle detected | Terminate execution immediately |
| Task failure | Apply fallback or skip strategy |
| Missing dependency | Treat as validation failure |

---

## Branch Strategy

### Branch Roles
- Default integration branch: `dev`
- Stable release branch: `main`
- Short-lived working branches: `feature/*`, `fix/*`, `docs/*`, `chore/*`, `hotfix/*`

### Team Rules
- Do not push directly to `dev` or `main`.
- Open a pull request for every feature, fix, documentation update, or refactor.
- Keep each pull request focused on one task or one tightly related change set.
- Rebase or sync with `dev` before requesting review.

### Recommended Flow
1. Branch from `dev`.
2. Use a prefix: `feature/`, `fix/`, `docs/`, `chore/`.
3. Commit small, reviewable changes.
4. Open a PR targeting `dev`.
5. Merge only after approval and CI success.
6. Promote `dev` → `main` for stable milestones only.

### Pull Request Expectations
- At least one teammate review
- Passing CI checks (GitHub Actions)
- Updated docs when behavior changes
- Clear summary, test steps, and scope

### detoks Repository Policy
```text
Default branch:        dev
Protected branch(es):  main, dev
Required approvals:    1
Required status checks: CI (GitHub Actions)
Direct push policy:    Not allowed on dev or main
Release branch policy: Promote dev → main for stable milestones only
Emergency hotfix process: branch hotfix/* from main → PR to main → backmerge to dev
```
