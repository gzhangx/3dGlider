import { Line, Text } from '@react-three/drei'

export function AxesHelper() {
  const len = 3
  return (
    <group>
      {/* X axis - red */}
      <Line points={[[0,0,0],[len,0,0]]} color="#ff4444" lineWidth={2} />
      <Text position={[len + 0.2, 0, 0]} fontSize={0.25} color="#ff4444">X</Text>

      {/* Y axis - green */}
      <Line points={[[0,0,0],[0,len,0]]} color="#44ff44" lineWidth={2} />
      <Text position={[0, len + 0.2, 0]} fontSize={0.25} color="#44ff44">Y</Text>

      {/* Z axis - blue */}
      <Line points={[[0,0,0],[0,0,len]]} color="#4488ff" lineWidth={2} />
      <Text position={[0, 0, len + 0.2]} fontSize={0.25} color="#4488ff">Z</Text>
    </group>
  )
}
