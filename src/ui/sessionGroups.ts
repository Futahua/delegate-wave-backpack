import type {SessionSummary} from '../timeline/model';

export interface SessionConversationGroup {
  id:string;
  label:string;
  sessions:SessionSummary[];
}
export function buildSessionGroups(sessions:SessionSummary[]):SessionConversationGroup[] {
  const conversations=new Map<string,SessionSummary[]>();
  for(const item of sessions){
    const identity=item.originHermesSessionId??`unlinked:${item.id}`;
    conversations.set(identity,[...(conversations.get(identity)??[]),item]);
  }
  return [...conversations].map(([id,items])=>{
    const sorted=[...items].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
    const newest=sorted[0]!;
    return {id,label:newest.originHermesSessionTitle?.trim()||`Hermes · ${new Date(newest.startedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`,sessions:sorted};
  }).sort((a,b)=>Date.parse(b.sessions[0]!.startedAt)-Date.parse(a.sessions[0]!.startedAt));
}
