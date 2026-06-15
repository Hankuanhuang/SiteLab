import type { Building, BuildingColor, BuildingType, CoreVariant } from "../types/layout";

export const DEFAULT_BUILDING_LABEL_FONT_SIZE = 14;
export const DEFAULT_CORE_COLOR: BuildingColor = "#d1d5db";

export interface CoreToolOption {
  id: string;
  type: Extract<BuildingType, "stair" | "elevator">;
  variant: CoreVariant;
  name: string;
  width: number;
  height: number;
  label: string;
}

export interface CoreToolGroup {
  id: "stair" | "elevator";
  name: string;
  options: CoreToolOption[];
}

export const coreToolGroups: CoreToolGroup[] = [
  {
    id: "stair",
    name: "Stairs",
    options: [
      { id: "stair-thick", type: "stair", variant: "thick", name: "Thick Stair", width: 2.5, height: 5, label: "STAIR" },
      { id: "stair-thin", type: "stair", variant: "thin", name: "Thin Stair", width: 1.5, height: 6, label: "STAIR" },
    ],
  },
  {
    id: "elevator",
    name: "Elevator",
    options: [
      { id: "elevator-single", type: "elevator", variant: "single", name: "Single Elevator", width: 2.5, height: 2.5, label: "ELEVATOR" },
      { id: "elevator-double", type: "elevator", variant: "double", name: "Double Elevator", width: 5, height: 2.5, label: "2 ELEVATORS" },
    ],
  },
];

export function createRectangle(length = 20, width = 12): Building {
  return {
    id: crypto.randomUUID(),
    type: "rectangle",
    color: "#2563eb",
    label: "Building",
    labelFontSize: DEFAULT_BUILDING_LABEL_FONT_SIZE,
    programs: [],
    length,
    width,
    x: 2,
    y: 2,
    rotation: 0,
  };
}

export function createSquare(size = 10): Building {
  return {
    id: crypto.randomUUID(),
    type: "square",
    color: "#f97316",
    label: "Square",
    labelFontSize: DEFAULT_BUILDING_LABEL_FONT_SIZE,
    programs: [],
    length: size,
    width: size,
    x: 4,
    y: 4,
    rotation: 0,
  };
}

export function createBridge(): Building {
  return {
    id: crypto.randomUUID(),
    type: "bridge",
    color: "#8b5cf6",
    label: "Bridge",
    labelFontSize: DEFAULT_BUILDING_LABEL_FONT_SIZE,
    programs: [],
    length: 30,
    width: 4,
    x: 2,
    y: 2,
    rotation: 0,
  };
}

export function createToilet(): Building {
  return {
    id: crypto.randomUUID(),
    type: "toilet",
    color: "#14b8a6",
    label: "Toilet",
    labelFontSize: DEFAULT_BUILDING_LABEL_FONT_SIZE,
    programs: [],
    length: 10,
    width: 10,
    x: 4,
    y: 4,
    rotation: 0,
  };
}

export function createCore(coreId: string): Building {
  const option = coreToolGroups.flatMap((group) => group.options).find((item) => item.id === coreId);
  if (!option) {
    throw new Error(`Unknown core tool option: ${coreId}`);
  }

  return {
    id: crypto.randomUUID(),
    type: option.type,
    coreVariant: option.variant,
    color: DEFAULT_CORE_COLOR,
    label: option.label,
    labelFontSize: DEFAULT_BUILDING_LABEL_FONT_SIZE,
    programs: [],
    length: option.width,
    width: option.height,
    x: 4,
    y: 4,
    rotation: 0,
  };
}

export function isCoreBuilding(building: Building) {
  return building.type === "stair" || building.type === "elevator";
}
