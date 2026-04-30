import { useState } from 'react'
import {
  useModelStore, SketchTool, SketchLine, SketchRect, SketchCircle, SketchPoint, SketchConstraint,
} from '../../store/modelStore'
import {
  lineLength, angleBetween,
  applyLength, applyAngle, applyParallel, applyPerpendicular,
  applyHorizontal, applyVertical, applyEqual,
  applyRectWidth, applyRectHeight, rectWidth, rectHeight,
  applyRadius,
} from '../../lib/constraintSolve'
import styles from './SketchSidebar.module.css'

interface ToolBtn { id: SketchTool; label: string; key: string; icon: string }
const TOOLS: ToolBtn[] = [
  { id: 'select',  label: 'Select',    key: 'S', icon: '↖' },
  { id: 'line',    label: 'Line',      key: 'L', icon: '╱' },
  { id: 'rect',    label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'circle',  label: 'Circle',    key: 'C', icon: '◯' },
  { id: 'cut',     label: 'Cut',       key: 'X', icon: '✂' },
]

// ── coincident endpoint pair labels ──────────────────────────────────────────
type EndpointPair = { p1: 'start' | 'end'; p2: 'start' | 'end'; label: string }
const ENDPOINT_PAIRS: EndpointPair[] = [
  { p1: 'end',   p2: 'start', label: 'e1·s2' },
  { p1: 'end',   p2: 'end',   label: 'e1·e2' },
  { p1: 'start', p2: 'start', label: 's1·s2' },
  { p1: 'start', p2: 'end',   label: 's1·e2' },
]

