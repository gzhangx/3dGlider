import { create } from 'zustand'
import { reapplyParametricConstraints, solveConstraints } from '../lib/constraintSolve'

export type PlaneId = 'XY' | 'XZ' | 'YZ'
export type AppMode = 'view' | 'sketch'
export type SketchTool = 'select' | 'line' | 'rect' | 'circle' | 'cut'

export interface SketchPlanePose {
  rotation: [number, number, number]
  offset: number
}

export const PRESET_PLANE_ROTATION: Record<PlaneId, [number, number, number]> = {
  XY: [0, 0, 0],
  XZ: [-Math.PI / 2, 0, 0],
  YZ: [0, Math.PI / 2, 0],
}

export function presetPlanePose(plane: PlaneId, offset = 0): SketchPlanePose {
  const [rx, ry, rz] = PRESET_PLANE_ROTATION[plane]
  return { rotation: [rx, ry, rz], offset }
}

export type SketchPoint = { x: number; y: number }

export interface SketchLine {
  type: 'line'; id: string; start: SketchPoint; end: SketchPoint
  construction?: boolean
  name?: string
}
export interface SketchRect {
  type: 'rect'; id: string; start: SketchPoint; end: SketchPoint
  construction?: boolean
  name?: string
}
export interface SketchCircle {
  type: 'circle'; id: string; center: SketchPoint; radius: number
  construction?: boolean
  name?: string
}
export interface SketchArc {
  type: 'arc'; id: string; center: SketchPoint; radius: number; startAngle: number; endAngle: number
  construction?: boolean
  name?: string
}
export type SketchElement = SketchLine | SketchRect | SketchCircle | SketchArc

// ── Sketch constraints ────────────────────────────────────────────────────────
export type PointRef = { elementId: string; which: 'start' | 'end' | 'center' }
export interface LengthConstraint       { id: string; type: 'length';       elementId: string; value: number; dimension?: 'width' | 'height' | 'radius'; paramRef?: string }
export interface AngleConstraint        { id: string; type: 'angle';        elementId1: string; elementId2: string; value: number; paramRef?: string }
export interface CoincidentConstraint   { id: string; type: 'coincident';   p1: PointRef; p2: PointRef }
export interface ParallelConstraint     { id: string; type: 'parallel';     elementId1: string; elementId2: string }
export interface PerpendicularConstraint{ id: string; type: 'perpendicular'; elementId1: string; elementId2: string }
export interface HorizontalConstraint   { id: string; type: 'horizontal';   elementId: string }
export interface VerticalConstraint     { id: string; type: 'vertical';     elementId: string }
export interface EqualConstraint        { id: string; type: 'equal';        elementId1: string; elementId2: string }
export interface TangentConstraint      { id: string; type: 'tangent';      elementId1: string; elementId2: string }
export interface PointOnCircleConstraint { id: string; type: 'pointOnCircle'; p: PointRef; circleId: string }
export type SketchConstraint =
  | LengthConstraint | AngleConstraint | CoincidentConstraint
  | ParallelConstraint | PerpendicularConstraint
  | HorizontalConstraint | VerticalConstraint | EqualConstraint | TangentConstraint
  | PointOnCircleConstraint

export interface Sketch {
  id: string
  plane: SketchPlanePose
  elements: SketchElement[]
  constraints?: SketchConstraint[]
  name?: string
  color?: string
  opacity?: number
}

// ── Named parameters ──────────────────────────────────────────────────────────
export interface Parameter { id: string; name: string; value: number }

export interface ExtrudeFeature {
  id: string
  sketchId: string
  operation: 'add' | 'cut'
  depth: number  // units along the extrusion direction
  direction?: [number, number, number]  // world-space unit vector; omit = plane normal
  symmetric?: boolean  // extrude depth/2 on each side of the sketch plane
  color?: string
  opacity?: number
}

export type RevolveAxis = 'x' | 'y' | 'z' | 'element'

export interface RevolveFeature {
  id: string
  sketchId: string
  axisType: RevolveAxis
  axisElementId?: string  // line element id within the sketch, only when axisType === 'element'
  angle: number           // degrees, 1–360
  color?: string
  opacity?: number
}

