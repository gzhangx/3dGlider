import { Mesh, BufferGeometry, ExtrudeGeometry, Matrix4, Euler, Vector3, Quaternion, Shape } from 'three'
import { CSG } from 'three-csg-ts'
import { ExtrudeFeature, ShellFeature, Sketch } from '../store/modelStore'
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

interface FeatureGeometryOptions {
  profileInset?: number
  axialShift?: number
}

function profileBounds(shapes: Shape[]) {
  const points = shapes.flatMap((shape) => shape.extractPoints(12).shape)
  if (points.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

function featureGeometry(ext: ExtrudeFeature, sketch: Sketch, options: FeatureGeometryOptions = {}): BufferGeometry | null {
  const shapes = sketchElementsToShape(sketch.elements)
  if (shapes.length === 0) return null

  const depth = Math.abs(ext.depth)
  const geo = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false })
  if (options.profileInset) {
    const bounds = profileBounds(shapes)
    if (!bounds) { geo.dispose(); return null }
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY
    if (width <= options.profileInset * 2 || height <= options.profileInset * 2) {
      geo.dispose()
      return null
    }
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    geo.translate(-cx, -cy, 0)
    geo.scale((width - options.profileInset * 2) / width, (height - options.profileInset * 2) / height, 1)
    geo.translate(cx, cy, 0)
  }
  if (ext.symmetric) {
    // Center geometry on the sketch plane: shift back by half depth.
    geo.translate(0, 0, -depth / 2)
  } else if (ext.depth < 0) {
    // ExtrudeGeometry grows along local +Z. Shift negative features back so the
    // sketch plane remains the reference face and the solid extends the other way.
    geo.translate(0, 0, -depth)
  }
  if (options.axialShift) geo.translate(0, 0, options.axialShift)
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
        // CSG.subtract returns a brand-new Mesh — carry the originating
        // feature id forward so callers can key off it instead of array
        // index (which shifts whenever an earlier extrude is skipped).
        next.userData = solids[i].userData
        solids[i].geometry.dispose()
        solids[i] = next
      }
      featGeo.dispose()
      continue
    }

    featMesh.userData.featureId = ext.id
    solids.push(featMesh)
  }

  return solids
}

/** Apply shell cuts after the ordered extrusion/boolean feature history. */
export function applyShellFeatures(
  solids: Mesh[],
  shells: ShellFeature[],
  extrudes: ExtrudeFeature[],
  sketches: Sketch[],
): Mesh[] {
  for (const shell of shells) {
    const source = [...extrudes].reverse().find((ext) => ext.sketchId === shell.sketchId && ext.operation === 'add')
    const sketch = sketches.find((item) => item.id === shell.sketchId)
    if (!source || !sketch || shell.thickness <= 0 || shell.thickness >= Math.abs(source.depth)) continue

    const directionSign = source.symmetric || source.depth > 0 ? 1 : -1
    const innerGeometry = featureGeometry(source, sketch, {
      profileInset: shell.thickness,
      axialShift: directionSign * shell.thickness,
    })
    if (!innerGeometry) continue
    const tool = new Mesh(innerGeometry)

    for (let i = 0; i < solids.length; i++) {
      const next = CSG.subtract(solids[i], tool)
      next.geometry.computeVertexNormals()
      next.geometry.computeBoundingBox()
      next.geometry.computeBoundingSphere()
      next.userData = solids[i].userData
      solids[i].geometry.dispose()
      solids[i] = next
    }
    innerGeometry.dispose()
  }
  return solids
}

export function buildModelSolidMeshes(
  extrudes: ExtrudeFeature[],
  shells: ShellFeature[],
  sketches: Sketch[],
): Mesh[] {
  return applyShellFeatures(buildSolidMeshes(extrudes, sketches), shells, extrudes, sketches)
}

export function buildPreviewGeometry(extrude: ExtrudeFeature, sketches: Sketch[]): BufferGeometry | null {
  const sketch = sketches.find((s) => s.id === extrude.sketchId)
  if (!sketch) return null
  return featureGeometry(extrude, sketch)
}

export function buildCutGeometries(extrudes: ExtrudeFeature[], sketches: Sketch[]): BufferGeometry[] {
  return extrudes
    .filter((e) => e.operation === 'cut')
    .flatMap((e) => {
      const sketch = sketches.find((s) => s.id === e.sketchId)
      if (!sketch) return []
      const geo = featureGeometry(e, sketch)
      if (!geo) return []
      // Skipped cut extrudes (missing/empty sketch) shift array indices —
      // tag with the originating feature id so callers don't have to zip by index.
      geo.userData.featureId = e.id
      return [geo]
    })
}

export function disposeSolidMeshes(meshes: Mesh[]) {
  for (const mesh of meshes) {
    mesh.geometry.dispose()
  }
}
