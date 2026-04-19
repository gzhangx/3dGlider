import { PlaneId, SketchPoint } from '../store/modelStore'

export const PLANE_ROTATION: Record<PlaneId, [number, number, number]> = {
  XY: [0, 0, 0],
  XZ: [-Math.PI / 2, 0, 0],
  YZ: [0, Math.PI / 2, 0],
}

// Small lift off the plane surface to prevent z-fighting
const LIFT = 0.003

export function worldPt(p: SketchPoint, plane: PlaneId): [number, number, number] {
  switch (plane) {
    case 'XY': return [p.x, p.y, LIFT]
    case 'XZ': return [p.x, LIFT, p.y]
    case 'YZ': return [LIFT, p.x, p.y]
  }
}

export function toSketch(point: { x: number; y: number; z: number }, plane: PlaneId): SketchPoint {
  switch (plane) {
    case 'XY': return { x: point.x, y: point.y }
    case 'XZ': return { x: point.x, y: point.z }
    case 'YZ': return { x: point.y, y: point.z }
  }
}

export function snapPt(p: SketchPoint, grid = 0.5): SketchPoint {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
}

export function linePts(a: SketchPoint, b: SketchPoint, plane: PlaneId) {
  return [worldPt(a, plane), worldPt(b, plane)] as [number, number, number][]
}

export function rectPts(a: SketchPoint, b: SketchPoint, plane: PlaneId) {
  return [
    worldPt(a, plane),
    worldPt({ x: b.x, y: a.y }, plane),
    worldPt(b, plane),
    worldPt({ x: a.x, y: b.y }, plane),
    worldPt(a, plane),
  ] as [number, number, number][]
}

export function circlePts(center: SketchPoint, radius: number, plane: PlaneId, segs = 64) {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    pts.push(worldPt({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius }, plane))
  }
  return pts
}
