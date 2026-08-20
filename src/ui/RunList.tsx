import type { ReactNode } from 'react';
import type { RunModel } from '../model/normalize';
import { fmtClock, fmtMoney, fmtTokens, truncate } from './format';
import { StatusTag } from './pieces';

export function RunTable({
  runs,
  onSelect,
  empty = 'No runs in this view.',
}: {
  runs: RunModel[];
  onSelect: (id: string) => void;
  empty?: string;
}): ReactNode {
  if (runs.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="runs">
      <thead>
        <tr>
          <th>ID</th>
          <th>STATUS</th>
          <th>OBJECTIVE</th>
          <th>WORKER</th>
          <th>BRANCH</th>
          <th>STARTED</th>
          <th className="num">COST</th>
          <th className="num">TOKENS</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={`${r.id}-${r.objective ?? ''}`} onClick={() => onSelect(r.id)}>
            <td className="mono">{r.id}</td>
            <td>
              <StatusTag bucket={r.bucket} status={r.status} />
            </td>
            <td className="obj" title={r.objective ?? r.title}>
              {truncate(r.objective ?? r.title)}
            </td>
            <td className="mono">{r.worker ?? '\u2014'}</td>
            <td className="mono">{r.branch ?? '\u2014'}</td>
            <td className="mono">{fmtClock(r.startedAt)}</td>
            <td className="num mono">{fmtMoney(r.costUsd, r.currency)}</td>
            <td className="num mono">{fmtTokens(r.totalTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}