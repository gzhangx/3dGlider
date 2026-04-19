import { useEffect } from 'react'
import { Viewport3D } from './components/Viewport3D/Viewport3D'
import { Toolbar } from './components/Toolbar/Toolbar'
import { SketchSidebar } from './components/SketchSidebar/SketchSidebar'
import { useModelStore, SketchTool } from './store/modelStore'
import styles from './App.module.css'

const KEY_TOOL: Record<string, SketchTool> = {
  s: 'select', l: 'line', r: 'rect', c: 'circle',
}

export default function App() {
  const { mode, setActiveTool } = useModelStore()

  // Keyboard shortcuts for sketch tools
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'sketch') return
      const tool = KEY_TOOL[e.key.toLowerCase()]
      if (tool) setActiveTool(tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setActiveTool])

  return (
    <div className={styles.app}>
      <Toolbar />
      <div className={styles.main}>
        <SketchSidebar />
        <div className={styles.canvas}>
          <Viewport3D />
        </div>
      </div>
    </div>
  )
}
