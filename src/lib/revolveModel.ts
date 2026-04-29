import { BufferGeometry, Euler, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3 } from 'three'
import { RevolveFeature, RevolveAxis, Sketch, SketchLine } from '../store/modelStore'
import { sketchElementsToShape } from './sketchToShape'

function planeOriginWorld(rotation: [number, number, number], offset: number): Vector3 {
  return new Vector3(0, 0, 1)
    .applyEuler(new Euler(...rotation, 'XYZ'))
    .normalize()
    .multiplyScalar(offset)
}

function axisParams(
  axisType: RevolveAxis,
  axisElementId: string | undefined,
  sketch: Sketch,
): { dir: Vector3; origin: Vector3 } | null {
  if (axisType === 'x') return { dir: new Vector3(1, 0, 0), origin: new Vector3() }
  if (axisType === 'y') return { dir: new Vector3(0, 1, 0), origin: new Vector3() }
  if (axisType === 'z') return { dir: new Vector3(0, 0, 1), origin: new Vector3() }

  // axisType === 'element'
  if (!axisElementId) return null
  const el = sketch.elements.find((e) => e.id === axisElementId && e.type === 'line') as SketchLine | undefined
  if (!el) return null

  const euler = new Euler(...sketch.plane.rotation, 'XYZ')
  const offset = planeOriginWorld(sketch.plane.rotation, sketch.plane.offset)
  const toWorld = (p: { x: number; y: number }) =>
    new Vector3(p.x, p.y, 0).applyEuler(euler).add(offset)

  const worldStart = toWorld(el.start)
  const worldEnd = toWorld(el.end)
  const dir = worldEnd.clone().sub(worldStart)
  if (dir.length() < 1e-8) return null
  dir.normalize()
  return { dir, origin: worldStart }
}

export function buildRevolveGeometry(revolve: RevolveFeature, sketches: Sketch[]): BufferGeometry | null {
  const sketch = sketches.find((s) => s.id === revolve.sketchId)
  if (!sketch) return null

  const shapes = sketchElementsToShape(sketch.elements)
  if (shapes.length === 0) return null

  const params = axisParams(revolve.axisType, revolve.axisElementId, sketch)
  if (!params) return null
  const { dir: axisDir, origin: axisOrigin } = params

  // Convert 2D shape outline to 3D world points
  const euler = new Euler(...sketch.plane.rotation, 'XYZ')
  const planeOffset = planeOriginWorld(sketch.plane.rotation, sketch.plane.offset)
  const pts2D = shapes[0].getPoints(64)
  const worldPts = pts2D.map((p) =>
    new Vector3(p.x, p.y, 0).applyEuler(euler).add(planeOffset),
  )

  // Project each world point to (radius, height) in the axis coordinate system
  const lathePoints = worldPts.map((p) => {
    const rel = p.clone().sub(axisOrigin)
    const height = rel.dot(axisDir)
    const radial = rel.clone().sub(axisDir.clone().multiplyScalar(height))
    return new Vector2(Math.abs(radial.length()), height)
  })

  // Deduplicate consecutive identical points (LatheGeometry can misbehave with them)
  const clean: Vector2[] = [lathePoints[0]]
  for (let i = 1; i < lathePoints.length; i++) {
    const prev = clean[clean.length - 1]
    if (Math.abs(lathePoints[i].x - prev.x) > 1e-8 || Math.abs(lathePoints[i].y - prev.y) > 1e-8) {
      clean.push(lathePoints[i])
    }
  }
  if (clean.length < 2) return null

  const angleRad = Math.max(0.01, Math.min(Math.PI * 2, (revolve.angle / 180) * Math.PI))
  const geo = new LatheGeometry(clean, 64, 0, angleRad)

  // Rotate geometry so its local Y axis aligns with the world axis direction
  const Y = new Vector3(0, 1, 0)
  if (axisDir.distanceTo(Y) > 1e-6) {
    const q = new Quaternion().setFromUnitVectors(Y, axisDir)
    geo.applyMatrix4(new Matrix4().makeRotationFromQuaternion(q))
  }

  // Translate to place the axis at axisOrigin
  geo.translate(axisOrigin.x, axisOrigin.y, axisOrigin.z)

  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}
