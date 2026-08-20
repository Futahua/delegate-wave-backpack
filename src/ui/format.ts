/**
 * Compact formatting for machine facts. Every helper returns '—' for an absent
 * value so the UI can show an honest "not reported" without fabricating data.
 */

export function fmtMoney(n: number | undefined, currency?: string): string {
  if (n === undefined || !Number.isFinite(n)) return '\u2014';
  const c = (currency ?? 'USD').toUpperCase();
  if (n >= 100) return `${c} ${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `${c} ${n.toFixed(2)}`;
  return `${c} ${n.toFixed(4).replace(/0+$/, '')}`;
}

export function fmtTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '\u2014';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function fmtClock(iso: string | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    hour12: false,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '\u2014';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1_000);
  return `${m}m ${s}s`;
}

export function truncate(s: string | undefined, n = 72): string {
  if (!s) return '\u2014';
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}\u2026`;
}

export function listOrDash(items: string[] | undefined): string {
  if (!items || items.length === 0) return '\u2014';
  return items.join(', ');
}