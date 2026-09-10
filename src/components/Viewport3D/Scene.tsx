import { useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Grid, CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Box3, PlaneGeometry, EdgesGeometry, DoubleSide, Vector3 } from 'three'
import { useModelStore, SketchPlanePose } from '../../store/modelStore'
import { planeNormalFromPose, planeOriginFromPose } from '../../lib/planePose'
import { PLANE_SIZE, distanceToFitPlane } from '../../lib/units'
import { AxesHelper } from './AxesHelper'
import { PlaneGizmo } from './PlaneGizmo'
import { SketchPlane } from './SketchPlane'
import { CommittedSketches } from './CommittedSketches'
import { ExtrudedSolids } from './ExtrudedSolids'
import { RevolvedSolids } from './RevolvedSolids'
import { LoftedSolids } from './LoftedSolids'
import { SweepedSolids } from './SweepedSolids'

// camera-controls ACTION enum values
const ACTION_NONE = 0
const ACTION_ROTATE = 1
const ACTION_TRUCK = 2

function PreviewPlane({ plane }: { plane: SketchPlanePose }) {
  const position = planeOriginFromPose(plane)
  const edges = useMemo(() => new EdgesGeometry(new PlaneGeometry(PLANE_SIZE, PLANE_SIZE)), [])
  return (
    <group position={[position.x, position.y, position.z]} rotation={plane.rotation}>
      <mesh>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
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
  const { activePlane, mode, activeTool, isDraggingPoint, sketchViewResetCounter, hideOtherSketches, previewPlane } = useModelStore(useShallow((state) => ({
    activePlane: state.activePlane,
    mode: state.mode,
    activeTool: state.activeTool,
    isDraggingPoint: state.isDraggingPoint,
    sketchViewResetCounter: state.sketchViewResetCounter,
    hideOtherSketches: state.hideOtherSketches,
    previewPlane: state.previewPlane,
  })))
  const { camera } = useThree()
  const controlsRef = useRef<CameraControls>(null)
  const initialViewSet = useRef(false)
  const plateDist = distanceToFitPlane('fov' in camera && typeof camera.fov === 'number' ? camera.fov : 50)

  useLayoutEffect(() => {
    if (initialViewSet.current) return
    const id = requestAnimationFrame(() => {
      const controls = controlsRef.current
      if (!controls) return
      const half = PLANE_SIZE / 2
      const sceneBounds = new Box3(
        new Vector3(-half, 0, -half),
        new Vector3(half, half * 0.08, half),
      )
      controls.fitToBox(sceneBounds, false)
      initialViewSet.current = true
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Snap camera perpendicular to plane when entering sketch mode
  useEffect(() => {
    if (!activePlane || !controlsRef.current) return
    const normal = planeNormalFromPose(activePlane)
    const origin = planeOriginFromPose(activePlane)
    controlsRef.current.setLookAt(
      origin.x + normal.x * plateDist,
      origin.y + normal.y * plateDist,
      origin.z + normal.z * plateDist,
      origin.x, origin.y, origin.z,
      true,
    )
  }, [activePlane, plateDist])

  // Reset sketch view on demand (same logic as entering sketch mode)
  useEffect(() => {
    if (!sketchViewResetCounter || !activePlane || !controlsRef.current) return
    const normal = planeNormalFromPose(activePlane)
    const origin = planeOriginFromPose(activePlane)
    controlsRef.current.setLookAt(
      origin.x + normal.x * plateDist,
      origin.y + normal.y * plateDist,
      origin.z + normal.z * plateDist,
      origin.x, origin.y, origin.z,
      true,
    )
  }, [sketchViewResetCounter, activePlane, plateDist])

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
        args={[PLANE_SIZE, PLANE_SIZE]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#3a3a5c"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#5a5a8c"
        fadeDistance={PLANE_SIZE * 1.6}
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
          <SweepedSolids />
          <CommittedSketches />
        </>
      )}

      {mode === 'sketch' && <SketchPlane />}

      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={0.5}
        maxDistance={PLANE_SIZE * 6}
        smoothTime={0.25}
      />
    </>
  )
}
