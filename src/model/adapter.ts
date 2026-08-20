/**
 * Presentation adapter over the frozen relay.
 *
 * Every assumption about what an operation expects on the wire lives here and
 * only here. The page otherwise deals in opaque identifiers and free-form
 * intent; this file is the single place those become concrete `params`, chosen
 * under the plausible names the operator might recognise. Nothing here widens
 * the bridge contract — the nine operations still travel through `call()`
 * untouched — it only decides what `call()` sends.
 *
 * Read operations use a shorter timeout so the page can degrade to a
 * disconnected state quickly; mutations keep the full window because a slow
 * answer does not mean the work did not happen, and timed-out mutations are
 * surfaced as uncertain rather than retried.
 */

import { call, type Operation } from '../bridge/bridge';

export const READ_TIMEOUT_MS = 6_000;
export const WRITE_TIMEOUT_MS = 20_000;

export function paramsForStart(intent: string): Record<string, unknown> {
  return { objective: intent };
}

/**
 * Read-side targeting, where the operand name is genuinely unknown.
 *
 * The hedge is confined to reads on purpose. A read sent under the wrong key
 * returns nothing and the panel shows its empty state; the same guess on a
 * mutation would be an authoritative action against a guessed target. The
 * decision operations below therefore do not use this.
 */
export function paramsForTarget(id: string): Record<string, unknown> {
  return { id, runId: id, jobId: id };
}

/**
 * The exact payloads delegate-wave's decision routes accept.
 *
 * `POST /v1/proposals/{proposalId}/approve` and `.../decline` take a proposal
 * identifier and nothing else. A job identifier is not a proposal identifier:
 * proposals are their own entity, bound to one exact attempt and the tree it
 * was written against, precisely so that approving cannot drift onto a
 * different candidate. Sending a job id here -- under any key -- would either
 * be rejected, or succeed by being ignored, or resolve in the wrong namespace,
 * and only the first of those is safe.
 *
 * Both take the identifier as a required argument, so an interface that has no
 * proposal cannot call them at all.
 */
export function paramsForApprove(proposalId: string): Record<string, unknown> {
  return { proposalId };
}

export function paramsForDecline(proposalId: string, reason?: string): Record<string, unknown> {
  const reasonText = reason?.trim();
  return reasonText ? { proposalId, reason: reasonText } : { proposalId };
}

export async function read(operation: Operation, params: Record<string, unknown> = {}): Promise<import('../bridge/bridge').RelayResult<unknown>> {
  return call<unknown>(operation, params, { timeoutMs: READ_TIMEOUT_MS });
}

export async function write(operation: Operation, params: Record<string, unknown> = {}): Promise<import('../bridge/bridge').RelayResult<unknown>> {
  return call<unknown>(operation, params, { timeoutMs: WRITE_TIMEOUT_MS });
}