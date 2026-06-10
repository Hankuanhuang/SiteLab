import { Group, Line, Rect, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { useEffect, useRef } from "react";
import type { Building, SiteDimensions } from "../types/layout";

interface BuildingShapeProps {
  building: Building;
  site: SiteDimensions;
  renderScale?: {
    x: number;
    y: number;
  };
  showDimensionAnnotations: boolean;
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
  renderScale,
  showDimensionAnnotations,
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
        fill={building.color}
        opacity={0.82}
        stroke={isSelected ? "#111827" : "#ffffff"}
        strokeWidth={2}
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
          const next = keepNodeInsideSite(event.target, site, ppmX, ppmY);
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
          onChange({
            ...building,
            length: nextLength,
            width: nextWidth,
            rotation: normalizeRotation(node.rotation()),
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
          const rotation = normalizeRotation(node.rotation());
          node.rotation(rotation);
          const next = keepNodeInsideSite(node, site, ppmX, ppmY);

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
      <BuildingProgramLabel
        building={building}
        ppmX={ppmX}
        ppmY={ppmY}
        widthPx={buildingWidthPx}
        heightPx={buildingHeightPx}
      />
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

function keepNodeInsideSite(node: Konva.Node, site: SiteDimensions, ppmX: number, ppmY: number) {
  const siteWidthPx = site.width * ppmX;
  const siteLengthPx = site.length * ppmY;
  const box = node.getClientRect({ relativeTo: node.getLayer() ?? undefined });
  let correctionX = 0;
  let correctionY = 0;

  if (box.x < 0) correctionX = -box.x;
  if (box.y < 0) correctionY = -box.y;
  if (box.x + box.width > siteWidthPx) correctionX = siteWidthPx - (box.x + box.width);
  if (box.y + box.height > siteLengthPx) correctionY = siteLengthPx - (box.y + box.height);

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
  const nameFontSize = Math.min(18, Math.max(programFontSize * 1.35, sizeBasis * 0.13), widthLimitedNameSize);
  const nameHeight = nameFontSize * 1.25;
  const programLineHeight = programFontSize * 1.25;
  const listGap = building.programs.length ? clamp(programFontSize * 0.45, 3, 6) : 0;
  const stackHeight = nameHeight + listGap + building.programs.length * programLineHeight;
  const stackTop = padding + Math.max(0, (contentHeight - stackHeight) / 2);

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
        fill="#ffffff"
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
          fill="rgba(255, 255, 255, 0.94)"
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

function formatMeasurement(value: number) {
  return value.toFixed(1);
}

function formatArea(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
