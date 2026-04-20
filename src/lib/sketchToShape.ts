import * as THREE from 'three'
import { PlaneId, SketchElement, SketchLine, SketchRect, SketchCircle } from '../store/modelStore'

// Rotation applied to an ExtrudeGeometry mesh so it sits on the correct world plane.
// ExtrudeGeometry lives in local XY, extrudes along local +Z.
//   XY  → no rotation; extrudes along world +Z
//   XZ  → Rx(-π/2); local Y becomes world Z (with v-flip below), extrudes along world +Y
//   YZ  → Rx(π/2)*Ry(π/2); extrudes along world +X
export const EXTRUDE_ROTATION: Record<PlaneId, [number, number, number]> = {
  XY: [0, 0, 0],
  XZ: [-Math.PI / 2, 0, 0],
  YZ: [Math.PI / 2, Math.PI / 2, 0],
}

// For XZ plane the Rx(-π/2) rotation reflects the Y axis, so we pre-negate v
// so the final world position is correct.
function pt(u: number, v: number, plane: PlaneId): [number, number] {
  return plane === 'XZ' ? [u, -v] : [u, v]
}

// Try to chain line segments into an ordered closed polygon.
function tryLoop(lines: SketchLine[]) {
  const EPS = 0.05
  const eq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS

  const pts = [lines[0].start]
  const used = new Set([0])
  let cur = lines[0].end

  while (used.size < lines.length) {
    let matched = false
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue
      if (eq(cur, lines[i].start)) {
        pts.push(lines[i].start)
        cur = lines[i].end
        used.add(i)
        matched = true
        break
      } else if (eq(cur, lines[i].end)) {
        pts.push(lines[i].end)
        cur = lines[i].start
        used.add(i)
        matched = true
        break
      }
    }
    if (!matched) return null
  }
  return eq(cur, pts[0]) ? pts : null
}

/**
 * Convert a sketch's elements into THREE.Shape[] suitable for ExtrudeGeometry.
 * All closed profiles (rects, circles, closed line loops) are returned.
 * Returns empty array if no closed profile can be derived.
 */
export function sketchElementsToShape(
  elements: SketchElement[],
  plane: PlaneId,
): THREE.Shape[] {
  const shapes: THREE.Shape[] = []

  // ── Rectangles ───────────────────────────────────────────────────────────
  for (const r of elements.filter((e): e is SketchRect => e.type === 'rect')) {
    const x0 = Math.min(r.start.x, r.end.x), x1 = Math.max(r.start.x, r.end.x)
    const y0 = Math.min(r.start.y, r.end.y), y1 = Math.max(r.start.y, r.end.y)
    const shape = new THREE.Shape()
    shape.moveTo(...pt(x0, y0, plane))
    shape.lineTo(...pt(x1, y0, plane))
    shape.lineTo(...pt(x1, y1, plane))
    shape.lineTo(...pt(x0, y1, plane))
    shape.closePath()
    shapes.push(shape)
  }

  // ── Circles ───────────────────────────────────────────────────────────────
  for (const c of elements.filter((e): e is SketchCircle => e.type === 'circle')) {
    const shape = new THREE.Shape()
    const [cx, cy] = pt(c.center.x, c.center.y, plane)
    shape.absarc(cx, cy, c.radius, 0, Math.PI * 2, false)
    shapes.push(shape)
  }

  // ── Closed line loop ──────────────────────────────────────────────────────
  const lines = elements.filter((e): e is SketchLine => e.type === 'line')
  if (lines.length >= 3) {
    const loop = tryLoop(lines)
    if (loop) {
      const shape = new THREE.Shape()
      shape.moveTo(...pt(loop[0].x, loop[0].y, plane))
      for (let i = 1; i < loop.length; i++) shape.lineTo(...pt(loop[i].x, loop[i].y, plane))
      shape.closePath()
      shapes.push(shape)
    }
  }

  return shapes
}
