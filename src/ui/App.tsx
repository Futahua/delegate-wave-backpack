import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Pane, SplitPane, type DividerProps } from "react-split-pane";
import "react-split-pane/styles.css";
import {
  read,
  paramsForSessionList,
  paramsForSessionTimeline,
} from "../model/adapter";
import { SessionTimeline } from "../timeline/SessionTimeline";
import { WaveOrganizer } from './WaveOrganizer';
import {
  mergeStreamPage,
  mergeTimelineRefresh,
  sessionPageFromRelay,
  timelineFromRelay,
  type ProcessSpan,
  type SessionSummary,
  type SessionTimeline as Timeline,
} from "../timeline/model";

export const VISIBLE_LIST_POLL = 1_200;
export const HIDDEN_LIST_POLL = 5_000;
export const VISIBLE_TIMELINE_POLL = 900;
export const HIDDEN_TIMELINE_POLL = 5_000;

export {buildSessionGroups, type SessionConversationGroup} from './sessionGroups';

const DEFAULT_SIDEBAR_WIDTH = 264,
  MIN_SIDEBAR_WIDTH = 200,
  MAX_SIDEBAR_WIDTH = 420;
export const normalizeSidebarWidth = (saved: string | null | undefined) => {
  if (saved === null || saved === undefined) return DEFAULT_SIDEBAR_WIDTH;
  const value = Number(saved);
  return Number.isFinite(value)
    ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value))
    : DEFAULT_SIDEBAR_WIDTH;
};
const savedSidebarWidth = () =>
  normalizeSidebarWidth(
    globalThis.localStorage?.getItem("delegate-wave.sidebar-width"),
  );
