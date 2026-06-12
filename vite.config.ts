import { Buffer } from "node:buffer";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
  const imageModel = process.env.OPENAI_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || "gpt-image-2";

  return {
    plugins: [
      react(),
      {
        name: "concept-plan-ai-render",
        configureServer(server) {
          server.middlewares.use("/api/render-concept-plan", createRenderMiddleware(apiKey, imageModel));
        },
        configurePreviewServer(server) {
          server.middlewares.use("/api/render-concept-plan", createRenderMiddleware(apiKey, imageModel));
        },
      },
    ],
  };
});

function createRenderMiddleware(apiKey: string | undefined, imageModel: string) {
  return async (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end(JSON.stringify({ error: "Method not allowed." }));
      return;
    }
    if (!apiKey) {
      response.statusCode = 503;
      response.end(JSON.stringify({
        error: "AI rendering is not configured. Set OPENAI_API_KEY on the server.",
      }));
      return;
    }

    try {
      const payload = await readJsonBody(request);
      const imageDataUrl = typeof payload.imageDataUrl === "string" ? payload.imageDataUrl : "";
      const image = parseImageDataUrl(imageDataUrl);
      if (!image) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "A valid PNG export is required." }));
        return;
      }

      const form = new FormData();
      form.append("model", imageModel);
      form.append("image[]", new Blob([image.bytes], { type: image.mimeType }), "concept-plan.png");
      form.append("prompt", buildRenderPrompt());
      form.append("size", "1536x1024");
      form.append("quality", "high");
      form.append("output_format", "png");
      form.append("n", "1");

      const openAiResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const result = await openAiResponse.json() as {
        data?: Array<{ b64_json?: string }>;
        error?: { message?: string };
      };
      const base64 = result.data?.[0]?.b64_json;
      if (!openAiResponse.ok || !base64) {
        response.statusCode = openAiResponse.status || 502;
        response.end(JSON.stringify({
          error: result.error?.message || "OpenAI did not return a rendered image.",
        }));
        return;
      }

      response.statusCode = 200;
      response.end(JSON.stringify({ imageDataUrl: `data:image/png;base64,${base64}` }));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Unable to render the concept plan.",
      }));
    }
  };
}

function buildRenderPrompt() {
  return [
    "Transform this architectural site plan into a professional architectural presentation rendering.",
    "Use the supplied image as the strict base reference and preserve the original site layout exactly.",
    "Maintain the exact architectural planning geometry.",
    "Do not modify the site boundary, building footprints, roads, road widths, sidewalks, existing trees, building positions, building sizes, building orientation, entrances, or labels.",
    "Do not add, remove, move, resize, rotate, distort, crop, or rename any mapped architectural object.",
    "Keep every existing label unchanged, legible, and associated with its original object.",
    "Maintain a true top-down orthographic site-plan view with no perspective distortion.",
    "Enhance the drawing with realistic landscape design, architectural paving patterns, outdoor furniture, benches, gathering areas, human-scale figures, planting design, shrubs, groundcover, tree shadows, architectural lighting, site textures, and clear material differentiation.",
    "Added presentation elements must fit available open spaces and must not obscure or alter mapped geometry or labels.",
    "Create a professional architectural competition-board and landscape-architecture presentation with a clean composition, sophisticated color palette, realistic but diagrammatic treatment, portfolio quality, and high-end architectural visualization.",
    "The final result should resemble a professionally rendered architectural site plan created by an experienced architect while preserving all source geometry.",
  ].join(" ");
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += bytes.length;
    if (totalBytes > 25 * 1024 * 1024) throw new Error("The export image is too large.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseImageDataUrl(value: string) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return undefined;
  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64"),
  };
}
