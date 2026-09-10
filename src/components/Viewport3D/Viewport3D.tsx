import { Canvas } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore } from '../../store/modelStore'
import { distanceToFitPlane } from '../../lib/units'
import { Scene } from './Scene'

export function Viewport3D() {
  const { mode, activeTool } = useModelStore(useShallow((state) => ({ mode: state.mode, activeTool: state.activeTool })))
  const cursor = mode === 'sketch' && activeTool !== 'select' ? 'crosshair' : 'default'

  const d = distanceToFitPlane()
  return (
    <Canvas
      camera={{ position: [d * 0.55, d * 0.72, d * 0.55], fov: 50, near: 0.05, far: 500 }}
      style={{ width: '100%', height: '100%', cursor }}
    >
      <Scene />
    </Canvas>
  )
}
