import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useModelStore,
  SketchConstraint,
  SketchElement,
} from '../../store/modelStore'
import styles from './SketchNavigator.module.css'
import { constraintElementIds } from '../../lib/constraintUtils'
import { SCENE_TO_MM } from '../../lib/units'
import type { SolverDebugLog, SolverGeomMove } from '../../lib/constraintSolve'

// ── element label ─────────────────────────────────────────────────────────────

function elementLabel(el: SketchElement, index: number): string {
  const typeLabels: Record<string, string> = {
    line: 'Line', rect: 'Rect', circle: 'Circle', arc: 'Arc',
  }
  return `${typeLabels[el.type] ?? el.type} ${index + 1}${el.construction ? ' (c)' : ''}`
}

// ── constraint label ──────────────────────────────────────────────────────────

function constraintLabel(c: SketchConstraint, elements: SketchElement[]): string {
  const name = (id: string) => {
    const idx = elements.findIndex((e) => e.id === id)
    if (idx === -1) return '?'
    return `${elements[idx].type[0].toUpperCase()}${idx + 1}`
  }
  switch (c.type) {
    case 'length':
      if (c.dimension === 'width')  return `W=${+(c.value * SCENE_TO_MM).toFixed(2)} [${name(c.elementId)}]`
      if (c.dimension === 'height') return `H=${+(c.value * SCENE_TO_MM).toFixed(2)} [${name(c.elementId)}]`
      if (c.dimension === 'radius') return `R=${+(c.value * SCENE_TO_MM).toFixed(2)} [${name(c.elementId)}]`
      return `L=${+(c.value * SCENE_TO_MM).toFixed(2)} [${name(c.elementId)}]`
    case 'angle':       return `∠${c.value}° [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'coincident':  return `⊙ coincident [${name(c.p1.elementId)}.${c.p1.which[0]}·${name(c.p2.elementId)}.${c.p2.which[0]}]`
    case 'pointOnCircle': return `⊙ on circle [${name(c.p.elementId)}.${c.p.which[0]}·${name(c.circleId)}]`
    case 'pointOnLine': return `⊙ on line [${name(c.p.elementId)}.${c.p.which[0]}·${name(c.lineId)}]`
    case 'pointOnAxis': return `⊙ on ${c.axis.toUpperCase()} axis [${name(c.p.elementId)}.${c.p.which[0]}]`
    case 'pointAtOrigin': return `⊙ at origin [${name(c.p.elementId)}.${c.p.which[0]}]`
    case 'parallel':    return `∥ parallel [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'perpendicular': return `⊥ perp [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'horizontal':  return `— horiz [${name(c.elementId)}]`
    case 'vertical':    return `| vert [${name(c.elementId)}]`
    case 'equal':       return `= equal [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'tangent':     return `⌶ tangent [${name(c.elementId1)}·${name(c.elementId2)}]`
    default:            return (c as SketchConstraint).type
  }
}

function elementTag(elements: SketchElement[], id: string): string {
  const idx = elements.findIndex((e) => e.id === id)
  if (idx === -1) return id.slice(0, 6)
  const el = elements[idx]
  return el.name ?? `${el.type[0].toUpperCase()}${idx + 1}`
}

function fmtMm(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '?'
  return (value * SCENE_TO_MM).toFixed(3)
}

function fmtScalar(pointType: string, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '?'
  if (pointType === 'startAngle' || pointType === 'endAngle') return `${(value * 180 / Math.PI).toFixed(2)}°`
  if (pointType === 'radius') return fmtMm(value)
  return value.toFixed(4)
}

function formatMove(move: SolverGeomMove, elements: SketchElement[]): string {
  const tag = `${elementTag(elements, move.elementId)}.${move.pointType}`
  if (move.kind === 'point') {
    return `${tag}  (${fmtMm(move.fromX)}, ${fmtMm(move.fromY)}) → (${fmtMm(move.toX)}, ${fmtMm(move.toY)})`
  }
  return `${tag}  ${fmtScalar(move.pointType, move.fromValue)} → ${fmtScalar(move.pointType, move.toValue)}`
}

function formatSolverDebug(log: SolverDebugLog, elements: SketchElement[]): string {
  const lines = [
    `${log.converged ? 'converged' : 'DID NOT CONVERGE'}  iters=${log.iterations}  maxR=${log.maxResidual.toExponential(2)}`,
  ]
  if (log.fixedPoints.length > 0) {
    const labels = log.fixedPoints.map((key) => {
      const [id, which] = key.split(':')
      return `${elementTag(elements, id)}.${which}`
    })
    lines.push(`fixed: ${labels.join(', ')}`)
  }
  if (log.pinMoves.length > 0) {
    lines.push('pin coincident:')
    for (const move of log.pinMoves) lines.push(`  ${formatMove(move, elements)}`)
  }
  if (log.steps.length === 0) {
    lines.push(log.iterations === 0 ? 'already satisfied (no Newton steps)' : 'no geometry moved')
  }
  for (const step of log.steps) {
    lines.push(`iter ${step.iteration}  maxR=${step.maxResidual.toExponential(2)}`)
    if (step.moves.length === 0) {
      lines.push('  (no point moved)')
      continue
    }
    for (const move of step.moves) lines.push(`  ${formatMove(move, elements)}`)
  }
  return lines.join('\n')
}

// ── ids referenced by a constraint ───────────────────────────────────────────

// ── main component ────────────────────────────────────────────────────────────

export function SketchNavigator() {
  const {
    mode, sketchElements, sketchConstraints,
    setHighlightElementIds, deleteSketchElement, deleteSketchConstraint,
    solverDebugEnabled, solverDebugLog, setSolverDebugEnabled,
  } = useModelStore(useShallow((state) => ({
    mode: state.mode, sketchElements: state.sketchElements,
    sketchConstraints: state.sketchConstraints,
    setHighlightElementIds: state.setHighlightElementIds,
    deleteSketchElement: state.deleteSketchElement,
    deleteSketchConstraint: state.deleteSketchConstraint,
    solverDebugEnabled: state.solverDebugEnabled,
    solverDebugLog: state.solverDebugLog,
    setSolverDebugEnabled: state.setSolverDebugEnabled,
  })))

  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (mode !== 'sketch') return null

  const select = (id: string, highlightIds: string[]) => {
    if (selectedId === id) {
      setSelectedId(null)
      setHighlightElementIds([])
    } else {
      setSelectedId(id)
      setHighlightElementIds(highlightIds)
    }
  }

  const selectElement = (el: SketchElement) => {
    // Highlight only the selected element
    select(el.id, [el.id])
  }

  const selectConstraint = (c: SketchConstraint) => {
    select(c.id, constraintElementIds(c))
  }

  const removeElement = (id: string) => {
    if (selectedId === id) { setSelectedId(null); setHighlightElementIds([]) }
    deleteSketchElement(id)
  }

  const removeConstraint = (id: string) => {
    if (selectedId === id) { setSelectedId(null); setHighlightElementIds([]) }
    deleteSketchConstraint(id)
  }

  return (
    <aside className={`${styles.panel} ${solverDebugEnabled ? styles.panelDebug : ''}`}>
      <div className={styles.heading}>Sketch Items</div>

      <label className={styles.debugToggle}>
        <input
          type="checkbox"
          checked={solverDebugEnabled}
          onChange={(e) => setSolverDebugEnabled(e.target.checked)}
        />
        Debug solver
      </label>

      {solverDebugEnabled && (
        <div className={styles.debugLog}>
          {solverDebugLog
            ? formatSolverDebug(solverDebugLog, sketchElements)
            : 'No solve yet — drag a point or add a constraint.'}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Elements ({sketchElements.length})</div>
        {sketchElements.length === 0 && <div className={styles.empty}>No elements</div>}
        {sketchElements.map((el, i) => (
          <div
            key={el.id}
            className={`${styles.row} ${selectedId === el.id ? styles.rowSelected : ''}`}
            onClick={() => selectElement(el)}
          >
            <span className={styles.rowLabel}>{elementLabel(el, i)}</span>
            <button
              className={styles.deleteBtn}
              onClick={(e) => { e.stopPropagation(); removeElement(el.id) }}
              title="Delete element"
            >✕</button>
          </div>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Constraints ({sketchConstraints.length})</div>
        {sketchConstraints.length === 0 && <div className={styles.empty}>No constraints</div>}
        {sketchConstraints.map((c) => (
          <div
            key={c.id}
            className={`${styles.row} ${selectedId === c.id ? styles.rowSelected : ''}`}
            onClick={() => selectConstraint(c)}
          >
            <span className={styles.rowLabel}>{constraintLabel(c, sketchElements)}</span>
            <button
              className={styles.deleteBtn}
              onClick={(e) => { e.stopPropagation(); removeConstraint(c.id) }}
              title="Delete constraint"
            >✕</button>
          </div>
        ))}
      </div>
    </aside>
  )
}
