import { useState, useEffect, useCallback, useMemo } from 'react'
import { DoubleSide, Plane as ThreePlane, Vector3 } from 'three'
import { Line, Text } from '@react-three/drei'
import { ThreeEvent, useThree } from '@react-three/fiber'
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
import { findSnapTarget, rectCorners } from '../../lib/sketchInteraction'
import { planeOriginFromPose, planeNormalFromPose } from '../../lib/planePose'
import { PLANE_SIZE } from '../../lib/units'
import { distToSeg, distToCircle, distToArc, computeCut, computeCircleCut, computeArcCut, CutResult, CircleCutResult, ArcCutResult } from '../../lib/cutTool'
import { solveConstraints } from '../../lib/constraintSolve'

const HIT_PLANE_SIZE = PLANE_SIZE * 4
const SNAP_ENDPOINT_SCREEN = 24
const SNAP_OBJECT_SCREEN = 36
const SNAP_TANGENT_SCREEN = 72
const SNAP_RING_SCREEN = 18
const SNAP_DOT_SCREEN = 10
const SNAP_MIN_WORLD = 0.08
const DOT_MIN_WORLD = 0.04

// ─── dot marker ──────────────────────────────────────────────────────────────

function Dot({ pos, color, screenSize, size = 0.06, ring = false }: { pos: [number, number, number]; color: string; screenSize?: number; size?: number; ring?: boolean }) {
  const { camera, size: viewSize } = useThree()
  // compute world size so the dot appears approximately `screenSize` CSS pixels on screen
  let worldSize = size
  if (screenSize) {
    const p = new Vector3(pos[0], pos[1], pos[2])
    const dir = new Vector3()
    camera.getWorldDirection(dir)
    const distance = Math.abs(dir.dot(p.sub(camera.position))) || 1
    const fov = 'fov' in camera ? camera.fov * Math.PI / 180 : 50 * Math.PI / 180
    const worldPerPixel = 2 * distance * Math.tan(fov / 2) / viewSize.height
    worldSize = Math.max(worldPerPixel * screenSize, DOT_MIN_WORLD)
  }
  if (ring) {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2
      pts.push([pos[0] + Math.cos(a) * worldSize, pos[1] + Math.sin(a) * worldSize, pos[2]])
    }
    return <Line points={pts} color={color} lineWidth={2} />
  }
  return (
    <mesh position={pos}>
      <sphereGeometry args={[worldSize, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

// ─── single element renderer (with hover/select) ──────────────────────────────

/** Let the invisible sketch plane receive hits in cut mode (Line2 otherwise wins the raycast). */
const noopRaycast: () => void = () => {}

function SketchEl({ el, plane, highlighted }: { el: SketchElement; plane: SketchPlanePose; highlighted?: boolean }) {
  const { activeTool, selectedElementIds, highlightElementIds, selectElement, toggleElementSelection } = useModelStore()
  const [hovered, setHovered] = useState(false)

  const isConstruction = !!el.construction
  const isSelected = selectedElementIds.includes(el.id)
  const isNavHighlighted = highlightElementIds.includes(el.id)
  const baseColor = isConstruction ? '#4488aa' : '#ffdd44'
  const color = highlighted ? '#ff8844' : isNavHighlighted ? '#ff44ff' : isSelected ? '#ff8844' : hovered ? '#ffe888' : baseColor
  const width = highlighted || isNavHighlighted || isSelected || hovered ? 3 : 2

  const selectProps = activeTool === 'select'
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.shiftKey) {
            toggleElementSelection(el.id)
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
  onDragMove,
  onDragEnd,
  highlighted,
}: {
  pos: [number, number, number]
  onDragStart: (e: ThreeEvent<PointerEvent>) => void
  onDragMove?: (e: ThreeEvent<PointerEvent>) => void
  onDragEnd?: (e: ThreeEvent<PointerEvent>) => void
  highlighted?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <mesh
      position={pos}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.currentTarget as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(e.pointerId)
        onDragStart(e)
      }}
      onPointerMove={(e) => {
        if (onDragMove) {
          e.stopPropagation()
          onDragMove(e)
        }
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.currentTarget as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId)
        onDragEnd?.(e)
      }}
      onPointerCancel={(e) => {
        e.stopPropagation()
        ;(e.currentTarget as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId)
        onDragEnd?.(e)
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshBasicMaterial color={hovered ? '#ffffff' : highlighted ? '#88ff88' : '#ffdd44'} depthTest={false} />
    </mesh>
  )
}

// ─── collect element endpoints for snap ──────────────────────────────────────



// ─── main component ───────────────────────────────────────────────────────────

export function SketchPlane() {
  const {
    activePlane, activeTool, constructionMode, snapToGrid, snapToOtherPlanes, snapToObjects,
    sketchElements, sketchConstraints, sketches, editingSketchId,
    selectedElementIds, selectElement, selectElements,
    addSketchElement, updateSketchElement, deleteSketchElement, cutSketchElement, exitSketch,
    addSketchConstraint, setIsDraggingPoint, highlightElementIds, setHighlightElementIds,
  } = useModelStore()

  const [startPt, setStartPt] = useState<SketchPoint | null>(null)
  const [cursorPt, setCursorPt] = useState<SketchPoint | null>(null)
  const [snapTarget, setSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef | null; constraintHint?: string; tangentCircleId?: string } | null>(null)
  const [cutPreview, setCutPreview] = useState<CutResult | CircleCutResult | ArcCutResult | null>(null)
  const [cutTarget, setCutTarget] = useState<
    | { kind: 'line'; line: SketchLine }
    | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
    | { kind: 'circle'; circle: SketchCircle }
    | { kind: 'arc'; arc: SketchArc }
    | null
  >(null)
  const [dragTarget, setDragTarget] = useState<{ elementId: string; pointType: 'start' | 'end' | 'center' } | null>(null)
  const [dragSnapTarget, setDragSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef | null; constraintHint?: string; tangentCircleId?: string } | null>(null)
  const [startSnapRef, setStartSnapRef] = useState<PointRef | null>(null)
  // Drag-box selection state (sketch-local coordinates)
  const [selectBoxStart, setSelectBoxStart] = useState<SketchPoint | null>(null)
  const [selectBoxEnd, setSelectBoxEnd] = useState<SketchPoint | null>(null)

  useEffect(() => {
    setStartPt(null); setCursorPt(null); setCutPreview(null); setCutTarget(null); setSnapTarget(null); setStartSnapRef(null)
  }, [activeTool])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        if (startPt) setStartPt(null)
        else if (selectedElementIds.length > 0) selectElement(null)
        else exitSketch()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
        // Delete all selected elements one by one
        for (const id of selectedElementIds) deleteSketchElement(id)
      }
    },
    [startPt, selectedElementIds, exitSketch, selectElement, deleteSketchElement],
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!activePlane) return null
  const plane = activePlane
  const planeOrigin = planeOriginFromPose(plane)
  const planeNormal = planeNormalFromPose(plane)
  const isDrawTool = activeTool !== 'select'
  const { camera, size } = useThree()

  const cameraDistance = useMemo(() => {
    const origin = new Vector3(planeOrigin.x, planeOrigin.y, planeOrigin.z)
    const direction = new Vector3()
    camera.getWorldDirection(direction)
    return Math.abs(direction.dot(origin.sub(camera.position))) || 1
  }, [camera, planeOrigin])

  const worldPerPixel = useMemo(() => {
    const fov = 'fov' in camera ? camera.fov * Math.PI / 180 : 50 * Math.PI / 180
    return 2 * cameraDistance * Math.tan(fov / 2) / size.height
  }, [camera, cameraDistance, size.height])

  const getHandlePoint = (p: SketchPoint): [number, number, number] => {
    const [x, y, z] = worldPt(p, plane)
    return [x + planeNormal.x * 0.01, y + planeNormal.y * 0.01, z + planeNormal.z * 0.01]
  }

  const snapEndpointThreshold = Math.max(worldPerPixel * SNAP_ENDPOINT_SCREEN, SNAP_MIN_WORLD)
  const snapObjectThreshold = Math.max(worldPerPixel * SNAP_OBJECT_SCREEN, SNAP_MIN_WORLD)
  const snapTangentThreshold = Math.max(worldPerPixel * SNAP_TANGENT_SCREEN, SNAP_MIN_WORLD)

  const getRaw = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const plane3 = new ThreePlane().setFromNormalAndCoplanarPoint(
      planeNormalFromPose(plane),
      planeOrigin,
    )
    const world = new Vector3()
    return e.ray.intersectPlane(plane3, world)
      ? toSketch(world, plane)
      : toSketch(e.point, plane)
  }
  const doSnap = (p: SketchPoint) => snapToGrid ? snapPt(p) : p

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const raw = getRaw(e)

    // ── select drag-box mode ──────────────────────────────────────────────────
    if (selectBoxStart) {
      setSelectBoxEnd(raw)
      return
    }

    // In select mode, highlight any nearby endpoint to indicate readiness to drag
    if (activeTool === 'select' && !dragTarget && !selectBoxStart) {
      const hoverSnap = findSnapTarget(
        raw,
        sketchElements,
        sketches,
        editingSketchId,
        plane,
        activeTool,
        snapToObjects,
        snapToOtherPlanes,
        snapEndpointThreshold,
        snapObjectThreshold,
        snapTangentThreshold,
        null,
        null,
      )
      if (hoverSnap && hoverSnap.ref) setHighlightElementIds([hoverSnap.ref.elementId])
      else setHighlightElementIds([])
    }

    // ── drag mode ────────────────────────────────────────────────────────────
    if (dragTarget) {
      const snap = findSnapTarget(
        raw,
        sketchElements,
        sketches,
        editingSketchId,
        plane,
        activeTool,
        snapToObjects,
        snapToOtherPlanes,
        snapEndpointThreshold,
        snapObjectThreshold,
        snapTangentThreshold,
        null,
        dragTarget.elementId,
      )
      setDragSnapTarget(snap)
      const pt = snap ? snap.pt : doSnap(raw)

      let updated = sketchElements.map((el) =>
        el.id === dragTarget.elementId
          ? { ...el, [dragTarget.pointType]: pt } as SketchElement
          : el
      )

      const fixedPoints = new Set<string>([`${dragTarget.elementId}:${dragTarget.pointType}`])
      updated = solveConstraints(updated, sketchConstraints, fixedPoints)

      for (const newEl of updated) {
        updateSketchElement(newEl.id, newEl as Parameters<typeof updateSketchElement>[1])
      }
      return
    }

    if (activeTool === 'cut') {
      setCursorPt(doSnap(raw))
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
    const snap = findSnapTarget(
      raw,
      sketchElements,
      sketches,
      editingSketchId,
      plane,
      activeTool,
      snapToObjects,
      snapToOtherPlanes,
      snapEndpointThreshold,
      snapObjectThreshold,
      snapTangentThreshold,
      startPt,
      null,
    )
    if (snap) {
      setSnapTarget(snap)
      setCursorPt(snap.pt)
    } else {
      setSnapTarget(null)
      setCursorPt(doSnap(raw))
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

    const pt = snapTarget ? snapTarget.pt : doSnap(getRaw(e))

    if (startPt === null) {
      setStartPt(pt)
      setStartSnapRef(snapTarget ? snapTarget.ref : null)
      return
    }

    const id = crypto.randomUUID()
    const cFlag = constructionMode ? { construction: true as const } : {}

    if (activeTool === 'line') {
      addSketchElement({ type: 'line', id, start: startPt, end: pt, ...cFlag } satisfies SketchLine)
      // Auto-coincident for start point if it snapped (same-plane only)
      if (startSnapRef) {
        addSketchConstraint({
          id: crypto.randomUUID(), type: 'coincident',
          p1: startSnapRef,
          p2: { elementId: id, which: 'start' },
        })
      }
      // Auto-coincident for end point if it snapped (same-plane only)
      if (snapTarget?.tangentCircleId && activeTool === 'line') {
        addSketchConstraint({
          id: crypto.randomUUID(), type: 'tangent',
          elementId1: id,
          elementId2: snapTarget.tangentCircleId,
        })
      } else if (snapTarget?.ref) {
        addSketchConstraint({
          id: crypto.randomUUID(), type: 'coincident',
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
    setStartSnapRef(null)
    setSnapTarget(null)
  }

  const onPointerUp = () => {
    if (dragTarget) {
      if (dragSnapTarget?.ref) {
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
          <planeGeometry args={[HIT_PLANE_SIZE, HIT_PLANE_SIZE]} />
          <meshBasicMaterial visible={false} side={DoubleSide} />
        </mesh>
      )}

      {/* Background click plane — select mode only, clears highlight/selection on empty-space click or starts drag-box */}
      {!isDrawTool && !dragTarget && (
        <mesh
          position={[planeOrigin.x, planeOrigin.y, planeOrigin.z]}
          rotation={plane.rotation}
          onPointerDown={(e) => {
            // Only left-button, not on an element
            if (e.button !== 0) return
            e.stopPropagation()
            const raw = toSketch(e.point, plane)
            setSelectBoxStart(raw)
            setSelectBoxEnd(raw)
          }}
          onPointerMove={onMove}
          onPointerUp={(e) => {
            e.stopPropagation()
            if (selectBoxStart && selectBoxEnd) {
              const minX = Math.min(selectBoxStart.x, selectBoxEnd.x)
              const maxX = Math.max(selectBoxStart.x, selectBoxEnd.x)
              const minY = Math.min(selectBoxStart.y, selectBoxEnd.y)
              const maxY = Math.max(selectBoxStart.y, selectBoxEnd.y)
              const boxSize = Math.hypot(maxX - minX, maxY - minY)
              if (boxSize > 0.15) {
                // Select elements whose bounding box overlaps the drag rect
                const hit = sketchElements.filter((el) => {
                  if (el.type === 'line') {
                    return Math.max(el.start.x, el.end.x) >= minX && Math.min(el.start.x, el.end.x) <= maxX &&
                           Math.max(el.start.y, el.end.y) >= minY && Math.min(el.start.y, el.end.y) <= maxY
                  }
                  if (el.type === 'rect') {
                    const ex = [el.start.x, el.end.x], ey = [el.start.y, el.end.y]
                    return Math.max(...ex) >= minX && Math.min(...ex) <= maxX &&
                           Math.max(...ey) >= minY && Math.min(...ey) <= maxY
                  }
                  if (el.type === 'circle' || el.type === 'arc') {
                    return el.center.x + el.radius >= minX && el.center.x - el.radius <= maxX &&
                           el.center.y + el.radius >= minY && el.center.y - el.radius <= maxY
                  }
                  return false
                })
                selectElements(hit.map((el) => el.id))
              } else {
                // Tiny box = plain click on empty space → deselect
                selectElement(null)
                setHighlightElementIds([])
              }
            }
            setSelectBoxStart(null)
            setSelectBoxEnd(null)
          }}
          onClick={(e) => { e.stopPropagation() }}
          renderOrder={-1}
        >
          <planeGeometry args={[HIT_PLANE_SIZE, HIT_PLANE_SIZE]} />
          <meshBasicMaterial visible={false} side={DoubleSide} />
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
          selectElement(el.id)
          setDragTarget({ elementId: el.id, pointType })
          setIsDraggingPoint(true)
        }
        if (el.type === 'line') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={getHandlePoint(el.start)} onDragStart={startDrag('start')} onDragMove={onMove} onDragEnd={onPointerUp} highlighted={highlightElementIds.includes(el.id)} />
            <PointHandle pos={getHandlePoint(el.end)} onDragStart={startDrag('end')} onDragMove={onMove} onDragEnd={onPointerUp} highlighted={highlightElementIds.includes(el.id)} />
          </group>
        )
        if (el.type === 'circle') return (
          <PointHandle key={el.id + '_handle'} pos={getHandlePoint(el.center)} onDragStart={startDrag('center')} onDragMove={onMove} onDragEnd={onPointerUp} highlighted={highlightElementIds.includes(el.id)} />
        )
        if (el.type === 'rect') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={getHandlePoint(el.start)} onDragStart={startDrag('start')} onDragMove={onMove} onDragEnd={onPointerUp} highlighted={highlightElementIds.includes(el.id)} />
            <PointHandle pos={getHandlePoint(el.end)} onDragStart={startDrag('end')} onDragMove={onMove} onDragEnd={onPointerUp} highlighted={highlightElementIds.includes(el.id)} />
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
      {isDrawTool && activeTool !== 'cut' && snapTarget && (() => {
        const world = worldPt(snapTarget.pt, plane)
        return (
          <>
              <Dot pos={world} color="#44ff88" screenSize={SNAP_RING_SCREEN} ring />
            {snapTarget.constraintHint && (
              <Text
                position={[world[0] + 0.2, world[1] + 0.2, world[2]]}
                fontSize={0.12}
                color="#88ff88"
                anchorX="left"
                anchorY="bottom"
              >
                {snapTarget.constraintHint}
              </Text>
            )}
          </>
        )
      })()}

      {/* Snap ring during point drag */}
      {dragTarget && dragSnapTarget && (() => {
        const world = worldPt(dragSnapTarget.pt, plane)
        return (
          <>
            <Dot pos={world} color="#44ff88" screenSize={SNAP_RING_SCREEN} ring />
            {dragSnapTarget.constraintHint && (
              <Text
                position={[world[0] + 0.2, world[1] + 0.2, world[2]]}
                fontSize={0.12}
                color="#88ff88"
                anchorX="left"
                anchorY="bottom"
              >
                {dragSnapTarget.constraintHint}
              </Text>
            )}
          </>
        )
      })()}

      {/* Cursor dot */}
      {isDrawTool && activeTool !== 'cut' && cursorPt && (
        <Dot pos={worldPt(cursorPt, plane)} color={snapTarget ? '#44ff88' : '#ffffff'} screenSize={SNAP_DOT_SCREEN} />
      )}
      {/* Anchor dot */}
      {isDrawTool && startPt && <Dot pos={worldPt(startPt, plane)} color="#ffdd44" screenSize={8} />}

      {/* Drag-box selection rectangle */}
      {selectBoxStart && selectBoxEnd && (() => {
        const s = selectBoxStart, e = selectBoxEnd
        const corners: SketchPoint[] = [
          { x: s.x, y: s.y }, { x: e.x, y: s.y },
          { x: e.x, y: e.y }, { x: s.x, y: e.y }, { x: s.x, y: s.y },
        ]
        return (
          <Line
            points={corners.map((p) => worldPt(p, plane))}
            color="#44aaff"
            lineWidth={1.5}
            raycast={noopRaycast}
          />
        )
      })()}

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
