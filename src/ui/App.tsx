import { useCallback, useEffect, useMemo, useState } from 'react';
import { read, paramsForTarget } from '../model/adapter';
import { SessionTimeline } from '../timeline/SessionTimeline';
import { sessionsFromOverview, timelineFromJob, type SessionSummary, type SessionTimeline as Timeline } from '../timeline/model';

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [timeline, setTimeline] = useState<Timeline>();
  const [message, setMessage] = useState('Connecting to Delegate Wave…');
  const refresh = useCallback(async () => {
    const overview = await read('overview');
    if (!overview.ok) { setMessage(overview.message ?? 'Delegate Wave is unavailable.'); return; }
    const next = sessionsFromOverview(overview.result);
    setSessions(next);
    setSelected((current) => current && next.some((session) => session.id === current) ? current : next[0]?.id);
    setMessage(next.length ? '' : 'No autonomous sessions have been recorded yet. Delegate through Hermes to begin.');
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 1_200); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const session = sessions.find((item) => item.id === selected);
    if (!session?.rootJobId) { setTimeline(undefined); return; }
    let stopped = false;
    const poll = async () => {
      const reply = await read('job', paramsForTarget(session.rootJobId!));
      if (!stopped && reply.ok) { const next = timelineFromJob(reply.result); if (next) setTimeline(next); }
    };
    void poll();
    const timer = setInterval(() => void poll(), session.state === 'settled' ? 5_000 : 900);
    return () => { stopped = true; clearInterval(timer); };
  }, [selected, sessions]);
  const groups = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const session of sessions) {
      const key = `${session.originHermesSessionId ?? 'Unlinked Hermes conversation'} · ${new Date(session.startedAt).toLocaleDateString()}`;
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return [...map];
  }, [sessions]);
  const selectedTimeline = timeline?.session.id === selected ? timeline : undefined;
  return <div className="session-app">
    <aside className="session-sidebar"><header><span className="wave-mark">↗</span><div><b>DELEGATE WAVE</b><small>Work history</small></div></header>
      <div className="session-groups">{groups.map(([group, items]) => <section key={group}><h2>{group}</h2>{items.map((session) => <button className={selected === session.id ? 'selected' : ''} key={session.id} onClick={() => { setSelected(session.id); setTimeline(undefined); }}><i className={`session-dot ${session.state}`}/><span>{session.intent}</span><time>{new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></button>)}</section>)}</div>
      <footer>OBSERVATION ONLY · PAPERS RELAY</footer></aside>
    <main className="session-main">{selectedTimeline ? <SessionTimeline timeline={selectedTimeline}/> : <div className="timeline-empty"><div className="pulse"/><h1>{selected ? 'Reconstructing durable history…' : 'Your delegated work appears here'}</h1><p>{message || 'Reading the exact session timeline.'}</p></div>}</main>
  </div>;
}

export default App;
