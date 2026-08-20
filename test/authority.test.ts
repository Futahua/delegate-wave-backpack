/**
 * The decision payload is addressed to a proposal, and to nothing else.
 *
 * The first accepted candidate sent `{ id, runId, jobId }` -- one run identifier
 * copied under three plausible names -- to `approve` and `decline`. delegate-wave
 * approves `POST /v1/proposals/{proposalId}`, where a proposal is its own entity
 * bound to one exact attempt and the tree it was written against. A job id there
 * is not a wrong label for the right thing; it is the right label for a different
 * thing, and the failure modes run from harmless rejection to acting on whatever
 * the wrong namespace resolves to.
 *
 * These tests fix the contract so that when a host is eventually built for this
 * relay, it inherits a correct authority payload rather than a latent bug.
 */
import { describe, expect, it } from 'vitest';

import { paramsForApprove, paramsForDecline, paramsForTarget } from '../src/model/adapter';
import { normalizeIntegration, proposalIdFrom } from '../src/model/normalize';

const PROPOSAL = 'proposal_9f2c1d';
const JOB = 'job_c06c3499-ff0b-40ea-b03e-1e6d6de4c5ab';

describe('proposal identity', () => {
  it('is read from the exact path delegate-wave answers with', () => {
    // `integration propose` replies { job, attempts, stage, proposal } where the
    // proposal row's primary key is `id`.
    const model = normalizeIntegration({
      ok: true,
      result: { job: { id: JOB }, stage: 'awaiting_approval', proposal: { id: PROPOSAL, job_id: JOB } },
    });
    expect(model.proposalId).toBe(PROPOSAL);
  });

  it('is absent, rather than guessed, when no proposal has been offered', () => {
    const model = normalizeIntegration({ ok: true, result: { job: { id: JOB }, stage: 'running' } });
    expect(model.proposalId).toBeUndefined();
  });

  it('never falls back to the job or run identifier', () => {
    // The whole hazard: a scope search for `id` would find the job's, and the
    // interface would then approve under an identifier from the wrong namespace.
    for (const result of [
      { job: { id: JOB } },
      { id: JOB, runId: JOB, jobId: JOB },
      { run: { id: JOB }, attempts: [{ id: `${JOB}.2` }] },
      { proposal: null, job: { id: JOB } },
      { proposal: { job_id: JOB, attempt_id: `${JOB}.2` } },
    ]) {
      expect(proposalIdFrom(result)).toBeUndefined();
    }
  });

  it('ignores a blank identifier, which is not an identifier', () => {
    expect(proposalIdFrom({ proposal: { id: '   ' } })).toBeUndefined();
  });
});

describe('decision payloads', () => {
  it('approve sends the proposal identifier and nothing else', () => {
    expect(paramsForApprove(PROPOSAL)).toEqual({ proposalId: PROPOSAL });
  });

  it('decline sends the proposal identifier, and a reason only when there is one', () => {
    expect(paramsForDecline(PROPOSAL)).toEqual({ proposalId: PROPOSAL });
    expect(paramsForDecline(PROPOSAL, 'not what was asked for')).toEqual({
      proposalId: PROPOSAL,
      reason: 'not what was asked for',
    });
    // Whitespace is not a reason.
    expect(paramsForDecline(PROPOSAL, '   ')).toEqual({ proposalId: PROPOSAL });
  });

  it('carries no job, run, or bare id key that a host could resolve differently', () => {
    for (const payload of [paramsForApprove(PROPOSAL), paramsForDecline(PROPOSAL, 'no')]) {
      expect(Object.keys(payload)).not.toContain('id');
      expect(Object.keys(payload)).not.toContain('jobId');
      expect(Object.keys(payload)).not.toContain('runId');
      expect(Object.values(payload)).not.toContain(JOB);
    }
  });

  it('keeps the read-side hedge away from the decision routes', () => {
    // paramsForTarget still exists for reads, where guessing the operand name
    // costs an empty panel rather than an action. It must not appear here.
    const hedged = paramsForTarget(JOB);
    expect(Object.keys(hedged).sort()).toEqual(['id', 'jobId', 'runId']);
    expect(paramsForApprove(PROPOSAL)).not.toMatchObject(hedged);
  });
});
