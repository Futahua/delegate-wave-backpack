export type PhaseId =
  | 'queued' | 'planning' | 'exploring' | 'implementing' | 'validating'
  | 'reviewing' | 'needs_input' | 'ready' | 'completed' | 'failed';

export type ActivityKind =
  | 'narration' | 'read' | 'search' | 'edit' | 'command' | 'agent' | 'question' | 'todo' | 'web' | 'other';

export interface ActivityItem {
  id: string;
  actorId: string;
  actorRole: 'manager' | 'worker' | 'validator';
  actorLabel: string;
  kind: ActivityKind;
  lifecycle: 'started' | 'updated' | 'completed' | 'failed';
  title: string;
  detail?: string;
  occurredAt: string;
  authority: 'activity';
  compactable?: boolean;
}

export interface EvidenceItem {
  id: string;
  kind: 'validation' | 'candidate' | 'change' | 'failure' | 'decision';
  title: string;
  detail?: string;
  status: 'passed' | 'failed' | 'recorded';
  source: string;
  occurredAt: string;
  authority: 'evidence';
}

export interface ActorItem {
  id: string;
  role: 'manager' | 'worker' | 'validator';
  label: string;
  state: 'waiting' | 'working' | 'completed' | 'failed';
  current?: string;
  elapsed?: string;
  parentId?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkGroup {
  id: string;
  label: string;
  summary: string;
  items: ActivityItem[];
}

export interface WatchFixture {
  id: string;
  title: string;
  elapsed: string;
  phase: PhaseId;
  phaseLabel: string;
  phases: Array<{ id: PhaseId; label: string; state: 'future' | 'done' | 'active' | 'failed' }>;
  actors: ActorItem[];
  activity: ActivityItem[];
  settledGroups: WorkGroup[];
  evidence: EvidenceItem[];
  attention?: { kind: 'question' | 'approval' | 'failure'; title: string; detail: string };
  outcome?: { kind: 'completed' | 'failed'; title: string; detail: string };
  changedFiles?: { count: number; additions?: number; deletions?: number; files: string[] };
}
