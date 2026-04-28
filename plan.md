# 3D Glider Project Plan & Status

**Updated: April 26, 2026**

---

## Executive Summary

3D Glider is a web-based CAD application for creating 3D objects from 2D sketches, with support for extrude and pocket (cut) operations. Currently at **80% feature complete**, with one critical blocking issue: **cut/pocket surfaces are not raycastable for face-based sketch creation**.

---

## Project Objectives

### ✅ Phase 1: Core Sketching & Extrude (COMPLETE)
- [x] Create sketches on XY/XZ/YZ planes
- [x] Draw lines, rectangles, circles on sketches
- [x] Convert sketches to 3D solids via extrude
- [x] Render multiple extrudes in scene
- [x] Edit/delete sketches and features
- [x] Export to binary STL format
- [x] 2-click line/rect/circle drawing
- [x] Cut tool for sketch elements
- [x] Grid snapping (0.5 unit)

### ✅ Phase 2: Plane Offset System (COMPLETE)
- [x] Support sketches at any distance from origin (offset parameter)
- [x] Camera animation to offset planes
- [x] Geometry generation with offset transformations
- [x] UI to show plane + offset information

### ✅ Phase 3: Pocket/Cut Operations (95% COMPLETE)
- [x] Add 'cut' operation type to ExtrudeFeature
- [x] CSG boolean subtraction in buildSolidMeshes()
- [x] UI button to select Add vs. Cut
- [x] STL export includes cut volumes
- [x] Visual rendering of pockets
- [x] Pocket geometry renders correctly
- [ ] **BLOCKING: Face selection on cut surfaces** ← THE PROBLEM

### 🔴 Phase 4: Surface-Based Sketch Creation (BLOCKED BY ABOVE)
- [ ] Click any flat solid face to start new sketch
- [ ] Automatically detect plane from normal
- [ ] Automatically detect offset from position
- [ ] Use face click to set up sketch parameters
## Current Technical Status

### Technology Stack
| Layer | Technology | Purpose | Version |
|-------|-----------|---------|---------|
| **React Framework** | React | Component rendering & state | 18.3.1 |
| **Build Tool** | Vite | Fast bundler | 6.4.2 |

Zustand Store Structure:
├── mode: 'view' | 'sketch'
├── activePlane: 'XY' | 'XZ' | 'YZ' | null
├── activePlaneOffset: number (distance from origin)
└── extrudes: ExtrudeFeature[]
    └── { id, sketchId, operation: 'add'|'cut', depth }
1. **Data Layer** → Zustand store
2. **Component Layer** → React components subscribe  
3. **Geometry Layer** → sketchToShape + ExtrudeGeometry + Matrix4
4. **Boolean Layer** → three-csg-ts CSG operations
### Coordinate Systems ✅
| Plane | Normal | Extrude Direction | Storage |
| **YZ** | [1,0,0] | +X | (x, y) → world (offset+X, x, y) |

### Problem Statement
**User cannot click cut/pocket surface faces to start new sketches.**
- ✅ Pocket geometry renders visually correct
- ✅ Pocket geometry in STL export is correct
- ✅ First extrude (non-cut) surfaces ARE clickable
- ❌ Cut surface faces are NOT clickable
- ❌ Raycaster returns empty intersections on cut faces

### Error Signature
```javascript
// In ExtrudedSolids.tsx SolidMesh component:
const raycaster = new Raycaster()
raycaster.setFromCamera(mouseRef.current, camera)
const intersects = raycaster.intersectObject(meshRef.current)

console.log(intersects)  // ← [] (EMPTY! Should have hits)
// For non-cut solids, this returns objects with faces
// For cut solids, always returns []
```

### Root Cause Candidates

   - CSG.subtract() may return geometry without proper .index (indexed triangles)
   - Raycaster needs index to test ray-triangle intersections
   - Fix: Verify geometry.index is populated after CSG operation
2. **Missing Geometry Bounds**
   - Raycaster needs geometry.boundingSphere to pre-filter intersections
   - CSG output may have invalid/missing bounds
   - Fix: Call geometry.computeBoundingSphere() after CSG

