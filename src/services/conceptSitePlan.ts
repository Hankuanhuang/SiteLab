import type {
  AncillaryBuilding,
  Building,
  Entrance,
  ExistingBuilding,
  ExistingTree,
  PdfBackgroundMeta,
  Sidewalk,
  SiteDimensions,
  SiteLabel,
  SiteShape,
  SetupRoad,
  Tree,
} from "../types/layout";
import { getSidewalkPoints } from "../utils/sidewalkGeometry";

const exportWidth = 4200;
const exportHeight = 3000;
const drawingMargin = 320;
const titleBlockHeight = 260;

export interface ConceptSitePlanRender {
  exportedAt: string;
  previewDataUrl: string;
  thumbnailDataUrl: string;
}

export async function exportConceptSitePlan(
  site: SiteDimensions,
  buildings: Building[],
  siteLabels: SiteLabel[] = [],
  trees: Tree[] = [],
  sidewalks: Sidewalk[] = [],
  entrances: Entrance[] = [],
  roads: SetupRoad[] = [],
  ancillaryBuildings: AncillaryBuilding[] = [],
  crop?: PdfBackgroundMeta["crop"],
  siteBoundary?: PdfBackgroundMeta["siteBoundary"],
  existingBuildings: ExistingBuilding[] = [],
  existingTrees: ExistingTree[] = [],
  backgroundImageSrc?: string,
  projectName = "Untitled Layout",
  siteShape: SiteShape = "rectangle",
  siteVertices: Array<{ x: number; y: number }> = [],
  edgeLengths: number[] = [],
  showDistanceLines = false,
  selectedBuildingId?: string,
): Promise<ConceptSitePlanRender | undefined> {
  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const availableWidth = exportWidth - drawingMargin * 2;
  const availableHeight = exportHeight - drawingMargin * 2 - titleBlockHeight;
  const analysisBounds = getExportAnalysisBounds(site, crop, siteBoundary);
  const exportPlanWidth = analysisBounds.maxX - analysisBounds.minX;
  const exportPlanHeight = analysisBounds.maxY - analysisBounds.minY;
  const scale = Math.min(availableWidth / exportPlanWidth, availableHeight / exportPlanHeight);
  const scaledPlanWidth = exportPlanWidth * scale;
  const scaledPlanHeight = exportPlanHeight * scale;
  const planOrigin = {
    x: drawingMargin + (availableWidth - scaledPlanWidth) / 2,
    y: drawingMargin + (availableHeight - scaledPlanHeight) / 2,
  };
  const origin = {
    x: planOrigin.x + (0 - analysisBounds.minX) * scale,
    y: planOrigin.y + (0 - analysisBounds.minY) * scale,
  };
  const siteWidth = site.width * scale;
  const siteHeight = site.length * scale;

  const backgroundImage = backgroundImageSrc
    ? await loadExportImage(backgroundImageSrc)
    : undefined;
  if (backgroundImage && crop?.width && crop.height && siteBoundary?.width && siteBoundary.height) {
    drawBackgroundImage(
      context,
      backgroundImage,
      crop,
      siteBoundary,
      planOrigin,
      exportPlanWidth,
      exportPlanHeight,
      scale,
    );
  } else {
    drawOpenSpacePattern(context, planOrigin.x, planOrigin.y, scaledPlanWidth, scaledPlanHeight);
  }

  context.save();
  clipPlan(context, planOrigin, scaledPlanWidth, scaledPlanHeight);
  drawRoads(
    context,
    roads,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    false,
  );
  drawAncillaryBuildings(
    context,
    ancillaryBuildings,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    false,
  );
  drawExistingBuildings(
    context,
    existingBuildings,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    false,
  );
  drawExistingTrees(
    context,
    existingTrees,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
  );
  context.restore();

  if (siteShape === "polygon" && siteVertices.length >= 3) {
    drawPolygonSiteBoundary(context, siteVertices, edgeLengths, origin, scale);
  } else {
    drawSiteBoundary(context, origin.x, origin.y, siteWidth, siteHeight);
    drawSiteDimensions(context, origin.x, origin.y, siteWidth, siteHeight, site);
  }

  drawSidewalks(context, sidewalks, site, origin, scale);
  drawTrees(context, trees, origin, scale);
  drawBuildings(context, buildings, origin, scale);
  if (showDistanceLines && selectedBuildingId) {
    drawDistanceAnnotations(context, buildings, selectedBuildingId, site, origin, scale);
  }
  drawEntrances(context, entrances, origin, scale);
  drawSiteLabels(context, siteLabels, origin, scale);
  context.save();
  clipPlan(context, planOrigin, scaledPlanWidth, scaledPlanHeight);
  drawRoads(
    context,
    roads,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    true,
  );
  drawAncillaryBuildings(
    context,
    ancillaryBuildings,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    true,
  );
  drawExistingBuildings(
    context,
    existingBuildings,
    site,
    siteBoundary,
    planOrigin,
    analysisBounds.minX,
    analysisBounds.minY,
    scale,
    true,
  );
  context.restore();
  drawNorthArrow(context, exportWidth - 330, 280);
  drawTitleBlock(context, projectName);

  const exportedAt = new Date();
  const blob = await canvasToBlob(canvas, "image/png");
  if (!blob) return undefined;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(projectName)}-concept-site-plan-${formatDate(exportedAt)}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return {
    exportedAt: exportedAt.toISOString(),
    previewDataUrl: createScaledImage(canvas, 1400, 0.82),
    thumbnailDataUrl: createScaledImage(canvas, 360, 0.72),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));
}

