# 3D Glider: Complete Architecture & Library Flow Guide

## Part 1: Project Architecture Overview

### High-Level Flow

```
User Interaction (UI/Viewport)
    ↓
State Management (Zustand Store)
    ↓
React Components (Render UI & 3D)
    ↓
Three.js Scene (3D Visualization)
    ↓
Library Calls (THREE, CSG, Three Fiber)
```

### Technology Stack Breakdown

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **React Framework** | React 18.3.1 | Component state & lifecycle management |
| **State Management** | Zustand 5.0.12 | Global app state (centralized model data) |
| **3D Rendering** | Three.js 0.172.0 | WebGL abstraction, 3D primitives, geometry |
| **React-to-Three Bridge** | @react-three/fiber 8.18.0 | React components → Three.js objects |
| **3D Utilities** | @react-three/drei 9.120.3 | Pre-made components (Grid, CameraControls, Line) |
| **Boolean Operations** | three-csg-ts | CSG (Constructive Solid Geometry) for pockets |
| **Build Tool** | Vite 6.4.2 | Fast development & production builds |

---

## Part 2: Data Flow & State Management

### Zustand Store (src/store/modelStore.ts)

Zustand is a lightweight state management library. Think of it as a single shared JavaScript object that all components can read from and modify.

#### Core Data Structures:

```typescript
// SketchPoint: 2D point in sketch coordinate system (before any plane transformation)
type SketchPoint = { x: number; y: number }

// SketchElement: Any drawable shape in a sketch
type SketchElement = SketchLine | SketchRect | SketchCircle | SketchArc

// Sketch: Collection of elements on a specific plane + offset
interface Sketch {
  id: string          // Unique identifier
  plane: 'XY'|'XZ'|'YZ'  // Which plane the sketch is on
  offset: number      // Distance from origin along plane normal
  elements: SketchElement[]  // The drawn shapes
}

// ExtrudeFeature: A 3D extrusion or pocket created from a sketch
interface ExtrudeFeature {
  id: string
  sketchId: string    // Links to which Sketch this came from
  operation: 'add'|'cut'  // Add volume or cut volume out
  depth: number       // How far to extrude in the plane normal direction
}

// ModelState: Complete app state
interface ModelState {
  mode: 'view'|'sketch'  // Currently viewing or sketching?
  activePlane: PlaneId|null  // Which plane are we sketching on?
  activePlaneOffset: number   // How far from origin?
  newSketchArmed: boolean     // Is user about to click a face to start a sketch?
  // ... plus 50+ helper functions for mutations
}
```

#### How State Gets Used:

```typescript
// In any component, you subscribe to store like this:
const { extrudes, sketches, mode } = useModelStore()

// When store updates, component re-renders with new values
// Zustand automatically optimizes so only components using changed fields re-render
```

---

## Part 3: Coordinate System & Plane Transformation

### Understanding the Three Planes

All sketches live in one of three coordinate planes:
  └─ Sketch point (2, 3) with offset 5 → World (2, 5+LIFT, 3)

YZ Plane:  front view,     normal is [1,0,0] (X-axis)
  └─ Sketch point (2, 3) with offset 5 → World (5+LIFT, 2, 3)
