# tmux Task Workflow

This document records the tmux-based workflow used for detoks development.

## Pane roles

### Left pane
- Design the next work unit
- Prepare the harness prompt
- Refine scope before implementation

### Right pane
- Run Codex with the prepared prompt
- Implement the task
- Make code changes and minimal validation

### Focused completion pane
- Finish the completed work unit
- Review scope and branch fit
- Commit and push
- Draft the PR body
- Draft the Git Kanban In Progress update
- Draft the next work unit prompt

## Launcher scripts

### Start implementation

```bash
./scripts/tmux-codex-workflow.sh "<task prompt>"
```

This splits a right pane and starts `scripts/codex-task.sh` there.
If the agent is controlling tmux from the Codex sandbox and sees a socket permission error, rerun the tmux command through the escalated path or run the launcher directly inside tmux.

### Finish work

```bash
./scripts/tmux-codex-complete-workflow.sh "<completed work unit prompt>"
```

This runs the completion workflow in the currently focused tmux pane.

## Template files

- `.prompts/common-agent-rules.md`
- `.prompts/codex-task-complete.md`
- `.prompts/git-kanban-in-progress-template.md`
- `.prompts/next-task-harness-template.md`
- `docs/my docs/CLI_PIPELINE_STATUS.md`

## Notes

- Keep the left pane focused on the next prompt only.
- Keep the right pane focused on implementation only.
- Keep the completion pane focused on closure and handoff.
- Prefer small, reviewable work units.
- Before resuming detoks CLI work in a new session, read `docs/my docs/CLI_PIPELINE_STATUS.md`.
- After each meaningful detoks CLI work unit, update the changed progress sections in `docs/my docs/CLI_PIPELINE_STATUS.md`.
- When tmux control is needed from the agent, prefer escalated tmux commands for `split-window`, `capture-pane`, `select-pane`, `display-message`, and `ls`.
- Do not treat tmux socket permission errors as task failures; they are an environment boundary between the Codex sandbox and the existing tmux server.
