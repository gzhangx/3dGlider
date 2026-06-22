# Constraint Solver — Design and Usage

This document explains how geometric constraints are modeled and solved in this codebase, the numerical method used, and how the solver is integrated with the app (including practical notes for performance and debugging).

**Scope**
- The repository's solver is in `src/lib/constraintSolve.ts` and is exposed to the rest of the app via `solveConstraints(...)`.
- The solver is a Newton–Raphson style iterative method using a damped least-squares (normal equations with damping) step each iteration.

## 1. Problem formulation

Sketch geometry consists of elements (lines, rects, circles, arcs) whose shape is described by a small set of parameters: point coordinates and, for circles with tangent constraints, the radius. Constraints express relationships between these parameters (coincident points, lengths, angles, horizontality, perpendicularity, parallelism, equality, tangency, etc.).

The solver turns constraints into a set of scalar equations of the form r_i(x) = 0 where x is the vector of all free variables (typically x/y coordinates for start/end/center and optionally a radius variable). The solver builds:
- residual vector r(x) — each constraint contributes one or more scalar residuals
- Jacobian J(x) — partial derivatives of each residual with respect to each variable

The solver finds a correction δ to variables by solving a linearized system each iteration.

## 2. Variables and fixed points

A SolverVariable represents one scalar unknown: a particular element's point coordinate (`elementId`, `pointType`, `coord` in `{x,y}`) and an index into the variable vector.

The `fixedPoints` parameter lets callers mark specific coordinates as immutable for the duration of a solve. Its expected format is a `Set<string>` where each entry is `${elementId}:${pointType}` (for example `"e3:start"`). Fixed points are omitted from the variable list — they act like boundary conditions. This is used during interactive dragging so the solver moves only the allowed DOFs.

## 3. Building equations

Each high-level constraint is translated into one or more ConstraintEquation objects. Each equation exposes:
- `residual(elements): number` — compute the scalar residual r_i for the current geometry
- `jacobian(elements, variables): number[]` — returns the row of partial derivatives ∂r_i/∂x_j for all variables
- an optional `priority` used to sort equations (smaller priority solved first)

Examples:
- Coincident (p1 == p2): contributes two equations: x1-x2 and y1-y2, with Jacobian rows consisting of ±1 in the corresponding variable slots.
- Length (line length == L): residual = currentLength - L. Jacobian is ∂length/∂x for start/end coordinates computed analytically (dx/len, dy/len).
- Angle: residual = (angle2 - angle1) - targetAngle. Jacobian rows use derivatives of atan2 with respect to endpoint coordinates.
- Tangent (line, circle): residual = distance(center, line) - radius. The Jacobian is implemented using numerical differentiation (finite differences) in this code for robustness and simplicity.

The file `src/lib/constraintSolve.ts` contains `buildConstraintEquations(...)` which implements these translations and returns the list of equations used by the solver.

## 4. Iterative solution method

