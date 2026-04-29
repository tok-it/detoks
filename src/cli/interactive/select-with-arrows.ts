import { stdin as input, stdout as output } from "node:process";
import { colors } from "../colors.js";

export interface SelectOption {
  value: string;
  label: string;
}

export const selectWithArrows = async (
  options: SelectOption[],
  title: string,
): Promise<string | null> => {
  if (options.length === 0) {
    output.write(colors.warning("선택 가능한 항목이 없습니다.\n\n"));
    return null;
  }

  let selectedIndex = 0;

  // stdin을 raw mode로 설정
  const originalRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  // 초기 UI 렌더링
  const renderMenu = () => {
    output.write(`\n${colors.title(title)}\n`);
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (option) {
        if (i === selectedIndex) {
          output.write(
            `${colors.success("▶")} ${colors.boldText(option.label)}\n`,
          );
        } else {
          output.write(`  ${colors.muted(option.label)}\n`);
        }
      }
    }
    output.write(
      `\n${colors.muted("↑↓ 화살표로 선택, Enter로 확정")}\n`,
    );
  };

  renderMenu();

  return new Promise((resolve) => {
    let lastIndex = selectedIndex;

    const handleKeyPress = (chunk: Buffer) => {
      const str = chunk.toString("utf8");

      // 화살표 키: ESC + [ + A(위) 또는 B(아래)
      if (str === "\x1b[A") {
        // 위 화살표
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      } else if (str === "\x1b[B") {
        // 아래 화살표
        selectedIndex = (selectedIndex + 1) % options.length;
      } else if (str === "\r" || str === "\n") {
        // Enter
        input.removeListener("data", handleKeyPress);
        input.setRawMode(originalRawMode);
        input.pause();

        const selected = options[selectedIndex];
        output.write("\n");
        if (selected) {
          output.write(
            colors.success(`✓ 선택: ${selected.label}\n\n`),
          );
          resolve(selected.value);
        } else {
          resolve(null);
        }
        return;
      } else if (str === "") {
        // Ctrl+C
        input.removeListener("data", handleKeyPress);
        input.setRawMode(originalRawMode);
        input.pause();
        output.write("\n");
        process.exit(0);
      }

      // 선택이 변경되면 다시 렌더링
      if (selectedIndex !== lastIndex) {
        lastIndex = selectedIndex;
        // 메뉴를 위로 스크롤해서 다시 렌더링
        const lineCount = options.length + 3;
        output.write(`\x1b[${lineCount}A\x1b[J`);
        renderMenu();
      }
    };

    input.on("data", handleKeyPress);
  });
};
