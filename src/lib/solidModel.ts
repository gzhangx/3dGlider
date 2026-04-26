import { Mesh, BufferGeometry, ExtrudeGeometry, Matrix4, Euler } from 'three'
import { CSG } from 'three-csg-ts'
import { ExtrudeFeature, Sketch } from '../store/modelStore'
import { sketchElementsToShape, EXTRUDE_ROTATION } from './sketchToShape'

function planeOffsetPosition(plane: Sketch['plane'], offset: number): [number, number, number] {
  if (plane === 'XY') return [0, 0, offset]
  if (plane === 'XZ') return [0, offset, 0]
  return [offset, 0, 0]
}

function bakeGeometry(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = geometry.clone()
  g.applyMatrix4(matrix)
  return g
}

function featureGeometry(ext: ExtrudeFeature, sketch: Sketch): BufferGeometry | null {
  const shapes = sketchElementsToShape(sketch.elements, sketch.plane)
  if (shapes.length === 0) return null

  const geo = new ExtrudeGeometry(shapes, { depth: Math.abs(ext.depth), bevelEnabled: false })
  const [rx, ry, rz] = EXTRUDE_ROTATION[sketch.plane]
  const [px, py, pz] = planeOffsetPosition(sketch.plane, sketch.offset)
  const m = new Matrix4()
  m.makeRotationFromEuler(new Euler(rx, ry, rz, 'XYZ'))
  m.setPosition(px, py, pz)
  const baked = bakeGeometry(geo, m)
  geo.dispose()
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
