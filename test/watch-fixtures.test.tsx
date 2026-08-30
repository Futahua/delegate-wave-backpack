import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureCases, largeHistoryFixture, watchFixtures } from '../src/live-work/fixtures';
import { Watch } from '../src/live-work/Watch';

describe('fixture-driven Watch experience', () => {
  it('keeps activity and durable evidence visibly distinct', () => {
    const html = renderToStaticMarkup(<Watch fixture={watchFixtures.success!} />);
    expect(html).toContain('Durable record');
    expect(html).toContain('validation_runs:v_104');
    expect(html).toContain('Running focused tests');
    expect(html.indexOf('Durable record')).toBeGreaterThan(html.indexOf('Running focused tests'));
  });

  it('covers the required intervention, lifecycle, parallel and semantic fixture families', () => {
    expect(fixtureCases).toEqual(expect.arrayContaining(['needsInput', 'failure', 'validationFailure', 'revision', 'parallel', 'semantics', 'completed', 'longPath']));
    expect(watchFixtures.semantics!.activity.map((item) => item.kind)).toEqual(expect.arrayContaining(['read', 'search', 'edit', 'command', 'agent', 'web', 'question', 'todo']));
  });

  it('provides a 1000+ row stress case with stable identities', () => {
    const fixture = largeHistoryFixture();
    expect(fixture.activity).toHaveLength(1_100);
    expect(new Set(fixture.activity.map((item) => item.id)).size).toBe(1_100);
    const html = renderToStaticMarkup(<Watch fixture={fixture} />);
    expect(html).toContain('860 older ordinary activities compacted');
    expect((html.match(/data-activity-id=/g) ?? []).length).toBeLessThanOrEqual(250);
  });

  it('keeps terminal outcome and failure evidence out of neutral compaction', () => {
    const html = renderToStaticMarkup(<Watch fixture={watchFixtures.failure!} />);
    expect(html).toContain('Worker stopped');
    expect(html).toContain('No candidate was produced');
  });

  it('does not print invented zero line counts when changed-file totals are unknown', () => {
    const fixture = { ...watchFixtures.success!, changedFiles: { count: 1, files: ['src/live.ts'] } };
    const html = renderToStaticMarkup(<Watch fixture={fixture} />);
    expect(html).not.toContain('+0');
    expect(html).not.toContain('−0');
  });

  it('does not relabel completed implementation and revision workers as exploration', () => {
    const fixture = { ...watchFixtures.success!, actors: [
      { id: 'manager', role: 'manager' as const, label: 'Manager', state: 'working' as const },
      { id: 'implementation', role: 'worker' as const, label: 'Implementation', state: 'completed' as const, workKind: 'implementation' as const },
      { id: 'revision', role: 'worker' as const, label: 'Revision', state: 'completed' as const, workKind: 'revision' as const },
    ] };
    const html = renderToStaticMarkup(<Watch fixture={fixture} />);
    expect(html).toContain('Implementation');
    expect(html).toContain('Revision');
    expect(html).not.toContain('2 workers · settled');
  });
});
