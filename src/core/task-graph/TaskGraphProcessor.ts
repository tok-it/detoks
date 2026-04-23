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
    // ① Role 1 output을 RawAnalyzedRequestSchema로 파싱
    //    → { intent: "...", tasks: [{ id, type, depends_on }] } 구조 검증
    //    → 스키마에 맞지 않으면 여기서 ZodError 발생
    const analyzed = RawAnalyzedRequestSchema.parse(rawInput);

    // ② intent 폐기
    //    analyzed에는 intent와 tasks 두 필드가 있지만,
    //    analyzed.tasks 만 꺼냄 → intent는 이 줄 이후로 사용되지 않음
    //    (TaskGraph 스키마에 intent 필드가 없으므로 포함시키지 않음)
    const tasks: Task[] = analyzed.tasks.map((raw) => this.enrichTask(raw));

    // ③ TaskGraph로 변환
    //    TaskGraphSchema는 { tasks: Task[] } 구조
    //    enrichTask로 보강된 tasks 배열을 넣어 최종 TaskGraph 완성
    //    → 여기서도 Zod 검증이 한 번 더 실행되어 완전한 구조 보장
    return TaskGraphSchema.parse({ tasks });
  }

  private static enrichTask(raw: RawTask): Task {
    // Role 1이 준 최소 필드(id, type, depends_on)에
    // Role 2.1이 나머지 필수 필드를 채워 완전한 Task로 만듦
    return {
      id: raw.id,
      type: raw.type,
      // Role 1이 title을 줬으면 그대로, 없으면 자동 생성
      title: raw.title ?? this.deriveTitle(raw),
      description: raw.description,
      // 모든 task는 처음엔 항상 대기 상태로 시작
      status: "pending",
      // task 내용 기반 고유 해시 (변경 감지 및 캐싱용)
      input_hash: this.computeInputHash(raw),
      depends_on: raw.depends_on,
    };
  }

  private static deriveTitle(raw: RawTask): string {
    // "create" → "Create (t1)" 형태로 읽기 쉬운 제목 생성
    const type = raw.type.charAt(0).toUpperCase() + raw.type.slice(1);
    return `${type} (${raw.id})`;
  }

  // id + type + depends_on 기반으로 task 고유 해시 생성
  // depends_on을 sort()하는 이유: 순서가 달라도 같은 의존성이면 동일 해시가 나와야 하기 때문
  private static computeInputHash(raw: RawTask): string {
    const content = JSON.stringify({
      id: raw.id,
      type: raw.type,
      depends_on: [...raw.depends_on].sort(),
    });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
