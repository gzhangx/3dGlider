import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { Line, Text } from '@react-three/drei'
import { PLANE_SIZE } from '../../lib/units'

function AxisLabel({ position, color, children }: { position: [number, number, number]; color: string; children: string }) {
  const ref = useRef<Group>(null)
  const worldPos = new Vector3()

  useFrame(({ camera }) => {
    if (!ref.current) return
    ref.current.getWorldPosition(worldPos)
    const distance = camera.position.distanceTo(worldPos)
    const scale = Math.max(0.32, distance * 0.03)
    ref.current.scale.setScalar(scale)
    ref.current.lookAt(camera.position)
  })

  return (
    <group ref={ref} position={position}>
      <Text
        fontSize={1}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {children}
      </Text>
    </group>
  )
}

export function AxesHelper() {
  const len = PLANE_SIZE * 0.55
  const labelOffset = 0.6
  return (
    <group>
      {/* X axis - red */}
      <Line points={[[0, 0, 0], [len, 0, 0]]} color="#ff4444" lineWidth={2} />
      <AxisLabel position={[len + labelOffset, 0, 0]} color="#ff4444">X</AxisLabel>

      {/* Y axis - green */}
      <Line points={[[0, 0, 0], [0, len, 0]]} color="#44ff44" lineWidth={2} />
      <AxisLabel position={[0, len + labelOffset, 0]} color="#44ff44">Y</AxisLabel>

      {/* Z axis - blue */}
      <Line points={[[0, 0, 0], [0, 0, len]]} color="#4488ff" lineWidth={2} />
      <AxisLabel position={[0, 0, len + labelOffset]} color="#4488ff">Z</AxisLabel>
    </group>
  )
}
