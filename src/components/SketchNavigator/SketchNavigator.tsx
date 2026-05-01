import { useState } from 'react'
import {
  useModelStore,
  SketchConstraint,
  SketchElement,
} from '../../store/modelStore'
import styles from './SketchNavigator.module.css'

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
      if (c.dimension === 'width')  return `W=${c.value} [${name(c.elementId)}]`
      if (c.dimension === 'height') return `H=${c.value} [${name(c.elementId)}]`
      if (c.dimension === 'radius') return `R=${c.value} [${name(c.elementId)}]`
      return `L=${c.value} [${name(c.elementId)}]`
    case 'angle':       return `∠${c.value}° [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'coincident':  return `⊙ coincident [${name(c.p1.elementId)}.${c.p1.which[0]}·${name(c.p2.elementId)}.${c.p2.which[0]}]`
    case 'parallel':    return `∥ parallel [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'perpendicular': return `⊥ perp [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'horizontal':  return `— horiz [${name(c.elementId)}]`
    case 'vertical':    return `| vert [${name(c.elementId)}]`
    case 'equal':       return `= equal [${name(c.elementId1)}·${name(c.elementId2)}]`
    case 'tangent':     return `⌶ tangent [${name(c.elementId1)}·${name(c.elementId2)}]`
    default:            return (c as SketchConstraint).type
  }
}

// ── ids referenced by a constraint ───────────────────────────────────────────

function constraintElementIds(c: SketchConstraint): string[] {
  switch (c.type) {
    case 'length': case 'horizontal': case 'vertical':
      return [c.elementId]
    case 'angle': case 'parallel': case 'perpendicular': case 'equal': case 'tangent':
      return [c.elementId1, c.elementId2]
    case 'coincident':
      return [c.p1.elementId, c.p2.elementId]
    default:
      return []
  }
}

// ── main component ────────────────────────────────────────────────────────────

export function SketchNavigator() {
  const {
    mode, sketchElements, sketchConstraints,
    setHighlightElementIds, deleteSketchElement, deleteSketchConstraint,
  } = useModelStore()

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
    <aside className={styles.panel}>
      <div className={styles.heading}>Sketch Items</div>

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
