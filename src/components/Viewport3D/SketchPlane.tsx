import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
  SketchConstraint,
  CoincidentConstraint,
  TangentConstraint,
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
  closestPointOnCircle,
  angleInArc,
} from '../../lib/sketchGeometry'
import {
  findSnapTarget,
  rectCorners,
  elementEndpoints,
  nearestSelectablePoint,
  constraintClusterIds,
  dragSnapConflictsWithConstraints,
  constrainDragPosition,
} from '../../lib/sketchInteraction'
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

type CoincidenceTarget =
  | { kind: 'point'; pt: SketchPoint; ref: PointRef }
  | { kind: 'line'; pt: SketchPoint; lineId: string }
  | { kind: 'circle'; pt: SketchPoint; circleId: string }
  | { kind: 'axis'; pt: SketchPoint; axis: 'x' | 'y' }
  | { kind: 'origin'; pt: SketchPoint }

// ─── dot marker ──────────────────────────────────────────────────────────────

function Dot({ pos, color, screenSize, size = 0.06, ring = false }: { pos: [number, number, number]; color: string; screenSize?: number; size?: number; ring?: boolean }) {
  const { camera, size: viewSize } = useThree()
  // compute world size so the dot appears approximately `screenSize` CSS pixels on screen
  let worldSize = size
  if (screenSize) {
    const p = new Vector3(pos[0], pos[1], pos[2])
    // Use Euclidean distance so dot size remains constant regardless of view angle
    const distance = camera.position.distanceTo(p) || 1
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

  function SketchEl({ el, plane, highlighted, onPointerMove, pointPickRadius, suppressElementClick }: { el: SketchElement; plane: SketchPlanePose; highlighted?: boolean; onPointerMove?: (e: ThreeEvent<PointerEvent>) => void; pointPickRadius?: number; suppressElementClick?: () => boolean }) {
  const { activeTool, selectedElementIds, selectedPointRefs, highlightElementIds, selectElement, selectPoint, togglePointSelection, toggleElementSelection, showElementNames, addSketchConstraint, applyConstraints } = useModelStore(useShallow((state) => ({
    activeTool: state.activeTool, selectedElementIds: state.selectedElementIds,
    selectedPointRefs: state.selectedPointRefs,
    highlightElementIds: state.highlightElementIds, selectElement: state.selectElement,
    selectPoint: state.selectPoint, togglePointSelection: state.togglePointSelection,
    toggleElementSelection: state.toggleElementSelection, showElementNames: state.showElementNames,
    addSketchConstraint: state.addSketchConstraint, applyConstraints: state.applyConstraints,
  })))
  const [hovered, setHovered] = useState(false)

  const isConstruction = !!el.construction
  const isPointPicked = selectedPointRefs.some((p) => p.elementId === el.id)
  const isSelected = selectedElementIds.includes(el.id) && !isPointPicked
  const isNavHighlighted = highlightElementIds.includes(el.id)
  const baseColor = isConstruction ? '#4488aa' : '#ffdd44'
  const color = highlighted ? '#ff8844' : isNavHighlighted ? '#ff44ff' : isSelected ? '#ff8844' : hovered ? '#ffe888' : baseColor
  const width = highlighted || isNavHighlighted || isSelected || hovered ? 3 : 2

  const selectProps = activeTool === 'select'
    ? {
        // Stop pointerdown/up here too, not just click — otherwise, since this
        // element registers no pointerdown/up handlers of its own, both events
        // fall through to the background plane behind it, which treats the
        // gesture as a click on empty space and clears selectedElementIds
        // *before* the click handler below runs, breaking shift-click multi-select.
        onPointerDown: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation() },
        onPointerUp: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation() },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (suppressElementClick?.()) return
          const raw = toSketch(e.point, plane)
          const nearPoint = pointPickRadius != null ? nearestSelectablePoint(raw, el, pointPickRadius) : null
          const shift = !!(e.shiftKey || e.nativeEvent.shiftKey)
          if (nearPoint) {
            if (shift) togglePointSelection(nearPoint.ref)
            else selectPoint(nearPoint.ref)
            return
          }

          // If shift-clicking to select a second element, and the pair is (line, circle),
          // auto-add a tangent constraint and select the element.
          if (shift) {
            const currentlySelected = selectedElementIds ?? []
            const pickingPointOnCurve = selectedPointRefs.length > 0
            // If exactly one other element is selected and it's not this one
            if (!pickingPointOnCurve && currentlySelected.length === 1 && currentlySelected[0] !== el.id) {
              const otherId = currentlySelected[0]
              // Find the other element from global sketch elements via the store
              const otherEl = (useModelStore.getState().sketchElements as SketchElement[]).find((s) => s.id === otherId)
              if (otherEl) {
                const isLineCirclePair = (otherEl.type === 'line' && el.type === 'circle') || (otherEl.type === 'circle' && el.type === 'line')
                if (isLineCirclePair) {
                  // Select the second element
                  toggleElementSelection(el.id)
                  // Determine ids for tangent constraint
                  const lineId = otherEl.type === 'line' ? otherEl.id : el.type === 'line' ? el.id : undefined
                  const circleId = otherEl.type === 'circle' ? otherEl.id : el.type === 'circle' ? el.id : undefined
                  if (lineId && circleId) {
                    const tc = { id: crypto.randomUUID(), type: 'tangent' as const, elementId1: lineId, elementId2: circleId }
                    addSketchConstraint(tc)
                    // Apply solver so geometry updates immediately
                    applyConstraints()
                  }
                  return
                }
              }
            }
            // Fallback: normal toggle selection
            toggleElementSelection(el.id)
            return
          }

          selectElement(el.id)
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
        onPointerMove: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPointerMove?.(e) },
      }
    : {}

  // In non-select modes, pointer events must go to the invisible hit-test plane,
  // not to rendered sketch geometry (which would shift e.point off-plane).
  const visibleLineProps = { raycast: noopRaycast }
  const dashProps = isConstruction ? { dashed: true, dashSize: 0.18, gapSize: 0.12 } : {}

  // Render geometry and optional name label
  let shape: JSX.Element | null = null
  let labelPos: [number, number, number] | null = null
  if (el.type === 'line') {
    const points = linePts(el.start, el.end, plane)
    shape = <>
      {activeTool === 'select' && <Line points={points} color="#ffffff" lineWidth={16} transparent opacity={0} depthWrite={false} {...selectProps} />}
      <Line points={points} color={color} lineWidth={width} {...visibleLineProps} {...dashProps} />
    </>
    const mid = { x: (el.start.x + el.end.x) / 2, y: (el.start.y + el.end.y) / 2 }
    labelPos = worldPt(mid, plane)
  } else if (el.type === 'rect') {
    const points = rectPts(el.start, el.end, plane)
    shape = <>
      {activeTool === 'select' && <Line points={points} color="#ffffff" lineWidth={16} transparent opacity={0} depthWrite={false} {...selectProps} />}
      <Line points={points} color={color} lineWidth={width} {...visibleLineProps} {...dashProps} />
    </>
    const mid = { x: (el.start.x + el.end.x) / 2, y: (el.start.y + el.end.y) / 2 }
    labelPos = worldPt(mid, plane)
  } else if (el.type === 'circle') {
    const points = circlePts(el.center, el.radius, plane, 64)
    shape = <>
      {activeTool === 'select' && <Line points={points} color="#ffffff" lineWidth={16} transparent opacity={0} depthWrite={false} {...selectProps} />}
      <Line points={points} color={color} lineWidth={width} {...visibleLineProps} {...dashProps} />
    </>
    labelPos = worldPt(el.center, plane)
  } else if (el.type === 'arc') {
    const points = arcPts(el.center, el.radius, el.startAngle, el.endAngle, plane, 64)
    shape = <>
      {activeTool === 'select' && <Line points={points} color="#ffffff" lineWidth={16} transparent opacity={0} depthWrite={false} {...selectProps} />}
      <Line points={points} color={color} lineWidth={width} {...visibleLineProps} {...dashProps} />
    </>
    labelPos = worldPt(el.center, plane)
  }

  return (
    <>
      {shape}
      {showElementNames && labelPos && (
        <Text position={labelPos} fontSize={0.06} color="#ffffff" anchorX="center" anchorY="middle">
          {el.name ?? el.id}
        </Text>
      )}
    </>
  )
}

