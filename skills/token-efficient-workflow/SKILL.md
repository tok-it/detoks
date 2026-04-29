---
name: token-efficient-workflow
description: Use when working in coding agents and the goal is to minimize token usage without sacrificing implementation quality, scope control, or verification discipline. Apply to coding, debugging, CLI work, reviews, and iterative delivery where concise context handling and compact reporting matter.
---

# Token Efficient Workflow

Goal: minimize token usage without reducing execution quality.

## Core Rules

- Act first; explain only when needed.
- Do not repeat context already present in the thread or files.
- Start with the 3 to 5 most relevant files.
- Prefer paths, symbols, line numbers, and errors over pasted code.
- Infer safe details; ask only when blocked or when risk is high.
- Keep scope fixed to the requested work unit.
- Prioritize implementation and verification over narration.

## Start Sequence

Before changing code:

1. Check the current branch.
2. Check `git status --short`.
3. Check the relevant diff.
4. Search for the narrow set of related files and symbols.
5. Read only the docs needed for the active task.

Always search before reading. Read only the smallest useful slice.

## Context Compression Rules

### Reading

- Do not dump full files into the conversation.
- Read the smallest useful function, type, or test block.
- Search by:
  - symbol name
  - error string
  - CLI flag
  - test name
  - module boundary

### Writing

Keep explanations compact:

- what changed
- why it changed
- how it was verified

### Referencing Code

Prefer:

- `src/...`
- `functionName()`
- `line 42`

instead of long code blocks.

## Progress Update Format

Use 1 to 2 short sentences:

- what was confirmed
- what is next

Example:

`The issue is narrowed to the real adapter path. Next I am checking subprocess arguments and the related smoke test.`

## Final Response Format

Always use this order:

1. Summary
2. Changed files
3. Verification
4. Remaining risks or next step

Skip unnecessary background unless it affects the decision.

## Implementation Rules

- Make the thinnest safe change.
- Edit as few files as possible.
- Follow existing patterns and test contracts.
- Add a new abstraction only when repetition or risk justifies it.
- Separate UI changes from runtime or data-path changes when possible.

## Verification Rules

- Run the narrowest relevant test first.
- Run broader validation last.
- Summarize failures instead of pasting long logs.
- Avoid full-suite runs unless they are needed.

Recommended order:

1. targeted unit test
2. related integration test
3. typecheck or build
4. full suite only if needed

## Question Rules

Ask only when:

- a destructive action is required
- elevated permissions or network access is required
- requirements conflict
- a reasonable assumption would be risky

Otherwise, make a safe assumption and continue.

## Output Style

- Be direct.
- Be brief.
- Avoid repeating the same point twice.
- Do not paste long logs unless they are the result.
- Do not include unnecessary apologies or filler.

## Avoid

- long process narration
- full log dumps
- large pasted code blocks
- scope expansion
- repeated restatement
- speculative refactors outside the task

## One-Line Rule

Search first, read narrow, edit thin, verify small, report short.
