import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

const origin = new Vector3()
const direction = new Vector3()

export function worldUnitsPerPixel(
  camera: { position: Vector3; fov?: number; getWorldDirection: (target: Vector3) => Vector3 },
  viewportHeight: number,
  planeOrigin: { x: number; y: number; z: number },
): number {
  origin.set(planeOrigin.x, planeOrigin.y, planeOrigin.z)
  camera.getWorldDirection(direction)
  const distance = Math.abs(direction.dot(origin.sub(camera.position))) || 1
  const fov = ((camera.fov ?? 50) * Math.PI) / 180
  return (2 * distance * Math.tan(fov / 2)) / Math.max(viewportHeight, 1)
}

/** World size of one screen pixel at the sketch plane. Updates when the view zooms. */
export function useWorldPerPixel(planeOrigin: { x: number; y: number; z: number }): number {
  const { camera, size } = useThree()
  const originRef = useRef(planeOrigin)
  originRef.current = planeOrigin
  const [value, setValue] = useState(() => worldUnitsPerPixel(camera, size.height, planeOrigin))

  useFrame(() => {
    const next = worldUnitsPerPixel(camera, size.height, originRef.current)
    setValue((prev) => (prev > 0 && Math.abs(next - prev) / prev < 0.1 ? prev : next))
  })

  return value
}
