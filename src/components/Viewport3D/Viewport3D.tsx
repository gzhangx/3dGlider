import { Canvas } from '@react-three/fiber'
import { useModelStore } from '../../store/modelStore'
import { Scene } from './Scene'

export function Viewport3D() {
  const { mode, activeTool } = useModelStore()
  const cursor = mode === 'sketch' && activeTool !== 'select' ? 'crosshair' : 'default'

  return (
    <Canvas
      camera={{ position: [6, 5, 8], fov: 50, near: 0.01, far: 1000 }}
      style={{ width: '100%', height: '100%', cursor }}
    >
      <Scene />
    </Canvas>
  )
}
