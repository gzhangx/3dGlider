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

// ── Iterative constraint solver (Newton-Raphson) ──────────────────────────────

/** Represents a variable in the solver (x/y coordinate of a point). */
interface SolverVariable {
  elementId: string
  pointType: 'start' | 'end' | 'center' | 'radius'
  coord: 'x' | 'y'
  index: number
}

/** Constraint residual and Jacobian row. */
interface ConstraintEquation {
  type: SketchConstraint['type']
  residual(elements: SketchElement[]): number
  jacobian(elements: SketchElement[], variables: SolverVariable[]): number[]
  priority?: number // Lower = solved first (default 0)
}

/**
 * Extract a point from an element by id and type.
 */
function getPoint(elements: SketchElement[], elementId: string, pointType: 'start' | 'end' | 'center' | 'radius'): SketchPoint | null {
  const el = elements.find((e) => e.id === elementId)
  if (!el) return null
  if (pointType === 'start' && ('start' in el)) return el.start
  if (pointType === 'end' && ('end' in el)) return el.end
  if (pointType === 'center' && el.type === 'circle') return el.center
  if (pointType === 'center' && el.type === 'arc') return el.center
  if (pointType === 'radius' && el.type === 'circle') return { x: el.radius, y: 0 }
  return null
}

/**
 * Set a coordinate of a point in an element.
 */
function setPoint(el: SketchElement, pointType: 'start' | 'end' | 'center' | 'radius', coord: 'x' | 'y', value: number): SketchElement {
  if (pointType === 'start' && 'start' in el) {
    return { ...el, start: { ...el.start, [coord]: value } }
  }
  if (pointType === 'end' && 'end' in el) {
    return { ...el, end: { ...el.end, [coord]: value } }
  }
  if (pointType === 'center' && (el.type === 'circle' || el.type === 'arc')) {
    return { ...el, center: { ...el.center, [coord]: value } }
  }
  if (pointType === 'radius' && el.type === 'circle' && coord === 'x') {
    return { ...el, radius: Math.max(0.01, value) }
  }
  if (pointType === 'center' && el.type === 'rect') {
    // For rect, center is derived; treat it as dragging start or end
    return el
  }
  if (pointType === 'center' && el.type === 'line') {
    // For line, center is the midpoint; move both endpoints symmetrically
    return el
  }
  return el
}

/**
 * Build constraint equations from sketch constraints.
 */
