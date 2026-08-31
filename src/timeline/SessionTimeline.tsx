import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PatchDiff } from "@pierre/diffs/react";
import {
  BookOpen,
  Bot,
  CircleAlert,
  FilePenLine,
  Search,
  Terminal,
  Waypoints,
} from "lucide-react";
import {
  buildFeedGroups,
  type ProcessSpan,
  type SessionTimeline as Timeline,
  type StreamItem,
} from "./model";
export interface TimelineBootstrapDiagnostic {
  suppliedClusters: number;
  viewportWidth: number;
  viewportHeight: number;
  listLoaded: boolean;
  renderedItems: number;
}
export const TEXT_RENDER_PACE_MS = 16;
const step = (n: number) =>
  n <= 12 ? 2 : n <= 48 ? 4 : n <= 96 ? 8 : Math.min(256, Math.ceil(n / 4));
export function nextPacedText(t: string, s: number) {
  const e = Math.min(t.length, s + step(t.length - s)),
    m = Math.min(t.length, e + 8);
  for (let i = e; i < m; i++)
    if (/[\s.,!?;:)\]]/.test(t[i] ?? "")) return t.slice(0, i + 1);
  return t.slice(0, e);
}
function usePacedText(value: string, active: boolean) {
  const [shown, setShown] = useState(() => active ? "" : value),
    ref = useRef(active ? "" : value),
    target = useRef(value),
    frame = useRef<number | undefined>(undefined);
  ref.current = shown;
  useEffect(() => {
    target.current = value;
    const sync = (v: string) => {
      ref.current = v;
      setShown(v);
    };
    if (!active || !value.startsWith(ref.current)) {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      sync(value);
      return;
    }
    let position = ref.current.length;
    const reveal = () => {
      const v = target.current;
      if (!active || !v.startsWith(ref.current)) {
        sync(v);
        return;
      }
      position = Math.min(v.length, position + Math.max(1, Math.ceil((v.length - position) / 10)));
      sync(v.slice(0, position));
      if (position < v.length) frame.current = requestAnimationFrame(reveal);
      else frame.current = undefined;
    };
    frame.current = requestAnimationFrame(reveal);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [value, active]);
  return shown;
}
const compact = (v = "") =>
  v
    .replace(/<[^>]+>/g, " ")
    .replace(/["'`]/g, "")
    .trim()
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) ?? v;
const target = (i: StreamItem) => {
  const x = i.tool?.input;
  return (
    x?.filePath ??
    x?.file_path ??
    x?.path ??
    x?.pattern ??
    x?.query ??
    x?.description
  );
};
export function semanticToolLabel(i: StreamItem) {
  const t = target(i);
  if (i.kind === "read")
    return `Read ${compact(t ?? i.title.replace(/^Read\s+/i, ""))}`;
  if (i.kind === "search")
    return `Search ${t ?? i.title.replace(/^(Search|Grep|Glob)\s+/i, "")}`;
  if (i.kind === "edit")
    return `Edit ${compact(t ?? i.title.replace(/^(Edit|Write)\s+/i, ""))}`;
  if (i.kind === "command")
    return (
      i.tool?.input?.command ??
      i.title.replace(/^(Bash|Command|Run)\s*[:·-]?\s*/i, "")
    );
  if (i.kind === "todo") return "Update tasks";
  if (i.kind === "agent") return `Delegate ${t ?? i.title}`;
  return i.title;
}
const elapsed = (s: ProcessSpan, now = Date.now()) => {
  const ms = Math.max(
    0,
    (s.finishedAt ? Date.parse(s.finishedAt) : now) - Date.parse(s.startedAt),
  );
  return ms < 60000
    ? `${Math.max(1, Math.round(ms / 1000))}s`
    : `${Math.floor(ms / 60000)}m ${String(Math.round(ms / 1000) % 60).padStart(2, "0")}s`;
};
const last = (a: StreamItem[], p: (i: StreamItem) => boolean) =>
  [...a].reverse().find(p);
const summaryItem = (s: ProcessSpan) =>
    last(s.stream, (x) => x.lifecycle === "failed") ??
    last(s.stream, (x) => x.kind === "question") ??
    last(s.stream, (x) => x.authority === "evidence") ??
    last(s.stream, (x) => x.kind === "narration") ??
    s.stream.at(-1);
export const processSummary = (s: ProcessSpan) => {
  const i = summaryItem(s);
  return i
    ? i.kind === "narration"
      ? (i.text ?? i.title)
      : semanticToolLabel(i)
    : "Recorded work";
};
export const processPreview = (s: ProcessSpan) => {
  const summary = processSummary(s).trim();
  return summary.split(/\n\s*\n/, 1)[0]?.replace(/\s*\n\s*/g, " ") ?? summary;
};
function Narration({ item, live }: { item: StreamItem; live: boolean }) {
  const text = usePacedText(
    item.text ?? item.title,
    live && item.lifecycle !== "completed",
  );
  return (
    <div className={`agent-prose${live && item.lifecycle !== "completed" ? " active-narration" : ""}`} data-testid={`narration:${item.id}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {item.truncated && <small>Public text truncated.</small>}
    </div>
  );
}
const running = (i: StreamItem) =>
  i.lifecycle === "started" || i.lifecycle === "updated";
function ActionLabel({ children }: { children: string }) {
  return <>{children.split(/\b(Read|Search|Searched|Edit|Edited|Run|Ran|Update|Updated)\b/g).map((part, index) => /^(Read|Search|Searched|Edit|Edited|Run|Ran|Update|Updated)$/.test(part) ? <strong key={index}>{part}</strong> : part)}</>;
}
function CompactPreview({ span }: { span: ProcessSpan }) {
  const item = summaryItem(span);
  const preview = processPreview(span);
  return item && item.kind !== "narration" ? (
    <ActionLabel>{preview}</ActionLabel>
  ) : (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
  );
}
function Tool({
  item,
  icon,
  children,
}: {
  item: StreamItem;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  const failed = item.lifecycle === "failed" || !!item.tool?.error;
  return (
    <details
      className={`agent-tool tool-${item.kind} lifecycle-${item.lifecycle}`}
    >
      <summary>
        <span className="agent-tool-icon">
          {failed ? <CircleAlert /> : icon}
        </span>
        <span
          className={
            running(item) ? "agent-tool-title running" : "agent-tool-title"
          }
        >
          <ActionLabel>{semanticToolLabel(item)}</ActionLabel>
        </span>
        {running(item) && <small>running</small>}
        {failed && <small className="tool-failed">failed</small>}
      </summary>
      {children}
    </details>
  );
}
function Item({ item, live }: { item: StreamItem; live: boolean }) {
  if (item.kind === "narration") return <Narration item={item} live={live} />;
  const body = item.tool?.error ?? item.tool?.output ?? item.detail;
  if (item.kind === "edit") {
    const diff = item.tool?.metadata?.diff;
    return (
      <Tool item={item} icon={<FilePenLine />}>
        {diff ? (
          <div className="file-diff">
            <PatchDiff patch={diff} disableWorkerPool />
          </div>
        ) : (
          body && <pre>{body}</pre>
        )}
      </Tool>
    );
  }
  const icon =
    item.kind === "read" ? (
      <BookOpen />
    ) : item.kind === "search" || item.kind === "web" ? (
      <Search />
    ) : item.kind === "command" ? (
      <Terminal />
    ) : item.kind === "agent" ? (
      <Bot />
    ) : (
      <Waypoints />
    );
  return (
    <Tool item={item} icon={icon}>
      {body && (
        <pre
          className={
            item.kind === "command" ? "terminal-output" : "technical-detail"
          }
        >
          {body}
        </pre>
      )}
    </Tool>
  );
}
const routine = (i: StreamItem) =>
  !running(i) &&
  i.lifecycle !== "failed" &&
  i.authority !== "evidence" &&
  ["read", "search", "command", "todo", "web", "other"].includes(i.kind);
type Part =
  { type: "item"; item: StreamItem } | { type: "group"; items: StreamItem[] };
export function buildTurnParts(items: StreamItem[]): Part[] {
  const out: Part[] = [];
  let p: StreamItem[] = [];
  const flush = () => {
    if (p.length > 1) out.push({ type: "group", items: p });
    else p.forEach((item) => out.push({ type: "item", item }));
    p = [];
  };
  for (const i of items)
    routine(i) ? p.push(i) : (flush(), out.push({ type: "item", item: i }));
  flush();
  return out;
}
function groupLabel(a: StreamItem[]) {
  const n = { read: 0, search: 0, command: 0, other: 0 };
  a.forEach((i) =>
    i.kind === "read"
      ? n.read++
      : i.kind === "search" || i.kind === "web"
        ? n.search++
        : i.kind === "command"
          ? n.command++
          : n.other++,
  );
  return [
    [n.read, `Read ${n.read} files`],
    [n.search, `Searched code ${n.search} times`],
    [n.command, `Ran ${n.command} commands`],
    [n.other, `${n.other} other actions`],
  ]
    .filter((x) => x[0])
    .map((x) => x[1])
    .join(" · ");
}
function Stream({
  span,
  loading,
  loadEarlier,
}: {
  span: ProcessSpan;
  loading: boolean;
  loadEarlier: () => void;
}) {
  return (
    <div className="agent-turn-stream" data-testid={`stream:${span.id}`}>
      {span.streamBounds.hasEarlier && (
        <button
          className="load-earlier"
          disabled={loading}
          onClick={loadEarlier}
        >
          {loading ? "Loading…" : "Load earlier activity"}
        </button>
      )}
      {buildTurnParts(span.stream).map((p, i) =>
        p.type === "group" ? (
          <details className="tool-group" key={`g${i}`}>
            <summary>
              <Waypoints />
              <span><ActionLabel>{groupLabel(p.items)}</ActionLabel></span>
              <small>Show actions</small>
            </summary>
            <div>
              {p.items.map((x) => (
                <Item key={x.id} item={x} live={false} />
              ))}
            </div>
          </details>
        ) : (
          <Item key={p.item.id} item={p.item} live={span.state === "live"} />
        ),
      )}
      {!span.stream.length && (
        <div className="truthful-working">
          {span.state === "live"
            ? "Working…"
            : "No public stream was recorded."}
        </div>
      )}
    </div>
  );
}
function Card({
  span,
  lane,
  open,
  toggle,
  loading,
  load,
}: {
  span: ProcessSpan;
  lane: number;
  open: boolean;
  toggle: () => void;
  loading: boolean;
  load: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const [processFollowing, setProcessFollowing] = useState(true);
  const attention =
    span.state === "waiting" || span.stream.some((i) => i.kind === "question");
  const consequential = span.state === "live" || span.state === "failed" || attention;
  useLayoutEffect(() => {
    if (!open || !viewport.current) return;
    const node = viewport.current;
    node.scrollTop = processFollowing ? node.scrollHeight : savedScrollTop.current;
  }, [open, span.stream.length, processFollowing]);
  const returnToProcessLive = () => {
    const node = viewport.current;
    if (node) node.scrollTop = node.scrollHeight;
    savedScrollTop.current = node?.scrollTop ?? 0;
    setProcessFollowing(true);
  };
  return (
    <article
      className={`process-card actor-${span.actor} state-${span.state}${open ? " expanded" : ""}`}
      data-testid={`process:${span.id}`}
      style={{ gridColumn: open ? "1 / -1" : lane + 1 }}
    >
      <button
        className="process-header"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${span.actor}, ${span.label}, ${span.state}, started ${new Date(span.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${span.state === "live" ? "" : `, duration ${elapsed(span)}`}`}
      >
        <span className="role-chip">{span.actor}</span>
        <b>
          {span.label.replace(/^(Manager|Worker|Validation)\s*[·:]?\s*/i, "") ||
            span.label}
        </b>
        {consequential && (
          <span className="consequential-state">
            {span.state === "live" ? "Live" : span.state === "failed" ? "Failed" : "Needs input"}
          </span>
        )}
        <span className="process-elapsed" aria-label={`Elapsed ${elapsed(span)}`}>
          {elapsed(span)}
        </span>
      </button>
      {attention && !open && (
        <div className="attention-summary">
          <b>Needs input</b>
          <span>Waiting for Hermes</span>
        </div>
      )}
      {open ? (
        <div
          className="process-scroll-viewport"
          ref={viewport}
          data-testid={`process-scroll:${span.id}`}
          onScroll={(event) => {
            const node = event.currentTarget;
            savedScrollTop.current = node.scrollTop;
            setProcessFollowing(node.scrollHeight - node.scrollTop - node.clientHeight <= 40);
          }}
        >
          <Stream span={span} loading={loading} loadEarlier={load} />
        </div>
      ) : (
        <div className="compact-summary markdown-preview">
          <CompactPreview span={span} />
        </div>
      )}
      {open && span.state === "live" && !processFollowing && (
        <button className="process-return-live" onClick={returnToProcessLive}>
          ↓ Return to live
        </button>
      )}
    </article>
  );
}
function Request({ text, close }: { text: string; close: () => void }) {
  return (
    <div
      className="request-sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="request-sheet" role="dialog" aria-modal="true">
        <header>
          <b>Session request</b>
          <button onClick={close}>Close</button>
        </header>
        <p>{text}</p>
      </section>
    </div>
  );
}
export function SessionTimeline({
  timeline,
  onLoadEarlier,
  onBootstrapDiagnostic,
}: {
  timeline: Timeline;
  onLoadEarlier: (s: ProcessSpan) => Promise<void>;
  onBootstrapDiagnostic?: (d: TimelineBootstrapDiagnostic) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(
      () =>
        new Set(
          timeline.spans
            .filter((s) => s.state === "live" || s.state === "waiting")
            .map((s) => s.id),
        ),
    ),
    [following, setFollowing] = useState(true),
    [updates, setUpdates] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [loading, setLoading] = useState<Set<string>>(new Set()),
    [request, setRequest] = useState(false),
    [scale, setScale] = useState(() => {
      const n = Number(localStorage.getItem("delegate-wave.feed-scale"));
      return Number.isFinite(n) ? Math.min(1.5, Math.max(0.8, n)) : 1;
    });
  const list = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null),
    rev = useRef(timeline.revision),
    sessionId = useRef(timeline.session.id);
  useEffect(() => {
    if (sessionId.current === timeline.session.id) return;
    sessionId.current = timeline.session.id;
    setOpen(new Set(timeline.spans.filter((s) => s.state === "live" || s.state === "waiting").map((s) => s.id)));
  }, [timeline.session.id, timeline.spans]);
  useEffect(
    () => localStorage.setItem("delegate-wave.feed-scale", String(scale)),
    [scale],
  );
  useEffect(() => {
    if (timeline.session.state === "settled") return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timeline.session.state]);
  useEffect(() => {
    if (rev.current !== timeline.revision && !following)
      setUpdates((n) => n + 1);
    rev.current = timeline.revision;
  }, [timeline.revision, following]);
  const groups = useMemo(
    () => buildFeedGroups(timeline.spans, clock),
    [timeline.spans, clock],
  );
  useLayoutEffect(() => {
    if (following && list.current)
      list.current.scrollTop = list.current.scrollHeight;
    const b = host.current?.getBoundingClientRect();
    onBootstrapDiagnostic?.({
      suppliedClusters: groups.length,
      viewportWidth: b?.width ?? 0,
      viewportHeight: b?.height ?? 0,
      listLoaded: !!list.current,
      renderedItems: groups.length,
    });
  }, [groups, following, onBootstrapDiagnostic]);
  const load = async (s: ProcessSpan) => {
    if (!s.streamBounds.cursor) return;
    setLoading((x) => new Set(x).add(s.id));
    try {
      await onLoadEarlier(s);
    } finally {
      setLoading((x) => {
        const n = new Set(x);
        n.delete(s.id);
        return n;
      });
    }
  };
  const started = new Date(timeline.session.startedAt);
  const toggleProcess = (id: string) => {
    const owner = list.current;
    const findCard = () => [...(owner?.querySelectorAll<HTMLElement>("[data-testid^='process:']") ?? [])].find((node) => node.dataset.testid === `process:${id}`);
    const card = findCard();
    const top = card?.getBoundingClientRect().top;
    setOpen((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (owner && top !== undefined)
      requestAnimationFrame(() => {
        const moved = findCard();
        if (moved) owner.scrollTop += moved.getBoundingClientRect().top - top;
      });
  };
  return (
    <section className="timeline-panel">
      <header className="timeline-header">
        <button className="session-title" onClick={() => setRequest(true)}>
          <h1>{timeline.session.intent}</h1>
        </button>
        <div className="session-context">
          {timeline.session.originHermesSessionTitle ?? "Hermes"} ·{" "}
          {started.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </div>
      </header>
      <div className="timeline-list-host" ref={host}>
        <div
          className="timeline-list coordination-feed"
          ref={list}
          style={{ "--feed-scale": scale } as React.CSSProperties}
          onScroll={(e) => {
            const v = e.currentTarget,
              d = v.scrollHeight - v.scrollTop - v.clientHeight;
            if (d <= 40) {
              setFollowing(true);
              setUpdates(0);
            } else setFollowing(false);
          }}
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setScale((x) =>
              Math.min(
                1.5,
                Math.max(
                  0.8,
                  Number((x + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)),
                ),
              ),
            );
          }}
        >
          {groups.map((g) => (
            <section
              className={`feed-group${g.laneCount > 1 ? " parallel-group" : ""}`}
              key={g.id}
              data-testid={g.id}
            >
              <time className="feed-time" dateTime={new Date(g.start).toISOString()}>
                {new Date(g.start).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <div
                className="feed-processes"
                style={{ "--lane-count": g.laneCount } as React.CSSProperties}
              >
                {g.processes.map(({ process: s, lane }) => (
                  <Card
                    key={s.id}
                    span={s}
                    lane={lane}
                    open={open.has(s.id)}
                    toggle={() => toggleProcess(s.id)}
                    loading={loading.has(s.id)}
                    load={() => void load(s)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {!following && (
        <button
          className="return-live"
          onClick={() => {
            if (list.current)
              list.current.scrollTop = list.current.scrollHeight;
            setFollowing(true);
            setUpdates(0);
          }}
        >
          ↓{" "}
          {timeline.session.state === "settled"
            ? "Jump to latest"
            : "Return to live"}
          {updates ? ` · ${updates} updates` : ""}
        </button>
      )}
      {request && (
        <Request
          text={timeline.session.intent}
          close={() => setRequest(false)}
        />
      )}
    </section>
  );
}
