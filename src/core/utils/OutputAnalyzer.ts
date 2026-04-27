import { get_encoding } from 'tiktoken';

let _enc: ReturnType<typeof get_encoding> | null = null;
function getEncoder() {
  if (!_enc) _enc = get_encoding('cl100k_base');
  return _enc;
}

export interface OutputAnalysis {
  total_chars: number;
  estimated_tokens: number;
  line_count: number;
  code_block_count: number;
  function_count: number;
  has_error_handling: boolean;
  has_comments: boolean;
  parse_success: boolean;
}

export class OutputAnalyzer {
  /**
   * 원시 출력을 정적으로 분석하여 코드 품질 지표 추출
   */
  static analyze(rawOutput: string): OutputAnalysis {
    const lines = rawOutput.split('\n');
    const codeBlocks = rawOutput.match(/```[\s\S]*?```/g) ?? [];
    // 언어 태그(```python 등)와 ``` 마커 모두 제거
    const codeContent = codeBlocks
      .map(b => b.replace(/^```\w*\n?/, '').replace(/```$/, ''))
      .join('\n');

    const functionPatterns = /\b(function|def|const\s+\w+\s*=\s*(async\s*)?\(|async\s+function|class\s+\w+)/g;
    const functionMatches = codeContent.match(functionPatterns) ?? [];

    let estimatedTokens: number;
    try {
      estimatedTokens = getEncoder().encode(rawOutput).length;
    } catch {
      estimatedTokens = Math.ceil(rawOutput.length / 4);
    }

    return {
      total_chars: rawOutput.length,
      estimated_tokens: estimatedTokens,
      line_count: lines.length,
      code_block_count: codeBlocks.length,
      function_count: functionMatches.length,
      has_error_handling: this.hasErrorHandling(codeContent),
      has_comments: this.hasComments(codeContent),
      parse_success: codeBlocks.length > 0,
    };
  }

  private static hasErrorHandling(code: string): boolean {
    return /try\s*{|catch\s*\(|except\s*:|except\s*\(|finally\s*:|Error|Exception|throw\s+/.test(code);
  }

  private static hasComments(code: string): boolean {
    return /\/\/|#\s|\/\*|\*\//.test(code);
  }
}
