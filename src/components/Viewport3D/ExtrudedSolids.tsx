import { useMemo, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector3, Vector2, Mesh, MeshStandardMaterial, DoubleSide, Raycaster } from 'three'
import { useModelStore, PlaneId } from '../../store/modelStore'
import { buildSolidMeshes, disposeSolidMeshes } from '../../lib/solidModel'

function normalToPlane(normal: Vector3): PlaneId {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  if (az >= ax && az >= ay) return 'XY'
  if (ay >= ax && ay >= az) return 'XZ'
  return 'YZ'
}

function isFlatPrincipalFace(normal: Vector3, threshold = 0.9): boolean {
  const n = normal.clone().normalize()
  const maxComp = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))
  return maxComp >= threshold
}

function offsetForPlane(plane: PlaneId, point: { x: number; y: number; z: number }): number {
  if (plane === 'XY') return point.z
  if (plane === 'XZ') return point.y
  return point.x
}

function SolidMesh({ solidMesh }: { solidMesh: Mesh }) {
  const { mode, newSketchArmed, startNewSketch } = useModelStore()
  const { camera } = useThree()
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
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

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
          if (!isFlatPrincipalFace(worldNormal)) return
          const plane = normalToPlane(worldNormal)
          startNewSketch(plane, offsetForPlane(plane, intersection.point))
        }
      }
    }

    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [mode, newSketchArmed, camera, startNewSketch])

  return (
    <mesh ref={meshRef} />
  )
}

export function ExtrudedSolids() {
  const { extrudes, sketches } = useModelStore()
  const solids = useMemo(() => buildSolidMeshes(extrudes, sketches), [extrudes, sketches])

  useEffect(() => {
    return () => disposeSolidMeshes(solids)
  }, [solids])

  return (
    <>
      {solids.map((mesh) => (
        <SolidMesh key={mesh.uuid} solidMesh={mesh} />
      ))}
    </>
  )
}
