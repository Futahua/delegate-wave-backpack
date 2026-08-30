import { useLayoutEffect, useRef, useState } from 'react';
import type { ActivityItem, WatchFixture } from './types';
import { distanceFromEnd, nextFollowMode, type FollowMode } from './live-edge';

const glyph: Record<ActivityItem['kind'], string> = {
  narration: '·', read: '◇', search: '⌕', edit: '◆', command: '◌', agent: '↳',
  question: '?', todo: '□', web: '◎', other: '·',
};

function ActivityRow({ item }: { item: ActivityItem }): React.JSX.Element {
  return (
    <div className={`work-row work-${item.kind} lifecycle-${item.lifecycle}`} data-activity-id={item.id}>
      <span className="work-glyph" aria-hidden="true">{item.lifecycle === 'failed' ? '×' : item.lifecycle === 'completed' && item.kind === 'command' ? '✓' : glyph[item.kind]}</span>
      <div className="work-copy">
        <div className="work-title">{item.title}</div>
        {item.detail && <div className="work-detail">{item.detail}</div>}
      </div>
      <span className="work-state">{item.lifecycle === 'updated' ? 'running' : item.lifecycle}</span>
    </div>
  );
}

function PhaseRail({ fixture }: { fixture: WatchFixture }): React.JSX.Element {
  return <ol className="phase-rail" aria-label={`Current phase: ${fixture.phaseLabel}`}>
    {fixture.phases.map((phase) => <li key={phase.id} className={`phase-${phase.state}`}><span className="phase-dot">{phase.state === 'done' ? '✓' : phase.state === 'failed' ? '×' : ''}</span><span>{phase.label}</span></li>)}
  </ol>;
}

function ActorPanel({ fixture }: { fixture: WatchFixture }): React.JSX.Element {
  const children = fixture.actors.filter((actor) => actor.role !== 'manager');
  const manager = fixture.actors.find((actor) => actor.role === 'manager');
  const completedWorkers = children.filter((actor) => actor.role === 'worker' && actor.state === 'completed');
  return <aside className="actor-panel" aria-label="Workers and phases">
    <div className="panel-eyebrow">People at work</div>
    {manager && <div className="actor actor-manager"><span className={`actor-state ${manager.state}`}/><div><strong>{manager.label}</strong><small>{manager.current ?? fixture.phaseLabel}</small></div></div>}
    {completedWorkers.length > 1 && <details className="actor-group"><summary><span>Exploration</span><small>{completedWorkers.length} workers · settled</small></summary>{completedWorkers.map((actor) => <div className="actor actor-child" key={actor.id}><span className="actor-state done">✓</span><div><strong>{actor.label}</strong><small>{actor.elapsed}</small></div></div>)}</details>}
    {children.filter((actor) => !completedWorkers.includes(actor)).map((actor) => <div className="actor actor-child" key={actor.id}><span className={`actor-state ${actor.state}`}>{actor.state === 'completed' ? '✓' : actor.state === 'failed' ? '×' : ''}</span><div><strong>{actor.label}</strong><small>{actor.current ?? actor.elapsed ?? actor.state}</small></div></div>)}
  </aside>;
}

function Evidence({ fixture }: { fixture: WatchFixture }): React.JSX.Element {
  return <section className="evidence-landmark" aria-labelledby="evidence-title">
    <header><div><span className="evidence-kicker">Durable record</span><h2 id="evidence-title">Evidence</h2></div><span className="evidence-count">{fixture.evidence.length} receipts</span></header>
    {fixture.evidence.map((item) => <div className={`evidence-row evidence-${item.status}`} key={item.id}><span className="evidence-mark">{item.status === 'passed' ? '✓' : item.status === 'failed' ? '×' : '◆'}</span><div><strong>{item.title}</strong><p>{item.detail}</p><code>{item.source}</code></div></div>)}
  </section>;
}

