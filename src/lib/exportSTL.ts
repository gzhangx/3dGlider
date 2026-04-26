import { Group, Mesh } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { ExtrudeFeature, Sketch } from '../store/modelStore'
import { buildSolidMeshes, disposeSolidMeshes } from './solidModel'

export function exportSTL(extrudes: ExtrudeFeature[], sketches: Sketch[]) {
  if (extrudes.length === 0) return

  const group = new Group()
  const solids = buildSolidMeshes(extrudes, sketches)

  for (const solid of solids) {
    group.add(new Mesh(solid.geometry))
  }

  group.updateMatrixWorld(true)

  const exporter = new STLExporter()
  const buffer = exporter.parse(group, { binary: true }) as unknown as DataView
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '3dglider_model.stl'
  a.click()
  URL.revokeObjectURL(url)

  // Dispose temporary geometry
  disposeSolidMeshes(solids)
}
