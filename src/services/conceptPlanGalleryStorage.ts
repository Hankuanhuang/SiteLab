import type { ConceptPlanExport } from "../types/layout";

const storageKey = "conceptPlanGallery.v1";
const activeProjectIdKey = "conceptPlanGallery.activeProjectId";
const activeProjectNameKey = "conceptPlanGallery.activeProjectName";

export function createProjectId() {
  return crypto.randomUUID();
}

export function getLegacyProjectId(projectName: string) {
  let hash = 0;
  for (const character of projectName.trim().toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `legacy-${hash.toString(36)}`;
}

export function readActiveProject() {
  return {
    id: localStorage.getItem(activeProjectIdKey) || createProjectId(),
    name: localStorage.getItem(activeProjectNameKey) || "Untitled Layout",
  };
}

export function saveActiveProject(projectId: string, projectName: string) {
  localStorage.setItem(activeProjectIdKey, projectId);
  localStorage.setItem(activeProjectNameKey, projectName);
}

export function readConceptPlanExports(projectId: string) {
  return readAllExports()
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.exportNumber - left.exportNumber);
}

export function addConceptPlanExport(item: ConceptPlanExport) {
  const exports = [item, ...readAllExports().filter((current) => current.id !== item.id)];
  writeAllExports(exports);
}

export function updateConceptPlanExport(projectId: string, exportId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) return;
  writeAllExports(
    readAllExports().map((item) =>
      item.projectId === projectId && item.id === exportId ? { ...item, name: normalizedName } : item,
    ),
  );
}

export function deleteConceptPlanExport(projectId: string, exportId: string) {
  writeAllExports(
    readAllExports().filter((item) => item.projectId !== projectId || item.id !== exportId),
  );
}

export function getNextExportNumber(projectId: string) {
  return readConceptPlanExports(projectId).reduce(
    (highest, item) => Math.max(highest, item.exportNumber),
    0,
  ) + 1;
}

function readAllExports(): ConceptPlanExport[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];

  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap(readExport);
  } catch {
    return [];
  }
}

function readExport(value: unknown): ConceptPlanExport[] {
  if (!isRecord(value)) return [];
  if (
    typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.layoutName !== "string" ||
    typeof value.exportNumber !== "number" ||
    typeof value.exportedAt !== "string" ||
    typeof value.previewDataUrl !== "string" ||
    typeof value.thumbnailDataUrl !== "string"
  ) {
    return [];
  }

  return [{
    id: value.id,
    projectId: value.projectId,
    name: value.name,
    layoutName: value.layoutName,
    exportNumber: value.exportNumber,
    exportedAt: value.exportedAt,
    previewDataUrl: value.previewDataUrl,
    thumbnailDataUrl: value.thumbnailDataUrl,
    favorite: value.favorite === true,
  }];
}

function writeAllExports(exports: ConceptPlanExport[]) {
  localStorage.setItem(storageKey, JSON.stringify(exports));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
