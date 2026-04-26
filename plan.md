# 3D Glider — Current Implementation Summary

## Stack
- React 18 + TypeScript + Vite
- Three.js via @react-three/fiber and @react-three/drei
- State management with Zustand
- Geometry/extrude/export implemented directly with Three.js utilities (no replicad integration in current code)

## Application Layout
- Top toolbar: app branding, mode hints, sketch status, Exit Sketch action, STL export action
- Center viewport: interactive 3D scene and sketch interactions
- Left panel (sketch mode only): sketch tools
- Right panel: feature tree for sketches and extrudes, plus new-sketch flow

## Current Modes and Workflow
- View mode:
  - Orbit/pan/zoom camera controls
  - Plane gizmos (XY/XZ/YZ) shown only when creating a new sketch
  - Existing sketches and extruded solids visible and selectable
- Sketch mode:
  - Active sketch plane set; camera snaps perpendicular to that plane
  - Draw tools: select, line, rectangle, circle, cut
  - Keyboard tool shortcuts: S/L/R/C/X
  - Escape behavior:
    - If drawing: cancel current anchor point
    - Else if an element is selected: clear selection
    - Else: exit sketch mode
  - Delete/Backspace removes selected sketch element

## Sketching Behavior
- 2-click creation for line/rectangle/circle
- Snap to 0.5-unit grid
- Live preview for line/rectangle/circle
- Cursor marker and anchor marker rendered during drawing
- In draw tools, an invisible hit-test plane captures pointer input
- In select tool, sketch entities are directly selectable with hover/selected highlight styling

## Cut Tool (Implemented)
- Supports cutting:
  - Lines
  - Rectangle edges (rectangle converts to remaining line segments after edge cut)
  - Circles (become remaining arc segment)
  - Arcs (trimmed into one or two remaining arcs)
- Nearest-target detection based on pointer distance threshold
- Live red cut preview for the removed segment/arc
- On click, target element is replaced with computed remaining segments/arcs

## Sketch Persistence and Editing
- Sketches are stored with IDs, plane, and element arrays
- Exiting sketch mode:
  - Saves new sketch if elements exist
  - Updates existing sketch when editing
  - Deletes edited sketch if all elements were removed
- Feature tree supports reopening an existing sketch for editing

## Profile Detection and Extrusion
- Profile extraction supports:
  - Rectangles
  - Circles
  - Closed loops from lines
  - Mixed closed loops from lines + arcs
  - Nested loops with hole assignment
- Extrusion:
  - Per-sketch depth input in feature tree
  - Creates Three.js ExtrudeGeometry (bevel disabled)
  - Plane-aware mesh rotations for XY/XZ/YZ
  - Multiple extrude features per sketch supported

## Starting Sketches from Solids
- When New Sketch is armed, clicking a flat face on an extruded solid:
  - Detects dominant face normal axis
  - Maps it to XY/XZ/YZ
  - Starts sketch on that plane

## STL Export
- Export button appears when at least one extrude exists
- Builds temporary mesh group from current extrudes
- Uses Three.js STLExporter to generate binary STL
- Downloads as 3dglider_model.stl

## Data Model (Zustand)
- Global state includes:
  - mode, active/hovered plane, active tool
  - new-sketch arming flag
  - in-progress sketch elements
  - committed sketches
  - extrude features
  - selected element and editing sketch ID

## Not Implemented Yet (Observed)
- Boolean add/subtract operations between solids
- Undo/redo stack
- Constraints/dimensions in sketches
- Fillet/chamfer tools
- CAD-kernel-backed BREP operations (replicad/OpenCascade)
