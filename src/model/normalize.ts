/**
 * View-model layer for the Delegate Wave dashboard.
 *
 * The relay contract is frozen at nine operations and none of their payload
 * shapes are documented here. Every normalizer below therefore accepts unknown
 * JSON from `call()`, digs through a set of plausible wrapper keys, preserves
 * whatever useful fields it can find, and labels every absent fact honestly
 * (`undefined` -> '—' in the UI). Nothing here invents operational truth: a run
 * whose status cannot be read is classified `other`, a cost that was not
 * reported is absent, and a timed-out mutation is surfaced as uncertain, never
 * silently retried or assumed to have failed.
 */

import type { RelayResult } from '../bridge/bridge';

export type Bucket = 'active' | 'attention' | 'ready' | 'settled' | 'other';

type Rec = Record<string, unknown>;

export function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Keys whose value objects are descended into when hunting for facts. A payload
 * may wrap its meaning under `overview`, `data`, `payload`, `result`, and so on;
 * walking these keeps one normalizer useful across the many shapes the operator
 * might return without the page having to know which is which.
 */
const WRAPS: string[] = [
  'data',
  'result',
  'payload',
  'summary',
  'overview',
  'dashboard',
  'run',
  'job',
  'item',
  'detail',
  'details',
  'execution',
  'work',
  'activity',
  'meta',
  'info',
  'usage',
  'cost',
  'budget',
  'evidence',
  'traces',
  'integration',
  'brief',
  'briefing',
  'changes',
  'diff',
  'history',
  'state',
  'status',
  'current',
  'results',
  'items',
];

function collectScopes(value: unknown, depth: number): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, d: number): void => {
    if (v === null || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
    if (d <= 0) return;
    if (Array.isArray(v)) {
      for (const el of v) walk(el, d - 1);
      return;
    }
    if (!isRecord(v)) return;
    for (const w of WRAPS) {
      const child = v[w];
      if (child !== null && typeof child === 'object') {
        if (Array.isArray(child)) for (const el of child) walk(el, d - 1);
        else walk(child, d - 1);
      }
    }
  };
  walk(value, depth);
  return out;
}

function rawPick(scopes: unknown[], keys: string[]): unknown {
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of keys) {
      const v = s[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
}

function pickStr(scopes: unknown[], keys: string[]): string | undefined {
  const v = rawPick(scopes, keys);
  return typeof v === 'string' ? v : undefined;
}

function pickNum(scopes: unknown[], keys: string[]): number | undefined {
  const v = rawPick(scopes, keys);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickStrList(scopes: unknown[], keys: string[]): string[] | undefined {
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of keys) {
      const v = s[k];
      if (Array.isArray(v)) {
        const list = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
        if (list.length > 0) return list;
      }
    }
  }
  return undefined;
}

function pickList(scopes: unknown[], keys: string[]): unknown[] | undefined {
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of keys) {
      const v = s[k];
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return undefined;
}

function pickRecord(scopes: unknown[], keys: string[]): Rec | undefined {
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of keys) {
      const v = s[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Rec;
    }
  }
  return undefined;
}

function pickDate(scopes: unknown[], keys: string[]): string | undefined {
  const v = rawPick(scopes, keys);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1_000_000_000_000 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  return undefined;
}

const STATUS_KEYS = ['status', 'state', 'phase', 'stage', 'stateName', 'current', 'result'];
const INNER_STATUS_KEYS = ['status', 'state', 'phase', 'stage', 'name', 'key', 'value', 'code', 'type', 'label', 'stateName'];
const SCAN_KEYS = [
  'status',
  'state',
  'phase',
  'stage',
  'current',
  'result',
  'outcome',
  'key',
  'value',
  'code',
  'type',
  'label',
  'name',
  'title',
  'event',
  'action',
  'kind',
  'step',
  'category',
  'stateName',
];
const STATUS_HINTS = [
  'active',
  'running',
  'ready',
  'attention',
  'blocked',
  'complete',
  'completed',
  'done',
  'proposed',
  'pending',
  'awaiting',
  'working',
  'queued',
  'failed',
  'error',
  'approved',
  'rejected',
  'integrated',
  'merged',
  'waiting',
  'needs',
  'idle',
  'new',
  'executing',
  'started',
  'scheduled',
];

