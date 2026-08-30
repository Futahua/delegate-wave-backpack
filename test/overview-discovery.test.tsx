import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapter = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock('../src/model/adapter', () => ({
  ...adapter,
  paramsForApprove: (proposalId: string) => ({ proposalId }),
  paramsForDecline: (proposalId: string, reason: string) => ({ proposalId, reason }),
  paramsForStart: (objective: string) => ({ objective }),
  paramsForTarget: (jobId: string) => ({ jobId }),
}));

import App from '../src/ui/App';

const EMPTY = {
  ok: true,
  result: { schema_version: 1, work: [], totals: {}, projects: [], attention: [] },
};
const ATTENTION = { ok: true, result: { jobs: [] } };

function work(presence: 'active' | 'ready' = 'active') {
  return {
    id: 'job_1',
    project_id: 'project_1',
    project_name: 'Dogfood',
    objective: 'Watch delegated work',
    job_status: presence === 'active' ? 'PENDING' : 'READY_FOR_INTEGRATION',
    presence,
    activity_state: presence === 'active' ? 'WORKING' : 'READY',
    manager_status: presence === 'active' ? 'PLANNING' : 'ACCEPTED',
    session_state: presence === 'active' ? 'WORKING' : 'SEMANTICALLY_ACCEPTED',
    created_at: '2026-08-30T01:00:00.000Z',
    updated_at: '2026-08-30T01:00:01.000Z',
  };
}

function overview(item?: ReturnType<typeof work>) {
  return { ok: true, result: { schema_version: 1, work: item ? [item] : [], totals: {}, projects: [], attention: [] } };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<App />); await Promise.resolve(); });
}

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  adapter.read.mockReset();
  adapter.write.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

describe('overview work discovery', () => {
  it('polls an external planning run into Active, opens its job id, and moves the same row to Ready', async () => {
    let overviewCalls = 0;
    adapter.read.mockImplementation((operation: string) => {
      if (operation === 'attention') return Promise.resolve(ATTENTION);
      if (operation === 'job') return Promise.resolve({ ok: false, code: 'TIMEOUT', message: 'held for test' });
      overviewCalls += 1;
      return Promise.resolve(overviewCalls === 1 ? EMPTY : overview(overviewCalls === 2 ? work('active') : work('ready')));
    });

    await render();
    expect(host!.textContent).toContain('0 TOTAL');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(host!.textContent).toContain('Watch delegated work');
    const activeButton = [...host!.querySelectorAll('button')].find((button) => button.textContent?.includes('ACTIVE'));
    expect(activeButton?.textContent).toContain('1');

    const row = [...host!.querySelectorAll('tr')].find((candidate) => candidate.textContent?.includes('job_1'));
    await act(async () => { row!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(adapter.read).toHaveBeenCalledWith('job', { jobId: 'job_1' });
    const callsWhileWatching = overviewCalls;
    await act(async () => { await vi.advanceTimersByTimeAsync(2_400); });
    expect(overviewCalls).toBe(callsWhileWatching);

    const back = [...host!.querySelectorAll('button')].find((button) => button.textContent?.includes('Runs'));
    await act(async () => { back!.click(); await Promise.resolve(); });
    expect(host!.textContent).toContain('READY_FOR_INTEGRATION');
    expect(host!.querySelectorAll('tr')).toHaveLength(2);
    const readyButton = [...host!.querySelectorAll('button')].find((button) => button.textContent?.includes('READY'));
    expect(readyButton?.textContent).toContain('1');
  });

  it('uses the hidden cadence and never overlaps an unfinished refresh', async () => {
    let overviewCalls = 0;
    let release: ((value: typeof EMPTY) => void) | undefined;
    adapter.read.mockImplementation((operation: string) => {
      if (operation === 'attention') return Promise.resolve(ATTENTION);
      overviewCalls += 1;
      if (overviewCalls === 1) return Promise.resolve(EMPTY);
      return new Promise((resolve) => { release = resolve; });
    });
    await render();
    act(() => setVisibility('hidden'));
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(overviewCalls).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(overviewCalls).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(overviewCalls).toBe(2);
    await act(async () => { release!(EMPTY); await Promise.resolve(); });
  });

  it('preserves the last typed work snapshot when a later poll times out', async () => {
    let cycle = 0;
    adapter.read.mockImplementation((operation: string) => {
      if (operation === 'job') return Promise.resolve({ ok: false, code: 'TIMEOUT' });
      if (operation === 'overview') {
        cycle += 1;
        return Promise.resolve(cycle === 1 ? overview(work('active')) : { ok: false, code: 'TIMEOUT' });
      }
      return Promise.resolve(cycle === 1 ? ATTENTION : { ok: false, code: 'TIMEOUT' });
    });
    await render();
    expect(host!.textContent).toContain('Watch delegated work');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(host!.textContent).toContain('Watch delegated work');
    expect(host!.textContent).toContain('NO HOST');
  });
});