3. **Normals Not Computed**
   - THREE docs: raycasting works better with computed normals
   - CSG output may have undefined normals
   - Status: Already calling computeVertexNormals() in solidModel.ts
   - But still not working → not the root cause

4. **Mesh Transform Issues**
   - If mesh.matrixWorld is identity and mesh not in scene, raycaster can't see it
   - Fix: Verify meshRef.current is actually rendered in Three.js scene

### Attempted Solutions & Results

| Attempt | Approach | Result |
|---------|----------|--------|
| #1 | Added computeVertexNormals() to CSG | ✗ No effect |
| #2 | Switch from `<primitive>` to `<mesh>` | ✗ No effect |
| #3 | Manual Raycaster vs event propagation | ✗ No effect |
| #4 | (Next) Debug CSG output structure | ? Pending |

---

## File Structure & Responsibilities

### Core State
- **src/store/modelStore.ts** (200 lines)
  - Zustand store definition
  - All state mutations (add/delete/edit)
  - Subscribe mechanism for components

### Geometry Generation Pipeline
- **src/lib/sketchToShape.ts** (250 lines)
  - Converts SketchElement[] → THREE.Shape[]
  - Extracts closed loops from line segments
  - Handles rectangles, circles, arcs, mixed paths

- **src/lib/sketchGeometry.ts** (70 lines)
  - Sketch coordinate → World coordinate transformation
  - Plane-specific transforms (XY/XZ/YZ)
  - Offset handling (LIFT + plane-offset)
  - Helper functions for rendering sketch outlines

- **src/lib/solidModel.ts** (100 lines)
  - featureGeometry() → ExtrudeGeometry + Matrix4 transform
  - buildSolidMeshes() → CSG operations for cut features
  - disposeSolidMeshes() → Memory cleanup

### 3D Viewport Components
- **src/components/Viewport3D/Viewport3D.tsx** (20 lines)
  - Canvas setup (@react-three/fiber)
  - Camera initial position

- **src/components/Viewport3D/Scene.tsx** (80 lines)
  - Main scene orchestration
  - Camera control setup (CameraControls from drei)
  - Lights and grid
  - Conditional rendering (view vs sketch mode)
  - Plane gizmos for sketch mode

- **src/components/Viewport3D/ExtrudedSolids.tsx** (70 lines) **← PROBLEM COMPONENT**
  - Renders CSG meshes from buildSolidMeshes()
  - Manages raycasting for face detection
  - Handles face click → plane detection → new sketch start
  - Issue: raycaster.intersectObject() fails on cut meshes

- **src/components/Viewport3D/CommittedSketches.tsx** (60 lines)
  - Renders saved sketches as 2D line outlines
  - Uses @react-three/drei's Line component
  - Uses sketchGeometry.ts helpers for world positioning
  - Selectable when not in new-sketch mode

- **src/components/Viewport3D/SketchPlane.tsx** (custom interaction)
  - Active sketch editing surface
  - Plane-specific raycast for drawing tools
  - Cursor position tracking

- **src/components/Viewport3D/PlaneGizmo.tsx**
  - Clickable plane buttons (XY/XZ/YZ)
  - Starting point for new sketches (when click through feature tree)

- **src/components/Viewport3D/AxesHelper.tsx**
  - Visual XYZ axis labels

### UI Components
- **src/components/FeatureTree/FeatureTree.tsx** (140 lines)
  - New Sketch button and plane selector
  - Sketch list with elements count
  - Extrude form (depth input, Add/Cut selector)
  - Edit/Delete buttons

- **src/components/Toolbar/Toolbar.tsx**
  - Mode indicator, Exit Sketch, STL Export

- **src/components/SketchSidebar/SketchSidebar.tsx**
  - Tool palette (Select, Line, Rect, Circle, Cut)
  - Keyboard shortcuts reference

### Entry Points
- **src/App.tsx** (30 lines) - Root component
- **src/main.tsx** - React bootstrap
- **index.html** - HTML container

---

## Feature Implementation Flow

### Example: Creating a Pocket

