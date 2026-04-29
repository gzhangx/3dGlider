import { useEffect, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { useModelStore, Sketch, SketchElement, SketchPlanePose } from '../../store/modelStore'
import { linePts, rectPts, circlePts, arcPts } from '../../lib/sketchGeometry'

function SketchEl({
  el,
  plane,
  sketchColor,
  sketchOpacity,
}: {
  el: SketchElement
  plane: SketchPlanePose
  sketchColor: string
  sketchOpacity: number
}) {
  const { mode, activeTool, newSketchArmed, selectedElementId, selectElement } = useModelStore()
  const [hovered, setHovered] = useState(false)
  const lineRef = useRef<any>(null)

  const isConstruction = !!el.construction
  const isSelected = selectedElementId === el.id
  const selectable = (mode === 'view' || activeTool === 'select') && !newSketchArmed
  const baseColor = isConstruction ? '#4488aa' : sketchColor
  const color = isSelected ? '#ff8844' : hovered ? '#ffe888' : baseColor
  const width = isSelected || hovered ? 3 : 2
  const dashProps = isConstruction ? { dashed: true, dashSize: 0.18, gapSize: 0.12 } : {}

  // Re-apply opacity after every render — drei may reset material when color changes
  useEffect(() => {
    const mat = lineRef.current?.material
    if (!mat) return
    mat.opacity = sketchOpacity
    mat.transparent = sketchOpacity < 1
    mat.needsUpdate = true
  })

  const selectProps = selectable
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectElement(el.id) },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
      }
    : {}

  if (el.type === 'line')
    return <Line ref={lineRef} points={linePts(el.start, el.end, plane)} color={color} lineWidth={width} {...selectProps} {...dashProps} />
  if (el.type === 'rect')
    return <Line ref={lineRef} points={rectPts(el.start, el.end, plane)} color={color} lineWidth={width} {...selectProps} {...dashProps} />
  if (el.type === 'circle')
    return <Line ref={lineRef} points={circlePts(el.center, el.radius, plane, 64)} color={color} lineWidth={width} {...selectProps} {...dashProps} />
  if (el.type === 'arc')
    return <Line ref={lineRef} points={arcPts(el.center, el.radius, el.startAngle, el.endAngle, plane, 64)} color={color} lineWidth={width} {...selectProps} {...dashProps} />
  return null
}

function SavedSketch({ sketch }: { sketch: Sketch }) {
  const color = sketch.color ?? '#ffdd44'
  const opacity = sketch.opacity ?? 1
  return (
    <>
      {sketch.elements.map((el) => (
        <SketchEl key={el.id} el={el} plane={sketch.plane} sketchColor={color} sketchOpacity={opacity} />
      ))}
    </>
  )
}

export function CommittedSketches() {
  const { sketches } = useModelStore()
  return (
    <>
      {sketches.map((s) => (
        <SavedSketch key={s.id} sketch={s} />
      ))}
    </>
  )
}
