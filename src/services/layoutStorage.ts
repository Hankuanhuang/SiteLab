import type {
  AncillaryBuilding,
  Building,
  BuildingColor,
  ContextZone,
  Entrance,
  EntranceLabelPosition,
  ExistingBuilding,
  ExistingTree,
  LayoutExport,
  Sidewalk,
  SidewalkEdge,
  SiteDimensions,
  SiteLabel,
  SiteShape,
  SetupRoad,
  Tree,
} from "../types/layout";

const buildingColors = new Set<string>([
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#84cc16",
  "#2563eb",
  "#06b6d4",
  "#9333ea",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6b7280",
]);

export function buildLayoutJson(
  site: SiteDimensions,
  buildings: Building[],
  siteLabels: SiteLabel[] = [],
  trees: Tree[] = [],
  sidewalks: Sidewalk[] = [],
  contextZones: ContextZone[] = [],
  roads: SetupRoad[] = [],
  ancillaryBuildings: AncillaryBuilding[] = [],
  existingBuildings: ExistingBuilding[] = [],
  existingTrees: ExistingTree[] = [],
  entrances: Entrance[] = [],
  projectName = "Untitled Layout",
  savedAt = new Date().toISOString(),
  siteShape: SiteShape = "rectangle",
  siteVertices: Array<{ x: number; y: number }> = [],
  edgeLengths: number[] = [],
  projectId?: string,
): LayoutExport {
  return {
    version: 1,
    ...(projectId ? { projectId } : {}),
    projectName: normalizeProjectName(projectName),
    savedAt,
    site: {
      length: site.length,
      width: site.width,
      shape: siteShape,
      ...(siteShape === "polygon"
        ? {
            vertices: siteVertices.map((point) => ({ x: round(point.x), y: round(point.y) })),
            edgeLengths: edgeLengths.map(round),
          }
        : {}),
    },
    buildings: buildings.map((building) => {
      const base = {
        id: building.id,
        label: building.label,
        programs: building.programs,
        x: round(building.x),
        y: round(building.y),
        rotation: building.rotation,
        color: building.color,
      };

      if (building.type === "square") {
        return {
          ...base,
          type: "square",
          size: round(building.length),
        };
      }

      return {
        ...base,
        type: building.type,
        length: round(building.length),
        width: round(building.width),
      };
    }),
    siteLabels: siteLabels.map((label) => ({
      ...label,
      x: round(label.x),
      y: round(label.y),
    })),
    trees: trees.map((tree) => ({
      ...tree,
      x: round(tree.x),
      y: round(tree.y),
      radius: round(tree.radius),
    })),
    sidewalks: sidewalks.map((sidewalk) => ({
      ...sidewalk,
      width: round(sidewalk.width),
    })),
    contextZones: contextZones.map((zone) => ({
      ...zone,
      points: zone.points.map((point) => ({
        x: round(point.x),
        y: round(point.y),
      })),
    })),
    roads: roads.map((road) => ({
      ...road,
      width: round(road.width),
      x: round(road.x),
      y: round(road.y),
      rectangleWidth: round(road.rectangleWidth),
      rectangleHeight: round(road.rectangleHeight),
    })),
    ancillaryBuildings: ancillaryBuildings.map((building) => ({
      ...building,
      points: building.points.map((point) => ({
        x: round(point.x),
        y: round(point.y),
      })),
    })),
    existingBuildings: existingBuildings.map((building) => ({
      ...building,
      points: building.points.map((point) => ({
        x: round(point.x),
        y: round(point.y),
      })),
    })),
    existingTrees: existingTrees.map((tree) => ({
      ...tree,
      x: round(tree.x),
      y: round(tree.y),
      radius: round(tree.radius),
      diameter: round(tree.diameter),
    })),
    entrances: entrances.map((entrance) => ({
      ...entrance,
      x: round(entrance.x),
      y: round(entrance.y),
      rotation: round(entrance.rotation),
    })),
  };
}

