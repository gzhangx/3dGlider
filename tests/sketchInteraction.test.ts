import { describe, expect, it } from 'vitest'
import {
  coincidenceConstraintForSelection,
  constrainDragPosition,
  constraintClusterIds,
  dragSnapConflictsWithConstraints,
  nearestSelectablePoint,
  sketchPoint,
  sketchPointUpdates,
  applyDraggedPoint,
} from '../src/lib/sketchInteraction'
import type { SketchArc, SketchCircle, SketchConstraint, SketchLine } from '../src/store/modelStore'

describe('coincidenceConstraintForSelection', () => {
  const line: SketchLine = { type: 'line', id: 'l1', start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }
  const line2: SketchLine = { type: 'line', id: 'l2', start: { x: 5, y: 1 }, end: { x: 5, y: 6 } }
  const arc: SketchArc = {
    type: 'arc', id: 'a1', center: { x: 0, y: 0 }, radius: 5,
    startAngle: 0, endAngle: Math.PI / 2,
  }
  const circle: SketchCircle = { type: 'circle', id: 'c1', center: { x: 8, y: 8 }, radius: 2 }

  it('connects two selected endpoints', () => {
    const draft = coincidenceConstraintForSelection(
      [
        { elementId: 'l1', which: 'end' },
        { elementId: 'a1', which: 'start' },
      ],
      ['l1', 'a1'],
      [line, arc],
    )
    expect(draft).toEqual({
      type: 'coincident',
      p1: { elementId: 'l1', which: 'end' },
      p2: { elementId: 'a1', which: 'start' },
    })
  })

  it('puts a line endpoint on another line', () => {
    const draft = coincidenceConstraintForSelection(
      [{ elementId: 'l1', which: 'end' }],
      ['l1', 'l2'],
      [line, line2],
    )
    expect(draft).toEqual({
      type: 'pointOnLine',
      p: { elementId: 'l1', which: 'end' },
      lineId: 'l2',
    })
  })

  it('puts an endpoint on a circle or arc', () => {
    expect(coincidenceConstraintForSelection(
      [{ elementId: 'l1', which: 'end' }],
      ['l1', 'c1'],
      [line, circle],
    )).toEqual({
      type: 'pointOnCircle',
      p: { elementId: 'l1', which: 'end' },
      circleId: 'c1',
    })
    expect(coincidenceConstraintForSelection(
      [{ elementId: 'l1', which: 'start' }],
      ['l1', 'a1'],
      [line, arc],
    )).toEqual({
      type: 'pointOnCircle',
      p: { elementId: 'l1', which: 'start' },
      circleId: 'a1',
    })
  })

  it('does not coincident a point with its own parent curve', () => {
    expect(coincidenceConstraintForSelection(
      [{ elementId: 'l1', which: 'end' }],
      ['l1'],
      [line],
    )).toBeNull()
  })
})

describe('sketchPointUpdates', () => {
  it('writes arc endpoints as angles', () => {
    const arc: SketchArc = {
      type: 'arc', id: 'a1', center: { x: 0, y: 0 }, radius: 5,
      startAngle: 0, endAngle: Math.PI / 2,
    }
    const updates = sketchPointUpdates(arc, 'end', { x: 0, y: -5 })
    expect(updates).toBeDefined()
    expect('endAngle' in (updates ?? {})).toBe(true)
    expect(sketchPoint({ ...arc, ...updates }, 'end')!.y).toBeCloseTo(-5, 5)
  })
})

describe('nearestSelectablePoint', () => {
  it('picks a line endpoint rather than the line body', () => {
    const line: SketchLine = { type: 'line', id: 'l1', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
    const hit = nearestSelectablePoint({ x: 0.05, y: 0.02 }, line, 0.2)
    expect(hit?.ref).toEqual({ elementId: 'l1', which: 'start' })
    expect(nearestSelectablePoint({ x: 5, y: 0 }, line, 0.2)).toBeNull()
  })
})

describe('constrained drag snapping', () => {
  const circle: SketchCircle = { type: 'circle', id: 'c1', center: { x: 2, y: 2 }, radius: 2 }
  const lineH: SketchLine = { type: 'line', id: 'lh', start: { x: 0, y: 4 }, end: { x: 2, y: 4 } }
  const lineV: SketchLine = { type: 'line', id: 'lv', start: { x: 0, y: 4 }, end: { x: 0, y: 2 } }
  const constraints: SketchConstraint[] = [
    { id: 'join', type: 'coincident', p1: { elementId: 'lh', which: 'start' }, p2: { elementId: 'lv', which: 'start' } },
    { id: 'th', type: 'tangent', elementId1: 'lh', elementId2: 'c1' },
    { id: 'tv', type: 'tangent', elementId1: 'lv', elementId2: 'c1' },
    { id: 'ph', type: 'pointOnCircle', p: { elementId: 'lh', which: 'end' }, circleId: 'c1' },
    { id: 'pv', type: 'pointOnCircle', p: { elementId: 'lv', which: 'end' }, circleId: 'c1' },
  ]

  it('treats the two tangent lines and the circle as one cluster', () => {
    expect([...constraintClusterIds('lh', constraints)].sort()).toEqual(['c1', 'lh', 'lv'])
  })

  it('rejects snapping the shared corner back onto the same circle', () => {
    expect(dragSnapConflictsWithConstraints(
      { elementId: 'lh', which: 'start' },
      { pt: { x: 2, y: 4 }, ref: null, tangentCircleId: 'c1' },
      constraints,
    )).toBe(true)
    expect(dragSnapConflictsWithConstraints(
      { elementId: 'lh', which: 'start' },
      { pt: { x: 0, y: 2 }, ref: { elementId: 'lv', which: 'end' } },
      constraints,
    )).toBe(true)
  })

  it('projects a contact point onto the circle but not the free corner', () => {
    const elements = [circle, lineH, lineV]
    expect(constrainDragPosition(
      { x: 4, y: 8 },
      { elementId: 'lh', which: 'start' },
      elements,
      constraints,
    )).toEqual({ x: 4, y: 8 })

    const onCircle = constrainDragPosition(
      { x: 4, y: 4 },
      { elementId: 'lh', which: 'end' },
      elements,
      constraints,
    )
    expect(Math.hypot(onCircle.x - 2, onCircle.y - 2)).toBeCloseTo(2, 5)
  })
})

describe('applyDraggedPoint', () => {
  it('moves a line endpoint like a live drag', () => {
    const line: SketchLine = { type: 'line', id: 'l1', start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }
    const moved = applyDraggedPoint([line], { elementId: 'l1', which: 'end' }, { x: 10, y: 2 })
    expect(moved[0]).toMatchObject({ id: 'l1', start: { x: 0, y: 0 }, end: { x: 10, y: 2 } })
  })
})
