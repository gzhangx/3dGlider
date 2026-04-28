import { useState } from 'react'
import { useModelStore, Sketch, PlaneId } from '../../store/modelStore'
import { planeIdFromPose } from '../../lib/planePose'
import { sketchElementsToShape } from '../../lib/sketchToShape'
import styles from './FeatureTree.module.css'

function SketchRow({ sketch }: { sketch: Sketch }) {
  const { extrudes, addExtrude, deleteExtrude, editSketch } = useModelStore()
  const [depth, setDepth] = useState('5')
  const [operation, setOperation] = useState<'add' | 'cut'>('add')

  const existing = extrudes.filter((e) => e.sketchId === sketch.id)
  const canExtrude = sketchElementsToShape(sketch.elements).length > 0
  const planeLabel = planeIdFromPose(sketch.plane)

  const handleExtrude = () => {
    const d = parseFloat(depth)
    if (!isNaN(d) && d !== 0) addExtrude(sketch.id, d, operation)
  }

  return (
    <div className={styles.sketchGroup}>
      <div className={styles.sketchRow}>
        <span className={styles.sketchIcon}>✏</span>
        <span className={styles.sketchLabel}>
          Sketch ({planeLabel})
          <span className={styles.count}>{sketch.elements.length} el</span>
        </span>
        <button
          className={styles.editBtn}
          title="Re-open sketch"
          onClick={() => editSketch(sketch.id)}
        >
          ✎
        </button>
      </div>

      {existing.map((ext) => (
        <div key={ext.id} className={styles.extrudeRow}>
          <span className={styles.extrudeIcon}>{ext.operation === 'cut' ? '▼' : '▲'}</span>
          <span className={styles.extrudeLabel}>{ext.operation === 'cut' ? 'Pocket' : 'Extrude'} {ext.depth} u</span>
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
          <select
            className={styles.opSelect}
            value={operation}
            onChange={(e) => setOperation(e.target.value as 'add' | 'cut')}
            title="Feature operation"
          >
            <option value="add">Add</option>
            <option value="cut">Cut</option>
          </select>
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
            {operation === 'cut' ? 'Pocket ▶' : 'Extrude ▶'}
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

function NewSketchRow() {
  const { mode, newSketchArmed, armNewSketch, cancelNewSketch, startNewSketch } = useModelStore()
  const [plane, setPlane] = useState<PlaneId>('XY')

  if (!newSketchArmed) {
    return (
      <div className={styles.newSketchRow}>
        <button
          className={styles.newSketchBtn}
          onClick={armNewSketch}
          disabled={mode === 'sketch'}
          title="Create a new sketch"
        >
          + New Sketch
        </button>
      </div>
    )
  }

  return (
    <>
      <div className={styles.newSketchRow}>
        <select
          className={styles.planeSelect}
          value={plane}
          disabled={mode === 'sketch'}
          onChange={(e) => setPlane(e.target.value as PlaneId)}
          title="Sketch plane"
        >
          <option value="XY">XY</option>
          <option value="XZ">XZ</option>
          <option value="YZ">YZ</option>
        </select>
        <button
          className={styles.newSketchBtn}
          onClick={() => startNewSketch(plane)}
          disabled={mode === 'sketch'}
          title="Start sketch on selected plane"
        >
          Start
        </button>
        <button
          className={styles.cancelBtn}
          onClick={cancelNewSketch}
          title="Cancel new sketch"
        >
          Cancel
        </button>
      </div>
      <div className={styles.pickHint}>Or click a plane or flat extruded face in the viewport</div>
    </>
  )
}

export function FeatureTree() {
  const { sketches } = useModelStore()

  return (
    <aside className={styles.panel}>
      <span className={styles.heading}>Features</span>
      <NewSketchRow />
      {sketches.length === 0 && (
        <span className={styles.empty}>No sketches yet</span>
      )}
      {sketches.map((s) => (
        <SketchRow key={s.id} sketch={s} />
      ))}
    </aside>
  )
}
