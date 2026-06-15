import type { Entrance } from "../types/layout";

export interface EntranceAnnotationBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface EntranceAnnotationLabelSize {
  width: number;
  height: number;
}

export function getEntranceAnnotationGap(fontSize: number) {
  return clamp(fontSize * 0.4, 4, 8);
}

export function getEntranceLabelCoordinates(
  position: Entrance["labelPosition"],
  arrowBounds: EntranceAnnotationBounds,
  labelSize: EntranceAnnotationLabelSize,
  gap: number,
) {
  const arrowCenterX = (arrowBounds.minX + arrowBounds.maxX) / 2;
  const arrowCenterY = (arrowBounds.minY + arrowBounds.maxY) / 2;

  if (position === "top") {
    return {
      x: arrowCenterX - labelSize.width / 2,
      y: arrowBounds.minY - gap - labelSize.height,
    };
  }
  if (position === "left") {
    return {
      x: arrowBounds.minX - gap - labelSize.width,
      y: arrowCenterY - labelSize.height / 2,
    };
  }
  if (position === "right") {
    return {
      x: arrowBounds.maxX + gap,
      y: arrowCenterY - labelSize.height / 2,
    };
  }
  return {
    x: arrowCenterX - labelSize.width / 2,
    y: arrowBounds.maxY + gap,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
