import type {
  Building,
  BuildingColor,
  Entrance,
  EntranceLabel,
  PdfBackgroundView,
  Sidewalk,
  SidewalkEdge,
  SiteDimensions,
  SiteLabel,
  Tree,
} from "../types/layout";

const buildingColors: Array<{ name: string; value: BuildingColor }> = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Lime", value: "#84cc16" },
  { name: "Blue", value: "#2563eb" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Purple", value: "#9333ea" },
  { name: "Pink", value: "#ec4899" },
  { name: "Gray", value: "#6b7280" },
];

interface PropertyPanelProps {
  site: SiteDimensions;
  selectedBuilding?: Building;
  selectedSiteLabel?: SiteLabel;
  selectedTree?: Tree;
  selectedSidewalk?: Sidewalk;
  selectedEntrance?: Entrance;
  hasBackground: boolean;
  hasFullPageBackground: boolean;
  backgroundView: PdfBackgroundView;
  backgroundOpacity: number;
  showBackground: boolean;
  showDistanceLines: boolean;
  onSiteChange: (site: SiteDimensions) => void;
  onBackgroundImageChange: (src?: string) => void;
  onBackgroundViewChange: (view: PdfBackgroundView) => void;
  onBackgroundOpacityChange: (opacity: number) => void;
  onShowBackgroundChange: (isVisible: boolean) => void;
  onShowDistanceLinesChange: (isVisible: boolean) => void;
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
}

export function PropertyPanel({
  site,
  selectedBuilding,
  selectedSiteLabel,
  selectedTree,
  selectedSidewalk,
  selectedEntrance,
  hasBackground,
  hasFullPageBackground,
  backgroundView,
  backgroundOpacity,
  showBackground,
  showDistanceLines,
  onSiteChange,
  onBackgroundImageChange,
  onBackgroundViewChange,
  onBackgroundOpacityChange,
  onShowBackgroundChange,
  onShowDistanceLinesChange,
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
}: PropertyPanelProps) {
  const handleBackgroundUpload = (file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onBackgroundImageChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <aside className="propertyPanel">
      <section>
        <p className="eyebrow">Site</p>
        <label>
          <span>Site Length (m)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={site.length.toFixed(1)}
            onChange={(event) => onSiteChange({ ...site, length: Number(event.target.value) || 1 })}
          />
        </label>
        <label>
          <span>Site Width (m)</span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={site.width.toFixed(1)}
            onChange={(event) => onSiteChange({ ...site, width: Number(event.target.value) || 1 })}
          />
        </label>
        <label>
          <span>Canvas Background Image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => handleBackgroundUpload(event.target.files?.[0])}
          />
        </label>
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
        <button className="secondaryButton" type="button" onClick={() => onBackgroundImageChange(undefined)}>
          Remove Background
        </button>
      </section>

      <section>
        <p className="eyebrow">Dimensions</p>
        <label className="inlineToggle">
          <input
            type="checkbox"
            checked={showDistanceLines}
            onChange={(event) => onShowDistanceLinesChange(event.target.checked)}
          />
          <span>Show Distance Lines</span>
        </label>
      </section>

      <section>
        <p className="eyebrow">Entrance</p>
        {selectedEntrance ? (
          <div className="buildingFields">
            <label>
              <span>Entrance Type</span>
              <select
                value={selectedEntrance.label}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    label: event.target.value as EntranceLabel,
                  })
                }
              >
                <option value="Main Entrance">Main Entrance</option>
                <option value="Side Entrance">Side Entrance</option>
                <option value="Service Entrance">Service Entrance</option>
                <option value="Emergency Exit">Emergency Exit</option>
              </select>
            </label>
            <label>
              <span>Rotation (deg)</span>
              <input
                type="number"
                step="1"
                value={formatRotation(selectedEntrance.rotation)}
                onChange={(event) =>
                  onEntranceChange({
                    ...selectedEntrance,
                    rotation: normalizeRotation(Number(event.target.value) || 0),
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

      <section>
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
              <span>Boundary Edge</span>
              <select
                value={selectedSidewalk.edge}
                onChange={(event) =>
                  onSidewalkChange({
                    ...selectedSidewalk,
                    edge: event.target.value as SidewalkEdge,
                  })
                }
              >
                <option value="top">Top Edge</option>
                <option value="bottom">Bottom Edge</option>
                <option value="left">Left Edge</option>
                <option value="right">Right Edge</option>
              </select>
            </label>
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

      <section>
        <p className="eyebrow">Tree</p>
        {selectedTree ? (
          <div className="buildingFields">
            <label>
              <span>Tree Size (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={selectedTree.radius.toFixed(1)}
                onChange={(event) =>
                  onTreeChange({ ...selectedTree, radius: Math.max(0.1, Number(event.target.value) || 0.1) })
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

      <section>
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

      <section>
        <p className="eyebrow">Building</p>
        {selectedBuilding ? (
          <div className="buildingFields">
            <label>
              <span>Label</span>
              <input
                type="text"
                value={selectedBuilding.label}
                onChange={(event) => onBuildingChange({ ...selectedBuilding, label: event.target.value })}
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
              <span>Length (m)</span>
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
              <span>Width (m)</span>
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
            <label>
              <span>Rotation ({formatRotation(selectedBuilding.rotation)} deg)</span>
              <input
                type="number"
                min="0"
                max="359.9"
                step="0.1"
                value={formatRotation(selectedBuilding.rotation)}
                onChange={(event) =>
                  onBuildingChange({
                    ...selectedBuilding,
                    rotation: normalizeRotation(Number(event.target.value) || 0),
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
            <button className="dangerButton" type="button" onClick={onDeleteBuilding}>
              Remove Building
            </button>
          </div>
        ) : (
          <p className="muted">Select a building to view properties</p>
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
