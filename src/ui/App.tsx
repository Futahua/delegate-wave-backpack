import { useCallback, useEffect, useRef, useState } from 'react';
import type { Operation, RelayResult } from '../bridge/bridge';
import {
  normalizeAttention,
  normalizeBrief,
  normalizeIntegration,
  normalizeJob,
  normalizeOverview,
  type Bucket,
  type RunModel,
} from '../model/normalize';
import { paramsForStart, paramsForTarget, read, write } from '../model/adapter';
import { RunTable } from './RunList';
import { RunDetail, type DetailState } from './RunDetail';
import { StatusTag } from './pieces';
import { fmtClock, fmtMoney } from './format';

type Boot = 'loading' | 'ready' | 'offline' | 'error';
type Nav = 'overview' | 'active' | 'attention' | 'ready' | 'settled' | 'run';
type StartState = 'idle' | 'proposing' | 'authorizing' | 'uncertain' | 'done' | 'failed';

interface LogEntry {
  id: number;
  at: string;
  kind: Operation;
  label: string;
  state: 'running' | 'ok' | 'error' | 'uncertain';
  message?: string;
}

interface Channel {
  key: Bucket;
  title: string;
  count: number;
  hint: string;
}

function mergeRuns(prev: RunModel[], next: RunModel[], counterRef: { current: number }): RunModel[] {
  const map = new Map<string, RunModel>();
  for (const r of prev) {
    map.set(r.id === 'unnamed' ? `u-${r.objective ?? ''}` : r.id, r);
  }
  for (const r of next) {
    if (r.id === 'unnamed') {
      const k = `u-${(counterRef.current += 1)}-${r.objective ?? ''}`;
      map.set(k, r);
    } else {
      const old = map.get(r.id);
      map.set(r.id, old ? { ...old, ...r } : r);
    }
  }
  return [...map.values()];
}

function countRuns(runs: RunModel[]): Record<Bucket, number> {
  const c: Record<Bucket, number> = { active: 0, attention: 0, ready: 0, settled: 0, other: 0 };
  for (const r of runs) c[r.bucket] += 1;
  return c;
}

function navForBucket(b: Bucket): Nav {
  switch (b) {
    case 'active':
    case 'attention':
    case 'ready':
    case 'settled':
      return b;
    default:
      return 'overview';
  }
}

