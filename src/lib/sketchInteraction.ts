import { SketchTool, SketchPlanePose, SketchPoint, SketchElement, PointRef, Sketch, SketchConstraint } from '../store/modelStore'
import { constraintElementIds } from './constraintUtils'
import {
  worldPt, toSketch, rectCorners, angleInArc,
  closestPointOnSegment, distToSegment as distancePointToLine,
  closestPointOnCircle, distToCircle as distToCirclePerimeter,
} from './sketchGeometry'

export { rectCorners }

export type SnapTarget = {
  pt: SketchPoint
  ref: PointRef | null
  constraintHint?: string
  tangentCircleId?: string
  circleId?: string
}

export function elementEndpoints(el: SketchElement): { pt: SketchPoint; ref: PointRef }[] {
  if (el.type === 'line') return [
    { pt: el.start, ref: { elementId: el.id, which: 'start' } },
    { pt: el.end,   ref: { elementId: el.id, which: 'end' } },
  ]
  if (el.type === 'rect') return [
    { pt: el.start, ref: { elementId: el.id, which: 'start' } },
    { pt: el.end,   ref: { elementId: el.id, which: 'end' } },
  ]
  if (el.type === 'arc') {
    const s = { x: el.center.x + Math.cos(el.startAngle) * el.radius, y: el.center.y + Math.sin(el.startAngle) * el.radius }
    const e = { x: el.center.x + Math.cos(el.endAngle) * el.radius, y: el.center.y + Math.sin(el.endAngle) * el.radius }
    return [
      { pt: s, ref: { elementId: el.id, which: 'start' } },
      { pt: e, ref: { elementId: el.id, which: 'end' } },
    ]
  }
  return []
}

/** If `pt` is close to an arc endpoint, return that endpoint ref. */
export function nearestArcEndpoint(
  el: SketchElement,
  pt: SketchPoint,
  maxDist: number,
): PointRef | null {
  if (el.type !== 'arc') return null
  let best: { ref: PointRef; dist: number } | null = null
  for (const end of elementEndpoints(el)) {
    const dist = Math.hypot(pt.x - end.pt.x, pt.y - end.pt.y)
    if (dist > maxDist) continue
    if (!best || dist < best.dist) best = { ref: end.ref, dist }
  }
  return best?.ref ?? null
}

export function selectablePoints(el: SketchElement): { pt: SketchPoint; ref: PointRef }[] {
  const points = elementEndpoints(el)
  if (el.type === 'circle' || el.type === 'arc') {
    points.push({ pt: el.center, ref: { elementId: el.id, which: 'center' } })
  }
  return points
}

export function nearestSelectablePoint(
  raw: SketchPoint,
  el: SketchElement,
  radius: number,
): { pt: SketchPoint; ref: PointRef } | null {
  let best: { pt: SketchPoint; ref: PointRef; dist: number } | null = null
  for (const candidate of selectablePoints(el)) {
    const dist = Math.hypot(raw.x - candidate.pt.x, raw.y - candidate.pt.y)
    if (dist > radius) continue
    if (!best || dist < best.dist) best = { ...candidate, dist }
  }
  return best
}

export function isLineTangentToCircle(lineStart: SketchPoint, lineEnd: SketchPoint, center: SketchPoint, radius: number, tolerance = 0.05): boolean {
  const dist = distancePointToLine(center, lineStart, lineEnd)
  return Math.abs(dist - radius) < tolerance
}

export function getTangentPointOnCircle(lineStart: SketchPoint, center: SketchPoint, radius: number, rawCursor: SketchPoint): SketchPoint | null {
  const dx = lineStart.x - center.x
  const dy = lineStart.y - center.y
  const distSq = dx * dx + dy * dy
  const dist = Math.sqrt(distSq)
  if (dist <= radius + 1e-9) return null

  const angleToStart = Math.atan2(dy, dx)
  const angleOffset = Math.acos(radius / dist)
  const tangentA = angleToStart + angleOffset
  const tangentB = angleToStart - angleOffset

  const tangent1 = {
    x: center.x + Math.cos(tangentA) * radius,
    y: center.y + Math.sin(tangentA) * radius,
  }
  const tangent2 = {
    x: center.x + Math.cos(tangentB) * radius,
    y: center.y + Math.sin(tangentB) * radius,
  }

  const dist1 = Math.hypot(rawCursor.x - tangent1.x, rawCursor.y - tangent1.y)
  const dist2 = Math.hypot(rawCursor.x - tangent2.x, rawCursor.y - tangent2.y)
  return dist1 <= dist2 ? tangent1 : tangent2
}

