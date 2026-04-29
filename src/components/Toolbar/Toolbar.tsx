import { ChangeEvent, useRef } from 'react'
import { useModelStore } from '../../store/modelStore'
import { exportSTL } from '../../lib/exportSTL'
import { planeIdFromPose } from '../../lib/planePose'
import styles from './Toolbar.module.css'

export function Toolbar() {
  const { mode, activePlane, extrudes, revolves, sketches, exitSketch, loadModel } = useModelStore()
  const activePlaneLabel = activePlane ? planeIdFromPose(activePlane) : null
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveJson = () => {
    const payload = {
      version: 1,
      sketches,
      extrudes,
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

  return (
    <header className={styles.toolbar}>
      <span className={styles.logo}>3D Glider</span>

      <div className={styles.status}>
        {mode === 'view' && (
          <span className={styles.hint}>Use New Sketch, then pick XY / XZ / YZ or click a flat extruded face</span>
        )}
        {mode === 'sketch' && (
          <>
            <span className={styles.activeLabel}>Sketching on {activePlaneLabel}</span>
            <button className={styles.exitBtn} onClick={exitSketch}>
              Exit Sketch
            </button>
          </>
        )}
      </div>

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

      {extrudes.length > 0 && (
        <button
          className={styles.exportBtn}
          onClick={() => exportSTL(extrudes, revolves, sketches)}
          title="Export all extruded solids as binary STL"
        >
          ⬇ Export STL
        </button>
      )}
    </header>
  )
}
