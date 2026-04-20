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
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) return null
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  if (t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) return t
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
  return [-1, 1]
    .map(s => (-b + s * Math.sqrt(disc)) / (2 * a))
    .filter(t => t > 1e-6 && t < 1 - 1e-6)
}

export function distToSeg(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
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

export function computeCut(
  line: SketchLine,
  cursorPt: SketchPoint,
  elements: SketchElement[],
): CutResult | null {
  const ts = intersectionTs(line, elements)
  if (ts.length < 2) return null

  // Project cursor onto line to get t parameter
  const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-10) return null
  const tCursor = ((cursorPt.x - line.start.x) * dx + (cursorPt.y - line.start.y) * dy) / len2

  // Nearest intersection on each side of cursor
  const below = ts.filter(t => t < tCursor)
  const above = ts.filter(t => t > tCursor)
  if (below.length === 0 || above.length === 0) return null

  const lo = Math.max(...below)
  const hi = Math.min(...above)
  const lerp = (t: number): SketchPoint => ({ x: line.start.x + t * dx, y: line.start.y + t * dy })

  const EPS = 1e-4
  const keeps: Array<{ start: SketchPoint; end: SketchPoint }> = []
  if (lo > EPS) keeps.push({ start: line.start, end: lerp(lo) })
  if (hi < 1 - EPS) keeps.push({ start: lerp(hi), end: line.end })

  return { lineId: line.id, cutStart: lerp(lo), cutEnd: lerp(hi), keeps }
}