const savedSidebarCollapsed = () =>
  globalThis.localStorage?.getItem("delegate-wave.sidebar-collapsed") ===
  "true";

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [selectedName, setSelectedName] = useState<string>();
  const [timeline, setTimeline] = useState<Timeline>();
  const [indexFreshness, setIndexFreshness] = useState<
    "fresh" | "stale" | "loading"
  >("loading");
  const [timelineFreshness, setTimelineFreshness] = useState<
    "fresh" | "stale" | "loading"
  >("loading");
  const [message, setMessage] = useState("Connecting to Delegate Wave…");
  const [sidebarWidth, setSidebarWidth] = useState(savedSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    savedSidebarCollapsed,
  );
  const [workspaceTheme, setWorkspaceTheme] = useState<"light" | "dark">(
    () =>
      globalThis.localStorage?.getItem("delegate-wave.workspace-theme") ===
      "dark"
        ? "dark"
        : "light",
  );
  const timelineRef = useRef<Timeline | undefined>(undefined);
  timelineRef.current = timeline;

  const loadSessionIndex = useCallback(async () => {
    const collected: SessionSummary[] = [];
    let cursor: string | undefined;
    do {
      const reply = await read(
        "session.list",
        paramsForSessionList(cursor, 40),
      );
      if (!reply.ok)
        throw new Error(reply.message ?? "Session history is unavailable.");
      const page = sessionPageFromRelay(reply.result);
      if (!page)
        throw new Error("Delegate Wave returned an unreadable session index.");
      collected.push(...page.sessions);
      cursor = page.hasMore ? page.nextCursor : undefined;
      if (page.hasMore && !cursor)
        throw new Error("Session history pagination stopped without a cursor.");
    } while (cursor);
    return collected;
  }, []);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (!stopped)
        timer = setTimeout(
          () => void run(),
          document.visibilityState === "hidden"
            ? HIDDEN_LIST_POLL
            : VISIBLE_LIST_POLL,
        );
    };
    const run = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const next = await loadSessionIndex();
        if (stopped) return;
        setSessions(next);
        setSelected((current) => current && next.some((session) => session.id === current) ? current : undefined);
        setIndexFreshness("fresh");
        setMessage(
          next.length
            ? ""
            : "No autonomous sessions have been recorded yet. Delegate through Hermes to begin.",
        );
      } catch (error) {
        if (!stopped) {
          setIndexFreshness("stale");
          setMessage(
            error instanceof Error
              ? error.message
              : "Session history is unavailable.",
          );
        }
      } finally {
        running = false;
        schedule();
      }
    };
    void run();
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (!running) timer = setTimeout(() => void run(), 0);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [loadSessionIndex]);

  const selectedSession = sessions.find((session) => session.id === selected);
  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let acceptedRevision: string | undefined;
    setTimelineFreshness((current) =>
      current === "fresh" ? "fresh" : "loading",
    );
    const schedule = () => {
      if (!stopped)
        timer = setTimeout(
          () => void run(),
          document.visibilityState === "hidden"
            ? HIDDEN_TIMELINE_POLL
            : VISIBLE_TIMELINE_POLL,
        );
    };
    const run = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const reply = await read(
          "session.timeline",
          paramsForSessionTimeline(selected, { limit: 120 }),
        );
        if (!reply.ok)
          throw new Error(reply.message ?? "Timeline read failed.");
        const next = timelineFromRelay(reply.result);
        if (!next)
          throw new Error("Delegate Wave returned an unreadable timeline.");
        if (stopped) return;
        if (!acceptedRevision || next.revision !== acceptedRevision) {
          acceptedRevision = next.revision;
          const refreshed =
            timelineRef.current?.session.id === selected
              ? mergeTimelineRefresh(timelineRef.current, next)
              : next;
          timelineRef.current = refreshed;
          setTimeline(refreshed);
        }
        setTimelineFreshness("fresh");
      } catch (error) {
        if (!stopped) {
          setTimelineFreshness("stale");
          setMessage(
            error instanceof Error ? error.message : "Timeline read failed.",
          );
        }
      } finally {
        running = false;
        schedule();
      }
    };
    void run();
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (!running) timer = setTimeout(() => void run(), 0);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [selected, selectedSession?.state]);

  const loadEarlier = useCallback(
    async (span: ProcessSpan) => {
      if (!selected || !span.streamBounds.cursor) return;
      const reply = await read(
        "session.timeline",
        paramsForSessionTimeline(selected, {
          streamSpanId: span.id,
          before: span.streamBounds.cursor,
          limit: 120,
        }),
      );
      if (!reply.ok) {
        setTimelineFreshness("stale");
        setMessage(reply.message ?? "Earlier activity could not be loaded.");
        return;
      }
      const page = timelineFromRelay(reply.result);
      const current = timelineRef.current;
      if (page && current) {
        const merged = mergeStreamPage(current, page);
        timelineRef.current = merged;
        setTimeline(merged);
      }
    },
    [selected],
  );

  const selectedTimeline =
    timeline?.session.id === selected ? timeline : undefined;
  const freshness = selectedTimeline ? timelineFreshness : indexFreshness;
  const Divider = useCallback<ComponentType<DividerProps>>(
    ({
      className,
      style,
      onPointerDown,
      onKeyDown,
      currentSize,
      minSize,
      maxSize,
      disabled,
    }) => (
      <div
        className={`${className ?? ""} sidebar-divider`}
        style={style}
        role="separator"
        aria-label="Resize sessions sidebar"
        aria-orientation="vertical"
        aria-valuenow={currentSize}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={disabled ? undefined : onPointerDown}
        onKeyDown={disabled ? undefined : onKeyDown}
        onDoubleClick={() => {
          setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
          localStorage.setItem(
            "delegate-wave.sidebar-width",
            String(DEFAULT_SIDEBAR_WIDTH),
          );
        }}
      />
    ),
    [],
  );
  const toggleSidebar = () =>
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("delegate-wave.sidebar-collapsed", String(next));
      return next;
    });
  const toggleWorkspaceTheme = () =>
    setWorkspaceTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("delegate-wave.workspace-theme", next);
      return next;
    });
  return (
    <div className="session-app" data-theme={workspaceTheme}>
      <SplitPane
        direction="horizontal"
        className="session-split"
        divider={Divider}
        dividerSize={sidebarCollapsed ? 1 : 7}
        step={10}
        onResize={(sizes) => {
          if (!sidebarCollapsed)
            setSidebarWidth(sizes[0] ?? DEFAULT_SIDEBAR_WIDTH);
        }}
        onResizeEnd={(sizes) => {
          if (sidebarCollapsed) return;
          const width = Math.round(sizes[0] ?? DEFAULT_SIDEBAR_WIDTH);
          setSidebarWidth(width);
          localStorage.setItem("delegate-wave.sidebar-width", String(width));
        }}
      >
        <Pane
          size={sidebarCollapsed ? 42 : sidebarWidth}
          minSize={sidebarCollapsed ? 42 : MIN_SIDEBAR_WIDTH}
          maxSize={sidebarCollapsed ? 42 : MAX_SIDEBAR_WIDTH}
        >
          <aside
            className={`session-sidebar${sidebarCollapsed ? " collapsed" : ""}`}
          >
            <WaveOrganizer sessions={sessions} selected={selected} collapsed={sidebarCollapsed} toggle={toggleSidebar} onSelect={(id,name) => {if(id!==selected)setTimeline(undefined);setSelected(id);setSelectedName(name)}} />
          </aside>
        </Pane>
        <Pane minSize={360}>
          <main className="session-main">
            <button
              className="workspace-theme-toggle"
              type="button"
              aria-label={
                workspaceTheme === "dark" ? "Use light mode" : "Use dark mode"
              }
              title={
                workspaceTheme === "dark" ? "Use light mode" : "Use dark mode"
              }
              aria-pressed={workspaceTheme === "dark"}
              onClick={toggleWorkspaceTheme}
            >
              <span aria-hidden="true">{workspaceTheme === "dark" ? "☼" : "☾"}</span>
              <span>{workspaceTheme === "dark" ? "Light" : "Dark"}</span>
            </button>
            {selectedTimeline ? (
              <>
                <div className={`freshness freshness-${freshness}`}>
                  {freshness === "stale"
                    ? "Offline · showing last confirmed revision"
                    : ""}
                </div>
                <SessionTimeline
                  timeline={selectedTimeline}
                  displayName={selectedName}
                  onLoadEarlier={loadEarlier}
                />
              </>
            ) : (
              <div className="timeline-empty">
                <div className="pulse" />
                <h1>
                  {selected
                    ? "Reconstructing durable history…"
                    : "Your delegated work appears here"}
                </h1>
                <p>{message || "Reading the exact session timeline."}</p>
              </div>
            )}
          </main>
        </Pane>
      </SplitPane>
    </div>
  );
}

export default App;
