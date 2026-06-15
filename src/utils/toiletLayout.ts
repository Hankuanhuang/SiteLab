export interface ToiletVisualLayout {
  stallCount: number;
  backWallY: number;
  frontPartitionY: number;
  labelZoneY: number;
  labelZoneHeight: number;
  partitionXs: number[];
  stallCenters: number[];
}

export function getToiletStallCount(widthMeters: number) {
  if (widthMeters < 5) return 2;
  if (widthMeters <= 8) return 4;
  if (widthMeters <= 12) return 6;
  return 8;
}

export function getToiletVisualLayout(
  widthMeters: number,
  widthPx: number,
  heightPx: number,
): ToiletVisualLayout {
  const stallCount = getToiletStallCount(widthMeters);
  const sideInset = clamp(widthPx * 0.05, 6, 18);
  const topInset = clamp(heightPx * 0.08, 6, 18);
  const labelZoneHeight = clamp(heightPx * 0.24, 20, 54);
  const corridorGap = clamp(heightPx * 0.08, 6, 16);
  const frontPartitionY = clamp(
    heightPx - labelZoneHeight - corridorGap,
    topInset + 18,
    heightPx - labelZoneHeight - 4,
  );
  const usableWidth = Math.max(1, widthPx - sideInset * 2);
  const stallWidth = usableWidth / stallCount;
  const partitionXs = Array.from({ length: stallCount + 1 }, (_, index) => sideInset + stallWidth * index);
  const stallCenters = Array.from({ length: stallCount }, (_, index) => sideInset + stallWidth * (index + 0.5));

  return {
    stallCount,
    backWallY: topInset,
    frontPartitionY,
    labelZoneY: frontPartitionY + corridorGap * 0.5,
    labelZoneHeight,
    partitionXs,
    stallCenters,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