export interface LoftFeature {
  id: string
  sketchId1: string
  sketchId2: string
  operation: 'add' | 'cut'
  color?: string
  opacity?: number
}

export interface SweepFeature {
  id: string
  profileSketchId: string
  pathSketchId: string
  operation: 'add' | 'cut'
  color?: string
  opacity?: number
}

export interface ShellFeature {
  id: string
  sketchId: string
  thickness: number
  color?: string
  opacity?: number
}

export interface ModelData {
  version: number
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
  revolves: RevolveFeature[]
  lofts?: LoftFeature[]
  sweeps?: SweepFeature[]
  shells?: ShellFeature[]
  parameters?: Parameter[]
}

function isSketchPlanePose(value: unknown): value is SketchPlanePose {
  if (!value || typeof value !== 'object') return false
  const pose = value as SketchPlanePose
  return Array.isArray(pose.rotation)
    && pose.rotation.length === 3
    && pose.rotation.every((n) => typeof n === 'number' && Number.isFinite(n))
    && typeof pose.offset === 'number'
    && Number.isFinite(pose.offset)
}

function isSketchElement(value: unknown): value is SketchElement {
  if (!value || typeof value !== 'object') return false
  const el = value as { type?: unknown }
  return el.type === 'line' || el.type === 'rect' || el.type === 'circle' || el.type === 'arc'
}