export function Watch({ fixture }: { fixture: WatchFixture }): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState<FollowMode>('following-end');
  const [newCount, setNewCount] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pendingHeight = useRef<number | undefined>(undefined);
  // Active work is intentionally bounded. Settled history belongs in compact
  // groups/evidence rather than mounting an unbounded durable tool transcript.
  const hiddenActivityCount = Math.max(0, fixture.activity.length - 240);
  const visibleActivity = hiddenActivityCount ? fixture.activity.slice(-240) : fixture.activity;

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (pendingHeight.current !== undefined) {
      node.scrollTop += node.scrollHeight - pendingHeight.current;
      pendingHeight.current = undefined;
    } else if (follow === 'following-end') {
      node.scrollTop = node.scrollHeight;
      setNewCount(0);
    } else {
      setNewCount((n) => n + 1);
    }
  }, [fixture.activity.length, fixture.activity.at(-1)?.detail, expanded, follow]);

  const toggleGroup = (id: string) => {
    const node = scroller.current;
    if (node) pendingHeight.current = node.scrollHeight;
    setExpanded((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const returnLive = () => {
    setFollow('following-end'); setNewCount(0);
    requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });
  };

  return <main className="watch-shell">
    <header className="watch-header">
      <div><span className="watch-overline">Delegate Wave work</span><h1>{fixture.title}</h1></div>
      <div className="watch-meta"><strong>{fixture.phaseLabel}</strong><span>{fixture.elapsed}</span></div>
    </header>
    <PhaseRail fixture={fixture}/>
    {fixture.attention && <section className={`attention-banner attention-${fixture.attention.kind}`}><span>{fixture.attention.kind === 'question' ? '?' : fixture.attention.kind === 'failure' ? '×' : '!'}</span><div><strong>{fixture.attention.title}</strong><p>{fixture.attention.detail}</p></div></section>}
    <div className="watch-layout">
      <ActorPanel fixture={fixture}/>
      <div className="timeline-wrap">
        <div className="timeline" ref={scroller} onScroll={(event) => { const node = event.currentTarget; const next = nextFollowMode(follow, distanceFromEnd(node.scrollHeight, node.scrollTop, node.clientHeight)); if (next !== follow) { setFollow(next); if (next === 'following-end') setNewCount(0); } }}>
          {fixture.settledGroups.map((group) => <section className="settled-group" key={group.id}>{group.items.length ? <><button onClick={() => toggleGroup(group.id)} aria-expanded={expanded.has(group.id)}><span>{expanded.has(group.id) ? '▾' : '▸'} {group.summary}</span><small>{group.label}</small></button>{expanded.has(group.id) && <div className="settled-items">{group.items.map((item) => <ActivityRow key={item.id} item={item}/>)}</div>}</> : <div className="settled-summary"><span>{group.summary}</span><small>{group.label}</small></div>}</section>)}
          {hiddenActivityCount > 0 && <div className="history-window-note">{hiddenActivityCount} older ordinary activities compacted · durable evidence remains below</div>}
          {visibleActivity.map((item, index) => <section className="activity-block" key={item.id}>{index === 0 || visibleActivity[index - 1]?.actorId !== item.actorId ? <h2>{item.actorLabel}</h2> : null}<ActivityRow item={item}/></section>)}
          {fixture.evidence.length > 0 && <Evidence fixture={fixture}/>} 
          {fixture.changedFiles && <section className="changed-files"><header><strong>{fixture.changedFiles.count} files changed</strong><span>+{fixture.changedFiles.additions ?? 0} −{fixture.changedFiles.deletions ?? 0}</span></header>{fixture.changedFiles.files.map((path) => <code key={path}>{path}</code>)}</section>}
          {fixture.outcome && <section className={`outcome outcome-${fixture.outcome.kind}`}><span>{fixture.outcome.kind === 'completed' ? '✓' : '×'}</span><div><strong>{fixture.outcome.title}</strong><p>{fixture.outcome.detail}</p></div></section>}
          <div className="live-sentinel" aria-label="Live edge"><span/>Live</div>
        </div>
        {follow === 'free-scrolling' && <button className="return-live" onClick={returnLive}>↓ Return to live{newCount ? ` · ${newCount} new` : ''}</button>}
      </div>
    </div>
  </main>;
}
