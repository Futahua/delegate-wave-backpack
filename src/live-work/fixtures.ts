import type { ActivityItem, WatchFixture } from './types';

const at = (minute: number) => `2026-08-30T10:${String(minute).padStart(2, '0')}:00.000Z`;
const activity = (
  id: string, actorId: string, actorRole: ActivityItem['actorRole'], actorLabel: string,
  kind: ActivityItem['kind'], lifecycle: ActivityItem['lifecycle'], title: string, detail?: string,
): ActivityItem => ({ id, actorId, actorRole, actorLabel, kind, lifecycle, title, detail, occurredAt: at(10), authority: 'activity', compactable: !['question'].includes(kind) });

const base: WatchFixture = {
  id: 'job_listener_teardown',
  title: 'Close the successive-wake listener race',
  elapsed: '12m 41s',
  phase: 'reviewing',
  phaseLabel: 'Reviewing',
  phases: [
    { id: 'planning', label: 'Plan', state: 'done' },
    { id: 'exploring', label: 'Explore', state: 'done' },
    { id: 'implementing', label: 'Build', state: 'done' },
    { id: 'validating', label: 'Validate', state: 'done' },
    { id: 'reviewing', label: 'Review', state: 'active' },
  ],
  actors: [
    { id: 'manager', role: 'manager', label: 'Manager', state: 'working', current: 'Reviewing upgrade compatibility', elapsed: '12m 41s' },
    { id: 'explore-a', role: 'worker', label: 'Ownership investigation', state: 'completed', elapsed: '3m 14s', parentId: 'manager', childJobId: 'job_explore_a', workKind: 'exploration' },
    { id: 'explore-b', role: 'worker', label: 'Listener investigation', state: 'completed', elapsed: '4m 03s', parentId: 'manager', childJobId: 'job_explore_b', workKind: 'exploration' },
    { id: 'implementation', role: 'worker', label: 'Implementation', state: 'working', current: 'Running focused tests', elapsed: '2m 11s', parentId: 'manager', workKind: 'implementation' },
    { id: 'validator', role: 'validator', label: 'Validation', state: 'completed', current: '58 / 58 passed', parentId: 'implementation' },
  ],
  activity: [
    activity('m1', 'manager', 'manager', 'Manager', 'narration', 'completed', 'The receiver evidence does not fit the first hypothesis.', 'Checking listener teardown instead.'),
    activity('r1', 'explore-b', 'worker', 'Worker · listener', 'read', 'completed', 'Read wake.js', 'src/session/wake.js'),
    activity('r2', 'explore-b', 'worker', 'Worker · listener', 'read', 'completed', 'Read hermes-gateway.js', 'src/session/hermes-gateway.js'),
    activity('s1', 'explore-b', 'worker', 'Worker · listener', 'search', 'completed', 'Searched child.kill', '3 matches in 2 files'),
    activity('m2', 'implementation', 'worker', 'Worker · implementation', 'narration', 'completed', 'Found the lifetime boundary.', 'The fence releases before process exit is observed.'),
    activity('e1', 'implementation', 'worker', 'Worker · implementation', 'edit', 'completed', 'Edited hermes-gateway.js', 'Wait for the child exit event after forced termination.'),
    activity('e2', 'implementation', 'worker', 'Worker · implementation', 'edit', 'completed', 'Added teardown regression', 'test/wake.test.js'),
    activity('c1', 'implementation', 'worker', 'Worker · implementation', 'command', 'updated', 'Running focused tests…', '42 / 58'),
  ],
  settledGroups: [{
    id: 'exploration', label: 'Exploration', summary: 'Read 2 files and searched code once',
    items: [
      activity('sr1', 'explore-a', 'worker', 'Worker · ownership', 'read', 'completed', 'Read process registry', 'src/process-registry.js'),
      activity('ss1', 'explore-a', 'worker', 'Worker · ownership', 'search', 'completed', 'Searched owner_started_at', '5 matches'),
    ],
  }],
  evidence: [
    { id: 'v1', kind: 'validation', title: 'Focused wake suite', detail: '58 / 58 tests passed', status: 'passed', source: 'validation_runs:v_104', occurredAt: at(18), authority: 'evidence' },
    { id: 'v2', kind: 'validation', title: 'Successive-wake regression', detail: 'Old listener exited before the next handoff', status: 'passed', source: 'validation_runs:v_105', occurredAt: at(19), authority: 'evidence' },
    { id: 'candidate', kind: 'candidate', title: 'Candidate recorded', detail: 'ae38cf9086e2', status: 'recorded', source: 'attempts:a_8', occurredAt: at(20), authority: 'evidence' },
  ],
  changedFiles: { count: 3, additions: 81, deletions: 14, files: ['src/session/wake.js', 'src/session/hermes-gateway.js', 'test/wake.test.js'] },
};

const withState = (id: string, patch: Partial<WatchFixture>): WatchFixture => ({ ...base, id, ...patch });

