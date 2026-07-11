# Feature: SiteLab and Site Layout Editor

## Goal

Provide a PDF-based site planning workflow that lets users:

1. Upload a site plan PDF.
2. Select the PDF page that contains the site plan.
3. Rotate the PDF page if needed.
4. Crop the useful site diagram area.
5. Select the buildable site boundary inside the crop.
6. Enter real site length and width.
7. Build a layout with draggable, resizable, rotatable, colored buildings.
8. Review dimensions, spacing, and context.
9. Export the final layout as `layout.json`.

The app also supports a sample-site path for testing without a PDF.

---

## Routes

```text
/              Site Boundary Selector
/site-setup    PDF upload, page selection, crop, and boundary setup
/site-editor   Layout Builder
```

---

## SiteLab Page

File:

```text
src/pages/SiteLab.tsx
```

The landing page presents two actions:

```text
Upload PDF
Use Sample Site
```

`Upload PDF` opens `/site-setup`.

`Use Sample Site` stores `defaultSiteData`, clears any PDF background session data, and opens `/site-editor`.

Session keys cleared for sample mode:

```text
siteBackgroundImage
siteFullPageImage
siteBackgroundMeta
```

---

## PDF Site Setup

File:

```text
src/pages/PdfSiteSetup.tsx
```

Uses PDF.js:

```text
pdfjs-dist
```

### PDF Upload

User uploads a PDF file.

The app:

1. Reads the file as an ArrayBuffer.
2. Loads it with PDF.js.
3. Shows available pages.
4. Renders the selected page to a canvas.

### Page Selection

The user can choose which PDF page contains the site plan.

### Rotation

The user can rotate the selected page:

```text
Rotate Left
Rotate Right
```

Rotation is applied before crop and boundary selection.

### Crop Site Image Mode

After selecting a PDF page, the user selects:

```text
Crop Site Image
```

The user draws a rectangle around the useful site diagram and surrounding context.

Purpose:

* Remove unnecessary exam text or unrelated PDF content.
* Keep the site diagram, roads, entrances, neighboring context, and nearby buildings.

The cropped image is saved as:

```text
sessionStorage.siteBackgroundImage
```

### Select Site Boundary Mode

The user switches to:

```text
Select Site Boundary
```

The user draws the actual buildable site boundary inside the crop area.

Boundary coordinates are stored relative to the cropped image.

### Site Size

The user enters:

```text
Site Length (m)
Site Width (m)
```

Displayed values use one decimal place.

Internal numeric precision is preserved.

### Stored Setup Data

The setup page stores:

```text
siteData
siteBackgroundImage
siteFullPageImage
siteBackgroundMeta
```

`siteBackgroundImage` is the cropped site image.

`siteFullPageImage` is the original rendered PDF page and can be used as a reference view.

`siteBackgroundMeta` contains full-page, crop, and boundary metadata.

```typescript
interface SiteData {
  site_page_index: number;
  site_shape: "rectangle" | "polygon";
  geometry: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  scale: {
    pixels_per_meter: number;
    length_m: number;
    width_m: number;
  };
}

interface PdfBackgroundMeta {
  page: {
    width: number;
    height: number;
  };
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  siteBoundary: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

## Layout Builder

File:

```text
src/pages/SiteEditor.tsx
```

The editor reads:

```text
siteData
siteBackgroundImage
siteFullPageImage
siteBackgroundMeta
```

The default background mode is:

```text
Cropped Site View
```

If the full page was stored, the user can switch between:

```text
Cropped Site View
Full PDF Page View
```

The selected site boundary remains correctly aligned in both modes.

---

## Canvas

File:

```text
src/components/SiteCanvas.tsx
```

Implemented with React Konva.

### Layer Order

```text
PDF Background Layer
Site Boundary Layer
Building Layer
```

The PDF background is not draggable and does not receive pointer events.

Buildings remain draggable above the PDF and site boundary.

### Fit To Screen

The canvas uses ResizeObserver to recalculate scale on:

* Initial load
* PDF background load
* Browser resize
* Sidebar collapse/expand
* Fit To Screen button click

Current behavior:

* Horizontal centering is preserved.
* Vertical centering is disabled.
* Site/PDF is aligned near the top.
* Approximately five grid rows of top padding are reserved below the toolbar.

### Background Controls

Right panel controls:

```text
PDF Background Opacity
Show PDF Background
Cropped Site View
Full PDF Page View
```

Opacity range:

```text
0% to 100%
```

Default:

```text
50%
```

---

## Building Model

```typescript
type BuildingType = "rectangle" | "square";

