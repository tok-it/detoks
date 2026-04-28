import { describe, expect, it } from "vitest";
import { TaskCandidateExtractor } from "../../../../../src/core/task-graph/TaskCandidateExtractor.js";
import { TaskGraphProcessor } from "../../../../../src/core/task-graph/TaskGraphProcessor.js";

describe("TaskCandidateExtractor", () => {
  it("extracts executable tasks from discourse-heavy normalized input", () => {
    const result = TaskCandidateExtractor.extractSentences(
      [
        "Well, it's not urgent right now, but please handle it step-by-step if possible.",
        "If it's okay, first find where the authentication-related code is,",
        "and then analyze in detail how the login request flows from the controller to the service and repository.",
        "And since there seems to be a problem due to duplicate validation logic, please fix that bug.",
        "After the fix, be sure to run regression tests and related unit tests to confirm that it has been fixed correctly.",
        "Finally, although it seems like you are saying the same thing twice, document the reason for the change and the test results you confirmed in README or the work notes.",
        "You can reduce unnecessary words, but please maintain only the important sequence of tasks.",
      ].join(" "),
    );

    expect(result.sentences).toEqual([
      "find where the authentication-related code is",
      "analyze in detail how the login request flows from the controller to the service and repository.",
      "fix the bug due to duplicate validation logic.",
      "run regression tests and related unit tests to confirm that it has been fixed correctly.",
      "document the reason for the change and the test results you confirmed in README or the work notes.",
    ]);
  });

  it("builds a five-task workflow from extracted candidates", () => {
    const sentences = TaskCandidateExtractor.extractSentences(
      "Please process these five tasks sequentially, gradually, but reduce unnecessary words.\n" +
        "1. Find exactly where the code related to authentication is in the project.\n" +
        "2. Analyze in detail the flow from the login request starting on the screen to the controller, service, and repository.\n" +
        "3. Fix the bug that appears due to redundant validation logic in the actual code.\n" +
        "4. After the fix, run regression tests and related unit tests to confirm that it has been corrected properly.\n" +
        "5. Finally, document the reason for the change and the test results confirmed in the work notes.",
    );
    const graph = TaskGraphProcessor.process(sentences);

    expect(sentences.sentences).toEqual([
      "Find exactly where the code related to authentication is in the project.",
      "Analyze in detail the flow from the login request starting on the screen to the controller, service, and repository.",
      "Fix the bug that appears due to redundant validation logic in the actual code.",
      "run regression tests and related unit tests to confirm that it has been corrected properly.",
      "document the reason for the change and the test results confirmed in the work notes.",
    ]);
    expect(graph.tasks.map((task) => task.type)).toEqual([
      "explore",
      "analyze",
      "modify",
      "validate",
      "document",
    ]);
    expect(graph.tasks.map((task) => task.depends_on)).toEqual([
      [],
      ["t1"],
      ["t2"],
      ["t3"],
      ["t4"],
    ]);
  });
});
