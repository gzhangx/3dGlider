import { useMemo, useEffect, useRef, useState } from 'react'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { Vector2, Vector3, Mesh, MeshStandardMaterial, DoubleSide, Raycaster } from 'three'
import { useModelStore } from '../../store/modelStore'
import { planePoseFromHit } from '../../lib/planePose'
import { buildSolidMeshes, disposeSolidMeshes } from '../../lib/solidModel'

interface HoverPreview {
  position: [number, number, number]
  rotation: [number, number, number]
}

const noopRaycast: () => void = () => {}

function SolidMesh({
  solidMesh,
  onHover,
  onHoverOut,
}: {
  solidMesh: Mesh
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
      meshRef.current.material = new MeshStandardMaterial({ color: 0x4477bb, transparent: true, opacity: 0.82, side: DoubleSide })
    }
  }, [solidMesh])

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

export function ExtrudedSolids() {
  const { extrudes, sketches } = useModelStore()
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null)
  const solids = useMemo(() => buildSolidMeshes(extrudes, sketches), [extrudes, sketches])

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

  return (
    <>
      {solids.map((mesh) => (
        <SolidMesh key={mesh.uuid} solidMesh={mesh} onHover={handleHover} onHoverOut={clearHover} />
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
