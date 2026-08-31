import { beforeEach, describe, expect, it, vi } from 'vitest';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../src/bridge/bridge', () => ({ call }));

import { read, READ_RETRY_TIMEOUT_MS, READ_TIMEOUT_MS, write, WRITE_TIMEOUT_MS } from '../src/model/adapter';

describe('relay retry boundary', () => {
  beforeEach(() => call.mockReset());

  it('retries one unanswered read through a fresh bridge request', async () => {
    call.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' }).mockResolvedValueOnce({ ok: true, result: { sessions: [] } });
    await expect(read('session.list', { limit: 40 })).resolves.toMatchObject({ ok: true });
    expect(call).toHaveBeenNthCalledWith(1, 'session.list', { limit: 40 }, { timeoutMs: READ_TIMEOUT_MS });
    expect(call).toHaveBeenNthCalledWith(2, 'session.list', { limit: 40 }, { timeoutMs: READ_RETRY_TIMEOUT_MS });
  });

  it('never retries a mutation timeout', async () => {
    call.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' });
    await expect(write('authorize', { proposalId: 'p1' })).resolves.toMatchObject({ code: 'TIMEOUT' });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('authorize', { proposalId: 'p1' }, { timeoutMs: WRITE_TIMEOUT_MS });
  });
});
