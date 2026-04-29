import { useMemo, useEffect, useRef, useState } from 'react'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Mesh, BufferGeometry, MeshStandardMaterial, DoubleSide, Raycaster } from 'three'
import { useModelStore } from '../../store/modelStore'
import { planePoseFromHit } from '../../lib/planePose'
import { buildSolidMeshes, buildCutGeometries, disposeSolidMeshes } from '../../lib/solidModel'

interface HoverPreview {
  position: [number, number, number]
  rotation: [number, number, number]
}

const noopRaycast: () => void = () => {}

function SolidMesh({
  solidMesh,
  color,
  opacity,
  onHover,
  onHoverOut,
}: {
  solidMesh: Mesh
  color: string
  opacity: number
  onHover: (point: Vector3, normal: Vector3) => void
  onHoverOut: () => void
}) {
  const { mode, newSketchArmed, startNewSketch } = useModelStore()
  const { camera, gl } = useThree()
  const meshRef = useRef<Mesh>(null)
  const mouseRef = useRef(new Vector2())

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.geometry = solidMesh.geometry
      meshRef.current.material = new MeshStandardMaterial({ color, transparent: true, opacity, side: DoubleSide })
    }
  }, [solidMesh, color, opacity])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [gl])

  useEffect(() => {
    const handleClick = () => {
      if (mode !== 'view' || !newSketchArmed || !meshRef.current) return

      const raycaster = new Raycaster()
      raycaster.setFromCamera(mouseRef.current, camera)
      const intersects = raycaster.intersectObject(meshRef.current)

      if (intersects.length > 0) {
        const intersection = intersects[0]
        if (intersection.face) {
          const worldNormal = intersection.face.normal.clone().transformDirection(meshRef.current.matrixWorld).normalize()
          startNewSketch(planePoseFromHit(worldNormal, intersection.point))
        }
      }
    }

    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [mode, newSketchArmed, camera, startNewSketch])

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'view' || !newSketchArmed || !e.face) return
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    onHover(e.point.clone(), worldNormal)
  }

  const onPointerOut = () => {
    onHoverOut()
  }

  return (
    <mesh ref={meshRef} onPointerMove={onPointerMove} onPointerOut={onPointerOut} />
  )
}

function CutVolumeMesh({ geo, color, opacity }: { geo: BufferGeometry; color: string; opacity: number }) {
  const meshRef = useRef<Mesh>(null)
  useEffect(() => {
    if (meshRef.current) meshRef.current.geometry = geo
  }, [geo])
  return (
    <mesh ref={meshRef} raycast={noopRaycast}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

export function ExtrudedSolids() {
  const { extrudes, sketches } = useModelStore()
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null)

  const addExtrudes = useMemo(() => extrudes.filter((e) => e.operation === 'add'), [extrudes])
  const cutExtrudes = useMemo(() => extrudes.filter((e) => e.operation === 'cut'), [extrudes])
  const solids = useMemo(() => buildSolidMeshes(extrudes, sketches), [extrudes, sketches])
  const cutGeos = useMemo(() => buildCutGeometries(extrudes, sketches), [extrudes, sketches])

  const handleHover = (point: Vector3, normal: Vector3) => {
    const pose = planePoseFromHit(normal, point)
    const lifted = point.clone().add(normal.clone().multiplyScalar(0.02))
    setHoverPreview({
      position: [lifted.x, lifted.y, lifted.z],
      rotation: pose.rotation,
    })
  }

  const clearHover = () => setHoverPreview(null)

  useEffect(() => {
    return () => disposeSolidMeshes(solids)
  }, [solids])

  useEffect(() => {
    return () => cutGeos.forEach((g) => g.dispose())
  }, [cutGeos])

  return (
    <>
      {solids.map((mesh, i) => (
        <SolidMesh
          key={mesh.uuid}
          solidMesh={mesh}
          color={addExtrudes[i]?.color ?? '#4477bb'}
          opacity={addExtrudes[i]?.opacity ?? 0.82}
          onHover={handleHover}
          onHoverOut={clearHover}
        />
      ))}
      {cutGeos.map((geo, i) => (
        <CutVolumeMesh
          key={geo.uuid}
          geo={geo}
          color={cutExtrudes[i]?.color ?? '#ff4422'}
          opacity={cutExtrudes[i]?.opacity ?? 0.22}
        />
      ))}
      {hoverPreview && (
        <mesh position={hoverPreview.position} rotation={hoverPreview.rotation} raycast={noopRaycast}>
          <planeGeometry args={[2.5, 2.5]} />
          <meshBasicMaterial color="#ffe866" transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
