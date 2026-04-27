import { useState } from 'react'
import { Line } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { useModelStore, Sketch, SketchElement, PlaneId } from '../../store/modelStore'
import { linePts, rectPts, circlePts, arcPts } from '../../lib/sketchGeometry'

function SketchEl({ el, plane, offset }: { el: SketchElement; plane: PlaneId; offset: number }) {
  const { mode, activeTool, newSketchArmed, selectedElementId, selectElement } = useModelStore()
  const [hovered, setHovered] = useState(false)

  const isSelected = selectedElementId === el.id
  const selectable = (mode === 'view' || activeTool === 'select') && !newSketchArmed
  const color = isSelected ? '#ff8844' : hovered ? '#ffe888' : '#ffdd44'
  const width = isSelected || hovered ? 3 : 2

  const selectProps = selectable
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectElement(el.id) },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) },
        onPointerOut: () => setHovered(false),
      }
    : {}

  if (el.type === 'line')
    return <Line points={linePts(el.start, el.end, plane, offset)} color={color} lineWidth={width} {...selectProps} />
  if (el.type === 'rect')
    return <Line points={rectPts(el.start, el.end, plane, offset)} color={color} lineWidth={width} {...selectProps} />
  if (el.type === 'circle')
    return <Line points={circlePts(el.center, el.radius, plane, 64, offset)} color={color} lineWidth={width} {...selectProps} />
  if (el.type === 'arc')
    return <Line points={arcPts(el.center, el.radius, el.startAngle, el.endAngle, plane, 64, offset)} color={color} lineWidth={width} {...selectProps} />
  return null
}

function SavedSketch({ sketch }: { sketch: Sketch }) {
  return (
    <>
      {sketch.elements.map((el) => (
        <SketchEl key={el.id} el={el} plane={sketch.plane} offset={sketch.offset} />
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