type BuildingColor =
  | "#ef4444"
  | "#f97316"
  | "#eab308"
  | "#22c55e"
  | "#84cc16"
  | "#2563eb"
  | "#06b6d4"
  | "#9333ea"
  | "#ec4899"
  | "#6b7280";

interface Building {
  id: string;
  type: BuildingType;
  color: BuildingColor;
  length: number;
  width: number;
  x: number;
  y: number;
  rotation: number;
}
```

Default colors:

```text
Rectangle: Blue
Square: Orange
```

---

## Building Creation

Toolbar:

```text
+ Rectangle
+ Square
```

Rectangle prompt:

```text
Building Length
Building Width
```

Square prompt:

```text
Size
```

New buildings are automatically selected.

---

## Building Editing

File:

```text
src/components/BuildingShape.tsx
```

Supported interactions:

* Drag and drop
* Resize
* Free rotation
* Rotation handle above selected building
* Delete selected building

Buildings are constrained inside the selected site boundary.

Resize handles and rotation handles are provided by Konva Transformer.

---

## Building Property Panel

File:

```text
src/components/PropertyPanel.tsx
```

When no building is selected:

```text
Select a building to view properties
```

When a building is selected, the BUILDING panel shows:

```text
Color
Width (m)
Height (m)
Area (m²)
Rotation (deg)
X (m)
Y (m)
Remove Building
```

Displayed dimension values use:

```typescript
toFixed(1)
```

Internal calculation precision is preserved.

### Color Selection

Ten preset colors:

```text
Red
Orange
Yellow
Green
Lime
Blue
Cyan
Purple
Pink
Gray
```

Only the selected building can change color.

The selected color updates the building fill immediately.

Border and resize handles remain unchanged.

---

## Dimension Annotations

Selected buildings show CAD-style annotations directly on the canvas:

```text
Width above the building
Height on the right side
Rotation near the top-right corner
```

Labels follow the building during:

* Move
* Resize
* Rotate

Only the selected building shows these annotations.

No floating black tooltip is used.

---

## Distance Measurements

When a building is selected, the canvas calculates clearances to all other buildings.

Displayed values:

```text
Horizontal distance
Vertical distance
```

If only one valid distance exists, only that distance is shown.

If both exist, both are shown.

Distance labels:

* Display directly on the canvas.
* Use orange text: `#f97316`.
* Use one decimal place, for example `8.0 m`.
* Support rotated buildings.
* Hide when no building is selected.

---

## Clipboard and History

Implemented shortcuts:

```text
Ctrl + C  Copy selected building
Ctrl + V  Paste copied building
Ctrl + D  Duplicate selected building
Delete    Delete selected building
Ctrl + Z  Undo
Ctrl + Y  Redo
```

Paste and duplicate:

* Generate a new unique id.
* Offset by 3m horizontally and 3m vertically.
* Automatically select the new building.
* Preserve width, height, rotation, color, and position.
* Repeated paste continues offsetting.

History:

* Stores up to 100 states.
* Clears redo stack after a new action.
* Restores building width, height, rotation, color, position, id, and selection.

Tracked actions:

* Add Rectangle
* Add Square
* Move Building
* Resize Building
* Rotate Building
* Change Color
* Delete Building
* Paste Building
* Duplicate Building

Toolbar includes:

```text
Undo
Redo
```

---

## Export

File:

```text
src/services/layoutStorage.ts
```

Toolbar action:

```text
Export layout.json
```

Example:

```json
{
  "site": {
    "length": 72,
    "width": 45
  },
  "buildings": [
    {
      "id": "b1",
      "type": "rectangle",
      "length": 20,
      "width": 12,
      "x": 15,
      "y": 10,
      "rotation": 37.5,
      "color": "#2563eb"
    },
    {
      "id": "b2",
      "type": "square",
      "size": 10,
      "x": 35,
      "y": 18,
      "rotation": 0,
      "color": "#f97316"
    }
  ]
}
```

---

## Current Folder Structure

```text
SiteLab/
├── src/
│   ├── components/
│   │   ├── BuildingShape.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── SiteCanvas.tsx
│   │   └── Toolbar.tsx
│   ├── models/
│   │   ├── Building.ts
│   │   └── Site.ts
│   ├── pages/
│   │   ├── PdfSiteSetup.tsx
│   │   ├── SiteEditor.tsx
│   │   └── SiteLab.tsx
│   ├── services/
│   │   └── layoutStorage.ts
│   ├── types/
│   │   └── layout.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── FEATURE_SITE_EDITOR.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Tech Stack

```text
React
TypeScript
Vite
Konva
React Konva
PDF.js
```
