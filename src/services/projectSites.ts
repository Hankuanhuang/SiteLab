import type { ContextPoint, PdfBackgroundMeta, ProjectSite, SiteDimensions } from "../types/layout";

export function getSiteNameByIndex(index: number) {
  return `Site ${toAlphabetLabel(index)}`;
}

export function getProjectSites(backgroundMeta: PdfBackgroundMeta | undefined, site?: SiteDimensions): ProjectSite[] {
  if (backgroundMeta?.sites?.length) {
    return backgroundMeta.sites.map((projectSite) => cloneProjectSite(projectSite));
  }

  if (backgroundMeta?.siteBoundary && site) {
    return [{
      id: "site-a",
      name: getSiteNameByIndex(0),
      shape: backgroundMeta.siteShape ?? "rectangle",
      length: site.length,
      width: site.width,
      boundary: cloneSiteBoundary(backgroundMeta.siteBoundary),
    }];
  }

  return [];
}

export function getPrimaryProjectSite(
  backgroundMeta: PdfBackgroundMeta | undefined,
  site?: SiteDimensions,
) {
  return getProjectSites(backgroundMeta, site)[0];
}

export function cloneProjectSite(projectSite: ProjectSite): ProjectSite {
  return {
    ...projectSite,
    boundary: cloneSiteBoundary(projectSite.boundary),
  };
}

export function cloneSiteBoundary(boundary: ProjectSite["boundary"]): ProjectSite["boundary"] {
  return {
    ...boundary,
    polygon: boundary.polygon?.map((point) => ({ ...point })),
    edgeLengths: boundary.edgeLengths ? [...boundary.edgeLengths] : undefined,
  };
}

export function getProjectSiteArea(projectSite: ProjectSite) {
  return projectSite.length * projectSite.width;
}

export function getProjectSiteCenter(projectSite: ProjectSite) {
  if (projectSite.shape === "polygon" && projectSite.boundary.polygon?.length) {
    return getPolygonCentroid(projectSite.boundary.polygon) ?? getRectCenter(projectSite.boundary);
  }
  return getRectCenter(projectSite.boundary);
}

export function getProjectSiteBoundaryPoints(projectSite: ProjectSite): ContextPoint[] {
  if (projectSite.shape === "polygon" && projectSite.boundary.polygon?.length) {
    return projectSite.boundary.polygon.map((point) => ({ ...point }));
  }

  const { x, y, width, height } = projectSite.boundary;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function getRectCenter(boundary: ProjectSite["boundary"]) {
  return {
    x: boundary.x + boundary.width / 2,
    y: boundary.y + boundary.height / 2,
  };
}

function getPolygonCentroid(points: ContextPoint[]) {
  let signedArea = 0;
  let centerX = 0;
  let centerY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    signedArea += cross;
    centerX += (current.x + next.x) * cross;
    centerY += (current.y + next.y) * cross;
  }

  if (Math.abs(signedArea) < 0.001) return undefined;

  return {
    x: centerX / (3 * signedArea),
    y: centerY / (3 * signedArea),
  };
}

function toAlphabetLabel(index: number) {
  let value = index;
  let result = "";

  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return result;
}
