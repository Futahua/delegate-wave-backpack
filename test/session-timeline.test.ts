import { describe, expect, it } from 'vitest';
import { allocateLanes, compactable, sessionsFromOverview, timelineFromJob, type ProcessSpan } from '../src/timeline/model';

const span = (id: string, start: string, finish: string): ProcessSpan => ({
  id, actor: 'worker', label: id, state: 'completed', startedAt: start, finishedAt: finish,
  stream: [{ id: `${id}:read`, kind: 'read', lifecycle: 'completed', title: 'Read file', occurredAt: finish, authority: 'activity' }],
});

describe('session-first timeline model', () => {
  it('uses the durable Hermes relationship and session identity from overview', () => {
    expect(sessionsFromOverview({ sessions: [{ id: 's1', root_job_id: 'j1', intent: 'Fix it', state: 'live', origin_hermes_session_id: 'h1', started_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z' }] })).toEqual([
      expect.objectContaining({ id: 's1', rootJobId: 'j1', originHermesSessionId: 'h1', state: 'live' }),
    ]);
  });
  it('places only genuinely overlapping intervals in different lanes', () => {
    const placed = allocateLanes([
      span('a', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z'),
      span('b', '2026-01-01T00:02:00Z', '2026-01-01T00:07:00Z'),
      span('c', '2026-01-01T00:07:00Z', '2026-01-01T00:08:00Z'),
    ], 8);
    expect(placed.find((item) => item.id === 'a')?.lane).not.toBe(placed.find((item) => item.id === 'b')?.lane);
    expect(placed.find((item) => item.id === 'c')?.lane).toBe(placed.find((item) => item.id === 'a')?.lane);
  });
  it('never compacts evidence or failures', () => {
    const ordinary = span('a', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z');
    expect(compactable(ordinary)).toBe(true);
    expect(compactable({ ...ordinary, stream: [{ ...ordinary.stream[0]!, authority: 'evidence' }] })).toBe(false);
    expect(compactable({ ...ordinary, stream: [{ ...ordinary.stream[0]!, lifecycle: 'failed' }] })).toBe(false);
  });
  it('normalizes a 1000-event durable timeline without dropping stable ids', () => {
    const events = Array.from({ length: 1_000 }, (_, index) => ({ id: `e${index}`, kind: 'command', lifecycle: 'completed', title: `Command ${index}`, occurred_at: '2026-01-01T00:00:00Z', authority: 'activity' }));
    const value = timelineFromJob({ session_timeline: { revision: 'r1', session: { id: 's1', root_job_id: 'j1', intent: 'Long work', state: 'settled', started_at: '2026-01-01T00:00:00Z', settled_at: '2026-01-01T01:00:00Z', updated_at: '2026-01-01T01:00:00Z' }, spans: [{ id: 'w1', actor: 'worker', label: 'Worker', state: 'completed', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T01:00:00Z', stream: events }] } });
    expect(value?.spans[0]?.stream).toHaveLength(1_000);
    expect(new Set(value!.spans[0]!.stream.map((item) => item.id)).size).toBe(1_000);
  });
});
