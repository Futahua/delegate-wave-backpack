import { isRecord } from '../model/normalize';

export type StreamKind = 'narration'|'read'|'search'|'edit'|'command'|'agent'|'question'|'todo'|'web'|'other';
export interface StreamItem { id:string; kind:StreamKind; lifecycle:'started'|'updated'|'completed'|'failed'; title:string; detail?:string; occurredAt:string; authority:'activity'|'evidence' }
export interface StreamBounds { complete:boolean; hasEarlier:boolean; cursor?:string }
export interface ProcessSpan { id:string; parentId?:string; actor:'manager'|'worker'|'validator'; label:string; state:'live'|'waiting'|'completed'|'failed'|'cancelled'; startedAt:string; finishedAt?:string; stream:StreamItem[]; streamBounds:StreamBounds }
export interface ProcessBundle extends ProcessSpan { bundle:true; processes:ProcessSpan[] }
export type TimelineProcess = ProcessSpan | ProcessBundle;
export interface SessionSummary { id:string; rootJobId?:string; intent:string; mode:string; state:'live'|'waiting'|'settled'; originHermesSessionId?:string; startedAt:string; settledAt?:string; updatedAt:string }
export interface SessionPage { sessions:SessionSummary[]; hasMore:boolean; nextCursor?:string }
export interface SessionTimeline { session:SessionSummary; spans:ProcessSpan[]; revision:string; streamPageFor?:string }
const str=(r:Record<string,unknown>,k:string):string|undefined=>typeof r[k]==='string'?r[k] as string:undefined;

function session(raw: unknown): SessionSummary | undefined {
  if (!isRecord(raw)) return;
  const id=str(raw,'id'),intent=str(raw,'intent'),state=str(raw,'state'),startedAt=str(raw,'started_at');
  if(!id||!intent||!startedAt||!['live','waiting','settled'].includes(state??''))return;
  return { id,intent,mode:str(raw,'mode')??'UNKNOWN',state:state as SessionSummary['state'],startedAt,
    updatedAt:str(raw,'updated_at')??startedAt,rootJobId:str(raw,'root_job_id'),
    originHermesSessionId:str(raw,'origin_hermes_session_id'),settledAt:str(raw,'settled_at') };
}

export function sessionPageFromRelay(value:unknown):SessionPage|undefined {
  if(!isRecord(value)||!Array.isArray(value.sessions))return;
  return { sessions:value.sessions.flatMap((raw)=>{const item=session(raw);return item?[item]:[]}),
    hasMore:value.has_more===true,nextCursor:str(value,'next_cursor') };
}

export function timelineFromRelay(value:unknown):SessionTimeline|undefined {
  if(!isRecord(value)||!Array.isArray(value.spans)||typeof value.revision!=='string')return;
  const summary=session(value.session);if(!summary)return;
  const spans=value.spans.flatMap((entry):ProcessSpan[]=>{
    if(!isRecord(entry)||typeof entry.id!=='string'||typeof entry.actor!=='string'||typeof entry.label!=='string'||typeof entry.state!=='string'||typeof entry.started_at!=='string')return[];
    const stream=Array.isArray(entry.stream)?entry.stream.flatMap((item):StreamItem[]=>{if(!isRecord(item)||typeof item.id!=='string'||typeof item.kind!=='string'||typeof item.lifecycle!=='string'||typeof item.title!=='string')return[];return[{id:item.id,kind:item.kind as StreamKind,lifecycle:item.lifecycle as StreamItem['lifecycle'],title:item.title,detail:str(item,'detail'),occurredAt:str(item,'occurred_at')??entry.started_at as string,authority:item.authority==='evidence'?'evidence':'activity'}]}):[];
    const bounds=isRecord(entry.stream_bounds)?entry.stream_bounds:{};
    return [{id:entry.id,parentId:str(entry,'parent_id'),actor:entry.actor as ProcessSpan['actor'],label:entry.label,state:entry.state as ProcessSpan['state'],startedAt:entry.started_at,finishedAt:str(entry,'finished_at'),stream,streamBounds:{complete:bounds.complete===true,hasEarlier:bounds.has_earlier===true,cursor:str(bounds,'cursor')}}];
  });
  return {session:summary,spans,revision:value.revision,streamPageFor:str(value,'stream_page_for')};
}

export function mergeStreamPage(current:SessionTimeline,page:SessionTimeline):SessionTimeline {
  const target=page.streamPageFor, incoming=page.spans.find((span)=>span.id===target);
  if(!target||!incoming)return current;
  return {...current,revision:page.revision,spans:current.spans.map((span)=>span.id===target?{...span,stream:mergeStreamItems(incoming.stream,span.stream),streamBounds:incoming.streamBounds}:span)};
}

const lifecycleRank:Record<StreamItem['lifecycle'],number>={started:0,updated:1,completed:2,failed:3};
function mergeStreamItems(older:StreamItem[],newer:StreamItem[]):StreamItem[]{const merged=new Map<string,StreamItem>();for(const item of older)merged.set(item.id,item);for(const item of newer){const prior=merged.get(item.id);if(!prior||lifecycleRank[item.lifecycle]>=lifecycleRank[prior.lifecycle])merged.set(item.id,item)}return[...merged.values()]}