/**
 * Groups a status string into a presentation bucket. This is presentational
 * classification of a fact the operator reported, never a derivation of a fact
 * that was not reported: an unreadable status lands in `other`, and every run is
 * still listed in the overview with its raw status shown.
 */
export function classifyStatus(status: string | undefined): Bucket {
  if (!status) return 'other';
  const t = status.toLowerCase();
  const has = (w: string) => t.includes(w);
  if (has('reject') || has('declin') || has('deny') || has('denied')) return 'settled';
  if (
    !(has('pending') || has('await') || has('need') || has('require')) &&
    (has('approv') ||
      has('integrat') ||
      has('merge') ||
      has('accept') ||
      has('deploy') ||
      has('ship') ||
      has('applied'))
  ) {
    return 'settled';
  }
  if (
    has('attention') ||
    has('block') ||
    has('fail') ||
    has('error') ||
    has('conflict') ||
    has('stuck') ||
    has('wait')
  ) {
    return 'attention';
  }
  if (has('ready') || has('complet') || has('done') || has('propos') || has('review') || has('await') || has('pending') || has('approv')) {
    return 'ready';
  }
  if (has('active') || has('run') || has('work') || has('execut') || has('start') || has('queue') || has('sched') || has('new') || has('idle')) {
    return 'active';
  }
  return 'other';
}

/**
 * Reads a status string from a payload, accepting scalar status fields, nested
 * status objects (`{ state: { value: 'active' } }`), and — as a last resort — a
 * recognisable word inside status-like scalar fields. Returns undefined when no
 * credible status appears so callers can label the fact honestly.
 */
export function statusFrom(...values: unknown[]): string | undefined {
  const scopes = collectScopes(values, 3);
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of STATUS_KEYS) {
      const v = s[k];
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  }
  for (const s of scopes) {
    if (!isRecord(s)) continue;
    for (const k of ['status', 'state', 'phase', 'stage']) {
      const v = s[k];
      if (isRecord(v)) {
        for (const ik of INNER_STATUS_KEYS) {
          const iv = v[ik];
          if (typeof iv === 'string' && iv.trim() !== '') return iv;
        }
      }
    }
  }
  let res: string | undefined;
  const walk = (node: unknown, d: number, guard: Set<unknown>): void => {
    if (d <= 0 || node === null || typeof node !== 'object') return;
    if (guard.has(node)) return;
    guard.add(node);
    if (Array.isArray(node)) {
      for (const el of node) walk(el, d - 1, guard);
      return;
    }
    for (const k of Object.keys(node)) {
      if (res) return;
      if (!SCAN_KEYS.includes(k)) continue;
      const v = (node as Rec)[k];
      if (typeof v === 'string' && v.length <= 24 && v.trim() !== '') {
        const t = v.toLowerCase();
        if (STATUS_HINTS.some((h) => t === h || (h.length > 3 && t.startsWith(h)))) {
          res = v;
          return;
        }
      } else if (typeof v === 'object' && v !== null) {
        walk(v, d - 1, guard);
      }
    }
  };
  walk(values, 2, new Set());
  return res;
}

export interface RunModel {
  id: string;
  title?: string;
  objective?: string;
  status?: string;
  bucket: Bucket;
  worker?: string;
  branch?: string;
  commit?: string;
  startedAt?: string;
  finishedAt?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  model?: string;
  currency?: string;
  reason?: string;
  raw: unknown;
}

