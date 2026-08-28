/**
 * Scripting API for 3D Glider
 * Allows users to write JavaScript to programmatically build models.
 * 
 * Example:
 * ```
 * await api.startSketch('XY');
 * await api.addCircle(0, 0, 1);
 * await api.addLine(0, 0, 1, 1);
 * await api.exitSketch();
 * await api.addExtrude('last', 5);
 * ```
 */

import { type SketchPlanePose, type Sketch, type Parameter } from '../store/modelStore'
import type { ModelState } from '../store/modelStore'

export interface ScriptingContext {
  lastSketchId: string | null
  sketches: Map<string, string>  // name -> id mapping
  parameters: Map<string, string>  // name -> id mapping
}

type LiveModelStore = {
  getState: () => ModelState
}

export function createScriptingAPI(store: LiveModelStore) {
  const context: ScriptingContext = {
    lastSketchId: null,
    sketches: new Map(),
    parameters: new Map(),
  }

  /**
   * Start a new sketch on a standard plane (XY, XZ, YZ) or a custom plane pose
   */
  async function startSketch(planeOrId: 'XY' | 'XZ' | 'YZ' | SketchPlanePose, offset?: number): Promise<void> {
    store.getState().startNewSketch(planeOrId, offset)
  }

  /**
   * Exit the current sketch (saves it to the model)
   */
  async function exitSketch(): Promise<string | null> {
    const sketchId = store.getState().exitSketch()
    if (sketchId) {
      context.lastSketchId = sketchId
    }
    return sketchId
  }

  /**
   * Edit an existing sketch by ID or name
   */
  async function editSketch(sketchIdOrName: string): Promise<void> {
    const state = store.getState()
    const sketchId = context.sketches.get(sketchIdOrName) || sketchIdOrName
    const sketch = state.sketches.find((s: Sketch) => s.id === sketchId)
    if (!sketch) throw new Error(`Sketch not found: ${sketchIdOrName}`)
    state.editSketch(sketchId)
    context.lastSketchId = sketchId
  }

  /**
   * Add a line from (x1, y1) to (x2, y2) in sketch coordinates
   */
  async function addLine(x1: number, y1: number, x2: number, y2: number, construction?: boolean): Promise<string> {
    const state = store.getState()
    if (!state.activePlane) throw new Error('No active sketch')
    const id = crypto.randomUUID()
    state.addSketchElement({
      type: 'line',
      id,
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      ...(construction ? { construction: true } : {}),
    })
    return id
  }

  /**
   * Add a rectangle with corners at (x1, y1) and (x2, y2)
   */
  async function addRect(x1: number, y1: number, x2: number, y2: number, construction?: boolean): Promise<string> {
    const state = store.getState()
    if (!state.activePlane) throw new Error('No active sketch')
    const id = crypto.randomUUID()
    state.addSketchElement({
      type: 'rect',
      id,
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      ...(construction ? { construction: true } : {}),
    })
    return id
  }

  /**
   * Add a circle at (x, y) with given radius
   */
  async function addCircle(x: number, y: number, radius: number, construction?: boolean): Promise<string> {
    const state = store.getState()
    if (!state.activePlane) throw new Error('No active sketch')
    const id = crypto.randomUUID()
    state.addSketchElement({
      type: 'circle',
      id,
      center: { x, y },
      radius,
      ...(construction ? { construction: true } : {}),
    })
    return id
  }

  /**
   * Add a constraint to constrain an element or pair of elements
   * Supported constraint types:
   * - { type: 'length', elementId, value } - line length or circle radius
   * - { type: 'horizontal', elementId } - line is horizontal
   * - { type: 'vertical', elementId } - line is vertical
   * - { type: 'parallel', elementId1, elementId2 } - two lines are parallel
   * - { type: 'perpendicular', elementId1, elementId2 } - two lines are perpendicular
   * - { type: 'equal', elementId1, elementId2 } - two elements are equal in size
   * - { type: 'angle', elementId1, elementId2, value } - angle between two lines in degrees
   */
  async function addConstraint(constraint: {
    type: 'length' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'equal' | 'angle'
    elementId?: string
    elementId1?: string
    elementId2?: string
    value?: number
    paramRef?: string
  }): Promise<string> {
    const state = store.getState()
    if (!state.activePlane) throw new Error('No active sketch')
    const id = crypto.randomUUID()

    if (constraint.type === 'length') {
      if (!constraint.elementId || constraint.value === undefined) throw new Error('length constraint requires elementId and value')
      state.addSketchConstraint({
        id,
        type: 'length',
        elementId: constraint.elementId,
        value: constraint.value,
        ...(constraint.paramRef ? { paramRef: constraint.paramRef } : {}),
      })
    } else if (constraint.type === 'horizontal') {
      if (!constraint.elementId) throw new Error('horizontal constraint requires elementId')
      state.addSketchConstraint({
        id,
        type: 'horizontal',
        elementId: constraint.elementId,
      })
    } else if (constraint.type === 'vertical') {
      if (!constraint.elementId) throw new Error('vertical constraint requires elementId')
      state.addSketchConstraint({
        id,
        type: 'vertical',
        elementId: constraint.elementId,
      })
    } else if (constraint.type === 'parallel') {
      if (!constraint.elementId1 || !constraint.elementId2) throw new Error('parallel constraint requires elementId1 and elementId2')
      state.addSketchConstraint({
        id,
        type: 'parallel',
        elementId1: constraint.elementId1,
        elementId2: constraint.elementId2,
      })
    } else if (constraint.type === 'perpendicular') {
      if (!constraint.elementId1 || !constraint.elementId2) throw new Error('perpendicular constraint requires elementId1 and elementId2')
      state.addSketchConstraint({
        id,
        type: 'perpendicular',
        elementId1: constraint.elementId1,
        elementId2: constraint.elementId2,
      })
    } else if (constraint.type === 'equal') {
      if (!constraint.elementId1 || !constraint.elementId2) throw new Error('equal constraint requires elementId1 and elementId2')
      state.addSketchConstraint({
        id,
        type: 'equal',
        elementId1: constraint.elementId1,
        elementId2: constraint.elementId2,
      })
    } else if (constraint.type === 'angle') {
      if (!constraint.elementId1 || !constraint.elementId2 || constraint.value === undefined) {
        throw new Error('angle constraint requires elementId1, elementId2, and value')
      }
      state.addSketchConstraint({
        id,
        type: 'angle',
        elementId1: constraint.elementId1,
        elementId2: constraint.elementId2,
        value: constraint.value,
        ...(constraint.paramRef ? { paramRef: constraint.paramRef } : {}),
      })
    }

    return id
  }

  /**
   * Add a named parameter to the model
   */
  async function addParameter(name: string, value: number): Promise<string> {
    const id = store.getState().addParameter(name, value)
    context.parameters.set(name, id)
    return id
  }

  /**
   * Update an existing parameter
   */
  async function updateParameter(nameOrId: string, newValue?: number, newName?: string): Promise<void> {
    const state = store.getState()
    const paramId = context.parameters.get(nameOrId) || nameOrId
    const param = state.parameters.find((p: Parameter) => p.id === paramId)
    if (!param) throw new Error(`Parameter not found: ${nameOrId}`)
    state.updateParameter(paramId, newName ?? param.name, newValue ?? param.value)
  }

  /**
   * Add an extrusion to the last sketch (or specified sketch)
   */
  // `depth` is required and has no default, so a default on the parameter
  // before it can never actually apply — callers must always pass
  // sketchIdOrName explicitly (as every documented example already does).
  async function addExtrude(
    sketchIdOrName: string,
    depth: number,
    operation: 'add' | 'cut' = 'add',
    direction?: [number, number, number],
    symmetric?: boolean
  ): Promise<string> {
    let sketchId: string
    if (sketchIdOrName === 'last') {
      if (!context.lastSketchId) throw new Error('No last sketch')
      sketchId = context.lastSketchId
    } else {
      sketchId = context.sketches.get(sketchIdOrName) || sketchIdOrName
    }
    const state = store.getState()
    const sketch = state.sketches.find((s: Sketch) => s.id === sketchId)
    if (!sketch) throw new Error(`Sketch not found: ${sketchIdOrName}`)
    return state.addExtrude(sketchId, depth, operation, direction, symmetric)
  }

  /**
   * Add a revolve (revolution) to the last sketch (or specified sketch)
   */
  async function addRevolve(
    sketchIdOrName: string = 'last',
    axisType: 'x' | 'y' | 'z' | 'element' = 'z',
    angle: number = 360,
    axisElementId?: string
  ): Promise<string> {
    let sketchId: string
    if (sketchIdOrName === 'last') {
      if (!context.lastSketchId) throw new Error('No last sketch')
      sketchId = context.lastSketchId
    } else {
      sketchId = context.sketches.get(sketchIdOrName) || sketchIdOrName
    }
    const state = store.getState()
    const sketch = state.sketches.find((s: Sketch) => s.id === sketchId)
    if (!sketch) throw new Error(`Sketch not found: ${sketchIdOrName}`)
    return state.addRevolve(sketchId, axisType, angle, axisElementId)
  }

  /**
   * Add a loft between two sketches
   */
  async function addLoft(
    sketch1IdOrName: string,
    sketch2IdOrName: string,
    operation: 'add' | 'cut' = 'add'
  ): Promise<string> {
    const sketchId1 = context.sketches.get(sketch1IdOrName) || sketch1IdOrName
    const sketchId2 = context.sketches.get(sketch2IdOrName) || sketch2IdOrName
    const state = store.getState()
    const sketch1 = state.sketches.find((s: Sketch) => s.id === sketchId1)
    const sketch2 = state.sketches.find((s: Sketch) => s.id === sketchId2)
    if (!sketch1) throw new Error(`Sketch not found: ${sketch1IdOrName}`)
    if (!sketch2) throw new Error(`Sketch not found: ${sketch2IdOrName}`)
    return state.addLoft(sketchId1, sketchId2, operation)
  }

  /**
   * Add a sweep
   */
  async function addSweep(
    profileSketchIdOrName: string,
    pathSketchIdOrName: string,
    operation: 'add' | 'cut' = 'add'
  ): Promise<string> {
    const profileSketchId = context.sketches.get(profileSketchIdOrName) || profileSketchIdOrName
    const pathSketchId = context.sketches.get(pathSketchIdOrName) || pathSketchIdOrName
    const state = store.getState()
    const profileSketch = state.sketches.find((s: Sketch) => s.id === profileSketchId)
    const pathSketch = state.sketches.find((s: Sketch) => s.id === pathSketchId)
    if (!profileSketch) throw new Error(`Sketch not found: ${profileSketchIdOrName}`)
    if (!pathSketch) throw new Error(`Sketch not found: ${pathSketchIdOrName}`)
    return state.addSweep(profileSketchId, pathSketchId, operation)
  }

  /**
   * Get current sketches (read-only)
   */
  function getSketches() {
    return store.getState().sketches
  }

  /**
   * Get current parameters (read-only)
   */
  function getParameters() {
    return store.getState().parameters
  }

  /**
   * Get current extrudes (read-only)
   */
  function getExtrudes() {
    return store.getState().extrudes
  }

  /**
   * Set sketch appearance (color and opacity)
   */
  async function setSketchColor(sketchIdOrName: string, color: string, opacity?: number): Promise<void> {
    const state = store.getState()
    const sketchId = context.sketches.get(sketchIdOrName) || sketchIdOrName
    const sketch = state.sketches.find((s: Sketch) => s.id === sketchId)
    if (!sketch) throw new Error(`Sketch not found: ${sketchIdOrName}`)
    state.setSketchAppearance(sketchId, color, opacity ?? 1)
  }

  /**
   * Set sketch name
   */
  async function setSketchName(sketchIdOrName: string, name: string): Promise<void> {
    const state = store.getState()
    const sketchId = context.sketches.get(sketchIdOrName) || sketchIdOrName
    const sketch = state.sketches.find((s: Sketch) => s.id === sketchId)
    if (!sketch) throw new Error(`Sketch not found: ${sketchIdOrName}`)
    state.setSketchName(sketchId, name)
    context.sketches.set(name, sketchId)
  }

  return {
    startSketch,
    exitSketch,
    editSketch,
    addLine,
    addRect,
    addCircle,
    addConstraint,
    addParameter,
    updateParameter,
    addExtrude,
    addRevolve,
    addLoft,
    addSweep,
    getSketches,
    getParameters,
    getExtrudes,
    setSketchColor,
    setSketchName,
    context,
  }
}

export type ScriptingAPI = ReturnType<typeof createScriptingAPI>
