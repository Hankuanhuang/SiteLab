import type {
  AncillaryBuilding,
  Building,
  BuildingColor,
  Entrance,
  EntranceLabelPosition,
  ExistingBuilding,
  PdfBackgroundView,
  ProjectSite,
  Sidewalk,
  SiteLabel,
  SetupRoad,
  Tree,
} from "../types/layout";
import { DEFAULT_BUILDING_LABEL_FONT_SIZE, isCoreBuilding } from "../models/Building";
import { isBuildingOrientationSnappedElement, snapCoreRotation } from "../utils/coreRotation";
import { getToiletStallCount } from "../utils/toiletLayout";

const buildingColors: Array<{ name: string; value: BuildingColor }> = [
  { name: "Light Gray", value: "#d1d5db" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Lime", value: "#84cc16" },
  { name: "Blue", value: "#2563eb" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Purple", value: "#9333ea" },
  { name: "Bridge Brown", value: "#c9a46a" },
  { name: "Pink", value: "#ec4899" },
  { name: "Gray", value: "#6b7280" },
];

interface PropertyPanelProps {
  selectedBuilding?: Building;
  selectedProjectSite?: ProjectSite;
  selectedSiteLabel?: SiteLabel;
  selectedTree?: Tree;
  selectedSidewalk?: Sidewalk;
  selectedEntrance?: Entrance;
  selectedRoad?: SetupRoad;
  selectedAncillaryBuilding?: AncillaryBuilding;
  selectedExistingBuilding?: ExistingBuilding;
  isTreeToolActive: boolean;
  isSidewalkToolActive: boolean;
  isEntranceToolActive: boolean;
  hasBackground: boolean;
  hasFullPageBackground: boolean;
  backgroundView: PdfBackgroundView;
  backgroundOpacity: number;
  showBackground: boolean;
  showBoundaryDistanceLines: boolean;
  showBuildingDimensions: boolean;
  coreRotationSnapBase: number;
  onBackgroundViewChange: (view: PdfBackgroundView) => void;
  onBackgroundOpacityChange: (opacity: number) => void;
  onShowBackgroundChange: (isVisible: boolean) => void;
  onShowBoundaryDistanceLinesChange: (isVisible: boolean) => void;
  onShowBuildingDimensionsChange: (isVisible: boolean) => void;
  onProjectSiteChange: (projectSite: ProjectSite) => void;
  onBuildingChange: (building: Building) => void;
  onDeleteBuilding: () => void;
  onSiteLabelChange: (label: SiteLabel) => void;
  onDeleteSiteLabel: () => void;
  onTreeChange: (tree: Tree) => void;
  onDeleteTree: () => void;
  onSidewalkChange: (sidewalk: Sidewalk) => void;
  onDeleteSidewalk: () => void;
  onEntranceChange: (entrance: Entrance) => void;
  onDeleteEntrance: () => void;
  onRoadChange: (road: SetupRoad) => void;
  onAncillaryBuildingChange: (building: AncillaryBuilding) => void;
  onExistingBuildingChange: (building: ExistingBuilding) => void;
}

export function PropertyPanel({
  selectedBuilding,
  selectedProjectSite,
  selectedSiteLabel,
  selectedTree,
  selectedSidewalk,
  selectedEntrance,
  selectedRoad,
  selectedAncillaryBuilding,
  selectedExistingBuilding,
  isTreeToolActive,
  isSidewalkToolActive,
  isEntranceToolActive,
  hasBackground,
  hasFullPageBackground,
  backgroundView,
  backgroundOpacity,
  showBackground,
  showBoundaryDistanceLines,
  showBuildingDimensions,
  coreRotationSnapBase,
  onBackgroundViewChange,
  onBackgroundOpacityChange,
  onShowBackgroundChange,
  onShowBoundaryDistanceLinesChange,
  onShowBuildingDimensionsChange,
  onProjectSiteChange,
  onBuildingChange,
  onDeleteBuilding,
  onSiteLabelChange,
  onDeleteSiteLabel,
  onTreeChange,
  onDeleteTree,
  onSidewalkChange,
  onDeleteSidewalk,
  onEntranceChange,
  onDeleteEntrance,
  onRoadChange,
  onAncillaryBuildingChange,
  onExistingBuildingChange,
}: PropertyPanelProps) {
  const buildingIsCore = selectedBuilding ? isCoreBuilding(selectedBuilding) : false;
  const buildingUsesOrientationSnap = selectedBuilding ? isBuildingOrientationSnappedElement(selectedBuilding) : false;
  const activeSectionClass = isTreeToolActive || selectedTree
    ? "activeTreeSection"
    : selectedRoad
      ? "activeRoadSection"
      : selectedAncillaryBuilding
        ? "activeAncillaryBuildingSection"
        : selectedExistingBuilding
          ? "activeExistingBuildingSection"
          : selectedProjectSite
            ? "activeSiteBoundarySection"
            : isSidewalkToolActive || selectedSidewalk
              ? "activeSidewalkSection"
              : isEntranceToolActive || selectedEntrance
                ? "activeEntranceSection"
                : selectedSiteLabel
                  ? "activeSiteLabelSection"
                  : selectedBuilding
                    ? "activeBuildingSection"
                    : "activeBackgroundSection";

  return (
    <aside className={`propertyPanel ${activeSectionClass}`} onWheel={(event) => event.stopPropagation()}>
      <section className="backgroundSection">
        <label>
          <span>PDF Background Opacity ({Math.round(backgroundOpacity * 100)}%)</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={backgroundOpacity}
            onChange={(event) => onBackgroundOpacityChange(Number(event.target.value))}
          />
        </label>
        <label className="inlineToggle">
          <input
            type="checkbox"
            checked={showBackground}
            disabled={!hasBackground}
            onChange={(event) => onShowBackgroundChange(event.target.checked)}
          />
          <span>Show PDF Background</span>
        </label>
        {hasFullPageBackground ? (
          <div className="backgroundViewControls">
            <button
              className={backgroundView === "crop" ? "" : "secondaryButton"}
              type="button"
              onClick={() => onBackgroundViewChange("crop")}
            >
              Cropped Site View
            </button>
            <button
              className={backgroundView === "full" ? "" : "secondaryButton"}
              type="button"
              onClick={() => onBackgroundViewChange("full")}
            >
              Full PDF Page View
            </button>
          </div>
        ) : null}
      </section>

      <section className="dimensionsSection">
        <p className="eyebrow">Dimensions</p>
        <label className="inlineToggle">
          <input
            type="checkbox"
            checked={showBoundaryDistanceLines}
            onChange={(event) => onShowBoundaryDistanceLinesChange(event.target.checked)}
          />
          <span>Show Boundary Distance Lines</span>
        </label>
        <label className="inlineToggle">
          <input
            type="checkbox"
            checked={showBuildingDimensions}
            onChange={(event) => onShowBuildingDimensionsChange(event.target.checked)}
          />
          <span>Show Building Dimensions</span>
        </label>
      </section>

      <section className="roadSection">
        <p className="eyebrow">Site Boundary</p>
        {selectedProjectSite ? (
          <div className="buildingFields">
            <label>
              <span>Site Name</span>
              <input
                type="text"
                value={selectedProjectSite.name}
                onChange={(event) =>
                  onProjectSiteChange({
                    ...selectedProjectSite,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Length (m)</span>
              <output className="propertyValue">{round(selectedProjectSite.length)}</output>
            </label>
            <label>
              <span>Width (m)</span>
              <output className="propertyValue">{round(selectedProjectSite.width)}</output>
            </label>
            <label>
              <span>Area (m²)</span>
              <output className="propertyValue">{round(selectedProjectSite.length * selectedProjectSite.width)}</output>
            </label>
          </div>
        ) : (
          <p className="muted">Select a site boundary to view its properties.</p>
        )}
      </section>

      <section className="roadSection">
        <p className="eyebrow">Road Label</p>
        {selectedRoad ? (
          <div className="buildingFields">
            <p className="muted">{getRoadDisplayLabel(selectedRoad)}</p>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedRoad.labelFontSize ?? 13}
                onChange={(event) =>
                  onRoadChange({
                    ...selectedRoad,
                    labelFontSize: clampFontSize(event.target.value, selectedRoad.labelFontSize ?? 13),
                  })
                }
              />
            </label>
          </div>
        ) : (
          <p className="muted">Click a road label to edit its font size.</p>
        )}
      </section>

      <section className="ancillaryBuildingSection">
        <p className="eyebrow">Ancillary Building Label</p>
        {selectedAncillaryBuilding ? (
          <div className="buildingFields">
            <label>
              <span>Label Text</span>
              <input
                type="text"
                value={selectedAncillaryBuilding.label}
                onChange={(event) =>
                  onAncillaryBuildingChange({ ...selectedAncillaryBuilding, label: event.target.value })
                }
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedAncillaryBuilding.labelFontSize ?? 13}
                onChange={(event) =>
                  onAncillaryBuildingChange({
                    ...selectedAncillaryBuilding,
                    labelFontSize: clampFontSize(event.target.value, selectedAncillaryBuilding.labelFontSize ?? 13),
                  })
                }
              />
            </label>
          </div>
        ) : (
          <p className="muted">Click an ancillary building label to edit its font size.</p>
        )}
      </section>

      <section className="existingBuildingSection">
        <p className="eyebrow">Existing Building Label</p>
        {selectedExistingBuilding ? (
          <div className="buildingFields">
            <label>
              <span>Label Text</span>
              <textarea
                rows={3}
                value={selectedExistingBuilding.label}
                onChange={(event) =>
                  onExistingBuildingChange({ ...selectedExistingBuilding, label: event.target.value })
                }
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedExistingBuilding.labelFontSize ?? 13}
                onChange={(event) =>
                  onExistingBuildingChange({
                    ...selectedExistingBuilding,
                    labelFontSize: clampFontSize(event.target.value, selectedExistingBuilding.labelFontSize ?? 13),
                  })
                }
              />
            </label>
          </div>
        ) : (
          <p className="muted">Click an existing building label to edit its font size.</p>
        )}
      </section>

      <section className="entranceSection">
        <p className="eyebrow">Entrance Label</p>
        {selectedEntrance ? (
          <div className="buildingFields">
            <label>
              <span>Label Text</span>
              <input
                type="text"
                value={selectedEntrance.label}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    label: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedEntrance.labelFontSize ?? 13}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    labelFontSize: clampFontSize(event.target.value, selectedEntrance.labelFontSize ?? 13),
                  })
                }
              />
            </label>
            <label>
              <span>Arrow Direction</span>
              <select
                value={getCardinalRotation(selectedEntrance.rotation)}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    rotation: Number(event.target.value),
                  })
                }
              >
                <option value="0">North</option>
                <option value="90">East</option>
                <option value="180">South</option>
                <option value="270">West</option>
              </select>
            </label>
            <label>
              <span>Label Position</span>
              <select
                value={selectedEntrance.labelPosition}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    labelPosition: event.target.value as EntranceLabelPosition,
                  })
                }
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              <span>X (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedEntrance.x.toFixed(1)}
                onChange={(event) =>
                  onEntranceChange({ ...selectedEntrance, x: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              <span>Y (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedEntrance.y.toFixed(1)}
                onChange={(event) =>
                  onEntranceChange({ ...selectedEntrance, y: Number(event.target.value) || 0 })
                }
              />
            </label>
            <button className="dangerButton" type="button" onClick={onDeleteEntrance}>
              Remove Entrance
            </button>
          </div>
        ) : (
          <p className="muted">Select an entrance to edit it.</p>
        )}
      </section>

      <section className="sidewalkSection">
        <p className="eyebrow">Sidewalk</p>
        {selectedSidewalk ? (
          <div className="buildingFields">
            <label>
              <span>Label</span>
              <input
                type="text"
                value={selectedSidewalk.label}
                onChange={(event) => onSidewalkChange({ ...selectedSidewalk, label: event.target.value })}
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedSidewalk.labelFontSize ?? 14}
                onChange={(event) =>
                  onSidewalkChange({
                    ...selectedSidewalk,
                    labelFontSize: clampFontSize(event.target.value, selectedSidewalk.labelFontSize ?? 14),
                  })
                }
              />
            </label>
            <p className="muted">Boundary segment {selectedSidewalk.edgeIndex + 1}</p>
            <label>
              <span>Width (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={selectedSidewalk.width.toFixed(1)}
                onChange={(event) =>
                  onSidewalkChange({
                    ...selectedSidewalk,
                    width: Math.max(0.1, Number(event.target.value) || 0.1),
                  })
                }
              />
            </label>
            <button className="dangerButton" type="button" onClick={onDeleteSidewalk}>
              Remove Sidewalk
            </button>
          </div>
        ) : (
          <p className="muted">Select a sidewalk to edit it.</p>
        )}
      </section>

      <section className="treeSection">
        <p className="eyebrow">Tree</p>
        {selectedTree ? (
          <div className="buildingFields">
            <label>
              <span>Tree Diameter (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={(selectedTree.radius * 2).toFixed(1)}
                onChange={(event) =>
                  onTreeChange({
                    ...selectedTree,
                    radius: Math.max(0.05, (Number(event.target.value) || 0.1) / 2),
                  })
                }
              />
            </label>
            <label>
              <span>X (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedTree.x.toFixed(1)}
                onChange={(event) => onTreeChange({ ...selectedTree, x: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              <span>Y (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedTree.y.toFixed(1)}
                onChange={(event) => onTreeChange({ ...selectedTree, y: Number(event.target.value) || 0 })}
              />
            </label>
            <button className="dangerButton" type="button" onClick={onDeleteTree}>
              Remove Tree
            </button>
          </div>
        ) : (
          <p className="muted">Select a tree to edit its size.</p>
        )}
      </section>

      <section className="siteLabelSection">
        <p className="eyebrow">Site Label</p>
        {selectedSiteLabel ? (
          <div className="buildingFields">
            <label>
              <span>Label Text</span>
              <input
                type="text"
                value={selectedSiteLabel.text}
                onChange={(event) => onSiteLabelChange({ ...selectedSiteLabel, text: event.target.value })}
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedSiteLabel.fontSize ?? 18}
                onChange={(event) =>
                  onSiteLabelChange({
                    ...selectedSiteLabel,
                    fontSize: clampFontSize(event.target.value, selectedSiteLabel.fontSize ?? 18),
                  })
                }
              />
            </label>
            <label>
              <span>X (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedSiteLabel.x.toFixed(1)}
                onChange={(event) =>
                  onSiteLabelChange({ ...selectedSiteLabel, x: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label>
              <span>Y (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={selectedSiteLabel.y.toFixed(1)}
                onChange={(event) =>
                  onSiteLabelChange({ ...selectedSiteLabel, y: Number(event.target.value) || 0 })
                }
              />
            </label>
            <button className="dangerButton" type="button" onClick={onDeleteSiteLabel}>
              Remove Site Label
            </button>
          </div>
        ) : (
          <p className="muted">Select a site label to edit it.</p>
        )}
      </section>

      <section className="buildingSection">
        <p className="eyebrow">{buildingIsCore ? "Core" : "Building"}</p>
        {selectedBuilding ? (
          <div className="buildingFields">
            <label>
              <span>Label Text</span>
              <input
                type="text"
                value={selectedBuilding.label}
                onChange={(event) => onBuildingChange({ ...selectedBuilding, label: event.target.value })}
              />
            </label>
            <label>
              <span>Font Size</span>
              <input
                type="number"
                min="8"
                step="1"
                value={selectedBuilding.labelFontSize ?? DEFAULT_BUILDING_LABEL_FONT_SIZE}
                onChange={(event) =>
                  onBuildingChange({
                    ...selectedBuilding,
                    labelFontSize: clampFontSize(
                      event.target.value,
                      selectedBuilding.labelFontSize ?? DEFAULT_BUILDING_LABEL_FONT_SIZE,
                    ),
                  })
                }
              />
            </label>
            <div className="colorSection">
              <span className="fieldLabel">Color</span>
              <div className="colorSwatches" role="group" aria-label="Building color">
                {buildingColors.map((color) => (
                  <button
                    key={color.value}
                    className={`colorSwatch ${selectedBuilding.color === color.value ? "selected" : ""}`}
                    type="button"
                    title={color.name}
                    aria-label={color.name}
                    aria-pressed={selectedBuilding.color === color.value}
                    style={{ backgroundColor: color.value }}
                    onClick={() => onBuildingChange({ ...selectedBuilding, color: color.value })}
                  />
                ))}
              </div>
              <output className="selectedColor">
                {buildingColors.find((color) => color.value === selectedBuilding.color)?.name ?? selectedBuilding.color}
              </output>
            </div>
            <label>
              <span>{buildingIsCore ? "Width (m)" : "Length (m)"}</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={selectedBuilding.length.toFixed(1)}
                onChange={(event) => {
                  const nextLength = Number(event.target.value) || 1;
                  onBuildingChange({
                    ...selectedBuilding,
                    length: nextLength,
                    width: selectedBuilding.type === "square" ? nextLength : selectedBuilding.width,
                  });
                }}
              />
            </label>
            <label>
              <span>{buildingIsCore ? "Height (m)" : "Width (m)"}</span>
              <input
                type="number"
                min="1"
                step="0.1"
                value={selectedBuilding.width.toFixed(1)}
                onChange={(event) => {
                  const nextHeight = Number(event.target.value) || 1;
                  onBuildingChange({
                    ...selectedBuilding,
                    length: selectedBuilding.type === "square" ? nextHeight : selectedBuilding.length,
                    width: nextHeight,
                  });
                }}
              />
            </label>
            <label>
              <span>Area (m²)</span>
              <output className="propertyValue">{round(selectedBuilding.length * selectedBuilding.width)}</output>
            </label>
            {selectedBuilding.type === "toilet" ? (
              <label>
                <span>WC Stall Count</span>
                <output className="propertyValue">{getToiletStallCount(selectedBuilding.length)}</output>
              </label>
            ) : null}
            <label>
              <span>Rotation ({formatRotation(selectedBuilding.rotation)} deg)</span>
              <input
                type="number"
                min="0"
                max="359.9"
                step="0.1"
                value={formatRotation(selectedBuilding.rotation)}
                onChange={(event) => {
                  const rotation = normalizeRotation(Number(event.target.value) || 0);
                  onBuildingChange({
                    ...selectedBuilding,
                    rotation:
                      buildingUsesOrientationSnap && selectedBuilding.snapToBuildingOrientation !== false
                        ? snapCoreRotation(rotation, coreRotationSnapBase)
                        : rotation,
                  });
                }}
              />
            </label>
            {buildingUsesOrientationSnap ? (
              <label className="inlineToggle">
                <input
                  type="checkbox"
                  checked={selectedBuilding.snapToBuildingOrientation !== false}
                  onChange={(event) => {
                    const snapToBuildingOrientation = event.target.checked;
                    onBuildingChange({
                      ...selectedBuilding,
                      snapToBuildingOrientation,
                      rotation: snapToBuildingOrientation
                        ? snapCoreRotation(selectedBuilding.rotation, coreRotationSnapBase)
                        : selectedBuilding.rotation,
                    });
                  }}
                />
                <span>Snap To Building Orientation</span>
              </label>
            ) : null}
            <label>
              <span>X (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={round(selectedBuilding.x)}
                onChange={(event) => onBuildingChange({ ...selectedBuilding, x: Number(event.target.value) || 0 })}
              />
            </label>
            <label>
              <span>Y (m)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={round(selectedBuilding.y)}
                onChange={(event) => onBuildingChange({ ...selectedBuilding, y: Number(event.target.value) || 0 })}
              />
            </label>
            {!buildingIsCore ? (
              <div className="programSection">
              <div className="sectionHeader">
                <span className="fieldLabel">Program Spaces</span>
                <button
                  className="secondaryButton compactButton"
                  type="button"
                  onClick={() =>
                    onBuildingChange({
                      ...selectedBuilding,
                      programs: [...selectedBuilding.programs, { name: "New Space", area: 0 }],
                    })
                  }
                >
                  Add space
                </button>
              </div>
              {selectedBuilding.programs.length ? (
                <div className="programRows">
                  {selectedBuilding.programs.map((program, index) => (
                    <div className="programRow" key={index}>
                      <label>
                        <span>Name</span>
                        <input
                          type="text"
                          value={program.name}
                          onChange={(event) =>
                            onBuildingChange({
                              ...selectedBuilding,
                              programs: selectedBuilding.programs.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: event.target.value } : item,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Area (m²)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={program.area.toFixed(1)}
                          onChange={(event) =>
                            onBuildingChange({
                              ...selectedBuilding,
                              programs: selectedBuilding.programs.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, area: Number(event.target.value) || 0 } : item,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        className="dangerButton compactButton"
                        type="button"
                        onClick={() =>
                          onBuildingChange({
                            ...selectedBuilding,
                            programs: selectedBuilding.programs.filter((_, itemIndex) => itemIndex !== index),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No program spaces added.</p>
              )}
              </div>
            ) : null}
            <button className="dangerButton" type="button" onClick={onDeleteBuilding}>
              Remove {buildingIsCore ? "Core" : "Building"}
            </button>
          </div>
        ) : (
          <p className="muted">Select a building or core to view properties</p>
        )}
      </section>
    </aside>
  );
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeRotation(value: number) {
  return ((value % 360) + 360) % 360;
}

function formatRotation(value: number) {
  return Math.round(normalizeRotation(value) * 10) / 10;
}

function getCardinalRotation(value: number) {
  return Math.round(normalizeRotation(value) / 90) * 90 % 360;
}

function clampFontSize(value: string, fallback: number) {
  return Math.max(8, Number(value) || fallback);
}

function getRoadDisplayLabel(road: SetupRoad) {
  if (road.type === "primary") return `Primary Road (${formatDistance(road.width)}m)`;
  if (road.type === "secondary") return `Secondary Road (${formatDistance(road.width)}m)`;
  return `Pedestrian Pathway (${formatDistance(road.width)}m)`;
}

function formatDistance(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
