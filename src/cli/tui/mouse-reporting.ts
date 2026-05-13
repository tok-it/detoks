export type MouseWheelDirection = "up" | "down";

export interface MouseWheelEvent {
  direction: MouseWheelDirection;
  column: number;
  row: number;
  sequence: string;
}

export interface MouseInputConsumption {
  cleanedText: string;
  pendingSequence: string;
  wheelEvents: MouseWheelEvent[];
}

const SGR_MOUSE_EVENT_PATTERN = /^\x1b\[<(?<button>\d+);(?<column>\d+);(?<row>\d+)(?<suffix>[Mm])/;
const PARTIAL_SGR_MOUSE_PATTERN = /^\x1b(?:\[|\[<|\[<\d+|\[<\d+;\d*|\[<\d+;\d+;\d*)?$/;

export const parseMouseWheelEvent = (text: string): MouseWheelEvent | null => {
  const match = SGR_MOUSE_EVENT_PATTERN.exec(text);
  if (!match?.groups) {
    return null;
  }

  const button = Number.parseInt(match.groups.button ?? "", 10);
  const column = Number.parseInt(match.groups.column ?? "", 10);
  const row = Number.parseInt(match.groups.row ?? "", 10);
  const suffix = match.groups.suffix;

  if (!Number.isFinite(button) || !Number.isFinite(column) || !Number.isFinite(row) || suffix !== "M") {
    return null;
  }

  if (button === 64) {
    return { direction: "up", column, row, sequence: match[0] };
  }

  if (button === 65) {
    return { direction: "down", column, row, sequence: match[0] };
  }

  return null;
};

export const consumeMouseReportingInput = (text: string): MouseInputConsumption => {
  let cleanedText = "";
  let pendingSequence = "";
  const wheelEvents: MouseWheelEvent[] = [];
  let index = 0;

  while (index < text.length) {
    const remaining = text.slice(index);

    if (remaining.startsWith("\x1b[<")) {
      const match = SGR_MOUSE_EVENT_PATTERN.exec(remaining);
      if (match !== null) {
        const wheelEvent = parseMouseWheelEvent(match[0]);
        if (wheelEvent !== null) {
          wheelEvents.push(wheelEvent);
        }
        index += match[0].length;
        continue;
      }

      if (PARTIAL_SGR_MOUSE_PATTERN.test(remaining)) {
        pendingSequence = remaining;
        break;
      }
    }

    if (remaining.startsWith("\x1b") && PARTIAL_SGR_MOUSE_PATTERN.test(remaining)) {
      pendingSequence = remaining;
      break;
    }

    cleanedText += text[index] ?? "";
    index += 1;
  }

  return { cleanedText, pendingSequence, wheelEvents };
};
