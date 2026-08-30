import type { ActivityItem, ActorItem, EvidenceItem, PhaseId, WatchFixture, WorkGroup } from './types';

type JsonRecord = Record<string, unknown>;

const PHASES: Array<{ id: PhaseId; label: string }> = [
  { id: 'queued', label: 'Queued' },
  { id: 'planning', label: 'Planning' },
  { id: 'exploring', label: 'Exploring' },
  { id: 'implementing', label: 'Implementing' },
  { id: 'validating', label: 'Validating' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'needs_input', label: 'Needs input' },
  { id: 'ready', label: 'Ready' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Stopped' },
];

const PHASE_IDS: Set<string> = new Set(PHASES.map((phase) => phase.id));
const ACTIVITY_KINDS = new Set(['narration', 'read', 'search', 'edit', 'command', 'agent', 'question', 'todo', 'web', 'other']);
const ACTOR_ROLES = new Set(['manager', 'worker', 'validator']);
const ACTOR_STATES = new Set(['waiting', 'working', 'completed', 'failed']);
const LIFECYCLES = new Set(['started', 'updated', 'completed', 'failed']);

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? value as T : fallback;
}

export interface JobPresentationV1 {
  schema: 1;
  revision: string;
  generated_at: string;
  phase: { id: PhaseId; label: string; active: boolean };
  actors: JsonRecord[];
  live_activity: JsonRecord[];
  settled_groups: JsonRecord[];
  evidence: JsonRecord[];
  changed_files?: { count: number; files: Array<{ path: string }> };
  attention?: { kind: 'question' | 'approval' | 'failure'; summary: string };
  outcome?: { kind: 'completed' | 'failed'; summary: string };
}

export interface NormalizedPresentation {
  revision: string;
  settled: boolean;
  fixture: WatchFixture;
}

export type PresentationResult =
  | { ok: true; value: NormalizedPresentation }
  | { ok: false; message: string };

function findPresentation(payload: unknown): { presentation?: JsonRecord; job?: JsonRecord } {
  const root = record(payload);
  if (!root) return {};
  const result = record(root.result) ?? root;
  return { presentation: record(result.presentation), job: record(result.job) };
}