export function downloadLayoutJson(layout: LayoutExport) {
  const blob = new Blob([JSON.stringify(layout, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(layout.projectName)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseLayoutJson(
  value: unknown,
): {
  site: SiteDimensions;
  buildings: Building[];
  siteLabels: SiteLabel[];
  trees: Tree[];
  sidewalks: Sidewalk[];
  contextZones: ContextZone[];
  roads: SetupRoad[];
  ancillaryBuildings: AncillaryBuilding[];
  existingBuildings: ExistingBuilding[];
  existingTrees: ExistingTree[];
  entrances: Entrance[];
  projectName: string;
  savedAt: string;
  siteShape: SiteShape;
  siteVertices: Array<{ x: number; y: number }>;
  edgeLengths: number[];
  projectId?: string;
} | undefined {
  if (!isRecord(value)) return undefined;
  if (value.version !== 1) return undefined;
  if (!isRecord(value.site)) return undefined;
  if (!Array.isArray(value.buildings)) return undefined;

  const length = readPositiveNumber(value.site.length);
  const width = readPositiveNumber(value.site.width);
  if (length === undefined || width === undefined) return undefined;
  const siteShape = value.site.shape === "polygon" ? "polygon" : "rectangle";
  const siteVertices = siteShape === "polygon" ? readPoints(value.site.vertices) : [];
  const edgeLengths = siteShape === "polygon" ? readPositiveNumbers(value.site.edgeLengths) : [];
  if (
    siteVertices === undefined ||
    edgeLengths === undefined ||
    (siteShape === "polygon" && (siteVertices.length < 3 || edgeLengths.length !== siteVertices.length))
  ) {
    return undefined;
  }

  const buildings = value.buildings.map(readBuilding);
  if (buildings.some((building) => building === undefined)) return undefined;
  const siteLabels = readSiteLabels(value.siteLabels);
  if (siteLabels === undefined) return undefined;
  const trees = readTrees(value.trees);
  if (trees === undefined) return undefined;
  const sidewalks = readSidewalks(value.sidewalks);
  if (sidewalks === undefined) return undefined;
  const contextZones = readContextZones(value.contextZones);
  if (contextZones === undefined) return undefined;
  const roads = readRoads(value.roads);
  if (roads === undefined) return undefined;
  const ancillaryBuildings = readAncillaryBuildings(value.ancillaryBuildings);
  if (ancillaryBuildings === undefined) return undefined;
  const existingBuildings = readExistingBuildings(value.existingBuildings);
  if (existingBuildings === undefined) return undefined;
  const existingTrees = readExistingTrees(value.existingTrees);
  if (existingTrees === undefined) return undefined;
  const entrances = readEntrances(value.entrances, buildings as Building[]);
  if (entrances === undefined) return undefined;
  const projectName =
    typeof value.projectName === "string" ? normalizeProjectName(value.projectName) : "Untitled Layout";
  const projectId = typeof value.projectId === "string" && value.projectId ? value.projectId : undefined;
  const savedAt =
    typeof value.savedAt === "string" && !Number.isNaN(Date.parse(value.savedAt))
      ? value.savedAt
      : new Date(0).toISOString();

  return {
    site: {
      length,
      width,
      pixelsPerMeter: 10,
    },
    buildings: buildings as Building[],
    siteLabels,
    trees,
    sidewalks,
    contextZones,
    roads,
    ancillaryBuildings,
    existingBuildings,
    existingTrees,
    entrances,
    projectName,
    savedAt,
    siteShape,
    siteVertices,
    edgeLengths,
    projectId,
  };
}

function readBuilding(value: unknown): Building | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type !== "rectangle" && value.type !== "square" && value.type !== "bridge" && value.type !== "toilet") {
    return undefined;
  }

  const id = typeof value.id === "string" && value.id ? value.id : crypto.randomUUID();
  const label = typeof value.label === "string" ? value.label : value.type === "square" ? "Square" : "Rectangle";
  const programs = readPrograms(value.programs);
  const x = readNumber(value.x);
  const y = readNumber(value.y);
  const rotation = readNumber(value.rotation);
  const color = readColor(value.color);
  if (x === undefined || y === undefined || rotation === undefined || color === undefined) return undefined;

  if (value.type === "square") {
    const size = readPositiveNumber(value.size) ?? readPositiveNumber(value.length) ?? readPositiveNumber(value.width);
    if (size === undefined) return undefined;

    return {
      id,
      type: "square",
      label,
      programs,
      color,
      length: size,
      width: size,
      x,
      y,
      rotation,
    };
  }

  const length = readPositiveNumber(value.length);
  const width = readPositiveNumber(value.width);
  if (length === undefined || width === undefined) return undefined;

  return {
    id,
    type: value.type,
    label,
    programs,
    color,
    length,
    width,
    x,
    y,
    rotation,
  };
}

function readPrograms(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === "string" ? item.name : "";
    const area = readNumber(item.area);
    if (area === undefined || area < 0) return [];
    return [{ name, area }];
  });
}

