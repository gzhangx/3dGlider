import { create } from 'zustand'

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
}
export interface SketchRect {
  type: 'rect'; id: string; start: SketchPoint; end: SketchPoint
  construction?: boolean
}
export interface SketchCircle {
  type: 'circle'; id: string; center: SketchPoint; radius: number
  construction?: boolean
}
export interface SketchArc {
  type: 'arc'; id: string; center: SketchPoint; radius: number; startAngle: number; endAngle: number
  construction?: boolean
}
export type SketchElement = SketchLine | SketchRect | SketchCircle | SketchArc

// ── Sketch constraints ────────────────────────────────────────────────────────
export type PointRef = { elementId: string; which: 'start' | 'end' }
export interface LengthConstraint       { id: string; type: 'length';       elementId: string; value: number; dimension?: 'width' | 'height' | 'radius' }
export interface AngleConstraint        { id: string; type: 'angle';        elementId1: string; elementId2: string; value: number }
export interface CoincidentConstraint   { id: string; type: 'coincident';   p1: PointRef; p2: PointRef }
export interface ParallelConstraint     { id: string; type: 'parallel';     elementId1: string; elementId2: string }
export interface PerpendicularConstraint{ id: string; type: 'perpendicular'; elementId1: string; elementId2: string }
export interface HorizontalConstraint   { id: string; type: 'horizontal';   elementId: string }
export interface VerticalConstraint     { id: string; type: 'vertical';     elementId: string }
export interface EqualConstraint        { id: string; type: 'equal';        elementId1: string; elementId2: string }
export type SketchConstraint =
  | LengthConstraint | AngleConstraint | CoincidentConstraint
  | ParallelConstraint | PerpendicularConstraint
  | HorizontalConstraint | VerticalConstraint | EqualConstraint

export interface Sketch {
  id: string
  plane: SketchPlanePose
  elements: SketchElement[]
  constraints?: SketchConstraint[]
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

export interface ModelData {
  version: number
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
  revolves: RevolveFeature[]
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

function sanitizeModelData(value: unknown): { sketches: Sketch[]; extrudes: ExtrudeFeature[]; revolves: RevolveFeature[]; parameters: Parameter[] } | null {
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

  const parameters: Parameter[] = Array.isArray(raw.parameters)
    ? (raw.parameters as unknown[]).filter((p): p is Parameter =>
        !!p && typeof p === 'object'
        && typeof (p as Parameter).id === 'string'
        && typeof (p as Parameter).name === 'string'
        && typeof (p as Parameter).value === 'number'
        && Number.isFinite((p as Parameter).value))
    : []

  return { sketches, extrudes, revolves, parameters }
}

interface ModelState {
  mode: AppMode
  activePlane: SketchPlanePose | null
  hoveredPlane: PlaneId | null
  newSketchArmed: boolean
  activeTool: SketchTool
  constructionMode: boolean
  sketchElements: SketchElement[]
  sketchConstraints: SketchConstraint[]   // constraints for current working sketch
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
  revolves: RevolveFeature[]
  parameters: Parameter[]
  selectedElementId: string | null
  selectedElementId2: string | null       // second selection for angle constraint
  isDraggingPoint: boolean
  editingSketchId: string | null
  editingExtrudeId: string | null
  previewExtrude: ExtrudeFeature | null