function buildConstraintEquations(constraints: SketchConstraint[]): ConstraintEquation[] {
  const equations: ConstraintEquation[] = []

  for (const c of constraints) {
    if (c.type === 'coincident') {
      const p1 = c.p1
      const p2 = c.p2

      // X-coordinate coincident
      equations.push({
        type: 'coincident',
        residual: (els) => {
          const pt1 = getPoint(els, p1.elementId, p1.which)
          const pt2 = getPoint(els, p2.elementId, p2.which)
          return (pt1?.x ?? 0) - (pt2?.x ?? 0)
        },
        jacobian: (_els, vars) => {
          return vars.map((v) => {
            if (v.elementId === p1.elementId && v.pointType === p1.which && v.coord === 'x') return 1
            if (v.elementId === p2.elementId && v.pointType === p2.which && v.coord === 'x') return -1
            return 0
          })
        },
        priority: 10, // High priority
      })

      // Y-coordinate coincident
      equations.push({
        type: 'coincident',
        residual: (els) => {
          const pt1 = getPoint(els, p1.elementId, p1.which)
          const pt2 = getPoint(els, p2.elementId, p2.which)
          return (pt1?.y ?? 0) - (pt2?.y ?? 0)
        },
        jacobian: (_els, vars) => {
          return vars.map((v) => {
            if (v.elementId === p1.elementId && v.pointType === p1.which && v.coord === 'y') return 1
            if (v.elementId === p2.elementId && v.pointType === p2.which && v.coord === 'y') return -1
            return 0
          })
        },
        priority: 10,
      })
    } else if (c.type === 'length') {
      const elementId = c.elementId
      const targetLength = c.value

      equations.push({
        type: 'length',
        residual: (els) => {
          const el = els.find((e) => e.id === elementId)
          if (!el) return 0

          if (el.type === 'line') {
            return lineLength(el) - targetLength
          } else if (el.type === 'circle') {
            return el.radius - targetLength
          } else if (el.type === 'rect' && c.dimension === 'width') {
            return rectWidth(el) - targetLength
          } else if (el.type === 'rect' && c.dimension === 'height') {
            return rectHeight(el) - targetLength
          }
          return 0
        },
        jacobian: (els, vars) => {
          const el = els.find((e) => e.id === elementId)
          if (!el) return vars.map(() => 0)

          if (el.type === 'line') {
            const dx = el.end.x - el.start.x
            const dy = el.end.y - el.start.y
            const len = Math.hypot(dx, dy)
            if (len < 1e-9) return vars.map(() => 0)

            return vars.map((v) => {
              if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'x') return dx / len
              if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'y') return dy / len
              if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'x') return -dx / len
              if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'y') return -dy / len
              return 0
            })
          } else if (el.type === 'circle') {
            return vars.map((v) => {
              if (v.elementId === elementId && v.pointType === 'center' && (v.coord === 'x' || v.coord === 'y')) return 0
              return 0
            })
          } else if (el.type === 'rect' && c.dimension === 'width') {
            return vars.map((v) => {
              if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'x') return 1
              if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'x') return -1
              return 0
            })
          } else if (el.type === 'rect' && c.dimension === 'height') {
            return vars.map((v) => {
              if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'y') return 1
              if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'y') return -1
              return 0
            })
          }
          return vars.map(() => 0)
        },
      })
    } else if (c.type === 'angle') {
      const el1Id = c.elementId1
      const el2Id = c.elementId2
      const targetAngle = (c.value * Math.PI) / 180

      equations.push({
        type: 'angle',
        residual: (els) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return 0

          const angle1 = Math.atan2(el1.end.y - el1.start.y, el1.end.x - el1.start.x)
          const angle2 = Math.atan2(el2.end.y - el2.start.y, el2.end.x - el2.start.x)
          let diff = angle2 - angle1

          // Normalize to [-π, π]
          while (diff > Math.PI) diff -= 2 * Math.PI
          while (diff < -Math.PI) diff += 2 * Math.PI

          return diff - targetAngle
        },
        jacobian: (els, vars) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return vars.map(() => 0)

          const dx1 = el1.end.x - el1.start.x
          const dy1 = el1.end.y - el1.start.y
          const r1sq = dx1 * dx1 + dy1 * dy1
          if (r1sq < 1e-12) return vars.map(() => 0)

          const dx2 = el2.end.x - el2.start.x
          const dy2 = el2.end.y - el2.start.y
          const r2sq = dx2 * dx2 + dy2 * dy2
          if (r2sq < 1e-12) return vars.map(() => 0)

          return vars.map((v) => {
            let jac = 0
            // Derivative of atan2 w.r.t. end point
            if (v.elementId === el1Id && v.pointType === 'end') {
              if (v.coord === 'x') jac -= dy1 / r1sq
              if (v.coord === 'y') jac += dx1 / r1sq
            } else if (v.elementId === el1Id && v.pointType === 'start') {
              if (v.coord === 'x') jac += dy1 / r1sq
              if (v.coord === 'y') jac -= dx1 / r1sq
            } else if (v.elementId === el2Id && v.pointType === 'end') {
              if (v.coord === 'x') jac += dy2 / r2sq
              if (v.coord === 'y') jac -= dx2 / r2sq
            } else if (v.elementId === el2Id && v.pointType === 'start') {
              if (v.coord === 'x') jac -= dy2 / r2sq
              if (v.coord === 'y') jac += dx2 / r2sq
            }
            return jac
          })
        },
      })
    } else if (c.type === 'horizontal') {
      const elementId = c.elementId

      equations.push({
        type: 'horizontal',
        residual: (els) => {
          const el = els.find((e) => e.id === elementId)
          if (!el || el.type !== 'line') return 0
          return el.end.y - el.start.y
        },
        jacobian: (_els, vars) => {
          return vars.map((v) => {
            if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'y') return 1
            if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'y') return -1
            return 0
          })
        },
      })
    } else if (c.type === 'vertical') {
      const elementId = c.elementId

      equations.push({
        type: 'vertical',
        residual: (els) => {
          const el = els.find((e) => e.id === elementId)
          if (!el || el.type !== 'line') return 0
          return el.end.x - el.start.x
        },
        jacobian: (_els, vars) => {
          return vars.map((v) => {
            if (v.elementId === elementId && v.pointType === 'end' && v.coord === 'x') return 1
            if (v.elementId === elementId && v.pointType === 'start' && v.coord === 'x') return -1
            return 0
          })
        },
      })
    } else if (c.type === 'parallel') {
      const el1Id = c.elementId1
      const el2Id = c.elementId2

      equations.push({
        type: 'parallel',
        residual: (els) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return 0

          const dx1 = el1.end.x - el1.start.x
          const dy1 = el1.end.y - el1.start.y
          const dx2 = el2.end.x - el2.start.x
          const dy2 = el2.end.y - el2.start.y

          // Cross product should be zero for parallel lines
          return dx1 * dy2 - dy1 * dx2
        },
        jacobian: (els, vars) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return vars.map(() => 0)

          return vars.map((v) => {
            const dx2 = el2.end.x - el2.start.x
            const dy2 = el2.end.y - el2.start.y

            let jac = 0
            if (v.elementId === el1Id) {
              if (v.pointType === 'end' && v.coord === 'x') jac = dy2
              if (v.pointType === 'end' && v.coord === 'y') jac = -dx2
              if (v.pointType === 'start' && v.coord === 'x') jac = -dy2
              if (v.pointType === 'start' && v.coord === 'y') jac = dx2
            } else if (v.elementId === el2Id) {
              const dx1 = el1.end.x - el1.start.x
              const dy1 = el1.end.y - el1.start.y
              if (v.pointType === 'end' && v.coord === 'x') jac = -dy1
              if (v.pointType === 'end' && v.coord === 'y') jac = dx1
              if (v.pointType === 'start' && v.coord === 'x') jac = dy1
              if (v.pointType === 'start' && v.coord === 'y') jac = -dx1
            }
            return jac
          })
        },
      })
    } else if (c.type === 'perpendicular') {
      const el1Id = c.elementId1
      const el2Id = c.elementId2

      equations.push({
        type: 'perpendicular',
        residual: (els) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return 0

          const dx1 = el1.end.x - el1.start.x
          const dy1 = el1.end.y - el1.start.y
          const dx2 = el2.end.x - el2.start.x
          const dy2 = el2.end.y - el2.start.y

          // Dot product should be zero for perpendicular lines
          return dx1 * dx2 + dy1 * dy2
        },
        jacobian: (els, vars) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2 || el1.type !== 'line' || el2.type !== 'line') return vars.map(() => 0)

          return vars.map((v) => {
            const dx2 = el2.end.x - el2.start.x
            const dy2 = el2.end.y - el2.start.y

            let jac = 0
            if (v.elementId === el1Id) {
              if (v.pointType === 'end' && v.coord === 'x') jac = dx2
              if (v.pointType === 'end' && v.coord === 'y') jac = dy2
              if (v.pointType === 'start' && v.coord === 'x') jac = -dx2
              if (v.pointType === 'start' && v.coord === 'y') jac = -dy2
            } else if (v.elementId === el2Id) {
              const dx1 = el1.end.x - el1.start.x
              const dy1 = el1.end.y - el1.start.y
              if (v.pointType === 'end' && v.coord === 'x') jac = dx1
              if (v.pointType === 'end' && v.coord === 'y') jac = dy1
              if (v.pointType === 'start' && v.coord === 'x') jac = -dx1
              if (v.pointType === 'start' && v.coord === 'y') jac = -dy1
            }
            return jac
          })
        },
      })
    } else if (c.type === 'equal') {
      const el1Id = c.elementId1
      const el2Id = c.elementId2

      equations.push({
        type: 'equal',
        residual: (els) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2) return 0

          let len1 = 0, len2 = 0

          if (el1.type === 'line') len1 = lineLength(el1)
          else if (el1.type === 'circle') len1 = el1.radius
          else if (el1.type === 'rect' && el2.type === 'rect') len1 = rectWidth(el1) // Compare widths for rects

          if (el2.type === 'line') len2 = lineLength(el2)
          else if (el2.type === 'circle') len2 = el2.radius
          else if (el2.type === 'rect' && el1.type === 'rect') len2 = rectWidth(el2)

          return len1 - len2
        },
        jacobian: (els, vars) => {
          const el1 = els.find((e) => e.id === el1Id)
          const el2 = els.find((e) => e.id === el2Id)
          if (!el1 || !el2) return vars.map(() => 0)

          const dx1 = el1.type === 'line' ? el1.end.x - el1.start.x : 0
          const dy1 = el1.type === 'line' ? el1.end.y - el1.start.y : 0
          const len1 = el1.type === 'line' ? Math.hypot(dx1, dy1) : 1

          const dx2 = el2.type === 'line' ? el2.end.x - el2.start.x : 0
          const dy2 = el2.type === 'line' ? el2.end.y - el2.start.y : 0
          const len2 = el2.type === 'line' ? Math.hypot(dx2, dy2) : 1

          return vars.map((v) => {
            let jac = 0
            if (el1.type === 'line' && len1 > 1e-9) {
              if (v.elementId === el1Id && v.pointType === 'end' && v.coord === 'x') jac += dx1 / len1
              if (v.elementId === el1Id && v.pointType === 'end' && v.coord === 'y') jac += dy1 / len1
              if (v.elementId === el1Id && v.pointType === 'start' && v.coord === 'x') jac -= dx1 / len1
              if (v.elementId === el1Id && v.pointType === 'start' && v.coord === 'y') jac -= dy1 / len1
            }
            if (el2.type === 'line' && len2 > 1e-9) {
              if (v.elementId === el2Id && v.pointType === 'end' && v.coord === 'x') jac -= dx2 / len2
              if (v.elementId === el2Id && v.pointType === 'end' && v.coord === 'y') jac -= dy2 / len2
              if (v.elementId === el2Id && v.pointType === 'start' && v.coord === 'x') jac += dx2 / len2
              if (v.elementId === el2Id && v.pointType === 'start' && v.coord === 'y') jac += dy2 / len2
            }
            return jac
          })
        },
      })
    } else if (c.type === 'tangent') {
      const lineId = c.elementId1
      const circleId = c.elementId2
      // Support both (line, circle) and (circle, line)
      const actualLineId = lineId
      const actualCircleId = circleId

      equations.push({
        type: 'tangent',
        residual: (els) => {
          const line = els.find((e) => e.id === actualLineId)
          const circle = els.find((e) => e.id === actualCircleId)
          if (!line || !circle) return 0

          // If line and circle are swapped, adjust
          let l = line, c = circle
          if (line.type === 'circle' && circle.type === 'line') {
            [l, c] = [circle, line]
          }

          if (l.type !== 'line' || c.type !== 'circle') return 0

          // Distance from circle center to line
          const cx = c.center.x
          const cy = c.center.y
          const x1 = l.start.x
          const y1 = l.start.y
          const x2 = l.end.x
          const y2 = l.end.y

          const dx = x2 - x1
          const dy = y2 - y1
          const lineLenSq = dx * dx + dy * dy

          if (lineLenSq < 1e-12) return c.radius // Degenerate line, distance is undefined

          // Distance = |ax + by + c| / sqrt(a^2 + b^2) where line is ax + by + c = 0
          // Line through (x1, y1) and (x2, y2): (y2-y1)x - (x2-x1)y + x2*y1 - y2*x1 = 0
          const num = Math.abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1)
          const dist = num / Math.sqrt(lineLenSq)

          // Residual: distance - radius (tangent when zero)
          return dist - c.radius
        },
        jacobian: (els, vars) => {
          const line = els.find((e) => e.id === actualLineId)
          const circle = els.find((e) => e.id === actualCircleId)
          if (!line || !circle) return vars.map(() => 0)

          let l = line, circleEl = circle
          if (line.type === 'circle' && circle.type === 'line') {
            [l, circleEl] = [circle, line]
          }

          if (l.type !== 'line' || circleEl.type !== 'circle') return vars.map(() => 0)

          // Numerical differentiation
          const eps = 1e-6
          const residual0 = (() => {
            const cx = circleEl.center.x
            const cy = circleEl.center.y
            const x1 = l.start.x
            const y1 = l.start.y
            const x2 = l.end.x
            const y2 = l.end.y
            const dx = x2 - x1
            const dy = y2 - y1
            const lineLenSq = dx * dx + dy * dy
            if (lineLenSq < 1e-12) return circleEl.radius
            const num = Math.abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1)
            return num / Math.sqrt(lineLenSq) - circleEl.radius
          })()

          return vars.map((v) => {
            // Perturb the variable and compute new residual
            const saveVal = getPoint(els, v.elementId, v.pointType)?.[v.coord] ?? 0
            const perturbed = els.map((e) => {
              if (e.id === v.elementId) {
                return setPoint(e, v.pointType, v.coord, saveVal + eps)
              }
              return e
            })

            const l_pert = perturbed.find(e => e.id === l.id) as SketchLine
            const circ_pert = perturbed.find(e => e.id === circleEl.id) as SketchCircle
            
            if (!l_pert || !circ_pert) return 0

            const cx = circ_pert.center.x
            const cy = circ_pert.center.y
            const x1 = l_pert.start.x
            const y1 = l_pert.start.y
            const x2 = l_pert.end.x
            const y2 = l_pert.end.y
            const dx = x2 - x1
            const dy = y2 - y1
            const lineLenSq = dx * dx + dy * dy
            if (lineLenSq < 1e-12) return 0

            const num = Math.abs((y2 - y1) * cx - (x2 - x1) * cy + x2 * y1 - y2 * x1)
            const residual1 = num / Math.sqrt(lineLenSq) - circ_pert.radius

            return (residual1 - residual0) / eps
          })
        },
      })
    }
  }

  return equations
}