function readSiteLabels(value: unknown): SiteLabel[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const labels = value.map((item) => {
    if (!isRecord(item) || item.type !== "siteLabel") return undefined;
    const id = typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
    const text = typeof item.text === "string" ? item.text : "";
    const x = readNumber(item.x);
    const y = readNumber(item.y);
    if (x === undefined || y === undefined) return undefined;
    return { id, type: "siteLabel" as const, text, x, y };
  });

  return labels.some((label) => label === undefined) ? undefined : (labels as SiteLabel[]);
}

function readTrees(value: unknown): Tree[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const trees = value.map((item) => {
    if (!isRecord(item) || item.type !== "tree") return undefined;
    const id = typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
    const x = readNumber(item.x);
    const y = readNumber(item.y);
    const radius = readPositiveNumber(item.radius);
    if (x === undefined || y === undefined || radius === undefined) return undefined;
    return { id, type: "tree" as const, x, y, radius };
  });

  return trees.some((tree) => tree === undefined) ? undefined : (trees as Tree[]);
}

function readSidewalks(value: unknown): Sidewalk[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const sidewalks = value.map((item) => {
    if (!isRecord(item) || item.type !== "sidewalk") return undefined;
    const edge = readSidewalkEdge(item.edge);
    const width = readPositiveNumber(item.width);
    if (!edge || width === undefined) return undefined;

    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type: "sidewalk" as const,
      edge,
      width,
      label: typeof item.label === "string" ? item.label : "Sidewalk",
    };
  });

  return sidewalks.some((sidewalk) => sidewalk === undefined)
    ? undefined
    : (sidewalks as Sidewalk[]);
}

function readSidewalkEdge(value: unknown): SidewalkEdge | undefined {
  return value === "top" || value === "bottom" || value === "left" || value === "right"
    ? value
    : undefined;
}

function readContextZones(value: unknown): ContextZone[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const zones = value
    .filter((item) => isRecord(item) && item.type === "greenPark")
    .map((item) => {
      if (!isRecord(item) || !Array.isArray(item.points) || item.points.length < 3) {
        return undefined;
      }
      const points = item.points.map((point) => {
        if (!isRecord(point)) return undefined;
        const x = readNumber(point.x);
        const y = readNumber(point.y);
        return x === undefined || y === undefined ? undefined : { x, y };
      });
      if (points.some((point) => point === undefined)) return undefined;

      return {
        id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
        type: "greenPark" as const,
        shape: item.shape === "rectangle" ? "rectangle" as const : "polygon" as const,
        label: typeof item.label === "string" && item.label ? item.label : "Green Park Area",
        points: points as Array<{ x: number; y: number }>,
      };
    });

  return zones.some((zone) => zone === undefined) ? undefined : (zones as ContextZone[]);
}

function readRoads(value: unknown): SetupRoad[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const roads = value.map((item) => {
    if (!isRecord(item)) return undefined;
    if (item.type !== "primary" && item.type !== "secondary" && item.type !== "pedestrian") {
      return undefined;
    }
    const width = readPositiveNumber(item.width);
    const x = readNumber(item.x);
    const y = readNumber(item.y);
    const rectangleWidth = readPositiveNumber(item.rectangleWidth);
    const rectangleHeight = readPositiveNumber(item.rectangleHeight);
    if (
      width === undefined ||
      x === undefined ||
      y === undefined ||
      rectangleWidth === undefined ||
      rectangleHeight === undefined
    ) {
      return undefined;
    }

    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type: item.type,
      width,
      x,
      y,
      rectangleWidth,
      rectangleHeight,
    };
  });

  return roads.some((road) => road === undefined) ? undefined : (roads as SetupRoad[]);
}

