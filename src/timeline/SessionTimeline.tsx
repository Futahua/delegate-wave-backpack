import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildGeometry, bundleMundaneProcesses, type ConcurrencyCluster, type ProcessBundle, type ProcessSpan, type SessionTimeline as Timeline, type TimelineProcess } from './model';

export interface TimelineBootstrapDiagnostic {
  suppliedClusters: number;
  viewportWidth: number;
  viewportHeight: number;
  listLoaded: boolean;
  renderedItems: number;
}

function Stream({ span, loading, loadEarlier }: { span: ProcessSpan; loading?: boolean; loadEarlier?: () => void }): React.JSX.Element {
  const rowHeight = 54, viewportRows = 9;
  const [start, setStart] = useState(0);
  const [expandedNarration,setExpandedNarration]=useState<string>();
  const visible = span.stream.slice(start, start + viewportRows + 4);
  return <div className="process-stream" tabIndex={0} data-testid={`stream:${span.id}`}>
    {span.streamBounds.hasEarlier && <button className="load-earlier" disabled={loading} onClick={loadEarlier}>{loading ? 'Loading…' : 'Load earlier activity'}</button>}
    {!span.streamBounds.complete && !span.streamBounds.hasEarlier && <div className="stream-bound">This recorded stream is bounded.</div>}
    {span.stream.length ? <div className="stream-viewport" data-testid={`stream-viewport:${span.id}`} onScroll={(event)=>setStart(Math.max(0,Math.floor(event.currentTarget.scrollTop/rowHeight)-2))}>
      <div className="stream-virtual-space" style={{height:span.stream.length*rowHeight}}><div style={{transform:`translateY(${start*rowHeight}px)`}}>{visible.map((item) => <div className={`stream-row stream-${item.kind} lifecycle-${item.lifecycle}`} style={{height:rowHeight}} key={item.id}><span className="stream-kind">{item.kind}</span><span><strong className={item.kind==='narration'?'narration-preview':undefined}>{item.title}</strong>{item.detail && <small>{item.detail}</small>}{item.kind==='narration'&&<button className="narration-toggle" aria-expanded={expandedNarration===item.id} onClick={()=>setExpandedNarration((current)=>current===item.id?undefined:item.id)}>{expandedNarration===item.id?'Collapse explanation':'Read full explanation'}</button>}</span></div>)}</div></div>
    </div> : <div className="truthful-working">{span.state === 'live' ? '● Working…' : 'No public stream was recorded.'}</div>}
    {expandedNarration&&<div className="narration-full" data-testid={`narration:${expandedNarration}`}>{span.stream.find((item)=>item.id===expandedNarration)?.title}</div>}
  </div>;
}

function processSpans(process: TimelineProcess): ProcessSpan[] {
  return 'bundle' in process ? (process as ProcessBundle).processes : [process];
}

