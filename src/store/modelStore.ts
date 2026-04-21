import { create } from 'zustand'

export type PlaneId = 'XY' | 'XZ' | 'YZ'
export type AppMode = 'view' | 'sketch'
export type SketchTool = 'select' | 'line' | 'rect' | 'circle' | 'cut'

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
  plane: PlaneId
  elements: SketchElement[]
}

export interface ExtrudeFeature {
  id: string
  sketchId: string
  depth: number  // units along the plane's normal
}

interface ModelState {
  mode: AppMode
  activePlane: PlaneId | null
  hoveredPlane: PlaneId | null
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
  addExtrude: (sketchId: string, depth: number) => void
  deleteExtrude: (id: string) => void
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

  addExtrude: (sketchId, depth) =>
    set((s) => ({
      extrudes: [...s.extrudes, { id: crypto.randomUUID(), sketchId, depth }],
    })),

  deleteExtrude: (id) =>
    set((s) => ({ extrudes: s.extrudes.filter((e) => e.id !== id) })),

  enterSketch: (plane) =>
    set((s) => {
      // Re-entering sketch should load existing geometry for that plane.
      // Use the most recently committed sketch on that plane as the working set.
      const last = [...s.sketches].reverse().find((sk) => sk.plane === plane)
      return {
        mode: 'sketch',
        activePlane: plane,
        activeTool: 'select',
        sketchElements: last ? last.elements : [],
        selectedElementId: null,
        editingSketchId: last ? last.id : null,
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
        activeTool: 'select',
        sketchElements: [],
        selectedElementId: null,
        editingSketchId: null,
        sketches,
      }
    }),
}))
