import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Arrow, Circle, Group, Image, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  AncillaryBuilding,
  Building,
  ContextZone,
  Entrance,
  ExistingBuilding,
  ExistingTree,
  PdfBackgroundMeta,
  PdfBackgroundView,
  Sidewalk,
  SiteDimensions,
  SiteLabel,
  SetupRoad,
} from "../types/layout";
import type { Tree } from "../types/layout";
import { getSidewalkPoints, getUnitNormal } from "../utils/sidewalkGeometry";
import { BuildingShape } from "./BuildingShape";

interface SiteCanvasProps {
  site: SiteDimensions;
  buildings: Building[];
  siteLabels: SiteLabel[];
  trees: Tree[];
  sidewalks: Sidewalk[];
  entrances: Entrance[];
  selectedBuildingId?: string;
  selectedSiteLabelId?: string;
  selectedTreeId?: string;
  selectedSidewalkId?: string;
  selectedEntranceId?: string;
  isTreeToolActive: boolean;
  isSidewalkToolActive: boolean;
  isEntranceToolActive: boolean;
  backgroundImageSrc?: string;
  backgroundMeta?: PdfBackgroundMeta;
  backgroundView: PdfBackgroundView;
  backgroundOpacity: number;
  showBackground: boolean;
  showDistanceLines: boolean;
  onSelectBuilding: (id?: string) => void;
  onSelectSiteLabel: (id?: string) => void;
  onSelectTree: (id?: string) => void;
  onEditTreeDiameter: (tree: Tree) => void;
  onSelectSidewalk: (id?: string) => void;
  onSelectEntrance: (id?: string) => void;
  onPlaceEntrance: (building: Building, localX: number, localY: number) => void;
  onPlaceTree: (x: number, y: number) => void;
  onPlaceSidewalk: (sidewalk: Omit<Sidewalk, "id" | "type" | "width" | "label">) => void;
  onChangeBuilding: (building: Building, recordHistory?: boolean) => void;
  onChangeSiteLabel: (label: SiteLabel, recordHistory?: boolean) => void;
  onChangeTree: (tree: Tree, recordHistory?: boolean) => void;
  onChangeEntrance: (entrance: Entrance, recordHistory?: boolean) => void;
  onBeginBuildingEdit: () => void;
  onEndBuildingEdit: () => void;
}

const targetFitRatio = 1;
const gridRowSize = 24;
const topGridPaddingRows = 2.5;
const bottomGridPaddingRows = 2;
const defaultTreePlacementRadius = 2;
const minimumStageSize = {
  width: 720,
  height: 520,
};

