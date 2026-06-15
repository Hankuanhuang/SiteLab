export const DEFAULT_PROJECT_NAME = "Untitled Project";

export function normalizeProjectName(value?: string | null) {
  return value?.trim() || DEFAULT_PROJECT_NAME;
}

export function getProjectNameFromPdfFilename(fileName?: string | null) {
  const baseName = fileName?.trim().replace(/\.pdf$/i, "").trim();
  return normalizeProjectName(baseName);
}
