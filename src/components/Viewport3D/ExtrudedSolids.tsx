import { useMemo, useEffect } from 'react'
import { ThreeEvent } from '@react-three/fiber'
import { Vector3, BufferGeometry } from 'three'
import { DoubleSide } from 'three'
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

function SolidMesh({ geometry }: { geometry: BufferGeometry }) {
  const { mode, newSketchArmed, startNewSketch } = useModelStore()
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'view' || !newSketchArmed || !e.face) return
    e.stopPropagation()
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    if (!isFlatPrincipalFace(worldNormal)) return
    const plane = normalToPlane(worldNormal)
    startNewSketch(plane, offsetForPlane(plane, e.point))
  }

  return (
    <mesh geometry={geometry} onClick={onClick}>
      <meshStandardMaterial color="#4477bb" transparent opacity={0.82} side={DoubleSide} />
    </mesh>
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
        <SolidMesh key={mesh.uuid} geometry={mesh.geometry} />
      ))}
    </>
  )
}
