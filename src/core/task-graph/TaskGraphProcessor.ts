import { createHash } from "node:crypto";
import {
  CompiledSentencesSchema,
  TaskGraphSchema,
} from "../../schemas/pipeline.js";
import type { Task, TaskGraph, RequestCategory } from "../../schemas/pipeline.js";

/**
 * Role 1의 sentences[]를 받아 실행 가능한 TaskGraph로 변환합니다.
 *
 * Role 1 담당: 한국어 → 영어 변환, 문장 단위 분리
 * Role 2.1 담당:
 *   - single / multi 요청 구분
 *   - 각 문장 type 분류
 *   - id 생성
 *   - type 흐름 기반 depends_on 결정 (sequential vs parallel)
 */
export class TaskGraphProcessor {
  // type A → type B 가 "자연스러운 흐름"인 관계 정의
  // 이 관계에 해당하면 sequential(의존), 해당하지 않으면 parallel(독립)
  private static readonly FLOWS_TO: Partial<Record<RequestCategory, RequestCategory[]>> = {
    explore:  ["analyze", "modify", "create", "validate"],
    plan:     ["explore", "create", "execute"],
    analyze:  ["modify", "validate", "document", "create"],
    create:   ["validate", "modify", "document", "execute"],
    modify:   ["validate", "document", "execute"],
    validate: ["document", "execute", "modify"],
    execute:  ["validate", "document"],
    document: [],
  };

  static process(rawInput: unknown): TaskGraph {
    const { sentences } = CompiledSentencesSchema.parse(rawInput);

    // single 요청: 문장 1개 → task 1개, depends_on 없음
    if (sentences.length === 1) {
      const sentence = sentences[0]!;
      const type = this.classifyType(sentence);
      const tasks = [this.buildTask(sentence, 0, type, [])];
      return TaskGraphSchema.parse({ tasks });
    }

    // multi 요청: 먼저 모든 type을 분류한 뒤 흐름 기반으로 depends_on 결정
    const types: RequestCategory[] = sentences.map((s) => this.classifyType(s));
    const tasks: Task[] = sentences.map((sentence, index) => {
      const type = types[index]!;
      const dependsOn = this.resolveDependsOn(index, types);
      return this.buildTask(sentence, index, type, dependsOn);
    });

    return TaskGraphSchema.parse({ tasks });
  }

  // type 흐름이 자연스러우면 이전 task에 의존(sequential)
  // 흐름이 끊기면 독립(parallel, depends_on: [])
  private static resolveDependsOn(index: number, types: RequestCategory[]): string[] {
    if (index === 0) return [];
    const prev = types[index - 1] as RequestCategory;
    const curr = types[index] as RequestCategory;
    return this.FLOWS_TO[prev]?.includes(curr) ? [`t${index}`] : [];
  }

  private static buildTask(
    sentence: string,
    index: number,
    type: RequestCategory,
    dependsOn: string[]
  ): Task {
    const id = `t${index + 1}`;
    return {
      id,
      type,
      title: sentence,
      status: "pending",
      input_hash: this.computeInputHash(id, type, sentence),
      depends_on: dependsOn,
    };
  }

  // 영어 문장 키워드 기반 type 분류
  private static classifyType(sentence: string): RequestCategory {
    const s = sentence.toLowerCase();
    if (/read|find|look|search|explore|browse|check/.test(s)) return "explore";
    if (/create|implement|build|write|add|generate/.test(s))  return "create";
    if (/modify|update|change|fix|edit|refactor/.test(s))     return "modify";
    if (/analyze|review|inspect|investigate/.test(s))          return "analyze";
    if (/test|validate|verify|assert/.test(s))                 return "validate";
    if (/run|execute|deploy|start|launch/.test(s))             return "execute";
    if (/document|docs|summarize|describe/.test(s))            return "document";
    if (/plan|design|organize|structure|outline/.test(s))      return "plan";
    return "execute";
  }

  private static computeInputHash(id: string, type: string, sentence: string): string {
    const content = JSON.stringify({ id, type, sentence });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
