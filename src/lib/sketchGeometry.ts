import { Euler, Quaternion, Vector3 } from 'three'
import { SketchPlanePose, SketchPoint } from '../store/modelStore'
import { planeNormalFromPose, planeOriginFromPose } from './planePose'

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
  const span = Math.max(0, endAngle - startAngle)
  const count = Math.max(1, Math.ceil((span / (Math.PI * 2)) * segs))
  for (let i = 0; i <= count; i++) {
    const a = startAngle + (span * i) / count
    pts.push(worldPt({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius }, plane))
  }
  return pts
}
