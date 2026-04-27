# CSG Geometry Debugging Guide

This file explains how to debug why raycasting fails on CSG-generated geometries.

## Quick Test: Is It CSG or Raycasting?

### Test 1: Check if non-cut extrudes work

1. Create a rectangle sketch on XY plane
2. Extrude it with operation **"Add"** (depth 5)
3. Exit sketch mode
4. Click **"New Sketch"** button
5. Try clicking the surface of the extrude
6. **Expected**: You should be able to click it and start a new sketch
7. **If works**: Problem is CSG-specific
8. **If doesn't work**: Problem is raycasting setup

### Test 2: Export and verify CSG geometry works

1. Create a rectangle and extrude (Add)
2. Create a circle and extrude (Cut)
3. Click STL Export
4. Open the exported file in a 3D viewer (e.g., Tinkercad, Prusa Slicer)
5. **Expected**: Should show a box with a cylinder hole
6. **If correct**: CSG produced valid geometry
7. **If wrong**: CSG is broken

## Debugging Steps

### Step 1: Add Console Logging

Edit `src/lib/solidModel.ts` and add this logging:

```typescript
export function buildSolidMeshes(extrudes: ExtrudeFeature[], sketches: Sketch[]): Mesh[] {
  const solids: Mesh[] = []

  for (const ext of extrudes) {
    const sketch = sketches.find((s) => s.id === ext.sketchId)
    if (!sketch) continue

    const featGeo = featureGeometry(ext, sketch)
    if (!featGeo) continue
    const featMesh = new Mesh(featGeo)

    if (ext.operation === 'cut') {
      if (solids.length === 0) {
        featGeo.dispose()
        continue
      }

      for (let i = 0; i < solids.length; i++) {
        // ← ADD THIS LOGGING
        console.log(`[CSG] Before subtract:`)
        console.log(`  Original mesh geometry:`, {
          indexed: !!solids[i].geometry.index,
          indexLength: solids[i].geometry.index?.array.length,
          positionCount: solids[i].geometry.attributes.position.count,
          normalCount: solids[i].geometry.attributes.normal?.count,
          bounds: solids[i].geometry.boundingSphere?.radius
        })
        
        const next = CSG.subtract(solids[i], featMesh)
        
        console.log(`[CSG] After subtract:`)
        console.log(`  Result mesh geometry:`, {
          indexed: !!next.geometry.index,
          indexLength: next.geometry.index?.array.length,
          positionCount: next.geometry.attributes.position.count,
          normalCount: next.geometry.attributes.normal?.count,
          bounds: next.geometry.boundingSphere?.radius
        })
        
        next.geometry.computeVertexNormals()
        
        console.log(`[CSG] After computeVertexNormals:`)
        console.log(`  Result mesh geometry:`, {
          normalCount: next.geometry.attributes.normal?.count,
        })

        solids[i].geometry.dispose()
        solids[i] = next
      }
      featGeo.dispose()
      continue
    }

    solids.push(featMesh)
  }

  return solids
}
```

**What to check in console:**
- `indexed: false` → Geometry has no index! This breaks raycasting
- `indexLength: undefined` → Same problem
- `positionCount: 0` → Geometry is empty
- `bounds: undefined` → Geometry boundaries unknown

### Step 2: Add Raycasting Debugging

Edit `src/components/Viewport3D/ExtrudedSolids.tsx` and replace the handleClick:

```typescript
const handleClick = () => {
  if (mode !== 'view' || !newSketchArmed || !meshRef.current) return

  console.log(`[Raycast] Click at screen pos:`, mouseRef.current)
  
  const raycaster = new Raycaster()
  raycaster.setFromCamera(mouseRef.current, camera)
  
  console.log(`[Raycast] Raycaster ray:`)
  console.log(`  Origin:`, raycaster.ray.origin)
  console.log(`  Direction:`, raycaster.ray.direction)
  console.log(`  Near/Far:`, raycaster.near, raycaster.far)
  
  console.log(`[Raycast] Mesh info:`)
  console.log(`  Position:`, meshRef.current.position)
  console.log(`  Rotation:`, meshRef.current.rotation)
  console.log(`  Scale:`, meshRef.current.scale)
  console.log(`  MatrixWorld updated?`, meshRef.current.matrixWorldAutoUpdate)
  
  console.log(`[Raycast] Geometry info:`)
  console.log(`  Has index?`, !!meshRef.current.geometry.index)
  console.log(`  Position count:`, meshRef.current.geometry.attributes.position.count)
  console.log(`  Bounds:`, meshRef.current.geometry.boundingSphere?.radius)
  
  const intersects = raycaster.intersectObject(meshRef.current)
  
  console.log(`[Raycast] Intersections found:`, intersects.length)
  if (intersects.length > 0) {
    const hit = intersects[0]
    console.log(`  First hit:`)
    console.log(`    - Distance:`, hit.distance)
    console.log(`    - Point:`, hit.point)
    console.log(`    - Face:`, hit.face ? `Triangle(a=${hit.face.a}, b=${hit.face.b}, c=${hit.face.c})` : 'NONE')
    
    if (hit.face) {
      const worldNormal = hit.face.normal.clone().transformDirection(meshRef.current.matrixWorld).normalize()
      if (!isFlatPrincipalFace(worldNormal)) return
      const plane = normalToPlane(worldNormal)
      startNewSketch(plane, offsetForPlane(plane, hit.point))
    }
  } else {
    console.log(`  ✗ No intersections found!`)
    console.log(`  This could mean:`)
    console.log(`    1. Geometry has no index (CSG problem)`)
    console.log(`    2. Mesh is not in scene`)
    console.log(`    3. Ray doesn't hit geometry bounds`)
  }
}
```

### Step 3: Manually Verify CSG Structure

Open browser DevTools console and paste:

```javascript
// Get the first solid mesh
const scene = window.__THREE__.scene  // If available
// Or inspect via React DevTools → Viewport3D → Scene → meshRef

