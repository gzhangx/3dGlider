import { useMemo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Mesh, BufferGeometry, DoubleSide } from 'three'
import { useModelStore } from '../../store/modelStore'
import { buildSweepGeometry } from '../../lib/sweepModel'

function SweepMesh({ geo, color, opacity }: { geo: BufferGeometry; color: string; opacity: number }) {
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

export function SweepedSolids() {
  const { sweeps, sketches } = useModelStore(useShallow((state) => ({ sweeps: state.sweeps, sketches: state.sketches })))

  const geos = useMemo(
    () =>
      sweeps.map((sw) => ({
        id: sw.id,
        operation: sw.operation,
        geo: buildSweepGeometry(sw, sketches),
      })),
    [sweeps, sketches],
  )

  useEffect(() => {
    return () => geos.forEach((g) => g.geo?.dispose())
  }, [geos])

  return (
    <>
      {geos.map((g) =>
        g.geo ? (
          <SweepMesh
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