// ─── draggable point handle ───────────────────────────────────────────────────

function PointHandle({
  pos,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  onPress,
  highlighted,
  selected,
}: {
  pos: [number, number, number]
  onDragStart: (e: ThreeEvent<PointerEvent>) => void
  onDragMove?: (e: ThreeEvent<PointerEvent>) => void
  onDragEnd?: (e: ThreeEvent<PointerEvent>) => void
  onClick?: (e: ThreeEvent<PointerEvent>) => void
  onPress?: (e: ThreeEvent<PointerEvent>) => void
  highlighted?: boolean
  selected?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const dragging = useRef(false)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const { camera, size: viewSize } = useThree()
  const HANDLE_SCREEN = 22
  const DRAG_PX = 5
  const p = new Vector3(pos[0], pos[1], pos[2])
  const distance = camera.position.distanceTo(p) || 1
  const fov = 'fov' in camera ? camera.fov * Math.PI / 180 : 50 * Math.PI / 180
  const worldPerPixel = 2 * distance * Math.tan(fov / 2) / viewSize.height
  const worldSize = Math.max(worldPerPixel * HANDLE_SCREEN, DOT_MIN_WORLD)
  const color = hovered ? '#ffffff' : selected ? '#66ddff' : highlighted ? '#88ff88' : '#ffdd44'
  return (
    <mesh
      position={pos}
      scale={[worldSize, worldSize, worldSize]}
      renderOrder={50}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        dragging.current = false
        downPos.current = { x: e.clientX, y: e.clientY }
        onPress?.(e)
        ;(e.currentTarget as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!downPos.current) return
        e.stopPropagation()
        if (!dragging.current) {
          const dx = e.clientX - downPos.current.x
          const dy = e.clientY - downPos.current.y
          if (Math.hypot(dx, dy) < DRAG_PX) return
          dragging.current = true
          onDragStart(e)
        }
        onDragMove?.(e)
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.currentTarget as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId)
        const wasDragging = dragging.current
        dragging.current = false
        downPos.current = null
        if (wasDragging) onDragEnd?.(e)
        else onClick?.(e)
      }}
      onPointerCancel={(e) => {
        e.stopPropagation()
        ;(e.currentTarget as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId)
        const wasDragging = dragging.current
        dragging.current = false
        downPos.current = null
        if (wasDragging) onDragEnd?.(e)
      }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

// ─── collect element endpoints for snap ──────────────────────────────────────



// ─── main component ───────────────────────────────────────────────────────────

export function SketchPlane() {
  const {
    activePlane, activeTool, constructionMode, snapToGrid, snapToOtherPlanes, snapToObjects,
    sketchElements, sketchConstraints, sketches, editingSketchId,
    selectedElementIds, selectedPointRefs, selectElement, selectElements, selectPoint, togglePointSelection,
    addSketchElement, updateSketchElement, replaceSketchElements, deleteSketchElement, cutSketchElement, exitSketch,
    addSketchConstraint, addSketchConstraintsBatch, setIsDraggingPoint, highlightElementIds, setHighlightElementIds,
  } = useModelStore(useShallow((state) => ({
    activePlane: state.activePlane, activeTool: state.activeTool,
    constructionMode: state.constructionMode, snapToGrid: state.snapToGrid,
    snapToOtherPlanes: state.snapToOtherPlanes, snapToObjects: state.snapToObjects,
    sketchElements: state.sketchElements, sketchConstraints: state.sketchConstraints,
    sketches: state.sketches, editingSketchId: state.editingSketchId,
    selectedElementIds: state.selectedElementIds, selectedPointRefs: state.selectedPointRefs,
    selectElement: state.selectElement, selectPoint: state.selectPoint, togglePointSelection: state.togglePointSelection,
    selectElements: state.selectElements, addSketchElement: state.addSketchElement,
    updateSketchElement: state.updateSketchElement, replaceSketchElements: state.replaceSketchElements,
    deleteSketchElement: state.deleteSketchElement,
    cutSketchElement: state.cutSketchElement, exitSketch: state.exitSketch,
    addSketchConstraint: state.addSketchConstraint,
    addSketchConstraintsBatch: state.addSketchConstraintsBatch,
    setIsDraggingPoint: state.setIsDraggingPoint, highlightElementIds: state.highlightElementIds,
    setHighlightElementIds: state.setHighlightElementIds,
  })))

  const [startPt, setStartPt] = useState<SketchPoint | null>(null)
  const [cursorPt, setCursorPt] = useState<SketchPoint | null>(null)
  const [snapTarget, setSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef | null; constraintHint?: string; tangentCircleId?: string; circleId?: string } | null>(null)
  const [cutPreview, setCutPreview] = useState<CutResult | CircleCutResult | ArcCutResult | null>(null)
  const [cutTarget, setCutTarget] = useState<
    | { kind: 'line'; line: SketchLine }
    | { kind: 'rect-edge'; rect: SketchRect; edgeIndex: number }
    | { kind: 'circle'; circle: SketchCircle }
    | { kind: 'arc'; arc: SketchArc }
    | null
  >(null)
  const [dragTarget, setDragTarget] = useState<{ elementId: string; pointType: 'start' | 'end' | 'center' } | null>(null)
  const [dragSnapTarget, setDragSnapTarget] = useState<{ pt: SketchPoint; ref: PointRef | null; constraintHint?: string; tangentCircleId?: string; circleId?: string } | null>(null)
  
  const [startSnapRef, setStartSnapRef] = useState<PointRef | null>(null)
  const [startCircleId, setStartCircleId] = useState<string | null>(null)
  const [coincidenceSource, setCoincidenceSource] = useState<{ pt: SketchPoint; ref: PointRef } | null>(null)
  // Drag-box selection state (sketch-local coordinates)
  const [selectBoxStart, setSelectBoxStart] = useState<SketchPoint | null>(null)
  const [selectBoxEnd, setSelectBoxEnd] = useState<SketchPoint | null>(null)
  const handleConsumedClick = useRef(false)

  useEffect(() => {
    setStartPt(null); setCursorPt(null); setCutPreview(null); setCutTarget(null); setSnapTarget(null); setStartSnapRef(null); setStartCircleId(null); setCoincidenceSource(null)
  }, [activeTool])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        if (startPt) {
          setStartPt(null)
          setStartSnapRef(null)
          setStartCircleId(null)
        }
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

  const coincidenceTargetAt = (raw: SketchPoint, source: PointRef | null): CoincidenceTarget | null => {
    const candidates: Array<CoincidenceTarget & { distance: number }> = []
    const addPoint = (pt: SketchPoint, ref: PointRef) => {
      if (source && ref.elementId === source.elementId && ref.which === source.which) return
      const distance = Math.hypot(raw.x - pt.x, raw.y - pt.y)
      if (distance < snapObjectThreshold) candidates.push({ kind: 'point', pt, ref, distance })
    }

    for (const el of sketchElements) {
      if (el.type === 'line' || el.type === 'rect') {
        addPoint(el.start, { elementId: el.id, which: 'start' })
        addPoint(el.end, { elementId: el.id, which: 'end' })
      } else if (el.type === 'circle') {
        addPoint(el.center, { elementId: el.id, which: 'center' })
      } else if (el.type === 'arc') {
        addPoint(el.center, { elementId: el.id, which: 'center' })
        addPoint({ x: el.center.x + Math.cos(el.startAngle) * el.radius, y: el.center.y + Math.sin(el.startAngle) * el.radius }, { elementId: el.id, which: 'start' })
        addPoint({ x: el.center.x + Math.cos(el.endAngle) * el.radius, y: el.center.y + Math.sin(el.endAngle) * el.radius }, { elementId: el.id, which: 'end' })
      }

      if (source && el.type === 'line' && el.id !== source.elementId) {
        const dx = el.end.x - el.start.x
        const dy = el.end.y - el.start.y
        const denom = dx * dx + dy * dy
        if (denom > 1e-9) {
          const t = Math.max(0, Math.min(1, ((raw.x - el.start.x) * dx + (raw.y - el.start.y) * dy) / denom))
          const pt = { x: el.start.x + t * dx, y: el.start.y + t * dy }
          const distance = Math.hypot(raw.x - pt.x, raw.y - pt.y)
          if (distance < snapObjectThreshold) candidates.push({ kind: 'line', pt, lineId: el.id, distance })
        }
      }
      if (source && (el.type === 'circle' || el.type === 'arc') && el.id !== source.elementId) {
        const pt = closestPointOnCircle(raw, el.center, el.radius)
        if (el.type === 'arc') {
          const ang = Math.atan2(pt.y - el.center.y, pt.x - el.center.x)
          if (!angleInArc(ang, el.startAngle, el.endAngle)) continue
        }
        const distance = Math.hypot(raw.x - pt.x, raw.y - pt.y)
        if (distance < snapObjectThreshold) candidates.push({ kind: 'circle', pt, circleId: el.id, distance })
      }
    }

    if (source) {
      const originDistance = Math.hypot(raw.x, raw.y)
      if (originDistance < snapObjectThreshold) candidates.push({ kind: 'origin', pt: { x: 0, y: 0 }, distance: originDistance })
      if (Math.abs(raw.y) < snapObjectThreshold) candidates.push({ kind: 'axis', axis: 'x', pt: { x: raw.x, y: 0 }, distance: Math.abs(raw.y) })
      if (Math.abs(raw.x) < snapObjectThreshold) candidates.push({ kind: 'axis', axis: 'y', pt: { x: 0, y: raw.y }, distance: Math.abs(raw.x) })
    }

    candidates.sort((a, b) => a.distance - b.distance)
    return candidates[0] ?? null
  }

  const placeCoincidencePoint = (ref: PointRef, pt: SketchPoint) => {
    const el = sketchElements.find((candidate) => candidate.id === ref.elementId)
    if (!el) return
    if ((el.type === 'line' || el.type === 'rect') && (ref.which === 'start' || ref.which === 'end')) {
      updateSketchElement(el.id, { [ref.which]: pt } as Parameters<typeof updateSketchElement>[1])
    } else if ((el.type === 'circle' || el.type === 'arc') && ref.which === 'center') {
      updateSketchElement(el.id, { center: pt })
    } else if (el.type === 'arc' && (ref.which === 'start' || ref.which === 'end')) {
      updateSketchElement(el.id, { [ref.which === 'start' ? 'startAngle' : 'endAngle']: Math.atan2(pt.y - el.center.y, pt.x - el.center.x) })
    }
  }

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
      const live = useModelStore.getState()
      const liveElements = live.sketchElements
      const liveConstraints = live.sketchConstraints
      const dragRef: PointRef = { elementId: dragTarget.elementId, which: dragTarget.pointType }
      const cluster = constraintClusterIds(dragTarget.elementId, liveConstraints)

      // If dragging a line endpoint, provide the other endpoint as `lineStart`
      // so tangent-to-circle snapping can be detected while dragging — but only
      // onto geometry that is not already in this constraint cluster.
      let lineStartForSnap: SketchPoint | null = null
      let activeToolForSnap = activeTool
      const draggedEl = liveElements.find((e) => e.id === dragTarget.elementId)
      if (draggedEl && draggedEl.type === 'line') {
        const le = draggedEl as SketchLine
        lineStartForSnap = dragTarget.pointType === 'start' ? le.end : le.start
        activeToolForSnap = 'line'
      }

      const snap = findSnapTarget(
        raw,
        liveElements,
        sketches,
        editingSketchId,
        plane,
        activeToolForSnap,
        snapToObjects,
        snapToOtherPlanes,
        snapEndpointThreshold,
        snapObjectThreshold,
        snapTangentThreshold,
        lineStartForSnap,
        dragTarget.elementId,
        cluster,
      )
      const usableSnap = snap && !dragSnapConflictsWithConstraints(dragRef, snap, liveConstraints) ? snap : null
      setDragSnapTarget(usableSnap)
      const pt = constrainDragPosition(
        usableSnap ? usableSnap.pt : doSnap(raw),
        dragRef,
        liveElements,
        liveConstraints,
      )

      let updated = liveElements.map((el) => {
        if (el.id !== dragTarget.elementId) return el
        if (el.type === 'arc' && (dragTarget.pointType === 'start' || dragTarget.pointType === 'end')) {
          const angle = Math.atan2(pt.y - el.center.y, pt.x - el.center.x)
          return {
            ...el,
            [dragTarget.pointType === 'start' ? 'startAngle' : 'endAngle']: angle,
          } satisfies SketchArc
        }
        return { ...el, [dragTarget.pointType]: pt } as SketchElement
      })

      const fixedPoints = new Set<string>([`${dragTarget.elementId}:${dragTarget.pointType}`])
      updated = solveConstraints(updated, liveConstraints, fixedPoints)
      replaceSketchElements(updated)
      return
    }

    if (activeTool === 'coincidence') {
      const target = coincidenceTargetAt(raw, coincidenceSource?.ref ?? null)
      if (target) {
        const hint = target.kind === 'point' ? 'Coincident point'
          : target.kind === 'line' ? 'Coincident on line'
          : target.kind === 'circle' ? 'Coincident on circle/arc'
          : target.kind === 'origin' ? 'Coincident at origin'
          : `Coincident on ${target.axis.toUpperCase()} axis`
        setSnapTarget({ pt: target.pt, ref: target.kind === 'point' ? target.ref : null, constraintHint: hint })
        setCursorPt(target.pt)
      } else {
        setSnapTarget(null)
        setCursorPt(raw)
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
          // Pass current sketch constraints so tangency-based intersections are considered
          setCutPreview(computeCircleCut(nearest.circle, raw, sketchElements, sketchConstraints))
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

  // Cut is applied from onPointerDown only (see onPointerDown below) — onClick
  // fires as a *second*, separate event for the same gesture, so handling the
  // cut there too would apply the same cut twice (duplicate kept segments,
  // since cutPreview/cutTarget state hasn't re-rendered between the two calls).
  const performCut = () => {
    if (!cutPreview || !cutTarget) return
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

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()

    if (activeTool === 'cut') {
      // Handled by onPointerDown to avoid double-application; nothing to do here.
      return
    }

    if (activeTool === 'coincidence') {
      const raw = getRaw(e)
      const target = coincidenceTargetAt(raw, coincidenceSource?.ref ?? null)
      if (!coincidenceSource) {
        if (target?.kind === 'point') {
          setCoincidenceSource(target)
          setStartPt(target.pt)
        }
        return
      }
      if (!target) return

      placeCoincidencePoint(coincidenceSource.ref, target.pt)
      const constraint: SketchConstraint = target.kind === 'point'
        ? { id: crypto.randomUUID(), type: 'coincident', p1: coincidenceSource.ref, p2: target.ref }
        : target.kind === 'line'
          ? { id: crypto.randomUUID(), type: 'pointOnLine', p: coincidenceSource.ref, lineId: target.lineId }
          : target.kind === 'circle'
            ? { id: crypto.randomUUID(), type: 'pointOnCircle', p: coincidenceSource.ref, circleId: target.circleId }
            : target.kind === 'axis'
              ? { id: crypto.randomUUID(), type: 'pointOnAxis', p: coincidenceSource.ref, axis: target.axis }
              : { id: crypto.randomUUID(), type: 'pointAtOrigin', p: coincidenceSource.ref }
      addSketchConstraintsBatch([constraint], true)
      selectElement(coincidenceSource.ref.elementId)
      setCoincidenceSource(null)
      setStartPt(null)
      setSnapTarget(null)
      return
    }

    const pt = snapTarget ? snapTarget.pt : doSnap(getRaw(e))

    if (startPt === null) {
      setStartPt(pt)
      setStartSnapRef(snapTarget ? snapTarget.ref : null)
      setStartCircleId(snapTarget?.circleId ?? null)
      return
    }

    const id = crypto.randomUUID()
    const cFlag = constructionMode ? { construction: true as const } : {}

    if (activeTool === 'line') {
      const newEl: SketchLine = { type: 'line', id, start: startPt, end: pt, ...cFlag }
      addSketchElement(newEl)
      const addedConstraints: SketchConstraint[] = []
      // Auto-coincident for start point if it snapped (same-plane only)
      if (startSnapRef) {
        const c: CoincidentConstraint = { id: crypto.randomUUID(), type: 'coincident', p1: startSnapRef, p2: { elementId: id, which: 'start' } }
        addedConstraints.push(c)
      } else if (startCircleId) {
        addedConstraints.push({ id: crypto.randomUUID(), type: 'pointOnCircle', p: { elementId: id, which: 'start' }, circleId: startCircleId })
      }
      // Auto-coincident or tangent for end point if it snapped (same-plane only)
      if (snapTarget?.tangentCircleId) {
        const c: TangentConstraint = { id: crypto.randomUUID(), type: 'tangent', elementId1: id, elementId2: snapTarget.tangentCircleId }
        addedConstraints.push(c)
        // Tangency constrains the infinite line. Keep the snapped endpoint at the
        // actual contact point as a separate point-on-circle constraint.
        addedConstraints.push({ id: crypto.randomUUID(), type: 'pointOnCircle', p: { elementId: id, which: 'end' }, circleId: snapTarget.tangentCircleId })
      } else if (snapTarget?.circleId) {
        const c = { id: crypto.randomUUID(), type: 'pointOnCircle' as const, p: { elementId: id, which: 'end' } as PointRef, circleId: snapTarget.circleId }
        addedConstraints.push(c as SketchConstraint)
      } else if (snapTarget?.ref) {
        const c: CoincidentConstraint = { id: crypto.randomUUID(), type: 'coincident', p1: snapTarget.ref, p2: { elementId: id, which: 'end' } }
        addedConstraints.push(c)
      }
      // Use the store's batch API to append constraints and apply solver once
      if (addedConstraints.length > 0) {
        addSketchConstraintsBatch(addedConstraints, true)
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
      const newLines: SketchLine[] = []
      for (let i = 0; i < 4; i++) {
        const newL: SketchLine = { type: 'line', id: lineIds[i], start: corners[i], end: corners[(i + 1) % 4], ...cFlag }
        addSketchElement(newL)
        newLines.push(newL)
      }
      // Coincident constraints at each shared corner (end[i] = start[i+1])
      const addedConstraints: SketchConstraint[] = []
      for (let i = 0; i < 4; i++) {
        const c: CoincidentConstraint = { id: crypto.randomUUID(), type: 'coincident', p1: { elementId: lineIds[i], which: 'end' }, p2: { elementId: lineIds[(i + 1) % 4], which: 'start' } }
        addSketchConstraint(c)
        addedConstraints.push(c)
      }
      if (addedConstraints.length > 0) {
        const combined = [...sketchElements, ...newLines]
        const allConstraints = [...sketchConstraints, ...addedConstraints]
        const solved = solveConstraints(combined, allConstraints, new Set())
        for (const sEl of solved) updateSketchElement(sEl.id, sEl as Parameters<typeof updateSketchElement>[1])
      }
    } else if (activeTool === 'circle') {
      const r = Math.hypot(pt.x - startPt.x, pt.y - startPt.y)
      if (r > 0) addSketchElement({ type: 'circle', id, center: startPt, radius: r, ...cFlag } satisfies SketchCircle)
    }

    setStartPt(null)
    setStartSnapRef(null)
    setStartCircleId(null)
    setSnapTarget(null)
  }

  const onPointerUp = () => {
    if (dragTarget) {
      const live = useModelStore.getState()
      const liveElements = live.sketchElements
      const liveConstraints = live.sketchConstraints
      const dragRef: PointRef = { elementId: dragTarget.elementId, which: dragTarget.pointType }
      const snapOk = dragSnapTarget && !dragSnapConflictsWithConstraints(dragRef, dragSnapTarget, liveConstraints)

      if (snapOk && dragSnapTarget?.ref) {
        const p1: PointRef = { elementId: dragTarget.elementId, which: dragTarget.pointType }
        const p2 = dragSnapTarget.ref
        const alreadyLinked = liveConstraints.some(
          (c) => c.type === 'coincident' && (
            (c.p1.elementId === p1.elementId && c.p1.which === p1.which && c.p2.elementId === p2.elementId && c.p2.which === p2.which) ||
            (c.p2.elementId === p1.elementId && c.p2.which === p1.which && c.p1.elementId === p2.elementId && c.p1.which === p2.which)
          )
        )
        if (!alreadyLinked) {
          const c = { id: crypto.randomUUID(), type: 'coincident' as const, p1, p2 }
          addSketchConstraint(c)
          replaceSketchElements(solveConstraints(liveElements, [...liveConstraints, c], new Set()))
        }
      } else if (snapOk && dragSnapTarget?.tangentCircleId) {
        const tc: TangentConstraint = { id: crypto.randomUUID(), type: 'tangent', elementId1: dragTarget.elementId, elementId2: dragSnapTarget.tangentCircleId }
        const pointOnCircle: SketchConstraint = {
          id: crypto.randomUUID(),
          type: 'pointOnCircle',
          p: { elementId: dragTarget.elementId, which: dragTarget.pointType },
          circleId: dragSnapTarget.tangentCircleId,
        }
        addSketchConstraintsBatch([tc, pointOnCircle], true)
      } else if (snapOk && dragSnapTarget?.circleId) {
        const c = { id: crypto.randomUUID(), type: 'pointOnCircle' as const, p: { elementId: dragTarget.elementId, which: dragTarget.pointType } as PointRef, circleId: dragSnapTarget.circleId }
        addSketchConstraintsBatch([c], true)
      } else {
        const cluster = constraintClusterIds(dragTarget.elementId, liveConstraints)
        const draggedEl = liveElements.find((e) => e.id === dragTarget.elementId)
        const draggedPt = draggedEl && 'start' in draggedEl && 'end' in draggedEl
          ? (dragTarget.pointType === 'start' ? draggedEl.start : draggedEl.end)
          : null
        if (draggedPt) {
          let bestRef: PointRef | null = null
          let bestDist = Infinity
          for (const el of liveElements) {
            if (cluster.has(el.id)) continue
            if (el.type === 'line' || el.type === 'rect') {
              const endpoints = el.type === 'line'
                ? [{ pt: (el as SketchLine).start, which: 'start' as const }, { pt: (el as SketchLine).end, which: 'end' as const }]
                : [{ pt: (el as SketchRect).start, which: 'start' as const }, { pt: (el as SketchRect).end, which: 'end' as const }]
              for (const ep of endpoints) {
                const d = Math.hypot(draggedPt.x - ep.pt.x, draggedPt.y - ep.pt.y)
                if (d < snapEndpointThreshold && d < bestDist) {
                  bestDist = d
                  bestRef = { elementId: el.id, which: ep.which }
                }
              }
            }
          }
          if (bestRef) {
            const p1: PointRef = { elementId: dragTarget.elementId, which: dragTarget.pointType }
            const p2 = bestRef
            const alreadyLinked = liveConstraints.some(
              (c) => c.type === 'coincident' && (
                (c.p1.elementId === p1.elementId && c.p1.which === p1.which && c.p2.elementId === p2.elementId && c.p2.which === p2.which) ||
                (c.p2.elementId === p1.elementId && c.p2.which === p1.which && c.p1.elementId === p2.elementId && c.p1.which === p2.which)
              )
            )
            if (!alreadyLinked) {
              const c = { id: crypto.randomUUID(), type: 'coincident' as const, p1, p2 }
              addSketchConstraint(c)
              replaceSketchElements(solveConstraints(liveElements, [...liveConstraints, c], new Set()))
            }
          }
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
    if (activeTool !== 'cut' || e.button !== 0) return
    e.stopPropagation()
    performCut()
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
        <SketchEl key={el.id} el={el} plane={plane} highlighted={cutPreview?.lineId === el.id} onPointerMove={onMove} pointPickRadius={snapObjectThreshold} suppressElementClick={() => handleConsumedClick.current} />
      ))}

      {/* Point handles — click to select, drag to move */}
      {activeTool === 'select' && sketchElements.map((el) => {
        const startDrag = (pointType: 'start' | 'end' | 'center') => (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setDragTarget({ elementId: el.id, pointType })
          setIsDraggingPoint(true)
        }
        const clickPoint = (pointType: 'start' | 'end' | 'center') => (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          handleConsumedClick.current = true
          window.setTimeout(() => { handleConsumedClick.current = false }, 80)
          const ref: PointRef = { elementId: el.id, which: pointType }
          const shift = !!(e.shiftKey || e.nativeEvent.shiftKey)
          if (shift) togglePointSelection(ref)
          else selectPoint(ref)
        }
        const pointSelected = (which: PointRef['which']) =>
          selectedPointRefs.some((p) => p.elementId === el.id && p.which === which)
        const handleHighlight = highlightElementIds.includes(el.id)
        if (el.type === 'line') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={getHandlePoint(el.start)} onDragStart={startDrag('start')} onDragMove={onMove} onDragEnd={onPointerUp} onPress={clickPoint('start')} highlighted={handleHighlight} selected={pointSelected('start')} />
            <PointHandle pos={getHandlePoint(el.end)} onDragStart={startDrag('end')} onDragMove={onMove} onDragEnd={onPointerUp} onPress={clickPoint('end')} highlighted={handleHighlight} selected={pointSelected('end')} />
          </group>
        )
        if (el.type === 'circle') return (
          <PointHandle key={el.id + '_handle'} pos={getHandlePoint(el.center)} onDragStart={startDrag('center')} onDragMove={onMove} onDragEnd={onPointerUp} onPress={clickPoint('center')} highlighted={handleHighlight} selected={pointSelected('center')} />
        )
        if (el.type === 'rect') return (
          <group key={el.id + '_handles'}>
            <PointHandle pos={getHandlePoint(el.start)} onDragStart={startDrag('start')} onDragMove={onMove} onDragEnd={onPointerUp} onPress={clickPoint('start')} highlighted={handleHighlight} selected={pointSelected('start')} />
            <PointHandle pos={getHandlePoint(el.end)} onDragStart={startDrag('end')} onDragMove={onMove} onDragEnd={onPointerUp} onPress={clickPoint('end')} highlighted={handleHighlight} selected={pointSelected('end')} />
          </group>
        )
        if (el.type === 'arc') {
          const ends = elementEndpoints(el)
          return (
            <group key={el.id + '_handles'}>
              {ends.map(({ pt, ref }) => (
                <PointHandle
                  key={`${el.id}_${ref.which}`}
                  pos={getHandlePoint(pt)}
                  onDragStart={startDrag(ref.which)}
                  onDragMove={onMove}
                  onDragEnd={onPointerUp}
                  onPress={clickPoint(ref.which)}
                  highlighted={handleHighlight}
                  selected={pointSelected(ref.which)}
                />
              ))}
            </group>
          )
        }
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
