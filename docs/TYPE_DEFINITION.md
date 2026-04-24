# Type Definition

This document defines the canonical meaning of the eight task types used in detoks.

The goal of this definition is not only to label requests consistently, but also to keep dependency resolution and execution ordering stable.

## Canonical Types

### `explore`

`explore` is the stage for finding information before making a judgment or changing anything.

- Purpose: gather locations, references, structure, entry points, call paths, and surrounding context
- Core question: "What exists?" / "Where is it?" / "What is related?"
- Not included: root-cause judgment, implementation, validation, or command execution

### `analyze`

`analyze` is the stage for interpreting information that has already been found.

- Purpose: explain causes, behavior, relationships, impact, and trade-offs
- Core question: "Why does this happen?" / "How does this work?" / "What does this imply?"
- Not included: simple lookup, direct modification, or command execution

### `create`

`create` is the stage for producing a new artifact that does not already exist.

- Purpose: add new code, files, tests, schemas, documents, or drafts
- Core question: "What new artifact should be created?"
- Not included: changing an existing artifact as the main objective

### `modify`

`modify` is the stage for changing an artifact that already exists.

- Purpose: fix bugs, refactor, update logic, adjust configuration, or revise existing output
- Core question: "What existing artifact should be changed?"
- Not included: net-new artifact creation as the primary objective

### `validate`

`validate` is the stage for checking whether something is correct, safe, complete, or acceptable.

- Purpose: run tests, type checks, assertions, or quality checks
- Core question: "Does this pass?" / "Is this correct?" / "Does this satisfy the requirement?"
- Not included: explaining causes in depth or performing general execution for its own sake

### `execute`

`execute` is the stage for performing an action through tools, commands, scripts, or workflows.

- Purpose: run commands, launch processes, build, deploy, or trigger operational steps
- Core question: "What should be run?"
- Not included: verification-focused checking when the primary purpose is confirmation rather than execution itself

### `document`

`document` is the stage for turning known information or completed results into a readable explanation.

- Purpose: summarize, explain, document, or organize results for human consumption
- Core question: "How should this be explained or written down?"
- Not included: planning future work or discovering new information as the primary objective

### `plan`

`plan` is the stage for deciding how work should be broken down and ordered before execution.

- Purpose: define steps, orchestration, dependency structure, sequencing, and strategy
- Core question: "What is the execution plan?"
- Not included: actual exploration, implementation, or execution as the main output

## Boundary Rules

These rules are intended to prevent overlap between categories and keep downstream dependency logic predictable.

### `explore` vs `analyze`

- Use `explore` when the task is primarily about discovery or context collection
- Use `analyze` when the task is primarily about interpretation or judgment

### `create` vs `modify`

- Use `create` when the main output is new
- Use `modify` when the main output is an existing artifact that gets changed

### `validate` vs `execute`

- Use `validate` when confirmation or correctness checking is the main goal
- Use `execute` when running an action, command, or workflow is the main goal

### `document` vs `plan`

- Use `document` when the output is a summary, explanation, or written record
- Use `plan` when the output is a future-facing procedure, sequence, or strategy

## Dependency-Oriented Interpretation

These definitions are designed to support stable execution ordering.

Typical natural flows:

- `plan -> explore`
- `explore -> analyze`
- `analyze -> create`
- `analyze -> modify`
- `analyze -> validate`
- `analyze -> document`
- `create -> validate`
- `create -> execute`
- `create -> document`
- `modify -> validate`
- `modify -> execute`
- `modify -> document`
- `execute -> validate`
- `execute -> document`
- `validate -> modify`
- `validate -> document`

`document` is typically a terminal stage.

## Notes

- This file is the canonical semantic definition for the eight task types
- Enum values remain defined in `src/schemas/pipeline.ts`
- Dependency logic must stay aligned with these meanings to avoid unstable task ordering
