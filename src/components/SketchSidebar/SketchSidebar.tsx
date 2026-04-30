import { useState } from 'react'
import { useModelStore, SketchTool, SketchLine, SketchRect, SketchCircle } from '../../store/modelStore'
import {
  lineLength, angleBetween, applyLength, applyAngle,
  rectWidth, rectHeight, applyRectWidth, applyRectHeight,
  applyRadius,
} from '../../lib/constraintSolve'
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

  const [input1, setInput1] = useState('')   // length / width / radius
  const [input2, setInput2] = useState('')   // height (rect) / angle (line)
  const [angleInput, setAngleInput] = useState('')

  if (mode !== 'sketch') return null

  const sel1 = selectedElementId ? sketchElements.find((e) => e.id === selectedElementId) : null
  const sel2 = selectedElementId2 ? sketchElements.find((e) => e.id === selectedElementId2) : null
  const line1  = sel1?.type === 'line'   ? (sel1 as SketchLine)   : null
  const rect1  = sel1?.type === 'rect'   ? (sel1 as SketchRect)   : null
  const circle1 = sel1?.type === 'circle' ? (sel1 as SketchCircle) : null
  const line2  = sel2?.type === 'line'   ? (sel2 as SketchLine)   : null

  const selectedConstraints = selectedElementId
    ? sketchConstraints.filter((c) => {
        if (c.type === 'length') return c.elementId === selectedElementId
        if (c.type === 'angle') return c.elementId1 === selectedElementId || c.elementId2 === selectedElementId
        return c.p1.elementId === selectedElementId || c.p2.elementId === selectedElementId
      })
    : []

  // ── Line handlers ──────────────────────────────────────────────────────────
  const applyLineLength = () => {
    if (!line1) return
    const v = parseFloat(input1)
    if (isNaN(v) || v <= 0) return
    updateSketchElement(line1.id, { end: applyLength(line1, v).end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'length', elementId: line1.id, value: v })
    setInput1('')
  }

  const applyLineAngle = () => {
    if (!line1 || !line2) return
    const v = parseFloat(angleInput)
    if (isNaN(v)) return
    updateSketchElement(line2.id, { end: applyAngle(line1, line2, v).end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'angle', elementId1: line1.id, elementId2: line2.id, value: v })
    setAngleInput('')
  }

  // ── Rect handlers ──────────────────────────────────────────────────────────
  const applyRectW = () => {
    if (!rect1) return
    const v = parseFloat(input1)
    if (isNaN(v) || v <= 0) return
    updateSketchElement(rect1.id, { end: applyRectWidth(rect1, v).end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'length', elementId: rect1.id, value: v, dimension: 'width' })
    setInput1('')
  }

  const applyRectH = () => {
    if (!rect1) return
    const v = parseFloat(input2)
    if (isNaN(v) || v <= 0) return
    updateSketchElement(rect1.id, { end: applyRectHeight(rect1, v).end })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'length', elementId: rect1.id, value: v, dimension: 'height' })
    setInput2('')
  }

  // ── Circle handler ─────────────────────────────────────────────────────────
  const applyCircleRadius = () => {
    if (!circle1) return
    const v = parseFloat(input1)
    if (isNaN(v) || v <= 0) return
    updateSketchElement(circle1.id, { radius: applyRadius(circle1, v).radius })
    addSketchConstraint({ id: crypto.randomUUID(), type: 'length', elementId: circle1.id, value: v, dimension: 'radius' })
    setInput1('')
  }

  const constraintLabel = (c: typeof sketchConstraints[number]) => {
    if (c.type === 'length') {
      if (c.dimension === 'width')  return `W = ${c.value}`
      if (c.dimension === 'height') return `H = ${c.value}`
      if (c.dimension === 'radius') return `R = ${c.value}`
      return `L = ${c.value}`
    }
    if (c.type === 'angle') return `∠ = ${c.value}°`
    return `⊙ coincident`
  }

  const showConstraints = activeTool === 'select' && !!sel1

  let hintText = ''
  if (activeTool !== 'select') {
    hintText = constructionMode ? 'Drawing construction geometry' : 'Click 1st point · Click 2nd point · Esc cancel'
  } else if (!sel1) {
    hintText = 'Click element to select'
  } else if (line1 && !line2) {
    hintText = 'Shift+click 2nd line for angle'
  } else if (line1 && line2) {
    hintText = 'Set angle between two lines'
  }

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

          {/* ── Line ── */}
          {line1 && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>↔</span>
                <input
                  className={styles.constraintInput}
                  type="number"
                  placeholder={lineLength(line1).toFixed(3)}
                  value={input1}
                  onChange={(e) => setInput1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyLineLength()}
                  title="Set line length"
                />
                <button className={styles.constraintBtn} onClick={applyLineLength}>Set</button>
              </div>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>∠</span>
                <input
                  className={styles.constraintInput}
                  type="number"
                  placeholder={line2 ? angleBetween(line1, line2).toFixed(1) + '°' : 'Shift+click 2nd'}
                  value={angleInput}
                  onChange={(e) => setAngleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyLineAngle()}
                  disabled={!line2}
                  title="Set angle — Shift+click second line first"
                />
                <button className={styles.constraintBtn} onClick={applyLineAngle} disabled={!line2}>Set</button>
              </div>
              {line2 && (
                <div className={styles.constraintHint}>
                  2nd line selected
                  <button className={styles.clearSel2} onClick={() => selectElement2(null)}>✕</button>
                </div>
              )}
            </>
          )}

          {/* ── Rectangle ── */}
          {rect1 && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>W</span>
                <input
                  className={styles.constraintInput}
                  type="number"
                  placeholder={rectWidth(rect1).toFixed(3)}
                  value={input1}
                  onChange={(e) => setInput1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyRectW()}
                  title="Set rectangle width"
                />
                <button className={styles.constraintBtn} onClick={applyRectW}>Set</button>
              </div>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>H</span>
                <input
                  className={styles.constraintInput}
                  type="number"
                  placeholder={rectHeight(rect1).toFixed(3)}
                  value={input2}
                  onChange={(e) => setInput2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyRectH()}
                  title="Set rectangle height"
                />
                <button className={styles.constraintBtn} onClick={applyRectH}>Set</button>
              </div>
            </>
          )}

          {/* ── Circle ── */}
          {circle1 && (
            <div className={styles.constraintRow}>
              <span className={styles.constraintIcon}>R</span>
              <input
                className={styles.constraintInput}
                type="number"
                placeholder={circle1.radius.toFixed(3)}
                value={input1}
                onChange={(e) => setInput1(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyCircleRadius()}
                title="Set circle radius"
              />
              <button className={styles.constraintBtn} onClick={applyCircleRadius}>Set</button>
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

      {hintText && <div className={styles.hint}>{hintText}</div>}
    </aside>
  )
}
