import { describe, expect, it } from "vitest";
import { OutputAnalyzer } from "../../../../../src/core/utils/OutputAnalyzer.js";

describe("OutputAnalyzer", () => {
  it("should analyze basic text correctly", () => {
    const output = "Hello World\nLine 2";
    const analysis = OutputAnalyzer.analyze(output);
    
    expect(analysis.total_chars).toBe(output.length);
    expect(analysis.line_count).toBe(2);
    expect(analysis.code_block_count).toBe(0);
    expect(analysis.parse_success).toBe(false);
  });

  it("should detect code blocks and content", () => {
    const output = "Here is some code:\n```typescript\nfunction test() { return 1; }\n```";
    const analysis = OutputAnalyzer.analyze(output);
    
    expect(analysis.code_block_count).toBe(1);
    expect(analysis.function_count).toBe(1);
    expect(analysis.parse_success).toBe(true);
  });

  it("should detect error handling and comments", () => {
    const output = "```python\n# This is a comment\ntry:\n    pass\nexcept Exception as e:\n    print(e)\n```";
    const analysis = OutputAnalyzer.analyze(output);
    
    expect(analysis.has_comments).toBe(true);
    expect(analysis.has_error_handling).toBe(true);
  });
});
