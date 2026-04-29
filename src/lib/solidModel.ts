import { Mesh, BufferGeometry, ExtrudeGeometry, Matrix4, Euler, Vector3, Quaternion } from 'three'
import { CSG } from 'three-csg-ts'
import { ExtrudeFeature, Sketch } from '../store/modelStore'
import { sketchElementsToShape } from './sketchToShape'

function planeOffsetPosition(rotation: [number, number, number], offset: number): [number, number, number] {
  const n = new Vector3(0, 0, 1).applyEuler(new Euler(...rotation, 'XYZ')).normalize().multiplyScalar(offset)
  return [n.x, n.y, n.z]
}

function bakeGeometry(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = geometry.clone()
  g.applyMatrix4(matrix)
  return g
}

function featureGeometry(ext: ExtrudeFeature, sketch: Sketch): BufferGeometry | null {
  const shapes = sketchElementsToShape(sketch.elements)
  if (shapes.length === 0) return null

  const depth = Math.abs(ext.depth)
  const geo = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false })
  if (ext.depth < 0) {
    // ExtrudeGeometry grows along local +Z. Shift negative features back so the
    // sketch plane remains the reference face and the solid extends the other way.
    geo.translate(0, 0, -depth)
  }
  const [rx, ry, rz] = sketch.plane.rotation
  const [px, py, pz] = planeOffsetPosition(sketch.plane.rotation, sketch.plane.offset)
  const m = new Matrix4()
  m.makeRotationFromEuler(new Euler(rx, ry, rz, 'XYZ'))
  m.setPosition(px, py, pz)
  const baked = bakeGeometry(geo, m)
  geo.dispose()

  // Redirect extrusion: rotate solid around the plane's world-space origin so the
  // extrusion axis points along `direction` instead of the plane normal.
  if (ext.direction) {
    const dir = new Vector3(...ext.direction)
    if (dir.length() > 1e-6) {
      dir.normalize()
      const planeNormal = new Vector3(0, 0, 1).applyEuler(new Euler(rx, ry, rz, 'XYZ')).normalize()
      if (1 - Math.abs(planeNormal.dot(dir)) > 1e-6) {
        const q = new Quaternion().setFromUnitVectors(planeNormal, dir)
        const rotM = new Matrix4().makeRotationFromQuaternion(q)
        const toOrigin = new Matrix4().makeTranslation(-px, -py, -pz)
        const fromOrigin = new Matrix4().makeTranslation(px, py, pz)
        baked.applyMatrix4(fromOrigin.multiply(rotM).multiply(toOrigin))
      }
    }
  }

  baked.computeVertexNormals()
  baked.computeBoundingBox()
  baked.computeBoundingSphere()
  return baked
}

/**
 * Build final solid meshes by applying features in order:
 * - add: append new positive volume
 * - cut: subtract volume from all current solids (pocket behavior)
 */
export function buildSolidMeshes(extrudes: ExtrudeFeature[], sketches: Sketch[]): Mesh[] {
  const solids: Mesh[] = []

  for (const ext of extrudes) {
    const sketch = sketches.find((s) => s.id === ext.sketchId)
    if (!sketch) continue

    const featGeo = featureGeometry(ext, sketch)
    if (!featGeo) continue
    const featMesh = new Mesh(featGeo)

    if (ext.operation === 'cut') {
      if (solids.length === 0) {
        featGeo.dispose()
        continue
      }

      for (let i = 0; i < solids.length; i++) {
        const next = CSG.subtract(solids[i], featMesh)
        next.geometry.computeVertexNormals()
        next.geometry.computeBoundingBox()
        next.geometry.computeBoundingSphere()
        solids[i].geometry.dispose()
        solids[i] = next
      }
      featGeo.dispose()
      continue
    }

    solids.push(featMesh)
  }

  return solids
}

export function disposeSolidMeshes(meshes: Mesh[]) {
  for (const mesh of meshes) {
    mesh.geometry.dispose()
  }
}
