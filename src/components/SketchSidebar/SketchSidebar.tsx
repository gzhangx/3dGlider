import { useModelStore, SketchTool } from '../../store/modelStore'
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
  const { mode, activeTool, constructionMode, setActiveTool, setConstructionMode } = useModelStore()

  if (mode !== 'sketch') return null

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

      <div className={styles.hint}>
        {activeTool === 'select' && 'Right-drag to pan · Scroll to zoom'}
        {activeTool !== 'select' && !constructionMode && 'Click 1st point · Click 2nd point · Esc cancel'}
        {activeTool !== 'select' && constructionMode && 'Drawing construction geometry'}
      </div>
    </aside>
  )
}
