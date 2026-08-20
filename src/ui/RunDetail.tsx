import type { ReactNode } from 'react';
import type { BriefModel, IntegrationModel, JobModel, RunModel, StepModel, EvidenceEntry } from '../model/normalize';
import { fmtClock, fmtDate, fmtDuration, fmtMoney, fmtTokens, truncate } from './format';
import { Empty, Field, Section, StatusTag } from './pieces';

export interface DecisionState {
  state: 'idle' | 'running' | 'ok' | 'uncertain' | 'failed';
  kind?: 'approve' | 'decline';
  message?: string;
}

export interface DetailState {
  job?: JobModel;
  briefing?: BriefModel;
  integration?: IntegrationModel;
  jobOk: boolean;
  briefingOk: boolean;
  integrationOk: boolean;
  anyTimeout: boolean;
  decision: DecisionState;
}

function sumNums(values: Array<number | undefined>): number | undefined {
  let n = 0;
  let saw = false;
  for (const v of values) {
    if (v !== undefined && Number.isFinite(v)) {
      n += v;
      saw = true;
    }
  }
  return saw ? n : undefined;
}

function StepRow({ step }: { step: StepModel }): ReactNode {
  return (
    <tr>
      <td>{truncate(step.name, 48)}</td>
      <td>
        <StatusTag bucket={undefined} status={step.status} />
      </td>
      <td className="mono">{fmtClock(step.startedAt)}</td>
      <td className="num mono">{fmtDuration(step.durationMs)}</td>
      <td className="num mono">{fmtFee(step.costUsd)}</td>
    </tr>
  );
}

function EvidenceRow({ e }: { e: EvidenceEntry }): ReactNode {
  return (
    <tr>
      <td className="mono">{fmtClock(e.timestamp)}</td>
      <td className="mono">{e.type ?? '\u2014'}</td>
      <td className="num mono">{fmtDuration(e.durationMs)}</td>
      <td className="num mono">{fmtFee(e.costUsd)}</td>
      <td className="num mono">{fmtTokens(e.tokens)}</td>
      <td className="msg" title={e.message}>
        {truncate(e.message, 56)}
      </td>
    </tr>
  );
}

function fmtFee(n: number | undefined): string {
  if (n === undefined) return '\u2014';
  return fmtMoney(n, 'USD');
}

