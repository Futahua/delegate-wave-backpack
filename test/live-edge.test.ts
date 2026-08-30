import { describe, expect, it } from 'vitest';
import { distanceFromEnd, LIVE_EDGE_PX, nextFollowMode } from '../src/live-work/live-edge';

describe('strict live edge', () => {
  it('leaves follow mode as soon as the reader moves beyond the strict band', () => {
    expect(nextFollowMode('following-end', LIVE_EDGE_PX + 1)).toBe('free-scrolling');
  });

  it('does not rearm while merely near the bottom', () => {
    expect(nextFollowMode('free-scrolling', LIVE_EDGE_PX + 1)).toBe('free-scrolling');
    expect(nextFollowMode('free-scrolling', LIVE_EDGE_PX)).toBe('following-end');
  });

  it('explicit return always rearms', () => {
    expect(nextFollowMode('free-scrolling', 900, true)).toBe('following-end');
  });

  it('measures distance without negative overscroll', () => {
    expect(distanceFromEnd(2_000, 1_100, 600)).toBe(300);
    expect(distanceFromEnd(500, 10, 600)).toBe(0);
  });
});
