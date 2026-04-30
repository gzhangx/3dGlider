import { Parameter } from '../store/modelStore'

/**
 * Resolve a numeric input string.
 * If it starts with '=', look up the parameter name (case-insensitive).
 * Otherwise parse as a plain float.
 * Returns null if the value cannot be resolved.
 */
export function resolveParam(input: string, params: Parameter[]): number | null {
  const s = input.trim()
  if (s.startsWith('=')) {
    const name = s.slice(1).trim().toLowerCase()
    const found = params.find((p) => p.name.toLowerCase() === name)
    return found ? found.value : null
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
