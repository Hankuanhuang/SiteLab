import { isCoreBuilding } from "../models/Building";
import type { Building } from "../types/layout";

export function shouldSnapCoreRotation(building: Building) {
  return isBuildingOrientationSnappedElement(building) && building.snapToBuildingOrientation !== false;
}

export function snapCoreRotation(rotation: number, buildingRotation: number) {
  return normalizeAngle(buildingRotation + Math.round((rotation - buildingRotation) / 90) * 90);
}

export function getCoreParentBuildingRotation(core: Building, buildings: Building[]) {
  const center = getBuildingCenter(core);
  const parent = buildings
    .filter((building) => building.id !== core.id && !isBuildingOrientationSnappedElement(building) && containsPoint(building, center))
    .sort((left, right) => left.length * left.width - right.length * right.width)[0];

  return parent?.rotation ?? 0;
}

export function isBuildingOrientationSnappedElement(building: Building) {
  return isCoreBuilding(building) || building.type === "bridge" || building.type === "toilet";
}

function getBuildingCenter(building: Building) {
  const radians = (building.rotation * Math.PI) / 180;
  const localX = building.length / 2;
  const localY = building.width / 2;
  return {
    x: building.x + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: building.y + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
}

function containsPoint(building: Building, point: { x: number; y: number }) {
  const radians = (building.rotation * Math.PI) / 180;
  const dx = point.x - building.x;
  const dy = point.y - building.y;
  const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
  const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
  return localX >= 0 && localX <= building.length && localY >= 0 && localY <= building.width;
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}
