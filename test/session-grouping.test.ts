import { describe,expect,it } from 'vitest';
import { buildSessionGroups } from '../src/ui/App';
import type { SessionSummary } from '../src/timeline/model';

const session=(id:string,hermes:string,intent:string,startedAt:string):SessionSummary=>({id,originHermesSessionId:hermes,intent,startedAt,updatedAt:startedAt,mode:'MANUAL',state:'settled'});
describe('session sidebar grouping',()=>{it('keeps one Hermes group when its waves cross midnight',()=>{const groups=buildSessionGroups([session('before','h-routing','Create only one root-level file','2026-08-30T23:59:00Z'),session('after','h-routing','Investigate routing precedence','2026-08-31T00:01:00Z'),session('design','h-design','Backpack redesign','2026-08-31T00:02:00Z')]);expect(groups).toHaveLength(2);const routing=groups.find((group)=>group.id==='h-routing');expect(routing?.sessions.map((item)=>item.id)).toEqual(['after','before']);expect(routing?.label).toMatch(/^Hermes conversation · /);expect(routing?.label).not.toContain('Create only one');expect(groups.map((group)=>group.id)).toEqual(['h-design','h-routing'])})});
