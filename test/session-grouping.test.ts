import { describe,expect,it } from 'vitest';
import { buildSessionGroups, normalizeSidebarWidth } from '../src/ui/App';
import type { SessionSummary } from '../src/timeline/model';
const session=(id:string,source:string,startedAt:string):SessionSummary=>({id,source,intent:'Task',startedAt,updatedAt:startedAt,mode:'MANUAL',state:'settled'});
describe('session sidebar grouping',()=>{
 it('groups local conversations across midnight and keeps other sessions independent',()=>{
  const groups=buildSessionGroups([session('before','chatgpt_local','2026-08-30T23:59:00Z'),session('after','chatgpt_local','2026-08-31T00:01:00Z'),session('other','worker','2026-08-31T00:02:00Z')]);
  expect(groups).toHaveLength(2);expect(groups.find(g=>g.id==='chatgpt-local')?.sessions.map(s=>s.id)).toEqual(['after','before']);
 });
 it('uses the source title when supplied',()=>{expect(buildSessionGroups([{...session('wave','worker','2026-08-31T00:02:00Z'),sourceTitle:'Routing investigation'}])[0]?.label).toBe('Routing investigation')});
});
it('clamps persisted sidebar width',()=>{expect(normalizeSidebarWidth(null)).toBe(264);expect(normalizeSidebarWidth('120')).toBe(200);expect(normalizeSidebarWidth('600')).toBe(420);expect(normalizeSidebarWidth('not-a-number')).toBe(264)});
