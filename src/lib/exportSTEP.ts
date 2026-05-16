import { Group, Mesh } from 'three'
import { ExtrudeFeature, LoftFeature, RevolveFeature, Sketch, SweepFeature } from '../store/modelStore'
import { buildSolidMeshes, disposeSolidMeshes } from './solidModel'
import { buildRevolveGeometry } from './revolveModel'
import { buildLoftGeometry } from './loftModel'
import { buildSweepGeometry } from './sweepModel'
import { SCENE_TO_MM } from './units'

export function exportSTEP(extrudes: ExtrudeFeature[], revolves: RevolveFeature[], lofts: LoftFeature[], sweeps: SweepFeature[], sketches: Sketch[]) {
  if (extrudes.length === 0 && revolves.length === 0 && lofts.length === 0 && sweeps.length === 0) return

  const group = new Group()
  const solids = buildSolidMeshes(extrudes, sketches)

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

  // Generate STEP ASCII format from the geometry
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

function generateSTEPContent(group: Group): string {
  const iso = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)

  let stepFile = ''
  stepFile += `ISO-10303-21;\n`
  stepFile += `HEADER;\n`
  stepFile += `FILE_DESCRIPTION(('3D Glider Model'),\n`
  stepFile += `  '2;1');\n`
  stepFile += `FILE_NAME('3dglider_model.step',\n`
  stepFile += `  ${iso},\n`
  stepFile += `  ('Author'),\n`
  stepFile += `  ('Organization'),\n`
  stepFile += `  'Open CASCADE STEP processor 7.4',\n`
  stepFile += `  'Open CASCADE STEP processor 7.4',\n`
  stepFile += `  '');\n`
  stepFile += `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 0 0 10303 214 1 1 1 1 }'));\n`
  stepFile += `ENDSEC;\n`
  stepFile += `DATA;\n`

  let vertexMap = new Map<string, number>()
  let geometries: { positions: Float32Array; indices: Uint32Array | Uint16Array }[] = []

  // Collect all geometry data
  group.traverse((obj) => {
    if (obj instanceof Mesh && obj.geometry) {
      const positions = obj.geometry.getAttribute('position')?.array
      const indices = obj.geometry.index?.array

      if (positions && indices) {
        geometries.push({
          positions: positions as Float32Array,
          indices: indices as Uint32Array | Uint16Array,
        })
      }
    }
  })

  // Create STEP entities
  let entityId = 1
  const vertices: number[] = []
  const edges: number[] = []

  for (const geom of geometries) {
    const positions = geom.positions
    const indices = geom.indices

    // Add vertices
    const localVertexMap = new Map<number, number>()
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${positions[i].toFixed(6)},${positions[i + 1].toFixed(6)},${positions[i + 2].toFixed(6)}`
      if (!vertexMap.has(key)) {
        vertexMap.set(key, entityId)
        stepFile += `#${entityId} = CARTESIAN_POINT('', (${positions[i]}, ${positions[i + 1]}, ${positions[i + 2]}));\n`
        vertices.push(entityId)
        entityId++
      }
      localVertexMap.set(i / 3, vertexMap.get(key)!)
    }

    // Create edges and faces from indices
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = localVertexMap.get(indices[i])!
      const v2 = localVertexMap.get(indices[i + 1])!
      const v3 = localVertexMap.get(indices[i + 2])!

      // Create edges
      const edge1Id = entityId
      stepFile += `#${entityId} = EDGE_CURVE('', #${v1}, #${v2}, #${entityId + 3}, .T.);\n`
      entityId++
      const edge2Id = entityId
      stepFile += `#${entityId} = EDGE_CURVE('', #${v2}, #${v3}, #${entityId + 3}, .T.);\n`
      entityId++
      const edge3Id = entityId
      stepFile += `#${entityId} = EDGE_CURVE('', #${v3}, #${v1}, #${entityId + 3}, .T.);\n`
      entityId++

      // Create lines for edges
      stepFile += `#${entityId} = LINE('', #${v1}, (#${v2}->X - #${v1}->X, #${v2}->Y - #${v1}->Y, #${v2}->Z - #${v1}->Z));\n`
      entityId++
      stepFile += `#${entityId} = LINE('', #${v2}, (#${v3}->X - #${v2}->X, #${v3}->Y - #${v2}->Y, #${v3}->Z - #${v2}->Z));\n`
      entityId++
      stepFile += `#${entityId} = LINE('', #${v3}, (#${v1}->X - #${v3}->X, #${v1}->Y - #${v3}->Y, #${v1}->Z - #${v3}->Z));\n`
      entityId++

      edges.push(edge1Id, edge2Id, edge3Id)
    }
  }

  // Create simple shell
  if (edges.length > 0) {
    const shellId = entityId
    stepFile += `#${entityId} = CLOSED_SHELL('', (#${edges.join(', #')}));\n`
    entityId++

    // Create solid
    stepFile += `#${entityId} = MANIFOLD_SOLID_BREP('Solid', #${shellId});\n`
    entityId++

    // Create product
    stepFile += `#${entityId} = PRODUCT_DEFINITION_SHAPE('', '', #${entityId + 1});\n`
    entityId++
    stepFile += `#${entityId} = PRODUCT_DEFINITION('design', '', #${entityId + 1}, #${entityId + 2});\n`
    entityId++
    stepFile += `#${entityId} = PRODUCT_DEFINITION_CONTEXT('part definition', #${entityId + 1}, 'design');\n`
    entityId++
    stepFile += `#${entityId} = APPLICATION_CONTEXT('automotive design');\n`
    entityId++
  }

  stepFile += `ENDSEC;\n`
  stepFile += `END-ISO-10303-21;\n`

  return stepFile
}