function createScaledImage(source: HTMLCanvasElement, targetWidth: number, quality: number) {
  const scale = Math.min(1, targetWidth / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return source.toDataURL("image/jpeg", quality);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadExportImage(source: string) {
  return new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = source;
  });
}

function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  _crop: PdfBackgroundMeta["crop"],
  _boundary: PdfBackgroundMeta["siteBoundary"],
  planOrigin: { x: number; y: number },
  exportPlanWidth: number,
  exportPlanHeight: number,
  scale: number,
) {
  context.save();
  context.globalAlpha = 0.72;
  clipPlan(context, planOrigin, exportPlanWidth * scale, exportPlanHeight * scale);
  context.drawImage(image, planOrigin.x, planOrigin.y, exportPlanWidth * scale, exportPlanHeight * scale);
  context.restore();
}

function drawPolygonSiteBoundary(
  context: CanvasRenderingContext2D,
  vertices: Array<{ x: number; y: number }>,
  edgeLengths: number[],
  origin: { x: number; y: number },
  scale: number,
) {
  const points = vertices.map((point) => ({
    x: origin.x + point.x * scale,
    y: origin.y + point.y * scale,
  }));

  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#000000";
  context.lineWidth = 12;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.stroke();

  context.font = "30px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const length = edgeLengths[index];
    if (!length) return;
    context.fillText(`${length.toFixed(1)} m`, (point.x + next.x) / 2, (point.y + next.y) / 2 - 18);
  });
  context.restore();
}

function drawEntrances(
  context: CanvasRenderingContext2D,
  entrances: Entrance[],
  origin: { x: number; y: number },
  scale: number,
) {
  entrances.forEach((entrance) => {
    const tipX = origin.x + entrance.x * scale;
    const tipY = origin.y + entrance.y * scale;
    const radians = ((entrance.rotation - 90) * Math.PI) / 180;
    const arrowLength = 74;
    const tailX = tipX - Math.cos(radians) * arrowLength;
    const tailY = tipY - Math.sin(radians) * arrowLength;

    context.save();
    context.strokeStyle = "#dc2626";
    context.fillStyle = "#dc2626";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(tipX, tipY);
    context.stroke();

    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(
      tipX - Math.cos(radians - 0.55) * 24,
      tipY - Math.sin(radians - 0.55) * 24,
    );
    context.lineTo(
      tipX - Math.cos(radians + 0.55) * 24,
      tipY - Math.sin(radians + 0.55) * 24,
    );
    context.closePath();
    context.fill();

    context.font = "700 28px Arial";
    const labelWidth = context.measureText(entrance.label).width;
    const labelHeight = 34;
    const verticalGap = 18;
    const horizontalGap = 9;
    const arrowBounds = {
      minX: Math.min(tipX, tailX),
      maxX: Math.max(tipX, tailX),
      minY: Math.min(tipY, tailY),
      maxY: Math.max(tipY, tailY),
    };
    const labelPosition = getExportEntranceLabelCoordinates(
      entrance.labelPosition,
      arrowBounds,
      labelWidth,
      labelHeight,
      verticalGap,
      horizontalGap,
    );
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(entrance.label, labelPosition.x, labelPosition.y + labelHeight / 2);
    context.restore();
  });
}

