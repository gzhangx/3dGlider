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
]

export function SketchSidebar() {
  const { mode, activeTool, setActiveTool } = useModelStore()

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
      <div className={styles.hint}>
        {activeTool === 'select' && 'Right-drag to pan · Scroll to zoom'}
        {activeTool !== 'select' && 'Click 1st point · Click 2nd point · Esc cancel'}
      </div>
    </aside>
  )
}
