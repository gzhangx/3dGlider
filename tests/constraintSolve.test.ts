import { describe, expect, it } from 'vitest'
import { solveConstraints, solveConstraintsDetailed } from '../src/lib/constraintSolve'
import type { SketchArc, SketchCircle, SketchConstraint, SketchLine } from '../src/store/modelStore'

function arcEndpoint(arc: SketchArc, which: 'start' | 'end') {
  const angle = which === 'start' ? arc.startAngle : arc.endAngle
  return {
    x: arc.center.x + Math.cos(angle) * arc.radius,
    y: arc.center.y + Math.sin(angle) * arc.radius,
  }
}

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
    expect(Math.abs(dx) < 0.01).toBe(true)
    }
  })

  it('keeps a line coincident with an arc endpoint when the line is dragged off the circle', () => {
    const arc: SketchArc = {
      type: 'arc',
      id: 'arc1',
      center: { x: 0, y: 0 },
      radius: 5,
      startAngle: 0,
      endAngle: Math.PI / 2,
    }
    const line: SketchLine = {
      type: 'line',
      id: 'l1',
      start: { x: 10, y: 0 },
      end: { x: 5, y: 0 },
    }
    const stray: SketchLine = {
      type: 'line',
      id: 'l2',
      start: { x: 20, y: 20 },
      end: { x: 24, y: 20 },
    }
    const constraints: SketchConstraint[] = [
      { id: 'join', type: 'coincident', p1: { elementId: 'l1', which: 'end' }, p2: { elementId: 'arc1', which: 'start' } },
    ]

    const draggedLine = { ...line, end: { x: 8, y: 3 } }
    const solved = solveConstraints(
      [arc, draggedLine, stray],
      constraints,
      new Set(['l1:end']),
    )

    const solvedArc = solved.find((e): e is SketchArc => e.id === 'arc1' && e.type === 'arc')!
    const solvedLine = solved.find((e): e is SketchLine => e.id === 'l1' && e.type === 'line')!
    const solvedStray = solved.find((e): e is SketchLine => e.id === 'l2' && e.type === 'line')!
    const start = arcEndpoint(solvedArc, 'start')

    expect(Math.abs(solvedArc.radius - 5)).toBeLessThan(0.01)
    expect(Math.hypot(solvedLine.end.x - start.x, solvedLine.end.y - start.y)).toBeLessThan(0.02)
    expect(solvedStray.start).toEqual(stray.start)
    expect(solvedStray.end).toEqual(stray.end)
  })

  it('keeps arc radius and tangency when a tangent line is dragged', () => {
    const arc: SketchArc = {
      type: 'arc',
      id: 'arc1',
      center: { x: 0, y: 0 },
      radius: 5,
      startAngle: 0,
      endAngle: Math.PI / 2,
    }
    const line: SketchLine = {
      type: 'line',
      id: 'l1',
      start: { x: -5, y: 5 },
      end: { x: 5, y: 5 },
    }
    const constraints: SketchConstraint[] = [
      { id: 't1', type: 'tangent', elementId1: 'l1', elementId2: 'arc1' },
      { id: 'join', type: 'coincident', p1: { elementId: 'l1', which: 'end' }, p2: { elementId: 'arc1', which: 'end' } },
    ]

    const draggedLine = { ...line, start: { x: -5, y: 8 }, end: { x: 5, y: 8 } }
    const solved = solveConstraints(
      [arc, draggedLine],
      constraints,
      new Set(['l1:start', 'l1:end']),
    )

    const solvedArc = solved.find((e): e is SketchArc => e.id === 'arc1' && e.type === 'arc')!
    const solvedLine = solved.find((e): e is SketchLine => e.id === 'l1' && e.type === 'line')!
    const end = arcEndpoint(solvedArc, 'end')
    const dx = solvedLine.end.x - solvedLine.start.x
    const dy = solvedLine.end.y - solvedLine.start.y
    const dist = Math.abs(dy * solvedArc.center.x - dx * solvedArc.center.y + solvedLine.end.x * solvedLine.start.y - solvedLine.end.y * solvedLine.start.x) / Math.hypot(dx, dy)

    expect(Math.abs(solvedArc.radius - 5)).toBeLessThan(0.01)
    expect(Math.abs(dist - solvedArc.radius)).toBeLessThan(0.05)
    expect(Math.hypot(solvedLine.end.x - end.x, solvedLine.end.y - end.y)).toBeLessThan(0.05)
  })

  it('keeps two coincident tangent lines attached when the shared corner is dragged', () => {
    const circle: SketchCircle = {
      type: 'circle',
      id: 'c1',
      center: { x: 2, y: 2 },
      radius: 2,
    }
    const lineH: SketchLine = {
      type: 'line',
      id: 'lh',
      start: { x: -6, y: 4 },
      end: { x: 0, y: 4 },
    }
    const lineV: SketchLine = {
      type: 'line',
      id: 'lv',
      start: { x: 0, y: 4 },
      end: { x: 0, y: -2 },
    }
    const constraints: SketchConstraint[] = [
      { id: 'join', type: 'coincident', p1: { elementId: 'lh', which: 'end' }, p2: { elementId: 'lv', which: 'start' } },
      { id: 'th', type: 'tangent', elementId1: 'lh', elementId2: 'c1' },
      { id: 'tv', type: 'tangent', elementId1: 'lv', elementId2: 'c1' },
    ]

    const dragged = { ...lineH, end: { x: 1, y: 6 } }
    const solved = solveConstraints(
      [circle, dragged, lineV],
      constraints,
      new Set(['lh:end']),
    )

    const solvedCircle = solved.find((e): e is SketchCircle => e.id === 'c1' && e.type === 'circle')!
    const solvedH = solved.find((e): e is SketchLine => e.id === 'lh' && e.type === 'line')!
    const solvedV = solved.find((e): e is SketchLine => e.id === 'lv' && e.type === 'line')!

    expect(Math.hypot(solvedH.end.x - 1, solvedH.end.y - 6)).toBeLessThan(0.05)
    expect(Math.hypot(solvedH.end.x - solvedV.start.x, solvedH.end.y - solvedV.start.y)).toBeLessThan(0.05)
    expect(Math.abs(solvedCircle.radius - 2)).toBeLessThan(0.01)
    expect(Math.hypot(solvedH.start.x + 6, solvedH.start.y - 4)).toBeLessThan(1.5)
    expect(Math.hypot(solvedV.end.x - 0, solvedV.end.y + 2)).toBeLessThan(1.5)

    const distH = Math.abs(solvedH.end.y - solvedH.start.y) < 1e-9
      ? Math.abs(solvedCircle.center.y - solvedH.start.y)
      : Math.abs((solvedH.end.y - solvedH.start.y) * solvedCircle.center.x - (solvedH.end.x - solvedH.start.x) * solvedCircle.center.y + solvedH.end.x * solvedH.start.y - solvedH.end.y * solvedH.start.x) / Math.hypot(solvedH.end.x - solvedH.start.x, solvedH.end.y - solvedH.start.y)
    const distV = Math.abs((solvedV.end.y - solvedV.start.y) * solvedCircle.center.x - (solvedV.end.x - solvedV.start.x) * solvedCircle.center.y + solvedV.end.x * solvedV.start.y - solvedV.end.y * solvedV.start.x) / Math.hypot(solvedV.end.x - solvedV.start.x, solvedV.end.y - solvedV.start.y)
    expect(Math.abs(distH - solvedCircle.radius)).toBeLessThan(0.08)
    expect(Math.abs(distV - solvedCircle.radius)).toBeLessThan(0.08)
  })

  it('keeps snap-created tangent+point-on-circle lines attached when the shared corner is dragged', () => {
    const circle: SketchCircle = {
      type: 'circle',
      id: 'c1',
      center: { x: 2, y: 2 },
      radius: 2,
    }
    const lineH: SketchLine = {
      type: 'line',
      id: 'lh',
      start: { x: 0, y: 4 },
      end: { x: 2, y: 4 },
    }
    const lineV: SketchLine = {
      type: 'line',
      id: 'lv',
      start: { x: 0, y: 4 },
      end: { x: 0, y: 2 },
    }
    const constraints: SketchConstraint[] = [
      { id: 'join', type: 'coincident', p1: { elementId: 'lh', which: 'start' }, p2: { elementId: 'lv', which: 'start' } },
      { id: 'th', type: 'tangent', elementId1: 'lh', elementId2: 'c1' },
      { id: 'tv', type: 'tangent', elementId1: 'lv', elementId2: 'c1' },
      { id: 'ph', type: 'pointOnCircle', p: { elementId: 'lh', which: 'end' }, circleId: 'c1' },
      { id: 'pv', type: 'pointOnCircle', p: { elementId: 'lv', which: 'end' }, circleId: 'c1' },
    ]

    const dragged = { ...lineH, start: { x: 1, y: 6 } }
    const solved = solveConstraints(
      [circle, dragged, lineV],
      constraints,
      new Set(['lh:start']),
    )

    const solvedCircle = solved.find((e): e is SketchCircle => e.id === 'c1' && e.type === 'circle')!
    const solvedH = solved.find((e): e is SketchLine => e.id === 'lh' && e.type === 'line')!
    const solvedV = solved.find((e): e is SketchLine => e.id === 'lv' && e.type === 'line')!

    expect(Math.hypot(solvedH.start.x - 1, solvedH.start.y - 6)).toBeLessThan(0.05)
    expect(Math.hypot(solvedH.start.x - solvedV.start.x, solvedH.start.y - solvedV.start.y)).toBeLessThan(0.05)
    expect(Math.abs(solvedCircle.radius - 2)).toBeLessThan(0.01)
    expect(Math.hypot(solvedH.end.x - solvedCircle.center.x, solvedH.end.y - solvedCircle.center.y)).toBeCloseTo(2, 1)
    expect(Math.hypot(solvedV.end.x - solvedCircle.center.x, solvedV.end.y - solvedCircle.center.y)).toBeCloseTo(2, 1)

    const distH = Math.abs((solvedH.end.y - solvedH.start.y) * solvedCircle.center.x - (solvedH.end.x - solvedH.start.x) * solvedCircle.center.y + solvedH.end.x * solvedH.start.y - solvedH.end.y * solvedH.start.x) / Math.hypot(solvedH.end.x - solvedH.start.x, solvedH.end.y - solvedH.start.y)
    const distV = Math.abs((solvedV.end.y - solvedV.start.y) * solvedCircle.center.x - (solvedV.end.x - solvedV.start.x) * solvedCircle.center.y + solvedV.end.x * solvedV.start.y - solvedV.end.y * solvedV.start.x) / Math.hypot(solvedV.end.x - solvedV.start.x, solvedV.end.y - solvedV.start.y)
    expect(Math.abs(distH - solvedCircle.radius)).toBeLessThan(0.08)
    expect(Math.abs(distV - solvedCircle.radius)).toBeLessThan(0.08)
  })

  it('converges two tangents from a dragged common point onto an arc', () => {
    const dist = 15
    const radius = 5
    const half = Math.acos(radius / dist)
    const t1 = { x: radius * Math.cos(Math.PI - half), y: radius * Math.sin(Math.PI - half) }
    const t2 = { x: radius * Math.cos(Math.PI + half), y: radius * Math.sin(Math.PI + half) }
    const line1: SketchLine = { type: 'line', id: 'Line1', start: { x: -dist, y: 0 }, end: t1 }
    const line2: SketchLine = { type: 'line', id: 'Line2', start: { x: -dist, y: 0 }, end: t2 }
    const arc: SketchArc = {
      type: 'arc',
      id: 'A3',
      center: { x: 0, y: 0 },
      radius,
      startAngle: Math.atan2(t2.y, t2.x),
      endAngle: Math.atan2(t1.y, t1.x),
    }
    const constraints: SketchConstraint[] = [
      { id: 'joinS', type: 'coincident', p1: { elementId: 'Line1', which: 'start' }, p2: { elementId: 'Line2', which: 'start' } },
      { id: 'join1', type: 'coincident', p1: { elementId: 'Line1', which: 'end' }, p2: { elementId: 'A3', which: 'end' } },
      { id: 'join2', type: 'coincident', p1: { elementId: 'Line2', which: 'end' }, p2: { elementId: 'A3', which: 'start' } },
      { id: 't1', type: 'tangent', elementId1: 'Line1', elementId2: 'A3' },
      { id: 't2', type: 'tangent', elementId1: 'Line2', elementId2: 'A3' },
    ]

    const dragged = { ...line1, start: { x: -dist, y: 1 } }
    const result = solveConstraintsDetailed(
      [dragged, line2, arc],
      constraints,
      new Set(['Line1:start']),
    )

    expect(result.maxResidual).toBeLessThan(1e-3)
    const solvedArc = result.elements.find((e): e is SketchArc => e.id === 'A3' && e.type === 'arc')!
    const solved1 = result.elements.find((e): e is SketchLine => e.id === 'Line1' && e.type === 'line')!
    const solved2 = result.elements.find((e): e is SketchLine => e.id === 'Line2' && e.type === 'line')!
    const start = arcEndpoint(solvedArc, 'start')
    const end = arcEndpoint(solvedArc, 'end')
    expect(Math.hypot(solved1.start.x + dist, solved1.start.y - 1)).toBeLessThan(0.02)
    expect(Math.hypot(solved1.start.x - solved2.start.x, solved1.start.y - solved2.start.y)).toBeLessThan(0.02)
    expect(Math.hypot(solved1.end.x - end.x, solved1.end.y - end.y)).toBeLessThan(0.05)
    expect(Math.hypot(solved2.end.x - start.x, solved2.end.y - start.y)).toBeLessThan(0.05)
  })
})
