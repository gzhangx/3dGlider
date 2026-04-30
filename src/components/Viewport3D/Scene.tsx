import { useRef, useEffect } from 'react'
import { Grid, CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useModelStore } from '../../store/modelStore'
import { planeNormalFromPose, planeOriginFromPose } from '../../lib/planePose'
import { AxesHelper } from './AxesHelper'
import { PlaneGizmo } from './PlaneGizmo'
import { SketchPlane } from './SketchPlane'
import { CommittedSketches } from './CommittedSketches'
import { ExtrudedSolids } from './ExtrudedSolids'
import { RevolvedSolids } from './RevolvedSolids'

// camera-controls ACTION enum values
const ACTION_NONE = 0
const ACTION_ROTATE = 1
const ACTION_TRUCK = 2

export function Scene() {
  const { activePlane, mode, activeTool, isDraggingPoint } = useModelStore()
  const { camera } = useThree()
  const controlsRef = useRef<CameraControls>(null)

  // Snap camera perpendicular to plane when entering sketch mode
  useEffect(() => {
    if (!activePlane || !controlsRef.current) return
    const dist = camera.position.length() || 12
    const normal = planeNormalFromPose(activePlane)
    const origin = planeOriginFromPose(activePlane)
    const nx = normal.x
    const ny = normal.y
    const nz = normal.z
    const tx = origin.x
    const ty = origin.y
    const tz = origin.z
    controlsRef.current.setLookAt(tx + nx * dist, ty + ny * dist, tz + nz * dist, tx, ty, tz, true)
  }, [activePlane, camera])

  // In sketch mode with a draw tool: disable left-button orbit so clicks reach the sketch plane.
  // Right-drag and scroll still pan/zoom freely.
  useEffect(() => {
    if (!controlsRef.current) return
    const c = controlsRef.current
    if (mode === 'sketch' && (activeTool !== 'select' || isDraggingPoint)) {
      c.mouseButtons.left = ACTION_NONE
    } else {
      c.mouseButtons.left = ACTION_ROTATE
    }
    c.mouseButtons.right = ACTION_TRUCK
  }, [mode, activeTool, isDraggingPoint])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />

      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#3a3a5c"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#5a5a8c"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      <AxesHelper />

      {mode === 'view' && (
        <>
          <PlaneGizmo id="XY" rotation={[0, 0, 0]}            color="#4488ff" label="XY" />
          <PlaneGizmo id="XZ" rotation={[-Math.PI / 2, 0, 0]} color="#44cc44" label="XZ" />
          <PlaneGizmo id="YZ" rotation={[0, Math.PI / 2, 0]}  color="#ff6644" label="YZ" />
        </>
      )}

      <ExtrudedSolids />
      <RevolvedSolids />
      <CommittedSketches />

      {mode === 'sketch' && <SketchPlane />}

      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={2}
        maxDistance={50}
        smoothTime={0.25}
      />
    </>
  )
}
