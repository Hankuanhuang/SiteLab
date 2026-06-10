import type {
  Building,
  Entrance,
  Sidewalk,
  SiteDimensions,
  SiteLabel,
  SiteShape,
  Tree,
} from "../types/layout";

const exportWidth = 4200;
const exportHeight = 3000;
const drawingMargin = 320;
const titleBlockHeight = 260;

export function exportConceptSitePlan(
  site: SiteDimensions,
  buildings: Building[],
  siteLabels: SiteLabel[] = [],
  trees: Tree[] = [],
  sidewalks: Sidewalk[] = [],
  entrances: Entrance[] = [],
  projectName = "Untitled Layout",
  siteShape: SiteShape = "rectangle",
  siteVertices: Array<{ x: number; y: number }> = [],
  edgeLengths: number[] = [],
) {
  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const availableWidth = exportWidth - drawingMargin * 2;
  const availableHeight = exportHeight - drawingMargin * 2 - titleBlockHeight;
  const scale = Math.min(availableWidth / site.width, availableHeight / site.length);
  const siteWidth = site.width * scale;
  const siteHeight = site.length * scale;
  const origin = {
    x: drawingMargin + (availableWidth - siteWidth) / 2,
    y: drawingMargin + (availableHeight - siteHeight) / 2,
  };

  drawOpenSpacePattern(context, origin.x, origin.y, siteWidth, siteHeight);
  drawSidewalks(context, sidewalks, site, origin, scale);
  drawTrees(context, trees, origin, scale);
  drawBuildings(context, buildings, origin, scale);
  drawEntrances(context, entrances, origin, scale);
  drawSiteLabels(context, siteLabels, origin, scale);
  if (siteShape === "polygon" && siteVertices.length >= 3) {
    drawPolygonSiteBoundary(context, siteVertices, edgeLengths, origin, scale);
  } else {
    drawSiteBoundary(context, origin.x, origin.y, siteWidth, siteHeight);
    drawSiteDimensions(context, origin.x, origin.y, siteWidth, siteHeight, site);
  }
  drawNorthArrow(context, exportWidth - 330, 280);
  drawTitleBlock(context, projectName);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(projectName)}-concept-site-plan-${formatDate(new Date())}.png`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, "image/png");
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

function drawSidewalks(
  context: CanvasRenderingContext2D,
  sidewalks: Sidewalk[],
  site: SiteDimensions,
  origin: { x: number; y: number },
  scale: number,
) {
  sidewalks.forEach((sidewalk) => {
    const width = Math.min(
      sidewalk.width,
      sidewalk.edge === "top" || sidewalk.edge === "bottom" ? site.length : site.width,
    );
    const geometry =
      sidewalk.edge === "top"
        ? { x: 0, y: 0, width: site.width, height: width }
        : sidewalk.edge === "bottom"
          ? { x: 0, y: site.length - width, width: site.width, height: width }
          : sidewalk.edge === "left"
            ? { x: 0, y: 0, width, height: site.length }
            : { x: site.width - width, y: 0, width, height: site.length };
    const x = origin.x + geometry.x * scale;
    const y = origin.y + geometry.y * scale;
    const renderedWidth = geometry.width * scale;
    const renderedHeight = geometry.height * scale;

    context.save();
    context.fillStyle = "#f3f4f6";
    context.strokeStyle = "#6b7280";
    context.lineWidth = 4;
    context.fillRect(x, y, renderedWidth, renderedHeight);
    context.strokeRect(x, y, renderedWidth, renderedHeight);
    context.beginPath();
    context.rect(x, y, renderedWidth, renderedHeight);
    context.clip();
    context.strokeStyle = "#9ca3af";
    context.lineWidth = 2;
    const spacing = 28;
    for (let offset = -renderedHeight; offset < renderedWidth; offset += spacing) {
      context.beginPath();
      context.moveTo(x + offset, y + renderedHeight);
      context.lineTo(x + offset + renderedHeight, y);
      context.stroke();
    }
    context.fillStyle = "#111827";
    context.font = "600 30px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(sidewalk.label, x + renderedWidth / 2, y + renderedHeight / 2, Math.max(1, renderedWidth - 24));
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

    if (isTree(building)) {
      drawTree(context, width, height);
    } else if (building.programs.length) {
      drawBuildingOutline(context, width, height);
      drawProgramZones(context, building, width, height);
    } else if (building.type === "bridge") {
      drawBridge(context, width, height);
    } else if (building.type === "toilet") {
      drawToilet(context, width, height);
    } else {
      drawBuildingOutline(context, width, height);
    }

    context.restore();
    if (!building.programs.length) {
      drawHorizontalLabel(context, building, x, y, width, height);
    }
  });
}

function drawBuildingOutline(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#000000";
  context.lineWidth = 8;
  context.fillRect(0, 0, width, height);
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
