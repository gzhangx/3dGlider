import { useState, useRef, useEffect } from 'react'
import { useModelStore, Sketch, PlaneId, ExtrudeFeature } from '../../store/modelStore'
import { planeIdFromPose, planeNormalFromPose } from '../../lib/planePose'
import { sketchElementsToShape } from '../../lib/sketchToShape'
import { SCENE_TO_MM } from '../../lib/units'
import styles from './FeatureTree.module.css'

function extrudeDefaultColor(op: 'add' | 'cut') { return op === 'cut' ? '#ff4422' : '#4477bb' }
function extrudeDefaultOpacity(op: 'add' | 'cut') { return op === 'cut' ? 0.22 : 0.82 }

function SketchRow({ sketch }: { sketch: Sketch }) {
  const {
    extrudes, addExtrude, updateExtrude, deleteExtrude, editSketch,
    setSketchAppearance, setExtrudeAppearance, setEditingExtrudeId, setPreviewExtrude,
  } = useModelStore()

  // ── create-new-extrude form state ────────────────────────────────────────
  const [showExtrude, setShowExtrude] = useState(false)
  const [depth, setDepth] = useState('10')
  const [operation, setOperation] = useState<'add' | 'cut'>('add')
  const [symmetric, setSymmetric] = useState(false)
  const [useCustomDir, setUseCustomDir] = useState(false)
  const [dirX, setDirX] = useState('0')
  const [dirY, setDirY] = useState('0')
  const [dirZ, setDirZ] = useState('1')

  // ── edit-existing-extrude state ──────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [eDepth, setEDepth] = useState('10')
  const [eOperation, setEOperation] = useState<'add' | 'cut'>('add')
  const [eSymmetric, setESymmetric] = useState(false)
  const [eUseDir, setEUseDir] = useState(false)
  const [eDirX, setEDirX] = useState('0')
  const [eDirY, setEDirY] = useState('0')
  const [eDirZ, setEDirZ] = useState('1')
  const originalRef = useRef<ExtrudeFeature | null>(null)

  // ── appearance state ─────────────────────────────────────────────────────
  const [showSketchAppearance, setShowSketchAppearance] = useState(false)
  const [appearanceExtrudeId, setAppearanceExtrudeId] = useState<string | null>(null)

  const existing = extrudes.filter((e) => e.sketchId === sketch.id)
  const canExtrude = sketchElementsToShape(sketch.elements).length > 0
  const planeLabel = planeIdFromPose(sketch.plane)

  // Live-preview: push edit state into store whenever it changes
  useEffect(() => {
    if (!editingId) return
    const d = parseFloat(eDepth) / SCENE_TO_MM  // convert mm input → scene units
    if (isNaN(d) || d === 0) return
    let direction: [number, number, number] | undefined
    if (eUseDir) {
      const dx = parseFloat(eDirX), dy = parseFloat(eDirY), dz = parseFloat(eDirZ)
      if (isNaN(dx) || isNaN(dy) || isNaN(dz)) return
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len < 1e-6) return
      direction = [dx / len, dy / len, dz / len]
    }
    updateExtrude(editingId, d, eOperation, direction, eSymmetric)
  }, [editingId, eDepth, eOperation, eSymmetric, eUseDir, eDirX, eDirY, eDirZ]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create-form preview: push a draft extrude into the store so the 3D view shows a live ghost
  useEffect(() => {
    if (!showExtrude) { setPreviewExtrude(null); return }
    const d = parseFloat(depth) / SCENE_TO_MM  // convert mm input → scene units
    if (isNaN(d) || d === 0) { setPreviewExtrude(null); return }
    let direction: [number, number, number] | undefined
    if (useCustomDir) {
      const dx = parseFloat(dirX), dy = parseFloat(dirY), dz = parseFloat(dirZ)
      if (isNaN(dx) || isNaN(dy) || isNaN(dz)) return
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len < 1e-6) return
      direction = [dx / len, dy / len, dz / len]
    }
    setPreviewExtrude({ id: 'preview', sketchId: sketch.id, operation, depth: d, direction, ...(symmetric ? { symmetric: true } : {}) })
  }, [showExtrude, depth, operation, symmetric, useCustomDir, dirX, dirY, dirZ]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear preview on unmount
  useEffect(() => () => { setPreviewExtrude(null) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (ext: ExtrudeFeature) => {
    originalRef.current = { ...ext }
    setEditingId(ext.id)
    setEditingExtrudeId(ext.id)
    setEDepth((ext.depth * SCENE_TO_MM).toString())
    setEOperation(ext.operation)
    setESymmetric(ext.symmetric ?? false)
    if (ext.direction) {
      setEUseDir(true)
      setEDirX(ext.direction[0].toString())
      setEDirY(ext.direction[1].toString())
      setEDirZ(ext.direction[2].toString())
    } else {
      setEUseDir(false)
      const n = planeNormalFromPose(sketch.plane)
      setEDirX(parseFloat(n.x.toFixed(3)).toString())
      setEDirY(parseFloat(n.y.toFixed(3)).toString())
      setEDirZ(parseFloat(n.z.toFixed(3)).toString())
    }
  }

  const applyEdit = () => { setEditingId(null); setEditingExtrudeId(null) }

  const cancelEdit = () => {
    const orig = originalRef.current
    if (orig) updateExtrude(orig.id, orig.depth, orig.operation, orig.direction)
    setEditingId(null)
    setEditingExtrudeId(null)
  }

  const handleToggleEditDir = (on: boolean) => {
    if (on) {
      const n = planeNormalFromPose(sketch.plane)
      setEDirX(parseFloat(n.x.toFixed(3)).toString())
      setEDirY(parseFloat(n.y.toFixed(3)).toString())
      setEDirZ(parseFloat(n.z.toFixed(3)).toString())
    }
    setEUseDir(on)
  }

  const handleToggleCustomDir = (on: boolean) => {
    if (on) {
      const n = planeNormalFromPose(sketch.plane)
      setDirX(parseFloat(n.x.toFixed(3)).toString())
      setDirY(parseFloat(n.y.toFixed(3)).toString())
      setDirZ(parseFloat(n.z.toFixed(3)).toString())
    }
    setUseCustomDir(on)
  }

  const handleExtrude = () => {
    const d = parseFloat(depth) / SCENE_TO_MM  // convert mm → scene units
    if (!isNaN(d) && d !== 0) {
      let direction: [number, number, number] | undefined
      if (useCustomDir) {
        const dx = parseFloat(dirX), dy = parseFloat(dirY), dz = parseFloat(dirZ)
        if (!isNaN(dx) && !isNaN(dy) && !isNaN(dz)) {
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (len > 1e-6) direction = [dx / len, dy / len, dz / len]
        }
      }
      addExtrude(sketch.id, d, operation, direction, symmetric)
    }
  }

  const sketchColor = sketch.color ?? '#ffdd44'
  const sketchOpacity = sketch.opacity ?? 1

  return (
    <div className={styles.sketchGroup}>
      <div className={styles.sketchRow}>
        <button
          className={`${styles.sketchIconBtn} ${showExtrude ? styles.sketchIconActive : ''}`}
          title="Add extrude / pocket"
          onClick={() => setShowExtrude((v) => !v)}
        >
          ✏
        </button>
        <button
          className={`${styles.colorSwatch} ${showSketchAppearance ? styles.colorSwatchActive : ''}`}
          style={{ background: sketchColor }}
          title="Appearance"
          onClick={() => setShowSketchAppearance((v) => !v)}
        />
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

      {showSketchAppearance && (
        <div className={styles.appearanceForm}>
          <div className={styles.appearanceRow}>
            <span className={styles.appearanceLabel}>Color</span>
            <input
              type="color"
              value={sketchColor}
              onChange={(e) => setSketchAppearance(sketch.id, e.target.value, sketchOpacity)}
            />
          </div>
          <div className={styles.appearanceRow}>
            <span className={styles.appearanceLabel}>Opacity</span>
            <input
              type="range" min={0} max={100}
              value={Math.round(sketchOpacity * 100)}
              className={styles.opacitySlider}
              onChange={(e) => setSketchAppearance(sketch.id, sketchColor, Number(e.target.value) / 100)}
            />
            <span className={styles.opacityValue}>{Math.round(sketchOpacity * 100)}%</span>
          </div>
        </div>
      )}

      {existing.map((ext) => {
        const defColor = extrudeDefaultColor(ext.operation)
        const defOpacity = extrudeDefaultOpacity(ext.operation)
        const extColor = ext.color ?? defColor
        const extOpacity = ext.opacity ?? defOpacity
        return (
          <div key={ext.id} className={styles.sketchGroup}>
            <div className={styles.extrudeRow}>
              <button
                className={`${styles.extrudeIconBtn} ${editingId === ext.id ? styles.extrudeIconActive : ''}`}
                title="Edit extrude"
                onClick={() => editingId === ext.id ? applyEdit() : startEdit(ext)}
              >
                {ext.operation === 'cut' ? '▼' : '▲'}
              </button>
              <button
                className={`${styles.colorSwatch} ${appearanceExtrudeId === ext.id ? styles.colorSwatchActive : ''}`}
                style={{ background: extColor }}
                title="Appearance"
                onClick={() => setAppearanceExtrudeId(appearanceExtrudeId === ext.id ? null : ext.id)}
              />
              <span className={styles.extrudeLabel}>
                {ext.operation === 'cut' ? 'Pocket' : 'Extrude'} {+(ext.depth * SCENE_TO_MM).toFixed(2)} mm
                {ext.symmetric && <span className={styles.dirLabel}> ⇔sym</span>}
                {ext.direction && (
                  <span className={styles.dirLabel}> [{ext.direction.map((n) => n.toFixed(2)).join(',')}]</span>
                )}
              </span>
              <button
                className={styles.deleteBtn}
                title="Delete extrude"
                onClick={() => { if (editingId === ext.id) cancelEdit(); deleteExtrude(ext.id) }}
              >
                ✕
              </button>
            </div>

            {appearanceExtrudeId === ext.id && (
              <div className={styles.appearanceForm}>
                <div className={styles.appearanceRow}>
                  <span className={styles.appearanceLabel}>Color</span>
                  <input
                    type="color"
                    value={extColor}
                    onChange={(e) => setExtrudeAppearance(ext.id, e.target.value, extOpacity)}
                  />
                </div>
                <div className={styles.appearanceRow}>
                  <span className={styles.appearanceLabel}>Opacity</span>
                  <input
                    type="range" min={0} max={100}
                    value={Math.round(extOpacity * 100)}
                    className={styles.opacitySlider}
                    onChange={(e) => setExtrudeAppearance(ext.id, extColor, Number(e.target.value) / 100)}
                  />
                  <span className={styles.opacityValue}>{Math.round(extOpacity * 100)}%</span>
                </div>
              </div>
            )}

            {editingId === ext.id && (
              <div className={styles.editExtrudeForm}>
                <div className={styles.extrudeFormRow}>
                  <select
                    className={styles.opSelect}
                    value={eOperation}
                    onChange={(e) => setEOperation(e.target.value as 'add' | 'cut')}
                  >
                    <option value="add">Add</option>
                    <option value="cut">Cut</option>
                  </select>
                  <input
                    type="number"
                    className={styles.depthInput}
                    value={eDepth}
                    step="0.5"
                    onChange={(e) => setEDepth(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyEdit()}
                    autoFocus
                  />
                  <span className={styles.unit}>mm</span>
                </div>
                <label className={styles.dirToggle}>
                  <input
                    type="checkbox"
                    checked={eSymmetric}
                    onChange={(e) => setESymmetric(e.target.checked)}
                  />
                  Symmetric
                </label>
                <label className={styles.dirToggle}>
                  <input
                    type="checkbox"
                    checked={eUseDir}
                    onChange={(e) => handleToggleEditDir(e.target.checked)}
                  />
                  Custom dir
                </label>
                {eUseDir && (
                  <div className={styles.dirInputs}>
                    <span className={styles.dirAxisLabel}>X</span>
                    <input type="number" className={styles.dirInput} value={eDirX} step="0.1" onChange={(e) => setEDirX(e.target.value)} />
                    <span className={styles.dirAxisLabel}>Y</span>
                    <input type="number" className={styles.dirInput} value={eDirY} step="0.1" onChange={(e) => setEDirY(e.target.value)} />
                    <span className={styles.dirAxisLabel}>Z</span>
                    <input type="number" className={styles.dirInput} value={eDirZ} step="0.1" onChange={(e) => setEDirZ(e.target.value)} />
                  </div>
                )}
                <div className={styles.editActions}>
                  <button className={styles.applyBtn} onClick={applyEdit}>✓ Apply</button>
                  <button className={styles.cancelEditBtn} onClick={cancelEdit}>✗ Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {showExtrude && canExtrude && (
        <div className={styles.extrudeForm}>
          <div className={styles.extrudeFormRow}>
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
            <span className={styles.unit}>mm</span>
          </div>
          <label className={styles.dirToggle}>
            <input
              type="checkbox"
              checked={symmetric}
              onChange={(e) => setSymmetric(e.target.checked)}
            />
            Symmetric
          </label>
          <label className={styles.dirToggle}>
            <input
              type="checkbox"
              checked={useCustomDir}
              onChange={(e) => handleToggleCustomDir(e.target.checked)}
            />
            Custom dir
          </label>
          {useCustomDir && (
            <div className={styles.dirInputs}>
              <span className={styles.dirAxisLabel}>X</span>
              <input type="number" className={styles.dirInput} value={dirX} step="0.1" onChange={(e) => setDirX(e.target.value)} />
              <span className={styles.dirAxisLabel}>Y</span>
              <input type="number" className={styles.dirInput} value={dirY} step="0.1" onChange={(e) => setDirY(e.target.value)} />
              <span className={styles.dirAxisLabel}>Z</span>
              <input type="number" className={styles.dirInput} value={dirZ} step="0.1" onChange={(e) => setDirZ(e.target.value)} />
            </div>
          )}
          <button className={styles.extrudeBtn} onClick={handleExtrude}>
            {operation === 'cut' ? 'Pocket ▶' : 'Extrude ▶'}
          </button>
        </div>
      )}

      {showExtrude && !canExtrude && (
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
