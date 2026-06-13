import { useEffect, useRef, useState } from "react";
import { ConceptPlanGallery } from "../components/ConceptPlanGallery";
import { PropertyPanel } from "../components/PropertyPanel";
import { SiteCanvas } from "../components/SiteCanvas";
import { Toolbar } from "../components/Toolbar";
import { createBridge, createRectangle, createSquare, createToilet } from "../models/Building";
import { defaultSiteData, siteDataToDimensions } from "../models/Site";
import { exportConceptSitePlan } from "../services/conceptSitePlan";
import { renderConceptPlanWithAi } from "../services/aiConceptRender";
import {
  addConceptPlanExport,
  addConceptPlanRenderedVersion,
  deleteConceptPlanExport,
  getLegacyProjectId,
  getNextExportNumber,
  readActiveProject,
  readConceptPlanExports,
  saveActiveProject,
  updateConceptPlanExport,
} from "../services/conceptPlanGalleryStorage";
import { buildLayoutJson, downloadLayoutJson, parseLayoutJson } from "../services/layoutStorage";
import type {
  Building,
  ConceptPlanExport,
  ConceptPlanRenderedVersion,
  Entrance,
  EntranceLabel,
  PdfBackgroundMeta,
  PdfBackgroundView,
  SiteData,
  SiteDimensions,
  SiteLabel,
  Sidewalk,
  Tree,
} from "../types/layout";

interface EditorSnapshot {
  buildings: Building[];
  siteLabels: SiteLabel[];
  trees: Tree[];
  sidewalks: Sidewalk[];
  entrances: Entrance[];
  selectedBuildingId?: string;
  selectedSiteLabelId?: string;
  selectedTreeId?: string;
  selectedSidewalkId?: string;
  selectedEntranceId?: string;
}

type ClipboardItem = { type: "building"; value: Building } | { type: "tree"; value: Tree };

const historyLimit = 100;
const pasteOffset = 3;
const defaultTreeRadius = 2;

