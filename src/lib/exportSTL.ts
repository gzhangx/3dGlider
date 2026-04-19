import { Group, Mesh, ExtrudeGeometry } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { ExtrudeFeature, Sketch } from '../store/modelStore'
import { sketchElementsToShape, EXTRUDE_ROTATION } from './sketchToShape'

export function exportSTL(extrudes: ExtrudeFeature[], sketches: Sketch[]) {
  if (extrudes.length === 0) return

  const group = new Group()

  for (const ext of extrudes) {
    const sketch = sketches.find((s) => s.id === ext.sketchId)
    if (!sketch) continue
    const shape = sketchElementsToShape(sketch.elements, sketch.plane)
    if (!shape) continue
    const geo = new ExtrudeGeometry(shape, { depth: Math.abs(ext.depth), bevelEnabled: false })
    const mesh = new Mesh(geo)
    const [rx, ry, rz] = EXTRUDE_ROTATION[sketch.plane]
    mesh.rotation.set(rx, ry, rz)
    group.add(mesh)
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
  group.children.forEach((child) => {
    if (child instanceof Mesh) child.geometry.dispose()
  })
}