export function SketchSidebar() {
  const {
    mode, activeTool, constructionMode, snapToGrid, snapToOtherPlanes, showSketchNavigator,
    setActiveTool, setConstructionMode, setSnapToGrid, setSnapToOtherPlanes, setShowSketchNavigator,
    sketchElements, sketchConstraints, parameters,
    selectedElementId, selectedElementId2, selectElement2,
    updateSketchElement, addSketchConstraint, deleteSketchConstraint,
    setHighlightElementIds,
  } = useModelStore()

  const [input1, setInput1] = useState('')   // length / width / radius
  const [input2, setInput2] = useState('')   // height (rect)
  const [angleInput, setAngleInput] = useState('')

  if (mode !== 'sketch') return null

  const sel1 = selectedElementId  ? sketchElements.find((e) => e.id === selectedElementId)  : null
  const sel2 = selectedElementId2 ? sketchElements.find((e) => e.id === selectedElementId2) : null
  const line1   = sel1?.type === 'line'   ? (sel1 as SketchLine)   : null
  const rect1   = sel1?.type === 'rect'   ? (sel1 as SketchRect)   : null
  const circle1 = sel1?.type === 'circle' ? (sel1 as SketchCircle) : null
  const line2   = sel2?.type === 'line'   ? (sel2 as SketchLine)   : null

  const selectedConstraints = selectedElementId
    ? sketchConstraints.filter((c) => {
        if ('elementId' in c)  return c.elementId  === selectedElementId
        if ('elementId1' in c) return c.elementId1 === selectedElementId || c.elementId2 === selectedElementId
        return c.p1.elementId === selectedElementId || c.p2.elementId === selectedElementId
      })
    : []

  // ── helpers ────────────────────────────────────────────────────────────────
  const addC = (c: { type: string } & Record<string, unknown>) =>
    addSketchConstraint({ id: crypto.randomUUID(), ...c } as SketchConstraint)

  const upd = (id: string, updates: object) => updateSketchElement(id, updates as Parameters<typeof updateSketchElement>[1])

  /** Resolve a text input to { value, paramRef? }. Returns null if invalid. */
  const resolveInput = (raw: string): { value: number; paramRef?: string } | null => {
    const trimmed = raw.trim()
    const param = parameters.find((p) => p.name === trimmed)
    if (param) return { value: param.value, paramRef: param.name }
    const v = parseFloat(trimmed)
    if (isNaN(v) || v <= 0) return null
    return { value: v }
  }

  // ── line (single) ─────────────────────────────────────────────────────────
  const setLineLength = () => {
    if (!line1) return
    const r = resolveInput(input1); if (!r) return
    upd(line1.id, { end: applyLength(line1, r.value).end })
    addC({ type: 'length', elementId: line1.id, value: r.value, ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    setInput1('')
  }
  const setHorizontal = () => {
    if (!line1) return
    upd(line1.id, { end: applyHorizontal(line1).end })
    addC({ type: 'horizontal', elementId: line1.id })
  }
  const setVertical = () => {
    if (!line1) return
    upd(line1.id, { end: applyVertical(line1).end })
    addC({ type: 'vertical', elementId: line1.id })
  }

  // ── two lines ─────────────────────────────────────────────────────────────
  const setAngle = () => {
    if (!line1 || !line2) return
    const r = resolveInput(angleInput); if (!r) return
    upd(line2.id, { end: applyAngle(line1, line2, r.value).end })
    addC({ type: 'angle', elementId1: line1.id, elementId2: line2.id, value: r.value, ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    setAngleInput('')
  }
  const setParallel = () => {
    if (!line1 || !line2) return
    upd(line2.id, { end: applyParallel(line1, line2).end })
    addC({ type: 'parallel', elementId1: line1.id, elementId2: line2.id })
  }
  const setPerpendicular = () => {
    if (!line1 || !line2) return
    upd(line2.id, { end: applyPerpendicular(line1, line2).end })
    addC({ type: 'perpendicular', elementId1: line1.id, elementId2: line2.id })
  }
  const setEqual = () => {
    if (!line1 || !line2) return
    upd(line2.id, { end: applyEqual(line1, line2).end })
    addC({ type: 'equal', elementId1: line1.id, elementId2: line2.id })
  }
  const setCoincident = (p1which: 'start' | 'end', p2which: 'start' | 'end') => {
    if (!sel1 || !sel2) return
    const p1el = sel1 as SketchLine
    const src: SketchPoint = p1which === 'start' ? p1el.start : p1el.end
    upd(sel2.id, { [p2which]: { x: src.x, y: src.y } })
    addC({ type: 'coincident', p1: { elementId: sel1.id, which: p1which }, p2: { elementId: sel2.id, which: p2which } })
  }

  // ── rect ──────────────────────────────────────────────────────────────────
  const setRectW = () => {
    if (!rect1) return
    const r = resolveInput(input1); if (!r) return
    upd(rect1.id, { end: applyRectWidth(rect1, r.value).end })
    addC({ type: 'length', elementId: rect1.id, value: r.value, dimension: 'width', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    setInput1('')
  }
  const setRectH = () => {
    if (!rect1) return
    const r = resolveInput(input2); if (!r) return
    upd(rect1.id, { end: applyRectHeight(rect1, r.value).end })
    addC({ type: 'length', elementId: rect1.id, value: r.value, dimension: 'height', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    setInput2('')
  }

  // ── circle ────────────────────────────────────────────────────────────────
  const setCircleRadius = () => {
    if (!circle1) return
    const r = resolveInput(input1); if (!r) return
    upd(circle1.id, { radius: applyRadius(circle1, r.value).radius })
    addC({ type: 'length', elementId: circle1.id, value: r.value, dimension: 'radius', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    setInput1('')
  }

  // ── constraint element ids ────────────────────────────────────────────────
  const constraintElementIds = (c: SketchConstraint): string[] => {
    if ('elementId' in c) return [(c as { elementId: string }).elementId]
    if ('elementId1' in c) return [(c as { elementId1: string; elementId2: string }).elementId1, (c as { elementId1: string; elementId2: string }).elementId2]
    if (c.type === 'coincident') return [c.p1.elementId, c.p2.elementId]
    return []
  }

  // ── constraint label ──────────────────────────────────────────────────────
  const constraintLabel = (c: SketchConstraint): string => {
    if (c.type === 'length') {
      const v = c.paramRef ? c.paramRef : c.value
      if (c.dimension === 'width')  return `W = ${v}`
      if (c.dimension === 'height') return `H = ${v}`
      if (c.dimension === 'radius') return `R = ${v}`
      return `L = ${v}`
    }
    if (c.type === 'angle') return `∠ = ${c.paramRef ?? c.value}°`
    if (c.type === 'coincident')    return `⊙ coincident`
    if (c.type === 'parallel')      return `∥ parallel`
    if (c.type === 'perpendicular') return `⊥ perpendicular`
    if (c.type === 'horizontal')    return `— horizontal`
    if (c.type === 'vertical')      return `| vertical`
    if (c.type === 'equal')         return `= equal`
    return (c as { type: string }).type
  }

  const hasTwoLines = !!(line1 && line2)
  const hasTwoEls   = !!(sel1 && sel2)
  const showConstraints = activeTool === 'select' && !!sel1

  let hintText = ''
  if (activeTool !== 'select') {
    hintText = constructionMode ? 'Drawing construction geometry' : 'Click 1st point · Click 2nd point · Esc cancel'
  } else if (!sel1) {
    hintText = 'Click element · Shift+click 2nd'
  } else if (!sel2) {
    hintText = 'Shift+click 2nd element for more constraints'
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
        title="Construction geometry — dashed, excluded from profiles"
      >
        <span className={styles.icon}>- -</span>
        <span className={styles.label}>Construction</span>
      </button>

      <button
        className={`${styles.btn} ${styles.snapBtn} ${snapToGrid ? styles.snapActive : ''}`}
        onClick={() => setSnapToGrid(!snapToGrid)}
        title="Snap cursor to grid"
      >
        <span className={styles.icon}>⊞</span>
        <span className={styles.label}>Snap Grid</span>
      </button>

      <button
        className={`${styles.btn} ${styles.snapBtn} ${snapToOtherPlanes ? styles.snapActive : ''}`}
        onClick={() => setSnapToOtherPlanes(!snapToOtherPlanes)}
        title="Snap to endpoints on other sketch planes"
      >
        <span className={styles.icon}>⊕</span>
        <span className={styles.label}>Snap Planes</span>
      </button>

      <button
        className={`${styles.btn} ${styles.navBtn} ${showSketchNavigator ? styles.navActive : ''}`}
        onClick={() => setShowSketchNavigator(!showSketchNavigator)}
        title="Toggle sketch navigator panel"
      >
        <span className={styles.icon}>≡</span>
        <span className={styles.label}>Navigator</span>
      </button>

      {showConstraints && (
        <>
          <div className={styles.divider} />
          <span className={styles.sectionLabel}>Constrain</span>

          {/* ── Single line ── */}
          {line1 && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>↔</span>
                <input
                  className={styles.constraintInput}
                  type="text"
                  placeholder={lineLength(line1).toFixed(3)}
                  value={input1}
                  onChange={(e) => setInput1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setLineLength()}
                  title="Set line length"
                />
                <button className={styles.constraintBtn} onClick={setLineLength}>Set</button>
              </div>
              <div className={styles.iconBtnRow}>
                <button className={styles.iconConstraintBtn} onClick={setHorizontal} title="Make horizontal">—</button>
                <button className={styles.iconConstraintBtn} onClick={setVertical}   title="Make vertical">|</button>
              </div>
            </>
          )}

          {/* ── Single rect (legacy) ── */}
          {rect1 && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>W</span>
                <input
                  className={styles.constraintInput} type="text"
                  placeholder={rectWidth(rect1).toFixed(3)}
                  value={input1} onChange={(e) => setInput1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setRectW()}
                />
                <button className={styles.constraintBtn} onClick={setRectW}>Set</button>
              </div>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>H</span>
                <input
                  className={styles.constraintInput} type="text"
                  placeholder={rectHeight(rect1).toFixed(3)}
                  value={input2} onChange={(e) => setInput2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setRectH()}
                />
                <button className={styles.constraintBtn} onClick={setRectH}>Set</button>
              </div>
            </>
          )}

          {/* ── Single circle ── */}
          {circle1 && (
            <div className={styles.constraintRow}>
              <span className={styles.constraintIcon}>R</span>
              <input
                className={styles.constraintInput} type="text"
                placeholder={circle1.radius.toFixed(3)}
                value={input1} onChange={(e) => setInput1(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setCircleRadius()}
              />
              <button className={styles.constraintBtn} onClick={setCircleRadius}>Set</button>
            </div>
          )}

          {/* ── Two lines ── */}
          {hasTwoLines && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>∠</span>
                <input
                  className={styles.constraintInput} type="text"
                  placeholder={angleBetween(line1, line2).toFixed(1) + '°'}
                  value={angleInput}
                  onChange={(e) => setAngleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setAngle()}
                />
                <button className={styles.constraintBtn} onClick={setAngle}>Set</button>
              </div>
              <div className={styles.iconBtnRow}>
                <button className={styles.iconConstraintBtn} onClick={setParallel}      title="Parallel">∥</button>
                <button className={styles.iconConstraintBtn} onClick={setPerpendicular} title="Perpendicular">⊥</button>
                <button className={styles.iconConstraintBtn} onClick={setEqual}         title="Equal length">=</button>
              </div>
            </>
          )}

          {/* ── Two elements: coincident endpoint picker ── */}
          {hasTwoEls && (sel1?.type === 'line' || sel1?.type === 'rect') && (sel2?.type === 'line' || sel2?.type === 'rect') && (
            <>
              <span className={styles.coincidentLabel}>Coincident:</span>
              <div className={styles.iconBtnRow}>
                {ENDPOINT_PAIRS.map(({ p1, p2, label }) => (
                  <button
                    key={label}
                    className={styles.coincidentBtn}
                    onClick={() => setCoincident(p1, p2)}
                    title={`${p1} of el1 = ${p2} of el2`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 2nd element indicator */}
          {sel2 && (
            <div className={styles.constraintHint}>
              2nd: {sel2.type}
              <button className={styles.clearSel2} onClick={() => selectElement2(null)}>✕</button>
            </div>
          )}

          {/* Constraint list */}
          {selectedConstraints.length > 0 && (
            <div className={styles.constraintList}>
              {selectedConstraints.map((c) => (
                <div
                  key={c.id}
                  className={styles.constraintItem}
                  onClick={() => setHighlightElementIds(constraintElementIds(c))}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={styles.constraintItemLabel}>{constraintLabel(c)}</span>
                  <button className={styles.constraintDeleteBtn} onClick={(e) => { e.stopPropagation(); deleteSketchConstraint(c.id) }}>✕</button>
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
