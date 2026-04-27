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
      ["Show me where auth is implemented","explore",  "show me where"],
      ["Create a new module",              "create",   "create"],
      ["Scaffold a service",               "create",   "scaffold"],
      ["Set up a worker",                  "create",   "set up"],
      ["Create a new endpoint",            "create",   "create endpoint"],
      ["Modify the config file",           "modify",   "modify"],
      ["Patch the login bug",              "modify",   "patch"],
      ["Rename the helper function",       "modify",   "rename"],
      ["Fix the auth bug in the service",  "modify",   "fix bug"],
      ["Analyze the dependencies",         "analyze",  "analyze"],
      ["Investigate the memory issue",     "analyze",  "investigate"],
      ["Explain how auth flow works",      "analyze",  "how works"],
      ["Analyze why the login flow fails", "analyze",  "analyze why"],
      ["Propose appropriate fixes",        "analyze",  "propose fixes"],
      ["Validate the output",              "validate", "validate"],
      ["Run the tests",                    "validate", "test over run"],
      ["Lint the project",                 "validate", "lint"],
      ["Run python test",                  "validate", "run test phrase"],
      ["Run typecheck",                    "validate", "run typecheck phrase"],
      ["Execute the deployment",           "execute",  "execute"],
      ["Restart the server",               "execute",  "restart"],
      ["Install dependencies",             "execute",  "install"],
      ["Run the build",                    "execute",  "run build phrase"],
      ["Run migration",                    "execute",  "run migration phrase"],
      ["Document the API",                 "document", "document"],
      ["Write the README",                 "document", "readme"],
      ["Prepare a summary",                "document", "summary"],
      ["Update the docs",                  "document", "update docs"],
      ["Create comprehensive documentation","document","create documentation"],
      ["Plan the architecture",            "plan",     "plan"],
      ["Break down the migration steps",   "plan",     "break down"],
      ["Outline the rollout approach",     "plan",     "outline/approach"],
      ["Design the migration strategy",    "plan",     "design strategy"],
      // idiom: make + 숙어 → create 패턴 'make' 단일어에 가로채지지 않아야 함
      ["Make sure the output is valid",    "validate", "make sure → validate"],
      ["Make certain the config is correct","validate","make certain → validate"],
      ["Make changes to the config file",  "modify",   "make changes → modify"],
      ["Make improvements to the service", "modify",   "make improvements → modify"],
      ["Make use of the existing module",  "execute",  "make use of → execute"],
      ["Make a note of the findings",      "document", "make a note → document"],
      ["Make a plan for the rollout",      "plan",     "make a plan → plan"],
      // question-form: 키워드 없는 질문형 → analyze
      ["What should we address first?",   "analyze",  "question-form → analyze"],
      ["How far should we go with this?", "analyze",  "how far → analyze"],
      ["Which pattern is most effective?", "analyze",  "question-form no keyword → analyze"],
      // question-form: 키워드 있는 질문형 → 키워드 패턴 우선
      ["How can we validate this?",        "validate", "validate keyword beats ?"],
      ["What should we deploy next?",      "execute",  "execute keyword beats ?"],
      ["How should we fix the bug?",       "modify",   "modify keyword beats ?"],
      ["Where should we find the module?", "explore",  "explore keyword beats ?"],
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

    it("execute → analyze → create 흐름은 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Fetch last month's sales data from the database", // execute
          "Analyze the differences",                        // analyze
          "Create a visualization chart",                   // create
        ],
      });

      expect(result.tasks.map((task) => task.type)).toEqual([
        "execute",
        "analyze",
        "create",
      ]);
      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(result.tasks[2]!.depends_on).toEqual(["t2"]);
    });

    it("execute → analyze → analyze → create 흐름은 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Fetch last month's sales data from the database", // execute
          "Compare it with the previous month",              // analyze
          "Analyze the differences",                        // analyze
          "Create a visualization chart",                   // create
        ],
      });

      expect(result.tasks.map((task) => task.type)).toEqual([
        "execute",
        "analyze",
        "analyze",
        "create",
      ]);
      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(result.tasks[2]!.depends_on).toEqual(["t2"]);
      expect(result.tasks[3]!.depends_on).toEqual(["t3"]);
    });

    it("execute → analyze → analyze → create 리포트 흐름은 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Collect server logs",             // execute
          "Analyze error patterns",          // analyze
          "Propose appropriate fixes",       // analyze
          "Generate the final report",       // create
        ],
      });

      expect(result.tasks.map((task) => task.type)).toEqual([
        "execute",
        "analyze",
        "analyze",
        "create",
      ]);
      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(result.tasks[2]!.depends_on).toEqual(["t2"]);
      expect(result.tasks[3]!.depends_on).toEqual(["t3"]);
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

    it("document → validate 흐름은 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Document the API",        // document
          "Validate the output",     // validate
        ],
      });

      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
    });

    it("analyze → document → create → validate follow-up workflow는 sequential이다", () => {
      const result = TaskGraphProcessor.process({
        sentences: [
          "Analyze the entire codebase",
          "create a comprehensive documentation with examples",
          "implement all suggested improvements",
          "validate everything",
        ],
      });

      expect(result.tasks.map((task) => task.type)).toEqual([
        "analyze",
        "document",
        "create",
        "validate",
      ]);
      expect(result.tasks[0]!.depends_on).toEqual([]);
      expect(result.tasks[1]!.depends_on).toEqual(["t1"]);
      expect(result.tasks[2]!.depends_on).toEqual(["t2"]);
      expect(result.tasks[3]!.depends_on).toEqual(["t3"]);
    });
  });
});
