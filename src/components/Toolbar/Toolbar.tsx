import { useModelStore } from '../../store/modelStore'
import styles from './Toolbar.module.css'

export function Toolbar() {
  const { mode, activePlane, exitSketch } = useModelStore()

  return (
    <header className={styles.toolbar}>
      <span className={styles.logo}>3D Glider</span>

      <div className={styles.status}>
        {mode === 'view' && (
          <span className={styles.hint}>Click a plane (XY / XZ / YZ) to start a sketch</span>
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
    </header>
  )
}
