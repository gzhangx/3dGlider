import { useRef, useMemo } from 'react'
import { Mesh, DoubleSide, PlaneGeometry, EdgesGeometry } from 'three'
import { Text } from '@react-three/drei'
import { useModelStore, PlaneId } from '../../store/modelStore'

interface PlaneGizmoProps {
  id: PlaneId
  rotation: [number, number, number]
  color: string
  label: string
}

const SIZE = 4

export function PlaneGizmo({ id, rotation, color, label }: PlaneGizmoProps) {
  const ref = useRef<Mesh>(null)
  const { hoveredPlane, mode, setHoveredPlane, enterSketch } = useModelStore()
  const edges = useMemo(() => new EdgesGeometry(new PlaneGeometry(SIZE, SIZE)), [])

  const isHovered = hoveredPlane === id
  const isDisabled = mode === 'sketch'

  return (
    <group rotation={rotation}>
      <mesh
        ref={ref}
        onPointerEnter={() => !isDisabled && setHoveredPlane(id)}
        onPointerLeave={() => setHoveredPlane(null)}
        onClick={() => !isDisabled && enterSketch(id)}
      >
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.35 : 0.12}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={isHovered ? 0.9 : 0.4} />
      </lineSegments>
      <Text position={[SIZE / 2 + 0.2, SIZE / 2 + 0.2, 0]} fontSize={0.3} color={color}>
        {label}
      </Text>
    </group>
  )
}