export const watchFixtures: Record<string, WatchFixture> = {
  success: base,
  command: withState('job_long_command', { title: 'Run the full compatibility matrix', phase: 'validating', phaseLabel: 'Validating', activity: [...base.activity.slice(0, -1), activity('c1', 'implementation', 'worker', 'Worker · implementation', 'command', 'updated', 'Running compatibility matrix…', 'Windows · 17m 08s · output hidden by default')] }),
  failure: withState('job_failure', { title: 'Repair unsupported phone build', phase: 'failed', phaseLabel: 'Stopped', attention: { kind: 'failure', title: 'Worker stopped', detail: 'The Android toolchain rejected the installed SDK.' }, outcome: { kind: 'failed', title: 'No candidate was produced', detail: 'Failure evidence is preserved below.' } }),
  needsInput: withState('job_question', { title: 'Choose the archive search policy', phase: 'needs_input', phaseLabel: 'Needs input', attention: { kind: 'question', title: 'Should search include archived runs?', detail: 'The choice changes both query cost and what appears in results.' } }),
  completed: withState('job_complete', { title: 'Preserve typed wake metadata', phase: 'completed', phaseLabel: 'Completed', activity: [], outcome: { kind: 'completed', title: 'Compatibility boundary closed', detail: 'The accepted candidate preserves in-flight legacy wakes.' } }),
  parallel: withState('job_parallel', { title: 'Investigate two receiver hypotheses', phase: 'exploring', phaseLabel: 'Exploring' }),
  toolFailure: withState('job_tool_failure', { title: 'Recover from a failed command', attention: { kind: 'failure', title: 'Command failed', detail: 'The failed activity remains visible and is not compacted.' }, activity: [...base.activity, activity('bad-command', 'implementation', 'worker', 'Worker · implementation', 'command', 'failed', 'Focused test command failed', 'Exit 1 · bounded output available in Inspect')] }),
  validationFailure: withState('job_validation_failure', { title: 'Correct a validation regression', phase: 'validating', phaseLabel: 'Validating', evidence: [{ id: 'failed-v', kind: 'validation', title: 'Focused wake suite', detail: '57 / 58 tests passed', status: 'failed', source: 'validation_runs:v_failed', occurredAt: at(18), authority: 'evidence' }] }),
  revision: withState('job_revision', { title: 'Revise a rejected candidate', phase: 'implementing', phaseLabel: 'Implementing', evidence: [{ id: 'reject', kind: 'manager_decision', title: 'Manager rejected attempt 1', detail: 'Listener exit was requested but not proven.', status: 'recorded', source: 'manager_turns:m_2', occurredAt: at(18), authority: 'evidence' }] }),
  answered: withState('job_answered', { title: 'Apply the selected archive policy', phase: 'implementing', phaseLabel: 'Implementing', attention: undefined, evidence: [{ id: 'answer', kind: 'change', title: 'Human answer recorded', detail: 'Include archived runs.', status: 'recorded', source: 'session_messages:q_1', occurredAt: at(18), authority: 'evidence' }] }),
  semantics: withState('job_semantics', { title: 'OpenCode semantic vocabulary', activity: [
    activity('sem-read', 'implementation', 'worker', 'Worker · semantics', 'read', 'completed', 'Read App.tsx'),
    activity('sem-glob', 'implementation', 'worker', 'Worker · semantics', 'search', 'completed', 'Found 12 TypeScript files', 'glob src/**/*.ts'),
    activity('sem-grep', 'implementation', 'worker', 'Worker · semantics', 'search', 'completed', 'Found 4 matches', 'grep display_kind'),
    activity('sem-bash', 'implementation', 'worker', 'Worker · semantics', 'command', 'completed', 'Ran focused tests', '12 / 12'),
    activity('sem-edit', 'implementation', 'worker', 'Worker · semantics', 'edit', 'completed', 'Edited App.tsx'),
    activity('sem-write', 'implementation', 'worker', 'Worker · semantics', 'edit', 'completed', 'Wrote fixture.ts'),
    activity('sem-task', 'implementation', 'worker', 'Worker · semantics', 'agent', 'completed', 'Exploration worker finished'),
    activity('sem-web', 'implementation', 'worker', 'Worker · semantics', 'web', 'completed', 'Checked upstream documentation'),
    activity('sem-question', 'manager', 'manager', 'Manager', 'question', 'completed', 'Which compatibility policy should apply?'),
    activity('sem-todo', 'manager', 'manager', 'Manager', 'todo', 'updated', '2 of 3 plan items complete'),
  ] }),
  longPath: withState('job_long_path', { title: 'Handle very long paths and commands', activity: [activity('long', 'implementation', 'worker', 'Worker · implementation', 'command', 'updated', 'Running a deliberately long semantic command label that must wrap without widening the work surface', 'D:/Letters/MatTroiSeConMoc/Products/Papers/Runtime/Backpack projects/Delegate Wave/src/an/extremely/deep/path/that/must/not/break/layout.ts')] }),
};

export const fixtureCases = [
  'success', 'command', 'failure', 'needsInput', 'completed', 'parallel', 'toolFailure',
  'validationFailure', 'revision', 'answered', 'semantics', 'longPath',
] as const;

/** Large history fixture for timeline/compaction performance checks. */
export function largeHistoryFixture(count = 1_100): WatchFixture {
  return withState('job_large_history', {
    title: 'Large settled work history',
    activity: Array.from({ length: count }, (_, index) => activity(`history-${index}`, 'implementation', 'worker', 'Worker · history', index % 7 === 0 ? 'command' : index % 3 === 0 ? 'search' : 'read', 'completed', `Historical activity ${index + 1}`, `bounded detail ${index + 1}`)),
  });
}
