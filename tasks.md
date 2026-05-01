# 3D Glider — Improvement Tasks

## Critical gaps (CAD fundamentals)

### Constraint solver
The biggest weakness. Constraints are applied once and forgotten — drag an endpoint and all constraints are violated. Real CAD uses an iterative solver (Newton-Raphson or similar) that enforces all constraints simultaneously during every drag. Without this, constraints are just convenient one-shot operations.

### Undo/Redo
No undo exists at all. Zustand supports this via `zustand/middleware` (`temporal`). Arguably the most-missed feature in any editing tool.

### Degrees-of-freedom tracking
Show how many DOF the sketch has. Color unconstrained elements blue, fully-constrained green, over-constrained red — same as SolidWorks/Fusion. Without this, users have no idea if their sketch is properly defined.

---

## Sketch capability

- **Trim / Extend** — split a line at an intersection, extend to meet another element
- **Fillet / Chamfer** — round or bevel corners between two lines
- **Offset** — create a parallel copy of a profile at a fixed distance
- **Mirror** — mirror elements across a line
- **Tangent constraint** — line tangent to circle, arc tangent to arc
- **Dimension display in viewport** — draw actual dimension lines in 3D space (not just sidebar numbers)
- **Coordinate input** — press Tab while drawing to type exact X/Y values

---

## 3D operations

- **Loft** — solid between two profiles on different planes
- **Sweep** — extrude a profile along a path
- **Shell** — hollow out a solid with a given wall thickness
- **Edge fillet/chamfer** — round or bevel edges on the 3D solid
- **Linear/circular pattern** — array a feature N times
- **Boolean operations (cut with solid)** — cut one body with another, not just with a sketch

---

## File formats

- **STEP export** — the universal CAD interchange format; STL loses topology
- **DXF import/export** — for 2D sketch exchange with other tools
- **Versioned save format** — migration logic when the JSON schema evolves

---

## UX / workflow

- **Multi-select** — drag a selection box to select multiple elements
- **Copy/paste** — duplicate sketch elements or features
- **Named sketch points / reference geometry** — datum axes, datum planes offset from existing faces
- **Feature suppression** — temporarily disable an extrude/revolve without deleting it
- **In-viewport measurements** — click two points and read the distance, angle, area

---

## Robustness

- **Error boundaries** — a crash in one feature shouldn't blank the whole viewport
- **Input validation with user feedback** — right now invalid input silently does nothing
- **Unit tests for geometry/solver** — `constraintSolve.ts` and `sketchGeometry.ts` are pure functions and trivially testable
- **Large-model performance** — memoize solid geometry; currently every frame recomputes everything

---

## Priority order (highest ROI first)

1. Undo/Redo
2. Constraint solver
3. DOF tracking
4. Trim/Extend
5. STEP export
6. Dimension display in viewport
