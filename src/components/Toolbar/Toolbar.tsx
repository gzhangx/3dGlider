import { ChangeEvent, lazy, Suspense, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore } from '../../store/modelStore'
import { planeIdFromPose } from '../../lib/planePose'
import { ParametersDialog } from '../ParametersDialog/ParametersDialog'
import styles from './Toolbar.module.css'
import { SCENE_TO_MM } from '../../lib/units'

const ScriptEditor = lazy(() => import('../ScriptEditor/ScriptEditor').then((module) => ({ default: module.ScriptEditor })))

export function Toolbar() {
  const {
    mode, activePlane, extrudes, revolves, lofts, sweeps, shells, sketches, parameters,
    sketchElements, sketchConstraints, editingSketchId,
    exitSketch, loadModel, resetSketchView, hideOtherSketches, setHideOtherSketches,
  } = useModelStore(useShallow((state) => ({
    mode: state.mode, activePlane: state.activePlane, extrudes: state.extrudes,
    revolves: state.revolves, lofts: state.lofts, sweeps: state.sweeps,
    shells: state.shells, sketches: state.sketches, parameters: state.parameters,
    sketchElements: state.sketchElements, sketchConstraints: state.sketchConstraints,
    editingSketchId: state.editingSketchId, exitSketch: state.exitSketch,
    loadModel: state.loadModel, resetSketchView: state.resetSketchView,
    hideOtherSketches: state.hideOtherSketches, setHideOtherSketches: state.setHideOtherSketches,
  })))
  const activePlaneLabel = activePlane ? planeIdFromPose(activePlane) : null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showParams, setShowParams] = useState(false)
  const [showScriptEditor, setShowScriptEditor] = useState(false)
  const [showPlaneEditor, setShowPlaneEditor] = useState(false)
  const [offsetMmInput, setOffsetMmInput] = useState('0')
  const [rotXInput, setRotXInput] = useState('0')
  const [rotYInput, setRotYInput] = useState('0')
  const [rotZInput, setRotZInput] = useState('0')

  const setActivePlane = useModelStore((s) => s.setActivePlane)

  const handleSaveJson = () => {
    // Include the active, in-progress sketch when in sketch mode so the
    // exported JSON contains what the user currently sees on-screen.
    const exportSketches = [...sketches]
    if (mode === 'sketch' && activePlane && sketchElements && sketchElements.length > 0) {
      const id = editingSketchId ?? crypto.randomUUID()
      const constraints = sketchConstraints && sketchConstraints.length > 0 ? sketchConstraints : undefined
      const current = { id, plane: activePlane, elements: sketchElements, ...(constraints ? { constraints } : {}) }
      if (editingSketchId) {
        const idx = exportSketches.findIndex((s) => s.id === editingSketchId)
        if (idx >= 0) exportSketches[idx] = current
        else exportSketches.push(current)
      } else {
        exportSketches.push(current)
      }
    }

    const payload = {
      version: 1,
      sketches: exportSketches,
      extrudes,
      revolves,
      lofts,
      sweeps,
      shells,
      parameters,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `3dglider-model-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleLoadJson = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const ok = loadModel(parsed)
      if (!ok) {
        window.alert('Invalid model JSON format.')
      }
    } catch {
      window.alert('Failed to load JSON file.')
    }
  }

  const hasExports = extrudes.length > 0 || revolves.length > 0 || lofts.length > 0 || sweeps.length > 0
  const handleExportSTL = async () => {
    const { exportSTL } = await import('../../lib/exportSTL')
    exportSTL(extrudes, revolves, lofts, sweeps, shells, sketches)
  }
  const handleExportSTEP = async () => {
    const { exportSTEP } = await import('../../lib/exportSTEP')
    exportSTEP(extrudes, revolves, lofts, sweeps, shells, sketches)
  }

  return (
    <>
      <header className={styles.toolbar}>
        <span className={styles.logo}>3D Glider v.01</span>

        <div className={styles.status}>
          {mode === 'view' && (
            <span className={styles.hint}>Use New Sketch, then pick XY / XZ / YZ or click a flat extruded face</span>
          )}
          {mode === 'sketch' && (
            <>
              <span className={styles.activeLabel}>Sketching on {activePlaneLabel}</span>
              <button className={styles.exitBtn} onClick={resetSketchView} title="Reset view perpendicular to sketch plane">
                Reset View
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }} title="Show other sketches and solids while sketching">
                <input
                  type="checkbox"
                  checked={!hideOtherSketches}
                  onChange={(e) => setHideOtherSketches(!e.target.checked)}
                />
                <span style={{ fontSize: '0.9rem' }}>Show Others</span>
              </label>

              <button className={styles.exitBtn} onClick={() => {
                // Open plane editor and initialize inputs from current activePlane
                if (activePlane) {
                  setOffsetMmInput(String((activePlane.offset * SCENE_TO_MM).toFixed(2)))
                  setRotXInput(String((activePlane.rotation[0] * 180 / Math.PI).toFixed(2)))
                  setRotYInput(String((activePlane.rotation[1] * 180 / Math.PI).toFixed(2)))
                  setRotZInput(String((activePlane.rotation[2] * 180 / Math.PI).toFixed(2)))
                }
                setShowPlaneEditor(true)
              }} title="Edit sketch plane">
                Edit Plane
              </button>
              {showPlaneEditor && (
                <div style={{ position: 'absolute', left: 200, top: 48, background: '#222', padding: 8, borderRadius: 6, zIndex: 200 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.85rem' }}>Offset (mm)</label>
                    <input type="number" value={offsetMmInput} onChange={(e) => setOffsetMmInput(e.target.value)} style={{ width: 80 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.85rem' }}>Rx</label>
                    <input type="number" value={rotXInput} onChange={(e) => setRotXInput(e.target.value)} style={{ width: 64 }} />
                    <label style={{ fontSize: '0.85rem' }}>Ry</label>
                    <input type="number" value={rotYInput} onChange={(e) => setRotYInput(e.target.value)} style={{ width: 64 }} />
                    <label style={{ fontSize: '0.85rem' }}>Rz</label>
                    <input type="number" value={rotZInput} onChange={(e) => setRotZInput(e.target.value)} style={{ width: 64 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className={styles.exitBtn} onClick={() => setShowPlaneEditor(false)}>Close</button>
                    <button className={styles.saveBtn} onClick={() => {
                      const off = parseFloat(offsetMmInput)
                      const rx = parseFloat(rotXInput)
                      const ry = parseFloat(rotYInput)
                      const rz = parseFloat(rotZInput)
                      if (!Number.isFinite(off) || !Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) return
                      setActivePlane({ rotation: [rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180], offset: off / SCENE_TO_MM })
                      setShowPlaneEditor(false)
                    }}>Apply</button>
                  </div>
                </div>
              )}
              <button className={styles.exitBtn} onClick={exitSketch}>
                Exit Sketch
              </button>
            </>
          )}
        </div>

        <button
          className={styles.paramsBtn}
          onClick={() => setShowParams(true)}
          title="Open parameters spreadsheet"
        >
          {'{ }'} Params
        </button>

        <button
          className={styles.scriptBtn}
          onClick={() => setShowScriptEditor(true)}
          title="Open script editor"
        >
          {'<>'} Script
        </button>

        <button
          className={styles.saveBtn}
          onClick={handleSaveJson}
          title="Save current model as JSON"
        >
          Save JSON
        </button>

        <button
          className={styles.loadBtn}
          onClick={handleLoadJson}
          title="Load model from JSON"
        >
          Load JSON
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div className={styles.exportActions}>
          <button
            className={styles.exportBtn}
            onClick={handleExportSTL}
            title={hasExports ? 'Export all solids as STL' : 'No solids to export'}
            disabled={!hasExports}
          >
            ⬇ Export STL
          </button>
          <button
            className={styles.exportBtn}
            onClick={handleExportSTEP}
            title={hasExports ? 'Export all solids as STEP' : 'No solids to export'}
            disabled={!hasExports}
          >
            ⬇ Export STEP
          </button>
        </div>
      </header>

      {showParams && <ParametersDialog onClose={() => setShowParams(false)} />}
      {showScriptEditor && (
        <Suspense fallback={null}>
          <ScriptEditor onClose={() => setShowScriptEditor(false)} />
        </Suspense>
      )}
    </>
  )
}
