import { describe, expect, it } from "vitest";
import { TaskGraphProcessor } from "../../../../../src/core/task-graph/TaskGraphProcessor.js";

describe("TaskGraphProcessor", () => {
  describe("single 요청 (문장 1개)", () => {
    it("문장 1개는 task 1개로 변환된다", () => {
      const result = TaskGraphProcessor.process({
        sentences: ["Find all files in src"],
      });

      expect(result.tasks).toHaveLength(1);
    });

    it("단일 task의 id는 t1이고 depends_on은 비어 있다", () => {
      const result = TaskGraphProcessor.process({
        sentences: ["Find all files in src"],
      });
      const task = result.tasks[0]!;

      expect(task.id).toBe("t1");
      expect(task.depends_on).toEqual([]);
    });

    it("단일 task의 title은 입력 문장과 동일하다", () => {
      const sentence = "Find all files in src";
      const result = TaskGraphProcessor.process({ sentences: [sentence] });

      expect(result.tasks[0]!.title).toBe(sentence);
    });

    it("단일 task의 status는 pending이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: ["Find all files in src"],
      });

      expect(result.tasks[0]!.status).toBe("pending");
    });

    it("input_hash는 16자리 hex 문자열이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: ["Find all files in src"],
      });

      expect(result.tasks[0]!.input_hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("type 분류", () => {
    const cases: [string, string, string][] = [
      ["Find the structure",               "explore",  "find"],
      ["Locate the auth module",           "explore",  "locate"],
      ["Trace where this value is defined","explore",  "trace/where defined"],
      ["List all references",              "explore",  "references"],
      ["Create a new module",              "create",   "create"],
      ["Scaffold a service",               "create",   "scaffold"],
      ["Set up a worker",                  "create",   "set up"],
      ["Modify the config file",           "modify",   "modify"],
      ["Patch the login bug",              "modify",   "patch"],
      ["Rename the helper function",       "modify",   "rename"],
      ["Analyze the dependencies",         "analyze",  "analyze"],
      ["Investigate the memory issue",     "analyze",  "investigate"],
      ["Explain how auth flow works",      "analyze",  "how works"],
      ["Validate the output",              "validate", "validate"],
      ["Run the tests",                    "validate", "test over run"],
      ["Lint the project",                 "validate", "lint"],
      ["Execute the deployment",           "execute",  "execute"],
      ["Restart the server",               "execute",  "restart"],
      ["Install dependencies",             "execute",  "install"],
      ["Document the API",                 "document", "document"],
      ["Write the README",                 "document", "readme"],
      ["Prepare a summary",                "document", "summary"],
      ["Plan the architecture",            "plan",     "plan"],
      ["Break down the migration steps",   "plan",     "break down"],
      ["Outline the rollout approach",     "plan",     "outline/approach"],
    ];

    it.each(cases)('"%s" → type: "%s" (%s 키워드)', (sentence, expectedType) => {
      const result = TaskGraphProcessor.process({ sentences: [sentence] });

      expect(result.tasks[0]!.type).toBe(expectedType);
    });
  });

  describe("multi 요청 — sequential 흐름", () => {
    it("explore → analyze → modify 흐름은 순차 의존을 생성한다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Find the project structure",   // explore
          "Analyze the dependencies",     // analyze
          "Modify the config file",       // modify
        ],
      });

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(result.tasks[2]!.depends_on).toEqual(["t2"]);
    });

    it("task id는 t1, t2, t3 순서로 생성된다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Find the project structure",
          "Analyze the dependencies",
          "Modify the config file",
        ],
      });

      expect(result.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    });

    it("create → validate 흐름은 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Create a new component",  // create
          "Validate the output",     // validate
        ],
      });

      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
    });
  });

  describe("multi 요청 — parallel (독립)", () => {
    it("FLOWS_TO에 없는 흐름은 depends_on: []로 독립 처리된다", () => {
      // FLOWS_TO["create"] = ["validate", "modify", "document", "execute"] — explore 없음
      const result = TaskGraphProcessor.process({
        sentences: [
          "Create a new component",  // create
          "Find all references",     // explore
        ],
      });

      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual([]);
    });

    it("document → 어떤 type이든 독립 처리된다 (FLOWS_TO[document] = [])", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Document the API",        // document
          "Validate the output",     // validate
        ],
      });

      expect(result.tasks[1]!.depends_on).toEqual([]);
    });
  });
});