export function normalizeRun(item: unknown): RunModel {
  const scopes = collectScopes(item, 3);
  const status = statusFrom(item);
  const id =
    pickStr(scopes, [
      'id',
      'runId',
      'run_id',
      'jobId',
      'job_id',
      'objectiveId',
      'objective_id',
      'taskId',
      'key',
      'ref',
      'number',
    ]) ?? 'unnamed';
  return {
    id,
    title: pickStr(scopes, ['title', 'name', 'summary', 'label', 'subject']),
    objective: pickStr(scopes, ['objective', 'goal', 'intent', 'description', 'prompt', 'purpose', 'instruction']),
    status,
    bucket: classifyStatus(status),
    worker: pickStr(scopes, ['worker', 'assignee', 'agent', 'operator', 'handler', 'runner', 'actor', 'owner']),
    branch: pickStr(scopes, ['branch', 'branchName', 'branch_name', 'gitBranch', 'ref']),
    commit: pickStr(scopes, ['commit', 'commitSha', 'commit_sha', 'sha', 'head', 'revision', 'hash']),
    startedAt: pickDate(scopes, [
      'startedAt',
      'started_at',
      'startTime',
      'beganAt',
      'createdAt',
      'created_at',
      'submittedAt',
      'queuedAt',
    ]),
    finishedAt: pickDate(scopes, [
      'finishedAt',
      'finished_at',
      'endTime',
      'endedAt',
      'completedAt',
      'completed_at',
      'resolvedAt',
      'updatedAt',
      'updated_at',
    ]),
    costUsd: pickNum(scopes, ['cost', 'costUsd', 'cost_usd', 'price', 'spend', 'totalCost']),
    tokensIn: pickNum(scopes, ['tokensIn', 'tokens_in', 'inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']),
    tokensOut: pickNum(scopes, ['tokensOut', 'tokens_out', 'outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']),
    totalTokens: pickNum(scopes, ['tokens', 'totalTokens', 'total_tokens', 'tokenCount', 'usage']),
    model: pickStr(scopes, ['model', 'llm', 'agentModel', 'engine', 'modelName']),
    currency: pickStr(scopes, ['currency', 'currencyCode', 'currency_code', 'unit']),
    reason: pickStr(scopes, ['reason', 'why', 'issue', 'note', 'message', 'problem', 'blocker']),
    raw: item,
  };
}

function bucketCounts(runs: RunModel[]): Record<Bucket, number> {
  const c: Record<Bucket, number> = { active: 0, attention: 0, ready: 0, settled: 0, other: 0 };
  for (const r of runs) c[r.bucket] = (c[r.bucket] ?? 0) + 1;
  return c;
}

export interface OverviewModel {
  runs: RunModel[];
  counts: Record<Bucket, number>;
  typedWork: boolean;
  cycle?: number;
  budgetSpent?: number;
  budgetAvailable?: number;
  budgetTotal?: number;
  currency?: string;
  raw: unknown;
}

type OverviewPresence = 'active' | 'attention' | 'ready' | 'settled';

interface OverviewWorkV1 {
  id: string;
  project_id: string;
  project_name: string;
  objective: string;
  job_status: string;
  presence: OverviewPresence;
  activity_state?: string;
  manager_status?: string;
  session_state?: string;
  created_at: string;
  updated_at: string;
}

function overviewWorkV1(value: unknown): OverviewWorkV1 | undefined {
  if (!isRecord(value)) return undefined;
  const presence = value['presence'];
  if (!['active', 'attention', 'ready', 'settled'].includes(String(presence))) return undefined;
  const required = ['id', 'project_id', 'project_name', 'objective', 'job_status', 'created_at', 'updated_at'] as const;
  if (required.some((key) => typeof value[key] !== 'string' || value[key].length === 0)) return undefined;
  return value as unknown as OverviewWorkV1;
}

function normalizeOverviewWork(value: unknown): RunModel | undefined {
  const work = overviewWorkV1(value);
  if (!work) return undefined;
  return {
    id: work.id,
    title: work.objective,
    objective: work.objective,
    status: work.job_status,
    bucket: work.presence,
    startedAt: work.created_at,
    finishedAt: work.presence === 'settled' ? work.updated_at : undefined,
    reason: work.activity_state ?? work.manager_status ?? work.session_state,
    raw: value,
  };
}