export function SiteEditor() {
  const initialSiteData = readSiteData();
  const initialProject = useRef(readActiveProject()).current;
  const [site, setSite] = useState<SiteDimensions>(() => siteDataToDimensions(initialSiteData));
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [siteLabels, setSiteLabels] = useState<SiteLabel[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [sidewalks, setSidewalks] = useState<Sidewalk[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>();
  const [selectedSiteLabelId, setSelectedSiteLabelId] = useState<string>();
  const [selectedTreeId, setSelectedTreeId] = useState<string>();
  const [selectedSidewalkId, setSelectedSidewalkId] = useState<string>();
  const [selectedEntranceId, setSelectedEntranceId] = useState<string>();
  const [isTreeToolActive, setIsTreeToolActive] = useState(false);
  const [isSidewalkToolActive, setIsSidewalkToolActive] = useState(false);
  const [entrancePlacementLabel, setEntrancePlacementLabel] = useState<EntranceLabel>();
  const [treeDiameterDialogId, setTreeDiameterDialogId] = useState<string>();
  const [treeDiameterDraft, setTreeDiameterDraft] = useState("");
  const [projectId, setProjectId] = useState(initialProject.id);
  const [projectName, setProjectName] = useState(initialProject.name);
  const [projectNameDraft, setProjectNameDraft] = useState(initialProject.name);
  const [projectDialogMode, setProjectDialogMode] = useState<"save" | "rename">();
  const [conceptPlanExports, setConceptPlanExports] = useState<ConceptPlanExport[]>(() =>
    readConceptPlanExports(initialProject.id),
  );
  const [isConceptGalleryOpen, setIsConceptGalleryOpen] = useState(false);
  const [previewedConceptPlan, setPreviewedConceptPlan] = useState<ConceptPlanExport>();
  const [backgroundImageSrc, setBackgroundImageSrc] = useState<string | undefined>(() =>
    sessionStorage.getItem("siteBackgroundImage") ?? undefined,
  );
  const [fullPageImageSrc] = useState<string | undefined>(() =>
    sessionStorage.getItem("siteFullPageImage") ?? undefined,
  );
  const [backgroundMeta, setBackgroundMeta] = useState<PdfBackgroundMeta | undefined>(() => readBackgroundMeta());
  const [backgroundView, setBackgroundView] = useState<PdfBackgroundView>("crop");
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.5);
  const [showBackground, setShowBackground] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [layoutError, setLayoutError] = useState("");
  const [history, setHistory] = useState<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({
    past: [],
    future: [],
  });
  const [clipboardItem, setClipboardItem] = useState<ClipboardItem>();
  const editStartSnapshotRef = useRef<EditorSnapshot | undefined>(undefined);

  useEffect(() => {
    saveActiveProject(projectId, projectName);
  }, [projectId, projectName]);

  useEffect(() => {
    if (!backgroundMeta) return;
    try {
      sessionStorage.setItem("siteBackgroundMeta", JSON.stringify(backgroundMeta));
    } catch {
      setLayoutError("The site setup metadata could not be persisted.");
    }
  }, [backgroundMeta]);

  useEffect(() => {
    setConceptPlanExports(readConceptPlanExports(projectId));
    setPreviewedConceptPlan(undefined);
  }, [projectId]);

  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId);
  const selectedSiteLabel = siteLabels.find((label) => label.id === selectedSiteLabelId);
  const selectedTree = trees.find((tree) => tree.id === selectedTreeId);
  const selectedSidewalk = sidewalks.find((sidewalk) => sidewalk.id === selectedSidewalkId);
  const selectedEntrance = entrances.find((entrance) => entrance.id === selectedEntranceId);
  const analysisBounds = getEditorAnalysisBounds(backgroundMeta, site);
  const createSnapshot = (): EditorSnapshot => ({
    buildings: cloneBuildings(buildings),
    siteLabels: cloneSiteLabels(siteLabels),
    trees: cloneTrees(trees),
    sidewalks: cloneSidewalks(sidewalks),
    entrances: cloneEntrances(entrances),
    selectedBuildingId,
    selectedSiteLabelId,
    selectedTreeId,
    selectedSidewalkId,
    selectedEntranceId,
  });

  const pushHistory = (snapshot: EditorSnapshot) => {
    setHistory((current) => ({
      past: [...current.past, snapshot].slice(-historyLimit),
      future: [],
    }));
  };

  const recordCurrent = () => pushHistory(createSnapshot());

  const upsertBuilding = (building: Building, recordHistory = true) => {
    if (recordHistory) recordCurrent();
    const previous = buildings.find((item) => item.id === building.id);
    if (previous) {
      setEntrances((current) =>
        current.map((entrance) =>
          entrance.buildingId === building.id
            ? moveEntranceWithBuilding(entrance, previous, building)
            : entrance,
        ),
      );
    }
    setBuildings((current) => current.map((item) => (item.id === building.id ? building : item)));
  };

  const deleteSelectedBuilding = () => {
    if (!selectedBuildingId) return;
    recordCurrent();
    setBuildings((current) => current.filter((building) => building.id !== selectedBuildingId));
    setEntrances((current) => current.filter((entrance) => entrance.buildingId !== selectedBuildingId));
    setSelectedBuildingId(undefined);
  };

  const deleteSelectedSiteLabel = () => {
    if (!selectedSiteLabelId) return;
    recordCurrent();
    setSiteLabels((current) => current.filter((label) => label.id !== selectedSiteLabelId));
    setSelectedSiteLabelId(undefined);
  };

  const deleteSelectedTree = () => {
    if (!selectedTreeId) return;
    recordCurrent();
    setTrees((current) => current.filter((tree) => tree.id !== selectedTreeId));
    setSelectedTreeId(undefined);
  };

  const deleteSelectedSidewalk = () => {
    if (!selectedSidewalkId) return;
    recordCurrent();
    setSidewalks((current) => current.filter((sidewalk) => sidewalk.id !== selectedSidewalkId));
    setSelectedSidewalkId(undefined);
  };

  const deleteSelectedEntrance = () => {
    if (!selectedEntranceId) return;
    recordCurrent();
    setEntrances((current) => current.filter((entrance) => entrance.id !== selectedEntranceId));
    setSelectedEntranceId(undefined);
  };

  const copySelectedObject = () => {
    if (selectedTree) {
      setClipboardItem({ type: "tree", value: { ...selectedTree } });
      return;
    }
    if (selectedBuilding) {
      setClipboardItem({
        type: "building",
        value: { ...selectedBuilding, programs: selectedBuilding.programs.map((program) => ({ ...program })) },
      });
    }
  };

  const pasteCopiedObject = (source?: ClipboardItem) => {
    const item = source ?? clipboardItem;
    if (!item) return;

    recordCurrent();

    if (item.type === "tree") {
      const tree: Tree = {
        ...item.value,
        id: crypto.randomUUID(),
        x: item.value.x + pasteOffset,
        y: item.value.y + pasteOffset,
      };
      setTrees((current) => [...current, tree]);
      setSelectedTreeId(tree.id);
      setSelectedBuildingId(undefined);
      setSelectedSiteLabelId(undefined);
      setClipboardItem({ type: "tree", value: { ...tree } });
      return;
    }

    const duplicatedBuilding: Building = {
      ...item.value,
      programs: item.value.programs.map((program) => ({ ...program })),
      id: crypto.randomUUID(),
      x: item.value.x + pasteOffset,
      y: item.value.y + pasteOffset,
    };

    setBuildings((current) => [...current, duplicatedBuilding]);
    setSelectedBuildingId(duplicatedBuilding.id);
    setSelectedTreeId(undefined);
    setSelectedSiteLabelId(undefined);
    setClipboardItem({
      type: "building",
      value: { ...duplicatedBuilding, programs: duplicatedBuilding.programs.map((program) => ({ ...program })) },
    });
  };

  const duplicateSelectedObject = () => {
    if (selectedTree) {
      pasteCopiedObject({ type: "tree", value: selectedTree });
    } else if (selectedBuilding) {
      pasteCopiedObject({ type: "building", value: selectedBuilding });
    }
  };

  const undo = () => {
    const previous = history.past[history.past.length - 1];
    if (!previous) return;

    const nextCurrent = createSnapshot();
    setBuildings(cloneBuildings(previous.buildings));
    setSiteLabels(cloneSiteLabels(previous.siteLabels));
    setTrees(cloneTrees(previous.trees));
    setSidewalks(cloneSidewalks(previous.sidewalks));
    setEntrances(cloneEntrances(previous.entrances));
    setSelectedBuildingId(previous.selectedBuildingId);
    setSelectedSiteLabelId(previous.selectedSiteLabelId);
    setSelectedTreeId(previous.selectedTreeId);
    setSelectedSidewalkId(previous.selectedSidewalkId);
    setSelectedEntranceId(previous.selectedEntranceId);
    setHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [nextCurrent, ...current.future].slice(0, historyLimit),
    }));
  };

  const redo = () => {
    const next = history.future[0];
    if (!next) return;

    const nextCurrent = createSnapshot();
    setBuildings(cloneBuildings(next.buildings));
    setSiteLabels(cloneSiteLabels(next.siteLabels));
    setTrees(cloneTrees(next.trees));
    setSidewalks(cloneSidewalks(next.sidewalks));
    setEntrances(cloneEntrances(next.entrances));
    setSelectedBuildingId(next.selectedBuildingId);
    setSelectedSiteLabelId(next.selectedSiteLabelId);
    setSelectedTreeId(next.selectedTreeId);
    setSelectedSidewalkId(next.selectedSidewalkId);
    setSelectedEntranceId(next.selectedEntranceId);
    setHistory((current) => ({
      past: [...current.past, nextCurrent].slice(-historyLimit),
      future: current.future.slice(1),
    }));
  };

  const beginBuildingEdit = () => {
    editStartSnapshotRef.current = createSnapshot();
  };

  const endBuildingEdit = () => {
    const snapshot = editStartSnapshotRef.current;
    editStartSnapshotRef.current = undefined;
    if (!snapshot || snapshotsEqual(snapshot, createSnapshot())) return;
    pushHistory(snapshot);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA";

      if (isEditingField) return;

      const key = event.key.toLowerCase();
      const isModifier = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        setIsTreeToolActive(false);
        setIsSidewalkToolActive(false);
        setEntrancePlacementLabel(undefined);
        return;
      }

      if (isModifier && key === "c") {
        event.preventDefault();
        copySelectedObject();
        return;
      }

      if (isModifier && key === "v") {
        event.preventDefault();
        pasteCopiedObject();
        return;
      }

      if (isModifier && key === "d") {
        event.preventDefault();
        duplicateSelectedObject();
        return;
      }

      if (isModifier && key === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if (isModifier && key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        if (selectedTreeId) {
          deleteSelectedTree();
        } else if (selectedEntranceId) {
          deleteSelectedEntrance();
        } else if (selectedSidewalkId) {
          deleteSelectedSidewalk();
        } else if (selectedSiteLabelId) {
          deleteSelectedSiteLabel();
        } else {
          deleteSelectedBuilding();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    buildings,
    clipboardItem,
    history,
    selectedBuilding,
    selectedBuildingId,
    selectedEntranceId,
    selectedSiteLabelId,
    selectedSidewalkId,
    selectedTree,
    selectedTreeId,
    siteLabels,
    trees,
    sidewalks,
    entrances,
  ]);

  const addRectangle = () => {
    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(undefined);
    const length = Number(window.prompt("Building Length", "20")) || 20;
    const width = Number(window.prompt("Building Width", "12")) || 12;
    const building = createRectangle(length, width);
    recordCurrent();
    setBuildings((current) => [...current, building]);
    setSelectedBuildingId(building.id);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const addSquare = () => {
    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(undefined);
    const size = Number(window.prompt("Size", "10")) || 10;
    const building = createSquare(size);
    recordCurrent();
    setBuildings((current) => [...current, building]);
    setSelectedBuildingId(building.id);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const addBridge = () => {
    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(undefined);
    const building = createBridge();
    recordCurrent();
    setBuildings((current) => [...current, building]);
    setSelectedBuildingId(building.id);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const addToilet = () => {
    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(undefined);
    const building = createToilet();
    recordCurrent();
    setBuildings((current) => [...current, building]);
    setSelectedBuildingId(building.id);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const addSiteLabel = () => {
    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(undefined);
    const text = window.prompt("Label Text", "Main Square");
    if (text === null) return;

    const label: SiteLabel = {
      id: crypto.randomUUID(),
      type: "siteLabel",
      text: text || "Main Square",
      x: site.width / 2,
      y: site.length / 2,
    };

    recordCurrent();
    setSiteLabels((current) => [...current, label]);
    setSelectedBuildingId(undefined);
    setSelectedSiteLabelId(label.id);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const placeTree = (x: number, y: number) => {
    const tree: Tree = {
      id: crypto.randomUUID(),
      type: "tree",
      x: clampAnalysisCoordinate(x, analysisBounds.minX, analysisBounds.maxX, defaultTreeRadius),
      y: clampAnalysisCoordinate(y, analysisBounds.minY, analysisBounds.maxY, defaultTreeRadius),
      radius: defaultTreeRadius,
    };

    recordCurrent();
    setTrees((current) => [...current, tree]);
    setSelectedTreeId(tree.id);
    setSelectedBuildingId(undefined);
    setSelectedSiteLabelId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
  };

  const openTreeDiameterDialog = (tree: Tree) => {
    setSelectedTreeId(tree.id);
    setTreeDiameterDialogId(tree.id);
    setTreeDiameterDraft((tree.radius * 2).toFixed(1));
  };

  const saveTreeDiameter = () => {
    const diameter = Number(treeDiameterDraft);
    if (!treeDiameterDialogId || !Number.isFinite(diameter) || diameter <= 0) {
      setLayoutError("Tree diameter must be greater than 0.");
      return;
    }

    recordCurrent();
    setTrees((current) =>
      current.map((tree) =>
        tree.id === treeDiameterDialogId
          ? { ...tree, radius: diameter / 2 }
          : tree,
      ),
    );
    setTreeDiameterDialogId(undefined);
    setTreeDiameterDraft("");
    setLayoutError("");
  };

  const addSidewalk = () => {
    setIsTreeToolActive(false);
    setEntrancePlacementLabel(undefined);
    setIsSidewalkToolActive((current) => !current);
    setLayoutError("");
  };

  const placeSidewalk = (
    geometry: Omit<Sidewalk, "id" | "type" | "width" | "label">,
  ) => {
    const widthInput = window.prompt("Sidewalk Width (m)", "6");
    if (widthInput === null) return;
    const width = Number(widthInput);
    if (!Number.isFinite(width) || width <= 0) {
      setLayoutError("Sidewalk width must be greater than 0.");
      return;
    }

    const sidewalk: Sidewalk = {
      id: crypto.randomUUID(),
      type: "sidewalk",
      ...geometry,
      width,
      label: "Sidewalk",
    };

    recordCurrent();
    setSidewalks((current) => [...current, sidewalk]);
    setSelectedSidewalkId(sidewalk.id);
    setSelectedBuildingId(undefined);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedEntranceId(undefined);
    setIsSidewalkToolActive(false);
    setLayoutError("");
  };

  const activateEntranceTool = () => {
    if (entrancePlacementLabel) {
      setEntrancePlacementLabel(undefined);
      return;
    }

    const input = window.prompt(
      "Entrance Type: Main Entrance, Side Entrance, Service Entrance, or Emergency Exit",
      "Main Entrance",
    );
    if (input === null) return;
    const label = parseEntranceLabel(input);
    if (!label) {
      setLayoutError("Invalid entrance type.");
      return;
    }

    setIsTreeToolActive(false);
    setIsSidewalkToolActive(false);
    setEntrancePlacementLabel(label);
    setSelectedBuildingId(undefined);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setSelectedEntranceId(undefined);
    setLayoutError("");
  };

  const placeEntrance = (building: Building, localX: number, localY: number) => {
    if (!entrancePlacementLabel) return;
    const placement = getEntrancePlacement(building, localX, localY);
    const entrance: Entrance = {
      id: crypto.randomUUID(),
      type: "entrance",
      label: entrancePlacementLabel,
      buildingId: building.id,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      labelPosition: "bottom",
    };

    recordCurrent();
    setEntrances((current) => [...current, entrance]);
    setSelectedEntranceId(entrance.id);
    setSelectedBuildingId(undefined);
    setSelectedSiteLabelId(undefined);
    setSelectedTreeId(undefined);
    setSelectedSidewalkId(undefined);
    setEntrancePlacementLabel(undefined);
  };

  const loadLayout = async (file: File) => {
    try {
      const parsed = parseLayoutJson(JSON.parse(await file.text()) as unknown);
      if (!parsed) {
        setLayoutError("Invalid layout file.");
        return;
      }

      setSite({
        ...parsed.site,
        pixelsPerMeter: site.pixelsPerMeter,
      });
      setBuildings(parsed.buildings);
      setSiteLabels(parsed.siteLabels);
      setTrees(parsed.trees);
      setSidewalks(parsed.sidewalks);
      setEntrances(parsed.entrances);
      setProjectName(parsed.projectName);
      setProjectNameDraft(parsed.projectName);
      setProjectId(parsed.projectId ?? getLegacyProjectId(parsed.projectName));
      setBackgroundMeta((current) => {
        const base = current ?? createDefaultBackgroundMeta(parsed.site);
        return {
          ...base,
          siteShape: parsed.siteShape,
          siteBoundary: {
            ...base.siteBoundary,
            ...(parsed.siteShape === "polygon"
              ? {
                  polygon: getBackgroundPolygonVertices(parsed.siteVertices, base.siteBoundary, parsed.site),
                  edgeLengths: parsed.edgeLengths,
                }
              : {
                  polygon: undefined,
                  edgeLengths: undefined,
                }),
          },
          contextZones: parsed.contextZones,
          roads: parsed.roads,
          ancillaryBuildings: parsed.ancillaryBuildings,
          existingBuildings: parsed.existingBuildings,
          existingTrees: parsed.existingTrees,
        };
      });
      setSelectedBuildingId(undefined);
      setSelectedSiteLabelId(undefined);
      setSelectedTreeId(undefined);
      setSelectedSidewalkId(undefined);
      setSelectedEntranceId(undefined);
      setClipboardItem(undefined);
      setIsTreeToolActive(false);
      setIsSidewalkToolActive(false);
      setEntrancePlacementLabel(undefined);
      setHistory({ past: [], future: [] });
      editStartSnapshotRef.current = undefined;
      setLayoutError("");
    } catch {
      setLayoutError("Invalid layout file.");
    }
  };

  const openProjectDialog = (mode: "save" | "rename") => {
    setProjectNameDraft(projectName);
    setProjectDialogMode(mode);
  };

  const confirmProjectDialog = () => {
    const nextProjectName = projectNameDraft.trim() || "Untitled Layout";
    setProjectName(nextProjectName);
    setProjectNameDraft(nextProjectName);
    setProjectDialogMode(undefined);

    if (projectDialogMode === "save") {
      downloadLayoutJson(
        buildLayoutJson(
          site,
          buildings,
          siteLabels,
          trees,
          sidewalks,
          backgroundMeta?.contextZones,
          backgroundMeta?.roads,
          backgroundMeta?.ancillaryBuildings,
          backgroundMeta?.existingBuildings,
          backgroundMeta?.existingTrees,
          entrances,
          nextProjectName,
          new Date().toISOString(),
          backgroundMeta?.siteShape ?? "rectangle",
          getLayoutSiteVertices(backgroundMeta, site),
          backgroundMeta?.siteBoundary.edgeLengths ?? [],
          projectId,
        ),
      );
    }
  };

  const exportConceptPlan = async () => {
    try {
      const rendered = await exportConceptSitePlan(
        site,
        buildings,
        siteLabels,
        trees,
        sidewalks,
        entrances,
        backgroundMeta?.roads,
        backgroundMeta?.ancillaryBuildings,
        backgroundMeta?.crop,
        backgroundMeta?.siteBoundary,
        backgroundMeta?.existingBuildings,
        backgroundMeta?.existingTrees,
        backgroundImageSrc,
        projectName,
        backgroundMeta?.siteShape ?? "rectangle",
        getLayoutSiteVertices(backgroundMeta, site),
        backgroundMeta?.siteBoundary.edgeLengths ?? [],
        showDistanceLines,
        selectedBuildingId,
      );
      if (!rendered) {
        setLayoutError("Unable to render the concept site plan.");
        return;
      }

      const exportNumber = getNextExportNumber(projectId);
      const item: ConceptPlanExport = {
        id: crypto.randomUUID(),
        projectId,
        name: `${projectName} - Export ${exportNumber}`,
        layoutName: projectName,
        exportNumber,
        exportedAt: rendered.exportedAt,
        previewDataUrl: rendered.previewDataUrl,
        thumbnailDataUrl: rendered.thumbnailDataUrl,
        favorite: false,
      };
      addConceptPlanExport(item);
      setConceptPlanExports(readConceptPlanExports(projectId));
      setLayoutError("");
    } catch (error) {
      setLayoutError(
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "The concept gallery is full. Delete older exports and try again."
          : "The PNG downloaded, but the gallery copy could not be saved.",
      );
    }
  };

  const renameConceptPlan = (item: ConceptPlanExport) => {
    const name = window.prompt("Export Name", item.name);
    if (name === null || !name.trim()) return;
    updateConceptPlanExport(projectId, item.id, name);
    setConceptPlanExports(readConceptPlanExports(projectId));
    setPreviewedConceptPlan((current) =>
      current?.id === item.id ? { ...current, name: name.trim() } : current,
    );
  };

  const removeConceptPlan = (item: ConceptPlanExport) => {
    if (!window.confirm(`Delete "${item.name}" from the Concept Plan Gallery?`)) return;
    deleteConceptPlanExport(projectId, item.id);
    setConceptPlanExports(readConceptPlanExports(projectId));
    if (previewedConceptPlan?.id === item.id) setPreviewedConceptPlan(undefined);
  };

  const renderConceptPlan = async (
    item: ConceptPlanExport,
  ): Promise<ConceptPlanRenderedVersion> => {
    const rendered = await renderConceptPlanWithAi(item.previewDataUrl);
    addConceptPlanRenderedVersion(projectId, item.id, rendered);
    const nextExports = readConceptPlanExports(projectId);
    setConceptPlanExports(nextExports);
    setPreviewedConceptPlan(nextExports.find((current) => current.id === item.id));
    return rendered;
  };

  return (
    <main className="editorPage">
      <div className="editorTop">
        <header className="editorHeader">
          <div>
            <p className="eyebrow">Site editor</p>
            <h1>Layout Builder</h1>
            <div className="projectNameDisplay">
              <span>Current Project:</span>
              <strong>{projectName}</strong>
              <button className="projectRenameButton secondaryButton" type="button" onClick={() => openProjectDialog("rename")}>
                Rename
              </button>
            </div>
          </div>
          <Toolbar
            onAddRectangle={addRectangle}
            onAddSquare={addSquare}
            onAddSiteLabel={addSiteLabel}
            onAddBridge={addBridge}
            onAddToilet={addToilet}
            isTreeToolActive={isTreeToolActive}
            onToggleTreeTool={() => {
              setEntrancePlacementLabel(undefined);
              setIsSidewalkToolActive(false);
              setIsTreeToolActive(true);
            }}
            isSidewalkToolActive={isSidewalkToolActive}
            onAddSidewalk={addSidewalk}
            isEntranceToolActive={Boolean(entrancePlacementLabel)}
            onAddEntrance={activateEntranceTool}
            onUndo={undo}
            onRedo={redo}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            showDistanceLines={showDistanceLines}
            onToggleDistanceLines={() => setShowDistanceLines((current) => !current)}
            onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
            isSidebarCollapsed={isSidebarCollapsed}
            onSaveLayout={() => openProjectDialog("save")}
            onExportConceptSitePlan={exportConceptPlan}
            onOpenConceptPlanGallery={() => setIsConceptGalleryOpen(true)}
            conceptPlanExportCount={conceptPlanExports.length}
            onLoadLayout={loadLayout}
          />
        </header>
        {layoutError ? <div className="editorError" role="alert">{layoutError}</div> : null}
      </div>

      <section className={`editorBody ${isSidebarCollapsed ? "sidebarCollapsed" : ""}`}>
        <SiteCanvas
          site={site}
          buildings={buildings}
          siteLabels={siteLabels}
          trees={trees}
          sidewalks={sidewalks}
          entrances={entrances}
          selectedBuildingId={selectedBuildingId}
          selectedSiteLabelId={selectedSiteLabelId}
          selectedTreeId={selectedTreeId}
          selectedSidewalkId={selectedSidewalkId}
          selectedEntranceId={selectedEntranceId}
          isTreeToolActive={isTreeToolActive}
          isSidewalkToolActive={isSidewalkToolActive}
          isEntranceToolActive={Boolean(entrancePlacementLabel)}
          backgroundImageSrc={backgroundView === "full" ? fullPageImageSrc : backgroundImageSrc}
          backgroundMeta={backgroundMeta}
          backgroundView={backgroundView}
          backgroundOpacity={backgroundOpacity}
          showBackground={showBackground}
          showDistanceLines={showDistanceLines}
          onSelectBuilding={(id) => {
            setSelectedBuildingId(id);
            if (id) {
              setSelectedSiteLabelId(undefined);
              setSelectedTreeId(undefined);
              setSelectedSidewalkId(undefined);
              setSelectedEntranceId(undefined);
              setEntrancePlacementLabel(undefined);
            }
          }}
          onSelectSiteLabel={(id) => {
            setSelectedSiteLabelId(id);
            if (id) {
              setSelectedBuildingId(undefined);
              setSelectedTreeId(undefined);
              setSelectedSidewalkId(undefined);
              setSelectedEntranceId(undefined);
              setEntrancePlacementLabel(undefined);
            }
          }}
          onSelectTree={(id) => {
            setSelectedTreeId(id);
            if (id) {
              setSelectedBuildingId(undefined);
              setSelectedSiteLabelId(undefined);
              setSelectedSidewalkId(undefined);
              setSelectedEntranceId(undefined);
              setEntrancePlacementLabel(undefined);
            }
          }}
          onEditTreeDiameter={openTreeDiameterDialog}
          onSelectSidewalk={(id) => {
            setSelectedSidewalkId(id);
            if (id) {
              setSelectedBuildingId(undefined);
              setSelectedSiteLabelId(undefined);
              setSelectedTreeId(undefined);
              setSelectedEntranceId(undefined);
              setEntrancePlacementLabel(undefined);
            }
          }}
          onSelectEntrance={(id) => {
            setSelectedEntranceId(id);
            if (id) {
              setSelectedBuildingId(undefined);
              setSelectedSiteLabelId(undefined);
              setSelectedTreeId(undefined);
              setSelectedSidewalkId(undefined);
              setEntrancePlacementLabel(undefined);
            }
          }}
          onPlaceEntrance={placeEntrance}
          onPlaceTree={placeTree}
          onPlaceSidewalk={placeSidewalk}
          onChangeBuilding={upsertBuilding}
          onChangeSiteLabel={(label, recordHistory = true) => {
            if (recordHistory) recordCurrent();
            setSiteLabels((current) => current.map((item) => (item.id === label.id ? label : item)));
          }}
          onChangeTree={(tree, recordHistory = true) => {
            if (recordHistory) recordCurrent();
            setTrees((current) => current.map((item) => (item.id === tree.id ? tree : item)));
          }}
          onChangeEntrance={(entrance, recordHistory = true) => {
            if (recordHistory) recordCurrent();
            setEntrances((current) => current.map((item) => (item.id === entrance.id ? entrance : item)));
          }}
          onBeginBuildingEdit={beginBuildingEdit}
          onEndBuildingEdit={endBuildingEdit}
        />
        {isSidebarCollapsed ? null : (
          <PropertyPanel
            site={site}
            selectedBuilding={selectedBuilding}
            selectedSiteLabel={selectedSiteLabel}
            selectedTree={selectedTree}
            selectedSidewalk={selectedSidewalk}
            selectedEntrance={selectedEntrance}
          hasBackground={Boolean(backgroundImageSrc)}
          hasFullPageBackground={Boolean(fullPageImageSrc)}
            backgroundView={backgroundView}
            backgroundOpacity={backgroundOpacity}
            showBackground={showBackground}
            showDistanceLines={showDistanceLines}
            onSiteChange={setSite}
          onBackgroundImageChange={(src) => {
            setBackgroundImageSrc(src);
            setBackgroundMeta(undefined);
            setBackgroundView("crop");
          }}
            onBackgroundViewChange={setBackgroundView}
            onBackgroundOpacityChange={setBackgroundOpacity}
            onShowBackgroundChange={setShowBackground}
            onShowDistanceLinesChange={setShowDistanceLines}
            onBuildingChange={upsertBuilding}
            onDeleteBuilding={deleteSelectedBuilding}
            onSiteLabelChange={(label) => {
              recordCurrent();
              const nextLabel = {
                ...label,
                x: clamp(label.x, analysisBounds.minX, analysisBounds.maxX),
                y: clamp(label.y, analysisBounds.minY, analysisBounds.maxY),
              };
              setSiteLabels((current) => current.map((item) => (item.id === label.id ? nextLabel : item)));
            }}
            onDeleteSiteLabel={deleteSelectedSiteLabel}
            onTreeChange={(tree) => {
              recordCurrent();
              const nextTree = {
                ...tree,
                x: clampAnalysisCoordinate(tree.x, analysisBounds.minX, analysisBounds.maxX, tree.radius),
                y: clampAnalysisCoordinate(tree.y, analysisBounds.minY, analysisBounds.maxY, tree.radius),
              };
              setTrees((current) => current.map((item) => (item.id === tree.id ? nextTree : item)));
            }}
            onDeleteTree={deleteSelectedTree}
            onSidewalkChange={(sidewalk) => {
              recordCurrent();
              setSidewalks((current) => current.map((item) => (item.id === sidewalk.id ? sidewalk : item)));
            }}
            onDeleteSidewalk={deleteSelectedSidewalk}
            onEntranceChange={(entrance) => {
              recordCurrent();
              const nextEntrance = {
                ...entrance,
                x: clamp(entrance.x, analysisBounds.minX, analysisBounds.maxX),
                y: clamp(entrance.y, analysisBounds.minY, analysisBounds.maxY),
              };
              setEntrances((current) => current.map((item) => (item.id === entrance.id ? nextEntrance : item)));
            }}
            onDeleteEntrance={deleteSelectedEntrance}
          />
        )}
      </section>
      <ConceptPlanGallery
        exports={conceptPlanExports}
        isOpen={isConceptGalleryOpen}
        preview={previewedConceptPlan}
        onClose={() => setIsConceptGalleryOpen(false)}
        onPreview={setPreviewedConceptPlan}
        onRename={renameConceptPlan}
        onDelete={removeConceptPlan}
        onRender={renderConceptPlan}
      />
      {treeDiameterDialogId ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => setTreeDiameterDialogId(undefined)}
        >
          <form
            className="saveLayoutDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tree-diameter-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveTreeDiameter();
            }}
          >
            <h2 id="tree-diameter-title">Tree Diameter (m)</h2>
            <label>
              <span>Tree Diameter (m)</span>
              <input
                autoFocus
                type="number"
                min="0.1"
                step="0.1"
                value={treeDiameterDraft}
                onChange={(event) => setTreeDiameterDraft(event.target.value)}
              />
            </label>
            <div className="dialogActions">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => setTreeDiameterDialogId(undefined)}
              >
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      ) : null}
      {projectDialogMode ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setProjectDialogMode(undefined)}>
          <form
            className="saveLayoutDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-layout-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              confirmProjectDialog();
            }}
          >
            <h2 id="save-layout-title">
              {projectDialogMode === "save" ? "Save Layout Name" : "Rename Project"}
            </h2>
            <label>
              <span>Project Name</span>
              <input
                autoFocus
                type="text"
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.target.value)}
              />
            </label>
            <div className="dialogActions">
              <button type="submit">Save</button>
              <button className="secondaryButton" type="button" onClick={() => setProjectDialogMode(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function readBackgroundMeta(): PdfBackgroundMeta | undefined {
  const raw = sessionStorage.getItem("siteBackgroundMeta");
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as PdfBackgroundMeta;
  } catch {
    return undefined;
  }
}

function cloneBuildings(buildings: Building[]) {
  return buildings.map((building) => ({ ...building, programs: building.programs.map((program) => ({ ...program })) }));
}

function cloneSiteLabels(siteLabels: SiteLabel[]) {
  return siteLabels.map((label) => ({ ...label }));
}

function cloneTrees(trees: Tree[]) {
  return trees.map((tree) => ({ ...tree }));
}

function cloneSidewalks(sidewalks: Sidewalk[]) {
  return sidewalks.map((sidewalk) => ({ ...sidewalk }));
}

function cloneEntrances(entrances: Entrance[]) {
  return entrances.map((entrance) => ({ ...entrance }));
}

function parseEntranceLabel(value: string): EntranceLabel | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "main entrance") return "Main Entrance";
  if (normalized === "side entrance") return "Side Entrance";
  if (normalized === "service entrance") return "Service Entrance";
  if (normalized === "emergency exit") return "Emergency Exit";
  return undefined;
}

