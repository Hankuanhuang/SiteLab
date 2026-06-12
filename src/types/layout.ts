export type SiteShape = "rectangle" | "polygon";

export interface SiteData {
  site_page_index: number;
  site_shape: SiteShape;
  geometry: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  polygon?: {
    vertices: ContextPoint[];
    edgeLengths: number[];
  };
  scale: {
    pixels_per_meter: number;
    length_m: number;
    width_m: number;
  };
}

export interface SiteDimensions {
  length: number;
  width: number;
  pixelsPerMeter: number;
}

export interface PdfBackgroundMeta {
  page: {
    width: number;
    height: number;
  };
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  siteBoundary: {
    x: number;
    y: number;
    width: number;
    height: number;
    polygon?: ContextPoint[];
    edgeLengths?: number[];
  };
  siteShape?: SiteShape;
  contextZones?: ContextZone[];
  roads?: SetupRoad[];
  ancillaryBuildings?: AncillaryBuilding[];
  existingBuildings?: ExistingBuilding[];
  existingTrees?: ExistingTree[];
}

export type PdfBackgroundView = "crop" | "full";

export type ContextZoneType = "greenPark";

export interface ContextPoint {
  x: number;
  y: number;
}

export interface ContextZone {
  id: string;
  type: ContextZoneType;
  shape?: AncillaryBuildingShape;
  label?: string;
  points: ContextPoint[];
}

export type RoadType = "primary" | "secondary" | "pedestrian";

export interface SetupRoad {
  id: string;
  type: RoadType;
  width: number;
  points: ContextPoint[];
  // Legacy rectangle fields are accepted when loading older saved layouts.
  x?: number;
  y?: number;
  rectangleWidth?: number;
  rectangleHeight?: number;
}

export type AncillaryBuildingShape = "rectangle" | "polygon";

export interface AncillaryBuilding {
  id: string;
  type: AncillaryBuildingShape;
  points: ContextPoint[];
  label: string;
}

export interface ExistingBuilding {
  id: string;
  type: AncillaryBuildingShape;
  points: ContextPoint[];
  label: string;
}

export interface ExistingTree {
  id: string;
  x: number;
  y: number;
  radius: number;
  diameter: number;
  label: string;
}

export type BuildingType = "rectangle" | "square" | "bridge" | "toilet";

export type BuildingColor =
  | "#ef4444"
  | "#f97316"
  | "#eab308"
  | "#22c55e"
  | "#84cc16"
  | "#2563eb"
  | "#06b6d4"
  | "#9333ea"
  | "#8b5cf6"
  | "#ec4899"
  | "#14b8a6"
  | "#6b7280";

export interface Building {
  id: string;
  type: BuildingType;
  color: BuildingColor;
  label: string;
  programs: ProgramSpace[];
  length: number;
  width: number;
  x: number;
  y: number;
  rotation: number;
}

export interface ProgramSpace {
  name: string;
  area: number;
}

export interface SiteLabel {
  id: string;
  type: "siteLabel";
  text: string;
  x: number;
  y: number;
}

export interface Tree {
  id: string;
  type: "tree";
  x: number;
  y: number;
  radius: number;
}

export interface Sidewalk {
  id: string;
  type: "sidewalk";
  edgeIndex: number;
  start: ContextPoint;
  end: ContextPoint;
  normal: ContextPoint;
  width: number;
  label: string;
}

export type EntranceLabel =
  | "Main Entrance"
  | "Side Entrance"
  | "Service Entrance"
  | "Emergency Exit";

export type EntranceLabelPosition = "top" | "bottom" | "left" | "right";

export interface Entrance {
  id: string;
  type: "entrance";
  label: string;
  labelPosition: EntranceLabelPosition;
  buildingId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface ConceptPlanExport {
  id: string;
  projectId: string;
  name: string;
  layoutName: string;
  exportNumber: number;
  exportedAt: string;
  previewDataUrl: string;
  thumbnailDataUrl: string;
  favorite: boolean;
  renderedVersions?: ConceptPlanRenderedVersion[];
}

export interface ConceptPlanRenderedVersion {
  id: string;
  createdAt: string;
  previewDataUrl: string;
  thumbnailDataUrl: string;
}

export interface LayoutFile {
  version: 1;
  projectId?: string;
  projectName: string;
  savedAt: string;
  site: {
    length: number;
    width: number;
    shape?: SiteShape;
    vertices?: ContextPoint[];
    edgeLengths?: number[];
  };
  buildings: Array<
    | {
        id: string;
        type: "rectangle";
        label: string;
        programs: ProgramSpace[];
        length: number;
        width: number;
        x: number;
        y: number;
        rotation: number;
        color: BuildingColor;
      }
    | {
        id: string;
        type: "square";
        label: string;
        programs: ProgramSpace[];
        size: number;
        x: number;
        y: number;
        rotation: number;
        color: BuildingColor;
      }
    | {
        id: string;
        type: "bridge" | "toilet";
        label: string;
        programs: ProgramSpace[];
        length: number;
        width: number;
        x: number;
        y: number;
        rotation: number;
        color: BuildingColor;
      }
  >;
  siteLabels: SiteLabel[];
  trees: Tree[];
  sidewalks: Sidewalk[];
  entrances: Entrance[];
  contextZones: ContextZone[];
  roads?: SetupRoad[];
  ancillaryBuildings?: AncillaryBuilding[];
  existingBuildings?: ExistingBuilding[];
  existingTrees?: ExistingTree[];
}

export type LayoutExport = LayoutFile;
