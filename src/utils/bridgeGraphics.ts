export const BRIDGE_TARGET_SPAN_METERS = 7;

export function getBridgeBeamOffsets(length: number, targetSpan = BRIDGE_TARGET_SPAN_METERS) {
  const spanCount = Math.max(1, Math.round(length / targetSpan));
  return Array.from({ length: spanCount + 1 }, (_, index) => (index / spanCount) * length);
}