function getEntrancePlacement(building: Building, localX: number, localY: number) {
  const x = Math.max(0, Math.min(building.length, localX));
  const y = Math.max(0, Math.min(building.width, localY));
  const distances = [
    { edge: "top" as const, distance: Math.abs(y) },
    { edge: "right" as const, distance: Math.abs(building.length - x) },
    { edge: "bottom" as const, distance: Math.abs(building.width - y) },
    { edge: "left" as const, distance: Math.abs(x) },
  ];
  const nearest = distances.reduce((current, item) => (item.distance < current.distance ? item : current));
  const edgePoint =
    nearest.edge === "top"
      ? { x, y: 0, inwardRotation: 180 }
      : nearest.edge === "right"
        ? { x: building.length, y, inwardRotation: 270 }
        : nearest.edge === "bottom"
          ? { x, y: building.width, inwardRotation: 0 }
          : { x: 0, y, inwardRotation: 90 };
  const radians = (building.rotation * Math.PI) / 180;

  return {
    x: building.x + edgePoint.x * Math.cos(radians) - edgePoint.y * Math.sin(radians),
    y: building.y + edgePoint.x * Math.sin(radians) + edgePoint.y * Math.cos(radians),
    rotation: snapCardinalAngle(building.rotation + edgePoint.inwardRotation),
  };
}

