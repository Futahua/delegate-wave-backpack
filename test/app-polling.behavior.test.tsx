import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const relay = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../src/model/adapter', async (load) => {
  const actual = await load<typeof import('../src/model/adapter')>();
  return { ...actual, read: relay.read };
});
vi.mock('../src/timeline/SessionTimeline', () => ({ SessionTimeline: ({timeline}:{timeline:{revision:string}}) => <div data-testid="timeline">{timeline.revision}</div> }));
import { App, VISIBLE_LIST_POLL, VISIBLE_TIMELINE_POLL } from '../src/ui/App';

const summary = { id:'s1', intent:'Durable autonomous work', mode:'AUTO', state:'live', started_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-01T00:00:01Z' };
const listReply = { ok:true, result:{ sessions:[summary], has_more:false } };
const timelineReply = (revision:string) => ({ ok:true, result:{ revision, session:summary, spans:[] } });
const tick = async (ms=0) => { await act(async()=>{ await vi.advanceTimersByTimeAsync(ms); }); };

describe('App polling mechanics', () => {
  let host:HTMLDivElement, root:Root;
  beforeEach(()=>{ vi.useFakeTimers(); relay.read.mockReset(); host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
  afterEach(()=>{ act(()=>root.unmount()); host.remove(); vi.useRealTimers(); });

  it('never overlaps an index poll while the previous request is unresolved', async () => {
    let release!: (value:typeof listReply)=>void;
    const pending = new Promise<typeof listReply>((resolve)=>{ release=resolve; });
    relay.read.mockImplementation((operation:string)=>operation==='session.list'?pending:new Promise(()=>{}));
    await act(async()=>root.render(<App/>));
    expect(relay.read.mock.calls.filter(([op])=>op==='session.list')).toHaveLength(1);
    await tick(VISIBLE_LIST_POLL*3);
    expect(relay.read.mock.calls.filter(([op])=>op==='session.list')).toHaveLength(1);
    release(listReply); await tick();
    await tick(VISIBLE_LIST_POLL);
    expect(relay.read.mock.calls.filter(([op])=>op==='session.list')).toHaveLength(2);
  });

  it('keeps the last confirmed timeline visible and marks it stale after a poll failure', async () => {
    let timelineReads=0;
    relay.read.mockImplementation(async(operation:string)=>{
      if(operation==='session.list') return listReply;
      timelineReads+=1;
      return timelineReads===1?timelineReply('confirmed-r1'):{ok:false,message:'relay offline'};
    });
    await act(async()=>root.render(<App/>)); await tick();
    expect(host.querySelector('[data-testid="timeline"]')?.textContent).toBe('confirmed-r1');
    await tick(VISIBLE_TIMELINE_POLL);
    expect(host.querySelector('[data-testid="timeline"]')?.textContent).toBe('confirmed-r1');
    expect(host.textContent).toContain('Offline · last confirmed');
    expect(host.textContent).toContain('Offline · showing last confirmed revision');
  });
});