function ClusterRow({ cluster, expanded, toggle, loading, loadEarlier }: {
  cluster: ConcurrencyCluster; expanded: Set<string>; toggle: (id:string)=>void;
  loading: Set<string>; loadEarlier: (span:ProcessSpan)=>void;
}): React.JSX.Element {
  const disclosures = cluster.processes.filter(({ process }) => expanded.has(process.id));
  return <div className="cluster-row" data-testid={cluster.id}>
    <div className="chronology-gap" style={{ height: cluster.gapBefore }} aria-hidden="true"/>
    <div className="cluster-canvas" style={{ height: cluster.height }}>
      <time>{new Date(cluster.start).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</time>
      {cluster.processes.map(({ process, lane, top, height }) => {
        const settled = !['live','waiting'].includes(process.state);
        return <article key={process.id} className={`span-card actor-${process.actor} state-${process.state}${'bundle' in process?' process-bundle':''}`} style={{ top, height, left:`calc(${lane/cluster.laneCount*100}% + 54px)`, width:`calc(${100/cluster.laneCount}% - ${54/cluster.laneCount}px - 8px)` }}>
          <button className="span-head" onClick={settled?()=>toggle(process.id):undefined} aria-expanded={expanded.has(process.id)}><span><i/>{process.label}</span><span className="span-state">{process.state}</span></button>
          {process.state === 'live' && <Stream span={process} loading={loading.has(process.id)} loadEarlier={()=>loadEarlier(process)}/>}
          {settled && <div className="compact-summary">{'bundle' in process ? `${process.processes.length} exact processes` : `${process.stream.length} visible event${process.stream.length===1?'':'s'}`} · {expanded.has(process.id)?'collapse':'expand'}</div>}
        </article>;
      })}
    </div>
    {disclosures.map(({ process }) => <div className="inline-disclosure" key={`disclosure:${process.id}`} data-testid={`disclosure:${process.id}`}><header><b>{process.label}</b><button onClick={()=>toggle(process.id)}>Collapse</button></header>{processSpans(process).map((span)=><section key={span.id}><h3>{span.label}</h3><Stream span={span} loading={loading.has(span.id)} loadEarlier={()=>loadEarlier(span)}/></section>)}</div>)}
  </div>;
}

export function SessionTimeline({ timeline, onLoadEarlier, onBootstrapDiagnostic }: {
  timeline:Timeline;
  onLoadEarlier:(span:ProcessSpan)=>Promise<void>;
  onBootstrapDiagnostic?:(diagnostic:TimelineBootstrapDiagnostic)=>void;
}): React.JSX.Element {
  const [zoom,setZoom]=useState(8),[expanded,setExpanded]=useState<Set<string>>(()=>new Set()),[following,setFollowing]=useState(true),[newCount,setNewCount]=useState(0),[clock,setClock]=useState(Date.now()),[loading,setLoading]=useState<Set<string>>(()=>new Set());
  const listRef=useRef<HTMLDivElement|null>(null),listHostRef=useRef<HTMLDivElement|null>(null),revision=useRef(timeline.revision),rearmRequested=useRef(false),listLoaded=useRef(false),renderedItems=useRef(new Set<string>());
  useEffect(()=>{if(timeline.session.state==='settled')return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[timeline.session.state]);
  useEffect(()=>{if(revision.current!==timeline.revision&&!following)setNewCount((count)=>count+1);revision.current=timeline.revision},[timeline.revision,following]);
  const processes=useMemo(()=>bundleMundaneProcesses(timeline.spans,clock),[timeline.spans,clock]);
  const clusters=useMemo(()=>buildGeometry(processes,zoom,clock),[processes,zoom,clock]);
  const reportBootstrap=()=>{if(!onBootstrapDiagnostic)return;const bounds=listHostRef.current?.getBoundingClientRect();onBootstrapDiagnostic({suppliedClusters:clusters.length,viewportWidth:bounds?.width??0,viewportHeight:bounds?.height??0,listLoaded:listLoaded.current,renderedItems:renderedItems.current.size})};
  useLayoutEffect(()=>{const list=listRef.current;if(!list)return;listLoaded.current=true;if(following)list.scrollTop=list.scrollHeight;reportBootstrap()},[clusters,expanded,following]);
  useEffect(()=>{reportBootstrap();const host=listHostRef.current;if(!host||!onBootstrapDiagnostic||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(reportBootstrap);observer.observe(host);return()=>observer.disconnect()},[clusters.length,onBootstrapDiagnostic]);
  const onScroll=(event:React.UIEvent<HTMLDivElement>)=>{const viewport=event.currentTarget;const distance=viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight;const atEnd=distance<=40;if(atEnd){if(rearmRequested.current||following){setFollowing(true);setNewCount(0)}rearmRequested.current=false}else if(distance>40){setFollowing(false);rearmRequested.current=false}};
  const returnToLive=()=>{const viewport=listRef.current;if(!viewport)return;viewport.scrollTop=viewport.scrollHeight;const distance=viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight;if(distance<=40){setFollowing(true);setNewCount(0);rearmRequested.current=false}else rearmRequested.current=true};
  const loadEarlier=async(span:ProcessSpan)=>{if(!span.streamBounds.cursor||loading.has(span.id))return;setLoading((current)=>new Set(current).add(span.id));try{await onLoadEarlier(span)}finally{setLoading((current)=>{const next=new Set(current);next.delete(span.id);return next})}};
  return <section className="timeline-panel"><header className="timeline-header"><div><span className="eyebrow">SESSION</span><h1>{timeline.session.intent}</h1><p>{timeline.session.state} · {new Date(timeline.session.startedAt).toLocaleString()}</p></div><label className="zoom">Compression <input type="range" min="3" max="18" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/><b>{zoom} px/min</b></label></header>
    <div className="timeline-list-host" ref={listHostRef}>
      <div ref={listRef} className="timeline-list" onScroll={onScroll}>{clusters.map((cluster)=>{renderedItems.current.add(cluster.id);return <ClusterRow key={cluster.id} cluster={cluster} expanded={expanded} loading={loading} toggle={(id)=>setExpanded((current)=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})} loadEarlier={(span)=>void loadEarlier(span)}/>})}</div>
    </div>
    {!following&&<button className="return-live" onClick={returnToLive}>↓ Return to live{newCount?` · ${newCount} new`:''}</button>}
  </section>;
}
