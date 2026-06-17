export const THICK_STAIR_TREAD_SPACING_METERS = 0.3;
export const THICK_STAIR_LANDING_RATIO = 0.15;
export const THIN_STAIR_TREAD_SPACING_METERS = 0.3;
export const THIN_STAIR_LANDING_RATIO = 0.25;

export function isThickStair(type: string, coreVariant: string | undefined) {
  return type === "stair" && coreVariant === "thick";
}

export function isThinStair(type: string, coreVariant: string | undefined) {
  return type === "stair" && coreVariant === "thin";
}

export function getStairTreadOffsets(runLength: number, spacing = THICK_STAIR_TREAD_SPACING_METERS) {
  const treadCount = Math.max(1, Math.round(runLength / spacing));
  return Array.from({ length: Math.max(0, treadCount - 1) }, (_, index) => ((index + 1) / treadCount) * runLength);
}

export function getThickStairLayout(
  totalRunLength: number,
  landingRatio = THICK_STAIR_LANDING_RATIO,
  treadSpacing = THICK_STAIR_TREAD_SPACING_METERS,
) {
  return getLandingStairLayout(totalRunLength, landingRatio, treadSpacing);
}

export function getThinStairLayout(
  totalRunLength: number,
  landingRatio = THIN_STAIR_LANDING_RATIO,
  treadSpacing = THIN_STAIR_TREAD_SPACING_METERS,
) {
  return getLandingStairLayout(totalRunLength, landingRatio, treadSpacing);
}

function getLandingStairLayout(
  totalRunLength: number,
  landingRatio: number,
  treadSpacing: number,
) {
  const landingLength = totalRunLength * landingRatio;
  const stairRunStart = landingLength;
  const stairRunEnd = totalRunLength - landingLength;
  const stairRunLength = Math.max(0, stairRunEnd - stairRunStart);
  const treadOffsets = getStairTreadOffsets(stairRunLength, treadSpacing).map((offset) => stairRunStart + offset);

  return {
    landingLength,
    stairRunStart,
    stairRunEnd,
    treadOffsets,
  };
}
