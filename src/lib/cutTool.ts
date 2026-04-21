import { SketchElement, SketchLine, SketchRect, SketchPoint } from '../store/modelStore'

function rectCorners(r: SketchRect): SketchPoint[] {
  return [
    { x: r.start.x, y: r.start.y },
    { x: r.end.x,   y: r.start.y },
    { x: r.end.x,   y: r.end.y   },
    { x: r.start.x, y: r.end.y   },
  ]
}

// t ∈ (0,1) on segment p1→p2 where it crosses segment p3→p4, or null
function segSegT(
  p1: SketchPoint, p2: SketchPoint,
  p3: SketchPoint, p4: SketchPoint,
): number | null {
  const EPS = 1e-6
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) {
    // Parallel/colinear segments: still count endpoint touches as intersections.
    const len2 = d1x * d1x + d1y * d1y
    if (len2 < 1e-10) return null
    const endpointT = (p: SketchPoint): number | null => {
      const px = p.x - p1.x
      const py = p.y - p1.y
      const cross = Math.abs(px * d1y - py * d1x)
      if (cross > EPS) return null
      const t = (px * d1x + py * d1y) / len2
      if (t >= -EPS && t <= 1 + EPS) return Math.max(0, Math.min(1, t))
      return null
    }
    const t3 = endpointT(p3)
    if (t3 !== null) return t3
    const t4 = endpointT(p4)
    if (t4 !== null) return t4
    return null
  }
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return Math.max(0, Math.min(1, t))
  }
  return null
}

// t values ∈ (0,1) on segment p1→p2 where it crosses a circle
function segCircleTs(
  p1: SketchPoint, p2: SketchPoint,
  center: SketchPoint, radius: number,
): number[] {
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const fx = p1.x - center.x, fy = p1.y - center.y
  const a = dx * dx + dy * dy
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - radius * radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return []
  const EPS = 1e-6
  return [-1, 1]
    .map(s => (-b + s * Math.sqrt(disc)) / (2 * a))
    .filter(t => t >= -EPS && t <= 1 + EPS)
    .map(t => Math.max(0, Math.min(1, t)))
}

export function distToSeg(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

export function distToCircle(p: SketchPoint, center: SketchPoint, radius: number): number {
  return Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)
}

// All t values ∈ (0,1) on `line` where it intersects other elements
function intersectionTs(line: SketchLine, elements: SketchElement[]): number[] {
  const ts: number[] = []
  for (const el of elements) {
    if (el.id === line.id) continue
    if (el.type === 'line') {
      const t = segSegT(line.start, line.end, el.start, el.end)
      if (t !== null) ts.push(t)
    } else if (el.type === 'rect') {
      const c = rectCorners(el)
      for (let i = 0; i < 4; i++) {
        const t = segSegT(line.start, line.end, c[i], c[(i + 1) % 4])
        if (t !== null) ts.push(t)
      }
    } else if (el.type === 'circle') {
      ts.push(...segCircleTs(line.start, line.end, el.center, el.radius))
    }
  }
  return ts.sort((a, b) => a - b)
}

export interface CutResult {
  lineId: string
  cutStart: SketchPoint
  cutEnd: SketchPoint
  keeps: Array<{ start: SketchPoint; end: SketchPoint }>
}

export interface CircleCutResult {
  lineId: string
  cutStart: SketchPoint
  cutEnd: SketchPoint
  keeps: Array<{ start: SketchPoint; end: SketchPoint }>
}

function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2
  let out = a % TAU
  if (out < 0) out += TAU
  return out
}

function circleLineIntersectionAngles(circle: { center: SketchPoint; radius: number }, a: SketchPoint, b: SketchPoint): number[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const fx = a.x - circle.center.x
  const fy = a.y - circle.center.y
  const A = dx * dx + dy * dy
  if (A < 1e-10) return []
  const B = 2 * (fx * dx + fy * dy)
  const C = fx * fx + fy * fy - circle.radius * circle.radius
  const disc = B * B - 4 * A * C
  if (disc < 0) return []
  const EPS = 1e-6
  const sqrtDisc = Math.sqrt(Math.max(0, disc))
  const us = [(-B - sqrtDisc) / (2 * A), (-B + sqrtDisc) / (2 * A)]
  return us
    .filter((u) => u >= -EPS && u <= 1 + EPS)
    .map((u) => {
      const uu = Math.max(0, Math.min(1, u))
      const x = a.x + uu * dx
      const y = a.y + uu * dy
      return normalizeAngle(Math.atan2(y - circle.center.y, x - circle.center.x))
    })
}

