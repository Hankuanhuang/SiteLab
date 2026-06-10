import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Arrow, Circle, Group, Image, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  Building,
  ContextZone,
  Entrance,
  PdfBackgroundMeta,
  PdfBackgroundView,
  Sidewalk,
  SiteDimensions,
  SiteLabel,
} from "../types/layout";
import type { Tree } from "../types/layout";
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
  onSelectSidewalk: (id?: string) => void;
  onSelectEntrance: (id?: string) => void;
  onPlaceEntrance: (building: Building, localX: number, localY: number) => void;
  onPlaceTree: (x: number, y: number) => void;
  onChangeBuilding: (building: Building, recordHistory?: boolean) => void;
  onChangeSiteLabel: (label: SiteLabel, recordHistory?: boolean) => void;
  onChangeTree: (tree: Tree, recordHistory?: boolean) => void;
  onChangeEntrance: (entrance: Entrance, recordHistory?: boolean) => void;
  onBeginBuildingEdit: () => void;
  onEndBuildingEdit: () => void;
}

const targetFitRatio = 1;
const gridRowSize = 24;
const topGridPaddingRows = 5;
const minimumStageSize = {
  width: 720,
  height: 520,
};

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
  onSelectSidewalk,
  onSelectEntrance,
  onPlaceEntrance,
  onPlaceTree,
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
  const buildingScale = {
    x: boundary.width / site.width,
    y: boundary.height / site.length,
  };
  const renderSite: SiteDimensions = {
    ...site,
    pixelsPerMeter: Math.min(buildingScale.x, buildingScale.y),
  };
  const shouldShowBackground = showBackground && Boolean(backgroundImage);
  const contextZones = backgroundMeta?.contextZones ?? [];
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
    if (event.target !== event.target.getStage()) return;

    if (isTreeToolActive) {
      const pointer = event.target.getStage()?.getPointerPosition();
      if (!pointer) return;
      const localX = pointer.x - boundary.x;
      const localY = pointer.y - boundary.y;
      if (localX < 0 || localY < 0 || localX > boundary.width || localY > boundary.height) return;

      onPlaceTree(localX / buildingScale.x, localY / buildingScale.y);
      return;
    }

    onSelectBuilding(undefined);
    onSelectSiteLabel(undefined);
    onSelectTree(undefined);
    onSelectSidewalk(undefined);
    onSelectEntrance(undefined);
  };

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
        <Layer x={boundary.x} y={boundary.y}>
          {sidewalks.map((sidewalk) => (
            <SidewalkShape
              key={sidewalk.id}
              sidewalk={sidewalk}
              site={site}
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
              site={site}
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
              site={site}
              isSelected={tree.id === selectedTreeId}
              onSelect={() => onSelectTree(tree.id)}
              onChange={(nextTree) => onChangeTree(nextTree, false)}
              onEditStart={onBeginBuildingEdit}
              onEditEnd={onEndBuildingEdit}
            />
          ))}
          {entrances.map((entrance) => (
            <EntranceShape
              key={entrance.id}
              entrance={entrance}
              site={site}
              scale={buildingScale}
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

function EntranceShape({
  entrance,
  site,
  scale,
  isSelected,
  onSelect,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  entrance: Entrance;
  site: SiteDimensions;
  scale: { x: number; y: number };
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
        const nextX = Math.max(0, Math.min(site.width, event.target.x() / scale.x));
        const nextY = Math.max(0, Math.min(site.length, event.target.y() / scale.y));
        event.target.position({ x: nextX * scale.x, y: nextY * scale.y });
        onChange({ ...entrance, x: nextX, y: nextY });
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
  const isPark = zone.type === "greenPark";

  return (
    <Line
      points={points}
      closed
      fill={isPark ? "rgba(134, 239, 172, 0.34)" : "rgba(209, 213, 219, 0.4)"}
      stroke={isPark ? "#16a34a" : "#6b7280"}
      strokeWidth={2}
      listening={false}
    />
  );
}

function SidewalkShape({
  sidewalk,
  site,
  scale,
  isSelected,
  onSelect,
}: {
  sidewalk: Sidewalk;
  site: SiteDimensions;
  scale: { x: number; y: number };
  isSelected: boolean;
  onSelect: () => void;
}) {
  const geometry = getSidewalkGeometry(sidewalk, site, scale);
  const hatchSpacing = 14;
  const hatchCount = Math.ceil((geometry.width + geometry.height) / hatchSpacing) + 1;

  return (
    <Group
      x={geometry.x}
      y={geometry.y}
      clipX={0}
      clipY={0}
      clipWidth={geometry.width}
      clipHeight={geometry.height}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Rect
        width={geometry.width}
        height={geometry.height}
        fill="#e5e7eb"
        stroke={isSelected ? "#f97316" : "#9ca3af"}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      {Array.from({ length: hatchCount }, (_, index) => {
        const offset = index * hatchSpacing - geometry.height;
        return (
          <Line
            key={offset}
            points={[offset, geometry.height, offset + geometry.height, 0]}
            stroke="#c1c7cd"
            strokeWidth={1}
            listening={false}
          />
        );
      })}
      <Text
        x={0}
        y={Math.max(0, geometry.height / 2 - 9)}
        width={geometry.width}
        text={sidewalk.label}
        fill="#4b5563"
        fontSize={14}
        fontStyle="bold"
        align="center"
        listening={false}
      />
    </Group>
  );
}

function getSidewalkGeometry(
  sidewalk: Sidewalk,
  site: SiteDimensions,
  scale: { x: number; y: number },
) {
  const widthMeters = Math.min(
    sidewalk.width,
    sidewalk.edge === "top" || sidewalk.edge === "bottom" ? site.length : site.width,
  );
  const siteWidth = site.width * scale.x;
  const siteHeight = site.length * scale.y;

  if (sidewalk.edge === "top") {
    return { x: 0, y: 0, width: siteWidth, height: widthMeters * scale.y };
  }
  if (sidewalk.edge === "bottom") {
    const height = widthMeters * scale.y;
    return { x: 0, y: siteHeight - height, width: siteWidth, height };
  }
  if (sidewalk.edge === "left") {
    return { x: 0, y: 0, width: widthMeters * scale.x, height: siteHeight };
  }

  const width = widthMeters * scale.x;
  return { x: siteWidth - width, y: 0, width, height: siteHeight };
}

function TreeShape({
  tree,
  scale,
  site,
  isSelected,
  onSelect,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  tree: Tree;
  scale: { x: number; y: number };
  site: SiteDimensions;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (tree: Tree) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const radiusPx = tree.radius * Math.min(scale.x, scale.y);

  return (
    <Group
      x={tree.x * scale.x}
      y={tree.y * scale.y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onEditStart}
      onDragMove={(event) => {
        const x = Math.max(tree.radius, Math.min(site.width - tree.radius, event.target.x() / scale.x));
        const y = Math.max(tree.radius, Math.min(site.length - tree.radius, event.target.y() / scale.y));
        event.target.position({ x: x * scale.x, y: y * scale.y });
        onChange({ ...tree, x, y });
      }}
      onDragEnd={onEditEnd}
    >
      <Circle
        radius={radiusPx}
        fill="rgba(34, 197, 94, 0.28)"
        stroke={isSelected ? "#f97316" : "#166534"}
        strokeWidth={isSelected ? 3 : 2}
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
    </Group>
  );
}

function SiteLabelShape({
  label,
  scale,
  site,
  isSelected,
  onSelect,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: SiteLabel;
  scale: { x: number; y: number };
  site: SiteDimensions;
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
        const node = event.target;
        const x = Math.max(0, Math.min(site.width, node.x() / scale.x));
        const y = Math.max(0, Math.min(site.length, node.y() / scale.y));
        node.position({ x: x * scale.x, y: y * scale.y });
        onChange({ ...label, x, y });
      }}
      onDragEnd={onEditEnd}
    />
  );
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

  if (viewportHeight <= preferredTopPadding) {
    return Math.max(0, viewportHeight - pageHeight);
  }

  return preferredTopPadding;
}