function elapsed(generatedAt: string, actors: ActorItem[]): string {
  const generated = Date.parse(generatedAt);
  const starts = actors.map((actor) => Date.parse(actor.startedAt ?? '')).filter(Number.isFinite);
  if (!Number.isFinite(generated) || !starts.length) return 'Elapsed unavailable';
  const seconds = Math.max(0, Math.floor((generated - Math.min(...starts)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

function actor(item: unknown, index: number): ActorItem {
  const value = record(item) ?? {};
  return {
    id: text(value.id) ?? `actor:${index}`,
    role: oneOf(value.role, ACTOR_ROLES, 'worker'),
    label: text(value.label) ?? 'Worker',
    state: oneOf(value.state, ACTOR_STATES, 'waiting'),
    current: text(value.current),
    startedAt: text(value.started_at),
    finishedAt: text(value.finished_at),
    parentId: text(value.parent_id),
  };
}

function activity(item: unknown, index: number): ActivityItem {
  const value = record(item) ?? {};
  return {
    id: text(value.id) ?? `activity:${index}`,
    actorId: text(value.actor_id) ?? 'unknown',
    actorRole: oneOf(value.actor_role, ACTOR_ROLES, 'worker'),
    actorLabel: text(value.actor_label) ?? (value.actor_role === 'manager' ? 'Manager' : 'Worker'),
    kind: oneOf(value.kind, ACTIVITY_KINDS, 'other'),
    lifecycle: oneOf(value.lifecycle, LIFECYCLES, 'updated'),
    title: text(value.title) ?? 'Activity update',
    detail: text(value.detail),
    occurredAt: text(value.occurred_at) ?? '',
    authority: 'activity',
    compactable: value.compactable === true,
  };
}

function evidence(item: unknown, index: number): EvidenceItem {
  const value = record(item) ?? {};
  const source = record(value.source);
  const sourceText = source && text(source.table) && text(source.id) ? `${source.table}:${source.id}` : 'delegate-wave';
  const state = text(value.state);
  return {
    id: text(value.id) ?? `evidence:${index}`,
    kind: oneOf(value.kind, new Set(['validation', 'candidate', 'change', 'failure', 'decision']), 'change'),
    title: text(value.summary) ?? 'Evidence recorded',
    detail: text(value.detail),
    status: state === 'passed' ? 'passed' : state === 'failed' ? 'failed' : 'recorded',
    source: sourceText,
    occurredAt: text(value.occurred_at) ?? '',
    authority: 'evidence',
  };
}

function settledGroup(item: unknown, index: number): WorkGroup {
  const value = record(item) ?? {};
  return {
    id: text(value.id) ?? `settled:${index}`,
    label: text(value.label) ?? 'Settled work',
    summary: text(value.summary) ?? 'Work settled',
    items: [],
  };
}

/** Strictly accepts Delegate Wave's versioned presentation, never fuzzy legacy data. */
export function normalizeJobPresentation(payload: unknown, fallbackTitle = 'Delegated work'): PresentationResult {
  const { presentation, job } = findPresentation(payload);
  if (!presentation) return { ok: false, message: 'This job did not return a live-work presentation.' };
  if (presentation.schema !== 1) return { ok: false, message: `Unsupported live-work schema: ${String(presentation.schema)}.` };
  const revision = text(presentation.revision);
  const generatedAt = text(presentation.generated_at);
  const phaseRaw = record(presentation.phase);
  const phaseId = phaseRaw && text(phaseRaw.id);
  if (!revision || !generatedAt || !phaseId || !PHASE_IDS.has(phaseId)) {
    return { ok: false, message: 'Delegate Wave returned an incomplete live-work presentation.' };
  }
  const actors = list(presentation.actors).map(actor);
  const phase = phaseId as PhaseId;
  const currentIndex = PHASES.findIndex((item) => item.id === phase);
  const terminal = phase === 'completed' || phase === 'failed';
  const attentionRaw = record(presentation.attention);
  const outcomeRaw = record(presentation.outcome);
  const changedRaw = record(presentation.changed_files);
  const changedFiles = changedRaw ? list(changedRaw.files).map(record).map((item) => text(item?.path)).filter((path): path is string => Boolean(path)) : [];
  const fixture: WatchFixture = {
    id: text(job?.id) ?? fallbackTitle,
    title: text(job?.objective) ?? text(job?.title) ?? fallbackTitle,
    elapsed: elapsed(generatedAt, actors),
    phase,
    phaseLabel: text(phaseRaw.label) ?? PHASES[currentIndex]!.label,
    phases: PHASES.map((item, index) => ({
      ...item,
      state: terminal && item.id === phase ? (phase === 'failed' ? 'failed' : 'done') : index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'future',
    })),
    actors,
    activity: list(presentation.live_activity).map(activity),
    settledGroups: list(presentation.settled_groups).map(settledGroup),
    evidence: list(presentation.evidence).map(evidence),
    attention: attentionRaw ? {
      kind: oneOf(attentionRaw.kind, new Set(['question', 'approval', 'failure']), 'approval'),
      title: attentionRaw.kind === 'question' ? 'Delegate Wave needs input' : attentionRaw.kind === 'failure' ? 'Work stopped' : 'Decision needed',
      detail: text(attentionRaw.summary) ?? 'Delegate Wave needs attention.',
    } : undefined,
    outcome: outcomeRaw ? {
      kind: outcomeRaw.kind === 'completed' ? 'completed' : 'failed',
      title: outcomeRaw.kind === 'completed' ? 'Work completed' : 'Work stopped',
      detail: text(outcomeRaw.summary) ?? 'Delegate Wave settled the job.',
    } : undefined,
    changedFiles: changedRaw ? { count: typeof changedRaw.count === 'number' ? changedRaw.count : changedFiles.length, files: changedFiles } : undefined,
  };
  return { ok: true, value: { revision, settled: terminal || Boolean(outcomeRaw), fixture } };
}

function reconcileList<T extends { id: string }>(before: T[], after: T[]): T[] {
  const old = new Map(before.map((item) => [item.id, item]));
  return after.map((item) => {
    const prior = old.get(item.id);
    return prior && JSON.stringify(prior) === JSON.stringify(item) ? prior : item;
  });
}

/** Preserve stable keyed rows across revisions so React replaces only changed facts. */
export function reconcilePresentation(before: NormalizedPresentation | undefined, after: NormalizedPresentation): NormalizedPresentation {
  if (!before) return after;
  if (before.revision === after.revision) return before;
  return {
    ...after,
    fixture: {
      ...after.fixture,
      actors: reconcileList(before.fixture.actors, after.fixture.actors),
      activity: reconcileList(before.fixture.activity, after.fixture.activity),
      settledGroups: reconcileList(before.fixture.settledGroups, after.fixture.settledGroups),
      evidence: reconcileList(before.fixture.evidence, after.fixture.evidence),
    },
  };
}