interface AnalysisBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function SiteCanvas({
  site,
  buildings,
  siteLabels,
  trees,
  sidewalks,
  entrances,
  selectedBuildingId,
  selectedSiteLabelId,
  selectedTreeId,
  selectedSidewalkId,
  selectedEntranceId,
  isTreeToolActive,
  isSidewalkToolActive,
  isEntranceToolActive,
  backgroundImageSrc,
  backgroundMeta,
  backgroundView,
  backgroundOpacity,
  showBackground,
  showDistanceLines,
  onSelectBuilding,
  onSelectSiteLabel,
  onSelectTree,
  onEditTreeDiameter,
  onSelectSidewalk,
  onSelectEntrance,
  onPlaceEntrance,
  onPlaceTree,
  onPlaceSidewalk,
  onChangeBuilding,
  onChangeSiteLabel,
  onChangeTree,
  onChangeEntrance,
  onBeginBuildingEdit,
  onEndBuildingEdit,
}: SiteCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement>();
  const [viewport, setViewport] = useState(minimumStageSize);
  const [hoveredBoundaryEdge, setHoveredBoundaryEdge] = useState<number>();
  const [sidewalkPreview, setSidewalkPreview] = useState<Sidewalk>();
  const fullPage = backgroundMeta?.page ?? {
    width: site.width,
    height: site.length,
  };
  const crop = backgroundMeta?.crop ?? {
    x: 0,
    y: 0,
    width: fullPage.width,
    height: fullPage.height,
  };
  const sourcePage = backgroundView === "full" ? fullPage : { width: crop.width, height: crop.height };
  const pageScale = getFittedScale(sourcePage.width, sourcePage.height, viewport);
  const pageSize = {
    width: sourcePage.width * pageScale,
    height: sourcePage.height * pageScale,
  };
  const pageOffset = {
    x: Math.max(0, (viewport.width - pageSize.width) / 2),
    y: getTopFitOffset(viewport.height, pageSize.height),
  };
  const cropRelativeBoundary = backgroundMeta?.siteBoundary ?? {
    x: 0,
    y: 0,
    width: sourcePage.width,
    height: sourcePage.height,
  };
  const sourceBoundary =
    backgroundView === "full"
      ? {
          ...cropRelativeBoundary,
          x: crop.x + cropRelativeBoundary.x,
          y: crop.y + cropRelativeBoundary.y,
        }
      : cropRelativeBoundary;
  const boundary = {
    x: pageOffset.x + sourceBoundary.x * pageScale,
    y: pageOffset.y + sourceBoundary.y * pageScale,
    width: sourceBoundary.width * pageScale,
    height: sourceBoundary.height * pageScale,
  };
  const polygonBoundaryPoints =
    backgroundMeta?.siteShape === "polygon" && backgroundMeta.siteBoundary.polygon
      ? backgroundMeta.siteBoundary.polygon.flatMap((point) => [
          (point.x - backgroundMeta.siteBoundary.x) * pageScale,
          (point.y - backgroundMeta.siteBoundary.y) * pageScale,
        ])
      : [];
  const boundaryVertices = getBoundaryVertices(site, backgroundMeta);
  const buildingScale = {
    x: boundary.width / site.width,
    y: boundary.height / site.length,
  };
  const analysisBounds = getAnalysisBounds(crop, cropRelativeBoundary, site);
  const analysisPixelBounds = {
    minX: analysisBounds.minX * buildingScale.x,
    maxX: analysisBounds.maxX * buildingScale.x,
    minY: analysisBounds.minY * buildingScale.y,
    maxY: analysisBounds.maxY * buildingScale.y,
  };
  const renderSite: SiteDimensions = {
    ...site,
    pixelsPerMeter: Math.min(buildingScale.x, buildingScale.y),
  };
  const shouldShowBackground = showBackground && Boolean(backgroundImage);
  const contextZones = (backgroundMeta?.contextZones ?? []).filter(
    (zone) => zone.type === "greenPark",
  );
  const roads = backgroundMeta?.roads ?? [];
  const ancillaryBuildings = backgroundMeta?.ancillaryBuildings ?? [];
  const existingBuildings = backgroundMeta?.existingBuildings ?? [];
  const existingTrees = backgroundMeta?.existingTrees ?? [];
  const boundaryDimensionGuides = getBoundaryDimensionGuides(
    buildings,
    selectedBuildingId,
    { width: boundary.width, height: boundary.height },
    buildingScale,
  );
  const distanceLabels = getBuildingDistanceLabels(buildings, selectedBuildingId, buildingScale);

  const fitToScreen = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    setViewport({
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
    });
  }, []);

  useEffect(() => {
    if (!backgroundImageSrc) {
      setBackgroundImage(undefined);
      return;
    }

    const image = document.createElement("img");
    image.onload = () => setBackgroundImage(image);
    image.src = backgroundImageSrc;
  }, [backgroundImageSrc]);

  useEffect(() => {
    fitToScreen();
    const element = wrapRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => fitToScreen());
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitToScreen]);

  const handleEmptyCanvasPointer = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isTreeToolActive) {
      const pointer = event.target.getStage()?.getPointerPosition();
      if (!pointer) return;
      const localX = pointer.x - boundary.x;
      const localY = pointer.y - boundary.y;
      if (
        localX < analysisPixelBounds.minX ||
        localY < analysisPixelBounds.minY ||
        localX > analysisPixelBounds.maxX ||
        localY > analysisPixelBounds.maxY
      ) {
        return;
      }

      onPlaceTree(
        clampAnalysisCoordinate(
          localX / buildingScale.x,
          analysisBounds.minX,
          analysisBounds.maxX,
          defaultTreePlacementRadius,
        ),
        clampAnalysisCoordinate(
          localY / buildingScale.y,
          analysisBounds.minY,
          analysisBounds.maxY,
          defaultTreePlacementRadius,
        ),
      );
      return;
    }

    if (event.target !== event.target.getStage()) return;

    onSelectBuilding(undefined);
    onSelectSiteLabel(undefined);
    onSelectTree(undefined);
    onSelectSidewalk(undefined);
    onSelectEntrance(undefined);
  };

  const updateSidewalkPreview = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isTreeToolActive) {
      event.target.getStage()!.container().style.cursor = "crosshair";
      return;
    }
    if (!isSidewalkToolActive) return;
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const localPixel = { x: pointer.x - boundary.x, y: pointer.y - boundary.y };
    const edge = findNearestBoundaryEdge(localPixel, boundaryVertices, buildingScale);
    event.target.getStage()!.container().style.cursor = edge && edge.distance <= 14 ? "pointer" : "crosshair";
    if (!edge || edge.distance > 14) {
      setHoveredBoundaryEdge(undefined);
      setSidewalkPreview(undefined);
      return;
    }

    const cursor = {
      x: localPixel.x / buildingScale.x,
      y: localPixel.y / buildingScale.y,
    };
    setHoveredBoundaryEdge(edge.index);
    setSidewalkPreview({
      id: "sidewalk-preview",
      type: "sidewalk",
      edgeIndex: edge.index,
      start: edge.start,
      end: edge.end,
      normal: getUnitNormal(edge.start, edge.end, cursor),
      width: 6,
      label: "Sidewalk",
    });
  };

  useEffect(() => {
    const stage = wrapRef.current?.querySelector(".konvajs-content");
    if (!(stage instanceof HTMLElement)) return;
    stage.style.cursor = isTreeToolActive ? "crosshair" : "";
  }, [isTreeToolActive]);

  useEffect(() => {
    if (!isSidewalkToolActive) {
      setHoveredBoundaryEdge(undefined);
      setSidewalkPreview(undefined);
      const stage = wrapRef.current?.querySelector(".konvajs-content");
      if (stage instanceof HTMLElement) stage.style.cursor = "";
    }
  }, [isSidewalkToolActive]);

  return (
    <div
      ref={wrapRef}
      className="canvasWrap"
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button className="fitButton secondaryButton" type="button" onClick={fitToScreen}>
        Fit to Screen
      </button>
      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={handleEmptyCanvasPointer}
        onTouchStart={handleEmptyCanvasPointer}
        onMouseMove={updateSidewalkPreview}
        onTouchMove={updateSidewalkPreview}
        onMouseLeave={() => {
          setHoveredBoundaryEdge(undefined);
          setSidewalkPreview(undefined);
          const stage = wrapRef.current?.querySelector(".konvajs-content");
          if (stage instanceof HTMLElement) stage.style.cursor = "";
        }}
      >
        <Layer x={pageOffset.x} y={pageOffset.y} listening={false}>
          {shouldShowBackground && backgroundImage ? (
            <Image
              image={backgroundImage}
              x={0}
              y={0}
              width={pageSize.width}
              height={pageSize.height}
              opacity={backgroundOpacity}
              listening={false}
            />
          ) : null}
          {contextZones.map((zone) => (
            <ContextZoneShape
              key={zone.id}
              zone={zone}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
            />
          ))}
          {roads.map((road) => (
            <SetupRoadShape
              key={road.id}
              road={road}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
            />
          ))}
          {ancillaryBuildings.map((building, index) => (
            <AncillaryBuildingShape
              key={building.id}
              building={building}
              label={`Ancillary Building ${index + 1}`}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
            />
          ))}
          {existingBuildings.map((building, index) => (
            <ExistingBuildingShape
              key={building.id}
              building={building}
              label={`Existing Building ${index + 1}`}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
            />
          ))}
          {existingTrees.map((tree) => (
            <ExistingTreeShape
              key={tree.id}
              tree={tree}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
            />
          ))}
        </Layer>
        <Layer x={boundary.x} y={boundary.y} listening={false}>
          <Rect
            width={boundary.width}
            height={boundary.height}
            fill={shouldShowBackground ? "transparent" : "#f8fafc"}
            stroke={polygonBoundaryPoints.length ? undefined : "#0f766e"}
            strokeWidth={polygonBoundaryPoints.length ? 0 : 3}
            shadowColor="rgba(15, 23, 42, 0.18)"
            shadowBlur={10}
            shadowOffset={{ x: 0, y: 4 }}
          />
          {polygonBoundaryPoints.length ? (
            <Line
              points={polygonBoundaryPoints}
              closed
              fill={shouldShowBackground ? "transparent" : "rgba(248, 250, 252, 0.45)"}
              stroke="#0f766e"
              strokeWidth={3}
            />
          ) : null}
          <Text
            x={12}
            y={12}
            text={`${site.length.toFixed(1)}m x ${site.width.toFixed(1)}m`}
            fill="#334155"
            fontSize={16}
          />
        </Layer>
        {isSidewalkToolActive ? (
          <Layer x={boundary.x} y={boundary.y}>
            {boundaryVertices.map((start, index) => {
              const end = boundaryVertices[(index + 1) % boundaryVertices.length];
              return (
                <Line
                  key={index}
                  points={[
                    start.x * buildingScale.x,
                    start.y * buildingScale.y,
                    end.x * buildingScale.x,
                    end.y * buildingScale.y,
                  ]}
                  stroke={hoveredBoundaryEdge === index ? "#f97316" : "rgba(15, 118, 110, 0.38)"}
                  strokeWidth={hoveredBoundaryEdge === index ? 6 : 3}
                  hitStrokeWidth={28}
                  lineCap="round"
                  onClick={() => {
                    if (sidewalkPreview?.edgeIndex === index) {
                      onPlaceSidewalk({
                        edgeIndex: index,
                        start: sidewalkPreview.start,
                        end: sidewalkPreview.end,
                        normal: sidewalkPreview.normal,
                      });
                    }
                  }}
                  onTap={() => {
                    if (sidewalkPreview?.edgeIndex === index) {
                      onPlaceSidewalk({
                        edgeIndex: index,
                        start: sidewalkPreview.start,
                        end: sidewalkPreview.end,
                        normal: sidewalkPreview.normal,
                      });
                    }
                  }}
                />
              );
            })}
            {sidewalkPreview ? (
              <SidewalkShape
                sidewalk={sidewalkPreview}
                scale={buildingScale}
                isSelected
                isPreview
                onSelect={() => undefined}
              />
            ) : null}
          </Layer>
        ) : null}
        <Layer
          x={boundary.x}
          y={boundary.y}
          listening={!isSidewalkToolActive && !isTreeToolActive}
        >
          {sidewalks.map((sidewalk) => (
            <SidewalkShape
              key={sidewalk.id}
              sidewalk={sidewalk}
              scale={buildingScale}
              isSelected={sidewalk.id === selectedSidewalkId}
              onSelect={() => onSelectSidewalk(sidewalk.id)}
            />
          ))}
          {buildings.map((building) => (
            <BuildingShape
              key={building.id}
              building={building}
              site={renderSite}
              renderScale={buildingScale}
              showDimensionAnnotations={showDistanceLines}
              isSelected={building.id === selectedBuildingId}
              onSelect={() => onSelectBuilding(building.id)}
              onEntrancePlacement={isEntranceToolActive ? onPlaceEntrance : undefined}
              onChange={(nextBuilding) => onChangeBuilding(nextBuilding, false)}
              onEditStart={onBeginBuildingEdit}
              onEditEnd={onEndBuildingEdit}
            />
          ))}
          {siteLabels.map((label) => (
            <SiteLabelShape
              key={label.id}
              label={label}
              scale={buildingScale}
              analysisBounds={analysisBounds}
              isSelected={label.id === selectedSiteLabelId}
              onSelect={() => onSelectSiteLabel(label.id)}
              onChange={(nextLabel) => onChangeSiteLabel(nextLabel, false)}
              onEditStart={onBeginBuildingEdit}
              onEditEnd={onEndBuildingEdit}
            />
          ))}
          {trees.map((tree) => (
            <TreeShape
              key={tree.id}
              tree={tree}
              scale={buildingScale}
              analysisBounds={analysisBounds}
              isSelected={tree.id === selectedTreeId}
              onSelect={() => onSelectTree(tree.id)}
              onEditDiameter={() => onEditTreeDiameter(tree)}
              onChange={(nextTree) => onChangeTree(nextTree, false)}
              onEditStart={onBeginBuildingEdit}
              onEditEnd={onEndBuildingEdit}
            />
          ))}
          {entrances.map((entrance) => (
            <EntranceShape
              key={entrance.id}
              entrance={entrance}
              scale={buildingScale}
              analysisBounds={analysisBounds}
              isSelected={entrance.id === selectedEntranceId}
              onSelect={() => onSelectEntrance(entrance.id)}
              onChange={(nextEntrance) => onChangeEntrance(nextEntrance, false)}
              onEditStart={onBeginBuildingEdit}
              onEditEnd={onEndBuildingEdit}
            />
          ))}
          {showDistanceLines ? (
            <>
              <BoundaryDimensionGuides
                guides={boundaryDimensionGuides}
              />
              <DistanceAnnotations labels={distanceLabels} />
            </>
          ) : null}
        </Layer>
      </Stage>
    </div>
  );
}

