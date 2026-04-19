import { create } from 'zustand'

export type PlaneId = 'XY' | 'XZ' | 'YZ'
export type AppMode = 'view' | 'sketch'
export type SketchTool = 'select' | 'line' | 'rect' | 'circle'

export type SketchPoint = { x: number; y: number }

export interface SketchLine {
  type: 'line'
  id: string
  start: SketchPoint
  end: SketchPoint
}

export interface SketchRect {
  type: 'rect'
  id: string
  start: SketchPoint
  end: SketchPoint
}

export interface SketchCircle {
  type: 'circle'
  id: string
  center: SketchPoint
  radius: number
}

export type SketchElement = SketchLine | SketchRect | SketchCircle

export interface Sketch {
  id: string
  plane: PlaneId
  elements: SketchElement[]
}

interface ModelState {
  mode: AppMode
  activePlane: PlaneId | null
  hoveredPlane: PlaneId | null
  activeTool: SketchTool
  sketchElements: SketchElement[]
  sketches: Sketch[]
  selectedElementId: string | null

  setHoveredPlane: (plane: PlaneId | null) => void
  setActiveTool: (tool: SketchTool) => void
  selectElement: (id: string | null) => void
  addSketchElement: (el: SketchElement) => void
  deleteSketchElement: (id: string) => void
  enterSketch: (plane: PlaneId) => void
  exitSketch: () => void
}

export const useModelStore = create<ModelState>((set) => ({
  mode: 'view',
  activePlane: null,
  hoveredPlane: null,
  activeTool: 'select',
  sketchElements: [],
  sketches: [],
  selectedElementId: null,

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

  enterSketch: (plane) =>
    set({ mode: 'sketch', activePlane: plane, activeTool: 'select', sketchElements: [], selectedElementId: null }),

  exitSketch: () =>
    set((s) => {
      const committed =
        s.activePlane && s.sketchElements.length > 0
          ? [...s.sketches, { id: crypto.randomUUID(), plane: s.activePlane, elements: s.sketchElements }]
          : s.sketches
      return { mode: 'view', activePlane: null, activeTool: 'select', sketchElements: [], selectedElementId: null, sketches: committed }
    }),
}))
