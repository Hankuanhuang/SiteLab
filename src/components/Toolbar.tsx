import { useRef } from "react";

interface ToolbarProps {
  onAddRectangle: () => void;
  onAddSquare: () => void;
  onAddSiteLabel: () => void;
  onAddBridge: () => void;
  onAddToilet: () => void;
  isTreeToolActive: boolean;
  onToggleTreeTool: () => void;
  isSidewalkToolActive: boolean;
  onAddSidewalk: () => void;
  isEntranceToolActive: boolean;
  onAddEntrance: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showDistanceLines: boolean;
  onToggleDistanceLines: () => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  onSaveLayout: () => void;
  onLoadLayout: (file: File) => void;
  onExportConceptSitePlan: () => void;
  onOpenConceptPlanGallery: () => void;
  conceptPlanExportCount: number;
}

export function Toolbar({
  onAddRectangle,
  onAddSquare,
  onAddSiteLabel,
  onAddBridge,
  onAddToilet,
  isTreeToolActive,
  onToggleTreeTool,
  isSidewalkToolActive,
  onAddSidewalk,
  isEntranceToolActive,
  onAddEntrance,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showDistanceLines,
  onToggleDistanceLines,
  onToggleSidebar,
  isSidebarCollapsed,
  onSaveLayout,
  onLoadLayout,
  onExportConceptSitePlan,
  onOpenConceptPlanGallery,
  conceptPlanExportCount,
}: ToolbarProps) {
  const loadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar">
      <button type="button" onClick={onAddRectangle}>
        + Rectangle
      </button>
      <button type="button" onClick={onAddSquare}>
        + Square
      </button>
      <button type="button" onClick={onAddSiteLabel}>
        + Site Label
      </button>
      <button type="button" onClick={onAddBridge}>
        + Bridge
      </button>
      <button type="button" onClick={onAddToilet}>
        + Toilet
      </button>
      <button
        className="createToolButton"
        type="button"
        onClick={onToggleTreeTool}
      >
        {isTreeToolActive ? "Tree Tool Active" : "+ Tree"}
      </button>
      <button className="createToolButton" type="button" onClick={onAddSidewalk}>
        {isSidewalkToolActive ? "Sidewalk Tool Active" : "+ Sidewalk"}
      </button>
      <button
        className="createToolButton"
        type="button"
        onClick={onAddEntrance}
      >
        {isEntranceToolActive ? "Entrance Tool Active" : "+ Entrance"}
      </button>
      <button className="secondaryButton" type="button" disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
      <button className="secondaryButton" type="button" disabled={!canRedo} onClick={onRedo}>
        Redo
      </button>
      <button className="secondaryButton" type="button" onClick={onToggleDistanceLines}>
        {showDistanceLines ? "Hide Distance Lines" : "Show Distance Lines"}
      </button>
      <button className="secondaryButton" type="button" onClick={onToggleSidebar}>
        {isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
      </button>
      <button className="saveButton" type="button" onClick={onSaveLayout}>
        Save Layout
      </button>
      <button className="exportButton" type="button" onClick={onExportConceptSitePlan}>
        Export Concept Site Plan
      </button>
      <button className="secondaryButton" type="button" onClick={onOpenConceptPlanGallery}>
        Concept Plan Gallery ({conceptPlanExportCount})
      </button>
      <button className="loadButton" type="button" onClick={() => loadInputRef.current?.click()}>
        Load Layout
      </button>
      <input
        ref={loadInputRef}
        className="hiddenFileInput"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onLoadLayout(file);
        }}
      />
    </div>
  );
}
