import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSpinner } from '../../../../src/cli/terminal-spinner.js';

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');

describe('terminal spinner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the first frame immediately in TTY mode and clears on stop', () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(true);

    expect(stripAnsi(String(writeSpy.mock.calls[0]?.[0] ?? ''))).toContain('\rᗧ');
    expect(stripAnsi(String(writeSpy.mock.calls[0]?.[0] ?? ''))).toContain('• • • •');

    vi.advanceTimersByTime(150);
    expect(stripAnsi(String(writeSpy.mock.calls[1]?.[0] ?? ''))).toContain('\r');
    expect(stripAnsi(String(writeSpy.mock.calls[1]?.[0] ?? ''))).toContain('O');
    expect(stripAnsi(String(writeSpy.mock.calls[1]?.[0] ?? ''))).toContain('• • •');

    spinner.stop();
    expect(writeSpy).toHaveBeenLastCalledWith('\r\u001b[K');
  });

  it('resets to the first frame right after the zero-token frame', () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(true);

    vi.advanceTimersByTime(150 * 4);
    expect(stripAnsi(String(writeSpy.mock.calls[4]?.[0] ?? ''))).toContain('\r    ᗧ');
    expect(stripAnsi(String(writeSpy.mock.calls[4]?.[0] ?? ''))).not.toContain('•');

    vi.advanceTimersByTime(150);
    expect(stripAnsi(String(writeSpy.mock.calls[5]?.[0] ?? ''))).toContain('\rᗧ');
    expect(stripAnsi(String(writeSpy.mock.calls[5]?.[0] ?? ''))).toContain('• • • •');

    spinner.stop();
  });

  it('re-renders below progress messages instead of overwriting them', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(true);
    spinner.write('progress message\n');

    expect(writeSpy.mock.calls[1]?.[0]).toBe('\r\u001b[K');
    expect(writeSpy.mock.calls[2]?.[0]).toBe('progress message\n');
    expect(stripAnsi(String(writeSpy.mock.calls[3]?.[0] ?? ''))).toContain('\r');
    expect(stripAnsi(String(writeSpy.mock.calls[3]?.[0] ?? ''))).toContain('O');
  });

  it('stays silent outside TTY mode', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(false);
    spinner.stop();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
