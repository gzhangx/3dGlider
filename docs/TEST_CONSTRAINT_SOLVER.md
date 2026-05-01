# Constraint Solver - Quick Test Guide

## How to Test the Solver

### Setup
1. Run `npm run dev` to start the dev server (http://localhost:5173)
2. The app will load with the existing model/sketches

### Test 1: Simple Length Constraint

1. **Create New Sketch** → Select XY plane → Start
2. **Draw Line Tool** (press L)
   - Click at (0, 0)
   - Click at (10, 0) to create horizontal line
3. **Switch to Select Tool** (press S)
4. **Add Length Constraint**
   - Right-click on the line
   - Select "Dimension" or use constraint menu
   - Set value to 5 units
5. **Drag Test**
   - Grab the right endpoint (white circle)
   - Drag it around
   - **Expected**: Line maintains length = 5, endpoint moves on circle
   - The endpoint moves but the line length stays constant

### Test 2: Coincident Constraint

1. **Draw two lines** (using L tool)
   - Line 1: (0, 0) → (5, 0)
   - Line 2: (6, 1) → (6, 5)
   
2. **Add Coincident Constraint**
   - Press S for select mode
   - Hold Shift and click Line 1 end, then Line 2 start
   - Use "Coincident" constraint (check constraint menu/right-click)

3. **Drag Test**
   - Grab either line's endpoint
   - **Expected**: Both endpoints snap together and move as one when dragging either

### Test 3: Horizontal Constraint

1. **Draw a line** at an angle
   - Line: (0, 0) → (5, 3)

2. **Add Horizontal Constraint**
   - Select line with S tool
   - Add "Horizontal" constraint
   - **Expected**: Line immediately snaps horizontal

3. **Drag Test**
   - Grab the endpoint
   - Drag it up and down
   - **Expected**: Line stays perfectly horizontal (y-coordinates of endpoints equal)

### Test 4: Parallel Lines

1. **Draw two lines at different angles**
   - Line 1: (0, 0) → (5, 3)
   - Line 2: (0, 5) → (7, 5)

2. **Add Parallel Constraint**
   - Select both lines (click, then Shift+click)
   - Add "Parallel" constraint

3. **Drag Test**
   - Grab an endpoint
   - **Expected**: Both lines rotate to stay parallel

### Test 5: Multiple Constraints

1. **Create a rectangle** by drawing lines:
   - Line 1 (horizontal): (0, 0) → (5, 0)
   - Line 2 (vertical): (5, 0) → (5, 3)
   - Line 3 (horizontal): (5, 3) → (0, 3)
   - Line 4 (vertical): (0, 3) → (0, 0)

2. **Add constraints**:
   - All horizontal lines: length = 5
   - All vertical lines: length = 3
   - Add horizontal/vertical constraints to ensure orientation

3. **Drag Test**
   - Grab any corner
   - **Expected**: Rectangle maintains shape, adjusting position to satisfy all constraints

## Visual Indicators

- **White circles** = draggable points
- **Yellow lines** = normal geometry
- **Blue dashed lines** = construction geometry (not part of profile)

## Console Debugging

Open browser console (F12) to see:
- Constraint solver convergence messages (if logging enabled)
- Any residual values showing constraint satisfaction
- Warnings about hex color parsing (can be ignored)

## What to Look For

✓ **Solver Working Well:**
- Points snap smoothly when dragging
- Constraints are maintained continuously
- No flickering or jittering
- Elements deform smoothly within constraints

✗ **Solver Issues:**
- Points "break" constraints when dragged
- Oscillating/jerky motion
- Crashes or blank screen
- Elements snap unexpectedly

## Performance

- Target: < 5ms per drag frame
- If slower: Check browser dev tools Performance tab
- Look for constraint solver function taking > 5ms

## Known Quirks

1. **Over-constrained systems**: If you add too many constraints (more than DOF), solver will find a least-squares solution but may not satisfy all exactly

2. **Large movements**: Dragging very far in one frame might need more iterations to converge

3. **Singular configurations**: If a constraint becomes impossible (e.g., perpendicular + parallel), solver may stall

## Next Steps After Verification

- [ ] Test with more complex constraint combinations
- [ ] Verify performance on sketches with 50+ elements
- [ ] Test with arc constraints
- [ ] Verify integration with parametric dimensions
- [ ] Test undo/redo with constraints

---

## Debug Code (add to SketchPlane.tsx if needed)

```typescript
// Add to solveConstraints in constraintSolve.ts to log convergence:
if (iteration > 0 && iteration % 10 === 0) {
  console.log(`Solver iteration ${iteration}: max residual = ${maxResidual.toFixed(6)}`)
}

// At convergence:
console.log(`✓ Solver converged in ${iteration} iterations`)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Constraints not working | Check browser console for errors, refresh page |
| Dragging is slow | Reduce number of constraints, check Performance tab |
| Elements jump around | Likely damping factor too low, increase from 0.5 to 0.7 |
| Constraints partially satisfied | Over-constrained system, remove conflicting constraints |

---

For full technical details, see [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)
