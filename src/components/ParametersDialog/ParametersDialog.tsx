import { useState } from 'react'
import { useModelStore } from '../../store/modelStore'
import styles from './ParametersDialog.module.css'

export function ParametersDialog({ onClose }: { onClose: () => void }) {
  const { parameters, addParameter, updateParameter, deleteParameter } = useModelStore()

  // Local editable state mirrors the store so edits are batched on blur
  const [drafts, setDrafts] = useState<Record<string, { name: string; value: string }>>({})

  const getDraft = (id: string, name: string, value: number) =>
    drafts[id] ?? { name, value: value.toString() }

  const setDraftName = (id: string, name: string, curValue: number) =>
    setDrafts((d) => ({ ...d, [id]: { ...getDraft(id, name, curValue), name } }))

  const setDraftValue = (id: string, curName: string, value: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...getDraft(id, curName, 0), value } }))

  const commitDraft = (id: string, origName: string, origValue: number) => {
    const d = drafts[id]
    if (!d) return
    const parsed = parseFloat(d.value)
    const name = d.name.trim() || origName
    const value = Number.isFinite(parsed) ? parsed : origValue
    updateParameter(id, name, value)
    setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next })
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Parameters</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Value</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((p) => {
                const d = getDraft(p.id, p.name, p.value)
                return (
                  <tr key={p.id} className={styles.tr}>
                    <td className={styles.td}>
                      <input
                        className={styles.nameInput}
                        value={d.name}
                        onChange={(e) => setDraftName(p.id, e.target.value, p.value)}
                        onBlur={() => commitDraft(p.id, p.name, p.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitDraft(p.id, p.name, p.value)}
                        placeholder="paramName"
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        className={styles.valueInput}
                        value={d.value}
                        onChange={(e) => setDraftValue(p.id, p.name, e.target.value)}
                        onBlur={() => commitDraft(p.id, p.name, p.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitDraft(p.id, p.name, p.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className={styles.tdAction}>
                      <button className={styles.deleteBtn} onClick={() => deleteParameter(p.id)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {parameters.length === 0 && (
            <div className={styles.empty}>No parameters yet. Click + Add to create one.</div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.addBtn} onClick={() => addParameter('param' + (parameters.length + 1), 0)}>
            + Add
          </button>
          <span className={styles.hint}>Use <code>=name</code> in depth / angle fields</span>
        </div>
      </div>
    </div>
  )
}