function moveEntranceWithBuilding(entrance: Entrance, previous: Building, next: Building): Entrance {
  const previousRadians = (previous.rotation * Math.PI) / 180;
  const dx = entrance.x - previous.x;
  const dy = entrance.y - previous.y;
  const previousLocalX = dx * Math.cos(previousRadians) + dy * Math.sin(previousRadians);
  const previousLocalY = -dx * Math.sin(previousRadians) + dy * Math.cos(previousRadians);
  const normalizedX = previous.length ? previousLocalX / previous.length : 0;
  const normalizedY = previous.width ? previousLocalY / previous.width : 0;
  const nextLocalX = normalizedX * next.length;
  const nextLocalY = normalizedY * next.width;
  const nextRadians = (next.rotation * Math.PI) / 180;

  return {
    ...entrance,
    x: next.x + nextLocalX * Math.cos(nextRadians) - nextLocalY * Math.sin(nextRadians),
    y: next.y + nextLocalX * Math.sin(nextRadians) + nextLocalY * Math.cos(nextRadians),
    rotation: snapCardinalAngle(entrance.rotation + next.rotation - previous.rotation),
  };
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function snapCardinalAngle(value: number) {
  return Math.round(normalizeAngle(value) / 90) * 90 % 360;
}

function clampAnalysisCoordinate(value: number, min: number, max: number, padding: number) {
  const effectivePadding = Math.min(padding, (max - min) / 2);
  return clamp(value, min + effectivePadding, max - effectivePadding);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readSiteData(): SiteData {
  const raw = sessionStorage.getItem("siteData");
  if (!raw) return defaultSiteData;

  try {
    return JSON.parse(raw) as SiteData;
  } catch {
    return defaultSiteData;
  }
}

function createDefaultBackgroundMeta(site: SiteDimensions): PdfBackgroundMeta {
  return {
    page: { width: site.width, height: site.length },
    crop: { x: 0, y: 0, width: site.width, height: site.length },
    siteBoundary: { x: 0, y: 0, width: site.width, height: site.length },
    contextZones: [],
    roads: [],
    ancillaryBuildings: [],
    existingBuildings: [],
    existingTrees: [],
  };
}

function getEditorAnalysisBounds(backgroundMeta: PdfBackgroundMeta | undefined, site: SiteDimensions) {
  const crop = backgroundMeta?.crop;
  const boundary = backgroundMeta?.siteBoundary;
  if (!crop || !boundary || boundary.width <= 0 || boundary.height <= 0) {
    return { minX: 0, maxX: site.width, minY: 0, maxY: site.length };
  }

  return {
    minX: -(boundary.x / boundary.width) * site.width,
    maxX: ((crop.width - boundary.x) / boundary.width) * site.width,
    minY: -(boundary.y / boundary.height) * site.length,
    maxY: ((crop.height - boundary.y) / boundary.height) * site.length,
  };
}

function getLayoutSiteVertices(backgroundMeta: PdfBackgroundMeta | undefined, site: SiteDimensions) {
  const boundary = backgroundMeta?.siteBoundary;
  if (!boundary?.polygon?.length || !boundary.width || !boundary.height) return [];

  return boundary.polygon.map((point) => ({
    x: ((point.x - boundary.x) / boundary.width) * site.width,
    y: ((point.y - boundary.y) / boundary.height) * site.length,
  }));
}

function getBackgroundPolygonVertices(
  vertices: Array<{ x: number; y: number }>,
  boundary: PdfBackgroundMeta["siteBoundary"],
  site: SiteDimensions,
) {
  return vertices.map((point) => ({
    x: boundary.x + (point.x / site.width) * boundary.width,
    y: boundary.y + (point.y / site.length) * boundary.height,
  }));
}