```
1. User clicks "New Sketch" 
   → FeatureTree.tsx → armNewSketch()
   → Store: newSketchArmed = true

2. User clicks solid face OR selects plane
   → startNewSketch(plane, offset)
   → Store: mode='sketch', activePlane=plane, activePlaneOffset=offset
   → Scene.tsx: Camera animates to plane

3. User draws rectangle on sketch plane
   → SketchPlane.tsx captures input
   → Sketch elements added to store.sketchElements
   → CommittedSketches.tsx re-renders with <Line> components

4. User clicks "Exit Sketch" or exits sketch mode
   → exitSketch()
   → Store: Creates new Sketch with elements and saves to store.sketches

5. User selects operation "Cut" and depth "2" in feature tree
   → FeatureTree.tsx: operation = 'cut', depth = '2'
   → User clicks "Pocket ▶"
   → addExtrude(sketchId, 2, 'cut')

6. ExtrudedSolids component re-renders (extrudes changed)
   → buildSolidMeshes() called:
      a) Iterate all extrudes in order
      b) First extrude (add): featureGeometry() creates ExtrudeGeometry
         → Matrix4 rotates to correct plane
         → Mesh created, added to solids array
      c) Second extrude (cut):
         → featureGeometry() creates pocket geometry
         → CSG.subtract(solids[0], pocketMesh)
         → Returns new mesh with hole
         → computeVertexNormals() called
         → OLD geometry.dispose()
         → Replace solids[0]
   → Returns array of final solid meshes

7. SolidMesh component renders each solid
   → <mesh ref={meshRef} />
   → Assigns CSG mesh geometry to ref

8. User tries to click pocket surface (NEW SKETCH ARMED)
   → handleClick fires
   → Raycaster.intersectObject(meshRef.current)
   → ❌ PROBLEM: Returns empty array
   → Face click doesn't work
```

---

## Library Deep Dive

### Three.js Key Classes Used

**THREE.BufferGeometry**
- Stores vertex data (positions, normals, indices)
- Created by ExtrudeGeometry, modified by CSG operations
- Required: .index (triangle indices) and .attributes.position
- Raycaster needs both for intersection testing

**THREE.Mesh**
- Combines geometry + material for rendering
- Properties: position, rotation, scale, matrixWorld
- CSG operations take/return Mesh objects

**THREE.ExtrudeGeometry**
- Converts 2D THREE.Shape into 3D geometry
- Always extrudes along local +Z
- Requires rotation via THREE.Matrix4 to match desired plane

**THREE.Matrix4**
- 4x4 transformation matrix for position/rotation/scale
- Used to transform ExtrudeGeometry from local to world space
- `.applyMatrix4()` moves geometry vertices

**THREE.Raycaster**
- Casts ray from camera through screen point into 3D scene
- `.setFromCamera(screenPos, camera)` creates ray
- `.intersectObject(mesh)` finds intersections with mesh
- Returns array of {point, face, distance, object, ...}
- **Problem area**: Returns empty on CSG meshes

### @react-three/fiber Key Concepts

**useThree Hook**
- Access Three.js objects from React components
- Returns: {camera, scene, gl, ...}
- Used to get camera for raycasting

**Ref Forwarding**
- `<mesh ref={meshRef} />` creates THREE.Mesh
- ref.current gives direct access to Three.js object
- Used in SolidMesh to access geometry/material

**Event System**
- Attempted: `onClick={handler}` on `<mesh>`
- Problem: Event bubbling doesn't provide face data reliably
- Solution: Manual raycasting with Raycaster class

### @react-three/drei Components

**Line**
- Renders 2D/3D line segments
- Input: points array, color, lineWidth
- Used for sketch outlines in CommittedSketches.tsx

**CameraControls**
- Orbit/pan/zoom camera interaction
- Manages mouse events, smooth animation
- Alternative: OrbitControls (simpler, fewer features)

**Grid**
- 3D grid background
- Follows camera for infinite grid effect

---

## Why the Raycasting Fails (Analysis)

### Working Case: First Extrude
```
1. Sketch elements: [SketchRect]
2. sketchElementsToShape() → [THREE.Shape]
3. new ExtrudeGeometry(shapes) → BufferGeometry
   - Has .index (indexed triangles)
   - Has normals
4. Matrix4 transform
5. new Mesh(geometry) → mesh1
6. buildSolidMeshes() returns [mesh1]
7. Raycaster.intersectObject(mesh1) ✓ WORKS
```

