import { Group, Mesh } from 'three'
import { ExtrudeFeature, LoftFeature, RevolveFeature, ShellFeature, Sketch, SweepFeature } from '../store/modelStore'
import { buildModelSolidMeshes, disposeSolidMeshes } from './solidModel'
import { buildRevolveGeometry } from './revolveModel'
import { buildLoftGeometry } from './loftModel'
import { buildSweepGeometry } from './sweepModel'
import { SCENE_TO_MM } from './units'

export function exportSTEP(extrudes: ExtrudeFeature[], revolves: RevolveFeature[], lofts: LoftFeature[], sweeps: SweepFeature[], shells: ShellFeature[], sketches: Sketch[]) {
  if (extrudes.length === 0 && revolves.length === 0 && lofts.length === 0 && sweeps.length === 0) return

  const group = new Group()
  const solids = buildModelSolidMeshes(extrudes, shells, sketches)

  for (const solid of solids) {
    group.add(new Mesh(solid.geometry))
  }

  const revolveGeos = revolves.map((r) => buildRevolveGeometry(r, sketches)).filter(Boolean)
  for (const geo of revolveGeos) {
    group.add(new Mesh(geo!))
  }

  const loftGeos = lofts.map((l) => buildLoftGeometry(l, sketches)).filter(Boolean)
  for (const geo of loftGeos) {
    group.add(new Mesh(geo!))
  }

  const sweepGeos = sweeps.map((s) => buildSweepGeometry(s, sketches)).filter(Boolean)
  for (const geo of sweepGeos) {
    group.add(new Mesh(geo!))
  }

  // Scale scene units → mm so CAD apps import at the correct size.
  group.scale.set(SCENE_TO_MM, SCENE_TO_MM, SCENE_TO_MM)
  group.updateMatrixWorld(true)

  const stepContent = generateSTEPContent(group)

  const blob = new Blob([stepContent], { type: 'application/step' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '3dglider_model.step'
  a.click()
  URL.revokeObjectURL(url)

  // Dispose temporary geometry
  disposeSolidMeshes(solids)
  revolveGeos.forEach((g) => g?.dispose())
  loftGeos.forEach((g) => g?.dispose())
  sweepGeos.forEach((g) => g?.dispose())
}

function num(n: number): string {
  if (!Number.isFinite(n)) return '0.'
  const s = n.toFixed(6)
  return s.includes('.') ? s : `${s}.`
}

/**
 * Writes a minimal but spec-valid ISO-10303-21 (STEP) AP214 file, representing
 * each triangle as a planar FACE_SURFACE bounded by a POLY_LOOP. This is the
 * standard "faceted BREP" pattern for exporting mesh geometry as STEP — it
 * avoids EDGE_CURVE/parametric-curve entities entirely, which triangle-soup
 * data cannot legitimately supply.
 */
function generateSTEPContent(group: Group): string {
  const lines: string[] = []
  const emit = (s: string) => lines.push(s)

  let nextId = 1
  const newId = () => nextId++

  const cartesianPoint = (x: number, y: number, z: number): number => {
    const id = newId()
    emit(`#${id} = CARTESIAN_POINT('', (${num(x)}, ${num(y)}, ${num(z)}));`)
    return id
  }
  const direction = (x: number, y: number, z: number): number => {
    const id = newId()
    emit(`#${id} = DIRECTION('', (${num(x)}, ${num(y)}, ${num(z)}));`)
    return id
  }

  type Vec3 = [number, number, number]
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
  const length = (a: Vec3): number => Math.sqrt(dot(a, a))
  const normalize = (a: Vec3): Vec3 => {
    const l = length(a)
    return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]
  }

  // A face's local X axis just needs to be non-parallel to its normal —
  // pick whichever world axis is least aligned with the normal, then
  // project it into the plane.
  const referenceDirectionFor = (normal: Vec3): Vec3 => {
    const candidate: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    const projected = sub(candidate, scale(normal, dot(candidate, normal)))
    return normalize(projected)
  }

  const pointCache = new Map<string, number>()
  const cachedCartesianPoint = (p: Vec3): number => {
    const key = `${num(p[0])},${num(p[1])},${num(p[2])}`
    const cached = pointCache.get(key)
    if (cached !== undefined) return cached
    const id = cartesianPoint(...p)
    pointCache.set(key, id)
    return id
  }

  const faceFromTriangle = (p1: Vec3, p2: Vec3, p3: Vec3): number | null => {
    const normal = normalize(cross(sub(p2, p1), sub(p3, p1)))
    if (length(normal) < 1e-9) return null

    const v1 = cachedCartesianPoint(p1)
    const v2 = cachedCartesianPoint(p2)
    const v3 = cachedCartesianPoint(p3)
    const loopId = newId()
    emit(`#${loopId} = POLY_LOOP('', (#${v1}, #${v2}, #${v3}));`)
    const boundId = newId()
    emit(`#${boundId} = FACE_OUTER_BOUND('', #${loopId}, .T.);`)

    const locationId = v1
    const axisId = direction(...normal)
    const refDirId = direction(...referenceDirectionFor(normal))
    const placementId = newId()
    emit(`#${placementId} = AXIS2_PLACEMENT_3D('', #${locationId}, #${axisId}, #${refDirId});`)
    const planeId = newId()
    emit(`#${planeId} = PLANE('', #${placementId});`)

    const faceId = newId()
    emit(`#${faceId} = FACE_SURFACE('', (#${boundId}), #${planeId}, .T.);`)
    return faceId
  }

  const solidIds: number[] = []
  group.traverse((obj) => {
    if (!(obj instanceof Mesh) || !obj.geometry) return
    const positions = obj.geometry.getAttribute('position')?.array
    const indices = obj.geometry.index?.array
    if (!positions || !indices) return

    const pointAt = (vertexIndex: number): Vec3 => [
      positions[vertexIndex * 3],
      positions[vertexIndex * 3 + 1],
      positions[vertexIndex * 3 + 2],
    ]

    const faceIds: number[] = []
    for (let i = 0; i < indices.length; i += 3) {
      const faceId = faceFromTriangle(pointAt(indices[i]), pointAt(indices[i + 1]), pointAt(indices[i + 2]))
      if (faceId !== null) faceIds.push(faceId)
    }
    if (faceIds.length === 0) return

    const shellId = newId()
    emit(`#${shellId} = CLOSED_SHELL('', (${faceIds.map((id) => `#${id}`).join(', ')}));`)
    const solidId = newId()
    emit(`#${solidId} = MANIFOLD_SOLID_BREP('Solid', #${shellId});`)
    solidIds.push(solidId)
  })

  const appContextId = newId()
  emit(`#${appContextId} = APPLICATION_CONTEXT('automotive design');`)
  const productContextId = newId()
  emit(`#${productContextId} = PRODUCT_CONTEXT('', #${appContextId}, 'mechanical');`)
  const productId = newId()
  emit(`#${productId} = PRODUCT('3dGlider Model', '3dGlider Model', '', (#${productContextId}));`)
  const productFormationId = newId()
  emit(`#${productFormationId} = PRODUCT_DEFINITION_FORMATION('', '', #${productId});`)
  const productDefinitionContextId = newId()
  emit(`#${productDefinitionContextId} = PRODUCT_DEFINITION_CONTEXT('part definition', #${appContextId}, 'design');`)
  const productDefinitionId = newId()
  emit(`#${productDefinitionId} = PRODUCT_DEFINITION('design', '', #${productFormationId}, #${productDefinitionContextId});`)
  const productDefinitionShapeId = newId()
  emit(`#${productDefinitionShapeId} = PRODUCT_DEFINITION_SHAPE('', '', #${productDefinitionId});`)

  const lengthUnitId = newId()
  emit(`#${lengthUnitId} = ( LENGTH_UNIT ( ) NAMED_UNIT ( * ) SI_UNIT ( .MILLI., .METRE. ) );`)
  const angleUnitId = newId()
  emit(`#${angleUnitId} = ( NAMED_UNIT ( * ) PLANE_ANGLE_UNIT ( ) SI_UNIT ( $, .RADIAN. ) );`)
  const solidAngleUnitId = newId()
  emit(`#${solidAngleUnitId} = ( NAMED_UNIT ( * ) SI_UNIT ( $, .STERADIAN. ) SOLID_ANGLE_UNIT ( ) );`)
  const uncertaintyId = newId()
  emit(`#${uncertaintyId} = UNCERTAINTY_MEASURE_WITH_UNIT (LENGTH_MEASURE(1.0E-6), #${lengthUnitId}, 'distance_accuracy_value', 'confusion accuracy');`)
  const geometricContextId = newId()
  emit(`#${geometricContextId} = ( GEOMETRIC_REPRESENTATION_CONTEXT ( 3 ) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT ( (#${uncertaintyId}) ) GLOBAL_UNIT_ASSIGNED_CONTEXT ( (#${lengthUnitId}, #${angleUnitId}, #${solidAngleUnitId}) ) REPRESENTATION_CONTEXT ( '3dGlider Model', '3D' ) );`)

  const shapeRepresentationId = newId()
  emit(`#${shapeRepresentationId} = ADVANCED_BREP_SHAPE_REPRESENTATION('', (${solidIds.map((id) => `#${id}`).join(', ')}), #${geometricContextId});`)
  const shapeDefinitionId = newId()
  emit(`#${shapeDefinitionId} = SHAPE_DEFINITION_REPRESENTATION(#${productDefinitionShapeId}, #${shapeRepresentationId});`)

  const timestamp = new Date().toISOString().slice(0, 19)

  const header = [
    `ISO-10303-21;`,
    `HEADER;`,
    `FILE_DESCRIPTION(('3D Glider Model'), '2;1');`,
    `FILE_NAME('3dglider_model.step', '${timestamp}', ('Author'), ('Organization'), '3dGlider', '3dGlider', '');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`,
    `ENDSEC;`,
    `DATA;`,
  ]
  const footer = [`ENDSEC;`, `END-ISO-10303-21;`]

  return [...header, ...lines, ...footer].join('\n') + '\n'
}
