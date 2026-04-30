import { SketchLine, SketchRect, SketchCircle, SketchPoint, SketchElement, SketchConstraint, Parameter } from '../store/modelStore'

// ── Line helpers ──────────────────────────────────────────────────────────────

/** Move el.end along (end-start) so the line is exactly `value` units long. */
export function applyLength(el: SketchLine, value: number): SketchLine {
  const dx = el.end.x - el.start.x
  const dy = el.end.y - el.start.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return el
  const s = value / len
  return { ...el, end: { x: el.start.x + dx * s, y: el.start.y + dy * s } }
}

/** Rotate el2 around its start so angle from el1 to el2 equals angleDeg (CCW). */
export function applyAngle(el1: SketchLine, el2: SketchLine, angleDeg: number): SketchLine {
  const rad = (angleDeg * Math.PI) / 180
  const base = Math.atan2(el1.end.y - el1.start.y, el1.end.x - el1.start.x)
  const target = base + rad
  const len2 = Math.hypot(el2.end.x - el2.start.x, el2.end.y - el2.start.y)
  return { ...el2, end: { x: el2.start.x + Math.cos(target) * len2, y: el2.start.y + Math.sin(target) * len2 } }
}

/** Rotate el2 to be parallel to el1 (same direction), preserving el2's length and start. */
export function applyParallel(el1: SketchLine, el2: SketchLine): SketchLine {
  const angle = Math.atan2(el1.end.y - el1.start.y, el1.end.x - el1.start.x)
  const len2 = Math.hypot(el2.end.x - el2.start.x, el2.end.y - el2.start.y)
  return { ...el2, end: { x: el2.start.x + Math.cos(angle) * len2, y: el2.start.y + Math.sin(angle) * len2 } }
}

/** Rotate el2 to be perpendicular to el1 (+90°), preserving el2's length and start. */
export function applyPerpendicular(el1: SketchLine, el2: SketchLine): SketchLine {
  return applyAngle(el1, el2, 90)
}

/** Rotate el to be horizontal (0°), preserving length and start. */
export function applyHorizontal(el: SketchLine): SketchLine {
  const len = Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y)
  return { ...el, end: { x: el.start.x + len, y: el.start.y } }
}

/** Rotate el to be vertical (90°), preserving length and start. */
export function applyVertical(el: SketchLine): SketchLine {
  const len = Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y)
  return { ...el, end: { x: el.start.x, y: el.start.y + len } }
}

/** Set el2's length to equal el1's, keeping el2's direction and start. */
export function applyEqual(el1: SketchLine, el2: SketchLine): SketchLine {
  return applyLength(el2, lineLength(el1))
}

// ── Rect helpers ──────────────────────────────────────────────────────────────

/** Set rect width, preserving direction and start corner. */
export function applyRectWidth(el: SketchRect, value: number): SketchRect {
  const sign = el.end.x >= el.start.x ? 1 : -1
  return { ...el, end: { x: el.start.x + sign * Math.abs(value), y: el.end.y } }
}

/** Set rect height, preserving direction and start corner. */
export function applyRectHeight(el: SketchRect, value: number): SketchRect {
  const sign = el.end.y >= el.start.y ? 1 : -1
  return { ...el, end: { x: el.end.x, y: el.start.y + sign * Math.abs(value) } }
}

// ── Circle helpers ────────────────────────────────────────────────────────────

/** Set circle radius. */
export function applyRadius(el: SketchCircle, value: number): SketchCircle {
  return { ...el, radius: Math.abs(value) }
}

// ── Measurement helpers ───────────────────────────────────────────────────────

export function lineLength(el: SketchLine): number {
  return Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y)
}

export function rectWidth(el: SketchRect): number {
  return Math.abs(el.end.x - el.start.x)
}

export function rectHeight(el: SketchRect): number {
  return Math.abs(el.end.y - el.start.y)
}

/** Angle in degrees from el1 to el2, CCW, normalized to [0, 360). */
export function angleBetween(el1: SketchLine, el2: SketchLine): number {
  const a1 = Math.atan2(el1.end.y - el1.start.y, el1.end.x - el1.start.x)
  const a2 = Math.atan2(el2.end.y - el2.start.y, el2.end.x - el2.start.x)
  let deg = ((a2 - a1) * 180) / Math.PI
  while (deg < 0) deg += 360
  while (deg >= 360) deg -= 360
  return Math.round(deg * 1000) / 1000
}

export function getEndpoint(el: { start?: SketchPoint; end?: SketchPoint }, which: 'start' | 'end'): SketchPoint | null {
  return which === 'start' ? (el.start ?? null) : (el.end ?? null)
}

// ── Parametric constraint re-application ─────────────────────────────────────

/** Re-apply all constraints that have a paramRef, updating element geometry. */
export function reapplyParametricConstraints(
  elements: SketchElement[],
  constraints: SketchConstraint[],
  parameters: Parameter[],
): SketchElement[] {
  let els = [...elements]
  for (const c of constraints) {
    if (c.type === 'length' && c.paramRef) {
      const param = parameters.find((p) => p.name === c.paramRef)
      if (!param) continue
      const el = els.find((e) => e.id === c.elementId)
      if (!el) continue
      let updated: SketchElement | null = null
      if (el.type === 'line' && !c.dimension)
        updated = applyLength(el as SketchLine, param.value)
      else if (el.type === 'circle' && c.dimension === 'radius')
        updated = applyRadius(el as SketchCircle, param.value)
      else if (el.type === 'rect' && c.dimension === 'width')
        updated = applyRectWidth(el as SketchRect, param.value)
      else if (el.type === 'rect' && c.dimension === 'height')
        updated = applyRectHeight(el as SketchRect, param.value)
      if (updated) els = els.map((e) => (e.id === el.id ? updated! : e))
    } else if (c.type === 'angle' && c.paramRef) {
      const param = parameters.find((p) => p.name === c.paramRef)
      if (!param) continue
      const el1 = els.find((e) => e.id === c.elementId1)
      const el2 = els.find((e) => e.id === c.elementId2)
      if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') continue
      const updated = applyAngle(el1 as SketchLine, el2 as SketchLine, param.value)
      els = els.map((e) => (e.id === el2.id ? updated : e))
    }
  }
  return els
}
