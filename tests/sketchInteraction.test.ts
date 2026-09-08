import { describe, expect, it } from 'vitest'
import {
  coincidenceConstraintForSelection,
  nearestSelectablePoint,
  sketchPoint,
  sketchPointUpdates,
} from '../src/lib/sketchInteraction'
import type { SketchArc, SketchCircle, SketchLine } from '../src/store/modelStore'

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