// Once you have a mesh reference:
const mesh = window.debugMesh  // Set from component

console.log('Manual CSG Geometry Check:')
console.log('Index:', mesh.geometry.index)
console.log('Index array:', mesh.geometry.index?.array)
console.log('Position array length:', mesh.geometry.attributes.position.array.length)
console.log('Normal array length:', mesh.geometry.attributes.normal?.array.length)

// Try manual intersection test
const raycaster = new THREE.Raycaster(
  new THREE.Vector3(0, 0, 10),  // From above
  new THREE.Vector3(0, 0, -1)   // Pointing down
)
const hits = raycaster.intersectObject(mesh)
console.log('Manual raycaster test:', hits)
```

## Possible Outcomes

### Outcome A: CSG geometry has no index
```
indexed: false
indexLength: undefined
```
**Solution**: CSG library is broken or doesn't create indexed geometry
**Action**: Need to rebuild geometry after CSG:
```typescript
// After CSG.subtract()
const rebuildGeo = new THREE.BufferGeometry()
rebuildGeo.setAttribute('position', next.geometry.attributes.position)
rebuildGeo.computeVertexNormals()
// This may or may not fix it
```

### Outcome B: CSG geometry exists but position is empty
```
positionCount: 0
```
**Solution**: CSG failed to perform subtraction
**Action**: 
- Check if both input meshes are valid
- Check if they actually overlap
- Check if pocket geometry is inverted (normal facing wrong direction)

### Outcome C: Geometry exists but raycaster returns empty
```
indexed: true
indexLength: 1000
// but Intersections found: 0
```
**Solution**: Raycaster can't find it even though geometry is valid
**Action**: 
- Check mesh.matrixWorld is correct
- Check mesh is actually in scene (add to Three.js inspector)
- Try manually testing: raycaster.setFromCamera() with debug values

### Outcome D: Raycaster finds intersections but no face
```
Intersections found: 1
face: NONE
```
**Solution**: Face data structure is corrupted
**Action**: This is rare; suggests geometry structure is deeply broken

## How to Expose debugMesh to Console

Add this to ExtrudedSolids.tsx in the SolidMesh component:

```typescript
useEffect(() => {
  if (meshRef.current) {
    // Make it accessible from browser console for debugging
    (window as any).debugSolidMesh = meshRef.current
    console.log('[DEBUG] Solid mesh exposed to window.debugSolidMesh')
    return () => {
      delete (window as any).debugSolidMesh
    }
  }
}, [])
```

Then in browser console:
```javascript
console.log(window.debugSolidMesh.geometry)
```

## If CSG Library is Broken

**Alternative: Use indexed geometry rebuild**

```typescript
function ensureIndexedGeometry(mesh: Mesh): Mesh {
  const geo = mesh.geometry
  
  // If already indexed, return as-is
  if (geo.index) return mesh
  
  // If not indexed, rebuild from position array
  const positions = geo.attributes.position.array as Float32Array
  const triangles = positions.length / 3
  const indices = new Uint32Array(triangles)
  for (let i = 0; i < triangles; i++) {
    indices[i] = i
  }
  
  const newGeo = new BufferGeometry()
  newGeo.setAttribute('position', new BufferAttribute(positions, 3))
  newGeo.setIndex(new BufferAttribute(indices, 1))
  newGeo.computeVertexNormals()
  
  const newMesh = new Mesh(newGeo, mesh.material)
  newMesh.position.copy(mesh.position)
  newMesh.rotation.copy(mesh.rotation)
  newMesh.scale.copy(mesh.scale)
  
  return newMesh
}

// Use in buildSolidMeshes:
const result = CSG.subtract(solids[i], featMesh)
const fixedMesh = ensureIndexedGeometry(result)
solids[i] = fixedMesh
```

## Alternative Solution: Replace CSG Library

If debugging shows CSG is fundamentally broken:

1. **Try manifold-3d** (higher quality, more reliable)
   ```bash
   npm remove three-csg-ts
   npm install manifold-3d
   ```

2. **Use a different CSG library** (csg-ts)
   ```bash
   npm remove three-csg-ts
   npm install @jscad/modeling
   ```

3. **Fall back to non-CSG approach**
   - Disable cut operation
   - Use only Add (extrude)
   - Release v0.1 extrude-only version

## Summary Checklist

- [ ] Added console logging to buildSolidMeshes()
- [ ] Run with cut feature and check console
- [ ] Check if CSG returns indexed geometry
- [ ] Added raycasting debug logging to ExtrudedSolids
- [ ] Click a cut surface and inspect console output
- [ ] Determine if problem is CSG or raycasting
- [ ] If CSG: try ensureIndexedGeometry fix
- [ ] If still broken: consider replacing CSG library
- [ ] Verify non-cut extrudes work

