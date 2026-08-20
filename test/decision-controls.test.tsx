/**
 * The controls are unavailable when there is nothing to decide on.
 *
 * The payload tests fix what gets sent; this fixes whether it can be sent at all.
 * Both matter: a correct payload built from a missing identifier is still an
 * action taken on a guess, and the operator has no way to see that from a button
 * that looks ready.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { RunDetail, type DetailState } from '../src/ui/RunDetail';
import type { RunModel } from '../src/model/normalize';

const RUN: RunModel = {
  id: 'job_c06c3499',
  title: 'Build the dashboard',
  status: 'READY_FOR_INTEGRATION',
  bucket: 'attention',
} as RunModel;

function detailWith(proposalId?: string): DetailState {
  return {
    // Complete enough to render the whole panel: the point is to reach the
    // decision controls, not to exercise the empty states around them.
    job: { steps: [], evidence: [], raw: null } as unknown as DetailState['job'],
    briefing: { plan: [], workers: [], raw: null } as unknown as DetailState['briefing'],
    integration: { files: [], raw: null, proposalId } as DetailState['integration'],
    decision: { state: 'idle' },
    jobOk: true,
    briefingOk: true,
    integrationOk: true,
    anyTimeout: false,
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render(detail: DetailState): HTMLButtonElement[] {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <RunDetail run={RUN} detail={detail} onBack={() => {}} onDecide={() => {}} />,
    );
  });
  return [...host.querySelectorAll('button')].filter((b) =>
    /INTEGRATE|REJECT/.test(b.textContent ?? ''),
  ) as HTMLButtonElement[];
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('decision controls', () => {
  it('are unavailable when no proposal has been offered', () => {
    const buttons = render(detailWith(undefined));
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button.disabled).toBe(true);
  });

  it('say why, instead of leaving a dead control unexplained', () => {
    render(detailWith(undefined));
    expect(host!.textContent).toContain('No integration proposal has been offered');
  });

  it('become available once a proposal exists', () => {
    const buttons = render(detailWith('proposal_9f2c1d'));
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button.disabled).toBe(false);
  });
});