export function findSnapTarget(
  raw: SketchPoint,
  sketchElements: SketchElement[],
  sketches: Sketch[],
  editingSketchId: string | null,
  plane: SketchPlanePose,
  activeTool: SketchTool,
  snapToObjects: boolean,
  snapToOtherPlanes: boolean,
  snapEndpointThreshold: number,
  snapObjectThreshold: number,
  snapTangentThreshold: number,
  lineStart: SketchPoint | null = null,
  excludeElementId: string | null = null,
  excludeElementIds?: Iterable<string> | null,
): SnapTarget | null {
  let best: (SnapTarget & { dist: number }) | null = null
  const excluded = new Set(excludeElementIds ?? [])
  if (excludeElementId) excluded.add(excludeElementId)

  for (const el of sketchElements) {
    if (excluded.has(el.id)) continue

    for (const { pt, ref } of elementEndpoints(el)) {
      const d = Math.hypot(raw.x - pt.x, raw.y - pt.y)
      if (d < snapEndpointThreshold && (!best || d < best.dist)) {
        best = { pt, ref, dist: d }
      }
    }

    if (snapToObjects) {
      if (el.type === 'line') {
        const closest = closestPointOnSegment(raw, el.start, el.end)
        const d = Math.hypot(raw.x - closest.x, raw.y - closest.y)
        if (d < snapObjectThreshold && (!best || d < best.dist)) {
          best = { pt: closest, ref: null, constraintHint: '⊙ Coincident on line', dist: d }
        }
      }

      if (el.type === 'circle') {
        const dCenter = Math.hypot(raw.x - el.center.x, raw.y - el.center.y)
        if (dCenter < snapObjectThreshold && (!best || dCenter < best.dist)) {
          best = { pt: el.center, ref: { elementId: el.id, which: 'center' }, constraintHint: '⊙ Coincident at center', dist: dCenter }
        }

        const closest = closestPointOnCircle(raw, el.center, el.radius)
        const dPerimeter = distToCirclePerimeter(raw, el.center, el.radius)
        if (dPerimeter < snapTangentThreshold && (!best || dPerimeter < best.dist)) {
          if (lineStart && activeTool === 'line') {
            // Compute the theoretical tangent point from the other line endpoint and
            // choose it when the cursor is near that tangent point. This is more
            // robust than testing tangency against the raw cursor location.
            const tangentPt = getTangentPointOnCircle(lineStart, el.center, el.radius, raw)
            if (tangentPt) {
              const dToTangent = Math.hypot(raw.x - tangentPt.x, raw.y - tangentPt.y)
              if (dToTangent < snapTangentThreshold) {
                best = {
                  pt: tangentPt,
                  ref: null,
                  constraintHint: '⌶ Tangent to circle',
                  tangentCircleId: el.id,
                  dist: dToTangent,
                }
                continue
              }
            }
          }
          // Fallback: snap to the nearest point on the circle perimeter
          best = {
            pt: closest,
            ref: null,
            constraintHint: '⊙ Coincident on circle',
            circleId: el.id,
            dist: dPerimeter,
          }
        }
      }

      // Allow snapping to arcs (perimeter and endpoints)
      if (el.type === 'arc') {
        // center snap
        const dCenter = Math.hypot(raw.x - el.center.x, raw.y - el.center.y)
        if (dCenter < snapObjectThreshold && (!best || dCenter < best.dist)) {
          best = { pt: el.center, ref: { elementId: el.id, which: 'center' }, constraintHint: '⊙ Coincident at center', dist: dCenter }
        }

        // perimeter snap (only if angle lies within arc)
        const closest = closestPointOnCircle(raw, el.center, el.radius)
        const a = Math.atan2(closest.y - el.center.y, closest.x - el.center.x)
        const dPerimeter = distToCirclePerimeter(raw, el.center, el.radius)
        if (dPerimeter < snapTangentThreshold && angleInArc(a, el.startAngle, el.endAngle) && (!best || dPerimeter < best.dist)) {
          if (lineStart && activeTool === 'line') {
            const tangentPt = getTangentPointOnCircle(lineStart, el.center, el.radius, raw)
            if (tangentPt) {
              const ta = Math.atan2(tangentPt.y - el.center.y, tangentPt.x - el.center.x)
              if (angleInArc(ta, el.startAngle, el.endAngle)) {
                const dToTangent = Math.hypot(raw.x - tangentPt.x, raw.y - tangentPt.y)
                if (dToTangent < snapTangentThreshold) {
                  best = {
                    pt: tangentPt,
                    ref: nearestArcEndpoint(el, tangentPt, snapEndpointThreshold),
                    constraintHint: '⌶ Tangent to arc',
                    tangentCircleId: el.id,
                    dist: dToTangent,
                  }
                  continue
                }
              }
            }
          }
          best = {
            pt: closest,
            ref: nearestArcEndpoint(el, closest, snapEndpointThreshold),
            constraintHint: '⊙ Coincident on arc',
            circleId: el.id,
            dist: dPerimeter,
          }
        }
      }

      if (el.type === 'rect') {
        const corners = rectCorners(el)
        for (const corner of corners) {
          const d = Math.hypot(raw.x - corner.x, raw.y - corner.y)
          if (d < snapObjectThreshold && (!best || d < best.dist)) {
            best = { pt: corner, ref: null, dist: d }
          }
        }
        for (let i = 0; i < 4; i++) {
          const a = corners[i]
          const b = corners[(i + 1) % 4]
          const closest = closestPointOnSegment(raw, a, b)
          const d = Math.hypot(raw.x - closest.x, raw.y - closest.y)
          if (d < snapObjectThreshold && (!best || d < best.dist)) {
            best = { pt: closest, ref: null, constraintHint: '⊙ Coincident on edge', dist: d }
          }
        }
      }
    }
  }

  if (snapToOtherPlanes) {
    for (const sketch of sketches) {
      if (sketch.id === editingSketchId) continue
      for (const el of sketch.elements) {
        for (const { pt } of elementEndpoints(el)) {
          const w = worldPt(pt, sketch.plane)
          const localPt = toSketch({ x: w[0], y: w[1], z: w[2] }, plane)
          const d = Math.hypot(raw.x - localPt.x, raw.y - localPt.y)
          if (d < snapEndpointThreshold && (!best || d < best.dist)) {
            best = { pt: localPt, ref: null, dist: d }
          }
        }
      }
    }
  }

  return best
}