### Failing Case: After Pocket Cut
```
1. Sketch elements: [SketchCircle]
2. sketchElementsToShape() → [THREE.Shape]
3. new ExtrudeGeometry(shapes) → BufferGeometry
4. Matrix4 transform
5. new Mesh(geometry) → pocketMesh
6. CSG.subtract(mesh1, pocketMesh) → resultMesh
   - Geometry structure modified
   - May lose .index or normals?
7. computeVertexNormals() called
8. buildSolidMeshes() returns [resultMesh]
9. Raycaster.intersectObject(resultMesh) ✗ FAILS
```

### Likely Issue
CSG.subtract() may return geometry that:
- Has no .index (non-indexed positions array)
- Has null normals
- Has invalid boundingSphere
- Doesn't have proper face references

---

## Performance & Resource Management

- **Geometry Disposal**: Called in useEffect cleanup
- **Build Time**: ~3.8s (Vite production)
- **Memory**: Tested with 5+ extrudes (1000+ triangles) - stable
- **Rendering**: 60 FPS on moderate hardware
- **Raycasting**: O(n) where n = triangle count; fast for current scale

---

## Testing Status

| Feature | Status | Notes |
|---------|--------|-------|
| Create sketch on XY/XZ/YZ | ✅ Working | All planes tested |
| Draw lines/rects/circles | ✅ Working | 2-click UI smooth |
| Grid snapping | ✅ Working | 0.5 unit grid |
| Cut tool on elements | ✅ Working | Lines, circles, arcs |
| Save sketch | ✅ Working | Persists across re-renders |
| Extrude with add | ✅ Working | Renders correctly |
| Extrude with cut | ✅ Working | Geometry correct |
| STL export | ✅ Working | Includes pockets |
| Camera animation | ✅ Working | Smooth transition |
| Click non-cut face | ✅ Working | Raycasting works |
| **Click cut face** | ❌ BROKEN | Raycasting returns empty |

---

## Immediate Next Steps

### Debug Priority #1: CSG Output Structure
```typescript
// Add logging to solidModel.ts after CSG.subtract()
const result = CSG.subtract(solidMesh, pocketMesh)
console.log('CSG Result Analysis:')
console.log('  geometry.index:', result.geometry.index)  // Should exist
console.log('  index length:', result.geometry.index?.array.length)
console.log('  position count:', result.geometry.attributes.position.count)
console.log('  normal count:', result.geometry.attributes.normal?.count)
console.log('  boundingSphere:', result.geometry.boundingSphere)
```

### Debug Priority #2: Verify Raycasting Setup
```typescript
// Add logging in ExtrudedSolids.tsx
console.log('Mesh geometry before raycasting:')
console.log('  index:', meshRef.current.geometry.index)
console.log('  position:', meshRef.current.geometry.attributes.position)
console.log('  bounds:', meshRef.current.geometry.boundingSphere)

const raycaster = new Raycaster()
raycaster.setFromCamera(mouseRef.current, camera)
console.log('Raycaster ray:', raycaster.ray)
const hits = raycaster.intersectObject(meshRef.current)
console.log('Intersections:', hits)
```

### Debug Priority #3: Test Alternative
- Disable CSG, only use 'add' operations
- Verify raycasting works on non-cut geometry
- If works: CSG is problem
- If still fails: raycasting setup is problem

---

## Known Limitations & Future Work

### Current Limitations
1. **CSG raycasting broken** ← PRIMARY ISSUE
2. Line cutting may miss edge cases in complex paths
3. No undo/redo system
4. No geometric constraints (parallelism, perpendicularity)
5. No assembly/multi-body support
6. No parametric sketches
7. Limited to extrusionbased features (no sweeps, lofts, etc.)

### Planned Enhancements
- [ ] Fix raycasting on CSG geometry
- [ ] Undo/redo stack
- [ ] Constraint solver
- [ ] Sketch dimensions
- [ ] Assembly support
- [ ] Advanced feature types (sweep, loft, shell)
- [ ] Collaborative sketching
- [ ] Integration with design libraries


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
