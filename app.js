import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

const pdfInput = document.querySelector("#pdfInput");
const loadStatus = document.querySelector("#loadStatus");
const uploadPanel = document.querySelector("#uploadPanel");
const pagePanel = document.querySelector("#pagePanel");
const pageOptions = document.querySelector("#pageOptions");
const workspace = document.querySelector("#workspace");
const workflowTitle = document.querySelector("#workflowTitle");
const shapePrompt = document.querySelector("#shapePrompt");
const rectangleButton = document.querySelector("#rectangleButton");
const polygonButton = document.querySelector("#polygonButton");
const resetButton = document.querySelector("#resetButton");
const finishPolygonButton = document.querySelector("#finishPolygonButton");
const canvasShell = document.querySelector("#canvasShell");
const pageImage = document.querySelector("#pageImage");
const canvas = document.querySelector("#drawCanvas");
const ctx = canvas.getContext("2d");
const dimensionForm = document.querySelector("#dimensionForm");
const primaryDimensionLabel = document.querySelector("#primaryDimensionLabel span");
const secondaryDimensionLabel = document.querySelector("#secondaryDimensionLabel");
const primaryDimension = document.querySelector("#primaryDimension");
const secondaryDimension = document.querySelector("#secondaryDimension");
const outputJson = document.querySelector("#outputJson");
const copyButton = document.querySelector("#copyButton");

const state = {
  pdf: null,
  site_page_index: null,
  render: null,
  mode: null,
  rectangle: null,
  polygon: [],
  draftPoint: null,
  dragging: false,
  dragStart: null,
  scale: null,
};

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

pdfInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    setStatus("Loading PDF...");
    const buffer = await file.arrayBuffer();
    state.pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    renderPageOptions(state.pdf.numPages);
    uploadPanel.classList.add("hidden");
    pagePanel.classList.remove("hidden");
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("Unable to load that PDF.", true);
  }
});

rectangleButton.addEventListener("click", () => {
  state.mode = "rectangle";
  state.rectangle = null;
  state.polygon = [];
  workflowTitle.textContent = "Drag a rectangle around the site.";
  shapePrompt.classList.add("hidden");
  finishPolygonButton.classList.add("hidden");
  dimensionForm.classList.add("hidden");
  draw();
});

polygonButton.addEventListener("click", () => {
  state.mode = "polygon";
  state.rectangle = null;
  state.polygon = [];
  workflowTitle.textContent = "Tap around the site boundary.";
  shapePrompt.classList.add("hidden");
  finishPolygonButton.classList.remove("hidden");
  dimensionForm.classList.add("hidden");
  draw();
});

resetButton.addEventListener("click", resetDrawing);
finishPolygonButton.addEventListener("click", finishPolygon);
window.addEventListener("resize", fitCanvas);

canvas.addEventListener("pointerdown", (event) => {
  if (!state.mode) return;
  canvas.setPointerCapture(event.pointerId);
  const point = getCanvasPoint(event);

  if (state.mode === "rectangle") {
    state.dragging = true;
    state.dragStart = point;
    state.rectangle = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  }

  if (state.mode === "polygon") {
    state.polygon.push([round(point.x), round(point.y)]);
    state.draftPoint = null;
    draw();
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.mode) return;
  const point = getCanvasPoint(event);

  if (state.mode === "rectangle" && state.dragging) {
    state.rectangle = {
      x1: state.dragStart.x,
      y1: state.dragStart.y,
      x2: point.x,
      y2: point.y,
    };
    draw();
  }

  if (state.mode === "polygon" && state.polygon.length > 0) {
    state.draftPoint = [round(point.x), round(point.y)];
    draw();
  }
});

canvas.addEventListener("pointerup", () => {
  if (state.mode === "rectangle" && state.dragging) {
    state.dragging = false;
    normalizeRectangle();
    askRectangleDimensions();
    draw();
  }
});

canvas.addEventListener("dblclick", () => {
  if (state.mode === "polygon") finishPolygon();
});

dimensionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.mode === "rectangle") calculateRectangleScale();
  if (state.mode === "polygon") calculatePolygonScale();
  updateOutput();
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputJson.textContent);
});

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.classList.toggle("error", isError);
}

