import { useMemo, useEffect, useRef } from 'react'
import { Mesh, BufferGeometry, DoubleSide } from 'three'
import { useModelStore } from '../../store/modelStore'
import { buildRevolveGeometry } from '../../lib/revolveModel'

function RevolveMesh({ geo, color, opacity }: { geo: BufferGeometry; color: string; opacity: number }) {
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

export function RevolvedSolids() {
  const { revolves, sketches } = useModelStore()

  const geos = useMemo(
    () =>
      revolves.map((r) => ({
        id: r.id,
        geo: buildRevolveGeometry(r, sketches),
        color: r.color ?? '#7755cc',
        opacity: r.opacity ?? 0.82,
      })),
    [revolves, sketches],
  )

  useEffect(() => {
    return () => geos.forEach((g) => g.geo?.dispose())
  }, [geos])

  return (
    <>
      {geos.map((g) =>
        g.geo ? (
          <RevolveMesh key={g.id} geo={g.geo} color={g.color} opacity={g.opacity} />
        ) : null,
      )}
    </>
  )
}
