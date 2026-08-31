// Isolated visual test fixture. No connection to Papers or any operational ledger.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WaveOrganizer} from '../src/ui/WaveOrganizer';
import type {SessionSummary} from '../src/timeline/model';
import '../src/ui/styles.css';
const organization={groups:[{id:'group_personal',name:'Personal work'}],waves:[] as {session_id:string;name?:string;group_id?:string|null;archived_at?:string|null;deleted_at?:string}[]};
window.addEventListener('message',e=>{
 if(e.source!==window||e.data?.type!=='papers:project:delegate-wave')return;
 const {operation,params:p,requestId}=e.data;
 if(operation==='organization.change'){
  if(p.action==='group.create')organization.groups.push({id:`group_${organization.groups.length}`,name:p.name});
  else if(p.action==='group.rename')organization.groups.find(g=>g.id===p.groupId)!.name=p.name;
  else if(p.action==='group.delete'){organization.groups=organization.groups.filter(g=>g.id!==p.groupId);organization.waves.forEach(w=>{if(w.group_id===p.groupId)w.group_id=null})}
  else{let w=organization.waves.find(w=>w.session_id===p.sessionId);if(!w){w={session_id:p.sessionId};organization.waves.push(w)}
   if(p.action==='rename')w.name=p.name;if(p.action==='move')w.group_id=p.groupId;
   if(p.action==='archive')w.archived_at='now';if(p.action==='restore')w.archived_at=null;if(p.action==='delete')w.deleted_at='now';}
 }
 window.postMessage({type:'papers:host:result',requestId,ok:true,delegateWave:{ok:true,result:organization}},window.location.origin);
});
const sessions:SessionSummary[]=[
 {id:'sample1',intent:'Make validator cards compact and readable',mode:'MANUAL',state:'settled',originHermesSessionId:'h1',originHermesSessionTitle:'Backpack improvements',startedAt:'2026-08-31T10:00:00Z',updatedAt:'2026-08-31T10:01:00Z'},
 {id:'sample2',intent:'Check the routing tests',mode:'AUTO',state:'live',originHermesSessionId:'h1',originHermesSessionTitle:'Backpack improvements',startedAt:'2026-08-31T10:02:00Z',updatedAt:'2026-08-31T10:02:00Z'}];
function Fixture(){const [collapsed,setCollapsed]=useState(false),[selected,setSelected]=useState<string>();return <div className="session-app" style={{display:'grid',gridTemplateColumns:collapsed?'48px 1fr':'300px 1fr'}}><aside className={`session-sidebar${collapsed?' collapsed':''}`}><WaveOrganizer sessions={sessions} selected={selected} onSelect={setSelected} collapsed={collapsed} toggle={()=>setCollapsed(!collapsed)}/></aside><main style={{padding:32}}><h2>Isolated organizer preview</h2><p>Sample data only. No live sessions or operational records.</p></main></div>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
