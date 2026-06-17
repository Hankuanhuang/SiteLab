import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
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
  ProjectSite,
  Sidewalk,
  SiteDimensions,
  SiteLabel,
  SetupRoad,
} from "../types/layout";
import type { Tree } from "../types/layout";
import { getPrimaryProjectSite, getProjectSiteBoundaryPoints, getProjectSites } from "../services/projectSites";
import { getCoreParentBuildingRotation } from "../utils/coreRotation";
import { getEntranceAnnotationGap, getEntranceLabelCoordinates } from "../utils/entranceAnnotation";
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
  selectedProjectSiteId?: string;
  selectedRoadId?: string;
  selectedAncillaryBuildingId?: string;
  selectedExistingBuildingId?: string;
  isTreeToolActive: boolean;
  isSidewalkToolActive: boolean;
  isEntranceToolActive: boolean;
  backgroundImageSrc?: string;
  backgroundMeta?: PdfBackgroundMeta;
  backgroundView: PdfBackgroundView;
  backgroundOpacity: number;
  showBackground: boolean;
  showBoundaryDistanceLines: boolean;
  showBuildingDimensions: boolean;
  onSiteChange: (site: SiteDimensions) => void;
  onSelectBuilding: (id?: string) => void;
  onSelectSiteLabel: (id?: string) => void;
  onSelectTree: (id?: string) => void;
  onEditTreeDiameter: (tree: Tree) => void;
  onSelectSidewalk: (id?: string) => void;
  onSelectEntrance: (id?: string) => void;
  onSelectProjectSite: (id?: string) => void;
  onSelectRoadLabel: (id?: string) => void;
  onSelectAncillaryBuildingLabel: (id?: string) => void;
  onSelectExistingBuildingLabel: (id?: string) => void;
  onPlaceEntrance: (building: Building, localX: number, localY: number) => void;
  onPlaceTree: (x: number, y: number) => void;
  onPlaceSidewalk: (sidewalk: Omit<Sidewalk, "id" | "type" | "width" | "label">) => void;
  onViewportCenterChange: (center: { x: number; y: number }) => void;
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
const siteBadgePreferredWidth = 220;
const siteBadgeMinimumWidth = 160;
const siteBadgeEstimatedHeight = 168;
const siteBadgeGap = 18;
const maximumZoomScale = 12;
const minimumStageSize = {
  width: 720,
  height: 520,
};
const entranceLabelMeasureContext =
  typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;

