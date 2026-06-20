import type { SketchConstraint } from '../store/modelStore'

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
