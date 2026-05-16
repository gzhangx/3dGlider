import { BufferGeometry, CurvePath, Euler, ExtrudeGeometry, LineCurve3, Matrix4, Vector3 } from 'three'
import { SweepFeature, Sketch, SketchLine, SketchArc } from '../store/modelStore'
import { sketchElementsToShape } from './sketchToShape'

function planeOriginWorld(rotation: [number, number, number], offset: number): Vector3 {
  return new Vector3(0, 0, 1)
    .applyEuler(new Euler(...rotation, 'XYZ'))
    .normalize()
    .multiplyScalar(offset)
}

function toWorldPoint(point: { x: number; y: number }, sketch: Sketch): Vector3 {
  const euler = new Euler(...sketch.plane.rotation, 'XYZ')
  return new Vector3(point.x, point.y, 0).applyEuler(euler).add(planeOriginWorld(sketch.plane.rotation, sketch.plane.offset))
}

function approxArcPoints(arc: SketchArc, segments = 16): Array<{ x: number; y: number }> {
  const TAU = Math.PI * 2
  let start = arc.startAngle
  let end = arc.endAngle
  if (end < start) end += TAU
  const span = end - start
  const steps = Math.max(3, Math.min(64, Math.ceil((segments * Math.abs(span)) / TAU)))
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= steps; i++) {
    const t = start + (span * i) / steps
    points.push({
      x: arc.center.x + Math.cos(t) * arc.radius,
      y: arc.center.y + Math.sin(t) * arc.radius,
    })
  }
  return points
}

function approxCirclePoints(circle: { center: { x: number; y: number }; radius: number }, segments = 32) {
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= segments; i++) {
    const t = (Math.PI * 2 * i) / segments
    points.push({
      x: circle.center.x + Math.cos(t) * circle.radius,
      y: circle.center.y + Math.sin(t) * circle.radius,
    })
  }
  return points
}

function approxRectPoints(rect: { start: { x: number; y: number }; end: { x: number; y: number } }) {
  const x0 = Math.min(rect.start.x, rect.end.x)
  const x1 = Math.max(rect.start.x, rect.end.x)
  const y0 = Math.min(rect.start.y, rect.end.y)
  const y1 = Math.max(rect.start.y, rect.end.y)
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ]
}

function keyForPoint(pt: { x: number; y: number }, eps = 1e-4): string {
  return `${Math.round(pt.x / eps)},${Math.round(pt.y / eps)}`
}

function dedupePoints(points: Array<{ x: number; y: number }>) {
  const result: Array<{ x: number; y: number }> = []
  for (const pt of points) {
    const prev = result[result.length - 1]
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-4) {
      result.push(pt)
    }
  }
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-4) {
      result.pop()
    }
  }
  return result
}

function buildPathPoints(sketch: Sketch): Vector3[] | null {
  const lineArcElements = sketch.elements.filter((e): e is SketchLine | SketchArc => e.type === 'line' || e.type === 'arc')

  if (lineArcElements.length > 0) {
    type Segment = {
      points: Array<{ x: number; y: number }>
      startKey: string
      endKey: string
    }

    const segments: Segment[] = []
    for (const el of lineArcElements) {
      const pts = el.type === 'line'
        ? [{ x: el.start.x, y: el.start.y }, { x: el.end.x, y: el.end.y }]
        : approxArcPoints(el)
      const cleanPts = dedupePoints(pts)
      if (cleanPts.length < 2) continue
      const startKey = keyForPoint(cleanPts[0])
      const endKey = keyForPoint(cleanPts[cleanPts.length - 1])
      segments.push({ points: cleanPts, startKey, endKey })
    }

    if (segments.length > 0) {
      const adj = new Map<string, Segment[]>()
      for (const seg of segments) {
        adj.set(seg.startKey, [...(adj.get(seg.startKey) ?? []), seg])
        adj.set(seg.endKey, [...(adj.get(seg.endKey) ?? []), seg])
      }

      const endpoints = Array.from(adj.entries()).filter(([, segs]) => segs.length === 1).map(([key]) => key)
      let currentKey = endpoints.length > 0 ? endpoints[0] : segments[0].startKey
      const used = new Set<Segment>()
      const path: Array<{ x: number; y: number }> = []

      while (true) {
        const candidates = (adj.get(currentKey) ?? []).filter((seg) => !used.has(seg))
        if (candidates.length === 0) break
        let next = candidates[0]
        if (candidates.length > 1) {
          const nonBack = candidates.find((seg) => seg.startKey !== currentKey || seg.endKey !== currentKey)
          if (nonBack) next = nonBack
        }
        used.add(next)
        const nextKey = next.startKey === currentKey ? next.endKey : next.startKey
        const pts = next.startKey === currentKey ? next.points : [...next.points].reverse()
        if (path.length === 0) {
          path.push(...pts)
        } else {
          path.push(...pts.slice(1))
        }
        currentKey = nextKey
      }

      const cleaned = dedupePoints(path)
      if (cleaned.length >= 2) {
        return cleaned.map((pt) => toWorldPoint(pt, sketch))
      }
    }
  }

  const shapes = sketchElementsToShape(sketch.elements)
  if (shapes.length > 0) {
    const points = shapes[0].getSpacedPoints(64).map((pt) => ({ x: pt.x, y: pt.y }))
    const cleaned = dedupePoints(points)
    if (cleaned.length >= 2) {
      return cleaned.map((pt) => toWorldPoint(pt, sketch))
    }
  }

  return null
}

export function buildSweepGeometry(sweep: SweepFeature, sketches: Sketch[]): BufferGeometry | null {
  const profileSketch = sketches.find((s) => s.id === sweep.profileSketchId)
  const pathSketch = sketches.find((s) => s.id === sweep.pathSketchId)
  if (!profileSketch || !pathSketch) return null

  const shapes = sketchElementsToShape(profileSketch.elements)
  if (shapes.length === 0) return null

  const pathPoints = buildPathPoints(pathSketch)
  if (!pathPoints || pathPoints.length < 2) return null

  const curve = new CurvePath<Vector3>()
  for (let i = 0; i < pathPoints.length - 1; i++) {
    curve.add(new LineCurve3(pathPoints[i], pathPoints[i + 1]))
  }

  const geo = new ExtrudeGeometry(shapes, {
    bevelEnabled: false,
    extrudePath: curve,
    steps: Math.max(4, pathPoints.length * 2),
  })

  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}
