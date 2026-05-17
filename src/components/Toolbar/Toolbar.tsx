import { ChangeEvent, useRef, useState } from 'react'
import { useModelStore } from '../../store/modelStore'
import { exportSTEP } from '../../lib/exportSTEP'
import { exportSTL } from '../../lib/exportSTL'
import { planeIdFromPose } from '../../lib/planePose'
import { ParametersDialog } from '../ParametersDialog/ParametersDialog'
import styles from './Toolbar.module.css'

export function Toolbar() {
  const { mode, activePlane, extrudes, revolves, lofts, sweeps, shells, sketches, parameters, exitSketch, loadModel, resetSketchView, hideOtherSketches, setHideOtherSketches } = useModelStore()
  const activePlaneLabel = activePlane ? planeIdFromPose(activePlane) : null
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showParams, setShowParams] = useState(false)

  const handleSaveJson = () => {
    const payload = {
      version: 1,
      sketches,
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

  return (
    <>
      <header className={styles.toolbar}>
        <span className={styles.logo}>3D Glider</span>

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
              <button className={styles.exitBtn} onClick={() => setHideOtherSketches(!hideOtherSketches)} title="Toggle visibility of other sketches/extrudes">
                {hideOtherSketches ? 'Show Others' : 'Hide Others'}
              </button>
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
            onClick={() => exportSTL(extrudes, revolves, lofts, sweeps, sketches)}
            title={hasExports ? 'Export all solids as STL' : 'No solids to export'}
            disabled={!hasExports}
          >
            ⬇ Export STL
          </button>
          <button
            className={styles.exportBtn}
            onClick={() => exportSTEP(extrudes, revolves, lofts, sweeps, sketches)}
            title={hasExports ? 'Export all solids as STEP' : 'No solids to export'}
            disabled={!hasExports}
          >
            ⬇ Export STEP
          </button>
        </div>
      </header>

      {showParams && <ParametersDialog onClose={() => setShowParams(false)} />}
    </>
  )
}
