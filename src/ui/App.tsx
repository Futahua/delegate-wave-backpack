import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { read, paramsForSessionList, paramsForSessionTimeline } from '../model/adapter';
import { SessionTimeline } from '../timeline/SessionTimeline';
import { mergeStreamPage, mergeTimelineRefresh, sessionPageFromRelay, timelineFromRelay, type ProcessSpan, type SessionSummary, type SessionTimeline as Timeline } from '../timeline/model';

export const VISIBLE_LIST_POLL = 1_200;
export const HIDDEN_LIST_POLL = 5_000;
export const VISIBLE_TIMELINE_POLL = 900;
export const HIDDEN_TIMELINE_POLL = 5_000;

export interface SessionConversationGroup { id:string; label:string; sessions:SessionSummary[] }
const neutralConversationLabel=(newest:SessionSummary)=>`Hermes conversation · ${new Date(newest.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
export function buildSessionGroups(sessions:SessionSummary[]):SessionConversationGroup[]{const conversations=new Map<string,SessionSummary[]>();for(const item of sessions){const identity=item.originHermesSessionId??`unlinked:${item.id}`;conversations.set(identity,[...(conversations.get(identity)??[]),item])}return[...conversations].map(([id,items])=>{const sorted=[...items].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));return{id,label:neutralConversationLabel(sorted[0]!),sessions:sorted}}).sort((a,b)=>Date.parse(b.sessions[0]!.startedAt)-Date.parse(a.sessions[0]!.startedAt))}

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [timeline, setTimeline] = useState<Timeline>();
  const [indexFreshness, setIndexFreshness] = useState<'fresh'|'stale'|'loading'>('loading');
  const [timelineFreshness, setTimelineFreshness] = useState<'fresh'|'stale'|'loading'>('loading');
  const [message, setMessage] = useState('Connecting to Delegate Wave…');
  const timelineRef = useRef<Timeline|undefined>(undefined);
  timelineRef.current = timeline;

  const loadSessionIndex = useCallback(async () => {
    const collected: SessionSummary[] = [];
    let cursor: string | undefined;
    do {
      const reply = await read('session.list', paramsForSessionList(cursor, 40));
      if (!reply.ok) throw new Error(reply.message ?? 'Session history is unavailable.');
      const page = sessionPageFromRelay(reply.result);
      if (!page) throw new Error('Delegate Wave returned an unreadable session index.');
      collected.push(...page.sessions);
      cursor = page.hasMore ? page.nextCursor : undefined;
      if (page.hasMore && !cursor) throw new Error('Session history pagination stopped without a cursor.');
    } while (cursor);
    return collected;
  }, []);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>|undefined;
    const schedule = () => {
      if (!stopped) timer = setTimeout(() => void run(), document.visibilityState === 'hidden' ? HIDDEN_LIST_POLL : VISIBLE_LIST_POLL);
    };
    const run = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const next = await loadSessionIndex();
        if (stopped) return;
        setSessions(next);
        setSelected((current) => current && next.some((session) => session.id === current) ? current : next[0]?.id);
        setIndexFreshness('fresh');
        setMessage(next.length ? '' : 'No autonomous sessions have been recorded yet. Delegate through Hermes to begin.');
      } catch (error) {
        if (!stopped) { setIndexFreshness('stale'); setMessage(error instanceof Error ? error.message : 'Session history is unavailable.'); }
      } finally { running = false; schedule(); }
    };
    void run();
    const visibility = () => { if (timer) clearTimeout(timer); if (!running) timer = setTimeout(() => void run(), 0); };
    document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [loadSessionIndex]);

  const selectedSession = sessions.find((session) => session.id === selected);
  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>|undefined;
    let acceptedRevision: string|undefined;
    setTimelineFreshness((current) => current === 'fresh' ? 'fresh' : 'loading');
    const schedule = () => {
      if (!stopped) timer = setTimeout(() => void run(), document.visibilityState === 'hidden' ? HIDDEN_TIMELINE_POLL : VISIBLE_TIMELINE_POLL);
    };
    const run = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const reply = await read('session.timeline', paramsForSessionTimeline(selected, { limit: 120 }));
        if (!reply.ok) throw new Error(reply.message ?? 'Timeline read failed.');
        const next = timelineFromRelay(reply.result);
        if (!next) throw new Error('Delegate Wave returned an unreadable timeline.');
        if (stopped) return;
        if (!acceptedRevision || next.revision !== acceptedRevision) {
          acceptedRevision = next.revision;
          const refreshed=timelineRef.current?.session.id===selected?mergeTimelineRefresh(timelineRef.current,next):next;
          timelineRef.current=refreshed;
          setTimeline(refreshed);
        }
        setTimelineFreshness('fresh');
      } catch (error) {
        if (!stopped) { setTimelineFreshness('stale'); setMessage(error instanceof Error ? error.message : 'Timeline read failed.'); }
      } finally { running = false; schedule(); }
    };
    void run();
    const visibility = () => { if (timer) clearTimeout(timer); if (!running) timer = setTimeout(() => void run(), 0); };
    document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [selected, selectedSession?.state]);

  const loadEarlier = useCallback(async (span: ProcessSpan) => {
    if (!selected || !span.streamBounds.cursor) return;
    const reply = await read('session.timeline', paramsForSessionTimeline(selected, { streamSpanId: span.id, before: span.streamBounds.cursor, limit: 120 }));
    if (!reply.ok) { setTimelineFreshness('stale'); setMessage(reply.message ?? 'Earlier activity could not be loaded.'); return; }
    const page = timelineFromRelay(reply.result);
    const current = timelineRef.current;
    if (page && current) { const merged = mergeStreamPage(current, page); timelineRef.current = merged; setTimeline(merged); }
  }, [selected]);

  const groups = useMemo(() => buildSessionGroups(sessions), [sessions]);
  const selectedTimeline = timeline?.session.id === selected ? timeline : undefined;
  const freshness = selectedTimeline ? timelineFreshness : indexFreshness;
  return <div className="session-app"><aside className="session-sidebar"><header><span className="wave-mark">↗</span><div><b>Delegate Wave</b><small>Agent sessions</small></div></header><div className="session-groups">{groups.map((group)=><section className="conversation-group" key={group.id}><h2 title={`Hermes ${group.id}`}>{group.label}</h2>{group.sessions.map((item) => <button title={`Hermes ${item.originHermesSessionId??'unlinked'} · Session ${item.id}`} className={selected === item.id ? 'selected' : ''} key={item.id} onClick={() => { setSelected(item.id); setTimeline(undefined); }}><i className={`session-dot ${item.state}`}/><span><b>{item.intent}</b><small>{item.state} · {new Date(item.startedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></span></button>)}</section>)}</div><footer>{freshness === 'fresh' ? 'Watching durable work' : freshness === 'stale' ? 'Offline · last confirmed' : 'Connecting…'}</footer></aside><main className="session-main">{selectedTimeline ? <><div className={`freshness freshness-${freshness}`}>{freshness === 'stale' ? 'Offline · showing last confirmed revision' : ''}</div><SessionTimeline timeline={selectedTimeline} onLoadEarlier={loadEarlier}/></> : <div className="timeline-empty"><div className="pulse"/><h1>{selected ? 'Reconstructing durable history…' : 'Your delegated work appears here'}</h1><p>{message || 'Reading the exact session timeline.'}</p></div>}</main></div>;
}

export default App;
