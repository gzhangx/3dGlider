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
  const binary: unknown = exporter.parse(group, { binary: true })

  let payload: Uint8Array
  if (binary instanceof DataView) {
    // Copy into ArrayBuffer-backed bytes so it is a valid BlobPart.
    payload = new Uint8Array(binary.byteLength)
    payload.set(new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength))
  } else if (binary instanceof ArrayBuffer) {
    payload = new Uint8Array(binary)
  } else if (ArrayBuffer.isView(binary)) {
    const view = binary as ArrayBufferView
    payload = new Uint8Array(view.byteLength)
    payload.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  } else {
    // Fallback for typings/runtime mismatch; keep binary export behavior.
    payload = new TextEncoder().encode(String(binary))
  }

  const blob = new Blob([payload], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '3dglider_model.stl'
  a.click()
  URL.revokeObjectURL(url)

  // Dispose temporary geometry
  disposeSolidMeshes(solids)
}
