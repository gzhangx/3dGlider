# Tests

This folder contains test files for the 3D Glider project.

## Test Files

### Test suites
- `constraintSolve.test.ts` covers constraint behavior.
- `modelCore.test.ts` covers solver status, constraint identity, and scripting parameters.
- `solidModel.test.ts` covers shell geometry.

**Running Tests**
```bash
npm test
```

**Notes:**
- Tests verify the core solver logic
- Use `TEST_CONSTRAINT_SOLVER.md` in docs/ for integration testing
- Tests are integration-level (not unit) and test solver behavior end-to-end

## Manual Testing

For step-by-step manual testing procedures, see:
- **[../docs/TEST_CONSTRAINT_SOLVER.md](../docs/TEST_CONSTRAINT_SOLVER.md)**

## Test Organization

```
tests/
├── README.md (this file)
└── constraintSolve.test.ts (constraint solver tests)
```

## Test Coverage

| Component | Type | Location |
|-----------|------|----------|
| Constraint Solver | Integration | `constraintSolve.test.ts` |
| Manual Testing | Functional | `../docs/TEST_CONSTRAINT_SOLVER.md` |
| Performance | Benchmarking | See docs/IMPLEMENTATION_REPORT.md |

## Future Tests

- [ ] Arc constraint tests
- [ ] Over-constrained system tests
- [ ] Large sketch performance tests
- [ ] Solver convergence benchmarks
- [ ] Edge case handling tests

---

**Last Updated**: May 1, 2026  
**Test Status**: Automated with Vitest  
**Coverage**: Solver, scripting parameters, constraint identity, and shell generation
