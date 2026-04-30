import { SketchLine, SketchRect, SketchCircle, SketchPoint } from '../store/modelStore'

/** Move el.end along the (end - start) direction so the line is exactly `value` units long. */
export function applyLength(el: SketchLine, value: number): SketchLine {
  const dx = el.end.x - el.start.x
  const dy = el.end.y - el.start.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return el
  const scale = value / len
  return {
    ...el,
    end: { x: el.start.x + dx * scale, y: el.start.y + dy * scale },
  }
}

/**
 * Rotate el2 around its start point so the angle between el1 and el2 equals `angleDeg`.
 * The angle is measured from el1's direction to el2's direction, counter-clockwise.
 */
export function applyAngle(el1: SketchLine, el2: SketchLine, angleDeg: number): SketchLine {
  const angleRad = (angleDeg * Math.PI) / 180
  const ax = el1.end.x - el1.start.x
  const ay = el1.end.y - el1.start.y
  const baseAngle = Math.atan2(ay, ax)
  const targetAngle = baseAngle + angleRad
  const el2len = Math.hypot(el2.end.x - el2.start.x, el2.end.y - el2.start.y)
  return {
    ...el2,
    end: {
      x: el2.start.x + Math.cos(targetAngle) * el2len,
      y: el2.start.y + Math.sin(targetAngle) * el2len,
    },
  }
}

/** Set rect width (|end.x - start.x|), preserving direction and start. */
export function applyRectWidth(el: SketchRect, value: number): SketchRect {
  const sign = el.end.x >= el.start.x ? 1 : -1
  return { ...el, end: { x: el.start.x + sign * Math.abs(value), y: el.end.y } }
}

/** Set rect height (|end.y - start.y|), preserving direction and start. */
export function applyRectHeight(el: SketchRect, value: number): SketchRect {
  const sign = el.end.y >= el.start.y ? 1 : -1
  return { ...el, end: { x: el.end.x, y: el.start.y + sign * Math.abs(value) } }
}

/** Set circle radius. */
export function applyRadius(el: SketchCircle, value: number): SketchCircle {
  return { ...el, radius: Math.abs(value) }
}

/** Get the current length of a line. */
export function lineLength(el: SketchLine): number {
  return Math.hypot(el.end.x - el.start.x, el.end.y - el.start.y)
}

/** Get rect width. */
export function rectWidth(el: SketchRect): number {
  return Math.abs(el.end.x - el.start.x)
}

/** Get rect height. */
export function rectHeight(el: SketchRect): number {
  return Math.abs(el.end.y - el.start.y)
}

/** Get the angle (degrees) from el1 to el2, counter-clockwise. */
export function angleBetween(el1: SketchLine, el2: SketchLine): number {
  const a1 = Math.atan2(el1.end.y - el1.start.y, el1.end.x - el1.start.x)
  const a2 = Math.atan2(el2.end.y - el2.start.y, el2.end.x - el2.start.x)
  let deg = ((a2 - a1) * 180) / Math.PI
  while (deg < 0) deg += 360
  while (deg >= 360) deg -= 360
  return Math.round(deg * 1000) / 1000
}

/** Get a named endpoint from a sketch element. */
export function getEndpoint(el: { start?: SketchPoint; end?: SketchPoint }, which: 'start' | 'end'): SketchPoint | null {
  if (which === 'start' && el.start) return el.start
  if (which === 'end' && el.end) return el.end
  return null
}
