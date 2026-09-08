import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useModelStore, SketchTool, SketchLine, SketchRect, SketchCircle, SketchArc, SketchConstraint,
} from '../../store/modelStore'
import {
  lineLength, angleBetween,
  applyLength, applyAngle, applyParallel, applyPerpendicular,
  applyHorizontal, applyVertical, applyEqual,
  applyRectWidth, applyRectHeight, rectWidth, rectHeight,
  applyRadius,
} from '../../lib/constraintSolve'
import { coincidenceConstraintForSelection, sketchPoint, sketchPointUpdates } from '../../lib/sketchInteraction'
import styles from './SketchSidebar.module.css'
import { constraintElementIds } from '../../lib/constraintUtils'
import { SCENE_TO_MM } from '../../lib/units'

interface ToolBtn { id: SketchTool; label: string; key: string; icon: string }
const TOOLS: ToolBtn[] = [
  { id: 'select',  label: 'Select',    key: 'S', icon: '↖' },
  { id: 'line',    label: 'Line',      key: 'L', icon: '╱' },
  { id: 'rect',    label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'circle',  label: 'Circle',    key: 'C', icon: '◯' },
  { id: 'cut',     label: 'Cut',       key: 'X', icon: '✂' },
  { id: 'coincidence', label: 'Coincidence', key: 'O', icon: '⊙' },
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
    mode, activeTool, constructionMode, snapToGrid, snapToOtherPlanes, snapToObjects, showSketchNavigator,
    setActiveTool, setConstructionMode, setSnapToGrid, setSnapToOtherPlanes, setSnapToObjects, setShowSketchNavigator,
    sketchElements, sketchConstraints, parameters,
    selectedElementIds, selectedPointRefs, selectElement2,
    updateSketchElement, addSketchConstraint, deleteSketchConstraint, applyConstraints,
    setHighlightElementIds, showElementNames, setShowElementNames,
  } = useModelStore(useShallow((state) => ({
    mode: state.mode, activeTool: state.activeTool, constructionMode: state.constructionMode,
    snapToGrid: state.snapToGrid, snapToOtherPlanes: state.snapToOtherPlanes,
    snapToObjects: state.snapToObjects, showSketchNavigator: state.showSketchNavigator,
    setActiveTool: state.setActiveTool, setConstructionMode: state.setConstructionMode,
    setSnapToGrid: state.setSnapToGrid, setSnapToOtherPlanes: state.setSnapToOtherPlanes,
    setSnapToObjects: state.setSnapToObjects, setShowSketchNavigator: state.setShowSketchNavigator,
    sketchElements: state.sketchElements, sketchConstraints: state.sketchConstraints,
    parameters: state.parameters, selectedElementIds: state.selectedElementIds,
    selectedPointRefs: state.selectedPointRefs,
    selectElement2: state.selectElement2, updateSketchElement: state.updateSketchElement,
    addSketchConstraint: state.addSketchConstraint, deleteSketchConstraint: state.deleteSketchConstraint,
    applyConstraints: state.applyConstraints, setHighlightElementIds: state.setHighlightElementIds,
    showElementNames: state.showElementNames, setShowElementNames: state.setShowElementNames,
  })))

  const [input1, setInput1] = useState('')   // length / width / radius
  const [input2, setInput2] = useState('')   // height (rect)
  const [angleInput, setAngleInput] = useState('')
  const [detailConstraint, setDetailConstraint] = useState<SketchConstraint | null>(null)

  if (mode !== 'sketch') return null

  const sel1 = selectedElementIds[0] ? sketchElements.find((e) => e.id === selectedElementIds[0]) : null
  const sel2 = selectedElementIds[1] ? sketchElements.find((e) => e.id === selectedElementIds[1]) : null
  const line1   = sel1?.type === 'line'   ? (sel1 as SketchLine)   : null
  const rect1   = sel1?.type === 'rect'   ? (sel1 as SketchRect)   : null
  const circle1 = sel1?.type === 'circle' ? (sel1 as SketchCircle) : null
  const arc1    = sel1?.type === 'arc'    ? (sel1 as SketchArc)    : null
  const radial1 = circle1 ?? arc1
  const line2   = sel2?.type === 'line'   ? (sel2 as SketchLine)   : null

  const selectedConstraints = selectedElementIds[0]
    ? sketchConstraints.filter((c) => {
        const id = selectedElementIds[0]
        return constraintElementIds(c).includes(id)
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
    if (param) return { value: param.value / SCENE_TO_MM, paramRef: param.name }
    const v = parseFloat(trimmed)
    if (isNaN(v) || v <= 0) return null
    return { value: v / SCENE_TO_MM }
  }

  // ── line (single) ─────────────────────────────────────────────────────────
  const setLineLength = () => {
    if (!line1) return
    const r = resolveInput(input1); if (!r) return
    upd(line1.id, { end: applyLength(line1, r.value).end })
    addC({ type: 'length', elementId: line1.id, value: r.value, ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    // Re-apply constraints so connected endpoints stay coincident
    applyConstraints()
    if (!r.paramRef) setInput1('')
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
    if (!r.paramRef) setAngleInput('')
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
  const setTangent = () => {
    const line = sel1?.type === 'line' ? sel1 : sel2?.type === 'line' ? sel2 : null
    const radial = sel1 && (sel1.type === 'circle' || sel1.type === 'arc') ? sel1
      : sel2 && (sel2.type === 'circle' || sel2.type === 'arc') ? sel2
      : null
    if (!line || !radial) return
    addC({ type: 'tangent', elementId1: line.id, elementId2: radial.id })
    applyConstraints()
  }
  const setCoincident = (p1which: 'start' | 'end', p2which: 'start' | 'end') => {
    if (!sel1 || !sel2) return
    const src = sketchPoint(sel1, p1which)
    if (!src) return
    const updates = sketchPointUpdates(sel2, p2which, src)
    if (updates) upd(sel2.id, updates)
    addC({ type: 'coincident', p1: { elementId: sel1.id, which: p1which }, p2: { elementId: sel2.id, which: p2which } })
    applyConstraints()
  }
  const applySelectedCoincidence = () => {
    const draft = coincidenceConstraintForSelection(selectedPointRefs, selectedElementIds, sketchElements)
    if (!draft) return
    if (draft.type === 'coincident') {
      const el1 = sketchElements.find((el) => el.id === draft.p1.elementId)
      const el2 = sketchElements.find((el) => el.id === draft.p2.elementId)
      const pt2 = el2 ? sketchPoint(el2, draft.p2.which) : null
      if (el1 && pt2) {
        const updates = sketchPointUpdates(el1, draft.p1.which, pt2)
        if (updates) upd(el1.id, updates)
      }
    }
    addC(draft)
    applyConstraints()
  }

  // ── rect ──────────────────────────────────────────────────────────────────
  const setRectW = () => {
    if (!rect1) return
    const r = resolveInput(input1); if (!r) return
    upd(rect1.id, { end: applyRectWidth(rect1, r.value).end })
    addC({ type: 'length', elementId: rect1.id, value: r.value, dimension: 'width', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    if (!r.paramRef) setInput1('')
  }
  const setRectH = () => {
    if (!rect1) return
    const r = resolveInput(input2); if (!r) return
    upd(rect1.id, { end: applyRectHeight(rect1, r.value).end })
    addC({ type: 'length', elementId: rect1.id, value: r.value, dimension: 'height', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    if (!r.paramRef) setInput2('')
  }

  // ── circle / arc ──────────────────────────────────────────────────────────
  const setRadius = () => {
    if (!radial1) return
    const r = resolveInput(input1); if (!r) return
    upd(radial1.id, { radius: applyRadius(radial1, r.value).radius })
    addC({ type: 'length', elementId: radial1.id, value: r.value, dimension: 'radius', ...(r.paramRef ? { paramRef: r.paramRef } : {}) })
    // Changing an arc radius moves its derived endpoints. Re-solve now so
    // coincident lines and other connected geometry follow those endpoints.
    applyConstraints()
    if (!r.paramRef) setInput1('')
  }

  // ── constraint element ids ────────────────────────────────────────────────
  // ── constraint label ──────────────────────────────────────────────────────
  const constraintLabel = (c: SketchConstraint): string => {
    if (c.type === 'length') {
      const mm = +(c.value * SCENE_TO_MM).toFixed(2)
      const v = c.paramRef ? `${c.paramRef} (${mm})` : String(mm)
      if (c.dimension === 'width')  return `W = ${v}`
      if (c.dimension === 'height') return `H = ${v}`
      if (c.dimension === 'radius') return `R = ${v}`
      return `L = ${v}`
    }
    if (c.type === 'angle') return `∠ = ${c.paramRef ? `${c.paramRef} (${c.value})` : c.value}°`
    if (c.type === 'coincident')    return `⊙ coincident`
    if (c.type === 'parallel')      return `∥ parallel`
    if (c.type === 'perpendicular') return `⊥ perpendicular`
    if (c.type === 'horizontal')    return `— horizontal`
    if (c.type === 'vertical')      return `| vertical`
    if (c.type === 'equal')         return `= equal`
    if (c.type === 'tangent')       return `⌶ tangent`
    if (c.type === 'pointOnCircle') return `⊙ on circle`
    if (c.type === 'pointOnLine')   return `⊙ on line`
    return (c as { type: string }).type
  }

  const hasTwoLines = !!(line1 && line2)
  const hasTwoEls   = !!(sel1 && sel2)
  const isRadial = (type: string | undefined) => type === 'circle' || type === 'arc'
  const hasEndpoints = (type: string | undefined) => type === 'line' || type === 'rect' || type === 'arc'
  const hasLineAndRadial = hasTwoEls && (
    (sel1?.type === 'line' && isRadial(sel2?.type)) ||
    (isRadial(sel1?.type) && sel2?.type === 'line')
  )
  const coincidenceDraft = coincidenceConstraintForSelection(selectedPointRefs, selectedElementIds, sketchElements)
  const showConstraints = activeTool === 'select' && (!!sel1 || selectedPointRefs.length > 0)

  let hintText = ''
  if (activeTool !== 'select') {
    hintText = constructionMode ? 'Drawing construction geometry' : 'Click 1st point · Click 2nd point · Esc cancel'
  } else if (!sel1) {
    hintText = 'Click element or endpoint · Shift+click for multi'
  } else if (selectedPointRefs.length === 1 && !sel2) {
    hintText = 'Shift-click another endpoint or a line/circle/arc'
  } else if (!sel2) {
    hintText = `${selectedElementIds.length} selected · Shift+click 2nd for constraints`
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
        className={`${styles.btn} ${styles.snapBtn} ${snapToObjects ? styles.snapActive : ''}`}
        onClick={() => setSnapToObjects(!snapToObjects)}
        title="Auto-snap to nearby objects: endpoints, line segments, circle centers, tangents"
      >
        <span className={styles.icon}>⚪</span>
        <span className={styles.label}>Snap Objects</span>
      </button>

      <button
        className={`${styles.btn} ${styles.navBtn} ${showSketchNavigator ? styles.navActive : ''}`}
        onClick={() => setShowSketchNavigator(!showSketchNavigator)}
        title="Toggle sketch navigator panel"
      >
        <span className={styles.icon}>≡</span>
        <span className={styles.label}>Navigator</span>
      </button>

      <button
        className={`${styles.btn} ${showElementNames ? styles.active : ''}`}
        onClick={() => setShowElementNames(!showElementNames)}
        title="Toggle element names on-screen"
      >
        <span className={styles.icon}>Aa</span>
        <span className={styles.label}>Names</span>
      </button>

      {showConstraints && (
        <>
          <div className={styles.divider} />
          <span className={styles.sectionLabel}>Constrain</span>

          {/* Parameter autocomplete datalist */}
          {parameters.length > 0 && (
            <datalist id="sketch-params">
              {parameters.map((p) => (
                <option key={p.id} value={p.name}>{p.name} = {p.value}</option>
              ))}
            </datalist>
          )}

          {/* ── Single line ── */}
          {line1 && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>↔</span>
                <input
                  className={styles.constraintInput}
                  type="text"
                  list="sketch-params"
                  placeholder={(lineLength(line1) * SCENE_TO_MM).toFixed(1)}
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
                  list="sketch-params"
                  placeholder={(rectWidth(rect1) * SCENE_TO_MM).toFixed(1)}
                  value={input1} onChange={(e) => setInput1(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setRectW()}
                />
                <button className={styles.constraintBtn} onClick={setRectW}>Set</button>
              </div>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>H</span>
                <input
                  className={styles.constraintInput} type="text"
                  list="sketch-params"
                  placeholder={(rectHeight(rect1) * SCENE_TO_MM).toFixed(1)}
                  value={input2} onChange={(e) => setInput2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setRectH()}
                />
                <button className={styles.constraintBtn} onClick={setRectH}>Set</button>
              </div>
            </>
          )}

          {/* ── Single circle / arc ── */}
          {radial1 && (
            <div className={styles.constraintRow}>
              <span className={styles.constraintIcon}>R</span>
              <input
                className={styles.constraintInput} type="text"
                list="sketch-params"
                placeholder={(radial1.radius * SCENE_TO_MM).toFixed(1)}
                value={input1} onChange={(e) => setInput1(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setRadius()}
              />
              <button className={styles.constraintBtn} onClick={setRadius}>Set</button>
            </div>
          )}

          {/* ── Two lines ── */}
          {hasTwoLines && (
            <>
              <div className={styles.constraintRow}>
                <span className={styles.constraintIcon}>∠</span>
                <input
                  className={styles.constraintInput} type="text"
                  list="sketch-params"
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

          {/* ── Selected endpoints / endpoint + curve: coincidence ── */}
          {coincidenceDraft && (
            <>
              <span className={styles.coincidentLabel}>
                {coincidenceDraft.type === 'coincident' ? 'Coincident points:' : 'Coincident on curve:'}
              </span>
              <div className={styles.iconBtnRow}>
                <button
                  className={styles.iconConstraintBtn}
                  onClick={applySelectedCoincidence}
                  title={
                    coincidenceDraft.type === 'coincident'
                      ? 'Connect the two selected endpoints'
                      : coincidenceDraft.type === 'pointOnLine'
                        ? 'Put the selected endpoint on the line'
                        : 'Put the selected endpoint on the circle or arc'
                  }
                >
                  ⊙
                </button>
              </div>
            </>
          )}

          {/* ── Two elements with endpoints: coincident pair picker ── */}
          {hasTwoEls && hasEndpoints(sel1?.type) && hasEndpoints(sel2?.type) && selectedPointRefs.length === 0 && (
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

          {/* ── Line + circle/arc: tangent ── */}
          {hasLineAndRadial && (
            <>
              <span className={styles.coincidentLabel}>Tangent:</span>
              <div className={styles.iconBtnRow}>
                <button className={styles.iconConstraintBtn} onClick={setTangent} title="Make line tangent to circle or arc">⌶</button>
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
                  onClick={() => { setDetailConstraint(c); setHighlightElementIds(constraintElementIds(c)) }}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={styles.constraintItemLabel}>{constraintLabel(c)}</span>
                  <button
                    className={styles.constraintDeleteBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSketchConstraint(c.id)
                      if (detailConstraint && detailConstraint.id === c.id) {
                        setDetailConstraint(null)
                        setHighlightElementIds([])
                      }
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Constraint detail dialog */}
          {detailConstraint && (
            <div className={styles.constraintDialog} onClick={() => { setDetailConstraint(null); setHighlightElementIds([]) }}>
              <div className={styles.constraintDialogContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.detailHeader}>
                  <strong>{constraintLabel(detailConstraint)}</strong>
                  <button className={styles.closeBtn} onClick={() => { setDetailConstraint(null); setHighlightElementIds([]) }}>Close</button>
                </div>
                <div className={styles.detailBody}>
                  <div className={styles.detailRow}><strong>Type:</strong> {detailConstraint.type}</div>
                  <div className={styles.detailRow}><strong>Elements:</strong></div>
                  {constraintElementIds(detailConstraint).map((id) => {
                    const el = sketchElements.find((s) => s.id === id)
                    return (
                      <div key={id} className={styles.detailRow}>
                        - {el ? `${el.name ?? el.type} (${el.id})` : id}
                      </div>
                    )
                  })}
                  {detailConstraint.type === 'coincident' && (
                    <>
                      <div className={styles.detailRow}><strong>Points:</strong></div>
                      <div className={styles.detailRow}>- p1: {detailConstraint.p1.which} of {sketchElements.find((s) => s.id === detailConstraint.p1.elementId)?.name ?? detailConstraint.p1.elementId}</div>
                      <div className={styles.detailRow}>- p2: {detailConstraint.p2.which} of {sketchElements.find((s) => s.id === detailConstraint.p2.elementId)?.name ?? detailConstraint.p2.elementId}</div>
                    </>
                  )}
                  {detailConstraint.type === 'pointOnCircle' && (
                    <>
                      <div className={styles.detailRow}><strong>Point:</strong></div>
                      <div className={styles.detailRow}>- p: {detailConstraint.p.which} of {sketchElements.find((s) => s.id === detailConstraint.p.elementId)?.name ?? detailConstraint.p.elementId}</div>
                      <div className={styles.detailRow}><strong>Circle:</strong></div>
                      <div className={styles.detailRow}>- {sketchElements.find((s) => s.id === detailConstraint.circleId)?.name ?? detailConstraint.circleId}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {hintText && <div className={styles.hint}>{hintText}</div>}
    </aside>
  )
}
