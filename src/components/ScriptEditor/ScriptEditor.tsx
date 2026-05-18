import { useState } from 'react'
import { useModelStore } from '../../store/modelStore'
import { createScriptingAPI } from '../../lib/scriptingAPI'
import styles from './ScriptEditor.module.css'

interface ScriptEditorProps {
  onClose: () => void
}

const EXAMPLE_SCRIPT = `// Example: Create a simple box
// Start a new sketch on the XY plane
await api.startSketch('XY');

// Add a rectangle
await api.addRect(-1, -1, 1, 1);

// Exit the sketch and save it
await api.exitSketch();

// Extrude the sketch to create a 3D box
await api.addExtrude('last', 2);

// Done! You now have a box.
`

export function ScriptEditor({ onClose }: ScriptEditorProps) {
  const store = useModelStore()
  const [code, setCode] = useState(EXAMPLE_SCRIPT)
  const [output, setOutput] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    setIsRunning(true)
    setOutput([])
    setError(null)

    try {
      const api = createScriptingAPI(store)
      const logs: string[] = []

      // Create a custom console for capturing logs
      const customConsole = {
        log: (...args: any[]) => logs.push(args.map((a) => String(a)).join(' ')),
        error: (...args: any[]) => logs.push('ERROR: ' + args.map((a) => String(a)).join(' ')),
        warn: (...args: any[]) => logs.push('WARN: ' + args.map((a) => String(a)).join(' ')),
        info: (...args: any[]) => logs.push('INFO: ' + args.map((a) => String(a)).join(' ')),
      }

      // Wrap user code in an async function so await works
      const wrappedCode = `(async function() { ${code} })()`
      const execFn = new Function('api', 'console', `return ${wrappedCode}`)
      await execFn(api, customConsole)

      setOutput([...logs, 'Script executed successfully!'])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
      setOutput([errMsg])
    } finally {
      setIsRunning(false)
    }
  }

  const handleLoadExample = () => {
    setCode(EXAMPLE_SCRIPT)
    setOutput([])
    setError(null)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Script Editor</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          <div className={styles.editorSection}>
            <div className={styles.editorHeader}>
              <label>JavaScript Code</label>
              <button className={styles.exampleBtn} onClick={handleLoadExample}>
                Load Example
              </button>
            </div>
            <textarea
              className={styles.editor}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Write your script here..."
              spellCheck="false"
            />
          </div>

          <div className={styles.outputSection}>
            <div className={styles.outputHeader}>Output</div>
            <div className={styles.output}>
              {error && <div className={styles.errorLine}>{error}</div>}
              {output.map((line, i) => (
                <div key={i} className={line.startsWith('ERROR:') ? styles.errorLine : line.startsWith('WARN:') ? styles.warnLine : styles.outputLine}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.runBtn} onClick={handleRun} disabled={isRunning}>
            {isRunning ? 'Running...' : 'Run Script'}
          </button>
          <button className={styles.closeFooterBtn} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.helpSection}>
          <details>
            <summary>API Reference</summary>
            <div className={styles.apiDocs}>
              <h4>Sketch Operations</h4>
              <code>await api.startSketch('XY' | 'XZ' | 'YZ')</code>
              <code>await api.addLine(x1, y1, x2, y2)</code>
              <code>await api.addRect(x1, y1, x2, y2)</code>
              <code>await api.addCircle(x, y, radius)</code>
              <code>await api.exitSketch()</code>
              <code>await api.editSketch(sketchName)</code>

              <h4>Constraints</h4>
              <code>await api.addConstraint(&#123; type: 'length', elementId, value &#125;)</code>
              <code>await api.addConstraint(&#123; type: 'horizontal', elementId &#125;)</code>
              <code>await api.addConstraint(&#123; type: 'vertical', elementId &#125;)</code>
              <code>await api.addConstraint(&#123; type: 'parallel', elementId1, elementId2 &#125;)</code>

              <h4>3D Features</h4>
              <code>await api.addExtrude('last', depth)</code>
              <code>await api.addRevolve('last', 'z', 360)</code>
              <code>await api.addLoft(sketch1, sketch2)</code>
              <code>await api.addSweep(profileSketch, pathSketch)</code>

              <h4>Parameters</h4>
              <code>await api.addParameter(name, value)</code>
              <code>await api.updateParameter(name, newValue)</code>

              <h4>Utilities</h4>
              <code>api.getSketches()</code>
              <code>api.getParameters()</code>
              <code>await api.setSketchColor(sketchName, '#ff0000')</code>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