export function normalizeOverview(relay: RelayResult<unknown>): OverviewModel {
  const scopes = collectScopes(relay.result, 3);
  const typedItems = isRecord(relay.result) && Array.isArray(relay.result['work'])
    ? relay.result['work'] : undefined;
  const typedRuns = typedItems?.map(normalizeOverviewWork).filter((item): item is RunModel => Boolean(item));
  const items = typedItems === undefined
    ? pickList(scopes, ['runs', 'jobs', 'items', 'entries', 'queue', 'objectives', 'activities', 'history', 'rows', 'projects'])
    : undefined;
  const runs = typedRuns ?? (items ?? []).map(normalizeRun);
  const counts = typedItems !== undefined ? bucketCounts(runs) : runs.length > 0 ? bucketCounts(runs) : reportedCounts(scopes);
  const budget = pickRecord(scopes, ['budget', 'cost', 'accounting', 'spend']);
  const budgetScopes = budget ? [budget] : [];
  return {
    runs,
    counts,
    typedWork: typedItems !== undefined,
    cycle:
      pickNum(scopes, ['cycle', 'cycles', 'round', 'rounds', 'iteration', 'iterations', 'attempt', 'attempts']) ??
      pickNum(scopes, ['cycleCount', 'sequentialCycle']),
    budgetSpent: pickNum(budgetScopes, ['spent', 'spend', 'used', 'consumed', 'cost', 'totalSpent']),
    budgetAvailable: pickNum(budgetScopes, ['available', 'remaining', 'left', 'remainingBudget']),
    budgetTotal: pickNum(budgetScopes, ['total', 'limit', 'allotted', 'budget', 'ceiling']),
    currency: pickStr(scopes, ['currency', 'currencyCode', 'currency_code', 'unit']) ?? pickStr(budgetScopes, ['currency', 'currencyCode', 'currency_code']),
    raw: relay.result,
  };
}

