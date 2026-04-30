import { useState } from 'react'
import { useModelStore, SketchTool, SketchLine } from '../../store/modelStore'
import { lineLength, angleBetween, applyLength, applyAngle } from '../../lib/constraintSolve'
import styles from './SketchSidebar.module.css'

interface ToolBtn {
  id: SketchTool
  label: string
  key: string
  icon: string
}

const TOOLS: ToolBtn[] = [
  { id: 'select',  label: 'Select',    key: 'S', icon: '↖' },
  { id: 'line',    label: 'Line',      key: 'L', icon: '╱' },
  { id: 'rect',    label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'circle',  label: 'Circle',    key: 'C', icon: '◯' },
  { id: 'cut',     label: 'Cut',       key: 'X', icon: '✂' },
]

export function SketchSidebar() {
  const {
    mode, activeTool, constructionMode, setActiveTool, setConstructionMode,
    sketchElements, sketchConstraints,
    selectedElementId, selectedElementId2, selectElement2,
    updateSketchElement, addSketchConstraint, deleteSketchConstraint,
  } = useModelStore()

  const [lengthInput, setLengthInput] = useState('')
  const [angleInput, setAngleInput] = useState('')

  if (mode !== 'sketch') return null

  // Get selected elements
  const sel1 = selectedElementId ? sketchElements.find((e) => e.id === selectedElementId) : null
  const sel2 = selectedElementId2 ? sketchElements.find((e) => e.id === selectedElementId2) : null
  const line1 = sel1?.type === 'line' ? (sel1 as SketchLine) : null
  const line2 = sel2?.type === 'line' ? (sel2 as SketchLine) : null

  // Constraints on selected element
  const selectedConstraints = selectedElementId
    ? sketchConstraints.filter((c) => {
        if (c.type === 'length') return c.elementId === selectedElementId
        if (c.type === 'angle') return c.elementId1 === selectedElementId || c.elementId2 === selectedElementId
        return c.p1.elementId === selectedElementId || c.p2.elementId === selectedElementId
      })
    : []

  const applyLengthConstraint = () => {
    if (!line1) return
    const v = parseFloat(lengthInput)
    if (isNaN(v) || v <= 0) return
    const updated = applyLength(line1, v)
    updateSketchElement(line1.id, { end: updated.end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'length', elementId: line1.id, value: v })
    setLengthInput('')
  }

  const applyAngleConstraint = () => {
    if (!line1 || !line2) return
    const v = parseFloat(angleInput)
    if (isNaN(v)) return
    const updated = applyAngle(line1, line2, v)
    updateSketchElement(line2.id, { end: updated.end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'angle', elementId1: line1.id, elementId2: line2.id, value: v })
    setAngleInput('')
  }

  const constraintLabel = (c: typeof sketchConstraints[number]) => {
    if (c.type === 'length') return `L = ${c.value}`
    if (c.type === 'angle') return `∠ = ${c.value}°`
    return `⊙ coincident`
  }

  const showConstraints = activeTool === 'select' && selectedElementId

  return (
    <aside className={styles.sidebar}>
      <span className={styles.heading}>Tools</span>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`${styles.btn} ${activeTool === t.id ? styles.active : ''}`}
          onClick={() => setActiveTool(t.id)}
          title={`${t.label} (${t.key})`}
        >
          <span className={styles.icon}>{t.icon}</span>
          <span className={styles.label}>{t.label}</span>
          <span className={styles.key}>{t.key}</span>
        </button>
      ))}

      <div className={styles.divider} />

      <button
        className={`${styles.btn} ${styles.constructionBtn} ${constructionMode ? styles.constructionActive : ''}`}
        onClick={() => setConstructionMode(!constructionMode)}
        title="Construction geometry — dashed lines not used for extrude/revolve"
      >
        <span className={styles.icon}>- -</span>
        <span className={styles.label}>Construction</span>
      </button>

      {showConstraints && (
        <>
          <div className={styles.divider} />
          <span className={styles.sectionLabel}>Constrain</span>

          {/* Length constraint (line selected) */}
          {line1 && (
            <div className={styles.constraintRow}>
              <span className={styles.constraintIcon}>↔</span>
              <input
                className={styles.constraintInput}
                type="number"
                placeholder={lineLength(line1).toFixed(3)}
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyLengthConstraint()}
                title="Set line length"
              />
              <button className={styles.constraintBtn} onClick={applyLengthConstraint}>Set</button>
            </div>
          )}

          {/* Angle constraint (two lines selected) */}
          {line1 && (
            <div className={styles.constraintRow}>
              <span className={styles.constraintIcon}>∠</span>
              <input
                className={styles.constraintInput}
                type="number"
                placeholder={line2 ? angleBetween(line1, line2).toFixed(1) + '°' : 'Shift+click line2'}
                value={angleInput}
                onChange={(e) => setAngleInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyAngleConstraint()}
                title="Set angle between two lines — Shift+click second line first"
                disabled={!line2}
              />
              <button className={styles.constraintBtn} onClick={applyAngleConstraint} disabled={!line2}>Set</button>
            </div>
          )}

          {line2 && (
            <div className={styles.constraintHint}>
              2nd line selected
              <button className={styles.clearSel2} onClick={() => selectElement2(null)}>✕</button>
            </div>
          )}

          {/* Constraint list */}
          {selectedConstraints.length > 0 && (
            <div className={styles.constraintList}>
              {selectedConstraints.map((c) => (
                <div key={c.id} className={styles.constraintItem}>
                  <span className={styles.constraintItemLabel}>{constraintLabel(c)}</span>
                  <button className={styles.constraintDeleteBtn} onClick={() => deleteSketchConstraint(c.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className={styles.hint}>
        {activeTool === 'select' && !selectedElementId && 'Click element to select · Shift+click 2nd line for angle'}
        {activeTool === 'select' && selectedElementId && !line1 && 'Selected — set constraints below'}
        {activeTool === 'select' && line1 && !line2 && 'Line selected — Shift+click 2nd line for angle'}
        {activeTool === 'select' && line1 && line2 && 'Two lines selected — set angle below'}
        {activeTool !== 'select' && !constructionMode && 'Click 1st point · Click 2nd point · Esc cancel'}
        {activeTool !== 'select' && constructionMode && 'Drawing construction geometry'}
      </div>
    </aside>
  )
}
