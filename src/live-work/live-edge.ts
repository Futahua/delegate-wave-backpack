export type FollowMode = 'following-end' | 'free-scrolling';
export const LIVE_EDGE_PX = 40;

export function distanceFromEnd(scrollHeight: number, scrollTop: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

export function nextFollowMode(current: FollowMode, distance: number, explicitReturn = false): FollowMode {
  if (explicitReturn) return 'following-end';
  if (current === 'following-end' && distance > LIVE_EDGE_PX) return 'free-scrolling';
  if (current === 'free-scrolling' && distance <= LIVE_EDGE_PX) return 'following-end';
  return current;
}
