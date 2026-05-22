import { describe, expect, it } from "vitest";
import {
  extractRagMeta,
  normalizeRagPreview,
  toRagDisplayItem,
  toRagDisplaySourceType,
  toRagRelevance,
} from "../../../../../src/core/pipeline/rag-display.js";

describe("pipeline RAG display helpers", () => {
  it("extracts only task metadata persisted for RAG", () => {
    expect(extractRagMeta({
      title: "Read docs",
      input_hash: "abc",
      depends_on: ["t1"],
    })).toEqual({
      title: "Read docs",
      input_hash: "abc",
      depends_on: ["t1"],
    });

    expect(extractRagMeta()).toEqual({});
  });

  it("normalizes previews and maps source/relevance labels", () => {
    expect(normalizeRagPreview("  one\n two\tthree  ")).toBe("one two three");
    expect(normalizeRagPreview("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefg...");

    expect(toRagDisplaySourceType("prompt")).toBe("previous_request");
    expect(toRagDisplaySourceType("output")).toBe("previous_output");
    expect(toRagDisplaySourceType("task")).toBe("previous_task");

    expect(toRagRelevance(0.35)).toBe("high");
    expect(toRagRelevance(0.65)).toBe("medium");
    expect(toRagRelevance(0.66)).toBe("low");
  });

  it("converts a snippet to a display item", () => {
    expect(toRagDisplayItem({
      id: "r1",
      distance: 0.2,
      kind: "task",
      session_id: "s1",
      task_id: "t1",
      content: "previous task output",
    })).toEqual({
      sourceType: "previous_task",
      sessionId: "s1",
      taskId: "t1",
      preview: "previous task output",
      relevance: "high",
      injected: false,
    });
  });
});
