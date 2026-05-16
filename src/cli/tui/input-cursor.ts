/**
 * Cursor-aware input mutation helpers. All operations are code-point safe
 * (use Array.from to split, never byte indexing) so Korean/emoji input is not
 * corrupted by editing operations.
 *
 * Cursor positions are code-point indices into the input string, ranging
 * from 0 (before first char) to length (after last char). Out-of-range values
 * are clamped silently.
 */

export interface CursorState {
  input: string;
  cursor: number; // code-point index
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const chars = (input: string): string[] => Array.from(input);

export const codepointLength = (input: string): number => chars(input).length;

/** Insert text at the cursor position. Cursor advances past inserted text. */
export const insertAt = (state: CursorState, text: string): CursorState => {
  const all = chars(state.input);
  const safeCursor = clamp(state.cursor, 0, all.length);
  const inserted = chars(text);
  const next = [...all.slice(0, safeCursor), ...inserted, ...all.slice(safeCursor)];
  return {
    input: next.join(""),
    cursor: safeCursor + inserted.length,
  };
};

/** Backspace — delete the char BEFORE the cursor. No-op at start. */
export const backspaceAt = (state: CursorState): CursorState => {
  const all = chars(state.input);
  const safeCursor = clamp(state.cursor, 0, all.length);
  if (safeCursor === 0) return { input: state.input, cursor: 0 };
  const next = [...all.slice(0, safeCursor - 1), ...all.slice(safeCursor)];
  return {
    input: next.join(""),
    cursor: safeCursor - 1,
  };
};

/** Forward delete — delete the char AT the cursor. No-op at end. */
export const deleteAt = (state: CursorState): CursorState => {
  const all = chars(state.input);
  const safeCursor = clamp(state.cursor, 0, all.length);
  if (safeCursor >= all.length) return { input: state.input, cursor: safeCursor };
  const next = [...all.slice(0, safeCursor), ...all.slice(safeCursor + 1)];
  return {
    input: next.join(""),
    cursor: safeCursor,
  };
};

export const moveCursorLeft = (state: CursorState): CursorState => ({
  input: state.input,
  cursor: clamp(state.cursor - 1, 0, codepointLength(state.input)),
});

export const moveCursorRight = (state: CursorState): CursorState => ({
  input: state.input,
  cursor: clamp(state.cursor + 1, 0, codepointLength(state.input)),
});

export const moveCursorHome = (state: CursorState): CursorState => ({
  input: state.input,
  cursor: 0,
});

export const moveCursorEnd = (state: CursorState): CursorState => ({
  input: state.input,
  cursor: codepointLength(state.input),
});

/** Replace input string entirely (e.g. history recall). Cursor goes to end. */
export const setInput = (next: string): CursorState => ({
  input: next,
  cursor: codepointLength(next),
});