function renderPageOptions(pageCount) {
  pageOptions.replaceChildren();
  for (let page = 1; page <= pageCount; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Page ${page}`;
    button.addEventListener("click", () => selectPage(page));
    pageOptions.append(button);
  }
}

async function selectPage(pageNumber) {
  state.site_page_index = pageNumber - 1;
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const renderCanvas = document.createElement("canvas");
  const renderContext = renderCanvas.getContext("2d");
  renderCanvas.width = Math.floor(viewport.width);
  renderCanvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: renderContext, viewport }).promise;

  state.render = {
    width: renderCanvas.width,
    height: renderCanvas.height,
    image: renderCanvas.toDataURL("image/png"),
  };

  pageImage.src = state.render.image;
  pagePanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  resetDrawing();
  requestAnimationFrame(fitCanvas);
}

function fitCanvas() {
  const rect = canvasShell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function getImagePlacement() {
  const shell = canvasShell.getBoundingClientRect();
  if (!state.render) return { x: 0, y: 0, width: shell.width, height: shell.height, scale: 1 };

  const imageRatio = state.render.width / state.render.height;
  const shellRatio = shell.width / shell.height;
  let width = shell.width;
  let height = shell.height;

  if (shellRatio > imageRatio) {
    height = shell.height;
    width = height * imageRatio;
  } else {
    width = shell.width;
    height = width / imageRatio;
  }

  return {
    x: (shell.width - width) / 2,
    y: (shell.height - height) / 2,
    width,
    height,
    scale: state.render.width / width,
  };
}

function getCanvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  const placement = getImagePlacement();
  const viewX = event.clientX - bounds.left;
  const viewY = event.clientY - bounds.top;
  const x = (viewX - placement.x) * placement.scale;
  const y = (viewY - placement.y) * placement.scale;
  return {
    x: clamp(x, 0, state.render.width),
    y: clamp(y, 0, state.render.height),
  };
}

function toViewPoint(point) {
  const placement = getImagePlacement();
  return {
    x: placement.x + point[0] / placement.scale,
    y: placement.y + point[1] / placement.scale,
  };
}

function draw() {
  const bounds = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, bounds.width, bounds.height);

  if (state.rectangle) drawRectangle();
  if (state.polygon.length > 0) drawPolygon();
}

function drawRectangle() {
  const a = toViewPoint([state.rectangle.x1, state.rectangle.y1]);
  const b = toViewPoint([state.rectangle.x2, state.rectangle.y2]);
  ctx.fillStyle = "rgba(15, 118, 110, 0.18)";
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
}

function drawPolygon() {
  const points = state.polygon.map(toViewPoint);
  ctx.strokeStyle = "#0f766e";
  ctx.fillStyle = "rgba(15, 118, 110, 0.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });

  if (state.draftPoint) {
    const draft = toViewPoint(state.draftPoint);
    ctx.lineTo(draft.x, draft.y);
  }

  if (state.polygon.length > 2 && !state.draftPoint) {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#0b4f4a";
    ctx.fill();
  });
}

function normalizeRectangle() {
  const rect = state.rectangle;
  state.rectangle = {
    x1: round(Math.min(rect.x1, rect.x2)),
    y1: round(Math.min(rect.y1, rect.y2)),
    x2: round(Math.max(rect.x1, rect.x2)),
    y2: round(Math.max(rect.y1, rect.y2)),
  };
}

function askRectangleDimensions() {
  workflowTitle.textContent = "Enter actual site dimensions.";
  primaryDimensionLabel.textContent = "Enter actual site length (meters)";
  secondaryDimensionLabel.classList.remove("hidden");
  secondaryDimension.required = true;
  primaryDimension.value = "";
  secondaryDimension.value = "";
  dimensionForm.classList.remove("hidden");
  primaryDimension.focus();
}

function finishPolygon() {
  if (state.polygon.length < 3) return;
  state.draftPoint = null;
  workflowTitle.textContent = "Enter the actual length of the first polygon edge.";
  primaryDimensionLabel.textContent = "First edge length (meters)";
  secondaryDimensionLabel.classList.add("hidden");
  secondaryDimension.required = false;
  primaryDimension.value = "";
  secondaryDimension.value = "";
  dimensionForm.classList.remove("hidden");
  finishPolygonButton.classList.add("hidden");
  draw();
}

function calculateRectangleScale() {
  const lengthM = Number(primaryDimension.value);
  const widthM = Number(secondaryDimension.value);
  const pixelLength = Math.abs(state.rectangle.x2 - state.rectangle.x1);
  const pixelWidth = Math.abs(state.rectangle.y2 - state.rectangle.y1);
  const xPixelsPerMeter = pixelLength / lengthM;
  const yPixelsPerMeter = pixelWidth / widthM;
  state.scale = {
    pixels_per_meter: round((xPixelsPerMeter + yPixelsPerMeter) / 2),
    x_pixels_per_meter: round(xPixelsPerMeter),
    y_pixels_per_meter: round(yPixelsPerMeter),
    length_m: lengthM,
    width_m: widthM,
  };
}

function calculatePolygonScale() {
  const firstEdgeM = Number(primaryDimension.value);
  const [a, b] = state.polygon;
  const pixelDistance = distance(a, b);
  state.scale = {
    pixels_per_meter: round(pixelDistance / firstEdgeM),
    reference_edge: {
      point_indexes: [0, 1],
      length_m: firstEdgeM,
      pixel_length: round(pixelDistance),
    },
  };
}

function updateOutput() {
  const output = {
    site_page_index: state.site_page_index,
    site_shape: state.mode,
    geometry: state.mode === "rectangle" ? state.rectangle : state.polygon,
    scale: state.scale,
  };
  outputJson.textContent = JSON.stringify(output, null, 2);
}

function resetDrawing() {
  state.mode = null;
  state.rectangle = null;
  state.polygon = [];
  state.draftPoint = null;
  state.dragging = false;
  state.dragStart = null;
  state.scale = null;
  workflowTitle.textContent = "Is the site a rectangle?";
  shapePrompt.classList.remove("hidden");
  finishPolygonButton.classList.add("hidden");
  dimensionForm.classList.add("hidden");
  outputJson.textContent = "{}";
  draw();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
