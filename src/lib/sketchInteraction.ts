import { SketchTool, SketchPlanePose, SketchPoint, SketchElement, PointRef, Sketch } from '../store/modelStore'
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
): SnapTarget | null {
  let best: (SnapTarget & { dist: number }) | null = null

  for (const el of sketchElements) {
    if (el.id === excludeElementId) continue

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
                    ref: null,
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
            ref: null,
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