function sanitizeModelData(value: unknown): { sketches: Sketch[]; extrudes: ExtrudeFeature[]; revolves: RevolveFeature[]; lofts: LoftFeature[]; sweeps: SweepFeature[]; shells: ShellFeature[]; parameters: Parameter[] } | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<ModelData>
  if (!Array.isArray(raw.sketches) || !Array.isArray(raw.extrudes)) return null

  const sketches: Sketch[] = raw.sketches
    .filter((s): s is Sketch => !!s
      && typeof s.id === 'string'
      && isSketchPlanePose(s.plane)
      && Array.isArray(s.elements)
      && s.elements.every(isSketchElement))
    .map((s) => {
      const r = s as Sketch & { color?: unknown; opacity?: unknown; constraints?: unknown }
      const constraints: SketchConstraint[] = Array.isArray(r.constraints)
        ? (r.constraints as unknown[]).filter((c): c is SketchConstraint => {
            if (!c || typeof c !== 'object') return false
            const cc = c as { type?: unknown }
            return cc.type === 'length' || cc.type === 'angle' || cc.type === 'coincident'
              || cc.type === 'parallel' || cc.type === 'perpendicular' || cc.type === 'horizontal' || cc.type === 'vertical'
              || cc.type === 'equal' || cc.type === 'tangent' || cc.type === 'pointOnCircle'
          })
        : []
      return {
        id: s.id,
        plane: {
          rotation: [s.plane.rotation[0], s.plane.rotation[1], s.plane.rotation[2]],
          offset: s.plane.offset,
        },
        elements: s.elements,
        ...(constraints.length > 0 ? { constraints } : {}),
        ...(typeof r.name === 'string' ? { name: r.name } : {}),
        ...(typeof r.color === 'string' ? { color: r.color } : {}),
        ...(typeof r.opacity === 'number' && Number.isFinite(r.opacity) ? { opacity: r.opacity } : {}),
      }
    })

  const validSketchIds = new Set(sketches.map((s) => s.id))
  const extrudes: ExtrudeFeature[] = raw.extrudes
    .filter((e): e is ExtrudeFeature => !!e
      && typeof e.id === 'string'
      && typeof e.sketchId === 'string'
      && (e.operation === 'add' || e.operation === 'cut')
      && typeof e.depth === 'number'
      && Number.isFinite(e.depth)
      && validSketchIds.has(e.sketchId))
    .map((e) => {
      const rawE = e as ExtrudeFeature & { direction?: unknown; color?: unknown; opacity?: unknown }
      const dir = Array.isArray(rawE.direction)
        && rawE.direction.length === 3
        && rawE.direction.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? rawE.direction as [number, number, number]
        : undefined
      return {
        id: e.id, sketchId: e.sketchId, operation: e.operation, depth: e.depth,
        ...(dir ? { direction: dir } : {}),
        ...(rawE.symmetric === true ? { symmetric: true } : {}),
        ...(typeof rawE.color === 'string' ? { color: rawE.color } : {}),
        ...(typeof rawE.opacity === 'number' && Number.isFinite(rawE.opacity) ? { opacity: rawE.opacity } : {}),
      }
    })

  const revolves: RevolveFeature[] = Array.isArray(raw.revolves)
    ? raw.revolves
        .filter((r): r is RevolveFeature => !!r
          && typeof r.id === 'string'
          && typeof r.sketchId === 'string'
          && (r.axisType === 'x' || r.axisType === 'y' || r.axisType === 'z' || r.axisType === 'element')
          && typeof r.angle === 'number'
          && Number.isFinite(r.angle)
          && validSketchIds.has(r.sketchId))
        .map((r) => {
          const rawR = r as RevolveFeature & { color?: unknown; opacity?: unknown }
          return {
            id: r.id, sketchId: r.sketchId, axisType: r.axisType, angle: r.angle,
            ...(r.axisType === 'element' && typeof r.axisElementId === 'string' ? { axisElementId: r.axisElementId } : {}),
            ...(typeof rawR.color === 'string' ? { color: rawR.color } : {}),
            ...(typeof rawR.opacity === 'number' && Number.isFinite(rawR.opacity) ? { opacity: rawR.opacity } : {}),
          }
        })
    : []

  const lofts: LoftFeature[] = Array.isArray(raw.lofts)
    ? raw.lofts
        .filter((l): l is LoftFeature => !!l
          && typeof l.id === 'string'
          && typeof l.sketchId1 === 'string'
          && typeof l.sketchId2 === 'string'
          && (l.operation === 'add' || l.operation === 'cut')
          && validSketchIds.has(l.sketchId1)
          && validSketchIds.has(l.sketchId2)
          && l.sketchId1 !== l.sketchId2)
        .map((l) => {
          const rawL = l as LoftFeature & { color?: unknown; opacity?: unknown }
          return {
            id: l.id,
            sketchId1: l.sketchId1,
            sketchId2: l.sketchId2,
            operation: l.operation,
            ...(typeof rawL.color === 'string' ? { color: rawL.color } : {}),
            ...(typeof rawL.opacity === 'number' && Number.isFinite(rawL.opacity) ? { opacity: rawL.opacity } : {}),
          }
        })
    : []

  const sweeps: SweepFeature[] = Array.isArray(raw.sweeps)
    ? raw.sweeps
        .filter((sw): sw is SweepFeature => !!sw
          && typeof sw.id === 'string'
          && typeof sw.profileSketchId === 'string'
          && typeof sw.pathSketchId === 'string'
          && (sw.operation === 'add' || sw.operation === 'cut')
          && validSketchIds.has(sw.profileSketchId)
          && validSketchIds.has(sw.pathSketchId)
          && sw.profileSketchId !== sw.pathSketchId)
        .map((sw) => {
          const rawSw = sw as SweepFeature & { color?: unknown; opacity?: unknown }
          return {
            id: sw.id,
            profileSketchId: sw.profileSketchId,
            pathSketchId: sw.pathSketchId,
            operation: sw.operation,
            ...(typeof rawSw.color === 'string' ? { color: rawSw.color } : {}),
            ...(typeof rawSw.opacity === 'number' && Number.isFinite(rawSw.opacity) ? { opacity: rawSw.opacity } : {}),
          }
        })
    : []

  const shells: ShellFeature[] = Array.isArray(raw.shells)
    ? raw.shells
        .filter((sh): sh is ShellFeature => !!sh
          && typeof sh.id === 'string'
          && typeof sh.sketchId === 'string'
          && typeof sh.thickness === 'number'
          && Number.isFinite(sh.thickness)
          && validSketchIds.has(sh.sketchId))
        .map((sh) => {
          const rawSh = sh as ShellFeature & { color?: unknown; opacity?: unknown }
          return {
            id: sh.id,
            sketchId: sh.sketchId,
            thickness: sh.thickness,
            ...(typeof rawSh.color === 'string' ? { color: rawSh.color } : {}),
            ...(typeof rawSh.opacity === 'number' && Number.isFinite(rawSh.opacity) ? { opacity: rawSh.opacity } : {}),
          }
        })
    : []

  const parameters: Parameter[] = Array.isArray(raw.parameters)
    ? (raw.parameters as unknown[]).filter((p): p is Parameter =>
        !!p && typeof p === 'object'
        && typeof (p as Parameter).id === 'string'
        && typeof (p as Parameter).name === 'string'
        && typeof (p as Parameter).value === 'number'
        && Number.isFinite((p as Parameter).value))
    : []

  return { sketches, extrudes, revolves, lofts, sweeps, shells, parameters }
}

