import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { defaultSiteData } from "../models/Site";
import type {
  AncillaryBuilding,
  AncillaryBuildingShape,
  ContextPoint,
  ContextZone,
  ContextZoneType,
  PdfBackgroundMeta,
  RoadType,
  SiteData,
  SiteShape,
  SetupRoad,
} from "../types/layout";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PanelPosition {
  x: number;
  y: number;
}

type SelectionMode =
  | "crop"
  | "boundaryRectangle"
  | "boundaryPolygon"
  | "road"
  | "ancillaryRectangle"
  | "ancillaryPolygon"
  | ContextZoneType;

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
  const [boundaryPreviewPoint, setBoundaryPreviewPoint] = useState<ContextPoint>();
  const [edgeLengthDrafts, setEdgeLengthDrafts] = useState<string[]>([]);
  const [siteShape, setSiteShape] = useState<SiteShape>("rectangle");
  const [showShapeDialog, setShowShapeDialog] = useState(false);
  const [shapeDraft, setShapeDraft] = useState<SiteShape>("rectangle");
  const [polygonError, setPolygonError] = useState("");
  const [draftSelection, setDraftSelection] = useState<SelectionRect>();
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>();
  const [contextZones, setContextZones] = useState<ContextZone[]>([]);
  const [roads, setRoads] = useState<SetupRoad[]>([]);
  const [selectedRoadId, setSelectedRoadId] = useState<string>();
  const [showRoadTypeDialog, setShowRoadTypeDialog] = useState(false);
  const [showRoadWidthDialog, setShowRoadWidthDialog] = useState(false);
  const [roadTypeDraft, setRoadTypeDraft] = useState<RoadType>("primary");
  const [roadWidthDraft, setRoadWidthDraft] = useState("12");
  const [activeRoadType, setActiveRoadType] = useState<RoadType>();
  const [activeRoadWidth, setActiveRoadWidth] = useState<number>();
  const [pendingRoad, setPendingRoad] = useState<SetupRoad>();
  const [roadError, setRoadError] = useState("");
  const [ancillaryBuildings, setAncillaryBuildings] = useState<AncillaryBuilding[]>([]);
  const [showAncillaryShapeDialog, setShowAncillaryShapeDialog] = useState(false);
  const [ancillaryShapeDraft, setAncillaryShapeDraft] = useState<AncillaryBuildingShape>("rectangle");
  const [draftAncillaryPolygon, setDraftAncillaryPolygon] = useState<ContextPoint[]>([]);
  const [ancillaryPreviewPoint, setAncillaryPreviewPoint] = useState<ContextPoint>();
  const [pendingAncillaryBuilding, setPendingAncillaryBuilding] = useState<AncillaryBuilding>();
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
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<
    { clientX: number; clientY: number; cameraX: number; cameraY: number } | undefined
  >(undefined);
  const spacePressedRef = useRef(false);

  const canContinue = Boolean(
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

  useEffect(() => {
    if (pdfDocument || renderSize.width) return;
    const imageSource = sessionStorage.getItem("siteFullPageImage");
    const rawMeta = sessionStorage.getItem("siteBackgroundMeta");
    const rawSiteData = sessionStorage.getItem("siteData");
    if (!imageSource || !rawMeta) return;

    try {
      const meta = JSON.parse(rawMeta) as PdfBackgroundMeta;
      const savedSite = rawSiteData ? (JSON.parse(rawSiteData) as SiteData) : undefined;
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        setRenderSize({ width: canvas.width, height: canvas.height });
        setPdfName("Saved setup image");
        setPageNumber(savedSite?.site_page_index ?? 1);
        setCropSelection(meta.crop);
        setSiteShape(meta.siteShape ?? savedSite?.site_shape ?? "rectangle");
        setSiteLength(savedSite?.scale.length_m ?? defaultSiteData.scale.length_m);
        setSiteWidth(savedSite?.scale.width_m ?? defaultSiteData.scale.width_m);

        const offset = { x: meta.crop.x, y: meta.crop.y };
        if ((meta.siteShape ?? savedSite?.site_shape) === "polygon" && meta.siteBoundary.polygon?.length) {
          setPolygonBoundary(meta.siteBoundary.polygon.map((point) => ({
            x: point.x + offset.x,
            y: point.y + offset.y,
          })));
          setEdgeLengthDrafts((meta.siteBoundary.edgeLengths ?? []).map(String));
        } else {
          setBoundarySelection({
            x: meta.siteBoundary.x + offset.x,
            y: meta.siteBoundary.y + offset.y,
            width: meta.siteBoundary.width,
            height: meta.siteBoundary.height,
          });
        }
        setContextZones(
          (meta.contextZones ?? [])
            .filter((zone) => zone.type === "greenPark")
            .map((zone) => ({
              ...zone,
              points: zone.points.map((point) => ({
                x: point.x + offset.x,
                y: point.y + offset.y,
              })),
            })),
        );
        setRoads((meta.roads ?? []).map((road) => ({
          ...road,
          x: road.x + offset.x,
          y: road.y + offset.y,
        })));
        setAncillaryBuildings((meta.ancillaryBuildings ?? []).map((building) => ({
          ...building,
          points: building.points.map((point) => ({
            x: point.x + offset.x,
            y: point.y + offset.y,
          })),
        })));
        requestAnimationFrame(() => fitBounds(meta.crop));
      };
      image.src = imageSource;
    } catch {
      setError("The saved setup data could not be restored.");
    }
  }, [fitBounds, pdfDocument, renderSize.width]);

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
    setBoundaryPreviewPoint(undefined);
    setEdgeLengthDrafts([]);
    setDraftSelection(undefined);
    setSelectionMode("crop");
    setSiteShape("rectangle");
    setContextZones([]);
    setRoads([]);
    setSelectedRoadId(undefined);
    setPendingRoad(undefined);
    setAncillaryBuildings([]);
    setDraftAncillaryPolygon([]);
    setPendingAncillaryBuilding(undefined);
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
        setBoundaryPreviewPoint(undefined);
        setEdgeLengthDrafts([]);
        setSelectionMode("crop");
        setSiteShape("rectangle");
        setContextZones([]);
        setRoads([]);
        setSelectedRoadId(undefined);
        setPendingRoad(undefined);
        setAncillaryBuildings([]);
        setDraftAncillaryPolygon([]);
        setPendingAncillaryBuilding(undefined);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        showShapeDialog ||
        showDimensionsDialog ||
        showRoadTypeDialog ||
        showRoadWidthDialog ||
        pendingRoad ||
        showAncillaryShapeDialog ||
        pendingAncillaryBuilding
      ) {
        return;
      }
      if (
        selectionMode === "ancillaryPolygon" &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        setDraftAncillaryPolygon((current) => current.slice(0, -1));
        return;
      }
      if (event.code === "Space" && !isFormControl(target)) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (
        isFormControl(target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitSite();
      } else if (
        selectionMode === "ancillaryPolygon" &&
        event.key === "Escape"
      ) {
        event.preventDefault();
        finishAncillaryPolygon();
      } else if (
        selectionMode === "boundaryPolygon" &&
        !polygonBoundary.length &&
        event.key === "Backspace"
      ) {
        event.preventDefault();
        setDraftBoundaryPolygon((current) => current.slice(0, -1));
        setPolygonError("");
      } else if (
        selectionMode === "boundaryPolygon" &&
        !polygonBoundary.length &&
        event.key === "Escape"
      ) {
        event.preventDefault();
        setDraftBoundaryPolygon([]);
        setBoundaryPreviewPoint(undefined);
        setPolygonError("");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    fitSite,
    polygonBoundary.length,
    selectionMode,
    showDimensionsDialog,
    showRoadTypeDialog,
    showRoadWidthDialog,
    showShapeDialog,
    pendingRoad,
    showAncillaryShapeDialog,
    pendingAncillaryBuilding,
    draftAncillaryPolygon,
  ]);

  const rotatePage = (degrees: number) => {
    setCropSelection(undefined);
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setDraftBoundaryPolygon([]);
    setBoundaryPreviewPoint(undefined);
    setEdgeLengthDrafts([]);
    setDraftSelection(undefined);
    setSelectionMode("crop");
    setSiteShape("rectangle");
    setContextZones([]);
    setRoads([]);
    setSelectedRoadId(undefined);
    setPendingRoad(undefined);
    setAncillaryBuildings([]);
    setDraftAncillaryPolygon([]);
    setPendingAncillaryBuilding(undefined);
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
    if (event.button === 1 || spacePressedRef.current) return;
    if (event.button !== 0) return;
    const point = getPointer(event);
    if (
      selectionMode === "ancillaryRectangle" ||
      selectionMode === "ancillaryPolygon"
    ) {
      setAncillaryPreviewPoint(point);
    }
    if (selectionMode === "boundaryPolygon") {
      if (event.detail >= 2 || polygonBoundary.length) return;
      setDraftBoundaryPolygon((current) => [...current, point]);
      setPolygonError("");
      return;
    }
    if (selectionMode === "ancillaryPolygon") {
      if (event.detail >= 2 || pendingAncillaryBuilding) return;
      setDraftAncillaryPolygon((current) => [...current, point]);
      return;
    }
    if (selectionMode === "greenPark") {
      setSelectedZoneId(undefined);
      setDraftPolygon((current) => [...current, point]);
      return;
    }
    setDragStart(point);
    setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (selectionMode === "boundaryPolygon" && !polygonBoundary.length) {
      setBoundaryPreviewPoint(getPointer(event));
    }
    if (
      selectionMode === "ancillaryRectangle" ||
      selectionMode === "ancillaryPolygon"
    ) {
      setAncillaryPreviewPoint(getPointer(event));
    }
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
    if (selectionMode === "ancillaryRectangle") {
      setAncillaryPreviewPoint(point);
    }
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
        setRoads([]);
        setSelectedRoadId(undefined);
        setPendingRoad(undefined);
        setAncillaryBuildings([]);
        setDraftAncillaryPolygon([]);
        setPendingAncillaryBuilding(undefined);
        setSelectedZoneId(undefined);
        requestAnimationFrame(() => fitBounds(next));
      } else if (selectionMode === "boundaryRectangle") {
        setBoundarySelection(next);
        setSiteLengthDraft(String(siteLength));
        setSiteWidthDraft(String(siteWidth));
        setDimensionsError("");
        setShowDimensionsDialog(true);
      } else if (selectionMode === "road" && activeRoadType && activeRoadWidth) {
        const road: SetupRoad = {
          id: crypto.randomUUID(),
          type: activeRoadType,
          width: activeRoadWidth,
          x: next.x,
          y: next.y,
          rectangleWidth: next.width,
          rectangleHeight: next.height,
        };
        setPendingRoad(road);
      } else if (selectionMode === "ancillaryRectangle") {
        setPendingAncillaryBuilding({
          id: crypto.randomUUID(),
          type: "rectangle",
          label: "Ancillary Building",
          points: rectangleToPoints(next),
        });
      }
    }
  };

  const finishPolygon = () => {
    if (selectionMode !== "greenPark" || draftPolygon.length < 3) return;
    const zone: ContextZone = {
      id: crypto.randomUUID(),
      type: "greenPark",
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
    setBoundaryPreviewPoint(undefined);
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
    setSelectedRoadId(undefined);
    setPendingRoad(undefined);
    setDragStart(undefined);
    setDraftSelection(undefined);
    setBoundaryPreviewPoint(undefined);
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
    setPendingAncillaryBuilding(undefined);
  };

  const openAncillaryShapeDialog = () => {
    setAncillaryShapeDraft("rectangle");
    setShowAncillaryShapeDialog(true);
  };

  const continueAncillaryShape = () => {
    setShowAncillaryShapeDialog(false);
    changeSelectionMode(
      ancillaryShapeDraft === "rectangle" ? "ancillaryRectangle" : "ancillaryPolygon",
    );
  };

  function finishAncillaryPolygon() {
    if (selectionMode !== "ancillaryPolygon" || draftAncillaryPolygon.length < 3) return;
    setPendingAncillaryBuilding({
      id: crypto.randomUUID(),
      type: "polygon",
      label: "Ancillary Building",
      points: draftAncillaryPolygon,
    });
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
  }

  const confirmPendingAncillaryBuilding = () => {
    if (!pendingAncillaryBuilding) return;
    setAncillaryBuildings((current) => [...current, pendingAncillaryBuilding]);
    setPendingAncillaryBuilding(undefined);
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
  };

  const redrawPendingAncillaryBuilding = () => {
    if (!pendingAncillaryBuilding) return;
    const mode = pendingAncillaryBuilding.type === "rectangle"
      ? "ancillaryRectangle"
      : "ancillaryPolygon";
    setPendingAncillaryBuilding(undefined);
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
    setSelectionMode(mode);
  };

  const cancelPendingAncillaryBuilding = () => {
    setPendingAncillaryBuilding(undefined);
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
    setSelectionMode("crop");
  };

  const finishAncillaryBuildingMode = () => {
    setPendingAncillaryBuilding(undefined);
    setDraftAncillaryPolygon([]);
    setAncillaryPreviewPoint(undefined);
    setDragStart(undefined);
    setDraftSelection(undefined);
    setSelectionMode("crop");
  };

  const openRoadTypeDialog = () => {
    setRoadTypeDraft(activeRoadType ?? "primary");
    setRoadError("");
    setShowRoadTypeDialog(true);
  };

  const continueRoadType = () => {
    setShowRoadTypeDialog(false);
    setRoadWidthDraft(String(
      activeRoadType === roadTypeDraft && activeRoadWidth
        ? activeRoadWidth
        : getDefaultRoadWidth(roadTypeDraft),
    ));
    setRoadError("");
    setShowRoadWidthDialog(true);
  };

  const applyRoadWidth = () => {
    const width = Number(roadWidthDraft);
    if (!roadWidthDraft.trim() || !Number.isFinite(width) || width <= 0) {
      setRoadError("Enter a road width greater than 0.");
      return;
    }
    setActiveRoadType(roadTypeDraft);
    setActiveRoadWidth(width);
    setShowRoadWidthDialog(false);
    setRoadError("");
    changeSelectionMode("road");
  };

  const deleteSelectedRoad = () => {
    if (!selectedRoadId) return;
    setRoads((current) => current.filter((road) => road.id !== selectedRoadId));
    setSelectedRoadId(undefined);
  };

  const confirmPendingRoad = () => {
    if (!pendingRoad) return;
    setRoads((current) => [...current, pendingRoad]);
    setSelectedRoadId(pendingRoad.id);
    setPendingRoad(undefined);
    setSelectionMode("crop");
    setActiveRoadType(undefined);
    setActiveRoadWidth(undefined);
  };

  const cancelPendingRoad = () => {
    setPendingRoad(undefined);
    setSelectedRoadId(undefined);
    setSelectionMode("crop");
    setActiveRoadType(undefined);
    setActiveRoadWidth(undefined);
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
    setPolygonBoundary([]);
    setEdgeLengthDrafts([]);
  };

  const cancelSiteDimensions = () => {
    setShowDimensionsDialog(false);
    setDimensionsError("");
  };

  const cancelShapeSelection = () => {
    setShowShapeDialog(false);
  };

  const continueFromShapeDialog = () => {
    setShowShapeDialog(false);
    if (shapeDraft === "rectangle") {
      setSiteShape("rectangle");
      setBoundarySelection(undefined);
      setPolygonBoundary([]);
      setDraftBoundaryPolygon([]);
      setBoundaryPreviewPoint(undefined);
      setEdgeLengthDrafts([]);
      setPolygonError("");
      changeSelectionMode("boundaryRectangle");
      return;
    }

    setSiteShape("polygon");
    setBoundarySelection(undefined);
    setPolygonBoundary([]);
    setDraftBoundaryPolygon([]);
    setBoundaryPreviewPoint(undefined);
    setEdgeLengthDrafts([]);
    setPolygonError("");
    changeSelectionMode("boundaryPolygon");
  };

  const handleWorkspaceWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!renderSize.width || !renderSize.height) return;
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const bounds = workspace.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const factor = Math.exp(-event.deltaY * 0.0015);

    setCamera((current) => {
      const nextScale = clamp(current.scale * factor, 0.05, 12);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      };
    });
  };

  const handleWorkspacePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 1 && !spacePressedRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    setIsPanning(true);
  };

  const handleWorkspacePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = panStartRef.current;
    if (!start) return;
    setCamera((current) => ({
      ...current,
      x: start.cameraX + event.clientX - start.clientX,
      y: start.cameraY + event.clientY - start.clientY,
    }));
  };

  const stopWorkspacePan = () => {
    panStartRef.current = undefined;
    setIsPanning(false);
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
      roads: roads.map((road) => ({
        ...road,
        x: round(road.x - cropSelection.x),
        y: round(road.y - cropSelection.y),
        rectangleWidth: round(road.rectangleWidth),
        rectangleHeight: round(road.rectangleHeight),
      })),
      ancillaryBuildings: ancillaryBuildings.map((building) => ({
        ...building,
        points: building.points.map((point) => ({
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
                disabled={!renderSize.width}
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
                className={selectionMode === "road" ? "" : "secondaryButton"}
                type="button"
                disabled={!cropSelection}
                onClick={openRoadTypeDialog}
              >
                Select Road
              </button>
              <button
                className={
                  selectionMode === "ancillaryRectangle" || selectionMode === "ancillaryPolygon"
                    ? ""
                    : "secondaryButton"
                }
                type="button"
                disabled={!cropSelection}
                onClick={openAncillaryShapeDialog}
              >
                Select Ancillary Building
              </button>
              <button
                className={selectionMode === "greenPark" ? "" : "secondaryButton"}
                type="button"
                disabled={!cropSelection}
                onClick={() => changeSelectionMode("greenPark")}
              >
                Select Green Park Area
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
            {selectionMode === "greenPark" ? (
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
            {selectionMode === "road" ? (
              <div className="polygonActions">
                <p className="muted">
                  {activeRoadType ? getRoadTypeLabel(activeRoadType) : "Road"} ({activeRoadWidth}m)
                </p>
                <button
                  className="dangerButton"
                  type="button"
                  disabled={!selectedRoadId}
                  onClick={deleteSelectedRoad}
                >
                  Delete Selected Road
                </button>
              </div>
            ) : null}
            {selectionMode === "ancillaryRectangle" ||
            selectionMode === "ancillaryPolygon" ? (
              <div className="ancillaryToolStatus">
                <p>
                  <strong>Ancillary Building Tool Active</strong>
                  <span>
                    {selectionMode === "ancillaryRectangle" ? "Rectangle" : "Polygon"} mode
                  </span>
                </p>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={finishAncillaryBuildingMode}
                >
                  Finish Ancillary Buildings
                </button>
              </div>
            ) : null}
            {selectionMode === "ancillaryPolygon" && !pendingAncillaryBuilding ? (
              <ol className="drawingInstructions">
                <li>Click to add vertices.</li>
                <li>Double-click or press Esc to finish.</li>
                <li>Ctrl+Z removes the most recent vertex.</li>
              </ol>
            ) : null}
            {selectionMode === "boundaryPolygon" ? (
              <ol className="drawingInstructions">
                <li>Click to add vertices.</li>
                <li>Double-click to finish polygon.</li>
                <li>Esc cancels current polygon.</li>
                <li>Backspace removes the last vertex.</li>
              </ol>
            ) : (
              <p className="muted">
                {selectionMode === "crop"
                  ? "Draw around the site diagram and useful surrounding context."
                  : selectionMode === "boundaryRectangle"
                    ? "Click the first corner, drag, and release to finish the rectangle."
                    : selectionMode === "road"
                      ? "Click the first corner, drag, and release to create a road rectangle."
                    : selectionMode === "ancillaryRectangle"
                      ? "Click the first corner, drag, and release to trace the ancillary building."
                    : "Click around the area to add polygon points, then finish the polygon. Drag its points to edit."}
              </p>
            )}
          </section>
        </aside>

        <section
          ref={workspaceRef}
          className={`pdfWorkspace ${isPanning ? "isPanning" : ""}`}
          onWheel={handleWorkspaceWheel}
          onPointerDown={handleWorkspacePointerDown}
          onPointerMove={handleWorkspacePointerMove}
          onPointerUp={stopWorkspacePan}
          onPointerCancel={stopWorkspacePan}
        >
          <div className="pdfNavigationControls">
            <button
              className="secondaryButton compactButton"
              type="button"
              disabled={!pdfDocument}
              onClick={() => setCamera((current) => ({ ...current, scale: clamp(current.scale * 1.2, 0.05, 12) }))}
              title="Zoom in"
            >
              +
            </button>
            <button
              className="secondaryButton compactButton"
              type="button"
              disabled={!pdfDocument}
              onClick={() => setCamera((current) => ({ ...current, scale: clamp(current.scale / 1.2, 0.05, 12) }))}
              title="Zoom out"
            >
              -
            </button>
            <button
              className="secondaryButton compactButton"
              type="button"
              disabled={!cropSelection}
              onClick={fitSite}
              title="Fit cropped site (F)"
            >
              Fit
            </button>
            <span>Wheel zoom · Middle or Space-drag pan</span>
          </div>
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
            onPointerLeave={() => {
              setBoundaryPreviewPoint(undefined);
            }}
            onPointerUp={handlePointerUp}
            onDoubleClick={(event) => {
              if (selectionMode === "boundaryPolygon" && !polygonBoundary.length) {
                event.preventDefault();
                finishBoundaryPolygon();
              } else if (selectionMode === "ancillaryPolygon" && !pendingAncillaryBuilding) {
                event.preventDefault();
                finishAncillaryPolygon();
              }
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
              <BoundaryPolygonOverlay
                points={draftBoundaryPolygon}
                complete={false}
                previewPoint={boundaryPreviewPoint}
              />
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
            {roads.map((road) => (
              <RoadOverlay
                key={road.id}
                road={road}
                isSelected={road.id === selectedRoadId}
                onSelect={() => {
                  setSelectedZoneId(undefined);
                  setSelectedRoadId(road.id);
                }}
              />
            ))}
            {pendingRoad ? (
              <RoadOverlay
                road={pendingRoad}
                isSelected={false}
                isTemporary
                onSelect={() => undefined}
              />
            ) : null}
            {ancillaryBuildings.map((building, index) => (
              <AncillaryBuildingOverlay
                key={building.id}
                building={building}
                label={`Ancillary Building ${index + 1}`}
              />
            ))}
            {pendingAncillaryBuilding ? (
              <AncillaryBuildingOverlay
                building={pendingAncillaryBuilding}
                isTemporary
              />
            ) : null}
            {draftAncillaryPolygon.length ? (
              <AncillaryPolygonPreview
                points={draftAncillaryPolygon}
                previewPoint={ancillaryPreviewPoint}
              />
            ) : null}
            {draftPolygon.length ? (
              <ContextZoneOverlay
                zone={{ id: "draft", type: selectionMode as ContextZoneType, points: draftPolygon }}
                isSelected
                isDraft
                onSelect={() => undefined}
                onVertexPointerDown={() => undefined}
              />
            ) : null}
            {draftSelection && (
              selectionMode === "crop" ||
              selectionMode === "boundaryRectangle" ||
              selectionMode === "road" ||
              selectionMode === "ancillaryRectangle"
            ) ? (
              <SelectionOverlay selection={draftSelection} variant={selectionMode} />
            ) : null}
            {(selectionMode === "ancillaryRectangle" ||
              selectionMode === "ancillaryPolygon") &&
            ancillaryPreviewPoint ? (
              <AncillaryCursorLabel point={ancillaryPreviewPoint} />
            ) : null}
            {!renderSize.width ? <div className="emptyPdfState">Upload a PDF to choose the site plan page.</div> : null}
          </div>
        </section>
      </section>
      {showDimensionsDialog ? (
        <FloatingToolPanel
          title="Site Dimensions"
          initialPosition={{ x: 360, y: 118 }}
          onCancel={cancelSiteDimensions}
        >
          <form
            className="floatingToolForm"
            onSubmit={(event) => {
              event.preventDefault();
              confirmSiteDimensions();
            }}
          >
            <label>
              <span>Length (m)</span>
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
              <span>Width (m)</span>
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
            <div className="floatingPanelActions">
              <button type="submit">Apply</button>
              <button
                className="secondaryButton"
                type="button"
                onClick={cancelSiteDimensions}
              >
                Cancel
              </button>
            </div>
          </form>
        </FloatingToolPanel>
      ) : null}
      {showShapeDialog ? (
        <FloatingToolPanel
          title="Site Boundary"
          initialPosition={{ x: 330, y: 118 }}
          onCancel={cancelShapeSelection}
        >
          <form
            className="floatingToolForm"
            onSubmit={(event) => {
              event.preventDefault();
              continueFromShapeDialog();
            }}
          >
            <label className="floatingRadio">
              <input
                autoFocus
                type="radio"
                name="siteShape"
                value="rectangle"
                checked={shapeDraft === "rectangle"}
                onChange={() => setShapeDraft("rectangle")}
              />
              <span>Rectangle</span>
            </label>
            <label className="floatingRadio">
              <input
                type="radio"
                name="siteShape"
                value="polygon"
                checked={shapeDraft === "polygon"}
                onChange={() => setShapeDraft("polygon")}
              />
              <span>Polygon</span>
            </label>
            <div className="floatingPanelActions">
              <button type="submit">Continue</button>
              <button className="secondaryButton" type="button" onClick={cancelShapeSelection}>
                Cancel
              </button>
            </div>
          </form>
        </FloatingToolPanel>
      ) : null}
      {showRoadTypeDialog ? (
        <FloatingToolPanel
          title="Select Road Type"
          initialPosition={{ x: 330, y: 118 }}
          onCancel={() => setShowRoadTypeDialog(false)}
        >
          <form
            className="floatingToolForm"
            onSubmit={(event) => {
              event.preventDefault();
              continueRoadType();
            }}
          >
            {(["primary", "secondary", "pedestrian"] as RoadType[]).map((type, index) => (
              <label className="floatingRadio" key={type}>
                <input
                  autoFocus={index === 0}
                  type="radio"
                  name="roadType"
                  value={type}
                  checked={roadTypeDraft === type}
                  onChange={() => setRoadTypeDraft(type)}
                />
                <span>{getRoadTypeLabel(type)}</span>
              </label>
            ))}
            <div className="floatingPanelActions">
              <button type="submit">Continue</button>
              <button className="secondaryButton" type="button" onClick={() => setShowRoadTypeDialog(false)}>
                Cancel
              </button>
            </div>
          </form>
        </FloatingToolPanel>
      ) : null}
      {showAncillaryShapeDialog ? (
        <FloatingToolPanel
          title="Select Building Shape"
          initialPosition={{ x: 340, y: 126 }}
          onCancel={() => setShowAncillaryShapeDialog(false)}
        >
          <form
            className="floatingToolForm"
            onSubmit={(event) => {
              event.preventDefault();
              continueAncillaryShape();
            }}
          >
            <label className="floatingRadio">
              <input
                autoFocus
                type="radio"
                name="ancillaryShape"
                value="rectangle"
                checked={ancillaryShapeDraft === "rectangle"}
                onChange={() => setAncillaryShapeDraft("rectangle")}
              />
              <span>Rectangle</span>
            </label>
            <label className="floatingRadio">
              <input
                type="radio"
                name="ancillaryShape"
                value="polygon"
                checked={ancillaryShapeDraft === "polygon"}
                onChange={() => setAncillaryShapeDraft("polygon")}
              />
              <span>Polygon</span>
            </label>
            <div className="floatingPanelActions">
              <button type="submit">Continue</button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => setShowAncillaryShapeDialog(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </FloatingToolPanel>
      ) : null}
      {showRoadWidthDialog ? (
        <FloatingToolPanel
          title="Road Width"
          initialPosition={{ x: 350, y: 140 }}
          onCancel={() => setShowRoadWidthDialog(false)}
        >
          <form
            className="floatingToolForm"
            onSubmit={(event) => {
              event.preventDefault();
              applyRoadWidth();
            }}
          >
            <label>
              <span>Road Width (m)</span>
              <input
                autoFocus
                type="number"
                min="0.1"
                step="0.1"
                value={roadWidthDraft}
                onChange={(event) => {
                  setRoadWidthDraft(event.target.value);
                  setRoadError("");
                }}
              />
            </label>
            {roadError ? <p className="errorText">{roadError}</p> : null}
            <div className="floatingPanelActions">
              <button type="submit">Apply</button>
              <button className="secondaryButton" type="button" onClick={() => setShowRoadWidthDialog(false)}>
                Cancel
              </button>
            </div>
          </form>
        </FloatingToolPanel>
      ) : null}
      {pendingRoad ? (
        <FloatingToolPanel
          title="Confirm Road"
          initialPosition={{ x: 360, y: 150 }}
          onCancel={cancelPendingRoad}
        >
          <div className="floatingToolForm">
            <div className="roadConfirmationSummary">
              <span>Road Type:</span>
              <strong>{getRoadTypeLabel(pendingRoad.type)}</strong>
              <span>Width:</span>
              <strong>{formatRoadWidth(pendingRoad.width)}m</strong>
            </div>
            <div className="floatingPanelActions">
              <button type="button" onClick={confirmPendingRoad}>Confirm</button>
              <button className="secondaryButton" type="button" onClick={cancelPendingRoad}>
                Cancel
              </button>
            </div>
          </div>
        </FloatingToolPanel>
      ) : null}
      {pendingAncillaryBuilding ? (
        <FloatingToolPanel
          title="Confirm Ancillary Building"
          initialPosition={{ x: 360, y: 150 }}
          onCancel={cancelPendingAncillaryBuilding}
        >
          <div className="floatingToolForm">
            <p className="muted">
              Review the traced {pendingAncillaryBuilding.type} footprint before saving it.
            </p>
            <div className="floatingPanelActions ancillaryConfirmationActions">
              <button type="button" onClick={confirmPendingAncillaryBuilding}>Confirm</button>
              <button className="secondaryButton" type="button" onClick={redrawPendingAncillaryBuilding}>
                Redraw
              </button>
              <button className="secondaryButton" type="button" onClick={cancelPendingAncillaryBuilding}>
                Cancel
              </button>
            </div>
          </div>
        </FloatingToolPanel>
      ) : null}
    </main>
  );
}

function FloatingToolPanel({
  title,
  initialPosition,
  onCancel,
  children,
}: {
  title: string;
  initialPosition: PanelPosition;
  onCancel: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<PanelPosition | undefined>(undefined);
  const [position, setPosition] = useState(initialPosition);

  const keepInsideViewport = useCallback((next: PanelPosition) => {
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 300;
    const height = panel?.offsetHeight ?? 180;
    const margin = 8;
    return {
      x: clamp(next.x, margin, Math.max(margin, window.innerWidth - width - margin)),
      y: clamp(next.y, margin, Math.max(margin, window.innerHeight - height - margin)),
    };
  }, []);

  useEffect(() => {
    const constrainPosition = () => setPosition((current) => keepInsideViewport(current));
    constrainPosition();
    window.addEventListener("resize", constrainPosition);
    return () => window.removeEventListener("resize", constrainPosition);
  }, [keepInsideViewport]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    setPosition(
      keepInsideViewport({
        x: event.clientX - offset.x,
        y: event.clientY - offset.y,
      }),
    );
  };

  const stopDragging = () => {
    dragOffsetRef.current = undefined;
  };

  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="setupModalOverlay" role="presentation">
      <div
        ref={panelRef}
        className="floatingToolPanel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ left: position.x, top: position.y }}
        onKeyDown={keepFocusInside}
      >
        <div
          className="floatingToolHeader"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <h2>{title}</h2>
          <span aria-hidden="true">Drag</span>
        </div>
        <div className="floatingToolBody">{children}</div>
      </div>
    </div>
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

function RoadOverlay({
  road,
  isSelected,
  isTemporary = false,
  onSelect,
}: {
  road: SetupRoad;
  isSelected: boolean;
  isTemporary?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`roadSelectionOverlay ${isSelected ? "selected" : ""} ${isTemporary ? "temporary" : ""}`}
      type="button"
      style={{
        left: road.x,
        top: road.y,
        width: road.rectangleWidth,
        height: road.rectangleHeight,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-label={`${getRoadTypeLabel(road.type)} ${formatRoadWidth(road.width)} meters`}
    >
      <span>{getRoadTypeLabel(road.type)} ({formatRoadWidth(road.width)}m)</span>
    </button>
  );
}

function AncillaryBuildingOverlay({
  building,
  label,
  isTemporary = false,
}: {
  building: AncillaryBuilding;
  label?: string;
  isTemporary?: boolean;
}) {
  const points = building.points.map((point) => `${point.x},${point.y}`).join(" ");
  const center = label ? getPointsCenter(building.points) : undefined;

  return (
    <svg className="contextZoneOverlay" width="100%" height="100%" pointerEvents="none">
      <polygon
        points={points}
        fill="rgba(120, 120, 120, 0.35)"
        stroke="rgba(80, 80, 80, 1)"
        strokeWidth={3}
        strokeDasharray={isTemporary ? "10 7" : undefined}
      />
      {label && center ? (
        <text
          x={center.x}
          y={center.y}
          fill="#374151"
          fontSize={14}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}

function AncillaryCursorLabel({ point }: { point: ContextPoint }) {
  return (
    <div
      className="ancillaryCursorLabel"
      style={{
        left: point.x + 16,
        top: point.y + 16,
      }}
    >
      Ancillary Building
    </div>
  );
}

function AncillaryPolygonPreview({
  points,
  previewPoint,
}: {
  points: ContextPoint[];
  previewPoint?: ContextPoint;
}) {
  const previewPoints = previewPoint ? [...points, previewPoint] : points;

  return (
    <svg className="contextZoneOverlay" width="100%" height="100%" pointerEvents="none">
      <polyline
        points={previewPoints.map((point) => `${point.x},${point.y}`).join(" ")}
        fill={points.length >= 3 ? "rgba(120, 120, 120, 0.22)" : "none"}
        stroke="rgba(80, 80, 80, 1)"
        strokeWidth={3}
        strokeDasharray="10 7"
      />
      {points.map((point, index) => (
        <g key={`${point.x}-${point.y}-${index}`}>
          <circle cx={point.x} cy={point.y} r={6} fill="#ffffff" stroke="#505050" strokeWidth={3} />
          <text x={point.x + 9} y={point.y - 9} fill="#374151" fontSize={14} fontWeight={700}>
            {getVertexLabel(index)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function BoundaryPolygonOverlay({
  points,
  complete,
  previewPoint,
}: {
  points: ContextPoint[];
  complete: boolean;
  previewPoint?: ContextPoint;
}) {
  const previewPoints = previewPoint ? [...points, previewPoint] : points;
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
          points={previewPoints.map((point) => `${point.x},${point.y}`).join(" ")}
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
      {!complete && previewPoint ? (
        <circle
          cx={previewPoint.x}
          cy={previewPoint.y}
          r={4}
          fill="#0f766e"
          pointerEvents="none"
        />
      ) : null}
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

  return (
    <svg className="contextZoneOverlay" width="100%" height="100%">
      {zone.points.length >= 3 ? (
        <polygon
          points={points}
          fill="rgba(134, 239, 172, 0.36)"
          stroke={isSelected ? "#f97316" : "#16a34a"}
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
          stroke="#16a34a"
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
          stroke="#16a34a"
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

function rectangleToPoints(selection: SelectionRect): ContextPoint[] {
  return [
    { x: selection.x, y: selection.y },
    { x: selection.x + selection.width, y: selection.y },
    { x: selection.x + selection.width, y: selection.y + selection.height },
    { x: selection.x, y: selection.y + selection.height },
  ];
}

function getPointsCenter(points: ContextPoint[]) {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
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

function getRoadTypeLabel(type: RoadType) {
  if (type === "primary") return "Primary Road";
  if (type === "secondary") return "Secondary Road";
  return "Pedestrian Pathway";
}

function getDefaultRoadWidth(type: RoadType) {
  if (type === "primary") return 12;
  if (type === "secondary") return 6;
  return 7;
}

function formatRoadWidth(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isFormControl(target: HTMLElement | null) {
  return (
    target?.tagName === "INPUT" ||
    target?.tagName === "SELECT" ||
    target?.tagName === "TEXTAREA" ||
    target?.tagName === "BUTTON"
  );
}
