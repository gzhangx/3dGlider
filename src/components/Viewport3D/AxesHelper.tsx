import { Line, Text } from '@react-three/drei'
import { PLANE_SIZE } from '../../lib/units'

export function AxesHelper() {
  const len = PLANE_SIZE*.55;
  const labelOffset = 0.6
  return (
    <group>
      {/* X axis - red */}
      <Line points={[[0,0,0],[len,0,0]]} color="#ff4444" lineWidth={2} />
      <Text position={[len + labelOffset, 0, 0]} fontSize={0.32} color="#ff4444">X</Text>

      {/* Y axis - green */}
      <Line points={[[0,0,0],[0,len,0]]} color="#44ff44" lineWidth={2} />
      <Text position={[0, len + labelOffset, 0]} fontSize={0.32} color="#44ff44">Y</Text>

      {/* Z axis - blue */}
      <Line points={[[0,0,0],[0,0,len]]} color="#4488ff" lineWidth={2} />
      <Text position={[0, 0, len + labelOffset]} fontSize={0.32} color="#4488ff">Z</Text>
    </group>
  )
}
