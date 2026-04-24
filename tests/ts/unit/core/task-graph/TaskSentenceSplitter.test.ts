import { describe, expect, it } from "vitest";
import { TaskSentenceSplitter } from "../../../../../src/core/task-graph/TaskSentenceSplitter.js";
import { TaskGraphProcessor } from "../../../../../src/core/task-graph/TaskGraphProcessor.js";

describe("TaskSentenceSplitter", () => {
  it("returns a single sentence unchanged for a simple request", () => {
    const result = TaskSentenceSplitter.split("Find the auth module");

    expect(result.sentences).toEqual(["Find the auth module"]);
  });

  it("splits period-separated imperative sentences", () => {
    const result = TaskSentenceSplitter.split("Find the module. Analyze the flow. Patch the bug.");

    expect(result.sentences).toEqual([
      "Find the module.",
      "Analyze the flow.",
      "Patch the bug.",
    ]);
  });

  it("splits numbered steps into individual task sentences", () => {
    const result = TaskSentenceSplitter.split(
      "1. Find the module 2. Analyze the flow 3. Fix the bug",
    );

    expect(result.sentences).toEqual([
      "Find the module",
      "Analyze the flow",
      "Fix the bug",
    ]);
  });

  it("splits create-and-validate follow-up requests", () => {
    const result = TaskSentenceSplitter.split("Create a new endpoint and test it");

    expect(result.sentences).toEqual([
      "Create a new endpoint",
      "test it",
    ]);
  });

  it("splits analyze-and-plan follow-up requests", () => {
    const result = TaskSentenceSplitter.split("Analyze the issue and propose a plan");

    expect(result.sentences).toEqual([
      "Analyze the issue",
      "propose a plan",
    ]);
  });

  it("splits comma-separated multi-step requests conservatively", () => {
    const result = TaskSentenceSplitter.split(
      "Find the module, inspect the flow, and patch the bug",
    );

    expect(result.sentences).toEqual([
      "Find the module",
      "inspect the flow",
      "patch the bug",
    ]);
  });

  it("keeps descriptive commas inside a single request", () => {
    const result = TaskSentenceSplitter.split("Create a concise, well-tested module");

    expect(result.sentences).toEqual(["Create a concise, well-tested module"]);
  });

  it("preserves quoted command content as one executable sentence", () => {
    const result = TaskSentenceSplitter.split('Run "npm test && npm run build"');

    expect(result.sentences).toEqual(['Run "npm test && npm run build"']);
  });

  it("reorders after-clauses to preserve execution order", () => {
    const result = TaskSentenceSplitter.split("Run tests after deploy");

    expect(result.sentences).toEqual([
      "deploy",
      "Run tests",
    ]);
  });

  it("splits three-part and-chain into three sentences", () => {
    const result = TaskSentenceSplitter.split(
      "Implement auth flow and test it and document it",
    );

    expect(result.sentences).toEqual([
      "Implement auth flow",
      "test it",
      "document it",
    ]);
  });

  it("preserves single-quoted command content as one sentence", () => {
    const result = TaskSentenceSplitter.split("Run 'npm test && npm run build'");

    expect(result.sentences).toEqual(["Run 'npm test && npm run build'"]);
  });

  it("does not split and-as-compound-action phrases", () => {
    const result = TaskSentenceSplitter.split("find and replace all usages");

    expect(result.sentences).toEqual(["find and replace all usages"]);
  });

  it("feeds split output into TaskGraphProcessor with sequential dependencies", () => {
    const compiled = TaskSentenceSplitter.split("Create a new endpoint and test it");
    const graph = TaskGraphProcessor.process(compiled);

    expect(graph.tasks.map((task) => task.type)).toEqual(["create", "validate"]);
    expect(graph.tasks[1]!.depends_on).toEqual(["t1"]);
  });
});
