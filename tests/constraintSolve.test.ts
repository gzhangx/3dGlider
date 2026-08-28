import { describe, expect, it } from 'vitest'
import { solveConstraints } from '../src/lib/constraintSolve'
import type { SketchCircle, SketchConstraint, SketchLine } from '../src/store/modelStore'

describe('Constraint Solver', () => {
  it('should maintain length constraint during dragging', () => {
    // Create a line with initial length 10
    const line: SketchLine = {
      type: 'line',
      id: 'line1',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    }

    // Add a length constraint of 10 units
    const constraints: SketchConstraint[] = [
      {
        id: 'length1',
        type: 'length',
        elementId: 'line1',
        value: 10,
      },
    ]

    // Simulate dragging: move endpoint to (12, 3) but constraint should adjust to maintain length
    const updatedLine = {
      ...line,
      end: { x: 12, y: 3 },
    }

    // Solve constraints with this endpoint moved but fixed
    const solved = solveConstraints([updatedLine], constraints, new Set(['line1:end']))

    // Check that line length is still approximately 10
    const dx = solved[0].type === 'line' ? solved[0].end.x - solved[0].start.x : 0
    const dy = solved[0].type === 'line' ? solved[0].end.y - solved[0].start.y : 0
    const length = Math.hypot(dx, dy)

    console.log(`Length before: ${Math.hypot(12, 3)}`)
    console.log(`Length after solving: ${length}`)
    expect(Math.abs(length - 10) < 0.01).toBe(true)
  })

  it('should maintain point-on-circle constraint', () => {
    const circle = {
      type: 'circle' as const,
      id: 'c1',
      center: { x: 0, y: 0 },
      radius: 5,
    }

    const line: SketchLine = {
      type: 'line',
      id: 'l1',
      start: { x: 0, y: 5 }, // on circle
      end: { x: 2, y: 4 },
    }

    const constraints: SketchConstraint[] = [
      { id: 'poc1', type: 'pointOnCircle', p: { elementId: 'l1', which: 'start' }, circleId: 'c1' },
    ]

    const solved = solveConstraints([circle, line], constraints)

    const solvedCircle = solved.find((e): e is SketchCircle => e.id === 'c1' && e.type === 'circle')
    const solvedLine = solved.find((e): e is SketchLine => e.id === 'l1' && e.type === 'line')

    if (solvedCircle && solvedLine) {
      const dx = solvedLine.start.x - solvedCircle.center.x
      const dy = solvedLine.start.y - solvedCircle.center.y
      const dist = Math.hypot(dx, dy)
      expect(Math.abs(dist - solvedCircle.radius) < 0.01).toBe(true)
    }
  })

  it('should maintain coincident constraint', () => {
    // Create two lines whose endpoints should be coincident
    const line1: SketchLine = {
      type: 'line',
      id: 'line1',
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
    }

    const line2: SketchLine = {
      type: 'line',
      id: 'line2',
      start: { x: 5, y: 1 }, // Slightly off
      end: { x: 5, y: 5 },
    }

    const constraints: SketchConstraint[] = [
      {
        id: 'coin1',
        type: 'coincident',
        p1: { elementId: 'line1', which: 'end' },
        p2: { elementId: 'line2', which: 'start' },
      },
    ]

    const solved = solveConstraints([line1, line2], constraints)

    if (solved[0].type === 'line' && solved[1].type === 'line') {
      const pt1End = solved[0].end
      const pt2Start = solved[1].start
      const dist = Math.hypot(pt1End.x - pt2Start.x, pt1End.y - pt2Start.y)

      console.log(`Distance between coincident points: ${dist}`)
      expect(dist < 0.01).toBe(true)
    }
  })

  it('should not pull a point toward the origin when its coincident partner element is gone', () => {
    // Simulates dragging a line after the element its endpoint was made
    // coincident with (e.g. a circle's center) has been cut/deleted, leaving
    // a dangling constraint that references a nonexistent element id.
    const line: SketchLine = {
      type: 'line',
      id: 'line1',
      start: { x: 4, y: 4 },
      end: { x: 8, y: 8 },
    }

    const constraints: SketchConstraint[] = [
      {
        id: 'coin1',
        type: 'coincident',
        p1: { elementId: 'line1', which: 'start' },
        p2: { elementId: 'deleted-circle', which: 'center' },
      },
    ]

    // Drag the line's end; its start should stay put, not jump toward (0, 0).
    const dragged = { ...line, end: { x: 50, y: 50 } }
    const solved = solveConstraints([dragged], constraints, new Set(['line1:end']))

    const solvedLine = solved.find((e): e is SketchLine => e.id === 'line1' && e.type === 'line')
    expect(solvedLine).toBeDefined()
    expect(Math.hypot(solvedLine!.start.x - 4, solvedLine!.start.y - 4) < 0.01).toBe(true)
  })

  it('should maintain horizontal constraint', () => {
    const line: SketchLine = {
      type: 'line',
      id: 'line1',
      start: { x: 0, y: 2 },
      end: { x: 10, y: 2 },
    }

    const constraints: SketchConstraint[] = [
      {
        id: 'h1',
        type: 'horizontal',
        elementId: 'line1',
      },
    ]

    // Drag end point up slightly
    const draggedLine = {
      ...line,
      end: { x: 10, y: 5 },
    }

    const solved = solveConstraints([draggedLine], constraints, new Set(['line1:end']))

    if (solved[0].type === 'line') {
      const dy = solved[0].end.y - solved[0].start.y
      console.log(`Y difference after solving: ${dy}`)
      expect(Math.abs(dy) < 0.01).toBe(true)
    }
  })

  it('should maintain radius length constraint when a tangent line is dragged', () => {
    const circle: SketchCircle = {
      type: 'circle',
      id: 'c1',
      center: { x: 0, y: 0 },
      radius: 5,
    }

    // Horizontal line tangent to the circle's top (y = 5)
    const line: SketchLine = {
      type: 'line',
      id: 'l1',
      start: { x: -5, y: 5 },
      end: { x: 5, y: 5 },
    }

    const constraints: SketchConstraint[] = [
      { id: 'radius1', type: 'length', elementId: 'c1', value: 5, dimension: 'radius' },
      { id: 'tangent1', type: 'tangent', elementId1: 'c1', elementId2: 'l1' },
    ]

    // Drag the tangent line further away — without the radius constraint pulling back,
    // the solver would grow the circle to stay tangent instead.
    const draggedLine = { ...line, start: { x: -5, y: 8 }, end: { x: 5, y: 8 } }

    const solved = solveConstraints([circle, draggedLine], constraints, new Set(['l1:start', 'l1:end']))

    const solvedCircle = solved.find((e): e is SketchCircle => e.id === 'c1' && e.type === 'circle')
    expect(solvedCircle).toBeDefined()
    expect(Math.abs(solvedCircle!.radius - 5) < 0.01).toBe(true)
  })

  it('should maintain vertical constraint', () => {
    const line: SketchLine = {
      type: 'line',
      id: 'line1',
      start: { x: 3, y: 0 },
      end: { x: 3, y: 10 },
    }

    const constraints: SketchConstraint[] = [
      {
        id: 'v1',
        type: 'vertical',
        elementId: 'line1',
      },
    ]

    // Drag end point to the right
    const draggedLine = {
      ...line,
      end: { x: 8, y: 10 },
    }

    const solved = solveConstraints([draggedLine], constraints, new Set(['line1:end']))

    if (solved[0].type === 'line') {
      const dx = solved[0].end.x - solved[0].start.x
      console.log(`X difference after solving: ${dx}`)
      expect(Math.abs(dx) < 0.01).toBe(true)
    }
  })
})
