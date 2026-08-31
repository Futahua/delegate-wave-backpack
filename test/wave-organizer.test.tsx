import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionSummary } from '../src/timeline/model';
const bridge=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../src/bridge/bridge',()=>bridge);
import { WaveOrganizer } from '../src/ui/WaveOrganizer';

let host:HTMLDivElement,root:Root;
let data:{groups:{id:string;name:string}[];waves:{session_id:string;name?:string;group_id?:string|null;archived_at?:string|null;deleted_at?:string}[]};
const sessions:SessionSummary[]=[{id:'s1',intent:'Finished task',mode:'MANUAL',state:'settled',originHermesSessionId:'h1',originHermesSessionTitle:'Hermes group',startedAt:'2026-08-31T10:00:00Z',updatedAt:'2026-08-31T10:01:00Z'},
 {id:'s2',intent:'Active task',mode:'AUTO',state:'live',originHermesSessionId:'h1',startedAt:'2026-08-31T10:02:00Z',updatedAt:'2026-08-31T10:02:00Z'}];
const render=async(collapsed=false)=>{await act(async()=>root.render(<WaveOrganizer sessions={sessions} onSelect={()=>{}} collapsed={collapsed} toggle={()=>{}}/>))};
const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click())};
const named=async(label:string)=>{await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())};
beforeEach(()=>{
 vi.useFakeTimers();data={groups:[],waves:[]};bridge.call.mockReset();
 bridge.call.mockImplementation(async(op:string,args:Record<string,any>={})=>{
  if(op==='organization.change'){
   if(args.action==='group.create')data.groups.push({id:'group_1',name:args.name});
   else if(args.action==='group.rename')data.groups.find(g=>g.id===args.groupId)!.name=args.name;
   else {
    let w=data.waves.find(w=>w.session_id===args.sessionId);if(!w){w={session_id:args.sessionId};data.waves.push(w)}
    if(args.action==='archive')w.archived_at='now';
    if(args.action==='restore')w.archived_at=null;
    if(args.action==='delete')w.deleted_at='now';
    if(args.action==='rename')w.name=args.name;
    if(args.action==='move')w.group_id=args.groupId;
   }
  }
  return {ok:true,result:structuredClone(data)};
 });
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()});

it('places archive beside hamburger only when expanded; live wave cannot archive',async()=>{
 await render();
  const header=host.querySelector('header')!;
  expect(header.children[0]?.getAttribute('aria-label')).toBe('Collapse sessions sidebar');
  expect(header.children[1]?.getAttribute('aria-label')).toBe('Use dark mode');
  expect(header.children[2]?.getAttribute('aria-label')).toBe('Open wave archive');
 const active=host.querySelector('[aria-label="Active task, live"]')!.parentElement!;
 expect([...active.querySelectorAll('button')].find(b=>b.textContent==='Archive')!.disabled).toBe(true);
 await render(true);expect(host.querySelector('[aria-label="Open wave archive"]')).toBeNull();
});

it('archives, restores and deletes only after explicit confirmation; survives remount',async()=>{
 await render();await click('Archive');
 expect(host.querySelector('[aria-label="Finished task, settled"]')).toBeNull();
 await named('Open wave archive');expect(host.querySelector('[aria-label="Finished task, settled"]')).toBeTruthy();
 await click('Restore');expect(host.querySelector('[aria-label="Finished task, settled"]')).toBeNull();
 await named('Return to waves');await click('Archive');await named('Open wave archive');
 await click('Delete');expect(data.waves[0]?.deleted_at).toBeUndefined();
 expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('audit records');
 await click('Delete wave');expect(data.waves[0]?.deleted_at).toBe('now');
 act(()=>root.unmount());root=createRoot(host);await render();await named('Open wave archive');
 expect(host.querySelector('[aria-label="Finished task, settled"]')).toBeNull();
});

it('supports group creation, wave rename and keyboard move without changing task intent',async()=>{
 await render();await named('Create wave group');
 const input=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Personal');input.dispatchEvent(new Event('input',{bubbles:true}))});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(data.groups[0]?.name).toBe('Personal');
 await click('Rename');
 const rename=host.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(rename,'My task');rename.dispatchEvent(new Event('input',{bubbles:true}))});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(sessions[0]!.intent).toBe('Finished task');
 const select=host.querySelector<HTMLSelectElement>('[aria-label="Move My task to group"]')!;
 await act(async()=>{select.value='group_1';select.dispatchEvent(new Event('change',{bubbles:true}))});
 expect(data.waves[0]?.group_id).toBe('group_1');
 expect(host.querySelector('[aria-label="My task, settled"]')!.closest('section')?.textContent).toContain('Personal');
});

it('fails visibly when the host is old and does not enable organization writes',async()=>{
 bridge.call.mockResolvedValue({ok:false,message:'Update required'});await render();
 expect(host.querySelector('[role="alert"]')?.textContent).toBe('Update required');
 expect(host.querySelector<HTMLButtonElement>('[aria-label="Create wave group"]')!.disabled).toBe(true);
});

it('moves a dragged wave through the same durable action as the keyboard selector',async()=>{
 data.groups.push({id:'group_1',name:'Personal'});await render();
 const source=host.querySelector('[aria-label="Finished task, settled"]')!;
 const target=host.querySelector('[aria-label="Rename group Personal"]')!.closest('section')!;
 const original=document.elementFromPoint;
 document.elementFromPoint=()=>target;
 for(const [type,y] of [['pointerdown',10],['pointermove',30],['pointerup',30]] as const){
  const event=new Event(type,{bubbles:true});Object.defineProperties(event,{button:{value:0},clientX:{value:10},clientY:{value:y},pointerId:{value:1}});
  await act(async()=>source.dispatchEvent(event));
 }
 document.elementFromPoint=original;
 expect(data.waves[0]?.group_id).toBe('group_1');
});
