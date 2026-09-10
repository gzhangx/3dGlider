# Documentation

This folder contains documentation for the 3D Glider project (constraint solver, scripting, and related guides).

## Quick Navigation

### Constraint Solver Guides

1. **[CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)** - Full Technical Documentation
   - Complete architecture explanation
   - All constraint types with examples (original 8 plus later additions)
   - Integration guide for developers
   - Performance characteristics
   - Testing strategy
   - Future improvements
   - **Read this if**: You need complete technical details

2. **[solver.md](./solver.md)** - Design and Usage
   - Problem formulation, variables, numerical method
   - Practical performance and debugging notes
   - **Read this if**: You want the design-oriented solver write-up

3. **[TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)** - Testing & Verification Guide
   - Step-by-step test scenarios
   - Visual indicators explanation
   - Debugging tips and console output
   - Troubleshooting table
   - **Read this if**: You want to verify the solver works correctly

4. **[SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md)** - Developer Quick Reference
   - API reference card
   - Integration patterns
   - Constraint types at-a-glance
   - Performance tips
   - Common patterns
   - **Read this if**: You're integrating or modifying the solver

5. **[IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md)** - Project Completion Report
   - Executive summary of the May 2026 solver delivery
   - What was delivered (catalog has grown since; see CONSTRAINT_SOLVER.md)
   - Validation and testing
   - **Read this if**: You want an overview of the original solver project

### Scripting

6. **[SCRIPTING.md](./SCRIPTING.md)** - Scripting API
   - Programmatic sketch/feature construction
   - Notes on FeatureTree-only shell (no `addShell` in the scripting API)

## File Organization

```
docs/
├── README.md (this file)
├── CONSTRAINT_SOLVER.md (technical guide)
├── solver.md (design & usage)
├── TEST_CONSTRAINT_SOLVER.md (testing guide)
├── SOLVER_QUICK_REF.md (quick reference)
├── IMPLEMENTATION_REPORT.md (project report)
└── SCRIPTING.md (scripting API)
```

Tests are located in: `tests/` (see `tests/README.md`)

## For Different Audiences

### Software Developers
- Start with: [SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md) or [solver.md](./solver.md)
- Deep dive: [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)
- Scripting: [SCRIPTING.md](./SCRIPTING.md)

### QA / Testers
- Start with: [TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)
- Reference: [SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md)

### Project Managers
- Start with: [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) and `../tasks.md`
- Details: [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)

### Learning the Solver
- Beginner: [TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)
- Intermediate: [SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md) / [solver.md](./solver.md)
- Advanced: [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md)

## Key Sections

### Algorithm & Theory
- Location: [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md) - Architecture section; also [solver.md](./solver.md)
- Topics: Newton-Raphson, residuals, Jacobian matrix, convergence

### Constraint Types
- Location: [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md) - Supported Constraint Types section
- Catalog matches `modelStore` / `constraintSolve` (coincident, length, angle, horizontal, vertical, parallel, perpendicular, equal, tangent, pointOnLine, pointOnAxis, pointAtOrigin, pointOnCircle)

### Integration Code
- Location: [SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md) - Integration Pattern section
- Copy-paste ready examples

### Testing Procedures
- Location: [TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)
- Complete scenarios to verify functionality

### Performance Metrics
- Location: [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) - Metrics section
- Convergence time, memory usage, scaling

## Quick Start

### I want to test the solver
→ Follow [TEST_CONSTRAINT_SOLVER.md](./TEST_CONSTRAINT_SOLVER.md)

### I want to integrate it
→ Copy code from [SOLVER_QUICK_REF.md](./SOLVER_QUICK_REF.md) - Integration Pattern

### I want to understand it
→ Read [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md) / [solver.md](./solver.md)

### I want the big picture
→ Read [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) and `../tasks.md`

## Recent Changes

- **May 1, 2026**: Constraint solver implemented (Newton-Raphson; original 8 types)
- **Later 2026**: Additional constraint types (tangent, pointOnLine, pointOnAxis, pointAtOrigin, pointOnCircle); loft/sweep/shell; dual STL/STEP
- **September 2026**: Docs refresh — linked `solver.md` + `SCRIPTING.md`; constraint catalogs synced to code

## Related Files

- **Source Code**: `src/lib/constraintSolve.ts`
- **Integration**: `src/components/Viewport3D/SketchPlane.tsx`
- **Tests**: `tests/` (see `tests/README.md`)
- **Project Status**: `../tasks.md`, `../next.md`, `../plan.md`

## Feedback & Issues

- Found an issue? Check [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) - Known Limitations
- Want to improve? See [CONSTRAINT_SOLVER.md](./CONSTRAINT_SOLVER.md) - Future Improvements
- Performance question? See [IMPLEMENTATION_REPORT.md](./IMPLEMENTATION_REPORT.md) - Performance Metrics

---

**Last Updated**: September 9, 2026  
**Documentation Status**: Synced with current constraint catalog  
**Implementation Status**: Production Ready
