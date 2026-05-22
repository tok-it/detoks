import type { Adapter } from "../../core/pipeline/types.js";
import { colors } from "../colors.js";

export interface AdapterLoginCommandSpec {
  command: string;
  args: string[];
}

interface AdapterCliReferenceSection {
  title: string;
  commands: string[];
  note?: string;
}

export const getAdapterLoginCommandSpec = (
  adapter: Adapter,
): AdapterLoginCommandSpec => {
  if (adapter === "codex") {
    return { command: "codex", args: ["login"] };
  }

  if (adapter === "gemini") {
    return { command: "gemini", args: [] };
  }

  return { command: "claude", args: ["auth", "login"] };
};

export const getLoginHint = (adapter: Adapter): string => {
  const spec = getAdapterLoginCommandSpec(adapter);
  return [spec.command, ...spec.args].join(" ").trim();
};

export const getLogoutHint = (adapter: Adapter): string =>
  adapter === "claude" ? "claude auth logout" : `${adapter} logout`;

const getAdapterCliReferenceSections = (): AdapterCliReferenceSection[] => [
  {
    title: "Codex CLI",
    commands: [
      "codex login",
      "codex login status",
      "codex debug models",
      "codex /goal <objective>",
      "codex /goal pause | resume | clear",
      "codex logout",
    ],
    note: "로그인 / 상태 / 모델 조회 / 목표 관리(/goal)는 Codex 원본 CLI에서 처리합니다.",
  },
  {
    title: "Gemini CLI",
    commands: ["gemini"],
    note: "인증 진입은 gemini로 하고, 모델 선택은 detoks /gms가 맡습니다.",
  },
  {
    title: "Claude Code",
    commands: [
      "claude auth login",
      "claude auth status --json",
      "claude --model <model>",
      "claude auth logout",
    ],
    note: "Claude는 auth 후 detoks /claude-models가 모델 선택을 맡고, 실행 시 --model로 전달됩니다.",
  },
];

export const formatAdapterCliReference = (): string => {
  const lines: string[] = [
    "",
    `${colors.title("외부 adapter CLI 참고")}`,
    "",
  ];

  for (const section of getAdapterCliReferenceSections()) {
    lines.push(`  ${colors.boldText(section.title)}`);
    for (const command of section.commands) {
      lines.push(`    ${colors.muted(command)}`);
    }
    if (section.note) {
      lines.push(`    ${colors.muted(section.note)}`);
    }
    lines.push("");
  }

  lines.push(
    colors.muted(
      "  detoks 명령은 REPL 안에서, adapter CLI 원본 명령은 외부 터미널에서 사용하세요.",
    ),
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
};
