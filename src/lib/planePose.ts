import { Euler, Quaternion, Vector3 } from 'three'
import { PRESET_PLANE_ROTATION, PlaneId, SketchPlanePose } from '../store/modelStore'

const Z_AXIS = new Vector3(0, 0, 1)

function angularDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

export function planeNormalFromPose(pose: SketchPlanePose): Vector3 {
  return Z_AXIS.clone().applyEuler(new Euler(...pose.rotation, 'XYZ')).normalize()
}

export function planeOriginFromPose(pose: SketchPlanePose): Vector3 {
  return planeNormalFromPose(pose).multiplyScalar(pose.offset)
}

export function planePoseFromHit(normal: Vector3, point: Vector3): SketchPlanePose {
  const n = normal.clone().normalize()
  const q = new Quaternion().setFromUnitVectors(Z_AXIS, n)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return {
    rotation: [e.x, e.y, e.z],
    offset: n.dot(point),
  }
}

export function planeIdFromPose(pose: SketchPlanePose, eps = 1e-3): PlaneId | 'Custom' {
  const [x, y, z] = pose.rotation
  for (const id of Object.keys(PRESET_PLANE_ROTATION) as PlaneId[]) {
    const [px, py, pz] = PRESET_PLANE_ROTATION[id]
    if (angularDiff(x, px) < eps && angularDiff(y, py) < eps && angularDiff(z, pz) < eps) {
      return id
    }
  }
  return 'Custom'
}
