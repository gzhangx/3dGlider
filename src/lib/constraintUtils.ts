import type { PointRef, SketchConstraint, SketchElement, SketchPoint } from '../store/modelStore'

export function constraintElementIds(constraint: SketchConstraint): string[] {
  switch (constraint.type) {
    case 'length':
    case 'horizontal':
    case 'vertical':
      return [constraint.elementId]
    case 'angle':
    case 'parallel':
    case 'perpendicular':
    case 'equal':
    case 'tangent':
      return [constraint.elementId1, constraint.elementId2]
    case 'coincident':
      return [constraint.p1.elementId, constraint.p2.elementId]
    case 'pointOnCircle':
      return [constraint.p.elementId, constraint.circleId]
  }
}

function pointRefValue(el: SketchElement, which: 'start' | 'end' | 'center'): SketchPoint | null {
  if (which === 'start' && 'start' in el) return el.start
  if (which === 'end' && 'end' in el) return el.end
  if (which === 'center' && (el.type === 'circle' || el.type === 'arc')) return el.center
  return null
}

/** Find a point among `candidates` at the same location as `point` (a cut/delete replacement preserves it exactly). */
function findMatchingPointRef(point: SketchPoint, candidates: SketchElement[]): PointRef | null {
  const EPS = 1e-6
  for (const el of candidates) {
    for (const which of ['start', 'end', 'center'] as const) {
      const pt = pointRefValue(el, which)
      if (pt && Math.hypot(pt.x - point.x, pt.y - point.y) < EPS) return { elementId: el.id, which }
    }
  }
  return null
}

/**
 * Re-point constraints that referenced `removedId` at whichever replacement
 * element preserves the same point, instead of just dropping them. Only point
 * constraints (coincident, pointOnCircle) are remapped — a whole-element
 * constraint like `length` or `equal` can't be remapped safely, since the
 * replacement piece (e.g. a shorter kept segment after a line cut) may no
 * longer satisfy what the constraint originally meant; those are dropped.
 */
export function remapConstraintsAfterRemoval(
  constraints: SketchConstraint[],
  removedId: string,
  removedElement: SketchElement,
  replacements: SketchElement[],
): SketchConstraint[] {
  return constraints.flatMap((c): SketchConstraint[] => {
    if (!constraintElementIds(c).includes(removedId)) return [c]

    if (c.type === 'coincident') {
      const remap = (p: PointRef): PointRef | null => {
        if (p.elementId !== removedId) return p
        const pt = pointRefValue(removedElement, p.which)
        return pt && findMatchingPointRef(pt, replacements)
      }
      const p1 = remap(c.p1)
      const p2 = remap(c.p2)
      return p1 && p2 ? [{ ...c, p1, p2 }] : []
    }

    if (c.type === 'pointOnCircle') {
      let p = c.p
      let circleId = c.circleId
      if (p.elementId === removedId) {
        const pt = pointRefValue(removedElement, p.which)
        const mapped = pt && findMatchingPointRef(pt, replacements)
        if (!mapped) return []
        p = mapped
      }
      if (circleId === removedId) {
        const pt = pointRefValue(removedElement, 'center')
        const mapped = pt && findMatchingPointRef(pt, replacements)
        if (!mapped || mapped.which !== 'center') return []
        circleId = mapped.elementId
      }
      return [{ ...c, p, circleId }]
    }

    return []
  })
}

export function constraintsEquivalent(left: SketchConstraint, right: SketchConstraint): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'coincident' && right.type === 'coincident') {
    const direct = left.p1.elementId === right.p1.elementId && left.p1.which === right.p1.which
      && left.p2.elementId === right.p2.elementId && left.p2.which === right.p2.which
    const reverse = left.p1.elementId === right.p2.elementId && left.p1.which === right.p2.which
      && left.p2.elementId === right.p1.elementId && left.p2.which === right.p1.which
    return direct || reverse
  }
  if (left.type === 'pointOnCircle' && right.type === 'pointOnCircle') {
    return left.p.elementId === right.p.elementId && left.p.which === right.p.which && left.circleId === right.circleId
  }
  if (left.type === 'tangent' && right.type === 'tangent') {
    return (left.elementId1 === right.elementId1 && left.elementId2 === right.elementId2)
      || (left.elementId1 === right.elementId2 && left.elementId2 === right.elementId1)
  }
  return false
}
