# Next Steps

## Goal
Keep sketch-plane and docs aligned with the `SketchPlanePose` model, and finish remaining validation. New Sketch from raycast hits on **extruded** flat faces already uses hit normal + point → `SketchPlanePose` (XY/XZ/YZ presets still work via the same pose path).

## Status

1. **DONE** — Principal-axis-only face filter removed.
   - `src/components/Viewport3D/ExtrudedSolids.tsx` calls `startNewSketch(planePoseFromHit(worldNormal, e.point))` for any flat face hit (no XY/XZ/YZ normal reject).

2. **DONE** — XY/XZ/YZ preset picking through the same plane-pose path.
   - `src/components/Viewport3D/PlaneGizmo.tsx` / `presetPlanePose` in the store.

3. **In progress** — Refresh architecture docs to match the new plane representation.
   - Update `teach.md`, `plan.md`, and related docs: replace old `PlaneId + offset` explanations with `SketchPlanePose { rotation, offset }`.

4. **Mostly done** — Rendering/editing paths use pose-based transforms.
   - Store: `src/store/modelStore.ts`
   - Geometry: `src/lib/sketchGeometry.ts`
   - Solids: `src/lib/solidModel.ts`
   - Viewport: `src/components/Viewport3D/SketchPlane.tsx`, `CommittedSketches.tsx`
   - Spot-check after further edits; keep consistent with pose APIs in `src/lib/planePose.ts`.

5. Validate build after doc/code changes: `npm run build`

6. **Still needed** — Manual runtime validation.
   - Create Add extrude → Cut feature → Arm New Sketch → Click cut floor/wall face → Confirm sketch starts on hit-derived plane pose

## New Sketch face pick coverage (verified in code)

| Solid renderer | Face pick for New Sketch |
|----------------|--------------------------|
| `ExtrudedSolids.tsx` | Yes — `planePoseFromHit` |
| `RevolvedSolids.tsx` | No — render-only mesh |
| `LoftedSolids.tsx` | No — render-only mesh |
| `SweepedSolids.tsx` | No — render-only mesh |

Loft / revolve / sweep solids **do not** currently support New Sketch face picking; only extruded solids do.

## Remaining execution order

1. Finish docs refresh (`teach.md` historical appendix, constraint catalogs, tests README, etc.).
2. Build validate if touching code (docs-only changes skip).
3. Manual runtime validation of cut-face New Sketch.
