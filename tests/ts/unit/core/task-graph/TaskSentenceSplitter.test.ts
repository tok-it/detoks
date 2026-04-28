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

  it("splits comma-separated add step as separate task", () => {
    const result = TaskSentenceSplitter.split("Create a module, add routes, and test it");

    expect(result.sentences).toEqual([
      "Create a module",
      "add routes",
      "test it",
    ]);
  });

  it("does not let contraction swallow adjacent quoted string", () => {
    const result = TaskSentenceSplitter.split("don't run 'npm test && npm run build'");

    expect(result.sentences).toEqual(["don't run 'npm test && npm run build'"]);
  });

  it("keeps negation sentences intact without splitting", () => {
    const result = TaskSentenceSplitter.split("Do not deploy, just run tests");

    expect(result.sentences).toEqual(["Do not deploy, just run tests"]);
  });

  it("keeps conditional sentences intact without splitting", () => {
    const result = TaskSentenceSplitter.split("If tests fail, fix the config");

    expect(result.sentences).toEqual(["If tests fail, fix the config"]);
  });

  it("splits create-and-add follow-up into two tasks", () => {
    const result = TaskSentenceSplitter.split("Create a new endpoint and add tests");

    expect(result.sentences).toEqual([
      "Create a new endpoint",
      "add tests",
    ]);
  });

  it("does not split and-as-compound-verb with no object on left", () => {
    const result = TaskSentenceSplitter.split("find and add all usages");

    expect(result.sentences).toEqual(["find and add all usages"]);
  });

  it("splits unicode bullet list into individual task sentences", () => {
    const result = TaskSentenceSplitter.split(
      "• Find the module\n• Analyze the flow\n• Fix the bug",
    );

    expect(result.sentences).toEqual([
      "Find the module",
      "Analyze the flow",
      "Fix the bug",
    ]);
  });

  it("does not treat arithmetic results as numbered-list items", () => {
    const result = TaskSentenceSplitter.split("Create the result of 4 + 5. Also check it.");

    expect(result.sentences).toEqual([
      "Create the result of 4 + 5.",
      "Also check it.",
    ]);
  });

  it("preserves arithmetic expressions while splitting follow-up tasks", () => {
    const result = TaskSentenceSplitter.split(
      "Make a calculator with Python. First, make it so that only addition and subtraction are possible, and then create the result of 4 + 5. Also, check if it works correctly.",
    );

    expect(result.sentences).toContain("create the result of 4 + 5.");
    expect(result.sentences).not.toContain("create the result of 4 +");
  });

  it("does not treat spaced decimal-like values as numbered-list items", () => {
    const result = TaskSentenceSplitter.split("Update version 3. 10 config. Verify it.");

    expect(result.sentences).toEqual([
      "Update version 3. 10 config.",
      "Verify it.",
    ]);
  });

  it("keeps common abbreviations with the following phrase", () => {
    const result = TaskSentenceSplitter.split("Document e.g. Add tests as an example. Verify it.");

    expect(result.sentences).toEqual([
      "Document e.g. Add tests as an example.",
      "Verify it.",
    ]);
  });

  it("keeps descriptive comma fragments that look like noun phrases", () => {
    const result = TaskSentenceSplitter.split("Create a module, test data included, and document it");

    expect(result.sentences).toEqual([
      "Create a module, test data included",
      "document it",
    ]);
  });

  it("does not split hyphenated descriptors as follow-up actions", () => {
    const result = TaskSentenceSplitter.split("Build module and run-time config");

    expect(result.sentences).toEqual(["Build module and run-time config"]);
  });

  it("does not treat arithmetic words before numbers as numbered-list items", () => {
    const result = TaskSentenceSplitter.split(
      "Calculate the result of 4 plus 5. Next, calculate the result of 10 minus 3. Finally, summarize it.",
    );

    expect(result.sentences).toEqual([
      "Calculate the result of 4 plus 5.",
      "calculate the result of 10 minus 3.",
      "summarize it.",
    ]);
  });

  it("does not emit ordering markers as standalone tasks", () => {
    const result = TaskSentenceSplitter.split(
      "First, create an addition design. Next, create a subtraction design. Finally, verify the result.",
    );

    expect(result.sentences).toEqual([
      "create an addition design.",
      "create a subtraction design.",
      "verify the result.",
    ]);
  });

  describe("integration with TaskGraphProcessor", () => {
    it("create → validate: sequential dependency", () => {
      const compiled = TaskSentenceSplitter.split("Create a new endpoint and test it");
      const graph = TaskGraphProcessor.process(compiled);

      expect(graph.tasks.map((t) => t.type)).toEqual(["create", "validate"]);
      expect(graph.tasks[1]!.depends_on).toEqual(["t1"]);
    });

    it("create → document: sequential dependency", () => {
      const compiled = TaskSentenceSplitter.split("Implement auth flow and document it");
      const graph = TaskGraphProcessor.process(compiled);

      expect(graph.tasks.map((t) => t.type)).toEqual(["create", "document"]);
      expect(graph.tasks[1]!.depends_on).toEqual(["t1"]);
    });

    it("analyze → plan: two sentences produced", () => {
      const compiled = TaskSentenceSplitter.split("Analyze the issue and propose a plan");

      expect(compiled.sentences).toEqual(["Analyze the issue", "propose a plan"]);
      const graph = TaskGraphProcessor.process(compiled);
      expect(graph.tasks.map((t) => t.type)).toEqual(["analyze", "plan"]);
    });

    it("add tests → validate type, not create", () => {
      const compiled = TaskSentenceSplitter.split("Create a new endpoint and add tests");
      const graph = TaskGraphProcessor.process(compiled);

      expect(graph.tasks.map((t) => t.type)).toEqual(["create", "validate"]);
      expect(graph.tasks[1]!.depends_on).toEqual(["t1"]);
    });

    it("explore → analyze → modify: three-step sequential chain", () => {
      const compiled = TaskSentenceSplitter.split(
        "Find the module, inspect the flow, and patch the bug",
      );
      const graph = TaskGraphProcessor.process(compiled);

      expect(graph.tasks.map((t) => t.type)).toEqual(["explore", "analyze", "modify"]);
      expect(graph.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(graph.tasks[2]!.depends_on).toEqual(["t2"]);
    });
  });
});
