import { useCallback, useEffect, useRef, useState } from 'react';
import type { RelayResult } from '../bridge/bridge';
import { paramsForTarget, read } from '../model/adapter';
import { normalizeJobPresentation, reconcilePresentation, type NormalizedPresentation } from './presentation';
import { Watch } from './Watch';

export const ACTIVE_POLL_MS = 900;
export const HIDDEN_POLL_MS = 5_000;

export interface LiveWatchProps {
  jobId: string;
  title?: string;
  onBack: () => void;
  onInspect?: () => void;
  readJob?: () => Promise<RelayResult<unknown>>;
}

export function LiveWatch({ jobId, title, onBack, onInspect, readJob }: LiveWatchProps): React.JSX.Element {
  const [presentation, setPresentation] = useState<NormalizedPresentation>();
  const [failure, setFailure] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const current = useRef<NormalizedPresentation | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const request = useCallback(
    () => readJob ? readJob() : read('job', paramsForTarget(jobId)),
    [jobId, readJob],
  );

  const schedule = useCallback(() => {
    if (stopped.current || current.current?.settled) return;
    if (timer.current) clearTimeout(timer.current);
    const delay = document.visibilityState === 'hidden' ? HIDDEN_POLL_MS : ACTIVE_POLL_MS;
    timer.current = setTimeout(() => void pollRef.current(), delay);
  }, []);

  const poll = useCallback(async () => {
    if (stopped.current || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    let reply: RelayResult<unknown>;
    try {
      reply = await request();
    } catch (error) {
      reply = { ok: false, code: 'READ_ERROR', message: error instanceof Error ? error.message : 'The job read failed.' };
    }
    inFlight.current = false;
    if (stopped.current) return;
    setRefreshing(false);
    if (!reply.ok) {
      setOffline(reply.code === 'TIMEOUT' || reply.code === 'HOST_REFUSED');
      setFailure(reply.message ?? 'Delegate Wave did not answer.');
      schedule();
      return;
    }
    const normalized = normalizeJobPresentation(reply, title ?? jobId);
    if (!normalized.ok) {
      setOffline(false);
      setFailure(normalized.message);
      schedule();
      return;
    }
    const next = reconcilePresentation(current.current, normalized.value);
    current.current = next;
    setPresentation(next);
    setFailure(undefined);
    setOffline(false);
    if (!next.settled) schedule();
  }, [jobId, request, schedule, title]);
  pollRef.current = poll;

  useEffect(() => {
    stopped.current = false;
    current.current = undefined;
    setPresentation(undefined);
    void poll();
    const visibility = () => {
      if (timer.current) clearTimeout(timer.current);
      if (!current.current?.settled) schedule();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [jobId, poll, schedule]);

  if (!presentation) return <main className="watch-shell live-watch-state"><button className="watch-back" onClick={onBack}>← Runs</button><div className="empty-state"><h1>{offline ? 'DELEGATE WAVE OFFLINE' : failure ? 'LIVE VIEW UNAVAILABLE' : 'OPENING LIVE WORK…'}</h1><p>{failure ?? 'Reading the durable job presentation.'}</p>{failure && <button className="btn" onClick={() => void poll()}>RETRY</button>}</div></main>;

  return <div className="live-watch"><div className="watch-toolbar"><button className="watch-back" onClick={onBack}>← Runs</button><div>{onInspect && <button className="watch-back" onClick={onInspect}>Inspect record</button>}<span className={offline ? 'watch-offline' : 'watch-online'}>{offline ? 'Offline · showing last confirmed revision' : presentation.settled ? 'Settled · polling stopped' : refreshing ? 'Checking…' : 'Live'}</span></div></div><Watch fixture={presentation.fixture}/>{failure && <div className="watch-read-error">{failure}</div>}</div>;
}
