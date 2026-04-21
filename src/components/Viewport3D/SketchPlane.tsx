import { useState, useEffect, useCallback } from 'react'
import { Line } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import {
  useModelStore,
  PlaneId,
  SketchPoint,
  SketchElement,
  SketchLine,
  SketchRect,
  SketchCircle,
  SketchArc,
} from '../../store/modelStore'
import {
  PLANE_ROTATION,
  worldPt,
  toSketch,
  snapPt,
  linePts,
  rectPts,
  circlePts,
  arcPts,
} from '../../lib/sketchGeometry'
import { distToSeg, distToCircle, computeCut, computeCircleCut, CutResult, CircleCutResult } from '../../lib/cutTool'

// ─── dot marker ──────────────────────────────────────────────────────────────

function Dot({ pos, color, size = 0.06 }: { pos: [number, number, number]; color: string; size?: number }) {
  return (
    <mesh position={pos}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

function rectCorners(rect: SketchRect): SketchPoint[] {
  return [
    { x: rect.start.x, y: rect.start.y },
    { x: rect.end.x, y: rect.start.y },
    { x: rect.end.x, y: rect.end.y },
    { x: rect.start.x, y: rect.end.y },
  ]
}

// ─── single element renderer (with hover/select) ──────────────────────────────

/** Let the invisible sketch plane receive hits in cut mode (Line2 otherwise wins the raycast). */
const noopRaycast: () => void = () => {}

function SketchEl({ el, plane, highlighted }: { el: SketchElement; plane: PlaneId; highlighted?: boolean }) {
  const { activeTool, selectedElementId, selectElement } = useModelStore()
  const [hovered, setHovered] = useState(false)

  const isSelected = selectedElementId === el.id
  const color = highlighted ? '#ff8844' : isSelected ? '#ff8844' : hovered ? '#ffe888' : '#ffdd44'
  const width = highlighted || isSelected || hovered ? 3 : 2

  const selectProps = activeTool === 'select'
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectElement(el.id) },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
      }
    : {}

  const cutPassthrough = activeTool === 'cut' ? { raycast: noopRaycast } : {}

  if (el.type === 'line')
    return <Line points={linePts(el.start, el.end, plane)} color={color} lineWidth={width} {...cutPassthrough} {...selectProps} />
  if (el.type === 'rect')
    return <Line points={rectPts(el.start, el.end, plane)} color={color} lineWidth={width} {...cutPassthrough} {...selectProps} />
  if (el.type === 'circle')
    return <Line points={circlePts(el.center, el.radius, plane)} color={color} lineWidth={width} {...cutPassthrough} {...selectProps} />
  if (el.type === 'arc')
    return <Line points={arcPts(el.center, el.radius, el.startAngle, el.endAngle, plane)} color={color} lineWidth={width} {...cutPassthrough} {...selectProps} />
  return null
}

// ─── main component ───────────────────────────────────────────────────────────