export default function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot>('loading');
  const [conn, setConn] = useState<'ok' | 'none' | 'error'>('none');
  const [overview, setOverview] = useState<ReturnType<typeof normalizeOverview>>();
  const [attention, setAttention] = useState<RunModel[]>([]);
  const [runs, setRuns] = useState<RunModel[]>([]);
  const [nav, setNav] = useState<Nav>('overview');
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<DetailState>();
  const [objective, setObjective] = useState('');
  const [startState, setStartState] = useState<StartState>('idle');
  const [startMessage, setStartMessage] = useState<string>();
  const [failMessage, setFailMessage] = useState<string>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const logId = useRef(0);
  const unnamedCounter = useRef(0);
  const startedRef = useRef(false);

  const addLog = useCallback((kind: Operation, label: string, state: LogEntry['state'], message?: string) => {
    logId.current += 1;
    setLog((prev) => [
      { id: logId.current, at: new Date().toISOString(), kind, label, state, message },
      ...prev,
    ].slice(0, 40));
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setBoot((prev) => (prev === 'offline' || prev === 'error' ? 'loading' : prev));
    const [o, a] = await Promise.all([read('overview'), read('attention')]);
    if (o.ok || a.ok) setConn('ok');
    if (o.ok) {
      const m = normalizeOverview(o);
      setOverview(m);
      setRuns((prev) => mergeRuns(prev, m.runs, unnamedCounter));
    } else if (o.code === 'TIMEOUT') {
      if (a.ok) {
        setBoot('ready');
      } else {
        setConn('none');
        setBoot('offline');
      }
    } else {
      setFailMessage(o.message ?? 'overview failed');
      setConn('error');
      setBoot('error');
    }
    if (a.ok) {
      const am = normalizeAttention(a);
      setAttention(am.items);
      setRuns((prev) => mergeRuns(prev, am.items, unnamedCounter));
    }
    if (o.ok || a.ok) setBoot('ready');
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void refreshAll();
  }, [refreshAll]);

  const loadDetail = useCallback(async (id: string) => {
    setSelected(id);
    setNav('run');
    setDetail(undefined);
    const [j, b, i] = await Promise.all([
      read('job', paramsForTarget(id)),
      read('briefing', paramsForTarget(id)),
      read('integration', paramsForTarget(id)),
    ]);
    const anyTimeout = j.code === 'TIMEOUT' || b.code === 'TIMEOUT' || i.code === 'TIMEOUT';
    if (j.ok || b.ok || i.ok) setConn('ok');
    setDetail({
      job: normalizeJob(j),
      briefing: normalizeBrief(b),
      integration: normalizeIntegration(i),
      jobOk: j.ok,
      briefingOk: b.ok,
      integrationOk: i.ok,
      anyTimeout,
      decision: { state: 'idle' },
    });
  }, []);

  const startFlow = useCallback(async () => {
    const text = objective.trim();
    if (!text || startState === 'proposing' || startState === 'authorizing') return;
    setStartState('proposing');
    setStartMessage(undefined);
    addLog('propose', 'Propose intent', 'running');
    const proposeParams = paramsForStart(text);
    const pr: RelayResult<unknown> = await write('propose', proposeParams);
    if (!pr.ok) {
      if (pr.code === 'TIMEOUT') {
        setStartState('uncertain');
        setStartMessage(pr.message ?? 'No host reply.');
        addLog('propose', 'Propose intent', 'uncertain', pr.message);
      } else {
        setStartState('failed');
        setStartMessage(pr.message ?? 'Propose rejected by the operator.');
        addLog('propose', 'Propose intent', 'error', pr.message);
      }
      return;
    }
    addLog('propose', 'Propose intent', 'ok');
    setStartState('authorizing');
    addLog('authorize', 'Authorize intent', 'running');
    const ar: RelayResult<unknown> = await write('authorize', proposeParams);
    if (!ar.ok) {
      if (ar.code === 'TIMEOUT') {
        setStartState('uncertain');
        setStartMessage(ar.message ?? 'No host reply.');
        addLog('authorize', 'Authorize intent', 'uncertain', ar.message);
      } else {
        setStartState('failed');
        setStartMessage(ar.message ?? 'Authorize rejected by the operator.');
        addLog('authorize', 'Authorize intent', 'error', ar.message);
      }
      return;
    }
    setStartState('done');
    setObjective('');
    addLog('authorize', 'Authorize intent', 'ok');
    void refreshAll();
  }, [objective, startState, addLog, refreshAll]);

  const decide = useCallback(
    async (kind: 'approve' | 'decline') => {
      if (!detail || !selected || detail.decision.state !== 'idle') return;
      const next: DetailState = { ...detail, decision: { state: 'running', kind } };
      setDetail(next);
      const res: RelayResult<unknown> = await write(kind, paramsForTarget(selected));
      const label = kind === 'approve' ? 'Integrate' : 'Reject';
      if (!res.ok) {
        if (res.code === 'TIMEOUT') {
          setDetail({ ...next, decision: { state: 'uncertain', kind, message: res.message } });
          addLog(kind, label, 'uncertain', res.message);
        } else {
          setDetail({ ...next, decision: { state: 'failed', kind, message: res.message } });
          addLog(kind, label, 'error', res.message);
        }
        return;
      }
      setDetail({ ...next, decision: { state: 'ok', kind } });
      addLog(kind, label, 'ok');
      void refreshAll();
    },
    [detail, selected, addLog, refreshAll],
  );

  const goNav = useCallback((n: Nav) => {
    setSelected(undefined);
    setDetail(undefined);
    setNav(n === 'run' ? 'overview' : n);
  }, []);

  const counts = overview ? overview.counts : countRuns(runs);
  const channels: Channel[] = [
    { key: 'active', title: 'ACTIVE', count: counts.active, hint: 'Work in motion \u2014 staffed by workers.' },
    { key: 'attention', title: 'ATTENTION', count: counts.attention, hint: 'Blocked, failed, or needs input.' },
    { key: 'ready', title: 'READY', count: counts.ready, hint: 'Awaiting your go or final decision.' },
    { key: 'settled', title: 'SETTLED', count: counts.settled, hint: 'Integrated or declined history.' },
  ];

  const selectedRun = selected ? runs.find((r) => r.id === selected) : undefined;

  let content: React.ReactNode;
  if (boot === 'loading') {
    content = <div className="empty">CONNECTING TO DELEGATE-WAVE\u2026</div>;
  } else if (boot === 'offline') {
    content = (
      <EmptyState
        title="NO HOST"
        body="Papers is not answering this page. Reads time out instead of failing, so nothing here is guessed: every section stays empty until a host actually replies."
        action={
          <button onClick={() => void refreshAll()} className="btn">
            RETRY
          </button>
        }
      />
    );
  } else if (boot === 'error') {
    content = (
      <EmptyState
        title="RELAY ERROR"
        body={failMessage ?? 'The operator rejected a read.'}
        action={
          <button onClick={() => void refreshAll()} className="btn">
            RETRY
          </button>
        }
      />
    );
  } else if (nav === 'run' && selectedRun && detail) {
    content = (
      <RunDetail run={selectedRun} detail={detail} onBack={() => goNav('overview')} onDecide={decide} />
    );
  } else if (nav === 'overview') {
    content = (
      <OverviewPage
        overview={overview}
        runs={runs}
        channels={channels}
        log={log}
        attention={attention}
        onSelect={loadDetail}
        goNav={goNav}
      />
    );
  } else {
    content = <ListPage nav={nav} runs={runs} attention={attention} onSelect={loadDetail} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">\u2197</span> DELEGATE WAVE
        </div>
        <form
          className="start"
          onSubmit={(e) => {
            e.preventDefault();
            void startFlow();
          }}
        >
          <input
            type="text"
            className="obj-input"
            placeholder="State an objective to delegate\u2026"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            disabled={startState === 'proposing' || startState === 'authorizing'}
            aria-label="Objective to delegate"
          />
          <button
            type="submit"
            className="btn primary start-btn"
            disabled={startState === 'proposing' || startState === 'authorizing'}
          >
            {startLabel(startState)}
          </button>
          <button
            type="button"
            className="btn icon"
            title="Refresh overview and attention"
            onClick={() => void refreshAll()}
            disabled={refreshing}
          >
            {refreshing ? '\u2026' : '\u21BB'}
          </button>
        </form>
        <div className={`conn conn-${conn}`}>
          <span className="dot" />
          {conn === 'ok' ? 'CONNECTED' : conn === 'none' ? 'NO HOST' : 'ERROR'}
        </div>
      </header>

      {startState !== 'idle' && startState !== 'proposing' && startState !== 'authorizing' && (
        <div className={`start-strip start-${startState}`}>
          {startState === 'uncertain'
            ? (startMessage ?? 'No host reply.') +
              ' Timed-out submissions are never retried automatically; start again deliberately if you want to resend the intent.'
            : startState === 'done'
            ? 'Intent proposed and authorized.'
            : (startMessage ?? 'Submission failed.') + ' Use START to retry explicitly.'}
        </div>
      )}

      <div className="layout">
        <nav className="nav" aria-label="Dashboards">
          {(
            [
              ['overview', 'OVERVIEW'],
            ] as Array<[Nav, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              className={`nav-item${nav === k ? ' active' : ''}`}
              onClick={() => goNav(k)}
            >
              {label}
            </button>
          ))}
          {channels.map((c) => (
            <button
              key={c.key}
              className={`nav-item${nav === c.key ? ' active' : ''}`}
              onClick={() => goNav(navForBucket(c.key))}
              title={c.hint}
            >
              <span>{c.title}</span>
              <span className="count mono">{c.count}</span>
            </button>
          ))}
          <div className="nav-foot">
            <div>relay \u00b7 9 ops \u00b7 frozen</div>
            <div>postMessage only \u00b7 no credentials held here</div>
          </div>
        </nav>

        <main className="main">{content}</main>
      </div>
    </div>
  );
}

