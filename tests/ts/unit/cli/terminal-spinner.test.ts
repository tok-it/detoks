import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSpinner } from '../../../../src/cli/terminal-spinner.js';

describe('terminal spinner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the first frame immediately in TTY mode and clears on stop', () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(true);

    expect(writeSpy).toHaveBeenCalledWith('\rᗧ • • • •');

    vi.advanceTimersByTime(150);
    expect(writeSpy).toHaveBeenCalledWith('\rO • • • •');

    spinner.stop();
    expect(writeSpy).toHaveBeenLastCalledWith('\r\u001b[K');
  });

  it('stays silent outside TTY mode', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const spinner = startSpinner(false);
    spinner.stop();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