interface AnalysisBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CanvasCamera {
  scale: number;
  x: number;
  y: number;
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
  selectedProjectSiteId,
  selectedRoadId,
  selectedAncillaryBuildingId,
  selectedExistingBuildingId,
  isTreeToolActive,
  isSidewalkToolActive,
  isEntranceToolActive,
  backgroundImageSrc,
  backgroundMeta,
  backgroundView,
  backgroundOpacity,
  showBackground,
  showBoundaryDistanceLines,
  showBuildingDimensions,
  onSiteChange,
  onSelectBuilding,
  onSelectSiteLabel,
  onSelectTree,
  onEditTreeDiameter,
  onSelectSidewalk,
  onSelectEntrance,
  onSelectProjectSite,
  onSelectRoadLabel,
  onSelectAncillaryBuildingLabel,
  onSelectExistingBuildingLabel,
  onPlaceEntrance,
  onPlaceTree,
  onPlaceSidewalk,
  onViewportCenterChange,
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
  const [isPanning, setIsPanning] = useState(false);
  const panPointerRef = useRef<{ clientX: number; clientY: number } | undefined>(undefined);
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
  const projectSites = getProjectSites(backgroundMeta, site);
  const primaryProjectSite = getPrimaryProjectSite(backgroundMeta, site);
  const [camera, setCamera] = useState<CanvasCamera>(() => getCropFitCamera(minimumStageSize, crop, backgroundView));
  const sourcePage = backgroundView === "full" ? fullPage : { width: crop.width, height: crop.height };
  const pageScale = camera.scale;
  const pageSize = {
    width: sourcePage.width * pageScale,
    height: sourcePage.height * pageScale,
  };
  const pageOffset = {
    x: camera.x,
    y: camera.y,
  };
  const cropSourceOffset = {
    x: (backgroundView === "full" ? crop.x : 0) * pageScale,
    y: (backgroundView === "full" ? crop.y : 0) * pageScale,
  };
  const cropFrame = {
    x: pageOffset.x + cropSourceOffset.x,
    y: pageOffset.y + cropSourceOffset.y,
    width: crop.width * pageScale,
    height: crop.height * pageScale,
  };
  const cropRelativeBoundary = primaryProjectSite?.boundary ?? backgroundMeta?.siteBoundary ?? {
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
    primaryProjectSite?.shape === "polygon" && primaryProjectSite.boundary.polygon
      ? primaryProjectSite.boundary.polygon.flatMap((point) => [
          (point.x - primaryProjectSite.boundary.x) * pageScale,
          (point.y - primaryProjectSite.boundary.y) * pageScale,
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
  const siteBadgeWidth = Math.min(
    siteBadgePreferredWidth,
    Math.max(siteBadgeMinimumWidth, cropFrame.x - siteBadgeGap * 2),
  );
  const siteBadgeLeft = Math.max(siteBadgeGap, cropFrame.x - siteBadgeWidth - siteBadgeGap);
  const siteBadgeTop = clampNumber(
    cropFrame.y + cropFrame.height - siteBadgeEstimatedHeight - siteBadgeGap,
    siteBadgeGap,
    Math.max(siteBadgeGap, viewport.height - siteBadgeEstimatedHeight - siteBadgeGap),
  );

  useEffect(() => {
    if (buildingScale.x <= 0 || buildingScale.y <= 0) return;
    onViewportCenterChange({
      x: clampNumber(
        (viewport.width / 2 - boundary.x) / buildingScale.x,
        analysisBounds.minX,
        analysisBounds.maxX,
      ),
      y: clampNumber(
        (viewport.height / 2 - boundary.y) / buildingScale.y,
        analysisBounds.minY,
        analysisBounds.maxY,
      ),
    });
  }, [
    analysisBounds.maxX,
    analysisBounds.maxY,
    analysisBounds.minX,
    analysisBounds.minY,
    boundary.x,
    boundary.y,
    buildingScale.x,
    buildingScale.y,
    onViewportCenterChange,
    viewport.height,
    viewport.width,
  ]);

  const fitToScreen = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const nextViewport = {
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
    };
    setViewport(nextViewport);
    setCamera(getCropFitCamera(nextViewport, crop, backgroundView));
  }, [backgroundView, crop.height, crop.width, crop.x, crop.y]);

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
    onSelectProjectSite(undefined);
    onSelectRoadLabel(undefined);
    onSelectAncillaryBuildingLabel(undefined);
    onSelectExistingBuildingLabel(undefined);
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

  useEffect(() => {
    if (!isPanning) return;

    const finishPanning = () => {
      panPointerRef.current = undefined;
      setIsPanning(false);
    };
    const handlePanMove = (event: MouseEvent) => {
      const previous = panPointerRef.current;
      if (!previous || !(event.buttons & 4)) {
        finishPanning();
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - previous.clientX;
      const deltaY = event.clientY - previous.clientY;
      panPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      setCamera((current) =>
        constrainCamera(
          {
            ...current,
            x: current.x + deltaX,
            y: current.y + deltaY,
          },
          viewport,
          crop,
          backgroundView,
        ),
      );
    };
    const handlePanEnd = (event: MouseEvent) => {
      if (event.button === 1) finishPanning();
    };

    window.addEventListener("mousemove", handlePanMove, true);
    window.addEventListener("mouseup", handlePanEnd, true);
    window.addEventListener("blur", finishPanning);
    return () => {
      window.removeEventListener("mousemove", handlePanMove, true);
      window.removeEventListener("mouseup", handlePanEnd, true);
      window.removeEventListener("blur", finishPanning);
    };
  }, [backgroundView, crop, isPanning, viewport]);

  const startMiddleMousePan = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    panPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    setHoveredBoundaryEdge(undefined);
    setSidewalkPreview(undefined);
    setIsPanning(true);
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const minimumScale = getFittedScale(crop.width, crop.height, viewport);
    const zoomFactor = event.deltaY > 0 ? 1 / 1.08 : 1.08;

    setCamera((current) => {
      const nextScale = clampNumber(current.scale * zoomFactor, minimumScale, maximumZoomScale);
      if (Math.abs(nextScale - current.scale) < 0.0001) return current;
      if (Math.abs(nextScale - minimumScale) < 0.0001) {
        return getCropFitCamera(viewport, crop, backgroundView);
      }

      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return constrainCamera(
        {
          scale: nextScale,
          x: pointerX - worldX * nextScale,
          y: pointerY - worldY * nextScale,
        },
        viewport,
        crop,
        backgroundView,
      );
    });
  };

  return (
    <div
      ref={wrapRef}
      className={`canvasWrap ${isPanning ? "isPanning" : ""}`}
      onMouseDownCapture={startMiddleMousePan}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onWheel={handleCanvasWheel}
    >
      <button className="fitButton secondaryButton" type="button" onClick={fitToScreen}>
        Fit to Screen
      </button>
      <section
        className="siteBadge"
        style={{
          left: `${siteBadgeLeft}px`,
          top: `${siteBadgeTop}px`,
          width: `${siteBadgeWidth}px`,
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <p className="siteBadgeTitle">Site</p>
        <label className="siteBadgeField">
          <span>Length (m)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={site.length.toFixed(1)}
            onChange={(event) => onSiteChange({ ...site, length: Number(event.target.value) || 1 })}
          />
        </label>
        <label className="siteBadgeField">
          <span>Width (m)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={site.width.toFixed(1)}
            onChange={(event) => onSiteChange({ ...site, width: Number(event.target.value) || 1 })}
          />
        </label>
      </section>
      <Stage
        width={viewport.width}
        height={viewport.height}
        listening={!isPanning}
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
          <Group
            clipX={(backgroundView === "full" ? crop.x : 0) * pageScale}
            clipY={(backgroundView === "full" ? crop.y : 0) * pageScale}
            clipWidth={crop.width * pageScale}
            clipHeight={crop.height * pageScale}
          >
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
                isSelected={road.id === selectedRoadId}
                onSelect={() => onSelectRoadLabel(road.id)}
                crop={crop}
                backgroundView={backgroundView}
                pageScale={pageScale}
                pixelsPerMeter={renderSite.pixelsPerMeter}
              />
            ))}
            {ancillaryBuildings.map((building, index) => (
              <AncillaryBuildingShape
                key={building.id}
                building={building}
                displayLabel={getIndexedBackgroundLabel(building.label, "Ancillary Building", index)}
                isSelected={building.id === selectedAncillaryBuildingId}
                onSelect={() => onSelectAncillaryBuildingLabel(building.id)}
                crop={crop}
                backgroundView={backgroundView}
                pageScale={pageScale}
              />
            ))}
            {existingBuildings.map((building, index) => (
              <ExistingBuildingShape
                key={building.id}
                building={building}
                displayLabel={getIndexedBackgroundLabel(building.label, "Existing Building", index)}
                isSelected={building.id === selectedExistingBuildingId}
                onSelect={() => onSelectExistingBuildingLabel(building.id)}
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
          </Group>
        </Layer>
        <Layer x={pageOffset.x} y={pageOffset.y}>
          {projectSites.map((projectSite, index) => (
            <ProjectSiteBoundaryShape
              key={projectSite.id}
              projectSite={projectSite}
              isPrimary={index === 0}
              isSelected={projectSite.id === selectedProjectSiteId}
              crop={crop}
              backgroundView={backgroundView}
              pageScale={pageScale}
              onSelect={() => onSelectProjectSite(projectSite.id)}
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
              dragBounds={analysisBounds}
              showDimensionAnnotations={showBuildingDimensions}
              rotationSnapBase={getCoreParentBuildingRotation(building, buildings)}
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
          {showBoundaryDistanceLines ? (
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

function ProjectSiteBoundaryShape({
  projectSite,
  isPrimary,
  isSelected,
  crop,
  backgroundView,
  pageScale,
  onSelect,
}: {
  projectSite: ProjectSite;
  isPrimary: boolean;
  isSelected: boolean;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
  onSelect: () => void;
}) {
  const boundaryPoints = getBackgroundShapePoints(
    getProjectSiteBoundaryPoints(projectSite),
    crop,
    backgroundView,
    pageScale,
  );
  const stroke = isSelected ? "#1d4ed8" : isPrimary ? "#2563eb" : "rgba(37, 99, 235, 0.82)";
  const fill = isSelected ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.07)";

  return (
    <Line
      points={boundaryPoints}
      closed
      fill={fill}
      stroke={stroke}
      strokeWidth={isSelected ? 3.5 : 2.5}
      onClick={onSelect}
      onTap={onSelect}
    />
  );
}

function AncillaryBuildingShape({
  building,
  displayLabel,
  isSelected,
  onSelect,
  crop,
  backgroundView,
  pageScale,
}: {
  building: AncillaryBuilding;
  displayLabel: string;
  isSelected: boolean;
  onSelect: () => void;
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
        text={displayLabel}
        fill={isSelected ? "#f97316" : "#374151"}
        fontSize={building.labelFontSize ?? 13}
        fontStyle="bold"
        align="center"
        onClick={onSelect}
        onTap={onSelect}
      />
    </Group>
  );
}

function ExistingBuildingShape({
  building,
  displayLabel,
  isSelected,
  onSelect,
  crop,
  backgroundView,
  pageScale,
}: {
  building: ExistingBuilding;
  displayLabel: string;
  isSelected: boolean;
  onSelect: () => void;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
}) {
  const points = getBackgroundShapePoints(building.points, crop, backgroundView, pageScale);
  const bounds = getFlatPointBounds(points);
  const labelPadding = Math.max(8, Math.min(20, Math.min(bounds.width, bounds.height) * 0.08));
  return (
    <Group
      clipFunc={(context: Konva.Context) => {
        context.beginPath();
        context.moveTo(points[0], points[1]);
        for (let index = 2; index < points.length; index += 2) {
          context.lineTo(points[index], points[index + 1]);
        }
        context.closePath();
      }}
    >
      <Line
        points={points}
        closed
        fill="rgba(80,80,80,0.35)"
        stroke="rgba(50,50,50,1)"
        strokeWidth={2.5}
        listening={false}
      />
      <Text
        x={bounds.minX + labelPadding}
        y={bounds.minY + labelPadding}
        width={Math.max(1, bounds.width - labelPadding * 2)}
        height={Math.max(1, bounds.height - labelPadding * 2)}
        text={displayLabel}
        fill={isSelected ? "#f97316" : "#262626"}
        fontSize={building.labelFontSize ?? 13}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        wrap="word"
        onClick={onSelect}
        onTap={onSelect}
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

function getFlatPointBounds(points: number[]) {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function SetupRoadShape({
  road,
  isSelected,
  onSelect,
  crop,
  backgroundView,
  pageScale,
  pixelsPerMeter,
}: {
  road: SetupRoad;
  isSelected: boolean;
  onSelect: () => void;
  crop: { x: number; y: number };
  backgroundView: PdfBackgroundView;
  pageScale: number;
  pixelsPerMeter: number;
}) {
  const offsetX = backgroundView === "full" ? crop.x : 0;
  const offsetY = backgroundView === "full" ? crop.y : 0;
  const points = getSetupRoadPoints(road).flatMap((point) => [
    (point.x + offsetX) * pageScale,
    (point.y + offsetY) * pageScale,
  ]);
  const center = getFlatPointsCenter(points);
  const roadWidth = Math.max(2, road.width * pixelsPerMeter);

  return (
    <Group listening={false}>
      <Line
        points={points}
        stroke="rgba(120, 120, 120, 0.9)"
        strokeWidth={roadWidth + 4}
        lineJoin="round"
        lineCap="round"
      />
      <Line
        points={points}
        stroke="rgba(180, 180, 180, 0.7)"
        strokeWidth={roadWidth}
        lineJoin="round"
        lineCap="round"
      />
      <Text
        x={center.x - 90}
        y={center.y - 10}
        width={180}
        height={20}
        text={`${getSetupRoadLabel(road.type)} (${formatSetupRoadWidth(road.width)}m)`}
        fill={isSelected ? "#f97316" : "#374151"}
        fontSize={road.labelFontSize ?? Math.max(9, Math.min(16, roadWidth * 0.45))}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
        onClick={onSelect}
        onTap={onSelect}
      />
    </Group>
  );
}

function getSetupRoadPoints(road: SetupRoad) {
  if (road.points?.length >= 2) return road.points;
  if (
    road.x === undefined ||
    road.y === undefined ||
    road.rectangleWidth === undefined ||
    road.rectangleHeight === undefined
  ) {
    return [];
  }
  if (road.rectangleWidth >= road.rectangleHeight) {
    const centerY = road.y + road.rectangleHeight / 2;
    return [
      { x: road.x, y: centerY },
      { x: road.x + road.rectangleWidth, y: centerY },
    ];
  }
  const centerX = road.x + road.rectangleWidth / 2;
  return [
    { x: centerX, y: road.y },
    { x: centerX, y: road.y + road.rectangleHeight },
  ];
}

function getSetupRoadLabel(type: SetupRoad["type"]) {
  if (type === "primary") return "Primary Road";
  if (type === "secondary") return "Secondary Road";
  return "Pedestrian Pathway";
}

function getIndexedBackgroundLabel(
  label: string | undefined,
  fallbackBase: string,
  index: number,
) {
  const normalized = label?.trim();
  if (!normalized || normalized === fallbackBase) return `${fallbackBase} ${index + 1}`;
  return normalized;
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
  const labelFontSize = entrance.labelFontSize ?? 13;
  const labelSize = measureEntranceLabel(entrance.label, labelFontSize);
  const labelGap = getEntranceAnnotationGap(labelFontSize);
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
    labelSize,
    labelGap,
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
        width={labelSize.width}
        height={labelSize.height}
        text={entrance.label}
        fill="#b91c1c"
        fontSize={labelFontSize}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        rotation={0}
        wrap="none"
        onClick={onSelect}
        onTap={onSelect}
      />
    </Group>
  );
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
        fill={isPreview ? "rgba(255, 255, 255, 0.28)" : "rgba(255, 255, 255, 0.48)"}
        stroke={isSelected ? "#f97316" : "rgba(148, 163, 184, 0.92)"}
        strokeWidth={isSelected ? 3 : 1.5}
        dash={isPreview ? [10, 6] : undefined}
      />
      {!isPreview ? (
        <Text
          x={center.x - 60}
          y={center.y - 9}
          width={120}
          text={sidewalk.label}
          fill={isSelected ? "#f97316" : "#4b5563"}
          fontSize={sidewalk.labelFontSize ?? 14}
          fontStyle="bold"
          align="center"
          onClick={onSelect}
          onTap={onSelect}
        />
      ) : null}
    </Group>
  );
}

function getBoundaryVertices(site: SiteDimensions, backgroundMeta?: PdfBackgroundMeta) {
  const primaryProjectSite = getPrimaryProjectSite(backgroundMeta, site);
  const boundary = primaryProjectSite?.boundary ?? backgroundMeta?.siteBoundary;
  if ((primaryProjectSite?.shape ?? backgroundMeta?.siteShape) === "polygon" && boundary?.polygon?.length && boundary.width && boundary.height) {
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
      fontSize={label.fontSize ?? 18}
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

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function measureEntranceLabel(text: string, fontSize: number) {
  const fallbackHeight = Math.ceil(fontSize * 1.15);
  const content = text.trim() || " ";
  if (!entranceLabelMeasureContext) {
    return {
      width: Math.max(1, Math.ceil(content.length * fontSize * 0.68)),
      height: fallbackHeight,
    };
  }

  entranceLabelMeasureContext.font = `700 ${fontSize}px Arial`;
  const metrics = entranceLabelMeasureContext.measureText(content);
  return {
    width: Math.max(1, Math.ceil(metrics.width)),
    height: Math.max(
      1,
      Math.ceil(
        (metrics.actualBoundingBoxAscent || fontSize * 0.75) +
        (metrics.actualBoundingBoxDescent || fontSize * 0.25),
      ),
    ),
  };
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
  const reservedVerticalPadding = gridRowSize * (topGridPaddingRows + bottomGridPaddingRows);
  const fitWidth = (viewport.width * targetFitRatio) / width;
  const fitHeight = (Math.max(1, viewport.height - reservedVerticalPadding) * targetFitRatio) / height;
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

function getCropFitCamera(
  viewport: { width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
  backgroundView: PdfBackgroundView,
): CanvasCamera {
  const scale = getFittedScale(crop.width, crop.height, viewport);
  const cropWidth = crop.width * scale;
  const cropHeight = crop.height * scale;
  const cropX = Math.max(0, (viewport.width - cropWidth) / 2);
  const cropY = getTopFitOffset(viewport.height, cropHeight);

  return {
    scale,
    x: cropX - (backgroundView === "full" ? crop.x * scale : 0),
    y: cropY - (backgroundView === "full" ? crop.y * scale : 0),
  };
}

function constrainCamera(
  camera: CanvasCamera,
  viewport: { width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
  backgroundView: PdfBackgroundView,
): CanvasCamera {
  const cropWidth = crop.width * camera.scale;
  const cropHeight = crop.height * camera.scale;
  const sourceOffsetX = (backgroundView === "full" ? crop.x : 0) * camera.scale;
  const sourceOffsetY = (backgroundView === "full" ? crop.y : 0) * camera.scale;
  const fitX = Math.max(0, (viewport.width - cropWidth) / 2);
  const fitY = getTopFitOffset(viewport.height, cropHeight);
  const cropX =
    cropWidth <= viewport.width
      ? fitX
      : clampNumber(camera.x + sourceOffsetX, viewport.width - cropWidth, 0);
  const cropY =
    cropHeight <= viewport.height
      ? fitY
      : clampNumber(camera.y + sourceOffsetY, viewport.height - cropHeight, 0);

  return {
    scale: camera.scale,
    x: cropX - sourceOffsetX,
    y: cropY - sourceOffsetY,
  };
}
