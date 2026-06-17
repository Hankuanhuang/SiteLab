import { Group, Line, Rect, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { useEffect, useRef } from "react";
import { DEFAULT_BUILDING_LABEL_FONT_SIZE } from "../models/Building";
import type { Building, SiteDimensions } from "../types/layout";
import { getBridgeBeamOffsets } from "../utils/bridgeGraphics";
import { shouldSnapCoreRotation, snapCoreRotation } from "../utils/coreRotation";
import {
  getStairTreadOffsets,
  getThickStairLayout,
  getThinStairLayout,
  isThickStair,
  isThinStair,
} from "../utils/stairGraphics";
import { getToiletStallCount, getToiletVisualLayout } from "../utils/toiletLayout";

interface BuildingShapeProps {
  building: Building;
  site: SiteDimensions;
  dragBounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  renderScale?: {
    x: number;
    y: number;
  };
  showDimensionAnnotations: boolean;
  rotationSnapBase: number;
  isSelected: boolean;
  onSelect: () => void;
  onEntrancePlacement?: (building: Building, localX: number, localY: number) => void;
  onChange: (building: Building) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}

export function BuildingShape({
  building,
  site,
  dragBounds,
  renderScale,
  showDimensionAnnotations,
  rotationSnapBase,
  isSelected,
  onSelect,
  onEntrancePlacement,
  onChange,
  onEditStart,
  onEditEnd,
}: BuildingShapeProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const ppmX = renderScale?.x ?? site.pixelsPerMeter;
  const ppmY = renderScale?.y ?? site.pixelsPerMeter;
  const minimumHandleSize = Math.min(ppmX, ppmY);
  const buildingWidthPx = building.length * ppmX;
  const buildingHeightPx = building.width * ppmY;
  const isBridge = building.type === "bridge";

  useEffect(() => {
    if (isSelected && rectRef.current && transformerRef.current) {
      transformerRef.current.nodes([rectRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Rect
        ref={rectRef}
        x={building.x * ppmX}
        y={building.y * ppmY}
        width={buildingWidthPx}
        height={buildingHeightPx}
        rotation={building.rotation}
        fill={isBridge ? getTransparentFill(building.color, 0.68) : building.color}
        opacity={isBridge ? 1 : 0.82}
        stroke={isBridge ? undefined : isSelected ? "#111827" : "#ffffff"}
        strokeWidth={isBridge ? 0 : 2}
        draggable={!onEntrancePlacement}
        onClick={(event) => {
          if (onEntrancePlacement) {
            const point = event.target.getRelativePointerPosition();
            if (point) onEntrancePlacement(building, point.x / ppmX, point.y / ppmY);
            return;
          }
          onSelect();
        }}
        onTap={(event) => {
          if (onEntrancePlacement) {
            const point = event.target.getRelativePointerPosition();
            if (point) onEntrancePlacement(building, point.x / ppmX, point.y / ppmY);
            return;
          }
          onSelect();
        }}
        onDragStart={onEditStart}
        onDragMove={(event) => {
          const next = keepNodeInsideBounds(event.target, site, dragBounds, ppmX, ppmY);
          onChange({ ...building, x: next.x, y: next.y });
        }}
        onDragEnd={onEditEnd}
        onTransformStart={onEditStart}
        onTransform={() => {
          const node = rectRef.current;
          if (!node) return;
          const nextLength = Math.max(1, (node.width() * node.scaleX()) / ppmX);
          const nextWidth =
            building.type === "square" ? nextLength : Math.max(1, (node.height() * node.scaleY()) / ppmY);
          node.width(nextLength * ppmX);
          node.height(nextWidth * ppmY);
          node.scaleX(1);
          node.scaleY(1);
          const rotation = normalizeRotation(node.rotation());
          onChange({
            ...building,
            length: nextLength,
            width: nextWidth,
            rotation,
          });
        }}
        onTransformEnd={() => {
          const node = rectRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);

          const length = Math.max(1, (node.width() * scaleX) / ppmX);
          const width = building.type === "square" ? length : Math.max(1, (node.height() * scaleY) / ppmY);
          const rotation = shouldSnapCoreRotation(building)
            ? snapCoreRotation(node.rotation(), rotationSnapBase)
            : normalizeRotation(node.rotation());
          node.rotation(rotation);
          const next = keepNodeInsideBounds(node, site, dragBounds, ppmX, ppmY);

          onChange({
            ...building,
            length,
            width,
            x: next.x,
            y: next.y,
            rotation,
          });
          onEditEnd();
        }}
      />
      {building.type === "bridge" ? (
        <BridgeBeams
          building={building}
          ppmX={ppmX}
          ppmY={ppmY}
          widthPx={buildingWidthPx}
          heightPx={buildingHeightPx}
        />
      ) : building.type === "elevator" ? (
        <ElevatorSymbol
          building={building}
          ppmX={ppmX}
          ppmY={ppmY}
          widthPx={buildingWidthPx}
          heightPx={buildingHeightPx}
        />
      ) : isThickStair(building.type, building.coreVariant) || isThinStair(building.type, building.coreVariant) ? (
        <StairTreads
          building={building}
          ppmX={ppmX}
          ppmY={ppmY}
          widthPx={buildingWidthPx}
          heightPx={buildingHeightPx}
        />
      ) : building.type === "toilet" ? (
        <ToiletInterior
          building={building}
          ppmX={ppmX}
          ppmY={ppmY}
          widthPx={buildingWidthPx}
          heightPx={buildingHeightPx}
        />
      ) : (
        <BuildingProgramLabel
          building={building}
          ppmX={ppmX}
          ppmY={ppmY}
          widthPx={buildingWidthPx}
          heightPx={buildingHeightPx}
        />
      )}
      {isSelected ? (
        <>
          {showDimensionAnnotations ? <BuildingDimensions building={building} ppmX={ppmX} ppmY={ppmY} /> : null}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotateAnchorOffset={34}
            enabledAnchors={
              building.type === "square"
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
            }
            boundBoxFunc={(_, newBox) => {
              if (newBox.width < minimumHandleSize || newBox.height < minimumHandleSize) return _;
              return newBox;
            }}
          />
        </>
      ) : null}
    </>
  );
}

function keepNodeInsideBounds(
  node: Konva.Node,
  site: SiteDimensions,
  dragBounds: { minX: number; maxX: number; minY: number; maxY: number } | undefined,
  ppmX: number,
  ppmY: number,
) {
  const minX = (dragBounds?.minX ?? 0) * ppmX;
  const minY = (dragBounds?.minY ?? 0) * ppmY;
  const maxX = (dragBounds?.maxX ?? site.width) * ppmX;
  const maxY = (dragBounds?.maxY ?? site.length) * ppmY;
  const box = node.getClientRect({ relativeTo: node.getLayer() ?? undefined });
  let correctionX = 0;
  let correctionY = 0;

  if (box.x < minX) correctionX = minX - box.x;
  if (box.y < minY) correctionY = minY - box.y;
  if (box.x + box.width > maxX) correctionX = maxX - (box.x + box.width);
  if (box.y + box.height > maxY) correctionY = maxY - (box.y + box.height);

  if (correctionX !== 0 || correctionY !== 0) {
    node.position({
      x: node.x() + correctionX,
      y: node.y() + correctionY,
    });
  }

  return {
    x: node.x() / ppmX,
    y: node.y() / ppmY,
  };
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function BuildingDimensions({
  building,
  ppmX,
  ppmY,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
}) {
  const widthPx = building.length * ppmX;
  const heightPx = building.width * ppmY;
  const annotationColor = "#0f172a";
  const widthLabel = `${formatMeasurement(building.length)} m`;
  const heightLabel = `${formatMeasurement(building.width)} m`;
  const rotationLabel = `${formatMeasurement(normalizeRotation(building.rotation))} deg`;

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      listening={false}
    >
      <Line points={[0, -16, widthPx, -16]} stroke={annotationColor} strokeWidth={1} />
      <Line points={[0, -22, 0, -10]} stroke={annotationColor} strokeWidth={1} />
      <Line points={[widthPx, -22, widthPx, -10]} stroke={annotationColor} strokeWidth={1} />
      <Text
        x={Math.max(0, widthPx / 2 - 42)}
        y={-38}
        width={84}
        text={widthLabel}
        align="center"
        fill={annotationColor}
        fontSize={12}
        fontStyle="bold"
      />

      <Line points={[widthPx + 16, 0, widthPx + 16, heightPx]} stroke={annotationColor} strokeWidth={1} />
      <Line points={[widthPx + 10, 0, widthPx + 22, 0]} stroke={annotationColor} strokeWidth={1} />
      <Line points={[widthPx + 10, heightPx, widthPx + 22, heightPx]} stroke={annotationColor} strokeWidth={1} />
      <Text
        x={widthPx + 34}
        y={Math.max(0, heightPx / 2 - 42)}
        width={84}
        text={heightLabel}
        align="center"
        fill={annotationColor}
        fontSize={12}
        fontStyle="bold"
        rotation={90}
      />

      <Text
        x={widthPx + 10}
        y={-42}
        text={rotationLabel}
        fill="#0f766e"
        fontSize={12}
        fontStyle="bold"
      />
    </Group>
  );
}

function BuildingProgramLabel({
  building,
  ppmX,
  ppmY,
  widthPx,
  heightPx,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
  widthPx: number;
  heightPx: number;
}) {
  const padding = clamp(Math.min(widthPx, heightPx) * 0.06, 4, 12);
  const contentWidth = Math.max(1, widthPx - padding * 2);
  const contentHeight = Math.max(1, heightPx - padding * 2);
  const sizeBasis = Math.min(widthPx, heightPx);
  const rowCount = Math.max(1, building.programs.length);
  const heightLimitedProgramSize = contentHeight / (rowCount * 1.25 + 1.85);
  const longestProgramLength = Math.max(
    1,
    ...building.programs.map(
      (program, index) => `${index + 1}. ${program.name} (${formatArea(program.area)}m\u00b2)`.length,
    ),
  );
  const widthLimitedProgramSize = contentWidth / (longestProgramLength * 0.58);
  const widthLimitedNameSize = contentWidth / (Math.max(1, building.label.length) * 0.62);
  const programFontSize = Math.max(
    3,
    Math.min(
      13,
      sizeBasis * 0.085,
      heightLimitedProgramSize,
      widthLimitedProgramSize,
      widthLimitedNameSize / 1.35,
    ),
  );
  const maximumNameFontSize = Math.min(
    18,
    Math.max(programFontSize * 1.35, sizeBasis * 0.13),
    widthLimitedNameSize,
  );
  const nameFontSize = Math.max(8, building.labelFontSize ?? DEFAULT_BUILDING_LABEL_FONT_SIZE);
  const nameHeight = nameFontSize * 1.25;
  const programLineHeight = programFontSize * 1.25;
  const listGap = building.programs.length ? clamp(programFontSize * 0.45, 3, 6) : 0;
  const stackHeight = nameHeight + listGap + building.programs.length * programLineHeight;
  const stackTop = padding + Math.max(0, (contentHeight - stackHeight) / 2);
  const textColor = getContrastingTextColor(building.color);
  const secondaryTextColor = textColor === "#111827" ? "rgba(17, 24, 39, 0.9)" : "rgba(255, 255, 255, 0.94)";

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      clipX={0}
      clipY={0}
      clipWidth={widthPx}
      clipHeight={heightPx}
      listening={false}
    >
      <Text
        x={padding}
        y={stackTop}
        width={contentWidth}
        height={nameHeight}
        text={building.label}
        fill={textColor}
        fontSize={nameFontSize}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
      />
      {building.programs.map((program, index) => (
        <Text
          key={`${program.name}-${index}`}
          x={padding}
          y={stackTop + nameHeight + listGap + index * programLineHeight}
          width={contentWidth}
          height={programLineHeight}
          text={`${index + 1}. ${program.name} (${formatArea(program.area)}m\u00b2)`}
          fill={secondaryTextColor}
          fontSize={programFontSize}
          align="center"
          verticalAlign="middle"
          wrap="none"
          ellipsis
        />
      ))}
    </Group>
  );
}

function StairTreads({
  building,
  ppmX,
  ppmY,
  widthPx,
  heightPx,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
  widthPx: number;
  heightPx: number;
}) {
  const runIsHorizontal = building.length >= building.width;
  const runLength = runIsHorizontal ? building.length : building.width;
  const thickLayout = isThickStair(building.type, building.coreVariant) ? getThickStairLayout(runLength) : undefined;
  const thinLayout = !thickLayout && isThinStair(building.type, building.coreVariant) ? getThinStairLayout(runLength) : undefined;
  const stairLayout = thickLayout ?? thinLayout;
  const offsets = stairLayout?.treadOffsets ?? getStairTreadOffsets(runLength);
  const separatorOffsets = stairLayout ? [stairLayout.stairRunStart, stairLayout.stairRunEnd] : [];

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      clipX={0}
      clipY={0}
      clipWidth={widthPx}
      clipHeight={heightPx}
      listening={false}
    >
      {separatorOffsets.map((offset) => {
        const position = runIsHorizontal ? offset * ppmX : offset * ppmY;
        return (
          <Line
            key={`landing-${offset}`}
            points={runIsHorizontal ? [position, 0, position, heightPx] : [0, position, widthPx, position]}
            stroke="#111827"
            strokeWidth={1.4}
          />
        );
      })}
      {offsets.map((offset) => {
        const position = runIsHorizontal ? offset * ppmX : offset * ppmY;
        return (
          <Line
            key={offset}
            points={runIsHorizontal ? [position, 0, position, heightPx] : [0, position, widthPx, position]}
            stroke="#111827"
            strokeWidth={1.4}
          />
        );
      })}
      {thickLayout ? (
        <Line
          points={
            runIsHorizontal
              ? [thickLayout.stairRunStart * ppmX, heightPx / 2, thickLayout.stairRunEnd * ppmX, heightPx / 2]
              : [widthPx / 2, thickLayout.stairRunStart * ppmY, widthPx / 2, thickLayout.stairRunEnd * ppmY]
          }
          stroke="#111827"
          strokeWidth={1.6}
        />
      ) : null}
    </Group>
  );
}

function ElevatorSymbol({
  building,
  ppmX,
  ppmY,
  widthPx,
  heightPx,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
  widthPx: number;
  heightPx: number;
}) {
  const inset = clamp(Math.min(widthPx, heightPx) * 0.16, 5, 18);
  const strokeWidth = clamp(Math.min(widthPx, heightPx) * 0.045, 1.5, 4);
  const carCount = building.coreVariant === "double" ? 2 : 1;
  const carGap = carCount > 1 ? Math.max(strokeWidth * 1.6, Math.min(widthPx, heightPx) * 0.08) : 0;
  const availableWidth = Math.max(1, widthPx - inset * 2 - carGap * (carCount - 1));
  const carWidth = availableWidth / carCount;
  const carHeight = Math.max(1, heightPx - inset * 2);

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      clipX={0}
      clipY={0}
      clipWidth={widthPx}
      clipHeight={heightPx}
      listening={false}
    >
      {Array.from({ length: carCount }, (_, index) => {
        const x = inset + index * (carWidth + carGap);
        return (
          <Group key={index}>
            <Rect
              x={x}
              y={inset}
              width={carWidth}
              height={carHeight}
              stroke="#111827"
              strokeWidth={strokeWidth}
            />
            <Line
              points={[x, inset, x + carWidth, inset + carHeight]}
              stroke="#111827"
              strokeWidth={strokeWidth}
            />
            <Line
              points={[x + carWidth, inset, x, inset + carHeight]}
              stroke="#111827"
              strokeWidth={strokeWidth}
            />
          </Group>
        );
      })}
    </Group>
  );
}

function BridgeBeams({
  building,
  ppmX,
  ppmY,
  widthPx,
  heightPx,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
  widthPx: number;
  heightPx: number;
}) {
  const offsets = getBridgeBeamOffsets(building.length);
  const markerSize = clamp(Math.min(widthPx, heightPx) * 0.16, 6, Math.max(6, heightPx * 0.35));
  const dashStrokeWidth = clamp(Math.min(widthPx, heightPx) * 0.035, 1.25, 3);
  const edgeInset = clamp(heightPx * 0.1, dashStrokeWidth * 2, Math.max(dashStrokeWidth * 2, heightPx * 0.22));

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      clipX={0}
      clipY={0}
      clipWidth={widthPx}
      clipHeight={heightPx}
      listening={false}
    >
      <Line
        points={[0, dashStrokeWidth / 2, widthPx, dashStrokeWidth / 2]}
        stroke="#111827"
        strokeWidth={dashStrokeWidth}
        dash={[9, 7]}
      />
      <Line
        points={[0, heightPx - dashStrokeWidth / 2, widthPx, heightPx - dashStrokeWidth / 2]}
        stroke="#111827"
        strokeWidth={dashStrokeWidth}
        dash={[9, 7]}
      />
      {offsets.map((offset) => {
        const x = offset * ppmX;
        const markerX = clamp(x - markerSize / 2, 0, Math.max(0, widthPx - markerSize));
        return (
          <Group key={offset}>
            <Rect x={markerX} y={edgeInset} width={markerSize} height={markerSize} fill="#111827" />
            <Rect
              x={markerX}
              y={heightPx - edgeInset - markerSize}
              width={markerSize}
              height={markerSize}
              fill="#111827"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function ToiletInterior({
  building,
  ppmX,
  ppmY,
  widthPx,
  heightPx,
}: {
  building: Building;
  ppmX: number;
  ppmY: number;
  widthPx: number;
  heightPx: number;
}) {
  const textColor = getContrastingTextColor(building.color);
  const secondaryTextColor = textColor === "#111827" ? "rgba(17, 24, 39, 0.84)" : "rgba(255, 255, 255, 0.92)";
  const layout = getToiletVisualLayout(building.length, widthPx, heightPx);
  const labelFontSize = Math.max(8, building.labelFontSize ?? DEFAULT_BUILDING_LABEL_FONT_SIZE);
  const wcFontSize = Math.max(7, Math.min(14, Math.min(widthPx / Math.max(2, layout.stallCount * 2.4), heightPx * 0.14)));
  const stallCount = getToiletStallCount(building.length);

  return (
    <Group
      x={building.x * ppmX}
      y={building.y * ppmY}
      rotation={building.rotation}
      clipX={0}
      clipY={0}
      clipWidth={widthPx}
      clipHeight={heightPx}
      listening={false}
    >
      <Line
        points={[layout.partitionXs[0], layout.backWallY, layout.partitionXs[layout.partitionXs.length - 1], layout.backWallY]}
        stroke={secondaryTextColor}
        strokeWidth={2}
      />
      <Line
        points={[layout.partitionXs[0], layout.frontPartitionY, layout.partitionXs[layout.partitionXs.length - 1], layout.frontPartitionY]}
        stroke={secondaryTextColor}
        strokeWidth={2}
      />
      {layout.partitionXs.map((x, index) => (
        <Line
          key={`${x}-${index}`}
          points={[x, layout.backWallY, x, layout.frontPartitionY]}
          stroke={secondaryTextColor}
          strokeWidth={2}
        />
      ))}
      {layout.stallCenters.map((centerX, index) => (
        <Text
          key={`${centerX}-${index}`}
          x={centerX - 16}
          y={layout.backWallY + (layout.frontPartitionY - layout.backWallY) * 0.32}
          width={32}
          height={18}
          text="WC"
          fill={textColor}
          fontSize={wcFontSize}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
        />
      ))}
      <Text
        x={6}
        y={Math.max(layout.labelZoneY - 16, layout.frontPartitionY + 2)}
        width={Math.max(1, widthPx - 12)}
        height={14}
        text={`${stallCount} WC`}
        fill={secondaryTextColor}
        fontSize={Math.max(8, Math.min(12, wcFontSize))}
        align="center"
        verticalAlign="middle"
      />
      <Text
        x={6}
        y={layout.labelZoneY}
        width={Math.max(1, widthPx - 12)}
        height={layout.labelZoneHeight}
        text={building.label}
        fill={textColor}
        fontSize={labelFontSize}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
      />
    </Group>
  );
}

function formatMeasurement(value: number) {
  return value.toFixed(1);
}

function formatArea(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getTransparentFill(color: string, alpha: number) {
  const match = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return color;

  const red = Number.parseInt(match[1], 16);
  const green = Number.parseInt(match[2], 16);
  const blue = Number.parseInt(match[3], 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getContrastingTextColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#111827" : "#ffffff";
}
