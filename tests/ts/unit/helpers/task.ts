import type { Task, TaskGraph } from "../../../../src/schemas/pipeline.js";

export function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    type: "explore",
    status: "pending",
    title: overrides.id,
    input_hash: "test",
    depends_on: [],
    ...overrides,
  };
}

export function makeGraph(...tasks: Task[]): TaskGraph {
  return { tasks };
}
