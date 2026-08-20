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

export function paramsForTarget(id: string): Record<string, unknown> {
  return { id, runId: id, jobId: id };
}

export async function read(operation: Operation, params: Record<string, unknown> = {}): Promise<import('../bridge/bridge').RelayResult<unknown>> {
  return call<unknown>(operation, params, { timeoutMs: READ_TIMEOUT_MS });
}

export async function write(operation: Operation, params: Record<string, unknown> = {}): Promise<import('../bridge/bridge').RelayResult<unknown>> {
  return call<unknown>(operation, params, { timeoutMs: WRITE_TIMEOUT_MS });
}