import { useState } from 'react'
import { useModelStore, Sketch } from '../../store/modelStore'
import { sketchElementsToShape } from '../../lib/sketchToShape'
import styles from './FeatureTree.module.css'

function SketchRow({ sketch }: { sketch: Sketch }) {
  const { extrudes, addExtrude, deleteExtrude, enterSketch } = useModelStore()
  const [depth, setDepth] = useState('5')

  const existing = extrudes.filter((e) => e.sketchId === sketch.id)
  const canExtrude = sketchElementsToShape(sketch.elements, sketch.plane) !== null

  const handleExtrude = () => {
    const d = parseFloat(depth)
    if (!isNaN(d) && d !== 0) addExtrude(sketch.id, d)
  }

  return (
    <div className={styles.sketchGroup}>
      <div className={styles.sketchRow}>
        <span className={styles.sketchIcon}>✏</span>
        <span className={styles.sketchLabel}>
          Sketch ({sketch.plane})
          <span className={styles.count}>{sketch.elements.length} el</span>
        </span>
        <button
          className={styles.editBtn}
          title="Re-open sketch"
          onClick={() => enterSketch(sketch.plane)}
        >
          ✎
        </button>
      </div>

      {existing.map((ext) => (
        <div key={ext.id} className={styles.extrudeRow}>
          <span className={styles.extrudeIcon}>▲</span>
          <span className={styles.extrudeLabel}>Extrude {ext.depth} u</span>
          <button
            className={styles.deleteBtn}
            title="Delete extrude"
            onClick={() => deleteExtrude(ext.id)}
          >
            ✕
          </button>
        </div>
      ))}

      {canExtrude && (
        <div className={styles.extrudeForm}>
          <input
            type="number"
            className={styles.depthInput}
            value={depth}
            step="0.5"
            onChange={(e) => setDepth(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtrude()}
          />
          <span className={styles.unit}>u</span>
          <button className={styles.extrudeBtn} onClick={handleExtrude}>
            Extrude ▶
          </button>
        </div>
      )}

      {!canExtrude && (
        <div className={styles.noProfile}>
          No closed profile — draw a rect, circle, or closed lines
        </div>
      )}
    </div>
  )
}

export function FeatureTree() {
  const { sketches } = useModelStore()

  return (
    <aside className={styles.panel}>
      <span className={styles.heading}>Features</span>
      {sketches.length === 0 && (
        <span className={styles.empty}>No sketches yet</span>
      )}
      {sketches.map((s) => (
        <SketchRow key={s.id} sketch={s} />
      ))}
    </aside>
  )
}
