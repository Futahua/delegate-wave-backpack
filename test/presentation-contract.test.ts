import { describe, expect, it } from 'vitest';
import { normalizeJobPresentation, reconcilePresentation } from '../src/live-work/presentation';

function payload(revision = 'r1', phase = 'implementing', activityCount = 1): unknown {
  return { ok: true, result: { job: { id: 'job_1', objective: 'Ship the live feed' }, presentation: {
    schema: 1,
    revision,
    generated_at: '2026-08-30T00:02:00.000Z',
    phase: { id: phase, label: phase === 'completed' ? 'Completed' : 'Implementing', active: phase !== 'completed' },
    phase_steps: [{ id: 'planning', label: 'Plan', state: 'done' }, { id: 'implementing', label: 'Build', state: phase === 'implementing' ? 'active' : 'done' }],
    actors: [{ id: 'manager:m1', role: 'manager', label: 'Manager', state: 'working', started_at: '2026-08-30T00:00:00.000Z' }],
    live_activity: Array.from({ length: activityCount }, (_, index) => ({ id: `a${index}`, actor_id: 'manager:m1', actor_role: 'manager', kind: 'narration', lifecycle: 'updated', title: `Update ${index}`, occurred_at: '2026-08-30T00:01:00.000Z', authority: 'activity' })),
    settled_groups: [{ id: 'attempt:1', label: 'Worker completed', summary: 'validation passed', state: 'completed' }],
    evidence: [{ id: 'v1', kind: 'validation', state: 'passed', summary: 'Validation passed', occurred_at: '2026-08-30T00:01:30.000Z', source: { table: 'validation_runs', id: 'v1' }, authority: 'evidence' }],
    changed_files: { count: 1, files: [{ path: 'src/live.ts' }] },
    ...(phase === 'completed' ? { outcome: { kind: 'completed', summary: 'Delegate Wave completed the job.' } } : {}),
  } } };
}

describe('JobPresentationV1', () => {
  it('normalizes the versioned Delegate Wave projection without fuzzy legacy inference', () => {
    const result = normalizeJobPresentation(payload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fixture.title).toBe('Ship the live feed');
    expect(result.value.fixture.activity[0]?.authority).toBe('activity');
    expect(result.value.fixture.evidence[0]).toMatchObject({ authority: 'evidence', source: 'validation_runs:v1' });
    expect(result.value.fixture.changedFiles?.files).toEqual(['src/live.ts']);
    expect(result.value.settled).toBe(false);
  });

  it('rejects absent and future schemas honestly', () => {
    expect(normalizeJobPresentation({ result: { job: { id: 'job_1' } } }).ok).toBe(false);
    const future = payload() as { result: { presentation: { schema: number } } };
    future.result.presentation.schema = 2;
    expect(normalizeJobPresentation(future)).toEqual({ ok: false, message: 'Unsupported live-work schema: 2.' });
  });

  it('keeps an identical revision and unchanged keyed rows referentially stable', () => {
    const first = normalizeJobPresentation(payload());
    const same = normalizeJobPresentation(payload());
    const changed = normalizeJobPresentation(payload('r2', 'implementing', 2));
    if (!first.ok || !same.ok || !changed.ok) throw new Error('fixture failed');
    expect(reconcilePresentation(first.value, same.value)).toBe(first.value);
    const next = reconcilePresentation(first.value, changed.value);
    expect(next).not.toBe(first.value);
    expect(next.fixture.activity[0]).toBe(first.value.fixture.activity[0]);
    expect(next.fixture.activity[1]?.id).toBe('a1');
    expect(next.fixture.actors[0]).toBe(first.value.fixture.actors[0]);
  });

  it('handles a large bounded-history projection with stable unique keys', () => {
    const result = normalizeJobPresentation(payload('large', 'implementing', 1_100));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.fixture.activity).toHaveLength(1_100);
    expect(new Set(result.value.fixture.activity.map((item) => item.id))).toHaveLength(1_100);
  });

  it('uses explicit work stages and never invents terminal or attention rail history', () => {
    const failed = payload('failed', 'failed') as { result: { presentation: Record<string, unknown> } };
    failed.result.presentation.phase = { id: 'failed', label: 'Stopped', active: false };
    failed.result.presentation.phase_steps = [{ id: 'planning', label: 'Plan', state: 'done' }, { id: 'implementing', label: 'Build', state: 'failed' }];
    const failedResult = normalizeJobPresentation(failed);
    if (!failedResult.ok) throw new Error(failedResult.message);
    expect(failedResult.value.fixture.phases.map((step) => step.id)).toEqual(['planning', 'implementing']);
    expect(failedResult.value.fixture.phases).not.toContainEqual(expect.objectContaining({ id: 'completed', state: 'done' }));

    const question = payload('question', 'needs_input') as { result: { presentation: Record<string, unknown> } };
    question.result.presentation.phase = { id: 'needs_input', label: 'Needs input', active: false };
    question.result.presentation.phase_steps = [{ id: 'planning', label: 'Plan', state: 'active' }, { id: 'needs_input', label: 'Needs input', state: 'active' }];
    const questionResult = normalizeJobPresentation(question);
    if (!questionResult.ok) throw new Error(questionResult.message);
    expect(questionResult.value.fixture.phases.map((step) => step.id)).toEqual(['planning']);
    expect(questionResult.value.fixture.phases.some((step) => step.id === 'reviewing')).toBe(false);
  });

  it('preserves structured actor provenance and groups no implementation or revision worker as exploration', () => {
    const raw = payload() as { result: { presentation: Record<string, unknown> } };
    raw.result.presentation.actors = [
      { id: 'manager:m1', role: 'manager', label: 'Manager', state: 'working', started_at: '2026-08-30T00:00:00.000Z' },
      { id: 'worker:a1', role: 'worker', label: 'Implementation', state: 'completed', attempt_id: 'a1', child_job_id: 'child_1', work_kind: 'implementation' },
      { id: 'worker:a2', role: 'worker', label: 'Revision', state: 'completed', attempt_id: 'a2', child_job_id: 'child_2', work_kind: 'revision' },
    ];
    const result = normalizeJobPresentation(raw);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.fixture.actors[1]).toMatchObject({ attemptId: 'a1', childJobId: 'child_1', workKind: 'implementation' });
    expect(result.value.fixture.actors[2]).toMatchObject({ attemptId: 'a2', childJobId: 'child_2', workKind: 'revision' });
    expect(result.value.fixture.actors.filter((item) => item.workKind === 'exploration')).toHaveLength(0);
  });

  it('keeps unknown changed-line counts absent and aligns manager decision evidence', () => {
    const raw = payload() as { result: { presentation: Record<string, unknown> } };
    raw.result.presentation.evidence = [{ id: 'm1', kind: 'manager_decision', state: 'revise', summary: 'Manager requested revision', source: { table: 'manager_turns', id: 'm1' } }];
    const result = normalizeJobPresentation(raw);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.fixture.changedFiles).not.toHaveProperty('additions');
    expect(result.value.fixture.changedFiles).not.toHaveProperty('deletions');
    expect(result.value.fixture.evidence[0]?.kind).toBe('manager_decision');
  });
});
