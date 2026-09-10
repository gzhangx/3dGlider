# 3D Glider Project Plan & Status

> Historical implementation plan (originally April 2026). **Current status and remaining work:** see `tasks.md` and `next.md`.

**Docs refreshed:** September 2026 (aligned with current `src/`)

---

## Executive Summary

3D Glider is a web-based CAD app for 2D sketches and 3D features (extrude/cut, revolve, loft, sweep, shell), with a live constraint solver, JSON save/load, and **both STL and STEP** export.

The April 2026 “CSG raycast / cut-face not pickable” blocker and the old `PlaneId + offset` plane model are **retired**. Sketches use **`SketchPlanePose`**; New Sketch on extruded solid faces uses `planePoseFromHit` (any flat face, not principal-axis-only).

---

## Current Architecture (brief)

### Plane model: `SketchPlanePose`

```typescript
interface SketchPlanePose {
  rotation: [number, number, number]  // Euler XYZ
  offset: number                      // along plane normal from origin
}
```

- Presets: `presetPlanePose('XY'|'XZ'|'YZ', offset?)`
- Face pick: `planePoseFromHit(normal, point)` in `src/lib/planePose.ts`
- Used by store, sketch geometry, solid/revolve/loft/sweep builders, and viewport sketching

`PlaneId` remains only as a convenience label for orthogonal presets (`planeIdFromPose` → XY/XZ/YZ/Custom).

### Feature stack

| Feature | Status | Notes |
|---------|--------|-------|
| Extrude add/cut | Implemented | CSG via three-csg-ts; face pick for New Sketch |
| Revolve | Implemented | Mesh render; **no** New Sketch face pick on revolve meshes |
| Loft | Implemented | Mesh render; **no** New Sketch face pick on loft meshes |
| Sweep | Implemented | Mesh render + export; **no** New Sketch face pick on sweep meshes |
| Shell | Implemented | `applyShellFeatures` in model build + export; FeatureTree still labels “(pending mesh)” |
| Constraints | Implemented | Newton solver; see `docs/CONSTRAINT_SOLVER.md` / `docs/solver.md` |
| Export | STL + STEP | Mesh-derived STEP (not full B-rep) |

### Stack

React + TypeScript + Vite · Zustand · Three.js / R3F / drei · three-csg-ts

---

## What was retired from this plan

- ~~PlaneId + offset as the sketch plane representation~~ → `SketchPlanePose`
- ~~CSG-raycast-as-current-blocker / cut faces not clickable~~ → fixed; ExtrudedSolids uses hit-derived poses
- ~~“No loft / sweep / shell / constraints”~~ → all implemented (see `tasks.md`)
- ~~Principal-axis-only face filter~~ → removed; see `next.md`

Historical CSG debug notes: `DEBUG_CSG.md` (labeled historical).

---

## Where to go next

1. **`next.md`** — remaining plane/docs/runtime validation items  
2. **`tasks.md`** — open product gaps (undo/redo, DOF, trim, etc.)  
3. **`teach.md`** — current-code teaching guide (ignore the historical “Complete Architecture” appendix)

---

## Testing / validation notes

- Automated: `tests/` (constraint solver, model core, solid/shell, sketch interaction) — `npm test`
- Manual still useful: Add → Cut → New Sketch → click cut floor/wall → confirm pose-based sketch start