export function pointRefsEqual(a: PointRef, b: PointRef): boolean {
  return a.elementId === b.elementId && a.which === b.which
}

/** All sketch elements reachable from `seedId` through existing constraints. */
export function constraintClusterIds(seedId: string, constraints: SketchConstraint[]): Set<string> {
  const ids = new Set<string>([seedId])
  let changed = true
  while (changed) {
    changed = false
    for (const constraint of constraints) {
      const involved = constraintElementIds(constraint)
      if (!involved.some((id) => ids.has(id))) continue
      for (const id of involved) {
        if (ids.has(id)) continue
        ids.add(id)
        changed = true
      }
    }
  }
  return ids
}

/**
 * Snapping a drag onto geometry already in this point's constraint cluster
 * (the other tangent line, the circle, the far contact point) collapses or
 * over-constrains the sketch — the same failure as adding a second tangent
 * at the shared corner.
 */
export function dragSnapConflictsWithConstraints(
  target: PointRef,
  snap: SnapTarget,
  constraints: SketchConstraint[],
): boolean {
  const cluster = constraintClusterIds(target.elementId, constraints)
  if (snap.tangentCircleId && cluster.has(snap.tangentCircleId)) return true
  if (snap.circleId && cluster.has(snap.circleId)) return true
  if (snap.ref && cluster.has(snap.ref.elementId)) return true
  return false
}

/** Keep a dragged point-on-circle contact on its circle; leave free corners alone. */
export function constrainDragPosition(
  pt: SketchPoint,
  target: PointRef,
  elements: SketchElement[],
  constraints: SketchConstraint[],
): SketchPoint {
  const keys = new Set([`${target.elementId}:${target.which}`])
  let changed = true
  while (changed) {
    changed = false
    for (const constraint of constraints) {
      if (constraint.type !== 'coincident') continue
      const key1 = `${constraint.p1.elementId}:${constraint.p1.which}`
      const key2 = `${constraint.p2.elementId}:${constraint.p2.which}`
      if (keys.has(key1) && !keys.has(key2)) { keys.add(key2); changed = true }
      if (keys.has(key2) && !keys.has(key1)) { keys.add(key1); changed = true }
    }
  }

  let next = pt
  for (const constraint of constraints) {
    if (constraint.type !== 'pointOnCircle') continue
    if (!keys.has(`${constraint.p.elementId}:${constraint.p.which}`)) continue
    const curve = elements.find((el) => el.id === constraint.circleId)
    if (!curve || (curve.type !== 'circle' && curve.type !== 'arc')) continue
    next = closestPointOnCircle(next, curve.center, curve.radius)
  }
  return next
}