function circleIntersectionAngles(circle: { id: string; center: SketchPoint; radius: number }, elements: SketchElement[]): number[] {
  const angles: number[] = []
  const push = (a: number) => angles.push(normalizeAngle(a))
  for (const el of elements) {
    if (el.id === circle.id) continue
    if (el.type === 'line') {
      for (const a of circleLineIntersectionAngles(circle, el.start, el.end)) push(a)
    } else if (el.type === 'rect') {
      const c = rectCorners(el)
      for (let i = 0; i < 4; i++) {
        for (const a of circleLineIntersectionAngles(circle, c[i], c[(i + 1) % 4])) push(a)
      }
    } else if (el.type === 'circle') {
      const dx = el.center.x - circle.center.x
      const dy = el.center.y - circle.center.y
      const d = Math.hypot(dx, dy)
      const r0 = circle.radius
      const r1 = el.radius
      if (d < 1e-8 || d > r0 + r1 + 1e-6 || d < Math.abs(r0 - r1) - 1e-6) continue
      const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
      const h2 = r0 * r0 - a * a
      if (h2 < -1e-6) continue
      const h = Math.sqrt(Math.max(0, h2))
      const xm = circle.center.x + (a * dx) / d
      const ym = circle.center.y + (a * dy) / d
      const rx = (-dy * h) / d
      const ry = (dx * h) / d
      push(Math.atan2((ym + ry) - circle.center.y, (xm + rx) - circle.center.x))
      push(Math.atan2((ym - ry) - circle.center.y, (xm - rx) - circle.center.x))
    }
  }
  return [...new Set(angles.map((x) => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b)
}

export function computeCircleCut(
  circle: { id: string; center: SketchPoint; radius: number },
  cursorPt: SketchPoint,
  elements: SketchElement[],
): CircleCutResult | null {
  const angles = circleIntersectionAngles(circle, elements)
  if (angles.length < 2) return null
  const cAng = normalizeAngle(Math.atan2(cursorPt.y - circle.center.y, cursorPt.x - circle.center.x))

  const below = angles.filter((a) => a < cAng)
  const above = angles.filter((a) => a > cAng)
  const lo = below.length > 0 ? Math.max(...below) : angles[angles.length - 1] - Math.PI * 2
  const hi = above.length > 0 ? Math.min(...above) : angles[0] + Math.PI * 2
  if (hi - lo < 1e-5) return null

  const pointAt = (a: number): SketchPoint => ({
    x: circle.center.x + Math.cos(a) * circle.radius,
    y: circle.center.y + Math.sin(a) * circle.radius,
  })
  const cutStart = pointAt(lo)
  const cutEnd = pointAt(hi)

  const keepArcStart = hi
  const keepArcEnd = lo + Math.PI * 2
  const arcLen = keepArcEnd - keepArcStart
  const SEG_STEP = Math.PI / 24
  const segCount = Math.max(1, Math.ceil(arcLen / SEG_STEP))
  const arcPts: SketchPoint[] = []
  for (let i = 0; i <= segCount; i++) {
    const a = keepArcStart + (arcLen * i) / segCount
    arcPts.push(pointAt(a))
  }
  const keeps: Array<{ start: SketchPoint; end: SketchPoint }> = []
  for (let i = 0; i < arcPts.length - 1; i++) keeps.push({ start: arcPts[i], end: arcPts[i + 1] })

  return { lineId: circle.id, cutStart, cutEnd, keeps }
}

export function computeCut(
  line: SketchLine,
  cursorPt: SketchPoint,
  elements: SketchElement[],
): CutResult | null {
  const rawTs = intersectionTs(line, elements)
  const ts = [...new Set(rawTs.map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b)
  if (ts.length === 0) return null

  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return null
  const lerp = (t: number): SketchPoint => ({ x: line.start.x + t * dx, y: line.start.y + t * dy })

  let tCursor = ((cursorPt.x - line.start.x) * dx + (cursorPt.y - line.start.y) * dy) / len2
  tCursor = Math.max(0, Math.min(1, tCursor))

  const EPS = 1e-4

  // One crossing (e.g. two lines meet once): trim from that hit toward the open end past the cursor.
  if (ts.length === 1) {
    const tHit = ts[0]
    let tc = tCursor
    if (Math.abs(tc - tHit) < 1e-5) tc = Math.min(1, tHit + 1e-3)

    const keeps: Array<{ start: SketchPoint; end: SketchPoint }> = []
    let cutStart: SketchPoint
    let cutEnd: SketchPoint
    if (tc > tHit) {
      cutStart = lerp(tHit)
      cutEnd = line.end
      if (tHit > EPS) keeps.push({ start: line.start, end: lerp(tHit) })
    } else {
      cutStart = line.start
      cutEnd = lerp(tHit)
      if (tHit < 1 - EPS) keeps.push({ start: lerp(tHit), end: line.end })
    }
    return { lineId: line.id, cutStart, cutEnd, keeps }
  }

  // Two or more crossings: remove the span around the cursor.
  // If cursor is outside all crossings, allow endpoint-to-nearest-hit trimming.
  const below = ts.filter((t) => t < tCursor)
  const above = ts.filter((t) => t > tCursor)
  const lo = below.length > 0 ? Math.max(...below) : 0
  const hi = above.length > 0 ? Math.min(...above) : 1
  if (hi - lo < EPS) return null

  const keeps: Array<{ start: SketchPoint; end: SketchPoint }> = []
  if (lo > EPS) keeps.push({ start: line.start, end: lerp(lo) })
  if (hi < 1 - EPS) keeps.push({ start: lerp(hi), end: line.end })

  return { lineId: line.id, cutStart: lerp(lo), cutEnd: lerp(hi), keeps }
}
