import * as THREE from 'three'
import { PlaneId, SketchElement, SketchLine, SketchRect, SketchCircle, SketchArc } from '../store/modelStore'

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

// Extract one or more closed loops from a set of line segments.
// This is tolerant to extra segments (e.g. after cut) by finding any cycle(s)
// rather than requiring that *all* lines belong to a single loop.
function extractLoops(lines: SketchLine[]) {
  const EPS = 0.05
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`
  const rep = new Map<string, { x: number; y: number }>()
  const node = (p: { x: number; y: number }) => {
    const k = key(p)
    if (!rep.has(k)) rep.set(k, p)
    return k
  }

  type Edge = { i: number; a: string; b: string }
  const edges: Edge[] = lines.map((ln, i) => ({ i, a: node(ln.start), b: node(ln.end) }))
  const adj = new Map<string, Edge[]>()
  for (const e of edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e])
  }

  const used = new Set<number>()
  const loops: Array<Array<{ x: number; y: number }>> = []

  for (const e0 of edges) {
    if (used.has(e0.i)) continue
    used.add(e0.i)

    // Walk forward from e0.a -> e0.b.
    const startNode = e0.a
    let prevNode = e0.a
    let curNode = e0.b
    const pts: Array<{ x: number; y: number }> = [rep.get(startNode)!, rep.get(curNode)!]

    // Bound steps to avoid infinite loops in bad graphs.
    for (let steps = 0; steps < edges.length + 2; steps++) {
      if (curNode === startNode) {
        // drop duplicate last point for shape construction
        loops.push(pts.slice(0, -1))
        break
      }
      const candidates = (adj.get(curNode) ?? []).filter((ed) => !used.has(ed.i))
      if (candidates.length === 0) break

      // Prefer continuing with an edge that doesn't immediately backtrack.
      let next = candidates[0]
      if (candidates.length > 1) {
        const nonBack = candidates.find((ed) => (ed.a === curNode ? ed.b : ed.a) !== prevNode)
        if (nonBack) next = nonBack
      }
      used.add(next.i)
      const nextNode = next.a === curNode ? next.b : next.a
      prevNode = curNode
      curNode = nextNode
      pts.push(rep.get(curNode)!)
    }
  }

  // Filter out degenerate loops
  return loops.filter((lp) => lp.length >= 3)
}

function extractMixedLoops(segments: Array<SketchLine | SketchArc>) {
  const EPS = 0.05
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`
  const rep = new Map<string, { x: number; y: number }>()
  const node = (p: { x: number; y: number }) => {
    const k = key(p)
    if (!rep.has(k)) rep.set(k, p)
    return k
  }

  const TAU = Math.PI * 2
  const unwrapArc = (arc: SketchArc) => {
    const a0 = arc.startAngle
    let a1 = arc.endAngle
    if (a1 < a0) a1 += TAU
    return { a0, a1 }
  }
  const arcEndpoint = (arc: SketchArc, a: number) => ({
    x: arc.center.x + Math.cos(a) * arc.radius,
    y: arc.center.y + Math.sin(a) * arc.radius,
  })

  type Edge =
    | { i: number; kind: 'line'; a: string; b: string; seg: SketchLine }
    | { i: number; kind: 'arc'; a: string; b: string; seg: SketchArc; a0: number; a1: number }

  const edges: Edge[] = segments.map((s, i) => {
    if (s.type === 'line') {
      return { i, kind: 'line', a: node(s.start), b: node(s.end), seg: s }
    }
    const { a0, a1 } = unwrapArc(s)
    const p0 = arcEndpoint(s, a0)
    const p1 = arcEndpoint(s, a1)
    return { i, kind: 'arc', a: node(p0), b: node(p1), seg: s, a0, a1 }
  })

  const adj = new Map<string, Edge[]>()
  for (const e of edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e])
  }

  const used = new Set<number>()
  const loops: Array<Edge[]> = []

  for (const e0 of edges) {
    if (used.has(e0.i)) continue
    used.add(e0.i)

    const startNode = e0.a
    let prevNode = e0.a
    let curNode = e0.b
    const path: Edge[] = [e0]

    for (let steps = 0; steps < edges.length + 2; steps++) {
      if (curNode === startNode) {
        loops.push(path)
        break
      }
      const candidates = (adj.get(curNode) ?? []).filter((ed) => !used.has(ed.i))
      if (candidates.length === 0) break

      let next = candidates[0]
      if (candidates.length > 1) {
        const nonBack = candidates.find((ed) => (ed.a === curNode ? ed.b : ed.a) !== prevNode)
        if (nonBack) next = nonBack
      }
      used.add(next.i)
      const nextNode = next.a === curNode ? next.b : next.a
      prevNode = curNode
      curNode = nextNode
      path.push(next)
    }
  }

  return { loops, rep }
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

  // ── Full arcs (treated as circles) ─────────────────────────────────────────
  // After cutting, circles may be represented as arcs. Only a full 2π arc is a closed profile.
  const TAU = Math.PI * 2
  const normSpan = (a0: number, a1: number) => {
    let s = a1 - a0
    s = ((s % TAU) + TAU) % TAU
    return s
  }
  for (const a of elements.filter((e): e is SketchArc => e.type === 'arc')) {
    const span = normSpan(a.startAngle, a.endAngle)
    if (Math.abs(span - TAU) > 1e-3) continue
    const shape = new THREE.Shape()
    const [cx, cy] = pt(a.center.x, a.center.y, plane)
    shape.absarc(cx, cy, a.radius, 0, TAU, false)
    shapes.push(shape)
  }

  // ── Closed line loop ──────────────────────────────────────────────────────
  const lines = elements.filter((e): e is SketchLine => e.type === 'line')
  if (lines.length >= 3) {
    const loops = extractLoops(lines)
    for (const loop of loops) {
      const shape = new THREE.Shape()
      shape.moveTo(...pt(loop[0].x, loop[0].y, plane))
      for (let i = 1; i < loop.length; i++) shape.lineTo(...pt(loop[i].x, loop[i].y, plane))
      shape.closePath()
      shapes.push(shape)
    }
  }

  // ── Mixed loop (lines + arcs) ─────────────────────────────────────────────
  const segs = elements.filter((e): e is SketchLine | SketchArc => e.type === 'line' || e.type === 'arc')
  if (segs.length >= 2) {
    const { loops, rep } = extractMixedLoops(segs)
    for (const path of loops) {
      if (path.length < 2) continue
      // Build an ordered node sequence alongside edges
      let cur = path[0].a
      const shape = new THREE.Shape()
      const p0 = rep.get(cur)!
      shape.moveTo(...pt(p0.x, p0.y, plane))

      for (const e of path) {
        const next = e.a === cur ? e.b : e.a
        if (e.kind === 'line') {
          const p = rep.get(next)!
          shape.lineTo(...pt(p.x, p.y, plane))
        } else {
          const [cx, cy] = pt(e.seg.center.x, e.seg.center.y, plane)
          const startNode = e.a
          const endNode = e.b
          const forward = cur === startNode && next === endNode
          const a0 = forward ? e.a0 : e.a1
          const a1 = forward ? e.a1 : e.a0
          const clockwise = !forward
          shape.absarc(cx, cy, e.seg.radius, a0, a1, clockwise)
        }
        cur = next
      }
      shape.closePath()
      shapes.push(shape)
    }
  }

  return shapes
}
