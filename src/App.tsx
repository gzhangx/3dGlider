import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Viewport3D } from './components/Viewport3D/Viewport3D'
import { Toolbar } from './components/Toolbar/Toolbar'
import { SketchSidebar } from './components/SketchSidebar/SketchSidebar'
import { SketchNavigator } from './components/SketchNavigator/SketchNavigator'
import { FeatureTree } from './components/FeatureTree/FeatureTree'
import { useModelStore, SketchTool } from './store/modelStore'
import styles from './App.module.css'

const KEY_TOOL: Record<string, SketchTool> = {
  s: 'select', l: 'line', r: 'rect', c: 'circle', x: 'cut',
}

export default function App() {
  const { mode, showSketchNavigator, setActiveTool } = useModelStore(useShallow((state) => ({
    mode: state.mode,
    showSketchNavigator: state.showSketchNavigator,
    setActiveTool: state.setActiveTool,
  })))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'sketch') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
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
        {showSketchNavigator && <SketchNavigator />}
        <div className={styles.canvas}>
          <Viewport3D />
        </div>
        <FeatureTree />
      </div>
    </div>
  )
}