/**
 * Solve constraints using Newton-Raphson iteration.
 * Returns updated elements with constraints satisfied.
 *
 * @param elements Sketch elements to solve
 * @param constraints Constraints to satisfy
 * @param fixedPoints Set of (elementId, pointType) to keep fixed during solving
 * @param maxIterations Maximum Newton-Raphson iterations
 * @param tolerance Convergence tolerance (max residual)
 * @returns Updated elements
 */
export function solveConstraints(
  elements: SketchElement[],
  constraints: SketchConstraint[],
  fixedPoints?: Set<string>,
  maxIterations: number = 50,
  tolerance: number = 1e-6,
): SketchElement[] {
  if (constraints.length === 0) return elements
  if (elements.length === 0) return elements

  // Find all variables (movable element points)
  const variables: SolverVariable[] = []
  let varIndex = 0

  // Check if any tangent constraints exist
  const hasTangentConstraints = constraints.some(c => c.type === 'tangent')

  for (const el of elements) {
    const fixKey = (pt: string) => `${el.id}:${pt}`

    if (el.type === 'line') {
      if (!fixedPoints?.has(fixKey('start'))) {
        variables.push({ elementId: el.id, pointType: 'start', coord: 'x', index: varIndex++ })
        variables.push({ elementId: el.id, pointType: 'start', coord: 'y', index: varIndex++ })
      }
      if (!fixedPoints?.has(fixKey('end'))) {
        variables.push({ elementId: el.id, pointType: 'end', coord: 'x', index: varIndex++ })
        variables.push({ elementId: el.id, pointType: 'end', coord: 'y', index: varIndex++ })
      }
    } else if (el.type === 'rect') {
      if (!fixedPoints?.has(fixKey('start'))) {
        variables.push({ elementId: el.id, pointType: 'start', coord: 'x', index: varIndex++ })
        variables.push({ elementId: el.id, pointType: 'start', coord: 'y', index: varIndex++ })
      }
      if (!fixedPoints?.has(fixKey('end'))) {
        variables.push({ elementId: el.id, pointType: 'end', coord: 'x', index: varIndex++ })
        variables.push({ elementId: el.id, pointType: 'end', coord: 'y', index: varIndex++ })
      }
    } else if (el.type === 'circle' || el.type === 'arc') {
      if (!fixedPoints?.has(fixKey('center'))) {
        variables.push({ elementId: el.id, pointType: 'center', coord: 'x', index: varIndex++ })
        variables.push({ elementId: el.id, pointType: 'center', coord: 'y', index: varIndex++ })
      }
      // Add radius as a variable for circles if there are tangent constraints
      if (el.type === 'circle' && hasTangentConstraints) {
        variables.push({ elementId: el.id, pointType: 'radius', coord: 'x', index: varIndex++ })
      }
    }
  }

  if (variables.length === 0) return elements

  // Build constraint equations
  const equations = buildConstraintEquations(constraints)
  if (equations.length === 0) return elements

  // Sort by priority (lower first)
  equations.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  let currentElements = [...elements]
  let iteration = 0

  for (iteration; iteration < maxIterations; iteration++) {
    // Compute residuals
    const residuals = equations.map((eq) => eq.residual(currentElements))
    const maxResidual = Math.max(...residuals.map(Math.abs))

    if (maxResidual < tolerance) break

    // Build Jacobian matrix (equations × variables)
    const jacobian: number[][] = equations.map((eq) => eq.jacobian(currentElements, variables))

    // Solve using damped least-squares: (J^T J + λI) δ = -J^T r
    // This is robust for underdetermined and overdetermined systems.
    const n = variables.length
    const m = jacobian.length
    const lambda = 1e-6

    const normal: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const rhs: number[] = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0
        for (let k = 0; k < m; k++) {
          sum += jacobian[k][i] * jacobian[k][j]
        }
        normal[i][j] = sum
      }
      normal[i][i] += lambda

      let sum = 0
      for (let k = 0; k < m; k++) {
        sum += jacobian[k][i] * residuals[k]
      }
      rhs[i] = -sum
    }

    const augmented = normal.map((row, i) => [...row, rhs[i]])
    gaussianElimination(augmented)

    // Extract solution via back substitution
    const delta = new Array(n).fill(0)
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0
      for (let j = i + 1; j < n; j++) {
        sum += augmented[i][j] * delta[j]
      }
      if (Math.abs(augmented[i][i]) > 1e-12) {
        delta[i] = (augmented[i][n] - sum) / augmented[i][i]
      }
    }

    // Update variables with damping (0.5 for stability)
    const dampingFactor = 0.5
    for (const v of variables) {
      const el = currentElements.find((e) => e.id === v.elementId)
      if (!el) continue

      const oldPt = getPoint(currentElements, v.elementId, v.pointType)
      if (!oldPt) continue

      const newValue = (oldPt[v.coord] ?? 0) + dampingFactor * delta[v.index]
      const updated = setPoint(el, v.pointType, v.coord, newValue)
      currentElements = currentElements.map((e) => (e.id === el.id ? updated : e))
    }
  }

  return currentElements
}

/**
 * Gaussian elimination with partial pivoting for solving Ax=b.
 * Modifies the augmented matrix in-place.
 */
function gaussianElimination(matrix: number[][]): void {
  const m = matrix.length
  if (m === 0) return
  const n = matrix[0].length - 1

  for (let col = 0; col < Math.min(m, n); col++) {
    // Find pivot
    let pivotRow = col
    for (let row = col + 1; row < m; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivotRow][col])) {
        pivotRow = row
      }
    }

    // Swap rows
    if (pivotRow !== col) {
      [matrix[col], matrix[pivotRow]] = [matrix[pivotRow], matrix[col]]
    }

    if (Math.abs(matrix[col][col]) < 1e-12) continue

    // Eliminate below
    for (let row = col + 1; row < m; row++) {
      const factor = matrix[row][col] / matrix[col][col]
      for (let j = col; j <= n; j++) {
        matrix[row][j] -= factor * matrix[col][j]
      }
    }
  }
}