The solver performs these high-level steps (implementation in `solveConstraints`):
1. Gather variable list based on elements and `fixedPoints`.
2. Build the list of constraint equations and sort them by `priority`.
3. Iterate (up to `maxIterations`, default 50):
   - Compute residual vector r (size m = #equations) and measure `maxResidual`.
   - If `maxResidual < tolerance` (default 1e-6), stop: constraints are satisfied.
   - Build Jacobian J (m × n) where n = #variables.
   - Form normal equations J^T J δ = -J^T r with Tikhonov-style damping: (J^T J + λ I) δ = -J^T r where λ is small (1e-6 by default).
   - Solve the normal equations (dense linear solve via Gaussian elimination on the augmented matrix in this implementation).
   - Apply a damping factor to the update (0.5 used in code) and update the current elements by applying δ to the variable coordinates.
4. Return the updated element geometry.

The solver uses damped least-squares because the system can be:
- overdetermined (more constraints than variables),
- underdetermined (fewer constraints than variables),
- or mixed with redundant or conflicting constraints.

Damped least-squares yields a robust direction for δ even if J^T J is ill-conditioned or singular.

## 5. Linear algebra details

- The solver forms the normal matrix explicitly (n × n) and the right-hand side vector, then solves by Gaussian elimination (partial pivoting implemented inside `gaussianElimination`).
- This is a simple dense approach that is easy to implement and sufficient for small systems (typical sketch DOFs are modest). For large sketches or performance-critical code, a sparse factorization and more numerically robust linear solver (Cholesky, QR, or an iterative solver) would be preferable.

## 6. Priorities and ordering

Some constraints are flagged with higher priority (e.g., coincident constraints in this code use `priority: 10` in `buildConstraintEquations`). The solver sorts equations by priority before computing residuals and Jacobians. This ordering can help convergence by ensuring high-priority geometric relationships are addressed earlier in each iteration.

## 7. Special cases and implementation notes

- Tangent constraints use numerical differentiation for the Jacobian: each variable is perturbed slightly and the change in the tangent residual is computed. This keeps the analytic complexity low at the cost of some extra computation.
- Circles optionally include the radius as a variable only when there are tangent constraints; otherwise the radius is treated as a geometry parameter (unless a `length`/`radius` constraint manipulates it explicitly).
- Rectangles are treated as pairs of points (start/end) with helper measurement equations for width/height.
- The solver enforces a minimum radius when setting a circle radius via `setPoint` to avoid degenerate zeros.

## 8. Integration with the app and batching

- The app exposes `solveConstraints(elements, constraints, fixedPoints?)` and callers can run the solver whenever they wish. For programmatic use and debugging there is also `solveConstraintsDetailed(...)` which returns a `ConstraintSolveResult` object:

```ts
{
   elements: SketchElement[],    // updated geometry after solve
   converged: boolean,           // whether maxResidual < tolerance
   iterations: number,           // iterations performed
   maxResidual: number           // final max residual
}
```

Example (TypeScript):

```ts
import { solveConstraintsDetailed } from 'src/lib/constraintSolve'

const fixedPoints = new Set<string>(['l1:start'])
const result = solveConstraintsDetailed(elements, constraints, fixedPoints)
if (!result.converged) {
   console.warn(`Solver did not converge (maxResidual=${result.maxResidual}) after ${result.iterations} iterations`)
}
const newElements = result.elements
```

- To avoid excessive work, the store implements `addSketchConstraintsBatch(constraints, apply = true)` which appends a batch of constraints and (optionally) invokes the solver once with all constraints applied. This prevents doing N solver runs when adding N constraints.
- During interactive drag, the UI typically sets one or more `fixedPoints` (for example, keep the dragged point fixed or conversely keep the rest fixed depending on behavior), calls `solveConstraints` with those fixed points to preview the constrained motion, and then applies the final geometry on pointer up.

## 9. Convergence, robustness, and practical advice

- Good initial guesses make Newton-style methods converge faster. The solver assumes the current element geometry is a reasonable starting point (which is true for incremental edits).
- If constraints are conflicting or overconstrained, the solver may still converge to a least-squares compromise; explicit conflict detection/diagnostics is not implemented by default. To detect conflicts, inspect `maxResidual` after solve or run the solver in a debug mode to list large residuals.
- Use batching when adding many constraints at once (e.g., creating a rectangle which implies four coincident constraints). Use `addSketchConstraintsBatch` in the store to append constraints and run the solver exactly once.
- For interactive responsiveness: only include necessary variables in a solve via the `fixedPoints` parameter. For example, when dragging a single endpoint you may mark all other points fixed so the solver only needs to reposition connected elements.

## 10. Performance and future improvements

- Current implementation builds dense Jacobians and normal matrices. For larger sketches, replace the dense normal-equations approach with a sparse solver (e.g., use a sparse QR or Cholesky decomposition) to reduce memory/time cost.
- Replace numeric Jacobian approximations used for tangency with analytic derivatives if desired for speed/accuracy.
- Consider iterative linear solvers with preconditioning for very large or ill-conditioned systems.
- Add conflict detection and a small constraint-pruning policy to give user feedback (highlight unsatisfiable constraints).

## 11. Debugging tips

- To verify a particular constraint equation, inspect its residual value and the corresponding Jacobian row — both are computed in `buildConstraintEquations`.
- Print `maxResidual` each iteration to see convergence behavior.
- Use `fixedPoints` to isolate subproblems and verify local constraint satisfaction.

## 12. Where to look in the code

- Core solver: `src/lib/constraintSolve.ts` — `solveConstraints`, `buildConstraintEquations`, `gaussianElimination`, and the various `apply*` helpers.
- Store-level batching: `src/store/modelStore.ts` — `addSketchConstraintsBatch` and `applyConstraints` wrap solver usage and update store state atomically.
- UI usage patterns: `src/components/Viewport3D/SketchPlane.tsx` demonstrates how the app calls `solveConstraints` during drag and when creating elements (and how we migrated to the batch API).

---

If you want, I can also add annotated examples showing: (a) the exact variable vector and Jacobian for a small sketch (two lines sharing a coincident point), and (b) runtime traces (residuals/J entries) for a failing case to diagnose convergence issues.

## Appendix A — Worked example: two lines sharing a coincident point

Consider two lines L1 and L2 in the sketch with ids `l1` and `l2`.
- `l1` has `start = A = (0,0)` (fixed) and `end = B` (free).
- `l2` has `start = C` (should be coincident with `B`) and `end = D` (free).

Initial geometry (example):
- A = (0, 0) (fixed)
- B = (1.00, 0.00)
- C = (1.20, 0.10)
- D = (2.00, 1.00)

The solver will enumerate variables for every movable coordinate (here both endpoints of `l1` and `l2` except the fixed `A`). Using the code's convention the variable vector x can be ordered as:

```
v0 = l1.end.x   (B.x)
v1 = l1.end.y   (B.y)
v2 = l2.start.x (C.x)
v3 = l2.start.y (C.y)
v4 = l2.end.x   (D.x)
v5 = l2.end.y   (D.y)
```

Constraints for this minimal example:
- Coincident: B == C → two scalar equations:
   r1(x) = v0 - v2
   r2(x) = v1 - v3

If we also had a length constraint on `l1` of length 1.0, it would contribute:
   r3(x) = sqrt((v0 - A.x)^2 + (v1 - A.y)^2) - 1.0

Jacobian rows (analytic):
- For r1: ∂r1/∂v = [1, 0, -1, 0, 0, 0]
- For r2: ∂r2/∂v = [0, 1, 0, -1, 0, 0]
- For r3 (length): let dx = v0 - A.x, dy = v1 - A.y, len = sqrt(dx^2+dy^2).
   ∂r3/∂v = [dx/len, dy/len, 0, 0, 0, 0]

Numeric residuals with the example initial guess above:
- r1 = 1.00 - 1.20 = -0.20
- r2 = 0.00 - 0.10 = -0.10
- r3 = sqrt(1^2 + 0^2) - 1 = 0.00

So the residual vector r = [-0.2, -0.1, 0.0]. The Jacobian J is the 3×6 matrix with rows as shown. The solver forms the normal system (J^T J + λI) δ = -J^T r and solves for the correction δ to apply to the variables. Because the first two equations are simple differences, the solution will move `B` and `C` toward each other (and any length constraint will also bias the move to preserve `l1`'s length).

This small worked example demonstrates how the code maps high-level geometric constraints to simple rows in J for linear constraints (coincident, horizontal/vertical) and to analytic derivatives for length/angle constraints.

## Appendix B — Sample runtime trace for a stalled convergence

When debugging a case where the solver appears to stall (residuals stop decreasing) it's useful to log the per-iteration `maxResidual` and optionally the largest residual constraint and its Jacobian row. Below is an illustrative trace you might see for a problematic case (values are synthetic but representative):

```
Iteration 0: maxResidual = 0.312   (largest eq #7: coincident, r = 0.312)
Iteration 1: maxResidual = 0.158   (largest eq #7: r = 0.158)
Iteration 2: maxResidual = 0.079   (largest eq #12: angle, r = -0.079)
Iteration 3: maxResidual = 0.082   (largest eq #12: r = -0.082)  <-- slight increase, possible plateau
Iteration 4: maxResidual = 0.081   (largest eq #12: r = -0.081)
Iteration 5: maxResidual = 0.081   (no meaningful change)
Reached max iterations or early-stopped due to plateau.
```

What to inspect when you see this pattern:
- Which equation is the largest residual? If it's a nonlinear constraint (angle, tangent, length near zero), the Jacobian may be poorly scaled.
- Inspect the corresponding Jacobian row (or rows). If the row is near-zero (all small entries) the solver cannot move variables to reduce that residual — this indicates a degeneracy (e.g., zero-length line, coincident points collapsing DOFs).
- Check conditioning of J^T J: small pivots during Gaussian elimination indicate ill-conditioning. Options: increase damping λ, reduce the set of free variables via `fixedPoints`, or reparameterize the constraint (avoid atan2 differences very near branch cuts).

Suggested debugging steps (practical):
1. Log residuals and the index/type of the largest residual each iteration (add a temporary console.log in `solveConstraints`).
2. Print the corresponding Jacobian row for that equation and the active variable indices — look for tiny norms or unexpected zeros.
3. Try solving the same set with extra damping (increase λ) to see if convergence resumes — this points to conditioning issues.
4. Isolate the failing constraint by commenting it out or solving only a small subset (use `fixedPoints` to keep most DOFs fixed). If the smaller problem converges, the issue is with interaction between constraints.

Example diagnostic log snippet you can add inside the iteration loop:

```ts
// inside solveConstraints iteration
const residuals = equations.map((eq) => eq.residual(currentElements))
const maxResidual = Math.max(...residuals.map(Math.abs))
const worstIndex = residuals.map(Math.abs).indexOf(Math.max(...residuals.map(Math.abs)))
console.log(`iter=${iteration} maxResidual=${maxResidual.toFixed(6)} worstEq=${worstIndex} type=${equations[worstIndex].type}`)
console.log('jacobian row:', equations[worstIndex].jacobian(currentElements, variables))
```

This will quickly point you to the problematic constraint and its sensitivity to variables.

---

If you'd like, I can (a) insert an optional debug flag into `solveConstraints` that prints these traces when enabled, and (b) add a unit test that reproduces the small worked example and asserts the solver reduces the coincident residual to near zero. Which would you prefer?