import { useState, useEffect, useCallback } from 'react'
import { Line } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import {
  useModelStore,
  SketchPoint,
  SketchElement,
  SketchLine,
  SketchRect,
  SketchCircle,
} from '../../store/modelStore'
import {
  PLANE_ROTATION,
  worldPt,
  toSketch,
  snapPt,
  linePts,
  rectPts,
  circlePts,
} from '../../lib/sketchGeometry'

// ─── dot marker ──────────────────────────────────────────────────────────────

function Dot({ pos, color, size = 0.06 }: { pos: [number, number, number]; color: string; size?: number }) {
  return (
    <mesh position={pos}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

// ─── single element renderer (with hover/select) ──────────────────────────────

function SketchEl({ el, plane }: { el: SketchElement; plane: ReturnType<typeof useModelStore>['activePlane'] & string }) {
  const { activeTool, selectedElementId, selectElement } = useModelStore()
  const [hovered, setHovered] = useState(false)

  const isSelected = selectedElementId === el.id
  const color = isSelected ? '#ff8844' : hovered ? '#ffe888' : '#ffdd44'
  const width = isSelected || hovered ? 3 : 2

  const selectProps = activeTool === 'select'
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectElement(el.id) },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
      }
    : {}

  if (el.type === 'line')
    return <Line points={linePts(el.start, el.end, plane)} color={color} lineWidth={width} {...selectProps} />
  if (el.type === 'rect')
    return <Line points={rectPts(el.start, el.end, plane)} color={color} lineWidth={width} {...selectProps} />
  if (el.type === 'circle')
    return <Line points={circlePts(el.center, el.radius, plane)} color={color} lineWidth={width} {...selectProps} />
  return null
}

// ─── main component ───────────────────────────────────────────────────────────

export function SketchPlane() {
  const {
    activePlane, activeTool, sketchElements,
    selectedElementId, selectElement,
    addSketchElement, deleteSketchElement, exitSketch,
  } = useModelStore()

  const [startPt, setStartPt] = useState<SketchPoint | null>(null)
  const [cursorPt, setCursorPt] = useState<SketchPoint | null>(null)

  useEffect(() => { setStartPt(null); setCursorPt(null) }, [activeTool])

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

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setCursorPt(getSnapped(e))
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
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

      {/* Elements — clickable in select mode */}
      {sketchElements.map((el) => (
        <SketchEl key={el.id} el={el} plane={plane} />
      ))}

      {/* Cursor & anchor dots (draw tools only) */}
      {isDrawTool && cursorPt && <Dot pos={worldPt(cursorPt, plane)} color="#ffffff" size={0.05} />}
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
