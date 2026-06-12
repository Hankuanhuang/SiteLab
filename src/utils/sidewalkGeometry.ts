import type { ContextPoint, Sidewalk } from "../types/layout";

export function getSidewalkPoints(sidewalk: Sidewalk): ContextPoint[] {
  const offset = {
    x: sidewalk.normal.x * sidewalk.width,
    y: sidewalk.normal.y * sidewalk.width,
  };

  return [
    sidewalk.start,
    sidewalk.end,
    { x: sidewalk.end.x + offset.x, y: sidewalk.end.y + offset.y },
    { x: sidewalk.start.x + offset.x, y: sidewalk.start.y + offset.y },
  ];
}

export function getUnitNormal(
  start: ContextPoint,
  end: ContextPoint,
  cursor: ContextPoint,
): ContextPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const cross = dx * (cursor.y - start.y) - dy * (cursor.x - start.x);
  const side = cross >= 0 ? 1 : -1;

  return {
    x: (-dy / length) * side,
    y: (dx / length) * side,
  };
}