export function SketchPlane() {
  const {
    activePlane, activeTool, sketchElements,
    selectedElementId, selectElement,
    addSketchElement, deleteSketchElement, cutSketchElement, exitSketch,
  } = useModelStore()

  const [startPt, setStartPt] = useState<SketchPoint | null>(null)
  const [cursorPt, setCursorPt] = useState<SketchPoint | null>(null)
  const [cutPreview, setCutPreview] = useState<CutResult | CircleCutResult | null>(null)
  const [cutTarget, setCutTarget] = useState<
    | { kind: 'line'; line: SketchLine }
    | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
    | { kind: 'circle'; circle: SketchCircle }
    | null
  >(null)

  useEffect(() => { setStartPt(null); setCursorPt(null); setCutPreview(null); setCutTarget(null) }, [activeTool])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (startPt) setStartPt(null)
        else if (selectedElementId) selectElement(null)
        else exitSketch()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        deleteSketchElement(selectedElementId)
      }
    },
    [startPt, selectedElementId, exitSketch, selectElement, deleteSketchElement],
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!activePlane) return null
  const plane = activePlane
  const isDrawTool = activeTool !== 'select'

  const getSnapped = (e: ThreeEvent<PointerEvent | MouseEvent>) => snapPt(toSketch(e.point, plane))
  const getRaw    = (e: ThreeEvent<PointerEvent | MouseEvent>) => toSketch(e.point, plane)

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setCursorPt(getSnapped(e))

    if (activeTool === 'cut') {
      const raw = getRaw(e)
      const THRESHOLD = 0.5
      let nearest:
        | { kind: 'line'; line: SketchLine }
        | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
        | { kind: 'circle'; circle: SketchCircle }
        | null = null
      let minDist = THRESHOLD
      for (const el of sketchElements) {
        if (el.type === 'line') {
          const d = distToSeg(raw, el.start, el.end)
          if (d < minDist) { minDist = d; nearest = { kind: 'line', line: el } }
          continue
        }
        if (el.type === 'rect') {
          const c = rectCorners(el)
          for (let i = 0; i < 4; i++) {
            const d = distToSeg(raw, c[i], c[(i + 1) % 4])
            if (d < minDist) {
              minDist = d
              nearest = { kind: 'rect-edge', rect: el, edgeIndex: i }
            }
          }
        }
        if (el.type === 'circle') {
          const d = distToCircle(raw, el.center, el.radius)
          if (d < minDist) { minDist = d; nearest = { kind: 'circle', circle: el } }
        }
      }
      if (!nearest) {
        setCutPreview(null)
        setCutTarget(null)
      } else if (nearest.kind === 'line') {
        setCutPreview(computeCut(nearest.line, raw, sketchElements))
        setCutTarget(nearest)
      } else {
        if (nearest.kind === 'rect-edge') {
          const c = rectCorners(nearest.rect)
          const probe: SketchLine = {
            type: 'line',
            id: nearest.rect.id,
            start: c[nearest.edgeIndex],
            end: c[(nearest.edgeIndex + 1) % 4],
          }
          setCutPreview(computeCut(probe, raw, sketchElements))
        } else {
          setCutPreview(computeCircleCut(nearest.circle, raw, sketchElements))
        }
        setCutTarget(nearest)
      }
    }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()

    if (activeTool === 'cut') {
      if (cutPreview && cutTarget) {
        let targetId = cutPreview.lineId
        let replacements: SketchElement[] = cutPreview.keeps.map((seg) => {
          if ('start' in seg && 'end' in seg) {
            return {
              type: 'line' as const,
              id: crypto.randomUUID(),
              start: seg.start,
              end: seg.end,
            } satisfies SketchLine
          }
          return { ...seg, id: crypto.randomUUID() } satisfies SketchArc
        })

        if (cutTarget.kind === 'rect-edge') {
          targetId = cutTarget.rect.id
          const c = rectCorners(cutTarget.rect)
          const untouchedSides = [0, 1, 2, 3]
            .filter(i => i !== cutTarget.edgeIndex)
            .map(i => ({
              type: 'line' as const,
              id: crypto.randomUUID(),
              start: c[i],
              end: c[(i + 1) % 4],
            }))
          replacements = [...untouchedSides, ...replacements]
        } else if (cutTarget.kind === 'circle') {
          targetId = cutTarget.circle.id
        }

        cutSketchElement(
          targetId,
          replacements,
        )
        setCutPreview(null)
        setCutTarget(null)
      }
      return
    }

    const pt = getSnapped(e)

    if (startPt === null) {
      setStartPt(pt)
      return
    }

    const id = crypto.randomUUID()
    if (activeTool === 'line') {
      addSketchElement({ type: 'line', id, start: startPt, end: pt } satisfies SketchLine)
    } else if (activeTool === 'rect') {
      addSketchElement({ type: 'rect', id, start: startPt, end: pt } satisfies SketchRect)
    } else if (activeTool === 'circle') {
      const r = Math.hypot(pt.x - startPt.x, pt.y - startPt.y)
      if (r > 0) addSketchElement({ type: 'circle', id, center: startPt, radius: r } satisfies SketchCircle)
    }
    setStartPt(null)
  }

  const preview = startPt !== null && cursorPt !== null

  return (
    <>
      {/* Hit-test plane — only present during draw tools; absent in select mode so camera gets events */}
      {isDrawTool && (
        <mesh rotation={PLANE_ROTATION[plane]} onPointerMove={onMove} onClick={onClick}>
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {/* Elements — clickable in select mode, highlighted when targeted by cut */}
      {sketchElements.map((el) => (
        <SketchEl key={el.id} el={el} plane={plane} highlighted={cutPreview?.lineId === el.id} />
      ))}

      {/* Cut preview — red overlay on the segment to be removed */}
      {activeTool === 'cut' && cutPreview && (
        <Line
          points={[worldPt(cutPreview.cutStart, plane), worldPt(cutPreview.cutEnd, plane)]}
          color="#ff3333"
          lineWidth={4}
        />
      )}

      {/* Cursor & anchor dots (draw tools only, not cut) */}
      {isDrawTool && activeTool !== 'cut' && cursorPt && <Dot pos={worldPt(cursorPt, plane)} color="#ffffff" size={0.05} />}
      {isDrawTool && startPt && <Dot pos={worldPt(startPt, plane)} color="#ffdd44" size={0.08} />}

      {/* Live preview */}
      {preview && activeTool === 'line' && (
        <Line points={linePts(startPt, cursorPt, plane)} color="#ffdd4488" lineWidth={1.5} />
      )}
      {preview && activeTool === 'rect' && (
        <Line points={rectPts(startPt, cursorPt, plane)} color="#ffdd4488" lineWidth={1.5} />
      )}
      {preview && activeTool === 'circle' && (() => {
        const r = Math.hypot(cursorPt.x - startPt.x, cursorPt.y - startPt.y)
        return r > 0
          ? <Line points={circlePts(startPt, r, plane)} color="#ffdd4488" lineWidth={1.5} />
          : null
      })()}
    </>
  )
}
