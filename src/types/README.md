# Type Definitions

Core type definitions for DeToks state management and context handling.

## TaskType

`TaskType` reuses the canonical `RequestCategory` definition from `src/schemas/pipeline.ts`.

The semantic source of truth for the eight task types is:

- `docs/TYPE_DEFINITION.md`

The enum source of truth remains:

- `src/schemas/pipeline.ts`
  - `RequestCategorySchema`
  - `RequestCategory`

State and context layers reuse that same category set:

- `src/types/state.ts`
  - `TaskType = RequestCategory`
  - `TaskTypeSchema = RequestCategorySchema`

## Why This Matters

The task categories are shared across:

- request analysis
- task graph construction
- dependency ordering
- state persistence

Because of that, category meanings must stay stable. If the semantic meaning changes, the dependency logic and task ordering rules must be reviewed together.

## Notes

- Do not redefine task category meanings independently in this folder
- If you add or remove a top-level category, update `src/schemas/pipeline.ts` first
- If you change the meaning of a category, update `docs/TYPE_DEFINITION.md` and any dependency logic that relies on it
