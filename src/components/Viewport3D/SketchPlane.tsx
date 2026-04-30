import { useState, useEffect, useCallback } from 'react'
import { Line } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import {
  useModelStore,
  SketchPlanePose,
  SketchPoint,
  SketchElement,
  SketchLine,
  SketchRect,
  SketchCircle,
  SketchArc,
  PointRef,
} from '../../store/modelStore'
import {
  worldPt,
  toSketch,
  snapPt,
  linePts,
  rectPts,
  circlePts,
  arcPts,
} from '../../lib/sketchGeometry'
import { planeOriginFromPose } from '../../lib/planePose'
import { distToSeg, distToCircle, distToArc, computeCut, computeCircleCut, computeArcCut, CutResult, CircleCutResult, ArcCutResult } from '../../lib/cutTool'

// ─── dot marker ──────────────────────────────────────────────────────────────

function Dot({ pos, color, size = 0.06, ring = false }: { pos: [number, number, number]; color: string; size?: number; ring?: boolean }) {
  if (ring) {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2
      pts.push([pos[0] + Math.cos(a) * size, pos[1] + Math.sin(a) * size, pos[2]])
    }
    return <Line points={pts} color={color} lineWidth={2} />
  }
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

function SketchEl({ el, plane, highlighted }: { el: SketchElement; plane: SketchPlanePose; highlighted?: boolean }) {
  const { activeTool, selectedElementId, selectElement, selectElement2 } = useModelStore()
  const [hovered, setHovered] = useState(false)

  const isConstruction = !!el.construction
  const isSelected = selectedElementId === el.id
  const baseColor = isConstruction ? '#4488aa' : '#ffdd44'
  const color = highlighted ? '#ff8844' : isSelected ? '#ff8844' : hovered ? '#ffe888' : baseColor
  const width = highlighted || isSelected || hovered ? 3 : 2

  const selectProps = activeTool === 'select'
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.shiftKey) {
            selectElement2(el.id)
          } else {
            selectElement(el.id)
          }
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
      }
    : {}

  // In non-select modes, pointer events must go to the invisible hit-test plane,
  // not to rendered sketch geometry (which would shift e.point off-plane).
  const hitPlanePassthrough = activeTool !== 'select' ? { raycast: noopRaycast } : {}
  const dashProps = isConstruction ? { dashed: true, dashSize: 0.18, gapSize: 0.12 } : {}

  if (el.type === 'line')
    return <Line points={linePts(el.start, el.end, plane)} color={color} lineWidth={width} {...hitPlanePassthrough} {...selectProps} {...dashProps} />
  if (el.type === 'rect')
    return <Line points={rectPts(el.start, el.end, plane)} color={color} lineWidth={width} {...hitPlanePassthrough} {...selectProps} {...dashProps} />
  if (el.type === 'circle')
    return <Line points={circlePts(el.center, el.radius, plane, 64)} color={color} lineWidth={width} {...hitPlanePassthrough} {...selectProps} {...dashProps} />
  if (el.type === 'arc')
    return <Line points={arcPts(el.center, el.radius, el.startAngle, el.endAngle, plane, 64)} color={color} lineWidth={width} {...hitPlanePassthrough} {...selectProps} {...dashProps} />
  return null
}

// ─── draggable point handle ───────────────────────────────────────────────────

function PointHandle({
  pos,
  onDragStart,
}: {
  pos: [number, number, number]
  onDragStart: (e: ThreeEvent<PointerEvent>) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <mesh
      position={pos}
      onPointerDown={onDragStart}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshBasicMaterial color={hovered ? '#ffffff' : '#ffdd44'} depthTest={false} />
    </mesh>
  )
}

// ─── collect element endpoints for snap ──────────────────────────────────────

function elementEndpoints(el: SketchElement): { pt: SketchPoint; ref: PointRef }[] {
  if (el.type === 'line') return [
    { pt: el.start, ref: { elementId: el.id, which: 'start' } },
    { pt: el.end,   ref: { elementId: el.id, which: 'end' } },
  ]
  if (el.type === 'rect') return [
    { pt: el.start, ref: { elementId: el.id, which: 'start' } },
    { pt: el.end,   ref: { elementId: el.id, which: 'end' } },
  ]
  return []
}

