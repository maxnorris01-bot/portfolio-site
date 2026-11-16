// The edit list is the state (docs/ui-editor-gate-rules.md, brief: "the edit list is the state"): Undo pops the last edit, Redo puts it back,
// Reset clears the list. The preview and the export are always recomputed by replaying the ordered list on the ORIGINAL source, so the same
// list gives the same code. Pure, so it runs under node (tests/uieditorstate.test.ts).
import type { Edit } from './vendor/engine.js'

export interface EditList {
  edits: Edit[]
  /** Undone edits, the most recently undone last. */
  redo: Edit[]
}

export const emptyList = (): EditList => ({ edits: [], redo: [] })

export type ListAction = { type: 'apply'; edit: Edit } | { type: 'undo' } | { type: 'redo' } | { type: 'reset' }

export const canUndo = (s: EditList) => s.edits.length > 0
export const canRedo = (s: EditList) => s.redo.length > 0

type Offset = Extract<Edit, { op: 'offset' }>

const sameScope = (a: Offset, b: Offset) => a.target === b.target && (a.environment ?? 'desktop') === (b.environment ?? 'desktop') && (a.link ?? true) === (b.link ?? true)

/**
 * Two moves of the same element in a row (a drag after a drag, or a run of arrow-key nudges) are one move: the engine composes each
 * offset as another translate, so repeating them would pile up `translate(1px, 0) translate(1px, 0) ...` in the visitor's code. The
 * pair becomes one edit (the sum); a pair that cancels out leaves no edit at all.
 */
export function mergeOffsets(last: Edit | undefined, next: Edit): Edit | null | undefined {
  if (!last || last.op !== 'offset' || next.op !== 'offset' || !sameScope(last, next)) return undefined
  const dx = last.dx + next.dx, dy = last.dy + next.dy
  return dx === 0 && dy === 0 ? null : { ...next, dx, dy }
}

export function listReduce(s: EditList, a: ListAction): EditList {
  switch (a.type) {
    case 'apply': {
      const merged = mergeOffsets(s.edits[s.edits.length - 1], a.edit)
      if (merged === undefined) return { edits: [...s.edits, a.edit], redo: [] }
      return { edits: merged === null ? s.edits.slice(0, -1) : [...s.edits.slice(0, -1), merged], redo: [] }
    }
    case 'undo':
      return s.edits.length ? { edits: s.edits.slice(0, -1), redo: [...s.redo, s.edits[s.edits.length - 1]] } : s
    case 'redo':
      return s.redo.length ? { edits: [...s.edits, s.redo[s.redo.length - 1]], redo: s.redo.slice(0, -1) } : s
    case 'reset':
      return emptyList()
  }
}
