import { Euler, Quaternion, Vector3 } from 'three'
import { SketchPlanePose, SketchPoint, SketchRect } from '../store/modelStore'
import { planeNormalFromPose, planeOriginFromPose } from './planePose'

export function rectCorners(rect: SketchRect): SketchPoint[] {
  return [
    { x: rect.start.x, y: rect.start.y },
    { x: rect.end.x,   y: rect.start.y },
    { x: rect.end.x,   y: rect.end.y   },
    { x: rect.start.x, y: rect.end.y   },
  ]
}

export function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2
  let out = a % TAU
  if (out < 0) out += TAU
  return out
}

/** Whether angle `theta` lies within the arc spanning `start` → `end` (going counterclockwise). */
export function angleInArc(theta: number, start: number, end: number): boolean {
  const t = normalizeAngle(theta)
  const s = normalizeAngle(start)
  const e = normalizeAngle(end)
  const EPS = 1e-6
  // A zero-span arc denotes a single point, not a full circle.
  if (Math.abs(e - s) < EPS) return Math.abs(t - s) < EPS
  if (s <= e) return t >= s - EPS && t <= e + EPS
  return t >= s - EPS || t <= e + EPS
}

export function closestPointOnSegment(p: SketchPoint, a: SketchPoint, b: SketchPoint): SketchPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

export function distToSegment(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const closest = closestPointOnSegment(p, a, b)
  return Math.hypot(p.x - closest.x, p.y - closest.y)
}

export function closestPointOnCircle(p: SketchPoint, center: SketchPoint, radius: number): SketchPoint {
  const dx = p.x - center.x
  const dy = p.y - center.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return { x: center.x + radius, y: center.y }
  return { x: center.x + (dx / dist) * radius, y: center.y + (dy / dist) * radius }
}

export function distToCircle(p: SketchPoint, center: SketchPoint, radius: number): number {
  return Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)
}

// Small lift off the plane surface to prevent z-fighting
const LIFT = 0.003

export function worldPt(p: SketchPoint, plane: SketchPlanePose): [number, number, number] {
  const origin = planeOriginFromPose(plane)
  const lifted = planeNormalFromPose(plane).multiplyScalar(LIFT)
  const v = new Vector3(p.x, p.y, 0)
    .applyEuler(new Euler(...plane.rotation, 'XYZ'))
    .add(origin)
    .add(lifted)
  return [v.x, v.y, v.z]
}

export function toSketch(point: { x: number; y: number; z: number }, plane: SketchPlanePose): SketchPoint {
  const origin = planeOriginFromPose(plane)
  const qInv = new Quaternion()
    .setFromEuler(new Euler(...plane.rotation, 'XYZ'))
    .invert()
  const local = new Vector3(point.x, point.y, point.z)
    .sub(origin)
    .applyQuaternion(qInv)
  return { x: local.x, y: local.y }
}

export function snapPt(p: SketchPoint, grid = 0.5): SketchPoint {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
}

export function linePts(a: SketchPoint, b: SketchPoint, plane: SketchPlanePose) {
  return [worldPt(a, plane), worldPt(b, plane)] as [number, number, number][]
}

export function rectPts(a: SketchPoint, b: SketchPoint, plane: SketchPlanePose) {
  return [
    worldPt(a, plane),
    worldPt({ x: b.x, y: a.y }, plane),
    worldPt(b, plane),
    worldPt({ x: a.x, y: b.y }, plane),
    worldPt(a, plane),
  ] as [number, number, number][]
}

export function circlePts(center: SketchPoint, radius: number, plane: SketchPlanePose, segs = 64) {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    pts.push(worldPt({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius }, plane))
  }
  return pts
}

export function arcPts(
  center: SketchPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  plane: SketchPlanePose,
  segs = 64,
) {
  const pts: [number, number, number][] = []
  // Unwrap so an arc whose end angle has wrapped past 0 still sweeps forward
  // through the full span, instead of collapsing to a zero-length arc.
  const unwrappedEnd = endAngle < startAngle ? endAngle + Math.PI * 2 : endAngle
  const span = Math.max(0, unwrappedEnd - startAngle)
  const count = Math.max(1, Math.ceil((span / (Math.PI * 2)) * segs))
  for (let i = 0; i <= count; i++) {
    const a = startAngle + (span * i) / count
    pts.push(worldPt({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius }, plane))
  }
  return pts
}