function startLabel(s: StartState): string {
  switch (s) {
    case 'idle':
      return 'START';
    case 'proposing':
      return 'PROPOSING\u2026';
    case 'authorizing':
      return 'AUTHORIZING\u2026';
    case 'uncertain':
      return 'UNCERTAIN';
    case 'done':
      return 'STARTED';
    case 'failed':
      return 'RETRY';
  }
}

function ListPage({
  nav,
  runs,
  attention,
  onSelect,
}: {
  nav: Nav;
  runs: RunModel[];
  attention: RunModel[];
  onSelect: (id: string) => void;
}): React.ReactNode {
  const title = nav.toUpperCase();
  const list =
    nav === 'attention' ? (attention.length > 0 ? attention : runs.filter((r) => r.bucket === 'attention')) : runs.filter((r) => r.bucket === nav);
  return (
    <div className="page">
      <section className="section">
        <header className="section-head">
          <h2>{title}</h2>
          <span className="count mono">{list.length} RUNS</span>
        </header>
        <RunTable runs={list} onSelect={onSelect} empty={nav === 'attention' ? 'Nothing needs attention right now.' : 'No runs in this view.'} />
      </section>
    </div>
  );
}

function OverviewPage({
  overview,
  runs,
  channels,
  log,
  attention,
  onSelect,
  goNav,
}: {
  overview: ReturnType<typeof normalizeOverview> | undefined;
  runs: RunModel[];
  channels: Channel[];
  log: LogEntry[];
  attention: RunModel[];
  onSelect: (id: string) => void;
  goNav: (n: Nav) => void;
}): React.ReactNode {
  return (
    <div className="page">
      <section className="section">
        <header className="section-head">
          <h2>CHANNELS</h2>
          {overview?.cycle !== undefined && <span className="mono dim">cycle {overview.cycle}</span>}
        </header>
        <div className="channels">
          {channels.map((c) => (
            <button key={c.key} className="channel" onClick={() => goNav(navForBucket(c.key))}>
              <span className={`tag tag-${c.key}`}>{c.title}</span>
              <span className="channel-count mono">{c.count}</span>
              <span className="hint">{c.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <header className="section-head">
          <h2>BUDGET</h2>
        </header>
        <div className="field-grid">
          <Field label="SPENT" mono value={fmtMoney(overview?.budgetSpent, overview?.currency)} />
          <Field label="AVAILABLE" mono value={fmtMoney(overview?.budgetAvailable, overview?.currency)} />
          <Field label="TOTAL" mono value={fmtMoney(overview?.budgetTotal, overview?.currency)} />
        </div>
        {overview &&
          overview.budgetSpent === undefined &&
          overview.budgetAvailable === undefined &&
          overview.budgetTotal === undefined && <div className="empty">No budget accounting reported.</div>}
      </section>

      <section className="section">
        <header className="section-head">
          <h2>ATTENTION</h2>
          <span className="count mono">{attention.length} ITEMS</span>
        </header>
        <RunTable runs={attention} onSelect={onSelect} empty="Nothing needs attention right now." />
      </section>

      <section className="section">
        <header className="section-head">
          <h2>RUNS</h2>
          <span className="count mono">{runs.length} TOTAL</span>
        </header>
        <RunTable runs={runs} onSelect={onSelect} />
      </section>

      <section className="section">
        <header className="section-head">
          <h2>ACTIVITY</h2>
        </header>
        {log.length === 0 ? (
          <div className="empty">No mutations recorded this session.</div>
        ) : (
          <table className="runs">
            <thead>
              <tr>
                <th>TIME</th>
                <th>OP</th>
                <th>ACTION</th>
                <th>STATE</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{fmtClock(l.at)}</td>
                  <td className="mono">{l.kind}</td>
                  <td>{l.label}</td>
                  <td>
                    <StatusTag bucket={undefined} status={l.state} />
                  </td>
                  <td className="dim">{l.message ?? '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action: React.ReactNode }): React.ReactNode {
  return (
    <div className="empty-state">
      <h1>{title}</h1>
      <p>{body}</p>
      {action}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }): React.ReactNode {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className={`field-value${mono ? ' mono' : ''}`}>{value ?? '\u2014'}</span>
    </div>
  );
}