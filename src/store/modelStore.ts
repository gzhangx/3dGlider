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
}

export interface ExtrudeFeature {
  id: string
  sketchId: string
  operation: 'add' | 'cut'
  depth: number  // units along the plane's normal
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
  addExtrude: (sketchId: string, depth: number, operation?: 'add' | 'cut') => void
  deleteExtrude: (id: string) => void
  armNewSketch: () => void
  cancelNewSketch: () => void
  startNewSketch: (plane: PlaneId | SketchPlanePose, offset?: number) => void
  editSketch: (sketchId: string) => void
  exitSketch: () => void
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

  addExtrude: (sketchId, depth, operation = 'add') =>
    set((s) => ({
      extrudes: [...s.extrudes, { id: crypto.randomUUID(), sketchId, operation, depth }],
    })),

  deleteExtrude: (id) =>
    set((s) => ({ extrudes: s.extrudes.filter((e) => e.id !== id) })),

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
}))
