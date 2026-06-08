import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { defaultSiteData } from "../models/Site";
import type {
  ContextPoint,
  ContextZone,
  ContextZoneType,
  PdfBackgroundMeta,
  SiteData,
  SiteShape,
} from "../types/layout";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SelectionMode = "crop" | "boundaryRectangle" | "boundaryPolygon" | ContextZoneType;

export function PdfSiteSetup() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument>();
  const [pdfName, setPdfName] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("crop");
  const [cropSelection, setCropSelection] = useState<SelectionRect>();
  const [boundarySelection, setBoundarySelection] = useState<SelectionRect>();
  const [polygonBoundary, setPolygonBoundary] = useState<ContextPoint[]>([]);
  const [draftBoundaryPolygon, setDraftBoundaryPolygon] = useState<ContextPoint[]>([]);
  const [edgeLengthDrafts, setEdgeLengthDrafts] = useState<string[]>([]);
  const [siteShape, setSiteShape] = useState<SiteShape>("rectangle");
  const [showShapeDialog, setShowShapeDialog] = useState(false);
  const [shapeDraft, setShapeDraft] = useState<SiteShape>("rectangle");
  const [polygonError, setPolygonError] = useState("");
  const [draftSelection, setDraftSelection] = useState<SelectionRect>();
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>();
  const [contextZones, setContextZones] = useState<ContextZone[]>([]);
  const [draftPolygon, setDraftPolygon] = useState<ContextPoint[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [draggedVertex, setDraggedVertex] = useState<{ zoneId: string; pointIndex: number }>();
  const [siteLength, setSiteLength] = useState(defaultSiteData.scale.length_m);
  const [siteWidth, setSiteWidth] = useState(defaultSiteData.scale.width_m);
  const [showDimensionsDialog, setShowDimensionsDialog] = useState(false);
  const [siteLengthDraft, setSiteLengthDraft] = useState(String(defaultSiteData.scale.length_m));
  const [siteWidthDraft, setSiteWidthDraft] = useState(String(defaultSiteData.scale.width_m));
  const [dimensionsError, setDimensionsError] = useState("");
  const [error, setError] = useState("");
  const [camera, setCamera] = useState({ scale: 1, x: 18, y: 18 });

  const canContinue = Boolean(
    pdfDocument &&
      renderSize.width &&
      renderSize.height &&
      cropSelection &&
      (siteShape === "rectangle"
        ? Boolean(boundarySelection && siteLength > 0 && siteWidth > 0)
        : polygonBoundary.length >= 3 && areValidEdgeLengths(edgeLengthDrafts, polygonBoundary.length)),
  );
  const pageOptions = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  const fitBounds = useCallback((bounds: SelectionRect) => {
    const workspace = workspaceRef.current;
    if (!workspace || bounds.width <= 0 || bounds.height <= 0) return;
    const paddingRatio = 0.075;
    const availableWidth = workspace.clientWidth * (1 - paddingRatio * 2);
    const availableHeight = workspace.clientHeight * (1 - paddingRatio * 2);
    const scale = Math.max(0.05, Math.min(availableWidth / bounds.width, availableHeight / bounds.height));

    setCamera({
      scale,
      x: (workspace.clientWidth - bounds.width * scale) / 2 - bounds.x * scale,
      y: (workspace.clientHeight - bounds.height * scale) / 2 - bounds.y * scale,
    });
  }, []);

  const fitSite = useCallback(() => {
    const polygonBounds = polygonBoundary.length >= 3 ? getPointsBounds(polygonBoundary) : undefined;
    const target = siteShape === "polygon" && polygonBounds ? polygonBounds : cropSelection;
    if (target) fitBounds(target);
  }, [cropSelection, fitBounds, polygonBoundary, siteShape]);

  const handlePdfUpload = async (file?: File) => {
    if (!file) return;

    setError("");
    setPdfName(file.name);
    setCropSelection(undefined);
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setDraftBoundaryPolygon([]);
    setEdgeLengthDrafts([]);
    setDraftSelection(undefined);
    setSelectionMode("crop");
    setSiteShape("rectangle");
    setContextZones([]);
    setDraftPolygon([]);
    setSelectedZoneId(undefined);

    try {
      const buffer = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buffer }).promise;
      setPdfDocument(doc);
      setPageCount(doc.numPages);
      setPageNumber(1);
      setRotation(0);
    } catch {
      setPdfDocument(undefined);
      setPageCount(0);
      setError("The selected PDF could not be opened.");
    }
  };

  useEffect(() => {
    if (!pdfDocument) return;

    let cancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas || !pdfDocument) return;

      const page = await pdfDocument.getPage(pageNumber);
      const pageRotation = normalizeRotation(page.rotate + rotation);
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
      const maxWidth = 2000;
      const scale = Math.min(1.6, maxWidth / baseViewport.width);
      const viewport = page.getViewport({ scale, rotation: pageRotation });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      if (!cancelled) {
        setRenderSize({ width: canvas.width, height: canvas.height });
        setCropSelection({
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        });
        setBoundarySelection(undefined);
        setPolygonBoundary([]);
        setDraftBoundaryPolygon([]);
        setEdgeLengthDrafts([]);
        setSelectionMode("crop");
        setSiteShape("rectangle");
        setContextZones([]);
        setDraftPolygon([]);
        setSelectedZoneId(undefined);
        requestAnimationFrame(() =>
          fitBounds({ x: 0, y: 0, width: canvas.width, height: canvas.height }),
        );
      }
    }

    renderPage().catch(() => setError("The selected page could not be rendered."));
    return () => {
      cancelled = true;
    };
  }, [fitBounds, pdfDocument, pageNumber, rotation]);

  useEffect(() => {
    const handleFitShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitSite();
      }
    };

    window.addEventListener("keydown", handleFitShortcut);
    return () => window.removeEventListener("keydown", handleFitShortcut);
  }, [fitSite]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(() => fitSite());
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [fitSite]);

  const rotatePage = (degrees: number) => {
    setCropSelection(undefined);
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setDraftBoundaryPolygon([]);
    setEdgeLengthDrafts([]);
    setDraftSelection(undefined);
    setSelectionMode("crop");
    setSiteShape("rectangle");
    setContextZones([]);
    setDraftPolygon([]);
    setSelectedZoneId(undefined);
    setRotation((current) => normalizeRotation(current + degrees));
  };

  const getPointer = (event: React.PointerEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const limits =
      selectionMode !== "crop" && cropSelection
        ? {
            minX: cropSelection.x,
            maxX: cropSelection.x + cropSelection.width,
            minY: cropSelection.y,
            maxY: cropSelection.y + cropSelection.height,
          }
        : {
            minX: 0,
            maxX: renderSize.width,
            minY: 0,
            maxY: renderSize.height,
          };

    return {
      x: clamp((event.clientX - rect.left) / camera.scale, limits.minX, limits.maxX),
      y: clamp((event.clientY - rect.top) / camera.scale, limits.minY, limits.maxY),
    };
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!renderSize.width || !renderSize.height) return;
    const point = getPointer(event);
    if (selectionMode === "boundaryPolygon") {
      if (event.detail >= 2 || polygonBoundary.length) return;
      setDraftBoundaryPolygon((current) => [...current, point]);
      setPolygonError("");
      return;
    }
    if (selectionMode === "greenPark" || selectionMode === "residence") {
      setSelectedZoneId(undefined);
      setDraftPolygon((current) => [...current, point]);
      return;
    }
    setDragStart(point);
    setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (draggedVertex) {
      const point = getPointer(event);
      setContextZones((current) =>
        current.map((zone) =>
          zone.id === draggedVertex.zoneId
            ? {
                ...zone,
                points: zone.points.map((item, index) => (index === draggedVertex.pointIndex ? point : item)),
              }
            : zone,
        ),
      );
      return;
    }
    if (!dragStart) return;
    const point = getPointer(event);
    setDraftSelection(normalizeSelection(dragStart, point));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (draggedVertex) {
      setDraggedVertex(undefined);
      return;
    }
    if (!dragStart) return;
    const point = getPointer(event);
    const next = normalizeSelection(dragStart, point);
    setDragStart(undefined);
    setDraftSelection(undefined);

    if (next.width >= 8 && next.height >= 8) {
      if (selectionMode === "crop") {
        setCropSelection(next);
        setBoundarySelection(undefined);
        setPolygonBoundary([]);
        setDraftBoundaryPolygon([]);
        setEdgeLengthDrafts([]);
        setContextZones([]);
        setSelectedZoneId(undefined);
        requestAnimationFrame(() => fitBounds(next));
      } else if (selectionMode === "boundaryRectangle") {
        setBoundarySelection(next);
      }
    }
  };

  const finishPolygon = () => {
    if ((selectionMode !== "greenPark" && selectionMode !== "residence") || draftPolygon.length < 3) return;
    const zone: ContextZone = {
      id: crypto.randomUUID(),
      type: selectionMode,
      points: draftPolygon,
    };
    setContextZones((current) => [...current, zone]);
    setDraftPolygon([]);
    setDraftBoundaryPolygon([]);
    setSelectedZoneId(zone.id);
  };

  const finishBoundaryPolygon = () => {
    if (selectionMode !== "boundaryPolygon" || draftBoundaryPolygon.length < 3) {
      setPolygonError("Polygon requires at least 3 points.");
      return;
    }
    setPolygonBoundary(draftBoundaryPolygon);
    setEdgeLengthDrafts(draftBoundaryPolygon.map(() => ""));
    setDraftBoundaryPolygon([]);
    setPolygonError("");
    const bounds = getPointsBounds(draftBoundaryPolygon);
    if (bounds) requestAnimationFrame(() => fitBounds(bounds));
  };

  const deleteSelectedZone = () => {
    if (!selectedZoneId) return;
    setContextZones((current) => current.filter((zone) => zone.id !== selectedZoneId));
    setSelectedZoneId(undefined);
  };

  const changeSelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    setDraftPolygon([]);
    setSelectedZoneId(undefined);
    setDragStart(undefined);
    setDraftSelection(undefined);
  };

  const openDimensionsDialog = () => {
    if (selectionMode === "boundaryRectangle" || selectionMode === "boundaryPolygon") {
      changeSelectionMode("crop");
    }
    setSiteLengthDraft(String(siteLength));
    setSiteWidthDraft(String(siteWidth));
    setDimensionsError("");
    setShowDimensionsDialog(true);
  };

  const confirmSiteDimensions = () => {
    const length = Number(siteLengthDraft);
    const width = Number(siteWidthDraft);

    if (
      !siteLengthDraft.trim() ||
      !siteWidthDraft.trim() ||
      !Number.isFinite(length) ||
      !Number.isFinite(width) ||
      length <= 0 ||
      width <= 0
    ) {
      setDimensionsError("Please enter valid site dimensions.");
      return;
    }

    setSiteLength(length);
    setSiteWidth(width);
    setShowDimensionsDialog(false);
    setDimensionsError("");
    setSiteShape("rectangle");
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setEdgeLengthDrafts([]);
    changeSelectionMode("boundaryRectangle");
  };

  const continueFromShapeDialog = () => {
    setShowShapeDialog(false);
    if (shapeDraft === "rectangle") {
      openDimensionsDialog();
      return;
    }

    setSiteShape("polygon");
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setDraftBoundaryPolygon([]);
    setEdgeLengthDrafts([]);
    setPolygonError("");
    changeSelectionMode("boundaryPolygon");
  };

  const continueToEditor = () => {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas || !canContinue) return;

    if (!cropSelection) return;
    const polygonBounds = siteShape === "polygon" ? getPointsBounds(polygonBoundary) : undefined;
    if (siteShape === "rectangle" && !boundarySelection) return;
    if (siteShape === "polygon" && !polygonBounds) return;

    const selectedBounds = siteShape === "rectangle" ? boundarySelection! : polygonBounds!;
    const relativeBoundary = {
      x: selectedBounds.x - cropSelection.x,
      y: selectedBounds.y - cropSelection.y,
      width: selectedBounds.width,
      height: selectedBounds.height,
    };
    const edgeLengths = edgeLengthDrafts.map(Number);
    const polygonPixelsPerMeter =
      siteShape === "polygon" ? getPolygonPixelsPerMeter(polygonBoundary, edgeLengths) : undefined;
    const orientedSite =
      siteShape === "rectangle"
        ? orientSiteDimensionsToCrop(selectedBounds, siteLength, siteWidth)
        : {
            length: selectedBounds.height / polygonPixelsPerMeter!,
            width: selectedBounds.width / polygonPixelsPerMeter!,
          };
    const pageImage = sourceCanvas.toDataURL("image/jpeg", 0.82);
    const croppedImage = cropCanvas(sourceCanvas, cropSelection);
    const pixelsPerMeter = Math.max(
      4,
      Math.min(
        14,
        siteShape === "polygon"
          ? polygonPixelsPerMeter!
          : Math.min(selectedBounds.height / orientedSite.length, selectedBounds.width / orientedSite.width),
      ),
    );

    const siteData: SiteData = {
      ...defaultSiteData,
      site_page_index: pageNumber,
      site_shape: siteShape,
      geometry: {
        x1: round(relativeBoundary.x),
        y1: round(relativeBoundary.y),
        x2: round(relativeBoundary.x + relativeBoundary.width),
        y2: round(relativeBoundary.y + relativeBoundary.height),
      },
      ...(siteShape === "polygon"
        ? {
            polygon: {
              vertices: polygonBoundary.map((point) => ({
                x: round(point.x - cropSelection.x),
                y: round(point.y - cropSelection.y),
              })),
              edgeLengths: edgeLengths.map(round),
            },
          }
        : {}),
      scale: {
        pixels_per_meter: round(pixelsPerMeter),
        length_m: orientedSite.length,
        width_m: orientedSite.width,
      },
    };
    const backgroundMeta: PdfBackgroundMeta = {
      page: {
        width: sourceCanvas.width,
        height: sourceCanvas.height,
      },
      crop: {
        x: round(cropSelection.x),
        y: round(cropSelection.y),
        width: round(cropSelection.width),
        height: round(cropSelection.height),
      },
      siteBoundary: {
        x: round(relativeBoundary.x),
        y: round(relativeBoundary.y),
        width: round(relativeBoundary.width),
        height: round(relativeBoundary.height),
        ...(siteShape === "polygon"
          ? {
              polygon: polygonBoundary.map((point) => ({
                x: round(point.x - cropSelection.x),
                y: round(point.y - cropSelection.y),
              })),
              edgeLengths: edgeLengths.map(round),
            }
          : {}),
      },
      siteShape,
      contextZones: contextZones.map((zone) => ({
        ...zone,
        points: zone.points.map((point) => ({
          x: round(point.x - cropSelection.x),
          y: round(point.y - cropSelection.y),
        })),
      })),
    };

    try {
      sessionStorage.setItem("siteData", JSON.stringify(siteData));
      sessionStorage.setItem("siteBackgroundImage", croppedImage);
      sessionStorage.setItem("siteFullPageImage", pageImage);
      sessionStorage.setItem("siteBackgroundMeta", JSON.stringify(backgroundMeta));
      window.location.assign("/site-editor");
    } catch {
      setError("The PDF page is too large to save. Try a smaller PDF page or lower-resolution source file.");
    }
  };

  return (
    <main className="setupPage">
      <header className="setupHeader">
        <div>
          <p className="eyebrow">Site plan setup</p>
          <h1>Choose PDF Site Area</h1>
        </div>
        <button type="button" disabled={!canContinue} onClick={continueToEditor}>
          Continue to Layout Builder
        </button>
      </header>

      <section className="setupGrid">
        <aside className="setupPanel">
          <section>
            <p className="eyebrow">PDF</p>
            <label>
              <span>Upload Site Plan PDF</span>
              <input type="file" accept="application/pdf" onChange={(event) => handlePdfUpload(event.target.files?.[0])} />
            </label>
            {pdfName ? <p className="muted">{pdfName}</p> : null}
            {error ? <p className="errorText">{error}</p> : null}
          </section>

          <section>
            <p className="eyebrow">Page</p>
            <label>
              <span>Site Plan Page</span>
              <select
                disabled={!pageCount}
                value={pageNumber}
                onChange={(event) => setPageNumber(Number(event.target.value))}
              >
                {pageOptions.map((page) => (
                  <option key={page} value={page}>
                    Page {page}
                  </option>
                ))}
              </select>
            </label>
            <div className="rotationControls" aria-label="PDF page rotation">
              <button
                className="secondaryButton"
                type="button"
                disabled={!pdfDocument}
                onClick={() => rotatePage(-90)}
              >
                Rotate Left
              </button>
              <button
                className="secondaryButton"
                type="button"
                disabled={!pdfDocument}
                onClick={() => rotatePage(90)}
              >
                Rotate Right
              </button>
            </div>
            <p className="rotationStatus">Rotation: {rotation} deg</p>
            <div className="pageThumbs">
              {pdfDocument
                ? pageOptions.map((page) => (
                    <PageThumbnail
                      key={page}
                      pdfDocument={pdfDocument}
                      pageNumber={page}
                      isActive={page === pageNumber}
                      onSelect={() => setPageNumber(page)}
                    />
                  ))
                : null}
            </div>
          </section>

          <section>
            <p className="eyebrow">Site Size</p>
            <label>
              <span>Site Length (m)</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={siteLength.toFixed(1)}
                onChange={(event) => setSiteLength(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              <span>Site Width (m)</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={siteWidth.toFixed(1)}
                onChange={(event) => setSiteWidth(Number(event.target.value) || 1)}
              />
            </label>
          </section>

          <section>
            <p className="eyebrow">Selection Mode</p>
            <div className="selectionModeControls">
              <button
                className={selectionMode === "crop" ? "" : "secondaryButton"}
                type="button"
                disabled={!pdfDocument}
                onClick={() => changeSelectionMode("crop")}
              >
                Crop Site Image
              </button>
              <button
                className={
                  selectionMode === "boundaryRectangle" || selectionMode === "boundaryPolygon"
                    ? ""
                    : "secondaryButton"
                }
                type="button"
                disabled={!cropSelection}
                onClick={() => {
                  setShapeDraft(siteShape);
                  setShowShapeDialog(true);
                }}
              >
                Select Site Boundary
              </button>
              <button
                className={selectionMode === "greenPark" ? "" : "secondaryButton"}
                type="button"
                disabled={!cropSelection}
                onClick={() => changeSelectionMode("greenPark")}
              >
                Select Green Park Area
              </button>
              <button
                className={selectionMode === "residence" ? "" : "secondaryButton"}
                type="button"
                disabled={!cropSelection}
                onClick={() => changeSelectionMode("residence")}
              >
                Select Residence Area
              </button>
            </div>
            {selectionMode === "boundaryPolygon" ? (
              <div className="polygonActions">
                <button
                  type="button"
                  disabled={draftBoundaryPolygon.length < 3}
                  onClick={finishBoundaryPolygon}
                >
                  Finish Polygon
                </button>
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={!draftBoundaryPolygon.length}
                  onClick={() => {
                    setDraftBoundaryPolygon([]);
                    setPolygonError("");
                  }}
                >
                  Cancel Drawing
                </button>
              </div>
            ) : null}
            {polygonBoundary.length ? (
              <div className="edgeLengthPanel">
                <p className="eyebrow">Polygon Edge Lengths</p>
                {polygonBoundary.map((_, index) => (
                  <label key={index}>
                    <span>{getEdgeLabel(index, polygonBoundary.length)}</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={edgeLengthDrafts[index] ?? ""}
                      onChange={(event) => {
                        setEdgeLengthDrafts((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? event.target.value : value,
                          ),
                        );
                        setPolygonError("");
                      }}
                    />
                  </label>
                ))}
                {!areValidEdgeLengths(edgeLengthDrafts, polygonBoundary.length) ? (
                  <p className="errorText">Enter a valid length for every polygon edge.</p>
                ) : null}
              </div>
            ) : null}
            {polygonError ? <p className="errorText">{polygonError}</p> : null}
            {selectionMode === "greenPark" || selectionMode === "residence" ? (
              <div className="polygonActions">
                <button type="button" disabled={draftPolygon.length < 3} onClick={finishPolygon}>
                  Finish Polygon
                </button>
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={!draftPolygon.length}
                  onClick={() => setDraftPolygon([])}
                >
                  Cancel Drawing
                </button>
                <button
                  className="dangerButton"
                  type="button"
                  disabled={!selectedZoneId}
                  onClick={deleteSelectedZone}
                >
                  Delete Selected Area
                </button>
              </div>
            ) : null}
            <p className="muted">
              {selectionMode === "crop"
                ? "Draw around the site diagram and useful surrounding context."
                : selectionMode === "boundaryRectangle"
                  ? "Draw the buildable site boundary inside the cropped area."
                  : selectionMode === "boundaryPolygon"
                    ? "Click each site corner. Double click the final corner to finish."
                  : "Click around the area to add polygon points, then finish the polygon. Drag its points to edit."}
            </p>
          </section>
        </aside>

        <section ref={workspaceRef} className="pdfWorkspace">
          <button
            className="fitSiteButton secondaryButton"
            type="button"
            disabled={!cropSelection}
            onClick={fitSite}
            title="Fit cropped site (F)"
          >
            Fit Site
          </button>
          <div
            ref={viewportRef}
            className="pdfViewport"
            style={{
              width: renderSize.width || undefined,
              height: renderSize.height || undefined,
              left: camera.x,
              top: camera.y,
              transform: `scale(${camera.scale})`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={(event) => {
              if (selectionMode !== "boundaryPolygon" || polygonBoundary.length) return;
              event.preventDefault();
              finishBoundaryPolygon();
            }}
            onPointerCancel={() => {
              setDragStart(undefined);
              setDraftSelection(undefined);
              setDraggedVertex(undefined);
            }}
          >
            <canvas ref={canvasRef} />
            {cropSelection ? <SelectionOverlay selection={cropSelection} variant="crop" /> : null}
            {selectionMode === "boundaryRectangle" && boundarySelection ? (
              <SelectionOverlay selection={boundarySelection} variant="boundaryRectangle" />
            ) : null}
            {polygonBoundary.length ? (
              <BoundaryPolygonOverlay points={polygonBoundary} complete />
            ) : draftBoundaryPolygon.length ? (
              <BoundaryPolygonOverlay points={draftBoundaryPolygon} complete={false} />
            ) : null}
            {contextZones.map((zone) => (
              <ContextZoneOverlay
                key={zone.id}
                zone={zone}
                isSelected={zone.id === selectedZoneId}
                onSelect={() => setSelectedZoneId(zone.id)}
                onVertexPointerDown={(pointIndex, event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelectedZoneId(zone.id);
                  setDraggedVertex({ zoneId: zone.id, pointIndex });
                }}
              />
            ))}
            {draftPolygon.length ? (
              <ContextZoneOverlay
                zone={{ id: "draft", type: selectionMode as ContextZoneType, points: draftPolygon }}
                isSelected
                isDraft
                onSelect={() => undefined}
                onVertexPointerDown={() => undefined}
              />
            ) : null}
            {draftSelection && (selectionMode === "crop" || selectionMode === "boundaryRectangle") ? (
              <SelectionOverlay selection={draftSelection} variant={selectionMode} />
            ) : null}
            {!pdfDocument ? <div className="emptyPdfState">Upload a PDF to choose the site plan page.</div> : null}
          </div>
        </section>
      </section>
      {showDimensionsDialog ? (
        <div className="modalBackdrop" role="presentation">
          <form
            className="saveLayoutDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-dimensions-title"
            onSubmit={(event) => {
              event.preventDefault();
              confirmSiteDimensions();
            }}
          >
            <h2 id="site-dimensions-title">Site Dimensions Required</h2>
            <label>
              <span>Site Length (m)</span>
              <input
                autoFocus
                type="number"
                min="0.1"
                step="0.1"
                value={siteLengthDraft}
                onChange={(event) => {
                  setSiteLengthDraft(event.target.value);
                  setDimensionsError("");
                }}
              />
            </label>
            <label>
              <span>Site Width (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={siteWidthDraft}
                onChange={(event) => {
                  setSiteWidthDraft(event.target.value);
                  setDimensionsError("");
                }}
              />
            </label>
            {dimensionsError ? <p className="errorText">{dimensionsError}</p> : null}
            <div className="dialogActions">
              <button type="submit">Confirm</button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => {
                  setShowDimensionsDialog(false);
                  setDimensionsError("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {showShapeDialog ? (
        <div className="modalBackdrop" role="presentation">
          <form
            className="saveLayoutDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-shape-title"
            onSubmit={(event) => {
              event.preventDefault();
              continueFromShapeDialog();
            }}
          >
            <h2 id="site-shape-title">Select Site Shape</h2>
            <label className="inlineToggle">
              <input
                type="radio"
                name="siteShape"
                value="rectangle"
                checked={shapeDraft === "rectangle"}
                onChange={() => setShapeDraft("rectangle")}
              />
              <span>Rectangle</span>
            </label>
            <label className="inlineToggle">
              <input
                type="radio"
                name="siteShape"
                value="polygon"
                checked={shapeDraft === "polygon"}
                onChange={() => setShapeDraft("polygon")}
              />
              <span>Polygon</span>
            </label>
            <div className="dialogActions">
              <button type="submit">Continue</button>
              <button className="secondaryButton" type="button" onClick={() => setShowShapeDialog(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function PageThumbnail({
  pdfDocument,
  pageNumber,
  isActive,
  onSelect,
}: {
  pdfDocument: PdfDocument;
  pageNumber: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderThumbnail() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 126 / baseViewport.width });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      if (!cancelled) {
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      }
    }

    renderThumbnail();
    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pageNumber]);

  return (
    <button className={`pageThumb ${isActive ? "active" : ""}`} type="button" onClick={onSelect}>
      <canvas ref={canvasRef} />
      <span>Page {pageNumber}</span>
    </button>
  );
}

function SelectionOverlay({
  selection,
  variant,
}: {
  selection: SelectionRect;
  variant: SelectionMode;
}) {
  return (
    <div
      className={`selectionOverlay ${variant === "boundaryRectangle" ? "boundary" : variant}`}
      style={{
        left: selection.x,
        top: selection.y,
        width: selection.width,
        height: selection.height,
      }}
    />
  );
}

function BoundaryPolygonOverlay({
  points,
  complete,
}: {
  points: ContextPoint[];
  complete: boolean;
}) {
  return (
    <svg className="contextZoneOverlay" width="100%" height="100%">
      {complete ? (
        <polygon
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="rgba(15, 118, 110, 0.18)"
          stroke="#0f766e"
          strokeWidth={3}
          pointerEvents="none"
        />
      ) : (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="#0f766e"
          strokeWidth={3}
          strokeDasharray="8 6"
          pointerEvents="none"
        />
      )}
      {points.map((point, index) => (
        <g key={`${point.x}-${point.y}-${index}`} pointerEvents="none">
          <circle cx={point.x} cy={point.y} r={6} fill="#ffffff" stroke="#0f766e" strokeWidth={3} />
          <text x={point.x + 9} y={point.y - 9} fill="#0f4f4a" fontSize={14} fontWeight={700}>
            {getVertexLabel(index)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ContextZoneOverlay({
  zone,
  isSelected,
  isDraft = false,
  onSelect,
  onVertexPointerDown,
}: {
  zone: ContextZone;
  isSelected: boolean;
  isDraft?: boolean;
  onSelect: () => void;
  onVertexPointerDown: (pointIndex: number, event: React.PointerEvent<SVGCircleElement>) => void;
}) {
  const points = zone.points.map((point) => `${point.x},${point.y}`).join(" ");
  const isPark = zone.type === "greenPark";

  return (
    <svg className="contextZoneOverlay" width="100%" height="100%">
      {zone.points.length >= 3 ? (
        <polygon
          points={points}
          fill={isPark ? "rgba(134, 239, 172, 0.36)" : "rgba(209, 213, 219, 0.42)"}
          stroke={isSelected ? "#f97316" : isPark ? "#16a34a" : "#6b7280"}
          strokeWidth={isSelected ? 3 : 2}
          strokeDasharray={isDraft ? "8 6" : undefined}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        />
      ) : zone.points.length >= 2 ? (
        <polyline
          points={points}
          fill="none"
          stroke={isPark ? "#16a34a" : "#6b7280"}
          strokeWidth={3}
          strokeDasharray="8 6"
          pointerEvents="none"
        />
      ) : null}
      {isSelected || isDraft ? zone.points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r={isSelected ? 7 : 5}
          fill="#ffffff"
          stroke={isPark ? "#16a34a" : "#6b7280"}
          strokeWidth={3}
          onPointerDown={(event) => onVertexPointerDown(index, event)}
        />
      )) : null}
    </svg>
  );
}

function cropCanvas(canvas: HTMLCanvasElement, selection: SelectionRect) {
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(selection.width, selection.height));
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(selection.width * scale));
  target.height = Math.max(1, Math.round(selection.height * scale));
  const context = target.getContext("2d");
  if (!context) return "";

  context.drawImage(
    canvas,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    target.width,
    target.height,
  );

  return target.toDataURL("image/jpeg", 0.88);
}

function normalizeSelection(start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeRotation(value: number) {
  return ((value % 360) + 360) % 360;
}

function orientSiteDimensionsToCrop(selection: SelectionRect, length: number, width: number) {
  const cropIsLandscape = selection.width > selection.height;
  const dimensionsAreLandscape = width > length;

  if (cropIsLandscape === dimensionsAreLandscape) {
    return { length, width };
  }

  return {
    length: width,
    width: length,
  };
}

function getPointsBounds(points: ContextPoint[]): SelectionRect | undefined {
  if (points.length < 3) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function getPolygonPixelsPerMeter(points: ContextPoint[], edgeLengths: number[]) {
  const pixelPerimeter = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
  const realPerimeter = edgeLengths.reduce((total, length) => total + length, 0);
  return pixelPerimeter / realPerimeter;
}

function areValidEdgeLengths(values: string[], edgeCount: number) {
  return (
    values.length === edgeCount &&
    values.every((value) => value.trim() && Number.isFinite(Number(value)) && Number(value) > 0)
  );
}

function getVertexLabel(index: number) {
  let value = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function getEdgeLabel(index: number, pointCount: number) {
  return `Edge ${getVertexLabel(index)}-${getVertexLabel((index + 1) % pointCount)} (m)`;
}
