import { useMemo, useEffect } from 'react'
import { ThreeEvent } from '@react-three/fiber'
import { Vector3 } from 'three'
import { DoubleSide, ExtrudeGeometry } from 'three'
import { useModelStore, ExtrudeFeature, PlaneId } from '../../store/modelStore'
import { sketchElementsToShape, EXTRUDE_ROTATION } from '../../lib/sketchToShape'

function normalToPlane(normal: Vector3): PlaneId {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  if (az >= ax && az >= ay) return 'XY'
  if (ay >= ax && ay >= az) return 'XZ'
  return 'YZ'
}

function ExtrudedSolid({ ext }: { ext: ExtrudeFeature }) {
  const { mode, newSketchArmed, startNewSketch, sketches } = useModelStore()
  const sketch = sketches.find((s) => s.id === ext.sketchId)

  const geometry = useMemo(() => {
    if (!sketch) return null
    const shapes = sketchElementsToShape(sketch.elements, sketch.plane)
    if (shapes.length === 0) return null
    return new ExtrudeGeometry(shapes, { depth: Math.abs(ext.depth), bevelEnabled: false })
  }, [sketch, ext.depth])

  useEffect(() => () => { geometry?.dispose() }, [geometry])

  if (!geometry || !sketch) return null

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'view' || !newSketchArmed || !e.face) return
    e.stopPropagation()
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld)
    startNewSketch(normalToPlane(worldNormal))
  }

  return (
    <mesh
      rotation={EXTRUDE_ROTATION[sketch.plane]}
      onClick={onClick}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color="#4477bb" transparent opacity={0.82} side={DoubleSide} />
    </mesh>
  )
}

export function ExtrudedSolids() {
  const { extrudes } = useModelStore()
  return (
    <>
      {extrudes.map((ext) => (
        <ExtrudedSolid key={ext.id} ext={ext} />
      ))}
    </>
  )
}
