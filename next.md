# Next Steps

## Goal
Finish the sketch-plane refactor so New Sketch works from raycast hits on arbitrary flat faces, while keeping XY/XZ/YZ presets as convenience picks.

## Remaining Tasks

1. Remove the principal-axis-only face filter from solid picking.
   - Current blocker: [src/components/Viewport3D/ExtrudedSolids.tsx](src/components/Viewport3D/ExtrudedSolids.tsx) still rejects non-XY/XZ/YZ normals.
   - Target: any flat face accepted, using hit normal + hit point to derive `SketchPlanePose`.

2. Keep XY/XZ/YZ preset picking working through the same plane-pose path.
   - Current state: implemented in [src/components/Viewport3D/PlaneGizmo.tsx](src/components/Viewport3D/PlaneGizmo.tsx).
   - Verify no regression.

3. Refresh architecture docs to match the new plane representation.
   - Update [teach.md](d:/work/3dGlider/teach.md)
   - Update [plan.md](d:/work/3dGlider/plan.md)
   - Replace old `PlaneId + offset` explanations with `SketchPlanePose { rotation, offset }`.

4. Confirm all rendering/editing paths consistently use pose-based transforms.
   - Store: [src/store/modelStore.ts](src/store/modelStore.ts)
   - Geometry: [src/lib/sketchGeometry.ts](src/lib/sketchGeometry.ts)
   - Solids: [src/lib/solidModel.ts](src/lib/solidModel.ts)
   - Viewport sketching: [src/components/Viewport3D/SketchPlane.tsx](src/components/Viewport3D/SketchPlane.tsx)
   - Saved sketch display: [src/components/Viewport3D/CommittedSketches.tsx](src/components/Viewport3D/CommittedSketches.tsx)

5. Validate build after each implementation step.
   - Command: `npm run build`

6. Runtime validation still needed after code changes.
   - Manual test path:
   - Create Add extrude
   - Create Cut feature
   - Arm New Sketch
   - Click cut floor/wall face
   - Confirm sketch starts on hit-derived plane pose

## Execution Order

1. Remove principal face filter.
2. Build and validate.
3. Refresh docs.
4. Build and validate again.
5. Manual runtime validation.