export function RunDetail({
  run,
  detail,
  onBack,
  onDecide,
}: {
  run: RunModel;
  detail: DetailState;
  onBack: () => void;
  onDecide: (kind: 'approve' | 'decline') => void;
}): ReactNode {
  const { job, briefing, integration, decision } = detail;
  const settled = run.bucket === 'settled';

  const evCost = sumNums((job?.evidence ?? []).map((e) => e.costUsd));
  const evTokens = sumNums((job?.evidence ?? []).map((e) => e.tokens));
  const stepsDone = (job?.steps ?? []).filter((s) => {
    const st = (s.status ?? '').toLowerCase();
    return st.includes('done') || st.includes('complete') || st.includes('ok');
  }).length;

  return (
    <div className="detail">
      {detail.anyTimeout && (
        <div className="warn-strip">
          PARTIAL DATA \u2014 no host reply for part of this run\u2019s view; sections it failed to
          return are marked \u201c\u2014\u201d rather than guessed.
        </div>
      )}

      <header className="detail-head">
        <button className="btn link" onClick={onBack} title="Back to list">
          \u2190
        </button>
        <span className="mono run-id">{run.id}</span>
        <StatusTag bucket={run.bucket} status={run.status} />
        {run.worker && <span className="mono dim">worker {run.worker}</span>}
        {run.costUsd !== undefined && <span className="mono dim">cost {fmtMoney(run.costUsd, run.currency)}</span>}
        {run.totalTokens !== undefined && <span className="mono dim">tokens {fmtTokens(run.totalTokens)}</span>}
      </header>

      <div className="detail-grid">
        <div className="detail-col">
          <Section title="BRIEFING">
            {detail.briefingOk ? (
              <div className="brief">
                {briefing?.title && <div className="brief-title">{briefing.title}</div>}
                {briefing?.objective && (
                  <div className="brief-obj">
                    <span className="field-label">OBJECTIVE</span>
                    <span className="value">{briefing.objective}</span>
                  </div>
                )}
                {briefing?.context && (
                  <div className="brief-block">
                    <span className="field-label">CONTEXT</span>
                    <span className="value">{briefing.context}</span>
                  </div>
                )}
                {briefing?.summary && (
                  <div className="brief-block">
                    <span className="field-label">SUMMARY</span>
                    <span className="value">{briefing.summary}</span>
                  </div>
                )}
                {briefing && briefing.plan.length > 0 && (
                  <div className="brief-block">
                    <span className="field-label">PLAN</span>
                    <ol className="plan">
                      {briefing.plan.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {briefing && briefing.workers.length > 0 && (
                  <Field label="TEAM" mono value={briefing.workers.join(', ')} />
                )}
                {(briefing && !briefing.title && !briefing.objective && !briefing.context && !briefing.summary && briefing.plan.length === 0 && briefing.workers.length === 0 && (
                  <Empty>The operator returned no briefing for this run.</Empty>
                ))}
              </div>
            ) : (
              <Empty>Briefing unavailable \u2014 no host reply or no briefing reported.</Empty>
            )}
          </Section>

          <Section title="EXECUTION">
            {detail.jobOk ? (
              <div>
                <div className="field-grid">
                  <Field label="WORKER" mono value={job?.worker} />
                  <Field label="BRANCH" mono value={job?.branch} />
                  <Field label="COMMIT" mono value={job?.commit} />
                  <Field label="MODEL" mono value={job?.model} />
                  <Field label="STARTED" mono value={fmtDate(job?.startedAt)} />
                  <Field label="FINISHED" mono value={fmtDate(job?.finishedAt)} />
                  <Field label="DURATION" mono value={fmtDuration(job?.durationMs)} />
                  <Field label="STEPS DONE" value={`${stepsDone}/${job?.steps.length ?? 0}`} />
                </div>
                {job && job.steps.length > 0 ? (
                  <table className="steps">
                    <thead>
                      <tr>
                        <th>STEP</th>
                        <th>STATUS</th>
                        <th>STARTED</th>
                        <th className="num">TIME</th>
                        <th className="num">COST</th>
                      </tr>
                    </thead>
                    <tbody>{job.steps.map((s) => <StepRow key={s.name} step={s} />)}</tbody>
                  </table>
                ) : (
                  <Empty>No execution steps reported.</Empty>
                )}
              </div>
            ) : (
              <Empty>Execution detail unavailable \u2014 no host reply or no job reported.</Empty>
            )}
          </Section>

          <Section title="INTEGRATION">
            {detail.integrationOk ? (
              <div>
                <div className="field-grid">
                  <Field label="BRANCH" mono value={integration?.branch} />
                  <Field label="COMMIT" mono value={integration?.commit} />
                  <Field label="PR" value={integration?.prUrl ? truncate(integration.prUrl, 48) : '\u2014'} />
                </div>
                {integration?.summary && <p className="summary">{integration.summary}</p>}
                {integration && integration.files.length > 0 ? (
                  <table className="files">
                    <thead>
                      <tr>
                        <th>PATH</th>
                        <th>TYPE</th>
                        <th className="num">+</th>
                        <th className="num">\u2212</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integration.files.map((f) => (
                        <tr key={`${f.path}-${f.type ?? ''}-${f.additions ?? ''}-${f.deletions ?? ''}`}>
                          <td className="mono">{f.path}</td>
                          <td className="mono">{f.type ?? '\u2014'}</td>
                          <td className="num add">{f.additions ?? '\u2014'}</td>
                          <td className="num del">{f.deletions ?? '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>No changed files reported by the operator.</Empty>
                )}
              </div>
            ) : (
              <Empty>Integration summary unavailable \u2014 no host reply or no integration reported.</Empty>
            )}
          </Section>
        </div>

        <div className="detail-col">
          <Section title="EVIDENCE">
            {detail.jobOk && job && job.evidence.length > 0 ? (
              <table className="evidence">
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>TYPE</th>
                    <th className="num">DURATION</th>
                    <th className="num">COST</th>
                    <th className="num">TOKENS</th>
                    <th>DETAIL</th>
                  </tr>
                </thead>
                <tbody>{job.evidence.map((e, idx) => <EvidenceRow key={e.id ?? e.timestamp ?? `ev-${idx}`} e={e} />)}</tbody>
              </table>
            ) : (
              <Empty>
                {detail.jobOk
                  ? 'No execution evidence reported.'
                  : 'Evidence unavailable \u2014 no host reply or no evidence reported.'}
              </Empty>
            )}
          </Section>

          <Section title="USAGE">
            <div className="field-grid">
              <Field label="TOTAL COST" mono value={fmtMoney(job?.costUsd ?? evCost, job?.currency)} />
              <Field label="TOKENS IN" mono value={fmtTokens(job?.tokensIn)} />
              <Field label="TOKENS OUT" mono value={fmtTokens(job?.tokensOut)} />
              <Field label="TOKENS TOTAL" mono value={fmtTokens(job?.totalTokens ?? evTokens)} />
              <Field label="MODEL" mono value={job?.model} />
              <Field label="EVIDENCE COST" mono value={fmtMoney(evCost, job?.currency)} />
            </div>
            {(job?.costUsd === undefined && job?.tokensIn === undefined && job?.tokensOut === undefined && job?.model === undefined && evCost === undefined && (
                  <Empty>No usage or cost reported for this run.</Empty>
                ))}
          </Section>
        </div>
      </div>

      <Section title="DECISION">
        <div className="decision">
          <p className="decision-note">
            The final call is yours. {settled ? 'This run is already settled; the choice is locked.' : 'Submitting it records your decision with delegate-wave \u2014 the page never decides for you, and never assumes a timed-out submission failed.'}
          </p>
          <div className="decision-actions">
            <button
              className="btn primary"
              disabled={settled || decision.state === 'running'}
              onClick={() => onDecide('approve')}
            >
              {decision.state === 'running' && decision.kind === 'approve' ? 'SENDING\u2026' : 'INTEGRATE'}
            </button>
            <button
              className="btn danger"
              disabled={settled || decision.state === 'running'}
              onClick={() => onDecide('decline')}
            >
              {decision.state === 'running' && decision.kind === 'decline' ? 'SENDING\u2026' : 'REJECT'}
            </button>
          </div>
          {decision.state === 'uncertain' && (
            <div className="warn-strip">
              {decision.message ?? 'No host reply.'} Timed-out submissions are never retried automatically; if you
              choose to, use the buttons above to resubmit deliberately.
            </div>
          )}
          {decision.state === 'failed' && <div className="err-strip">{decision.message}</div>}
          {decision.state === 'ok' && <div className="ok-strip">Decision recorded by delegate-wave.</div>}
        </div>
      </Section>
    </div>
  );
}