/** Refresh the newest server page without discarding earlier pages already disclosed locally. */
export function mergeTimelineRefresh(current:SessionTimeline,next:SessionTimeline):SessionTimeline {
  if(current.session.id!==next.session.id)return next;
  const existing=new Map(current.spans.map((span)=>[span.id,span]));
  return {...next,spans:next.spans.map((span)=>{const prior=existing.get(span.id);return prior?{...span,stream:mergeStreamItems(prior.stream,span.stream),streamBounds:prior.streamBounds}:span})};
}

function duration(span:ProcessSpan,now:number){return Math.max(0,(span.finishedAt?Date.parse(span.finishedAt):now)-Date.parse(span.startedAt))}
export function isMundaneShort(span:ProcessSpan,now=Date.now()):boolean{return span.actor==='worker'&&span.state==='completed'&&span.streamBounds.complete===true&&duration(span,now)<=60_000&&span.stream.length>0&&span.stream.every((item)=>item.authority!=='evidence'&&item.lifecycle!=='failed'&&!['question','narration','agent'].includes(item.kind))}
function workerClass(span:ProcessSpan):'exploration'|'implementation'|'revision'|'other'{if(/^Exploration worker$/i.test(span.label))return'exploration';if(/^Implementation worker$/i.test(span.label))return'implementation';if(/^Revision worker\b/i.test(span.label))return'revision';return'other'}
export function bundleMundaneProcesses(spans:ProcessSpan[],now=Date.now()):TimelineProcess[]{const sorted=[...spans].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));const out:TimelineProcess[]=[];let pending:ProcessSpan[]=[];const flush=()=>{if(pending.length>=2){const first=pending[0]!,last=pending.at(-1)!;out.push({...first,id:`bundle:${pending.map((item)=>item.id).join('+')}`,label:`${pending.length} short worker processes`,startedAt:first.startedAt,finishedAt:last.finishedAt,stream:pending.flatMap((item)=>item.stream),streamBounds:{complete:true,hasEarlier:false},bundle:true,processes:pending})}else out.push(...pending);pending=[]};for(const span of sorted){const previous=pending.at(-1),previousEnd=previous?.finishedAt?Date.parse(previous.finishedAt):NaN,start=Date.parse(span.startedAt),semanticClass=workerClass(span);const compatible=!previous?semanticClass!=='other':semanticClass!=='other'&&start>=previousEnd&&start-previousEnd<=30_000&&workerClass(previous)===semanticClass;if(isMundaneShort(span,now)&&compatible)pending.push(span);else{flush();if(isMundaneShort(span,now)&&semanticClass!=='other')pending=[span];else out.push(span)}}flush();return out}

export interface PositionedProcess { process:TimelineProcess; lane:number; top:number; height:number }
export interface ConcurrencyCluster { id:string; start:number; end:number; top:number; gapBefore:number; laneCount:number; height:number; processes:PositionedProcess[] }
export function buildGeometry(spans:TimelineProcess[],pixelsPerMinute:number,now=Date.now()):ConcurrencyCluster[]{if(!spans.length)return[];const sorted=[...spans].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));const sessionStart=Date.parse(sorted[0]!.startedAt);const raw:Array<{items:TimelineProcess[];start:number;end:number}>=[];for(const process of sorted){const start=Date.parse(process.startedAt),end=process.finishedAt?Date.parse(process.finishedAt):now,last=raw.at(-1);if(!last||start>=last.end)raw.push({items:[process],start,end});else{last.items.push(process);last.end=Math.max(last.end,end)}}let previousEnd=sessionStart;return raw.map((cluster)=>{const laneEnds:number[]=[];const positioned=cluster.items.map((process)=>{const start=Date.parse(process.startedAt),end=process.finishedAt?Date.parse(process.finishedAt):now;let lane=laneEnds.findIndex((value)=>value<=start);if(lane<0){lane=laneEnds.length;laneEnds.push(end)}else laneEnds[lane]=end;return{process,lane,top:(start-cluster.start)/60_000*pixelsPerMinute,height:Math.max(72,(Math.max(end,start)-start)/60_000*pixelsPerMinute)}});const gapBefore=Math.max(0,(cluster.start-previousEnd)/60_000*pixelsPerMinute);previousEnd=cluster.end;const proportional=(cluster.end-cluster.start)/60_000*pixelsPerMinute;const contentBottom=Math.max(0,...positioned.map((item)=>item.top+item.height));return{id:`cluster:${cluster.items.map((item)=>item.id).join(':')}`,start:cluster.start,end:cluster.end,top:(cluster.start-sessionStart)/60_000*pixelsPerMinute,gapBefore,laneCount:Math.max(1,laneEnds.length),height:Math.max(88,proportional,contentBottom+8),processes:positioned}})}
