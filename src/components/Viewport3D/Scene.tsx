import { useRef, useEffect, useMemo } from 'react'
import { Grid, CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { PlaneGeometry, EdgesGeometry, DoubleSide } from 'three'
import { useModelStore, SketchPlanePose } from '../../store/modelStore'
import { planeNormalFromPose, planeOriginFromPose } from '../../lib/planePose'
import { AxesHelper } from './AxesHelper'
import { PlaneGizmo } from './PlaneGizmo'
import { SketchPlane } from './SketchPlane'
import { CommittedSketches } from './CommittedSketches'
import { ExtrudedSolids } from './ExtrudedSolids'
import { RevolvedSolids } from './RevolvedSolids'
import { LoftedSolids } from './LoftedSolids'

// camera-controls ACTION enum values
const ACTION_NONE = 0
const ACTION_ROTATE = 1
const ACTION_TRUCK = 2

function PreviewPlane({ plane }: { plane: SketchPlanePose }) {
  const position = planeOriginFromPose(plane)
  const edges = useMemo(() => new EdgesGeometry(new PlaneGeometry(6, 6)), [])
  return (
    <group position={[position.x, position.y, position.z]} rotation={plane.rotation}>
      <mesh>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial
          color="#ffff88"
          transparent
          opacity={0.16}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#ffff88" transparent opacity={0.6} />
      </lineSegments>
    </group>
  )
}

export function Scene() {
  const { activePlane, mode, activeTool, isDraggingPoint, sketchViewResetCounter, hideOtherSketches, previewPlane } = useModelStore()
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

  // Reset sketch view on demand (same logic as entering sketch mode)
  useEffect(() => {
    if (!sketchViewResetCounter || !activePlane || !controlsRef.current) return
    const normal = planeNormalFromPose(activePlane)
    const origin = planeOriginFromPose(activePlane)
    controlsRef.current.setLookAt(
      origin.x + normal.x * 12, origin.y + normal.y * 12, origin.z + normal.z * 12,
      origin.x, origin.y, origin.z,
      true,
    )
  }, [sketchViewResetCounter, activePlane])

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
          {previewPlane && <PreviewPlane plane={previewPlane} />}
        </>
      )}

      {!(mode === 'sketch' && hideOtherSketches) && (
        <>
          <ExtrudedSolids />
          <RevolvedSolids />
          <LoftedSolids />
          <CommittedSketches />
        </>
      )}

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