function getExportEntranceLabelCoordinates(
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

function clipSite(
  context: CanvasRenderingContext2D,
  siteShape: SiteShape,
  siteVertices: Array<{ x: number; y: number }>,
  origin: { x: number; y: number },
  scale: number,
  siteWidth: number,
  siteHeight: number,
) {
  context.beginPath();
  if (siteShape === "polygon" && siteVertices.length >= 3) {
    siteVertices.forEach((point, index) => {
      const x = origin.x + point.x * scale;
      const y = origin.y + point.y * scale;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  } else {
    context.rect(origin.x, origin.y, siteWidth, siteHeight);
  }
  context.clip();
}

function clipPlan(
  context: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  width: number,
  height: number,
) {
  context.beginPath();
  context.rect(origin.x, origin.y, width, height);
  context.clip();
}

function drawRoads(
  context: CanvasRenderingContext2D,
  roads: SetupRoad[],
  site: SiteDimensions,
  boundary: PdfBackgroundMeta["siteBoundary"] | undefined,
  planOrigin: { x: number; y: number },
  minX: number,
  minY: number,
  scale: number,
  labelsOnly: boolean,
) {
  if (!boundary?.width || !boundary.height) return;

  roads.forEach((road) => {
    const points = getConceptRoadPoints(road).map((point) =>
      backgroundPointToExport(point, site, boundary, planOrigin, minX, minY, scale),
    );
    if (points.length < 2) return;
    const roadWidth = Math.max(2, road.width * scale);

    context.save();
    if (labelsOnly) {
      drawRoadLabel(context, road, points, roadWidth);
    } else {
      context.strokeStyle = "#6b7280";
      context.lineWidth = roadWidth + 8;
      context.lineJoin = "round";
      context.lineCap = "round";
      tracePolyline(context, points);
      context.stroke();
      context.strokeStyle = "#d1d5db";
      context.lineWidth = roadWidth;
      tracePolyline(context, points);
      context.stroke();
    }
    context.restore();
  });
}

function getConceptRoadPoints(road: SetupRoad) {
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

function drawRoadLabel(
  context: CanvasRenderingContext2D,
  road: SetupRoad,
  points: Array<{ x: number; y: number }>,
  roadWidth: number,
) {
  const segments = points
    .slice(0, -1)
    .map((start, index) => {
      const end = points[index + 1];
      return {
        start,
        end,
        length: Math.hypot(end.x - start.x, end.y - start.y),
      };
    })
    .sort((left, right) => right.length - left.length);
  const segment = segments[0];
  if (!segment || segment.length < 12 || roadWidth < 10) return;

  const usableLength = Math.max(1, segment.length - roadWidth * 0.7);
  const usableHeight = Math.max(1, roadWidth * 0.72);
  const labels = getRoadLabelCandidates(road);
  const fitted = fitSingleLineLabel(context, labels, usableLength, usableHeight, 44, 8);
  if (!fitted) return;

  const centerX = (segment.start.x + segment.end.x) / 2;
  const centerY = (segment.start.y + segment.end.y) / 2;
  let angle = Math.atan2(
    segment.end.y - segment.start.y,
    segment.end.x - segment.start.x,
  );
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(angle);
  context.beginPath();
  context.rect(-usableLength / 2, -usableHeight / 2, usableLength, usableHeight);
  context.clip();
  context.fillStyle = "#111827";
  context.font = `700 ${fitted.fontSize}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(fitted.text, 0, 0, usableLength);
  context.restore();
}

function getRoadLabelCandidates(road: SetupRoad) {
  const width = formatDistance(road.width);
  const name =
    road.type === "primary"
      ? "Primary Road"
      : road.type === "secondary"
        ? "Secondary Road"
        : "Lane";
  const shortName =
    road.type === "primary" ? "Primary" : road.type === "secondary" ? "Secondary" : "Lane";
  return [`${name} (${width}m)`, `${shortName} (${width}m)`, `${width}m`];
}

function drawAncillaryBuildings(
  context: CanvasRenderingContext2D,
  buildings: AncillaryBuilding[],
  site: SiteDimensions,
  boundary: PdfBackgroundMeta["siteBoundary"] | undefined,
  planOrigin: { x: number; y: number },
  minX: number,
  minY: number,
  scale: number,
  labelsOnly: boolean,
) {
  if (!boundary?.width || !boundary.height) return;

  buildings.forEach((building) => {
    const points = building.points.map((point) =>
      backgroundPointToExport(point, site, boundary, planOrigin, minX, minY, scale),
    );
    if (points.length < 3) return;

    context.save();
    tracePolygon(context, points);
    if (labelsOnly) {
      context.clip();
      drawHorizontalPolygonLabel(context, building.label, points);
    } else {
      context.fillStyle = "#e5e7eb";
      context.fill();
      context.strokeStyle = "#4b5563";
      context.lineWidth = 6;
      context.stroke();
    }
    context.restore();
  });
}

function drawExistingBuildings(
  context: CanvasRenderingContext2D,
  buildings: ExistingBuilding[],
  site: SiteDimensions,
  boundary: PdfBackgroundMeta["siteBoundary"] | undefined,
  planOrigin: { x: number; y: number },
  minX: number,
  minY: number,
  scale: number,
  labelsOnly: boolean,
) {
  if (!boundary?.width || !boundary.height) return;

  buildings.forEach((building) => {
    const points = building.points.map((point) =>
      backgroundPointToExport(point, site, boundary, planOrigin, minX, minY, scale),
    );
    if (points.length < 3) return;

    context.save();
    tracePolygon(context, points);
    if (labelsOnly) {
      context.clip();
      drawHorizontalPolygonLabel(context, building.label, points);
    } else {
      context.fillStyle = "rgba(107, 114, 128, 0.48)";
      context.fill();
      context.strokeStyle = "#374151";
      context.lineWidth = 6;
      context.stroke();
    }
    context.restore();
  });
}

function drawExistingTrees(
  context: CanvasRenderingContext2D,
  trees: ExistingTree[],
  site: SiteDimensions,
  boundary: PdfBackgroundMeta["siteBoundary"] | undefined,
  planOrigin: { x: number; y: number },
  minX: number,
  minY: number,
  scale: number,
) {
  if (!boundary?.width || !boundary.height) return;
  const scaleX = (site.width * scale) / boundary.width;
  const scaleY = (site.length * scale) / boundary.height;
  const radiusScale = Math.min(scaleX, scaleY);

  trees.forEach((tree) => {
    const center = backgroundPointToExport(tree, site, boundary, planOrigin, minX, minY, scale);
    const radius = Math.max(3, tree.radius * radiusScale);
    context.save();
    context.fillStyle = "rgba(34, 197, 94, 0.35)";
    context.strokeStyle = "#166534";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(center.x, center.y, Math.max(2, radius * 0.12), 0, Math.PI * 2);
    context.fillStyle = "#166534";
    context.fill();
    context.restore();
  });
}

function drawHorizontalPolygonLabel(
  context: CanvasRenderingContext2D,
  label: string,
  points: Array<{ x: number; y: number }>,
) {
  const bounds = getPointBounds(points);
  const preferredY = clampNumber(
    getPolygonCentroid(points).y,
    bounds.minY + 4,
    bounds.maxY - 4,
  );
  const span = getWidestHorizontalSpan(points, preferredY, bounds);
  if (!span || span.width < 8 || bounds.maxY - bounds.minY < 8) return;

  const maxWidth = Math.max(1, span.width * 0.88);
  const maxHeight = Math.max(1, (bounds.maxY - bounds.minY) * 0.72);
  const fitted = fitSingleLineLabel(context, [label], maxWidth, maxHeight, 46, 8);
  if (!fitted) return;

  context.fillStyle = "#111827";
  context.font = `700 ${fitted.fontSize}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(fitted.text, span.centerX, span.y, maxWidth);
}

function backgroundPointToExport(
  point: { x: number; y: number },
  site: SiteDimensions,
  boundary: PdfBackgroundMeta["siteBoundary"],
  planOrigin: { x: number; y: number },
  minX: number,
  minY: number,
  scale: number,
) {
  const analysisX = ((point.x - boundary.x) / boundary.width) * site.width;
  const analysisY = ((point.y - boundary.y) / boundary.height) * site.length;
  return {
    x: planOrigin.x + (analysisX - minX) * scale,
    y: planOrigin.y + (analysisY - minY) * scale,
  };
}

function getExportAnalysisBounds(
  site: SiteDimensions,
  crop: PdfBackgroundMeta["crop"] | undefined,
  boundary: PdfBackgroundMeta["siteBoundary"] | undefined,
) {
  if (!crop || !boundary?.width || !boundary.height) {
    return { minX: 0, maxX: site.width, minY: 0, maxY: site.length };
  }

  return {
    minX: -(boundary.x / boundary.width) * site.width,
    maxX: ((crop.width - boundary.x) / boundary.width) * site.width,
    minY: -(boundary.y / boundary.height) * site.length,
    maxY: ((crop.height - boundary.y) / boundary.height) * site.length,
  };
}


function tracePolyline(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) {
  tracePolyline(context, points);
  context.closePath();
}

function fitSingleLineLabel(
  context: CanvasRenderingContext2D,
  candidates: string[],
  maxWidth: number,
  maxHeight: number,
  maximumFontSize: number,
  minimumFontSize: number,
) {
  for (const text of candidates) {
    for (
      let fontSize = Math.min(maximumFontSize, Math.floor(maxHeight * 0.82));
      fontSize >= minimumFontSize;
      fontSize -= 1
    ) {
      context.font = `700 ${fontSize}px Arial`;
      const metrics = context.measureText(text);
      const textHeight =
        (metrics.actualBoundingBoxAscent || fontSize * 0.75) +
        (metrics.actualBoundingBoxDescent || fontSize * 0.25);
      if (metrics.width <= maxWidth && textHeight <= maxHeight) {
        return { text, fontSize };
      }
    }
  }
  return undefined;
}

function getPointBounds(points: Array<{ x: number; y: number }>) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getPolygonCentroid(points: Array<{ x: number; y: number }>) {
  let signedArea = 0;
  let centerX = 0;
  let centerY = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.y - next.x * point.y;
    signedArea += cross;
    centerX += (point.x + next.x) * cross;
    centerY += (point.y + next.y) * cross;
  });
  if (Math.abs(signedArea) < 0.001) {
    return points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / points.length,
        y: sum.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
  }
  return {
    x: centerX / (3 * signedArea),
    y: centerY / (3 * signedArea),
  };
}

function getWidestHorizontalSpan(
  points: Array<{ x: number; y: number }>,
  preferredY: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const candidates = [
    preferredY,
    (bounds.minY + bounds.maxY) / 2,
    bounds.minY + (bounds.maxY - bounds.minY) * 0.35,
    bounds.minY + (bounds.maxY - bounds.minY) * 0.65,
  ];
  return candidates
    .flatMap((y) => getHorizontalSpans(points, y))
    .sort((left, right) => right.width - left.width)[0];
}

function getHorizontalSpans(points: Array<{ x: number; y: number }>, y: number) {
  const intersections: number[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if ((point.y <= y && next.y > y) || (next.y <= y && point.y > y)) {
      intersections.push(point.x + ((y - point.y) * (next.x - point.x)) / (next.y - point.y));
    }
  });
  intersections.sort((left, right) => left - right);
  const spans: Array<{ centerX: number; y: number; width: number }> = [];
  for (let index = 0; index + 1 < intersections.length; index += 2) {
    const start = intersections[index];
    const end = intersections[index + 1];
    spans.push({ centerX: (start + end) / 2, y, width: end - start });
  }
  return spans;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDistance(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function drawSidewalks(
  context: CanvasRenderingContext2D,
  sidewalks: Sidewalk[],
  site: SiteDimensions,
  origin: { x: number; y: number },
  scale: number,
) {
  sidewalks.forEach((sidewalk) => {
    const points = getSidewalkPoints(sidewalk).map((point) => ({
      x: origin.x + point.x * scale,
      y: origin.y + point.y * scale,
    }));
    const center = points.reduce(
      (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
      { x: 0, y: 0 },
    );

    context.save();
    context.fillStyle = "#f3f4f6";
    context.strokeStyle = "#6b7280";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.clip();
    context.fillStyle = "#111827";
    context.font = "600 30px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(sidewalk.label, center.x, center.y);
    context.restore();
  });
}

function drawTrees(
  context: CanvasRenderingContext2D,
  trees: Tree[],
  origin: { x: number; y: number },
  scale: number,
) {
  trees.forEach((tree) => {
    const radius = tree.radius * scale;
    context.save();
    context.translate(origin.x + tree.x * scale - radius, origin.y + tree.y * scale - radius);
    drawTree(context, radius * 2, radius * 2);
    context.restore();
  });
}

function drawSiteLabels(
  context: CanvasRenderingContext2D,
  siteLabels: SiteLabel[],
  origin: { x: number; y: number },
  scale: number,
) {
  context.save();
  context.fillStyle = "#000000";
  context.font = "700 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";

  siteLabels.forEach((label) => {
    context.fillText(label.text, origin.x + label.x * scale, origin.y + label.y * scale);
  });

  context.restore();
}

function drawSiteBoundary(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.strokeStyle = "#000000";
  context.lineWidth = 12;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawOpenSpacePattern(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.strokeStyle = "#d1d5db";
  context.lineWidth = 2;
  const spacing = 44;

  for (let offset = -height; offset < width; offset += spacing) {
    context.beginPath();
    context.moveTo(x + offset, y + height);
    context.lineTo(x + offset + height, y);
    context.stroke();
  }

  context.restore();
}

function drawBuildings(
  context: CanvasRenderingContext2D,
  buildings: Building[],
  origin: { x: number; y: number },
  scale: number,
) {
  buildings.forEach((building) => {
    const x = origin.x + building.x * scale;
    const y = origin.y + building.y * scale;
    const width = building.length * scale;
    const height = building.width * scale;

    context.save();
    context.translate(x, y);
    context.rotate((building.rotation * Math.PI) / 180);

    drawBuildingOutline(context, width, height, building.color);
    drawBuildingProgramSchedule(context, building, width, height);

    context.restore();
  });
}

function drawBuildingOutline(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color = "#ffffff",
) {
  context.fillStyle = color;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 14;
  context.fillRect(0, 0, width, height);
  context.strokeRect(0, 0, width, height);
  context.strokeStyle = "#111827";
  context.lineWidth = 8;
  context.strokeRect(0, 0, width, height);
}

function drawBridge(context: CanvasRenderingContext2D, width: number, height: number) {
  drawBuildingOutline(context, width, height);
  context.strokeStyle = "#000000";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, height * 0.25);
  context.lineTo(width, height * 0.25);
  context.moveTo(0, height * 0.75);
  context.lineTo(width, height * 0.75);
  context.stroke();

  const beamSpacing = Math.max(45, height * 1.5);
  for (let beamX = beamSpacing; beamX < width; beamX += beamSpacing) {
    context.beginPath();
    context.moveTo(beamX, 0);
    context.lineTo(beamX, height);
    context.stroke();
  }
}

function drawToilet(context: CanvasRenderingContext2D, width: number, height: number) {
  drawBuildingOutline(context, width, height);
  context.strokeStyle = "#000000";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.moveTo(0, height * 0.72);
  context.lineTo(width, height * 0.72);
  context.stroke();

  drawServiceFixture(context, width * 0.25, height * 0.38, Math.min(width, height) * 0.1);
  drawServiceFixture(context, width * 0.75, height * 0.38, Math.min(width, height) * 0.1);
}

function drawServiceFixture(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  context.arc(x, y, Math.max(8, radius), 0, Math.PI * 2);
  context.stroke();
}

function drawTree(context: CanvasRenderingContext2D, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(18, Math.min(width, height) * 0.44);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#000000";
  context.lineWidth = 5;

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
  context.stroke();

  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    context.stroke();
  }
}

function drawProgramZones(context: CanvasRenderingContext2D, building: Building, width: number, height: number) {
  const totalProgramArea = building.programs.reduce((sum, program) => sum + Math.max(0, program.area), 0);
  const fallbackArea = totalProgramArea > 0 ? 0 : 1;
  let cursor = 0;
  const splitVertically = width >= height;

  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#ffffff";
  context.lineWidth = 3;

  building.programs.forEach((program, index) => {
    const areaWeight = totalProgramArea > 0 ? Math.max(0, program.area) : fallbackArea;
    const ratio = totalProgramArea > 0 ? areaWeight / totalProgramArea : 1 / building.programs.length;
    const isLast = index === building.programs.length - 1;
    const zone = splitVertically
      ? {
          x: cursor,
          y: 0,
          width: isLast ? width - cursor : width * ratio,
          height,
        }
      : {
          x: 0,
          y: cursor,
          width,
          height: isLast ? height - cursor : height * ratio,
        };

    context.fillRect(zone.x, zone.y, zone.width, zone.height);
    context.strokeRect(zone.x, zone.y, zone.width, zone.height);
    drawProgramLabel(context, program.name, program.area, zone);
    cursor += splitVertically ? zone.width : zone.height;
  });

  context.restore();
}

function drawProgramLabel(
  context: CanvasRenderingContext2D,
  name: string,
  area: number,
  zone: { x: number; y: number; width: number; height: number },
) {
  const padding = Math.max(8, Math.min(zone.width, zone.height) * 0.08);
  const label = area > 0 ? `${name}\n${area.toFixed(1)} m²` : name;
  const maxWidth = Math.max(1, zone.width - padding * 2);
  const maxHeight = Math.max(1, zone.height - padding * 2);

  context.save();
  context.beginPath();
  context.rect(zone.x + padding, zone.y + padding, maxWidth, maxHeight);
  context.clip();
  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lines = fitTextLines(context, label, maxWidth, maxHeight);
  const lineHeight = lines.fontSize * 1.22;
  const startY = zone.y + zone.height / 2 - ((lines.lines.length - 1) * lineHeight) / 2;
  context.font = `600 ${lines.fontSize}px Arial`;

  lines.lines.forEach((line, index) => {
    context.fillText(line, zone.x + zone.width / 2, startY + index * lineHeight, maxWidth);
  });

  context.restore();
}

function fitTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
) {
  for (let fontSize = 40; fontSize >= 10; fontSize -= 2) {
    context.font = `600 ${fontSize}px Arial`;
    const lines = wrapText(context, text, maxWidth);
    const totalHeight = lines.length * fontSize * 1.22;

    if (totalHeight <= maxHeight && lines.every((line) => context.measureText(line).width <= maxWidth)) {
      return { fontSize, lines };
    }
  }

  context.font = "600 10px Arial";
  return {
    fontSize: 10,
    lines: wrapText(context, text, maxWidth).slice(0, Math.max(1, Math.floor(maxHeight / 12))),
  };
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];

    const lines: string[] = [];
    let currentLine = words[0];

    words.slice(1).forEach((word) => {
      const candidate = `${currentLine} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });

    lines.push(currentLine);
    return lines;
  });
}

function drawHorizontalLabel(
  context: CanvasRenderingContext2D,
  building: Building,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radians = (building.rotation * Math.PI) / 180;
  const centerX = x + (width / 2) * Math.cos(radians) - (height / 2) * Math.sin(radians);
  const centerY = y + (width / 2) * Math.sin(radians) + (height / 2) * Math.cos(radians);
  const fontSize = Math.max(24, Math.min(54, Math.min(width, height) * 0.23));

  context.save();
  context.font = `600 ${fontSize}px Arial`;
  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(building.label, centerX, centerY, Math.max(80, Math.max(width, height) * 0.9));
  context.restore();
}

function drawBuildingProgramSchedule(
  context: CanvasRenderingContext2D,
  building: Building,
  width: number,
  height: number,
) {
  const padding = Math.max(10, Math.min(width, height) * 0.07);
  const maxWidth = Math.max(1, width - padding * 2);
  const maxHeight = Math.max(1, height - padding * 2);
  const programLines = building.programs.map(
    (program, index) => `${index + 1}. ${program.name} (${formatArea(program.area)}m\u00b2)`,
  );
  const layout = fitBuildingSchedule(context, building.label, programLines, maxWidth, maxHeight);
  const titleHeight = layout.titleFontSize * 1.25;
  const lineHeight = layout.programFontSize * 1.25;
  const gap = programLines.length ? layout.programFontSize * 0.45 : 0;
  const contentHeight = titleHeight + gap + programLines.length * lineHeight;
  let y = (height - contentHeight) / 2;

  context.save();
  context.beginPath();
  context.rect(padding, padding, maxWidth, maxHeight);
  context.clip();
  context.fillStyle = getContrastingTextColor(building.color);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${layout.titleFontSize}px Arial`;
  context.fillText(building.label, width / 2, y + titleHeight / 2, maxWidth);
  y += titleHeight + gap;

  context.font = `500 ${layout.programFontSize}px Arial`;
  programLines.forEach((line) => {
    context.fillText(line, width / 2, y + lineHeight / 2, maxWidth);
    y += lineHeight;
  });
  context.restore();
}

function fitBuildingSchedule(
  context: CanvasRenderingContext2D,
  title: string,
  programLines: string[],
  maxWidth: number,
  maxHeight: number,
) {
  for (let programFontSize = 48; programFontSize >= 4; programFontSize -= 1) {
    const titleFontSize = Math.min(72, Math.max(programFontSize * 1.35, programFontSize + 4));
    const totalHeight =
      titleFontSize * 1.25 +
      (programLines.length ? programFontSize * 0.45 : 0) +
      programLines.length * programFontSize * 1.25;
    if (totalHeight > maxHeight) continue;

    context.font = `700 ${titleFontSize}px Arial`;
    if (context.measureText(title).width > maxWidth) continue;
    context.font = `500 ${programFontSize}px Arial`;
    if (programLines.every((line) => context.measureText(line).width <= maxWidth)) {
      return { titleFontSize, programFontSize };
    }
  }

  return { titleFontSize: 6, programFontSize: 4 };
}

function getContrastingTextColor(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#111827" : "#ffffff";
}

function formatArea(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function drawDistanceAnnotations(
  context: CanvasRenderingContext2D,
  buildings: Building[],
  selectedBuildingId: string,
  site: SiteDimensions,
  origin: { x: number; y: number },
  scale: number,
) {
  const selected = buildings.find((building) => building.id === selectedBuildingId);
  if (!selected) return;
  const selectedBounds = getExportBuildingBounds(selected, origin, scale);
  const siteBounds = {
    minX: origin.x,
    maxX: origin.x + site.width * scale,
    minY: origin.y,
    maxY: origin.y + site.length * scale,
  };
  const centerX = (selectedBounds.minX + selectedBounds.maxX) / 2;
  const centerY = (selectedBounds.minY + selectedBounds.maxY) / 2;

  context.save();
  context.strokeStyle = "#f97316";
  context.fillStyle = "#f97316";
  context.lineWidth = 4;
  context.font = "700 28px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";

  drawExportDimension(
    context,
    siteBounds.minX,
    centerY,
    selectedBounds.minX,
    centerY,
    `${Math.max(0, (selectedBounds.minX - siteBounds.minX) / scale).toFixed(1)} m`,
  );
  drawExportDimension(
    context,
    selectedBounds.maxX,
    centerY,
    siteBounds.maxX,
    centerY,
    `${Math.max(0, (siteBounds.maxX - selectedBounds.maxX) / scale).toFixed(1)} m`,
  );
  drawExportDimension(
    context,
    centerX,
    siteBounds.minY,
    centerX,
    selectedBounds.minY,
    `${Math.max(0, (selectedBounds.minY - siteBounds.minY) / scale).toFixed(1)} m`,
  );
  drawExportDimension(
    context,
    centerX,
    selectedBounds.maxY,
    centerX,
    siteBounds.maxY,
    `${Math.max(0, (siteBounds.maxY - selectedBounds.maxY) / scale).toFixed(1)} m`,
  );

  buildings
    .filter((building) => building.id !== selectedBuildingId)
    .forEach((building) => {
      const other = getExportBuildingBounds(building, origin, scale);
      if (selectedBounds.maxX < other.minX || other.maxX < selectedBounds.minX) {
        const startX = selectedBounds.maxX < other.minX ? selectedBounds.maxX : other.maxX;
        const endX = selectedBounds.maxX < other.minX ? other.minX : selectedBounds.minX;
        const y = getExportIntervalAnchor(selectedBounds.minY, selectedBounds.maxY, other.minY, other.maxY);
        drawExportDimension(context, startX, y, endX, y, `${((endX - startX) / scale).toFixed(1)} m`);
      }
      if (selectedBounds.maxY < other.minY || other.maxY < selectedBounds.minY) {
        const startY = selectedBounds.maxY < other.minY ? selectedBounds.maxY : other.maxY;
        const endY = selectedBounds.maxY < other.minY ? other.minY : selectedBounds.minY;
        const x = getExportIntervalAnchor(selectedBounds.minX, selectedBounds.maxX, other.minX, other.maxX);
        drawExportDimension(context, x, startY, x, endY, `${((endY - startY) / scale).toFixed(1)} m`);
      }
    });

  context.restore();
}

function drawExportDimension(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  label: string,
) {
  if (Math.hypot(endX - startX, endY - startY) < 12) return;
  drawDimensionLine(context, startX, startY, endX, endY);
  const horizontal = Math.abs(endX - startX) >= Math.abs(endY - startY);
  context.fillText(
    label,
    (startX + endX) / 2 + (horizontal ? 0 : 48),
    (startY + endY) / 2 + (horizontal ? -26 : 0),
  );
}

function getExportBuildingBounds(
  building: Building,
  origin: { x: number; y: number },
  scale: number,
) {
  const x = origin.x + building.x * scale;
  const y = origin.y + building.y * scale;
  const width = building.length * scale;
  const height = building.width * scale;
  const radians = (building.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    rotateExportPoint(0, 0, x, y, cos, sin),
    rotateExportPoint(width, 0, x, y, cos, sin),
    rotateExportPoint(width, height, x, y, cos, sin),
    rotateExportPoint(0, height, x, y, cos, sin),
  ];

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function rotateExportPoint(
  localX: number,
  localY: number,
  originX: number,
  originY: number,
  cos: number,
  sin: number,
) {
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos,
  };
}

function getExportIntervalAnchor(minA: number, maxA: number, minB: number, maxB: number) {
  const overlapStart = Math.max(minA, minB);
  const overlapEnd = Math.min(maxA, maxB);
  return overlapEnd >= overlapStart
    ? (overlapStart + overlapEnd) / 2
    : (minA + maxA + minB + maxB) / 4;
}

function drawSiteDimensions(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  site: SiteDimensions,
) {
  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#000000";
  context.lineWidth = 3;
  context.font = "34px Arial";
  context.textAlign = "center";

  const topY = y - 95;
  drawDimensionLine(context, x, topY, x + width, topY);
  context.fillText(`${site.width.toFixed(1)} m`, x + width / 2, topY - 24);

  const leftX = x - 95;
  drawDimensionLine(context, leftX, y, leftX, y + height);
  context.save();
  context.translate(leftX - 30, y + height / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(`${site.length.toFixed(1)} m`, 0, 0);
  context.restore();
  context.restore();
}

function drawDimensionLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();

  const angle = Math.atan2(endY - startY, endX - startX);
  drawArrowHead(context, startX, startY, angle + Math.PI);
  drawArrowHead(context, endX, endY, angle);
}

function drawArrowHead(context: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = 16;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x - Math.cos(angle - 0.5) * size, y - Math.sin(angle - 0.5) * size);
  context.moveTo(x, y);
  context.lineTo(x - Math.cos(angle + 0.5) * size, y - Math.sin(angle + 0.5) * size);
  context.stroke();
}

function drawNorthArrow(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#000000";
  context.lineWidth = 7;
  context.font = "700 58px Arial";
  context.textAlign = "center";
  context.fillText("N", x, y - 90);
  context.beginPath();
  context.moveTo(x, y + 95);
  context.lineTo(x, y - 45);
  context.stroke();
  context.beginPath();
  context.moveTo(x, y - 70);
  context.lineTo(x - 28, y - 20);
  context.lineTo(x + 28, y - 20);
  context.closePath();
  context.fill();
  context.restore();
}

function drawTitleBlock(context: CanvasRenderingContext2D, projectName: string) {
  const top = exportHeight - titleBlockHeight;
  context.save();
  context.strokeStyle = "#000000";
  context.fillStyle = "#000000";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(drawingMargin, top);
  context.lineTo(exportWidth - drawingMargin, top);
  context.stroke();

  context.font = "700 72px Arial";
  context.textAlign = "left";
  context.fillText("SITE PLAN", drawingMargin, top + 98);
  context.font = "42px Arial";
  context.fillText(projectName, drawingMargin, top + 164, exportWidth - drawingMargin * 2 - 280);

  context.textAlign = "right";
  context.font = "700 52px Arial";
  context.fillText("1:500", exportWidth - drawingMargin, top + 96);
  context.font = "34px Arial";
  context.fillText("SCALE", exportWidth - drawingMargin, top + 152);
  context.restore();
}

function sanitizeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .replace(/[. ]+$/g, "") || "Untitled Layout"
  );
}

function isTree(building: Building) {
  return building.label.trim().toLowerCase().includes("tree");
}

function formatDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("-");
}