function AncillaryBuildingShape({
  building,
  label,
  crop,
  backgroundView,
  pageScale,
}: {
  building: AncillaryBuilding;
  label: string;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const offsetX = backgroundView === "full" ? crop.x : 0;
  const offsetY = backgroundView === "full" ? crop.y : 0;
  const points = building.points.flatMap((point) => [
    (point.x + offsetX) * pageScale,
    (point.y + offsetY) * pageScale,
  ]);
  const center = building.points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 },
  );
  const centerX = ((center.x / building.points.length) + offsetX) * pageScale;
  const centerY = ((center.y / building.points.length) + offsetY) * pageScale;

  return (
    <Group listening={false}>
      <Line
        points={points}
        closed
        fill="rgba(120, 120, 120, 0.35)"
        stroke="rgba(80, 80, 80, 1)"
        strokeWidth={2}
      />
      <PolygonHatch points={points} color="rgba(80,80,80,0.42)" />
      <Text
        x={centerX - 80}
        y={centerY - 9}
        width={160}
        text={label}
        fill="#374151"
        fontSize={13}
        fontStyle="bold"
        align="center"
      />
    </Group>
  );
}

function ExistingBuildingShape({
  building,
  label,
  crop,
  backgroundView,
  pageScale,
}: {
  building: ExistingBuilding;
  label: string;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const points = getBackgroundShapePoints(building.points, crop, backgroundView, pageScale);
  const center = getFlatPointsCenter(points);
  return (
    <Group listening={false}>
      <Line
        points={points}
        closed
        fill="rgba(80,80,80,0.35)"
        stroke="rgba(50,50,50,1)"
        strokeWidth={2.5}
      />
      <Text
        x={center.x - 80}
        y={center.y - 9}
        width={160}
        text={label}
        fill="#262626"
        fontSize={13}
        fontStyle="bold"
        align="center"
      />
    </Group>
  );
}

function ExistingTreeShape({
  tree,
  crop,
  backgroundView,
  pageScale,
}: {
  tree: ExistingTree;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const offsetX = backgroundView === "full" ? crop.x : 0;
  const offsetY = backgroundView === "full" ? crop.y : 0;
  const x = (tree.x + offsetX) * pageScale;
  const y = (tree.y + offsetY) * pageScale;
  const radius = tree.radius * pageScale;
  return (
    <Group listening={false}>
      <Circle x={x} y={y} radius={radius} fill="rgba(34,197,94,0.3)" stroke="#166534" strokeWidth={2.5} />
      <Circle x={x - radius * 0.22} y={y - radius * 0.1} radius={radius * 0.48} fill="rgba(74,222,128,0.34)" />
      <Circle x={x + radius * 0.22} y={y + radius * 0.08} radius={radius * 0.42} fill="rgba(22,163,74,0.3)" />
      <Circle x={x} y={y} radius={Math.max(2, radius * 0.1)} fill="#166534" />
    </Group>
  );
}

function PolygonHatch({ points, color }: { points: number[]; color: string }) {
  if (points.length < 6) return null;
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spacing = 12;
  const lineCount = Math.ceil((maxX - minX + maxY - minY) / spacing) + 2;
  return (
    <Group
      listening={false}
      clipFunc={(context: Konva.Context) => {
        context.beginPath();
        context.moveTo(points[0], points[1]);
        for (let index = 2; index < points.length; index += 2) {
          context.lineTo(points[index], points[index + 1]);
        }
        context.closePath();
      }}
    >
      {Array.from({ length: lineCount }, (_, index) => {
        const offset = minX - (maxY - minY) + index * spacing;
        return (
          <Line
            key={offset}
            points={[offset, maxY, offset + (maxY - minY), minY]}
            stroke={color}
            strokeWidth={1.25}
          />
        );
      })}
    </Group>
  );
}

function getBackgroundShapePoints(
  sourcePoints: Array<{ x: number; y: number }>,
  crop: { x: number; y: number },
  backgroundView: PdfBackgroundView,
  pageScale: number,
) {
  const offsetX = backgroundView === "full" ? crop.x : 0;
  const offsetY = backgroundView === "full" ? crop.y : 0;
  return sourcePoints.flatMap((point) => [
    (point.x + offsetX) * pageScale,
    (point.y + offsetY) * pageScale,
  ]);
}

function getFlatPointsCenter(points: number[]) {
  let x = 0;
  let y = 0;
  const count = points.length / 2;
  for (let index = 0; index < points.length; index += 2) {
    x += points[index];
    y += points[index + 1];
  }
  return { x: x / count, y: y / count };
}

function SetupRoadShape({
  road,
  crop,
  backgroundView,
  pageScale,
}: {
  road: SetupRoad;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const offsetX = backgroundView === "full" ? crop.x : 0;
  const offsetY = backgroundView === "full" ? crop.y : 0;
  const x = (road.x + offsetX) * pageScale;
  const y = (road.y + offsetY) * pageScale;
  const width = road.rectangleWidth * pageScale;
  const height = road.rectangleHeight * pageScale;

  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        width={width}
        height={height}
        fill="rgba(180, 180, 180, 0.45)"
        stroke="rgba(120, 120, 120, 0.9)"
        strokeWidth={2}
      />
      <Text
        width={width}
        height={height}
        text={`${getSetupRoadLabel(road.type)} (${formatSetupRoadWidth(road.width)}m)`}
        fill="#374151"
        fontSize={Math.max(9, Math.min(16, Math.min(width, height) * 0.18))}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
      />
    </Group>
  );
}

function getSetupRoadLabel(type: SetupRoad["type"]) {
  if (type === "primary") return "Primary Road";
  if (type === "secondary") return "Secondary Road";
  return "Pedestrian Pathway";
}

function formatSetupRoadWidth(width: number) {
  return Number.isInteger(width) ? String(width) : width.toFixed(1);
}

function EntranceShape({
  entrance,
  scale,
  analysisBounds,
  isSelected,
  onSelect,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  entrance: Entrance;
  scale: { x: number; y: number };
  analysisBounds: AnalysisBounds;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (entrance: Entrance) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const x = entrance.x * scale.x;
  const y = entrance.y * scale.y;
  const arrowLength = 34;
  const labelWidth = 150;
  const labelHeight = 18;
  const verticalLabelGap = 10;
  const horizontalLabelGap = 5;
  const radians = (entrance.rotation * Math.PI) / 180;
  const tail = {
    x: -Math.sin(radians) * arrowLength,
    y: Math.cos(radians) * arrowLength,
  };
  const arrowBounds = {
    minX: Math.min(0, tail.x),
    maxX: Math.max(0, tail.x),
    minY: Math.min(0, tail.y),
    maxY: Math.max(0, tail.y),
  };
  const labelPosition = getEntranceLabelCoordinates(
    entrance.labelPosition,
    arrowBounds,
    labelWidth,
    labelHeight,
    verticalLabelGap,
    horizontalLabelGap,
  );

  return (
    <Group
      x={x}
      y={y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onEditStart}
      onDragMove={(event) => {
        const next = keepAnalysisNodeInside(event.target, analysisBounds, scale);
        onChange({ ...entrance, x: next.x, y: next.y });
      }}
      onDragEnd={onEditEnd}
    >
      <Arrow
        points={[0, arrowLength, 0, 0]}
        rotation={entrance.rotation}
        stroke="#dc2626"
        fill="#dc2626"
        strokeWidth={isSelected ? 5 : 4}
        pointerLength={10}
        pointerWidth={10}
        hitStrokeWidth={18}
      />
      <Circle radius={isSelected ? 5 : 3} fill="#dc2626" listening={false} />
      <Text
        x={labelPosition.x}
        y={labelPosition.y}
        width={labelWidth}
        height={labelHeight}
        text={entrance.label}
        fill="#b91c1c"
        fontSize={13}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        rotation={0}
        wrap="none"
        ellipsis
        listening={false}
      />
    </Group>
  );
}

function getEntranceLabelCoordinates(
  position: Entrance["labelPosition"],
  arrowBounds: { minX: number; maxX: number; minY: number; maxY: number },
  labelWidth: number,
  labelHeight: number,
  verticalGap: number,
  horizontalGap: number,
) {
  const arrowCenterX = (arrowBounds.minX + arrowBounds.maxX) / 2;
  const arrowCenterY = (arrowBounds.minY + arrowBounds.maxY) / 2;

  if (position === "top") {
    return {
      x: arrowCenterX - labelWidth / 2,
      y: arrowBounds.minY - verticalGap - labelHeight,
    };
  }
  if (position === "left") {
    return {
      x: arrowBounds.minX - horizontalGap - labelWidth,
      y: arrowCenterY - labelHeight / 2,
    };
  }
  if (position === "right") {
    return {
      x: arrowBounds.maxX + horizontalGap,
      y: arrowCenterY - labelHeight / 2,
    };
  }
  return {
    x: arrowCenterX - labelWidth / 2,
    y: arrowBounds.maxY + verticalGap,
  };
}

function ContextZoneShape({
  zone,
  crop,
  backgroundView,
  pageScale,
}: {
  zone: ContextZone;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const points = zone.points.flatMap((point) => [
    (point.x + (backgroundView === "full" ? crop.x : 0)) * pageScale,
    (point.y + (backgroundView === "full" ? crop.y : 0)) * pageScale,
  ]);
  return (
    <Group listening={false}>
      <Line
        points={points}
        closed
        fill="rgba(134, 239, 172, 0.28)"
        stroke="#16a34a"
        strokeWidth={2}
      />
      <PolygonHatch points={points} color="rgba(22,163,74,0.45)" />
    </Group>
  );
}

function SidewalkShape({
  sidewalk,
  scale,
  isSelected,
  isPreview = false,
  onSelect,
}: {
  sidewalk: Sidewalk;
  scale: { x: number; y: number };
  isSelected: boolean;
  isPreview?: boolean;
  onSelect: () => void;
}) {
  const points = getSidewalkPoints(sidewalk).flatMap((point) => [
    point.x * scale.x,
    point.y * scale.y,
  ]);
  const center = getFlatPointsCenter(points);

  return (
    <Group onClick={onSelect} onTap={onSelect} listening={!isPreview}>
      <Line
        points={points}
        closed
        fill={isPreview ? "rgba(249, 115, 22, 0.22)" : "#e5e7eb"}
        stroke={isSelected ? "#f97316" : "#9ca3af"}
        strokeWidth={isSelected ? 3 : 1.5}
        dash={isPreview ? [10, 6] : undefined}
      />
      {!isPreview ? (
        <Text
          x={center.x - 60}
          y={center.y - 9}
          width={120}
          text={sidewalk.label}
          fill="#4b5563"
          fontSize={14}
          fontStyle="bold"
          align="center"
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function getBoundaryVertices(site: SiteDimensions, backgroundMeta?: PdfBackgroundMeta) {
  const boundary = backgroundMeta?.siteBoundary;
  if (backgroundMeta?.siteShape === "polygon" && boundary?.polygon?.length && boundary.width && boundary.height) {
    return boundary.polygon.map((point) => ({
      x: ((point.x - boundary.x) / boundary.width) * site.width,
      y: ((point.y - boundary.y) / boundary.height) * site.length,
    }));
  }

  return [
    { x: 0, y: 0 },
    { x: site.width, y: 0 },
    { x: site.width, y: site.length },
    { x: 0, y: site.length },
  ];
}

function findNearestBoundaryEdge(
  pointer: { x: number; y: number },
  vertices: Array<{ x: number; y: number }>,
  scale: { x: number; y: number },
) {
  return vertices
    .map((start, index) => {
      const end = vertices[(index + 1) % vertices.length];
      return {
        index,
        start,
        end,
        distance: distanceToSegment(
          pointer,
          { x: start.x * scale.x, y: start.y * scale.y },
          { x: end.x * scale.x, y: end.y * scale.y },
        ),
      };
    })
    .reduce((nearest, edge) => (!nearest || edge.distance < nearest.distance ? edge : nearest), undefined as
      | { index: number; start: { x: number; y: number }; end: { x: number; y: number }; distance: number }
      | undefined);
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function TreeShape({
  tree,
  scale,
  analysisBounds,
  isSelected,
  onSelect,
  onEditDiameter,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  tree: Tree;
  scale: { x: number; y: number };
  analysisBounds: AnalysisBounds;
  isSelected: boolean;
  onSelect: () => void;
  onEditDiameter: () => void;
  onChange: (tree: Tree) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const radiusPx = tree.radius * Math.min(scale.x, scale.y);
  const [isHandleHovered, setIsHandleHovered] = useState(false);

  const setStageCursor = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>, cursor: string) => {
    const stage = event.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  return (
    <Group
      x={tree.x * scale.x}
      y={tree.y * scale.y}
      onDragStart={onEditStart}
      onDragMove={(event) => {
        const next = keepAnalysisNodeInside(event.target, analysisBounds, scale);
        onChange({ ...tree, x: next.x, y: next.y });
      }}
      onDragEnd={(event) => {
        event.target.draggable(false);
        onEditEnd();
        setStageCursor(event, isHandleHovered ? "move" : "");
      }}
    >
      <Circle
        radius={radiusPx}
        fill="rgba(34, 197, 94, 0.28)"
        stroke={isSelected ? "#f97316" : "#166534"}
        strokeWidth={isSelected ? 3 : 2}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={(event) => {
          event.cancelBubble = true;
          onSelect();
          onEditDiameter();
        }}
        onDblTap={(event) => {
          event.cancelBubble = true;
          onSelect();
          onEditDiameter();
        }}
      />
      <Text
        x={-radiusPx}
        y={-8}
        width={radiusPx * 2}
        text="Tree"
        fill="#14532d"
        fontSize={11}
        fontStyle="bold"
        align="center"
        listening={false}
      />
      <Circle
        radius={isHandleHovered ? 7 : isSelected ? 6 : 4.5}
        fill={isHandleHovered ? "#fb923c" : isSelected ? "#f97316" : "#166534"}
        stroke="#ffffff"
        strokeWidth={2}
        shadowColor="rgba(15, 23, 42, 0.28)"
        shadowBlur={4}
        hitStrokeWidth={12}
        onMouseEnter={(event) => {
          setIsHandleHovered(true);
          setStageCursor(event, "move");
        }}
        onDblClick={(event) => {
          event.cancelBubble = true;
          onSelect();
          onEditDiameter();
        }}
        onDblTap={(event) => {
          event.cancelBubble = true;
          onSelect();
          onEditDiameter();
        }}
        onMouseLeave={(event) => {
          setIsHandleHovered(false);
          if (!event.target.isDragging()) setStageCursor(event, "");
        }}
        onMouseDown={(event) => {
          event.cancelBubble = true;
          onSelect();
          const group = event.target.getParent();
          const stage = event.target.getStage();
          const parent = group?.getParent();
          const pointer = stage?.getPointerPosition();
          if (!group || !parent || !pointer) return;

          const localPointer = parent.getAbsoluteTransform().copy().invert().point(pointer);
          group.position(localPointer);
          group.draggable(true);
          group.startDrag();
        }}
        onTouchStart={(event) => {
          event.cancelBubble = true;
          onSelect();
          const group = event.target.getParent();
          const stage = event.target.getStage();
          const parent = group?.getParent();
          const pointer = stage?.getPointerPosition();
          if (!group || !parent || !pointer) return;

          const localPointer = parent.getAbsoluteTransform().copy().invert().point(pointer);
          group.position(localPointer);
          group.draggable(true);
          group.startDrag();
        }}
      />
      {isSelected ? (
        <Text
          x={-70}
          y={radiusPx + 10}
          width={140}
          text={`Diameter: ${formatMeters(tree.radius * 2)}m`}
          fill="#14532d"
          fontSize={13}
          fontStyle="bold"
          align="center"
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function formatMeters(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function SiteLabelShape({
  label,
  scale,
  analysisBounds,
  isSelected,
  onSelect,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: SiteLabel;
  scale: { x: number; y: number };
  analysisBounds: AnalysisBounds;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (label: SiteLabel) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <Text
      x={label.x * scale.x}
      y={label.y * scale.y}
      text={label.text}
      fill="#111827"
      fontSize={18}
      fontStyle="bold"
      padding={4}
      stroke={isSelected ? "#f97316" : undefined}
      strokeWidth={isSelected ? 0.5 : 0}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onEditStart}
      onDragMove={(event) => {
        const next = keepAnalysisNodeInside(event.target, analysisBounds, scale);
        onChange({ ...label, x: next.x, y: next.y });
      }}
      onDragEnd={onEditEnd}
    />
  );
}

function getAnalysisBounds(
  crop: { width: number; height: number },
  boundary: { x: number; y: number; width: number; height: number },
  site: SiteDimensions,
): AnalysisBounds {
  if (boundary.width <= 0 || boundary.height <= 0) {
    return { minX: 0, maxX: site.width, minY: 0, maxY: site.length };
  }

  return {
    minX: -(boundary.x / boundary.width) * site.width,
    maxX: ((crop.width - boundary.x) / boundary.width) * site.width,
    minY: -(boundary.y / boundary.height) * site.length,
    maxY: ((crop.height - boundary.y) / boundary.height) * site.length,
  };
}

function keepAnalysisNodeInside(
  node: Konva.Node,
  bounds: AnalysisBounds,
  scale: { x: number; y: number },
) {
  const pixelBounds = {
    minX: bounds.minX * scale.x,
    maxX: bounds.maxX * scale.x,
    minY: bounds.minY * scale.y,
    maxY: bounds.maxY * scale.y,
  };
  const box = node.getClientRect({ relativeTo: node.getLayer() ?? undefined });
  let correctionX = 0;
  let correctionY = 0;

  if (box.x < pixelBounds.minX) correctionX = pixelBounds.minX - box.x;
  if (box.y < pixelBounds.minY) correctionY = pixelBounds.minY - box.y;
  if (box.x + box.width > pixelBounds.maxX) correctionX = pixelBounds.maxX - (box.x + box.width);
  if (box.y + box.height > pixelBounds.maxY) correctionY = pixelBounds.maxY - (box.y + box.height);

  if (correctionX || correctionY) {
    node.position({
      x: node.x() + correctionX,
      y: node.y() + correctionY,
    });
  }

  return {
    x: node.x() / scale.x,
    y: node.y() / scale.y,
  };
}

function clampAnalysisCoordinate(value: number, min: number, max: number, padding: number) {
  const effectivePadding = Math.min(padding, (max - min) / 2);
  return Math.max(min + effectivePadding, Math.min(max - effectivePadding, value));
}

function BoundaryDimensionGuides({
  guides,
}: {
  guides: BoundaryGuide[];
}) {
  return (
    <>
      {guides.map((guide) => (
        <Fragment key={guide.id}>
          <Arrow
            points={guide.points}
            stroke="#f97316"
            fill="#f97316"
            strokeWidth={1.5}
            pointerAtBeginning
            pointerAtEnding
            pointerLength={8}
            pointerWidth={8}
            listening={false}
          />
          <Text
            x={guide.labelX}
            y={guide.labelY}
            width={64}
            text={guide.label}
            fill="#f97316"
            fontSize={13}
            fontStyle="bold"
            align="center"
            listening={false}
          />
        </Fragment>
      ))}
    </>
  );
}

interface BoundaryGuide {
  id: string;
  points: number[];
  label: string;
  labelX: number;
  labelY: number;
}

function getBoundaryDimensionGuides(
  buildings: Building[],
  selectedBuildingId: string | undefined,
  boundarySize: { width: number; height: number },
  scale: { x: number; y: number },
): BoundaryGuide[] {
  if (!selectedBuildingId) return [];

  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId);
  if (!selectedBuilding) return [];

  const bounds = getRotatedBounds(selectedBuilding, scale);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return [
    {
      id: "left",
      points: [0, centerY, bounds.minX, centerY],
      label: `${Math.max(0, bounds.minX / scale.x).toFixed(1)}m`,
      labelX: bounds.minX / 2 - 32,
      labelY: centerY - 22,
    },
    {
      id: "right",
      points: [bounds.maxX, centerY, boundarySize.width, centerY],
      label: `${Math.max(0, (boundarySize.width - bounds.maxX) / scale.x).toFixed(1)}m`,
      labelX: (bounds.maxX + boundarySize.width) / 2 - 32,
      labelY: centerY - 22,
    },
    {
      id: "top",
      points: [centerX, 0, centerX, bounds.minY],
      label: `${Math.max(0, bounds.minY / scale.y).toFixed(1)}m`,
      labelX: centerX + 10,
      labelY: bounds.minY / 2 - 10,
    },
    {
      id: "bottom",
      points: [centerX, bounds.maxY, centerX, boundarySize.height],
      label: `${Math.max(0, (boundarySize.height - bounds.maxY) / scale.y).toFixed(1)}m`,
      labelX: centerX + 10,
      labelY: (bounds.maxY + boundarySize.height) / 2 - 10,
    },
  ];

}

function DistanceAnnotations({
  labels,
}: {
  labels: DistanceLabel[];
}) {
  return (
    <>
      {labels.map((label, index) => (
        <Text
          key={`${label.kind}-${index}-${label.x}-${label.y}`}
          x={label.x - 28}
          y={label.y - 9}
          width={56}
          text={`${label.distance.toFixed(1)} m`}
          fill="#f97316"
          fontSize={13}
          fontStyle="bold"
          align="center"
          listening={false}
        />
      ))}
    </>
  );
}

interface DistanceLabel {
  kind: "horizontal" | "vertical";
  x: number;
  y: number;
  distance: number;
}

function getBuildingDistanceLabels(
  buildings: Building[],
  selectedBuildingId: string | undefined,
  scale: { x: number; y: number },
): DistanceLabel[] {
  if (!selectedBuildingId) return [];

  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId);
  if (!selectedBuilding) return [];

  const selectedBounds = getRotatedBounds(selectedBuilding, scale);
  return buildings
    .filter((building) => building.id !== selectedBuildingId)
    .flatMap((building) => getDistanceLabels(selectedBounds, getRotatedBounds(building, scale), scale));
}

function getDistanceLabels(
  selected: Bounds,
  other: Bounds,
  scale: { x: number; y: number },
): Array<{ kind: "horizontal" | "vertical"; x: number; y: number; distance: number }> {
  const labels: Array<{ kind: "horizontal" | "vertical"; x: number; y: number; distance: number }> = [];
  const horizontalGap =
    selected.maxX < other.minX
      ? { start: selected.maxX, end: other.minX }
      : other.maxX < selected.minX
        ? { start: other.maxX, end: selected.minX }
        : undefined;
  const verticalGap =
    selected.maxY < other.minY
      ? { start: selected.maxY, end: other.minY }
      : other.maxY < selected.minY
        ? { start: other.maxY, end: selected.minY }
        : undefined;

  if (horizontalGap) {
    labels.push({
      kind: "horizontal",
      x: (horizontalGap.start + horizontalGap.end) / 2,
      y: getIntervalAnchor(selected.minY, selected.maxY, other.minY, other.maxY),
      distance: (horizontalGap.end - horizontalGap.start) / scale.x,
    });
  }

  if (verticalGap) {
    labels.push({
      kind: "vertical",
      x: getIntervalAnchor(selected.minX, selected.maxX, other.minX, other.maxX),
      y: (verticalGap.start + verticalGap.end) / 2,
      distance: (verticalGap.end - verticalGap.start) / scale.y,
    });
  }

  return labels;
}

function getIntervalAnchor(minA: number, maxA: number, minB: number, maxB: number) {
  const overlapStart = Math.max(minA, minB);
  const overlapEnd = Math.min(maxA, maxB);

  if (overlapEnd >= overlapStart) {
    return (overlapStart + overlapEnd) / 2;
  }

  return (minA + maxA + minB + maxB) / 4;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function getRotatedBounds(building: Building, scale: { x: number; y: number }): Bounds {
  const x = building.x * scale.x;
  const y = building.y * scale.y;
  const width = building.length * scale.x;
  const height = building.width * scale.y;
  const radians = (building.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    rotatePoint(0, 0, x, y, cos, sin),
    rotatePoint(width, 0, x, y, cos, sin),
    rotatePoint(width, height, x, y, cos, sin),
    rotatePoint(0, height, x, y, cos, sin),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function rotatePoint(localX: number, localY: number, originX: number, originY: number, cos: number, sin: number) {
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos,
  };
}

function getFittedScale(width: number, height: number, viewport: { width: number; height: number }) {
  const fitWidth = (viewport.width * targetFitRatio) / width;
  const fitHeight = (viewport.height * targetFitRatio) / height;
  return Math.max(0.01, Math.min(fitWidth, fitHeight));
}

function getTopFitOffset(viewportHeight: number, pageHeight: number) {
  const preferredTopPadding = gridRowSize * topGridPaddingRows;
  const preferredBottomPadding = gridRowSize * bottomGridPaddingRows;

  if (viewportHeight <= preferredTopPadding) {
    return Math.max(0, viewportHeight - pageHeight);
  }

  return Math.max(
    0,
    Math.min(
      preferredTopPadding,
      viewportHeight - pageHeight - preferredBottomPadding,
    ),
  );
}
