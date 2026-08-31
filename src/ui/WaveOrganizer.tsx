import { useEffect, useRef, useState } from 'react';
import { call } from '../bridge/bridge';
import { buildSessionGroups } from './sessionGroups';
import type { SessionSummary } from '../timeline/model';

type Wave = { session_id: string; name?: string; group_id?: string; archived_at?: string; deleted_at?: string };
type Organization = { groups: { id: string; name: string }[]; waves: Wave[] };
export function WaveOrganizer({sessions, selected, onSelect, collapsed, toggle, theme = 'light', toggleTheme = () => {}}: {
  sessions: SessionSummary[]; selected?: string; onSelect: (id?:string, name?:string)=>void;
  collapsed: boolean; toggle: ()=>void; theme?: 'light'|'dark'; toggleTheme?: ()=>void;
}) {
  const [org,setOrg]=useState<Organization>({groups:[],waves:[]});
  const [archive,setArchive]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const [editing,setEditing]=useState<{action:string; sessionId?:string; groupId?:string; name:string}>();
  const [deleting,setDeleting]=useState<string>();
  const [folded,setFolded]=useState<Set<string>>(new Set());
  const [dragging,setDragging]=useState(false);
  const drag=useRef<{id:string;x:number;y:number;active:boolean}|undefined>(undefined);
  const draggedClick=useRef(false);
  useEffect(()=>{
    if(busy)return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try {
        const reply=await call<Organization>('organization.get');
        if(stopped)return;
        if(!reply.ok || !reply.result || !Array.isArray(reply.result.groups) || !Array.isArray(reply.result.waves))
          throw new Error(reply.message??'Wave organization is unavailable. The host and Delegate Wave need the organizer update.');
        setOrg(reply.result);setReady(true);
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Could not load wave organization.');}
      finally{if(!stopped)timer=setTimeout(()=>void refresh(),document.hidden?15_000:5_000)}
    };
    void refresh();return()=>{stopped=true;clearTimeout(timer)};
  },[busy]);
  const change=async(args:Record<string,unknown>)=>{
    setBusy(true);setError('');
    try {const reply=await call<Organization>('organization.change',args);
      if(!reply.ok || !reply.result) throw new Error(reply.code==='TIMEOUT'?'Save status is unknown. Wait for the organizer to refresh before trying again.':reply.message??'Could not save organization.');
      setOrg(reply.result);setEditing(undefined);setDeleting(undefined);
      if(args.sessionId===selected && ['archive','restore','delete'].includes(String(args.action)))onSelect(undefined);
    }catch(e){setError(e instanceof Error?e.message:'Could not save organization.')}finally{setBusy(false)}
  };
  useEffect(()=>{
    const move=(e:PointerEvent)=>{const d=drag.current;if(d&&!d.active&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>5){d.active=true;setDragging(true)}};
    const release=(e:PointerEvent)=>{
      const d=drag.current;drag.current=undefined;setDragging(false);if(!d?.active)return;
      draggedClick.current=true;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-wave-group]');
      if(ready&&!archive&&!busy&&target?.dataset.waveGroup)void change({action:'move',sessionId:d.id,groupId:target.dataset.waveGroup});
    };
    const cancel=()=>{drag.current=undefined;setDragging(false)};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel)};
  },[ready,archive,busy]);
  const info=new Map(org.waves.map(w=>[w.session_id,w]));
  const defaults=buildSessionGroups(sessions);
  const groups=new Map(defaults.map(g=>[g.id,{id:g.id,label:g.label,sessions:[] as SessionSummary[]}]));
  for(const g of org.groups)groups.set(g.id,{id:g.id,label:g.name,sessions:[]});
  for(const s of sessions){const w=info.get(s.id);if(w?.deleted_at || Boolean(w?.archived_at)!==archive)continue;
    const id=w?.group_id??s.originHermesSessionId??`unlinked:${s.id}`;
    groups.get(id)?.sessions.push(s);
  }
  const destination=[...groups.values()];
  const view=destination.filter(g=>g.sessions.length || (!archive && g.id.startsWith('group_')));
  const first=view.flatMap(g=>g.sessions)[0];
  const selectedName=selected ? info.get(selected)?.name : undefined;
  const selectionVisible=view.some(g=>g.sessions.some(s=>s.id===selected));
  useEffect(()=>{if(ready && !selectionVisible && (selected || first))onSelect(first?.id,first?info.get(first.id)?.name:undefined);},[ready,selectionVisible,selected,first?.id]);
  useEffect(()=>{if(selected)onSelect(selected,selectedName);},[selectedName]);
  return <>
    <header className="session-nav-header">
      <button className="sidebar-toggle" aria-label={collapsed?'Expand sessions sidebar':'Collapse sessions sidebar'} onClick={toggle}>☰</button>
      <button className="sidebar-toggle workspace-theme-toggle" aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'} title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'} aria-pressed={theme === 'dark'} onClick={toggleTheme}><span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span></button>
      {!collapsed && <><button className="sidebar-toggle archive-toggle" aria-label={archive?'Return to waves':'Open wave archive'} aria-pressed={archive} onClick={()=>{setArchive(!archive);onSelect(undefined)}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h18v4H3zM5 8v12h14V8M9 12h6"/></svg>
      </button><button className="sidebar-toggle" aria-label="Create wave group" disabled={!ready||busy} onClick={()=>setEditing({action:'group.create',name:''})}>+</button></>}
    </header>
    {!collapsed && <div className={`session-groups wave-organizer${dragging?' dragging-wave':''}`} aria-busy={busy}>
      {archive && <h2>Archived waves</h2>}
      {error && <p role="alert">{error}</p>}
      {editing && <form onSubmit={e=>{e.preventDefault();void change(editing)}}><input aria-label="Name" autoFocus maxLength={240} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/><button disabled={busy||!editing.name.trim()}>Save</button><button type="button" onClick={()=>setEditing(undefined)}>Cancel</button></form>}
      {deleting && <div role="alertdialog" aria-label="Delete archived wave"><p>Delete this wave from the organizer? It cannot be restored here. Execution audit records and repository files are retained.</p><button disabled={busy} onClick={()=>void change({action:'delete',sessionId:deleting,confirm:true})}>Delete wave</button><button onClick={()=>setDeleting(undefined)}>Cancel</button></div>}
      {!view.length && <p>{archive?'No archived waves.':'No waves yet.'}</p>}
      {view.map(g=><section className="conversation-group" key={g.id} data-wave-group={g.id}>
        <div className="organization-group-header"><button className="conversation-toggle" aria-expanded={!folded.has(g.id)} onClick={()=>setFolded(old=>{const n=new Set(old);n.has(g.id)?n.delete(g.id):n.add(g.id);return n})}><b>{g.label}</b><small>{g.sessions.length} {g.sessions.length===1?'wave':'waves'}</small></button>
        <button className="organization-edit" aria-label={`Rename group ${g.label}`} disabled={!ready||busy} onClick={()=>setEditing({action:'group.rename',groupId:g.id,name:g.label})}>✎</button>
        {g.id.startsWith('group_') && <button className="organization-edit" aria-label={`Remove group ${g.label}`} disabled={!ready||busy} onClick={()=>void change({action:'group.delete',groupId:g.id})}>×</button>}</div>
        {dragging && !g.sessions.length && <p className="group-drop-hint">Drop a wave here</p>}
        {!folded.has(g.id) && g.sessions.map(s=>{const w=info.get(s.id),label=w?.name||s.intent;return <div className="organized-wave" key={s.id}>
          <button onDragStart={e=>e.preventDefault()}
            onPointerDown={e=>{draggedClick.current=false;if(ready&&!archive&&!busy&&e.button===0)drag.current={id:s.id,x:e.clientX,y:e.clientY,active:false}}}
            className={`session-link${selected===s.id?' selected':''}`} onClick={()=>{if(!draggedClick.current)onSelect(s.id,label)}} aria-label={`${label}, ${s.state}`}><i className={`session-dot ${s.state}`}/><span><b>{label}</b><small className="session-meta">{new Date(s.startedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></span>{s.state!=='settled'&&<em className={`session-consequential state-${s.state}`}>{s.state}</em>}</button>
          <details className="wave-actions"><summary aria-label={`Actions for ${label}`}>⋯</summary><div>
            <button disabled={!ready||busy} onClick={()=>setEditing({action:'rename',sessionId:s.id,name:label})}>Rename</button>
            {archive?<><button disabled={busy} onClick={()=>void change({action:'restore',sessionId:s.id})}>Restore</button><button disabled={busy} onClick={()=>setDeleting(s.id)}>Delete</button></>:<button disabled={!ready||busy||s.state!=='settled'} onClick={()=>void change({action:'archive',sessionId:s.id})}>Archive</button>}
            <label>Move to group<select aria-label={`Move ${label} to group`} disabled={!ready||busy} value={w?.group_id??''} onChange={e=>void change({action:'move',sessionId:s.id,groupId:e.target.value||null})}><option value="">Original Hermes group</option>{destination.filter(d=>!d.id.startsWith('unlinked:')).map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          </div></details>
        </div>})}
      </section>)}
    </div>}
  </>;
}
