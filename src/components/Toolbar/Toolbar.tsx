import { useModelStore } from '../../store/modelStore'
import { exportSTL } from '../../lib/exportSTL'
import styles from './Toolbar.module.css'

export function Toolbar() {
  const { mode, activePlane, extrudes, sketches, exitSketch } = useModelStore()

  return (
    <header className={styles.toolbar}>
      <span className={styles.logo}>3D Glider</span>

      <div className={styles.status}>
        {mode === 'view' && (
          <span className={styles.hint}>Use New Sketch, then pick XY / XZ / YZ or click a flat extruded face</span>
        )}
        {mode === 'sketch' && (
          <>
            <span className={styles.activeLabel}>Sketching on {activePlane}</span>
            <button className={styles.exitBtn} onClick={exitSketch}>
              Exit Sketch
            </button>
          </>
        )}
      </div>

      {extrudes.length > 0 && (
        <button
          className={styles.exportBtn}
          onClick={() => exportSTL(extrudes, sketches)}
          title="Export all extruded solids as binary STL"
        >
          ⬇ Export STL
        </button>
      )}
    </header>
  )
}