function readAncillaryBuildings(value: unknown): AncillaryBuilding[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const buildings = value.map((item) => {
    if (!isRecord(item) || (item.type !== "rectangle" && item.type !== "polygon")) {
      return undefined;
    }
    const points = readPoints(item.points);
    if (!points || points.length < 3) return undefined;
    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type: item.type,
      points,
      label: typeof item.label === "string" && item.label.trim()
        ? item.label
        : "Ancillary Building",
    };
  });

  return buildings.some((building) => building === undefined)
    ? undefined
    : (buildings as AncillaryBuilding[]);
}

function readExistingBuildings(value: unknown): ExistingBuilding[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const buildings = value.map((item) => {
    if (!isRecord(item) || (item.type !== "rectangle" && item.type !== "polygon")) {
      return undefined;
    }
    const points = readPoints(item.points);
    if (!points || points.length < 3) return undefined;
    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type: item.type,
      points,
      label: typeof item.label === "string" && item.label.trim()
        ? item.label
        : "Existing Building",
    };
  });

  return buildings.some((building) => building === undefined)
    ? undefined
    : (buildings as ExistingBuilding[]);
}

function readExistingTrees(value: unknown): ExistingTree[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const trees = value.map((item) => {
    if (!isRecord(item)) return undefined;
    const x = readNumber(item.x);
    const y = readNumber(item.y);
    const radius = readPositiveNumber(item.radius);
    const diameter = readPositiveNumber(item.diameter);
    if (x === undefined || y === undefined || radius === undefined || diameter === undefined) {
      return undefined;
    }
    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      x,
      y,
      radius,
      diameter,
      label: typeof item.label === "string" && item.label.trim()
        ? item.label
        : "Existing Tree",
    };
  });

  return trees.some((tree) => tree === undefined) ? undefined : (trees as ExistingTree[]);
}

function readEntrances(value: unknown, buildings: Building[]): Entrance[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const buildingIds = new Set(buildings.map((building) => building.id));

  const entrances = value.map((item) => {
    if (!isRecord(item) || item.type !== "entrance") return undefined;
    const label = readEntranceLabel(item.label);
    const buildingId = typeof item.buildingId === "string" ? item.buildingId : "";
    const x = readNumber(item.x);
    const y = readNumber(item.y);
    const rotation = readNumber(item.rotation);
    const labelPosition = readEntranceLabelPosition(item.labelPosition) ?? "bottom";
    if (!label || !buildingId || !buildingIds.has(buildingId) || x === undefined || y === undefined || rotation === undefined) {
      return undefined;
    }

    return {
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      type: "entrance" as const,
      label,
      buildingId,
      x,
      y,
      rotation: snapCardinalRotation(rotation),
      labelPosition,
    };
  });

  return entrances.some((entrance) => entrance === undefined)
    ? undefined
    : (entrances as Entrance[]);
}

function readEntranceLabel(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readEntranceLabelPosition(value: unknown): EntranceLabelPosition | undefined {
  return value === "top" || value === "bottom" || value === "left" || value === "right"
    ? value
    : undefined;
}

function snapCardinalRotation(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return Math.round(normalized / 90) * 90 % 360;
}

function readPoints(value: unknown): Array<{ x: number; y: number }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value.map((point) => {
    if (!isRecord(point)) return undefined;
    const x = readNumber(point.x);
    const y = readNumber(point.y);
    return x === undefined || y === undefined ? undefined : { x, y };
  });
  return points.some((point) => point === undefined)
    ? undefined
    : (points as Array<{ x: number; y: number }>);
}

function readPositiveNumbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const numbers = value.map(readPositiveNumber);
  return numbers.some((number) => number === undefined) ? undefined : (numbers as number[]);
}

function normalizeProjectName(value: string) {
  return value.trim() || "Untitled Layout";
}

function sanitizeFilename(value: string) {
  const normalized = normalizeProjectName(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim();
  return normalized || "Untitled Layout";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPositiveNumber(value: unknown) {
  const number = readNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function readColor(value: unknown): BuildingColor | undefined {
  return typeof value === "string" && buildingColors.has(value) ? (value as BuildingColor) : undefined;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
