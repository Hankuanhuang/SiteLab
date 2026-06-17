import { useEffect, useRef, useState } from "react";
import { coreToolGroups } from "../models/Building";

interface ToolbarProps {
  onAddRectangle: () => void;
  onAddCore: (coreId: string) => void;
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
  onAddCore,
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
  onToggleSidebar,
  isSidebarCollapsed,
  onSaveLayout,
  onLoadLayout,
  onExportConceptSitePlan,
  onOpenConceptPlanGallery,
  conceptPlanExportCount,
}: ToolbarProps) {
  const loadInputRef = useRef<HTMLInputElement>(null);
  const coreMenuRef = useRef<HTMLDivElement>(null);
  const [activeCoreGroupId, setActiveCoreGroupId] = useState<"stair" | "elevator">();

  useEffect(() => {
    if (!activeCoreGroupId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!coreMenuRef.current?.contains(event.target as Node)) {
        setActiveCoreGroupId(undefined);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCoreGroupId(undefined);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCoreGroupId]);

  return (
    <div className="toolbar">
      <button type="button" onClick={onAddRectangle}>
        + Building
      </button>
      <div className="toolbarMenu" ref={coreMenuRef}>
        <button
          className={`createToolButton ${activeCoreGroupId ? "active" : ""}`}
          type="button"
          onClick={() => setActiveCoreGroupId((current) => (current ? undefined : "stair"))}
        >
          + Core
        </button>
        {activeCoreGroupId ? (
          <div className="toolbarMenuPopup" onMouseDown={(event) => event.stopPropagation()}>
            <div className="toolbarMenuRoot">
              {coreToolGroups.map((group) => (
                <button
                  key={group.id}
                  className={group.id === activeCoreGroupId ? "active" : ""}
                  type="button"
                  onClick={() => setActiveCoreGroupId(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>
            <div className="toolbarMenuOptions">
              {coreToolGroups.find((group) => group.id === activeCoreGroupId)?.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onAddCore(option.id);
                    setActiveCoreGroupId(undefined);
                  }}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <button className="createToolButton" type="button" onClick={onAddSidewalk}>
        {isSidewalkToolActive ? "Sidewalk Tool Active" : "+ Sidewalk"}
      </button>
      <button type="button" onClick={onAddSiteLabel}>
        + Site Label
      </button>
      <button
        className="createToolButton"
        type="button"
        onClick={onAddEntrance}
      >
        {isEntranceToolActive ? "Entrance Tool Active" : "+ Entrance"}
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
      <button className="secondaryButton" type="button" disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
      <button className="secondaryButton" type="button" disabled={!canRedo} onClick={onRedo}>
        Redo
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