const SNAP_ENDPOINT_THRESHOLD = 0.3

// ─── main component ───────────────────────────────────────────────────────────

export function SketchPlane() {
  const {
    activePlane, activeTool, constructionMode, sketchElements, sketchConstraints,
    selectedElementId, selectElement,
    addSketchElement, updateSketchElement, deleteSketchElement, cutSketchElement, exitSketch,
    addSketchConstraint, setIsDraggingPoint,
  } = useModelStore()

  const [startPt, setStartPt] = useState<SketchPoint | null>(null)
  const [cursorPt, setCursorPt] = useState<SketchPoint | null>(null)
  const [snapTarget, setSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef } | null>(null)
  const [cutPreview, setCutPreview] = useState<CutResult | CircleCutResult | ArcCutResult | null>(null)
  const [cutTarget, setCutTarget] = useState<
    | { kind: 'line'; line: SketchLine }
    | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
    | { kind: 'circle'; circle: SketchCircle }
    | { kind: 'arc'; arc: SketchArc }
    | null
  >(null)
  const [dragTarget, setDragTarget] = useState<{ elementId: string; pointType: 'start' | 'end' | 'center' } | null>(null)
  const [dragSnapTarget, setDragSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef } | null>(null)

  useEffect(() => {
    setStartPt(null); setCursorPt(null); setCutPreview(null); setCutTarget(null); setSnapTarget(null)
  }, [activeTool])

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
  const planeOrigin = planeOriginFromPose(plane)
  const isDrawTool = activeTool !== 'select'

  const getRaw = (e: ThreeEvent<PointerEvent | MouseEvent>) => toSketch(e.point, plane)

  // Find nearest endpoint within snap threshold
  const findSnapTarget = (raw: SketchPoint): { pt: SketchPoint; ref: PointRef } | null => {
    let best: { pt: SketchPoint; ref: PointRef; dist: number } | null = null
    for (const el of sketchElements) {
      for (const { pt, ref } of elementEndpoints(el)) {
        const d = Math.hypot(raw.x - pt.x, raw.y - pt.y)
        if (d < SNAP_ENDPOINT_THRESHOLD && (!best || d < best.dist)) {
          best = { pt, ref, dist: d }
        }
      }
    }
    return best ? { pt: best.pt, ref: best.ref } : null
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const raw = getRaw(e)

    // ── drag mode ────────────────────────────────────────────────────────────
    if (dragTarget) {
      const key = dragTarget.pointType
      // Check for snap to another element's endpoint (excluding dragged element)
      let snap: { pt: SketchPoint; ref: PointRef } | null = null
      if (key === 'start' || key === 'end') {
        let bestDist = SNAP_ENDPOINT_THRESHOLD
        for (const el of sketchElements) {
          if (el.id === dragTarget.elementId) continue
          for (const { pt, ref } of elementEndpoints(el)) {
            const d = Math.hypot(raw.x - pt.x, raw.y - pt.y)
            if (d < bestDist) { bestDist = d; snap = { pt, ref } }
          }
        }
      }
      setDragSnapTarget(snap)
      const pt = snap ? snap.pt : snapPt(raw)
      updateSketchElement(dragTarget.elementId, { [key]: pt } as Parameters<typeof updateSketchElement>[1])
      // Propagate to already-coincident partners
      if (key === 'start' || key === 'end') {
        for (const c of sketchConstraints) {
          if (c.type !== 'coincident') continue
          if (c.p1.elementId === dragTarget.elementId && c.p1.which === key) {
            updateSketchElement(c.p2.elementId, { [c.p2.which]: pt } as Parameters<typeof updateSketchElement>[1])
          } else if (c.p2.elementId === dragTarget.elementId && c.p2.which === key) {
            updateSketchElement(c.p1.elementId, { [c.p1.which]: pt } as Parameters<typeof updateSketchElement>[1])
          }
        }
      }
      return
    }

    if (activeTool === 'cut') {
      setCursorPt(snapPt(raw))
      const THRESHOLD = 0.5
      let nearest:
        | { kind: 'line'; line: SketchLine }
        | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
        | { kind: 'circle'; circle: SketchCircle }
        | { kind: 'arc'; arc: SketchArc }
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
        if (el.type === 'arc') {
          const d = distToArc(raw, el)
          if (d < minDist) { minDist = d; nearest = { kind: 'arc', arc: el } }
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
        } else if (nearest.kind === 'circle') {
          setCutPreview(computeCircleCut(nearest.circle, raw, sketchElements))
        } else {
          setCutPreview(computeArcCut(nearest.arc, raw, sketchElements))
        }
        setCutTarget(nearest)
      }
      return
    }

    // Draw tools: check endpoint snap first
    const snap = findSnapTarget(raw)
    if (snap) {
      setSnapTarget(snap)
      setCursorPt(snap.pt)
    } else {
      setSnapTarget(null)
      setCursorPt(snapPt(raw))
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
        } else if (cutTarget.kind === 'arc') {
          targetId = cutTarget.arc.id
        }

        cutSketchElement(targetId, replacements)
        setCutPreview(null)
        setCutTarget(null)
      }
      return
    }

    const pt = snapTarget ? snapTarget.pt : snapPt(getRaw(e))

    if (startPt === null) {
      setStartPt(pt)
      return
    }

    const id = crypto.randomUUID()
    const cFlag = constructionMode ? { construction: true as const } : {}

    if (activeTool === 'line') {
      addSketchElement({ type: 'line', id, start: startPt, end: pt, ...cFlag } satisfies SketchLine)
      // Auto-coincident if end point snapped to existing endpoint
      if (snapTarget) {
        addSketchConstraint({
          id: crypto.randomUUID(),
          type: 'coincident',
          p1: snapTarget.ref,
          p2: { elementId: id, which: 'end' },
        })
      }
    } else if (activeTool === 'rect') {
      // Rect → 4 connected lines with coincident constraints at corners
      const s = startPt, e = pt
      const corners: SketchPoint[] = [
        { x: s.x, y: s.y },
        { x: e.x, y: s.y },
        { x: e.x, y: e.y },
        { x: s.x, y: e.y },
      ]
      const lineIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
      for (let i = 0; i < 4; i++) {
        addSketchElement({
          type: 'line', id: lineIds[i],
          start: corners[i], end: corners[(i + 1) % 4],
          ...cFlag,
        } satisfies SketchLine)
      }
      // Coincident constraints at each shared corner (end[i] = start[i+1])
      for (let i = 0; i < 4; i++) {
        addSketchConstraint({
          id: crypto.randomUUID(), type: 'coincident',
          p1: { elementId: lineIds[i], which: 'end' },
          p2: { elementId: lineIds[(i + 1) % 4], which: 'start' },
        })
      }
    } else if (activeTool === 'circle') {
      const r = Math.hypot(pt.x - startPt.x, pt.y - startPt.y)
      if (r > 0) addSketchElement({ type: 'circle', id, center: startPt, radius: r, ...cFlag } satisfies SketchCircle)
    }

    setStartPt(null)
    setSnapTarget(null)
  }

  const onPointerUp = () => {
    if (dragTarget) {
      // If snapped to another endpoint, add a coincident constraint (unless already linked)
      if (dragSnapTarget && (dragTarget.pointType === 'start' || dragTarget.pointType === 'end')) {
        const p1: PointRef = { elementId: dragTarget.elementId, which: dragTarget.pointType }
        const p2 = dragSnapTarget.ref
        const alreadyLinked = sketchConstraints.some(
          (c) => c.type === 'coincident' && (
            (c.p1.elementId === p1.elementId && c.p1.which === p1.which && c.p2.elementId === p2.elementId && c.p2.which === p2.which) ||
            (c.p2.elementId === p1.elementId && c.p2.which === p1.which && c.p1.elementId === p2.elementId && c.p1.which === p2.which)
          )
        )
        if (!alreadyLinked) {
          addSketchConstraint({ id: crypto.randomUUID(), type: 'coincident', p1, p2 })
        }
      }
      setDragTarget(null)
      setDragSnapTarget(null)
      setIsDraggingPoint(false)
    }
  }

  // In cut mode, prefer pointer-down over click (down+up) which can be flaky if
  // the hovered hit target changes during the gesture.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (activeTool !== 'cut') return
    onClick(e as unknown as ThreeEvent<MouseEvent>)
  }

  const preview = startPt !== null && cursorPt !== null

  return (
    <>
      {/* Hit-test plane — present during draw tools and point dragging */}
      {(isDrawTool || dragTarget) && (
        <mesh
          position={[planeOrigin.x, planeOrigin.y, planeOrigin.z]}
          rotation={plane.rotation}
          onPointerMove={onMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onClick={onClick}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {/* Elements — clickable in select mode, highlighted when targeted by cut */}
      {sketchElements.map((el) => (
        <SketchEl key={el.id} el={el} plane={plane} highlighted={cutPreview?.lineId === el.id} />
      ))}

      {/* Point handles — shown in select mode for dragging endpoints/centers */}
      {activeTool === 'select' && sketchElements.map((el) => {
        const startDrag = (pointType: 'start' | 'end' | 'center') => (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setDragTarget({ elementId: el.id, pointType })
          setIsDraggingPoint(true)
        }
        if (el.type === 'line') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={worldPt(el.start, plane)} onDragStart={startDrag('start')} />
            <PointHandle pos={worldPt(el.end,   plane)} onDragStart={startDrag('end')} />
          </group>
        )
        if (el.type === 'circle') return (
          <PointHandle key={el.id + '_handle'} pos={worldPt(el.center, plane)} onDragStart={startDrag('center')} />
        )
        if (el.type === 'rect') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={worldPt(el.start, plane)} onDragStart={startDrag('start')} />
            <PointHandle pos={worldPt(el.end,   plane)} onDragStart={startDrag('end')} />
          </group>
        )
        return null
      })}

      {/* Cut preview — red overlay of the exact removed geometry */}
      {activeTool === 'cut' && cutPreview && (
        'cutArc' in cutPreview ? (
          <Line
            points={arcPts(
              cutPreview.cutArc.center,
              cutPreview.cutArc.radius,
              cutPreview.cutArc.startAngle,
              cutPreview.cutArc.endAngle,
              plane,
              64,
            )}
            color="#ff3333"
            lineWidth={4}
            raycast={noopRaycast}
          />
        ) : (
          <Line
            points={[worldPt(cutPreview.cutStart, plane), worldPt(cutPreview.cutEnd, plane)]}
            color="#ff3333"
            lineWidth={4}
            raycast={noopRaycast}
          />
        )
      )}

      {/* Endpoint snap ring indicator — green ring when cursor near an existing endpoint */}
      {isDrawTool && activeTool !== 'cut' && snapTarget && (
        <Dot pos={worldPt(snapTarget.pt, plane)} color="#44ff88" size={0.14} ring />
      )}

      {/* Snap ring during point drag */}
      {dragTarget && dragSnapTarget && (
        <Dot pos={worldPt(dragSnapTarget.pt, plane)} color="#44ff88" size={0.14} ring />
      )}

      {/* Cursor dot */}
      {isDrawTool && activeTool !== 'cut' && cursorPt && (
        <Dot pos={worldPt(cursorPt, plane)} color={snapTarget ? '#44ff88' : '#ffffff'} size={0.05} />
      )}
      {/* Anchor dot */}
      {isDrawTool && startPt && <Dot pos={worldPt(startPt, plane)} color="#ffdd44" size={0.08} />}

      {/* Live preview */}
      {preview && activeTool === 'line' && (
        <Line points={linePts(startPt, cursorPt, plane)} color="#ffdd4488" lineWidth={1.5} raycast={noopRaycast} />
      )}
      {preview && activeTool === 'rect' && (
        <Line points={rectPts(startPt, cursorPt, plane)} color="#ffdd4488" lineWidth={1.5} raycast={noopRaycast} />
      )}
      {preview && activeTool === 'circle' && (() => {
        const r = Math.hypot(cursorPt.x - startPt.x, cursorPt.y - startPt.y)
        return r > 0
          ? <Line points={circlePts(startPt, r, plane, 64)} color="#ffdd4488" lineWidth={1.5} raycast={noopRaycast} />
          : null
      })()}
    </>
  )
}
