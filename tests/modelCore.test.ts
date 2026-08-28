import { afterEach, describe, expect, it } from 'vitest'
import { constraintsEquivalent } from '../src/lib/constraintUtils'
import { solveConstraints, solveConstraintsDetailed } from '../src/lib/constraintSolve'
import { createScriptingAPI } from '../src/lib/scriptingAPI'
import { type SketchArc, type SketchCircle, type SketchConstraint, type SketchLine, useModelStore } from '../src/store/modelStore'

describe('model core', () => {
  afterEach(() => {
    useModelStore.setState({ parameters: [], sketchElements: [], sketchConstraints: [] })
  })

  it('reports constraint solver convergence', () => {
    const elements = [{ type: 'line' as const, id: 'line', start: { x: 0, y: 0 }, end: { x: 4, y: 2 } }]
    const constraints: SketchConstraint[] = [{ id: 'horizontal', type: 'horizontal', elementId: 'line' }]
    const result = solveConstraintsDetailed(elements, constraints)

    expect(result.converged).toBe(true)
    expect(result.iterations).toBeGreaterThan(0)
    expect(result.maxResidual).toBeLessThan(1e-6)
  })

  it('recognizes symmetric constraint duplicates without casts', () => {
    const left: SketchConstraint = {
      id: 'a', type: 'coincident',
      p1: { elementId: 'one', which: 'end' }, p2: { elementId: 'two', which: 'start' },
    }
    const right: SketchConstraint = {
      id: 'b', type: 'coincident',
      p1: { elementId: 'two', which: 'start' }, p2: { elementId: 'one', which: 'end' },
    }
    expect(constraintsEquivalent(left, right)).toBe(true)
  })

  it('re-points a coincident constraint at the cut replacement instead of dropping it', () => {
    const circle: SketchCircle = { type: 'circle', id: 'c1', center: { x: 4, y: 4 }, radius: 2 }
    const line: SketchLine = { type: 'line', id: 'l1', start: { x: 4, y: 4 }, end: { x: 10, y: 10 } }
    const coincident: SketchConstraint = {
      id: 'co1', type: 'coincident',
      p1: { elementId: 'l1', which: 'start' },
      p2: { elementId: 'c1', which: 'center' },
    }
    // Stand-in for the arc(s) computeCircleCut would produce — same center, new id.
    const keptArc: SketchArc = { type: 'arc', id: 'arc1', center: { x: 4, y: 4 }, radius: 2, startAngle: 0, endAngle: 5 }

    useModelStore.setState({ sketchElements: [circle, line], sketchConstraints: [coincident] })
    useModelStore.getState().cutSketchElement('c1', [keptArc])

    const constraints = useModelStore.getState().sketchConstraints
    expect(constraints).toHaveLength(1)
    const remapped = constraints[0]
    expect(remapped.type).toBe('coincident')
    if (remapped.type === 'coincident') {
      expect(remapped.p2).toEqual({ elementId: 'arc1', which: 'center' })
    }

    // Drag the line's other endpoint — its start should stay coincident with
    // the arc's center (i.e. the constraint is actively enforced), not just
    // correctly shaped.
    const elements = useModelStore.getState().sketchElements
    const dragged = elements.map((el) => el.id === 'l1' ? { ...el, end: { x: 50, y: 50 } } : el)
    const solved = solveConstraints(dragged, constraints, new Set(['l1:end']))
    const solvedLine = solved.find((e): e is SketchLine => e.id === 'l1' && e.type === 'line')
    expect(solvedLine).toBeDefined()
    expect(Math.hypot(solvedLine!.start.x - 4, solvedLine!.start.y - 4) < 0.01).toBe(true)
  })

  it('allows scripts to update a parameter to zero', async () => {
    const api = createScriptingAPI(useModelStore)
    const id = await api.addParameter('offset', 5)
    await api.updateParameter('offset', 0)

    expect(useModelStore.getState().parameters.find((parameter) => parameter.id === id)?.value).toBe(0)
  })

})