function reportedCounts(scopes: unknown[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { active: 0, attention: 0, ready: 0, settled: 0, other: 0 };
  const pick = (keys: string[]): number | undefined =>
    pickNum(
      scopes,
      keys.flatMap((k) => [k, k.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()]),
    );
  const active = pick(['active', 'activeCount', 'running', 'runningCount', 'inProgress', 'in_progress']);
  const attention = pick(['attention', 'attentionCount', 'blocked', 'needsAttention', 'needs_attention']);
  const ready = pick(['ready', 'readyCount', 'awaiting', 'pending', 'pendingCount']);
  const settled = pick(['settled', 'settledCount', 'integrated', 'completed', 'completedCount', 'done', 'history']);
  if (active !== undefined) out.active = active;
  if (attention !== undefined) out.attention = attention;
  if (ready !== undefined) out.ready = ready;
  if (settled !== undefined) out.settled = settled;
  return out;
}

export interface AttentionModel {
  items: RunModel[];
  raw: unknown;
}

export function normalizeAttention(relay: RelayResult<unknown>): AttentionModel {
  const scopes = collectScopes(relay.result, 3);
  const items = pickList(scopes, ['items', 'runs', 'jobs', 'attention', 'alerts', 'queue', 'flags', 'list', 'entries']);
  return { items: (items ?? []).map(normalizeRun), raw: relay.result };
}

export interface StepModel {
  name: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  costUsd?: number;
  tokens?: number;
  raw: unknown;
}

export function normalizeStep(s: unknown): StepModel {
  const scopes = collectScopes(s, 2);
  return {
    name: pickStr(scopes, ['name', 'title', 'step', 'action', 'description', 'op', 'label', 'task']) ?? 'step',
    status: pickStr(scopes, ['status', 'state', 'outcome', 'result', 'phase']),
    startedAt: pickDate(scopes, ['startedAt', 'start', 'startTime', 'beganAt', 'at', 'timestamp', 'started_at']),
    finishedAt: pickDate(scopes, ['finishedAt', 'end', 'endTime', 'completedAt', 'doneAt', 'finished_at']),
    durationMs: pickNum(scopes, ['durationMs', 'duration', 'duration_ms', 'elapsedMs', 'elapsed', 'ms', 'time']),
    costUsd: pickNum(scopes, ['cost', 'costUsd', 'cost_usd', 'price', 'spend']),
    tokens: pickNum(scopes, ['tokens', 'tokensIn', 'inputTokens', 'outputTokens', 'tokenCount', 'totalTokens', 'usage']),
    raw: s,
  };
}

export interface EvidenceEntry {
  id?: string;
  type?: string;
  level?: string;
  timestamp?: string;
  durationMs?: number;
  costUsd?: number;
  tokens?: number;
  model?: string;
  message?: string;
  raw: unknown;
}

export function normalizeEvidence(e: unknown): EvidenceEntry {
  const scopes = collectScopes(e, 2);
  return {
    id: pickStr(scopes, ['id', 'traceId', 'spanId', 'runId', 'requestId', 'key']),
    type: pickStr(scopes, ['type', 'kind', 'category', 'event', 'operation']),
    level: pickStr(scopes, ['level', 'severity', 'priority']),
    timestamp: pickDate(scopes, ['timestamp', 'time', 'at', 'startedAt', 'createdAt', 'start']),
    durationMs: pickNum(scopes, ['durationMs', 'duration', 'duration_ms', 'elapsedMs', 'elapsed', 'ms']),
    costUsd: pickNum(scopes, ['cost', 'costUsd', 'cost_usd', 'price', 'spend']),
    tokens: pickNum(scopes, ['tokens', 'tokensIn', 'inputTokens', 'outputTokens', 'tokenCount', 'totalTokens']),
    model: pickStr(scopes, ['model', 'llm', 'engine', 'providerModel']),
    message: pickStr(scopes, ['message', 'summary', 'text', 'detail', 'content', 'output', 'result', 'input']),
    raw: e,
  };
}

export interface JobModel {
  id: string;
  status?: string;
  bucket: Bucket;
  worker?: string;
  branch?: string;
  commit?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  model?: string;
  currency?: string;
  steps: StepModel[];
  evidence: EvidenceEntry[];
  raw: unknown;
}

export function normalizeJob(relay: RelayResult<unknown>): JobModel {
  const scopes = collectScopes(relay.result, 3);
  const status = statusFrom(relay.result);
  const stepsRaw = pickList(scopes, ['steps', 'tasks', 'events', 'stages', 'actions', 'spans', 'segments', 'operations', 'commands', 'milestones']);
  const evRaw = pickList(scopes, ['evidence', 'traces', 'spans', 'observations', 'records', 'logs', 'samples', 'calls', 'pipeline', 'events']);
  return {
    id: pickStr(scopes, ['id', 'runId', 'run_id', 'jobId', 'job_id', 'key', 'number']) ?? 'unnamed',
    status,
    bucket: classifyStatus(status),
    worker: pickStr(scopes, ['worker', 'assignee', 'agent', 'operator', 'handler', 'runner', 'actor', 'owner']),
    branch: pickStr(scopes, ['branch', 'branchName', 'branch_name', 'gitBranch', 'ref']),
    commit: pickStr(scopes, ['commit', 'commitSha', 'commit_sha', 'sha', 'head', 'revision', 'hash']),
    startedAt: pickDate(scopes, ['startedAt', 'started_at', 'startTime', 'beganAt', 'createdAt', 'created_at']),
    finishedAt: pickDate(scopes, ['finishedAt', 'finished_at', 'endTime', 'endedAt', 'completedAt', 'completed_at', 'updatedAt', 'updated_at']),
    durationMs: pickNum(scopes, ['durationMs', 'duration', 'duration_ms', 'elapsedMs', 'elapsed', 'executionMs']),
    costUsd: pickNum(scopes, ['cost', 'costUsd', 'cost_usd', 'price', 'spend', 'totalCost']),
    tokensIn: pickNum(scopes, ['tokensIn', 'tokens_in', 'inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']),
    tokensOut: pickNum(scopes, ['tokensOut', 'tokens_out', 'outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']),
    totalTokens: pickNum(scopes, ['tokens', 'totalTokens', 'total_tokens', 'tokenCount', 'usage']),
    model: pickStr(scopes, ['model', 'llm', 'engine', 'agentModel', 'modelName']),
    currency: pickStr(scopes, ['currency', 'currencyCode', 'currency_code', 'unit']),
    steps: (stepsRaw ?? []).map(normalizeStep),
    evidence: (evRaw ?? []).map(normalizeEvidence),
    raw: relay.result,
  };
}

export interface BriefModel {
  title?: string;
  objective?: string;
  context?: string;
  summary?: string;
  plan: string[];
  workers: string[];
  raw: unknown;
}

export function normalizeBrief(relay: RelayResult<unknown>): BriefModel {
  const scopes = collectScopes(relay.result, 3);
  return {
    title: pickStr(scopes, ['title', 'name', 'summary', 'label', 'intent']),
    objective: pickStr(scopes, ['objective', 'goal', 'description', 'prompt', 'intent', 'purpose', 'brief']),
    context: pickStr(scopes, ['context', 'background', 'rationale', 'notes', 'threatModel']),
    summary: pickStr(scopes, ['summary', 'abstract', 'overview', 'snippet']),
    plan: pickStrList(scopes, ['plan', 'steps', 'outline', 'milestones', 'objectives', 'checklist']) ?? [],
    workers: pickStrList(scopes, ['workers', 'assignees', 'agents', 'participants', 'team']) ?? [],
    raw: relay.result,
  };
}

export interface ChangeFile {
  path: string;
  type?: string;
  additions?: number;
  deletions?: number;
  raw: unknown;
}

function normalizeChangeFile(f: unknown): ChangeFile {
  if (typeof f === 'string') return { path: f, raw: f };
  const scopes = collectScopes(f, 2);
  return {
    path: pickStr(scopes, ['path', 'file', 'filename', 'name', 'filePath', 'pathName', 'to']) ?? '',
    type: pickStr(scopes, ['type', 'status', 'changeType', 'change_type', 'action']),
    additions: pickNum(scopes, ['additions', 'added', 'insertions', '+']),
    deletions: pickNum(scopes, ['deletions', 'deleted', 'removals', '-']),
    raw: f,
  };
}

export interface IntegrationModel {
  /**
   * The proposal this decision would act on.
   *
   * Read by exact path rather than by the scope search the display fields use.
   * A proposal is a distinct entity from the job that produced it -- delegate-wave
   * approves `/v1/proposals/{proposalId}`, never a job -- so a fuzzy `id` lookup
   * could return the job's identifier, which would be an authoritative action
   * taken against the wrong namespace. Undefined means no proposal exists yet,
   * and the interface must offer no decision at all.
   */
  proposalId?: string;
  summary?: string;
  branch?: string;
  commit?: string;
  prUrl?: string;
  prState?: string;
  status?: string;
  files: ChangeFile[];
  raw: unknown;
}

/**
 * The proposal identifier, from the two exact places it can legitimately appear.
 *
 * Deliberately not `pickStr`. Every other field here is presentation, where
 * guessing among plausible key names costs at worst a blank cell. This value is
 * the target of an irreversible action, so it is taken from a known path or not
 * at all.
 */
export function proposalIdFrom(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const direct = result['proposalId'];
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  const proposal = result['proposal'];
  if (isRecord(proposal)) {
    for (const key of ['id', 'proposalId'] as const) {
      const v = proposal[key];
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  }
  return undefined;
}

export function normalizeIntegration(relay: RelayResult<unknown>): IntegrationModel {
  const scopes = collectScopes(relay.result, 3);
  const filesRaw = pickList(scopes, ['files', 'changedFiles', 'changed_files', 'changes', 'diff', 'paths', 'fileList', 'diffFiles']);
  const status = statusFrom(relay.result);
  return {
    proposalId: proposalIdFrom(relay.result),
    summary: pickStr(scopes, ['summary', 'message', 'description', 'title', 'notes', 'body']),
    branch: pickStr(scopes, ['branch', 'branchName', 'gitBranch', 'targetBranch', 'headBranch', 'ref']),
    commit: pickStr(scopes, ['commit', 'commitSha', 'sha', 'head', 'revision', 'hash']),
    prUrl: pickStr(scopes, ['prUrl', 'pr_url', 'pullRequest', 'pull_request', 'pr', 'url', 'link', 'reviewUrl']),
    prState: pickStr(scopes, ['prState', 'pr_state', 'state', 'status']),
    status,
    files: (filesRaw ?? []).map(normalizeChangeFile).filter((f) => f.path !== ''),
    raw: relay.result,
  };
}
