# Tests

This folder contains test files for the 3D Glider project.

## Test Files

### `constraintSolve.test.ts`
Unit tests for the constraint solver functionality.

**Test Cases:**
1. `should maintain length constraint during dragging` - Verifies length constraint is maintained
2. `should maintain coincident constraint` - Verifies points merge correctly
3. `should maintain horizontal constraint` - Verifies line stays horizontal
4. `should maintain vertical constraint` - Verifies line stays vertical

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
**Test Status**: Ready  
**Coverage**: Core solver behavior
