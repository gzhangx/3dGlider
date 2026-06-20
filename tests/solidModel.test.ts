import { describe, expect, it } from 'vitest'
import { buildModelSolidMeshes, buildSolidMeshes, disposeSolidMeshes } from '../src/lib/solidModel'
import { presetPlanePose, type ExtrudeFeature, type ShellFeature, type Sketch } from '../src/store/modelStore'

describe('solid model', () => {
  it('turns an extrusion into an open shell', () => {
    const sketch: Sketch = {
      id: 'sketch', plane: presetPlanePose('XY'),
      elements: [{ type: 'rect', id: 'rect', start: { x: -2, y: -2 }, end: { x: 2, y: 2 } }],
    }
    const extrudes: ExtrudeFeature[] = [{ id: 'extrude', sketchId: sketch.id, operation: 'add', depth: 4 }]
    const shells: ShellFeature[] = [{ id: 'shell', sketchId: sketch.id, thickness: 0.5 }]
    const outer = buildSolidMeshes(extrudes, [sketch])
    const shelled = buildModelSolidMeshes(extrudes, shells, [sketch])

    expect(shelled).toHaveLength(1)
    expect(shelled[0].geometry.getAttribute('position').count)
      .toBeGreaterThan(outer[0].geometry.getAttribute('position').count)

    disposeSolidMeshes(outer)
    disposeSolidMeshes(shelled)
  }, 10_000)
})
