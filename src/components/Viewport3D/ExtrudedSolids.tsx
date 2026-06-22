import { useMemo, useEffect, useRef, useState } from 'react'
import { ThreeEvent } from '@react-three/fiber'
import { Vector3, Mesh, BufferGeometry, DoubleSide } from 'three'
import { useModelStore } from '../../store/modelStore'
import { useShallow } from 'zustand/react/shallow'
import { planePoseFromHit } from '../../lib/planePose'
import { buildModelSolidMeshes, buildCutGeometries, buildPreviewGeometry, disposeSolidMeshes } from '../../lib/solidModel'

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
  const { mode, newSketchArmed, startNewSketch } = useModelStore(useShallow((state) => ({
    mode: state.mode,
    newSketchArmed: state.newSketchArmed,
    startNewSketch: state.startNewSketch,
  })))

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'view' || !newSketchArmed || !e.face) return
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    onHover(e.point.clone(), worldNormal)
  }

  const onPointerOut = () => {
    onHoverOut()
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'view' || !newSketchArmed || !e.face) return
    e.stopPropagation()
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
    startNewSketch(planePoseFromHit(worldNormal, e.point))
  }

  return (
    <mesh geometry={solidMesh.geometry} onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} side={DoubleSide} />
    </mesh>
  )
}

function CutVolumeMesh({ geo, color, opacity }: { geo: BufferGeometry; color: string; opacity: number }) {
  const meshRef = useRef<Mesh>(null)
  useEffect(() => {
    if (meshRef.current) meshRef.current.geometry = geo
  }, [geo])
  return (
    <mesh ref={meshRef} raycast={noopRaycast} renderOrder={1000}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function PreviewMesh({ geo, operation }: { geo: BufferGeometry; operation: 'add' | 'cut' }) {
  const meshRef = useRef<Mesh>(null)
  useEffect(() => {
    if (meshRef.current) meshRef.current.geometry = geo
  }, [geo])
  const color = operation === 'cut' ? '#ff4422' : '#88aaff'
  const opacity = operation === 'cut' ? 0.28 : 0.38
  return (
    <mesh ref={meshRef} raycast={noopRaycast} renderOrder={1000}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

export function ExtrudedSolids() {
  const { extrudes, shells, sketches, editingExtrudeId, previewExtrude } = useModelStore(useShallow((state) => ({
    extrudes: state.extrudes,
    shells: state.shells,
    sketches: state.sketches,
    editingExtrudeId: state.editingExtrudeId,
    previewExtrude: state.previewExtrude,
  })))
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null)

  const addExtrudes = useMemo(() => extrudes.filter((e) => e.operation === 'add'), [extrudes])
  const cutExtrudes = useMemo(() => extrudes.filter((e) => e.operation === 'cut'), [extrudes])
  const solids = useMemo(() => buildModelSolidMeshes(extrudes, shells, sketches), [extrudes, shells, sketches])
  const cutGeos = useMemo(() => buildCutGeometries(extrudes, sketches), [extrudes, sketches])
  const previewGeo = useMemo(
    () => previewExtrude ? buildPreviewGeometry(previewExtrude, sketches) : null,
    [previewExtrude, sketches],
  )

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

  useEffect(() => {
    return () => { previewGeo?.dispose() }
  }, [previewGeo])

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
      {cutGeos.map((geo, i) => {
        if (cutExtrudes[i]?.id !== editingExtrudeId) return null
        return (
          <CutVolumeMesh
            key={geo.uuid}
            geo={geo}
            color={cutExtrudes[i]?.color ?? '#ff4422'}
            opacity={cutExtrudes[i]?.opacity ?? 0.22}
          />
        )
      })}
      {previewGeo && previewExtrude && (
        <PreviewMesh geo={previewGeo} operation={previewExtrude.operation} />
      )}
      {hoverPreview && (
        <mesh position={hoverPreview.position} rotation={hoverPreview.rotation} raycast={noopRaycast} renderOrder={1000}>
          <planeGeometry args={[2.5, 2.5]} />
          <meshBasicMaterial color="#ffe866" transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
