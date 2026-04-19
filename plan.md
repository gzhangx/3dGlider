# 3D Glider — Web CAD Implementation Plan

## Tech Stack
| Role | Library |
|---|---|
| Framework | React + TypeScript + Vite |
| 3D Viewport | @react-three/fiber + @react-three/drei |
| CAD Kernel | replicad (OpenCASCADE.js via WebWorker) — Phase 3+ |
| STL Export | replicad built-in |

---

## Phase 1 — Project Scaffold & 3D Viewport ✅
- Vite + React + TypeScript project
- Three.js scene: world grid, XYZ axes indicator
- Orbit/pan/zoom controls (CameraControls from drei)
- Three plane gizmos (XY=blue, XZ=green, YZ=red), click-to-select
- On plane click: camera smoothly snaps perpendicular to the selected plane
- Camera distance preserved when snapping
- Right-drag to pan, scroll to zoom always available

## Phase 2 — Sketch Mode ✅
- Click a plane → enter sketch mode, camera snaps to face it
- Left sidebar with draw tools: Select, Line, Rectangle, Circle (hotkeys S/L/R/C)
- Invisible hit-test plane for pointer events via raycasting
- Click-click workflow: 1st click sets anchor, 2nd click finalises element
- Live preview line/rect/circle as cursor moves
- Snap-to-grid (0.5 unit grid)
- White cursor dot + yellow anchor dot while placing
- Committed elements rendered in yellow
- Escape key: cancel in-progress draw (first press), exit sketch (second press)
- In draw-tool mode: left-button reserved for drawing, right-drag = pan, scroll = zoom
- In select mode: full orbit/pan/zoom restored

## Phase 3 — Extrude to Solid (TODO)
- Select closed sketch profile → "Extrude" button + depth input
- replicad `.sketchOnPlane(plane).draw(...)` → `.extrude(depth)` in WebWorker
- Result converted to Three.js BufferGeometry and rendered in 3D viewport
- Feature Tree panel lists all sketches + extrudes

## Phase 4 — STL Export (TODO)
- replicad's `exportSTL()` → Blob download as `.stl`
- Binary STL (compact, Prusa Slicer compatible)

## Phase 5 — Polish & Multiple Features (TODO)
- Feature tree with multiple sketches and extrudes
- Boolean add/subtract (new extrude can cut into existing solid)
- Undo/redo stack
- Fillet/chamfer (replicad supports natively)

---

## Folder Structure
```
src/
  components/
    Viewport3D/         Three.js canvas, plane gizmos, sketch plane hit-mesh
      AxesHelper.tsx
      PlaneGizmo.tsx
      SketchPlane.tsx   hit-test + element rendering + preview
      Scene.tsx         scene root, camera animation, CameraControls config
      Viewport3D.tsx    Canvas wrapper
    SketchSidebar/      Left tool panel (sketch mode only)
    Toolbar/            Top bar: logo, active-plane label, Exit Sketch button
  store/
    modelStore.ts       Zustand: mode, activePlane, activeTool, sketchElements
```

## Coordinate Convention
| Plane | Sketch u-axis | Sketch v-axis | World conversion |
|---|---|---|---|
| XY | X | Y | (u, v, 0) |
| XZ | X | Z | (u, 0, v) |
| YZ | Y | Z | (0, u, v) |
