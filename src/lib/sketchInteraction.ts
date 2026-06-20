import { SketchTool, SketchPlanePose, SketchPoint, SketchElement, SketchRect, PointRef, Sketch } from '../store/modelStore'
import { worldPt, toSketch } from './sketchGeometry'

export type SnapTarget = {
  pt: SketchPoint
  ref: PointRef | null
  constraintHint?: string
  tangentCircleId?: string
  circleId?: string
}

export function rectCorners(rect: SketchRect): SketchPoint[] {
  return [
    { x: rect.start.x, y: rect.start.y },
    { x: rect.end.x,   y: rect.start.y },
    { x: rect.end.x,   y: rect.end.y },
    { x: rect.start.x, y: rect.end.y },
  ]
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
  return []
}

export function closestPointOnSegment(p: SketchPoint, a: SketchPoint, b: SketchPoint): SketchPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export function closestPointOnCircle(p: SketchPoint, center: SketchPoint, radius: number): SketchPoint {
  const dx = p.x - center.x
  const dy = p.y - center.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { x: center.x + radius, y: center.y }
  return { x: center.x + (dx / dist) * radius, y: center.y + (dy / dist) * radius }
}

export function distToCirclePerimeter(p: SketchPoint, center: SketchPoint, radius: number): number {
  return Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)
}

export function distancePointToLine(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  const clamped = Math.max(0, Math.min(1, t))
  const closestX = a.x + clamped * dx
  const closestY = a.y + clamped * dy
  return Math.hypot(p.x - closestX, p.y - closestY)
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
