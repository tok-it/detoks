import { createHash } from "node:crypto";
import {
  RawAnalyzedRequestSchema,
  TaskGraphSchema,
} from "../../schemas/pipeline.js";
import type { RawTask, Task, TaskGraph } from "../../schemas/pipeline.js";

/**
 * Role 1의 최소 output을 받아 실행 가능한 TaskGraph로 변환합니다.
 *
 * 책임:
 * - Role 1 output 파싱 및 스키마 검증
 * - intent 폐기 (TaskGraph에 포함하지 않음)
 * - 누락 필드 보강: title, status, input_hash
 */
export class TaskGraphProcessor {
  static process(rawInput: unknown): TaskGraph {
    const analyzed = RawAnalyzedRequestSchema.parse(rawInput);
    const tasks: Task[] = analyzed.tasks.map((raw) => this.enrichTask(raw));
    return TaskGraphSchema.parse({ tasks });
  }

  private static enrichTask(raw: RawTask): Task {
    return {
      id: raw.id,
      type: raw.type,
      title: raw.title ?? this.deriveTitle(raw),
      description: raw.description,
      status: "pending",
      input_hash: this.computeInputHash(raw),
      depends_on: raw.depends_on,
    };
  }

  private static deriveTitle(raw: RawTask): string {
    const type = raw.type.charAt(0).toUpperCase() + raw.type.slice(1);
    return `${type} (${raw.id})`;
  }

  // id + type + depends_on 기반으로 task 고유 해시 생성
  private static computeInputHash(raw: RawTask): string {
    const content = JSON.stringify({
      id: raw.id,
      type: raw.type,
      depends_on: [...raw.depends_on].sort(),
    });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