export function sketchPoint(el: SketchElement, which: PointRef['which']): SketchPoint | null {
  if ((el.type === 'line' || el.type === 'rect') && (which === 'start' || which === 'end')) {
    return which === 'start' ? el.start : el.end
  }
  if ((el.type === 'circle' || el.type === 'arc') && which === 'center') return el.center
  if (el.type === 'arc' && (which === 'start' || which === 'end')) {
    const angle = which === 'start' ? el.startAngle : el.endAngle
    return {
      x: el.center.x + Math.cos(angle) * el.radius,
      y: el.center.y + Math.sin(angle) * el.radius,
    }
  }
  return null
}

export function sketchPointUpdates(
  el: SketchElement,
  which: PointRef['which'],
  pt: SketchPoint,
): Partial<SketchElement> | null {
  if ((el.type === 'line' || el.type === 'rect') && (which === 'start' || which === 'end')) {
    return { [which]: pt }
  }
  if ((el.type === 'circle' || el.type === 'arc') && which === 'center') return { center: pt }
  if (el.type === 'arc' && (which === 'start' || which === 'end')) {
    const key = which === 'start' ? 'startAngle' : 'endAngle'
    return { [key]: Math.atan2(pt.y - el.center.y, pt.x - el.center.x) }
  }
  return null
}

/** Move a sketch point as a live drag would, before the solver runs. */
export function applyDraggedPoint(
  elements: SketchElement[],
  ref: PointRef,
  pt: SketchPoint,
): SketchElement[] {
  return elements.map((el) => {
    if (el.id !== ref.elementId) return el
    const updates = sketchPointUpdates(el, ref.which, pt)
    return updates ? { ...el, ...updates } as SketchElement : el
  })
}

/** Update a circle/arc radius as a live perimeter drag would, before the solver runs. */
export function applyDraggedRadius(
  elements: SketchElement[],
  elementId: string,
  radius: number,
): SketchElement[] {
  const r = Math.max(1e-6, Math.abs(radius))
  return elements.map((el) => {
    if (el.id !== elementId) return el
    if (el.type === 'circle' || el.type === 'arc') return { ...el, radius: r } as SketchElement
    return el
  })
}

/** Fixed DOFs while the user drags a circle/arc perimeter (keep center/angles, pin radius). */
export function radiusDragFixedPoints(elementId: string, elType: SketchElement['type']): Set<string> {
  if (elType === 'arc') {
    return new Set([
      `${elementId}:radius`,
      `${elementId}:center`,
      `${elementId}:start`,
      `${elementId}:end`,
    ])
  }
  return new Set([`${elementId}:radius`, `${elementId}:center`])
}

export type CoincidenceDraft =
  | { type: 'coincident'; p1: PointRef; p2: PointRef }
  | { type: 'pointOnLine'; p: PointRef; lineId: string }
  | { type: 'pointOnCircle'; p: PointRef; circleId: string }

/** Build a coincidence constraint from selected endpoints and/or a second curve. */
export function coincidenceConstraintForSelection(
  pointRefs: PointRef[],
  selectedIds: string[],
  elements: SketchElement[],
): CoincidenceDraft | null {
  if (pointRefs.length >= 2) {
    const [p1, p2] = pointRefs
    if (pointRefsEqual(p1, p2)) return null
    return { type: 'coincident', p1, p2 }
  }
  if (pointRefs.length !== 1) return null
  const p = pointRefs[0]
  const otherId = selectedIds.find((id) => id !== p.elementId)
  if (!otherId) return null
  const other = elements.find((el) => el.id === otherId)
  if (!other) return null
  if (other.type === 'line') return { type: 'pointOnLine', p, lineId: other.id }
  if (other.type === 'circle' || other.type === 'arc') return { type: 'pointOnCircle', p, circleId: other.id }
  return null
}