```

**File: `src/lib/sketchGeometry.ts`**

```typescript
// STEP 1: Convert 2D sketch point to 3D world position
function worldPt(p: SketchPoint, plane: PlaneId, offset = 0): [number, number, number] {
  switch (plane) {
    case 'XY': return [p.x, p.y, offset + LIFT]
    case 'XZ': return [p.x, offset + LIFT, p.y]
    case 'YZ': return [offset + LIFT, p.x, p.y]
  }
// STEP 2: Generate world positions for a complete shape
// For a rectangle from (0,0) to (5,5) on XY plane at offset 3:
function rectPts(a: SketchPoint, b: SketchPoint, plane: PlaneId, offset = 0) {

// STEP 3: Render these points using @react-three/drei's Line component
<Line points={rectPts(rect.start, rect.end, plane, offset)} />
```

**Key Concept: LIFT = 0.003**
## Part 4: Sketch Rendering (2D Drawing on 3D Plane)
    <>
      {sketches.map((sketch) => (
        <SavedSketch key={sketch.id} sketch={sketch} />
function SavedSketch({ sketch }: { sketch: Sketch }) {
  return (
    <>
      ))}
    </>
}

function SketchEl({ el, plane, offset }: { el: SketchElement; plane: PlaneId; offset: number }) {
  
  if (el.type === 'line')
  if (el.type === 'rect')
  if (el.type === 'circle')
  if (el.type === 'arc')
}
```

**Library Call Breakdown:**

```typescript
// @react-three/drei's Line component
// INPUT: array of 3D points and styling options
<Line 
  points={[[0,0,3], [5,0,3], [5,5,3]]}  // Array of [x,y,z] tuples
  color="#ffdd44"                         // CSS color
  lineWidth={2}                           // Line thickness in pixels
/>
// Under the hood, Line generates a THREE.BufferGeometry with positions
// and renders it with THREE.LineBasicMaterial
```
---


**File: `src/lib/sketchToShape.ts`**

```typescript
// LIBRARY: THREE.Shape
// Purpose: 2D closed path that can be extruded to 3D
// Location: 'three' (Three.js library)

export function sketchElementsToShape(elements: SketchElement[], plane: PlaneId): THREE.Shape[] {
  const shapes: THREE.Shape[] = []
  
  // Convert rectangles to shapes
  for (const r of elements.filter((e): e is SketchRect => e.type === 'rect')) {
    const shape = new THREE.Shape()  // Create empty 2D shape
    shape.moveTo(x0, y0)             // Move to corner
    shape.lineTo(x1, y0)             // Draw line
    shape.lineTo(x1, y1)             // Draw line
    shape.lineTo(x0, y1)             // Draw line
    shape.closePath()                // Close the loop
    shapes.push(shape)               // Add to output
  }
  
  // Convert circles to shapes
  for (const c of elements.filter((e): e is SketchCircle => e.type === 'circle')) {
    const shape = new THREE.Shape()
    shape.absarc(cx, cy, radius, 0, Math.PI * 2)  // Full circle arc
    shapes.push(shape)
  }
  
  return shapes
}

// WHAT IT DOES:
// Input:  [SketchRect at (0,0)-(5,5), SketchCircle at (7,5) r=2]

**File: `src/lib/solidModel.ts`**

```typescript
function featureGeometry(ext: ExtrudeFeature, sketch: Sketch): BufferGeometry | null {
  // STEP 1: Get 2D shapes from sketch elements
  const shapes = sketchElementsToShape(sketch.elements, sketch.plane)
  if (shapes.length === 0) return null
  
  const geo = new ExtrudeGeometry(shapes, {
    depth: Math.abs(ext.depth),  // How far to extrude
  // STEP 3: ExtrudeGeometry creates geometry in LOCAL coordinate space:
  //   - XY plane sketch → extrudes along local +Z
  //   - But we need it on XZ or YZ planes → must ROTATE
    XY: [0, 0, 0],                      // No rotation needed
    XZ: [-Math.PI / 2, 0, 0],           // Rotate around X by -90°
    YZ: [Math.PI / 2, Math.PI / 2, 0]   // Rotate around X by 90°, then Y by 90°
  }
  const matrix = new Matrix4()
  matrix.makeRotationFromEuler(new Euler(...EXTRUDE_ROTATION[sketch.plane]))
  matrix.setPosition(sketch.plane === 'XY' ? 0 : offset, ...)  // Position at offset
  
  // STEP 5: Apply matrix to geometry
  // This moves the geometry from local space to world space
  const baked = bakeGeometry(geo, matrix)  // geo.applyMatrix4(matrix)
  
  // STEP 6: Compute face normals for lighting/raycasting
  baked.computeVertexNormals()
  
  return baked
}
// Input:  ExtrudeFeature { depth: 5 }, Sketch with rectangle on XY plane at offset 3
// Output: THREE.BufferGeometry representing a 5-unit-tall box sitting at Z=3
---

## Part 6: Boolean Operations (CSG for Pockets)

### Add vs. Cut Operations

```typescript
export function buildSolidMeshes(extrudes: ExtrudeFeature[], sketches: Sketch[]): Mesh[] {
  const solids: Mesh[] = []
  
  for (const ext of extrudes) {
    const featGeo = featureGeometry(ext, sketch)
    const featMesh = new Mesh(featGeo)
    if (ext.operation === 'cut') {
      
        // LIBRARY: three-csg-ts CSG.subtract
        
        // Compute normals so faces can be lit and raycast
        resultMesh.geometry.computeVertexNormals()
        // Clean up old geometry memory
        solids[i].geometry.dispose()
      }
    } else {
      // ADD MODE: Append this geometry to solids array
      solids.push(featMesh)
    }
  }
  return solids  // All final solid meshes
}

// WHAT IT DOES:
// Features: [Extrude(rect, +5, 'add'), Extrude(circle, -2, 'cut')]
// Step 1: Create box from rect, add to solids → solids = [box]
// Step 2: Create cylinder from circle
// Step 3: Subtract cylinder from box → solids = [box-with-hole]
// Return: [mesh representing box-with-hole]
### CSG Library Details

```typescript
// 
// API:
//   CSG.union(mesh1, mesh2)     → mesh1 + mesh2 (combined volume)
//   CSG.subtract(mesh1, mesh2)  → mesh1 - mesh2 (mesh2 cut from mesh1)
//   CSG.intersect(mesh1, mesh2) → only the overlapping part
//
// Requirements:
//   - Both input meshes must have valid BufferGeometry
//   - The resulting geometry may lose face information or face normals
```

---

## Part 7: Rendering Solids (The Blocking Issue)

### Component: src/components/Viewport3D/ExtrudedSolids.tsx

```typescript
export function ExtrudedSolids() {
  // Recomputes whenever extrudes/sketches change (via useMemo)
  const solids = useMemo(() => buildSolidMeshes(extrudes, sketches), [extrudes, sketches])
  // STEP 2: Clean up geometry memory when solids change
  useEffect(() => {
  
  // STEP 3: Render each solid mesh
    <>
      {solids.map((mesh) => (
      ))}
    </>
}

function SolidMesh({ solidMesh }: { solidMesh: Mesh }) {
  const { mode, newSketchArmed, startNewSketch } = useModelStore()
  const { camera } = useThree()  // Get camera for raycasting
  
  // STEP 1: Assign CSG-generated geometry to React mesh
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry = solidMesh.geometry
      meshRef.current.material = new MeshStandardMaterial({ 
        color: 0x4477bb, 
        opacity: 0.82 
      })
    }
  }, [solidMesh])
  
  // STEP 2: Track mouse position (normalized -1 to +1)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])
  
  // STEP 3: On click, raycast to find intersected face
  useEffect(() => {
    const handleClick = () => {
      if (mode !== 'view' || !newSketchArmed || !meshRef.current) return
      
      // LIBRARY: THREE.Raycaster
      // Purpose: Cast a ray from camera through a 2D screen point into 3D scene
      const raycaster = new Raycaster()
      
      // Set ray origin and direction based on camera and mouse position
      raycaster.setFromCamera(mouseRef.current, camera)
      
      // Find all intersections with this mesh
      const intersects = raycaster.intersectObject(meshRef.current)
      
      if (intersects.length > 0) {
        const intersection = intersects[0]  // Closest intersection
        if (intersection.face) {
          // Get the face normal in world space
          const worldNormal = intersection.face.normal
            .clone()
            .transformDirection(meshRef.current.matrixWorld)  // Apply mesh rotation/scale
            .normalize()
          
          // Determine which plane this normal corresponds to
          const plane = normalToPlane(worldNormal)
          
          // Start new sketch on this plane
          startNewSketch(plane, offsetForPlane(plane, intersection.point))
        }
      }
    }
    
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [mode, newSketchArmed, camera, startNewSketch])
  
  return <mesh ref={meshRef} />
}

// THE PROBLEM:
// raycaster.intersectObject(meshRef.current) returns empty array for CSG meshes
// intersection.face is undefined
// This means the CSG geometry doesn't have proper face data OR
// the raycaster can't find intersections on CSG-generated geometry
```

---

## Part 8: Three.js Libraries - Detailed Breakdown

### THREE.BufferGeometry
```typescript
// Definition: Stores vertex data (positions, normals, indices) for rendering
// 
// Key properties:
//   .attributes.position  → THREE.BufferAttribute with vertex positions [x,y,z]
//   .index                → THREE.BufferAttribute with triangle indices
//   .computeVertexNormals()  → Calculate normals for lighting
//
// Why it matters for raycasting:
//   - Raycaster needs .index (which triangles exist)
//   - Raycaster needs .attributes.position (where vertices are)
//   - Raycaster uses this to test ray-triangle intersections
```

### THREE.Mesh
```typescript
// Definition: Combines geometry with material for rendering
//
// Constructor: new Mesh(geometry, material)
//   geometry  → Shape data (THREE.BufferGeometry)
//   material  → How to render it (THREE.MeshStandardMaterial, etc.)
//
// Key properties:
//   .matrixWorld  → Position/rotation/scale in world space
//   .geometry     → The shape
//   .material     → The appearance
//
// Used by:
//   - Scene rendering (Three.js draws it)
//   - Raycasting (tests ray against this mesh's geometry)
//   - CSG operations (takes two meshes, returns modified mesh)
```

### THREE.Raycaster
```typescript
// Definition: Casts a ray into the 3D scene to find what's under a mouse click
//
// Usage:
//   const raycaster = new Raycaster()
//   raycaster.setFromCamera(mouse2D, camera)  // Ray from camera through mouse
//   const hits = raycaster.intersectObject(mesh)  // Find intersections
//
// intersectObject returns array of:
//   {
//     distance: number        → How far from camera
//     point: Vector3          → World position of hit
//     face: Face3             → The triangle that was hit
//     object: Object3D        → The mesh that was hit
//     uv: Vector2             → Texture coordinates if applicable
//   }
//
// Problem area:
//   - If mesh geometry is malformed, face may be null
//   - If geometry has no index, raycaster can't find intersections
```

### THREE.ExtrudeGeometry
```typescript
// Definition: Converts a 2D shape into a 3D extruded solid
//
// Constructor: new ExtrudeGeometry(shapes, options)
//   shapes  → Array of THREE.Shape (2D closed paths)
//   options →
//     depth: number          → How far to extrude
//     bevelEnabled: boolean  → Round the edges?
//     steps: number          → Smoothness of extrusion
//
// Output: THREE.BufferGeometry with:
//   - Front face (original shape)
//   - Back face (extruded)
//   - Side faces (walls)
//   - All properly indexed for rendering
//
// Important: Creates geometry in LOCAL space
//   - Always extrudes along local +Z
//   - Must be rotated to match desired plane
```

### THREE.Matrix4
```typescript
// Definition: 4x4 matrix for 3D transformations (position, rotation, scale)
//
// Usage:
//   const matrix = new Matrix4()
//   matrix.makeRotationFromEuler(euler)  → Set rotation
//   matrix.setPosition(x, y, z)          → Set translation
//   geo.applyMatrix4(matrix)             → Apply to geometry vertices
//
// Why it's needed:
//   - ExtrudeGeometry is always in local XY
//   - To put it on XZ plane, must rotate -90° around X
//   - Matrix4 handles this rotation + translation in one operation
```

### @react-three/fiber's useThree Hook
```typescript
// Definition: Access Three.js scene, camera, renderer from React component
//
// Returns:
//   {
//     camera: PerspectiveCamera  → The camera object
//     scene: Scene               → The 3D scene
//     gl: WebGLRenderer          → The renderer
//     ... many more
//   }
//
// Used for:
//   - Getting camera for raycasting
//   - Accessing scene to add/remove objects
//   - Accessing renderer for custom rendering
```

---

## Part 9: Why Cut Surface Selection Isn't Working

### Hypothesis Chain:

1. **CSG-generated mesh exists and renders** ✓
   - Visual evidence: pocket cuts appear on screen
   - So THREE.Mesh creation works

2. **Raycaster doesn't find intersections** ✗
   - raycaster.intersectObject() returns empty array
   - Indicates: Either mesh geometry is malformed OR raycaster can't reach the mesh

3. **Likely root causes:**
   - **Cause A:** CSG.subtract() returns geometry without proper .index (indexed triangles)
     - Fix: After CSG operation, ensure geometry.index exists
   - **Cause B:** CSG geometry normals are wrong/missing
     - Fix: Call geometry.computeVertexNormals() after CSG
     - Status: Already done, but raycaster still fails
   - **Cause C:** Mesh boundaries unknown to raycaster
     - Fix: Call geometry.computeBoundingSphere() or geometry.center()
   - **Cause D:** Mesh has identity transform (position, rotation, scale all default)
     - Fix: Verify matrixWorld is correct, ensure mesh is actually in scene

### Next Debugging Steps:

1. **Log what CSG returns:**
   ```typescript
   const resultMesh = CSG.subtract(solidMesh, cuttingMesh)
   console.log('CSG result geometry:')
   console.log('  - Has index?', !!resultMesh.geometry.index)
   console.log('  - Index length?', resultMesh.geometry.index?.array.length)
   console.log('  - Position count?', resultMesh.geometry.attributes.position?.count)
   console.log('  - Bounds:', resultMesh.geometry.boundingSphere)
   ```

2. **Verify raycaster setup:**
   ```typescript
   const raycaster = new Raycaster()
   raycaster.setFromCamera(mouseRef.current, camera)
   
   console.log('Raycaster ray:')
   console.log('  - Origin:', raycaster.ray.origin)
   console.log('  - Direction:', raycaster.ray.direction)
   console.log('  - Near/Far:', raycaster.near, raycaster.far)
   
   const intersects = raycaster.intersectObject(meshRef.current)
   console.log('Intersection count:', intersects.length)
   if (intersects.length > 0) {
     console.log('  - First hit:', intersects[0])
   }
   ```

3. **Test if non-CSG extrudes work:**
   - Create first extrude (no cut), try to click its surface
   - If works: problem is CSG-specific
   - If doesn't work: problem is raycaster setup in general

---

## Part 10: Now You Can Code

### To Add a New Feature:

**Example: Add snap-to-grid in sketches**

```typescript
// 1. Add to state (modelStore.ts)
interface ModelState {
  gridSnap: boolean
  setGridSnap: (enabled: boolean) => void
}

// 2. Define the logic (lib/helpers.ts)
export function snapToGrid(point: SketchPoint, gridSize: number): SketchPoint {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  }
}

// 3. Use it in component (components/Viewport3D/SketchPlane.tsx)
const { gridSnap } = useModelStore()
const snappedPoint = gridSnap ? snapToGrid(point, 0.5) : point

// 4. The Three.js raycasting will still work automatically
```

### To Debug Geometry:

```typescript
// Add debug visualization (Scene.tsx)
import { BoxHelper } from 'three'

useEffect(() => {
  for (const mesh of solids) {
    const helper = new BoxHelper(mesh, 0xff0000)  // Red box around mesh
    scene.add(helper)
  }
}, [solids, scene])
```

### To Test CSG Operations:

```typescript
// In buildSolidMeshes after CSG.subtract:
const result = CSG.subtract(meshA, meshB)

// Verify geometry integrity
console.assert(result.geometry.index !== null, 'CSG result has no index!')
console.assert(result.geometry.attributes.position.count > 0, 'CSG result has no vertices!')

// Export for inspection
exportSTL([result])  // See if export works (proves geometry is valid)
```

---

## Summary: Data Flow

```
User clicks "New Sketch" → Raycaster fires on clicked face
    ↓
Face normal extracted → Converted to plane (XY/XZ/YZ)
    ↓
startNewSketch(plane, offset) called → Store updated
    ↓
Component re-renders → Enters sketch mode
    ↓
Camera animates to plane view (Scene.tsx)
    ↓
User draws lines/rects/circles → Store.sketchElements updated
    ↓
CommittedSketches renders with `<Line>` components
    ↓
User clicks "Extrude" → addExtrude() called
    ↓
sketchElementsToShape() converts to THREE.Shape[]
    ↓
ExtrudeGeometry creates 3D geometry
    ↓
Matrix4 rotates to correct plane
    ↓
buildSolidMeshes() creates final Mesh
    ↓
If 'cut': CSG.subtract() removes volume
    ↓
ExtrudedSolids renders with `<mesh>` + raycasting
    ↓
User can click new cut surfaces to start sketches
```

