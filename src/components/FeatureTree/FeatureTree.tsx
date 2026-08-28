import { useState, useRef, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore, Sketch, PlaneId, SketchPlanePose, presetPlanePose, ExtrudeFeature, RevolveFeature, RevolveAxis } from '../../store/modelStore'
import { planeIdFromPose, planeNormalFromPose } from '../../lib/planePose'
import { sketchElementsToShape } from '../../lib/sketchToShape'
import { SCENE_TO_MM } from '../../lib/units'
import { resolveParam } from '../../lib/resolveParam'
import styles from './FeatureTree.module.css'

function extrudeDefaultColor(op: 'add' | 'cut') { return op === 'cut' ? '#ff4422' : '#4477bb' }
function extrudeDefaultOpacity(op: 'add' | 'cut') { return op === 'cut' ? 0.22 : 0.82 }

function SketchRow({ sketch }: { sketch: Sketch }) {
  const {
    sketches: allSketches,
    extrudes, revolves, lofts, sweeps, shells,
    addExtrude, updateExtrude, deleteExtrude, editSketch,
    addRevolve, updateRevolve, deleteRevolve, setRevolveAppearance,
    addLoft, deleteLoft, addSweep, deleteSweep, addShell, deleteShell,
    setSketchAppearance, setSketchName, setExtrudeAppearance, setEditingExtrudeId, setPreviewExtrude,
    selectedElementId, selectElement, parameters,
  } = useModelStore(useShallow((state) => ({
    sketches: state.sketches, extrudes: state.extrudes, revolves: state.revolves,
    lofts: state.lofts, sweeps: state.sweeps, shells: state.shells,
    addExtrude: state.addExtrude, updateExtrude: state.updateExtrude,
    deleteExtrude: state.deleteExtrude, editSketch: state.editSketch,
    addRevolve: state.addRevolve, updateRevolve: state.updateRevolve,
    deleteRevolve: state.deleteRevolve, setRevolveAppearance: state.setRevolveAppearance,
    addLoft: state.addLoft, deleteLoft: state.deleteLoft,
    addSweep: state.addSweep, deleteSweep: state.deleteSweep,
    addShell: state.addShell, deleteShell: state.deleteShell,
    setSketchAppearance: state.setSketchAppearance, setSketchName: state.setSketchName,
    setExtrudeAppearance: state.setExtrudeAppearance,
    setEditingExtrudeId: state.setEditingExtrudeId, setPreviewExtrude: state.setPreviewExtrude,
    selectedElementId: state.selectedElementId, selectElement: state.selectElement,
    parameters: state.parameters,
  })))

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

  // ── create-new-revolve form state ────────────────────────────────────────
  const [showRevolve, setShowRevolve] = useState(false)
  const [revolveAxis, setRevolveAxis] = useState<RevolveAxis>('y')
  const [revolveAngle, setRevolveAngle] = useState('360')
  const [revolveLineId, setRevolveLineId] = useState<string | null>(null)
  const [pickingAxis, setPickingAxis] = useState(false)

  // ── create-new-loft/sweep/shell state ───────────────────────────────────
  const [showLoft, setShowLoft] = useState(false)
  const [showSweep, setShowSweep] = useState(false)
  const [showShell, setShowShell] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [loftTargetSketchId, setLoftTargetSketchId] = useState<string>('')
  const [loftOperation, setLoftOperation] = useState<'add' | 'cut'>('add')
  const [sweepPathSketchId, setSweepPathSketchId] = useState<string>('')
  const [sweepOperation, setSweepOperation] = useState<'add' | 'cut'>('add')
  const [shellThickness, setShellThickness] = useState('2')

  // ── edit-existing-revolve state ──────────────────────────────────────────
  const [editingRevolveId, setEditingRevolveId] = useState<string | null>(null)
  const [eRevolveAxis, setERevolveAxis] = useState<RevolveAxis>('y')
  const [eRevolveAngle, setERevolveAngle] = useState('360')
  const [eRevolveLineId, setERevolveLineId] = useState<string | null>(null)
  const [ePickingAxis, setEPickingAxis] = useState(false)

  // ── appearance state ─────────────────────────────────────────────────────
  const [showSketchAppearance, setShowSketchAppearance] = useState(false)
  const [appearanceExtrudeId, setAppearanceExtrudeId] = useState<string | null>(null)
  const [appearanceRevolveId, setAppearanceRevolveId] = useState<string | null>(null)

  const existingExtrudes = extrudes.filter((e) => e.sketchId === sketch.id)
  const existingRevolves = revolves.filter((r) => r.sketchId === sketch.id)
  const existingLofts = lofts.filter((l) => l.sketchId1 === sketch.id)
  const existingSweeps = sweeps.filter((sw) => sw.profileSketchId === sketch.id)
  const existingShells = shells.filter((sh) => sh.sketchId === sketch.id)
  const otherSketches = allSketches.filter((s) => s.id !== sketch.id)
  const canExtrude = sketchElementsToShape(sketch.elements).length > 0
  const planeLabel = planeIdFromPose(sketch.plane)

  // Capture axis element from viewport selection (create form)
  useEffect(() => {
    if (!pickingAxis || !selectedElementId) return
    const el = sketch.elements.find((e) => e.id === selectedElementId && e.type === 'line')
    if (el) {
      setRevolveLineId(selectedElementId)
      setRevolveAxis('element')
      setPickingAxis(false)
    }
  }, [pickingAxis, selectedElementId, sketch.elements])

  // Capture axis element from viewport selection (edit form)
  useEffect(() => {
    if (!ePickingAxis || !selectedElementId) return
    const el = sketch.elements.find((e) => e.id === selectedElementId && e.type === 'line')
    if (el) {
      setERevolveLineId(selectedElementId)
      setERevolveAxis('element')
      setEPickingAxis(false)
    }
  }, [ePickingAxis, selectedElementId, sketch.elements])

  // Live-preview: push edit state into store whenever it changes
  useEffect(() => {
    if (!editingId) return
    const raw = resolveParam(eDepth, parameters)
    const d = raw !== null ? raw / SCENE_TO_MM : NaN
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
  }, [editingId, eDepth, eOperation, eSymmetric, eUseDir, eDirX, eDirY, eDirZ, parameters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create-form preview
  useEffect(() => {
    if (!showExtrude) { setPreviewExtrude(null); return }
    const raw = resolveParam(depth, parameters)
    const d = raw !== null ? raw / SCENE_TO_MM : NaN
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
  }, [showExtrude, depth, operation, symmetric, useCustomDir, dirX, dirY, dirZ, parameters]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (orig) updateExtrude(orig.id, orig.depth, orig.operation, orig.direction, orig.symmetric)
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
    const raw = resolveParam(depth, parameters)
    const d = raw !== null ? raw / SCENE_TO_MM : NaN
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

  const handleRevolve = () => {
    const raw = resolveParam(revolveAngle, parameters)
    const angle = raw !== null ? Math.max(1, Math.min(360, raw)) : NaN
    if (isNaN(angle)) return
    if (revolveAxis === 'element' && !revolveLineId) return
    addRevolve(sketch.id, revolveAxis, angle, revolveAxis === 'element' ? revolveLineId! : undefined)
    setShowRevolve(false)
    setPickingAxis(false)
  }

  const handleLoft = () => {
    if (!loftTargetSketchId || loftTargetSketchId === sketch.id) return
    addLoft(sketch.id, loftTargetSketchId, loftOperation)
    setShowLoft(false)
  }

  const handleSweep = () => {
    if (!sweepPathSketchId || sweepPathSketchId === sketch.id) return
    addSweep(sketch.id, sweepPathSketchId, sweepOperation)
    setShowSweep(false)
  }

  const handleShell = () => {
    const t = parseFloat(shellThickness)
    if (!Number.isFinite(t) || t <= 0) return
    addShell(sketch.id, t / SCENE_TO_MM)
    setShowShell(false)
  }

  const startEditRevolve = (rev: RevolveFeature) => {
    setEditingRevolveId(rev.id)
    setERevolveAxis(rev.axisType)
    setERevolveAngle(rev.angle.toString())
    setERevolveLineId(rev.axisElementId ?? null)
    setEPickingAxis(false)
  }

  const applyEditRevolve = () => {
    if (!editingRevolveId) return
    const raw = resolveParam(eRevolveAngle, parameters)
    const angle = raw !== null ? Math.max(1, Math.min(360, raw)) : NaN
    if (isNaN(angle)) return
    updateRevolve(editingRevolveId, eRevolveAxis, angle, eRevolveAxis === 'element' ? eRevolveLineId ?? undefined : undefined)
    setEditingRevolveId(null)
    setEPickingAxis(false)
  }

  const cancelEditRevolve = () => { setEditingRevolveId(null); setEPickingAxis(false) }

  const axisLabel = (axisType: RevolveAxis, axisElementId?: string) =>
    axisType === 'element' ? `line ${axisElementId?.slice(0, 6)}…` : axisType.toUpperCase()

  const sketchLabelById = (id: string) => {
    const target = allSketches.find((s) => s.id === id)
    if (!target) return 'Sketch ?'
    return target.name?.trim() || `Sketch ${allSketches.findIndex((s) => s.id === id) + 1}`
  }

  const [sketchName, setSketchNameState] = useState(sketch.name ?? '')
  useEffect(() => {
    setSketchNameState(sketch.name ?? '')
  }, [sketch.name])

  const sketchColor = sketch.color ?? '#ffdd44'
  const sketchOpacity = sketch.opacity ?? 1

  return (
    <div className={styles.sketchGroup}>
      <div className={styles.sketchRow}>
        <button
          className={`${styles.revolveSketchBtn} ${showTools ? styles.revolveSketchActive : ''}`}
          title={showTools ? 'Hide sketch tools' : 'Show sketch tools'}
          onClick={() => {
            if (showTools) {
              setShowTools(false)
              setShowExtrude(false)
              setShowRevolve(false)
              setShowLoft(false)
              setShowSweep(false)
              setShowShell(false)
            } else {
              setShowTools(true)
            }
          }}
        >
          ☰
        </button>
        <button
          className={styles.editBtn}
          title="Re-open sketch"
          onClick={() => editSketch(sketch.id)}
        >
          ✎
        </button>
        <span className={styles.sketchLabel}>
          <input
            className={styles.sketchNameInput}
            value={sketchName}
            placeholder={`Sketch ${allSketches.findIndex((s) => s.id === sketch.id) + 1}`}
            onChange={(e) => setSketchNameState(e.target.value)}
            onBlur={() => setSketchName(sketch.id, sketchName.trim())}
          />
          <span className={styles.sketchPlaneLabel}>({planeLabel})</span>
          <span className={styles.count}>{sketch.elements.length} el</span>
        </span>
      </div>

      {showTools && (
        <div className={styles.toolRow}>
          <button
            className={`${styles.revolveSketchBtn} ${showExtrude ? styles.revolveSketchActive : ''}`}
            title="Add extrude"
            onClick={() => { setShowExtrude((v) => !v); setShowRevolve(false); setShowLoft(false); setShowSweep(false); setShowShell(false) }}
          >
            ⬛
          </button>
          <button
            className={`${styles.revolveSketchBtn} ${showRevolve ? styles.revolveSketchActive : ''}`}
            title="Add revolve"
            onClick={() => { setShowRevolve((v) => !v); setShowExtrude(false) }}
          >
            ↻
          </button>
          <button
            className={`${styles.revolveSketchBtn} ${showLoft ? styles.revolveSketchActive : ''}`}
            title="Add loft"
            onClick={() => { setShowLoft((v) => !v); setShowSweep(false); setShowShell(false) }}
          >
            ⇅
          </button>
          <button
            className={`${styles.revolveSketchBtn} ${showSweep ? styles.revolveSketchActive : ''}`}
            title="Add sweep"
            onClick={() => { setShowSweep((v) => !v); setShowLoft(false); setShowShell(false) }}
          >
            ↝
          </button>
          <button
            className={`${styles.revolveSketchBtn} ${showShell ? styles.revolveSketchActive : ''}`}
            title="Add shell"
            onClick={() => { setShowShell((v) => !v); setShowLoft(false); setShowSweep(false) }}
          >
            ◍
          </button>
          <button
            className={`${styles.colorSwatch} ${showSketchAppearance ? styles.colorSwatchActive : ''}`}
            style={{ background: sketchColor }}
            title="Appearance"
            onClick={() => setShowSketchAppearance((v) => !v)}
          />
        </div>
      )}

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

      {/* ── Extrude rows ── */}
      {existingExtrudes.map((ext) => {
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

      {/* ── Revolve rows ── */}
      {existingRevolves.map((rev) => {
        const revColor = rev.color ?? '#7755cc'
        const revOpacity = rev.opacity ?? 0.82
        return (
          <div key={rev.id} className={styles.sketchGroup}>
            <div className={styles.revolveRow}>
              <button
                className={`${styles.revolveIconBtn} ${editingRevolveId === rev.id ? styles.revolveIconActive : ''}`}
                title="Edit revolve"
                onClick={() => editingRevolveId === rev.id ? applyEditRevolve() : startEditRevolve(rev)}
              >
                ⟳
              </button>
              <button
                className={`${styles.colorSwatch} ${appearanceRevolveId === rev.id ? styles.colorSwatchActive : ''}`}
                style={{ background: revColor }}
                title="Appearance"
                onClick={() => setAppearanceRevolveId(appearanceRevolveId === rev.id ? null : rev.id)}
              />
              <span className={styles.revolveLabel}>
                Revolve {axisLabel(rev.axisType, rev.axisElementId)}
                {rev.angle < 360 && <span className={styles.dirLabel}> {rev.angle}°</span>}
              </span>
              <button
                className={styles.deleteBtn}
                title="Delete revolve"
                onClick={() => { if (editingRevolveId === rev.id) cancelEditRevolve(); deleteRevolve(rev.id) }}
              >
                ✕
              </button>
            </div>

            {appearanceRevolveId === rev.id && (
              <div className={styles.appearanceForm}>
                <div className={styles.appearanceRow}>
                  <span className={styles.appearanceLabel}>Color</span>
                  <input
                    type="color"
                    value={revColor}
                    onChange={(e) => setRevolveAppearance(rev.id, e.target.value, revOpacity)}
                  />
                </div>
                <div className={styles.appearanceRow}>
                  <span className={styles.appearanceLabel}>Opacity</span>
                  <input
                    type="range" min={0} max={100}
                    value={Math.round(revOpacity * 100)}
                    className={styles.opacitySlider}
                    onChange={(e) => setRevolveAppearance(rev.id, revColor, Number(e.target.value) / 100)}
                  />
                  <span className={styles.opacityValue}>{Math.round(revOpacity * 100)}%</span>
                </div>
              </div>
            )}

            {editingRevolveId === rev.id && (
              <div className={styles.editExtrudeForm}>
                <div className={styles.axisRow}>
                  <span className={styles.axisLabel}>Axis:</span>
                  {(['x', 'y', 'z'] as RevolveAxis[]).map((a) => (
                    <button
                      key={a}
                      className={`${styles.axisBtn} ${eRevolveAxis === a ? styles.axisBtnActive : ''}`}
                      onClick={() => { setERevolveAxis(a); setERevolveLineId(null) }}
                    >
                      {a.toUpperCase()}
                    </button>
                  ))}
                  <button
                    className={`${styles.axisBtn} ${ePickingAxis ? styles.axisBtnPicking : eRevolveAxis === 'element' ? styles.axisBtnActive : ''}`}
                    onClick={() => { selectElement(null); setEPickingAxis(true) }}
                    title="Click a line in the viewport"
                  >
                    {eRevolveAxis === 'element' && eRevolveLineId ? '✓ line' : 'line…'}
                  </button>
                </div>
                {ePickingAxis && (
                  <div className={styles.pickAxisHint}>Click a line in the viewport</div>
                )}
                <div className={styles.extrudeFormRow}>
                  <span className={styles.axisLabel}>Angle:</span>
                  <input
                    type="number"
                    className={styles.depthInput}
                    value={eRevolveAngle}
                    min={1} max={360} step={15}
                    onChange={(e) => setERevolveAngle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyEditRevolve()}
                  />
                  <span className={styles.unit}>°</span>
                </div>
                <div className={styles.editActions}>
                  <button className={styles.applyBtn} onClick={applyEditRevolve}>✓ Apply</button>
                  <button className={styles.cancelEditBtn} onClick={cancelEditRevolve}>✗ Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Loft rows ── */}
      {existingLofts.map((loft) => (
        <div key={loft.id} className={styles.sketchGroup}>
          <div className={styles.revolveRow}>
            <button className={styles.revolveIconBtn} title="Loft feature">⇅</button>
            <span className={styles.revolveLabel}>
              Loft {sketchLabelById(loft.sketchId1)} → {sketchLabelById(loft.sketchId2)}
              <span className={styles.dirLabel}> [{loft.operation}]</span>
            </span>
            <button
              className={styles.deleteBtn}
              title="Delete loft"
              onClick={() => deleteLoft(loft.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* ── Sweep rows ── */}
      {existingSweeps.map((sw) => (
        <div key={sw.id} className={styles.sketchGroup}>
          <div className={styles.revolveRow}>
            <button className={styles.revolveIconBtn} title="Sweep feature">↝</button>
            <span className={styles.revolveLabel}>
              Sweep profile {sketchLabelById(sw.profileSketchId)} along {sketchLabelById(sw.pathSketchId)}
              <span className={styles.dirLabel}> [{sw.operation}]</span>
            </span>
            <button
              className={styles.deleteBtn}
              title="Delete sweep"
              onClick={() => deleteSweep(sw.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* ── Shell rows ── */}
      {existingShells.map((sh) => (
        <div key={sh.id} className={styles.sketchGroup}>
          <div className={styles.revolveRow}>
            <button className={styles.revolveIconBtn} title="Shell feature">◍</button>
            <span className={styles.revolveLabel}>
              Shell {sketchLabelById(sh.sketchId)}
              <span className={styles.dirLabel}> {+(sh.thickness * SCENE_TO_MM).toFixed(2)} mm</span>
              <span className={styles.dirLabel}> (pending mesh)</span>
            </span>
            <button
              className={styles.deleteBtn}
              title="Delete shell"
              onClick={() => deleteShell(sh.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* ── Extrude create form ── */}
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

      {/* ── Revolve create form ── */}
      {showRevolve && canExtrude && (
        <div className={styles.revolveForm}>
          <div className={styles.axisRow}>
            <span className={styles.axisLabel}>Axis:</span>
            {(['x', 'y', 'z'] as RevolveAxis[]).map((a) => (
              <button
                key={a}
                className={`${styles.axisBtn} ${revolveAxis === a ? styles.axisBtnActive : ''}`}
                onClick={() => { setRevolveAxis(a); setRevolveLineId(null); setPickingAxis(false) }}
              >
                {a.toUpperCase()}
              </button>
            ))}
            <button
              className={`${styles.axisBtn} ${pickingAxis ? styles.axisBtnPicking : revolveAxis === 'element' ? styles.axisBtnActive : ''}`}
              onClick={() => { selectElement(null); setPickingAxis(true) }}
              title="Click a sketch line in the viewport to use as axis"
            >
              {revolveAxis === 'element' && revolveLineId ? '✓ line' : 'line…'}
            </button>
          </div>
          {pickingAxis && (
            <div className={styles.pickAxisHint}>Click a line in the viewport</div>
          )}
          <div className={styles.extrudeFormRow}>
            <span className={styles.axisLabel}>Angle:</span>
            <input
              type="number"
              className={styles.depthInput}
              value={revolveAngle}
              min={1} max={360} step={15}
              onChange={(e) => setRevolveAngle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRevolve()}
            />
            <span className={styles.unit}>°</span>
          </div>
          <button
            className={styles.revolveBtn}
            onClick={handleRevolve}
            disabled={revolveAxis === 'element' && !revolveLineId}
          >
            Revolve ▶
          </button>
        </div>
      )}

      {showRevolve && !canExtrude && (
        <div className={styles.noProfile}>
          No closed profile — draw a rect, circle, or closed lines
        </div>
      )}

      {/* ── Loft create form ── */}
      {showLoft && (
        <div className={styles.revolveForm}>
          <div className={styles.extrudeFormRow}>
            <select
              className={styles.opSelect}
              value={loftOperation}
              onChange={(e) => setLoftOperation(e.target.value as 'add' | 'cut')}
            >
              <option value="add">Add</option>
              <option value="cut">Cut</option>
            </select>
            <select
              className={styles.opSelect}
              value={loftTargetSketchId}
              onChange={(e) => setLoftTargetSketchId(e.target.value)}
            >
              <option value="">Target sketch…</option>
              {otherSketches.map((s) => (
                <option key={s.id} value={s.id}>{sketchLabelById(s.id)}</option>
              ))}
            </select>
          </div>
          <button className={styles.revolveBtn} onClick={handleLoft} disabled={!loftTargetSketchId || otherSketches.length === 0}>
            Loft ▶
          </button>
        </div>
      )}

      {/* ── Sweep create form ── */}
      {showSweep && (
        <div className={styles.revolveForm}>
          <div className={styles.extrudeFormRow}>
            <select
              className={styles.opSelect}
              value={sweepOperation}
              onChange={(e) => setSweepOperation(e.target.value as 'add' | 'cut')}
            >
              <option value="add">Add</option>
              <option value="cut">Cut</option>
            </select>
            <select
              className={styles.opSelect}
              value={sweepPathSketchId}
              onChange={(e) => setSweepPathSketchId(e.target.value)}
            >
              <option value="">Path sketch…</option>
              {otherSketches.map((s) => (
                <option key={s.id} value={s.id}>{sketchLabelById(s.id)}</option>
              ))}
            </select>
          </div>
          <button className={styles.revolveBtn} onClick={handleSweep} disabled={!sweepPathSketchId || otherSketches.length === 0}>
            Sweep ▶
          </button>
        </div>
      )}

      {/* ── Shell create form ── */}
      {showShell && (
        <div className={styles.revolveForm}>
          <div className={styles.extrudeFormRow}>
            <span className={styles.axisLabel}>Thickness:</span>
            <input
              type="number"
              className={styles.depthInput}
              value={shellThickness}
              min={0.1}
              step={0.1}
              onChange={(e) => setShellThickness(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleShell()}
            />
            <span className={styles.unit}>mm</span>
          </div>
          <button className={styles.revolveBtn} onClick={handleShell}>
            Shell ▶
          </button>
        </div>
      )}
    </div>
  )
}

function NewSketchRow() {
  const { mode, newSketchArmed, armNewSketch, cancelNewSketch, startNewSketch, setPreviewPlane } = useModelStore(useShallow((state) => ({
    mode: state.mode, newSketchArmed: state.newSketchArmed,
    armNewSketch: state.armNewSketch, cancelNewSketch: state.cancelNewSketch,
    startNewSketch: state.startNewSketch, setPreviewPlane: state.setPreviewPlane,
  })))
  const [planeMode, setPlaneMode] = useState<'preset' | 'custom'>('preset')
  const [plane, setPlane] = useState<PlaneId>('XY')
  const [offsetMm, setOffsetMm] = useState('0')
  const [rotXDeg, setRotXDeg] = useState('0')
  const [rotYDeg, setRotYDeg] = useState('0')
  const [rotZDeg, setRotZDeg] = useState('0')

  const parseFinite = (v: string) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }

  const previewPlanePose = useMemo<SketchPlanePose | null>(() => {
    const offsetVal = parseFinite(offsetMm)
    if (offsetVal === null) return null
    const offset = offsetVal / SCENE_TO_MM

    if (planeMode === 'preset') {
      return presetPlanePose(plane, offset)
    }

    const rx = parseFinite(rotXDeg)
    const ry = parseFinite(rotYDeg)
    const rz = parseFinite(rotZDeg)
    if (rx === null || ry === null || rz === null) return null

    return {
      rotation: [rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180],
      offset,
    }
  }, [planeMode, plane, offsetMm, rotXDeg, rotYDeg, rotZDeg])

  useEffect(() => {
    if (!newSketchArmed) {
      setPreviewPlane(null)
      return
    }
    setPreviewPlane(previewPlanePose)
  }, [newSketchArmed, previewPlanePose, setPreviewPlane])

  const startSketch = () => {
    const offsetVal = parseFinite(offsetMm)
    if (offsetVal === null) return
    const offset = offsetVal / SCENE_TO_MM

    if (planeMode === 'preset') {
      startNewSketch(plane, offset)
      return
    }

    const rx = parseFinite(rotXDeg)
    const ry = parseFinite(rotYDeg)
    const rz = parseFinite(rotZDeg)
    if (rx === null || ry === null || rz === null) return

    startNewSketch({
      rotation: [rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180],
      offset,
    })
  }

  const hasInvalidPreset = parseFinite(offsetMm) === null
  const hasInvalidCustom = hasInvalidPreset
    || parseFinite(rotXDeg) === null
    || parseFinite(rotYDeg) === null
    || parseFinite(rotZDeg) === null
  const cannotStart = mode === 'sketch' || (planeMode === 'preset' ? hasInvalidPreset : hasInvalidCustom)

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
          className={styles.planeModeSelect}
          value={planeMode}
          disabled={mode === 'sketch'}
          onChange={(e) => setPlaneMode(e.target.value as 'preset' | 'custom')}
          title="Plane input mode"
        >
          <option value="preset">Preset</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className={styles.newSketchRow}>
        <select
          className={styles.planeSelect}
          value={plane}
          disabled={mode === 'sketch' || planeMode === 'custom'}
          onChange={(e) => setPlane(e.target.value as PlaneId)}
          title="Preset sketch plane"
        >
          <option value="XY">XY</option>
          <option value="XZ">XZ</option>
          <option value="YZ">YZ</option>
        </select>
        <input
          type="number"
          className={styles.planeInput}
          value={offsetMm}
          step="1"
          disabled={mode === 'sketch'}
          onChange={(e) => setOffsetMm(e.target.value)}
          title="Plane offset in mm"
          aria-label="Plane offset in mm"
        />
        <span className={styles.unit}>mm</span>
      </div>

      {planeMode === 'custom' && (
        <div className={styles.newSketchColumns}>
          <div className={styles.newSketchRow}>
            <span className={styles.axisLabel}>Rx</span>
            <input
              type="number"
              className={styles.planeInput}
              value={rotXDeg}
              step="5"
              disabled={mode === 'sketch'}
              onChange={(e) => setRotXDeg(e.target.value)}
              title="Rotation around X in degrees"
              aria-label="Rotation around X in degrees"
            />
            <span className={styles.unit}>deg</span>
          </div>
          <div className={styles.newSketchRow}>
            <span className={styles.axisLabel}>Ry</span>
            <input
              type="number"
              className={styles.planeInput}
              value={rotYDeg}
              step="5"
              disabled={mode === 'sketch'}
              onChange={(e) => setRotYDeg(e.target.value)}
              title="Rotation around Y in degrees"
              aria-label="Rotation around Y in degrees"
            />
            <span className={styles.unit}>deg</span>
          </div>
          <div className={styles.newSketchRow}>
            <span className={styles.axisLabel}>Rz</span>
            <input
              type="number"
              className={styles.planeInput}
              value={rotZDeg}
              step="5"
              disabled={mode === 'sketch'}
              onChange={(e) => setRotZDeg(e.target.value)}
              title="Rotation around Z in degrees"
              aria-label="Rotation around Z in degrees"
            />
            <span className={styles.unit}>deg</span>
          </div>
        </div>
      )}

      <div className={styles.newSketchRow}>
        <button
          className={styles.newSketchBtn}
          onClick={startSketch}
          disabled={cannotStart}
          title="Start sketch on selected plane settings"
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
  const sketches = useModelStore((state) => state.sketches)

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
