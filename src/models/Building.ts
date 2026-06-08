import type { Building } from "../types/layout";

export function createRectangle(length = 20, width = 12): Building {
  return {
    id: crypto.randomUUID(),
    type: "rectangle",
    color: "#2563eb",
    label: "Rectangle",
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
    programs: [],
    length: 10,
    width: 10,
    x: 4,
    y: 4,
    rotation: 0,
  };
}
