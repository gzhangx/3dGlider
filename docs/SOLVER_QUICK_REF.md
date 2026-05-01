# Constraint Solver - Developer Reference Card

## Quick API Reference

### Main Function
```typescript
import { solveConstraints } from 'src/lib/constraintSolve'

const solved = solveConstraints(
  elements,           // SketchElement[]
  constraints,        // SketchConstraint[]
  fixedPoints,        // Set<string> of "elementId:pointType"
  maxIterations,      // number (default: 50)
  tolerance           // number (default: 1e-6)
)
```

## Constraint Types At-a-Glance

| Type | Purpose | Variables | Notes |
|------|---------|-----------|-------|
| `coincident` | Points merge | Both (x, y) | Creates 2 equations |
| `length` | Dimension fix | Moving endpoints | Works for line/circle/rect |
| `angle` | Angle between lines | Line 2 rotates | In degrees |
| `horizontal` | Line level | Y-coords equal | Effective for alignment |
| `vertical` | Line plumb | X-coords equal | Effective for alignment |
| `parallel` | Same direction | Both lines rotate | Cross product = 0 |
| `perpendicular` | 90° angle | Both lines rotate | Dot product = 0 |
| `equal` | Same length | Both scale | Compares magnitudes |

## Integration Pattern

### In Component
```typescript
// Import solver
import { solveConstraints } from '../../lib/constraintSolve'

// During drag (in onMove handler)
if (dragTarget) {
  // 1. Update dragged point
  let updated = sketchElements.map(el =>
    el.id === dragTarget.elementId
      ? { ...el, [dragTarget.pointType]: userPosition }
      : el
  )
  
  // 2. Solve constraints
  const fixed = new Set([`${dragTarget.elementId}:${dragTarget.pointType}`])
  updated = solveConstraints(updated, sketchConstraints, fixed)
  
  // 3. Apply to store
  for (const el of updated) {
    updateSketchElement(el.id, el)
  }
}
```

## Algorithm Constants

```typescript
// Inside solveConstraints()
const maxIterations = 50
const tolerance = 1e-6           // Convergence threshold
const dampingFactor = 0.5        // Stability control (0.1-1.0)
const gaussThreshold = 1e-12     // Singular matrix threshold
```

## Point Reference Syntax

```typescript
// How to specify a point
const pointRef = {
  elementId: 'line1',           // Element ID
  which: 'end'                  // 'start' | 'end' | 'center'
}

// Creating fixed point set
const fixed = new Set<string>([
  'line1:start',                // Line start point
  'line2:center',               // Circle/arc center
  'rect1:end'                   // Rectangle endpoint
])
```

## Troubleshooting Checklist

- [ ] Constraint types correct?
- [ ] Element IDs exist in elements array?
- [ ] Fixed points reference valid elements?
- [ ] Tolerance realistic for your scale?
- [ ] Iteration limit sufficient for system?
- [ ] Over-constrained? (more constraints than DOF)
- [ ] Checking solver output in console?

## Performance Tips

1. **Don't fix too many points** - Reduces solver freedom
2. **Check constraint priority** - Solve important ones first
3. **Use damping** - Prevents oscillation
4. **Batch multiple elements** - Solve once, not per-element
5. **Monitor iterations** - If > 30 regularly, optimize constraints

## Common Patterns

### Pattern 1: Horizontal Rectangle
```typescript
constraints = [
  { type: 'horizontal', elementId: 'line1' },
  { type: 'horizontal', elementId: 'line3' },
  { type: 'vertical', elementId: 'line2' },
  { type: 'vertical', elementId: 'line4' },
  { type: 'length', elementId: 'line1', value: 10 },
  { type: 'length', elementId: 'line2', value: 5 },
  { type: 'equal', elementId1: 'line1', elementId2: 'line3' },
  { type: 'equal', elementId1: 'line2', elementId2: 'line4' },
]
```

### Pattern 2: Coincident with Constraint
```typescript
constraints = [
  { type: 'coincident', p1: { elementId: 'line1', which: 'end' }, 
                        p2: { elementId: 'line2', which: 'start' } },
  { type: 'length', elementId: 'line1', value: 8 },
  { type: 'length', elementId: 'line2', value: 8 },
  { type: 'angle', elementId1: 'line1', elementId2: 'line2', value: 45 },
]
```

## Debug Output Template

```typescript
// Add to solveConstraints for debugging
console.group('Constraint Solver Debug')
console.log('Elements:', elements.length)
console.log('Constraints:', constraints.length)
console.log('Equations:', equations.length)
console.log('Variables:', variables.length)
console.log('Fixed points:', fixedPoints?.size ?? 0)
console.log('Converged:', iteration < maxIterations)
console.log('Iterations:', iteration)
console.log('Final residual:', Math.max(...residuals.map(Math.abs)))
console.groupEnd()
```

## Jacobian Computation

Each constraint type computes jacobian showing how residual changes with each variable:

```typescript
// For coincident x:
if (element_matches && coord === 'x') return 1 or -1

// For length of line:
return (dx or dy) / Math.hypot(dx, dy)

// For angle:
return dy/r² or -dx/r² (using atan2 derivative)
```

## Known Issues & Workarounds

| Issue | Cause | Workaround |
|-------|-------|-----------|
| Solver doesn't converge | Over-constrained | Remove redundant constraints |
| Oscillating motion | Damping too high | Decrease dampingFactor |
| Constraints not satisfied | Singular jacobian | Reposition elements slightly |
| Slow performance | Too many constraints | Use construction lines for reference |

## Files to Know

- `src/lib/constraintSolve.ts` - Solver implementation (~850 lines)
- `src/components/Viewport3D/SketchPlane.tsx` - Drag integration
- `./CONSTRAINT_SOLVER.md` - Full documentation
- `./TEST_CONSTRAINT_SOLVER.md` - Testing guide

## Key Functions Reference

```typescript
// Core
solveConstraints()        // Main solver
buildConstraintEquations()// Create equation set
gaussianElimination()     // Solve linear system

// Helpers
getPoint()                // Extract coordinate
setPoint()                // Update coordinate
getEndpoint()             // Get line endpoint
lineLength()              // Calculate distance
rectWidth() / rectHeight()// Dimension measurements
```

## Version Info

- **Implemented**: May 1, 2026
- **Status**: Production ready
- **Type checking**: Strict TypeScript
- **Browser support**: Modern (ES2020+)
- **Dependencies**: None (solver only uses standard math)

---

**Last Updated**: 2026-05-01
**For detailed info**: See [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)
**To test**: See [TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)
