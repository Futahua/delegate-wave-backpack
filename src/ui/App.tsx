import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Pane, SplitPane, type DividerProps } from 'react-split-pane';
import 'react-split-pane/styles.css';
import { read, paramsForSessionList, paramsForSessionTimeline } from '../model/adapter';
import { SessionTimeline } from '../timeline/SessionTimeline';
import { mergeStreamPage, mergeTimelineRefresh, sessionPageFromRelay, timelineFromRelay, type ProcessSpan, type SessionSummary, type SessionTimeline as Timeline } from '../timeline/model';

export const VISIBLE_LIST_POLL = 1_200;
export const HIDDEN_LIST_POLL = 5_000;
export const VISIBLE_TIMELINE_POLL = 900;
export const HIDDEN_TIMELINE_POLL = 5_000;

export interface SessionConversationGroup { id:string; label:string; sessions:SessionSummary[] }
const neutralConversationLabel=(newest:SessionSummary)=>newest.originHermesSessionTitle?.trim()||`Hermes · ${new Date(newest.startedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`;
export function buildSessionGroups(sessions:SessionSummary[]):SessionConversationGroup[]{const conversations=new Map<string,SessionSummary[]>();for(const item of sessions){const identity=item.originHermesSessionId??`unlinked:${item.id}`;conversations.set(identity,[...(conversations.get(identity)??[]),item])}return[...conversations].map(([id,items])=>{const sorted=[...items].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));return{id,label:neutralConversationLabel(sorted[0]!),sessions:sorted}}).sort((a,b)=>Date.parse(b.sessions[0]!.startedAt)-Date.parse(a.sessions[0]!.startedAt))}

const DEFAULT_SIDEBAR_WIDTH=264,MIN_SIDEBAR_WIDTH=200,MAX_SIDEBAR_WIDTH=420;
export const normalizeSidebarWidth=(saved:string|null|undefined)=>{if(saved===null||saved===undefined)return DEFAULT_SIDEBAR_WIDTH;const value=Number(saved);return Number.isFinite(value)?Math.min(MAX_SIDEBAR_WIDTH,Math.max(MIN_SIDEBAR_WIDTH,value)):DEFAULT_SIDEBAR_WIDTH};
const savedSidebarWidth=()=>normalizeSidebarWidth(globalThis.localStorage?.getItem('delegate-wave.sidebar-width'));
const savedSidebarCollapsed=()=>globalThis.localStorage?.getItem('delegate-wave.sidebar-collapsed')==='true';

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [timeline, setTimeline] = useState<Timeline>();
  const [indexFreshness, setIndexFreshness] = useState<'fresh'|'stale'|'loading'>('loading');
  const [timelineFreshness, setTimelineFreshness] = useState<'fresh'|'stale'|'loading'>('loading');
  const [message, setMessage] = useState('Connecting to Delegate Wave…');
  const [sidebarWidth,setSidebarWidth]=useState(savedSidebarWidth);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(savedSidebarCollapsed);
  const [collapsedGroups,setCollapsedGroups]=useState<Set<string>>(()=>new Set());
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
  const Divider=useCallback<ComponentType<DividerProps>>(({className,style,onPointerDown,onKeyDown,currentSize,minSize,maxSize,disabled})=><div className={`${className??''} sidebar-divider`} style={style} role="separator" aria-label="Resize sessions sidebar" aria-orientation="vertical" aria-valuenow={currentSize} aria-valuemin={minSize} aria-valuemax={maxSize} tabIndex={disabled?-1:0} onPointerDown={disabled?undefined:onPointerDown} onKeyDown={disabled?undefined:onKeyDown} onDoubleClick={()=>{setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);localStorage.setItem('delegate-wave.sidebar-width',String(DEFAULT_SIDEBAR_WIDTH))}}/>,[]);
  const toggleSidebar=()=>setSidebarCollapsed((current)=>{const next=!current;localStorage.setItem('delegate-wave.sidebar-collapsed',String(next));return next});
  return <div className="session-app"><SplitPane direction="horizontal" className="session-split" divider={Divider} dividerSize={sidebarCollapsed?1:7} step={10} onResize={(sizes)=>{if(!sidebarCollapsed)setSidebarWidth(sizes[0]??DEFAULT_SIDEBAR_WIDTH)}} onResizeEnd={(sizes)=>{if(sidebarCollapsed)return;const width=Math.round(sizes[0]??DEFAULT_SIDEBAR_WIDTH);setSidebarWidth(width);localStorage.setItem('delegate-wave.sidebar-width',String(width))}}><Pane size={sidebarCollapsed?42:sidebarWidth} minSize={sidebarCollapsed?42:MIN_SIDEBAR_WIDTH} maxSize={sidebarCollapsed?42:MAX_SIDEBAR_WIDTH}><aside className={`session-sidebar${sidebarCollapsed?' collapsed':''}`}><header className="session-nav-header"><button className="sidebar-toggle" aria-label={sidebarCollapsed?'Expand sessions sidebar':'Collapse sessions sidebar'} title={sidebarCollapsed?'Expand sidebar':'Collapse sidebar'} onClick={toggleSidebar}>☰</button></header>{!sidebarCollapsed&&<div className="session-groups">{groups.map((group)=>{const collapsed=collapsedGroups.has(group.id);return <section className="conversation-group" key={group.id}><button className="conversation-toggle" title={`Hermes ${group.id}`} aria-expanded={!collapsed} onClick={()=>setCollapsedGroups((current)=>{const next=new Set(current);next.has(group.id)?next.delete(group.id):next.add(group.id);return next})}><b>{group.label}</b><small>{group.sessions.length} {group.sessions.length===1?'wave':'waves'}</small></button>{!collapsed&&group.sessions.map((item) => {const consequential=['live','waiting','failed'].includes(item.state);return <button aria-label={`${item.intent}, ${item.state}, ${new Date(item.startedAt).toLocaleString()}`} title={`Hermes ${item.originHermesSessionId??'unlinked'} · Session ${item.id}`} className={`session-link${selected === item.id ? ' selected' : ''}`} key={item.id} onClick={() => { setSelected(item.id); setTimeline(undefined); }}><i className={`session-dot ${item.state}`}/><span><b>{item.intent}</b><small className="session-meta">{new Date(item.startedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></span>{consequential&&<em className={`session-consequential state-${item.state}`}>{item.state}</em>}</button>})}</section>})}</div>}</aside></Pane><Pane minSize={360}><main className="session-main">{selectedTimeline ? <><div className={`freshness freshness-${freshness}`}>{freshness === 'stale' ? 'Offline · showing last confirmed revision' : ''}</div><SessionTimeline timeline={selectedTimeline} onLoadEarlier={loadEarlier}/></> : <div className="timeline-empty"><div className="pulse"/><h1>{selected ? 'Reconstructing durable history…' : 'Your delegated work appears here'}</h1><p>{message || 'Reading the exact session timeline.'}</p></div>}</main></Pane></SplitPane></div>;
}

export default App;
