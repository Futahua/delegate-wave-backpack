import { LegendList } from '@legendapp/list/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { allocateLanes, compactable, type PositionedSpan, type ProcessSpan, type SessionTimeline as Timeline } from './model';

function Stream({ span }: { span: ProcessSpan }): React.JSX.Element {
  return <div className="process-stream" tabIndex={0}>{span.stream.length ? span.stream.map((item) => <div className={`stream-row stream-${item.kind} lifecycle-${item.lifecycle}`} key={item.id}><span className="stream-kind">{item.kind}</span><span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span></div>) : <div className="truthful-working">{span.state === 'live' ? '● Working…' : 'No public stream was recorded.'}</div>}</div>;
}

function Card({ span, rowTop, expanded, toggle }: { span: PositionedSpan; rowTop: number; expanded: boolean; toggle: () => void }): React.JSX.Element {
  const settled = !['live', 'waiting'].includes(span.state);
  const compact = settled && compactable(span) && !expanded;
  return <article className={`span-card actor-${span.actor} state-${span.state}${compact ? ' compact' : ''}`} style={{ position: 'absolute', top: span.top - rowTop, left: `${span.lane / span.laneCount * 100}%`, width: `${100 / span.laneCount}%`, minHeight: compact ? 72 : span.height }}>
    <button className="span-head" onClick={settled ? toggle : undefined} aria-expanded={expanded}><span><i/>{span.label}</span><span className="span-state">{span.state}</span></button>
    {compact ? <div className="compact-summary">{span.stream.length} real events · click to expand</div> : <Stream span={span}/>}</article>;
}

function overlapRows(positioned: PositionedSpan[], now: number, zoom: number) {
  const sorted = [...positioned].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const rows: Array<{ id: string; minute: number; top: number; height: number; spans: PositionedSpan[]; end: number }> = [];
  for (const span of sorted) {
    const start = Date.parse(span.startedAt);
    const end = span.finishedAt ? Date.parse(span.finishedAt) : now;
    const row = rows.at(-1);
    if (!row || start >= row.end) rows.push({ id: `group:${span.id}`, minute: 0, top: span.top, height: span.height + 16, spans: [span], end });
    else { row.spans.push(span); row.end = Math.max(row.end, end); row.height = Math.max(row.height, span.top - row.top + span.height + 16); }
  }
  if (rows.length) { const origin = rows[0]!.top; for (const row of rows) row.minute = Math.round((row.top - origin) / zoom); }
  return rows;
}

export function SessionTimeline({ timeline }: { timeline: Timeline }): React.JSX.Element {
  const [zoom, setZoom] = useState(8);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [following, setFollowing] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const previousRevision = useRef(timeline.revision);
  useEffect(() => { if (timeline.session.state === 'settled') return; const timer = setInterval(() => setClock(Date.now()), 1_000); return () => clearInterval(timer); }, [timeline.session.state]);
  useEffect(() => { if (previousRevision.current !== timeline.revision && !following) setNewCount((count) => count + 1); previousRevision.current = timeline.revision; }, [timeline.revision, following]);
  const positioned = useMemo(() => allocateLanes(timeline.spans, zoom, clock), [timeline.spans, zoom, clock]);
  const rows = useMemo(() => overlapRows(positioned, clock, zoom), [positioned, clock, zoom]);
  return <section className="timeline-panel"><header className="timeline-header"><div><span className="eyebrow">SESSION</span><h1>{timeline.session.intent}</h1><p>{timeline.session.state} · {new Date(timeline.session.startedAt).toLocaleString()}</p></div><label className="zoom">Compression <input type="range" min="3" max="18" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/><b>{zoom} px/min</b></label></header>
    <div className="timeline-list" onScroll={(event) => { const node = event.currentTarget; const atEnd = node.scrollHeight - node.scrollTop - node.clientHeight <= 40; setFollowing(atEnd); if (atEnd) setNewCount(0); }}>
      <LegendList data={rows} keyExtractor={(row) => row.id} estimatedItemSize={180} maintainVisibleContentPosition={{ data: true }} renderItem={({ item }) => <div className="timeline-row" style={{ minHeight: item.height }}><time>+{item.minute}m</time><div className="lane-row" style={{ minHeight: item.height }}>{item.spans.map((span) => <Card key={span.id} span={span} rowTop={item.top} expanded={expanded.has(span.id)} toggle={() => setExpanded((current) => { const next = new Set(current); next.has(span.id) ? next.delete(span.id) : next.add(span.id); return next; })}/>)}</div></div>}/>
    </div>
    {!following && <button className="return-live" onClick={() => { document.querySelector('.timeline-list')?.scrollTo({ top: 1e9, behavior: 'smooth' }); setFollowing(true); setNewCount(0); }}>↓ Return to live{newCount ? ` · ${newCount} new` : ''}</button>}
  </section>;
}
