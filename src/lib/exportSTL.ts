import { Group, Mesh } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { ExtrudeFeature, LoftFeature, RevolveFeature, ShellFeature, Sketch, SweepFeature } from '../store/modelStore'
import { buildModelSolidMeshes, disposeSolidMeshes } from './solidModel'
import { buildRevolveGeometry } from './revolveModel'
import { buildLoftGeometry } from './loftModel'
import { buildSweepGeometry } from './sweepModel'
import { SCENE_TO_MM } from './units'

export function exportSTL(extrudes: ExtrudeFeature[], revolves: RevolveFeature[], lofts: LoftFeature[], sweeps: SweepFeature[], shells: ShellFeature[], sketches: Sketch[]) {
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

  // Scale scene units → mm so slicers (PrusaSlicer, etc.) import at the correct size.
  group.scale.set(SCENE_TO_MM, SCENE_TO_MM, SCENE_TO_MM)
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

  const blob = new Blob([payload.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '3dglider_model.stl'
  a.click()
  URL.revokeObjectURL(url)

  // Dispose temporary geometry
  disposeSolidMeshes(solids)
  revolveGeos.forEach((g) => g?.dispose())
  loftGeos.forEach((g) => g?.dispose())
  sweepGeos.forEach((g) => g?.dispose())
}
