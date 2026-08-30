import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_POLL_MS, HIDDEN_POLL_MS, LiveWatch } from '../src/live-work/LiveWatch';
import type { RelayResult } from '../src/bridge/bridge';

function reply(revision: string, phase: 'implementing' | 'completed' = 'implementing'): RelayResult<unknown> {
  return { ok: true, result: { job: { id: 'job_1', objective: 'Watch real work' }, presentation: {
    schema: 1, revision, generated_at: '2026-08-30T00:02:00.000Z',
    phase: { id: phase, label: phase === 'completed' ? 'Completed' : 'Implementing', active: phase !== 'completed' },
    actors: [], live_activity: [], settled_groups: [], evidence: [],
    ...(phase === 'completed' ? { outcome: { kind: 'completed', summary: 'Done.' } } : {}),
  } } };
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

describe('real live Watch polling', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { host.remove(); vi.useRealTimers(); });

  it('polls only job at the active cadence and stops after settlement', async () => {
    const readJob = vi.fn()
      .mockResolvedValueOnce(reply('r1'))
      .mockResolvedValueOnce(reply('r2', 'completed'));
    const root = createRoot(host);
    await act(async () => { root.render(<LiveWatch jobId="job_1" onBack={() => {}} readJob={readJob}/>); });
    await flush();
    expect(readJob).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS); });
    expect(readJob).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Settled · polling stopped');
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS * 3); });
    expect(readJob).toHaveBeenCalledTimes(2);
    root.unmount();
  });

  it('reduces polling while hidden and resumes immediately on visibility change', async () => {
    const readJob = vi.fn().mockResolvedValue(reply('r1'));
    const root = createRoot(host);
    await act(async () => { root.render(<LiveWatch jobId="job_1" onBack={() => {}} readJob={readJob}/>); });
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS); });
    expect(readJob).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(HIDDEN_POLL_MS - ACTIVE_POLL_MS); });
    expect(readJob).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS); });
    expect(readJob).toHaveBeenCalledTimes(3);
    root.unmount();
  });

  it('keeps the last confirmed revision visible across offline reads and reconstructs on reopen', async () => {
    const readJob = vi.fn()
      .mockResolvedValueOnce(reply('r1'))
      .mockResolvedValueOnce({ ok: false, code: 'TIMEOUT', message: 'No host reply.' });
    const root = createRoot(host);
    await act(async () => { root.render(<LiveWatch jobId="job_1" onBack={() => {}} readJob={readJob}/>); });
    await act(async () => { await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS); });
    expect(host.textContent).toContain('Offline · showing last confirmed revision');
    expect(host.textContent).toContain('Watch real work');
    await act(async () => { root.unmount(); });

    const reopened = vi.fn().mockResolvedValue(reply('settled', 'completed'));
    const second = createRoot(host);
    await act(async () => { second.render(<LiveWatch jobId="job_1" onBack={() => {}} readJob={reopened}/>); });
    await flush();
    expect(host.textContent).toContain('Work completed');
    expect(reopened).toHaveBeenCalledTimes(1);
    second.unmount();
  });
});
