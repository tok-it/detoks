import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RequestCategoryValues } from "../../../../../src/schemas/pipeline.js";
import { TaskGraphProcessor } from "../../../../../src/core/task-graph/TaskGraphProcessor.js";
import { TaskSentenceSplitter } from "../../../../../src/core/task-graph/TaskSentenceSplitter.js";

const DATA_DIR = resolve("local_config/data/dataTest_Compact");
const VALID_TYPES = new Set<string>(RequestCategoryValues);

function extractPrompt(filePath: string): string {
  const source = readFileSync(filePath, "utf-8");
  const match = /compiled_prompt:\s*`([^`]*)`/.exec(source);
  if (!match?.[1]) throw new Error(`compiled_prompt not found in ${filePath}`);
  return match[1];
}

const files = readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();

describe("dataTest_Compact — sentence split & type classification", () => {
  describe("TaskSentenceSplitter", () => {
    it.each(files)("%s: 문장이 1개 이상 분리되어야 한다", (file) => {
      const prompt = extractPrompt(join(DATA_DIR, file));
      const result = TaskSentenceSplitter.split(prompt);

      expect(result.sentences.length).toBeGreaterThanOrEqual(1);
    });

    it.each(files)("%s: 분리된 각 문장이 비어 있지 않아야 한다", (file) => {
      const prompt = extractPrompt(join(DATA_DIR, file));
      const result = TaskSentenceSplitter.split(prompt);

      for (const sentence of result.sentences) {
        expect(sentence.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("TaskGraphProcessor", () => {
    it.each(files)(
      "%s: 모든 task의 type이 유효한 카테고리여야 한다",
      (file) => {
        const prompt = extractPrompt(join(DATA_DIR, file));
        const compiled = TaskSentenceSplitter.split(prompt);
        const graph = TaskGraphProcessor.process(compiled);

        for (const task of graph.tasks) {
          expect(
            VALID_TYPES.has(task.type),
            `"${task.type}" is not a valid category`,
          ).toBe(true);
        }
      },
    );

    it.each(files)(
      "%s: task id가 t1, t2, ... 순서로 생성되어야 한다",
      (file) => {
        const prompt = extractPrompt(join(DATA_DIR, file));
        const compiled = TaskSentenceSplitter.split(prompt);
        const graph = TaskGraphProcessor.process(compiled);

        expect(graph.tasks.map((t) => t.id)).toEqual(
          graph.tasks.map((_, i) => `t${i + 1}`),
        );
      },
    );

    it.each(files)("%s: 모든 task의 status가 pending이어야 한다", (file) => {
      const prompt = extractPrompt(join(DATA_DIR, file));
      const compiled = TaskSentenceSplitter.split(prompt);
      const graph = TaskGraphProcessor.process(compiled);

      for (const task of graph.tasks) {
        expect(task.status).toBe("pending");
      }
    });

    it.each(files)("%s: input_hash가 16자리 hex 문자열이어야 한다", (file) => {
      const prompt = extractPrompt(join(DATA_DIR, file));
      const compiled = TaskSentenceSplitter.split(prompt);
      const graph = TaskGraphProcessor.process(compiled);

      for (const task of graph.tasks) {
        expect(task.input_hash).toMatch(/^[a-f0-9]{16}$/);
      }
    });

    it.each(files)(
      "%s: depends_on이 자신보다 앞선 task id만 참조해야 한다",
      (file) => {
        const prompt = extractPrompt(join(DATA_DIR, file));
        const compiled = TaskSentenceSplitter.split(prompt);
        const graph = TaskGraphProcessor.process(compiled);

        for (let i = 0; i < graph.tasks.length; i++) {
          const task = graph.tasks[i]!;
          for (const dep of task.depends_on) {
            const depIndex = graph.tasks.findIndex((t) => t.id === dep);
            expect(
              depIndex,
              `task ${task.id} depends_on "${dep}" which does not exist or comes after`,
            ).toBeGreaterThanOrEqual(0);
            expect(depIndex).toBeLessThan(i);
          }
        }
      },
    );
  });
});
