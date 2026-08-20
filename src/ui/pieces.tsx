import type { ReactNode } from 'react';
import type { Bucket } from '../model/normalize';

export function StatusTag({ bucket, status }: { bucket?: Bucket; status?: string }): ReactNode {
  const cls = bucket ?? 'other';
  const label = (status && status.trim() !== '' ? status : 'n/a').toUpperCase();
  return (
    <span className={`tag tag-${cls}`} title={status}>
      {label}
    </span>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="section">
      <header className="section-head">
        <h2>{title}</h2>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }): ReactNode {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className={`field-value${mono ? ' mono' : ''}`}>{value ?? '\u2014'}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <div className="empty">{children}</div>;
}

export function Hr(): ReactNode {
  return <div className="hr" />;
}

export function RawDump({ value }: { value: unknown }): ReactNode {
  let text = '\u2014';
  try {
    text = JSON.stringify(value, null, 1);
  } catch {
    text = String(value);
  }
  return <pre className="raw">{text}</pre>;
}