# Tests

This folder contains test files for the 3D Glider project.

## Test Files

### Test suites
- `constraintSolve.test.ts` — constraint solver behavior
- `modelCore.test.ts` — solver status, constraint identity, scripting parameters
- `solidModel.test.ts` — shell / solid geometry
- `sketchInteraction.test.ts` — sketch interaction helpers

**Running Tests**
```bash
npm test
```

**Notes:**
- Tests verify core solver and geometry logic
- Use `docs/TEST_CONSTRAINT_SOLVER.md` for manual integration testing
- Mix of unit and integration-style coverage

## Manual Testing

For step-by-step manual testing procedures, see:
- **[../docs/TEST_CONSTRAINT_SOLVER.md](../docs/TEST_CONSTRAINT_SOLVER.md)**

## Test Organization

```
tests/
├── README.md (this file)
├── constraintSolve.test.ts
├── modelCore.test.ts
├── solidModel.test.ts
└── sketchInteraction.test.ts
```

## Test Coverage

| Component | Type | Location |
|-----------|------|----------|
| Constraint Solver | Automated | `constraintSolve.test.ts` |
| Model / scripting core | Automated | `modelCore.test.ts` |
| Solid / shell geometry | Automated | `solidModel.test.ts` |
| Sketch interaction | Automated | `sketchInteraction.test.ts` |
| Manual Testing | Functional | `../docs/TEST_CONSTRAINT_SOLVER.md` |

## Future Tests

- [ ] Arc constraint tests
- [ ] Over-constrained system tests
- [ ] Large sketch performance tests
- [ ] Solver convergence benchmarks
- [ ] Edge case handling tests

---

**Last Updated**: September 9, 2026  
**Test Status**: Automated with Vitest  
**Coverage**: Solver, scripting parameters, constraint identity, shell generation, sketch interaction