  setHoveredPlane: (plane: PlaneId | null) => void
  setActiveTool: (tool: SketchTool) => void
  setConstructionMode: (on: boolean) => void
  selectElement: (id: string | null) => void
  selectElement2: (id: string | null) => void
  setIsDraggingPoint: (v: boolean) => void
  addSketchElement: (el: SketchElement) => void
  updateSketchElement: (id: string, updates: Partial<SketchElement>) => void
  deleteSketchElement: (id: string) => void
  cutSketchElement: (id: string, replacements: SketchElement[]) => void
  addSketchConstraint: (c: SketchConstraint) => void
  deleteSketchConstraint: (id: string) => void
  addExtrude: (sketchId: string, depth: number, operation?: 'add' | 'cut', direction?: [number, number, number], symmetric?: boolean) => void
  updateExtrude: (id: string, depth: number, operation: 'add' | 'cut', direction?: [number, number, number], symmetric?: boolean) => void
  deleteExtrude: (id: string) => void
  setSketchAppearance: (id: string, color: string, opacity: number) => void
  setExtrudeAppearance: (id: string, color: string, opacity: number) => void
  setEditingExtrudeId: (id: string | null) => void
  setPreviewExtrude: (preview: ExtrudeFeature | null) => void
  addRevolve: (sketchId: string, axisType: RevolveAxis, angle: number, axisElementId?: string) => void
  updateRevolve: (id: string, axisType: RevolveAxis, angle: number, axisElementId?: string) => void
  deleteRevolve: (id: string) => void
  setRevolveAppearance: (id: string, color: string, opacity: number) => void
  addParameter: (name: string, value: number) => void
  updateParameter: (id: string, name: string, value: number) => void
  deleteParameter: (id: string) => void
  armNewSketch: () => void
  cancelNewSketch: () => void
  startNewSketch: (plane: PlaneId | SketchPlanePose, offset?: number) => void
  editSketch: (sketchId: string) => void
  exitSketch: () => void
  loadModel: (data: unknown) => boolean
}

export const useModelStore = create<ModelState>((set) => ({
  mode: 'view',
  activePlane: null,
  hoveredPlane: null,
  newSketchArmed: false,
  activeTool: 'select',
  constructionMode: false,
  sketchElements: [],
  sketchConstraints: [],
  sketches: [],
  extrudes: [],
  revolves: [],
  parameters: [],
  selectedElementId: null,
  selectedElementId2: null,
  isDraggingPoint: false,
  editingSketchId: null,
  editingExtrudeId: null,
  previewExtrude: null,

  setHoveredPlane: (hoveredPlane) => set({ hoveredPlane }),
  setActiveTool: (activeTool) => set({ activeTool, selectedElementId: null, selectedElementId2: null }),
  setConstructionMode: (constructionMode) => set({ constructionMode }),
  selectElement: (selectedElementId) => set({ selectedElementId }),
  selectElement2: (selectedElementId2) => set({ selectedElementId2 }),
  setIsDraggingPoint: (isDraggingPoint) => set({ isDraggingPoint }),

  addSketchElement: (el) => set((s) => ({ sketchElements: [...s.sketchElements, el] })),

  updateSketchElement: (id, updates) =>
    set((s) => ({
      sketchElements: s.sketchElements.map((el) => el.id === id ? { ...el, ...updates } as SketchElement : el),
    })),

  deleteSketchElement: (id) =>
    set((s) => ({
      selectedElementId: null,
      selectedElementId2: null,
      sketchElements: s.sketchElements.filter((el) => el.id !== id),
      sketchConstraints: s.sketchConstraints.filter((c) => {
        if (c.type === 'length' || c.type === 'horizontal' || c.type === 'vertical')
          return c.elementId !== id
        if (c.type === 'angle' || c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'equal')
          return c.elementId1 !== id && c.elementId2 !== id
        if (c.type === 'coincident')
          return c.p1.elementId !== id && c.p2.elementId !== id
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

  addExtrude: (sketchId, depth, operation = 'add', direction, symmetric) =>
    set((s) => ({
      extrudes: [...s.extrudes, { id: crypto.randomUUID(), sketchId, operation, depth, ...(direction ? { direction } : {}), ...(symmetric ? { symmetric } : {}) }],
    })),

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

  setExtrudeAppearance: (id, color, opacity) =>
    set((s) => ({ extrudes: s.extrudes.map((e) => e.id === id ? { ...e, color, opacity } : e) })),

  setEditingExtrudeId: (editingExtrudeId) => set({ editingExtrudeId }),

  setPreviewExtrude: (previewExtrude) => set({ previewExtrude }),

  addRevolve: (sketchId, axisType, angle, axisElementId) =>
    set((s) => ({
      revolves: [...s.revolves, {
        id: crypto.randomUUID(), sketchId, axisType, angle,
        ...(axisType === 'element' && axisElementId ? { axisElementId } : {}),
      }],
    })),

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

  addParameter: (name, value) =>
    set((s) => ({ parameters: [...s.parameters, { id: crypto.randomUUID(), name, value }] })),

  updateParameter: (id, name, value) =>
    set((s) => ({ parameters: s.parameters.map((p) => p.id === id ? { ...p, name, value } : p) })),

  deleteParameter: (id) =>
    set((s) => ({ parameters: s.parameters.filter((p) => p.id !== id) })),

  armNewSketch: () =>
    set((s) => (s.mode === 'view' ? { newSketchArmed: true } : s)),

  cancelNewSketch: () => set({ newSketchArmed: false }),

  startNewSketch: (plane, offset = 0) =>
    set({
      mode: 'sketch',
      activePlane: typeof plane === 'string' ? presetPlanePose(plane, offset) : plane,
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

  exitSketch: () =>
    set((s) => {
      let sketches = s.sketches
      if (s.activePlane && s.sketchElements.length > 0) {
        const constraints = s.sketchConstraints.length > 0 ? s.sketchConstraints : undefined
        if (s.editingSketchId) {
          sketches = sketches.map((sk) =>
            sk.id === s.editingSketchId
              ? { ...sk, plane: s.activePlane!, elements: s.sketchElements, ...(constraints ? { constraints } : { constraints: undefined }) }
              : sk,
          )
        } else {
          sketches = [...sketches, { id: crypto.randomUUID(), plane: s.activePlane, elements: s.sketchElements, ...(constraints ? { constraints } : {}) }]
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
    }),

  loadModel: (data) => {
    const parsed = sanitizeModelData(data)
    if (!parsed) return false
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
      parameters: parsed.parameters,
    })
    return true
  },
}))
