import { useMemo, useEffect, useRef } from 'react'
import { Mesh, BufferGeometry, DoubleSide } from 'three'
import { useModelStore } from '../../store/modelStore'
import { buildLoftGeometry } from '../../lib/loftModel'

function LoftMesh({ geo, color, opacity }: { geo: BufferGeometry; color: string; opacity: number }) {
  const meshRef = useRef<Mesh>(null)
  useEffect(() => {
    if (meshRef.current) meshRef.current.geometry = geo
  }, [geo])
  return (
    <mesh ref={meshRef}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} side={DoubleSide} />
    </mesh>
  )
}

export function LoftedSolids() {
  const { lofts, sketches } = useModelStore()

  const geos = useMemo(
    () =>
      lofts.map((l) => ({
        id: l.id,
        operation: l.operation,
        geo: buildLoftGeometry(l, sketches),
      })),
    [lofts, sketches],
  )

  useEffect(() => {
    return () => geos.forEach((g) => g.geo?.dispose())
  }, [geos])

  return (
    <>
      {geos.map((g) =>
        g.geo ? (
          <LoftMesh
            key={g.id}
            geo={g.geo}
            color={g.operation === 'cut' ? '#ff6644' : '#44a888'}
            opacity={g.operation === 'cut' ? 0.35 : 0.82}
          />
        ) : null,
      )}
    </>
  )
}