export interface ModelState {
  mode: AppMode
  activePlane: SketchPlanePose | null
  hoveredPlane: PlaneId | null
  newSketchArmed: boolean
  activeTool: SketchTool
  constructionMode: boolean
  snapToGrid: boolean
  snapToOtherPlanes: boolean
  snapToObjects: boolean
  sketchElements: SketchElement[]
  sketchConstraints: SketchConstraint[]   // constraints for current working sketch
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
  revolves: RevolveFeature[]
  lofts: LoftFeature[]
  sweeps: SweepFeature[]
  shells: ShellFeature[]
  parameters: Parameter[]
  selectedElementId: string | null
  selectedElementId2: string | null       // second selection for angle constraint
  selectedElementIds: string[]            // full multi-select set (slot1==[0], slot2==[1])
  isDraggingPoint: boolean
  highlightElementIds: string[]
  showSketchNavigator: boolean
  hideOtherSketches: boolean
  editingSketchId: string | null
  editingExtrudeId: string | null
  previewExtrude: ExtrudeFeature | null
  previewPlane: SketchPlanePose | null
  sketchViewResetCounter: number
  // element name counters and toggle
  lineCounter: number
  rectCounter: number
  circleCounter: number
  arcCounter: number
  showElementNames: boolean

  setHoveredPlane: (plane: PlaneId | null) => void
  setActiveTool: (tool: SketchTool) => void
  setPreviewPlane: (plane: SketchPlanePose | null) => void
  setConstructionMode: (on: boolean) => void
  setSnapToGrid: (on: boolean) => void
  setSnapToOtherPlanes: (on: boolean) => void
  setSnapToObjects: (on: boolean) => void
  selectElement: (id: string | null) => void
  selectElement2: (id: string | null) => void
  toggleElementSelection: (id: string) => void
  selectElements: (ids: string[]) => void
  setIsDraggingPoint: (v: boolean) => void
  setHighlightElementIds: (ids: string[]) => void
  resetSketchView: () => void
  setShowSketchNavigator: (v: boolean) => void
  setHideOtherSketches: (v: boolean) => void
  setShowElementNames: (v: boolean) => void
  addSketchElement: (el: SketchElement) => void
  updateSketchElement: (id: string, updates: Partial<SketchElement>) => void
  deleteSketchElement: (id: string) => void
  cutSketchElement: (id: string, replacements: SketchElement[]) => void
  addSketchConstraint: (c: SketchConstraint) => void
  addSketchConstraintsBatch: (constraints: SketchConstraint[], apply?: boolean) => void
  applyConstraints: (fixedPoints?: Set<string>) => void
  deleteSketchConstraint: (id: string) => void
  addExtrude: (sketchId: string, depth: number, operation?: 'add' | 'cut', direction?: [number, number, number], symmetric?: boolean, id?: string) => string
  updateExtrude: (id: string, depth: number, operation: 'add' | 'cut', direction?: [number, number, number], symmetric?: boolean) => void
  deleteExtrude: (id: string) => void
  setSketchAppearance: (id: string, color: string, opacity: number) => void
  setSketchName: (id: string, name: string) => void
  setExtrudeAppearance: (id: string, color: string, opacity: number) => void
  setEditingExtrudeId: (id: string | null) => void
  setPreviewExtrude: (preview: ExtrudeFeature | null) => void
  addRevolve: (sketchId: string, axisType: RevolveAxis, angle: number, axisElementId?: string, id?: string) => string
  updateRevolve: (id: string, axisType: RevolveAxis, angle: number, axisElementId?: string) => void
  deleteRevolve: (id: string) => void
  setRevolveAppearance: (id: string, color: string, opacity: number) => void
  addLoft: (sketchId1: string, sketchId2: string, operation?: 'add' | 'cut', id?: string) => string
  deleteLoft: (id: string) => void
  addSweep: (profileSketchId: string, pathSketchId: string, operation?: 'add' | 'cut', id?: string) => string
  deleteSweep: (id: string) => void
  addShell: (sketchId: string, thickness: number, id?: string) => string
  deleteShell: (id: string) => void
  addParameter: (name: string, value: number, id?: string) => string
  updateParameter: (id: string, name: string, value: number) => void
  deleteParameter: (id: string) => void
  armNewSketch: () => void
  cancelNewSketch: () => void
  startNewSketch: (plane: PlaneId | SketchPlanePose, offset?: number) => void
  editSketch: (sketchId: string) => void
  exitSketch: () => string | null
  loadModel: (data: unknown) => boolean
}

