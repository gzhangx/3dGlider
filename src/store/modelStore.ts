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
}
export interface SketchRect {
  type: 'rect'; id: string; start: SketchPoint; end: SketchPoint
}
export interface SketchCircle {
  type: 'circle'; id: string; center: SketchPoint; radius: number
}
export interface SketchArc {
  type: 'arc'; id: string; center: SketchPoint; radius: number; startAngle: number; endAngle: number
}
export type SketchElement = SketchLine | SketchRect | SketchCircle | SketchArc

export interface Sketch {
  id: string
  plane: SketchPlanePose
  elements: SketchElement[]
  color?: string
  opacity?: number
}

export interface ExtrudeFeature {
  id: string
  sketchId: string
  operation: 'add' | 'cut'
  depth: number  // units along the extrusion direction
  direction?: [number, number, number]  // world-space unit vector; omit = plane normal
  color?: string
  opacity?: number
}

export interface ModelData {
  version: number
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
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

function sanitizeModelData(value: unknown): { sketches: Sketch[]; extrudes: ExtrudeFeature[] } | null {
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
      const r = s as Sketch & { color?: unknown; opacity?: unknown }
      return {
        id: s.id,
        plane: {
          rotation: [s.plane.rotation[0], s.plane.rotation[1], s.plane.rotation[2]],
          offset: s.plane.offset,
        },
        elements: s.elements,
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
        ...(typeof rawE.color === 'string' ? { color: rawE.color } : {}),
        ...(typeof rawE.opacity === 'number' && Number.isFinite(rawE.opacity) ? { opacity: rawE.opacity } : {}),
      }
    })

  return { sketches, extrudes }
}

interface ModelState {
  mode: AppMode
  activePlane: SketchPlanePose | null
  hoveredPlane: PlaneId | null
  newSketchArmed: boolean
  activeTool: SketchTool
  sketchElements: SketchElement[]
  sketches: Sketch[]
  extrudes: ExtrudeFeature[]
  selectedElementId: string | null
  editingSketchId: string | null

  setHoveredPlane: (plane: PlaneId | null) => void
  setActiveTool: (tool: SketchTool) => void
  selectElement: (id: string | null) => void
  addSketchElement: (el: SketchElement) => void
  deleteSketchElement: (id: string) => void
  cutSketchElement: (id: string, replacements: SketchElement[]) => void
  addExtrude: (sketchId: string, depth: number, operation?: 'add' | 'cut', direction?: [number, number, number]) => void
  updateExtrude: (id: string, depth: number, operation: 'add' | 'cut', direction?: [number, number, number]) => void
  deleteExtrude: (id: string) => void
  setSketchAppearance: (id: string, color: string, opacity: number) => void
  setExtrudeAppearance: (id: string, color: string, opacity: number) => void
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
  sketchElements: [],
  sketches: [],
  extrudes: [],
  selectedElementId: null,
  editingSketchId: null,

  setHoveredPlane: (hoveredPlane) => set({ hoveredPlane }),
  setActiveTool: (activeTool) => set({ activeTool, selectedElementId: null }),
  selectElement: (selectedElementId) => set({ selectedElementId }),

  addSketchElement: (el) => set((s) => ({ sketchElements: [...s.sketchElements, el] })),

  deleteSketchElement: (id) =>
    set((s) => ({
      selectedElementId: null,
      sketchElements: s.sketchElements.filter((el) => el.id !== id),
      sketches: s.sketches
        .map((sk) => ({ ...sk, elements: sk.elements.filter((el) => el.id !== id) }))
        .filter((sk) => sk.elements.length > 0),
    })),

  cutSketchElement: (id, replacements) =>
    set((s) => ({
      sketchElements: [...s.sketchElements.filter((el) => el.id !== id), ...replacements],
    })),

  addExtrude: (sketchId, depth, operation = 'add', direction) =>
    set((s) => ({
      extrudes: [...s.extrudes, { id: crypto.randomUUID(), sketchId, operation, depth, ...(direction ? { direction } : {}) }],
    })),

  updateExtrude: (id, depth, operation, direction) =>
    set((s) => ({
      extrudes: s.extrudes.map((e) =>
        e.id === id
          ? { ...e, operation, depth, ...(direction ? { direction } : { direction: undefined }) }
          : e
      ),
    })),

  deleteExtrude: (id) =>
    set((s) => ({ extrudes: s.extrudes.filter((e) => e.id !== id) })),

  setSketchAppearance: (id, color, opacity) =>
    set((s) => ({ sketches: s.sketches.map((sk) => sk.id === id ? { ...sk, color, opacity } : sk) })),

  setExtrudeAppearance: (id, color, opacity) =>
    set((s) => ({ extrudes: s.extrudes.map((e) => e.id === id ? { ...e, color, opacity } : e) })),

  armNewSketch: () =>
    set((s) => (s.mode === 'view' ? { newSketchArmed: true } : s)),

  cancelNewSketch: () => set({ newSketchArmed: false }),

  startNewSketch: (plane, offset = 0) =>
    set({
      mode: 'sketch',
      activePlane: typeof plane === 'string' ? presetPlanePose(plane, offset) : plane,
      newSketchArmed: false,
      activeTool: 'select',
      sketchElements: [],
      selectedElementId: null,
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
        sketchElements: target.elements,
        selectedElementId: null,
        editingSketchId: target.id,
      }
    }),

  exitSketch: () =>
    set((s) => {
      let sketches = s.sketches
      if (s.activePlane && s.sketchElements.length > 0) {
        if (s.editingSketchId) {
          // Update existing sketch instead of creating a duplicate entry.
          sketches = sketches.map((sk) =>
            sk.id === s.editingSketchId
              ? { ...sk, plane: s.activePlane!, elements: s.sketchElements }
              : sk,
          )
        } else {
          // New sketch on this plane.
          sketches = [...sketches, { id: crypto.randomUUID(), plane: s.activePlane, elements: s.sketchElements }]
        }
      } else if (s.editingSketchId) {
        // If user cleared all elements while editing, delete the sketch.
        sketches = sketches.filter((sk) => sk.id !== s.editingSketchId)
      }

      return {
        mode: 'view',
        activePlane: null,
        newSketchArmed: false,
        activeTool: 'select',
        sketchElements: [],
        selectedElementId: null,
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
      sketchElements: [],
      selectedElementId: null,
      editingSketchId: null,
      sketches: parsed.sketches,
      extrudes: parsed.extrudes,
    })
    return true
  },
}))
