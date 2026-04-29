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

  // stdin이 TTY가 아니면 첫 번째 옵션 선택
  if (!input.isTTY) {
    const firstOption = options[0];
    if (firstOption) {
      output.write(colors.success(`✓ 선택: ${firstOption.label}\n\n`));
      return firstOption.value;
    }
    return null;
  }

  // stdin을 raw mode로 설정
  const originalRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  // 초기 UI 렌더링 (커서 위치 기준점 이후부터 출력)
  const renderMenu = () => {
    output.write(`${colors.title(title)}\n`);
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

  // 기준점 저장 후 초기 렌더링
  output.write("\n");
  output.write("\x1b7"); // 커서 위치 저장
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

      // 선택이 변경되면 저장된 커서 위치로 돌아가서 다시 렌더링
      if (selectedIndex !== lastIndex) {
        lastIndex = selectedIndex;
        output.write("\x1b8"); // 저장된 커서 위치로 복원
        output.write("\x1b[J"); // 커서 아래 모두 지움
        renderMenu();
      }
    };

    input.on("data", handleKeyPress);
  });
};