export const useModelStore = create<ModelState>((set) => ({
  mode: 'view',
  activePlane: null,
  hoveredPlane: null,
  newSketchArmed: false,
  activeTool: 'select',
  constructionMode: false,
  snapToGrid: false,
  snapToOtherPlanes: false,
  snapToObjects: true,
  sketchElements: [],
  sketchConstraints: [],
  sketches: [],
  extrudes: [],
  revolves: [],
  lofts: [],
  sweeps: [],
  shells: [],
  parameters: [],
  selectedElementId: null,
  selectedElementId2: null,
  selectedElementIds: [],
  isDraggingPoint: false,
  highlightElementIds: [],
  showSketchNavigator: false,
  hideOtherSketches: true,
  editingSketchId: null,
  editingExtrudeId: null,
  previewExtrude: null,
  previewPlane: null,
  sketchViewResetCounter: 0,
  lineCounter: 0,
  rectCounter: 0,
  circleCounter: 0,
  arcCounter: 0,
  showElementNames: false,

  setHoveredPlane: (hoveredPlane) => set({ hoveredPlane }),
  setActiveTool: (activeTool) => set({ activeTool, selectedElementId: null, selectedElementId2: null, selectedElementIds: [] }),
  setConstructionMode: (constructionMode) => set({ constructionMode }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setSnapToOtherPlanes: (snapToOtherPlanes) => set({ snapToOtherPlanes }),
  setSnapToObjects: (snapToObjects) => set({ snapToObjects }),
  selectElement: (id) => set({ selectedElementId: id, selectedElementId2: null, selectedElementIds: id ? [id] : [], highlightElementIds: [] }),
  selectElement2: (id) => set((s) => ({
    selectedElementId2: id,
    selectedElementIds: id
      ? s.selectedElementIds.includes(id) ? s.selectedElementIds : [...s.selectedElementIds.slice(0, 1), id]
      : s.selectedElementIds.slice(0, 1),
  })),
  toggleElementSelection: (id) => set((s) => {
    const already = s.selectedElementIds.includes(id)
    const next = already ? s.selectedElementIds.filter((x) => x !== id) : [...s.selectedElementIds, id]
    return {
      selectedElementIds: next,
      selectedElementId:  next[0] ?? null,
      selectedElementId2: next[1] ?? null,
    }
  }),
  selectElements: (ids) => set({
    selectedElementIds: ids,
    selectedElementId:  ids[0] ?? null,
    selectedElementId2: ids[1] ?? null,
    highlightElementIds: [],
  }),
  setIsDraggingPoint: (isDraggingPoint) => set({ isDraggingPoint }),
  setHighlightElementIds: (highlightElementIds) => set({ highlightElementIds }),
  addSketchConstraintsBatch: (constraints, apply = true) => set((s) => {
    const sketchConstraints = [...s.sketchConstraints, ...constraints]
    if (!apply) return { sketchConstraints }
    const solved = solveConstraints(s.sketchElements, sketchConstraints, new Set())
    return { sketchConstraints, sketchElements: solved }
  }),
  applyConstraints: (fixedPoints) => set((s) => {
    const solved = solveConstraints(s.sketchElements, s.sketchConstraints, fixedPoints ?? new Set())
    return { sketchElements: solved }
  }),
  resetSketchView: () => set((s) => ({ sketchViewResetCounter: s.sketchViewResetCounter + 1 })),
  setShowSketchNavigator: (showSketchNavigator) => set({ showSketchNavigator }),
  setHideOtherSketches: (hideOtherSketches) => set({ hideOtherSketches }),
  setShowElementNames: (showElementNames) => set({ showElementNames }),

  addSketchElement: (el) => set((s) => {
    // assign a friendly name if not present
    let name = (el as any).name as string | undefined
    if (!name) {
      if (el.type === 'line') { name = `Line${s.lineCounter + 1}` }
      else if (el.type === 'rect') { name = `Rect${s.rectCounter + 1}` }
      else if (el.type === 'circle') { name = `Circle${s.circleCounter + 1}` }
      else if (el.type === 'arc') { name = `Arc${s.arcCounter + 1}` }
    }
    const nextEl = { ...el, ...(name ? { name } : {}) }
    return {
      sketchElements: [...s.sketchElements, nextEl],
      lineCounter: el.type === 'line' ? s.lineCounter + 1 : s.lineCounter,
      rectCounter: el.type === 'rect' ? s.rectCounter + 1 : s.rectCounter,
      circleCounter: el.type === 'circle' ? s.circleCounter + 1 : s.circleCounter,
      arcCounter: el.type === 'arc' ? s.arcCounter + 1 : s.arcCounter,
    }
  }),

  updateSketchElement: (id, updates) =>
    set((s) => ({
      sketchElements: s.sketchElements.map((el) => el.id === id ? { ...el, ...updates } as SketchElement : el),
    })),

  deleteSketchElement: (id) =>
    set((s) => ({
      selectedElementId: null,
      selectedElementId2: null,
      selectedElementIds: [],
      sketchElements: s.sketchElements.filter((el) => el.id !== id),
      sketchConstraints: s.sketchConstraints.filter((c) => {
        if (c.type === 'length' || c.type === 'horizontal' || c.type === 'vertical')
          return c.elementId !== id
        if (c.type === 'angle' || c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'equal')
          return c.elementId1 !== id && c.elementId2 !== id
        if (c.type === 'coincident')
          return c.p1.elementId !== id && c.p2.elementId !== id
        if (c.type === 'pointOnCircle')
          return (c as any).p.elementId !== id && (c as any).circleId !== id
        return true
      }),
      sketches: s.sketches
        .map((sk) => ({ ...sk, elements: sk.elements.filter((el) => el.id !== id) }))
        .filter((sk) => sk.elements.length > 0),
    })),

  cutSketchElement: (id, replacements) =>
    set((s) => ({
      sketchElements: [...s.sketchElements.filter((el) => el.id !== id), ...replacements],
    })),

  addSketchConstraint: (c) => set((s) => ({ sketchConstraints: [...s.sketchConstraints, c] })),

  deleteSketchConstraint: (id) =>
    set((s) => ({ sketchConstraints: s.sketchConstraints.filter((c) => c.id !== id) })),

  addExtrude: (sketchId, depth, operation = 'add', direction, symmetric, id = crypto.randomUUID()) => {
    set((s) => ({
      extrudes: [...s.extrudes, { id, sketchId, operation, depth, ...(direction ? { direction } : {}), ...(symmetric ? { symmetric } : {}) }],
    }))
    return id
  },

  updateExtrude: (id, depth, operation, direction, symmetric) =>
    set((s) => ({
      extrudes: s.extrudes.map((e) =>
        e.id === id
          ? { ...e, operation, depth, ...(direction ? { direction } : { direction: undefined }), ...(symmetric ? { symmetric: true } : { symmetric: undefined }) }
          : e
      ),
    })),

  deleteExtrude: (id) =>
    set((s) => ({ extrudes: s.extrudes.filter((e) => e.id !== id) })),

  setSketchAppearance: (id, color, opacity) =>
    set((s) => ({ sketches: s.sketches.map((sk) => sk.id === id ? { ...sk, color, opacity } : sk) })),

  setSketchName: (id, name) =>
    set((s) => ({ sketches: s.sketches.map((sk) => sk.id === id ? { ...sk, name } : sk) })),

  setExtrudeAppearance: (id, color, opacity) =>
    set((s) => ({ extrudes: s.extrudes.map((e) => e.id === id ? { ...e, color, opacity } : e) })),

  setEditingExtrudeId: (editingExtrudeId) => set({ editingExtrudeId }),

  setPreviewExtrude: (previewExtrude) => set({ previewExtrude }),
  setPreviewPlane: (previewPlane) => set({ previewPlane }),

  addRevolve: (sketchId, axisType, angle, axisElementId, id = crypto.randomUUID()) => {
    set((s) => ({
      revolves: [...s.revolves, {
        id, sketchId, axisType, angle,
        ...(axisType === 'element' && axisElementId ? { axisElementId } : {}),
      }],
    }))
    return id
  },

  updateRevolve: (id, axisType, angle, axisElementId) =>
    set((s) => ({
      revolves: s.revolves.map((r) =>
        r.id === id
          ? { ...r, axisType, angle, ...(axisType === 'element' && axisElementId ? { axisElementId } : { axisElementId: undefined }) }
          : r
      ),
    })),

  deleteRevolve: (id) =>
    set((s) => ({ revolves: s.revolves.filter((r) => r.id !== id) })),

  setRevolveAppearance: (id, color, opacity) =>
    set((s) => ({ revolves: s.revolves.map((r) => r.id === id ? { ...r, color, opacity } : r) })),

  addLoft: (sketchId1, sketchId2, operation = 'add', id = crypto.randomUUID()) => {
    set((s) => ({
      lofts: [...s.lofts, { id, sketchId1, sketchId2, operation }],
    }))
    return id
  },

  deleteLoft: (id) =>
    set((s) => ({ lofts: s.lofts.filter((l) => l.id !== id) })),

  addSweep: (profileSketchId, pathSketchId, operation = 'add', id = crypto.randomUUID()) => {
    set((s) => ({
      sweeps: [...s.sweeps, { id, profileSketchId, pathSketchId, operation }],
    }))
    return id
  },

  deleteSweep: (id) =>
    set((s) => ({ sweeps: s.sweeps.filter((sw) => sw.id !== id) })),

  addShell: (sketchId, thickness, id = crypto.randomUUID()) => {
    set((s) => ({
      shells: [...s.shells, { id, sketchId, thickness }],
    }))
    return id
  },

  deleteShell: (id) =>
    set((s) => ({ shells: s.shells.filter((sh) => sh.id !== id) })),

  addParameter: (name, value, id = crypto.randomUUID()) => {
    set((s) => ({ parameters: [...s.parameters, { id, name, value }] }))
    return id
  },

  updateParameter: (id, name, value) =>
    set((s) => {
      const parameters = s.parameters.map((p) => p.id === id ? { ...p, name, value } : p)
      const sketchElements = reapplyParametricConstraints(s.sketchElements, s.sketchConstraints, parameters)
      const sketches = s.sketches.map((sk) => ({
        ...sk,
        elements: reapplyParametricConstraints(sk.elements, sk.constraints ?? [], parameters),
      }))
      return { parameters, sketchElements, sketches }
    }),

  deleteParameter: (id) =>
    set((s) => ({ parameters: s.parameters.filter((p) => p.id !== id) })),

  armNewSketch: () =>
    set((s) => (s.mode === 'view' ? { newSketchArmed: true } : s)),

  cancelNewSketch: () => set({ newSketchArmed: false, previewPlane: null }),

  startNewSketch: (plane, offset = 0) =>
    set({
      mode: 'sketch',
      activePlane: typeof plane === 'string' ? presetPlanePose(plane, offset) : plane,
      previewPlane: null,
      newSketchArmed: false,
      activeTool: 'select',
      constructionMode: false,
      sketchElements: [],
      sketchConstraints: [],
      selectedElementId: null,
      selectedElementId2: null,
      editingSketchId: null,
    }),

  editSketch: (sketchId) =>
    set((s) => {
      const target = s.sketches.find((sk) => sk.id === sketchId)
      if (!target) return s
      return {
        mode: 'sketch',
        activePlane: target.plane,
        newSketchArmed: false,
        activeTool: 'select',
        constructionMode: false,
        sketchElements: target.elements,
        sketchConstraints: target.constraints ?? [],
        selectedElementId: null,
        selectedElementId2: null,
        editingSketchId: target.id,
      }
    }),

  exitSketch: () => {
    let newSketchId: string | null = null
    set((s) => {
      let sketches = s.sketches
      if (s.activePlane && s.sketchElements.length > 0) {
        const constraints = s.sketchConstraints.length > 0 ? s.sketchConstraints : undefined
        if (s.editingSketchId) {
          newSketchId = s.editingSketchId
          sketches = sketches.map((sk) =>
            sk.id === s.editingSketchId
              ? { ...sk, plane: s.activePlane!, elements: s.sketchElements, ...(constraints ? { constraints } : { constraints: undefined }) }
              : sk,
          )
        } else {
          newSketchId = crypto.randomUUID()
          sketches = [...sketches, { id: newSketchId, plane: s.activePlane, elements: s.sketchElements, ...(constraints ? { constraints } : {}) }]
        }
      } else if (s.editingSketchId) {
        sketches = sketches.filter((sk) => sk.id !== s.editingSketchId)
      }

      return {
        mode: 'view',
        activePlane: null,
        newSketchArmed: false,
        activeTool: 'select',
        constructionMode: false,
        sketchElements: [],
        sketchConstraints: [],
        selectedElementId: null,
        selectedElementId2: null,
        editingSketchId: null,
        sketches,
      }
    })
    return newSketchId
  },

  loadModel: (data) => {
    const parsed = sanitizeModelData(data)
    if (!parsed) return false
    // estimate counters from loaded element names to avoid duplicates
    let lineCounter = 0, rectCounter = 0, circleCounter = 0, arcCounter = 0
    for (const sk of parsed.sketches) {
      for (const el of sk.elements) {
        const name = (el as any).name as string | undefined
        if (!name) continue
        const mLine = name.match(/^Line(\d+)$/i)
        if (mLine) lineCounter = Math.max(lineCounter, parseInt(mLine[1], 10))
        const mRect = name.match(/^Rect(\d+)$/i)
        if (mRect) rectCounter = Math.max(rectCounter, parseInt(mRect[1], 10))
        const mCircle = name.match(/^Circle(\d+)$/i)
        if (mCircle) circleCounter = Math.max(circleCounter, parseInt(mCircle[1], 10))
        const mArc = name.match(/^Arc(\d+)$/i)
        if (mArc) arcCounter = Math.max(arcCounter, parseInt(mArc[1], 10))
      }
    }
    set({
      mode: 'view',
      activePlane: null,
      hoveredPlane: null,
      newSketchArmed: false,
      activeTool: 'select',
      constructionMode: false,
      sketchElements: [],
      sketchConstraints: [],
      selectedElementId: null,
      selectedElementId2: null,
      editingSketchId: null,
      sketches: parsed.sketches,
      extrudes: parsed.extrudes,
      revolves: parsed.revolves,
      lofts: parsed.lofts,
      sweeps: parsed.sweeps,
      shells: parsed.shells,
      parameters: parsed.parameters,
      lineCounter,
      rectCounter,
      circleCounter,
      arcCounter,
    })
    return true
  },
}))
