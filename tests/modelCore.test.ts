import { afterEach, describe, expect, it } from 'vitest'
import { constraintsEquivalent } from '../src/lib/constraintUtils'
import { solveConstraintsDetailed } from '../src/lib/constraintSolve'
import { createScriptingAPI } from '../src/lib/scriptingAPI'
import { type SketchConstraint, useModelStore } from '../src/store/modelStore'

describe('model core', () => {
  afterEach(() => {
    useModelStore.setState({ parameters: [] })
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

  it('allows scripts to update a parameter to zero', async () => {
    const api = createScriptingAPI(useModelStore)
    const id = await api.addParameter('offset', 5)
    await api.updateParameter('offset', 0)

    expect(useModelStore.getState().parameters.find((parameter) => parameter.id === id)?.value).toBe(0)
  })

})
