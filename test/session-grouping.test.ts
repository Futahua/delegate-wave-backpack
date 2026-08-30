import { describe,expect,it } from 'vitest';
import { buildSessionSections } from '../src/ui/App';
import type { SessionSummary } from '../src/timeline/model';

const session=(id:string,hermes:string,intent:string,startedAt:string):SessionSummary=>({id,originHermesSessionId:hermes,intent,startedAt,updatedAt:startedAt,mode:'MANUAL',state:'settled'});
describe('session sidebar grouping',()=>{it('keeps Hermes conversation identity within date sections',()=>{const sections=buildSessionSections([session('a','h-routing','Routing investigation','2026-08-30T10:00:00Z'),session('b','h-routing','Fresh routing dogfood','2026-08-30T11:00:00Z'),session('c','h-design','Backpack redesign','2026-08-30T12:00:00Z')],new Date('2026-08-30T13:00:00Z'));expect(sections).toHaveLength(1);expect(sections[0]!.conversations).toHaveLength(2);expect(sections[0]!.conversations.find((group)=>group.id==='h-routing')?.sessions.map((item)=>item.id)).toEqual(['b','a']);expect(sections[0]!.conversations.map((group)=>group.label)).not.toContain('h-routing')})});
