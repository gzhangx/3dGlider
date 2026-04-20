import { useMemo, useEffect } from 'react'
import { DoubleSide, ExtrudeGeometry } from 'three'
import { useModelStore, ExtrudeFeature } from '../../store/modelStore'
import { sketchElementsToShape, EXTRUDE_ROTATION } from '../../lib/sketchToShape'

function ExtrudedSolid({ ext }: { ext: ExtrudeFeature }) {
  const { sketches } = useModelStore()
  const sketch = sketches.find((s) => s.id === ext.sketchId)

  const geometry = useMemo(() => {
    if (!sketch) return null
    const shapes = sketchElementsToShape(sketch.elements, sketch.plane)
    if (shapes.length === 0) return null
    return new ExtrudeGeometry(shapes, { depth: Math.abs(ext.depth), bevelEnabled: false })
  }, [sketch, ext.depth])

  useEffect(() => () => { geometry?.dispose() }, [geometry])

  if (!geometry || !sketch) return null

  return (
    <mesh rotation={EXTRUDE_ROTATION[sketch.plane]}>
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
