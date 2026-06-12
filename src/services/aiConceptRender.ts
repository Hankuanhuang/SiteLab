import type { ConceptPlanRenderedVersion } from "../types/layout";

export const conceptRenderName = "Architectural Site Plan Render";

export async function renderConceptPlanWithAi(
  sourceDataUrl: string,
): Promise<ConceptPlanRenderedVersion> {
  const imageDataUrl = await convertToPng(sourceDataUrl);
  const response = await fetch("/api/render-concept-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const result = await response.json() as { imageDataUrl?: string; error?: string };
  if (!response.ok || !result.imageDataUrl) {
    throw new Error(result.error || "Unable to render the concept plan.");
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    previewDataUrl: await resizeImage(result.imageDataUrl, 1400, "image/jpeg", 0.86),
    thumbnailDataUrl: await resizeImage(result.imageDataUrl, 360, "image/jpeg", 0.76),
  };
}

function convertToPng(source: string) {
  return resizeImage(source, 1536, "image/png");
}

function resizeImage(
  source: string,
  targetWidth: number,
  mimeType: "image/png" | "image/jpeg",
  quality?: number,
) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, targetWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to prepare the export image."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(mimeType, quality));
    };
    image.onerror = () => reject(new Error("Unable to read the selected export image."));
    image.src = source;
  });
}
