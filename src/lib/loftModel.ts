import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import { LoftFeature, Sketch } from '../store/modelStore'
import { sketchElementsToShape } from './sketchToShape'
import { planeOriginFromPose } from './planePose'

function planeOffsetPosition(rotation: [number, number, number], offset: number): [number, number, number] {
  const n = planeOriginFromPose({ rotation, offset })
  return [n.x, n.y, n.z]
}

function planeMatrix(sketch: Sketch): Matrix4 {
  const [rx, ry, rz] = sketch.plane.rotation
  const [px, py, pz] = planeOffsetPosition(sketch.plane.rotation, sketch.plane.offset)
  return new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz, 'XYZ')).setPosition(px, py, pz)
}

function signedArea(points: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return area * 0.5
}

function pickPrimaryShape(sketch: Sketch) {
  const shapes = sketchElementsToShape(sketch.elements)
  if (shapes.length === 0) return null

  // Use the largest profile when multiple closed regions exist.
  let best = shapes[0]
  let bestArea = Math.abs(signedArea(best.getPoints(48)))
  for (let i = 1; i < shapes.length; i++) {
    const area = Math.abs(signedArea(shapes[i].getPoints(48)))
    if (area > bestArea) {
      best = shapes[i]
      bestArea = area
    }
  }
  return best
}

export function buildLoftGeometry(loft: LoftFeature, sketches: Sketch[]): BufferGeometry | null {
  const sketch1 = sketches.find((s) => s.id === loft.sketchId1)
  const sketch2 = sketches.find((s) => s.id === loft.sketchId2)
  if (!sketch1 || !sketch2) return null

  const shape1 = pickPrimaryShape(sketch1)
  const shape2 = pickPrimaryShape(sketch2)
  if (!shape1 || !shape2) return null

  const divisions = 96
  let ring1 = shape1.getSpacedPoints(divisions)
  let ring2 = shape2.getSpacedPoints(divisions)

  // Remove duplicated closing point returned by getSpacedPoints.
  if (ring1.length > 1) ring1 = ring1.slice(0, -1)
  if (ring2.length > 1) ring2 = ring2.slice(0, -1)
  if (ring1.length < 3 || ring2.length < 3 || ring1.length !== ring2.length) return null

  // Keep both rings in the same winding direction to avoid twisted side walls.
  if (signedArea(ring1) * signedArea(ring2) < 0) {
    ring2 = [...ring2].reverse()
  }

  const m1 = planeMatrix(sketch1)
  const m2 = planeMatrix(sketch2)

  const positions: number[] = []
  const indices: number[] = []
  const n = ring1.length

  const p = new Vector3()
  for (let i = 0; i < n; i++) {
    p.set(ring1[i].x, ring1[i].y, 0).applyMatrix4(m1)
    positions.push(p.x, p.y, p.z)
  }
  for (let i = 0; i < n; i++) {
    p.set(ring2[i].x, ring2[i].y, 0).applyMatrix4(m2)
    positions.push(p.x, p.y, p.z)
  }

  // Bridge profile loops.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = i
    const b = j
    const c = n + j
    const d = n + i
    indices.push(a, b, c)
    indices.push(a, c, d)
  }

  const center1 = new Vector3()
  const center2 = new Vector3()
  for (let i = 0; i < n; i++) {
    center1.add(new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]))
    const k = (n + i) * 3
    center2.add(new Vector3(positions[k], positions[k + 1], positions[k + 2]))
  }
  center1.multiplyScalar(1 / n)
  center2.multiplyScalar(1 / n)

  const center1Index = positions.length / 3
  positions.push(center1.x, center1.y, center1.z)
  const center2Index = positions.length / 3
  positions.push(center2.x, center2.y, center2.z)

  // End caps.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    indices.push(center1Index, j, i)
    indices.push(center2Index, n + i, n + j)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}